/**
 * @file whatsappPhoneConfigUI.js
 * @description Interface de configuração de múltiplos números WhatsApp Business
 * 
 * Funcionalidades:
 * - Lista de números cadastrados
 * - Adicionar/editar números
 * - Ativar/desativar números
 * - Estatísticas de uso por número
 * 
 * Data: 2025-10-30
 */

import whatsappPhoneManager from './whatsappPhoneManager.js';
import { showNotification } from './ui.js';

if (window.__DEBUG__) console.log('[whatsappPhoneConfigUI] Módulo carregado.');

let editingPhoneId = null;

function getFormField(form, name, fallbackId = null) {
  if (!form) return null;
  return (
    form.querySelector(`[name="${name}"]`) ||
    (fallbackId ? document.getElementById(fallbackId) : null)
  );
}

/**
 * Inicializa interface de configuração de números
 */
export async function initPhoneConfigUI() {
  if (window.__DEBUG__) console.log('[whatsappPhoneConfigUI] Inicializando...');

  await renderPhoneNumbersList();

  // Botão adicionar
  const addBtn = document.getElementById('add-phone-number-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      editingPhoneId = null;
      const form = document.getElementById('phone-number-form');
      if (form) {
        form.reset();
        // Resetar readonly do campo phoneNumber
        const phoneNumberField = getFormField(form, 'phoneNumber', 'phone-number-input');
        if (phoneNumberField) {
          phoneNumberField.readOnly = false;
          phoneNumberField.classList.remove('bg-light');
        }
      }
      
      // Resetar título do modal
      const modalTitle = document.querySelector('#phone-number-modal .modal-title');
      if (modalTitle) modalTitle.textContent = 'Adicionar Número WhatsApp';
      
      const modal = new window.bootstrap.Modal(document.getElementById('phone-number-modal'));
      modal.show();
    });
  }

  // Botão salvar
  const saveBtn = document.getElementById('save-phone-number-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', savePhoneNumber);
  }

  // Botão toggle Access Token
  const toggleTokenBtn = document.getElementById('toggle-phone-access-token');
  const accessTokenInput = document.getElementById('access-token-input');
  if (toggleTokenBtn && accessTokenInput) {
    toggleTokenBtn.addEventListener('click', () => {
      const isPassword = accessTokenInput.type === 'password';
      accessTokenInput.type = isPassword ? 'text' : 'password';
      const icon = toggleTokenBtn.querySelector('i');
      if (icon) {
        icon.className = isPassword ? 'bi bi-eye-slash' : 'bi bi-eye';
      }
    });
  }

  if (window.__DEBUG__) console.log('[whatsappPhoneConfigUI] Inicializado');
}

/**
 * Renderiza lista de números cadastrados
 */
