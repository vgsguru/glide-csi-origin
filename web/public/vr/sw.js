/**
 * Glide VR — service worker.
 *
 * Installability needs one, and it earns its place: three.js is 1.3 MB, and
 * re-downloading it every launch is a visible stall in a headset. The shell is
 * cached; ledger reads and model calls always go to the network, because stale
 * financial figures are worse than a spinner.
 */

const CACHE = 'glide-vr-v2';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './panel.js',
  './data.js',
  './agent.js',
  './voice.js',
  './theme.js',
  './config.js',
  './vendor/three.module.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never cache identity, Firestore or model traffic.
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== 'GET') return;

  // The vendored three.js build never changes, so serve it from cache.
  const immutable = url.pathname.includes('/vendor/');

  if (immutable) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        if (res.ok) { const c = res.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); }
        return res;
      }))
    );
    return;
  }

  // Everything else is network-first. Cache-first meant that the first launch
  // after a deploy ran the previous version of the app, which is a miserable
  // way to ship a fix -- the cache is a plane-mode fallback, not the source.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const c = res.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
