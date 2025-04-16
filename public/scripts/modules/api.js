// scripts/modules/api.js
import CONFIG from '../config.js';
import { actualizarMapa } from './map-markers.js';


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
    // Limpiar marcadores de empleados
    if (window.marcadores && Array.isArray(window.marcadores.empleados)) {
        window.marcadores.empleados.forEach(marcador => {
            if (marcador && typeof marcador.setMap === "function") {
                marcador.setMap(null);
            }
        });
        window.marcadores.empleados = [];
    } else {
        console.warn("⚠️ window.marcadores.empleados no es un array o no está definido");
        window.marcadores = { empleados: [] }; // Reiniciar como respaldo
    }

    // Limpiar marcador del bus, si existe
    if (window.marcadores && window.marcadores.bus) {
        if (typeof window.marcadores.bus.setMap === "function") {
            window.marcadores.bus.setMap(null);
        }
        window.marcadores.bus = null;
    }

    // Limpiar rutas dibujadas
    if (Array.isArray(window.rutasDibujadas)) {
        window.rutasDibujadas.forEach(ruta => {
            if (ruta && typeof ruta.setMap === "function") {
                ruta.setMap(null);
            }
        });
        window.rutasDibujadas = [];
    } else {
        console.warn("⚠️ window.rutasDibujadas no es un array o no está definido");
        window.rutasDibujadas = []; // Reiniciar como respaldo
    }

    // Limpiar elementos del DOM
    document.querySelectorAll(".tcpInput").forEach(el => {
        if (el.tagName === "INPUT") el.value = "";
        else el.innerHTML = "";
    });

    document.querySelectorAll(".tcpDirections").forEach(el => {
        if (el.tagName === "INPUT") el.value = "";
        else el.innerHTML = "";
    });

    // Limpiar datos en el servidor
    try {
        const responseMessages = await fetch('/messages', { method: 'DELETE' });
        const dataMessages = await responseMessages.json();
        console.log("✅ Mensajes limpiados en el servidor:", dataMessages.message);

        const responseBus = await fetch('/updateBus', { method: 'PUT' });
        const dataBus = await responseBus.json();
        console.log("✅ Bus actualizado en el servidor:", dataBus.message);
    } catch (error) {
        console.error('❌ Error al limpiar datos en el servidor:', error);
    }
}



export { solicitarActualizacionRutas, solicitarReorganizacionRutas, iniciarEnvioActualizacion, detenerEnvioActualizacion, limpiarMapa };