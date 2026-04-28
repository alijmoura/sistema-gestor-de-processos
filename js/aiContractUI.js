/**
 * @file aiContractUI.js
 * @description Integração da IA na interface de contratos
 * Adiciona botões, sugestões e validações inteligentes nos modais
 */

import documentProcessingService from './documentProcessingService.js';
import aiContractAssistant from './aiContractAssistant.js';

class AIContractUI {
  constructor() {
    this.isProcessing = false;
    this.initialized = false;
    this.debugMode = false;
    this._initInterval = null; // Controla o interval de inicialização
  }

  /**
   * Ativa modo debug
   */
  enableDebug() {
    this.debugMode = true;
    window.__DEBUG__ = true;
    console.log(' Debug mode ativado para AIContractUI');
  }

  /**
   * Inicializa a UI de IA no modal de adicionar contrato
   */
  init() {
    // Evita inicialização duplicada
    if (this.initialized) {
      return;
    }

    // Limpa interval anterior se existir (evita múltiplos intervals)
    if (this._initInterval) {
      clearInterval(this._initInterval);
      this._initInterval = null;
    }

    // Verifica se o modal já existe
    const modal = document.getElementById('add-contract-modal');
    if (modal) {
      this.setupAddContractModal();
      this.initialized = true;
      console.log(' AIContractUI inicializado com sucesso');
      window.debug && window.debug(' AI Contract UI inicializado');
      return;
    }

    // Aguarda o modal ser renderizado (máx 10 tentativas = 5s)
    let attempts = 0;
    const maxAttempts = 10;

    this._initInterval = setInterval(() => {
      attempts++;
      const modalCheck = document.getElementById('add-contract-modal');

      if (modalCheck) {
        clearInterval(this._initInterval);
        this._initInterval = null;
        this.setupAddContractModal();
        this.initialized = true;
        console.log(' AIContractUI inicializado com sucesso');
        window.debug && window.debug(' AI Contract UI inicializado');
      } else if (attempts >= maxAttempts) {
        clearInterval(this._initInterval);
        this._initInterval = null;
        console.warn(' AIContractUI: modal não encontrado após timeout');
      }
    }, 500);
  }

  /**
   * Configura recursos de IA no modal de adicionar contrato
   */
  setupAddContractModal() {
    // Adiciona seção de IA no topo do modal
    this.injectAISection();

    // Adiciona listeners para sugestões automáticas
    this.setupAutoSuggestions();

    // Adiciona validação inteligente ao submeter
    this.setupIntelligentValidation();
  }

