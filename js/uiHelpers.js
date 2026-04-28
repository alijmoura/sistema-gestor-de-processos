/**
 * @file uiHelpers.js
 * @description Utilitários de UI padronizados - Modais de confirmação, toasts, etc.
 * @version 1.0
 *
 * Este módulo substitui o uso de confirm() e alert() nativos por modais Bootstrap
 * para manter consistência visual em toda a aplicação.
 */

/**
 * Exibe modal de confirmação Bootstrap (substitui confirm() nativo)
 * @param {Object} options - Opções do modal
 * @returns {Promise<boolean>} - Resolve true se confirmado, false se cancelado
 */
export function confirmAction(options = {}) {
  return new Promise((resolve) => {
    const modalEl = document.getElementById('confirmModal');
    if (!modalEl) {
      console.warn('[uiHelpers] Modal de confirmação não encontrado, usando confirm() nativo');
      resolve(window.confirm(options.message || 'Confirmar ação?'));
      return;
    }

    const titleEl = document.getElementById('confirmModalTitle');
    const bodyEl = document.getElementById('confirmModalBody');
    const confirmBtn = document.getElementById('confirmModalConfirm');
    const cancelBtn = document.getElementById('confirmModalCancel');
    const iconEl = modalEl.querySelector('.modal-title i');

    if (titleEl) {
      titleEl.textContent = options.title || 'Confirmar ação';
    }
    
    if (bodyEl) {
      bodyEl.innerHTML = options.message || 'Tem certeza que deseja continuar?';
    }
    
    if (confirmBtn) {
      confirmBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>' + (options.confirmText || 'Confirmar');
      confirmBtn.className = 'btn ' + (options.confirmClass || 'btn-primary');
    }
    
    if (cancelBtn) {
      cancelBtn.innerHTML = '<i class="bi bi-x-circle me-1"></i>' + (options.cancelText || 'Cancelar');
    }

    if (iconEl) {
      iconEl.className = 'bi ' + (options.icon || 'bi-question-circle') + ' me-2 ' + (options.iconColor || 'text-warning');
    }

    //  CORREÇÃO: Remover backdrops órfãos ANTES de abrir novo modal
    // Conta quantas modais están realmente abertas (.show) para saber se deve remover backdrops
    const currentlyVisibleModals = document.querySelectorAll('.modal.show').length;
    const allBackdrops = document.querySelectorAll('.modal-backdrop');
    
    if (currentlyVisibleModals === 0) {
      // Se não há modais visíveis, remove TODOS os backdrops
      allBackdrops.forEach(backdrop => backdrop.remove());
    } else if (allBackdrops.length > currentlyVisibleModals) {
      // Se há mais backdrops que modais visíveis, remove o excesso
      // Mantém apenas um backdrop por modal
      const excessBackdrops = allBackdrops.length - currentlyVisibleModals;
      for (let i = 0; i < excessBackdrops; i++) {
        allBackdrops[i].remove();
      }
    }
    
    // Remove classe 'show' residual do modal se estiver presente
    modalEl.classList.remove('show');
    modalEl.style.display = '';
    
    // Garante que o body não tenha classes residuais
    document.body.classList.remove('modal-open');

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl, {
      backdrop: 'static',
      keyboard: false,
      focus: true
    });
    
    if (window.__DEBUG__) {
      console.log('[uiHelpers] Abrindo modal de confirmação...', { 
        modalEl, 
        visibleModals: currentlyVisibleModals,
        backdropsRemoved: allBackdrops.length - Math.min(currentlyVisibleModals, allBackdrops.length)
      });
    }

    function handleConfirm() {
      cleanup();
      modal.hide();
      resolve(true);
    }

    function handleCancel() {
      cleanup();
      modal.hide();
      resolve(false);
    }

    function handleHidden() {
      //  CORREÇÃO: Remover backdrop órfão quando o modal é fechado
      const orphanedBackdrop = document.querySelector('.modal-backdrop.fade.show');
      if (orphanedBackdrop && document.querySelectorAll('.modal.show').length === 0) {
        orphanedBackdrop.remove();
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
      }
      cleanup();
      resolve(false);
    }

    function cleanup() {
      if (confirmBtn) confirmBtn.removeEventListener('click', handleConfirm);
      if (cancelBtn) cancelBtn.removeEventListener('click', handleCancel);
      modalEl.removeEventListener('hidden.bs.modal', handleHidden);
    }

    if (confirmBtn) confirmBtn.addEventListener('click', handleConfirm);
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
    modalEl.addEventListener('hidden.bs.modal', handleHidden);

    modal.show();
  });
}

