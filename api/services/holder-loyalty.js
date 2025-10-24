const { getSupabaseAdminClient } = require('../../database.js');

/**
 * HOLDER LOYALTY SYSTEM
 * Enforces 70% retention rule for dividend eligibility
 * Tracks initial bags and blacklists sellers who drop below 70%
 */

/**
 * Record initial bag for a new holder
 */
async function recordInitialBag(holderAddress, tokenBalance, percentage, tokenMintAddress) {
  try {
    const supabase = getSupabaseAdminClient();
    
    // Check if holder already has an initial bag recorded
    const { data: existingBag } = await supabase
      .from('holder_initial_bags')
      .select('*')
      .eq('holder_address', holderAddress)
      .single();
    
    if (existingBag) {
      console.log(`📝 Initial bag already recorded for ${holderAddress}`);
      return existingBag;
    }
    
    // Record the initial bag
    const { data: newBag, error } = await supabase
      .from('holder_initial_bags')
      .insert({
        holder_address: holderAddress,
        initial_balance: tokenBalance,
        initial_percentage: percentage,
        token_mint_address: tokenMintAddress
      })
      .select()
      .single();
    
    if (error) {
      console.error(`❌ Failed to record initial bag for ${holderAddress}:`, error);
      throw error;
    }
    
    // Also create eligibility record
    await supabase
      .from('holder_eligibility')
      .insert({
        holder_address: holderAddress,
        current_balance: tokenBalance,
        initial_balance: tokenBalance,
        retention_percentage: 100,
        is_eligible: true
      });
    
    console.log(`✅ Recorded initial bag for ${holderAddress}: ${tokenBalance} tokens`);
    return newBag;
  } catch (error) {
    console.error('❌ Error recording initial bag:', error);
    throw error;
  }
}

/**
 * Update holder eligibility based on current holdings
 */
async function updateHolderEligibility(holderAddress, currentBalance, initialBalance) {
  try {
    const supabase = getSupabaseAdminClient();
    
    // Check if holder was ever completely sold out (permanently blacklisted)
    const { data: existingRecord } = await supabase
      .from('holder_eligibility')
      .select('*')
      .eq('holder_address', holderAddress)
      .single();
    
    // Calculate retention percentage
    const retentionPercentage = initialBalance > 0 ? (currentBalance / initialBalance) * 100 : 0;
    
    // Check if they completely sold out (0 balance)
    const hasSoldOut = currentBalance === 0;
    
    // Determine eligibility rules:
    // 1. If they ever sold out completely (100%), they are PERMANENTLY blacklisted
    // 2. If they never sold out but are <70%, they are temporarily blacklisted
    // 3. If they were temporarily blacklisted but topped back up to 70%+, they become eligible again
    
    let isEligible = retentionPercentage >= 70;
    let blacklistReason = null;
    let isPermanentlyBlacklisted = false;
    
    // Check if they previously sold out completely
    if (existingRecord?.blacklist_reason?.includes('PERMANENTLY BLACKLISTED - Sold entire bag')) {
      isPermanentlyBlacklisted = true;
      isEligible = false;
      blacklistReason = existingRecord.blacklist_reason;
    } else if (hasSoldOut) {
      // They just sold out completely - permanent blacklist
      isPermanentlyBlacklisted = true;
      isEligible = false;
      blacklistReason = `PERMANENTLY BLACKLISTED - Sold entire bag (${new Date().toISOString()})`;
    } else if (retentionPercentage < 70) {
      // Temporarily blacklisted for low retention (can recover)
      isEligible = false;
      blacklistReason = `Temporarily blacklisted: retention ${retentionPercentage.toFixed(2)}% < 70% (can recover by buying back to 70%+)`;
    } else if (retentionPercentage >= 70 && existingRecord?.is_eligible === false && !isPermanentlyBlacklisted) {
      // They recovered from temporary blacklist!
      isEligible = true;
      blacklistReason = null;
      console.log(`🎉 RECOVERY: ${holderAddress} topped back up to ${retentionPercentage.toFixed(2)}% - ELIGIBLE AGAIN!`);
    }
    
    const updateData = {
      current_balance: currentBalance,
      initial_balance: initialBalance,
      retention_percentage: retentionPercentage,
      is_eligible: isEligible,
      last_checked_at: new Date().toISOString(),
      permanently_blacklisted: isPermanentlyBlacklisted
    };
    
    // Only update blacklist info if status changed
    if (isEligible === false) {
      updateData.blacklisted_at = new Date().toISOString();
      updateData.blacklist_reason = blacklistReason;
    } else if (isEligible === true && existingRecord?.is_eligible === false) {
      // They recovered - clear blacklist info
      updateData.blacklisted_at = null;
      updateData.blacklist_reason = null;
    }
    
    const { error } = await supabase
      .from('holder_eligibility')
      .upsert({
        holder_address: holderAddress,
        ...updateData
      });
    
    if (error) {
      console.error(`❌ Failed to update eligibility for ${holderAddress}:`, error);
      throw error;
    }
    
    // Log the result
    if (isPermanentlyBlacklisted) {
      console.log(`💀 PERMANENTLY BLACKLISTED: ${holderAddress} - sold entire bag, can never recover`);
    } else if (isEligible === false) {
      console.log(`🚫 TEMPORARILY BLACKLISTED: ${holderAddress} retention: ${retentionPercentage.toFixed(2)}% (< 70%) - can recover`);
    } else if (isEligible === true && existingRecord?.is_eligible === false) {
      console.log(`🎉 RECOVERED: ${holderAddress} retention: ${retentionPercentage.toFixed(2)}% (>= 70%) - eligible again!`);
    } else {
      console.log(`✅ ELIGIBLE: ${holderAddress} retention: ${retentionPercentage.toFixed(2)}% (>= 70%)`);
    }
    
    return { 
      isEligible, 
      retentionPercentage, 
      isPermanentlyBlacklisted,
      canRecover: !isPermanentlyBlacklisted && retentionPercentage < 70
    };
  } catch (error) {
    console.error('❌ Error updating holder eligibility:', error);
    throw error;
  }
}

