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

  const API_NOWPLAYING = 'https://panel.wizardfm.lat/api/nowplaying/wizardfm';
  let firstMessage = true;

  // --- Initialize ---
  function init() {
    fetchStatus();
    setInterval(fetchStatus, 8000);
    connectChatListener();
    setupImportForm();
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
      const socket = window.io({
        path: '/socket.io',
        transports: ['websocket', 'polling'],
      });

      const handleMsg = (msg) => {
        if (!msg) return;
        addLechuza(msg);
      };

      socket.on('message', handleMsg);
      socket.on('chat_message', handleMsg);
      socket.on('history', (history) => {
        if (Array.isArray(history)) {
          history.slice(-10).forEach(addLechuza);
        }
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
    const house = msg.house || 'Mago';
    const text = escapeHtml(msg.text || '');

    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
        <strong style="color: ${msg.color || '#fbbf24'};">${name} <span style="font-size: 0.75rem; opacity: 0.8;">(${house})</span>:</strong>
      </div>
      <div style="color: var(--text-primary);">${text}</div>
    `;

    djLechuzas.appendChild(item);
    djLechuzas.scrollTop = djLechuzas.scrollHeight;
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
