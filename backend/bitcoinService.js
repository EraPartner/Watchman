const { SocksProxyAgent } = require('socks-proxy-agent');
const fetch = require('node-fetch');
const crypto = require('crypto');

class BitcoinService {
  constructor({ onionHost, rpcUser, rpcAuthHash, rpcPort = 8332, torProxy = 'socks5h://127.0.0.1:9050' }) {
    this.onionHost = onionHost;
    this.rpcUser = rpcUser;
    this.rpcAuthHash = rpcAuthHash; // The hash part from rpcauth
    this.rpcPort = rpcPort;
    this.torProxy = torProxy;
    this.baseUrl = `http://${onionHost}:${rpcPort}`;
    this.timeout = 20000;
  }

  // Parse and validate rpcauth hash for authentication
  validateRpcAuth(password) {
    if (!this.rpcAuthHash) {
      throw new Error('rpcauth hash not provided');
    }

    // Split the hash into salt and hash parts
    const [salt, expectedHash] = this.rpcAuthHash.split('$');
    if (!salt || !expectedHash) {
      throw new Error('Invalid rpcauth hash format');
    }

    // Generate HMAC-SHA256 hash
    const hmac = crypto.createHmac('sha256', Buffer.from(salt, 'hex'));
    hmac.update(password);
    const computedHash = hmac.digest('hex');

    return computedHash === expectedHash;
  }

  // Generate a one-time password for this session
  generateSessionPassword() {
    // For security, you still need to provide the original password
    // This could be loaded from a more secure source or prompted
    return process.env.BITCOIN_RPC_SESSION_PASSWORD;
  }

  async checkHealth() {
    const startTime = Date.now();
    try {
      const info = await this.rpcCall('getblockchaininfo');
      const responseTime = Date.now() - startTime;
      if (!info) {
        return {
          status: 'offline',
          responseTime,
          lastCheck: new Date(),
          error: 'No response from node',
        };
      }
      if (info.initialblockdownload) {
        return {
          status: 'warning',
          responseTime,
          lastCheck: new Date(),
          error: 'Initial block download in progress',
        };
      }
      return {
        status: 'online',
        responseTime,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        status: 'offline',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getStats() {
    try {
      const [network, blockchain] = await Promise.all([
        this.rpcCall('getnetworkinfo'),
        this.rpcCall('getblockchaininfo'),
      ]);
      return {
        version: network.subversion,
        protocolVersion: network.protocolversion,
        blocks: blockchain.blocks,
        headers: blockchain.headers,
        connections: network.connections,
        difficulty: blockchain.difficulty,
        verificationProgress: blockchain.verificationprogress,
        initialBlockDownload: blockchain.initialblockdownload,
        chain: blockchain.chain,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async rpcCall(method, params = []) {
    const sessionPassword = this.generateSessionPassword();
    
    if (!sessionPassword) {
      throw new Error('Session password required for rpcauth validation');
    }

    // Validate the session password against the hash
    if (!this.validateRpcAuth(sessionPassword)) {
      throw new Error('Invalid credentials');
    }

    const auth = Buffer.from(`${this.rpcUser}:${sessionPassword}`).toString('base64');
    const agent = new SocksProxyAgent(this.torProxy);
    
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: Date.now(),
        method,
        params,
      }),
      agent,
      timeout: this.timeout,
    });
    
    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    if (data.error) {
      throw new Error(`Bitcoin RPC error: ${data.error.message}`);
    }
    
    return data.result;
  }
}

module.exports = BitcoinService;