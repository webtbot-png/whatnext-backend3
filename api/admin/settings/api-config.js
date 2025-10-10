const express = require('express');
const { getSupabaseAdminClient  } = require('../../../database.js');

const router = express.Router();

// GET /api/admin/settings/api-config
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();

    // Get admin API configuration settings
    const { data: apiConfig, error } = await supabase
      .from('app_settings')
      .select('*')
      .or('key.like.%api%,key.like.%config%');

    if (error) {
      throw error;
    }

    const config = {
      twitterApiEnabled: apiConfig?.find(s => s.key === 'twitter_api_enabled')?.value === 'true',
      pumpfunApiEnabled: apiConfig?.find(s => s.key === 'pumpfun_api_enabled')?.value === 'true',
      analyticsEnabled: apiConfig?.find(s => s.key === 'analytics_enabled')?.value === 'true',
      lastUpdated: new Date().toISOString()
    };

    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('❌ Admin API config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch API configuration'
    });
  }
});

module.exports = router;

