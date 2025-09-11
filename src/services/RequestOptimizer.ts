class RequestBatcher {
  constructor() {
    this.batches = new Map();
    this.batchTimeout = 100; // 100ms batching window
    this.maxBatchSize = 10;
  }

  // Batch multiple service health checks into single requests
  batchHealthCheck(serviceName, resolve, reject) {
    const batchKey = 'health-check';
    
    if (!this.batches.has(batchKey)) {
      this.batches.set(batchKey, {
        services: new Set(),
        promises: []
      });
      
      // Process batch after timeout
      setTimeout(() => this.processBatch(batchKey), this.batchTimeout);
    }
    
    const batch = this.batches.get(batchKey);
    batch.services.add(serviceName);
    batch.promises.push({ serviceName, resolve, reject });
    
    // Process immediately if batch is full
    if (batch.services.size >= this.maxBatchSize) {
      this.processBatch(batchKey);
    }
  }

  async processBatch(batchKey) {
    const batch = this.batches.get(batchKey);
    if (!batch) return;
    
    this.batches.delete(batchKey);
    
    try {
      // Make single request for all services
      const services = Array.from(batch.services);
      const response = await fetch('/api/services/health-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services })
      });
      
      const results = await response.json();
      
      // Resolve individual promises
      batch.promises.forEach(({ serviceName, resolve }) => {
        resolve(results[serviceName] || { status: 'offline' });
      });
      
    } catch (error) {
      // Reject all promises on error
      batch.promises.forEach(({ reject }) => {
        reject(error);
      });
    }
  }
}

// Background sync for offline capability
class BackgroundSync {
  constructor() {
    this.queue = [];
    this.isOnline = navigator.onLine;
    this.setupEventListeners();
  }

  setupEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  // Queue requests when offline
  queueRequest(url, options) {
    return new Promise((resolve, reject) => {
      if (this.isOnline) {
        // Make request immediately if online
        fetch(url, options).then(resolve).catch(reject);
      } else {
        // Queue for later if offline
        this.queue.push({ url, options, resolve, reject });
        console.log('📱 Request queued for background sync:', url);
      }
    });
  }

  async processQueue() {
    console.log(`📱 Processing ${this.queue.length} queued requests`);
    
    while (this.queue.length > 0 && this.isOnline) {
      const { url, options, resolve, reject } = this.queue.shift();
      
      try {
        const response = await fetch(url, options);
        resolve(response);
      } catch (error) {
        reject(error);
      }
    }
  }
}

export const requestBatcher = new RequestBatcher();
export const backgroundSync = new BackgroundSync();