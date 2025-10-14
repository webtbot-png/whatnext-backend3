const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { getCurrentSolPrice } = require('../../utils/sol-price.js');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'whatnext-jwt-secret-2025';

// --- AUTHENTICATION ---
function verifyAdminToken(req) {
  console.log('🔐 Verifying admin token...');
  console.log('Authorization header:', req.headers.authorization);
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    console.log('❌ No token provided');
    const err = new Error('No token provided');
    err.status = 401;
    throw err;
  }
  try {
    jwt.verify(token, JWT_SECRET);
    console.log('✅ Token verified successfully');
  } catch (e) {
    console.log('❌ Token verification failed:', e);
    const err = new Error('Invalid token');
    err.status = 401;
    throw err;
  }
}

// --- SOL PRICE HELPER --- (Now using shared utility)
async function getLocalSolPrice() {
  console.log('💰 Fetching real-time SOL price from shared utility...');
  try {
    const price = await getCurrentSolPrice();
    if (!price || typeof price !== 'number') throw new Error('Invalid SOL price data from shared utility');
    console.log(`💰 Real-time SOL price: $${price}`);
    return price;
  } catch (error) {
    console.warn(`⚠️ Failed to fetch live SOL price: ${error.message}, using fallback: $177.66`);
    return 177.66; // Fallback price
  }
}

/**
 * GET /api/admin/claims
 * Get QR code claims data for admin dashboard
 */
