import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
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
    
    let url = 'https://onionoo.torproject.org/details';
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
        'User-Agent': 'TorDashboard/1.0',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Onionoo API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    res.json(data);
    
  } catch (error) {
    console.error('❌ Error proxying Onionoo details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch relay details',
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
    
    const url = `https://onionoo.torproject.org/bandwidth?fingerprint=${fingerprint}`;
    console.log(`📈 Proxying bandwidth request to Onionoo: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TorDashboard/1.0',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Onionoo API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    res.json(data);
    
  } catch (error) {
    console.error('❌ Error proxying Onionoo bandwidth:', error);
    res.status(500).json({ 
      error: 'Failed to fetch bandwidth data',
      message: error.message 
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Watchman Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Tor Details API: http://localhost:${PORT}/api/tor/details`);
  console.log(`📈 Tor Bandwidth API: http://localhost:${PORT}/api/tor/bandwidth`);
});

export default app;