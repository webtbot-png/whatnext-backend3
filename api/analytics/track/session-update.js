const express = require('express');
const { getSupabaseAdminClient  } = require('../../../database.js');

const router = express.Router();

/**
 * POST /api/analytics/track/session-update
 * Update session activity and engagement metrics
 */
router.post('/', async (req, res) => {
  try {
    const {
      sessionId,
      session_id,
      session_duration,
      page_views,
      session_end
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
    // First check if session exists
    const { error: checkError } = await supabase
      .from('visitor_sessions')
      .select('id, session_id')
      .eq('session_id', actualSessionId)
      .single();
    if (checkError && checkError.code === 'PGRST116') {
      // Session doesn't exist - create it first with minimal data
      console.log(`Creating new session for update: ${actualSessionId}`);
      const { error: createError } = await supabase
        .from('visitor_sessions')
        .insert({
          session_id: actualSessionId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ip_address: '127.0.0.1', // Default for API updates
          user_agent: 'API-Update',
          device_type: 'desktop'
        })
        .select()
        .single();
      if (createError) {
        console.error('Failed to create session for update:', createError);
        return res.status(500).json({
          success: false,
          error: 'Failed to create session for update'
        });
      }
    }
    // Now update the session with new activity data
    const updateData = {
      updated_at: new Date().toISOString()
    };
    if (session_duration !== undefined) updateData.session_duration = session_duration;
    if (page_views !== undefined) updateData.page_views = page_views;
    if (session_end !== undefined) updateData.session_end = session_end;
    const { data: session, error } = await supabase
      .from('visitor_sessions')
      .update(updateData)
      .eq('session_id', actualSessionId)
      .select()
      .single();
    if (error) {
      console.error('Error updating session:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update session'
      });
    }
    return res.json({
      success: true,
      session,
      message: 'Session updated successfully'
    });
  } catch (error) {
    console.error('Error updating session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update session'
    });
  }
});

module.exports = router;

