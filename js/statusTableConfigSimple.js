/**
 * @deprecated Este modal está sendo substituído pelo Gerenciador Unificado de Status e Workflows
 * Novo modal: StatusWorkflowUnifiedModal (js/modals/StatusWorkflowUnifiedModal.js)
 * Acesso: Configurações > Gerenciador de Status e Workflows
 * 
 * Configurações da Tabela de Status - Versão Completa com Edição Inline
 * @version 3.4.0
 * @date 2025-01-26
 * 
 * Changelog v3.4.0:
 * - Adicionado multi-select dropdown para edição de "Próximos Status"
 * - Interface visual com busca, tags e checkboxes
 * - Seleção múltipla simplificada com preview em tempo real
 * 
 * Changelog v3.3.0:
 * - Redesign completo do modal para fullscreen
 * - Layout em duas colunas: formulário lateral + tabela principal
 * - Adicionada busca em tempo real na tabela
 * - Interface mais limpa e organizada
 * - Melhor responsividade em telas menores
 * 
 * Changelog v3.2.0:
 * - Corrigido bug que apagava campo "próximos" ao editar cor
 * - Adicionado drag-and-drop para reordenação de status
 * - Melhorada conversão de nextSteps (Array → string para display)
 * - Adicionados estilos visuais para feedback de drag
 */

console.log(' Carregando statusTableConfigSimple.js v3.4');

// Estado global da edição
let editingRow = null;
let originalData = {};

/**
 * Monta um payload completo de status usando os dados renderizados na linha da tabela.
 * Permite sobrescrever campos específicos através do objeto overrides sem perder metadados como archiveContracts.
 * @param {HTMLTableRowElement} row
 * @param {object} overrides
 * @returns {object|null}
 */
function buildStatusPayloadFromRow(row, overrides = {}) {
  if (!row) return null;

  const textAttr = overrides.text ?? row.getAttribute('data-status-text');
  const textCellValue = row.querySelector('td[data-column="nome"] .display-text')?.textContent?.trim();
  const text = (textAttr ?? textCellValue ?? '').trim();
  if (!text) return null;

  const stageAttr = overrides.stage ?? row.getAttribute('data-status-stage');
  const stageCell = row.querySelector('td[data-column="etapa"] .display-text')?.textContent?.trim();
  const stage = (stageAttr ?? stageCell ?? 'Outros').trim();

  const orderSource = overrides.order ?? row.getAttribute('data-order');
  const order = Number.isFinite(Number(orderSource)) ? Number(orderSource) : 0;

  const color = (overrides.color ?? row.getAttribute('data-color') ?? '#FFFFFF').trim();
  const bgColor = (overrides.bgColor ?? row.getAttribute('data-bg-color') ?? '#0D6EFD').trim();

  let nextSteps;
  if (Array.isArray(overrides.nextSteps)) {
    nextSteps = overrides.nextSteps;
  } else if (typeof overrides.nextSteps === 'string') {
    nextSteps = overrides.nextSteps.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    const stored = row.querySelector('td[data-column="proximos"]')?.getAttribute('data-original') || '';
    nextSteps = stored.split(',').map((s) => s.trim()).filter(Boolean);
  }

  const active = typeof overrides.active === 'boolean'
    ? overrides.active
    : row.querySelector('td[data-column="ativo"] input[type="checkbox"]')?.checked !== false;

  const archiveAttr = row.getAttribute('data-archive-contracts');
  const archiveContracts = typeof overrides.archiveContracts === 'boolean'
    ? overrides.archiveContracts
    : archiveAttr === null
      ? undefined
      : archiveAttr === 'true';

  const payload = {
    text,
    stage,
    order,
    nextSteps,
    color,
    bgColor,
    active
  };

  if (typeof archiveContracts === 'boolean') {
    payload.archiveContracts = archiveContracts;
  }

  return payload;
}

/**
 * Re-renderiza a visualização atual (Kanban ou Lista) para aplicar cores atualizadas
 */
function refreshCurrentView() {
  try {
    // Verifica qual visualização está ativa
    const viewContainer = document.getElementById('processos-view-container');
    const isKanbanActive = viewContainer?.classList.contains('kanban-view-active');
    const isListActive = viewContainer?.classList.contains('list-view-active');
    
    // Obter contratos do estado global
    const appState = window.appState;
    const contracts = appState?.filteredContracts || appState?.contracts || [];
    const selectedStatusState = appState?.selectedStatusState || new Set();
    
    if (isKanbanActive) {
      // Re-renderizar Kanban
      if (window.UI?.renderKanbanBoard) {
        console.log(' Re-renderizando Kanban com cores atualizadas...');
        window.UI.renderKanbanBoard(contracts, selectedStatusState);
      }
    } else if (isListActive) {
      // Re-renderizar Lista - precisa passar todos os parâmetros obrigatórios
      if (window.UI?.renderContracts && window.handleViewUpdate) {
        console.log(' Re-renderizando Lista com cores atualizadas...');
        window.UI.renderContracts(
          contracts,
          appState?.visibleColumns || [],
          window.handleViewUpdate,
          {
            currentSortKey: appState?.currentSortKey || 'dataAssinatura',
            currentSortDirection: appState?.currentSortDirection || 'desc'
          }
        );
      }
    } else {
      // Fallback: tentar detectar qual seção está visível
      const kanbanSection = document.getElementById('kanban-section');
      const listSection = document.getElementById('list-section');
      
      if (kanbanSection && getComputedStyle(kanbanSection).display !== 'none') {
        if (window.UI?.renderKanbanBoard) {
          console.log(' Re-renderizando Kanban (fallback)...');
          window.UI.renderKanbanBoard(contracts, selectedStatusState);
        }
      } else if (listSection && getComputedStyle(listSection).display !== 'none') {
        if (window.UI?.renderContracts && window.handleViewUpdate) {
          console.log(' Re-renderizando Lista (fallback)...');
          window.UI.renderContracts(
            contracts,
            appState?.visibleColumns || [],
            window.handleViewUpdate,
            {
              currentSortKey: appState?.currentSortKey || 'dataAssinatura',
              currentSortDirection: appState?.currentSortDirection || 'desc'
            }
          );
        }
      }
    }
    
    console.log(' Visualização atualizada com novas cores');
  } catch (error) {
    console.warn(' Não foi possível atualizar a visualização:', error);
  }
}

/**
 * Aguarda o firestoreService estar disponível
 * @returns {Promise<object>} firestoreService
 */
async function waitForFirestoreService(maxAttempts = 20, interval = 250) {
  for (let i = 0; i < maxAttempts; i++) {
    if (window.firestoreService && typeof window.firestoreService.createOrUpdateStatus === 'function') {
      console.log(' firestoreService disponível');
      return window.firestoreService;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  console.warn(' Timeout aguardando firestoreService');
  return null;
}

/**
 * Obtém a função createOrUpdateStatus do firestoreService
 */
async function getCreateOrUpdateStatus() {
  // Primeiro tenta window.firestoreService
  if (window.firestoreService?.createOrUpdateStatus) {
    return window.firestoreService.createOrUpdateStatus.bind(window.firestoreService);
  }
  
  // Aguarda se não estiver disponível ainda
  const fs = await waitForFirestoreService();
  if (fs?.createOrUpdateStatus) {
    return fs.createOrUpdateStatus.bind(fs);
  }
  
  throw new Error('firestoreService não disponível. Verifique se você está logado.');
}

// Injetar estilos para drag-and-drop
function injectDragDropStyles() {
  if (document.getElementById('drag-drop-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'drag-drop-styles';
  style.textContent = `
    /* Drag-and-drop styles */
    .draggable-row {
      transition: background-color 0.2s ease, opacity 0.2s ease, transform 0.15s ease;
    }
    
    .draggable-row:hover .drag-handle {
      cursor: grab;
    }
    
    .draggable-row:hover .drag-icon {
      opacity: 1;
      color: var(--bs-primary) !important;
    }
    
    .drag-handle {
      cursor: grab;
      user-select: none;
    }
    
    .drag-handle:active {
      cursor: grabbing;
    }
    
    .drag-icon {
      opacity: 0.4;
      transition: opacity 0.2s ease, color 0.2s ease;
      font-size: 1.1rem;
    }
    
    .draggable-row.dragging {
      opacity: 0.5;
      background-color: var(--bs-primary-bg-subtle) !important;
      transform: scale(0.98);
    }
    
    .drag-placeholder {
      height: 4px !important;
      background: transparent;
    }
    
    .drag-placeholder td {
      height: 4px !important;
      padding: 0 !important;
      border: none !important;
      background: linear-gradient(90deg, var(--bs-primary) 0%, var(--bs-info) 100%) !important;
      box-shadow: 0 0 8px rgba(var(--bs-primary-rgb), 0.5);
    }
    
    /* Animação de spin para indicador de salvamento */
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    .spin {
      animation: spin 1s linear infinite;
      display: inline-block;
    }
    
    /* Estilo para o número de ordem */
    .order-number {
      font-weight: 600;
      color: var(--bs-secondary);
      font-size: 0.85rem;
    }
    
    /* Edição direta de ordem */
    .order-editable .display-text {
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .order-editable .display-text:hover {
      background-color: var(--bs-primary) !important;
      color: white !important;
      transform: scale(1.1);
    }
    
    .order-editable .edit-order-input {
      width: 60px !important;
      text-align: center;
      font-weight: 600;
      border: 2px solid var(--bs-primary);
      border-radius: 4px;
    }
    
    .order-editable .edit-order-input:focus {
      box-shadow: 0 0 0 3px rgba(var(--bs-primary-rgb), 0.25);
    }
    
    /* Multi-select para próximos status */
    .next-steps-cell {
      position: relative;
    }
    
    .next-steps-display {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .next-steps-display .display-text {
      flex: 1;
      cursor: default;
    }
    
    .next-steps-edit-btn {
      opacity: 0.5;
      transition: opacity 0.2s ease;
    }
    
    .next-steps-cell:hover .next-steps-edit-btn {
      opacity: 1;
    }
    
    .next-steps-selector {
      display: none;
      position: fixed;
      z-index: 10100;
      width: 340px;
      max-height: 450px;
      background: white;
      border: none;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      padding: 0;
      overflow: hidden;
    }
    
    .next-steps-selector.show {
      display: flex;
      flex-direction: column;
    }
    
    .next-steps-search {
      padding: 12px;
      border-bottom: 1px solid #e9ecef;
      background: #f8f9fa;
    }
    
    .next-steps-search-input {
      font-size: 0.875rem;
      border-radius: 8px;
      border: 1px solid #dee2e6;
      padding: 8px 12px;
    }
    
    .next-steps-search-input:focus {
      border-color: #86b7fe;
      box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.15);
    }
    
    .next-steps-selected-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 10px 12px;
      background: #f0f7ff;
      border-bottom: 1px solid #e9ecef;
      min-height: 44px;
      align-items: center;
    }
    
    .next-steps-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #0d6efd;
      color: white;
      font-size: 0.75rem;
      font-weight: 500;
      padding: 4px 10px;
      border-radius: 20px;
      box-shadow: 0 1px 3px rgba(13, 110, 253, 0.3);
    }
    
    .next-steps-tag-remove {
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      font-size: 0.875rem;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 50%;
      cursor: pointer;
      opacity: 0.8;
      transition: all 0.2s ease;
    }
    
    .next-steps-tag-remove:hover {
      opacity: 1;
      background: rgba(255,255,255,0.3);
    }
    
    .next-steps-list {
      flex: 1;
      max-height: 220px;
      overflow-y: auto;
      overflow-x: hidden;
      background: white !important;
    }
    
    /* Opções da lista */
    .next-steps-list .next-step-option {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 10px 12px !important;
      cursor: pointer !important;
      border-bottom: 1px solid #f0f0f0 !important;
      background: white !important;
    }
    
    .next-steps-list .next-step-option:hover {
      background-color: #f0f7ff !important;
    }
    
    .next-steps-list .next-step-option.selected {
      background-color: #e7f1ff !important;
      border-left: 3px solid #0d6efd !important;
    }
    
    .next-steps-list .next-step-option input[type="checkbox"] {
      width: 18px !important;
      height: 18px !important;
      flex-shrink: 0 !important;
      accent-color: #0d6efd !important;
    }
    
    .next-steps-list .next-step-option .option-label {
      flex: 1 !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      color: #212529 !important;
      display: inline-block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    
    .next-steps-list .next-step-option .option-stage {
      font-size: 11px !important;
      color: #6c757d !important;
      background: #e9ecef !important;
      padding: 2px 8px !important;
      border-radius: 12px !important;
      flex-shrink: 0 !important;
    }
    
    .next-steps-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px;
      background: #f8f9fa;
      border-top: 1px solid #e9ecef;
    }
    
    .next-steps-actions .btn {
      padding: 6px 16px;
      font-size: 0.875rem;
      border-radius: 6px;
    }

    /* Célula de próximos clicável */
    td[data-column="proximos"] .display-text {
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      transition: background-color 0.2s ease;
    }
    
    td[data-column="proximos"] .display-text:hover {
      background-color: #f8f9fa;
    }

    .status-archive-indicator {
      font-size: 0.7rem;
      vertical-align: middle;
    }
  `;
  document.head.appendChild(style);
  console.log(' Estilos de drag-and-drop injetados');
}

// Esperar até o DOM estar pronto
document.addEventListener('DOMContentLoaded', function() {
  console.log(' DOM carregado, inicializando configurações da tabela');
  
  // Injetar estilos de drag-and-drop
  injectDragDropStyles();
  
  // Encontrar elementos
  const openBtn = document.getElementById('open-table-config');
  const modal = document.getElementById('status-table-config-modal');
  const closeBtn = modal?.querySelector('.btn-close');
  
  console.log(' Elementos encontrados:', {
    openBtn: !!openBtn,
    modal: !!modal,
    closeBtn: !!closeBtn
  });
  
  if (!openBtn || !modal) {
    console.error(' Elementos essenciais não encontrados');
    return;
  }
  
  /**
   * Abre o modal de configuração de forma padronizada
   */
  function openModal() {
    const instance = window.bootstrap?.Modal
      ? window.bootstrap.Modal.getOrCreateInstance(modal)
      : null;

    if (instance) {
      instance.show();
    } else {
      // Fallback CSS-only
      modal.classList.remove('hidden');
      modal.classList.add('show');
      document.body.style.overflow = 'hidden'; // Previne scroll do body
    }
    console.log(' Modal aberto');
  }
  
  /**
   * Fecha o modal de configuração de forma padronizada
   */
  function closeModal() {
    cancelAnyEdit();
    const instance = window.bootstrap?.Modal
      ? window.bootstrap.Modal.getOrCreateInstance(modal)
      : null;

    if (instance) {
      instance.hide();
    } else {
      modal.classList.remove('show');
      modal.classList.add('hidden');
      document.body.style.overflow = ''; // Restaura scroll do body
    }
    console.log(' Modal fechado');
  }
  
  // Configurar eventos básicos
  openBtn.addEventListener('click', function() {
    console.log(' Abrindo modal de configuração');
    
    // Carregar dados na tabela do modal
    loadDataToModal();
    
    // Resetar formulário
    resetModalForm();
    
    // Abrir modal usando sistema padronizado
    openModal();
  });
  
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
  
  // Fechar ao clicar fora (fallback sem Bootstrap)
  modal.addEventListener('click', function(e) {
    if (!window.bootstrap?.Modal && e.target === modal) {
      closeModal();
    }
  });
  
  // Fechar com tecla ESC (fallback sem Bootstrap)
  document.addEventListener('keydown', function(e) {
    if (!window.bootstrap?.Modal && e.key === 'Escape' && modal.classList.contains('show')) {
      closeModal();
    }
  });
  
  // Configurar outros botões e formulário
  setupModalButtons();
  setupModalForm();
  setupNextStepsSelector();
  setupColorPickers();
  setupFormEnhancements();
  
  console.log(' Sistema de configuração inicializado com sucesso');
});

// Cache dos status disponíveis para o seletor de próximos
let availableStatuses = [];

/**
 * Configura o seletor de "Próximos Status" com interface melhorada
 */
function setupNextStepsSelector() {
  const selectedContainer = document.getElementById('next-steps-selected');
  const dropdown = document.getElementById('next-steps-dropdown');
  const searchInput = document.getElementById('next-steps-search');
  const listContainer = document.getElementById('next-steps-list');
  const hiddenInput = document.getElementById('modal-status-next-steps');
  const clearBtn = document.getElementById('btn-clear-next-steps');
  const closeBtn = document.getElementById('btn-close-next-steps');
  
  if (!selectedContainer || !dropdown) return;
  
  let selectedNextSteps = new Set();
  
  // Clique no container abre o dropdown
  selectedContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('remove-tag')) return;
    
    if (dropdown.style.display === 'none') {
      await loadNextStepsOptions();
      dropdown.style.display = 'flex';
      searchInput?.focus();
    } else {
      dropdown.style.display = 'none';
    }
  });
  
  // Fechar ao clicar fora
  document.addEventListener('click', (e) => {
    if (!selectedContainer.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
  
  // Busca no dropdown
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const searchTerm = searchInput.value.toLowerCase();
      const options = listContainer.querySelectorAll('.next-step-option');
      
      options.forEach(option => {
        const label = option.querySelector('.option-label')?.textContent?.toLowerCase() || '';
        option.style.display = label.includes(searchTerm) ? '' : 'none';
      });
    });
  }
  
  // Botão limpar
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      selectedNextSteps.clear();
      updateSelectedDisplay();
      updateHiddenInput();
      
      // Desmarcar todos checkboxes
      listContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
        cb.closest('.next-step-option')?.classList.remove('selected');
      });
    });
  }
  
  // Botão fechar
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      dropdown.style.display = 'none';
    });
  }
  
  // Função para carregar opções de status
  async function loadNextStepsOptions() {
    if (availableStatuses.length === 0) {
      try {
        if (window.firestoreService && typeof window.firestoreService.getEffectiveStatuses === 'function') {
          availableStatuses = await window.firestoreService.getEffectiveStatuses();
        }
      } catch (error) {
        console.error(' Erro ao carregar status para seletor:', error);
      }
    }
    
    // Obter status atual sendo editado (para excluir da lista)
    const currentStatusText = document.getElementById('modal-status-text')?.value?.trim() || '';
    
    listContainer.innerHTML = availableStatuses
      .filter(status => status.text !== currentStatusText && status.active !== false)
      .map(status => {
        const isSelected = selectedNextSteps.has(status.text);
        return `
          <div class="next-step-option ${isSelected ? 'selected' : ''}" data-value="${escapeHtml(status.text)}">
            <input type="checkbox" ${isSelected ? 'checked' : ''}>
            <span class="option-label">${escapeHtml(status.text)}</span>
            <span class="option-stage">${escapeHtml(status.stage || 'N/A')}</span>
          </div>
        `;
      }).join('');
    
    // Adicionar eventos aos checkboxes
    listContainer.querySelectorAll('.next-step-option').forEach(option => {
      option.addEventListener('click', (e) => {
        const checkbox = option.querySelector('input[type="checkbox"]');
        const value = option.getAttribute('data-value');
        
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
        
        if (checkbox.checked) {
          selectedNextSteps.add(value);
          option.classList.add('selected');
        } else {
          selectedNextSteps.delete(value);
          option.classList.remove('selected');
        }
        
        updateSelectedDisplay();
        updateHiddenInput();
      });
    });
  }
  
  // Atualiza o display dos itens selecionados
  function updateSelectedDisplay() {
    if (selectedNextSteps.size === 0) {
      selectedContainer.innerHTML = '<span class="placeholder-text">Clique para selecionar status de destino...</span>';
    } else {
      selectedContainer.innerHTML = Array.from(selectedNextSteps).map(text => `
        <span class="next-step-tag">
          ${escapeHtml(text)}
          <span class="remove-tag" data-value="${escapeHtml(text)}">&times;</span>
        </span>
      `).join('');
      
      // Adicionar eventos de remoção
      selectedContainer.querySelectorAll('.remove-tag').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = btn.getAttribute('data-value');
          selectedNextSteps.delete(value);
          updateSelectedDisplay();
          updateHiddenInput();
          
          // Atualizar checkbox no dropdown se estiver aberto
          const option = listContainer.querySelector(`[data-value="${value}"]`);
          if (option) {
            option.classList.remove('selected');
            const cb = option.querySelector('input[type="checkbox"]');
            if (cb) cb.checked = false;
          }
        });
      });
    }
  }
  
  // Atualiza o input hidden com os valores selecionados
  function updateHiddenInput() {
    if (hiddenInput) {
      hiddenInput.value = Array.from(selectedNextSteps).join(',');
    }
  }
  
  // Expor funções globalmente para uso externo
  window.nextStepsSelector = {
    setValues: (values) => {
      selectedNextSteps = new Set(Array.isArray(values) ? values : (values || '').split(',').map(s => s.trim()).filter(Boolean));
      updateSelectedDisplay();
      updateHiddenInput();
    },
    getValues: () => Array.from(selectedNextSteps),
    clear: () => {
      selectedNextSteps.clear();
      updateSelectedDisplay();
      updateHiddenInput();
    }
  };
}

