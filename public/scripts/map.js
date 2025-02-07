// Obtén el elemento del mapa
const mapElement = document.getElementById('map');
let map = null;

// Función para obtener la API Key y cargar Google Maps
function getApiKey() {
    fetch('/api/getApiKey')
        .then(response => response.json())
        .then(data => {
            loadGoogleMapsApi(data.apiKey);
        })
        .catch(error => {
            console.error('Error getting API key:', error);
        });
}

// Carga el script de Google Maps
function loadGoogleMapsApi(apiKey) {
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&libraries=maps&v=beta`;
    document.head.appendChild(script);
}

// Inicializa el mapa
function initMap() {
    map = new google.maps.Map(mapElement, {
        center: { lat: 10.98, lng: -74.81 },
        zoom: 13,
        disableDefaultUI: true
    });
}

// Ejecuta la función para cargar el mapa
getApiKey();
