// scripts/modules/map-markers.js
async function actualizarMapa(rutasIA) {
    if (!rutasIA) {
        console.warn("⚠️ rutasIA no proporcionado");
        return;
    }

    const bounds = new google.maps.LatLngBounds();

    if (window.rutaSeleccionada) {
        const ruta = rutasIA[window.rutaSeleccionada];
        const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';

        // Procesar la ruta seleccionada
        const result = await procesarRuta(ruta, color, bounds);
        if (result?.renderer) {
            // Si ya existe una ruta dibujada, la actualizamos
            if (window.rutasDibujadas.length > 0) {
                const existingRenderer = window.rutasDibujadas[0];
                existingRenderer.setOptions({
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

                const directionsService = new google.maps.DirectionsService();
                directionsService.route({
                    origin: result.locations[0],
                    destination: result.locations[result.locations.length - 1],
                    waypoints: result.locations.slice(1, -1).map(loc => ({ location: loc, stopover: true })),
                    travelMode: google.maps.TravelMode.DRIVING
                }, (res, status) => {
                    if (status === google.maps.DirectionsStatus.OK) {
                        existingRenderer.setDirections(res);
                        console.log("✅ Ruta seleccionada actualizada suavemente:", color);
                    } else {
                        console.error("❌ Error al actualizar ruta seleccionada:", status);
                    }
                });
            } else {
                window.rutasDibujadas = [result.renderer];
                console.log("✅ Nueva ruta seleccionada dibujada:", color);
            }
        }
    } else {
        // Mostrar ambas rutas (distancia y tráfico)
        const promesas = [];
        if (rutasIA.mejor_ruta_distancia) {
            promesas.push(procesarRuta(rutasIA.mejor_ruta_distancia, '#00CC66', bounds));
        }
        if (rutasIA.mejor_ruta_trafico) {
            promesas.push(procesarRuta(rutasIA.mejor_ruta_trafico, '#FF9900', bounds));
        }

        const resultados = await Promise.all(promesas);

        // Actualizar o dibujar las rutas
        resultados.forEach((result, index) => {
            if (result?.renderer) {
                const color = index === 0 ? '#00CC66' : '#FF9900';
                if (window.rutasDibujadas[index]) {
                    const existingRenderer = window.rutasDibujadas[index];
                    existingRenderer.setOptions({
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

                    const directionsService = new google.maps.DirectionsService();
                    directionsService.route({
                        origin: result.locations[0],
                        destination: result.locations[result.locations.length - 1],
                        waypoints: result.locations.slice(1, -1).map(loc => ({ location: loc, stopover: true })),
                        travelMode: google.maps.TravelMode.DRIVING
                    }, (res, status) => {
                        if (status === google.maps.DirectionsStatus.OK) {
                            existingRenderer.setDirections(res);
                            console.log(`✅ Ruta ${index === 0 ? "distancia" : "tráfico"} actualizada suavemente:`, color);
                        } else {
                            console.error(`❌ Error al actualizar ruta ${index === 0 ? "distancia" : "tráfico"}:`, status);
                        }
                    });
                } else {
                    window.rutasDibujadas[index] = result.renderer;
                    console.log(`✅ Nueva ruta ${index === 0 ? "distancia" : "tráfico"} dibujada:`, color);
                }
            }
        });
    }

    //if (!bounds.isEmpty()) {
    //    window.map.fitBounds(bounds);
    //    console.log("🗺️ Mapa ajustado a los límites:", bounds.toJSON());
    //}
}

async function procesarRuta(direcciones, color, bounds) {
    if (!direcciones || direcciones.length === 0) {
        console.warn("⚠️ Direcciones vacías o no proporcionadas");
        return null;
    }

    const locations = await Promise.all(direcciones.map(async (entry, index) => {
        // Manejar tanto objetos como strings
        const direccion = typeof entry === "string" ? entry : entry.direccion;
        if (!direccion) {
            console.warn(`⚠️ Dirección no válida en la posición ${index}:`, entry);
            return null;
        }

        const location = await geocodificarDireccion(direccion);
        if (location) {
            // Crear o actualizar marcadores solo para las paradas (excluyendo origen y destino)
            if (index > 0 && index < direcciones.length - 1) {
                const nombre = typeof entry === "string" ? `Parada ${index}` : (entry.nombre || `Parada ${index}`);
                agregarMarcador(location, nombre, bounds, index);
            }
        } else {
            console.warn(`⚠️ No se pudo obtener ubicación para: ${direccion}`);
        }
        return location; // Devuelve LatLng o null
    }));

    const validLocations = locations.filter(loc => loc);
    if (validLocations.length < 2) {
        console.warn("⚠️ No hay suficientes ubicaciones válidas para dibujar la ruta. Ubicaciones válidas:", validLocations);
        // Intentar continuar con las ubicaciones disponibles, si hay al menos 1
        if (validLocations.length === 1) {
            console.log("ℹ️ Solo hay una ubicación válida, no se dibujará una ruta, pero se mostrará el marcador.");
            const nombre = typeof direcciones[0] === "string" ? "Punto único" : (direcciones[0].nombre || "Punto único");
            agregarMarcador(validLocations[0], nombre, bounds, 0);
        }
        return null;
    }

    // Dibujar o actualizar la ruta
    const renderer = dibujarRutaConductor(validLocations, color);
    return { locations: validLocations, renderer };
}

// Ajustar geocodificarDireccion para manejar strings de coordenadas
function geocodificarDireccion(direccion) {
    return new Promise((resolve) => {
        if (!direccion) {
            console.warn("⚠️ Dirección no proporcionada:", direccion);
            return resolve(null);
        }

        // Manejar coordenadas (ej. "11.000218,-74.812621")
        if (typeof direccion === "string" && direccion.includes(",")) {
            const [lat, lng] = direccion.split(",").map(val => parseFloat(val.trim()));
            if (!isNaN(lat) && !isNaN(lng)) {
                console.log(`📍 Coordenadas parseadas: ${direccion} -> LatLng(${lat}, ${lng})`);
                return resolve(new google.maps.LatLng(lat, lng));
            } else {
                console.warn(`⚠️ Coordenadas inválidas: ${direccion}`);
            }
        }

        // Si es una dirección de texto, geocodificarla
        console.log(`📍 Geocodificando dirección de texto: ${direccion}`);
        window.geocoder.geocode({ address: direccion }, (results, status) => {
            if (status === "OK" && results[0]) {
                const location = results[0].geometry.location;
                console.log(`✅ Dirección geocodificada: ${direccion} -> LatLng(${location.lat()}, ${location.lng()})`);
                resolve(location);
            } else {
                console.warn(`⚠️ No se pudo geocodificar: ${direccion} - Estado: ${status}`);
                resolve(null);
            }
        });
    });
}

function dibujarRutaConductor(locations, color) {
    if (locations.length < 2) {
        console.warn("⚠️ No hay suficientes ubicaciones para dibujar la ruta");
        return null;
    }

    let directionsRenderer;
    if (window.rutasDibujadas.length > 0) {
        // Reutilizar el renderer existente si es posible
        directionsRenderer = window.rutasDibujadas[0];
        directionsRenderer.setOptions({
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
    } else {
        // Crear un nuevo renderer si no existe
        directionsRenderer = new google.maps.DirectionsRenderer({
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
    }

    const directionsService = new google.maps.DirectionsService();
    directionsService.route({
        origin: locations[0],
        destination: locations[locations.length - 1],
        waypoints: locations.slice(1, -1).map(loc => ({ location: loc, stopover: true })),
        travelMode: google.maps.TravelMode.DRIVING
    }, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
            if (!window.rutasDibujadas.includes(directionsRenderer)) {
                window.rutasDibujadas.push(directionsRenderer);
            }
            console.log("✅ Ruta dibujada con éxito:", color);
        } else {
            console.error("❌ Error al calcular ruta:", status);
        }
    });

    return directionsRenderer;
}

function agregarMarcador(location, title, bounds, label) {
    const paradaId = `parada-${label}`; // Asegurar un ID único
    let marcadorExistente = window.marcadores.empleados.find(m => m.paradaId === paradaId);

    if (!marcadorExistente) {
        const marcador = new google.maps.marker.AdvancedMarkerElement({
            position: location,
            map: window.map,
            title: title,
            content: crearMarcadorCirculo(label.toString())
        });
        marcador.paradaId = paradaId; // Añadir un identificador al marcador
        window.marcadores.empleados.push(marcador);
        console.log(`🖌️ Marcador de parada creado: ${paradaId} - ${title}`);
    } else {
        marcadorExistente.position = location;
        marcadorExistente.title = title;
        console.log(`🖌️ Marcador de parada actualizado: ${paradaId} - ${title}`);
    }
    bounds.extend(location);
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

async function dibujarRutasPrimeraVez(rutasIA) {
    if (!rutasIA || !rutasIA.mejor_ruta_distancia || !rutasIA.mejor_ruta_trafico) {
        console.warn("⚠️ Datos de rutasIA incompletos:", rutasIA);
        return false;
    }

    const bounds = new google.maps.LatLngBounds();
    let success = false;

    // Geocodificar todas las direcciones primero
    const geocodificarTodas = async (ruta) => {
        return Promise.all(ruta.map(async (entry, index) => {
            const direccion = entry.direccion;
            const location = await geocodificarDireccion(direccion);
            if (!location) {
                console.warn(`⚠️ No se pudo geocodificar la dirección: ${direccion}`);
                return null;
            }
            return { location, entry, index };
        }));
    };

    // Procesar ambas rutas
    const rutaDistancia = rutasIA.mejor_ruta_distancia;
    const rutaTrafico = rutasIA.mejor_ruta_trafico;

    // Geocodificar direcciones para ambas rutas
    const locationsDistancia = (await geocodificarTodas(rutaDistancia)).filter(loc => loc);
    const locationsTrafico = (await geocodificarTodas(rutaTrafico)).filter(loc => loc);

    // Verificar si tenemos suficientes ubicaciones válidas
    if (locationsDistancia.length < 2 && locationsTrafico.length < 2) {
        console.warn("⚠️ No hay suficientes ubicaciones válidas para dibujar ninguna ruta:", {
            distancia: locationsDistancia,
            trafico: locationsTrafico
        });
        return false;
    }

    // Añadir marcadores (solo una vez, ya que ambas rutas tienen los mismos puntos)
    const allLocations = [...locationsDistancia, ...locationsTrafico];
    const uniqueLocations = [];
    const seen = new Set();

    allLocations.forEach(loc => {
        const key = `${loc.location.lat()},${loc.location.lng()}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueLocations.push(loc);
        }
    });

    // Crear el ícono del bus
    const svgIcon = document.createElement("img");
    svgIcon.src = "/media/iconobus.svg";
    svgIcon.style.width = "40px";
    svgIcon.style.height = "40px";
    svgIcon.onerror = () => console.error("❌ Error cargando iconobus.svg");

    uniqueLocations.forEach(({ location, entry, index }) => {
        const nombre = entry.nombre || `Parada ${index}`;
        if (index === 0) {
            // Primer marcador: ícono de bus usando iconobus.svg
            const marcadorBus = new google.maps.marker.AdvancedMarkerElement({
                position: location,
                map: window.map,
                title: nombre,
                content: svgIcon.cloneNode(true) // Clonar el ícono para evitar problemas de reutilización
            });
            window.marcadores.bus = marcadorBus;
            console.log(`🚌 Marcador de bus creado: ${nombre}`);
        } else if (index === rutaDistancia.length - 1) {
            // Último marcador: destino
            const marcadorDestino = new google.maps.marker.AdvancedMarkerElement({
                position: location,
                map: window.map,
                title: nombre,
                content: crearMarcadorCirculo("Fin")
            });
            window.marcadores.destino = marcadorDestino;
            console.log(`🏁 Marcador de destino creado: ${nombre}`);
        } else {
            // Marcadores intermedios: paradas
            agregarMarcador(location, nombre, bounds, index);
        }
        bounds.extend(location);
    });

    // Dibujar las rutas
    const dibujarRuta = (locations, color) => {
        if (locations.length < 2) {
            console.warn(`⚠️ No hay suficientes ubicaciones para dibujar la ruta (${color}):`, locations);
            return null;
        }

        const latLngs = locations.map(loc => loc.location);
        const renderer = new google.maps.DirectionsRenderer({
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

        const directionsService = new google.maps.DirectionsService();
        directionsService.route({
            origin: latLngs[0],
            destination: latLngs[latLngs.length - 1],
            waypoints: latLngs.slice(1, -1).map(loc => ({ location: loc, stopover: true })),
            travelMode: google.maps.TravelMode.DRIVING
        }, (result, status) => {
            if (status === google.maps.DirectionsStatus.OK) {
                renderer.setDirections(result);
                window.rutasDibujadas.push(renderer);
                console.log(`✅ Ruta dibujada (${color}):`, latLngs);
                success = true;
            } else {
                console.error(`❌ Error al dibujar ruta (${color}):`, status);
            }
        });

        return renderer;
    };

    // Dibujar ambas rutas si tienen suficientes ubicaciones
    if (locationsDistancia.length >= 2) {
        dibujarRuta(locationsDistancia, '#00CC66'); // Verde para distancia
    }
    if (locationsTrafico.length >= 2) {
        dibujarRuta(locationsTrafico, '#FF9900'); // Naranja para tráfico
    }

    // Ajustar el mapa a los límites
    if (!bounds.isEmpty()) {
        window.map.fitBounds(bounds);
        console.log("🗺️ Mapa ajustado a los límites:", bounds.toJSON());
    }

    return success;
}

export {dibujarRutasPrimeraVez, actualizarMapa, procesarRuta, geocodificarDireccion, agregarMarcador, dibujarRutaConductor, crearMarcadorCirculo };