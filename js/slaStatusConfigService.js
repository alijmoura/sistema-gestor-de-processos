/**
 * @fileoverview Servico global para SLA por Status
 * Fornece a API para obter o prazo SLA configurado para cada status
 * Usado pelo Kanban (ui.js) para calcular e exibir badges de SLA por status
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

(function() {
  'use strict';

  /**
   * Configuracoes de SLA por status carregadas do Firestore
   * @type {Object<string, Object>}
   */
  let slaConfig = {};

  /**
   * Flag indicando se as configuracoes foram carregadas
   * @type {boolean}
   */
  let configLoaded = false;

  /**
   * Flag indicando se o carregamento esta em andamento
   * @type {boolean}
   */
  let isLoading = false;

  /**
   * Converte texto do status para ID normalizado
   * @param {string} text - Texto do status
   * @returns {string} ID normalizado
   */
  function getStatusId(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');
  }

  /**
   * Carrega configuracoes do Firestore
   * @returns {Promise<void>}
   */
  async function loadConfig() {
    if (isLoading) return;

    isLoading = true;

    try {
      // Verificar se Firebase esta disponivel
      if (typeof firebase === 'undefined' || !firebase.firestore) {
        console.warn('[SLAStatusConfigService] Firebase nao disponivel, usando valores padrao');
        loadDefaultConfig();
        return;
      }

      const db = firebase.firestore();
      const snapshot = await db.collection('slaConfig').get();

      slaConfig = {};
      snapshot.forEach(doc => {
        slaConfig[doc.id] = doc.data();
      });

      configLoaded = true;
      console.log('[SLAStatusConfigService] Configuracoes carregadas:', Object.keys(slaConfig).length, 'status');

      // Disparar evento indicando que as configuracoes foram carregadas
      document.dispatchEvent(new CustomEvent('sla-config-loaded', {
        detail: {
          count: Object.keys(slaConfig).length
        }
      }));

    } catch (error) {
      console.error('[SLAStatusConfigService] Erro ao carregar configuracoes:', error);
      loadDefaultConfig();
    } finally {
      isLoading = false;
    }
  }

  /**
   * Carrega valores padrao do config.js (SLA_TARGETS)
   */
  function loadDefaultConfig() {
    slaConfig = {};

    // Usar SLA_TARGETS de config.js se disponivel
    if (window.SLA_TARGETS && typeof window.SLA_TARGETS === 'object') {
      Object.entries(window.SLA_TARGETS).forEach(([status, days]) => {
        const statusId = getStatusId(status);
        slaConfig[statusId] = {
          statusId: statusId,
          slaDays: days
        };
      });
    }

    configLoaded = true;
  }

  /**
   * Retorna o prazo SLA em dias para um status especifico
   * @param {string} status - Nome/texto do status
   * @returns {number} Prazo em dias uteis (0 = sem SLA)
   */
  function getSLAForStatus(status) {
    if (!status || !configLoaded) {
      return 0;
    }

    const statusId = getStatusId(status);
    const config = slaConfig[statusId];

    if (config && config.slaDays) {
      return config.slaDays;
    }

    // Fallback para SLA_TARGETS de config.js
    if (window.SLA_TARGETS && window.SLA_TARGETS[status]) {
      return window.SLA_TARGETS[status];
    }

    return 0;
  }

  /**
   * Retorna todas as configuracoes de SLA
   * @returns {Object}
   */
  function getAllConfig() {
    return { ...slaConfig };
  }

  /**
   * Recarrega configuracoes do Firestore
   * @returns {Promise<void>}
   */
  async function refresh() {
    configLoaded = false;
    await loadConfig();
  }

  /**
   * Atualiza configuracoes locais (usado pelo modal unificado)
   * @param {Object} newConfig - Novas configuracoes
   */
  function updateConfig(newConfig) {
    if (newConfig && typeof newConfig === 'object') {
      slaConfig = { ...newConfig };
      configLoaded = true;
      console.log('[SLAStatusConfigService] Configuracoes atualizadas localmente');
    }
  }

  // Expor API global
  window.SLAConfigManager = {
    getSLAForStatus,
    getAllConfig,
    refresh,
    updateConfig,
    isLoaded: () => configLoaded
  };

  // Listeners para sincronizacao com o modal unificado
  document.addEventListener('sla-config-updated', () => {
    console.log('[SLAStatusConfigService] Evento sla-config-updated recebido, recarregando...');
    refresh();
  });

  document.addEventListener('status-workflow-updated', (e) => {
    if (e.detail?.type === 'sla') {
      console.log('[SLAStatusConfigService] Evento status-workflow-updated (sla) recebido, recarregando...');
      refresh();
    }
  });

  // Carregar configuracoes quando Firebase estiver pronto
  function initWhenReady() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().onAuthStateChanged((user) => {
        if (user) {
          loadConfig();
        }
      });
    } else {
      // Tentar novamente em 500ms
      setTimeout(initWhenReady, 500);
    }
  }

  // Inicializar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenReady);
  } else {
    initWhenReady();
  }

  console.log('[SLAStatusConfigService] Servico inicializado');
})();
