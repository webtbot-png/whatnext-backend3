/**
 * Shared SOL Price Utility
 * Centralized SOL price fetching with multiple API sources and smart fallback
 */

let solPricePromise = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30 * 1000; // 30 seconds

/**
 * Get current SOL price with promise caching and multiple API fallbacks
 * @returns {Promise<number>} SOL price in USD
 */
async function getCurrentSolPrice() {
  const now = Date.now();
  
  // Return cached promise if still valid
  if (solPricePromise && (now - lastFetchTime) < CACHE_DURATION) {
    try {
      return await solPricePromise;
    } catch (error) {
      // If cached promise fails, clear cache and continue to create new one
      console.warn('⚠️ Cached SOL price promise failed, creating new request:', error);
      solPricePromise = null;
    }
  }

  // Create new promise for fetching
  solPricePromise = fetchSolPriceFromMultipleSources();
  lastFetchTime = now;

  try {
    return await solPricePromise;
  } catch (error) {
    console.error('❌ All SOL price sources failed:', error);
    solPricePromise = null; // Clear failed promise
    
    // Instead of hardcoded fallback, try emergency backup sources
    try {
      console.log('🆘 Attempting emergency backup sources...');
      return await fetchEmergencyBackupPrice();
    } catch (emergencyError) {
      console.error('❌ Emergency backup sources also failed:', emergencyError);
      throw new Error('Unable to fetch SOL price from any source');
    }
  }
}

/**
 * Fetch SOL price from multiple sources with fallback chain
 * @returns {Promise<number>}
 */
async function fetchSolPriceFromMultipleSources() {
  const sources = [
    () => fetchFromCoinGecko(),
    () => fetchFromJupiter(),
    () => fetchFromCoinCap(),
    () => fetchFromCrypto()
  ];

  for (const [index, fetchSource] of sources.entries()) {
    try {
      const price = await fetchSource();
      if (price && typeof price === 'number' && price > 50 && price < 1000) {
        console.log(`💰 SOL Price fetched from source ${index + 1}: $${price}`);
        return price;
      }
    } catch (error) {
      console.warn(`⚠️ Source ${index + 1} failed:`, error.message);
      continue;
    }
  }
  
  throw new Error('All SOL price sources failed');
}

/**
 * Fetch from CoinGecko (primary)
 */
async function fetchFromCoinGecko() {
  const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'WhatNext-Backend/1.0'
    },
    timeout: 8000
  });

  if (!response.ok) {
    throw new Error(`CoinGecko API failed with status: ${response.status}`);
  }

  const data = await response.json();
  return data.solana?.usd;
}

/**
 * Fetch from Jupiter (Solana native)
 */
async function fetchFromJupiter() {
  const response = await fetch('https://price.jup.ag/v4/price?ids=So11111111111111111111111111111111111111112', {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    timeout: 8000
  });

  if (!response.ok) {
    throw new Error(`Jupiter API failed with status: ${response.status}`);
  }

  const data = await response.json();
  return data.data?.['So11111111111111111111111111111111111111112']?.price;
}

/**
 * Fetch from CoinCap
 */
async function fetchFromCoinCap() {
  const response = await fetch('https://api.coincap.io/v2/assets/solana', {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    timeout: 8000
  });

  if (!response.ok) {
    throw new Error(`CoinCap API failed with status: ${response.status}`);
  }

  const data = await response.json();
  return Number.parseFloat(data.data?.priceUsd);
}

/**
 * Fetch from Crypto.com (backup)
 */
async function fetchFromCrypto() {
  const response = await fetch('https://api.crypto.com/v2/public/get-ticker?instrument_name=SOL_USD', {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    timeout: 8000
  });

  if (!response.ok) {
    throw new Error(`Crypto.com API failed with status: ${response.status}`);
  }

  const data = await response.json();
  return Number.parseFloat(data.result?.data?.[0]?.a);
}

/**
 * Emergency backup sources when all main sources fail
 */
async function fetchEmergencyBackupPrice() {
  const emergencySources = [
    () => fetchFromBinance(),
    () => fetchFromKraken(),
    () => fetchFromCoinbase(),
    () => fetchFromDexScreener()
  ];

  for (const [index, fetchSource] of emergencySources.entries()) {
    try {
      const price = await fetchSource();
      if (price && typeof price === 'number' && price > 50 && price < 1000) {
        console.log(`🆘 Emergency SOL Price fetched from backup ${index + 1}: $${price}`);
        return price;
      }
    } catch (error) {
      console.warn(`⚠️ Emergency source ${index + 1} failed:`, error.message);
      continue;
    }
  }
  
  throw new Error('All emergency backup sources failed');
}

/**
 * Fetch from Binance
 */
async function fetchFromBinance() {
  const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT', {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    timeout: 8000
  });

  if (!response.ok) {
    throw new Error(`Binance API failed with status: ${response.status}`);
  }

  const data = await response.json();
  return Number.parseFloat(data.price);
}

/**
 * Fetch from Kraken
 */
async function fetchFromKraken() {
  const response = await fetch('https://api.kraken.com/0/public/Ticker?pair=SOLUSD', {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    timeout: 8000
  });

  if (!response.ok) {
    throw new Error(`Kraken API failed with status: ${response.status}`);
  }

  const data = await response.json();
  const result = data.result?.SOLUSD;
  return Number.parseFloat(result?.c?.[0]); // Current price
}

/**
 * Fetch from Coinbase
 */
async function fetchFromCoinbase() {
  const response = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=SOL', {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    timeout: 8000
  });

  if (!response.ok) {
    throw new Error(`Coinbase API failed with status: ${response.status}`);
  }

  const data = await response.json();
  return Number.parseFloat(data.data?.rates?.USD);
}

/**
 * Fetch from DexScreener (Solana DEX data)
 */
async function fetchFromDexScreener() {
  const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112', {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    timeout: 8000
  });

  if (!response.ok) {
    throw new Error(`DexScreener API failed with status: ${response.status}`);
  }

  const data = await response.json();
  const pairs = data.pairs;
  if (pairs && pairs.length > 0) {
    // Get the pair with highest liquidity
    const bestPair = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    return Number.parseFloat(bestPair.priceUsd);
  }
  throw new Error('No valid pairs found in DexScreener data');
}

/**
 * Clear the cached SOL price (useful for testing)
 */
function clearSolPriceCache() {
  solPricePromise = null;
  lastFetchTime = 0;
}

module.exports = {
  getCurrentSolPrice,
  clearSolPriceCache
};
