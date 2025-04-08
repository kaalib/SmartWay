// scripts/modules/location.js
import CONFIG from '../config.js';
import { setupSocket } from './socket.js';

const socket = setupSocket();

async function gestionarUbicacion() {
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
                    console.log("📍 Enviando a /actualizar-ubicacion-bus:", {
                        lat: latitude,
                        lng: longitude,
                        direccion: window.primeraVez ? { lat: latitude, lng: longitude } : null,
                        ultimaParada: window.primeraVez ? window.ultimaParada : null
                    });
                    
                    const response = await fetch(`${CONFIG.SERVER_URL}/actualizar-ubicacion-bus`, {
                        method: 'POST',
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            lat: latitude,
                            lng: longitude,
                            direccion: window.primeraVez ? { lat: latitude, lng: longitude } : null,
                            ultimaParada: window.primeraVez ? window.ultimaParada : null
                        })
                    });

                    if (!response.ok) throw new Error(`Error: ${response.status}`);
                    if (window.primeraVez) window.primeraVez = false;
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

    // Crear el ícono SVG como PinElement
    const pinSvg = new google.maps.marker.PinElement({
        glyph: "", // Sin texto dentro del pin
        scale: 1.5,
        background: "transparent",
        borderColor: "transparent"
    });

    // Cargar el SVG como contenido personalizado
    const svgImg = document.createElement("img");
    svgImg.src = "/media/iconobus.svg"; // Usa ruta absoluta desde la raíz del servidor
    svgImg.style.width = "40px";
    svgImg.style.height = "40px";

    if (window.marcadorBus) {
        window.marcadorBus.position = new google.maps.LatLng(ubicacion.lat, ubicacion.lng);
    } else {
        window.marcadorBus = new google.maps.marker.AdvancedMarkerElement({
            position: new google.maps.LatLng(ubicacion.lat, ubicacion.lng),
            map: window.map,
            title: "Ubicación actual del Bus",
            content: svgImg // Asignar directamente el SVG
        });
    }

    window.ultimaUbicacionBus = ubicacion;
    console.log("✅ Marcador del bus actualizado:", ubicacion);
}

export { gestionarUbicacion, actualizarMarcadorBus };