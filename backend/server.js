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
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
const exec = promisify(execCb);

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
  // Only mark secure when running in production AND the frontend origin uses https.
  // This prevents cookies from being flagged secure for local HTTP dev (which
  // would prevent the browser from setting them), even if NODE_ENV was set to 'production'.
  secure: (process.env.NODE_ENV === 'production') && (/^https:/i.test(FRONTEND_URL || '')),
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
    // Return token in JSON body as a convenience fallback for clients that
    // cannot persist or send cookies (e.g. certain dev setups). The cookie is
    // still the primary mechanism.
    res.json({ success: true, user: { username }, token });
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

// IPFS API endpoints
app.get('/api/ipfs/status', healthLimiter, healthCacheMiddleware, async (req, res) => {
  try {
    const ipfsService = serviceManager.getService('ipfs');
    if (!ipfsService) {
      return res.status(503).json({ error: 'IPFS service not configured', status: 'offline' });
    }

    const health = await serviceManager.getServiceHealth('ipfs');
    console.log(`✅ IPFS status connection successful`);
    res.json(health);
  } catch (error) {
    console.error('❌ IPFS status connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch IPFS status',
      status: 'offline',
      message: error.message 
    });
  }
});

app.get('/api/ipfs/stats', statsCacheMiddleware, async (req, res) => {
  try {
    const ipfsService = serviceManager.getService('ipfs');
    if (!ipfsService) {
      return res.status(503).json({ error: 'IPFS service not configured' });
    }

    const stats = await serviceManager.getServiceStats('ipfs');
    console.log(`✅ IPFS stats connection successful`);
    res.json(stats);
  } catch (error) {
    console.error('❌ IPFS stats connection failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch IPFS stats',
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

// New status endpoints under /api/status/* to match requested API shape (only allowed endpoints)
app.get('/api/status/homebridge-version', statsCacheMiddleware, requireAuth, async (req, res) => {
   try {
     const hbService = serviceManager.getService('homebridge');
     if (!hbService) {
       return res.status(503).json({ error: 'Homebridge service not configured' });
     }

     // Directly call the service-specific method if available
     if (typeof hbService.getVersion === 'function') {
       const ver = await hbService.getVersion();
       return res.json(ver);
     }

     // Fallback to stats
     const stats = await hbService.getStats();
     res.json({ version: stats?.data?.version || stats?.version || null, raw: stats });
   } catch (error) {
     console.error('❌ /api/status/homebridge-version failed:', error.message);
     res.status(500).json({ error: 'Failed to fetch Homebridge version', message: error.message });
   }
 });

 app.get('/api/status/server-information', statsCacheMiddleware, requireAuth, async (req, res) => {
   try {
     const hbService = serviceManager.getService('homebridge');
     if (!hbService) {
       return res.status(503).json({ error: 'Homebridge service not configured' });
     }

     if (typeof hbService.getServerInformation === 'function') {
       const info = await hbService.getServerInformation();
       return res.json(info);
     }

     // Fallback to health/status
     const health = await serviceManager.getServiceHealth('homebridge');
     res.json({ data: health && health.data ? health.data : null, raw: health });
   } catch (error) {
     console.error('❌ /api/status/server-information failed:', error.message);
     res.status(500).json({ error: 'Failed to fetch server information', message: error.message });
   }
 });

// Homebridge endpoints
app.get('/api/homebridge/status', healthLimiter, healthCacheMiddleware, async (req, res) => {
  try {
    const hbService = serviceManager.getService('homebridge');
    if (!hbService) {
      return res.status(503).json({ error: 'Homebridge service not configured', status: 'offline' });
    }

    const health = await serviceManager.getServiceHealth('homebridge');
    console.log('✅ Homebridge status connection successful');
    res.json(health);
  } catch (error) {
    console.error('❌ Homebridge status connection failed:', error.message);
    res.status(500).json({ error: 'Failed to fetch Homebridge status', status: 'offline', message: error.message });
  }
});

app.get('/api/homebridge/stats', statsCacheMiddleware, async (req, res) => {
  try {
    const hbService = serviceManager.getService('homebridge');
    if (!hbService) {
      return res.status(503).json({ error: 'Homebridge service not configured' });
    }

    const stats = await serviceManager.getServiceStats('homebridge');
    console.log('✅ Homebridge stats connection successful');
    res.json(stats);
  } catch (error) {
    console.error('❌ Homebridge stats connection failed:', error.message);
    res.status(500).json({ error: 'Failed to fetch Homebridge stats', message: error.message });
  }
});

// New: expose accessories endpoint
app.get('/api/accessories', statsCacheMiddleware, requireAuth, async (req, res) => {
  try {
    const hbService = serviceManager.getService('homebridge');
    if (!hbService) {
      return res.status(503).json({ error: 'Homebridge service not configured' });
    }

    if (typeof hbService.getAccessories === 'function') {
      const accessories = await hbService.getAccessories();
      return res.json(accessories);
    }

    // Fallback: try to use getStats or getServerInformation if accessories not available
    res.status(501).json({ error: 'Accessories endpoint not implemented for this Homebridge service' });
  } catch (error) {
    console.error('❌ /api/accessories failed:', error.message);
    res.status(500).json({ error: 'Failed to fetch accessories', message: error.message });
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
      ipfs: (() => {
        const url = process.env.IPFS_API_URL || '';
        let host = null;
        let port = null;
        try {
          if (url && url.trim()) {
            const parsed = new URL(url);
            host = parsed.hostname || null;
            port = parsed.port || null;
          }
        } catch (e) {
          // ignore parse errors
        }

        host = host || process.env.IPFS_HOST || null;
        port = port || process.env.IPFS_PORT || null;

        // If the user runs an IPFS web UI, expose a clickable webUrl env var
        const webUiUrl = process.env.IPFS_WEB_UI_URL || null;

        return {
          host,
          port,
          webUrl: webUiUrl,
          configured: !!(host || webUiUrl || process.env.IPFS_API_URL)
        };
      })(),
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

// Route: ARP / neighbor lookup for router services
// Returns: { count: number, hosts: Array<{ ip: string, mac?: string, iface?: string }> , raw?: string }
app.get('/api/router/arp', healthLimiter, async (req, res) => {
  try {
    const serviceName = typeof req.query.service === 'string' ? req.query.service : null;
    if (!serviceName) return res.status(400).json({ error: 'Missing service query param (e.g. ?service=beryl)' });

    const svc = serviceManager && typeof serviceManager.getService === 'function' ? serviceManager.getService(serviceName) : null;
    if (!svc) return res.status(404).json({ error: `Service '${serviceName}' not found` });

    const host = svc.host || null;
    if (!host) return res.status(400).json({ error: `Service '${serviceName}' does not have a configured host` });

    // Choose platform-appropriate command
    const platform = process.platform;
    const cmd = platform === 'linux' ? 'ip neigh' : 'arp -a';

    // Execute with a short timeout
    const { stdout } = await exec(cmd, { timeout: 5000 }).catch(err => ({ stdout: (err && err.stdout) ? String(err.stdout) : '' }));
    const out = String(stdout || '');

    const hostsMap = new Map();

    if (platform === 'linux') {
      // Parse `ip neigh` lines like: "192.168.1.10 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE"
      const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        // ignore failed/incomplete entries
        if (/\b(INCOMPLETE|FAILED)\b/i.test(line)) continue;
        const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+dev\s+(\S+)(?:.*lladdr\s+([0-9a-f:]{5,}))?(?:.*\b(REACHABLE|STALE|DELAY|PERMANENT|REACHABLE)\b)?/i);
        if (m) {
          const ip = m[1];
          const iface = m[2] || null;
          const mac = m[3] || null;
          if (ip && !hostsMap.has(ip)) hostsMap.set(ip, { ip, mac, iface });
        }
      }
    } else {
      // macOS / BSD-style `arp -a`, lines like: 
      // ? (192.168.1.5) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]
      const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        // skip incomplete entries
        if (/incomplete/i.test(line)) continue;
        const m = line.match(/\(?([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\)?\s+at\s+([0-9a-f:]{5,})\s+on\s+(\S+)/i);
        if (m) {
          const ip = m[1];
          const mac = m[2] || null;
          const iface = m[3] || null;
          if (ip && !hostsMap.has(ip)) hostsMap.set(ip, { ip, mac, iface });
        } else {
          // Fallback: try to extract e.g. "hostname (192.168.1.2) at ..."
          const alt = line.match(/\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-f:]{5,})/i);
          if (alt) {
            const ip = alt[1];
            const mac = alt[2] || null;
            if (ip && !hostsMap.has(ip)) hostsMap.set(ip, { ip, mac, iface: null });
          }
        }
      }
    }

    const hosts = Array.from(hostsMap.values());

    // Exclude multicast and link-local addresses helper
    const isUnicast = (ip) => {
      try {
        if (!ip || typeof ip !== 'string') return false;
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some(isNaN)) return false;
        // Multicast 224.0.0.0/4
        if (parts[0] >= 224 && parts[0] <= 239) return false;
        // Link-local 169.254.0.0/16
        if (parts[0] === 169 && parts[1] === 254) return false;
        return true;
      } catch (e) { return false; }
    };

    // Determine LAN hosts relevant to the requested router service dynamically.
    // Strategy:
    // 1) If the router's configured host appears in the ARP table, use its iface
    //    and select other hosts with the same iface.
    // 2) If not found, fallback to prefix matching (strict /24 first, then /16).
    // 3) If no LAN candidates found, return an empty lan list (safer than including multicast).
    const svcIp = host; // the configured service host
    let lanHosts = [];

    if (svcIp) {
      // Try to find a direct ARP entry for the router host to get iface
      const svcEntry = hosts.find(h => h.ip === svcIp);
      if (svcEntry && svcEntry.iface) {
        lanHosts = hosts.filter(h => h.iface === svcEntry.iface && isUnicast(h.ip));
      } else {
        // Fallback: try /24 prefix
        const octets = svcIp.split('.');
        if (octets.length === 4) {
          const p24 = `${octets[0]}.${octets[1]}.${octets[2]}.`;
          lanHosts = hosts.filter(h => String(h.ip).startsWith(p24) && isUnicast(h.ip));
          if (lanHosts.length === 0) {
            // Try /16
            const p16 = `${octets[0]}.${octets[1]}.`;
            lanHosts = hosts.filter(h => String(h.ip).startsWith(p16) && isUnicast(h.ip));
          }
        }
      }
    }

    // Final fallback: if still empty, return empty LAN list (avoid including multicast/remote nets)
    if (!lanHosts || lanHosts.length === 0) lanHosts = [];

    // Return both full hosts and lan-specific subset plus a small note about filtering
    res.json({
      count: hosts.length,
      hosts,
      lan: {
        count: lanHosts.length,
        hosts: lanHosts
      },
      note: svcIp ? (lanHosts.length > 0 ? `Filtered by iface or prefix for ${svcIp}` : `No LAN hosts matched for ${svcIp}`) : 'No service host provided',
      raw: out.substring(0, 10000)
    });
  } catch (error) {
    console.error('❌ ARP lookup failed:', error && error.message ? error.message : error);
    res.status(500).json({ error: 'Failed to run ARP lookup', message: error && error.message ? error.message : String(error) });
  }
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
