const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Basic health check routes
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'WhatNext Backend API - Railway Deployment',
    timestamp: new Date().toISOString(),
    platform: 'Railway',
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    platform: 'Railway',
    database: {
      connected: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
    }
  });
});

app.get('/api', (req, res) => {
  res.json({
    message: 'WhatNext API is operational',
    endpoints: {
      health: '/health',
      claim: '/api/claim',
      giveaway: '/api/giveaway',
      stats: '/api/stats',
      locations: '/api/locations',
      admin: '/api/admin/*'
    },
    timestamp: new Date().toISOString()
  });
});

// Load and mount API routes safely
const routes = [
  { path: '/api/claim', file: './api/claim.js' },
  { path: '/api/giveaway', file: './api/giveaway.js' },
  { path: '/api/stats', file: './api/stats.js' },
  { path: '/api/locations', file: './api/locations.js' },
  { path: '/api/metadata', file: './api/metadata.js' },
  { path: '/api/media', file: './api/media.js' },
  { path: '/api/testimonials', file: './api/testimonials.js' },
  { path: '/api/roadmap', file: './api/roadmap.js' },
  { path: '/api/schedules', file: './api/schedules.js' },
  { path: '/api/debug', file: './api/debug.js' }
];

let loadedRoutes = 0;
routes.forEach(route => {
  try {
    const router = require(route.file);
    if (router) {
      app.use(route.path, router);
      console.log(`✅ Loaded route: ${route.path}`);
      loadedRoutes++;
    }
  } catch (error) {
    console.log(`⚠️ Could not load route ${route.path}:`, error.message);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString(),
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
    availableRoutes: routes.map(r => r.path)
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 WhatNext Backend running on port ${PORT}`);
  console.log(`✅ Successfully loaded ${loadedRoutes}/${routes.length} API routes`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