/**
 * Configura melhorias adicionais do formulário
 */
function setupFormEnhancements() {
  const statusTextInput = document.getElementById('modal-status-text');
  const stageInput = document.getElementById('modal-status-stage');
  const orderInput = document.getElementById('modal-status-order');
  const previewBadge = document.getElementById('modal-status-preview');
  const autoOrderBtn = document.getElementById('btn-auto-order');
  
  // Preview em tempo real
  if (statusTextInput && previewBadge) {
    statusTextInput.addEventListener('input', () => {
      previewBadge.textContent = statusTextInput.value.trim() || 'Novo Status';
    });
  }
  
  // Botão de ordem automática
  if (autoOrderBtn && orderInput) {
    autoOrderBtn.addEventListener('click', async () => {
      try {
        // Calcular próxima ordem disponível
        let maxOrder = 0;
        
        if (availableStatuses.length === 0 && window.firestoreService) {
          availableStatuses = await window.firestoreService.getEffectiveStatuses();
        }
        
        availableStatuses.forEach(status => {
          const order = parseFloat(status.order) || 0;
          if (order > maxOrder) maxOrder = order;
        });
        
        // Sugerir próximo número
        orderInput.value = (Math.ceil(maxOrder) + 1).toString();
        orderInput.focus();
        
        console.log(' Ordem automática sugerida:', orderInput.value);
      } catch (error) {
        console.error(' Erro ao calcular ordem automática:', error);
      }
    });
  }
  
  // Adicionar sugestões de etapa ao input quando digita
  if (stageInput) {
    stageInput.addEventListener('focus', () => {
      // Forçar exibição das sugestões do datalist
      const datalist = document.getElementById('stage-suggestions');
      if (datalist && availableStatuses.length > 0) {
        // Atualizar datalist com etapas únicas dos status existentes
        const uniqueStages = [...new Set(availableStatuses.map(s => s.stage).filter(Boolean))];
        const existingOptions = Array.from(datalist.querySelectorAll('option')).map(o => o.value);
        
        uniqueStages.forEach(stage => {
          if (!existingOptions.includes(stage)) {
            const option = document.createElement('option');
            option.value = stage;
            datalist.appendChild(option);
          }
        });
      }
    });
  }
}

/**
 * Configura o formulário do modal
 */
function setupModalForm() {
  const form = document.getElementById('modal-status-form');
  if (!form) {
    console.warn(' Formulário modal-status-form não encontrado');
    return;
  }
  const archiveInput = document.getElementById('modal-status-archive');
  
  console.log(' Configurando formulário modal-status-form');
  
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    console.log(' Formulário submetido');
    
    // Validação Bootstrap
    if (!form.checkValidity()) {
      console.log(' Formulário inválido (Bootstrap validation)');
      e.stopPropagation();
      form.classList.add('was-validated');
      return;
    }
    
    const textInput = document.getElementById('modal-status-text');
    const stageInput = document.getElementById('modal-status-stage');
    const orderInput = document.getElementById('modal-status-order');
    const nextStepsInput = document.getElementById('modal-status-next-steps');
    const colorInput = document.getElementById('modal-status-color');
    const bgColorInput = document.getElementById('modal-status-bg-color');
    
    console.log(' Valores dos campos:', {
      text: textInput?.value,
      stage: stageInput?.value,
      order: orderInput?.value,
      nextSteps: nextStepsInput?.value,
      color: colorInput?.value,
      bgColor: bgColorInput?.value
    });
    
    const formData = {
      text: textInput?.value?.trim(),
      stage: stageInput?.value?.trim(),
      order: parseFloat(orderInput?.value) || 0,
      nextSteps: nextStepsInput?.value?.trim() || '',
      color: colorInput?.value || '#FFFFFF',
      bgColor: bgColorInput?.value || '#0D6EFD',
      archiveContracts: archiveInput?.checked === true
    };
    
    if (!formData.text || !formData.stage) {
      console.log(' Nome ou Etapa vazios');
      if (window.uiHelpers) window.uiHelpers.showToast('Nome e Etapa são obrigatórios!', 'warning');
      else alert('Nome e Etapa são obrigatórios!');
      return;
    }
    
    console.log(' Salvando status via formulário:', formData);
    
    // Mostrar status de carregamento
    const statusDiv = document.getElementById('modal-status-form-status');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    if (statusDiv) {
      statusDiv.textContent = ' Salvando...';
      statusDiv.className = 'status-form-feedback loading';
    }
    if (submitBtn) submitBtn.disabled = true;
    
    try {
      // Obter a função createOrUpdateStatus (aguarda se necessário)
      const createOrUpdateStatus = await getCreateOrUpdateStatus();
      
      const statusToSave = {
        text: formData.text,
        stage: formData.stage,
        order: formData.order,
        nextSteps: formData.nextSteps.split(',').map(s => s.trim()).filter(Boolean),
        color: formData.color,
        bgColor: formData.bgColor,
        active: true,
        archiveContracts: formData.archiveContracts
      };
      
      console.log(' Enviando para createOrUpdateStatus:', statusToSave);
      
      const result = await createOrUpdateStatus(statusToSave);
      
      console.log(' Resultado:', result);
      
      if (statusDiv) {
        statusDiv.textContent = ' Status salvo com sucesso!';
        statusDiv.className = 'status-form-feedback success';
      }
      
      // Notificar usuário
      if (window.uiHelpers?.showToast) {
        window.uiHelpers.showToast(`Status "${formData.text}" salvo com sucesso!`, 'success');
      }
      
      // Atualizar cache de status disponíveis
      availableStatuses = [];
      
      // IMPORTANTE: Atualizar window.EFFECTIVE_STATUS_CONFIG para refletir as novas cores
      if (window.EFFECTIVE_STATUS_CONFIG && Array.isArray(window.EFFECTIVE_STATUS_CONFIG)) {
        const statusIndex = window.EFFECTIVE_STATUS_CONFIG.findIndex(s => s.text === formData.text);
        if (statusIndex !== -1) {
          // Atualizar status existente
          window.EFFECTIVE_STATUS_CONFIG[statusIndex].color = formData.color;
          window.EFFECTIVE_STATUS_CONFIG[statusIndex].bgColor = formData.bgColor;
          window.EFFECTIVE_STATUS_CONFIG[statusIndex].stage = formData.stage;
          window.EFFECTIVE_STATUS_CONFIG[statusIndex].order = formData.order;
          window.EFFECTIVE_STATUS_CONFIG[statusIndex].archiveContracts = formData.archiveContracts;
          console.log(' EFFECTIVE_STATUS_CONFIG atualizado para:', formData.text);
        } else {
          // Adicionar novo status
          window.EFFECTIVE_STATUS_CONFIG.push({
            text: formData.text,
            stage: formData.stage,
            order: formData.order,
            color: formData.color,
            bgColor: formData.bgColor,
            nextSteps: statusToSave.nextSteps,
            archiveContracts: formData.archiveContracts
          });
          console.log(' Novo status adicionado ao EFFECTIVE_STATUS_CONFIG:', formData.text);
        }
      }
      
      // Também invalidar cache do localStorage
      try {
        localStorage.removeItem('cachedStatuses');
        console.log(' Cache de status invalidado');
      } catch (e) {
        console.warn(' Não foi possível invalidar cache de status:', e);
      }
      
      // Re-renderizar a visualização atual para aplicar as cores imediatamente
      refreshCurrentView();
      
      // Limpar formulário
      resetModalForm();
      
      // Recarregar tabela
      setTimeout(() => {
        loadDataToModal();
        if (statusDiv) {
          statusDiv.textContent = '';
          statusDiv.className = 'status-form-feedback';
        }
      }, 1500);
      
    } catch (error) {
      console.error(' Erro ao salvar status:', error);
      if (statusDiv) {
        statusDiv.textContent = ` Erro: ${error.message}`;
        statusDiv.className = 'status-form-feedback error';
      }
      
      // Notificar usuário
      if (window.uiHelpers?.showToast) {
        window.uiHelpers.showToast(`Erro ao salvar: ${error.message}`, 'error');
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
  
  // Botão cancelar
  const cancelBtn = document.getElementById('modal-status-form-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function() {
      resetModalForm();
    });
  }
}

/**
 * Reseta o formulário do modal
 */
