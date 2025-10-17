const cron = require('node-cron');
const { shouldRunClaim, processDividendClaim } = require('./dividend-claimer.js');

let cronJob = null;
let isRunning = false;

/**
 * Start the dividend claim cron job
 */
function startDividendCron() {
  if (cronJob) {
    console.log('🔄 Dividend cron job already running');
    return;
  }
  
  // Run every 2 minutes to check if we should claim
  cronJob = cron.schedule('*/2 * * * *', async () => {
    if (isRunning) {
      console.log('⏭️ Dividend claim already in progress, skipping...');
      return;
    }
    
    try {
      isRunning = true;
      
      console.log('🔍 Checking if dividend claim should run...');
      
      const shouldRun = await shouldRunClaim();
      if (!shouldRun) {
        console.log('⏰ Not time for dividend claim yet');
        return;
      }
      
      console.log('🚀 Starting scheduled dividend claim...');
      const result = await processDividendClaim(false); // false = respect schedule
      
      if (result.success) {
        console.log(`✅ Scheduled dividend claim completed successfully`);
        console.log(`💰 Claimed: ${result.claimedAmount} SOL`);
        console.log(`📊 Distributed: ${result.distributionAmount} SOL to ${result.holdersCount} holders`);
        console.log(`⏰ Next claim: ${result.nextClaimTime}`);
      } else {
        console.log(`⏭️ Scheduled claim skipped: ${result.reason}`);
      }
      
    } catch (error) {
      console.error('❌ Scheduled dividend claim failed:', error);
    } finally {
      isRunning = false;
    }
  }, {
    scheduled: false,
    timezone: 'UTC'
  });
  
  cronJob.start();
  console.log('✅ Dividend cron job started (checking every 2 minutes)');
}

/**
 * Stop the dividend claim cron job
 */
function stopDividendCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('🛑 Dividend cron job stopped');
  }
}

/**
 * Get cron job status
 */
function getCronStatus() {
  return {
    running: !!cronJob,
    claimInProgress: isRunning,
    schedule: '*/2 * * * *' // Every 2 minutes
  };
}

/**
 * Restart the cron job
 */
function restartDividendCron() {
  stopDividendCron();
  startDividendCron();
}

module.exports = {
  startDividendCron,
  stopDividendCron,
  getCronStatus,
  restartDividendCron
};
