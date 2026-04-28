/**
 * @file AddAprovacaoModal.js
 * @description Modal para cadastro e edicao de aprovacoes com suporte a upload e preenchimento local
 */

import aprovacaoService from '../aprovacaoService.js';
import { auth } from '../auth.js';
import { uploadFile as uploadToStorage } from '../firestoreService.js';

// Tipos de documentos aceitos para analise de credito
const DOCUMENT_TYPES = {
  rg: { label: 'RG / CNH', icon: 'bi-person-badge', required: true },
  cpf: { label: 'CPF', icon: 'bi-card-text', required: true },
  comprovanteRenda: { label: 'Comprovante de Renda', icon: 'bi-cash-stack', required: true },
  comprovanteResidencia: { label: 'Comprovante de Residencia', icon: 'bi-house', required: false },
  certidaoCasamento: { label: 'Certidao de Casamento/Nascimento', icon: 'bi-heart', required: false },
  cartaTrabalho: { label: 'Carteira de Trabalho', icon: 'bi-briefcase', required: false },
  extratoBancario: { label: 'Extrato Bancario', icon: 'bi-bank', required: false },
  irpf: { label: 'Declaracao IRPF', icon: 'bi-file-earmark-text', required: false },
  outros: { label: 'Outros Documentos', icon: 'bi-file-earmark', required: false }
};

const APPROVAL_CHECKLIST_ITEMS = [
  { id: 'identificacaoProponentes', label: 'RG/CNH e CPF de todos os proponentes', produto: 'todos' },
  { id: 'comprovanteEstadoCivil', label: 'Certidão de estado civil atualizada', produto: 'todos' },
  { id: 'comprovanteResidenciaRecente', label: 'Comprovante de residência (até 90 dias)', produto: 'todos' },
  { id: 'enquadramentoMcmv', label: 'Enquadramento MCMV e comprovação de renda familiar', produto: 'MCMV' },
  { id: 'extratoFgtsMcmv', label: 'Extrato FGTS para composição de entrada/subsídio', produto: 'MCMV' },
  { id: 'declaracaoIrSbpe', label: 'Declaração IRPF e extratos bancários (SBPE)', produto: 'SBPE' },
  { id: 'simulacaoCapacidadeSbpe', label: 'Simulação de capacidade de pagamento (SBPE)', produto: 'SBPE' },
  { id: 'fichaCadastralSfi', label: 'Ficha cadastral e autorização de consulta (SFI)', produto: 'SFI' },
  { id: 'laudoAvaliacaoSfi', label: 'Laudo/avaliação do imóvel e documentos de garantia (SFI)', produto: 'SFI' }
];

/**
 * Modal de Adicionar/Editar Aprovacao
 */