function resetModalForm() {
  const form = document.getElementById('modal-status-form');
  if (!form) return;
  
  form.reset();
  form.classList.remove('was-validated');
  
  const statusDiv = document.getElementById('modal-status-form-status');
  const cancelBtn = document.getElementById('modal-status-form-cancel');
  const submitText = document.getElementById('modal-status-form-submit-text');
  const formCard = form.closest('.status-form-card');
  const formTitle = document.getElementById('modal-status-form-title');
  const formIcon = document.getElementById('modal-status-form-icon');
  const previewBadge = document.getElementById('modal-status-preview');
  
  // Reset campos de cor para valores padrão
  const colorInput = document.getElementById('modal-status-color');
  const colorHexInput = document.getElementById('modal-status-color-hex');
  const bgColorInput = document.getElementById('modal-status-bg-color');
  const bgColorHexInput = document.getElementById('modal-status-bg-color-hex');
  const archiveInput = document.getElementById('modal-status-archive');
  
  if (colorInput) colorInput.value = '#FFFFFF';
  if (colorHexInput) colorHexInput.value = '#FFFFFF';
  if (bgColorInput) bgColorInput.value = '#0D6EFD';
  if (bgColorHexInput) bgColorHexInput.value = '#0D6EFD';
  if (previewBadge) {
    previewBadge.style.color = '#FFFFFF';
    previewBadge.style.background = '#0D6EFD';
  }
  if (archiveInput) archiveInput.checked = false;
  
  // Reset visual elements
  if (statusDiv) {
    statusDiv.textContent = '';
    statusDiv.className = 'status-form-feedback';
  }
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (submitText) submitText.textContent = 'Adicionar Status';
  if (formTitle) formTitle.textContent = 'Adicionar Novo Status';
  if (formIcon) {
    formIcon.className = 'bi bi-plus-circle-fill';
  }
  if (previewBadge) previewBadge.textContent = 'Novo Status';
  if (formCard) formCard.classList.remove('editing-mode');
  
  // Limpar seletor de próximos status
  if (window.nextStepsSelector) {
    window.nextStepsSelector.clear();
  }
  
  // Remover atributo de edição se existir
  form.removeAttribute('data-editing-id');
}

/**
 * Configura os color pickers e sincronização com inputs hex
 */
function setupColorPickers() {
  const colorInput = document.getElementById('modal-status-color');
  const colorHexInput = document.getElementById('modal-status-color-hex');
  const bgColorInput = document.getElementById('modal-status-bg-color');
  const bgColorHexInput = document.getElementById('modal-status-bg-color-hex');
  const previewBadge = document.getElementById('modal-status-preview');
  
  // Função para atualizar o preview
  function updatePreview() {
    if (!previewBadge) return;
    const textColor = colorInput?.value || '#FFFFFF';
    const bgColor = bgColorInput?.value || '#0D6EFD';
    previewBadge.style.color = textColor;
    previewBadge.style.background = bgColor;
  }
  
  // Sincronização: Color picker -> Hex input
  if (colorInput && colorHexInput) {
    colorInput.addEventListener('input', () => {
      colorHexInput.value = colorInput.value.toUpperCase();
      updatePreview();
    });
    
    colorHexInput.addEventListener('input', () => {
      const hex = colorHexInput.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        colorInput.value = hex;
        updatePreview();
      }
    });
    
    colorHexInput.addEventListener('blur', () => {
      let hex = colorHexInput.value.trim();
      if (!hex.startsWith('#')) hex = '#' + hex;
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        colorHexInput.value = hex.toUpperCase();
        colorInput.value = hex;
        updatePreview();
      } else {
        colorHexInput.value = colorInput.value.toUpperCase();
      }
    });
  }
  
  // Sincronização: BgColor picker -> Hex input
  if (bgColorInput && bgColorHexInput) {
    bgColorInput.addEventListener('input', () => {
      bgColorHexInput.value = bgColorInput.value.toUpperCase();
      updatePreview();
    });
    
    bgColorHexInput.addEventListener('input', () => {
      const hex = bgColorHexInput.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        bgColorInput.value = hex;
        updatePreview();
      }
    });
    
    bgColorHexInput.addEventListener('blur', () => {
      let hex = bgColorHexInput.value.trim();
      if (!hex.startsWith('#')) hex = '#' + hex;
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        bgColorHexInput.value = hex.toUpperCase();
        bgColorInput.value = hex;
        updatePreview();
      } else {
        bgColorHexInput.value = bgColorInput.value.toUpperCase();
      }
    });
  }
  
  console.log(' Color pickers configurados');
}

/**
 * Abre o editor de cores inline para um status específico
 */
window.openColorEditor = async function(statusId, currentColor, currentBgColor) {
  console.log(' Abrindo editor de cores para:', statusId);
  
  const row = document.querySelector(`tr[data-status-id="${statusId}"]`);
  if (!row) {
    console.error('Linha não encontrada:', statusId);
    return;
  }
  
  const colorCell = row.querySelector('td[data-column="cor"]');
  if (!colorCell) return;
  
  // Verificar se já existe um popover aberto
  const existingPopover = document.querySelector('.color-editor-popover');
  if (existingPopover) {
    existingPopover.remove();
  }
  
  // Criar popover de edição de cores
  const popover = document.createElement('div');
  popover.className = 'color-editor-popover';
  popover.innerHTML = `
    <div class="color-editor-content">
      <div class="color-editor-header">
        <span><i class="bi bi-palette-fill"></i> Editar Cores</span>
        <button type="button" class="btn-close btn-close-sm" onclick="closeColorEditor()"></button>
      </div>
      <div class="color-editor-body">
        <div class="color-row">
          <label><i class="bi bi-fonts"></i> Texto:</label>
          <input type="color" id="inline-color-picker" value="${currentColor}">
          <input type="text" id="inline-color-hex" value="${currentColor}" maxlength="7" class="form-control form-control-sm">
        </div>
        <div class="color-row">
          <label><i class="bi bi-paint-bucket"></i> Fundo:</label>
          <input type="color" id="inline-bg-color-picker" value="${currentBgColor}">
          <input type="text" id="inline-bg-color-hex" value="${currentBgColor}" maxlength="7" class="form-control form-control-sm">
        </div>
        <div class="color-preview-row">
          <span>Preview:</span>
          <span id="inline-color-preview" class="color-swatch" style="background: ${currentBgColor}; color: ${currentColor}; padding: 4px 12px; border-radius: 4px;">Aa</span>
        </div>
      </div>
      <div class="color-editor-footer">
        <button type="button" class="btn btn-sm btn-secondary" onclick="closeColorEditor()">Cancelar</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="saveColorEdit('${statusId}')">
          <i class="bi bi-check-lg"></i> Salvar
        </button>
      </div>
    </div>
  `;
  
  // Posicionar o popover
  document.body.appendChild(popover);
  
  const rect = colorCell.getBoundingClientRect();
  popover.style.position = 'fixed';
  popover.style.top = (rect.bottom + 5) + 'px';
  popover.style.left = Math.max(10, rect.left - 100) + 'px';
  popover.style.zIndex = '9999';
  
  // Configurar sincronização de cores
  const colorPicker = document.getElementById('inline-color-picker');
  const colorHex = document.getElementById('inline-color-hex');
  const bgColorPicker = document.getElementById('inline-bg-color-picker');
  const bgColorHex = document.getElementById('inline-bg-color-hex');
  const preview = document.getElementById('inline-color-preview');
  
  function updateInlinePreview() {
    preview.style.color = colorPicker.value;
    preview.style.background = bgColorPicker.value;
  }
  
  colorPicker.addEventListener('input', () => {
    colorHex.value = colorPicker.value.toUpperCase();
    updateInlinePreview();
  });
  
  colorHex.addEventListener('input', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(colorHex.value)) {
      colorPicker.value = colorHex.value;
      updateInlinePreview();
    }
  });
  
  bgColorPicker.addEventListener('input', () => {
    bgColorHex.value = bgColorPicker.value.toUpperCase();
    updateInlinePreview();
  });
  
  bgColorHex.addEventListener('input', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(bgColorHex.value)) {
      bgColorPicker.value = bgColorHex.value;
      updateInlinePreview();
    }
  });
  
  // Prevenir fechamento ao clicar dentro do popover
  popover.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  // Prevenir fechamento ao interagir com color pickers (eles abrem diálogo nativo)
  colorPicker.addEventListener('click', (e) => e.stopPropagation());
  bgColorPicker.addEventListener('click', (e) => e.stopPropagation());
  
  // Fechar ao clicar fora (com delay maior para evitar conflitos)
  setTimeout(() => {
    function handleOutsideClick(e) {
      const popoverEl = document.querySelector('.color-editor-popover');
      if (!popoverEl) {
        document.removeEventListener('mousedown', handleOutsideClick);
        return;
      }
      
      // Verificar se o clique foi dentro do popover ou em um diálogo nativo de cor
      if (popoverEl.contains(e.target)) {
        return;
      }
      
      // Verificar se clicou no botão que abre o popover
      if (e.target.closest('.color-edit-btn')) {
        return;
      }
      
      closeColorEditor();
      document.removeEventListener('mousedown', handleOutsideClick);
    }
    
    document.addEventListener('mousedown', handleOutsideClick);
  }, 200);
};

/**
 * Fecha o editor de cores
 */
window.closeColorEditor = function() {
  const popover = document.querySelector('.color-editor-popover');
  if (popover) {
    popover.remove();
  }
};

/**
 * Salva as cores editadas (preservando todos os campos existentes)
 */
window.saveColorEdit = async function(statusId) {
  const colorPicker = document.getElementById('inline-color-picker');
  const bgColorPicker = document.getElementById('inline-bg-color-picker');
  
  if (!colorPicker || !bgColorPicker) return;
  
  const newColor = colorPicker.value;
  const newBgColor = bgColorPicker.value;
  
  console.log(' Salvando cores para:', statusId, { color: newColor, bgColor: newBgColor });
  
  try {
    // Obter dados atuais do status
    const row = document.querySelector(`tr[data-status-id="${statusId}"]`);
    if (!row) throw new Error('Linha não encontrada');
    
    const nome = row.querySelector('td[data-column="nome"] .display-text')?.textContent?.trim();
    const etapa = row.querySelector('td[data-column="etapa"] .display-text')?.textContent?.trim();
    const ordemCell = row.querySelector('td[data-column="ordem"]');
    const ordem = ordemCell?.querySelector('.display-text')?.textContent?.trim() || 
                  ordemCell?.querySelector('.order-value')?.textContent?.trim() ||
                  ordemCell?.textContent?.trim();
    
    // IMPORTANTE: Preservar nextSteps existentes
    const proximosCell = row.querySelector('td[data-column="proximos"]');
    const proximosOriginal = proximosCell?.getAttribute('data-original') || '';
    const proximosArray = proximosOriginal ? proximosOriginal.split(',').map(s => s.trim()).filter(Boolean) : [];
    
    // Preservar estado ativo
    const ativoCheckbox = row.querySelector('td[data-column="ativo"] input[type="checkbox"]');
    const ativo = ativoCheckbox?.checked !== false;
    
    console.log(' Preservando dados:', { nome, etapa, ordem, nextSteps: proximosArray, active: ativo });
    
    // Obter função de salvamento
    const createOrUpdateStatus = await getCreateOrUpdateStatus();
    
    // Salvar com as novas cores E preservando campos existentes
    const payload = buildStatusPayloadFromRow(row, {
      text: nome,
      stage: etapa,
      order: parseFloat(ordem) || 0,
      nextSteps: proximosArray,
      color: newColor,
      bgColor: newBgColor,
      active: ativo
    });
    if (!payload) throw new Error('Não foi possível montar o payload do status');
    await createOrUpdateStatus(payload);
    
    console.log(' Cores salvas preservando nextSteps:', proximosArray);
    
    // Atualizar a célula na tabela
    const colorCell = row.querySelector('td[data-column="cor"]');
    if (colorCell) {
      colorCell.setAttribute('data-color', newColor);
      colorCell.setAttribute('data-bg-color', newBgColor);
      const swatch = colorCell.querySelector('.color-swatch');
      if (swatch) {
        swatch.style.background = newBgColor;
        swatch.style.color = newColor;
      }
    }
    
    // Atualizar data-attributes da linha
    row.setAttribute('data-color', newColor);
    row.setAttribute('data-bg-color', newBgColor);
    
    // Fechar popover
    closeColorEditor();
    
    // IMPORTANTE: Atualizar window.EFFECTIVE_STATUS_CONFIG para refletir as novas cores
    if (window.EFFECTIVE_STATUS_CONFIG && Array.isArray(window.EFFECTIVE_STATUS_CONFIG)) {
      const statusIndex = window.EFFECTIVE_STATUS_CONFIG.findIndex(s => s.text === nome);
      if (statusIndex !== -1) {
        window.EFFECTIVE_STATUS_CONFIG[statusIndex].color = newColor;
        window.EFFECTIVE_STATUS_CONFIG[statusIndex].bgColor = newBgColor;
        console.log(' EFFECTIVE_STATUS_CONFIG atualizado para:', nome);
      }
    }
    
    // Também invalidar cache do localStorage
    try {
      localStorage.removeItem('cachedStatuses');
      console.log(' Cache de status invalidado');
    } catch (e) {
      console.warn(' Não foi possível invalidar cache de status:', e);
    }
    
    // Re-renderizar a visualização atual para aplicar as cores imediatamente
    refreshCurrentView();
    
    // Notificar usuário
    if (window.uiHelpers?.showToast) {
      window.uiHelpers.showToast(`Cores do status "${nome}" atualizadas!`, 'success');
    }
    
    console.log(' Cores salvas com sucesso');
    
  } catch (error) {
    console.error(' Erro ao salvar cores:', error);
    if (window.uiHelpers?.showToast) {
      window.uiHelpers.showToast(`Erro ao salvar cores: ${error.message}`, 'error');
    }
  }
};

/**
 * Configura botões do modal
 */
function setupModalButtons() {
  // Botão de aplicar configurações
  const applyBtn = document.getElementById('modal-apply-config');
  if (applyBtn) {
    applyBtn.addEventListener('click', function() {
      console.log(' Aplicando configurações');
      applyConfigurations();
      
      // Fechar modal usando padrão de classes
      const modal = document.getElementById('status-table-config-modal');
      modal.classList.remove('show');
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    });
  }
  
  // Botão de atualizar
  const refreshBtn = document.getElementById('modal-refresh-table');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      console.log(' Atualizando dados do modal');
      loadDataToModal();
    });
  }
  
  // Botão de reset
  const resetBtn = document.getElementById('modal-reset-config');
  if (resetBtn) {
    resetBtn.addEventListener('click', async function() {
      const confirmed = window.uiHelpers
        ? await window.uiHelpers.confirmAction({ title: 'Restaurar Configurações', message: 'Deseja restaurar as configurações padrão?' })
        : confirm('Deseja restaurar as configurações padrão?');
      if (confirmed) {
        console.log(' Restaurando configurações padrão');
        resetToDefaults();
      }
    });
  }
  
  // Botões de exportar
  const exportVisibleBtn = document.getElementById('modal-export-visible');
  if (exportVisibleBtn) {
    exportVisibleBtn.addEventListener('click', () => exportTableData(false));
  }
  
  const exportAllBtn = document.getElementById('modal-export-all');
  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', () => exportTableData(true));
  }
  
  // Configurações em tempo real
  setupRealTimeConfigs();
  
  // Configurar busca na tabela
  setupTableSearch();
}

/**
 * Configura a busca na tabela de status
 */
