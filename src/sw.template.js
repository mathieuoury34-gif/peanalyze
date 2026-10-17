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
    // la page est servie tout de suite depuis le cache (démarrage instantané) et mise à jour en arrière-plan
    e.respondWith(caches.match('./').then((hit) => {
      const net = fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put('./', copy)); } return r; });
      if (hit) { e.waitUntil(net.catch(() => undefined)); return hit; }
      return net;
    }));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});

// Rappel mensuel « investir » : la config est recopiée par l'app dans le cache « pea-config ».
// Notification en tâche de fond là où le navigateur le permet (synchronisation périodique) ; sinon l'app notifie à son ouverture.
async function remind() {
  const cache = await caches.open('pea-config');
  const hit = await cache.match('./reminder.json');
  if (!hit) return;
  const cfg = await hit.json();
  if (!cfg.day) return;
  const now = new Date();
  const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  if (now.getDate() < cfg.day || cfg.boughtMonth === ym || cfg.notifiedMonth === ym) return;
  await self.registration.showNotification(cfg.title, { body: cfg.body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'pea-reminder', data: { url: cfg.url } });
  cfg.notifiedMonth = ym;
  await cache.put('./reminder.json', new Response(JSON.stringify(cfg), { headers: { 'content-type': 'application/json' } }));
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'pea-reminder') e.waitUntil(remind()); });
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) { c.focus(); if ('navigate' in c) c.navigate(url); return; }
    return self.clients.openWindow(url);
  }));
});
