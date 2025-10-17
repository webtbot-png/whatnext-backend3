const express = require('express');
const { getSupabaseAdminClient } = require('../database.js');
const { triggerManualClaim, getAutoClaimSettings } = require('./services/dividend-claimer.js');
const { getCronStatus, startDividendCron, stopDividendCron } = require('./services/dividend-cron.js');

const router = express.Router();

// Get dividend status and overview data
router.get('/status', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    
    // Get latest claim data
    const { data: latestClaim, error: claimError } = await supabase
      .from('dividend_claims')
      .select('*')
      .order('claim_timestamp', { ascending: false })
      .limit(1);

    if (claimError) {
      console.error('Error fetching latest claim:', claimError);
      return res.status(500).json({ error: 'Failed to fetch claim data' });
    }

    // Get auto-claim settings
    const { data: settings, error: settingsError } = await supabase
      .from('auto_claim_settings')
      .select('*')
      .limit(1);

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      return res.status(500).json({ error: 'Failed to fetch settings' });
    }

    // Get total statistics
    const { data: totalStats, error: statsError } = await supabase
      .from('dividend_claims')
      .select('claimed_amount, distribution_amount');

    if (statsError) {
      console.error('Error fetching total stats:', statsError);
      return res.status(500).json({ error: 'Failed to fetch statistics' });
    }

    // Get holder count
    const { count: holderCount, error: holderError } = await supabase
      .from('holder_stats')
      .select('*', { count: 'exact', head: true })
      .gt('current_token_balance', 0);

    if (holderError) {
      console.error('Error fetching holder count:', holderError);
      return res.status(500).json({ error: 'Failed to fetch holder count' });
    }

    // Get recent claim history
    const { data: claimHistory, error: historyError } = await supabase
      .from('dividend_summary')
      .select('*')
      .limit(10);

    if (historyError) {
      console.error('Error fetching claim history:', historyError);
      return res.status(500).json({ error: 'Failed to fetch claim history' });
    }

    // Calculate totals
    const totalClaimed = totalStats?.reduce((sum, claim) => sum + Number.parseFloat(claim.claimed_amount || 0), 0) || 0;
    const totalDistributed = totalStats?.reduce((sum, claim) => sum + Number.parseFloat(claim.distribution_amount || 0), 0) || 0;

    // Calculate next claim time
    const currentSettings = settings?.[0];
    const lastClaim = latestClaim?.[0];
    const claimInterval = (currentSettings?.claim_interval_minutes || 10) * 60; // Convert to seconds
    const lastClaimTime = lastClaim ? new Date(lastClaim.claim_timestamp).getTime() : Date.now() - claimInterval * 1000;
    const nextClaimTime = lastClaimTime + claimInterval * 1000;
    const nextClaimIn = Math.max(0, Math.floor((nextClaimTime - Date.now()) / 1000));

    // Mock user data (in real implementation, this would come from wallet connection)
    const mockUserData = {
      yourBalance: 10000, // Mock token balance
      yourPercentage: 0.1, // Mock percentage
      pendingDividends: 0.005 // Mock pending dividends
    };

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
      ...mockUserData
    };

    res.json(response);
  } catch (error) {
    console.error('Error in dividend status endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
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

// Get top holders data
router.get('/holders', async (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit) || 50;

    const supabase = getSupabaseAdminClient();

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
      totalReceived: Number.parseFloat(holder.total_dividends_received || 0)
    })) || [];

    res.json(formattedHolders);
  } catch (error) {
    console.error('Error in holders endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
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

// Admin endpoint to update settings (protected)
router.put('/admin/settings', async (req, res) => {
  try {
    const { 
      enabled, 
      claimIntervalMinutes, 
      distributionPercentage, 
      minClaimAmount 
    } = req.body;

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('auto_claim_settings')
      .update({
        enabled,
        claim_interval_minutes: claimIntervalMinutes,
        distribution_percentage: distributionPercentage,
        min_claim_amount: minClaimAmount
      })
      .eq('id', req.body.settingsId || '1'); // Assume single settings record

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

module.exports = router;
