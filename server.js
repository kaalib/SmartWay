// Define constansts and call libraries
const dgram = require('dgram');
const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const mysql = require('mysql2');
const path = require('path'); 
const fs = require('fs'); 
const app = express();
const net = require('net');
const axios = require('axios');
const socketIo = require("socket.io");
const fetch = require('node-fetch');
const messages = { tcp: [], rutasIA: {}, bus: [], rutaseleccionada: [], colorRutaSeleccionada: [] }; // Mensajes TCP, la API optimizadora de rutas
require('dotenv').config(); // Cargar variables de entorno
const MAX_TCP_CONNECTIONS = 1;
let activeTcpConnections = 0;


// Connect to MySQL database
const db = mysql.createConnection({
    host: process.env.db_host,
    user: process.env.db_user,
    password: process.env.db_password,
    database: process.env.db_name
});

db.connect((err) => {
    if (err) {
        console.error('❌ Error connecting to MySQL:', err);
        return;
    }
    console.log('✅ Connected to MySQL');
});

// Función para reconectar manualmente si la conexión se pierde
function reconnect() {
    console.log('🔄 Intentando reconectar a MySQL...');
    db.connect((err) => {
        if (err) {
            console.error('❌ Error al reconectar a MySQL:', err.message);
            // Reintentar después de 5 segundos si falla
            setTimeout(reconnect, 5000);
        } else {
            console.log('✅ Reconexión exitosa a MySQL');
        }
    });
}

// Manejar eventos de desconexión
db.on('error', (err) => {
    console.error('❌ Error en la conexión a MySQL:', err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('🔄 Conexión perdida con RDS MySQL, intentando reconectar...');
        reconnect();
    } else {
        throw err; // Otros errores no manejados
    }
});

// Función para mantener la conexión viva con un ping cada 2 horas
function keepAlive() {
    db.query('SELECT id FROM empleados LIMIT 1', (err, results) => {
        if (err) {
            console.error('❌ Error al mantener viva la conexión a RDS MySQL:', err.message);
            if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                reconnect();
            }
        } else {
            console.log('✅ Conexión a RDS MySQL mantenida viva:', new Date().toISOString());
        }
    });
}

// Iniciar el keep-alive cada 2 horas (7200000 ms)
setInterval(keepAlive, 7200000);


// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json()); // Middleware para leer JSON en requests


// Get and send API key
app.get('/api/getApiKey', (req, res) => {
    res.json({ apiKey: process.env.api_key1});
});

// Carga los certificados
const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/smartway.ddns.net/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/smartway.ddns.net/fullchain.pem'),
};

// Configuración del servidor HTTPS con Express
const httpsServer = https.createServer(options, app);



