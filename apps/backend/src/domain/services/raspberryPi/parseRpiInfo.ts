export interface RpiInfo {
  piModel: string | null;
  hwRevision: number | null;
  cpuTemp: number | null;
  clockRate: number | null;
  voltage: number | null;
  memory: string | null;
  uptime: number | null;
  load: number | null;
  swap: number | null;
  prettyName: string | null;
  processor: string | null;
  isRpi: boolean;
}

export function parseRpiInfo(raw: unknown, now: () => number = Date.now): RpiInfo {
  const info: RpiInfo = {
    piModel: null,
    hwRevision: null,
    cpuTemp: null,
    clockRate: null,
    voltage: null,
    memory: null,
    uptime: null,
    load: null,
    swap: null,
    prettyName: null,
    processor: null,
    isRpi: false,
  };
  if (!raw || typeof raw !== 'object') return info;
  const d = raw as Record<string, unknown>;
  if (typeof d['model'] === 'string') info.piModel = d['model'];
  if (typeof d['prettyName'] === 'string') info.prettyName = d['prettyName'];
  if (typeof d['processor'] === 'string') info.processor = d['processor'];
  if (typeof d['memory'] === 'string') info.memory = d['memory'];
  if (typeof d['isRpi'] === 'boolean') info.isRpi = d['isRpi'];
  if (typeof d['revision'] === 'string') {
    const n = parseInt(d['revision'], 16);
    info.hwRevision = Number.isFinite(n) ? n : null;
  }
  const state = d['state'];
  if (state && typeof state === 'object') {
    const s = state as Record<string, unknown>;
    info.cpuTemp = num(s['temp']);
    const freq = num(s['freq']);
    info.clockRate = freq != null ? Math.round(freq / 1_000_000) : null;
    info.voltage = num(s['volt']);
    info.load = num(s['load']);
    info.swap = num(s['swap']);
    if (typeof s['boot'] === 'string') {
      const boot = new Date(s['boot']).getTime();
      if (Number.isFinite(boot)) info.uptime = Math.floor((now() - boot) / 1000);
    }
  }
  return info;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
