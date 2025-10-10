const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Debug API working',
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV,
      hasDatabase: !!process.env.SUPABASE_URL
    }
  });
});

module.exports = router;
