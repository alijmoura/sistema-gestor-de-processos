/**
 * @deprecated Este modal está sendo substituído pelo Gerenciador Unificado de Status e Workflows
 * Novo modal: StatusWorkflowUnifiedModal (js/modals/StatusWorkflowUnifiedModal.js)
 * Acesso: Configurações > Gerenciador de Status e Workflows > Tab "Workflows"
 */

import { auth } from "./auth.js";
import workflowService from "./workflowService.js";
import userPermissionService from "./userPermissionService.js";

export class WorkflowEditorUI {
  constructor() {
    this.modalId = 'workflow-editor-modal';
    this.initialized = false;
    this.currentWorkflow = null;
    this.workflows = [];
  }

  async init() {
    if (this.initialized) return;
    
    const user = auth.currentUser;
    if (!user) return;

    // Apenas admins podem editar workflows
    const perms = await userPermissionService.getUserPermissions(user.uid);
    if (perms.role !== 'admin') return;

    this.injectModal();
    this.addMenuButton();
    this.initialized = true;
  }

  injectModal() {
    if (document.getElementById(this.modalId)) return;

    const modalHtml = `
      <div class="modal fade" id="${this.modalId}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header bg-light">
              <h5 class="modal-title"><i class="bi bi-diagram-3"></i> Editor de Workflows</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body p-0">
              <div class="d-flex h-100" style="min-height: 500px;">
                <!-- Sidebar Lista -->
                <div class="border-end bg-light p-3" style="width: 280px; overflow-y: auto;">
                  <div class="d-grid gap-2 mb-3">
                    <button class="btn btn-primary" id="btn-new-workflow">
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
                                <th style="width: 120px;">Ações</th>
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
            </div>
          </div>
        </div>
        <!-- Datalist para autocompletar status do sistema -->
        <datalist id="system-status-list"></datalist>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    this.setupListeners();
  }

  addMenuButton() {
    // Botão removido da sidebar
  }

  setupListeners() {
    document.getElementById('btn-new-workflow').addEventListener('click', () => this.createNew());
    document.getElementById('btn-add-stage').addEventListener('click', () => this.addStageRow());
    document.getElementById('workflow-form').addEventListener('submit', (e) => this.save(e));
    document.getElementById('btn-delete-workflow').addEventListener('click', () => this.deleteCurrent());
  }

  async openModal() {
    const modal = new window.bootstrap.Modal(document.getElementById(this.modalId));
    
    // Popula datalist com status do sistema
    const datalist = document.getElementById('system-status-list');
    if (datalist && window.EFFECTIVE_STATUS_CONFIG) {
      datalist.innerHTML = '';
      window.EFFECTIVE_STATUS_CONFIG.forEach(status => {
        const option = document.createElement('option');
        option.value = status.text;
        datalist.appendChild(option);
      });
    }

    modal.show();
    await this.loadWorkflows();
  }

  async loadWorkflows() {
    const listEl = document.getElementById('workflow-list');
    listEl.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm"></div></div>';

    try {
      this.workflows = await workflowService.getAllWorkflows();
      this.renderList();
    } catch (error) {
      console.error(error);
      listEl.innerHTML = '<div class="text-danger p-2">Erro ao carregar workflows</div>';
    }
  }

  renderList() {
    const listEl = document.getElementById('workflow-list');
    listEl.innerHTML = '';

    this.workflows.forEach(wf => {
      const item = document.createElement('button');
      item.className = `list-group-item list-group-item-action ${this.currentWorkflow?.id === wf.id ? 'active' : ''}`;
      item.innerHTML = `
        <div class="d-flex w-100 justify-content-between">
          <h6 class="mb-1">${wf.name}</h6>
        </div>
        <small class="${this.currentWorkflow?.id === wf.id ? 'text-white-50' : 'text-muted'}">${wf.stages?.length || 0} etapas</small>
      `;
      item.onclick = () => this.selectWorkflow(wf);
      listEl.appendChild(item);
    });
  }

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

  addStageRow(value = '') {
    const tbody = document.getElementById('stages-list-body');
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="text-center"><i class="bi bi-grip-vertical text-muted"></i></td>
      <td>
        <input type="text" class="form-control form-control-sm stage-input" value="${value}" list="system-status-list" placeholder="Nome da etapa (selecione ou digite)" required>
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
      if (row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
    };
    row.querySelector('.btn-down').onclick = () => {
      if (row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
    };

    tbody.appendChild(row);
  }

  async save(e) {
    e.preventDefault();
    
    const stages = [];
    document.querySelectorAll('.stage-input').forEach(input => {
      if (input.value.trim()) stages.push(input.value.trim());
    });

    if (stages.length === 0) {
      alert('Adicione pelo menos um estágio ao workflow.');
      return;
    }

    const workflowData = {
      id: document.getElementById('wf-id').value || null,
      name: document.getElementById('wf-name').value,
      description: document.getElementById('wf-desc').value,
      stages: stages,
      active: true
    };

    // Se for novo, gera ID baseado no nome (slug)
    if (!workflowData.id) {
      workflowData.id = workflowData.name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9]/g, '_'); // Substitui espaços/símbolos por _
    }

    try {
      await workflowService.saveWorkflow(workflowData);
      alert('Workflow salvo com sucesso!');
      await this.loadWorkflows();
      
      // Seleciona o recém salvo
      const saved = this.workflows.find(w => w.id === workflowData.id);
      if (saved) this.selectWorkflow(saved);
      
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar: ' + error.message);
    }
  }

  async deleteCurrent() {
    if (!this.currentWorkflow) return;
    
    if (!confirm(`Tem certeza que deseja excluir o workflow "${this.currentWorkflow.name}"?`)) return;

    try {
      await workflowService.deleteWorkflow(this.currentWorkflow.id);
      alert('Workflow excluído.');
      this.currentWorkflow = null;
      document.getElementById('workflow-form').style.display = 'none';
      document.getElementById('workflow-empty-state').style.display = 'block';
      await this.loadWorkflows();
    } catch (error) {
      console.error(error);
      alert('Erro ao excluir: ' + error.message);
    }
  }
}

const workflowEditorUI = new WorkflowEditorUI();
export default workflowEditorUI;
