//  Script para gerenciar backdrop de modais com suporte a Bootstrap 5
// Extraído do index.html para manter cache e reduzir HTML monolítico.
(function () {
  'use strict';

  //  CORREÇÃO: Remover backdrops órfãos periodicamente
  function cleanupOrphanedBackdrops() {
    const visibleModals = document.querySelectorAll('.modal.show');
    const allBackdrops = document.querySelectorAll('.modal-backdrop');
    
    // Se há mais backdrops que modais visíveis, temos órfãos
    if (allBackdrops.length > visibleModals.length) {
      const excessCount = allBackdrops.length - visibleModals.length;
      let removed = 0;
      
      allBackdrops.forEach((backdrop) => {
        if (removed < excessCount) {
          if (window.__DEBUG__) {
            console.log('[legacyModalBackdropObserver] Removendo backdrop órfão');
          }
          backdrop.remove();
          removed++;
        }
      });
    }
    
    // Se não há modais visíveis, não deve haver modal-open no body
    if (visibleModals.length === 0) {
      if (document.body.classList.contains('modal-open')) {
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
      }
      // Remove todos os backdrops órfãos se não há modais
      allBackdrops.forEach(backdrop => backdrop.remove());
    }
  }

  // Função para observar mudanças no display dos modais
  function observeModalChanges() {
    const modals = document.querySelectorAll('.modal');

    modals.forEach((modal) => {
      // Observer para mudanças no atributo style e class
      const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
            const isVisible =
              modal.style.display === 'block' ||
              modal.classList.contains('show') ||
              window.getComputedStyle(modal).display === 'block';

            if (isVisible) {
              document.body.classList.add('modal-open');
              // Previne scroll do body
              document.body.style.overflow = 'hidden';
            } else {
              // Verifica se ainda há outros modais abertos
              const openModals = Array.from(document.querySelectorAll('.modal')).some(
                (m) =>
                  m.style.display === 'block' ||
                  m.classList.contains('show') ||
                  window.getComputedStyle(m).display === 'block'
              );

              if (!openModals) {
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                
                //  CORREÇÃO: Remover backdrops órfãos quando todos os modais fecham
                setTimeout(() => {
                  const remainingBackdrops = document.querySelectorAll('.modal-backdrop');
                  remainingBackdrops.forEach(backdrop => backdrop.remove());
                }, 50);
              }
            }
            
            // Limpar backdrops sempre após mudança
            setTimeout(cleanupOrphanedBackdrops, 10);
          }
        });
      });

      observer.observe(modal, {
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    });
  }

  // Inicializar quando o DOM estiver carregado
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeModalChanges);
  } else {
    observeModalChanges();
  }

  // Re-observar quando novos modais forem adicionados dinamicamente
  const bodyObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1 && (node.classList?.contains('modal') || node.querySelector?.('.modal'))) {
            // Aguardar um tick para garantir que o elemento esteja totalmente inserido
            setTimeout(observeModalChanges, 0);
          }
        });
      }
    });
  });

  bodyObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  //  PROTEÇÃO: Executar limpeza periódica a cada 5s como fallback
  setInterval(cleanupOrphanedBackdrops, 5000);
})();
