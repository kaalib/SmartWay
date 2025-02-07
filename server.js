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


const messages = { tcp: [], udp: [] };

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Get and send API key
app.get('/api/getApiKey', (req, res) => {
    res.json({ apiKey: process.env.api_key1});
});

// Carga los certificados
const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/smartway.ddns.net/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/smartway.ddns.net/fullchain.pem'),
};

// --- Servidor HTTPS ---
const httpsServer = https.createServer(options, (req, res) => {
    if (req.url === '/' && req.method === 'GET') {
        // Sirve el archivo HTML
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));

    } else if (req.url.endsWith('.css') && req.method === 'GET') {
        // Sirve archivos CSS
        const filePath = path.join(__dirname, req.url.slice(1)); // Ruta segura
        if (fs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': 'text/css' });
            res.end(fs.readFileSync(filePath));
        } else {
            res.writeHead(404);
            res.end('Archivo no encontrado');
        }
    } else if (req.url === '/messages' && req.method === 'GET') {
        // Sirve los mensajes en formato JSON
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(messages));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
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
        console.log('Datos recibidos desde TCP:', data.toString());
        messages.tcp.push(data.toString());

        // Guardar mensajes en archivo JSON
        fs.writeFileSync('messages.json', JSON.stringify(messages, null, 2));

        // Enviar datos a los clientes WebSocket
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'tcp', message: data.toString() }));
            }
        });

        socket.write('Mensaje TCP recibido correctamente.');
    });

    socket.on('end', () => {
        console.log('Cliente TCP desconectado');
    });
});

// TCP
tcpServer.listen(7777, '0.0.0.0', () => {
    console.log('Servidor TCP escuchando en el puerto 7777');
});

// --- Servidor UDP ---
const udpServer = dgram.createSocket('udp4');

udpServer.on('message', (msg, rinfo) => {
    console.log(`Datos recibidos desde UDP ${rinfo.address}:${rinfo.port}: ${msg}`);
    messages.udp.push(msg.toString());

    // Guardar mensajes en archivo JSON
    fs.writeFileSync('messages.json', JSON.stringify(messages, null, 2));

    // Enviar datos a los clientes WebSocket
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'udp', message: msg.toString() }));
        }
    });

    udpServer.send('Mensaje UDP recibido correctamente.', rinfo.port, rinfo.address);
});

// UDP
udpServer.bind(7776, '0.0.0.0', () => {
    console.log('Servidor UDP escuchando en el puerto 7776');
});

// --- Redirige tráfico HTTP a HTTPS ---
const httpServer = http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
});

httpServer.listen(80, () => {
    console.log('Servidor HTTP redirigiendo a HTTPS');
});