// Database connection for Railway deployment
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

let supabaseClient = null;
let supabaseAdminClient = null;

/**
 * Get Supabase client for regular operations
 */
function getSupabaseClient() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('⚠️ Missing Supabase environment variables for client');
      return null;
    }
    
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    console.log('✅ Supabase client initialized');
  }
  
  return supabaseClient;
}

/**
 * Get Supabase admin client for server operations
 */
function getSupabaseAdminClient() {
  if (!supabaseAdminClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    let supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    // Fallback to anon key for cloud hosting if service role key is not available
    if (!supabaseServiceKey) {
      console.log('⚠️ SERVICE_ROLE_KEY not found, using ANON key for cloud hosting');
      supabaseServiceKey = process.env.SUPABASE_ANON_KEY;
    }
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('⚠️ Missing Supabase environment variables for admin client');
      return null;
    }
    
    supabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey);
    console.log('✅ Supabase admin client initialized');
  }
  
  return supabaseAdminClient;
}

/**
 * Test database connection
 */
async function testDatabaseConnection(maxRetries = 3) {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    attempts++;
    
    try {
      const supabase = getSupabaseClient();
      
      if (!supabase) {
        console.warn('❌ No Supabase client available');
        return {
          success: false,
          error: 'Supabase client not available',
          attempts
        };
      }
      
      // Simple test query - check if locations table exists
      const { error } = await supabase
        .from('locations')
        .select('id')
        .limit(1);
      
      if (error) {
        console.warn(`Database connection attempt ${attempts} failed:`, error.message);
        if (attempts < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Exponential backoff
          continue;
        }
        return {
          success: false,
          error: error.message,
          attempts
        };
      }
      
      console.log(`✅ Database connection successful (attempt ${attempts})`);
      return {
        success: true,
        attempts
      };
      
    } catch (error) {
      console.warn(`Database connection attempt ${attempts} failed:`, error);
      if (attempts < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Exponential backoff
        continue;
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        attempts
      };
    }
  }
  
  return {
    success: false,
    error: 'Max retry attempts reached',
    attempts
  };
}

/**
 * Initialize database with health checks
 */
async function initializeDatabase() {
  try {
    console.log('🔌 Testing database connection...');
    
    const connectionTest = await testDatabaseConnection(5);
    
    if (!connectionTest.success) {
      console.error(`❌ Database connection failed after ${connectionTest.attempts} attempts: ${connectionTest.error}`);
      return false;
    }
    
    console.log('✅ Database connected and ready');
    return true;
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    return false;
  }
}

/**
 * Graceful shutdown
 */
async function gracefulShutdownHandler() {
  console.log('🔌 Closing database connections...');
  
  // Close Supabase connections (they're HTTP-based, so no explicit close needed)
  supabaseClient = null;
  supabaseAdminClient = null;
  
  console.log('✅ Database connections closed');
}

// ES module exports
export {
  getSupabaseClient,
  getSupabaseAdminClient,
  testDatabaseConnection,
  initializeDatabase,
  gracefulShutdownHandler
};b
