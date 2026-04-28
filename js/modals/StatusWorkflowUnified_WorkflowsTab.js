/**
 * @fileoverview Tab Manager para Workflows (Tipos de Processo)
 * Gerencia CRUD de workflows com suas etapas/fases
 *
 * @module StatusWorkflowUnified_WorkflowsTab
 * @requires firebase
 * @requires workflowService
 */

import workflowService from '../workflowService.js';

/**
 * Gerenciador da tab "Workflows" no modal unificado
 * @class
 */
export class WorkflowsTabManager {
  /**
   * @constructor
   */
  constructor() {
    this.container = null;
    this.workflows = [];
    this.currentWorkflow = null;
    this.isLoading = false;
  }

  normalizeText(value) {
    return value === undefined || value === null
      ? ''
      : String(value).trim().toLowerCase();
  }

  getSystemStatusesMap() {
    const map = new Map();
    const statuses = Array.isArray(window.EFFECTIVE_STATUS_CONFIG)
      ? window.EFFECTIVE_STATUS_CONFIG
      : [];

    statuses.forEach((status) => {
      if (!status || !status.text) return;
      const normalized = this.normalizeText(status.text);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, status.text);
      }
    });

    return map;
  }

  /**
   * Renderiza a tab completa
   * @returns {Promise<void>}
   */
  async render() {
    this.container = document.getElementById('unified-workflows-container');
    if (!this.container) {
      console.error('[Workflows Tab] Container nao encontrado');
      return;
    }

    // Renderizar HTML
    this.renderHTML();

    // Carregar dados
    await this.loadData();

    // Renderizar lista
    this.renderList();

    // Setup listeners
    this.setupListeners();
  }

  /**
   * Renderiza estrutura HTML da tab
   */
  renderHTML() {
    this.container.innerHTML = `
      <div class="d-flex h-100" style="min-height: 500px;">
        <!-- Sidebar Lista -->
        <div class="border-end bg-light p-3" style="width: 280px; overflow-y: auto;">
          <div class="d-grid gap-2 mb-3">
            <button class="btn btn-primary btn-sm" id="btn-new-workflow">
              <i class="bi bi-plus-lg"></i> Novo Workflow
            </button>
          </div>
          <div class="list-group" id="workflow-list">
            <!-- Lista preenchida via JS -->
          </div>
        </div>

        <!-- Área de Edição -->
        <div class="flex-grow-1 p-4" style="overflow-y: auto;">
          <form id="workflow-form" style="display: none;">
            <input type="hidden" id="wf-id">
            
            <div class="row mb-3">
              <div class="col-md-8">
                <label class="form-label fw-bold">Nome do Workflow</label>
                <input type="text" class="form-control" id="wf-name" required>
              </div>
              <div class="col-md-4">
                <label class="form-label fw-bold">ID (Sistema)</label>
                <input type="text" class="form-control" id="wf-sys-id" readonly>
                <div class="form-text">Gerado automaticamente</div>
              </div>
            </div>

            <div class="mb-4">
              <label class="form-label fw-bold">Descrição</label>
              <textarea class="form-control" id="wf-desc" rows="2"></textarea>
            </div>

            <div class="card mb-4">
              <div class="card-header d-flex justify-content-between align-items-center">
                <h6 class="mb-0">Estágios do Processo (Fases)</h6>
                <button type="button" class="btn btn-sm btn-outline-primary" id="btn-add-stage">
                  <i class="bi bi-plus"></i> Adicionar Estágio
                </button>
              </div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-hover mb-0 align-middle">
                    <thead class="table-light">
                      <tr>
                        <th style="width: 50px;">#</th>
                        <th>Nome da Fase</th>
                        <th style="width: 150px;">Ações</th>
                      </tr>
                    </thead>
                    <tbody id="stages-list-body">
                      <!-- Estágios -->
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div class="d-flex justify-content-between pt-3 border-top">
              <button type="button" class="btn btn-outline-danger" id="btn-delete-workflow">
                <i class="bi bi-trash"></i> Excluir Workflow
              </button>
              <button type="submit" class="btn btn-success px-4">
                <i class="bi bi-check-lg"></i> Salvar Alterações
              </button>
            </div>
          </form>

          <div id="workflow-empty-state" class="text-center text-muted py-5">
            <i class="bi bi-arrow-left-circle display-4"></i>
            <p class="mt-3">Selecione um workflow para editar ou crie um novo.</p>
          </div>
        </div>
      </div>

      <!-- Datalist para autocompletar status do sistema -->
      <datalist id="system-status-list"></datalist>
    `;
  }

  /**
   * Carrega workflows do Firestore via workflowService
   * @returns {Promise<void>}
   */
  async loadData() {
    try {
      this.showStatus('Carregando workflows...', 'info');
      this.workflows = await workflowService.getAllWorkflows();
      this.clearStatus();
      
      // Popula datalist com status do sistema para autocomplete
      this.populateStatusDatalist();
      
      console.log('[Workflows Tab] Workflows carregados:', this.workflows.length);
    } catch (error) {
      console.error('[Workflows Tab] Erro ao carregar:', error);
      this.showStatus('Erro ao carregar workflows: ' + error.message, 'danger');
      this.workflows = [];
    }
  }

  /**
   * Popula datalist com status do sistema para autocomplete
   */
  populateStatusDatalist() {
    const datalist = document.getElementById('system-status-list');
    if (!datalist) return;

    datalist.innerHTML = '';
    
    if (window.EFFECTIVE_STATUS_CONFIG && Array.isArray(window.EFFECTIVE_STATUS_CONFIG)) {
      window.EFFECTIVE_STATUS_CONFIG.forEach(status => {
        if (status.text) {
          const option = document.createElement('option');
          option.value = status.text;
          datalist.appendChild(option);
        }
      });
    }
  }

  /**
   * Renderiza lista de workflows na sidebar
   */
  renderList() {
    const listEl = document.getElementById('workflow-list');
    if (!listEl) return;

    if (this.isLoading) {
      listEl.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm"></div></div>';
      return;
    }

    if (this.workflows.length === 0) {
      listEl.innerHTML = '<div class="text-muted p-2 small">Nenhum workflow cadastrado</div>';
      return;
    }

    listEl.innerHTML = '';

    this.workflows.forEach(wf => {
      const item = document.createElement('button');
      item.className = `list-group-item list-group-item-action ${this.currentWorkflow?.id === wf.id ? 'active' : ''}`;
      item.innerHTML = `
        <div class="d-flex w-100 justify-content-between">
          <h6 class="mb-1">${this.escapeHtml(wf.name)}</h6>
        </div>
        <small class="${this.currentWorkflow?.id === wf.id ? 'text-white-50' : 'text-muted'}">${wf.stages?.length || 0} etapas</small>
      `;
      item.onclick = () => this.selectWorkflow(wf);
      listEl.appendChild(item);
    });
  }

  /**
   * Configura event listeners
   */
  setupListeners() {
    // Botao novo workflow
    const btnNew = document.getElementById('btn-new-workflow');
    if (btnNew) {
      btnNew.addEventListener('click', () => this.createNew());
    }

    // Botao adicionar estagio
    const btnAddStage = document.getElementById('btn-add-stage');
    if (btnAddStage) {
      btnAddStage.addEventListener('click', () => this.addStageRow());
    }

    // Form submit
    const form = document.getElementById('workflow-form');
    if (form) {
      form.addEventListener('submit', (e) => this.save(e));
    }

    // Botao deletar
    const btnDelete = document.getElementById('btn-delete-workflow');
    if (btnDelete) {
      btnDelete.addEventListener('click', () => this.deleteCurrent());
    }
  }

  /**
   * Seleciona um workflow para edicao
   * @param {Object} wf - Workflow a ser editado
   */
  selectWorkflow(wf) {
    this.currentWorkflow = wf;
    this.renderList(); // Atualiza active state
    
    document.getElementById('workflow-empty-state').style.display = 'none';
    document.getElementById('workflow-form').style.display = 'block';

    // Preenche formulário
    document.getElementById('wf-id').value = wf.id;
    document.getElementById('wf-sys-id').value = wf.id;
    document.getElementById('wf-name').value = wf.name;
    document.getElementById('wf-desc').value = wf.description || '';

    // Renderiza estágios
    const tbody = document.getElementById('stages-list-body');
    tbody.innerHTML = '';
    (wf.stages || []).forEach(stage => this.addStageRow(stage));
  }

  /**
   * Cria um novo workflow vazio
   */
  createNew() {
    this.currentWorkflow = null;
    this.renderList();

    document.getElementById('workflow-empty-state').style.display = 'none';
    document.getElementById('workflow-form').style.display = 'block';
    document.getElementById('workflow-form').reset();
    document.getElementById('wf-id').value = '';
    document.getElementById('wf-sys-id').value = 'Gerado ao salvar';
    document.getElementById('stages-list-body').innerHTML = '';
    
    // Adiciona pelo menos um estágio padrão
    this.addStageRow('Triagem');
  }

  /**
   * Adiciona uma linha de estagio na tabela
   * @param {string} value - Nome do estagio (opcional)
   */
  addStageRow(value = '') {
    const tbody = document.getElementById('stages-list-body');
    if (!tbody) return;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="text-center"><i class="bi bi-grip-vertical text-muted"></i></td>
      <td>
        <input type="text" class="form-control form-control-sm stage-input" value="${this.escapeHtml(value)}" list="system-status-list" placeholder="Nome da etapa (selecione ou digite)" required>
      </td>
      <td>
        <button type="button" class="btn btn-sm btn-outline-secondary btn-up" title="Mover para cima"><i class="bi bi-arrow-up"></i></button>
        <button type="button" class="btn btn-sm btn-outline-secondary btn-down" title="Mover para baixo"><i class="bi bi-arrow-down"></i></button>
        <button type="button" class="btn btn-sm btn-outline-danger btn-remove" title="Remover"><i class="bi bi-x-lg"></i></button>
      </td>
    `;

    // Listeners da linha
    row.querySelector('.btn-remove').onclick = () => row.remove();
    row.querySelector('.btn-up').onclick = () => {
      if (row.previousElementSibling) {
        row.parentNode.insertBefore(row, row.previousElementSibling);
      }
    };
    row.querySelector('.btn-down').onclick = () => {
      if (row.nextElementSibling) {
        row.parentNode.insertBefore(row.nextElementSibling, row);
      }
    };

    tbody.appendChild(row);
  }

  /**
   * Salva o workflow (criar ou atualizar)
   * @param {Event} e - Submit event
   * @returns {Promise<void>}
   */
  async save(e) {
    e.preventDefault();
    
    if (this.isLoading) return;

    const rawStages = [];
    document.querySelectorAll('.stage-input').forEach(input => {
      if (input.value.trim()) {
        rawStages.push(input.value.trim());
      }
    });

    // Remove duplicidades (case-insensitive), preservando ordem
    const seenStages = new Set();
    const stages = rawStages.filter((stage) => {
      const normalized = this.normalizeText(stage);
      if (!normalized || seenStages.has(normalized)) {
        return false;
      }
      seenStages.add(normalized);
      return true;
    });

    if (stages.length === 0) {
      this.showStatus('Adicione pelo menos um estágio ao workflow', 'warning');
      return;
    }

    // Valida se todas as etapas existem na configuracao de status do sistema
    const systemStatusesMap = this.getSystemStatusesMap();
    if (systemStatusesMap.size > 0) {
      const invalidStages = stages.filter((stage) => !systemStatusesMap.has(this.normalizeText(stage)));
      if (invalidStages.length > 0) {
        const warningMessage = `Etapas invalidas: ${invalidStages.join(', ')}. Use apenas status cadastrados na aba "Status do Sistema".`;
        this.showStatus(
          warningMessage,
          'warning'
        );
        alert(warningMessage);
        return;
      }
    }

    const workflowData = {
      id: document.getElementById('wf-id').value || null,
      name: document.getElementById('wf-name').value.trim(),
      description: document.getElementById('wf-desc').value.trim(),
      stages: stages,
      active: true
    };

    if (!workflowData.name) {
      this.showStatus('Nome do workflow é obrigatório', 'warning');
      return;
    }

    // Se for novo, gera ID baseado no nome (slug)
    if (!workflowData.id) {
      workflowData.id = workflowData.name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9]/g, '_'); // Substitui espaços/símbolos por _
    }

    this.isLoading = true;
    this.showStatus('Salvando workflow...', 'info');

    try {
      await workflowService.saveWorkflow(workflowData);
      this.showStatus('Workflow salvo com sucesso!', 'success');
      
      // Recarregar lista
      await this.loadData();
      this.renderList();
      
      // Seleciona o recém salvo
      const saved = this.workflows.find(w => w.id === workflowData.id);
      if (saved) {
        this.selectWorkflow(saved);
      }

      // Disparar evento para atualizar UI
      document.dispatchEvent(new CustomEvent('status-workflow-updated', {
        detail: {
          action: 'workflow-saved',
          workflowId: workflowData.id,
          source: 'StatusWorkflowUnified_WorkflowsTab'
        }
      }));

      setTimeout(() => this.clearStatus(), 3000);
      
    } catch (error) {
      console.error('[Workflows Tab] Erro ao salvar:', error);
      this.showStatus('Erro ao salvar: ' + error.message, 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Deleta o workflow atual
   * @returns {Promise<void>}
   */
  async deleteCurrent() {
    if (!this.currentWorkflow) return;
    
    if (!confirm(`Tem certeza que deseja excluir o workflow "${this.currentWorkflow.name}"?`)) {
      return;
    }

    this.isLoading = true;
    this.showStatus('Excluindo workflow...', 'info');

    try {
      await workflowService.deleteWorkflow(this.currentWorkflow.id);
      this.showStatus('Workflow excluído com sucesso!', 'success');
      
      this.currentWorkflow = null;
      document.getElementById('workflow-form').style.display = 'none';
      document.getElementById('workflow-empty-state').style.display = 'block';
      
      // Recarregar lista
      await this.loadData();
      this.renderList();

      // Disparar evento
      document.dispatchEvent(new CustomEvent('status-workflow-updated', {
        detail: {
          action: 'workflow-deleted',
          source: 'StatusWorkflowUnified_WorkflowsTab'
        }
      }));

      setTimeout(() => this.clearStatus(), 3000);
      
    } catch (error) {
      console.error('[Workflows Tab] Erro ao excluir:', error);
      this.showStatus('Erro ao excluir: ' + error.message, 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Exibe mensagem de status (placeholder - não há elemento de status nesta tab)
   * @param {string} message
   * @param {string} type
   */
  showStatus(message, type = 'info') {
    // Workflows tab não tem elemento dedicado de status
    // Podemos usar console ou adicionar um toast
    console.log(`[Workflows Tab] ${type.toUpperCase()}: ${message}`);
  }

  /**
   * Limpa mensagem de status
   */
  clearStatus() {
    // Nenhuma ação necessária
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

  /**
   * Atualiza a tab (re-renderiza)
   * @returns {Promise<void>}
   */
  async refresh() {
    await this.render();
  }
}