/**
 * Get eligible holders only (those with 70%+ retention)
 */
async function getEligibleHolders(allHolders, tokenMintAddress) {
  try {
    console.log(`🔍 Checking eligibility for ${allHolders.length} holders...`);
    const supabase = getSupabaseAdminClient();
    const eligibleHolders = [];
    
    for (const holder of allHolders) {
      try {
        // Get or create initial bag record
        let { data: initialBag } = await supabase
          .from('holder_initial_bags')
          .select('*')
          .eq('holder_address', holder.address)
          .single();
        
        // If no initial bag exists, this is a new holder - record their bag
        if (!initialBag) {
          console.log(`🆕 New holder detected: ${holder.address}, recording initial bag`);
          initialBag = await recordInitialBag(
            holder.address, 
            holder.balance, 
            holder.percentage, 
            tokenMintAddress
          );
        }
        
        // Update eligibility based on current vs initial holdings
        const eligibilityResult = await updateHolderEligibility(
          holder.address, 
          holder.balance, 
          initialBag.initial_balance
        );
        
        // Only include eligible holders
        if (eligibilityResult.isEligible) {
          eligibleHolders.push({
            ...holder,
            initialBalance: initialBag.initial_balance,
            retentionPercentage: eligibilityResult.retentionPercentage,
            isEligible: true,
            firstRecorded: initialBag.first_recorded_at
          });
        } else {
          console.log(`🚫 Excluding ineligible holder: ${holder.address}`);
        }
      } catch (holderError) {
        console.error(`❌ Error processing holder ${holder.address}:`, holderError);
        // Continue with other holders
      }
    }
    
    console.log(`✅ Eligible holders: ${eligibleHolders.length}/${allHolders.length}`);
    return eligibleHolders;
  } catch (error) {
    console.error('❌ Error getting eligible holders:', error);
    throw error;
  }
}

/**
 * Create snapshot of eligible holders for dividend claim
 */
async function createHolderSnapshot(claimId, eligibleHolders) {
  try {
    console.log(`📸 Creating snapshot for claim ${claimId} with ${eligibleHolders.length} eligible holders`);
    const supabase = getSupabaseAdminClient();
    
    const snapshots = eligibleHolders.map(holder => ({
      claim_id: claimId,
      holder_address: holder.address,
      token_balance: holder.balance,
      percentage: holder.percentage,
      initial_balance: holder.initialBalance,
      retention_percentage: holder.retentionPercentage,
      is_eligible: holder.isEligible
    }));
    
    const { error } = await supabase
      .from('holder_snapshots')
      .insert(snapshots);
    
    if (error) {
      console.error('❌ Failed to create holder snapshot:', error);
      throw error;
    }
    
    console.log(`✅ Created snapshot with ${snapshots.length} eligible holders`);
    return snapshots;
  } catch (error) {
    console.error('❌ Error creating holder snapshot:', error);
    throw error;
  }
}

