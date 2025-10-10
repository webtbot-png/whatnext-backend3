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

// GET /api/admin/media
router.get('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { data: media, error } = await supabase
      .from('media')
      .select(`
        id,
        location_id,
        type,
        title,
        url,
        thumbnail,
        view_count,
        is_featured,
        created_at
      `)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching media:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch media' });
    }
    // Get location data separately to avoid relationship issues
    const locationIds = media?.map(m => m.location_id).filter(Boolean) || [];
    let locationsMap = new Map();
    if (locationIds.length > 0) {
      const { data: locations } = await supabase
        .from('locations')
        .select('id, name, country_iso3')
        .in('id', locationIds);
      if (locations) {
        locationsMap = new Map(locations.map(loc => [loc.id, loc]));
      }
    }
    // Combine media with location data
    const mediaWithLocations = media?.map(item => ({
      ...item,
      location: item.location_id ? locationsMap.get(item.location_id) : null
    }));
    return res.json(mediaWithLocations ?? []);
  } catch (error) {
    console.error('Error fetching media:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// POST /api/admin/media
router.post('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const body = req.body;
    const { location_id, type, title, description, url, thumbnail, duration, metadata } = body;
    // Validate required fields
    if (!location_id || !type || !title || !url) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const supabase = getSupabaseAdminClient();
    const { data: media, error } = await supabase
      .from('media')
      .insert({
        location_id,
        type,
        title,
        description,
        url,
        thumbnail,
        duration,
        metadata: metadata || {}
      })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json(media);
  } catch (error) {
    console.error('Error creating media:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to create media' });
  }
});

module.exports = router;

