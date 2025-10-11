const express = require('express');
const router = express.Router();

// API Health check
router.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'WhatNext API - All endpoints operational',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: [
      '/claim', '/giveaway', '/locations', '/media', '/metadata',
      '/qr-codes', '/raw-db', '/roadmap', '/schedules', '/seed',
      '/stats', '/testimonials', '/video-test', '/claim-validation',
      '/debug', '/admin/*', '/analytics/*', '/ecosystem/*', 
      '/pumpfun/*', '/settings/*', '/social/*'
    ]
  });
});

// Mount main API routes
try {
  // Core API routes
  router.use('/claim', require('./claim.js'));
  router.use('/giveaway', require('./giveaway.js'));
  router.use('/locations', require('./locations.js'));
  router.use('/media', require('./media.js'));
  router.use('/metadata', require('./metadata.js'));
  router.use('/qr-codes', require('./qr-codes.js'));
  router.use('/raw-db', require('./raw-db.js'));
  router.use('/roadmap', require('./roadmap.js'));
  router.use('/schedules', require('./schedules.js'));
  router.use('/seed', require('./seed.js'));
  router.use('/stats', require('./stats.js'));
  router.use('/testimonials', require('./testimonials.js'));
  router.use('/video-test', require('./video-test.js'));
  router.use('/claim-validation', require('./claim-validation.js'));
  router.use('/debug', require('./debug.js'));
  
  // Directory-based routes with index files
  router.use('/admin', require('./admin/index.js'));
  router.use('/analytics', require('./analytics/index.js'));
  router.use('/ecosystem', require('./ecosystem/index.js'));
  router.use('/pumpfun', require('./pumpfun/index.js'));
  router.use('/settings', require('./settings/index.js'));
  router.use('/social', require('./social/index.js'));
  
  console.log('✅ All main API routes loaded in api/index.js');
} catch (error) {
  console.log('⚠️ Some API routes failed to load:', error.message);
}

module.exports = router;
