// scripts/utils/helpers.js
function limpiarMapa() {
    window.marcadores.forEach(marcador => marcador.setMap(null));
    window.marcadores = [];
    window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
    window.rutasDibujadas = [];

    if (window.marcadorBus) {
        window.marcadorBus.setMap(null);
        window.marcadorBus = null;
    }

    document.querySelectorAll(".tcpInput").forEach(el => {
        if (el.tagName === "INPUT") el.value = "";
        else el.innerHTML = "";
    });

    document.querySelectorAll(".tcpDirections").forEach(el => {
        if (el.tagName === "INPUT") el.value = "";
        else el.innerHTML = "";
    });

    fetch('/messages', { method: 'DELETE' })
        .then(response => response.json())
        .then(data => console.log(data.message))
        .catch(error => console.error('Error al limpiar mensajes:', error));

    fetch('/updateBus', { method: 'PUT' })
        .then(response => response.json())
        .then(data => console.log(data.message))
        .catch(error => console.error('Error al actualizar bus:', error));
}

function crearIconoPersonalizado(iconUrl, label, color) {
    const div = document.createElement("div");
    div.style.position = "relative";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div.style.width = "40px";
    div.style.height = "40px";

    const img = document.createElement("img");
    img.src = iconUrl;
    img.style.width = "40px";
    img.style.height = "40px";

    const span = document.createElement("span");
    span.textContent = label;
    span.style.position = "absolute";
    span.style.top = "50%";
    span.style.left = "50%";
    span.style.transform = "translate(-50%, -50%)";
    span.style.color = "white";
    span.style.fontWeight = "bold";
    span.style.background = "rgba(0, 0, 0, 0.5)";
    span.style.padding = "2px 6px";
    span.style.borderRadius = "4px";
    span.style.fontSize = "12px";

    div.appendChild(img);
    div.appendChild(span);
    return div;
}

export { limpiarMapa, crearIconoPersonalizado };