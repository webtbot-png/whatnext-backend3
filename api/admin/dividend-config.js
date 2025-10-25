const express = require('express');
const { getSupabaseAdminClient } = require('../../database.js');

const router = express.Router();

/**
 * GET /admin/dividend-config - Get current dividend system configuration
 */
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    
    // Get current auto_claim_settings
    const { data: settings, error: settingsError } = await supabase
      .from('auto_claim_settings')
      .select('*')
      .single();
    
    if (settingsError && settingsError.code !== 'PGRST116') {
      throw settingsError;
    }
    
    // Get app_settings for pumpfun contract
    const { data: appSettings, error: appError } = await supabase
      .from('app_settings')
      .select('*')
      .eq('key', 'pumpfun_contract_address')
      .single();
    
    if (appError && appError.code !== 'PGRST116') {
      console.warn('No pumpfun_contract_address found in app_settings');
    }
    
    const response = {
      auto_claim_settings: settings || {
        enabled: false,
        claim_interval_minutes: 10,
        distribution_percentage: 30,
        min_claim_amount: 0.001,
        claim_wallet_address: null,
        pumpfun_fee_account: null,
        token_mint_address: null
      },
      pumpfun_contract_address: appSettings?.value || null,
      status: 'ready'
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error fetching dividend config:', error);
    res.status(500).json({
      error: 'Failed to fetch dividend configuration',
      details: error.message
    });
  }
});

/**
 * POST /admin/dividend-config - Update dividend system configuration
 */
router.post('/', async (req, res) => {
  try {
    const {
      enabled,
      claim_interval_minutes,
      distribution_percentage,
      min_claim_amount,
      claim_wallet_address,
      pumpfun_fee_account,
      token_mint_address,
      pumpfun_contract_address
    } = req.body;
    
    console.log('🔧 Updating dividend configuration:', req.body);
    
    const supabase = getSupabaseAdminClient();
    
    // Validate required fields
    if (!token_mint_address) {
      return res.status(400).json({
        error: 'token_mint_address is required for dividend system to function'
      });
    }
    
    // Validate base58 format for addresses
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    
    if (!base58Regex.test(token_mint_address)) {
      return res.status(400).json({
        error: 'Invalid token_mint_address format. Must be a valid Solana base58 address.'
      });
    }
    
    if (claim_wallet_address && !base58Regex.test(claim_wallet_address)) {
      return res.status(400).json({
        error: 'Invalid claim_wallet_address format. Must be a valid Solana base58 address.'
      });
    }
    
    if (pumpfun_fee_account && !base58Regex.test(pumpfun_fee_account)) {
      return res.status(400).json({
        error: 'Invalid pumpfun_fee_account format. Must be a valid Solana base58 address.'
      });
    }
    
    // Update auto_claim_settings
    const settingsData = {
      enabled: enabled ?? false,
      claim_interval_minutes: claim_interval_minutes ?? 10,
      distribution_percentage: distribution_percentage ?? 30,
      min_claim_amount: min_claim_amount ?? 0.001,
      claim_wallet_address,
      pumpfun_fee_account,
      token_mint_address
    };
    
    const { data: settings, error: settingsError } = await supabase
      .from('auto_claim_settings')
      .upsert(settingsData)
      .select()
      .single();
    
    if (settingsError) {
      throw settingsError;
    }
    
    // Update pumpfun contract address in app_settings if provided
    if (pumpfun_contract_address) {
      const { error: contractError } = await supabase
        .from('app_settings')
        .upsert({
          key: 'pumpfun_contract_address',
          value: pumpfun_contract_address
        });
      
      if (contractError) {
        console.error('⚠️ Failed to update pumpfun_contract_address:', contractError);
      }
    }
    
    console.log('✅ Dividend configuration updated successfully');
    
    res.json({
      message: 'Dividend configuration updated successfully',
      settings,
      status: 'updated'
    });
    
  } catch (error) {
    console.error('❌ Error updating dividend config:', error);
    res.status(500).json({
      error: 'Failed to update dividend configuration',
      details: error.message
    });
  }
});

/**
 * POST /admin/dividend-config/test-token - Test if a token mint address is valid
 */
router.post('/test-token', async (req, res) => {
  try {
    const { token_mint_address } = req.body;
    
    if (!token_mint_address) {
      return res.status(400).json({
        error: 'token_mint_address is required'
      });
    }
    
    // Import Solana connection
    const { Connection, PublicKey } = require('@solana/web3.js');
    const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
    
    try {
      const mintPublicKey = new PublicKey(token_mint_address);
      
      // Try to get mint info
      const mintInfo = await connection.getParsedAccountInfo(mintPublicKey);
      
      if (!mintInfo.value) {
        return res.json({
          valid: false,
          error: 'Token mint address does not exist on Solana network'
        });
      }
      
      // Try to get token accounts
      const tokenAccounts = await connection.getParsedProgramAccounts(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        {
          filters: [
            {
              dataSize: 165,
            },
            {
              memcmp: {
                offset: 0,
                bytes: mintPublicKey.toBase58(),
              },
            },
          ],
        }
      );
      
      res.json({
        valid: true,
        token_mint_address,
        holders_count: tokenAccounts.length,
        mint_info: mintInfo.value?.data,
        message: 'Token mint address is valid and has holders'
      });
      
    } catch (solanaError) {
      res.json({
        valid: false,
        error: 'Invalid Solana address format',
        details: solanaError.message
      });
    }
    
  } catch (error) {
    console.error('❌ Error testing token address:', error);
    res.status(500).json({
      error: 'Failed to test token address',
      details: error.message
    });
  }
});

module.exports = router;
