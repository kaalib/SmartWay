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
const messages = { tcp: [], rutasIA: [] }; // Mensajes TCP, la API optimizadora de rutas
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

// --- Servidor WebSocket ---
const io = socketIo(httpsServer, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    console.log("✅ Cliente conectado a Socket.io");


    socket.on("disconnect", () => {
        console.log("❌ Cliente desconectado");
    });
});


// Emitir actualización cada vez que cambian las rutasIA
function emitirActualizacionRutas() {
    io.emit("actualizar_rutas", { rutasIA: messages.rutasIA });
}

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




app.post('/messages/tcp', (req, res) => {
    const { direccion } = req.body;

    if (!direccion) {
        return res.status(400).json({ error: "Falta la dirección en la solicitud" });
    }

    const nuevaUbicacion = { direccion };
    messages.tcp.push(nuevaUbicacion); // 📌 Agregar ubicación a messages.tcp

    // Guardar en archivo JSON
    fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
        if (err) {
            console.error("❌ Error guardando en archivo:", err);
            return res.status(500).json({ error: "Error al guardar la ubicación" });
        }
        console.log("✅ Ubicación guardada:", nuevaUbicacion);
        res.status(200).json({ message: "Ubicación recibida correctamente" });
    });
});


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
            let redirectUrl = "";

            if (acceso === 1) {
                role = "Administrador";
                redirectUrl = "map_admin.html";
            } else if (bus === 1) {
                if (cargo.toLowerCase().includes("empleado")) {
                    role = "Empleado";
                    redirectUrl = "map_empleado.html";
                } else if (cargo.toLowerCase().includes("conductor")) {
                    role = "Conductor";
                    redirectUrl = "map_conductor.html";
                }
            }

            return res.json({ success: true, message: `Ingresando a la vista de ${role}`, redirectUrl });
        } else {
            return res.json({ success: false, message: "Usuario o contraseña incorrectos" });
        }
    });
});


// 📩 Enviar direcciones a Flask
app.post("/enviar-direcciones", async (req, res) => {
    try {
        const direcciones = messages.tcp.map(msg => msg.direccion);
        if (direcciones.length === 0) return res.status(400).json({ error: "No hay direcciones para procesar" });

        console.log("📤 Enviando direcciones a Flask:", direcciones);
        const respuestaFlask = await axios.post("http://smartway.ddns.net:5000/api/process", { direcciones });

        messages.rutasIA = respuestaFlask.data.rutasIA;
        fs.writeFile("messages.json", JSON.stringify(messages, null, 2), (err) => {
            if (err) console.error("Error guardando rutasIA:", err);
        });

        // Emitir la actualización a todos los clientes conectados
        emitirActualizacionRutas();

        console.log("✅ Rutas actualizadas:", messages.rutasIA);
        res.json({ success: true, rutasIA: messages.rutasIA });
    } catch (error) {
        console.error("❌ Error al comunicarse con Flask:", error.message);
        res.status(500).json({ success: false, message: "Error en Flask" });
    }
});


