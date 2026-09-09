/* ==========================================================================
   WizardFM — DJ Panel Script
   ========================================================================== */

(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const djStatusBadge = $('#dj-status-badge');
  const djTrackTitle = $('#dj-track-title');
  const djTrackArtist = $('#dj-track-artist');
  const djListeners = $('#dj-listeners');
  const djImportForm = $('#dj-import-form');
  const djImportUrl = $('#dj-import-url');
  const djImportSubmit = $('#dj-import-submit');
  const djImportMsg = $('#dj-import-msg');
  const djLechuzas = $('#dj-lechuzas');
  const djClearChatBtn = $('#dj-clear-chat-btn');
  const djClearStatus = $('#dj-clear-status');
  const djScheduleList = $('#dj-schedule-list');

  const API_NOWPLAYING = 'https://panel.wizardfm.lat/api/nowplaying/wizardfm';
  let chatSocket = null;
  let firstMessage = true;

  // --- Initialize ---
  function init() {
    fetchStatus();
    setInterval(fetchStatus, 8000);
    connectChatListener();
    setupImportForm();
    setupClearChat();
    fetchSchedule();
  }

  // --- Fetch Station Status ---
  async function fetchStatus() {
    try {
      const res = await fetch(API_NOWPLAYING);
      if (!res.ok) return;
      const data = await res.json();

      const isLive = data.live?.is_live || false;
      const streamerName = data.live?.streamer_name || '';

      if (isLive) {
        djStatusBadge.className = 'dj-status-badge dj-status-badge--live';
        djStatusBadge.textContent = `🔴 EN VIVO: ${streamerName || 'LOCUTOR'}`;
      } else {
        djStatusBadge.className = 'dj-status-badge dj-status-badge--autodj';
        djStatusBadge.textContent = '🔮 AUTO-DJ ENCANTADO';
      }

      const song = data.now_playing?.song;
      djTrackTitle.textContent = song?.title || 'Sin información';
      djTrackArtist.textContent = song?.artist || '---';
      djListeners.textContent = data.listeners?.current || 0;
    } catch (e) {
      console.warn('Error fetching DJ status:', e);
    }
  }

  // --- Chat Lechuzas (Socket.io) ---
  function connectChatListener() {
    if (typeof window.io === 'undefined') return;

    try {
      chatSocket = window.io({
        path: '/socket.io',
        transports: ['websocket', 'polling'],
      });

      const handleMsg = (msg) => {
        if (!msg) return;
        addLechuza(msg);
      };

      chatSocket.on('message', handleMsg);
      chatSocket.on('chat_message', handleMsg);

      chatSocket.on('history', (history) => {
        if (Array.isArray(history)) {
          djLechuzas.innerHTML = '';
          firstMessage = history.length === 0;
          if (history.length === 0) {
            djLechuzas.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem 0; font-size: 0.9rem;">No hay mensajes previos... 🦉✨</div>';
          } else {
            history.slice(-15).forEach(addLechuza);
          }
        }
      });

      chatSocket.on('chat_cleared', () => {
        djLechuzas.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem 0; font-size: 0.9rem;">🧹 Chat vaciado por el administrador. Esperando lechuzas... 🦉</div>';
        firstMessage = true;
      });

      chatSocket.on('clear', () => {
        djLechuzas.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem 0; font-size: 0.9rem;">🧹 Chat vaciado por el administrador. Esperando lechuzas... 🦉</div>';
        firstMessage = true;
      });
    } catch (e) {
      console.warn('Error connecting to chat:', e);
    }
  }

  function addLechuza(msg) {
    if (firstMessage) {
      djLechuzas.innerHTML = '';
      firstMessage = false;
    }

    const item = document.createElement('div');
    item.style.cssText = `
      padding: 0.6rem 0.8rem;
      background: rgba(15, 15, 35, 0.6);
      border: 1px solid rgba(124, 58, 237, 0.15);
      border-radius: 8px;
      font-size: 0.85rem;
    `;

    const name = escapeHtml(msg.name || msg.nickname || 'Anónimo');
    const isAlta = (msg.name && msg.name.toUpperCase().includes('ALTA')) || (msg.house && msg.house.toUpperCase() === 'ALTA');
    const house = isAlta ? '🔮 ALTA' : (msg.house || 'Mago');
    const badgeColor = isAlta ? '#c084fc' : (msg.color || '#fbbf24');
    const text = escapeHtml(msg.text || '');

    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
        <strong style="color: ${badgeColor};">${name} <span style="font-size: 0.75rem; opacity: 0.8;">(${house})</span>:</strong>
      </div>
      <div style="color: var(--text-primary);">${text}</div>
    `;

    djLechuzas.appendChild(item);
    djLechuzas.scrollTop = djLechuzas.scrollHeight;
  }

  // --- Clear Chat Handler ---
  function setupClearChat() {
    if (!djClearChatBtn) return;

    djClearChatBtn.addEventListener('click', () => {
      const confirmClear = confirm('¿Estás seguro de que deseas vaciar todos los mensajes del chat en vivo? Esta acción borrará el chat para todos los oyentes.');
      if (!confirmClear) return;

      if (chatSocket) {
        chatSocket.emit('clear_chat');
        if (djClearStatus) {
          djClearStatus.style.display = 'block';
          djClearStatus.style.background = 'rgba(34, 197, 94, 0.15)';
          djClearStatus.style.border = '1px solid rgba(34, 197, 94, 0.4)';
          djClearStatus.style.color = '#4ade80';
          djClearStatus.textContent = '🧹 El chat ha sido vaciado exitosamente en la radio.';
          setTimeout(() => {
            djClearStatus.style.display = 'none';
          }, 4000);
        }
      } else {
        alert('El socket de chat no está conectado.');
      }
    });
  }

  // --- Schedule Fetcher ---
  async function fetchSchedule() {
    if (!djScheduleList) return;

    try {
      // 1. Try AzuraCast API schedule
      let shows = [];
      try {
        const azRes = await fetch('https://panel.wizardfm.lat/api/station/1/schedule');
        if (azRes.ok) {
          const azData = await azRes.json();
          if (Array.isArray(azData) && azData.length > 0) {
            shows = azData.map((item) => ({
              days: item.start ? new Date(item.start).toLocaleDateString('es', { weekday: 'short' }).toUpperCase() : 'HORARIO',
              time: item.start ? new Date(item.start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '00:00',
              name: item.name || 'Emisión Especial',
              host: item.type === 'streamer' ? 'Locutor en Vivo' : 'Playlist AutoDJ',
            }));
          }
        }
      } catch (e) {}

      // 2. Fallback to schedule.json
      if (shows.length === 0) {
        const jsonRes = await fetch('/data/schedule.json');
        if (jsonRes.ok) {
          shows = await jsonRes.json();
        }
      }

      if (shows.length > 0) {
        djScheduleList.innerHTML = shows
          .map(
            (s) => `
          <div class="dj-schedule-item">
            <div>
              <strong style="color: #fff;">${escapeHtml(s.name)}</strong>
              <div style="color: var(--text-muted); font-size: 0.75rem;">${escapeHtml(s.host || '')}</div>
            </div>
            <div style="text-align: right; color: var(--gold-400); font-weight: 600;">
              <div>${escapeHtml(s.time)}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">${escapeHtml(s.days)}</div>
            </div>
          </div>
        `
          )
          .join('');
      } else {
        djScheduleList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1rem;">No hay programas registrados.</div>';
      }
    } catch (e) {
      djScheduleList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1rem;">Error cargando programación.</div>';
    }
  }

  // --- Music Importer Form ---
  function setupImportForm() {
    if (!djImportForm) return;

    djImportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = djImportUrl.value.trim();
      if (!url) return;

      djImportSubmit.disabled = true;
      djImportSubmit.textContent = 'Enviando petición... 🪄';

      const isSpotify = url.includes('spotify.com');
      const endpoint = isSpotify ? '/api/import-spotify' : '/api/download';
      const body = isSpotify ? { playlist_url: url } : { url };

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        djImportMsg.style.display = 'block';

        if (res.ok) {
          djImportMsg.style.background = 'rgba(34, 197, 94, 0.15)';
          djImportMsg.style.border = '1px solid rgba(34, 197, 94, 0.4)';
          djImportMsg.style.color = '#4ade80';
          djImportMsg.textContent = '✨ Descarga añadida a la cola con éxito. Se importará automáticamente a la radio.';
          djImportUrl.value = '';
        } else {
          djImportMsg.style.background = 'rgba(239, 68, 68, 0.15)';
          djImportMsg.style.border = '1px solid rgba(239, 68, 68, 0.4)';
          djImportMsg.style.color = '#f87171';
          djImportMsg.textContent = `⚠️ Error: ${data.error || 'No se pudo procesar la solicitud'}`;
        }
      } catch (err) {
        djImportMsg.style.display = 'block';
        djImportMsg.style.background = 'rgba(239, 68, 68, 0.15)';
        djImportMsg.style.border = '1px solid rgba(239, 68, 68, 0.4)';
        djImportMsg.style.color = '#f87171';
        djImportMsg.textContent = '⚠️ Error de conexión con el servicio de descarga.';
      } finally {
        djImportSubmit.disabled = false;
        djImportSubmit.textContent = 'Descargar e Importar a la Radio ✨';
      }
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
