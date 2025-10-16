const { createClient } = require('@supabase/supabase-js');

// =====================================================
// SOCIAL ENGAGEMENT LEADERBOARD SCANNER
// =====================================================
// Extends existing Twitter API system for engagement tracking
// Integrates with social_media_stats and auto-update system

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase configuration for leaderboard scanner');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// =====================================================
// TWITTER API V2 CONFIGURATION
// =====================================================
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const TWITTER_API_BASE = 'https://api.twitter.com/2';

if (!TWITTER_BEARER_TOKEN) {
    console.error('❌ Missing Twitter Bearer Token for leaderboard scanner');
    process.exit(1);
}

// Rate limiting configuration (Twitter API v2: 75 requests per 15 minutes)
const RATE_LIMIT = {
    maxRequests: 70, // Stay under limit
    windowMs: 15 * 60 * 1000, // 15 minutes
    requestQueue: [],
    lastReset: Date.now()
};

// =====================================================
// CONFIGURATION MANAGEMENT
// =====================================================
async function getLeaderboardConfig() {
    try {
        const { data, error } = await supabase
            .from('leaderboard_config')
            .select('config_key, config_value, config_type');
        
        if (error) throw error;
        
        const config = {};
        for (const item of data) {
            let value = item.config_value;
            
            // Parse based on type
            if (item.config_type === 'number') {
                value = Number.parseFloat(value);
            } else if (item.config_type === 'boolean') {
                value = value.toLowerCase() === 'true';
            } else if (item.config_type === 'json') {
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    console.warn(`⚠️  Failed to parse JSON config ${item.config_key}:`, e.message);
                }
            }
            
            config[item.config_key] = value;
        }
        
        return config;
    } catch (error) {
        console.error('❌ Failed to load leaderboard configuration:', error);
        return getDefaultConfig();
    }
}

function getDefaultConfig() {
    return {
        scoring_like_points: 1,
        scoring_retweet_points: 3,
        scoring_reply_points: 2,
        scoring_quote_points: 4,
        scoring_keyword_bonus: 0.5,
        scoring_follower_bonus: 1.2,
        scoring_quality_weight: 0.7,
        scoring_engagement_weight: 0.3,
        filter_min_followers: 50,
        filter_require_follow: true,
        filter_exclude_retweets: true,
        filter_min_engagement: 3,
        filter_min_tweet_length: 30,
        filter_max_tweet_age_hours: 168,
        filter_good_keywords: ['WNEXTV2', 'WhatNext', 'What Next', '$WNEXT', 'bullish', 'moon', 'gem', 'LFG'],
        filter_bad_keywords: ['gm', 'wen', 'pump', 'dump', 'scam', 'rug', 'bot', 'spam'],
        payout_enabled: true,
        payout_currency: 'SOL',
        payout_rank_1_amount: 10,
        payout_rank_2_amount: 5,
        payout_rank_3_amount: 2,
        payout_participation_bonus: 0.1,
        payout_frequency: 'weekly',
        payout_min_score_threshold: 10,
        threshold_excellent_score: 50,
        threshold_good_score: 20,
        threshold_fair_score: 10,
        threshold_min_qualifying_tweets: 3,
        threshold_max_daily_tweets: 10,
        system_update_interval_hours: 1,
        system_max_users_displayed: 100,
        system_enable_notifications: true,
        system_debug_mode: false,
        leaderboard_max_display: 50,
        leaderboard_min_tweets: 1,
        update_enabled: true,
        debug_mode: false
    };
}

