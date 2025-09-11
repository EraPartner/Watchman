import { execSync } from 'child_process';

export class BitcoinService {
  constructor(config = {}) {
    this.config = {
      rpcUrl: config.rpcUrl || 'http://127.0.0.1:8332',
      rpcUser: config.rpcUser || process.env.BITCOIN_RPC_USER,
      rpcPassword: config.rpcPassword || process.env.BITCOIN_RPC_PASSWORD,
      timeout: config.timeout || 50000, // 50 seconds for Bitcoin RPC calls over Tor
      ...config
    };
  }

  async checkHealth() {
    try {
      // Try to get basic blockchain info to check if Bitcoin node is responsive
      const result = await this.executeRpcCommand('getblockchaininfo');
      
      if (result && result.chain) {
        return {
          status: 'online',
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          status: 'warning',
          error: 'Bitcoin node responding but data incomplete',
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      return {
        status: 'offline',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getStats() {
    try {
      // Get blockchain info
      const blockchainInfo = await this.executeRpcCommand('getblockchaininfo');
      
      // Get network info for connections and version
      const networkInfo = await this.executeRpcCommand('getnetworkinfo');
      
      // Get mempool info
      const mempoolInfo = await this.executeRpcCommand('getmempoolinfo');
      
      // Get uptime
      const uptime = await this.executeRpcCommand('uptime');

      return {
        version: networkInfo.subversion || networkInfo.version || 'Unknown',
        protocolVersion: networkInfo.protocolversion || 0,
        blocks: blockchainInfo.blocks || 0,
        headers: blockchainInfo.headers || 0,
        connections: networkInfo.connections || 0,
        inbound: networkInfo.connections_in || 0,
        outbound: networkInfo.connections_out || 0,
        difficulty: blockchainInfo.difficulty || 0,
        verificationProgress: blockchainInfo.verificationprogress || 0,
        initialBlockDownload: blockchainInfo.initialblockdownload || false,
        chain: blockchainInfo.chain || 'unknown',
        networkHashPs: blockchainInfo.networkhashps || 0,
        mempool: {
          size: mempoolInfo.size || 0,
          bytes: mempoolInfo.bytes || 0,
          usage: mempoolInfo.usage || 0,
          maxmempool: mempoolInfo.maxmempool || 0,
          mempoolminfee: mempoolInfo.mempoolminfee || 0,
        },
        uptime: uptime || 0
      };
    } catch (error) {
      throw new Error(`Failed to get Bitcoin stats: ${error.message}`);
    }
  }

  async executeRpcCommand(method, params = []) {
    if (!this.config.rpcUser || !this.config.rpcPassword) {
      throw new Error('Bitcoin RPC credentials not configured');
    }

    // If using proxy, first check if it's available
    if (this.config.useProxy) {
      const proxyAvailable = await this.checkProxyConnection();
      if (!proxyAvailable) {
        throw new Error(`Tor proxy not available at ${this.config.torProxy.host}:${this.config.torProxy.port} - check if Tor is running with SOCKS proxy enabled`);
      }
    }

    try {
      let curlCommand = `curl -s --connect-timeout 15 --max-time 45 --user ${this.config.rpcUser}:${this.config.rpcPassword}`;
      
      // Add Tor proxy configuration if needed
      if (this.config.useProxy) {
        curlCommand += ` --socks5-hostname ${this.config.torProxy.host}:${this.config.torProxy.port}`;
      }
      
      curlCommand += ` --data-binary '{"jsonrpc":"1.0","id":"watchman","method":"${method}","params":${JSON.stringify(params)}}' -H 'content-type: text/plain;' ${this.config.rpcUrl}`;
      
      const result = execSync(curlCommand, { 
        timeout: this.config.timeout,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      const parsed = JSON.parse(result);
      
      if (parsed.error) {
        throw new Error(`Bitcoin RPC error: ${parsed.error.message}`);
      }
      
      return parsed.result;
    } catch (error) {
      // Handle specific timeout errors
      if (error.code === 'ETIMEDOUT' || error.message.includes('ETIMEDOUT')) {
        throw new Error('Bitcoin RPC request timed out - node may be slow or unreachable');
      } else if (error.message.includes('ECONNREFUSED')) {
        throw new Error('Bitcoin node not reachable - check if Bitcoin Core is running');
      } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        throw new Error('Bitcoin RPC authentication failed - check credentials');
      } else if (error.message.includes('Connection refused')) {
        throw new Error('Bitcoin node connection refused - check if Bitcoin Core is running and RPC is enabled');
      } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
        throw new Error('Bitcoin RPC request timed out - consider increasing timeout or checking network');
      } else if (error.message.includes('Could not resolve host')) {
        throw new Error('Cannot resolve Bitcoin node hostname - check network or Tor proxy');
      } else if (error.message.includes('Failed to connect')) {
        throw new Error('Failed to connect to Bitcoin node - check if node is running and accessible');
      } else if (error.message.includes('SOCKS') || error.message.includes('proxy')) {
        throw new Error('SOCKS proxy connection failed - check if Tor is running with SOCKS proxy on the configured port');
      } else {
        throw new Error(`Bitcoin RPC call failed: ${error.message}`);
      }
    }
  }

  async checkProxyConnection() {
    try {
      const result = execSync(`nc -z ${this.config.torProxy.host} ${this.config.torProxy.port}`, {
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return true;
    } catch {
      return false;
    }
  }
}