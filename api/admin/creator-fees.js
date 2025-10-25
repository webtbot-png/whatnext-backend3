const express = require('express');
const jwt = require('jsonwebtoken');
const { claimCreatorFees, isCreatorFeeClaimingAvailable } = require('../../lib/creator-fee-claimer.js');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

function verifyAdminToken(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Unauthorized');
    }
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.admin ? decoded : null;
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return null;
  }
}

/**
 * POST /api/admin/creator-fees/claim
 * Manually trigger creator fee claiming
 */
router.post('/claim', async (req, res) => {
  try {
    const admin = verifyAdminToken(req);
    if (!admin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🔧 Admin triggered manual creator fee claim');

    // Check if creator fee claiming is available
    const isAvailable = await isCreatorFeeClaimingAvailable();
    
    if (!isAvailable) {
      return res.json({
        success: false,
        error: 'Creator fee claiming not configured',
        message: 'AWS secrets or configuration missing. Please configure the creator wallet in AWS Secrets Manager.',
        configured: false
      });
    }

    // Trigger the creator fee claim
    const result = await claimCreatorFees();

    if (result.success) {
      console.log('✅ Manual creator fee claim successful');
      
      return res.json({
        success: true,
        message: 'Creator fees claimed successfully',
        data: {
          signature: result.signature,
          explorerUrl: result.explorerUrl,
          transactionId: result.transactionId,
          timestamp: result.timestamp,
          creatorWallet: result.creatorWallet
        }
      });
    } else {
      console.log('❌ Manual creator fee claim failed:', result.error);
      
      return res.json({
        success: false,
        error: result.error || 'Creator fee claiming failed',
        message: 'The transaction could not be completed. Check the logs for details.'
      });
    }

  } catch (error) {
    console.error('❌ Admin creator fee claim error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/creator-fees/status
 * Check creator fee claiming status and configuration
 */
router.get('/status', async (req, res) => {
  try {
    const admin = verifyAdminToken(req);
    if (!admin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🔍 Admin checking creator fee claiming status');

    // Check if creator fee claiming is available
    const isAvailable = await isCreatorFeeClaimingAvailable();

    // Check configuration status
    const awsConfigured = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_SECRET_NAME);
    
    return res.json({
      success: true,
      status: {
        available: isAvailable,
        configured: isAvailable && awsConfigured,
        awsConfigured: awsConfigured,
        endpoints: {
          pumpPortal: 'https://pumpportal.fun/api/trade-local',
          helius: 'https://pump-fe.helius-rpc.com/?api-key=***'
        },
        message: isAvailable 
          ? 'Creator fee claiming is ready and configured'
          : 'Creator fee claiming requires AWS configuration'
      }
    });

  } catch (error) {
    console.error('❌ Status check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check status',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/creator-fees/info
 * Get information about the creator fee claiming system
 */
router.get('/info', async (req, res) => {
  try {
    const admin = verifyAdminToken(req);
    if (!admin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.json({
      success: true,
      info: {
        description: 'Creator Fee Claiming System',
        version: '1.0.0',
        features: [
          'Automatic integration with dividend system',
          'Manual admin-triggered claiming',
          'PumpPortal API integration for transaction generation',
          'Helius RPC for reliable transaction broadcasting',
          'AWS Secrets Manager for secure key storage',
          'Real-time transaction confirmation',
          'Solscan explorer link generation'
        ],
        integration: {
          dividendSystem: 'Automatically called during scheduled dividend distributions',
          adminPanel: 'Manual triggering via admin API endpoints',
          analytics: 'Transaction tracking and reporting',
          rewards: 'Can be used by rewards system for bonus distributions'
        },
        security: {
          keyStorage: 'AWS Secrets Manager (encrypted)',
          keyHandling: 'Private keys never logged or stored in memory after use',
          authentication: 'JWT token required for admin access',
          transactions: 'Signed locally, broadcast via secure RPC'
        }
      }
    });

  } catch (error) {
    console.error('❌ Info request error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get info'
    });
  }
});

module.exports = router;
