import { checkRateLimit, filterMessage } from './moderation.js';

// Message history - store last 50 messages
const MAX_HISTORY = 50;
let messageHistory = [];
let userCount = 0;

export function handleConnection(io, socket) {
  userCount++;
  io.emit('userCount', userCount);
  console.log(`User connected: ${socket.id}. Total users: ${userCount}`);

  socket.on('join', (userData) => {
    try {
      if (!userData || !userData.name || !userData.house) {
        socket.emit('error', { message: 'Name and house are required' });
        return;
      }

      // Send history to the new user
      socket.emit('history', messageHistory);
    } catch (err) {
      console.error('Error in join event:', err);
    }
  });

  const handleIncomingMessage = (data) => {
    try {
      if (!data || !data.text) {
        socket.emit('error', { message: 'Message text is required' });
        return;
      }

      const { text, name, house, color } = data;

      // Admin clear command
      if (text.trim() === '/clear') {
        messageHistory = [];
        io.emit('chat_cleared');
        io.emit('clear');
        console.log('Chat history cleared via /clear command');
        return;
      }

      // Check rate limit
      if (!checkRateLimit(socket.id)) {
        socket.emit('error', { message: 'You are sending messages too fast. Please wait.' });
        return;
      }

      // Filter message
      const filteredText = filterMessage(text);
      if (filteredText === null) {
        socket.emit('error', { message: 'Tu mensaje contiene palabras o maleficios imperdonables prohibidos en Hogwarts.' });
        return;
      }

      // Detect secret role ALTA
      const isAlta = (name && name.toUpperCase().includes('ALTA')) || (house && house.toUpperCase() === 'ALTA');
      const finalHouse = isAlta ? 'ALTA' : (house || 'Unknown');
      const finalColor = isAlta ? '#c084fc' : (color || 'var(--primary)');

      const msgObj = {
        name: name || 'Anonymous',
        house: finalHouse,
        color: finalColor,
        text: filteredText,
        timestamp: Date.now(),
      };

      // Add to history
      messageHistory.push(msgObj);
      if (messageHistory.length > MAX_HISTORY) {
        messageHistory.shift();
      }

      // Broadcast both event names for compatibility
      io.emit('message', msgObj);
      io.emit('chat_message', msgObj);
    } catch (err) {
      console.error('Error in message event:', err);
    }
  };

  socket.on('message', handleIncomingMessage);
  socket.on('chat_message', handleIncomingMessage);

  // Admin clear chat event (from DJ Panel)
  socket.on('clear_chat', () => {
    messageHistory = [];
    io.emit('chat_cleared');
    io.emit('clear');
    console.log('Chat history cleared by DJ/Admin');
  });

  socket.on('disconnect', () => {
    userCount = Math.max(0, userCount - 1);
    io.emit('userCount', userCount);
    console.log(`User disconnected: ${socket.id}. Total users: ${userCount}`);
  });
}
