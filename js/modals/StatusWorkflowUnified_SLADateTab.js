/**
 * @fileoverview Tab SLA por Data - Gerenciador de Status e Workflows
 * Gerencia configuracao de alertas para campos de data especificos
 *
 * @version 1.0.1
 * @date 2026-01-21
 */

/**
 * Lista de campos de data disponiveis para configuracao de SLA
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
 * Gerenciador da tab "SLA por Data" no modal unificado
 * @class
 */
export class SLADateTabManager {
  constructor() {
    this.containerId = 'unified-sla-date-container';
    this.loaded = false;
    this.dateConfig = {};
    this.isLoading = false;
  }

  async render() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error('Container da tab SLA Date nao encontrado');
      return;
    }

    if (container.dataset.loaded === 'true') {
      return;
    }

    try {
      await this.loadData();
      this.renderHTML(container);
      this.setupListeners();
      container.dataset.loaded = 'true';
      this.loaded = true;
    } catch (error) {
      console.error('Erro ao renderizar tab SLA Date:', error);
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle"></i>
          <strong>Erro ao carregar configuracoes de SLA por Data</strong>
          <p class="mb-0">${error.message}</p>
        </div>
      `;
    }
  }

  async loadData() {
    try {
      const db = firebase.firestore();
      const snapshot = await db.collection('slaDateConfig').get();

      this.dateConfig = {};
      snapshot.forEach(doc => {
        this.dateConfig[doc.id] = doc.data();
      });

      // Se nao houver configuracoes, usar valores padrao
      if (Object.keys(this.dateConfig).length === 0) {
        AVAILABLE_DATE_FIELDS.forEach(field => {
          if (field.defaultEnabled) {
            this.dateConfig[field.fieldName] = {
              fieldName: field.fieldName,
              label: field.label,
              warningDays: field.defaultWarningDays,
              enabled: true
            };
          }
        });
      }
    } catch (error) {
      console.warn('Erro ao carregar config SLA Date, usando valores padrao:', error);
      this.dateConfig = {};
    }
  }

  renderHTML(container) {
    const html = `
      <div class="d-flex flex-column h-100">
        <!-- Header com busca e acoes -->
        <div class="border-bottom p-3 bg-light">
          <div class="row align-items-center g-3">
            <div class="col-md-6">
              <div class="input-group">
                <span class="input-group-text">
                  <i class="bi bi-search"></i>
                </span>
                <input type="text" class="form-control" id="unified-sla-date-search"
                       placeholder="Buscar campo...">
              </div>
            </div>
            <div class="col-md-6 text-end">
              <button type="button" class="btn btn-sm btn-outline-secondary" id="unified-sla-date-reset">
                <i class="bi bi-arrow-counterclockwise"></i> Restaurar Padrao
              </button>
              <button type="button" class="btn btn-sm btn-success" id="unified-sla-date-save">
                <i class="bi bi-save"></i> Salvar Todas
              </button>
            </div>
          </div>
          <div id="unified-sla-date-status" class="mt-2 text-center"></div>
        </div>

        <!-- Tabela de configuracoes -->
        <div class="flex-grow-1 overflow-auto p-3">
          <div class="table-responsive">
            <table class="table table-hover table-sm align-middle" id="unified-sla-date-table">
              <thead class="table-light sticky-top">
                <tr>
                  <th style="width: 50px;" class="text-center">#</th>
                  <th>Campo de Data</th>
                  <th style="width: 250px;">Alerta com Antecedencia</th>
                  <th style="width: 100px;" class="text-center">Ativo</th>
                </tr>
              </thead>
              <tbody id="unified-sla-date-table-body">
                <!-- Preenchido dinamicamente -->
              </tbody>
            </table>
          </div>
        </div>

        <!-- Footer com informacoes -->
        <div class="border-top p-2 bg-light text-muted small">
          <div class="d-flex justify-content-between">
            <span>
              <i class="bi bi-info-circle"></i>
              Configure quantos dias antes do vencimento o sistema deve gerar alertas para cada campo de data.
              Somente campos marcados como "Ativo" serao monitorados.
            </span>
            <span id="unified-sla-date-count">0 campos</span>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
    this.renderTable();
  }

  renderTable() {
    const tbody = document.getElementById('unified-sla-date-table-body');
    if (!tbody) return;

    if (AVAILABLE_DATE_FIELDS.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-muted py-4">
            <i class="bi bi-inbox fs-3 d-block mb-2"></i>
            Nenhum campo de data disponivel
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = AVAILABLE_DATE_FIELDS.map((field, index) => {
      const config = this.dateConfig[field.fieldName] || {};
      const isEnabled = config.enabled === true;
      const warningDays = config.warningDays || field.defaultWarningDays;

      return `
        <tr data-field-name="${field.fieldName}" data-field-label="${field.label.toLowerCase()}">
          <td class="text-center text-muted">${index + 1}</td>
          <td>
            <strong>${this.escapeHtml(field.label)}</strong>
            <br><small class="text-muted">${this.escapeHtml(field.fieldName)}</small>
          </td>
          <td>
            <div class="input-group input-group-sm">
              <input
                type="number"
                class="form-control sla-date-input"
                data-field-name="${field.fieldName}"
                value="${warningDays}"
                placeholder="Ex: 5"
                min="1"
                max="90"
                ${!isEnabled ? 'disabled' : ''}
              >
              <span class="input-group-text">
                <i class="bi bi-calendar-check"></i> dias
              </span>
            </div>
            <small class="text-muted sla-date-preview">
              ${isEnabled ? `Avisar ${warningDays} dias antes` : 'Desabilitado'}
            </small>
          </td>
          <td class="text-center">
            <div class="form-check form-switch d-flex justify-content-center">
              <input
                class="form-check-input sla-date-toggle"
                type="checkbox"
                data-field-name="${field.fieldName}"
                ${isEnabled ? 'checked' : ''}
              >
            </div>
          </td>
        </tr>
      `;
    }).join('');

    this.updateCounters();
    this.setupTableInteractions();
  }

  setupListeners() {
    // Busca
    const searchInput = document.getElementById('unified-sla-date-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.filterTable(e.target.value));
    }

    // Salvar
    const saveBtn = document.getElementById('unified-sla-date-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveAll());
    }

    // Restaurar padrao
    const resetBtn = document.getElementById('unified-sla-date-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetToDefaults());
    }
  }

  setupTableInteractions() {
    // Inputs de warning days
    document.querySelectorAll('.sla-date-input').forEach(input => {
      input.addEventListener('change', (e) => this.handleWarningChange(e));
    });

    // Toggles de enabled
    document.querySelectorAll('.sla-date-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => this.handleToggleChange(e));
    });
  }

  handleWarningChange(e) {
    const fieldName = e.target.dataset.fieldName;
    if (!fieldName) return;

    const field = AVAILABLE_DATE_FIELDS.find(f => f.fieldName === fieldName);
    if (!field) return;

    // Inicializar config se nao existir
    if (!this.dateConfig[fieldName]) {
      this.dateConfig[fieldName] = {
        fieldName: fieldName,
        label: field.label,
        warningDays: field.defaultWarningDays,
        enabled: false
      };
    }

    const value = parseInt(e.target.value, 10);
    if (value > 0 && value <= 90) {
      this.dateConfig[fieldName].warningDays = value;

      // Atualizar preview
      const row = e.target.closest('tr');
      const preview = row?.querySelector('.sla-date-preview');
      if (preview && this.dateConfig[fieldName].enabled) {
        preview.textContent = `Avisar ${value} dias antes`;
      }

      this.showStatus('Alteracoes pendentes - clique em "Salvar Todas" para confirmar', 'warning');
    }
  }

  handleToggleChange(e) {
    const fieldName = e.target.dataset.fieldName;
    if (!fieldName) return;

    const field = AVAILABLE_DATE_FIELDS.find(f => f.fieldName === fieldName);
    if (!field) return;

    // Inicializar config se nao existir
    if (!this.dateConfig[fieldName]) {
      this.dateConfig[fieldName] = {
        fieldName: fieldName,
        label: field.label,
        warningDays: field.defaultWarningDays,
        enabled: false
      };
    }

    const isEnabled = e.target.checked;
    this.dateConfig[fieldName].enabled = isEnabled;

    // Habilitar/desabilitar input de warning days
    const row = e.target.closest('tr');
    if (row) {
      const warningInput = row.querySelector('.sla-date-input');
      const preview = row.querySelector('.sla-date-preview');

      if (warningInput) {
        warningInput.disabled = !isEnabled;
      }
      if (preview) {
        const days = this.dateConfig[fieldName].warningDays || field.defaultWarningDays;
        preview.textContent = isEnabled ? `Avisar ${days} dias antes` : 'Desabilitado';
      }
    }

    this.updateCounters();
    this.showStatus('Alteracoes pendentes - clique em "Salvar Todas" para confirmar', 'warning');
  }

  filterTable(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    const rows = document.querySelectorAll('#unified-sla-date-table-body tr[data-field-name]');

    rows.forEach(row => {
      const fieldName = row.dataset.fieldName?.toLowerCase() || '';
      const fieldLabel = row.dataset.fieldLabel || '';

      if (fieldName.includes(term) || fieldLabel.includes(term)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  }

  async saveAll() {
    if (this.isLoading) return;

    this.isLoading = true;
    this.showStatus('Salvando configuracoes...', 'info');

    try {
      const db = firebase.firestore();
      const batch = db.batch();
      const user = firebase.auth().currentUser;
      let savedCount = 0;

      // Salvar todas as configuracoes
      AVAILABLE_DATE_FIELDS.forEach(field => {
        const config = this.dateConfig[field.fieldName] || {};
        const docRef = db.collection('slaDateConfig').doc(field.fieldName);

        batch.set(docRef, {
          fieldName: field.fieldName,
          label: field.label,
          warningDays: config.warningDays || field.defaultWarningDays,
          enabled: config.enabled || false,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: user?.email || 'sistema'
        }, { merge: true });

        savedCount++;
      });

      await batch.commit();

      this.showStatus(`${savedCount} configuracoes salvas com sucesso!`, 'success');

      // Disparar evento para sincronizacao
      document.dispatchEvent(new CustomEvent('status-workflow-updated', {
        detail: { type: 'sla-date', action: 'bulk-update', count: savedCount }
      }));

      document.dispatchEvent(new CustomEvent('sla-date-config-updated', {
        detail: {
          count: savedCount,
          enabledFields: Object.values(this.dateConfig).filter(c => c.enabled).length
        }
      }));

      setTimeout(() => this.clearStatus(), 3000);

    } catch (error) {
      console.error('Erro ao salvar:', error);
      this.showStatus(`Erro ao salvar: ${error.message}`, 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  resetToDefaults() {
    if (!confirm('Restaurar configuracoes padrao? Apenas "Vencimento SICAQ" sera habilitado.')) {
      return;
    }

    this.dateConfig = {};
    AVAILABLE_DATE_FIELDS.forEach(field => {
      this.dateConfig[field.fieldName] = {
        fieldName: field.fieldName,
        label: field.label,
        warningDays: field.defaultWarningDays,
        enabled: field.defaultEnabled
      };
    });

    this.renderTable();
    this.setupTableInteractions();
    this.showStatus('Configuracoes restauradas - clique em "Salvar Todas" para confirmar', 'warning');
  }

  async refresh() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.dataset.loaded = 'false';
    this.loaded = false;
    await this.render();
  }

  updateCounters() {
    const countEl = document.getElementById('unified-sla-date-count');
    if (countEl) {
      const enabledCount = Object.values(this.dateConfig).filter(c => c.enabled).length;
      countEl.textContent = `${AVAILABLE_DATE_FIELDS.length} campos (${enabledCount} ativos)`;
    }
  }

  showStatus(message, type = 'info') {
    const statusEl = document.getElementById('unified-sla-date-status');
    if (!statusEl) return;

    const colorClass = {
      'info': 'text-info',
      'success': 'text-success',
      'warning': 'text-warning',
      'danger': 'text-danger'
    }[type] || 'text-muted';

    statusEl.innerHTML = `<strong class="${colorClass}"><i class="bi bi-info-circle"></i> ${message}</strong>`;
  }

  clearStatus() {
    const statusEl = document.getElementById('unified-sla-date-status');
    if (statusEl) {
      statusEl.innerHTML = '';
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
