import fetch from 'node-fetch';

export class AlbyHubService {
  constructor(config = {}) {
    // Assumption: ALBYHUB_URL points to the LAN IP or hostname of the Alby Hub (e.g. http://192.168.1.50:3000)
    this.baseUrl = config.baseUrl || process.env.ALBYHUB_URL || 'http://192.168.0.100:3000';
    this.timeout = config.timeout || (process.env.ALBYHUB_TIMEOUT ? parseInt(process.env.ALBYHUB_TIMEOUT) : 3000);
    this.lastCheck = null;

    // Optional auth token (JWT) to access protected Alby Hub endpoints
    this.authToken = config.authToken || process.env.ALBYHUB_TOKEN || null;

    // Default headers used for every request (can be extended later)
    this.defaultHeaders = {};
    if (this.authToken) {
      this.defaultHeaders['Authorization'] = `Bearer ${this.authToken}`;
    }
  }

  // Internal helper to perform a GET with timeout
  async makeRequest(path = '/') {
    const url = `${this.baseUrl.replace(/\/$/, '')}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, { method: 'GET', signal: controller.signal, headers: this.defaultHeaders });
      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  // JSON fetch helper (returns parsed JSON or throws)
  async fetchJson(path = '/') {
    const res = await this.makeRequest(path);
    const ct = res.headers.get && res.headers.get('content-type') ? res.headers.get('content-type') : '';
    const text = await res.text();
    if (!text || text.trim() === '') return null;
    if (ct.includes('application/json')) {
      try {
        return JSON.parse(text);
      } catch (e) {
        // fallback: try to parse anyway
        try { return JSON.parse(text.replace(/\n/g, '')); } catch (e2) { return text; }
      }
    }
    try { return JSON.parse(text); } catch (e) { return text; }
  }

  // Try a small set of endpoints that Alby Hub might expose, fallback to root
  async probeEndpoints() {
    const endpoints = ['/api', '/api/info', '/api/v1/info', '/info', '/status', '/health', '/'];

    for (const ep of endpoints) {
      try {
        const res = await this.makeRequest(ep);
        // If we get any response (even non-200), return the endpoint and response
        return { endpoint: ep, response: res };
      } catch (err) {
        // ignore and try next
      }
    }

    throw new Error('No reachable endpoints');
  }

  // Try to call Alby Hub's getInfo API (normalize commonly used endpoints)
  async getInfo() {
    // Common candidate paths for Alby Hub info / status endpoints
    const infoPaths = [
      '/api/v1/info', '/api/info', '/api/getInfo', '/api/v1/getInfo',
      '/info', '/getInfo', '/api/v1', '/api', '/status', '/health', '/'
    ];

    for (const p of infoPaths) {
      try {
        const data = await this.fetchJson(p);
        if (data) {
          // If the API returns a wrapper like { data: {...} }, unwrap it
          const payload = (data && typeof data === 'object' && data.data) ? data.data : data;

          // Build an info object that keeps the raw payload (so frontend has full access)
          const info = {
            name: payload.name || payload.title || payload.service || 'Alby Hub',
            version: payload.version || payload.app_version || payload.api_version || null,
            description: payload.description || payload.info || null,
            // Keep the original raw payload for maximum compatibility in the frontend
            raw: payload,
            // Also surface which path produced this data
            endpoint: p
          };

          return info;
        }
      } catch (err) {
        // try next
      }
    }

    return null;
  }

  // Try to call Alby Hub's listApps API
  async listApps() {
    const appPaths = ['/api/v1/apps', '/api/apps', '/apps', '/api/v1/extensions', '/extensions'];
    for (const p of appPaths) {
      try {
        const data = await this.fetchJson(p);
        if (data) {
          // Ensure array shape if possible
          if (Array.isArray(data)) return data;
          // Some APIs wrap apps in an object
          if (Array.isArray(data.apps)) return data.apps;
          // If it's an object with items, try to convert
          if (data.items && Array.isArray(data.items)) return data.items;
          // Otherwise return raw
          return data;
        }
      } catch (err) {
        // try next
      }
    }
    return null;
  }

  async checkHealth() {
    const start = Date.now();
    try {
      const probe = await this.probeEndpoints();
      const res = probe.response;
      const responseTime = Date.now() - start;

      // Try to read a small body for debugging if JSON or text
      let body = null;
      try {
        const ct = res.headers.get('content-type') || '';
        const text = await res.text();
        if (text && text.length > 0) {
          body = text.length > 500 ? text.slice(0, 500) + '...' : text;
          if (ct.includes('application/json')) {
            try { body = JSON.parse(text); } catch (e) { /* ignore */ }
          }
        }
      } catch (e) {
        // ignore body parse errors
      }

      const result = {
        status: res.ok ? 'online' : 'partial',
        statusCode: res.status,
        endpoint: probe.endpoint,
        responseTime,
        body,
        lastCheck: new Date().toISOString()
      };

      this.lastCheck = result;
      return result;
    } catch (error) {
      const result = {
        status: 'offline',
        error: error.message,
        responseTime: Date.now() - start,
        lastCheck: new Date().toISOString()
      };
      this.lastCheck = result;
      return result;
    }
  }

  async getStats() {
    // Try to fetch Alby-specific info and installed apps
    try {
      // Probe to find a responding endpoint so we can include it in the stats
      let endpointPath = null;
      try {
        const probe = await this.probeEndpoints();
        endpointPath = probe && probe.endpoint ? probe.endpoint : null;
      } catch (e) {
        endpointPath = null;
      }

      // Only fetch info (apps are not needed for the UI and avoid extra requests)
      let info = null;
      try {
        info = await this.getInfo();
      } catch (e) {
        info = null;
      }

      const resolvedUrl = endpointPath ? `${this.baseUrl.replace(/\/$/, '')}${endpointPath}` : null;

      const result = {
        status: 'online',
        timestamp: new Date().toISOString(),
        // include the resolved full URL (frontend expects `url` where it's the URL)
        url: resolvedUrl,
        info: info || null,
        lastCheck: new Date().toISOString()
      };

      this.lastCheck = result;
      return result;
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        lastData: this.lastCheck,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Existing simple methods kept for compatibility
  async getSystemInfo() { return { name: 'Alby Hub', model: 'Alby', version: 'Unknown', uptime: 0, status: 'Unknown' }; }
  async getCPUInfo() { return { usage: 0, temperature: 0 }; }
  async getMemoryInfo() { return { total: 0, available: 0, used: 0, usage: 0 }; }
  async getDiskInfo() { return { total: 0, used: 0, free: 0, usage: 0 }; }
  async getNetworkInfo() { return { bytesReceived: 0, bytesTransmitted: 0 }; }

  disconnect() {
    // Nothing to do
  }
}