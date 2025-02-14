const jsonUrl = 'https://3.84.149.254/messages'; // IP de tu servidor
const wsUrl = 'wss://3.84.149.254:443'; // WebSocket en la instancia EC2

const tcpInput = document.getElementById('tcpInput');
const mapElement = document.getElementById('map');
const searchInput = document.getElementById('search');

let map = null;
let autocomplete = null;
let geocoder = null;
let socket = null;

// 🔹 1. Conectar al WebSocket para recibir mensajes en tiempo real
function conectarWebSocket() {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => console.log('✅ Conectado al WebSocket.');
    socket.onerror = (error) => console.error('❌ Error WebSocket:', error);
    socket.onclose = () => console.warn('⚠️ Conexión WebSocket cerrada.');
    
    socket.onmessage = (event) => {
        try {
            const { type, message } = JSON.parse(event.data);
            if (type === 'tcp') {
                tcpInput.innerText = message;
            } else if (type === 'ubicacion' && message.direccion) {
                console.log('📍 Dirección recibida:', message.direccion);
                geocodificarDireccion(message.direccion);
            }
        } catch (error) {
            console.error('⚠️ Error procesando el mensaje WebSocket:', error);
        }
    };
}

// 🔹 2. Obtener API Key para Google Maps
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

// 🔹 3. Cargar Google Maps API
function loadGoogleMapsApi(apiKey) {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initMap`;
    script.async = true;
    script.defer = true;
    script.onerror = () => console.error('Error al cargar Google Maps.');
    document.head.appendChild(script);
}

// 🔹 4. Inicializar el mapa y Autocomplete
function initMap() {
    if (!mapElement) {
        console.error('❌ Elemento del mapa no encontrado.');
        return;
    }

    map = new google.maps.Map(mapElement, {
        center: { lat: 10.9804, lng: -74.81 },
        zoom: 13,
        disableDefaultUI: true
    });

    geocoder = new google.maps.Geocoder();

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
        console.error('❌ Campo de búsqueda no encontrado.');
    }
}

// 🔹 Convertir dirección en coordenadas y agregar marcador en el mapa
function geocodificarDireccion(direccion) {
    geocoder.geocode({ address: direccion }, (results, status) => {
        if (status === 'OK' && results[0]) {
            const location = results[0].geometry.location;
            
            new google.maps.Marker({
                position: location,
                map,
                title: direccion
            });

            map.setCenter(location);
            map.setZoom(15);
        } else {
            console.error('❌ Error en geocodificación:', status);
        }
    });
}


// 🔹 7. Ejecutar funciones necesarias al cargar la página
getApiKey();
conectarWebSocket();
