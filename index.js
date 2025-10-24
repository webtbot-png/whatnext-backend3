const express = require('express');
const cors = require('cors');
const path = require('node:path');
// Resolve database module path using __dirname to avoid MODULE_NOT_FOUND when running in containers
const _dbPath = path.join(__dirname, 'database.js');
const { initializeDatabase } = require(_dbPath);
const { startDividendCron } = require('./api/services/dividend-cron.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: true, // Allow all origins for debugging
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control', 'Pragma', 'Expires']
}));

// UPLOAD ROUTE - MOUNTED FIRST TO BYPASS ALL MIDDLEWARE
app.use('/api/admin/upload', require('./api/admin/upload.js'));

// Middleware - EXCLUDE upload routes from JSON parsing (except credentials and upload-tracking)
app.use((req, res, next) => {
  // Allow JSON parsing for credentials endpoint
  if (req.path.includes('/upload/credentials')) {
    return express.json({ limit: '50gb' })(req, res, next);
  }
  // Allow JSON parsing for upload-tracking endpoints (they handle JSON, not files)
  if (req.path.includes('/upload-tracking')) {
    return express.json({ limit: '50gb' })(req, res, next);
  }
  // Skip JSON parsing for file upload routes only
  if (req.path.includes('/upload') || req.url.includes('/upload')) {
    return next();
  }
  // Apply JSON parsing to all other routes
  express.json({ limit: '50gb' })(req, res, next);
});

app.use((req, res, next) => {
  // Allow URL encoding for credentials endpoint
  if (req.path.includes('/upload/credentials')) {
    return express.urlencoded({ extended: true, limit: '50gb' })(req, res, next);
  }
  // Allow URL encoding for upload-tracking endpoints (they handle JSON, not files)
  if (req.path.includes('/upload-tracking')) {
    return express.urlencoded({ extended: true, limit: '50gb' })(req, res, next);
  }
  // Skip URL encoding for file upload routes only
  if (req.path.includes('/upload') || req.url.includes('/upload')) {
    return next();
  }
  // Apply URL encoding to all other routes
  express.urlencoded({ extended: true, limit: '50gb' })(req, res, next);
});

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
    // Silent route loading - only log failures
    const fs = require('node:fs');
    const path = require('node:path');
    const fullPath = path.resolve(route.file);
    
    if (fs.existsSync(fullPath)) {
      const router = require(route.file);
      
      if (router) {
        app.use(route.path, router);
        loadedRoutes.count++;
        return true;
      } else {
        console.log(`❌ Router is null/undefined: ${route.path}`);
        return false;
      }
    } else {
      console.log(`❌ File does not exist: ${fullPath}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ FAILED to load ${routeType}route ${route.path}:`, error.message);
    return false;
  }
};

// Helper function to load routes array
const loadRoutesArray = (routes, loadedRoutes, routeType = '') => {
  for (const route of routes) {
    loadRoute(route, loadedRoutes, routeType);
  }
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
    { path: '/api/dividends', file: './api/dividends.js' },
    
    // Directory routes with index files
    { path: '/api/admin', file: './api/admin/index.js' },
    { path: '/api/analytics', file: './api/analytics/index.js' },
    { path: '/api/ecosystem', file: './api/ecosystem/index.js' },
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
    { path: '/api/admin/upload-tracking', file: './api/admin/upload-tracking.js' },
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
    { path: '/api/social/leaderboard', file: './api/social/leaderboard.js' },
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
    
    // Load working routes first (silent)
    loadRoutesArray(workingRoutes, loadedRoutes, 'working ');
    
    // Load original routes (silent)
    loadRoutesArray(originalRoutes, loadedRoutes, 'original ');

    console.log(`✅ Loaded ${loadedRoutes.count} API routes`);
    
    // Verify critical dividends router
    const dividendsRoute = { path: '/api/dividends', file: './api/dividends.js' };
    const dividendsLoaded = loadRoute(dividendsRoute, loadedRoutes, 'CRITICAL ');
    
    if (dividendsLoaded === false) {
      console.error(`🚨 CRITICAL: Dividends router failed to load!`);
    }
    
  } catch (error) {
    console.log('⚠️ Error during route mounting:', error.message);
  }
};

// Mount all routes
mountRoutes();

// Add a test endpoint to verify dividends routes are mounted
app.get('/api/test-dividends', (req, res) => {
  res.json({
    message: 'Dividends test endpoint',
    timestamp: new Date().toISOString(),
    dividendsRoutesMounted: true
  });
});

// Serve static files from the React build
const frontendPath = path.join(__dirname, '..', '..', 'dist');
app.use(express.static(frontendPath));

// Serve React app for all non-API routes (SPA fallback)
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  // Serve React app (silent)
  const indexPath = path.join(frontendPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`❌ Error serving React app:`, err);
      res.status(500).json({
        error: 'Frontend not found',
        message: 'Could not serve React application',
        path: req.path
      });
    }
  });
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

// 404 handler for API routes only
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    error: 'API Not Found',
    message: `API route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Initialize and start server function
async function startServer() {
  try {
    await initializeDatabase();
    console.log('✅ Database initialized successfully');
    
    // Start dividend auto-claim system
    try {
      startDividendCron();
      console.log('✅ Dividend cron system started');
    } catch (dividendError) {
      console.error('❌ Failed to start dividend cron system:', dividendError.message);
      console.log('⚠️ Server will continue without dividend auto-claiming');
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  }
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 WhatNext Backend running on port ${PORT} with ALL APIs`);
  });
}

// Start the server
// eslint-disable-next-line sonarjs/prefer-top-level-await
startServer();

module.exports = app;
