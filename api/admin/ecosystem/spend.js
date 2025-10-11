const express = require('express');
const { getSupabaseAdminClient } = require('../../../database.js');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'whatnext-jwt-secret-2025';

// Health check endpoint for spend router
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Ecosystem spend router is operational',
    timestamp: new Date().toISOString(),
    endpoints: {
      'GET /': 'List all spending entries',
      'POST /': 'Create new spending entry', 
      'DELETE /:id': 'Delete single spending entry',
      'DELETE /bulk': 'Bulk delete spending entries',
      'POST /bulk': 'Bulk operations (legacy support)',
      'GET /bulk': 'Bulk operations info'
    }
  });
});

// Test endpoint for DELETE method routing
router.get('/test-delete/:id', (req, res) => {
  res.json({
    success: true,
    message: 'DELETE route handler is accessible',
    received_id: req.params.id,
    method: req.method,
    note: 'This confirms the DELETE /:id route is properly registered'
  });
});

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.substring(7);
  jwt.verify(token, JWT_SECRET);
}

// Helper functions to reduce cognitive complexity

async function fetchSpendEntries(supabase) {
  const { data: spendEntries, error: spendError } = await supabase
    .from('spend_log')
    .select('*')
    .order('created_at', { ascending: false });
  if (spendError) {
    console.error('Error fetching spend entries:', spendError);
    throw spendError;
  }
  return spendEntries || [];
}

async function fetchGiveawayPayouts(supabase) {
  const { data: giveawayPayouts, error: giveawayError } = await supabase
    .from('giveaway_payouts')
    .select('*')
    .order('created_at', { ascending: false });
  if (giveawayError) {
    console.error('Error fetching giveaway payouts:', giveawayError);
    console.log('Continuing without giveaway payouts data');
    return [];
  }
  return giveawayPayouts || [];
}

async function fetchQrClaims(supabase) {
  try {
    const { data: claimData, error: claimError } = await supabase
      .from('claim_links')
      .select('*')
      .eq('status', 'CLAIMED')
      .order('created_at', { ascending: false });
    if (claimError) {
      console.log('Claims table not found or error:', claimError.message);
      return [];
    }
    return claimData || [];
  } catch (error) {
    console.log('Claims table not available:', error);
    return [];
  }
}

