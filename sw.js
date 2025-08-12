importScripts('sw_config.js');
importScripts('sw_cache_config.js');

self.addEventListener('install', (event) => {
  console.log(`SW:install:${CACHE_NAME}`);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SW_CACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log(`SW:activate:${CACHE_NAME}`);
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME && key.includes('pos-cache')) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});


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

  console.log(`SW:fetch:${CACHE_NAME}`);
  console.log(`SW:fetch:${url}`);

  if (
    url.pathname.includes('index.html') ||
    url.pathname === '/'
  ) {
    return;
  }

  if (SW_DYNAMIC_WASM_CACHE) {
    if (url.pathname.includes('.wasm')) {
      event.respondWith(cacheFirst(request));
      return;
    }
  }

  if (url.pathname.includes(RESOURCES_PATH_PART)) {
    const newUrl = request.url + RESOURCES_VERSION_QUERY;
    const newRequest = new Request(newUrl, request);
    event.respondWith(cacheFirst(newRequest));
    return;
  }

  if (
    url.pathname.includes('index.html') ||
    url.pathname.includes('sw_config.js') ||
    url.pathname.includes('sw_cache_config.js') ||
    url.pathname === '/'
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (SW_CACHE_URLS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  return;
});
