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
 * DELETE /api/ecosystem/spend/:id
 * Delete a single spending entry
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Deleting spending entry ID: ${id}`);
    const supabase = getSupabaseAdminClient();

    // Try to delete from spend_log first
    const { data: deletedSpend, error: spendError } = await supabase
      .from('spend_log')
      .delete()
      .eq('id', id)
      .select();

    if (spendError && !spendError.message.includes('PGRST116')) {
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

      if (payoutError && !payoutError.message.includes('PGRST116')) {
        console.error('❌ Error deleting from giveaway_payouts:', payoutError);
        return res.status(500).json({
          success: false,
          error: 'Failed to delete giveaway payout',
          details: payoutError.message
        });
      }

      if (!deletedPayout || deletedPayout.length === 0) {
        // Try claim_links for QR claims (extract actual ID from claim_X format)
        const actualId = id.startsWith('claim_') ? id.replace('claim_', '') : id;
        const { data: deletedClaim, error: claimError } = await supabase
          .from('claim_links')
          .delete()
          .eq('id', actualId)
          .select();

        if (claimError && !claimError.message.includes('PGRST116')) {
          console.error('❌ Error deleting from claim_links:', claimError);
          return res.status(500).json({
            success: false,
            error: 'Failed to delete claim entry',
            details: claimError.message
          });
        }

        if (!deletedClaim || deletedClaim.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Entry not found',
            message: `No spending entry found with ID: ${id}`
          });
        }

        console.log(`✅ Deleted claim entry ID: ${id}`);
        return res.json({
          success: true,
          message: `Claim entry deleted successfully`,
          deletedEntry: deletedClaim[0]
        });
      }

      console.log(`✅ Deleted giveaway payout ID: ${id}`);
      return res.json({
        success: true,
        message: `Giveaway payout deleted successfully`,
        deletedEntry: deletedPayout[0]
      });
    }

    console.log(`✅ Deleted spending entry ID: ${id}`);
    return res.json({
      success: true,
      message: `Spending entry deleted successfully`,
      deletedEntry: deletedSpend[0]
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
    const supabase = getSupabaseAdminClient();
    
    const deletedEntries = [];
    const failedDeletions = [];

    for (const id of ids) {
      try {
        // Try spend_log first
        const { data: deletedSpend, error: spendError } = await supabase
          .from('spend_log')
          .delete()
          .eq('id', id)
          .select();

        if (!spendError && deletedSpend && deletedSpend.length > 0) {
          deletedEntries.push({ id, type: 'spend_log', data: deletedSpend[0] });
          continue;
        }

        // Try giveaway_payouts
        const { data: deletedPayout, error: payoutError } = await supabase
          .from('giveaway_payouts')
          .delete()
          .eq('id', id)
          .select();

        if (!payoutError && deletedPayout && deletedPayout.length > 0) {
          deletedEntries.push({ id, type: 'giveaway_payouts', data: deletedPayout[0] });
          continue;
        }

        // Try claim_links
        const actualId = id.startsWith('claim_') ? id.replace('claim_', '') : id;
        const { data: deletedClaim, error: claimError } = await supabase
          .from('claim_links')
          .delete()
          .eq('id', actualId)
          .select();

        if (!claimError && deletedClaim && deletedClaim.length > 0) {
          deletedEntries.push({ id, type: 'claim_links', data: deletedClaim[0] });
          continue;
        }

        // If we get here, the entry wasn't found
        failedDeletions.push({ id, reason: 'Entry not found' });

      } catch (entryError) {
        console.error(`❌ Error deleting entry ${id}:`, entryError);
        failedDeletions.push({ 
          id, 
          reason: entryError instanceof Error ? entryError.message : 'Unknown error' 
        });
      }
    }

    console.log(`✅ Bulk delete complete: ${deletedEntries.length} deleted, ${failedDeletions.length} failed`);

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
    console.error('❌ Unexpected error in bulk delete:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;

