const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const router = express.Router();

function getApiConfig() {
  return {
    bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
    enabled: process.env.TWITTER_API_ENABLED === 'true',
    username: process.env.TWITTER_USERNAME || 'WhatNextStream'
  };
}

async function fetchTwitterUserData(username, bearerToken) {
  const supabase = getSupabaseAdminClient();
  const { data: recentCall } = await supabase
    .from('social_media_stats')
    .select('last_updated')
    .eq('api_source', 'twitter_api_v2_oauth2')
    .order('last_updated', { ascending: false })
    .limit(1)
    .single();
  if (recentCall) {
    const lastUpdate = new Date(recentCall.last_updated);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (lastUpdate > fiveMinutesAgo) {
      console.log(' [Rate Limit] Skipping API call - last call was', lastUpdate);
      throw new Error('Rate limited - using cached data (recent API call detected)');
    }
  }
  const userUrl = `https://api.twitter.com/2/users/by/username/${username}?user.fields=public_metrics,verified,verified_type,created_at`;
  const userResponse = await fetch(userUrl, {
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
      'User-Agent': 'WhatNext-FollowerTracker-v2.0'
    }
  });
  console.log(` [User API] Response status: ${userResponse.status}`);
  if (userResponse.status === 401) {
    throw new Error('Invalid Bearer Token or insufficient app permissions');
  }
  if (userResponse.status === 403) {
    throw new Error('App permissions insufficient - need Read access');
  }
  if (userResponse.status === 429) {
    throw new Error('Rate limited - try again later');
  }
  if (!userResponse.ok) {
    await userResponse.text();
    throw new Error(`API error: ${userResponse.status}`);
  }
  return await userResponse.json();
}

async function processTwitterData(userData, username) {
  if (!userData.data?.public_metrics?.followers_count) {
    throw new Error('Unexpected API response format');
  }
  const supabase = getSupabaseAdminClient();
  const followers = userData.data.public_metrics.followers_count;
  const following = userData.data.public_metrics.following_count;
  const tweetCount = userData.data.public_metrics.tweet_count;
  const likeCount = userData.data.public_metrics.like_count;
  console.log(` [SUCCESS] Real follower count: ${followers} for @${username}`);
  await supabase
    .from('social_media_stats')
    .upsert({
      platform: 'twitter',
      username: username,
      user_id: userData.data.id,
      follower_count: followers,
      following_count: following,
      tweet_count: tweetCount,
      like_count: likeCount,
      verified: userData.data.verified || false,
      verified_type: userData.data.verified_type || null,
      last_updated: new Date().toISOString(),
      api_source: 'twitter_api_v2_oauth2',
      raw_response: userData
    });
  await supabase
    .from('app_settings')
    .upsert({
      key: 'community_members',
      value: followers.toString(),
      description: `Auto-updated from Twitter API on ${new Date().toLocaleDateString()} - @${username}`,
      updated_at: new Date().toISOString()
    });
  return {
    success: true,
    followers,
    following,
    tweets: tweetCount,
    likes: likeCount,
    verified: userData.data.verified,
    verified_type: userData.data.verified_type,
    username: userData.data.username || username,
    lastUpdated: new Date().toISOString(),
    source: 'twitter_api_v2_oauth2',
    realData: true,
    message: `Real-time follower count: ${followers} followers`
  };
}

async function getStoredData(username) {
  const supabase = getSupabaseAdminClient();
  const { data: socialStats } = await supabase
    .from('social_media_stats')
    .select('follower_count, following_count, tweet_count, like_count, verified, verified_type, last_updated, api_source')
    .eq('platform', 'twitter')
    .order('last_updated', { ascending: false })
    .limit(1);
  if (socialStats && socialStats.length > 0) {
    const stat = socialStats[0];
    console.log(` [Stored] Using cached count: ${stat.follower_count} from ${stat.api_source}`);
    return {
      success: true,
      followers: stat.follower_count,
      following: stat.following_count || 0,
      tweets: stat.tweet_count || 0,
      likes: stat.like_count || 0,
      verified: stat.verified || false,
      verified_type: stat.verified_type || null,
      username,
      lastUpdated: stat.last_updated || new Date().toISOString(),
      source: `cached_${stat.api_source || 'stored_data'}`,
      realData: (stat.api_source || '').includes('api'),
      message: (stat.api_source || '').includes('api') ? 
        `Cached real data: ${stat.follower_count} followers (API unavailable)` : 
        `Last known count: ${stat.follower_count} followers`
    };
  }
  return null;
}

router.get('/', async (req, res) => {
  console.log(' [Twitter Followers] Starting REAL follower count fetch...');
  const config = getApiConfig();
  const { bearerToken, enabled, username } = config;
  console.log(` [Config] Username: @${username}, API Enabled: ${enabled}, Has Bearer Token: ${!!bearerToken}`);
  const isCheck = req.query.check === 'true';

  async function handleApiCheckError(apiError) {
    const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown API error';
    return res.status(400).json({
      success: false,
      error: errorMessage,
      message: 'Twitter API check failed. Check your Bearer Token and app permissions.',
      troubleshooting: {
        step1: 'Verify your Twitter Developer App has "Read" permissions',
        step2: 'Check that TWITTER_BEARER_TOKEN is correct in your .env file',
        step3: 'Ensure TWITTER_API_ENABLED=true in your .env file',
        step4: 'Visit https://developer.twitter.com/en/portal/dashboard to check your app'
      }
    });
  }

  async function handleNoApiConfigured() {
    return res.status(400).json({
      success: false,
      error: 'Twitter API not configured',
      message: 'Please set up your Twitter Bearer Token in .env file',
      required: {
        TWITTER_BEARER_TOKEN: 'Your Twitter App Bearer Token',
        TWITTER_API_ENABLED: 'true',
        TWITTER_USERNAME: 'WhatNextStream'
      }
    });
  }

  async function handleNoData(username) {
    return res.status(503).json({
      success: false,
      followers: 0,
      username,
      lastUpdated: new Date().toISOString(),
      source: 'no_data_available',
      realData: false,
      message: 'Twitter API not configured and no cached data available',
      setup: {
        message: 'Set up Twitter API for real-time follower tracking',
        steps: [
          'Get Twitter API credentials from https://developer.twitter.com',
          'Add credentials to your .env file',
          'Enable API with TWITTER_API_ENABLED=true'
        ]
      }
    });
  }

  try {
    if (enabled && bearerToken) {
      console.log(' [Primary] Using Twitter API v2 with Bearer Token...');
      try {
        const userData = await fetchTwitterUserData(username, bearerToken);
        console.log(' [API Response]:', JSON.stringify(userData, null, 2));
        const result = await processTwitterData(userData, username);
        return res.json(result);
      } catch (apiError) {
        console.error(' [Twitter API] Error:', apiError);
        if (isCheck) return handleApiCheckError(apiError);
      }
    } else if (isCheck) {
      return handleNoApiConfigured();
    }

    let storedData = null;
    try {
      storedData = await getStoredData(username);
    } catch (dbError) {
      console.error(' Database error:', dbError);
    }
    if (storedData) {
      return res.json(storedData);
    }
    console.log(' [No Data] No API access and no stored data');
    return handleNoData(username);
  } catch (error) {
    console.error(' [System Error]:', error);
    return res.status(500).json({
      success: false,
      followers: 0,
      username: process.env.TWITTER_USERNAME || 'WhatNextStream',
      lastUpdated: new Date().toISOString(),
      source: 'system_error',
      realData: false,
      error: error instanceof Error ? error.message : 'Unknown system error',
      message: 'System error occurred while fetching follower count'
    });
  }
});

module.exports = router;

