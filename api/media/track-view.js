const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

// Helper function to increment content views
async function incrementContentViews(contentId) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.rpc('increment_content_views', {
    content_uuid: contentId
  });
  if (error) {
    console.error('❌ RPC failed, using fallback for content:', error);
    // Fallback to direct update
    const { data } = await supabase
      .from('content_entries')
      .select('view_count')
      .eq('id', contentId)
      .single();
    const newCount = (data?.view_count || 0) + 1;
    const { error: fallbackError } = await supabase
      .from('content_entries')
      .update({
        view_count: newCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', contentId);
    if (fallbackError) {
      throw fallbackError;
    }
  }
  console.log(`📊 Content view tracked for ID: ${contentId}`);
}

// Helper function to increment media views
async function incrementMediaViews(mediaId) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.rpc('increment_media_views', {
    media_uuid: mediaId
  });
  if (error) {
    console.error('❌ RPC failed, using fallback for media:', error);
    // Fallback to direct update
    const { data } = await supabase
      .from('media')
      .select('view_count')
      .eq('id', mediaId)
      .single();
    const newCount = (data?.view_count || 0) + 1;
    const { error: fallbackError } = await supabase
      .from('media')
      .update({
        view_count: newCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', mediaId);
    if (fallbackError) {
      throw fallbackError;
    }
  }
  console.log(`📊 Media view tracked for ID: ${mediaId}`);
}

// Helper function to track analytics
async function trackAnalytics(req, contentId, mediaId, viewType, duration) {
  const supabase = getSupabaseAdminClient();
  try {
    // Try with new schema first
    const { error } = await supabase
      .from('analytics')
      .insert({
        event_type: `media_${viewType || 'view'}`,
        page_url: req.headers.referer || '/unknown',
        user_agent: req.headers['user-agent'] || 'unknown',
        ip_address: req.ip || 'unknown',
        session_data: {
          contentId,
          mediaId,
          viewType,
          duration,
          timestamp: new Date().toISOString()
        }
      });
    if (error) {
      console.error('⚠️ New analytics schema failed, trying legacy:', error);
      // Fallback to legacy schema without new fields
      const { error: legacyError } = await supabase
        .from('analytics')
        .insert({
          event_type: viewType === 'play' ? 'play' : 'view',
          user_agent: req.headers['user-agent'] || 'unknown',
          ip_address: req.ip || 'unknown',
          referrer: req.headers.referer || '/unknown'
        });
      if (legacyError) {
        console.error('⚠️ Legacy analytics also failed:', legacyError);
      }
    }
  } catch (error) {
    console.error('⚠️ Analytics tracking failed completely:', error);
  }
}

/**
 * POST /api/media/track-view
 * Track media/video view interactions
 */
router.post('/', async (req, res) => {
  try {
    const { contentId, mediaId, viewType = 'play', duration = 0 } = req.body;
    if (!contentId && !mediaId) {
      return res.status(400).json({ error: 'contentId or mediaId is required' });
    }
    // Track views
    if (contentId) {
      await incrementContentViews(contentId);
    }
    if (mediaId) {
      await incrementMediaViews(mediaId);
    }
    // Track analytics
    await trackAnalytics(req, contentId, mediaId, viewType, duration);
    return res.json({
      success: true,
      message: 'View tracked successfully',
      contentId,
      mediaId,
      viewType
    });
  } catch (error) {
    console.error('❌ Error tracking media view:', error);
    return res.status(500).json({
      error: 'Failed to track view',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;

