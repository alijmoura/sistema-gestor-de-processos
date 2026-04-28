import { auth } from "./auth.js";
import userPermissionService from "./userPermissionService.js";
import workflowService from "./workflowService.js";
import { escapeHtml, sanitizeAttribute, sanitizeDomId } from "./sanitization.js";

export class AdminPermissionsUI {
  constructor() {
    this.modalId = 'admin-permissions-modal';
    this.initialized = false;
    this.appState = null;
  }

  async init(appState) {
    if (this.initialized) return;
    
    this.appState = appState;
    
    // Verifica se usuário é admin (verificação simples por claims ou email, 
    // idealmente deve vir de userPermissionService.getUserPermissions)
    const user = auth.currentUser;
    if (!user) return;

    const perms = await userPermissionService.getUserPermissions(user.uid);
    if (perms.role !== 'admin') return;

    this.injectModal();
    this.addAdminButton();
    this.initialized = true;
  }

  injectModal() {
    if (document.getElementById(this.modalId)) return;

    const modalHtml = `
      <div class="modal fade" id="${this.modalId}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Gestão de Permissões de Usuários</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
              <div class="row mb-3">
                <div class="col">
                  <input type="text" id="admin-user-search" class="form-control" placeholder="Buscar usuário por nome ou email...">
                </div>
              </div>
              <div class="table-responsive">
                <table class="table table-hover">
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>Role</th>
                      <th>Workflows</th>
                      <th>Vendedores</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody id="admin-users-table-body">
                    <tr><td colspan="5" class="text-center">Carregando...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal de Edição -->
      <div class="modal fade" id="admin-edit-perm-modal" tabindex="-1" aria-hidden="true" style="z-index: 1060;">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Editar Permissões</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
              <input type="hidden" id="edit-perm-uid">
              <h6 id="edit-perm-username" class="mb-3"></h6>
              
              <div class="mb-3">
                <label class="form-label">Função (Role)</label>
                <select id="edit-perm-role" class="form-select">
                  <option value="user">Usuário Padrão</option>
                  <option value="manager">Gerente</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div class="mb-3">
                <label class="form-label">Workflows Permitidos</label>
                <div id="edit-perm-workflows" class="border p-2 rounded scroll-y-xs">
                  <!-- Checkboxes gerados dinamicamente -->
                </div>
                <div class="form-text">Se nenhum selecionado, acesso total (padrão legado).</div>
              </div>

              <div class="mb-3">
                <label class="form-label">Vendedores Permitidos</label>
                <textarea id="edit-perm-vendors" class="form-control" rows="3" placeholder="Nome1, Nome2 (separados por vírgula)"></textarea>
                <div class="form-text">Deixe vazio para acesso a todos.</div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-primary" id="save-perm-btn">Salvar</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Listeners
    document.getElementById('admin-user-search').addEventListener('input', (e) => this.filterUsers(e.target.value));
    document.getElementById('save-perm-btn').addEventListener('click', () => this.savePermissions());
  }

  addAdminButton() {
    // Botão removido da sidebar
  }

  async openModal() {
    const modal = new window.bootstrap.Modal(document.getElementById(this.modalId));
    modal.show();
    await this.loadUsers();
  }

  async loadUsers() {
    const tbody = document.getElementById('admin-users-table-body');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando usuários...</td></tr>';

    // Usa appState.allUsers se disponível, senão busca
    let users = (this.appState && this.appState.allUsers) || [];
    
    // Para cada usuário, busca permissões (isso pode ser lento se forem muitos, 
    // idealmente o backend retornaria tudo junto, mas vamos iterar por enquanto)
    // Otimização: buscar apenas quando clicar em editar? Não, precisamos mostrar na tabela.
    
    const rows = [];
    for (const user of users) {
      const perms = await userPermissionService.getUserPermissions(user.uid);
      rows.push({ user, perms });
    }

    this.usersData = rows;
    this.renderTable(rows);
  }

  renderTable(rows) {
    const tbody = document.getElementById('admin-users-table-body');
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum usuário encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(row => {
      const role = String(row?.perms?.role || 'user');
      const roleBadgeClass = role === 'admin' ? 'danger' : 'secondary';
      const workflows = escapeHtml((row?.perms?.allowedWorkflows || []).join(', ') || 'Todos');
      const vendors = escapeHtml((row?.perms?.allowedVendors || []).join(', ') || 'Todos');
      const displayName = escapeHtml(row?.user?.displayName || row?.user?.email || 'Sem nome');
      const email = escapeHtml(row?.user?.email || '');
      const roleLabel = escapeHtml(role);
      const uid = sanitizeAttribute(row?.user?.uid || '');
      
      return `
        <tr>
          <td>
            <div class="fw-bold">${displayName}</div>
            <div class="small text-muted">${email}</div>
          </td>
          <td><span class="badge bg-${roleBadgeClass}">${roleLabel}</span></td>
          <td><small>${workflows}</small></td>
          <td><small>${vendors}</small></td>
          <td>
            <button class="btn btn-sm btn-outline-primary edit-perm-btn" data-uid="${uid}">
              <i class="bi bi-pencil"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Re-attach listeners
    tbody.querySelectorAll('.edit-perm-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.dataset.uid;
        const data = this.usersData.find(r => r.user.uid === uid);
        this.openEditModal(data);
      });
    });
  }

  filterUsers(term) {
    if (!this.usersData) return;
    const lower = term.toLowerCase();
    const filtered = this.usersData.filter(row => 
      (row.user.displayName || '').toLowerCase().includes(lower) ||
      (row.user.email || '').toLowerCase().includes(lower)
    );
    this.renderTable(filtered);
  }

  async openEditModal(data) {
    const modal = new window.bootstrap.Modal(document.getElementById('admin-edit-perm-modal'));
    
    document.getElementById('edit-perm-uid').value = data.user.uid;
    document.getElementById('edit-perm-username').textContent = `Editando: ${data.user.displayName || data.user.email}`;
    document.getElementById('edit-perm-role').value = data.perms.role || 'user';
    document.getElementById('edit-perm-vendors').value = (data.perms.allowedVendors || []).join(', ');

    // Render Workflows Checkboxes
    const wfContainer = document.getElementById('edit-perm-workflows');
    wfContainer.innerHTML = '<div class="text-center text-muted small">Carregando workflows...</div>';
    
    try {
      // Fetch all available workflows dynamically
      const allWorkflows = await workflowService.getAllWorkflows();
      
      if (allWorkflows.length === 0) {
        wfContainer.innerHTML = '<div class="text-danger small">Nenhum workflow encontrado.</div>';
      } else {
        wfContainer.innerHTML = allWorkflows.map(wf => {
          const workflowId = String(wf?.id || '');
          const checked = (data.perms.allowedWorkflows || []).includes(workflowId) ? 'checked' : '';
          const workflowDomId = sanitizeDomId(workflowId, 'wf');
          const safeWorkflowId = sanitizeAttribute(workflowId);
          const safeWorkflowName = escapeHtml(wf?.name || workflowId || 'Workflow');
          const workflowLabel = escapeHtml(workflowId);
          return `
            <div class="form-check">
              <input class="form-check-input" type="checkbox" value="${safeWorkflowId}" id="${workflowDomId}" ${checked}>
              <label class="form-check-label" for="${workflowDomId}">
                ${safeWorkflowName} <small class="text-muted">(${workflowLabel})</small>
              </label>
            </div>
          `;
        }).join('');
      }
    } catch (error) {
      console.error("Erro ao carregar workflows:", error);
      wfContainer.innerHTML = '<div class="text-danger small">Erro ao carregar workflows.</div>';
    }

    modal.show();
  }

  async savePermissions() {
    const uid = document.getElementById('edit-perm-uid').value;
    const role = document.getElementById('edit-perm-role').value;
    const vendorsStr = document.getElementById('edit-perm-vendors').value;
    
    const allowedVendors = vendorsStr.split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const allowedWorkflows = [];
    document.querySelectorAll('#edit-perm-workflows input:checked').forEach(cb => {
      allowedWorkflows.push(cb.value);
    });

    const newPerms = {
      role,
      allowedWorkflows,
      allowedVendors
    };

    try {
      await userPermissionService.updateUserPermissions(uid, newPerms);
      
      // Fecha modal e recarrega
      const modalEl = document.getElementById('admin-edit-perm-modal');
      const modal = window.bootstrap.Modal.getInstance(modalEl);
      modal.hide();
      
      await this.loadUsers();
      alert('Permissões atualizadas com sucesso!');
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar permissões: ' + error.message);
    }
  }
}

const adminPermissionsUI = new AdminPermissionsUI();
export default adminPermissionsUI;
