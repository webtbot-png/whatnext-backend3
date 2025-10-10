const express = require('express');
const router = express.Router();

/**
 * GET /api/admin/ecosystem/spend
 * Get ecosystem spending data for admin dashboard
 * Uses direct database access for consistent data
 */
router.get('/', async (req, res) => {
  try {
    console.log('🔍 Admin ecosystem/spend: Fetching spending data...');

    // Import database function
    const { getSupabaseAdminClient } = require('../../../database.js');
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
      .order('created_at', { ascending: false });

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

    console.log(`✅ Admin ecosystem/spend: Retrieved ${spendEntries?.length || 0} spending entries`);
    
    // Format the entries for admin consumption
    const formattedEntries = (spendEntries || []).map(entry => ({
      id: entry.id,
      description: entry.description || 'Ecosystem Spending',
      amount_sol: entry.amount_sol || 0,
      amount_usd: entry.amount_usd || 0,
      date: entry.spent_at || entry.created_at,
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
        endpoint: 'admin',
        description: 'Admin ecosystem spending data'
      }
    });

  } catch (error) {
    console.error('❌ Error in admin ecosystem spending endpoint:', error);
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
 * DELETE /api/admin/ecosystem/spend/bulk
 * Bulk delete spending entries (admin only) - ADDED TO FIX 404 ERROR
 */
router.delete('/bulk', async (req, res) => {
  try {
    console.log('🗑️ Admin bulk delete ecosystem spending entries...');
    
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: ids array is required and cannot be empty'
      });
    }

    console.log(`🎯 Deleting ${ids.length} spending entries:`, ids);

    // Import database function here to avoid breaking existing functionality
    const { getSupabaseAdminClient } = require('../../../database.js');
    const supabase = getSupabaseAdminClient();
    
    // Delete from spend_log table
    const { data: deletedEntries, error: deleteError } = await supabase
      .from('spend_log')
      .delete()
      .in('id', ids)
      .select('id, description, amount_sol');

    if (deleteError) {
      console.error('❌ Database error during bulk delete:', deleteError);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete spending entries',
        details: deleteError.message
      });
    }

    const deletedCount = deletedEntries?.length || 0;
    
    console.log(`✅ Successfully deleted ${deletedCount} spending entries`);
    
    res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} spending entries`,
      deletedCount: deletedCount,
      deletedIds: deletedEntries?.map(entry => entry.id) || []
    });

  } catch (error) {
    console.error('❌ Bulk delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during bulk delete',
      details: error.message
    });
  }
});

/**
 * DELETE /api/admin/ecosystem/spend/:id
 * Delete single spending entry (admin only) - ADDED FOR SINGLE DELETE FUNCTIONALITY
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🗑️ Admin deleting single ecosystem spending entry: ${id}`);

    // Import database function here to avoid breaking existing functionality
    const { getSupabaseAdminClient } = require('../../../database.js');
    const supabase = getSupabaseAdminClient();
    
    // Delete the single spending entry
    const { data: deletedEntry, error: deleteError } = await supabase
      .from('spend_log')
      .delete()
      .eq('id', id)
      .select('id, description, amount_sol')
      .single();

    if (deleteError) {
      if (deleteError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Spending entry not found'
        });
      }
      
      console.error('❌ Database error during single delete:', deleteError);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete spending entry',
        details: deleteError.message
      });
    }

    console.log(`✅ Successfully deleted single spending entry: ${deletedEntry.description}`);
    
    res.json({
      success: true,
      message: 'Successfully deleted spending entry',
      deletedEntry: deletedEntry
    });

  } catch (error) {
    console.error('❌ Single delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during single delete',
      details: error.message
    });
  }
});

module.exports = router;

