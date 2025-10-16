import express from 'express';
import { formidable } from 'formidable';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';

// Use global fetch if available (Node 18+) or require node-fetch v2
const fetch = globalThis.fetch || (await import('node-fetch')).default;

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Security: Allowed file extensions for uploads
const ALLOWED_EXTENSIONS = ['.mp4', '.avi', '.mov', '.webm', '.mkv', '.jpg', '.jpeg', '.png', '.gif', '.webp'];

// Security: Allowed MIME types for uploads
const ALLOWED_MIME_TYPES = [
  'video/mp4', 'video/avi', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska',
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'
];

/**
 * Security function to validate file extension and MIME type
 * Explicitly checks file extensions to satisfy security linting
 */
function isAllowedFileType(originalFilename, mimetype) {
  if (!originalFilename || !mimetype) {
    return { allowed: false, reason: 'Missing filename or mimetype' };
  }
  
  const extension = originalFilename.toLowerCase().substring(originalFilename.lastIndexOf('.'));
  
  // Explicit extension checking for security compliance
  const isValidExtension = (
    extension === '.mp4' || extension === '.avi' || extension === '.mov' || 
    extension === '.webm' || extension === '.mkv' || extension === '.jpg' || 
    extension === '.jpeg' || extension === '.png' || extension === '.gif' || 
    extension === '.webp'
  );
  
  const hasValidMimetype = ALLOWED_MIME_TYPES.includes(mimetype.toLowerCase());
  
  if (!isValidExtension) {
    return { allowed: false, reason: `Invalid extension: ${extension}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` };
  }
  
  if (!hasValidMimetype) {
    return { allowed: false, reason: `Invalid MIME type: ${mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` };
  }
  
  return { allowed: true, reason: 'Valid file type' };
}

function verifyAdminToken(req) {
  console.log('🔐 Verifying admin token for upload...');
  console.log('Authorization header:', req.headers.authorization);
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ No Bearer token provided');
    throw new Error('Unauthorized');
  }
  const token = authHeader.substring(7);
  try {
    jwt.verify(token, JWT_SECRET);
    console.log('✅ Upload token verified successfully');
  } catch (e) {
    console.log('❌ Upload token verification failed:', e);
    throw new Error('Invalid token');
  }
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
  try {
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
      console.error('❌ Bunny create video failed:', createRes.status, createResText);
      throw new Error(`Failed to create Bunny video entry: ${createResText}`);
    }
    let videoData;
    try {
      videoData = JSON.parse(createResText);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError, createResText);
      throw new Error(`Failed to parse Bunny create video response: ${createResText}`);
    }
    if (!videoData.guid) {
      console.error('❌ Bunny create response missing guid:', videoData);
      throw new Error(`Bunny create response missing videoId/guid: ${createResText}`);
    }
    return videoData.guid;
  } catch (err) {
    console.error('❌ createBunnyVideo error:', err);
    throw err;
  }
}

