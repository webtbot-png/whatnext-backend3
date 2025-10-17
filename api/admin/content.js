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

// GET /api/admin/content
router.get('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    const supabase = getSupabaseAdminClient();
    const { data: contentEntries, error } = await supabase
      .from('content_entries')
      .select(`
        id,
        title,
        description,
        content_type,
        media_type,
        media_url,
        thumbnail_url,
        duration,
        location_id,
        custom_location,
        event_date,
        event_time,
        start_time,
        end_time,
        timezone,
        status,
        visibility,
        view_count,
        like_count,
        is_featured,
        is_pinned,
        tags,
        category,
        published_at,
        created_at,
        updated_at,
        locations (
          name,
          country_iso3,
          country,
          status
        )
      `)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Error fetching content entries:', error);
      throw error;
    }
    const processedContent = (contentEntries || []).map(entry => ({
      ...entry,
      location_name: entry.locations?.name || entry.custom_location || 'No location',
      display_status: entry.status.charAt(0).toUpperCase() + entry.status.slice(1),
      is_scheduled: entry.status === 'upcoming' && (entry.event_date || entry.start_time),
      is_live: entry.status === 'live',
      total_engagement: (entry.view_count || 0) + (entry.like_count || 0)
    }));
    return res.json({
      success: true,
      content: processedContent,
      entries: processedContent,
      total: processedContent.length,
      summary: {
        total: processedContent.length,
        byStatus: processedContent.reduce((acc, item) => {
          acc[item.status] = (acc[item.status] || 0) + 1;
          return acc;
        }, {}),
        byType: processedContent.reduce((acc, item) => {
          acc[item.content_type] = (acc[item.content_type] || 0) + 1;
          return acc;
        }, {}),
        featured: processedContent.filter(item => item.is_featured).length,
        scheduled: processedContent.filter(item => item.is_scheduled).length
      },
      message: contentEntries?.length ? `Found ${contentEntries.length} content entries` : 'No content entries found'
    });
  } catch (error) {
    console.error('Error getting content:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ success: false, error: 'Failed to fetch content entries' });
  }
});

function validateContentData(data) {
  if (!data.title || !data.content_type) {
    return { valid: false, error: 'Title and content type are required' };
  }
  return { valid: true };
}

function prepareContentEntry(data) {
  // Base entry with only required and non-scheduling fields
  const entry = {
    title: data.title,
    description: data.description || null,
    content_type: data.content_type,
    media_type: data.media_type || 'youtube',
    media_url: data.media_url || null,
    thumbnail_url: data.thumbnail_url || null,
    duration: data.duration || null,
    location_id: data.location_id || null,
    custom_location: data.custom_location || null,
    timezone: data.timezone || 'UTC',
    status: data.status || 'draft',
    visibility: data.visibility || 'public',
    tags: data.tags || [],
    category: data.category || null,
    is_featured: data.is_featured || false,
    is_pinned: data.is_pinned || false,
    view_count: 0,
    like_count: 0,
    metadata: data.metadata || {},
    processing_status: data.processing_status || 'ready',
    // Folder/batch organization fields
    folder_title: data.folder_title || null,
    folder_description: data.folder_description || null,
    batch_id: data.batch_id || null,
    part_number: data.part_number || null
  };

  // Set published_at for published status
  if (data.status === 'published') {
    entry.published_at = new Date().toISOString();
  }

  // CRITICAL: Only add scheduling fields for statuses that require them
  // According to your constraint, scheduling fields should ONLY be present
  // when status is 'upcoming', 'live', or 'past'
  const schedulingStatuses = new Set(['upcoming', 'live', 'past']);
  if (schedulingStatuses.has(entry.status)) {
    if (data.event_date) entry.event_date = data.event_date;
    if (data.event_time) entry.event_time = data.event_time;
    if (data.start_time) entry.start_time = data.start_time;
    if (data.end_time) entry.end_time = data.end_time;
  }
  // For non-scheduling statuses, DO NOT include scheduling fields at all
  // (They must be completely omitted, not set to null)

  console.log('📝 Prepared content entry:', {
    status: entry.status,
    hasSchedulingFields: schedulingStatuses.has(entry.status),
    fields: Object.keys(entry),
    schedulingFieldsIncluded: {
      event_date: 'event_date' in entry,
      event_time: 'event_time' in entry,
      start_time: 'start_time' in entry,
      end_time: 'end_time' in entry
    }
  });

  return entry;
}

function handleError(error, req, res) {
  console.error('❌ Error creating content entry:', error);
  console.error('📋 Request body was:', req.body);
  console.error('🔍 Full error details:', {
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : 'No stack trace',
    code: error?.code,
    details: error?.details,
    hint: error?.hint
  });
  if (error instanceof Error && error.message === 'Unauthorized') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Provide more specific error message for constraint violations
  let errorMessage = 'Failed to create content entry';
  if (error?.code === '23514') {
    errorMessage = 'Database constraint violation. Check scheduling fields match status.';
  }
  return res.status(500).json({ 
    success: false, 
    error: errorMessage,
    details: error instanceof Error ? error.message : 'Unknown error',
    code: error?.code,
    hint: error?.hint
  });
}

