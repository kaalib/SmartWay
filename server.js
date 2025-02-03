const http = require('http'); // Para el servidor HTTP
const net = require('net'); // Para el servidor TCP
const dgram = require('dgram'); // Para el servidor UDP
const WebSocket = require('ws'); // Para WebSocket

// Crear el servidor HTTP
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<html><body><h1>Servidor HTTP funcionando correctamente</h1></body></html>');
});

// Crear el WebSocket Server
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws) => {
  console.log('Cliente WebSocket conectado');

  // Enviar un mensaje de bienvenida al cliente WebSocket
  ws.send(JSON.stringify({ type: 'info', message: 'Conexión WebSocket establecida' }));

  // Recibir y mostrar los mensajes de los servidores TCP/UDP
  const sendToClient = (type, message) => {
    ws.send(JSON.stringify({ type, message }));
  };

  // --- Servidor TCP ---
  const tcpServer = net.createServer((socket) => {
    console.log('Cliente TCP conectado');
    
    socket.on('data', (data) => {
      console.log('Datos recibidos del cliente TCP:', data.toString());
      sendToClient('tcp', `Datos TCP: ${data.toString()}`);
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
    sendToClient('udp', `Datos UDP: ${msg}`);
  });

  udpServer.bind(7776, () => {
    console.log('Servidor UDP escuchando en el puerto 7776');
  });

});

// Iniciar el servidor HTTP en el puerto 80
httpServer.listen(80, () => {
  console.log('Servidor HTTP escuchando en el puerto 80');
});
