// scripts/modules/ui.js
import { actualizarMapa } from './map-markers.js';
import { iniciarActualizacionRuta, detenerActualizacionRuta, actualizarRutaSeleccionada, setupSocket, mostrarMensajesTCP } from './socket.js';
import { ejecutarProcesoenorden, iniciarEnvioActualizacion, detenerEnvioActualizacion, limpiarMapa } from './api.js';
import { gestionarUbicacion} from './location.js';
import { iniciarNavegacionConductor, detenerNavegacionConductor } from './navigation.js'; 
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

    // Detectar si estamos en entorno local
    const isLocal = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";

    if (isLocal) {
        // Simulación para entorno local con direcciones de Barranquilla
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simula 2 segundos de "carga"

        // Direcciones de Barranquilla para pruebas locales
        const rutasSimuladas = {
            mejor_ruta_distancia: [
                "Calle 72 # 38-50, Barranquilla, Atlántico", // Ejemplo: cerca de Prado
                "Carrera 43 # 82-120, Barranquilla, Atlántico", // Ejemplo: cerca de Villa Country
                "Calle 85 # 50-30, Barranquilla, Atlántico" // Ejemplo: cerca de Alto Prado
            ],
            mejor_ruta_trafico: [
                "Calle 53 # 46-192, Barranquilla, Atlántico", // Ejemplo: cerca del Centro
                "Carrera 54 # 64-50, Barranquilla, Atlántico", // Ejemplo: cerca de El Golf
                "Calle 79 # 42-100, Barranquilla, Atlántico" // Ejemplo: cerca de Villa Campestre
            ],
            distancia_total_km: 12.5, // Valor simulado
            tiempo_total_min: 18 // Valor simulado
        };

        // Asignar datos simulados
        window.rutaDistancia = rutasSimuladas.mejor_ruta_distancia;
        window.rutaTrafico = rutasSimuladas.mejor_ruta_trafico;
        window.distanciaTotalKm = rutasSimuladas.distancia_total_km;
        window.tiempoTotalMin = rutasSimuladas.tiempo_total_min;

        // Actualizar la interfaz
        loader.classList.add("hidden");
        modalText.textContent = "Datos simulados cargados (local). Escoja la mejor ruta.";
        btnInicio.disabled = true;
        btnSeleccionRuta.disabled = false;
        setTimeout(cerrarLoader, 2000);
        await actualizarMapa({ mejor_ruta_distancia: window.rutaDistancia, mejor_ruta_trafico: window.rutaTrafico });
    } else {
        // Lógica original para la nube
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

    document.getElementById("btnSeleccionarUbicacion").addEventListener("click", async () => {
        await cerrarUbicacionModal();
        await ejecutarProcesoenorden();
        await iniciarEnvioActualizacion();
    
        if (window.intervalID) {
            console.log("⚠️ El envío de ubicación ya está activo.");
        } else {
            window.intervalID = setInterval(gestionarUbicacion, 10000);
            console.log("✅ Envío de ubicación activado.");
        }
    
        const opcionSeleccionada = document.querySelector('input[name="ubicacion"]:checked').value;
        console.log("📍 Ubicación seleccionada:", opcionSeleccionada);
        // Asignar ultimaParada según la selección
        window.ultimaParada = opcionSeleccionada === "parqueadero" ? "Carrera 15 #27A-40, Barranquilla" : "actual";
        console.log("📍 ultimaParada asignada:", window.ultimaParada); // Añadir este log
        // Enviar la primera ubicación con ultimaParada al backend
        await gestionarUbicacion(); // Ejecutar inmediatamente para enviar la primera ubicación
        await mostrarLoader();
    
        const socket = setupSocket();
        socket.emit("solicitar_mensajes_tcp");
        console.log("📡 Solicitando mensajes TCP al servidor...");
    });

    document.getElementById('btnInicio').addEventListener("click", () => {
        abrirUbicacionModal();
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