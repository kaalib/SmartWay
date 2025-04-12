// scripts/modules/ui.js
import CONFIG from '../config.js';
import { actualizarMapa } from './map-markers.js';
import { iniciarActualizacionRuta, detenerActualizacionRuta, actualizarRutaSeleccionada, setupSocket, mostrarMensajesTCP } from './socket.js';
import { iniciarEnvioActualizacion, detenerEnvioActualizacion, limpiarMapa, solicitarActualizacionRutas } from './api.js';
import { gestionarUbicacion} from './location.js';
import { iniciarNavegacionConductor, detenerNavegacionConductor } from './navigation.js'; 

async function mostrarLoader() {
    const modal = document.getElementById("loaderContainer");
    const loader = document.getElementById("loader");
    const modalText = document.getElementById("modalText");

    modal.style.visibility = "visible";
    modal.style.opacity = "1";
    loader.classList.remove("hidden");
    modalText.textContent = "Calculando ruta";
}

function cerrarLoader() {
    const modal = document.getElementById("loaderContainer");
    modal.style.visibility = "hidden";
    modal.style.opacity = "0";
}

function mostrarOpcionesRuta() {
    const modal = document.getElementById("rutaContainer");
    const rutaDistanciaText = document.getElementById("rutaDistanciaText");
    const rutaTraficoText = document.getElementById("rutaTraficoText");
    const btnSeleccionarRutaConfirm = document.getElementById("btnSeleccionarRutaConfirm");

    modal.style.visibility = "visible";
    modal.style.opacity = "1";

    if (window.distanciaTotalKm && window.tiempoTotalMin) {
        rutaDistanciaText.textContent = `Distancia: ${window.distanciaTotalKm} km`;
        rutaTraficoText.textContent = `Tiempo: ${window.tiempoTotalMin} min`;
        btnSeleccionarRutaConfirm.disabled = true;
    } else {
        rutaDistanciaText.textContent = "Error al obtener datos de distancia";
        rutaTraficoText.textContent = "Error al obtener datos de tiempo";
        btnSeleccionarRutaConfirm.disabled = true;
    }
}

function cerrarRutaModal() {
    const modal = document.getElementById("rutaContainer");
    modal.style.visibility = "hidden";
    modal.style.opacity = "0";
}

function abrirUbicacionModal() {
    const modal = document.getElementById("ubicacionContainer");
    modal.style.visibility = "visible";
    modal.style.opacity = "1";
}

function cerrarUbicacionModal() {
    const modal = document.getElementById("ubicacionContainer");
    modal.style.visibility = "hidden";
    modal.style.opacity = "0";
}

function bloquearInicio() {
    document.getElementById('btnInicio').disabled = true;
}

function desbloquearInicio() {
    document.getElementById('btnInicio').disabled = false;
}

function cerrarModal() {
    const modal = document.getElementById("confirmContainer");
    modal.style.visibility = "hidden";
    modal.style.opacity = "0";
}

