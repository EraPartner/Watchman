import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import ServiceManager from './services/ServiceManager.js';

// Load environment variables
dotenv.config({path:'.env.local'});

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL;

// Initialize service manager
let serviceManager;

async function initializeServer() {
  console.log('🚀 Initializing Watchman Backend Server...');
  
  serviceManager = new ServiceManager();
  await serviceManager.initializeServices();
  
  console.log('✅ Service initialization complete');
}

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'watchman-backend',
    version: '1.0.0'
  });
});

// Tor proxy health endpoint
app.get('/api/tor/proxy/health', async (req, res) => {
  try {
    if (!serviceManager) {
      return res.status(503).json({ error: 'Service manager not initialized' });
    }
    
    const health = await serviceManager.getTorManagerHealth();
    res.json(health);
  } catch (error) {
    console.error('❌ Tor proxy health check failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to check Tor proxy health',
      message: error.message 
    });
  }
});

// AdGuard API endpoints
app.get('/api/adguard/status', async (req, res) => {
  try {
    const adguardService = serviceManager.getService('adguard');
    if (!adguardService) {
      return res.status(503).json({ 
        error: 'AdGuard service not configured',
        status: 'offline'
      });
    }

    const health = await serviceManager.getServiceHealth('adguard');
    console.log(`✅ AdGuard status connection successful`);
    res.json(health);
  } catch (error) {
    console.error('❌ AdGuard status connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch AdGuard status',
      status: 'offline',
      message: error.message 
    });
  }
});

app.get('/api/adguard/stats', async (req, res) => {
  try {
    const adguardService = serviceManager.getService('adguard');
    if (!adguardService) {
      return res.status(503).json({ error: 'AdGuard service not configured' });
    }

    const stats = await serviceManager.getServiceStats('adguard');
    console.log(`✅ AdGuard stats connection successful`);
    res.json(stats);
  } catch (error) {
    console.error('❌ AdGuard stats connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch AdGuard stats',
      message: error.message 
    });
  }
});

app.post('/api/adguard/protection', async (req, res) => {
  try {
    const adguardService = serviceManager.getService('adguard');
    if (!adguardService) {
      return res.status(503).json({ error: 'AdGuard service not configured' });
    }

    const { enabled, duration } = req.body;
    await adguardService.setProtection(enabled, duration);
    console.log(`✅ AdGuard protection ${enabled ? 'enabled' : 'disabled'}`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ AdGuard protection toggle failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to toggle AdGuard protection',
      message: error.message 
    });
  }
});

// Bitcoin API endpoints
app.get('/api/bitcoin/health', async (req, res) => {
  try {
    const bitcoinService = serviceManager.getService('bitcoin');
    if (!bitcoinService) {
      return res.status(503).json({ 
        error: 'Bitcoin service not configured',
        status: 'offline'
      });
    }

    const health = await serviceManager.getServiceHealth('bitcoin');
    console.log(`✅ Bitcoin health connection successful`);
    res.json(health);
  } catch (error) {
    console.error('❌ Bitcoin health connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Bitcoin health',
      status: 'offline',
      message: error.message 
    });
  }
});

app.get('/api/bitcoin/status', async (req, res) => {
  try {
    const bitcoinService = serviceManager.getService('bitcoin');
    if (!bitcoinService) {
      return res.status(503).json({ 
        error: 'Bitcoin service not configured',
        status: 'offline'
      });
    }

    const health = await serviceManager.getServiceHealth('bitcoin');
    console.log(`✅ Bitcoin status connection successful`);
    res.json(health);
  } catch (error) {
    console.error('❌ Bitcoin status connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Bitcoin status',
      status: 'offline',
      message: error.message 
    });
  }
});

app.get('/api/bitcoin/stats', async (req, res) => {
  try {
    const bitcoinService = serviceManager.getService('bitcoin');
    if (!bitcoinService) {
      return res.status(503).json({ error: 'Bitcoin service not configured' });
    }

    const stats = await serviceManager.getServiceStats('bitcoin');
    console.log(`✅ Bitcoin stats connection successful`);
    res.json(stats);
  } catch (error) {
    console.error('❌ Bitcoin stats connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Bitcoin stats',
      message: error.message 
    });
  }
});

