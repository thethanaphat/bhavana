/* App shell, bundled prayer text, and short bells are cached. Long audio is on demand. */
const CACHE_NAME = 'bhavana-shell-v1';
const SCOPE = self.registration.scope;
const INDEX_URL = new URL('index.html', SCOPE).href;
const BELL_URLS = ['audio/bells/start.m4a', 'audio/bells/interval.m4a', 'audio/bells/end.m4a']
  .map((path) => new URL(path, SCOPE).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch(new Request(INDEX_URL, { cache: 'reload' }));
    if (!response.ok) throw new Error('Unable to cache app shell');
    const html = await response.clone().text();
    const cache = await caches.open(CACHE_NAME);
    await cache.put(INDEX_URL, response.clone());
    await cache.put(SCOPE, response.clone());

    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], INDEX_URL))
      .filter((url) => url.origin === self.location.origin)
      .map((url) => url.href);
    await cache.addAll([...new Set([...assets, ...BELL_URLS])]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // แอปนี้เป็นเจ้าของ origin ทั้งหมด จึงลบแคชชุดอื่นได้ทุกชุด
    // รวมถึงชุดที่ตั้งชื่อด้วยชื่อโปรเจกต์เดิมก่อนเปลี่ยนมาเป็น bhavana
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(INDEX_URL, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(INDEX_URL)) || Response.error();
      }
    })());
    return;
  }

  if (BELL_URLS.includes(url.href)) {
    event.respondWith((async () => {
      const cached = await caches.match(url.href);
      if (!cached) return fetch(request);
      const range = request.headers.get('range');
      if (!range) return cached;
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) return fetch(request);
      const bytes = await cached.arrayBuffer();
      const total = bytes.byteLength;
      const suffixLength = match[1] === '' ? Number(match[2]) : null;
      const start = suffixLength === null ? Number(match[1]) : Math.max(0, total - suffixLength);
      const end = suffixLength === null && match[2] !== '' ? Math.min(total - 1, Number(match[2])) : total - 1;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= total) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
      }
      const headers = new Headers(cached.headers);
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(bytes.slice(start, end + 1), { status: 206, headers });
    })());
    return;
  }
  if (url.pathname.includes('/audio/')) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && (url.pathname.includes('/assets/') || url.pathname.includes('/icons/') || url.pathname.endsWith('/manifest.webmanifest'))) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
