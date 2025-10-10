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

// POST /api/admin/populate-settings
router.post('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    // Check if settings already exist
    const { data: existingSettings } = await supabase
      .from('app_settings')
      .select('id')
      .limit(1);
    if (existingSettings && existingSettings.length > 0) {
      return res.json({ success: true, message: 'Settings already exist', total_count: existingSettings.length });
    }
    // Default settings to populate
    const defaultSettings = [
      { key: 'site_name', value: 'WhatNext', description: 'Platform name and branding', category: 'platform' },
      { key: 'site_tagline', value: 'Interactive World Adventure Platform', description: 'Site tagline or slogan', category: 'platform' },
      { key: 'platform_enabled', value: 'true', description: 'Enable/disable the entire platform', category: 'platform' },
      { key: 'community_size_target', value: '10000', description: 'Target community member count', category: 'platform' },
      { key: 'content_moderation_enabled', value: 'true', description: 'Enable content moderation features', category: 'content' },
      { key: 'media_upload_enabled', value: 'true', description: 'Allow media uploads', category: 'content' },
      { key: 'max_media_size_mb', value: '100', description: 'Maximum media file size in MB', category: 'content' },
      { key: 'analytics_enabled', value: 'true', description: 'Enable analytics tracking', category: 'analytics' },
      { key: 'visitor_tracking_enabled', value: 'true', description: 'Track visitor analytics', category: 'analytics' },
      { key: 'performance_monitoring_enabled', value: 'true', description: 'Enable performance monitoring', category: 'analytics' },
      { key: 'pumpfun_integration_enabled', value: 'true', description: 'Enable PumpFun token integration', category: 'integrations' },
      { key: 'social_media_enabled', value: 'true', description: 'Enable social media integrations', category: 'integrations' },
      { key: 'api_rate_limiting_enabled', value: 'true', description: 'Enable API rate limiting', category: 'integrations' },
      { key: 'admin_login_enabled', value: 'true', description: 'Allow admin login access', category: 'security' },
      { key: 'session_timeout_hours', value: '2', description: 'Admin session timeout in hours', category: 'security' },
      { key: 'security_logging_enabled', value: 'true', description: 'Enable security event logging', category: 'security' },
      { key: 'database_connection_pooling', value: 'true', description: 'Enable database connection pooling', category: 'advanced' },
      { key: 'cache_enabled', value: 'true', description: 'Enable application caching', category: 'advanced' },
      { key: 'background_jobs_enabled', value: 'true', description: 'Enable background job processing', category: 'advanced' }
    ];
    const { data: newSettings, error } = await supabase
      .from('app_settings')
      .insert(defaultSettings)
      .select();
    if (error) throw error;
    const categoryCount = defaultSettings.reduce((acc, setting) => {
      acc[setting.category] = (acc[setting.category] || 0) + 1;
      return acc;
    }, {});
    return res.json({
      success: true,
      message: `Successfully populated ${newSettings?.length || 0} default settings`,
      total_count: newSettings?.length || 0,
      categories: categoryCount
    });
  } catch (error) {
    console.error('Error populating settings:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to populate settings' });
  }
});

module.exports = router;

