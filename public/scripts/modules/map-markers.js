// scripts/modules/map-markers.js
let paradaMarcadores = new Map(); // Almacenar marcadores de paradas por ID

async function actualizarMapa(rutasIA) {
    if (!rutasIA) return;

    // No eliminar los marcadores de paradas aquí, solo los marcadores temporales
    window.marcadores.forEach(marcador => marcador.map = null);
    window.marcadores = [];
    window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
    window.rutasDibujadas = [];

    const bounds = new google.maps.LatLngBounds();

    if (window.rutaSeleccionada) {
        const ruta = rutasIA[window.rutaSeleccionada];
        const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
        await procesarRuta(ruta, color, bounds);
    } else {
        await Promise.all([
            procesarRuta(rutasIA.mejor_ruta_distancia, '#00CC66', bounds),
            procesarRuta(rutasIA.mejor_ruta_trafico, '#FF9900', bounds)
        ]);
    }

    if (!bounds.isEmpty()) {
        window.map.fitBounds(bounds);
    }
}

async function procesarRuta(direcciones, color, bounds) {
    if (!direcciones || direcciones.length === 0) return;

    const locations = await Promise.all(direcciones.map(async (direccion) => {
        const location = await geocodificarDireccion(direccion);
        return location;
    }));

    locations.filter(loc => loc).forEach((location, index) => {
        const nombre = direcciones[index].nombre || `Parada ${index + 1}`;
        agregarMarcador(location, nombre, bounds, index + 1);
    });

    if (locations.length > 1) {
        const renderer = dibujarRutaConductor(locations.filter(loc => loc), color);
        return { locations: locations.filter(loc => loc), renderer };
    }
    return null;
}

function geocodificarDireccion(direccion) {
    return new Promise((resolve) => {
        if (!direccion) return resolve(null);

        if (typeof direccion === "string" && direccion.includes(",")) {
            const [lat, lng] = direccion.split(",").map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
                resolve(new google.maps.LatLng(lat, lng));
                return;
            }
        }

        window.geocoder.geocode({ address: direccion }, (results, status) => {
            if (status === "OK" && results[0]) {
                resolve(results[0].geometry.location);
            } else {
                console.warn(`⚠️ No se pudo geocodificar: ${direccion}`);
                resolve(null);
            }
        });
    });
}

function dibujarRutaConductor(locations, color) {
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

function agregarMarcador(location, title, bounds, label) {
    const marcador = new google.maps.marker.AdvancedMarkerElement({
        position: location,
        map: window.map,
        title: title,
        content: crearMarcadorCirculo(label)
    });
    window.marcadores.push(marcador);
    bounds.extend(location);
}

function agregarMarcadorParada(item, index, bounds) {
    const direccionNormalizada = item.direccionNormalizada; // Esto se pasará desde actualizarMapaConRutaSeleccionada
    if (!direccionNormalizada) return;

    const marcador = new google.maps.marker.AdvancedMarkerElement({
        position: direccionNormalizada,
        map: window.map,
        title: item.nombre || `Parada ${index}`,
        content: crearMarcadorCirculo(index.toString())
    });

    paradaMarcadores.set(item.id, marcador);
    bounds.extend(direccionNormalizada);
    console.log(`🖌️ Marcador de parada ${item.id} añadido: ${item.nombre}`);
}

function eliminarMarcadorParada(paradaId) {
    const marcador = paradaMarcadores.get(paradaId);
    if (marcador) {
        marcador.map = null; // Eliminar del mapa
        paradaMarcadores.delete(paradaId);
        console.log(`🗑️ Marcador de parada ${paradaId} eliminado`);
    }
}

function crearMarcadorCirculo(label) {
    const div = document.createElement("div");
    div.style.width = "24px";
    div.style.height = "24px";
    div.style.backgroundColor = "#0000FF";
    div.style.borderRadius = "50%";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div.style.color = "white";
    div.style.fontSize = "12px";
    div.style.fontWeight = "bold";
    div.textContent = label.toString();
    return div;
}

function limpiarMarcadoresParadas() {
    paradaMarcadores.forEach(marcador => {
        marcador.map = null;
    });
    paradaMarcadores.clear();
    console.log("🗑️ Todos los marcadores de paradas limpiados");
}


export { actualizarMapa, procesarRuta, geocodificarDireccion, agregarMarcador, dibujarRutaConductor, crearMarcadorCirculo, agregarMarcadorParada, eliminarMarcadorParada, limpiarMarcadoresParadas };