const jsonUrl = 'http://3.84.149.254/messages'; // Cambiar por la IP de tu servidor
const wsUrl = 'wss://3.84.149.254:443'; // WebSocket en tu instancia EC2

const tcpInput = document.getElementById('tcpInput');
const udpInput = document.getElementById('udpInput');

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
                // Mostrar la información en el texto
                tcpInput.innerText = `Empleado: ${data.data.id} ${data.data.nombre} ${data.data.apellido} ${data.data.direccion}`;

                // Llamar a la función para geocodificar la dirección y agregarla al mapa
                if (geocoder && data.data.direccion) {
                    geocodificarDireccion(data.data.direccion);
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
            componentRestrictions: { country: 'CO' },
            fields: ['geometry', 'formatted_address']
        });

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (!place.geometry) return;

            agregarMarcador(place.geometry.location, place.formatted_address);
        });
    } else {
        console.error('Campo de búsqueda no encontrado.');
    }

    conectarWebSocket();
}

// Función para agregar marcador en el mapa
function agregarMarcador(location, direccion) {
    new google.maps.Marker({
        position: location,
        map,
        title: direccion
    });

    map.setCenter(location);
    map.setZoom(15);
}



// Convertir dirección en coordenadas y agregar marcador
function geocodificarDireccion(direccion) {
    geocoder.geocode({ address: direccion }, (results, status) => {
        if (status === 'OK' && results[0]) {
            agregarMarcador(results[0].geometry.location, direccion);
        } else {
            console.error('Error en geocodificación:', status);
        }
    });
}

// Cargar el mapa
getApiKey();
