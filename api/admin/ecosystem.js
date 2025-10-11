const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.substring(7);
  jwt.verify(token, JWT_SECRET);
}

// GET /api/admin/ecosystem/spend
router.get('/spend', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    console.log('🔍 Admin ecosystem/spend: Fetching spending data...');
    const { data: spendEntries, error: spendError } = await supabase
      .from('spend_log')
      .select('*')
      .order('created_at', { ascending: false });
    if (spendError) {
      console.error('Error fetching spend entries:', spendError);
      throw spendError;
    }
    const { data: giveawayPayouts, error: giveawayError } = await supabase
      .from('giveaway_payouts')
      .select('*')
      .order('created_at', { ascending: false });
    if (giveawayError) {
      console.error('Error fetching giveaway payouts:', giveawayError);
      console.log('Continuing without giveaway payouts data');
    }
    let qrClaims = [];
    try {
      const { data: claimData, error: claimError } = await supabase
        .from('claim_links')
        .select('*')
        .eq('status', 'CLAIMED')
        .order('created_at', { ascending: false });
      if (claimError) {
        console.log('Claims table not found or error:', claimError.message);
      } else {
        qrClaims = claimData || [];
      }
    } catch (error) {
      console.log('Claims table not available:', error);
    }
    const processedSpends = (spendEntries || []).map(spend => ({
      id: spend.id,
      title: spend.title || (spend.description ? spend.description.substring(0, 50) + '...' : ''),
      amount_sol: spend.amount_sol || 0,
      amount_usd: spend.amount_usd || null,
      description: spend.description,
      category: spend.category || 'expense',
      transaction_hash: spend.transaction_hash,
      transaction_verified: spend.transaction_verified || false,
      spent_at: spend.spent_at || spend.created_at,
      created_at: spend.created_at,
      type: 'expense'
    }));
    const processedGiveaways = (giveawayPayouts || []).map(payout => ({
      id: payout.id,
      title: `Giveaway: ${payout.description}`,
      amount_sol: payout.amount_sol || 0,
      amount_usd: payout.amount_usd || null,
      description: payout.description,
      category: 'giveaway',
      transaction_hash: payout.transaction_hash,
      recipient_wallet: payout.recipient_wallet,
      payout_type: payout.payout_type,
      spent_at: payout.paid_at || payout.created_at,
      created_at: payout.created_at,
      type: 'giveaway'
    }));
    const processedClaims = qrClaims.map(claim => ({
      id: claim.id,
      title: `QR Claim: ${claim.code}`,
      amount_sol: (claim.amount_lamports || 0) / 1000000000,
      amount_usd: claim.amount_usd || null,
      description: `QR Code claim: ${claim.code}`,
      category: 'qr_claim',
      transaction_hash: claim.tx_signature,
      claimer_address: claim.claimer_address,
      spent_at: claim.claimed_at || claim.created_at,
      created_at: claim.created_at,
      type: 'qr_claim'
    }));
    const allSpending = [...processedSpends, ...processedGiveaways, ...processedClaims]
      .sort((a, b) => new Date(b.spent_at).getTime() - new Date(a.spent_at).getTime());
    const totalSpent = allSpending.reduce((sum, item) => sum + (item.amount_sol || 0), 0);
    const totalUsdSpent = allSpending.reduce((sum, item) => sum + (item.amount_usd || 0), 0);
    const summary = {
      total_entries: allSpending.length,
      total_sol_spent: totalSpent,
      total_usd_spent: totalUsdSpent,
      categories: {
        expenses: processedSpends.length,
        giveaways: processedGiveaways.length,
        qr_claims: processedClaims.length
      },
      recent_spending: allSpending.slice(0, 10)
    };
    console.log(`✅ Admin ecosystem/spend: Retrieved ${allSpending.length} spending entries`);
    return res.json({
      success: true,
      spending: allSpending,
      summary,
      message: `Found ${allSpending.length} spending entries`
    });
  } catch (error) {
    console.error('Admin ecosystem/spend error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch spending data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/admin/ecosystem/spend
router.post('/spend', async (req, res) => {
  try {
    verifyAdminToken(req);
    const {
      title,
      amount_sol,
      amount_usd,
      description,
      category,
      transaction_hash
    } = req.body;
    if (!amount_sol || !description) {
      return res.status(400).json({
        success: false,
        error: 'Amount (SOL) and description are required'
      });
    }
    const supabase = getSupabaseAdminClient();
    const { data: spendEntry, error } = await supabase
      .from('spend_log')
      .insert({
        title,
        amount_sol: parseFloat(amount_sol),
        amount_usd: amount_usd ? parseFloat(amount_usd) : null,
        description,
        category: category || 'expense',
        transaction_hash,
        spent_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error) throw error;
    console.log('✅ Admin ecosystem/spend: Created new spending entry:', spendEntry.id);
    return res.status(201).json({
      success: true,
      entry: spendEntry
    });
  } catch (error) {
    console.error('Admin ecosystem/spend POST error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to create spending entry'
    });
  }
});

// PUT /api/admin/ecosystem/spend/:id
router.put('/spend/:id', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { id } = req.params;
    const {
      title,
      amount_sol,
      amount_usd,
      description,
      category,
      transaction_hash
    } = req.body;
    
    const supabase = getSupabaseAdminClient();
    const { data: spendEntry, error } = await supabase
      .from('spend_log')
      .update({
        title,
        amount_sol: amount_sol ? parseFloat(amount_sol) : undefined,
        amount_usd: amount_usd ? parseFloat(amount_usd) : null,
        description,
        category,
        transaction_hash,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Admin ecosystem/spend: Updated spending entry:', id);
    return res.json({
      success: true,
      entry: spendEntry
    });
  } catch (error) {
    console.error('Admin ecosystem/spend PUT error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to update spending entry'
    });
  }
});

// DELETE /api/admin/ecosystem/spend/:id
router.delete('/spend/:id', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Spend ID is required'
      });
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('spend_log')
      .delete()
      .eq('id', id);

    if (error) throw error;

    console.log('✅ Admin ecosystem/spend: Deleted spending entry:', id);
    return res.json({
      success: true,
      message: 'Spending entry deleted successfully'
    });
  } catch (error) {
    console.error('Admin ecosystem/spend DELETE error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to delete spending entry'
    });
  }
});

