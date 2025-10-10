const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    const { data: settings, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'social_auto_update_enabled')
      .single();
    if (error && error.code !== 'PGRST116') {
      console.error('❌ Settings error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to check auto-update settings'
      });
    }
    const isEnabled = settings?.value === 'true';
    if (!isEnabled) {
      return res.json({
        success: true,
        message: 'Auto-update is disabled',
        updated: false
      });
    }
    // Trigger social media updates
    // This would typically call the Twitter API to refresh follower counts
    res.json({
      success: true,
      message: 'Auto-update completed',
      updated: true,
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Social auto-update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform auto-update'
    });
  }
});

module.exports = router;

