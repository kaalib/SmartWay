// scripts/modules/ui.js
import CONFIG from '../config.js';
import { actualizarMapa } from './map-markers.js';
import { iniciarActualizacionRuta, detenerActualizacionRuta, actualizarRutaSeleccionada, setupSocket, mostrarMensajesTCP } from './socket.js';
import { iniciarEnvioActualizacion, detenerEnvioActualizacion, limpiarMapa } from './api.js';
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

function setupUIEvents() {
    document.querySelectorAll('input[name="ubicacion"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            document.getElementById("btnSeleccionarUbicacion").disabled = false;
        });
    });

// Inicializar window.primeraVez al cargar el módulo
window.primeraVez = true;

document.getElementById("btnSeleccionarUbicacion").addEventListener("click", async () => {
    await cerrarUbicacionModal();
    await mostrarLoader(); // Mostrar el loader al inicio

    try {
        await gestionarUbicacion(true);
        //await ejecutarProcesoenorden(); // Descomentarlo si lo necesitas
        const opcionSeleccionada = document.querySelector('input[name="ubicacion"]:checked').value;
        console.log("📍 Ubicación seleccionada:", opcionSeleccionada);
        window.ultimaParada = opcionSeleccionada === "parqueadero" ? "Carrera 15 #27A-40, Barranquilla" : "actual";
        console.log("📍 ultimaParada asignada:", window.ultimaParada);
        await iniciarEnvioActualizacion();

        if (window.intervalID) {
            console.log("⚠️ El envío de ubicación ya está activo.");
        } else {
            window.intervalID = setInterval(() => gestionarUbicacion(false), 10000);
            console.log("✅ Envío de ubicación activado.");
        }

        await solicitarActualizacionRutas()
        const socket = setupSocket();
        socket.emit("solicitar_mensajes_tcp");
        console.log("📡 Solicitando mensajes TCP al servidor...");
    } catch (error) {
        console.error("❌ Error durante el proceso:", error);
        const modalText = document.getElementById("modalText");
        modalText.textContent = "Error procesando la solicitud. Intente de nuevo.";
        setTimeout(cerrarLoader, 2000); // Cerrar después de mostrar el error
        return;
    }

    await cerrarLoader(); // Cerrar el loader al final
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

            // Mostrar mensaje
            modal.style.visibility = "visible";
            modal.style.opacity = "1";
            loader.classList.add("hidden"); // Ocultar el spinner
            modalText.textContent = "Espere a que ingresen pasajeros al sistema.";

            // Estado inicial
            btnInicio.disabled = false;
            btnSeleccionRuta.disabled = true;
            btnFin.disabled = true;

            // Cerrar después de 3 segundos
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
        detenerNavegacionConductor(); // Detener la navegación
        if (window.intervalID) {
            clearInterval(window.intervalID);
            window.intervalID = null;
            console.log("🚫 Envío de ubicación detenido.");
        }
        window.primeraVez = true;
        window.rutaSeleccionada = null;
        window.primeraActualizacionMapa = true; // Reiniciar la bandera

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
        actualizarRutaSeleccionada(socket);
        cerrarRutaModal();
        bloquearInicio();
        document.getElementById("btnSeleccionRuta").disabled = true;
        document.getElementById("btnFin").disabled = false;
        iniciarActualizacionRuta(socket);

        console.log("🗺️ Ruta seleccionada:", window.rutaSeleccionada);
        fetch(`${CONFIG.SERVER_URL}/seleccionar-ruta`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ruta: window.rutaSeleccionada })
        })
        .then(res => res.json())
        .then(data => console.log("✅ Ruta seleccionada enviada al servidor:", data))
        .catch(err => console.error("❌ Error enviando selección de ruta:", err));
    
        // Iniciar navegación después de 10 segundos
        setTimeout(() => {
            iniciarNavegacionConductor(window.rutaSeleccionada);
            console.log("🚗 Vista de navegación del conductor iniciada.");
        }, 10000); // 10 segundos
    });
}

export { mostrarLoader, cerrarLoader, mostrarOpcionesRuta, cerrarRutaModal, abrirUbicacionModal, cerrarUbicacionModal, bloquearInicio, desbloquearInicio, cerrarModal, setupUIEvents };