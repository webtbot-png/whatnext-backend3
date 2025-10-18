const express = require('express');
const { getSupabaseAdminClient } = require('../../database.js');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// In-memory upload tracking (in production, use Redis or database)
const uploadSessions = new Map();

console.log('🔥 UPLOAD-TRACKING ROUTER LOADED - BATCH ENDPOINT AVAILABLE');
console.log('📋 Available endpoints: start, update, status, complete, active, start-batch, batch/:id, credentials/:sessionId, upload-complete');

// Helper function to verify admin token
function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.substring(7);
  
  // For testing - allow "test" token temporarily
  if (token === 'test') {
    console.log('⚠️ Using test token - remove this in production');
    return;
  }
  
  try {
    jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('❌ JWT verification failed:', error.message);
    throw new Error(`JWT verification failed: ${error.message}`);
  }
}

// Helper function to validate batch upload request
function validateBatchRequest(req) {
  const { folderTitle, files } = req.body;
  
  if (!folderTitle || !files || !Array.isArray(files) || files.length === 0) {
    throw new Error('Missing required fields: folderTitle, files (array)');
  }
  
  return { folderTitle, files };
}

// Helper function to create content entry object
function createContentEntryObject(file, folderTitle, folderDescription, contentMetadata, batchId, partNumber) {
  return {
    // Basic info
    title: `${folderTitle} - Part ${partNumber}`,
    description: folderDescription || `Part ${partNumber} of ${folderTitle}`,
    
    // Metadata from batch form (same as manual entry)
    content_type: contentMetadata?.content_type || 'video',
    media_type: 'upload', // Only 'upload' is allowed by the database constraint
    media_url: '[PENDING]',
    
    // Location - Handle country codes vs UUIDs
    location_id: (contentMetadata?.location_id && contentMetadata.location_id.startsWith('country-')) ? null : contentMetadata?.location_id || null,
    custom_location: contentMetadata?.custom_location || (contentMetadata?.location_id && contentMetadata.location_id.startsWith('country-') ? contentMetadata.location_id : null),
    
    // Scheduling
    event_date: contentMetadata?.event_date || null,
    event_time: contentMetadata?.event_time || null,
    
    // Visibility and status
    status: contentMetadata?.status || 'published',
    visibility: contentMetadata?.visibility || 'public',
    
    // Tags and category - Convert to PostgreSQL array format
    tags: contentMetadata?.tags ? 
      '{' + contentMetadata.tags.split(',').map(tag => '"' + tag.trim() + '"').join(',') + '}' : 
      '{"' + folderTitle + '","Part ' + partNumber + '"}',
    category: contentMetadata?.category || null,
    
    // Features
    is_featured: contentMetadata?.is_featured || false,
    is_pinned: contentMetadata?.is_pinned || false,
    
    // Technical
    timezone: contentMetadata?.timezone || 'UTC',
    metadata: contentMetadata?.metadata || JSON.stringify({
      batch_upload: true,
      folder_title: folderTitle,
      part_number: partNumber
    }),
    
    // Batch tracking
    folder_title: folderTitle,
    folder_description: folderDescription,
    part_number: partNumber,
    batch_id: batchId
  };
}

// Helper function to create database entry with error handling
async function createDatabaseEntry(supabase, contentEntry, filename) {
  console.log(`💾 Inserting content entry for ${filename}:`, contentEntry);
  
  const { data: newEntry, error } = await supabase
    .from('content_entries')
    .insert(contentEntry)
    .select()
    .single();
    
  let finalEntry = newEntry;
    
  if (error || !finalEntry) {
    console.error(`❌ Failed to create content entry for ${filename}:`, error);
    
    // If it's a media_type constraint error, try 'upload' (the only allowed value)
    if (error?.message?.includes('content_entries_media_type_check')) {
      console.log('🔧 Trying with media_type: upload (the only allowed value)...');
      
      const altContentEntry = { ...contentEntry, media_type: 'upload' };
      
      const { data: altEntry, error: altError } = await supabase
        .from('content_entries')
        .insert(altContentEntry)
        .select()
        .single();
        
      if (!altError && altEntry) {
        console.log(`✅ Success with media_type: upload`);
        finalEntry = altEntry;
      } else {
        console.log(`❌ Still failed with media_type: upload`, altError?.message);
        throw new Error(`Failed to create database entry: ${altError?.message}`);
      }
    } else {
      throw new Error(`Database error: ${error?.message}`);
    }
  }
  
  return finalEntry;
}

