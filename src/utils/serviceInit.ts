import { ServiceFactory } from '../services/ServiceFactory';

export const initializeServices = () => {
  try {
    console.log('🚀 Initializing services...');
    
    // Initialize AdGuard Home
    ServiceFactory.createService('adguard-main', 'adguard', {
      name: 'AdGuard Home',
      baseUrl: import.meta.env.VITE_ADGUARD_MAIN_URL || 'http://127.0.0.1:5213',
      authToken: import.meta.env.VITE_ADGUARD_MAIN_AUTH, // Base64 encoded auth string
      timeout: 5000,
    });

    // Initialize Tor Node
    ServiceFactory.createService('tor-main', 'tor', {
      name: 'Tor Relay',
      baseUrl: 'http://192.168.0.143:56234',
      timeout: 10000,
    });

    console.log('✅ Services initialized successfully:', ServiceFactory.getAllServices().size);
    
    // Log which services have authentication configured
    const mainService = ServiceFactory.getService('adguard-main');
    const torService = ServiceFactory.getService('tor-main');
    
    console.log('🔐 Authentication status:', 
      mainService?.getConfig().authToken ? 'AdGuard Home ✓' : 'AdGuard Home ✗',
      'Tor Node ✓'
    );
  } catch (error) {
    const errorMessage = `Failed to initialize services: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error('❌ Service initialization failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    // Re-throw to let the application handle it appropriately
    throw new Error(errorMessage);
  }
};