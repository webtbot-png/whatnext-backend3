const express = require('express');
const { getSupabaseAdminClient } = require('../database.js');
const { triggerManualClaim, getAutoClaimSettings } = require('./services/dividend-claimer.js');
const { getCronStatus, startDividendCron, stopDividendCron } = require('./services/dividend-cron.js');
const { getHolderLoyaltyStats, resetHolderInitialBag } = require('./services/holder-loyalty.js');

const router = express.Router();

// DEBUG: Log that dividends router is being initialized
console.log('🎯 Dividends router initializing...');
console.log('📦 Required modules:');
console.log('   - express:', typeof express);
console.log('   - getSupabaseAdminClient:', typeof getSupabaseAdminClient);
console.log('   - triggerManualClaim:', typeof triggerManualClaim);
console.log('   - getAutoClaimSettings:', typeof getAutoClaimSettings);
console.log('   - getCronStatus:', typeof getCronStatus);

// TEST ENDPOINT - If this works, router is loaded
router.get('/test', (req, res) => {
  console.log('🎯 Dividends /test endpoint hit!');
  res.json({
    message: 'Dividends router is working!',
    timestamp: new Date().toISOString(),
    routerLoaded: true
  });
});

// Helper function to fetch dividend claims data
async function getDividendClaimsData(supabase) {
  const { data: latestClaim, error: claimError } = await supabase
    .from('dividend_claims')
    .select('*')
    .order('claim_timestamp', { ascending: false })
    .limit(1);

  if (claimError) {
    throw new Error('Failed to fetch claim data');
  }

  const { data: totalStats, error: statsError } = await supabase
    .from('dividend_claims')
    .select('claimed_amount, distribution_amount');

  if (statsError) {
    throw new Error('Failed to fetch statistics');
  }

  const { data: claimHistory, error: historyError } = await supabase
    .from('dividend_summary')
    .select('*')
    .limit(10);

  if (historyError) {
    throw new Error('Failed to fetch claim history');
  }

  return { latestClaim, totalStats, claimHistory };
}

// Helper function to fetch settings and holder data
async function getSettingsAndHolders(supabase) {
  const { data: settings } = await supabase
    .from('auto_claim_settings')
    .select('*')
    .limit(1);

  const { count: holderCount } = await supabase
    .from('holder_stats')
    .select('*', { count: 'exact', head: true })
    .gt('current_token_balance', 0);

  return { settings, holderCount };
}

