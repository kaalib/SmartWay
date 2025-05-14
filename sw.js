// /public/sw.js
const CACHE_NAME = 'smartway-app-v4';
const urlsToCache = [
    //'/public/index.html',
    //'/public/map.html',
    '/public/login.html',
    //'/public/historial.html',
    '/public/styles/comun.css',
    '/public/styles/historial.css',
    '/public/styles/index.css',
    '/public/styles/login.css',
    '/public/styles/map.css',
    '/public/styles/seguridad.css',
    '/public/styles/sidebar.css',
    '/public/styles/sweetalert-custom.css',
    '/public/media/favicon.svg',
    '/public/media/iconobus.svg',
    '/public/media/technology.png',
    '/public/media/benefits.png',
    '/public/media/carlos.png',
    '/public/media/samy.png'
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
                return caches.match('/public/index.html');
            });
        })
    );
});