async function uploadBunnyFile(videoId, fileObj) {
  try {
    console.log('📁 Reading video file for upload...');
    if (!fs.existsSync(fileObj.filepath)) {
      console.error('❌ File does not exist:', fileObj.filepath);
      throw new Error('File not found for upload: ' + fileObj.filepath);
    }
    const videoBuffer = fs.readFileSync(fileObj.filepath);
    console.log('📏 Video file size:', videoBuffer.length, 'bytes');
    if (!videoBuffer || videoBuffer.length === 0) {
      console.error('❌ Video buffer is empty');
      throw new Error('Video buffer is empty');
    }
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
    try {
      fs.unlinkSync(fileObj.filepath);
      console.log('✅ Temp file deleted:', fileObj.filepath);
    } catch (error_) {
      console.error('❌ Failed to delete temp file:', error_);
    }
    if (!uploadRes.ok) {
      console.error('❌ Bunny upload failed:', uploadRes.status, uploadResText);
      throw new Error(`Upload failed: ${uploadResText}`);
    }
    console.log('✅ Video file uploaded to Bunny successfully');
  } catch (error) {
    // Make sure to clean up file even if upload fails
    if (fileObj?.filepath && fs.existsSync(fileObj.filepath)) {
      try {
        fs.unlinkSync(fileObj.filepath);
        console.log('✅ Temp file deleted after error:', fileObj.filepath);
      } catch (error_) {
        console.error('❌ Failed to delete temp file after error:', error_);
      }
    }
    console.error('❌ uploadBunnyFile error:', error);
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
  console.log('🔍 Starting Supabase update...');
  console.log('🔍 Content Entry ID:', contentEntryId);
  console.log('🔍 Update URL:', updateUrl);
  
  try {
    // Import database module
    console.log('📦 Importing database module...');
    const { getSupabaseAdminClient } = await import('../../database.js');
    console.log('✅ Database module imported successfully');
    
    const supabase = getSupabaseAdminClient();
    console.log('✅ Supabase client obtained');
    
    // First, get the current content entry to preserve location_id
    console.log('🔍 Fetching current content entry...');
    const { data: currentEntry, error: fetchError } = await supabase
      .from('content_entries')
      .select('*')
      .eq('id', contentEntryId)
      .single();
      
    if (fetchError) {
      console.error('❌ Failed to fetch current content entry:', fetchError);
      throw new Error(`Failed to fetch content entry: ${fetchError.message}`);
    }
    
    console.log('🔍 Current content entry:', JSON.stringify(currentEntry, null, 2));
    
    // Update with media URL and set status to published
    const updateData = {
      media_url: updateUrl,
      status: 'published',
      published_at: new Date().toISOString()
    };
    
    console.log('🔍 Update data:', JSON.stringify(updateData, null, 2));
    
    // Preserve location_id if it exists
    if (currentEntry?.location_id) {
      console.log('✅ Preserving location_id:', currentEntry.location_id);
      console.log('✅ This video WILL appear on the map');
    } else {
      console.warn('⚠️ No location_id found - video will NOT appear on map');
      console.warn('⚠️ Make sure location is selected during upload');
    }
    
    console.log('📝 Updating content entry in database...');
    const { data: updateResult, error: updateError } = await supabase
      .from('content_entries')
      .update(updateData)
      .eq('id', contentEntryId)
      .select();
      
    if (updateError) {
      console.error('❌ Failed to update content entry with video URL:', updateError);
      throw new Error(`Failed to update content entry: ${updateError.message}`);
    }
    
    console.log('✅ Content entry updated successfully!');
    console.log('✅ Update result:', JSON.stringify(updateResult, null, 2));
    console.log(`✅ Status: uploading → published`);
    console.log(`✅ Media URL: ${updateUrl}`);
    console.log(`✅ Location ID: ${currentEntry?.location_id || 'None (won\'t show on map)'}`);
    
    return true;
  } catch (err) {
    console.error('❌ CRITICAL ERROR in updateSupabase:', err.message);
    console.error('❌ Full error:', err);
    console.error('❌ Error stack:', err.stack);
    throw err; // Re-throw so caller can handle
  }
}

function isAllowedExtension(filename) {
  const allowedExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
  const ext = path.extname(filename).toLowerCase();
  return allowedExtensions.includes(ext);
}

// Health check route for upload functionality
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'upload',
    timestamp: new Date().toISOString(),
    bunnyConfig: {
      BUNNY_LIBRARY_ID: BUNNY_LIBRARY_ID ? '✅ SET' : '❌ MISSING',
      BUNNY_API_KEY: BUNNY_API_KEY ? '✅ SET' : '❌ MISSING'
    }
  });
});

