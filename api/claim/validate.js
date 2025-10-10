const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { code, email, claimCode } = req.body;
    // Accept both code/claimCode for compatibility
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
    // Check if claim code exists and is valid using the correct table (claim_links)
    const { data: claim, error } = await supabase
      .from('claim_links')
      .select('*')
      .eq('code', actualCode.toUpperCase())
      .eq('status', 'ACTIVE') // Only active claims
      .single();
    if (error || !claim) {
      return res.status(404).json({
        success: false,
        error: 'Invalid or already claimed code'
      });
    }
    // Check if expired
    const isExpired = new Date() > new Date(claim.expires_at);
    if (isExpired) {
      return res.status(400).json({
        success: false,
        error: 'This claim code has expired',
        expires_at: claim.expires_at
      });
    }
    // Mark as claimed
    const { data: updatedClaim, error: updateError } = await supabase
      .from('claim_links')
      .update({
        status: 'CLAIMED',
        claimed_at: new Date().toISOString(),
        claimer_address: email || 'email_validation', // Store email or indicate validation method
        tx_signature: 'validation_' + Date.now() // Generate placeholder transaction signature
      })
      .eq('id', claim.id)
      .select()
      .single();
    if (updateError) {
      throw updateError;
    }
    // Convert lamports to SOL for display
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
        claimed_by: updatedClaim.claimer_address
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

