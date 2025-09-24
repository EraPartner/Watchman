import RoonService from './services/RoonService.js';

(async () => {
  try {
    // Use localhost which should respond to ICMP on most systems
    const svc = new RoonService({ host: '127.0.0.1', usePing: true, pingCount: 1, timeout: 2000 });
    const res = await svc.checkHealth();
    console.log('RoonService.checkHealth() result:');
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();
