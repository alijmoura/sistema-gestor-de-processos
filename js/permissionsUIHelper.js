/**
 * @file permissionsUIHelper.js
 * @description Helper para aplicar permissões na interface de usuário
 * Oculta/desabilita campos e botões baseado nas permissões do usuário
 */

import { auth } from "./auth.js";
import permissionsService, {
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  CONTRACT_FIELDS
} from "./permissionsService.js";

class PermissionsUIHelper {
  constructor() {
    this.currentUserPermissions = null;
    this.initialized = false;
  }

  /**
   * Inicializa o helper carregando permissões do usuário atual
   */
  async init() {
    if (this.initialized) return;

    try {
      const user = auth.currentUser;
      if (!user) {
        console.warn(' Nenhum usuário autenticado para carregar permissões');
        return;
      }

      this.currentUserPermissions = await permissionsService.getUserPermissions(user.uid);
      this.initialized = true;

      // Aplica restrições admin-only imediatamente
      this.applyAdminOnlyRestrictions();

      if (window.__DEBUG__) {
        console.log(' PermissionsUIHelper inicializado:', this.currentUserPermissions);
      }
    } catch (error) {
      console.error(' Erro ao inicializar PermissionsUIHelper:', error);
    }
  }

  /**
   * Oculta elementos admin-only se usuário não for admin
   */
  applyAdminOnlyRestrictions() {
    // Verifica se usuário é admin (super_admin ou admin)
    const isAdmin = this.currentUserPermissions?.role === 'super_admin' ||
                    this.currentUserPermissions?.role === 'admin';

    if (!isAdmin) {
      // Oculta todos os elementos com classe admin-only
      const adminOnlyElements = document.querySelectorAll('.admin-only');
      adminOnlyElements.forEach(el => {
        this._hideElement(el);
      });

      // Configura observer para elementos dinâmicos
      this._observeAdminOnlyElements();

      if (window.__DEBUG__) {
        console.log(` ${adminOnlyElements.length} elemento(s) admin-only ocultados`);
      }
    }
  }

