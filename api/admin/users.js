const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');

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

router.get('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { data: users, error } = await supabase
      .from('admin_users')
      .select('id, email, role, is_active, last_login, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(users || []);
  } catch (error) {
    console.error('Error fetching admin users:', error);
    return res.status(500).json({ error: 'Failed to fetch admin users' });
  }
});

router.post('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const body = req.body;
    const { email, password, role } = body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const hashedPassword = await bcryptjs.hash(password, 12);
    const supabase = getSupabaseAdminClient();
    const { data: user, error } = await supabase
      .from('admin_users')
      .insert({
        email,
        password_hash: hashedPassword,
        role: role || 'admin'
      })
      .select('id, email, role, is_active, created_at')
      .single();
    if (error) throw error;
    return res.status(201).json(user);
  } catch (error) {
    console.error('Error creating admin user:', error);
    return res.status(500).json({ error: 'Failed to create admin user' });
  }
});

module.exports = router;

