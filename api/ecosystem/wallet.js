const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

/**
 * GET /api/ecosystem/wallet
 * Get wallet information and real-time balance
 */
router.get('/', async (req, res) => {
  try {
    console.log('🔍 Wallet API: Starting request...');
    // Get developer wallet address from settings
    const supabase = getSupabaseAdminClient();
    // Try developer_contract_address first, then fallback to developer_wallet_address
    console.log('🔍 Wallet API: Trying developer_contract_address...');
    let { data: settingResult, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('key', 'developer_contract_address')
      .limit(1)
      .single();
    console.log('🔍 Wallet API: developer_contract_address result:', { data: settingResult, error });
    // If not found, fallback to developer_wallet_address
    if (error || !settingResult?.value) {
      console.log('🔍 Wallet API: Trying developer_wallet_address...');
      const { data: fallbackResult, error: fallbackError } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'developer_wallet_address')
        .limit(1)
        .single();
      console.log('🔍 Wallet API: developer_wallet_address result:', { data: fallbackResult, error: fallbackError });
      if (fallbackError || !fallbackResult?.value) {
        console.log('❌ Wallet API: No wallet configuration found');
        return res.json({
          success: true,
          address: 'Not configured in admin dashboard',
          balance: 0,
          configured: false
        });
      }
      settingResult = { value: fallbackResult.value };
    }
    const developerWallet = settingResult.value;
    console.log('🏯 Wallet API: Using wallet address:', developerWallet);
    // Fetch real wallet balance from Solana blockchain
    const walletData = await fetchWalletBalance(developerWallet);
    console.log('💰 Wallet API: Fetched balance:', walletData);
    return res.json({
      success: true,
      address: walletData.address,
      balance: walletData.balance,
      configured: true
    });
  } catch (error) {
    console.error('❌ Error fetching wallet data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch wallet data'
    });
  }
});

module.exports = router;

