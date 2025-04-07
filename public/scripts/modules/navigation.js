// scripts/modules/navigation.js
import { procesarRuta } from './map-markers.js';
import { gestionarUbicacion } from './location.js';

let navigationInterval = null;

async function iniciarNavegacionConductor(rutaSeleccionada) {
    if (!window.map || !window.rutaSeleccionada || !rutaSeleccionada) {
        console.error("❌ Mapa o ruta seleccionada no disponible para navegación.");
        return;
    }

    // Configurar el mapa en vista 3D inclinada
    window.map.setTilt(45); // Inclinación para simular vista de conducción
    window.map.setHeading(0); // Orientación inicial (norte)

    // Obtener la ruta seleccionada
    const rutaData = rutaSeleccionada === "mejor_ruta_distancia" ? window.rutaDistancia : window.rutaTrafico;
    const color = rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';

    // Función para actualizar la navegación
    async function actualizarNavegacion() {
        // Obtener la ubicación actual del conductor
        await gestionarUbicacion(); // Actualiza window.ultimaUbicacionBus
        const origen = window.ultimaUbicacionBus;

        if (!origen || !origen.lat || !origen.lng) {
            console.warn("⚠️ Ubicación del conductor no disponible aún.");
            return;
        }

        // Limpiar rutas anteriores
        window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
        window.rutasDibujadas = [];

        // Usar DirectionsService para trazar la ruta desde la ubicación actual
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

        const waypoints = rutaData.slice(1, -1).map(direccion => ({ location: direccion, stopover: true }));
        const destino = rutaData[rutaData.length - 1];

        directionsService.route({
            origin: { lat: origen.lat, lng: origen.lng },
            destination: destino,
            waypoints: waypoints,
            travelMode: google.maps.TravelMode.DRIVING
        }, (result, status) => {
            if (status === google.maps.DirectionsStatus.OK) {
                directionsRenderer.setDirections(result);
                window.rutasDibujadas.push(directionsRenderer);

                // Centrar el mapa en la ubicación del conductor con inclinación
                window.map.setCenter({ lat: origen.lat, lng: origen.lng });
                window.map.setZoom(18); // Zoom cercano para vista de conducción
            } else {
                console.error("❌ Error al calcular ruta de navegación:", status);
            }
        });

        // Opcional: Activar Street View en la ubicación del conductor
        const streetView = window.map.getStreetView();
        streetView.setPosition({ lat: origen.lat, lng: origen.lng });
        streetView.setPov({ heading: 0, pitch: 0 }); // Orientación inicial
        streetView.setVisible(true); // Desactivado por defecto, actívalo manualmente si lo deseas
    }

    // Actualizar inmediatamente la primera vez
    await actualizarNavegacion();

    // Configurar intervalo para actualizar cada 10 segundos
    navigationInterval = setInterval(async () => {
        await actualizarNavegacion();
        console.log("✅ Navegación del conductor actualizada.");
    }, 10000); // 10 segundos
}

function detenerNavegacionConductor() {
    if (navigationInterval) {
        clearInterval(navigationInterval);
        navigationInterval = null;
        console.log("🚫 Navegación del conductor detenida.");
        
        // Restaurar vista normal del mapa
        window.map.setTilt(0);
        window.map.setZoom(13);
        const bounds = new google.maps.LatLngBounds();
        window.marcadores.forEach(marcador => bounds.extend(marcador.position));
        if (!bounds.isEmpty()) window.map.fitBounds(bounds);
    }
}

export { iniciarNavegacionConductor, detenerNavegacionConductor };