// --- Servidor WebSocket ---
const io = socketIo(httpsServer, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Variable para el intervalo
let tcpInterval = null;

// Iniciar actualizaciones TCP
function startTcpUpdates(io) {
    if (!tcpInterval) {
        console.log("▶️ Iniciando actualizaciones periódicas de mensajes TCP...");
        tcpInterval = setInterval(() => {
            console.log("📡 Emitiendo actualización periódica de mensajes TCP a todos los clientes...");
            io.emit("actualizar_tcp_mensajes", { tcp: messages.tcp });
        }, 60000); // 60 segundos
    }
}

// Detener actualizaciones TCP
function stopTcpUpdates() {
    if (tcpInterval) {
        console.log("⏹️ Deteniendo actualizaciones periódicas de mensajes TCP...");
        clearInterval(tcpInterval);
        tcpInterval = null;
    }
}

// Configuración de Socket.IO
io.on("connection", (socket) => {
    console.log("✅ Cliente conectado a Socket.io");

    // Iniciar actualizaciones si es el primer cliente
    if (io.engine.clientsCount === 1) {
        startTcpUpdates(io);
    }

    socket.on("actualizar_ruta_seleccionada", (data) => {
        console.log("📡 Ruta seleccionada recibida del cliente:", data);
    
        if (messages.rutaseleccionada.length === 0) {
            console.error("❌ No hay ruta seleccionada previa para actualizar");
            return;
        }
    
        messages.rutaseleccionada = data.locations.map((loc, index) => {
            const existingStop = messages.rutaseleccionada[index] || {};
            return {
                id: index === 0 ? "bus" : `parada_${index}`,
                nombre: existingStop.nombre || (index === 0 ? "Bus" : `Parada ${index}`),
                direccion: `${loc.lat},${loc.lng}`,
                bus: existingStop.bus !== undefined ? existingStop.bus : 1
            };
        });
    
        console.log("✅ rutaseleccionada actualizada desde el cliente:", messages.rutaseleccionada);
    
        fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
            if (err) console.error("❌ Error guardando rutaseleccionada:", err);
        });
    
        io.emit("ruta_seleccionada_actualizada", {
            ruta: data.ruta,
            locations: messages.rutaseleccionada,
            color: (data.ruta || messages.colorRutaSeleccionada) === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900'
        });
    });

    socket.on("solicitar_mensajes_tcp", () => {
        console.log("📡 Cliente solicitó mensajes TCP");
        io.emit("actualizar_tcp_mensajes", { tcp: messages.tcp });
    });

    socket.on("actualizar_ubicacion_bus", (ubicacion) => {
        console.log("📡 Ubicación del bus recibida del cliente:", ubicacion);
        io.emit("actualizarUbicacionBus", ubicacion);
    });

    socket.on("ruta_finalizada", () => {
        console.log("📡 Ruta finalizada recibida del conductor");
        io.emit("limpiar_mapa_y_mostrar_mensaje"); // Emitir a todos los clientes
    });

    socket.on("disconnect", () => {
        console.log("❌ Cliente desconectado");
        // Detener actualizaciones si no hay más clientes
        if (io.engine.clientsCount === 0) {
            stopTcpUpdates();
        }
    });
});



// 📡 Emitir actualización de rutasIA
function emitirActualizacionRutas() {
    if (!messages.rutasIA) {
        console.log("⚠️ No hay rutasIA para emitir.");
        return;
    }
    io.emit("optimizar_rutas", { rutasIA: messages.rutasIA });
    console.log("📡 Emitiendo rutas a todos los clientes WebSocket:", messages.rutasIA);
}

// 🔄 Control de emisión
let emitirRutas = false;
let intervaloRutas = null;
let colorRutaSeleccionada = null; // Variable para rastrear la ruta seleccionada

// ✅ Iniciar emisión de rutasIA
function iniciarEmisionRutas() {
    if (!emitirRutas) {
        emitirRutas = true;
        intervaloRutas = setInterval(() => {
            if (emitirRutas) {
                emitirActualizacionRutas(); // ✅ Se usa la función en lugar de repetir código
            }
        }, 600000); // 10 minutos
        console.log("✅ Emisión de rutas ACTIVADA");
    }
}

if (emitirRutas && messages.rutaseleccionada.length > 0) {
    console.log("🔁 Ya hay una ruta activa. Ignorando nueva selección.");
    return res.status(400).json({ success: false, message: "Ruta ya en emisión." });
}

// 🛑 Detener emisión de rutasIA
function detenerEmisionRutas() {
    if (emitirRutas) {
        emitirRutas = false;
        clearInterval(intervaloRutas);
        intervaloRutas = null;
        console.log("🛑 Emisión de rutas DETENIDA");
    }
}

// 🔘 Endpoints para activar/desactivar desde el frontend
let flaskIntervalId = null;

app.post("/iniciar-emision", (req, res) => {
    iniciarEmisionRutas();
    res.json({ estado: emitirRutas, message: "Emisión iniciada" });
});