// POST /api/admin/ecosystem/spend/bulk (bulk delete)
router.post('/spend/bulk', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { ids, action } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'IDs array is required'
      });
    }

    if (action !== 'delete') {
      return res.status(400).json({
        success: false,
        error: 'Only delete action is supported'
      });
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('spend_log')
      .delete()
      .in('id', ids);

    if (error) throw error;

    console.log(`✅ Admin ecosystem/spend: Bulk deleted ${ids.length} spending entries`);
    return res.json({
      success: true,
      message: `Successfully deleted ${ids.length} spending entries`
    });
  } catch (error) {
    console.error('Admin ecosystem/spend BULK DELETE error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to bulk delete spending entries'
    });
  }
});

// GET /api/admin/ecosystem/content
router.get('/content', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('ecosystem_content')
      .select(`
        *,
        location:locations(
          id,
          name,
          country,
          latitude,
          longitude
        )
      `)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching ecosystem content:', error);
      return res.status(500).json({ error: 'Failed to fetch ecosystem content' });
    }
    res.json({
      success: true,
      content: data || []
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error in ecosystem content endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/ecosystem/content
router.post('/content', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const {
      title,
      description,
      content_type,
      url,
      thumbnail_url,
      location_id,
      tags,
      is_featured = false
    } = req.body;
    if (!title || !content_type || !url) {
      return res.status(400).json({
        error: 'Title, content type, and URL are required'
      });
    }
    const validTypes = ['video', 'article', 'livestream', 'podcast', 'image', 'other'];
    if (!validTypes.includes(content_type)) {
      return res.status(400).json({
        error: 'Invalid content type. Must be one of: ' + validTypes.join(', ')
      });
    }
    const contentData = {
      title,
      description,
      content_type,
      url,
      thumbnail_url,
      location_id: location_id || null,
      tags: tags || [],
      is_featured,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('ecosystem_content')
      .insert(contentData)
      .select(`
        *,
        location:locations(
          id,
          name,
          country,
          latitude,
          longitude
        )
      `)
      .single();
    if (error) {
      console.error('Error creating ecosystem content:', error);
      return res.status(500).json({ error: 'Failed to create ecosystem content' });
    }
    res.json({
      success: true,
      message: 'Ecosystem content created successfully',
      data
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error creating ecosystem content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/ecosystem/content/:id
router.patch('/content/:id', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { id } = req.params;
    const updateData = { ...req.body };
    if (!id) {
      return res.status(400).json({ error: 'Content ID is required' });
    }
    if (updateData.content_type) {
      const validTypes = ['video', 'article', 'livestream', 'podcast', 'image', 'other'];
      if (!validTypes.includes(updateData.content_type)) {
        return res.status(400).json({
          error: 'Invalid content type. Must be one of: ' + validTypes.join(', ')
        });
      }
    }
    updateData.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('ecosystem_content')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        location:locations(
          id,
          name,
          country,
          latitude,
          longitude
        )
      `)
      .single();
    if (error) {
      console.error('Error updating ecosystem content:', error);
      return res.status(500).json({ error: 'Failed to update ecosystem content' });
    }
    if (!data) {
      return res.status(404).json({ error: 'Content not found' });
    }
    res.json({
      success: true,
      message: 'Ecosystem content updated successfully',
      data
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error updating ecosystem content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/ecosystem/content/:id
router.delete('/content/:id', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Content ID is required' });
    }
    const { error } = await supabase
      .from('ecosystem_content')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Error deleting ecosystem content:', error);
      return res.status(500).json({ error: 'Failed to delete ecosystem content' });
    }
    res.json({
      success: true,
      message: 'Ecosystem content deleted successfully'
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error deleting ecosystem content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/ecosystem/locations
router.get('/locations', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('locations')
      .select('id, name, country, latitude, longitude')
      .order('name');
    if (error) {
      console.error('Error fetching locations:', error);
      return res.status(500).json({ error: 'Failed to fetch locations' });
    }
    res.json({
      success: true,
      locations: data || []
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error in locations endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

