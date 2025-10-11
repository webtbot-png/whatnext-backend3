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
 * Delete a single spending entry - DIRECT DATABASE ACCESS
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`�️ Admin: Deleting spending entry ID: ${id}`);
    
    const { getSupabaseAdminClient } = require('../../../database.js');
    const supabase = getSupabaseAdminClient();

    // Try to delete from spend_log first
    const { data: deletedSpend, error: spendError } = await supabase
      .from('spend_log')
      .delete()
      .eq('id', id)
      .select();

    if (spendError && !spendError.message.includes('PGRST116') && !spendError.message.includes('relation') && !spendError.message.includes('does not exist')) {
      console.error('❌ Error deleting from spend_log:', spendError);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete spending entry',
        details: spendError.message
      });
    }

    // If not found in spend_log, try giveaway_payouts
    if (!deletedSpend || deletedSpend.length === 0) {
      const { data: deletedPayout, error: payoutError } = await supabase
        .from('giveaway_payouts')
        .delete()
        .eq('id', id)
        .select();

      if (payoutError && !payoutError.message.includes('PGRST116') && !payoutError.message.includes('relation') && !payoutError.message.includes('does not exist')) {
        console.error('❌ Error deleting from giveaway_payouts:', payoutError);
        return res.status(500).json({
          success: false,
          error: 'Failed to delete giveaway payout',
          details: payoutError.message
        });
      }

      if (!deletedPayout || deletedPayout.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Entry not found',
          message: `No spending entry found with ID: ${id}`
        });
      }

      console.log(`✅ Admin: Deleted giveaway payout ID: ${id}`);
      return res.json({
        success: true,
        message: `Giveaway payout deleted successfully`,
        deletedEntry: deletedPayout[0]
      });
    }

    console.log(`✅ Admin: Deleted spending entry ID: ${id}`);
    return res.json({
      success: true,
      message: `Spending entry deleted successfully`,
      deletedEntry: deletedSpend[0]
    });

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
 * Delete multiple spending entries - DIRECT DATABASE ACCESS
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

    console.log(`�️ Admin: Bulk deleting ${ids.length} entries:`, ids);
    
    const { getSupabaseAdminClient } = require('../../../database.js');
    const supabase = getSupabaseAdminClient();
    
    const deletedEntries = [];
    const failedDeletions = [];

    for (const id of ids) {
      try {
        let foundEntry = false;

        // Try spend_log first
        const { data: deletedSpend, error: spendError } = await supabase
          .from('spend_log')
          .delete()
          .eq('id', id)
          .select();

        if (!spendError && deletedSpend && deletedSpend.length > 0) {
          deletedEntries.push({ id, type: 'spend_log', data: deletedSpend[0] });
          foundEntry = true;
        } else if (spendError && !spendError.message.includes('relation') && !spendError.message.includes('does not exist')) {
          failedDeletions.push({ id, reason: spendError.message });
          continue;
        }

        if (!foundEntry) {
          // Try giveaway_payouts
          const { data: deletedPayout, error: payoutError } = await supabase
            .from('giveaway_payouts')
            .delete()
            .eq('id', id)
            .select();

          if (!payoutError && deletedPayout && deletedPayout.length > 0) {
            deletedEntries.push({ id, type: 'giveaway_payouts', data: deletedPayout[0] });
            foundEntry = true;
          } else if (payoutError && !payoutError.message.includes('relation') && !payoutError.message.includes('does not exist')) {
            failedDeletions.push({ id, reason: payoutError.message });
          }
        }

        if (!foundEntry) {
          failedDeletions.push({ id, reason: 'Entry not found in database' });
        }

      } catch (entryError) {
        console.error(`❌ Error deleting entry ${id}:`, entryError);
        failedDeletions.push({ 
          id, 
          reason: entryError instanceof Error ? entryError.message : 'Unknown error' 
        });
      }
    }

    console.log(`✅ Admin: Bulk delete complete: ${deletedEntries.length} deleted, ${failedDeletions.length} failed`);

    return res.json({
      success: true,
      message: `Bulk delete completed`,
      results: {
        deleted: deletedEntries.length,
        failed: failedDeletions.length,
        deletedEntries,
        failedDeletions
      }
    });

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

