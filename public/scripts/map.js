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

// Conectar con WebSocket para recibir ubicaciones
function conectarWebSocket() {
    socket = new WebSocket('wss://3.84.149.254:443'); 

    socket.onmessage = (event) => {
        try {
            const mensaje = JSON.parse(event.data);
            if (mensaje.type === 'tcp' && mensaje.data.direccion) {
                console.log('Dirección recibida:', mensaje.data.direccion);
                geocodificarDireccion(mensaje.data.direccion);
            }
        } catch (error) {
            console.error('Error al procesar mensaje WebSocket:', error);
        }
    };

    socket.onerror = (error) => console.error('Error WebSocket:', error);
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
