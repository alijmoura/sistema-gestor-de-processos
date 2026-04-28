function isWhatsAppDebugEnabled() {
  if (window.__DEBUG_WHATSAPP__ === true) return true;
  if (window.__DEBUG__ === true) return true;
  if (typeof window.__DEBUG__ === 'object') {
    return Boolean(window.__DEBUG__.whatsapp || window.__DEBUG__.all);
  }
  return false;
}

function debugLog(...args) {
  if (isWhatsAppDebugEnabled()) {
    console.log(...args);
  }
}

// Atualizar texto do status WhatsApp
document.addEventListener('DOMContentLoaded', () => {
  const whatsappToggle = document.getElementById('whatsapp-enabled');
  const statusText = document.getElementById('whatsapp-status-text');

  if (whatsappToggle && statusText) {
    const updateStatusText = () => {
      if (whatsappToggle.checked) {
        statusText.textContent = 'Habilitado';
        statusText.classList.remove('text-danger');
        statusText.classList.add('text-success');
      } else {
        statusText.textContent = 'Desabilitado';
        statusText.classList.remove('text-success');
        statusText.classList.add('text-danger');
      }
    };

    whatsappToggle.addEventListener('change', updateStatusText);
    updateStatusText();
  }
});

// Inicializar configuração de números WhatsApp quando painel for aberto
document.addEventListener('DOMContentLoaded', async () => {
  const panelWhatsApp = document.getElementById('panel-whatsapp');
  if (!panelWhatsApp) return;

  const observer = new MutationObserver(async (mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') continue;
      if (!panelWhatsApp.classList.contains('active')) continue;

      if (window.__WHATSAPP_PHONE_CONFIG_UI__ && !window.__WHATSAPP_PHONE_CONFIG_INITIALIZED__) {
        debugLog('[main] Inicializando configuração de números WhatsApp...');
        await window.__WHATSAPP_PHONE_CONFIG_UI__.init();
        window.__WHATSAPP_PHONE_CONFIG_INITIALIZED__ = true;
      }
    }
  });

  observer.observe(panelWhatsApp, { attributes: true });
});

// Logs de diagnóstico somente quando debug WhatsApp estiver habilitado
window.addEventListener('DOMContentLoaded', () => {
  if (!isWhatsAppDebugEnabled()) return;

  debugLog('[WhatsApp Debug] DOM carregado');
  debugLog('[WhatsApp Debug] Bootstrap disponível:', typeof bootstrap !== 'undefined');

  const modal = document.getElementById('whatsapp-attachment-modal');
  debugLog('[WhatsApp Debug] Modal de anexo encontrado:', modal !== null);

  const btnHeader = document.getElementById('whatsapp-attachment-btn');
  debugLog('[WhatsApp Debug] Botão de anexo (header) encontrado:', btnHeader !== null);

  const btnFooter = document.querySelector('.btn-attach');
  debugLog('[WhatsApp Debug] Botão de anexo (footer) encontrado:', btnFooter !== null);

  if (btnFooter) {
    debugLog('[WhatsApp Debug] Botão footer data-bs-toggle:', btnFooter.getAttribute('data-bs-toggle'));
    debugLog('[WhatsApp Debug] Botão footer data-bs-target:', btnFooter.getAttribute('data-bs-target'));
  }
});
