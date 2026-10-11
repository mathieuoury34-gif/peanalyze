// Service worker de PEAnalyze : l'application fonctionne hors ligne.
const VERSION = '__VERSION__';
const SHELL = 'pea-shell-' + VERSION;
const RUNTIME = 'pea-runtime';
const FILES = __FILES__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pea-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // polices Google : en cache après le premier chargement
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com' || url.host === 'www.gstatic.com') {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return; // API de cours, Firebase : toujours en direct
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put('./', copy)); } return r; }).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && url.pathname.endsWith('template.xlsx')) { const copy = r.clone(); caches.open(RUNTIME).then((c) => c.put(req, copy)); }
    return r;
  })));
});
