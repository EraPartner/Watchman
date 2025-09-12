import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import SynologyService from './services/SynologyService.js';

console.log('=== Testing Updated Synology Service ===');

async function testSynologyService() {
  const synologyService = new SynologyService();
  
  console.log('Testing system info...');
  try {
    const systemInfo = await synologyService.getSystemInfo();
    console.log('✅ System Info:', systemInfo);
  } catch (error) {
    console.error('❌ System Info failed:', error.message);
  }
  
  console.log('\nTesting health check...');
  try {
    const health = await synologyService.checkHealth();
    console.log('✅ Health Check:', health);
  } catch (error) {
    console.error('❌ Health Check failed:', error.message);
  }
  
  console.log('\nTesting full stats...');
  try {
    const stats = await synologyService.getStats();
    console.log('✅ Full Stats Success!');
    console.log('- System:', stats.system?.name, stats.system?.model);
    console.log('- CPU Usage:', stats.cpu?.usage + '%');
    console.log('- Memory Usage:', stats.memory?.usage + '%');
    console.log('- Disk Usage:', stats.disk?.usage + '%');
    console.log('- Status:', stats.status);
  } catch (error) {
    console.error('❌ Full Stats failed:', error.message);
  }
  
  synologyService.disconnect();
}

testSynologyService();