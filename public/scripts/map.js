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
        dibujarMarcadores(data.rutasIA);  // 🔄 Llamar a la función para actualizar el mapa
    }
});



// 🚏 Función principal de geolocalización y actualización de rutas
async function gestionarUbicacion(reorganizarRutas = false) {
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
            console.log("📌 Ubicación obtenida:", { latitude, longitude });

            // 📍 Ubicación del bus con ID correcto
            const ubicacionBus = { id: "bus", lat: latitude, lng: longitude };

            try {
                let rutasIA = [];

                if (reorganizarRutas) {
                    // 🔄 Solicitar reorganización de rutas a Node.js
                    const responseFlask = await fetch('https://smartway.ddns.net/enviar-direcciones', {  
                        method: "POST",
                        headers: { "Content-Type": "application/json" }
                    });

                    if (!responseFlask.ok) throw new Error("Error al obtener rutas de Flask");

                    const dataFlask = await responseFlask.json();
                    rutasIA = dataFlask.rutasIA || [];

                } else {
                    // 🔄 Obtener la última versión de rutasIA desde el servidor
                    const responseGet = await fetch('https://smartway.ddns.net/messages');
                    if (!responseGet.ok) throw new Error("Error al obtener rutasIA");

                    const data = await responseGet.json();
                    rutasIA = data.rutasIA || [];
                }

                // 📌 Insertar ubicación del bus al inicio y limpiar duplicados
                rutasIA = [ubicacionBus, ...rutasIA.filter(d => d.id !== "bus")];

                // 📡 Enviar ubicación actualizada del bus a Node.js
                await fetch('https://smartway.ddns.net/messages/tcp', {  
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: "bus", direccion: { lat: latitude, lng: longitude } })  
                });

                console.log("📡 Ubicación del bus actualizada en rutasIA:", rutasIA);

                // 📍 Actualizar el mapa
                actualizarMapa(rutasIA);

            } catch (error) {
                console.error("❌ Error en `gestionarUbicacion()`:", error);
            }
        },
        (error) => {
            console.error("❌ Error obteniendo ubicación:", error);
            if (error.code === error.PERMISSION_DENIED) {
                mostrarAlertaPermisoDenegado();
            }
        }
    );
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



async function actualizarMapa(rutasIA) {
    if (!rutasIA.length) return;

    // Limpiar marcadores anteriores
    marcadores.forEach(marcador => marcador.setMap(null));
    marcadores = [];

    const bounds = new google.maps.LatLngBounds();

    // 🗺️ Convertir direcciones a coordenadas si es necesario
    const locations = await Promise.all(rutasIA.map(async (direccion) => {
        if (typeof direccion === "string") {
            return await geocodificarDireccion(direccion); // Geocodifica direcciones en texto
        }
        return direccion; // Si ya es un objeto { lat, lng }, lo usa directamente
    }));

    // 📌 Dibujar los marcadores solo con coordenadas válidas
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



async function dibujarMarcadores(direcciones) {
    try {
        if (direcciones.length === 0) {
            console.log('No hay direcciones para dibujar.');
            return;
        }

        // Limpiar marcadores previos
        marcadores.forEach(marcador => marcador.setMap(null));
        marcadores = [];

        // Crear límites del mapa
        const bounds = new google.maps.LatLngBounds();

        let ubicacionBus = null;
        const direccionesPasajeros = [];

        // Separar la ubicación del bus de las direcciones de pasajeros
        direcciones.forEach((punto) => {
            if (typeof punto === "object" && punto.lat !== undefined && punto.lng !== undefined) {
                ubicacionBus = punto;
            } else {
                direccionesPasajeros.push(punto);
            }
        });

        // Dibujar primero el bus
        if (ubicacionBus) {
            agregarMarcador(ubicacionBus, "bus", bounds, "bus");
        }

        // Geocodificar y dibujar las paradas en orden
        const locations = await Promise.all(direccionesPasajeros.map(geocodificarDireccion));

        locations.forEach((location, index) => {
            if (location) {
                agregarMarcador(location, `Parada ${index + 1}`, bounds, index + 1);
            }
        });

        // Ajustar el mapa para incluir todos los marcadores
        map.fitBounds(bounds);

    } catch (error) {
        console.error('Error al dibujar los marcadores:', error);
    }
}

// 📍 Convertir direcciones en texto a coordenadas `{ lat, lng }`
async function convertirDireccionesAUbicaciones(rutas) {
    const coordenadas = [];

    for (const direccion of rutas) {
        const ubicacion = await geocodificarDireccion(direccion);
        if (ubicacion) {
            coordenadas.push({ lat: ubicacion.lat(), lng: ubicacion.lng() });
        }
    }

    return coordenadas;
}

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

function agregarMarcador(location, title, bounds, label) {
    let marcador;

    if (label === "bus") {
        // 🔹 Bus usa icono SVG personalizado
        marcador = new google.maps.Marker({
            position: location,
            map: map,
            title: "Bus",
            icon: {
                url: "media/iconobus.svg",
                scaledSize: new google.maps.Size(40, 40)
            }
        });
    } else {
        // 🔹 Pasajeros usan números
        marcador = new google.maps.Marker({
            position: location,
            map: map,
            title: title,
            label: {
                text: String(label),
                color: "white",
                fontSize: "12px",
                fontWeight: "bold"
            }
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




// Asignar funciones a los botones
document.getElementById('btnAPI').addEventListener("click", async () => {
    await gestionarUbicacion(true); // Reorganiza al iniciar la ruta

    if (intervalID) clearInterval(intervalID); // Evita intervalos duplicados
    intervalID = setInterval(() => gestionarUbicacion(false), 10000);
});

document.getElementById('btnMostrarD').addEventListener('click', mostrarMensajesTCP);

document.getElementById('btnLimpiar').addEventListener('click', () => {
    limpiarMapa(); // Llama a la función existente para limpiar el mapa

    if (intervalID) {
        clearInterval(intervalID); // 🛑 Detiene el intervalo de envío de ubicación
        intervalID = null; // Restablece la variable para evitar problemas futuros
        console.log("🚫 Envío de ubicación detenido.");
    }
});


