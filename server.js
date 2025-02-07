const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const net = require('net');
const dgram = require('dgram');

const messages = { tcp: [], udp: [] };

// --- Servidor HTTP ---
const server = http.createServer((req, res) => {
    if (req.url === '/' && req.method === 'GET') {
        // Sirve el archivo HTML
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync('index.html'));
    } else if (req.url.endsWith('.css') && req.method === 'GET') {
        // Sirve archivos CSS
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end(fs.readFileSync(req.url.slice(1))); // Quita el "/" inicial
    } else if (req.url === '/messages' && req.method === 'GET') {
        // Sirve los mensajes en formato JSON
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(messages));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// --- Servidor WebSocket ---
const wss = new WebSocket.Server({ server });

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

// --- Iniciar servidor HTTP y WebSocket ---
server.listen(80, () => {
    console.log('Servidor HTTP y WebSocket escuchando en el puerto 80');
});
