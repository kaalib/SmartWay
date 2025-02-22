import Swal from 'sweetalert2';

const jsonUrl = 'https://smartway.ddns.net/messages'; // Cambiar por la IP de tu servidor
const wsUrl = 'wss://3.84.149.254'; // WebSocket en tu instancia EC2

const tcpInput = document.getElementById('tcpInput');
const tcpDirections = document.getElementById('tcpDirections'); // Div donde irán las direcciones

//funcion para slider
document.addEventListener("DOMContentLoaded", function () {
    const sidebar = document.querySelector(".sidebar");
    const openBtn = document.querySelector(".menu-icon"); // Asegúrate de tener un botón para abrir
    const closeBtn = document.querySelector(".close-btn");

    function openSidebar() {
        sidebar.style.width = "250px"; // Ajusta el ancho que usas para abrir el sidebar
    }

    function closeSidebar() {
        sidebar.style.width = "0";
    }

    openBtn.addEventListener("click", openSidebar);
    closeBtn.addEventListener("click", closeSidebar);

    // Cerrar al hacer clic fuera del sidebar
    document.addEventListener("click", function (event) {
        if (!sidebar.contains(event.target) && !openBtn.contains(event.target)) {
            closeSidebar();
        }
    });
});



// Conectar al WebSocket para mensajes en tiempo real
const ws = new WebSocket(wsUrl);

ws.onopen = () => {
    console.log('Conectado al servidor WebSocket.');
};

ws.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);

        if (data.type === 'tcp') {
            if (typeof data.data === 'object') {
                // Mostrar la información en el message-box
                tcpInput.innerText = `Empleado: ${data.data.id} ${data.data.nombre} ${data.data.apellido} ${data.data.direccion}`;

                // Agregar dirección a la lista y actualizar en el message-box
                if (geocoder && data.data.direccion) {
                    geocodificarDireccion(data.data.direccion);
                    direccionesTCP.push(data.data.direccion);
                    actualizarListaDirecciones(); // Llamar a la función de actualización
                }
            } else {
                tcpInput.innerText = `Mensaje TCP: ${data.data}`;
            }
        } else if (data.type === 'udp') {
            udpInput.innerText = `Mensaje UDP: ${data.message}`;
        }
    } catch (error) {
        console.error('Error procesando el mensaje del WebSocket:', error);
    }
};

