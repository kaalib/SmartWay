// Gestión de ubicación
import CONFIG from '../config.js';
import { actualizarMarcadorBus } from './map-markers.js';
import { socket } from './socket.js';


// Geocodificar dirección
export function geocodificarDireccion(direccion) {
    return new Promise((resolve) => {
        if (!direccion) return resolve(null);
        window.geocoder.geocode({ address: direccion }, (results, status) => {
            if (status === "OK" && results[0]) {
                resolve(results[0].geometry.location);
            } else {
                console.warn(`⚠️ No se pudo geocodificar: ${direccion}`);
                resolve(null);
            }
        });
    });
}

// Obtener dirección a partir de lat/lng
export async function obtenerDireccion(lat, lng) {
    return new Promise((resolve, reject) => {
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

// Gestionar ubicación y enviarla al servidor
export async function gestionarUbicacion() {
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
                    let direccion = null;

                    // Solo la primera vez convertimos la lat/lng a dirección
                    if (window.primeraVez) {
                        direccion = await obtenerDireccion(latitude, longitude);
                        console.log("📍 Dirección obtenida:", direccion);
                    }

                    // Enviar datos al servidor
                    const response = await fetch(`${CONFIG.API_URL}/actualizar-ubicacion-bus`, {
                        method: 'POST',
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            lat: latitude,
                            lng: longitude,
                            direccion: direccion // Solo la primera vez tiene valor
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`Error en la respuesta del servidor: ${response.status}`);
                    }

                    const result = await response.json();
                    console.log("📡 Respuesta del servidor:", result);

                    // Marcar que ya se envió la dirección
                    if (window.primeraVez) {
                        window.primeraVez = false;
                    }

                    resolve(); // Resuelve la promesa cuando todo ha terminado correctamente
                } catch (error) {
                    console.error("❌ Error enviando ubicación al servidor:", error);
                    reject(error);
                }
            },
            (error) => {
                console.error("❌ Error obteniendo ubicación:", error);
                if (error.code === error.PERMISSION_DENIED) {
                    Swal.fire({
                        icon: "warning",
                        title: "Permiso de ubicación denegado",
                        text: "Activa la ubicación para actualizar la ruta en tiempo real."
                    });
                }
                reject(error);
            }
        );
    });
}

// Agregar punto final al seleccionar ubicación
export async function agregarPuntoFinal(opcion) {
    try {
        // Si es la primera opción, ya se agregó la ubicación actual como primer elemento
        if (opcion === "1") {
            console.log("📍 Usando ubicación actual como punto final");
            return true;
        } 
        // Si es la segunda opción, agregar punto final personalizado
        else if (opcion === "2") {
            const response = await fetch(`${CONFIG.API_URL}/agregar-punto-final`, {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nombre: "punto final",
                    direccion: window.ultimaParada || "Punto final de ruta"
                })
            });

            if (!response.ok) {
                throw new Error(`Error al agregar punto final: ${response.status}`);
            }

            const result = await response.json();
            console.log("✅ Punto final agregado:", result);
            return true;
        }
        return false;
    } catch (error) {
        console.error("❌ Error al agregar punto final:", error);
        return false;
    }
}

// Dibujar ubicación del bus
export async function dibujarUbicacionBus() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/messages`);
        if (!response.ok) throw new Error("Error obteniendo datos de /messages");

        const data = await response.json();
        if (!Array.isArray(data.bus) || data.bus.length === 0) {
            console.warn("🚫 No hay datos de ubicación del bus.");
            return;
        }

        // Obtener la última ubicación
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