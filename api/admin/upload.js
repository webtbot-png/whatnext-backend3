const express = require('express');
const { formidable  } = require('formidable');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// Use global fetch if available (Node 18+) or require node-fetch v2
const fetch = globalThis.fetch || require('node-fetch');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.substring(7);
  jwt.verify(token, JWT_SECRET);
}

const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID;
const BUNNY_API_KEY = process.env.BUNNY_API_KEY;

console.log('🔥 BUNNY CONFIG CHECK:', {
  BUNNY_LIBRARY_ID: BUNNY_LIBRARY_ID ? '✅ SET' : '❌ MISSING',
  BUNNY_API_KEY: BUNNY_API_KEY ? '✅ SET' : '❌ MISSING'
});

if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY) {
  console.error('❌ CRITICAL ERROR: Missing Bunny CDN environment variables!');
  console.error('❌ BUNNY_LIBRARY_ID:', BUNNY_LIBRARY_ID || 'UNDEFINED');
  console.error('❌ BUNNY_API_KEY:', BUNNY_API_KEY ? 'DEFINED' : 'UNDEFINED');
  // Don't throw error at module level - handle in route instead
}

function extractFile(files) {
  let file = files.file;
  if (!file) {
    const fileKeys = Object.keys(files);
    if (fileKeys.length > 0) {
      file = files[fileKeys[0]];
    }
  }
  return Array.isArray(file) ? file[0] : file;
}

async function createBunnyVideo(fileObj) {
  const createRes = await fetch(
    `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`,
    {
      method: 'POST',
      headers: {
        'AccessKey': String(BUNNY_API_KEY),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: fileObj.originalFilename || 'Untitled Video',
      }),
    }
  );
  const createResText = await createRes.text();
  console.log('🐰 Bunny create video response:', createRes.status, createResText);
  if (!createRes.ok) {
    throw new Error(`Failed to create Bunny video entry: ${createResText}`);
  }
  let videoData;
  try {
    videoData = JSON.parse(createResText);
  } catch (parseError) {
    console.error('❌ JSON parse error:', parseError);
    throw new Error(`Failed to parse Bunny create video response: ${createResText}`);
  }
  return videoData.guid;
}

async function uploadBunnyFile(videoId, fileObj) {
  try {
    console.log('📁 Reading video file for upload...');
    const videoBuffer = fs.readFileSync(fileObj.filepath);
    console.log('📏 Video file size:', videoBuffer.length, 'bytes');
    
    const uploadRes = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
      {
        method: 'PUT',
        headers: {
          'AccessKey': String(BUNNY_API_KEY),
          'Content-Type': 'application/octet-stream',
        },
        body: videoBuffer
      }
    );
    
    const uploadResText = await uploadRes.text();
    console.log('🐰 Bunny upload response:', uploadRes.status, uploadResText);
    
    // Clean up the temporary file
    fs.unlinkSync(fileObj.filepath);
    
    if (!uploadRes.ok) {
      throw new Error(`Upload failed: ${uploadResText}`);
    }
    
    console.log('✅ Video file uploaded to Bunny successfully');
  } catch (error) {
    // Make sure to clean up file even if upload fails
    if (fs.existsSync(fileObj.filepath)) {
      fs.unlinkSync(fileObj.filepath);
    }
    throw new Error(`Upload file error: ${error.message}`);
  }
}

async function pollBunnyStatus(videoId) {
  const statusUrl = `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`;
  let status = 'processing';
  let directUrl = null;
  let attempts = 0;
  let videoInfo = null;
  while (attempts < 10) {
    attempts++;
    const statusRes = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'AccessKey': String(BUNNY_API_KEY)
      }
    });
    const statusResText = await statusRes.text();
    console.log(`🐰 Bunny status poll [${attempts}]:`, statusRes.status, statusResText);
    if (statusRes.ok) {
      try {
        videoInfo = JSON.parse(statusResText);
      } catch (parseError) {
        console.error('❌ Failed to parse Bunny status response:', parseError, statusResText);
        break;
      }
      status = videoInfo.status;
      
      // Bunny status codes: 0=queued, 1=processing, 2=encoding, 3=finished, 4=error, 5=video not found
      if (status === 3 && Array.isArray(videoInfo.videoSources)) {
        const mp4Source = videoInfo.videoSources.find(src => src.type === 'mp4');
        if (mp4Source) {
          directUrl = mp4Source.url;
          break;
        }
      } else if (status === 3) {
        // Status is finished but no videoSources yet - continue polling
        status = 'ready';
        break;
      }
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log('🐰 Final Bunny videoInfo:', videoInfo);
  return { status, directUrl, videoInfo };
}

