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
const messages = { tcp: [], rutasIA: [], bus: [], rutaseleccionada: [] }; // Mensajes TCP, la API optimizadora de rutas
require('dotenv').config(); // Cargar variables de entorno

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


// Función de geocodificación asíncrona en el backend
async function geocodificarDireccion(direccion) {
    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: direccion,
                key: process.env.api_key1 // Usa tu clave de Google Maps desde .env
            }
        });
        if (response.data.status === "OK" && response.data.results[0]) {
            const { lat, lng } = response.data.results[0].geometry.location;
            return { lat, lng };
        }
        console.warn(`⚠️ No se pudo geocodificar: ${direccion}`);
        return null;
    } catch (error) {
        console.error("❌ Error en geocodificación:", error.message);
        return null;
    }
}

// --- Servidor WebSocket ---
const io = socketIo(httpsServer, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Dentro de io.on("connection", (socket) => { ... })
io.on("connection", (socket) => {
    console.log("✅ Cliente conectado a Socket.io");

    // Manejar la selección y actualización de ruta desde el cliente
    socket.on("actualizar_ruta_seleccionada", (data) => {
        console.log("📡 Ruta seleccionada recibida del cliente:", data);
        // Retransmitir a todos los clientes conectados
        io.emit("ruta_seleccionada_actualizada", data);
    });

    // Nuevo evento para solicitar y emitir mensajes TCP
    socket.on("solicitar_mensajes_tcp", () => {
        console.log("📡 Cliente solicitó mensajes TCP");
        io.emit("actualizar_tcp_mensajes", { tcp: messages.tcp }); // Emitir a todos los clientes
    });

    // Nuevo evento para la ubicación del bus
    socket.on("actualizar_ubicacion_bus", (ubicacion) => {
        console.log("📡 Ubicación del bus recibida del cliente:", ubicacion);
        io.emit("actualizarUbicacionBus", ubicacion); // Retransmitir a todos
    });

    socket.on("disconnect", () => {
        console.log("❌ Cliente desconectado");
    });
});

// Nuevo intervalo para emitir mensajes TCP cada 60 segundos
setInterval(() => {
    console.log("📡 Emitiendo actualización periódica de mensajes TCP a todos los clientes...");
    io.emit("actualizar_tcp_mensajes", { tcp: messages.tcp });
}, 30000); // 30 segundos

// 📡 Emitir actualización de rutasIA
function emitirActualizacionRutas() {
    if (!messages.rutasIA) {
        console.log("⚠️ No hay rutasIA para emitir.");
        return;
    }
    io.emit("actualizar_rutas", { rutasIA: messages.rutasIA });
    console.log("📡 Emitiendo rutas a todos los clientes WebSocket:", messages.rutasIA);
}

// 🔄 Control de emisión
let emitirRutas = false;
let intervaloRutas = null;
let rutaSeleccionada = null; // Variable para rastrear la ruta seleccionada

// ✅ Iniciar emisión de rutasIA
function iniciarEmisionRutas() {
    if (!emitirRutas) {
        emitirRutas = true;
        intervaloRutas = setInterval(() => {
            if (emitirRutas) {
                emitirActualizacionRutas(); // ✅ Se usa la función en lugar de repetir código
            }
        }, 10000);
        console.log("✅ Emisión de rutas ACTIVADA");
    }
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

// Modificar el endpoint de detener-emision para detener también la actualización a Flask
app.post("/detener-emision", (req, res) => {
    detenerEmisionRutas();
    if (flaskIntervalId) {
        clearInterval(flaskIntervalId);
        flaskIntervalId = null;
        console.log("🛑 Actualización periódica a Flask DETENIDA");
    }
    rutaSeleccionada = null; // Reiniciar la ruta seleccionada
    res.json({ estado: emitirRutas, message: "Emisión detenida" });
});

// Ajustar el envío a Flask para manejar coordenadas
app.post("/enviar-direcciones", async (req, res) => {
    if (!messages.tcp || messages.tcp.length === 0) {
        return res.status(400).json({ success: false, message: "No hay direcciones" });
    }

    const direcciones = messages.tcp.map(msg => {
        if (typeof msg.direccion === "object" && msg.direccion.lat && msg.direccion.lng) {
            return `${msg.direccion.lat},${msg.direccion.lng}`; // Convertir a formato "lat,lng" para Flask
        }
        return msg.direccion; // Mantener direcciones de texto
    });
    console.log("📤 Enviando direcciones a Flask:", direcciones);

    try {
        const respuestaFlask = await axios.post("http://smartway.ddns.net:5000/api/process", { direcciones });
        messages.rutasIA = respuestaFlask.data.rutasIA || [];
        fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
            if (err) console.error("❌ Error guardando rutasIA:", err);
        });
        emitirActualizacionRutas();
        res.json({ success: true, rutasIA: messages.rutasIA });
    } catch (error) {
        console.error("❌ Error al comunicarse con Flask:", error.message);
        res.status(500).json({ success: false, message: "Error en Flask" });
    }
});

