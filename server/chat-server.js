const { WebSocketServer } = require('ws');
const http = require('http');

// --- Configuration ---
const PORT = parseInt(process.env.WS_PORT || '3001', 10);
const MAX_HISTORY = parseInt(process.env.MAX_HISTORY || '100', 10);
const RATE_LIMIT_MS = parseInt(process.env.RATE_LIMIT_MS || '1000', 10);
const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH || '500', 10);
const MAX_NICKNAME_LENGTH = 20;

// --- State ---
const messageHistory = [];
const connectedUsers = new Map(); // ws -> { nickname, color, lastMessage, isAdmin, isMuted }
const bannedNicknames = new Set();

// Magic-themed colors for nicknames
const MAGIC_COLORS = [
  '#c084fc', '#a78bfa', '#818cf8', '#6366f1', // purples
  '#f472b6', '#fb7185', '#f87171',             // pinks/reds
  '#fbbf24', '#f59e0b', '#d97706',             // golds
  '#34d399', '#2dd4bf', '#22d3ee',             // teals
  '#60a5fa', '#38bdf8', '#7dd3fc',             // blues
];

function getRandomColor() {
  return MAGIC_COLORS[Math.floor(Math.random() * MAGIC_COLORS.length)];
}

function sanitize(str) {
  return str.replace(/[<>&"']/g, (c) => {
    const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c];
  });
}

function broadcast(data, excludeWs = null) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(msg);
    }
  });
}

function getOnlineCount() {
  return connectedUsers.size;
}

function broadcastUserCount() {
  broadcast({ type: 'user_count', count: getOnlineCount() });
}

// --- HTTP server for health check ---
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', users: getOnlineCount() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

// --- WebSocket Server ---
const wss = new WebSocketServer({ server, path: '/' });

wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[CONNECT] New connection from ${ip}`);

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Mensaje inválido' }));
      return;
    }

    // --- JOIN ---
    if (data.type === 'join') {
      let nickname = (data.nickname || '').trim().slice(0, MAX_NICKNAME_LENGTH);
      if (!nickname) {
        nickname = `Mago${Math.floor(Math.random() * 9999)}`;
      }

      // Check banned
      if (bannedNicknames.has(nickname.toLowerCase())) {
        ws.send(JSON.stringify({ type: 'error', message: 'Este nombre está baneado' }));
        ws.close();
        return;
      }

      // Check duplicate nickname
      for (const [, user] of connectedUsers) {
        if (user.nickname.toLowerCase() === nickname.toLowerCase()) {
          nickname = `${nickname}${Math.floor(Math.random() * 99)}`;
          break;
        }
      }

      const color = getRandomColor();
      connectedUsers.set(ws, {
        nickname,
        color,
        lastMessage: 0,
        isAdmin: data.adminKey === process.env.ADMIN_KEY,
        isMuted: false,
      });

      // Send history to new user
      ws.send(JSON.stringify({
        type: 'welcome',
        nickname,
        color,
        history: messageHistory,
        userCount: getOnlineCount(),
      }));

      // Broadcast join
      broadcast({
        type: 'system',
        message: `✨ ${nickname} ha entrado a la sala`,
        timestamp: Date.now(),
      });

      broadcastUserCount();
      console.log(`[JOIN] ${nickname} joined (${getOnlineCount()} online)`);
      return;
    }

    // --- MESSAGE ---
    if (data.type === 'message') {
      const user = connectedUsers.get(ws);
      if (!user) {
        ws.send(JSON.stringify({ type: 'error', message: 'Debes unirte primero' }));
        return;
      }

      if (user.isMuted) {
        ws.send(JSON.stringify({ type: 'error', message: 'Estás silenciado' }));
        return;
      }

      // Rate limiting
      const now = Date.now();
      if (now - user.lastMessage < RATE_LIMIT_MS) {
        ws.send(JSON.stringify({ type: 'error', message: 'Estás enviando mensajes muy rápido' }));
        return;
      }
      user.lastMessage = now;

      let text = (data.text || '').trim();
      if (!text || text.length > MAX_MESSAGE_LENGTH) return;

      // --- Admin Commands ---
      if (user.isAdmin && text.startsWith('/')) {
        const parts = text.split(' ');
        const cmd = parts[0].toLowerCase();
        const target = parts[1];

        if (cmd === '/ban' && target) {
          bannedNicknames.add(target.toLowerCase());
          // Kick the user if online
          for (const [clientWs, clientUser] of connectedUsers) {
            if (clientUser.nickname.toLowerCase() === target.toLowerCase()) {
              clientWs.send(JSON.stringify({ type: 'error', message: 'Has sido baneado' }));
              clientWs.close();
              break;
            }
          }
          broadcast({ type: 'system', message: `🚫 ${target} ha sido baneado`, timestamp: Date.now() });
          return;
        }

        if (cmd === '/mute' && target) {
          for (const [, clientUser] of connectedUsers) {
            if (clientUser.nickname.toLowerCase() === target.toLowerCase()) {
              clientUser.isMuted = true;
              break;
            }
          }
          broadcast({ type: 'system', message: `🔇 ${target} ha sido silenciado`, timestamp: Date.now() });
          return;
        }

        if (cmd === '/unmute' && target) {
          for (const [, clientUser] of connectedUsers) {
            if (clientUser.nickname.toLowerCase() === target.toLowerCase()) {
              clientUser.isMuted = false;
              break;
            }
          }
          broadcast({ type: 'system', message: `🔊 ${target} puede hablar de nuevo`, timestamp: Date.now() });
          return;
        }

        if (cmd === '/clear') {
          messageHistory.length = 0;
          broadcast({ type: 'clear', timestamp: Date.now() });
          return;
        }
      }

      // Sanitize and broadcast message
      text = sanitize(text);
      const chatMsg = {
        type: 'message',
        nickname: user.nickname,
        color: user.color,
        text,
        timestamp: Date.now(),
      };

      messageHistory.push(chatMsg);
      if (messageHistory.length > MAX_HISTORY) {
        messageHistory.shift();
      }

      broadcast(chatMsg);
      return;
    }
  });

  ws.on('close', () => {
    const user = connectedUsers.get(ws);
    if (user) {
      connectedUsers.delete(ws);
      broadcast({
        type: 'system',
        message: `🌙 ${user.nickname} ha salido de la sala`,
        timestamp: Date.now(),
      });
      broadcastUserCount();
      console.log(`[LEAVE] ${user.nickname} left (${getOnlineCount()} online)`);
    }
  });

  ws.on('error', (err) => {
    console.error('[WS ERROR]', err.message);
    connectedUsers.delete(ws);
  });
});

// --- Start Server ---
server.listen(PORT, () => {
  console.log(`🧙‍♂️ WizardFM Chat Server running on port ${PORT}`);
  console.log(`   Max history: ${MAX_HISTORY} messages`);
  console.log(`   Rate limit: ${RATE_LIMIT_MS}ms`);
});
