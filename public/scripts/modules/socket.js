// scripts/modules/socket.js
import CONFIG from '../config.js';
import { actualizarMapa, procesarRuta, geocodificarDireccion, agregarMarcadorParada, eliminarMarcadorParada, limpiarMarcadoresParadas } from './map-markers.js';
import { actualizarMarcadorBus, gestionarUbicacion, detenerUbicacion } from './location.js';
import { solicitarReorganizacionRutas } from './api.js';

// Inicializar socketInstance al inicio del módulo
let socketInstance = null;
let directionsRenderer = null;

function setupSocket() {
    if (socketInstance && socketInstance.connected) {
        console.log("🔄 Reutilizando conexión WebSocket existente");
        return socketInstance;
    }

    socketInstance = io(CONFIG.WEBSOCKET_URL, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socketInstance.on("connect", () => {
        console.log("✅ Conectado al servidor WebSocket");
    });

    socketInstance.on("connect_error", (error) => {
        console.error("❌ Error de conexión WebSocket, intentando reconectar:", error.message);
    });

    socketInstance.on("disconnect", (reason) => {
        console.log("🔌 Desconectado del servidor WebSocket, motivo:", reason);
    });

    socketInstance.on("actualizar_rutas", async (data) => {
        if (data.rutasIA && data.rutasIA.mejor_ruta_distancia && data.rutasIA.mejor_ruta_trafico) {
            console.log("📡 Nuevas rutas recibidas por WebSocket:", data.rutasIA);
            window.rutaDistancia = data.rutasIA.mejor_ruta_distancia;
            window.rutaTrafico = data.rutasIA.mejor_ruta_trafico;
            window.distanciaTotalKm = data.rutasIA.distancia_total_km;
            window.tiempoTotalMin = data.rutasIA.tiempo_total_min;

            localStorage.setItem('rutaDistancia', JSON.stringify(window.rutaDistancia));
            localStorage.setItem('rutaTrafico', JSON.stringify(window.rutaTrafico));

            window.rutaSeleccionada = null;
            await actualizarMapa({ mejor_ruta_distancia: window.rutaDistancia, mejor_ruta_trafico: window.rutaTrafico });
        }
    });

    socketInstance.on("ruta_seleccionada_actualizada", async (data) => {
        console.log("🛑 Ruta seleccionada actualizada recibida por WebSocket:", data);
        window.rutaSeleccionada = data.ruta;
        window.rutaSeleccionadaLocations = data.locations;
        const color = data.color || (data.ruta === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900');
        await actualizarMapaConRutaSeleccionada(data.locations, color);
    });

    socketInstance.on("actualizar_tcp_mensajes", (data) => {
        console.log("📡 Mensajes TCP recibidos por WebSocket:", data.tcp);
        mostrarMensajesTCP(data.tcp);
    });

    socketInstance.on("parada_completada", (data) => {
        const { paradaId } = data;
        eliminarMarcadorParada(paradaId);
    });

    socketInstance.on("limpiar_mapa_y_mostrar_mensaje", () => {
        console.log("🧹 Limpiando mapa y mostrando mensaje en cliente WebSocket");
        window.marcadores.forEach(marcador => marcador.setMap(null));
        window.marcadores = [];
        window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
        window.rutasDibujadas = [];

        const mensajeContainer = document.createElement("div");
        mensajeContainer.className = "modal-container";
        mensajeContainer.style.visibility = "visible";
        mensajeContainer.style.opacity = "1";

        const mensajeContent = document.createElement("div");
        mensajeContent.className = "modal-content";
        mensajeContent.innerHTML = `
            <h2 class="modal-title">Ruta Finalizada</h2>
            <p id="modalText">Gracias por utilizar nuestro servicio</p>
        `;

        mensajeContainer.appendChild(mensajeContent);
        document.body.appendChild(mensajeContainer);

        setTimeout(() => {
            mensajeContainer.style.opacity = "0";
            setTimeout(() => {
                mensajeContainer.remove();
            }, 300);
        }, 3000);
    });

    return socketInstance;
}

async function actualizarMapaConRutaSeleccionada(locations, color) {
    if (!window.map || !locations || locations.length === 0) {
        console.warn("⚠️ Mapa o datos de ruta no disponibles");
        return;
    }

    // Limpiar rutas y marcadores previos
    window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
    window.rutasDibujadas = [];
    limpiarMarcadoresParadas(); // Limpiar marcadores de paradas

    const bounds = new google.maps.LatLngBounds();

    // Procesar la ruta seleccionada usando funciones de map-markers.js
    const result = await procesarRuta(locations, color, bounds);
    if (result?.renderer) {
        window.rutasDibujadas = [result.renderer];
        console.log("✅ Ruta seleccionada dibujada en el mapa:", result.renderer);
    } else {
        console.warn("⚠️ No se pudo procesar la ruta seleccionada:", locations);
        return;
    }

    // Agregar marcadores de paradas (excluyendo origen y destino si no son paradas)
    locations.slice(1, -1).forEach((parada, index) => {
        if (!window.paradaMarcadores[parada.id]) {
            const paradaConNormalizada = {
                ...parada,
                direccionNormalizada: parada.direccion.lat ? parada.direccion : null // Será geocodificado en agregarMarcadorParada si es necesario
            };
            agregarMarcadorParada(paradaConNormalizada, index + 1, bounds);
        }
    });

    if (!bounds.isEmpty()) {
        window.map.fitBounds(bounds);
        console.log("🗺️ Mapa ajustado a las ubicaciones");
    } else {
        console.warn("⚠️ Bounds vacíos, no se pudo ajustar el mapa");
    }
}

async function iniciarActualizacionRuta(socket) {
    if (window.intervalID) {
        clearInterval(window.intervalID);
        window.intervalID = null;
    }

    try {
        console.log("📍 Iniciando seguimiento de ubicación...");
        await gestionarUbicacion();
        await solicitarReorganizacionRutas();
    } catch (error) {
        console.error("❌ Error iniciando seguimiento de ubicación:", error);
        return;
    }
    await actualizarRutaSeleccionada(socket);
}

async function actualizarRutaSeleccionada(socket) {
    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/obtener-ruta-inicial`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Error al obtener ruta inicial");
        }
        const data = await response.json();
        if (data.ruta) {
            window.rutaSeleccionada = data.ruta;
            const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
            await actualizarMapaConRutaSeleccionada(data.locations, color);
            console.log("✅ Ruta inicial obtenida y dibujada:", data.ruta);
        }
    } catch (error) {
        console.error("❌ Error al obtener ruta inicial:", error.message);
    }

    socket.on("ruta_seleccionada_actualizada", async (data) => {
        console.log("🛑 Ruta seleccionada actualizada recibida por WebSocket:", data);
        window.rutaSeleccionada = data.ruta;
        window.rutaSeleccionadaLocations = data.locations;
        const color = data.color || (data.ruta === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900');
        await actualizarMapaConRutaSeleccionada(data.locations, color);
    });

    socket.on("actualizar_tcp_mensajes", (data) => {
        console.log("📡 Mensajes TCP recibidos por WebSocket:", data.tcp);
        mostrarMensajesTCP(data.tcp);
    });
}

function detenerActualizacionRuta() {
    if (window.intervalID) {
        clearInterval(window.intervalID);
        window.intervalID = null;
        console.log("🚫 Intervalo de reorganización detenido.");
    }

    detenerUbicacion();
    console.log("🚫 Actualización de ruta detenida.");
}

function mostrarMensajesTCP(mensajes) {
    let mensajesArray = mensajes || [];
    if (mensajesArray.length <= 1) {
        document.querySelectorAll('.tcpDirections').forEach(el => el.innerHTML = "<p>No hay pasajeros dentro del sistema aún.</p>");
        return;
    }
    const listaMensajes = mensajesArray.slice(1).map((msg, index) => {
        let direccion = msg.direccion.lat ? `${msg.direccion.lat},${msg.direccion.lng}` : msg.direccion;
        const esUltimo = index === mensajesArray.slice(1).length - 1;
        const estado = esUltimo ? "" : ` (${msg.bus === 1 ? "En el bus" : "Descendió del bus"})`;

        if (esUltimo && (typeof direccion === "string" && direccion.includes(","))) {
            const [lat, lng] = direccion.split(",").map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
                direccion = "Retorne a donde inició el viaje";
            }
        }

        return `<p>${index + 1}. ${msg.nombre} ${msg.apellido} - ${direccion}${estado}</p>`;
    }).join("");
    document.querySelectorAll('.tcpDirections').forEach(el => el.innerHTML = listaMensajes);
}

export { setupSocket, actualizarRutaSeleccionada, iniciarActualizacionRuta, detenerActualizacionRuta, mostrarMensajesTCP, actualizarMapaConRutaSeleccionada };