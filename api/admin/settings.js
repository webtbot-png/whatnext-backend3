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

// GET /api/admin/settings
router.get('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { data: settings, error } = await supabase
      .from('app_settings')
      .select('*')
      .order('key', { ascending: true });
    if (error) throw error;
    return res.json(settings || []);
  } catch (error) {
    console.error('Error fetching settings:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /api/admin/settings
router.post('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const body = req.body;
    const { key, value, description } = body;
    if (!key || !value) {
      return res.status(400).json({ error: 'Key and value are required' });
    }
    const supabase = getSupabaseAdminClient();
    const { data: setting, error } = await supabase
      .from('app_settings')
      .insert({ key, value, description: description || '' })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json(setting);
  } catch (error) {
    console.error('Error creating setting:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to create setting' });
  }
});

// PUT /api/admin/settings
router.put('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const body = req.body;
    const { id, key, value, description } = body;
    if (!key && !value && !description && !id) {
      return res.status(400).json({ error: 'At least one field is required to update' });
    }
    const supabase = getSupabaseAdminClient();
    let updateData = { updated_at: new Date().toISOString() };
    if (key) updateData.key = key;
    if (value !== undefined) updateData.value = value;
    if (description !== undefined) updateData.description = description;
    const { data: setting, error } = await supabase
      .from('app_settings')
      .update(updateData)
      .eq(id ? 'id' : 'key', id || key)
      .select()
      .single();
    if (error) throw error;
    return res.json(setting);
  } catch (error) {
    console.error('Error updating setting:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to update setting' });
  }
});

// DELETE /api/admin/settings
router.delete('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'Setting ID is required' });
    }
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('app_settings')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return res.json({ success: true, message: 'Setting deleted successfully' });
  } catch (error) {
    console.error('Error deleting setting:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to delete setting' });
  }
});

module.exports = router;

