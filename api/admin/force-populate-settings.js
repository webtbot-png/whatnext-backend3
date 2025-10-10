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

// POST /api/admin/force-populate-settings
router.post('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    // Clear existing settings first (force populate)
    const { error: deleteError } = await supabase
      .from('app_settings')
      .delete()
      .neq('id', 0);
    if (deleteError && !deleteError.message.includes('No rows found')) {
      console.log('Note: No existing settings to clear');
    }
    const defaultSettings = [
      { key: 'site_name', value: 'WhatNext', description: 'Platform name and branding', category: 'platform' },
      { key: 'site_tagline', value: 'Interactive World Adventure Platform', description: 'Site tagline or slogan', category: 'platform' },
      { key: 'platform_enabled', value: 'true', description: 'Enable/disable the entire platform', category: 'platform' },
      { key: 'community_size_target', value: '10000', description: 'Target community member count', category: 'platform' },
      { key: 'site_url', value: 'https://whatnext.stream', description: 'Main site URL', category: 'platform' },
      { key: 'site_logo_url', value: '/favicon.svg', description: 'Site logo URL', category: 'platform' },
      { key: 'content_moderation_enabled', value: 'true', description: 'Enable content moderation features', category: 'content' },
      { key: 'media_upload_enabled', value: 'true', description: 'Allow media uploads', category: 'content' },
      { key: 'max_media_size_mb', value: '100', description: 'Maximum media file size in MB', category: 'content' },
      { key: 'content_auto_publish', value: 'false', description: 'Auto-publish new content without review', category: 'content' },
      { key: 'seo_enabled', value: 'true', description: 'Enable SEO optimizations', category: 'content' },
      { key: 'analytics_enabled', value: 'true', description: 'Enable analytics tracking', category: 'analytics' },
      { key: 'visitor_tracking_enabled', value: 'true', description: 'Track visitor analytics', category: 'analytics' },
      { key: 'performance_monitoring_enabled', value: 'true', description: 'Enable performance monitoring', category: 'analytics' },
      { key: 'analytics_retention_days', value: '90', description: 'Days to retain analytics data', category: 'analytics' },
      { key: 'realtime_analytics_enabled', value: 'true', description: 'Enable real-time analytics updates', category: 'analytics' },
      { key: 'pumpfun_integration_enabled', value: 'true', description: 'Enable PumpFun token integration', category: 'integrations' },
      { key: 'social_media_enabled', value: 'true', description: 'Enable social media integrations', category: 'integrations' },
      { key: 'api_rate_limiting_enabled', value: 'true', description: 'Enable API rate limiting', category: 'integrations' },
      { key: 'webhook_enabled', value: 'true', description: 'Enable webhook notifications', category: 'integrations' },
      { key: 'third_party_apis_enabled', value: 'true', description: 'Enable third-party API integrations', category: 'integrations' },
      { key: 'admin_login_enabled', value: 'true', description: 'Allow admin login access', category: 'security' },
      { key: 'session_timeout_hours', value: '2', description: 'Admin session timeout in hours', category: 'security' },
      { key: 'security_logging_enabled', value: 'true', description: 'Enable security event logging', category: 'security' },
      { key: 'two_factor_auth_enabled', value: 'false', description: 'Enable two-factor authentication', category: 'security' },
      { key: 'password_min_length', value: '8', description: 'Minimum password length', category: 'security' },
      { key: 'database_connection_pooling', value: 'true', description: 'Enable database connection pooling', category: 'advanced' },
      { key: 'cache_enabled', value: 'true', description: 'Enable application caching', category: 'advanced' },
      { key: 'background_jobs_enabled', value: 'true', description: 'Enable background job processing', category: 'advanced' },
      { key: 'debug_mode_enabled', value: 'false', description: 'Enable debug mode for development', category: 'advanced' },
      { key: 'maintenance_mode_enabled', value: 'false', description: 'Enable maintenance mode', category: 'advanced' },
      { key: 'api_version', value: '1.0', description: 'Current API version', category: 'advanced' }
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
      message: `Successfully force-populated ${newSettings?.length || 0} default settings`,
      total_count: newSettings?.length || 0,
      categories: categoryCount,
      action: 'force-populate'
    });
  } catch (error) {
    console.error('Error force-populating settings:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to force-populate settings' });
  }
});

module.exports = router;

