/**
 * @file permissionsUI.js
 * @description UI completa para administração de permissões de usuários
 * Permite admin configurar visibilidade e edição de módulos/campos por usuário
 */

import { auth, db } from "./auth.js";
import cacheService from "./cacheService.js"; //  NOVO: Para cache de vendors
import permissionsService, { 
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  CONTRACT_FIELDS,
  PERMISSION_ROLES
} from "./permissionsService.js";
import * as UI from "./ui.js";

class PermissionsUI {
  constructor() {
    this.currentUserPerms = null;
    this.allUsers = [];
    this.selectedUserId = null;
    this.vendorsList = [];
    this.workflowsList = [];
    this.statusList = [];
  }

  /**
   * Inicializa a UI de permissões
   */
  async init() {
    try {
      // Verifica se usuário atual é admin
      const user = auth.currentUser;
      if (!user) return;

      this.currentUserPerms = await permissionsService.getUserPermissions(user.uid);
      
      // Só admin pode acessar
      if (!permissionsService.can(this.currentUserPerms, PERMISSION_MODULES.USERS, PERMISSION_ACTIONS.EDIT)) {
        console.warn(' Usuário sem permissão para gerenciar permissões');
        return;
      }

      await this.loadData();
      this.setupEventListeners();
      
      if (window.__DEBUG__) {
        console.log(' PermissionsUI inicializado');
      }
    } catch (error) {
      console.error(' Erro ao inicializar PermissionsUI:', error);
      UI.showNotification('Erro ao carregar interface de permissões', 'error');
    }
  }