// Reiniciar rutasIA al finalizar la ruta
app.post("/detener-emision", (req, res) => {
    detenerEmisionRutas();
    if (flaskIntervalId) {
        clearInterval(flaskIntervalId);
        flaskIntervalId = null;
        console.log("🛑 Actualización periódica a Flask DETENIDA");
    }
    messages.rutasIA = {}; // Reiniciar rutasIA
    messages.rutaseleccionada = []; // Reiniciar ruta seleccionada
    colorRutaSeleccionada = null;
    fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
        if (err) console.error("❌ Error guardando messages.json:", err);
    });
    res.json({ estado: emitirRutas, message: "Emisión detenida" });
});

// Ajustar el envío a Flask para manejar coordenadas
app.post("/enviar-direcciones", async (req, res) => {
    if (!messages.tcp || messages.tcp.length === 0) {
        return res.status(400).json({ success: false, message: "No hay direcciones" });
    }

    const direcciones = messages.tcp.map(msg => {
        if (typeof msg.direccion === "object" && msg.direccion.lat && msg.direccion.lng) {
            return `${msg.direccion.lat},${msg.direccion.lng}`;
        }
        return msg.direccion;
    });
    console.log("📤 Enviando direcciones a Flask:", direcciones);

    try {
        const respuestaFlask = await axios.post("http://smartway.ddns.net:5000/api/process", { direcciones });
        console.log("📥 Respuesta de Flask:", respuestaFlask.data);
        messages.rutasIA = respuestaFlask.data.rutasIA || [];
        fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
            if (err) console.error("❌ Error guardando rutasIA:", err);
        });
        emitirActualizacionRutas();
        res.json({ success: true, rutasIA: messages.rutasIA });
    } catch (error) {
        console.error("❌ Error al comunicarse con Flask:", error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, message: "Error en Flask" });
    }
});

app.post("/seleccionar-ruta", async (req, res) => {
    if (emitirRutas && messages.rutaseleccionada.length > 0) {
        console.log("🔁 Ya hay una ruta activa. Ignorando nueva selección.");
        return res.status(400).json({ success: false, message: "Ya se está emitiendo una ruta." });
    }

    const { ruta } = req.body;
    if (!ruta) {
        return res.status(400).json({ success: false, message: "Falta la ruta seleccionada" });
    }

    if (!messages.rutasIA || !messages.rutasIA[ruta]) {
        console.error("❌ No se encontró la ruta en rutasIA:", ruta);
        return res.status(400).json({ success: false, message: "Ruta no válida" });
    }

    const busUbicacion = messages.bus.length > 0 ? `${messages.bus[0].direccion.lat},${messages.bus[0].direccion.lng}` : messages.rutasIA[ruta][0];
    messages.rutaseleccionada = [
        { id: "bus", nombre: "Bus", direccion: busUbicacion, bus: 1 }
    ];

    // Mapear las direcciones de rutasIA a nombres de empleados desde tcp
    const paradas = messages.rutasIA[ruta].slice(1).map((direccion, index) => {
        // Buscar el empleado en tcp que coincida con la dirección
        const empleado = messages.tcp.find(msg => msg.direccion === direccion && msg.id !== "bus" && msg.id !== "punto_final");
        const nombreCompleto = empleado ? `${empleado.nombre} ${empleado.apellido}` : `Parada ${index + 1}`; // Fallback por seguridad
        return {
            id: `parada_${index + 1}`,
            nombre: nombreCompleto,
            direccion: direccion,
            bus: 1
        };
    });
    messages.rutaseleccionada.push(...paradas);
    messages.colorRutaSeleccionada = ruta; // Asegurar que se guarde

    console.log("✅ Ruta seleccionada guardada en rutaseleccionada (POST):", messages.rutaseleccionada);

    fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
        if (err) console.error("❌ Error guardando rutaseleccionada:", err);
    });

    const color = ruta === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
    io.emit("ruta_seleccionada_actualizada", {
        ruta: ruta,
        locations: messages.rutaseleccionada,
        color // Añadir el color al evento para sincronizar polilíneas
    });

    res.json({ success: true, message: "Ruta seleccionada guardada" });
});

