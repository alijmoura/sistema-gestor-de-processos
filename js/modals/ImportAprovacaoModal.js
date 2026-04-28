/**
 * @file ImportAprovacaoModal.js
 * @description Modal para importacao de aprovacoes via CSV
 */

import aprovacaoService from '../aprovacaoService.js';
import permissionsService, { PERMISSION_MODULES, PERMISSION_ACTIONS } from '../permissionsService.js';
import { auth } from '../auth.js';

const MODAL_ID = 'import-aprovacao-modal';

let modalInstance = null;
let parsedData = [];
let columnMapping = {};
let onImportComplete = null;
let rawCsvContent = '';
let currentFileName = '';

// Mapeamento esperado das colunas do CSV
const EXPECTED_COLUMNS = {
  cpf: ['CPF', 'cpf', 'CPFs', 'cpfs'],
  cliente: ['CLIENTE', 'cliente', 'Nome', 'nome', 'NOME'],
  dataEntrada: ['DATA ENTRADA', 'dataEntrada', 'Data Entrada', 'DATA_ENTRADA'],
  dataAprovacao: ['DATA DE APROVACAO', 'DATA APROVACAO', 'dataAprovacao', 'Data Aprovacao', 'DATA_APROVACAO'],
  empreendimento: ['EMPREENDIMENTO', 'empreendimento', 'Empreendimento'],
  construtora: ['CONSTRUTORA', 'construtora', 'Construtora', 'VENDEDOR'],
  corretor: ['CORRETOR', 'corretor', 'Corretor'],
  gerenteImobiliaria: ['GERENTE', 'gerente', 'Gerente', 'IMOBILIARIA', 'imobiliaria'],
  analistaAprovacao: [
    'ANALISTA',
    'Analista',
    'analista',
    'ANALISTA APROVACAO',
    'ANALISTA APROVAÇÃO',
    'Analista Aprovacao',
    'Analista Aprovação',
    'analistaAprovacao'
  ],
  situacao: ['SITUACAO', 'situacao', 'Situacao', 'STATUS', 'status'],
  pendencia: ['PENDENCIA', 'pendencia', 'Pendencia', 'OBS', 'Observacao'],
  renda: ['RENDA', 'renda', 'Renda'],
  cartaFinanciamento: ['CARTA', 'carta', 'Carta', 'TIPO_CARTA', 'tipoFinanciamento'],
  valorFinanciamento: ['VALOR FINANCIAMENTO', 'valorFinanciamento', 'Valor Financiamento', 'FINANCIAMENTO'],
  prazo: ['PRAZO', 'prazo', 'Prazo', 'MESES', 'prazoMeses']
};

/**
 * Renderiza o modal no DOM
 */
