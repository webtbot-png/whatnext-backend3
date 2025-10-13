const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

// =====================================================
// SUPABASE CONFIGURATION
// =====================================================
const supabaseUrl = process.env.SUPABASE_URL;
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
        const { value, description, category } = req.body;
        
        console.log(`⚙️  Updating config: ${key} = ${value}`);
        
        const { data, error } = await supabase
            .from('leaderboard_config')
            .update({
                config_value: String(value),
                description: description,
                category: category,
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

// =====================================================
// CREATE NEW LEADERBOARD CONFIGURATION (ADMIN)
// =====================================================
router.post('/config', async (req, res) => {
    try {
        const { key, value, description, category, config_type } = req.body;
        
        if (!key || value === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Key and value are required'
            });
        }
        
        console.log(`⚙️  Creating new config: ${key} = ${value}`);
        
        const { data, error } = await supabase
            .from('leaderboard_config')
            .insert({
                config_key: key,
                config_value: String(value),
                config_type: config_type || 'string',
                category: category || 'general',
                description: description,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select();
        
        if (error) throw error;
        
        console.log(`✅ Configuration created: ${key}`);
        
        res.json({
            success: true,
            message: 'Configuration created successfully',
            data: data[0]
        });
        
    } catch (error) {
        console.error(`❌ Config creation error:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to create configuration'
        });
    }
});

// =====================================================
// DELETE LEADERBOARD CONFIGURATION (ADMIN)
// =====================================================
router.delete('/config/:key', async (req, res) => {
    try {
        const { key } = req.params;
        
        console.log(`🗑️  Deleting config: ${key}`);
        
        const { error } = await supabase
            .from('leaderboard_config')
            .delete()
            .eq('config_key', key);
        
        if (error) throw error;
        
        console.log(`✅ Configuration deleted: ${key}`);
        
        res.json({
            success: true,
            message: 'Configuration deleted successfully'
        });
        
    } catch (error) {
        console.error(`❌ Config deletion error for ${req.params.key}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete configuration'
        });
    }
});

// =====================================================
// POPULATE DEFAULT LEADERBOARD CONFIGURATION (ADMIN)
// =====================================================
router.post('/config/populate-defaults', async (req, res) => {
    try {
        console.log('🚀 Populating default leaderboard configuration...');
        
        const defaultConfigs = [
            // Tweet Filtering
            { key: 'filter_good_keywords', value: JSON.stringify(['WNEXTV2', 'WhatNext', 'What Next', '$WNEXT', 'bullish', 'moon', 'gem', 'LFG']), type: 'json', category: 'filtering', description: 'Keywords that indicate good tweets' },
            { key: 'filter_bad_keywords', value: JSON.stringify(['gm', 'wen', 'pump', 'dump', 'scam', 'rug', 'bot', 'spam']), type: 'json', category: 'filtering', description: 'Keywords that indicate bad tweets' },
            { key: 'filter_min_engagement', value: '3', type: 'number', category: 'filtering', description: 'Minimum total engagement (likes + retweets + replies) required' },
            { key: 'filter_min_followers', value: '50', type: 'number', category: 'filtering', description: 'Minimum follower count for user to be eligible' },
            { key: 'filter_require_follow', value: 'true', type: 'boolean', category: 'filtering', description: 'Require users to be followers' },
            { key: 'filter_exclude_retweets', value: 'true', type: 'boolean', category: 'filtering', description: 'Exclude retweets from scoring' },
            { key: 'filter_min_tweet_length', value: '30', type: 'number', category: 'filtering', description: 'Minimum tweet character length' },
            { key: 'filter_max_tweet_age_hours', value: '168', type: 'number', category: 'filtering', description: 'Maximum tweet age in hours (7 days default)' },
            
            // Scoring System
            { key: 'scoring_like_points', value: '1', type: 'number', category: 'scoring', description: 'Points awarded per like' },
            { key: 'scoring_retweet_points', value: '3', type: 'number', category: 'scoring', description: 'Points awarded per retweet' },
            { key: 'scoring_reply_points', value: '2', type: 'number', category: 'scoring', description: 'Points awarded per reply' },
            { key: 'scoring_quote_points', value: '4', type: 'number', category: 'scoring', description: 'Points awarded per quote tweet' },
            { key: 'scoring_keyword_bonus', value: '0.5', type: 'number', category: 'scoring', description: 'Bonus multiplier for each good keyword match' },
            { key: 'scoring_follower_bonus', value: '1.2', type: 'number', category: 'scoring', description: 'Multiplier bonus for followers' },
            { key: 'scoring_quality_weight', value: '0.7', type: 'number', category: 'scoring', description: 'Weight of quality score in final calculation' },
            { key: 'scoring_engagement_weight', value: '0.3', type: 'number', category: 'scoring', description: 'Weight of engagement score in final calculation' },
            
            // Payout Settings
            { key: 'payout_enabled', value: 'true', type: 'boolean', category: 'payouts', description: 'Enable automatic payouts' },
            { key: 'payout_currency', value: 'SOL', type: 'string', category: 'payouts', description: 'Payout currency (SOL, USDC, etc.)' },
            { key: 'payout_rank_1_amount', value: '10', type: 'number', category: 'payouts', description: 'First place payout amount' },
            { key: 'payout_rank_2_amount', value: '5', type: 'number', category: 'payouts', description: 'Second place payout amount' },
            { key: 'payout_rank_3_amount', value: '2', type: 'number', category: 'payouts', description: 'Third place payout amount' },
            { key: 'payout_participation_bonus', value: '0.1', type: 'number', category: 'payouts', description: 'Bonus for all qualifying participants' },
            { key: 'payout_frequency', value: 'weekly', type: 'string', category: 'payouts', description: 'Payout frequency (daily, weekly, monthly)' },
            { key: 'payout_min_score_threshold', value: '10', type: 'number', category: 'payouts', description: 'Minimum score required for payouts' },
            
            // Quality Thresholds
            { key: 'threshold_excellent_score', value: '50', type: 'number', category: 'thresholds', description: 'Score threshold for excellent quality' },
            { key: 'threshold_good_score', value: '20', type: 'number', category: 'thresholds', description: 'Score threshold for good quality' },
            { key: 'threshold_fair_score', value: '10', type: 'number', category: 'thresholds', description: 'Score threshold for fair quality' },
            { key: 'threshold_min_qualifying_tweets', value: '3', type: 'number', category: 'thresholds', description: 'Minimum tweets required to qualify for leaderboard' },
            { key: 'threshold_max_daily_tweets', value: '10', type: 'number', category: 'thresholds', description: 'Maximum tweets counted per day per user' },
            
            // System Settings
            { key: 'system_update_interval_hours', value: '1', type: 'number', category: 'system', description: 'Hours between automatic leaderboard updates' },
            { key: 'system_max_users_displayed', value: '100', type: 'number', category: 'system', description: 'Maximum users shown on public leaderboard' },
            { key: 'system_enable_notifications', value: 'true', type: 'boolean', category: 'system', description: 'Enable Discord/Twitter notifications for winners' },
            { key: 'system_debug_mode', value: 'false', type: 'boolean', category: 'system', description: 'Enable debug logging and verbose output' }
        ];
        
        // Insert all default configurations
        let insertedCount = 0;
        let updatedCount = 0;
        
        for (const config of defaultConfigs) {
            try {
                // Try to update existing config
                const { data: existingConfig } = await supabase
                    .from('leaderboard_config')
                    .select('config_key')
                    .eq('config_key', config.key)
                    .single();
                
                if (existingConfig) {
                    // Update existing
                    const { error: updateError } = await supabase
                        .from('leaderboard_config')
                        .update({
                            config_value: config.value,
                            config_type: config.type,
                            category: config.category,
                            description: config.description,
                            updated_at: new Date().toISOString()
                        })
                        .eq('config_key', config.key);
                    
                    if (!updateError) updatedCount++;
                } else {
                    // Insert new
                    const { error: insertError } = await supabase
                        .from('leaderboard_config')
                        .insert({
                            config_key: config.key,
                            config_value: config.value,
                            config_type: config.type,
                            category: config.category,
                            description: config.description,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });
                    
                    if (!insertError) insertedCount++;
                }
            } catch (configError) {
                console.error(`Error processing config ${config.key}:`, configError);
            }
        }
        
        console.log(`✅ Default configs populated: ${insertedCount} inserted, ${updatedCount} updated`);
        
        res.json({
            success: true,
            message: 'Default configuration populated successfully',
            stats: {
                inserted: insertedCount,
                updated: updatedCount,
                total: defaultConfigs.length
            }
        });
        
    } catch (error) {
        console.error('❌ Failed to populate default configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to populate default configuration'
        });
    }
});

module.exports = router;
