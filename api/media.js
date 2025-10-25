const express = require('express');
const { getSupabaseAdminClient  } = require('../database.js');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { code, email, claimCode } = req.body;
    const actualCode = code || claimCode;
    if (!actualCode) {
      return res.json({
        success: true,
        message: 'Claim validation endpoint is operational',
        status: 'online',
        info: 'Provide code parameter to validate specific claim',
        example: 'POST with {"code": "YOUR_CLAIM_CODE"}'
      });
    }
    const supabase = getSupabaseAdminClient();
    const { data: claim, error } = await supabase
      .from('claim_links')
      .select('*')
      .eq('code', actualCode.toUpperCase())
      .is('claimed_at', null)
      .single();
    if (error || !claim) {
      return res.status(404).json({
        success: false,
        error: 'Invalid or already claimed code'
      });
    }
    const isExpired = new Date() > new Date(claim.expires_at);
    if (isExpired) {
      return res.status(400).json({
        success: false,
        error: 'This claim code has expired',
        expires_at: claim.expires_at
      });
    }
    const { data: updatedClaim, error: updateError } = await supabase
      .from('claim_links')
      .update({
        claimed_at: new Date().toISOString(),
        claimed_by_wallet: email || 'email_validation'
      })
      .eq('id', claim.id)
      .select()
      .single();
    if (updateError) {
      throw updateError;
    }
    const solAmount = claim.amount_lamports ? (claim.amount_lamports / 1e9) : 0;
    res.json({
      success: true,
      claim: {
        id: updatedClaim.id,
        code: updatedClaim.code,
        reward_amount: solAmount,
        reward_type: 'SOL',
        amount_sol: solAmount,
        amount_lamports: claim.amount_lamports,
        description: claim.description,
        claimed_at: updatedClaim.claimed_at,
        claimed_by: updatedClaim.claimed_by_wallet
      }
    });
  } catch (error) {
    console.error('❌ Claim validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate claim'
    });
  }
});

module.exports = router;




// GET /api/claim/status - Check claim status by code
router.get('/status', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      return res.json({
        success: true,
        message: 'Claim status endpoint is operational',
        status: 'online',
        info: 'Provide a code parameter to check specific claim status',
        example: '/api/claim/status?code=YOUR_CLAIM_CODE'
      });
    }
    console.log(`🔍 Checking claim status for code: ${code}`);
    const supabase = getSupabaseAdminClient();
    const { data: claimLink, error } = await supabase
      .from('claim_links')
      .select('*')
      .eq('code', code)
      .single();
    console.log(`🔍 Database response for code ${code}:`, claimLink);
    if (error || !claimLink) {
      console.log(`❌ Claim code not found: ${code}`);
      return res.status(404).json({
        success: false,
        error: 'Claim code not found'
      });
    }
    if (claimLink.claimed_at) {
      console.log(`❌ Claim code already used: ${code}`);
      return res.status(400).json({
        success: false,
        error: 'This claim code has already been used',
        claimed_at: claimLink.claimed_at,
        claimed_by: claimLink.claimed_by_wallet
      });
    }
    const isExpired = new Date() > new Date(claimLink.expires_at);
    if (isExpired) {
      console.log(`❌ Claim code expired: ${code}`);
      return res.status(400).json({
        success: false,
        error: 'This claim code has expired',
        expires_at: claimLink.expires_at
      });
    }
    const solAmount = claimLink.amount_lamports ? (claimLink.amount_lamports / 1e9) : 0;
    console.log(`✅ Valid claim code: ${code}, Amount: ${solAmount} SOL`);
    res.json({
      success: true,
      claim: {
        id: claimLink.id,
        code: claimLink.code,
        amount_sol: solAmount,
        amount_lamports: claimLink.amount_lamports,
        description: claimLink.description,
        expires_at: claimLink.expires_at,
        created_at: claimLink.created_at,
        location_id: claimLink.location_id
      }
    });
  } catch (error) {
    console.error('❌ Server error checking claim status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/claim/process - Process a claim (alias for POST /api/claim)
router.post('/process', async (req, res) => {
  try {
    const { code, walletAddress } = req.body;
    
    // Validate inputs
    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Claim code is required'
      });
    }
    
    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }
    
    console.log(`🎯 Processing claim for code: ${code}, wallet: ${walletAddress}`);
    
    const supabase = getSupabaseAdminClient();
    
    // Fetch claim link
    const { data: claimLink, error: fetchError } = await supabase
      .from('claim_links')
      .select('*')
      .eq('code', code)
      .single();
    
    if (fetchError || !claimLink) {
      console.log(`❌ Claim code not found: ${code}`);
      return res.status(404).json({
        success: false,
        error: 'Claim code not found'
      });
    }
    
    // Check if already claimed
    if (claimLink.claimed_at) {
      console.log(`❌ Claim code already used: ${code}`);
      return res.status(400).json({
        success: false,
        error: 'This claim code has already been used',
        claimed_at: claimLink.claimed_at,
        claimed_by: claimLink.claimer_address
      });
    }
    
    // Check if expired
    const isExpired = new Date() > new Date(claimLink.expires_at);
    if (isExpired) {
      console.log(`❌ Claim code expired: ${code}`);
      return res.status(400).json({
        success: false,
        error: 'This claim code has expired',
        expires_at: claimLink.expires_at
      });
    }
    
    // Calculate SOL amount
    const solAmount = claimLink.amount_lamports ? (claimLink.amount_lamports / 1e9) : 0;
    
    console.log(`💰 Initiating SOL payment: ${solAmount} SOL (${claimLink.amount_lamports} lamports) -> ${walletAddress}`);
    
    // Initialize payment service if not already done
    if (!solanaPaymentService.isInitialized()) {
      console.log('🔄 Initializing payment service...');
      await solanaPaymentService.initialize();
    }
    
    // Send SOL to the claimer's wallet
    let txSignature;
    try {
      txSignature = await solanaPaymentService.sendSOL(walletAddress, claimLink.amount_lamports);
      console.log(`✅ Payment sent successfully! TX: ${txSignature}`);
    } catch (paymentError) {
      console.error('❌ Payment failed:', paymentError);
      return res.status(500).json({
        success: false,
        error: 'Failed to send payment: ' + (paymentError instanceof Error ? paymentError.message : String(paymentError))
      });
    }
    
    console.log(`📝 Updating claim ${code} (ID: ${claimLink.id})`);
    console.log(`   Status: ACTIVE -> CLAIMED`);
    console.log(`   Wallet: ${walletAddress}`);
    console.log(`   TX Sig: ${txSignature}`);
    
    // Update claim link to mark as claimed
    const { data: updatedClaims, error: updateError } = await supabase
      .from('claim_links')
      .update({
        status: 'CLAIMED',
        claimed_at: new Date().toISOString(),
        claimer_address: walletAddress,
        tx_signature: txSignature
      })
      .eq('id', claimLink.id)
      .select();
    
    console.log(`🔍 Update result:`, { 
      error: updateError, 
      dataLength: updatedClaims?.length,
      data: updatedClaims
    });
    
    if (updateError || !updatedClaims || updatedClaims.length === 0) {
      console.error(`❌ Failed to mark claim as used: ${code}`, updateError);
      console.error(`❌ Data returned:`, updatedClaims);
      return res.status(500).json({
        success: false,
        error: 'Failed to process claim'
      });
    }
    
    const updatedClaim = updatedClaims[0];
    console.log(`✅ Claim processed successfully: ${code} -> ${walletAddress}, Amount: ${solAmount} SOL`);
    
    res.json({
      success: true,
      message: `Successfully claimed ${solAmount} SOL!`,
      transactionHash: txSignature,
      amountSol: solAmount.toString(),
      claim: {
        id: updatedClaim.id,
        code: updatedClaim.code,
        amount_sol: solAmount,
        amount_lamports: updatedClaim.amount_lamports,
        description: updatedClaim.note,
        claimed_at: updatedClaim.claimed_at,
        claimed_by: updatedClaim.claimer_address,
        tx_signature: updatedClaim.tx_signature
      }
    });
  } catch (error) {
    console.error('❌ Server error processing claim:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/claim - Process a claim (redirects to /process for real payment)
router.post('/', async (req, res) => {
  // Convert legacy format to new format
  const { code, wallet_address, walletAddress } = req.body;
  const finalWallet = walletAddress || wallet_address;
  
  console.log(`🔄 Legacy endpoint called - redirecting to real payment processor`);
  console.log(`   Code: ${code}, Wallet: ${finalWallet}`);
  
  // Use the same logic as /process endpoint for REAL payments
  try {
    const validatedCode = code;
    const validatedWallet = finalWallet;
    
    // Validate inputs
    if (!validatedCode || typeof validatedCode !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Claim code is required'
      });
    }
    
    if (!validatedWallet || typeof validatedWallet !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }
    
    console.log(`🎯 Processing claim for code: ${validatedCode}, wallet: ${validatedWallet}`);
    
    const supabase = getSupabaseAdminClient();
    
    // Fetch claim link
    const { data: claimLink, error: fetchError } = await supabase
      .from('claim_links')
      .select('*')
      .eq('code', validatedCode)
      .single();
    
    if (fetchError || !claimLink) {
      console.log(`❌ Claim code not found: ${validatedCode}`);
      return res.status(404).json({
        success: false,
        error: 'Claim code not found'
      });
    }
    
    // Check if already claimed
    if (claimLink.claimed_at) {
      console.log(`❌ Claim code already used: ${validatedCode}`);
      return res.status(400).json({
        success: false,
        error: 'This claim code has already been used',
        claimed_at: claimLink.claimed_at,
        claimed_by: claimLink.claimer_address
      });
    }
    
    // Check if expired
    const isExpired = new Date() > new Date(claimLink.expires_at);
    if (isExpired) {
      console.log(`❌ Claim code expired: ${validatedCode}`);
      return res.status(400).json({
        success: false,
        error: 'This claim code has expired',
        expires_at: claimLink.expires_at
      });
    }
    
    // Calculate SOL amount
    const solAmount = claimLink.amount_lamports ? (claimLink.amount_lamports / 1e9) : 0;
    
    console.log(`💰 Initiating REAL SOL payment: ${solAmount} SOL (${claimLink.amount_lamports} lamports) -> ${validatedWallet}`);
    
    // Initialize payment service if not already done
    if (!solanaPaymentService.isInitialized()) {
      console.log('🔄 Initializing payment service...');
      await solanaPaymentService.initialize();
    }
    
    // Send REAL SOL to the claimer's wallet
    let txSignature;
    try {
      txSignature = await solanaPaymentService.sendSOL(validatedWallet, claimLink.amount_lamports);
      console.log(`✅ REAL payment sent successfully! TX: ${txSignature}`);
    } catch (paymentError) {
      console.error('❌ Payment failed:', paymentError);
      return res.status(500).json({
        success: false,
        error: 'Failed to send payment: ' + (paymentError instanceof Error ? paymentError.message : String(paymentError))
      });
    }
    
    console.log(`📝 Updating claim ${validatedCode} (ID: ${claimLink.id})`);
    console.log(`   Status: ACTIVE -> CLAIMED`);
    console.log(`   Wallet: ${validatedWallet}`);
    console.log(`   TX Sig: ${txSignature}`);
    
    // Update claim link to mark as claimed with REAL TX
    const { data: updatedClaims, error: updateError } = await supabase
      .from('claim_links')
      .update({
        status: 'CLAIMED',
        claimed_at: new Date().toISOString(),
        claimer_address: validatedWallet,
        tx_signature: txSignature
      })
      .eq('id', claimLink.id)
      .select();
    
    console.log(`🔍 Update result:`, { 
      error: updateError, 
      dataLength: updatedClaims?.length,
      data: updatedClaims
    });
    
    if (updateError || !updatedClaims || updatedClaims.length === 0) {
      console.error(`❌ Failed to mark claim as used: ${validatedCode}`, updateError);
      console.error(`❌ Data returned:`, updatedClaims);
      return res.status(500).json({
        success: false,
        error: 'Failed to process claim'
      });
    }
    
    const updatedClaim = updatedClaims[0];
    console.log(`✅ Claim processed successfully with REAL SOL payment: ${validatedCode} -> ${validatedWallet}, Amount: ${solAmount} SOL, TX: ${txSignature}`);
    
    res.json({
      success: true,
      message: `Successfully claimed ${solAmount} SOL!`,
      transactionHash: txSignature,
      amountSol: solAmount.toString(),
      claim: {
        id: updatedClaim.id,
        code: updatedClaim.code,
        amount_sol: solAmount,
        amount_lamports: updatedClaim.amount_lamports,
        description: updatedClaim.note,
        claimed_at: updatedClaim.claimed_at,
        claimed_by: updatedClaim.claimer_address,
        tx_signature: updatedClaim.tx_signature
      }
    });
  } catch (error) {
    console.error('❌ Server error processing claim:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;



router.get('/debug', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    console.log('🔍 Debug: Checking community_tweets table...');
    const { data: tableInfo } = await supabase
      .from('information_schema.tables')
      .select('*')
      .eq('table_name', 'community_tweets');
    console.log('📋 Table exists:', tableInfo ? 'YES' : 'NO');
    const { data: columns } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'community_tweets');
    console.log('📊 Table columns:', columns?.map(c => c.column_name));
    const { data: allRecords, error: recordError } = await supabase
      .from('community_tweets')
      .select('*');
    console.log('📝 Records found:', allRecords?.length || 0);
    console.log('🔍 Sample record:', allRecords?.[0]);
    if (recordError) {
      console.error('❌ Query error:', recordError);
    }
    res.json({
      success: true,
      tableExists: !!tableInfo,
      columns: columns || [],
      recordCount: allRecords?.length || 0,
      sampleRecord: allRecords?.[0] || null,
      allRecords: allRecords || [],
      error: recordError?.message
    });
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Database debug failed'
    });
  }
});

