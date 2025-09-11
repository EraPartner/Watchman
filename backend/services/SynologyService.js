import snmp from 'net-snmp';

class SynologyService {
  constructor() {
    this.session = null;
    this.isConnected = false;
    this.lastData = null;
    this.initializeSession();
    
    // Synology SNMP OIDs
    this.oids = {
      // System Info
      systemName: '1.3.6.1.2.1.1.5.0',
      systemUptime: '1.3.6.1.2.1.1.3.0',
      systemModel: '1.3.6.1.4.1.6574.1.5.1.0',
      systemVersion: '1.3.6.1.4.1.6574.1.5.3.0',
      systemStatus: '1.3.6.1.4.1.6574.1.1.0',
      
      // CPU
      cpuUsage: '1.3.6.1.4.1.6574.1.5.2.0',
      cpuTemp: '1.3.6.1.4.1.6574.1.2.0',
      
      // Memory
      memoryTotal: '1.3.6.1.4.1.6574.1.5.4.0',
      memoryAvailable: '1.3.6.1.4.1.6574.1.5.5.0',
      memoryUsage: '1.3.6.1.4.1.6574.1.5.6.0',
      
      // Disk
      diskTotal: '1.3.6.1.4.1.6574.2.1.1.4.0',
      diskUsed: '1.3.6.1.4.1.6574.2.1.1.5.0',
      diskUsage: '1.3.6.1.4.1.6574.2.1.1.6.0',
      
      // Network
      networkRx: '1.3.6.1.2.1.2.2.1.10.1',
      networkTx: '1.3.6.1.2.1.2.2.1.16.1',
      
      // Services
      services: '1.3.6.1.4.1.6574.6.1.1.2',
      servicesStatus: '1.3.6.1.4.1.6574.6.1.1.3'
    };
  }

  initializeSession() {
    try {
      // Check if required environment variables are present
      if (!process.env.SYNOLOGY_HOST) {
        console.warn('SYNOLOGY_HOST not configured, Synology service will be unavailable');
        return;
      }

      if (!process.env.SYNOLOGY_SNMP_USERNAME || !process.env.SYNOLOGY_SNMP_AUTH_KEY) {
        console.warn('SNMP credentials not configured, Synology service will be unavailable');
        return;
      }

      // Match the exact configuration that works with snmpwalk
      const options = {
        port: parseInt(process.env.SYNOLOGY_SNMP_PORT) || 161,
        retries: 3,
        timeout: 5000,
        version: snmp.Version3,
        username: process.env.SYNOLOGY_SNMP_USERNAME,
        authProtocol: snmp.AuthProtocols.sha,  // Force SHA (not conditional)
        authKey: process.env.SYNOLOGY_SNMP_AUTH_KEY,
        privProtocol: snmp.PrivProtocols.aes,  // Force AES (not conditional) 
        privKey: process.env.SYNOLOGY_SNMP_PRIV_KEY,
        // Add security level explicitly (equivalent to -l authPriv)
        level: snmp.SecurityLevel.authPriv
      };

      console.log(`Initializing SNMP session to ${process.env.SYNOLOGY_HOST}:${options.port} with user ${options.username}`);
      console.log(`Using SHA auth and AES privacy (authPriv level)`);
      
      this.session = snmp.createV3Session(process.env.SYNOLOGY_HOST, options);
      
      this.session.on('error', (error) => {
        console.error('SNMP session error:', error.message);
        this.isConnected = false;
      });

      this.session.on('close', () => {
        console.log('SNMP session closed');
        this.isConnected = false;
      });

      console.log('SNMP session initialized for Synology NAS');
    } catch (error) {
      console.error('Failed to initialize SNMP session:', error.message);
      this.isConnected = false;
      this.session = null;
    }
  }

