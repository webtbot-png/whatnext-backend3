const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

/**
 * GET /api/giveaway/winners
 * Get ALL giveaway winners from database (Hall of Fame)
 */
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    
    console.log('📊 Fetching ALL giveaway winners from database...');
    
    // Get ALL winners, ordered by most recent first
    const { data: winners, error } = await supabase
      .from('giveaway_winners')
      .select(`
        id,
        giveaway_id,
        wallet_address,
        guessed_market_cap,
        actual_market_cap,
        difference_amount,
        prize_amount,
        is_paid,
        rank_position,
        payment_signature,
        paid_at,
        created_at,
        daily_giveaways!inner (
          date
        )
      `)
      .eq('is_paid', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Error fetching winners:', error);
      throw error;
    }
    
    console.log(`✅ Found ${winners?.length || 0} paid winners in database`);
    
    // Transform to match frontend interface
    const transformedWinners = (winners || []).map(winner => ({
      id: winner.id.toString(),
      wallet_address: winner.wallet_address,
      guessed_market_cap: winner.guessed_market_cap,
      actual_market_cap: winner.actual_market_cap,
      difference_amount: winner.difference_amount,
      prize_amount: winner.prize_amount,
      giveaway_date: winner.daily_giveaways.date,
      transaction_hash: winner.payment_signature,
      paid_at: winner.paid_at,
      rank_position: winner.rank_position
    }));
    
    return res.json(transformedWinners);
  } catch (error) {
    console.error('❌ Error getting giveaway winners:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch winners',
      message: error.message 
    });
  }
});

module.exports = router;

