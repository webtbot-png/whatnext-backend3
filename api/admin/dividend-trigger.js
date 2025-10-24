/**
 * Manual Dividend Trigger Endpoint
 * For testing and manual execution of dividend distributions
 */

const express = require('express');
const { processDividendClaim } = require('../services/dividend-claimer');
const { getSupabaseAdminClient } = require('../../database.js');

const router = express.Router();

/**
 * Manual dividend trigger with configurable parameters
 */
async function triggerDividendDistribution(req, res) {
  try {
    const { 
      amount = 1,  // Default 1 SOL
      min_retention = 70,  // Default 70% retention requirement
      force = false  // Force execution even if auto-claim is disabled
    } = req.body;

    console.log(`🎯 MANUAL DIVIDEND TRIGGER INITIATED`);
    console.log(`💰 Distribution Amount: ${amount} SOL`);
    console.log(`📊 Min Retention Required: ${min_retention}%`);
    console.log(`🔧 Force Execution: ${force}`);

    // Validate inputs
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Distribution amount must be positive',
        amount: amount
      });
    }

    if (min_retention < 0 || min_retention > 100) {
      return res.status(400).json({
        success: false,
        error: 'Min retention must be between 0 and 100',
        min_retention: min_retention
      });
    }

    // Process the dividend claim
    const result = await processDividendClaim(amount, min_retention, force);

    console.log(`✅ MANUAL DIVIDEND TRIGGER COMPLETED`);

    return res.status(200).json({
      success: true,
      message: 'Dividend distribution executed successfully',
      data: result,
      execution_summary: {
        amount_distributed: amount,
        min_retention_used: min_retention,
        forced_execution: force,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ MANUAL DIVIDEND TRIGGER FAILED:', error.message);
    
    return res.status(500).json({
      success: false,
      error: 'Dividend distribution failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Get dividend distribution status and history
 */
async function getDividendStatus(req, res) {
  try {
    const supabase = getSupabaseAdminClient();

    // Get recent dividend claims
    const { data: recentClaims, error: claimsError } = await supabase
      .from('dividend_claims')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (claimsError) {
      throw new Error('Failed to fetch dividend claims: ' + claimsError.message);
    }

    // Get recent distributions
    const { data: recentDistributions, error: distributionsError } = await supabase
      .from('dividend_distributions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (distributionsError) {
      throw new Error('Failed to fetch dividend distributions: ' + distributionsError.message);
    }

    // Get auto-claim settings
    const { data: settings, error: settingsError } = await supabase
      .from('auto_claim_settings')
      .select('*')
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      throw new Error('Failed to fetch auto-claim settings: ' + settingsError.message);
    }

    // Calculate distribution statistics
    const completedDistributions = recentDistributions.filter(d => d.status === 'completed');
    const failedDistributions = recentDistributions.filter(d => d.status === 'failed');
    const pendingDistributions = recentDistributions.filter(d => d.status === 'pending');

    const totalPaidOut = completedDistributions.reduce((sum, d) => sum + Number.parseFloat(d.dividend_amount || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        auto_claim_settings: settings,
        recent_claims: recentClaims,
        recent_distributions: recentDistributions,
        statistics: {
          total_distributions: recentDistributions.length,
          completed_distributions: completedDistributions.length,
          failed_distributions: failedDistributions.length,
          pending_distributions: pendingDistributions.length,
          total_sol_distributed: totalPaidOut,
          success_rate: recentDistributions.length > 0 ? 
            ((completedDistributions.length / recentDistributions.length) * 100).toFixed(2) + '%' : 'N/A'
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to get dividend status:', error.message);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to get dividend status',
      details: error.message
    });
  }
}

// Routes
router.post('/execute', triggerDividendDistribution);
router.get('/status', getDividendStatus);

// Info endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'Dividend Trigger API',
    endpoints: {
      'POST /execute': 'Manually trigger dividend distribution',
      'GET /status': 'Get dividend system status and history'
    },
    parameters: {
      execute: {
        amount: 'SOL amount to distribute (default: 1)',
        min_retention: 'Minimum retention percentage required (default: 70)',
        force: 'Force execution even if auto-claim is disabled (default: false)'
      }
    }
  });
});

module.exports = router;
