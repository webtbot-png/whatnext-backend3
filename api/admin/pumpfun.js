const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'whatnext-jwt-secret-2025';

function verifyAdminToken(req) {
  try {
    const authHeader = req.headers.authorization;
    console.log('🔑 TOKEN: Auth header:', authHeader ? `${authHeader.substring(0, 20)}...` : 'NOT FOUND');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('🔑 TOKEN: Invalid auth header format');
      return null;
    }
    const token = authHeader.substring(7);
    console.log('🔑 TOKEN: Extracted token:', `${token.substring(0, 20)}...`);
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('🔑 TOKEN: Decoded token:', decoded);
    const isValid = decoded.admin ? decoded : null;
    console.log('🔑 TOKEN: Token valid:', !!isValid);
    return isValid;
  } catch (error) {
    console.error('🔑 TOKEN: Verification error:', error);
    return null;
  }
}

// GET /api/admin/pumpfun
router.get('/', async (req, res) => {
  try {
    const admin = verifyAdminToken(req);
    if (!admin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const supabase = getSupabaseAdminClient();
    const { data: setting, error } = await supabase
      .from('app_settings')
      .select('value, updated_at')
      .eq('key', 'pumpfun_contract_address')
      .single();
    if (error || !setting) {
      return res.json({
        success: true,
        contractAddress: null,
        message: 'No contract address configured',
        source: 'database'
      });
    }
    return res.json({
      success: true,
      contractAddress: setting.value,
      pumpfunUrl: `https://pump.fun/coin/${setting.value}`,
      lastUpdated: setting.updated_at,
      message: 'Contract address retrieved successfully',
      source: 'database'
    });
  } catch (error) {
    console.error('PumpFun GET error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/pumpfun
router.post('/', async (req, res) => {
  try {
    const admin = verifyAdminToken(req);
    if (!admin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { contractAddress } = req.body;
    console.log('POST: Contract address received:', contractAddress);
    if (!contractAddress || typeof contractAddress !== 'string') {
      return res.status(400).json({ error: 'Valid contract address is required' });
    }
    const cleanAddress = contractAddress.replace(/^(https?:\/\/)?(pump\.fun\/)?/, '').trim();
    if (!cleanAddress) {
      return res.status(400).json({ error: 'Invalid contract address format' });
    }
    console.log('POST: DANGER - This will INSERT a new contract address into database:', cleanAddress);
    console.log('POST: If you just deleted the contract, this should NOT be happening!');
    const supabase = getSupabaseAdminClient();
    // Delete existing entries first
    console.log('POST: Deleting existing entries...');
    await supabase
      .from('app_settings')
      .delete()
      .eq('key', 'pumpfun_contract_address');
    // Insert new value
    console.log('POST: Inserting new contract address:', cleanAddress);
    const { data, error } = await supabase
      .from('app_settings')
      .insert({
        key: 'pumpfun_contract_address',
        value: cleanAddress,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error) {
      console.error('Database update error:', error);
      return res.json({
        success: true,
        contractAddress: cleanAddress,
        pumpfunUrl: `https://pump.fun/coin/${cleanAddress}`,
        message: 'Contract address updated (database may be offline)',
        source: 'memory'
      });
    }
    return res.json({
      success: true,
      contractAddress: cleanAddress,
      pumpfunUrl: `https://pump.fun/coin/${cleanAddress}`,
      lastUpdated: data.updated_at,
      message: 'Contract address updated successfully',
      source: 'database'
    });
  } catch (error) {
    console.error('PumpFun POST error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/pumpfun
router.delete('/', async (req, res) => {
  try {
    const admin = verifyAdminToken(req);
    if (!admin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const supabase = getSupabaseAdminClient();
    // Step 0: Check what's currently in app_settings BEFORE delete
    console.log('DELETE: Checking current app_settings entries...');
    const { data: beforeSettings } = await supabase
      .from('app_settings')
      .select('*');
    console.log('DELETE: Current app_settings:', beforeSettings);
    // Step 1: NUCLEAR DELETE - Remove ALL pump.fun related entries using service role
    console.log('DELETE: Attempting NUCLEAR delete from app_settings...');
    // First: Delete ALL entries with key 'pumpfun_contract_address' (there might be duplicates)
    const { data: exactDelete, error: exactError } = await supabase
      .from('app_settings')
      .delete()
      .eq('key', 'pumpfun_contract_address')
      .select();
    console.log('DELETE: Exact delete result:', { data: exactDelete, error: exactError });
    // Second: Delete ANY entries containing 'pumpfun' in the key
    const { data: wildcardDelete, error: wildcardError } = await supabase
      .from('app_settings')
      .delete()
      .ilike('key', '%pumpfun%')
      .select();
    console.log('DELETE: Wildcard delete result:', { data: wildcardDelete, error: wildcardError });
    // Third: FORCE delete any entries with the specific contract value (in case key is different)
    const { data: valueDelete, error: valueError } = await supabase
      .from('app_settings')
      .delete()
      .eq('value', '4CBToKTRKfBsv8RMfzMr6VfKQ8PLRYeG6RFGZmq4pump')
      .select();
    console.log('DELETE: Value-based delete result:', { data: valueDelete, error: valueError });
    // Step 1.5: Double-check deletion worked
    const { data: afterSettings } = await supabase
      .from('app_settings')
      .select('*');
    console.log('DELETE: App_settings after deletion:', afterSettings);
    // Step 1.6: FORCE DATABASE SYNC - wait and verify deletion with fresh connection
    console.log('DELETE: Waiting 5 seconds for Supabase replication sync...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    // Create a completely new Supabase client to avoid connection pooling
    console.log('DELETE: Creating new database connection to verify deletion...');
    const freshSupabase = getSupabaseAdminClient();
    const { data: verifySettings } = await freshSupabase
      .from('app_settings')
      .select('*')
      .eq('key', 'pumpfun_contract_address');
    console.log('DELETE: Final verification - contract entries found:', verifySettings?.length || 0);
    if (verifySettings && verifySettings.length > 0) {
      console.log('DELETE: WARNING - Contract still exists after deletion!', verifySettings);
    }
    // Step 2: Reset ALL pump.fun media URLs back to DYNAMIC_PUMPFUN_URL
    console.log('DELETE: Attempting to update media table...');
    const { data: updatedMedia, error: mediaError } = await supabase
      .from('media')
      .update({ 
        url: 'DYNAMIC_PUMPFUN_URL',
        updated_at: new Date().toISOString()
      })
      .eq('type', 'pumpfun')
      .select();
    console.log('DELETE: Media update result:', { data: updatedMedia, error: mediaError });
    if (mediaError) {
      console.error('Media update error:', mediaError);
      return res.json({
        success: true,
        message: 'Contract address cleared but media may still show old URL (database error)',
        source: 'database',
        settingsDeleted: (exactDelete?.length || 0) + (wildcardDelete?.length || 0),
        mediaError: mediaError.message
      });
    }
    return res.json({
      success: true,
      message: 'Contract address and all pump.fun media URLs cleared successfully',
      source: 'database',
      settingsDeleted: (exactDelete?.length || 0) + (wildcardDelete?.length || 0),
      mediaUpdated: updatedMedia?.length || 0
    });
  } catch (error) {
    console.error('PumpFun DELETE error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;