module.exports = router;




/**
 * GET /api/giveaway
 * Get today's giveaway information and entries
 */
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    const today = new Date().toISOString().split('T')[0];

    console.log('📊 Fetching giveaway data for:', today);

    // Get or create today's giveaway
    let { data: giveaway, error: giveawayError } = await supabase
      .from('daily_giveaways')
      .select('*')
      .eq('date', today)
      .single();

    // If no giveaway exists for today, create one
    if (giveawayError || !giveaway) {
      console.log('📝 Creating new giveaway for today...');
      
      const { data: newGiveaway, error: createError } = await supabase
        .from('daily_giveaways')
        .insert({
          date: today,
          prize_pool_sol: 0.3,
          is_active: true,
          is_completed: false
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Failed to create giveaway:', createError);
        throw createError;
      }

      giveaway = newGiveaway;
      console.log('✅ Created new giveaway:', giveaway.id);
    }

    // Get entries for today's giveaway
    const { data: entries, error: entriesError } = await supabase
      .from('giveaway_entries')
      .select('*')
      .eq('giveaway_id', giveaway.id)
      .order('created_at', { ascending: false });

    if (entriesError) {
      console.error('❌ Failed to fetch entries:', entriesError);
    }

    // Get latest winner
    const { data: latestWinner, error: winnerError } = await supabase
      .from('giveaway_winners')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (winnerError && winnerError.code !== 'PGRST116') {
      console.warn('⚠️  Failed to fetch latest winner:', winnerError);
    }

    // Determine if submissions are allowed
    const now = new Date();
    const currentHourUTC = now.getUTCHours();
    const currentMinutesUTC = now.getUTCMinutes();
    
    // Block submissions during cutoff period (3PM-5:10PM UTC)
    const inCutoffPeriod = (currentHourUTC === 15 || currentHourUTC === 16) || 
                           (currentHourUTC === 17 && currentMinutesUTC < 10);
    
    // Allow submissions when NOT in cutoff period, regardless of completion status
    // Completion status only affects display, not submission ability
    const canSubmit = giveaway.is_active && !inCutoffPeriod;

    console.log('🔍 GIVEAWAY TIMING DEBUG:', {
      currentUTC: now.toISOString(),
      currentHourUTC,
      currentMinutesUTC,
      inCutoffPeriod,
      isActive: giveaway.is_active,
      isCompleted: giveaway.is_completed,
      canSubmit,
      calculation: `${giveaway.is_active} && !${inCutoffPeriod} = ${canSubmit}`
    });

    console.log('✅ Giveaway data:', {
      id: giveaway.id,
      date: giveaway.date,
      entries: entries?.length || 0,
      canSubmit,
      isCompleted: giveaway.is_completed
    });

    res.json({
      success: true,
      giveaway: {
        id: giveaway.id,
        target_date: giveaway.date,
        actual_market_cap: giveaway.actual_market_cap,
        is_completed: giveaway.is_completed,
        prize_amount: giveaway.prize_pool_sol || 0.3,
        snapshot_time: giveaway.snapshot_time
      },
      entries: entries || [],
      latestWinner: latestWinner || null,
      canSubmit: canSubmit,
      isDisplayWindow: !inCutoffPeriod,
      message: canSubmit ? 'Giveaway is active!' : 'Submissions temporarily closed'
    });

  } catch (error) {
    console.error('❌ Giveaway API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch giveaway data',
      canSubmit: false,
      isDisplayWindow: false
    });
  }
});

