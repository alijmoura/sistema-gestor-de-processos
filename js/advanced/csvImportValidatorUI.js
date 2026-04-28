/**
 * @file csvImportValidatorUI.js
 * @description Interface do usuário para importação avançada de CSV com validação
 */

import csvImportValidator from './csvImportValidatorService.js';

class CsvImportValidatorUI {
  constructor() {
    this.modal = null;
    this.currentStep = 1;
    this.analysisResult = null;
    this.selectedRows = new Set();
    this.selectedStatus = null;
  }

  /**
   * Inicializa a UI (chamada quando o módulo é carregado)
   */
  init() {
    this._createModal();
    this._attachEventListeners();
    console.log(' CsvImportValidatorUI inicializado');
  }

  /**
   * Abre o modal de importação
   */
  open() {
    if (!this.modal) {
      this._createModal();
    }
    this._resetToStep(1);
    if (window.bootstrap?.Modal) {
      window.bootstrap.Modal.getOrCreateInstance(this.modal).show();
    } else {
      this.modal.classList.add('show');
      this.modal.style.display = 'block';
    }
  }

  /**
   * Fecha o modal
   */
  close() {
    if (!this.modal) return;
    if (window.bootstrap?.Modal) {
      window.bootstrap.Modal.getOrCreateInstance(this.modal).hide();
    } else {
      this.modal.classList.remove('show');
      this.modal.style.display = 'none';
      this._resetToStep(1);
    }
  }

  // ======================= CRIAÇÃO DO MODAL =======================

