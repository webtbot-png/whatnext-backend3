const express = require('express');
const router = express.Router();

// Mount all admin routes
try {
  router.use('/login', require('./login.js'));
  router.use('/dashboard', require('./dashboard.js'));
  router.use('/users', require('./users.js'));
  router.use('/settings', require('./settings.js'));
  router.use('/analytics', require('./analytics.js'));
  router.use('/content', require('./content.js'));
  router.use('/media', require('./media.js'));
  router.use('/upload', require('./upload.js'));
  router.use('/giveaway', require('./giveaway.js'));
  router.use('/giveaway-process', require('./giveaway-process.js'));
  router.use('/giveaway-payout', require('./giveaway-payout.js'));
  router.use('/claims', require('./claims.js'));
  router.use('/stats', require('./stats.js'));
  router.use('/roadmap', require('./roadmap.js'));
  router.use('/schedules', require('./schedules.js'));
  router.use('/locations', require('./locations.js'));
  router.use('/social', require('./social.js'));
  router.use('/pumpfun', require('./pumpfun.js'));
  router.use('/live-stream', require('./live-stream.js'));
  router.use('/toggle-live', require('./toggle-live.js'));
  router.use('/add-password', require('./add-password.js'));
  router.use('/api-config', require('./api-config.js'));
  router.use('/populate-settings', require('./populate-settings.js'));
  router.use('/force-populate-settings', require('./force-populate-settings.js'));
  router.use('/dividend-trigger', require('./dividend-trigger.js'));
  
  console.log('✅ All admin routes loaded');
} catch (error) {
  console.log('⚠️ Some admin routes failed to load:', error.message);
}

// Mount ecosystem separately to ensure it loads even if other routes fail
try {
  router.use('/ecosystem', require('./ecosystem.js'));
  console.log('✅ Ecosystem routes loaded successfully');
} catch (error) {
  console.error('❌ Failed to load ecosystem routes:', error);
}

// Health check for admin
router.get('/', (req, res) => {
  res.json({
    message: 'Admin API operational',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      '/login', '/dashboard', '/users', '/settings', '/analytics',
      '/content', '/media', '/upload', '/giveaway', '/claims', '/stats',
      '/ecosystem', '/ecosystem/spend', '/dividend-trigger'
    ]
  });
});

module.exports = router;