// Helper function to create upload session
function createUploadSession(sessionId, finalEntry, file, batchId, folderTitle, folderDescription, partNumber) {
  return {
    id: sessionId,
    contentEntryId: finalEntry.id,
    filename: file.filename,
    fileSize: file.fileSize || 0,
    status: 'pending',
    progress: 0,
    startTime: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
    bunnyVideoId: null,
    bunnyUploadUrl: null,
    finalUrl: null,
    error: null,
    batchId,
    folderTitle,
    folderDescription,
    partNumber,
    steps: {
      credentials: false,
      bunnyUpload: false,
      databaseUpdate: false
    }
  };
}

// Helper function to process single file in batch
async function processBatchFile(supabase, file, index, batchConfig) {
  const { folderTitle, folderDescription, contentMetadata, batchId, sessionIds } = batchConfig;
  const partNumber = index + 1;
  
  console.log(`🔄 Processing file ${partNumber}: ${file.filename}`);
  
  // Create content entry
  const contentEntry = createContentEntryObject(file, folderTitle, folderDescription, contentMetadata, batchId, partNumber);
  
  // Create database entry with error handling
  const finalEntry = await createDatabaseEntry(supabase, contentEntry, file.filename);
  
  console.log(`✅ Created content entry ${partNumber} with ID: ${finalEntry.id}`);
  
  // Create upload session
  const sessionId = `upload_${Date.now()}_${index}_${Math.random().toString(36).substring(2)}`;
  const session = createUploadSession(sessionId, finalEntry, file, batchId, folderTitle, folderDescription, partNumber);
  
  // Store session in memory
  uploadSessions.set(sessionId, session);
  sessionIds.push(sessionId);
  
  console.log(`🚀 Batch session ${partNumber}: ${sessionId} for ${file.filename} (Content Entry ID: ${finalEntry.id})`);
  
  // Add small delay to ensure unique timestamps
  await new Promise(resolve => setTimeout(resolve, 10));
}

// Main batch processing function
async function processBatchFiles(supabase, files, batchConfig) {
  const { folderTitle, sessionIds } = batchConfig;
  
  console.log(`📁 Starting batch upload: ${batchConfig.batchId} - "${folderTitle}" (${files.length} files)`);
  
  for (let i = 0; i < files.length; i++) {
    await processBatchFile(supabase, files[i], i, batchConfig);
  }
  
  console.log(`✅ Batch upload complete: ${sessionIds.length} sessions created`);
  console.log(`🗂️ Total sessions in memory: ${uploadSessions.size}`);
}

// Helper function to create response object
function createBatchResponse(batchId, sessionIds, folderTitle, files) {
  const createdSessions = sessionIds.map(id => uploadSessions.get(id)).filter(Boolean);
  
  return {
    success: true,
    batchId,
    sessionIds,
    folderTitle,
    totalFiles: files.length,
    createdSessions,
    message: `Batch upload started: ${files.length} files`,
    debug: {
      totalSessionsInMemory: uploadSessions.size,
      sessionDetails: createdSessions.map(s => ({
        id: s.id,
        filename: s.filename,
        status: s.status,
        contentEntryId: s.contentEntryId
      }))
    }
  };
}