function processSpendEntries(spendEntries) {
  return spendEntries.map(spend => ({
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
}

function processGiveawayEntries(giveawayPayouts) {
  return giveawayPayouts.map(payout => ({
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
}

function processClaimEntries(qrClaims) {
  return qrClaims.map(claim => ({
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
}

function createSpendingSummary(processedSpends, processedGiveaways, processedClaims, allSpending) {
  const totalSpent = allSpending.reduce((sum, item) => sum + (item.amount_sol || 0), 0);
  const totalUsdSpent = allSpending.reduce((sum, item) => sum + (item.amount_usd || 0), 0);

  return {
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
    
    // Fetch all data in parallel
    const [spendEntries, giveawayPayouts, qrClaims] = await Promise.all([
      fetchSpendEntries(supabase),
      fetchGiveawayPayouts(supabase),
      fetchQrClaims(supabase)
    ]);

    // Process entries
    const processedSpends = processSpendEntries(spendEntries);
    const processedGiveaways = processGiveawayEntries(giveawayPayouts);
    const processedClaims = processClaimEntries(qrClaims);

    // Combine and sort all entries
    const allSpending = [...processedSpends, ...processedGiveaways, ...processedClaims]
      .sort((a, b) => new Date(b.spent_at).getTime() - new Date(a.spent_at).getTime());

    // Create summary
    const summary = createSpendingSummary(processedSpends, processedGiveaways, processedClaims, allSpending);

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
    console.log('🗑️ Admin ecosystem/spend DELETE: Attempting to delete entry:', id);
    
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
    console.error('❌ Admin ecosystem/spend DELETE error:', error);
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('invalid signature') || error.message.includes('jwt'))) {
      return res.status(401).json({ 
        success: false,
        error: 'Unauthorized - Please log in again',
        message: 'JWT token is invalid or expired'
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to delete spending entry',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/admin/ecosystem/spend
 * Add a new spending entry
 */
router.post('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { title, description, amount_sol, amount_usd, category, transaction_hash } = req.body;
    
    if (!title && !description) {
      return res.status(400).json({
        success: false,
        error: 'Title or description is required'
      });
    }
    
    if (!amount_sol || amount_sol <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid SOL amount is required'
      });
    }

    const supabase = getSupabaseAdminClient();
    console.log('➕ Admin ecosystem/spend: Adding new spending entry');
    
    const newEntry = {
      title: title || description?.substring(0, 50),
      description: description || title,
      amount_sol: parseFloat(amount_sol),
      amount_usd: amount_usd ? parseFloat(amount_usd) : null,
      category: category || 'expense',
      transaction_hash: transaction_hash || null,
      transaction_verified: false,
      spent_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    const { data: createdEntry, error } = await supabase
      .from('spend_log')
      .insert([newEntry])
      .select()
      .single();

    if (error) {
      console.error('Error creating spending entry:', error);
      throw error;
    }

    console.log('✅ Admin ecosystem/spend: Successfully created spending entry:', createdEntry.id);
    return res.json({
      success: true,
      message: 'Spending entry created successfully',
      entry: createdEntry
    });
    
  } catch (error) {
    console.error('Admin ecosystem/spend POST error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to create spending entry',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/admin/ecosystem/spend/bulk
 * Get bulk operations info (for frontend compatibility)
 */
router.get('/bulk', async (req, res) => {
  try {
    verifyAdminToken(req);
    console.log('ℹ️ Admin ecosystem/spend/bulk GET: Returning bulk operations info');
    
    res.json({
      success: true,
      message: 'Bulk operations endpoint is operational',
      info: 'Use POST method with action and ids to perform bulk operations',
      supported_actions: ['delete'],
      example: {
        method: 'POST',
        body: {
          action: 'delete',
          ids: ['id1', 'id2', 'id3'],
          types: ['expense', 'giveaway', 'qr_claim']
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Helper functions for bulk operations

function validateBulkRequest(action, ids) {
  if (!action || !Array.isArray(ids) || ids.length === 0) {
    return { valid: false, error: 'Action and array of IDs are required' };
  }
  if (action !== 'delete') {
    return { valid: false, error: 'Only "delete" action is supported' };
  }
  return { valid: true };
}

function getTableConfigurations() {
  return [
    { table: 'spend_log', fields: 'id, title, amount_sol, description' },
    { table: 'giveaway_payouts', fields: 'id, description, amount_sol, recipient_wallet' },
    { table: 'claim_links', fields: 'id, code, amount_lamports, claimer_address' }
  ];
}

async function attemptDeleteFromTables(supabase, id, tableConfigs, deletedByType) {
  for (const config of tableConfigs) {
    try {
      const result = await deleteFromTable(
        supabase, 
        config.table, 
        id, 
        config.fields, 
        `Bulk deleted from ${config.table}`
      );
      
      if (result.success) {
        deletedByType[config.table]++;
        console.log(`✅ Deleted ID ${id} from ${config.table}`);
        return { success: true, entry: result.entry };
      }
    } catch (error) {
      console.log(`❌ Failed to delete ID ${id} from ${config.table}:`, error.message);
    }
  }
  return { success: false, entry: null };
}

function createBulkDeleteResponse(totalDeleted, deletedEntries, deletedByType) {
  return {
    success: true,
    message: `Successfully deleted ${totalDeleted} entries`,
    deleted_count: totalDeleted,
    deleted_entries: deletedEntries,
    deleted_by_type: {
      expenses: deletedByType.spend_log,
      giveaways: deletedByType.giveaway_payouts,
      qr_claims: deletedByType.claim_links
    }
  };
}

/**
 * DELETE /api/admin/ecosystem/spend/bulk - Bulk delete operations (supports DELETE method)
 */
router.delete('/bulk', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { ids } = req.body;
    
    // Validate request
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Array of IDs is required for bulk delete'
      });
    }

    const supabase = getSupabaseAdminClient();
    console.log('🗑️ Admin ecosystem/spend/bulk DELETE: Deleting entries:', { ids });
    
    const deletedEntries = [];
    let totalDeleted = 0;
    const deletedByType = {
      spend_log: 0,
      giveaway_payouts: 0,
      claim_links: 0
    };

    const tableConfigs = getTableConfigurations();
    
    // Process each ID
    for (const id of ids) {
      const deleteResult = await attemptDeleteFromTables(supabase, id, tableConfigs, deletedByType);
      
      if (deleteResult.success) {
        deletedEntries.push(deleteResult.entry);
        totalDeleted++;
      } else {
        console.log(`⚠️ ID ${id} not found in any table`);
      }
    }

    if (totalDeleted === 0) {
      return res.status(404).json({
        success: false,
        error: 'No entries found with the provided IDs'
      });
    }

    console.log(`✅ Admin ecosystem/spend/bulk DELETE: Successfully deleted ${totalDeleted} entries total`);
    console.log('Deletion summary:', deletedByType);
    
    return res.json(createBulkDeleteResponse(totalDeleted, deletedEntries, deletedByType));
    
  } catch (error) {
    console.error('Admin ecosystem/spend/bulk DELETE error:', error);
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

/**
 * POST /api/admin/ecosystem/spend/bulk - Bulk operations (backward compatibility)
 */
router.post('/bulk', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { action, ids } = req.body;
    
    // Validate request
    const validation = validateBulkRequest(action, ids);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const supabase = getSupabaseAdminClient();
    console.log('🗑️ Admin ecosystem/spend/bulk POST: Deleting entries:', { ids });
    
    const deletedEntries = [];
    let totalDeleted = 0;
    const deletedByType = {
      spend_log: 0,
      giveaway_payouts: 0,
      claim_links: 0
    };

    const tableConfigs = getTableConfigurations();
    
    // Process each ID
    for (const id of ids) {
      const deleteResult = await attemptDeleteFromTables(supabase, id, tableConfigs, deletedByType);
      
      if (deleteResult.success) {
        deletedEntries.push(deleteResult.entry);
        totalDeleted++;
      } else {
        console.log(`⚠️ ID ${id} not found in any table`);
      }
    }

    if (totalDeleted === 0) {
      return res.status(404).json({
        success: false,
        error: 'No entries found with the provided IDs'
      });
    }

    console.log(`✅ Admin ecosystem/spend/bulk POST: Successfully deleted ${totalDeleted} entries total`);
    console.log('Deletion summary:', deletedByType);
    
    return res.json(createBulkDeleteResponse(totalDeleted, deletedEntries, deletedByType));
    
  } catch (error) {
    console.error('Admin ecosystem/spend/bulk POST error:', error);
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

