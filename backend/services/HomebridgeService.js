import fetch from 'node-fetch';

// HomebridgeService: interacts with Homebridge UI/API using only the allowed endpoints.
// Allowed endpoints used by this service:
// - POST /api/auth/login            (for background auth)
// - GET  /api/status/server-information (for status/server info)
// - GET  /api/status/homebridge-version (for version)

class HomebridgeService {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || process.env.HOMEBRIDGE_URL || process.env.HOMEBRIDGE_API_URL || '').replace(/\/+$/, '');

    // Use only the explicit allowed endpoints
    this.statusPath = options.statusPath || process.env.HOMEBRIDGE_STATUS_PATH || '/api/status/server-information';
    this.versionPath = options.versionPath || process.env.HOMEBRIDGE_VERSION_PATH || '/api/status/homebridge-version';
    this.loginPath = options.loginPath || '/api/auth/login';

    this.timeout = parseInt(options.timeout || process.env.HOMEBRIDGE_TIMEOUT || '5000', 10);

    // Credentials or token from env or options
    this.authToken = options.authToken || process.env.HOMEBRIDGE_AUTH_TOKEN || process.env.HOMEBRIDGE_TOKEN || null;
    this.username = options.username || process.env.HOMEBRIDGE_USERNAME || process.env.HOMEBRIDGE_USER || null;
    this.password = options.password || process.env.HOMEBRIDGE_PASSWORD || null;

    // Session cookie(s) captured from login (name=value[; name2=value2...])
    this.cookie = null;
    this.loggedIn = false;
    this.loginInProgress = null;

    this.lastData = null;
  }

  buildHeaders() {
    const headers = {
      Accept: 'application/json',
      'User-Agent': 'watchman-homebridge-check/1.0'
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    } else if (this.cookie) {
      headers['Cookie'] = this.cookie;
    }

    return headers;
  }

  // Background login: try JSON POST, fall back to form-encoded if HTML/login form returned.
  async login() {
    if (this.authToken) {
      this.loggedIn = true;
      return true;
    }
    if (!this.username || !this.password) return false;
    if (this.loggedIn) return true;
    if (this.loginInProgress) return this.loginInProgress;

    this.loginInProgress = (async () => {
      const url = `${this.baseUrl}${this.loginPath}`;
      // Try JSON POST first
      try {
        console.debug('[HomebridgeService] attempting JSON login ->', url);
        let res = await fetch(url, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'watchman-homebridge-check/1.0' },
          body: JSON.stringify({ username: this.username, password: this.password })
        });

        // If JSON attempt appears to return HTML (login page), try form-encoded fallback
        let ct = res.headers.get('content-type') || '';
        let text = await res.text().catch(() => '');
        if (ct.includes('text/html') || /<html/i.test(text)) {
          console.debug('[HomebridgeService] JSON login returned HTML, trying form-encoded fallback');
          try {
            const form = new URLSearchParams();
            form.append('username', this.username);
            form.append('password', this.password);
            res = await fetch(url, {
              method: 'POST',
              headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'watchman-homebridge-check/1.0' },
              body: form.toString()
            });
            ct = res.headers.get('content-type') || '';
            text = await res.text().catch(() => '');
          } catch (e) {
            console.debug('[HomebridgeService] form login attempt failed:', String(e).slice(0,200));
          }
        }

        // Capture cookies (robustly)
        try {
          const raw = typeof res.headers.raw === 'function' ? res.headers.raw() : null;
          let cookies = [];
          if (raw && raw['set-cookie']) cookies = raw['set-cookie'];
          else {
            const sc = res.headers.get('set-cookie') || res.headers.get('Set-Cookie');
            if (sc) cookies = sc.split(/,\s*(?=[^ ;]+=)/);
          }
          if (cookies.length > 0) {
            // Keep only name=value pairs
            this.cookie = cookies.map(c => String(c).split(';')[0]).join('; ');
            console.debug('[HomebridgeService] captured cookie(s)');
          }
        } catch (e) {
          // ignore
        }

        // Parse JSON body if possible
        let body;
        try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
        if (!body && res.json) {
          try { body = await res.json().catch(() => null); } catch (e) { body = null; }
        }

        console.debug('[HomebridgeService] login response', res.status, res.statusText, 'ct=', res.headers.get('content-type') || '');

        if (res.ok) {
          if (body && (body.token || body.authToken || body.access_token)) {
            this.authToken = body.token || body.authToken || body.access_token;
            console.debug('[HomebridgeService] login returned token; using as Bearer');
          }
          this.loggedIn = true;
          return true;
        }

        // login failed
        console.debug('[HomebridgeService] login failed status=', res.status, 'snippet=', (body ? JSON.stringify(body).slice(0,200) : (text||'').slice(0,200)));
        this.authToken = null;
        this.cookie = null;
        this.loggedIn = false;
        return false;
      } catch (err) {
        console.debug('[HomebridgeService] login exception:', String(err).slice(0,300));
        this.authToken = null;
        this.cookie = null;
        this.loggedIn = false;
        return false;
      } finally {
        this.loginInProgress = null;
      }
    })();

    return this.loginInProgress;
  }

  // Generic GET request with single retry-on-auth behavior. Does not call forbidden endpoints.
  async makeRequest(path) {
    if (!this.baseUrl) throw new Error('HOMEBRIDGE_URL not configured');
    const url = path && path.startsWith('/') ? `${this.baseUrl}${path}` : `${this.baseUrl}/${path}`;

    const attemptFetch = async () => {
      const res = await fetch(url, { method: 'GET', headers: this.buildHeaders() });
      const text = await res.text().catch(() => '');
      const ct = (res.headers && res.headers.get) ? (res.headers.get('content-type') || '') : '';

      // Debug: short snippet
      try { console.debug('[HomebridgeService] GET', url, '->', res.status, res.statusText, 'ct=', ct, 'snippet=', String(text).slice(0,200)); } catch (e) {}

      // If HTML returned, treat as auth/login page (unauthenticated)
      if (ct.includes('text/html') || /<html/i.test(text)) {
        const err = new Error('HTML response received (likely unauthenticated login page)');
        err.status = res.status || 401;
        err.body = text;
        throw err;
      }

      // Capture Set-Cookie if present
      try {
        const raw = typeof res.headers.raw === 'function' ? res.headers.raw() : null;
        let cookies = [];
        if (raw && raw['set-cookie']) cookies = raw['set-cookie'];
        else {
          const sc = res.headers.get('set-cookie') || res.headers.get('Set-Cookie');
          if (sc) cookies = sc.split(/,\s*(?=[^ ;]+=)/);
        }
        if (cookies.length > 0) this.cookie = cookies.map(c => String(c).split(';')[0]).join('; ');
      } catch (e) {
        // ignore
      }

      if (!res.ok) {
        const err = new Error(`Request failed: ${res.status} ${res.statusText}`);
        err.status = res.status;
        err.body = text;
        throw err;
      }

      if (ct.includes('application/json')) {
        try { return JSON.parse(text); } catch (e) { return text; }
      }

      try { return JSON.parse(text); } catch (e) { return text; }
    };

    try {
      return await attemptFetch();
    } catch (error) {
      const statusCode = error && error.status ? Number(error.status) : null;
      if ((statusCode === 401 || statusCode === 403) && this.username && this.password) {
        const ok = await this.login();
        if (ok) return await attemptFetch();
      }
      if (error && error.message) throw error;
      throw new Error(String(error));
    }
  }

  // Only use the allowed status endpoint
  async checkHealth() {
    if (!this.baseUrl) return { status: 'offline', error: 'HOMEBRIDGE_URL not configured', timestamp: new Date().toISOString() };
    const start = Date.now();
    try {
      const data = await this.makeRequest(this.statusPath);
      const responseTime = Date.now() - start;
      this.lastData = { status: 'online', responseTime, timestamp: new Date().toISOString(), data };
      return this.lastData;
    } catch (error) {
      return { status: 'offline', responseTime: Date.now() - start, error: error.message || String(error), lastData: this.lastData, timestamp: new Date().toISOString() };
    }
  }

  // Stats derived from server-information
  async getStats() { const info = await this.getServerInformation(); return { ...info, lastUpdated: new Date().toISOString() }; }

  // Only call the allowed version endpoint
  async getVersion() {
    if (!this.baseUrl) return { error: 'HOMEBRIDGE_URL not configured', timestamp: new Date().toISOString() };
    const start = Date.now();
    try {
      const data = await this.makeRequest(this.versionPath);
      const responseTime = Date.now() - start;

      // Normalize different shapes into a simple { version, raw }
      let version;
      if (data && typeof data === 'object') version = data.version || data.homebridgeVersion || data.homebridge_version || data.serverVersion || (data.raw && data.raw.version) || null;
      else if (typeof data === 'string') version = data;
      return { version: version || null, raw: data, responseTime, timestamp: new Date().toISOString() };
    } catch (err) {
      return { error: err && err.message ? err.message : String(err), timestamp: new Date().toISOString() };
    }
  }

  // Retrieve server information via allowed endpoint
  async getServerInformation() {
    if (!this.baseUrl) return { error: 'HOMEBRIDGE_URL not configured', timestamp: new Date().toISOString() };
    const start = Date.now();
    try {
      const data = await this.makeRequest(this.statusPath);
      const responseTime = Date.now() - start;

      // Try to coerce common fields into a friendly object for the frontend
      let normalized = data;
      if (data && typeof data === 'object') {
        // Some homebridge versions return { hostname, platform, homebridgeVersion, serverVersion, uptime }
        const possible = {};
        if (data.hostname) possible.hostname = data.hostname;
        if (data.platform) possible.platform = data.platform;
        if (data.homebridgeVersion) possible.homebridgeVersion = data.homebridgeVersion;
        if (data.serverVersion) possible.serverVersion = data.serverVersion;
        if (data.uptime) possible.uptime = data.uptime;

        // If we collected any, use them; otherwise return the raw object
        normalized = Object.keys(possible).length > 0 ? possible : data;
      } else {
        normalized = data;
      }

      const out = { data: normalized, raw: data, responseTime, timestamp: new Date().toISOString() };
      this.lastData = out;
      return out;
    } catch (err) {
      return { error: err && err.message ? err.message : String(err), timestamp: new Date().toISOString(), lastData: this.lastData };
    }
  }
}

export default HomebridgeService;