/**
 * POST /api/giveaway
 * Submit a giveaway entry
 */
router.post('/', async (req, res) => {
  try {
    const { walletAddress, guessedMarketCap } = req.body;

    // Validate input
    if (!walletAddress || !guessedMarketCap) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address and market cap guess are required'
      });
    }

    if (typeof guessedMarketCap !== 'number' || guessedMarketCap <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid market cap guess'
      });
    }

    const supabase = getSupabaseAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Get today's giveaway
    const { data: giveaway, error: giveawayError } = await supabase
      .from('daily_giveaways')
      .select('*')
      .eq('date', today)
      .single();

    if (giveawayError || !giveaway) {
      return res.status(404).json({
        success: false,
        error: 'No active giveaway found for today'
      });
    }

    if (giveaway.is_completed) {
      return res.status(400).json({
        success: false,
        error: 'Today\'s giveaway has already been completed'
      });
    }

    // Check if user already submitted
    const { data: existingEntry } = await supabase
      .from('giveaway_entries')
      .select('id')
      .eq('giveaway_id', giveaway.id)
      .eq('wallet_address', walletAddress)
      .single();

    if (existingEntry) {
      return res.status(400).json({
        success: false,
        error: 'You have already submitted a guess for today'
      });
    }

    // Create entry
    const { data: entry, error: entryError } = await supabase
      .from('giveaway_entries')
      .insert({
        giveaway_id: giveaway.id,
        wallet_address: walletAddress,
        guessed_market_cap: guessedMarketCap,
        contract_address: 'pump.fun'
      })
      .select()
      .single();

    if (entryError) {
      console.error('❌ Failed to create entry:', entryError);
      throw entryError;
    }

    console.log('✅ Entry created:', entry.id);

    res.json({
      success: true,
      message: 'Your guess has been submitted successfully!',
      entry: {
        id: entry.id,
        guessed_market_cap: entry.guessed_market_cap,
        submitted_at: entry.created_at
      }
    });

  } catch (error) {
    console.error('❌ Giveaway submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit entry'
    });
  }
});

module.exports = router;






// Debug middleware for API layer
router.use((req, res, next) => {
  console.log(`🔍 API Router: ${req.method} ${req.path}`);
  next();
});

// Mount API routes

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'WhatNext API Server'
  });
});

