/**
 * @file aiIntegrationExample.js
 * @description Exemplos de integração do Assistente IA com módulos existentes
 */

// ============================================================
// EXEMPLO 1: Integração no Modal de Adicionar Contrato
// ============================================================

// No arquivo que gerencia o modal (ex: ui.js ou addContractModal.js)

import aiAssistantManager from './aiAssistantManager.js';
import aiChatUI from './aiChatUI.js';
import firestoreService from './firestoreService.js';

// Adiciona botão de IA no modal
function enhanceAddContractModal() {
  const modal = document.getElementById('add-contract-modal');
  const form = modal.querySelector('#contract-form');
  
  // Botão para ajuda da IA
  const aiButton = document.createElement('button');
  aiButton.type = 'button';
  aiButton.className = 'btn btn-outline-primary';
  aiButton.innerHTML = '<i class="bi bi-robot"></i> Ajuda da IA';
  
  aiButton.addEventListener('click', async () => {
    // Pega dados atuais do formulário
    const formData = new FormData(form);
    const contractData = Object.fromEntries(formData.entries());
    
    // Abre chat com contexto
    aiChatUI.open();
    
    // Envia para IA processar
    const response = await aiAssistantManager.processMessage(
      'Completar campos do contrato',
      { contractData }
    );
    
    // Aplica sugestões se houver
    if (response.data && response.data.fields) {
      applyAISuggestions(response.data.fields, form);
    }
  });
  
  // Insere botão no header do modal
  const modalHeader = modal.querySelector('.modal-header');
  modalHeader.appendChild(aiButton);
}

function applyAISuggestions(fields, form) {
  Object.entries(fields).forEach(([fieldName, value]) => {
    const input = form.querySelector(`[name="${fieldName}"]`);
    if (input && !input.value) {
      input.value = value;
      input.classList.add('ai-suggested'); // Classe para destacar
    }
  });
  
  // Notifica usuário
  showToast(' Campos preenchidos pela IA!', 'success');
}

// ============================================================
// EXEMPLO 2: Upload de Documento com IA
// ============================================================

function setupDocumentUploadWithAI() {
  const uploadInput = document.getElementById('document-upload');
  const processBtn = document.getElementById('process-document-btn');
  
  processBtn.addEventListener('click', async () => {
    const file = uploadInput.files[0];
    
    if (!file) {
      alert('Selecione um arquivo primeiro');
      return;
    }
    
    // Mostra loading
    processBtn.disabled = true;
    processBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processando...';
    
    try {
      // Processa via assistente IA
      const response = await aiAssistantManager.processMessage(
        'Extrair dados deste documento',
        { documentFile: file }
      );
      
      // Se sucesso, preenche formulário
      if (response.data) {
        fillFormWithExtractedData(response.data);
        
        // Abre chat para confirmar
        aiChatUI.openWithMessage('Revisar dados extraídos');
      }
      
    } catch (error) {
      console.error('Erro ao processar documento:', error);
      alert('Erro ao processar documento: ' + error.message);
      
    } finally {
      processBtn.disabled = false;
      processBtn.innerHTML = '<i class="bi bi-magic"></i> Processar';
    }
  });
}

function fillFormWithExtractedData(data) {
  // Mapeamento de campos
  const fieldMap = {
    vendedorConstrutora: 'vendedor',
    empreendimento: 'empreendimento',
    apto: 'apartamento',
    valorContrato: 'valor',
    // ... outros campos
  };
  
  Object.entries(fieldMap).forEach(([extractedField, formField]) => {
    if (data[extractedField]) {
      const input = document.querySelector(`[name="${formField}"]`);
      if (input) {
        input.value = data[extractedField];
        input.classList.add('ai-extracted');
      }
    }
  });
}

// ============================================================
// EXEMPLO 3: Validação Inteligente Antes de Salvar
// ============================================================

async function validateContractWithAI(contractData) {
  try {
    const response = await aiAssistantManager.processMessage(
      'Validar este contrato',
      { contractData }
    );
    
    if (!response.isValid) {
      // Mostra erros encontrados pela IA
      const errorModal = new bootstrap.Modal(document.getElementById('error-modal'));
      
      const errorList = response.data.issues
        .map(issue => `<li><strong>${issue.field}:</strong> ${issue.message}</li>`)
        .join('');
      
      document.getElementById('error-list').innerHTML = `<ul>${errorList}</ul>`;
      errorModal.show();
      
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('Erro na validação:', error);
    // Continua sem validação IA em caso de erro
    return true;
  }
}

// Exemplo de uso no submit do formulário
document.getElementById('contract-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const contractData = Object.fromEntries(formData.entries());
  
  // Valida com IA
  const isValid = await validateContractWithAI(contractData);
  
  if (isValid) {
    // Salva no Firestore
    await firestoreService.createContract(contractData);
    showToast(' Contrato salvo com sucesso!', 'success');
  }
});

// ============================================================
// EXEMPLO 4: Botão Flutuante Contextual
// ============================================================