function setupTableSearch() {
  const searchInput = document.getElementById('status-table-search');
  if (!searchInput) return;
  
  let debounceTimer;
  
  searchInput.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const searchTerm = this.value.toLowerCase().trim();
      const tbody = document.getElementById('modal-status-table-body');
      if (!tbody) return;
      
      const rows = tbody.querySelectorAll('tr.draggable-row');
      let visibleCount = 0;
      
      rows.forEach(row => {
        const nome = row.querySelector('td[data-column="nome"] .display-text')?.textContent?.toLowerCase() || '';
        const etapa = row.querySelector('td[data-column="etapa"]')?.textContent?.toLowerCase() || '';
        const proximos = row.querySelector('td[data-column="proximos"]')?.textContent?.toLowerCase() || '';
        
        const matches = !searchTerm || 
                        nome.includes(searchTerm) || 
                        etapa.includes(searchTerm) || 
                        proximos.includes(searchTerm);
        
        // Usar setProperty com !important para garantir que sobrescreva o CSS
        if (matches) {
          row.style.setProperty('display', 'table-row', 'important');
          visibleCount++;
        } else {
          row.style.setProperty('display', 'none', 'important');
        }
      });
      
      // Atualizar contador
      const countBadge = document.getElementById('modal-status-count-badge');
      const countSpan = document.getElementById('modal-status-count');
      if (countBadge) {
        countBadge.textContent = searchTerm 
          ? `${visibleCount} de ${rows.length} status`
          : `${rows.length} status`;
      }
      if (countSpan) {
        countSpan.textContent = visibleCount;
      }
      
      console.log(` Busca: "${searchTerm}" - ${visibleCount} resultados`);
    }, 200);
  });
  
  // Limpar busca ao pressionar Escape
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      this.value = '';
      this.dispatchEvent(new Event('input'));
    }
  });
}

/**
 * Configura mudanças em tempo real
 */
function setupRealTimeConfigs() {
  // Altura da tabela (removido - agora é fullscreen)
  // Densidade (removido - agora usa tabela compacta padrão)
  
  // Checkboxes de colunas
  const columnCheckboxes = document.querySelectorAll('[id^="modal-col-"]');
  columnCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const columnName = this.id.replace('modal-col-', '');
      toggleColumnVisibility(columnName, this.checked);
    });
  });
  
  // Filtros
  const filterRadios = document.querySelectorAll('input[name="status-filter"]');
  filterRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      filterTableData(this.value);
      
      // Limpar busca ao mudar filtro
      const searchInput = document.getElementById('status-table-search');
      if (searchInput) {
        searchInput.value = '';
      }
    });
  });
}

/**
 * Carrega dados para o modal
 */
async function loadDataToModal() {
  console.log(' Carregando dados para o modal...');
  
  const tbody = document.getElementById('modal-status-table-body');
  if (!tbody) {
    console.error(' Tbody do modal não encontrado');
    return;
  }
  
  // Limpar tabela
  tbody.innerHTML = '<tr><td colspan="9" class="text-center">Carregando dados...</td></tr>';
  
  try {
    let statusData = [];
    
    // Tentar obter dados diretamente de listStatuses para ter acesso completo aos dados
    if (window.firestoreService && typeof window.firestoreService.listStatuses === 'function') {
      try {
        statusData = await window.firestoreService.listStatuses();
        console.log(' Dados obtidos de listStatuses:', statusData.length, 'registros');
      } catch (listError) {
        console.warn(' listStatuses falhou, tentando getEffectiveStatuses:', listError.message);
        // Fallback para getEffectiveStatuses
        if (typeof window.firestoreService.getEffectiveStatuses === 'function') {
          statusData = await window.firestoreService.getEffectiveStatuses();
          statusData = statusData.map((item, index) => ({
            ...item,
            id: `processed_${index + 1}`
          }));
        }
      }
    } else if (window.firestoreService && typeof window.firestoreService.getEffectiveStatuses === 'function') {
      statusData = await window.firestoreService.getEffectiveStatuses();
      console.log(' Dados obtidos do getEffectiveStatuses:', statusData.length, 'registros');
      statusData = statusData.map((item, index) => ({
        ...item,
        id: `processed_${index + 1}`
      }));
    } else {
      // Fallback: extrair da tabela principal
      statusData = extractFromMainTable();
      console.log(' Dados extraídos da tabela principal:', statusData.length, 'registros');
    }
    
    // Renderizar dados
    renderTableData(statusData);
    availableStatuses = Array.isArray(statusData) ? [...statusData] : [];
    
    // Atualizar contadores
    const counter = document.getElementById('modal-status-count');
    const countBadge = document.getElementById('modal-status-count-badge');
    if (counter) {
      counter.textContent = statusData.length;
    }
    if (countBadge) {
      countBadge.textContent = `${statusData.length} status`;
    }
    
    // Limpar campo de busca
    const searchInput = document.getElementById('status-table-search');
    if (searchInput) {
      searchInput.value = '';
    }
    
  } catch (error) {
    console.error(' Erro ao carregar dados:', error);
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Erro ao carregar dados</td></tr>';
  }
}

/**
 * Extrai dados da tabela principal como fallback
 */
function extractFromMainTable() {
  const mainTable = document.querySelector('.status-table-wrapper table tbody');
  if (!mainTable) {
    console.warn(' Tabela principal não encontrada');
    return [];
  }
  
  const rows = Array.from(mainTable.querySelectorAll('tr'));
  console.log(' Extraindo', rows.length, 'linhas da tabela principal');
  
  return rows.map((row, index) => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 6) return null;
    
    // Tentar extrair ID real do HTML (se existir) ou usar índice
    let realId = null;
    const editButton = cells[6]?.querySelector('button[onclick*="editStatus"]');
    if (editButton) {
      const onclickAttr = editButton.getAttribute('onclick') || '';
      const match = onclickAttr.match(/editStatus\(['"](.+?)['"]\)/);
      if (match && match[1]) {
        realId = match[1];
      }
    }
    
    return {
      id: realId || `fallback_${index + 1}`,
      originalId: realId,
      text: cells[1]?.textContent?.trim() || 'N/A',
      stage: cells[2]?.textContent?.trim() || 'N/A',
      order: parseInt(cells[3]?.textContent?.trim()) || 0,
      nextSteps: cells[4]?.textContent?.trim() || '',
      active: cells[5]?.textContent?.trim().toLowerCase().includes('sim') || 
              cells[5]?.querySelector('.btn-success') !== null,
      archiveContracts: row.getAttribute('data-archive-contracts') === 'true' ||
              row.querySelector('td[data-column="arquivar"] input[type="checkbox"]')?.checked === true
    };
  }).filter(Boolean);
}

/**
 * Renderiza dados na tabela do modal com edição inline
 */
function renderTableData(data) {
  const tbody = document.getElementById('modal-status-table-body');
  console.log(' DEBUG: tbody encontrado:', !!tbody);
  
  if (!tbody) {
    console.error(' ERRO: Tbody não encontrado! Seletor: #modal-status-table-body');
    
    // Tentar encontrar outros elementos relacionados
    const modal = document.getElementById('status-table-config-modal');
    const tableWrapper = document.querySelector('.config-table-wrapper');
    const table = document.querySelector('.config-table-wrapper table');
    
    console.log(' DEBUG: Modal encontrado:', !!modal);
    console.log(' DEBUG: Table wrapper encontrado:', !!tableWrapper);
    console.log(' DEBUG: Table encontrada:', !!table);
    
    if (table) {
      console.log(' DEBUG: HTML da tabela:', table.outerHTML.substring(0, 500));
    }
    
    return;
  }
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Nenhum dado encontrado</td></tr>';
    return;
  }
  
  console.log(' DEBUG: Limpando tbody e renderizando', data.length, 'itens');
  tbody.innerHTML = '';
  
  data.forEach((item, index) => {
    const itemId = item.id || item.originalId || `item_${index + 1}`;
    
    // Valores de cor com fallbacks
    const statusColor = item.color || '#FFFFFF';
    const statusBgColor = item.bgColor || '#0D6EFD';
    
    // Converter nextSteps para string (pode vir como Array do Firestore)
    const nextStepsStr = Array.isArray(item.nextSteps) 
      ? item.nextSteps.join(', ') 
      : (item.nextSteps || '');
    
    if (window.__DEBUG__) {
      console.log(` Renderizando item ${index + 1}:`, { 
        id: itemId, 
        text: item.text, 
        color: statusColor,
        bgColor: statusBgColor,
        nextSteps: nextStepsStr,
        originalItem: item 
      });
    }
    
    const row = document.createElement('tr');
    row.setAttribute('data-status-id', itemId);
    row.setAttribute('data-status-text', item.text);
    row.setAttribute('data-status-stage', item.stage || 'Outros');
    row.setAttribute('data-color', statusColor);
    row.setAttribute('data-bg-color', statusBgColor);
    row.setAttribute('data-order', item.order || 0);
    row.setAttribute('data-active', item.active !== false ? 'true' : 'false');
    row.setAttribute('data-archive-contracts', item.archiveContracts ? 'true' : 'false');
    row.setAttribute('draggable', 'true');
    row.classList.add('draggable-row');
    row.innerHTML = `
      <td data-column="numero" class="drag-handle text-center" title="Arraste para reordenar">
        <i class="bi bi-grip-vertical text-muted drag-icon"></i>
        <span class="order-number ms-1">${index + 1}</span>
      </td>
      <td data-column="nome" class="editable-cell" data-field="text" data-original="${escapeHtml(item.text)}">
        <span class="display-text">${escapeHtml(item.text)}</span>
        ${item.archiveContracts ? '<span class="badge bg-warning text-dark ms-2 status-archive-indicator"><i class="bi bi-archive me-1"></i>Arquivado</span>' : ''}
        <input type="text" class="edit-input form-control form-control-sm" value="${escapeHtml(item.text)}" style="display: none;">
      </td>
      <td data-column="etapa" class="editable-cell" data-field="stage" data-original="${escapeHtml(item.stage)}">
        <span class="display-text badge bg-secondary">${escapeHtml(item.stage)}</span>
        <input type="text" class="edit-input form-control form-control-sm" value="${escapeHtml(item.stage)}" style="display: none;">
      </td>
      <td data-column="ordem" class="text-center order-editable" data-field="order" data-original="${item.order || 0}" data-status-id="${itemId}" data-status-text="${escapeHtml(item.text)}">
        <span class="display-text order-value badge bg-light text-dark" style="cursor: pointer;" title="Clique para alterar a ordem">${item.order || 0}</span>
        <input type="number" class="edit-order-input form-control form-control-sm text-center" value="${item.order || 0}" min="1" style="display: none; width: 70px; margin: 0 auto;">
      </td>
      <td data-column="cor" class="text-center" data-color="${statusColor}" data-bg-color="${statusBgColor}">
        <div class="color-preview d-flex align-items-center justify-content-center gap-2">
          <span class="color-swatch" style="background: ${statusBgColor}; color: ${statusColor}; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;">Aa</span>
          <button type="button" class="btn btn-sm btn-outline-secondary color-edit-btn p-1" 
                  onclick="openColorEditor('${itemId}', '${statusColor}', '${statusBgColor}')" 
                  title="Editar cores">
            <i class="bi bi-palette" style="font-size: 0.7rem;"></i>
          </button>
        </div>
      </td>
      <td data-column="proximos" class="editable-cell small next-steps-cell" data-field="nextSteps" data-original="${escapeHtml(nextStepsStr)}" data-status-id="${itemId}" data-status-text="${escapeHtml(item.text)}">
        <div class="next-steps-display">
          <span class="display-text">${nextStepsStr ? escapeHtml(nextStepsStr) : '<em class="text-muted">Nenhum</em>'}</span>
          <button type="button" class="btn btn-sm btn-link next-steps-edit-btn p-0 ms-1" title="Clique para selecionar status de destino">
            <i class="bi bi-pencil-square text-primary"></i>
          </button>
        </div>
        <div class="next-steps-selector">
          <div class="next-steps-search">
            <input type="text" class="form-control form-control-sm next-steps-search-input" placeholder="Buscar status...">
          </div>
          <div class="next-steps-selected-tags"></div>
          <div class="next-steps-list"></div>
          <div class="next-steps-actions">
            <button type="button" class="btn btn-sm btn-secondary next-steps-cancel-btn">Cancelar</button>
            <button type="button" class="btn btn-sm btn-primary next-steps-save-btn">
              <i class="bi bi-check me-1"></i>Salvar
            </button>
          </div>
        </div>
        <input type="text" class="edit-input form-control form-control-sm" value="${escapeHtml(nextStepsStr)}" style="display: none;">
      </td>
      <td data-column="ativo" class="text-center">
        <div class="form-check form-switch d-inline-flex justify-content-center">
          <input class="form-check-input" type="checkbox" ${item.active ? 'checked' : ''}
                 onchange="toggleStatusActive('${itemId}', this.checked)" title="Ativar ou desativar leitura padrão">
        </div>
      </td>
      <td data-column="arquivar" class="text-center">
        <div class="form-check form-switch d-inline-flex justify-content-center">
          <input class="form-check-input" type="checkbox" ${item.archiveContracts ? 'checked' : ''}
                 onchange="toggleArchiveContracts('${itemId}', this.checked)" title="Arquiva processos deste status das leituras principais">
        </div>
      </td>
      <td data-column="acoes" class="text-center">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary edit-btn" onclick="startInlineEdit('${itemId}')" title="Editar inline">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-outline-success save-btn" onclick="saveInlineEdit('${itemId}')" title="Salvar" style="display: none;">
            <i class="bi bi-check"></i>
          </button>
          <button class="btn btn-outline-secondary cancel-btn" onclick="cancelInlineEdit('${itemId}')" title="Cancelar" style="display: none;">
            <i class="bi bi-x"></i>
          </button>
          <button class="btn btn-outline-warning fill-form-btn" onclick="fillFormWithStatus('${itemId}')" title="Editar no formulário">
            <i class="bi bi-form"></i>
          </button>
          <button class="btn btn-outline-danger" onclick="deleteStatusItem('${itemId}')" title="Excluir">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    `;
    
    // Adicionar eventos de duplo clique para edição
    const editableCells = row.querySelectorAll('.editable-cell');
    editableCells.forEach(cell => {
      cell.addEventListener('dblclick', () => {
        startInlineEdit(itemId);
      });
    });
    
    tbody.appendChild(row);
    console.log(` DEBUG: Linha ${index + 1} adicionada ao tbody`);
  });
  
  console.log(' Tabela renderizada com', data.length, 'registros e edição inline');
  
  // Verificar se as linhas foram realmente adicionadas
  const finalRowCount = tbody.querySelectorAll('tr').length;
  console.log(' DEBUG: Linhas finais no tbody:', finalRowCount);
  
  // Debug: Aplicar estilos diretamente via JavaScript para forçar visibilidade
  const table = document.querySelector('#status-table-config-modal table');
  if (table) {
      table.style.cssText = `
          width: 100% !important;
          display: table !important;
          visibility: visible !important;
          position: relative !important;
          transform: none !important;
          border-collapse: collapse !important;
          background: white !important;
      `;
      console.log(' Estilos aplicados diretamente na tabela');
  }

  tbody.style.cssText = `
      display: table-row-group !important;
      visibility: visible !important;
      position: relative !important;
      transform: none !important;
  `;
  console.log(' Estilos aplicados diretamente no tbody');

  // Forçar reflow da página
  document.body.offsetHeight;
  
  // Verificar se a tabela está visível
  const tableWrapper = document.querySelector('.config-table-wrapper');
  if (tableWrapper) {
    const styles = window.getComputedStyle(tableWrapper);
    console.log(' DEBUG: Estilos do wrapper:', {
      display: styles.display,
      visibility: styles.visibility,
      opacity: styles.opacity,
      height: styles.height,
      maxHeight: styles.maxHeight
    });
    
    // Verificar a tabela dentro do wrapper
    const table = tableWrapper.querySelector('table');
    if (table) {
      const tableStyles = window.getComputedStyle(table);
      console.log(' DEBUG: Estilos da tabela:', {
        display: tableStyles.display,
        visibility: tableStyles.visibility,
        width: tableStyles.width,
        minWidth: tableStyles.minWidth
      });
      
      // Verificar tbody
      const tbodyStyles = window.getComputedStyle(tbody);
      console.log(' DEBUG: Estilos do tbody:', {
        display: tbodyStyles.display,
        visibility: tbodyStyles.visibility,
        height: tbodyStyles.height
      });
      
      // Verificar primeira linha se existir
      const firstRow = tbody.querySelector('tr');
      if (firstRow) {
        const rowStyles = window.getComputedStyle(firstRow);
        console.log(' DEBUG: Estilos da primeira linha:', {
          display: rowStyles.display,
          visibility: rowStyles.visibility,
          height: rowStyles.height
        });
      }
    }
  }
  
  // Forçar reflow para garantir renderização
  if (tableWrapper) {
    tableWrapper.style.display = 'none';
    tableWrapper.offsetHeight; // Force reflow
    tableWrapper.style.display = 'block';
    console.log(' DEBUG: Forçado reflow da tabela');
  }
  
  // Inicializar drag-and-drop para reordenação
  initDragAndDrop(tbody);
  
  // Inicializar edição direta de ordem (clique no número)
  initOrderEdit(tbody);
  
  // Inicializar seletores de próximos status (multi-select)
  initNextStepsSelectors(tbody);
}

