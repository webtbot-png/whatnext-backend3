const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

/**
 * Simple wallet balance fetcher using Solana RPC
 */
async function fetchWalletBalance(walletAddress) {
  try {
    console.log('🔍 Fetching balance for wallet:', walletAddress);
    
    // Simple RPC call to get wallet balance
    const response = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [walletAddress]
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Solana RPC error: ${data.error.message}`);
    }
    
    const lamports = data.result?.value || 0;
    const solBalance = lamports / 1000000000; // Convert lamports to SOL
    
    console.log('💰 Wallet balance:', solBalance, 'SOL');
    
    return {
      address: walletAddress,
      balance: solBalance,
      balanceLamports: lamports
    };
  } catch (error) {
    console.error('❌ Error fetching wallet balance:', error);
    // Return default data on error
    return {
      address: walletAddress,
      balance: 0,
      balanceLamports: 0
    };
  }
}

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

