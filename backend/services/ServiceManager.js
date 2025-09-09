import AdGuardService from './AdGuardService.js';
import TorService from './TorService.js';
import TorManager from './TorManager.js';

class ServiceManager {
  constructor() {
    this.services = new Map();
    this.torManager = null;
    this.initializeServices();
  }

  async initializeServices() {
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

    // Initialize Tor Manager and Tor service
    if (process.env.TOR_RELAY_NICKNAME) {
      const useProxy = process.env.TOR_USE_PROXY === 'true';
      
      // Only start Tor manager if proxy is enabled
      if (useProxy) {
        this.torManager = new TorManager({
          socksPort: parseInt(process.env.TOR_PROXY_PORT || '9050'),
          dataDir: process.env.TOR_DATA_DIR || '.tor-data'
        });

        console.log('🔧 Starting Tor proxy...');
        const torStarted = await this.torManager.startTor();
        
        if (!torStarted) {
          console.log('❌ Failed to start Tor proxy - using clearnet instead');
          useProxy = false;
        }
      }

      // Initialize Tor service (with or without proxy)
      const torService = new TorService({
        relayNickname: process.env.TOR_RELAY_NICKNAME,
        onionooBaseUrl: process.env.TOR_RELAY_URL,
        timeout: useProxy ? 15000 : 10000, // Longer timeout for proxy connections
        useProxy: useProxy,
        torProxy: useProxy ? {
          host: process.env.TOR_PROXY_HOST || '127.0.0.1',
          port: parseInt(process.env.TOR_PROXY_PORT || '9050'),
          type: 5
        } : null
      });
      
      this.services.set('tor', torService);
      
      if (useProxy) {
        console.log('✅ Tor service initialized with proxy routing');
      } else {
        console.log('✅ Tor service initialized using clearnet API');
      }
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

  async shutdown() {
    console.log('🛑 Shutting down services...');
    
    // Stop Tor manager if it exists
    if (this.torManager) {
      await this.torManager.stopTor();
    }
    
    console.log('✅ All services shut down');
  }

  async getTorManagerHealth() {
    if (!this.torManager) {
      return { status: 'not_configured' };
    }
    return await this.torManager.checkHealth();
  }
}

export default ServiceManager;