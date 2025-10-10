const express = require('express');
const { getSupabaseAdminClient  } = require('../../../database.js');
const router = express.Router();

/**
 * GET /api/admin/ecosystem/spend
 * Get ecosystem spending data for admin dashboard - REDIRECTS TO UNIFIED API
 * This ensures both admin panel and public ecosystem page show the same data
 */
router.get('/', async (req, res) => {
  try {
    console.log('🔍 Admin ecosystem/spend: Fetching spending data...');

    // **REDIRECT TO UNIFIED API - ONE SOURCE OF TRUTH**
    // Call the same unified API that public ecosystem page uses
    const response = await fetch('https://whatnext-backend3-production.up.railway.app/api/ecosystem/spend', {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`Unified API returned ${response.status}`);
    }

    const data = await response.json();
    
    console.log(`✅ Admin ecosystem/spend: Retrieved ${data.entries?.length || 0} spending entries`);
    
    // Return the exact same data structure
    return res.json(data);

  } catch (error) {
    console.error('❌ Error calling unified ecosystem API:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch spending data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/admin/ecosystem/spend/bulk
 * Bulk delete spending entries (admin only)
 */
router.delete('/bulk', async (req, res) => {
  try {
    console.log('🗑️ Admin bulk delete ecosystem spending entries...');
    
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: ids array is required and cannot be empty'
      });
    }

    console.log(`🎯 Deleting ${ids.length} spending entries:`, ids);

    const supabase = getSupabaseAdminClient();
    
    // Delete from spend_log table
    const { data: deletedEntries, error: deleteError } = await supabase
      .from('spend_log')
      .delete()
      .in('id', ids)
      .select('id, description, amount_sol');

    if (deleteError) {
      console.error('❌ Database error during bulk delete:', deleteError);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete spending entries',
        details: deleteError.message
      });
    }

    const deletedCount = deletedEntries?.length || 0;
    
    console.log(`✅ Successfully deleted ${deletedCount} spending entries`);
    
    res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} spending entries`,
      deletedCount: deletedCount,
      deletedIds: deletedEntries?.map(entry => entry.id) || []
    });

  } catch (error) {
    console.error('❌ Bulk delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during bulk delete',
      details: error.message
    });
  }
});

/**
 * DELETE /api/admin/ecosystem/spend/:id
 * Delete individual spending entry (admin only)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🗑️ Admin deleting ecosystem spending entry: ${id}`);

    const supabase = getSupabaseAdminClient();
    
    // Delete the spending entry
    const { data: deletedEntry, error: deleteError } = await supabase
      .from('spend_log')
      .delete()
      .eq('id', id)
      .select('id, description, amount_sol')
      .single();

    if (deleteError) {
      if (deleteError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Spending entry not found'
        });
      }
      
      console.error('❌ Database error during delete:', deleteError);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete spending entry',
        details: deleteError.message
      });
    }

    console.log(`✅ Successfully deleted spending entry: ${deletedEntry.description}`);
    
    res.json({
      success: true,
      message: 'Successfully deleted spending entry',
      deletedEntry: deletedEntry
    });

  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during delete',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/ecosystem/spend
 * Create new spending entry (admin only)
 */
router.post('/', async (req, res) => {
  try {
    console.log('➕ Admin creating new ecosystem spending entry...');
    
    const {
      title,
      amount_sol,
      amount_usd,
      description,
      transaction_hash,
      category,
      spent_at
    } = req.body;
    
    // Validate required fields
    if (!title || !amount_sol || !description || !category) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, amount_sol, description, category'
      });
    }

    const supabase = getSupabaseAdminClient();
    
    // Create the spending entry
    const { data: newEntry, error: createError } = await supabase
      .from('spend_log')
      .insert([{
        title: title.trim(),
        amount_sol: parseFloat(amount_sol),
        amount_usd: amount_usd ? parseFloat(amount_usd) : null,
        currency: 'SOL',
        description: description.trim(),
        transaction_hash: transaction_hash?.trim() || null,
        category: category,
        spent_at: spent_at || new Date().toISOString(),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (createError) {
      console.error('❌ Database error during create:', createError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create spending entry',
        details: createError.message
      });
    }

    console.log(`✅ Successfully created spending entry: ${newEntry.title}`);
    
    res.status(201).json({
      success: true,
      message: 'Successfully created spending entry',
      entry: newEntry
    });

  } catch (error) {
    console.error('❌ Create error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during create',
      details: error.message
    });
  }
});

/**
 * PUT /api/admin/ecosystem/spend/:id
 * Update spending entry (admin only)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      amount_sol,
      amount_usd,
      description,
      transaction_hash,
      category,
      spent_at
    } = req.body;
    
    console.log(`✏️ Admin updating ecosystem spending entry: ${id}`);

    const supabase = getSupabaseAdminClient();
    
    // Update the spending entry
    const { data: updatedEntry, error: updateError } = await supabase
      .from('spend_log')
      .update({
        title: title?.trim(),
        amount_sol: amount_sol ? parseFloat(amount_sol) : undefined,
        amount_usd: amount_usd ? parseFloat(amount_usd) : undefined,
        description: description?.trim(),
        transaction_hash: transaction_hash?.trim() || null,
        category: category,
        spent_at: spent_at,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Spending entry not found'
        });
      }
      
      console.error('❌ Database error during update:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update spending entry',
        details: updateError.message
      });
    }

    console.log(`✅ Successfully updated spending entry: ${updatedEntry.title}`);
    
    res.json({
      success: true,
      message: 'Successfully updated spending entry',
      entry: updatedEntry
    });

  } catch (error) {
    console.error('❌ Update error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during update',
      details: error.message
    });
  }
});

module.exports = router;

