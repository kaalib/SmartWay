// scripts/modules/navigation.js
import CONFIG from '../config.js';

async function obtenerRutaSeleccionada() {
    try {
        console.log("📡 Obteniendo ruta seleccionada del servidor...");
        const response = await fetch(`${CONFIG.SERVER_URL}/messages`);
        if (!response.ok) throw new Error(`Error al obtener ruta seleccionada: ${response.status}`);
        const data = await response.json();

        if (data.rutaseleccionada && Array.isArray(data.rutaseleccionada)) {
            console.log("✅ Ruta seleccionada obtenida:", data.rutaseleccionada);
            return data.rutaseleccionada;
        } else {
            throw new Error("No se encontró rutaseleccionada en la respuesta del servidor");
        }
    } catch (error) {
        console.error("❌ Error al obtener ruta seleccionada:", error);
        return null;
    }
}

async function generarEnlaceNavegacion() {
    const rutaSeleccionada = await obtenerRutaSeleccionada();

    // Asegurarse de que rutaSeleccionada sea un array y tenga al menos 2 puntos (origen y destino)
    if (!Array.isArray(rutaSeleccionada) || rutaSeleccionada.length < 2) {
        console.error("❌ Ruta seleccionada no válida o insuficiente para navegación");
        return null;
    }

    const geocoder = new google.maps.Geocoder();
    const coords = [];

    // Geocodificar cada dirección
    for (const punto of rutaSeleccionada) {
        const direccion = punto.direccion;
        try {
            const result = await new Promise((resolve, reject) => {
                geocoder.geocode({ address: typeof direccion === 'string' ? direccion : `${direccion.lat},${direccion.lng}` }, (results, status) => {
                    if (status === 'OK') {
                        const location = results[0].geometry.location;
                        resolve(`${location.lat()},${location.lng()}`);
                    } else {
                        reject(new Error(`Error geocodificando ${direccion}: ${status}`));
                    }
                });
            });
            coords.push(result);
        } catch (error) {
            console.error(`⚠️ ${error.message}`);
            // Fallback: usar coordenadas originales si ya están en formato lat,lng
            coords.push(typeof direccion === 'string' ? direccion : `${direccion.lat},${direccion.lng}`);
        }
    }

    // Construir la URL de Google Maps
    const origin = coords[0]; // Primer punto como origen
    const destination = coords[coords.length - 1]; // Último punto como destino
    const waypoints = coords.slice(1, -1).join('|'); // Puntos intermedios

    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}&travelmode=driving`;
    return url;
}

async function iniciarNavegacionConductor() {
    const url = await generarEnlaceNavegacion();
    if (url) {
        window.location.href = url; // Redirige directamente a la URL
        console.log("🚗 Navegación iniciada con URL:", url);
        localStorage.setItem('navegacionActiva', 'true');
        document.getElementById('btnNavegacion').classList.add('btn-enabled');
        document.getElementById('btnNavegacion').classList.remove('btn-disabled');
    } else {
        console.error("❌ No se pudo generar el enlace de navegación");
    }
}

function detenerNavegacionConductor() {
    localStorage.setItem('navegacionActiva', 'false');
    document.getElementById('btnNavegacion').classList.add('btn-disabled');
    document.getElementById('btnNavegacion').classList.remove('btn-enabled');
    console.log("🚫 Navegación detenida");
    // Volver a la página principal (opcional, ajusta según tu lógica)
    window.location.href = window.location.origin + '/map.html'; // Redirige a la página inicial
}

export { iniciarNavegacionConductor, detenerNavegacionConductor, generarEnlaceNavegacion };