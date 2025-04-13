// /public/scripts/modules/location.js
import CONFIG from '../config.js';

let watchId = null;

async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn("⚠️ Permiso de notificaciones denegado");
            return false;
        }
    }
    return true;
}

// Mostrar una notificación persistente para mantener la app activa
async function showTrackingNotification() {
    if ('Notification' in window && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification('Rastreo de ubicación activo', {
            body: 'SmartWay está rastreando tu ubicación en tiempo real.',
            icon: '/media/favicon.svg', // Ajustado para la ruta relativa
            tag: 'location-tracking', // Evita duplicados
            renotify: false, // No vibrar/notificar si ya existe
            ongoing: true // Mantiene la notificación visible (en Android)
        });
        console.log("📢 Notificación de rastreo mostrada");
    } else {
        console.warn("⚠️ Notificaciones o Service Worker no soportados");
    }
}

// Cerrar la notificación cuando se detenga el rastreo
async function closeTrackingNotification() {
    if ('Notification' in window && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        registration.getNotifications({ tag: 'location-tracking' }).then(notifications => {
            notifications.forEach(notification => notification.close());
            console.log("🔔 Notificación de rastreo cerrada");
        });
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
                latitude = Number(latitude.toFixed(5));
                longitude = Number(longitude.toFixed(5));
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