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
    const response = await fetch('https://web-production-061ff.up.railway.app/api/ecosystem/spend', {
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

