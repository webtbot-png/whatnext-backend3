const express = require('express');
const { getSupabaseClient } = require('../database');

const router = express.Router();

// GET /api/stats - Get application statistics
router.get('/', async (req, res) => {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.json({
        success: true,
        data: {
          totalMembers: 0,
          activeStreams: 1,
          locationsVisited: 0,
          viewsLast7d: 0,
          viewsLast30d: 0,
          liveStatus: 'OFFLINE'
        }
      });
    }
    const supabase = getSupabaseClient();
    // Get stats from app_settings table
    const { data: statsData } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['community_members', 'active_streams', 'views_last_7d', 'views_last_30d', 'live_status']);
    // Get location counts
    const { count: totalLocations } = await supabase
      .from('locations')
      .select('*', { count: 'exact', head: true });
    const { count: visitedLocations } = await supabase
      .from('locations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'visited');
    // Convert array to object
    const stats = {};
    if (statsData) {
      for (const item of statsData) {
        stats[item.key] = item.value;
      }
    }
    return res.json({
      success: true,
      data: {
        totalMembers: Number.parseInt(stats['community_members'] || '0'),
        activeStreams: Number.parseInt(stats['active_streams'] || '1'),
        locationsVisited: visitedLocations || 0,
        totalLocations: totalLocations || 0,
        viewsLast7d: Number.parseInt(stats['views_last_7d'] || '0'),
        viewsLast30d: Number.parseInt(stats['views_last_30d'] || '0'),
        liveStatus: stats['live_status'] || 'OFFLINE',
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return res.json({
      success: true,
      data: {
        totalMembers: 0,
        activeStreams: 1,
        locationsVisited: 0,
        totalLocations: 0,
        viewsLast7d: 0,
        viewsLast30d: 0,
        liveStatus: 'OFFLINE',
        lastUpdated: new Date().toISOString()
      }
    });
  }
});
// GET /api/stats/live - Get live statistics for real-time updates
router.get('/live', async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    // Get live stats
    const { data: liveStats } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['live_status', 'current_viewers', 'live_location', 'live_stream_url']);
    // Get recent activity (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentActivity, error: activityError } = await supabase
      .from('visitor_sessions')
      .select('id, created_at, last_activity')
      .gte('last_activity', fiveMinutesAgo)
      .order('last_activity', { ascending: false });
    if (activityError) {
      console.error('Error fetching recent activity:', activityError);
    }
    // Convert array to object
    const liveStatsObj = {};
    if (liveStats) {
      for (const item of liveStats) {
        liveStatsObj[item.key] = item.value;
      }
    }
    return res.json({
      success: true,
      live: {
        status: liveStatsObj['live_status'] || 'OFFLINE',
        currentViewers: Number.parseInt(liveStatsObj['current_viewers'] || '0'),
        location: liveStatsObj['live_location'] || null,
        streamUrl: liveStatsObj['live_stream_url'] || null,
        activeUsers: recentActivity?.length || 0,
        timestamp: new Date().toISOString()
      },
      recentActivity: recentActivity || [],
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Live stats API error:', error);
    return res.json({
      success: true,
      live: {
        status: 'OFFLINE',
        currentViewers: 0,
        location: null,
        streamUrl: null,
        activeUsers: 0,
        timestamp: new Date().toISOString()
      },
      recentActivity: [],
      lastUpdated: new Date().toISOString()
    });
  }
});

module.exports = router;
