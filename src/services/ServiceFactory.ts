import { AdGuardService } from './adguard/AdGuardService';
import { TorService } from './tor/TorService';
import { BaseService, ServiceConfig } from './base/BaseService';
import { logger } from '../lib/logger';

export type ServiceType = 'adguard' | 'synology' | 'qbittorrent' | 'bitcoin' | 'tor';

export class ServiceFactory {
  private static services: Map<string, BaseService> = new Map();

  static createService(id: string, type: ServiceType, config: ServiceConfig): BaseService {
    let service: BaseService;

    try {
      logger.debug(`Creating service: ${id} (type: ${type})`);
      
      switch (type) {
        case 'adguard': {
          service = new AdGuardService(config);
          break;
        }
        case 'tor': {
          service = new TorService(config);
          break;
        }
        // TODO: Add other service types here
        default: {
          const error = new Error(`Unsupported service type: ${type}`);
          logger.serviceCreationFailed(id, type, error);
          throw error;
        }
      }

      this.services.set(id, service);
      logger.serviceCreated(id);
      return service;
    } catch (error) {
      logger.serviceCreationFailed(id, type, error);
      const errorMessage = `Failed to create service ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      throw new Error(errorMessage);
    }
  }

  static getService(id: string): BaseService | undefined {
    const service = this.services.get(id);
    if (!service) {
      logger.serviceNotFound(id);
    }
    return service;
  }

  static getAllServices(): Map<string, BaseService> {
    return new Map(this.services);
  }

  static removeService(id: string): boolean {
    const success = this.services.delete(id);
    if (success) {
      logger.info(`Service removed: ${id}`);
    } else {
      logger.warn(`Failed to remove service (not found): ${id}`);
    }
    return success;
  }
}