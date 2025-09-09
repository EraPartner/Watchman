import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_PORT = process.env.FRONTEND_PORT || 5173;
const DEFAULT_IP = process.env.DEFAULT_IP || '127.0.0.1';
const TOR_ONIONOO_URL = process.env.TOR_ONIONOO_URL || 'https://onionoo.torproject.org';
const USER_AGENT = process.env.USER_AGENT || 'TorDashboard/1.0';

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: [
    `http://localhost:${FRONTEND_PORT}`, 
    `http://${DEFAULT_IP}:${FRONTEND_PORT}`
  ],
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'watchman-backend'
  });
});

// Tor API proxy endpoints
app.get('/api/tor/details', async (req, res) => {
  try {
    const { fingerprint, search } = req.query;
    
    let url = `${TOR_ONIONOO_URL}/details`;
    const params = new URLSearchParams();
    
    if (fingerprint) {
      params.append('fingerprint', fingerprint);
    } else if (search) {
      params.append('search', search);
    } else {
      return res.status(400).json({ error: 'Missing fingerprint or search parameter' });
    }
    
    url += '?' + params.toString();
    
    console.log(`🌐 Proxying request to Onionoo: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Onionoo API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching Tor details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch Tor details',
      message: error.message 
    });
  }
});

app.get('/api/tor/bandwidth', async (req, res) => {
  try {
    const { fingerprint } = req.query;
    
    if (!fingerprint) {
      return res.status(400).json({ error: 'Missing fingerprint parameter' });
    }
    
    const url = `${TOR_ONIONOO_URL}/bandwidth?fingerprint=${fingerprint}`;
    
    console.log(`🌐 Proxying bandwidth request to Onionoo: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Onionoo API returned ${response.status}: ${response.statusText}`);
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
  console.log(`🌐 Tor Details API: http://localhost:${PORT}/api/tor/details`);
  console.log(`📈 Tor Bandwidth API: http://localhost:${PORT}/api/tor/bandwidth`);
});

export default app;