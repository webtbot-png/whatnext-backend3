const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'whatnext-jwt-secret-2025';
const LAMPORTS_PER_SOL = 1000000000;

async function verifyAdminToken(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new Error('No token provided');
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw new Error('Invalid token');
  }
}

/**
 * Get today's giveaway from database
 */
async function getTodayGiveaway(supabase, today) {
  const { data: giveaway, error } = await supabase
    .from('daily_giveaways')
    .select('*')
    .eq('date', today)
    .single();

  if (error || !giveaway) {
    throw new Error('No giveaway found for today');
  }

  if (giveaway.is_completed) {
    throw new Error('This giveaway has already been processed');
  }

  return giveaway;
}

/**
 * Fetch live market cap from pump.fun
 */
async function fetchLiveMarketCap(supabase) {
  console.log('📊 Fetching LIVE market cap snapshot from pump.fun...');
  
  const contractAddress = await getContractAddressFromDatabase(supabase);
  
  if (!contractAddress) {
    throw new Error('No pump.fun contract address configured in settings');
  }

  const marketCapData = await fetchPumpFunMarketCap(contractAddress);
  
  if (!marketCapData.success || marketCapData.marketCap === 0) {
    throw new Error(`Failed to fetch live market cap: ${marketCapData.error || 'Unknown error'}`);
  }

  console.log(`📊 LIVE Market Cap Snapshot: $${marketCapData.marketCap.toLocaleString()}`);
  console.log(`📡 Data Source: ${marketCapData.source}`);

  return marketCapData.marketCap;
}

/**
 * Update giveaway with actual market cap
 */
async function updateGiveawayMarketCap(supabase, giveawayId, actualMarketCap) {
  const { error } = await supabase
    .from('daily_giveaways')
    .update({
      actual_market_cap: actualMarketCap,
      snapshot_time: new Date().toISOString()
    })
    .eq('id', giveawayId);

  if (error) {
    throw new Error(`Failed to update giveaway: ${error.message}`);
  }
}

/**
 * Calculate winners using database function
 */
async function calculateWinners(supabase, giveawayId) {
  const { error } = await supabase
    .rpc('calculate_giveaway_winners_by_contract', {
      giveaway_id_param: giveawayId,
      contract_addr: 'pump.fun'
    });

  if (error) {
    throw new Error(`Failed to calculate winners: ${error.message}`);
  }
}

/**
 * Get winners from database
 */
async function getWinners(supabase, giveawayId) {
  const { data: winners, error } = await supabase
    .from('giveaway_winners')
    .select('*')
    .eq('giveaway_id', giveawayId);

  if (error) {
    throw new Error(`Failed to fetch winners: ${error.message}`);
  }

  return winners || [];
}

/**
 * Mark giveaway as completed
 */
async function markGiveawayCompleted(supabase, giveawayId) {
  await supabase
    .from('daily_giveaways')
    .update({ is_completed: true })
    .eq('id', giveawayId);
}

/**
 * Initialize payment service if needed
 */
async function ensurePaymentServiceInitialized() {
  if (!solanaPaymentService.isInitialized()) {
    console.log('🔄 Initializing Solana payment service...');
    await solanaPaymentService.initialize();
  }
}

/**
 * Get SOL price in USD
 */
async function getSolPrice() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json();
    return data.solana.usd;
  } catch (error) {
    console.warn('⚠️ Failed to fetch SOL price, using default 150 USD', error);
    return 150; // Fallback price
  }
}

/**
 * Create giveaway payout record
 */
async function createPayoutRecord(supabase, winner, prizePerWinner, txSignature, giveawayDate, solPrice) {
  const usdValue = prizePerWinner * solPrice;

  const { error } = await supabase
    .from('giveaway_payouts')
    .insert({
      recipient_wallet: winner.wallet_address,
      amount_sol: prizePerWinner,
      amount_usd: usdValue,
      description: `Daily Giveaway Winner - Market Cap Prediction (${new Date(giveawayDate).toLocaleDateString()})`,
      transaction_hash: txSignature,
      payout_type: 'daily_giveaway',
      reference_id: winner.id,
      paid_at: new Date().toISOString()
    });

  if (error) {
    console.error('❌ Failed to create payout record:', error);
  }
}

/**
 * Update winner record with transaction details
 */
async function updateWinnerRecord(supabase, winnerId, txSignature, prizePerWinner) {
  const { error } = await supabase
    .from('giveaway_winners')
    .update({
      transaction_hash: txSignature,
      paid_at: new Date().toISOString(),
      prize_amount: prizePerWinner
    })
    .eq('id', winnerId);

  if (error) {
    console.error('❌ Failed to update winner record:', error);
  }
}

/**
 * Process payment to a single winner
 */
async function processSinglePayment(supabase, winner, prizePerWinner, giveawayDate, solPrice) {
  console.log(`\n💸 Paying winner: ${winner.wallet_address}`);
  console.log(`   Amount: ${prizePerWinner.toFixed(6)} SOL`);

  // Send REAL SOL payment
  const lamports = Math.floor(prizePerWinner * LAMPORTS_PER_SOL);
  const txSignature = await solanaPaymentService.sendSOL(winner.wallet_address, lamports);

  console.log(`✅ Payment successful! TX: ${txSignature}`);

  // Update winner record
  await updateWinnerRecord(supabase, winner.id, txSignature, prizePerWinner);

  // Create payout record
  await createPayoutRecord(supabase, winner, prizePerWinner, txSignature, giveawayDate, solPrice);

  return {
    wallet: winner.wallet_address,
    guess: winner.guessed_market_cap,
    difference: winner.difference_amount,
    prize: prizePerWinner,
    paid: true,
    signature: txSignature
  };
}

/**
 * Process payments to all winners
 */
