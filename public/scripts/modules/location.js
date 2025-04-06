
import CONFIG from '../config.js';

async function obtenerDireccion(lat, lng) {
    return new Promise((resolve) => {
        const latLng = { lat: parseFloat(lat), lng: parseFloat(lng) };
        window.geocoder.geocode({ location: latLng }, (results, status) => {
            if (status === "OK" && results[0]) {
                resolve(results[0].formatted_address);
            } else {
                console.error("❌ Error obteniendo dirección:", status);
                resolve("Dirección desconocida");
            }
        });
    });
}

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
                const timestamp = new Date(position.timestamp).toISOString();
                console.log("📌 Ubicación obtenida:", { latitude, longitude, timestamp });

                try {
                    let direccion = window.primeraVez ? await obtenerDireccion(latitude, longitude) : null;
                    const response = await fetch(`${CONFIG.SERVER_URL}/actualizar-ubicacion-bus`, {
                        method: 'POST',
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            lat: latitude,
                            lng: longitude,
                            direccion,
                            ultimaParada: window.primeraVez ? window.ultimaParada : null // Solo en la primera vez
                        })
                    });

                    if (!response.ok) throw new Error(`Error: ${response.status}`);
                    const result = await response.json();
                    console.log("📡 Respuesta del servidor:", result);

                    actualizarMarcadorBus({ lat: latitude, lng: longitude }); // Actualizar marcador inmediatamente

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

async function dibujarUbicacionBus() {
    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/messages`);
        if (!response.ok) throw new Error("Error obteniendo datos de /messages");

        const data = await response.json();
        if (!Array.isArray(data.bus) || data.bus.length === 0) {
            console.warn("🚫 No hay datos de ubicación del bus.");
            return;
        }

        const ultimaUbicacion = data.bus[data.bus.length - 1].direccion;
        if (!ultimaUbicacion || !ultimaUbicacion.lat || !ultimaUbicacion.lng) {
            console.warn("⚠️ No se encontró una ubicación válida para el bus:", data);
            return;
        }

        actualizarMarcadorBus(ultimaUbicacion);
    } catch (error) {
        console.error("❌ Error obteniendo la ubicación del bus:", error);
    }
}


function actualizarMarcadorBus(ubicacion) {
    if (window.ultimaUbicacionBus &&
        ubicacion.lat === window.ultimaUbicacionBus.lat &&
        ubicacion.lng === window.ultimaUbicacionBus.lng) {
        console.log("🔄 La ubicación del bus no ha cambiado.");
        return;
    }

    if (window.marcadorBus) window.marcadorBus.setMap(null);

    window.marcadorBus = new google.maps.marker.AdvancedMarkerElement({
        position: new google.maps.LatLng(ubicacion.lat, ubicacion.lng),
        map: window.map,
        title: "Ubicación actual del Bus",
        content: document.createElement("img")
    });

    window.marcadorBus.content.src = "media/iconobus.svg";
    window.marcadorBus.content.style.width = "40px";
    window.marcadorBus.content.style.height = "40px";
    window.ultimaUbicacionBus = ubicacion;

    console.log("✅ Marcador del bus actualizado:", ubicacion);
}

export { obtenerDireccion, gestionarUbicacion, dibujarUbicacionBus, actualizarMarcadorBus };