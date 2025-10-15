const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const { getCurrentSolPrice } = require('../../utils/sol-price.js');

const router = express.Router();

/**
 * GET /api/ecosystem/spend
 * Get complete spending ledger (expenses + giveaway payouts)
 */
router.get('/', async (req, res) => {
  try {
    console.log('🔍 Fetching complete spending ledger (expenses + giveaway payouts)...');
    const supabase = getSupabaseAdminClient();
    // Fetch spending entries from spend_log with transaction hashes
    const { data: spendEntries, error: spendError } = await supabase
      .from('spend_log')
      .select(`
        id,
        amount_sol,
        amount_usd,
        currency,
        description,
        transaction_hash,
        category,
        spent_at,
        created_at
      `)
      .order('spent_at', { ascending: false });
    if (spendError) {
      console.error('❌ Database error fetching spend entries:', spendError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch spending entries'
      });
    }
    // Fetch giveaway payouts
    const { data: payoutEntries, error: payoutError } = await supabase
      .from('giveaway_payouts')
      .select(`
        id,
        recipient_wallet,
        amount_sol,
        amount_usd,
        description,
        transaction_hash,
        payout_type,
        paid_at,
        created_at
      `)
      .order('paid_at', { ascending: false });
    if (payoutError) {
      console.error('❌ Database error fetching giveaway payouts:', payoutError);
      // Continue without giveaway data rather than failing completely
    }
    // Fetch QR claims for complete transparency
    const { data: claimedEntries, error: claimsError } = await supabase
      .from('claim_links')
      .select(`
        id,
        code,
        amount_lamports,
        tx_signature,
        claimer_address,
        claimed_at
      `)
      .not('claimed_at', 'is', null)
      .order('claimed_at', { ascending: false });
    if (claimsError) {
      console.error('❌ Database error fetching QR claims:', claimsError);
      // Continue without QR claims data rather than failing completely
    }
    // Get current SOL price for real-time USD conversion
    const currentSolPrice = await getCurrentSolPrice();
    // Combine all entries into a unified format
    const combinedEntries = [
      // Regular spend entries with dynamic USD conversion
      ...(spendEntries || []).map(entry => {
        const dynamicUsdValue = entry.amount_sol * currentSolPrice;
        return {
          id: entry.id,
          type: entry.category === 'giveaway' ? 'giveaway_expense' : 'expense',
          amount: entry.amount_sol,
          currency: entry.currency || 'SOL',
          description: entry.description,
          transaction_hash: entry.transaction_hash,
          category: entry.category,
          date: entry.spent_at,
          usd_value: dynamicUsdValue,
          display_amount: `${entry.amount_sol} SOL ($${dynamicUsdValue.toLocaleString('en-US', { maximumFractionDigits: 2 })})`
        };
      }),
      // Giveaway payout entries with dynamic USD conversion
      ...(payoutEntries || []).map(entry => {
        const dynamicUsdValue = entry.amount_sol * currentSolPrice;
        return {
          id: entry.id,
          type: 'giveaway_payout',
          amount: entry.amount_sol,
          currency: 'SOL',
          description: entry.description,
          transaction_hash: entry.transaction_hash,
          category: 'giveaway',
          date: entry.paid_at,
          wallet_address: entry.recipient_wallet,
          payout_type: entry.payout_type,
          usd_value: dynamicUsdValue,
          display_amount: `${entry.amount_sol} SOL ($${dynamicUsdValue.toLocaleString('en-US', { maximumFractionDigits: 2 })})`
        };
      }),
      // QR CLAIM ENTRIES FOR COMPLETE TRANSPARENCY with dynamic USD conversion
      ...(claimedEntries || []).map(entry => {
        const solAmount = (entry.amount_lamports / 1000000000);
        const dynamicUsdValue = solAmount * currentSolPrice; // Real-time USD conversion
        return {
          id: `claim_${entry.id}`,
          type: 'qr_claim',
          amount: solAmount,
          currency: 'SOL',
          description: `QR Claim Payout - Code: ${entry.code}`,
          transaction_hash: entry.tx_signature,
          category: 'giveaway',
          date: entry.claimed_at,
          wallet_address: entry.claimer_address,
          payout_type: 'qr_claim',
          usd_value: dynamicUsdValue,
          display_amount: `${solAmount.toFixed(3)} SOL ($${dynamicUsdValue.toFixed(2)})`
        };
      })
    ];
    // Sort by date (most recent first)
    combinedEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    // Calculate totals with dynamic USD conversion
    const totalExpensesSol = (spendEntries || [])
      .filter(entry => entry.category !== 'giveaway')
      .reduce((sum, entry) => sum + parseFloat(entry.amount_sol?.toString() || '0'), 0);
    const totalExpensesUsd = totalExpensesSol * currentSolPrice; // Dynamic USD conversion
    const totalGiveawaysSol = (spendEntries || [])
      .filter(entry => entry.category === 'giveaway')
      .reduce((sum, entry) => sum + parseFloat(entry.amount_sol?.toString() || '0'), 0);
    const totalSolPayouts = (payoutEntries || [])
      .reduce((sum, entry) => sum + parseFloat(entry.amount_sol.toString()), 0);
    const totalUsdPayouts = totalSolPayouts * currentSolPrice; // Dynamic USD conversion
    // QR Claims totals with dynamic USD conversion
    const totalQrClaimsSol = (claimedEntries || [])
      .reduce((sum, entry) => sum + (entry.amount_lamports / 1000000000), 0);
    const totalQrClaimsUsd = totalQrClaimsSol * currentSolPrice; // Real-time conversion
    // Combined giveaway totals (from both tables + QR claims)
    const combinedGiveawaySol = totalGiveawaysSol + totalSolPayouts + totalQrClaimsSol;
    const combinedGiveawayUsd = (totalGiveawaysSol * currentSolPrice) + totalUsdPayouts + totalQrClaimsUsd;
    console.log(`✅ Fetched ${spendEntries?.length || 0} spend entries, ${payoutEntries?.length || 0} giveaway payouts, and ${claimedEntries?.length || 0} QR claims`);
    return res.json({
      success: true,
      entries: combinedEntries,
      totals: {
        totalExpensesSol,
        totalExpensesUsd,
        totalGiveawaysSol: combinedGiveawaySol,
        totalGiveawaysUsd: combinedGiveawayUsd,
        totalQrClaimsSol,
        totalQrClaimsUsd,
        spendCount: spendEntries?.length || 0,
        payoutCount: payoutEntries?.length || 0,
        claimCount: claimedEntries?.length || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Unexpected error in spend API:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Helper function to check if error indicates table doesn't exist
 */
function isTableNotExistError(error) {
  return error && (
    error.message.includes('PGRST205') || 
    error.message.includes('relation') || 
    error.message.includes('does not exist')
  );
}

/**
 * Helper function to check if error is a "not found" error (safe to ignore)
 */
function isNotFoundError(error) {
  return error && error.message.includes('PGRST116');
}

/**
 * Helper function to attempt deletion from a specific table
 */
async function tryDeleteFromTable(supabase, tableName, id, actualId = null) {
  const deleteId = actualId || id;
  const { data, error } = await supabase
    .from(tableName)
    .delete()
    .eq('id', deleteId)
    .select();

  if (isTableNotExistError(error)) {
    console.log(`⚠️ ${tableName} table does not exist, skipping...`);
    return { success: false, tableNotExists: true };
  }

  if (error && !isNotFoundError(error)) {
    console.error(`❌ Error deleting from ${tableName}:`, error);
    return { success: false, error: error.message };
  }

  if (!data || data.length === 0) {
    return { success: false, notFound: true };
  }

  return { success: true, data: data[0] };
}

/**
 * DELETE /api/ecosystem/spend/:id
 * Delete a single spending entry
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Deleting spending entry ID: ${id}`);
    const supabase = getSupabaseAdminClient();

    // Try to delete from spend_log first
    const spendResult = await tryDeleteFromTable(supabase, 'spend_log', id);
    if (spendResult.error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete spending entry',
        details: spendResult.error
      });
    }

    if (spendResult.success) {
      console.log(`✅ Deleted spending entry ID: ${id}`);
      return res.json({
        success: true,
        message: 'Spending entry deleted successfully',
        deletedEntry: spendResult.data
      });
    }

    // Try giveaway_payouts table
    const payoutResult = await tryDeleteFromTable(supabase, 'giveaway_payouts', id);
    if (payoutResult.error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete giveaway payout',
        details: payoutResult.error
      });
    }

    if (payoutResult.success) {
      console.log(`✅ Deleted giveaway payout ID: ${id}`);
      return res.json({
        success: true,
        message: 'Giveaway payout deleted successfully',
        deletedEntry: payoutResult.data
      });
    }

    // Try claim_links table (handle claim_X format)
    const actualId = id.startsWith('claim_') ? id.replace('claim_', '') : id;
    const claimResult = await tryDeleteFromTable(supabase, 'claim_links', id, actualId);
    
    if (claimResult.error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete claim entry',
        details: claimResult.error
      });
    }

    if (claimResult.tableNotExists) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found',
        message: `No spending entry found with ID: ${id} (database tables not configured)`
      });
    }

    if (claimResult.success) {
      console.log(`✅ Deleted claim entry ID: ${id}`);
      return res.json({
        success: true,
        message: 'Claim entry deleted successfully',
        deletedEntry: claimResult.data
      });
    }

    // Entry not found in any table
    return res.status(404).json({
      success: false,
      error: 'Entry not found',
      message: `No spending entry found with ID: ${id}`
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

// NOTE: Bulk operations are admin-only and handled by /api/admin/ecosystem/spend/bulk
// This public route has been removed to prevent route conflicts
module.exports = router;

