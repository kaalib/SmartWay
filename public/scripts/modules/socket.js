// scripts/modules/socket.js
import CONFIG from '../config.js';
import { actualizarMapa } from './map-markers.js';
import { actualizarMarcadorBus } from './location.js';
import { solicitarReorganizacionRutas } from './api.js';

function setupSocket() {
    const socket = io(CONFIG.WEBSOCKET_URL);

    socket.on("actualizar_rutas", (data) => {
        if (window.rutaSeleccionada && data.rutasIA[window.rutaSeleccionada]) {
            console.log("📡 WebSocket actualiza la ruta:", window.rutaSeleccionada);
            actualizarMapa({ [window.rutaSeleccionada]: data.rutasIA[window.rutaSeleccionada] });
        }
    });

    socket.on("actualizarUbicacionBus", (ubicacion) => {
        if (!ubicacion || !ubicacion.lat || !ubicacion.lng) return;
        console.log("🛑 Ubicación del bus recibida por WebSocket:", ubicacion);
        actualizarMarcadorBus(ubicacion);
    });

    return socket;
}

async function actualizarRutaSeleccionada(socket) {
    if (!window.rutaSeleccionada) return;

    const rutaData = window.rutaSeleccionada === "mejor_ruta_distancia" ? window.rutaDistancia : window.rutaTrafico;
    const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';

    window.marcadores.forEach(marcador => marcador.map = null);
    window.marcadores = [];
    window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
    window.rutasDibujadas = [];

    const bounds = new google.maps.LatLngBounds();
    const processedRuta = await procesarRuta(rutaData, color, bounds);

    if (!bounds.isEmpty()) {
        window.map.fitBounds(bounds);
    }

    socket.emit("actualizar_ruta_seleccionada", {
        ruta: window.rutaSeleccionada,
        locations: processedRuta ? processedRuta.locations : []
    });
}

function iniciarActualizacionRuta(socket) {
    if (window.intervalID) clearInterval(window.intervalID);
    
    // Solicitar actualización inmediata
    solicitarReorganizacionRutas();
    
    // Configurar intervalo para solicitar actualizaciones cada 20 segundos
    window.intervalID = setInterval(() => {
        solicitarReorganizacionRutas();
        actualizarRutaSeleccionada(socket);
    }, 20000); // 20 segundos como en tu versión
    
    console.log("✅ Actualización de ruta iniciada cada 20 segundos.");
}

function detenerActualizacionRuta() {
    if (window.intervalID) {
        clearInterval(window.intervalID);
        window.intervalID = null;
        console.log("🚫 Actualización de ruta detenida.");
    }
}

export { setupSocket, actualizarRutaSeleccionada, iniciarActualizacionRuta, detenerActualizacionRuta };