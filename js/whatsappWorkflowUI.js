/**
 * @file whatsappWorkflowUI.js
 * @description Interface para configuração de workflows do bot WhatsApp
 *
 * Funcionalidades:
 * - Listar workflows existentes
 * - Criar/editar workflows
 * - Configurar etapas do fluxo
 * - Testar workflows
 * - Ativar/desativar workflows
 *
 * Data: 2025-11-14
 */

import { db, auth } from './auth.js';
import whatsappBot from './whatsappBot.js';

const { ACTION_TYPES, VALIDATION_TYPES } = whatsappBot;
const DEFAULT_DEPARTMENTS = [
  'Aprovação',
  'Formularios',
  'CEHOP',
  'Registro',
  'Individual'
];

const VALIDATION_TYPE_LABELS = {
  [VALIDATION_TYPES.TEXT]: 'Texto livre',
  [VALIDATION_TYPES.NUMBER]: 'Número',
  [VALIDATION_TYPES.EMAIL]: 'Email',
  [VALIDATION_TYPES.PHONE]: 'Telefone',
  [VALIDATION_TYPES.CPF]: 'CPF',
  [VALIDATION_TYPES.CNPJ]: 'CNPJ',
  [VALIDATION_TYPES.DATE]: 'Data (DD/MM/AAAA)',
  [VALIDATION_TYPES.OPTION]: 'Opção numérica (1,2,3...)',
  [VALIDATION_TYPES.YES_NO]: 'Sim/Não',
  [VALIDATION_TYPES.REGEX]: 'Expressão regular'
};

const CONDITION_OPERATORS = [
  { value: 'equals', label: 'Igual a' },
  { value: 'not_equals', label: 'Diferente de' },
  { value: 'contains', label: 'Contém (texto)' },
  { value: 'greater_than', label: 'Maior que (número)' },
  { value: 'less_than', label: 'Menor que (número)' }
];

const STEP_ACTION_ORDER = [
  ACTION_TYPES.SEND_MESSAGE,
  ACTION_TYPES.COLLECT_DATA,
  ACTION_TYPES.SET_VARIABLE,
  ACTION_TYPES.CONDITION,
  ACTION_TYPES.SET_DEPARTMENT,
  ACTION_TYPES.ADD_TAG,
  ACTION_TYPES.SAVE_CUSTOMER_SUMMARY,
  ACTION_TYPES.TRANSFER_HUMAN,
  ACTION_TYPES.END_WORKFLOW
];

const STEP_ACTION_CONFIG = {
  [ACTION_TYPES.SEND_MESSAGE]: {
    label: 'Enviar mensagem',
    icon: 'chat-left-text',
    description: 'Envia um texto simples antes de avançar no fluxo.',
    fields: [
      {
        name: 'message',
        label: 'Mensagem *',
        type: 'textarea',
        rows: 4,
        required: true,
        placeholder: 'Ex.: Olá! Como posso ajudar?',
        helper: 'Suporta variáveis com {{nome_da_variavel}}.'
      }
    ]
  },
  [ACTION_TYPES.COLLECT_DATA]: {
    label: 'Coletar dado',
    icon: 'clipboard-data',
    description: 'Pergunta algo ao cliente e salva em uma variável.',
    fields: [
      {
        name: 'question',
        label: 'Pergunta *',
        type: 'textarea',
        rows: 3,
        required: true,
        placeholder: 'Informe ao cliente o que precisa saber.'
      },
      {
        name: 'variableName',
        label: 'Nome da variável *',
        type: 'text',
        required: true,
        placeholder: 'Ex.: nome_cliente',
        helper: 'Use snake_case. Será usado em {{variavel}}.',
        transform: 'slug',
        attributes: { autocapitalize: 'none', autocomplete: 'off' }
      },
      {
        name: 'validationType',
        label: 'Tipo de validação *',
        type: 'select',
        required: true,
        options: () => Object.entries(VALIDATION_TYPE_LABELS).map(([value, label]) => ({ value, label })),
        placeholder: 'Selecione...'
      },
      {
        name: 'validationOptions.maxOptions',
        label: 'Quantidade de opções',
        type: 'number',
        min: 2,
        max: 10,
        dependsOn: { field: 'validationType', values: [VALIDATION_TYPES.OPTION] },
        helper: 'Informe o total de opções numéricas aceitas.'
      },
      {
        name: 'validationOptions.regex',
        label: 'Expressão regular',
        type: 'text',
        placeholder: 'Ex.: ^[0-9]{4}$',
        dependsOn: { field: 'validationType', values: [VALIDATION_TYPES.REGEX] }
      },
      {
        name: 'validationOptions.regexFlags',
        label: 'Flags da regex',
        type: 'text',
        placeholder: 'Ex.: i',
        dependsOn: { field: 'validationType', values: [VALIDATION_TYPES.REGEX] },
        helper: 'Use i para case-insensitive, g para global, etc.'
      },
      {
        name: 'confirmationMessage',
        label: 'Mensagem de confirmação',
        type: 'textarea',
        rows: 2,
        placeholder: 'Opcional. Enviada após resposta válida.'
      }
    ]
  },
  [ACTION_TYPES.SET_VARIABLE]: {
    label: 'Definir variável',
    icon: 'code-square',
    description: 'Define manualmente uma variável interna.',
    fields: [
      {
        name: 'variableName',
        label: 'Nome da variável *',
        type: 'text',
        required: true,
        placeholder: 'Ex.: status_lead',
        transform: 'slug',
        attributes: { autocapitalize: 'none', autocomplete: 'off' }
      },
      {
        name: 'value',
        label: 'Valor *',
        type: 'text',
        required: true,
        placeholder: 'Valor a ser atribuído'
      }
    ]
  },
  [ACTION_TYPES.CONDITION]: {
    label: 'Condição (if/else)',
    icon: 'diagram-3',
    description: 'Direciona o fluxo com base em valores coletados.',
    fields: [
      {
        name: 'condition.variable',
        label: 'Variável *',
        type: 'text',
        required: true,
        placeholder: 'Ex.: departamento_escolhido',
        attributes: { autocapitalize: 'none', autocomplete: 'off' }
      },
      {
        name: 'condition.operator',
        label: 'Operação *',
        type: 'select',
        required: true,
        options: () => CONDITION_OPERATORS
      },
      {
        name: 'condition.value',
        label: 'Valor comparado *',
        type: 'text',
        required: true,
        placeholder: 'Ex.: 1'
      },
      {
        name: 'ifTrueStep',
        label: 'Próxima etapa (condição verdadeira)',
        type: 'number',
        min: 1,
        placeholder: 'Ex.: 5'
      },
      {
        name: 'ifFalseStep',
        label: 'Próxima etapa (condição falsa)',
        type: 'number',
        min: 1,
        placeholder: 'Ex.: 8'
      }
    ]
  },
  [ACTION_TYPES.SET_DEPARTMENT]: {
    label: 'Definir departamento',
    icon: 'building',
    description: 'Atualiza o departamento responsável pelo chat.',
    fields: [
      {
        name: 'department',
        label: 'Departamento *',
        type: 'select',
        required: true,
        options: () => getDepartmentOptions(),
        placeholder: 'Selecione...'
      }
    ]
  },
  [ACTION_TYPES.ADD_TAG]: {
    label: 'Adicionar tag',
    icon: 'tag',
    description: 'Adiciona uma tag ao chat para facilitar filtros.',
    fields: [
      {
        name: 'tagId',
        label: 'ID da tag *',
        type: 'text',
        required: true,
        placeholder: 'Ex.: lead_qualificado',
        attributes: { autocapitalize: 'none', autocomplete: 'off' }
      }
    ]
  },
  [ACTION_TYPES.SAVE_CUSTOMER_SUMMARY]: {
    label: 'Salvar resumo do cliente',
    icon: 'journal-text',
    description: 'Gera um resumo a partir das variáveis coletadas.',
    fields: [
      {
        name: 'summaryTemplate',
        label: 'Modelo do resumo *',
        type: 'textarea',
        rows: 4,
        required: true,
        placeholder: 'Use {{variaveis}} para montar o texto.'
      },
      {
        name: 'confirmationMessage',
        label: 'Mensagem de confirmação',
        type: 'textarea',
        rows: 2,
        placeholder: 'Opcional. Enviada após salvar o resumo.'
      }
    ]
  },
  [ACTION_TYPES.TRANSFER_HUMAN]: {
    label: 'Transferir para humano',
    icon: 'person-lines-fill',
    description: 'Transfere a conversa para o time humano.',
    fields: [
      {
        name: 'message',
        label: 'Mensagem ao cliente',
        type: 'textarea',
        rows: 3,
        placeholder: 'Ex.: Vou transferir para um especialista...'
      },
      {
        name: 'department',
        label: 'Departamento alvo',
        type: 'select',
        options: () => [{ value: '', label: 'Qualquer departamento' }, ...getDepartmentOptions().map(dep => ({ value: dep, label: dep }))]
      }
    ]
  },
  [ACTION_TYPES.END_WORKFLOW]: {
    label: 'Finalizar workflow',
    icon: 'check-circle',
    description: 'Encerra o fluxo automático e libera o chat.',
    fields: [
      {
        name: 'message',
        label: 'Mensagem final',
        type: 'textarea',
        rows: 3,
        placeholder: 'Ex.: Obrigado! Estamos à disposição.'
      }
    ]
  }
};

