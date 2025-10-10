const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

// Cache for SOL price to reduce API calls
let cachedSOLPrice = null;
const CACHE_DURATION = 60000; // 1 minute cache

/**
 * Fetches current SOL price from CoinGecko API with caching and rate limiting
 */
async function fetchSOLPrice() {
  // Check cache first
  if (cachedSOLPrice && (Date.now() - cachedSOLPrice.timestamp) < CACHE_DURATION) {
    return cachedSOLPrice.price;
  }
  try {
    const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WhatNext/1.0'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!priceResponse.ok) {
      console.warn(`⚠️ CoinGecko API returned status ${priceResponse.status}`);
      if (cachedSOLPrice?.price) return cachedSOLPrice.price;
      throw new Error('CoinGecko API unavailable and no cached price');
    }
    const priceData = await priceResponse.json();
    const solPrice = priceData?.solana?.usd;
    if (typeof solPrice === 'number' && solPrice > 0) {
      console.log(`✅ SOL price fetched: $${solPrice}`);
      cachedSOLPrice = { price: solPrice, timestamp: Date.now() };
      return solPrice;
    } else {
      console.warn('⚠️ Invalid SOL price data received');
      if (cachedSOLPrice?.price) return cachedSOLPrice.price;
      throw new Error('CoinGecko API unavailable and no cached price');
    }
  } catch (error) {
    console.warn('⚠️ Failed to fetch SOL price:', error instanceof Error ? error.message : 'Unknown error');
    if (cachedSOLPrice?.price) return cachedSOLPrice.price;
    throw new Error('CoinGecko API unavailable and no cached price');
  }
}

/**
 * Fetches contract address from database
 */
async function fetchContractAddress() {
  try {
    const supabase = getSupabaseAdminClient();
    // Try pumpfun_contract_address first for backward compatibility
    let { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'pumpfun_contract_address')
      .single();
    if (!error && data?.value && data.value !== 'YOUR_CONTRACT_ADDRESS_HERE' && data.value !== 'your-contract-address-here') {
      console.log(`✅ PumpFun contract address from database: ${data.value}`);
      return data.value;
    }
    // Fallback to developer_contract_address for unified configuration
    ({ data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'developer_contract_address')
      .single());
    if (!error && data?.value && data.value !== 'YOUR_CONTRACT_ADDRESS_HERE' && data.value !== 'your-contract-address-here') {
      console.log(`✅ Developer contract address from database: ${data.value}`);
      return data.value;
    }
    console.log('❌ No valid contract address found in database');
    return null;
  } catch (error) {
    console.error('❌ Error fetching contract address from database:', error);
    return null;
  }
}

/**
 * Fetches creator fees from PumpFun API
 */
async function fetchCreatorFees(contractAddress) {
  const API_URL = `https://swap-api.pump.fun/v1/creators/${contractAddress}/fees/total`;
  try {
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'Accept': '*/*',
        'Origin': 'https://pump.fun',
        'Referer': 'https://pump.fun/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      throw new Error(`PumpFun API returned status ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    const totalFeesSOL = parseFloat(data.totalFeesSOL || data.totalFees || 0);
    if (isNaN(totalFeesSOL) || totalFeesSOL < 0) {
      throw new Error('Invalid fees data received from PumpFun API');
    }
    console.log(`✅ Creator fees: ${totalFeesSOL.toFixed(6)} SOL`);
    return totalFeesSOL;
  } catch (error) {
    console.error('❌ PumpFun API error:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

/**
 * GET /api/ecosystem/pumpfun-fees
 * Get PumpFun specific fees data - matches What-Next format exactly
 */
router.get('/', async (req, res) => {
  console.log('🚀 Starting PumpFun creator fees API request...');
  try {
    // Accept walletAddress query param
    const walletAddress = req.query.walletAddress;
    let addressToUse = walletAddress;
    let addressSource = 'wallet-param';
    if (!addressToUse) {
      // Fallback to contract address from DB
      const dbAddress = await fetchContractAddress();
      addressToUse = dbAddress || undefined;
      addressSource = 'db-contract';
    }
    if (!addressToUse) {
      console.log('❌ No contract or wallet address configured, returning empty response');
      return res.json({
        error: 'No PumpFun contract or wallet address configured',
        totalFees: 0,
        transactionCount: 0,
        lastUpdated: new Date().toISOString(),
        solPrice: 0,
        totalFeesUSD: 0,
        contractAddress: null,
        dataSource: 'no-data'
      });
    }
    // Fetch SOL price and creator fees in parallel
    const [solPriceResult, totalFeesResult] = await Promise.allSettled([
      fetchSOLPrice(),
      fetchCreatorFees(addressToUse)
    ]);
    // Handle SOL price result
    if (solPriceResult.status !== 'fulfilled') {
      console.error('SOL price fetch failed:', solPriceResult.reason);
      return res.status(503).json({
        error: 'Failed to fetch live Solana price from CoinGecko',
        details: solPriceResult.reason instanceof Error ? solPriceResult.reason.message : 'Unknown error',
        totalFees: 0,
        transactionCount: 0,
        lastUpdated: new Date().toISOString(),
        solPrice: null,
        totalFeesUSD: 0,
        contractAddress: addressToUse,
        dataSource: 'no-sol-price'
      });
    }
    const finalSolPrice = solPriceResult.value;
    // Handle creator fees result
    let finalFeesSOL = 0;
    if (totalFeesResult.status === 'fulfilled') {
      finalFeesSOL = totalFeesResult.value;
    } else {
      console.error('Creator fees fetch failed:', totalFeesResult.reason);
      return res.status(503).json({
        error: 'Failed to fetch creator fees',
        details: totalFeesResult.reason instanceof Error ? totalFeesResult.reason.message : 'Unknown error'
      });
    }
    const result = {
      totalFees: finalFeesSOL,
      transactionCount: 0,
      lastUpdated: new Date().toISOString(),
      solPrice: finalSolPrice,
      totalFeesUSD: finalFeesSOL * finalSolPrice,
      contractAddress: addressToUse,
      dataSource: addressSource
    };
    console.log('✅ API Response:', result);
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    return res.json(result);
  } catch (error) {
    console.error('❌ Unexpected error in PumpFun fees API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

module.exports = router;