// --- Redirige tráfico HTTP a HTTPS ---
const httpServer = http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
});

httpServer.listen(80, () => {
    console.log('Servidor HTTP redirigiendo a HTTPS');
});

// Escucha en el puerto 443
httpsServer.listen(443, () => {
    console.log('Servidor HTTPS escuchando en el puerto 443');
});

// Endpoint para obtener mensajes JSON (esto es una API)
app.get('/messages', (req, res) => {
    res.json(messages);
});



// Endpoint para eliminar mensajes TCP y  rutasIA
app.delete('/messages', (req, res) => {
    messages.tcp = []; // Vaciar el array de mensajes TCP
    messages.rutasIA = {}; // Vaciar el array de mensajes rutasIA
    messages.bus = []; // Vaciar el array de mensajes bus
    messages.rutaseleccionada = []; // Vaciar el array de mensajes rutaseleccionada
    messages.colorRutaSeleccionada = []; // Vaciar el array de mensajes colorRutaSeleccionada
    fs.writeFileSync("messages.json", JSON.stringify(messages, null, 2)); // Guardar cambios en el archivo
    res.json({ success: true, message: "Mensajes en el servidor eliminados" });
});



app.put("/updateBus", (req, res) => {
    const sql = "UPDATE empleados SET bus = 0 WHERE bus = 1";

    db.query(sql, (err, result) => {
        if (err) {
            console.error("❌ Error al actualizar bus en la base de datos:", err);
            return res.status(500).json({ message: "Error al actualizar bus en la base de datos" });
        }

        console.log("✅ Todos los registros con bus = 1 han sido reseteados a 0.");
        res.json({ message: "Todos los empleados han bajado del bus" });
    });
});




// --- Servidor TCP ---


// 📦 Registrar ingreso en base de datos
function registrarIngresoTCP(idEmpleado, ip) {
    const timestamp = new Date();
    const insertSql = "INSERT INTO logs_ingresos (id_empleado, ip, fecha_hora) VALUES (?, ?, ?)";

    db.query(insertSql, [idEmpleado, ip, timestamp], (err) => {
        if (err) {
            console.error("❌ Error al registrar ingreso en la base de datos:", err);
        } else {
            console.log(`🟢 Ingreso registrado en BD para ID ${idEmpleado}`);
        }
    });
}

// 📦 Registrar rechazo en base de datos
function registrarRechazoTCP(ip, motivo) {
    const timestamp = new Date();
    const insertSql = "INSERT INTO logs_rechazos (ip, motivo, fecha_hora) VALUES (?, ?, ?)";

    db.query(insertSql, [ip, motivo, timestamp], (err) => {
        if (err) {
            console.error("❌ Error al registrar rechazo en la base de datos:", err);
        } else {
            console.log(`🛑 Rechazo registrado en BD. IP: ${ip}`);
        }
    });
}


