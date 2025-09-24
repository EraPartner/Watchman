import { BitcoinService } from './BitcoinService.js';
import { AdGuardService } from './AdGuardService.js';
import { TorService } from './TorService.js';
import { TorManager } from './TorManager.js';
import { QBittorrentService } from './QBittorrentService.js';
import SynologyService from './SynologyService.js';
import RoonService from './RoonService.js';

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
        timeout: parseInt(process.env.BITCOIN_TIMEOUT) || 50000, // 50 seconds for Bitcoin RPC
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
      
      // Initialize qBittorrent service
      const qbittorrentService = new QBittorrentService({
        baseUrl: process.env.QBITTORRENT_URL || 'http://192.168.0.143:8069',
        timeout: parseInt(process.env.QBITTORRENT_TIMEOUT) || 10000
        // Note: username and password are now handled internally via environment variables
      });
      this.services.set('qbittorrent', qbittorrentService);
      
      // Initialize Synology service
      const synologyService = new SynologyService();
      this.services.set('synology', synologyService);

      // Initialize Roon service (optional - requires ROON_HOST)
      const roonService = new RoonService({
        host: process.env.ROON_HOST,
        ports: process.env.ROON_PORTS || process.env.ROON_DEFAULT_PORT,
        timeout: parseInt(process.env.ROON_TIMEOUT) || 3000,
        pingCount: parseInt(process.env.ROON_PING_COUNT) || 2,
        usePing: process.env.ROON_USE_PING === 'false' ? false : true
      });
      this.services.set('roon', roonService);
      
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

    return await this.torManager.checkHealth();
  }

  getAllServices() {
    return Array.from(this.services.keys());
  }

  isInitialized() {
    return this.initialized;
  }

  async checkAllServicesHealth() {
    const healthResults = {};
    
    // Check all registered services
    for (const serviceName of this.services.keys()) {
      try {
        healthResults[serviceName] = await this.getServiceHealth(serviceName);
      } catch (error) {
        healthResults[serviceName] = {
          status: 'offline',
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }

    // Also check Tor manager if available
    if (this.torManager) {
      try {
        healthResults['tor-proxy'] = await this.getTorManagerHealth();
      } catch (error) {
        healthResults['tor-proxy'] = {
          status: 'offline',
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }

    return healthResults;
  }

  async cleanup() {
    console.log('🧹 Cleaning up services...');
    
    if (this.torManager) {
      await this.torManager.cleanup();
    }
    
    this.services.clear();
    this.initialized = false;
    console.log('✅ Service cleanup complete');
  }

  async shutdown() {
    console.log('🛑 Shutting down ServiceManager...');
    await this.cleanup();
    console.log('✅ ServiceManager shutdown complete');
  }
}