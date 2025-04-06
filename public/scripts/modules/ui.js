// scripts/modules/ui.js
import { actualizarMapa } from './map-markers.js';
import { iniciarActualizacionRuta, detenerActualizacionRuta, actualizarRutaSeleccionada, setupSocket } from './socket.js';
import { mostrarMensajesTCP, ejecutarProcesoenorden, iniciarEnvioActualizacion, detenerEnvioActualizacion, limpiarMapa } from './api.js';
import { gestionarUbicacion, dibujarUbicacionBus } from './location.js';

async function mostrarLoader() {
    const modal = document.getElementById("loaderContainer");
    const loader = document.getElementById("loader");
    const modalText = document.getElementById("modalText");
    const btnInicio = document.getElementById("btnInicio");
    const btnSeleccionRuta = document.getElementById("btnSeleccionRuta");

    modal.style.visibility = "visible";
    modal.style.opacity = "1";
    loader.classList.remove("hidden");
    modalText.textContent = "Calculando ruta";

    let dataLoaded = false;
    let elapsedTime = 0;
    const maxWaitTime = 60000; // 60 segundos

    while (!dataLoaded && elapsedTime < maxWaitTime) {
        try {
            const response = await fetch("/messages");
            const data = await response.json();

            if (data.rutasIA && data.rutasIA.mejor_ruta_distancia && data.rutasIA.mejor_ruta_trafico) {
                window.rutaDistancia = data.rutasIA.mejor_ruta_distancia;
                window.rutaTrafico = data.rutasIA.mejor_ruta_trafico;
                window.distanciaTotalKm = data.rutasIA.distancia_total_km;
                window.tiempoTotalMin = data.rutasIA.tiempo_total_min;
                dataLoaded = true;
            }
        } catch (error) {
            console.error("Error al obtener datos:", error);
        }

        if (!dataLoaded) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            elapsedTime += 1000;
            console.log(`Tiempo transcurrido: ${elapsedTime / 1000} segundos`);
        }
    }

    if (dataLoaded) {
        loader.classList.add("hidden");
        modalText.textContent = "Datos cargados. Escoja la mejor ruta según la información brindada.";
        btnInicio.disabled = true;
        btnSeleccionRuta.disabled = false;
        setTimeout(cerrarLoader, 2000);
        await actualizarMapa({ mejor_ruta_distancia: window.rutaDistancia, mejor_ruta_trafico: window.rutaTrafico });
    } else {
        loader.classList.add("hidden");
        modalText.textContent = "Falla en el servidor. Por favor, intente nuevamente la solicitud.";
        btnInicio.disabled = false;
        btnSeleccionRuta.disabled = true;
        setTimeout(cerrarLoader, 3000);
    }
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

    document.getElementById("btnSeleccionarUbicacion").addEventListener("click", () => {
        const opcionSeleccionada = document.querySelector('input[name="ubicacion"]:checked').value;
        console.log("📍 Ubicación seleccionada:", opcionSeleccionada);
        window.ultimaParada = opcionSeleccionada;
        cerrarUbicacionModal();
        mostrarLoader();
    });

    document.getElementById('btnInicio').addEventListener("click", async () => {
        await abrirUbicacionModal();
        await mostrarMensajesTCP();
        await ejecutarProcesoenorden();
        await iniciarEnvioActualizacion();
        if (window.intervalID) {
            console.log("⚠️ El envío de ubicación ya está activo.");
            return;
        }
        window.intervalID = setInterval(gestionarUbicacion, 10000); // Actualiza ubicación y marcador cada 10s
        console.log("✅ Envío de ubicación activado.");
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

        if (window.intervalID) {
            clearInterval(window.intervalID);
            window.intervalID = null;
            console.log("🚫 Envío de ubicación detenido.");
        }
        window.primeraVez = true;
        window.rutaSeleccionada = null;

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

        fetch(`${CONFIG.SERVER_URL}/seleccionar-ruta`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ruta: window.rutaSeleccionada })
        })
        .then(res => res.json())
        .then(data => console.log("✅ Ruta seleccionada enviada al servidor:", data))
        .catch(err => console.error("❌ Error enviando selección de ruta:", err));
    });
}

export { mostrarLoader, cerrarLoader, mostrarOpcionesRuta, cerrarRutaModal, abrirUbicacionModal, cerrarUbicacionModal, bloquearInicio, desbloquearInicio, cerrarModal, setupUIEvents };