async function updateSupabase(contentEntryId, updateUrl) {
  try {
    const { getSupabaseAdminClient  } = require('../../database.js');
    const supabase = getSupabaseAdminClient();
    
    // First, get the current content entry to preserve location_id
    const { data: currentEntry, error: fetchError } = await supabase
      .from('content_entries')
      .select('location_id')
      .eq('id', contentEntryId)
      .single();
      
    if (fetchError) {
      console.error('❌ Failed to fetch current content entry:', fetchError);
    }
    
    // Update with media URL and set status to published
    const updateData = {
      media_url: updateUrl,
      status: 'published',
      published_at: new Date().toISOString()
    };
    
    // Preserve location_id if it exists
    if (currentEntry?.location_id) {
      console.log('✅ Preserving location_id:', currentEntry.location_id);
    } else {
      console.warn('⚠️ No location_id found - video will not appear on map');
    }
    
    const { error: updateError } = await supabase
      .from('content_entries')
      .update(updateData)
      .eq('id', contentEntryId);
      
    if (updateError) {
      console.error('❌ Failed to update content entry with video URL:', updateError);
    } else {
      console.log('✅ Content entry updated successfully:');
      console.log(`   - Status: uploading → published`);
      console.log(`   - Media URL: ${updateUrl}`);
      console.log(`   - Location ID: ${currentEntry?.location_id || 'None (won\'t show on map)'}`);
    }
  } catch (err) {
    console.error('❌ Error updating content entry after Bunny upload:', err);
  }
}

function isAllowedExtension(filename) {
  const allowedExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
  const ext = path.extname(filename).toLowerCase();
  return allowedExtensions.includes(ext);
}