// POST /api/admin/content
router.post('/', async (req, res) => {
  try {
    verifyAdminToken(req);
    console.log('📥 Received content creation request:', {
      status: req.body.status,
      media_type: req.body.media_type,
      hasEventDate: !!req.body.event_date,
      hasEventTime: !!req.body.event_time
    });
    const validation = validateContentData(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }
    const contentData = prepareContentEntry(req.body);
    console.log('💾 Inserting content entry with fields:', Object.keys(contentData));
    const supabase = getSupabaseAdminClient();
    const { data: contentEntry, error } = await supabase
      .from('content_entries')
      .insert(contentData)
      .select()
      .single();
    if (error) {
      console.error('❌ Supabase insert error:', error);
      throw error;
    }
    console.log('✅ Content entry created successfully:', contentEntry.id);
    return res.status(201).json({ success: true, entry: contentEntry });
  } catch (error) {
    return handleError(error, req, res);
  }
});

// Helper function to find fallback entry for large file uploads
async function findFallbackEntry(supabase, requestBody) {
  if (!requestBody.media_url || requestBody.status !== 'published') {
    return null;
  }

  console.log('🔍 Attempting to find recent entry for large file...');
  
  const { data: recentEntries, error: searchError } = await supabase
    .from('content_entries')
    .select('*')
    .or('status.eq.uploading,status.eq.draft,status.eq.processing')
    .is('media_url', null)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last 60 minutes
    .order('created_at', { ascending: false })
    .limit(10);

  if (searchError || !recentEntries?.length) {
    return null;
  }

  // Try to find the best match based on title or most recent
  let fallbackEntry = recentEntries[0];
  
  // If we have title info, try to find a better match
  if (requestBody.title) {
    const titleMatch = recentEntries.find(entry => 
      entry.title && entry.title.toLowerCase().includes(requestBody.title.toLowerCase())
    );
    if (titleMatch) {
      fallbackEntry = titleMatch;
      console.log('✅ Found title-matched entry:', fallbackEntry.title);
    }
  }
  
  console.log('✅ Found recent entry as fallback:', fallbackEntry.id, fallbackEntry.title);
  return fallbackEntry;
}

// Helper function to attempt fallback update
async function attemptFallbackUpdate(supabase, requestBody, fallbackEntry) {
  const { data: updatedFallbackEntry, error: fallbackUpdateError } = await supabase
    .from('content_entries')
    .update(requestBody)
    .eq('id', fallbackEntry.id)
    .select()
    .single();

  if (fallbackUpdateError) {
    console.error('❌ Fallback update failed:', fallbackUpdateError);
    return null;
  }

  console.log('✅ Successfully updated using fallback entry');
  return updatedFallbackEntry;
}

// PUT /api/admin/content/:id - Update existing content entry
router.put('/:id', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false, 
        error: 'Missing content ID' 
      });
    }

    console.log('🔄 Updating content entry ID:', id);
    console.log('📝 Update data:', req.body);

    const supabase = getSupabaseAdminClient();
    
    // First check if the content entry exists
    const { data: existingEntry, error: fetchError } = await supabase
      .from('content_entries')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingEntry) {
      console.error('❌ Content entry not found by ID:', id, fetchError);
      
      // For large file uploads, try to find recent entries as fallback
      const fallbackEntry = await findFallbackEntry(supabase, req.body);
      
      if (fallbackEntry) {
        const updatedEntry = await attemptFallbackUpdate(supabase, req.body, fallbackEntry);
        
        if (updatedEntry) {
          return res.status(200).json({ 
            success: true, 
            entry: updatedEntry,
            note: 'Updated using fallback entry matching' 
          });
        }
      }
      
      return res.status(404).json({
        success: false,
        error: 'Content entry not found',
        details: fetchError?.message || 'Entry does not exist'
      });
    }

    // Update the entry
    const { data: updatedEntry, error: updateError } = await supabase
      .from('content_entries')
      .update(req.body)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Failed to update content entry:', updateError);
      throw updateError;
    }

    console.log('✅ Content entry updated successfully:', id);
    return res.json({
      success: true,
      entry: updatedEntry,
      message: 'Content entry updated successfully'
    });

  } catch (error) {
    return handleError(error, req, res);
  }
});

// DELETE /api/admin/content/:id
router.delete('/:id', async (req, res) => {
  try {
    verifyAdminToken(req);
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing content ID' });
    }
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('content_entries')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return res.json({ success: true, message: `Content entry ${id} deleted` });
  } catch (error) {
    return handleError(error, req, res);
  }
});

