const express = require('express');
const { getSupabaseAdminClient } = require('../../database.js');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.substring(7);
  jwt.verify(token, JWT_SECRET);
}

/**
 * GET /api/admin/ecosystem/spend
 * Get ecosystem spending data for admin dashboard
 */
router.get('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    console.log('🔍 Admin ecosystem/spend: Fetching spending data...');
    const supabase = getSupabaseAdminClient();
    
    // Fetch spending entries from spend_log
    const { data: spendEntries, error: spendError } = await supabase
      .from('spend_log')
      .select('*')
      .order('created_at', { ascending: false });
    if (spendError) {
      console.error('Error fetching spend entries:', spendError);
      throw spendError;
    }

    // Fetch giveaway payouts
    const { data: giveawayPayouts, error: giveawayError } = await supabase
      .from('giveaway_payouts')
      .select('*')
      .order('created_at', { ascending: false });
    if (giveawayError) {
      console.error('Error fetching giveaway payouts:', giveawayError);
      console.log('Continuing without giveaway payouts data');
    }

    // Fetch QR claims
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

    // Process and combine all entries (same as ecosystem.js logic)
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

// Helper function to delete from a specific table
async function deleteFromTable(supabase, tableName, id, selectFields, successMessage) {
  const { data: existingEntry, error: checkError } = await supabase
    .from(tableName)
    .select(selectFields)
    .eq('id', id)
    .single();
  
  if (checkError || !existingEntry) {
    return { success: false, entry: null };
  }

  const { error: deleteError } = await supabase
    .from(tableName)
    .delete()
    .eq('id', id);
  
  if (deleteError) {
    throw deleteError;
  }

  console.log(`✅ Admin ecosystem/spend: ${successMessage}:`, id);
  return { success: true, entry: existingEntry };
}

// Helper function to handle successful deletion response
function createSuccessResponse(message, deletedEntry) {
  return {
    success: true,
    message,
    deleted_entry: deletedEntry
  };
}

// Helper function to group IDs by type
function groupIdsByType(ids, types) {
  const entriesByType = {};
  if (types && Array.isArray(types)) {
    ids.forEach((id, index) => {
      const type = types[index] || 'expense';
      if (!entriesByType[type]) {
        entriesByType[type] = [];
      }
      entriesByType[type].push(id);
    });
  } else {
    entriesByType['expense'] = ids;
  }
  return entriesByType;
}

// Helper function to delete entries from a specific table (bulk)
async function bulkDeleteFromTable(supabase, tableName, ids, selectFields) {
  if (!ids || ids.length === 0) {
    return { deletedEntries: [], count: 0 };
  }

  const { data: entries, error: fetchError } = await supabase
    .from(tableName)
    .select(selectFields)
    .in('id', ids);
  
  if (fetchError || !entries || entries.length === 0) {
    return { deletedEntries: [], count: 0 };
  }

  const { error: deleteError } = await supabase
    .from(tableName)
    .delete()
    .in('id', ids);
  
  if (deleteError) {
    console.error(`Error deleting ${tableName} entries:`, deleteError);
    return { deletedEntries: [], count: 0 };
  }

  console.log(`✅ Deleted ${entries.length} ${tableName} entries`);
  return { deletedEntries: entries, count: entries.length };
}

/**
 * DELETE /api/admin/ecosystem/spend/:id
 * Delete a single spending entry (refactored for reduced complexity)
 */
router.delete('/:id', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Spending entry ID is required'
      });
    }

    const supabase = getSupabaseAdminClient();
    console.log('�️ Admin ecosystem/spend: Deleting spending entry:', id);
    
    // Define table configurations for cleaner code
    const tableConfigs = [
      {
        table: 'spend_log',
        fields: 'id, title, amount_sol',
        message: 'Successfully deleted spending entry',
        responseMessage: 'Spending entry deleted successfully'
      },
      {
        table: 'giveaway_payouts',
        fields: 'id, description, amount_sol',
        message: 'Successfully deleted giveaway payout',
        responseMessage: 'Giveaway payout deleted successfully'
      },
      {
        table: 'claim_links',
        fields: 'id, code, amount_lamports',
        message: 'Successfully deleted claim link',
        responseMessage: 'Claim link deleted successfully'
      }
    ];

    // Try deleting from each table in sequence
    for (const config of tableConfigs) {
      const result = await deleteFromTable(
        supabase, 
        config.table, 
        id, 
        config.fields, 
        config.message
      );
      
      if (result.success) {
        return res.json(createSuccessResponse(config.responseMessage, result.entry));
      }
    }

    return res.status(404).json({
      success: false,
      error: 'Spending entry not found'
    });
  } catch (error) {
    console.error('Admin ecosystem/spend DELETE error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to delete spending entry',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/admin/ecosystem/spend/bulk - Bulk operations (delete multiple entries)
 */
router.post('/bulk', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { action, ids, types } = req.body;
    
    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Action and array of IDs are required'
      });
    }

    if (action !== 'delete') {
      return res.status(400).json({
        success: false,
        error: 'Only "delete" action is supported'
      });
    }

    const supabase = getSupabaseAdminClient();
    console.log('�️ Admin ecosystem/spend/bulk: Deleting entries:', { ids, types });
    
    // Group IDs by type for efficient deletion
    const entriesByType = groupIdsByType(ids, types);
    
    let deletedEntries = [];
    let totalDeleted = 0;

    // Define table configurations for bulk operations
    const bulkTableConfigs = [
      { 
        type: 'expense', 
        table: 'spend_log', 
        fields: 'id, title, amount_sol, description' 
      },
      { 
        type: 'giveaway', 
        table: 'giveaway_payouts', 
        fields: 'id, description, amount_sol, recipient_wallet' 
      },
      { 
        type: 'qr_claim', 
        table: 'claim_links', 
        fields: 'id, code, amount_lamports, claimer_address' 
      }
    ];

    // Process each table type
    for (const config of bulkTableConfigs) {
      const result = await bulkDeleteFromTable(
        supabase,
        config.table,
        entriesByType[config.type],
        config.fields
      );
      
      deletedEntries.push(...result.deletedEntries);
      totalDeleted += result.count;
    }

    if (totalDeleted === 0) {
      return res.status(404).json({
        success: false,
        error: 'No entries found with the provided IDs'
      });
    }

    console.log(`✅ Admin ecosystem/spend/bulk: Successfully deleted ${totalDeleted} entries total`);
    return res.json({
      success: true,
      message: `Successfully deleted ${totalDeleted} entries`,
      deleted_count: totalDeleted,
      deleted_entries: deletedEntries,
      deleted_by_type: {
        expenses: entriesByType['expense']?.length || 0,
        giveaways: entriesByType['giveaway']?.length || 0,
        qr_claims: entriesByType['qr_claim']?.length || 0
      }
    });
  } catch (error) {
    console.error('Admin ecosystem/spend/bulk error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to bulk delete spending entries',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;

