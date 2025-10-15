/**
 * Shared SOL Price Utility
 * Centralized SOL price fetching with promise caching to prevent concurrent requests
 */

let solPricePromise = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30 * 1000; // 30 seconds

/**
 * Get current SOL price with promise caching and fallback
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
  solPricePromise = fetchSolPriceFromAPI();
  lastFetchTime = now;

  try {
    return await solPricePromise;
  } catch (error) {
    console.warn('⚠️ Failed to fetch SOL price, using fallback:', error);
    solPricePromise = null; // Clear failed promise
    return 235; // Fallback price
  }
}

/**
 * Internal function to fetch SOL price from CoinGecko
 * @returns {Promise<number>}
 */
async function fetchSolPriceFromAPI() {
  const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'WhatNext-Backend/1.0'
    },
    timeout: 10000
  });

  if (!response.ok) {
    throw new Error(`CoinGecko API failed with status: ${response.status}`);
  }

  const data = await response.json();
  const price = data.solana?.usd;
  
  if (!price || typeof price !== 'number' || price <= 0) {
    throw new Error('Invalid SOL price data from CoinGecko');
  }

  console.log(`💰 SOL Price fetched: $${price}`);
  return price;
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
