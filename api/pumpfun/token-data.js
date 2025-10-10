const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const router = express.Router();

// Force reload timestamp: 2025-10-07T09:22:00
router.get('/', async (req, res) => {
  try {
    console.log('🔍 PumpFun token-data API called');
    const supabase = getSupabaseAdminClient();
    const { data: tokenData, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'pumpfun_contract_address')
      .single();
    if (error) {
      throw error;
    }
    const contractAddress = tokenData?.value;
    if (!contractAddress || contractAddress.trim() === '') {
      console.log('🔍 No contract address found, returning default data');
      const defaultTokenData = {
        contractAddress: '',
        name: 'WhatNext Token',
        symbol: 'WHAT',
        price: 0,
        marketCap: 0,
        holders: 0,
        volume24h: 0,
        lastUpdated: new Date().toISOString(),
        status: 'Contract address not configured'
      };
      return res.status(200).json({
        success: true,
        data: defaultTokenData,
        message: 'Token data endpoint operational - contract address pending configuration'
      });
    }
    const pumpfunTokenData = {
      contractAddress,
      name: 'WhatNext Token',
      symbol: 'WHAT',
      price: 0,
      marketCap: 0,
      holders: 0,
      volume24h: 0,
      lastUpdated: new Date().toISOString()
    };
    res.json({
      success: true,
      data: pumpfunTokenData
    });
  } catch (error) {
    console.error('❌ PumpFun token data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch PumpFun token data'
    });
  }
});

module.exports = router;

