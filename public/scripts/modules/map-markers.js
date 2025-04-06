// Gestión de marcadores
import CONFIG from '../config.js';

// Agregar marcador
export function agregarMarcador(location, title, bounds, label, color) {
    const marcador = new google.maps.marker.AdvancedMarkerElement({
        position: location,
        map: window.map,
        title: title,
        content: crearMarcadorCircular(label, color)
    });
    window.marcadores.push(marcador);
    bounds.extend(location);
}

// Crear marcador circular con número
export function crearMarcadorCircular(label, color) {
    const div = document.createElement("div");
    div.style.position = "relative";
    div.style.width = "30px";
    div.style.height = "30px";
    div.style.borderRadius = "50%";
    div.style.backgroundColor = color;
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
    div.style.border = "2px solid white";

    const span = document.createElement("span");
    span.textContent = label;
    span.style.color = "white";
    span.style.fontWeight = "bold";
    span.style.fontSize = "14px";

    div.appendChild(span);
    return div;
}

// Actualizar marcador del bus
export function actualizarMarcadorBus(ubicacion) {
    // Evitar redibujar si la ubicación no ha cambiado
    if (window.ultimaUbicacionBus &&
        ubicacion.lat === window.ultimaUbicacionBus.lat &&
        ubicacion.lng === window.ultimaUbicacionBus.lng) {
        console.log("🔄 La ubicación del bus no ha cambiado.");
        return;
    }

    // Limpiar marcador anterior
    if (window.marcadorBus) {
        window.marcadorBus.setMap(null);
    }

    // Crear nuevo marcador con ícono personalizado
    window.marcadorBus = new google.maps.marker.AdvancedMarkerElement({
        position: new google.maps.LatLng(ubicacion.lat, ubicacion.lng),
        map: window.map,
        title: "Ubicación actual del Bus",
        content: document.createElement("img"),
    });

    // Configurar la imagen personalizada
    window.marcadorBus.content.src = "media/iconobus.svg";
    window.marcadorBus.content.style.width = "40px";
    window.marcadorBus.content.style.height = "40px";

    // Guardar última ubicación
    window.ultimaUbicacionBus = ubicacion;

    console.log("✅ Marcador del bus actualizado:", ubicacion);
}