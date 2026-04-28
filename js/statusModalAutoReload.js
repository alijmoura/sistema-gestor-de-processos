// Recarrega status sempre que o modal de Status & Regras for aberto
// Extraído do index.html para manter cache e reduzir HTML monolítico.
(function () {
  function setupStatusModalAutoReload() {
    const triggers = document.querySelectorAll('[data-open-modal="modal-status"]');
    const modalEl = document.getElementById('modal-status');
    if (!modalEl) return;

    triggers.forEach((btn) => {
      if (btn.__statusReloadBound) return;

      btn.addEventListener('click', () => {
        // Aguardamos pequeno delay para permitir animação de abertura
        setTimeout(() => {
          if (
            window.debugStatusAdmin &&
            typeof window.debugStatusAdmin.reloadStatusList === 'function'
          ) {
            try {
              window.debugStatusAdmin.reloadStatusList();
            } catch (e) {
              console.warn('Falha reloadStatusList', e);
            }
          }
        }, 120);
      });

      btn.__statusReloadBound = true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupStatusModalAutoReload);
  } else {
    setupStatusModalAutoReload();
  }
})();