if (window.__DEBUG__) console.log('[whatsappWorkflowUI] Módulo carregado.');

// Estado da UI
const uiState = {
  workflows: [],
  currentWorkflow: null,
  editingStepIndex: null,
  editingTriggerIndex: null,
  selectedStepType: null,
  config: null,
  stepModalDraft: null
};

/**
 * Função de notificação segura que funciona com ou sem elemento DOM
 */
function showNotification(message, type = 'success') {
  // Tentar usar Toast do Bootstrap (mais seguro)
  const toastContainer = document.querySelector('.toast-container') || createToastContainer();
  
  const toastId = `toast-${Date.now()}`;
  const bgClass = type === 'error' ? 'bg-danger' : 'bg-success';
  const icon = type === 'error' ? 'bi-x-circle' : 'bi-check-circle';
  
  const toastHtml = `
    <div id="${toastId}" class="toast align-items-center text-white ${bgClass} border-0" role="alert">
      <div class="d-flex">
        <div class="toast-body">
          <i class="bi ${icon} me-2"></i>${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  `;
  
  toastContainer.insertAdjacentHTML('beforeend', toastHtml);
  
  const toastEl = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
  toast.show();
  
  // Remover elemento após fechar
  toastEl.addEventListener('hidden.bs.toast', () => {
    toastEl.remove();
  });
}

/**
 * Cria container de toasts se não existir
 */
function createToastContainer() {
  const container = document.createElement('div');
  container.className = 'toast-container position-fixed top-0 end-0 p-3';
  container.style.zIndex = '9999';
  document.body.appendChild(container);
  return container;
}

/**
 * Inicializa interface de workflows
 */
export async function initWhatsAppWorkflowUI() {
  console.log('[whatsappWorkflowUI] Inicializando interface...');

  uiState.config = window.__WHATSAPP_CONFIG__ || null;

  await loadWorkflowsList();
  await updateWorkflowStats();
  bindEvents();
}

/**
 * Carrega lista de workflows
 */
async function loadWorkflowsList() {
  try {
    const container = document.getElementById('workflows-list-container');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div> Carregando workflows...</div>';

    const snapshot = await db.collection('whatsappWorkflows')
      .orderBy('priority', 'desc')
      .orderBy('createdAt', 'desc')
      .get();

    uiState.workflows = [];
    snapshot.forEach(doc => {
      uiState.workflows.push({
        id: doc.id,
        ...doc.data()
      });
    });

    renderWorkflowsList();
  } catch (error) {
    console.error('[whatsappWorkflowUI] Erro ao carregar workflows:', error);
    showNotification('Erro ao carregar workflows', 'error');
  }
}

/**
 * Renderiza lista de workflows
 */
