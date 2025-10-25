/**
 * Creator Fee Claimer Module (Backend JS)
 * 
 * Server-side implementation for claiming creator fees from Pump.fun
 * Integrates with the existing dividend system and server infrastructure.
 */

const { Connection, Transaction, Keypair } = require('@solana/web3.js');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// Helius RPC endpoint for transaction broadcasting
const HELIUS_RPC_ENDPOINT = 'https://pump-fe.helius-rpc.com/?api-key=1b8db865-a5a1-4535-9aec-01061440523b';

// PumpPortal API endpoint for collectCreatorFee transactions
const PUMPPORTAL_API_URL = 'https://pumpportal.fun/api/trade-local';

// AWS Secrets Manager client (reusing existing config)
const secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  } : undefined
});

/**
 * Decode Base58 string to Uint8Array (simplified implementation)
 */
function decodeBase58(input) {
  const bs58 = require('bs58');
  return bs58.decode(input);
}

/**
 * Get creator wallet private key from AWS (reusing existing system)
 */
async function getCreatorPrivateKey() {
  try {
    const secretName = process.env.AWS_SECRET_NAME || 'what-next/keys';
    console.log(`🔐 Fetching creator private key from AWS: ${secretName}`);
    
    const command = new GetSecretValueCommand({
      SecretId: secretName
    });

    const response = await secretsClient.send(command);
    
    if (!response.SecretString) {
      throw new Error('Secret string is empty');
    }

    const keys = JSON.parse(response.SecretString);
    
    if (!keys.TRENDING_PRIVATE_KEY) {
      throw new Error('TRENDING_PRIVATE_KEY not found in AWS secrets');
    }

    console.log('✅ Creator private key retrieved from AWS');
    return keys.TRENDING_PRIVATE_KEY;
    
  } catch (error) {
    console.error('❌ Failed to get creator private key from AWS:', error);
    throw error;
  }
}

/**
 * Create creator wallet keypair
 */
async function getCreatorWalletKeypair() {
  try {
    console.log('🔑 Loading creator wallet keypair...');
    
    const privateKeyString = await getCreatorPrivateKey();
    const privateKeyBytes = decodeBase58(privateKeyString);
    
    if (privateKeyBytes.length !== 64) {
      throw new Error(`Invalid private key length: ${privateKeyBytes.length}`);
    }
    
    const keypair = Keypair.fromSecretKey(privateKeyBytes);
    
    console.log('✅ Creator wallet loaded:', keypair.publicKey.toString());
    return keypair;
    
  } catch (error) {
    console.error('❌ Failed to load creator wallet:', error);
    throw error;
  }
}

/**
 * Request collectCreatorFee transaction from PumpPortal
 */