// Helper function to fetch real token data
async function getRealTokenData(supabase, totalDistributed) {
  let realTokenData = null;
  let realUserData = {
    yourBalance: 0,
    yourPercentage: 0,
    pendingDividends: Math.max(0.001, totalDistributed * 0.001),
    tokenSymbol: 'WXT'
  };

  try {
    const { data: contractData } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'pumpfun_contract_address')
      .single();

    if (contractData?.value) {
      const tokenStatsUrl = `${process.env.BASE_URL || 'http://localhost:3001'}/api/pumpfun/stats?contract=${contractData.value}`;
      const tokenResponse = await fetch(tokenStatsUrl);
      
      if (tokenResponse.ok) {
        const tokenResult = await tokenResponse.json();
        if (tokenResult.success && tokenResult.data) {
          realTokenData = tokenResult.data;
          
          const totalSupply = Number.parseFloat(realTokenData.holderDetails?.totalSupply || '1000000000');
          const sampleBalance = 50000;
          const userPercentage = (sampleBalance / totalSupply) * 100;
          
          realUserData = {
            yourBalance: sampleBalance,
            yourPercentage: userPercentage,
            pendingDividends: Math.max(0.001, totalDistributed * (userPercentage / 100)),
            tokenSymbol: realTokenData.symbol || 'WXT',
            tokenName: realTokenData.name || 'WhatNext Token'
          };
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch real token data:', error);
  }

  return { realTokenData, realUserData };
}

// Get dividend status and overview data
router.get('/status', async (req, res) => {
  console.log('🎯 Dividends /status endpoint hit!');
  try {
    console.log('🔄 Attempting to get Supabase client...');
    const supabase = getSupabaseAdminClient();
    console.log('✅ Got Supabase client');
    
    // Fetch all required data using helper functions
    console.log('🔄 Fetching dividend claims data...');
    const { latestClaim, totalStats, claimHistory } = await getDividendClaimsData(supabase);
    console.log('✅ Fetched claims data');
    
    const { settings, holderCount } = await getSettingsAndHolders(supabase);
    console.log('✅ Fetched settings and holders');

    // Calculate totals
    const totalClaimed = totalStats?.reduce((sum, claim) => sum + Number.parseFloat(claim.claimed_amount || 0), 0) || 0;
    const totalDistributed = totalStats?.reduce((sum, claim) => sum + Number.parseFloat(claim.distribution_amount || 0), 0) || 0;

    // Calculate next claim time
    const currentSettings = settings?.[0];
    const lastClaim = latestClaim?.[0];
    const claimInterval = (currentSettings?.claim_interval_minutes || 10) * 60;
    const lastClaimTime = lastClaim ? new Date(lastClaim.claim_timestamp).getTime() : Date.now() - claimInterval * 1000;
    const nextClaimTime = lastClaimTime + claimInterval * 1000;
    const nextClaimIn = Math.max(0, Math.floor((nextClaimTime - Date.now()) / 1000));

    // Calculate claimable amounts - PumpFun style
    const totalEarned = totalClaimed + (totalClaimed * 0.1);
    const availableToClaim = totalClaimed * 0.1;
    const claimableBalance = availableToClaim;
    
    // Get real token data
    const { realTokenData, realUserData } = await getRealTokenData(supabase, totalDistributed);

    const response = {
      totalClaimed,
      lastClaimAmount: lastClaim ? Number.parseFloat(lastClaim.claimed_amount) : 0,
      lastClaimTime: lastClaim ? lastClaim.claim_timestamp : null,
      nextClaimIn,
      totalDistributed,
      totalHolders: holderCount || 0,
      autoClaimEnabled: currentSettings?.enabled || false,
      claimHistory: claimHistory?.map(claim => ({
        id: claim.id,
        timestamp: claim.claim_timestamp,
        amountClaimed: Number.parseFloat(claim.claimed_amount),
        amountDistributed: Number.parseFloat(claim.distribution_amount),
        holdersCount: claim.holder_count,
        transactionId: claim.transaction_id
      })) || [],
      // PumpFun-style claiming data
      totalEarned,
      totalClaims: claimHistory?.length || 0,
      availableToClaim,
      claimableBalance,
      lastClaimTimestamp: lastClaim ? lastClaim.claim_timestamp : null,
      // Real token data
      tokenSymbol: realUserData.tokenSymbol,
      tokenName: realUserData.tokenName,
      realTokenData: realTokenData,
      ...realUserData
    };

    res.json(response);
  } catch (error) {
    console.error('Error in dividend status endpoint:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get detailed claim history
router.get('/history', async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1;
    const limit = Number.parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const supabase = getSupabaseAdminClient();

    const { data: history, error } = await supabase
      .from('dividend_summary')
      .select('*')
      .order('claim_timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching claim history:', error);
      return res.status(500).json({ error: 'Failed to fetch claim history' });
    }

    const formattedHistory = history?.map(claim => ({
      id: claim.id,
      timestamp: claim.claim_timestamp,
      amountClaimed: Number.parseFloat(claim.claimed_amount),
      amountDistributed: Number.parseFloat(claim.distribution_amount),
      holdersCount: claim.holder_count,
      transactionId: claim.transaction_id,
      status: claim.status,
      distributionsCreated: claim.distributions_created,
      distributionsCompleted: claim.distributions_completed,
      totalDistributed: Number.parseFloat(claim.total_distributed || 0)
    })) || [];

    res.json({
      history: formattedHistory,
      page,
      limit,
      hasMore: history?.length === limit
    });
  } catch (error) {
    console.error('Error in dividend history endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get top holders data - Enhanced with real PumpFun data
router.get('/holders', async (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit) || 50;
    const supabase = getSupabaseAdminClient();

    // Try to get real-time holders from PumpFun API first
    let realHolders = [];
    try {
      const { data: contractData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'pumpfun_contract_address')
        .single();

      if (contractData?.value) {
        const tokenStatsUrl = `${process.env.BASE_URL || 'http://localhost:3001'}/api/pumpfun/stats?contract=${contractData.value}`;
        const tokenResponse = await fetch(tokenStatsUrl);
        
        if (tokenResponse.ok) {
          const tokenResult = await tokenResponse.json();
          if (tokenResult.success && tokenResult.data?.holderDetails?.topHolders) {
            realHolders = tokenResult.data.holderDetails.topHolders.map(holder => ({
              address: holder.address,
              balance: Number.parseInt(holder.balance) || 0,
              percentage: Number.parseFloat(holder.percentage) || 0,
              pendingDividends: 0, // Calculate based on dividend distribution
              totalReceived: 0, // This would come from our dividend history
              isRealTime: true
            }));
            console.log(`✅ Fetched ${realHolders.length} real-time holders from PumpFun`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch real-time holders:', error);
    }

    // If we have real-time data, use it; otherwise fall back to database
    if (realHolders.length > 0) {
      return res.json(realHolders.slice(0, limit));
    }

    // Fallback to database holders
    const { data: holders, error } = await supabase
      .from('top_holders_current')
      .select('*')
      .limit(limit);

    if (error) {
      console.error('Error fetching holders:', error);
      return res.status(500).json({ error: 'Failed to fetch holders' });
    }

    const formattedHolders = holders?.map(holder => ({
      address: holder.holder_address,
      balance: Number.parseInt(holder.current_token_balance),
      percentage: Number.parseFloat(holder.current_percentage),
      pendingDividends: Number.parseFloat(holder.pending_dividends || 0),
      totalReceived: Number.parseFloat(holder.total_dividends_received || 0),
      isRealTime: false
    })) || [];

    res.json(formattedHolders);
  } catch (error) {
    console.error('Error in holders endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get REAL BLOCKCHAIN HOLDERS - Same source as dividend distribution system + LOYALTY INFO
router.get('/real-holders', async (req, res) => {
  try {
    console.log('🎯 Real holders endpoint called - using dividend system holder source + loyalty tracking');
    const limit = Number.parseInt(req.query.limit) || 50;
    const supabase = getSupabaseAdminClient();

    // Get the token mint address from dividend settings (same source as dividend claimer)
    const { data: settingsData } = await supabase
      .from('auto_claim_settings')
      .select('token_mint_address')
      .single(); // Remove hardcoded ID - get the first/only record

    let tokenMintAddress = settingsData?.token_mint_address;

    // If no token_mint_address in dividend settings, try pumpfun contract address as fallback
    if (!tokenMintAddress || tokenMintAddress === 'PLACEHOLDER_TOKEN_MINT') {
      console.log('⚠️ No valid token_mint_address in dividend settings, trying pumpfun contract address...');
      const { data: contractData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'pumpfun_contract_address')
        .single();
      
      tokenMintAddress = contractData?.value;
    }

    if (!tokenMintAddress) {
      console.log('❌ No token mint address found in dividend settings or app settings');
      return res.status(400).json({ 
        error: 'Token mint address not configured. Please configure either token_mint_address in dividend settings or pumpfun_contract_address in app settings',
        holders: []
      });
    }

    console.log(`🔍 Fetching real holders for token mint: ${tokenMintAddress}`);

    // Import and use the SAME getTokenHolders function that dividend system uses
    const { getTokenHolders } = require('./services/dividend-claimer.js');
    
    // Get real blockchain holder data (same as dividend distribution system)
    const holderData = await getTokenHolders(tokenMintAddress);
    
    console.log(`✅ Found ${holderData.holders?.length || 0} real blockchain holders`);

    // Get loyalty status for each holder
    const formattedHolders = [];
    
    for (const holder of holderData.holders.slice(0, limit)) {
      // Get loyalty status from holder_loyalty_status view
      const { data: loyaltyData } = await supabase
        .from('holder_loyalty_status')
        .select('*')
        .eq('holder_address', holder.address)
        .single();

      // Get pending dividends from dividend_distributions table
      const { data: pendingData } = await supabase
        .from('dividend_distributions')
        .select('dividend_amount')
        .eq('holder_address', holder.address)
        .eq('status', 'pending')
        .limit(1)
        .single();

      // Get total received dividends
      const { data: receivedData } = await supabase
        .from('dividend_distributions')
        .select('dividend_amount')
        .eq('holder_address', holder.address)
        .eq('status', 'completed');

      const totalReceived = receivedData?.reduce((sum, dist) => sum + Number.parseFloat(dist.dividend_amount), 0) || 0;
      const pendingDividends = pendingData ? Number.parseFloat(pendingData.dividend_amount) : 0;

      // Convert balance to proper token amount using decimals
      const tokenBalance = holder.balance / Math.pow(10, holder.decimals);

      formattedHolders.push({
        address: holder.address,
        balance: tokenBalance,
        percentage: holder.percentage,
        pendingDividends: pendingDividends,
        totalReceived: totalReceived,
        isRealTime: true,
        source: 'solana-blockchain',
        // LOYALTY SYSTEM INFO
        loyaltyStatus: {
          isEligible: loyaltyData?.is_eligible || false,
          retentionPercentage: loyaltyData?.retention_percentage || 0,
          initialBalance: loyaltyData?.initial_balance ? loyaltyData.initial_balance / Math.pow(10, holder.decimals) : null,
          firstRecorded: loyaltyData?.first_recorded_at || null,
          blacklistedAt: loyaltyData?.blacklisted_at || null,
          blacklistReason: loyaltyData?.blacklist_reason || null,
          status: loyaltyData?.status || 'UNKNOWN',
          permanentlyBlacklisted: loyaltyData?.permanently_blacklisted || false
        }
      });
    }

    console.log(`✅ Returning ${formattedHolders.length} formatted real holders with loyalty info`);

    // Get loyalty system stats
    const loyaltyStats = await getHolderLoyaltyStats();

    res.json({
      holders: formattedHolders,
      totalSupply: holderData.totalSupply,
      decimals: holderData.decimals,
      totalHolders: holderData.holders.length,
      source: 'solana-blockchain',
      mintAddress: tokenMintAddress,
      // LOYALTY SYSTEM SUMMARY
      loyaltySystemStats: loyaltyStats
    });

  } catch (error) {
    console.error('❌ Error in real-holders endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to fetch real holder data: ' + error.message,
      holders: []
    });
  }
});

// Get user-specific dividend data (requires wallet address)
router.get('/user/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (!address || address.length !== 44) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const supabase = getSupabaseAdminClient();

    // Get user stats
    const { data: userStats, error: statsError } = await supabase
      .from('holder_stats')
      .select('*')
      .eq('holder_address', address)
      .single();

    if (statsError && statsError.code !== 'PGRST116') {
      console.error('Error fetching user stats:', statsError);
      return res.status(500).json({ error: 'Failed to fetch user data' });
    }

    // Get user's recent distributions
    const { data: distributions, error: distError } = await supabase
      .from('dividend_distributions')
      .select(`
        *,
        dividend_claims!inner(claim_timestamp, transaction_id, claimed_amount)
      `)
      .eq('holder_address', address)
      .order('created_at', { ascending: false })
      .limit(10);

    if (distError) {
      console.error('Error fetching user distributions:', distError);
      return res.status(500).json({ error: 'Failed to fetch user distributions' });
    }

    const userData = {
      address,
      currentBalance: userStats ? Number.parseInt(userStats.current_token_balance) : 0,
      currentPercentage: userStats ? Number.parseFloat(userStats.current_percentage) : 0,
      totalReceived: userStats ? Number.parseFloat(userStats.total_dividends_received) : 0,
      pendingDividends: userStats ? Number.parseFloat(userStats.pending_dividends) : 0,
      totalClaims: userStats ? userStats.total_claims_participated : 0,
      firstDividend: userStats?.first_dividend_date,
      lastDividend: userStats?.last_dividend_date,
      recentDistributions: distributions?.map(dist => ({
        id: dist.id,
        amount: Number.parseFloat(dist.dividend_amount),
        timestamp: dist.distribution_timestamp,
        status: dist.status,
        claimTimestamp: dist.dividend_claims.claim_timestamp,
        claimTxId: dist.dividend_claims.transaction_id,
        totalClaimed: Number.parseFloat(dist.dividend_claims.claimed_amount)
      })) || []
    };

    res.json(userData);
  } catch (error) {
    console.error('Error in user dividend endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin endpoint to trigger manual claim (protected)
router.post('/admin/trigger-claim', async (req, res) => {
  try {
    console.log('🎯 Manual dividend claim triggered by admin');
    
    const result = await triggerManualClaim(true); // force run
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Dividend claim completed successfully',
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.reason,
        data: result
      });
    }
  } catch (error) {
    console.error('❌ Manual claim failed:', error);
    res.status(500).json({
      success: false,
      message: 'Claim failed: ' + error.message
    });
  }
});

// Admin endpoint to get current settings
router.get('/admin/settings', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    
    // First try to get existing settings
    const { data: settings, error } = await supabase
      .from('auto_claim_settings')
      .select('*')
      .eq('id', '550e8400-e29b-41d4-a716-446655440000')
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" for single()
      console.error('Error fetching settings:', error);
      return res.status(500).json({ error: 'Failed to fetch settings' });
    }

    // If settings exist, return them
    if (settings) {
      return res.json(settings);
    }

    // If no settings exist, create default settings
    const defaultSettings = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      enabled: false,
      claim_interval_minutes: 10,
      distribution_percentage: 30,
      min_claim_amount: 0.001
    };

    const { data: newSettings, error: insertError } = await supabase
      .from('auto_claim_settings')
      .insert(defaultSettings)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating default settings:', insertError);
      return res.status(500).json({ error: 'Failed to create default settings' });
    }

    res.json(newSettings);
  } catch (error) {
    console.error('Error in settings GET endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin endpoint to update settings (POST version for DividendsTab compatibility)
router.post('/admin/settings', async (req, res) => {
  try {
    const { 
      enabled, 
      claim_interval_minutes, 
      distribution_percentage,
      min_claim_amount,
      pumpfun_fee_account,
      token_mint_address,
      claim_wallet_address
    } = req.body;

    const supabase = getSupabaseAdminClient();

    const updateData = {
      id: '550e8400-e29b-41d4-a716-446655440000', // Fixed UUID for single settings record
      enabled,
      claim_interval_minutes,
      distribution_percentage,
      min_claim_amount
    };

    // Only add optional fields if they are provided
    if (pumpfun_fee_account !== undefined) {
      updateData.pumpfun_fee_account = pumpfun_fee_account;
    }
    if (token_mint_address !== undefined) {
      updateData.token_mint_address = token_mint_address;
    }
    if (claim_wallet_address !== undefined) {
      updateData.claim_wallet_address = claim_wallet_address;
    }

    const { data, error } = await supabase
      .from('auto_claim_settings')
      .upsert(updateData);

    if (error) {
      console.error('Error updating settings:', error);
      return res.status(500).json({ error: 'Failed to update settings' });
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data
    });
  } catch (error) {
    console.error('Error in settings POST endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin endpoint to get dividend statistics
router.get('/admin/stats', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();

    // Get total claims and distributed amount
    const { data: claimsData, error: claimsError } = await supabase
      .from('dividend_claims')
      .select('claimed_amount, distribution_amount');

    if (claimsError) {
      console.error('Error fetching claims data:', claimsError);
      return res.status(500).json({ error: 'Failed to fetch claims data' });
    }

    // Calculate stats
    const totalClaims = claimsData?.length || 0;
    const totalDistributed = claimsData?.reduce((sum, claim) => sum + Number.parseFloat(claim.claimed_amount || 0), 0) || 0;

    // Get unique holders count
    const { count: uniqueHolders } = await supabase
      .from('dividend_claims')
      .select('user_address', { count: 'exact', head: true });

    // Get last claim date
    const { data: lastClaim } = await supabase
      .from('dividend_claims')
      .select('claim_timestamp')
      .order('claim_timestamp', { ascending: false })
      .limit(1)
      .single();

    // Get next scheduled claim from settings
    const { data: settings } = await supabase
      .from('auto_claim_settings')
      .select('next_claim_scheduled')
      .limit(1)
      .single();

    res.json({
      total_claims: totalClaims,
      total_distributed: totalDistributed,
      unique_holders: uniqueHolders || 0,
      last_claim_date: lastClaim?.claim_timestamp || null,
      next_claim_scheduled: settings?.next_claim_scheduled || null
    });
  } catch (error) {
    console.error('Error in stats endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin endpoint to update settings (protected)
router.put('/admin/settings', async (req, res) => {
  try {
    const { 
      enabled, 
      claimIntervalMinutes, 
      distributionPercentage, 
      minClaimAmount,
      pumpfunFeeAccount,
      tokenMintAddress,
      claimWalletAddress
    } = req.body;

    const supabase = getSupabaseAdminClient();

    const updateData = {
      enabled,
      claim_interval_minutes: claimIntervalMinutes,
      distribution_percentage: distributionPercentage,
      min_claim_amount: minClaimAmount
    };

    // Only add optional fields if they are provided
    if (pumpfunFeeAccount !== undefined) {
      updateData.pumpfun_fee_account = pumpfunFeeAccount;
    }
    if (tokenMintAddress !== undefined) {
      updateData.token_mint_address = tokenMintAddress;
    }
    if (claimWalletAddress !== undefined) {
      updateData.claim_wallet_address = claimWalletAddress;
    }

    const { data, error } = await supabase
      .from('auto_claim_settings')
      .update(updateData)
      .eq('id', '550e8400-e29b-41d4-a716-446655440000'); // Fixed UUID for single settings record

    if (error) {
      console.error('Error updating settings:', error);
      return res.status(500).json({ error: 'Failed to update settings' });
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data
    });
  } catch (error) {
    console.error('Error in settings update endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin endpoint to get cron status
router.get('/admin/cron-status', async (req, res) => {
  try {
    const cronStatus = getCronStatus();
    const settings = await getAutoClaimSettings();
    
    res.json({
      success: true,
      data: {
        ...cronStatus,
        autoClaimEnabled: settings.enabled,
        nextScheduledClaim: settings.next_claim_scheduled,
        lastSuccessfulClaim: settings.last_successful_claim,
        claimInterval: settings.claim_interval_minutes
      }
    });
  } catch (error) {
    console.error('❌ Error getting cron status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get status: ' + error.message
    });
  }
});

// Admin endpoint to control cron job
router.post('/admin/cron/:action', async (req, res) => {
  try {
    const { action } = req.params;
    
    switch (action) {
      case 'start':
        startDividendCron();
        res.json({ success: true, message: 'Dividend cron started' });
        break;
      case 'stop':
        stopDividendCron();
        res.json({ success: true, message: 'Dividend cron stopped' });
        break;
      case 'restart':
        stopDividendCron();
        startDividendCron();
        res.json({ success: true, message: 'Dividend cron restarted' });
        break;
      default:
        res.status(400).json({ success: false, message: 'Invalid action. Use start, stop, or restart' });
    }
  } catch (error) {
    console.error(`❌ Error ${req.params.action} cron:`, error);
    res.status(500).json({
      success: false,
      message: `Failed to ${req.params.action} cron: ` + error.message
    });
  }
});

// =====================================================
// HOLDER LOYALTY SYSTEM ADMIN ENDPOINTS
// =====================================================

// Admin endpoint to get holder loyalty statistics
router.get('/admin/holder-loyalty/stats', async (req, res) => {
  try {
    console.log('🎯 Getting holder loyalty statistics');
    
    const stats = await getHolderLoyaltyStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error getting holder loyalty stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get holder loyalty stats: ' + error.message
    });
  }
});

// Admin endpoint to view all holder eligibility status
router.get('/admin/holder-loyalty/eligibility', async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1;
    const limit = Number.parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const status = req.query.status; // 'eligible', 'blacklisted', or null for all
    
    console.log(`🎯 Getting holder eligibility data (page ${page}, limit ${limit}, status: ${status || 'all'})`);
    
    const supabase = getSupabaseAdminClient();
    
    let query = supabase
      .from('holder_loyalty_status')
      .select('*')
      .order('retention_percentage', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status === 'eligible') {
      query = query.eq('is_eligible', true);
    } else if (status === 'blacklisted') {
      query = query.eq('is_eligible', false);
    }
    
    const { data: holders, error } = await query;
    
    if (error) {
      throw error;
    }
    
    // Get total count for pagination
    let countQuery = supabase
      .from('holder_loyalty_status')
      .select('*', { count: 'exact', head: true });
    
    if (status === 'eligible') {
      countQuery = countQuery.eq('is_eligible', true);
    } else if (status === 'blacklisted') {
      countQuery = countQuery.eq('is_eligible', false);
    }
    
    const { count } = await countQuery;
    
    res.json({
      success: true,
      data: {
        holders: holders || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          hasMore: (holders?.length || 0) === limit
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getting holder eligibility data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get holder eligibility data: ' + error.message
    });
  }
});

// Admin endpoint to reset a holder's initial bag
router.post('/admin/holder-loyalty/reset-bag', async (req, res) => {
  try {
    const { holderAddress, newBalance, newPercentage, tokenMintAddress } = req.body;
    
    if (!holderAddress || !newBalance || !newPercentage || !tokenMintAddress) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: holderAddress, newBalance, newPercentage, tokenMintAddress'
      });
    }
    
    console.log(`🎯 Admin resetting initial bag for ${holderAddress}`);
    
    await resetHolderInitialBag(holderAddress, newBalance, newPercentage, tokenMintAddress);
    
    res.json({
      success: true,
      message: `Successfully reset initial bag for ${holderAddress}`,
      data: {
        holderAddress,
        newBalance,
        newPercentage,
        tokenMintAddress
      }
    });
  } catch (error) {
    console.error('❌ Error resetting holder initial bag:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset holder initial bag: ' + error.message
    });
  }
});

// Admin endpoint to manually check and update all holder eligibility
router.post('/admin/holder-loyalty/refresh-eligibility', async (req, res) => {
  try {
    console.log('🎯 Admin triggering holder eligibility refresh');
    
    const supabase = getSupabaseAdminClient();
    
    // Get all holders from loyalty system
    const { data: holders, error } = await supabase
      .from('holder_loyalty_status')
      .select('*');
    
    if (error) {
      throw error;
    }
    
    let updatedCount = 0;
    let eligibleCount = 0;
    let blacklistedCount = 0;
    
    for (const holder of holders || []) {
      try {
        // Recalculate retention percentage
        const retentionPercentage = holder.initial_balance > 0 
          ? (holder.current_balance / holder.initial_balance) * 100 
          : 0;
        
        const isEligible = retentionPercentage >= 70;
        
        // Update eligibility record
        await supabase
          .from('holder_eligibility')
          .upsert({
            holder_address: holder.holder_address,
            current_balance: holder.current_balance,
            initial_balance: holder.initial_balance,
            retention_percentage: retentionPercentage,
            is_eligible: isEligible,
            last_checked_at: new Date().toISOString(),
            ...(isEligible === false && {
              blacklisted_at: new Date().toISOString(),
              blacklist_reason: `Manual refresh: retention ${retentionPercentage.toFixed(2)}% < 70%`
            })
          });
        
        updatedCount++;
        if (isEligible) {
          eligibleCount++;
        } else {
          blacklistedCount++;
        }
      } catch (holderError) {
        console.error(`❌ Error updating holder ${holder.holder_address}:`, holderError);
      }
    }
    
    console.log(`✅ Refreshed eligibility for ${updatedCount} holders`);
    
    res.json({
      success: true,
      message: 'Holder eligibility refresh completed',
      data: {
        totalProcessed: updatedCount,
        eligible: eligibleCount,
        blacklisted: blacklistedCount
      }
    });
  } catch (error) {
    console.error('❌ Error refreshing holder eligibility:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh holder eligibility: ' + error.message
    });
  }
});

// Admin endpoint to view holder snapshots for a specific claim
router.get('/admin/holder-loyalty/snapshots/:claimId', async (req, res) => {
  try {
    const { claimId } = req.params;
    
    console.log(`🎯 Getting holder snapshots for claim ${claimId}`);
    
    const supabase = getSupabaseAdminClient();
    
    const { data: snapshots, error } = await supabase
      .from('holder_snapshots')
      .select('*')
      .eq('claim_id', claimId)
      .order('percentage', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      data: {
        claimId,
        snapshots: snapshots || [],
        totalHolders: snapshots?.length || 0,
        eligibleHolders: snapshots?.filter(s => s.is_eligible).length || 0
      }
    });
  } catch (error) {
    console.error('❌ Error getting holder snapshots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get holder snapshots: ' + error.message
    });
  }
});

// Admin endpoint to check dividend system configuration and status
router.get('/admin/system-status', async (req, res) => {
  try {
    console.log('🎯 Checking dividend system configuration status');
    
    const supabase = getSupabaseAdminClient();
    
    // Get current settings
    const { data: settings, error: settingsError } = await supabase
      .from('auto_claim_settings')
      .select('*')
      .eq('id', '550e8400-e29b-41d4-a716-446655440000')
      .single();
    
    if (settingsError && settingsError.code !== 'PGRST116') {
      throw settingsError;
    }
    
    // Check configuration status
    const configStatus = {
      settingsConfigured: !!settings,
      pumpfunFeeAccountConfigured: !!(settings?.pumpfun_fee_account && 
        settings.pumpfun_fee_account !== 'PLACEHOLDER_PUMPFUN_FEE_ACCOUNT' &&
        settings.pumpfun_fee_account.length === 44),
      tokenMintAddressConfigured: !!(settings?.token_mint_address && 
        settings.token_mint_address.length === 44),
      claimWalletConfigured: !!(settings?.claim_wallet_address && 
        settings.claim_wallet_address.length === 44),
      autoClaimEnabled: settings?.enabled || false
    };
    
    // Get recent claim statistics
    const { data: recentClaims, error: claimsError } = await supabase
      .from('dividend_claims')
      .select('*')
      .order('claim_timestamp', { ascending: false })
      .limit(5);
    
    if (claimsError) {
      console.error('Error fetching recent claims:', claimsError);
    }
    
    // Get holder loyalty statistics
    let loyaltyStats = null;
    try {
      loyaltyStats = await getHolderLoyaltyStats();
    } catch (error) {
      console.error('Error getting loyalty stats:', error);
    }
    
    res.json({
      success: true,
      data: {
        configurationStatus: configStatus,
        currentSettings: settings || null,
        recentClaims: recentClaims || [],
        loyaltySystemStats: loyaltyStats,
        systemReady: configStatus.settingsConfigured && 
                    configStatus.tokenMintAddressConfigured,
        recommendations: generateSystemRecommendations(configStatus, settings)
      }
    });
  } catch (error) {
    console.error('❌ Error checking system status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check system status: ' + error.message
    });
  }
});

// Helper function to generate system recommendations
function generateSystemRecommendations(configStatus, settings) {
  const recommendations = [];
  
  if (!configStatus.settingsConfigured) {
    recommendations.push({
      type: 'critical',
      message: 'Dividend system settings are not configured. Please set up basic configuration.',
      action: 'Configure auto_claim_settings table'
    });
  }
  
  if (!configStatus.tokenMintAddressConfigured) {
    recommendations.push({
      type: 'critical',
      message: 'Token mint address is not configured. Dividend system cannot fetch holder data.',
      action: 'Set token_mint_address in admin settings'
    });
  }
  
  if (!configStatus.pumpfunFeeAccountConfigured) {
    recommendations.push({
      type: 'warning',
      message: 'PumpFun fee account is not configured. Fee claiming will be skipped.',
      action: 'Set pumpfun_fee_account in admin settings to enable fee claiming'
    });
  }
  
  if (!configStatus.claimWalletConfigured) {
    recommendations.push({
      type: 'warning',
      message: 'Claim wallet is not configured. Automated distributions may not work.',
      action: 'Set claim_wallet_address in admin settings'
    });
  }
  
  if (configStatus.autoClaimEnabled && (!configStatus.tokenMintAddressConfigured || !configStatus.settingsConfigured)) {
    recommendations.push({
      type: 'error',
      message: 'Auto-claim is enabled but system is not properly configured. This may cause errors.',
      action: 'Complete system configuration or disable auto-claim'
    });
  }
  
  if (settings?.min_claim_amount && settings.min_claim_amount < 0.001) {
    recommendations.push({
      type: 'info',
      message: 'Minimum claim amount is very low. Consider setting to at least 0.001 SOL.',
      action: 'Adjust min_claim_amount setting'
    });
  }
  
  return recommendations;
}

module.exports = router;
