// scripts/modules/ui.js
import CONFIG from '../config.js';
import { actualizarMapa, dibujarRutasPrimeraVez } from './map-markers.js';
import { iniciarActualizacionRuta, detenerActualizacionRuta, actualizarRutaSeleccionada, setupSocket, actualizarMapaConRutaSeleccionada, mostrarMensajesTCP } from './socket.js';
import { iniciarEnvioActualizacion, detenerEnvioActualizacion, limpiarMapa, solicitarActualizacionRutas } from './api.js';
import { gestionarUbicacion } from './location.js';
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
    const btnNavegacion = document.getElementById('btnNavegacion');

    // Leer estado desde localStorage
    const rutaEnProgreso = localStorage.getItem('rutaEnProgreso') === 'true';
    const rutaSeleccionada = localStorage.getItem('rutaSeleccionada') || null;
    const btnInicioHabilitado = localStorage.getItem('btnInicioHabilitado') !== 'false';
    const btnSeleccionRutaHabilitado = localStorage.getItem('btnSeleccionRutaHabilitado') === 'true';
    const btnFinHabilitado = localStorage.getItem('btnFinHabilitado') === 'true';
    const navegacionActiva = localStorage.getItem('navegacionActiva') === 'true';
    const btnNavegacionHabilitado = localStorage.getItem('btnNavegacionHabilitado') === 'true';

    // Leer la última ruta seleccionada desde localStorage
    const ultimaRutaSeleccionada = JSON.parse(localStorage.getItem('ultimaRutaSeleccionada') || '[]');
    const ultimaRutaColor = localStorage.getItem('ultimaRutaColor') || '#00CC66'; // Color por defecto si no está guardado

    // Aplicar estado de botones desde localStorage
    btnInicio.disabled = !btnInicioHabilitado;
    btnSeleccionRuta.disabled = !btnSeleccionRutaHabilitado;
    btnFin.disabled = !btnFinHabilitado;
    btnNavegacion.disabled = !btnNavegacionHabilitado || !rutaEnProgreso;

    // Sincronizar con el servidor
    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/messages`);
        const data = await response.json();
        const socket = setupSocket();

        if (btnFinHabilitado && data.rutaseleccionada && data.rutaseleccionada.length > 0) {
            // Caso: Ruta activa (btnFin habilitado)
            console.log("📡 Restaurando ruta activa desde servidor:", data.rutaseleccionada);
            window.rutaSeleccionada = data.rutaSeleccionada || rutaSeleccionada || 'mejor_ruta_distancia';
            window.primeraActualizacionMapa = false;
            window.primeraVez = false;

            const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
            await actualizarMapaConRutaSeleccionada(data.rutaseleccionada, color);

            // Reactivar actualizaciones en vivo
            await iniciarEnvioActualizacion();
            await iniciarActualizacionRuta(socket);
            await actualizarRutaSeleccionada(socket);
            console.log("🔄 Actualizaciones en vivo reactivadas");
        } else if (btnSeleccionRutaHabilitado && data.rutasIA && data.rutasIA.mejor_ruta_distancia && data.rutasIA.mejor_ruta_trafico) {
            // Caso: Selección de ruta pendiente
            console.log("📡 Restaurando rutas para selección:", data.rutasIA);
            window.rutaDistancia = data.rutasIA.mejor_ruta_distancia;
            window.rutaTrafico = data.rutasIA.mejor_ruta_trafico;
            window.distanciaTotalKm = data.rutasIA.distancia_total_km;
            window.tiempoTotalMin = data.rutasIA.tiempo_total_min;

            await actualizarMapa({ mejor_ruta_distancia: window.rutaDistancia, mejor_ruta_trafico: window.rutaTrafico });
        } else if (ultimaRutaSeleccionada.length > 0) {
            // Caso: Restaurar la última ruta seleccionada desde localStorage
            console.log("📦 Restaurando última ruta seleccionada desde localStorage:", ultimaRutaSeleccionada);
            window.rutaSeleccionada = rutaSeleccionada || 'mejor_ruta_distancia';
            window.primeraActualizacionMapa = false;
            window.primeraVez = false;

            await actualizarMapaConRutaSeleccionada(ultimaRutaSeleccionada, ultimaRutaColor);
            console.log("🗺️ Última ruta seleccionada dibujada desde localStorage");
        } else {
            // Caso: Sin ruta activa
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
        // Fallback: Restaurar desde localStorage si hay datos
        if (ultimaRutaSeleccionada.length > 0) {
            console.log("📦 Restaurando última ruta seleccionada desde localStorage (fallback):", ultimaRutaSeleccionada);
            window.rutaSeleccionada = rutaSeleccionada || 'mejor_ruta_distancia';
            window.primeraActualizacionMapa = false;
            window.primeraVez = false;

            await actualizarMapaConRutaSeleccionada(ultimaRutaSeleccionada, ultimaRutaColor);
            console.log("🗺️ Última ruta seleccionada dibujada desde localStorage (fallback)");
        } else if (btnSeleccionRutaHabilitado) {
            window.rutaDistancia = JSON.parse(localStorage.getItem('rutaDistancia') || '[]');
            window.rutaTrafico = JSON.parse(localStorage.getItem('rutaTrafico') || '[]');
            if (window.rutaDistancia.length > 0 && window.rutaTrafico.length > 0) {
                await actualizarMapa({ mejor_ruta_distancia: window.rutaDistancia, mejor_ruta_trafico: window.rutaTrafico });
                console.log("🔄 Restaurando rutas desde localStorage como fallback");
            }
        }
        // No usar localStorage para btnFinHabilitado, confiar en el servidor
    }
}

// Nueva función para limpiar el estado en localStorage
function limpiarEstado() {
    // Limpiar variables globales relacionadas con las rutas
    window.rutaDistancia = [];
    window.rutaTrafico = [];
    window.distanciaTotalKm = 0;
    window.tiempoTotalMin = 0;
    window.rutaSeleccionada = null;
    window.primeraActualizacionMapa = true;
    window.primeraVez = true;
    window.ultimaParada = null;

    // Limpiar localStorage (excepto userRole, que ya se maneja en el evento click)
    localStorage.removeItem('rutaEnProgreso');
    localStorage.removeItem('navegacionActiva');
    localStorage.removeItem('rutaSeleccionada');
    localStorage.removeItem('rutaDistancia');
    localStorage.removeItem('rutaTrafico');
    localStorage.setItem('btnInicioHabilitado', 'true');
    localStorage.setItem('btnSeleccionRutaHabilitado', 'false');
    localStorage.setItem('btnNavegacionHabilitado', 'false');
    localStorage.setItem('btnFinHabilitado', 'false');
    localStorage.removeItem('ultimaRutaSeleccionada'); 
    localStorage.removeItem('ultimaRutaColor'); 

    console.log("🧹 Estado global y localStorage limpiados (excepto userRole)");
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

    // Simular la respuesta de fetch("/messages") para pruebas locales
    function simularFetchMessages(simularError = false) {
        return new Promise((resolve) => {
            // Caso de éxito: devolver datos con rutasIA
            const datosExito = {
                tcp: [
                    {
                        id: "bus",
                        nombre: "Bus",
                        apellido: "",
                        direccion: {
                            lat: 10.9903872,
                            lng: -74.7896832
                        }
                    },
                    {
                        id: 1,
                        nombre: "Parada",
                        apellido: "1",
                        direccion: "Calle 72 #45-20, Barranquilla, Colombia",
                        bus: 1
                    },
                    {
                        id: 2,
                        nombre: "Parada",
                        apellido: "2",
                        direccion: "Carrera 43 #70-15, Barranquilla, Colombia",
                        bus: 1
                    },
                    {
                        id: 3,
                        nombre: "Parada",
                        apellido: "3",
                        direccion: "Calle 84 #51-30, Barranquilla, Colombia",
                        bus: 1
                    },
                    {
                        id: "punto_final",
                        nombre: "Punto Final",
                        apellido: "",
                        direccion: "Carrera 15 #27A-40, Barranquilla, Colombia"
                    }
                ],
                rutasIA: {
                    mejor_ruta_distancia: [
                        { direccion: "10.9903872,-74.7896832", nombre: "Inicio" },
                        { direccion: "Calle 72 #45-20, Barranquilla, Colombia", nombre: "Parada 1", bus: 1 },
                        { direccion: "Carrera 43 #70-15, Barranquilla, Colombia", nombre: "Parada 2", bus: 1 },
                        { direccion: "Calle 84 #51-30, Barranquilla, Colombia", nombre: "Parada 3", bus: 1 },
                        { direccion: "Carrera 15 #27A-40, Barranquilla, Colombia", nombre: "Destino" }
                    ],
                    mejor_ruta_trafico: [
                        { direccion: "10.9903872,-74.7896832", nombre: "Inicio" },
                        { direccion: "Calle 70 #46-10, Barranquilla, Colombia", nombre: "Parada 1 Alternativa", bus: 1 },
                        { direccion: "Carrera 44 #68-25, Barranquilla, Colombia", nombre: "Parada 2 Alternativa", bus: 1 },
                        { direccion: "Calle 82 #50-40, Barranquilla, Colombia", nombre: "Parada 3 Alternativa", bus: 1 },
                        { direccion: "Carrera 15 #27A-40, Barranquilla, Colombia", nombre: "Destino" }
                    ],
                    distancia_total_km: 15,
                    tiempo_total_min: 30
                }
            };
    
            // Caso de error: devolver datos sin rutasIA
            const datosError = {
                mensaje: "No hay rutas disponibles"
            };
    
            // Simular una respuesta HTTP
            const respuestaSimulada = {
                ok: true,
                json: () => Promise.resolve(simularError ? datosError : datosExito)
            };
    
            setTimeout(() => resolve(respuestaSimulada), 1000); // Simular un pequeño retraso de red
        });
    }

    document.getElementById("btnSeleccionarUbicacion").addEventListener("click", async () => {
        let success = false;
        try {
            await cerrarUbicacionModal();
            await mostrarLoader();
    
            const btnInicio = document.getElementById("btnInicio");
            const btnSeleccionRuta = document.getElementById("btnSeleccionRuta");
            const btnFin = document.getElementById("btnFin");
            const modalText = document.getElementById("modalText");
    
            const opcionSeleccionada = document.querySelector('input[name="ubicacion"]:checked').value;
            console.log("📍 Ubicación seleccionada:", opcionSeleccionada);
            window.ultimaParada = opcionSeleccionada === "parqueadero" ? "Carrera 15 #27A-40, Barranquilla" : "actual";
    
            await gestionarUbicacion(true);
            await iniciarEnvioActualizacion();
    
            let response;
            const esLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
            if (esLocalhost) {
                console.log("🖥️ Ejecutando en localhost, usando datos simulados...");
                const simularError = false;
                response = await simularFetchMessages(simularError);
            } else {
                console.log("🌐 Ejecutando en producción, usando fetch real...");
                response = await fetch("/messages");
            }
    
            if (!response.ok) {
                throw new Error(`Error en la solicitud: ${response.status}`);
            }
            const data = await response.json();
    
            if (!data.rutasIA) {
                throw new Error("No se recibieron rutasIA del servidor");
            }
    
            window.rutaDistancia = data.rutasIA.mejor_ruta_distancia;
            window.rutaTrafico = data.rutasIA.mejor_ruta_trafico;
            window.distanciaTotalKm = data.rutasIA.distancia_total_km;
            window.tiempoTotalMin = data.rutasIA.tiempo_total_min;
    
            const transformarRuta = (ruta, tcp) => {
                return ruta.map((direccion, index) => {
                    let nombre;
                    if (index === 0) {
                        nombre = "Inicio";
                    } else if (index === ruta.length - 1) {
                        nombre = "Destino";
                    } else {
                        const entradaTcp = tcp.find(t => {
                            if (typeof t.direccion === "object") {
                                return `${t.direccion.lat},${t.direccion.lng}` === direccion;
                            }
                            return t.direccion === direccion;
                        });
                        nombre = entradaTcp ? `${entradaTcp.nombre} ${entradaTcp.apellido}`.trim() : `Parada ${index}`;
                    }
    
                    return {
                        direccion: direccion,
                        nombre: nombre,
                        bus: index > 0 && index < ruta.length - 1 ? 1 : undefined
                    };
                });
            };
    
            const rutasIA = {
                mejor_ruta_distancia: transformarRuta(data.rutasIA.mejor_ruta_distancia, data.tcp),
                mejor_ruta_trafico: transformarRuta(data.rutasIA.mejor_ruta_trafico, data.tcp)
            };
    
            localStorage.setItem('rutaDistancia', JSON.stringify(rutasIA.mejor_ruta_distancia));
            localStorage.setItem('rutaTrafico', JSON.stringify(rutasIA.mejor_ruta_trafico));
            localStorage.setItem('rutaEnProgreso', 'true');
    
            console.log("🗺️ Dibujando rutas iniciales:", {
                mejor_ruta_distancia: rutasIA.mejor_ruta_distancia,
                mejor_ruta_trafico: rutasIA.mejor_ruta_trafico
            });
    
            // Usar la nueva función para dibujar las rutas iniciales
            success = await dibujarRutasPrimeraVez(rutasIA);
            if (!success) {
                throw new Error("No se pudieron dibujar las rutas iniciales");
            }
    
            // Actualizar UI si el dibujo fue exitoso
            modalText.textContent = "Datos cargados. Escoja la mejor ruta según la información brindada.";
        } catch (error) {
            console.error("❌ Error:", error);
            modalText.textContent = "Error procesando la solicitud. Intente de nuevo.";
        } finally {
            const btnInicio = document.getElementById("btnInicio");
            const btnSeleccionRuta = document.getElementById("btnSeleccionRuta");
            const btnNavegacion = document.getElementById("btnNavegacion");
            const btnFin = document.getElementById("btnFin");

            if (success) {
                btnInicio.disabled = true;
                btnSeleccionRuta.disabled = false;
                btnNavegacion.disabled = true;
                btnFin.disabled = true;

                localStorage.setItem('btnInicioHabilitado', 'false');
                localStorage.setItem('btnSeleccionRutaHabilitado', 'true');
                localStorage.setItem('btnNavegacionHabilitado', 'false');
                localStorage.setItem('btnFinHabilitado', 'false');
            } else {
                btnInicio.disabled = true;
                btnSeleccionRuta.disabled = false;
                btnNavegacion.disabled = true;
                btnFin.disabled = true;

                localStorage.setItem('btnInicioHabilitado', 'false');
                localStorage.setItem('btnSeleccionRutaHabilitado', 'true');
                localStorage.setItem('btnNavegacionHabilitado', 'false');
                localStorage.setItem('btnFinHabilitado', 'false');
                localStorage.setItem('rutaEnProgreso', 'false');
            }

            const esLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
            if (!esLocalhost && success) {
                const socket = setupSocket();
                socket.emit("solicitar_mensajes_tcp");
            }

            await cerrarLoader();
                }
    });
    
    // Simular la respuesta de fetch("/messages") para pruebas locales
    function simularFetchMessagesBtnInicio(simularError = false) {
        return new Promise((resolve) => {
            // Caso de éxito: devolver datos con tcp con más de 2 elementos
            const datosExito = {
                tcp: [
                    { direccion: "10.9903872,-74.7896832", nombre: "Pasajero 1" },
                    { direccion: "10.9953872,-74.7856832", nombre: "Pasajero 2" },
                    { direccion: "11.0003872,-74.7816832", nombre: "Pasajero 3" }
                ]
            };

            // Caso de error: devolver datos con tcp con menos de 2 elementos
            const datosError = {
                tcp: [
                    { direccion: "10.9903872,-74.7896832", nombre: "Pasajero 1" }
                ]
            };

            // Simular una respuesta HTTP
            const respuestaSimulada = {
                ok: true,
                json: () => Promise.resolve(simularError ? datosError : datosExito)
            };

            setTimeout(() => resolve(respuestaSimulada), 1000); // Simular un pequeño retraso de red
        });
    }

    document.getElementById('btnInicio').addEventListener("click", async () => {
        try {
            // Determinar si estamos en localhost
            const esLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

            let response;
            if (esLocalhost) {
                console.log("🖥️ Ejecutando en localhost, usando datos simulados para btnInicio...");
                const simularError = false; // Cambia a true para simular el caso de error en localhost
                response = await simularFetchMessagesBtnInicio(simularError);
            } else {
                console.log("🌐 Ejecutando en producción, usando fetch real para btnInicio...");
                response = await fetch("/messages");
            }

            if (!response.ok) {
                throw new Error(`Error en la solicitud: ${response.status}`);
            }

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
            console.error("❌ Error en btnInicio:", error);
            const modal = document.getElementById("loaderContainer");
            const modalText = document.getElementById("modalText");
            modal.style.visibility = "visible";
            modal.style.opacity = "1";
            modalText.textContent = "Error al procesar la solicitud. Intente de nuevo.";
            setTimeout(() => {
                modal.style.visibility = "hidden";
                modal.style.opacity = "0";
            }, 3000);
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
        // Limpiar mapa y estado
        limpiarMapa();
        detenerEnvioActualizacion();
        detenerActualizacionRuta();
        limpiarEstado();
        detenerNavegacionConductor();
        

        // Actualizar botones
        const btnInicio = document.getElementById("btnInicio");
    const btnSeleccionRuta = document.getElementById("btnSeleccionRuta");
    const btnNavegacion = document.getElementById("btnNavegacion");
    const btnFin = document.getElementById("btnFin");

    btnInicio.disabled = false;
    btnInicio.classList.remove("btn-disabled");
    btnInicio.classList.add("btn-enabled");

    btnSeleccionRuta.disabled = true;
    btnSeleccionRuta.classList.remove("btn-enabled");
    btnSeleccionRuta.classList.add("btn-disabled");

    btnNavegacion.disabled = true;
    btnNavegacion.classList.remove("btn-enabled");
    btnNavegacion.classList.add("btn-disabled");

    btnFin.disabled = true;
    btnFin.classList.remove("btn-enabled");
    btnFin.classList.add("btn-disabled");

        // Limpiar localStorage para Conductores y Empleados, pero no para Administradores
        const userRole = localStorage.getItem("userRole");
        if (userRole && userRole !== "Administrador") {
            localStorage.removeItem("userRole");
            console.log("🧹 localStorage.userRole eliminado para", userRole);
        }

        // Detener emisión en el servidor
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

        // Forzar la verificación de rol para redirigir si es necesario
        setTimeout(() => {
            checkUserRole();
        }, 4000); // Esperar 4 segundos para que el mensaje se muestre antes de redirigir
    });

    document.getElementById("confirmNo").addEventListener("click", cerrarModal);

    document.querySelectorAll('input[name="ruta"]').forEach((radio) => {
        radio.addEventListener("change", () => {
            document.getElementById("btnSeleccionarRutaConfirm").disabled = false;
        });
    });

    document.getElementById("btnSeleccionarRutaConfirm").addEventListener("click", () => {
        window.rutaSeleccionada = document.querySelector('input[name="ruta"]:checked').value;

        cerrarRutaModal();
        document.getElementById("btnSeleccionRuta").disabled = true;
        document.getElementById("btnNavegacion").disabled = false;
        document.getElementById("btnFin").disabled = false;
    
        localStorage.setItem('rutaEnProgreso', 'true');
        localStorage.setItem('rutaSeleccionada', JSON.stringify(window.rutaSeleccionada));
        localStorage.setItem('btnSeleccionRutaHabilitado', 'false');
        localStorage.setItem('btnNavegacionHabilitado', 'true');
        localStorage.setItem('btnFinHabilitado', 'true');

        // Limpiar solo las polilíneas (mantener los marcadores)
        if (Array.isArray(window.rutasDibujadas)) {
            window.rutasDibujadas.forEach(ruta => {
                if (ruta && typeof ruta.setMap === "function") {
                    ruta.setMap(null);
                }
            });
            window.rutasDibujadas = [];
        }

        console.log("🗺️ Ruta seleccionada:", window.rutaSeleccionada);
        fetch(`${CONFIG.SERVER_URL}/seleccionar-ruta`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ruta: window.rutaSeleccionada })
        })
            .then(res => res.json())
            .then(data => {
                console.log("✅ Ruta seleccionada enviada al servidor:", data);
                const color = window.rutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
                actualizarMapaConRutaSeleccionada(data.locations, color);

                // Guardar rutaseleccionada y el color en localStorage
                localStorage.setItem('ultimaRutaSeleccionada', JSON.stringify(data.locations));
                localStorage.setItem('ultimaRutaColor', color);
            })
            .catch(err => console.error("❌ Error enviando selección de ruta:", err));

        // Iniciar la actualización periódica vía WebSocket
        const socket = setupSocket();
        iniciarActualizacionRuta(socket);
    });

    document.getElementById("btnNavegacion").addEventListener("click", async () => {
        const navegacionActiva = localStorage.getItem('navegacionActiva') === 'true';
        btnNavegacion.disabled = true;
        if (!navegacionActiva) {
            await iniciarNavegacionConductor(); // Espera a que se genere y redirija
        } else {
           
        }
    });
}


export { mostrarLoader, cerrarLoader, mostrarOpcionesRuta, cerrarRutaModal, abrirUbicacionModal, cerrarUbicacionModal, cerrarModal, setupUIEvents };