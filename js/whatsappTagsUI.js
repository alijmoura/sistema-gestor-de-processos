/**
 * whatsappTagsUI.js
 * Interface de gerenciamento de Tags para conversas WhatsApp
 *
 * Funcionalidades:
 * - Lista de tags com cards coloridos
 * - Modal de criação/edição de tags
 * - Busca e filtros
 * - Preview de cores
 * - Integração com whatsappTags.js (backend)
 *
 * Data: 31/10/2025
 */

import { auth } from './auth.js';

class WhatsAppTagsUI {
  constructor() {
    this.tagsBackend = null; // Referência ao backend (window.__WHATSAPP_TAGS__)
    this.currentEditingTagId = null;
    this.allTags = [];
    this.filteredTags = [];
    
    // Elementos do DOM
    this.elements = {
      // Lista
      listContainer: null,
      loadingEl: null,
      emptyStateEl: null,
      searchInput: null,
      filterSelect: null,
      
      // Modal de formulário
      modal: null,
      form: null,
      modalTitle: null,
      formId: null,
      formName: null,
      formColor: null,
      formDescription: null,
      colorPreview: null
    };
  }

  /**
   * Inicializa a UI de Tags
   */
  async init() {
    try {
  if (window.__DEBUG__) console.log('[WhatsAppTagsUI] Inicializando...');
      
      // Verificar autenticação
      const user = auth.currentUser;
      if (!user) {
        console.warn('[WhatsAppTagsUI] Usuário não autenticado');
        return;
      }

      // Esperar backend estar disponível
      await this.waitForBackend();
      
      // Inicializar elementos do DOM
      this.initElements();
      
      // Configurar event listeners
      this.setupEventListeners();
      
      // Carregar tags iniciais
      await this.loadTags();
      
  if (window.__DEBUG__) console.log('[WhatsAppTagsUI]  Inicializado com sucesso');
      return true;
    } catch (error) {
      console.error('[WhatsAppTagsUI] Erro na inicialização:', error);
      return false;
    }
  }