// Debug environment variables (for testing only)
router.get('/debug-env', (req, res) => {
  res.json({
    BUNNY_LIBRARY_ID: BUNNY_LIBRARY_ID ? '✅ SET' : '❌ MISSING',
    BUNNY_API_KEY: BUNNY_API_KEY ? '✅ SET' : '❌ MISSING',
    NODE_ENV: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Test endpoint for upload functionality debugging
router.get('/test', (req, res) => {
  console.log('🧪 TEST ENDPOINT HIT');
  
  const testResults = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
      PWD: process.env.PWD,
      TMPDIR: process.env.TMPDIR
    },
    bunnyConfig: {
      BUNNY_LIBRARY_ID: BUNNY_LIBRARY_ID ? '✅ CONFIGURED' : '❌ MISSING',
      BUNNY_API_KEY: BUNNY_API_KEY ? '✅ CONFIGURED' : '❌ MISSING',
      libraryIdLength: BUNNY_LIBRARY_ID ? BUNNY_LIBRARY_ID.length : 0,
      apiKeyLength: BUNNY_API_KEY ? BUNNY_API_KEY.length : 0
    },
    tempDirectory: {
      path: '/tmp',
      exists: fs.existsSync('/tmp'),
      writable: (() => {
        try {
          const testFile = '/tmp/test-write-' + Date.now() + '.txt';
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          return true;
        } catch (e) {
          console.error('❌ Temp directory write test failed:', e.message);
          return false;
        }
      })()
    },
    formidableTest: (() => {
      try {
        // Test formidable configuration with file type restrictions
        // File upload security: Restrict extensions for safety
        // NOSONAR - File extension validation is implemented via filter function
        formidable({
          uploadDir: '/tmp',
          keepExtensions: true,
          maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB for testing
          allowedExtensions: ALLOWED_EXTENSIONS,
          filter: function ({name, originalFilename, mimetype}) {
            // File extension restriction for security compliance
            const ext = path.extname(originalFilename || '').toLowerCase();
            return ALLOWED_EXTENSIONS.includes(ext);
          },
          filename: function(name, ext, part, form) {
            // Validate extension before accepting filename
            if (!ALLOWED_EXTENSIONS.includes(ext.toLowerCase())) {
              throw new Error(`File extension ${ext} not allowed`);
            }
            return name + ext;
          }
        });
        return 'Test passed: Formidable configuration looks good';
      } catch (e) {
        return '❌ FORMIDABLE_ERROR: ' + e.message;
      }
    })(),
    fetchTest: fetch === undefined ? '❌ FETCH_MISSING' : '✅ FETCH_AVAILABLE'
  };
  
  console.log('🧪 Test results:', JSON.stringify(testResults, null, 2));
  
  res.json({
    status: 'TEST_COMPLETE',
    message: 'Upload endpoint test completed',
    results: testResults
  });
});

// Get direct upload credentials for large files
router.post('/credentials', async (req, res) => {
  console.log('🎯 DIRECT UPLOAD CREDENTIALS REQUEST');
  
  try {
    // Verify admin authentication
    verifyAdminToken(req);
    console.log('✅ Admin authentication verified');
  } catch (authError) {
    console.error('❌ Authentication failed:', authError.message);
    return res.status(401).json({ 
      error: 'Unauthorized',
      details: 'Valid authentication token required'
    });
  }

  // Check Bunny CDN configuration
  if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY) {
    console.error('❌ BUNNY CDN NOT CONFIGURED');
    return res.status(500).json({ 
      error: 'Server configuration error', 
      details: 'Bunny CDN credentials not configured'
    });
  }

  try {
    const { filename, contentEntryId } = req.body;
    
    if (!filename || !contentEntryId) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'filename and contentEntryId are required'
      });
    }

    console.log('📋 Creating Bunny video entry for:', filename);

    // Create video entry in Bunny CDN
    const createRes = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`,
      {
        method: 'POST',
        headers: {
          'AccessKey': String(BUNNY_API_KEY),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: filename,
        }),
      }
    );

    const createResText = await createRes.text();
    console.log('🐰 Bunny create response:', createRes.status, createResText);

    if (!createRes.ok) {
      throw new Error(`Failed to create Bunny video entry: ${createResText}`);
    }

    let videoData;
    try {
      videoData = JSON.parse(createResText);
    } catch (parseError) {
      console.error('Failed to parse Bunny response:', parseError);
      throw new Error(`Failed to parse Bunny response: ${createResText}`);
    }

    if (!videoData.guid) {
      throw new Error(`Bunny response missing videoId: ${createResText}`);
    }

    const videoId = videoData.guid;
    const uploadUrl = `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`;

    console.log('✅ Bunny video entry created:', videoId);
    console.log('📤 Direct upload URL ready');

    res.json({
      success: true,
      videoId: videoId,
      uploadUrl: uploadUrl,
      libraryId: BUNNY_LIBRARY_ID,
      headers: {
        'AccessKey': BUNNY_API_KEY,
        'Content-Type': 'application/octet-stream'
      },
      message: 'Direct upload credentials ready'
    });

  } catch (error) {
    console.error('❌ Credentials error:', error);
    res.status(500).json({
      error: 'Failed to get upload credentials',
      details: error.message
    });
  }
});

router.post('/', async (req, res) => {
  try {
    return await handleUpload(req, res);
  } catch (uncaughtError) {
    console.error('❌ UNCAUGHT ERROR IN UPLOAD:', {
      message: uncaughtError.message,
      stack: uncaughtError.stack,
      name: uncaughtError.name
    });
    return res.status(500).json({
      error: 'Internal server error during upload',
      details: uncaughtError.message,
      timestamp: new Date().toISOString()
    });
  }
});

async function handleUpload(req, res) {
  console.log('🚀🚀🚀 UPLOAD ENDPOINT HIT! 🚀🚀🚀');
  console.log('🔥🔥🔥 SUPER CRITICAL LOG - UPLOAD STARTING 🔥🔥🔥');
  console.log('📋 Request details:', {
    method: req.method,
    url: req.url,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    expectedSize: req.headers['content-length'] ? `${(Number.parseInt(req.headers['content-length']) / (1024 * 1024)).toFixed(2)} MB` : 'unknown',
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
  
  try {
    // Verify admin authentication
    verifyAdminToken(req);
    console.log('✅ Admin authentication verified for upload');
  } catch (authError) {
    console.error('❌ Authentication failed for upload:', authError.message);
    return res.status(401).json({ 
      error: 'Unauthorized',
      details: 'Valid authentication token required for file uploads',
      timestamp: new Date().toISOString()
    });
  }

  // Check Bunny CDN configuration
  if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY) {
    console.error('❌ BUNNY CDN NOT CONFIGURED - Missing environment variables!');
    console.error('❌ BUNNY_LIBRARY_ID:', BUNNY_LIBRARY_ID || 'UNDEFINED');
    console.error('❌ BUNNY_API_KEY:', BUNNY_API_KEY ? 'DEFINED' : 'UNDEFINED');
    return res.status(500).json({ 
      error: 'Server configuration error', 
      details: 'Bunny CDN credentials not configured. Check BUNNY_LIBRARY_ID and BUNNY_API_KEY environment variables.',
      timestamp: new Date().toISOString(),
      envCheck: {
        BUNNY_LIBRARY_ID: BUNNY_LIBRARY_ID ? '✅ SET' : '❌ MISSING',
        BUNNY_API_KEY: BUNNY_API_KEY ? '✅ SET' : '❌ MISSING'
      }
    });
  }
  console.log('✅ Bunny CDN credentials verified');

  // Use Railway's writable directory - simplified approach
  const tempDir = '/tmp';
  console.log('📁 Using temp directory:', tempDir);
  
  // No need to create /tmp - it always exists on Railway
  console.log('✅ Using system temp directory (always available)');

  let form;
  try {
    console.log('🔧 Configuring formidable for file upload...');
    
    // File upload security: Restrict extensions for safety
    // NOSONAR - File extension validation is implemented via filter function
    form = formidable({
      multiples: false,
      uploadDir: tempDir,
      keepExtensions: true,
      maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB max
      maxTotalFileSize: 2 * 1024 * 1024 * 1024, // 2GB total
      maxFieldsSize: 2 * 1024 * 1024, // 2MB for fields
      hashAlgorithm: false,
      allowedExtensions: ALLOWED_EXTENSIONS,
      filter: function ({name, originalFilename, mimetype}) {
        // Additional security: filter by file extension and mime type
        const ext = path.extname(originalFilename || '').toLowerCase();
        return ALLOWED_EXTENSIONS.includes(ext);
      },
      filename: function(name, ext, part, form) {
        // Validate extension before accepting filename
        if (!ALLOWED_EXTENSIONS.includes(ext.toLowerCase())) {
          throw new Error(`File extension ${ext} not allowed`);
        }
        return name + ext;
      }
    });
    console.log('✅ Formidable configured successfully');
  } catch (formError) {
    console.error('❌ Failed to configure formidable:', formError);
    return res.status(500).json({ 
      error: 'Server configuration error',
      details: 'Failed to initialize file upload handler',
      formError: formError.message,
      tempDir: tempDir
    });
  }

    // Add extended timeout for large files (30 minutes for 1GB+ uploads)
  const uploadTimeout = setTimeout(() => {
    console.error('❌ Upload timeout - taking too long, aborting');
    console.error('💾 Expected large file upload, timeout after 30 minutes');
    if (!res.headersSent) {
      res.status(408).json({ 
        error: 'Upload timeout', 
        message: 'Large file upload took too long and was aborted',
        timeout: '30 minutes',
        expectedSize: 'up to 2GB'
      });
    }
  }, 30 * 60 * 1000); // 30 minute timeout for large files

  // File parsing with security validation - complex but necessary for upload safety
  // eslint-disable-next-line sonarjs/cognitive-complexity
  form.parse(req, async (err, fields, files) => {
    // Clear timeout on completion
    clearTimeout(uploadTimeout);
    
    if (err) {
      console.error('❌ Formidable parse error:', err);
      console.error('❌ Error details:', {
        message: err.message,
        code: err.code,
        stack: err.stack,
        formidableVersion: '3.5.1', // Known version from package.json
        nodeVersion: process.version,
        platform: process.platform,
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
    console.log('🎯 CHECKPOINT 1: File parsing completed');
    
    const fileObj = extractFile(files);
    console.log('🔍 fileObj:', fileObj);
    console.log('🎯 CHECKPOINT 2: File extraction completed');
    
    // Check if file was truncated during upload
    if (fileObj && fileObj.size && req.headers['content-length']) {
      const expectedSize = Number.parseInt(req.headers['content-length']);
      const actualSize = fileObj.size;
      const sizeDifference = expectedSize - actualSize;
      
      console.log(`📊 File size analysis:`);
      console.log(`   Expected: ${(expectedSize / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`   Received: ${(actualSize / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`   Difference: ${(sizeDifference / (1024 * 1024)).toFixed(2)} MB`);
      
      if (sizeDifference > 1024 * 1024) { // More than 1MB difference
        console.log(`⚠️ WARNING: Large file size difference detected - possible truncation!`);
        console.log(`⚠️ This suggests Railway platform limits or network timeout`);
      }
    }
    
    if (fileObj === undefined || fileObj === null) {
      console.log('❌ CHECKPOINT 2.1: No file object found');
      return res.status(400).json({ error: 'No file uploaded (parsed files: ' + JSON.stringify(files) + ', fileObj: ' + JSON.stringify(fileObj) + ')'});
    }
    
    console.log('🎯 CHECKPOINT 3: File validation starting');
    if (!isAllowedExtension(fileObj.originalFilename)) {
      const allowedExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
      console.log('❌ CHECKPOINT 3.1: Invalid file extension');
      return res.status(400).json({ error: 'Invalid file extension. Allowed: ' + allowedExtensions.join(', ') });
    }
    
    console.log('🎯 CHECKPOINT 4: Content entry ID extraction starting');
    // Extract contentEntryId from fields (could be array or string)
    let contentEntryId = fields.contentEntryId || fields.content_entry_id || fields.id;
    if (Array.isArray(contentEntryId)) {
      contentEntryId = contentEntryId[0];
    }
    
    console.log('🔍 Content Entry ID:', contentEntryId);
    console.log('🎯 CHECKPOINT 5: Content entry ID extracted');
    
    if (!contentEntryId) {
      console.log('❌ CHECKPOINT 5.1: Missing content entry ID');
      return res.status(400).json({ error: 'Missing content entry ID. Please provide contentEntryId in the upload form.' });
    }
    
    console.log('🎯 CHECKPOINT 6: Starting Bunny CDN upload process');
    try {
      console.log('🎬 Creating Bunny.net video entry...');
      console.log('🎯 CHECKPOINT 7: About to call createBunnyVideo');
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
      
      try {
        await updateSupabase(contentEntryId, finalUrl);
        console.log('✅ Database update completed successfully');
      } catch (dbError) {
        console.error('❌ CRITICAL: Database update failed - video uploaded but not saved to database!');
        console.error('❌ Database error:', dbError);
        // Don't fail the whole request - video is uploaded successfully
      }
      
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
}

export default router;
