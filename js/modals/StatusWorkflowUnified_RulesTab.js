/**
 * @fileoverview Tab Manager para Regras de Campos por Status
 * Gerencia a configuracao de campos obrigatorios para cada status
 *
 * @module StatusWorkflowUnified_RulesTab
 * @requires firebase
 * @version 1.0.0
 * @date 2026-01-21
 */

/**
 * Lista de campos disponiveis para selecao como obrigatorios
 * Baseado em FIELDS_TO_TRACK de config.js
 * @constant {Array<Object>}
 */
const AVAILABLE_FIELDS = [
  // Dados Principais
  { fieldId: 'nomeCliente', label: 'Nome do Cliente', category: 'Dados Principais' },
  { fieldId: 'cpf', label: 'CPF', category: 'Dados Principais' },
  { fieldId: 'analista', label: 'Analista', category: 'Dados Principais' },
  { fieldId: 'vendedorConstrutora', label: 'Vendedor/Construtora', category: 'Dados Principais' },
  { fieldId: 'empreendimento', label: 'Empreendimento', category: 'Dados Principais' },
  { fieldId: 'apto', label: 'Apartamento', category: 'Dados Principais' },
  { fieldId: 'bloco', label: 'Bloco', category: 'Dados Principais' },
  { fieldId: 'corretor', label: 'Corretor', category: 'Dados Principais' },
  { fieldId: 'imobiliaria', label: 'Imobiliaria', category: 'Dados Principais' },

  // Formularios e CEHOP
  { fieldId: 'renda', label: 'Renda', category: 'Formularios' },
  { fieldId: 'validacao', label: 'Validacao', category: 'Formularios' },
  { fieldId: 'fgts', label: 'FGTS', category: 'Formularios' },
  { fieldId: 'certificadora', label: 'Certificadora', category: 'Formularios' },
  { fieldId: 'certificacaoRealizadaEm', label: 'Certificacao Realizada Em', category: 'Formularios' },
  { fieldId: 'cohaparAprovada', label: 'Cohapar Aprovada', category: 'Formularios' },
  { fieldId: 'produto', label: 'Produto', category: 'Formularios' },
  { fieldId: 'vencSicaq', label: 'Vencimento SICAQ', category: 'Formularios' },
  { fieldId: 'formulariosAssinadosEm', label: 'Formularios Assinados Em', category: 'Formularios' },
  { fieldId: 'entregueCehop', label: 'Entregue CEHOP', category: 'Formularios' },
  { fieldId: 'conformeEm', label: 'Conforme Em', category: 'Formularios' },
  { fieldId: 'analistaCehop', label: 'Analista CEHOP', category: 'Formularios' },

  // CEF / Banco
  { fieldId: 'agencia', label: 'Agencia', category: 'CEF' },
  { fieldId: 'gerente', label: 'Gerente', category: 'CEF' },
  { fieldId: 'entrevistaCef', label: 'Entrevista CEF', category: 'CEF' },
  { fieldId: 'contratoCef', label: 'Contrato CEF', category: 'CEF' },
  { fieldId: 'nContratoCEF', label: 'Numero Contrato CEF', category: 'CEF' },
  { fieldId: 'subsidio', label: 'Subsidio', category: 'CEF' },

  // Registro / Cartorio
  { fieldId: 'cartorio', label: 'Cartorio', category: 'Registro' },
  { fieldId: 'dataMinuta', label: 'Data da Minuta', category: 'Registro' },
  { fieldId: 'dataAssinaturaCliente', label: 'Data Assinatura Cliente', category: 'Registro' },
  { fieldId: 'iptu', label: 'IPTU', category: 'Registro' },
  { fieldId: 'solicitaITBI', label: 'Solicita ITBI', category: 'Registro' },
  { fieldId: 'valorITBI', label: 'Valor ITBI', category: 'Registro' },
  { fieldId: 'dataEntradaRegistro', label: 'Data Entrada Cartorio', category: 'Registro' },
  { fieldId: 'protocoloRi', label: 'Protocolo RI', category: 'Registro' },
  { fieldId: 'dataAnaliseRegistro', label: 'Data Analise Registro', category: 'Registro' },
  { fieldId: 'dataPrevistaRegistro', label: 'Data Prevista Registro', category: 'Registro' },
  { fieldId: 'dataRetornoRi', label: 'Data Retorno RI', category: 'Registro' },
  { fieldId: 'valorFinalRi', label: 'Valor Final RI', category: 'Registro' },

  // Financeiro
  { fieldId: 'valorVenda', label: 'Valor de Venda', category: 'Financeiro' },
  { fieldId: 'valorFgts', label: 'Valor FGTS', category: 'Financeiro' },
  { fieldId: 'valorFunrejus', label: 'Valor Funrejus', category: 'Financeiro' },
  { fieldId: 'valorDepositoRi', label: 'Valor Deposito RI', category: 'Financeiro' },

  // Outros
  { fieldId: 'anotacoes', label: 'Anotacoes', category: 'Outros' },
  { fieldId: 'pesquisas', label: 'Pesquisas', category: 'Outros' },
  { fieldId: 'faltaFinalizar', label: 'Falta Finalizar', category: 'Outros' }
];

