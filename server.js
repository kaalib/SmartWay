const WebSocket = require('ws');
const dgram = require('dgram');
const net = require('net');
const http = require('http');

// Crear servidor HTTP
const serverHttp = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Servidor HTTP funcionando correctamente. Ver mensajes en el puerto 80.');
});
serverHttp.listen(80, '0.0.0.0', () => {
  console.log('Servidor HTTP corriendo en el puerto 80');
});

// Crear WebSocket Server
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
  console.log('Cliente WebSocket conectado');
  // Al recibir un mensaje en el WebSocket, lo mostramos
  ws.on('message', (message) => {
    console.log('Mensaje recibido: ', message);
  });
});

// Vincular WebSocket al servidor HTTP
serverHttp.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Crear servidor UDP
const udpServer = dgram.createSocket('udp4');

udpServer.on('message', (msg, rinfo) => {
  console.log(`Paquete UDP recibido: ${msg}`);
  // Enviar mensaje al WebSocket conectado
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'udp', message: msg.toString() }));
    }
  });
});

// Escuchar en el puerto 7776 para UDP
udpServer.bind(7776, () => {
  console.log('Escuchando UDP en el puerto 7776');
});

// Crear servidor TCP
const tcpServer = net.createServer((socket) => {
  console.log('Conexión TCP establecida');
  
  socket.on('data', (data) => {
    console.log(`Paquete TCP recibido: ${data}`);
    // Enviar mensaje al WebSocket conectado
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'tcp', message: data.toString() }));
      }
    });
  });

  socket.on('end', () => {
    console.log('Conexión TCP terminada');
  });
});

// Escuchar en el puerto 7777 para TCP
tcpServer.listen(7777, () => {
  console.log('Escuchando TCP en el puerto 7777');
});
