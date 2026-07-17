const CACHE = 'luna-recovery-v3-sleep';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './assets/icons/house.svg',
  './assets/icons/check-square.svg',
  './assets/icons/hourglass-medium.svg',
  './assets/icons/calendar-dots.svg',
  './assets/icons/pill.svg',
  './assets/icons/person-arms-spread.svg',
  './assets/icons/chart-bar.svg',
  './assets/icons/gear.svg',
  './assets/icons/bell.svg',
  './assets/icons/plus.svg',
  './assets/icons/moon.svg',
  './assets/icons/sun.svg',
  './assets/images/moon-lake.jpg',
  './assets/images/star-nebula.webp',
  './assets/images/milky-way.webp',
  './assets/images/celestial-collage.webp',
  './assets/images/watercolor-stars.jpg'
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
