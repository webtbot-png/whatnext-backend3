const express = require('express');
const router = express.Router();

// Simple ecosystem overview endpoint - NO RE-MOUNTING OF SUB-ROUTES
router.get('/', async (req, res) => {
  try {
    console.log('GET /api/ecosystem: Starting request...');
    
    res.json({
      success: true,
      message: 'Ecosystem API active',
      endpoints: [
        '/api/ecosystem/fees',
        '/api/ecosystem/spend', 
        '/api/ecosystem/wallet',
        '/api/ecosystem/data',
        '/api/ecosystem/pumpfun-fees'
      ],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Ecosystem index API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;
