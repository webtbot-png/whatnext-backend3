const express = require('express');
const { getSupabaseAdminClient } = require('../database.js');

const router = express.Router();

// GET /api/locations - Main locations endpoint for the map
router.get('/', async (req, res) => {
  console.log('📍 LOCATIONS API: Fetching locations with content for map display');
  
  try {
    const supabase = getSupabaseAdminClient();
    
    // Get all locations from database
    const { data: dbLocations, error } = await supabase
      .from('locations')
      .select('*')
      .order('created_at', { ascending: false });
    
    console.log(`📍 Found ${dbLocations?.length || 0} total locations in database`);
    
    if (error) {
      console.error('❌ Database error:', error);
      return res.json({ success: true, locations: [] });
    }
    
    if (!dbLocations || dbLocations.length === 0) {
      console.log('📍 No locations in database');
      return res.json({ success: true, locations: [] });
    }
    
    // Get content entries for locations - ANY STATUS with valid media
    const { data: contentEntries, error: contentError } = await supabase
      .from('content_entries')
      .select('*')
      .not('location_id', 'is', null)
      .neq('media_url', '[PENDING]')  // Exclude pending uploads
      .not('media_url', 'is', null)  // Exclude null media URLs
      .order('created_at', { ascending: false });
    
    if (contentError) {
      console.error('❌ Content error:', contentError);
    }
    
    console.log(`📄 Found ${contentEntries?.length || 0} content entries with valid media (any status)`);
    
    // Log content entries by location for debugging
    if (contentEntries && contentEntries.length > 0) {
      console.log('\n=== CONTENT ENTRIES BY LOCATION ===');
      const contentByLocation = {};
      contentEntries.forEach(content => {
        const locId = content.location_id;
        if (!contentByLocation[locId]) {
          const location = dbLocations.find(l => l.id === locId);
          contentByLocation[locId] = {
            locationName: location?.name || 'Unknown',
            countryISO3: location?.country_iso3 || 'Unknown',
            videos: []
          };
        }
        contentByLocation[locId].videos.push({
          title: content.title,
          url: content.media_url,
          status: content.status
        });
      });
      
      Object.entries(contentByLocation).forEach(([locId, data]) => {
        console.log(`📍 ${data.locationName} (${data.countryISO3}):`);
        data.videos.forEach((video, i) => {
          console.log(`   ${i+1}. "${video.title}" - ${video.status}`);
          console.log(`      URL: ${video.url?.substring(0, 60)}...`);
        });
      });
    }
    
    // Only return locations that have content with valid media
    const locations = dbLocations
      .map((loc) => {
        // Filter content entries that belong to this specific location
        const locationContent = (contentEntries || []).filter(
          (content) => content.location_id === loc.id
        );
        
        // Skip locations without any content with valid media
        if (!locationContent || locationContent.length === 0) {
          console.log(`⚠️ Skipping "${loc.name}" (${loc.country_iso3}) - no content with valid media`);
          return null;
        }
        
        console.log(`✅ Including "${loc.name}" (${loc.country_iso3}) with ${locationContent.length} video(s)`);
        
        // Format media data
        const media = locationContent.map((content) => ({
          id: content.id,
          type: content.content_type || 'video',
          url: content.media_url || '',
          title: content.title || 'Untitled',
          description: content.description || '',
          thumbnail: content.thumbnail_url || '',
          duration: content.duration || undefined,
          isFeatured: content.is_featured || false,
          viewCount: content.view_count || 0,
          tags: content.tags || [],
          createdAt: content.created_at,
          metadata: {
            originalTitle: content.title,
            uploadedAt: content.created_at
          }
        }));
        
        return {
          id: loc.id,
          name: loc.name,
          countryISO3: loc.country_iso3 || loc.countryISO3 || 'UNKNOWN',
          coordinates: [parseFloat(loc.lng), parseFloat(loc.lat)],
          lat: parseFloat(loc.lat),
          lng: parseFloat(loc.lng),
          description: loc.description || `Location in ${loc.name}`,
          status: loc.status || 'active',
          summary: loc.summary || loc.description,
          tags: loc.tags || [],
          slug: loc.slug || (loc.name ? loc.name.toLowerCase().replace(/\s+/g, '-') : undefined),
          visitedDate: loc.visited_date || (loc.created_at ? loc.created_at.split('T')[0] : undefined),
          viewCount: loc.view_count || 0,
          isFeatured: loc.is_featured || false,
          mediaCount: media.length,
          media: media
        };
      })
      .filter(Boolean); // Remove nulls
    
    console.log('\n=== FINAL LOCATIONS BEING SENT TO MAP ===');
    locations.forEach((l, i) => {
      console.log(`${i+1}. "${l.name}" (${l.countryISO3}) - [${l.lng}, ${l.lat}] - ${l.mediaCount} videos`);
    });
    
    return res.json({ 
      success: true, 
      locations: locations,
      total: locations.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error('💥 Locations API Error:', err);
    return res.json({ 
      success: true, 
      locations: [],
      error: 'Failed to fetch locations',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
