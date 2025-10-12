const express = require('express');
const router = express.Router();

// Function to get holder count from Solscan API as fallback
async function getHoldersCount(contractAddress) {
  try {
    console.log('Attempting to fetch holders from Solscan for:', contractAddress);
    const solscanUrl = `https://public-api.solscan.io/token/holders?tokenAddress=${contractAddress}`;
    const response = await fetch(solscanUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WhatNext/1.0'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Solscan holders response:', data);
      
      if (data.data && Array.isArray(data.data)) {
        return data.data.length;
      }
      if (data.total) {
        return parseInt(data.total);
      }
    }
  } catch (error) {
    console.log('Solscan holders API failed:', error);
  }
  
  // Try alternative: Birdeye API
  try {
    console.log('Attempting to fetch holders from Birdeye for:', contractAddress);
    const birdeyeUrl = `https://public-api.birdeye.so/defi/token_overview?address=${contractAddress}`;
    const response = await fetch(birdeyeUrl, {
      headers: {
        'Accept': 'application/json',
        'X-API-KEY': process.env.BIRDEYE_API_KEY || '', // Optional API key
        'User-Agent': 'WhatNext/1.0'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Birdeye holders response:', data);
      
      if (data.data && data.data.holder) {
        return parseInt(data.data.holder);
      }
    }
  } catch (error) {
    console.log('Birdeye holders API failed:', error);
  }
  
  console.log('All holder count APIs failed, returning 0');
  return 0;
}

router.get('/', async (req, res) => {
  try {
    const contractAddress = req.query.contract;
    if (!contractAddress || contractAddress.trim() === '') {
      return res.status(200).json({
        success: false,
        error: 'Contract address is required',
        data: {
          contractAddress: '',
          name: 'No Token Set',
          symbol: 'NONE',
          description: 'No token contract address configured',
          marketCap: 0,
          volume24h: 0,
          price: 0,
          holders: 0,
          image: '',
          createdTimestamp: Date.now()
        }
      });
    }
    const cleanContractAddress = contractAddress
      .replace(/^(https?:\/\/)?(pump\.fun\/)?(coin\/)?/, '')
      .trim();
    if (!cleanContractAddress) {
      throw new Error('Invalid contract address format');
    }
    console.log('Fetching token stats for:', cleanContractAddress);
    // Try pump.fun API directly first for most accurate data
    try {
      const pumpfunUrl = `https://frontend-api.pump.fun/coins/${cleanContractAddress}`;
      console.log('Trying pump.fun API:', pumpfunUrl);
      const response = await fetch(pumpfunUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WhatNext/1.0',
          'Referer': 'https://pump.fun/'
        }
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Pump.fun API response:', data);
        if (data) {
          const tokenData = data;
          
          // Try to get holders from pump.fun data first
          let holders = parseInt(tokenData.holder_count || tokenData.holders || '0');
          console.log('Pump.fun holders data:', { 
            holder_count: tokenData.holder_count, 
            holders: tokenData.holders, 
            parsed: holders,
            raw_data_keys: Object.keys(tokenData)
          });
          
          // If pump.fun doesn't have holders data, try fallback APIs
          if (holders === 0) {
            console.log('Pump.fun has no holder data, trying fallback APIs...');
            holders = await getHoldersCount(cleanContractAddress);
          }
          
          return res.json({
            success: true,
            source: 'pump.fun',
            data: {
              contractAddress: cleanContractAddress,
              name: tokenData.name || 'Unknown Token',
              symbol: tokenData.symbol || 'UNKNOWN',
              description: tokenData.description || 'Token on pump.fun',
              marketCap: parseFloat(tokenData.market_cap || tokenData.usd_market_cap || '0'),
              volume24h: parseFloat(tokenData.volume_24h || '0'),
              price: parseFloat(tokenData.price || '0'),
              holders: holders,
              image: tokenData.image_uri || tokenData.image || '',
              createdTimestamp: tokenData.created_timestamp || Date.now(),
              website: tokenData.website || '',
              twitter: tokenData.twitter || '',
              telegram: tokenData.telegram || ''
            }
          });
        }
      }
    } catch (pumpError) {
      console.log('Pump.fun API failed:', pumpError);
    }
    // Try DexScreener API as fallback
    try {
      const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${cleanContractAddress}`;
      console.log('Trying DexScreener API:', dexScreenerUrl);
      const response = await fetch(dexScreenerUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WhatNext/1.0'
        }
      });
      if (response.ok) {
        const data = await response.json();
        console.log('DexScreener API response:', data);
        if (data.pairs && data.pairs.length > 0) {
          const pair = data.pairs[0];
          return res.json({
            success: true,
            source: 'dexscreener',
            data: {
              contractAddress: cleanContractAddress,
              name: pair.baseToken?.name || 'Unknown Token',
              symbol: pair.baseToken?.symbol || 'UNKNOWN',
              description: `Trading on ${pair.dexId}`,
              marketCap: parseFloat(pair.fdv || pair.marketCap || '0'),
              volume24h: parseFloat(pair.volume?.h24 || '0'),
              price: parseFloat(pair.priceUsd || '0'),
              holders: await getHoldersCount(cleanContractAddress),
              image: pair.info?.imageUrl || '',
              createdTimestamp: pair.pairCreatedAt || Date.now(),
              priceChange24h: parseFloat(pair.priceChange?.h24 || '0')
            }
          });
        }
      }
    } catch (dexError) {
      console.log('DexScreener API failed:', dexError);
    }
    // Return basic placeholder data if all APIs fail
    console.log('All APIs failed, returning placeholder data');
    const fallbackHolders = await getHoldersCount(cleanContractAddress);
    return res.json({
      success: true,
      source: 'placeholder',
      data: {
        contractAddress: cleanContractAddress,
        name: 'Token Available',
        symbol: 'TOKEN',
        description: 'Token is available on pump.fun',
        marketCap: 0,
        volume24h: 0,
        price: 0,
        holders: fallbackHolders,
        image: '',
        createdTimestamp: Date.now()
      }
    });
  } catch (error) {
    console.error('Token stats API error:', error);
    return res.json({
      success: false,
      error: 'Failed to fetch token data',
      data: {
        contractAddress: '',
        name: 'Token Loading...',
        symbol: 'LOADING',
        description: 'Token data is being loaded...',
        marketCap: 0,
        volume24h: 0,
        price: 0,
        holders: 0,
        image: '',
        createdTimestamp: Date.now()
      }
    });
  }
});

module.exports = router;