router.get('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    console.log('🔍 Admin claims API called...');
    const supabase = getSupabaseAdminClient();
    let qrClaims = [];
    let totalClaimed = 0;
    let totalUnclaimedValue = 0;
    let currentSolPrice = 0;
    try {
      const { data: qrData, error: qrError } = await supabase
        .from('claim_links')
        .select('id, code, amount_lamports, amount_usd, status, tx_signature, claimer_address, claimed_at, created_at, expires_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (qrError) {
        console.log('⚠️ Claim links table not found or error:', qrError.message);
        qrClaims = [];
      } else {
        currentSolPrice = await getLocalSolPrice();
        qrClaims = (qrData || []).map(entry => {
          const solAmount = entry.amount_lamports / 1000000000;
          const usdAmount = entry.amount_usd || (solAmount * currentSolPrice);
          let computedStatus = 'unclaimed';
          if (entry.claimed_at) computedStatus = 'claimed';
          else if (entry.expires_at && new Date(entry.expires_at) < new Date()) computedStatus = 'expired';
          return {
            id: entry.id,
            code: entry.code,
            amount_sol: solAmount,
            amount_usd: usdAmount,
            amount_lamports: entry.amount_lamports,
            transaction_hash: entry.tx_signature,
            claimer_address: entry.claimer_address,
            claimed_at: entry.claimed_at,
            created_at: entry.created_at,
            status: entry.status === 'CLAIMED' ? 'claimed' : 'unclaimed',
            display_amount: `${solAmount.toFixed(3)} SOL ($${usdAmount.toFixed(2)})`,
            expires_at: entry.expires_at,
            computed_status: computedStatus.toUpperCase()
          };
        });
        totalClaimed = qrClaims.filter(claim => claim.claimed_at).reduce((sum, claim) => sum + claim.amount_sol, 0);
        totalUnclaimedValue = qrClaims.filter(claim => !claim.claimed_at).reduce((sum, claim) => sum + claim.amount_sol, 0);
      }
    } catch (tableError) {
      console.log('⚠️ Claim links table does not exist, returning empty claims data:', tableError);
      qrClaims = [];
    }
    // Also check for any alternative claims tracking tables
    let alternativeClaims = [];
    try {
      const { data: altData, error: altError } = await supabase
        .from('giveaway_payouts')
        .select('*')
        .eq('payout_type', 'qr_claim')
        .order('created_at', { ascending: false });
      if (!altError && altData) {
        alternativeClaims = altData.map(entry => ({
          id: `payout_${entry.id}`,
          code: 'N/A',
          amount_sol: entry.amount_sol,
          amount_usd: entry.amount_usd,
          transaction_hash: entry.transaction_hash,
          claimer_address: entry.recipient_wallet,
          claimed_at: entry.paid_at,
          created_at: entry.created_at,
          status: 'claimed',
          display_amount: `${entry.amount_sol} SOL`,
          source: 'giveaway_payouts'
        }));
      }
    } catch (err) {
      console.log('No alternative claims found:', err);
    }
    const allClaims = [...qrClaims, ...alternativeClaims];
    const claimedCount = allClaims.filter(claim => claim.claimed_at).length;
    const unclaimedCount = allClaims.filter(claim => !claim.claimed_at).length;
    const now = new Date();
    const expiredCount = qrClaims.filter(claim => {
      if (claim.claimed_at) return false;
      const expiry = claim.expires_at;
      if (!expiry) return false;
      return new Date(expiry) < now;
    }).length;
    const activeCount = unclaimedCount - expiredCount;
    console.log(`✅ Admin claims: Found ${allClaims.length} total claims (${claimedCount} claimed, ${activeCount} active, ${expiredCount} expired)`);
    return res.json({
      success: true,
      claims: allClaims,
      stats: {
        total: allClaims.length,
        active: activeCount,
        used: claimedCount,
        expired: expiredCount
      },
      summary: {
        totalClaims: allClaims.length,
        claimedCount,
        unclaimedCount,
        activeCount,
        expiredCount,
        totalClaimedSol: totalClaimed,
        totalUnclaimedSol: totalUnclaimedValue,
        totalClaimedUsd: totalClaimed * currentSolPrice,
        totalUnclaimedUsd: totalUnclaimedValue * currentSolPrice
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    if (error.status === 401) {
      console.error('❌ Authentication error:', error.message);
      return res.status(401).json({ success: false, error: 'Unauthorized', details: error.message });
    }
    console.error('❌ Unexpected error in admin claims API:', error);
    return res.status(500).json({ success: false, error: 'Internal server error', details: error.message });
  }
});

// --- QR CODE GENERATION HELPERS ---
async function generateSingleQR(supabase, id) {
  const { data: claim, error } = await supabase
    .from('claim_links')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !claim) {
    console.log('❌ Claim not found:', error?.message);
    throw new Error(`Claim not found: ${error?.message}`);
  }
  const claimUrl = `${process.env.FRONTEND_URL || 'https://web-production-061ff.up.railway.app'}/claim/${claim.code}`;
  const qrBuffer = await QRCode.toBuffer(claimUrl, { type: 'png', width: 512, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
  return { qrBuffer, qr: qrBuffer.toString('base64'), url: claimUrl, claim: { ...claim, amount_sol: claim.amount_lamports ? claim.amount_lamports / 1000000000 : 0 } };
}

async function generateBulkQRs(supabase, count, amount, durationDays) {
  const qrData = [];
  for (let i = 0; i < count; i++) {
    const code = Math.random().toString(36).substring(2, 15);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
    const { data: newClaim, error: createError } = await supabase
      .from('claim_links')
      .insert({ code, amount_lamports: Math.floor(amount * 1000000000), expires_at: expiresAt.toISOString(), status: 'ACTIVE', created_at: new Date().toISOString() })
      .select()
      .single();
    if (createError) {
      console.log(`❌ Failed to create claim ${i + 1}:`, createError.message);
      throw new Error(`Failed to create claim ${i + 1}: ${createError.message}`);
    }
    const claimUrl = `${process.env.FRONTEND_URL || 'https://web-production-061ff.up.railway.app'}/claim/${newClaim.code}`;
    const qrBuffer = await QRCode.toBuffer(claimUrl, { type: 'png', width: 512, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
    qrData.push({ id: newClaim.id, code: newClaim.code, qr: qrBuffer.toString('base64'), url: claimUrl, amount_lamports: newClaim.amount_lamports, amount_sol: newClaim.amount_lamports / 1000000000 });
  }
  return qrData;
}

async function handleLegacyBulkCreation(supabase, count, amount, durationDays) {
  if (count < 1 || count > 100) throw new Error('Count must be between 1 and 100');
  if (amount < 0 || amount > 10000) throw new Error('Amount must be between 0 and 10000 SOL');
  const claimsToCreate = [];
  for (let i = 0; i < count; i++) {
    const code = Math.random().toString(36).substring(2, 15);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
    claimsToCreate.push({ code, amount_lamports: Math.floor(amount * 1000000000), expires_at: expiresAt.toISOString(), status: 'ACTIVE', created_at: new Date().toISOString() });
  }
  const { data: newClaims, error: createError } = await supabase
    .from('claim_links')
    .insert(claimsToCreate)
    .select();
  if (createError) {
    console.log('❌ Failed to create claims:', createError.message);
    throw new Error(`Failed to create claims: ${createError.message}`);
  }
  return newClaims.map(claim => ({ id: claim.id, code: claim.code, amount_lamports: claim.amount_lamports, amount_sol: claim.amount_lamports / 1000000000, status: claim.status, expires_at: claim.expires_at, created_at: claim.created_at }));
}

/**
 * POST /api/admin/claims/qr
 * Generate QR codes (single, bulk, legacy)
 */
router.post('/qr', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { action, id, count = 1, amount, amount_usd, durationDays = 30 } = req.body;
    let solAmount = amount;
    if (typeof amount_usd === 'number' && amount_usd > 0) {
      try {
        const solPrice = await getLocalSolPrice();
        solAmount = amount_usd / solPrice;
      } catch (err) {
        console.log('❌ Failed to fetch live SOL price:', err);
        return res.status(500).json({ error: 'Failed to fetch live SOL price', details: err.message });
      }
    }
    if (action === 'single' && id) {
      const result = await generateSingleQR(supabase, id);
      res.set({ 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="claim-${result.claim.code}.png"` });
      return res.send(result.qrBuffer);
    }
    if (action === 'bulk') {
      const qrData = await generateBulkQRs(supabase, count, solAmount, durationDays);
      return res.json({ success: true, count: qrData.length, qrs: qrData });
    }
    if (!action && count && solAmount) {
      const newClaims = await handleLegacyBulkCreation(supabase, count, solAmount, durationDays);
      return res.json({ success: true, claims: newClaims });
    }
    return res.status(400).json({ error: 'Invalid request parameters' });
  } catch (error) {
    if (error.status === 401) {
      console.error('❌ Authentication error:', error.message);
      return res.status(401).json({ error: 'Unauthorized', details: error.message });
    }
    console.error('❌ QR generation error:', error);
    return res.status(500).json({ error: 'QR generation failed', details: error.message });
  }
});

/**
 * DELETE /api/admin/claims
 * Delete multiple claims by their IDs
 */
router.delete('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    console.log('🗑️ DELETE route called at /api/admin/claims');
    console.log('🗑️ Request method:', req.method);
    console.log('🗑️ Request body:', req.body);
    const { claimIds } = req.body;
    if (!claimIds || !Array.isArray(claimIds) || claimIds.length === 0) {
      return res.status(400).json({ error: 'Invalid request: claimIds array is required and cannot be empty' });
    }
    if (claimIds.length > 100) {
      return res.status(400).json({ error: 'Cannot delete more than 100 claims at once' });
    }
    console.log(`🎯 Attempting to delete ${claimIds.length} claims:`, claimIds);
    const supabase = getSupabaseAdminClient();
    const { data: deletedClaims, error } = await supabase
      .from('claim_links')
      .delete()
      .in('id', claimIds)
      .select('id, code, amount_usd, amount_lamports');
    if (error) {
      console.error('❌ Database delete error:', error);
      return res.status(500).json({ error: 'Failed to delete claims from database', details: error.message });
    }
    const deletedCount = deletedClaims?.length || 0;
    console.log(`✅ Successfully deleted ${deletedCount} claims`);
    return res.json({ success: true, message: `Successfully deleted ${deletedCount} claim${deletedCount !== 1 ? 's' : ''}`, deletedCount, deletedClaims: deletedClaims || [] });
  } catch (error) {
    if (error.status === 401) {
      console.error('❌ Authentication error:', error.message);
      return res.status(401).json({ error: 'Unauthorized', details: error.message });
    }
    console.error('❌ Unexpected error in delete claims API:', error);
    return res.status(500).json({ error: 'Failed to delete claims', details: error.message });
  }
});

console.log('📡 Claims router with REAL-TIME SOL PRICING initialized');
console.log('📡 DELETE route registered at /api/admin/claims (DELETE /)');

module.exports = router;