/**
 * Calculate proportional dividend distribution for eligible holders
 */
function calculateProportionalDistribution(eligibleHolders, totalDistributionAmount) {
  try {
    console.log(`💰 Calculating proportional distribution of ${totalDistributionAmount} SOL among ${eligibleHolders.length} eligible holders`);
    
    // Calculate total tokens held by eligible holders only
    const totalEligibleTokens = eligibleHolders.reduce((sum, holder) => sum + holder.balance, 0);
    
    if (totalEligibleTokens === 0) {
      console.warn('⚠️ No eligible tokens found for distribution');
      return [];
    }
    
    // Calculate each holder's share based on their current holdings
    const distributions = eligibleHolders.map(holder => {
      const sharePercentage = (holder.balance / totalEligibleTokens) * 100;
      const dividendAmount = (totalDistributionAmount * sharePercentage) / 100;
      
      return {
        holder_address: holder.address,
        token_balance: holder.balance,
        share_percentage: sharePercentage,
        dividend_amount: dividendAmount,
        retention_percentage: holder.retentionPercentage,
        is_eligible: true
      };
    });
    
    const totalDistributed = distributions.reduce((sum, dist) => sum + dist.dividend_amount, 0);
    console.log(`✅ Distribution calculated: ${totalDistributed.toFixed(6)} SOL to ${distributions.length} holders`);
    
    return distributions;
  } catch (error) {
    console.error('❌ Error calculating proportional distribution:', error);
    throw error;
  }
}

/**
 * Get holder loyalty statistics
 */
async function getHolderLoyaltyStats() {
  try {
    const supabase = getSupabaseAdminClient();
    
    // Get total holders count
    const { count: totalHolders } = await supabase
      .from('holder_initial_bags')
      .select('*', { count: 'exact', head: true });
    
    // Get eligible holders count
    const { count: eligibleHolders } = await supabase
      .from('holder_eligibility')
      .select('*', { count: 'exact', head: true })
      .eq('is_eligible', true);
    
    // Get blacklisted holders count
    const { count: blacklistedHolders } = await supabase
      .from('holder_eligibility')
      .select('*', { count: 'exact', head: true })
      .eq('is_eligible', false);
    
    // Get average retention percentage
    const { data: avgRetention } = await supabase
      .from('holder_eligibility')
      .select('retention_percentage');
    
    const averageRetention = avgRetention?.length > 0 
      ? avgRetention.reduce((sum, h) => sum + h.retention_percentage, 0) / avgRetention.length 
      : 0;
    
    return {
      totalHolders: totalHolders || 0,
      eligibleHolders: eligibleHolders || 0,
      blacklistedHolders: blacklistedHolders || 0,
      eligibilityRate: totalHolders > 0 ? ((eligibleHolders || 0) / totalHolders) * 100 : 0,
      averageRetention: averageRetention
    };
  } catch (error) {
    console.error('❌ Error getting holder loyalty stats:', error);
    throw error;
  }
}

/**
 * Reset holder initial bag (admin function)
 */
async function resetHolderInitialBag(holderAddress, newBalance, newPercentage, tokenMintAddress) {
  try {
    console.log(`🔄 Resetting initial bag for ${holderAddress}`);
    const supabase = getSupabaseAdminClient();
    
    // Update initial bag
    const { error: bagError } = await supabase
      .from('holder_initial_bags')
      .upsert({
        holder_address: holderAddress,
        initial_balance: newBalance,
        initial_percentage: newPercentage,
        token_mint_address: tokenMintAddress,
        first_recorded_at: new Date().toISOString()
      });
    
    if (bagError) throw bagError;
    
    // Reset eligibility
    const { error: eligibilityError } = await supabase
      .from('holder_eligibility')
      .upsert({
        holder_address: holderAddress,
        current_balance: newBalance,
        initial_balance: newBalance,
        retention_percentage: 100,
        is_eligible: true,
        blacklisted_at: null,
        blacklist_reason: null
      });
    
    if (eligibilityError) throw eligibilityError;
    
    console.log(`✅ Reset initial bag for ${holderAddress} to ${newBalance} tokens`);
    return true;
  } catch (error) {
    console.error('❌ Error resetting holder initial bag:', error);
    throw error;
  }
}

module.exports = {
  recordInitialBag,
  updateHolderEligibility,
  getEligibleHolders,
  createHolderSnapshot,
  calculateProportionalDistribution,
  getHolderLoyaltyStats,
  resetHolderInitialBag
};
