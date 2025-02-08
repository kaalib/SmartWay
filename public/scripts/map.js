// Obtén el elemento del mapa
const mapElement = document.getElementById('map');
let map = null;

// Función para obtener la API Key y cargar Google Maps
function getApiKey() {
    fetch('/api/getApiKey')
        .then(response => {
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (data.apiKey) {
                loadGoogleMapsApi(data.apiKey);
            } else {
                throw new Error('API Key no encontrada en la respuesta.');
            }
        })
        .catch(error => {
            console.error('Error al obtener la API Key:', error);
        });
}

// Carga el script de Google Maps
function loadGoogleMapsApi(apiKey) {
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap`;
    script.onerror = () => console.error('Error al cargar el script de Google Maps.');
    document.head.appendChild(script);
}

// Inicializa el mapa
function initMap() {
    if (!mapElement) {
        console.error('Elemento del mapa no encontrado.');
        return;
    }

    map = new google.maps.Map(mapElement, {
        center: { lat: 10.98, lng: -74.81 },
        zoom: 13,
        disableDefaultUI: true
    });
}

// Ejecuta la función para cargar el mapa
getApiKey();
