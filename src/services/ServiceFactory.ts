import { AdGuardService } from './adguard/AdGuardService';
import { TorService } from './tor/TorService';
import { BaseService, ServiceConfig } from './base/BaseService';

export type ServiceType = 'adguard' | 'synology' | 'qbittorrent' | 'bitcoin' | 'tor';

export class ServiceFactory {
  private static services: Map<string, BaseService> = new Map();

  static createService(id: string, type: ServiceType, config: ServiceConfig): BaseService {
    let service: BaseService;

    try {
      console.log(`🏭 Creating service: ${id} (type: ${type})`);
      
      switch (type) {
        case 'adguard':
          service = new AdGuardService(config);
          break;
        case 'tor':
          service = new TorService(config.baseUrl.split('://')[1].split(':')[0], parseInt(config.baseUrl.split(':')[2] || '9051'));
          break;
        // TODO: Add other service types here
        default:
          const error = new Error(`Unsupported service type: ${type}`);
          console.error('❌ Service creation failed:', error.message);
          throw error;
      }

      this.services.set(id, service);
      console.log(`✅ Service created successfully: ${id}`);
      return service;
    } catch (error) {
      const errorMessage = `Failed to create service ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('❌ ServiceFactory.createService() failed:', {
        id,
        type,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(errorMessage);
    }
  }

  static getService(id: string): BaseService | undefined {
    const service = this.services.get(id);
    if (!service) {
      console.warn(`⚠️ Service not found: ${id}`);
    }
    return service;
  }

  static getAllServices(): Map<string, BaseService> {
    return new Map(this.services);
  }

  static removeService(id: string): boolean {
    const success = this.services.delete(id);
    if (success) {
      console.log(`🗑️ Service removed: ${id}`);
    } else {
      console.warn(`⚠️ Failed to remove service (not found): ${id}`);
    }
    return success;
  }
}