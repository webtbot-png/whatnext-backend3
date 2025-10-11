const express = require('express');
const cors = require('cors');

// Create Express app
const app = express();

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'WhatNext Backend API - Vercel Deployment',
    timestamp: new Date().toISOString(),
    platform: 'Vercel',
    version: '1.0.1'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    platform: 'Vercel'
  });
});

app.get('/api', (req, res) => {
  res.json({
    message: 'WhatNext API is operational',
    endpoints: ['/', '/health', '/api'],
    timestamp: new Date().toISOString()
  });
});

// Test database connection endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    // Basic test without complex imports
    res.json({
      status: 'Database connection test',
      environment: {
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseKey: !!process.env.SUPABASE_ANON_KEY,
        nodeEnv: process.env.NODE_ENV
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Database test failed',
      message: error.message
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
