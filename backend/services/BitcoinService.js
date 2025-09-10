import { SocksProxyAgent } from 'socks-proxy-agent';
import fetch from 'node-fetch';

class BitcoinService {
  constructor({ onionHost, rpcUser, rpcPassword, rpcPort = 8332, torProxy = 'socks5h://127.0.0.1:9050' }) {
    this.onionHost = onionHost;
    this.rpcUser = rpcUser;
    this.rpcPassword = rpcPassword;
    this.rpcPort = rpcPort;
    this.torProxy = torProxy;
    this.baseUrl = `http://${onionHost}:${rpcPort}`;
    this.timeout = 30000; // 30 seconds for Tor connections
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
          progress: info.verificationprogress,
        };
      }
      
      return {
        status: 'online',
        responseTime,
        lastCheck: new Date(),
        blocks: info.blocks,
        headers: info.headers,
        chain: info.chain,
        verificationProgress: info.verificationprogress,
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
        this.rpcCall('getmempoolinfo')
      ]);
      
      return {
        version: network.subversion,
        protocolVersion: network.protocolversion,
        blocks: blockchain.blocks,
        headers: blockchain.headers,
        connections: network.connections,
        inbound: network.connections_in || 0,
        outbound: network.connections_out || 0,
        difficulty: blockchain.difficulty,
        verificationProgress: blockchain.verificationprogress,
        initialBlockDownload: blockchain.initialblockdownload,
        chain: blockchain.chain,
        networkHashPs: blockchain.mediantime ? await this.getNetworkHashrate() : null,
        mempool: {
          size: mempool.size,
          bytes: mempool.bytes,
          usage: mempool.usage,
          maxmempool: mempool.maxmempool,
          mempoolminfee: mempool.mempoolminfee,
        },
        uptime: network.timeoffset || 0,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getNetworkHashrate() {
    try {
      // Get network hashrate over the last 120 blocks (approximately 20 hours)
      return await this.rpcCall('getnetworkhashps', [120]);
    } catch (error) {
      console.warn('Failed to get network hashrate:', error.message);
      return null;
    }
  }

  async rpcCall(method, params = []) {
    if (!this.rpcUser || !this.rpcPassword) {
      throw new Error('Bitcoin RPC authentication not configured. Please provide BITCOIN_RPC_USER and BITCOIN_RPC_PASSWORD in environment.');
    }

    const auth = Buffer.from(`${this.rpcUser}:${this.rpcPassword}`).toString('base64');
    const agent = new SocksProxyAgent(this.torProxy);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
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
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data.error) {
        throw new Error(`Bitcoin RPC error: ${data.error.message}`);
      }
      
      return data.result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Bitcoin RPC timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}

export default BitcoinService;