// scripts/modules/api.js
import CONFIG from '../config.js';
import { actualizarMapa } from './map-markers.js';
import { gestionarUbicacion } from './location.js';

async function mostrarMensajesTCP() {
    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/messages`);
        if (!response.ok) throw new Error("Error al obtener los mensajes TCP");

        const data = await response.json();
        let mensajes = data.tcp || [];

        if (mensajes.length <= 1) {
            document.querySelectorAll('.tcpDirections').forEach(el => {
                el.innerHTML = "<p>No hay suficientes mensajes TCP.</p>";
            });
            return;
        }

        const listaMensajes = mensajes.slice(1).map((msg, index) => 
            `<p>${index + 1}. ${msg.nombre} ${msg.apellido} - ${msg.direccion}</p>`
        ).join("");

        document.querySelectorAll('.tcpDirections').forEach(el => {
            el.innerHTML = listaMensajes;
        });
    } catch (error) {
        console.error("❌ Error obteniendo mensajes TCP:", error);
        document.querySelectorAll('.tcpDirections').forEach(el => {
            el.innerHTML = "<p>Error al cargar mensajes.</p>";
        });
    }
}

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
        actualizarMapa(data.rutasIA);
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

export { mostrarMensajesTCP, solicitarActualizacionRutas, solicitarReorganizacionRutas, ejecutarProcesoenorden, iniciarEnvioActualizacion, detenerEnvioActualizacion };