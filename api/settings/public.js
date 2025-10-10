const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    console.log('🌍 Public Settings API: Starting request...');
    const supabase = getSupabaseAdminClient();
    const { data: settings, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', [
        'developer_contract_address',
        'DEVELOPER_WALLET_ADDRESS',
        'developer_wallet_address',
        'pumpfun_contract_address',
        'PUMPFUN_CONTRACT_ADDRESS',
        'DEVELOPER_CONTRACT_ADDRESS'
      ]);
    if (error) {
      console.error('🌍 Public Settings API: Database error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch settings: ' + (error?.message || JSON.stringify(error)),
        settings: []
      });
    }
    console.log('🌍 Public Settings API: Found settings:', settings?.length || 0);
    console.log('🌍 Public Settings API: Settings data:', settings);
    return res.json({
      success: true,
      settings: settings || [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('🌍 Public Settings API: Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error: ' + (error instanceof Error ? error.message : JSON.stringify(error)),
      settings: []
    });
  }
});

module.exports = router;

