// Comunicación WebSocket
import CONFIG from '../config.js';
import { actualizarMapa } from './map-routes.js';
import { actualizarMarcadorBus } from './map-markers.js';

// Inicializar socket
export const socket = io(CONFIG.SOCKET_URL);

// Configurar listeners de WebSocket
export function setupSocketListeners() {
    // Escuchar actualizaciones de rutas
    socket.on("actualizar_rutas", (data) => {
        if (window.rutaSeleccionada && data.rutasIA[window.rutaSeleccionada]) {
            console.log("📡 WebSocket actualiza la ruta:", window.rutaSeleccionada);
            actualizarMapa({ [window.rutaSeleccionada]: data.rutasIA[window.rutaSeleccionada] });
        }
    });

    // Escuchar cambios en la ubicación del bus
    socket.on("actualizarUbicacionBus", (ubicacion) => {
        if (!ubicacion || !ubicacion.lat || !ubicacion.lng) return;
        console.log("🛑 Ubicación del bus recibida por WebSocket:", ubicacion);
        
        actualizarMarcadorBus(ubicacion);
    });
}