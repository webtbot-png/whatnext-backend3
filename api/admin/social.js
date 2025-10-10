const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const jwt = require('jsonwebtoken');


const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.substring(7);
  jwt.verify(token, JWT_SECRET);
}

// GET /api/admin/social/config
router.get('/config', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { data: twitterConfig, error: twitterError } = await supabase
      .from('social_config')
      .select('*')
      .eq('platform', 'twitter')
      .single();
    if (twitterError && twitterError.code !== 'PGRST116') {
      console.error('Error fetching Twitter config:', twitterError);
    }
    const { data: followerData, error: followerError } = await supabase
      .from('twitter_followers')
      .select('follower_count, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    if (followerError && followerError.code !== 'PGRST116') {
      console.error('Error fetching follower data:', followerError);
    }
    res.json({
      success: true,
      config: {
        twitter: {
          username: twitterConfig?.username || process.env.TWITTER_USERNAME || '',
          bearer_token_set: !!(twitterConfig?.bearer_token || process.env.TWITTER_BEARER_TOKEN),
          auto_fetch_enabled: twitterConfig?.auto_fetch_enabled || false,
          fetch_interval_minutes: twitterConfig?.fetch_interval_minutes || 60,
          current_followers: followerData?.follower_count || 0,
          last_updated: followerData?.updated_at || null
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error fetching social config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/social/config
router.post('/config', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { twitter_username, twitter_bearer_token, auto_fetch_enabled = false, fetch_interval_minutes = 60 } = req.body;
    if (!twitter_username && !twitter_bearer_token) {
      return res.status(400).json({ error: 'At least Twitter username or bearer token must be provided' });
    }
    if (fetch_interval_minutes && (fetch_interval_minutes < 5 || fetch_interval_minutes > 1440)) {
      return res.status(400).json({ error: 'Fetch interval must be between 5 and 1440 minutes' });
    }
    const configData = {
      platform: 'twitter',
      username: twitter_username,
      bearer_token: twitter_bearer_token,
      auto_fetch_enabled,
      fetch_interval_minutes,
      updated_at: new Date().toISOString()
    };
    const { data: existing } = await supabase
      .from('social_config')
      .select('id')
      .eq('platform', 'twitter')
      .single();
    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('social_config')
        .update(configData)
        .eq('platform', 'twitter')
        .select()
        .single();
      if (error) {
        console.error('Error updating social config:', error);
        return res.status(500).json({ error: 'Failed to update configuration' });
      }
      result = data;
    } else {
      const { data, error } = await supabase
        .from('social_config')
        .insert({ ...configData, created_at: new Date().toISOString() })
        .select()
        .single();
      if (error) {
        console.error('Error creating social config:', error);
        return res.status(500).json({ error: 'Failed to create configuration' });
      }
      result = data;
    }
    res.json({
      success: true,
      message: 'Social media configuration updated successfully',
      config: {
        twitter: {
          username: result.username,
          bearer_token_set: !!result.bearer_token,
          auto_fetch_enabled: result.auto_fetch_enabled,
          fetch_interval_minutes: result.fetch_interval_minutes
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error updating social config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/social/test-twitter
router.post('/test-twitter', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { bearer_token, username } = req.body;
    if (!bearer_token || !username) {
      return res.status(400).json({ error: 'Bearer token and username are required for testing' });
    }
    const twitterUrl = `https://api.twitter.com/2/users/by/username/${username}?user.fields=public_metrics`;
    const response = await fetch(twitterUrl, {
      headers: {
        'Authorization': `Bearer ${bearer_token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      const errorData = await response.text();
      console.error('Twitter API test failed:', errorData);
      return res.status(400).json({ error: 'Twitter API test failed', details: errorData });
    }
    const data = await response.json();
    const followerCount = data.data?.public_metrics?.followers_count || 0;
    res.json({
      success: true,
      message: 'Twitter API connection successful',
      test_result: {
        username: data.data?.username,
        name: data.data?.name,
        follower_count: followerCount,
        verified: data.data?.verified || false
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error testing Twitter API:', error);
    res.status(500).json({ error: 'Failed to test Twitter API connection', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// POST /api/admin/social/refresh-followers
router.post('/refresh-followers', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { data: config, error: configError } = await supabase
      .from('social_config')
      .select('username, bearer_token')
      .eq('platform', 'twitter')
      .single();
    if (configError || !config?.username || !config?.bearer_token) {
      return res.status(400).json({ error: 'Twitter configuration not found or incomplete' });
    }
    const twitterUrl = `https://api.twitter.com/2/users/by/username/${config.username}?user.fields=public_metrics`;
    const response = await fetch(twitterUrl, {
      headers: {
        'Authorization': `Bearer ${config.bearer_token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      const errorData = await response.text();
      console.error('Twitter API request failed:', errorData);
      return res.status(500).json({ error: 'Failed to fetch follower count from Twitter API' });
    }
    const data = await response.json();
    const followerCount = data.data?.public_metrics?.followers_count || 0;
    const { error: insertError } = await supabase
      .from('twitter_followers')
      .insert({
        username: config.username,
        follower_count: followerCount,
        updated_at: new Date().toISOString()
      });
    if (insertError) {
      console.error('Error saving follower count:', insertError);
      return res.status(500).json({ error: 'Failed to save follower count' });
    }
    res.json({
      success: true,
      message: 'Follower count refreshed successfully',
      data: {
        username: config.username,
        follower_count: followerCount,
        updated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error refreshing followers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/social/stats
router.get('/stats', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { count: totalTweets, error: tweetsError } = await supabase
      .from('community_tweets')
      .select('*', { count: 'exact', head: true });
    if (tweetsError) {
      console.error('Error fetching tweets count:', tweetsError);
    }
    const { count: approvedTweets, error: approvedError } = await supabase
      .from('community_tweets')
      .select('*', { count: 'exact', head: true })
      .eq('approved', true);
    if (approvedError) {
      console.error('Error fetching approved tweets:', approvedError);
    }
    const { data: followerData, error: followerError } = await supabase
      .from('twitter_followers')
      .select('follower_count, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    if (followerError && followerError.code !== 'PGRST116') {
      console.error('Error fetching follower data:', followerError);
    }
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: weekAgoData, error: growthError } = await supabase
      .from('twitter_followers')
      .select('follower_count')
      .lte('updated_at', weekAgo.toISOString())
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    if (growthError && growthError.code !== 'PGRST116') {
      console.error('Error fetching growth data:', growthError);
    }
    const currentFollowers = followerData?.follower_count || 0;
    const weekAgoFollowers = weekAgoData?.follower_count || currentFollowers;
    const weeklyGrowth = currentFollowers - weekAgoFollowers;
    res.json({
      success: true,
      stats: {
        community_tweets: {
          total: totalTweets || 0,
          approved: approvedTweets || 0,
          pending: (totalTweets || 0) - (approvedTweets || 0)
        },
        twitter_followers: {
          current: currentFollowers,
          weekly_growth: weeklyGrowth,
          last_updated: followerData?.updated_at || null
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error fetching social stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