  /**
   * Carrega dados necessários
   */
  async loadData() {
    try {
      // Carrega lista de usuários do Firebase Auth
      const usersSnapshot = await db.collection('users').get();
      this.allUsers = usersSnapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      }));

      // Carrega listas para filtros
      await this.loadVendors();
      await this.loadWorkflows();
      await this.loadStatus();

      await this.renderUsersList();
    } catch (error) {
      console.error(' Erro ao carregar dados:', error);
      throw error;
    }
  }

  /**
   * Carrega lista de vendedores/construtoras (com cache de 24h)
   * OTIMIZAÇÃO: Usa cache primeiro, depois appState, evita query Firestore desnecessária
   */
  async loadVendors() {
    try {
      // Usa cache para evitar leitura repetida
      const cached = await cacheService.get('vendors_list', async () => {
        console.log('[PermissionsUI] Extraindo vendedores...');

        let contracts = [];

        // PRIORIDADE 1: Verifica cache de contratos primeiro (IndexedDB ou memória)
        const cachedContracts = cacheService.getSync('contracts_all_active', 'contractsAll');
        if (cachedContracts?.length > 0) {
          contracts = cachedContracts;
          console.log(`[PermissionsUI]  Usando ${contracts.length} contratos do cache`);
        }

        // PRIORIDADE 2: Usa appState se disponível imediatamente
        if (contracts.length === 0 && window.appState?.allContracts?.length > 0) {
          contracts = window.appState.allContracts;
          console.log(`[PermissionsUI]  Usando ${contracts.length} contratos do appState`);
        }

        // PRIORIDADE 3: Aguarda evento contracts-loaded (máx 5s)
        if (contracts.length === 0) {
          contracts = await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              // Timeout - usa appState se disponível agora
              if (window.appState?.allContracts?.length > 0) {
                console.log(`[PermissionsUI]  Timeout, mas appState disponível: ${window.appState.allContracts.length} contratos`);
                resolve(window.appState.allContracts);
              } else {
                console.warn('[PermissionsUI]  Timeout aguardando contratos, usando lista vazia');
                resolve([]);
              }
            }, 5000);

            // Listener para evento de contratos carregados
            const handler = () => {
              clearTimeout(timeout);
              window.removeEventListener('contracts-loaded', handler);
              if (window.appState?.allContracts?.length > 0) {
                console.log(`[PermissionsUI]  Evento contracts-loaded: ${window.appState.allContracts.length} contratos`);
                resolve(window.appState.allContracts);
              } else {
                resolve([]);
              }
            };
            window.addEventListener('contracts-loaded', handler);

            // Verifica novamente caso tenha carregado enquanto configurava o listener
            if (window.appState?.allContracts?.length > 0) {
              clearTimeout(timeout);
              window.removeEventListener('contracts-loaded', handler);
              console.log(`[PermissionsUI]  appState disponível após setup: ${window.appState.allContracts.length} contratos`);
              resolve(window.appState.allContracts);
            }
          });
        }

        // Extrai vendedores únicos
        const vendorsSet = new Set();
        contracts.forEach(contract => {
          const vendor = contract.vendedorConstrutora;
          if (vendor) vendorsSet.add(vendor);
        });

        return Array.from(vendorsSet).sort();
      }, 'vendors');

      this.vendorsList = cached || [];
    } catch (error) {
      console.error(' Erro ao carregar vendedores:', error);
      this.vendorsList = [];
    }
  }

  /**
   * Carrega lista de workflows
   */
  async loadWorkflows() {
    try {
      const workflowsSnapshot = await db.collection('workflows').get();
      this.workflowsList = workflowsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Se não houver workflows cadastrados, usa padrões
      if (this.workflowsList.length === 0) {
        this.workflowsList = [
          { id: 'individual', name: 'Processo Individual' },
          { id: 'associativo', name: 'Processo Associativo' }
        ];
      }
    } catch (error) {
      console.error(' Erro ao carregar workflows:', error);
      this.workflowsList = [
        { id: 'individual', name: 'Processo Individual' },
        { id: 'associativo', name: 'Processo Associativo' }
      ];
    }
  }

  /**
   * Carrega lista de status
   */
  async loadStatus() {
    try {
      const statusSnapshot = await db.collection('statusConfig').get();
      this.statusList = statusSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch (error) {
      console.error(' Erro ao carregar status:', error);
      this.statusList = [];
    }
  }

  /**
   * Renderiza lista de usuários
   */
  async renderUsersList() {
    const container = document.getElementById('permissions-users-list');
    if (!container) return;

    container.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary" role="status"></div></div>';

    try {
      const permissionsList = await permissionsService.listAllUserPermissions();
      const permissionsMap = new Map(permissionsList.map(p => [p.uid, p]));

      let html = '';

      for (const user of this.allUsers) {
        const perms = permissionsMap.get(user.uid) || {
          role: PERMISSION_ROLES.ANALYST,
          allowedWorkflows: [],
          allowedVendors: []
        };

        const roleBadge = this.getRoleBadge(perms.role);
        const workflowsCount = perms.allowedWorkflows?.length || 0;
        const vendorsCount = perms.allowedVendors?.length || 0;

        html += `
          <div class="card mb-2">
            <div class="card-body p-3">
              <div class="row align-items-center">
                <div class="col-md-4">
                  <h6 class="mb-1">${this.escapeHtml(user.displayName || user.email || 'Sem nome')}</h6>
                  <small class="text-muted">${this.escapeHtml(user.email || '')}</small>
                </div>
                <div class="col-md-2">
                  ${roleBadge}
                </div>
                <div class="col-md-3">
                  <small class="text-muted d-block">
                    <i class="bi bi-diagram-3"></i> ${workflowsCount === 0 ? 'Todos' : workflowsCount} workflow(s)
                  </small>
                  <small class="text-muted d-block">
                    <i class="bi bi-building"></i> ${vendorsCount === 0 ? 'Todos' : vendorsCount} vendedor(es)
                  </small>
                </div>
                <div class="col-md-3 text-end">
                  <button class="btn btn-sm btn-outline-primary" data-action="edit-permissions" data-uid="${user.uid}">
                    <i class="bi bi-pencil-square"></i> Editar
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      if (this.allUsers.length === 0) {
        html = '<p class="text-center text-muted p-4">Nenhum usuário encontrado</p>';
      }

      container.innerHTML = html;

      // Atualiza contador
      const countBadge = document.getElementById('users-count');
      if (countBadge) {
        countBadge.textContent = `${this.allUsers.length} usuário${this.allUsers.length !== 1 ? 's' : ''}`;
      }
    } catch (error) {
      console.error(' Erro ao renderizar lista:', error);
      container.innerHTML = '<p class="text-center text-danger p-4">Erro ao carregar usuários</p>';
    }
  }

  /**
   * Retorna badge HTML para role
   */
  getRoleBadge(role) {
    const badges = {
      [PERMISSION_ROLES.SUPER_ADMIN]: '<span class="badge bg-danger">Super Admin</span>',
      [PERMISSION_ROLES.ADMIN]: '<span class="badge bg-primary">Admin</span>',
      [PERMISSION_ROLES.MANAGER]: '<span class="badge bg-success">Gerente</span>',
      [PERMISSION_ROLES.ANALYST]: '<span class="badge bg-info">Analista</span>',
      [PERMISSION_ROLES.VIEWER]: '<span class="badge bg-secondary">Visualizador</span>',
      [PERMISSION_ROLES.CUSTOM]: '<span class="badge bg-warning">Personalizado</span>'
    };
    
    return badges[role] || '<span class="badge bg-secondary">Desconhecido</span>';
  }

  /**
   * Abre modal de edição de permissões
   */
  async openEditModal(uid) {
    this.selectedUserId = uid;
    
    const user = this.allUsers.find(u => u.uid === uid);
    if (!user) {
      UI.showNotification('Usuário não encontrado', 'error');
      return;
    }

    const perms = await permissionsService.getUserPermissions(uid);
    
    // Preenche modal
    document.getElementById('perm-edit-user-name').textContent = user.displayName || user.email;
    document.getElementById('perm-edit-user-email').textContent = user.email;
    document.getElementById('perm-edit-role').value = perms.role || PERMISSION_ROLES.ANALYST;

    // Renderiza checkboxes de módulos
    this.renderModulesSection(perms);
    
    // Renderiza checkboxes de campos
    this.renderFieldsSection(perms);
    
    // Renderiza filtros
    this.renderFiltersSection(perms);
    
    // Exibe/oculta seções avançadas baseado no role
    this.toggleAdvancedSections(perms.role);

    // Abre modal
    const modal = new bootstrap.Modal(document.getElementById('permissions-edit-modal'));
    modal.show();
  }

  /**
   * Renderiza seção de módulos
   */
  renderModulesSection(perms) {
    const container = document.getElementById('perm-modules-list');
    if (!container) return;

    let html = '';
    
    for (const [moduleKey, moduleName] of Object.entries({
      [PERMISSION_MODULES.CONTRACTS]: 'Contratos',
      [PERMISSION_MODULES.DASHBOARD]: 'Dashboard',
      [PERMISSION_MODULES.REPORTS]: 'Relatórios',
      [PERMISSION_MODULES.WHATSAPP]: 'WhatsApp',
      [PERMISSION_MODULES.CALENDAR]: 'Calendário',
      [PERMISSION_MODULES.PENDENCIAS]: 'Pendências',
      [PERMISSION_MODULES.USERS]: 'Usuários',
      [PERMISSION_MODULES.STATUS]: 'Status',
      [PERMISSION_MODULES.WORKFLOWS]: 'Workflows',
      [PERMISSION_MODULES.AGENCIAS]: 'Agências',
      [PERMISSION_MODULES.CARTORIOS]: 'Cartórios',
      [PERMISSION_MODULES.BACKUPS]: 'Backups'
    })) {
      const modulePerms = perms.modules?.[moduleKey] || [];
      
      html += `
        <div class="mb-3 p-3 border rounded">
          <h6 class="mb-2"><i class="bi bi-folder"></i> ${moduleName}</h6>
          <div class="row">
      `;
      
      for (const action of Object.values(PERMISSION_ACTIONS)) {
        const checked = modulePerms.includes(action) ? 'checked' : '';
        const actionLabel = this.getActionLabel(action);
        
        html += `
          <div class="col-md-4">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" 
                id="perm_${moduleKey}_${action}" 
                data-module="${moduleKey}" 
                data-action="${action}"
                ${checked}>
              <label class="form-check-label" for="perm_${moduleKey}_${action}">
                ${actionLabel}
              </label>
            </div>
          </div>
        `;
      }
      
      html += `
          </div>
        </div>
      `;
    }
    
    container.innerHTML = html;
  }

  /**
   * Renderiza seção de campos
   */
  renderFieldsSection(perms) {
    const container = document.getElementById('perm-fields-list');
    if (!container) return;

    let html = '<table class="table table-sm"><thead><tr><th>Campo</th><th>Visualizar</th><th>Editar</th></tr></thead><tbody>';
    
    for (const [fieldKey, fieldName] of Object.entries({
      [CONTRACT_FIELDS.NUMERO_CONTRATO]: 'Número do Contrato',
      [CONTRACT_FIELDS.NOME_CLIENTE]: 'Nome do Cliente',
      [CONTRACT_FIELDS.CPF]: 'CPF',
      [CONTRACT_FIELDS.VENDEDOR_CONSTRUTORA]: 'Vendedor/Construtora',
      [CONTRACT_FIELDS.STATUS]: 'Status',
      [CONTRACT_FIELDS.WORKFLOW_ID]: 'Workflow',
      [CONTRACT_FIELDS.DATA_ENTRADA]: 'Data de Entrada',
      [CONTRACT_FIELDS.DATA_VENCIMENTO]: 'Data de Vencimento',
      [CONTRACT_FIELDS.DATA_REGISTRO]: 'Data de Registro',
      [CONTRACT_FIELDS.VALOR_CONTRATO]: 'Valor do Contrato',
      [CONTRACT_FIELDS.VALOR_FINANCIAMENTO]: 'Valor do Financiamento',
      [CONTRACT_FIELDS.AGENCIA]: 'Agência',
      [CONTRACT_FIELDS.CARTORIO]: 'Cartório',
      [CONTRACT_FIELDS.OBSERVACOES]: 'Observações',
      [CONTRACT_FIELDS.ANEXOS]: 'Anexos',
      [CONTRACT_FIELDS.HISTORICO]: 'Histórico'
    })) {
      const fieldPerm = perms.fields?.[fieldKey] || { view: true, edit: false };
      
      html += `
        <tr>
          <td>${fieldName}</td>
          <td>
            <input type="checkbox" class="form-check-input" 
              data-field="${fieldKey}" 
              data-perm="view"
              ${fieldPerm.view ? 'checked' : ''}>
          </td>
          <td>
            <input type="checkbox" class="form-check-input" 
              data-field="${fieldKey}" 
              data-perm="edit"
              ${fieldPerm.edit ? 'checked' : ''}>
          </td>
        </tr>
      `;
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  /**
   * Renderiza seção de filtros
   */
  renderFiltersSection(perms) {
    // Workflows
    const workflowsContainer = document.getElementById('perm-workflows-list');
    if (workflowsContainer) {
      let html = '';
      for (const workflow of this.workflowsList) {
        const checked = perms.allowedWorkflows?.includes(workflow.id) ? 'checked' : '';
        html += `
          <div class="form-check">
            <input class="form-check-input" type="checkbox" 
              id="workflow_${workflow.id}" 
              data-workflow="${workflow.id}"
              ${checked}>
            <label class="form-check-label" for="workflow_${workflow.id}">
              ${this.escapeHtml(workflow.name)}
            </label>
          </div>
        `;
      }
      workflowsContainer.innerHTML = html || '<p class="text-muted small">Nenhum workflow disponível</p>';
    }

    // Vendedores
    const vendorsContainer = document.getElementById('perm-vendors-list');
    if (vendorsContainer) {
      let html = '';
      for (const vendor of this.vendorsList) {
        const checked = perms.allowedVendors?.includes(vendor) ? 'checked' : '';
        html += `
          <div class="form-check">
            <input class="form-check-input" type="checkbox" 
              id="vendor_${this.sanitizeId(vendor)}" 
              data-vendor="${this.escapeHtml(vendor)}"
              ${checked}>
            <label class="form-check-label" for="vendor_${this.sanitizeId(vendor)}">
              ${this.escapeHtml(vendor)}
            </label>
          </div>
        `;
      }
      vendorsContainer.innerHTML = html || '<p class="text-muted small">Nenhum vendedor encontrado</p>';
    }

    // Status
    const statusContainer = document.getElementById('perm-status-list');
    if (statusContainer) {
      let html = '';
      for (const status of this.statusList) {
        const checked = perms.allowedStatus?.includes(status.text) ? 'checked' : '';
        html += `
          <div class="form-check">
            <input class="form-check-input" type="checkbox" 
              id="status_${this.sanitizeId(status.text)}" 
              data-status="${this.escapeHtml(status.text)}"
              ${checked}>
            <label class="form-check-label" for="status_${this.sanitizeId(status.text)}">
              ${this.escapeHtml(status.text)}
            </label>
          </div>
        `;
      }
      statusContainer.innerHTML = html || '<p class="text-muted small">Nenhum status disponível</p>';
    }
  }

  /**
   * Mostra/oculta seções avançadas baseado no role
   */
  toggleAdvancedSections(role) {
    const advancedSections = document.querySelectorAll('.permissions-advanced-section');
    const modulesTab = document.getElementById('modules-tab');
    const fieldsTab = document.getElementById('fields-tab');
    
    // Se for role pré-definido (não CUSTOM), desabilita abas de módulos e campos
    if (role !== PERMISSION_ROLES.CUSTOM) {
      advancedSections.forEach(section => {
        section.classList.add('d-none');
      });
      
      // Desabilita abas
      if (modulesTab) modulesTab.classList.add('disabled');
      if (fieldsTab) fieldsTab.classList.add('disabled');
      
      // Ativa a aba de filtros
      const filtersTab = document.getElementById('filters-tab');
      if (filtersTab) filtersTab.click();
    } else {
      advancedSections.forEach(section => {
        section.classList.remove('d-none');
      });
      
      // Habilita abas
      if (modulesTab) modulesTab.classList.remove('disabled');
      if (fieldsTab) fieldsTab.classList.remove('disabled');
    }
  }

  /**
   * Salva permissões editadas
   */
  async savePermissions() {
    if (!this.selectedUserId) return;

    try {
      const role = document.getElementById('perm-edit-role').value;
      
      let permissions = {
        role
      };

      // Se for CUSTOM, coleta permissões detalhadas
      if (role === PERMISSION_ROLES.CUSTOM) {
        permissions.modules = this.collectModulePermissions();
        permissions.fields = this.collectFieldPermissions();
      }

      // Sempre coleta filtros
      permissions.allowedWorkflows = this.collectSelectedWorkflows();
      permissions.allowedVendors = this.collectSelectedVendors();
      permissions.allowedStatus = this.collectSelectedStatus();

      await permissionsService.updateUserPermissions(this.selectedUserId, permissions);
      
      UI.showNotification('Permissões atualizadas com sucesso!', 'success');
      
      // Fecha modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('permissions-edit-modal'));
      if (modal) modal.hide();
      
      // Atualiza lista
      await this.renderUsersList();
      
    } catch (error) {
      console.error(' Erro ao salvar permissões:', error);
      UI.showNotification('Erro ao salvar permissões: ' + error.message, 'error');
    }
  }

  /**
   * Coleta permissões de módulos do form
   */
  collectModulePermissions() {
    const modules = {};
    
    document.querySelectorAll('#perm-modules-list input[type="checkbox"]').forEach(checkbox => {
      const module = checkbox.dataset.module;
      const action = checkbox.dataset.action;
      
      if (checkbox.checked) {
        if (!modules[module]) modules[module] = [];
        modules[module].push(action);
      }
    });
    
    return modules;
  }

  /**
   * Coleta permissões de campos do form
   */
  collectFieldPermissions() {
    const fields = {};
    
    document.querySelectorAll('#perm-fields-list input[type="checkbox"]').forEach(checkbox => {
      const field = checkbox.dataset.field;
      const perm = checkbox.dataset.perm; // 'view' ou 'edit'
      
      if (!fields[field]) {
        fields[field] = { view: false, edit: false };
      }
      
      fields[field][perm] = checkbox.checked;
    });
    
    return fields;
  }

  /**
   * Coleta workflows selecionados
   */
  collectSelectedWorkflows() {
    const selected = [];
    document.querySelectorAll('#perm-workflows-list input[type="checkbox"]:checked').forEach(checkbox => {
      selected.push(checkbox.dataset.workflow);
    });
    return selected;
  }

  /**
   * Coleta vendedores selecionados
   */
  collectSelectedVendors() {
    const selected = [];
    document.querySelectorAll('#perm-vendors-list input[type="checkbox"]:checked').forEach(checkbox => {
      selected.push(checkbox.dataset.vendor);
    });
    return selected;
  }

  /**
   * Coleta status selecionados
   */
  collectSelectedStatus() {
    const selected = [];
    document.querySelectorAll('#perm-status-list input[type="checkbox"]:checked').forEach(checkbox => {
      selected.push(checkbox.dataset.status);
    });
    return selected;
  }

  /**
   * Configura event listeners
   */
  setupEventListeners() {
    // Botão editar permissões
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="edit-permissions"]');
      if (btn) {
        const uid = btn.dataset.uid;
        this.openEditModal(uid);
      }
    });

    // Botão salvar permissões
    const saveBtn = document.getElementById('btn-save-permissions');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.savePermissions());
    }

    // Mudança de role - mostra/oculta seções
    const roleSelect = document.getElementById('perm-edit-role');
    if (roleSelect) {
      roleSelect.addEventListener('change', (e) => {
        this.toggleAdvancedSections(e.target.value);
      });
    }

    // Botão refresh lista
    const refreshBtn = document.getElementById('btn-refresh-permissions');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.renderUsersList());
    }
  }

  /**
   * Retorna label amigável para ação
   */
  getActionLabel(action) {
    const labels = {
      [PERMISSION_ACTIONS.VIEW]: 'Visualizar',
      [PERMISSION_ACTIONS.CREATE]: 'Criar',
      [PERMISSION_ACTIONS.EDIT]: 'Editar',
      [PERMISSION_ACTIONS.DELETE]: 'Excluir',
      [PERMISSION_ACTIONS.EXPORT]: 'Exportar',
      [PERMISSION_ACTIONS.IMPORT]: 'Importar'
    };
    return labels[action] || action;
  }

  /**
   * Escapa HTML para prevenir XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  /**
   * Sanitiza string para usar como ID
   */
  sanitizeId(str) {
    return String(str || '').replace(/[^a-zA-Z0-9]/g, '_');
  }
}

// Exporta instância singleton
const permissionsUI = new PermissionsUI();

// Expõe globalmente para debug
if (typeof window !== 'undefined') {
  window.permissionsUI = permissionsUI;
}

export default permissionsUI;
