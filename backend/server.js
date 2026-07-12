require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const { resolvePort } = require('./utils/config');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});
const connectedUsers = new Map();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Serve frontend
app.use(express.static(path.join(__dirname, '..')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Socket.IO for real-time messaging
io.on('connection', (socket) => {
  socket.on('register-user', (userId) => {
    if (!userId) return;
    socket.data.userId = userId;
    connectedUsers.set(userId, socket.id);
  });

  socket.on('join-room', (roomId) => socket.join(roomId));

  socket.on('leave-room', (roomId) => socket.leave(roomId));

  socket.on('send-message', (payload) => {
    const { roomId, message, recipientId } = payload || {};
    if (roomId) {
      io.to(roomId).emit('new-message', message);
    }

    if (recipientId) {
      const targetSocketId = connectedUsers.get(recipientId);
      if (targetSocketId && targetSocketId !== socket.id) {
        io.to(targetSocketId).emit('new-message', message);
      }
    }
  });

  socket.on('message-deleted', (payload) => {
    const { roomId, messageId } = payload;
    io.to(roomId).emit('message-deleted', { messageId });
  });

  socket.on('contact-added', (payload) => {
    const { userId } = payload;
    io.to(userId).emit('contact-added', payload);
  });

  socket.on('disconnect', () => {
    const userId = socket.data.userId;
    if (userId && connectedUsers.get(userId) === socket.id) {
      connectedUsers.delete(userId);
    }
  });
});

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cercle';
const startServer = (port) => {
  server.removeAllListeners('error');
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const fallbackPort = port + 1;
      console.warn(`⚠ Port ${port} is busy, trying ${fallbackPort} instead...`);
      startServer(fallbackPort);
      return;
    }
    console.error('✗ Server startup error:', err);
    process.exit(1);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`✓ Cercle server running at http://localhost:${port}`);
  });
};

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log('✓ Connected to MongoDB');
    startServer(resolvePort(process.env));
  })
  .catch((err) => {
    console.error('✗ MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = { app, server, io };
