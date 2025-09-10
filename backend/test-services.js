import ServiceManager from './services/ServiceManager.js';

async function testServices() {
  try {
    console.log('🔧 Testing ServiceManager initialization...');
    const manager = new ServiceManager();
    await manager.initializeServices();
    console.log('✅ Services initialized successfully - TorService error fixed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testServices();