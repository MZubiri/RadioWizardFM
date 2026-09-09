import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { handleConnection } from './src/chat.js';

const app = express();
app.use(cors());
const httpServer = createServer(app);

// Configure CORS for frontend
const io = new Server(httpServer, {
  path: '/socket.io/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Handle Socket.io connections
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
  handleConnection(io, socket);
});

const PORT = process.env.PORT || process.env.WS_PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🧙‍♂️ WizardFM Chat service listening on port ${PORT}`);
});
