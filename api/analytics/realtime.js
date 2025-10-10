const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

// Helper function to get time range
function getTimeAgo(timeframe) {
  switch (timeframe) {
    case '1h':
      return new Date(Date.now() - 60 * 60 * 1000);
    case '24h':
      return new Date(Date.now() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    default:
      return new Date(Date.now() - 60 * 60 * 1000);
  }
}

/**
 * GET /api/analytics/realtime
 * Get real-time analytics data - REAL DATA ONLY
 */
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    const query = req.query;
    const timeframe = query.timeframe || '1h';
    // Calculate time range
    const timeAgo = getTimeAgo(timeframe);
    // Get active sessions
    const { data: activeSessions, error: sessionsError } = await supabase
      .from('visitor_sessions')
      .select('*')
      .gte('created_at', timeAgo.toISOString())
      .eq('is_active', true);
    if (sessionsError) {
      console.error('Error fetching active sessions:', sessionsError);
    }
    // Get recent page views
    const { data: recentPageViews, error: pageViewsError } = await supabase
      .from('page_views')
      .select('*')
      .gte('created_at', timeAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);
    if (pageViewsError) {
      console.error('Error fetching recent page views:', pageViewsError);
    }
    // Get recent events
    const { data: recentEvents, error: eventsError } = await supabase
      .from('user_events')
      .select('*')
      .gte('created_at', timeAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);
    if (eventsError) {
      console.error('Error fetching recent events:', eventsError);
    }
    // Get popular pages using actual available columns
    const { data: popularPages, error: popularPagesError } = await supabase
      .from('page_views')
      .select('page_path, session_id, created_at')
      .gte('created_at', timeAgo.toISOString());
    if (popularPagesError) {
      console.error('Error fetching popular pages:', popularPagesError);
    }
    // Count page views by path using real data
    const pageViewCounts = {};
    const sessionIds = new Set();
    if (popularPages) {
      popularPages.forEach(view => {
        pageViewCounts[view.page_path] = (pageViewCounts[view.page_path] || 0) + 1;
        if (view.session_id) {
          sessionIds.add(view.session_id);
        }
      });
    }
    // Calculate unique visitors from real session data
    const topPages = Object.entries(pageViewCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));
    // Use real data for metrics
    const uniqueVisitors = Math.max(sessionIds.size, activeSessions ? activeSessions.length : 0);
    const totalPageViews = popularPages ? popularPages.length : 0; // Total page views in timeframe
    const totalEvents = recentEvents ? recentEvents.length : 0;
    // Return REAL DATA ONLY - no fake/estimated values
    const realtimeData = {
      timestamp: new Date().toISOString(),
      timeframe,
      summary: {
        totalVisitors: uniqueVisitors,
        uniqueVisitors: uniqueVisitors,
        totalPageViews: totalPageViews,
        bounceRate: null, // Not tracked - would need session duration data
        avgSessionDuration: null, // Not tracked - would need time tracking
        recentVisitors: (recentPageViews || []).slice(0, 10).length, // Just the count, not objects
        visitorGrowth: null // Not tracked - would need historical comparison
      },
      topCountries: [], // Not tracked - would need IP geolocation
      topPages: topPages,
      hourlyData: [], // Not tracked - would need hourly aggregation
      deviceStats: { mobile: null, desktop: null, tablet: null }, // Not tracked - would need user agent parsing
      activeSessions: activeSessions || [],
      recentPageViews: (recentPageViews || []).slice(0, 20),
      recentEvents: (recentEvents || []).slice(0, 20),
      recentVisitorDetails: (recentPageViews || []).slice(0, 10).map(pv => ({
        session_id: pv.session_id,
        page_path: pv.page_path,
        timestamp: pv.created_at
      })),
      metrics: {
        activeUsers: uniqueVisitors,
        totalPageViews: totalPageViews,
        totalEvents: totalEvents,
        uniqueVisitors: uniqueVisitors
      }
    };
    return res.json(realtimeData);
  } catch (error) {
    console.error('Error fetching realtime analytics:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

