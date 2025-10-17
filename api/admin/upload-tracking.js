const express = require('express');
const { getSupabaseAdminClient } = require('../../database.js');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// In-memory upload tracking (in production, use Redis or database)
const uploadSessions = new Map();

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.substring(7);
  jwt.verify(token, JWT_SECRET);
}

// POST /api/admin/upload-tracking/start - Start tracking an upload session
router.post('/start', async (req, res) => {
  try {
    verifyAdminToken(req);
    
    const { contentEntryId, filename, fileSize } = req.body;
    
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
      steps: {
        credentials: false,
        bunnyUpload: false,
        databaseUpdate: false
      }
    };
    
    uploadSessions.set(sessionId, session);
    
    console.log(`🚀 Upload session started: ${sessionId} for content ${contentEntryId}`);
    
    return res.json({
      success: true,
      sessionId,
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
    
    const activeSessions = Array.from(uploadSessions.values())
      .filter(session => session.status !== 'completed' && session.status !== 'failed')
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    
    return res.json({
      success: true,
      sessions: activeSessions,
      count: activeSessions.length
    });
    
  } catch (error) {
    console.error('❌ Error getting active sessions:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get active sessions'
    });
  }
});

module.exports = router;
