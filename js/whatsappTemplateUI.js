/**
 * WhatsApp Template UI
 * Interface para envio de Message Templates (Dropdown + Modal)
 */

let currentChatId = null;
let selectedTemplateId = null;
let templateParameters = {};

/**
 * Obtém o serviço de templates
 */
function getTemplateService() {
  return window.__WHATSAPP_TEMPLATE_SERVICE__;
}

function getCurrentTemplateSendOptions() {
  const whatsappUI = window.__WHATSAPP_UI__;
  const state = whatsappUI && typeof whatsappUI.getState === 'function'
    ? whatsappUI.getState()
    : null;
  const phoneNumberId = state?.currentChat?.phoneNumberId;

  if (typeof phoneNumberId === 'string' && phoneNumberId.trim()) {
    return { phoneNumberId: phoneNumberId.trim() };
  }

  return {};
}

/**
 * Inicializa event listeners para Dropdown e Modal
 */
export function initWhatsAppTemplateUI() {
  console.log(' Inicializando WhatsApp Template UI (Dropdown + Modal)...');

  // ============ DROPDOWN (Banner 24h) ============
  setupDropdownListeners();

  // ============ MODAL (Sidebar) ============
  setupModalListeners();
  
  console.log(' WhatsApp Template UI inicializado');
}

/**
 * Exibe modal com mensagem de erro detalhada
 */
