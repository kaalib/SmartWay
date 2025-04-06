// Cálculo y visualización de rutas
import CONFIG from '../config.js';
import { agregarMarcador } from './map-markers.js';
import { geocodificarDireccion } from './location.js';
import { socket } from './socket.js';
import { solicitarReorganizacionRutas } from './api.js';

// Actualizar mapa con rutas
export async function actualizarMapa(rutasIA) {
    if (!rutasIA) return;

    window.marcadores.forEach(marcador => marcador.map = null);
    window.marcadores = [];
    window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
    window.rutasDibujadas = [];

    const bounds = new google.maps.LatLngBounds();

    if (window.rutaSeleccionada) {
        // Solo dibujar la ruta seleccionada
        const ruta = rutasIA[window.rutaSeleccionada];
        const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900'; // Verde y naranja
        await procesarRuta(ruta, color, bounds);
    } else {
        // Dibujar ambas rutas
        await Promise.all([
            procesarRuta(rutasIA.mejor_ruta_distancia, '#00CC66', bounds), // Verde
            procesarRuta(rutasIA.mejor_ruta_trafico, '#FF9900', bounds)    // Naranja
        ]);
    }

    if (!bounds.isEmpty()) {
        window.map.fitBounds(bounds);
    }
}

// Procesar una ruta
export async function procesarRuta(direcciones, color, bounds) {
    if (!direcciones || direcciones.length === 0) return;

    const locations = await Promise.all(direcciones.map(geocodificarDireccion));
    
    // Agregar marcadores con números incrementales
    locations.forEach((location, index) => {
        if (location) {
            agregarMarcador(location, `Parada ${index + 1}`, bounds, index + 1, '#0066CC'); // Color azul para todos los marcadores
        }
    });

    if (locations.length > 1) {
        const renderer = dibujarRutaConductor(locations, color);
        return { locations, renderer };
    }
    return null;
}

// Dibujar ruta con flechas
export function dibujarRutaConductor(locations, color) {
    if (locations.length < 2) return null;

    const directionsService = new google.maps.DirectionsService();
    const directionsRenderer = new google.maps.DirectionsRenderer({
        map: window.map,
        suppressMarkers: true,
        polylineOptions: {
            strokeColor: color,
            strokeOpacity: 0.8,
            strokeWeight: 5,
            icons: [{
                icon: {
                    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                    scale: 4,
                    strokeColor: color,
                    strokeWeight: 2,
                    fillOpacity: 1
                },
                offset: "0%",
                repeat: "100px"
            }]
        }
    });

    directionsService.route({
        origin: locations[0],
        destination: locations[locations.length - 1],
        waypoints: locations.slice(1, -1).map(loc => ({ location: loc, stopover: true })),
        travelMode: google.maps.TravelMode.DRIVING
    }, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
            window.rutasDibujadas.push(directionsRenderer);
        } else {
            console.error("❌ Error al calcular ruta:", status);
        }
    });

    return directionsRenderer;
}

// Actualizar ruta seleccionada
export async function actualizarRutaSeleccionada() {
    if (!window.rutaSeleccionada) return;

    const rutaData = window.rutaSeleccionada === "mejor_ruta_distancia" ? window.rutaDistancia : window.rutaTrafico;
    const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900'; // Verde y naranja

    window.marcadores.forEach(marcador => marcador.map = null);
    window.marcadores = [];
    window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
    window.rutasDibujadas = [];

    const bounds = new google.maps.LatLngBounds();
    const processedRuta = await procesarRuta(rutaData, color, bounds);

    if (!bounds.isEmpty()) {
        window.map.fitBounds(bounds);
    }

    socket.emit("actualizar_ruta_seleccionada", {
        ruta: window.rutaSeleccionada,
        locations: processedRuta ? processedRuta.locations : []
    });
}

// Iniciar actualización periódica
export function iniciarActualizacionRuta() {
    if (window.intervalID) clearInterval(window.intervalID);
    
    // Solicitar actualización inmediata
    solicitarReorganizacionRutas();
    
    // Configurar intervalo para solicitar actualizaciones cada 20 segundos
    window.intervalID = setInterval(() => {
        solicitarReorganizacionRutas();
        actualizarRutaSeleccionada();
    }, 20000); // 20 segundos
    
    console.log("✅ Actualización de ruta iniciada cada 20 segundos.");
}

// Detener actualización
export function detenerActualizacionRuta() {
    if (window.intervalID) {
        clearInterval(window.intervalID);
        window.intervalID = null;
        console.log("🚫 Actualización de ruta detenida.");
    }
}