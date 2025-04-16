// scripts/modules/socket.js
import CONFIG from '../config.js';
import { agregarMarcador, geocodificarDireccion, dibujarRutaConductor, crearMarcadorCirculo, procesarRuta} from './map-markers.js';
import { actualizarMarcadorBus, gestionarUbicacion, detenerUbicacion } from './location.js';
import { solicitarReorganizacionRutas} from './api.js';

// Inicializar socketInstance al inicio del módulo
let socketInstance = null;

function setupSocket() {
    // Si ya existe una instancia conectada, reutilizarla
    if (socketInstance && socketInstance.connected) {
        console.log("🔄 Reutilizando conexión WebSocket existente");
        return socketInstance;
    }

    // Crear nueva conexión con opciones de reconexión
    socketInstance = io(CONFIG.WEBSOCKET_URL, {
        reconnection: true,           // Habilitar reconexión automática
        reconnectionAttempts: 5,     // Intentar reconectar hasta 5 veces
        reconnectionDelay: 1000      // Esperar 1 segundo entre intentos
    });

    // Evento cuando se conecta exitosamente
    socketInstance.on("connect", () => {
        console.log("✅ Conectado al servidor WebSocket");
    });

    // Evento cuando hay un error de conexión
    socketInstance.on("connect_error", (error) => {
        console.error("❌ Error de conexión WebSocket, intentando reconectar:", error.message);
    });

    // Evento cuando se desconecta
    socketInstance.on("disconnect", (reason) => {
        console.log("🔌 Desconectado del servidor WebSocket, motivo:", reason);
    });

    // Evento para actualizar rutas
    socketInstance.on("optimizar_rutas", (data) => {
        if (data.rutaseleccionada) {
            console.log("📡 WebSocket actualiza la ruta seleccionada:", data.rutasIA);
        // Dibujar rutas
        actualizarMapa(rutasIA);;
        }
    });

    // Evento para ruta seleccionada actualizada
    socketInstance.on("ruta_seleccionada_actualizada", async (data) => {
        console.log("🛑 Ruta seleccionada actualizada recibida por WebSocket:", data);
        window.rutaSeleccionada = data.ruta;
        window.rutaSeleccionadaLocations = data.locations;
        const color = data.color || (data.ruta === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900');
        await actualizarMapaConRutaSeleccionada(data.locations, color);
    });

    // Evento para mensajes TCP
    socketInstance.on("actualizar_tcp_mensajes", (data) => {
        console.log("📡 Mensajes TCP recibidos por WebSocket:", data.tcp);
        mostrarMensajesTCP(data.tcp);
        // Actualizar mapa con rutaseleccionada si está disponible
        //if (data.rutaseleccionada && window.rutaSeleccionada) {
        //    const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
        //    actualizarMapaConRutaSeleccionada(data.rutaseleccionada, color);
        //}
    });

    // Evento para limpiar mapa y mostrar mensaje
    socketInstance.on("limpiar_mapa_y_mostrar_mensaje", () => {
        console.log("🧹 Limpiando mapa y mostrando mensaje en cliente WebSocket");

        // Limpiar marcadores de empleados
        if (window.marcadores && Array.isArray(window.marcadores.empleados)) {
            window.marcadores.empleados.forEach(marcador => {
                if (marcador && typeof marcador.setMap === "function") {
                    marcador.setMap(null);
                }
            });
            window.marcadores.empleados = [];
        } else {
            console.warn("⚠️ window.marcadores.empleados no es un array o no está definido");
            window.marcadores = { empleados: [] };
        }

        // Limpiar marcador del bus, si existe
        if (window.marcadores && window.marcadores.bus) {
            if (typeof window.marcadores.bus.setMap === "function") {
                window.marcadores.bus.setMap(null);
            }
            window.marcadores.bus = null;
        }

        // Limpiar rutas dibujadas
        if (Array.isArray(window.rutasDibujadas)) {
            window.rutasDibujadas.forEach(ruta => {
                if (ruta && typeof ruta.setMap === "function") {
                    ruta.setMap(null);
                }
            });
            window.rutasDibujadas = [];
        } else {
            console.warn("⚠️ window.rutasDibujadas no es un array o no está definido");
            window.rutasDibujadas = [];
        }

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

    return socketInstance;
}


function convertirADireccionLatLng(direccion) {
    if (typeof direccion === "string" && direccion.includes(",")) {
        const [lat, lng] = direccion.split(",").map(Number);
        if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    return direccion; // Si ya es { lat, lng }, lo dejamos como está
}

async function actualizarMapaConRutaSeleccionada(rutaseleccionada, color) {
    if (!rutaseleccionada) {
        console.warn("⚠️ No se proporcionó ruta seleccionada");
        return;
    }

    const bounds = new google.maps.LatLngBounds();

    // Geocodificar las direcciones
    const locations = await Promise.all(rutaseleccionada.map(async item => {
        const loc = convertirADireccionLatLng(item.direccion);
        return await geocodificarDireccion(loc.lat ? `${loc.lat},${loc.lng}` : item.direccion);
    }));

    // Crear o actualizar marcadores usando window.marcadores
    rutaseleccionada.forEach((item, index) => {
        const direccionNormalizada = locations[index];
        if (direccionNormalizada) {
            if (index === 0) {
                // Actualizar la posición del bus
                actualizarMarcadorBus(direccionNormalizada);
                bounds.extend(direccionNormalizada);
            } else if (index === rutaseleccionada.length - 1) {
                // Marcador de "Fin" (usar window.marcadores.destino)
                if (!window.marcadores.destino) {
                    window.marcadores.destino = new google.maps.marker.AdvancedMarkerElement({
                        position: direccionNormalizada,
                        map: window.map,
                        title: item.nombre || "Punto Final",
                        content: crearMarcadorCirculo("Fin")
                    });
                    console.log("🖌️ Marcador de Fin creado:", item.nombre || "Punto Final");
                } else {
                    // Actualizar la posición y título si cambió
                    window.marcadores.destino.position = direccionNormalizada;
                    window.marcadores.destino.title = item.nombre || "Punto Final";
                    console.log("🖌️ Marcador de Fin actualizado:", item.nombre || "Punto Final");
                }
                bounds.extend(direccionNormalizada);
            } else if (item.bus === 1) {
                // Marcadores de paradas (usar window.marcadores.empleados)
                const paradaId = item.id || `parada-${index}`; // Asegurar un ID único
                let marcadorExistente = window.marcadores.empleados.find(m => m.paradaId === paradaId);

                if (!marcadorExistente) {
                    const marcador = new google.maps.marker.AdvancedMarkerElement({
                        position: direccionNormalizada,
                        map: window.map,
                        title: item.nombre || `Parada ${index}`,
                        content: crearMarcadorCirculo(index.toString())
                    });
                    marcador.paradaId = paradaId; // Añadir un identificador al marcador
                    window.marcadores.empleados.push(marcador);
                    console.log(`🖌️ Marcador de parada creado: ${paradaId} - ${item.nombre}`);
                } else {
                    // Actualizar la posición y título si cambió
                    marcadorExistente.position = direccionNormalizada;
                    marcadorExistente.title = item.nombre || `Parada ${index}`;
                    console.log(`🖌️ Marcador de parada actualizado: ${paradaId} - ${item.nombre}`);
                }
                bounds.extend(direccionNormalizada);
            }
        }
    });

    // Filtrar las ubicaciones para la ruta (bus, paradas y destino final)
    const locationsFiltradas = locations.filter((_, i) => i === 0 || rutaseleccionada[i].bus === 1 || i === rutaseleccionada.length - 1);

    if (locationsFiltradas.length > 1) {
        // Si ya existe un renderer, actualizamos sus propiedades
        if (window.rutasDibujadas.length > 0) {
            const renderer = window.rutasDibujadas[0];
            renderer.setOptions({
                polylineOptions: {
                    strokeColor: color,
                    strokeOpacity: 0.8,
                    strokeWeight: 5,
                    icons: [{
                        icon: {
                            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                            scale: 4,
                            strokeColor: color,
                            strokeWeight: 2,
                            fillOpacity: 1
                        },
                        offset: "0%",
                        repeat: "100px"
                    }]
                }
            });

            // Actualizar la ruta con las nuevas ubicaciones
            const directionsService = new google.maps.DirectionsService();
            directionsService.route({
                origin: locationsFiltradas[0],
                destination: locationsFiltradas[locationsFiltradas.length - 1],
                waypoints: locationsFiltradas.slice(1, -1).map(loc => ({ location: loc, stopover: true })),
                travelMode: google.maps.TravelMode.DRIVING
            }, (result, status) => {
                if (status === google.maps.DirectionsStatus.OK) {
                    renderer.setDirections(result);
                    console.log("✅ Ruta actualizada suavemente:", color);
                } else {
                    console.error("❌ Error al actualizar ruta:", status);
                }
            });
        } else {
            // Si no existe un renderer, creamos uno nuevo
            const renderer = dibujarRutaConductor(locationsFiltradas, color);
            if (renderer) {
                window.rutasDibujadas.push(renderer);
                console.log("✅ Nueva ruta dibujada:", color);
            }
        }
    }

    if (!bounds.isEmpty()) {
        window.map.fitBounds(bounds);
        console.log("🗺️ Mapa ajustado a los límites:", bounds.toJSON());
    }
}

async function actualizarRutaSeleccionada(socket) {
    if (!window.rutaSeleccionada) return;

    // Intentar cargar rutas si no están definidas
    if (!window.rutaDistancia || !window.rutaTrafico) {
        try {
            const response = await fetch(`${CONFIG.SERVER_URL}/messages`);
            const data = await response.json();
            if (data.rutasIA && data.rutasIA.mejor_ruta_distancia && data.rutasIA.mejor_ruta_trafico) {
                window.rutaDistancia = data.rutasIA.mejor_ruta_distancia;
                window.rutaTrafico = data.rutasIA.mejor_ruta_trafico;
            }
        } catch (error) {
            console.error("❌ Error cargando rutasIA para actualizarRutaSeleccionada:", error);
            return;
        }
    }

    const rutaData = window.rutaSeleccionada === "mejor_ruta_distancia" ? window.rutaDistancia : window.rutaTrafico;
    const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';

    if (!rutaData || !Array.isArray(rutaData)) {
        console.error("❌ rutaData no está definido o no es un array:", rutaData);
        // Usar rutaseleccionada desde el servidor si está disponible
        try {
            const response = await fetch(`${CONFIG.SERVER_URL}/messages`);
            const data = await response.json();
            if (data.rutaseleccionada && data.rutaseleccionada.length > 0) {
                await actualizarMapaConRutaSeleccionada(data.rutaseleccionada, color);
                window.primeraActualizacionMapa = false;
            }
        } catch (error) {
            console.error("❌ Error cargando rutaseleccionada:", error);
            return;
        }
        return;
    }

    if (window.primeraActualizacionMapa) {
        try {
            const response = await fetch(`${CONFIG.SERVER_URL}/seleccionar-ruta`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ruta: window.rutaSeleccionada })
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.message);

            console.log("✅ Ruta inicial obtenida del servidor:", data);
            await actualizarMapaConRutaSeleccionada(data.locations, color);
            window.primeraActualizacionMapa = false;

            socket.emit("actualizar_ruta_seleccionada", {
                ruta: window.rutaSeleccionada,
                locations: data.locations
            });
            console.log("📡 Enviando ruta seleccionada al servidor:", window.rutaSeleccionada);
        } catch (error) {
            console.error("❌ Error al obtener ruta inicial:", error);
        }
    }

    socket.on("ruta_seleccionada_actualizada", async (data) => {
        console.log("🛑 Ruta seleccionada actualizada recibida por WebSocket:", data);
        window.rutaSeleccionadaLocations = data.locations;
        const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
        await actualizarMapaConRutaSeleccionada(data.locations, color);
    });

    socket.on("actualizar_tcp_mensajes", async (data) => {
        console.log("📍 Actualización de TCP y ruta seleccionada recibida:", data);
        const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
        if (data.rutaseleccionada) {
            await actualizarMapaConRutaSeleccionada(data.rutaseleccionada, color);
        }
    });
}

async function iniciarActualizacionRuta(socket) {
    // Limpiar cualquier intervalo existente
    if (window.intervalID) {
        clearInterval(window.intervalID);
        window.intervalID = null;
    }
    //await solicitarReorganizacionRutas();
    // Dibujar la ruta seleccionada inicial
    await actualizarRutaSeleccionada(socket);
}

function detenerActualizacionRuta() {
    // Detener intervalo de reorganización (si existe)
    if (window.intervalID) {
        clearInterval(window.intervalID);
        window.intervalID = null;
        console.log("🚫 Intervalo de reorganización detenido.");
    }

    // Detener seguimiento de ubicación
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

export { setupSocket, actualizarRutaSeleccionada, iniciarActualizacionRuta, detenerActualizacionRuta, mostrarMensajesTCP, actualizarMapaConRutaSeleccionada };