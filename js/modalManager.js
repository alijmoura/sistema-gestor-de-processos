/**
 * Modal Manager & Factory
 * Gerencia ciclo de vida e criação padronizada de modais.
 * Integração total com modal-standard.css e Bootstrap 5.
 */

class ModalFactory {
  /**
   * Cria um modal dinâmico com a estrutura padrão
   * @param {Object} options Configurações do modal
   * @returns {HTMLElement} O elemento do modal criado
   */
  static create({
    id = `modal-${Date.now()}`,
    title = 'Novo Modal',
    body = '',
    footer = '',
    size = 'modal-md', // modal-sm, modal-lg, modal-xl
    type = 'default', // default, success, error, warning, info
    removeOnClose = true
  }) {
    const modalHTML = `
      <div class="modal fade modal-${type}" id="${id}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog ${size} modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
              ${body}
            </div>
            ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modalEl = document.getElementById(id);

    if (removeOnClose) {
      modalEl.addEventListener('hidden.bs.modal', () => {
        modalEl.remove();
      });
    }

    return modalEl;
  }
}

// Helpers Globais
const resolveModalElement = (modalOrId) => {
  if (!modalOrId) return null;
  if (typeof modalOrId === 'string') return document.getElementById(modalOrId);
  return modalOrId instanceof HTMLElement ? modalOrId : null;
};

//  Helper para aplicar Z-Index correto (Modal > Backdrop)
const applyModalZIndex = (modal) => {
  if (!(modal instanceof HTMLElement)) return;

  // Verificar se e um modal aninhado (submodal) que nao deve ter backdrop proprio
  // Modais aninhados sao identificados por:
  // 1. Atributo data-nested-modal="true"
  // 2. Estar dentro de outro modal .show
  const isNestedModal = modal.hasAttribute('data-nested-modal') ||
                        modal.closest('.modal.show:not(#' + modal.id + ')') !== null;

  // Calcula z-index baseado em modais abertos
  const openModals = document.querySelectorAll('.modal.show');
  const modalCount = Math.max(openModals.length, 1);

  // Bootstrap padrão: Backdrop 1050, Modal 1055.
  // Incrementamos 10 para cada nível de modal sobreposto.
  // Para modais aninhados, usamos z-index mais alto para garantir visibilidade
  const baseModalZ = isNestedModal ? 1080 : 1055 + ((modalCount - 1) * 10);
  const backdropZ = baseModalZ - 5;

  // Aplica z-index com !important para sobrescrever qualquer CSS
  modal.style.setProperty('z-index', String(baseModalZ), 'important');

  // Para modais aninhados, remover backdrops extras criados
  if (isNestedModal) {
    const backdrops = document.querySelectorAll('.modal-backdrop');
    // Manter apenas 1 backdrop (do modal pai)
    if (backdrops.length > 1) {
      // Remover o backdrop mais recente (do submodal)
      backdrops[backdrops.length - 1].remove();
      if (window.__DEBUG__) {
        console.log('[ModalManager] Backdrop removido para modal aninhado:', modal.id);
      }
    }
    return; // Nao ajustar z-index dos backdrops restantes
  }

  // Força z-index em TODOS os backdrops (apenas para modais nao-aninhados)
  const backdrops = document.querySelectorAll('.modal-backdrop');
  backdrops.forEach((backdrop, index) => {
    const z = index === backdrops.length - 1 ? backdropZ : 1050 + (index * 10);
    backdrop.style.setProperty('z-index', String(z), 'important');
  });

  if (window.__DEBUG__) {
    console.log('[ModalManager]  Z-index aplicado:', {
      modal: modal.id,
      modalZ: baseModalZ,
      backdropZ: backdropZ,
      totalBackdrops: backdrops.length,
      isNestedModal: isNestedModal
    });
  }
};

const openModal = (modalOrId) => {
  const modal = resolveModalElement(modalOrId);
  if (!modal) return console.warn('[ModalManager] Modal não encontrado:', modalOrId);

  //  CORREÇÃO: Remover classe .hidden ou .d-none que possa impedir exibição
  // Isso é necessário para modais customizados que usam .hidden para ocultação inicial
  modal.classList.remove('hidden', 'd-none');

  // Forçar estrutura Bootstrap se faltar classes
  if (!modal.classList.contains('modal')) modal.classList.add('modal');
  if (!modal.classList.contains('fade')) modal.classList.add('fade');

  // Usar API do Bootstrap 5 (Preferencial)
  let bootstrapSuccess = false;
  // Permite forçar o modo CSS via atributo data-force-css (útil para evitar bugs de biblioteca)
  const forceCss = modal.hasAttribute('data-force-css');

  if (!forceCss && window.bootstrap?.Modal) {
    try {
      const instance = window.bootstrap.Modal.getOrCreateInstance(modal);
      instance.show();
      bootstrapSuccess = true;
    } catch (e) {
      console.warn('[ModalManager] Erro Bootstrap API, usando fallback:', e);
    }
  }

  if (!bootstrapSuccess) {
    // Fallback CSS-only (não recomendado, mas mantém compatibilidade)
    modal.classList.add('show');
    modal.style.display = 'block';
    document.body.classList.add('modal-open');
    
    // Criar backdrop manual se não existir
    if (!document.querySelector('.modal-backdrop')) {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop fade show';
      document.body.appendChild(backdrop);
    }

    //  Aplicar correção de Z-Index imediatamente no fallback
    applyModalZIndex(modal);
  }
};

const closeModal = (modalOrId) => {
  const modal = resolveModalElement(modalOrId);
  if (!modal) return;

  if (window.bootstrap?.Modal) {
    const instance = window.bootstrap.Modal.getInstance(modal);
    if (instance) {
      instance.hide();
      
      //  CORREÇÃO: Garantir limpeza de backdrop após modal fechar
      modal.addEventListener('hidden.bs.modal', () => {
        cleanupBackdropsAfterModalClose();
      }, { once: true });
    }
    else {
        // Fallback: remover classes manualmente
        modal.classList.remove('show');
        modal.style.display = 'none';
        cleanupBackdropsAfterModalClose();
    }
  } else {
    modal.classList.remove('show');
    modal.style.display = 'none';
    cleanupBackdropsAfterModalClose();
  }
};

//  Helper para remover backdrops órfãos
const cleanupBackdropsAfterModalClose = () => {
  // Aguardar um tick para Bootstrap limpar estado
  setTimeout(() => {
    const visibleModals = document.querySelectorAll('.modal.show');
    const allBackdrops = document.querySelectorAll('.modal-backdrop');
    
    // Remover backdrops em excesso
    if (allBackdrops.length > visibleModals.length) {
      allBackdrops.forEach((backdrop, index) => {
        if (index >= visibleModals.length) {
          backdrop.remove();
        }
      });
    }
    
    // Se não há modais visíveis, limpar estado completo
    if (visibleModals.length === 0) {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      allBackdrops.forEach(backdrop => backdrop.remove());
    }
    
    if (window.__DEBUG__) {
      console.log('[ModalManager] Backdrop cleanup:', {
        visibleModals: visibleModals.length,
        remainingBackdrops: document.querySelectorAll('.modal-backdrop').length
      });
    }
  }, 50);
};

// Expor globalmente
window.ModalFactory = ModalFactory;
window.openModal = openModal;
window.closeModal = closeModal;

// Inicialização de Listeners Globais
function setupModalManager() {
  if (window.__modalManagerReady) return;
  window.__modalManagerReady = true;

  // Debug: captura evento de abertura do modal
  document.addEventListener('show.bs.modal', (event) => {
    if (window.__DEBUG__) {
      console.log('[ModalManager] show.bs.modal disparado:', {
        id: event.target.id,
        defaultPrevented: event.defaultPrevented
      });
    }
  });

  //  SOLUÇÃO DEFINITIVA: Aplica z-index APENAS após modal estar completamente aberto
  document.addEventListener('shown.bs.modal', (event) => {
    const modal = event.target;
    
    if (window.__DEBUG__) {
      console.log('[ModalManager]  Modal aberto com sucesso:', event.target.id);
    }

    // Reutiliza a função centralizada de Z-Index
    applyModalZIndex(modal);
  });

  //  Listener global para limpeza de backdrop sempre que modal fecha
  document.addEventListener('hidden.bs.modal', (event) => {
    if (window.__DEBUG__) {
      console.log('[ModalManager] hidden.bs.modal disparado:', event.target.id);
    }
    
    // Executar limpeza após modal realmente desaparecer do DOM
    setTimeout(cleanupBackdropsAfterModalClose, 50);
  });

  //  ACESSIBILIDADE: Remove aria-hidden de modais com elementos focados
  document.addEventListener('hide.bs.modal', (event) => {
    const modal = event.target;
    if (!(modal instanceof HTMLElement)) return;

    // Remove aria-hidden antes de fechar para evitar warning de acessibilidade
    const focusedElement = modal.querySelector(':focus');
    if (focusedElement && modal.hasAttribute('aria-hidden')) {
      modal.removeAttribute('aria-hidden');
    }
  });

  // Handler para data-open-modal
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-modal]');
    if (trigger) {
      e.preventDefault();
      const modalId = trigger.getAttribute('data-open-modal');
      openModal(modalId);
    }
  });
  
  // Handler para data-close-modal (custom)
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-close-modal]');
    if (trigger) {
      e.preventDefault();
      const modalId = trigger.getAttribute('data-close-modal');
      closeModal(modalId);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupModalManager);
} else {
  setupModalManager();
}
