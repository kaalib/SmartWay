// scripts/main.js
import CONFIG from './config.js';
import { checkUserRole } from './modules/auth.js';
import { configurarBarrasLaterales } from './modules/sidebar.js';
import { loadGoogleMapsApi, initMap } from './modules/map-init.js';
import { setupSocket, mostrarMensajesTCP } from './modules/socket.js';
import { setupUIEvents } from './modules/ui.js';
import { iniciarNavegacionConductor, detenerNavegacionConductor } from './modules/navigation.js';

// Variables globales (solo las que no están relacionadas con el mapa)
window.rutaSeleccionada = null;
window.rutaDistancia = null;
window.rutaTrafico = null;
window.rutaTiempo = null;
//window.marcadorBus = null;
window.ultimaUbicacionBus = null;
window.intervalID = null;
window.primeraVez = true;
window.ultimaParada = null;
window.primeraActualizacionMapa = true;

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
        await loadGoogleMapsApi(); // Espera a que la API se cargue
        initMap(); // Luego inicializa el mapa, que también inicializa window.marcadores y window.rutasDibujadas
    } catch (error) {
        console.error("⚠️ Error cargando o inicializando Google Maps:", error);
        window.map = null;
        window.geocoder = null;
        window.marcadores = { bus: null, empleados: [], destino: null }; // Fallback
        window.rutasDibujadas = []; // Fallback
    }

    // Inicializar WebSocket
    try {
        setupSocket();
    } catch (error) {
        console.error("⚠️ Error inicializando WebSocket:", error);
    }

    // Configurar eventos de UI
    try {
        setupUIEvents();
    } catch (error) {
        console.error("⚠️ Error configurando eventos de UI:", error);
    }

    // Mostrar texto por defecto para mensajes TCP al inicio
    try {
        mostrarMensajesTCP([]); // Array vacío para mostrar "No hay pasajeros..."
        console.log("✅ Mensajes TCP inicializados con texto por defecto.");
    } catch (error) {
        console.error("⚠️ Error mostrando mensajes TCP iniciales:", error);
    }

    console.log("✅ Aplicación inicializada (posiblemente con errores parciales para pruebas locales)");
}

document.addEventListener('DOMContentLoaded', inicializarAplicacion);
export { inicializarAplicacion };