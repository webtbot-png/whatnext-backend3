const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getSupabaseAdminClient } = require('../../database.js');
const { getEligibleHolders, createHolderSnapshot, calculateProportionalDistribution } = require('./holder-loyalty.js');
const { solanaPaymentService } = require('../../lib/solana-payment.cjs');

// Solana connection for read-only operations
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

/**
 * Decrypt the stored private key
 */
function decryptPrivateKey(encryptedKey, encryptionPassword) {
  try {
    const algorithm = 'aes-256-gcm';
    const [encrypted, , tag] = encryptedKey.split(':');
    
    const decipher = crypto.createDecipherGCM(algorithm, Buffer.from(encryptionPassword, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error('Failed to decrypt private key: ' + error.message);
  }
}

/**
 * Get the current auto-claim settings
 */
async function getAutoClaimSettings() {
  const supabase = getSupabaseAdminClient();
  
  // Get the first auto_claim_settings record (should only be one)
  const { data, error } = await supabase
    .from('auto_claim_settings')
    .select('*')
    .single();
    
  if (error) {
    if (error.code === 'PGRST116') { // Not found
      console.log('⚠️ No auto-claim settings found. Creating minimal default settings...');
      // Return default settings without trying to insert (database may have constraints)
      const defaultSettings = {
        enabled: false,
        claim_interval_minutes: 10,
        distribution_percentage: 30,
        min_claim_amount: 0.001,
        claim_wallet_address: null,
        pumpfun_fee_account: null,
        token_mint_address: null
      };
      
      console.warn('💡 To configure the dividend system, use the admin configuration endpoint.');
      return defaultSettings;
    }
    
    console.error('❌ Error fetching auto-claim settings:', error);
    throw error;
  }
  
  // Return the settings, but skip if critical fields are placeholders or null
  if (!data.token_mint_address || 
      data.token_mint_address === 'PLACEHOLDER_TOKEN_MINT' || 
      !data.claim_wallet_address ||
      data.claim_wallet_address === 'PLACEHOLDER_WALLET_ADDRESS') {
    console.warn('⚠️ Auto-claim settings contain placeholder/null values. Dividend system disabled until real values are configured.');
    console.warn(`   - Token mint: ${data.token_mint_address || 'NOT SET'}`);
    console.warn(`   - Claim wallet: ${data.claim_wallet_address || 'NOT SET'}`);
    console.warn('💡 This is normal if you haven\'t configured your token yet.');
    return {
      ...data,
      enabled: false // Force disable if using placeholders
    };
  }
  
  return data;
}

/**
 * Get current token holders and their balances
 */
async function getTokenHolders(tokenMintAddress) {
  try {
    console.log('🔍 Fetching token holders for mint:', tokenMintAddress);
    
    // Get all token accounts for this mint
    const tokenAccounts = await connection.getParsedProgramAccounts(
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // SPL Token Program
      {
        filters: [
          {
            dataSize: 165, // Size of token account
          },
          {
            memcmp: {
              offset: 0,
              bytes: tokenMintAddress, // Filter by mint address
            },
          },
        ],
      }
    );

    const holders = [];
    let totalSupply = 0;

    for (const account of tokenAccounts) {
      const accountData = account.account.data.parsed.info;
      const balance = Number.parseInt(accountData.tokenAmount.amount);
      
      if (balance > 0) {
        holders.push({
          address: accountData.owner,
          balance: balance,
          decimals: accountData.tokenAmount.decimals
        });
        totalSupply += balance;
      }
    }

    // Calculate percentages
    const holdersWithPercentages = holders.map(holder => ({
      ...holder,
      percentage: totalSupply > 0 ? (holder.balance / totalSupply) * 100 : 0
    }));

    console.log(`✅ Found ${holders.length} token holders with total supply: ${totalSupply}`);
    
    return {
      holders: holdersWithPercentages,
      totalSupply,
      decimals: holders[0]?.decimals || 9
    };
  } catch (error) {
    console.error('❌ Error fetching token holders:', error);
    throw new Error('Failed to fetch token holders: ' + error.message);
  }
}

/**
 * Check PumpFun fee account balance
 */
async function checkPumpFunFees(feeAccountAddress) {
  try {
    console.log('💰 Checking PumpFun fee account balance:', feeAccountAddress);
    
    // Validate fee account address format
    if (!feeAccountAddress || 
        feeAccountAddress === 'PLACEHOLDER_PUMPFUN_FEE_ACCOUNT' ||
        feeAccountAddress.length !== 44) {
      throw new Error('Invalid or unconfigured PumpFun fee account address');
    }
    
    const feeAccount = new PublicKey(feeAccountAddress);
    const balance = await connection.getBalance(feeAccount);
    const solBalance = balance / 1000000000; // Convert lamports to SOL
    
    console.log(`💰 Fee account balance: ${solBalance} SOL`);
    
    return {
      balance: solBalance,
      lamports: balance
    };
  } catch (error) {
    console.error('❌ Error checking PumpFun fees:', error);
    throw new Error('Failed to check fee balance: ' + error.message);
  }
}

/**
 * Claim fees from PumpFun using official collectCreatorFee instruction
 * Enhanced version with real PumpPortal integration
 */
async function claimPumpFunFees(settings) {
  try {
    console.log('🎯 Starting enhanced PumpFun creator fee claim process...');
    
    // Import the new creator fee claiming function
    const { claimPumpFunFeesEnhanced, isCreatorFeeClaimingAvailable } = require('../../lib/creator-fee-claimer.js');
    
    // Check if creator fee claiming is available
    const isAvailable = await isCreatorFeeClaimingAvailable();
    
    if (!isAvailable) {
      console.log('⚠️ Creator fee claiming not configured - using fallback');
      console.log('💡 Configure AWS secrets to enable real PumpFun fee claiming');
      
      // Fallback to original logic for backward compatibility
      if (!settings.pumpfun_fee_account || 
          settings.pumpfun_fee_account === 'PLACEHOLDER_PUMPFUN_FEE_ACCOUNT') {
        return {
          success: true,
          reason: 'PumpFun fee account not configured - skipped fee claiming',
          claimedAmount: 0,
          source: 'pumpfun-skipped'
        };
      }
      
      // Check fee balance with fallback
      try {
        const feeInfo = await checkPumpFunFees(settings.pumpfun_fee_account);
        
        if (feeInfo.balance < settings.min_claim_amount) {
          return {
            success: false,
            reason: 'Below minimum claim amount',
            balance: feeInfo.balance,
            minAmount: settings.min_claim_amount
          };
        }
        
        return {
          success: true,
          claimedAmount: 0,
          reason: 'PumpFun system ready - using fallback mode',
          feeAccountBalance: feeInfo.balance,
          status: 'fallback'
        };
      } catch (balanceError) {
        console.log('⚠️ Could not check fee balance, proceeding with enhanced claim:', balanceError.message);
        // Continue execution - this is expected when fee account is not configured
      }
    }
    
    // Use the enhanced creator fee claiming
    console.log('🚀 Using enhanced PumpPortal integration for creator fee claiming');
    const claimResult = await claimPumpFunFeesEnhanced(settings);
    
    if (claimResult.success) {
      console.log('✅ Enhanced creator fee claim successful!');
      console.log(`💰 Transaction: ${claimResult.transactionId || 'N/A'}`);
      console.log(`🌐 Explorer: ${claimResult.explorerUrl || 'N/A'}`);
      
      return {
        success: true,
        claimedAmount: claimResult.claimedAmount || 0,
        transactionId: claimResult.transactionId,
        explorerUrl: claimResult.explorerUrl,
        source: 'pumpfun-enhanced',
        signature: claimResult.signature,
        timestamp: claimResult.timestamp
      };
    } else {
      console.log('❌ Enhanced creator fee claim failed:', claimResult.reason);
      return {
        success: false,
        reason: claimResult.reason || 'Enhanced claim failed',
        claimedAmount: 0,
        error: claimResult.error
      };
    }
    
  } catch (error) {
    console.error('❌ Error in enhanced PumpFun fee claiming:', error);
    
    // Return failure result so dividend system can continue
    return {
      success: false,
      reason: 'Enhanced PumpFun claim failed: ' + error.message,
      claimedAmount: 0,
      error: error.message
    };
  }
}

/**
 * Save holder snapshot to database
 */
async function saveHolderSnapshot(claimId, holders) {
  const supabase = getSupabaseAdminClient();
  
  const snapshots = holders.map(holder => ({
    claim_id: claimId,
    holder_address: holder.address,
    token_balance: holder.balance,
    percentage: holder.percentage
  }));
  
  const { error } = await supabase
    .from('holder_snapshots')
    .insert(snapshots);
    
  if (error) {
    throw new Error('Failed to save holder snapshot: ' + error.message);
  }
  
  console.log(`✅ Saved snapshot for ${holders.length} holders`);
}

/**
 * Update holder stats table
 */
async function updateHolderStats(holders, claimId, distributionAmount) {
  const supabase = getSupabaseAdminClient();
  
  for (const holder of holders) {
    const dividendAmount = (distributionAmount * holder.percentage) / 100;
    
    // Upsert holder stats
    const { error } = await supabase
      .from('holder_stats')
      .upsert({
        holder_address: holder.address,
        current_token_balance: holder.balance,
        current_percentage: holder.percentage,
        pending_dividends: dividendAmount,
        total_claims_participated: 1, // This should be incremented
        last_dividend_date: new Date().toISOString()
      }, {
        onConflict: 'holder_address'
      });
      
    if (error) {
      console.error(`❌ Error updating stats for holder ${holder.address}:`, error);
    }
  }
  
  console.log(`✅ Updated stats for ${holders.length} holders`);
}

/**
 * Create dividend distributions for eligible holders only AND execute actual SOL payments
 */
async function createDividendDistributionsForEligible(claimId, distributions) {
  const supabase = getSupabaseAdminClient();
  
  // First, create the database records
  const distributionRecords = distributions.map(dist => ({
    claim_id: claimId,
    holder_address: dist.holder_address,
    token_balance: dist.token_balance,
    percentage: dist.share_percentage,
    dividend_amount: dist.dividend_amount,
    status: 'pending'
  }));
  
  const { error } = await supabase
    .from('dividend_distributions')
    .insert(distributionRecords);
    
  if (error) {
    throw new Error('Failed to create dividend distributions: ' + error.message);
  }
  
  console.log(`✅ Created ${distributionRecords.length} dividend distributions for ELIGIBLE HOLDERS ONLY`);
  
  // Now execute actual SOL payments
  console.log('💸 Starting actual SOL dividend payments...');
  
  // Initialize Solana payment service if needed
  if (!solanaPaymentService.isInitialized()) {
    console.log('🔄 Initializing Solana payment service for dividend distribution...');
    await solanaPaymentService.initialize();
  }
  
  let successfulPayments = 0;
  let failedPayments = 0;
  
  for (const dist of distributions) {
    try {
      // Convert SOL amount to lamports (1 SOL = 1,000,000,000 lamports)
      const lamports = Math.floor(dist.dividend_amount * 1000000000);
      
      console.log(`💰 Sending ${dist.dividend_amount} SOL (${lamports} lamports) to ${dist.holder_address}`);
      
      const transactionSignature = await solanaPaymentService.sendSOL(dist.holder_address, lamports);
      
      // Update database record to completed with transaction signature
      await supabase
        .from('dividend_distributions')
        .update({ 
          status: 'completed',
          transaction_signature: transactionSignature,
          paid_at: new Date().toISOString()
        })
        .eq('claim_id', claimId)
        .eq('holder_address', dist.holder_address);
      
      console.log(`✅ DIVIDEND PAYMENT SUCCESSFUL! ${dist.dividend_amount} SOL sent to ${dist.holder_address}, Signature: ${transactionSignature}`);
      successfulPayments++;
      
    } catch (paymentError) {
      console.error(`❌ Dividend payment failed for ${dist.holder_address}:`, paymentError.message);
      
      // Update database record to failed
      await supabase
        .from('dividend_distributions')
        .update({ 
          status: 'failed',
          error_message: paymentError.message,
          failed_at: new Date().toISOString()
        })
        .eq('claim_id', claimId)
        .eq('holder_address', dist.holder_address);
      
      failedPayments++;
    }
  }
  
  console.log(`🎯 Dividend Payment Summary: ${successfulPayments} successful, ${failedPayments} failed`);
  
  return distributionRecords;
}

/**
 * Update holder stats for eligible holders only
 */
async function updateHolderStatsForEligible(eligibleHolders, claimId, distributionAmount) {
  const supabase = getSupabaseAdminClient();
  
  for (const holder of eligibleHolders) {
    const totalEligibleTokens = eligibleHolders.reduce((sum, h) => sum + h.balance, 0);
    const sharePercentage = totalEligibleTokens > 0 ? (holder.balance / totalEligibleTokens) * 100 : 0;
    const dividendAmount = (distributionAmount * sharePercentage) / 100;
    
    // Upsert holder stats
    const { error } = await supabase
      .from('holder_stats')
      .upsert({
        holder_address: holder.address,
        current_token_balance: holder.balance,
        current_percentage: holder.percentage,
        pending_dividends: dividendAmount,
        total_claims_participated: 1, // This should be incremented
        last_dividend_date: new Date().toISOString()
      }, {
        onConflict: 'holder_address'
      });
      
    if (error) {
      console.error(`❌ Error updating stats for eligible holder ${holder.address}:`, error);
    }
  }
  
  console.log(`✅ Updated stats for ${eligibleHolders.length} ELIGIBLE HOLDERS`);
}

/**
 * Check if dividend claim should be processed
 */
function shouldProcessClaim(settings, forceRun) {
  if (!settings.enabled && !forceRun) {
    console.log('⏸️ Auto-claim is disabled');
    return { shouldProcess: false, reason: 'Auto-claim disabled' };
  }

  const now = new Date();
  const nextClaimTime = new Date(settings.next_claim_scheduled);

  if (now < nextClaimTime && !forceRun) {
    console.log(`⏰ Next claim scheduled for: ${nextClaimTime.toISOString()}`);
    return {
      shouldProcess: false,
      reason: 'Not time for next claim',
      nextClaimTime: nextClaimTime.toISOString()
    };
  }

  return { shouldProcess: true };
}

/**
 * Process successful fee claim and create distributions for ELIGIBLE HOLDERS ONLY
 */
async function processSuccessfulClaim(settings, claimResult, supabase, now) {
  // Calculate distribution amount
  const distributionAmount = claimResult.claimedAmount * (settings.distribution_percentage / 100);

  console.log(`💰 Claimed: ${claimResult.claimedAmount} SOL`);
  console.log(`📊 Distribution (${settings.distribution_percentage}%): ${distributionAmount} SOL`);

  // Get current token holders from blockchain
  const allHolderData = await getTokenHolders(settings.token_mint_address);
  console.log(`🔍 Found ${allHolderData.holders.length} total holders on blockchain`);

  // Filter to only eligible holders (70%+ retention rule)
  const eligibleHolders = await getEligibleHolders(allHolderData.holders, settings.token_mint_address);
  console.log(`✅ Eligible holders: ${eligibleHolders.length}/${allHolderData.holders.length}`);

  if (eligibleHolders.length === 0) {
    console.warn('⚠️ No eligible holders found for dividend distribution');
    throw new Error('No eligible holders found for dividend distribution');
  }

  // Create claim record
  const { data: claimRecord, error: claimError } = await supabase
    .from('dividend_claims')
    .insert({
      claimed_amount: claimResult.claimedAmount,
      transaction_id: claimResult.transactionId,
      distribution_amount: distributionAmount,
      total_supply: allHolderData.totalSupply,
      holder_count: eligibleHolders.length, // Only count eligible holders
      status: 'processing'
    })
    .select()
    .single();

  if (claimError) {
    throw new Error('Failed to create claim record: ' + claimError.message);
  }

  const claimId = claimRecord.id;
  console.log(`✅ Created claim record: ${claimId}`);

  try {
    // Create snapshot of eligible holders for audit trail
    await createHolderSnapshot(claimId, eligibleHolders);

    // Calculate proportional distribution among eligible holders only
    const distributions = calculateProportionalDistribution(eligibleHolders, distributionAmount);

    // Create dividend distributions for eligible holders only
    await createDividendDistributionsForEligible(claimId, distributions);

    // Update holder stats for eligible holders only
    await updateHolderStatsForEligible(eligibleHolders, claimId, distributionAmount);

    // Update claim status to completed
    await supabase
      .from('dividend_claims')
      .update({ status: 'completed' })
      .eq('id', claimId);

    // Schedule next claim
    const nextClaim = new Date(now.getTime() + settings.claim_interval_minutes * 60 * 1000);
    await supabase
      .from('auto_claim_settings')
      .update({
        last_successful_claim: now.toISOString(),
        next_claim_scheduled: nextClaim.toISOString()
      })
      .eq('id', settings.id);

    console.log(`✅ Dividend claim process completed successfully`);
    console.log(`💎 Distributed to ${eligibleHolders.length} ELIGIBLE HOLDERS ONLY (70%+ retention)`);
    console.log(`⏰ Next claim scheduled for: ${nextClaim.toISOString()}`);

    return {
      success: true,
      claimId,
      claimedAmount: claimResult.claimedAmount,
      distributionAmount,
      totalHolders: allHolderData.holders.length,
      eligibleHolders: eligibleHolders.length,
      transactionId: claimResult.transactionId,
      nextClaimTime: nextClaim.toISOString()
    };

  } catch (error) {
    // Mark claim as failed
    await supabase
      .from('dividend_claims')
      .update({
        status: 'failed',
        error_message: error.message
      })
      .eq('id', claimId);

    throw error;
  }
}

/**
 * Process a complete dividend claim and distribution cycle
 */
async function processDividendClaim(forceRun = false) {
  try {
    console.log('🚀 Starting dividend claim process...');

    // Get settings
    const settings = await getAutoClaimSettings();

    // Check if we should process the claim
    const claimCheck = shouldProcessClaim(settings, forceRun);
    if (!claimCheck.shouldProcess) {
      return {
        success: false,
        reason: claimCheck.reason,
        ...(claimCheck.nextClaimTime && { nextClaimTime: claimCheck.nextClaimTime })
      };
    }

    // Start claim process
    const supabase = getSupabaseAdminClient();
    const now = new Date();

    // Claim fees from PumpFun
    const claimResult = await claimPumpFunFees(settings);

    if (!claimResult.success) {
      console.log('❌ Fee claim failed:', claimResult.reason);
      return claimResult;
    }

    // Process successful claim
    return await processSuccessfulClaim(settings, claimResult, supabase, now);

  } catch (error) {
    console.error('❌ Dividend claim process failed:', error);
    throw error;
  }
}

/**
 * Trigger manual claim (for admin use)
 */
async function triggerManualClaim(forceRun = true) {
  return await processDividendClaim(forceRun);
}

/**
 * Check if claim should run (for cron job)
 */
async function shouldRunClaim() {
  try {
    const settings = await getAutoClaimSettings();
    
    if (settings.enabled) {
      const now = new Date();
      const nextClaimTime = new Date(settings.next_claim_scheduled);
      
      return now >= nextClaimTime;
    } else {
      return false;
    }
  } catch (error) {
    console.error('Error checking if claim should run:', error);
    return false;
  }
}

module.exports = {
  processDividendClaim,
  triggerManualClaim,
  shouldRunClaim,
  getAutoClaimSettings,
  getTokenHolders,
  checkPumpFunFees
};
