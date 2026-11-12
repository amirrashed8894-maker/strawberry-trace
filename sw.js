const C = 'strawberry-trace-v1.1.2';
const F = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './api.js',
  './ocr.js',
  './labels.js',
  './app.js',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './fonts/cairo-arabic.woff2',
  './fonts/cairo-latin.woff2',
  './fonts/cairo-latin-ext.woff2',
  './vendor/supabase.min.js',
  './vendor/jspdf.umd.min.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(F.map(u => new Request(u, {cache: 'reload'})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(k => Promise.all(k.filter(x => x.startsWith('strawberry-trace-') && x !== C).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const q = e.request;
  if (q.method !== 'GET') return;
  const url = new URL(q.url);
  if (url.origin !== location.origin) return;
  if (q.mode === 'navigate') {
    e.respondWith(
      fetch(q).then(r => {
        if (r.ok) return r;
        return caches.match('./index.html');
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(q, {ignoreSearch: true}).then(r => r || fetch(q).then(x => {
      if (x.ok) {
        const cp = x.clone();
        caches.open(C).then(c => c.put(q, cp));
      }
      return x;
    }))
  );
});