  async checkHealth() {
    try {
      const data = await this.getSystemInfo();
      return {
        status: 'online',
        timestamp: new Date().toISOString(),
        data: {
          name: data.name,
          model: data.model,
          version: data.version,
          uptime: this.formatUptime(data.uptime),
          systemStatus: data.status
        }
      };
    } catch (error) {
      return {
        status: 'offline',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getStats() {
    return await this.getAllData();
  }

  async getSystemInfo() {
    return new Promise((resolve, reject) => {
      if (!this.session) {
        reject(new Error('SNMP session not initialized'));
        return;
      }

      const oids = [
        this.oids.systemName,
        this.oids.systemUptime,
        this.oids.systemModel,
        this.oids.systemVersion,
        this.oids.systemStatus
      ];

      this.session.get(oids, (error, varbinds) => {
        if (error) {
          reject(error);
          return;
        }

        const systemInfo = {
          name: varbinds[0]?.value?.toString() || 'Unknown',
          uptime: parseInt(varbinds[1]?.value || 0) / 100, // Convert to seconds
          model: varbinds[2]?.value?.toString() || 'Unknown',
          version: varbinds[3]?.value?.toString() || 'Unknown',
          status: parseInt(varbinds[4]?.value || 0) === 1 ? 'Normal' : 'Warning'
        };

        resolve(systemInfo);
      });
    });
  }

  async getCPUInfo() {
    return new Promise((resolve, reject) => {
      if (!this.session) {
        reject(new Error('SNMP session not initialized'));
        return;
      }

      const oids = [
        this.oids.cpuUsage,
        this.oids.cpuTemp
      ];

      this.session.get(oids, (error, varbinds) => {
        if (error) {
          reject(error);
          return;
        }

        const cpuInfo = {
          usage: parseInt(varbinds[0]?.value || 0),
          temperature: parseInt(varbinds[1]?.value || 0)
        };

        resolve(cpuInfo);
      });
    });
  }

  async getMemoryInfo() {
    return new Promise((resolve, reject) => {
      if (!this.session) {
        reject(new Error('SNMP session not initialized'));
        return;
      }

      const oids = [
        this.oids.memoryTotal,
        this.oids.memoryAvailable,
        this.oids.memoryUsage
      ];

      this.session.get(oids, (error, varbinds) => {
        if (error) {
          reject(error);
          return;
        }

        const totalMB = parseInt(varbinds[0]?.value || 0);
        const availableMB = parseInt(varbinds[1]?.value || 0);
        const usagePercent = parseInt(varbinds[2]?.value || 0);

        const memoryInfo = {
          total: totalMB * 1024 * 1024, // Convert to bytes
          available: availableMB * 1024 * 1024, // Convert to bytes
          used: (totalMB - availableMB) * 1024 * 1024,
          usage: usagePercent
        };

        resolve(memoryInfo);
      });
    });
  }

  async getDiskInfo() {
    return new Promise((resolve, reject) => {
      if (!this.session) {
        reject(new Error('SNMP session not initialized'));
        return;
      }

      const oids = [
        this.oids.diskTotal,
        this.oids.diskUsed,
        this.oids.diskUsage
      ];

      this.session.get(oids, (error, varbinds) => {
        if (error) {
          reject(error);
          return;
        }

        const totalKB = parseInt(varbinds[0]?.value || 0);
        const usedKB = parseInt(varbinds[1]?.value || 0);
        const usagePercent = parseInt(varbinds[2]?.value || 0);

        const diskInfo = {
          total: totalKB * 1024, // Convert to bytes
          used: usedKB * 1024, // Convert to bytes
          free: (totalKB - usedKB) * 1024,
          usage: usagePercent
        };

        resolve(diskInfo);
      });
    });
  }

  async getNetworkInfo() {
    return new Promise((resolve, reject) => {
      if (!this.session) {
        reject(new Error('SNMP session not initialized'));
        return;
      }

      const oids = [
        this.oids.networkRx,
        this.oids.networkTx
      ];

      this.session.get(oids, (error, varbinds) => {
        if (error) {
          reject(error);
          return;
        }

        const networkInfo = {
          bytesReceived: parseInt(varbinds[0]?.value || 0),
          bytesTransmitted: parseInt(varbinds[1]?.value || 0)
        };

        resolve(networkInfo);
      });
    });
  }

  async getAllData() {
    try {
      const [systemInfo, cpuInfo, memoryInfo, diskInfo, networkInfo] = await Promise.all([
        this.getSystemInfo(),
        this.getCPUInfo(),
        this.getMemoryInfo(),
        this.getDiskInfo(),
        this.getNetworkInfo()
      ]);

      const data = {
        status: 'online',
        timestamp: new Date().toISOString(),
        system: systemInfo,
        cpu: cpuInfo,
        memory: memoryInfo,
        disk: diskInfo,
        network: networkInfo,
        lastUpdated: new Date().toISOString()
      };

      this.lastData = data;
      this.isConnected = true;
      return data;
    } catch (error) {
      console.error('Failed to get Synology data:', error);
      this.isConnected = false;
      return {
        status: 'error',
        error: error.message,
        lastData: this.lastData,
        timestamp: new Date().toISOString()
      };
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  disconnect() {
    if (this.session) {
      this.session.close();
      this.session = null;
      this.isConnected = false;
    }
  }
}

export default SynologyService;