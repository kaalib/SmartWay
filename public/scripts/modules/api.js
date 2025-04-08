// scripts/modules/api.js
import CONFIG from '../config.js';
import { actualizarMapa } from './map-markers.js';
import { gestionarUbicacion } from './location.js';


async function solicitarActualizacionRutas() {
    try {
        console.log("📡 Solicitando actualización de rutas...");
        const response = await fetch(`${CONFIG.SERVER_URL}/enviar-direcciones`, { method: "POST" });
        const data = await response.json();

        if (data.success) {
            console.log("✅ Rutas actualizadas:", data.rutasIA);
            actualizarMapa(data.rutasIA);
        } else {
            console.error("❌ Error al actualizar rutas:", data.message);
        }
    } catch (error) {
        console.error("❌ Error al comunicarse con el servidor:", error);
    }
}

async function solicitarReorganizacionRutas() {
    try {
        console.log("📡 Solicitando reorganización de rutas...");
        const response = await fetch(`${CONFIG.SERVER_URL}/enviar-direcciones`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });
        if (!response.ok) throw new Error("Error al solicitar reorganización de rutas");
        const data = await response.json();
        console.log("✅ Rutas reorganizadas recibidas:", data.rutasIA);
        window.rutaDistancia = data.rutasIA.mejor_ruta_distancia;
        window.rutaTrafico = data.rutasIA.mejor_ruta_trafico;
    } catch (error) {
        console.error("❌ Error en `solicitarReorganizacionRutas()`:", error);
    }
}

async function ejecutarProcesoenorden() {
    try {
        await gestionarUbicacion();
        await solicitarActualizacionRutas();
    } catch (error) {
        console.error("❌ Error en el proceso:", error);
    }
}

async function iniciarEnvioActualizacion() {
    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/iniciar-emision`, { method: "POST" });
        const data = await response.json();
        console.log("✅ Emisión activada:", data);
    } catch (error) {
        console.error("❌ Error al iniciar la emisión:", error);
    }
}

async function detenerEnvioActualizacion() {
    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/detener-emision`, { method: "POST" });
        const data = await response.json();
        console.log("🛑 Emisión detenida:", data);
    } catch (error) {
        console.error("❌ Error al detener la emisión:", error);
    }
}

async function limpiarMapa() {
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



export { solicitarActualizacionRutas, solicitarReorganizacionRutas, ejecutarProcesoenorden, iniciarEnvioActualizacion, detenerEnvioActualizacion, limpiarMapa };