async function processAllPayments(supabase, winners, prizePerWinner, giveawayDate) {
  const paymentResults = [];
  const solPrice = await getSolPrice();

  for (const winner of winners) {
    try {
      const result = await processSinglePayment(supabase, winner, prizePerWinner, giveawayDate, solPrice);
      paymentResults.push(result);
    } catch (paymentError) {
      console.error(`❌ Payment failed for ${winner.wallet_address}:`, paymentError);
      
      paymentResults.push({
        wallet: winner.wallet_address,
        guess: winner.guessed_market_cap,
        difference: winner.difference_amount,
        prize: prizePerWinner,
        paid: false,
        error: paymentError instanceof Error ? paymentError.message : 'Unknown error'
      });
    }
  }

  return paymentResults;
}

/**
 * Build response with no winners
 */
function buildNoWinnersResponse(giveawayId, actualMarketCap) {
  return {
    success: true,
    message: 'No winners found for this giveaway',
    data: {
      marketCap: actualMarketCap,
      winnersCount: 0,
      giveawayId: giveawayId,
      winners: []
    }
  };
}

/**
 * Build successful response with payment results
 */
function buildSuccessResponse(actualMarketCap, giveawayId, winners, paymentResults, prizePool, prizePerWinner) {
  const successfulPayments = paymentResults.filter(r => r.paid).length;
  const failedPayments = paymentResults.filter(r => !r.paid).length;

  console.log(`\n✅ Giveaway processing complete!`);
  console.log(`   Successful payments: ${successfulPayments}`);
  console.log(`   Failed payments: ${failedPayments}`);
  console.log(`   Total prize distributed: ${(successfulPayments * prizePerWinner).toFixed(6)} SOL\n`);

  return {
    success: true,
    message: `Giveaway completed! ${successfulPayments} winner(s) paid, ${failedPayments} failed.`,
    data: {
      marketCap: actualMarketCap,
      winnersCount: winners.length,
      giveawayId: giveawayId,
      winners: paymentResults,
      prizePool: prizePool,
      prizePerWinner: prizePerWinner,
      successfulPayments,
      failedPayments
    }
  };
}

/**
 * Get error status code based on error message
 */
function getErrorStatusCode(error) {
  if (!(error instanceof Error)) return 500;
  
  const message = error.message;
  
  if (message.includes('token')) return 401;
  if (message.includes('No giveaway found')) return 404;
  if (message.includes('already been processed')) return 400;
  if (message.includes('No pump.fun contract')) return 400;
  if (message.includes('Failed to fetch live market cap')) return 500;
  
  return 500;
}

/**
 * Build error response object
 */
function buildErrorResponse(error, statusCode) {
  if (statusCode === 401) {
    return { error: 'Unauthorized' };
  }
  
  return {
    success: false,
    message: error instanceof Error ? error.message : 'Unknown error'
  };
}

/**
 * Handle errors in route handler
 */
function handleRouteError(error, res) {
  const statusCode = getErrorStatusCode(error);
  const responseBody = buildErrorResponse(error, statusCode);
  
  if (statusCode === 500) {
    console.error('❌ Giveaway processing error:', error);
  }
  
  return res.status(statusCode).json(responseBody);
}

/**
 * Main giveaway processing orchestration
 */
async function processGiveaway(supabase, today) {
  // Get today's giveaway
  const giveaway = await getTodayGiveaway(supabase, today);

  // Fetch REAL market cap from pump.fun API
  const actualMarketCap = await fetchLiveMarketCap(supabase);

  // Update giveaway with market cap
  await updateGiveawayMarketCap(supabase, giveaway.id, actualMarketCap);

  // Calculate winners using database function
  await calculateWinners(supabase, giveaway.id);

  // Get winners
  const winners = await getWinners(supabase, giveaway.id);

  return { giveaway, actualMarketCap, winners };
}

/**
 * Process winners and payments
 */
async function processWinnersAndPayments(supabase, giveaway, winners) {
  console.log(`🏆 Found ${winners.length} winner(s). Processing payments...`);

  // Initialize payment service
  await ensurePaymentServiceInitialized();

  // Calculate prize per winner
  const prizePool = giveaway.prize_pool_sol || 0.3;
  const prizePerWinner = prizePool / winners.length;

  console.log(`💰 Total Prize Pool: ${prizePool} SOL`);
  console.log(`💎 Prize Per Winner: ${prizePerWinner.toFixed(6)} SOL`);

  // Process payments to all winners
  const paymentResults = await processAllPayments(supabase, winners, prizePerWinner, giveaway.date);

  return { paymentResults, prizePool, prizePerWinner };
}

/**
 * POST /api/admin/giveaway/process
 * Process giveaway snapshot, determine winners, and send REAL SOL payments
 */
router.post('/', async (req, res) => {
  try {
    // Verify admin authentication
    await verifyAdminToken(req);

    console.log('🎯 Starting giveaway processing with REAL SOL payments...');

    const supabase = getSupabaseAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Process giveaway and get results
    const { giveaway, actualMarketCap, winners } = await processGiveaway(supabase, today);

    // Handle case with no winners
    if (winners.length === 0) {
      await markGiveawayCompleted(supabase, giveaway.id);
      return res.json(buildNoWinnersResponse(giveaway.id, actualMarketCap));
    }

    // Process winners and payments
    const { paymentResults, prizePool, prizePerWinner } = await processWinnersAndPayments(supabase, giveaway, winners);

    // Mark giveaway as completed
    await markGiveawayCompleted(supabase, giveaway.id);

    // Return success response
    res.json(buildSuccessResponse(actualMarketCap, giveaway.id, winners, paymentResults, prizePool, prizePerWinner));

  } catch (error) {
    return handleRouteError(error, res);
  }
});

module.exports = router;

