const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

/**
 * GET /api/analytics/live
 * Get live analytics data for real-time monitoring
 */
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    // Get active sessions in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: activeSessions, error: sessionsError } = await supabase
      .from('visitor_sessions')
      .select('id, session_id, created_at, last_activity')
      .gte('last_activity', fiveMinutesAgo)
      .order('last_activity', { ascending: false });
    if (sessionsError) {
      console.error('Error fetching active sessions:', sessionsError);
    }
    // Get recent page views in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentPageViews, error: pageViewsError } = await supabase
      .from('page_views')
      .select('page_path, created_at')
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false })
      .limit(100);
    if (pageViewsError) {
      console.error('Error fetching recent page views:', pageViewsError);
    }
    // Get recent events in the last hour
    const { data: recentEvents, error: eventsError } = await supabase
      .from('analytics_events')
      .select('event_type, event_category, event_action, created_at')
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false })
      .limit(50);
    if (eventsError) {
      console.error('Error fetching recent events:', eventsError);
    }
    const liveData = {
      activeSessions: activeSessions?.length || 0,
      recentPageViews: recentPageViews || [],
      recentEvents: recentEvents || [],
      timestamp: new Date().toISOString(),
      sessionIds: activeSessions?.map(s => s.session_id) || []
    };
    return res.json({
      success: true,
      live: liveData,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching live analytics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch live analytics data'
    });
  }
});

module.exports = router;