  _createModal() {
    // Remove modal existente se houver
    const existing = document.getElementById('modal-csv-validator');
    if (existing) existing.remove();

    const modalHtml = `
      <div id="modal-csv-validator" class="modal fade" tabindex="-1" aria-labelledby="modal-csv-validator-title" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable csv-validator-dialog">
          <div class="modal-content modern-modal">
          <div class="modal-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
            <h2 id="modal-csv-validator-title" class="modal-title mb-0 d-flex align-items-center gap-2">
              <i class="bi bi-file-earmark-spreadsheet text-primary"></i> 
              Importação Avançada de CSV
            </h2>
            <button type="button" class="btn-close-modern" id="csv-validator-close-btn" data-bs-dismiss="modal" aria-label="Fechar">×</button>
          </div>
          
          <div class="modal-body">
            <!-- Step 1: Upload do arquivo -->
            <div id="csv-validator-step-1" class="csv-validator-step">
              <div class="step-header mb-4">
                <span class="step-indicator active">1</span>
                <span class="step-indicator">2</span>
                <span class="step-indicator">3</span>
              </div>
              
              <div class="alert alert-info mb-4">
                <i class="bi bi-info-circle me-2"></i>
                <strong>Importação Inteligente:</strong> Esta ferramenta analisa seu arquivo CSV, 
                converte automaticamente datas e valores monetários, e permite escolher o status de destino.
              </div>
              
              <div class="upload-area p-4 border rounded text-center mb-4" id="csv-validator-dropzone">
                <i class="bi bi-cloud-upload display-4 text-muted mb-3"></i>
                <p class="mb-2">Arraste um arquivo CSV aqui ou clique para selecionar</p>
                <input type="file" id="csv-validator-file-input" accept=".csv" class="d-none">
                <button type="button" class="btn btn-primary" id="csv-validator-browse-btn">
                  <i class="bi bi-folder2-open me-2"></i>Selecionar Arquivo
                </button>
              </div>
              
              <div id="csv-validator-file-info" class="d-none mb-4">
                <div class="card">
                  <div class="card-body">
                    <h6 class="card-title"><i class="bi bi-file-earmark-check me-2"></i>Arquivo Selecionado</h6>
                    <p id="csv-validator-file-name" class="mb-1"></p>
                    <small id="csv-validator-file-size" class="text-muted"></small>
                  </div>
                </div>
              </div>
              
              <div id="csv-validator-analysis-progress" class="d-none">
                <div class="d-flex align-items-center gap-3 p-3 bg-light rounded">
                  <div class="spinner-border spinner-border-sm text-primary" role="status">
                    <span class="visually-hidden">Analisando...</span>
                  </div>
                  <span>Analisando arquivo CSV com IA...</span>
                </div>
              </div>
              
              <div class="modal-actions d-flex justify-content-end gap-2 mt-4">
                <button type="button" class="btn btn-secondary" id="csv-validator-cancel-btn" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-primary" id="csv-validator-analyze-btn" disabled>
                  <i class="bi bi-cpu me-2"></i>Analisar Arquivo
                </button>
              </div>
            </div>
            
            <!-- Step 2: Configuração e Preview -->
            <div id="csv-validator-step-2" class="csv-validator-step d-none">
              <div class="step-header mb-4">
                <span class="step-indicator completed">1</span>
                <span class="step-indicator active">2</span>
                <span class="step-indicator">3</span>
              </div>
              
              <div class="row mb-4">
                <div class="col-md-6">
                  <div class="card h-100">
                    <div class="card-header">
                      <i class="bi bi-bar-chart me-2"></i>Estatísticas
                    </div>
                    <div class="card-body">
                      <ul id="csv-validator-stats" class="list-unstyled mb-0">
                        <li><strong>Total de registros:</strong> <span id="stat-total">0</span></li>
                        <li><strong>Colunas:</strong> <span id="stat-columns">0</span></li>
                        <li><strong>Processos c/ múltiplos participantes:</strong> <span id="stat-multi-buyers" class="text-info">0</span></li>
                        <li><strong>Status únicos:</strong> <span id="stat-statuses">0</span></li>
                        <li><strong>Avisos:</strong> <span id="stat-warnings" class="text-warning">0</span></li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="card h-100">
                    <div class="card-header">
                      <i class="bi bi-gear me-2"></i>Configuração de Status
                    </div>
                    <div class="card-body">
                      <div class="mb-3">
                        <label class="form-label">Status de destino para todos os registros:</label>
                        <select id="csv-validator-target-status" class="form-select">
                          <option value="">-- Manter status original do CSV --</option>
                        </select>
                        <small class="text-muted">Deixe em branco para usar o status de cada linha do CSV</small>
                      </div>
                      <div id="csv-validator-status-preview" class="small"></div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="card mb-4">
                <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <span><i class="bi bi-table me-2"></i>Preview dos Dados <small class="text-muted">(amostra de 50 linhas)</small></span>
                  <div class="d-flex align-items-center gap-3">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" id="csv-validator-show-all-cols">
                      <label class="form-check-label small" for="csv-validator-show-all-cols">Todas as colunas</label>
                    </div>
                    <div class="form-check">
                      <input class="form-check-input" type="checkbox" id="csv-validator-select-all" checked>
                      <label class="form-check-label" for="csv-validator-select-all">Selecionar todos</label>
                    </div>
                  </div>
                </div>
                <div class="card-body p-0">
                  <div id="csv-validator-column-info" class="small text-muted p-2 border-bottom bg-light"></div>
                  <div class="table-responsive" style="max-height: 400px; overflow: auto;">
                    <table class="table table-sm table-hover table-bordered mb-0" id="csv-validator-preview-table">
                      <thead class="sticky-top bg-white">
                        <tr id="csv-validator-preview-header"></tr>
                      </thead>
                      <tbody id="csv-validator-preview-body"></tbody>
                    </table>
                  </div>
                </div>
              </div>
              
              <div id="csv-validator-warnings" class="d-none mb-4">
                <div class="alert alert-warning">
                  <h6><i class="bi bi-exclamation-triangle me-2"></i>Avisos de Validação</h6>
                  <ul id="csv-validator-warnings-list" class="mb-0 small"></ul>
                </div>
              </div>
              
              <div class="modal-actions d-flex justify-content-between mt-4">
                <button type="button" class="btn btn-outline-secondary" id="csv-validator-back-btn">
                  <i class="bi bi-arrow-left me-2"></i>Voltar
                </button>
                <div class="d-flex gap-2">
                  <button type="button" class="btn btn-secondary" id="csv-validator-cancel-btn-2" data-bs-dismiss="modal">Cancelar</button>
                  <button type="button" class="btn btn-success" id="csv-validator-import-btn">
                    <i class="bi bi-download me-2"></i>Importar <span id="csv-validator-import-count">0</span> Registros
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Step 3: Progresso e Resultado -->
            <div id="csv-validator-step-3" class="csv-validator-step d-none">
              <div class="step-header mb-4">
                <span class="step-indicator completed">1</span>
                <span class="step-indicator completed">2</span>
                <span class="step-indicator active">3</span>
              </div>
              
              <div id="csv-validator-import-progress" class="text-center p-5">
                <div class="spinner-border text-primary mb-4" role="status" style="width: 3rem; height: 3rem;">
                  <span class="visually-hidden">Importando...</span>
                </div>
                <h5>Importando registros...</h5>
                <p class="text-muted" id="csv-validator-progress-text">Aguarde enquanto os dados são processados.</p>
                <div class="progress mt-4" style="height: 25px;">
                  <div class="progress-bar progress-bar-striped progress-bar-animated" 
                       id="csv-validator-progress-bar" 
                       role="progressbar" 
                       style="width: 0%;">0%</div>
                </div>
              </div>
              
              <div id="csv-validator-import-result" class="d-none text-center p-5">
                <div id="csv-validator-result-icon" class="mb-4"></div>
                <h4 id="csv-validator-result-title"></h4>
                <p id="csv-validator-result-message" class="text-muted"></p>
                <div id="csv-validator-result-details" class="mt-4"></div>
              </div>
              
              <div class="modal-actions d-flex justify-content-center gap-2 mt-4" id="csv-validator-final-actions" style="display: none !important;">
                <button type="button" class="btn btn-outline-secondary" id="csv-validator-new-import-btn">
                  <i class="bi bi-plus-circle me-2"></i>Nova Importação
                </button>
                <button type="button" class="btn btn-primary" id="csv-validator-finish-btn">
                  <i class="bi bi-check-circle me-2"></i>Concluir
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    this.modal = document.getElementById('modal-csv-validator');
    
    // Adiciona estilos CSS se ainda não existirem
    this._addStyles();
  }

  _addStyles() {
    if (document.getElementById('csv-validator-styles')) return;
    
    const styles = `
      <style id="csv-validator-styles">
        #modal-csv-validator .modal-dialog.csv-validator-dialog {
          max-width: 1100px;
        }

