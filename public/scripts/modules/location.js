// scripts/modules/location.js
import CONFIG from '../config.js';

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

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                window.ultimaUbicacionBus = { lat: latitude, lng: longitude };

                try {
                    const isPrimeraVez = primeraVezOverride !== null ? primeraVezOverride : window.primeraVez;
                    const payload = {
                        lat: latitude,
                        lng: longitude,
                        direccion: isPrimeraVez ? { lat: latitude, lng: longitude } : null,
                        ultimaParada: isPrimeraVez ? window.ultimaParada : null
                    };
                    console.log("📍 Enviando a /actualizar-ubicacion-bus:", payload);

                    const response = await fetch(`${CONFIG.SERVER_URL}/actualizar-ubicacion-bus`, {
                        method: 'POST',
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) throw new Error(`Error: ${response.status}`);
                    if (isPrimeraVez) window.primeraVez = false;
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
            }
        );
    });
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

export { gestionarUbicacion, actualizarMarcadorBus };