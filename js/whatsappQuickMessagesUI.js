/**
 * whatsappQuickMessagesUI.js
 * Interface de gerenciamento de Mensagens Rápidas para WhatsApp
 *
 * Funcionalidades:
 * - Tabela de mensagens rápidas
 * - Modal de criação/edição
 * - Preview de variáveis em tempo real
 * - Filtros por departamento e ordenação
 * - Integração com whatsappQuickMessages.js (backend)
 * 
 * Data: 31/10/2025
 */

import { auth } from './auth.js';

class WhatsAppQuickMessagesUI {
  constructor() {
    this.backend = null; // Referência ao backend (window.__WHATSAPP_QUICK_MESSAGES__)
    this.currentEditingId = null;
    this.allMessages = [];
    this.filteredMessages = [];
    
    // Contexto de exemplo para preview
    this.previewContext = {
      customerName: 'João Silva',
      agentName: 'Maria Santos',
      department: 'Aprovação',
      date: new Date().toLocaleDateString('pt-BR'),
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    
    // Elementos do DOM
    this.elements = {
      // Lista
      tableBody: null,
      loadingEl: null,
      emptyStateEl: null,
      tableContainer: null,
      searchInput: null,
      departmentFilter: null,
      sortSelect: null,
      
      // Modal de formulário
      modal: null,
      form: null,
      modalTitle: null,
      formId: null,
      formShortcut: null,
      formDepartment: null,
      formText: null,
      previewEl: null
    };
  }

  /**
   * Inicializa a UI
   */
  async init() {
    try {
      console.log('[WhatsAppQuickMessagesUI] Inicializando...');
      
      // Verificar autenticação
      const user = auth.currentUser;
      if (!user) {
        console.warn('[WhatsAppQuickMessagesUI] Usuário não autenticado');
        return;
      }

      // Esperar backend estar disponível
      await this.waitForBackend();
      
      // Inicializar elementos do DOM
      this.initElements();
      
      // Configurar event listeners
      this.setupEventListeners();
      
      // Carregar mensagens iniciais
      await this.loadMessages();
      
      console.log('[WhatsAppQuickMessagesUI]  Inicializado com sucesso');
      return true;
    } catch (error) {
      console.error('[WhatsAppQuickMessagesUI] Erro na inicialização:', error);
      return false;
    }
  }

  /**
   * Aguarda o backend estar disponível
   */
  async waitForBackend(maxAttempts = 10, delayMs = 500) {
    for (let i = 0; i < maxAttempts; i++) {
      if (window.__WHATSAPP_QUICK_MESSAGES__) {
        this.backend = window.__WHATSAPP_QUICK_MESSAGES__;
        console.log('[WhatsAppQuickMessagesUI] Backend conectado');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    throw new Error('Backend de quick messages não disponível');
  }

  /**
   * Inicializa referências aos elementos do DOM
   */
  initElements() {
    // Lista
    this.elements.tableBody = document.getElementById('quick-messages-list');
    this.elements.loadingEl = document.getElementById('quick-messages-loading');
    this.elements.emptyStateEl = document.getElementById('quick-messages-empty-state');
    this.elements.tableContainer = document.getElementById('quick-messages-table-container');
    this.elements.searchInput = document.getElementById('quick-messages-search-input');
    this.elements.departmentFilter = document.getElementById('quick-messages-department-filter');
    this.elements.sortSelect = document.getElementById('quick-messages-sort-select');
    
    // Modal
    this.elements.modal = document.getElementById('modal-quick-message-form');
    this.elements.form = document.getElementById('quick-message-form');
    this.elements.modalTitle = document.getElementById('modal-quick-message-form-title');
    this.elements.formId = document.getElementById('quick-message-form-id');
    this.elements.formShortcut = document.getElementById('quick-message-form-shortcut');
    this.elements.formDepartment = document.getElementById('quick-message-form-department');
    this.elements.formText = document.getElementById('quick-message-form-text');
    this.elements.previewEl = document.getElementById('quick-message-preview');
  }

  /**
   * Configura event listeners
   */
  setupEventListeners() {
    // Busca em tempo real
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', () => this.filterMessages());
    }
    
    // Filtro de departamento
    if (this.elements.departmentFilter) {
      this.elements.departmentFilter.addEventListener('change', () => this.filterMessages());
    }
    
    // Ordenação
    if (this.elements.sortSelect) {
      this.elements.sortSelect.addEventListener('change', () => this.filterMessages());
    }
    
    // Formulário
    if (this.elements.form) {
      this.elements.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
    }
    
    // Preview em tempo real
    if (this.elements.formText) {
      this.elements.formText.addEventListener('input', () => this.updatePreview());
    }
    
    // Normalizar atalho (lowercase, sem espaços)
    if (this.elements.formShortcut) {
      this.elements.formShortcut.addEventListener('input', (e) => {
        e.target.value = e.target.value.toLowerCase().replace(/\s+/g, '-');
      });
    }
    
    // Reset ao fechar modal
    if (this.elements.modal) {
      this.elements.modal.addEventListener('hidden.bs.modal', () => this.resetForm());
    }
  }

  /**
   * Carrega mensagens do backend
   */
  async loadMessages() {
    try {
      this.showLoading(true);
      
      // Buscar todas as mensagens (incluindo inativas)
      this.allMessages = await this.backend.listQuickMessages(null, false);
      
      console.log(`[WhatsAppQuickMessagesUI] ${this.allMessages.length} mensagens carregadas`);
      
      // Aplicar filtros
      this.filterMessages();
      
    } catch (error) {
      console.error('[WhatsAppQuickMessagesUI] Erro ao carregar mensagens:', error);
      this.showError('Erro ao carregar mensagens. Tente novamente.');
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Filtra e ordena mensagens
   */
  filterMessages() {
    const searchTerm = this.elements.searchInput?.value.toLowerCase() || '';
    const department = this.elements.departmentFilter?.value || '';
    const sortBy = this.elements.sortSelect?.value || 'recent';
    
    // Filtrar
    this.filteredMessages = this.allMessages.filter(msg => {
      // Busca
      const matchesSearch = !searchTerm || 
        msg.shortcut.toLowerCase().includes(searchTerm) ||
        msg.text.toLowerCase().includes(searchTerm);
      
      // Departamento
      let matchesDepartment = true;
      if (department) {
        if (department === '_global') {
          matchesDepartment = !msg.department || msg.department === '';
        } else {
          matchesDepartment = msg.department === department;
        }
      }
      
      return matchesSearch && matchesDepartment;
    });
    
    // Ordenar
    this.filteredMessages.sort((a, b) => {
      switch (sortBy) {
        case 'usage':
          return (b.usageCount || 0) - (a.usageCount || 0);
        case 'shortcut':
          return a.shortcut.localeCompare(b.shortcut);
        case 'recent':
        default:
          return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
      }
    });
    
    this.renderMessages();
  }

  /**
   * Renderiza lista de mensagens
   */
  renderMessages() {
    console.log('[WhatsAppQuickMessagesUI] renderMessages() chamado');
    console.log('[WhatsAppQuickMessagesUI] tableBody existe?', !!this.elements.tableBody);
    console.log('[WhatsAppQuickMessagesUI] filteredMessages.length:', this.filteredMessages.length);
    
    if (!this.elements.tableBody) {
      console.warn('[WhatsAppQuickMessagesUI] tableBody não encontrado!');
      return;
    }
    
    // Estado vazio
    if (this.filteredMessages.length === 0) {
      console.log('[WhatsAppQuickMessagesUI] Exibindo estado vazio');
      if (this.elements.tableContainer) {
        this.elements.tableContainer.style.display = 'none';
      }
      if (this.elements.emptyStateEl) {
        this.elements.emptyStateEl.style.display = 'block';
      }
      return;
    }
    
    // Exibir tabela
    console.log('[WhatsAppQuickMessagesUI] Renderizando', this.filteredMessages.length, 'mensagens');
    if (this.elements.tableContainer) {
      this.elements.tableContainer.style.display = 'block';
    }
    if (this.elements.emptyStateEl) {
      this.elements.emptyStateEl.style.display = 'none';
    }
    
    // Renderizar linhas
    const html = this.filteredMessages.map(msg => this.renderMessageRow(msg)).join('');
    console.log('[WhatsAppQuickMessagesUI] HTML gerado (primeiros 200 chars):', html.substring(0, 200));
    this.elements.tableBody.innerHTML = html;
    console.log('[WhatsAppQuickMessagesUI] Linhas renderizadas no DOM');
  }

  /**
   * Renderiza linha individual de mensagem
   */
  renderMessageRow(msg) {
    const departmentBadge = msg.department 
      ? `<span class="badge bg-info">${this.escapeHtml(msg.department)}</span>`
      : '<span class="badge bg-secondary">Global</span>';
    
    const textPreview = msg.text.length > 80 
      ? this.escapeHtml(msg.text.substring(0, 80)) + '...'
      : this.escapeHtml(msg.text);
    
    const statusIcon = msg.isActive 
      ? '<i class="bi bi-check-circle-fill text-success" title="Ativa"></i>'
      : '<i class="bi bi-x-circle-fill text-secondary" title="Inativa"></i>';
    
    return `
      <tr>
        <td>
          <code>/${this.escapeHtml(msg.shortcut)}</code>
          ${statusIcon}
        </td>
        <td>
          <small>${textPreview}</small>
          ${msg.variables && msg.variables.length > 0 ? `
            <div class="mt-1">
              ${msg.variables.map(v => `<span class="badge bg-light text-dark border" style="font-size: 0.7rem;">{${v}}</span>`).join(' ')}
            </div>
          ` : ''}
        </td>
        <td>${departmentBadge}</td>
        <td class="text-center">
          <span class="badge bg-secondary">${msg.usageCount || 0}</span>
        </td>
        <td class="text-center">
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-primary" 
                    onclick="window.__WHATSAPP_QUICK_MESSAGES_UI__.openEditModal('${msg.id}')"
                    title="Editar">
              <i class="bi bi-pencil"></i>
            </button>
            <button type="button" class="btn btn-outline-danger" 
                    onclick="window.__WHATSAPP_QUICK_MESSAGES_UI__.confirmDelete('${msg.id}', '${this.escapeHtml(msg.shortcut)}')"
                    title="Excluir">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  /**
   * Abre modal para criar nova mensagem
   */
  openCreateModal() {
    this.currentEditingId = null;
    this.resetForm();
    
    if (this.elements.modalTitle) {
      this.elements.modalTitle.innerHTML = '<i class="bi bi-lightning me-2"></i>Nova Mensagem Rápida';
    }
    
    // Abrir modal
    const modalInstance = new bootstrap.Modal(this.elements.modal, { backdrop: true });
    modalInstance.show();
  }

  /**
   * Abre modal para editar mensagem existente
   */
  async openEditModal(messageId) {
    try {
      this.currentEditingId = messageId;
      
      // Buscar dados da mensagem
      const msg = this.allMessages.find(m => m.id === messageId);
      
      if (!msg) {
        if (window.uiHelpers) window.uiHelpers.showToast('Mensagem não encontrada', 'warning');
        else alert('Mensagem não encontrada');
        return;
      }
      
      // Preencher formulário
      this.elements.formId.value = msg.id;
      this.elements.formShortcut.value = msg.shortcut;
      this.elements.formDepartment.value = msg.department || '';
      this.elements.formText.value = msg.text;
      
      // Atualizar preview
      this.updatePreview();
      
      // Atualizar título
      if (this.elements.modalTitle) {
        this.elements.modalTitle.innerHTML = '<i class="bi bi-pencil me-2"></i>Editar Mensagem Rápida';
      }
      
      // Abrir modal
      const modalInstance = new bootstrap.Modal(this.elements.modal, { backdrop: true });
      modalInstance.show();
      
    } catch (error) {
      console.error('[WhatsAppQuickMessagesUI] Erro ao abrir modal de edição:', error);
      if (window.uiHelpers) window.uiHelpers.showToast('Erro ao carregar dados da mensagem', 'error');
      else alert('Erro ao carregar dados da mensagem');
    }
  }

  /**
   * Atualiza preview de mensagem com variáveis substituídas
   */
  updatePreview() {
    if (!this.elements.previewEl || !this.elements.formText) return;
    
    const text = this.elements.formText.value;
    
    if (!text.trim()) {
      this.elements.previewEl.textContent = 'Digite uma mensagem para ver o preview...';
      this.elements.previewEl.style.fontStyle = 'italic';
      this.elements.previewEl.style.color = '#6c757d';
      return;
    }
    
    // Processar variáveis
    const processed = this.backend.processMessageText(text, this.previewContext);
    
    this.elements.previewEl.textContent = processed;
    this.elements.previewEl.style.fontStyle = 'normal';
    this.elements.previewEl.style.color = 'inherit';
  }

  /**
   * Processa submissão do formulário
   */
  async handleFormSubmit(e) {
    e.preventDefault();
    
    try {
      const shortcut = this.elements.formShortcut.value.trim().toLowerCase();
      const department = this.elements.formDepartment.value.trim() || null;
      const text = this.elements.formText.value.trim();
      
      if (!shortcut) {
        if (window.uiHelpers) window.uiHelpers.showToast('Atalho é obrigatório', 'warning');
        else alert('Atalho é obrigatório');
        return;
      }
      
      if (!text) {
        if (window.uiHelpers) window.uiHelpers.showToast('Texto da mensagem é obrigatório', 'warning');
        else alert('Texto da mensagem é obrigatório');
        return;
      }
      
      // Validar atalho (apenas letras minúsculas, números e hífen)
      if (!/^[a-z0-9-]+$/.test(shortcut)) {
        if (window.uiHelpers) window.uiHelpers.showToast('Atalho deve conter apenas letras minúsculas, números e hífen', 'warning');
        else alert('Atalho deve conter apenas letras minúsculas, números e hífen');
        return;
      }
      
      // Criar ou atualizar
      if (this.currentEditingId) {
        await this.backend.updateQuickMessage(this.currentEditingId, {
          shortcut,
          text,
          department
        });
        console.log(`[WhatsAppQuickMessagesUI] Mensagem atualizada: /${shortcut}`);
      } else {
        await this.backend.createQuickMessage(shortcut, text, department);
        console.log(`[WhatsAppQuickMessagesUI] Mensagem criada: /${shortcut}`);
      }
      
      // Fechar modal
      const modalInstance = bootstrap.Modal.getInstance(this.elements.modal);
      modalInstance.hide();
      
      // Recarregar lista
      await this.loadMessages();
      
    } catch (error) {
      console.error('[WhatsAppQuickMessagesUI] Erro ao salvar mensagem:', error);
      if (window.uiHelpers) window.uiHelpers.showToast('Erro ao salvar mensagem: ' + error.message, 'error');
      else alert('Erro ao salvar mensagem: ' + error.message);
    }
  }

  /**
   * Confirma exclusão de mensagem
   */
  async confirmDelete(messageId, shortcut) {
    const confirmed = window.uiHelpers
      ? await window.uiHelpers.confirmDelete(`a mensagem rápida "/${shortcut}"`)
      : confirm(
          `Tem certeza que deseja excluir a mensagem rápida "/${shortcut}"?\n\n` +
          'Esta ação não pode ser desfeita.'
        );
    
    if (!confirmed) return;
    
    try {
      await this.backend.deleteQuickMessage(messageId);
      console.log(`[WhatsAppQuickMessagesUI] Mensagem excluída: /${shortcut}`);
      
      // Recarregar lista
      await this.loadMessages();
      
    } catch (error) {
      console.error('[WhatsAppQuickMessagesUI] Erro ao excluir mensagem:', error);
      if (window.uiHelpers) window.uiHelpers.showToast('Erro ao excluir mensagem: ' + error.message, 'error');
      else alert('Erro ao excluir mensagem: ' + error.message);
    }
  }

  /**
   * Reseta formulário
   */
  resetForm() {
    if (this.elements.form) {
      this.elements.form.reset();
    }
    this.currentEditingId = null;
    this.elements.formId.value = '';
    this.updatePreview();
  }

  /**
   * Exibe/oculta loading
   */
  showLoading(show) {
    if (this.elements.loadingEl) {
      this.elements.loadingEl.style.display = show ? 'block' : 'none';
    }
    if (this.elements.tableContainer) {
      this.elements.tableContainer.style.display = show ? 'none' : 'block';
    }
  }

  /**
   * Exibe mensagem de erro
   */
  showError(message) {
    console.error('[WhatsAppQuickMessagesUI]', message);
    if (window.uiHelpers) window.uiHelpers.showToast(message, 'error');
    else alert(message);
  }

  /**
   * Escapa HTML para prevenir XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Criar instância global
const whatsappQuickMessagesUI = new WhatsAppQuickMessagesUI();
window.__WHATSAPP_QUICK_MESSAGES_UI__ = whatsappQuickMessagesUI;

let bindingsApplied = false;

function applyBindingsIfPossible() {
  if (bindingsApplied) return true;

  const configModal = document.getElementById('modal-whatsapp-config');
  if (!configModal) return false;

  bindingsApplied = true;

  configModal.addEventListener('shown.bs.modal', async () => {
    // Inicializar apenas uma vez
    if (!whatsappQuickMessagesUI.elements.tableBody) {
      await whatsappQuickMessagesUI.init();
    }
  });

  // Recarregar ao trocar para aba de quick messages
  const quickMessagesTab = document.getElementById('whatsapp-quick-messages-tab');
  if (quickMessagesTab) {
    quickMessagesTab.addEventListener('shown.bs.tab', async () => {
      if (whatsappQuickMessagesUI.elements.tableBody) {
        await whatsappQuickMessagesUI.loadMessages();
      }
    });
  }

  return true;
}

function ensureBindings() {
  applyBindingsIfPossible();
}

// Auto-inicializar quando modal de config for aberto (compatível com injeção via módulos)
document.addEventListener('DOMContentLoaded', ensureBindings);
window.addEventListener('ui:components:rendered', ensureBindings);
if (window.__UI_COMPONENTS_RENDERED__) ensureBindings();

export { whatsappQuickMessagesUI, WhatsAppQuickMessagesUI };
