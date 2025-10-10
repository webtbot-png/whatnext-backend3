const express = require('express');
const router = express.Router();

let cachedMarketData = null;
let lastFetch = 0;
const CACHE_DURATION = 10000; // 10 seconds cache

async function fetchPumpFunMarketData(contractAddress) {
  const now = Date.now();
  if (now - lastFetch < CACHE_DURATION && cachedMarketData) {
    return cachedMarketData;
  }
  try {
    const apiUrl = contractAddress
      ? `https://frontend-api.pump.fun/coins/${contractAddress}`
      : 'https://frontend-api.pump.fun/coins/trending';
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Origin': 'https://pump.fun',
        'Referer': 'https://pump.fun/'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      console.log('PumpFun API unavailable, using mock data');
      return generateMockMarketData();
    }
    const data = await response.json();
    let coinData = data;
    if (Array.isArray(data) && data.length > 0) {
      coinData = data[0];
    }
    cachedMarketData = {
      marketCap: parseFloat(coinData.market_cap || coinData.marketCap || '500000'),
      price: parseFloat(coinData.usd_market_cap || coinData.price || '0.001'),
      volume24h: parseFloat(coinData.volume_24h || coinData.volume || '10000'),
      trades24h: parseInt(coinData.txns_24h || coinData.trades || '100'),
      symbol: coinData.symbol || coinData.name || 'PUMP',
      lastUpdated: new Date().toISOString()
    };
    lastFetch = now;
    return cachedMarketData;
  } catch (error) {
    console.error('PumpFun market data error:', error);
    return generateMockMarketData();
  }
}

function generateMockMarketData() {
  const baseMarketCap = 750000;
  const variance = (Math.random() - 0.5) * 200000;
  const marketCap = Math.max(50000, baseMarketCap + variance);
  return {
    marketCap: Math.round(marketCap),
    price: Math.round(marketCap / 1000000000 * 1000) / 1000,
    volume24h: Math.round(Math.random() * 500000 + 100000),
    trades24h: Math.round(Math.random() * 500 + 100),
    symbol: 'WHATNEXT',
    lastUpdated: new Date().toISOString()
  };
}

router.get('/', async (req, res) => {
  try {
    const contractAddress = req.query.contract;
    res.header('Content-Type', 'application/json');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    const marketData = await fetchPumpFunMarketData(contractAddress || undefined);
    return res.json({
      success: true,
      data: marketData,
      cached: Date.now() - lastFetch < CACHE_DURATION,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('PumpFun market data proxy error:', error);
    res.header('Content-Type', 'application/json');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    throw new Error('All PumpFun data sources failed');
  }
});

router.options('/', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Max-Age', '86400');
  res.status(200).end();
});

module.exports = router;