  /**
   * Injeta seção de IA no modal
   */
  injectAISection() {
    // Verifica se já existe a seção de IA para evitar duplicação
    if (document.getElementById('ai-assistant-section')) {
      console.log(' Seção de IA já existe, pulando injeção');
      this.bindAIEvents(); // Apenas rebinda os eventos
      return;
    }

    const form = document.querySelector('#add-contract-modal #contract-form');
    if (!form) {
      console.warn(' Formulário #contract-form não encontrado para injetar seção de IA');
      return;
    }

    const aiSection = document.createElement('div');
    aiSection.className = 'card border-primary shadow-sm mb-4';
    aiSection.id = 'ai-assistant-section';
    aiSection.innerHTML = `
      <div class="card-header bg-primary text-white">
        <h5 class="mb-0 d-flex align-items-center justify-content-between">
          <span>
            <i class="bi bi-robot me-2"></i>
            Assistente Inteligente
          </span>
          <span class="badge bg-light text-primary">IA</span>
        </h5>
      </div>
      <div class="card-body">
        <div class="row g-3">
          <!-- Upload de documento -->
          <div class="col-md-6">
            <label class="form-label fw-bold">
              <i class="bi bi-file-earmark-pdf me-1"></i>
              Extrair de Documento
            </label>
            <div class="input-group">
              <input 
                type="file" 
                class="form-control" 
                id="ai-document-upload"
                accept=".pdf,.txt,.jpg,.jpeg,.png"
              />
              <button 
                class="btn btn-primary" 
                type="button" 
                id="ai-process-document-btn"
                disabled
              >
                <i class="bi bi-magic"></i> Processar
              </button>
            </div>
            <small class="text-muted">Formatos: PDF, TXT, JPG, PNG (máx 10MB)</small>
          </div>

          <!-- Auto-completar -->
          <div class="col-md-6">
            <label class="form-label fw-bold">
              <i class="bi bi-stars me-1"></i>
              Preenchimento Inteligente
            </label>
            <button 
              class="btn btn-outline-primary w-100" 
              type="button" 
              id="ai-autocomplete-btn"
            >
              <i class="bi bi-lightning-charge"></i> Auto-completar Campos
            </button>
            <small class="text-muted">Preenche campos vazios com sugestões</small>
          </div>

          <!-- Status do processamento -->
          <div class="col-12">
            <div id="ai-status" class="alert alert-info d-none" role="alert">
              <div class="d-flex align-items-center">
                <div class="spinner-border spinner-border-sm me-2" role="status">
                  <span class="visually-hidden">Processando...</span>
                </div>
                <span id="ai-status-text">Aguarde...</span>
              </div>
            </div>
          </div>

          <!-- Sugestões da IA -->
          <div class="col-12">
            <div id="ai-suggestions-container" class="d-none">
              <div class="alert alert-success">
                <h6 class="alert-heading">
                  <i class="bi bi-lightbulb"></i> Sugestões da IA
                </h6>
                <div id="ai-suggestions-content"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Insere no início do formulário (antes do primeiro card)
    form.insertBefore(aiSection, form.firstChild);

    // Adiciona event listeners
    this.bindAIEvents();
  }

  /**
   * Vincula eventos aos botões de IA
   */
  bindAIEvents() {
    // Upload de documento
    const fileInput = document.getElementById('ai-document-upload');
    const processBtn = document.getElementById('ai-process-document-btn');
    
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const hasFile = e.target.files.length > 0;
        processBtn.disabled = !hasFile;
      });
    }

    if (processBtn) {
      processBtn.addEventListener('click', () => this.processDocument());
    }

    // Auto-completar
    const autocompleteBtn = document.getElementById('ai-autocomplete-btn');
    if (autocompleteBtn) {
      autocompleteBtn.addEventListener('click', () => this.autoCompleteFields());
    }
  }

  /**
   * Processa documento enviado
   */
  async processDocument() {
    const fileInput = document.getElementById('ai-document-upload');
    const file = fileInput.files[0];
    
    if (!file) {
      window.debug && window.debug(' Nenhum arquivo selecionado');
      return;
    }

    window.debug && window.debug(` Processando arquivo: ${file.name}`);
    this.showStatus('Processando documento...', 'info');
    this.isProcessing = true;

    try {
      const result = await documentProcessingService.processFile(file, {
        includeRawText: false
      });

      window.debug && window.debug(' Resultado do processamento:', result);

      if (!result.success) {
        throw new Error(result.error || 'Falha ao processar documento');
      }

      if (!result.data || Object.keys(result.data).length === 0) {
        throw new Error('Nenhum dado foi extraído do documento');
      }

      window.debug && window.debug(' Dados extraídos:', result.data);

      // Preenche os campos com os dados extraídos
      const applyResult = this.fillFormWithData(result.data);
      const totalApplied = (applyResult.fieldsFilledCount || 0) + (applyResult.compradoresAddedCount || 0);

      if (totalApplied === 0) {
        throw new Error('Documento processado, mas nenhum campo compativel foi encontrado para preencher o modal.');
      }

      // Mostra sugestões
      this.showSuggestions(result.data, result.metadata);

      this.showStatus(` Documento processado com sucesso! ${totalApplied} item(ns) aplicados ao formulario.`, 'success');
      
      // Limpa o input de arquivo
      fileInput.value = '';
      document.getElementById('ai-process-document-btn').disabled = true;

    } catch (error) {
      console.error(' Erro ao processar documento:', error);
      window.debug && window.debug(' Erro completo:', error);
      this.showStatus(` Erro: ${error.message}`, 'danger');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Auto-completa campos vazios com sugestões IA
   */
  async autoCompleteFields() {
    window.debug && window.debug(' Iniciando auto-completar campos');
    this.showStatus('Gerando sugestões inteligentes...', 'info');
    this.isProcessing = true;

    try {
      // Coleta dados atuais do formulário
      const currentData = this.getFormData();
      window.debug && window.debug(' Dados atuais do formulário:', currentData);

      // Usa assistente para auto-completar
      const completed = await aiContractAssistant.autoCompleteContract(currentData);
      window.debug && window.debug(' Dados completados pela IA:', completed);

      // Preenche apenas campos vazios
      const applyResult = this.fillFormWithData(completed, { onlyEmpty: true });
      const totalApplied = (applyResult.fieldsFilledCount || 0) + (applyResult.compradoresAddedCount || 0);

      // Mostra quais campos foram preenchidos
      const filledFields = Object.keys(completed)
        .filter(key => key.endsWith('_aiSuggested'))
        .map(key => key.replace('_aiSuggested', ''));

      if (filledFields.length > 0 || totalApplied > 0) {
        this.showStatus(
          ` ${Math.max(filledFields.length, totalApplied)} item(ns) preenchido(s) automaticamente!`,
          'success'
        );
        this.highlightAISuggestedFields(filledFields);
      } else {
        this.showStatus(' Todos os campos já estão preenchidos', 'info');
      }

    } catch (error) {
      console.error(' Erro ao auto-completar:', error);
      window.debug && window.debug(' Erro completo:', error);
      this.showStatus(` Erro: ${error.message}`, 'danger');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Coleta dados atuais do formulário
   */
  getFormData() {
    const data = {};
    const fields = [
      'workflowId', 'status', 'vendedorConstrutora', 'empreendimento', 'apto', 'bloco',
      'nContratoCEF', 'dataMinuta', 'dataAssinatura', 'valorContrato', 'entrada', 'financiamento',
      'saldoReceber', 'cartorio', 'matriculaImovel', 'municipioImovel', 'iptu', 'formaPagamentoRi',
      'valorDepositoRi', 'dataEntradaRegistro', 'protocoloRi', 'valorITBI', 'agencia', 'gerente',
      'clientePrincipal', 'clienteConjuge', 'cpfCliente', 'dataEntrega', 'observacoes'
    ];

    const numericFields = new Set([
      'valorContrato', 'entrada', 'financiamento', 'saldoReceber', 'valorDepositoRi', 'valorITBI'
    ]);

    fields.forEach(field => {
      const element = document.getElementById(`add-${field}`);
      if (element && element.value) {
        let value = element.value;
        
        // Converte valores numéricos quando aplicável
        if (numericFields.has(field)) {
          value = this.parseNumber(value);
        }
        
        data[field] = value;
      }
    });

    // Coleta compradores existentes
    const container = document.getElementById('add-compradores-container');
    if (container) {
      const compradores = [];
      const compradorItems = container.querySelectorAll('.comprador-item');
      
      compradorItems.forEach((item) => {
        const comprador = {};
        item.querySelectorAll('[data-field]').forEach((field) => {
          const fieldName = field.dataset.field;
          
          if (field.type === 'radio' || field.type === 'checkbox') {
            comprador[fieldName] = field.checked;
          } else {
            comprador[fieldName] = field.value ? field.value.trim() : '';
          }
        });
        
        // Só adiciona se tiver pelo menos o nome preenchido
        if (comprador.nome) {
          compradores.push(comprador);
        }
      });

      if (compradores.length > 0) {
        data.compradores = compradores;
      }
    }

    return data;
  }

  /**
   * Preenche formulário com dados
   */
  fillFormWithData(data, options = {}) {
    if (!data || typeof data !== 'object') {
      window.debug && window.debug(' Dados inválidos para preenchimento:', data);
      return {
        fieldsFilledCount: 0,
        compradoresAddedCount: 0
      };
    }

    window.debug && window.debug(' Preenchendo formulário com dados:', data);

    const fieldAliases = {
      dataAssinaturaCliente: 'dataAssinatura',
      workflowType: 'workflowId'
    };
    
    let fieldsFilledCount = 0;
    const decimalFields = new Set(['valorContrato', 'entrada', 'financiamento', 'saldoReceber', 'valorDepositoRi', 'valorITBI']);
    const fieldsToFill = Object.keys(data).filter(k => 
      !k.includes('_ai') && 
      !k.includes('metadata') && 
      k !== 'compradores'
    );

    // Preenche campos simples
    fieldsToFill.forEach(field => {
      const value = data[field];
      
      // Pula valores null, undefined ou vazios
      if (value === null || value === undefined || value === '') return;

      const targetField = fieldAliases[field] || field;
      const element = document.getElementById(`add-${targetField}`);
      if (!element) {
        window.debug && window.debug(` Campo não encontrado: add-${targetField}`);
        return;
      }

      // Se onlyEmpty = true, preenche apenas campos vazios
      if (options.onlyEmpty && element.value) {
        window.debug && window.debug(` Campo já preenchido, pulando: ${field}`);
        return;
      }

      // Formata valor baseado no tipo
      let formattedValue = value;
      
      if (typeof value === 'number') {
        formattedValue = decimalFields.has(targetField)
          ? value.toFixed(2)
          : String(value);
      } else if (value instanceof Date) {
        formattedValue = value.toISOString().split('T')[0];
      } else if (typeof value === 'string') {
        formattedValue = value;
      }

      element.value = formattedValue;
      fieldsFilledCount++;
      
      window.debug && window.debug(` Campo preenchido: ${targetField} = ${formattedValue}`);
      
      // Adiciona classe visual se for sugestão IA
      const aiSuggestedKey = `${field}_aiSuggested`;
      const aliasSuggestedKey = `${targetField}_aiSuggested`;
      if (data[aiSuggestedKey] || data[aliasSuggestedKey]) {
        element.classList.add('ai-suggested');
      }

      // Dispara evento change para validação e triggers
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });

    window.debug && window.debug(` Total de campos preenchidos: ${fieldsFilledCount}`);

    // Preenche compradores se presentes
    let compradoresAddedCount = 0;
    if (data.compradores && Array.isArray(data.compradores) && data.compradores.length > 0) {
      window.debug && window.debug(` Preenchendo ${data.compradores.length} comprador(es)`);
      compradoresAddedCount = this.fillCompradores(data.compradores, options);
    }

    return {
      fieldsFilledCount,
      compradoresAddedCount
    };
  }

  /**
   * Preenche compradores no formulário
   * @param {Array} compradores - Array de compradores
   * @param {object} options - Opções de preenchimento
   */
  fillCompradores(compradores, options = {}) {
    // Verifica se a função createCompradorFields está disponível
    if (typeof window.createCompradorFields !== 'function') {
      window.debug && window.debug(' createCompradorFields não disponível');
      console.error(' Função createCompradorFields não encontrada. Compradores não podem ser adicionados.');
      return 0;
    }

    const container = document.getElementById('add-compradores-container');
    if (!container) {
      window.debug && window.debug(' Container de compradores não encontrado');
      console.error(' Container add-compradores-container não encontrado');
      return 0;
    }

    window.debug && window.debug(` Container de compradores encontrado. Itens atuais: ${container.children.length}`);

    // Limpa compradores existentes apenas se não for modo onlyEmpty
    if (!options.onlyEmpty) {
      container.innerHTML = '';
      window.debug && window.debug(' Container limpo para novos compradores');
    }

    // Adiciona cada comprador
    let addedCount = 0;
    compradores.forEach((comprador, index) => {
      // Se onlyEmpty está ativo e já existem compradores, não sobrescreve
      const existingItems = container.querySelectorAll('.comprador-item');
      if (options.onlyEmpty && existingItems.length > index) {
        const existingItem = existingItems[index];
        const nomeInput = existingItem?.querySelector('input[data-field="nome"]');
        const cpfInput = existingItem?.querySelector('input[data-field="cpf"]');
        const emailInput = existingItem?.querySelector('input[data-field="email"]');
        const telefoneInput = existingItem?.querySelector('input[data-field="telefone"]');
        const radioInput = existingItem?.querySelector('input[data-field="principal"]');

        const existingHasContent = Boolean(
          nomeInput?.value?.trim()
          || cpfInput?.value?.trim()
          || emailInput?.value?.trim()
          || telefoneInput?.value?.trim()
        );

        if (existingHasContent) {
          window.debug && window.debug(` Comprador ${index + 1} já existe com conteúdo, pulando`);
          return;
        }

        if (nomeInput) nomeInput.value = comprador?.nome || '';
        if (cpfInput) cpfInput.value = comprador?.cpf || '';
        if (emailInput) emailInput.value = comprador?.email || '';
        if (telefoneInput) telefoneInput.value = comprador?.telefone || '';
        if (radioInput) radioInput.checked = Boolean(comprador?.principal);
        existingItem.classList.add('ai-suggested');
        setTimeout(() => {
          existingItem.classList.remove('ai-suggested');
        }, 3000);
        addedCount++;
        return;
      }

      try {
        // Cria o elemento do comprador usando a função global
        const compradorElement = window.createCompradorFields(comprador, index);
        
        if (!compradorElement) {
          window.debug && window.debug(` Elemento não criado para comprador ${index + 1}`);
          return;
        }

        // Adiciona ao container
        container.appendChild(compradorElement);
        window.debug && window.debug(` Comprador ${index + 1} adicionado: ${comprador.nome}`);
        addedCount++;

        // Adiciona classe de destaque visual
        compradorElement.classList.add('ai-suggested');
        
        // Remove destaque após 3 segundos
        setTimeout(() => {
          compradorElement.classList.remove('ai-suggested');
        }, 3000);

        // Configura eventos do comprador (remover, tornar principal, etc)
        this.setupCompradorEvents(compradorElement, index);

      } catch (error) {
        console.error(` Erro ao adicionar comprador ${index + 1}:`, error);
        window.debug && window.debug(` Erro ao adicionar comprador ${index + 1}: ${error.message}`);
      }
    });

    window.debug && window.debug(` ${compradores.length} comprador(es) adicionado(s) ao formulário`);
    return addedCount;
  }

  /**
   * Configura eventos para um elemento de comprador
   * @param {HTMLElement} element - Elemento do comprador
   * @param {number} index - Índice do comprador
   */
  setupCompradorEvents(element, index) {
    // Link de remover
    const removeLink = element.querySelector('.remove-comprador-link');
    if (removeLink) {
      removeLink.addEventListener('click', (e) => {
        e.preventDefault();
        element.remove();
        window.debug && window.debug(` Comprador ${index + 1} removido`);
      });
    }

    // Link de tornar principal
    const setPrincipalLink = element.querySelector('[data-action="set-principal"]');
    if (setPrincipalLink) {
      setPrincipalLink.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Remove principal de todos
        const container = document.getElementById('add-compradores-container');
        const allItems = container.querySelectorAll('.comprador-item');
        allItems.forEach(item => {
          const radio = item.querySelector('[data-field="principal"]');
          if (radio) radio.checked = false;
          
          // Atualiza visual
          const badge = item.querySelector('.principal-badge');
          if (badge) {
            badge.outerHTML = '<a href="#" class="comprador-action-link" data-action="set-principal">Tornar Principal</a>';
          }
        });

        // Define este como principal
        const radio = element.querySelector('[data-field="principal"]');
        if (radio) radio.checked = true;

        // Atualiza visual
        const actions = element.querySelector('.comprador-actions');
        const link = actions.querySelector('[data-action="set-principal"]');
        if (link) {
          link.outerHTML = '<span class="principal-badge">⭐ Principal</span>';
        }

        window.debug && window.debug(`⭐ Comprador ${index + 1} definido como principal`);
      });
    }
  }

  /**
   * Destaca campos preenchidos por IA
   */
  highlightAISuggestedFields(fields) {
    fields.forEach(field => {
      const element = document.getElementById(`add-${field}`);
      if (element) {
        element.classList.add('ai-suggested');
        
        // Remove destaque após 3 segundos
        setTimeout(() => {
          element.classList.remove('ai-suggested');
        }, 3000);
      }
    });
  }

  /**
   * Mostra sugestões da IA
   */
  showSuggestions(data, metadata) {
    const container = document.getElementById('ai-suggestions-container');
    const content = document.getElementById('ai-suggestions-content');
    
    if (!container || !content) return;

    const suggestions = [];
    
    // Gera texto de sugestões
    const buyerName = data.clientePrincipal || data.compradores?.[0]?.nome;
    if (buyerName) {
      suggestions.push(`<strong>Cliente:</strong> ${buyerName}`);
    }
    if (data.valorContrato) {
      suggestions.push(`<strong>Valor:</strong> R$ ${this.formatCurrency(data.valorContrato)}`);
    }
    if (metadata?.provider) {
      suggestions.push(`<em class="text-muted">Processado com: ${metadata.provider}</em>`);
    }

    if (suggestions.length > 0) {
      content.innerHTML = `<ul class="mb-0">${suggestions.map(s => `<li>${s}</li>`).join('')}</ul>`;
      container.classList.remove('d-none');
    }
  }

  /**
   * Mostra status do processamento
   */
  showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('ai-status');
    const statusText = document.getElementById('ai-status-text');
    
    if (!statusDiv || !statusText) return;

    statusDiv.className = `alert alert-${type}`;
    statusText.textContent = message;
    statusDiv.classList.remove('d-none');

    // Se for sucesso ou erro, oculta após 5 segundos
    if (type === 'success' || type === 'danger') {
      setTimeout(() => {
        statusDiv.classList.add('d-none');
      }, 5000);
    }
  }

  /**
   * Configura sugestões automáticas enquanto digita
   */
  setupAutoSuggestions() {
    // Sugestões inline foram desativadas neste modal.
    document
      .querySelectorAll('#add-contract-modal .ai-inline-suggestion')
      .forEach((node) => node.remove());
  }

  /**
   * Cleanup de event listeners (chamado quando modal é fechado)
   */
  cleanup() {
    if (this._inputHandlers) {
      this._inputHandlers.forEach((handler, element) => {
        element.removeEventListener('input', handler);
      });
      this._inputHandlers.clear();
    }
  }

  /**
   * Mostra sugestão inline
   */
  showInlineSuggestion(element, suggestion) {
    // Remove sugestão anterior se existir
    const existing = element.parentElement.querySelector('.ai-inline-suggestion');
    if (existing) existing.remove();

    // Cria elemento de sugestão
    const suggestionEl = document.createElement('div');
    suggestionEl.className = 'ai-inline-suggestion';
    suggestionEl.innerHTML = `
      <small class="text-primary">
        <i class="bi bi-robot"></i> 
        Sugestão: <strong>${suggestion}</strong>
        <button class="btn btn-sm btn-link p-0 ms-2" type="button">Aplicar</button>
      </small>
    `;

    suggestionEl.querySelector('button').addEventListener('click', () => {
      element.value = suggestion;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      suggestionEl.remove();
    });

    element.parentElement.appendChild(suggestionEl);

    // Remove após 10 segundos
    setTimeout(() => suggestionEl.remove(), 10000);
  }

  /**
   * Configura validação inteligente
   */
  setupIntelligentValidation() {
    const form = document.getElementById('contract-form');
    if (!form) return;

    // Intercepta submit para validar com IA
    form.addEventListener('submit', async (e) => {
      if (this.isProcessing) {
        e.preventDefault();
        return;
      }

      // Se já passou validação HTML5, valida com IA
      if (form.checkValidity()) {
        const shouldValidateWithAI = localStorage.getItem('ai_validate_before_submit') !== 'false';
        
        if (shouldValidateWithAI && !e.detail?.skipAIValidation) {
          e.preventDefault();
          await this.validateBeforeSubmit();
        }
      }
    });
  }

  /**
   * Valida com IA antes de submeter
   */
  async validateBeforeSubmit() {
    this.showStatus('Validando dados com IA...', 'info');

    try {
      const data = this.getFormData();
      const validation = await aiContractAssistant.validateContract(data);

      if (validation.valid) {
        this.showStatus(' Validação concluída!', 'success');
        
        // Submete o formulário após 1 segundo
        setTimeout(() => {
          this.submitFormProgrammatically();
        }, 1000);
      } else {
        // Mostra issues encontradas
        this.showValidationIssues(validation.issues);
      }

    } catch (error) {
      console.error('Erro na validação IA:', error);
      // Em caso de erro, mostra opção para continuar sem IA
      this.showAIValidationError();
    }
  }

  /**
   * Mostra erro de validação IA com opção de continuar
   */
  showAIValidationError() {
    const statusDiv = document.getElementById('ai-validation-status');
    if (!statusDiv) return;

    statusDiv.innerHTML = `
      <div class="alert alert-warning alert-dismissible fade show" role="alert">
        <i class="bi bi-exclamation-triangle-fill me-2"></i>
        <strong>Validação IA indisponível</strong>
        <p class="mb-2 mt-2">Não foi possível validar os dados com IA. Você pode:</p>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-sm btn-primary" id="continue-without-ai">
            <i class="bi bi-check-circle me-1"></i>
            Continuar sem IA
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="alert">
            <i class="bi bi-x-circle me-1"></i>
            Revisar dados
          </button>
        </div>
      </div>
    `;

    // Adicionar evento ao botão de continuar
    const continueBtn = document.getElementById('continue-without-ai');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        this.showStatus('Salvando processo...', 'info');
        setTimeout(() => {
          this.submitFormProgrammatically();
        }, 500);
      });
    }
  }

  /**
   * Submete formulário programaticamente
   */
  submitFormProgrammatically() {
    const form = document.getElementById('contract-form');
    if (!form) return;

    // Dispara evento de submit com flag para pular validação IA
    const event = new CustomEvent('submit', {
      bubbles: true,
      cancelable: true,
      detail: { skipAIValidation: true }
    });
    form.dispatchEvent(event);
  }

  /**
   * Mostra problemas de validação
   */
  showValidationIssues(issues) {
    const highIssues = issues.filter(i => i.severity === 'high');
    
    if (highIssues.length > 0) {
      this.showStatus(
        'Validação da IA encontrou inconsistências. Revise os campos obrigatórios antes de salvar.',
        'warning'
      );
    }
  }

  /**
   * Utilitários
   */
  parseNumber(value) {
    if (typeof value === 'number') return value;
    return parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
  }

  formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }
}

// Exporta instância singleton
const aiContractUI = new AIContractUI();
export default aiContractUI;

// Expõe globalmente
window.aiContractUI = aiContractUI;

// Auto-inicializa quando UI components são renderizados (apenas uma vez)
if (!window.__AI_CONTRACT_UI_LISTENER_ADDED__) {
  window.__AI_CONTRACT_UI_LISTENER_ADDED__ = true;

  if (window.__UI_COMPONENTS_RENDERED__) {
    aiContractUI.init();
  } else {
    window.addEventListener('ui:components:rendered', () => {
      aiContractUI.init();
    }, { once: true }); // Garante que o listener execute apenas uma vez
  }
}
