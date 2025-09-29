import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class PhilipsBridgeService {
  constructor(options = {}) {
    this.host = options.host || process.env.PHILIPS_BRIDGE_HOST || null;
    this.pingCount = parseInt(options.pingCount || process.env.PHILIPS_PING_COUNT || '2', 10);
    this.timeout = parseInt(options.timeout || process.env.PHILIPS_TIMEOUT || '3000', 10);
    this.usePing = (typeof options.usePing === 'boolean')
      ? options.usePing
      : String(options.usePing ?? process.env.PHILIPS_USE_PING ?? 'true') === 'true';

    this.lastData = null;
  }

  async pingHost() {
    if (!this.host) throw new Error('PHILIPS_BRIDGE_HOST not configured');

    // Try multiple ping commands to handle IPv4/IPv6/platform variance
    const attempts = [
      `ping -c ${this.pingCount} -4 ${this.host}`,
      `ping -c ${this.pingCount} ${this.host}`,
      `ping6 -c ${this.pingCount} ${this.host}`
    ];

    let combinedStdout = '';
    let combinedStderr = '';

    for (const cmd of attempts) {
      try {
        const { stdout, stderr } = await execAsync(cmd, { timeout: this.timeout + 1500 });
        const out = stdout || '';
        const errOut = stderr || '';
        combinedStdout += `\n--- cmd: ${cmd} ---\n` + out;
        combinedStderr += `\n--- cmd: ${cmd} ---\n` + errOut;

        const success = /0% packet loss|0\.0% packet loss|0 packets lost|0 received/.test(out) && !/100% packet loss/.test(out);
        if (success) {
          return { success: true, stdout: combinedStdout, stderr: combinedStderr };
        }
      } catch (err) {
        const stdout = err.stdout || '';
        const stderr = err.stderr || err.message || '';
        combinedStdout += `\n--- cmd error: ${cmd} ---\n` + stdout;
        combinedStderr += `\n--- cmd error: ${cmd} ---\n` + stderr;
      }
    }

    if (!combinedStdout && !combinedStderr) {
      combinedStderr = 'No ping output captured; ping may be unavailable or blocked';
    }

    return { success: false, stdout: combinedStdout, stderr: combinedStderr || 'Ping attempts failed' };
  }

  async checkHealth() {
    if (!this.host) {
      return {
        status: 'offline',
        error: 'PHILIPS_BRIDGE_HOST not configured',
        timestamp: new Date().toISOString()
      };
    }

    try {
      const pingRaw = this.usePing ? await this.pingHost() : null;
      let pingResult = null;
      let pingOutput = null;

      if (this.usePing) {
        if (pingRaw && typeof pingRaw === 'object') {
          pingResult = Boolean(pingRaw.success);
          pingOutput = (pingRaw.stdout && pingRaw.stdout.trim()) ? pingRaw.stdout.trim() : (pingRaw.stderr && pingRaw.stderr.trim()) ? pingRaw.stderr.trim() : 'No ping output';
        } else {
          pingResult = false;
          pingOutput = 'Ping check unavailable';
        }
      }

      const isOnline = this.usePing ? Boolean(pingResult) : false;

      const result = {
        status: isOnline ? 'online' : 'offline',
        timestamp: new Date().toISOString(),
        data: {
          host: this.host,
          ping: pingResult,
          pingOutput: pingOutput
        }
      };

      this.lastData = result;
      return result;
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        lastData: this.lastData,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getStats() {
    const health = await this.checkHealth();
    return {
      ...health,
      lastUpdated: new Date().toISOString()
    };
  }

  disconnect() {
    // No persistent connections
  }
}

export default PhilipsBridgeService;
