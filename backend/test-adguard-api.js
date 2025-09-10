import { AdGuardService } from './services/AdGuardService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testAdGuardConnection() {
  console.log('🧪 Testing AdGuard API connection...');
  
  try {
    const adguardService = new AdGuardService({
      baseUrl: process.env.ADGUARD_MAIN_URL || 'http://localhost:3000',
      authToken: process.env.ADGUARD_MAIN_AUTH,
      username: process.env.ADGUARD_USERNAME,
      password: process.env.ADGUARD_PASSWORD,
      timeout: 10000
    });

    console.log('📍 AdGuard URL:', process.env.ADGUARD_MAIN_URL || 'http://localhost:3000');
    console.log('🔑 Auth token provided:', !!process.env.ADGUARD_MAIN_AUTH);
    
    // Test health check
    console.log('\n🔍 Testing health check...');
    const health = await adguardService.checkHealth();
    console.log('Health result:', JSON.stringify(health, null, 2));
    
    if (health.status === 'online' || health.status === 'warning') {
      console.log('\n📊 Testing stats retrieval...');
      const stats = await adguardService.getStats();
      console.log('Stats retrieved successfully:');
      console.log('- Version:', stats.version);
      console.log('- Running:', stats.running);
      console.log('- Protection enabled:', stats.protectionEnabled);
      console.log('- Total queries:', stats.totalQueries);
      console.log('- Blocked queries:', stats.blockedQueries);
      console.log('- Blocking rate:', stats.blockingRate + '%');
    }
    
    console.log('\n✅ AdGuard API connection test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ AdGuard API connection test failed:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    // Additional debugging information
    console.log('\n🔍 Debug information:');
    console.log('- Base URL:', process.env.ADGUARD_MAIN_URL);
    console.log('- Auth token available:', !!process.env.ADGUARD_MAIN_AUTH);
    console.log('- Username available:', !!process.env.ADGUARD_USERNAME);
    console.log('- Password available:', !!process.env.ADGUARD_PASSWORD);
  }
}

testAdGuardConnection();