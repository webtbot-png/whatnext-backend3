const express = require('express');
const router = express.Router();

/**
 * GET /api/admin/ecosystem/spend
 * Get ecosystem spending data for admin dashboard - REDIRECTS TO UNIFIED API
 * This ensures both admin panel and public ecosystem page show the same data
 */
router.get('/', async (req, res) => {
  try {
    console.log('🔍 Admin ecosystem/spend: Fetching spending data...');

    // **REDIRECT TO UNIFIED API - ONE SOURCE OF TRUTH**
    // Call the same unified API that public ecosystem page uses
    const response = await fetch('https://whatnext-backend3-production.up.railway.app/api/ecosystem/spend', {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`Unified API returned ${response.status}`);
    }

    const data = await response.json();
    
    console.log(`✅ Admin ecosystem/spend: Retrieved ${data.entries?.length || 0} spending entries`);
    
    // Return the exact same data structure
    return res.json(data);

  } catch (error) {
    console.error('❌ Error calling unified ecosystem API:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch spending data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;