// Mostra sugestões proativas baseadas na página atual
function setupProactiveAI() {
  // Detecta página atual
  const currentPage = window.location.hash || '#dashboard';
  
  // Configura mensagens contextuais
  const contextMessages = {
    '#dashboard': 'Analisar métricas do dashboard',
    '#processos': 'Ver contratos críticos',
    '#relatorios': 'Gerar relatório personalizado',
    '#whatsapp': 'Configurar automação WhatsApp'
  };
  
  // Quando usuário fica inativo por 30 segundos, oferece ajuda
  let inactivityTimer;
  
  function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    
    inactivityTimer = setTimeout(() => {
      const message = contextMessages[currentPage] || 'Como posso ajudar?';
      
      // Mostra notificação no chat
      aiChatUI.showNotification(` Sugestão: ${message}`);
      
    }, 30000); // 30 segundos
  }
  
  // Reseta timer em qualquer interação
  ['click', 'keypress', 'scroll'].forEach(event => {
    document.addEventListener(event, resetInactivityTimer);
  });
  
  resetInactivityTimer();
}

// ============================================================
// EXEMPLO 5: Integração com Busca
// ============================================================

function setupAISearch() {
  const searchInput = document.getElementById('global-search');
  const searchBtn = document.getElementById('search-btn');
  
  // Adiciona botão de busca inteligente
  const aiSearchBtn = document.createElement('button');
  aiSearchBtn.type = 'button';
  aiSearchBtn.className = 'btn btn-sm btn-outline-primary ms-2';
  aiSearchBtn.innerHTML = '<i class="bi bi-robot"></i> Busca IA';
  aiSearchBtn.title = 'Busca semântica com IA';
  
  searchBtn.parentNode.insertBefore(aiSearchBtn, searchBtn.nextSibling);
  
  aiSearchBtn.addEventListener('click', async () => {
    const query = searchInput.value.trim();
    
    if (!query) {
      alert('Digite algo para buscar');
      return;
    }
    
    // Abre chat e processa busca
    aiChatUI.open();

    await aiAssistantManager.processMessage(
      `Buscar: ${query}`
    );

    // Resultados aparecem no chat
    // Usuário pode clicar nas sugestões para refinar
  });
}

// ============================================================
// EXEMPLO 6: Atalhos de Teclado
// ============================================================

function setupAIKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl + K ou Cmd + K = Abrir chat
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      aiChatUI.toggle();
    }
    
    // Ctrl + Shift + H ou Cmd + Shift + H = Ajuda da IA
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
      e.preventDefault();
      aiChatUI.openWithMessage('Ajuda');
    }
    
    // Ctrl + Shift + N ou Cmd + Shift + N = Novo contrato com IA
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
      e.preventDefault();
      aiChatUI.openWithMessage('Criar novo contrato');
    }
  });
}

// ============================================================
// EXEMPLO 7: Relatórios com IA
// ============================================================

async function generateAIReport(reportType = 'executive') {
  try {
    // Mostra modal de loading
    const loadingModal = new bootstrap.Modal(document.getElementById('loading-modal'));
    loadingModal.show();
    
    // Gera relatório com IA
    const response = await aiAssistantManager.processMessage(
      `Gerar relatório ${reportType}`,
      { 
        filters: getCurrentFilters(),
        period: getSelectedPeriod()
      }
    );
    
    loadingModal.hide();
    
    // Exibe relatório
    if (response.data) {
      displayReport(response.data);
      
      // Pergunta se quer exportar
      aiChatUI.openWithMessage('Relatório gerado! Deseja exportar?');
    }
    
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    alert('Erro ao gerar relatório: ' + error.message);
  }
}

// Botões de relatório com IA
document.querySelectorAll('[data-report-type]').forEach(btn => {
  btn.addEventListener('click', () => {
    const reportType = btn.dataset.reportType;
    generateAIReport(reportType);
  });
});

// ============================================================
// EXEMPLO 8: Notificações Inteligentes
// ============================================================

function setupAINotifications() {
  // Verifica periodicamente se há ações sugeridas
  setInterval(async () => {
    try {
      const response = await aiAssistantManager.processMessage(
        'Há alguma ação recomendada?'
      );
      
      if (response.action === 'proactive_suggestions') {
        // Mostra badge no chat
        aiChatUI.showNotification('Novas sugestões da IA');
        
        // Toast discreto
        showToast(' IA tem sugestões para você', 'info', { 
          autohide: true, 
          delay: 5000 
        });
      }
      
    } catch (error) {
      console.warn('Erro ao buscar sugestões:', error);
    }
  }, 300000); // A cada 5 minutos
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

// Quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  // Integra IA nos modais
  enhanceAddContractModal();
  
  // Configura upload com IA
  setupDocumentUploadWithAI();
  
  // Busca inteligente
  setupAISearch();
  
  // Atalhos de teclado
  setupAIKeyboardShortcuts();
  
  // Sugestões proativas
  setupProactiveAI();
  
  // Notificações inteligentes
  setupAINotifications();
  
  console.log(' Integração IA configurada');
});

// Exporta funções úteis
export {
  enhanceAddContractModal,
  setupDocumentUploadWithAI,
  validateContractWithAI,
  generateAIReport,
  setupAISearch,
  setupAIKeyboardShortcuts,
  setupProactiveAI,
  setupAINotifications
};