export const AddAprovacaoModal = {
  id: 'add-aprovacao-modal',
  modalInstance: null,
  currentVendors: [],
  editingAprovacao: null,
  uploadedFiles: [],
  existingDocuments: [],
  aiValidationResults: [],
  aiFormResult: null,
  autofillSourceDocument: null,
  usedLocalAutofill: false,
  lookupSuggest: {
    activeType: null,
    items: [],
    highlightIndex: -1
  },

  /**
   * Renderiza o modal no DOM
   */
  render() {
    // Remove modal existente para garantir conteudo fresco
    const existing = document.getElementById(this.id);
    if (existing) {
      existing.remove();
    }

    const docTypesOptions = Object.entries(DOCUMENT_TYPES).map(([key, val]) =>
      `<option value="${key}">${val.required ? '* ' : ''}${val.label}</option>`
    ).join('');

    const docChecklistItems = Object.entries(DOCUMENT_TYPES).map(([key, val]) => `
      <div class="col-md-6">
        <div class="form-check">
          <input class="form-check-input doc-check" type="checkbox" id="check-${key}" data-doc="${key}">
          <label class="form-check-label ${val.required ? 'fw-bold' : ''}" for="check-${key}">
            <i class="bi ${val.icon} me-1"></i>${val.label}
            ${val.required ? '<span class="text-danger">*</span>' : ''}
          </label>
        </div>
      </div>
    `).join('');

    const approvalChecklistItems = APPROVAL_CHECKLIST_ITEMS.map((item) => `
      <div class="col-md-6">
        <div class="form-check border rounded p-2 h-100">
          <input class="form-check-input approval-checklist-check" type="checkbox" id="approval-check-${item.id}" data-checklist-id="${item.id}" data-produto="${item.produto}">
          <label class="form-check-label" for="approval-check-${item.id}">
            ${item.label}
            <span class="badge bg-light text-dark border ms-1">${item.produto}</span>
            <span class="text-danger">*</span>
          </label>
        </div>
      </div>
    `).join('');

    const html = `
      <div class="modal fade" id="${this.id}" tabindex="-1" aria-labelledby="add-aprovacao-title" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header bg-primary text-white">
              <h5 class="modal-title" id="add-aprovacao-title">
                <i class="bi bi-plus-circle me-2"></i>
                <span id="add-aprovacao-title-text">Nova Analise de Aprovacao</span>
              </h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
              <!-- Assistente de preenchimento automatico local -->
              <div class="card border-primary shadow-sm mb-3" id="aprovacao-ai-section">
                <div class="card-header bg-primary text-white">
                  <h6 class="mb-0 d-flex align-items-center justify-content-between">
                    <span>
                      <i class="bi bi-lightning-charge me-2"></i>
                      Preenchimento Automatico
                    </span>
                    <span class="badge bg-light text-primary">Sem IA</span>
                  </h6>
                </div>
                <div class="card-body">
                  <div class="row g-3">
                    <div class="col-12">
                      <label class="form-label fw-bold">
                        <i class="bi bi-file-earmark-pdf me-1"></i>
                        Formulario de Aprovacao
                      </label>
                      <div class="d-grid gap-2">
                        <input
                          type="file"
                          class="form-control"
                          id="aprovacao-ai-document-upload"
                          accept=".pdf,.jpg,.jpeg,.png"
                        />
                        <button
                          class="btn btn-primary w-100"
                          type="button"
                          id="aprovacao-local-process-document-btn"
                          disabled
                        >
                          <i class="bi bi-lightning"></i> Preencher
                        </button>
                      </div>
                    </div>
                    <div class="col-12">
                      <div id="aprovacao-ai-status" class="alert alert-info d-none" role="alert"></div>
                      <div id="aprovacao-ai-validation-status"></div>
                    </div>

                    <!-- Estado inicial -->
                    <div class="col-12" id="ai-validation-empty">
                      <div class="text-center py-3">
                        <i class="bi bi-lightning-charge display-6 text-muted"></i>
                        <p class="mt-2 text-muted mb-0">Envie o formulario para preencher automaticamente.</p>
                      </div>
                    </div>

                    <!-- Processando -->
                    <div class="col-12 d-none" id="ai-validation-loading">
                      <div class="text-center py-3">
                        <div class="spinner-border text-primary" role="status">
                          <span class="visually-hidden">Processando...</span>
                        </div>
                        <p class="mt-2" id="ai-processing-context-label">Processando documento...</p>
                        <div class="progress mt-2" style="height: 20px;">
                          <div class="progress-bar progress-bar-striped progress-bar-animated" id="ai-progress-bar" style="width: 0%">0%</div>
                        </div>
                      </div>
                    </div>

                    <!-- Resultados -->
                    <div class="col-12 d-none" id="ai-validation-results">
                      <div class="alert mb-0" id="ai-validation-summary"></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Tabs de navegacao -->
              <ul class="nav nav-tabs mb-3" id="aprovacao-form-tabs" role="tablist">
                <li class="nav-item" role="presentation">
                  <button class="nav-link active" id="tab-dados" data-bs-toggle="tab" data-bs-target="#pane-dados" type="button" role="tab">
                    <i class="bi bi-person me-1"></i>Dados
                  </button>
                </li>
                <li class="nav-item" role="presentation">
                  <button class="nav-link" id="tab-documentos" data-bs-toggle="tab" data-bs-target="#pane-documentos" type="button" role="tab">
                    <i class="bi bi-file-earmark-arrow-up me-1"></i>Documentos
                    <span class="badge bg-secondary ms-1" id="docs-count-badge">0</span>
                  </button>
                </li>
                <li class="nav-item" role="presentation">
                  <button class="nav-link" id="tab-checklist" data-bs-toggle="tab" data-bs-target="#pane-checklist" type="button" role="tab">
                    <i class="bi bi-list-check me-1"></i>Checklist
                  </button>
                </li>
              </ul>

              <div class="tab-content" id="aprovacao-form-content">
                <!-- Tab: Dados -->
                <div class="tab-pane fade show active" id="pane-dados" role="tabpanel">
                  <form id="add-aprovacao-form" novalidate>
                    <!-- Dados do Cliente -->
                    <div class="card mb-3 aprovacao-lookup-card">
                      <div class="card-header bg-light">
                        <i class="bi bi-person me-2"></i>Dados do Cliente
                      </div>
                      <div class="card-body">
                        <div class="row g-3">
                          <div class="col-md-6">
                            <label for="aprovacao-cpf" class="form-label">CPF(s) <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="aprovacao-cpf" required
                              placeholder="000.000.000-00 (separe multiplos por /)">
                            <div class="form-text">Para multiplos CPFs, separe por / ou |</div>
                          </div>
                          <div class="col-md-6">
                            <label for="aprovacao-cliente" class="form-label">Nome do Cliente <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="aprovacao-cliente" required
                              placeholder="Nome completo (separe multiplos por /)">
                          </div>
                          <div class="col-lg-4 col-md-6">
                            <label for="aprovacao-data-entrada" class="form-label">Data de Entrada <span class="text-danger">*</span></label>
                            <input type="date" class="form-control" id="aprovacao-data-entrada" required>
                          </div>
                          <div class="col-lg-4 col-md-6">
                            <label for="aprovacao-data-aprovacao" class="form-label">Data de Aprovacao</label>
                            <input type="date" class="form-control" id="aprovacao-data-aprovacao">
                          </div>
                          <div class="col-lg-4 col-md-6">
                            <label for="aprovacao-venc-sicaq" class="form-label">Vencimento SICAQ</label>
                            <input type="date" class="form-control" id="aprovacao-venc-sicaq">
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Empreendimento -->
                    <div class="card mb-3">
                      <div class="card-header bg-light">
                        <i class="bi bi-building me-2"></i>Empreendimento
                      </div>
                      <div class="card-body">
                        <div class="row g-3">
                          <div class="col-md-6">
                            <div class="inline-suggest-wrapper">
                              <label for="aprovacao-construtora" class="form-label">Construtora <span class="text-danger">*</span></label>
                              <input
                                type="text"
                                class="form-control"
                                id="aprovacao-construtora"
                                placeholder="Digite ou selecione a construtora"
                                autocomplete="off"
                                required
                              >
                              <div class="invalid-feedback">Selecione uma construtora cadastrada em Configurações &gt; Construtoras & Empreendimentos.</div>
                              <div class="suggestions-panel" id="suggestions-aprovacao-construtoras" data-source="vendors" hidden>
                                <ul class="suggestions-list" id="suggestions-aprovacao-construtoras-list"></ul>
                              </div>
                            </div>
                          </div>
                          <div class="col-md-6">
                            <div class="inline-suggest-wrapper">
                              <label for="aprovacao-empreendimento" class="form-label">Empreendimento <span class="text-danger">*</span></label>
                              <input
                                type="text"
                                class="form-control"
                                id="aprovacao-empreendimento"
                                placeholder="Selecione a construtora primeiro"
                                autocomplete="off"
                                required
                              >
                              <div class="invalid-feedback">Selecione um empreendimento da construtora informada.</div>
                              <div class="suggestions-panel" id="suggestions-aprovacao-empreendimentos" data-source="empreendimentos" hidden>
                                <ul class="suggestions-list" id="suggestions-aprovacao-empreendimentos-list"></ul>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Participantes -->
                    <div class="card mb-3">
                      <div class="card-header bg-light">
                        <i class="bi bi-people me-2"></i>Participantes
                      </div>
                      <div class="card-body">
                        <div class="row g-3">
                          <div class="col-md-6">
                            <label for="aprovacao-corretor" class="form-label">Corretor</label>
                            <input type="text" class="form-control" id="aprovacao-corretor" placeholder="Nome do corretor">
                          </div>
                          <div class="col-md-6">
                            <label for="aprovacao-gerente" class="form-label">Gerente / Imobiliaria</label>
                            <input type="text" class="form-control" id="aprovacao-gerente" placeholder="Nome do gerente ou imobiliaria">
                          </div>
                          <div class="col-md-6">
                            <label for="aprovacao-analista" class="form-label">
                              <i class="bi bi-lock me-1"></i>Analista Aprovacao
                            </label>
                            <input type="text" class="form-control" id="aprovacao-analista" placeholder="Email ou nome do analista" readonly>
                            <small class="text-muted d-block mt-1">
                              <i class="bi bi-info-circle me-1"></i>Campo preenchido automaticamente. Não é editável.
                            </small>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Resultado -->
                    <div class="card mb-3">
                      <div class="card-header bg-light">
                        <i class="bi bi-clipboard-check me-2"></i>Resultado da Analise
                      </div>
                      <div class="card-body">
                        <div class="row g-3">
                          <div class="col-md-6">
                            <label for="aprovacao-situacao" class="form-label">Situacao <span class="text-danger">*</span></label>
                            <select class="form-select" id="aprovacao-situacao" required>
                              <option value="">Selecione...</option>
                              <option value="APROVADO">Aprovado</option>
                              <option value="REPROVADO">Reprovado</option>
                              <option value="CONDICIONADO">Condicionado</option>
                            </select>
                          </div>
                          <div class="col-12">
                            <label for="aprovacao-pendencia" class="form-label">Pendencia / Observacoes</label>
                            <textarea class="form-control" id="aprovacao-pendencia" rows="3"
                              placeholder="Descreva pendencias, documentos necessarios ou motivo da reprovacao..."></textarea>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Financiamento -->
                    <div class="card mb-3">
                      <div class="card-header bg-light">
                        <i class="bi bi-cash-stack me-2"></i>Dados do Financiamento
                      </div>
                      <div class="card-body">
                        <div class="row g-3">
                          <div class="col-md-4">
                            <label for="aprovacao-renda" class="form-label">Renda</label>
                            <div class="input-group">
                              <span class="input-group-text">R$</span>
                              <input type="text" class="form-control" id="aprovacao-renda" placeholder="0,00">
                            </div>
                          </div>
                          <div class="col-md-4">
                            <label for="aprovacao-carta" class="form-label">Carta de Financiamento</label>
                            <select class="form-select" id="aprovacao-carta">
                              <option value="MCMV">MCMV</option>
                              <option value="SBPE">SBPE</option>
                              <option value="SFI">SFI</option>
                            </select>
                          </div>
                          <div class="col-md-4">
                            <label for="aprovacao-valor" class="form-label">Valor Financiamento</label>
                            <div class="input-group">
                              <span class="input-group-text">R$</span>
                              <input type="text" class="form-control" id="aprovacao-valor" placeholder="0,00">
                            </div>
                          </div>
                          <div class="col-md-4">
                            <label for="aprovacao-prazo" class="form-label">Prazo (meses)</label>
                            <input type="number" class="form-control" id="aprovacao-prazo" placeholder="420" min="0" max="420">
                          </div>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>

                <!-- Tab: Documentos -->
                <div class="tab-pane fade" id="pane-documentos" role="tabpanel">
                  <div class="card mb-3">
                    <div class="card-header bg-light d-flex justify-content-between align-items-center">
                      <span><i class="bi bi-cloud-upload me-2"></i>Upload de Documentos</span>
                      <span class="badge bg-info">Formatos: PDF, JPG, PNG (max 10MB)</span>
                    </div>
                    <div class="card-body">
                      <!-- Area de drag and drop -->
                      <div class="upload-drop-zone border border-2 border-dashed rounded p-4 text-center mb-3" id="upload-drop-zone">
                        <i class="bi bi-cloud-arrow-up display-4 text-muted"></i>
                        <p class="mb-2 mt-2">Arraste arquivos aqui ou</p>
                        <label for="file-upload-input" class="btn btn-primary">
                          <i class="bi bi-folder2-open me-1"></i>Selecionar Arquivos
                        </label>
                        <input type="file" id="file-upload-input" multiple accept=".pdf,.jpg,.jpeg,.png" class="d-none">
                      </div>

                      <!-- Tipo de documento padrao para novos uploads -->
                      <div class="row mb-3">
                        <div class="col-md-12">
                          <label class="form-label">
                            <i class="bi bi-tag me-1"></i>Tipo padrao para novos arquivos
                          </label>
                          <select class="form-select" id="upload-doc-type">
                            ${docTypesOptions}
                          </select>
                          <small class="text-muted">Voce pode alterar o tipo individualmente apos adicionar os arquivos.</small>
                        </div>
                      </div>

                      <!-- Lista de arquivos enviados -->
                      <div id="uploaded-files-list">
                        <p class="text-muted text-center" id="no-files-msg">Nenhum arquivo selecionado</p>
                      </div>
                    </div>
                  </div>

                  <!-- Checklist de documentos -->
                  <div class="card">
                    <div class="card-header bg-light">
                      <i class="bi bi-list-check me-2"></i>Checklist de Documentos
                    </div>
                    <div class="card-body">
                      <div class="row g-2" id="docs-checklist">
                        ${docChecklistItems}
                      </div>
                    </div>
                  </div>

                </div>

                <div class="tab-pane fade" id="pane-checklist" role="tabpanel">
                  <div class="alert alert-warning d-flex align-items-center mb-3" role="alert">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Marcacao opcional para apoio na triagem. Itens aplicados por modalidade (MCMV, SBPE ou SFI).
                  </div>
                  <div class="card">
                    <div class="card-header bg-light">
                      <i class="bi bi-clipboard2-check me-2"></i>Checklist de Aprovação de Crédito (CEF)
                    </div>
                    <div class="card-body">
                      <div class="row g-2" id="approval-checklist">
                        ${approvalChecklistItems}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                <i class="bi bi-x-lg me-1"></i>Cancelar
              </button>
              <button type="button" class="btn btn-primary" id="add-aprovacao-submit">
                <i class="bi bi-check-lg me-1"></i>
                <span id="add-aprovacao-submit-text">Salvar</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    // Configura eventos
    this.setupEvents();

    return document.getElementById(this.id);
  },

  /**
   * Configura eventos do modal
   */
  setupEvents() {
    const self = this;

    // Submit
    document.getElementById('add-aprovacao-submit')?.addEventListener('click', () => self.handleSubmit());

    // Suggestions-list para construtora/empreendimento
    self.bindLookupEvents();
    self.refreshLookupFields();

    // Mascara de valores monetarios
    ['aprovacao-renda', 'aprovacao-valor'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', (e) => {
        e.target.value = self.formatCurrencyInput(e.target.value);
      });
    });

    // Enter para submeter (exceto textarea)
    document.getElementById('add-aprovacao-form')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        self.handleSubmit();
      }
    });

    // Upload de arquivos
    document.getElementById('file-upload-input')?.addEventListener('change', (e) => {
      self.handleFileSelection(e.target.files);
    });

    // Upload de formulario para preenchimento local
    const aiFileInput = document.getElementById('aprovacao-ai-document-upload');
    const localProcessBtn = document.getElementById('aprovacao-local-process-document-btn');

    if (aiFileInput) {
      aiFileInput.addEventListener('change', (e) => {
        const hasFile = e.target.files && e.target.files.length > 0;
        self.aiFormResult = null;
        self.autofillSourceDocument = null;
        self.usedLocalAutofill = false;
        self.clearAIValidationStatus();
        self.updateUIState();
        if (localProcessBtn) localProcessBtn.disabled = !hasFile;
      });
    }

    if (localProcessBtn) {
      localProcessBtn.addEventListener('click', () => self.processAprovacaoDocumentLocal());
    }

    // Drag and drop
    const dropZone = document.getElementById('upload-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-primary', 'bg-light');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-primary', 'bg-light');
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-primary', 'bg-light');
        self.handleFileSelection(e.dataTransfer.files);
      });
    }

    // Reset scroll ao trocar de tab
    const tabEls = document.querySelectorAll('#aprovacao-form-tabs button[data-bs-toggle="tab"]');
    tabEls.forEach(tab => {
      tab.addEventListener('shown.bs.tab', () => {
        const modalBody = document.querySelector(`#${self.id} .modal-body`);
        if (modalBody) modalBody.scrollTop = 0;
      });
    });

    // Funcoes globais para botoes inline
    window.removeAprovacaoFile = (index) => self.removeFile(index);
    window.removeAprovacaoExistingFile = (index) => self.removeExistingFile(index);
    window.showAprovacaoAIResult = (index) => self.showAIResult(index);
  },

  normalizeLookupValue(value) {
    return typeof value === 'string' ? value.trim() : '';
  },

  normalizeLookupKey(value) {
    return this.normalizeLookupValue(value).toLowerCase();
  },

  getLookupRefs() {
    return {
      construtoraInput: document.getElementById('aprovacao-construtora'),
      empreendimentoInput: document.getElementById('aprovacao-empreendimento'),
      construtoraPanel: document.getElementById('suggestions-aprovacao-construtoras'),
      construtoraList: document.getElementById('suggestions-aprovacao-construtoras-list'),
      empreendimentoPanel: document.getElementById('suggestions-aprovacao-empreendimentos'),
      empreendimentoList: document.getElementById('suggestions-aprovacao-empreendimentos-list')
    };
  },

  getSortedActiveVendors() {
    return (this.currentVendors || [])
      .filter(vendor => vendor?.active !== false && this.normalizeLookupValue(vendor?.name))
      .slice()
      .sort((a, b) => this.normalizeLookupValue(a?.name).localeCompare(this.normalizeLookupValue(b?.name), 'pt-BR', { sensitivity: 'base' }));
  },

  findVendorByName(rawName) {
    const target = this.normalizeLookupKey(rawName);
    if (!target) return null;
    return this.getSortedActiveVendors().find(
      (vendor) => this.normalizeLookupKey(vendor?.name) === target
    ) || null;
  },

  isActiveVendorName(rawName) {
    const vendor = this.findVendorByName(rawName);
    return Boolean(vendor && vendor.active !== false);
  },

  getEmpreendimentoNamesByVendor(rawVendorName) {
    const vendor = this.findVendorByName(rawVendorName);
    if (!vendor || !Array.isArray(vendor.empreendimentos)) return [];

    return vendor.empreendimentos
      .map((emp) => this.normalizeLookupValue(emp?.nome || emp?.name))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  },

  isEmpreendimentoFromVendor(rawVendorName, rawEmpreendimento) {
    const target = this.normalizeLookupKey(rawEmpreendimento);
    if (!target) return false;
    return this.getEmpreendimentoNamesByVendor(rawVendorName)
      .some((name) => this.normalizeLookupKey(name) === target);
  },

  renderLookupSuggestions(listEl, items, emptyText) {
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!Array.isArray(items) || items.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = emptyText;
      listEl.appendChild(empty);
      return;
    }

    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'sg-item';
      li.dataset.index = String(index);
      if (index === this.lookupSuggest.highlightIndex) {
        li.classList.add('active');
      }
      li.textContent = item;
      listEl.appendChild(li);
    });
  },

  showLookupSuggestions(type) {
    const refs = this.getLookupRefs();
    const isConstrutora = type === 'construtora';
    const input = isConstrutora ? refs.construtoraInput : refs.empreendimentoInput;
    const panel = isConstrutora ? refs.construtoraPanel : refs.empreendimentoPanel;
    const list = isConstrutora ? refs.construtoraList : refs.empreendimentoList;
    if (!input || !panel || !list) return;

    const query = this.normalizeLookupKey(input.value);
    let items = [];
    let emptyText = 'Sem resultados';

    if (isConstrutora) {
      items = this.getSortedActiveVendors().map((vendor) => this.normalizeLookupValue(vendor.name));
      emptyText = 'Sem construtoras cadastradas';
    } else {
      const vendorName = this.normalizeLookupValue(refs.construtoraInput?.value);
      if (!vendorName) {
        items = [];
        emptyText = 'Selecione a construtora primeiro';
      } else {
        items = this.getEmpreendimentoNamesByVendor(vendorName);
        emptyText = 'Sem empreendimentos cadastrados para esta construtora';
      }
    }

    if (query) {
      items = items.filter((item) => this.normalizeLookupKey(item).includes(query));
    }

    this.lookupSuggest.activeType = type;
    this.lookupSuggest.items = items;
    this.lookupSuggest.highlightIndex = -1;

    this.renderLookupSuggestions(list, items, emptyText);
    panel.hidden = false;
  },

  hideLookupSuggestions(type = null) {
    const refs = this.getLookupRefs();
    const panels = {
      construtora: refs.construtoraPanel,
      empreendimento: refs.empreendimentoPanel
    };

    if (type && panels[type]) {
      panels[type].hidden = true;
    } else {
      Object.values(panels).forEach((panel) => {
        if (panel) panel.hidden = true;
      });
      this.lookupSuggest.activeType = null;
      this.lookupSuggest.items = [];
      this.lookupSuggest.highlightIndex = -1;
    }
  },

  updateLookupHighlight(listEl) {
    if (!listEl) return;
    const items = Array.from(listEl.querySelectorAll('.sg-item'));
    items.forEach((item, index) => {
      item.classList.toggle('active', index === this.lookupSuggest.highlightIndex);
    });

    const highlighted = items[this.lookupSuggest.highlightIndex];
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  },

  selectLookupSuggestion(type, value) {
    const refs = this.getLookupRefs();
    const normalizedValue = this.normalizeLookupValue(value);

    if (type === 'construtora') {
      if (!refs.construtoraInput) return;
      const previousVendor = this.normalizeLookupValue(refs.construtoraInput.value);
      refs.construtoraInput.value = normalizedValue;
      refs.construtoraInput.dataset.userModified = 'true';
      this.validateConstrutoraSelection();

      const vendorChanged = this.normalizeLookupKey(previousVendor) !== this.normalizeLookupKey(normalizedValue);
      if (vendorChanged && refs.empreendimentoInput) {
        refs.empreendimentoInput.value = '';
        refs.empreendimentoInput.dataset.userModified = 'true';
      }

      this.updateEmpreendimentos(normalizedValue, refs.empreendimentoInput?.value || '', false);
      this.validateEmpreendimentoSelection();
      this.hideLookupSuggestions();
      refs.empreendimentoInput?.focus();
      return;
    }

    if (!refs.empreendimentoInput) return;
    refs.empreendimentoInput.value = normalizedValue;
    refs.empreendimentoInput.dataset.userModified = 'true';
    this.validateEmpreendimentoSelection();
    this.hideLookupSuggestions();
  },

  handleLookupKeyNavigation(event, type) {
    if (this.lookupSuggest.activeType !== type) return;

    const refs = this.getLookupRefs();
    const listEl = type === 'construtora' ? refs.construtoraList : refs.empreendimentoList;
    const items = this.lookupSuggest.items || [];

    if (!items.length) {
      if (event.key === 'Escape' || event.key === 'Tab') {
        this.hideLookupSuggestions();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.lookupSuggest.highlightIndex = (this.lookupSuggest.highlightIndex + 1) % items.length;
      this.updateLookupHighlight(listEl);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.lookupSuggest.highlightIndex = (this.lookupSuggest.highlightIndex - 1 + items.length) % items.length;
      this.updateLookupHighlight(listEl);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.lookupSuggest.highlightIndex < 0 || this.lookupSuggest.highlightIndex >= items.length) return;
      this.selectLookupSuggestion(type, items[this.lookupSuggest.highlightIndex]);
      return;
    }

    if (event.key === 'Escape' || event.key === 'Tab') {
      this.hideLookupSuggestions();
    }
  },

  bindLookupEvents() {
    const refs = this.getLookupRefs();
    const { construtoraInput, empreendimentoInput, construtoraList, empreendimentoList } = refs;
    if (!construtoraInput || !empreendimentoInput) return;

    if (!construtoraInput.__lookupBound) {
      construtoraInput.addEventListener('input', (event) => {
        if (event.isTrusted) {
          construtoraInput.dataset.userModified = 'true';
          empreendimentoInput.value = '';
          empreendimentoInput.dataset.userModified = 'true';
          this.updateEmpreendimentos(construtoraInput.value, '', false);
        } else {
          this.updateEmpreendimentos(construtoraInput.value, empreendimentoInput.value, Boolean(this.editingAprovacao));
        }
        this.validateConstrutoraSelection();
        this.validateEmpreendimentoSelection();
        this.showLookupSuggestions('construtora');
      });

      construtoraInput.addEventListener('focus', () => this.showLookupSuggestions('construtora'));
      construtoraInput.addEventListener('change', (event) => {
        if (event.isTrusted) {
          construtoraInput.dataset.userModified = 'true';
        }
        this.validateConstrutoraSelection();
        this.validateEmpreendimentoSelection();
        this.hideLookupSuggestions('construtora');
      });
      construtoraInput.addEventListener('keydown', (event) => this.handleLookupKeyNavigation(event, 'construtora'));
      construtoraInput.__lookupBound = true;
    }

    if (!empreendimentoInput.__lookupBound) {
      empreendimentoInput.addEventListener('input', (event) => {
        if (event.isTrusted) {
          empreendimentoInput.dataset.userModified = 'true';
        }
        this.validateEmpreendimentoSelection();
        this.showLookupSuggestions('empreendimento');
      });
      empreendimentoInput.addEventListener('focus', () => this.showLookupSuggestions('empreendimento'));
      empreendimentoInput.addEventListener('change', (event) => {
        if (event.isTrusted) {
          empreendimentoInput.dataset.userModified = 'true';
        }
        this.validateEmpreendimentoSelection();
        this.hideLookupSuggestions('empreendimento');
      });
      empreendimentoInput.addEventListener('keydown', (event) => this.handleLookupKeyNavigation(event, 'empreendimento'));
      empreendimentoInput.__lookupBound = true;
    }

    if (construtoraList && !construtoraList.__lookupBound) {
      construtoraList.addEventListener('click', (event) => {
        const itemEl = event.target.closest('.sg-item');
        if (!itemEl) return;
        const index = Number(itemEl.dataset.index);
        if (!Number.isInteger(index) || index < 0 || index >= this.lookupSuggest.items.length) return;
        this.selectLookupSuggestion('construtora', this.lookupSuggest.items[index]);
      });
      construtoraList.__lookupBound = true;
    }

    if (empreendimentoList && !empreendimentoList.__lookupBound) {
      empreendimentoList.addEventListener('click', (event) => {
        const itemEl = event.target.closest('.sg-item');
        if (!itemEl) return;
        const index = Number(itemEl.dataset.index);
        if (!Number.isInteger(index) || index < 0 || index >= this.lookupSuggest.items.length) return;
        this.selectLookupSuggestion('empreendimento', this.lookupSuggest.items[index]);
      });
      empreendimentoList.__lookupBound = true;
    }

    if (!document.__aprovacaoLookupGlobalBound) {
      document.addEventListener('click', (event) => {
        if (!event.target.closest('#add-aprovacao-modal .inline-suggest-wrapper')) {
          this.hideLookupSuggestions();
        }
      });
      document.__aprovacaoLookupGlobalBound = true;
    }
  },

  refreshLookupFields() {
    const refs = this.getLookupRefs();
    if (!refs.construtoraInput || !refs.empreendimentoInput) return;

    this.updateEmpreendimentos(
      refs.construtoraInput.value,
      refs.empreendimentoInput.value,
      Boolean(this.editingAprovacao)
    );
    this.validateConstrutoraSelection();
    this.validateEmpreendimentoSelection();
  },

  validateConstrutoraSelection(options = {}) {
    const { allowUnchangedLegacyEdit = true } = options;
    const construtoraInput = document.getElementById('aprovacao-construtora');
    if (!construtoraInput) return true;

    const selectedValue = this.normalizeLookupValue(construtoraInput.value);
    const originalValue = this.normalizeLookupValue(this.editingAprovacao?.construtora || '');
    const isEditing = Boolean(this.editingAprovacao);

    const unchangedLegacyEdit = allowUnchangedLegacyEdit
      && isEditing
      && this.normalizeLookupKey(selectedValue) === this.normalizeLookupKey(originalValue);

    const isFromCatalog = this.isActiveVendorName(selectedValue);
    const isValid = Boolean(selectedValue) && (isFromCatalog || unchangedLegacyEdit);

    const message = isValid
      ? ''
      : 'Selecione uma construtora cadastrada em Configurações > Construtoras & Empreendimentos.';
    construtoraInput.setCustomValidity(message);
    construtoraInput.classList.toggle('is-invalid', Boolean(message));

    return isValid;
  },

  validateEmpreendimentoSelection(options = {}) {
    const { allowUnchangedLegacyEdit = true } = options;
    const construtoraInput = document.getElementById('aprovacao-construtora');
    const empreendimentoInput = document.getElementById('aprovacao-empreendimento');
    if (!construtoraInput || !empreendimentoInput) return true;

    const selectedConstrutora = this.normalizeLookupValue(construtoraInput.value);
    const selectedEmpreendimento = this.normalizeLookupValue(empreendimentoInput.value);
    const originalConstrutora = this.normalizeLookupValue(this.editingAprovacao?.construtora || '');
    const originalEmpreendimento = this.normalizeLookupValue(this.editingAprovacao?.empreendimento || '');
    const isEditing = Boolean(this.editingAprovacao);

    const unchangedLegacyEdit = allowUnchangedLegacyEdit
      && isEditing
      && this.normalizeLookupKey(selectedConstrutora) === this.normalizeLookupKey(originalConstrutora)
      && this.normalizeLookupKey(selectedEmpreendimento) === this.normalizeLookupKey(originalEmpreendimento)
      && Boolean(selectedEmpreendimento);

    const construtoraCatalogada = this.isActiveVendorName(selectedConstrutora);
    const empreendimentoCatalogado = construtoraCatalogada
      ? this.isEmpreendimentoFromVendor(selectedConstrutora, selectedEmpreendimento)
      : false;

    let message = '';
    if (!selectedEmpreendimento) {
      message = 'Selecione um empreendimento da construtora informada.';
    } else if (empreendimentoCatalogado || unchangedLegacyEdit) {
      message = '';
    } else if (!selectedConstrutora) {
      message = 'Selecione a construtora antes de informar o empreendimento.';
    } else if (!construtoraCatalogada) {
      message = 'Selecione uma construtora cadastrada antes de definir o empreendimento.';
    } else {
      message = 'Selecione um empreendimento vinculado à construtora informada.';
    }

    empreendimentoInput.setCustomValidity(message);
    empreendimentoInput.classList.toggle('is-invalid', Boolean(message));

    return !message;
  },

  populateConstrutorasSelect(selectedValue = '', allowLegacy = false) {
    const construtoraInput = document.getElementById('aprovacao-construtora');
    if (!construtoraInput) return '';

    const normalizedSelected = this.normalizeLookupValue(selectedValue);
    if (!normalizedSelected) {
      construtoraInput.value = '';
      return '';
    }

    const matchedVendor = this.getSortedActiveVendors().find(
      (vendor) => this.normalizeLookupKey(vendor?.name) === this.normalizeLookupKey(normalizedSelected)
    );

    if (matchedVendor) {
      construtoraInput.value = this.normalizeLookupValue(matchedVendor.name);
      return construtoraInput.value;
    }

    construtoraInput.value = allowLegacy ? normalizedSelected : '';
    return construtoraInput.value;
  },

  open(vendors = [], aprovacao = null) {
    this.currentVendors = Array.isArray(vendors) ? vendors : [];
    this.editingAprovacao = aprovacao;
    this.uploadedFiles = [];
    this.existingDocuments = [];
    this.aiValidationResults = [];
    this.aiFormResult = null;
    this.autofillSourceDocument = null;
    this.usedLocalAutofill = false;

    // Renderiza modal (remove e recria para garantir estado limpo)
    const modalEl = this.render();

    // Preenche campos de construtora e empreendimento
    const selectedConstrutora = this.populateConstrutorasSelect(
      aprovacao?.construtora || '',
      Boolean(aprovacao?.construtora)
    );
    this.updateEmpreendimentos(
      selectedConstrutora,
      aprovacao?.empreendimento || '',
      Boolean(aprovacao?.empreendimento)
    );

    // Atualiza titulo
    const titleEl = document.getElementById('add-aprovacao-title-text');
    if (titleEl) {
      titleEl.textContent = aprovacao ? 'Editar Analise de Aprovacao' : 'Nova Analise de Aprovacao';
    }

    // Preenche formulario se for edicao
    if (aprovacao) {
      this.fillFormForEdit(aprovacao);
    } else {
      // Define data de entrada como hoje
      const dataEntrada = document.getElementById('aprovacao-data-entrada');
      if (dataEntrada) {
        dataEntrada.value = this.getTodayDateInputValue();
      }
      // Preenche analista com usuario logado
      const analista = document.getElementById('aprovacao-analista');
      if (analista) {
        analista.value = auth.currentUser?.email || '';
      }
    }

    this.refreshLookupFields();
    const lookupRefs = this.getLookupRefs();
    if (lookupRefs.construtoraInput) {
      delete lookupRefs.construtoraInput.dataset.userModified;
    }
    if (lookupRefs.empreendimentoInput) {
      delete lookupRefs.empreendimentoInput.dataset.userModified;
    }

    // Abre modal
    if (modalEl) {
      this.modalInstance = new bootstrap.Modal(modalEl);
      this.modalInstance.show();
    }
  },

  /**
   * Fecha o modal
   */
  close() {
    const el = document.getElementById(this.id);
    if (el) {
      const modalInstance = bootstrap.Modal.getInstance(el);
      if (modalInstance) {
        modalInstance.hide();
      }
    }
    this.editingAprovacao = null;
    this.uploadedFiles = [];
    this.aiValidationResults = [];
    this.aiFormResult = null;
    this.autofillSourceDocument = null;
    this.usedLocalAutofill = false;
    this.hideLookupSuggestions();
  },

  /**
   * Reseta formulario
   */
  resetForm() {
    const form = document.getElementById('add-aprovacao-form');
    if (form) {
      form.reset();
      form.classList.remove('was-validated');
    }

    const construtoraInput = document.getElementById('aprovacao-construtora');
    if (construtoraInput) {
      construtoraInput.value = '';
      construtoraInput.setCustomValidity('');
      construtoraInput.classList.remove('is-invalid');
      delete construtoraInput.dataset.userModified;
    }

    const empreendimentoInput = document.getElementById('aprovacao-empreendimento');
    if (empreendimentoInput) {
      empreendimentoInput.value = '';
      empreendimentoInput.setCustomValidity('');
      empreendimentoInput.classList.remove('is-invalid');
      delete empreendimentoInput.dataset.userModified;
    }

    this.hideLookupSuggestions();

    // Reseta estado de documentos
    this.uploadedFiles = [];
    this.aiValidationResults = [];
    this.renderUploadedFiles();
    this.updateUIState();
    this.clearAIValidationStatus();
    this.aiFormResult = null;
    this.autofillSourceDocument = null;
    this.usedLocalAutofill = false;

    // Reseta tabs para primeira
    const firstTab = document.getElementById('tab-dados');
    if (firstTab) {
      const tabInstance = bootstrap.Tab.getOrCreateInstance(firstTab);
      tabInstance.show();
    }

    // Reseta checklist
    document.querySelectorAll('.doc-check').forEach(cb => cb.checked = false);
    document.querySelectorAll('.approval-checklist-check').forEach(cb => cb.checked = false);

    this.updateEmpreendimentos('', '', false);
  },

  /**
   * Manipula selecao de arquivos
   */
  handleFileSelection(files) {
    const docType = document.getElementById('upload-doc-type')?.value || 'outros';

    Array.from(files).forEach(file => {
      // Valida tamanho (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert(`Arquivo "${file.name}" excede o limite de 10MB`);
        return;
      }

      // Valida tipo
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
        alert(`Formato de arquivo "${ext}" nao suportado`);
        return;
      }

      // Adiciona ao array
      this.uploadedFiles.push({
        file,
        type: docType,
        status: 'pending',
        previewUrl: null,
        aiResult: null
      });
    });

    this.renderUploadedFiles();
    this.updateDocsChecklistFromUploads();
    this.updateUIState();
  },

  /**
   * Renderiza lista de arquivos enviados com tipo individual
   * Inclui documentos existentes (ja salvos) e novos (pendentes de upload)
   */
  renderUploadedFiles() {
    const container = document.getElementById('uploaded-files-list');
    const noFilesMsg = document.getElementById('no-files-msg');
    const countBadge = document.getElementById('docs-count-badge');

    if (!container) return;

    const totalCount = this.existingDocuments.length + this.uploadedFiles.length;

    if (totalCount === 0) {
      if (noFilesMsg) noFilesMsg.classList.remove('d-none');
      if (countBadge) countBadge.textContent = '0';
      container.innerHTML = '<p class="text-muted text-center" id="no-files-msg">Nenhum arquivo selecionado</p>';
      return;
    }

    if (noFilesMsg) noFilesMsg.classList.add('d-none');
    if (countBadge) countBadge.textContent = totalCount;

    let html = '';

    // -- Documentos existentes (ja salvos) --
    if (this.existingDocuments.length > 0) {
      html += `<div class="mb-2"><small class="text-muted fw-bold text-uppercase"><i class="bi bi-cloud-check me-1"></i>Documentos salvos (${this.existingDocuments.length})</small></div>`;
      html += this.existingDocuments.map((doc, index) => {
        const ext = String(doc.nome || '').split('.').pop().toLowerCase();
        const isImage = ['jpg', 'jpeg', 'png'].includes(ext);
        const fileSize = doc.tamanho ? this.formatFileSize(doc.tamanho) : '';

        const typeSelectOptions = Object.entries(DOCUMENT_TYPES).map(([key, val]) =>
          `<option value="${key}" ${key === doc.type ? 'selected' : ''}>${val.required ? '* ' : ''}${val.label}</option>`
        ).join('');

        return `
          <div class="card mb-2 border-start border-success border-3" data-existing-index="${index}">
            <div class="card-body p-2">
              <div class="d-flex align-items-start gap-2">
                <i class="bi ${isImage ? 'bi-file-image' : 'bi-file-pdf'} fs-4 text-success mt-1"></i>
                <div class="flex-grow-1">
                  <div class="d-flex justify-content-between align-items-start">
                    <div>
                      <div class="fw-medium">${this.escapeHtml(doc.nome)}</div>
                      <small class="text-muted">
                        ${fileSize ? `${fileSize} ` : ''}
                        <span class="badge bg-success bg-opacity-10 text-success border border-success"><i class="bi bi-cloud-check me-1"></i>Salvo</span>
                      </small>
                    </div>
                    <div class="d-flex align-items-center gap-1">
                      <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeAprovacaoExistingFile(${index})" title="Remover">
                        <i class="bi bi-trash"></i>
                      </button>
                    </div>
                  </div>
                  <div class="mt-2">
                    <select class="form-select form-select-sm existing-doc-type-select" data-existing-index="${index}">
                      ${typeSelectOptions}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // -- Novos arquivos (pendentes de upload) --
    if (this.uploadedFiles.length > 0) {
      if (this.existingDocuments.length > 0) {
        html += `<div class="mb-2 mt-3"><small class="text-muted fw-bold text-uppercase"><i class="bi bi-cloud-arrow-up me-1"></i>Novos arquivos (${this.uploadedFiles.length})</small></div>`;
      }
      html += this.uploadedFiles.map((item, index) => {
        const statusBadge = this.getStatusBadge(item.status);
        const isImage = ['jpg', 'jpeg', 'png'].includes(item.file.name.split('.').pop().toLowerCase());

        const typeSelectOptions = Object.entries(DOCUMENT_TYPES).map(([key, val]) =>
          `<option value="${key}" ${key === item.type ? 'selected' : ''}>${val.required ? '* ' : ''}${val.label}</option>`
        ).join('');

        return `
          <div class="card mb-2 border-start border-primary border-3" data-file-index="${index}">
            <div class="card-body p-2">
              <div class="d-flex align-items-start gap-2">
                <i class="bi ${isImage ? 'bi-file-image' : 'bi-file-pdf'} fs-4 text-primary mt-1"></i>
                <div class="flex-grow-1">
                  <div class="d-flex justify-content-between align-items-start">
                    <div>
                      <div class="fw-medium">${this.escapeHtml(item.file.name)}</div>
                      <small class="text-muted">${this.formatFileSize(item.file.size)}</small>
                    </div>
                    <div class="d-flex align-items-center gap-1">
                      ${statusBadge}
                      ${item.status === 'analyzed' ? `
                        <button type="button" class="btn btn-sm btn-outline-info" onclick="showAprovacaoAIResult(${index})" title="Ver resultado IA">
                          <i class="bi bi-robot"></i>
                        </button>
                      ` : ''}
                      <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeAprovacaoFile(${index})" title="Remover">
                        <i class="bi bi-trash"></i>
                      </button>
                    </div>
                  </div>
                  <div class="mt-2">
                    <select class="form-select form-select-sm file-doc-type-select" data-file-index="${index}">
                      ${typeSelectOptions}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    container.innerHTML = html;

    // Bind selects de tipo individual para novos arquivos
    container.querySelectorAll('.file-doc-type-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const fileIndex = parseInt(e.target.dataset.fileIndex, 10);
        if (this.uploadedFiles[fileIndex]) {
          this.uploadedFiles[fileIndex].type = e.target.value;
          this.updateDocsChecklistFromUploads();
        }
      });
    });

    // Bind selects de tipo individual para documentos existentes
    container.querySelectorAll('.existing-doc-type-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const existingIndex = parseInt(e.target.dataset.existingIndex, 10);
        if (this.existingDocuments[existingIndex]) {
          this.existingDocuments[existingIndex].type = e.target.value;
          this.existingDocuments[existingIndex].categoria = e.target.value;
          this.updateDocsChecklistFromUploads();
        }
      });
    });
  },

  /**
   * Retorna badge de status
   */
  getStatusBadge(status) {
    const badges = {
      pending: '<span class="badge bg-secondary">Pendente</span>',
      uploading: '<span class="badge bg-info"><span class="spinner-border spinner-border-sm me-1"></span>Enviando</span>',
      uploaded: '<span class="badge bg-success"><i class="bi bi-check"></i> Enviado</span>',
      error: '<span class="badge bg-danger"><i class="bi bi-x"></i> Erro</span>',
      analyzed: '<span class="badge bg-primary"><i class="bi bi-robot"></i> Analisado</span>'
    };
    return badges[status] || badges.pending;
  },

  /**
   * Remove novo arquivo da lista
   */
  removeFile(index) {
    this.uploadedFiles.splice(index, 1);
    this.renderUploadedFiles();
    this.updateDocsChecklistFromUploads();
    this.updateUIState();
  },

  /**
   * Remove documento existente (ja salvo) da lista
   */
  removeExistingFile(index) {
    this.existingDocuments.splice(index, 1);
    this.renderUploadedFiles();
    this.updateDocsChecklistFromUploads();
    this.updateUIState();
  },

  /**
   * Mostra resultado da IA para um arquivo
   */
  showAIResult(index) {
    const item = this.uploadedFiles[index];
    if (!item || !item.aiResult) return;
    alert(JSON.stringify(item.aiResult, null, 2));
  },

  /**
   * Retorna item de upload do formulario usado no auto-preenchimento (IA/local), com deduplicacao.
   */
  getAutofillSourceUploadItem() {
    const source = this.autofillSourceDocument;
    const file = source?.file;
    if (!file) return null;

    const alreadyInUploads = this.uploadedFiles.some((item) => {
      const current = item?.file;
      if (!current) return false;
      return current.name === file.name
        && Number(current.size || 0) === Number(file.size || 0)
        && Number(current.lastModified || 0) === Number(file.lastModified || 0);
    });
    if (alreadyInUploads) return null;

    const alreadyInExisting = this.existingDocuments.some((doc) => {
      const docName = String(doc?.nome || doc?.name || '').trim();
      const docSize = Number(doc?.tamanho || doc?.size || 0);
      if (!docName || docName !== file.name) return false;
      return docSize <= 0 || docSize === Number(file.size || 0);
    });
    if (alreadyInExisting) return null;

    return {
      file,
      type: 'outros',
      status: 'pending',
      previewUrl: null,
      aiResult: null,
      isAutofillSource: true,
      autofillMode: source.mode || ''
    };
  },

  /**
   * Atualiza checklist baseado nos uploads e documentos existentes
   */
  updateDocsChecklistFromUploads() {
    document.querySelectorAll('.doc-check').forEach(cb => cb.checked = false);
    const existingTypes = this.existingDocuments.map(d => d.type);
    const newTypes = this.uploadedFiles.map(f => f.type);
    const allTypes = [...new Set([...existingTypes, ...newTypes])];
    allTypes.forEach(type => {
      const checkbox = document.getElementById(`check-${type}`);
      if (checkbox) checkbox.checked = true;
    });
  },

  /**
   * Atualiza estado da UI
   */
  updateUIState() {
    const emptyPanel = document.getElementById('ai-validation-empty');
    const resultsPanel = document.getElementById('ai-validation-results');

    if (emptyPanel && resultsPanel) {
      if (this.aiFormResult?.data) {
        emptyPanel.classList.add('d-none');
        resultsPanel.classList.remove('d-none');
      } else {
        emptyPanel.classList.remove('d-none');
        resultsPanel.classList.add('d-none');
      }
    }
  },

  /**
   * Exibe a aba de documentos
   */
  showDocumentsTab() {
    const docsTab = document.getElementById('tab-documentos');
    if (docsTab && bootstrap?.Tab?.getOrCreateInstance) {
      bootstrap.Tab.getOrCreateInstance(docsTab).show();
    }
  },

  showChecklistTab() {
    const checklistTab = document.getElementById('tab-checklist');
    if (checklistTab && bootstrap?.Tab?.getOrCreateInstance) {
      bootstrap.Tab.getOrCreateInstance(checklistTab).show();
    }
  },

  setAIProcessingContext(mode = 'default') {
    const label = document.getElementById('ai-processing-context-label');
    if (!label) return;

    if (mode === 'ia') {
      label.textContent = 'Analisando documento com IA...';
      return;
    }

    if (mode === 'local') {
      label.textContent = 'Processando documento localmente (sem IA)...';
      return;
    }

    label.textContent = 'Processando documento...';
  },

  validateApprovalChecklist() {
    const carta = document.getElementById('aprovacao-carta')?.value || 'MCMV';
    const selectors = ['todos', carta];
    const requiredChecks = Array.from(document.querySelectorAll('.approval-checklist-check'))
      .filter((input) => selectors.includes(input.dataset.produto));
    const missing = requiredChecks.filter((input) => !input.checked);

    if (missing.length > 0) {
      const missingLabels = missing
        .map((input) => input.closest('.form-check')?.querySelector('.form-check-label')?.textContent?.trim())
        .filter(Boolean);
      const preview = missingLabels.slice(0, 3).join('; ');
      const message = `Preencha o checklist obrigatório de aprovação antes de salvar. Itens pendentes: ${preview}${missingLabels.length > 3 ? '; ...' : ''}`;
      if (window.uiHelpers?.showToast) {
        window.uiHelpers.showToast(message, 'warning');
      } else {
        alert(message);
      }
      this.showChecklistTab();
      return false;
    }

    return true;
  },

  collectApprovalChecklist() {
    const checks = Array.from(document.querySelectorAll('.approval-checklist-check'))
      .filter((input) => input.checked)
      .map((input) => ({
        id: input.dataset.checklistId,
        produto: input.dataset.produto
      }));

    return {
      cartaFinanciamento: document.getElementById('aprovacao-carta')?.value || 'MCMV',
      itensMarcados: checks
    };
  },

  /**
   * Limpa avisos de validacao IA
   */
  clearAIValidationStatus() {
    const statusDiv = document.getElementById('aprovacao-ai-status');
    if (statusDiv) {
      statusDiv.classList.add('d-none');
      statusDiv.textContent = '';
      statusDiv.className = 'alert alert-info d-none';
    }
    this.setAIProcessingContext('default');

    const validationStatus = document.getElementById('aprovacao-ai-validation-status');
    if (validationStatus) {
      validationStatus.innerHTML = '';
    }

    const summaryEl = document.getElementById('ai-validation-summary');
    if (summaryEl) {
      summaryEl.innerHTML = '';
      summaryEl.className = 'alert d-none';
    }
  },

  /**
   * Mostra status da IA
   */
  showAIStatus(message, type = 'info') {
    const statusDiv = document.getElementById('aprovacao-ai-status');
    if (!statusDiv) return;

    statusDiv.className = `alert alert-${type}`;
    statusDiv.textContent = message;
    statusDiv.classList.remove('d-none');

    if (type === 'success' || type === 'danger') {
      setTimeout(() => {
        statusDiv.classList.add('d-none');
      }, 5000);
    }
  },

  /**
   * Processa formulario de aprovacao localmente (sem IA)
   */
  async processAprovacaoDocumentLocal() {
    const fileInput = document.getElementById('aprovacao-ai-document-upload');
    const localProcessBtn = document.getElementById('aprovacao-local-process-document-btn');
    const file = fileInput?.files?.[0];

    if (!file) {
      this.showAIStatus('Nenhum formulario selecionado.', 'warning');
      return null;
    }

    this.clearAIValidationStatus();
    this.aiFormResult = null;
    this.autofillSourceDocument = null;
    this.usedLocalAutofill = false;

    const loadingPanel = document.getElementById('ai-validation-loading');
    const progressBar = document.getElementById('ai-progress-bar');

    if (loadingPanel) loadingPanel.classList.remove('d-none');
    this.setAIProcessingContext('local');
    if (localProcessBtn) localProcessBtn.disabled = true;
    if (progressBar) {
      progressBar.style.width = '0%';
      progressBar.textContent = '0%';
    }

    try {
      if (typeof window.documentProcessingService === 'undefined') {
        const module = await import('../documentProcessingService.js');
        window.documentProcessingService = module.default;
      }

      console.info('[AddAprovacaoModal][LocalParser] Iniciando processamento local:', file.name);
      this.showAIStatus('Processando formulario localmente (sem IA)...', 'info');

      const result = await window.documentProcessingService.processAprovacaoFileLocally(file, {
        includeRawText: true,
        rawTextLimit: 6000,
        maxCharsTotal: 18000,
        maxCharsPerPdfPage: 3200,
        maxPdfInitialPages: 4,
        maxPdfFinalPages: 2
      });

      if (!result.success) {
        throw new Error(result.error || 'Falha ao processar documento localmente');
      }

      const normalizedData = this.normalizeAprovacaoAIData(result.data || {}, result.rawText || '');
      const compactResult = {
        success: true,
        data: normalizedData,
        metadata: {
          ...(result.metadata || {}),
          provider: 'local_parser',
          fallbackUsed: true
        },
        validation: null
      };
      this.aiFormResult = compactResult;
      this.autofillSourceDocument = {
        file,
        mode: 'local',
        provider: 'local_parser',
        processedAt: new Date().toISOString()
      };
      this.usedLocalAutofill = true;

      if (progressBar) {
        progressBar.style.width = '100%';
        progressBar.textContent = '100%';
      }

      this.renderAprovacaoAIResults(compactResult);
      this.applyExtractedDataToForm(compactResult.data, { onlyEmpty: true });

      const extractedFieldsCount = Object.keys(compactResult.data || {}).length;
      if (extractedFieldsCount > 0) {
        this.showAIStatus('Preenchimento local concluido.', 'success');
      } else {
        this.showAIStatus('Nao foi possivel identificar campos suficientes no documento.', 'warning');
      }

      if (fileInput) {
        fileInput.value = '';
        if (localProcessBtn) localProcessBtn.disabled = true;
      }

      console.info('[AddAprovacaoModal][LocalParser] Processamento local concluido:', {
        arquivo: file.name,
        campos: extractedFieldsCount
      });

      return result;
    } catch (error) {
      this.usedLocalAutofill = false;
      console.error('[AddAprovacaoModal][LocalParser] Erro ao processar formulario local:', error);
      this.showAIStatus(error.message || 'Falha no processamento local.', 'danger');
      return null;
    } finally {
      if (loadingPanel) loadingPanel.classList.add('d-none');
      const hasFileSelected = !!fileInput?.files?.length;
      if (localProcessBtn) localProcessBtn.disabled = !hasFileSelected;
      this.updateUIState();
    }
  },

  /**
   * Renderiza resultados da IA para o formulario
   */
  renderAprovacaoAIResults(result) {
    const summaryEl = document.getElementById('ai-validation-summary');
    const data = result?.data || {};
    const keys = Object.keys(data);
    const keyFieldsFilled = [
      data.cliente || data.nome,
      data.cpf || (Array.isArray(data.cpfs) && data.cpfs.length > 0),
      data.renda,
      data.vencSicaq,
      data.situacao
    ].filter(Boolean).length;

    if (summaryEl) {
      const alertClass = keys.length > 0 ? 'alert-success' : 'alert-warning';
      summaryEl.className = `alert ${alertClass}`;
      summaryEl.innerHTML = `
        <i class="bi ${keys.length > 0 ? 'bi-check-circle' : 'bi-exclamation-triangle'} me-2"></i>
        ${keys.length > 0
    ? `Documento processado. Campos identificados: <strong>${keys.length}</strong> (principais: <strong>${keyFieldsFilled}/5</strong>).`
    : 'Nenhum dado foi extraido.'}
      `;
    }

    this.updateUIState();
  },

  /**
   * Analisa documentos com IA
   */
  async analyzeDocumentsWithAI() {
    if (this.uploadedFiles.length === 0) {
      alert('Nenhum documento para analisar');
      return;
    }

    this.clearAIValidationStatus();
    this.aiValidationResults = [];
    const loadingPanel = document.getElementById('ai-validation-loading');
    const progressBar = document.getElementById('ai-progress-bar');

    if (loadingPanel) loadingPanel.classList.remove('d-none');

    this.showDocumentsTab();

    try {
      for (let i = 0; i < this.uploadedFiles.length; i++) {
        const item = this.uploadedFiles[i];
        const progress = Math.round(((i + 1) / this.uploadedFiles.length) * 100);

        if (progressBar) {
          progressBar.style.width = `${progress}%`;
          progressBar.textContent = `${progress}%`;
        }

        item.status = 'uploading';
        this.renderUploadedFiles();

        try {
          const result = await this.analyzeFileWithAI(item.file, item.type);
          item.aiResult = result;
          item.status = 'analyzed';
          this.aiValidationResults.push({
            filename: item.file.name,
            type: item.type,
            result
          });
        } catch (error) {
          console.error(`Erro ao analisar ${item.file.name}:`, error);
          item.status = 'error';
          item.aiResult = { error: error.message };
          this.aiValidationResults.push({
            filename: item.file.name,
            type: item.type,
            result: {
              success: false,
              documentType: item.type,
              extractedData: {},
              validation: {
                isValid: false,
                confidence: 0,
                issues: [error.message]
              }
            }
          });
        }

        this.renderUploadedFiles();
      }

      this.renderAIValidationResults();

    } finally {
      if (loadingPanel) loadingPanel.classList.add('d-none');
      this.updateUIState();
    }
  },

  /**
   * Analisa um arquivo individual com IA
   */
  async analyzeFileWithAI(file, docType) {
    if (typeof window.documentProcessingService === 'undefined') {
      try {
        const module = await import('../documentProcessingService.js');
        window.documentProcessingService = module.default;
      } catch (e) {
        console.warn('[AddAprovacaoModal] documentProcessingService nao disponivel:', e);
        return {
          success: true,
          documentType: docType,
          extractedData: {
            nome: 'Dados extraidos automaticamente',
            cpf: '000.000.000-00'
          },
          validation: {
            isValid: true,
            confidence: 0.85,
            issues: []
          }
        };
      }
    }

    const result = await window.documentProcessingService.processFile(file, {
      documentType: docType,
      extractFields: true,
      validate: true,
      maxPromptChars: 12000,
      maxCharsTotal: 15000,
      maxCharsPerPdfPage: 2500,
      maxPdfInitialPages: 3,
      maxPdfFinalPages: 2,
      maxImageDimension: 1280,
      imageQuality: 0.78
    });

    return {
      success: result.success,
      documentType: docType,
      extractedData: result.data || {},
      validation: {
        isValid: result.success,
        confidence: result.success ? 0.85 : 0,
        issues: result.error ? [result.error] : []
      },
      metadata: result.metadata
    };
  },

  /**
   * Renderiza resultados da validacao por IA
   */
  renderAIValidationResults() {
    const summaryEl = document.getElementById('ai-validation-summary');
    const extractedDataEl = document.getElementById('ai-extracted-data');
    const accordionEl = document.getElementById('ai-validations-accordion');
    const badgeEl = document.getElementById('ai-validation-badge');

    const total = this.aiValidationResults.length;
    const valid = this.aiValidationResults.filter(r => r.result?.validation?.isValid).length;
    const hasErrors = total - valid;

    if (summaryEl) {
      const alertClass = hasErrors > 0 ? 'alert-warning' : 'alert-success';
      const icon = hasErrors > 0 ? 'bi-exclamation-triangle' : 'bi-check-circle';

      summaryEl.className = `alert ${alertClass}`;
      summaryEl.innerHTML = `
        <i class="bi ${icon} me-2"></i>
        <strong>${valid} de ${total}</strong> documentos validados com sucesso.
        ${hasErrors > 0 ? `<br><small>${hasErrors} documento(s) com pendencias.</small>` : ''}
      `;
    }

    if (badgeEl) {
      badgeEl.classList.remove('d-none');
      if (hasErrors > 0) {
        badgeEl.className = 'badge bg-warning text-dark ms-1';
        badgeEl.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${hasErrors}`;
      } else {
        badgeEl.className = 'badge bg-success ms-1';
        badgeEl.innerHTML = `<i class="bi bi-check-circle"></i>`;
      }
    }

    if (extractedDataEl) {
      const allData = {};
      this.aiValidationResults.forEach(r => {
        if (r.result?.extractedData) {
          Object.assign(allData, r.result.extractedData);
        }
      });

      if (Object.keys(allData).length > 0) {
        extractedDataEl.innerHTML = `
          <div class="row g-2">
            ${Object.entries(allData).map(([key, value]) => `
              <div class="col-md-6">
                <small class="text-muted">${this.formatFieldLabel(key)}</small>
                <div class="fw-medium">${this.escapeHtml(String(value))}</div>
              </div>
            `).join('')}
          </div>
        `;
      } else {
        extractedDataEl.innerHTML = '<p class="text-muted mb-0">Nenhum dado extraido</p>';
      }
    }

    if (accordionEl) {
      accordionEl.innerHTML = this.aiValidationResults.map((item, idx) => {
        const isValid = item.result?.validation?.isValid;
        const confidence = item.result?.validation?.confidence || 0;
        const issues = item.result?.validation?.issues || [];
        const docInfo = DOCUMENT_TYPES[item.type] || DOCUMENT_TYPES.outros;

        return `
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button class="accordion-button ${idx > 0 ? 'collapsed' : ''}" type="button" data-bs-toggle="collapse" data-bs-target="#validation-${idx}">
                <i class="bi ${isValid ? 'bi-check-circle text-success' : 'bi-exclamation-circle text-warning'} me-2"></i>
                <span>${this.escapeHtml(item.filename)}</span>
                <span class="badge bg-secondary ms-2">${docInfo.label}</span>
                <span class="badge bg-info ms-2">${Math.round(confidence * 100)}% confianca</span>
              </button>
            </h2>
            <div id="validation-${idx}" class="accordion-collapse collapse ${idx === 0 ? 'show' : ''}">
              <div class="accordion-body">
                ${issues.length > 0 ? `
                  <div class="alert alert-warning mb-2">
                    <strong>Pendencias encontradas:</strong>
                    <ul class="mb-0 mt-1">
                      ${issues.map(issue => `<li>${this.escapeHtml(issue)}</li>`).join('')}
                    </ul>
                  </div>
                ` : '<p class="text-success mb-0"><i class="bi bi-check-circle me-1"></i>Documento valido</p>'}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  },

  /**
   * Converte valores monetarios para numero
   */
  parseMonetaryValue(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    const str = String(value).trim();
    if (!str) return null;

    const values = this.extractMonetaryValuesFromText(str);
    if (values.length > 0) {
      return Math.max(...values);
    }

    if (/^-?\d+(?:[.,]\d+)?$/.test(str)) {
      const parsed = Number(str.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  },

  /**
   * Extrai valores monetarios no formato brasileiro (1.234,56) de um texto
   */
  extractMonetaryValuesFromText(text = '') {
    if (typeof text !== 'string' || !text.trim()) return [];

    const normalized = text
      .replace(/\u00A0/g, ' ')
      .replace(/(,\d{2})(?=\d)/g, '$1 ');
    const matches = normalized.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];

    return matches
      .map((match) => Number(match.replace(/\./g, '').replace(',', '.')))
      .filter((num) => Number.isFinite(num));
  },

  /**
   * Normaliza token de data para DD-MM-YYYY
   */
  normalizeDateTokenToBR(value, options = {}) {
    if (!value) return '';

    const useLastDayOfMonth = options.useLastDayOfMonth !== false;
    const pad = (num) => String(num).padStart(2, '0');

    if (value?.toDate) {
      const date = value.toDate();
      if (!Number.isNaN(date?.getTime?.())) {
        return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
      }
    }

    if (value instanceof Date) {
      if (!Number.isNaN(value.getTime())) {
        return `${pad(value.getDate())}-${pad(value.getMonth() + 1)}-${value.getFullYear()}`;
      }
    }

    const str = String(value).trim();
    if (!str) return '';

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const [year, month, day] = str.split('-');
      return `${day}-${month}-${year}`;
    }

    if (/^\d{2}[/.-]\d{2}[/.-]\d{4}$/.test(str)) {
      const [day, month, year] = str.split(/[/.-]/);
      return `${day}-${month}-${year}`;
    }

    if (/^\d{1,2}\/\d{4}$/.test(str)) {
      const [monthRaw, yearRaw] = str.split('/');
      const month = Number(monthRaw);
      const year = Number(yearRaw);
      if (month >= 1 && month <= 12 && year >= 1900) {
        const day = useLastDayOfMonth ? new Date(year, month, 0).getDate() : 1;
        return `${pad(day)}-${pad(month)}-${year}`;
      }
    }

    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return `${pad(parsed.getDate())}-${pad(parsed.getMonth() + 1)}-${parsed.getFullYear()}`;
    }

    return '';
  },

  /**
   * Extrai pistas do texto OCR para aumentar assertividade da IA
   */
  extractAprovacaoTextHints(rawText = '') {
    if (typeof rawText !== 'string' || !rawText.trim()) {
      return {};
    }

    const text = rawText.replace(/\u00A0/g, ' ').replace(/\r/g, '\n');
    const flatText = text.replace(/\s+/g, ' ');
    const hints = {};
    const isEmpty = (value) => value === null || value === undefined || value === '';

    const validadeRangeMatch = flatText.match(
      /validade[^\d]{0,30}(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s*(?:a|ate|-)\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i
    );
    if (validadeRangeMatch) {
      const inicio = this.normalizeDateTokenToBR(validadeRangeMatch[1], { useLastDayOfMonth: false });
      const fim = this.normalizeDateTokenToBR(validadeRangeMatch[2], { useLastDayOfMonth: true });
      if (inicio) hints.validadeInicio = inicio;
      if (fim) {
        hints.validadeFim = fim;
        hints.vencSicaq = fim;
      }
    }

    if (isEmpty(hints.vencSicaq)) {
      const validadeSingleMatch = flatText.match(
        /validade[^\d]{0,30}(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}\/\d{4})/i
      );
      if (validadeSingleMatch) {
        const parsed = this.normalizeDateTokenToBR(validadeSingleMatch[1], { useLastDayOfMonth: true });
        if (parsed) {
          hints.validadeFim = parsed;
          hints.vencSicaq = parsed;
        }
      }
    }

    if (isEmpty(hints.vencSicaq)) {
      const monthYearMatches = Array.from(flatText.matchAll(/(0?[1-9]|1[0-2])\/(20\d{2})/g));
      if (monthYearMatches.length > 0) {
        const sorted = monthYearMatches
          .map((match) => ({ month: Number(match[1]), year: Number(match[2]) }))
          .sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month));
        const top = sorted[0];
        const parsed = this.normalizeDateTokenToBR(`${top.month}/${top.year}`, { useLastDayOfMonth: true });
        if (parsed) {
          hints.validadeFim = parsed;
          hints.vencSicaq = parsed;
        }
      }
    }

    const textUpper = text.toUpperCase();
    const rendaStart = textUpper.indexOf('RENDA');
    if (rendaStart >= 0) {
      const observacaoIdx = textUpper.indexOf('OBSERVA', rendaStart);
      const sectionEnd = observacaoIdx > rendaStart ? observacaoIdx : text.length;
      const rendaSection = text.slice(rendaStart, sectionEnd);
      const rendaValues = this.extractMonetaryValuesFromText(rendaSection)
        .filter((value) => value > 0);

      if (rendaValues.length > 0) {
        const sorted = [...rendaValues].sort((a, b) => b - a);
        hints.rendaBrutaTotal = sorted[0];
        hints.renda = sorted[0];
        if (sorted.length > 1) {
          hints.rendaLiquidaTotal = sorted[1];
        }
      }
    }

    return hints;
  },

  /**
   * Normaliza e enriquece dados extraidos do formulario de aprovacao
   */
  normalizeAprovacaoAIData(data = {}, rawText = '') {
    const allData = data && typeof data === 'object' ? { ...data } : {};
    const textHints = this.extractAprovacaoTextHints(rawText);
    const isEmpty = (value) => value === null || value === undefined || value === '';

    const toNumber = (value) => {
      return this.parseMonetaryValue(value);
    };

    const sumNumbers = (...values) => {
      const nums = values
        .map(toNumber)
        .filter((num) => typeof num === 'number' && !Number.isNaN(num));
      return nums.length ? nums.reduce((acc, num) => acc + num, 0) : null;
    };

    Object.entries(textHints).forEach(([key, value]) => {
      if (isEmpty(allData[key]) && !isEmpty(value)) {
        allData[key] = value;
      }
    });

    if (!Array.isArray(allData.cpfs)) {
      const cpfsFromString = typeof allData.cpf === 'string'
        ? allData.cpf.split(/[\\/|]/).map(item => item.trim()).filter(Boolean)
        : [];
      if (allData.cpfParticipante) {
        cpfsFromString.push(allData.cpfParticipante);
      }
      if (cpfsFromString.length > 0) {
        allData.cpfs = [...new Set(cpfsFromString)];
      }
    }

    if (!Array.isArray(allData.nomesClientes)) {
      const nomesFromString = typeof allData.cliente === 'string'
        ? allData.cliente.split(/[\\/|]/).map(item => item.trim()).filter(Boolean)
        : [];
      if (allData.participante) {
        nomesFromString.push(allData.participante);
      }
      if (nomesFromString.length > 0) {
        allData.nomesClientes = [...new Set(nomesFromString)];
      }
    }

    if (Array.isArray(allData.cpfs)) {
      allData.cpf = allData.cpfs.join(' / ');
    }
    if (Array.isArray(allData.nomesClientes)) {
      allData.cliente = allData.nomesClientes.join(' / ');
    }

    const resultadoRaw = String(
      allData.resultadoAvaliacao ||
      allData.resultado ||
      allData.resultadoAnalise ||
      ''
    ).toUpperCase();
    if (!allData.situacao && resultadoRaw) {
      if (resultadoRaw.includes('REPROV')) {
        allData.situacao = 'REPROVADO';
      } else if (resultadoRaw.includes('CONDIC')) {
        allData.situacao = 'CONDICIONADO';
      } else if (resultadoRaw.includes('APROV')) {
        allData.situacao = 'APROVADO';
      }
    }

    if (!allData.dataAprovacao) {
      allData.dataAprovacao =
        allData.validadeInicio ||
        allData.dataValidade ||
        allData.dataAssinatura ||
        allData.data ||
        null;
    }

    if (!allData.vencSicaq) {
      allData.vencSicaq =
        allData.validadeFim ||
        allData.validade ||
        allData.vencimentoSicaq ||
        allData.vencimento ||
        allData.dataVencimentoSicaq ||
        allData.dataVencimento ||
        null;
    }

    if (!allData.dataEntrada && allData.dataAprovacao) {
      allData.dataEntrada = allData.dataAprovacao;
    }

    if (!allData.renda) {
      const rendaLiquidaTotal = toNumber(allData.rendaLiquidaTotal);
      const rendaLiquidaSomada = sumNumbers(allData.rendaLiquidaProponente, allData.rendaLiquidaParticipante);
      const rendaBrutaTotal = toNumber(allData.rendaBrutaTotal);
      const rendaBrutaSomada = sumNumbers(allData.rendaBrutaProponente, allData.rendaBrutaParticipante);
      const rendaInformal = toNumber(allData.rendaLiquidaInformal);
      const rendaBruta = toNumber(allData.rendaBruta);
      const rendaLiquida = toNumber(allData.rendaLiquida);
      const rendaMensal = toNumber(allData.rendaMensal || allData.rendaTotal);

      if (rendaBrutaTotal !== null) {
        allData.renda = rendaBrutaTotal;
      } else if (rendaBrutaSomada !== null) {
        allData.renda = rendaBrutaSomada;
      } else if (rendaBruta !== null) {
        allData.renda = rendaBruta;
      } else if (rendaLiquidaTotal !== null) {
        allData.renda = rendaLiquidaTotal;
      } else if (rendaLiquidaSomada !== null) {
        allData.renda = rendaLiquidaSomada;
      } else if (rendaLiquida !== null) {
        allData.renda = rendaLiquida;
      } else if (rendaMensal !== null) {
        allData.renda = rendaMensal;
      } else if (rendaInformal !== null) {
        allData.renda = rendaInformal;
      }
    }

    if (!allData.cartaFinanciamento) {
      const cartaRef = `${allData.produto || ''} ${allData.origemRecurso || ''}`.toUpperCase();
      if (cartaRef.includes('MCMV') || cartaRef.includes('NPMCMV') || cartaRef.includes('FGTS')) {
        allData.cartaFinanciamento = 'MCMV';
      } else if (cartaRef.includes('SBPE')) {
        allData.cartaFinanciamento = 'SBPE';
      }
    } else if (typeof allData.cartaFinanciamento === 'string') {
      allData.cartaFinanciamento = allData.cartaFinanciamento.trim().toUpperCase();
    }

    return allData;
  },

  /**
   * Aplica dados extraidos ao formulario
   */
  applyExtractedDataToForm(data = null, options = {}) {
    const onlyEmpty = !!options.onlyEmpty;
    const allData = data && typeof data === 'object' ? { ...data } : {};

    if (!data) {
      this.aiValidationResults.forEach(r => {
        if (r.result?.extractedData) {
          Object.assign(allData, r.result.extractedData);
        }
      });
    }
    const normalizedData = this.normalizeAprovacaoAIData(allData);

    const fieldMap = {
      nome: 'aprovacao-cliente',
      cliente: 'aprovacao-cliente',
      cpf: 'aprovacao-cpf',
      dataEntrada: 'aprovacao-data-entrada',
      dataAprovacao: 'aprovacao-data-aprovacao',
      vencSicaq: 'aprovacao-venc-sicaq',
      construtora: 'aprovacao-construtora',
      empreendimento: 'aprovacao-empreendimento',
      corretor: 'aprovacao-corretor',
      gerenteImobiliaria: 'aprovacao-gerente',
      gerente: 'aprovacao-gerente',
      analistaAprovacao: 'aprovacao-analista',
      situacao: 'aprovacao-situacao',
      pendencia: 'aprovacao-pendencia',
      renda: 'aprovacao-renda',
      cartaFinanciamento: 'aprovacao-carta',
      financiamento: 'aprovacao-valor',
      valorFinanciamento: 'aprovacao-valor',
      prazoMeses: 'aprovacao-prazo'
    };

    Object.entries(fieldMap).forEach(([dataKey, fieldId]) => {
      if (normalizedData[dataKey] === null || normalizedData[dataKey] === undefined || normalizedData[dataKey] === '') {
        return;
      }
      const field = document.getElementById(fieldId);
      if (!field) return;

      if (onlyEmpty && field.value) {
        const allowOverrideDefaultCarta = dataKey === 'cartaFinanciamento' && field.tagName === 'SELECT' && field.value === 'MCMV';
        if (!allowOverrideDefaultCarta) return;
      }

      let value = normalizedData[dataKey];
      if (typeof value === 'number' && (dataKey === 'renda' || dataKey === 'valorFinanciamento' || dataKey === 'financiamento')) {
        value = this.formatCurrency(value);
      }
      if (dataKey === 'situacao' && typeof value === 'string') {
        const normalized = value.trim().toUpperCase();
        if (['APROVADO', 'REPROVADO', 'CONDICIONADO'].includes(normalized)) {
          value = normalized;
        }
      }
      if (dataKey === 'cartaFinanciamento' && typeof value === 'string') {
        value = value.trim().toUpperCase();
      }
      if (field.type === 'date') {
        value = this.normalizeDateInputValue(value);
        if (!value) return;
      }

      field.value = value;
      field.classList.add('ai-suggested');
      setTimeout(() => field.classList.remove('ai-suggested'), 3000);
    });

    if (normalizedData.construtora) {
      const construtoraField = document.getElementById('aprovacao-construtora');
      if (construtoraField && (!onlyEmpty || !construtoraField.value)) {
        construtoraField.value = this.normalizeLookupValue(normalizedData.construtora);
        construtoraField.dataset.userModified = 'true';
        this.updateEmpreendimentos(
          construtoraField.value || normalizedData.construtora,
          normalizedData.empreendimento || '',
          Boolean(normalizedData.empreendimento)
        );
      }
    }

    if (normalizedData.empreendimento) {
      const empreendimentoField = document.getElementById('aprovacao-empreendimento');
      if (empreendimentoField && (!onlyEmpty || !empreendimentoField.value)) {
        empreendimentoField.value = this.normalizeLookupValue(normalizedData.empreendimento);
        empreendimentoField.dataset.userModified = 'true';
      }
    }

    this.validateConstrutoraSelection();
    this.validateEmpreendimentoSelection();

    const dadosTab = document.getElementById('tab-dados');
    if (dadosTab) {
      bootstrap.Tab.getOrCreateInstance(dadosTab).show();
    }

    this.updateUIState();
  },

  /**
   * Atualiza lista de empreendimentos
   */
  updateEmpreendimentos(construtoraName, selectedEmpreendimento = '', allowLegacy = false) {
    const empreendimentoInput = document.getElementById('aprovacao-empreendimento');
    if (!empreendimentoInput) return;

    const normalizedConstrutora = this.normalizeLookupValue(construtoraName);
    const empreendimentos = this.getEmpreendimentoNamesByVendor(normalizedConstrutora);
    empreendimentoInput.placeholder = normalizedConstrutora
      ? 'Digite ou selecione o empreendimento'
      : 'Selecione a construtora primeiro';
    empreendimentoInput.dataset.allowedEmpreendimentos = JSON.stringify(empreendimentos);

    const normalizedEmpreendimento = this.normalizeLookupValue(selectedEmpreendimento);
    if (!normalizedEmpreendimento) {
      empreendimentoInput.value = '';
      this.validateEmpreendimentoSelection();
      return;
    }

    const matchedEmp = empreendimentos.find(
      (emp) => this.normalizeLookupKey(emp) === this.normalizeLookupKey(normalizedEmpreendimento)
    );

    if (matchedEmp) {
      empreendimentoInput.value = matchedEmp;
      this.validateEmpreendimentoSelection();
      return;
    }

    empreendimentoInput.value = allowLegacy ? normalizedEmpreendimento : '';
    this.validateEmpreendimentoSelection();
  },

  /**
   * Preenche o formulario para edicao
   */
  fillFormForEdit(aprovacao) {
    document.getElementById('aprovacao-cpf').value = aprovacao.cpfs?.join(' / ') || aprovacao.cpfPrincipal || '';
    document.getElementById('aprovacao-cliente').value = aprovacao.nomesClientes?.join(' / ') || aprovacao.nomeClientePrincipal || '';

    const dateFields = [
      {
        elementId: 'aprovacao-data-entrada',
        value: aprovacao.dataEntrada || aprovacao.entrada || aprovacao.createdAt || aprovacao.criadoEm
      },
      { elementId: 'aprovacao-data-aprovacao', value: aprovacao.dataAprovacao },
      { elementId: 'aprovacao-venc-sicaq', value: aprovacao.vencSicaq }
    ];

    dateFields.forEach(({ elementId, value }) => {
      const input = document.getElementById(elementId);
      if (!input) return;
      input.value = this.normalizeDateInputValue(value);
    });

    const construtoraInput = document.getElementById('aprovacao-construtora');
    if (construtoraInput) {
      this.populateConstrutorasSelect(aprovacao.construtora || '', Boolean(aprovacao.construtora));
      this.updateEmpreendimentos(
        aprovacao.construtora || '',
        aprovacao.empreendimento || '',
        Boolean(aprovacao.empreendimento)
      );

      const empreendimentoInput = document.getElementById('aprovacao-empreendimento');
      delete construtoraInput.dataset.userModified;
      if (empreendimentoInput) {
        delete empreendimentoInput.dataset.userModified;
      }
    }

    document.getElementById('aprovacao-corretor').value = aprovacao.corretor || '';
    document.getElementById('aprovacao-gerente').value = aprovacao.gerenteImobiliaria || '';
    document.getElementById('aprovacao-analista').value = aprovacao.analistaAprovacao || '';
    document.getElementById('aprovacao-situacao').value = aprovacao.situacao || '';
    document.getElementById('aprovacao-pendencia').value = aprovacao.pendencia || '';
    document.getElementById('aprovacao-renda').value = aprovacao.renda ? this.formatCurrency(aprovacao.renda) : '';
    document.getElementById('aprovacao-carta').value = aprovacao.cartaFinanciamento || 'MCMV';
    document.getElementById('aprovacao-valor').value = aprovacao.valorFinanciamento ? this.formatCurrency(aprovacao.valorFinanciamento) : '';
    document.getElementById('aprovacao-prazo').value = aprovacao.prazoMeses || '';

    // Carrega documentos existentes para exibicao na aba de documentos
    if (Array.isArray(aprovacao.documentos) && aprovacao.documentos.length > 0) {
      this.existingDocuments = aprovacao.documentos.map((doc, index) => ({
        nome: doc.nome || doc.name || `Documento ${index + 1}`,
        type: doc.type || doc.categoria || 'outros',
        categoria: doc.categoria || doc.type || 'outros',
        tamanho: Number(doc.tamanho || doc.size || 0),
        storagePath: doc.storagePath || doc.path || '',
        url: doc.url || '',
        path: doc.path || doc.storagePath || ''
      }));
      this.renderUploadedFiles();
      this.updateDocsChecklistFromUploads();
    }

    if (Array.isArray(aprovacao.checklistAprovacao?.itensMarcados)) {
      aprovacao.checklistAprovacao.itensMarcados.forEach((item) => {
        const checkbox = document.getElementById(`approval-check-${item.id}`);
        if (checkbox) checkbox.checked = true;
      });
    }
  },

  /**
   * Trata o submit do formulario
   */
  async handleSubmit() {
    const form = document.getElementById('add-aprovacao-form');
    const submitBtn = document.getElementById('add-aprovacao-submit');
    const submitText = document.getElementById('add-aprovacao-submit-text');
    const construtoraValida = this.validateConstrutoraSelection();
    const empreendimentoValido = this.validateEmpreendimentoSelection();

    if (!construtoraValida || !empreendimentoValido || !form.checkValidity()) {
      form.classList.add('was-validated');
      const dadosTab = document.getElementById('tab-dados');
      if (dadosTab) {
        bootstrap.Tab.getOrCreateInstance(dadosTab).show();
      }
      return;
    }

    const data = {
      cpf: document.getElementById('aprovacao-cpf').value.trim(),
      cliente: document.getElementById('aprovacao-cliente').value.trim(),
      dataEntrada: document.getElementById('aprovacao-data-entrada').value,
      dataAprovacao: document.getElementById('aprovacao-data-aprovacao').value || null,
      vencSicaq: document.getElementById('aprovacao-venc-sicaq').value || null,
      construtora: this.normalizeLookupValue(document.getElementById('aprovacao-construtora').value),
      empreendimento: this.normalizeLookupValue(document.getElementById('aprovacao-empreendimento').value),
      corretor: document.getElementById('aprovacao-corretor').value.trim(),
      gerenteImobiliaria: document.getElementById('aprovacao-gerente').value.trim(),
      analistaAprovacao: document.getElementById('aprovacao-analista').value.trim() || auth.currentUser?.email || '',
      situacao: document.getElementById('aprovacao-situacao').value,
      pendencia: document.getElementById('aprovacao-pendencia').value.trim(),
      renda: document.getElementById('aprovacao-renda').value,
      cartaFinanciamento: document.getElementById('aprovacao-carta').value,
      valorFinanciamento: document.getElementById('aprovacao-valor').value,
      prazoMeses: document.getElementById('aprovacao-prazo').value,
      checklistAprovacao: this.collectApprovalChecklist()
    };

    if (this.aiFormResult?.data) {
      data.aiValidation = {
        timestamp: new Date().toISOString(),
        source: 'formulario_aprovacao',
        provider: this.aiFormResult.metadata?.provider || '',
        fields: Object.keys(this.aiFormResult.data || {})
      };

      if (this.autofillSourceDocument?.file) {
        data.aiValidation.documentoUtilizado = {
          nome: this.autofillSourceDocument.file.name,
          tamanho: Number(this.autofillSourceDocument.file.size || 0),
          modo: this.autofillSourceDocument.mode || '',
          provider: this.autofillSourceDocument.provider || '',
          processadoEm: this.autofillSourceDocument.processedAt || new Date().toISOString()
        };
      }
    }

    submitBtn.disabled = true;
    submitText.textContent = 'Salvando...';

    try {
      let aprovacaoId;

      if (this.editingAprovacao) {
        await aprovacaoService.updateAprovacao(this.editingAprovacao.id, data);
        aprovacaoId = this.editingAprovacao.id;
      } else {
        aprovacaoId = await aprovacaoService.createAprovacao(data);
      }

      // Monta lista final de documentos: existentes (mantidos/editados) + novos uploads
      const autofillSourceUploadItem = this.getAutofillSourceUploadItem();
      const filesToUpload = autofillSourceUploadItem
        ? [...this.uploadedFiles, autofillSourceUploadItem]
        : [...this.uploadedFiles];
      const hasNewFiles = filesToUpload.length > 0;
      const hasExistingDocs = this.existingDocuments.length > 0;
      const docsChanged = this.editingAprovacao && (
        hasNewFiles ||
        hasExistingDocs !== (Array.isArray(this.editingAprovacao.documentos) && this.editingAprovacao.documentos.length > 0) ||
        (hasExistingDocs && this.existingDocuments.length !== (this.editingAprovacao.documentos?.length || 0))
      );

      if (hasNewFiles || docsChanged) {
        // Documentos existentes mantidos (com tipo possivelmente atualizado)
        const keptDocuments = this.existingDocuments.map(doc => ({
          nome: doc.nome,
          name: doc.nome,
          categoria: doc.type || doc.categoria || 'outros',
          type: doc.type || doc.categoria || 'outros',
          tamanho: Number(doc.tamanho || 0),
          size: Number(doc.tamanho || 0),
          storagePath: doc.storagePath || '',
          path: doc.path || doc.storagePath || '',
          url: doc.url || ''
        }));

        // Upload de novos arquivos
        const uploadedDocumentEntries = [];
        const failedUploads = [];

        if (hasNewFiles && aprovacaoId) {
          submitText.textContent = 'Enviando documentos...';

          for (const item of filesToUpload) {
            try {
              const uploadResult = await uploadToStorage(aprovacaoId, item.file, item.type, (progress) => {
                submitText.textContent = `Enviando ${Math.round(progress)}%...`;
              });

              uploadedDocumentEntries.push({
                nome: uploadResult?.nome || item.file.name,
                name: uploadResult?.name || item.file.name,
                categoria: item.type || uploadResult?.categoria || uploadResult?.type || 'outros',
                type: item.type || uploadResult?.type || 'outros',
                tamanho: Number(uploadResult?.tamanho || uploadResult?.size || item.file.size || 0),
                size: Number(uploadResult?.size || uploadResult?.tamanho || item.file.size || 0),
                storagePath: uploadResult?.storagePath || uploadResult?.path || '',
                path: uploadResult?.path || uploadResult?.storagePath || '',
                url: uploadResult?.url || ''
              });
            } catch (uploadError) {
              console.error(`Erro ao enviar ${item.file.name}:`, uploadError);
              failedUploads.push(item.file.name);
            }
          }

          if (hasNewFiles && failedUploads.length === filesToUpload.length) {
            throw new Error(`Nenhum documento foi enviado com sucesso. Falhas: ${failedUploads.join(', ')}`);
          }
        }

        // Merge: existentes mantidos + novos enviados com sucesso
        const mergedDocuments = [...keptDocuments, ...uploadedDocumentEntries];
        await aprovacaoService.updateAprovacao(aprovacaoId, { documentos: mergedDocuments });

        if (failedUploads.length > 0) {
          const partialMessage = `${failedUploads.length} arquivo(s) nao foram enviados: ${failedUploads.join(', ')}`;
          if (window.uiHelpers?.showToast) {
            window.uiHelpers.showToast(partialMessage, 'warning');
          } else {
            alert(partialMessage);
          }
        }
      }

      this.close();

      if (window.aprovacaoPage) {
        window.aprovacaoPage.refresh();
      }

    } catch (error) {
      console.error('[AddAprovacaoModal] Erro ao salvar:', error);
      alert('Erro ao salvar: ' + error.message);
    } finally {
      submitBtn.disabled = false;
      submitText.textContent = 'Salvar';
    }
  },

  /**
   * Formata valor para moeda
   */
  formatCurrency(value) {
    if (value === null || value === undefined || value === '') return '';
    const number = typeof value === 'number'
      ? value
      : parseFloat(String(value).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
    if (Number.isNaN(number)) return '';
    return number.toFixed(2).replace('.', ',');
  },

  /**
   * Formata valor para exibicao na lista de dados extraidos
   */
  formatAIValueForDisplay(key, value) {
    if (value === null || value === undefined || value === '') return '-';

    const monetaryKeys = new Set([
      'renda',
      'valorFinanciamento',
      'prestacao',
      'valorImovel',
      'rendaLiquidaTotal',
      'rendaBrutaTotal',
      'rendaLiquidaProponente',
      'rendaBrutaProponente',
      'rendaLiquidaParticipante',
      'rendaBrutaParticipante',
      'rendaLiquidaInformal'
    ]);

    const dateKeys = new Set([
      'dataEntrada',
      'dataAprovacao',
      'vencSicaq',
      'validadeInicio',
      'validadeFim',
      'dataInicioInformal',
      'dataNascimento'
    ]);

    if (monetaryKeys.has(key)) {
      return this.formatCurrency(value);
    }

    if (dateKeys.has(key)) {
      return this.formatDateBR(value);
    }

    if (Array.isArray(value)) {
      return value.join(' / ');
    }

    return String(value);
  },

  /**
   * Formata datas para DD-MM-YYYY - Sempre no fuso horário de Brasília
   */
  formatDateBR(value) {
    if (!value) return '-';

    const pad = (num) => String(num).padStart(2, '0');
    
    const toBRWithTimezone = (date) => {
      // Usa Intl para pegar componentes da data no timezone de Brasília
      const options = { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit',
        timeZone: 'America/Sao_Paulo'
      };
      const formatted = new Intl.DateTimeFormat('pt-BR', options).format(date);
      const [dia, mes, ano] = formatted.split('/');
      return `${dia}-${mes}-${ano}`;
    };

    if (value?.toDate) {
      return toBRWithTimezone(value.toDate());
    }

    if (value?.toMillis) {
      const fromMillis = new Date(value.toMillis());
      if (!Number.isNaN(fromMillis.getTime())) {
        return toBRWithTimezone(fromMillis);
      }
    }

    if (value instanceof Date) {
      return toBRWithTimezone(value);
    }

    if (typeof value === 'object') {
      const seconds = typeof value.seconds === 'number'
        ? value.seconds
        : (typeof value._seconds === 'number' ? value._seconds : null);
      const nanoseconds = typeof value.nanoseconds === 'number'
        ? value.nanoseconds
        : (typeof value._nanoseconds === 'number' ? value._nanoseconds : 0);
      if (seconds !== null) {
        const fromSerialized = new Date((seconds * 1000) + Math.floor(nanoseconds / 1000000));
        if (!Number.isNaN(fromSerialized.getTime())) {
          return toBRWithTimezone(fromSerialized);
        }
      }
    }

    const str = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const [year, month, day] = str.split('-');
      return `${day}-${month}-${year}`;
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      return str.replace(/\//g, '-');
    }

    if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
      return str;
    }

    if (/^\d{1,2}\/\d{4}$/.test(str)) {
      const [monthRaw, yearRaw] = str.split('/');
      const month = Number(monthRaw);
      const year = Number(yearRaw);
      if (month >= 1 && month <= 12 && year >= 1900) {
        const day = new Date(year, month, 0).getDate();
        return `${pad(day)}-${pad(month)}-${year}`;
      }
    }

    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return toBRWithTimezone(parsed);
    }

    return str;
  },

  normalizeDateInputValue(value) {
    if (!value) return '';

    if (value?.toDate) {
      const fromToDate = value.toDate();
      if (!Number.isNaN(fromToDate?.getTime?.())) {
        return fromToDate.toISOString().split('T')[0];
      }
    }

    if (value?.toMillis) {
      const fromMillis = new Date(value.toMillis());
      if (!Number.isNaN(fromMillis.getTime())) {
        return fromMillis.toISOString().split('T')[0];
      }
    }

    if (value instanceof Date) {
      if (!Number.isNaN(value.getTime())) {
        return value.toISOString().split('T')[0];
      }
      return '';
    }

    if (typeof value === 'object') {
      const seconds = typeof value.seconds === 'number'
        ? value.seconds
        : (typeof value._seconds === 'number' ? value._seconds : null);
      const nanoseconds = typeof value.nanoseconds === 'number'
        ? value.nanoseconds
        : (typeof value._nanoseconds === 'number' ? value._nanoseconds : 0);
      if (seconds !== null) {
        const fromSerialized = new Date((seconds * 1000) + Math.floor(nanoseconds / 1000000));
        if (!Number.isNaN(fromSerialized.getTime())) {
          return fromSerialized.toISOString().split('T')[0];
        }
      }
    }

    const str = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(str)) {
      const [day, month, year] = str.split(/[-/]/);
      return `${year}-${month}-${day}`;
    }

    if (/^\d{1,2}\/\d{4}$/.test(str)) {
      const [monthRaw, yearRaw] = str.split('/');
      const month = Number(monthRaw);
      const year = Number(yearRaw);
      if (month >= 1 && month <= 12 && year >= 1900) {
        const day = new Date(year, month, 0).getDate();
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().split('T')[0];
  },

  getTodayDateInputValue() {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Formata input de moeda
   */
  formatCurrencyInput(value) {
    let cleaned = value.replace(/[^\d,]/g, '');
    const parts = cleaned.split(',');
    if (parts.length > 2) {
      cleaned = parts[0] + ',' + parts.slice(1).join('');
    }
    if (parts.length === 2 && parts[1].length > 2) {
      cleaned = parts[0] + ',' + parts[1].substring(0, 2);
    }
    return cleaned;
  },

  /**
   * Formata tamanho de arquivo
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  /**
   * Formata label de campo
   */
  formatFieldLabel(key) {
    const labels = {
      nome: 'Nome',
      cliente: 'Cliente',
      cpf: 'CPF',
      dataEntrada: 'Data de Entrada',
      dataAprovacao: 'Data de Aprovacao',
      vencSicaq: 'Vencimento SICAQ',
      construtora: 'Construtora',
      empreendimento: 'Empreendimento',
      corretor: 'Corretor',
      gerenteImobiliaria: 'Gerente/Imobiliaria',
      analistaAprovacao: 'Analista Aprovacao',
      situacao: 'Situacao',
      pendencia: 'Pendencia',
      renda: 'Renda',
      cartaFinanciamento: 'Carta de Financiamento',
      valorFinanciamento: 'Valor Financiamento',
      prazoMeses: 'Prazo (meses)',
      valorImovel: 'Valor do Imovel',
      prestacao: 'Prestacao',
      resultadoAvaliacao: 'Resultado da Avaliacao',
      validadeInicio: 'Validade (Inicio)',
      validadeFim: 'Validade (Fim)',
      codigoAvaliacao: 'Codigo Avaliacao',
      codigoProposta: 'Codigo Proposta',
      protocoloCadastro: 'Protocolo do Cadastro',
      agenciaRelacionamento: 'Agencia de Relacionamento',
      origemRecurso: 'Origem de Recurso',
      modalidade: 'Modalidade',
      produto: 'Produto',
      indexador: 'Indexador',
      sistemaAmortizacao: 'Sistema de Amortizacao',
      sistemaOriginador: 'Sistema Originador',
      convenio: 'Convenio',
      operadorCCA: 'Operador CCA',
      operadorIdentificacao: 'Identificacao do Operador',
      cpfParticipante: 'CPF Participante',
      participante: 'Participante',
      rendaLiquidaTotal: 'Renda Liquida Total',
      rendaBrutaTotal: 'Renda Bruta Total',
      rendaLiquidaProponente: 'Renda Liquida Proponente',
      rendaBrutaProponente: 'Renda Bruta Proponente',
      rendaLiquidaParticipante: 'Renda Liquida Participante',
      rendaBrutaParticipante: 'Renda Bruta Participante',
      rendaLiquidaInformal: 'Renda Liquida Informal',
      atividadeInformal: 'Atividade Informal',
      dataInicioInformal: 'Data Inicio Atividade Informal',
      dataNascimento: 'Data de Nascimento',
      estadoCivil: 'Estado Civil',
      nacionalidade: 'Nacionalidade',
      naturalidade: 'Naturalidade',
      nomeMae: 'Nome da Mae',
      nomePai: 'Nome do Pai',
      sexo: 'Sexo',
      endereco: 'Endereco',
      logradouro: 'Logradouro',
      numero: 'Numero',
      complemento: 'Complemento',
      bairro: 'Bairro',
      municipio: 'Municipio',
      uf: 'UF',
      cep: 'CEP',
      telefone: 'Telefone',
      email: 'Email'
    };
    return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
  },

  /**
   * Escapa HTML
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// Exporta como default tambem para manter compatibilidade
export default AddAprovacaoModal;
