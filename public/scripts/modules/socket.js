// scripts/modules/socket.js
import CONFIG from '../config.js';
import { agregarMarcador, geocodificarDireccion, dibujarRutaConductor, crearMarcadorCirculo, procesarRuta, agregarMarcadorParada, eliminarMarcadorParada, limpiarMarcadoresParadas } from './map-markers.js';
import { actualizarMarcadorBus, gestionarUbicacion, detenerUbicacion } from './location.js';
import { solicitarReorganizacionRutas} from './api.js';

// Inicializar socketInstance al inicio del módulo
let socketInstance = null;
let directionsRenderer = null; // Almacenar el renderer de la polilínea
let paradaMarcadores = {}; // Mapa para almacenar los marcadores de las paradas

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


function convertirADireccionLatLng(direccion) {
    if (typeof direccion === "string" && direccion.includes(",")) {
        const [lat, lng] = direccion.split(",").map(Number);
        if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    return direccion; // Si ya es { lat, lng }, lo dejamos como está
}

async function actualizarMapaConRutaSeleccionada(locations, color) {
    if (!window.map || !locations || locations.length === 0) {
        console.warn("⚠️ Mapa o datos de ruta no disponibles");
        return;
    }

    if (directionsRenderer) {
        directionsRenderer.setMap(null);
    }

    directionsRenderer = new google.maps.DirectionsRenderer({
        map: window.map,
        suppressMarkers: true,
        polylineOptions: { strokeColor: color, strokeWeight: 5 }
    });

    const directionsService = new google.maps.DirectionsService();
    const waypoints = [];
    const coordsPromises = locations.slice(1, -1).map(async (parada) => {
        const coords = parada.direccion.lat ? parada.direccion : await geocodificarDireccion(parada.direccion);
        if (coords) {
            waypoints.push({ location: coords, stopover: true });
        }
        return coords;
    });

    const coordsArray = await Promise.all(coordsPromises);
    const origin = locations[0].direccion.lat ? locations[0].direccion : await geocodificarDireccion(locations[0].direccion);
    const destination = locations[locations.length - 1].direccion.lat ? locations[locations.length - 1].direccion : await geocodificarDireccion(locations[locations.length - 1].direccion);

    if (!origin || !destination) {
        console.warn("⚠️ No se pudo obtener origen o destino");
        return;
    }

    const request = {
        origin: origin,
        destination: destination,
        waypoints: waypoints,
        travelMode: google.maps.TravelMode.DRIVING
    };

    directionsService.route(request, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
            console.log("✅ Ruta seleccionada dibujada en el mapa");
        } else {
            console.warn("⚠️ Error al calcular la ruta:", status);
        }
    });

    locations.slice(1).forEach(async (parada, index) => {
        const paradaId = parada.id;
        if (!paradaMarcadores[paradaId]) {
            const coords = parada.direccion.lat ? parada.direccion : await geocodificarDireccion(parada.direccion);
            if (coords) {
                const marker = new google.maps.Marker({
                    position: coords,
                    map: window.map,
                    title: parada.nombre,
                    icon: {
                        url: "/images/parada.png",
                        scaledSize: new google.maps.Size(32, 32)
                    }
                });
                paradaMarcadores[paradaId] = marker;
                console.log(`🖌️ Marcador de parada creado: ${paradaId}`);
            }
        }
    });

    window.rutasDibujadas = [directionsRenderer];

    const bounds = new google.maps.LatLngBounds();
    locations.forEach((parada) => {
        const coords = parada.direccion.lat ? parada.direccion : parada.direccionNormalizada;
        if (coords) bounds.extend(coords);
    });

    if (!bounds.isEmpty()) {
        window.map.fitBounds(bounds);
        console.log("🗺️ Mapa ajustado a las ubicaciones");
    }
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