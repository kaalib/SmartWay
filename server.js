const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const messages = { tcp: [], udp: [] };

// Servidor HTTP
const server = http.createServer((req, res) => {
    if (req.url === '/' && req.method === 'GET') {
        // Sirve el archivo HTML
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync('index.html'));
    } else if (req.url === '/messages' && req.method === 'GET') {
        // Sirve el JSON con los mensajes
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(messages));
    } else if (req.url.endsWith('.css') && req.method === 'GET') {
        // Sirve archivos CSS
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end(fs.readFileSync(req.url.slice(1))); // Quita el "/" inicial
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// Simulación de recepción de mensajes TCP y UDP
function handleMessage(type, message) {
    if (type === 'tcp') {
        messages.tcp.push(message);
    } else if (type === 'udp') {
        messages.udp.push(message);
    }

    // Escribir los mensajes en un archivo JSON
    fs.writeFileSync('messages.json', JSON.stringify(messages, null, 2));
}

// Servidor WebSocket
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        const { type, message } = JSON.parse(data);
        handleMessage(type, message);
    });
});

// Iniciar servidor
server.listen(80, () => {
    console.log('Servidor escuchando en el puerto 80');
});
