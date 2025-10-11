const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'whatnext-jwt-secret-2025';

// Mount the complete spend router with ALL CRUD operations
try {
  const spendRouter = require('./ecosystem/spend.js');
  router.use('/spend', spendRouter);
  console.log('✅ Loaded ecosystem/spend router with DELETE operations');
  console.log('📋 Available spend routes:');
  console.log('   GET    /api/admin/ecosystem/spend');
  console.log('   POST   /api/admin/ecosystem/spend');
  console.log('   DELETE /api/admin/ecosystem/spend/:id');
  console.log('   DELETE /api/admin/ecosystem/spend/bulk');
  console.log('   POST   /api/admin/ecosystem/spend/bulk');
} catch (error) {
  console.error('❌ Failed to load ecosystem/spend router:', error);
}

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.substring(7);
  jwt.verify(token, JWT_SECRET);
}

// Note: /spend routes are now handled by the mounted ./ecosystem/spend.js router above



// GET /api/admin/ecosystem/content
router.get('/content', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('ecosystem_content')
      .select(`
        *,
        location:locations(
          id,
          name,
          country,
          latitude,
          longitude
        )
      `)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching ecosystem content:', error);
      return res.status(500).json({ error: 'Failed to fetch ecosystem content' });
    }
    res.json({
      success: true,
      content: data || []
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error in ecosystem content endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/ecosystem/content
router.post('/content', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const {
      title,
      description,
      content_type,
      url,
      thumbnail_url,
      location_id,
      tags,
      is_featured = false
    } = req.body;
    if (!title || !content_type || !url) {
      return res.status(400).json({
        error: 'Title, content type, and URL are required'
      });
    }
    const validTypes = ['video', 'article', 'livestream', 'podcast', 'image', 'other'];
    if (!validTypes.includes(content_type)) {
      return res.status(400).json({
        error: 'Invalid content type. Must be one of: ' + validTypes.join(', ')
      });
    }
    const contentData = {
      title,
      description,
      content_type,
      url,
      thumbnail_url,
      location_id: location_id || null,
      tags: tags || [],
      is_featured,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('ecosystem_content')
      .insert(contentData)
      .select(`
        *,
        location:locations(
          id,
          name,
          country,
          latitude,
          longitude
        )
      `)
      .single();
    if (error) {
      console.error('Error creating ecosystem content:', error);
      return res.status(500).json({ error: 'Failed to create ecosystem content' });
    }
    res.json({
      success: true,
      message: 'Ecosystem content created successfully',
      data
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error creating ecosystem content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/ecosystem/content/:id
router.patch('/content/:id', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { id } = req.params;
    const updateData = { ...req.body };
    if (!id) {
      return res.status(400).json({ error: 'Content ID is required' });
    }
    if (updateData.content_type) {
      const validTypes = ['video', 'article', 'livestream', 'podcast', 'image', 'other'];
      if (!validTypes.includes(updateData.content_type)) {
        return res.status(400).json({
          error: 'Invalid content type. Must be one of: ' + validTypes.join(', ')
        });
      }
    }
    updateData.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('ecosystem_content')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        location:locations(
          id,
          name,
          country,
          latitude,
          longitude
        )
      `)
      .single();
    if (error) {
      console.error('Error updating ecosystem content:', error);
      return res.status(500).json({ error: 'Failed to update ecosystem content' });
    }
    if (!data) {
      return res.status(404).json({ error: 'Content not found' });
    }
    res.json({
      success: true,
      message: 'Ecosystem content updated successfully',
      data
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error updating ecosystem content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/ecosystem/content/:id
router.delete('/content/:id', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Content ID is required' });
    }
    const { error } = await supabase
      .from('ecosystem_content')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Error deleting ecosystem content:', error);
      return res.status(500).json({ error: 'Failed to delete ecosystem content' });
    }
    res.json({
      success: true,
      message: 'Ecosystem content deleted successfully'
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error deleting ecosystem content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/ecosystem/locations
router.get('/locations', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('locations')
      .select('id, name, country, latitude, longitude')
      .order('name');
    if (error) {
      console.error('Error fetching locations:', error);
      return res.status(500).json({ error: 'Failed to fetch locations' });
    }
    res.json({
      success: true,
      locations: data || []
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error in locations endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

