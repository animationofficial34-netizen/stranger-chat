const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let waitingUsers = []; // {id, mode}
let partners = {}; // id -> partnerId

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('find-stranger', (data) => {
    const mode = data?.mode || 'text'; // text or video
    // remove from waiting if already there
    waitingUsers = waitingUsers.filter(u => u.id!== socket.id);

    if (waitingUsers.length > 0) {
      // Find same mode user
      let index = waitingUsers.findIndex(u => u.mode === mode);
      if (index === -1) index = 0; // if no same mode, match any

      const partner = waitingUsers.splice(index, 1)[0];
      partners[socket.id] = partner.id;
      partners[partner.id] = socket.id;

      io.to(partner.id).emit('matched', { partnerId: socket.id, initiator: true });
      io.to(socket.id).emit('matched', { partnerId: partner.id, initiator: false });
    } else {
      waitingUsers.push({ id: socket.id, mode });
      socket.emit('waiting');
    }
  });

  socket.on('next-stranger', (data) => {
    const mode = data?.mode || 'text';
    // disconnect old partner
    const oldPartner = partners[socket.id];
    if (oldPartner) {
      io.to(oldPartner).emit('partner-left');
      delete partners[oldPartner];
      delete partners[socket.id];
    }
    waitingUsers = waitingUsers.filter(u => u.id!== socket.id);
    socket.emit('searching-again');
  });

  // Chat messages
  socket.on('chat-message', (msg) => {
    const partnerId = partners[socket.id];
    if (partnerId) io.to(partnerId).emit('chat-message', msg);
  });

  socket.on('typing', (isTyping) => {
    const partnerId = partners[socket.id];
    if (partnerId) io.to(partnerId).emit('typing', isTyping);
  });

  // WebRTC Signaling for Video
  socket.on('webrtc-offer', (offer) => {
    const partnerId = partners[socket.id];
    if (partnerId) io.to(partnerId).emit('webrtc-offer', offer);
  });
  socket.on('webrtc-answer', (answer) => {
    const partnerId = partners[socket.id];
    if (partnerId) io.to(partnerId).emit('webrtc-answer', answer);
  });
  socket.on('ice-candidate', (candidate) => {
    const partnerId = partners[socket.id];
    if (partnerId) io.to(partnerId).emit('ice-candidate', candidate);
  });

  socket.on('disconnect', () => {
    waitingUsers = waitingUsers.filter(u => u.id!== socket.id);
    const partnerId = partners[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('partner-left');
      delete partners[partnerId];
    }
    delete partners[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Running on', PORT));
