/* ==========================================================================
   WizardFM — Live Chat Client
   ========================================================================== */

(() => {
  'use strict';

  // --- Configuration ---
  const WS_URL = (() => {
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${loc.host}/ws`;
  })();

  // --- DOM Elements ---
  const $ = (sel) => document.querySelector(sel);
  const chatMessages = $('#chat-messages');
  const chatJoinForm = $('#chat-join');
  const chatForm = $('#chat-form');
  const chatNicknameInput = $('#chat-nickname');
  const chatInput = $('#chat-input');
  const chatUserCount = $('#chat-user-count');

  // --- State ---
  let ws = null;
  let nickname = '';
  let reconnectAttempts = 0;
  const MAX_RECONNECT = 5;
  const RECONNECT_DELAY = 3000;
  let isConnected = false;
  let autoScroll = true;

  // --- Initialize ---
  function init() {
    setupEventListeners();
    connect();
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    // Join chat
    chatJoinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = chatNicknameInput.value.trim();
      if (!name) return;

      nickname = name;
      joinChat(name);
    });

    // Send message
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text || !isConnected) return;

      sendMessage(text);
      chatInput.value = '';
    });

    // Auto-scroll detection
    chatMessages.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = chatMessages;
      autoScroll = scrollHeight - scrollTop - clientHeight < 50;
    });
  }

  // --- WebSocket ---
  function connect() {
    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      console.warn('WebSocket connection failed:', err);
      scheduleReconnect();
      return;
    }

    ws.addEventListener('open', () => {
      console.log('✨ Chat connected');
      isConnected = true;
      reconnectAttempts = 0;

      // If we had a nickname, rejoin automatically
      if (nickname) {
        joinChat(nickname);
      }
    });

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        handleMessage(data);
      } catch (err) {
        console.warn('Invalid message:', err);
      }
    });

    ws.addEventListener('close', () => {
      console.log('Chat disconnected');
      isConnected = false;
      scheduleReconnect();
    });

    ws.addEventListener('error', (err) => {
      console.warn('WebSocket error:', err);
    });
  }

  function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT) {
      addSystemMessage('No se pudo conectar al chat. Recarga la página para intentar de nuevo.');
      return;
    }
    reconnectAttempts++;
    const delay = RECONNECT_DELAY * reconnectAttempts;
    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
    setTimeout(connect, delay);
  }

  function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // --- Actions ---
  function joinChat(name) {
    send({ type: 'join', nickname: name });
  }

  function sendMessage(text) {
    send({ type: 'message', text });
  }

  // --- Message Handlers ---
  function handleMessage(data) {
    switch (data.type) {
      case 'welcome':
        onWelcome(data);
        break;
      case 'message':
        onChatMessage(data);
        break;
      case 'system':
        addSystemMessage(data.message);
        break;
      case 'user_count':
        updateUserCount(data.count);
        break;
      case 'error':
        onError(data.message);
        break;
      case 'clear':
        clearMessages();
        break;
    }
  }

  function onWelcome(data) {
    nickname = data.nickname;

    // Switch to message form
    chatJoinForm.hidden = true;
    chatForm.hidden = false;
    chatInput.focus();

    // Clear welcome message
    chatMessages.innerHTML = '';

    // Load history
    if (data.history && data.history.length > 0) {
      data.history.forEach((msg) => {
        renderMessage(msg, false);
      });
    }

    updateUserCount(data.userCount);
    addSystemMessage(`Bienvenido, ${nickname} ✨`);
    scrollToBottom();
  }

  function onChatMessage(data) {
    renderMessage(data, true);
  }

  function onError(message) {
    addSystemMessage(`⚠️ ${message}`);
  }

  // --- Rendering ---
  function renderMessage(msg, animate) {
    const el = document.createElement('div');
    el.classList.add('chat-msg');
    if (animate) el.style.animation = 'fadeInUp 0.2s ease';

    const time = msg.timestamp ? formatTime(msg.timestamp) : '';
    const isMe = msg.nickname === nickname;

    el.innerHTML = `
      <div class="chat-msg__header">
        <span class="chat-msg__nickname" style="color: ${msg.color}">${escapeHtml(msg.nickname)}${isMe ? ' (tú)' : ''}</span>
        <span class="chat-msg__time">${time}</span>
      </div>
      <div class="chat-msg__text">${formatMessageText(msg.text)}</div>
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

  function clearMessages() {
    chatMessages.innerHTML = '';
    addSystemMessage('Chat limpiado por un administrador');
  }

  function updateUserCount(count) {
    if (chatUserCount) {
      chatUserCount.textContent = `${count} en línea`;
    }
  }

  // --- Helpers ---
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
    // Escape HTML first (already done server-side, but just in case)
    let safe = escapeHtml(text);

    // Convert common emoji shortcodes
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
