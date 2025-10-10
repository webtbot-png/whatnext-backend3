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

    // **REDIRECT TO RAILWAY PRODUCTION API - ONE SOURCE OF TRUTH**
    // Call the Railway ecosystem API directly
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

/**
 * DELETE /api/admin/ecosystem/spend/:id
 * Delete a single spending entry
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 Admin: Deleting spending entry ID: ${id}`);

    // Forward delete request to the Railway ecosystem API
    const response = await fetch(`https://whatnext-backend3-production.up.railway.app/api/ecosystem/spend/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ Admin: Delete failed:', data);
      return res.status(response.status).json(data);
    }

    console.log(`✅ Admin: Successfully deleted entry ID: ${id}`);
    return res.json(data);

  } catch (error) {
    console.error('❌ Admin: Error deleting entry:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete spending entry',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/admin/ecosystem/spend/bulk
 * Delete multiple spending entries
 */
router.delete('/bulk', async (req, res) => {
  try {
    const { ids } = req.body;
    console.log(`🔍 Admin: Bulk deleting ${ids?.length || 0} entries`);

    // Forward bulk delete request to the Railway ecosystem API
    const response = await fetch('https://whatnext-backend3-production.up.railway.app/api/ecosystem/spend/bulk', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ids })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ Admin: Bulk delete failed:', data);
      return res.status(response.status).json(data);
    }

    console.log(`✅ Admin: Bulk delete completed - ${data.results?.deleted || 0} deleted, ${data.results?.failed || 0} failed`);
    return res.json(data);

  } catch (error) {
    console.error('❌ Admin: Error in bulk delete:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to bulk delete entries',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;

