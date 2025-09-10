import dotenv from 'dotenv';
import BitcoinService from './services/BitcoinService.js';

// Load environment variables
dotenv.config();

async function testBitcoinService() {
  console.log('Environment variables:');
  console.log('BITCOIN_ONION_URL:', process.env.BITCOIN_ONION_URL);
  console.log('BITCOIN_RPC_USER:', process.env.BITCOIN_RPC_USER);
  console.log('BITCOIN_RPC_PASSWORD:', process.env.BITCOIN_RPC_PASSWORD ? '[HIDDEN]' : 'NOT SET');
  console.log('BITCOIN_RPC_PORT:', process.env.BITCOIN_RPC_PORT);
  
  const service = new BitcoinService({
    onionHost: process.env.BITCOIN_ONION_URL,
    rpcUser: process.env.BITCOIN_RPC_USER,
    rpcPassword: process.env.BITCOIN_RPC_PASSWORD,
    rpcPort: parseInt(process.env.BITCOIN_RPC_PORT || '8332'),
    torProxy: 'socks5h://127.0.0.1:9050'
  });
  
  try {
    console.log('Testing Bitcoin service health check...');
    const health = await service.checkHealth();
    console.log('Health check result:', JSON.stringify(health, null, 2));
  } catch (error) {
    console.error('Error testing Bitcoin service:', error.message);
    console.error('Full error:', error);
  }
}

testBitcoinService();