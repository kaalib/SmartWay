// scripts/modules/socket.js
import CONFIG from '../config.js';
import { procesarRuta } from './map-markers.js';
import { actualizarMarcadorBus, gestionarUbicacion } from './location.js';
import { solicitarReorganizacionRutas} from './api.js';

function setupSocket() {
    const socket = io(CONFIG.WEBSOCKET_URL);

    socket.on("actualizar_rutas", (data) => {
        if (window.rutaSeleccionada && data.rutaseleccionada) {
            console.log("📡 WebSocket actualiza la ruta seleccionada:", data.rutaseleccionada);
            actualizarMapaConRutaSeleccionada(data.rutaseleccionada);
        }
    });

    socket.on("actualizarUbicacionBus", (rutaseleccionada) => {
        console.log("🛑 Ruta seleccionada recibida por WebSocket:", rutaseleccionada);
        actualizarMapaConRutaSeleccionada(rutaseleccionada);
    });

    return socket;
}

async function actualizarRutaSeleccionada(socket) {
    if (!window.rutaSeleccionada) return;

    // Determinar datos y color de la ruta seleccionada
    const rutaData = window.rutaSeleccionada === "mejor_ruta_distancia" ? window.rutaDistancia : window.rutaTrafico;
    const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';

    // Dibujar solo la primera vez
    if (window.primeraActualizacionMapa) {
        window.marcadores.forEach(marcador => marcador.map = null);
        window.marcadores = [];
        window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
        window.rutasDibujadas = [];

        const bounds = new google.maps.LatLngBounds();
        const processedRuta = await procesarRuta(rutaData, color, bounds);

        if (window.primeraActualizacionMapa && !bounds.isEmpty()) {
            console.log("🔍 Aplicando fitBounds en la primera actualización del emisor");
            window.map.fitBounds(bounds);
            window.primeraActualizacionMapa = false;
        }

        socket.emit("actualizar_ruta_seleccionada", {
            ruta: window.rutaSeleccionada,
            locations: processedRuta ? processedRuta.locations : []
        });
        console.log("📡 Enviando ruta seleccionada al servidor:", window.rutaSeleccionada);
    }

    // Escuchar actualizaciones del servidor
    socket.on("rutaSeleccionada", (data) => {
        console.log("🛑 Ruta seleccionada recibida por WebSocket:", data.locations);
        window.rutaSeleccionadaLocations = data.locations; // Guardar para referencia
        const rutaActualizada = data.locations.map(loc => loc.direccion);
        procesarRuta(rutaActualizada, color, new google.maps.LatLngBounds());
    });
}

async function actualizarRutaSeleccionada(socket) {
    if (!window.rutaSeleccionada) return;

    const rutaData = window.rutaSeleccionada === "mejor_ruta_distancia" ? window.rutaDistancia : window.rutaTrafico;
    const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';

    // Dibujar solo la primera vez
    if (window.primeraActualizacionMapa) {
        window.marcadores.forEach(marcador => marcador.map = null);
        window.marcadores = [];
        window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
        window.rutasDibujadas = [];

        const bounds = new google.maps.LatLngBounds();
        const processedRuta = await procesarRuta(rutaData, color, bounds);

        if (window.primeraActualizacionMapa && !bounds.isEmpty()) {
            console.log("🔍 Aplicando fitBounds en la primera actualización del emisor");
            window.map.fitBounds(bounds);
            window.primeraActualizacionMapa = false;
        }

        socket.emit("actualizar_ruta_seleccionada", {
            ruta: window.rutaSeleccionada,
            locations: processedRuta ? processedRuta.locations : []
        });
    }
}

async function iniciarActualizacionRuta(socket) {
    if (window.intervalID) clearInterval(window.intervalID);
    
    solicitarReorganizacionRutas();
    actualizarRutaSeleccionada(socket);

    window.intervalID = setInterval(async () => {
        await gestionarUbicacion(); // Actualizar ubicación del bus
        const response = await fetch(`${CONFIG.SERVER_URL}/messages`);
        const data = await response.json();
        if (data.rutaseleccionada && window.rutaSeleccionada) {
            const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
            window.marcadores.forEach(marcador => marcador.map = null);
            window.marcadores = [];
            window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
            window.rutasDibujadas = [];
            const bounds = new google.maps.LatLngBounds();
            const locations = await Promise.all(data.rutaseleccionada.map(item => 
                item.direccion.lat ? Promise.resolve(item.direccion) : geocodificarDireccion(item.direccion)
            ));
            locations.forEach((loc, index) => {
                if (data.rutaseleccionada[index].bus === 1) {
                    if (index === 0) {
                        actualizarMarcadorBus(loc); // Bus como punto 1
                    } else {
                        agregarMarcador(loc, `Parada ${index}`, bounds, index);
                    }
                }
            });
            if (locations.length > 1) dibujarRutaConductor(locations.filter((_, i) => data.rutaseleccionada[i].bus === 1), color);
            if (window.primeraActualizacionMapa && !bounds.isEmpty()) {
                window.map.fitBounds(bounds);
                window.primeraActualizacionMapa = false;
            }
        }
    }, 10000);
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
        document.querySelectorAll('.tcpDirections').forEach(el => el.innerHTML = "<p>No hay pasajeros dentro del sistema aún.</p>");
        return;
    }
    const listaMensajes = mensajesArray.slice(1).map((msg, index) => 
        `<p>${index + 1}. ${msg.nombre} ${msg.apellido} - ${msg.direccion} (${msg.bus === 1 ? "En el bus" : "Llegó"})</p>`
    ).join("");
    document.querySelectorAll('.tcpDirections').forEach(el => el.innerHTML = listaMensajes);
}

export { setupSocket, actualizarRutaSeleccionada, iniciarActualizacionRuta, detenerActualizacionRuta, mostrarMensajesTCP };