// Nueva función para restaurar el estado desde localStorage y el servidor
async function restaurarEstado() {
    const btnInicio = document.getElementById('btnInicio');
    const btnSeleccionRuta = document.getElementById('btnSeleccionRuta');
    const btnFin = document.getElementById('btnFin');

    // Leer estado desde localStorage
    const rutaEnProgreso = localStorage.getItem('rutaEnProgreso') === 'true';
    const rutaSeleccionada = localStorage.getItem('rutaSeleccionada') || null;
    const btnInicioHabilitado = localStorage.getItem('btnInicioHabilitado') !== 'false'; // Por defecto true si no existe
    const btnSeleccionRutaHabilitado = localStorage.getItem('btnSeleccionRutaHabilitado') === 'true';
    const btnFinHabilitado = localStorage.getItem('btnFinHabilitado') === 'true';

    // Aplicar estado de botones desde localStorage
    btnInicio.disabled = !btnInicioHabilitado;
    btnSeleccionRuta.disabled = !btnSeleccionRutaHabilitado;
    btnFin.disabled = !btnFinHabilitado;

    // Sincronizar con el servidor para verificar si la ruta sigue activa
    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/messages`);
        const data = await response.json();

        if (data.rutaseleccionada && data.rutaseleccionada.length > 0) {
            // Ruta activa en el servidor
            localStorage.setItem('rutaEnProgreso', 'true');
            localStorage.setItem('rutaSeleccionada', data.rutaSeleccionada || 'mejor_ruta_distancia');
            localStorage.setItem('btnInicioHabilitado', 'false');
            localStorage.setItem('btnSeleccionRutaHabilitado', 'false');
            localStorage.setItem('btnFinHabilitado', 'true');

            // Actualizar botones
            btnInicio.disabled = true;
            btnSeleccionRuta.disabled = true;
            btnFin.disabled = false;

            // Restaurar variables globales
            window.rutaSeleccionada = data.rutaSeleccionada || 'mejor_ruta_distancia';
            window.primeraActualizacionMapa = false;
            window.primeraVez = false;

            // Actualizar el mapa
            const socket = setupSocket();
            await actualizarRutaSeleccionada(socket);
            iniciarEnvioActualizacion();
        } else {
            // No hay ruta activa en el servidor, limpiar estado si localStorage indica lo contrario
            if (rutaEnProgreso) {
                limpiarEstado();
                btnInicio.disabled = false;
                btnSeleccionRuta.disabled = true;
                btnFin.disabled = true;
            }
        }
    } catch (error) {
        console.error("❌ Error al sincronizar con el servidor:", error);
        // Mantener estado de localStorage si el servidor no responde
    }
}

// Nueva función para limpiar el estado en localStorage
function limpiarEstado() {
    localStorage.removeItem('rutaEnProgreso');
    localStorage.removeItem('rutaSeleccionada');
    localStorage.setItem('btnInicioHabilitado', 'true');
    localStorage.setItem('btnSeleccionRutaHabilitado', 'false');
    localStorage.setItem('btnFinHabilitado', 'false');
    window.rutaSeleccionada = null;
    window.primeraVez = true;
    window.primeraActualizacionMapa = true;
}

function setupUIEvents() {
    // Restaurar estado al cargar la página
    restaurarEstado();

    document.querySelectorAll('input[name="ubicacion"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            document.getElementById("btnSeleccionarUbicacion").disabled = false;
        });
    });

    // Inicializar window.primeraVez al cargar el módulo
    window.primeraVez = localStorage.getItem('rutaEnProgreso') !== 'true';

    document.getElementById("btnSeleccionarUbicacion").addEventListener("click", async () => {
        await cerrarUbicacionModal();
        await mostrarLoader();

        const btnInicio = document.getElementById("btnInicio");
        const btnSeleccionRuta = document.getElementById("btnSeleccionRuta");
        const btnFin = document.getElementById("btnFin");
        const modalText = document.getElementById("modalText");

        try {
            const opcionSeleccionada = document.querySelector('input[name="ubicacion"]:checked').value;
            console.log("📍 Ubicación seleccionada:", opcionSeleccionada);
            window.ultimaParada = opcionSeleccionada === "parqueadero" ? "Carrera 15 #27A-40, Barranquilla" : "actual";
            await gestionarUbicacion(true);
            await iniciarEnvioActualizacion();

            const response = await fetch("/messages");
            const data = await response.json();

            if (data.rutasIA && data.rutasIA.mejor_ruta_distancia && data.rutasIA.mejor_ruta_trafico) {
                window.rutaDistancia = data.rutasIA.mejor_ruta_distancia;
                window.rutaTrafico = data.rutasIA.mejor_ruta_trafico;
                window.distanciaTotalKm = data.rutasIA.distancia_total_km;
                window.tiempoTotalMin = data.rutasIA.tiempo_total_min;

                // Dibujar ambas rutas al inicio
                await actualizarMapa({ mejor_ruta_distancia: window.rutaDistancia, mejor_ruta_trafico: window.rutaTrafico });
                modalText.textContent = "Datos cargados. Escoja la mejor ruta según la información brindada.";
                btnInicio.disabled = true;
                btnSeleccionRuta.disabled = false;
                btnFin.disabled = true;

                // Actualizar localStorage
                localStorage.setItem('btnInicioHabilitado', 'false');
                localStorage.setItem('btnSeleccionRutaHabilitado', 'true');
                localStorage.setItem('btnFinHabilitado', 'false');

                const socket = setupSocket();
                socket.emit("solicitar_mensajes_tcp");
            } else {
                throw new Error("Datos de rutasIA no disponibles o incompletos");
            }
        } catch (error) {
            console.error("❌ Error durante el proceso:", error);
            modalText.textContent = "Error procesando la solicitud o datos no disponibles. Intente de nuevo.";
            btnInicio.disabled = false;
            btnSeleccionRuta.disabled = true;
            btnFin.disabled = true;
            localStorage.setItem('btnInicioHabilitado', 'true');
            localStorage.setItem('btnSeleccionRutaHabilitado', 'false');
            localStorage.setItem('btnFinHabilitado', 'false');
            setTimeout(cerrarLoader, 2000);
            return;
        }

        await cerrarLoader();
    });

    document.getElementById('btnInicio').addEventListener("click", async () => {
        try {
            const response = await fetch("/messages");
            const data = await response.json();

            if (data.tcp && data.tcp.length > 2) {
                abrirUbicacionModal();
            } else {
                const modal = document.getElementById("loaderContainer");
                const loader = document.getElementById("loader");
                const modalText = document.getElementById("modalText");
                const btnInicio = document.getElementById("btnInicio");
                const btnSeleccionRuta = document.getElementById("btnSeleccionRuta");
                const btnFin = document.getElementById("btnFin");

                modal.style.visibility = "visible";
                modal.style.opacity = "1";
                loader.classList.add("hidden");
                modalText.textContent = "Espere a que ingresen pasajeros al sistema.";

                btnInicio.disabled = false;
                btnSeleccionRuta.disabled = true;
                btnFin.disabled = true;
                localStorage.setItem('btnInicioHabilitado', 'true');
                localStorage.setItem('btnSeleccionRutaHabilitado', 'false');
                localStorage.setItem('btnFinHabilitado', 'false');

                setTimeout(() => {
                    modal.style.visibility = "hidden";
                    modal.style.opacity = "0";
                }, 3000);
            }
        } catch (error) {
            console.error("❌ Error verificando messages.tcp:", error);
            const modal = document.getElementById("loaderContainer");
            const loader = document.getElementById("loader");
            const modalText = document.getElementById("modalText");

            modal.style.visibility = "visible";
            modal.style.opacity = "1";
            loader.classList.add("hidden");
            modalText.textContent = "Error en el servidor. Intente de nuevo.";
            setTimeout(cerrarLoader, 3000);
        }
    });

    document.getElementById("btnSeleccionRuta").addEventListener("click", () => {
        mostrarOpcionesRuta();
    });

    document.getElementById("btnFin").addEventListener("click", () => {
        const modal = document.getElementById("confirmContainer");
        modal.style.visibility = "visible";
        modal.style.opacity = "1";
    });

    document.getElementById("confirmYes").addEventListener("click", () => {
        limpiarMapa();
        detenerEnvioActualizacion();
        detenerActualizacionRuta();
        limpiarEstado(); // Limpiar localStorage y variables globales

        const btnInicio = document.getElementById("btnInicio");
        btnInicio.disabled = false;
        btnInicio.classList.remove("btn-disabled");
        btnInicio.classList.add("btn-enabled");

        const btnSeleccionRuta = document.getElementById("btnSeleccionRuta");
        btnSeleccionRuta.disabled = true;
        btnSeleccionRuta.classList.remove("btn-enabled");
        btnSeleccionRuta.classList.add("btn-disabled");

        const btnFin = document.getElementById("btnFin");
        btnFin.disabled = true;
        btnFin.classList.remove("btn-enabled");
        btnFin.classList.add("btn-disabled");

        // Notificar al servidor para limpiar en todos los clientes
        fetch(`${CONFIG.SERVER_URL}/detener-emision`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        })
        .then(res => res.json())
        .then(data => {
            console.log("✅ Emisión detenida en el servidor:", data);
            const socket = setupSocket();
            socket.emit("ruta_finalizada");
        })
        .catch(err => console.error("❌ Error deteniendo emisión:", err));

        cerrarModal();
    });

    document.getElementById("confirmNo").addEventListener("click", cerrarModal);

    document.querySelectorAll('input[name="ruta"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            document.getElementById("btnSeleccionarRutaConfirm").disabled = false;
        });
    });

    document.getElementById("btnSeleccionarRutaConfirm").addEventListener("click", () => {
        window.rutaSeleccionada = document.querySelector('input[name="ruta"]:checked').value;
        const socket = setupSocket();
        cerrarRutaModal();
        bloquearInicio();
        document.getElementById("btnSeleccionRuta").disabled = true;
        document.getElementById("btnFin").disabled = false;

        // Actualizar localStorage
        localStorage.setItem('rutaEnProgreso', 'true');
        localStorage.setItem('rutaSeleccionada', window.rutaSeleccionada);
        localStorage.setItem('btnSeleccionRutaHabilitado', 'false');
        localStorage.setItem('btnFinHabilitado', 'true');

        // Limpiar rutas previas antes de dibujar la seleccionada
        window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
        window.rutasDibujadas = [];

        console.log("🗺️ Ruta seleccionada:", window.rutaSeleccionada);
        fetch(`${CONFIG.SERVER_URL}/seleccionar-ruta`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ruta: window.rutaSeleccionada })
        })
        .then(res => res.json())
        .then(data => {
            console.log("✅ Ruta seleccionada enviada al servidor:", data);
            // Dibujar solo la ruta seleccionada
            const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
            actualizarMapaConRutaSeleccionada(data.locations, color);
        })
        .catch(err => console.error("❌ Error enviando selección de ruta:", err));

        iniciarActualizacionRuta(socket);
        });
}


export { mostrarLoader, cerrarLoader, mostrarOpcionesRuta, cerrarRutaModal, abrirUbicacionModal, cerrarUbicacionModal, bloquearInicio, desbloquearInicio, cerrarModal, setupUIEvents };