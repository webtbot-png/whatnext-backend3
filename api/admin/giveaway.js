const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'whatnext-jwt-secret-2025';

async function verifyAdminToken(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new Error('No token provided');
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw new Error('Invalid token');
  }
}

/**
 * Validate giveaway request body
 */
function validateGiveawayRequest(body) {
  const { giveawayId, actualMarketCap } = body;
  
  if (!giveawayId || !actualMarketCap) {
    throw new Error('Giveaway ID and actual market cap are required');
  }
  
  const marketCapNum = parseFloat(actualMarketCap);
  if (isNaN(marketCapNum) || marketCapNum <= 0) {
    throw new Error('Market cap must be a positive number');
  }
  
  return { giveawayId, marketCapNum, contractAddress: body.contractAddress || 'pump.fun' };
}

/**
 * Update giveaway with market cap snapshot
 */
async function updateGiveawaySnapshot(supabase, giveawayId, marketCapNum) {
  const { data: giveaway, error: updateError } = await supabase
    .from('daily_giveaways')
    .update({ 
      actual_market_cap: marketCapNum, 
      snapshot_time: new Date().toISOString()
    })
    .eq('id', giveawayId)
    .select()
    .single();
  
  if (updateError) throw updateError;
  return giveaway;
}

/**
 * Get giveaway entries for specific contract
 */
async function getGiveawayEntries(supabase, giveawayId, contractAddress) {
  const { data: entries, error: entriesError } = await supabase
    .from('giveaway_entries')
    .select('*')
    .eq('giveaway_id', giveawayId)
    .eq('contract_address', contractAddress);
  
  if (entriesError) throw entriesError;
  return entries || [];
}

/**
 * Calculate winners using database RPC
 */
async function calculateWinnersForContract(supabase, giveawayId, contractAddress) {
  const { error: calculateError } = await supabase
    .rpc('calculate_giveaway_winners_by_contract', {
      giveaway_id_param: giveawayId,
      contract_addr: contractAddress
    });
  
  if (calculateError) throw calculateError;
}

/**
 * Get winners for specific contract
 */
async function getWinnersForContract(supabase, giveawayId, contractAddress) {
  const { data: winners, error: winnersError } = await supabase
    .from('giveaway_winners')
    .select('*,giveaway_entries!inner(contract_address)')
    .eq('giveaway_id', giveawayId)
    .eq('giveaway_entries.contract_address', contractAddress);
  
  if (winnersError) throw winnersError;
  return winners || [];
}

/**
 * Mark pump.fun giveaway as completed
 */
async function markPumpFunCompleted(supabase, giveawayId, contractAddress) {
  if (contractAddress === 'pump.fun') {
    await supabase
      .from('daily_giveaways')
      .update({ is_completed: true })
      .eq('id', giveawayId);
  }
}

/**
 * Get contract statistics for all entries
 */
async function getContractStatistics(supabase, giveawayId) {
  const { data: allEntries, error: allEntriesError } = await supabase
    .from('giveaway_entries')
    .select('contract_address')
    .eq('giveaway_id', giveawayId);
  
  if (allEntriesError) throw allEntriesError;
  
  const contractStats = (allEntries || []).reduce((acc, entry) => {
    const contract = entry.contract_address || 'pump.fun';
    acc[contract] = (acc[contract] || 0) + 1;
    return acc;
  }, {});
  
  return { allEntries: allEntries || [], contractStats };
}

/**
 * Build giveaway success response
 */
function buildGiveawayResponse(giveaway, winners, contractAddress, entries, allEntries, contractStats) {
  return {
    success: true,
    message: `Giveaway completed for contract ${contractAddress}! ${winners.length} winner(s) found.`,
    giveaway,
    winners,
    contractAddress,
    entriesForContract: entries.length,
    totalEntries: allEntries.length,
    contractStats,
    prizePerWinner: winners.length > 0 ? 0.3 / winners.length : 0
  };
}

/**
 * Handle route errors
 */
