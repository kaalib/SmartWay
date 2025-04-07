// scripts/modules/socket.js
import CONFIG from '../config.js';
import { actualizarMapa, procesarRuta } from './map-markers.js';
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

    socket.on("ruta_seleccionada_actualizada", (data) => {
        console.log("📡 Ruta seleccionada actualizada desde otro cliente:", data);
        if (data.ruta && data.locations) {
            window.rutaSeleccionada = data.ruta;
            const color = data.ruta === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
            window.marcadores.forEach(marcador => marcador.map = null);
            window.marcadores = [];
            window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
            window.rutasDibujadas = [];
            const bounds = new google.maps.LatLngBounds();
            procesarRuta(data.locations, color, bounds).then(() => {
                if (window.primeraActualizacionMapa && !bounds.isEmpty()) {
                    window.map.fitBounds(bounds);
                    window.primeraActualizacionMapa = false;
                }
            });
        }
    });

    socket.on("actualizar_tcp_mensajes", (data) => {
        console.log("📡 Mensajes TCP recibidos por WebSocket:", data.tcp);
        mostrarMensajesTCP(data.tcp);
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

    if (window.primeraActualizacionMapa && !bounds.isEmpty()) {
        window.map.fitBounds(bounds);
        window.primeraActualizacionMapa = false;
    }

    socket.emit("actualizar_ruta_seleccionada", {
        ruta: window.rutaSeleccionada,
        locations: processedRuta ? processedRuta.locations : []
    });
}

function iniciarActualizacionRuta(socket) {
    if (window.intervalID) clearInterval(window.intervalID);
    
    solicitarReorganizacionRutas();
    actualizarRutaSeleccionada(socket);

    window.intervalID = setInterval(() => {
        solicitarReorganizacionRutas();
        actualizarRutaSeleccionada(socket);
    }, 10000);

    console.log("✅ Actualización de ruta iniciada cada 10 segundos.");
}

function detenerActualizacionRuta() {
    if (window.intervalID) {
        clearInterval(window.intervalID);
        window.intervalID = null;
        console.log("🚫 Actualización de ruta detenida.");
    }
}

function mostrarMensajesTCP(mensajes) {
    let mensajesArray = mensajes || [];
    if (mensajesArray.length <= 1) {
        document.querySelectorAll('.tcpDirections').forEach(el => {
            el.innerHTML = "<p>No hay pasajeros dentro del sistema aún.</p>";
        });
        return;
    }

    const listaMensajes = mensajesArray.slice(1).map((msg, index) => 
        `<p>${index + 1}. ${msg.nombre} ${msg.apellido} - ${msg.direccion}</p>`
    ).join("");

    document.querySelectorAll('.tcpDirections').forEach(el => {
        el.innerHTML = listaMensajes;
    });
}

export { setupSocket, actualizarRutaSeleccionada, iniciarActualizacionRuta, detenerActualizacionRuta, mostrarMensajesTCP };