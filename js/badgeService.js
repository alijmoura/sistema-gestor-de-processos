/**
 * @fileoverview Badge Service - Gerencia badges e indicadores na sidebar
 */

(function () {
  'use strict';

  /**
   * Configuracao dos badges
   */
  const BADGE_CONFIG = {
    aprovacao: {
      id: 'aprovacao-badge',
      color: 'bg-warning text-dark',
      threshold: 0,
      icon: 'bi-exclamation-triangle'
    },
    processosCriticos: {
      id: 'processos-criticos-badge',
      color: 'bg-danger',
      threshold: 0,
      icon: 'bi-exclamation-circle-fill'
    },
    whatsapp: {
      id: 'whatsapp-chats-counter',
      color: 'bg-danger',
      threshold: 0,
      icon: 'bi-chat-dots-fill'
    },
    notificacoes: {
      id: 'notification-badge',
      color: 'bg-danger',
      threshold: 0,
      icon: 'bi-bell-fill'
    }
  };

  /**
   * Estados de sincronizacao
   */
  const SYNC_STATES = {
    synced: {
      icon: 'bi-cloud-check-fill',
      color: 'text-success',
      text: 'Sincronizado',
      class: 'sync-success'
    },
    syncing: {
      icon: 'bi-cloud-arrow-up-fill',
      color: 'text-info',
      text: 'Sincronizando...',
      class: 'sync-loading'
    },
    error: {
      icon: 'bi-cloud-slash-fill',
      color: 'text-danger',
      text: 'Erro de conexao',
      class: 'sync-error'
    },
    offline: {
      icon: 'bi-wifi-off',
      color: 'text-secondary',
      text: 'Offline',
      class: 'sync-offline'
    }
  };

  /**
   * Cache de contadores
   */
  let badgeCache = {
    aprovacao: 0,
    processosCriticos: 0,
    whatsapp: 0,
    notificacoes: 0
  };

  /**
   * Estado atual de sincronizacao
   */
  let currentSyncState = 'synced';

  /**
   * Elementos DOM
   */
  let elements = {};

  /**
   * Inicializa o servico de badges
   */
  function init() {
    if (window.__BADGE_SERVICE_INITIALIZED__) {
      console.warn('[BadgeService] Ja inicializado');
      return;
    }

    cacheElements();
    setupListeners();

    window.__BADGE_SERVICE_INITIALIZED__ = true;
    console.log('[BadgeService] Inicializado com sucesso');
  }

  /**
   * Cacheia elementos DOM
   */
  function cacheElements() {
    elements = {
      processosCriticosBadge: document.getElementById('processos-criticos-badge'),
      whatsappBadge: document.getElementById('whatsapp-chats-counter'),
      notificacoesBadge: document.getElementById('notification-badge'),
      syncIndicator: document.getElementById('sync-indicator'),
      syncIcon: document.querySelector('#sync-indicator i'),
      syncText: document.querySelector('#sync-indicator .sync-text')
    };

    const missing = [];
    if (!elements.processosCriticosBadge) missing.push('processos-criticos-badge');
    if (!elements.syncIndicator) missing.push('sync-indicator');

    if (missing.length > 0) {
      console.warn('[BadgeService] Elementos nao encontrados:', missing);
    }
  }

  /**
   * Configura listeners de eventos
   */
  function setupListeners() {
    window.addEventListener('online', () => {
      updateSyncState('synced');
    });

    window.addEventListener('offline', () => {
      updateSyncState('offline');
    });

    document.addEventListener('firestore:syncing', () => {
      updateSyncState('syncing');
    });

    document.addEventListener('firestore:synced', () => {
      updateSyncState('synced');
    });

    document.addEventListener('firestore:error', () => {
      updateSyncState('error');
      setTimeout(() => {
        if (navigator.onLine) {
          updateSyncState('synced');
        }
      }, 5000);
    });
  }

  /**
   * Badge de aprovacao removido da UI.
   * Metodo mantido por compatibilidade.
   * @returns {Promise<number>}
   */
  async function updateAprovacaoTotalAnalises() {
    return 0;
  }

  /**
   * Atualiza badge de aprovacao
   * @param {number} count
   */
  function updateAprovacaoBadge(count) {
    updateBadge('aprovacao', count, elements.aprovacaoBadge);
  }

  /**
   * Atualiza badge de processos criticos
   * @param {number} count
   */
  function updateProcessosCriticosBadge(count) {
    updateBadge('processosCriticos', count, elements.processosCriticosBadge);
  }

  /**
   * Atualiza badge generico
   * @param {string} type
   * @param {number} count
   * @param {HTMLElement} element
   */
  function updateBadge(type, count, element) {
    if (!element) {
      return;
    }

    const config = BADGE_CONFIG[type];
    const previousCount = badgeCache[type];

    badgeCache[type] = count;

    if (count > config.threshold) {
      element.textContent = count > 99 ? '99+' : count;
      element.classList.remove('d-none');

      if (count > previousCount) {
        element.classList.add('badge-pulse');
        setTimeout(() => {
          element.classList.remove('badge-pulse');
        }, 600);
      }
    } else {
      element.classList.add('d-none');
    }

    if (window.__DEBUG__) {
      console.log(`[BadgeService] Badge "${type}" atualizado: ${previousCount} -> ${count}`);
    }
  }

  /**
   * Atualiza estado de sincronizacao
   * @param {string} state
   */
  function updateSyncState(state) {
    if (!SYNC_STATES[state]) {
      console.warn(`[BadgeService] Estado de sync invalido: ${state}`);
      return;
    }

    currentSyncState = state;
    const config = SYNC_STATES[state];

    if (!elements.syncIndicator || !elements.syncIcon || !elements.syncText) {
      console.warn('[BadgeService] Elementos de sync nao encontrados');
      return;
    }

    elements.syncIcon.className = `bi ${config.icon} ${config.color}`;
    elements.syncText.textContent = config.text;
    elements.syncIndicator.className = `sync-indicator ${config.class}`;
    elements.syncIndicator.classList.remove('d-none');

    if (state === 'synced') {
      setTimeout(() => {
        elements.syncIndicator.classList.add('sync-fade-out');
        setTimeout(() => {
          elements.syncIndicator.classList.add('d-none');
          elements.syncIndicator.classList.remove('sync-fade-out');
        }, 300);
      }, 3000);
    }

    if (window.__DEBUG__) {
      console.log(`[BadgeService] Sync state: ${state}`);
    }
  }

  /**
   * Mantido para compatibilidade com chamadas legadas.
   * @param {Array} contracts
   * @returns {number}
   */
  function calculateAprovacoesPendentes(contracts) {
    if (!Array.isArray(contracts)) return 0;

    const statusAprovacao = ['Em Análise', 'Aguardando CCS', 'Pendência'];

    return contracts.filter((contract) => {
      return statusAprovacao.includes(contract.status);
    }).length;
  }

  /**
   * Calcula processos criticos (SLA vencido)
   * @param {Array} contracts
   * @returns {number}
   */
  function calculateProcessosCriticos(contracts) {
    if (!Array.isArray(contracts)) return 0;

    const now = new Date();

    return contracts.filter((contract) => {
      if (!contract.dataLimiteSLA) return false;

      let slaDate;
      if (contract.dataLimiteSLA.toDate) {
        slaDate = contract.dataLimiteSLA.toDate();
      } else if (contract.dataLimiteSLA instanceof Date) {
        slaDate = contract.dataLimiteSLA;
      } else {
        return false;
      }

      const statusFinalizados = ['Aprovado', 'Reprovado', 'Cancelado', 'Concluído'];
      return slaDate < now && !statusFinalizados.includes(contract.status);
    }).length;
  }

  /**
   * Atualiza badges derivados da lista de contratos.
   * Badge de aprovacao nao deve mais variar por filtros de contratos.
   * @param {Array} contracts
   */
  function updateAllBadges(contracts) {
    const criticos = calculateProcessosCriticos(contracts);
    updateProcessosCriticosBadge(criticos);
  }

  /**
   * @deprecated Mantido por compatibilidade.
   * @returns {Promise<number>}
   */
  async function updateAprovacoesPendentesConversao() {
    return 0;
  }

  /**
   * Obtem contadores atuais
   * @returns {Object}
   */
  function getBadgeCounts() {
    return { ...badgeCache };
  }

  /**
   * Obtem estado atual de sincronizacao
   * @returns {string}
   */
  function getSyncState() {
    return currentSyncState;
  }

  /**
   * Forca atualizacao de um badge especifico
   * @param {string} type
   * @param {number} count
   */
  function forceBadgeUpdate(type, count) {
    const element = elements[`${type}Badge`];
    if (element) {
      updateBadge(type, count, element);
    }
  }

  const BadgeService = {
    init,
    updateAprovacaoBadge,
    updateAprovacaoTotalAnalises,
    updateProcessosCriticosBadge,
    updateAprovacoesPendentesConversao,
    updateBadge,
    updateSyncState,
    updateAllBadges,
    calculateAprovacoesPendentes,
    calculateProcessosCriticos,
    getBadgeCounts,
    getSyncState,
    forceBadgeUpdate
  };

  window.BadgeService = BadgeService;

  if (window.__DEBUG__) {
    window.__BADGE_SERVICE__ = {
      cache: badgeCache,
      elements,
      config: BADGE_CONFIG,
      states: SYNC_STATES
    };
    console.log('[BadgeService] Debug mode ativo');
  }
})();
