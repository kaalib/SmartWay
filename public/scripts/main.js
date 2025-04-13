// scripts/main.js
import CONFIG from './config.js';
import { checkUserRole } from './modules/auth.js';
import { configurarBarrasLaterales } from './modules/sidebar.js';
import { loadGoogleMapsApi, initMap } from './modules/map-init.js';
import { setupSocket, mostrarMensajesTCP } from './modules/socket.js';
import { setupUIEvents } from './modules/ui.js';
import { iniciarNavegacionConductor, detenerNavegacionConductor } from './modules/navigation.js';

// Variables globales
window.map = null;
window.geocoder = null;
window.marcadores = [];
window.rutasDibujadas = [];
window.rutaSeleccionada = null;
window.rutaDistancia = null;
window.rutaTrafico = null;
window.marcadorBus = null;
window.ultimaUbicacionBus = null;
window.intervalID = null;
window.primeraVez = true;
window.ultimaParada = null;
window.primeraActualizacionMapa = true;
window.paradaMarcadores = {}; // Añadimos paradaMarcadores como variable global

async function inicializarAplicacion() {
    console.log("🚀 Inicializando aplicación SmartWay...");

    try { checkUserRole(); } catch (error) {
        console.error("⚠️ Error verificando rol del usuario:", error);
    }

    try { configurarBarrasLaterales(); } catch (error) {
        console.error("⚠️ Error configurando barras laterales:", error);
    }

    try {
        await loadGoogleMapsApi();
        initMap();
    } catch (error) {
        console.error("⚠️ Error cargando o inicializando Google Maps:", error);
        window.map = null;
        window.geocoder = null;
    }

    try { setupSocket(); } catch (error) {
        console.error("⚠️ Error inicializando WebSocket:", error);
    }

    try { setupUIEvents(); } catch (error) {
        console.error("⚠️ Error configurando eventos de UI:", error);
    }

    try {
        mostrarMensajesTCP([]);
        console.log("✅ Mensajes TCP inicializados con texto por defecto.");
    } catch (error) {
        console.error("⚠️ Error mostrando mensajes TCP iniciales:", error);
    }

    console.log("✅ Aplicación inicializada (posiblemente con errores parciales para pruebas locales)");
}

document.addEventListener('DOMContentLoaded', inicializarAplicacion);
export { inicializarAplicacion };