/**
 * Inicializa a edição direta de ordem por clique
 */
function initOrderEdit(tbody) {
  if (!tbody) return;
  
  tbody.querySelectorAll('td.order-editable').forEach(cell => {
    const displayText = cell.querySelector('.display-text');
    const editInput = cell.querySelector('.edit-order-input');
    
    if (!displayText || !editInput) return;
    
    // Flag para evitar chamadas duplicadas
    let isSaving = false;
    
    // Clique no badge abre o editor
    displayText.addEventListener('click', (e) => {
      e.stopPropagation();
      isSaving = false;
      startOrderEdit(cell);
    });
    
    // Enter confirma, Escape cancela
    editInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (isSaving) return;
        isSaving = true;
        
        const statusId = cell.getAttribute('data-status-id');
        const statusText = cell.getAttribute('data-status-text');
        const newOrder = parseInt(editInput.value) || 1;
        
        // Remover foco para evitar blur duplicado
        editInput.blur();
        
        console.log('⌨ Enter pressionado, salvando ordem:', newOrder);
        changeStatusOrder(statusId, statusText, newOrder);
      } else if (e.key === 'Escape') {
        isSaving = true; // Previne blur de salvar
        cancelOrderEdit(cell);
      }
    });
    
    // Blur (perder foco) também confirma (se não foi Enter/Escape)
    editInput.addEventListener('blur', () => {
      // Se já está salvando (Enter/Escape), ignorar
      if (isSaving) {
        isSaving = false;
        return;
      }
      
      const currentValue = parseInt(editInput.value) || 1;
      const originalValue = parseInt(cell.getAttribute('data-original')) || 1;
      
      // Se mudou o valor, salvar
      if (currentValue !== originalValue) {
        isSaving = true;
        const statusId = cell.getAttribute('data-status-id');
        const statusText = cell.getAttribute('data-status-text');
        console.log(' Blur detectado, salvando ordem:', currentValue);
        changeStatusOrder(statusId, statusText, currentValue);
      } else {
        // Se não mudou, apenas fechar
        cancelOrderEdit(cell);
      }
    });
  });
  
  console.log(' Edição de ordem inicializada para', tbody.querySelectorAll('td.order-editable').length, 'células');
}

/**
 * Inicializa o sistema de drag-and-drop para reordenação de status
 */
function initDragAndDrop(tbody) {
  if (!tbody) return;
  
  let draggedRow = null;
  let placeholder = null;
  
  // Criar placeholder visual
  function createPlaceholder() {
    const ph = document.createElement('tr');
    ph.className = 'drag-placeholder';
    ph.innerHTML = '<td colspan="9" style="height: 4px; background: var(--bs-primary); padding: 0; border: none;"></td>';
    return ph;
  }
  
  // Event handlers para cada linha
  tbody.querySelectorAll('tr.draggable-row').forEach(row => {
    const dragHandle = row.querySelector('.drag-handle');
    
    // Iniciar drag apenas pelo handle
    if (dragHandle) {
      dragHandle.addEventListener('mousedown', () => {
        row.setAttribute('draggable', 'true');
      });
      
      dragHandle.addEventListener('mouseup', () => {
        // Mantém draggable para permitir o drag iniciar
      });
    }
    
    row.addEventListener('dragstart', (e) => {
      draggedRow = row;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.getAttribute('data-status-id'));
      
      // Criar placeholder
      placeholder = createPlaceholder();
      
      // Adicionar estilo de opacidade após um pequeno delay
      setTimeout(() => {
        row.style.opacity = '0.5';
      }, 0);
    });
    
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      row.style.opacity = '';
      row.setAttribute('draggable', 'true');
      
      // Remover placeholder
      if (placeholder && placeholder.parentNode) {
        placeholder.remove();
      }
      
      // Se houve reordenação, salvar novas ordens
      if (draggedRow) {
        updateOrdersAfterDrag(tbody);
      }
      
      draggedRow = null;
      placeholder = null;
    });
    
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      if (!draggedRow || draggedRow === row) return;
      
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      
      // Inserir placeholder antes ou depois da linha atual
      if (e.clientY < midY) {
        row.parentNode.insertBefore(placeholder, row);
      } else {
        row.parentNode.insertBefore(placeholder, row.nextSibling);
      }
    });
    
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      
      if (!draggedRow || draggedRow === row) return;
      
      // Mover a linha para a posição do placeholder
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.insertBefore(draggedRow, placeholder);
        placeholder.remove();
      }
    });
  });
  
  console.log(' Drag-and-drop inicializado para', tbody.querySelectorAll('tr.draggable-row').length, 'linhas');
}

/**
 * Normaliza um nome de status para uso como ID de documento.
 * Usa a mesma lógica da Cloud Function para evitar duplicações.
 * @param {string} text - Nome do status
 * @returns {string} ID normalizado
 */