const tcpServer = net.createServer((socket) => {
    if (activeTcpConnections >= MAX_TCP_CONNECTIONS) {
        registrarRechazoTCP(socket.remoteAddress, "Límite de conexiones alcanzado");
        console.log("🚫 Conexión rechazada: límite de conexiones TCP alcanzado.");
        socket.end("Conexión rechazada: límite alcanzado.\n");
        if (!socket.destroyed) {
            socket.destroy();
        }
        return;
    }

    activeTcpConnections++;
    console.log("📡 Nueva conexión TCP. Activas:", activeTcpConnections);

    socket.on("data", (data) => {
        const idEmpleado = parseInt(data.toString().trim(), 10);

        if (isNaN(idEmpleado)) {
            socket.write("Error: ID inválido. Debe ser un número.\n");
            return;
        }

        console.log(`ID recibido: ${idEmpleado}`);
        registrarIngresoTCP(idEmpleado, socket.remoteAddress);

        const updateSql = "UPDATE empleados SET bus = 1 WHERE id = ?";
        db.query(updateSql, [idEmpleado], (updateErr) => {
            if (updateErr) {
                console.error("❌ Error al actualizar la columna bus:", updateErr);
                socket.write("Error al actualizar bus en la base de datos.\n");
                return;
            }

            console.log(`✅ Bus actualizado a 1 para ID ${idEmpleado}`);

            const selectSql = "SELECT nombre, apellido, direccion, bus, cargo FROM empleados WHERE id = ?";
            db.query(selectSql, [idEmpleado], (err, results) => {
                if (err) {
                    console.error("❌ Error en la consulta MySQL:", err);
                    socket.write("Error en la base de datos.\n");
                    return;
                }

                let respuesta;
                if (results.length > 0) {
                    const empleado = results[0];
                    respuesta = {
                        id: idEmpleado,
                        nombre: empleado.nombre,
                        apellido: empleado.apellido,
                        direccion: empleado.direccion,
                        bus: empleado.bus,
                        cargo: empleado.cargo // Incluir cargo en la respuesta
                    };

                    // Si no es conductor, añadir a messages.tcp
                    if (empleado.cargo !== "conductor") {
                        const yaExiste = messages.tcp.find(m => m.id === idEmpleado);
                        if (!yaExiste) {
                            messages.tcp.push({
                                id: idEmpleado,
                                nombre: empleado.nombre,
                                apellido: empleado.apellido,
                                direccion: empleado.direccion,
                                bus: empleado.bus
                            });
                            console.log(`✅ Empleado ${idEmpleado} (${empleado.cargo}) añadido a messages.tcp`);
                        } else {
                            console.log("⚠️ ID ya existe en messages.tcp. Ignorando duplicado:", idEmpleado);
                        }
                    } else {
                        console.log(`🚍 Conductor ${idEmpleado} detectado. No se añade su dirección a messages.tcp, pero bus = 1`);
                    }
                } else {
                    respuesta = { error: "Usuario no encontrado" };
                }

                fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
                    if (err) console.error("Error guardando mensajes en archivo:", err);
                });

                io.emit("actualizar_tcp", { data: respuesta });

                try {
                    socket.write(JSON.stringify(respuesta) + "\n");
                } catch (writeErr) {
                    console.error("❌ Error escribiendo en el socket:", writeErr);
                }
            });
        });
    });

    socket.on("end", () => {
        activeTcpConnections = Math.max(activeTcpConnections - 1, 0);
        console.log("📴 Cliente TCP desconectado. Activas:", activeTcpConnections);
        if (!socket.destroyed) {
            socket.destroy();
        }
    });

    socket.on("error", (err) => {
        if (err.code === "ECONNRESET") {
            console.warn("⚠️ Cliente desconectado abruptamente (ECONNRESET).");
        } else if (err.code === "EPIPE") {
            console.warn("⚠️ Intento de escribir en un socket cerrado (EPIPE).");
        } else {
            console.error("❌ Error en el socket:", err.message);
        }
    
        // Decrementar el contador de conexiones activas
        activeTcpConnections = Math.max(activeTcpConnections - 1, 0);
        console.log("📴 Conexión TCP cerrada por error. Activas:", activeTcpConnections);
    
        // Asegurarnos de que el socket se destruya correctamente
        if (!socket.destroyed) {
            socket.destroy();
        }
    });
});



// TCP
tcpServer.listen(7777, '0.0.0.0', () => {
    console.log('🚀 Servidor TCP escuchando en el puerto 7777');
});

// --- Manejo de errores globales ---
tcpServer.on('error', (err) => {
    console.error('❌ Error en el servidor TCP:', err);
});

process.on('uncaughtException', (err) => {
    console.error('🔥 Se detectó un error no manejado:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Se detectó una promesa rechazada sin manejar:', reason);
});

