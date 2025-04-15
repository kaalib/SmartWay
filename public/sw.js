// /sw-cloud.js
const CACHE_NAME = 'smartway-app-v3';
const urlsToCache = [
    '/index.html',
    '/map.html',
    '/login.html',
    '/historial.html',
    '/styles/comun.css',
    '/styles/historial.css',
    '/styles/index.css',
    '/styles/login.css',
    '/styles/map.css',
    '/styles/seguridad.css',
    '/styles/sidebar.css',
    '/styles/sweetalert-custom.css',
    '/media/favicon.svg',
    '/media/iconobus.svg',
    '/media/technology.png',
    '/media/benefits.png',
    '/media/carlos.png',
    '/media/samy.png'
];

self.addEventListener('install', (event) => {
    console.log('Service Worker instalado');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Cacheando recursos:', urlsToCache);
            const cachePromises = urlsToCache.map((url) => {
                return fetch(url).then((response) => {
                    if (!response.ok) {
                        console.warn(`No se pudo cachear ${url}: ${response.statusText}`);
                        return;
                    }
                    return cache.put(url, response);
                }).catch((error) => {
                    console.warn(`Error al cachear ${url}:`, error);
                });
            });
            return Promise.all(cachePromises);
        }).catch((error) => {
            console.error('Error general al cachear recursos:', error);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activado');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Eliminando caché antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) {
                return response;
            }
            return fetch(event.request).catch((error) => {
                console.log('Fallo de red, sirviendo desde caché:', event.request.url);
                self.clients.matchAll().then((clients) => {
                    clients.forEach((client) => {
                        client.postMessage({
                            type: 'NETWORK_ERROR',
                            message: 'No hay conexión a internet.'
                        });
                    });
                });
                return caches.match('/index.html');
            });
        })
    );
});