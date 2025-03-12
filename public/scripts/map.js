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

let map = null;
let geocoder = null;
let marcadores = []; // Array de marcadores en el mapa
let direccionesTCP = []; // Lista de direcciones recibidas
let seguimientoActivo = false;
let intervaloEnvio = null;

// 📡 Escuchar los datos en tiempo real desde WebSockets
socket.on("actualizar_rutas", (data) => {
    console.log("📡 Rutas actualizadas desde WebSocket:", data.rutasIA);
    dibujarMarcadores(data.rutasIA);
});


// 📍 Obtener ubicación y actualizar el primer elemento de rutasIA
async function obtenerYEnviarUbicacionrutasIA() {
    if (!navigator.geolocation) {
        return console.error("❌ Geolocalización no soportada.");
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            const nuevaUbicacion = { direccion: `Lat: ${latitude}, Lng: ${longitude}` }; // 📌 Ubicación como objeto

            try {
                // 1️⃣ Obtener la última versión de rutasIA desde el servidor
                const responseGet = await fetch('https://smartway.ddns.net/messages');
                if (!responseGet.ok) throw new Error("Error al obtener rutasIA del servidor");

                const data = await responseGet.json();
                let rutasIA = data.rutasIA || [];

                // 2️⃣ Insertar la nueva ubicación en la primera posición
                rutasIA = [nuevaUbicacion, ...rutasIA.slice(1)];

                // 3️⃣ Enviar la nueva lista de rutasIA al servidor
                const responsePost = await fetch('https://smartway.ddns.net/messages', {
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rutasIA })
                });

                if (!responsePost.ok) throw new Error("Error al actualizar rutasIA en el servidor");

                // ✅ Solo imprimir la nueva ubicación cada 10 segundos
                console.log("📡 Nueva ubicación enviada:", nuevaUbicacion);
            } catch (error) {
                console.error("❌ Error al actualizar rutasIA:", error);
            }
        },
        (error) => console.error("❌ Error obteniendo ubicación:", error)
    );
}

// ⏳ Iniciar el envío de ubicación cada 10s después de la primera vez
function iniciarEnvioUbicacion() {
    if (seguimientoActivo) return; // Evitar múltiples inicios
    seguimientoActivo = true;

    setTimeout(() => {
        console.log("⏳ Iniciando actualización de ubicación cada 10s...");
        intervaloEnvio = setInterval(obtenerYEnviarUbicacionrutasIA, 10000);
    }, 10000); // ⏳ Espera 10 segundos antes de empezar
}

function detenerEnvioUbicacion() {
    if (!seguimientoActivo) return; // Si ya está detenido, no hacer nada

    clearInterval(intervaloEnvio); // Detener el intervalo
    seguimientoActivo = false; // Restablecer estado

    console.log("🛑 Envío de ubicación detenido.");
}

// 🗺️ Obtener ubicación sin geocodificar y agregarla al JSON TCP
function obtenerUbicacionYAgregarATCP() {
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
            console.log("📌 Coordenadas obtenidas:", { latitude, longitude });

            // 📍 Guardar directamente lo que se obtiene
            const ubicacionObtenida = `Lat: ${latitude}, Lng: ${longitude}`;

            // Enviar ubicación sin geocodificar
            const ubicacionbus = { direccion: ubicacionObtenida };

            try {
                // 🔽 Enviar la ubicación al servidor
                const response = await fetch('https://smartway.ddns.net/messages/tcp', {
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(ubicacionbus)
                });

                if (!response.ok) throw new Error("Error en la solicitud al servidor");

                console.log("✅ Ubicación enviada al servidor:", ubicacionbus);

                Swal.fire({
                    icon: "success",
                    title: "Ubicación enviada",
                    text: `📌 ${ubicacionObtenida}`,
                    timer: 1500,
                    showConfirmButton: false
                });

            } catch (error) {
                console.error("❌ Error al enviar la ubicación:", error);
                Swal.fire({
                    icon: "error",
                    title: "Error al enviar la ubicación",
                    text: "No se pudo enviar al servidor."
                });
            }
        },
        (error) => {
            if (error.code === error.PERMISSION_DENIED) {
                permisoDenegado = true;
                mostrarAlertaPermisoDenegado();
            } else {
                Swal.fire({
                    icon: "error",
                    title: "Error al obtener ubicación",
                    text: `Ocurrió un error: ${error.message}`
                });
            }
        }
    );
}

// 🚨 Alerta cuando el usuario deniega la geolocalización
function mostrarAlertaPermisoDenegado() {
    Swal.fire({
        icon: "error",
        title: "Acceso denegado",
        text: "Has denegado el acceso a tu ubicación. Para activarlo, ajusta los permisos en tu navegador.",
        showCancelButton: true,
        cancelButtonText: "Salir"
    }).then((result) => {
        if (result.isConfirmed) {
            permisoDenegado = false;
            obtenerUbicacionYAgregarATCP();
        }
    });
}



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


