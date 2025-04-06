// Gestión de interfaz de usuario
import CONFIG from '../config.js';
import { actualizarMapa, actualizarRutaSeleccionada, iniciarActualizacionRuta } from './map-routes.js';
import { mostrarMensajesTCP, ejecutarProcesoenorden, iniciarEnvioActualizacion, detenerEnvioActualizacion, limpiarMapa } from './api.js';
import { gestionarUbicacion, dibujarUbicacionBus, agregarPuntoFinal } from './location.js';

// Funciones para manejar modales
export function abrirUbicacionModal() {
    const modal = document.getElementById("ubicacionModal");
    if (modal) {
        modal.style.visibility = "visible";
        modal.style.opacity = "1";
    }
}

export function cerrarUbicacionModal() {
    const modal = document.getElementById("ubicacionModal");
    if (modal) {
        modal.style.visibility = "hidden";
        modal.style.opacity = "0";
    }
}

export function mostrarLoader() {
    const loader = document.getElementById("loaderContainer");
    if (loader) {
        loader.style.visibility = "visible";
        loader.style.opacity = "1";
        
        // Ocultar el loader después de 3 segundos
        setTimeout(() => {
            loader.style.visibility = "hidden";
            loader.style.opacity = "0";
        }, 3000);
    }
}

export function mostrarOpcionesRuta() {
    const modal = document.getElementById("rutaModal");
    if (modal) {
        modal.style.visibility = "visible";
        modal.style.opacity = "1";
    }
}

export function cerrarRutaModal() {
    const modal = document.getElementById("rutaModal");
    if (modal) {
        modal.style.visibility = "hidden";
        modal.style.opacity = "0";
    }
}

export function cerrarModal() {
    const modal = document.getElementById("confirmContainer");
    if (modal) {
        modal.style.visibility = "hidden";
        modal.style.opacity = "0";
    }
}

export function bloquearInicio() {
    const btnInicio = document.getElementById("btnInicio");
    if (btnInicio) {
        btnInicio.disabled = true;
        btnInicio.classList.remove("btn-enabled");
        btnInicio.classList.add("btn-disabled");
    }
    
    const btnFin = document.getElementById("btnFin");
    if (btnFin) {
        btnFin.disabled = false;
        btnFin.classList.remove("btn-disabled");
        btnFin.classList.add("btn-enabled");
    }
}

