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
    const infoPaths = ['/api/v1/info', '/api/info', '/info', '/api/v1', '/api'];
    for (const p of infoPaths) {
      try {
        const data = await this.fetchJson(p);
        if (data) {
          // Normalize common fields if available
          const info = {
            name: data.name || data.title || data.service || null,
            version: data.version || data.app_version || data.api_version || null,
            description: data.description || data.info || null,
            raw: data
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
      const [info, apps] = await Promise.allSettled([
        this.getInfo(),
        this.listApps()
      ]);

      const result = {
        status: 'online',
        timestamp: new Date().toISOString(),
        info: info.status === 'fulfilled' ? info.value : null,
        apps: apps.status === 'fulfilled' ? apps.value : null,
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