function statusDocId(text) {
  return String(text || '')
    .replace(/[/#?%:]/g, '-')
    .trim();
}

/**
 * Atualiza as ordens após drag-and-drop e salva no banco
 * OTIMIZADO: Usa batch write direto no Firestore para performance
 */
async function updateOrdersAfterDrag(tbody) {
  const rows = tbody.querySelectorAll('tr.draggable-row');
  const updates = [];
  
  rows.forEach((row, index) => {
    const newOrder = index + 1;
    const statusId = row.getAttribute('data-status-id');
    const statusText = row.getAttribute('data-status-text');
    const currentOrder = parseFloat(row.getAttribute('data-order')) || 0;
    
    // Atualizar visual imediatamente (feedback instantâneo)
    const orderNumber = row.querySelector('.order-number');
    const orderValue = row.querySelector('.order-value');
    if (orderNumber) orderNumber.textContent = newOrder;
    if (orderValue) orderValue.textContent = newOrder;
    
    // Atualizar data-attributes
    row.setAttribute('data-order', newOrder);
    const orderCell = row.querySelector('td[data-column="ordem"]');
    if (orderCell) orderCell.setAttribute('data-original', newOrder);
    
    // Marcar para atualização se mudou
    if (currentOrder !== newOrder) {
      updates.push({
        id: statusId,
        text: statusText,
        newOrder: newOrder,
        row: row
      });
    }
  });
  
  if (updates.length === 0) {
    console.log(' Nenhuma alteração de ordem detectada');
    return;
  }
  
  console.log(' Salvando', updates.length, 'alterações de ordem (batch otimizado)...');
  
  // Mostrar indicador de salvamento
  const saveIndicator = document.createElement('div');
  saveIndicator.className = 'position-fixed top-0 start-50 translate-middle-x mt-3 alert alert-info py-2 px-4';
  saveIndicator.style.zIndex = '10000';
  saveIndicator.innerHTML = '<i class="bi bi-arrow-repeat spin me-2"></i>Salvando ordem...';
  document.body.appendChild(saveIndicator);
  
  try {
    // OTIMIZAÇÃO: Usar batch write direto no Firestore (muito mais rápido)
    const db = firebase.firestore();
    const batch = db.batch();
    
    for (const update of updates) {
      // Usar a mesma lógica de ID que a Cloud Function
      const docId = statusDocId(update.text);
      const docRef = db.collection('statusConfig').doc(docId);
      
      // Atualizar apenas o campo order (preserva outros campos)
      batch.update(docRef, {
        order: update.newOrder,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    
    // Commit único de todas as alterações (muito mais rápido)
    await batch.commit();
    console.log(` ${updates.length} ordens atualizadas em batch`);
    
    // Atualizar EFFECTIVE_STATUS_CONFIG
    if (window.EFFECTIVE_STATUS_CONFIG && Array.isArray(window.EFFECTIVE_STATUS_CONFIG)) {
      updates.forEach(update => {
        const idx = window.EFFECTIVE_STATUS_CONFIG.findIndex(s => s.text === update.text);
        if (idx !== -1) {
          window.EFFECTIVE_STATUS_CONFIG[idx].order = update.newOrder;
        }
      });
      // Reordenar
      window.EFFECTIVE_STATUS_CONFIG.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    
    // Invalidar cache
    try {
      localStorage.removeItem('cachedStatuses');
    } catch { /* ignore */ }
    
    // Mostrar sucesso
    saveIndicator.className = 'position-fixed top-0 start-50 translate-middle-x mt-3 alert alert-success py-2 px-4';
    saveIndicator.innerHTML = '<i class="bi bi-check-lg me-2"></i>Ordem atualizada!';
    
    // Re-renderizar visualização (com pequeno delay para UI)
    setTimeout(() => refreshCurrentView(), 100);
    
  } catch (error) {
    console.error(' Erro ao salvar ordens:', error);
    saveIndicator.className = 'position-fixed top-0 start-50 translate-middle-x mt-3 alert alert-danger py-2 px-4';
    saveIndicator.innerHTML = '<i class="bi bi-x-lg me-2"></i>Erro ao salvar ordem';
  }
  
  // Remover indicador após 1.5 segundos (mais rápido)
  setTimeout(() => {
    saveIndicator.remove();
  }, 1500);
}

/**
 * Inicia edição de ordem de um status específico
 * @param {HTMLElement} cell - Célula da ordem clicada
 */
function startOrderEdit(cell) {
  const displayText = cell.querySelector('.display-text');
  const editInput = cell.querySelector('.edit-order-input');
  
  if (!displayText || !editInput) return;
  
  // Esconder display, mostrar input
  displayText.style.display = 'none';
  editInput.style.display = 'block';
  editInput.focus();
  editInput.select();
}

/**
 * Cancela edição de ordem
 * @param {HTMLElement} cell - Célula da ordem
 */
function cancelOrderEdit(cell) {
  const displayText = cell.querySelector('.display-text');
  const editInput = cell.querySelector('.edit-order-input');
  const originalOrder = cell.getAttribute('data-original');
  
  if (!displayText || !editInput) return;
  
  // Restaurar valor original
  editInput.value = originalOrder;
  
  // Esconder input, mostrar display
  editInput.style.display = 'none';
  displayText.style.display = 'inline-block';
}

/**
 * Muda a ordem de um status para uma posição específica
 * Se a posição já estiver ocupada, empurra os outros status para frente
 * @param {string} statusId - ID do status a mover
 * @param {string} statusText - Texto do status
 * @param {number} newOrder - Nova posição desejada
 */
async function changeStatusOrder(statusId, statusText, newOrder) {
  console.log(' changeStatusOrder chamada com:', { statusId, statusText, newOrder });
  
  const tbody = document.getElementById('modal-status-table-body');
  if (!tbody) {
    console.error(' tbody não encontrado');
    return;
  }
  
  const rows = Array.from(tbody.querySelectorAll('tr.draggable-row'));
  console.log(' Total de linhas:', rows.length);
  
  // Buscar a linha pelo ID ou pelo texto (fallback)
  let currentRow = rows.find(r => r.getAttribute('data-status-id') === statusId);
  
  // Se não encontrou pelo ID, tentar pelo texto
  if (!currentRow && statusText) {
    currentRow = rows.find(r => r.getAttribute('data-status-text') === statusText);
    console.log(' Buscando por texto:', statusText, '- Encontrou:', !!currentRow);
  }
  
  if (!currentRow) {
    console.error(' Linha não encontrada para ID:', statusId, 'ou texto:', statusText);
    return;
  }
  
  const currentOrder = parseInt(currentRow.getAttribute('data-order')) || 0;
  newOrder = parseInt(newOrder) || 1;
  
  console.log(' Ordem atual:', currentOrder, '-> Nova ordem:', newOrder);
  
  // Validar limites
  if (newOrder < 1) newOrder = 1;
  if (newOrder > rows.length) newOrder = rows.length;
  
  // Se não mudou, apenas fechar o editor
  if (currentOrder === newOrder) {
    console.log(' Ordem não mudou, fechando editor');
    const cell = currentRow.querySelector('td[data-column="ordem"]');
    if (cell) cancelOrderEdit(cell);
    return;
  }
  
  console.log(` Movendo "${statusText}" da posição ${currentOrder} para ${newOrder}`);
  
  // Mostrar indicador de salvamento
  const saveIndicator = document.createElement('div');
  saveIndicator.className = 'position-fixed top-0 start-50 translate-middle-x mt-3 alert alert-info py-2 px-4';
  saveIndicator.style.zIndex = '10000';
  saveIndicator.innerHTML = '<i class="bi bi-arrow-repeat spin me-2"></i>Reordenando...';
  document.body.appendChild(saveIndicator);
  
  try {
    // Verificar se firebase está disponível
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      throw new Error('Firebase não está disponível');
    }
    
    const db = firebase.firestore();
    const batch = db.batch();
    const updates = [];
    
    // Coletar todos os status com suas ordens atuais
    const statusList = rows.map(row => ({
      id: row.getAttribute('data-status-id'),
      text: row.getAttribute('data-status-text'),
      order: parseInt(row.getAttribute('data-order')) || 0,
      row: row
    })).sort((a, b) => a.order - b.order);
    
    // Remover o status atual da lista
    const movingStatus = statusList.find(s => s.id === statusId);
    const filteredList = statusList.filter(s => s.id !== statusId);
    
    // Inserir na nova posição
    filteredList.splice(newOrder - 1, 0, movingStatus);
    
    // Recalcular ordens
    filteredList.forEach((status, index) => {
      const newOrderValue = index + 1;
      if (status.order !== newOrderValue) {
        updates.push({
          id: status.id,
          text: status.text,
          newOrder: newOrderValue,
          row: status.row
        });
        
        // Atualizar batch
        const docId = statusDocId(status.text);
        const docRef = db.collection('statusConfig').doc(docId);
        batch.update(docRef, {
          order: newOrderValue,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    });
    
    if (updates.length === 0) {
      saveIndicator.remove();
      return;
    }
    
    // Commit batch
    await batch.commit();
    console.log(` ${updates.length} ordens atualizadas`);
    
    // Atualizar UI
    updates.forEach(update => {
      update.row.setAttribute('data-order', update.newOrder);
      const orderCell = update.row.querySelector('td[data-column="ordem"]');
      if (orderCell) {
        orderCell.setAttribute('data-original', update.newOrder);
        const displayText = orderCell.querySelector('.display-text');
        const editInput = orderCell.querySelector('.edit-order-input');
        if (displayText) displayText.textContent = update.newOrder;
        if (editInput) editInput.value = update.newOrder;
      }
      const orderNumber = update.row.querySelector('.order-number');
      if (orderNumber) orderNumber.textContent = update.newOrder;
    });
    
    // Reordenar linhas no DOM
    const sortedRows = Array.from(rows).sort((a, b) => {
      return (parseInt(a.getAttribute('data-order')) || 0) - (parseInt(b.getAttribute('data-order')) || 0);
    });
    sortedRows.forEach(row => tbody.appendChild(row));
    
    // Atualizar EFFECTIVE_STATUS_CONFIG
    if (window.EFFECTIVE_STATUS_CONFIG && Array.isArray(window.EFFECTIVE_STATUS_CONFIG)) {
      updates.forEach(update => {
        const idx = window.EFFECTIVE_STATUS_CONFIG.findIndex(s => s.text === update.text);
        if (idx !== -1) {
          window.EFFECTIVE_STATUS_CONFIG[idx].order = update.newOrder;
        }
      });
      window.EFFECTIVE_STATUS_CONFIG.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    
    // Invalidar cache
    try {
      localStorage.removeItem('cachedStatuses');
    } catch { /* ignore */ }
    
    // Fechar editor da célula
    const cell = currentRow.querySelector('td[data-column="ordem"]');
    if (cell) cancelOrderEdit(cell);
    
    // Sucesso
    saveIndicator.className = 'position-fixed top-0 start-50 translate-middle-x mt-3 alert alert-success py-2 px-4';
    saveIndicator.innerHTML = '<i class="bi bi-check-lg me-2"></i>Ordem atualizada!';
    
  } catch (error) {
    console.error(' Erro ao reordenar:', error);
    saveIndicator.className = 'position-fixed top-0 start-50 translate-middle-x mt-3 alert alert-danger py-2 px-4';
    saveIndicator.innerHTML = '<i class="bi bi-x-lg me-2"></i>Erro ao reordenar';
  }
  
  setTimeout(() => saveIndicator.remove(), 1500);
}

// Expor funções globalmente
window.changeStatusOrder = changeStatusOrder;
window.startOrderEdit = startOrderEdit;
window.cancelOrderEdit = cancelOrderEdit;

// ============================================================================
// SELETOR MULTI-SELECT PARA PRÓXIMOS STATUS
// ============================================================================

/**
 * Abre o seletor de próximos status
 * @param {HTMLElement} cell - Célula da coluna "proximos"
 */
async function openNextStepsSelector(cell) {
  console.log(' openNextStepsSelector chamada');
  
  const selector = cell.querySelector('.next-steps-selector');
  const display = cell.querySelector('.next-steps-display');
  
  console.log(' Elementos encontrados:', { selector: !!selector, display: !!display });
  
  if (!selector) {
    console.error(' Seletor não encontrado na célula');
    return;
  }
  
  // Fechar outros seletores abertos
  document.querySelectorAll('.next-steps-selector.show').forEach(s => {
    if (s !== selector) {
      s.classList.remove('show');
      s.style.display = 'none';
    }
  });
  
  // Pegar status atualmente selecionados (currentStatusId não utilizado)
  // const currentStatusId = cell.closest('tr')?.getAttribute('data-status-id');
  const currentStatusText = cell.closest('tr')?.getAttribute('data-status-text') || cell.getAttribute('data-status-text');
  const originalValue = cell.getAttribute('data-original') || '';
  const selectedStatuses = originalValue.split(',').map(s => s.trim()).filter(s => s);
  
  console.log(' Abrindo seletor para:', currentStatusText, 'Selecionados:', selectedStatuses);
  
  // Pegar todos os status disponíveis - tentar múltiplas fontes
  let allStatuses = [];
  
  // Fonte 1: EFFECTIVE_STATUS_CONFIG
  if (window.EFFECTIVE_STATUS_CONFIG && Array.isArray(window.EFFECTIVE_STATUS_CONFIG) && window.EFFECTIVE_STATUS_CONFIG.length > 0) {
    console.log(' Usando EFFECTIVE_STATUS_CONFIG:', window.EFFECTIVE_STATUS_CONFIG.length, 'status');
    allStatuses = window.EFFECTIVE_STATUS_CONFIG.map(s => ({
      text: s.text,
      color: s.color || '#6c757d',
      bgColor: s.bgColor || '#e9ecef',
      stage: s.stage || '',
      selected: selectedStatuses.includes(s.text)
    }));
  }
  // Fonte 2: availableStatuses (cache local)
  else if (availableStatuses && availableStatuses.length > 0) {
    console.log(' Usando availableStatuses cache:', availableStatuses.length, 'status');
    allStatuses = availableStatuses.map(s => ({
      text: s.text,
      color: s.color || '#6c757d',
      bgColor: s.bgColor || '#e9ecef',
      stage: s.stage || '',
      selected: selectedStatuses.includes(s.text)
    }));
  }
  // Fonte 3: Buscar do Firestore
  else if (window.firestoreService?.getEffectiveStatuses) {
    console.log(' Buscando status do Firestore...');
    try {
      const statuses = await window.firestoreService.getEffectiveStatuses();
      allStatuses = statuses.map(s => ({
        text: s.text,
        color: s.color || '#6c757d',
        bgColor: s.bgColor || '#e9ecef',
        stage: s.stage || '',
        selected: selectedStatuses.includes(s.text)
      }));
      // Guardar em cache
      availableStatuses = statuses;
    } catch (error) {
      console.error(' Erro ao buscar status:', error);
    }
  }
  // Fonte 4: Coletar da própria tabela
  else {
    console.log(' Coletando status da tabela...');
    const tbody = document.getElementById('modal-status-table-body');
    if (tbody) {
      tbody.querySelectorAll('tr.draggable-row').forEach(row => {
        const text = row.getAttribute('data-status-text');
        const color = row.getAttribute('data-color') || '#6c757d';
        const bgColor = row.getAttribute('data-bg-color') || '#e9ecef';
        if (text) {
          allStatuses.push({
            text,
            color,
            bgColor,
            stage: '',
            selected: selectedStatuses.includes(text)
          });
        }
      });
    }
  }
  
  // Filtrar: não incluir o próprio status
  allStatuses = allStatuses.filter(s => s.text !== currentStatusText);
  
  console.log(' Status disponíveis para seleção:', allStatuses.length);
  
  if (allStatuses.length === 0) {
    console.warn(' Nenhum status disponível para seleção');
  }
  
  // Ordenar: selecionados primeiro, depois alfabético
  allStatuses.sort((a, b) => {
    if (a.selected && !b.selected) return -1;
    if (!a.selected && b.selected) return 1;
    return a.text.localeCompare(b.text, 'pt-BR');
  });
  
  // Renderizar lista
  const list = selector.querySelector('.next-steps-list');
  if (list) {
    if (allStatuses.length === 0) {
      list.innerHTML = '<div class="text-muted text-center p-3">Nenhum outro status disponível</div>';
    } else {
      console.log(' Renderizando', allStatuses.length, 'status. Primeiro:', allStatuses[0]);
      list.innerHTML = allStatuses.map(status => `
        <div class="next-step-option ${status.selected ? 'selected' : ''}" data-status-text="${escapeHtml(status.text)}">
          <input type="checkbox" ${status.selected ? 'checked' : ''} value="${escapeHtml(status.text)}">
          <span class="option-label">${escapeHtml(status.text)}</span>
          <span class="option-stage">${escapeHtml(status.stage || '')}</span>
        </div>
      `).join('');
      
      console.log(' HTML gerado:', list.innerHTML.substring(0, 500));
      
      // Adicionar eventos aos checkboxes
      list.querySelectorAll('.next-step-option').forEach(option => {
        option.addEventListener('click', (e) => {
          const checkbox = option.querySelector('input[type="checkbox"]');
          if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
          }
          option.classList.toggle('selected', checkbox.checked);
          updateNextStepsPreview(cell);
        });
      });
    }
  }
  
  // Atualizar preview
  updateNextStepsPreview(cell);
  
  // Limpar busca e configurar evento
  const searchInput = selector.querySelector('.next-steps-search-input');
  if (searchInput) {
    searchInput.value = '';
    filterNextStepsList(list, '');
    
    // Remover listener anterior e adicionar novo
    searchInput.removeEventListener('input', searchInput._searchHandler);
    searchInput._searchHandler = (e) => {
      filterNextStepsList(list, e.target.value);
    };
    searchInput.addEventListener('input', searchInput._searchHandler);
  }
  
  // Mostrar seletor com posição fixa calculada
  const cellRect = cell.getBoundingClientRect();
  selector.style.top = `${cellRect.bottom + 4}px`;
  selector.style.left = `${Math.max(10, cellRect.left - 100)}px`;
  
  // Ajustar se sair da tela pela direita
  const selectorWidth = 320;
  if (cellRect.left + selectorWidth > window.innerWidth - 20) {
    selector.style.left = `${window.innerWidth - selectorWidth - 20}px`;
  }
  
  // Ajustar se sair da tela por baixo
  const selectorHeight = 400;
  if (cellRect.bottom + selectorHeight > window.innerHeight - 20) {
    selector.style.top = `${cellRect.top - selectorHeight - 4}px`;
  }
  
  selector.classList.add('show');
  selector.style.display = 'block';
  
  // Focar no campo de busca
  if (searchInput) {
    setTimeout(() => searchInput.focus(), 50);
  }
  
  // Esconder display
  if (display) display.style.display = 'none';
}

/**
 * Fecha o seletor de próximos status
 * @param {HTMLElement} cell - Célula da coluna "proximos"
 * @param {boolean} cancel - Se true, não salva as alterações
 */
function closeNextStepsSelector(cell) {
  const selector = cell.querySelector('.next-steps-selector');
  const display = cell.querySelector('.next-steps-display');
  
  if (selector) {
    selector.classList.remove('show');
    selector.style.display = 'none';
  }
  if (display) display.style.display = 'flex';
}

/**
 * Atualiza o preview de status selecionados
 * @param {HTMLElement} cell - Célula da coluna "proximos"
 */
function updateNextStepsPreview(cell) {
  const selector = cell.querySelector('.next-steps-selector');
  const tagsContainer = selector?.querySelector('.next-steps-selected-tags');
  
  if (!tagsContainer) return;
  
  const selectedCheckboxes = selector.querySelectorAll('.next-steps-list input[type="checkbox"]:checked');
  const selectedStatuses = Array.from(selectedCheckboxes).map(cb => cb.value);
  
  if (selectedStatuses.length === 0) {
    tagsContainer.innerHTML = '<span class="text-muted small">Nenhum selecionado</span>';
  } else {
    tagsContainer.innerHTML = selectedStatuses.map(status => `
      <span class="next-steps-tag" data-status="${escapeHtml(status)}">
        ${escapeHtml(status)}
        <button type="button" class="next-steps-tag-remove" data-status="${escapeHtml(status)}">&times;</button>
      </span>
    `).join('');
    
    // Adicionar evento para remover tags
    tagsContainer.querySelectorAll('.next-steps-tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const statusToRemove = btn.getAttribute('data-status');
        const checkbox = selector.querySelector(`.next-steps-list input[value="${statusToRemove}"]`);
        if (checkbox) {
          checkbox.checked = false;
          checkbox.closest('.next-step-option').classList.remove('selected');
          updateNextStepsPreview(cell);
        }
      });
    });
  }
}

/**
 * Filtra a lista de próximos status pela busca
 * @param {HTMLElement} list - Container da lista
 * @param {string} term - Termo de busca
 */
function filterNextStepsList(list, term) {
  if (!list) return;
  
  const normalizedTerm = term.toLowerCase().trim();
  const options = list.querySelectorAll('.next-step-option');
  
  options.forEach(item => {
    const text = item.getAttribute('data-status-text')?.toLowerCase() || '';
    const matches = !normalizedTerm || text.includes(normalizedTerm);
    // Usar setProperty com !important para garantir que sobrescreva o CSS
    if (matches) {
      item.style.setProperty('display', 'flex', 'important');
    } else {
      item.style.setProperty('display', 'none', 'important');
    }
  });
}

/**
 * Salva as alterações de próximos status
 * @param {HTMLElement} cell - Célula da coluna "proximos"
 */
async function saveNextSteps(cell) {
  const selector = cell.querySelector('.next-steps-selector');
  const row = cell.closest('tr');
  const statusId = row?.getAttribute('data-status-id');
  const statusText = row?.getAttribute('data-status-text');
  
  if (!statusId || !statusText) {
    console.error(' Não foi possível identificar o status para salvar');
    closeNextStepsSelector(cell);
    return;
  }
  
  // Pegar status selecionados
  const selectedCheckboxes = selector.querySelectorAll('.next-steps-list input[type="checkbox"]:checked');
  const selectedStatuses = Array.from(selectedCheckboxes).map(cb => cb.value);
  const newValue = selectedStatuses.join(', ');
  const originalValue = cell.getAttribute('data-original') || '';
  
  // Verificar se mudou
  if (newValue === originalValue) {
    console.log(' Próximos status não mudou, fechando');
    closeNextStepsSelector(cell);
    return;
  }
  
  console.log(` Salvando próximos status de "${statusText}": ${newValue || '(vazio)'}`);
  
  // Mostrar indicador de salvamento
  const saveBtn = selector.querySelector('.next-steps-save-btn');
  const originalBtnText = saveBtn?.innerHTML;
  if (saveBtn) {
    saveBtn.innerHTML = '<i class="bi bi-arrow-repeat spin me-1"></i>Salvando...';
    saveBtn.disabled = true;
  }
  
  try {
    const payload = buildStatusPayloadFromRow(row, { nextSteps: selectedStatuses });
    if (!payload) throw new Error('Dados do status indisponíveis');
    
    // Salvar via Cloud Function primeiro, fallback para Firestore direto
    const firestoreService = window.firestoreService;
    
    if (firestoreService && typeof firestoreService.createOrUpdateStatus === 'function') {
      await firestoreService.createOrUpdateStatus(payload);
    } else {
      // Fallback: Firestore direto (atualiza apenas nextSteps)
      const db = firebase.firestore();
      const docId = statusDocId(statusText);
      await db.collection('statusConfig').doc(docId).update({
        nextSteps: selectedStatuses,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    
    // Atualizar UI
    cell.setAttribute('data-original', newValue);
    const displayText = cell.querySelector('.display-text');
    if (displayText) {
      displayText.innerHTML = newValue 
        ? escapeHtml(newValue) 
        : '<em class="text-muted">Nenhum</em>';
    }
    
    // Atualizar input hidden (para compatibilidade)
    const editInput = cell.querySelector('.edit-input');
    if (editInput) editInput.value = newValue;
    
    // Atualizar EFFECTIVE_STATUS_CONFIG
    if (window.EFFECTIVE_STATUS_CONFIG && Array.isArray(window.EFFECTIVE_STATUS_CONFIG)) {
      const idx = window.EFFECTIVE_STATUS_CONFIG.findIndex(s => s.text === statusText);
      if (idx !== -1) {
        window.EFFECTIVE_STATUS_CONFIG[idx].nextSteps = selectedStatuses;
      }
    }
    
    // Mostrar toast de sucesso
    if (window.uiHelpers?.showToast) {
      window.uiHelpers.showToast('Próximos status atualizados', 'success');
    }
    
    closeNextStepsSelector(cell);
    
  } catch (error) {
    console.error(' Erro ao salvar próximos status:', error);
    
    // Restaurar botão
    if (saveBtn) {
      saveBtn.innerHTML = originalBtnText;
      saveBtn.disabled = false;
    }
    
    // Mostrar erro
    if (window.uiHelpers?.showToast) {
      window.uiHelpers.showToast('Erro ao salvar próximos status: ' + error.message, 'danger');
    }
  }
}

/**
 * Inicializa os event listeners para os seletores de próximos status
 * @param {HTMLElement} tbody - Corpo da tabela
 */
function initNextStepsSelectors(tbody) {
  if (!tbody) return;
  
  // Clique no botão de editar
  tbody.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.next-steps-edit-btn');
    if (editBtn) {
      e.preventDefault();
      e.stopPropagation();
      const cell = editBtn.closest('.next-steps-cell');
      if (cell) openNextStepsSelector(cell);
    }
    
    // Clique no botão salvar
    const saveBtn = e.target.closest('.next-steps-save-btn');
    if (saveBtn) {
      e.preventDefault();
      e.stopPropagation();
      const cell = saveBtn.closest('.next-steps-cell');
      if (cell) saveNextSteps(cell);
    }
    
    // Clique no botão cancelar
    const cancelBtn = e.target.closest('.next-steps-cancel-btn');
    if (cancelBtn) {
      e.preventDefault();
      e.stopPropagation();
      const cell = cancelBtn.closest('.next-steps-cell');
      if (cell) closeNextStepsSelector(cell);
    }
  });
  
  // Busca nos seletores
  tbody.addEventListener('input', (e) => {
    if (e.target.classList.contains('next-steps-search-input')) {
      const selector = e.target.closest('.next-steps-selector');
      const list = selector?.querySelector('.next-steps-list');
      if (list) filterNextStepsList(list, e.target.value);
    }
  });
  
  // Fechar seletor ao clicar fora
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.next-steps-cell')) {
      document.querySelectorAll('.next-steps-selector.show').forEach(selector => {
        const cell = selector.closest('.next-steps-cell');
        if (cell) closeNextStepsSelector(cell);
      });
    }
  });
  
  console.log(' Seletores de próximos status inicializados');
}

// Expor funções do seletor de próximos status
window.openNextStepsSelector = openNextStepsSelector;
window.closeNextStepsSelector = closeNextStepsSelector;
window.saveNextSteps = saveNextSteps;

// ============================================================================

/**
 * Inicia edição inline de uma linha
 */
function startInlineEdit(id) {
  // Cancelar qualquer edição em andamento
  cancelAnyEdit();
  
  const row = document.querySelector(`tr[data-status-id="${id}"]`);
  if (!row) return;
  
  console.log(' Iniciando edição inline para ID:', id);
  
  // Marcar como editando
  editingRow = id;
  row.classList.add('editing');
  
  // Guardar dados originais
  const editableCells = row.querySelectorAll('.editable-cell');
  originalData = {};
  
  editableCells.forEach(cell => {
    const field = cell.getAttribute('data-field');
    const original = cell.getAttribute('data-original');
    originalData[field] = original;
    
    // Trocar display para edit
    const displayText = cell.querySelector('.display-text');
    const editInput = cell.querySelector('.edit-input');
    
    if (displayText && editInput) {
      displayText.style.display = 'none';
      editInput.style.display = 'block';
      editInput.focus();
    }
  });
  
  // Trocar botões
  const editBtn = row.querySelector('.edit-btn');
  const saveBtn = row.querySelector('.save-btn');
  const cancelBtn = row.querySelector('.cancel-btn');
  
  if (editBtn) editBtn.style.display = 'none';
  if (saveBtn) saveBtn.style.display = 'inline-block';
  if (cancelBtn) cancelBtn.style.display = 'inline-block';
  
  // Adicionar eventos de teclado
  const inputs = row.querySelectorAll('.edit-input');
  inputs.forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveInlineEdit(id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelInlineEdit(id);
      }
    });
  });
}

