const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

/**
 * POST /api/analytics/track-event
 * Track user events
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const supabase = getSupabaseAdminClient();
    // Ensure required fields and validate event type
    const sessionId = body.sessionId || `event-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    // Valid event types based on the database constraint
    const validEventTypes = ['page_view', 'click', 'scroll', 'hover', 'play', 'share', 'download', 'form_submit', 'error'];
    const eventType = validEventTypes.includes(body.eventType) ? body.eventType : 'click';
    // Get the visitor session ID
    const { data: visitorSession } = await supabase
      .from('visitor_sessions')
      .select('id')
      .eq('session_id', sessionId)
      .limit(1)
      .single();
    const eventData = {
      session_id: sessionId,
      event_type: eventType,
      event_category: body.eventCategory || 'general',
      event_action: body.eventAction || 'unknown',
      event_label: body.eventLabel || null,
      event_value: body.eventValue || null,
      element_id: body.elementId || null,
      element_class: body.elementClass || null,
      element_text: body.elementText || null,
      x_coordinate: body.xCoordinate || null,
      y_coordinate: body.yCoordinate || null,
      metadata: body.metadata || {},
      created_at: new Date().toISOString()
    };
    if (visitorSession) {
      eventData.visitor_session_id = visitorSession.id;
    }
    if (body.pageViewId) {
      eventData.page_view_id = body.pageViewId;
    }
    // Insert event
    const { error } = await supabase
      .from('analytics_events')
      .insert([eventData]);
    if (error) {
      console.error('Error inserting analytics event:', error);
      // Handle specific constraint violations gracefully
      if (error.code === '23505') { // Unique constraint violation
        console.log('Duplicate event detected, returning success');
        return res.json({ success: true });
      }
      if (error.code === '23503') { // Foreign key constraint violation
        console.log('Foreign key constraint violation, creating without foreign keys');
        // Try again without problematic references
        const simpleEventData = {
          session_id: sessionId,
          event_type: eventType,
          event_category: body.eventCategory || 'general',
          event_action: body.eventAction || 'unknown',
          metadata: body.metadata || {},
          created_at: new Date().toISOString()
        };
        const { error: retryError } = await supabase
          .from('analytics_events')
          .insert([simpleEventData]);
        if (!retryError) {
          return res.json({ success: true });
        }
      }
      return res.status(500).json({ error: 'Failed to track event' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Error tracking event:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

