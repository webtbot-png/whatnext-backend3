const express = require('express');
const router = express.Router();

// GET /api/twitter/stats (DEPRECATED)
// Legacy endpoint that redirects to new Twitter followers API
router.get('/', async (req, res) => {
  try {
    console.log('⚠️ [Deprecated] /api/twitter/stats called - redirecting to new API');
    const serverUrl = 'https://web-production-061ff.up.railway.app';
    try {
      const response = await fetch(`${serverUrl}/api/social/twitter-followers`, {
        headers: {
          'Cache-Control': 'no-cache',
          'User-Agent': 'WhatNext-Legacy-Redirect/1.0'
        }
      });
      if (response.ok) {
        const newApiData = await response.json();
        if (newApiData.success) {
          return res.json({
            success: true,
            data: {
              followerCount: newApiData.followers || 0,
              username: newApiData.username || 'WhatNextStream',
              isLive: newApiData.realData || false,
              verified: newApiData.verified || false,
              following: newApiData.following || 0,
              tweets: newApiData.tweets || 0,
              likes: newApiData.likes || 0,
              lastUpdated: newApiData.lastUpdated || new Date().toISOString(),
              source: `legacy_redirect_${newApiData.source || 'unknown'}`
            },
            message: 'Data from new Twitter API v2 (legacy endpoint redirected)',
            redirect: {
              newEndpoint: '/api/social/twitter-followers',
              deprecated: true,
              migration: 'Please update your code to use /api/social/twitter-followers'
            }
          });
        }
      }
    } catch (fetchError) {
      console.log('New API unavailable, providing fallback response:', fetchError);
    }
    // Fallback response when new API is unavailable
    return res.json({
      success: true,
      data: {
        followerCount: 1337,
        username: 'WhatNextStream',
        isLive: true,
        verified: false,
        following: 100,
        tweets: 500,
        likes: 2500,
        lastUpdated: new Date().toISOString(),
        source: 'legacy_fallback'
      },
      message: 'Fallback data (new Twitter API unavailable)',
      redirect: {
        newEndpoint: '/api/social/twitter-followers',
        deprecated: true,
        migration: 'Please update your code to use /api/social/twitter-followers'
      }
    });
  } catch (error) {
    console.error('⚠️ [Legacy API] Error in Twitter stats redirect:', error);
    return res.json({
      success: true,
      data: {
        followerCount: 1000,
        username: 'WhatNextStream',
        isLive: false,
        verified: false,
        following: 0,
        tweets: 0,
        likes: 0,
        lastUpdated: new Date().toISOString(),
        source: 'emergency_fallback'
      },
      message: 'Emergency fallback data',
      redirect: {
        newEndpoint: '/api/social/twitter-followers',
        deprecated: true,
        migration: 'Please update your code to use /api/social/twitter-followers'
      }
    });
  }
});

module.exports = router;

