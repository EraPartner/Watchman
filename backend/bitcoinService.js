const { SocksProxyAgent } = require('socks-proxy-agent');
const fetch = require('node-fetch');

class BitcoinService {
  constructor({ onionHost, rpcUser, rpcPassword, rpcPort = 8332, torProxy = 'socks5h://127.0.0.1:9050' }) {
    this.onionHost = onionHost;
    this.rpcUser = rpcUser;
    this.rpcPassword = rpcPassword; // Direct password instead of hash
    this.rpcPort = rpcPort;
    this.torProxy = torProxy;
    this.baseUrl = `http://${onionHost}:${rpcPort}`;
    this.timeout = 20000;
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
      const [network, blockchain, mempool] = await Promise.all([
        this.rpcCall('getnetworkinfo'),
        this.rpcCall('getblockchaininfo'),
        this.rpcCall('getmempoolinfo'),
      ]);
      
      return {
        version: network.subversion,
        protocolVersion: network.protocolversion,
        blocks: blockchain.blocks,
        headers: blockchain.headers,
        connections: network.connections,
        inbound: network.connections_in,
        outbound: network.connections_out,
        difficulty: blockchain.difficulty,
        verificationProgress: blockchain.verificationprogress,
        initialBlockDownload: blockchain.initialblockdownload,
        chain: blockchain.chain,
        networkHashPs: blockchain.networkhashps || 0,
        mempool: {
          size: mempool.size,
          bytes: mempool.bytes,
          usage: mempool.usage,
          maxmempool: mempool.maxmempool,
          mempoolminfee: mempool.mempoolminfee,
        },
        uptime: network.uptime || 0,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async rpcCall(method, params = []) {
    if (!this.rpcUser || !this.rpcPassword) {
      throw new Error('Bitcoin RPC credentials not configured');
    }

    const auth = Buffer.from(`${this.rpcUser}:${this.rpcPassword}`).toString('base64');
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