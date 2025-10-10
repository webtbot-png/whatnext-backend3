const express = require('express');
const { getSupabaseAdminClient } = require('../database.js');

const router = express.Router();

/**
 * GET /api/testimonials
 * Get approved testimonials from community_tweets
 */
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    console.log('🔍 Fetching testimonials from community_tweets table...');
    // Get community tweets that are active (using community_tweets instead of testimonials)
    const { data: communityTweets, error } = await supabase
      .from('community_tweets')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('❌ Error fetching community tweets:', error);
      return res.status(500).json({ error: 'Failed to fetch testimonials' });
    }
    console.log(`✅ Found ${communityTweets?.length || 0} community tweets`);
    // Transform community_tweets to match the expected testimonial format
    const formattedTestimonials = (communityTweets || []).map(tweet => ({
      id: tweet.id,
      author_name: tweet.author_username,
      author_username: tweet.author_username,
      author_profile_image: null, // community_tweets doesn't have profile images
      text: tweet.title || tweet.description || `Tweet from @${tweet.author_username}`,
      created_at: tweet.created_at,
      public_metrics: {
        reply_count: 0,
        retweet_count: 0,
        like_count: tweet.engagement_score || 0
      },
      verified: false,
      tweet_url: tweet.tweet_url,
      is_featured: tweet.is_featured
    }));
    return res.json(formattedTestimonials);
  } catch (error) {
    console.error('❌ Error in testimonials API:', error);
    return res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

/**
 * POST /api/testimonials
 * Add new testimonial (admin only)
 */
router.post('/', async (req, res) => {
  try {
    const {
      author_name,
      author_username, 
      author_profile_image,
      text,
      reply_count = 0,
      retweet_count = 0,
      like_count = 0,
      verified = false
    } = req.body;
    // Validation
    const requiredFields = ['author_name', 'author_username', 'text'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ error: `${field} is required` });
      }
    }
    const supabase = getSupabaseAdminClient();
    const testimonialData = {
      author_name,
      author_username,
      author_profile_image: author_profile_image || null,
      text,
      reply_count,
      retweet_count,
      like_count,
      verified,
      approved: true, // Auto-approve for admin-added testimonials
      created_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('testimonials')
      .insert(testimonialData)
      .select()
      .single();
    if (error) {
      console.error('Error creating testimonial:', error);
      return res.status(500).json({ error: 'Failed to create testimonial' });
    }
    console.log('✅ Created testimonial:', data.id);
    return res.status(201).json({ 
      message: 'Testimonial created successfully',
      testimonial: data 
    });
  } catch (error) {
    console.error('Error creating testimonial:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

