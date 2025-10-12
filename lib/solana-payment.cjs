const { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  Keypair, 
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const bs58 = require('bs58');

// Solana RPC configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Initialize AWS Secrets Manager client
const secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  } : undefined
});

/**
 * Fetch the trending wallet private key from AWS Secrets Manager
 * SECURITY: Private key is ONLY stored in AWS, never in environment variables or logs
 */
async function getTrendingPrivateKey() {
  try {
    const secretName = process.env.AWS_SECRET_NAME || 'what-next/keys';
    console.log(`🔐 Fetching private key from AWS Secrets Manager: ${secretName}`);
    
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

    console.log('✅ Private key securely fetched from AWS');
    // Private key is immediately used and never logged or stored
    return keys.TRENDING_PRIVATE_KEY;
  } catch (error) {
    console.error('❌ Failed to fetch private key from AWS Secrets Manager');
    console.error('   Ensure AWS credentials are configured in .env file');
    throw error;
  }
}

/**
 * Get the trending wallet keypair from AWS
 */
async function getTrendingWallet() {
  try {
    console.log('🔑 Loading trending wallet from AWS...');
    
    const privateKeyString = await getTrendingPrivateKey();
    
    // Decode the base58 private key (handle both CommonJS default export patterns)
    const bs58Decoder = bs58.default || bs58;
    const privateKeyBytes = bs58Decoder.decode(privateKeyString);
    
    // Create keypair from private key
    const keypair = Keypair.fromSecretKey(privateKeyBytes);
    
    console.log('✅ Trending wallet loaded:', keypair.publicKey.toBase58());
    
    return keypair;
  } catch (error) {
    console.error('❌ Failed to load trending wallet:', error);
    throw error;
  }
}

/**
 * Validate a Solana address
 */
function isValidSolanaAddress(address) {
  try {
    if (address.length < 32 || address.length > 44) {
      return false;
    }
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Solana Payment Service for handling claim payouts
 */
class SolanaPaymentService {
  constructor() {
    this.connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    this.payoutWallet = null;
    this.initialized = false;
  }

  /**
   * Initialize the payout wallet from AWS
   */
  async initialize() {
    if (this.initialized) {
      console.log('💡 Payment service already initialized');
      return;
    }

    try {
      console.log('🚀 Initializing Solana Payment Service...');
      this.payoutWallet = await getTrendingWallet();
      
      if (!this.payoutWallet) {
        throw new Error('Payout wallet not initialized');
      }

      const balance = await this.connection.getBalance(this.payoutWallet.publicKey);
      
      console.log('✅ Payment service initialized:', {
        payoutAddress: this.payoutWallet.publicKey.toBase58(),
        balance: (balance / LAMPORTS_PER_SOL).toFixed(4) + ' SOL',
        rpcUrl: SOLANA_RPC_URL
      });

      this.initialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize payment service:', error);
      throw error;
    }
  }

  /**
   * Send SOL to a recipient address
   * @param {string} recipientAddress The wallet address to send SOL to
   * @param {number} amountLamports The amount in lamports to send
   * @returns {Promise<string>} Transaction signature if successful
   */
  async sendSOL(recipientAddress, amountLamports) {
    if (!this.initialized || !this.payoutWallet) {
      throw new Error('Payment service not initialized. Call initialize() first.');
    }

    // Validate recipient address
    if (!isValidSolanaAddress(recipientAddress)) {
      throw new Error(`Invalid recipient address: ${recipientAddress}`);
    }

    // Validate amount
    if (amountLamports <= 0) {
      throw new Error(`Invalid amount: ${amountLamports} lamports`);
    }

    try {
      const recipientPublicKey = new PublicKey(recipientAddress);

      // Check payout wallet balance
      const balance = await this.connection.getBalance(this.payoutWallet.publicKey);
      const requiredAmount = amountLamports + 5000; // Add 5000 lamports for transaction fee

      if (balance < requiredAmount) {
        throw new Error(
          `Insufficient balance. Required: ${requiredAmount / LAMPORTS_PER_SOL} SOL, Available: ${balance / LAMPORTS_PER_SOL} SOL`
        );
      }

      console.log('💸 Preparing SOL transfer:', {
        from: this.payoutWallet.publicKey.toBase58(),
        to: recipientAddress,
        amountSOL: (amountLamports / LAMPORTS_PER_SOL).toFixed(6),
        lamports: amountLamports,
        currentBalance: (balance / LAMPORTS_PER_SOL).toFixed(4) + ' SOL'
      });

      // Create transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.payoutWallet.publicKey,
          toPubkey: recipientPublicKey,
          lamports: amountLamports
        })
      );

      // Send and confirm transaction
      console.log('📡 Sending transaction to Solana network...');
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payoutWallet],
        {
          commitment: 'confirmed',
          maxRetries: 3
        }
      );

      console.log('✅ SOL transfer successful:', {
        signature,
        to: recipientAddress,
        amountSOL: (amountLamports / LAMPORTS_PER_SOL).toFixed(6),
        explorerUrl: `https://solscan.io/tx/${signature}`
      });

      return signature;

    } catch (error) {
      console.error('❌ SOL transfer failed:', {
        error: error instanceof Error ? error.message : String(error),
        to: recipientAddress,
        amountLamports
      });
      throw error;
    }
  }

  /**
   * Get the current balance of the payout wallet
   * @returns {Promise<number>} Balance in SOL
   */
  async getPayoutWalletBalance() {
    if (!this.initialized || !this.payoutWallet) {
      throw new Error('Payment service not initialized');
    }

    const balance = await this.connection.getBalance(this.payoutWallet.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  /**
   * Get the payout wallet address
   * @returns {string|null} The public key as a string, or null if not initialized
   */
  getPayoutWalletAddress() {
    if (!this.payoutWallet) {
      return null;
    }
    return this.payoutWallet.publicKey.toBase58();
  }

  /**
   * Check if the payment service is initialized
   * @returns {boolean} True if initialized
   */
  isInitialized() {
    return this.initialized;
  }
}

// Export singleton instance
const solanaPaymentService = new SolanaPaymentService();

module.exports = {
  SolanaPaymentService,
  solanaPaymentService,
  isValidSolanaAddress
};

