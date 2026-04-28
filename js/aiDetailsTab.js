import aiService from './aiService.js';
import documentProcessingService from './documentProcessingService.js';
import aiContractAssistant from './aiContractAssistant.js';
import * as firestoreService from './firestoreService.js';
import { showNotification, createCompradorFields } from './ui.js';

const SUGGESTION_LABELS = {
  vendedorConstrutora: 'Vendedor/Construtora',
  empreendimento: 'Empreendimento',
  valorContrato: 'Valor do Contrato',
  entrada: 'Entrada',
  financiamento: 'Financiamento',
  dataAssinatura: 'Data de Assinatura',
  dataEntrega: 'Data de Entrega',
  observacoes: 'Observações',
};

const COMPRADOR_FIELD_LABELS = {
  nome: 'Nome',
  cpf: 'CPF',
  email: 'E-mail',
  telefone: 'Telefone',
  estadoCivil: 'Estado civil',
  filiacaoPai: 'Filiação (pai)',
  filiacaoMae: 'Filiação (mãe)',
  rg: 'RG',
  orgaoExpedidor: 'Órgão expedidor',
  nascimento: 'Nascimento',
  nacionalidade: 'Nacionalidade',
  profissao: 'Profissão',
  endereco: 'Endereço',
  cidade: 'Cidade',
  uf: 'UF',
  cep: 'CEP',
};

const state = {
  initialized: false,
  suggestions: [],
  files: [],
};

function byId(id) {
  return document.getElementById(id);
}

function setStatus(message, variant = 'muted') {
  const el = byId('ai-tab-status');
  if (!el) return;
  const variants = {
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-danger',
    info: 'text-info',
    muted: 'text-muted',
  };
  el.className = `small ${variants[variant] || variants.muted}`;
  el.textContent = message;
}

function toggleProgress(show, value = 0) {
  const wrap = byId('ai-tab-progress-wrapper');
  const bar = byId('ai-tab-progress');
  if (!wrap || !bar) return;
  if (!show) {
    wrap.classList.add('d-none');
    bar.style.width = '0%';
    return;
  }
  wrap.classList.remove('d-none');
  bar.style.width = `${Math.min(100, Math.max(0, value))}%`;
}

function currentContractId() {
  return byId('modal-contract-id')?.value || null;
}

function collectFormSnapshot() {
  const data = {};
  const fields = document.querySelectorAll('#details-modal [id^="modal-"]');
  fields.forEach((el) => {
    const key = el.id.replace('modal-', '');
    if (el.type === 'checkbox') {
      data[key] = el.checked;
    } else {
      data[key] = el.value;
    }
  });
  return data;
}

function renderSuggestions() {
  const list = byId('ai-tab-suggestions');
  const count = byId('ai-tab-suggestions-count');
  if (!list || !count) return;

  if (!state.suggestions.length) {
    list.innerHTML = '<div class="text-muted">Nenhuma sugestão disponível. Envie um documento para extrair dados.</div>';
    count.textContent = '0';
    return;
  }

  count.textContent = String(state.suggestions.length);
  list.innerHTML = state.suggestions
    .map((item, idx) => {
      const label = buildSuggestionLabel(item.field);
      const confidence = item.confidence != null ? ` • confiança ${(item.confidence * 100).toFixed(0)}%` : '';
      return `
        <div class="border rounded p-2 mb-2 d-flex align-items-start gap-2">
          <div class="form-check mt-1">
            <input class="form-check-input" type="checkbox" id="ai-sugg-${idx}" data-field="${item.field}" data-value="${encodeURIComponent(item.value)}">
          </div>
          <div class="flex-grow-1">
            <div class="d-flex align-items-center justify-content-between">
              <div class="fw-semibold">${label}</div>
              <span class="badge bg-light text-dark">${item.source}${confidence}</span>
            </div>
            <div class="text-muted small">${escapeHtml(String(item.value))}</div>
          </div>
        </div>`;
    })
    .join('');
}