// POST /api/admin/content/repair - Repair orphaned content entries
router.post('/repair', async (req, res) => {
  try {
    verifyAdminToken(req);
    console.log('🔧 Starting content repair process...');
    
    const supabase = getSupabaseAdminClient();
    
    // Find content entries without media_url that might be orphaned
    const { data: orphanedEntries, error: searchError } = await supabase
      .from('content_entries')
      .select('*')
      .is('media_url', null)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
      .order('created_at', { ascending: false });

    if (searchError) {
      throw searchError;
    }

    console.log(`🔍 Found ${orphanedEntries?.length || 0} potentially orphaned entries`);
    
    // Return the orphaned entries for manual review
    return res.json({
      success: true,
      orphanedEntries: orphanedEntries || [],
      count: orphanedEntries?.length || 0,
      message: 'Found orphaned content entries. Use PUT /api/admin/content/:id to fix them.'
    });
    
  } catch (error) {
    console.error('❌ Error during content repair:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to repair content entries',
      details: error.message
    });
  }
});

// POST /api/admin/content/organize-folders - Organize existing content into folders by matching titles
router.post('/organize-folders', async (req, res) => {
  try {
    verifyAdminToken(req);
    
    const supabase = getSupabaseAdminClient();
    
    console.log('📁 Starting content folder organization...');
    
    // Get all content that doesn't have folder organization yet
    const { data: unorganizedContent, error: fetchError } = await supabase
      .from('content_entries')
      .select('id, title, description')
      .is('folder_title', null)
      .order('title');
    
    if (fetchError) {
      throw fetchError;
    }
    
    // Group content by similar titles
    const titleGroups = new Map();
    
    for (const content of unorganizedContent) {
      // Extract base title (remove "Part X", "- Part X", etc.)
      const baseTitle = content.title
        .replace(/\s*-\s*Part\s+\d+/i, '')
        .replace(/\s*Part\s+\d+/i, '')
        .replace(/\s*\(\s*Part\s+\d+\s*\)/i, '')
        .replace(/\s*\[\s*Part\s+\d+\s*\]/i, '')
        .trim();
      
      if (!titleGroups.has(baseTitle)) {
        titleGroups.set(baseTitle, []);
      }
      
      titleGroups.get(baseTitle).push(content);
    }
    
    let foldersCreated = 0;
    let contentUpdated = 0;
    
    // Process groups with multiple items
    for (const [baseTitle, items] of titleGroups.entries()) {
      if (items.length > 1) {
        console.log(`📂 Creating folder "${baseTitle}" with ${items.length} items`);
        
        const batchId = `folder_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        
        // Update all items in this group
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const partNumber = i + 1;
          
          const { error: updateError } = await supabase
            .from('content_entries')
            .update({
              folder_title: baseTitle,
              folder_description: `Collection: ${baseTitle}`,
              batch_id: batchId,
              part_number: partNumber,
              title: `${baseTitle} - Part ${partNumber}`
            })
            .eq('id', item.id);
          
          if (!updateError) {
            contentUpdated++;
          }
        }
        
        foldersCreated++;
      }
    }
    
    console.log(`✅ Folder organization complete: ${foldersCreated} folders, ${contentUpdated} items organized`);
    
    return res.json({
      success: true,
      foldersCreated,
      contentUpdated,
      message: `Organized ${contentUpdated} items into ${foldersCreated} folders`
    });
    
  } catch (error) {
    console.error('❌ Error organizing folders:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to organize folders',
      details: error.message
    });
  }
});

// GET /api/admin/content/folders - Get all content organized by folders
router.get('/folders', async (req, res) => {
  try {
    verifyAdminToken(req);
    
    const supabase = getSupabaseAdminClient();
    
    // Get all content with folder organization
    const { data: folderContent, error } = await supabase
      .from('content_entries')
      .select('*')
      .not('folder_title', 'is', null)
      .order('folder_title')
      .order('part_number');
    
    if (error) {
      throw error;
    }
    
    // Group by folder_title
    const folders = new Map();
    
    for (const item of folderContent) {
      const folderKey = item.folder_title;
      
      if (!folders.has(folderKey)) {
        folders.set(folderKey, {
          folderTitle: item.folder_title,
          folderDescription: item.folder_description,
          batchId: item.batch_id,
          items: [],
          totalItems: 0,
          totalDuration: 0,
          createdAt: item.created_at
        });
      }
      
      const folder = folders.get(folderKey);
      folder.items.push(item);
      folder.totalItems++;
      
      if (item.duration) {
        folder.totalDuration += item.duration;
      }
    }
    
    const foldersArray = Array.from(folders.values());
    
    return res.json({
      success: true,
      folders: foldersArray,
      totalFolders: foldersArray.length,
      totalItems: folderContent.length
    });
    
  } catch (error) {
    console.error('❌ Error getting folders:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get folders',
      details: error.message
    });
  }
});

module.exports = router;

