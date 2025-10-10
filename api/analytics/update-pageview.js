const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

/**
 * PUT /api/analytics/update-pageview
 * Update existing page view data
 */
router.put('/', async (req, res) => {
  try {
    const body = req.body;
    const supabase = getSupabaseAdminClient();
    const updateData = {
      time_on_page: body.timeOnPage,
      scroll_depth: body.scrollDepth,
      interactions: body.interactions,
      exit_page: body.exitPage || false,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase
      .from('page_views')
      .update(updateData)
      .eq('id', body.pageViewId);
    if (error) {
      console.error('Error updating page view:', error);
      return res.status(500).json({ error: 'Failed to update page view' });
    }
    console.log(`✅ Page view updated: ${body.pageViewId}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating page view:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

