import fetch from "node-fetch";

export default class IpfsService {
  constructor(config = {}) {
    this.apiUrl =
      config.apiUrl || process.env.IPFS_API_URL || "http://127.0.0.1:5001";
    this.timeout =
      typeof config.timeout === "number"
        ? config.timeout
        : process.env.IPFS_TIMEOUT
        ? parseInt(process.env.IPFS_TIMEOUT)
        : 5000;
    this.forcePost =
      config.forcePost !== undefined
        ? config.forcePost
        : process.env.IPFS_FORCE_POST === "true";
    this.lastCheck = null;
  }

  // Accept an optional `method` override (e.g. 'POST') to explicitly use POST for specific endpoints
  async _fetch(path, method = undefined) {
    const url = `${this.apiUrl.replace(/\/+$/, "")}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const doRequest = async (reqMethod = "GET") => {
      try {
        let opts;
        if (reqMethod === "GET") {
          opts = { signal: controller.signal };
        } else {
          // Some proxies / setups require POST requests to have a Content-Type and a body
          opts = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "",
            signal: controller.signal,
          };
        }
        const res = await fetch(url, opts);
        return res;
      } catch (err) {
        throw err;
      }
    };

    try {
      // Choose initial method: explicit method param -> forcePost -> default GET
      const firstMethod = method ? method : this.forcePost ? "POST" : "GET";

      let res = await doRequest(firstMethod);

      // If the server rejects the first method with 405, retry with the other method
      if (res && res.status === 405) {
        const fallback = firstMethod === "GET" ? "POST" : "GET";
        console.warn(
          `IPFS API ${path} returned 405 on ${firstMethod}, retrying with ${fallback}`
        );
        res = await doRequest(fallback);
      }

      clearTimeout(timeoutId);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`IPFS API ${path} returned ${res.status}: ${text}`);
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return res.json();
      }

      // Try to parse as JSON even if content-type is missing
      const txt = await res.text();
      try {
        return JSON.parse(txt);
      } catch (e) {
        return txt;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err && err.name === "AbortError")
        throw new Error("Request timed out");
      throw err;
    }
  }

  async checkHealth() {
    const checkedAt = new Date().toISOString();
    try {
      // Per Kubo docs and your request: use POST for the version endpoint
      const v = await this._fetch("/api/v0/version", "POST");
      this.lastCheck = checkedAt;
      return {
        status: "online",
        version:
          v && (v.Version || v.version) ? v.Version || v.version : "unknown",
        lastCheck: checkedAt,
      };
    } catch (error) {
      return {
        status: "offline",
        error: error.message,
        lastCheck: checkedAt,
      };
    }
  }

  async getStats() {
    try {
      // Request the endpoints; request version using POST as requested
      const [version, id, peersRes, repo, bwRes, bitswapRes] =
        await Promise.all([
          this._fetch("/api/v0/version", "POST"),
          this._fetch("/api/v0/id"),
          this._fetch("/api/v0/swarm/peers?format=json").catch(() => null),
          this._fetch("/api/v0/repo/stat?format=json").catch(() => null),
          this._fetch("/api/v0/stats/bw?format=json").catch(() => null),
          this._fetch("/api/v0/stats/bitswap?format=json").catch(() => null),
        ]);

      // Normalize peers count
      let peersCount = 0;
      if (peersRes) {
        if (Array.isArray(peersRes)) {
          peersCount = peersRes.length;
        } else if (peersRes && Array.isArray(peersRes.Peers)) {
          peersCount = peersRes.Peers.length;
        } else if (typeof peersRes === "string") {
          peersCount = peersRes.split("\n").filter(Boolean).length;
        }
      }

      // Normalize repo stats (Kubo returns e.g. { "RepoSize": 12345, "NumObjects": 123 })
      const repoStats =
        repo &&
        (repo.RepoSize || repo.repoSize || repo.NumObjects || repo.numObjects)
          ? {
              repoSize: repo.RepoSize || repo.repoSize || null,
              numObjects: repo.NumObjects || repo.numObjects || null,
            }
          : null;

      // Normalize bandwidth stats (stats/bw returns { "TotalIn": number, "TotalOut": number, "RateIn": number, "RateOut": number })
      const bw =
        bwRes && (bwRes.TotalIn !== undefined || bwRes.RateIn !== undefined)
          ? {
              totalIn: bwRes.TotalIn || bwRes.totalIn || 0,
              totalOut: bwRes.TotalOut || bwRes.totalOut || 0,
              rateIn: bwRes.RateIn || bwRes.rateIn || 0,
              rateOut: bwRes.RateOut || bwRes.rateOut || 0,
            }
          : null;

      // Normalize bitswap stats if available
      const bitswap = bitswapRes || null;

      return {
        version:
          version && (version.Version || version.version)
            ? version.Version || version.version
            : "unknown",
        id: id && (id.ID || id.id) ? id.ID || id.id : null,
        addresses:
          id && id.Addresses
            ? id.Addresses
            : id && id.addresses
            ? id.addresses
            : [],
        peers: peersCount,
        repo: repoStats,
        bw,
        bitswap,
      };
    } catch (error) {
      throw new Error(`Failed to fetch IPFS stats: ${error.message}`);
    }
  }
}