// --- Servidor UDP --- borrado



// Ruta de login
app.post("/login", (req, res) => {
    const { usuario, contraseña } = req.body;

    const query = `SELECT acceso, bus, cargo FROM empleados WHERE usuario = ? AND contraseña = ? AND (acceso = 1 OR bus = 1) LIMIT 1`;

    db.query(query, [usuario, contraseña], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Error en el servidor" });
        }

        if (results.length > 0) {
            const { acceso, bus, cargo } = results[0];

            let role = "desconocido";

            if (acceso === 1) {
                role = "Administrador";
            } else if (bus === 1) {
                if (cargo.toLowerCase().includes("empleado")) {
                    role = "Empleado";
                } else if (cargo.toLowerCase().includes("conductor")) {
                    role = "Conductor";
                }
            }

            // Enviar el rol y la redirección a map.html
            return res.json({ success: true, role, redirectUrl: "map.html" });
        } else {
            return res.json({ success: false, message: "Usuario o contraseña incorrectos" });
        }
    });
});


app.post('/messages', async (req, res) => {
    try {
        let data = JSON.parse(fs.readFileSync('messages.json', 'utf8')); // 📄 Leer JSON actual
        let nuevaUbicacionBus = req.body.bus;

        if (Array.isArray(nuevaUbicacionBus) && nuevaUbicacionBus.length > 0) {
            data.bus = nuevaUbicacionBus; // 📌 Guardar en `bus[]`
            fs.writeFileSync('messages.json', JSON.stringify(data, null, 2)); // 💾 Guardar cambios
            io.emit("actualizarUbicacionBus", nuevaUbicacionBus);
            console.log("📡 WebSocket emitido: Nueva ubicación del bus", nuevaUbicacionBus);
        }

        res.json({ success: true });
    } catch (error) {
        console.error("❌ Error actualizando `/messages`:", error);
        res.status(500).json({ success: false });
    }
});



// Cache para almacenar las coordenadas geocodificadas
const addressCache = new Map();

// Función para geocodificar una dirección
async function geocodeAddress(address) {
    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: address,
                key: process.env.api_key1 // Usar la clave existente
            }
        });

        if (response.data.status === 'OK') {
            const location = response.data.results[0].geometry.location;
            return { lat: location.lat, lng: location.lng };
        } else {
            throw new Error('No se pudo geocodificar la dirección');
        }
    } catch (error) {
        console.error(`❌ Error geocodificando ${address}:`, error.message);
        return null;
    }
}

// Actualizar ubicación del bus y verificar paradas completadas
let primeraVez = true;