function renderValidation(issues = []) {
  const list = byId('ai-tab-validation');
  const count = byId('ai-tab-issues-count');
  if (!list || !count) return;

  if (!issues.length) {
    list.innerHTML = '<div class="text-success">Nenhuma inconsistência encontrada.</div>';
    count.textContent = '0';
    return;
  }

  count.textContent = String(issues.length);
  list.innerHTML = issues
    .map((issue) => {
      const severity = issue.severity || 'info';
      const badgeClass = severity === 'high' ? 'bg-danger' : severity === 'medium' ? 'bg-warning text-dark' : 'bg-secondary';
      return `
        <div class="border rounded p-2 mb-2">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <span class="fw-semibold">${escapeHtml(issue.field || 'Campo')}</span>
            <span class="badge ${badgeClass}">${escapeHtml(severity)}</span>
          </div>
          <div class="text-muted small">${escapeHtml(issue.issue || issue.message || 'Necessita revisão')}</div>
        </div>`;
    })
    .join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSuggestionLabel(field) {
  const compradorMatch = field.match(/^compradores\.(\d+)\.(.+)$/);
  if (compradorMatch) {
    const idx = Number(compradorMatch[1]);
    const prop = compradorMatch[2];
    const labelBase = COMPRADOR_FIELD_LABELS[prop] || prop;
    return `Comprador ${idx + 1} – ${labelBase}`;
  }

  return SUGGESTION_LABELS[field] || field;
}

function bindDropzone() {
  const dropzone = byId('ai-tab-dropzone');
  const input = byId('ai-tab-file-input');
  if (!dropzone || !input) return;

  dropzone.addEventListener('click', () => input.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('bg-light');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('bg-light'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('bg-light');
    if (e.dataTransfer?.files?.length) {
      state.files = Array.from(e.dataTransfer.files);
      input.files = e.dataTransfer.files;
      setStatus(`${state.files.length} arquivo(s) selecionado(s).`, 'info');
    }
  });

  input.addEventListener('change', () => {
    state.files = Array.from(input.files || []);
    if (state.files.length) {
      setStatus(`${state.files.length} arquivo(s) selecionado(s).`, 'info');
    }
  });
}

async function processFiles() {
  const files = state.files || [];
  const contractId = currentContractId();
  if (!files.length) {
    showNotification('Selecione ao menos um arquivo para processar.', 'error');
    return;
  }

  setStatus('Processando documentos com IA...', 'info');
  toggleProgress(true, 5);
  const aggregated = [];

  for (const file of files) {
    try {
      let lastProgress = 0;
      if (contractId) {
        await firestoreService.uploadFile(contractId, file, 'ia-extract', (p) => {
          lastProgress = p;
          toggleProgress(true, p * 0.5);
        });
      }
      const result = await documentProcessingService.processFile(file, { skipCache: true });
      if (result?.success && result.data) {
        aggregated.push(result.data);
        setStatus(`Arquivo ${file.name} processado.`, 'success');
      } else {
        setStatus(`Falha ao processar ${file.name}: ${result?.error || 'erro'}`, 'warning');
      }
      toggleProgress(true, Math.max(50, lastProgress));
    } catch (error) {
      console.error('[aiDetailsTab] erro ao processar', error);
      setStatus(`Erro no arquivo ${file.name}: ${error.message}`, 'error');
    }
  }

  toggleProgress(false);
  buildSuggestionsFromData(aggregated);
  await logHistory('ia_extraction', { files: files.map((f) => f.name), suggestions: state.suggestions.length });
}

function buildSuggestionsFromData(results = []) {
  state.suggestions = [];
  results.forEach((data) => {
    Object.entries(data || {}).forEach(([field, value]) => {
      if (value === undefined || value === null) return;

      if (field === 'compradores' && Array.isArray(value)) {
        value.forEach((comprador, idx) => {
          if (!comprador || typeof comprador !== 'object') return;
          Object.keys(COMPRADOR_FIELD_LABELS).forEach((prop) => {
            const propValue = comprador[prop];
            if (propValue === undefined || propValue === null || propValue === '') return;
            state.suggestions.push({
              field: `compradores.${idx}.${prop}`,
              value: propValue,
              source: 'documento',
            });
          });
        });
        return;
      }

      if (typeof value === 'object') return;
      state.suggestions.push({ field, value, source: 'documento' });
    });
  });
  renderSuggestions();
}

function ensureCompradorSlot(index) {
  const container = byId('compradores-container');
  if (!container) return null;

  let items = container.querySelectorAll('.comprador-item');
  while (items.length <= index) {
    const newItem = createCompradorFields({}, items.length);
    container.appendChild(newItem);
    items = container.querySelectorAll('.comprador-item');
  }

  return items[index] || null;
}

function applyCompradorField(index, field, value) {
  const card = ensureCompradorSlot(index);
  if (!card) return false;

  const input = card.querySelector(`[data-field="${field}"]`);
  if (!input) return false;

  if (input.type === 'radio') {
    input.checked = String(value).toLowerCase() !== 'false';
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function applySelectedSuggestions() {
  if (!state.suggestions.length) {
    showNotification('Nenhuma sugestão para aplicar.', 'error');
    return;
  }

  const checkboxes = byId('ai-tab-suggestions')?.querySelectorAll('input[type="checkbox"]') || [];
  let applied = 0;

  checkboxes.forEach((cb) => {
    if (!cb.checked) return;
    const field = cb.dataset.field;
    const value = decodeURIComponent(cb.dataset.value || '');

    const compradorMatch = field?.match(/^compradores\.(\d+)\.(.+)$/);
    if (compradorMatch) {
      const idx = Number(compradorMatch[1]);
      const prop = compradorMatch[2];
      if (applyCompradorField(idx, prop, value)) {
        applied += 1;
      }
      return;
    }

    const input = byId(`modal-${field}`);
    if (input) {
      input.value = value;
      input.dataset.userModified = 'true';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      applied += 1;
    }
  });

  if (applied > 0) {
    setStatus(`Aplicado em ${applied} campo(s).`, 'success');
    showNotification('Sugestões aplicadas com sucesso.', 'success');
    if (window.updateDetailsModalSummary) {
      try {
        window.updateDetailsModalSummary();
      } catch (err) {
        console.warn('[aiDetailsTab] não foi possível atualizar resumo', err);
      }
    }
    logHistory('ia_apply', { applied });
  } else {
    showNotification('Nada foi aplicado. Selecione os campos desejados.', 'warning');
  }
}

async function runValidation() {
  setStatus('Validando dados com IA...', 'info');
  toggleProgress(true, 20);
  try {
    const data = collectFormSnapshot();
    const result = await aiContractAssistant.validateContract(data);
    renderValidation(result?.issues || []);
    setStatus('Validação concluída.', 'success');
    await logHistory('ia_validate', { issues: result?.issues?.length || 0 });
  } catch (error) {
    console.error('[aiDetailsTab] validação falhou', error);
    setStatus(`Erro na validação: ${error.message}`, 'error');
  } finally {
    toggleProgress(false);
  }
}

async function logHistory(action, details = {}) {
  try {
    const contractId = currentContractId();
    if (!contractId || typeof firestoreService.addContractHistoryEntry !== 'function') return;
    await firestoreService.addContractHistoryEntry(contractId, {
      origem: 'ia',
      tipo: action,
      mudancas: [`IA: ${action}`],
      detalhes: details,
    });
  } catch (error) {
    console.warn('[aiDetailsTab] falha ao registrar histórico IA', error);
  }
}

function clearSuggestions() {
  state.suggestions = [];
  renderSuggestions();
  renderValidation([]);
  setStatus('Sugestões limpas.', 'info');
}

function bindButtons() {
  byId('ai-tab-process-btn')?.addEventListener('click', processFiles);
  byId('ai-tab-apply-selected-btn')?.addEventListener('click', applySelectedSuggestions);
  byId('ai-tab-validate-btn')?.addEventListener('click', runValidation);
  byId('ai-tab-clear-btn')?.addEventListener('click', clearSuggestions);
}

function observeModal() {
  const modal = byId('details-modal');
  if (!modal) return;
  const observer = new MutationObserver(() => {
    if (modal.style.display === 'block' || modal.classList.contains('show')) {
      state.files = [];
      clearSuggestions();
      setStatus('Pronto para usar IA.');
    }
  });
  observer.observe(modal, { attributes: true });
}

function ensureProvider() {
  try {
    aiService.setProvider('backend');
  } catch (error) {
    console.warn('[aiDetailsTab] não foi possível forçar provider backend', error);
  }
}

function init() {
  if (state.initialized) return;
  state.initialized = true;
  ensureProvider();
  bindDropzone();
  bindButtons();
  observeModal();
  renderSuggestions();
  renderValidation([]);
  setStatus('Pronto para usar IA.');
}

const aiDetailsTab = {
  init,
};

export default aiDetailsTab;
