// Punto de entrada principal
import CONFIG from './config.js';
import { checkUserRole } from './modules/auth.js';
import { initSidebars } from './modules/sidebar.js';
import { getApiKey } from './modules/map-init.js';
import { setupEventListeners } from './modules/ui.js';
import { mostrarMensajesTCP } from './modules/api.js';

// Variables globales que necesitan ser accesibles desde múltiples módulos
window.map = null;
window.geocoder = null;
window.marcadores = [];
window.rutasDibujadas = [];
window.direccionesTCP = [];
window.intervalID = null;
window.rutaSeleccionada = null;
window.primeraVez = true;
window.marcadorBus = null;
window.ultimaUbicacionBus = null;
window.rutaDistancia = null;
window.rutaTrafico = null;
window.distanciaTotalKm = null;
window.tiempoTotalMin = null;

// Inicialización cuando el DOM está listo
document.addEventListener("DOMContentLoaded", async () => {
    // Verificar rol de usuario y configurar permisos
    checkUserRole();
    
    // Inicializar barras laterales
    initSidebars();
    
    // Configurar listeners de eventos para botones y UI
    setupEventListeners();
    
    // Cargar el mapa
    getApiKey();
    
    // Mostrar mensajes TCP iniciales
    await mostrarMensajesTCP();
});