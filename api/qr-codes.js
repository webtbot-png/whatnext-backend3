const express = require('express');
const { getSupabaseAdminClient } = require('../database.js');

const router = express.Router();

/**
 * GET /api/qr-codes
 * Get all QR codes for admin dashboard
 */
router.get('/', async (req, res) => {
  try {
    console.log('🔍 Fetching all QR codes for dashboard...');
    const supabase = getSupabaseAdminClient();
    
    // Fetch all claim links (QR codes) from the database
    const { data: claimLinks, error } = await supabase
      .from('claim_links')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching claim links:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch QR codes',
        details: error.message
      });
    }

    console.log(`✅ Found ${claimLinks?.length || 0} QR codes in database`);

    // Fetch live SOL price for USD conversions - ALWAYS LIVE PRICE
    let solPrice;
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      if (!response.ok) {
        throw new Error(`CoinGecko API failed with status: ${response.status}`);
      }
      const data = await response.json();
      solPrice = data.solana?.usd;
      if (!solPrice || solPrice <= 0) {
        throw new Error('Invalid SOL price received from CoinGecko API');
      }
      console.log(`✅ Live SOL price fetched: $${solPrice}`);
    } catch (err) {
      console.error('❌ Critical error: Failed to fetch live SOL price:', err.message);
      return res.status(503).json({
        success: false,
        error: 'Service temporarily unavailable - unable to fetch live SOL price',
        details: 'Live pricing is required for accurate QR code valuations'
      });
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
      const solAmount = claim.amount_lamports ? (claim.amount_lamports / 1000000000) : 0;
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
        description: claim.description || claim.note || `QR Code: ${claim.code}`,
        created_at: claim.created_at,
        expires_at: claim.expires_at,
        claimed_at: claim.claimed_at,
        claimed_by: claim.claimed_by_wallet || claim.claimer_address,
        location_id: claim.location_id,
        tx_signature: claim.tx_signature,
        display_amount: `${solAmount.toFixed(6)} SOL ($${usdAmount.toFixed(2)})`
      };
    });

    // Calculate totals
    const totalAmount = qrCodes.reduce((sum, qr) => sum + (qr.amount || 0), 0);
    const activeCodes = qrCodes.filter(qr => qr.status === 'ACTIVE');
    const claimedCodes = qrCodes.filter(qr => qr.status === 'CLAIMED');
    const expiredCodes = qrCodes.filter(qr => qr.status === 'EXPIRED');

    console.log(`✅ Returning ${qrCodes.length} QR codes (${activeCodes.length} active, ${claimedCodes.length} claimed)`);

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
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/qr-codes
 * Process a QR code claim
 */
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
    
    const solAmount = claim.amount_lamports ? (claim.amount_lamports / 1000000000) : 0;
    
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

/**
 * GET /api/qr-codes/status
 * Check claim status by code
 */
router.get('/status', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      return res.json({
        success: true,
        message: 'Claim status endpoint is operational',
        status: 'online',
        info: 'Provide a code parameter to check specific claim status',
        example: '/api/qr-codes/status?code=YOUR_CLAIM_CODE'
      });
    }
    
    console.log(`🔍 Checking claim status for code: ${code}`);
    const supabase = getSupabaseAdminClient();
    const { data: claimLink, error } = await supabase
      .from('claim_links')
      .select('*')
      .eq('code', code)
      .single();
    
    if (error || !claimLink) {
      return res.status(404).json({
        success: false,
        error: 'Claim code not found'
      });
    }
    
    if (claimLink.claimed_at) {
      return res.status(400).json({
        success: false,
        error: 'This claim code has already been used',
        claimed_at: claimLink.claimed_at,
        claimed_by: claimLink.claimed_by_wallet
      });
    }
    
    const isExpired = new Date() > new Date(claimLink.expires_at);
    if (isExpired) {
      return res.status(400).json({
        success: false,
        error: 'This claim code has expired',
        expires_at: claimLink.expires_at
      });
    }
    
    const solAmount = claimLink.amount_lamports ? (claimLink.amount_lamports / 1000000000) : 0;
    
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

module.exports = router;