app.post("/actualizar-ubicacion-bus", async (req, res) => {
    const { lat, lng, direccion, ultimaParada } = req.body;
    if (!lat || !lng) {
        return res.status(400).json({ error: "Faltan datos: lat o lng" });
    }

    // Insertar la ubicación en la base de datos
    const fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.query(
        "INSERT INTO ubicaciones_bus (bus_id, lat, lng, fecha) VALUES (?, ?, ?, ?)",
        ["bus", lat, lng, fecha],
        (err) => {
            if (err) console.error("❌ Error insertando ubicación en RDS:", err);
            else console.log("✅ Ubicación insertada en RDS:");
        }
    );

    messages.bus = [{ id: "bus", direccion: { lat, lng }, tiempo: new Date().toISOString() }];
    if (messages.rutaseleccionada.length > 0) {
        messages.rutaseleccionada[0].direccion = `${lat},${lng}`;
    }

    const TOLERANCIA = 0.0005;

    // Geocodificar las direcciones de las paradas (si no están en caché)
    for (let i = 1; i < messages.rutaseleccionada.length; i++) {
        const parada = messages.rutaseleccionada[i];
        let paradaCoords;

        if (addressCache.has(parada.direccion)) {
            paradaCoords = addressCache.get(parada.direccion);
        } else {
            if (parada.direccion.includes(',')) {
                paradaCoords = parada.direccion.split(",").map(Number);
                paradaCoords = { lat: paradaCoords[0], lng: paradaCoords[1] };
            } else {
                paradaCoords = await geocodeAddress(parada.direccion);
                if (paradaCoords) {
                    addressCache.set(parada.direccion, paradaCoords);
                }
            }
        }

        if (!paradaCoords) {
            console.error(`❌ No se pudieron obtener coordenadas para ${parada.direccion}`);
            continue;
        }

        if (parada.bus === 1 &&
            Math.abs(paradaCoords.lat - lat) < TOLERANCIA &&
            Math.abs(paradaCoords.lng - lng) < TOLERANCIA) {
            parada.bus = 0;
            db.query("UPDATE empleados SET bus = 0 WHERE direccion = ?", [parada.direccion], (err) => {
                if (err) console.error("❌ Error actualizando estado bus:", err);
            });
            console.log(`✅ Pasajero en ${parada.direccion} bajó del bus`);

            // Emitir evento al cliente para eliminar el marcador
            io.emit('parada_completada', { paradaId: parada.id });

            const nombreParada = parada.nombre;
            const tcpPasajero = messages.tcp.find(msg => `${msg.nombre} ${msg.apellido}` === nombreParada);
            if (tcpPasajero) {
                tcpPasajero.bus = 0;
                console.log(`✅ Estado bus actualizado a 0 en messages.tcp para ${nombreParada}`);
            }
        }
    }

    messages.tcp = messages.tcp.filter(msg => msg.id !== "bus");
    messages.tcp.unshift({
        id: "bus",
        nombre: "Bus",
        apellido: "",
        direccion: { lat, lng }
    });

    if (ultimaParada) {
        let direccionFinal = ultimaParada === "actual" ? { lat, lng } : ultimaParada;
        const puntoFinal = {
            id: "punto_final",
            nombre: "Punto Final",
            apellido: "",
            direccion: direccionFinal
        };
        if (!messages.tcp.some(msg => msg.id === "punto_final")) {
            messages.tcp.push(puntoFinal);
            console.log("✅ Punto final añadido a messages.tcp:", puntoFinal);
        }

        const direcciones = messages.tcp.map(msg => 
            msg.direccion.lat ? `${msg.direccion.lat},${msg.direccion.lng}` : msg.direccion
        );
        try {
            const flaskResponse = await fetch("http://smartway.ddns.net:5000/api/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ direcciones })
            });
            const flaskData = await flaskResponse.json();
            if (flaskData.status === "success") {
                messages.rutasIA = flaskData.rutasIA;
                console.log("✅ rutasIA recibido de Flask:", messages.rutasIA);
                emitirActualizacionRutas();
            } else {
                console.error("❌ Error en Flask:", flaskData.message);
                messages.rutasIA = {};
                io.emit("optimizar_rutas", { rutasIA: {} });
                return res.status(500).json({ error: "Error procesando rutas en Flask" });
            }
        } catch (error) {
            console.error("❌ Error enviando a Flask:", error);
            messages.rutasIA = {};
            io.emit("optimizar_rutas", { rutasIA: {} });
            return res.status(500).json({ error: "Error conectando con Flask" });
        }
    }

    fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
        if (err) console.error("❌ Error guardando:", err);
    });

    const color = messages.colorRutaSeleccionada === "mejor_ruta_distancia" ? '#00CC66' : '#FF9900';
    io.emit("ruta_seleccionada_actualizada", {
        ruta: messages.colorRutaSeleccionada || "mejor_ruta_distancia",
        locations: messages.rutaseleccionada,
        color
    });
    io.emit("actualizar_tcp_mensajes", { 
        tcp: messages.tcp, 
        rutaseleccionada: messages.rutaseleccionada
    });
    res.json({ success: true });
});