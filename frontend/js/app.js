/* ==========================================================================
   WizardFM — Main Application
   ========================================================================== */

(() => {
  'use strict';

  // --- Configuration ---
  const CONFIG = {
    // These can be overridden by env vars injected at build/deploy time
    AZURACAST_API_URL: window.__WIZARDFM_CONFIG__?.AZURACAST_API_URL || 'https://panel.wizardfm.lat',
    STREAM_URL: window.__WIZARDFM_CONFIG__?.STREAM_URL || 'https://panel.wizardfm.lat/listen/wizardfm/radio.mp3',
    STATION_ID: window.__WIZARDFM_CONFIG__?.STATION_ID || 'wizardfm',
    POLL_INTERVAL: 10000, // 10 seconds
    MAX_HISTORY: 8,
  };

  // --- DOM Elements ---
  const $ = (sel) => document.querySelector(sel);
  const audio = $('#audio-player');
  const playBtn = $('#play-btn');
  const playIcon = $('#play-icon');
  const pauseIcon = $('#pause-icon');
  const loadingIcon = $('#loading-icon');
  const liveBadge = $('#live-badge');
  const liveBadgeText = $('#live-badge-text');
  const trackTitle = $('#track-title');
  const trackArtist = $('#track-artist');
  const albumArt = $('#album-art');
  const djName = $('#dj-name');
  const djNameText = $('#dj-name-text');
  const listenerCount = $('#listener-count');
  const historyList = $('#history-list');
  const volumeSlider = $('#volume-slider');
  const muteBtn = $('#mute-btn');
  const volumeIcon = $('#volume-icon');
  const muteIcon = $('#mute-icon');
  const playerCard = $('#player-card');
  const shareBtn = $('#share-btn');
  const mobileMenuBtn = $('#mobile-menu-btn');
  const mobileMenu = $('#mobile-menu');

  // --- State ---
  let isPlaying = false;
  let isLoading = false;
  let isMuted = false;
  let previousVolume = 0.75;
  let isLive = false;
  let nowPlayingData = null;
  let pollTimer = null;
  let songHistory = [];

  // --- Initialize ---
  function init() {
    audio.volume = volumeSlider.value / 100;
    audio.src = CONFIG.STREAM_URL;

    setupEventListeners();
    createParticles();
    fetchNowPlaying();
    loadSchedule();
    startPolling();
    registerServiceWorker();
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    // Play/Pause
    playBtn.addEventListener('click', togglePlay);

    // Volume
    volumeSlider.addEventListener('input', (e) => {
      const vol = e.target.value / 100;
      audio.volume = vol;
      isMuted = vol === 0;
      updateVolumeUI();
    });

    muteBtn.addEventListener('click', toggleMute);

    // Audio events
    audio.addEventListener('playing', onAudioPlaying);
    audio.addEventListener('pause', onAudioPaused);
    audio.addEventListener('waiting', onAudioLoading);
    audio.addEventListener('error', onAudioError);
    audio.addEventListener('stalled', onAudioLoading);

    // Share
    if (shareBtn) {
      shareBtn.addEventListener('click', handleShare);
    }

    // Mobile menu
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }

    // Close mobile menu on link click
    document.querySelectorAll('.mobile-menu__link').forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.hidden = true;
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
      if (e.code === 'KeyM') {
        toggleMute();
      }
    });

    // Visibility change — reconnect if tab was hidden
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && isPlaying) {
        fetchNowPlaying();
      }
    });
  }

  // --- Playback ---
  function togglePlay() {
    if (isLoading) return;

    if (isPlaying) {
      audio.pause();
      audio.src = ''; // Release the stream connection
    } else {
      // Reload stream to get fresh audio
      audio.src = CONFIG.STREAM_URL;
      audio.load();
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch((err) => {
          console.error('Playback failed:', err);
          setPlayerState('paused');
        });
      }
    }
  }

  function onAudioPlaying() {
    isPlaying = true;
    isLoading = false;
    setPlayerState('playing');
    playerCard.classList.add('is-playing');

    // Start visualizer
    if (window.WizardVisualizer) {
      window.WizardVisualizer.start(audio);
    }
  }

  function onAudioPaused() {
    isPlaying = false;
    isLoading = false;
    setPlayerState('paused');
    playerCard.classList.remove('is-playing');

    if (window.WizardVisualizer) {
      window.WizardVisualizer.stop();
    }
  }

  function onAudioLoading() {
    isLoading = true;
    setPlayerState('loading');
  }

  function onAudioError(e) {
    console.error('Audio error:', e);
    isPlaying = false;
    isLoading = false;
    setPlayerState('paused');
    playerCard.classList.remove('is-playing');
  }

  function setPlayerState(state) {
    playIcon.hidden = state !== 'paused';
    pauseIcon.hidden = state !== 'playing';
    loadingIcon.hidden = state !== 'loading';
  }

  // --- Volume ---
  function toggleMute() {
    if (isMuted) {
      audio.volume = previousVolume;
      volumeSlider.value = previousVolume * 100;
      isMuted = false;
    } else {
      previousVolume = audio.volume || 0.75;
      audio.volume = 0;
      volumeSlider.value = 0;
      isMuted = true;
    }
    updateVolumeUI();
  }

  function updateVolumeUI() {
    volumeIcon.hidden = isMuted;
    muteIcon.hidden = !isMuted;
  }

  // --- Now Playing (AzuraCast API) ---
  async function fetchNowPlaying() {
    try {
      const url = `${CONFIG.AZURACAST_API_URL}/api/nowplaying/${CONFIG.STATION_ID}`;
      const res = await fetch(url, { cache: 'no-store' });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      updateNowPlaying(data);
    } catch (err) {
      console.warn('Failed to fetch now playing:', err.message);
      // Don't update UI on error — keep last known state
    }
  }

  function updateNowPlaying(data) {
    nowPlayingData = data;

    // Live status
    const wasLive = isLive;
    isLive = data.live?.is_live || false;
    updateLiveBadge(isLive);

    // Notify if just went live
    if (isLive && !wasLive) {
      const streamerName = data.live?.streamer_name || 'DJ';
      if (window.WizardNotifications) {
        window.WizardNotifications.notifyLive(streamerName);
      }
    }

    // DJ name
    if (isLive && data.live?.streamer_name) {
      djName.hidden = false;
      djNameText.textContent = data.live.streamer_name;
    } else {
      djName.hidden = true;
    }

    // Current song
    const song = data.now_playing?.song;
    if (song) {
      trackTitle.textContent = song.title || 'Sin título';
      trackArtist.textContent = song.artist || 'Artista desconocido';

      // Album art
      if (song.art) {
        albumArt.innerHTML = `<img src="${song.art}" alt="Album art" loading="lazy">`;
      } else {
        albumArt.innerHTML = '<div class="player-card__art-placeholder"><span>🧙‍♂️</span></div>';
      }

      // Update page title
      document.title = `${song.title} — WizardFM ✨`;
    }

    // Listener count
    const listeners = data.listeners?.total || data.listeners?.current || 0;
    listenerCount.textContent = listeners;

    // Song history
    if (data.song_history && data.song_history.length > 0) {
      updateHistory(data.song_history);
    }
  }

  function updateLiveBadge(live) {
    if (live) {
      liveBadge.className = 'live-badge live-badge--live';
      liveBadgeText.textContent = '✨ EN VIVO';
    } else {
      liveBadge.className = 'live-badge live-badge--offline';
      liveBadgeText.textContent = '🌙 OFFLINE';
    }
  }

  function updateHistory(history) {
    const items = history.slice(0, CONFIG.MAX_HISTORY);

    if (items.length === 0) {
      historyList.innerHTML = '<li class="history__empty">Aún no hay canciones registradas</li>';
      return;
    }

    historyList.innerHTML = items.map((entry) => {
      const song = entry.song;
      const playedAt = entry.played_at ? formatTime(entry.played_at * 1000) : '';
      const artHtml = song.art
        ? `<img src="${song.art}" alt="" loading="lazy">`
        : '🎵';

      return `
        <li class="history__item">
          <div class="history__item-art">${artHtml}</div>
          <div class="history__item-info">
            <div class="history__item-title">${escapeHtml(song.title || 'Sin título')}</div>
            <div class="history__item-artist">${escapeHtml(song.artist || 'Desconocido')}</div>
          </div>
          <span class="history__item-time">${playedAt}</span>
        </li>
      `;
    }).join('');
  }

  // --- Polling ---
  function startPolling() {
    pollTimer = setInterval(fetchNowPlaying, CONFIG.POLL_INTERVAL);
  }

  // --- Particles ---
  function createParticles() {
    const container = $('#particles');
    if (!container) return;

    const count = window.innerWidth < 768 ? 20 : 40;

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.classList.add('particle');

      const size = Math.random() * 3 + 1;
      const left = Math.random() * 100;
      const duration = Math.random() * 15 + 10;
      const delay = Math.random() * 15;

      // Randomize color between purple and gold
      const colors = [
        'rgba(124, 58, 237, 0.5)',
        'rgba(167, 139, 250, 0.4)',
        'rgba(251, 191, 36, 0.3)',
        'rgba(192, 132, 252, 0.4)',
      ];
      const color = colors[Math.floor(Math.random() * colors.length)];

      particle.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${left}%;
        background: ${color};
        animation-duration: ${duration}s;
        animation-delay: ${delay}s;
        box-shadow: 0 0 ${size * 2}px ${color};
      `;

      container.appendChild(particle);
    }
  }

  // --- Mobile Menu ---
  function toggleMobileMenu() {
    mobileMenu.hidden = !mobileMenu.hidden;
  }

  // --- Share ---
  async function handleShare(e) {
    e.preventDefault();
    const shareData = {
      title: 'WizardFM — Radio Mágica en Vivo',
      text: nowPlayingData?.now_playing?.song
        ? `Escuchando "${nowPlayingData.now_playing.song.title}" en WizardFM ✨`
        : 'Escucha WizardFM — Radio mágica en vivo ✨',
      url: 'https://wizardfm.lat',
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch { /* user cancelled */ }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(shareData.url);
      shareBtn.textContent = '¡Copiado! ✅';
      setTimeout(() => {
        shareBtn.textContent = 'Compartir 🔗';
      }, 2000);
    }
  }

  // --- Service Worker ---
  async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
        console.log('✨ Service Worker registered');
      } catch (err) {
        console.warn('SW registration failed:', err);
      }
    }

    // PWA install prompt
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;

      // Show install buttons
      const installBtn = $('#install-btn');
      const installBtnMobile = $('#install-btn-mobile');
      if (installBtn) installBtn.hidden = false;
      if (installBtnMobile) installBtnMobile.hidden = false;

      const handleInstall = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('Install prompt outcome:', outcome);
        deferredPrompt = null;
        if (installBtn) installBtn.hidden = true;
        if (installBtnMobile) installBtnMobile.hidden = true;
      };

      if (installBtn) installBtn.addEventListener('click', handleInstall);
      if (installBtnMobile) installBtnMobile.addEventListener('click', handleInstall);
    });
  }

  // --- Utils ---
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Dynamic Shows Schedule ---
  async function loadSchedule() {
    const showsList = document.getElementById('shows-list');
    if (!showsList) return;

    try {
      let shows = [];

      // 1. Check AzuraCast schedule API
      try {
        const azRes = await fetch(`${CONFIG.AZURACAST_API_URL}/api/station/${CONFIG.STATION_ID}/schedule`);
        if (azRes.ok) {
          const azData = await azRes.json();
          if (Array.isArray(azData) && azData.length > 0) {
            shows = azData.map((item) => ({
              days: item.start ? new Date(item.start).toLocaleDateString('es', { weekday: 'short' }).toUpperCase() : 'HOY',
              time: item.start ? new Date(item.start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '00:00',
              name: item.name || 'Emisión Especial',
              desc: item.type === 'streamer' ? 'Transmisión en vivo por locutor' : 'Selección musical mágica AutoDJ',
              host: item.type === 'streamer' ? 'Locutor en Vivo' : 'AutoDJ',
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
        showsList.innerHTML = shows
          .map(
            (s) => `
          <div class="show-card">
            <div class="show-card__time">${escapeHtml(s.days || 'LUN - DOM')}</div>
            <div class="show-card__info">
              <h3 class="show-card__name">${escapeHtml(s.name)}</h3>
              <p class="show-card__desc">${escapeHtml(s.desc || '')}</p>
              <span class="show-card__host">${escapeHtml(s.host || '')}</span>
            </div>
            <span class="show-card__hour">${escapeHtml(s.time || '')}</span>
          </div>
        `
          )
          .join('');
      }
    } catch (err) {
      console.warn('Could not load dynamic schedule:', err);
    }
  }

  // --- Expose for other modules ---
  window.WizardApp = {
    getConfig: () => CONFIG,
    isLive: () => isLive,
    getNowPlaying: () => nowPlayingData,
  };

  // --- Start ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
