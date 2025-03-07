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

// Endpoint para obtener mensajes JSON (esto es una API)
app.get('/messages', (req, res) => {
    res.json(messages);
});

// Endpoint para eliminar mensajes TCP
app.delete('/messages', (req, res) => {
    messages.tcp = []; // Vaciar el array de mensajes TCP
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

// Escucha en el puerto 443
httpsServer.listen(443, () => {
    console.log('Servidor HTTPS escuchando en el puerto 443');
});

// --- Servidor WebSocket ---
const wss = new WebSocket.Server({ server: httpsServer });

wss.on("connection", (ws) => {
    console.log("Cliente WebSocket conectado");

    ws.on("message", (data) => {
        console.log("Mensaje recibido desde WebSocket:", data);
    });

    ws.on("close", () => {
        console.log("Cliente WebSocket desconectado");
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

                // Enviar datos a clientes WebSocket
                const jsonData = JSON.stringify({ type: "tcp", data: respuesta });

                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(jsonData);
                    }
                });

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

// --- Redirige tráfico HTTP a HTTPS ---
const httpServer = http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
});

httpServer.listen(80, () => {
    console.log('Servidor HTTP redirigiendo a HTTPS');
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

// Ruta para enviar datos a Flask
app.post('/enviar-datos', async (req, res) => {
    try {
        const { mensaje, origen } = req.body;

        // Enviar datos a Flask
        const respuesta = await axios.post('http://smartway.ddns.net:5000/api/process', { mensaje, origen });

        console.log("✅ Respuesta de Flask:", respuesta.data);
        res.json({ success: true, data: respuesta.data });
    } catch (error) {
        console.error("❌ Error enviando a Flask:", error.message);
        res.status(500).json({ success: false, message: "Error comunicándose con Flask" });
    }
});
