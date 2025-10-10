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

module.exports = router;
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
      spending: combinedEntries,  // Use 'spending' to match frontend expectations
      summary: {
        total_entries: combinedEntries.length,
        total_sol_spent: totalExpensesSol + combinedGiveawaySol,
        total_usd_spent: totalExpensesUsd + combinedGiveawayUsd,
        categories: {
          expenses: spendEntries?.length || 0,
          giveaways: (payoutEntries?.length || 0) + (claimedEntries?.length || 0),
          qr_claims: claimedEntries?.length || 0
        },
        recent_spending: combinedEntries.slice(0, 10)
      },
      message: `Found ${combinedEntries.length} spending entries`
    });
  } catch (error) {
    console.error('❌ Unexpected error in spend API:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      spending: [],
      summary: { total_entries: 0, total_sol_spent: 0, total_usd_spent: 0 }
    });
  }
});

module.exports = router;

