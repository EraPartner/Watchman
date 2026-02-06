import net from "net";
import ping from "ping";

export default class RouterService {
  constructor(opts = {}) {
    this.name = opts.name || "router";
    this.host = opts.host || null;
    this.ports = Array.isArray(opts.ports)
      ? opts.ports
      : opts.ports
        ? String(opts.ports)
            .split(/[,\s]+/)
            .map((p) => Number(p))
            .filter(Boolean)
        : [];
    this.timeout =
      typeof opts.timeout === "number" ? opts.timeout : opts.timeoutMs || 3000;
    this.pingCount = typeof opts.pingCount === "number" ? opts.pingCount : 1;
  }

  async _pingHost() {
    if (!this.host) return { alive: false, time: null };
    try {
      const res = await ping.promise.probe(this.host, {
        timeout: Math.max(1, Math.ceil(this.timeout / 1000)),
        min_reply: this.pingCount,
      });
      // ping.promise.probe returns time as string or 'unknown'
      const time =
        res && res.time && !isNaN(Number(res.time)) ? Number(res.time) : null;
      return { alive: Boolean(res && res.alive), time };
    } catch (err) {
      return { alive: false, time: null };
    }
  }

  tcpCheck(port) {
    return new Promise((resolve) => {
      if (!this.host || !port) return resolve(false);
      const socket = new net.Socket();
      let done = false;
      const onDone = (ok) => {
        if (done) return;
        done = true;
        try {
          socket.destroy();
        } catch {
          // Socket may already be destroyed; safe to ignore
        }
        resolve(ok);
      };
      socket.setTimeout(this.timeout);
      socket.once("error", () => onDone(false));
      socket.once("timeout", () => onDone(false));
      socket.connect(port, this.host, () => onDone(true));
    });
  }

  async checkHealth() {
    const checkedAt = new Date().toISOString();
    if (!this.host) {
      return {
        status: "not_configured",
        responseTime: null,
        ports: {},
        lastCheck: checkedAt,
        error: "Host not configured",
      };
    }

    // Run ping and port checks concurrently (ping first)
    const pingPromise = this._pingHost();
    const portPromises =
      this.ports && this.ports.length > 0
        ? this.ports.map((p) => this.tcpCheck(p))
        : [];

    const [pingRes, ...portResults] = await Promise.all([
      pingPromise,
      ...portPromises,
    ]);

    const portsMap = {};
    if (this.ports && this.ports.length > 0) {
      for (let i = 0; i < this.ports.length; i++) {
        portsMap[this.ports[i]] = !!portResults[i];
      }
    }

    const anyPortOpen = Object.values(portsMap).some((v) => v === true);
    const icmpAlive = Boolean(pingRes && pingRes.alive);
    const responseTime = pingRes && pingRes.time ? pingRes.time : null;

    // Determine status per your requirement: online if one of the ports is open; otherwise warning if ICMP responds; else offline
    let status = "offline";
    if (anyPortOpen) status = "online";
    else if (icmpAlive) status = "warning";

    return {
      status,
      responseTime,
      icmpAlive,
      ports: portsMap,
      host: this.host,
      lastCheck: checkedAt,
    };
  }

  // For parity with other services
  async getStats() {
    return {
      host: this.host,
      ports: this.ports,
      configured: !!this.host,
    };
  }
}
