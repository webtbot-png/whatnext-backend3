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

// GET /api/admin/live-stream
router.get('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { data: streamSettings, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['live_stream_url', 'stream_title', 'stream_description', 'rtmp_key', 'rtmp_server']);
    if (error) throw error;
    const settings = {};
    (streamSettings || []).forEach(setting => {
      settings[setting.key] = setting.value;
    });
    return res.json({
      success: true,
      url: settings.live_stream_url || '',
      title: settings.stream_title || '',
      description: settings.stream_description || '',
      rtmpKey: settings.rtmp_key || '',
      rtmpServer: settings.rtmp_server || 'rtmp://ingest.pump.fun/live/'
    });
  } catch (error) {
    console.error('Error getting live stream:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/live-stream
router.post('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { url, title, description, rtmpKey, rtmpServer } = req.body;
    const supabase = getSupabaseAdminClient();
    const settingsToUpsert = [
      { key: 'live_stream_url', value: url || '', description: 'Live stream URL for viewers' },
      { key: 'stream_title', value: title || '', description: 'Live stream title' },
      { key: 'stream_description', value: description || '', description: 'Live stream description' },
      { key: 'rtmp_key', value: rtmpKey || '', description: 'RTMP stream key for broadcasting' },
      { key: 'rtmp_server', value: rtmpServer || 'rtmp://ingest.pump.fun/live/', description: 'RTMP server URL' }
    ];
    const { error } = await supabase
      .from('app_settings')
      .upsert(settingsToUpsert, { onConflict: 'key' });
    if (error) throw error;
    return res.json({ success: true, message: 'Live stream settings updated successfully', url, title, description, rtmpKey, rtmpServer });
  } catch (error) {
    console.error('Error updating live stream:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to update live stream settings' });
  }
});

// DELETE /api/admin/live-stream
router.delete('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('app_settings')
      .update({ value: '' })
      .in('key', ['live_stream_url', 'stream_title', 'stream_description', 'rtmp_key']);
    if (error) throw error;
    return res.json({ success: true, message: 'Live stream settings cleared successfully' });
  } catch (error) {
    console.error('Error clearing live stream:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to clear live stream settings' });
  }
});

module.exports = router;

