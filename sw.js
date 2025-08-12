importScripts('sw_config.js');
importScripts('sw_cache_config.js');

self.addEventListener('install', (event) => {
  console.log(`SW:install:${CACHE_NAME}`);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const requests = SW_CACHE_URLS.map(url =>
        new Request(url, { cache: 'no-cache' })
      );
      return cache.addAll(requests);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log(`SW:activate:${CACHE_NAME}`);
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key.includes('pos-cache') && key !== CACHE_NAME) {
            console.log(`SW:deleting old cache: ${key}`);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

async function isVersionCompatible() {
  try {
    const stored = await caches.match(new Request('/sw_config.js'));
    if (!stored) return false;

    const storedText = await stored.text();
    const storedCacheName = storedText.match(/const CACHE_NAME = '([^']+)'/)?.[1];

    console.log(`SW:version check - stored: ${storedCacheName}, current: ${CACHE_NAME}`);

    return storedCacheName === CACHE_NAME;
  } catch (error) {
    console.log('SW:version check failed:', error);
    return false;
  }
}

async function criticalFileStrategy(request) {
  const url = new URL(request.url);
  console.log(`SW:critical file request: ${url.pathname}`);

  const compatible = await isVersionCompatible();

  if (!compatible) {
    console.log('SW:version incompatible, forcing network');

    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        console.warn('SW:serving potentially incompatible cached version due to network error');
        return cachedResponse;
      }
      throw error;
    }
  }

  return networkFirst(request);
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  const response = await fetch(request, { cache: 'no-store' });
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

//  console.log(`SW:fetch:${CACHE_NAME} - ${url.pathname}`);

  if (
    url.pathname.includes('index.html') ||
    url.pathname === '/'
  ) {
    event.respondWith(criticalFileStrategy(request));
    return;
  }

  if (
    url.pathname.includes('sw_config.js') ||
    url.pathname.includes('sw_cache_config.js')
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.includes(RESOURCES_PATH_PART)) {
    const newUrl = request.url + RESOURCES_VERSION_QUERY;
    const newRequest = new Request(newUrl, request);
    event.respondWith(cacheFirst(newRequest));
    return;
  }

  if (SW_CACHE_URLS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  return;
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('SW:skip waiting requested');
    self.skipWaiting();
  }
});
