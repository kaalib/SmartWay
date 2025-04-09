// scripts/modules/socket.js
import CONFIG from '../config.js';
import { procesarRuta,  agregarMarcador, geocodificarDireccion, dibujarRutaConductor} from './map-markers.js';
import { actualizarMarcadorBus, gestionarUbicacion } from './location.js';
import { solicitarReorganizacionRutas} from './api.js';

async function setupSocket() {
    const socket = io(CONFIG.WEBSOCKET_URL);

    socket.on("actualizar_rutas", (data) => {
        if (window.rutaSeleccionada && data.rutaseleccionada) {
            console.log("📡 WebSocket actualiza la ruta seleccionada:", data.rutaseleccionada);
            actualizarMapaConRutaSeleccionada(data.rutaseleccionada);
        }
    });

    socket.on("actualizarUbicacionBus", (rutaseleccionada) => {
        console.log("📍 Actualización de ubicación del bus recibida:", rutaseleccionada);
        actualizarMapaConRutaSeleccionada(rutaseleccionada);
    });

    socket.on("actualizar_tcp_mensajes", (data) => {
        console.log("📡 Mensajes TCP recibidos por WebSocket:", data.tcp);
        mostrarMensajesTCP(data.tcp);
    });

    socket.on("ruta_seleccionada_actualizada", async (data) => {
        console.log("🛑 Ruta seleccionada actualizada recibida por WebSocket:", data);
        window.rutaSeleccionadaLocations = data.locations;
        const rutaActualizada = data.locations.map(loc => loc.direccion);
        const bounds = new google.maps.LatLngBounds();
        const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';

        window.marcadores.forEach(marcador => marcador.map = null);
        window.marcadores = [];
        window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
        window.rutasDibujadas = [];

        await procesarRuta(rutaActualizada, color, bounds);
        if (!bounds.isEmpty()) {
            window.map.fitBounds(bounds);
        }
    });

    return socket;
}


function convertirADireccionLatLng(direccion) {
    if (typeof direccion === "string" && direccion.includes(",")) {
        const [lat, lng] = direccion.split(",").map(Number);
        if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    return direccion; // Si ya es { lat, lng }, lo dejamos como está
}

async function actualizarMapaConRutaSeleccionada(rutaseleccionada) {
    if (!rutaseleccionada || !window.rutaSeleccionada) return;

    const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
    window.marcadores.forEach(marcador => marcador.map = null);
    window.marcadores = [];
    window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
    window.rutasDibujadas = [];

    const bounds = new google.maps.LatLngBounds();
    const locations = await Promise.all(rutaseleccionada.map(async item => {
        const loc = convertirADireccionLatLng(item.direccion);
        return await geocodificarDireccion(loc.lat ? `${loc.lat},${loc.lng}` : item.direccion);
    }));

    rutaseleccionada.forEach((item, index) => {
        const direccionNormalizada = locations[index];
        if (item.bus === 1 && direccionNormalizada) {
            if (index === 0) {
                actualizarMarcadorBus(direccionNormalizada); // Bus como LatLng
                bounds.extend(direccionNormalizada);
            } else {
                agregarMarcador(direccionNormalizada, `${item.nombre}`, bounds, index);
            }
        }
    });

    if (locations.length > 1) {
        const renderer = dibujarRutaConductor(locations.filter((_, i) => rutaseleccionada[i].bus === 1), color);
        if (renderer) window.rutasDibujadas.push(renderer);
    }

    if (!bounds.isEmpty()) {
        window.map.fitBounds(bounds);
    }
}

async function actualizarRutaSeleccionada(socket) {
    if (!window.rutaSeleccionada) return;

    const rutaData = window.rutaSeleccionada === "mejor_ruta_distancia" ? window.rutaDistancia : window.rutaTrafico;
    const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';

    if (!rutaData || !Array.isArray(rutaData)) {
        console.error("❌ rutaData no está definido o no es un array:", rutaData);
        return;
    }

    // Dibujar la primera vez
    if (window.primeraActualizacionMapa) {
        window.marcadores.forEach(marcador => marcador.map = null);
        window.marcadores = [];
        window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
        window.rutasDibujadas = [];

        const bounds = new google.maps.LatLngBounds();
        const processedRuta = await procesarRuta(rutaData, color, bounds);

        if (!bounds.isEmpty()) {
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

    // Escuchar actualizaciones continuas del servidor
    socket.on("ruta_seleccionada_actualizada", async (data) => {
        console.log("🛑 Ruta seleccionada actualizada recibida por WebSocket:", data);
        window.rutaSeleccionadaLocations = data.locations;
        const rutaActualizada = data.locations.map(loc => loc.direccion);
        const bounds = new google.maps.LatLngBounds();

        window.marcadores.forEach(marcador => marcador.map = null);
        window.marcadores = [];
        window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
        window.rutasDibujadas = [];

        const processedRuta = await procesarRuta(rutaActualizada, color, bounds);
        if (!bounds.isEmpty()) {
            window.map.fitBounds(bounds);
        }
    });

    // Escuchar actualizaciones de ubicación del bus
    socket.on("actualizarUbicacionBus", (rutaseleccionada) => {
        console.log("📍 Actualización de ubicación del bus recibida:", rutaseleccionada);
        actualizarMapaConRutaSeleccionada(rutaseleccionada);
    });
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