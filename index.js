const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./database.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initializeDatabase().catch(console.error);

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://whatnext.fun'
  ],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'WhatNext Backend API - LIVE ON RAILWAY with ALL APIs!',
    timestamp: new Date().toISOString(),
    platform: 'Railway',
    endpoints: '77+ API endpoints active'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    platform: 'Railway'
  });
});

// Helper function to load a single route
const loadRoute = (route, loadedRoutes, routeType = '') => {
  try {
    const router = require(route.file);
    app.use(route.path, router);
    loadedRoutes.count++;
    console.log(`✅ Loaded ${routeType}route: ${route.path}`);
    return true;
  } catch (error) {
    console.log(`⚠️ Could not load ${routeType}route ${route.path}:`, error.message);
    return false;
  }
};

// Helper function to load routes array
const loadRoutesArray = (routes, loadedRoutes, routeType = '') => {
  routes.forEach(route => loadRoute(route, loadedRoutes, routeType));
};

// Get route definitions
const getRouteDefinitions = () => {
  const workingRoutes = [
    { path: '/api/stats', file: './api/stats.js' },
    { path: '/api/locations', file: './api/locations.js' },
    { path: '/api/debug', file: './api/debug.js' }
  ];

  const originalRoutes = [
    // Main API files
    { path: '/api/claim', file: './api/claim.js' },
    { path: '/api/giveaway', file: './api/giveaway.js' },
    { path: '/api/locations', file: './api/locations.js' },
    { path: '/api/media', file: './api/media.js' },
    { path: '/api/metadata', file: './api/metadata.js' },
    { path: '/api/qr-codes', file: './api/qr-codes.js' },
    { path: '/api/raw-db', file: './api/raw-db.js' },
    { path: '/api/roadmap', file: './api/roadmap.js' },
    { path: '/api/schedules', file: './api/schedules.js' },
    { path: '/api/seed', file: './api/seed.js' },
    { path: '/api/stats', file: './api/stats.js' },
    { path: '/api/testimonials', file: './api/testimonials.js' },
    { path: '/api/video-test', file: './api/video-test.js' },
    { path: '/api/claim-validation', file: './api/claim-validation.js' },
    { path: '/api/debug', file: './api/debug.js' },
    
    // Directory routes with index files (these handle all sub-routes internally)
    { path: '/api/admin', file: './api/admin/index.js' },
    { path: '/api/analytics', file: './api/analytics/index.js' },
    { path: '/api/pumpfun', file: './api/pumpfun/index.js' },
    
    // Other specific routes
    { path: '/api/bunny-net', file: './api/bunny-net/bunny.js' },
    { path: '/api/claim/validate', file: './api/claim/validate.js' },
    { path: '/api/ecosystem/data', file: './api/ecosystem/data.js' },
    { path: '/api/ecosystem/fees', file: './api/ecosystem/fees.js' },
    { path: '/api/ecosystem/pumpfun-fees', file: './api/ecosystem/pumpfun-fees.js' },
    { path: '/api/ecosystem/spend', file: './api/ecosystem/spend.js' },
    { path: '/api/ecosystem/wallet', file: './api/ecosystem/wallet.js' },
    { path: '/api/giveaway/winners', file: './api/giveaway/winners.js' },
    { path: '/api/media/track-view', file: './api/media/track-view.js' },
    { path: '/api/pumpfun/data', file: './api/pumpfun/data.js' },
    { path: '/api/pumpfun/stats', file: './api/pumpfun/stats.js' },
    { path: '/api/pumpfun/token-data', file: './api/pumpfun/token-data.js' },
    { path: '/api/roadmap/status', file: './api/roadmap/status.js' },
    { path: '/api/roadmap/tasks', file: './api/roadmap/tasks.js' },
    { path: '/api/settings/public', file: './api/settings/public.js' },
    { path: '/api/social/auto-update', file: './api/social/auto-update.js' },
    { path: '/api/social/community-tweets', file: './api/social/community-tweets.js' },
    { path: '/api/social/twitter-followers', file: './api/social/twitter-followers.js' },
    { path: '/api/twitter/stats', file: './api/twitter/stats.js' }
  ];

  return { workingRoutes, originalRoutes };
};

// Mount ALL API routes with error handling
const mountRoutes = () => {
  try {
    const loadedRoutes = { count: 0 };
    const { workingRoutes, originalRoutes } = getRouteDefinitions();
    
    // Load working routes first
    loadRoutesArray(workingRoutes, loadedRoutes, 'working ');
    
    // Load original routes
    loadRoutesArray(originalRoutes, loadedRoutes, 'original ');

    console.log(`✅ Successfully loaded ${loadedRoutes.count} API routes`);
  } catch (error) {
    console.log('⚠️ Error during route mounting:', error.message);
  }
};

// Mount all routes
mountRoutes();

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WhatNext Backend running on port ${PORT} with ALL APIs`);
});

module.exports = app;
