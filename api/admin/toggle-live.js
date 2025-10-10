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

router.post('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { locationId, isLive } = req.body;
    if (!locationId) {
      return res.status(400).json({ error: 'Location ID is required' });
    }
    const supabase = getSupabaseAdminClient();
    const newStatus = isLive ? 'live' : 'visited';
    const { data, error } = await supabase
      .from('locations')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', locationId)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }
    return res.json({
      success: true,
      message: `Location ${isLive ? 'set to live' : 'set to offline'}`,
      location: data[0],
      status: newStatus
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to toggle live status' });
  }
});

module.exports = router;

