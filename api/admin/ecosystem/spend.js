const express = require('express');
const { getSupabaseAdminClient } = require('../../database.js');

const router = express.Router();

/**
 * GET /api/ecosystem/spend
 * Get ecosystem spending data (public endpoint for transparency)
 * This shows how the community funds are being spent
 */
router.get('/', async (req, res) => {
  try {
    console.log('🔍 Public ecosystem/spend: Fetching spending data for transparency...');

    // Set CORS headers for public access
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const supabase = getSupabaseAdminClient();
    
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Database not available',
        entries: [],
        total: 0
      });
    }
    
    // Fetch all spending entries from the database
    const { data: spendEntries, error } = await supabase
      .from('spend_log')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching spend entries:', error);
      return res.status(500).json({
        success: false,
        error: 'Database error',
        message: error.message,
        entries: [],
        total: 0
      });
    }

    console.log(`✅ Public ecosystem/spend: Retrieved ${spendEntries?.length || 0} spending entries`);
    
    // Format the entries for public consumption
    const formattedEntries = (spendEntries || []).map(entry => ({
      id: entry.id,
      description: entry.description || 'Ecosystem Spending',
      amount_sol: entry.amount_sol || 0,
      amount_usd: entry.amount_usd || 0,
      date: entry.date || entry.created_at,
      category: entry.category || 'general',
      transaction_hash: entry.transaction_hash || null,
      wallet_address: entry.wallet_address || null,
      created_at: entry.created_at,
      updated_at: entry.updated_at
    }));

    // Calculate totals
    const totalSol = formattedEntries.reduce((sum, entry) => sum + (entry.amount_sol || 0), 0);
    const totalUsd = formattedEntries.reduce((sum, entry) => sum + (entry.amount_usd || 0), 0);

    // Return comprehensive data
    return res.json({
      success: true,
      entries: formattedEntries,
      total: formattedEntries.length,
      totals: {
        total_spent_sol: totalSol,
        total_spent_usd: totalUsd,
        entry_count: formattedEntries.length
      },
      metadata: {
        last_updated: new Date().toISOString(),
        endpoint: 'public',
        description: 'Community ecosystem spending transparency'
      }
    });

  } catch (error) {
    console.error('❌ Error in public ecosystem spending endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch spending data',
      message: error instanceof Error ? error.message : 'Unknown error',
      entries: [],
      total: 0
    });
  }
});

/**
 * OPTIONS /api/ecosystem/spend
 * Handle CORS preflight requests
 */
router.options('/', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

// NOTE: DELETE/UPDATE routes are handled in /api/admin/ecosystem/spend.js only
// This public endpoint is READ-ONLY for transparency purposes

module.exports = router;