function renderWorkflowsList() {
  const container = document.getElementById('workflows-list-container');
  if (!container) return;

  if (uiState.workflows.length === 0) {
    container.innerHTML = `
      <div class="alert alert-info">
        <i class="bi bi-info-circle me-2"></i>
        Nenhum workflow configurado. Clique em "Novo Workflow" para criar seu primeiro fluxo automático.
      </div>
    `;
    return;
  }

  container.innerHTML = uiState.workflows.map(workflow => `
    <div class="card mb-3 workflow-item ${workflow.active ? '' : 'inactive'}" data-workflow-id="${workflow.id}" data-active="${workflow.active ? 'true' : 'false'}">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start">
          <div class="flex-grow-1">
            <h5 class="card-title mb-1">
              <i class="bi bi-diagram-3 me-2"></i>
              ${escapeHtml(workflow.name)}
              ${workflow.active ? '<span class="badge bg-success ms-2">Ativo</span>' : '<span class="badge bg-secondary ms-2">Inativo</span>'}
            </h5>
            <p class="card-text text-muted small mb-2">${escapeHtml(workflow.description || 'Sem descrição')}</p>
            <div class="d-flex gap-2 flex-wrap">
              <span class="badge bg-info">
                <i class="bi bi-list-ol me-1"></i>
                ${workflow.steps?.length || 0} etapas
              </span>
              <span class="badge bg-primary">
                <i class="bi bi-lightning me-1"></i>
                Prioridade: ${workflow.priority || 0}
              </span>
              ${renderTriggersBadges(workflow.triggers || [])}
            </div>
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary edit-workflow-btn" data-workflow-id="${workflow.id}" title="Editar">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-outline-${workflow.active ? 'warning' : 'success'} toggle-workflow-btn" 
                    data-workflow-id="${workflow.id}" 
                    data-active="${workflow.active}" 
                    title="${workflow.active ? 'Desativar' : 'Ativar'}">
              <i class="bi bi-${workflow.active ? 'pause' : 'play'}-fill"></i>
            </button>
            <button class="btn btn-outline-info duplicate-workflow-btn" data-workflow-id="${workflow.id}" title="Duplicar">
              <i class="bi bi-files"></i>
            </button>
            <button class="btn btn-outline-danger delete-workflow-btn" data-workflow-id="${workflow.id}" title="Excluir">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `).join('') + `
    <div id="workflow-filter-empty" class="alert alert-warning d-none mb-0">
      <i class="bi bi-filter-circle me-2"></i>Nenhum workflow corresponde ao filtro selecionado.
    </div>
  `;

  const selectedFilter = document.querySelector('input[name="filter-workflows"]:checked')?.value || 'all';
  filterWorkflows(selectedFilter);

  // Bind eventos dos botões
  container.querySelectorAll('.edit-workflow-btn').forEach(btn => {
    btn.addEventListener('click', (e) => editWorkflow(e.target.closest('[data-workflow-id]').dataset.workflowId));
  });

  container.querySelectorAll('.toggle-workflow-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.target.closest('[data-workflow-id]');
      toggleWorkflow(target.dataset.workflowId, target.dataset.active === 'true');
    });
  });

  container.querySelectorAll('.duplicate-workflow-btn').forEach(btn => {
    btn.addEventListener('click', (e) => duplicateWorkflow(e.target.closest('[data-workflow-id]').dataset.workflowId));
  });

  container.querySelectorAll('.delete-workflow-btn').forEach(btn => {
    btn.addEventListener('click', (e) => deleteWorkflow(e.target.closest('[data-workflow-id]').dataset.workflowId));
  });
}

/**
 * Renderiza badges de triggers
 */
function renderTriggersBadges(triggers) {
  if (!triggers || triggers.length === 0) {
    return '<span class="badge bg-secondary"><i class="bi bi-slash-circle me-1"></i>Sem triggers</span>';
  }

  return triggers.map(trigger => {
    switch (trigger.type) {
      case 'first_message':
        return '<span class="badge bg-success"><i class="bi bi-chat-left-text me-1"></i>Primeira mensagem</span>';
      case 'keyword':
        return `<span class="badge bg-warning text-dark"><i class="bi bi-key me-1"></i>Palavras-chave</span>`;
      case 'department':
        return `<span class="badge bg-info"><i class="bi bi-building me-1"></i>${escapeHtml(trigger.department || 'Departamento')}</span>`;
      default:
        return '<span class="badge bg-secondary">Outro</span>';
    }
  }).join(' ');
}

/**
 * Abre modal para criar novo workflow
 */
function openNewWorkflowModal() {
  uiState.currentWorkflow = {
    name: '',
    description: '',
    active: false,
    priority: 1,
    triggers: [],
    steps: []
  };
  
  uiState.editingStepIndex = null;
  renderWorkflowEditor();
  
  const modal = new bootstrap.Modal(document.getElementById('workflowEditorModal'));
  modal.show();
}

/**
 * Edita workflow existente
 */
async function editWorkflow(workflowId) {
  try {
    const workflow = uiState.workflows.find(w => w.id === workflowId);
    if (!workflow) return;

    uiState.currentWorkflow = { ...workflow };
    uiState.editingStepIndex = null;
    
    renderWorkflowEditor();
    
    const modal = new bootstrap.Modal(document.getElementById('workflowEditorModal'));
    modal.show();
  } catch (error) {
    console.error('[whatsappWorkflowUI] Erro ao editar workflow:', error);
    showNotification('Erro ao carregar workflow', 'error');
  }
}

/**
 * Renderiza editor de workflow
 */
function renderWorkflowEditor() {
  const workflow = uiState.currentWorkflow;
  const body = document.getElementById('workflow-editor-body');
  
  if (!body) {
    console.error('[whatsappWorkflowUI] Elemento workflow-editor-body não encontrado');
    return;
  }
  
  // Criar HTML do formulário
  body.innerHTML = `
    <div class="container-fluid">
      <div class="row">
        <div class="col-md-6">
          <div class="mb-3">
            <label for="workflow-name" class="form-label">Nome do Workflow *</label>
            <input type="text" class="form-control" id="workflow-name" required>
          </div>
        </div>
        <div class="col-md-3">
          <div class="mb-3">
            <label for="workflow-priority" class="form-label">Prioridade *</label>
            <input type="number" class="form-control" id="workflow-priority" min="1" max="100" required>
            <small class="text-muted">Maior = executado primeiro</small>
          </div>
        </div>
        <div class="col-md-3">
          <div class="mb-3">
            <label class="form-label d-block">Status</label>
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" id="workflow-active">
              <label class="form-check-label" for="workflow-active">Ativo</label>
            </div>
          </div>
        </div>
      </div>
      
      <div class="mb-3">
        <label for="workflow-description" class="form-label">Descrição</label>
        <textarea class="form-control" id="workflow-description" rows="2"></textarea>
      </div>
      
      <hr>
      
      <h6 class="mb-3">Triggers (Gatilhos)</h6>
      <div id="workflow-triggers-list" class="mb-3"></div>
      <button type="button" class="btn btn-sm btn-outline-primary" id="add-trigger-btn">
        <i class="bi bi-plus-circle me-1"></i>Adicionar Trigger
      </button>
      
      <hr class="my-4">
      
      <h6 class="mb-3">Etapas do Workflow</h6>
      <div id="workflow-steps-list" class="mb-3"></div>
      <button type="button" class="btn btn-sm btn-outline-primary" id="add-step-btn">
        <i class="bi bi-plus-circle me-1"></i>Adicionar Etapa
      </button>
    </div>
  `;
  
  // Preencher valores
  document.getElementById('workflow-name').value = workflow.name || '';
  document.getElementById('workflow-description').value = workflow.description || '';
  document.getElementById('workflow-active').checked = workflow.active || false;
  document.getElementById('workflow-priority').value = workflow.priority || 1;

  // Renderizar triggers e etapas
  renderTriggersList();
  renderStepsList();
  
  // Event listeners
  document.getElementById('add-trigger-btn')?.addEventListener('click', () => openTriggerModal());
  document.getElementById('add-step-btn')?.addEventListener('click', () => openStepModal());
}

/**
 * Renderiza lista de triggers
 */
