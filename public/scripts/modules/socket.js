// scripts/modules/socket.js
import CONFIG from '../config.js';
import { agregarMarcador, geocodificarDireccion, dibujarRutaConductor, crearMarcadorCirculo, procesarRuta} from './map-markers.js';
import { actualizarMarcadorBus, gestionarUbicacion } from './location.js';
import { solicitarReorganizacionRutas} from './api.js';

function setupSocket() {
    const socket = io(CONFIG.WEBSOCKET_URL);

    socket.on("actualizar_rutas", (data) => {
        if (data.rutaseleccionada) {
            console.log("📡 WebSocket actualiza la ruta seleccionada:", data.rutaseleccionada);
            actualizarMapaConRutaSeleccionada(data.rutaseleccionada);
        }
    });

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

    socket.on("limpiar_mapa_y_mostrar_mensaje", () => {
        console.log("🧹 Limpiando mapa y mostrando mensaje en cliente WebSocket");
        // Limpiar mapa
        window.marcadores.forEach(marcador => marcador.map = null);
        window.marcadores = [];
        window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
        window.rutasDibujadas = [];

        // Crear contenedor del mensaje con clases existentes
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

        // Quitar mensaje después de 3 segundos
        setTimeout(() => {
            mensajeContainer.style.opacity = "0";
            setTimeout(() => {
                mensajeContainer.remove();
            }, 300); // Coincide con la transición de CSS
        }, 3000);
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

async function actualizarMapaConRutaSeleccionada(rutaseleccionada, color) {
    if (!rutaseleccionada) return;

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
        if (direccionNormalizada) {
            if (index === 0) {
                actualizarMarcadorBus(direccionNormalizada);
                bounds.extend(direccionNormalizada);
            } else if (index === rutaseleccionada.length - 1) {
                const marcadorFin = new google.maps.marker.AdvancedMarkerElement({
                    position: direccionNormalizada,
                    map: window.map,
                    title: item.nombre || "Punto Final", // Usar nombre del servidor
                    content: crearMarcadorCirculo("Fin")
                });
                window.marcadores.push(marcadorFin);
                bounds.extend(direccionNormalizada);
            } else if (item.bus === 1) {
                agregarMarcador(direccionNormalizada, item.nombre, bounds, index); // Usar nombre del servidor
            }
        }
    });

    if (locations.length > 1) {
        const renderer = dibujarRutaConductor(locations.filter((_, i) => rutaseleccionada[i].bus === 1 || i === rutaseleccionada.length - 1), color);
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

    // Primera actualización: Usar datos del servidor en lugar de procesar localmente
    if (window.primeraActualizacionMapa) {
        // Hacer una solicitud inicial al servidor para obtener la ruta seleccionada con nombres
        try {
            const response = await fetch(`${CONFIG.SERVER_URL}/seleccionar-ruta`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ruta: window.rutaSeleccionada })
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.message);

            console.log("✅ Ruta inicial obtenida del servidor:", data);
            await actualizarMapaConRutaSeleccionada(data.locations, color); // Dibujar con nombres del servidor
            window.primeraActualizacionMapa = false;

            // Emitir al servidor (aunque /seleccionar-ruta ya lo hace, opcional aquí)
            socket.emit("actualizar_ruta_seleccionada", {
                ruta: window.rutaSeleccionada,
                locations: data.locations // Incluye nombres
            });
            console.log("📡 Enviando ruta seleccionada al servidor:", window.rutaSeleccionada);
        } catch (error) {
            console.error("❌ Error al obtener ruta inicial:", error);
        }
    }

    // Escuchar actualizaciones continuas del servidor
    socket.on("ruta_seleccionada_actualizada", async (data) => {
        console.log("🛑 Ruta seleccionada actualizada recibida por WebSocket:", data);
        window.rutaSeleccionadaLocations = data.locations;
        await actualizarMapaConRutaSeleccionada(data.locations, data.color); // Usar datos completos del servidor
    });

    // Corregir evento para coincidir con /actualizar-ubicacion-bus
    socket.on("actualizar_tcp_mensajes", (data) => {
        console.log("📍 Actualización de TCP y ruta seleccionada recibida:", data);
        actualizarMapaConRutaSeleccionada(data.rutaseleccionada, color); // Usar rutaseleccionada del servidor
    });
}

async function iniciarActualizacionRuta(socket) {
    if (window.intervalID) clearInterval(window.intervalID);
    
    solicitarReorganizacionRutas();
    actualizarRutaSeleccionada(socket); // Dibuja la primera vez

    window.intervalID = setInterval(async () => {
        await gestionarUbicacion(); // Solo envía la ubicación al servidor
        // No redibujar localmente, dejar que WebSocket maneje el mapa
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
    const listaMensajes = mensajesArray.slice(1).map((msg, index) => {
        let direccion = msg.direccion.lat ? `${msg.direccion.lat},${msg.direccion.lng}` : msg.direccion;
        const esUltimo = index === mensajesArray.slice(1).length - 1;
        const estado = esUltimo ? "" : ` (${msg.bus === 1 ? "En el bus" : "Descendió del bus"})`;

        // Si es el punto final y tiene coordenadas, cambiar a mensaje personalizado
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

export { setupSocket, actualizarRutaSeleccionada, iniciarActualizacionRuta, detenerActualizacionRuta, mostrarMensajesTCP };