  /**
   * Observa o DOM para detectar novos elementos .admin-only adicionados dinamicamente
   * @private
   */
  _observeAdminOnlyElements() {
    const isAdmin = this.currentUserPermissions?.role === 'super_admin' ||
                    this.currentUserPermissions?.role === 'admin';

    if (isAdmin) return; // Admins podem ver tudo

    // Criar observer para detectar novos nós no DOM
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          // Verificar se o nó adicionado é um elemento
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Verificar se o elemento tem a classe admin-only
            if (node.classList && node.classList.contains('admin-only')) {
              this._hideElement(node);
              console.log(' Elemento admin-only dinâmico ocultado:', node.tagName, node.className);
            }

            // Verificar elementos filhos com classe admin-only
            const adminOnlyChildren = node.querySelectorAll('.admin-only');
            if (adminOnlyChildren.length > 0) {
              adminOnlyChildren.forEach(el => {
                this._hideElement(el);
              });
              console.log(` ${adminOnlyChildren.length} elemento(s) admin-only filho(s) ocultado(s)`);
            }
          }
        });
      });
    });

    // Observar todo o body para detectar mudanças
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log(' MutationObserver configurado para elementos admin-only');
  }

  /**
   * Verifica se usuário pode executar ação em módulo
   */
  can(module, action) {
    if (!this.currentUserPermissions) return true; // Fail-safe: permite se não carregou
    return permissionsService.can(this.currentUserPermissions, module, action);
  }

  /**
   * Verifica se usuário pode visualizar campo
   */
  canViewField(fieldName) {
    if (!this.currentUserPermissions) return true;
    return permissionsService.canViewField(this.currentUserPermissions, fieldName);
  }

  /**
   * Verifica se usuário pode editar campo
   */
  canEditField(fieldName) {
    if (!this.currentUserPermissions) return true;
    return permissionsService.canEditField(this.currentUserPermissions, fieldName);
  }

  /**
   * Oculta elemento se usuário não tem permissão
   * @param {string|Element} element - Seletor CSS ou elemento DOM
   * @param {string} module - Nome do módulo
   * @param {string} action - Ação necessária
   */
  hideIfNoCan(element, module, action) {
    if (!this.can(module, action)) {
      this._hideElement(element);
    }
  }

  /**
   * Desabilita elemento se usuário não tem permissão
   * @param {string|Element} element - Seletor CSS ou elemento DOM
   * @param {string} module - Nome do módulo
   * @param {string} action - Ação necessária
   */
  disableIfNoCan(element, module, action) {
    if (!this.can(module, action)) {
      this._disableElement(element);
    }
  }

  /**
   * Aplica permissões em formulário de contrato
   * @param {string|Element} formElement - Formulário ou seletor
   */
  applyContractFormPermissions(formElement) {
    const form = this._getElement(formElement);
    if (!form) return;

    // Mapeia campos do formulário para CONTRACT_FIELDS
    const fieldMappings = {
      numeroContrato: CONTRACT_FIELDS.NUMERO_CONTRATO,
      nomeCliente: CONTRACT_FIELDS.NOME_CLIENTE,
      cpf: CONTRACT_FIELDS.CPF,
      vendedorConstrutora: CONTRACT_FIELDS.VENDEDOR_CONSTRUTORA,
      status: CONTRACT_FIELDS.STATUS,
      workflowId: CONTRACT_FIELDS.WORKFLOW_ID,
      dataEntrada: CONTRACT_FIELDS.DATA_ENTRADA,
      dataVencimento: CONTRACT_FIELDS.DATA_VENCIMENTO,
      dataRegistro: CONTRACT_FIELDS.DATA_REGISTRO,
      valorContrato: CONTRACT_FIELDS.VALOR_CONTRATO,
      valorFinanciamento: CONTRACT_FIELDS.VALOR_FINANCIAMENTO,
      agencia: CONTRACT_FIELDS.AGENCIA,
      cartorio: CONTRACT_FIELDS.CARTORIO,
      observacoes: CONTRACT_FIELDS.OBSERVACOES
    };

    for (const [inputName, fieldKey] of Object.entries(fieldMappings)) {
      const input = form.querySelector(`[name="${inputName}"], #${inputName}`);

      if (input) {
        // Oculta se não pode visualizar
        if (!this.canViewField(fieldKey)) {
          this._hideElement(input.closest('.form-group, .mb-3, .col'));
        }
        // Desabilita se não pode editar
        else if (!this.canEditField(fieldKey)) {
          this._disableElement(input);

          // Adiciona visual feedback
          input.classList.add('bg-light');
          input.title = 'Você não tem permissão para editar este campo';
        }
      }
    }
  }

  /**
   * Aplica permissões em botões de ação
   */
  applyActionButtonsPermissions() {
    // Botões de criação
    const createButtons = document.querySelectorAll('[data-action="create"], .btn-create-contract, #btn-create-contract');
    if (!this.can(PERMISSION_MODULES.CONTRACTS, PERMISSION_ACTIONS.CREATE)) {
      createButtons.forEach(btn => this._hideElement(btn));
    }

    // Botões de edição
    const editButtons = document.querySelectorAll('[data-action="edit"], .btn-edit-contract');
    if (!this.can(PERMISSION_MODULES.CONTRACTS, PERMISSION_ACTIONS.EDIT)) {
      editButtons.forEach(btn => this._hideElement(btn));
    }

    // Botões de exclusão
    const deleteButtons = document.querySelectorAll('[data-action="delete"], .btn-delete-contract');
    if (!this.can(PERMISSION_MODULES.CONTRACTS, PERMISSION_ACTIONS.DELETE)) {
      deleteButtons.forEach(btn => this._hideElement(btn));
    }

    // Botões de exportação
    const exportButtons = document.querySelectorAll('[data-action="export"], .btn-export');
    if (!this.can(PERMISSION_MODULES.CONTRACTS, PERMISSION_ACTIONS.EXPORT)) {
      exportButtons.forEach(btn => this._hideElement(btn));
    }

    // Botões de importação
    const importButtons = document.querySelectorAll('[data-action="import"], .btn-import');
    if (!this.can(PERMISSION_MODULES.CONTRACTS, PERMISSION_ACTIONS.IMPORT)) {
      importButtons.forEach(btn => this._hideElement(btn));
    }
  }

  /**
   * Aplica permissões em módulos do menu/sidebar
   */
  applyModuleVisibility() {
    const moduleElements = {
      [PERMISSION_MODULES.CONTRACTS]: '[data-module="contracts"], [href="processos.html"], [href="#processos"]',
      [PERMISSION_MODULES.DASHBOARD]: '[data-module="dashboard"], [href="dashboard.html"], [href="#dashboard"]',
      [PERMISSION_MODULES.APROVACOES]: '[data-module="aprovacoes"], [href="aprovacao.html"], [href="#aprovacao"]',
      [PERMISSION_MODULES.REPORTS]: '[data-module="reports"], [href="relatorios.html"], [href="#relatorios"]',
      [PERMISSION_MODULES.WHATSAPP]: '[data-module="whatsapp"], [href="whatsapp.html"], [href="#whatsapp"]',
      [PERMISSION_MODULES.CALENDAR]: '[data-module="calendar"], [href="agenda.html"], [href="#agenda"]',
      [PERMISSION_MODULES.PENDENCIAS]: '[data-module="pendencias"], [href="#pendencias"]',
      [PERMISSION_MODULES.USERS]: '[data-module="users"], #panel-users',
      [PERMISSION_MODULES.BACKUPS]: '[data-module="backups"], #panel-backups'
    };

    for (const [module, selector] of Object.entries(moduleElements)) {
      if (!this.can(module, PERMISSION_ACTIONS.VIEW)) {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
          // Na sidebar principal, apenas itens explicitamente admin-only devem ser ocultados.
          const isSidebarElement = Boolean(el.closest('#sidebar'));
          const isAdminOnlySidebarElement = Boolean(
            el.closest('.admin-only')
            || el.closest('[data-admin-only-nav="true"]')
            || el.classList?.contains('admin-only')
            || el.getAttribute?.('data-admin-only-nav') === 'true'
          );

          if (isSidebarElement && !isAdminOnlySidebarElement) {
            return;
          }

          this._hideElement(el);
        });
      }
    }
  }

  /**
   * Filtra campos visíveis em uma linha de tabela de contrato
   * @param {Element} row - Linha da tabela (tr)
   */
  filterTableRow(row) {
    if (!row) return;

    const cells = row.querySelectorAll('td');
    const headers = row.closest('table')?.querySelectorAll('th');

    if (!headers) return;

    headers.forEach((header, index) => {
      const fieldName = header.dataset.field;

      if (fieldName && !this.canViewField(fieldName)) {
        // Oculta célula e cabeçalho
        this._hideElement(cells[index]);
        this._hideElement(header);
      }
    });
  }

  /**
   * Aplica todas as permissões na UI
   */
  applyAllPermissions() {
    this.applyActionButtonsPermissions();
    this.applyModuleVisibility();

    if (window.__DEBUG__) {
      console.log(' Permissões aplicadas na UI');
    }
  }

  /**
   * Oculta elemento
   * @private
   */
  _hideElement(element) {
    const el = this._getElement(element);
    if (el) {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * Desabilita elemento
   * @private
   */
  _disableElement(element) {
    const el = this._getElement(element);
    if (el) {
      el.disabled = true;
      el.setAttribute('readonly', 'true');
      el.classList.add('disabled');
    }
  }

  /**
   * Obtém elemento DOM
   * @private
   */
  _getElement(element) {
    if (typeof element === 'string') {
      return document.querySelector(element);
    }
    return element;
  }

  /**
   * Recarrega permissões do usuário
   */
  async refresh() {
    this.initialized = false;
    await this.init();
    this.applyAllPermissions();
  }
}

// Exporta instância singleton
const permissionsUIHelper = new PermissionsUIHelper();

// Expõe globalmente para debug
if (typeof window !== 'undefined') {
  window.permissionsUIHelper = permissionsUIHelper;
}

export default permissionsUIHelper;
