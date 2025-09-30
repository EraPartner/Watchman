import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { createServer } from 'http';
import ServiceManager from './services/ServiceManager.js';
import WebSocketManager from './services/WebSocketManager.js';
import performanceMonitor from './middleware/performanceMonitor.js';
import { healthCacheMiddleware, statsCacheMiddleware, clearCache } from './middleware/cache.js';
import { generalLimiter, controlLimiter, healthLimiter, authLimiter } from './middleware/rateLimiting.js';
import cookieParser from 'cookie-parser';
import { authenticateCredentials, signToken, requireAuth, verifyToken } from './middleware/auth.js';
import { issueCsrfToken, verifyCsrf } from './middleware/csrf.js';
import FailedLoginStore from './services/FailedLoginStore.js';
import RefreshTokenStore from './services/RefreshTokenStore.js';
import { requireFields, requireBoolean, requireString } from './middleware/validation.js';

// Load environment variables
dotenv.config({path:'.env.local'});

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL;

// Enforce FRONTEND_URL in production to avoid open CORS
if (process.env.NODE_ENV === 'production' && (!FRONTEND_URL || FRONTEND_URL === '*')) {
  console.error('❌ FRONTEND_URL must be set to your frontend origin in production to avoid open CORS.');
  process.exit(1);
}

// Cookie defaults
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

// Initialize service manager and WebSocket
let serviceManager;
let httpServerInstance = null;

async function initializeServer() {
  console.log('🚀 Initializing Watchman Backend Server...');
  
  serviceManager = new ServiceManager();
  await serviceManager.initializeServices();
  
  // Initialize WebSocket server
  WebSocketManager.initialize(server);
  
  console.log('✅ Service initialization complete');
}

// Middleware
app.use(performanceMonitor.trackRequest());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"] ,
    },
  },
}));
app.use(compression({ level: 6, threshold: 1024 }));
app.use(cors({
  origin: FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Apply rate limiting
app.use('/api/', generalLimiter);

// Authentication endpoints
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password, remember } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const ok = await authenticateCredentials(username, password);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({ username });

    const cookieOpts = Object.assign({}, COOKIE_OPTIONS, {
      // If remember is truthy, keep cookie for 30 days, otherwise short-lived session
      maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000
    });

    res.cookie('token', token, cookieOpts);

    // Issue a double-submit CSRF token cookie (accessible to JS)
    issueCsrfToken(res);

    // Also return a safe minimal user object
    res.json({ success: true, user: { username } });
  } catch (error) {
    console.error('❌ Login error:', error && error.message ? error.message : error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', Object.assign({}, COOKIE_OPTIONS));
  // Clear csrf cookie too
  res.clearCookie(process.env.CSRF_COOKIE_NAME || 'csrfToken', { path: '/' });
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  if (!token) return res.status(200).json({ authenticated: false });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(200).json({ authenticated: false });

  // Refresh CSRF token on authenticated status so client can continue to send it
  issueCsrfToken(res);
  return res.json({ authenticated: true, user: { username: decoded.username } });
});

// Health check endpoint
app.get('/health', healthLimiter, (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'watchman-backend',
    version: '1.0.0'
  });
});

// Cache management endpoint - requires auth + CSRF verification
app.post('/api/cache/clear', controlLimiter, requireAuth, verifyCsrf, (req, res) => {
  const { type } = req.body || {};

  // If provided, type must be a non-empty string
  if (type !== undefined && (typeof type !== 'string' || type.trim().length === 0)) {
    return res.status(400).json({ error: 'Invalid cache type' });
  }

  clearCache(type);
  res.json({ success: true, message: `Cache cleared: ${type || 'all'}` });
});

// AdGuard protection endpoint - require boolean 'enabled' and optional numeric 'duration'
app.post('/api/adguard/protection', controlLimiter, requireAuth, verifyCsrf, requireBoolean('enabled'), async (req, res) => {
  try {
    const adguardService = serviceManager.getService('adguard');
    if (!adguardService) {
      return res.status(503).json({ error: 'AdGuard service not configured' });
    }

    const { enabled, duration } = req.body;

    // optional duration validation
    if (duration !== undefined && typeof duration !== 'number') {
      return res.status(400).json({ error: 'Duration must be a number (seconds)' });
    }

    await adguardService.setProtection(enabled, duration);
    console.log(`✅ AdGuard protection ${enabled ? 'enabled' : 'disabled'}`);

    // Clear cache after control actions
    clearCache('health');
    clearCache('stats');

    res.json({ success: true });
  } catch (error) {
    console.error('❌ AdGuard protection toggle failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to toggle AdGuard protection',
      message: error.message 
    });
  }
});