function renderTriggersList() {
  const container = document.getElementById('workflow-triggers-list');
  if (!container || !uiState.currentWorkflow) {
    return;
  }

  const triggers = uiState.currentWorkflow.triggers || [];

  if (triggers.length === 0) {
    container.innerHTML = '<p class="text-muted small">Nenhum trigger configurado</p>';
    return;
  }

  container.innerHTML = triggers.map((trigger, index) => `
    <div class="alert alert-secondary d-flex justify-content-between align-items-center py-2 mb-2 workflow-trigger-item" data-trigger-index="${index}">
      <div class="flex-grow-1 me-3">${getTriggerLabel(trigger)}</div>
      <div class="btn-group btn-group-sm">
        <button type="button" class="btn btn-outline-primary edit-trigger-btn" data-index="${index}" title="Editar trigger">
          <i class="bi bi-pencil"></i>
        </button>
        <button type="button" class="btn btn-outline-danger remove-trigger-btn" data-index="${index}" title="Remover trigger">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.edit-trigger-btn').forEach(btn => {
    btn.addEventListener('click', (event) => {
      const index = Number(event.currentTarget.dataset.index);
      openTriggerModal(Number.isNaN(index) ? null : index);
    });
  });

  container.querySelectorAll('.remove-trigger-btn').forEach(btn => {
    btn.addEventListener('click', async (event) => {
      const index = Number(event.currentTarget.dataset.index);
      if (Number.isNaN(index)) {
        return;
      }
      const confirmed = window.uiHelpers
        ? await window.uiHelpers.confirmAction({ message: 'Remover este trigger?' })
        : confirm('Remover este trigger?');
      if (!confirmed) {
        return;
      }
      uiState.currentWorkflow.triggers.splice(index, 1);
      renderTriggersList();
    });
  });
}

function getDepartmentOptions() {
  const set = new Set();

  const serviceDepartments = window.__WHATSAPP_SERVICE__?.DEPARTMENTS;
  if (serviceDepartments && typeof serviceDepartments === 'object') {
    Object.values(serviceDepartments).forEach(dep => dep && set.add(dep));
  }

  if (Array.isArray(uiState.config?.departments)) {
    uiState.config.departments.forEach(dep => dep && set.add(dep));
  }

  DEFAULT_DEPARTMENTS.forEach(dep => set.add(dep));
  return Array.from(set).filter(Boolean);
}

function populateTriggerDepartmentSelect() {
  const select = document.getElementById('trigger-department');
  if (!select) {
    return;
  }

  const currentValue = select.value;
  const options = getDepartmentOptions();
  select.innerHTML = '<option value="">Selecione...</option>' + options
    .map(dep => `<option value="${escapeHtml(dep)}">${escapeHtml(dep)}</option>`)
    .join('');

  if (currentValue) {
    select.value = currentValue;
  }
}

function setTriggerFieldVisibility(field, isVisible) {
  const wrapper = document.querySelector(`[data-trigger-field="${field}"]`);
  if (!wrapper) {
    return;
  }

  wrapper.classList.toggle('d-none', !isVisible);
  const input = wrapper.querySelector('input, select');
  if (input) {
    if (isVisible) {
      input.removeAttribute('disabled');
      input.setAttribute('required', 'required');
    } else {
      input.value = '';
      input.setCustomValidity('');
      input.classList.remove('is-invalid');
      input.removeAttribute('required');
      input.setAttribute('disabled', 'disabled');
    }
  }
}

function handleTriggerTypeChange() {
  const type = document.getElementById('trigger-type')?.value || '';
  const keywordsInput = document.getElementById('trigger-keywords');
  const departmentSelect = document.getElementById('trigger-department');
  setTriggerFieldVisibility('keywords', type === 'keyword');
  setTriggerFieldVisibility('department', type === 'department');

  if (type !== 'keyword' && keywordsInput) {
    keywordsInput.setCustomValidity('');
  }

  if (type !== 'department' && departmentSelect) {
    departmentSelect.setCustomValidity('');
  }
}

function openTriggerModal(index = null) {
  const form = document.getElementById('workflow-trigger-form');
  const typeSelect = document.getElementById('trigger-type');
  const keywordsInput = document.getElementById('trigger-keywords');
  const departmentSelect = document.getElementById('trigger-department');
  const modalEl = document.getElementById('workflowTriggerModal');

  if (!form || !typeSelect || !modalEl) {
    return;
  }

  populateTriggerDepartmentSelect();
  form.reset();
  form.classList.remove('was-validated');
  uiState.editingTriggerIndex = Number.isInteger(index) ? index : null;
  document.getElementById('trigger-index').value = Number.isInteger(index) ? index : '';

  if (typeof index === 'number' && uiState.currentWorkflow?.triggers?.[index]) {
    const trigger = uiState.currentWorkflow.triggers[index];
    typeSelect.value = trigger.type || '';
    if (trigger.type === 'keyword' && keywordsInput) {
      keywordsInput.value = (trigger.keywords || []).join(', ');
    }
    if (trigger.type === 'department' && departmentSelect) {
      departmentSelect.value = trigger.department || '';
    }
  } else {
    typeSelect.selectedIndex = 0;
  }

  handleTriggerTypeChange();

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function handleTriggerFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  const typeSelect = document.getElementById('trigger-type');
  const keywordsInput = document.getElementById('trigger-keywords');
  const departmentSelect = document.getElementById('trigger-department');

  if (!typeSelect) {
    return;
  }

  const trigger = { type: typeSelect.value };

  if (!trigger.type) {
    form.classList.add('was-validated');
    return;
  }

  if (trigger.type === 'keyword' && keywordsInput) {
    const keywords = keywordsInput.value
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);

    if (keywords.length === 0) {
      keywordsInput.setCustomValidity('Informe ao menos uma palavra-chave.');
    } else {
      keywordsInput.setCustomValidity('');
      trigger.keywords = keywords;
    }
  }

  if (trigger.type === 'department' && departmentSelect) {
    if (!departmentSelect.value) {
      departmentSelect.setCustomValidity('Selecione um departamento.');
    } else {
      departmentSelect.setCustomValidity('');
      trigger.department = departmentSelect.value;
    }
  }

  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  if (!Array.isArray(uiState.currentWorkflow.triggers)) {
    uiState.currentWorkflow.triggers = [];
  }

  if (typeof uiState.editingTriggerIndex === 'number') {
    uiState.currentWorkflow.triggers[uiState.editingTriggerIndex] = trigger;
  } else {
    uiState.currentWorkflow.triggers.push(trigger);
  }

  renderTriggersList();
  const modal = bootstrap.Modal.getInstance(document.getElementById('workflowTriggerModal'));
  modal?.hide();
  showNotification('Trigger salvo com sucesso');
}

function getStepActionLabel(action) {
  if (!action) {
    return 'Selecione uma ação';
  }
  return STEP_ACTION_CONFIG[action]?.label || action.replace(/_/g, ' ');
}

function getAllStepActions() {
  const allActions = new Set(STEP_ACTION_ORDER);
  Object.values(ACTION_TYPES).forEach(action => allActions.add(action));

  if (Array.isArray(uiState.currentWorkflow?.steps)) {
    uiState.currentWorkflow.steps.forEach(step => {
      if (step?.action) {
        allActions.add(step.action);
      }
    });
  }

  return Array.from(allActions);
}

function populateStepActionSelect(preserveValue = true) {
  const select = document.getElementById('step-action');
  if (!select) {
    return;
  }

  const previousValue = preserveValue ? select.value : '';
  const actions = getAllStepActions();

  select.innerHTML = '<option value="">Selecione...</option>' + actions
    .map(action => `<option value="${escapeHtml(action)}">${escapeHtml(getStepActionLabel(action))}</option>`)
    .join('');

  if (previousValue && actions.includes(previousValue)) {
    select.value = previousValue;
  } else if (uiState.selectedStepType && actions.includes(uiState.selectedStepType)) {
    select.value = uiState.selectedStepType;
  } else {
    select.value = '';
  }
}

function renderStepFields(action, stepData = {}) {
  const container = document.getElementById('step-dynamic-fields');
  if (!container) {
    return;
  }

  if (!action) {
    container.innerHTML = `
      <div class="alert alert-info d-flex align-items-center" role="alert">
        <i class="bi bi-info-circle me-2"></i>
        Escolha uma ação para configurar os campos desta etapa.
      </div>
    `;
    return;
  }

  const config = STEP_ACTION_CONFIG[action];

  if (!config) {
    const serialized = stepData && Object.keys(stepData).length > 0
      ? JSON.stringify(stepData, null, 2)
      : JSON.stringify({ action }, null, 2);

    container.innerHTML = `
      <div class="alert alert-warning" role="alert">
        <i class="bi bi-exclamation-triangle me-2"></i>
        Ainda não há editor visual para <strong>${escapeHtml(getStepActionLabel(action))}</strong>.
        Utilize o campo abaixo para editar o JSON completo da etapa.
      </div>
      <div class="mb-3">
        <label for="step-raw-json" class="form-label">Payload da etapa *</label>
        <textarea class="form-control" id="step-raw-json" name="rawStep" rows="8" required>${escapeHtml(serialized)}</textarea>
        <div class="form-text">Será salvo exatamente como informado. Necessário conhecimento avançado.</div>
      </div>
    `;
    return;
  }

  const intro = config.description
    ? `<div class="alert alert-secondary py-2 px-3" role="alert">
         <i class="bi bi-info-circle me-2"></i>${config.description}
       </div>`
    : '';

  const fieldsHtml = config.fields.map(field => renderStepField(field, stepData)).join('');
  container.innerHTML = intro + fieldsHtml;
  applyStepFieldDependencies();
}

function renderStepField(field, stepData = {}) {
  const inputId = `step-field-${field.name.replace(/[^a-z0-9]/gi, '-')}`;
  const value = getNestedValue(stepData, field.name);
  const wrapperClasses = ['mb-3', 'step-field-wrapper'];
  let wrapperAttributes = '';

  if (field.dependsOn) {
    const targetValue = getNestedValue(stepData, field.dependsOn.field);
    const shouldShow = field.dependsOn.values.includes(targetValue);
    if (!shouldShow) {
      wrapperClasses.push('d-none');
    }
    wrapperAttributes += ` data-depends-on="${field.dependsOn.field}"`;
    wrapperAttributes += ` data-depends-values="${field.dependsOn.values.join('|')}"`;
    wrapperAttributes += ` data-required-when-visible="${field.required ? 'true' : 'false'}"`;
  }

  const baseAttributes = field.attributes || {};
  const attrString = Object.entries(baseAttributes)
    .map(([attr, attrValue]) => ` ${attr}="${attrValue}"`)
    .join('');

  const requiredAttr = field.required && !field.dependsOn ? 'required' : '';
  const placeholderAttr = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
  let controlHtml = '';

  switch (field.type) {
    case 'textarea':
      controlHtml = `
        <textarea class="form-control" id="${inputId}" name="${field.name}" rows="${field.rows || 3}" ${requiredAttr}${placeholderAttr}${attrString}>${escapeHtml(value ?? '')}</textarea>
      `;
      break;
    case 'select': {
      const options = typeof field.options === 'function' ? field.options() : (field.options || []);
      const placeholderLabel = field.placeholder ? escapeHtml(field.placeholder) : 'Selecione...';
      const placeholderOption = `<option value="">${placeholderLabel}</option>`;
      const optionsHtml = options.map(option => {
        if (typeof option === 'string') {
          const safeOption = escapeHtml(option);
          return `<option value="${safeOption}" ${option === value ? 'selected' : ''}>${safeOption}</option>`;
        }
        const isSelected = option.value === value;
        return `<option value="${escapeHtml(option.value)}" ${isSelected ? 'selected' : ''}>${escapeHtml(option.label)}</option>`;
      }).join('');
      controlHtml = `
        <select class="form-select" id="${inputId}" name="${field.name}" ${requiredAttr}${attrString}>
          ${placeholderOption}
          ${optionsHtml}
        </select>
      `;
      break;
    }
    case 'number': {
      const minAttr = field.min !== undefined ? ` min="${field.min}"` : '';
      const maxAttr = field.max !== undefined ? ` max="${field.max}"` : '';
      const stepAttr = field.step !== undefined ? ` step="${field.step}"` : '';
      const numericValue = value ?? '';
      controlHtml = `
        <input type="number" class="form-control" id="${inputId}" name="${field.name}" value="${numericValue}" ${requiredAttr}${placeholderAttr}${minAttr}${maxAttr}${stepAttr}${attrString}>
      `;
      break;
    }
    case 'checkbox': {
      const checkedAttr = value ? 'checked' : '';
      wrapperClasses.push('form-check');
      controlHtml = `
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="${inputId}" name="${field.name}" ${checkedAttr}${attrString}>
          <label class="form-check-label" for="${inputId}">${field.checkboxLabel || field.label}</label>
        </div>
      `;
      break;
    }
    default:
      controlHtml = `
        <input type="text" class="form-control" id="${inputId}" name="${field.name}" value="${escapeHtml(value ?? '')}" ${requiredAttr}${placeholderAttr}${attrString}>
      `;
  }

  const helperHtml = field.helper ? `<div class="form-text">${field.helper}</div>` : '';
  const invalidFeedback = '<div class="invalid-feedback">Campo obrigatório.</div>';

  if (field.type === 'checkbox') {
    return `
      <div class="${wrapperClasses.join(' ')}"${wrapperAttributes}>
        ${controlHtml}
        ${helperHtml}
      </div>
    `;
  }

  return `
    <div class="${wrapperClasses.join(' ')}"${wrapperAttributes}>
      <label for="${inputId}" class="form-label">${field.label}</label>
      ${controlHtml}
      ${invalidFeedback}
      ${helperHtml}
    </div>
  `;
}

function cacheConditionalInputValue(input) {
  if (!input) {
    return;
  }

  if (input.type === 'checkbox') {
    input.dataset.cachedValue = input.checked ? 'true' : 'false';
    input.checked = false;
    return;
  }

  input.dataset.cachedValue = input.value;
  input.value = '';
}

function restoreConditionalInputValue(input) {
  if (!input || !Object.prototype.hasOwnProperty.call(input.dataset, 'cachedValue')) {
    return;
  }

  if (input.type === 'checkbox') {
    input.checked = input.dataset.cachedValue === 'true';
    return;
  }

  if (!input.value && input.dataset.cachedValue) {
    input.value = input.dataset.cachedValue;
  }
}

function applyStepFieldDependencies() {
  const container = document.getElementById('step-dynamic-fields');
  if (!container) {
    return;
  }

  const wrappers = container.querySelectorAll('[data-depends-on]');
  wrappers.forEach(wrapper => {
    const controlName = wrapper.dataset.dependsOn;
    const expectedValues = (wrapper.dataset.dependsValues || '').split('|').filter(Boolean);
    const control = container.querySelector(`[name="${controlName}"]`);
    const currentValue = control?.value ?? '';
    const shouldShow = expectedValues.includes(currentValue);
    wrapper.classList.toggle('d-none', !shouldShow);

    const input = wrapper.querySelector('input, textarea, select');
    if (input) {
      if (shouldShow) {
        restoreConditionalInputValue(input);
        input.removeAttribute('disabled');
        if (wrapper.dataset.requiredWhenVisible === 'true') {
          input.setAttribute('required', 'required');
        }
      } else {
        input.removeAttribute('required');
        cacheConditionalInputValue(input);
        input.setCustomValidity('');
        input.classList.remove('is-invalid');
        input.setAttribute('disabled', 'disabled');
      }
    }
  });
}

function handleStepFieldsContainerChange() {
  applyStepFieldDependencies();
}

function getNestedValue(source = {}, path = '') {
  if (!path) {
    return undefined;
  }
  return path.split('.').reduce((acc, segment) => (acc && acc[segment] !== undefined ? acc[segment] : undefined), source);
}

function assignNestedValue(target, path, value) {
  if (value === undefined || value === null || value === '') {
    return;
  }
  const segments = path.split('.');
  let cursor = target;
  while (segments.length > 1) {
    const key = segments.shift();
    if (cursor[key] === undefined || typeof cursor[key] !== 'object') {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[segments[0]] = value;
}

function openStepModal(stepIndex = null) {
  const form = document.getElementById('workflow-step-form');
  const actionSelect = document.getElementById('step-action');
  const labelInput = document.getElementById('step-label');
  const modalEl = document.getElementById('workflowStepModal');

  if (!form || !actionSelect || !modalEl) {
    return;
  }

  populateStepActionSelect(false);
  form.reset();
  form.classList.remove('was-validated');
  document.getElementById('step-index').value = typeof stepIndex === 'number' ? stepIndex : '';
  uiState.editingStepIndex = typeof stepIndex === 'number' ? stepIndex : null;

  let stepData = {};

  if (typeof stepIndex === 'number' && uiState.currentWorkflow?.steps?.[stepIndex]) {
    stepData = JSON.parse(JSON.stringify(uiState.currentWorkflow.steps[stepIndex]));
    actionSelect.value = stepData.action || '';
    labelInput.value = stepData.internalLabel || '';
  } else {
    actionSelect.value = uiState.selectedStepType || getAllStepActions()[0] || '';
    labelInput.value = '';
  }

  uiState.stepModalDraft = stepData;
  renderStepFields(actionSelect.value, stepData);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function handleStepActionChange() {
  const actionSelect = document.getElementById('step-action');
  if (!actionSelect) {
    return;
  }
  const action = actionSelect.value;
  uiState.selectedStepType = action || null;
  uiState.stepModalDraft = {};
  renderStepFields(action, {});
}

function buildStepPayload(action, formData) {
  const config = STEP_ACTION_CONFIG[action];
  if (!config) {
    return null;
  }

  const step = {};

  config.fields.forEach(field => {
    if (field.type === 'checkbox') {
      const checked = formData.get(field.name) === 'on';
      assignNestedValue(step, field.name, checked);
      return;
    }

    let fieldValue = formData.get(field.name);
    if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
      return;
    }

    if (typeof fieldValue === 'string') {
      fieldValue = fieldValue.trim();
    }

    if (field.type === 'number') {
      const numericValue = Number(fieldValue);
      if (Number.isNaN(numericValue)) {
        return;
      }
      fieldValue = numericValue;
    }

    if (field.transform === 'slug') {
      fieldValue = fieldValue
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    } else if (typeof field.transform === 'function') {
      fieldValue = field.transform(fieldValue);
    }

    assignNestedValue(step, field.name, fieldValue);
  });

  return step;
}

function handleStepFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const actionSelect = document.getElementById('step-action');
  const labelInput = document.getElementById('step-label');

  if (!actionSelect || !actionSelect.value) {
    form.classList.add('was-validated');
    return;
  }

  const action = actionSelect.value;
  const formData = new FormData(form);
  let stepPayload;

  if (STEP_ACTION_CONFIG[action]) {
    stepPayload = buildStepPayload(action, formData) || {};
  } else {
    const rawContent = formData.get('rawStep');
    const rawTextarea = form.querySelector('[name="rawStep"]');
    try {
      stepPayload = rawContent ? JSON.parse(rawContent) : {};
      rawTextarea?.setCustomValidity('');
    } catch (err) {
      console.error('[whatsappWorkflowUI] JSON inválido na etapa personalizada:', err);
      rawTextarea?.setCustomValidity('JSON inválido');
      form.classList.add('was-validated');
      return;
    }
  }

  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  stepPayload.action = action;
  const internalLabel = labelInput?.value?.trim();
  if (internalLabel) {
    stepPayload.internalLabel = internalLabel;
  } else {
    delete stepPayload.internalLabel;
  }

  if (!Array.isArray(uiState.currentWorkflow.steps)) {
    uiState.currentWorkflow.steps = [];
  }

  if (typeof uiState.editingStepIndex === 'number') {
    uiState.currentWorkflow.steps[uiState.editingStepIndex] = stepPayload;
  } else {
    uiState.currentWorkflow.steps.push(stepPayload);
  }

  renderStepsList();
  const modal = bootstrap.Modal.getInstance(document.getElementById('workflowStepModal'));
  modal?.hide();
  showNotification('Etapa salva com sucesso');
}

/**
 * Obtém label do trigger
 */
function getTriggerLabel(trigger) {
  switch (trigger.type) {
    case 'first_message':
      return '<i class="bi bi-chat-left-text me-2"></i>Primeira mensagem do cliente';
    case 'keyword':
      {
        const keywords = (trigger.keywords || [])
          .map(keyword => escapeHtml(keyword))
          .join(', ');
        return `<i class="bi bi-key me-2"></i>Palavras-chave: ${keywords}`;
      }
    case 'department':
      return `<i class="bi bi-building me-2"></i>Departamento: ${escapeHtml(trigger.department || 'Departamento')}`;
    default:
      return 'Trigger desconhecido';
  }
}

/**
 * Renderiza lista de etapas
 */
function renderStepsList() {
  const container = document.getElementById('workflow-steps-list');
  const steps = uiState.currentWorkflow.steps || [];

  if (steps.length === 0) {
    container.innerHTML = '<p class="text-muted small">Nenhuma etapa configurada</p>';
    return;
  }

  container.innerHTML = steps.map((step, index) => `
    <div class="card mb-2 step-item">
      <div class="card-body p-2">
        <div class="d-flex justify-content-between align-items-start">
          <div class="flex-grow-1">
            <div class="d-flex align-items-center gap-2 mb-1">
              <small class="text-muted mb-0">Etapa ${index + 1}</small>
              ${step.internalLabel ? `<span class="badge bg-light text-secondary fw-semibold">${escapeHtml(step.internalLabel)}</span>` : ''}
            </div>
            <h6 class="mb-1">${getStepLabel(step)}</h6>
            <p class="mb-0 small text-muted">${getStepDescription(step)}</p>
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary edit-step-btn" data-index="${index}">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-outline-secondary move-step-up-btn" data-index="${index}" ${index === 0 ? 'disabled' : ''}>
              <i class="bi bi-arrow-up"></i>
            </button>
            <button class="btn btn-outline-secondary move-step-down-btn" data-index="${index}" ${index === steps.length - 1 ? 'disabled' : ''}>
              <i class="bi bi-arrow-down"></i>
            </button>
            <button class="btn btn-outline-danger remove-step-btn" data-index="${index}">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  // Bind eventos
  container.querySelectorAll('.edit-step-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('[data-index]').dataset.index);
      editStep(index);
    });
  });

  container.querySelectorAll('.move-step-up-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('[data-index]').dataset.index);
      moveStep(index, -1);
    });
  });

  container.querySelectorAll('.move-step-down-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('[data-index]').dataset.index);
      moveStep(index, 1);
    });
  });

  container.querySelectorAll('.remove-step-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('[data-index]').dataset.index);
      removeStep(index);
    });
  });
}