function showErrorModal(title, message) {
  // Criar modal dinamicamente se não existir
  let modal = document.getElementById('template-error-modal');
  
  if (!modal) {
    const modalHtml = `
      <div class="modal fade" id="template-error-modal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header bg-danger text-white">
              <h5 class="modal-title"><i class="bi bi-exclamation-triangle-fill me-2"></i><span id="error-modal-title"></span></h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <pre class="mb-0" style="white-space: pre-wrap; font-family: inherit;" id="error-modal-message"></pre>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    modal = document.getElementById('template-error-modal');
  }
  
  // Atualizar conteúdo
  document.getElementById('error-modal-title').textContent = title;
  document.getElementById('error-modal-message').textContent = message;
  
  // Exibir modal
  const bsModal = new window.bootstrap.Modal(modal);
  bsModal.show();
}

/**
 * Configura listeners do dropdown
 */
function setupDropdownListeners() {
  console.log(' Configurando listeners do dropdown...');
  
  // Event delegation para capturar o evento quando o dropdown é criado dinamicamente
  document.addEventListener('shown.bs.dropdown', function (e) {
    const target = e.target;
    
    // Verifica se é o dropdown de templates
    if (target && target.id === 'whatsapp-template-dropdown-btn') {
      console.log(' Dropdown de template aberto (via event delegation)');
      
      const whatsappUI = window.__WHATSAPP_UI__;
      let chatId = null;
      
      if (whatsappUI && typeof whatsappUI.getCurrentChatId === 'function') {
        chatId = whatsappUI.getCurrentChatId();
        console.log(' Chat ID obtido:', chatId);
      } else {
        console.warn(' WhatsApp UI API não disponível');
      }

      currentChatId = chatId;
      
      console.log(' Carregando templates no dropdown...');
      loadTemplatesIntoDropdown();
      console.log(' Dropdown configurado com chat ID:', currentChatId);
    }
  });

  // Event delegation para mudança de template
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'template-select-dropdown') {
      console.log(' Template selecionado:', e.target.value);
      handleTemplateSelectDropdown(e);
    }
  });

  // Event delegation para botão de envio
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'send-template-btn-dropdown') {
      console.log(' Botão de envio clicado (dropdown)');
      handleSendTemplateDropdown();
    }
  });
  
  console.log(' Listeners do dropdown configurados com event delegation');
}

/**
 * Configura listeners do modal
 */
function setupModalListeners() {
  const modalEl = document.getElementById('modal-whatsapp-send-template');
  
  if (modalEl) {
    modalEl.addEventListener('show.bs.modal', function () {
      console.log(' Modal de template está abrindo...');
      
      const whatsappUI = window.__WHATSAPP_UI__;
      let chatId = null;
      
      if (whatsappUI && typeof whatsappUI.getCurrentChatId === 'function') {
        chatId = whatsappUI.getCurrentChatId();
      }

      currentChatId = chatId;
      loadTemplatesIntoSelect();
    });
  }

  const templateSelect = document.getElementById('template-select');
  if (templateSelect) {
    templateSelect.addEventListener('change', handleTemplateSelect);
  }

  const sendBtn = document.getElementById('send-template-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', handleSendTemplate);
  }
}

// ============ FUNÇÕES DROPDOWN ============

/**
 * Carrega templates no dropdown
 */
function loadTemplatesIntoDropdown() {
  console.log(' loadTemplatesIntoDropdown() chamada');
  
  const select = document.getElementById('template-select-dropdown');
  console.log(' Select encontrado:', !!select);
  
  if (!select) {
    console.error(' Select template-select-dropdown não encontrado no DOM');
    return;
  }

  const templateService = getTemplateService();
  console.log(' Template Service:', !!templateService);
  
  if (!templateService) {
    console.error(' Template Service não disponível em window.__WHATSAPP_TEMPLATE_SERVICE__');
    return;
  }

  const templates = templateService.getAvailableTemplates();
  console.log(' Templates disponíveis:', templates.length);
  console.log(' Templates:', templates);
  
  select.innerHTML = '<option value="">-- Selecione um template --</option>';

  templates.forEach((template, index) => {
    console.log(`  ${index + 1}. ${template.name} (${template.id})`);
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.name;
    select.appendChild(option);
  });
  
  console.log(' Templates carregados no dropdown:', templates.length);
}

/**
 * Manipula seleção de template no dropdown
 */
function handleTemplateSelectDropdown(e) {
  const templateId = e.target.value;
  selectedTemplateId = templateId;
  
  const paramsContainer = document.getElementById('template-params-dropdown');
  if (!paramsContainer) return;

  paramsContainer.innerHTML = '';
  
  if (!templateId) {
    return;
  }

  const templateService = getTemplateService();
  const template = templateService.getTemplateById(templateId);
  
  if (!template || !template.parameters || template.parameters.length === 0) {
    return;
  }

  template.parameters.forEach(param => {
    const div = document.createElement('div');
    div.className = 'mb-2';
    div.innerHTML = `
      <label class="form-label small mb-1">${param.label}</label>
      <input type="text" 
             class="form-control form-control-sm" 
             data-param="${param.name}" 
             placeholder="${param.placeholder || ''}"
             ${param.required ? 'required' : ''}>
    `;
    paramsContainer.appendChild(div);
  });
}

/**
 * Manipula envio de template via dropdown
 */
async function handleSendTemplateDropdown() {
  console.log(' Enviando template via dropdown...');
  
  if (!currentChatId) {
    showNotification('Nenhum chat selecionado', 'error');
    return;
  }

  if (!selectedTemplateId) {
    showNotification('Selecione um template', 'warning');
    return;
  }

  const paramsContainer = document.getElementById('template-params-dropdown');
  const inputs = paramsContainer.querySelectorAll('input[data-param]');
  
  templateParameters = {};
  let hasError = false;

  inputs.forEach(input => {
    const key = input.dataset.param;
    const value = input.value.trim();
    
    if (input.required && !value) {
      input.classList.add('is-invalid');
      hasError = true;
    } else {
      input.classList.remove('is-invalid');
      templateParameters[key] = value;
    }
  });

  if (hasError) {
    showNotification('Preencha todos os campos obrigatórios', 'warning');
    return;
  }

  const sendBtn = document.getElementById('send-template-btn-dropdown');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Enviando...';
  }

  try {
    const templateService = getTemplateService();
    const options = getCurrentTemplateSendOptions();
    await templateService.sendTemplate(currentChatId, selectedTemplateId, templateParameters, options);
    
    showNotification('Template enviado com sucesso!', 'success');
    
    // Fechar dropdown
    const dropdownBtn = document.getElementById('whatsapp-template-dropdown-btn');
    if (dropdownBtn) {
      const dropdown = window.bootstrap.Dropdown.getInstance(dropdownBtn);
      if (dropdown) dropdown.hide();
    }
    
    // Limpar formulário
    selectedTemplateId = null;
    templateParameters = {};
    const select = document.getElementById('template-select-dropdown');
    if (select) select.value = '';
    if (paramsContainer) paramsContainer.innerHTML = '';
    
  } catch (error) {
    console.error(' Erro ao enviar template (dropdown):', error);
    
    // Exibir erro detalhado em modal se houver quebras de linha
    if (error.message && error.message.includes('\n')) {
      showErrorModal('Erro ao Enviar Template', error.message);
    } else {
      showNotification(error.message || 'Erro ao enviar template', 'error');
    }
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="bi bi-send me-1"></i> Enviar Template';
    }
  }
}

// ============ FUNÇÕES MODAL ============

/**
 * Carrega templates no select do modal
 */
function loadTemplatesIntoSelect() {
  const select = document.getElementById('template-select');
  if (!select) return;

  const templateService = getTemplateService();
  if (!templateService) return;

  const templates = templateService.getAvailableTemplates();
  
  select.innerHTML = '<option value="">-- Selecione um template --</option>';

  templates.forEach(template => {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.name;
    select.appendChild(option);
  });
  
  // Reset do estado visual
  const previewArea = document.getElementById('template-preview-area');
  const warningArea = document.getElementById('template-warning-area');
  const paramsContainer = document.getElementById('template-params');
  const sendBtn = document.getElementById('send-template-btn');
  
  if (previewArea) previewArea.classList.add('d-none');
  if (warningArea) warningArea.classList.add('d-none');
  if (paramsContainer) paramsContainer.innerHTML = '';
  if (sendBtn) sendBtn.disabled = true;
  
  // Reset estado
  selectedTemplateId = null;
  templateParameters = {};
}

/**
 * Manipula seleção de template no modal
 */
function handleTemplateSelect(e) {
  const templateId = e.target.value;
  selectedTemplateId = templateId;
  
  const paramsContainer = document.getElementById('template-params');
  const previewArea = document.getElementById('template-preview-area');
  const previewText = document.getElementById('template-example-text');
  const warningArea = document.getElementById('template-warning-area');
  const sendBtn = document.getElementById('send-template-btn');
  
  // Limpar parâmetros
  if (paramsContainer) paramsContainer.innerHTML = '';
  
  // Se nenhum template selecionado, esconder tudo
  if (!templateId) {
    if (previewArea) previewArea.classList.add('d-none');
    if (warningArea) warningArea.classList.add('d-none');
    if (sendBtn) sendBtn.disabled = true;
    return;
  }

  const templateService = getTemplateService();
  const template = templateService.getTemplateById(templateId);
  
  if (!template) {
    if (previewArea) previewArea.classList.add('d-none');
    if (warningArea) warningArea.classList.add('d-none');
    if (sendBtn) sendBtn.disabled = true;
    return;
  }

  // Mostrar preview
  if (previewArea && previewText) {
    previewArea.classList.remove('d-none');
    previewText.textContent = template.example || template.exampleText || template.body || 'Preview não disponível';
  }
  
  // Verificar se template está aprovado (mostra warning se não estiver)
  if (warningArea) {
    warningArea.classList.toggle('d-none', template.approved !== false);
  }
  
  // Habilitar botão de envio
  if (sendBtn) sendBtn.disabled = false;

  // Gerar campos de parâmetros
  if (template.parameters && template.parameters.length > 0) {
    template.parameters.forEach(param => {
      const div = document.createElement('div');
      div.className = 'mb-3';
      div.innerHTML = `
        <label class="form-label fw-semibold">${param.label}</label>
        <input type="text" 
               class="form-control" 
               data-param="${param.name}" 
               placeholder="${param.placeholder || ''}"
               ${param.required ? 'required' : ''}>
        <div class="invalid-feedback">Este campo é obrigatório</div>
      `;
      paramsContainer.appendChild(div);
    });
  }
}

/**
 * Manipula envio de template via modal
 */
async function handleSendTemplate() {
  console.log(' Enviando template via modal...');
  
  if (!currentChatId) {
    showNotification('Nenhum chat selecionado', 'error');
    return;
  }

  if (!selectedTemplateId) {
    showNotification('Selecione um template', 'warning');
    return;
  }

  const paramsContainer = document.getElementById('template-params');
  const inputs = paramsContainer.querySelectorAll('input[data-param]');
  
  templateParameters = {};
  let hasError = false;

  inputs.forEach(input => {
    const key = input.dataset.param;
    const value = input.value.trim();
    
    if (input.required && !value) {
      input.classList.add('is-invalid');
      hasError = true;
    } else {
      input.classList.remove('is-invalid');
      templateParameters[key] = value;
    }
  });

  if (hasError) {
    showNotification('Preencha todos os campos obrigatórios', 'warning');
    return;
  }

  const sendBtn = document.getElementById('send-template-btn');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Enviando...';
  }

  try {
    const templateService = getTemplateService();
    const options = getCurrentTemplateSendOptions();
    await templateService.sendTemplate(currentChatId, selectedTemplateId, templateParameters, options);
    
    showNotification('Template enviado com sucesso!', 'success');
    
    // Fechar modal
    const modalEl = document.getElementById('modal-whatsapp-send-template');
    const modal = window.bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    
    // Limpar formulário
    selectedTemplateId = null;
    templateParameters = {};
    const select = document.getElementById('template-select');
    if (select) select.value = '';
    if (paramsContainer) paramsContainer.innerHTML = '';
    
  } catch (error) {
    console.error(' Erro ao enviar template:', error);
    showNotification(error.message || 'Erro ao enviar template', 'error');
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="bi bi-send me-1"></i> Enviar Template';
    }
  }
}

// ============ UTILITÁRIOS ============

/**
 * Exibe notificação
 */
function showNotification(message, type = 'info', duration = 3000) {
  // Tenta usar o notificationService global
  if (window.showNotification && typeof window.showNotification === 'function') {
    window.showNotification(message, type, duration);
    return;
  }

  // Fallback: console
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// Expor funções globalmente
if (typeof window !== 'undefined') {
  window.__WHATSAPP_TEMPLATE_UI__ = {
    initWhatsAppTemplateUI
  };
}
