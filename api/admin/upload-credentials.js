const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID;
const BUNNY_API_KEY = process.env.BUNNY_API_KEY;

// Use global fetch if available (Node 18+) or require node-fetch v2
const fetch = globalThis.fetch || require('node-fetch');

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.substring(7);
  try {
    jwt.verify(token, JWT_SECRET);
  } catch (e) {
    console.error('Token verification failed:', e);
    throw new Error('Invalid token');
  }
}

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

module.exports = router;
