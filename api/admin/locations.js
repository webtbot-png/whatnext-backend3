const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'whatnext-jwt-secret-2025';

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.substring(7);
  jwt.verify(token, JWT_SECRET);
}

// GET /api/admin/locations
router.get('/', (req, res) => {
  console.log('🔍 Admin locations API - returning world countries for autocomplete');
  // This endpoint now serves world countries for location autocomplete, not hardcoded locations
  // The world countries data comes from world-atlas package via the frontend
  console.log('✅ Admin locations endpoint active - world countries will be loaded by frontend');
  res.json({
    message: 'Admin locations endpoint active - use world countries autocomplete',
    info: 'World countries loaded via @types/world-atlas package on frontend'
  });
});

// POST /api/admin/locations
router.post('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { name, country, country_iso3, lat, lng, status, summary, description, tags, slug } = req.body;
    if (!name || !lat || !lng) {
      return res.status(400).json({ success: false, error: 'Name, latitude, and longitude are required' });
    }
    const supabase = getSupabaseAdminClient();
    // Check if location already exists
    const { data: existing } = await supabase
      .from('locations')
      .select('id, name')
      .eq('name', name)
      .single();
    if (existing) {
      console.log(`📍 Location ${name} already exists, returning existing ID: ${existing.id}`);
      return res.json({ success: true, location: existing, message: `Location ${name} already exists` });
    }
    console.log('📍 Creating location with data:', {
      name,
      country: country || name,
      country_iso3: country_iso3 || '',
      lat: parseFloat(lat),
      lng: parseFloat(lng)
    });
    // Create new location
    const { data: location, error } = await supabase
      .from('locations')
      .insert({
        name,
        country: country || name,
        country_iso3: country_iso3 || '',
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        status: status || 'planned',
        summary: summary || `${name} location`,
        description: description || `Location entry for ${name}`,
        tags: tags || ['country'],
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      })
      .select()
      .single();
    if (error) {
      console.error('Error creating location:', error);
      throw error;
    }
    console.log(`✅ Created new location: ${name} (ID: ${location.id})`);
    return res.status(201).json({ success: true, location, message: `Location ${name} created successfully` });
  } catch (error) {
    console.error('Error in POST /admin/locations:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ success: false, error: 'Failed to create location' });
  }
});

module.exports = router;

