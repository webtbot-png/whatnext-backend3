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
    message: 'WhatNext Backend API - Railway Deployment with ALL ADMIN ROUTES',
    timestamp: new Date().toISOString(),
    platform: 'Railway',
    version: '2.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    platform: 'Railway'
  });
});

app.get('/api', (req, res) => {
  res.json({
    message: 'WhatNext API is operational',
    endpoints: ['/', '/health', '/api', '/api/admin/ecosystem', '/api/admin/ecosystem/spend'],
    timestamp: new Date().toISOString()
  });
});

// Import and mount admin routes
try {
  // Mount admin routes first (before wildcard routes)
  const adminRoutes = require('./admin/index.js');
  app.use('/api/admin', adminRoutes);
  console.log('✅ Loaded admin routes including ecosystem');
} catch (error) {
  console.error('❌ Failed to load admin routes:', error);
}

// Import other essential routes
try {
  const qrRoutes = require('./qr-codes.js');
  app.use('/api/qr-codes', qrRoutes);
  console.log('✅ Loaded QR codes routes');
} catch (error) {
  console.error('❌ Failed to load QR routes:', error);
}

try {
  const statsRoutes = require('./stats.js');
  app.use('/api/stats', statsRoutes);
  console.log('✅ Loaded stats routes');
} catch (error) {
  console.error('❌ Failed to load stats routes:', error);
}

try {
  const locationsRoutes = require('./locations.js');
  app.use('/api/locations', locationsRoutes);
  console.log('✅ Loaded locations routes');
} catch (error) {
  console.error('❌ Failed to load locations routes:', error);
}

try {
  const ecosystemRoutes = require('./ecosystem/index.js');
  app.use('/api/ecosystem', ecosystemRoutes);
  console.log('✅ Loaded ecosystem routes');
} catch (error) {
  console.error('❌ Failed to load ecosystem routes:', error);
}

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
