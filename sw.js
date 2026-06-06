// ============================================================
// Service Worker – Boca de Urna Santaní
// Estrategia: Network-First para datos dinámicos / Firebase,
//             Cache-First para assets estáticos externos.
// ============================================================

const CACHE_NAME = 'santani-elecciones-v4';

// Assets que se pre-cachean al instalar (solo estáticos locales + CDN confiable)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0/dist/chartjs-plugin-datalabels.min.js'
];

// Dominios que SIEMPRE van directo a la red (Firebase, datos en vivo)
const NETWORK_ONLY_PATTERNS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseio.com',
  'googleapis.com',
  'gstatic.com/firebasejs',
];

// Dominios de assets estáticos para cache-first
const CACHE_FIRST_PATTERNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
];

// ---- INSTALL: pre-cachear assets ----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // addAll falla si uno solo falla — lo hacemos tolerante a errores
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Pre-cache falló para:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ---- ACTIVATE: limpiar cachés viejos ----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Eliminando caché viejo:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ---- FETCH: estrategia por tipo de recurso ----
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const method = event.request.method;

  // Solo interceptar GET
  if (method !== 'GET') return;

  // 1. Extensiones de Chrome u otros schemas no-http: ignorar
  if (!url.startsWith('http')) return;

  // 2. CSV de datos electorales: siempre de la red, sin caché
  if (url.includes('.csv')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response('[]', { headers: { 'Content-Type': 'text/csv' } })
      )
    );
    return;
  }

  // 3. Firebase / Google APIs: NETWORK ONLY — jamás cachear datos dinámicos
  if (NETWORK_ONLY_PATTERNS.some(p => url.includes(p))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 4. CDN assets estáticos (fuentes, íconos, librerías): CACHE FIRST
  //    Si falla la red pero hay caché, usar caché. Si no hay caché, ir a red.
  if (CACHE_FIRST_PATTERNS.some(p => url.includes(p))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached); // si falla red y no hay caché, devolver null (mejor que colgar)
      })
    );
    return;
  }

  // 5. Assets locales (index.html, app.js, style.css): NETWORK FIRST con fallback a caché
  //    Esto garantiza que el admin siempre vea la versión más reciente,
  //    pero si no hay red, la app sigue funcionando desde caché.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Actualizar caché con la versión nueva en background
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Sin red: servir desde caché
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback final para navegación: index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Sin conexión', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