// =====================================================
// TWITTER API REQUEST HANDLER WITH RATE LIMITING
// =====================================================
async function makeTwitterRequest(url, params = {}) {
    // Check rate limiting
    const now = Date.now();
    if (now - RATE_LIMIT.lastReset > RATE_LIMIT.windowMs) {
        RATE_LIMIT.requestQueue = [];
        RATE_LIMIT.lastReset = now;
    }
    
    if (RATE_LIMIT.requestQueue.length >= RATE_LIMIT.maxRequests) {
        const waitTime = RATE_LIMIT.windowMs - (now - RATE_LIMIT.lastReset);
        console.log(`⏳ Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        RATE_LIMIT.requestQueue = [];
        RATE_LIMIT.lastReset = Date.now();
    }
    
    try {
        const queryParams = new URLSearchParams(params);
        const fullUrl = `${url}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        
        const response = await fetch(fullUrl, {
            headers: {
                'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        RATE_LIMIT.requestQueue.push(now);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Twitter API error ${response.status}: ${errorText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('❌ Twitter API request failed:', error);
        throw error;
    }
}

// =====================================================
// FOLLOWER LIST MANAGEMENT
// =====================================================
async function getFollowersList(config) {
    try {
        console.log('📋 Fetching current followers list...');
        
        // Get our main account ID from social_media_stats
        const { data: socialStats, error: statsError } = await supabase
            .from('social_media_stats')
            .select('raw_response')
            .eq('platform', 'twitter')
            .order('updated_at', { ascending: false })
            .limit(1);
        
        if (statsError || !socialStats.length) {
            console.warn('⚠️  No Twitter data found in social_media_stats');
            return [];
        }
        
        const twitterData = socialStats[0].raw_response;
        const accountId = twitterData?.data?.id;
        
        if (!accountId) {
            console.warn('⚠️  No Twitter account ID found');
            return [];
        }
        
        // Fetch followers using Twitter API v2
        const followers = [];
        let nextToken = null;
        
        do {
            const params = {
                'user.fields': 'username,name,public_metrics,verified',
                'max_results': '1000' // Maximum allowed
            };
            
            if (nextToken) {
                params.pagination_token = nextToken;
            }
            
            const response = await makeTwitterRequest(
                `${TWITTER_API_BASE}/users/${accountId}/followers`,
                params
            );
            
            if (response.data) {
                followers.push(...response.data);
            }
            
            nextToken = response.meta?.next_token;
            
            // Add delay between requests
            if (nextToken) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
        } while (nextToken && followers.length < 10000); // Reasonable limit
        
        console.log(`✅ Found ${followers.length} followers`);
        return followers;
        
    } catch (error) {
        console.error('❌ Failed to fetch followers list:', error);
        return [];
    }
}

// =====================================================
// TWEET DETECTION AND PROCESSING
// =====================================================
async function scanUserTweets(username, config, isFollower = false) {
    try {
        // Get user info first
        const userResponse = await makeTwitterRequest(
            `${TWITTER_API_BASE}/users/by/username/${username}`,
            {
                'user.fields': 'id,name,public_metrics,verified'
            }
        );
        
        if (!userResponse.data) {
            console.log(`⚠️  User @${username} not found or private`);
            return [];
        }
        
        const user = userResponse.data;
        
        // Check minimum followers requirement
        if (config.filter_min_followers > 0 && 
            user.public_metrics?.followers_count < config.filter_min_followers) {
            console.log(`⚠️  @${username} has insufficient followers (${user.public_metrics?.followers_count})`);
            return [];
        }
        
        // Fetch recent tweets (last 24 hours for hourly updates)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const tweetsResponse = await makeTwitterRequest(
            `${TWITTER_API_BASE}/users/${user.id}/tweets`,
            {
                'tweet.fields': 'created_at,public_metrics,context_annotations,lang,referenced_tweets',
                'max_results': '100',
                'start_time': oneDayAgo,
                'exclude': config.filter_exclude_retweets ? 'retweets' : ''
            }
        );
        
        if (!tweetsResponse.data) {
            return [];
        }
        
        const projectTweets = [];
        
        for (const tweet of tweetsResponse.data) {
            const tweetAnalysis = analyzeTweet(tweet, config);
            
            if (tweetAnalysis.mentionsProject) {
                projectTweets.push({
                    ...tweet,
                    analysis: tweetAnalysis,
                    author: {
                        id: user.id,
                        username: user.username,
                        name: user.name,
                        isFollower: isFollower,
                        follower_count: user.public_metrics?.followers_count || 0
                    }
                });
            }
        }
        
        console.log(`📊 @${username}: ${projectTweets.length} project tweets found`);
        return projectTweets;
        
    } catch (error) {
        console.error(`❌ Failed to scan tweets for @${username}:`, error);
        return [];
    }
}

// =====================================================
// TWEET ANALYSIS AND SCORING
// =====================================================
function analyzeTweet(tweet, config) {
    const text = tweet.text.toLowerCase();
    
    // Parse keyword arrays from config (they may be JSON strings)
    let goodKeywords, badKeywords;
    try {
        goodKeywords = Array.isArray(config.filter_good_keywords) 
            ? config.filter_good_keywords 
            : JSON.parse(config.filter_good_keywords || '[]');
        badKeywords = Array.isArray(config.filter_bad_keywords) 
            ? config.filter_bad_keywords 
            : JSON.parse(config.filter_bad_keywords || '[]');
    } catch (e) {
        // Fallback to default keywords if parsing fails
        console.error('Error parsing keywords configuration:', e.message);
        goodKeywords = ['WXT', 'WhatNext', 'What Next', '$WXT', 'bullish', 'moon', 'gem', 'LFG'];
        badKeywords = ['gm', 'wen', 'pump', 'dump', 'scam', 'rug', 'bot', 'spam'];
    }
    
    const goodKeywordsLower = goodKeywords.map(k => k.toLowerCase());
    const badKeywordsLower = badKeywords.map(k => k.toLowerCase());
    
    // Check for project mentions (good keywords)
    const goodMatches = goodKeywordsLower.filter(keyword => text.includes(keyword));
    const mentionsProject = goodMatches.length > 0;
    
    if (!mentionsProject) {
        return { 
            mentionsProject: false, 
            score: 0, 
            isValidTweet: false,
            badKeywordMatches: [],
            filterReason: 'No project mention'
        };
    }
    
    // Check for bad keywords (spam filter)
    const badMatches = badKeywordsLower.filter(keyword => text.includes(keyword));
    const hasBadContent = badMatches.length > 0;
    
    // Filter out tweets that are too short
    if (tweet.text.length < (config.filter_min_tweet_length || 30)) {
        return { 
            mentionsProject: false, 
            score: 0, 
            isValidTweet: false, 
            reason: 'Too short',
            badKeywordMatches: [],
            filterReason: 'Too short'
        };
    }
    
    // Calculate engagement score
    const metrics = tweet.public_metrics || {};
    const totalEngagement = (metrics.like_count || 0) + (metrics.retweet_count || 0) + (metrics.reply_count || 0);
    
    // Check minimum engagement requirement
    if (totalEngagement < (config.filter_min_engagement || 3)) {
        return { 
            mentionsProject: false, 
            score: 0, 
            isValidTweet: false, 
            reason: 'Low engagement',
            badKeywordMatches: [],
            filterReason: 'Low engagement'
        };
    }
    
    const engagementScore = 
        (metrics.like_count || 0) * (config.scoring_like_points || 1) +
        (metrics.retweet_count || 0) * (config.scoring_retweet_points || 3) +
        (metrics.reply_count || 0) * (config.scoring_reply_points || 2) +
        (metrics.quote_count || 0) * (config.scoring_quote_points || 4);
    
    // Calculate quality score based on content
    let qualityScore = 1; // Base score
    
    // Penalty for bad keywords
    if (hasBadContent) {
        qualityScore -= badMatches.length * 0.5; // Significant penalty
    }
    
    // Bonus for good keyword matches
    qualityScore += goodMatches.length * (config.scoring_keyword_bonus || 0.5);
    
    // Length-based scoring
    if (tweet.text.length > 100) qualityScore += 0.3;
    if (tweet.text.length > 200) qualityScore += 0.2;
    
    // Penalty for very short tweets (but still above minimum)
    if (tweet.text.length < 50) qualityScore -= 0.2;
    
    // Bonus for original content (not replies)
    if (!tweet.referenced_tweets?.some(ref => ref.type === 'replied_to')) {
        qualityScore += 0.3;
    }
    
    // Check if tweet passes quality thresholds
    const minQualityScore = config.threshold_fair_score || 10;
    const finalScore = engagementScore * qualityScore;
    const isValidTweet = !hasBadContent && finalScore >= minQualityScore;
    
    return {
        mentionsProject: true,
        isValidTweet: isValidTweet,
        engagementScore: engagementScore,
        qualityScore: Math.max(0.1, Math.min(5, qualityScore)), // Clamp between 0.1 and 5
        finalScore: finalScore,
        keywordMatches: goodMatches,
        badMatches: badMatches,
        badKeywordMatches: badMatches,
        filterReason: isValidTweet ? 'Valid' : 'Failed quality check',
        metrics: metrics,
        reason: isValidTweet ? 'Valid' : 'Failed quality check'
    };
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================
async function saveTweetToDatabase(tweet, analysis) {
    try {
        const tweetData = {
            tweet_id: tweet.id,
            author_username: tweet.author.username,
            author_display_name: tweet.author.name,
            author_id: tweet.author.id,
            tweet_text: tweet.text,
            tweet_url: `https://twitter.com/${tweet.author.username}/status/${tweet.id}`,
            mentions_project: analysis.mentionsProject,
            contains_keywords: analysis.keywordMatches.length > 0,
            keyword_matches: analysis.keywordMatches,
            like_count: analysis.metrics.like_count || 0,
            retweet_count: analysis.metrics.retweet_count || 0,
            reply_count: analysis.metrics.reply_count || 0,
            quote_count: analysis.metrics.quote_count || 0,
            engagement_score: analysis.engagementScore,
            quality_score: analysis.qualityScore,
            created_at_twitter: tweet.created_at,
            language: tweet.lang || 'unknown',
            is_retweet: tweet.referenced_tweets?.some(ref => ref.type === 'retweeted') || false,
            is_reply: tweet.referenced_tweets?.some(ref => ref.type === 'replied_to') || false,
            processed: true,
            filter_reason: analysis.filterReason || null,
            bad_keyword_matches: analysis.badKeywordMatches || [],
            detected_at: new Date().toISOString(),
            raw_tweet_data: tweet
        };
        
        const { error } = await supabase
            .from('twitter_tweets')
            .upsert(tweetData, { 
                onConflict: 'tweet_id',
                ignoreDuplicates: false 
            });
        
        if (error) throw error;
        
        return true;
    } catch (error) {
        console.error('❌ Failed to save tweet to database:', error);
        return false;
    }
}

async function updateEngagementScores() {
    try {
        console.log('📊 Updating engagement scores...');
        
        // Get all users with valid tweets only
        const { data: tweetUsers, error: tweetsError } = await supabase
            .from('twitter_tweets')
            .select(`
                author_username,
                author_display_name,
                author_id,
                engagement_score,
                quality_score,
                final_score,
                is_valid_tweet,
                created_at_twitter
            `)
            .eq('processed', true)
            .eq('is_valid_tweet', true);
        
        if (tweetsError) throw tweetsError;
        
        // Group by user and calculate aggregated scores
        const userStats = {};
        
        for (const tweet of tweetUsers) {
            const username = tweet.author_username;
            
            if (!userStats[username]) {
                userStats[username] = {
                    username: username,
                    display_name: tweet.author_display_name,
                    user_id: tweet.author_id,
                    tweets: [],
                    totalEngagement: 0,
                    totalQuality: 0,
                    firstTweet: tweet.created_at_twitter,
                    lastTweet: tweet.created_at_twitter
                };
            }
            
            const stats = userStats[username];
            stats.tweets.push(tweet);
            stats.totalEngagement += tweet.engagement_score || 0;
            stats.totalQuality += tweet.quality_score || 0;
            
            if (new Date(tweet.created_at_twitter) < new Date(stats.firstTweet)) {
                stats.firstTweet = tweet.created_at_twitter;
            }
            if (new Date(tweet.created_at_twitter) > new Date(stats.lastTweet)) {
                stats.lastTweet = tweet.created_at_twitter;
            }
        }
        
        // Update engagement_scores table
        for (const [username, stats] of Object.entries(userStats)) {
            const avgQuality = stats.totalQuality / stats.tweets.length;
            const weightedScore = stats.totalEngagement * avgQuality;
            
            const scoreData = {
                twitter_username: username,
                twitter_display_name: stats.display_name,
                twitter_user_id: stats.user_id,
                total_tweets: stats.tweets.length,
                qualifying_tweets: stats.tweets.length,
                total_engagement_score: stats.totalEngagement,
                average_quality_score: avgQuality,
                weighted_score: weightedScore,
                first_tweet_at: stats.firstTweet,
                last_tweet_at: stats.lastTweet
            };
            
            await supabase
                .from('engagement_scores')
                .upsert(scoreData, { 
                    onConflict: 'twitter_username',
                    ignoreDuplicates: false 
                });
        }
        
        console.log(`✅ Updated scores for ${Object.keys(userStats).length} users`);
        return true;
        
    } catch (error) {
        console.error('❌ Failed to update engagement scores:', error);
        return false;
    }
}

async function calculateLeaderboardRankings() {
    try {
        console.log('🏆 Calculating leaderboard rankings...');
        
        // Get all users ordered by weighted score
        const { data: users, error } = await supabase
            .from('engagement_scores')
            .select('*')
            .gte('total_tweets', 1) // Must have at least 1 tweet
            .order('weighted_score', { ascending: false });
        
        if (error) throw error;
        
        // Update rankings
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const newRank = i + 1;
            const previousRank = user.current_rank;
            const rankChange = previousRank ? previousRank - newRank : 0;
            
            await supabase
                .from('engagement_scores')
                .update({
                    previous_rank: previousRank,
                    current_rank: newRank,
                    rank_change: rankChange
                })
                .eq('id', user.id);
        }
        
        console.log(`✅ Rankings updated for ${users.length} users`);
        return users.slice(0, 50); // Return top 50 for snapshot
        
    } catch (error) {
        console.error('❌ Failed to calculate rankings:', error);
        return [];
    }
}

async function saveLeaderboardSnapshot(leaderboardData) {
    try {
        const now = new Date();
        const snapshotData = {
            snapshot_date: now.toISOString().split('T')[0],
            snapshot_hour: now.getHours(),
            snapshot_timestamp: now.toISOString(),
            leaderboard_data: leaderboardData,
            total_participants: leaderboardData.length,
            total_tweets_processed: leaderboardData.reduce((sum, user) => sum + user.total_tweets, 0),
            total_engagement: leaderboardData.reduce((sum, user) => sum + user.total_engagement_score, 0)
        };
        
        const { error } = await supabase
            .from('leaderboard_snapshots')
            .upsert(snapshotData, { 
                onConflict: 'snapshot_date,snapshot_hour',
                ignoreDuplicates: false 
            });
        
        if (error) throw error;
        
        console.log(`✅ Leaderboard snapshot saved for ${now.toISOString()}`);
        return true;
        
    } catch (error) {
        console.error('❌ Failed to save leaderboard snapshot:', error);
        return false;
    }
}

// =====================================================
// MAIN SCANNING FUNCTION
// =====================================================
// =====================================================
// HELPER FUNCTIONS FOR SCAN PROCESS
// =====================================================

async function validateScanConfiguration() {
    const config = await getLeaderboardConfig();
    
    if (!config.update_enabled) {
        console.log('⏸️  Leaderboard updates are disabled');
        return { valid: false, reason: 'Updates disabled' };
    }
    
    console.log('📋 Configuration loaded:', {
        scoring: {
            likes: config.scoring_like_points,
            retweets: config.scoring_retweet_points,
            replies: config.scoring_reply_points
        },
        filters: {
            minFollowers: config.filter_min_followers,
            requireFollow: config.filter_require_follow
        }
    });
    
    return { valid: true, config };
}

async function processFollowerBatch(batch, config) {
    let batchTweets = 0;
    let batchUsers = 0;
    
    for (const follower of batch) {
        try {
            const tweets = await scanUserTweets(follower.username, config, true);
            
            for (const tweet of tweets) {
                const saved = await saveTweetToDatabase(tweet, tweet.analysis);
                if (saved) batchTweets++;
            }
            
            batchUsers++;
            
            // Rate limiting delay
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.error(`❌ Error processing @${follower.username}:`, error);
        }
    }
    
    return { tweets: batchTweets, users: batchUsers };
}

async function scanFollowerTweets(followers, config) {
    let totalTweets = 0;
    let processedUsers = 0;
    
    if (followers.length === 0) {
        console.warn('⚠️  No followers found - continuing with existing data');
        return { totalTweets, processedUsers };
    }
    
    const batchSize = 10;
    
    for (let i = 0; i < followers.length; i += batchSize) {
        const batch = followers.slice(i, i + batchSize);
        const batchResult = await processFollowerBatch(batch, config);
        
        totalTweets += batchResult.tweets;
        processedUsers += batchResult.users;
        
        const batchNumber = Math.floor(i/batchSize) + 1;
        const totalBatches = Math.ceil(followers.length/batchSize);
        
        console.log(`📊 Processed batch ${batchNumber}/${totalBatches} (${processedUsers} users, ${totalTweets} tweets)`);
        
        // Longer delay between batches
        if (i + batchSize < followers.length) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    return { totalTweets, processedUsers };
}

async function finalizeLeaderboardUpdate(leaderboard) {
    await updateEngagementScores();
    await saveLeaderboardSnapshot(leaderboard);
    
    // Update last run timestamp
    await supabase
        .from('leaderboard_config')
        .upsert({
            config_key: 'update_last_run',
            config_value: new Date().toISOString(),
            config_type: 'string',
            description: 'Timestamp of last successful update'
        }, { onConflict: 'config_key' });
}

async function runLeaderboardScan() {
    const startTime = Date.now();
    console.log('🏆 Starting Social Engagement Leaderboard Scan...');
    
    try {
        // Validate configuration
        const configResult = await validateScanConfiguration();
        if (!configResult.valid) {
            return { success: false, reason: configResult.reason };
        }
        
        const { config } = configResult;
        
        // Get followers list
        const followers = await getFollowersList(config);
        
        // Scan tweets from followers
        const scanResult = await scanFollowerTweets(followers, config);
        
        // Update engagement scores and rankings
        const leaderboard = await calculateLeaderboardRankings();
        await finalizeLeaderboardUpdate(leaderboard);
        
        const duration = Date.now() - startTime;
        
        console.log('🎉 Leaderboard scan completed successfully!');
        console.log(`📊 Summary:
        • Processed Users: ${scanResult.processedUsers}
        • New Tweets: ${scanResult.totalTweets}
        • Leaderboard Size: ${leaderboard.length}
        • Duration: ${Math.round(duration/1000)}s`);
        
        return {
            success: true,
            stats: {
                processedUsers: scanResult.processedUsers,
                totalTweets: scanResult.totalTweets,
                leaderboardSize: leaderboard.length,
                duration
            }
        };
        
    } catch (error) {
        console.error('❌ Leaderboard scan failed:', error);
        return { success: false, error: error.message };
    }
}

// =====================================================
// MODULE EXPORTS
// =====================================================
module.exports = {
    runLeaderboardScan,
    getLeaderboardConfig,
    scanUserTweets,
    analyzeTweet,
    updateEngagementScores,
    calculateLeaderboardRankings
};

// =====================================================
// DIRECT EXECUTION SUPPORT
// =====================================================
if (require.main === module) {
    try {
        const result = await runLeaderboardScan();
        console.log('Final result:', result);
        process.exit(result.success ? 0 : 1);
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}
