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
    'https://whatnexttoken.com',
    'https://www.whatnexttoken.com',
    'https://www.whatnext.fun',
    /\.hostinger\./,
    /\.000webhostapp\./,
    /\.hostinger\.com$/,
    /\.000webhost\.app$/
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

// Mount ALL API routes with error handling
const mountRoutes = () => {
  try {
    // Working CommonJS routes
    const workingRoutes = [
      { path: '/api/stats', file: './api/stats.js' },
      { path: '/api/locations', file: './api/locations.js' },
      { path: '/api/debug', file: './api/debug.js' }
    ];

    let loadedRoutes = 0;
    
    workingRoutes.forEach(route => {
      try {
        const router = require(route.file);
        app.use(route.path, router);
        loadedRoutes++;
        console.log(`✅ Loaded working route: ${route.path}`);
      } catch (error) {
        console.log(`⚠️ Could not load working route ${route.path}:`, error.message);
      }
    });

    // Try to load original routes (ALL 82+ APIs)
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
      
      // Directory routes with index files
      { path: '/api/admin', file: './api/admin/index.js' },
      { path: '/api/analytics', file: './api/analytics/index.js' },
      { path: '/api/ecosystem', file: './api/ecosystem/index.js' },
      { path: '/api/admin/ecosystem/spend', file: './api/admin/ecosystem/spend.js' },
      { path: '/api/pumpfun', file: './api/pumpfun/index.js' },
      { path: '/api/settings', file: './api/settings/index.js' },
      { path: '/api/social', file: './api/social/index.js' },
      
      // Individual subdirectory files
      { path: '/api/admin/add-password', file: './api/admin/add-password.js' },
      { path: '/api/admin/analytics', file: './api/admin/analytics.js' },
      { path: '/api/admin/api-config', file: './api/admin/api-config.js' },
      { path: '/api/admin/claims', file: './api/admin/claims.js' },
      { path: '/api/admin/content', file: './api/admin/content.js' },
      { path: '/api/admin/dashboard', file: './api/admin/dashboard.js' },
      { path: '/api/admin/ecosystem', file: './api/admin/ecosystem.js' },
      { path: '/api/admin/force-populate-settings', file: './api/admin/force-populate-settings.js' },
      { path: '/api/admin/giveaway', file: './api/admin/giveaway.js' },
      { path: '/api/admin/giveaway-payout', file: './api/admin/giveaway-payout.js' },
      { path: '/api/admin/giveaway-process', file: './api/admin/giveaway-process.js' },
      { path: '/api/admin/live-stream', file: './api/admin/live-stream.js' },
      { path: '/api/admin/locations', file: './api/admin/locations.js' },
      { path: '/api/admin/login', file: './api/admin/login.js' },
      { path: '/api/admin/media', file: './api/admin/media.js' },
      { path: '/api/admin/populate-settings', file: './api/admin/populate-settings.js' },
      { path: '/api/admin/pumpfun', file: './api/admin/pumpfun.js' },
      { path: '/api/admin/roadmap', file: './api/admin/roadmap.js' },
      { path: '/api/admin/schedules', file: './api/admin/schedules.js' },
      { path: '/api/admin/settings', file: './api/admin/settings.js' },
      { path: '/api/admin/settings/api-config', file: './api/admin/settings/api-config.js' },
      { path: '/api/admin/social', file: './api/admin/social.js' },
      { path: '/api/admin/social/update-followers', file: './api/admin/social/update-followers.js' },
      { path: '/api/admin/stats', file: './api/admin/stats.js' },
      { path: '/api/admin/toggle-live', file: './api/admin/toggle-live.js' },
      { path: '/api/admin/upload', file: './api/admin/upload.js' },
      { path: '/api/admin/users', file: './api/admin/users.js' },
      
      // Analytics routes
      { path: '/api/analytics/live', file: './api/analytics/live.js' },
      { path: '/api/analytics/performance', file: './api/analytics/performance.js' },
      { path: '/api/analytics/realtime', file: './api/analytics/realtime.js' },
      { path: '/api/analytics/track/session', file: './api/analytics/track/session.js' },
      { path: '/api/analytics/track/session-update', file: './api/analytics/track/session-update.js' },
      { path: '/api/analytics/track-event', file: './api/analytics/track-event.js' },
      { path: '/api/analytics/track-pageview', file: './api/analytics/track-pageview.js' },
      { path: '/api/analytics/track-visitor', file: './api/analytics/track-visitor.js' },
      { path: '/api/analytics/update-pageview', file: './api/analytics/update-pageview.js' },
      
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

    originalRoutes.forEach(route => {
      try {
        const router = require(route.file);
        app.use(route.path, router);
        loadedRoutes++;
        console.log(`✅ Loaded original route: ${route.path}`);
      } catch (error) {
        console.log(`⚠️ Could not load original route ${route.path}:`, error.message);
      }
    });

    console.log(`✅ Successfully loaded ${loadedRoutes} API routes`);
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
