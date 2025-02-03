const http = require('http'); // Para el servidor HTTP
const net = require('net'); // Para el servidor TCP
const dgram = require('dgram'); // Para el servidor UDP
const WebSocket = require('ws'); // Para el WebSocket

// --- Servidor HTTP ---
const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Servidor HTTP funcionando correctamente.');
  }
});

httpServer.listen(8080, () => {
  console.log('Servidor HTTP escuchando en el puerto 8080');
});

// --- Servidor TCP ---
const tcpServer = net.createServer((socket) => {
  console.log('Cliente TCP conectado');
  
  socket.on('data', (data) => {
    console.log('Datos recibidos del cliente TCP:', data.toString());
    socket.write('Datos recibidos correctamente.');
    
    // Enviar mensaje TCP al cliente WebSocket
    wsServer.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'tcp', message: data.toString() }));
      }
    });
  });

  socket.on('end', () => {
    console.log('Cliente TCP desconectado');
  });
});

tcpServer.listen(7777, () => {
  console.log('Servidor TCP escuchando en el puerto 7777');
});

// --- Servidor UDP ---
const udpServer = dgram.createSocket('udp4');

udpServer.on('message', (msg, rinfo) => {
  console.log(`Datos recibidos desde ${rinfo.address}:${rinfo.port}: ${msg}`);
  
  // Enviar mensaje UDP al cliente WebSocket
  wsServer.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'udp', message: msg.toString() }));
    }
  });

  udpServer.send('Datos recibidos correctamente.', rinfo.port, rinfo.address, (err) => {
    if (err) {
      console.log('Error al enviar respuesta UDP:', err);
    }
  });
});

udpServer.bind(7776, () => {
  console.log('Servidor UDP escuchando en el puerto 7776');
});

// --- Servidor WebSocket ---
const wsServer = new WebSocket.Server({ port: 5000 });

wsServer.on('connection', (ws) => {
  console.log('Cliente WebSocket conectado');
  
  // Enviar un mensaje inicial al cliente WebSocket
  ws.send(JSON.stringify({ type: 'info', message: 'Conexión WebSocket establecida.' }));
});

console.log('Servidor WebSocket escuchando en el puerto 5000');