function render() {
  const existing = document.getElementById(MODAL_ID);
  if (existing) {
    existing.remove();
  }

  const html = `
    <div class="modal fade" id="${MODAL_ID}" tabindex="-1" data-bs-backdrop="static">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-file-earmark-arrow-up me-2"></i>
              Importar Aprovacoes de CSV
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <!-- Step 1: Upload -->
            <div id="import-step-upload">
              <div class="text-center py-5">
                <i class="bi bi-cloud-upload display-1 text-muted"></i>
                <h5 class="mt-3">Selecione um arquivo CSV</h5>
                <p class="text-muted">O arquivo deve conter cabecalhos na primeira linha</p>

                <div class="my-4">
                  <input type="file" class="form-control d-none" id="import-csv-file" accept=".csv,.txt">
                  <label for="import-csv-file" class="btn btn-primary btn-lg">
                    <i class="bi bi-folder2-open me-2"></i>Escolher Arquivo
                  </label>
                </div>

                <div class="alert alert-info text-start mx-auto" style="max-width: 500px;">
                  <strong><i class="bi bi-info-circle me-1"></i>Formato esperado:</strong>
                  <ul class="mb-0 mt-2 small">
                    <li>Colunas: CPF, CLIENTE, DATA ENTRADA, SITUACAO, etc.</li>
                    <li>Separador: ponto-e-virgula (;) ou virgula (,)</li>
                    <li>Codificacao: UTF-8 ou ISO-8859-1</li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- Step 2: Preview & Mapping -->
            <div id="import-step-preview" class="d-none">
              <div class="mb-3">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <span id="import-file-name" class="fw-bold"></span>
                    <span id="import-row-count" class="text-muted ms-2"></span>
                  </div>
                  <button type="button" class="btn btn-outline-secondary btn-sm" id="import-change-file">
                    <i class="bi bi-arrow-repeat me-1"></i>Trocar arquivo
                  </button>
                </div>
              </div>

              <!-- Column Mapping -->
              <div class="card mb-3">
                <div class="card-header bg-light">
                  <i class="bi bi-diagram-3 me-2"></i>Mapeamento de Colunas
                  <span class="badge bg-secondary ms-2" id="mapping-status">0 mapeadas</span>
                </div>
                <div class="card-body">
                  <div class="row g-2" id="column-mapping-container">
                    <!-- Gerado dinamicamente -->
                  </div>
                </div>
              </div>

              <!-- Preview Table -->
              <div class="card">
                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                  <span><i class="bi bi-table me-2"></i>Pre-visualizacao (primeiras 10 linhas)</span>
                </div>
                <div class="card-body p-0">
                  <div class="table-responsive" style="max-height: 300px;">
                    <table class="table table-sm table-hover table-striped mb-0" id="import-preview-table">
                      <thead class="sticky-top bg-white">
                        <tr id="import-preview-header"></tr>
                      </thead>
                      <tbody id="import-preview-body"></tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <!-- Step 3: Importing -->
            <div id="import-step-progress" class="d-none">
              <div class="text-center py-5">
                <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;" role="status">
                  <span class="visually-hidden">Importando...</span>
                </div>
                <h5>Importando aprovacoes...</h5>
                <p class="text-muted">Por favor, aguarde. Nao feche esta janela.</p>

                <div class="progress mx-auto mt-4" style="max-width: 400px; height: 25px;">
                  <div class="progress-bar progress-bar-striped progress-bar-animated"
                       id="import-progress-bar" role="progressbar" style="width: 0%">
                    0%
                  </div>
                </div>

                <div class="mt-3">
                  <span id="import-progress-text" class="text-muted">0 de 0 registros</span>
                </div>
              </div>
            </div>

            <!-- Step 4: Complete -->
            <div id="import-step-complete" class="d-none">
              <div class="text-center py-5">
                <i class="bi bi-check-circle display-1 text-success"></i>
                <h5 class="mt-3">Importacao Concluida!</h5>

                <div class="row justify-content-center mt-4">
                  <div class="col-auto">
                    <div class="card text-success border-success">
                      <div class="card-body text-center">
                        <i class="bi bi-check-circle-fill fs-3"></i>
                        <h3 class="mb-0" id="import-success-count">0</h3>
                        <small>Importados</small>
                      </div>
                    </div>
                  </div>
                  <div class="col-auto">
                    <div class="card text-danger border-danger">
                      <div class="card-body text-center">
                        <i class="bi bi-x-circle-fill fs-3"></i>
                        <h3 class="mb-0" id="import-error-count">0</h3>
                        <small>Erros</small>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Error Details -->
                <div id="import-errors-container" class="d-none mt-4 text-start mx-auto" style="max-width: 600px;">
                  <div class="card border-danger">
                    <div class="card-header bg-danger text-white">
                      <i class="bi bi-exclamation-triangle me-2"></i>Detalhes dos Erros
                    </div>
                    <div class="card-body" style="max-height: 200px; overflow-y: auto;">
                      <ul class="mb-0 small" id="import-errors-list"></ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="import-btn-cancel">
              Cancelar
            </button>
            <button type="button" class="btn btn-primary d-none" id="import-btn-start">
              <i class="bi bi-play-fill me-1"></i>Iniciar Importacao
            </button>
            <button type="button" class="btn btn-success d-none" id="import-btn-finish" data-bs-dismiss="modal">
              <i class="bi bi-check me-1"></i>Concluir
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  // Bind events
  setupEventListeners();

  return document.getElementById(MODAL_ID);
}

/**
 * Configura event listeners
 */
function setupEventListeners() {
  const fileInput = document.getElementById('import-csv-file');
  const changeFileBtn = document.getElementById('import-change-file');
  const startBtn = document.getElementById('import-btn-start');
  const finishBtn = document.getElementById('import-btn-finish');

  fileInput?.addEventListener('change', handleFileSelect);
  changeFileBtn?.addEventListener('click', resetToUpload);
  startBtn?.addEventListener('click', startImport);

  finishBtn?.addEventListener('click', () => {
    if (onImportComplete) {
      onImportComplete();
    }
  });
}

/**
 * Manipula selecao de arquivo
 */
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  currentFileName = file.name || '';

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const content = evt.target.result;
      rawCsvContent = String(content || '');
      parseCSV(content, file.name);
    } catch (error) {
      console.error('[ImportAprovacaoModal] Erro ao ler arquivo:', error);
      alert('Erro ao ler o arquivo: ' + error.message);
    }
  };

  reader.onerror = () => {
    alert('Erro ao ler o arquivo.');
  };

  reader.readAsText(file, 'UTF-8');
}

/**
 * Parse do CSV
 */
function parseCSV(content, fileName) {
  // Detecta separador
  const firstLine = content.split('\n')[0];
  const separator = firstLine.includes(';') ? ';' : ',';

  // Parse linhas
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    alert('O arquivo deve conter pelo menos o cabecalho e uma linha de dados.');
    return;
  }

  // Cabecalhos
  const headers = parseCSVLine(lines[0], separator);

  // Dados
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], separator);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx];
      });
      data.push(row);
    }
  }

  parsedData = data;

  // Auto-mapeia colunas
  columnMapping = autoMapColumns(headers);

  // Mostra preview
  showPreview(fileName, headers, data);
}

/**
 * Parse de uma linha CSV considerando aspas
 */
function parseCSVLine(line, separator) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Mapeia colunas automaticamente
 */
function autoMapColumns(headers) {
  const mapping = {};

  for (const [field, aliases] of Object.entries(EXPECTED_COLUMNS)) {
    for (const header of headers) {
      const normalizedHeader = header.toLowerCase().trim();
      for (const alias of aliases) {
        if (normalizedHeader === alias.toLowerCase()) {
          mapping[field] = header;
          break;
        }
      }
      if (mapping[field]) break;
    }
  }

  return mapping;
}

/**
 * Mostra tela de preview
 */
function showPreview(fileName, headers, data) {
  // Esconde upload, mostra preview
  document.getElementById('import-step-upload').classList.add('d-none');
  document.getElementById('import-step-preview').classList.remove('d-none');
  document.getElementById('import-btn-start').classList.remove('d-none');

  // Info do arquivo
  document.getElementById('import-file-name').textContent = fileName;
  document.getElementById('import-row-count').textContent = `(${data.length} registros)`;

  // Renderiza mapeamento
  renderColumnMapping(headers);

  // Renderiza tabela de preview
  renderPreviewTable(headers, data.slice(0, 10));
}

/**
 * Renderiza seletores de mapeamento de colunas
 */
function renderColumnMapping(headers) {
  const container = document.getElementById('column-mapping-container');
  if (!container) return;

  const fields = [
    { key: 'cpf', label: 'CPF', required: true },
    { key: 'cliente', label: 'Cliente', required: true },
    { key: 'dataEntrada', label: 'Data Entrada', required: false },
    { key: 'dataAprovacao', label: 'Data Aprovacao', required: false },
    { key: 'situacao', label: 'Situacao', required: true },
    { key: 'construtora', label: 'Construtora', required: false },
    { key: 'empreendimento', label: 'Empreendimento', required: false },
    { key: 'corretor', label: 'Corretor', required: false },
    { key: 'analistaAprovacao', label: 'Analista', required: false },
    { key: 'renda', label: 'Renda', required: false },
    { key: 'valorFinanciamento', label: 'Valor Financ.', required: false }
  ];

  container.innerHTML = fields.map(field => `
    <div class="col-md-4 col-lg-3">
      <label class="form-label small mb-1">
        ${field.label}
        ${field.required ? '<span class="text-danger">*</span>' : ''}
      </label>
      <select class="form-select form-select-sm column-mapping-select" data-field="${field.key}">
        <option value="">-- Nao mapear --</option>
        ${headers.map(h => `
          <option value="${escapeHtml(h)}" ${columnMapping[field.key] === h ? 'selected' : ''}>
            ${escapeHtml(h)}
          </option>
        `).join('')}
      </select>
    </div>
  `).join('');

  // Eventos de mudanca
  container.querySelectorAll('.column-mapping-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const field = e.target.dataset.field;
      const value = e.target.value;
      if (value) {
        columnMapping[field] = value;
      } else {
        delete columnMapping[field];
      }
      updateMappingStatus();
    });
  });

  updateMappingStatus();
}

/**
 * Atualiza status do mapeamento
 */
function updateMappingStatus() {
  const count = Object.keys(columnMapping).length;
  const badge = document.getElementById('mapping-status');
  if (badge) {
    badge.textContent = `${count} mapeadas`;
    badge.className = count >= 3 ? 'badge bg-success ms-2' : 'badge bg-warning ms-2';
  }
}

/**
 * Renderiza tabela de preview
 */
function renderPreviewTable(headers, data) {
  const headerRow = document.getElementById('import-preview-header');
  const tbody = document.getElementById('import-preview-body');

  if (!headerRow || !tbody) return;

  // Cabecalhos
  headerRow.innerHTML = headers.map(h => `<th class="small">${escapeHtml(h)}</th>`).join('');

  // Linhas
  tbody.innerHTML = data.map(row => `
    <tr>
      ${headers.map(h => `<td class="small">${escapeHtml(row[h] || '')}</td>`).join('')}
    </tr>
  `).join('');
}

/**
 * Volta para tela de upload
 */
function resetToUpload() {
  document.getElementById('import-step-preview').classList.add('d-none');
  document.getElementById('import-step-upload').classList.remove('d-none');
  document.getElementById('import-btn-start').classList.add('d-none');
  document.getElementById('import-csv-file').value = '';
  parsedData = [];
  columnMapping = {};
  rawCsvContent = '';
  currentFileName = '';
}

/**
 * Inicia a importacao
 */
async function startImport() {
  // Valida mapeamento minimo
  if (!columnMapping.cpf || !columnMapping.cliente || !columnMapping.situacao) {
    alert('Mapeie pelo menos as colunas obrigatorias: CPF, Cliente e Situacao');
    return;
  }

  // Transforma dados para o formato esperado pelo service
  const rows = parsedData.map(row => {
    const mapped = {};
    for (const [field, column] of Object.entries(columnMapping)) {
      mapped[field] = row[column];
    }
    return mapped;
  });

  // Mostra progresso
  document.getElementById('import-step-preview').classList.add('d-none');
  document.getElementById('import-step-progress').classList.remove('d-none');
  document.getElementById('import-btn-start').classList.add('d-none');
  document.getElementById('import-btn-cancel').disabled = true;

  try {
    const result = await aprovacaoService.importAprovacoes(rows, (current, total) => {
      const safeTotal = Math.max(Number(total || 0), 1);
      const safeCurrent = Math.min(Number(current || 0), safeTotal);
      const percent = Math.round((safeCurrent / safeTotal) * 100);
      const progressBar = document.getElementById('import-progress-bar');
      const progressText = document.getElementById('import-progress-text');

      if (progressBar) {
        progressBar.style.width = `${percent}%`;
        progressBar.textContent = `${percent}%`;
      }
      if (progressText) {
        progressText.textContent = `${safeCurrent} de ${safeTotal} registros`;
      }
    }, {
      rawCsvContent,
      fileName: currentFileName
    });

    showComplete(result.success, result.errors);
  } catch (error) {
    console.error('[ImportAprovacaoModal] Erro na importacao:', error);
    alert('Erro durante a importacao: ' + error.message);
    close();
  }
}

/**
 * Mostra tela de conclusao
 */
function showComplete(successCount, errors) {
  document.getElementById('import-step-progress').classList.add('d-none');
  document.getElementById('import-step-complete').classList.remove('d-none');
  document.getElementById('import-btn-finish').classList.remove('d-none');
  document.getElementById('import-btn-cancel').classList.add('d-none');

  document.getElementById('import-success-count').textContent = successCount;
  document.getElementById('import-error-count').textContent = errors.length;

  if (errors.length > 0) {
    const errorsContainer = document.getElementById('import-errors-container');
    const errorsList = document.getElementById('import-errors-list');

    if (errorsContainer && errorsList) {
      errorsContainer.classList.remove('d-none');
      errorsList.innerHTML = errors.map(err =>
        `<li><strong>Linha ${err.row}:</strong> ${escapeHtml(err.message)}</li>`
      ).join('');
    }
  }
}

/**
 * Abre o modal
 */
async function open(callback) {
  // Verifica permissao
  const currentUser = auth.currentUser;
  if (currentUser) {
    const permissions = await permissionsService.getUserPermissions(currentUser.uid);
    if (!permissionsService.can(permissions, PERMISSION_MODULES.APROVACOES, PERMISSION_ACTIONS.IMPORT)) {
      alert('Voce nao tem permissao para importar aprovacoes.');
      return;
    }
  }

  onImportComplete = callback;

  const modalEl = render();
  modalInstance = new bootstrap.Modal(modalEl);
  modalInstance.show();

  // Reset state
  parsedData = [];
  columnMapping = {};
  rawCsvContent = '';
  currentFileName = '';
}

/**
 * Fecha o modal
 */
function close() {
  if (modalInstance) {
    modalInstance.hide();
  }
  parsedData = [];
  columnMapping = {};
  rawCsvContent = '';
  currentFileName = '';
  onImportComplete = null;
}

/**
 * Escapa HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Exporta
const ImportAprovacaoModal = {
  open,
  close
};

export default ImportAprovacaoModal;