// POST /api/admin/upload-tracking/start - Start tracking an upload session (single or batch)
router.post('/start', async (req, res) => {
  try {
    verifyAdminToken(req);
    
    const { contentEntryId, filename, fileSize, batchId, folderTitle, folderDescription } = req.body;
    
    if (!contentEntryId || !filename) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: contentEntryId, filename' 
      });
    }

    const sessionId = `upload_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    // Create upload session
    const session = {
      id: sessionId,
      contentEntryId,
      filename,
      fileSize: fileSize || 0,
      status: 'starting',
      progress: 0,
      startTime: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      bunnyVideoId: null,
      bunnyUploadUrl: null,
      finalUrl: null,
      error: null,
      // Folder/batch support
      batchId: batchId || null,
      folderTitle: folderTitle || null,
      folderDescription: folderDescription || null,
      steps: {
        credentials: false,
        bunnyUpload: false,
        databaseUpdate: false
      }
    };
    
    uploadSessions.set(sessionId, session);
    
    const batchInfo = batchId ? ` (batch: ${batchId})` : '';
    console.log(`🚀 Upload session started: ${sessionId} for content ${contentEntryId}${batchInfo}`);
    
    return res.json({
      success: true,
      sessionId,
      batchId,
      message: 'Upload session created'
    });
    
  } catch (error) {
    console.error('❌ Error starting upload session:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to start upload session'
    });
  }
});

// POST /api/admin/upload-tracking/update - Update upload progress
router.post('/update', async (req, res) => {
  try {
    verifyAdminToken(req);
    
    const { sessionId, status, progress, step, bunnyVideoId, bunnyUploadUrl, finalUrl, error } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Missing sessionId' });
    }
    
    const session = uploadSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Upload session not found' });
    }
    
    // Update session
    if (status) session.status = status;
    if (progress !== undefined) session.progress = progress;
    if (step) session.steps[step] = true;
    if (bunnyVideoId) session.bunnyVideoId = bunnyVideoId;
    if (bunnyUploadUrl) session.bunnyUploadUrl = bunnyUploadUrl;
    if (finalUrl) session.finalUrl = finalUrl;
    if (error) session.error = error;
    
    session.lastUpdate = new Date().toISOString();
    
    console.log(`📈 Upload session updated: ${sessionId} - ${status || 'progress'} (${progress || 0}%)`);
    
    return res.json({
      success: true,
      session,
      message: 'Upload session updated'
    });
    
  } catch (error) {
    console.error('❌ Error updating upload session:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update upload session'
    });
  }
});

// GET /api/admin/upload-tracking/status/:sessionId - Get upload status
router.get('/status/:sessionId', async (req, res) => {
  try {
    verifyAdminToken(req);
    
    const { sessionId } = req.params;
    
    const session = uploadSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Upload session not found' });
    }
    
    // Check if session is stale (older than 2 hours)
    const sessionAge = Date.now() - new Date(session.startTime).getTime();
    const isStale = sessionAge > 2 * 60 * 60 * 1000; // 2 hours
    
    if (isStale && session.status !== 'completed' && session.status !== 'failed') {
      session.status = 'stale';
      session.error = 'Session timed out';
    }
    
    return res.json({
      success: true,
      session,
      isStale,
      sessionAge: Math.round(sessionAge / 1000) // age in seconds
    });
    
  } catch (error) {
    console.error('❌ Error getting upload status:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get upload status'
    });
  }
});

// POST /api/admin/upload-tracking/complete - Mark upload as complete
router.post('/complete', async (req, res) => {
  try {
    verifyAdminToken(req);
    
    const { sessionId, finalUrl, bunnyVideoId } = req.body;
    
    if (!sessionId || !finalUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: sessionId, finalUrl' 
      });
    }
    
    const session = uploadSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Upload session not found' });
    }
    
    // Mark as completed
    session.status = 'completed';
    session.progress = 100;
    session.finalUrl = finalUrl;
    session.bunnyVideoId = bunnyVideoId;
    session.completedAt = new Date().toISOString();
    session.lastUpdate = new Date().toISOString();
    session.steps.databaseUpdate = true;
    
    console.log(`✅ Upload session completed: ${sessionId} - ${finalUrl}`);
    
    // Clean up session after 1 hour
    setTimeout(() => {
      uploadSessions.delete(sessionId);
      console.log(`🧹 Cleaned up upload session: ${sessionId}`);
    }, 60 * 60 * 1000); // 1 hour
    
    return res.json({
      success: true,
      session,
      message: 'Upload completed successfully'
    });
    
  } catch (error) {
    console.error('❌ Error completing upload session:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to complete upload session'
    });
  }
});

// GET /api/admin/upload-tracking/active - Get all active upload sessions
router.get('/active', async (req, res) => {
  try {
    verifyAdminToken(req);
    
    console.log(`📊 Total sessions in memory: ${uploadSessions.size}`);
    
    const allSessions = Array.from(uploadSessions.values());
    const activeSessions = allSessions
      .filter(session => session.status !== 'completed' && session.status !== 'failed')
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    
    console.log(`✅ Found ${activeSessions.length} active sessions`);
    
    // Group by batch for better organization
    const batchGroups = {};
    const singleSessions = [];
    
    for (const session of activeSessions) {
      if (session.batchId) {
        if (!batchGroups[session.batchId]) {
          batchGroups[session.batchId] = [];
        }
        batchGroups[session.batchId].push(session);
      } else {
        singleSessions.push(session);
      }
    }
    
    return res.json({
      success: true,
      sessions: activeSessions,
      count: activeSessions.length,
      totalSessionsInMemory: uploadSessions.size,
      batchGroups,
      singleSessions,
      debug: {
        allSessionStatuses: allSessions.map(s => ({ id: s.id, status: s.status, batchId: s.batchId }))
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting active sessions:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get active sessions'
    });
  }
});

// POST /api/admin/upload-tracking/start-batch - Start a batch upload session
router.post('/start-batch', async (req, res) => {
  console.log('🔥 BATCH UPLOAD ENDPOINT HIT!');
  console.log('📋 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    console.log('🔑 Verifying admin token...');
    verifyAdminToken(req);
    console.log('✅ Token verified successfully');
    
    // Validate request
    const { folderTitle, files } = validateBatchRequest(req);
    const { folderDescription, contentMetadata } = req.body;
    
    console.log('📁 Folder Title:', folderTitle);
    console.log('📄 Files count:', files?.length);
    console.log('📋 Content Metadata:', contentMetadata);
    
    // Generate batch ID and initialize session tracking
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const sessionIds = [];
    
    console.log('🆔 Generated batch ID:', batchId);
    
    try {
      console.log('🔌 Getting Supabase client...');
      const supabase = getSupabaseAdminClient();
      console.log('✅ Supabase client obtained');
      
      // Create batch configuration object
      const batchConfig = {
        folderTitle,
        folderDescription,
        contentMetadata,
        batchId,
        sessionIds
      };
      
      // Process all files in the batch
      await processBatchFiles(supabase, files, batchConfig);
      
      // Create and send response
      const response = createBatchResponse(batchId, sessionIds, folderTitle, files);
      console.log(`� Sending response with ${response.createdSessions.length} created sessions`);
      
      return res.json(response);
      
    } catch (dbError) {
      console.error('💥 Database error during batch upload:', dbError);
      return res.status(500).json({
        success: false,
        error: `Database error: ${dbError.message}`,
        details: dbError
      });
    }
    
  } catch (error) {
    console.error('❌ Error starting batch upload:', error);
    console.error('📋 Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to start batch upload',
      stack: error.stack
    });
  }
});

// GET /api/admin/upload-tracking/batch/:batchId - Get batch upload status
router.get('/batch/:batchId', async (req, res) => {
  try {
    verifyAdminToken(req);
    
    const { batchId } = req.params;
    
    console.log(`🔍 Looking for batch: ${batchId}`);
    console.log(`📊 Total sessions in memory: ${uploadSessions.size}`);
    
    // Debug: Log all session batch IDs
    const allSessions = Array.from(uploadSessions.values());
    console.log(`📋 All batch IDs in memory:`, allSessions.map(s => s.batchId).filter(Boolean));
    
    const batchSessions = allSessions
      .filter(session => session.batchId === batchId)
      .sort((a, b) => (a.partNumber || 0) - (b.partNumber || 0));
    
    console.log(`✅ Found ${batchSessions.length} sessions for batch ${batchId}`);
    
    if (batchSessions.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Batch not found',
        debug: {
          requestedBatchId: batchId,
          totalSessionsInMemory: uploadSessions.size,
          allBatchIds: allSessions.map(s => s.batchId).filter(Boolean)
        }
      });
    }
    
    const totalProgress = batchSessions.reduce((sum, session) => sum + session.progress, 0) / batchSessions.length;
    const completedCount = batchSessions.filter(session => session.status === 'completed').length;
    const failedCount = batchSessions.filter(session => session.status === 'failed').length;
    const activeCount = batchSessions.filter(session => 
      session.status !== 'completed' && session.status !== 'failed'
    ).length;
    
    return res.json({
      success: true,
      batchId,
      folderTitle: batchSessions[0]?.folderTitle,
      folderDescription: batchSessions[0]?.folderDescription,
      totalFiles: batchSessions.length,
      completedCount,
      failedCount,
      activeCount,
      totalProgress: Math.round(totalProgress),
      sessions: batchSessions
    });
    
  } catch (error) {
    console.error('❌ Error getting batch status:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get batch status'
    });
  }
});

// POST /api/admin/upload-tracking/upload-complete - Complete upload and update database
router.post('/upload-complete', async (req, res) => {
  try {
    verifyAdminToken(req);
    
    const { sessionId, bunnyVideoId, finalUrl } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: sessionId' 
      });
    }
    
    console.log(`🎯 Completing upload for session: ${sessionId}`);
    
    const session = uploadSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Upload session not found',
        sessionId 
      });
    }
    
    console.log(`✅ Found session for ${session.filename} (Content Entry ID: ${session.contentEntryId})`);
    
    // Update the database with the final media URL
    if (finalUrl && session.contentEntryId) {
      try {
        console.log(`💾 Updating database with final URL: ${finalUrl}`);
        const supabase = getSupabaseAdminClient();
        
        const { data: updateData, error: updateError } = await supabase
          .from('content_entries')
          .update({ 
            media_url: finalUrl
          })
          .eq('id', session.contentEntryId)
          .select()
          .single();
          
        if (updateError) {
          console.error(`❌ Database update failed:`, updateError);
          throw new Error(`Database update failed: ${updateError.message}`);
        }
        
        console.log(`✅ Database updated successfully for content entry ${session.contentEntryId}`);
        
        // Mark session as completed
        session.status = 'completed';
        session.progress = 100;
        session.finalUrl = finalUrl;
        session.bunnyVideoId = bunnyVideoId;
        session.completedAt = new Date().toISOString();
        session.lastUpdate = new Date().toISOString();
        session.steps.databaseUpdate = true;
        
        console.log(`✅ Upload completed: ${sessionId} - ${finalUrl}`);
        
        return res.json({
          success: true,
          sessionId,
          session,
          message: 'Upload completed and database updated successfully'
        });
        
      } catch (dbError) {
        console.error(`❌ Database error:`, dbError);
        
        // Update session with error but don't fail the response
        session.error = `Database error: ${dbError.message}`;
        session.status = 'failed';
        session.lastUpdate = new Date().toISOString();
        
        return res.status(500).json({
          success: false,
          error: 'Database update failed',
          details: dbError.message,
          sessionId
        });
      }
    } else {
      // Just mark session as completed without database update
      session.status = 'completed';
      session.progress = 100;
      session.finalUrl = finalUrl || '[COMPLETED]';
      session.bunnyVideoId = bunnyVideoId;
      session.completedAt = new Date().toISOString();
      session.lastUpdate = new Date().toISOString();
      
      console.log(`✅ Session marked as completed: ${sessionId}`);
      
      return res.json({
        success: true,
        sessionId,
        session,
        message: 'Upload session completed'
      });
    }
    
  } catch (error) {
    console.error('❌ Error completing upload:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to complete upload'
    });
  }
});

// Helper function to create Bunny CDN upload credentials
async function createBunnyCredentials(filename) {
  const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID;
  const BUNNY_API_KEY = process.env.BUNNY_API_KEY;
  
  if (!BUNNY_LIBRARY_ID || !BUNNY_API_KEY) {
    throw new Error('Bunny CDN not configured - missing BUNNY_LIBRARY_ID or BUNNY_API_KEY');
  }
  
  console.log('📋 Creating Bunny video entry for:', filename);
  console.log('🔧 Bunny API URL:', `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`);
  
  // Use global fetch if available (Node 18+) or require node-fetch
  const fetch = globalThis.fetch || require('node-fetch');
  
  // Create video entry in Bunny CDN
  const createRes = await fetch(
    `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`,
    {
      method: 'POST',
      headers: {
        'AccessKey': String(BUNNY_API_KEY),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        title: filename,
      }),
    }
  );

  const createResText = await createRes.text();
  console.log('🐰 Bunny create response status:', createRes.status);

  if (!createRes.ok) {
    console.error('❌ Bunny CDN API Error:', createRes.status, createResText);
    throw new Error(`Bunny CDN Error (${createRes.status}): ${createResText}`);
  }

  let videoData;
  try {
    videoData = JSON.parse(createResText);
  } catch (parseError) {
    console.error('Failed to parse Bunny response:', parseError);
    throw new Error(`Failed to parse Bunny response: ${createResText}`);
  }

  if (!videoData.guid) {
    throw new Error(`Bunny response missing videoId: ${createResText}`);
  }

  const videoId = videoData.guid;
  const uploadUrl = `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`;

  console.log('✅ Bunny video entry created:', videoId);

  return {
    success: true,
    videoId: videoId,
    uploadUrl: uploadUrl,
    libraryId: BUNNY_LIBRARY_ID,
    headers: {
      'AccessKey': BUNNY_API_KEY,
      'Content-Type': 'application/octet-stream'
    },
    message: 'Direct upload credentials ready'
  };
}

// GET /api/admin/upload-tracking/credentials/:sessionId - Get upload credentials for a session
router.get('/credentials/:sessionId', async (req, res) => {
  try {
    verifyAdminToken(req);
    
    const { sessionId } = req.params;
    
    console.log(`🔑 Getting upload credentials for session: ${sessionId}`);
    
    const session = uploadSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Upload session not found',
        sessionId
      });
    }
    
    console.log(`✅ Found session for ${session.filename} (Content Entry ID: ${session.contentEntryId})`);
    
    try {
      // Create Bunny CDN upload credentials directly
      const credentialsData = await createBunnyCredentials(session.filename);
      
      console.log(`✅ Got upload credentials for ${session.filename}`);
      
      // Update session with credentials step and Bunny info
      session.steps.credentials = true;
      session.bunnyVideoId = credentialsData.videoId;
      session.bunnyUploadUrl = credentialsData.uploadUrl;
      session.lastUpdate = new Date().toISOString();
      
      return res.json({
        success: true,
        sessionId,
        filename: session.filename,
        contentEntryId: session.contentEntryId,
        credentials: credentialsData,
        message: 'Upload credentials retrieved successfully'
      });
      
    } catch (credentialsError) {
      console.error(`❌ Error creating upload credentials:`, credentialsError);
      
      // Update session with error
      session.error = `Credentials error: ${credentialsError.message}`;
      session.lastUpdate = new Date().toISOString();
      
      return res.status(500).json({
        success: false,
        error: 'Failed to get upload credentials',
        details: credentialsError.message,
        sessionId
      });
    }
    
  } catch (error) {
    console.error('❌ Error in credentials endpoint:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process credentials request'
    });
  }
});

// TEST ENDPOINT - Simple batch test
router.post('/test-batch', async (req, res) => {
  console.log('🧪 TEST BATCH ENDPOINT HIT!');
  console.log('📋 Request body:', req.body);
  
  // Create a realistic batch with multiple files at different progress stages
  const testSessions = [
    {
      id: 'test_session_1',
      filename: 'video1.mp4',
      status: 'completed',
      progress: 100,
      batchId: 'demo_batch_123',
      partNumber: 1,
      fileSize: 1000000
    },
    {
      id: 'test_session_2', 
      filename: 'video2.mp4',
      status: 'uploading',
      progress: 65,
      batchId: 'demo_batch_123',
      partNumber: 2,
      fileSize: 2000000
    },
    {
      id: 'test_session_3',
      filename: 'video3.mp4', 
      status: 'pending',
      progress: 0,
      batchId: 'demo_batch_123',
      partNumber: 3,
      fileSize: 3000000
    }
  ];
  
  // Add all test sessions
  for (const session of testSessions) {
    uploadSessions.set(session.id, {
      ...session,
      startTime: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      folderTitle: 'Demo Batch Upload',
      steps: {
        credentials: session.status !== 'pending',
        bunnyUpload: session.status === 'completed',
        databaseUpdate: session.status === 'completed'
      }
    });
  }
  
  console.log('� Sessions after adding demo batch:', uploadSessions.size);
  
  return res.json({
    success: true,
    message: 'Demo batch created with realistic progress',
    sessionsAdded: testSessions.length,
    totalSessions: uploadSessions.size,
    demoSessions: testSessions
  });
});

module.exports = router;
