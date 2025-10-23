const express = require('express');
const formidable = require('formidable');
const fs = require('node:fs');
const path = require('node:path');

// SECURITY: Explicitly restrict file extensions for uploaded files (SonarQube S2598 compliance)
// Only video files are allowed to prevent malicious file uploads
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.mpeg', '.mpg']);
const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'video/x-flv',
  'video/mpeg'
]);

/**
 * SECURITY FUNCTION: Validates file extension and MIME type to prevent malicious uploads
 * This function explicitly checks file extensions as required by SonarQube S2598
 * @param {string} filename - The original filename from the upload
 * @param {string} mimetype - The MIME type from the upload
 * @returns {boolean} - True if file is allowed, false otherwise
 */
function isFileExtensionAllowed(filename, mimetype) {
  // SECURITY: Reject files without filename or mimetype
  if (!filename || !mimetype) {
    return false;
  }

  // SECURITY: Extract and validate file extension
  const fileExt = filename.toLowerCase().match(/\.\w+$/)?.[0];
  if (!fileExt) {
    return false; // No extension found
  }

  // SECURITY: Check if extension is in allowed set (SonarQube S7776 compliance)
  const isExtensionAllowed = ALLOWED_EXTENSIONS.has(fileExt);
  const isMimeTypeAllowed = ALLOWED_MIME_TYPES.has(mimetype);

  // SECURITY: Both extension and MIME type must be allowed
  return isExtensionAllowed && isMimeTypeAllowed;
}

// SonarQube S2598: File extension and MIME type are restricted below (see ALLOWED_EXTENSIONS and ALLOWED_MIME_TYPES)
function createSecureFormParser(uploadDir) {
  return formidable({
    maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB
    uploadDir: uploadDir,
    keepExtensions: true,
    allowEmptyFiles: false,
    maxFields: 0,
    maxFiles: 1,
    filter: function ({ name, originalFilename, mimetype }) {
      // SECURITY: Use explicit validation function for SonarQube compliance
      return isFileExtensionAllowed(originalFilename, mimetype);
    }
  });
}

const router = express.Router();

router.post('/', async function (req, res) {
  try {
    console.log('📤 Starting Bunny.net upload...');
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'bunny-temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const form = createSecureFormParser(uploadDir);
    form.parse(req, async function (err, fields, files) {
      try {
        if (err) {
          console.error('Formidable error:', err);
          return res.status(400).json({ error: 'File upload error' });
        }
        let file = files.file;
        if (!file) {
          const fileKeys = Object.keys(files);
          if (fileKeys.length > 0) file = files[fileKeys[0]];
        }
        const fileObj = Array.isArray(file) ? file[0] : file;
        if (!fileObj) {
          return res.status(400).json({ error: 'No file uploaded' });
        }
        const fileExt = fileObj.originalFilename ? fileObj.originalFilename.toLowerCase().match(/\.\w+$/) && fileObj.originalFilename.toLowerCase().match(/\.\w+$/)[0] : '';
        if (!ALLOWED_EXTENSIONS.has(fileExt)) {
          fs.unlinkSync(fileObj.filepath);
          return res.status(400).json({ error: 'Invalid file type. Only video files are allowed.', allowedTypes: Array.from(ALLOWED_EXTENSIONS).join(', ') });
        }
        if (fileObj.mimetype && !ALLOWED_MIME_TYPES.has(fileObj.mimetype)) {
          fs.unlinkSync(fileObj.filepath);
          return res.status(400).json({ error: 'Invalid file MIME type.', allowedTypes: Array.from(ALLOWED_MIME_TYPES).join(', ') });
        }
        console.log('📁 File:', fileObj.originalFilename, 'Size:', (fileObj.size / 1024 / 1024).toFixed(2), 'MB');

        // Step 1: Create video entry in Bunny
        const videoId = await createBunnyVideoEntry(fileObj.originalFilename);
        // Step 2: Upload the actual video file
        await uploadBunnyVideoFile(videoId, fileObj.filepath);
        fs.unlinkSync(fileObj.filepath);
        // Step 3: Return the playback URLs
        const iframeUrl = `https://iframe.mediadelivery.net/embed/${process.env.BUNNY_LIBRARY_ID}/${videoId}`;
        const playUrl = `https://iframe.mediadelivery.net/play/${process.env.BUNNY_LIBRARY_ID}/${videoId}`;
        console.log('🎥 Playback URL:', iframeUrl);
        res.json({
          success: true,
          url: iframeUrl,
          playUrl: playUrl,
          videoId: videoId,
          message: 'Video uploaded! Bunny is processing it now (takes 1-2 minutes)'
        });
      } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({ error: 'Upload failed', details: error.message });
      }
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: 'Upload failed', details: error.message });
  }
});

async function createBunnyVideoEntry(filename) {
  const response = await fetch(
    `https://video.bunnycdn.com/library/${process.env.BUNNY_LIBRARY_ID}/videos`,
    {
      method: 'POST',
      headers: {
        'AccessKey': process.env.BUNNY_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: filename || 'Untitled Video' }),
    }
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Failed to create video: ' + errText);
  }
  const videoData = await response.json();
  console.log('✅ Video entry created, ID:', videoData.guid);
  return videoData.guid;
}

async function uploadBunnyVideoFile(videoId, filepath) {
  const videoBuffer = fs.readFileSync(filepath);
  const response = await fetch(
    `https://video.bunnycdn.com/library/${process.env.BUNNY_LIBRARY_ID}/videos/${videoId}`,
    {
      method: 'PUT',
      headers: {
        'AccessKey': process.env.BUNNY_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: videoBuffer,
    }
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Upload failed: ' + errText);
  }
  console.log('✅ Video uploaded successfully!');
}

module.exports = router;

