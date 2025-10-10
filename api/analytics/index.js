const express = require('express');
const router = express.Router();

// Mount all analytics routes
try {
  router.use('/live', require('./live.js'));
  router.use('/performance', require('./performance.js'));
  router.use('/realtime', require('./realtime.js'));
  router.use('/track-event', require('./track-event.js'));
  router.use('/track-pageview', require('./track-pageview.js'));
  router.use('/track-visitor', require('./track-visitor.js'));
  router.use('/update-pageview', require('./update-pageview.js'));
  
  console.log('✅ All analytics routes loaded');
} catch (error) {
  console.log('⚠️ Some analytics routes failed to load:', error.message);
}

// Health check for analytics
router.get('/', (req, res) => {
  res.json({
    message: 'Analytics API operational',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      '/live', '/performance', '/realtime', '/track-event',
      '/track-pageview', '/track-visitor', '/update-pageview'
    ]
  });
});

module.exports = router;