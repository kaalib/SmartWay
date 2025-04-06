// scripts/modules/map-init.js
function getApiKey() {
    return fetch('/api/getApiKey')
        .then(response => response.json())
        .then(data => data.apiKey || Promise.reject('API Key no encontrada'))
        .catch(error => {
            console.error('Error al obtener la API Key:', error);
            throw error;
        });
}

async function loadGoogleMapsApi() {
    const apiKey = await getApiKey();
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker&callback=initMap`;
    script.onerror = () => console.error('Error al cargar Google Maps.');
    document.head.appendChild(script);
}

function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.error('Elemento del mapa no encontrado.');
        return;
    }

    console.log('Inicializando el mapa...');
    window.map = new google.maps.Map(mapElement, {
        center: { lat: 10.9804, lng: -74.81 },
        zoom: 14,
        disableDefaultUI: true,
        mapId: 'a8e469502b0f35f7'
    });

    window.geocoder = new google.maps.Geocoder();
}

export { loadGoogleMapsApi, initMap };