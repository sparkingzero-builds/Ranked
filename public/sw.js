// Ranked service worker: network-first for pages, cache-first for built assets, so the app opens offline.
const CACHE = 'ranked-v2'
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'icon-192.png']))) })
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {  // always revalidate so a new deploy shows up straight away
     caches.open(CACHE).then(c => c.put('./', r.clone())); return r }).catch(() => caches.match('./')))
  } else if (url.pathname.includes('/assets/') || url.pathname.includes('/forms/')) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r })))
  }
})