/**
 * Gerenciador da tab "Regras de Campos" no modal unificado
 * @class
 */
export class RulesTabManager {
  /**
   * @constructor
   */
  constructor() {
    this.container = null;
    this.statusList = [];
    this.rulesMap = new Map();
    this.isLoading = false;
    this.searchTerm = '';
  }

  /**
   * Renderiza a tab completa
   * @returns {Promise<void>}
   */
  async render() {
    this.container = document.getElementById('unified-rules-container');
    if (!this.container) {
      console.error('[Rules Tab] Container nao encontrado');
      return;
    }

    // Carregar dados
    await this.loadData();

    // Renderizar HTML
    this.renderHTML();

    // Renderizar tabela
    this.renderTable();

    // Setup listeners
    this.setupListeners();

    console.log('[Rules Tab] Tab renderizada com sucesso');
  }

  /**
   * Carrega status e regras do Firestore
   * @returns {Promise<void>}
   */
  async loadData() {
    try {
      this.showStatus('Carregando regras...', 'info');

      // Carregar lista de status
      if (window.EFFECTIVE_STATUS_CONFIG && Array.isArray(window.EFFECTIVE_STATUS_CONFIG) && window.EFFECTIVE_STATUS_CONFIG.length > 0) {
        this.statusList = [...window.EFFECTIVE_STATUS_CONFIG].filter(s => s.active !== false);
      } else if (window.firestoreService && typeof window.firestoreService.getEffectiveStatuses === 'function') {
        const allStatuses = await window.firestoreService.getEffectiveStatuses();
        this.statusList = allStatuses.filter(s => s.active !== false);
      } else if (typeof firebase !== 'undefined' && firebase.firestore) {
        const db = firebase.firestore();
        const snapshot = await db.collection('statusConfig').where('active', '!=', false).orderBy('order').get();
        this.statusList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }

      // Ordenar por order
      this.statusList.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

      console.log(`[Rules Tab] ${this.statusList.length} status ativos carregados`);

      // Carregar regras existentes
      await this.loadRules();

      this.clearStatus();
    } catch (error) {
      console.error('[Rules Tab] Erro ao carregar:', error);
      this.showStatus('Erro ao carregar: ' + error.message, 'danger');
    }
  }

