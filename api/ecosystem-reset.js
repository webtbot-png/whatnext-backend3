const express = require('express');
const { getSupabaseAdminClient } = require('../../database.js');

const router = express.Router();

/**
 * POST /api/admin/ecosystem/reset-pumpfun
 * Reset PumpFun contract address to start fresh with 0 fees
 */
router.post('/reset-pumpfun', async (req, res) => {
  try {
    console.log('🔄 Resetting PumpFun contract address...');
    
    const supabase = getSupabaseAdminClient();
    
    // Clear the pumpfun_contract_address setting
    const { error: clearError } = await supabase
      .from('app_settings')
      .update({ value: '' })
      .eq('key', 'pumpfun_contract_address');

    if (clearError) {
      console.error('❌ Error clearing PumpFun contract address:', clearError);
      return res.status(500).json({
        success: false,
        error: 'Failed to clear PumpFun contract address',
        details: clearError.message
      });
    }

    console.log('✅ PumpFun contract address cleared successfully');

    return res.json({
      success: true,
      message: 'PumpFun contract address cleared. Fees will now show 0 until a new contract is set.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in reset-pumpfun endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/ecosystem/set-pumpfun-contract
 * Set a new PumpFun contract address
 */
router.post('/set-pumpfun-contract', async (req, res) => {
  try {
    const { contractAddress } = req.body;

    if (!contractAddress || typeof contractAddress !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Contract address is required'
      });
    }

    console.log('🔧 Setting new PumpFun contract address:', contractAddress);

    const supabase = getSupabaseAdminClient();

    // Update the pumpfun_contract_address setting
    const { error: updateError } = await supabase
      .from('app_settings')
      .upsert({ 
        key: 'pumpfun_contract_address', 
        value: contractAddress 
      });

    if (updateError) {
      console.error('❌ Error setting PumpFun contract address:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to set PumpFun contract address',
        details: updateError.message
      });
    }

    console.log('✅ PumpFun contract address set successfully');

    return res.json({
      success: true,
      message: 'PumpFun contract address updated successfully',
      contractAddress: contractAddress,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in set-pumpfun-contract endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;
