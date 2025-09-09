import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Service Configuration (Backend Only)
const ADGUARD_URL = process.env.ADGUARD_MAIN_URL;
const ADGUARD_AUTH = process.env.ADGUARD_MAIN_AUTH;
const TOR_ONIONOO_URL = process.env.TOR_RELAY_URL || 'https://onionoo.torproject.org';
const TOR_NICKNAME = process.env.TOR_RELAY_NICKNAME;

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
    if (!ADGUARD_URL || !ADGUARD_AUTH) {
      return res.status(503).json({ 
        error: 'AdGuard service not configured',
        status: 'offline'
      });
    }

    const response = await fetch(`${ADGUARD_URL}/control/status`, {
      headers: {
        'Authorization': `Basic ${ADGUARD_AUTH}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`AdGuard API returned ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching AdGuard status:', error);
    res.status(500).json({ 
      error: 'Failed to fetch AdGuard status',
      status: 'offline',
      message: error.message 
    });
  }
});

app.get('/api/adguard/stats', async (req, res) => {
  try {
    if (!ADGUARD_URL || !ADGUARD_AUTH) {
      return res.status(503).json({ error: 'AdGuard service not configured' });
    }

    const response = await fetch(`${ADGUARD_URL}/control/stats`, {
      headers: {
        'Authorization': `Basic ${ADGUARD_AUTH}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`AdGuard API returned ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching AdGuard stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch AdGuard stats',
      message: error.message 
    });
  }
});

// Tor API endpoints (enhanced)
app.get('/api/tor/relay/:nickname', async (req, res) => {
  try {
    const { nickname } = req.params;
    const searchNickname = nickname || TOR_NICKNAME;
    
    if (!searchNickname) {
      return res.status(400).json({ error: 'No nickname provided' });
    }

    const url = `${TOR_ONIONOO_URL}/details?search=${encodeURIComponent(searchNickname)}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Watchman-Dashboard/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Onionoo API returned ${response.status}`);
    }

    const data = await response.json();
    
    // Find exact match or return first result
    const relay = data.relays?.find(r => 
      r.nickname.toLowerCase() === searchNickname.toLowerCase()
    ) || data.relays?.[0];

    if (!relay) {
      return res.status(404).json({ 
        error: 'Relay not found',
        nickname: searchNickname 
      });
    }

    res.json(relay);
  } catch (error) {
    console.error('❌ Error fetching Tor relay:', error);
    res.status(500).json({ 
      error: 'Failed to fetch Tor relay data',
      message: error.message 
    });
  }
});

app.get('/api/tor/bandwidth/:fingerprint', async (req, res) => {
  try {
    const { fingerprint } = req.params;
    
    if (!fingerprint) {
      return res.status(400).json({ error: 'Missing fingerprint parameter' });
    }
    
    const url = `${TOR_ONIONOO_URL}/bandwidth?fingerprint=${fingerprint}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Watchman-Dashboard/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Onionoo API returned ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching Tor bandwidth:', error);
    res.status(500).json({ 
      error: 'Failed to fetch Tor bandwidth data',
      message: error.message 
    });
  }
});

// Service health check endpoint
app.get('/api/services/health', async (req, res) => {
  const services = {};
  
  // Check AdGuard
  try {
    if (ADGUARD_URL && ADGUARD_AUTH) {
      const response = await fetch(`${ADGUARD_URL}/control/status`, {
        headers: { 'Authorization': `Basic ${ADGUARD_AUTH}` },
        timeout: 5000
      });
      services.adguard = {
        status: response.ok ? 'online' : 'offline',
        responseTime: response.ok ? 'fast' : 'timeout'
      };
    } else {
      services.adguard = { status: 'not_configured' };
    }
  } catch (error) {
    services.adguard = { status: 'offline', error: error.message };
  }

  // Check Tor
  try {
    const nickname = TOR_NICKNAME || 'test';
    const response = await fetch(`${TOR_ONIONOO_URL}/details?search=${nickname}`, {
      timeout: 5000
    });
    services.tor = {
      status: response.ok ? 'online' : 'offline',
      responseTime: response.ok ? 'fast' : 'timeout'
    };
  } catch (error) {
    services.tor = { status: 'offline', error: error.message };
  }

  res.json({
    timestamp: new Date().toISOString(),
    services
  });
});

// Frontend configuration endpoint
app.get('/api/config/frontend', (req, res) => {
  res.json({
    services: {
      adguard: {
        webUrl: ADGUARD_URL || 'http://127.0.0.1:5213'
      },
      tor: {
        // Could add Tor web interface URL here if needed
        nickname: TOR_NICKNAME
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