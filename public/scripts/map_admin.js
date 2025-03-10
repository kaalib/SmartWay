const jsonUrl = 'https://smartway.ddns.net/messages'; // Cambiar por la IP de tu servidor
const wsUrl = 'wss://smartway.ddns.net'; // WebSocket en tu instancia EC2
const tcpInputs = document.querySelectorAll('.tcpInput');
const tcpDirectionsList = document.querySelectorAll('.tcpDirections');



// Configurar barras laterales al cargar el DOM
document.addEventListener("DOMContentLoaded", function () {
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
});




// Cargar mensajes históricos desde /messages
async function fetchMessages() {
    try {
        const response = await fetch(jsonUrl);
        if (!response.ok) throw new Error('Error al cargar el archivo JSON');

        const data = await response.json();
        tcpInput.innerText = (data.tcp.length)
            ? data.tcp[data.tcp.length - 1] // Último mensaje TCP
            : 'No hay mensajes TCP.';
    } catch (error) {
        console.error(error);
        errorMessage.innerText = 'Error al cargar los mensajes históricos: ' + error.message;
    }
}


// Conectar al WebSocket para mensajes en tiempo real
const ws = new WebSocket(wsUrl);

ws.onopen = () => {
    console.log('Conectado al servidor WebSocket.');
};

ws.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);

        if (data.type === 'tcp') {
            let messageText = 'Mensaje TCP: Empleado no registrado/Huella no reconocida';

            if (typeof data.data === 'object') {
                messageText = `Empleado: ${data.data.id} ${data.data.nombre} ${data.data.apellido} ${data.data.direccion}`;
                
                if (data.data.direccion) {
                    direccionesTCP.push(data.data.direccion);
                    actualizarListaDirecciones(); 
                }
            }

            // Actualizar ambos elementos tcpInput
            tcpInputs.forEach(el => el.innerText = messageText);
        } 
    } catch (error) {
        console.error('Error procesando el mensaje del WebSocket:', error);
    }
};

// Actualizar ambas listas de direcciones
function actualizarListaDirecciones() {
    tcpDirectionsList.forEach(container => {
        container.innerHTML = '';
        direccionesTCP.forEach((direccion, index) => {
            const item = document.createElement('p');
            item.textContent = `${index + 1}. ${direccion}`;
            container.appendChild(item);
        });
    });
}
   

ws.onerror = (error) => {
    console.error('Error en el WebSocket:', error);
};

ws.onclose = () => {
    console.warn('Conexión WebSocket cerrada.');
};

fetchMessages() 


const mapElement = document.getElementById('map');
const searchInput = document.getElementById('search');
let map = null;
let autocomplete = null;
let geocoder = null;
let socket = null;
let marcadores = []; // Array de marcadores en el mapa
let direccionesTCP = []; // Lista de direcciones recibidas
let permisoDenegado = false; // Rastrea si el permiso fue denegado

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
                const response = await fetch('/messages/tcp', {
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
        confirmButtonText: "Intentar de nuevo",
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


// Nueva función para dibujar todos los marcadores desde el JSON del servidor
async function dibujarMarcadores() {
    try {
        // Hacer una solicitud al servidor para obtener los mensajes TCP
        const response = await fetch(jsonUrl);
        if (!response.ok) throw new Error('Error al obtener las direcciones TCP');

        const data = await response.json();

        // Extraer todas las direcciones de los mensajes TCP
        const direcciones = data.rutasIA;

        // Si no hay direcciones, no hacemos nada
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
            // 📌 La dirección ya es lat/lng, la convertimos directamente
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
                resolve(null); // Evita que la función falle si no se puede geocodificar
            }
        });
    });
}

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
            title: direccion, // ✅ Mantiene el título con la dirección
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

// Asignar la función limpiarMapa al botón ya existente
document.getElementById('btnAPI').addEventListener('click', enviarDireccionesAFlask);
document.getElementById('btnLimpiar').addEventListener('click', limpiarMapa);
document.getElementById('btnDbus').addEventListener('click', obtenerUbicacionYAgregarATCP);

// Cargar el mapa
getApiKey();
