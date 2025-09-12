// Service Worker for offline caching and background sync
const CACHE_NAME = 'watchman-v1';
const STATIC_CACHE = 'watchman-static-v1';
const API_CACHE = 'watchman-api-v1';

// Files to cache for offline use
const STATIC_FILES = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/index.css'
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/services/health',
  '/api/adguard/status',
  '/api/bitcoin/status',
  '/api/tor/health'
];

self.addEventListener('install', (event) => {
  console.log('📦 Service Worker installing...');
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_FILES)),
      caches.open(API_CACHE)
    ]).then(() => {
      console.log('✅ Service Worker installed');
      self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== STATIC_CACHE && cacheName !== API_CACHE) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker activated');
      self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
  }
  // Handle static files
  else {
    event.respondWith(handleStaticRequest(request));
  }
});

async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE);
  
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('🔌 Network failed, trying cache:', request.url);
    
    // Fallback to cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      try {
        // Try to parse as JSON and add offline indicators
        const response = cachedResponse.clone();
        const data = await response.json();
        data._offline = true;
        data._cacheTime = new Date().toISOString();
        
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (jsonError) {
        // If cached response isn't JSON, return it as-is
        console.log('⚠️ Cached response is not JSON, returning as-is:', request.url);
        return cachedResponse;
      }
    }
    
    // Return offline response
    return new Response(JSON.stringify({
      status: 'offline',
      error: 'No network connection',
      _offline: true
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleStaticRequest(request) {
  const cache = await caches.open(STATIC_CACHE);
  
  // Try cache first for static files
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Fallback to network
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Return offline page or cached version
    return cache.match('/') || new Response('Offline', { status: 503 });
  }
}

// Background sync for queued requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  console.log('🔄 Running background sync...');
  
  // Process any queued requests from IndexedDB
  try {
    const db = await openDB();
    const queue = await getQueuedRequests(db);
    
    for (const request of queue) {
      try {
        await fetch(request.url, request.options);
        await removeFromQueue(db, request.id);
        console.log('✅ Synced request:', request.url);
      } catch (error) {
        console.log('❌ Failed to sync request:', request.url);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// IndexedDB helpers for queue management
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('WatchmanQueue', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('requests')) {
        db.createObjectStore('requests', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function getQueuedRequests(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['requests'], 'readonly');
    const store = transaction.objectStore('requests');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function removeFromQueue(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['requests'], 'readwrite');
    const store = transaction.objectStore('requests');
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}