function handleGiveawayError(error, res) {
  if (error instanceof Error) {
    if (error.message.includes('token')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (error.message.includes('required') || error.message.includes('must be')) {
      return res.status(400).json({ error: error.message });
    }
  }
  
  console.error('Error processing giveaway:', error);
  return res.status(500).json({ error: 'Failed to process giveaway' });
}

/**
 * Validate prize pool update request
 */
function validatePrizePoolRequest(body) {
  const { updateType, todayPrizePool } = body;
  
  if (!updateType || !['default', 'today', 'both'].includes(updateType)) {
    throw new Error('Invalid updateType. Must be: default, today, or both');
  }
  
  if (updateType === 'today' || updateType === 'both') {
    const prizeAmount = parseFloat(todayPrizePool);
    
    if (isNaN(prizeAmount) || prizeAmount <= 0) {
      throw new Error('Today\'s prize pool must be a positive number');
    }
    
    return prizeAmount;
  }
  
  return null;
}

/**
 * Get or create today's giveaway
 */
async function getOrCreateTodayGiveaway(supabase, today) {
  const { data: existingGiveaway, error: checkError } = await supabase
    .from('daily_giveaways')
    .select('id, is_completed')
    .eq('date', today)
    .single();
  
  if (checkError && checkError.code !== 'PGRST116') {
    throw checkError;
  }
  
  return existingGiveaway;
}

/**
 * Create new giveaway with prize pool
 */
async function createGiveawayWithPrize(supabase, today, prizeAmount) {
  console.log('📝 Creating today\'s giveaway with prize pool...');
  
  const { data: newGiveaway, error: createError } = await supabase
    .from('daily_giveaways')
    .insert({
      date: today,
      prize_pool_sol: prizeAmount,
      is_active: true,
      is_completed: false
    })
    .select()
    .single();
  
  if (createError) throw createError;
  
  console.log('✅ Created today\'s giveaway with prize pool:', newGiveaway.prize_pool_sol);
  return newGiveaway;
}

/**
 * Update existing giveaway prize pool
 */
async function updateGiveawayPrize(supabase, today, prizeAmount, existingGiveaway) {
  const { data: updatedGiveaway, error: updateError } = await supabase
    .from('daily_giveaways')
    .update({ prize_pool_sol: prizeAmount })
    .eq('date', today)
    .select()
    .single();
  
  if (updateError) throw updateError;
  
  console.log('✅ Updated today\'s prize pool:', updatedGiveaway.prize_pool_sol);
  
  if (existingGiveaway.is_completed) {
    console.log('ℹ️ Note: Giveaway was completed, but prize pool updated anyway (admin override)');
  }
  
  return updatedGiveaway;
}

/**
 * Update today's prize pool (create or update)
 */
async function updateTodayPrizePool(supabase, today, prizeAmount) {
  console.log(`📝 Updating today's prize pool to ${prizeAmount} SOL...`);
  
  const existingGiveaway = await getOrCreateTodayGiveaway(supabase, today);
  
  if (!existingGiveaway) {
    return await createGiveawayWithPrize(supabase, today, prizeAmount);
  }
  
  return await updateGiveawayPrize(supabase, today, prizeAmount, existingGiveaway);
}

/**
 * Get final prize pool settings
 */
async function getFinalPrizePoolSettings(supabase, today, defaultPrizePool) {
  const { data: finalGiveaway, error: finalError } = await supabase
    .from('daily_giveaways')
    .select('prize_pool_sol, is_completed')
    .eq('date', today)
    .single();
  
  if (finalError && finalError.code !== 'PGRST116') {
    throw finalError;
  }
  
  const finalPrizePool = finalGiveaway?.prize_pool_sol || parseFloat(defaultPrizePool);
  
  return {
    defaultPrizePool: parseFloat(defaultPrizePool),
    todayPrizePool: finalPrizePool,
    hasCustomToday: finalGiveaway && finalGiveaway.prize_pool_sol !== parseFloat(defaultPrizePool),
    isCompleted: finalGiveaway?.is_completed || false
  };
}

/**
 * Handle prize pool route errors
 */
function handlePrizePoolError(error, res) {
  if (error instanceof Error) {
    if (error.message.includes('token')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (error.message.includes('Invalid updateType') || error.message.includes('must be a positive number')) {
      return res.status(400).json({ error: error.message });
    }
  }
  
  console.error('❌ Error in prize pool POST:', error);
  return res.status(500).json({ 
    error: 'Failed to update prize pool',
    details: error instanceof Error ? error.message : 'Unknown error'
  });
}

// POST /api/admin/giveaway
router.post('/', async (req, res) => {
  try {
    await verifyAdminToken(req);
    
    // Validate request
    const { giveawayId, marketCapNum, contractAddress } = validateGiveawayRequest(req.body);
    
    const supabase = getSupabaseAdminClient();
    
    // Update giveaway with market cap
    const giveaway = await updateGiveawaySnapshot(supabase, giveawayId, marketCapNum);
    
    // Get entries for this contract
    const entries = await getGiveawayEntries(supabase, giveawayId, contractAddress);
    
    if (entries.length === 0) {
      return res.json({ 
        success: true, 
        message: `No entries to process for contract ${contractAddress}`, 
        giveaway, 
        contractAddress 
      });
    }
    
    // Calculate winners
    await calculateWinnersForContract(supabase, giveawayId, contractAddress);
    
    // Get winners
    const winners = await getWinnersForContract(supabase, giveawayId, contractAddress);
    
    // Mark as completed if pump.fun
    await markPumpFunCompleted(supabase, giveawayId, contractAddress);
    
    // Get statistics
    const { allEntries, contractStats } = await getContractStatistics(supabase, giveawayId);
    
    // Return success response
    return res.json(buildGiveawayResponse(giveaway, winners, contractAddress, entries, allEntries, contractStats));
    
  } catch (error) {
    return handleGiveawayError(error, res);
  }
});

// POST /api/admin/giveaway/cleanup
router.post('/cleanup', async (req, res) => {
  try {
    await verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { error: cleanupError } = await supabase.rpc('cleanup_old_giveaway_data');
    if (cleanupError) throw cleanupError;
    const { data: cleanupStats, error: statsError } = await supabase
      .from('giveaway_cleanup_log')
      .select('*')
      .order('cleaned_at', { ascending: false })
      .limit(1);
    if (statsError) throw statsError;
    return res.json({ success: true, message: 'Database cleanup completed successfully', lastCleanup: cleanupStats?.[0] || null });
  } catch (error) {
    if (error instanceof Error && error.message.includes('token')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error during cleanup:', error);
    return res.status(500).json({ error: 'Failed to cleanup database' });
  }
});

// GET /api/admin/giveaway
router.get('/', async (req, res) => {
  try {
    await verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    
    console.log('📊 Admin: Fetching today\'s giveaway data...');
    
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's giveaway with counts
    const { data: todayGiveaway, error: todayError } = await supabase
      .from('daily_giveaways')
      .select(`
        *,
        giveaway_entries:giveaway_entries(count),
        giveaway_winners:giveaway_winners(count)
      `)
      .eq('date', today)
      .single();
    
    if (todayError && todayError.code !== 'PGRST116') {
      console.error('❌ Error fetching today\'s giveaway:', todayError);
      throw todayError;
    }
    
    // If no giveaway exists, create one
    if (!todayGiveaway || todayError) {
      console.log('📝 Creating new giveaway for today...');
      const { data: newGiveaway, error: createError } = await supabase
        .from('daily_giveaways')
        .insert({
          date: today,
          prize_pool_sol: 0.3,
          is_active: true,
          is_completed: false
        })
        .select(`
          *,
          giveaway_entries:giveaway_entries(count),
          giveaway_winners:giveaway_winners(count)
        `)
        .single();
      
      if (createError) {
        console.error('❌ Failed to create giveaway:', createError);
        throw createError;
      }
      
      console.log('✅ Created new giveaway:', newGiveaway.id);
      
      return res.json({
        success: true,
        giveaways: [newGiveaway],
        todayGiveaway: newGiveaway
      });
    }
    
    console.log('✅ Found today\'s giveaway:', {
      id: todayGiveaway.id,
      date: todayGiveaway.date,
      prize_pool_sol: todayGiveaway.prize_pool_sol,
      is_active: todayGiveaway.is_active,
      is_completed: todayGiveaway.is_completed,
      entries: todayGiveaway.giveaway_entries?.[0]?.count || 0,
      winners: todayGiveaway.giveaway_winners?.[0]?.count || 0
    });
    
    return res.json({
      success: true,
      giveaways: [todayGiveaway],
      todayGiveaway: todayGiveaway
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('token')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('❌ Error fetching giveaways:', error);
    return res.status(500).json({ error: 'Failed to fetch giveaways' });
  }
});

// Prize Pool Management - GET current settings
router.get('/prize-pool', async (req, res) => {
  try {
    console.log('� Prize-pool API: Fetching prize pool settings...');
    await verifyAdminToken(req);
    
    const supabase = getSupabaseAdminClient();
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's giveaway to check prize pool
    const { data: todayGiveaway, error: todayError } = await supabase
      .from('daily_giveaways')
      .select('prize_pool_sol, is_completed')
      .eq('date', today)
      .single();
    
    if (todayError && todayError.code !== 'PGRST116') {
      console.error('❌ Error fetching today\'s giveaway:', todayError);
      throw todayError;
    }
    
    const defaultPrizePool = 0.3; // Fallback default
    const todayPrizePool = todayGiveaway?.prize_pool_sol || defaultPrizePool;
    
    console.log('✅ Prize pool settings:', {
      defaultPrizePool,
      todayPrizePool,
      hasCustomToday: todayGiveaway && todayGiveaway.prize_pool_sol !== defaultPrizePool
    });
    
    return res.json({
      success: true,
      data: {
        defaultPrizePool,
        todayPrizePool,
        hasCustomToday: todayGiveaway && todayGiveaway.prize_pool_sol !== defaultPrizePool,
        isCompleted: todayGiveaway?.is_completed || false
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('token')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('❌ Error in prize pool GET:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Prize Pool Management - UPDATE settings
router.post('/prize-pool', async (req, res) => {
  try {
    console.log('💰 Prize-pool API: Updating prize pool...');
    await verifyAdminToken(req);
    
    const { updateType, defaultPrizePool } = req.body;
    
    // Validate request
    const prizeAmount = validatePrizePoolRequest(req.body);
    
    const supabase = getSupabaseAdminClient();
    const today = new Date().toISOString().split('T')[0];
    
    // Update today's giveaway prize pool if requested
    if (updateType === 'today' || updateType === 'both') {
      await updateTodayPrizePool(supabase, today, prizeAmount);
    }
    
    // Acknowledge default prize pool setting
    if (updateType === 'default' || updateType === 'both') {
      console.log(`ℹ️ Default prize pool acknowledged: ${defaultPrizePool} SOL (applies to future giveaways)`);
    }
    
    // Get final settings
    const finalSettings = await getFinalPrizePoolSettings(supabase, today, defaultPrizePool);
    
    return res.json({
      success: true,
      message: 'Prize pool updated successfully',
      data: finalSettings
    });
  } catch (error) {
    return handlePrizePoolError(error, res);
  }
});

// Uncomplete today's giveaway (allow editing again)
router.post('/uncomplete', async (req, res) => {
  try {
    console.log('🔄 Uncomplete API: Marking giveaway as not completed...');
    await verifyAdminToken(req);
    
    const supabase = getSupabaseAdminClient();
    const today = new Date().toISOString().split('T')[0];
    
    const { data: updatedGiveaway, error: updateError } = await supabase
      .from('daily_giveaways')
      .update({ is_completed: false })
      .eq('date', today)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Error uncompleting giveaway:', updateError);
      return res.status(500).json({ 
        error: 'Failed to uncomplete giveaway',
        details: updateError.message 
      });
    }
    
    console.log('✅ Giveaway marked as not completed');
    
    return res.json({
      success: true,
      message: 'Giveaway marked as not completed',
      data: updatedGiveaway
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('token')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('❌ Error in uncomplete endpoint:', error);
    return res.status(500).json({ 
      error: 'Failed to uncomplete giveaway',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Statistics endpoint
router.get('/stats', async (req, res) => {
  try {
    try {
      await verifyAdminToken(req);
    } catch (authError) {
      console.warn('Authentication failed:', authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const supabase = getSupabaseAdminClient();
    const { count: totalEntries, error: entriesError } = await supabase
      .from('giveaway_entries')
      .select('*', { count: 'exact', head: true });
    if (entriesError) {
      console.error('Error fetching entries count:', entriesError);
    }
    const { data: participantsData, error: participantsError } = await supabase
      .from('giveaway_entries')
      .select('wallet_address');
    const uniqueParticipants = participantsData ? new Set(participantsData.map(entry => entry.wallet_address)).size : 0;
    if (participantsError) {
      console.error('Error fetching participants:', participantsError);
    }
    const { data: prizePoolSetting, error: prizeError } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'giveaway_default_prize_pool')
      .single();
    const prizePoolValue = prizePoolSetting ? parseFloat(prizePoolSetting.value) : 0.3;
    if (prizeError && prizeError.code !== 'PGRST116') {
      console.error('Error fetching prize pool settings:', prizeError);
    }
    const { count: activeGiveaways, error: activeError } = await supabase
      .from('daily_giveaways')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    if (activeError) {
      console.error('Error fetching active giveaways:', activeError);
    }
    const { count: totalWinners, error: winnersError } = await supabase
      .from('giveaway_winners')
      .select('*', { count: 'exact', head: true });
    if (winnersError) {
      console.error('Error fetching winners count:', winnersError);
    }
    res.json({
      totalParticipants: uniqueParticipants,
      totalEntries: totalEntries || 0,
      totalWinners: totalWinners || 0,
      prizePool: { total_pool: prizePoolValue, current_pool: prizePoolValue, is_active: true },
      activeGiveaways: activeGiveaways || 0
    });
  } catch (error) {
    console.error('Error fetching giveaway stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

