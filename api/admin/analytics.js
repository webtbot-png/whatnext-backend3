const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.substring(7);
  jwt.verify(token, JWT_SECRET); 
}

/**
 * GET /api/admin/analytics
 * Fetch analytics data with aggregation and stats
 */
router.get('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { timeframe = '7d', type = 'all' } = req.query;
    const now = new Date();
    let startDate = new Date();
    switch (timeframe) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }
    let query = supabase
      .from('analytics')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });
    if (type !== 'all') {
      query = query.eq('event_type', type);
    }
    const { data: analytics, error } = await query;
    if (error) throw error;
    // Process analytics data
    const processedData = {
      total_events: analytics?.length || 0,
      events_by_type: {},
      events_by_hour: {},
      events_by_day: {},
      top_locations: {},
      top_media: {},
      unique_sessions: new Set(),
      referrers: {}
    };
    (analytics || []).forEach(event => {
      // Count by type
      processedData.events_by_type[event.event_type] =
        (processedData.events_by_type[event.event_type] || 0) + 1;
      // Count by hour/day
      const date = new Date(event.created_at);
      const hourKey = `${date.getHours()}:00`;
      const dayKey = date.toDateString();
      processedData.events_by_hour[hourKey] =
        (processedData.events_by_hour[hourKey] || 0) + 1;
      processedData.events_by_day[dayKey] =
        (processedData.events_by_day[dayKey] || 0) + 1;
      // Track locations and media
      if (event.location_id) {
        processedData.top_locations[event.location_id] =
          (processedData.top_locations[event.location_id] || 0) + 1;
      }
      if (event.media_id) {
        processedData.top_media[event.media_id] =
          (processedData.top_media[event.media_id] || 0) + 1;
      }
      // Track unique sessions
      if (event.session_id) {
        processedData.unique_sessions.add(event.session_id);
      }
      // Track referrers
      if (event.referrer) {
        processedData.referrers[event.referrer] =
          (processedData.referrers[event.referrer] || 0) + 1;
      }
    });
    // Convert sets to numbers
    const result = {
      ...processedData,
      unique_sessions: processedData.unique_sessions.size,
      timeframe,
      start_date: startDate.toISOString(),
      end_date: now.toISOString()
    };
    return res.json(result);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * POST /api/admin/analytics
 * Record analytics event with validation
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const {
      location_id,
      media_id,
      event_type,
      user_agent,
      ip_address,
      referrer,
      session_id
    } = body;
    if (!event_type) {
      return res.status(400).json({ error: 'Event type is required' });
    }
    const supabase = getSupabaseAdminClient();
    const { data: event, error } = await supabase
      .from('analytics')
      .insert({
        location_id,
        media_id,
        event_type,
        user_agent,
        ip_address,
        referrer,
        session_id
      })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json(event);
  } catch (error) {
    console.error('Error recording analytics:', error);
    return res.status(500).json({ error: 'Failed to record analytics' });
  }
});

module.exports = router;

