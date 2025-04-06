// Comunicación con el servidor
import CONFIG from '../config.js';
import { actualizarMapa } from './map-routes.js';
import { gestionarUbicacion } from './location.js';

// Obtener mensajes TCP y mostrarlos en la lista
export async function mostrarMensajesTCP() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/messages`);
        if (!response.ok) throw new Error("Error al obtener los mensajes TCP");

        const data = await response.json();
        let mensajes = data.tcp || [];

        if (mensajes.length <= 1) {
            document.querySelectorAll('.tcpDirections').forEach(el => {
                el.innerHTML = "<p>No hay suficientes mensajes TCP.</p>";
            });
            return;
        }

        // Crear lista excluyendo el primer mensaje
        const listaMensajes = mensajes.slice(1).map((msg, index) => 
            `<p>${index + 1}. ${msg.nombre} ${msg.apellido} - ${msg.direccion}</p>`
        ).join("");

        // Insertar en todos los elementos con la clase `tcpDirections`
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

// Solicitar actualización de rutas
export async function solicitarActualizacionRutas() {
    try {
        console.log("📡 Solicitando actualización de rutas...");
        const response = await fetch(`${CONFIG.API_URL}/enviar-direcciones`, { method: "POST" });
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

// Solicitar reorganización de rutas
export async function solicitarReorganizacionRutas() {
    try {
        console.log("📡 Solicitando reorganización de rutas a Node.js...");

        const response = await fetch(`${CONFIG.API_URL}/enviar-direcciones`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        if (!response.ok) throw new Error("Error al solicitar reorganización de rutas");

        const data = await response.json();
        console.log("✅ Rutas reorganizadas recibidas:", data.rutasIA);

        // Actualizar el mapa con las nuevas rutas
        actualizarMapa(data.rutasIA);
    } catch (error) {
        console.error("❌ Error en `solicitarReorganizacionRutas()`:", error);
    }
}

// Ejecutar proceso en orden
export async function ejecutarProcesoenorden() {
    try {
        await gestionarUbicacion();
        await solicitarActualizacionRutas();
    } catch (error) {
        console.error("❌ Error en el proceso:", error);
    }
}

// Iniciar emisión de ubicación
export async function iniciarEnvioActualizacion() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/iniciar-emision`, { method: "POST" });
        const data = await response.json();
        console.log("✅ Emisión activada:", data);
    } catch (error) {
        console.error("❌ Error al iniciar la emisión:", error);
    }
}

// Detener emisión de ubicación
export async function detenerEnvioActualizacion() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/detener-emision`, { method: "POST" });
        const data = await response.json();
        console.log("🛑 Emisión detenida:", data);
    } catch (error) {
        console.error("❌ Error al detener la emisión:", error);
    }
}

// Limpiar mapa y datos
export function limpiarMapa() {
    // Eliminar todos los marcadores del mapa
    window.marcadores.forEach(marcador => marcador.setMap(null));
    window.marcadores = [];

    // Vaciar la lista de direcciones
    window.direccionesTCP = [];

    // Eliminar marcador del bus si existe
    if (window.marcadorBus) {
        window.marcadorBus.setMap(null);
        window.marcadorBus = null;
    }

    // Eliminar todas las polilíneas dibujadas
    window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
    window.rutasDibujadas = [];

    // Limpiar contenido de los elementos HTML
    document.querySelectorAll(".tcpInput").forEach(el => {
        if (el.tagName === "INPUT") {
            el.value = "";
        } else {
            el.innerHTML = "";
        }
    });

    document.querySelectorAll(".tcpDirections").forEach(el => {
        if (el.tagName === "INPUT") {
            el.value = "";
        } else {
            el.innerHTML = "";
        }
    });

    // Enviar solicitud DELETE para limpiar mensajes en el servidor
    fetch('/messages', { method: 'DELETE' })
        .then(response => response.json())
        .then(data => console.log(data.message))
        .catch(error => console.error('Error al limpiar mensajes:', error));

    // Enviar solicitud PUT para actualizar la columna bus en la BD
    fetch('/updateBus', { method: 'PUT' })
        .then(response => response.json())
        .then(data => console.log(data.message))
        .catch(error => console.error('Error al actualizar bus:', error));
}