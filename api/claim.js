const express = require('express');
const { getSupabaseClient } = require('../database');
const router = express.Router();

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
    const supabase = getSupabaseClient();
    const { data: claimLink, error } = await supabase
      .from('claim_links')
      .select('*')
      .eq('code', code.toUpperCase())
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
    const solAmount = claimLink.amount_lamports ? (claimLink.amount_lamports / 1000000000) : 0;
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

// POST /api/claim - Process a claim
router.post('/', async (req, res) => {
  try {
    const { code, wallet_address } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Claim code is required'
      });
    }
    if (!wallet_address || typeof wallet_address !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }
    console.log(`🎯 Processing claim for code: ${code}, wallet: ${wallet_address}`);
    const supabase = getSupabaseClient();
    const { data: claimLink, error: fetchError } = await supabase
      .from('claim_links')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();
    if (fetchError || !claimLink) {
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
    const solAmount = claimLink.amount_lamports ? (claimLink.amount_lamports / 1000000000) : 0;
    const { data: updatedClaim, error: updateError } = await supabase
      .from('claim_links')
      .update({
        status: 'CLAIMED',
        claimed_at: new Date().toISOString(),
        claimer_address: wallet_address,
        tx_signature: 'claim_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11)
      })
      .eq('id', claimLink.id)
      .select()
      .single();
    if (updateError) {
      console.error(`❌ Failed to mark claim as used: ${code}`, updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to process claim'
      });
    }
    console.log(`✅ Claim processed successfully: ${code} -> ${wallet_address}, Amount: ${solAmount} SOL`);
    res.json({
      success: true,
      claim: {
        id: updatedClaim.id,
        code: updatedClaim.code,
        amount_sol: solAmount,
        amount_lamports: updatedClaim.amount_lamports,
        description: updatedClaim.description,
        claimed_at: updatedClaim.claimed_at,
        claimed_by: updatedClaim.claimer_address,
        transaction_note: `Claim processed for ${solAmount} SOL`
      },
      message: `Successfully claimed ${solAmount} SOL!`
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
