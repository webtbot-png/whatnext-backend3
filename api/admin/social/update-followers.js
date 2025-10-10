const express = require('express');


const router = express.Router();

router.post('/', async (req, res) => {
  try {
    // Update follower counts by calling the Twitter API
    const response = await fetch('https://web-production-061ff.up.railway.app/api/social/twitter-followers', {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    if (!response.ok) {
      throw new Error('Failed to fetch updated follower data');
    }
    const data = await response.json();
    if (data.success) {
      res.json({
        success: true,
        followers: data.followers,
        lastUpdated: data.lastUpdated,
        message: 'Follower count updated successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update follower count'
      });
    }
  } catch (error) {
    console.error('❌ Admin social update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update social media data'
    });
  }
});

module.exports = router;

