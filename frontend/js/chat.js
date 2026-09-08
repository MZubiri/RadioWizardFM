/* ==========================================================================
   WizardFM — Live Chat Client (Socket.io + WebSocket fallback)
   ========================================================================== */

(() => {
  'use strict';

  // --- Hogwarts Houses ---
  const HOUSES = {
    Gryffindor: { name: 'Gryffindor', badge: '🦁 Gryffindor', color: '#f43f5e', class: 'gryffindor' },
    Slytherin: { name: 'Slytherin', badge: '🐍 Slytherin', color: '#10b981', class: 'slytherin' },
    Ravenclaw: { name: 'Ravenclaw', badge: '🦅 Ravenclaw', color: '#38bdf8', class: 'ravenclaw' },
    Hufflepuff: { name: 'Hufflepuff', badge: '🦡 Hufflepuff', color: '#fbbf24', class: 'hufflepuff' },
  };

  // --- DOM Elements ---
  const $ = (sel) => document.querySelector(sel);
  const chatMessages = $('#chat-messages');
  const chatJoinForm = $('#chat-join');
  const chatForm = $('#chat-form');
  const chatNicknameInput = $('#chat-nickname');
  const chatHouseSelect = $('#chat-house');
  const chatInput = $('#chat-input');
  const chatUserCount = $('#chat-user-count');

  // --- State ---
  let socket = null;
  let ws = null;
  let isSocketIO = false;
  let nickname = '';
  let selectedHouse = 'Gryffindor';
  let isConnected = false;
  let autoScroll = true;
  const renderedMessageIds = new Set();

  // --- Initialize ---
  function init() {
    setupEventListeners();
    connectChat();
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    // Join chat
    if (chatJoinForm) {
      chatJoinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = chatNicknameInput.value.trim();
        if (!name) return;

        nickname = name;
        selectedHouse = chatHouseSelect ? chatHouseSelect.value : 'Gryffindor';
        joinChat(name, selectedHouse);
      });
    }

    // Send message
    if (chatForm) {
      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text || !isConnected) return;

        sendMessage(text);
        chatInput.value = '';
      });
    }

    // Auto-scroll detection
    if (chatMessages) {
      chatMessages.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = chatMessages;
        autoScroll = scrollHeight - scrollTop - clientHeight < 50;
      });
    }
  }

  // --- Connection Router ---
  function connectChat() {
    if (typeof window.io !== 'undefined') {
      connectSocketIO();
    } else {
      connectWebSocket();
    }
  }

  // --- Socket.io (WizardFM Backend standard) ---
  function connectSocketIO() {
    try {
      socket = window.io({
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      });
      isSocketIO = true;

      socket.on('connect', () => {
        console.log('✨ Chat conectado via Socket.io');
        isConnected = true;
        if (nickname) {
          joinChat(nickname, selectedHouse);
        }
      });

      socket.on('userCount', (count) => {
        updateUserCount(count);
      });

      socket.on('history', (history) => {
        if (Array.isArray(history)) {
          history.forEach((msg) => renderMessage(msg, false));
        }
      });

      const handleMsg = (msg) => {
        if (!msg) return;
        renderMessage(msg, true);
      };

      socket.on('message', handleMsg);
      socket.on('chat_message', handleMsg);

      socket.on('error', (err) => {
        const msg = typeof err === 'string' ? err : err?.message || 'Error en el chat';
        addSystemMessage(`⚠️ ${msg}`);
      });

      socket.on('disconnect', () => {
        console.log('Chat desconectado');
        isConnected = false;
      });
    } catch (err) {
      console.warn('Socket.io error, falling back to WebSocket:', err);
      connectWebSocket();
    }
  }

  // --- Raw WebSocket Fallback ---
  function connectWebSocket() {
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${loc.host}/ws`;

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.warn('WebSocket connection failed:', err);
      return;
    }

    ws.addEventListener('open', () => {
      console.log('✨ Chat conectado via WebSocket');
      isConnected = true;
      if (nickname) {
        ws.send(JSON.stringify({ type: 'join', nickname, house: selectedHouse }));
      }
    });

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'welcome') {
          updateUserCount(data.userCount);
          if (data.history) data.history.forEach((m) => renderMessage(m, false));
        } else if (data.type === 'message') {
          renderMessage(data, true);
        } else if (data.type === 'user_count') {
          updateUserCount(data.count);
        } else if (data.type === 'system') {
          addSystemMessage(data.message);
        }
      } catch (e) {}
    });

    ws.addEventListener('close', () => {
      isConnected = false;
      setTimeout(connectWebSocket, 4000);
    });
  }

  // --- Actions ---
  function joinChat(name, house) {
    if (isSocketIO && socket) {
      socket.emit('join', { name, house });
    } else if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join', nickname: name, house }));
    }

    if (chatJoinForm) chatJoinForm.hidden = true;
    if (chatForm) {
      chatForm.hidden = false;
      chatInput.focus();
    }

    addSystemMessage(`✨ ¡Bienvenido/a a la sala común de ${house}, ${name}!`);
  }

  function sendMessage(text) {
    const houseInfo = HOUSES[selectedHouse] || HOUSES.Gryffindor;
    const payload = {
      name: nickname,
      house: selectedHouse,
      color: houseInfo.color,
      text: text,
      timestamp: Date.now(),
    };

    if (isSocketIO && socket) {
      socket.emit('message', payload);
    } else if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'message', text, house: selectedHouse, color: houseInfo.color }));
    }
  }

  // --- Rendering ---
  function renderMessage(msg, animate) {
    // Unique key to prevent duplicates
    const author = msg.name || msg.nickname || 'Anónimo';
    const text = msg.text || '';
    const time = msg.timestamp || 0;
    const key = `${author}_${text}_${time}`;

    if (renderedMessageIds.has(key)) return;
    renderedMessageIds.add(key);

    const el = document.createElement('div');
    el.classList.add('chat-msg');
    if (animate) el.style.animation = 'fadeInUp 0.2s ease';

    const houseName = msg.house || 'Gryffindor';
    const houseInfo = HOUSES[houseName] || { color: msg.color || '#a78bfa', badge: houseName, class: 'general' };
    const timeStr = time ? formatTime(time) : '';
    const isMe = author === nickname;

    el.innerHTML = `
      <div class="chat-msg__header">
        <span class="chat-msg__house-badge chat-msg__house-badge--${(houseInfo.class || 'general').toLowerCase()}">${escapeHtml(houseInfo.badge || houseName)}</span>
        <span class="chat-msg__nickname" style="color: ${msg.color || houseInfo.color}">${escapeHtml(author)}${isMe ? ' (tú)' : ''}</span>
        <span class="chat-msg__time">${timeStr}</span>
      </div>
      <div class="chat-msg__text">${formatMessageText(text)}</div>
    `;

    chatMessages.appendChild(el);

    if (autoScroll) {
      scrollToBottom();
    }
  }

  function addSystemMessage(text) {
    const el = document.createElement('div');
    el.classList.add('chat-msg', 'chat-msg--system');
    el.textContent = text;
    chatMessages.appendChild(el);

    if (autoScroll) {
      scrollToBottom();
    }
  }

  function updateUserCount(count) {
    if (chatUserCount) {
      chatUserCount.textContent = `${count || 1} en línea`;
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('es', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatMessageText(text) {
    let safe = escapeHtml(text);
    const emojis = {
      ':)': '😊', ':(': '😞', ':D': '😃', ':P': '😛',
      '<3': '❤️', ':fire:': '🔥', ':star:': '⭐',
      ':wizard:': '🧙‍♂️', ':magic:': '✨', ':music:': '🎵',
      ':headphones:': '🎧', ':mic:': '🎤', ':book:': '📚',
    };

    for (const [code, emoji] of Object.entries(emojis)) {
      safe = safe.split(code).join(emoji);
    }
    return safe;
  }

  // --- Start ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
