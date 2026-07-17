const CACHE = 'luna-recovery-v4-flat';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './house.svg',
  './check-square.svg',
  './hourglass-medium.svg',
  './calendar-dots.svg',
  './pill.svg',
  './person-arms-spread.svg',
  './chart-bar.svg',
  './gear.svg',
  './bell.svg',
  './plus.svg',
  './moon.svg',
  './sun.svg',
  './moon-lake.jpg',
  './star-nebula.webp',
  './milky-way.webp',
  './celestial-collage.webp',
  './watercolor-stars.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const clone = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, clone));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