/**
 * Obtém label da etapa
 */
function getStepLabel(step) {
  const icons = {
    'send_message': 'chat-left-text',
    'collect_data': 'clipboard-data',
    'set_variable': 'code-square',
    'condition': 'diagram-3',
    'set_department': 'building',
    'add_tag': 'tag',
    'transfer_human': 'person-fill',
    'end_workflow': 'check-circle',
    'save_customer_summary': 'journal-text'
  };

  const icon = STEP_ACTION_CONFIG[step.action]?.icon || icons[step.action] || 'circle';
  const label = STEP_ACTION_CONFIG[step.action]?.label || getStepActionLabel(step.action);

  return `<i class="bi bi-${icon} me-2"></i>${label}`;
}

/**
 * Obtém descrição da etapa
 */
function getStepDescription(step) {
  switch (step.action) {
    case 'send_message':
      return escapeHtml(truncateText(step.message, 60));
    case 'collect_data':
      return `Pergunta: ${escapeHtml(truncateText(step.question, 40))} | Variável: ${escapeHtml(step.variableName)}`;
    case 'set_variable':
      return `${escapeHtml(step.variableName)} = ${escapeHtml(String(step.value ?? ''))}`;
    case 'condition':
      return `Se ${escapeHtml(step.condition?.variable || '')} ${escapeHtml(step.condition?.operator || '')} ${escapeHtml(String(step.condition?.value ?? ''))}`;
    case 'set_department':
      return `Departamento: ${escapeHtml(step.department || '')}`;
    case 'add_tag':
      return `Tag ID: ${escapeHtml(step.tagId || '')}`;
    case 'transfer_human':
      return `Transferir para ${escapeHtml(step.department || 'qualquer departamento')}`;
    case 'save_customer_summary':
      return escapeHtml(truncateText(step.summaryTemplate, 60));
    case 'end_workflow':
      return 'Encerrar fluxo automático';
    default:
      return 'Ação não configurada';
  }
}

