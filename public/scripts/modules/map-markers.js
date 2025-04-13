// scripts/modules/map-markers.js
async function actualizarMapa(rutasIA) {
    if (!rutasIA) {
        console.warn("⚠️ rutasIA no proporcionado");
        return;
    }

    // No eliminar los marcadores de paradas aquí, solo los marcadores temporales
    window.marcadores.forEach(marcador => marcador.map = null);
    window.marcadores = [];
    window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
    window.rutasDibujadas = [];

    const bounds = new google.maps.LatLngBounds();

    if (window.rutaSeleccionada) {
        const ruta = rutasIA[window.rutaSeleccionada];
        const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
        const result = await procesarRuta(ruta, color, bounds);
        if (result?.renderer) {
            console.log("✅ Ruta seleccionada añadida a window.rutasDibujadas:", result.renderer);
        } else {
            console.warn("⚠️ No se pudo procesar la ruta seleccionada:", ruta);
        }
    } else {
        const promesas = [];
        if (rutasIA.mejor_ruta_distancia) {
            promesas.push(procesarRuta(rutasIA.mejor_ruta_distancia, '#00CC66', bounds));
        } else {
            console.warn("⚠️ mejor_ruta_distancia no disponible:", rutasIA.mejor_ruta_distancia);
        }
        if (rutasIA.mejor_ruta_trafico) {
            promesas.push(procesarRuta(rutasIA.mejor_ruta_trafico, '#FF9900', bounds));
        } else {
            console.warn("⚠️ mejor_ruta_trafico no disponible:", rutasIA.mejor_ruta_trafico);
        }
        const resultados = await Promise.all(promesas);
        resultados.forEach((result, index) => {
            if (result?.renderer) {
                console.log(`✅ Ruta ${index === 0 ? "distancia" : "tráfico"} añadida a window.rutasDibujadas:`, result.renderer);
            } else {
                console.warn(`⚠️ No se pudo procesar la ruta ${index === 0 ? "distancia" : "tráfico"}`);
            }
        });
    }

    if (!bounds.isEmpty()) {
        window.map.fitBounds(bounds);
        console.log("🗺️ Mapa ajustado a los límites:", bounds.toJSON());
    } else {
        console.warn("⚠️ Bounds vacíos, no se pudo ajustar el mapa");
    }

    console.log("📋 Estado final de window.rutasDibujadas:", window.rutasDibujadas);
}

async function procesarRuta(direcciones, color, bounds) {
    if (!direcciones || direcciones.length === 0) {
        console.warn("⚠️ Direcciones no proporcionadas o vacías:", direcciones);
        return null;
    }

    console.log("🖌️ Procesando ruta con direcciones:", direcciones, "y color:", color);
    const locations = await Promise.all(direcciones.map(async (direccion, index) => {
        const dir = typeof direccion === "object" && direccion.direccion ? direccion.direccion : direccion;
        const location = await geocodificarDireccion(dir);
        console.log(`📍 Geocodificado (${index}): ${dir} ->`, location?.toJSON());
        return location;
    }));

    const locationsFiltradas = locations.filter(loc => loc);
    console.log("📍 Ubicaciones filtradas:", locationsFiltradas.map(loc => loc?.toJSON()));

    if (locationsFiltradas.length < 2) {
        console.warn("⚠️ No hay suficientes ubicaciones válidas para dibujar la ruta:", locationsFiltradas);
        return null;
    }

    locationsFiltradas.forEach((location, index) => {
        const nombre = typeof direcciones[index] === "object" ? (direcciones[index].nombre || `Parada ${index + 1}`) : `Parada ${index + 1}`;
        agregarMarcador(location, nombre, bounds, index + 1);
    });

    const renderer = dibujarRutaConductor(locationsFiltradas, color);
    if (renderer) {
        console.log("✅ Renderer creado para la ruta:", renderer);
        return { locations: locationsFiltradas, renderer };
    } else {
        console.warn("⚠️ No se pudo crear el renderer para la ruta");
        return null;
    }
}

function geocodificarDireccion(direccion) {
    return new Promise((resolve) => {
        if (!direccion) {
            console.warn("⚠️ Dirección no proporcionada");
            return resolve(null);
        }

        if (typeof direccion === "string" && direccion.includes(",")) {
            const [lat, lng] = direccion.split(",").map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
                const location = new google.maps.LatLng(lat, lng);
                console.log(`📍 Coordenadas parseadas: ${direccion} ->`, location.toJSON());
                return resolve(location);
            }
        }

        window.geocoder.geocode({ address: direccion }, (results, status) => {
            if (status === "OK" && results[0]) {
                const location = results[0].geometry.location;
                console.log(`📍 Geocodificado con éxito: ${direccion} ->`, location.toJSON());
                resolve(location);
            } else {
                console.warn(`⚠️ No se pudo geocodificar: ${direccion}, status: ${status}`);
                resolve(null);
            }
        });
    });
}

function dibujarRutaConductor(locations, color) {
    if (locations.length < 2) {
        console.warn("⚠️ No hay suficientes ubicaciones para dibujar la ruta:", locations);
        return null;
    }

    console.log("🖌️ Dibujando ruta con ubicaciones:", locations.map(loc => loc.toJSON()), "y color:", color);
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

    const waypoints = locations.slice(1, -1).map(loc => ({ location: loc, stopover: true }));
    console.log("📍 Waypoints:", waypoints);

    directionsService.route({
        origin: locations[0],
        destination: locations[locations.length - 1],
        waypoints: waypoints,
        travelMode: google.maps.TravelMode.DRIVING
    }, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
            window.rutasDibujadas.push(directionsRenderer);
            console.log("✅ Ruta dibujada con éxito, añadida a window.rutasDibujadas:", directionsRenderer);
        } else {
            console.error("❌ Error al calcular ruta, status:", status);
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
    console.log(`🖌️ Marcador añadido: ${title} en`, location.toJSON());
}

function agregarMarcadorParada(item, index, bounds) {
    const direccionNormalizada = item.direccionNormalizada;
    if (!direccionNormalizada) {
        console.warn(`⚠️ No se pudo añadir marcador de parada ${item.id}: dirección normalizada no disponible`);
        return;
    }

    const marcador = new google.maps.marker.AdvancedMarkerElement({
        position: direccionNormalizada,
        map: window.map,
        title: item.nombre || `Parada ${index}`,
        content: crearMarcadorCirculo(index.toString())
    });

    window.paradaMarcadores[item.id] = marcador; // Usamos window.paradaMarcadores
    bounds.extend(direccionNormalizada);
    console.log(`🖌️ Marcador de parada ${item.id} añadido: ${item.nombre}`);
}

function eliminarMarcadorParada(paradaId) {
    const marcador = window.paradaMarcadores[paradaId];
    if (marcador) {
        marcador.map = null; // Eliminar del mapa
        delete window.paradaMarcadores[paradaId]; // Usamos delete porque window.paradaMarcadores es un objeto
        console.log(`🗑️ Marcador de parada ${paradaId} eliminado`);
    } else {
        console.warn(`⚠️ No se encontró marcador para la parada ${paradaId}`);
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
    Object.values(window.paradaMarcadores).forEach(marcador => {
        marcador.map = null;
    });
    window.paradaMarcadores = {}; // Reemplazamos el objeto para limpiarlo
    console.log("🗑️ Todos los marcadores de paradas limpiados");
}

export { actualizarMapa, procesarRuta, geocodificarDireccion, agregarMarcador, dibujarRutaConductor, crearMarcadorCirculo, agregarMarcadorParada, eliminarMarcadorParada, limpiarMarcadoresParadas };