const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

/**
 * GET /api/ecosystem/fees
 * Get ecosystem fees data
 */
router.get('/', async (req, res) => {
  try {
    console.log('GET /api/ecosystem/fees: Starting request...');
    const supabase = getSupabaseAdminClient();
    // Try to query ecosystem fees from database, with fallback
    let fees = [];
    let error = null;
    try {
      const result = await supabase
        .from('ecosystem_fees')
        .select('*')
        .order('created_at', { ascending: false });
      fees = result.data || [];
      error = result.error;
    } catch (dbError) {
      console.error('GET /api/ecosystem/fees: ecosystem_fees table error:', dbError);
      // Table doesn't exist or other DB error, return empty data
      fees = [];
      error = null;
    }
    if (error) {
      console.error('GET /api/ecosystem/fees: Database error:', error);
      // Return empty data instead of error for missing table
      fees = [];
    }
    console.log('GET /api/ecosystem/fees: Found', fees?.length || 0, 'fee records');
    // Calculate totals
    const totalFees = fees?.reduce((sum, fee) => sum + (fee.amount || 0), 0) || 0;
    const averageFee = fees?.length ? totalFees / fees.length : 0;
    return res.json({
      success: true,
      fees: fees || [],
      statistics: {
        total: totalFees,
        average: averageFee,
        count: fees?.length || 0
      },
      lastUpdated: new Date().toISOString(),
      message: fees.length === 0 ? 'No fees data available' : undefined
    });
  } catch (error) {
    console.error('Ecosystem fees API error:', error);
    return res.json({
      success: true,
      fees: [],
      statistics: {
        total: 0,
        average: 0,
        count: 0
      },
      message: 'Fees system not configured'
    });
  }
});

module.exports = router;