  /**
   * Carrega regras do Firestore
   * @returns {Promise<void>}
   */
  async loadRules() {
    try {
      let rules = [];

      if (window.firestoreService && typeof window.firestoreService.getAllStatusRules === 'function') {
        rules = await window.firestoreService.getAllStatusRules();
      } else if (typeof firebase !== 'undefined' && firebase.firestore) {
        const db = firebase.firestore();
        const snapshot = await db.collection('statusRules').get();
        rules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Mapear regras por nome original do status
      this.rulesMap.clear();
      rules.forEach(rule => {
        const key = rule.originalStatusName || rule.id;
        this.rulesMap.set(key, rule);
      });

      console.log(`[Rules Tab] ${rules.length} regras carregadas`);
    } catch (error) {
      console.error('[Rules Tab] Erro ao carregar regras:', error);
      this.rulesMap.clear();
    }
  }

  /**
   * Renderiza estrutura HTML da tab
   */
  renderHTML() {
    this.container.innerHTML = `
      <div class="d-flex flex-column h-100">
        <!-- Header com busca -->
        <div class="mb-3">
          <div class="row g-2 align-items-center">
            <div class="col-md-8">
              <div class="input-group input-group-sm">
                <span class="input-group-text"><i class="bi bi-search"></i></span>
                <input
                  type="text"
                  class="form-control"
                  id="rules-search"
                  placeholder="Buscar status..."
                >
              </div>
            </div>
            <div class="col-md-4 text-end">
              <button class="btn btn-sm btn-outline-primary" id="rules-refresh">
                <i class="bi bi-arrow-clockwise"></i> Atualizar
              </button>
            </div>
          </div>
          <div id="rules-save-status" class="mt-2"></div>
        </div>

        <!-- Tabela de regras -->
        <div class="flex-grow-1 overflow-auto">
          <table class="table table-sm table-hover">
            <thead class="table-light sticky-top">
              <tr>
                <th style="width: 50px;">#</th>
                <th style="width: 200px;">Status</th>
                <th>Campos Obrigatorios</th>
                <th style="width: 100px;" class="text-center">Acoes</th>
              </tr>
            </thead>
            <tbody id="rules-table-body"></tbody>
          </table>
        </div>

        <!-- Info footer -->
        <div class="mt-3 p-2 bg-light rounded-2">
          <small class="text-muted">
            <i class="bi bi-info-circle"></i>
            Configure quais campos sao obrigatorios para cada status.
            Ao mudar um contrato para o status, o sistema verificara se os campos estao preenchidos.
          </small>
        </div>
      </div>

      <!-- Modal de edicao de regra -->
      <div class="modal fade" id="edit-rule-inline-modal" tabindex="-1" aria-hidden="true"
           data-bs-backdrop="false" style="z-index: 1065;">
        <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                <i class="bi bi-check2-square"></i>
                Campos Obrigatorios: <span id="rule-modal-status-title"></span>
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
              <p class="text-muted mb-3">Selecione os campos que devem ser obrigatorios para este status:</p>
              <input type="hidden" id="rule-modal-status-name">
              <div id="rule-fields-selection" class="row g-2">
                <!-- Campos serao preenchidos dinamicamente -->
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-primary" id="rule-save-btn">
                <i class="bi bi-check-lg"></i> Salvar Regra
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renderiza tabela de status com regras
   */
  renderTable() {
    const tbody = document.getElementById('rules-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.statusList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-muted py-4">
            <i class="bi bi-inbox fs-3 d-block mb-2"></i>
            Nenhum status encontrado
          </td>
        </tr>
      `;
      return;
    }

    this.statusList.forEach((status, index) => {
      const rule = this.rulesMap.get(status.text);
      const requiredFields = rule?.requiredFields || [];
      const fieldsText = requiredFields.length > 0
        ? requiredFields.map(f => f.label || f.fieldId).join(', ')
        : '<span class="text-muted fst-italic">Nenhum campo obrigatorio</span>';

      // Filtro de busca
      const matchesSearch = !this.searchTerm ||
        status.text.toLowerCase().includes(this.searchTerm) ||
        (status.stage || '').toLowerCase().includes(this.searchTerm);

      const row = document.createElement('tr');
      row.dataset.statusText = status.text;
      row.style.display = matchesSearch ? '' : 'none';

      row.innerHTML = `
        <td class="text-center text-muted">${status.order || index + 1}</td>
        <td>
          <strong>${this.escapeHtml(status.text)}</strong>
          <br><small class="text-muted">${this.escapeHtml(status.stage || 'Outros')}</small>
        </td>
        <td>
          <div class="small">
            ${requiredFields.length > 0
              ? `<span class="badge bg-primary me-1">${requiredFields.length}</span> ${fieldsText}`
              : fieldsText}
          </div>
        </td>
        <td class="text-center">
          <button type="button" class="btn btn-sm btn-outline-primary edit-rule-btn"
                  data-status-text="${this.escapeHtml(status.text)}"
                  title="Editar regra">
            <i class="bi bi-pencil"></i>
          </button>
        </td>
      `;

      tbody.appendChild(row);
    });
  }

