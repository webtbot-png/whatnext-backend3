const express = require('express');
const giveawayRouter = require('./giveaway');
const claimsRouter = require('./claims');
const addPasswordRouter = require('./add-password');
const analyticsRouter = require('./analytics');
const settingsRouter = require('./settings');
const contentRouter = require('./content');
const usersRouter = require('./users');
const uploadRouter = require('./upload');
const toggleLiveRouter = require('./toggle-live');
const ecosystemRouter = require('./ecosystem');
const liveStreamRouter = require('./live-stream');
const locationsRouter = require('./locations');

const router = express.Router();


// 404 handler for unknown admin routes
router.use((req, res, next) => {
  res.status(404).json({ error: 'Admin route not found' });
});

// Error handling middleware for admin API
router.use((err, req, res, next) => {
  console.error('Admin API error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;

