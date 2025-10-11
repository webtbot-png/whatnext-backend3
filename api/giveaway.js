const express = require('express');
const router = express.Router();
const { getSupabaseAdminClient } = require('../database.js');

// Constants
const GIVEAWAY_TIME_UTC = 17; // 5 PM UTC
const CUTOFF_START_UTC = 15; // 3 PM UTC
const DISPLAY_WINDOW_END_UTC = 17 + (10/60); // 5:10 PM UTC

/**
 * GET /api/giveaway - Get today's giveaway, entries, and latest winner
 */
router.get('/', async (req, res) => {
  const supabase = getSupabaseAdminClient();

  try {
    // Get today's date in UTC (YYYY-MM-DD format)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Check if we're in the cutoff period (3PM-5:10PM UTC)
    const utcHours = today.getUTCHours();
    const utcMinutes = today.getUTCMinutes();
    const currentTime = utcHours + (utcMinutes / 60);
    const isInCutoffPeriod = currentTime >= CUTOFF_START_UTC && currentTime <= DISPLAY_WINDOW_END_UTC;

    // 1. Get or create today's giveaway
    let { data: giveaway, error: giveawayError } = await supabase
      .from('daily_giveaways')
      .select('*')
      .eq('target_time', todayStr)
      .single();

    if (giveawayError && giveawayError.code !== 'PGRST116') {
      throw giveawayError;
    }

    // Create giveaway if it doesn't exist
    if (!giveaway) {
      const { data: newGiveaway, error: createError } = await supabase
        .from('daily_giveaways')
        .insert({
          target_time: todayStr,
          prize_amount: 0.3,
          is_completed: false
        })
        .select()
        .single();

      if (createError) throw createError;
      giveaway = newGiveaway;
      console.log('✅ Created new giveaway for', todayStr);
    }

    // 2. Get entries for today's giveaway
    const { data: entries, error: entriesError } = await supabase
      .from('giveaway_entries')
      .select('*')
      .eq('giveaway_id', giveaway.id)
      .order('created_at', { ascending: false });

    if (entriesError) throw entriesError;

    // 3. Get latest winner (most recent completed giveaway with winner)
    const { data: latestWinner, error: winnerError } = await supabase
      .from('giveaway_winners')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Ignore error if no winner found
    if (winnerError && winnerError.code !== 'PGRST116') {
      console.error('❌ Error fetching latest winner:', winnerError);
    }

    // 4. Determine if user can submit
    const canSubmit = !isInCutoffPeriod && !giveaway.is_completed;

    res.status(200).json({
      giveaway,
      entries: entries || [],
      canSubmit,
      isDisplayWindow: isInCutoffPeriod,
      latestWinner: latestWinner || null
    });

  } catch (error) {
    console.error('❌ Error in GET /api/giveaway:', error);
    res.status(500).json({
      error: 'Failed to fetch giveaway data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/giveaway - Submit a giveaway entry
 */
router.post('/', async (req, res) => {
  const supabase = getSupabaseAdminClient();

  const { walletAddress, guessedMarketCap } = req.body;

  // Validation
  if (!walletAddress || typeof walletAddress !== 'string') {
    return res.status(400).json({ error: 'Valid wallet address is required' });
  }

  if (!guessedMarketCap || typeof guessedMarketCap !== 'number' || guessedMarketCap <= 0) {
    return res.status(400).json({ error: 'Valid market cap guess is required' });
  }

  try {
    // Get today's date
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Check if we're in cutoff period
    const utcHours = today.getUTCHours();
    const utcMinutes = today.getUTCMinutes();
    const currentTime = utcHours + (utcMinutes / 60);
    const isInCutoffPeriod = currentTime >= CUTOFF_START_UTC && currentTime <= DISPLAY_WINDOW_END_UTC;

    if (isInCutoffPeriod) {
      return res.status(403).json({ 
        error: 'Submissions are closed during calculation period (3:00 PM - 5:10 PM UTC)' 
      });
    }

    // Get today's giveaway
    const { data: giveaway, error: giveawayError } = await supabase
      .from('daily_giveaways')
      .select('*')
      .eq('target_time', todayStr)
      .single();

    if (giveawayError) {
      if (giveawayError.code === 'PGRST116') {
        return res.status(404).json({ error: 'No active giveaway found' });
      }
      throw giveawayError;
    }

    if (giveaway.is_completed) {
      return res.status(403).json({ error: 'This giveaway has already been completed' });
    }

    // Check for duplicate entry (one entry per wallet per giveaway)
    const { data: existingEntry, error: checkError } = await supabase
      .from('giveaway_entries')
      .select('id')
      .eq('giveaway_id', giveaway.id)
      .eq('wallet_address', walletAddress)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existingEntry) {
      return res.status(409).json({ error: 'You have already submitted an entry for today' });
    }

    // Create entry
    const { data: entry, error: insertError } = await supabase
      .from('giveaway_entries')
      .insert({
        giveaway_id: giveaway.id,
        wallet_address: walletAddress,
        guessed_market_cap: guessedMarketCap
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log('✅ Giveaway entry created:', entry.id);
    res.status(201).json({
      success: true,
      entry
    });

  } catch (error) {
    console.error('❌ Error in POST /api/giveaway:', error);
    res.status(500).json({
      error: 'Failed to submit giveaway entry',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;

