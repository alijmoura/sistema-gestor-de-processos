/**
 * @fileoverview Tab Status do Sistema - Gerenciador de Status e Workflows
 * Migração e adaptação de statusTableConfigSimple.js para o modal unificado
 * 
 * @version 1.0.0
 * @date 2026-01-20
 */

import { DetailsModal } from './DetailsModal.js';

export class StatusTabManager {
  constructor() {
    this.containerId = 'unified-status-container';
    this.loaded = false;
    this.statusData = [];
    this.rulesMap = new Map();
    this.detailsFieldDefinitions = null;
    this.editingRow = null;
    this.originalData = {};
  }

  async render() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error('❌ Container da tab Status não encontrado');
      return;
    }

    if (container.dataset.loaded === 'true') {
      console.log('ℹ️ Tab Status já renderizada');
      return;
    }

    try {
      await this.loadStatusData();
      await this.loadStatusRules();
      this.renderHTML(container);
      this.setupListeners();
      container.dataset.loaded = 'true';
      this.loaded = true;
      console.log('✅ Tab Status renderizada com sucesso');
    } catch (error) {
      console.error('❌ Erro ao renderizar tab Status:', error);
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle"></i>
          <strong>Erro ao carregar configurações de status</strong>
          <p class="mb-0">${error.message}</p>
        </div>
      `;
    }
  }

  async loadStatusData() {
    // Aguardar Firestore estar pronto
    await this.waitForFirestore();

    // Opção 1: Carregar do cache global
    if (window.EFFECTIVE_STATUS_CONFIG && Array.isArray(window.EFFECTIVE_STATUS_CONFIG) && window.EFFECTIVE_STATUS_CONFIG.length > 0) {
      this.statusData = [...window.EFFECTIVE_STATUS_CONFIG];
      console.log(`📊 ${this.statusData.length} status carregados do cache global`);
      return;
    }

    // Opção 2: Carregar via firestoreService.getEffectiveStatuses
    if (window.firestoreService && typeof window.firestoreService.getEffectiveStatuses === 'function') {
      try {
        this.statusData = await window.firestoreService.getEffectiveStatuses();
        console.log(`📊 ${this.statusData.length} status carregados via getEffectiveStatuses`);
        return;
      } catch (error) {
        console.warn('⚠️ Erro ao carregar via getEffectiveStatuses:', error);
      }
    }

    // Opção 3: Carregar diretamente do Firestore
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      try {
        const db = firebase.firestore();
        const snapshot = await db.collection('statusConfig').orderBy('order').get();
        this.statusData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        console.log(`📊 ${this.statusData.length} status carregados diretamente do Firestore`);
        
        // Atualizar cache global
        if (this.statusData.length > 0) {
          window.EFFECTIVE_STATUS_CONFIG = this.statusData;
        }
        return;
      } catch (error) {
        console.error('❌ Erro ao carregar do Firestore:', error);
        throw new Error(`Erro ao carregar status: ${error.message}`);
      }
    }

    throw new Error('Firestore não está disponível. Aguarde a inicialização do sistema.');
  }

  async loadStatusRules() {
    try {
      let rules = [];

      if (window.firestoreService && typeof window.firestoreService.getAllStatusRules === 'function') {
        rules = await window.firestoreService.getAllStatusRules();
      } else if (typeof firebase !== 'undefined' && firebase.firestore) {
        const db = firebase.firestore();
        const snapshot = await db.collection('statusRules').get();
        rules = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }

      this.rulesMap.clear();
      rules.forEach((rule) => {
        const key = rule.originalStatusName || rule.id;
        if (key) {
          this.rulesMap.set(key, rule);
        }
      });
    } catch (error) {
      console.error('❌ Erro ao carregar regras de status:', error);
      this.rulesMap.clear();
    }
  }

  async waitForFirestore(maxAttempts = 20, interval = 250) {
    for (let i = 0; i < maxAttempts; i++) {
      if (typeof firebase !== 'undefined' && firebase.firestore) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    console.warn('⚠️ Timeout aguardando Firestore, continuando mesmo assim...');
  }

  renderHTML(container) {
    const html = `
      <div class="d-flex flex-column h-100">
        <!-- Header com busca e ações -->
        <div class="border-bottom p-3 bg-light">
          <div class="row align-items-center g-3">
            <div class="col-md-6">
              <div class="input-group">
                <span class="input-group-text">
                  <i class="bi bi-search"></i>
                </span>
                <input type="text" class="form-control" id="unified-status-search" 
                       placeholder="Buscar status por nome ou etapa...">
              </div>
            </div>
            <div class="col-md-6 text-end">
              <button type="button" class="btn btn-sm btn-outline-primary" id="unified-status-refresh">
                <i class="bi bi-arrow-clockwise"></i> Atualizar
              </button>
              <button type="button" class="btn btn-sm btn-primary" id="unified-status-add-new">
                <i class="bi bi-plus-lg"></i> Novo Status
              </button>
            </div>
          </div>
        </div>

        <!-- Tabela de status -->
        <div class="flex-grow-1 overflow-auto p-3">
          <table class="table table-hover table-sm align-middle" id="unified-status-table" style="table-layout: fixed; width: 100%;">
            <thead class="table-light sticky-top">
              <tr>
                <th style="width: 5%;" class="text-center px-1">
                  <i class="bi bi-grip-vertical text-muted" title="Arraste para reordenar"></i>
                </th>
                <th style="width: 22%;">Nome</th>
                <th style="width: 12%;">Etapa</th>
                <th style="width: 8%;" class="text-center px-1">Ordem</th>
                <th style="width: 7%;" class="text-center px-1">Cor</th>
                <th style="width: 24%;">Proximos</th>
                <th style="width: 8%;" class="text-center px-1">Ativo</th>
                <th style="width: 14%;" class="text-center px-1">Acoes</th>
              </tr>
            </thead>
            <tbody id="unified-status-table-body">
              <!-- Preenchido dinamicamente -->
            </tbody>
          </table>
        </div>

        <!-- Footer com contadores -->
        <div class="border-top p-2 bg-light text-muted small">
          <span id="unified-status-count">0 status</span> | 
          <span id="unified-status-active-count">0 ativos</span>
        </div>
      </div>

      <!-- Modal Inline para Adicionar/Editar Status (sem backdrop, fica sobre o modal pai) -->
      <div class="modal fade" id="unified-status-edit-modal" tabindex="-1" aria-hidden="true" data-nested-modal="true">
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
          <div class="modal-content" style="max-height: 85vh;">
            <div class="modal-header py-2">
              <h6 class="modal-title" id="unified-status-edit-modal-title">
                <i class="bi bi-plus-circle"></i> Novo Status
              </h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body py-2">
              <form id="unified-status-edit-form">
                <input type="hidden" id="edit-status-id">

                <div class="row mb-2">
                  <div class="col-12">
                    <label for="edit-status-name" class="form-label small mb-1">Nome do Status <span class="text-danger">*</span></label>
                    <input type="text" class="form-control form-control-sm" id="edit-status-name" required>
                  </div>
                </div>

                <div class="row mb-2">
                  <div class="col-6">
                    <label for="edit-status-stage" class="form-label small mb-1">Etapa <span class="text-danger">*</span></label>
                    <input type="text" class="form-control form-control-sm" id="edit-status-stage" required>
                  </div>
                  <div class="col-6">
                    <label for="edit-status-order" class="form-label small mb-1">Ordem</label>
                    <input type="number" class="form-control form-control-sm" id="edit-status-order" min="0">
                  </div>
                </div>

                <div class="row mb-2">
                  <div class="col-6">
                    <label for="edit-status-bgcolor" class="form-label small mb-1">Cor de Fundo</label>
                    <input type="color" class="form-control form-control-color form-control-sm" id="edit-status-bgcolor" value="#0D6EFD" style="height: 31px;">
                  </div>
                  <div class="col-6">
                    <label for="edit-status-color" class="form-label small mb-1">Cor do Texto</label>
                    <input type="color" class="form-control form-control-color form-control-sm" id="edit-status-color" value="#FFFFFF" style="height: 31px;">
                  </div>
                </div>

                <div class="mb-2">
                  <label class="form-label small mb-1">Proximos Status Permitidos</label>
                  <div id="edit-status-nextsteps-container" class="border rounded p-2" style="max-height: 150px; overflow-y: auto;">
                    <!-- Preenchido dinamicamente com checkboxes -->
                  </div>
                  <div class="form-text small">Selecione os status permitidos como proximos passos</div>
                </div>

                <div class="row">
                  <div class="col-6">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" id="edit-status-active" checked>
                      <label class="form-check-label small" for="edit-status-active">Status ativo</label>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="form-check">
                      <input class="form-check-input" type="checkbox" id="edit-status-archive">
                      <label class="form-check-label small" for="edit-status-archive">Arquivar contratos</label>
                    </div>
                  </div>
                </div>
              </form>
            </div>
            <div class="modal-footer py-2">
              <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-primary btn-sm" id="unified-status-save-btn">
                <i class="bi bi-check-lg"></i> Salvar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="modal fade" id="unified-status-visibility-modal" tabindex="-1" aria-hidden="true" data-nested-modal="true">
        <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <div class="modal-content" style="max-height: 85vh;">
            <div class="modal-header py-2">
              <h6 class="modal-title">
                <i class="bi bi-eye"></i> Exibição de Campos nos modal de Detalhes do Processo
              </h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body py-2">
              <input type="hidden" id="visibility-status-name">
              <div class="mb-3">
                <div class="fw-semibold" id="visibility-status-title">Status</div>
                <div class="text-muted small">Selecione os campos exibidos nas abas Formulários e Registro do modal de Detalhes do Processo.</div>
              </div>
              <div class="input-group input-group-sm mb-3">
                <span class="input-group-text"><i class="bi bi-search"></i></span>
                <input type="text" class="form-control" id="visibility-fields-search" placeholder="Buscar campos...">
                <button type="button" class="btn btn-outline-secondary" id="visibility-fields-clear">
                  <i class="bi bi-x-circle"></i>
                </button>
              </div>
              <div id="visibility-fields-summary" class="small text-muted mb-2"></div>
              <div id="visibility-fields-selection" class="row g-3">
                <div class="col-12 text-muted small">Carregando campos...</div>
              </div>
            </div>
            <div class="modal-footer py-2">
              <button type="button" class="btn btn-outline-secondary btn-sm" id="visibility-select-all-btn">Selecionar todos</button>
              <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-primary btn-sm" id="unified-status-visibility-save-btn">
                <i class="bi bi-check-lg"></i> Salvar Exibição
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
    this.renderTable();
  }

  renderTable() {
    const tbody = document.getElementById('unified-status-table-body');
    if (!tbody) return;

    if (this.statusData.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted py-4">
            <i class="bi bi-inbox fs-3 d-block mb-2"></i>
            Nenhum status configurado
          </td>
        </tr>
      `;
      this.updateCounters();
      return;
    }

    // Ordenar por order
    const sortedData = [...this.statusData].sort((a, b) => {
      const orderA = Number(a.order) || 0;
      const orderB = Number(b.order) || 0;
      return orderA - orderB;
    });

    tbody.innerHTML = sortedData.map((status, index) => {
      const statusId = status.id || status.text || `status-${index}`;
      const bgColor = status.bgColor || '#0D6EFD';
      const color = status.color || '#FFFFFF';
      const statusRule = this.rulesMap.get(status.text);
      const visibleFieldsCount = Array.isArray(statusRule?.visibleFields) ? statusRule.visibleFields.length : 0;
      const nextStepsStr = Array.isArray(status.nextSteps) 
        ? status.nextSteps.join(', ') 
        : (status.nextSteps || '');
      const isActive = status.active !== false;
      const isArchive = status.archiveContracts === true;

      return `
        <tr data-status-id="${this.escapeHtml(statusId)}"
            data-status-text="${this.escapeHtml(status.text)}"
            draggable="true">
          <td class="text-center drag-handle px-1" title="Arraste para reordenar">
            <i class="bi bi-grip-vertical text-muted"></i>
          </td>
          <td class="text-truncate" style="max-width: 0;" title="${this.escapeHtml(status.text)}">
            <span class="fw-medium">${this.escapeHtml(status.text)}</span>
            ${isArchive ? ' <i class="bi bi-archive text-warning" title="Arquiva contratos"></i>' : ''}
            ${visibleFieldsCount > 0
              ? `<div class="small text-muted mt-1"><i class="bi bi-eye me-1"></i>${visibleFieldsCount} campos visíveis no Details</div>`
              : ''}
          </td>
          <td class="text-truncate px-1" style="max-width: 0;">
            <span class="badge bg-secondary text-truncate" style="max-width: 100%;">${this.escapeHtml(status.stage || '-')}</span>
          </td>
          <td class="text-center px-1">
            <small>${status.order || 0}</small>
          </td>
          <td class="text-center px-1">
            <span class="badge" style="background-color: ${bgColor}; color: ${color};">Aa</span>
          </td>
          <td class="text-truncate" style="max-width: 0;" title="${this.escapeHtml(nextStepsStr || 'Nenhum')}">
            <small class="text-muted">${this.escapeHtml(nextStepsStr || 'Nenhum')}</small>
          </td>
          <td class="text-center px-1">
            <div class="form-check form-switch d-inline-block m-0">
              <input class="form-check-input status-active-toggle" type="checkbox"
                     ${isActive ? 'checked' : ''}
                     data-status-id="${this.escapeHtml(statusId)}">
            </div>
          </td>
          <td class="text-center px-1">
            <div class="btn-group btn-group-sm" role="group">
              <button type="button" class="btn btn-outline-primary btn-sm status-edit-btn py-0 px-1"
                      data-status-id="${this.escapeHtml(statusId)}" title="Editar">
                <i class="bi bi-pencil"></i>
              </button>
              <button type="button" class="btn btn-outline-secondary btn-sm dropdown-toggle dropdown-toggle-split py-0 px-1"
                      data-bs-toggle="dropdown" aria-expanded="false">
                <span class="visually-hidden">Menu</span>
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li>
                  <a class="dropdown-item status-visibility-btn" href="#"
                     data-status-id="${this.escapeHtml(statusId)}"
                     data-status-text="${this.escapeHtml(status.text)}">
                    <i class="bi bi-eye"></i> Configurar exibição no modal de Detalhes do Processo
                  </a>
                </li>
                <li><hr class="dropdown-divider"></li>
                <li>
                  <a class="dropdown-item status-goto-sla-btn" href="#"
                     data-status-id="${this.escapeHtml(statusId)}"
                     data-status-text="${this.escapeHtml(status.text)}">
                    <i class="bi bi-clock-history"></i> Configurar SLA
                  </a>
                </li>
                <li><hr class="dropdown-divider"></li>
                <li>
                  <a class="dropdown-item text-danger status-delete-btn" href="#"
                     data-status-id="${this.escapeHtml(statusId)}">
                    <i class="bi bi-trash"></i> Excluir
                  </a>
                </li>
              </ul>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    this.updateCounters();
    this.setupTableInteractions();
  }

  updateCounters() {
    const countEl = document.getElementById('unified-status-count');
    const activeCountEl = document.getElementById('unified-status-active-count');
    
    if (countEl) {
      countEl.textContent = `${this.statusData.length} status`;
    }
    
    if (activeCountEl) {
      const activeCount = this.statusData.filter(s => s.active !== false).length;
      activeCountEl.textContent = `${activeCount} ativos`;
    }
  }

  setupListeners() {
    // Busca
    const searchInput = document.getElementById('unified-status-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
    }

    // Atualizar
    const refreshBtn = document.getElementById('unified-status-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }

    // Novo status
    const addBtn = document.getElementById('unified-status-add-new');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.showAddModal());
    }
  }

  setupTableInteractions() {
    const tbody = document.getElementById('unified-status-table-body');
    if (!tbody) return;

    // Toggle ativo/inativo
    tbody.querySelectorAll('.status-active-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const statusId = e.target.dataset.statusId;
        this.toggleStatusActive(statusId, e.target.checked);
      });
    });

    // Editar
    tbody.querySelectorAll('.status-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const statusId = e.currentTarget.dataset.statusId;
        this.editStatus(statusId);
      });
    });

    tbody.querySelectorAll('.status-visibility-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const statusId = e.currentTarget.dataset.statusId;
        this.openVisibilityModal(statusId);
      });
    });

    // Excluir
    tbody.querySelectorAll('.status-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const statusId = e.currentTarget.dataset.statusId;
        this.deleteStatus(statusId);
      });
    });

    // Navegar para SLA
    tbody.querySelectorAll('.status-goto-sla-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const statusText = e.currentTarget.dataset.statusText;
        this.navigateToSLATab(statusText);
      });
    });

    // Drag and drop (implementação simplificada)
    this.setupDragAndDrop(tbody);
  }

  setupDragAndDrop(tbody) {
    let draggedRow = null;

    tbody.querySelectorAll('tr[draggable="true"]').forEach(row => {
      row.addEventListener('dragstart', (e) => {
        draggedRow = e.currentTarget;
        e.currentTarget.style.opacity = '0.5';
      });

      row.addEventListener('dragend', (e) => {
        e.currentTarget.style.opacity = '';
        draggedRow = null;
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggedRow && draggedRow !== e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          if (e.clientY < midpoint) {
            e.currentTarget.parentNode.insertBefore(draggedRow, e.currentTarget);
          } else {
            e.currentTarget.parentNode.insertBefore(draggedRow, e.currentTarget.nextSibling);
          }
        }
      });
    });
  }

  handleSearch(query) {
    const tbody = document.getElementById('unified-status-table-body');
    if (!tbody) return;

    const searchTerm = query.toLowerCase().trim();
    const rows = tbody.querySelectorAll('tr[data-status-id]');

    rows.forEach(row => {
      const statusText = row.dataset.statusText?.toLowerCase() || '';
      const stage = row.querySelector('td:nth-child(3)')?.textContent?.toLowerCase() || '';
      
      if (statusText.includes(searchTerm) || stage.includes(searchTerm)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  }

  async refresh() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.dataset.loaded = 'false';
    this.loaded = false;
    this.detailsFieldDefinitions = null;
    await this.render();
    
    if (window.uiHelpers?.showToast) {
      window.uiHelpers.showToast('Configurações de status atualizadas', 'success');
    }
  }

  showAddModal() {
    this.openEditModal();
  }

  editStatus(statusId) {
    console.log('🔵 Editar status:', statusId);
    const status = this.statusData.find(s => (s.id || s.text) === statusId);
    if (!status) return;
    this.openEditModal(status);
  }

  async ensureDetailsFieldDefinitions() {
    if (Array.isArray(this.detailsFieldDefinitions) && this.detailsFieldDefinitions.length > 0) {
      return this.detailsFieldDefinitions;
    }

    DetailsModal.render();

    const sections = [
      { tabId: 'tab-formularios', category: 'Formulários' },
      { tabId: 'tab-registro', category: 'Registro' }
    ];
    const fields = [];
    const seen = new Set();

    sections.forEach(({ tabId, category }) => {
      const container = document.getElementById(tabId);
      if (!container) return;

      container.querySelectorAll('input, select, textarea').forEach((el) => {
        if (!el.id || !el.id.startsWith('modal-') || seen.has(el.id)) {
          return;
        }

        const fieldType = String(el.getAttribute('type') || '').toLowerCase();
        if (fieldType === 'hidden') {
          return;
        }

        seen.add(el.id);
        fields.push({
          fieldId: el.id,
          label: this.resolveDetailsFieldLabel(container, el),
          category
        });
      });
    });

    this.detailsFieldDefinitions = fields;
    return this.detailsFieldDefinitions;
  }

  resolveDetailsFieldLabel(container, fieldEl) {
    const explicitLabel = container.querySelector(`label[for="${fieldEl.id}"]`);
    if (explicitLabel?.textContent?.trim()) {
      return explicitLabel.textContent.trim().replace(/\s+/g, ' ');
    }

    const wrapper = fieldEl.closest('.form-group, .form-floating, .inline-suggest-wrapper, .readonly-group');
    const nestedLabel = wrapper?.querySelector('label');
    if (nestedLabel?.textContent?.trim()) {
      return nestedLabel.textContent.trim().replace(/\s+/g, ' ');
    }

    const placeholder = fieldEl.getAttribute('placeholder');
    if (placeholder?.trim()) {
      return placeholder.trim();
    }

    return fieldEl.id.replace(/^modal-/, '');
  }

  async openVisibilityModal(statusId) {
    const status = this.statusData.find((item) => (item.id || item.text) === statusId);
    if (!status) return;

    const modal = document.getElementById('unified-status-visibility-modal');
    const statusNameInput = document.getElementById('visibility-status-name');
    const statusTitle = document.getElementById('visibility-status-title');
    const summary = document.getElementById('visibility-fields-summary');
    const fieldsContainer = document.getElementById('visibility-fields-selection');
    const searchInput = document.getElementById('visibility-fields-search');
    const clearBtn = document.getElementById('visibility-fields-clear');
    const selectAllBtn = document.getElementById('visibility-select-all-btn');
    const saveBtn = document.getElementById('unified-status-visibility-save-btn');

    if (!modal || !statusNameInput || !statusTitle || !summary || !fieldsContainer || !searchInput || !clearBtn || !selectAllBtn || !saveBtn) {
      return;
    }

    statusNameInput.value = status.text;
    statusTitle.textContent = status.text;
    fieldsContainer.innerHTML = '<div class="col-12 text-muted small">Carregando campos...</div>';

    let fieldDefinitions = [];
    try {
      fieldDefinitions = await this.ensureDetailsFieldDefinitions();
    } catch (error) {
      console.error('❌ Erro ao preparar campos do details-modal:', error);
      fieldsContainer.innerHTML = `<div class="col-12"><div class="alert alert-danger mb-0 small">${this.escapeHtml(error.message)}</div></div>`;
      return;
    }

    if (!fieldDefinitions.length) {
      fieldsContainer.innerHTML = '<div class="col-12"><div class="alert alert-warning mb-0 small">Nenhum campo elegível foi encontrado nas abas Formulários e Registro.</div></div>';
      return;
    }

    const currentRule = this.rulesMap.get(status.text) || {};
    const selectedVisibleFields = new Set(
      (Array.isArray(currentRule.visibleFields) ? currentRule.visibleFields : [])
        .map((field) => (typeof field === 'string' ? field : field.fieldId))
        .filter(Boolean)
    );

    const fieldsByCategory = fieldDefinitions.reduce((accumulator, field) => {
      if (!accumulator[field.category]) {
        accumulator[field.category] = [];
      }
      accumulator[field.category].push(field);
      return accumulator;
    }, {});

    const categories = Object.keys(fieldsByCategory);
    fieldsContainer.innerHTML = categories.map((category) => `
      <div class="col-12">
        <div class="border rounded p-3">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <h6 class="text-primary mb-0">${this.escapeHtml(category)}</h6>
            <span class="badge bg-light text-dark border">${fieldsByCategory[category].length} campos</span>
          </div>
          <div class="row g-2">
            ${fieldsByCategory[category].map((field) => `
              <div class="col-md-6">
                <div class="form-check visibility-field-item" data-label="${this.escapeHtml((field.label || '').toLowerCase())}">
                  <input
                    class="form-check-input visibility-field-checkbox"
                    type="checkbox"
                    id="visibility-${this.slugify(field.fieldId)}"
                    value="${this.escapeHtml(field.fieldId)}"
                    data-field-label="${this.escapeHtml(field.label)}"
                    ${selectedVisibleFields.has(field.fieldId) ? 'checked' : ''}
                  >
                  <label class="form-check-label small" for="visibility-${this.slugify(field.fieldId)}">
                    ${this.escapeHtml(field.label)}
                  </label>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `).join('');

    summary.textContent = selectedVisibleFields.size > 0
      ? `${selectedVisibleFields.size} campo(s) configurado(s) para exibição focada.`
      : 'Sem filtro de exibição: o modal de detalhes continuará mostrando todos os campos.';

    const updateSelectionSummary = () => {
      const checkedCount = fieldsContainer.querySelectorAll('.visibility-field-checkbox:checked').length;
      summary.textContent = checkedCount > 0
        ? `${checkedCount} campo(s) configurado(s) para exibição focada.`
        : 'Sem filtro de exibição: o modal de detalhes continuará mostrando todos os campos.';
    };

    fieldsContainer.querySelectorAll('.visibility-field-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', updateSelectionSummary);
    });

    const applySearch = (inputEl) => {
      const searchTerm = (inputEl.value || '').trim().toLowerCase();
      fieldsContainer.querySelectorAll('.visibility-field-item').forEach((item) => {
        const label = item.dataset.label || '';
        item.classList.toggle('d-none', searchTerm !== '' && !label.includes(searchTerm));
      });
    };

    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    newSearchInput.value = '';
    newSearchInput.addEventListener('input', () => applySearch(newSearchInput));

    const newClearBtn = clearBtn.cloneNode(true);
    clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
    newClearBtn.addEventListener('click', () => {
      newSearchInput.value = '';
      applySearch(newSearchInput);
      newSearchInput.focus();
    });

    const newSelectAllBtn = selectAllBtn.cloneNode(true);
    selectAllBtn.parentNode.replaceChild(newSelectAllBtn, selectAllBtn);
    newSelectAllBtn.addEventListener('click', () => {
      const checkboxes = fieldsContainer.querySelectorAll('.visibility-field-checkbox');
      const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every((checkbox) => checkbox.checked);
      checkboxes.forEach((checkbox) => {
        checkbox.checked = !allChecked;
      });
      updateSelectionSummary();
    });

    let bsModal = bootstrap.Modal.getInstance(modal);
    if (!bsModal) {
      bsModal = new bootstrap.Modal(modal, {
        backdrop: false,
        keyboard: true
      });
    }

    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', () => this.saveVisibilityRule(bsModal));

    bsModal.show();
  }

  async saveVisibilityRule(bsModal) {
    const statusName = document.getElementById('visibility-status-name')?.value;
    const summary = document.getElementById('visibility-fields-summary');
    const saveBtn = document.getElementById('unified-status-visibility-save-btn');
    if (!statusName || !saveBtn) return;

    const selectedFields = Array.from(document.querySelectorAll('.visibility-field-checkbox:checked')).map((checkbox) => ({
      fieldId: checkbox.value,
      label: checkbox.dataset.fieldLabel
    }));
    const existingRule = this.rulesMap.get(statusName) || {};
    const requiredFields = Array.isArray(existingRule.requiredFields) ? existingRule.requiredFields : undefined;

    saveBtn.disabled = true;

    try {
      if (!window.firestoreService || typeof window.firestoreService.saveStatusRule !== 'function') {
        throw new Error('firestoreService.saveStatusRule não está disponível');
      }

      await window.firestoreService.saveStatusRule(statusName, requiredFields, selectedFields);

      this.rulesMap.set(statusName, {
        ...existingRule,
        originalStatusName: statusName,
        ...(Array.isArray(requiredFields) ? { requiredFields } : {}),
        visibleFields: selectedFields
      });

      this.renderTable();
      document.dispatchEvent(new CustomEvent('status-workflow-updated', {
        detail: {
          type: 'rules',
          action: 'visibility-saved',
          statusName,
          fieldsCount: selectedFields.length
        }
      }));

      bsModal.hide();

      if (window.uiHelpers?.showToast) {
        window.uiHelpers.showToast('Exibição de campos atualizada com sucesso', 'success');
      }
    } catch (error) {
      console.error('Erro ao salvar exibição de campos:', error);
      if (summary) {
        summary.innerHTML = `<span class="text-danger">${this.escapeHtml(error.message)}</span>`;
      }
      if (window.uiHelpers?.showToast) {
        window.uiHelpers.showToast(`Erro ao salvar exibição: ${error.message}`, 'error');
      }
    } finally {
      saveBtn.disabled = false;
    }
  }

  async toggleStatusActive(statusId, isActive) {
    console.log(`🔵 Toggle status ${statusId}:`, isActive);
    
    try {
      // Atualizar no Firestore
      if (window.firestoreService?.toggleStatusActive) {
        await window.firestoreService.toggleStatusActive(statusId, isActive);
        
        // Atualizar cache local
        const status = this.statusData.find(s => (s.id || s.text) === statusId);
        if (status) {
          status.active = isActive;
        }
        
        // Disparar evento de sincronização
        this.dispatchUpdateEvent('status-toggled', { statusId, isActive });
        
        if (window.uiHelpers?.showToast) {
          window.uiHelpers.showToast(
            `Status ${isActive ? 'ativado' : 'desativado'} com sucesso`, 
            'success'
          );
        }
      }
    } catch (error) {
      console.error('❌ Erro ao alterar status:', error);
      if (window.uiHelpers?.showToast) {
        window.uiHelpers.showToast(`Erro ao alterar status: ${error.message}`, 'error');
      }
      
      // Reverter toggle
      const toggle = document.querySelector(`.status-active-toggle[data-status-id="${statusId}"]`);
      if (toggle) {
        toggle.checked = !isActive;
      }
    }
  }

  async deleteStatus(statusId) {
    const status = this.statusData.find(s => (s.id || s.text) === statusId);
    if (!status) return;

    const confirmed = window.uiHelpers?.confirmDelete
      ? await window.uiHelpers.confirmDelete(`o status "${status.text}"`)
      : confirm(`Deseja realmente excluir o status "${status.text}"?\n\nEsta ação não pode ser desfeita.`);

    if (!confirmed) return;

    try {
      if (window.firestoreService?.deleteStatusConfig) {
        await window.firestoreService.deleteStatusConfig(status.text);
        
        // Remover do cache local
        this.statusData = this.statusData.filter(s => (s.id || s.text) !== statusId);
        
        // Re-renderizar tabela
        this.renderTable();
        
        // Disparar evento de sincronização
        this.dispatchUpdateEvent('status-deleted', { statusId });
        
        if (window.uiHelpers?.showToast) {
          window.uiHelpers.showToast('Status excluído com sucesso', 'success');
        }
      }
    } catch (error) {
      console.error('❌ Erro ao excluir status:', error);
      if (window.uiHelpers?.showToast) {
        window.uiHelpers.showToast(`Erro ao excluir status: ${error.message}`, 'error');
      }
    }
  }

  dispatchUpdateEvent(eventType, detail) {
    document.dispatchEvent(new CustomEvent('status-workflow-updated', {
      detail: { type: 'status', action: eventType, ...detail }
    }));
  }

  openEditModal(status = null) {
    const modal = document.getElementById('unified-status-edit-modal');
    const modalTitle = document.getElementById('unified-status-edit-modal-title');
    const form = document.getElementById('unified-status-edit-form');

    if (!modal || !form) return;

    // Resetar formulario
    form.reset();

    // Preencher checkboxes de proximos status
    const nextStepsContainer = document.getElementById('edit-status-nextsteps-container');
    if (nextStepsContainer) {
      const activeStatuses = this.statusData.filter(s => s.active !== false);
      const selectedNextSteps = status?.nextSteps || [];

      nextStepsContainer.innerHTML = activeStatuses.map(s => {
        const isChecked = Array.isArray(selectedNextSteps) && selectedNextSteps.includes(s.text);
        const checkId = `nextstep-${this.escapeHtml(s.text).replace(/\s+/g, '-')}`;
        return `
          <div class="form-check form-check-inline" style="min-width: 45%;">
            <input class="form-check-input nextstep-checkbox" type="checkbox"
                   id="${checkId}" value="${this.escapeHtml(s.text)}" ${isChecked ? 'checked' : ''}>
            <label class="form-check-label small" for="${checkId}">${this.escapeHtml(s.text)}</label>
          </div>
        `;
      }).join('');
    }

    if (status) {
      // Modo edicao
      modalTitle.innerHTML = '<i class="bi bi-pencil"></i> Editar Status';
      document.getElementById('edit-status-id').value = status.id || status.text;
      document.getElementById('edit-status-name').value = status.text || '';
      document.getElementById('edit-status-stage').value = status.stage || '';
      document.getElementById('edit-status-order').value = status.order || 0;
      document.getElementById('edit-status-bgcolor').value = status.bgColor || '#0D6EFD';
      document.getElementById('edit-status-color').value = status.color || '#FFFFFF';
      document.getElementById('edit-status-active').checked = status.active !== false;
      document.getElementById('edit-status-archive').checked = status.archiveContracts || false;
    } else {
      // Modo criacao
      modalTitle.innerHTML = '<i class="bi bi-plus-circle"></i> Novo Status';
      document.getElementById('edit-status-bgcolor').value = '#0D6EFD';
      document.getElementById('edit-status-color').value = '#FFFFFF';
      document.getElementById('edit-status-active').checked = true;

      // Calcular proxima ordem
      const maxOrder = Math.max(0, ...this.statusData.map(s => Number(s.order) || 0));
      document.getElementById('edit-status-order').value = maxOrder + 1;
    }

    // Abrir modal sem backdrop (ja estamos dentro de outro modal)
    // O atributo data-nested-modal faz o modalManager tratar corretamente
    let bsModal = bootstrap.Modal.getInstance(modal);
    if (!bsModal) {
      bsModal = new bootstrap.Modal(modal, {
        backdrop: false,
        keyboard: true
      });
    }
    bsModal.show();

    // Setup listener para salvar (remover antigos primeiro)
    const saveBtn = document.getElementById('unified-status-save-btn');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', () => this.saveStatusFromModal(bsModal));
  }

  async saveStatusFromModal(bsModal) {
    const form = document.getElementById('unified-status-edit-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const statusId = document.getElementById('edit-status-id').value;
    const name = document.getElementById('edit-status-name').value.trim();
    const stage = document.getElementById('edit-status-stage').value.trim();
    const order = parseInt(document.getElementById('edit-status-order').value, 10) || 0;
    const bgColor = document.getElementById('edit-status-bgcolor').value;
    const color = document.getElementById('edit-status-color').value;
    const active = document.getElementById('edit-status-active').checked;
    const archiveContracts = document.getElementById('edit-status-archive').checked;

    // Coletar nextSteps dos checkboxes
    const nextStepsCheckboxes = document.querySelectorAll('.nextstep-checkbox:checked');
    const nextSteps = Array.from(nextStepsCheckboxes).map(cb => cb.value);

    const statusData = {
      text: name,
      stage: stage,
      order: order,
      bgColor: bgColor,
      color: color,
      nextSteps: nextSteps,
      active: active,
      archiveContracts: archiveContracts,
      autoReorder: true
    };

    try {
      const isEdit = statusId !== '';

      // Usar createOrUpdateStatus do firestoreService (funciona para criar e atualizar)
      if (window.firestoreService?.createOrUpdateStatus) {
        const result = await window.firestoreService.createOrUpdateStatus(statusData);
        console.log('Status salvo com sucesso:', statusData);
        console.log('[Reorder Debug] Resposta CF:', result);

        // Atualizar cache local
        if (isEdit) {
          const index = this.statusData.findIndex(s => (s.id || s.text) === statusId);
          if (index >= 0) {
            this.statusData[index] = { ...this.statusData[index], ...statusData };
          }
        } else {
          this.statusData.push({ id: name, ...statusData });
        }

        // Atualizar cache global
        if (window.EFFECTIVE_STATUS_CONFIG) {
          const globalIndex = window.EFFECTIVE_STATUS_CONFIG.findIndex(s => s.text === name);
          if (globalIndex >= 0) {
            window.EFFECTIVE_STATUS_CONFIG[globalIndex] = { ...window.EFFECTIVE_STATUS_CONFIG[globalIndex], ...statusData };
          } else if (!isEdit) {
            window.EFFECTIVE_STATUS_CONFIG.push({ id: name, ...statusData });
          }
        }
      } else {
        throw new Error('firestoreService.createOrUpdateStatus nao disponivel');
      }

      // Re-renderizar tabela
      this.renderTable();
      
      // Disparar evento de sincronização
      this.dispatchUpdateEvent(isEdit ? 'status-updated' : 'status-created', { statusId: name });
      
      // Fechar modal
      bsModal.hide();

      if (window.uiHelpers?.showToast) {
        window.uiHelpers.showToast(
          isEdit ? 'Status atualizado com sucesso' : 'Status criado com sucesso',
          'success'
        );
      }
    } catch (error) {
      console.error('❌ Erro ao salvar status:', error);
      if (window.uiHelpers?.showToast) {
        window.uiHelpers.showToast(`Erro ao salvar status: ${error.message}`, 'error');
      }
    }
  }

  navigateToSLATab(statusText) {
    console.log('🔵 Navegando para tab SLA com filtro:', statusText);
    
    // Trocar para tab SLA por Status
    const slaTabBtn = document.querySelector('.nav-link[data-tab="sla-status"]');
    if (slaTabBtn) {
      slaTabBtn.click();
      
      // Aguardar um pouco para a tab carregar e aplicar filtro
      setTimeout(() => {
        const searchInput = document.getElementById('sla-status-search');
        if (searchInput) {
          searchInput.value = statusText;
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          searchInput.focus();
          
          // Scroll para o input
          searchInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 300);
    }
  }

  slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
