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

const messages = { tcp: [] }; // Mensajes TCP

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

// Escucha en el puerto 443
httpsServer.listen(443, () => {
    console.log('Servidor HTTPS escuchando en el puerto 443');
});

// --- Servidor WebSocket ---
const wss = new WebSocket.Server({ server: httpsServer });

wss.on('connection', (ws) => {
    console.log('Cliente WebSocket conectado');
    
    ws.on('message', (data) => {
        console.log('Mensaje recibido desde WebSocket:', data);
    });

    ws.on('close', () => {
        console.log('Cliente WebSocket desconectado');
    });
});

// --- Servidor TCP ---
const tcpServer = net.createServer((socket) => {
    console.log('Cliente TCP conectado');

    socket.on('data', (data) => {
        const idEmpleado = parseInt(data.toString().trim(), 10); // Convertir el dato recibido a número

        if (isNaN(idEmpleado)) {
            socket.write('Error: ID inválido. Debe ser un número.\n');
            return;
        }

        console.log(`ID recibido: ${idEmpleado}`);

        // Consulta SQL para obtener nombre y apellido del empleado con la ID recibida
        const sql = 'SELECT nombre, apellido, direccion FROM empleados WHERE id = ?';

        db.query(sql, [idEmpleado], (err, results) => {
            if (err) {
                console.error('Error en la consulta MySQL:', err);
                socket.write('Error en la base de datos.\n');
                return;
            }

            let respuesta = '';

            if (results.length > 0) {
                const empleado = results[0];
                respuesta = {
                    id: idEmpleado,
                    nombre: empleado.nombre,
                    apellido: empleado.apellido,
                    direccion: empleado.direccion
                };
                
     
            } else {
                respuesta = 'Usuario no encontrado.\n';
            }

            // Guardar mensajes en archivo JSON
            messages.tcp.push( respuesta);
            fs.writeFileSync('messages.json', JSON.stringify(messages, null, 2));

            // Enviar datos a los clientes WebSocket
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'tcp', data: respuesta }));
                }
            });

            // Enviar respuesta al cliente TCP
            socket.write(respuesta);
        });
    });

    socket.on('end', () => {
        console.log('Cliente TCP desconectado');
    });
});

// TCP
tcpServer.listen(7777, '0.0.0.0', () => {
    console.log('Servidor TCP escuchando en el puerto 7777');
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

    const query = `SELECT acceso, bus FROM empleados WHERE usuario = ? AND contraseña = ? AND acceso = 1 LIMIT 1`;

    db.query(query, [usuario, contraseña], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Error en el servidor" });
        }

        if (results.length > 0) {
            res.json({ success: true, message: "Inicio de sesión exitoso" });
        } else {
            res.json({ success: false, message: "Usuario o contraseña incorrectos" });
        }
    });
});