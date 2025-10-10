const express = require('express');
const { getSupabaseAdminClient  } = require('../../../database.js');

const router = express.Router();

/**
 * POST /api/analytics/track/session
 * Create or update a visitor session
 */
router.post('/', async (req, res) => {
  try {
    const {
      sessionId,
      session_id,
      user_agent,
      ip_address,
      referrer,
      landing_page,
      browser,
      browser_version,
      os,
      os_version,
      device_type,
      screen_resolution,
      language,
      country_code,
      country_name,
      city,
      region,
      timezone,
      latitude,
      longitude
    } = req.body;
    // Accept both sessionId and session_id for compatibility
    const actualSessionId = sessionId || session_id;
    if (!actualSessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }
    const supabase = getSupabaseAdminClient();
    // Try to find existing session first
    const { data: existingSession, error: fetchError } = await supabase
      .from('visitor_sessions')
      .select('id')
      .eq('session_id', actualSessionId)
      .single();
    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }
    if (existingSession) {
      // Update existing session
      const { data: session, error } = await supabase
        .from('visitor_sessions')
        .update({
          updated_at: new Date().toISOString()
        })
        .eq('session_id', actualSessionId)
        .select()
        .single();
      if (error) throw error;
      return res.json({
        success: true,
        session,
        action: 'updated'
      });
    } else {
      // Create new session
      const { data: session, error } = await supabase
        .from('visitor_sessions')
        .insert({
          session_id: actualSessionId,
          user_agent,
          ip_address,
          referrer,
          landing_page,
          browser,
          browser_version,
          os,
          os_version,
          device_type,
          screen_resolution,
          language,
          country_code,
          country_name,
          city,
          region,
          timezone,
          latitude,
          longitude,
          session_start: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      return res.json({
        success: true,
        session,
        action: 'created'
      });
    }
  } catch (error) {
    console.error('Error tracking session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to track session'
    });
  }
});

module.exports = router;

