// scripts/modules/location.js
import CONFIG from '../config.js';

let watchId = null; // Almacena el ID de watchPosition

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

        // Detener cualquier watchPosition existente
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }

        // Iniciar watchPosition
        watchId = navigator.geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                const ubicacion = { lat: latitude, lng: longitude };

                // Evitar enviar la misma ubicación
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
                enableHighAccuracy: true, // Alta precisión para el conductor
                timeout: 5000, // 5 segundos máximo por intento
                maximumAge: 0 // No usar caché
            }
        );
    });
}

async function detenerUbicacion() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        console.log("🛑 Seguimiento de ubicación detenido");
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
        window.marcadorBus.position = ubicacion; // Ya es LatLng
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