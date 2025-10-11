const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'whatnext-jwt-secret-2025';

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.substring(7);
  jwt.verify(token, JWT_SECRET);
}

// GET - Dashboard statistics and overview
router.get('/', async (req, res) => {
  try {
    verifyAdminToken(req);

    const supabase = getSupabaseAdminClient();

    // Get basic statistics from database
    const [
      contentStats,
      locationStats,
      scheduleStats,
      spendingStats,
      giveawayStats
    ] = await Promise.all([
      // Content statistics
      supabase
        .from('content_entries')
        .select('content_type, status')
        .then(({ data }) => {
          const stats = {
            total: data?.length || 0,
            published: data?.filter(c => c.status === 'published').length || 0,
            draft: data?.filter(c => c.status === 'draft').length || 0,
            upcoming: data?.filter(c => c.status === 'upcoming').length || 0,
            past: data?.filter(c => c.status === 'past').length || 0,
            byType: data?.reduce((acc, item) => {
              acc[item.content_type] = (acc[item.content_type] || 0) + 1;
              return acc;
            }, {}) || {}
          };
          return stats;
        }),

      // Location statistics
      supabase
        .from('locations')
        .select('status')
        .then(({ data }) => ({
          total: data?.length || 0,
          active: data?.filter(l => l.status === 'active').length || 0,
          inactive: data?.filter(l => l.status === 'inactive').length || 0
        })),

      // Schedule statistics
      supabase
        .from('schedules')
        .select('status')
        .then(({ data }) => ({
          total: data?.length || 0,
          upcoming: data?.filter(s => s.status === 'upcoming').length || 0,
          past: data?.filter(s => s.status === 'past').length || 0
        })),

      // Spending statistics
      supabase
        .from('spend_log')
        .select('amount_sol, amount_usd, type')
        .then(({ data }) => {
          const totalSol = data?.reduce((sum, entry) => sum + (entry.amount_sol || 0), 0) || 0;
          const totalUsd = data?.reduce((sum, entry) => sum + (entry.amount_usd || 0), 0) || 0;
          return {
            total: data?.length || 0,
            totalSol: parseFloat(totalSol.toFixed(2)),
            totalUsd: parseFloat(totalUsd.toFixed(2)),
            expenses: data?.filter(s => s.type === 'expense').length || 0,
            revenue: data?.filter(s => s.type === 'revenue').length || 0
          };
        }),

      // Giveaway statistics
      supabase
        .from('giveaway_payouts')
        .select('amount_sol, amount_usd, status')
        .then(({ data }) => {
          const totalSol = data?.reduce((sum, entry) => sum + (entry.amount_sol || 0), 0) || 0;
          const totalUsd = data?.reduce((sum, entry) => sum + (entry.amount_usd || 0), 0) || 0;
          return {
            total: data?.length || 0,
            totalSol: parseFloat(totalSol.toFixed(2)),
            totalUsd: parseFloat(totalUsd.toFixed(2)),
            pending: data?.filter(g => g.status === 'pending').length || 0,
            completed: data?.filter(g => g.status === 'completed').length || 0
          };
        })
    ]);

    // Calculate totals across ecosystem
    const ecosystemTotals = {
      totalSpentSol: (spendingStats.totalSol || 0) + (giveawayStats.totalSol || 0),
      totalSpentUsd: (spendingStats.totalUsd || 0) + (giveawayStats.totalUsd || 0),
      expensesSol: spendingStats.totalSol || 0,
      expensesUsd: spendingStats.totalUsd || 0,
      giveawaysSol: giveawayStats.totalSol || 0,
      giveawaysUsd: giveawayStats.totalUsd || 0
    };

    res.json({
      success: true,
      dashboard: {
        overview: {
          content: contentStats,
          locations: locationStats,
          schedules: scheduleStats,
          spending: spendingStats,
          giveaways: giveawayStats,
          ecosystem: ecosystemTotals
        },
        recent: {
          content: [],
          schedules: []
        },
        summary: {
          totalContent: contentStats.total,
          totalLocations: locationStats.total,
          totalSpending: ecosystemTotals.totalSpentSol,
          nextEvent: null
        }
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('invalid signature') || error.message.includes('jwt'))) {
      return res.status(401).json({ 
        success: false,
        error: 'Unauthorized - Please log in again',
        message: 'JWT token is invalid or expired'
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to load dashboard'
    });
  }
});

module.exports = router;

