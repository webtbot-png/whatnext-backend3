/**
 * Dividend System Configuration Management API
 * 
 * Admin endpoints for managing dividend system settings:
 * - Dividend percentage (default 20%)
 * - Sell threshold percentage (default 30%)
 * - Wallet minimum SOL balance
 * - System enable/disable toggles
 * - Manual claim triggers
 */

const express = require('express');
const { createConnection } = require('../../database/database');
const { claimCreatorFeesWithDividends, getDividendConfig } = require('../../lib/comprehensive-dividend-system');
const { authenticateAdmin } = require('../../middleware/auth'); // Assuming you have admin auth middleware

const router = express.Router();

/**
 * Get current dividend system configuration
 */
router.get('/config', authenticateAdmin, async (req, res) => {
  try {
    const db = createConnection();
    
    const configResult = await db.query(`
      SELECT key, value, value_type, description, is_active
      FROM dividend_config 
      WHERE is_active = true
      ORDER BY key
    `);
    
    const config = {};
    for (const row of configResult.rows) {
      config[row.key] = {
        value: row.value,
        type: row.value_type,
        description: row.description
      };
    }
    
    res.json({
      success: true,
      config: config,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to get dividend config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dividend configuration',
      details: error.message
    });
  }
});

/**
 * Update dividend system configuration
 */
router.put('/config', authenticateAdmin, async (req, res) => {
  try {
    const { key, value } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: key and value'
      });
    }
    
    const db = createConnection();
    
    // Validate key exists
    const existingConfig = await db.query(
      'SELECT key, value_type FROM dividend_config WHERE key = $1',
      [key]
    );
    
    if (existingConfig.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Configuration key '${key}' not found`
      });
    }
    
    // Validate value based on type
    const valueType = existingConfig.rows[0].value_type;
    const validationResult = validateConfigValue(value, valueType);
    
    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        error: `Invalid value for ${key}: ${validationResult.error}`
      });
    }
    
    // Update configuration
    await db.query(`
      UPDATE dividend_config 
      SET value = $2, updated_at = NOW()
      WHERE key = $1
    `, [key, validationResult.processedValue]);
    
    console.log(`✅ Updated dividend config: ${key} = ${validationResult.processedValue}`);
    
    res.json({
      success: true,
      message: `Configuration '${key}' updated successfully`,
      oldValue: existingConfig.rows[0].value,
      newValue: validationResult.processedValue,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to update dividend config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update dividend configuration',
      details: error.message
    });
  }
});

/**
 * Get dividend system statistics
 */
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const db = createConnection();
    
    // Get comprehensive statistics
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM dividend_claims WHERE status = 'completed') as total_claims,
        (SELECT COALESCE(SUM(claimed_amount), 0) FROM dividend_claims WHERE status = 'completed') as total_claimed_sol,
        (SELECT COALESCE(SUM(distribution_amount), 0) FROM dividend_claims WHERE status = 'completed') as total_distributed_sol,
        (SELECT COUNT(*) FROM holder_eligibility WHERE is_eligible = true) as eligible_holders,
        (SELECT COUNT(*) FROM holder_eligibility WHERE is_eligible = false) as ineligible_holders,
        (SELECT COUNT(*) FROM holder_eligibility WHERE permanently_blacklisted = true) as blacklisted_holders,
        (SELECT MAX(claim_timestamp) FROM dividend_claims WHERE status = 'completed') as last_claim_timestamp,
        (SELECT COUNT(*) FROM dividend_distributions WHERE status = 'completed') as total_distributions,
        (SELECT COUNT(*) FROM dividend_payouts WHERE payout_status = 'completed') as total_payouts
    `;
    
    const statsResult = await db.query(statsQuery);
    const stats = statsResult.rows[0];
    
    // Get recent claims
    const recentClaimsResult = await db.query(`
      SELECT 
        id, claimed_amount, distribution_amount, 
        holder_count, claim_timestamp, status,
        transaction_id
      FROM dividend_claims 
      ORDER BY claim_timestamp DESC 
      LIMIT 10
    `);
    
    // Get holder eligibility breakdown
    const eligibilityResult = await db.query(`
      SELECT 
        is_eligible,
        COUNT(*) as count,
        AVG(retention_percentage) as avg_retention
      FROM holder_eligibility 
      GROUP BY is_eligible
    `);
    
    res.json({
      success: true,
      stats: {
        totalClaims: Number.parseInt(stats.total_claims),
        totalClaimedSol: Number.parseFloat(stats.total_claimed_sol),
        totalDistributedSol: Number.parseFloat(stats.total_distributed_sol),
        eligibleHolders: Number.parseInt(stats.eligible_holders),
        ineligibleHolders: Number.parseInt(stats.ineligible_holders),
        blacklistedHolders: Number.parseInt(stats.blacklisted_holders),
        lastClaimTimestamp: stats.last_claim_timestamp,
        totalDistributions: Number.parseInt(stats.total_distributions),
        totalPayouts: Number.parseInt(stats.total_payouts)
      },
      recentClaims: recentClaimsResult.rows,
      eligibilityBreakdown: eligibilityResult.rows,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to get dividend stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dividend statistics',
      details: error.message
    });
  }
});