// Configurar listeners de eventos para la UI
export function setupEventListeners() {
    console.log("🔄 Configurando event listeners...");
    
    // Evento para habilitar el botón al seleccionar una opción de ubicación
    document.querySelectorAll('input[name="ubicacion"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            const btnSeleccionarUbicacion = document.getElementById("btnSeleccionarUbicacion");
            if (btnSeleccionarUbicacion) {
                btnSeleccionarUbicacion.disabled = false;
            }
        });
    });

    // Evento para cerrar el modal de ubicación y mostrar el loader
    const btnSeleccionarUbicacion = document.getElementById("btnSeleccionarUbicacion");
    if (btnSeleccionarUbicacion) {
        btnSeleccionarUbicacion.addEventListener("click", async () => {
            const opcionSeleccionada = document.querySelector('input[name="ubicacion"]:checked');
            if (!opcionSeleccionada) {
                console.error("❌ No se ha seleccionado ninguna opción de ubicación");
                return;
            }
            
            console.log("📍 Ubicación seleccionada:", opcionSeleccionada.value);
            window.ultimaParada = opcionSeleccionada.value;
            
            // Agregar punto final según la opción seleccionada
            await agregarPuntoFinal(opcionSeleccionada.value);
            
            cerrarUbicacionModal();
            mostrarLoader();
        });
    }

    // Botón para iniciar el envío de ubicación
    const btnInicio = document.getElementById('btnInicio');
    if (btnInicio) {
        btnInicio.addEventListener("click", async () => {
            console.log("🚀 Botón de inicio presionado");
            abrirUbicacionModal();
            await mostrarMensajesTCP();
            await ejecutarProcesoenorden();
            await iniciarEnvioActualizacion();
            
            if (window.intervalID) {
                console.log("⚠️ El envío de ubicación ya está activo.");
                return;
            }
            
            window.intervalID = setInterval(gestionarUbicacion, CONFIG.UPDATE_INTERVAL);
            console.log("✅ Envío de ubicación activado.");
        });
    }

    // Botón para mostrar las opciones de ruta
    const btnSeleccionRuta = document.getElementById("btnSeleccionRuta");
    if (btnSeleccionRuta) {
        btnSeleccionRuta.addEventListener("click", () => {
            console.log("🚀 Botón de selección de ruta presionado");
            mostrarOpcionesRuta();
        });
    }

    // Botón para abrir el modal de confirmación
    const btnFin = document.getElementById("btnFin");
    if (btnFin) {
        btnFin.addEventListener("click", () => {
            console.log("🚀 Botón de fin presionado");
            const modal = document.getElementById("confirmContainer");
            if (modal) {
                modal.style.visibility = "visible";
                modal.style.opacity = "1";
            }
        });
    }

    // Evento para finalizar
    const confirmYes = document.getElementById("confirmYes");
    if (confirmYes) {
        confirmYes.addEventListener("click", () => {
            console.log("✅ Confirmación de finalización");
            limpiarMapa();
            detenerEnvioActualizacion();

            if (window.intervalID) {
                clearInterval(window.intervalID);
                window.intervalID = null;
                console.log("🚫 Envío de ubicación detenido.");
            }
            
            window.primeraVez = true;
            window.rutaSeleccionada = null;

            const btnInicio = document.getElementById("btnInicio");
            if (btnInicio) {
                btnInicio.disabled = false;
                btnInicio.classList.remove("btn-disabled");
                btnInicio.classList.add("btn-enabled");
            }

            const btnSeleccionRuta = document.getElementById("btnSeleccionRuta");
            if (btnSeleccionRuta) {
                btnSeleccionRuta.disabled = true;
                btnSeleccionRuta.classList.remove("btn-enabled");
                btnSeleccionRuta.classList.add("btn-disabled");
            }

            const btnFin = document.getElementById("btnFin");
            if (btnFin) {
                btnFin.disabled = true;
                btnFin.classList.remove("btn-enabled");
                btnFin.classList.add("btn-disabled");
            }

            cerrarModal();
        });
    }

    // Evento para cancelar la acción y cerrar el modal
    const confirmNo = document.getElementById("confirmNo");
    if (confirmNo) {
        confirmNo.addEventListener("click", () => {
            console.log("❌ Cancelación de finalización");
            cerrarModal();
        });
    }

    // Habilitar el botón de selección al elegir una ruta
    document.querySelectorAll('input[name="ruta"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            const btnSeleccionarRutaConfirm = document.getElementById("btnSeleccionarRutaConfirm");
            if (btnSeleccionarRutaConfirm) {
                btnSeleccionarRutaConfirm.disabled = false;
            }
        });
    });

    // Evento para confirmar la selección de ruta
    const btnSeleccionarRutaConfirm = document.getElementById("btnSeleccionarRutaConfirm");
    if (btnSeleccionarRutaConfirm) {
        btnSeleccionarRutaConfirm.addEventListener("click", () => {
            const rutaSeleccionada = document.querySelector('input[name="ruta"]:checked');
            if (!rutaSeleccionada) {
                console.error("❌ No se ha seleccionado ninguna ruta");
                return;
            }
            
            window.rutaSeleccionada = rutaSeleccionada.value;
            console.log("✅ Ruta seleccionada:", window.rutaSeleccionada);
            
            actualizarRutaSeleccionada();
            cerrarRutaModal();
            bloquearInicio();
            
            const btnSeleccionRuta = document.getElementById("btnSeleccionRuta");
            if (btnSeleccionRuta) {
                btnSeleccionRuta.disabled = true;
            }
            
            const btnFin = document.getElementById("btnFin");
            if (btnFin) {
                btnFin.disabled = false;
            }

            // Iniciar actualización periódica de la ruta cada 20 segundos
            iniciarActualizacionRuta();

            // Iniciar emisión desde el servidor
            fetch(`${CONFIG.API_URL}/iniciar-emision`, { method: "POST" })
                .then(res => res.json())
                .then(data => console.log("✅ Emisión iniciada:", data))
                .catch(err => console.error("❌ Error iniciando emisión:", err));
        });
    }

    // Iniciar actualización periódica de la ubicación del bus
    setInterval(dibujarUbicacionBus, CONFIG.UPDATE_INTERVAL);
    
    console.log("✅ Event listeners configurados correctamente");
}