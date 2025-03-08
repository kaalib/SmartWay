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

// 🗺️ Obtener ubicación en texto y agregarla al JSON TCP
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
            const location = new google.maps.LatLng(latitude, longitude);

            try {
                const direccionUsuario = await geocodificarUbicacion(location);
                const ubicacionbus = { direccion: direccionUsuario };

                // Agregar al JSON `tcp`
                messages.tcp.unshift(ubicacionbus);

                // Guardar en archivo
                fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
                    if (err) console.error("❌ Error guardando en JSON:", err);
                });

                console.log("📍 Ubicación agregada al JSON TCP:", ubicacionbus);

                Swal.fire({
                    icon: "success",
                    title: "Ubicación obtenida",
                    text: `📌 ${direccionUsuario}`,
                    timer: 1500,
                    showConfirmButton: false
                });

            } catch (error) {
                Swal.fire({
                    icon: "warning",
                    title: "No se pudo obtener la dirección",
                    text: "Se obtuvo la ubicación, pero no la dirección exacta."
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

// 📍 Geocodificar ubicación a texto
function geocodificarUbicacion(location) {
    return new Promise((resolve, reject) => {
        geocoder.geocode({ location }, (results, status) => {
            if (status === "OK" && results[0]) {
                resolve(results[0].formatted_address);
            } else {
                reject("No se pudo determinar la dirección exacta.");
            }
        });
    });
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
    
    obtenerUbicacionUsuario(); // 🔹 Obtener ubicación del usuario al iniciar el mapa
    
}


// Nueva función para dibujar todos los marcadores desde el JSON del servidor
async function dibujarMarcadores() {
    try {
        // Hacer una solicitud al servidor para obtener los mensajes TCP
        const response = await fetch(jsonUrl);
        if (!response.ok) throw new Error('Error al obtener las direcciones TCP');

        const data = await response.json();

        // Extraer todas las direcciones de los mensajes TCP
        const direcciones = data.rutasIA

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

        // Contador para rastrear geocodificaciones completadas
        let geocodedCount = 0;
        const totalDirections = direcciones.length;

        // Geocodificar y dibujar todas las direcciones
        direcciones.forEach((direccion) => {
            geocodificarDireccion(direccion, (location, dir) => {
                agregarMarcador(location, dir, bounds); // Pasamos bounds explícitamente
                geocodedCount++;

                // Ajustar el mapa cuando todas las geocodificaciones estén listas
                if (geocodedCount === totalDirections) {
                    map.fitBounds(bounds);
                }
            });
        });

    } catch (error) {
        console.error('Error al dibujar los marcadores:', error);
    }
}


// Agregar marcador en el mapa (recibe bounds como parámetro)
function agregarMarcador(location, direccion, bounds) {
    const pin = new google.maps.marker.PinElement({
        glyph: `${marcadores.length + 1}`,
        glyphColor: '#FFFFFF',
        background: '#311b92',
        borderColor: '#FFFFFF',
        scale: 1.2
    });

    const marcador = new google.maps.marker.AdvancedMarkerElement({
        position: location instanceof google.maps.LatLng ? location : { lat: location.lat(), lng: location.lng() },
        map: map,
        title: direccion,
        content: pin.element
    });

    marcadores.push(marcador);
    bounds.extend(location); // Extendemos los límites con la ubicación
}

// Función para geocodificar direcciones (sin cambios)
function geocodificarDireccion(direccion, callback) {
    geocoder.geocode({ address: direccion }, (results, status) => {
        if (status === 'OK' && results[0]) {
            const location = results[0].geometry.location;
            callback(location, direccion);
        } else {
            console.error('Error en geocodificación:', status);
        }
    });
}


function limpiarMapa() {
    // Eliminar todos los marcadores del mapa
    marcadores.forEach(marcador => marcador.setMap(null));
    marcadores = [];

    // Vaciar la lista de direcciones
    direccionesTCP = [];

    // Seleccionar ambos elementos en desktop y mobile y dejarlos en blanco
    document.querySelectorAll("#tcpInput").forEach(el => el.innerHTML = "");
    document.querySelectorAll("#tcpDirections").forEach(el => el.innerHTML = "");

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
document.getElementById('btnMarkers').addEventListener('click', dibujarMarcadores);

// Cargar el mapa
getApiKey();