// AdGuard API endpoints - status and stats (re-added)
app.get('/api/adguard/status', healthLimiter, healthCacheMiddleware, async (req, res) => {
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

app.get('/api/adguard/stats', statsCacheMiddleware, async (req, res) => {
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

// Bitcoin API endpoints
app.get('/api/bitcoin/health', healthLimiter, healthCacheMiddleware, async (req, res) => {
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

app.get('/api/bitcoin/status', healthLimiter, healthCacheMiddleware, async (req, res) => {
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

app.get('/api/bitcoin/stats', statsCacheMiddleware, async (req, res) => {
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
app.get('/api/qbittorrent/status', healthLimiter, healthCacheMiddleware, async (req, res) => {
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

app.get('/api/qbittorrent/stats', statsCacheMiddleware, async (req, res) => {
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

// Roon (ROCK) API endpoints - missing previously which caused frontend fetches to 404
app.get('/api/roon/status', healthLimiter, healthCacheMiddleware, async (req, res) => {
  try {
    const roonService = serviceManager.getService('roon');
    if (!roonService) {
      return res.status(503).json({ 
        error: 'Roon service not configured',
        status: 'offline'
      });
    }

    const health = await serviceManager.getServiceHealth('roon');
    console.log(`✅ Roon status connection successful`);
    res.json(health);
  } catch (error) {
    console.error('❌ Roon status connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Roon status',
      status: 'offline',
      message: error.message 
    });
  }
});

app.get('/api/roon/stats', statsCacheMiddleware, async (req, res) => {
  try {
    const roonService = serviceManager.getService('roon');
    if (!roonService) {
      return res.status(503).json({ error: 'Roon service not configured' });
    }

    const stats = await serviceManager.getServiceStats('roon');
    console.log(`✅ Roon stats connection successful`);
    res.json(stats);
  } catch (error) {
    console.error('❌ Roon stats connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Roon stats',
      message: error.message 
    });
  }
});

// Tor API endpoints
app.get('/api/tor/relay/:nickname?', statsCacheMiddleware, async (req, res) => {
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

app.get('/api/tor/health', healthLimiter, healthCacheMiddleware, async (req, res) => {
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
app.get('/api/services/health', healthLimiter, healthCacheMiddleware, async (req, res) => {
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

// Synology NAS API endpoints
app.get('/api/synology/status', healthLimiter, healthCacheMiddleware, async (req, res) => {
  try {
    const synologyService = serviceManager.getService('synology');
    if (!synologyService) {
      return res.status(503).json({ 
        error: 'Synology service not configured',
        status: 'offline'
      });
    }

    const health = await serviceManager.getServiceHealth('synology');
    console.log(`✅ Synology status connection successful`);
    res.json(health);
  } catch (error) {
    console.error('❌ Synology status connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Synology status',
      status: 'offline',
      message: error.message 
    });
  }
});

app.get('/api/synology/stats', statsCacheMiddleware, async (req, res) => {
  try {
    const synologyService = serviceManager.getService('synology');
    if (!synologyService) {
      return res.status(503).json({ error: 'Synology service not configured' });
    }

    const stats = await serviceManager.getServiceStats('synology');
    
    // Ensure we always return valid JSON
    if (stats === null || stats === undefined) {
      return res.status(500).json({ 
        error: 'Synology stats returned null or undefined',
        status: 'error',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`✅ Synology stats connection successful`);
    res.json(stats);
  } catch (error) {
    console.error('❌ Synology stats connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Synology stats',
      message: error.message,
      status: 'error',
      timestamp: new Date().toISOString()
    });
  }
});

// Philips Bridge endpoints
app.get('/api/philips/status', healthLimiter, healthCacheMiddleware, async (req, res) => {
  try {
    const philipsService = serviceManager.getService('philips');
    if (!philipsService) {
      return res.status(503).json({
        error: 'Philips Bridge service not configured',
        status: 'offline'
      });
    }

    const health = await serviceManager.getServiceHealth('philips');
    console.log(`✅ Philips Bridge status connection successful`);
    res.json(health);
  } catch (error) {
    console.error('❌ Philips Bridge status connection failed:', error.message);
    res.status(500).json({
      error: 'Failed to fetch Philips Bridge status',
      status: 'offline',
      message: error.message
    });
  }
});

app.get('/api/philips/stats', statsCacheMiddleware, async (req, res) => {
  try {
    const philipsService = serviceManager.getService('philips');
    if (!philipsService) {
      return res.status(503).json({ error: 'Philips Bridge service not configured' });
    }

    const stats = await serviceManager.getServiceStats('philips');
    console.log(`✅ Philips Bridge stats connection successful`);
    res.json(stats);
  } catch (error) {
    console.error('❌ Philips Bridge stats connection failed:', error.message);
    res.status(500).json({
      error: 'Failed to fetch Philips Bridge stats',
      message: error.message
    });
  }
});

// Alby Hub endpoints
app.get('/api/albyhub/status', healthLimiter, healthCacheMiddleware, async (req, res) => {
  try {
    const albyService = serviceManager.getService('albyhub');
    if (!albyService) {
      return res.status(503).json({
        error: 'Alby Hub service not configured',
        status: 'offline'
      });
    }

    const health = await serviceManager.getServiceHealth('albyhub');
    console.log(`✅ Alby Hub status connection successful`);
    res.json(health);
  } catch (error) {
    console.error('❌ Alby Hub status connection failed:', error.message);
    res.status(500).json({
      error: 'Failed to fetch Alby Hub status',
      status: 'offline',
      message: error.message
    });
  }
});

app.get('/api/albyhub/stats', statsCacheMiddleware, async (req, res) => {
  try {
    const albyService = serviceManager.getService('albyhub');
    if (!albyService) {
      return res.status(503).json({ error: 'Alby Hub service not configured' });
    }

    const stats = await serviceManager.getServiceStats('albyhub');
    console.log(`✅ Alby Hub stats connection successful`);
    res.json(stats);
  } catch (error) {
    console.error('❌ Alby Hub stats connection failed:', error.message);
    res.status(500).json({
      error: 'Failed to fetch Alby Hub stats',
      message: error.message
    });
  }
});

// Mac Mini endpoints: status and stats
app.get('/api/macmini/status', healthLimiter, healthCacheMiddleware, async (req, res) => {
  try {
    const macService = serviceManager.getService('macmini');
    if (!macService) {
      return res.status(503).json({
        error: 'Mac Mini service not configured',
        status: 'offline'
      });
    }

    const health = await serviceManager.getServiceHealth('macmini');
    console.log('✅ Mac Mini status connection successful');
    res.json(health);
  } catch (error) {
    console.error('❌ Mac Mini status connection failed:', error.message);
    res.status(500).json({
      error: 'Failed to fetch Mac Mini status',
      status: 'offline',
      message: error.message
    });
  }
});

app.get('/api/macmini/stats', statsCacheMiddleware, async (req, res) => {
  try {
    const macService = serviceManager.getService('macmini');
    if (!macService) {
      return res.status(503).json({ error: 'Mac Mini service not configured' });
    }

    const stats = await serviceManager.getServiceStats('macmini');
    console.log('✅ Mac Mini stats connection successful');
    res.json(stats);
  } catch (error) {
    console.error('❌ Mac Mini stats connection failed:', error.message);
    res.status(500).json({
      error: 'Failed to fetch Mac Mini stats',
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
      },
      roon: {
        host: process.env.ROON_HOST || null,
        ports: process.env.ROON_PORTS || process.env.ROON_DEFAULT_PORT || null,
        configured: !!process.env.ROON_HOST
      },
      qbittorrent: (() => {
        // Try to parse host/port from QBITTORRENT_URL if present
        const url = process.env.QBITTORRENT_URL || '';
        let host = null;
        let port = process.env.QBITTORRENT_PORT || process.env.QBITTORRENT_WEB_PORT || null;
        try {
          if (url && url.trim()) {
            const parsed = new URL(url);
            host = parsed.hostname || null;
            if (parsed.port) port = parsed.port;
          }
        } catch (e) {
          // ignore parse errors
        }

        // Fallback to individual host env var if provided
        host = host || process.env.QBITTORRENT_HOST || null;
        port = port || null;

        return {
          host,
          webPort: port,
          configured: !!(host)
        };
      })(),
       synology: {
         host: process.env.SYNOLOGY_HOST || null,
         webPort: process.env.SYNOLOGY_WEB_PORT || process.env.SYNOLOGY_HTTP_PORT || process.env.SYNOLOGY_PORT || 5000,
         configured: !!process.env.SYNOLOGY_HOST
       }
      ,
      albyhub: {
        // Provide the raw ALBYHUB_URL so the frontend can construct a clickable host:port link
        url: process.env.ALBYHUB_URL || null,
        configured: !!process.env.ALBYHUB_URL
      },
      nostrcheck: {
        relayUrl: process.env.NOSTRCHECK_RELAY_URL || null,
        // Expose an optional clickable web UI URL (http(s)://...) for the relay
        webUrl: process.env.NOSTRCHECK_WEB_URL || null,
        enabled: (process.env.NOSTRCHECK_ENABLED || 'false').toLowerCase() === 'true',
        configured: !!process.env.NOSTRCHECK_RELAY_URL
      },
      // Expose configured routers (BERYL/TELENET) so frontend can show host/ports
      beryl: {
        host: process.env.BERYL_HOST || null,
        ports: process.env.BERYL_PORTS ? String(process.env.BERYL_PORTS).split(/[ ,]+/).map(p => Number(p)).filter(Boolean) : [],
        configured: !!process.env.BERYL_HOST,
        // If a non-default web port is configured, expose a clickable webUrl so frontend links include the port
        webUrl: (() => {
          const h = process.env.BERYL_HOST;
          const portsRaw = process.env.BERYL_PORTS || '';
          if (!h) return null;
          const ports = portsRaw.split(/[ ,]+/).map(p => Number(p)).filter(Boolean);
          // prefer a single explicit web port if provided; fallback to port 80
          const webPort = ports.length > 0 ? ports[0] : null;
          // Prefer https first. If webPort is present and non-standard, include it.
          const preferHttps = (process.env.BERYL_PREFER_HTTPS || 'true').toLowerCase() !== 'false';
          if (preferHttps) {
            if (webPort && webPort !== 443) return `https://${h}:${webPort}`;
            return `https://${h}`;
          }
          // Fallback to http
          if (webPort && webPort !== 80) return `http://${h}:${webPort}`;
          return `http://${h}`;
        })()
      },
      telenet: {
        host: process.env.TELENET_HOST || null,
        ports: process.env.TELENET_PORTS ? String(process.env.TELENET_PORTS).split(/[ ,]+/).map(p => Number(p)).filter(Boolean) : [],
        configured: !!process.env.TELENET_HOST
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

// Graceful shutdown helper
async function gracefulShutdown(signal) {
  console.info(`\n🛑 Received ${signal || 'shutdown'}, shutting down gracefully...`);

  // Stop accepting new connections
  try {
    if (httpServerInstance) {
      console.info('🛑 Closing HTTP server to new connections...');
      await new Promise((resolve, reject) => {
        httpServerInstance.close((err) => (err ? reject(err) : resolve()));
        // Force resolve after 10s to avoid hanging
        setTimeout(resolve, 10000);
      });
    }
  } catch (err) {
    console.warn('⚠️ Error closing HTTP server:', err && err.message ? err.message : err);
  }

  // Shutdown websockets
  try {
    WebSocketManager.shutdown();
  } catch (err) {
    console.warn('⚠️ Error shutting down WebSocket manager:', err && err.message ? err.message : err);
  }

  // Shutdown services
  try {
    if (serviceManager && typeof serviceManager.shutdown === 'function') {
      await serviceManager.shutdown();
    }
  } catch (err) {
    console.warn('⚠️ Error shutting down service manager:', err && err.message ? err.message : err);
  }

  // Shutdown performance monitor
  try {
    if (performanceMonitor && typeof performanceMonitor.shutdown === 'function') {
      performanceMonitor.shutdown();
    }
  } catch (err) {
    // ignore
  }

  console.info('🛑 Shutdown complete, exiting.');
  process.exit(0);
}

// Handle signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Unhandled exceptions/rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Attempt graceful shutdown
  gracefulShutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  // Attempt graceful shutdown
  gracefulShutdown('uncaughtException');
});

// Start server
async function startServer() {
  try {
    await initializeServer();
    
    httpServerInstance = server.listen(PORT, () => {
      console.info(`🚀 Watchman Backend Server running on port ${PORT}`);
      console.info(`📊 Health check: http://localhost:${PORT}/health`);
      console.info(`🛡️ AdGuard API: http://localhost:${PORT}/api/adguard/*`);
      console.info(`₿ Bitcoin API: http://localhost:${PORT}/api/bitcoin/*`);
      console.info(`🌐 Tor API: http://localhost:${PORT}/api/tor/*`);
      console.info(`🧅 Tor Proxy Health: http://localhost:${PORT}/api/tor/proxy/health`);
      console.info(`🖥️ Synology API: http://localhost:${PORT}/api/synology/*`);
      console.info(`🔍 Services Health: http://localhost:${PORT}/api/services/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
