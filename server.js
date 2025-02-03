const http = require('http'); 
const net = require('net');
const dgram = require('dgram'); 
const WebSocket = require('ws'); // Asegúrate de instalar ws: npm install ws

// --- Servidor HTTP ---
const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('Servidor HTTP funcionando correctamente. Ver mensajes en el puerto 80.');
  }
});

httpServer.listen(80, () => {
  console.log('Servidor HTTP escuchando en el puerto 80');
});

// --- Servidor TCP ---
const tcpServer = net.createServer((socket) => {
  console.log('Cliente TCP conectado');
  
  socket.on('data', (data) => {
    console.log('Datos recibidos del cliente TCP:', data.toString());
    socket.write('Datos recibidos correctamente.');

    // Enviar los datos al WebSocket para la página
    wss.clients.forEach((client) => {
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

  // Enviar los datos al WebSocket para la página
  wss.clients.forEach((client) => {
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

// --- WebSocket para enviar mensajes a la página web ---
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws) => {
  console.log('Cliente WebSocket conectado');
  
  ws.on('message', (message) => {
    console.log('Mensaje recibido en WebSocket:', message);
  });

  ws.on('close', () => {
    console.log('Cliente WebSocket desconectado');
  });
});
