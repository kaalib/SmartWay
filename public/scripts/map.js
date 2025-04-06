const jsonUrl = 'https://smartway.ddns.net/messages'; // Cambiar por la IP de tu servidor
const tcpDirectionsList = document.querySelectorAll('.tcpDirections');
const socket = io("https://smartway.ddns.net"); // Conectar a WebSocket

document.addEventListener("DOMContentLoaded", () => {
    const role = localStorage.getItem("userRole");

    if (role === "Empleado") {
        ocultarElementos(["button-container", "message-container", "message-toggle"]);
        ocultarEnlacesAdmin();
    } else if (role === "Administrador") {
        ocultarElementos(["button-container"]);
        // Los administradores ven todos los enlaces
    } else if (role === "Conductor") {
        // El conductor no ve los enlaces de administrador
        ocultarEnlacesAdmin();
    } else {
        //window.location.href = "login.html"; // Redirigir si no hay rol válido
    }

    // 🔹 Configurar menús laterales después de verificar el rol
    configurarBarrasLaterales();
});

// 🔹 Función para ocultar elementos
function ocultarElementos(ids) {
    ids.forEach(id => {
        const elem = document.getElementById(id) || document.querySelector(`.${id}`);
        if (elem) elem.remove();
    });
}

// 🔹 Función para ocultar enlaces de administrador
function ocultarEnlacesAdmin() {
    // Seleccionar todos los elementos con la clase admin-link
    const enlacesAdmin = document.querySelectorAll('.admin-link');
    
    // Eliminar cada uno de los enlaces de administrador
    enlacesAdmin.forEach(enlace => {
        enlace.remove();
    });
}

// 🔹 Declarar la función configurarBarrasLaterales (asumiendo que está definida en otro archivo y necesita ser importada o definida aquí)
function configurarBarrasLaterales() {
    // Implementación de la función o importación desde otro archivo
    // Por ejemplo:
    // import { configurarBarrasLaterales } from './sidebar.js';
    console.log("configurarBarrasLaterales llamada");
}

// 🔹 Función para configurar las barras laterales
function configurarBarrasLaterales() {
    // Menú lateral izquierdo (hamburguesa)
    const sidebar = document.querySelector('.sidebar');
    const menuIcon = document.querySelector('.menu-icon');
    const sidebarCloseBtn = document.querySelector('.sidebar .close-btn');

    function openSidebar() {
        sidebar.style.width = '230px';
    }

    function closeSidebar() {
        sidebar.style.width = '0';
    }

    menuIcon.addEventListener('click', openSidebar);
    sidebarCloseBtn.addEventListener('click', closeSidebar);

    // Barra lateral derecha (mensajes)
    const messageSidebar = document.querySelector('.message-sidebar');
    const messageToggle = document.querySelector('.message-toggle');
    const messageCloseBtn = document.querySelector('.message-sidebar .close-btn');

    function openMessageSidebar() {
        messageSidebar.style.width = '230px';
    }

    function closeMessageSidebar() {
        messageSidebar.style.width = '0';
    }

    messageToggle.addEventListener('click', openMessageSidebar);
    messageCloseBtn.addEventListener('click', closeMessageSidebar);

    // Cerrar ambas barras al hacer clic afuera
    document.addEventListener('click', function (event) {
        if (!sidebar.contains(event.target) && !menuIcon.contains(event.target)) {
            closeSidebar();
        }
        if (!messageSidebar.contains(event.target) && !messageToggle.contains(event.target)) {
            closeMessageSidebar();
        }
    });
}

// 📥 Obtener mensajes TCP y mostrarlos en la lista (PC y móvil)
async function mostrarMensajesTCP() {
    try {
        const response = await fetch('https://smartway.ddns.net/messages'); // 🔽 Ruta del JSON
        if (!response.ok) throw new Error("Error al obtener los mensajes TCP");

        const data = await response.json();
        let mensajes = data.tcp || []; // Obtener lista de mensajes

        if (mensajes.length <= 1) {
            document.querySelectorAll('.tcpDirections').forEach(el => {
                el.innerHTML = "<p>No hay suficientes mensajes TCP.</p>";
            });
            return;
        }

        // 📋 Crear lista excluyendo el primer mensaje
        const listaMensajes = mensajes.slice(1).map((msg, index) => 
            `<p>${index + 1}. ${msg.nombre} ${msg.apellido} - ${msg.direccion}</p>`
        ).join("");

        // 🔽 Insertar en todos los elementos con la clase `tcpDirections`
        document.querySelectorAll('.tcpDirections').forEach(el => {
            el.innerHTML = listaMensajes;
        });

    } catch (error) {
        console.error("❌ Error obteniendo mensajes TCP:", error);
        document.querySelectorAll('.tcpDirections').forEach(el => {
            el.innerHTML = "<p>Error al cargar mensajes.</p>";
        });
    }
}

