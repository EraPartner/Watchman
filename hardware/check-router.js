import dotenv from "dotenv";
import ping from "ping";
import net from "net";
import path from "path";

// Load configuration from .env.local if present
dotenv.config({ path: ".env.local" });

const DEFAULT_HOST = "192.168.1.1";
const DEFAULT_PORTS = [80, 443, 22, 53];
const PING_TIMEOUT_SEC = Number(process.env.PING_TIMEOUT_SEC ?? 2);
const TCP_TIMEOUT_MS = Number(process.env.TCP_TIMEOUT_MS ?? 3000);
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS ?? 3000);

function parsePorts(envPorts) {
  if (!envPorts) return DEFAULT_PORTS;
  return envPorts
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 65536);
}

async function getFetch() {
  if (globalThis.fetch) return globalThis.fetch;
  // dynamic ESM import of a fetch implementation when needed (prefers undici)
  const mod = await import("undici");
  // undici exports a fetch function
  return mod.fetch.bind(mod);
}

async function pingHost(host) {
  try {
    const res = await ping.promise.probe(host, { timeout: PING_TIMEOUT_SEC });
    return Boolean(res && res.alive);
  } catch (err) {
    return false;
  }
}

async function httpCheck(host) {
  try {
    const fetch = await getFetch();
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const url = host.startsWith("http") ? host : `http://${host}`;
    const resp = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    clearTimeout(id);
    return (
      resp.ok ||
      (resp.status >= 300 && resp.status < 400) ||
      resp.status === 401
    );
  } catch (err) {
    return false;
  }
}

function tcpCheck(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const onDone = (v) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch (e) {}
      resolve(v);
    };

    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.once("error", () => onDone(false));
    socket.once("timeout", () => onDone(false));
    socket.connect(port, host, () => onDone(true));
  });
}

async function checkHost(host, ports) {
  const pingOk = await pingHost(host);
  const httpOk = await httpCheck(host);
  const portResults = {};

  await Promise.all(
    ports.map(async (p) => {
      const ok = await tcpCheck(host, p);
      portResults[p] = ok;
    })
  );

  const healthy =
    pingOk && (httpOk || Object.values(portResults).some(Boolean));

  return {
    host,
    ping: pingOk,
    http: httpOk,
    ports: portResults,
    healthy,
    checkedAt: new Date().toISOString(),
  };
}

export async function main() {
  const argHost = process.argv[2];

  // Support two named routers (BERYL and TELENET) via env vars.
  // Fallbacks (in order): command-line arg (single host), multiple envs, single ROUTER_HOST.
  const routers = [];

  if (argHost) {
    routers.push({
      name: "arg",
      host: argHost,
      ports: parsePorts(process.env.ROUTER_PORTS),
    });
  } else {
    // Look for explicit BERYL and TELENET definitions
    const bHost = process.env.BERYL_HOST || process.env.ROUTER_BERYL_HOST;
    const tHost = process.env.TELENET_HOST || process.env.ROUTER_TELENET_HOST;

    if (bHost) {
      routers.push({
        name: "beryl",
        host: bHost,
        ports: parsePorts(
          process.env.BERYL_PORTS || process.env.ROUTER_BERYL_PORTS
        ),
      });
    }
    if (tHost) {
      routers.push({
        name: "telenet",
        host: tHost,
        ports: parsePorts(
          process.env.TELENET_PORTS || process.env.ROUTER_TELENET_PORTS
        ),
      });
    }

    // If none found, fallback to generic ROUTER_HOST (single)
    if (!bHost && !tHost) {
      const host = process.env.ROUTER_HOST || DEFAULT_HOST;
      routers.push({
        name: "router",
        host,
        ports: parsePorts(process.env.ROUTER_PORTS),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        note: "Starting router checks",
        routers: routers.map((r) => ({
          name: r.name,
          host: r.host,
          ports: r.ports,
        })),
      },
      null,
      2
    )
  );

  const results = [];
  for (const r of routers) {
    const res = await checkHost(r.host, r.ports);
    results.push({ name: r.name, ...res });
  }

  console.log(
    JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)
  );
}

// Only run when executed directly
const isMain =
  path.basename(process.argv[1] || "") ===
  path.basename(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((err) => {
    console.error("fatal:", err && err.stack ? err.stack : err);
    process.exit(1);
  });
}