/**
 * Exibe modal de confirmação para exclusão (preset danger)
 * @param {string} itemName - Nome do item a ser excluído
 * @param {string} customMessage - Mensagem customizada opcional
 * @returns {Promise<boolean>}
 */
export function confirmDelete(itemName, customMessage) {
  // Usa o popover inline em vez do modal que tem problemas
  return confirmInline({
    title: 'Confirmar exclusão',
    message: customMessage || 'Tem certeza que deseja excluir <strong>' + itemName + '</strong>?',
    confirmText: 'Excluir',
    cancelText: 'Cancelar',
    confirmClass: 'btn-danger',
    icon: 'bi-trash'
  });
}

/**
 * Exibe confirmação inline (alternativa ao modal que evita problemas de z-index)
 * @param {Object} options - Opções da confirmação
 * @returns {Promise<boolean>}
 */
export function confirmInline(options = {}) {
  return new Promise((resolve) => {
    // Remove qualquer confirmação inline existente
    const existingConfirm = document.getElementById('inline-confirm-overlay');
    if (existingConfirm) {
      existingConfirm.remove();
    }

    // Cria o overlay de confirmação
    const overlay = document.createElement('div');
    overlay.id = 'inline-confirm-overlay';
    overlay.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center';
    overlay.style.cssText = 'z-index: 10200; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);';
    
    const iconClass = options.icon || 'bi-question-circle';
    const confirmClass = options.confirmClass || 'btn-primary';
    
    overlay.innerHTML = `
      <div class="card shadow-lg" style="max-width: 400px; animation: fadeIn 0.15s ease-out;">
        <div class="card-header bg-dark text-white d-flex align-items-center">
          <i class="bi ${iconClass} me-2 text-danger"></i>
          <span class="fw-semibold">${options.title || 'Confirmar ação'}</span>
        </div>
        <div class="card-body">
          <p class="mb-0">${options.message || 'Tem certeza que deseja continuar?'}</p>
          <small class="text-muted">Esta ação não pode ser desfeita.</small>
        </div>
        <div class="card-footer bg-light d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-secondary btn-sm" id="inline-confirm-cancel">
            <i class="bi bi-x-circle me-1"></i>${options.cancelText || 'Cancelar'}
          </button>
          <button type="button" class="btn ${confirmClass} btn-sm" id="inline-confirm-ok">
            <i class="bi bi-check-circle me-1"></i>${options.confirmText || 'Confirmar'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Adiciona animação CSS se não existir
    if (!document.getElementById('inline-confirm-styles')) {
      const style = document.createElement('style');
      style.id = 'inline-confirm-styles';
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        #inline-confirm-overlay .card {
          border: none;
          border-radius: 8px;
        }
      `;
      document.head.appendChild(style);
    }

    const confirmBtn = overlay.querySelector('#inline-confirm-ok');
    const cancelBtn = overlay.querySelector('#inline-confirm-cancel');

    function cleanup() {
      overlay.remove();
    }

    confirmBtn.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });

    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    // Fecha ao clicar fora do card
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    });

    // Fecha com ESC
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleEsc);
        cleanup();
        resolve(false);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // Foca no botão de cancelar por padrão (mais seguro)
    setTimeout(() => cancelBtn.focus(), 50);
  });
}

