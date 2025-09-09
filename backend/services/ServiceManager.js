import AdGuardService from './AdGuardService.js';
import TorService from './TorService.js';

class ServiceManager {
  constructor() {
    this.services = new Map();
    this.initializeServices();
  }

  initializeServices() {
    // Initialize AdGuard service
    if (process.env.ADGUARD_MAIN_URL && process.env.ADGUARD_MAIN_AUTH) {
      const adguardService = new AdGuardService({
        baseUrl: process.env.ADGUARD_MAIN_URL,
        authToken: process.env.ADGUARD_MAIN_AUTH,
        timeout: 10000
      });
      this.services.set('adguard', adguardService);
      console.log('✅ AdGuard service initialized');
    } else {
      console.log('⚠️  AdGuard service not configured (missing URL or AUTH)');
    }

    // Initialize Tor service
    if (process.env.TOR_RELAY_NICKNAME) {
      const torService = new TorService({
        relayNickname: process.env.TOR_RELAY_NICKNAME,
        onionooBaseUrl: process.env.TOR_RELAY_URL || 'https://onionoo.torproject.org',
        timeout: 10000
      });
      this.services.set('tor', torService);
      console.log('✅ Tor service initialized');
    } else {
      console.log('⚠️  Tor service not configured (missing NICKNAME)');
    }
  }

  getService(name) {
    return this.services.get(name);
  }

  async checkAllServicesHealth() {
    const results = {};
    
    for (const [name, service] of this.services) {
      try {
        results[name] = await service.checkHealth();
      } catch (error) {
        results[name] = {
          status: 'offline',
          error: error.message,
          lastCheck: new Date()
        };
      }
    }
    
    return results;
  }

  async getServiceStats(serviceName) {
    const service = this.getService(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }
    
    return await service.getStats();
  }

  async getServiceHealth(serviceName) {
    const service = this.getService(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }
    
    return await service.checkHealth();
  }
}

export default ServiceManager;