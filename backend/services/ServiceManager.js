import { BitcoinService } from './BitcoinService.js';
import { AdGuardService } from './AdGuardService.js';
import { TorService } from './TorService.js';
import { TorManager } from './TorManager.js';

export default class ServiceManager {
  constructor() {
    this.services = new Map();
    this.torManager = null;
    this.initialized = false;
  }

  async initializeServices() {
    console.log('🔧 Initializing services...');
    
    try {
      // Initialize Tor Manager and start Tor
      this.torManager = new TorManager();
      await this.torManager.initialize();
      
      // Start Tor if it's not already running
      console.log('🚀 Starting Tor proxy...');
      await this.torManager.startTor();
      
      // Initialize Bitcoin service with proper onion URL configuration
      const bitcoinService = new BitcoinService({
        rpcUrl: `http://${process.env.BITCOIN_ONION_URL}:${process.env.BITCOIN_RPC_PORT}` || 'http://127.0.0.1:8332',
        rpcUser: process.env.BITCOIN_RPC_USER,
        rpcPassword: process.env.BITCOIN_RPC_PASSWORD,
        useProxy: process.env.TOR_USE_PROXY === 'true',
        torProxy: {
          host: process.env.TOR_PROXY_HOST || '127.0.0.1',
          port: parseInt(process.env.TOR_PROXY_PORT) || 9050
        }
      });
      this.services.set('bitcoin', bitcoinService);
      
      // Initialize AdGuard service
      const adguardService = new AdGuardService({
        baseUrl: process.env.ADGUARD_MAIN_URL || process.env.ADGUARD_URL || 'http://localhost:3000',
        authToken: process.env.ADGUARD_MAIN_AUTH,
        username: process.env.ADGUARD_USERNAME,
        password: process.env.ADGUARD_PASSWORD,
        timeout: parseInt(process.env.ADGUARD_TIMEOUT) || 5000
      });
      this.services.set('adguard', adguardService);
      
      // Initialize Tor service
      const torService = new TorService({
        relayNickname: process.env.TOR_RELAY_NICKNAME || 'default-relay',
        onionooBaseUrl: process.env.TOR_ONIONOO_URL || 'https://onionoo.torproject.org',
        timeout: parseInt(process.env.TOR_TIMEOUT) || 10000,
        useProxy: process.env.TOR_USE_PROXY === 'true' || false,
        torProxy: {
          host: process.env.TOR_PROXY_HOST || '127.0.0.1',
          port: parseInt(process.env.TOR_PROXY_PORT) || 9050
        }
      });
      this.services.set('tor', torService);
      
      this.initialized = true;
      console.log('✅ All services initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize services:', error.message);
      throw error;
    }
  }

  getService(serviceName) {
    return this.services.get(serviceName);
  }

  async getServiceHealth(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      return {
        status: 'offline',
        error: `Service '${serviceName}' not found`,
        timestamp: new Date().toISOString()
      };
    }

    try {
      return await service.checkHealth();
    } catch (error) {
      return {
        status: 'offline',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getServiceStats(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service '${serviceName}' not found`);
    }

    return await service.getStats();
  }

  async getTorManagerHealth() {
    if (!this.torManager) {
      return {
        status: 'offline',
        error: 'Tor manager not initialized',
        timestamp: new Date().toISOString()
      };
    }

    return await this.torManager.getHealth();
  }

  getAllServices() {
    return Array.from(this.services.keys());
  }

  isInitialized() {
    return this.initialized;
  }
}