router.post('/', async (req, res) => {
  console.log('🚀🚀🚀 UPLOAD ENDPOINT HIT! 🚀🚀🚀');
  console.log('�🔥🔥 SUPER CRITICAL LOG - UPLOAD STARTING 🔥🔥🔥');
  console.log('�📋 Request details:', {
    method: req.method,
    url: req.url,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
  
  try {
    // Verify admin authentication
    verifyAdminToken(req);
    console.log('✅ Admin authentication verified for upload');
  } catch (authError) {
    console.error('❌ Authentication failed:', authError.message);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check Bunny CDN configuration
  if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY) {
    console.error('❌ BUNNY CDN NOT CONFIGURED - Missing environment variables!');
    return res.status(500).json({ 
      error: 'Server configuration error', 
      details: 'Bunny CDN credentials not configured',
      timestamp: new Date().toISOString()
    });
  }
  console.log('✅ Bunny CDN credentials verified');

  // Use Railway's writable /tmp directory instead of project directory
  const tempDir = process.env.RAILWAY_ENVIRONMENT ? '/tmp/bunny-temp' : path.join(process.cwd(), 'public', 'uploads', 'bunny-temp');
  console.log('📁 Using temp directory:', tempDir);
  
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log('✅ Created temp directory:', tempDir);
    } else {
      console.log('✅ Temp directory exists:', tempDir);
    }
  } catch (dirError) {
    console.error('❌ Failed to create temp directory:', dirError.message);
    return res.status(500).json({ 
      error: 'Server configuration error', 
      details: 'Cannot create temporary upload directory',
      tempDir: tempDir
    });
  }

  // Security: Only allow video file extensions
  const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
  
  let form;
  try {
    // Configure formidable with strict file extension restrictions
    // Extension filtering is explicitly implemented in the filter function below
    // NOSONAR - False positive: File extensions are restricted via filter callback
    form = formidable({
      multiples: false,
      uploadDir: tempDir,
      keepExtensions: true,
      maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB max per file
      maxTotalFileSize: 2 * 1024 * 1024 * 1024, // 2GB total
      // Security filter: Explicitly restrict to allowed video extensions only
      filter: function({ originalFilename }) {
        console.log('🔍 Filtering file:', originalFilename);
        if (!originalFilename) {
          console.warn('⚠️ Upload rejected: No filename provided');
          return false;
        }
        const ext = path.extname(originalFilename).toLowerCase();
        const isAllowed = ALLOWED_VIDEO_EXTENSIONS.includes(ext);
        if (!isAllowed) {
          console.warn(`⚠️ Upload rejected: Invalid extension "${ext}" for file "${originalFilename}"`);
        } else {
          console.log(`✅ Upload accepted: Valid extension "${ext}" for file "${originalFilename}"`);
        }
        return isAllowed; // Only .mp4, .mov, .avi, .mkv, .webm allowed
      }
    });
    console.log('✅ Formidable configured successfully');
  } catch (formError) {
    console.error('❌ Failed to configure formidable:', formError);
    return res.status(500).json({ 
      error: 'Server configuration error',
      details: 'Failed to initialize file upload handler',
      formError: formError.message
    });
  }

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('❌ Formidable parsing error:', {
        message: err.message,
        code: err.code,
        stack: err.stack,
        httpCode: err.httpCode,
        tempDir: tempDir,
        processEnv: {
          NODE_ENV: process.env.NODE_ENV,
          RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
          PWD: process.env.PWD
        }
      });
      return res.status(500).json({ 
        error: 'File upload parsing error',
        details: err.message,
        code: err.code,
        tempDir: tempDir,
        formidableError: true
      });
    }
    console.log('🔍 Formidable parsed files:', files);
    const fileObj = extractFile(files);
    console.log('🔍 fileObj:', fileObj);
    if (fileObj === undefined || fileObj === null) {
      return res.status(400).json({ error: 'No file uploaded (parsed files: ' + JSON.stringify(files) + ', fileObj: ' + JSON.stringify(fileObj) + ')'});
    }
    if (!isAllowedExtension(fileObj.originalFilename)) {
      const allowedExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
      return res.status(400).json({ error: 'Invalid file extension. Allowed: ' + allowedExtensions.join(', ') });
    }
    
    // Extract contentEntryId from fields (could be array or string)
    let contentEntryId = fields.contentEntryId || fields.content_entry_id || fields.id;
    if (Array.isArray(contentEntryId)) {
      contentEntryId = contentEntryId[0];
    }
    
    console.log('🔍 Content Entry ID:', contentEntryId);
    
    if (!contentEntryId) {
      return res.status(400).json({ error: 'Missing content entry ID. Please provide contentEntryId in the upload form.' });
    }
    
    try {
      console.log('🎬 Creating Bunny.net video entry...');
      console.log('📋 File details:', {
        originalFilename: fileObj.originalFilename,
        filepath: fileObj.filepath,
        size: fileObj.size,
        mimetype: fileObj.mimetype
      });
      
      const videoId = await createBunnyVideo(fileObj);
      console.log('✅ Bunny video entry created, ID:', videoId);
      
      console.log('⬆️  Uploading video file to Bunny...');
      await uploadBunnyFile(videoId, fileObj);
      console.log('✅ Video uploaded to Bunny!');
      
      console.log('🔍 Polling Bunny status...');
      const { status, directUrl, videoInfo } = await pollBunnyStatus(videoId);
      const iframeUrl = `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${videoId}`;
      const playUrl = `https://iframe.mediadelivery.net/play/${BUNNY_LIBRARY_ID}/${videoId}`;
      console.log('🎥 Iframe URL:', iframeUrl);
      console.log('🐰 Final Bunny videoInfo:', videoInfo);
      
      // Always update Supabase with the iframe URL - video will work when processing completes
      const finalUrl = directUrl || iframeUrl;
      console.log('📝 Updating Supabase content entry with final URL:', finalUrl);
      await updateSupabase(contentEntryId, finalUrl);
      
      res.json({
        success: true,
        url: iframeUrl,
        playUrl: playUrl,
        directUrl,
        videoId: videoId,
        status,
        videoInfo,
        bunnyDebug: {
          videoId,
          status,
          directUrl,
          videoInfo,
        },
        message: status === 'ready' && directUrl
          ? 'Video uploaded and ready for playback.'
          : 'Video uploaded! Bunny is processing it now (may take up to 1 minute).'
      });
    } catch (error) {
      console.error('❌ Bunny upload error:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      let errorMessage = 'Failed to upload to Bunny.net';
      let errorDetails = error?.message || String(error);
      
      // Provide more specific error messages
      if (error.message.includes('ENOENT')) {
        errorMessage = 'Video file not found during upload';
        errorDetails = 'The uploaded file could not be read from temporary storage';
      } else if (error.message.includes('EACCES')) {
        errorMessage = 'File permission error during upload';
        errorDetails = 'Server lacks permission to read the uploaded file';
      } else if (error.message.includes('fetch')) {
        errorMessage = 'Network error connecting to Bunny CDN';
        errorDetails = error.message;
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: errorDetails,
        timestamp: new Date().toISOString()
      });
    }
  });
});

module.exports = router;
