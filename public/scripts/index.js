const jsonUrl = 'http://3.84.149.254/messages'; // Cambiar por la IP de tu servidor
const wsUrl = 'wss://3.84.149.254:443'; // WebSocket en tu instancia EC2

const tcpInput = document.getElementById('tcpInput');
const udpInput = document.getElementById('udpInput');
const tcpDirections = document.getElementById('tcpDirections'); // Div donde irán las direcciones

// Cargar mensajes históricos desde /messages
async function fetchMessages() {
    try {
        const response = await fetch(jsonUrl);
        if (!response.ok) throw new Error('Error al cargar el archivo JSON');

        const data = await response.json();
        tcpInput.innerText = (data.tcp && data.tcp.length)
            ? data.tcp[data.tcp.length - 1] // Último mensaje TCP
            : 'No hay mensajes TCP.';
        udpInput.innerText = (data.udp && data.udp.length)
            ? data.udp[data.udp.length - 1] // Último mensaje UDP
            : 'No hay mensajes UDP.';
        errorMessage.innerText = '';
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
    errorMessage.innerText = 'Conexión WebSocket cerrada.';
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
        zoom: 13,
        disableDefaultUI: true
    });

    geocoder = new google.maps.Geocoder(); // Inicializar Geocoder

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
    tcpInput.value = ``;
    tcpDirections.innerHTML = ``;

}
// Asignar la función limpiarMapa al botón ya existente
document.getElementById('btnLimpiar').addEventListener('click', limpiarMapa);

// Cargar el mapa
getApiKey();
