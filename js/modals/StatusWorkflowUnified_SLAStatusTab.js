/**
 * @fileoverview Tab SLA por Status - Gerenciador de Status e Workflows
 * Migração e adaptação de slaConfigManager.js para o modal unificado
 * 
 * @version 1.0.0
 * @date 2026-01-20
 */

export class SLAStatusTabManager {
  constructor() {
    this.containerId = 'unified-sla-status-container';
    this.loaded = false;
    this.statusList = [];
    this.slaConfig = {};
    this.isLoading = false;
  }

  async render() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error('❌ Container da tab SLA Status não encontrado');
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
      console.error('❌ Erro ao renderizar tab SLA Status:', error);
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle"></i>
          <strong>Erro ao carregar configurações de SLA</strong>
          <p class="mb-0">${error.message}</p>
        </div>
      `;
    }
  }

  async loadData() {
    // Carregar lista de status
    if (window.EFFECTIVE_STATUS_CONFIG && Array.isArray(window.EFFECTIVE_STATUS_CONFIG) && window.EFFECTIVE_STATUS_CONFIG.length > 0) {
      this.statusList = [...window.EFFECTIVE_STATUS_CONFIG];
    } else if (window.firestoreService && typeof window.firestoreService.getEffectiveStatuses === 'function') {
      this.statusList = await window.firestoreService.getEffectiveStatuses();
    } else if (typeof firebase !== 'undefined' && firebase.firestore) {
      const db = firebase.firestore();
      const snapshot = await db.collection('statusConfig').orderBy('order').get();
      this.statusList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }

    // Carregar configurações SLA existentes
    await this.loadSLAConfig();
  }

  async loadSLAConfig() {
    try {
      const db = firebase.firestore();
      const snapshot = await db.collection('slaConfig').get();
      
      this.slaConfig = {};
      snapshot.forEach(doc => {
        this.slaConfig[doc.id] = doc.data();
      });
    } catch (error) {
      console.warn('⚠️ Erro ao carregar config SLA, usando valores padrão:', error);
      this.slaConfig = {};
    }
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
                <input type="text" class="form-control" id="unified-sla-status-search" 
                       placeholder="Buscar status...">
              </div>
            </div>
            <div class="col-md-6 text-end">
              <button type="button" class="btn btn-sm btn-outline-secondary" id="unified-sla-apply-to-all">
                <i class="bi bi-arrows-expand"></i> Aplicar a Todos
              </button>
              <button type="button" class="btn btn-sm btn-outline-warning" id="unified-sla-clear-all">
                <i class="bi bi-trash"></i> Limpar Tudo
              </button>
              <button type="button" class="btn btn-sm btn-outline-primary" id="unified-sla-refresh">
                <i class="bi bi-arrow-clockwise"></i> Atualizar
              </button>
              <button type="button" class="btn btn-sm btn-success" id="unified-sla-save-all">
                <i class="bi bi-save"></i> Salvar Tudo
              </button>
            </div>
          </div>
          <div id="unified-sla-save-status" class="mt-2 text-center"></div>
        </div>

        <!-- Tabela de SLA -->
        <div class="flex-grow-1 overflow-auto p-3">
          <div class="table-responsive">
            <table class="table table-hover table-sm align-middle" id="unified-sla-status-table">
              <thead class="table-light sticky-top">
                <tr>
                  <th style="width: 50px;" class="text-center">#</th>
                  <th style="width: 200px;">Status</th>
                  <th style="width: 120px;">Etapa</th>
                  <th style="width: 250px;">Prazo SLA (dias úteis)</th>
                  <th style="width: 100px;" class="text-center">Estado</th>
                </tr>
              </thead>
              <tbody id="unified-sla-status-table-body">
                <!-- Preenchido dinamicamente -->
              </tbody>
            </table>
          </div>
        </div>

        <!-- Footer com informações -->
        <div class="border-top p-2 bg-light text-muted small">
          <div class="d-flex justify-content-between">
            <span>
              <i class="bi bi-info-circle"></i>
              Configure prazos em dias úteis para cada status do processo
            </span>
            <span id="unified-sla-status-count">0 status</span>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
    this.renderTable();
  }

  renderTable() {
    const tbody = document.getElementById('unified-sla-status-table-body');
    if (!tbody) return;

    if (this.statusList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted py-4">
            <i class="bi bi-inbox fs-3 d-block mb-2"></i>
            Nenhum status encontrado
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.statusList.map((status, index) => {
      const statusId = this.getStatusId(status.text);
      const currentSLA = this.slaConfig[statusId]?.slaDays || '';
      const isActive = status.active !== false;

      return `
        <tr data-status-id="${statusId}" data-status-name="${status.text.toLowerCase()}"
            ${!isActive ? 'class="table-secondary" style="opacity: 0.6;"' : ''}>
          <td class="text-center text-muted">${index + 1}</td>
          <td>
            <div class="d-flex align-items-center justify-content-between">
              <div>
                <strong>${this.escapeHtml(status.text)}</strong>
                ${!isActive ? '<span class="badge bg-secondary ms-2">Inativo</span>' : ''}
              </div>
              <button type="button" 
                      class="btn btn-sm btn-link text-muted sla-goto-status-btn" 
                      data-status-text="${this.escapeHtml(status.text)}"
                      title="Ver detalhes do status">
                <i class="bi bi-box-arrow-up-right"></i>
              </button>
            </div>
          </td>
          <td class="text-muted">${this.escapeHtml(status.stage || '-')}</td>
          <td>
            <div class="input-group input-group-sm">
              <input 
                type="number" 
                class="form-control sla-input" 
                data-status-id="${statusId}"
                value="${currentSLA}" 
                placeholder="Ex: 5" 
                step="0.5"
                min="0"
                ${!isActive ? 'disabled' : ''}
              >
              <span class="input-group-text">
                <i class="bi bi-calendar-check"></i>
              </span>
            </div>
            <small class="text-muted">
              ${currentSLA ? `Prazo: ${currentSLA} ${currentSLA === 1 ? 'dia útil' : 'dias úteis'}` : 'SLA desabilitado'}
            </small>
          </td>
          <td class="text-center">
            ${isActive 
              ? '<span class="badge bg-success"><i class="bi bi-check-circle"></i> Ativo</span>' 
              : '<span class="badge bg-secondary"><i class="bi bi-x-circle"></i> Inativo</span>'}
          </td>
        </tr>
      `;
    }).join('');

    this.updateCounters();
    this.setupTableInteractions();
  }

  setupListeners() {
    // Busca
    const searchInput = document.getElementById('unified-sla-status-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.filterTable(e.target.value));
    }

    // Atualizar
    const refreshBtn = document.getElementById('unified-sla-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }

    // Salvar tudo
    const saveBtn = document.getElementById('unified-sla-save-all');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveAll());
    }

    // Aplicar a todos
    const applyBtn = document.getElementById('unified-sla-apply-to-all');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => this.applyToAll());
    }

    // Limpar tudo
    const clearBtn = document.getElementById('unified-sla-clear-all');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAll());
    }
  }

  setupTableInteractions() {
    // Event listeners nos inputs
    document.querySelectorAll('.sla-input').forEach(input => {
      input.addEventListener('change', () => {
        this.showStatus('Alterações pendentes - clique em "Salvar Tudo" para confirmar', 'warning');
      });
    });

    // Navegação para tab Status
    document.querySelectorAll('.sla-goto-status-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const statusText = e.currentTarget.dataset.statusText;
        this.navigateToStatusTab(statusText);
      });
    });
  }

  filterTable(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    const rows = document.querySelectorAll('#unified-sla-status-table-body tr[data-status-id]');

    rows.forEach(row => {
      const statusName = row.dataset.statusName || '';
      if (statusName.includes(term)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  }

  async saveAll() {
    if (this.isLoading) return;

    const inputs = document.querySelectorAll('.sla-input:not([disabled])');
    if (inputs.length === 0) {
      this.showStatus('Nenhuma configuração para salvar', 'info');
      return;
    }

    this.isLoading = true;
    this.showStatus('Salvando configurações...', 'info');

    try {
      const db = firebase.firestore();
      const batch = db.batch();
      let savedCount = 0;

      inputs.forEach(input => {
        const statusId = input.dataset.statusId;
        const slaDays = parseFloat(input.value) || 0;

        const docRef = db.collection('slaConfig').doc(statusId);
        batch.set(docRef, {
          statusId,
          slaDays,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: firebase.auth().currentUser?.email || 'system'
        }, { merge: true });

        savedCount++;
      });

      await batch.commit();

      // Atualizar cache local
      await this.loadSLAConfig();

      this.showStatus(`${savedCount} configurações salvas com sucesso!`, 'success');
      
      // Disparar evento para sincronização
      document.dispatchEvent(new CustomEvent('status-workflow-updated', {
        detail: { type: 'sla', action: 'bulk-update', count: savedCount }
      }));

      // Também disparar evento legado
      document.dispatchEvent(new CustomEvent('sla-config-updated', {
        detail: { count: savedCount }
      }));

      setTimeout(() => this.clearStatus(), 3000);

    } catch (error) {
      console.error('❌ Erro ao salvar:', error);
      this.showStatus(`Erro ao salvar: ${error.message}`, 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  applyToAll() {
    const defaultDays = prompt('Digite o prazo padrão em dias úteis para todos os status ativos:', '5');
    
    if (defaultDays === null) return;
    
    const days = parseFloat(defaultDays);
    
    if (isNaN(days) || days < 0) {
      alert('Por favor, digite um número válido maior ou igual a zero.');
      return;
    }

    document.querySelectorAll('.sla-input:not([disabled])').forEach(input => {
      input.value = days;
      input.dispatchEvent(new Event('change'));
    });

    this.showStatus(`Prazo de ${days} dias aplicado a todos os status ativos`, 'success');
    setTimeout(() => this.clearStatus(), 3000);
  }

  clearAll() {
    if (!confirm('Tem certeza que deseja limpar todos os prazos de SLA? Esta ação não pode ser desfeita.')) {
      return;
    }

    document.querySelectorAll('.sla-input').forEach(input => {
      input.value = '';
      input.dispatchEvent(new Event('change'));
    });

    this.showStatus('Todos os prazos foram limpos. Clique em "Salvar Tudo" para confirmar.', 'warning');
  }

  async refresh() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.dataset.loaded = 'false';
    this.loaded = false;
    await this.render();
    
    if (window.uiHelpers?.showToast) {
      window.uiHelpers.showToast('Configurações de SLA atualizadas', 'success');
    }
  }

  updateCounters() {
    const countEl = document.getElementById('unified-sla-status-count');
    if (countEl) {
      const activeCount = this.statusList.filter(s => s.active !== false).length;
      countEl.textContent = `${this.statusList.length} status (${activeCount} ativos)`;
    }
  }

  showStatus(message, type = 'info') {
    const statusEl = document.getElementById('unified-sla-save-status');
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
    const statusEl = document.getElementById('unified-sla-save-status');
    if (statusEl) {
      statusEl.innerHTML = '';
    }
  }

  getStatusId(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_');
  }

  navigateToStatusTab(statusText) {
    // Trocar para tab Status
    const statusTabBtn = document.querySelector('.nav-link[data-tab="status"]');
    if (statusTabBtn) {
      statusTabBtn.click();
      
      // Aguardar um pouco para a tab carregar e aplicar filtro
      setTimeout(() => {
        const searchInput = document.getElementById('unified-status-search');
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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