// qBittorrent API endpoints
app.get('/api/qbittorrent/status', async (req, res) => {
  try {
    const qbittorrentService = serviceManager.getService('qbittorrent');
    if (!qbittorrentService) {
      return res.status(503).json({ 
        error: 'qBittorrent service not configured',
        status: 'offline'
      });
    }

    const health = await serviceManager.getServiceHealth('qbittorrent');
    console.log(`✅ qBittorrent status connection successful`);
    res.json(health);
  } catch (error) {
    console.error('❌ qBittorrent status connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch qBittorrent status',
      status: 'offline',
      message: error.message 
    });
  }
});

app.get('/api/qbittorrent/stats', async (req, res) => {
  try {
    const qbittorrentService = serviceManager.getService('qbittorrent');
    if (!qbittorrentService) {
      return res.status(503).json({ error: 'qBittorrent service not configured' });
    }

    const stats = await serviceManager.getServiceStats('qbittorrent');
    console.log(`✅ qBittorrent stats connection successful`);
    res.json(stats);
  } catch (error) {
    console.error('❌ qBittorrent stats connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch qBittorrent stats',
      message: error.message 
    });
  }
});

// Tor API endpoints
app.get('/api/tor/relay/:nickname?', async (req, res) => {
  try {
    const torService = serviceManager.getService('tor');
    if (!torService) {
      return res.status(503).json({ error: 'Tor service not configured' });
    }

    const stats = await serviceManager.getServiceStats('tor');
    console.log(`✅ Tor relay connection successful`);
    res.json(stats);
  } catch (error) {
    console.error('❌ Tor relay connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Tor relay data',
      message: error.message 
    });
  }
});

app.get('/api/tor/health', async (req, res) => {
  try {
    const torService = serviceManager.getService('tor');
    if (!torService) {
      return res.status(503).json({ error: 'Tor service not configured' });
    }

    const health = await serviceManager.getServiceHealth('tor');
    console.log(`✅ Tor health check connection successful`);
    res.json(health);
  } catch (error) {
    console.error('❌ Tor health check connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to check Tor health',
      message: error.message 
    });
  }
});

// Service health check endpoint
app.get('/api/services/health', async (req, res) => {
  try {
    const healthResults = await serviceManager.checkAllServicesHealth();
    res.json({
      timestamp: new Date().toISOString(),
      services: healthResults
    });
  } catch (error) {
    console.error('❌ Error checking services health:', error.message);
    res.status(500).json({ 
      error: 'Failed to check services health',
      message: error.message 
    });
  }
});

// Frontend configuration endpoint
app.get('/api/config/frontend', (req, res) => {
  res.json({
    services: {
      adguard: {
        webUrl: process.env.ADGUARD_MAIN_URL || 'http://127.0.0.1:5213'
      },
      tor: {
        nickname: process.env.TOR_RELAY_NICKNAME,
        ip: process.env.TOR_RELAY_IP || process.env.DEFAULT_IP || '127.0.0.1',
        port: process.env.TOR_DEFAULT_PORT || 27801,
        metricsUrl: process.env.TOR_METRICS_URL || 'https://metrics.torproject.org'
      },
      bitcoin: {
        onionUrl: process.env.BITCOIN_ONION_URL,
        rpcPort: process.env.BITCOIN_RPC_PORT || 8332,
        configured: !!(process.env.BITCOIN_ONION_URL && process.env.BITCOIN_RPC_USER && process.env.BITCOIN_RPC_AUTH)
      }
    },
    app: {
      name: 'Watchman Dashboard',
      version: '1.0.0'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  if (serviceManager) {
    await serviceManager.shutdown();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  if (serviceManager) {
    await serviceManager.shutdown();
  }
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    await initializeServer();
    
    app.listen(PORT, () => {
      console.log(`🚀 Watchman Backend Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🛡️  AdGuard API: http://localhost:${PORT}/api/adguard/*`);
      console.log(`₿  Bitcoin API: http://localhost:${PORT}/api/bitcoin/*`);
      console.log(`🌐 Tor API: http://localhost:${PORT}/api/tor/*`);
      console.log(`🧅 Tor Proxy Health: http://localhost:${PORT}/api/tor/proxy/health`);
      console.log(`🔍 Services Health: http://localhost:${PORT}/api/services/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;