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
let permisoDenegado = false; // Variable para rastrear si el permiso fue denegado

// Función para obtener la ubicación del usuario
function obtenerUbicacionUsuario() {
    if (!navigator.geolocation) {
        Swal.fire({
            icon: "error",
            title: "Geolocalización no disponible",
            text: "Tu navegador no soporta la geolocalización."
        });
        return;
    }

    // Si ya se denegó el permiso, no volver a pedirlo automáticamente
    if (permisoDenegado) {
        mostrarAlertaPermisoDenegado();
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            const userLocation = new google.maps.LatLng(latitude, longitude);

            geocoder.geocode({ location: userLocation }, (results, status) => {
                if (status === "OK" && results[0]) {
                    const direccionUsuario = results[0].formatted_address;
                    direccionesTCP.unshift(direccionUsuario);
                    tcpInput.value = direccionesTCP.join("\n");
                    agregarMarcador(userLocation, "📍 Punto de partida");

                    Swal.fire({
                        icon: "success",
                        title: "Ubicación obtenida",
                        timer: 1000,
                        showConfirmButton: false
                    });
                } else {
                    Swal.fire({
                        icon: "warning",
                        title: "No se pudo obtener la dirección",
                        text: "La ubicación se obtuvo, pero no se pudo determinar la dirección exacta."
                    });
                }
            });
        },
        (error) => {
            if (error.code === error.PERMISSION_DENIED) {
                permisoDenegado = true; // Marcar que el permiso fue denegado
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

// Función para mostrar la alerta de permiso denegado solo una vez
function mostrarAlertaPermisoDenegado() {
    Swal.fire({
        icon: "error",
        title: "Acceso denegado",
        text: "Has denegado el acceso a tu ubicación. Si deseas permitirlo ajusta los permisos en la configuración de tu navegador.",
        showCancelButton: true,
        cancelButtonText: "Salir"
    }).then((result) => {
        if (result.isConfirmed) {
            permisoDenegado = false; // Resetear el estado para intentar de nuevo
            obtenerUbicacionUsuario(); // Volver a pedir la ubicación
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


// Nueva función para dibujar todos los marcadores
function dibujarMarcadores() {
    // Limpiar marcadores previos
    marcadores.forEach(marcador => marcador.setMap(null));
    marcadores = [];

    // Crear un objeto LatLngBounds para abarcar todos los marcadores
    const bounds = new google.maps.LatLngBounds();

    // Si no hay direcciones, no hacemos nada
    if (direccionesTCP.length === 0) {
        console.log('No hay direcciones para dibujar.');
        return;
    }

    // Contador para rastrear geocodificaciones completadas
    let geocodedCount = 0;
    const totalDirections = direccionesTCP.length;

    // Geocodificar y dibujar todas las direcciones
    direccionesTCP.forEach((direccion) => {
        geocodificarDireccion(direccion, (location, dir) => {
            agregarMarcador(location, dir, bounds); // Pasamos bounds explícitamente
            geocodedCount++;

            // Ajustar el mapa cuando todas las geocodificaciones estén listas
            if (geocodedCount === totalDirections) {
                map.fitBounds(bounds);
            }
        });
    });
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


// Función para limpiar el mapa y la lista de direcciones
function limpiarMapa() {
    // Eliminar todos los marcadores del mapa
    marcadores.forEach(marcador => marcador.setMap(null));
    marcadores = [];

    // Vaciar la lista de direcciones
    direccionesTCP = [];
    
    // Seleccionar ambos elementos en desktop y mobile y dejarlos en blanco
    document.querySelectorAll("#tcpInput").forEach(el => el.innerHTML = "");
    document.querySelectorAll("#tcpDirections").forEach(el => el.innerHTML = "");

}
// Asignar la función limpiarMapa al botón ya existente
document.getElementById('btnLimpiar').addEventListener('click', limpiarMapa);
document.getElementById('btnMarkers').addEventListener('click', dibujarMarcadores);

// Cargar el mapa
getApiKey();