  /**
   * Aguarda o backend de tags estar disponível
   */
  async waitForBackend(maxAttempts = 10, delayMs = 500) {
    for (let i = 0; i < maxAttempts; i++) {
      if (window.__WHATSAPP_TAGS__) {
        this.tagsBackend = window.__WHATSAPP_TAGS__;
  if (window.__DEBUG__) console.log('[WhatsAppTagsUI] Backend conectado');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    throw new Error('Backend de tags não disponível');
  }

  /**
   * Inicializa referências aos elementos do DOM
   */
  initElements() {
    // Lista
    this.elements.listContainer = document.getElementById('tags-list-container');
    this.elements.loadingEl = document.getElementById('tags-loading');
    this.elements.emptyStateEl = document.getElementById('tags-empty-state');
    this.elements.searchInput = document.getElementById('tags-search-input');
    this.elements.filterSelect = document.getElementById('tags-filter-select');
    
    // Modal
    this.elements.modal = document.getElementById('modal-tag-form');
    this.elements.form = document.getElementById('tag-form');
    this.elements.modalTitle = document.getElementById('modal-tag-form-title');
    this.elements.formId = document.getElementById('tag-form-id');
    this.elements.formName = document.getElementById('tag-form-name');
    this.elements.formColor = document.getElementById('tag-form-color');
    this.elements.formDescription = document.getElementById('tag-form-description');
    this.elements.colorPreview = document.getElementById('tag-color-preview');
  }

  /**
   * Configura event listeners
   */
  setupEventListeners() {
    // Busca em tempo real
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', () => this.filterTags());
    }
    
    // Filtro de status
    if (this.elements.filterSelect) {
      this.elements.filterSelect.addEventListener('change', () => this.filterTags());
    }
    
    // Formulário de tag
    if (this.elements.form) {
      this.elements.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
    }
    
    // Preview de cor
    if (this.elements.formColor) {
      this.elements.formColor.addEventListener('input', () => this.updateColorPreview());
    }
    
    // Reset ao fechar modal
    if (this.elements.modal) {
      this.elements.modal.addEventListener('hidden.bs.modal', () => this.resetForm());
    }
  }

  /**
   * Carrega tags do backend
   */
  async loadTags() {
    try {
      this.showLoading(true);
      
      // Buscar todas as tags (incluindo inativas para gerenciamento)
      this.allTags = await this.tagsBackend.listTags(false);
      
      if (window.__DEBUG__) {
        console.log(`[WhatsAppTagsUI] ${this.allTags.length} tags carregadas`);
      }
      
      // Aplicar filtros
      this.filterTags();
      
    } catch (error) {
      console.error('[WhatsAppTagsUI] Erro ao carregar tags:', error);
      this.showError('Erro ao carregar tags. Tente novamente.');
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Filtra tags baseado na busca e filtro de status
   */
  filterTags() {
    const searchTerm = this.elements.searchInput?.value.toLowerCase() || '';
    const filterType = this.elements.filterSelect?.value || 'all';
    
    this.filteredTags = this.allTags.filter(tag => {
      // Filtro de busca
      const matchesSearch = !searchTerm || 
        tag.name.toLowerCase().includes(searchTerm) ||
        (tag.description || '').toLowerCase().includes(searchTerm);
      
      // Filtro de status
      let matchesFilter = true;
      if (filterType === 'active') {
        matchesFilter = tag.isActive === true;
      } else if (filterType === 'unused') {
        matchesFilter = (tag.usageCount || 0) === 0;
      }
      
      return matchesSearch && matchesFilter;
    });
    
    this.renderTags();
  }

  /**
   * Renderiza lista de tags
   */
  renderTags() {
    if (window.__DEBUG__) {
      console.log('[WhatsAppTagsUI] renderTags() chamado');
      console.log('[WhatsAppTagsUI] listContainer existe?', !!this.elements.listContainer);
      console.log('[WhatsAppTagsUI] filteredTags.length:', this.filteredTags.length);
    }
    
    if (!this.elements.listContainer) {
      console.warn('[WhatsAppTagsUI] listContainer não encontrado!');
      return;
    }
    
    // Estado vazio
    if (this.filteredTags.length === 0) {
      if (window.__DEBUG__) console.log('[WhatsAppTagsUI] Exibindo estado vazio');
      this.elements.listContainer.style.display = 'none';
      if (this.elements.emptyStateEl) {
        this.elements.emptyStateEl.style.display = 'block';
      }
      return;
    }
    
    // Exibir lista
    if (window.__DEBUG__) console.log('[WhatsAppTagsUI] Renderizando', this.filteredTags.length, 'tags');
    this.elements.listContainer.style.display = 'flex';
    if (this.elements.emptyStateEl) {
      this.elements.emptyStateEl.style.display = 'none';
    }
    
    // Renderizar cards
    const html = this.filteredTags.map(tag => this.renderTagCard(tag)).join('');
    if (window.__DEBUG__) console.log('[WhatsAppTagsUI] HTML gerado (primeiros 200 chars):', html.substring(0, 200));
    this.elements.listContainer.innerHTML = html;
    if (window.__DEBUG__) console.log('[WhatsAppTagsUI] Cards renderizados no DOM');
  }

  /**
   * Renderiza card individual de tag
   */
  renderTagCard(tag) {
    const statusBadge = tag.isActive 
      ? '<span class="badge bg-success">Ativa</span>' 
      : '<span class="badge bg-secondary">Inativa</span>';
    
    const usageText = tag.usageCount === 0 
      ? 'Não usada' 
      : `${tag.usageCount} ${tag.usageCount === 1 ? 'uso' : 'usos'}`;
    
    return `
      <div class="col-md-6 col-lg-4">
        <div class="card h-100 border-start border-4" style="border-left-color: ${tag.color} !important;">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <h6 class="card-title mb-0">
                <span class="badge" style="background-color: ${tag.color}; color: white;">
                  ${this.escapeHtml(tag.name)}
                </span>
              </h6>
              ${statusBadge}
            </div>
            
            ${tag.description ? `
              <p class="card-text text-muted small mb-2">${this.escapeHtml(tag.description)}</p>
            ` : ''}
            
            <div class="d-flex justify-content-between align-items-center">
              <small class="text-muted">
                <i class="bi bi-bar-chart me-1"></i>${usageText}
              </small>
              <div class="btn-group btn-group-sm">
                <button type="button" class="btn btn-outline-primary" 
                        onclick="window.__WHATSAPP_TAGS_UI__.openEditModal('${tag.id}')"
                        title="Editar">
                  <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="btn btn-outline-danger" 
                        onclick="window.__WHATSAPP_TAGS_UI__.confirmDelete('${tag.id}', '${this.escapeHtml(tag.name)}')"
                        title="${tag.isActive ? 'Desativar' : 'Excluir'}">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Abre modal para criar nova tag
   */
  openCreateModal() {
    this.currentEditingTagId = null;
    this.resetForm();
    
    if (this.elements.modalTitle) {
      this.elements.modalTitle.innerHTML = '<i class="bi bi-tag me-2"></i>Nova Tag';
    }
    
    // Abrir modal usando Bootstrap
    const modalInstance = new bootstrap.Modal(this.elements.modal, { backdrop: true });
    modalInstance.show();
  }

  /**
   * Abre modal para editar tag existente
   */
  async openEditModal(tagId) {
    try {
      this.currentEditingTagId = tagId;
      
      // Buscar dados da tag
      const tag = await this.tagsBackend.getTagById(tagId);
      
      if (!tag) {
        if (window.uiHelpers) window.uiHelpers.showToast('Tag não encontrada', 'warning');
        else alert('Tag não encontrada');
        return;
      }
      
      // Preencher formulário
      this.elements.formId.value = tag.id;
      this.elements.formName.value = tag.name;
      this.elements.formColor.value = tag.color;
      this.elements.formDescription.value = tag.description || '';
      
      // Atualizar preview
      this.updateColorPreview();
      
      // Atualizar título
      if (this.elements.modalTitle) {
        this.elements.modalTitle.innerHTML = '<i class="bi bi-pencil me-2"></i>Editar Tag';
      }
      
      // Abrir modal
      const modalInstance = new bootstrap.Modal(this.elements.modal, { backdrop: true });
      modalInstance.show();
      
    } catch (error) {
      console.error('[WhatsAppTagsUI] Erro ao abrir modal de edição:', error);
      if (window.uiHelpers) window.uiHelpers.showToast('Erro ao carregar dados da tag', 'error');
      else alert('Erro ao carregar dados da tag');
    }
  }

  /**
   * Atualiza preview de cor
   */
  updateColorPreview() {
    if (!this.elements.colorPreview || !this.elements.formColor) return;
    
    const color = this.elements.formColor.value;
    const name = this.elements.formName.value || 'Preview';
    
    this.elements.colorPreview.style.backgroundColor = color;
    this.elements.colorPreview.style.color = 'white';
    this.elements.colorPreview.textContent = name;
  }

  /**
   * Processa submissão do formulário
   */
  async handleFormSubmit(e) {
    e.preventDefault();
    
    try {
      const name = this.elements.formName.value.trim();
      const color = this.elements.formColor.value;
      const description = this.elements.formDescription.value.trim();
      
      if (!name) {
        if (window.uiHelpers) window.uiHelpers.showToast('Nome da tag é obrigatório', 'warning');
        else alert('Nome da tag é obrigatório');
        return;
      }
      
      // Criar ou atualizar
      if (this.currentEditingTagId) {
        await this.tagsBackend.updateTag(this.currentEditingTagId, {
          name,
          color,
          description
        });
  if (window.__DEBUG__) console.log(`[WhatsAppTagsUI] Tag atualizada: ${name}`);
      } else {
        await this.tagsBackend.createTag(name, color, description);
  if (window.__DEBUG__) console.log(`[WhatsAppTagsUI] Tag criada: ${name}`);
      }
      
      // Fechar modal
      const modalInstance = bootstrap.Modal.getInstance(this.elements.modal);
      modalInstance.hide();
      
      // Recarregar lista
      await this.loadTags();
      
    } catch (error) {
      console.error('[WhatsAppTagsUI] Erro ao salvar tag:', error);
      if (window.uiHelpers) window.uiHelpers.showToast('Erro ao salvar tag: ' + error.message, 'error');
      else alert('Erro ao salvar tag: ' + error.message);
    }
  }

  /**
   * Confirma exclusão de tag
   */
  async confirmDelete(tagId, tagName) {
    const confirmed = window.uiHelpers
      ? await window.uiHelpers.confirmDelete(`a tag "${tagName}"`)
      : confirm(
          `Tem certeza que deseja excluir a tag "${tagName}"?\n\n` +
          'Esta ação não pode ser desfeita e a tag será removida de todas as conversas.'
        );
    
    if (!confirmed) return;
    
    try {
      await this.tagsBackend.deleteTag(tagId);
  if (window.__DEBUG__) console.log(`[WhatsAppTagsUI] Tag excluída: ${tagName}`);
      
      // Recarregar lista
      await this.loadTags();
      
    } catch (error) {
      console.error('[WhatsAppTagsUI] Erro ao excluir tag:', error);
      if (window.uiHelpers) window.uiHelpers.showToast('Erro ao excluir tag: ' + error.message, 'error');
      else alert('Erro ao excluir tag: ' + error.message);
    }
  }

  /**
   * Reseta formulário
   */
  resetForm() {
    if (this.elements.form) {
      this.elements.form.reset();
    }
    this.currentEditingTagId = null;
    this.elements.formId.value = '';
    this.elements.formColor.value = '#FF5733';
    this.updateColorPreview();
  }

  /**
   * Exibe/oculta loading
   */
  showLoading(show) {
    if (this.elements.loadingEl) {
      this.elements.loadingEl.style.display = show ? 'block' : 'none';
    }
    if (this.elements.listContainer) {
      this.elements.listContainer.style.display = show ? 'none' : 'flex';
    }
  }

  /**
   * Exibe mensagem de erro
   */
  showError(message) {
    console.error('[WhatsAppTagsUI]', message);
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
const whatsappTagsUI = new WhatsAppTagsUI();
window.__WHATSAPP_TAGS_UI__ = whatsappTagsUI;

let bindingsApplied = false;

function applyBindingsIfPossible() {
  if (bindingsApplied) return true;

  const configModal = document.getElementById('modal-whatsapp-config');
  if (!configModal) return false;

  bindingsApplied = true;

  configModal.addEventListener('shown.bs.modal', async () => {
    // Inicializar apenas uma vez
    if (!whatsappTagsUI.elements.listContainer) {
      await whatsappTagsUI.init();
    }
  });

  // Recarregar ao trocar para aba de tags
  const tagsTab = document.getElementById('whatsapp-tags-tab');
  if (tagsTab) {
    tagsTab.addEventListener('shown.bs.tab', async () => {
      if (whatsappTagsUI.elements.listContainer) {
        await whatsappTagsUI.loadTags();
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

export { whatsappTagsUI, WhatsAppTagsUI };
