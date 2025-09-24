type HealthResult = { status: string; [key: string]: any };

type BatchPromise = {
  serviceName: string;
  resolve: (value: HealthResult) => void;
  reject: (err: any) => void;
};

type Batch = {
  services: Set<string>;
  promises: BatchPromise[];
  isProcessing?: boolean;
};

type QueuedRequest = {
  id: string;
  url: string;
  options?: RequestInit;
  // resolvers are not persisted to storage - only kept in-memory
  resolve?: (r: Response) => void;
  reject?: (e: any) => void;
};

const BG_QUEUE_STORAGE_KEY = 'watchman:bgsync:queue:v1';

function timeoutSignal(ms: number) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, clear: () => clearTimeout(id) };
}

class RequestBatcher {
  batches: Map<string, Batch> = new Map();
  batchTimeout = 100; // ms
  maxBatchSize = 10;
  timers: Map<string, number> = new Map();

  constructor(options?: { batchTimeout?: number; maxBatchSize?: number }) {
    if (options) {
      if (typeof options.batchTimeout === 'number') this.batchTimeout = options.batchTimeout;
      if (typeof options.maxBatchSize === 'number') this.maxBatchSize = options.maxBatchSize;
    }
  }

  // Backwards-compatible: old callers could pass resolve/reject; new callers can await the promise.
  batchHealthCheck(serviceName: string, resolve?: (r: HealthResult) => void, reject?: (e: any) => void): Promise<HealthResult> | void {
    const batchKey = 'health-check';

    if (!this.batches.has(batchKey)) {
      this.batches.set(batchKey, { services: new Set(), promises: [] });
    }

    const batch = this.batches.get(batchKey)!;
    batch.services.add(serviceName);

    if (resolve && reject) {
      batch.promises.push({ serviceName, resolve, reject });
    } else {
      // Return a promise for newer callers
      return new Promise<HealthResult>((res, rej) => {
        batch.promises.push({ serviceName, resolve: res, reject: rej });
      });
    }

    // Ensure a single timer per batch
    if (!this.timers.has(batchKey)) {
      const id = window.setTimeout(() => this.processBatch(batchKey), this.batchTimeout);
      this.timers.set(batchKey, id);
    }

    // If batch grows large, process immediately
    if (batch.services.size >= this.maxBatchSize) {
      this.clearTimer(batchKey);
      this.processBatch(batchKey);
    }
  }

  clearTimer(batchKey: string) {
    const t = this.timers.get(batchKey);
    if (t) {
      clearTimeout(t);
      this.timers.delete(batchKey);
    }
  }

  async processBatch(batchKey: string) {
    const batch = this.batches.get(batchKey);
    if (!batch) return;

    // Prevent concurrent processing of the same batch
    if (batch.isProcessing) return;
    batch.isProcessing = true;

    // Clean up timer
    this.clearTimer(batchKey);
    // Remove the batch early so new requests start a fresh batch
    this.batches.delete(batchKey);

    try {
      const services = Array.from(batch.services);

      // Use a short timeout for the fetch so callers won't hang indefinitely
      const { signal, clear } = timeoutSignal(10_000);

      const response = await fetch('/api/services/health-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services }),
        signal
      });

      clear();

      if (!response.ok) {
        const text = await response.text().catch(() => String(response.status));
        throw new Error(`Batch health request failed: ${response.status} - ${text}`);
      }

      const results: Record<string, HealthResult> = await response.json();

      batch.promises.forEach(({ serviceName, resolve }) => {
        const result = results[serviceName] || { status: 'offline' };
        try {
          resolve(result);
        } catch (e) {
          // Ignore individual resolver errors to allow the rest to proceed
          // eslint-disable-next-line no-console
          console.error('Resolver threw when resolving batched health check', e);
        }
      });
    } catch (error) {
      batch.promises.forEach(({ reject }) => {
        try {
          reject(error);
        } catch (e) {
          // Ignore
        }
      });
    } finally {
      batch.isProcessing = false;
    }
  }
}

class BackgroundSync {
  queue: QueuedRequest[] = [];
  isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  maxConcurrent = 3;
  activeRequests = 0;
  isProcessing = false;

  constructor() {
    this.loadQueueFromStorage();
    this.setupEventListeners();

    // If we're online on init, attempt to process any persisted queue
    if (this.isOnline && this.queue.length > 0) {
      this.processQueue();
    }
  }

  setupEventListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  saveQueueToStorage() {
    try {
      const serializable = this.queue.map((q) => ({ id: q.id, url: q.url, options: this.serializeOptions(q.options) }));
      localStorage.setItem(BG_QUEUE_STORAGE_KEY, JSON.stringify(serializable));
    } catch (e) {
      // ignore storage errors
    }
  }

  loadQueueFromStorage() {
    try {
      const raw = localStorage.getItem(BG_QUEUE_STORAGE_KEY);
      if (!raw) return;
      const parsed: Array<{ id: string; url: string; options?: any }> = JSON.parse(raw);
      // Rehydrate into in-memory queue; note: resolve/reject won't be present for persisted items
      this.queue = parsed.map((p) => ({ id: p.id, url: p.url, options: this.deserializeOptions(p.options) }));
    } catch (e) {
      // ignore parse errors
    }
  }

  serializeOptions(options?: RequestInit) {
    if (!options) return undefined;
    const headers: Record<string, string> = {};
    try {
      const h = new Headers(options.headers || {});
      h.forEach((v, k) => (headers[k] = v));
    } catch (e) {
      // ignore
    }
    return { method: options.method, headers, body: options.body };
  }

  deserializeOptions(obj?: any): RequestInit | undefined {
    if (!obj) return undefined;
    const headers = obj.headers ? obj.headers : undefined;
    return {
      method: obj.method,
      headers,
      body: obj.body
    } as RequestInit;
  }

  queueRequest(url: string, options?: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
      const req: QueuedRequest = { id: String(Date.now()) + ':' + Math.random().toString(36).slice(2), url, options, resolve, reject };

      if (this.isOnline) {
        // Try immediate fetch but still fall back to queue on failure
        fetch(url, options).then((res) => resolve(res)).catch((err) => {
          // Queue for later
          this.queue.push(req);
          this.saveQueueToStorage();
          reject(err);
        });
      } else {
        this.queue.push(req);
        this.saveQueueToStorage();
        // Keep the promise unresolved until processed
      }
    });
  }

  async processQueue() {
    if (!this.isOnline) return;
    if (this.isProcessing) return; // guard
    this.isProcessing = true;

    try {
      // Process with limited concurrency
      while (this.queue.length > 0 && this.isOnline) {
        if (this.activeRequests >= this.maxConcurrent) {
          // wait a bit for active requests to settle
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        const req = this.queue.shift()!;
        this.saveQueueToStorage();
        this.activeRequests++;

        // Do the fetch and resolve/reject the original promise if present
        (async () => {
          try {
            const response = await fetch(req.url, req.options);
            req.resolve && req.resolve(response);
          } catch (err) {
            // On failure, if still online we requeue with a small backoff; if offline, put back to queue
            if (!this.isOnline) {
              // put back
              this.queue.unshift(req);
              this.saveQueueToStorage();
            } else {
              // retry once after delay
              setTimeout(() => {
                this.queue.push(req);
                this.saveQueueToStorage();
              }, 1000);
              req.reject && req.reject(err);
            }
          } finally {
            this.activeRequests--;
          }
        })();
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

export const requestBatcher = new RequestBatcher();
export const backgroundSync = new BackgroundSync();