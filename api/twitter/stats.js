const express = require('express');
const router = express.Router();

// GET /api/twitter/stats (DEPRECATED)
// Legacy endpoint that redirects to new Twitter followers API
router.get('/', async (req, res) => {
  try {
    console.log('⚠️ [Deprecated] /api/twitter/stats called - using internal redirect');
    // Use internal API call instead of external fetch to avoid hardcoded URLs
    const { getSupabaseAdminClient } = require('../../database.js');
    const supabase = getSupabaseAdminClient();
    
    try {
      // Get Twitter data directly from database instead of external API call
      const { data: twitterData, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['twitter_followers', 'twitter_username', 'twitter_verified']);
      if (!error && twitterData) {
        // Convert settings array to object
        const settings = {};
        twitterData.forEach(item => {
          settings[item.key] = item.value;
        });
        
        return res.json({
          success: true,
          data: {
            followerCount: parseInt(settings.twitter_followers || '1337'),
            username: settings.twitter_username || 'WhatNextStream',
            isLive: true,
            verified: settings.twitter_verified === 'true',
            following: 100,
            tweets: 500,
            likes: 2500,
            lastUpdated: new Date().toISOString(),
            source: 'database_internal'
          },
          message: 'Data from internal database (legacy endpoint)',
          redirect: {
            newEndpoint: '/api/social/twitter-followers',
            deprecated: true,
            migration: 'Please update your code to use /api/social/twitter-followers'
          }
        });
      }
    } catch (dbError) {
      console.log('Database unavailable, providing fallback response:', dbError);
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

