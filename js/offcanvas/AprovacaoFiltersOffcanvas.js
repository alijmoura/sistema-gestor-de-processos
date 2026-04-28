/**
 * @file AprovacaoFiltersOffcanvas.js
 * @description Offcanvas para filtros avancados de aprovacoes
 */

import { SITUACAO_APROVACAO, TIPO_CARTA, SITUACAO_COLORS } from '../aprovacaoService.js';
import { getAllVendors } from '../firestoreService.js';

const OFFCANVAS_ID = 'aprovacao-filters-offcanvas';

let offcanvasInstance = null;
let vendors = [];
let currentFilters = {
  situacao: [],
  construtora: [],
  empreendimento: [],
  cartaFinanciamento: [],
  dataInicio: null,
  dataFim: null,
  analista: ''
};
let onApplyFilters = null;

/**
 * Renderiza o offcanvas no DOM
 */
function render() {
  const existing = document.getElementById(OFFCANVAS_ID);
  if (existing) {
    existing.remove();
  }

  const html = `
    <div class="offcanvas offcanvas-end" tabindex="-1" id="${OFFCANVAS_ID}">
      <div class="offcanvas-header border-bottom">
        <h5 class="offcanvas-title">
          <i class="bi bi-funnel me-2"></i>Filtros Avancados
        </h5>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas"></button>
      </div>
      <div class="offcanvas-body p-0">
        <div class="accordion accordion-flush" id="aprovacao-filters-accordion">

          <!-- Filtro por Periodo -->
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button class="accordion-button" type="button" data-bs-toggle="collapse"
                      data-bs-target="#filter-periodo-collapse" aria-expanded="true">
                <i class="bi bi-calendar-range me-2"></i>Periodo
              </button>
            </h2>
            <div id="filter-periodo-collapse" class="accordion-collapse collapse show">
              <div class="accordion-body">
                <div class="row g-2">
                  <div class="col-6">
                    <label class="form-label small">De:</label>
                    <input type="date" class="form-control form-control-sm" id="filter-data-inicio">
                  </div>
                  <div class="col-6">
                    <label class="form-label small">Ate:</label>
                    <input type="date" class="form-control form-control-sm" id="filter-data-fim">
                  </div>
                </div>
                <div class="mt-2">
                  <div class="btn-group btn-group-sm w-100" role="group">
                    <button type="button" class="btn btn-outline-secondary quick-period" data-days="7">7 dias</button>
                    <button type="button" class="btn btn-outline-secondary quick-period" data-days="30">30 dias</button>
                    <button type="button" class="btn btn-outline-secondary quick-period" data-days="90">90 dias</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Filtro por Situacao -->
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                      data-bs-target="#filter-situacao-collapse">
                <i class="bi bi-tags me-2"></i>Situacao
                <span class="badge bg-primary rounded-pill ms-2 d-none" id="filter-situacao-count">0</span>
              </button>
            </h2>
            <div id="filter-situacao-collapse" class="accordion-collapse collapse">
              <div class="accordion-body">
                <div class="d-flex flex-column gap-2" id="filter-situacao-list">
                  ${Object.entries(SITUACAO_APROVACAO).map(([key, value]) => {
                    const colors = SITUACAO_COLORS[value];
                    return `
                      <div class="form-check">
                        <input class="form-check-input filter-situacao-check" type="checkbox"
                               value="${value}" id="filter-situacao-${key}">
                        <label class="form-check-label" for="filter-situacao-${key}">
                          <span class="badge ${colors.bg} ${colors.text}">
                            <i class="bi ${colors.icon} me-1"></i>${value}
                          </span>
                        </label>
                      </div>
                    `;
                  }).join('')}
                </div>
                <div class="d-flex gap-2 mt-3 pt-2 border-top">
                  <button type="button" class="btn btn-link btn-sm p-0" id="situacao-select-all">
                    <i class="bi bi-check-all me-1"></i>Todos
                  </button>
                  <button type="button" class="btn btn-link btn-sm p-0" id="situacao-clear-all">
                    <i class="bi bi-x-lg me-1"></i>Limpar
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Filtro por Construtora -->
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                      data-bs-target="#filter-construtora-collapse">
                <i class="bi bi-building me-2"></i>Construtora
                <span class="badge bg-primary rounded-pill ms-2 d-none" id="filter-construtora-count">0</span>
              </button>
            </h2>
            <div id="filter-construtora-collapse" class="accordion-collapse collapse">
              <div class="accordion-body">
                <div class="filter-list" id="filter-construtora-list" style="max-height: 200px; overflow-y: auto;">
                  <!-- Gerado dinamicamente -->
                </div>
                <div class="d-flex gap-2 mt-3 pt-2 border-top">
                  <button type="button" class="btn btn-link btn-sm p-0" id="construtora-select-all">
                    <i class="bi bi-check-all me-1"></i>Todos
                  </button>
                  <button type="button" class="btn btn-link btn-sm p-0" id="construtora-clear-all">
                    <i class="bi bi-x-lg me-1"></i>Limpar
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Filtro por Empreendimento -->
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                      data-bs-target="#filter-empreendimento-collapse">
                <i class="bi bi-geo-alt me-2"></i>Empreendimento
                <span class="badge bg-primary rounded-pill ms-2 d-none" id="filter-empreendimento-count">0</span>
              </button>
            </h2>
            <div id="filter-empreendimento-collapse" class="accordion-collapse collapse">
              <div class="accordion-body">
                <div class="filter-list" id="filter-empreendimento-list" style="max-height: 200px; overflow-y: auto;">
                  <!-- Gerado dinamicamente -->
                </div>
                <div class="d-flex gap-2 mt-3 pt-2 border-top">
                  <button type="button" class="btn btn-link btn-sm p-0" id="empreendimento-select-all">
                    <i class="bi bi-check-all me-1"></i>Todos
                  </button>
                  <button type="button" class="btn btn-link btn-sm p-0" id="empreendimento-clear-all">
                    <i class="bi bi-x-lg me-1"></i>Limpar
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Filtro por Tipo de Carta -->
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                      data-bs-target="#filter-carta-collapse">
                <i class="bi bi-credit-card me-2"></i>Tipo de Carta
              </button>
            </h2>
            <div id="filter-carta-collapse" class="accordion-collapse collapse">
              <div class="accordion-body">
                <div class="d-flex flex-column gap-2">
                  ${Object.values(TIPO_CARTA).map(carta => `
                    <div class="form-check">
                      <input class="form-check-input filter-carta-check" type="checkbox"
                             value="${carta}" id="filter-carta-${carta}">
                      <label class="form-check-label" for="filter-carta-${carta}">
                        <span class="badge ${carta === TIPO_CARTA.MCMV ? 'bg-primary' : 'bg-secondary'}">${carta}</span>
                      </label>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- Filtro por Analista -->
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                      data-bs-target="#filter-analista-collapse">
                <i class="bi bi-person me-2"></i>Analista
              </button>
            </h2>
            <div id="filter-analista-collapse" class="accordion-collapse collapse">
              <div class="accordion-body">
                <input type="text" class="form-control form-control-sm" id="filter-analista"
                       placeholder="Nome ou email do analista">
              </div>
            </div>
          </div>

          <!-- Filtro por Conversao -->
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                      data-bs-target="#filter-conversao-collapse">
                <i class="bi bi-arrow-right-circle me-2"></i>Status de Conversao
              </button>
            </h2>
            <div id="filter-conversao-collapse" class="accordion-collapse collapse">
              <div class="accordion-body">
                <div class="d-flex flex-column gap-2">
                  <div class="form-check">
                    <input class="form-check-input" type="radio" name="filter-conversao"
                           value="" id="filter-conversao-todos" checked>
                    <label class="form-check-label" for="filter-conversao-todos">Todos</label>
                  </div>
                  <div class="form-check">
                    <input class="form-check-input" type="radio" name="filter-conversao"
                           value="pendente" id="filter-conversao-pendente">
                    <label class="form-check-label" for="filter-conversao-pendente">
                      <span class="badge bg-warning text-dark">Pendentes de Conversao</span>
                    </label>
                  </div>
                  <div class="form-check">
                    <input class="form-check-input" type="radio" name="filter-conversao"
                           value="convertido" id="filter-conversao-convertido">
                    <label class="form-check-label" for="filter-conversao-convertido">
                      <span class="badge bg-info">Ja Convertidos</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Footer com botoes -->
      <div class="offcanvas-footer border-top p-3 bg-light">
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-outline-secondary flex-grow-1" id="filter-clear-btn">
            <i class="bi bi-x-circle me-1"></i>Limpar Filtros
          </button>
          <button type="button" class="btn btn-primary flex-grow-1" id="filter-apply-btn">
            <i class="bi bi-check-circle me-1"></i>Aplicar
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  setupEventListeners();

  return document.getElementById(OFFCANVAS_ID);
}