// Función para actualizar la lista de direcciones en tcpdirections
function actualizarListaDirecciones() {
    tcpDirections.innerHTML = ''; // Limpiar el div antes de agregar nuevas direcciones
    direccionesTCP.forEach((direccion, index) => {
        const item = document.createElement('p'); // Crear un párrafo en vez de <li>
        item.textContent = `${index + 1}. ${direccion}`;
        tcpDirections.appendChild(item);
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


// Función para obtener la ubicación del usuario
function obtenerUbicacionUsuario() {
    if (!navigator.geolocation) {
        Swal.fire({
            icon: "error",
            title: "Geolocalización no disponible",
            text: "Tu navegador no soporta la geolocalización.",
        });
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            const userLocation = new google.maps.LatLng(latitude, longitude);

            // Geocodificar ubicación
            geocoder.geocode({ location: userLocation }, (results, status) => {
                if (status === "OK" && results[0]) {
                    const direccionUsuario = results[0].formatted_address;

                    // Agregar la dirección del usuario como primer elemento en la lista
                    direccionesTCP.unshift(direccionUsuario);

                    // Mostrar en el input de direcciones
                    tcpInput.value = direccionesTCP.join("\n");

                    // Agregar marcador en el mapa
                    agregarMarcador(userLocation, "📍 Punto de partida");

                    Swal.fire({
                        icon: "success",
                        title: "Ubicación obtenida",
                        text: `Tu ubicación: ${direccionUsuario}`,
                        timer: 2000,
                        showConfirmButton: false
                    });
                } else {
                    Swal.fire({
                        icon: "warning",
                        title: "No se pudo obtener la dirección",
                        text: "La ubicación se obtuvo, pero no se pudo determinar la dirección exacta.",
                    });
                }
            });
        },
        (error) => {
            if (error.code === error.PERMISSION_DENIED) {
                Swal.fire({
                    icon: "error",
                    title: "Acceso denegado",
                    text: "Has denegado el acceso a tu ubicación. Para activarlo, recarga la página y permite el acceso.",
                    confirmButtonText: "Recargar",
                }).then(() => {
                    location.reload(); // Recargar la página para volver a pedir permisos
                });
            } else {
                Swal.fire({
                    icon: "error",
                    title: "Error al obtener ubicación",
                    text: `Ocurrió un error: ${error.message}`,
                });
            }
        }
    );
}

// Llamar a la función cuando se cargue la página
document.addEventListener("DOMContentLoaded", obtenerUbicacionUsuario);


// Obtener API Key y cargar Google Maps
function getApiKey() {
    fetch('/api/getApiKey')
        .then(response => response.json())
        .then(data => {
            if (data.apiKey) {
                loadGoogleMapsApi(data.apiKey);
            } else {
                throw new Error('API Key no encontrada.');
            }
        })
        .catch(error => console.error('Error al obtener la API Key:', error));
}

// Cargar script de Google Maps con Places y Geocoder
function loadGoogleMapsApi(apiKey) {
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initMap`;
    script.onerror = () => console.error('Error al cargar Google Maps.');
    document.head.appendChild(script);
}

// Inicializar el mapa y Autocomplete
function initMap() {
    if (!mapElement) {
        console.error('Elemento del mapa no encontrado.');
        return;
    }

    map = new google.maps.Map(mapElement, {
        center: { lat: 10.9804, lng: -74.81 },
        zoom: 14,
        disableDefaultUI: true
    });

    geocoder = new google.maps.Geocoder(); // Inicializar Geocoder
    
    obtenerUbicacionUsuario(); // 🔹 Obtener ubicación del usuario al iniciar el mapa
    
    if (searchInput) {
        autocomplete = new google.maps.places.Autocomplete(searchInput, {
            componentRestrictions: { country: 'CO' }, // Restringe a Colombia
            fields: ['geometry', 'formatted_address', 'address_components']
        });
    
        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (!place.geometry) return;
    
            // Filtrar por departamento (Ejemplo: Atlántico)
            const departamentoPermitido = "Atlántico"; // Cambia esto por el departamento que deseas
    
            // Buscar el departamento en address_components
            const departamento = place.address_components.find(component =>
                component.types.includes('administrative_area_level_1')
            );
    
            if (departamento && departamento.long_name === departamentoPermitido) {
                agregarMarcador(place.geometry.location, place.formatted_address);
            } else {
                alert("⚠️ Solo puedes seleccionar ubicaciones en " + departamentoPermitido);
            }
        });
    } else {
        console.error('Campo de búsqueda no encontrado.');
    }
    

    conectarWebSocket();
}

// Función para geocodificar direcciones y agregar marcadores
function geocodificarDireccion(direccion) {
    geocoder.geocode({ address: direccion }, (results, status) => {
        if (status === 'OK' && results[0]) {
            agregarMarcador(results[0].geometry.location, direccion);
        } else {
            console.error('Error en geocodificación:', status);
        }
    });
}

// Agregar marcador en el mapa
function agregarMarcador(location, direccion) {
    const marcador = new google.maps.Marker({
        position: location,
        map,
        title: direccion
    });

    marcadores.push(marcador);
    map.setCenter(location);
}


// Función para limpiar el mapa y la lista de direcciones
function limpiarMapa() {
    // Eliminar todos los marcadores del mapa
    marcadores.forEach(marcador => marcador.setMap(null));
    marcadores = [];

    // Vaciar la lista de direcciones
    direccionesTCP = [];
    tcpInput.innerHTML = ``;
    tcpDirections.innerHTML = ``;

}
// Asignar la función limpiarMapa al botón ya existente
document.getElementById('btnLimpiar').addEventListener('click', limpiarMapa);

// Cargar el mapa
getApiKey();
