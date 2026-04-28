/**
 * @fileoverview Servico global para SLA por Data
 * Fornece a API para verificar alertas de vencimento de campos de data nos contratos
 * Usado pelo Kanban (ui.js) para exibir badges de SLA por data
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

(function() {
  'use strict';

  /**
   * Lista de campos de data disponiveis para monitoramento
   * @constant {Array<Object>}
   */
  const AVAILABLE_DATE_FIELDS = [
    { fieldName: 'vencSicaq', label: 'Vencimento SICAQ', defaultWarningDays: 5, defaultEnabled: true },
    { fieldName: 'dataPrevistaRegistro', label: 'Data Prevista Registro', defaultWarningDays: 5, defaultEnabled: false },
    { fieldName: 'dataConformidadeCehop', label: 'Data Conformidade Garantia', defaultWarningDays: 5, defaultEnabled: false },
    { fieldName: 'certificacaoRealizadaEm', label: 'Certificacao Realizada', defaultWarningDays: 3, defaultEnabled: false },
    { fieldName: 'cohaparAprovada', label: 'Cohapar Aprovada', defaultWarningDays: 3, defaultEnabled: false },
    { fieldName: 'minutaRecebida', label: 'Minuta Recebida', defaultWarningDays: 5, defaultEnabled: false },
    { fieldName: 'dataEntradaRegistro', label: 'Data Entrada Cartorio', defaultWarningDays: 10, defaultEnabled: false },
    { fieldName: 'dataAnaliseRegistro', label: 'Data Analise Registro', defaultWarningDays: 5, defaultEnabled: false },
    { fieldName: 'dataRetornoRi', label: 'Data Retorno RI', defaultWarningDays: 5, defaultEnabled: false },
    { fieldName: 'contratoCef', label: 'Contrato CEF Agendado', defaultWarningDays: 3, defaultEnabled: false },
    { fieldName: 'entrevistaBanco', label: 'Entrevista Banco', defaultWarningDays: 2, defaultEnabled: false },
    { fieldName: 'entrevistaCef', label: 'Entrevista CEF', defaultWarningDays: 2, defaultEnabled: false }
  ];

  /**
   * Configuracoes de SLA por data carregadas do Firestore
   * @type {Object<string, Object>}
   */
  let dateConfig = {};

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
   * Converte valor para Date
   * Suporta: Firestore Timestamp, objeto serializado {seconds, nanoseconds}, Date, string ISO
   * @param {*} value - Valor a ser convertido
   * @returns {Date|null}
   */
  function toDate(value) {
    if (!value) return null;

    // Firestore Timestamp com metodo toDate()
    if (typeof value.toDate === 'function') {
      return value.toDate();
    }

    // Timestamp serializado {seconds, nanoseconds}
    if (value.seconds !== undefined) {
      return new Date(value.seconds * 1000);
    }

    // Ja e Date
    if (value instanceof Date) {
      return value;
    }

    // String ISO
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }

  /**
   * Calcula quantos dias faltam para uma data (negativo = vencido)
   * @param {Date} date - Data alvo
   * @returns {number} Dias ate a data (negativo se ja passou)
   */
  function calculateDaysUntilExpiry(date) {
    if (!date) return null;

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const target = new Date(date);
    target.setHours(0, 0, 0, 0);

    const diffMs = target.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
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
        console.warn('[SLADateConfigService] Firebase nao disponivel, usando valores padrao');
        setDefaultConfig();
        return;
      }

      const db = firebase.firestore();
      const snapshot = await db.collection('slaDateConfig').get();

      dateConfig = {};
      snapshot.forEach(doc => {
        dateConfig[doc.id] = doc.data();
      });

      // Se nao houver configuracoes, usar valores padrao
      if (Object.keys(dateConfig).length === 0) {
        setDefaultConfig();
      }

      configLoaded = true;
      console.log('[SLADateConfigService] Configuracoes carregadas:', Object.keys(dateConfig).length, 'campos');

      // Disparar evento indicando que as configuracoes foram carregadas
      document.dispatchEvent(new CustomEvent('sla-date-config-loaded', {
        detail: {
          count: Object.keys(dateConfig).length,
          enabledFields: Object.values(dateConfig).filter(c => c.enabled).length
        }
      }));

    } catch (error) {
      console.error('[SLADateConfigService] Erro ao carregar configuracoes:', error);
      setDefaultConfig();
    } finally {
      isLoading = false;
    }
  }

  /**
   * Define configuracoes padrao
   */
  function setDefaultConfig() {
    dateConfig = {};
    AVAILABLE_DATE_FIELDS.forEach(field => {
      if (field.defaultEnabled) {
        dateConfig[field.fieldName] = {
          fieldName: field.fieldName,
          label: field.label,
          warningDays: field.defaultWarningDays,
          enabled: true
        };
      }
    });
    configLoaded = true;
  }

  /**
   * Retorna os campos habilitados para monitoramento
   * @returns {Array<Object>}
   */
  function getEnabledFields() {
    return Object.values(dateConfig).filter(c => c.enabled);
  }

  /**
   * Retorna configuracao de um campo especifico
   * @param {string} fieldName - Nome do campo
   * @returns {Object|null}
   */
  function getFieldConfig(fieldName) {
    return dateConfig[fieldName] || null;
  }

  /**
   * Verifica status de expiracao de todos os campos de data de um contrato
   * Retorna o alerta mais urgente (mais proximo do vencimento ou ja vencido)
   *
   * @param {Object} contract - Objeto do contrato
   * @returns {Object|null} Alerta mais urgente ou null se nenhum
   *
   * @example
   * const alert = SLADateConfigManager.getExpiryStatus(contract);
   * // Retorna: { fieldName: 'vencSicaq', label: 'Vencimento SICAQ', status: 'warn', days: 3, priority: 103 }
   * // Ou: { fieldName: 'vencSicaq', label: 'Vencimento SICAQ', status: 'expired', days: 2, priority: 202 }
   */
  function getExpiryStatus(contract) {
    if (!contract || !configLoaded) {
      return null;
    }

    const enabledFields = getEnabledFields();
    if (enabledFields.length === 0) {
      return null;
    }

    const alerts = [];

    for (const config of enabledFields) {
      const dateValue = contract[config.fieldName];
      if (!dateValue) continue;

      const date = toDate(dateValue);
      if (!date) continue;

      const daysUntil = calculateDaysUntilExpiry(date);
      if (daysUntil === null) continue;

      const warningDays = config.warningDays || 5;

      // Verificar se esta no periodo de alerta ou ja venceu
      if (daysUntil <= warningDays) {
        const status = daysUntil < 0 ? 'expired' : 'warn';
        const absDays = Math.abs(daysUntil);

        // Prioridade: expired tem prioridade maior, depois ordenar por dias (mais urgente primeiro)
        // expired: 200 + dias vencido (maior = mais urgente)
        // warn: 100 + (warningDays - dias restantes) (maior = mais urgente)
        const priority = status === 'expired'
          ? 200 + absDays
          : 100 + (warningDays - daysUntil);

        alerts.push({
          fieldName: config.fieldName,
          label: config.label,
          status: status,
          days: absDays,
          priority: priority
        });
      }
    }

    if (alerts.length === 0) {
      return null;
    }

    // Retornar o alerta mais urgente (maior prioridade)
    alerts.sort((a, b) => b.priority - a.priority);
    return alerts[0];
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
      dateConfig = { ...newConfig };
      configLoaded = true;
      console.log('[SLADateConfigService] Configuracoes atualizadas localmente');
    }
  }

  // Expor API global
  window.SLADateConfigManager = {
    getExpiryStatus,
    getEnabledFields,
    getFieldConfig,
    calculateDaysUntilExpiry: (date) => calculateDaysUntilExpiry(toDate(date)),
    refresh,
    updateConfig,
    isLoaded: () => configLoaded
  };

  // Listeners para sincronizacao com o modal unificado
  document.addEventListener('sla-date-config-updated', () => {
    console.log('[SLADateConfigService] Evento sla-date-config-updated recebido, recarregando...');
    refresh();
  });

  document.addEventListener('status-workflow-updated', (e) => {
    if (e.detail?.type === 'sla-date') {
      console.log('[SLADateConfigService] Evento status-workflow-updated (sla-date) recebido, recarregando...');
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

  console.log('[SLADateConfigService] Servico inicializado');
})();