/**
 * Salva edição inline
 */
async function saveInlineEdit(id) {
  const row = document.querySelector(`tr[data-status-id="${id}"]`);
  if (!row) return;
  
  console.log(' Salvando edição inline para ID:', id);
  const previousText = row.getAttribute('data-status-text');
  
  // Coletar dados editados
  const editableCells = row.querySelectorAll('.editable-cell');
  const newData = {};
  
  editableCells.forEach(cell => {
    const field = cell.getAttribute('data-field');
    const input = cell.querySelector('.edit-input');
    if (input) {
      newData[field] = input.value?.trim();
    }
  });
  
  // Validar dados obrigatórios
  if (!newData.text || !newData.stage) {
    if (window.uiHelpers) window.uiHelpers.showToast('Nome e Etapa são obrigatórios!', 'warning');
    else alert('Nome e Etapa são obrigatórios!');
    return;
  }
  
  // Converter ordem para número
  newData.order = parseFloat(newData.order) || 0;
  
  // Mostrar indicador de salvamento
  row.classList.add('saving');
  
  try {
    // Obter a função createOrUpdateStatus (aguarda se necessário)
    const createOrUpdateStatus = await getCreateOrUpdateStatus();
    const payload = buildStatusPayloadFromRow(row, {
      text: newData.text,
      stage: newData.stage,
      order: newData.order,
      nextSteps: newData.nextSteps ? newData.nextSteps.split(',').map(s => s.trim()).filter(Boolean) : []
    });
    if (!payload) throw new Error('Dados insuficientes para salvar o status');
    await createOrUpdateStatus(payload);
    
    // Sucesso - atualizar display
    editableCells.forEach(cell => {
      const field = cell.getAttribute('data-field');
      const displayText = cell.querySelector('.display-text');
      const input = cell.querySelector('.edit-input');
      
      if (displayText && input) {
        // Atualizar texto de exibição
        let displayValue = newData[field];
        if (field === 'nextSteps' && !displayValue) {
          displayValue = 'Nenhum';
        }
        
        if (field === 'stage') {
          displayText.innerHTML = displayValue;
          displayText.className = 'display-text badge bg-secondary';
        } else {
          displayText.textContent = displayValue;
        }
        
        // Atualizar data-original
        cell.setAttribute('data-original', newData[field]);
        
        // Voltar ao modo display
        displayText.style.display = field === 'stage' ? 'inline-block' : 'inline';
        input.style.display = 'none';
        }
      });
      
      row.classList.remove('saving', 'editing');
      row.classList.add('saved');
      
      // Restaurar botões
      restoreButtons(row);
      
      row.setAttribute('data-status-text', payload.text);
      row.setAttribute('data-status-stage', payload.stage);
      row.setAttribute('data-order', payload.order);
      console.log(' Status atualizado com sucesso via edição inline');
      
      // IMPORTANTE: Atualizar window.EFFECTIVE_STATUS_CONFIG para refletir os novos dados
      if (window.EFFECTIVE_STATUS_CONFIG && Array.isArray(window.EFFECTIVE_STATUS_CONFIG)) {
        const statusIndex = window.EFFECTIVE_STATUS_CONFIG.findIndex(s => s.text === previousText);
        if (statusIndex !== -1) {
          window.EFFECTIVE_STATUS_CONFIG[statusIndex] = {
            ...window.EFFECTIVE_STATUS_CONFIG[statusIndex],
            text: payload.text,
            stage: payload.stage,
            order: payload.order,
            nextSteps: payload.nextSteps
          };
          console.log(' EFFECTIVE_STATUS_CONFIG atualizado para:', payload.text);
        }
      }
      
      // Também invalidar cache do localStorage
      try {
        localStorage.removeItem('cachedStatuses');
      } catch (e) {
        console.warn(' Não foi possível invalidar cache de status:', e);
      }
      
      // Re-renderizar a visualização atual
      refreshCurrentView();
      
      // Notificar usuário
      if (window.uiHelpers?.showToast) {
        window.uiHelpers.showToast('Status atualizado com sucesso!', 'success');
      }
      
  } catch (error) {
    console.error(' Erro ao salvar edição inline:', error);
    
    row.classList.remove('saving');
    row.classList.add('error');
    
    if (window.uiHelpers) window.uiHelpers.showToast(`Erro ao salvar: ${error.message}`, 'error');
    else alert(`Erro ao salvar: ${error.message}`);
    
    // Manter em modo de edição para tentar novamente
  }
  
  // Limpar estado de edição
  editingRow = null;
  originalData = {};
}

/**
 * Cancela edição inline
 */
function cancelInlineEdit(id) {
  const row = document.querySelector(`tr[data-status-id="${id}"]`);
  if (!row) return;
  
  console.log(' Cancelando edição inline para ID:', id);
  
  // Restaurar valores originais
  const editableCells = row.querySelectorAll('.editable-cell');
  editableCells.forEach(cell => {
    const field = cell.getAttribute('data-field');
    const original = originalData[field] || cell.getAttribute('data-original');
    const displayText = cell.querySelector('.display-text');
    const input = cell.querySelector('.edit-input');
    
    if (input) {
      input.value = original;
    }
    
    if (displayText && input) {
      displayText.style.display = field === 'stage' ? 'inline-block' : 'inline';
      input.style.display = 'none';
    }
  });
  
  row.classList.remove('editing', 'saving', 'error');
  restoreButtons(row);
  
  // Limpar estado
  editingRow = null;
  originalData = {};
}

/**
 * Cancela qualquer edição em andamento
 */
function cancelAnyEdit() {
  if (editingRow) {
    cancelInlineEdit(editingRow);
  }
}

/**
 * Restaura botões da linha
 */
function restoreButtons(row) {
  const editBtn = row.querySelector('.edit-btn');
  const saveBtn = row.querySelector('.save-btn');
  const cancelBtn = row.querySelector('.cancel-btn');
  
  if (editBtn) editBtn.style.display = 'inline-block';
  if (saveBtn) saveBtn.style.display = 'none';
  if (cancelBtn) cancelBtn.style.display = 'none';
}

/**
 * Alterna status ativo/inativo
 */
async function toggleStatusActive(id, active) {
  console.log(' Alterando status ativo para ID:', id, 'Ativo:', active);
  
  const row = document.querySelector(`tr[data-status-id="${id}"]`);
  if (!row) return;
  
  const statusName = row.getAttribute('data-status-text') || row.querySelector('td[data-column="nome"] .display-text')?.textContent?.trim();
  const checkbox = row.querySelector('td[data-column="ativo"] input[type="checkbox"]');
  
  try {
    if (window.firestoreService?.toggleStatusActive) {
      await window.firestoreService.toggleStatusActive(statusName, active);
    } else {
      const payload = buildStatusPayloadFromRow(row, { active });
      if (!payload) throw new Error('Dados do status indisponíveis');
      const createOrUpdateStatus = await getCreateOrUpdateStatus();
      await createOrUpdateStatus(payload);
    }
    
    row.setAttribute('data-active', active ? 'true' : 'false');
    if (window.EFFECTIVE_STATUS_CONFIG && Array.isArray(window.EFFECTIVE_STATUS_CONFIG)) {
      const idx = window.EFFECTIVE_STATUS_CONFIG.findIndex((s) => s.text === statusName);
      if (idx !== -1) {
        window.EFFECTIVE_STATUS_CONFIG[idx].active = active;
      }
    }
    
    if (window.uiHelpers?.showToast) {
      window.uiHelpers.showToast(`Status ${active ? 'ativado' : 'desativado'} com sucesso`, 'success');
    }
    console.log(` Status "${statusName}" marcado como ${active ? 'ativo' : 'inativo'}`);
  } catch (error) {
    console.error(' Erro ao alterar status ativo:', error);
    if (checkbox) {
      checkbox.checked = !active;
    }
    if (window.uiHelpers?.showToast) {
      window.uiHelpers.showToast('Erro ao atualizar status: ' + (error.message || error), 'danger');
    }
  }
}

async function toggleArchiveContracts(id, shouldArchive) {
  console.log(' Alternando arquivamento para ID:', id, 'Arquivar:', shouldArchive);
  const row = document.querySelector(`tr[data-status-id="${id}"]`);
  if (!row) return;

  const checkbox = row.querySelector('td[data-column="arquivar"] input[type="checkbox"]');

  try {
    const payload = buildStatusPayloadFromRow(row, { archiveContracts: shouldArchive });
    if (!payload) throw new Error('Dados do status não encontrados');
    const createOrUpdateStatus = await getCreateOrUpdateStatus();
    await createOrUpdateStatus(payload);

    row.setAttribute('data-archive-contracts', shouldArchive ? 'true' : 'false');

    // Atualizar badge visual
    let badge = row.querySelector('.status-archive-indicator');
    if (!badge && shouldArchive) {
      const nameCell = row.querySelector('td[data-column="nome"] .display-text');
      if (nameCell) {
        badge = document.createElement('span');
        badge.className = 'badge bg-warning text-dark ms-2 status-archive-indicator';
        badge.innerHTML = '<i class="bi bi-archive me-1"></i>Arquivado';
        nameCell.insertAdjacentElement('afterend', badge);
      }
    }
    if (badge) {
      badge.style.display = shouldArchive ? 'inline-flex' : 'none';
    }

    // Atualizar cache local de status
    if (window.EFFECTIVE_STATUS_CONFIG && Array.isArray(window.EFFECTIVE_STATUS_CONFIG)) {
      const idx = window.EFFECTIVE_STATUS_CONFIG.findIndex((s) => s.text === payload.text);
      if (idx !== -1) {
        window.EFFECTIVE_STATUS_CONFIG[idx].archiveContracts = shouldArchive;
      }
    }
    if (Array.isArray(availableStatuses) && availableStatuses.length) {
      const idx = availableStatuses.findIndex((s) => s.text === payload.text);
      if (idx !== -1) {
        availableStatuses[idx].archiveContracts = shouldArchive;
      }
    }

    if (window.uiHelpers?.showToast) {
      window.uiHelpers.showToast(
        shouldArchive
          ? 'Status arquivado. Leituras padrão serão reduzidas.'
          : 'Status restaurado nas leituras principais.',
        'success'
      );
    }
  } catch (error) {
    console.error(' Erro ao alternar arquivamento:', error);
    if (checkbox) {
      checkbox.checked = !shouldArchive;
    }
    if (window.uiHelpers?.showToast) {
      window.uiHelpers.showToast('Erro ao atualizar arquivamento: ' + (error.message || error), 'danger');
    }
  }
}

