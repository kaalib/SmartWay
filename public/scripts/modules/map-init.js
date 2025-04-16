// scripts/modules/map-init.js
import CONFIG from '../config.js';

async function getApiKey() {
    // Si estamos en local y hay una clave en CONFIG, usarla
    if (CONFIG.GOOGLE_MAPS_API_KEY && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")) {
        console.log("Usando clave local de CONFIG:", CONFIG.GOOGLE_MAPS_API_KEY);
        return CONFIG.GOOGLE_MAPS_API_KEY;
    }

    // En la nube, obtener la clave del servidor
    try {
        const response = await fetch('/api/getApiKey');
        const data = await response.json();
        return data.apiKey;
    } catch (error) {
        console.error("Error al obtener la API Key desde el servidor:", error);
        return null;
    }
}

async function loadGoogleMapsApi() {
    return new Promise((resolve, reject) => {
        // Verificar si la API ya está cargada
        if (window.google && window.google.maps) {
            resolve();
            return;
        }

        // Obtener la clave de la API
        getApiKey().then(apiKey => {
            if (!apiKey) {
                reject(new Error("No se pudo obtener la clave de la API de Google Maps"));
                return;
            }

            // Crear el script de Google Maps
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker&callback=initMap`;
            script.async = true;
            script.defer = true;
            script.onerror = () => reject(new Error("Error al cargar Google Maps"));

            // Definir initMap como una función global
            window.initMap = function() {
                resolve();
            };

            document.head.appendChild(script);
        }).catch(reject);
    });
}

function initMap() {
    console.log("Inicializando el mapa...");

    // Inicializar el mapa
    window.map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 10.9878, lng: -74.7889 }, // Coordenadas por defecto (Barranquilla, Colombia)
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        mapId: 'a8e469502b0f35f7',
        styles: [
            {
                featureType: "poi",
                stylers: [{ visibility: "off" }]
            }
        ]
    });

    // Inicializar el geocodificador
    window.geocoder = new google.maps.Geocoder();

    // Inicializar marcadores y rutas
    window.marcadores = {
        bus: null,      // Marcador único para el bus
        empleados: [],  // Array para marcadores de empleados
        destino: null   // Marcador único para el destino (si lo usas)
    };
    window.rutasDibujadas = []; // Array para las rutas dibujadas

    console.log("✅ Mapa y estructuras globales inicializadas:", {
        marcadores: window.marcadores,
        rutasDibujadas: window.rutasDibujadas
    });
}

export { loadGoogleMapsApi, initMap };