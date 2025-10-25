const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const { getCurrentSolPrice } = require('../../utils/sol-price.js');

const router = express.Router();

// Now using shared SOL price utility from utils/sol-price.js

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
    const totalFeesSOL = Number.parseFloat(data.totalFeesSOL || data.totalFees || 0);
    if (Number.isNaN(totalFeesSOL) || totalFeesSOL < 0) {
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
  
  // Set response headers early to ensure JSON response
  res.header('Content-Type', 'application/json');
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  
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
        solPrice: 200, // Fallback SOL price
        totalFeesUSD: 0,
        contractAddress: null,
        dataSource: 'no-data'
      });
    }
    
    // Fetch SOL price and creator fees in parallel with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 20000);
    });
    
    const [solPriceResult, totalFeesResult] = await Promise.allSettled([
      Promise.race([getCurrentSolPrice(), timeoutPromise]),
      Promise.race([fetchCreatorFees(addressToUse), timeoutPromise])
    ]);
    
    // Handle SOL price result with better fallback
    let finalSolPrice = 200; // Robust fallback
    if (solPriceResult.status === 'fulfilled' && 
        typeof solPriceResult.value === 'number' && 
        solPriceResult.value > 0) {
      finalSolPrice = solPriceResult.value;
    } else {
      console.warn('SOL price fetch failed or invalid, using fallback:', 
        solPriceResult.status === 'rejected' ? solPriceResult.reason : 'Invalid value');
    }
    
    // Handle creator fees result
    let finalFeesSOL = 0;
    if (totalFeesResult.status === 'fulfilled') {
      finalFeesSOL = totalFeesResult.value;
    } else {
      console.warn('Creator fees fetch failed, using zero:', 
        totalFeesResult.status === 'rejected' ? totalFeesResult.reason : 'Unknown error');
      // Don't return error for fees failure, just use 0
    }
    
    const result = {
      totalFees: finalFeesSOL,
      transactionCount: 0,
      lastUpdated: new Date().toISOString(),
      solPrice: finalSolPrice,
      totalFeesUSD: finalFeesSOL * finalSolPrice,
      contractAddress: addressToUse,
      dataSource: addressSource,
      success: true
    };
    
    console.log('✅ API Response:', result);
    return res.json(result);
    
  } catch (error) {
    console.error('❌ Unexpected error in PumpFun fees API:', error);
    
    // Always return valid JSON even on critical error
    const errorResponse = {
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
      details: error instanceof Error ? error.message : 'Unknown error occurred',
      totalFees: 0,
      transactionCount: 0,
      solPrice: 200, // Always provide fallback SOL price
      totalFeesUSD: 0,
      contractAddress: null,
      dataSource: 'error-fallback',
      success: false
    };
    
    return res.status(500).json(errorResponse);
  }
});

module.exports = router;

