// /public/scripts/modules/location.js
import CONFIG from '../config.js';

let watchId = null;

async function requestNotificationPermission() {
    if ('Notification' in window) {
        console.log("🔔 Solicitando permisos de notificación...");
        if (Notification.permission === 'granted') {
            console.log("✅ Permisos ya otorgados");
            return true;
        }
        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log("✅ Permisos otorgados por el usuario");
                return true;
            } else {
                console.warn("⚠️ Permiso de notificaciones denegado por el usuario");
                return false;
            }
        } else {
            console.warn("⚠️ Permisos de notificación previamente denegados");
            return false;
        }
    } else {
        console.warn("⚠️ Notificaciones no soportadas en este navegador");
        return false;
    }
}

async function showTrackingNotification() {
    if ('Notification' in window && 'serviceWorker' in navigator) {
        try {
            const hasPermission = await requestNotificationPermission();
            if (!hasPermission) {
                console.warn("⚠️ No se pueden mostrar notificaciones sin permisos");
                return;
            }

            const registration = await navigator.serviceWorker.ready;
            if (!registration) {
                console.warn("⚠️ ServiceWorker no está listo");
                return;
            }

            await registration.showNotification('Rastreo de ubicación activo', {
                body: 'SmartWay está rastreando tu ubicación en tiempo real.',
                icon: '/media/favicon.svg',
                tag: 'location-tracking',
                renotify: false,
                ongoing: true
            });
            console.log("📢 Notificación de rastreo mostrada");
        } catch (error) {
            console.error("❌ Error al mostrar notificación:", error.message);
        }
    } else {
        console.warn("⚠️ Notificaciones o Service Worker no soportados");
    }
}

async function closeTrackingNotification() {
    if ('Notification' in window && 'serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.ready;
            const notifications = await registration.getNotifications({ tag: 'location-tracking' });
            notifications.forEach(notification => notification.close());
            console.log("🔔 Notificación de rastreo cerrada");
        } catch (error) {
            console.error("❌ Error al cerrar notificación:", error.message);
        }
    }
}

async function gestionarUbicacion(primeraVezOverride = null) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            Swal.fire({
                icon: "error",
                title: "Geolocalización no disponible",
                text: "Tu navegador no soporta la geolocalización."
            });
            return reject("Geolocalización no disponible");
        }

        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }

        watchId = navigator.geolocation.watchPosition(
            async (position) => {
                let { latitude, longitude } = position.coords;
                latitude = Number(latitude.toFixed(6));
                longitude = Number(longitude.toFixed(6));
                const ubicacion = { lat: latitude, lng: longitude };

                if (window.ultimaUbicacionBus &&
                    ubicacion.lat === window.ultimaUbicacionBus.lat &&
                    ubicacion.lng === window.ultimaUbicacionBus.lng) {
                    console.log("🔄 Ubicación sin cambios:", ubicacion);
                    resolve();
                    return;
                }

                window.ultimaUbicacionBus = ubicacion;
                console.log("📍 Nueva ubicación detectada:", ubicacion);

                try {
                    const isPrimeraVez = primeraVezOverride !== null ? primeraVezOverride : window.primeraVez;
                    const payload = {
                        lat: latitude,
                        lng: longitude,
                        direccion: isPrimeraVez ? { lat: latitude, lng: longitude } : null,
                        ultimaParada: isPrimeraVez ? window.ultimaParada : null
                    };
                    console.log("📡 Enviando a /actualizar-ubicacion-bus:", payload);

                    const response = await fetch(`${CONFIG.SERVER_URL}/actualizar-ubicacion-bus`, {
                        method: 'POST',
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) throw new Error(`Error: ${response.status}`);

                    if (isPrimeraVez) window.primeraVez = false;
                    console.log("✅ Ubicación enviada al servidor");

                    // Mostrar la notificación persistente
                    await showTrackingNotification();

                    resolve();
                } catch (error) {
                    console.error("❌ Error enviando ubicación:", error);
                    reject(error);
                }
            },
            (error) => {
                console.error("❌ Error obteniendo ubicación:", error);
                if (error.code === error.PERMISSION_DENIED) {
                    Swal.fire({
                        icon: "warning",
                        title: "Permiso denegado",
                        text: "Activa la ubicación para continuar."
                    });
                }
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    });
}

async function detenerUbicacion() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        console.log("🛑 Seguimiento de ubicación detenido");

        // Cerrar la notificación
        await closeTrackingNotification();
    }
}

async function actualizarMarcadorBus(ubicacion) {
    if (!window.map) {
        console.error("❌ El mapa no está inicializado en actualizarMarcadorBus");
        return;
    }

    console.log("🖌️ Intentando actualizar marcador del bus:", ubicacion);

    if (window.ultimaUbicacionBus &&
        ubicacion.lat === window.ultimaUbicacionBus.lat &&
        ubicacion.lng === window.ultimaUbicacionBus.lng) {
        console.log("🔄 La ubicación del bus no ha cambiado.");
        return;
    }

    const svgIcon = document.createElement("img");
    svgIcon.src = "/media/iconobus.svg";
    svgIcon.style.width = "40px";
    svgIcon.style.height = "40px";
    svgIcon.onerror = () => console.error("❌ Error cargando iconobus.svg");

    if (window.marcadorBus) {
        window.marcadorBus.position = ubicacion;
    } else {
        window.marcadorBus = new google.maps.marker.AdvancedMarkerElement({
            position: ubicacion,
            map: window.map,
            title: "Ubicación actual del Bus",
            content: svgIcon
        });
    }

    window.ultimaUbicacionBus = ubicacion;
    console.log("✅ Marcador del bus actualizado:", ubicacion);
}

export { gestionarUbicacion, detenerUbicacion, actualizarMarcadorBus };