/**
 * Configura event listeners
 */
function setupEventListeners() {
  // Quick period buttons
  document.querySelectorAll('.quick-period').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.days);
      const dataFim = new Date();
      const dataInicio = new Date();
      dataInicio.setDate(dataInicio.getDate() - days);

      document.getElementById('filter-data-inicio').value = formatDateInput(dataInicio);
      document.getElementById('filter-data-fim').value = formatDateInput(dataFim);
    });
  });

  // Situacao select/clear all
  document.getElementById('situacao-select-all')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-situacao-check').forEach(cb => cb.checked = true);
    updateFilterCount('situacao');
  });
  document.getElementById('situacao-clear-all')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-situacao-check').forEach(cb => cb.checked = false);
    updateFilterCount('situacao');
  });

  // Construtora select/clear all
  document.getElementById('construtora-select-all')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-construtora-check').forEach(cb => cb.checked = true);
    updateFilterCount('construtora');
  });
  document.getElementById('construtora-clear-all')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-construtora-check').forEach(cb => cb.checked = false);
    updateFilterCount('construtora');
  });

  // Empreendimento select/clear all
  document.getElementById('empreendimento-select-all')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-empreendimento-check').forEach(cb => cb.checked = true);
    updateFilterCount('empreendimento');
  });
  document.getElementById('empreendimento-clear-all')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-empreendimento-check').forEach(cb => cb.checked = false);
    updateFilterCount('empreendimento');
  });

  // Clear all filters
  document.getElementById('filter-clear-btn')?.addEventListener('click', clearAllFilters);

  // Apply filters
  document.getElementById('filter-apply-btn')?.addEventListener('click', applyFilters);

  // Checkbox change handlers for counts
  document.querySelectorAll('.filter-situacao-check').forEach(cb => {
    cb.addEventListener('change', () => updateFilterCount('situacao'));
  });
}

