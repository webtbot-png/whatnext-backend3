const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

/**
 * POST /api/analytics/track-pageview
 * Track page views
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const supabase = getSupabaseAdminClient();
    // Ensure required fields are not null
    const sessionId = body.sessionId || `pageview-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const pagePath = body.pagePath || '/unknown';
    // First, get the visitor session ID for this session
    const { data: visitorSession } = await supabase
      .from('visitor_sessions')
      .select('id')
      .eq('session_id', sessionId)
      .limit(1)
      .single();
    const pageViewData = {
      session_id: sessionId,
      page_path: pagePath,
      page_title: body.pageTitle || 'Unknown Page',
      location_id: body.locationId || null,
      media_id: body.mediaId || null,
      time_on_page: 0,
      scroll_depth: 0,
      interactions: 0,
      exit_page: false,
      created_at: new Date().toISOString()
    };
    if (visitorSession) {
      pageViewData.visitor_session_id = visitorSession.id;
    }
    // Insert page view
    const { data, error } = await supabase
      .from('page_views')
      .insert([pageViewData])
      .select('id')
      .single();
    if (error) {
      console.error('Error inserting page view:', error);
      // Handle specific constraint violations gracefully
      if (error.code === '23505') { // Unique constraint violation
        console.log('Duplicate page view detected, returning success');
        return res.json({ success: true, pageViewId: `duplicate-${Date.now()}` });
      }
      if (error.code === '23503') { // Foreign key constraint violation
        console.log('Foreign key constraint violation, creating without foreign keys');
        // Try again without problematic references
        const simplePageViewData = {
          session_id: sessionId,
          page_path: pagePath,
          page_title: body.pageTitle || 'Unknown',
          created_at: new Date().toISOString()
        };
        const { data: retryData } = await supabase
          .from('page_views')
          .insert([simplePageViewData])
          .select('id')
          .single();
        if (retryData) {
          return res.json({ success: true, pageViewId: retryData.id });
        }
      }
      return res.status(500).json({ error: 'Failed to track page view' });
    }
    // Update visitor session page view count
    if (visitorSession) {
      const { data: currentSession } = await supabase
        .from('visitor_sessions')
        .select('page_views')
        .eq('id', visitorSession.id)
        .single();
      const currentPageViews = currentSession?.page_views || 0;
      await supabase
        .from('visitor_sessions')
        .update({
          page_views: currentPageViews + 1,
          last_activity: new Date().toISOString()
        })
        .eq('id', visitorSession.id);
    }
    console.log(`✅ Page view tracked: ${body.pagePath} (${body.sessionId})`);
    return res.json({ success: true, pageViewId: data.id });
  } catch (error) {
    console.error('Error tracking page view:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/analytics/track-pageview
 * Update page view data
 */
router.put('/', async (req, res) => {
  try {
    const body = req.body;
    const supabase = getSupabaseAdminClient();
    const updateData = {
      time_on_page: body.timeOnPage,
      scroll_depth: body.scrollDepth,
      interactions: body.interactions,
      exit_page: body.exitPage || false
    };
    const { error } = await supabase
      .from('page_views')
      .update(updateData)
      .eq('id', body.pageViewId);
    if (error) {
      console.error('Error updating page view:', error);
      return res.status(500).json({ error: 'Failed to update page view' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating page view:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

