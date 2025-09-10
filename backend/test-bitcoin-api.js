import fetch from 'node-fetch';

async function testBitcoinAPI() {
  try {
    console.log('Testing Bitcoin health endpoint...');
    const healthRes = await fetch('http://localhost:3001/api/bitcoin/health');
    const health = await healthRes.json();
    console.log('Health response:', JSON.stringify(health, null, 2));
    
    console.log('\nTesting Bitcoin stats endpoint...');
    const statsRes = await fetch('http://localhost:3001/api/bitcoin/stats');
    const stats = await statsRes.json();
    console.log('Stats response:', JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testBitcoinAPI();