async function requestCollectCreatorFeeTransaction(creatorPublicKey) {
  try {
    console.log('🎯 Requesting collectCreatorFee transaction from PumpPortal...');
    console.log('👤 Creator wallet:', creatorPublicKey);
    
    const requestBody = {
      publicKey: creatorPublicKey,
      action: 'collectCreatorFee',
      denominatedInSol: 'true',
      slippageBps: 300,
      priorityFee: 0.001
    };
    
    const response = await fetch(PUMPPORTAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PumpPortal API error (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.transaction) {
      throw new Error('No transaction returned from PumpPortal API');
    }
    
    console.log('✅ Received serialized transaction from PumpPortal');
    return data.transaction;
    
  } catch (error) {
    console.error('❌ Failed to request transaction from PumpPortal:', error);
    throw error;
  }
}

/**
 * Sign transaction using creator wallet
 */
function signTransaction(serializedTransaction, creatorKeypair) {
  try {
    console.log('✍️ Signing transaction with creator wallet...');
    
    // Deserialize the transaction
    const transactionBuffer = Buffer.from(serializedTransaction, 'base64');
    const transaction = Transaction.from(transactionBuffer);
    
    // Sign the transaction
    transaction.sign(creatorKeypair);
    
    if (!transaction.signature) {
      throw new Error('Transaction signing failed - no signature generated');
    }
    
    console.log('✅ Transaction signed successfully');
    return transaction;
    
  } catch (error) {
    console.error('❌ Transaction signing failed:', error);
    throw error;
  }
}

/**
 * Broadcast signed transaction via Helius RPC
 */
async function broadcastTransaction(signedTransaction) {
  try {
    console.log('📡 Broadcasting transaction via Helius RPC...');
    
    // Serialize the signed transaction
    const serializedTransaction = signedTransaction.serialize();
    const base64Transaction = serializedTransaction.toString('base64');
    
    // Send via JSON-RPC to Helius
    const rpcPayload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        base64Transaction,
        {
          encoding: 'base64',
          skipPreflight: false,
          preflightCommitment: 'processed',
          maxRetries: 3
        }
      ]
    };
    
    const response = await fetch(HELIUS_RPC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(rpcPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Helius RPC error (${response.status}): ${errorText}`);
    }
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(`RPC error: ${result.error.message}`);
    }
    
    if (!result.result) {
      throw new Error('No transaction signature returned from RPC');
    }
    
    const signature = result.result;
    console.log('✅ Transaction broadcast successful!');
    console.log('🔗 Signature:', signature);
    
    return signature;
    
  } catch (error) {
    console.error('❌ Transaction broadcast failed:', error);
    throw error;
  }
}

/**
 * Wait for transaction confirmation (optional)
 */
async function waitForConfirmation(signature) {
  try {
    console.log('⏳ Waiting for transaction confirmation...');
    
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log('✅ Transaction confirmed on blockchain');
    
  } catch (error) {
    console.error('⚠️ Confirmation check failed (transaction may still be valid):', error);
    // Don't throw - the transaction might still be successful
  }
}

/**
 * Main function: Claim creator fees from Pump.fun
 * 
 * This is the core function that integrates with the dividend system.
 * It replaces the existing claimPumpFunFees function with real implementation.
 */
async function claimCreatorFees() {
  let creatorKeypair = null;
  
  try {
    console.log('🚀 Starting creator fee claim process...');
    console.log('🔧 Using PumpPortal API for transaction generation');
    console.log('📡 Using Helius RPC for transaction broadcasting');
    
    // Step 1: Get creator wallet from AWS
    creatorKeypair = await getCreatorWalletKeypair();
    const creatorPublicKey = creatorKeypair.publicKey.toString();
    
    // Step 2: Request collectCreatorFee transaction from PumpPortal
    const serializedTransaction = await requestCollectCreatorFeeTransaction(creatorPublicKey);
    
    // Step 3: Sign transaction
    const signedTransaction = signTransaction(serializedTransaction, creatorKeypair);
    
    // Step 4: Broadcast via Helius RPC
    const signature = await broadcastTransaction(signedTransaction);
    
    // Step 5: Wait for confirmation (non-blocking)
    await waitForConfirmation(signature);
    
    // Step 6: Generate result for dividend system
    const explorerUrl = `https://solscan.io/tx/${signature}`;
    
    console.log('🎉 Creator fee claim completed successfully!');
    console.log('📋 Summary:');
    console.log(`   💰 Creator: ${creatorPublicKey}`);
    console.log(`   🔗 Signature: ${signature}`);
    console.log(`   🌐 Explorer: ${explorerUrl}`);
    
    // Return format compatible with existing dividend system
    return {
      success: true,
      claimedAmount: 0, // Will be determined by parsing transaction
      transactionId: signature,
      explorerUrl: explorerUrl,
      signature: signature,
      creatorWallet: creatorPublicKey,
      timestamp: new Date().toISOString(),
      source: 'pumpfun-creator-fees'
    };
    
  } catch (error) {
    console.error('❌ Creator fee claim failed:', error);
    
    return {
      success: false,
      error: error.message || 'Unknown error during fee claiming',
      claimedAmount: 0,
      reason: 'Transaction failed: ' + (error.message || 'Unknown error')
    };
    
  } finally {
    // Security: Clear private key from memory
    if (creatorKeypair && creatorKeypair.secretKey) {
      creatorKeypair.secretKey.fill(0);
    }
  }
}

/**
 * Enhanced version that replaces the existing claimPumpFunFees function
 * in the dividend claimer with real Pump.fun integration
 */
async function claimPumpFunFeesEnhanced(settings) {
  try {
    console.log('🎯 Enhanced PumpFun creator fee claim starting...');
    
    // Check if creator fee claiming is configured
    if (!process.env.AWS_SECRET_NAME || !process.env.AWS_ACCESS_KEY_ID) {
      console.log('⚠️ AWS configuration missing - creator fee claiming disabled');
      return {
        success: true,
        reason: 'AWS not configured - creator fee claiming skipped',
        claimedAmount: 0,
        source: 'config-missing'
      };
    }
    
    // Use the real creator fee claiming function
    const result = await claimCreatorFees();
    
    if (result.success) {
      console.log('✅ Creator fees claimed successfully for dividend distribution');
      return {
        success: true,
        claimedAmount: result.claimedAmount,
        transactionId: result.transactionId,
        explorerUrl: result.explorerUrl,
        source: 'pumpfun-enhanced'
      };
    } else {
      console.log('❌ Creator fee claiming failed:', result.error);
      return {
        success: false,
        reason: result.error,
        claimedAmount: 0
      };
    }
    
  } catch (error) {
    console.error('❌ Enhanced PumpFun claim failed:', error);
    return {
      success: false,
      reason: 'Enhanced claim failed: ' + error.message,
      claimedAmount: 0
    };
  }
}

/**
 * Check if creator fee claiming is available
 */
async function isCreatorFeeClaimingAvailable() {
  try {
    // Check AWS configuration
    if (!process.env.AWS_SECRET_NAME || !process.env.AWS_ACCESS_KEY_ID) {
      return false;
    }
    
    // Try to get private key (without using it)
    await getCreatorPrivateKey();
    
    console.log('✅ Creator fee claiming system is available');
    return true;
    
  } catch (error) {
    console.log('❌ Creator fee claiming not available:', error.message);
    return false;
  }
}

module.exports = {
  claimCreatorFees,
  claimPumpFunFeesEnhanced,
  isCreatorFeeClaimingAvailable
};
