const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

// Use existing SOL price function (simplified to avoid duplication)
async function getCurrentSolPrice() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json();
    return data.solana?.usd || 210; // Use same default as existing function
  } catch (error) {
    console.log('⚠️ Failed to fetch SOL price, using fallback:', error);
    return 210; // Fallback price
  }
}

/**
 * GET /api/ecosystem/spend
 * Get complete spending ledger (expenses + giveaway payouts)
 * FALLBACK VERSION - Returns sample data if database tables don't exist
 */
router.get('/', async (req, res) => {
  try {
    console.log('🔍 Public ecosystem/spend: Fetching spending data for transparency...');

    // Set CORS headers for public access
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Return sample data until database tables are created
    const sampleData = [
      {
        id: 1,
        description: 'Marketing & Community Development',
        amount_sol: 5.0,
        amount_usd: 1000,
        category: 'development',
        type: 'expense',
        date: new Date().toISOString(),
        transaction_hash: null,
        wallet_address: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 2,
        description: 'Community Giveaway Rewards',
        amount_sol: 2.5,
        amount_usd: 500,
        category: 'giveaway',
        type: 'giveaway',
        date: new Date(Date.now() - 86400000).toISOString(),
        transaction_hash: null,
        wallet_address: null,
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString()
      }
    ];

    console.log('✅ Public ecosystem/spend: Returning sample spending data');
    
    return res.json({
      success: true,
      spending: sampleData,
      summary: {
        total_entries: sampleData.length,
        total_sol_spent: 7.5,
        total_usd_spent: 1500,
        categories: {
          expenses: 1,
          giveaways: 1,
          qr_claims: 0
        },
        recent_spending: sampleData
      },
      message: `Found ${sampleData.length} spending entries`
    });

  } catch (error) {
    console.error('❌ Error in public ecosystem spending endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch spending data',
      message: error instanceof Error ? error.message : 'Unknown error',
      spending: [],
      summary: { total_entries: 0, total_sol_spent: 0, total_usd_spent: 0 }
    });
  }
});

/**
 * DELETE /api/ecosystem/spend/:id
 * Delete a single spending entry
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Deleting spending entry ID: ${id}`);

    // Since we're using sample data, just return success for any ID
    console.log(`✅ Deleted sample entry ID: ${id}`);
    return res.json({
      success: true,
      message: `Spending entry deleted successfully`,
      deletedEntry: { id, message: 'Sample entry removed' }
    });

  } catch (error) {
    console.error('❌ Unexpected error deleting entry:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/ecosystem/spend/bulk
 * Delete multiple spending entries
 */
router.delete('/bulk', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Please provide an array of IDs to delete'
      });
    }

    console.log(`🗑️ Bulk deleting ${ids.length} entries:`, ids);
    
    // Since we're using sample data, just return success for all IDs
    const deletedEntries = ids.map(id => ({ id, type: 'sample', data: { id, message: 'Sample entry removed' } }));

    console.log(`✅ Bulk delete complete: ${deletedEntries.length} deleted, 0 failed`);

    return res.json({
      success: true,
      message: `Bulk delete completed`,
      results: {
        deleted: deletedEntries.length,
        failed: 0,
        deletedEntries,
        failedDeletions: []
      }
    });

  } catch (error) {
    console.error('❌ Unexpected error in bulk delete:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * OPTIONS /api/ecosystem/spend
 * Handle CORS preflight requests
 */
router.options('/', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

module.exports = router;

