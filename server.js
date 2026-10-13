const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let waitingQueue = [];

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('find-stranger', () => {
    if (waitingQueue.length > 0) {
      const partnerId = waitingQueue.shift();
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        socket.partnerId = partnerId;
        partnerSocket.partnerId = socket.id;
        socket.emit('matched');
        partnerSocket.emit('matched');
      } else {
        waitingQueue.push(socket.id);
        socket.emit('waiting');
      }
    } else {
      waitingQueue.push(socket.id);
      socket.emit('waiting');
    }
  });
  socket.on('chat-message', (msg) => {
    if (socket.partnerId) io.to(socket.partnerId).emit('chat-message', msg);
  });
  socket.on('next-stranger', () => {
    if (socket.partnerId) {
      const p = io.sockets.sockets.get(socket.partnerId);
      if (p) { p.partnerId = null; p.emit('partner-left'); }
      socket.partnerId = null;
    }
    waitingQueue = waitingQueue.filter(id => id !== socket.id);
    socket.emit('searching-again');
  });
  socket.on('disconnect', () => {
    waitingQueue = waitingQueue.filter(id => id !== socket.id);
    if (socket.partnerId) {
      const p = io.sockets.sockets.get(socket.partnerId);
      if (p) { p.partnerId = null; p.emit('partner-left'); }
    }
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on', PORT));
