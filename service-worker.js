// service-worker.js
const CACHE_NAME = 'sleepsync-v1.2.0';
const STATIC_CACHE = 'sleepsync-static-v1.1.0';
const DYNAMIC_CACHE = 'sleepsync-dynamic-v1.0.0';

// Assets to cache immediately on install
const STATIC_ASSETS = [
  './',
  './sleep.html',
  './manifest.json',
  // Add paths to any other static assets like CSS, JS, images
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('Service Worker: Install completed');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Installation failed', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activated');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME && cache !== STATIC_CACHE && cache !== DYNAMIC_CACHE) {
            console.log('Service Worker: Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Handle API requests differently
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful API responses
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE)
              .then((cache) => {
                cache.put(event.request, responseClone);
              });
          }
          return response;
        })
        .catch(() => {
          // Return cached version if available
          return caches.match(event.request);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then((fetchResponse) => {
            // Don't cache non-GET requests or invalid responses
            if (event.request.method !== 'GET' || !fetchResponse || fetchResponse.status !== 200) {
              return fetchResponse;
            }

            // Cache the new response
            const responseToCache = fetchResponse.clone();
            caches.open(DYNAMIC_CACHE)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return fetchResponse;
          })
          .catch((error) => {
            console.error('Service Worker: Fetch failed', error);
            // Return offline page or fallback for HTML requests
            if (event.request.destination === 'document') {
              return caches.match('./sleep.html');
            }
          });
      })
  );
});

// Background sync for sleep data
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sleep-sync') {
    console.log('Service Worker: Background sync for sleep data');
    event.waitUntil(doBackgroundSync());
  }
});

// Push notifications for sleep reminders
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Time to optimize your sleep!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || './sleep.html'
    },
    actions: [
      {
        action: 'start-sleep',
        title: 'Start Sleep Session',
        icon: '/icons/sleep-icon.png'
      },
      {
        action: 'snooze',
        title: 'Snooze 10min',
        icon: '/icons/snooze-icon.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'SleepSync', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'start-sleep') {
    // Start sleep session
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((windowClients) => {
        if (windowClients.length > 0) {
          windowClients[0].focus();
          windowClients[0].postMessage({
            type: 'START_SLEEP_SESSION',
            timestamp: Date.now()
          });
        } else {
          clients.openWindow('./sleep.html');
        }
      })
    );
  } else if (event.action === 'snooze') {
    // Schedule reminder for 10 minutes later
    event.waitUntil(
      self.registration.showNotification('SleepSync', {
        body: 'Sleep reminder snoozed for 10 minutes',
        icon: '/icons/icon-192x192.png',
        tag: 'snooze-reminder'
      })
    );
  } else {
    // Default behavior - open app
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((windowClients) => {
        if (windowClients.length > 0) {
          windowClients[0].focus();
        } else {
          clients.openWindow('./sleep.html');
        }
      })
    );
  }
});

// Background sync function
async function doBackgroundSync() {
  try {
    // Sync sleep data with server if needed
    const sleepData = await getStoredSleepData();
    if (sleepData && sleepData.length > 0) {
      await syncWithServer(sleepData);
      console.log('Service Worker: Sleep data synced successfully');
    }
  } catch (error) {
    console.error('Service Worker: Background sync failed', error);
  }
}

// Helper functions
async function getStoredSleepData() {
  // Get sleep data from IndexedDB or localStorage
  return new Promise((resolve) => {
    if ('indexedDB' in self) {
      // Implementation for IndexedDB
      const request = indexedDB.open('SleepSyncDB', 1);
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['sleepData'], 'readonly');
        const store = transaction.objectStore('sleepData');
        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = () => resolve(getAllRequest.result);
        getAllRequest.onerror = () => resolve(null);
      };
      request.onerror = () => resolve(null);
    } else {
      // Fallback to localStorage
      const data = localStorage.getItem('sleepSyncData');
      resolve(data ? JSON.parse(data) : null);
    }
  });
}

async function syncWithServer(sleepData) {
  // Implement server sync logic
  try {
    const response = await fetch('/api/sleep-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sleepData })
    });

    if (response.ok) {
      // Clear local data after successful sync
      await clearStoredSleepData();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Sync failed:', error);
    return false;
  }
}

async function clearStoredSleepData() {
  // Clear synced sleep data
  return new Promise((resolve) => {
    if ('indexedDB' in self) {
      const request = indexedDB.open('SleepSyncDB', 1);
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['sleepData'], 'readwrite');
        const store = transaction.objectStore('sleepData');
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve(true);
        clearRequest.onerror = () => resolve(false);
      };
    } else {
      localStorage.removeItem('sleepSyncData');
      resolve(true);
    }
  });
}

// Periodic sync for sleep analytics
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sleep-analytics-sync') {
    console.log('Service Worker: Periodic sync for analytics');
    event.waitUntil(syncAnalyticsData());
  }
});

async function syncAnalyticsData() {
  // Sync analytics and statistics data
  try {
    // Implementation for analytics sync
    console.log('Service Worker: Analytics data synced');
  } catch (error) {
    console.error('Service Worker: Analytics sync failed', error);
  }
}