/**
 * Carrega vendors para os filtros
 */
async function loadVendors() {
  try {
    vendors = await getAllVendors();
    renderConstrutoras();
    renderEmpreendimentos();
  } catch (error) {
    console.error('[AprovacaoFiltersOffcanvas] Erro ao carregar vendors:', error);
  }
}

/**
 * Renderiza lista de construtoras
 */
function renderConstrutoras() {
  const container = document.getElementById('filter-construtora-list');
  if (!container) return;

  const activeVendors = vendors.filter(v => v.active !== false);

  container.innerHTML = activeVendors.map(vendor => `
    <div class="form-check">
      <input class="form-check-input filter-construtora-check" type="checkbox"
             value="${escapeHtml(vendor.name)}" id="filter-construtora-${vendor.id}">
      <label class="form-check-label small" for="filter-construtora-${vendor.id}">
        ${escapeHtml(vendor.name)}
      </label>
    </div>
  `).join('');

  // Re-bind eventos
  container.querySelectorAll('.filter-construtora-check').forEach(cb => {
    cb.addEventListener('change', () => {
      updateFilterCount('construtora');
      updateEmpreendimentos();
    });
  });
}

/**
 * Renderiza lista de empreendimentos baseado nas construtoras selecionadas
 */
function renderEmpreendimentos() {
  updateEmpreendimentos();
}

/**
 * Atualiza lista de empreendimentos baseado nas construtoras selecionadas
 */
function updateEmpreendimentos() {
  const container = document.getElementById('filter-empreendimento-list');
  if (!container) return;

  // Pega construtoras selecionadas
  const selectedConstrutoras = Array.from(document.querySelectorAll('.filter-construtora-check:checked'))
    .map(cb => cb.value);

  // Filtra empreendimentos
  let empreendimentos = [];
  if (selectedConstrutoras.length === 0) {
    // Se nenhuma construtora selecionada, mostra todos os empreendimentos
    vendors.forEach(vendor => {
      if (vendor.empreendimentos) {
        vendor.empreendimentos.forEach(emp => {
          empreendimentos.push({ name: emp, vendor: vendor.name });
        });
      }
    });
  } else {
    // Mostra apenas empreendimentos das construtoras selecionadas
    vendors.filter(v => selectedConstrutoras.includes(v.name)).forEach(vendor => {
      if (vendor.empreendimentos) {
        vendor.empreendimentos.forEach(emp => {
          empreendimentos.push({ name: emp, vendor: vendor.name });
        });
      }
    });
  }

  // Remove duplicados e ordena
  empreendimentos = [...new Map(empreendimentos.map(e => [e.name, e])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));

  container.innerHTML = empreendimentos.length > 0 ? empreendimentos.map(emp => `
    <div class="form-check">
      <input class="form-check-input filter-empreendimento-check" type="checkbox"
             value="${escapeHtml(emp.name)}" id="filter-emp-${escapeHtml(emp.name).replace(/\s/g, '-')}">
      <label class="form-check-label small" for="filter-emp-${escapeHtml(emp.name).replace(/\s/g, '-')}">
        ${escapeHtml(emp.name)}
        <small class="text-muted">(${escapeHtml(emp.vendor)})</small>
      </label>
    </div>
  `).join('') : '<p class="text-muted small mb-0">Nenhum empreendimento disponivel</p>';

  // Re-bind eventos
  container.querySelectorAll('.filter-empreendimento-check').forEach(cb => {
    cb.addEventListener('change', () => updateFilterCount('empreendimento'));
  });
}

