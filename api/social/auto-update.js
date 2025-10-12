const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    console.log('🔄 Starting automatic social media update with leaderboard scanning...');
    
    const supabase = getSupabaseAdminClient();
    const { data: settings, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'social_auto_update_enabled')
      .single();
    if (error && error.code !== 'PGRST116') {
      console.error('❌ Settings error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to check auto-update settings'
      });
    }
    const isEnabled = settings?.value === 'true';
    if (!isEnabled) {
      return res.json({
        success: true,
        message: 'Auto-update is disabled',
        updated: false
      });
    }
    
    const results = {};
    
    // Update Twitter follower data (existing functionality)
    try {
      const twitterModule = require('./twitter-followers.js');
      if (twitterModule.getTwitterFollowers) {
        const twitterResult = await twitterModule.getTwitterFollowers();
        results.twitter_followers = twitterResult?.success || true;
        console.log('✅ Twitter followers updated');
      } else {
        console.log('⚠️  Twitter followers module not available - continuing with leaderboard');
        results.twitter_followers = false;
      }
    } catch (error) {
      console.error('❌ Twitter followers update failed:', error);
      results.twitter_followers = false;
    }
    
    // Run leaderboard scanning (new functionality)
    try {
      const leaderboardModule = require('./leaderboard-scanner.js');
      const leaderboardResult = await leaderboardModule.runLeaderboardScan();
      results.leaderboard_scan = leaderboardResult.success;
      results.leaderboard_stats = leaderboardResult.stats;
      
      if (leaderboardResult.success) {
        console.log('✅ Leaderboard scan completed successfully');
        console.log(`📊 Stats: ${leaderboardResult.stats?.processedUsers || 0} users, ${leaderboardResult.stats?.totalTweets || 0} tweets`);
      } else {
        console.error('❌ Leaderboard scan failed:', leaderboardResult.error);
      }
    } catch (error) {
      console.error('❌ Leaderboard scan failed:', error);
      results.leaderboard_scan = false;
      results.leaderboard_error = error.message;
    }
    
    console.log('✅ Social media auto-update completed');
    
    res.json({
      success: true,
      message: 'Auto-update completed with leaderboard scanning',
      updated: true,
      lastUpdate: new Date().toISOString(),
      results: results
    });
  } catch (error) {
    console.error('❌ Social auto-update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform auto-update'
    });
  }
});

module.exports = router;

