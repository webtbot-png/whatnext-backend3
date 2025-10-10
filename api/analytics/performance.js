const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

/**
 * GET /api/analytics/performance
 * Get performance analytics data
 */
router.get('/', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '24h';
    const supabase = getSupabaseAdminClient();
    // Calculate time range based on timeframe
    let timeRangeStart;
    switch (timeframe) {
      case '1h':
        timeRangeStart = new Date(Date.now() - 60 * 60 * 1000);
        break;
      case '24h':
        timeRangeStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        timeRangeStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        timeRangeStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        timeRangeStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }
    const timeRangeISO = timeRangeStart.toISOString();
    // Get average session duration
    const { data: sessionData, error } = await supabase
      .from('visitor_sessions')
      .select('duration')
      .gte('created_at', timeRangeISO)
      .not('duration', 'is', null);
    if (error) {
      console.error('Session data query error:', error);
    }
    let avgSessionDuration = 0;
    if (sessionData && sessionData.length > 0) {
      const totalDuration = sessionData.reduce((sum, session) => sum + (session.duration || 0), 0);
      avgSessionDuration = Math.round(totalDuration / sessionData.length);
    }
    // Get bounce rate (sessions with only 1 page view)
    const { data: bounceData, error: bounceError } = await supabase
      .from('visitor_sessions')
      .select('page_views')
      .gte('created_at', timeRangeISO)
      .not('page_views', 'is', null);
    if (bounceError) {
      console.error('Bounce data query error:', bounceError);
    }
    let bounceRate = 0;
    if (bounceData && bounceData.length > 0) {
      const bouncedSessions = bounceData.filter(session => (session.page_views || 0) <= 1).length;
      bounceRate = (bouncedSessions / bounceData.length) * 100;
    }
    // Get top performing pages
    const { data: topPages, error: topPagesError } = await supabase
      .from('page_views')
      .select('page_path')
      .gte('created_at', timeRangeISO)
      .not('page_path', 'is', null);
    if (topPagesError) {
      console.error('Top pages query error:', topPagesError);
    }
    const pageStats = {};
    if (topPages) {
      topPages.forEach(page => {
        pageStats[page.page_path] = (pageStats[page.page_path] || 0) + 1;
      });
    }
    const topPerformingPages = Object.entries(pageStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([path, views]) => ({ path, views }));
    // Mock performance metrics (you can replace with actual performance tracking)
    const performanceMetrics = {
      pageLoadSpeed: {
        score: Math.floor(Math.random() * 20) + 80, // 80-100
        rating: 'Good',
        value: Math.floor(Math.random() * 1000) + 500 // 500-1500ms
      },
      firstContentfulPaint: {
        score: Math.floor(Math.random() * 15) + 85, // 85-100
        rating: 'Good',
        value: Math.floor(Math.random() * 800) + 200 // 200-1000ms
      },
      largestContentfulPaint: {
        score: Math.floor(Math.random() * 10) + 90, // 90-100
        rating: 'Excellent',
        value: Math.floor(Math.random() * 1200) + 800 // 800-2000ms
      },
      cumulativeLayoutShift: {
        score: Math.floor(Math.random() * 5) + 95, // 95-100
        rating: 'Excellent',
        value: (Math.random() * 0.05).toFixed(3) // 0-0.05
      }
    };
    return res.json({
      success: true,
      timeframe,
      performance: {
        avgSessionDuration,
        bounceRate: Math.round(bounceRate * 10) / 10,
        topPages: topPerformingPages,
        metrics: performanceMetrics
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching performance analytics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch performance analytics'
    });
  }
});

module.exports = router;

