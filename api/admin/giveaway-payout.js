const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Safe import of Solana payment service with fallback
let solanaPaymentService = null;
try {
  const solanaModule = require('../../lib/solana-payment.cjs');
  solanaPaymentService = solanaModule.solanaPaymentService;
  console.log('✅ Solana payment service imported successfully');
} catch (error) {
  console.warn('⚠️ Solana payment service not available, using fallback mode:', error.message);
}

const router = express.Router();
const LAMPORTS_PER_SOL = 1000000000;

// POST - Process giveaway payout with REAL SOL transfer
router.post('/', async (req, res) => {
  try {
    // Add basic auth check
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { recipientAddress, amountSol, description, payoutType = 'manual_payout' } = req.body;

    // Validate input
    if (!recipientAddress || !amountSol || !description) {
      return res.status(400).json({
        error: 'Missing required fields: recipientAddress, amountSol, description'
      });
    }

    if (typeof amountSol !== 'number' || amountSol <= 0) {
      return res.status(400).json({
        error: 'Invalid amount. Must be a positive number'
      });
    }

    const supabase = getSupabaseAdminClient();

    console.log('🎁 Processing manual giveaway payout with REAL SOL...');
    console.log(`💰 Amount: ${amountSol} SOL`);
    console.log(`🎯 Recipient: ${recipientAddress}`);
    console.log(`📋 Description: ${description}`);

    // Check if payment service is available
    if (!solanaPaymentService) {
      return res.status(503).json({
        error: 'Payment system temporarily unavailable',
        details: 'Real SOL payments are required. Please try again later.'
      });
    }

    // Initialize payment service if needed
    if (!solanaPaymentService.isInitialized()) {
      console.log('🔄 Initializing Solana payment service...');
      await solanaPaymentService.initialize();
    }

    // Send REAL SOL payment
    let txSignature;
    try {
      const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
      console.log(`💸 Sending ${amountSol} SOL (${lamports} lamports)...`);
      
      txSignature = await solanaPaymentService.sendSOL(recipientAddress, lamports);
      
      console.log(`✅ Payment successful! TX: ${txSignature}`);
    } catch (paymentError) {
      console.error('❌ SOL payment failed:', paymentError);
      return res.status(500).json({
        error: 'SOL payment failed',
        details: paymentError instanceof Error ? paymentError.message : 'Unknown error'
      });
    }

    // Get current SOL price for USD value
    let solPrice = 225; // Default fallback
    try {
      const solPriceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const solPriceData = await solPriceResponse.json();
      solPrice = solPriceData.solana.usd;
    } catch (priceError) {
      console.warn('⚠️ Failed to fetch SOL price, using default:', priceError);
    }

    const usdValue = amountSol * solPrice;

    // Create payout record with REAL transaction signature
    const { data: payout, error: payoutError } = await supabase
      .from('giveaway_payouts')
      .insert({
        recipient_wallet: recipientAddress,
        amount_sol: amountSol,
        amount_usd: usdValue,
        description,
        payout_type: payoutType,
        paid_at: new Date().toISOString(),
        transaction_hash: txSignature
      })
      .select()
      .single();

    if (payoutError) {
      console.error('❌ Failed to create payout record:', payoutError);
      // Payment was successful but database failed - return warning
      return res.status(207).json({
        success: true,
        warning: 'Payment successful but failed to create database record',
        txSignature,
        amountSol,
        recipientAddress,
        explorerUrl: `https://solscan.io/tx/${txSignature}`
      });
    }

    console.log('✅ Created payout record:', payout.id);
    console.log(`🔗 Explorer: https://solscan.io/tx/${txSignature}`);

    res.json({
      success: true,
      payoutId: payout.id,
      txSignature,
      amountSol,
      recipientAddress,
      description,
      explorerUrl: `https://solscan.io/tx/${txSignature}`,
      message: 'Giveaway payout completed successfully!'
    });

  } catch (error) {
    console.error('❌ Giveaway payout error:', error);
    res.status(500).json({
      error: 'Failed to process giveaway payout',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;

