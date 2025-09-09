import { ServiceFactory } from '../services/ServiceFactory';
import { logger } from '../lib/logger';

export const initializeServices = () => {
  try {
    logger.info('Initializing services...');
    
    // Initialize AdGuard Home
    ServiceFactory.createService('adguard-main', 'adguard', {
      name: 'AdGuard Home',
      baseUrl: import.meta.env.VITE_ADGUARD_MAIN_URL,
      authToken: import.meta.env.VITE_ADGUARD_MAIN_AUTH,
      timeout: 5000,
    });

    // Initialize Tor Node
    ServiceFactory.createService('tor-main', 'tor', {
      name: 'Tor Relay',
      baseUrl: import.meta.env.VITE_TOR_RELAY_URL,
      timeout: 10000,
    });

    const serviceCount = ServiceFactory.getAllServices().size;
    logger.info(`Services initialized successfully: ${serviceCount}`);
    
    // Log which services have authentication configured
    const mainService = ServiceFactory.getService('adguard-main');
    
    logger.debug('Authentication status:', {
      adguard: mainService?.getConfig().authToken ? 'configured' : 'not configured',
      tor: 'public API'
    });
  } catch (error) {
    const errorMessage = `Failed to initialize services: ${error instanceof Error ? error.message : 'Unknown error'}`;
    logger.error('Service initialization failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    // Re-throw to let the application handle it appropriately
    throw new Error(errorMessage);
  }
};