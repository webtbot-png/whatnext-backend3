const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { password, permission_level, description } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    if (!permission_level || !['full', 'restricted'].includes(permission_level)) {
      return res.status(400).json({ error: 'Permission level must be "full" or "restricted"' });
    }
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('admin_passwords')
      .insert({
        password_hash: password,
        permission_level: permission_level,
        description: description || `Admin with ${permission_level} permissions`,
        is_active: true
      })
      .select();
    if (error) {
      if (error.code === '23505') {
        console.error('Add password error: Password already exists');
        return res.status(400).json({ error: 'Password already exists' });
      }
      console.error('Add password error:', error);
      return res.status(500).json({ error: error.message });
    }
    return res.json({
      success: true,
      message: 'Password added successfully',
      password_info: {
        permission_level: data[0].permission_level,
        description: data[0].description,
        created_at: data[0].created_at
      }
    });
  } catch (error) {
    console.error('Add password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

