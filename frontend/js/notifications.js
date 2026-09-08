/* ==========================================================================
   WizardFM — Browser Notifications
   ========================================================================== */

(() => {
  'use strict';

  let permissionGranted = false;

  function init() {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      permissionGranted = true;
    } else if (Notification.permission !== 'denied') {
      // Request permission on first user interaction
      document.addEventListener('click', requestPermission, { once: true });
    }
  }

  async function requestPermission() {
    try {
      const result = await Notification.requestPermission();
      permissionGranted = result === 'granted';
    } catch {
      // Older browsers
      Notification.requestPermission((result) => {
        permissionGranted = result === 'granted';
      });
    }
  }

  function notifyLive(streamerName) {
    if (!permissionGranted) return;

    // Don't notify if page is visible
    if (!document.hidden) return;

    try {
      const notification = new Notification('WizardFM ✨ EN VIVO', {
        body: `${streamerName} está transmitiendo en vivo. ¡Sintoniza ahora!`,
        icon: '/assets/icons/icon-192.png',
        badge: '/assets/icons/icon-192.png',
        tag: 'wizardfm-live', // Prevents duplicate notifications
        renotify: true,
        silent: false,
      });

      notification.addEventListener('click', () => {
        window.focus();
        notification.close();
      });

      // Auto-close after 10 seconds
      setTimeout(() => notification.close(), 10000);
    } catch (err) {
      console.warn('Notification failed:', err);
    }
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose
  window.WizardNotifications = { notifyLive, requestPermission };
})();
