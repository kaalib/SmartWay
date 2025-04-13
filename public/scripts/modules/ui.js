// scripts/modules/ui.js
import CONFIG from '../config.js';
import { actualizarMapa } from './map-markers.js';
import { iniciarActualizacionRuta, detenerActualizacionRuta, actualizarRutaSeleccionada, setupSocket, actualizarMapaConRutaSeleccionada, mostrarMensajesTCP } from './socket.js';
import { iniciarEnvioActualizacion, detenerEnvioActualizacion, limpiarMapa, solicitarActualizacionRutas } from './api.js';
import { gestionarUbicacion} from './location.js';
import { checkUserRole } from './auth.js';
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

    const rutaEnProgreso = localStorage.getItem('rutaEnProgreso') === 'true';
    const rutaSeleccionada = localStorage.getItem('rutaSeleccionada') || null;
    const btnInicioHabilitado = localStorage.getItem('btnInicioHabilitado') !== 'false';
    const btnSeleccionRutaHabilitado = localStorage.getItem('btnSeleccionRutaHabilitado') === 'true';
    const btnFinHabilitado = localStorage.getItem('btnFinHabilitado') === 'true';

    btnInicio.disabled = !btnInicioHabilitado;
    btnSeleccionRuta.disabled = !btnSeleccionRutaHabilitado;
    btnFin.disabled = !btnFinHabilitado;

    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/messages`);
        const data = await response.json();
        const socket = setupSocket();

        if (btnFinHabilitado && data.rutaseleccionada && data.rutaseleccionada.length > 0) {
            console.log("📡 Restaurando ruta activa desde servidor:", data.rutaseleccionada);
            window.rutaSeleccionada = data.rutaSeleccionada || rutaSeleccionada || 'mejor_ruta_distancia';
            window.primeraActualizacionMapa = false;
            window.primeraVez = false;

            const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
            await actualizarMapaConRutaSeleccionada(data.rutaseleccionada, color);

            await iniciarEnvioActualizacion();
            await iniciarActualizacionRuta(socket);
            await actualizarRutaSeleccionada(socket);
            console.log("🔄 Actualizaciones en vivo reactivadas");
        } else if (btnSeleccionRutaHabilitado && data.rutasIA && data.rutasIA.mejor_ruta_distancia && data.rutasIA.mejor_ruta_trafico) {
            console.log("📡 Restaurando rutas para selección:", data.rutasIA);
            window.rutaDistancia = data.rutasIA.mejor_ruta_distancia;
            window.rutaTrafico = data.rutasIA.mejor_ruta_trafico;
            window.distanciaTotalKm = data.rutasIA.distancia_total_km;
            window.tiempoTotalMin = data.rutasIA.tiempo_total_min;

            // Forzar que se dibujen ambas rutas al restaurar
            window.rutaSeleccionada = null; // Asegurar que se dibujen ambas rutas
            await actualizarMapa({ mejor_ruta_distancia: window.rutaDistancia, mejor_ruta_trafico: window.rutaTrafico });
        } else {
            console.log("📡 Sin ruta activa, inicializando botones");
            btnInicio.disabled = false;
            btnInicio.classList.remove("btn-disabled");
            btnInicio.classList.add("btn-enabled");
            btnSeleccionRuta.disabled = true;
            btnSeleccionRuta.classList.remove("btn-enabled");
            btnSeleccionRuta.classList.add("btn-disabled");
            btnFin.disabled = true;
            btnFin.classList.remove("btn-enabled");
            btnFin.classList.add("btn-disabled");
        }
    } catch (error) {
        console.error("❌ Error al sincronizar con el servidor:", error);
        if (btnSeleccionRutaHabilitado) {
            window.rutaDistancia = JSON.parse(localStorage.getItem('rutaDistancia') || '[]');
            window.rutaTrafico = JSON.parse(localStorage.getItem('rutaTrafico') || '[]');
            if (window.rutaDistancia.length > 0 && window.rutaTrafico.length > 0) {
                window.rutaSeleccionada = null; // Asegurar que se dibujen ambas rutas
                await actualizarMapa({ mejor_ruta_distancia: window.rutaDistancia, mejor_ruta_trafico: window.rutaTrafico });
                console.log("🔄 Restaurando rutas desde localStorage como fallback");
            }
        }
    }
}

// Nueva función para limpiar el estado en localStorage
function limpiarEstado() {
    localStorage.removeItem('rutaEnProgreso');
    localStorage.removeItem('rutaSeleccionada');
    localStorage.removeItem('rutaDistancia');
    localStorage.removeItem('rutaTrafico');
    localStorage.setItem('btnInicioHabilitado', 'true');
    localStorage.setItem('btnSeleccionRutaHabilitado', 'false');
    localStorage.setItem('btnFinHabilitado', 'false');
    window.rutaSeleccionada = null;
    window.rutaDistancia = null;
    window.rutaTrafico = null;
    window.primeraVez = true;
    window.primeraActualizacionMapa = true;
}

function setupUIEvents() {
    restaurarEstado();

    document.querySelectorAll('input[name="ubicacion"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            document.getElementById("btnSeleccionarUbicacion").disabled = false;
        });
    });

    window.primeraVez = localStorage.getItem('rutaEnProgreso') !== 'true';

    document.getElementById("btnSeleccionarUbicacion").addEventListener("click", async () => {
        await cerrarUbicacionModal();
        await mostrarLoader();
    
        const btnInicio = document.getElementById("btnInicio");
        const btnSeleccionRuta = document.getElementById("btnSeleccionRuta");
        const btnFin = document.getElementById("btnFin");
        const modalText = document.getElementById("modalText");
    
        try {
            if (!window.map || !window.google || !window.google.maps) {
                console.log("⏳ Esperando inicialización del mapa...");
                await new Promise((resolve, reject) => {
                    const checkMap = setInterval(() => {
                        if (window.map && window.google && window.google.maps) {
                            clearInterval(checkMap);
                            console.log("🗺️ Mapa inicializado");
                            resolve();
                        }
                    }, 100);
                    setTimeout(() => {
                        clearInterval(checkMap);
                        reject(new Error("Mapa no inicializado tras 10 segundos"));
                    }, 10000);
                });
            }
    
            const opcionSeleccionada = document.querySelector('input[name="ubicacion"]:checked').value;
            console.log("📍 Ubicación seleccionada:", opcionSeleccionada);
            window.ultimaParada = opcionSeleccionada === "parqueadero" ? "Carrera 15 #27A-40, Barranquilla" : "actual";
            await gestionarUbicacion(true);
            await iniciarEnvioActualizacion();
    
            // Reintentar obtener /messages hasta que rutasIA esté disponible
            let data;
            let intentos = 0;
            const maxIntentos = 20; // Aumentamos a 20 intentos (20 segundos)
            while (intentos < maxIntentos) {
                const response = await fetch("/messages");
                data = await response.json();
                console.log("📡 Respuesta de /messages (intento", intentos + 1, "):", data); // Depuración
                if (data.rutasIA && data.rutasIA.mejor_ruta_distancia && data.rutasIA.mejor_ruta_trafico) {
                    console.log("✅ rutasIA obtenido después de", intentos + 1, "intentos");
                    break;
                }
                console.log("⏳ rutasIA no disponible, reintentando...", intentos + 1);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo
                intentos++;
            }
    
            if (!data.rutasIA || !data.rutasIA.mejor_ruta_distancia || !data.rutasIA.mejor_ruta_trafico) {
                throw new Error("Datos de rutasIA no disponibles o incompletos después de múltiples intentos");
            }
    
            window.rutaDistancia = data.rutasIA.mejor_ruta_distancia;
            window.rutaTrafico = data.rutasIA.mejor_ruta_trafico;
            window.distanciaTotalKm = data.rutasIA.distancia_total_km;
            window.tiempoTotalMin = data.rutasIA.tiempo_total_min;
    
            localStorage.setItem('rutaDistancia', JSON.stringify(window.rutaDistancia));
            localStorage.setItem('rutaTrafico', JSON.stringify(window.rutaTrafico));
            localStorage.setItem('rutaEnProgreso', 'true');
    
            console.log("🗺️ Datos de rutas obtenidos:", { 
                mejor_ruta_distancia: window.rutaDistancia, 
                mejor_ruta_trafico: window.rutaTrafico 
            });
    
            window.rutaSeleccionada = null;
            await actualizarMapa({ mejor_ruta_distancia: window.rutaDistancia, mejor_ruta_trafico: window.rutaTrafico });
    
            if (window.rutasDibujadas?.length > 0) {
                const bounds = new google.maps.LatLngBounds();
                window.rutasDibujadas.forEach(ruta => {
                    const directions = ruta.getDirections();
                    if (directions?.routes?.[0]?.overview_path) {
                        directions.routes[0].overview_path.forEach(point => bounds.extend(point));
                    } else {
                        console.warn("⚠️ No se encontraron datos de ruta en directionsRenderer:", ruta);
                    }
                });
                if (!bounds.isEmpty()) {
                    window.map.fitBounds(bounds);
                    console.log("🗺️ Mapa ajustado a las rutas dibujadas");
                } else {
                    console.warn("⚠️ Bounds vacíos, no se pudo ajustar el mapa");
                }
            } else {
                console.warn("⚠️ No se dibujaron rutas (window.rutasDibujadas está vacío)");
            }
    
            modalText.textContent = "Datos cargados. Escoja la mejor ruta según la información brindada.";
            btnInicio.disabled = true;
            btnInicio.classList.remove("btn-enabled");
            btnInicio.classList.add("btn-disabled");
            btnSeleccionRuta.disabled = false;
            btnSeleccionRuta.classList.remove("btn-disabled");
            btnSeleccionRuta.classList.add("btn-enabled");
            btnFin.disabled = true;
            btnFin.classList.remove("btn-enabled");
            btnFin.classList.add("btn-disabled");
    
            localStorage.setItem('btnInicioHabilitado', 'false');
            localStorage.setItem('btnSeleccionRutaHabilitado', 'true');
            localStorage.setItem('btnFinHabilitado', 'false');
    
            const socket = setupSocket();
            socket.emit("solicitar_mensajes_tcp");
        } catch (error) {
            console.error("❌ Error al procesar la solicitud:", error.message);
            modalText.textContent = "Error procesando la solicitud. Intente de nuevo.";
            btnInicio.disabled = false;
            btnInicio.classList.remove("btn-disabled");
            btnInicio.classList.add("btn-enabled");
            btnSeleccionRuta.disabled = true;
            btnSeleccionRuta.classList.remove("btn-enabled");
            btnSeleccionRuta.classList.add("btn-disabled");
            btnFin.disabled = true;
            btnFin.classList.remove("btn-enabled");
            btnFin.classList.add("btn-disabled");
            localStorage.setItem('btnInicioHabilitado', 'true');
            localStorage.setItem('btnSeleccionRutaHabilitado', 'false');
            localStorage.setItem('btnFinHabilitado', 'false');
            localStorage.setItem('rutaEnProgreso', 'false');
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
        limpiarEstado();
    
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
    
        const userRole = localStorage.getItem("userRole");
        if (userRole && userRole !== "Administrador") {
            localStorage.removeItem("userRole");
            console.log("🧹 localStorage.userRole eliminado para", userRole);
        }
    
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
    
        setTimeout(() => {
            checkUserRole();
        }, 4000);
    });

    document.getElementById("confirmNo").addEventListener("click", cerrarModal);

    document.querySelectorAll('input[name="ruta"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            document.getElementById("btnSeleccionarRutaConfirm").disabled = false;
        });
    });

    document.getElementById("btnSeleccionarRutaConfirm").addEventListener("click", async () => {
        window.rutaSeleccionada = document.querySelector('input[name="ruta"]:checked').value;
        const socket = setupSocket();
        cerrarRutaModal();
        bloquearInicio();
        document.getElementById("btnSeleccionRuta").disabled = true;
        document.getElementById("btnFin").disabled = false;
    
        localStorage.setItem('rutaEnProgreso', 'true');
        localStorage.setItem('rutaSeleccionada', window.rutaSeleccionada);
        localStorage.setItem('btnSeleccionRutaHabilitado', 'false');
        localStorage.setItem('btnFinHabilitado', 'true');
    
        window.rutasDibujadas.forEach(ruta => ruta.setMap(null));
        window.rutasDibujadas = [];
    
        console.log("🗺️ Ruta seleccionada:", window.rutaSeleccionada);
    
        try {
            const response = await fetch(`${CONFIG.SERVER_URL}/seleccionar-ruta`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ruta: window.rutaSeleccionada })
            });
            const data = await response.json();
    
            if (!response.ok) {
                throw new Error(data.error || "Error al seleccionar la ruta");
            }
    
            console.log("✅ Ruta seleccionada enviada al servidor:", data);
            const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
            await actualizarMapaConRutaSeleccionada(data.locations, color);
    
            // Solo iniciar las actualizaciones después de seleccionar la ruta
            iniciarActualizacionRuta(socket);
        } catch (err) {
            console.error("❌ Error enviando selección de ruta:", err.message);
        }
    });
}


export { mostrarLoader, cerrarLoader, mostrarOpcionesRuta, cerrarRutaModal, abrirUbicacionModal, cerrarUbicacionModal, bloquearInicio, desbloquearInicio, cerrarModal, setupUIEvents };