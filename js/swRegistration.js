/* Registro global de Service Worker com fluxo de atualizacao imediata. */
(function initServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const SW_URL = '/sw.js';

  const requestSkipWaiting = (registration) => {
    if (!registration || !registration.waiting) {
      return;
    }

    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  const watchForWaitingWorker = (registration) => {
    if (!registration) {
      return;
    }

    if (registration.waiting) {
      requestSkipWaiting(registration);
      return;
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) {
        return;
      }

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          requestSkipWaiting(registration);
        }
      });
    });
  };

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) {
      return;
    }

    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(SW_URL);
      watchForWaitingWorker(registration);

      // Forca verificacao de atualizacao a cada carregamento da pagina.
      await registration.update();
    } catch (error) {
      console.warn('[swRegistration] Falha ao registrar Service Worker:', error);
    }
  });
})();