        #modal-csv-validator .modal-content {
          max-height: 90vh;
        }

        #modal-csv-validator .modal-body {
          max-height: calc(90vh - 150px);
          overflow-y: auto;
        }

        #modal-csv-validator .step-header {
          display: flex;
          justify-content: center;
          gap: 2rem;
        }
        
        #modal-csv-validator .step-indicator {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #e9ecef;
          color: #6c757d;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          transition: all 0.3s ease;
        }
        
        #modal-csv-validator .step-indicator.active {
          background: var(--cor-primaria, #0d6efd);
          color: white;
          box-shadow: 0 0 0 4px rgba(13, 110, 253, 0.25);
        }
        
        #modal-csv-validator .step-indicator.completed {
          background: #198754;
          color: white;
        }
        
        #modal-csv-validator .upload-area {
          border: 2px dashed #dee2e6;
          background: #f8f9fa;
          transition: all 0.3s ease;
          cursor: pointer;
        }
        
        #modal-csv-validator .upload-area:hover,
        #modal-csv-validator .upload-area.dragover {
          border-color: var(--cor-primaria, #0d6efd);
          background: #e7f1ff;
        }
        
        #modal-csv-validator .table th {
          font-size: 0.75rem;
          white-space: nowrap;
          background: #f8f9fa;
        }
        
        #modal-csv-validator .table td {
          font-size: 0.8rem;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        #modal-csv-validator .table td:first-child {
          width: 40px;
        }
        
        #modal-csv-validator .status-badge {
          font-size: 0.7rem;
          padding: 2px 6px;
          border-radius: 4px;
          background: #e9ecef;
        }
        
        #modal-csv-validator .date-converted {
          color: #198754;
        }
        
        #modal-csv-validator .currency-converted {
          color: #0d6efd;
        }
        
        #modal-csv-validator .value-invalid {
          color: #dc3545;
          text-decoration: line-through;
        }
      </style>
    `;
    
    document.head.insertAdjacentHTML('beforeend', styles);
  }

  // ======================= EVENT LISTENERS =======================

  _attachEventListeners() {
    if (!this.modal) return;

    // Fechar modal
    this.modal.querySelector('#csv-validator-finish-btn')?.addEventListener('click', () => this._finish());

    // Resetar quando o modal for fechado
    this.modal.addEventListener('hidden.bs.modal', () => this._resetToStep(1));
    
    // Seleção de arquivo
    const fileInput = this.modal.querySelector('#csv-validator-file-input');
    const browseBtn = this.modal.querySelector('#csv-validator-browse-btn');
    const dropzone = this.modal.querySelector('#csv-validator-dropzone');
    
    // Importante: stopPropagation no botão para evitar que o clique propague para o dropzone
    browseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    });
    dropzone?.addEventListener('click', () => fileInput?.click());
    
    fileInput?.addEventListener('change', (e) => this._handleFileSelect(e.target.files[0]));
    
    // Drag and drop
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    
    dropzone?.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer?.files[0];
      if (file) this._handleFileSelect(file);
    });
    
    // Botões de navegação
    this.modal.querySelector('#csv-validator-analyze-btn')?.addEventListener('click', () => this._analyzeFile());
    this.modal.querySelector('#csv-validator-back-btn')?.addEventListener('click', () => this._resetToStep(1));
    this.modal.querySelector('#csv-validator-import-btn')?.addEventListener('click', () => this._startImport());
    this.modal.querySelector('#csv-validator-new-import-btn')?.addEventListener('click', () => this._resetToStep(1));
    
    // Select all checkbox
    this.modal.querySelector('#csv-validator-select-all')?.addEventListener('change', (e) => {
      this._toggleSelectAll(e.target.checked);
    });
    
    // Toggle "Todas as colunas"
    this.modal.querySelector('#csv-validator-show-all-cols')?.addEventListener('change', () => {
      this._renderPreviewTable();
    });
    
    // Status target change
    this.modal.querySelector('#csv-validator-target-status')?.addEventListener('change', (e) => {
      this.selectedStatus = e.target.value || null;
      this._updateStatusPreview();
    });
  }

  // ======================= HANDLERS =======================

  _handleFileSelect(file) {
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this._showError('Por favor, selecione um arquivo CSV (.csv)');
      return;
    }
    
    // Atualiza info do arquivo
    const fileInfo = this.modal.querySelector('#csv-validator-file-info');
    const fileName = this.modal.querySelector('#csv-validator-file-name');
    const fileSize = this.modal.querySelector('#csv-validator-file-size');
    
    fileName.textContent = file.name;
    fileSize.textContent = this._formatFileSize(file.size);
    fileInfo.classList.remove('d-none');
    
    // Habilita botão de análise
    this.modal.querySelector('#csv-validator-analyze-btn').disabled = false;
    
    // Armazena arquivo
    this._selectedFile = file;
  }

  async _analyzeFile() {
    if (!this._selectedFile) return;
    
    const progressDiv = this.modal.querySelector('#csv-validator-analysis-progress');
    const analyzeBtn = this.modal.querySelector('#csv-validator-analyze-btn');
    
    progressDiv.classList.remove('d-none');
    analyzeBtn.disabled = true;
    
    try {
      const csvText = await this._selectedFile.text();
      this.analysisResult = await csvImportValidator.analyzeCSV(csvText, this._selectedFile.name);
      
      if (!this.analysisResult.success) {
        throw new Error(this.analysisResult.error);
      }
      
      this._showStep2();
      
    } catch (error) {
      console.error('Erro na análise:', error);
      this._showError(`Erro ao analisar arquivo: ${error.message}`);
    } finally {
      progressDiv.classList.add('d-none');
      analyzeBtn.disabled = false;
    }
  }

  _showStep2() {
    this.modal.querySelector('#csv-validator-step-1').classList.add('d-none');
    this.modal.querySelector('#csv-validator-step-2').classList.remove('d-none');
    
    // Inicializa selectedRows com TODOS os registros (não apenas o preview)
    const totalRecords = this.analysisResult.totalRecords;
    this.selectedRows = new Set(Array.from({ length: totalRecords }, (_, i) => i));
    this.totalRecords = totalRecords;
    
    // Calcula estatísticas de participantes (amostra do preview)
    const previewData = csvImportValidator.getPreviewData(100);
    const multipleParticipants = previewData.filter(r => r.totalCompradores > 1).length;
    
    // Atualiza estatísticas
    this.modal.querySelector('#stat-total').textContent = this.analysisResult.totalRecords;
    this.modal.querySelector('#stat-columns').textContent = this.analysisResult.totalColumns;
    this.modal.querySelector('#stat-multi-buyers').textContent = multipleParticipants > 0 ? `~${multipleParticipants}+` : '0';
    this.modal.querySelector('#stat-statuses').textContent = this.analysisResult.uniqueStatuses.length;
    this.modal.querySelector('#stat-warnings').textContent = this.analysisResult.validationWarnings.length;
    
    // Popula select de status
    this._populateStatusSelect();
    
    // Renderiza tabela de preview
    this._renderPreviewTable();
    
    // Mostra avisos se houver
    const validation = csvImportValidator.validate();
    if (validation.warnings.length > 0) {
      const warningsDiv = this.modal.querySelector('#csv-validator-warnings');
      const warningsList = this.modal.querySelector('#csv-validator-warnings-list');
      warningsList.innerHTML = validation.warnings.slice(0, 20).map(w => `<li>${w}</li>`).join('');
      if (validation.warnings.length > 20) {
        warningsList.innerHTML += `<li><em>...e mais ${validation.warnings.length - 20} avisos</em></li>`;
      }
      warningsDiv.classList.remove('d-none');
    }
    
    // Atualiza contador de importação
    this._updateImportCount();
  }

  _populateStatusSelect() {
    const select = this.modal.querySelector('#csv-validator-target-status');
    select.innerHTML = '<option value="">-- Manter status original do CSV --</option>';
    
    // Agrupa por stage
    const statusesByStage = {};
    this.analysisResult.availableStatuses.forEach(s => {
      const stage = s.stage || 'Outros';
      if (!statusesByStage[stage]) statusesByStage[stage] = [];
      statusesByStage[stage].push(s);
    });
    
    Object.entries(statusesByStage).forEach(([stage, statuses]) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = stage;
      statuses.forEach(s => {
        const option = document.createElement('option');
        option.value = s.text;
        option.textContent = s.text;
        optgroup.appendChild(option);
      });
      select.appendChild(optgroup);
    });
    
    // Mostra preview de status originais
    this._updateStatusPreview();
  }

  _updateStatusPreview() {
    const preview = this.modal.querySelector('#csv-validator-status-preview');
    
    if (this.selectedStatus) {
      preview.innerHTML = `
        <div class="alert alert-success p-2 mb-0">
          <i class="bi bi-check-circle me-1"></i>
          Todos os registros serão importados com status: <strong>${this.selectedStatus}</strong>
        </div>
      `;
    } else {
      const statusCount = this.analysisResult.uniqueStatuses.slice(0, 5)
        .map(s => `<span class="badge bg-secondary me-1">${s.status} (${s.count})</span>`)
        .join('');
      
      preview.innerHTML = `
        <div class="mt-2">
          <small class="text-muted">Status encontrados no CSV:</small><br>
          ${statusCount}
          ${this.analysisResult.uniqueStatuses.length > 5 ? `<span class="text-muted">...e mais ${this.analysisResult.uniqueStatuses.length - 5}</span>` : ''}
        </div>
      `;
    }
  }

  _renderPreviewTable() {
    const headerRow = this.modal.querySelector('#csv-validator-preview-header');
    const tbody = this.modal.querySelector('#csv-validator-preview-body');
    const columnInfo = this.modal.querySelector('#csv-validator-column-info');
    const showAllCols = this.modal.querySelector('#csv-validator-show-all-cols')?.checked || false;
    
    // Obtém dados do preview
    const previewData = csvImportValidator.getPreviewData(50);
    
    // Colunas resumidas para exibição padrão
    const summaryColumns = [
      { key: '_selected', label: '' },
      { key: 'clientePrincipal', label: 'Cliente Principal' },
      { key: 'totalCompradores', label: 'Part.' },
      { key: 'empreendimento', label: 'Empreendimento' },
      { key: 'statusOriginal', label: 'Status Original' },
      { key: 'vendedorConstrutora', label: 'Construtora' },
      { key: 'nContratoCEF', label: 'Contrato CEF' },
      { key: 'dataMinuta', label: 'Data Minuta' },
      { key: 'dataAssinaturaCliente', label: 'Data Assinatura' },
      { key: 'valorITBI', label: 'Valor ITBI' }
    ];
    
    // Colunas dinâmicas baseadas no que foi identificado no CSV
    let displayColumns;
    
    if (showAllCols && this.analysisResult) {
      // Mostra todas as colunas identificadas
      const allMappedHeaders = this.analysisResult.mappedHeaders || [];
      displayColumns = [{ key: '_selected', label: '' }];
      
      allMappedHeaders.forEach((mappedKey, index) => {
        // Pula campos ignorados (começam com _)
        if (mappedKey.startsWith('_')) return;
        
        const originalHeader = this.analysisResult.headers[index] || mappedKey;
        displayColumns.push({
          key: mappedKey,
          label: originalHeader.length > 20 ? originalHeader.substring(0, 17) + '...' : originalHeader,
          fullLabel: originalHeader
        });
      });
    } else {
      displayColumns = summaryColumns;
    }
    
    // Exibe info das colunas e total de registros
    const totalCols = this.analysisResult?.mappedHeaders?.filter(h => !h.startsWith('_')).length || 0;
    const totalRecs = this.totalRecords || this.analysisResult?.totalRecords || 0;
    const previewLimit = 50;
    
    columnInfo.innerHTML = `
      <i class="bi bi-columns-gap me-1"></i><strong>${totalCols}</strong> colunas | 
      <i class="bi bi-list-ol me-1"></i><strong>${totalRecs}</strong> registros total |
      <span class="text-info">Preview: ${Math.min(previewLimit, totalRecs)} linhas</span> |
      <span class="text-primary">${showAllCols ? 'Todas as colunas' : 'Colunas principais'}</span>
    `;
    
    // Header
    headerRow.innerHTML = displayColumns.map(col => {
      const tooltip = col.fullLabel ? `title="${this._escapeHtml(col.fullLabel)}"` : '';
      return `<th class="text-nowrap" ${tooltip}>${col.label}</th>`;
    }).join('');
    
    // Body - mostra apenas preview (não altera selectedRows que já contém TODOS)
    const isAllSelected = this.selectedRows.size === totalRecs;
    
    tbody.innerHTML = previewData.map((row, index) => {
      const isSelected = this.selectedRows.has(index);
      const cells = displayColumns.map(col => {
        if (col.key === '_selected') {
          return `<td class="text-center"><input type="checkbox" class="row-checkbox" data-index="${index}" ${isSelected ? 'checked' : ''}></td>`;
        }
        
        const value = row[col.key];
        const displayValue = row[`${col.key}_display`];
        
        // Coluna de total de compradores
        if (col.key === 'totalCompradores') {
          const total = row.totalCompradores || 1;
          const tooltip = row.compradores_display || row.clientePrincipal || '';
          const badgeClass = total > 1 ? 'bg-info' : 'bg-secondary';
          return `<td class="text-center" title="${this._escapeHtml(tooltip)}"><span class="badge ${badgeClass}">${total}</span></td>`;
        }
        
        // Campo de data convertido
        if (displayValue && value instanceof Date) {
          return `<td class="date-converted text-nowrap" title="Convertido para Timestamp">${displayValue}</td>`;
        }
        
        // Campo monetário convertido
        if (displayValue && typeof value === 'number') {
          return `<td class="currency-converted text-nowrap" title="Valor numérico: ${value}">${displayValue}</td>`;
        }
        
        // Campo inválido
        if (row[`_${col.key}_invalid`]) {
          return `<td class="value-invalid text-nowrap" title="Valor inválido: não foi possível converter">${row[`_${col.key}_original`] || '-'}</td>`;
        }
        
        // Texto normal - trunca se muito longo
        const textValue = value || '-';
        const truncated = String(textValue).length > 30 ? String(textValue).substring(0, 27) + '...' : textValue;
        return `<td class="text-nowrap" title="${this._escapeHtml(textValue)}">${truncated}</td>`;
      }).join('');
      
      return `<tr>${cells}</tr>`;
    }).join('');
    
    // Atualiza estado do checkbox "Selecionar todos"
    const selectAllCheckbox = this.modal.querySelector('#csv-validator-select-all');
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = isAllSelected;
    }
    
    // Event listeners para checkboxes individuais (apenas afetam as linhas do preview)
    tbody.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        if (e.target.checked) {
          this.selectedRows.add(index);
        } else {
          this.selectedRows.delete(index);
        }
        this._updateImportCount();
      });
    });
  }
  
  _escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  _toggleSelectAll(checked) {
    const totalRecords = this.totalRecords || this.analysisResult?.totalRecords || 0;
    
    if (checked) {
      // Seleciona TODOS os registros (não apenas os visíveis no preview)
      this.selectedRows = new Set(Array.from({ length: totalRecords }, (_, i) => i));
    } else {
      // Desmarca todos
      this.selectedRows = new Set();
    }
    
    // Atualiza checkboxes visíveis no preview
    const checkboxes = this.modal.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
      cb.checked = checked;
    });
    
    this._updateImportCount();
  }

  _updateImportCount() {
    const count = this.selectedRows.size;
    this.modal.querySelector('#csv-validator-import-count').textContent = count;
    this.modal.querySelector('#csv-validator-import-btn').disabled = count === 0;
  }

  async _startImport() {
    if (this.selectedRows.size === 0) return;
    
    this.modal.querySelector('#csv-validator-step-2').classList.add('d-none');
    this.modal.querySelector('#csv-validator-step-3').classList.remove('d-none');
    
    const progressBar = this.modal.querySelector('#csv-validator-progress-bar');
    const progressText = this.modal.querySelector('#csv-validator-progress-text');
    
    try {
      // Obtém dados para importação
      const allData = csvImportValidator.getDataForImport(this.selectedStatus);
      
      // Filtra apenas registros selecionados
      const dataToImport = allData.filter((_, index) => this.selectedRows.has(index));
      
      progressText.textContent = `Preparando ${dataToImport.length} registros para importação...`;
      progressBar.style.width = '10%';
      progressBar.textContent = '10%';
      
      // Importa usando firestoreService
      if (typeof window.firestoreService?.batchImportContracts === 'function') {
        progressText.textContent = 'Enviando dados para o Firebase...';
        progressBar.style.width = '30%';
        progressBar.textContent = '30%';
        
        const result = await window.firestoreService.batchImportContracts(dataToImport, []);
        
        progressBar.style.width = '100%';
        progressBar.textContent = '100%';
        
        this._showResult(true, {
          importedCount: result.importedCount || dataToImport.length,
          totalBatches: result.totalBatches || 1
        });
        
      } else {
        throw new Error('Serviço de importação não disponível (firestoreService)');
      }
      
    } catch (error) {
      console.error('Erro na importação:', error);
      this._showResult(false, { error: error.message });
    }
  }

  _showResult(success, data) {
    const progressDiv = this.modal.querySelector('#csv-validator-import-progress');
    const resultDiv = this.modal.querySelector('#csv-validator-import-result');
    const actionsDiv = this.modal.querySelector('#csv-validator-final-actions');
    
    progressDiv.classList.add('d-none');
    resultDiv.classList.remove('d-none');
    actionsDiv.style.display = 'flex !important';
    actionsDiv.classList.remove('d-none');
    
    const iconEl = this.modal.querySelector('#csv-validator-result-icon');
    const titleEl = this.modal.querySelector('#csv-validator-result-title');
    const messageEl = this.modal.querySelector('#csv-validator-result-message');
    const detailsEl = this.modal.querySelector('#csv-validator-result-details');
    
    if (success) {
      iconEl.innerHTML = '<i class="bi bi-check-circle-fill text-success" style="font-size: 4rem;"></i>';
      titleEl.textContent = 'Importação Concluída!';
      messageEl.textContent = `${data.importedCount} registros foram importados com sucesso.`;
      detailsEl.innerHTML = `
        <div class="alert alert-success">
          <i class="bi bi-info-circle me-2"></i>
          Processado em ${data.totalBatches} lote(s). 
          ${this.selectedStatus ? `Todos com status: <strong>${this.selectedStatus}</strong>` : 'Mantendo status originais do CSV'}
        </div>
      `;
    } else {
      iconEl.innerHTML = '<i class="bi bi-x-circle-fill text-danger" style="font-size: 4rem;"></i>';
      titleEl.textContent = 'Erro na Importação';
      messageEl.textContent = 'Ocorreu um erro durante a importação.';
      detailsEl.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>
          ${data.error}
        </div>
      `;
    }
  }

  _finish() {
    this.close();
    
    // Recarrega a interface para mostrar novos dados
    if (typeof window.initializeDashboard === 'function') {
      setTimeout(() => window.initializeDashboard(), 500);
    } else {
      setTimeout(() => window.location.reload(), 1000);
    }
  }

  // ======================= HELPERS =======================

  _resetToStep(step) {
    this.modal.querySelectorAll('.csv-validator-step').forEach(s => s.classList.add('d-none'));
    this.modal.querySelector(`#csv-validator-step-${step}`).classList.remove('d-none');
    this.currentStep = step;
    
    if (step === 1) {
      this._resetState();
    }
  }

  _resetState() {
    this._selectedFile = null;
    this.analysisResult = null;
    this.selectedRows = new Set();
    this.selectedStatus = null;
    
    // Reset UI
    this.modal.querySelector('#csv-validator-file-info')?.classList.add('d-none');
    this.modal.querySelector('#csv-validator-file-input').value = '';
    this.modal.querySelector('#csv-validator-analyze-btn').disabled = true;
    this.modal.querySelector('#csv-validator-warnings')?.classList.add('d-none');
    this.modal.querySelector('#csv-validator-import-progress')?.classList.remove('d-none');
    this.modal.querySelector('#csv-validator-import-result')?.classList.add('d-none');
    this.modal.querySelector('#csv-validator-final-actions')?.classList.add('d-none');
  }

  _formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  _showError(message) {
    if (typeof window.UI?.showNotification === 'function') {
      window.UI.showNotification(message, 'error');
    } else {
      alert(message);
    }
  }
}

// ======================= EXPORTAÇÃO E INICIALIZAÇÃO =======================

const csvImportValidatorUI = new CsvImportValidatorUI();

// Expõe globalmente
if (typeof window !== 'undefined') {
  window.csvImportValidatorUI = csvImportValidatorUI;
  
  // Auto-inicializa quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => csvImportValidatorUI.init());
  } else {
    csvImportValidatorUI.init();
  }
}

export default csvImportValidatorUI;
export { CsvImportValidatorUI };