/**
 * Atualiza badge de contagem de filtros
 */
function updateFilterCount(type) {
  const checkboxes = document.querySelectorAll(`.filter-${type}-check:checked`);
  const badge = document.getElementById(`filter-${type}-count`);

  if (badge) {
    if (checkboxes.length > 0) {
      badge.textContent = checkboxes.length;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }
}

/**
 * Limpa todos os filtros
 */
function clearAllFilters() {
  // Datas
  document.getElementById('filter-data-inicio').value = '';
  document.getElementById('filter-data-fim').value = '';

  // Checkboxes
  document.querySelectorAll('.filter-situacao-check, .filter-construtora-check, .filter-empreendimento-check, .filter-carta-check')
    .forEach(cb => cb.checked = false);

  // Radio
  document.getElementById('filter-conversao-todos').checked = true;

  // Input
  document.getElementById('filter-analista').value = '';

  // Badges
  ['situacao', 'construtora', 'empreendimento'].forEach(type => {
    const badge = document.getElementById(`filter-${type}-count`);
    if (badge) badge.classList.add('d-none');
  });

  // Reset state
  currentFilters = {
    situacao: [],
    construtora: [],
    empreendimento: [],
    cartaFinanciamento: [],
    dataInicio: null,
    dataFim: null,
    analista: ''
  };
}

/**
 * Aplica os filtros
 */
function applyFilters() {
  // Coleta valores
  currentFilters.situacao = Array.from(document.querySelectorAll('.filter-situacao-check:checked'))
    .map(cb => cb.value);

  currentFilters.construtora = Array.from(document.querySelectorAll('.filter-construtora-check:checked'))
    .map(cb => cb.value);

  currentFilters.empreendimento = Array.from(document.querySelectorAll('.filter-empreendimento-check:checked'))
    .map(cb => cb.value);

  currentFilters.cartaFinanciamento = Array.from(document.querySelectorAll('.filter-carta-check:checked'))
    .map(cb => cb.value);

  currentFilters.dataInicio = document.getElementById('filter-data-inicio')?.value || null;
  currentFilters.dataFim = document.getElementById('filter-data-fim')?.value || null;
  currentFilters.analista = document.getElementById('filter-analista')?.value || '';

  // Conversao
  const conversaoRadio = document.querySelector('input[name="filter-conversao"]:checked');
  currentFilters.conversao = conversaoRadio?.value || '';

  // Callback
  if (onApplyFilters) {
    onApplyFilters(currentFilters);
  }

  // Fecha offcanvas
  close();
}

/**
 * Abre o offcanvas
 */
async function open(callback, initialFilters = null) {
  onApplyFilters = callback;

  const offcanvasEl = render();

  // Carrega vendors
  await loadVendors();

  // Aplica filtros iniciais se fornecidos
  if (initialFilters) {
    setFilters(initialFilters);
  }

  offcanvasInstance = new bootstrap.Offcanvas(offcanvasEl);
  offcanvasInstance.show();
}

/**
 * Define filtros iniciais
 */
function setFilters(filters) {
  if (!filters) return;

  if (filters.dataInicio) {
    document.getElementById('filter-data-inicio').value = filters.dataInicio;
  }
  if (filters.dataFim) {
    document.getElementById('filter-data-fim').value = filters.dataFim;
  }

  if (filters.situacao?.length) {
    filters.situacao.forEach(s => {
      const cb = document.querySelector(`.filter-situacao-check[value="${s}"]`);
      if (cb) cb.checked = true;
    });
    updateFilterCount('situacao');
  }

  if (filters.construtora?.length) {
    filters.construtora.forEach(c => {
      const cb = document.querySelector(`.filter-construtora-check[value="${c}"]`);
      if (cb) cb.checked = true;
    });
    updateFilterCount('construtora');
    updateEmpreendimentos();
  }

  if (filters.empreendimento?.length) {
    filters.empreendimento.forEach(e => {
      const cb = document.querySelector(`.filter-empreendimento-check[value="${e}"]`);
      if (cb) cb.checked = true;
    });
    updateFilterCount('empreendimento');
  }

  if (filters.analista) {
    document.getElementById('filter-analista').value = filters.analista;
  }

  if (filters.conversao) {
    const radio = document.getElementById(`filter-conversao-${filters.conversao}`);
    if (radio) radio.checked = true;
  }

  currentFilters = { ...currentFilters, ...filters };
}

/**
 * Fecha o offcanvas
 */
function close() {
  if (offcanvasInstance) {
    offcanvasInstance.hide();
  }
}

/**
 * Formata data para input
 */
function formatDateInput(date) {
  return date.toISOString().split('T')[0];
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
const AprovacaoFiltersOffcanvas = {
  open,
  close,
  getFilters: () => currentFilters
};

export default AprovacaoFiltersOffcanvas;
