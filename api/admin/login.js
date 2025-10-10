const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'whatnext-jwt-secret-2025';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'WhatNext2025Admin!';

// POST /api/admin/login
router.post('/', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    // Generate JWT token
    const token = jwt.sign(
      {
        admin: true,
        timestamp: Date.now()
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    return res.json({
      success: true,
      token,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