// 📍 Nueva función para dibujar los marcadores con los datos recibidos
async function dibujarMarcadores(direcciones) {
    try {
        if (direcciones.length === 0) {
            console.log('No hay direcciones para dibujar.');
            return;
        }

        // Limpiar marcadores previos
        marcadores.forEach(marcador => marcador.setMap(null));
        marcadores = [];

        // Crear un objeto LatLngBounds para abarcar todos los marcadores
        const bounds = new google.maps.LatLngBounds();

        // Geocodificar todas las direcciones en el orden correcto
        const locations = await Promise.all(direcciones.map(geocodificarDireccion));

        // Dibujar los marcadores en el orden correcto
        locations.forEach((location, index) => {
            if (location) { // Evita errores si alguna dirección no pudo geocodificarse
                agregarMarcador(location, direcciones[index], bounds, index + 1);
            }
        });

        // Ajustar el mapa para incluir todos los marcadores
        map.fitBounds(bounds);

    } catch (error) {
        console.error('Error al dibujar los marcadores:', error);
    }
}

// 📍 Detectar si la dirección es lat/lng o texto y devolver la ubicación
function geocodificarDireccion(direccion) {
    return new Promise((resolve) => {
        // 🧐 Verifica si la dirección tiene el formato "Lat: xx.xxxx, Lng: yy.yyyy"
        const latLngMatch = direccion.match(/Lat:\s*(-?\d+\.\d+),\s*Lng:\s*(-?\d+\.\d+)/);

        if (latLngMatch) {
            const lat = parseFloat(latLngMatch[1]);
            const lng = parseFloat(latLngMatch[2]);
            console.log(`📍 Dirección detectada como coordenadas: ${lat}, ${lng}`);
            return resolve(new google.maps.LatLng(lat, lng));
        }

        // 🔍 Si no es coordenada, intenta geocodificar como dirección
        geocoder.geocode({ address: direccion }, (results, status) => {
            if (status === "OK" && results[0]) {
                console.log(`📌 Dirección convertida a coordenadas: ${direccion} → ${results[0].geometry.location}`);
                resolve(results[0].geometry.location);
            } else {
                console.warn(`⚠️ No se pudo geocodificar: ${direccion}`);
                resolve(null);
            }
        });
    });
}

// 📌 Función para agregar un marcador al mapa
function agregarMarcador(location, direccion, bounds, numero) {
    let marcador;

    if (numero === 1) {
        // 🔹 Primer marcador: usa el icono personalizado sin número
        const marcadorContainer = document.createElement("div");
        marcadorContainer.style.width = "40px";
        marcadorContainer.style.height = "40px";

        const iconoImg = document.createElement("img");
        iconoImg.src = "media/iconobus.svg"; // Ruta del icono personalizado
        iconoImg.style.width = "100%";
        iconoImg.style.height = "100%";

        marcadorContainer.appendChild(iconoImg);

        marcador = new google.maps.marker.AdvancedMarkerElement({
            position: location,
            map: map,
            title: direccion,
            content: marcadorContainer,
        });
    } else {
        // 🔹 Marcadores siguientes: usan el marcador por defecto con número
        const pin = new google.maps.marker.PinElement({
            glyph: `${numero - 1}`, // Se empieza en 1 para el segundo marcador
            glyphColor: '#FFFFFF',
            background: '#070054',
            borderColor: '#FFFFFF',
            scale: 1.2
        });

        marcador = new google.maps.marker.AdvancedMarkerElement({
            position: location,
            map: map,
            title: direccion,
            content: pin.element
        });
    }

    // Guardar marcador y actualizar límites
    marcadores.push(marcador);
    bounds.extend(location);
}



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


async function enviarDireccionesAFlask() {
    try {
        const response = await fetch('/enviar-direcciones', {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        if (!response.ok) throw new Error("Error al enviar direcciones");

        const data = await response.json();
        console.log("📩 Rutas recibidas de Flask:", data.rutasIA);

        // Llamar a dibujarMarcadores para actualizar el mapa con las rutas procesadas
        dibujarMarcadores();
    } catch (error) {
        console.error("❌ Error al enviar direcciones a Flask:", error);
    }
}

// Asignar funciones a los botones
document.getElementById('btnAPI').addEventListener('click', () => {
    enviarDireccionesAFlask();
    iniciarEnvioUbicacion();
});
document.getElementById('btndetener').addEventListener('click', detenerEnvioUbicacion);
document.getElementById('btnMostrarD').addEventListener('click', mostrarMensajesTCP);
document.getElementById('btnLimpiar').addEventListener('click', limpiarMapa);
document.getElementById('btnDbus').addEventListener('click', obtenerUbicacionYAgregarATCP);

