import { exec } from 'child_process';
import { promisify } from 'util';
import net from 'net';

const execAsync = promisify(exec);

class RoonService {
  constructor(options = {}) {
    this.host = options.host || process.env.ROON_HOST || null;
    // Accept comma-separated ports via env or options
    const portsEnv = options.ports || process.env.ROON_PORTS || '';
    this.ports = Array.isArray(portsEnv)
      ? portsEnv.map(p => parseInt(p, 10)).filter(Boolean)
      : portsEnv.split(',').map(p => parseInt(p, 10)).filter(Boolean);

    // Default to an empty array (no ports to check) unless provided
    if (!this.ports || this.ports.length === 0) {
      this.ports = options.defaultPorts || [(process.env.ROON_DEFAULT_PORT && parseInt(process.env.ROON_DEFAULT_PORT)) || 9100];
    }

    this.timeout = parseInt(options.timeout || process.env.ROON_TIMEOUT || '3000', 10);
    this.pingCount = parseInt(options.pingCount || process.env.ROON_PING_COUNT || '2', 10);
    this.usePing = (options.usePing || process.env.ROON_USE_PING || 'true') === 'true';

    this.lastData = null;
  }

  async pingHost() {
    if (!this.host) throw new Error('ROON_HOST not configured');

    // Ensure the `ping` binary is available in the environment
    try {
      const { stdout: whichOut } = await execAsync('command -v ping');
      if (!whichOut || !whichOut.trim()) {
        const msg = 'ping binary not found in PATH';
        console.error(`RoonService.pingHost: ${msg}`);
        return { success: false, stdout: '', stderr: msg };
      }
    } catch (e) {
      // If the check fails, log and continue to attempt ping; we'll capture any error below
      console.warn('RoonService.pingHost: failed to verify ping binary availability:', e.message || e);
    }

    // Try multiple strategies to increase reliability across environments and IP families
    const attempts = [
      `ping -c ${this.pingCount} -4 ${this.host}`, // force IPv4
      `ping -c ${this.pingCount} ${this.host}`,     // generic
      `ping6 -c ${this.pingCount} ${this.host}`    // IPv6 (macOS/Linux)
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

        // Check for common 'packet loss' phrases across platforms
        const success = /0% packet loss|0\.0% packet loss|0 packets lost|0 received/.test(out) && !/100% packet loss/.test(out);
        if (success) {
          return { success: true, stdout: combinedStdout, stderr: combinedStderr };
        }
        // If ping returned but no success, continue to next strategy
      } catch (err) {
        // err may contain stdout/stderr; capture for diagnostics and continue
        const stdout = err.stdout || '';
        const stderr = err.stderr || err.message || '';
        combinedStdout += `\n--- cmd error: ${cmd} ---\n` + stdout;
        combinedStderr += `\n--- cmd error: ${cmd} ---\n` + stderr;
        // keep trying other commands
      }
    }

    // If none of the attempts succeeded, return failure with combined outputs for debugging
    console.error(`RoonService.pingHost: all ping attempts failed for ${this.host}`);
    return { success: false, stdout: combinedStdout, stderr: combinedStderr || 'Ping attempts failed' };
  }

  checkPort(port) {
    return new Promise(resolve => {
      const socket = new net.Socket();
      let done = false;

      socket.setTimeout(this.timeout);

      socket.once('connect', () => {
        done = true;
        socket.destroy();
        resolve({ port, open: true });
      });

      socket.once('timeout', () => {
        if (!done) { done = true; socket.destroy(); resolve({ port, open: false }); }
      });

      socket.once('error', () => {
        if (!done) { done = true; socket.destroy(); resolve({ port, open: false }); }
      });

      try {
        socket.connect(port, this.host);
      } catch (err) {
        if (!done) { done = true; socket.destroy(); resolve({ port, open: false }); }
      }
    });
  }

  async checkHealth() {
    if (!this.host) {
      return {
        status: 'offline',
        error: 'ROON_HOST not configured',
        timestamp: new Date().toISOString()
      };
    }

    try {
      const pingResultRaw = this.usePing ? await this.pingHost() : null;
      // Normalize ping result to a boolean and keep raw output for debugging
      let pingResult = null;
      let pingOutput = null;
      if (pingResultRaw && typeof pingResultRaw === 'object') {
        pingResult = Boolean(pingResultRaw.success);
        pingOutput = pingResultRaw.stdout || pingResultRaw.stderr || null;
      } else if (typeof pingResultRaw === 'boolean') {
        pingResult = pingResultRaw;
      }

      // Check ports in parallel
      const portChecks = await Promise.all(this.ports.map(p => this.checkPort(p)));

      const anyPortOpen = portChecks.some(p => p.open === true);

      // Consider the host online if EITHER ping succeeds OR any configured port is open.
      // Previously the code required both ping AND an open port which caused hosts
      // that block ICMP (but have open TCP ports) to be reported offline.
      let isOnline;
      if (this.usePing) {
        isOnline = Boolean(pingResult) || anyPortOpen || (!this.ports || this.ports.length === 0);
      } else {
        isOnline = anyPortOpen || (!this.ports || this.ports.length === 0);
      }

      const result = {
        status: isOnline ? 'online' : 'offline',
        timestamp: new Date().toISOString(),
        data: {
          host: this.host,
          ping: pingResult,
          pingOutput: pingOutput,
          ports: portChecks
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
    // For now, stats are identical to health; future expansion possible
    const health = await this.checkHealth();
    return {
      ...health,
      lastUpdated: new Date().toISOString()
    };
  }

  disconnect() {
    // Nothing to disconnect for simple checks
  }
}

export default RoonService;