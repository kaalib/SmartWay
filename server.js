const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const messages = { tcp: [], udp: [] };

// Servidor HTTP
const server = http.createServer((req, res) => {
    if (req.url === '/messages' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(messages));
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

server.listen(80, () => {
    console.log('Servidor escuchando en el puerto 80');
});