// Endpoint para seleccionar ruta y poblar rutaseleccionada
app.post("/seleccionar-ruta", async (req, res) => {
    const rutaSeleccionada = req.body.ruta;
    if (!messages.rutasIA[rutaSeleccionada]) {
        return res.status(400).json({ success: false, message: "Ruta no disponible" });
    }

    // Poblar rutaseleccionada con el bus como punto 1 y paradas geocodificadas
    const busUbicacion = messages.bus.length > 0 ? messages.bus[0].direccion : { lat: 4.60971, lng: -74.08175 };
    messages.rutaseleccionada = [
        { id: "bus", nombre: "Bus", direccion: busUbicacion, bus: 1 }
    ];

    const paradas = await Promise.all(messages.rutasIA[rutaSeleccionada].map(async (direccion, index) => {
        const coords = await geocodificarDireccion(direccion);
        return {
            id: `parada_${index + 1}`,
            nombre: `Pasajero ${index + 1}`,
            direccion: coords || { lat: 0, lng: 0 },
            bus: 1,
            direccionTexto: direccion // Guardar texto para mostrar en frontend
        };
    }));
    messages.rutaseleccionada.push(...paradas);

    fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
        if (err) console.error("❌ Error guardando rutaseleccionada:", err);
    });
    emitirActualizacionRutas();
    res.json({ success: true, message: "Ruta seleccionada y rutaseleccionada poblada" });
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
    messages.rutasIA = []; // Vaciar el array de mensajes rutasIA
    messages.bus = []; // Vaciar el array de mensajes bus
    fs.writeFileSync("messages.json", JSON.stringify(messages, null, 2)); // Guardar cambios en el archivo
    res.json({ success: true, message: "Mensajes TCP eliminados" });
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
const tcpServer = net.createServer((socket) => {
    console.log("Cliente TCP conectado");

    socket.on("data", (data) => {
        const idEmpleado = parseInt(data.toString().trim(), 10); // Convertir a número

        if (isNaN(idEmpleado)) {
            socket.write("Error: ID inválido. Debe ser un número.\n");
            return;
        }

        console.log(`ID recibido: ${idEmpleado}`);

        // Actualizar el estado de 'bus' a 1 para este ID
        const updateSql = "UPDATE empleados SET bus = 1 WHERE id = ?";
        db.query(updateSql, [idEmpleado], (updateErr) => {
            if (updateErr) {
                console.error("❌ Error al actualizar la columna bus:", updateErr);
                socket.write("Error al actualizar bus en la base de datos.\n");
                return;
            }

            console.log(`✅ Bus actualizado a 1 para ID ${idEmpleado}`);

            // Obtener los datos del empleado incluyendo 'bus'
            const selectSql = "SELECT nombre, apellido, direccion, bus FROM empleados WHERE id = ?";
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
                        bus: empleado.bus // Incluir el estado del bus en la respuesta
                    };
                } else {
                    respuesta = { error: "Usuario no encontrado" };
                }

                // Guardar mensajes en JSON sin bloquear la ejecución
                messages.tcp.push(respuesta);
                fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
                    if (err) console.error("Error guardando mensajes en archivo:", err);
                });

                // 🚀 Enviar datos a todos los clientes de Socket.io (en lugar de WebSocket puro)
                io.emit("actualizar_tcp", { data: respuesta });

                // Enviar respuesta al cliente TCP con manejo de errores en socket.write
                try {
                    socket.write(JSON.stringify(respuesta) + "\n");
                } catch (writeErr) {
                    console.error("❌ Error escribiendo en el socket:", writeErr);
                }
            });
        });
    });

    socket.on("end", () => {
        console.log("Cliente TCP desconectado");
    });

    socket.on("error", (err) => {
        if (err.code === "ECONNRESET") {
            console.warn("⚠️ Cliente desconectado abruptamente.");
        } else {
            console.error("❌ Error en el socket:", err);
        }
        socket.destroy(); // Destruir el socket para evitar fugas de memoria
    });
    
    // Mover el manejo de errores del socket aquí
    socket.on("error", (err) => {
        if (err.code === 'EPIPE') {
            console.warn('⚠️ Intento de escribir en un socket cerrado.');
        } else {
            console.error("❌ Error en el socket:", err);
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

// Actualizar ubicación del bus y verificar paradas completadas
// Actualizar ubicación del bus y verificar paradas completadas
app.post("/actualizar-ubicacion-bus", async (req, res) => {
    const { lat, lng, direccion, ultimaParada } = req.body;
    if (!lat || !lng) {
        return res.status(400).json({ error: "Faltan datos: lat o lng" });
    }

    messages.bus = [{ id: "bus", direccion: { lat, lng }, tiempo: new Date().toISOString() }];
    if (messages.rutaseleccionada.length > 0) {
        messages.rutaseleccionada[0].direccion = { lat, lng }; // Actualizar punto 1 (bus)
    }

    // Verificar si el bus llegó a alguna parada
    const TOLERANCIA = 0.0005; // ~50 metros
    for (let i = 1; i < messages.rutaseleccionada.length; i++) {
        const parada = messages.rutaseleccionada[i];
        if (parada.bus === 1 && Math.abs(parada.direccion.lat - lat) < TOLERANCIA && Math.abs(parada.direccion.lng - lng) < TOLERANCIA) {
            parada.bus = 0;
            db.query("UPDATE empleados SET bus = 0 WHERE direccion = ?", [parada.direccionTexto], (err) => {
                if (err) console.error("❌ Error actualizando estado bus:", err);
            });
            console.log(`✅ Pasajero en ${parada.direccionTexto} bajó del bus`);
        }
    }

    // Actualizar o añadir la posición del bus en tcp
    if (direccion) {
        messages.tcp = messages.tcp.filter(msg => msg.id !== "bus"); // Eliminar bus anterior
        messages.tcp.unshift({
            id: "bus",
            nombre: "Bus",
            apellido: "",
            direccion: { lat, lng } // Usar coordenadas directamente
        });
        console.log("✅ messages.tcp actualizado con coordenadas del bus:", messages.tcp[0]);
    }

    if (ultimaParada) {
        const puntoFinalCoords = ultimaParada === "actual" ? { lat, lng } : await geocodificarDireccion("Carrera 15 #27A-40");
        const puntoFinal = {
            id: "punto_final",
            nombre: "Punto Final",
            apellido: "",
            direccion: puntoFinalCoords,
            bus: 1,
            direccionTexto: ultimaParada === "actual" ? `${lat}, ${lng}` : "Carrera 15 #27A-40"
        };
        messages.rutaseleccionada.push(puntoFinal);
        messages.tcp.push(puntoFinal);
    }

    fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
        if (err) console.error("❌ Error guardando:", err);
    });
    io.emit("actualizarUbicacionBus", messages.rutaseleccionada);
    res.json({ success: true });
});

// Agregar este nuevo endpoint para manejar el punto final
app.post("/agregar-punto-final", (req, res) => {
    const { nombre, direccion } = req.body;
    
    if (!nombre || !direccion) {
        return res.status(400).json({ success: false, message: "Faltan datos requeridos" });
    }
    
    // Crear objeto para el punto final
    const puntoFinal = {
        id: "punto_final",
        nombre: nombre,
        apellido: "",
        direccion: direccion
    };
    
    // Agregar al final del array TCP
    messages.tcp.push(puntoFinal);
    
    // Guardar en el archivo JSON
    fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
        if (err) {
            console.error("❌ Error guardando punto final:", err);
            return res.status(500).json({ success: false, message: "Error al guardar punto final" });
        }
        console.log("✅ Punto final guardado en messages.json");
        res.json({ success: true, message: "Punto final agregado correctamente" });
    });
});