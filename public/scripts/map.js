const jsonUrl = 'https://smartway.ddns.net/messages'; // Cambiar por la IP de tu servidor
const tcpDirectionsList = document.querySelectorAll('.tcpDirections');
const socket = io("https://smartway.ddns.net"); // Conectar a WebSocket


document.addEventListener("DOMContentLoaded", () => {
    const role = localStorage.getItem("userRole");

    if (role === "Empleado") {
        ocultarElementos(["button-container", "message-container", "message-toggle"]);
    } else if (role === "Administrador") {
       // ocultarElementos(["button-container"]);
    } else if (role === "Conductor") {
        // No ocultamos nada, el conductor tiene todos los permisos
    } else {
        window.location.href = "login.html"; // Redirigir si no hay rol válido
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


// 📡 Escuchar los datos en tiempo real desde WebSockets
socket.on("actualizar_rutas", (data) => {
    if (data.rutasIA.length > 0) {
        console.log("📡 WebSocket actualiza la ubicación:", data.rutasIA);
        actualizarMapa(data.rutasIA);  // 🔄 Llamar a la función para actualizar el mapa
    }
});


// 🚏 Función para obtener la ubicación y enviarla al servidor
async function gestionarUbicacion() {
    if (!navigator.geolocation) {
        return Swal.fire({
            icon: "error",
            title: "Geolocalización no disponible",
            text: "Tu navegador no soporta la geolocalización."
        });
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            const timestamp = new Date(position.timestamp).toISOString(); // ⏳ Convertir a formato ISO

            console.log("📌 Ubicación obtenida:", { latitude, longitude, timestamp });

            try {
                // 📡 Enviar los datos al servidor
                const response = await fetch('https://smartway.ddns.net/actualizar-ubicacion-bus', {
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lat: latitude, lng: longitude })
                });

                // 🛑 Verificar si la solicitud fue exitosa
                if (!response.ok) {
                    throw new Error(`Error en la respuesta del servidor: ${response.status}`);
                }

                const result = await response.json();
                console.log("📡 Respuesta del servidor:", result);
                
            } catch (error) {
                console.error("❌ Error enviando ubicación al servidor:", error);
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
        }
    );
}

async function solicitarActualizacionRutas() {
    try {
        console.log("📡 Solicitando actualización de rutas...");
        const response = await fetch("/enviar-direcciones", { method: "POST" });
        const data = await response.json();

        if (data.success) {
            console.log("✅ Rutas actualizadas:", data.rutasIA);
            actualizarMarcadores(data.rutasIA); // 📌 Actualizar los marcadores en el mapa
        } else {
            console.error("❌ Error al actualizar rutas:", data.message);
        }
    } catch (error) {
        console.error("❌ Error al comunicarse con el servidor:", error);
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

async function actualizarMapa(rutasIA) {
    if (!rutasIA.length) return;

    // Limpiar marcadores anteriores
    marcadores.forEach(marcador => marcador.map = null);
    marcadores = [];

    const bounds = new google.maps.LatLngBounds();

    // 🗺️ Convertir direcciones a coordenadas si es necesario
    const locations = await Promise.all(rutasIA.map(async (direccion) => {
        return typeof direccion === "string" ? await geocodificarDireccion(direccion) : direccion;
    }));

    // 🔵 Dibujar las paradas con números crecientes usando el marcador predeterminado
    locations.forEach((location, index) => {
        if (location) {
            agregarMarcador(location, `Parada ${index + 1}`, bounds, index + 1);
        }
    });

    // Ajustar la vista del mapa
    if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
    }
}

// 📍 Convertir direcciones en texto a coordenadas `{ lat, lng }`
function geocodificarDireccion(direccion) {
    return new Promise((resolve) => {
        if (!direccion) return resolve(null);

        // 📌 Si ya es `{ lat, lng }`, no necesita geocodificación
        if (typeof direccion === "object" && "lat" in direccion && "lng" in direccion) {
            return resolve(new google.maps.LatLng(direccion.lat, direccion.lng));
        }

        // 🔍 Geocodificar direcciones en texto
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

// 📌 Agregar un marcador al mapa usando el predeterminado de Google con numeración
function agregarMarcador(location, title, bounds, index) {
    // 🏷️ Crear un contenedor para el marcador
    const markerContainer = document.createElement("div");
    markerContainer.style.position = "relative";
    markerContainer.style.display = "flex";
    markerContainer.style.justifyContent = "center";
    markerContainer.style.alignItems = "center";
    markerContainer.style.width = "30px";
    markerContainer.style.height = "30px";
    markerContainer.style.borderRadius = "50%";
    markerContainer.style.backgroundColor = "#0059FF"; // Azul Google Maps
    markerContainer.style.color = "#fff";
    markerContainer.style.fontSize = "14px";
    markerContainer.style.fontWeight = "bold";

    // 🔢 Crear el número de la parada
    markerContainer.textContent = index;

    // 📍 Crear el marcador
    const marcador = new google.maps.marker.AdvancedMarkerElement({
        position: location,
        map: map,
        title: title, // Muestra el nombre al pasar el cursor
        content: markerContainer, // Usar el div personalizado como marcador
    });

    // Guardar marcador y actualizar límites
    marcadores.push(marcador);
    bounds.extend(location);
}


let marcadorBus = null; // Marcador global del bus
let ultimaUbicacionBus = null; // Guardar última ubicación para evitar redibujos innecesarios

async function dibujarUbicacionBus() {
    try {
        const response = await fetch('https://smartway.ddns.net/messages');
        if (!response.ok) throw new Error("Error obteniendo datos de /messages");

        const data = await response.json();
        if (!Array.isArray(data.bus) || data.bus.length === 0) {
            console.warn("🚫 No hay datos de ubicación del bus.");
            return;
        }

        // 📍 Obtener la última ubicación del bus
        const ultimaUbicacion = data.bus.length > 0 ? data.bus[data.bus.length - 1].direccion : null;

        if (!ultimaUbicacion || !ultimaUbicacion.lat || !ultimaUbicacion.lng) {
            console.warn("⚠️ No se encontró una ubicación válida para el bus en /messages:", data);
            return;
        }

        // 🚀 Evitar redibujar si la ubicación no ha cambiado
        if (ultimaUbicacionBus &&
            ultimaUbicacion.lat === ultimaUbicacionBus.lat &&
            ultimaUbicacion.lng === ultimaUbicacionBus.lng) {
            console.log("🔄 La ubicación del bus no ha cambiado.");
            return;
        }

        // 🗑️ Limpiar marcador anterior
        if (marcadorBus) {
            marcadorBus.setMap(null);
        }

        // 🚍 Agregar nuevo marcador del bus con icono personalizado
        marcadorBus = new google.maps.marker.AdvancedMarkerElement({
            position: new google.maps.LatLng(ultimaUbicacion.lat, ultimaUbicacion.lng),
            map: map,
            title: "Ubicación actual del Bus",
            content: document.createElement("img"), // Se usará para mostrar el ícono
        });

        // Configurar la imagen personalizada
        marcadorBus.content.src = "media/iconobus.svg";
        marcadorBus.content.style.width = "40px";
        marcadorBus.content.style.height = "40px";

        // 🔄 Guardar última ubicación para comparación
        ultimaUbicacionBus = ultimaUbicacion;

        console.log("🛑 Marcador del bus actualizado:", ultimaUbicacion);

    } catch (error) {
        console.error("❌ Error obteniendo la ubicación del bus:", error);
    }
}

// 📡 WebSocket: Escuchar cambios en la ubicación del bus en tiempo real
socket.on("actualizarUbicacionBus", (ubicacion) => {
    if (!ubicacion || !ubicacion.lat || !ubicacion.lng) return;

    console.log("🛑 Ubicación del bus recibida por WebSocket:", ubicacion);

    // 🚀 Evitar redibujar si la ubicación no ha cambiado
    if (ultimaUbicacionBus &&
        ubicacion.lat === ultimaUbicacionBus.lat &&
        ubicacion.lng === ultimaUbicacionBus.lng) {
        console.log("🔄 WebSocket: La ubicación del bus no ha cambiado.");
        return;
    }

    // 🗑️ Limpiar marcador anterior
    if (marcadorBus) {
        marcadorBus.setMap(null);
    }

    // 🚍 Dibujar el nuevo marcador con icono personalizado
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

    // 🔄 Guardar última ubicación para comparación
    ultimaUbicacionBus = ubicacion;

    console.log("✅ WebSocket: Ubicación del bus actualizada en el mapa.");
});

// ⏳ Actualizar cada 10 segundos solo si WebSocket no lo hizo ya
setInterval(dibujarUbicacionBus, 10000);

function limpiarMapa() {
    // Eliminar todos los marcadores del mapa
    marcadores.forEach(marcador => marcador.setMap(null));
    marcadores = [];

    // Vaciar la lista de direcciones
    direccionesTCP = [];

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




// Asignar funciones a los botones

document.getElementById('btnMostrarD').addEventListener('click', mostrarMensajesTCP);

// 📍 Botón para iniciar el envío de ubicación
document.getElementById('btnAPI').addEventListener("click", async () => {
    if (intervalID) {
        console.log("⚠️ El envío de ubicación ya está activo.");
        return; // Evita iniciar múltiples intervalos
    }

    await gestionarUbicacion(); // 🔄 Envía la ubicación inicial
    await solicitarActualizacionRutas(); // 📡 Solicita rutas solo una vez

    // 🔄 Enviar ubicación cada 10 segundos
    intervalID = setInterval(gestionarUbicacion, 10000);
    console.log("✅ Envío de ubicación activado.");
});

// 🛑 Botón para detener el envío de ubicación
document.getElementById('btnLimpiar').addEventListener('click', () => {
    limpiarMapa(); // 🗑️ Limpia el mapa

    if (intervalID) {
        clearInterval(intervalID); // 🛑 Detiene el intervalo
        intervalID = null; // Restablece la variable
        console.log("🚫 Envío de ubicación detenido.");
    } else {
        console.log("⚠️ No hay envío de ubicación activo.");
    }
});