/**
 * Salva workflow
 */
async function saveWorkflow() {
  try {
    const form = document.getElementById('workflow-editor-form');
    if (form && !form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    const workflow = uiState.currentWorkflow;

    // Validações
    workflow.name = document.getElementById('workflow-name').value.trim();
    workflow.description = document.getElementById('workflow-description').value.trim();
    workflow.active = document.getElementById('workflow-active').checked;
    workflow.priority = parseInt(document.getElementById('workflow-priority').value);

    if (!workflow.name) {
      showNotification('Nome do workflow é obrigatório', 'warning');
      return;
    }

    if (!workflow.triggers || workflow.triggers.length === 0) {
      showNotification('Configure pelo menos um trigger para iniciar o workflow', 'warning');
      return;
    }

    if (!workflow.steps || workflow.steps.length === 0) {
      showNotification('Configure pelo menos uma etapa no workflow', 'warning');
      return;
    }

    // Salvar no Firestore
    const data = {
      ...workflow,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: auth.currentUser?.uid
    };

    if (workflow.id) {
      await db.collection('whatsappWorkflows').doc(workflow.id).update(data);
      showNotification('Workflow atualizado com sucesso', 'success');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = auth.currentUser?.uid;
      
      const docRef = await db.collection('whatsappWorkflows').add(data);
      workflow.id = docRef.id;
      showNotification('Workflow criado com sucesso', 'success');
    }

    // Invalidar cache
    whatsappBot.invalidateWorkflowCache();

    // Fechar modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('workflowEditorModal'));
    if (modal) modal.hide();

    // Recarregar lista
    await loadWorkflowsList();

  } catch (error) {
    console.error('[whatsappWorkflowUI] Erro ao salvar workflow:', error);
    showNotification('Erro ao salvar workflow', 'error');
  }
}

/**
 * Ativa/desativa workflow
 */
async function toggleWorkflow(workflowId, currentActive) {
  try {
    await db.collection('whatsappWorkflows').doc(workflowId).update({
      active: !currentActive
    });

    whatsappBot.invalidateWorkflowCache();
    showNotification(`Workflow ${!currentActive ? 'ativado' : 'desativado'} com sucesso`, 'success');
    await loadWorkflowsList();
  } catch (error) {
    console.error('[whatsappWorkflowUI] Erro ao alterar status do workflow:', error);
    showNotification('Erro ao alterar status do workflow', 'error');
  }
}

/**
 * Duplica workflow
 */
async function duplicateWorkflow(workflowId) {
  try {
    const workflow = uiState.workflows.find(w => w.id === workflowId);
    if (!workflow) return;

    const duplicate = {
      ...workflow,
      name: `${workflow.name} (Cópia)`,
      active: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser?.uid
    };

    delete duplicate.id;

    await db.collection('whatsappWorkflows').add(duplicate);
    
    whatsappBot.invalidateWorkflowCache();
    showNotification('Workflow duplicado com sucesso', 'success');
    await loadWorkflowsList();
  } catch (error) {
    console.error('[whatsappWorkflowUI] Erro ao duplicar workflow:', error);
    showNotification('Erro ao duplicar workflow', 'error');
  }
}

/**
 * Exclui workflow
 */
async function deleteWorkflow(workflowId) {
  const confirmed = window.uiHelpers
    ? await window.uiHelpers.confirmDelete('este workflow')
    : confirm('Tem certeza que deseja excluir este workflow? Esta ação não pode ser desfeita.');
  
  if (!confirmed) {
    return;
  }

  try {
    await db.collection('whatsappWorkflows').doc(workflowId).delete();
    
    whatsappBot.invalidateWorkflowCache();
    showNotification('Workflow excluído com sucesso', 'success');
    await loadWorkflowsList();
  } catch (error) {
    console.error('[whatsappWorkflowUI] Erro ao excluir workflow:', error);
    showNotification('Erro ao excluir workflow', 'error');
  }
}

/**
 * Bind eventos
 */
function bindEvents() {
  const newWorkflowBtn = document.getElementById('new-workflow-btn');
  if (newWorkflowBtn) {
    newWorkflowBtn.addEventListener('click', openNewWorkflowModal);
  }

  const workflowForm = document.getElementById('workflow-editor-form');
  if (workflowForm) {
    workflowForm.addEventListener('submit', (event) => {
      event.preventDefault();
      saveWorkflow();
    });
  }

  const triggerForm = document.getElementById('workflow-trigger-form');
  if (triggerForm) {
    triggerForm.addEventListener('submit', handleTriggerFormSubmit);
  }

  const triggerTypeSelect = document.getElementById('trigger-type');
  if (triggerTypeSelect) {
    triggerTypeSelect.addEventListener('change', handleTriggerTypeChange);
  }

  const stepForm = document.getElementById('workflow-step-form');
  if (stepForm) {
    stepForm.addEventListener('submit', handleStepFormSubmit);
  }

  const stepActionSelect = document.getElementById('step-action');
  if (stepActionSelect) {
    stepActionSelect.addEventListener('change', handleStepActionChange);
    populateStepActionSelect();
  }

  const stepFieldsContainer = document.getElementById('step-dynamic-fields');
  if (stepFieldsContainer) {
    stepFieldsContainer.addEventListener('change', handleStepFieldsContainerChange);
    stepFieldsContainer.addEventListener('input', handleStepFieldsContainerChange);
  }
}

/**
 * Filtra workflows por status
 */
function filterWorkflows(filter = 'all') {
  const container = document.getElementById('workflows-list-container');
  if (!container) {
    return;
  }

  const cards = container.querySelectorAll('.workflow-item');
  let visibleCount = 0;

  cards.forEach(card => {
    const isActive = card.dataset.active === 'true' || !card.classList.contains('inactive');
    let shouldShow = true;

    switch (filter) {
      case 'active':
        shouldShow = isActive;
        break;
      case 'inactive':
        shouldShow = !isActive;
        break;
      default:
        shouldShow = true;
    }

    card.style.display = shouldShow ? '' : 'none';
    if (shouldShow) {
      visibleCount += 1;
    }
  });

  const emptyState = document.getElementById('workflow-filter-empty');
  if (emptyState) {
    emptyState.classList.toggle('d-none', visibleCount !== 0);
  }
}

/**
 * Atualiza estatísticas de workflows
 */
async function updateWorkflowStats() {
  try {
    const workflows = await db.collection('whatsappWorkflows').get();
    const activeWorkflows = workflows.docs.filter(doc => doc.data().active === true);
    
    // Total workflows
    const totalEl = document.getElementById('total-workflows-count');
    if (totalEl) totalEl.textContent = workflows.size;
    
    // Workflows ativos
    const activeEl = document.getElementById('active-workflows-count');
    if (activeEl) activeEl.textContent = activeWorkflows.length;
    
    // Sessões ativas do bot
    const sessions = await db.collection('whatsappBotSessions')
      .where('completed', '==', false)
      .get();
    
    const sessionsEl = document.getElementById('bot-sessions-count');
    if (sessionsEl) sessionsEl.textContent = sessions.size;
    
    // Taxa de conclusão
    const allSessions = await db.collection('whatsappBotSessions').get();
    const completedSessions = allSessions.docs.filter(doc => doc.data().completed === true);
    const completionRate = allSessions.size > 0 
      ? ((completedSessions.length / allSessions.size) * 100).toFixed(1)
      : '0';
    
    const rateEl = document.getElementById('completion-rate');
    if (rateEl) rateEl.textContent = `${completionRate}%`;
    
  } catch (error) {
    console.error('[whatsappWorkflowUI] Erro ao atualizar estatísticas:', error);
  }
}

/**
 * Utilitários
 */
function truncateText(text, maxLength) {
  if (text === undefined || text === null) {
    return '';
  }
  const str = String(text);
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function moveStep(index, direction) {
  const steps = uiState.currentWorkflow.steps;
  const newIndex = index + direction;
  
  if (newIndex < 0 || newIndex >= steps.length) return;
  
  [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
  renderStepsList();
}

async function removeStep(index) {
  const confirmed = window.uiHelpers
    ? await window.uiHelpers.confirmAction({ message: 'Remover esta etapa?' })
    : confirm('Remover esta etapa?');
  if (!confirmed) return;
  
  uiState.currentWorkflow.steps.splice(index, 1);
  renderStepsList();
}

function editStep(index) {
  openStepModal(index);
}

/**
 * Modais simplificados para adicionar triggers e steps
 */
// Expor globalmente
window.__WHATSAPP_WORKFLOW_UI__ = {
  init: initWhatsAppWorkflowUI,
  loadWorkflows: loadWorkflowsList,
  filterWorkflows,
  updateStats: updateWorkflowStats,
  openNewWorkflowModal
};

export default {
  init: initWhatsAppWorkflowUI,
  filterWorkflows,
  openNewWorkflowModal,
  updateStats: updateWorkflowStats
};
