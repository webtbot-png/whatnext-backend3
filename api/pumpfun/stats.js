const express = require('express');
const router = express.Router();

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
              holders: parseInt(tokenData.holder_count || tokenData.holders || '0'),
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
              holders: 0,
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
        holders: 0,
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

