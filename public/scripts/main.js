// scripts/main.js
import CONFIG from './config.js';
import { checkUserRole } from './modules/auth.js';
import { configurarBarrasLaterales } from './modules/sidebar.js';
import { loadGoogleMapsApi, initMap } from './modules/map-init.js';
import { setupSocket } from './modules/socket.js';
import { mostrarMensajesTCP } from './modules/api.js';
import { setupUIEvents } from './modules/ui.js';

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

async function inicializarAplicacion() {
    console.log("🚀 Inicializando aplicación SmartWay...");

    // Verificar rol del usuario
    try {
        checkUserRole();
    } catch (error) {
        console.error("⚠️ Error verificando rol del usuario:", error);
    }

    // Configurar barras laterales
    try {
        configurarBarrasLaterales();
    } catch (error) {
        console.error("⚠️ Error configurando barras laterales:", error);
    }

    // Cargar e inicializar Google Maps
    try {
        await loadGoogleMapsApi(CONFIG.GOOGLE_MAPS_API_KEY);
        initMap();
    } catch (error) {
        console.error("⚠️ Error cargando o inicializando Google Maps:", error);
        // Continuar incluso si falla, para pruebas locales
        window.map = null; // Asegurar que map esté definido aunque sea null
        window.geocoder = null;
    }

    // Inicializar WebSocket
    try {
        setupSocket();
    } catch (error) {
        console.error("⚠️ Error inicializando WebSocket:", error);
    }

    // Cargar mensajes TCP
    try {
        await mostrarMensajesTCP();
    } catch (error) {
        console.error("⚠️ Error cargando mensajes TCP:", error);
    }

    // Configurar eventos de UI
    try {
        setupUIEvents();
    } catch (error) {
        console.error("⚠️ Error configurando eventos de UI:", error);
    }

    console.log("✅ Aplicación inicializada (posiblemente con errores parciales para pruebas locales)");
}

document.addEventListener('DOMContentLoaded', inicializarAplicacion);
export { inicializarAplicacion };