async function renderPhoneNumbersList() {
  const container = document.getElementById('phone-numbers-list');
  if (!container) {
    console.warn('[whatsappPhoneConfigUI] Container phone-numbers-list não encontrado');
    return;
  }

  try {
    // Mostrar loading
    container.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary" role="status"></div></div>';

    const phones = await whatsappPhoneManager.list();

    if (phones.length === 0) {
      container.innerHTML = `
        <div class="text-center p-4 text-muted">
          <i class="bi bi-phone display-1"></i>
          <p class="mt-3">Nenhum número WhatsApp cadastrado</p>
          <p class="small">Clique em "Adicionar Número" para começar</p>
        </div>
      `;
      return;
    }

    // Carregar estatísticas em paralelo
    const phonesWithStats = await Promise.all(
      phones.map(async phone => {
        const stats = await whatsappPhoneManager.getStats(phone.id);
        return { ...phone, stats };
      })
    );

    container.innerHTML = phonesWithStats.map(phone => `
      <div class="card mb-3 ${!phone.isActive ? 'border-secondary' : ''}">
        <div class="card-body">
          <div class="row align-items-center">
            <div class="col-md-6">
              <h6 class="mb-1">
                 ${phone.displayName}
                ${phone.isActive 
                  ? '<span class="badge bg-success ms-2">Ativo</span>' 
                  : '<span class="badge bg-secondary ms-2">Inativo</span>'}
              </h6>
              <p class="mb-1 text-muted small">
                <i class="bi bi-telephone"></i> ${formatPhoneNumber(phone.phoneNumber)}
              </p>
              ${phone.department 
                ? `<p class="mb-1 small"><i class="bi bi-building"></i> ${phone.department}</p>` 
                : ''}
              ${phone.businessAccountId 
                ? `<p class="mb-0 small text-muted">Business ID: ${phone.businessAccountId}</p>` 
                : ''}
            </div>
            
            <div class="col-md-3">
              <div class="small">
                <div class="mb-1">
                  <strong>${phone.stats.activeChats}</strong> 
                  <span class="text-muted">/ ${phone.metadata?.maxConcurrentChats || 50}</span>
                  <small class="text-muted">ativas</small>
                </div>
                <div class="mb-1">
                  <strong>${phone.stats.todayChats}</strong> 
                  <small class="text-muted">hoje</small>
                </div>
                <div>
                  <strong>${phone.stats.totalChats}</strong> 
                  <small class="text-muted">total</small>
                </div>
              </div>
            </div>
            
            <div class="col-md-3 text-end">
              <button class="btn btn-sm btn-outline-primary me-1" 
                      onclick="window.__editPhoneNumber('${phone.id}')">
                <i class="bi bi-pencil"></i> Editar
              </button>
              <button class="btn btn-sm btn-outline-danger" 
                      onclick="window.__deletePhoneNumber('${phone.id}', '${phone.displayName}')">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
          
          ${phone.metadata?.autoAssign 
            ? '<div class="mt-2"><small class="text-success"><i class="bi bi-check-circle"></i> Atribuição automática ativada</small></div>' 
            : ''}
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error('[whatsappPhoneConfigUI] Erro ao renderizar lista:', err);
    container.innerHTML = `
      <div class="alert alert-danger">
        <i class="bi bi-exclamation-triangle"></i> Erro ao carregar números: ${err.message}
      </div>
    `;
  }
}

/**
 * Salva número (criar ou atualizar)
 */
async function savePhoneNumber() {
  const form = document.getElementById('phone-number-form');
  if (!form) return;

  const formData = new FormData(form);
  const hasAutoAssignField = Boolean(getFormField(form, 'autoAssign', 'auto-assign-switch'));
  const hasIsActiveField = Boolean(getFormField(form, 'isActive', 'is-active-switch'));

  const phoneData = {
    phoneNumber: formData.get('phoneNumber'),
    displayName: formData.get('displayName'),
    department: formData.get('department') || null,
    businessAccountId: formData.get('businessAccountId') || null,
    phoneNumberId: formData.get('phoneNumberId'), //  NOVO: Phone Number ID da API
    accessToken: formData.get('accessToken'), //  NOVO: Access Token da API
    priority: parseInt(formData.get('priority')) || 99,
    maxConcurrentChats: parseInt(formData.get('maxConcurrentChats')) || 50,
    autoAssign: hasAutoAssignField ? formData.get('autoAssign') === 'on' : true,
    isActive: hasIsActiveField ? formData.get('isActive') === 'on' : true
  };

  // Debug: mostrar dados coletados
  if (window.__DEBUG__) {
    console.log('[whatsappPhoneConfigUI] Dados coletados:', phoneData);
    console.log('[whatsappPhoneConfigUI] Editando?', editingPhoneId);
  }

  // Validação básica
  // Se estiver editando, phoneNumber pode estar vazio (campo disabled)
  if (!editingPhoneId && !phoneData.phoneNumber) {
    showNotification('Número WhatsApp é obrigatório', 'error');
    return;
  }

  if (!phoneData.displayName) {
    showNotification('Nome de Exibição é obrigatório', 'error');
    return;
  }

  // Validação de credenciais da API
  if (!phoneData.phoneNumberId || !phoneData.accessToken) {
    showNotification('Phone Number ID e Access Token são obrigatórios', 'error');
    return;
  }

  try {
    const saveBtn = document.getElementById('save-phone-number-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Salvando...';
    }

    if (editingPhoneId) {
      // Atualizar (remover phoneNumber do payload pois não pode ser alterado)
      // eslint-disable-next-line no-unused-vars
      const { phoneNumber, maxConcurrentChats, autoAssign, ...updates } = phoneData;
      updates.metadata = {
        maxConcurrentChats,
        autoAssign
      };
      await whatsappPhoneManager.update(editingPhoneId, updates);
    } else {
      // Criar
      await whatsappPhoneManager.add(phoneData);
    }

    // Fechar modal
    const modalEl = document.getElementById('phone-number-modal');
    const modal = window.bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    // Atualizar lista
    await renderPhoneNumbersList();

  } catch (err) {
    console.error('[whatsappPhoneConfigUI] Erro ao salvar:', err);
    // Notificação já é exibida pelo manager
  } finally {
    const saveBtn = document.getElementById('save-phone-number-btn');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> Salvar';
    }
  }
}

/**
 * Carrega dados para edição
 * @param {string} phoneId 
 */
async function editPhoneNumber(phoneId) {
  editingPhoneId = phoneId;
  
  try {
    const phone = await whatsappPhoneManager.get(phoneId);

    if (!phone) {
      showNotification('Número não encontrado', 'error');
      return;
    }

    const form = document.getElementById('phone-number-form');
    if (!form) return;

    const phoneNumberField = getFormField(form, 'phoneNumber', 'phone-number-input');
    const displayNameField = getFormField(form, 'displayName', 'display-name-input');
    const departmentField = getFormField(form, 'department', 'department-select');
    const businessAccountIdField = getFormField(form, 'businessAccountId', 'business-account-id-input');
    const phoneNumberIdField = getFormField(form, 'phoneNumberId', 'phone-number-id-input');
    const accessTokenField = getFormField(form, 'accessToken', 'access-token-input');
    const priorityField = getFormField(form, 'priority', 'priority-input');
    const maxConcurrentChatsField = getFormField(form, 'maxConcurrentChats', 'max-concurrent-chats-input');
    const autoAssignField = getFormField(form, 'autoAssign', 'auto-assign-switch');
    const isActiveField = getFormField(form, 'isActive', 'is-active-switch');

    // Preencher formulário
    if (phoneNumberField) {
      phoneNumberField.value = phone.phoneNumber || '';
      phoneNumberField.readOnly = true; // Não permitir alterar número (readonly envia valor no FormData)
      phoneNumberField.classList.add('bg-light'); // Visual de campo desabilitado
    }

    if (displayNameField) displayNameField.value = phone.displayName || '';
    if (departmentField) departmentField.value = phone.department || '';
    if (businessAccountIdField) businessAccountIdField.value = phone.businessAccountId || '';
    if (phoneNumberIdField) phoneNumberIdField.value = phone.phoneNumberId || '';
    if (accessTokenField) accessTokenField.value = phone.accessToken || '';
    if (priorityField) priorityField.value = phone.priority || 99;
    if (maxConcurrentChatsField) maxConcurrentChatsField.value = phone.metadata?.maxConcurrentChats || 50;
    if (autoAssignField) autoAssignField.checked = phone.metadata?.autoAssign !== false;
    if (isActiveField) isActiveField.checked = phone.isActive !== false;

    // Alterar título do modal
    const modalTitle = document.querySelector('#phone-number-modal .modal-title');
    if (modalTitle) modalTitle.textContent = `Editar: ${phone.displayName}`;

    const modal = new window.bootstrap.Modal(document.getElementById('phone-number-modal'));
    modal.show();

  } catch (err) {
    console.error('[whatsappPhoneConfigUI] Erro ao carregar número:', err);
    showNotification('Erro ao carregar dados do número', 'error');
  }
}

/**
 * Remove número (com confirmação)
 * @param {string} phoneId 
 * @param {string} displayName 
 */
async function deletePhoneNumber(phoneId, displayName) {
  const confirmed = window.uiHelpers
    ? await window.uiHelpers.confirmAction({
        title: 'Desativar Número',
        message: `Tem certeza que deseja desativar o número "${displayName}"? Ele não será removido, apenas marcado como inativo.`
      })
    : confirm(
        `Tem certeza que deseja desativar o número "${displayName}"?\n\n` +
        'Ele não será removido, apenas marcado como inativo.'
      );
  
  if (!confirmed) return;
  
  try {
    await whatsappPhoneManager.remove(phoneId);
    await renderPhoneNumbersList();
  } catch (err) {
    console.error('[whatsappPhoneConfigUI] Erro ao remover:', err);
    // Notificação já é exibida pelo manager
  }
}

/**
 * Formata número para exibição
 * @param {string} phone - Número normalizado (55XXXXXXXXXXX)
 * @returns {string} Formatado: +55 (XX) XXXXX-XXXX
 */
function formatPhoneNumber(phone) {
  if (!phone) return '';
  
  // Remover país (55)
  let cleaned = phone.replace(/^55/, '');
  
  if (cleaned.length === 11) {
    // Celular: (XX) XXXXX-XXXX
    return `+55 (${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
  } else if (cleaned.length === 10) {
    // Fixo: (XX) XXXX-XXXX
    return `+55 (${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
  }
  
  return `+55 ${cleaned}`;
}

// Expor funções globalmente para uso nos onclick dos botões
window.__editPhoneNumber = editPhoneNumber;
window.__deletePhoneNumber = deletePhoneNumber;

// API pública
export const whatsappPhoneConfigUI = {
  init: initPhoneConfigUI,
  refresh: renderPhoneNumbersList
};

// Expor globalmente
window.__WHATSAPP_PHONE_CONFIG_UI__ = whatsappPhoneConfigUI;

export default whatsappPhoneConfigUI;
