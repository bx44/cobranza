/* Service worker — Cobranza Or Barak
 *
 * Cachea el armazón de la app para que abra sin señal.
 * Las llamadas a la API NUNCA se cachean: un saldo viejo
 * es peor que ningún saldo.
 */
const CACHE = 'cobranza-v1';
const ARCHIVOS = ['./', './index.html', './app.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.indexOf('script.google.com') >= 0) return;   // API: siempre en vivo
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      if (resp.ok && url.origin === location.origin) {
        const copia = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
      }
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