/**
 * Exibe modal de confirmação para ação importante
 * @param {string} action - Descrição da ação
 * @param {string} details - Detalhes adicionais
 * @returns {Promise<boolean>}
 */
export function confirmImportantAction(action, details) {
  return confirmAction({
    title: 'Ação importante',
    message: '<strong>' + action + '</strong><br><p class="text-muted mt-2 mb-0">' + details + '</p>',
    confirmText: 'Continuar',
    confirmClass: 'btn-warning',
    icon: 'bi-exclamation-triangle',
    iconColor: 'text-warning'
  });
}

/**
 * Exibe toast de notificação Bootstrap
 * @param {string} message - Mensagem do toast
 * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duração em ms (default: 3000)
 */
export function showToast(message, type, duration) {
  type = type || 'info';
  duration = duration || 3000;
  
  var container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '1080';
    document.body.appendChild(container);
  }

  var typeConfig = {
    success: { bg: 'bg-success', icon: 'bi-check-circle-fill' },
    error: { bg: 'bg-danger', icon: 'bi-x-circle-fill' },
    warning: { bg: 'bg-warning text-dark', icon: 'bi-exclamation-triangle-fill' },
    info: { bg: 'bg-info text-dark', icon: 'bi-info-circle-fill' }
  };

  var config = typeConfig[type] || typeConfig.info;

  var toastEl = document.createElement('div');
  toastEl.className = 'toast align-items-center ' + config.bg + ' text-white border-0';
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');
  toastEl.innerHTML = 
    '<div class="d-flex">' +
      '<div class="toast-body">' +
        '<i class="bi ' + config.icon + ' me-2"></i>' +
        message +
      '</div>' +
      '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button>' +
    '</div>';

  container.appendChild(toastEl);

  var toast = new bootstrap.Toast(toastEl, { delay: duration });
  toast.show();

  toastEl.addEventListener('hidden.bs.toast', function() {
    toastEl.remove();
  });
}

/**
 * Alterna visibilidade de elemento usando classes Bootstrap
 * @param {HTMLElement|string} element - Elemento ou seletor
 * @param {boolean} visible - Se deve estar visível
 */
export function toggleVisibility(element, visible) {
  var el = typeof element === 'string' ? document.querySelector(element) : element;
  if (!el) return;
  
  if (visible) {
    el.classList.remove('d-none');
  } else {
    el.classList.add('d-none');
  }
}

/**
 * Define estado de loading em um botão
 * @param {HTMLElement|string} button - Botão ou seletor
 * @param {boolean} loading - Se está em loading
 * @param {string} loadingText - Texto durante loading (opcional)
 */
export function setButtonLoading(button, loading, loadingText) {
  loadingText = loadingText || 'Aguarde...';
  var btn = typeof button === 'string' ? document.querySelector(button) : button;
  if (!btn) return;

  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' + loadingText;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    delete btn.dataset.originalText;
  }
}

/**
 * Copia texto para clipboard com feedback visual
 * @param {string} text - Texto a copiar
 * @param {string} successMessage - Mensagem de sucesso
 */
export async function copyToClipboard(text, successMessage) {
  successMessage = successMessage || 'Copiado!';
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage, 'success', 2000);
  } catch (err) {
    showToast('Erro ao copiar', 'error');
    console.error('[uiHelpers] Erro ao copiar:', err);
  }
}

// Exportar para uso global (window)
window.uiHelpers = {
  confirmAction: confirmAction,
  confirmDelete: confirmDelete,
  confirmInline: confirmInline,
  confirmImportantAction: confirmImportantAction,
  showToast: showToast,
  toggleVisibility: toggleVisibility,
  setButtonLoading: setButtonLoading,
  copyToClipboard: copyToClipboard
};

export default {
  confirmAction: confirmAction,
  confirmDelete: confirmDelete,
  confirmInline: confirmInline,
  confirmImportantAction: confirmImportantAction,
  showToast: showToast,
  toggleVisibility: toggleVisibility,
  setButtonLoading: setButtonLoading,
  copyToClipboard: copyToClipboard
};