// Cargar el mapa
getApiKey();

let intervalID;
let map = null;
let geocoder = null;
let marcadores = []; // Array de marcadores en el mapa
let rutasDibujadas = []; // Array de rutas dibujadas en el mapa
let direccionesTCP = []; // Lista de direcciones recibidas


// Obtener API Key y cargar Google Maps
function getApiKey() {
    fetch('/api/getApiKey')
        .then(response => response.json())
        .then(data => {
            if (data.apiKey) {
                loadGoogleMapsApi(data.apiKey);
            } else {
                console.error('API Key no encontrada.');
            }
        })
        .catch(error => console.error('Error al obtener la API Key:', error));
}

// Cargar script de Google Maps con Places y Geocoder
function loadGoogleMapsApi(apiKey) {
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker&callback=initMap`;
    script.onerror = () => console.error('Error al cargar Google Maps.');
    document.head.appendChild(script);
}

// Inicializar el mapa
function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.error('Elemento del mapa no encontrado.');
        return;
    }

    console.log('Inicializando el mapa...');
    map = new google.maps.Map(mapElement, {
        center: { lat: 10.9804, lng: -74.81 },
        zoom: 14,
        disableDefaultUI: true,
        mapId: 'a8e469502b0f35f7',
    });

    geocoder = new google.maps.Geocoder(); // Inicializar Geocoder
    
    
}


let rutaSeleccionada = null; // Variable global para la ruta elegida

// 📡 Escuchar los datos en tiempo real desde WebSockets
socket.on("actualizar_rutas", (data) => {
    if (rutaSeleccionada && data.rutasIA[rutaSeleccionada]) {
        console.log("📡 WebSocket actualiza la ruta:", rutaSeleccionada);
        actualizarMapa({ [rutaSeleccionada]: data.rutasIA[rutaSeleccionada] });
    }
});

let primeraVez = true;
// 📍 Función optimizada para obtener la dirección a partir de lat/lng
async function obtenerDireccion(lat, lng) {
    return new Promise((resolve, reject) => {
        const latLng = { lat: parseFloat(lat), lng: parseFloat(lng) };

        geocoder.geocode({ location: latLng }, (results, status) => {
            if (status === "OK" && results[0]) {
                resolve(results[0].formatted_address);
            } else {
                console.error("❌ Error obteniendo dirección:", status);
                resolve("Dirección desconocida");
            }
        });
    });
}


// 🚏 Función para obtener la ubicación y enviarla al servidor
async function gestionarUbicacion() {
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

                    // 🚀 Solo la primera vez convertimos la lat/lng a dirección
                    if (primeraVez) {
                        direccion = await obtenerDireccion(latitude, longitude);
                        console.log("📍 Dirección obtenida:", direccion);
                    }

                    // 📡 Enviar datos al servidor
                    const response = await fetch('https://smartway.ddns.net/actualizar-ubicacion-bus', {
                        method: 'POST',
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            lat: latitude,
                            lng: longitude,
                            direccion: direccion // 📍 Solo la primera vez tiene valor
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`Error en la respuesta del servidor: ${response.status}`);
                    }

                    const result = await response.json();
                    console.log("📡 Respuesta del servidor:", result);

                    // 🚀 Marcar que ya se envió la dirección
                    if (primeraVez) {
                        primeraVez = false;
                    }

                    resolve(); // ✅ Resuelve la promesa cuando todo ha terminado correctamente
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

async function solicitarActualizacionRutas() {
    try {
        console.log("📡 Solicitando actualización de rutas...");
        const response = await fetch("/enviar-direcciones", { method: "POST" });
        const data = await response.json();

        if (data.success) {
            console.log("✅ Rutas actualizadas:", data.rutasIA);
            actualizarMapa(data.rutasIA); // 📌 Actualizar el mapa con las rutas y marcadores
        } else {
            console.error("❌ Error al actualizar rutas:", data.message);
        }
    } catch (error) {
        console.error("❌ Error al comunicarse con el servidor:", error);
    }
}

// 🔥 Ejecutar funciones en orden
async function ejecutarProcesoenorden() {
    try {
        await gestionarUbicacion(); // ✅ Esperar a que se complete la actualización de ubicación
        await solicitarActualizacionRutas(); // ✅ Luego, actualizar rutas
    } catch (error) {
        console.error("❌ Error en el proceso:", error);
    }
}


// 🚨 Alerta si el usuario deniega permisos de ubicación
function mostrarAlertaPermisoDenegado() {
    Swal.fire({
        icon: "error",
        title: "Acceso denegado",
        text: "Has denegado el acceso a tu ubicación. Para activarlo, ajusta los permisos en tu navegador.",
        showCancelButton: true,
        cancelButtonText: "Salir"
    }).then((result) => {
        if (result.isConfirmed) {
            manejarUbicacionYActualizar();
        }
    });
}

async function solicitarReorganizacionRutas() {
    try {
        console.log("📡 Solicitando reorganización de rutas a Node.js...");

        const response = await fetch("https://smartway.ddns.net/enviar-direcciones", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        if (!response.ok) throw new Error("Error al solicitar reorganización de rutas");

        const data = await response.json();
        console.log("✅ Rutas reorganizadas recibidas:", data.rutasIA);

        // 📍 Actualizar el mapa con las nuevas rutas
        actualizarMapa(data.rutasIA);
    } catch (error) {
        console.error("❌ Error en `solicitarReorganizacionRutas()`:", error);
    }
}

// Actualizar mapa con rutas (inicialmente ambas, luego solo la seleccionada)
async function actualizarMapa(rutasIA) {
    if (!rutasIA) return;

    marcadores.forEach(marcador => marcador.map = null);
    marcadores = [];
    rutasDibujadas.forEach(ruta => ruta.setMap(null));
    rutasDibujadas = [];

    const bounds = new google.maps.LatLngBounds();

    if (rutaSeleccionada) {
        // Solo dibujar la ruta seleccionada
        const ruta = rutasIA[rutaSeleccionada];
        const color = rutaSeleccionada === "mejor_ruta_distancia" ? '#002366' : '#FF0000';
        await procesarRuta(ruta, color, bounds, 'A', 'B');
    } else {
        // Dibujar ambas rutas
        await Promise.all([
            procesarRuta(rutasIA.mejor_ruta_distancia, '#002366', bounds, 'A', 'B'),
            procesarRuta(rutasIA.mejor_ruta_trafico, '#FF0000', bounds, 'A', 'B')
        ]);
    }

    if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
    }
}

// Procesar una ruta
async function procesarRuta(direcciones, color, bounds, inicio, fin) {
    if (!direcciones || direcciones.length === 0) return;

    const locations = await Promise.all(direcciones.map(geocodificarDireccion));
    
    locations.forEach((location, index) => {
        if (location) {
            let label = (index === 0) ? inicio : (index === locations.length - 1 ? fin : index);
            agregarMarcador(location, `Parada ${index + 1}`, bounds, label, color);
        }
    });

    if (locations.length > 1) {
        const renderer = dibujarRutaConductor(locations, color);
        return { locations, renderer };
    }
    return null;
}

// Geocodificar dirección
function geocodificarDireccion(direccion) {
    return new Promise((resolve) => {
        if (!direccion) return resolve(null);
        geocoder.geocode({ address: direccion }, (results, status) => {
            if (status === "OK" && results[0]) {
                resolve(results[0].geometry.location);
            } else {
                console.warn(`⚠️ No se pudo geocodificar: ${direccion}`);
                resolve(null);
            }
        });
    });
}

// Agregar marcador
function agregarMarcador(location, title, bounds, label, color) {
    const iconUrl = "media/iconouser.svg";
    const marcador = new google.maps.marker.AdvancedMarkerElement({
        position: location,
        map: map,
        title: title,
        content: crearIconoPersonalizado(iconUrl, label, color)
    });
    marcadores.push(marcador);
    bounds.extend(location);
}

// Crear ícono personalizado
function crearIconoPersonalizado(iconUrl, label, color) {
    const div = document.createElement("div");
    div.style.position = "relative";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div.style.width = "40px";
    div.style.height = "40px";

    const img = document.createElement("img");
    img.src = iconUrl;
    img.style.width = "40px";
    img.style.height = "40px";

    const span = document.createElement("span");
    span.textContent = label;
    span.style.position = "absolute";
    span.style.top = "50%";
    span.style.left = "50%";
    span.style.transform = "translate(-50%, -50%)";
    span.style.color = "white";
    span.style.fontWeight = "bold";
    span.style.background = "rgba(0, 0, 0, 0.5)";
    span.style.padding = "2px 6px";
    span.style.borderRadius = "4px";
    span.style.fontSize = "12px";

    div.appendChild(img);
    div.appendChild(span);
    return div;
}


// Dibujar ruta con flechas
function dibujarRutaConductor(locations, color) {
    if (locations.length < 2) return null;

    const directionsService = new google.maps.DirectionsService();
    const directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: true,
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

    directionsService.route({
        origin: locations[0],
        destination: locations[locations.length - 1],
        waypoints: locations.slice(1, -1).map(loc => ({ location: loc, stopover: true })),
        travelMode: google.maps.TravelMode.DRIVING
    }, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
            rutasDibujadas.push(directionsRenderer);
        } else {
            console.error("❌ Error al calcular ruta:", status);
        }
    });

    return directionsRenderer;
}

// Actualizar ruta seleccionada
async function actualizarRutaSeleccionada() {
    if (!rutaSeleccionada) return;

    const rutaData = rutaSeleccionada === "mejor_ruta_distancia" ? window.rutaDistancia : window.rutaTrafico;
    const color = rutaSeleccionada === "mejor_ruta_distancia" ? '#002366' : '#FF0000';

    marcadores.forEach(marcador => marcador.map = null);
    marcadores = [];
    rutasDibujadas.forEach(ruta => ruta.setMap(null));
    rutasDibujadas = [];

    const bounds = new google.maps.LatLngBounds();
    const processedRuta = await procesarRuta(rutaData, color, bounds, 'A', 'B');

    if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
    }

    socket.emit("actualizar_ruta_seleccionada", {
        ruta: rutaSeleccionada,
        locations: processedRuta ? processedRuta.locations : []
    });
}

// WebSocket: Escuchar actualizaciones
socket.on("actualizar_rutas", (data) => {
    if (rutaSeleccionada && data.rutasIA[rutaSeleccionada]) {
        console.log("📡 WebSocket actualiza la ruta:", rutaSeleccionada);
        actualizarMapa({ [rutaSeleccionada]: data.rutasIA[rutaSeleccionada] });
    }
});

// WebSocket: Escuchar actualizaciones
socket.on("actualizar_rutas", (data) => {
    if (rutaSeleccionada && data.rutasIA[rutaSeleccionada]) {
        console.log("📡 WebSocket actualiza la ruta:", rutaSeleccionada);
        actualizarMapa({ [rutaSeleccionada]: data.rutasIA[rutaSeleccionada] });
    }
});

// Iniciar actualización periódica
function iniciarActualizacionRuta() {
    if (intervalID) clearInterval(intervalID);
    intervalID = setInterval(actualizarRutaSeleccionada, 10000);
    console.log("✅ Actualización de ruta iniciada.");
}

// Detener actualización
function detenerActualizacionRuta() {
    if (intervalID) {
        clearInterval(intervalID);
        intervalID = null;
        console.log("🚫 Actualización de ruta detenida.");
    }
}

let marcadorBus = null; // Marcador global del bus
let ultimaUbicacionBus = null; // Última ubicación conocida del bus

async function dibujarUbicacionBus() {
    try {
        const response = await fetch('https://smartway.ddns.net/messages');
        if (!response.ok) throw new Error("Error obteniendo datos de /messages");

        const data = await response.json();
        if (!Array.isArray(data.bus) || data.bus.length === 0) {
            console.warn("🚫 No hay datos de ubicación del bus.");
            return;
        }

        // 📍 Obtener la última ubicación
        const ultimaUbicacion = data.bus[data.bus.length - 1].direccion;
        if (!ultimaUbicacion || !ultimaUbicacion.lat || !ultimaUbicacion.lng) {
            console.warn("⚠️ No se encontró una ubicación válida para el bus:", data);
            return;
        }

        actualizarMarcadorBus(ultimaUbicacion); // Llamamos la nueva función optimizada
    } catch (error) {
        console.error("❌ Error obteniendo la ubicación del bus:", error);
    }
}

// 📡 WebSocket: Escuchar cambios en la ubicación del bus
socket.on("actualizarUbicacionBus", (ubicacion) => {
    if (!ubicacion || !ubicacion.lat || !ubicacion.lng) return;
    console.log("🛑 Ubicación del bus recibida por WebSocket:", ubicacion);
    
    actualizarMarcadorBus(ubicacion); // Llamamos la nueva función optimizada
});

// 🏎️ Función optimizada para actualizar el marcador del bus
function actualizarMarcadorBus(ubicacion) {
    // 🚀 Evitar redibujar si la ubicación no ha cambiado
    if (ultimaUbicacionBus &&
        ubicacion.lat === ultimaUbicacionBus.lat &&
        ubicacion.lng === ultimaUbicacionBus.lng) {
        console.log("🔄 La ubicación del bus no ha cambiado.");
        return;
    }

    // 🗑️ Limpiar marcador anterior
    if (marcadorBus) {
        marcadorBus.setMap(null);
    }

    // 🚍 Crear nuevo marcador con ícono personalizado
    marcadorBus = new google.maps.marker.AdvancedMarkerElement({
        position: new google.maps.LatLng(ubicacion.lat, ubicacion.lng),
        map: map,
        title: "Ubicación actual del Bus",
        content: document.createElement("img"),
    });

    // Configurar la imagen personalizada
    marcadorBus.content.src = "media/iconobus.svg";
    marcadorBus.content.style.width = "40px";
    marcadorBus.content.style.height = "40px";

    // 🔄 Guardar última ubicación
    ultimaUbicacionBus = ubicacion;

    console.log("✅ Marcador del bus actualizado:", ubicacion);
}

// ⏳ Actualizar cada 10 segundos solo si WebSocket no lo hizo ya
setInterval(dibujarUbicacionBus, 10000);


function limpiarMapa() {
    // Eliminar todos los marcadores del mapa
    marcadores.forEach(marcador => marcador.setMap(null));
    marcadores = [];

    // Vaciar la lista de direcciones
    direccionesTCP = [];

    // 🗑️ Eliminar marcador del bus si existe
    if (marcadorBus) {
        marcadorBus.setMap(null);
        marcadorBus = null; // Reiniciar la variable
    }

        // 🗑️ Eliminar todas las polilíneas dibujadas
        rutasDibujadas.forEach(ruta => ruta.setMap(null));
        rutasDibujadas = [];

    // Limpiar contenido de los elementos HTML (soporte para `input` y `div`)
    document.querySelectorAll(".tcpInput").forEach(el => {
        if (el.tagName === "INPUT") {
            el.value = ""; // Si es un input, limpiar valor
        } else {
            el.innerHTML = ""; // Si es otro elemento, limpiar HTML
        }
    });

    document.querySelectorAll(".tcpDirections").forEach(el => {
        if (el.tagName === "INPUT") {
            el.value = "";
        } else {
            el.innerHTML = "";
        }
    });

    // Enviar solicitud DELETE para limpiar mensajes en el servidor
    fetch('/messages', { method: 'DELETE' })
        .then(response => response.json())
        .then(data => console.log(data.message)) // Mensaje de confirmación en consola
        .catch(error => console.error('Error al limpiar mensajes:', error));

    // Enviar solicitud PUT para actualizar la columna bus en la BD
    fetch('/updateBus', { method: 'PUT' })
        .then(response => response.json())
        .then(data => console.log(data.message)) // Mensaje de confirmación en consola
        .catch(error => console.error('Error al actualizar bus:', error));
}


async function iniciarEnvioActualizacion() {
    try {
        const response = await fetch("/iniciar-emision", { method: "POST" });
        const data = await response.json();
        console.log("✅ Emisión activada:", data);
    } catch (error) {
        console.error("❌ Error al iniciar la emisión:", error);
    }
}

async function detenerEnvioActualizacion() {
    try {
        const response = await fetch("/detener-emision", { method: "POST" });
        const data = await response.json();
        console.log("🛑 Emisión detenida:", data);
    } catch (error) {
        console.error("❌ Error al detener la emisión:", error);
    }
}


// Mostrar loader y dibujar ambas rutas
async function mostrarLoader() {
    const modal = document.getElementById("loaderContainer");
    const loader = document.getElementById("loader");
    const modalText = document.getElementById("modalText");
    const btnInicio = document.getElementById("btnInicio");
    const btnSeleccionRuta = document.getElementById("btnSeleccionRuta");

    modal.style.visibility = "visible";
    modal.style.opacity = "1";
    loader.classList.remove("hidden");
    modalText.textContent = "Calculando ruta";

    let dataLoaded = false;
    let elapsedTime = 0;
    const maxWaitTime = 120000; // 2 minutos en milisegundos (120 segundos)

    while (!dataLoaded && elapsedTime < maxWaitTime) {
        try {
            const response = await fetch("/messages");
            const data = await response.json();

            if (data.rutasIA && data.rutasIA.mejor_ruta_distancia && data.rutasIA.mejor_ruta_trafico) {
                window.rutaDistancia = data.rutasIA.mejor_ruta_distancia;
                window.rutaTrafico = data.rutasIA.mejor_ruta_trafico;
                window.distanciaTotalKm = data.rutasIA.distancia_total_km;
                window.tiempoTotalMin = data.rutasIA.tiempo_total_min;
                dataLoaded = true;
            }
        } catch (error) {
            console.error("Error al obtener datos:", error);
        }

        if (!dataLoaded) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Revisar cada 1 segundo
            elapsedTime += 1000;
            console.log(`Tiempo transcurrido: ${elapsedTime / 1000} segundos`);
        }
    }

    if (dataLoaded) {
        loader.classList.add("hidden");
        modalText.textContent = "Datos cargados. Escoja la mejor ruta según la información brindada.";
        btnInicio.disabled = true;
        btnSeleccionRuta.disabled = false;
        setTimeout(cerrarLoader, 2000); // Cierra el modal tras 2 segundos para dar tiempo a leer el mensaje
        await actualizarMapa({ mejor_ruta_distancia: window.rutaDistancia, mejor_ruta_trafico: window.rutaTrafico });
    } else {
        // Si han pasado 4 minutos sin datos
        loader.classList.add("hidden");
        modalText.textContent = "Falla en el servidor. Por favor, intente nuevamente la solicitud.";
        btnInicio.disabled = false; // Permitir reintentar
        btnSeleccionRuta.disabled = true; // Deshabilitar selección hasta nuevo intento
        setTimeout(cerrarLoader, 3000); // Cierra el modal tras 2 segundos para dar tiempo a leer el mensaje
    }
}

// Cerrar loader manualmente (puede llamarse desde otro botón o evento si deseas)
function cerrarLoader() {
    const modal = document.getElementById("loaderContainer");
    modal.style.visibility = "hidden";
    modal.style.opacity = "0";
}

// Mostrar opciones de ruta
function mostrarOpcionesRuta() {
    const modal = document.getElementById("rutaContainer");
    const rutaDistanciaText = document.getElementById("rutaDistanciaText");
    const rutaTraficoText = document.getElementById("rutaTraficoText");
    const btnSeleccionarRutaConfirm = document.getElementById("btnSeleccionarRutaConfirm");

    modal.style.visibility = "visible";
    modal.style.opacity = "1";

    if (window.distanciaTotalKm && window.tiempoTotalMin) {
        rutaDistanciaText.textContent = `Distancia: ${window.distanciaTotalKm} km`;
        rutaTraficoText.textContent = `Tiempo: ${window.tiempoTotalMin} min`;
        btnSeleccionarRutaConfirm.disabled = true;
    } else {
        rutaDistanciaText.textContent = "Error al obtener datos de distancia";
        rutaTraficoText.textContent = "Error al obtener datos de tiempo";
        btnSeleccionarRutaConfirm.disabled = true;
    }
}


// Función para abrir el modal de ubicación
function abrirUbicacionModal() {
    const modal = document.getElementById("ubicacionContainer");
    modal.style.visibility = "visible";
    modal.style.opacity = "1";
}

// Función para cerrar el modal de ubicación
function cerrarUbicacionModal() {
    const modal = document.getElementById("ubicacionContainer");
    modal.style.visibility = "hidden";
    modal.style.opacity = "0";
}

// Función para deshabilitar el botón de inicio
function bloquearInicio() {
    document.getElementById('btnInicio').disabled = true;
}

// Función para habilitar el botón de inicio
function desbloquearInicio() {
    document.getElementById('btnInicio').disabled = false;
}

// Función para cerrar el modal de confirmación
function cerrarModal() {
    const modal = document.getElementById("confirmContainer");
    modal.style.visibility = "hidden";
    modal.style.opacity = "0";
}



// Asignar funciones a los botones

// Evento para habilitar el botón al seleccionar una opción de ubicación
document.querySelectorAll('input[name="ubicacion"]').forEach((radio) => {
    radio.addEventListener("change", () => {
        document.getElementById("btnSeleccionarUbicacion").disabled = false;
    });
});

// Evento para cerrar el modal de ubicación y mostrar el loader
document.getElementById("btnSeleccionarUbicacion").addEventListener("click", () => {
    const opcionSeleccionada = document.querySelector('input[name="ubicacion"]:checked').value;
    console.log("📍 Ubicación seleccionada:", opcionSeleccionada);
    window.ultimaParada = opcionSeleccionada;
    cerrarUbicacionModal();
    mostrarLoader(); // Mostrar el loader después de seleccionar la ubicación
});

// Botón para iniciar el envío de ubicación
document.getElementById('btnInicio').addEventListener("click", async () => {
    await abrirUbicacionModal();
    await mostrarMensajesTCP(); // 📥 Mostrar mensajes TCP en la lista
    await ejecutarProcesoenorden(); // 🔄 Envía la ubicación inicial
    await iniciarEnvioActualizacion(); // 📡 Inicia la emisión de ubicación
    if (intervalID) {
        console.log("⚠️ El envío de ubicación ya está activo.");
        return; // Evita iniciar múltiples intervalos
    }
    intervalID = setInterval(gestionarUbicacion, 10000);
    console.log("✅ Envío de ubicación activado.");
});

// Botón para mostrar las opciones de ruta
document.getElementById("btnSeleccionRuta").addEventListener("click", () => {
    mostrarOpcionesRuta();
});

// Botón para abrir el modal de confirmación
document.getElementById("btnFin").addEventListener("click", () => {
    const modal = document.getElementById("confirmContainer");
    modal.style.visibility = "visible";
    modal.style.opacity = "1";
});

// Evento para finalizar
document.getElementById("confirmYes").addEventListener("click", () => {
    limpiarMapa();
    fetch("/detener-emision", { method: "POST" })
        .then(res => res.json())
        .then(data => console.log("✅ Emisión detenida:", data))
        .catch(err => console.error("❌ Error deteniendo emisión:", err));

    if (intervalID) {
        clearInterval(intervalID);
        intervalID = null;
        console.log("🚫 Envío de ubicación detenido.");
    }
    primeraVez = true;
    rutaSeleccionada = null;

    const btnInicio = document.getElementById("btnInicio");
    btnInicio.disabled = false;
    btnInicio.classList.remove("btn-disabled");
    btnInicio.classList.add("btn-enabled");

    const btnSeleccionRuta = document.getElementById("btnSeleccionRuta");
    btnSeleccionRuta.disabled = true;
    btnSeleccionRuta.classList.remove("btn-enabled");
    btnSeleccionRuta.classList.add("btn-disabled");

    const btnFin = document.getElementById("btnFin");
    btnFin.disabled = true;
    btnFin.classList.remove("btn-enabled");
    btnFin.classList.add("btn-disabled");

    cerrarModal();
});

// Evento para cancelar la acción y cerrar el modal
document.getElementById("confirmNo").addEventListener("click", () => {
    cerrarModal();
});

// Función para cerrar el modal de rutas
function cerrarRutaModal() {
    const modal = document.getElementById("rutaContainer");
    modal.style.visibility = "hidden";
    modal.style.opacity = "0";
}

// Habilitar el botón de selección al elegir una ruta
document.querySelectorAll('input[name="ruta"]').forEach((radio) => {
    radio.addEventListener("change", () => {
        document.getElementById("btnSeleccionarRutaConfirm").disabled = false;
    });
});

// Evento para confirmar la selección de ruta
document.getElementById("btnSeleccionarRutaConfirm").addEventListener("click", () => {
    rutaSeleccionada = document.querySelector('input[name="ruta"]:checked').value;
    actualizarRutaSeleccionada();
    cerrarRutaModal();
    bloquearInicio();
    document.getElementById("btnSeleccionRuta").disabled = true;
    document.getElementById("btnFin").disabled = false;

    // Iniciar emisión desde el servidor
    fetch("/iniciar-emision", { method: "POST" })
        .then(res => res.json())
        .then(data => console.log("✅ Emisión iniciada:", data))
        .catch(err => console.error("❌ Error iniciando emisión:", err));
});