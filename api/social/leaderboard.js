const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

// =====================================================
// SUPABASE CONFIGURATION
// =====================================================
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase configuration for leaderboard API');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// =====================================================
// HEALTH CHECK FOR LEADERBOARD API
// =====================================================
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Leaderboard API is running',
        timestamp: new Date().toISOString(),
        endpoints: ['/', '/user/:username', '/stats', '/refresh']
    });
});

// =====================================================
// GET LEADERBOARD DATA
// =====================================================
router.get('/', async (req, res) => {
    try {
        console.log('📊 Fetching leaderboard data...');
        
        const { 
            limit = 50, 
            offset = 0,
            timeframe = 'all' // all, today, week, month
        } = req.query;
        
        // Base query for engagement scores
        let query = supabase
            .from('engagement_scores')
            .select(`
                twitter_username,
                twitter_display_name,
                current_rank,
                previous_rank,
                rank_change,
                total_tweets,
                total_engagement_score,
                average_quality_score,
                weighted_score,
                is_follower,
                first_tweet_at,
                last_tweet_at,
                last_updated
            `)
            .gte('total_tweets', 1)
            .order('weighted_score', { ascending: false });
        
        // Apply timeframe filtering
        if (timeframe !== 'all') {
            let timeFilter;
            const now = new Date();
            
            switch (timeframe) {
                case 'today':
                    timeFilter = new Date(now.setHours(0, 0, 0, 0)).toISOString();
                    break;
                case 'week':
                    timeFilter = new Date(now.setDate(now.getDate() - 7)).toISOString();
                    break;
                case 'month':
                    timeFilter = new Date(now.setMonth(now.getMonth() - 1)).toISOString();
                    break;
            }
            
            if (timeFilter) {
                query = query.gte('last_tweet_at', timeFilter);
            }
        }
        
        // Apply pagination
        query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
        
        const { data: leaderboard, error } = await query;
        
        if (error) throw error;
        
        // Get total count for pagination
        const { count, error: countError } = await supabase
            .from('engagement_scores')
            .select('*', { count: 'exact', head: true })
            .gte('total_tweets', 1);
        
        if (countError) throw countError;
        
        // Get latest stats
        const { data: stats, error: statsError } = await supabase
            .from('leaderboard_snapshots')
            .select('total_participants, total_tweets_processed, total_engagement, snapshot_timestamp')
            .order('snapshot_timestamp', { ascending: false })
            .limit(1);
        
        if (statsError) console.warn('Stats error:', statsError);
        
        console.log(`✅ Fetched ${leaderboard?.length || 0} leaderboard entries`);
        
        // Return data even if empty (for initial setup)
        res.json({
            success: true,
            data: {
                leaderboard: leaderboard || [],
                pagination: {
                    total: count || 0,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: (parseInt(offset) + parseInt(limit)) < (count || 0)
                },
                stats: stats?.[0] || {
                    total_participants: 0,
                    total_tweets_processed: 0,
                    total_engagement: 0,
                    snapshot_timestamp: new Date().toISOString()
                },
                timeframe: timeframe,
                lastUpdated: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ Leaderboard fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch leaderboard data'
        });
    }
});

// =====================================================
// GET USER DETAILS
// =====================================================
router.get('/user/:username', async (req, res) => {
    try {
        const { username } = req.params;
        console.log(`👤 Fetching user details for @${username}`);
        
        // Get user engagement score
        const { data: userScore, error: scoreError } = await supabase
            .from('engagement_scores')
            .select('*')
            .eq('twitter_username', username)
            .single();
        
        if (scoreError) throw scoreError;
        
        // Get user's recent tweets
        const { data: tweets, error: tweetsError } = await supabase
            .from('twitter_tweets')
            .select(`
                tweet_id,
                tweet_text,
                tweet_url,
                like_count,
                retweet_count,
                reply_count,
                engagement_score,
                quality_score,
                created_at_twitter,
                keyword_matches
            `)
            .eq('author_username', username)
            .eq('processed', true)
            .order('created_at_twitter', { ascending: false })
            .limit(10);
        
        if (tweetsError) throw tweetsError;
        
        console.log(`✅ Found user data for @${username}`);
        
        res.json({
            success: true,
            data: {
                user: userScore,
                recentTweets: tweets
            }
        });
        
    } catch (error) {
        console.error(`❌ User details error for @${req.params.username}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user details'
        });
    }
});

// =====================================================
// GET LEADERBOARD STATISTICS
// =====================================================
router.get('/stats', async (req, res) => {
    try {
        console.log('📈 Fetching leaderboard statistics...');
        
        // Get overall statistics
        const { data: overallStats, error: overallError } = await supabase
            .from('engagement_scores')
            .select(`
                total_tweets.sum(),
                total_engagement_score.sum(),
                weighted_score.sum()
            `)
            .gte('total_tweets', 1);
        
        if (overallError) throw overallError;
        
        // Get user count
        const { count: totalUsers, error: countError } = await supabase
            .from('engagement_scores')
            .select('*', { count: 'exact', head: true })
            .gte('total_tweets', 1);
        
        if (countError) throw countError;
        
        // Get recent activity (last 24 hours)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const { count: recentTweets, error: recentError } = await supabase
            .from('twitter_tweets')
            .select('*', { count: 'exact', head: true })
            .gte('detected_at', yesterday);
        
        if (recentError) throw recentError;
        
        // Get top performers
        const { data: topPerformers, error: topError } = await supabase
            .from('engagement_scores')
            .select('twitter_username, twitter_display_name, weighted_score, current_rank')
            .gte('total_tweets', 1)
            .order('weighted_score', { ascending: false })
            .limit(5);
        
        if (topError) throw topError;
        
        // Get latest snapshot for historical data
        const { data: latestSnapshot, error: snapshotError } = await supabase
            .from('leaderboard_snapshots')
            .select('*')
            .order('snapshot_timestamp', { ascending: false })
            .limit(1);
        
        if (snapshotError) console.warn('Snapshot error:', snapshotError);
        
        console.log('✅ Statistics compiled successfully');
        
        res.json({
            success: true,
            data: {
                overview: {
                    totalUsers: totalUsers,
                    totalTweets: overallStats[0]?.sum || 0,
                    totalEngagement: overallStats[0]?.sum || 0,
                    recentTweets: recentTweets,
                    lastUpdate: latestSnapshot?.[0]?.snapshot_timestamp || null
                },
                topPerformers: topPerformers,
                latestSnapshot: latestSnapshot?.[0] || null
            }
        });
        
    } catch (error) {
        console.error('❌ Statistics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics'
        });
    }
});

// =====================================================
// GET HISTORICAL DATA
// =====================================================
router.get('/history', async (req, res) => {
    try {
        const { days = 7 } = req.query;
        console.log(`📊 Fetching ${days} days of historical data...`);
        
        const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);
        
        const { data: snapshots, error } = await supabase
            .from('leaderboard_snapshots')
            .select('*')
            .gte('snapshot_timestamp', startDate.toISOString())
            .order('snapshot_timestamp', { ascending: true });
        
        if (error) throw error;
        
        console.log(`✅ Found ${snapshots.length} historical snapshots`);
        
        res.json({
            success: true,
            data: {
                snapshots: snapshots,
                period: {
                    days: parseInt(days),
                    startDate: startDate.toISOString(),
                    endDate: new Date().toISOString()
                }
            }
        });
        
    } catch (error) {
        console.error('❌ History fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch historical data'
        });
    }
});

// =====================================================
// MANUAL LEADERBOARD REFRESH (ADMIN ONLY)
// =====================================================
router.post('/refresh', async (req, res) => {
    try {
        console.log('🔄 Manual leaderboard refresh requested...');
        
        // Import and run leaderboard scanner
        const leaderboardModule = require('./leaderboard-scanner.js');
        const result = await leaderboardModule.runLeaderboardScan();
        
        if (result.success) {
            console.log('✅ Manual refresh completed successfully');
            res.json({
                success: true,
                message: 'Leaderboard refreshed successfully',
                stats: result.stats,
                timestamp: new Date().toISOString()
            });
        } else {
            throw new Error(result.error || 'Refresh failed');
        }
        
    } catch (error) {
        console.error('❌ Manual refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to refresh leaderboard'
        });
    }
});

// =====================================================
// GET LEADERBOARD CONFIGURATION (ADMIN)
// =====================================================
router.get('/config', async (req, res) => {
    try {
        console.log('⚙️  Fetching leaderboard configuration...');
        
        const { data: config, error } = await supabase
            .from('leaderboard_config')
            .select('*')
            .order('category, config_key');
        
        if (error) throw error;
        
        // Group by category
        const groupedConfig = config.reduce((acc, item) => {
            const category = item.category || 'general';
            if (!acc[category]) acc[category] = [];
            acc[category].push(item);
            return acc;
        }, {});
        
        res.json({
            success: true,
            data: {
                config: groupedConfig,
                raw: config
            }
        });
        
    } catch (error) {
        console.error('❌ Config fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch configuration'
        });
    }
});

// =====================================================
// UPDATE LEADERBOARD CONFIGURATION (ADMIN)
// =====================================================
router.put('/config/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value, description } = req.body;
        
        console.log(`⚙️  Updating config: ${key} = ${value}`);
        
        const { data, error } = await supabase
            .from('leaderboard_config')
            .update({
                config_value: String(value),
                description: description,
                updated_at: new Date().toISOString()
            })
            .eq('config_key', key)
            .select();
        
        if (error) throw error;
        
        console.log(`✅ Configuration updated: ${key}`);
        
        res.json({
            success: true,
            message: 'Configuration updated successfully',
            data: data[0]
        });
        
    } catch (error) {
        console.error(`❌ Config update error for ${req.params.key}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to update configuration'
        });
    }
});

module.exports = router;
