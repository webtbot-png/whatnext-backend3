const express = require('express');
const { getCurrentSolPrice } = require('../../utils/sol-price.js');

const router = express.Router();

/**
 * GET /api/ecosystem/sol-price
 * Dedicated endpoint for getting SOL price with robust error handling
 */
router.get('/', async (req, res) => {
  console.log('💰 SOL Price API request received');
  
  try {
    // Set CORS and cache headers immediately
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    res.header('Content-Type', 'application/json');
    
    // Fetch SOL price with timeout
    const solPricePromise = getCurrentSolPrice();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('SOL price fetch timeout')), 15000);
    });
    
    const solPrice = await Promise.race([solPricePromise, timeoutPromise]);
    
    if (!solPrice || typeof solPrice !== 'number' || solPrice <= 0) {
      console.warn('⚠️ Invalid SOL price received, using fallback');
      return res.json({
        solPrice: 200,
        timestamp: new Date().toISOString(),
        source: 'fallback',
        warning: 'Using fallback price due to invalid data from price APIs'
      });
    }
    
    const response = {
      solPrice: Number(solPrice.toFixed(2)),
      timestamp: new Date().toISOString(),
      source: 'live-api',
      success: true
    };
    
    console.log(`✅ SOL Price API response: $${response.solPrice}`);
    return res.json(response);
    
  } catch (error) {
    console.error('❌ SOL Price API error:', error);
    
    // Always return valid JSON even on error
    const fallbackResponse = {
      solPrice: 200,
      timestamp: new Date().toISOString(),
      source: 'fallback',
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    };
    
    console.log(`⚠️ SOL Price API fallback response: $${fallbackResponse.solPrice}`);
    return res.json(fallbackResponse);
  }
});

// Handle OPTIONS requests for CORS preflight
router.options('/', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.status(200).end();
});

module.exports = router;
