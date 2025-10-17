#!/usr/bin/env node

/**
 * Setup script for dividend system
 * Initializes database schema and configuration
 */

const { getSupabaseAdminClient } = require('../database.js');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * Encrypt a private key for secure storage
 */
function encryptPrivateKey(privateKey, password) {
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipherGCM(algorithm, Buffer.from(password, 'hex'));
  
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  return `${encrypted}:${iv.toString('hex')}:${tag.toString('hex')}`;
}

/**
 * Generate a new encryption key
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Setup dividend system
 */
async function setupDividendSystem() {
  try {
    console.log('🚀 Setting up dividend system...');
    
    const supabase = getSupabaseAdminClient();
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, '../database/dividends-schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📊 Creating database schema...');
    const { error: schemaError } = await supabase.rpc('exec_sql', { sql: schemaSQL });
    
    if (schemaError) {
      throw new Error('Schema creation failed: ' + schemaError.message);
    }
    
    console.log('✅ Database schema created successfully');
    
    // Read and execute initialization
    const initPath = path.join(__dirname, '../database/dividend-initialization.sql');
    const initSQL = fs.readFileSync(initPath, 'utf8');
    
    console.log('🔧 Initializing dividend settings...');
    const { error: initError } = await supabase.rpc('exec_sql', { sql: initSQL });
    
    if (initError) {
      throw new Error('Initialization failed: ' + initError.message);
    }
    
    console.log('✅ Dividend system initialized successfully');
    
    // Generate encryption key
    const encryptionKey = generateEncryptionKey();
    console.log('🔐 Generated encryption key for wallet security');
    console.log('⚠️  IMPORTANT: Add this to your environment variables:');
    console.log(`WALLET_ENCRYPTION_KEY=${encryptionKey}`);
    console.log('');
    
    // Instructions for manual setup
    console.log('📋 MANUAL SETUP REQUIRED:');
    console.log('1. Set your environment variables:');
    console.log('   - WALLET_ENCRYPTION_KEY (shown above)');
    console.log('   - SOLANA_RPC_URL (your Solana RPC endpoint)');
    console.log('');
    console.log('2. Update auto_claim_settings table with your values:');
    console.log('   - token_mint_address: Your token\'s mint address');
    console.log('   - pumpfun_fee_account: PumpFun fee account to claim from');
    console.log('   - claim_wallet_private_key_encrypted: Encrypted private key');
    console.log('');
    console.log('3. Use the admin API to encrypt and store your wallet private key');
    console.log('');
    console.log('✅ Dividend system setup complete!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  // eslint-disable-next-line sonarjs/prefer-top-level-await
  setupDividendSystem();
}

module.exports = {
  setupDividendSystem,
  encryptPrivateKey,
  generateEncryptionKey
};
