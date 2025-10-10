const express = require('express');
const { getSupabaseClient  } = require('../../database.js');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    console.log('GET /api/pumpfun: Starting request...');
    const supabaseUrl = process.env.SUPABASE_URL;
    let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseKey) {
      console.log('GET /api/pumpfun: SERVICE_ROLE_KEY not found, using ANON key for cloud hosting');
      supabaseKey = process.env.SUPABASE_ANON_KEY;
    }
    console.log('GET /api/pumpfun: Environment check:');
    console.log('  - SUPABASE_URL:', supabaseUrl?.substring(0, 30) + '...');
    console.log('  - Using key type:', supabaseKey === process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON');
    if (!supabaseUrl || !supabaseKey) {
      console.log('GET /api/pumpfun: Database not configured - missing environment variables');
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.json({
        contractAddress: null,
        pumpfunUrl: null,
        isLive: false,
        message: 'Database not configured - check environment variables',
        error: 'MISSING_ENV_VARS'
      });
    }
    const supabase = getSupabaseClient();
    console.log('GET /api/pumpfun: Querying app_settings...');
    const timestamp = Date.now();
    console.log('GET /api/pumpfun: Cache-busting timestamp:', timestamp);
    let settings = null;
    let error = null;
    const result1 = await supabase
      .from('app_settings')
      .select('value, updated_at')
      .eq('key', 'pumpfun_contract_address')
      .single();
    const result2 = await supabase
      .from('app_settings')
      .select('value, updated_at')
      .eq('key', 'pumpfun_contract_address')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    if (result1.data && result2.data) {
      settings = result1.data.updated_at > result2.data.updated_at ? result1.data : result2.data;
    } else if (result1.data) {
      settings = result1.data;
    } else if (result2.data) {
      settings = result2.data;
    } else {
      error = result1.error || result2.error;
    }
    console.log('GET /api/pumpfun: Query result:', { data: settings, error });
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    res.header('Surrogate-Control', 'no-store');
    if (!settings?.value) {
      console.log('GET /api/pumpfun: No contract address found, returning null');
      return res.json({
        contractAddress: null,
        pumpfunUrl: null,
        isLive: false,
        message: 'No contract address set'
      });
    }
    console.log('GET /api/pumpfun: Returning contract address:', settings.value);
    return res.json({
      contractAddress: settings.value,
      pumpfunUrl: `https://pump.fun/coin/${settings.value}`,
      lastUpdated: settings.updated_at,
      isLive: true
    });
  } catch (error) {
    console.error('PumpFun API error:', error);
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.json({
      contractAddress: null,
      pumpfunUrl: null,
      isLive: false,
      message: 'Database error'
    });
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