  /**
   * Configura event listeners
   */
  setupListeners() {
    // Busca
    const searchInput = document.getElementById('rules-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchTerm = e.target.value.toLowerCase().trim();
        this.filterTable();
      });
    }

    // Atualizar
    const refreshBtn = document.getElementById('rules-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }

    // Botoes de editar regra
    document.querySelectorAll('.edit-rule-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const statusText = e.currentTarget.dataset.statusText;
        this.openEditModal(statusText);
      });
    });

    // Salvar regra
    const saveBtn = document.getElementById('rule-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveRule());
    }
  }

  /**
   * Filtra tabela baseado no termo de busca
   */
  filterTable() {
    const tbody = document.getElementById('rules-table-body');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr[data-status-text]');
    rows.forEach(row => {
      const statusText = row.dataset.statusText?.toLowerCase() || '';
      const matches = !this.searchTerm || statusText.includes(this.searchTerm);
      row.style.display = matches ? '' : 'none';
    });
  }

  /**
   * Abre modal de edicao de regra
   * @param {string} statusText - Nome do status
   */
  openEditModal(statusText) {
    const modal = document.getElementById('edit-rule-inline-modal');
    const titleEl = document.getElementById('rule-modal-status-title');
    const statusInput = document.getElementById('rule-modal-status-name');
    const fieldsContainer = document.getElementById('rule-fields-selection');

    if (!modal || !fieldsContainer) return;

    // Preencher titulo e input hidden
    titleEl.textContent = statusText;
    statusInput.value = statusText;

    // Carregar regra existente
    const rule = this.rulesMap.get(statusText);
    const selectedFieldIds = new Set((rule?.requiredFields || []).map(f => f.fieldId));

    // Agrupar campos por categoria
    const fieldsByCategory = {};
    AVAILABLE_FIELDS.forEach(field => {
      if (!fieldsByCategory[field.category]) {
        fieldsByCategory[field.category] = [];
      }
      fieldsByCategory[field.category].push(field);
    });

    // Renderizar campos agrupados
    fieldsContainer.innerHTML = '';

    Object.entries(fieldsByCategory).forEach(([category, fields]) => {
      const categoryDiv = document.createElement('div');
      categoryDiv.className = 'col-12 mb-3';
      categoryDiv.innerHTML = `
        <h6 class="text-primary border-bottom pb-1 mb-2">
          <i class="bi bi-folder2"></i> ${category}
        </h6>
        <div class="row g-2">
          ${fields.map(field => `
            <div class="col-md-4 col-sm-6">
              <div class="form-check">
                <input class="form-check-input rule-field-checkbox"
                       type="checkbox"
                       id="field-${field.fieldId}"
                       data-field-id="${field.fieldId}"
                       data-field-label="${this.escapeHtml(field.label)}"
                       ${selectedFieldIds.has(field.fieldId) ? 'checked' : ''}>
                <label class="form-check-label small" for="field-${field.fieldId}">
                  ${this.escapeHtml(field.label)}
                </label>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      fieldsContainer.appendChild(categoryDiv);
    });

    // Abrir modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }

  /**
   * Salva regra de campos obrigatorios
   * @returns {Promise<void>}
   */
  async saveRule() {
    const statusName = document.getElementById('rule-modal-status-name').value;
    if (!statusName) return;
    const existingRule = this.rulesMap.get(statusName) || {};
    const existingVisibleFields = Array.isArray(existingRule.visibleFields)
      ? existingRule.visibleFields
      : undefined;

    // Coletar campos selecionados
    const checkboxes = document.querySelectorAll('.rule-field-checkbox:checked');
    const requiredFields = Array.from(checkboxes).map(cb => ({
      fieldId: cb.dataset.fieldId,
      label: cb.dataset.fieldLabel
    }));

    this.showStatus('Salvando regra...', 'info');

    try {
      // Salvar via firestoreService se disponivel
      if (window.firestoreService && typeof window.firestoreService.saveStatusRule === 'function') {
        await window.firestoreService.saveStatusRule(statusName, requiredFields, existingVisibleFields);
      } else if (typeof firebase !== 'undefined' && firebase.firestore) {
        // Fallback direto ao Firestore
        const db = firebase.firestore();
        const sanitizedId = statusName
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '_');

        await db.collection('statusRules').doc(sanitizedId).set({
          originalStatusName: statusName,
          requiredFields,
          ...(Array.isArray(existingVisibleFields) ? { visibleFields: existingVisibleFields } : {}),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: firebase.auth().currentUser?.email || 'system'
        }, { merge: true });
      }

      // Atualizar cache local
      this.rulesMap.set(statusName, {
        ...existingRule,
        originalStatusName: statusName,
        requiredFields,
        ...(Array.isArray(existingVisibleFields) ? { visibleFields: existingVisibleFields } : {})
      });

      // Fechar modal
      const modal = document.getElementById('edit-rule-inline-modal');
      const bsModal = bootstrap.Modal.getInstance(modal);
      if (bsModal) bsModal.hide();

      // Atualizar tabela
      this.renderTable();
      this.setupListeners();

      // Disparar evento
      document.dispatchEvent(new CustomEvent('status-workflow-updated', {
        detail: {
          type: 'rules',
          action: 'rule-saved',
          statusName,
          fieldsCount: requiredFields.length
        }
      }));

      // Invalidar cache
      if (window.cacheService && typeof window.cacheService.invalidateCacheKey === 'function') {
        window.cacheService.invalidateCacheKey('status_rules_all');
        window.cacheService.invalidateCacheKey('statusRules');
      }

      this.showStatus(`Regra salva com sucesso! ${requiredFields.length} campos obrigatorios.`, 'success');
      setTimeout(() => this.clearStatus(), 3000);

    } catch (error) {
      console.error('[Rules Tab] Erro ao salvar regra:', error);
      this.showStatus('Erro ao salvar: ' + error.message, 'danger');
    }
  }

  /**
   * Atualiza a tab
   * @returns {Promise<void>}
   */
  async refresh() {
    await this.loadData();
    this.renderTable();
    this.setupListeners();

    if (window.uiHelpers?.showToast) {
      window.uiHelpers.showToast('Regras atualizadas', 'success');
    }
  }

  /**
   * Exibe mensagem de status
   * @param {string} message
   * @param {string} type - 'info', 'success', 'warning', 'danger'
   */
  showStatus(message, type = 'info') {
    const statusEl = document.getElementById('rules-save-status');
    if (statusEl) {
      const icons = {
        info: 'info-circle',
        success: 'check-circle',
        warning: 'exclamation-triangle',
        danger: 'x-circle'
      };
      statusEl.innerHTML = `<span class="text-${type}"><i class="bi bi-${icons[type] || 'info-circle'}"></i> ${message}</span>`;
    }
  }

  /**
   * Limpa mensagem de status
   */
  clearStatus() {
    const statusEl = document.getElementById('rules-save-status');
    if (statusEl) {
      statusEl.innerHTML = '';
    }
  }

  /**
   * Escapa HTML para prevenir XSS
   * @param {string} text
   * @returns {string}
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