/**
 * Preenche formulário com dados do status
 */
function fillFormWithStatus(id) {
  const row = document.querySelector(`tr[data-status-id="${id}"]`);
  if (!row) return;
  
  console.log(' Preenchendo formulário com dados do status ID:', id);
  
  // Extrair dados da linha
  const nome = row.querySelector('td[data-column="nome"] .display-text')?.textContent?.trim();
  const etapa = row.querySelector('td[data-column="etapa"] .display-text')?.textContent?.trim();
  const ordem = row.querySelector('td[data-column="ordem"] .display-text')?.textContent?.trim();
  const proximos = row.querySelector('td[data-column="proximos"]')?.textContent?.trim();
  
  // Extrair cores dos data-attributes
  const statusColor = row.getAttribute('data-color') || '#FFFFFF';
  const statusBgColor = row.getAttribute('data-bg-color') || '#0D6EFD';
  
  // Preencher formulário do modal
  const form = document.getElementById('modal-status-form');
  if (form) {
    document.getElementById('modal-status-text').value = nome || '';
    document.getElementById('modal-status-stage').value = etapa || '';
    document.getElementById('modal-status-order').value = ordem || '';
    
    // Preencher cores
    const colorInput = document.getElementById('modal-status-color');
    const colorHexInput = document.getElementById('modal-status-color-hex');
    const bgColorInput = document.getElementById('modal-status-bg-color');
    const bgColorHexInput = document.getElementById('modal-status-bg-color-hex');
    const previewBadge = document.getElementById('modal-status-preview');
    
    if (colorInput) colorInput.value = statusColor;
    if (colorHexInput) colorHexInput.value = statusColor.toUpperCase();
    if (bgColorInput) bgColorInput.value = statusBgColor;
    if (bgColorHexInput) bgColorHexInput.value = statusBgColor.toUpperCase();
    
    // Atualizar preview
    if (previewBadge) {
      previewBadge.style.color = statusColor;
      previewBadge.style.background = statusBgColor;
      previewBadge.textContent = nome || 'Status';
    }
    
    // Usar o novo seletor de próximos status
    const proximosValue = proximos === 'Nenhum' ? '' : (proximos || '');
    if (window.nextStepsSelector) {
      window.nextStepsSelector.setValues(proximosValue);
    } else {
      document.getElementById('modal-status-next-steps').value = proximosValue;
    }

    const archiveInput = document.getElementById('modal-status-archive');
    if (archiveInput) {
      const rowValue = row.getAttribute('data-archive-contracts');
      if (rowValue === 'true' || rowValue === 'false') {
        archiveInput.checked = rowValue === 'true';
      } else {
        const fallbackStatus = window.EFFECTIVE_STATUS_CONFIG?.find((status) => status.text === nome);
        archiveInput.checked = fallbackStatus?.archiveContracts === true;
      }
    }
    
    // Marcar como editando
    form.setAttribute('data-editing-id', id);
    
    // Alterar botão e mostrar cancelar
    const submitText = document.getElementById('modal-status-form-submit-text');
    const cancelBtn = document.getElementById('modal-status-form-cancel');
    const formCard = form.closest('.status-form-card');
    const formTitle = document.getElementById('modal-status-form-title');
    const formIcon = document.getElementById('modal-status-form-icon');
    
    if (submitText) submitText.textContent = 'Atualizar Status';
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
    if (formCard) formCard.classList.add('editing-mode');
    if (formTitle) formTitle.textContent = 'Editando Status';
    if (formIcon) formIcon.className = 'bi bi-pencil-fill';
    
    // Focar no primeiro campo
    document.getElementById('modal-status-text').focus();
    
    // Scroll suave até o formulário
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    console.log(' Formulário preenchido para edição com cores:', { statusColor, statusBgColor });
  }
}

/**
 * Escape HTML para segurança
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

/**
 * Alterna visibilidade de coluna
 */
function toggleColumnVisibility(columnName, visible) {
  const table = document.querySelector('.config-table-wrapper table');
  if (!table) return;
  
  // Encontrar header da coluna
  const header = table.querySelector(`th[data-column="${columnName}"]`);
  if (!header) return;
  
  // Encontrar índice da coluna
  const headers = Array.from(table.querySelectorAll('thead th'));
  const columnIndex = headers.indexOf(header);
  
  if (columnIndex === -1) return;
  
  // Aplicar visibilidade
  const display = visible ? '' : 'none';
  header.style.display = display;
  
  // Aplicar a todas as células da coluna
  const cells = table.querySelectorAll(`tbody tr td:nth-child(${columnIndex + 1})`);
  cells.forEach(cell => {
    cell.style.display = display;
  });
  
  console.log(` Coluna ${columnName}: ${visible ? 'visível' : 'oculta'}`);
}

/**
 * Filtra dados da tabela
 */
function filterTableData(filterType) {
  const tbody = document.getElementById('modal-status-table-body');
  if (!tbody) return;
  
  const rows = Array.from(tbody.querySelectorAll('tr'));
  
  rows.forEach(row => {
    const checkbox = row.querySelector('td[data-column="ativo"] input[type="checkbox"]');
    const isActive = checkbox ? checkbox.checked : true;
    let shouldShow = true;
    
    switch (filterType) {
      case 'active':
        shouldShow = isActive;
        break;
      case 'inactive':
        shouldShow = !isActive;
        break;
      case 'all':
      default:
        shouldShow = true;
        break;
    }
    
    row.style.display = shouldShow ? '' : 'none';
  });
  
  console.log(` Filtro aplicado: ${filterType}`);
}

/**
 * Aplica configurações à tabela principal
 */
function applyConfigurations() {
  const mainWrapper = document.querySelector('.status-table-wrapper');
  if (!mainWrapper) return;
  
  // Aplicar altura
  const heightSelect = document.getElementById('modal-table-height-select');
  if (heightSelect) {
    if (heightSelect.value === 'none') {
      mainWrapper.style.maxHeight = 'none';
    } else {
      mainWrapper.style.maxHeight = heightSelect.value;
    }
  }
  
  // Aplicar densidade
  const densitySelect = document.getElementById('modal-table-density-select');
  if (densitySelect) {
    mainWrapper.className = mainWrapper.className.replace(/density-\\w+/g, '');
    mainWrapper.classList.add(`density-${densitySelect.value}`);
  }
  
  console.log(' Configurações aplicadas à tabela principal');
}

/**
 * Restaura configurações padrão
 */
function resetToDefaults() {
  // Reset altura
  const heightSelect = document.getElementById('modal-table-height-select');
  if (heightSelect) {
    heightSelect.value = '60vh';
    heightSelect.dispatchEvent(new Event('change'));
  }
  
  // Reset densidade
  const densitySelect = document.getElementById('modal-table-density-select');
  if (densitySelect) {
    densitySelect.value = 'normal';
    densitySelect.dispatchEvent(new Event('change'));
  }
  
  // Reset colunas
  const columnCheckboxes = document.querySelectorAll('[id^="modal-col-"]');
  columnCheckboxes.forEach(checkbox => {
    if (!checkbox.disabled) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
    }
  });
  
  // Reset filtro
  const allFilter = document.getElementById('filter-all');
  if (allFilter) {
    allFilter.checked = true;
    allFilter.dispatchEvent(new Event('change'));
  }
  
  console.log(' Configurações restauradas para o padrão');
}

/**
 * Exporta dados da tabela
 */
function exportTableData(includeHidden = false) {
  const table = document.querySelector('.config-table-wrapper table');
  if (!table) return;
  
  // Coletar cabeçalhos
  const headers = [];
  const headerCells = table.querySelectorAll('thead th');
  headerCells.forEach(th => {
    if (includeHidden || th.style.display !== 'none') {
      headers.push(th.textContent.trim());
    }
  });
  
  // Coletar dados das linhas visíveis
  const rows = [];
  const tableRows = table.querySelectorAll('tbody tr');
  tableRows.forEach(row => {
    if (row.style.display === 'none') return; // Pular linhas filtradas
    
    const rowData = [];
    const cells = row.querySelectorAll('td');
    cells.forEach((cell, index) => {
      const correspondingHeader = headerCells[index];
      if (includeHidden || correspondingHeader.style.display !== 'none') {
        // Limpar texto (remover badges e botões)
        let text = cell.textContent.trim().replace(/\\s+/g, ' ');
        rowData.push(text);
      }
    });
    
    if (rowData.length > 0) {
      rows.push(rowData);
    }
  });
  
  // Criar CSV
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    .join('\\n');
  
  // Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `status-configuracao-${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  console.log(' Dados exportados:', includeHidden ? 'todos' : 'apenas visíveis');
}

// Funções globais para ações
window.startInlineEdit = startInlineEdit;
window.saveInlineEdit = saveInlineEdit;
window.cancelInlineEdit = cancelInlineEdit;
window.toggleStatusActive = toggleStatusActive;
window.toggleArchiveContracts = toggleArchiveContracts;
window.fillFormWithStatus = fillFormWithStatus;

window.editStatusItem = function(id) {
  console.log(' Editar status ID (legacy):', id);
  
  if (!id || id === 'undefined') {
    console.error(' ID inválido para edição:', id);
    if (window.uiHelpers) window.uiHelpers.showToast('Erro: ID do status não encontrado.', 'error');
    else alert('Erro: ID do status não encontrado. Verifique o console para detalhes.');
    return;
  }
  
  // Usar a nova função de preenchimento de formulário
  fillFormWithStatus(id);
};

window.deleteStatusItem = async function(id) {
  console.log(' Excluir status ID:', id);
  
  if (!id || id === 'undefined') {
    console.error(' ID inválido para exclusão:', id);
    if (window.uiHelpers) window.uiHelpers.showToast('Erro: ID do status não encontrado.', 'error');
    else alert('Erro: ID do status não encontrado. Verifique o console para detalhes.');
    return;
  }
  
  // Encontrar dados do item na tabela
  const row = document.querySelector(`tr[data-status-id="${id}"]`);
  if (!row) {
    console.warn(' Linha não encontrada para ID:', id);
    if (window.uiHelpers) window.uiHelpers.showToast('Status não encontrado na tabela.', 'warning');
    else alert('Status não encontrado na tabela.');
    return;
  }
  
  const nome = row.querySelector('td[data-column="nome"] .display-text')?.textContent?.trim() || 'Desconhecido';
  
  const confirmed = window.uiHelpers
    ? await window.uiHelpers.confirmDelete(`o status "${nome}"`)
    : confirm(`Deseja realmente excluir o status?\n\nNome: ${nome}\nID: ${id}\n\nATENÇÃO: Esta ação não pode ser desfeita!`);
    
  if (confirmed) {
    console.log(' Confirmada exclusão do status:', { id, nome });
    
    // Tentar usar a função de exclusão existente
    if (window.firestoreService && typeof window.firestoreService.deleteStatusConfig === 'function') {
      deleteStatusWithExistingFunction(nome);
    } else {
      if (window.uiHelpers) window.uiHelpers.showToast(`Para excluir o status "${nome}", use a página de Configurações > Status.`, 'info');
      else alert(`Para excluir o status "${nome}", use a página de Configurações > Status.\n\n(Funcionalidade de exclusão direta será implementada)`);
    }
  }
};

// Função auxiliar para exclusão usando sistema existente
async function deleteStatusWithExistingFunction(statusName) {
  try {
    console.log(' Tentando excluir status via firestoreService:', statusName);
    
    await window.firestoreService.deleteStatusConfig(statusName, false);
    
    console.log(' Status excluído com sucesso');
    if (window.uiHelpers) window.uiHelpers.showToast(`Status "${statusName}" excluído com sucesso!`, 'success');
    else alert(`Status "${statusName}" excluído com sucesso!`);
    
    // Recarregar dados do modal
    setTimeout(() => {
      if (typeof loadDataToModal === 'function') {
        loadDataToModal();
      }
    }, 500);
    
  } catch (error) {
    console.error(' Erro ao excluir status:', error);
    
    // Se erro de permissão, mostrar mensagem clara
    if (error.code === 'permission-denied') {
      const msg = 'Você não tem permissão para excluir status. Apenas administradores podem realizar esta ação.';
      if (window.uiHelpers) window.uiHelpers.showToast(msg, 'error');
      else alert(msg);
      return;
    }
    
    // Se erro de validação (campo obrigatório), mostrar mensagem clara
    if (error.code === 'invalid-argument') {
      const msg = `Erro de validação: ${error.message}`;
      if (window.uiHelpers) window.uiHelpers.showToast(msg, 'error');
      else alert(msg);
      return;
    }
    
    // Se erro de status em uso, perguntar se quer forçar
    console.warn(' Exclusão bloqueada, tentando forçada:', error);
    
    const forceDelete = window.uiHelpers
      ? await window.uiHelpers.confirmImportantAction(
          'Forçar exclusão',
          `O status "${statusName}" pode estar em uso. Forçar exclusão pode afetar contratos existentes.`
        )
      : confirm(`O status "${statusName}" pode estar em uso.\n\nDeseja forçar a exclusão mesmo assim?\n\nATENÇÃO: Isso pode afetar contratos existentes!`);
    
    if (forceDelete) {
      try {
        await window.firestoreService.deleteStatusConfig(statusName, true);
        
        console.log(' Status excluído (forçado) com sucesso');
        if (window.uiHelpers) window.uiHelpers.showToast(`Status "${statusName}" excluído com sucesso!`, 'success');
        else alert(`Status "${statusName}" excluído (forçado) com sucesso!`);
        
        // Recarregar dados do modal
        setTimeout(() => {
          if (typeof loadDataToModal === 'function') {
            loadDataToModal();
          }
        }, 500);
        
      } catch (error2) {
        console.error(' Erro ao excluir status (forçado):', error2);
        if (window.uiHelpers) window.uiHelpers.showToast(`Erro ao excluir status "${statusName}": ${error2.message || error2}`, 'error');
        else alert(`Erro ao excluir status "${statusName}":\n\n${error2.message || error2}`);
      }
    }
  }
};

// Disponibilizar para debug
if (typeof window !== 'undefined') {
  window.statusTableConfig = {
    loadDataToModal,
    applyConfigurations,
    resetToDefaults,
    exportTableData
  };
}

console.log(' statusTableConfigSimple.js carregado com sucesso');
