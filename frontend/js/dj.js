/* ==========================================================================
   WizardFM — DJ Panel Script with Tabs & Schedule CRUD
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

  // CRUD & Modal Elements
  const crudForm = $('#crud-show-form');
  const crudFormTitle = $('#crud-form-title');
  const crudShowId = $('#crud-show-id');
  const crudName = $('#crud-name');
  const crudDays = $('#crud-days');
  const crudTime = $('#crud-time');
  const crudHost = $('#crud-host');
  const crudDesc = $('#crud-desc');
  const crudSubmitBtn = $('#crud-submit-btn');
  const crudStatusMsg = $('#crud-status-msg');
  const crudShowsContainer = $('#crud-shows-container');
  const crudCountBadge = $('#crud-count-badge');

  const modalShow = $('#modal-show');
  const modalShowClose = $('#modal-show-close');
  const modalShowCancel = $('#modal-show-cancel');
  const btnOpenCreateShow = $('#btn-open-create-show');

  const modalDelete = $('#modal-delete');
  const modalDeleteClose = $('#modal-delete-close');
  const modalDeleteCancel = $('#modal-delete-cancel');
  const modalDeleteConfirm = $('#modal-delete-confirm');
  const modalDeleteText = $('#modal-delete-text');

  // Auth Elements
  const modalAuth = $('#modal-auth');
  const formDjLogin = $('#form-dj-login');
  const inputDjPassword = $('#input-dj-password');
  const btnToggleShowPass = $('#btn-toggle-show-pass');
  const authErrorMsg = $('#auth-error-msg');
  const btnDjLoginSubmit = $('#btn-dj-login-submit');
  const btnDjLogout = $('#btn-dj-logout');

  const formChangePassword = $('#form-change-password');
  const inputCurrentPass = $('#input-current-pass');
  const inputNewPass = $('#input-new-pass');
  const inputConfirmPass = $('#input-confirm-pass');
  const changePassStatus = $('#change-pass-status');
  const btnSubmitChangePass = $('#btn-submit-change-pass');

  const AUTH_STORAGE_KEY = 'wizardfm_dj_token';
  let servicesStarted = false;

  const API_NOWPLAYING = 'https://panel.wizardfm.lat/api/nowplaying/wizardfm';
  let chatSocket = null;
  let firstMessage = true;
  let scheduleEvents = [];

  // --- Initialize ---
  async function init() {
    setupTabs();
    setupAuth();
    setupChangePassword();
    setupScheduleCrud();

    const isAuthed = await checkAuth();
    if (isAuthed) {
      startPanelServices();
    }
  }

  function startPanelServices() {
    if (servicesStarted) return;
    servicesStarted = true;
    fetchStatus();
    setInterval(fetchStatus, 8000);
    connectChatListener();
    setupImportForm();
    setupClearChat();
    loadCrudSchedule();
  }

  // --- Auth & Session Logic ---
  async function checkAuth() {
    const token = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!token) {
      lockPanel();
      return false;
    }

    try {
      const res = await fetch('/api/dj/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ token }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.valid) {
          unlockPanel();
          return true;
        }
      }
    } catch (e) {
      console.warn('Error verificando sesión DJ:', e);
    }

    lockPanel();
    return false;
  }

  function lockPanel() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    if (modalAuth) {
      modalAuth.classList.add('active');
      modalAuth.setAttribute('aria-hidden', 'false');
    }
    const container = $('.dj-container');
    if (container) {
      container.style.filter = 'blur(12px)';
      container.style.pointerEvents = 'none';
      container.style.userSelect = 'none';
    }
  }

  function unlockPanel() {
    if (modalAuth) {
      modalAuth.classList.remove('active');
      modalAuth.setAttribute('aria-hidden', 'true');
    }
    const container = $('.dj-container');
    if (container) {
      container.style.filter = 'none';
      container.style.pointerEvents = 'auto';
      container.style.userSelect = 'auto';
    }
    if (authErrorMsg) {
      authErrorMsg.style.display = 'none';
    }
  }

  function setupAuth() {
    if (formDjLogin) {
      formDjLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = inputDjPassword ? inputDjPassword.value.trim() : '';
        if (!password) return;

        btnDjLoginSubmit.disabled = true;
        btnDjLoginSubmit.textContent = 'Verificando... 🗝️';
        if (authErrorMsg) authErrorMsg.style.display = 'none';

        try {
          const res = await fetch('/api/dj/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          });

          const data = await res.json();
          if (res.ok && data.success) {
            localStorage.setItem(AUTH_STORAGE_KEY, data.token);
            unlockPanel();
            if (inputDjPassword) inputDjPassword.value = '';
            startPanelServices();
          } else {
            if (authErrorMsg) {
              authErrorMsg.style.display = 'block';
              authErrorMsg.textContent = `⚠️ ${data.error || 'Contraseña mágica incorrecta'}`;
            }
          }
        } catch (err) {
          if (authErrorMsg) {
            authErrorMsg.style.display = 'block';
            authErrorMsg.textContent = '⚠️ Error de conexión con el servidor.';
          }
        } finally {
          btnDjLoginSubmit.disabled = false;
          btnDjLoginSubmit.textContent = 'Desbloquear Cabina ✨';
        }
      });
    }

    if (btnToggleShowPass && inputDjPassword) {
      btnToggleShowPass.addEventListener('click', () => {
        const isPass = inputDjPassword.type === 'password';
        inputDjPassword.type = isPass ? 'text' : 'password';
        btnToggleShowPass.textContent = isPass ? '🔒' : '👁️';
      });
    }

    if (btnDjLogout) {
      btnDjLogout.addEventListener('click', () => {
        lockPanel();
      });
    }
  }

  function setupChangePassword() {
    if (!formChangePassword) return;

    formChangePassword.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = inputCurrentPass ? inputCurrentPass.value : '';
      const newPassword = inputNewPass ? inputNewPass.value : '';
      const confirmPassword = inputConfirmPass ? inputConfirmPass.value : '';

      if (!currentPassword || !newPassword) {
        showChangePassMsg('Todos los campos marcados con * son obligatorios', 'error');
        return;
      }

      if (newPassword !== confirmPassword) {
        showChangePassMsg('La confirmación de la contraseña no coincide', 'error');
        return;
      }

      if (newPassword.trim().length < 4) {
        showChangePassMsg('La nueva contraseña debe tener al menos 4 caracteres', 'error');
        return;
      }

      btnSubmitChangePass.disabled = true;
      btnSubmitChangePass.textContent = 'Guardando nueva clave... ⏳';

      try {
        const token = localStorage.getItem(AUTH_STORAGE_KEY);
        const res = await fetch('/api/dj/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentPassword,
            newPassword: newPassword.trim(),
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          if (data.token) {
            localStorage.setItem(AUTH_STORAGE_KEY, data.token);
          }
          showChangePassMsg('✨ ¡Contraseña actualizada exitosamente! La nueva clave ya está activa.', 'success');
          formChangePassword.reset();
        } else {
          showChangePassMsg(`⚠️ ${data.error || 'No se pudo actualizar la contraseña'}`, 'error');
        }
      } catch (err) {
        showChangePassMsg('⚠️ Error de comunicación con el servidor.', 'error');
      } finally {
        btnSubmitChangePass.disabled = false;
        btnSubmitChangePass.textContent = '💾 Actualizar Contraseña Mágica';
      }
    });
  }

  function showChangePassMsg(msg, type) {
    if (!changePassStatus) return;
    changePassStatus.style.display = 'block';
    changePassStatus.style.background = type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
    changePassStatus.style.border = type === 'success' ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)';
    changePassStatus.style.color = type === 'success' ? '#4ade80' : '#f87171';
    changePassStatus.textContent = msg;

    if (type === 'success') {
      setTimeout(() => {
        changePassStatus.style.display = 'none';
      }, 6000);
    }
  }

  // --- Tab Navigation ---
  function switchDjTab(targetTab) {
    const tabBtns = document.querySelectorAll('.dj-tab-btn');
    tabBtns.forEach((b) => {
      if (b.getAttribute('data-tab') === targetTab) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
    document.querySelectorAll('.dj-tab-content').forEach((content) => {
      content.classList.remove('active');
    });

    const activeContent = document.getElementById(targetTab);
    if (activeContent) {
      activeContent.classList.add('active');
    }

    if (targetTab === 'tab-programacion') {
      loadCrudSchedule();
    }
  }
  window.switchDjTab = switchDjTab;

  function setupTabs() {
    const tabBtns = document.querySelectorAll('.dj-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        switchDjTab(targetTab);
      });
    });
  }

  // --- Fetch Station Status ---
  async function fetchStatus() {
    try {
      const res = await fetch(API_NOWPLAYING);
      if (!res.ok) return;
      const data = await res.json();

      const isLive = data.live?.is_live || false;
      const streamerName = data.live?.streamer_name || '';
      const isOnline = Boolean(data.is_online ?? (data.now_playing?.song?.title && data.now_playing.song.title !== 'Station Offline'));

      if (isLive) {
        djStatusBadge.className = 'dj-status-badge dj-status-badge--live';
        djStatusBadge.textContent = `🔴 EN VIVO: ${streamerName || 'LOCUTOR'}`;
      } else if (isOnline) {
        djStatusBadge.className = 'dj-status-badge dj-status-badge--autodj';
        djStatusBadge.textContent = '🟢 EN LÍNEA (AutoDJ)';
      } else {
        djStatusBadge.className = 'dj-status-badge dj-status-badge--offline';
        djStatusBadge.textContent = '⚫ FUERA DEL AIRE';
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

      chatSocket.on('connect', () => {
        console.log('🦉 Cabina conectada al chat de oyentes');
        chatSocket.emit('join', { name: 'Cabina Locutor 🎙️', house: 'ALTA' });
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

  // --- Schedule CRUD Logic (Modal-Based) ---
  function setupScheduleCrud() {
    // Open Create Modal
    if (btnOpenCreateShow) {
      btnOpenCreateShow.addEventListener('click', openCreateModal);
    }

    // Close Show Modal
    if (modalShowClose) modalShowClose.addEventListener('click', closeShowModal);
    if (modalShowCancel) modalShowCancel.addEventListener('click', closeShowModal);

    // Close Delete Modal
    if (modalDeleteClose) modalDeleteClose.addEventListener('click', closeDeleteModal);
    if (modalDeleteCancel) modalDeleteCancel.addEventListener('click', closeDeleteModal);

    // Overlay clicks close modals
    window.addEventListener('click', (e) => {
      if (e.target === modalShow) closeShowModal();
      if (e.target === modalDelete) closeDeleteModal();
    });

    // Escape key closes modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeShowModal();
        closeDeleteModal();
      }
    });

    // Confirm Delete Click
    if (modalDeleteConfirm) {
      modalDeleteConfirm.addEventListener('click', async () => {
        if (!pendingDeleteId) return;

        modalDeleteConfirm.disabled = true;
        modalDeleteConfirm.textContent = 'Eliminando... ⏳';

        try {
          const res = await fetch(`/api/schedule/${encodeURIComponent(pendingDeleteId)}`, {
            method: 'DELETE',
          });

          if (res.ok) {
            closeDeleteModal();
            showCrudStatus('🗑️ Show eliminado correctamente de la programación.', 'success');
            await loadCrudSchedule();
          } else {
            showCrudStatus('⚠️ Error al eliminar el show.', 'error');
          }
        } catch (e) {
          showCrudStatus('⚠️ Error de conexión con el servidor.', 'error');
        } finally {
          modalDeleteConfirm.disabled = false;
          modalDeleteConfirm.textContent = 'Sí, Eliminar 🗑️';
        }
      });
    }

    // Form submit (Create or Update)
    if (crudForm) {
      crudForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = crudShowId.value.trim();
        const name = crudName.value.trim();
        const days = crudDays.value.trim();
        const time = crudTime.value.trim();
        const host = crudHost.value.trim();
        const desc = crudDesc.value.trim();

        if (!name || !days || !time) return;

        crudSubmitBtn.disabled = true;
        crudSubmitBtn.textContent = 'Guardando... ✨';

        const payload = { name, days, time, host, desc };
        const isEditing = Boolean(id);
        const url = isEditing ? `/api/schedule/${encodeURIComponent(id)}` : '/api/schedule';
        const method = isEditing ? 'PUT' : 'POST';

        try {
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            closeShowModal();
            showCrudStatus(`✨ Show ${isEditing ? 'actualizado' : 'creado'} con éxito.`, 'success');
            await loadCrudSchedule();
          } else {
            const errData = await res.json();
            showCrudStatus(`⚠️ Error: ${errData.error || 'No se pudo guardar'}`, 'error');
          }
        } catch (err) {
          showCrudStatus('⚠️ Error de conexión con el servidor.', 'error');
        } finally {
          crudSubmitBtn.disabled = false;
          crudSubmitBtn.textContent = isEditing ? 'Actualizar Show ✨' : 'Guardar Show ✨';
        }
      });
    }
  }

  function openCreateModal() {
    resetCrudForm();
    if (crudFormTitle) crudFormTitle.textContent = '✨ Agregar Nuevo Show';
    if (crudSubmitBtn) crudSubmitBtn.textContent = 'Guardar Show ✨';
    if (modalShow) modalShow.classList.add('active');
    setTimeout(() => { if (crudName) crudName.focus(); }, 100);
  }

  function openEditModal(show) {
    if (!show) return;
    crudShowId.value = show.id || '';
    crudName.value = show.name || '';
    crudDays.value = show.days || '';
    crudTime.value = show.time || '';
    crudHost.value = show.host || '';
    crudDesc.value = show.desc || '';

    if (crudFormTitle) crudFormTitle.textContent = '✏️ Editar Show';
    if (crudSubmitBtn) crudSubmitBtn.textContent = 'Actualizar Show ✨';
    if (modalShow) modalShow.classList.add('active');
    setTimeout(() => { if (crudName) crudName.focus(); }, 100);
  }

  function closeShowModal() {
    if (modalShow) modalShow.classList.remove('active');
    resetCrudForm();
  }

  function resetCrudForm() {
    if (crudShowId) crudShowId.value = '';
    if (crudForm) crudForm.reset();
  }

  function openDeleteModal(id, name) {
    pendingDeleteId = id;
    if (modalDeleteText) {
      modalDeleteText.innerHTML = `¿Estás seguro de que deseas eliminar el show <strong style="color: var(--gold-400);">«${escapeHtml(name)}»</strong> de la programación pública? Esta acción no se puede deshacer.`;
    }
    if (modalDelete) modalDelete.classList.add('active');
  }

  function closeDeleteModal() {
    if (modalDelete) modalDelete.classList.remove('active');
    pendingDeleteId = null;
  }

  async function loadCrudSchedule() {
    if (!crudShowsContainer) return;

    try {
      let shows = [];
      const res = await fetch('/api/schedule');
      if (res.ok) {
        shows = await res.json();
      } else {
        const fallback = await fetch('/data/schedule.json');
        if (fallback.ok) shows = await fallback.json();
      }

      scheduleEvents = Array.isArray(shows) ? shows : [];
      renderCrudSchedule(scheduleEvents);
    } catch (e) {
      crudShowsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Error al cargar la programación.</div>';
    }
  }
  window.loadCrudSchedule = loadCrudSchedule;

  function renderCrudSchedule(shows) {
    if (crudCountBadge) {
      crudCountBadge.textContent = `${shows.length} ${shows.length === 1 ? 'show' : 'shows'}`;
    }

    if (shows.length === 0) {
      crudShowsContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 3rem 0;">
          No hay shows registrados en la programación. Haz clic en <strong>+ Agregar Nuevo Show</strong> para crear el primero. ✨
        </div>
      `;
      return;
    }

    crudShowsContainer.innerHTML = shows
      .map(
        (show) => `
      <div class="crud-item" data-id="${escapeHtml(String(show.id))}">
        <div class="crud-item__info">
          <h3>${escapeHtml(show.name)}</h3>
          ${show.desc ? `<p>${escapeHtml(show.desc)}</p>` : ''}
          <div class="crud-item__meta">
            <span class="crud-item__tag">📅 ${escapeHtml(show.days)}</span>
            <span class="crud-item__tag">⏰ ${escapeHtml(show.time)}</span>
            ${show.host ? `<span class="crud-item__tag">🎙️ ${escapeHtml(show.host)}</span>` : ''}
          </div>
        </div>
        <div class="crud-item__actions">
          <button type="button" class="btn btn--outline btn-icon edit-btn" title="Editar Show" data-id="${escapeHtml(String(show.id))}">
            ✏️ Editar
          </button>
          <button type="button" class="btn btn--outline btn-icon delete-btn" title="Eliminar Show" data-id="${escapeHtml(String(show.id))}" style="border-color: rgba(239, 68, 68, 0.4); color: #f87171;">
            🗑️ Eliminar
          </button>
        </div>
      </div>
    `
      )
      .join('');

    // Attach Edit and Delete listeners
    crudShowsContainer.querySelectorAll('.edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const show = scheduleEvents.find((s) => String(s.id) === String(id));
        if (show) openEditModal(show);
      });
    });

    crudShowsContainer.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const show = scheduleEvents.find((s) => String(s.id) === String(id));
        const name = show ? show.name : 'este show';
        openDeleteModal(id, name);
      });
    });
  }

  function showCrudStatus(msg, type) {
    if (!crudStatusMsg) return;
    crudStatusMsg.style.display = 'block';
    crudStatusMsg.style.background = type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
    crudStatusMsg.style.border = type === 'success' ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)';
    crudStatusMsg.style.color = type === 'success' ? '#4ade80' : '#f87171';
    crudStatusMsg.textContent = msg;

    setTimeout(() => {
      crudStatusMsg.style.display = 'none';
    }, 4000);
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
