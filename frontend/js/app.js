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
  let sseSource = null;
  let currentTrackKey = '';
  let currentTrackCoverUrl = null;
  const coverCache = new Map();

  // --- Initialize ---
  function init() {
    audio.volume = volumeSlider.value / 100;
    audio.src = CONFIG.STREAM_URL;

    setupEventListeners();
    initMediaSession();
    createParticles();
    fetchNowPlaying();
    setupSSE();
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

    // Visibility change — refresh state when user returns to tab
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
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

    // If audio is actively playing, ensure badge reflects online status
    const isDJLive = Boolean(nowPlayingData?.live?.is_live);
    updateLiveBadge(isDJLive, true);

    // Start visualizer
    if (window.WizardVisualizer) {
      window.WizardVisualizer.start(audio);
    }

    syncMediaSessionState();
  }

  function onAudioPaused() {
    isPlaying = false;
    isLoading = false;
    setPlayerState('paused');
    playerCard.classList.remove('is-playing');

    if (window.WizardVisualizer) {
      window.WizardVisualizer.stop();
    }

    syncMediaSessionState();
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
    syncMediaSessionState();
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

  // --- Web Media Session API (Mobile / Lock Screen / Bluetooth) ---
  function initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        if (!isPlaying) togglePlay();
        navigator.mediaSession.playbackState = 'playing';
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        if (isPlaying) togglePlay();
        navigator.mediaSession.playbackState = 'paused';
      });

      navigator.mediaSession.setActionHandler('stop', () => {
        if (isPlaying) {
          audio.pause();
          audio.src = '';
          isPlaying = false;
          isLoading = false;
          setPlayerState('paused');
          playerCard.classList.remove('is-playing');
          if (window.WizardVisualizer) {
            window.WizardVisualizer.stop();
          }
        }
        navigator.mediaSession.playbackState = 'none';
      });
    } catch (err) {
      console.warn('MediaSession handler setup error:', err);
    }
  }

  function updateMediaSession(songTitle, artistName, albumOrShow, artworkUrl) {
    if (!('mediaSession' in navigator)) return;

    try {
      const fallbackIcons = [
        { src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ];

      const artwork = artworkUrl
        ? [
            { src: artworkUrl, sizes: '96x96', type: 'image/png' },
            { src: artworkUrl, sizes: '192x192', type: 'image/png' },
            { src: artworkUrl, sizes: '300x300', type: 'image/jpeg' },
            { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
            ...fallbackIcons,
          ]
        : fallbackIcons;

      navigator.mediaSession.metadata = new MediaMetadata({
        title: songTitle || 'WizardFM — En Vivo',
        artist: artistName || 'WizardFM',
        album: albumOrShow || 'wizardfm.lat',
        artwork: artwork,
      });
    } catch (err) {
      console.warn('MediaSession update error:', err);
    }
  }

  function syncMediaSessionState() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : (isLoading ? 'playing' : 'paused');

    if (!nowPlayingData) {
      updateMediaSession('WizardFM', 'Radio Mágica en Vivo', 'wizardfm.lat', '/assets/icons/icon-512.png');
      return;
    }

    const isDJLive = Boolean(nowPlayingData.live?.is_live);
    const streamer = (nowPlayingData.live?.streamer_name || '').trim();
    const song = nowPlayingData.now_playing?.song;
    const isOnline = Boolean(nowPlayingData.is_online ?? nowPlayingData.station?.is_online);

    let title = (song?.title || '').trim();
    let artist = (song?.artist || '').trim();
    const songText = (song?.text || '').trim();

    if ((!artist || artist.toLowerCase() === 'desconocido') && title.includes(' - ')) {
      const parts = title.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    } else if (!title && songText) {
      title = songText;
    }

    const hasValidSong = Boolean(title && title !== 'Station Offline');
    const songArt = song?.art && !song?.art.includes('generic_song') ? song.art : null;
    const art = currentTrackCoverUrl || songArt || (isDJLive ? nowPlayingData.live?.art : null) || '/assets/icons/icon-512.png';

    if (hasValidSong) {
      const album = isDJLive
        ? (streamer ? `En Vivo con ${streamer} • WizardFM` : 'En Vivo en Cabina • WizardFM')
        : 'WizardFM Radio Online';
      updateMediaSession(title, artist || 'WizardFM', album, art);
    } else if (isDJLive) {
      const liveTitle = streamer ? `En Vivo con ${streamer}` : 'Transmisión en Vivo';
      updateMediaSession(
        liveTitle,
        'WizardFM — Cabina Digital 🎙️',
        'wizardfm.lat — Transmisión en Vivo',
        art
      );
    } else if (isOnline) {
      updateMediaSession(
        'WizardFM — Radio Mágica',
        'wizardfm.lat',
        'WizardFM Radio Online',
        '/assets/icons/icon-512.png'
      );
    } else {
      updateMediaSession(
        'WizardFM',
        'Fuera del Aire',
        'wizardfm.lat',
        '/assets/icons/icon-512.png'
      );
    }
  }

  // --- Helper: Parse payload from REST or SSE (AzuraCast / Centrifugo) ---
  function parseNowPlayingData(raw) {
    if (!raw) return null;
    let d = raw;
    if (typeof raw === 'string') {
      try {
        d = JSON.parse(raw);
      } catch {
        return null;
      }
    }

    // Unwrap Centrifugo publish envelope if present
    if (d.pub?.data) {
      d = d.pub.data;
    } else if (d.data) {
      d = d.data;
    }

    // Unwrap row / rows (AzuraCast SSE formats)
    if (d.row) {
      d = d.row;
    } else if (Array.isArray(d.rows) && d.rows.length > 0) {
      d = d.rows[0];
    } else if (Array.isArray(d) && d.length > 0) {
      d = d[0];
    }

    return d;
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
      // Keep last known state on network error
    }
  }

  // --- iTunes / Apple Music Album Art API ---
  async function fetchTrackCover(artist, title) {
    const rawArtist = (artist || '').trim();
    const rawTitle = (title || '').trim();
    if (!rawTitle || rawTitle === 'WizardFM' || rawTitle === 'Station Offline') {
      return null;
    }

    const cleanArtist = (!rawArtist || rawArtist.toLowerCase() === 'desconocido' || rawArtist.toLowerCase() === 'unknown' || rawArtist.toLowerCase() === 'wizardfm') ? '' : rawArtist;
    const cleanTitle = rawTitle.replace(/\((official\s*(video|audio)|video\s*oficial|audio\s*oficial|lyric\s*video|en\s*vivo|remastered|remaster)\)/gi, '').trim();
    const term = `${cleanArtist} ${cleanTitle}`.trim();

    if (!term) return null;

    const cacheKey = `${cleanArtist.toLowerCase()} - ${cleanTitle.toLowerCase()}`;
    if (coverCache.has(cacheKey)) {
      return coverCache.get(cacheKey);
    }

    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=1`;
      const res = await fetch(itunesUrl);
      if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);
      const json = await res.json();

      if (json.results && json.results.length > 0 && json.results[0].artworkUrl100) {
        const cover600 = json.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
        coverCache.set(cacheKey, cover600);
        return cover600;
      }
    } catch (err) {
      console.warn('No se pudo obtener la carátula de iTunes:', err.message);
    }

    coverCache.set(cacheKey, null);
    return null;
  }

  function renderAlbumArt(artUrl, title, isLiveStationArt = false) {
    if (artUrl) {
      const currentImg = albumArt.querySelector('img');
      if (!currentImg || currentImg.getAttribute('src') !== artUrl) {
        const extraClass = isLiveStationArt ? ' class="player-card__art-img--live"' : '';
        albumArt.innerHTML = `<img src="${escapeHtml(artUrl)}" alt="${escapeHtml(title || 'Portada')}"${extraClass} loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'player-card__art-placeholder\\'><span>🧙‍♂️</span></div>';">`;
      }
    } else {
      if (!albumArt.querySelector('.player-card__art-placeholder')) {
        albumArt.innerHTML = '<div class="player-card__art-placeholder"><span>🧙‍♂️</span></div>';
      }
    }
  }

  function updateNowPlaying(raw) {
    const data = parseNowPlayingData(raw);
    if (!data || (!data.now_playing && !data.station && !data.live && !data.listeners)) {
      return;
    }
    nowPlayingData = data;

    // Station & DJ state
    const isDJLive = Boolean(data.live?.is_live);
    const dj = (data.live?.streamer_name || '').trim();
    const isStationOnline = Boolean(
      data.is_online ??
      data.station?.is_online ??
      (data.now_playing?.song?.title && data.now_playing.song.title !== 'Station Offline') ??
      isPlaying
    );

    const wasLive = isLive;
    isLive = isDJLive;

    // Highlight card styling when live
    playerCard.classList.toggle('player-card--live', isDJLive);

    // Badge state
    updateLiveBadge(isDJLive, isStationOnline);

    // Notify listeners if streamer just connected
    if (isDJLive && !wasLive) {
      if (window.WizardNotifications) {
        window.WizardNotifications.notifyLive(dj || 'Locutor');
      }
    }

    // Broadcaster / DJ name element
    if (isDJLive) {
      djName.hidden = false;
      djName.classList.add('player-card__dj--live');
      const djIcon = djName.querySelector('.player-card__dj-icon');
      if (djIcon) djIcon.textContent = '🎙️';
      djNameText.textContent = dj ? `En Vivo: ${dj}` : 'En Vivo en Cabina';
    } else if (isStationOnline) {
      djName.hidden = false;
      djName.classList.remove('player-card__dj--live');
      const djIcon = djName.querySelector('.player-card__dj-icon');
      if (djIcon) djIcon.textContent = '✨';
      djNameText.textContent = 'Música Continua (AutoDJ)';
    } else {
      djName.hidden = true;
      djName.classList.remove('player-card__dj--live');
    }

    // Song metadata
    const song = data.now_playing?.song;
    let songTitle = (song?.title || '').trim();
    let songArtist = (song?.artist || '').trim();
    const songText = (song?.text || '').trim();
    const songArt = song?.art || '';

    // Smart formatting: if artist is empty but title or songText has "Artist - Title"
    if ((!songArtist || songArtist.toLowerCase() === 'desconocido' || songArtist.toLowerCase() === 'unknown') && songTitle.includes(' - ')) {
      const parts = songTitle.split(' - ');
      songArtist = parts[0].trim();
      songTitle = parts.slice(1).join(' - ').trim();
    } else if ((!songTitle || songTitle === 'Sin título') && songText.includes(' - ')) {
      const parts = songText.split(' - ');
      songArtist = parts[0].trim();
      songTitle = parts.slice(1).join(' - ').trim();
    } else if (!songTitle && songText) {
      songTitle = songText;
    }

    // Determine final displayed song title and artist
    let displayTitle = '';
    let displayArtist = '';
    const hasValidSong = Boolean(songTitle && songTitle !== 'Station Offline');

    if (hasValidSong) {
      displayTitle = songTitle;
      displayArtist = songArtist || (isDJLive ? (dj || 'WizardFM') : 'WizardFM');
    } else if (isDJLive) {
      displayTitle = dj ? `En Vivo con ${dj}` : 'Transmisión en Vivo';
      displayArtist = 'WizardFM — Cabina Digital 🎙️';
    } else if (isStationOnline || isPlaying) {
      displayTitle = 'WizardFM';
      displayArtist = 'Sintoniza la magia ✨';
    } else {
      displayTitle = 'WizardFM';
      displayArtist = 'Transmisión Fuera del Aire';
    }

    // Update Track Info DOM
    if (trackTitle.textContent !== displayTitle) {
      trackTitle.textContent = displayTitle;
    }
    if (trackArtist.textContent !== displayArtist) {
      trackArtist.textContent = displayArtist;
    }

    // Album Art Resolution (iTunes cover with radio default fallback)
    const itunesArtist = (songArtist && songArtist.toLowerCase() !== 'desconocido' && songArtist.toLowerCase() !== 'unknown') ? songArtist : '';
    const trackKey = `${itunesArtist} - ${displayTitle}`.trim().toLowerCase();

    if (hasValidSong) {
      const hasCustomRadioArt = songArt && !songArt.includes('generic_song');
      const defaultRadioArt = hasCustomRadioArt ? songArt : (isDJLive ? data.live?.art : null);

      if (currentTrackKey !== trackKey) {
        currentTrackKey = trackKey;
        const cachedCover = coverCache.get(trackKey);

        if (cachedCover) {
          currentTrackCoverUrl = cachedCover;
          renderAlbumArt(cachedCover, displayTitle, false);
        } else if (cachedCover === null) {
          // Ya consultado previamente sin resultado en iTunes -> mantener carátula por defecto de la radio
          currentTrackCoverUrl = defaultRadioArt;
          renderAlbumArt(defaultRadioArt, displayTitle, !hasCustomRadioArt && isDJLive);
        } else {
          // Primera vez que suena: mostrar imagen por defecto de inmediato y consultar iTunes en background
          renderAlbumArt(defaultRadioArt, displayTitle, !hasCustomRadioArt && isDJLive);
          currentTrackCoverUrl = defaultRadioArt;

          fetchTrackCover(itunesArtist, displayTitle).then((itunesCover) => {
            if (currentTrackKey === trackKey) {
              if (itunesCover) {
                currentTrackCoverUrl = itunesCover;
                renderAlbumArt(itunesCover, displayTitle, false);
                syncMediaSessionState();
              } else {
                currentTrackCoverUrl = defaultRadioArt;
              }
            }
          });
        }
      } else {
        // Misma canción en curso: asegurar renderizado sin parpadeos
        if (currentTrackCoverUrl) {
          renderAlbumArt(currentTrackCoverUrl, displayTitle, currentTrackCoverUrl === data.live?.art);
        }
      }
    } else {
      currentTrackKey = '';
      currentTrackCoverUrl = null;
      const defaultArt = isDJLive ? data.live?.art : null;
      renderAlbumArt(defaultArt, displayTitle, Boolean(defaultArt));
    }

    // Page Title
    if (isDJLive) {
      document.title = hasValidSong
        ? `🔴 ${displayTitle} — ${displayArtist} | WizardFM ✨`
        : `🔴 ${displayTitle} — WizardFM ✨`;
    } else if (hasValidSong) {
      document.title = `🎵 ${displayTitle} — ${displayArtist} | WizardFM ✨`;
    } else {
      document.title = 'WizardFM — Radio Mágica en Vivo ✨';
    }

    // Listeners count
    const listeners = data.listeners?.total ?? data.listeners?.current ?? 0;
    listenerCount.textContent = listeners;

    // Song history
    if (Array.isArray(data.song_history) && data.song_history.length > 0) {
      updateHistory(data.song_history);
    }

    // Sync media session for lock screen and Bluetooth
    syncMediaSessionState();
  }

  function updateLiveBadge(isDJLive, isStationOnline) {
    if (isDJLive) {
      liveBadge.className = 'live-badge live-badge--on-air';
      liveBadgeText.textContent = 'EN VIVO';
    } else if (isStationOnline || isPlaying) {
      liveBadge.className = 'live-badge live-badge--autodj';
      liveBadgeText.textContent = 'EN LÍNEA';
    } else {
      liveBadge.className = 'live-badge live-badge--offline';
      liveBadgeText.textContent = 'FUERA DEL AIRE';
    }
  }

  // --- Server-Sent Events (Realtime Now Playing - 0 latency) ---
  function setupSSE() {
    if (typeof window.EventSource === 'undefined') {
      console.warn('SSE not supported in this browser, relying on polling.');
      return;
    }

    try {
      const sseUrl = `${CONFIG.AZURACAST_API_URL}/api/live/nowplaying/sse?stations=${CONFIG.STATION_ID}`;
      if (sseSource) {
        sseSource.close();
      }

      sseSource = new EventSource(sseUrl);

      sseSource.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          const np = parseNowPlayingData(raw);

          if (np && (np.now_playing || np.station || np.live || np.listeners)) {
            if (np.now_playing?.song?.text) {
              console.log('Sonando ahora:', np.now_playing.song.text);
            }
            updateNowPlaying(np);
          }
        } catch (err) {
          // Ignore non-JSON or ping frames
        }
      };

      sseSource.onerror = () => {
        // EventSource will automatically retry connecting; polling remains active as backup
      };
    } catch (err) {
      console.warn('SSE setup error, using polling fallback:', err);
    }
  }

  function updateHistory(history) {
    if (!historyList) return;
    const items = history.slice(0, CONFIG.MAX_HISTORY);

    if (items.length === 0) {
      historyList.innerHTML = '<li class="history__empty">Aún no hay canciones registradas</li>';
      return;
    }

    historyList.innerHTML = items.map((entry) => {
      const song = entry.song || {};
      const playedAt = entry.played_at ? formatTime(entry.played_at * 1000) : '';
      const artHtml = song.art
        ? `<img src="${escapeHtml(song.art)}" alt="" loading="lazy" onerror="this.onerror=null; this.parentElement.textContent='🎵';">`
        : '🎵';

      let title = (song.title || '').trim();
      let artist = (song.artist || '').trim();
      const rawText = (song.text || '').trim();

      if ((!artist || artist.toLowerCase() === 'desconocido') && title.includes(' - ')) {
        const parts = title.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      } else if (!title && rawText) {
        title = rawText;
      }

      return `
        <li class="history__item">
          <div class="history__item-art">${artHtml}</div>
          <div class="history__item-info">
            <div class="history__item-title">${escapeHtml(title || 'Sin título')}</div>
            <div class="history__item-artist">${escapeHtml(artist || 'Desconocido')}</div>
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

      // 1. Fetch from custom schedule API (managed in DJ panel)
      try {
        const res = await fetch('/api/schedule');
        if (res.ok) {
          shows = await res.json();
        }
      } catch (e) {}

      // 2. Fallback to static schedule.json if needed
      if (!Array.isArray(shows) || shows.length === 0) {
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