/**
 * Manually trigger creator fee claim with dividends
 */
router.post('/claim', authenticateAdmin, async (req, res) => {
  try {
    const { creatorWallet, contractAddress } = req.body;
    
    console.log('🚀 Manual dividend claim triggered by admin');
    
    // Execute the comprehensive dividend claim
    const result = await claimCreatorFeesWithDividends(creatorWallet, contractAddress);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Creator fee claim and dividend distribution completed',
        result: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Creator fee claim failed',
        reason: result.reason,
        details: result.error
      });
    }
    
  } catch (error) {
    console.error('❌ Manual claim failed:', error);
    res.status(500).json({
      success: false,
      error: 'Manual claim execution failed',
      details: error.message
    });
  }
});

/**
 * Get holder eligibility status
 */
router.get('/holders', authenticateAdmin, async (req, res) => {
  try {
    const db = createConnection();
    
    const holdersResult = await db.query(`
      SELECT 
        he.holder_address,
        he.current_balance,
        he.initial_balance,
        he.retention_percentage,
        he.is_eligible,
        he.permanently_blacklisted,
        he.last_violation_date,
        he.violation_count,
        he.last_checked_at,
        hs.total_dividends_received,
        hs.total_claims_participated
      FROM holder_eligibility he
      LEFT JOIN holder_stats hs ON he.holder_address = hs.holder_address
      ORDER BY he.current_balance DESC
      LIMIT 100
    `);
    
    res.json({
      success: true,
      holders: holdersResult.rows,
      count: holdersResult.rows.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to get holder data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve holder information',
      details: error.message
    });
  }
});

/**
 * Get wallet balance history
 */
router.get('/wallet-history', authenticateAdmin, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const db = createConnection();
    
    const historyResult = await db.query(`
      SELECT 
        wallet_address,
        balance_sol,
        balance_lamports,
        check_reason,
        notes,
        checked_at
      FROM wallet_balance_history
      ORDER BY checked_at DESC
      LIMIT $1
    `, [Number.parseInt(limit)]);
    
    res.json({
      success: true,
      history: historyResult.rows,
      count: historyResult.rows.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to get wallet history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve wallet balance history',
      details: error.message
    });
  }
});

/**
 * Reset holder eligibility (admin function)
 */
router.post('/reset-holder/:address', authenticateAdmin, async (req, res) => {
  try {
    const { address } = req.params;
    const { reason } = req.body;
    
    const db = createConnection();
    
    // Reset eligibility status
    await db.query(`
      UPDATE holder_eligibility 
      SET 
        is_eligible = true,
        permanently_blacklisted = false,
        violation_count = 0,
        last_violation_date = NULL,
        blacklisted_at = NULL,
        blacklist_reason = NULL,
        last_checked_at = NOW()
      WHERE holder_address = $1
    `, [address]);
    
    console.log(`✅ Reset eligibility for holder: ${address}, reason: ${reason}`);
    
    res.json({
      success: true,
      message: `Eligibility reset for holder ${address}`,
      reason: reason,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to reset holder eligibility:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset holder eligibility',
      details: error.message
    });
  }
});

/**
 * Validate configuration value based on type
 */
function validateConfigValue(value, valueType) {
  switch (valueType) {
    case 'number': {
      const num = Number.parseFloat(value);
      if (Number.isNaN(num)) {
        return { valid: false, error: 'Must be a valid number' };
      }
      return { valid: true, processedValue: num.toString() };
    }
      
    case 'percentage': {
      const pct = Number.parseFloat(value);
      if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        return { valid: false, error: 'Must be a percentage between 0 and 100' };
      }
      return { valid: true, processedValue: pct.toString() };
    }
      
    case 'boolean': {
      if (value !== 'true' && value !== 'false') {
        return { valid: false, error: 'Must be "true" or "false"' };
      }
      return { valid: true, processedValue: value };
    }
      
    case 'string':
    default: {
      if (typeof value !== 'string' || value.length === 0) {
        return { valid: false, error: 'Must be a non-empty string' };
      }
      return { valid: true, processedValue: value };
    }
  }
}

module.exports = router;
