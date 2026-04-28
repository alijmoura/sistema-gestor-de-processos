let initialized = false;
let waitingForModal = false;

function isWhatsAppDebugEnabled() {
  if (window.__DEBUG_WHATSAPP__ === true) return true;
  if (window.__DEBUG__ === true) return true;
  if (typeof window.__DEBUG__ === 'object') {
    return Boolean(window.__DEBUG__.whatsapp || window.__DEBUG__.all);
  }
  return false;
}

function debugLog(...args) {
  if (isWhatsAppDebugEnabled()) console.log(...args);
}

function debugWarn(...args) {
  if (isWhatsAppDebugEnabled()) console.warn(...args);
}

function waitForModalAndRetry() {
  if (waitingForModal || !document.body) return;
  waitingForModal = true;

  const observer = new MutationObserver(() => {
    const modalReady = !!document.getElementById('modal-whatsapp-config');
    if (!modalReady) return;

    observer.disconnect();
    waitingForModal = false;
    initWhatsAppConfigModalInlineBehavior();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(() => {
    observer.disconnect();
    waitingForModal = false;
  }, 15000);
}

export function initWhatsAppConfigModalInlineBehavior() {
  if (initialized) return;

  const modal = document.getElementById('modal-whatsapp-config');
  const generalTab = document.getElementById('whatsapp-general-tab');
  const tagsTab = document.getElementById('whatsapp-tags-tab');
  const messagesTab = document.getElementById('whatsapp-quick-messages-tab');

  debugLog('[WhatsApp Config Script] initWhatsAppConfigModalInlineBehavior()', {
    modal: !!modal,
    generalTab: !!generalTab,
    tagsTab: !!tagsTab,
    messagesTab: !!messagesTab,
  });

  if (!modal) {
    waitForModalAndRetry();
    return;
  }

  initialized = true;

  modal.addEventListener('shown.bs.modal', async () => {
    debugLog('[WhatsApp Config] Modal aberto, inicializando UIs...');

    if (window.__WHATSAPP_CONFIG__?.load) {
      try {
        await window.__WHATSAPP_CONFIG__.load();
      } catch (err) {
        console.error('[WhatsApp Config] Erro ao recarregar configuracao geral:', err);
      }
    }

    debugLog('[WhatsApp Config] Backends disponiveis:', {
      tags: !!window.__WHATSAPP_TAGS__,
      quickMessages: !!window.__WHATSAPP_QUICK_MESSAGES__,
      tagsUI: !!window.__WHATSAPP_TAGS_UI__,
      quickMessagesUI: !!window.__WHATSAPP_QUICK_MESSAGES_UI__,
    });

    if (window.__WHATSAPP_TAGS_UI__) {
      if (!window.__WHATSAPP_TAGS_UI__.elements.listContainer) {
        debugLog('[WhatsApp Config] Inicializando Tags UI...');
        await window.__WHATSAPP_TAGS_UI__.init().catch((err) => {
          console.error('[WhatsApp Config] Erro ao inicializar Tags UI:', err);
        });
      } else {
        debugLog('[WhatsApp Config] Tags UI ja inicializada');
      }
    } else {
      debugWarn('[WhatsApp Config] Tags UI nao disponivel');
    }

    if (window.__WHATSAPP_QUICK_MESSAGES_UI__) {
      if (!window.__WHATSAPP_QUICK_MESSAGES_UI__.elements.tableBody) {
        debugLog('[WhatsApp Config] Inicializando Quick Messages UI...');
        await window.__WHATSAPP_QUICK_MESSAGES_UI__.init().catch((err) => {
          console.error('[WhatsApp Config] Erro ao inicializar Quick Messages UI:', err);
        });
      } else {
        debugLog('[WhatsApp Config] Quick Messages UI ja inicializada');
      }
    } else {
      debugWarn('[WhatsApp Config] Quick Messages UI nao disponivel');
    }
  });

  const hideAllPanes = () => {
    document.querySelectorAll('#whatsapp-config-tabs-content .tab-pane').forEach((pane) => {
      pane.classList.remove('active', 'show');
      pane.style.display = 'none';
    });
  };

  if (generalTab) {
    generalTab.addEventListener('shown.bs.tab', async () => {
      debugLog('[WhatsApp Config] Aba Geral ativada');
      hideAllPanes();
      const generalPane = document.getElementById('whatsapp-general-pane');
      if (generalPane) {
        generalPane.classList.add('active', 'show');
        generalPane.style.display = 'block';
        debugLog('[WhatsApp Config] Aba Geral visivel, outras escondidas');
      }
    });
  }

  if (tagsTab) {
    tagsTab.addEventListener('shown.bs.tab', async () => {
      debugLog('[WhatsApp Config] Aba Tags ativada');
      hideAllPanes();
      const tagsPane = document.getElementById('whatsapp-tags-pane');
      if (tagsPane) {
        tagsPane.classList.add('active', 'show');
        tagsPane.style.display = 'block';
        debugLog('[WhatsApp Config] Aba Tags visivel, outras escondidas');
      }
    });
  }

  if (messagesTab) {
    messagesTab.addEventListener('shown.bs.tab', async () => {
      debugLog('[WhatsApp Config] Aba Mensagens Rapidas ativada');
      hideAllPanes();
      const messagesPane = document.getElementById('whatsapp-quick-messages-pane');
      if (messagesPane) {
        messagesPane.classList.add('active', 'show');
        messagesPane.style.display = 'block';
        debugLog('[WhatsApp Config] Aba Mensagens visivel, outras escondidas');
      }
    });
  }
}

if (!window.__WHATSAPP_CONFIG_MODAL_INLINE_RETRY_BOUND__) {
  window.__WHATSAPP_CONFIG_MODAL_INLINE_RETRY_BOUND__ = true;
  window.addEventListener('ui:components:rendered', () => {
    if (!initialized) {
      initWhatsAppConfigModalInlineBehavior();
    }
  });
}
