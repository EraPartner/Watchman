import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import ServiceManager from './services/ServiceManager.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL;

// Initialize service manager
const serviceManager = new ServiceManager();

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

// Tor API endpoints
app.get('/api/tor/relay/:nickname?', async (req, res) => {
  try {
    const torService = serviceManager.getService('tor');
    if (!torService) {
      return res.status(503).json({ error: 'Tor service not configured' });
    }

    const stats = await serviceManager.getServiceStats('tor');
    res.json(stats);
  } catch (error) {
    console.error('❌ Error fetching Tor relay:', error.message);
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
    res.json(health);
  } catch (error) {
    console.error('❌ Error checking Tor health:', error.message);
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
        nickname: process.env.TOR_RELAY_NICKNAME
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Watchman Backend Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🛡️  AdGuard API: http://localhost:${PORT}/api/adguard/*`);
  console.log(`🌐 Tor API: http://localhost:${PORT}/api/tor/*`);
  console.log(`🔍 Services Health: http://localhost:${PORT}/api/services/health`);
});

export default app;