// Video test page
router.get('/video-test', (req, res) => {
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'https://web-production-061ff.up.railway.app';
  const testVideoUrl = `${baseUrl}/uploads/1759845757754-4146415-uhd_3840_2160_25fps.mp4`;
  
  // Use single quotes for the outer string and escape all inner backticks and ${} for template literals
  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '    <meta charset="UTF-8">',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '    <title>Video Test - What Next</title>',
    '    <style>',
    '        body { background: #000; color: #fff; font-family: Arial, sans-serif; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }',
    '        .container { max-width: 1000px; width: 100%; text-align: center; }',
    '        h1 { color: #3aa9ff; margin-bottom: 30px; }',
    '        .video-container { background: #222; border: 2px solid #3aa9ff; border-radius: 10px; padding: 20px; margin: 20px 0; }',
    '        video { width: 100%; max-width: 800px; height: auto; border-radius: 8px; }',
    '        .info { background: #333; padding: 15px; border-radius: 8px; margin: 10px 0; text-align: left; }',
    '        .status { padding: 10px; margin: 10px 0; border-radius: 5px; font-weight: bold; }',
    '        .success { background: #0a5d0a; }',
    '        .error { background: #5d0a0a; }',
    '        .warning { background: #5d5d0a; }',
    '        .log { background: #1a1a1a; padding: 15px; border-radius: 8px; margin: 20px 0; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px; text-align: left; }',
    '        button { background: #3aa9ff; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px; margin: 5px; }',
    '        button:hover { background: #2a89df; }',
    '        .url-link { color: #3aa9ff; word-break: break-all; text-decoration: none; padding: 5px; border: 1px solid #3aa9ff; border-radius: 4px; display: inline-block; margin: 10px 0; }',
    '    </style>',
    '</head>',
    '<body>',
    '    <div class="container">',
    '        <h1>🎬 Video Test Page</h1>',
    '        <div class="info">',
    '            <strong>Testing Video:</strong><br>',
    `            <a href="${testVideoUrl}" target="_blank" class="url-link">`,
    `                ${testVideoUrl}`,
    '            </a>',
    '        </div>',
    '        <div id="status" class="status warning">⏳ Initializing video test...</div>',
    '        <div class="video-container">',
    '            <h3>Direct Video Element Test</h3>',
    '            <video id="testVideo" controls preload="metadata" style="background: black;">',
    `                <source src="${testVideoUrl}" type="video/mp4">`,
    '                Your browser does not support the video tag.',
    '            </video>',
    '        </div>',
    '        <div>',
    '            <button onclick="playVideo()">▶️ Play Video</button>',
    '            <button onclick="pauseVideo()">⏸️ Pause Video</button>',
    '            <button onclick="reloadVideo()">🔄 Reload Video</button>',
    '            <button onclick="testUrl()">🔗 Open Direct URL</button>',
    '        </div>',
    '        <div class="log" id="eventLog"><strong>📋 Event Log:</strong><br></div>',
    '        <div class="info">',
    '            <strong>📊 Video Information:</strong><br>',
    '            <span id="videoInfo">Loading...</span>',
    '        </div>',
    '    </div>',
    '    <script>',
    '        const video = document.getElementById("testVideo");',
    '        const status = document.getElementById("status");',
    '        const eventLog = document.getElementById("eventLog");',
    '        const videoInfo = document.getElementById("videoInfo");',
    '        let logCount = 0;',
    '        function addLog(message, type) {',
    '            if (type === undefined) type = "info";',
    '            logCount++;',
    '            const timestamp = new Date().toLocaleTimeString();',
    '            const colors = { success: "#4ade80", error: "#ef4444", warning: "#f59e0b", info: "#94a3b8" };',
  '            eventLog.innerHTML += "<div style=\'color: ' + colors[type] + ';\'>" + logCount + ". [" + timestamp + "] " + message + "</div>";',
    '            eventLog.scrollTop = eventLog.scrollHeight;',
    '            console.log(logCount + ". [" + timestamp + "] " + message);',
    '        }',
    '        function updateStatus(message, type) {',
    '            status.textContent = message;',
    '            status.className = "status " + type;',
    '        }',
    '        function updateVideoInfo() {',
    '            if (video.videoWidth && video.videoHeight) {',
    '                videoInfo.innerHTML = "Width: " + video.videoWidth + "px, Height: " + video.videoHeight + "px<br>" +',
    '                    "Duration: " + (video.duration ? video.duration.toFixed(2) + "s" : "Unknown") + "<br>" +',
    '                    "Current Time: " + video.currentTime.toFixed(2) + "s<br>" +',
    '                    "Paused: " + video.paused + ", Muted: " + video.muted + ", Volume: " + video.volume + "<br>" +',
    '                    "Ready State: " + video.readyState + ", Network State: " + video.networkState;',
    '            } else {',
    '                videoInfo.textContent = "Video dimensions not available yet";',
    '            }',
    '        }',
    '        video.addEventListener("loadstart", function() { addLog("🔄 Load started", "info"); updateStatus("🔄 Loading...", "warning"); });',
    '        video.addEventListener("loadedmetadata", function() { addLog("📊 Metadata loaded - " + video.videoWidth + "x" + video.videoHeight, "success"); updateVideoInfo(); });',
    '        video.addEventListener("loadeddata", function() { addLog("📊 Data loaded", "success"); updateVideoInfo(); });',
    '        video.addEventListener("canplay", function() { addLog("✅ Can play", "success"); updateStatus("✅ Ready to play!", "success"); });',
    '        video.addEventListener("canplaythrough", function() { addLog("✅ Can play through", "success"); });',
    '        video.addEventListener("play", function() { addLog("▶️ Playing", "success"); updateStatus("▶️ Playing", "success"); });',
    '        video.addEventListener("pause", function() { addLog("⏸️ Paused", "warning"); updateStatus("⏸️ Paused", "warning"); });',
    '        video.addEventListener("ended", function() { addLog("🏁 Ended", "info"); updateStatus("🏁 Finished", "warning"); });',
    '        video.addEventListener("error", function(e) {',
    '            var error = video.error;',
    '            var codes = ["", "MEDIA_ERR_ABORTED", "MEDIA_ERR_NETWORK", "MEDIA_ERR_DECODE", "MEDIA_ERR_SRC_NOT_SUPPORTED"];',
    '            var errorMessage = error ? (codes[error.code] || ("Error " + error.code)) : "Unknown error";',
    '            addLog("❌ Error: " + errorMessage, "error");',
    '            updateStatus("❌ " + errorMessage, "error");',
    '        });',
    '        video.addEventListener("stalled", function() { addLog("⚠️ Stalled", "warning"); });',
    '        video.addEventListener("waiting", function() { addLog("⏳ Waiting", "warning"); });',
    '        video.addEventListener("timeupdate", updateVideoInfo);',
    '        function playVideo() { video.play().then(function() { addLog("▶️ Play() succeeded", "success"); }).catch(function(err) { addLog("❌ Play() failed: " + err.message, "error"); }); }',
    '        function pauseVideo() { video.pause(); }',
    '        function reloadVideo() { addLog("🔄 Reloading...", "info"); video.load(); }',
    `        function testUrl() { window.open("${testVideoUrl}", "_blank"); }`,
    '        addLog("🎬 Video test page loaded");',
    '        updateVideoInfo();',
    '    </script>',
    '</body>',
    '</html>'
  ].join('\n');
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

module.exports = router;




// Helper function for admin debug requests
async function handleDebugRequest(res) {
  console.log('?? DEBUG: Checking database tables...');
  try {
    const supabase = getSupabaseAdminClient();
    // Check spend_log table
    const { data: spendData, error: spendError } = await supabase
      .from('spend_log')
      .select('*')
      .limit(5);
    // Check claim_links table  
    const { data: claimData, error: claimError } = await supabase
      .from('claim_links')
      .select('*')
      .limit(5);
    // Check content_entries table
    const { data: contentData, error: contentError } = await supabase
      .from('content_entries')
      .select('*')
      .limit(5);
    return res.json({
      debug: true,
      tables: {
        spend_log: { 
          count: spendData?.length || 0, 
          data: spendData, 
          error: spendError?.message 
        },
        claim_links: { 
          count: claimData?.length || 0, 
          data: claimData, 
          error: claimError?.message 
        },
        content_entries: { 
          count: contentData?.length || 0, 
          data: contentData, 
          error: contentError?.message 
        }
      }
    });
  } catch (error) {
    console.error('Debug error:', error);
    return res.status(500).json({ debug: true, error: 'Debug failed' });
  }
}

// Helper function for ecosystem admin requests
async function handleEcosystemAdmin(res) {
  try {
    const supabase = getSupabaseAdminClient();
    console.log('?? Admin ecosystem via locations: Fetching spending data...');
    const { data: spendEntries, error: spendError } = await supabase
      .from('spend_log')
      .select('*')
      .order('spent_at', { ascending: false });
    if (spendError) {
      console.error('Error fetching spend entries:', spendError);
      return res.status(500).json({ success: false, error: 'Failed to fetch spending entries' });
    }
    console.log(`? Found ${spendEntries?.length || 0} spend entries`);
    const entries = (spendEntries || []).map((entry) => ({
      id: entry.id.toString(),
      title: entry.title || entry.description || 'Untitled',
      amount: entry.amount_usd || entry.amount_sol || 0,
      currency: entry.amount_usd ? 'USD' : 'SOL',
      description: entry.description || '',
      spent_at: entry.spent_at || entry.created_at,
      created_at: entry.created_at,
      updated_at: entry.updated_at || entry.created_at
    }));
    return res.json({
      success: true,
      entries: entries
    });
  } catch (error) {
    console.error('Error in admin ecosystem:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// Helper function for admin claims requests
async function handleAdminClaims(res) {
  console.log('🔍 Admin claims request via locations endpoint');
  try {
    const supabase = getSupabaseAdminClient();
    const { data: claimData, error: claimError } = await supabase
      .from('claim_links')
      .select('*')
      .order('created_at', { ascending: false });
    if (claimError) {
      console.error('Error fetching claims:', claimError);
      return res.status(500).json({ success: false, error: 'Failed to fetch claims' });
    }
    const claims = (claimData || []).map((claim) => {
      const isExpired = new Date() > new Date(claim.expires_at);
      let computedStatus = 'ACTIVE';
      if (claim.claimed_at) {
        computedStatus = 'CLAIMED';
      } else if (isExpired) {
        computedStatus = 'EXPIRED';
      }
      return {
        id: claim.id.toString(),
        code: claim.code,
        amount_usd: claim.amount_usd || (claim.amount_lamports ? claim.amount_lamports / 1e9 : 0),
        amount_sol: claim.amount_sol,
        amount_lamports: claim.amount_lamports,
        status: claim.status || 'ACTIVE',
        computed_status: computedStatus,
        created_at: claim.created_at,
        expires_at: claim.expires_at,
        claimed_at: claim.claimed_at,
        claimed_by: claim.claimed_by,
        note: claim.note,
        view_count: claim.view_count || 0
      };
    });
    return res.json({
      success: true,
      claims: claims
    });
  } catch (error) {
    console.error('Error in admin claims:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// Helper function to process content entries
function processContentEntries(contentEntries, dbLocations) {
  if (contentEntries && contentEntries.length > 0) {
    console.log('\n=== CONTENT ENTRIES BY LOCATION ===');
    const contentByLocation = {};
    for (const content of contentEntries) {
      const locId = content.location_id;
      if (!contentByLocation[locId]) {
        const location = dbLocations.find(l => l.id === locId);
        contentByLocation[locId] = {
          locationName: location?.name || 'Unknown',
          countryISO3: location?.country_iso3 || 'Unknown',
          videos: []
        };
      }
      contentByLocation[locId].videos.push({
        title: content.title,
        url: content.media_url,
        status: content.status
      });
    }
    
    for (const [, data] of Object.entries(contentByLocation)) {
      console.log(`\n📍 ${data.locationName} (${data.countryISO3}):`);
      for (const [i, video] of data.videos.entries()) {
        console.log(`   ${i+1}. "${video.title}" - ${video.status}`);
        console.log(`      URL: ${video.url.substring(0, 60)}...`);
      }
    }
  }
}

// Helper function to log database locations
function logDatabaseLocations(dbLocations) {
  for (const [index, loc] of dbLocations.entries()) {
    console.log(`\n${index + 1}. LOCATION IN YOUR DATABASE:`);
    console.log(`   ID: ${loc.id}`);
    console.log(`   Name: "${loc.name}"`);
    console.log(`   Country ISO3: "${loc.country_iso3 || loc.countryISO3 || 'MISSING'}"`);
    console.log(`   Coordinates: lng=${loc.lng}, lat=${loc.lat}`);
    console.log(`   Status: "${loc.status || 'MISSING'}"`);
    console.log(`   Description: "${loc.description || 'MISSING'}"`);
    console.log(`   Created: ${loc.created_at}`);
    console.log(`   Updated: ${loc.updated_at}`);
    console.log(`   All database fields:`, Object.keys(loc));
    console.log(`   Full data:`, JSON.stringify(loc, null, 2));
  }
}

// Helper function to format locations
function formatLocationsData(dbLocations, contentEntries) {
  return dbLocations
    .map((loc) => {
      const locationContent = (contentEntries || []).filter(
        (content) => content.location_id === loc.id
      );
      
      if (!locationContent || locationContent.length === 0) {
        console.log(`⚠️ Skipping "${loc.name}" (${loc.country_iso3}) - no published content`);
        return null;
      }
      
      console.log(`✅ Including "${loc.name}" (${loc.country_iso3}) with ${locationContent.length} video(s)`);
      
      const media = locationContent.map((content) => ({
        id: content.id,
        type: content.content_type || 'video',
        url: content.media_url || '',
        title: content.title || 'Untitled',
        description: content.description || '',
        thumbnail: content.thumbnail || '',
        duration: content.duration || undefined,
        isFeatured: content.is_featured || false,
        viewCount: content.view_count || 0,
        tags: content.tags || [],
        createdAt: content.created_at,
        metadata: {
          originalTitle: content.title,
          uploadedAt: content.created_at
        }
      }));
      return {
        id: loc.id,
        name: loc.name,
        countryISO3: loc.country_iso3 || loc.countryISO3 || 'UNKNOWN',
        coordinates: [Number.parseFloat(loc.lng), Number.parseFloat(loc.lat)],
        lat: Number.parseFloat(loc.lat),
        lng: Number.parseFloat(loc.lng),
        description: loc.description || `Location in ${loc.name}`,
        status: loc.status || 'active',
        summary: loc.summary || loc.description,
        tags: loc.tags || [],
        slug: loc.slug || (loc.name ? loc.name.toLowerCase().replaceAll(/\s+/g, '-') : undefined),
        visitedDate: loc.visited_date || (loc.created_at ? loc.created_at.split('T')[0] : undefined),
        viewCount: loc.view_count || 0,
        isFeatured: loc.is_featured || false,
        mediaCount: media.length,
        media: media
      };
    })
    .filter(Boolean);
}

// Helper function for main locations processing
async function handleMainLocations(res) {
  console.log('📍 DETAILED DATABASE INSPECTION - SHOWING ALL YOUR DATA');
  try {
    const supabase = getSupabaseAdminClient();
    const { data: dbLocations, error } = await supabase
      .from('locations')
      .select('*')
      .order('created_at', { ascending: false });
    console.log('\n=== YOUR DATABASE LOCATIONS ===');
    console.log(`Total locations found: ${dbLocations?.length || 0}`);
    if (error) {
      console.error('❌ Database error:', error);
      return res.json({ success: true, locations: [] });
    }
    if (!dbLocations || dbLocations.length === 0) {
      console.log('📍 No locations in your database');
      return res.json({ success: true, locations: [] });
    }
    // Get content entries
    const { data: contentEntries, error: contentError } = await supabase
      .from('content_entries')
      .select('*')
      .not('location_id', 'is', null)
      .eq('status', 'published')
      .neq('media_url', '[PENDING]')
      .not('media_url', 'is', null)
      .order('created_at', { ascending: false});
    if (contentError) {
      console.error('❌ Content error:', contentError);
    }
    console.log(`📄 Found ${contentEntries?.length || 0} published content entries with valid media`);
    
    // Process and log content
    processContentEntries(contentEntries, dbLocations);
    logDatabaseLocations(dbLocations);
    
    // Format locations
    const locations = formatLocationsData(dbLocations, contentEntries);
    console.log('\n=== FORMATTED LOCATIONS BEING SENT TO MAP ===');
    for (const [i, l] of locations.entries()) {
      if (l) {
        console.log(`${i+1}. "${l.name}" (${l.countryISO3}) - [${l.lng}, ${l.lat}]`);
      }
    }
    return res.json({ success: true, locations });
  } catch (err) {
    console.error('💥 Error:', err);
    return res.json({ success: true, locations: [] });
  }
}

router.get('/', async (req, res) => {
  const adminType = req.query.admin;
  if (adminType === 'debug') {
    return await handleDebugRequest(res);
  }
  if (adminType === 'ecosystem') {
    return await handleEcosystemAdmin(res);
  }
  if (adminType === 'claims') {
    return await handleAdminClaims(res);
  }
  // Main locations endpoint
  return await handleMainLocations(res);
});

module.exports = router;




// GET /api/media - Get media files and content
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 50;
    const offset = (page - 1) * limit;
    // Get media from database
    const { data: mediaData, error, count } = await supabase
      .from('media')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      console.error('Error fetching media:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch media'
      });
    }
    // Format media data
    const formattedMedia = (mediaData || []).map((media) => ({
      id: media.id,
      filename: media.filename || media.file_name,
      originalName: media.original_name || media.filename,
      url: media.url || media.media_url,
      type: media.type || media.media_type || 'unknown',
      size: media.size || media.file_size || 0,
      mimeType: media.mime_type || 'application/octet-stream',
      locationId: media.location_id,
      isPublic: media.is_public === undefined || media.is_public,
      uploadedAt: media.created_at || media.uploaded_at,
      updatedAt: media.updated_at,
      metadata: media.metadata || {}
    }));
    return res.json({
      success: true,
      media: formattedMedia,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        hasNext: (page * limit) < (count || 0),
        hasPrev: page > 1
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in media endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/media/:id - Get specific media file by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseAdminClient();
    const { data: mediaItem, error } = await supabase
      .from('media')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !mediaItem) {
      return res.status(404).json({
        success: false,
        error: 'Media not found'
      });
    }
    const formattedMedia = {
      id: mediaItem.id,
      filename: mediaItem.filename || mediaItem.file_name,
      originalName: mediaItem.original_name || mediaItem.filename,
      url: mediaItem.url || mediaItem.media_url,
      type: mediaItem.type || mediaItem.media_type || 'unknown',
      size: mediaItem.size || mediaItem.file_size || 0,
      mimeType: mediaItem.mime_type || 'application/octet-stream',
      locationId: mediaItem.location_id,
      isPublic: mediaItem.is_public === undefined || mediaItem.is_public,
      uploadedAt: mediaItem.created_at || mediaItem.uploaded_at,
      updatedAt: mediaItem.updated_at,
      metadata: mediaItem.metadata || {}
    };
    return res.json({
      success: true,
      media: formattedMedia
    });
  } catch (error) {
    console.error('Error fetching media by ID:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;




// GET /api/metadata - Get application metadata and configuration
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    // Get basic app settings
    const { data: settings, error: settingsError } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', [
        'app_name',
        'app_version',
        'app_description',
        'contract_address',
        'community_members',
        'total_locations',
        'total_creators'
      ]);
    if (settingsError) {
      console.error('Error fetching app settings:', settingsError);
    }
    // Convert settings array to object
    const settingsObj = {};
    if (settings) {
      for (const setting of settings) {
        settingsObj[setting.key] = setting.value;
      }
    }
    // Get stats
    const { count: locationsCount } = await supabase
      .from('locations')
      .select('*', { count: 'exact', head: true });
    const { count: mediaCount } = await supabase
      .from('media')
      .select('*', { count: 'exact', head: true });
    const metadata = {
      app: {
        name: settingsObj.app_name || 'WhatNext',
        version: settingsObj.app_version || '1.0.0',
        description: settingsObj.app_description || 'Interactive world map streaming platform',
        lastUpdated: new Date().toISOString()
      },
      stats: {
        totalLocations: locationsCount || 0,
        totalMedia: mediaCount || 0,
        communityMembers: Number.parseInt(settingsObj.community_members || '1337', 10),
        totalCreators: Number.parseInt(settingsObj.total_creators || '2340', 10)
      },
      contract: {
        address: settingsObj.contract_address || null,
        isConfigured: Boolean(settingsObj.contract_address && settingsObj.contract_address !== 'YOUR_CONTRACT_ADDRESS_HERE')
      },
      features: {
        pumpfunIntegration: true,
        giveawaySystem: true,
        qrCodes: true,
        analytics: true,
        adminDashboard: true
      },
      api: {
        version: 'v1',
        endpoints: [
          '/api/locations',
          '/api/stats',
          '/api/ecosystem',
          '/api/giveaway',
          '/api/pumpfun',
          '/api/admin/*'
        ]
      }
    };
    res.json(metadata);
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.status(500).json({
      error: 'Failed to fetch metadata',
      app: {
        name: 'WhatNext',
        version: '1.0.0',
        description: 'Interactive world map streaming platform'
      }
    });
  }
});

module.exports = router;




router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    // Fetch all claim links (QR codes) from the database
    const { data: claimLinks, error } = await supabase
      .from('claim_links')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('❌ Database error fetching claim links:', error);
      return res.status(500).json({
        error: 'Failed to fetch QR codes',
        details: error.message
      });
    }
    // Fetch live SOL price
    let solPrice = 0;
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      if (!response.ok) throw new Error('Failed to fetch SOL price');
      const data = await response.json();
      solPrice = data.solana?.usd;
      if (!solPrice || typeof solPrice !== 'number') throw new Error('Invalid SOL price');
    } catch (err) {
      console.error('❌ Failed to fetch live SOL price:', err);
      return res.status(500).json({ error: 'Failed to fetch live SOL price', details: err instanceof Error ? err.message : String(err) });
    }
    // Process and format the QR codes data
    const qrCodes = (claimLinks || []).map((claim) => {
      const isExpired = new Date() > new Date(claim.expires_at);
      let status = 'ACTIVE';
      if (claim.claimed_at) {
        status = 'CLAIMED';
      } else if (isExpired) {
        status = 'EXPIRED';
      }
      // Convert lamports to SOL
      const solAmount = claim.amount_lamports ? (claim.amount_lamports / 1e9) : 0;
      const usdAmount = claim.amount_usd || (solAmount * solPrice);
      return {
        id: claim.id,
        code: claim.code,
        amount: solAmount,
        amount_sol: solAmount,
        amount_usd: usdAmount,
        amount_lamports: claim.amount_lamports || 0,
        currency: 'SOL',
        status,
        description: claim.description || `QR Code: ${claim.code}`,
        created_at: claim.created_at,
        expires_at: claim.expires_at,
        claimed_at: claim.claimed_at,
        claimed_by: claim.claimed_by_wallet,
        location_id: claim.location_id,
        transaction_hash: claim.transaction_hash,
        display_amount: `${solAmount.toFixed(6)} SOL ($${usdAmount.toFixed(2)})`
      };
    });
    // Calculate totals
    let totalAmount = 0;
    for (const qr of qrCodes) {
      totalAmount += (qr.amount || 0);
    }
    const activeCodes = qrCodes.filter(qr => qr.status === 'ACTIVE');
    const claimedCodes = qrCodes.filter(qr => qr.status === 'CLAIMED');
    const expiredCodes = qrCodes.filter(qr => qr.status === 'EXPIRED');
    console.log(`✅ Fetched ${qrCodes.length} QR codes from claim_links table`);
    res.json({
      success: true,
      qr_codes: qrCodes,
      totals: {
        total_codes: qrCodes.length,
        active_codes: activeCodes.length,
        claimed_codes: claimedCodes.length,
        expired_codes: expiredCodes.length,
        total_amount_sol: totalAmount,
        total_amount_usd: totalAmount * solPrice
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Server error fetching QR codes:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;




router.get('/', async (req, res) => {
  try {
    console.log('🔍 RAW DATABASE DUMP - SHOWING EVERYTHING');
    const supabase = getSupabaseAdminClient();
    const { data: allLocations, error } = await supabase
      .from('locations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({ error: error.message });
    }
    console.log(`\n📊 TOTAL LOCATIONS IN DATABASE: ${allLocations?.length || 0}`);
    if (allLocations && allLocations.length > 0) {
      console.log('\n📍 RAW DATABASE RECORDS:');
      for (const [i, loc] of allLocations.entries()) {
        console.log(`\n--- LOCATION ${i + 1} ---`);
        console.log(`ID: ${loc.id}`);
        console.log(`Name: "${loc.name}"`);
        console.log(`Created: ${loc.created_at}`);
        console.log(`Country ISO3: "${loc.country_iso3}"`);
        console.log(`Coordinates: lng=${loc.lng}, lat=${loc.lat}`);
        console.log(`Status: "${loc.status}"`);
        console.log(`Description: "${loc.description}"`);
        console.log(`Complete record:`, JSON.stringify(loc, null, 2));
      }
    }
    return res.json({
      success: true,
      total: allLocations?.length || 0,
      locations: allLocations || []
    });
  } catch (err) {
    console.error('💥 Raw dump failed:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

module.exports = router;




// GET /api/roadmap - Get public roadmap data from database
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    const includeTasks = req.query.include_tasks === 'true' || req.query.includeTasks === 'true';
    console.log('??? Express roadmap API: Fetching steps from database...');
    // Get roadmap steps from database
    const { data: stepsData, error: stepsError } = await supabase
      .from('roadmap_steps')
      .select('*')
      .order('step_number');
    if (stepsError) {
      console.error('? Express roadmap steps error:', stepsError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch roadmap steps',
        details: stepsError.message
      });
    }
    console.log(`? Express roadmap: Found ${stepsData?.length || 0} steps`);
    let tasksData = [];
    if (includeTasks) {
      console.log('? Express roadmap: Fetching tasks from database...');
      const { data: tasks, error: tasksError } = await supabase
        .from('roadmap_tasks')
        .select('*')
        .order('roadmap_step_id, order_index');
      if (tasksError) {
        console.error('? Express roadmap tasks error:', tasksError);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch roadmap tasks',
          details: tasksError.message
        });
      } else {
        tasksData = tasks || [];
        console.log(`? Express roadmap: Found ${tasksData.length} tasks`);
      }
    }
    // Transform database data to match frontend format
    const transformedSteps = (stepsData || []).map((step) => {
      const stepTasks = includeTasks ?
        tasksData.filter((task) => task.roadmap_step_id === step.id) : [];
      return {
        id: step.id.toString(),
        stepNumber: step.step_number || step.phase_order || 1,
        title: step.title || step.name || 'Untitled Step',
        description: step.description || '',
        status: step.status || 'pending',
        targetQuarter: step.target_quarter || 'TBD',
        marketCapGoal: step.market_cap_goal || 'TBD',
        holderTarget: step.holder_target || 'TBD',
        isFeatured: step.is_featured || false,
        orderIndex: step.order_index || step.step_number || 1,
        createdAt: step.created_at,
        updatedAt: step.updated_at,
        tasks: stepTasks.map((task) => ({
          id: task.id.toString(),
          text: task.task_description || task.title || 'Untitled Task',
          description: task.task_description || task.description || '',
          completed: task.is_completed || false,
          roadmapStepId: task.roadmap_step_id,
          orderIndex: task.order_index || 0,
          createdAt: task.created_at,
          updatedAt: task.updated_at
        }))
      };
    });
    // Calculate summary statistics
    const totalTasks = transformedSteps.reduce((sum, step) => sum + step.tasks.length, 0);
    const completedTasks = transformedSteps.reduce((sum, step) =>
      sum + step.tasks.filter(task => task.completed).length, 0
    );
    console.log(`? Express roadmap: Returning ${transformedSteps.length} steps with ${totalTasks} total tasks`);
    return res.json({
      success: true,
      roadmapSteps: transformedSteps,
      totalSteps: transformedSteps.length,
      totalTasks,
      completedTasks,
      progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('? Express roadmap error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch roadmap data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
// PUT /api/roadmap/task/:taskId - Update task completion status
router.put('/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { completed, isCompleted } = req.body;
    const supabase = getSupabaseAdminClient();
    const completionStatus = completed === undefined ? isCompleted : completed;
    console.log(`?? Express roadmap: Updating task ${taskId} completion to ${completionStatus}`);
    const { data, error } = await supabase
      .from('roadmap_tasks')
      .update({
        is_completed: completionStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .select();
    if (error) {
      console.error('? Express roadmap task update error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update task'
      });
    }
    console.log(`? Express roadmap: Task ${taskId} updated successfully`);
    return res.json({
      success: true,
      message: 'Task updated successfully',
      updatedTask: data[0]
    });
  } catch (error) {
    console.error('? Express roadmap task update error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update task',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
// PUT /api/roadmap/step/:stepId - Update step status
router.put('/step/:stepId', async (req, res) => {
  try {
    const { stepId } = req.params;
    const { status } = req.body;
    const supabase = getSupabaseAdminClient();
    console.log(`?? Express roadmap: Updating step ${stepId} status to ${status}`);
    const { data, error } = await supabase
      .from('roadmap_steps')
      .update({
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', stepId)
      .select();
    if (error) {
      console.error('? Express roadmap step update error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update step'
      });
    }
    console.log(`? Express roadmap: Step ${stepId} updated successfully`);
    return res.json({
      success: true,
      message: 'Step updated successfully',
      updatedStep: data[0]
    });
  } catch (error) {
    console.error('? Express roadmap step update error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update step',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;




// GET /api/schedules - Get schedules with filtering options
router.get('/', async (req, res) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query;
    const limitNum = Number.parseInt(limit, 10);
    const offsetNum = Number.parseInt(offset, 10);
    const supabase = getSupabaseAdminClient();
    let query = supabase
      .from('schedules')
      .select('*')
      .order('event_date', { ascending: status === 'upcoming' })
      .range(offsetNum, offsetNum + limitNum - 1);
    // Filter by status if provided
    if (status && ['upcoming', 'past', 'live'].includes(status)) {
      query = query.eq('status', status);
    }
    const { data: schedules, error } = await query;
    if (error) {
      console.error('Error fetching schedules:', error);
      return res.status(500).json({ error: 'Failed to fetch schedules' });
    }
    console.log(`✅ Fetched ${schedules?.length || 0} schedules`);
    return res.json({
      schedules: schedules || [],
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: schedules?.length || 0
      }
    });
  } catch (error) {
    console.error('Error in schedules API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
// POST /api/schedules - Create a new schedule
router.post('/', async (req, res) => {
  try {
    const { title, description, event_date, status, event_type, location_id } = req.body;
    // Validation
    if (!title || !event_date) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['title', 'event_date']
      });
    }
    // Validate event_type
    const validTypes = ['stream', 'community', 'special', 'giveaway'];
    if (event_type && !validTypes.includes(event_type)) {
      return res.status(400).json({
        error: `Invalid event_type. Must be one of: ${validTypes.join(', ')}`
      });
    }
    // Validate status
    const validStatuses = ['upcoming', 'live', 'past', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    const supabase = getSupabaseAdminClient();
    const scheduleData = {
      title,
      description,
      event_date,
      status: status || 'upcoming',
      event_type: event_type || 'stream',
      location_id: location_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('schedules')
      .insert(scheduleData)
      .select()
      .single();
    if (error) {
      console.error('Error creating schedule:', error);
      return res.status(500).json({ error: 'Failed to create schedule' });
    }
    console.log('✅ Created schedule:', data.id);
    return res.status(201).json({ schedule: data });
  } catch (error) {
    console.error('Error creating schedule:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;




// POST /api/seed/locations - Add sample locations to database
router.post('/locations', async (req, res) => {
  try {
    const sampleLocations = [
      {
        slug: 'london-uk',
        name: 'London',
        country_iso3: 'GBR',
        lat: 51.5074,
        lng: -0.1278,
        status: 'visited',
        summary: 'Exploring the historic streets of London with amazing content creators!',
        description: 'London offers incredible opportunities for content creation with its rich history, vibrant culture, and diverse communities.',
        tags: ['history', 'culture', 'urban', 'europe'],
        visited_date: '2024-12-15',
        created_at: new Date().toISOString()
      },
      {
        slug: 'tokyo-japan',
        name: 'Tokyo',
        country_iso3: 'JPN',
        lat: 35.6762,
        lng: 139.6503,
        status: 'planned',
        summary: "Planning an epic journey through Tokyo's tech and culture scene!",
        description: 'Tokyo represents the perfect blend of traditional Japanese culture and cutting-edge technology.',
        tags: ['technology', 'culture', 'anime', 'asia'],
        planned_date: '2025-03-20',
        created_at: new Date().toISOString()
      },
      {
        slug: 'new-york-usa',
        name: 'New York City',
        country_iso3: 'USA',
        lat: 40.7128,
        lng: -74.006,
        status: 'live',
        summary: 'LIVE from the Big Apple! Join us for real-time NYC adventures!',
        description: 'The city that never sleeps offers endless content opportunities from Times Square to Brooklyn.',
        tags: ['live', 'urban', 'america', 'finance'],
        created_at: new Date().toISOString()
      },
      {
        slug: 'sydney-australia',
        name: 'Sydney',
        country_iso3: 'AUS',
        lat: -33.8688,
        lng: 151.2093,
        status: 'visited',
        summary: 'Amazing adventures Down Under with incredible Aussie creators!',
        description: "Sydney's stunning harbor, beaches, and laid-back culture make it perfect for content creation.",
        tags: ['beach', 'nature', 'australia', 'harbor'],
        visited_date: '2024-11-08',
        created_at: new Date().toISOString()
      },
      {
        slug: 'dubai-uae',
        name: 'Dubai',
        country_iso3: 'ARE',
        lat: 25.2048,
        lng: 55.2708,
        status: 'planned',
        summary: 'Future tech meets luxury - Dubai content creation coming soon!',
        description: "Dubai's futuristic skyline and luxury lifestyle offer unique content opportunities.",
        tags: ['luxury', 'tech', 'middle-east', 'business'],
        planned_date: '2025-05-15',
        created_at: new Date().toISOString()
      }
    ];
    const supabaseAdmin = getSupabaseAdminClient();
    const { data, error } = await supabaseAdmin
      .from('locations')
      .insert(sampleLocations)
      .select();
    if (error) {
      console.error('Error seeding locations:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
    res.json({
      success: true,
      message: 'Sample locations added successfully!',
      locations: data,
      count: data?.length || 0
    });
  } catch (error) {
    console.error('Error in seed locations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed locations'
    });
  }
});

module.exports = router;




// GET /api/stats - Get application statistics
router.get('/', async (req, res) => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.json({
        success: true,
        data: {
          totalMembers: 0,
          activeStreams: 1,
          locationsVisited: 0,
          viewsLast7d: 0,
          viewsLast30d: 0,
          liveStatus: 'OFFLINE'
        }
      });
    }
    const supabase = getSupabaseClient();
    // Get stats from app_settings table
    const { data: statsData } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['community_members', 'active_streams', 'views_last_7d', 'views_last_30d', 'live_status']);
    // Get location counts
    const { count: totalLocations } = await supabase
      .from('locations')
      .select('*', { count: 'exact', head: true });
    const { count: visitedLocations } = await supabase
      .from('locations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'visited');
    // Convert array to object
    const stats = {};
    if (statsData) {
      for (const item of statsData) {
        stats[item.key] = item.value;
      }
    }
    return res.json({
      success: true,
      data: {
        totalMembers: Number.parseInt(stats['community_members'] || '0', 10),
        activeStreams: Number.parseInt(stats['active_streams'] || '1', 10),
        locationsVisited: visitedLocations || 0,
        totalLocations: totalLocations || 0,
        viewsLast7d: Number.parseInt(stats['views_last_7d'] || '0', 10),
        viewsLast30d: Number.parseInt(stats['views_last_30d'] || '0', 10),
        liveStatus: stats['live_status'] || 'OFFLINE',
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return res.json({
      success: true,
      data: {
        totalMembers: 0,
        activeStreams: 1,
        locationsVisited: 0,
        totalLocations: 0,
        viewsLast7d: 0,
        viewsLast30d: 0,
        liveStatus: 'OFFLINE',
        lastUpdated: new Date().toISOString()
      }
    });
  }
});
// GET /api/stats/live - Get live statistics for real-time updates
router.get('/live', async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    // Get live stats
    const { data: liveStats } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['live_status', 'current_viewers', 'live_location', 'live_stream_url']);
    // Get recent activity (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentActivity, error: activityError } = await supabase
      .from('visitor_sessions')
      .select('id, created_at, last_activity')
      .gte('last_activity', fiveMinutesAgo)
      .order('last_activity', { ascending: false });
    if (activityError) {
      console.error('Error fetching recent activity:', activityError);
    }
    // Convert array to object
    const liveStatsObj = {};
    if (liveStats) {
      for (const item of liveStats) {
        liveStatsObj[item.key] = item.value;
      }
    }
    return res.json({
      success: true,
      live: {
        status: liveStatsObj['live_status'] || 'OFFLINE',
        currentViewers: Number.parseInt(liveStatsObj['current_viewers'] || '0', 10),
        location: liveStatsObj['live_location'] || null,
        streamUrl: liveStatsObj['live_stream_url'] || null,
        activeUsers: recentActivity?.length || 0,
        timestamp: new Date().toISOString()
      },
      recentActivity: recentActivity || [],
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Live stats API error:', error);
    return res.json({
      success: true,
      live: {
        status: 'OFFLINE',
        currentViewers: 0,
        location: null,
        streamUrl: null,
        activeUsers: 0,
        timestamp: new Date().toISOString()
      },
      recentActivity: [],
      lastUpdated: new Date().toISOString()
    });
  }
});

module.exports = router;




/**
 * GET /api/testimonials
 * Get approved testimonials from community_tweets
 */
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    console.log('🔍 Fetching testimonials from community_tweets table...');
    // Get community tweets that are active (using community_tweets instead of testimonials)
    const { data: communityTweets, error } = await supabase
      .from('community_tweets')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('❌ Error fetching community tweets:', error);
      return res.status(500).json({ error: 'Failed to fetch testimonials' });
    }
    console.log(`✅ Found ${communityTweets?.length || 0} community tweets`);
    // Transform community_tweets to match the expected testimonial format
    const formattedTestimonials = (communityTweets || []).map(tweet => ({
      id: tweet.id,
      author_name: tweet.author_username,
      author_username: tweet.author_username,
      author_profile_image: '/X.png', // Always use X icon for all tweets
      text: tweet.content || tweet.title || tweet.description || `Tweet from @${tweet.author_username}`,
      created_at: tweet.created_at,
      public_metrics: {
        reply_count: 0,
        retweet_count: 0,
        like_count: tweet.engagement_score || 0
      },
      verified: false,
      tweet_url: tweet.tweet_url,
      is_featured: tweet.is_featured
    }));
    
    console.log('📝 Sample testimonial:', formattedTestimonials[0]); // Debug log
    
    return res.json(formattedTestimonials);
  } catch (error) {
    console.error('❌ Error in testimonials API:', error);
    return res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

/**
 * POST /api/testimonials
 * Add new testimonial (admin only)
 */
router.post('/', async (req, res) => {
  try {
    const {
      author_name,
      author_username, 
      author_profile_image,
      text,
      reply_count = 0,
      retweet_count = 0,
      like_count = 0,
      verified = false
    } = req.body;
    // Validation
    const requiredFields = ['author_name', 'author_username', 'text'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ error: `${field} is required` });
      }
    }
    const supabase = getSupabaseAdminClient();
    const testimonialData = {
      author_name,
      author_username,
      author_profile_image: author_profile_image || null,
      text,
      reply_count,
      retweet_count,
      like_count,
      verified,
      approved: true, // Auto-approve for admin-added testimonials
      created_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('testimonials')
      .insert(testimonialData)
      .select()
      .single();
    if (error) {
      console.error('Error creating testimonial:', error);
      return res.status(500).json({ error: 'Failed to create testimonial' });
    }
    console.log('✅ Created testimonial:', data.id);
    return res.status(201).json({ 
      message: 'Testimonial created successfully',
      testimonial: data 
    });
  } catch (error) {
    console.error('Error creating testimonial:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;



router.get('/', (req, res) => {
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'https://web-production-061ff.up.railway.app';
  const testVideoUrl = `${baseUrl}/uploads/1759845757754-4146415-uhd_3840_2160_25fps.mp4`;
  
  const html = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '    <meta charset="UTF-8">',
  '    <meta name="viewport" content="width=device-width, initial-scale=1.0">',
  '    <title>Video Test - What Next</title>',
  '    <style>',
  '        body { background: #000; color: #fff; font-family: Arial, sans-serif; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }',
  '        .container { max-width: 1000px; width: 100%; text-align: center; }',
  '        h1 { color: #3aa9ff; margin-bottom: 30px; }',
  '        .video-container { background: #222; border: 2px solid #3aa9ff; border-radius: 10px; padding: 20px; margin: 20px 0; }',
  '        video { width: 100%; max-width: 800px; height: auto; border-radius: 8px; }',
  '        .info { background: #333; padding: 15px; border-radius: 8px; margin: 10px 0; text-align: left; }',
  '        .status { padding: 10px; margin: 10px 0; border-radius: 5px; font-weight: bold; }',
  '        .success { background: #0a5d0a; }',
  '        .error { background: #5d0a0a; }',
  '        .warning { background: #5d5d0a; }',
  '        .log { background: #1a1a1a; padding: 15px; border-radius: 8px; margin: 20px 0; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px; text-align: left; }',
  '        button { background: #3aa9ff; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px; margin: 5px; }',
  '        button:hover { background: #2a89df; }',
  '        .url-link { color: #3aa9ff; word-break: break-all; text-decoration: none; padding: 5px; border: 1px solid #3aa9ff; border-radius: 4px; display: inline-block; margin: 10px 0; }',
  '    </style>',
  '</head>',
  '<body>',
  '    <div class="container">',
  '        <h1>🎬 Video Test Page</h1>',
  '        ',
  '        <div class="info">',
  '            <strong>Testing Video:</strong><br>',
  `            <a href="${testVideoUrl}" `,
  '               target="_blank" ',
  '               class="url-link">',
  `                ${testVideoUrl}`,
  '            </a>',
  '        </div>',
  '',
  '        <div id="status" class="status warning">⏳ Initializing video test...</div>',
  '',
  '        <div class="video-container">',
  '            <h3>Direct Video Element Test</h3>',
  '            <video id="testVideo" controls preload="metadata">',
  `                <source src="${testVideoUrl}" type="video/mp4">`,
  '                Your browser does not support the video tag.',
  '            </video>',
  '        </div>',
  '',
  '        <div>',
  '            <button onclick="playVideo()">▶️ Play Video</button>',
  '            <button onclick="pauseVideo()">⏸️ Pause Video</button>',
  '            <button onclick="reloadVideo()">🔄 Reload Video</button>',
  '            <button onclick="testUrl()">🔗 Test URL Direct</button>',
  '        </div>',
  '',
  '        <div class="log" id="eventLog">',
  '            <strong>📋 Event Log:</strong><br>',
  '        </div>',
  '',
  '        <div class="info">',
  '            <strong>📊 Video Information:</strong><br>',
  '            <span id="videoInfo">Loading...</span>',
  '        </div>',
  '    </div>',
  '',
  '    <script>',
  '        const video = document.getElementById("testVideo");',
  '        const status = document.getElementById("status");',
  '        const eventLog = document.getElementById("eventLog");',
  '        const videoInfo = document.getElementById("videoInfo");',
  '        ',
  '        let logCount = 0;',
  '',
  '        function addLog(message, type) {',
  '            if (type === undefined) type = "info";',
  '            logCount++;',
  '            const timestamp = new Date().toLocaleTimeString();',
  '            var logEntry = logCount + ". [" + timestamp + "] " + message;',
  '            eventLog.innerHTML += "<div style=\'color: " + getLogColor(type) + ";\'>" + logEntry + "</div>";',
  '            eventLog.scrollTop = eventLog.scrollHeight;',
  '            console.log(logEntry);',
  '        }',
  '        function getLogColor(type) {',
  '            switch(type) {',
  '                case "success": return "#4ade80";',
  '                case "error": return "#ef4444";',
  '                case "warning": return "#f59e0b";',
  '                default: return "#94a3b8";',
  '            }',
  '        }',
  '        function updateStatus(message, type) {',
  '            status.textContent = message;',
  '            status.className = "status " + type;',
  '        }',
  '        function updateVideoInfo() {',
  '            if (video.videoWidth && video.videoHeight) {',
  '                videoInfo.innerHTML = "Width: " + video.videoWidth + "px<br>" +',
  '                    "Height: " + video.videoHeight + "px<br>" +',
  '                    "Duration: " + (video.duration ? video.duration.toFixed(2) + "s" : "Unknown") + "<br>" +',
  '                    "Current Time: " + video.currentTime.toFixed(2) + "s<br>" +',
  '                    "Paused: " + video.paused + "<br>" +',
  '                    "Muted: " + video.muted + "<br>" +',
  '                    "Volume: " + video.volume + "<br>" +',
  '                    "Ready State: " + video.readyState + "<br>" +',
  '                    "Network State: " + video.networkState;',
  '            } else {',
  '                videoInfo.textContent = "Video dimensions not available yet";',
  '            }',
  '        }',
  '        video.addEventListener("loadstart", function() { addLog("🔄 Load started", "info"); updateStatus("🔄 Loading video...", "warning"); });',
  '        video.addEventListener("loadedmetadata", function() { addLog("📊 Metadata loaded - " + video.videoWidth + "x" + video.videoHeight, "success"); updateVideoInfo(); });',
  '        video.addEventListener("loadeddata", function() { addLog("📊 Data loaded", "success"); updateVideoInfo(); });',
  '        video.addEventListener("canplay", function() { addLog("✅ Can play", "success"); updateStatus("✅ Video ready to play!", "success"); updateVideoInfo(); });',
  '        video.addEventListener("canplaythrough", function() { addLog("✅ Can play through", "success"); });',
  '        video.addEventListener("play", function() { addLog("▶️ Playing", "success"); updateStatus("▶️ Video is playing", "success"); });',
  '        video.addEventListener("pause", function() { addLog("⏸️ Paused", "warning"); updateStatus("⏸️ Video paused", "warning"); });',
  '        video.addEventListener("ended", function() { addLog("🏁 Video ended", "info"); updateStatus("🏁 Video finished", "warning"); });',
  '        video.addEventListener("error", function(e) {',
  '            var error = video.error;',
  '            var errorMessage = "Unknown error";',
  '            if (error) {',
  '                switch(error.code) {',
  '                    case 1: errorMessage = "MEDIA_ERR_ABORTED - Video loading aborted"; break;',
  '                    case 2: errorMessage = "MEDIA_ERR_NETWORK - Network error"; break;',
  '                    case 3: errorMessage = "MEDIA_ERR_DECODE - Video decode error"; break;',
  '                    case 4: errorMessage = "MEDIA_ERR_SRC_NOT_SUPPORTED - Video format not supported"; break;',
  '                }',
  '            }',
  '            addLog("❌ Error: " + errorMessage, "error");',
  '            updateStatus("❌ " + errorMessage, "error");',
  '        });',
  '        video.addEventListener("stalled", function() { addLog("⚠️ Video stalled", "warning"); });',
  '        video.addEventListener("waiting", function() { addLog("⏳ Waiting for data", "warning"); });',
  '        video.addEventListener("timeupdate", function() { updateVideoInfo(); });',
  '        function playVideo() { video.play().then(function() { addLog("▶️ Play() succeeded", "success"); }).catch(function(err) { addLog("❌ Play() failed: " + err.message, "error"); }); }',
  '        function pauseVideo() { video.pause(); }',
  '        function reloadVideo() { addLog("🔄 Reloading video...", "info"); video.load(); }',
  `        function testUrl() { window.open("${testVideoUrl}", "_blank"); }`,
  '        addLog("🎬 Video test page loaded");',
  '        updateVideoInfo();',
  '    </script>',
  '</body>',
  '</html>'
  ].join('\n');
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

module.exports = router;


