/**
 * @file aprovacaoPageInit.js
 * @description Inicializacao e gerenciamento da pagina de aprovacoes
 */

import aprovacaoService, {
  SITUACAO_APROVACAO,
  SITUACAO_COLORS
} from '../aprovacaoService.js';
import {
  getAllVendors,
  getAnalysts,
  getAllContracts,
  getContractsPage
} from '../firestoreService.js';
import { auth } from '../auth.js';
import cacheService from '../cacheService.js';
import conversionMetricsService from '../conversionMetricsService.js';
import { activityLogService } from '../activityLogService.js';

const PAGE_RELOAD_TTL_MS = 2 * 60 * 1000;
const STATS_RELOAD_TTL_MS = 15 * 60 * 1000;
const SOLICITACOES_RELOAD_TTL_MS = 2 * 60 * 1000;
const CONVERSION_SUMMARY_CACHE_PREFIX = 'aprovacoes_conversion_summary_';
const SOLICITACOES_MODAL_ID = 'aprovacao-solicitacoes-modal';
const INTAKE_ANALYST_QUEUE = 'fila-aprovacao';
const SOLICITACAO_ORIGENS = new Set(['whatsapp_bot', 'link_publico']);

// Estado da pagina
const state = {
  aprovacoes: [],
  filteredAprovacoes: [],
  stats: null,
  currentPage: 1,
  pageSize: 20,
  lastDoc: null,
  pageCursors: [null],
  pageCursorIds: [null],
  pageDataCache: new Map(),
  hasMore: false,
  loading: false,
  initialized: false,
  currentFilter: 'todas',
  searchTerm: '',
  sortField: 'dataEntrada',
  sortDirection: 'desc',
  vendors: [],
  analysts: [],
  analystDisplayMap: new Map(),
  inlineAnalystOptions: new Map(),
  lastLoadedAt: 0,
  hasLoadedOnce: false,
  statsLoadedAt: 0,
  statsSignature: '',
  conversionSummary: null,
  conversionSignature: '',
  conversionPartial: false,
  allAprovacoesPageData: [],
  solicitacoesAnalise: [],
  solicitacoesLoadedAt: 0,
  solicitacoesPartial: false,
  inlineFilters: {
    dataEntrada: '',
    empreendimento: '',
    construtora: '',
    situacao: '',
    dataAprovacao: '',
    analista: ''
  },
  // Filtros avancados
  advancedFilters: {
    situacao: [],
    construtora: [],
    empreendimento: [],
    cartaFinanciamento: [],
    dataInicio: null,
    dataFim: null,
    analista: '',
    conversao: ''
  }
};

// Elementos DOM
let elements = {};
let aprovacoesDeltaUnsubscribe = null;
let aprovacoesDeltaRefreshTimer = null;
const eventCleanupTasks = [];

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

function registerDisposableListener(target, eventName, handler, options) {
  if (!target?.addEventListener) return;
  target.addEventListener(eventName, handler, options);
  eventCleanupTasks.push(() => target.removeEventListener(eventName, handler, options));
}

function clearRegisteredListeners() {
  while (eventCleanupTasks.length > 0) {
    const cleanup = eventCleanupTasks.pop();
    try {
      cleanup();
    } catch (error) {
      console.warn('[AprovacaoPage] Falha ao limpar listener registrado:', error);
    }
  }
}

/**
 * Inicializa a pagina de aprovacoes
 */
export async function initialize() {
  if (state.initialized) return;

  // Cache elementos DOM
  elements = {
    page: document.getElementById('page-aprovacao'),
    tableBody: document.getElementById('aprovacao-table-body'),
    loadingRow: document.getElementById('aprovacao-loading-row'),
    emptyRow: document.getElementById('aprovacao-empty-row'),
    searchInput: document.getElementById('aprovacao-search-input'),
    searchClear: document.getElementById('aprovacao-search-clear'),
    tabs: document.querySelectorAll('#aprovacao-tabs .nav-link'),
    refreshBtn: document.getElementById('aprovacao-refresh-btn'),
    addBtn: document.getElementById('aprovacao-add-btn'),
    intakeLinkBtn: document.getElementById('aprovacao-intake-link-btn'),
    solicitacoesBtn: document.getElementById('aprovacao-solicitacoes-btn'),
    addEmptyBtn: document.getElementById('aprovacao-add-empty-btn'),
    exportBtn: document.getElementById('aprovacao-export-btn'),
    exportCsv: document.getElementById('aprovacao-export-csv'),
    importCsv: document.getElementById('aprovacao-import-csv'),
    filtersBtn: document.getElementById('aprovacao-filters-btn'),
    pageSize: document.getElementById('aprovacao-page-size'),
    prevBtn: document.getElementById('aprovacao-prev-btn'),
    nextBtn: document.getElementById('aprovacao-next-btn'),
    pageInfo: document.getElementById('aprovacao-page-info'),
    resultsCount: document.getElementById('aprovacao-results-count'),
    inlineFilterFields: document.querySelectorAll('.aprovacao-inline-filter'),
    inlineFilterClearBtn: document.getElementById('aprovacao-inline-filters-clear'),
    inlineAnalistaFilter: document.getElementById('aprovacao-filter-analista'),
    // KPIs
    kpiTotal: document.getElementById('kpi-total-analises'),
    kpiAprovados: document.getElementById('kpi-aprovados'),
    kpiReprovados: document.getElementById('kpi-reprovados'),
    kpiCondicionados: document.getElementById('kpi-condicionados'),
    kpiConversaoRate: document.getElementById('kpi-conversao-rate'),
    kpiConversaoDetail: document.getElementById('kpi-conversao-detail')
  };

  // Configura event listeners
  setupEventListeners();
  await setupRealtimeDeltaListener();

  // Carrega dados auxiliares para uso na UI
  const [vendorsResult, analystsResult] = await Promise.allSettled([
    getAllVendors(),
    getAnalysts()
  ]);

  if (vendorsResult.status === 'fulfilled') {
    state.vendors = vendorsResult.value;
  } else {
    console.error('[AprovacaoPage] Erro ao carregar vendors:', vendorsResult.reason);
  }

  if (analystsResult.status === 'fulfilled') {
    state.analysts = Array.isArray(analystsResult.value) ? analystsResult.value : [];
    state.analystDisplayMap = buildAnalystDisplayMap(state.analysts);
  } else {
    console.error('[AprovacaoPage] Erro ao carregar analistas:', analystsResult.reason);
    state.analystDisplayMap = new Map();
  }

  state.initialized = true;

  if (window.__DEBUG__) {
    console.log('[AprovacaoPage] Inicializado');
  }
}

async function setupRealtimeDeltaListener() {
  if (aprovacoesDeltaUnsubscribe || !aprovacaoService?.listenForAprovacoesDelta) {
    return;
  }

  aprovacoesDeltaUnsubscribe = await aprovacaoService.listenForAprovacoesDelta(({ aprovacoes, updates }) => {
    if (!Array.isArray(updates) || updates.length === 0) return;

    const pageVisible = Boolean(elements.page && elements.page.classList.contains('active'));
    if (!state.hasLoadedOnce) return;

    if (!pageVisible) {
      markAprovacoesRealtimeAsStale();
      return;
    }

    applyRealtimeAprovacaoDelta({ aprovacoes, updates }).catch((error) => {
      console.error('[AprovacaoPage] Erro ao aplicar atualização delta:', error);
      scheduleRealtimeAprovacaoRefresh('delta-error');
    });
  });
}

function markAprovacoesRealtimeAsStale() {
  aprovacaoService.invalidateCache();
  cacheService.invalidateByPattern(/^aprovacoes_conversion_summary_/);
  state.lastLoadedAt = 0;
  state.statsLoadedAt = 0;
  state.statsSignature = '';
  state.pageDataCache = new Map();
  state.conversionSignature = '';
  state.conversionSummary = null;
  state.conversionPartial = false;
  state.solicitacoesLoadedAt = 0;
  state.solicitacoesPartial = false;
}

function scheduleRealtimeAprovacaoRefresh(reason = 'delta') {
  if (aprovacoesDeltaRefreshTimer) {
    clearTimeout(aprovacoesDeltaRefreshTimer);
  }

  aprovacoesDeltaRefreshTimer = setTimeout(() => {
    markAprovacoesRealtimeAsStale();
    loadData().catch((error) => {
      console.error(`[AprovacaoPage] Erro ao executar refresh em tempo real (${reason}):`, error);
    });
  }, 600);
}

function buildRealtimeAprovacaoFieldSet(update = {}) {
  const field = String(update?.field || '').trim();
  if (!field || field === 'general') {
    return new Set(['general']);
  }

  const fields = new Set([field]);
  if (field === 'analistaResponsavel' || field === 'analistaAprovacao') {
    fields.add('analistaResponsavel');
    fields.add('analistaAprovacao');
  }
  if (field === 'cliente' || field === 'clientePrincipal' || field === 'nomeClientePrincipal' || field === 'nomesClientes') {
    fields.add('cliente');
    fields.add('clientePrincipal');
    fields.add('nomeClientePrincipal');
    fields.add('nomesClientes');
  }
  if (field === 'dataEntrada' || field === 'entrada') {
    fields.add('dataEntrada');
    fields.add('entrada');
  }

  return fields;
}

function hasActiveRealtimeSensitiveFilters() {
  if (String(state.searchTerm || '').trim()) {
    return true;
  }

  return Object.values(state.inlineFilters || {}).some((value) => Boolean(String(value || '').trim()));
}

function shouldForceRefreshForRealtimeAprovacoes(updates = [], normalizedAprovacoes = []) {
  if (hasActiveRealtimeSensitiveFilters()) {
    return true;
  }

  const visibleIds = new Set(
    (Array.isArray(state.allAprovacoesPageData) ? state.allAprovacoesPageData : [])
      .map((item) => item?.id)
      .filter(Boolean)
  );
  const updatedMap = new Map(
    (Array.isArray(normalizedAprovacoes) ? normalizedAprovacoes : [])
      .filter((item) => item?.id)
      .map((item) => [item.id, item])
  );
  const riskyFields = new Set([
    'general',
    'situacao',
    'construtora',
    'empreendimento',
    'analistaAprovacao',
    'analistaResponsavel',
    'dataAprovacao',
    'dataEntrada',
    'entrada',
    'convertidoParaProcesso',
    'processoId',
    'updatedAt',
    'createdAt',
    'cliente',
    'clientePrincipal',
    'nomeClientePrincipal',
    'nomesClientes',
    'cpfs',
    'cpfPrincipal'
  ]);

  for (const update of updates) {
    if (!update?.aprovacaoId) {
      return true;
    }

    if (update.type === 'create' || update.type === 'delete') {
      return true;
    }

    const changedFields = buildRealtimeAprovacaoFieldSet(update);
    if (changedFields.has('general')) {
      return true;
    }

    for (const field of changedFields) {
      if (riskyFields.has(field)) {
        return true;
      }
      if (field === state.sortField) {
        return true;
      }
    }

    if (!visibleIds.has(update.aprovacaoId)) {
      continue;
    }

    const updatedAprovacao = updatedMap.get(update.aprovacaoId);
    if (!updatedAprovacao) {
      return true;
    }
  }

  return false;
}

function patchVisibleAprovacoesCollection(collection = [], updatedMap = new Map(), updatesById = new Map()) {
  const source = Array.isArray(collection) ? collection : [];
  const deletedIds = new Set(
    Array.from(updatesById.values())
      .filter((update) => update?.type === 'delete')
      .map((update) => update.aprovacaoId)
      .filter(Boolean)
  );

  let changed = false;
  let next = deletedIds.size > 0
    ? source.filter((item) => {
      const shouldKeep = !deletedIds.has(item?.id);
      if (!shouldKeep) changed = true;
      return shouldKeep;
    })
    : source.slice();

  const indexById = new Map(next.map((item, index) => [item?.id, index]));
  updatesById.forEach((update, aprovacaoId) => {
    if (!aprovacaoId || update?.type === 'delete') return;
    const existingIndex = indexById.get(aprovacaoId);
    if (existingIndex === undefined) return;

    const updatedAprovacao = updatedMap.get(aprovacaoId);
    if (!updatedAprovacao) return;

    next[existingIndex] = {
      ...next[existingIndex],
      ...updatedAprovacao
    };
    changed = true;
  });

  return changed ? next : source;
}

async function applyRealtimeAprovacaoDelta({ aprovacoes = [], updates = [] } = {}) {
  const normalizedAprovacoes = Array.isArray(aprovacoes)
    ? aprovacoes.filter((item) => item?.id)
    : [];

  if (shouldForceRefreshForRealtimeAprovacoes(updates, normalizedAprovacoes)) {
    scheduleRealtimeAprovacaoRefresh('delta-refresh');
    return;
  }

  const updatesById = new Map(
    (Array.isArray(updates) ? updates : [])
      .filter((update) => update?.aprovacaoId)
      .map((update) => [update.aprovacaoId, update])
  );
  if (updatesById.size === 0) {
    return;
  }

  const updatedMap = new Map(normalizedAprovacoes.map((item) => [item.id, item]));
  const pageIndex = Math.max(state.currentPage - 1, 0);
  const nextPageData = patchVisibleAprovacoesCollection(state.allAprovacoesPageData, updatedMap, updatesById);

  if (nextPageData === state.allAprovacoesPageData) {
    return;
  }

  state.allAprovacoesPageData = nextPageData;
  state.aprovacoes = nextPageData.filter((item) => !isSolicitacaoAnalise(item));
  mergeInlineAnalystOptionsFromAprovacoes(state.aprovacoes);
  state.lastLoadedAt = Date.now();

  const cachedPage = state.pageDataCache.get(pageIndex);
  if (cachedPage) {
    state.pageDataCache.set(pageIndex, {
      ...cachedPage,
      data: nextPageData
    });
  }

  renderTable();
  updatePagination();
  updateMenuBadge();
}

/**
 * Exibe a pagina e carrega dados
 */
export async function show() {
  if (!state.initialized) {
    await initialize();
  }

  if (canReuseLoadedData()) {
    renderCurrentState();
    return;
  }

  await loadData();
}

/**
 * Atualiza a pagina
 */
export async function refresh() {
  aprovacaoService.invalidateCache();
  await cacheService.invalidateByPattern(/^aprovacoes_conversion_summary_/);
  state.inlineAnalystOptions = new Map();
  resetPaginationState();
  state.stats = null;
  state.statsLoadedAt = 0;
  state.statsSignature = '';
  state.lastLoadedAt = 0;
  state.hasLoadedOnce = false;
  state.conversionSignature = '';
  state.conversionSummary = null;
  state.conversionPartial = false;
  state.allAprovacoesPageData = [];
  state.solicitacoesAnalise = [];
  state.solicitacoesLoadedAt = 0;
  state.solicitacoesPartial = false;
  await loadData();
}

export async function dispose(reason = 'manual') {
  console.log(`[AprovacaoPage] Liberando recursos (${reason})`);

  if (aprovacoesDeltaRefreshTimer) {
    clearTimeout(aprovacoesDeltaRefreshTimer);
    aprovacoesDeltaRefreshTimer = null;
  }

  if (typeof aprovacoesDeltaUnsubscribe === 'function') {
    try {
      aprovacoesDeltaUnsubscribe();
    } catch (error) {
      console.warn('[AprovacaoPage] Falha ao encerrar listener delta:', error);
    }
    aprovacoesDeltaUnsubscribe = null;
  }

  const solicitacoesModal = document.getElementById(SOLICITACOES_MODAL_ID);
  if (solicitacoesModal) {
    try {
      const modalInstance = window.bootstrap?.Modal?.getInstance?.(solicitacoesModal);
      modalInstance?.hide();
    } catch (error) {
      console.warn('[AprovacaoPage] Falha ao ocultar modal de solicitacoes:', error);
    }
    solicitacoesModal.remove();
  }

  clearRegisteredListeners();

  state.aprovacoes = [];
  state.filteredAprovacoes = [];
  state.stats = null;
  state.lastDoc = null;
  state.pageCursors = [null];
  state.pageCursorIds = [null];
  state.pageDataCache = new Map();
  state.hasMore = false;
  state.loading = false;
  state.initialized = false;
  state.vendors = [];
  state.analysts = [];
  state.analystDisplayMap = new Map();
  state.inlineAnalystOptions = new Map();
  state.lastLoadedAt = 0;
  state.hasLoadedOnce = false;
  state.statsLoadedAt = 0;
  state.statsSignature = '';
  state.conversionSummary = null;
  state.conversionSignature = '';
  state.conversionPartial = false;
  state.allAprovacoesPageData = [];
  state.solicitacoesAnalise = [];
  state.solicitacoesLoadedAt = 0;
  state.solicitacoesPartial = false;
  elements = {};
}

function canReuseLoadedData() {
  if (!state.hasLoadedOnce) return false;
  return (Date.now() - state.lastLoadedAt) < PAGE_RELOAD_TTL_MS;
}

function resetPaginationState() {
  state.currentPage = 1;
  state.lastDoc = null;
  state.hasMore = false;
  state.pageCursors = [null];
  state.pageCursorIds = [null];
  state.pageDataCache = new Map();
}

function renderCurrentState() {
  updateKPIs();
  renderTable();
  updatePagination();
  updateMenuBadge();
}

function shouldReloadStats() {
  if (!state.stats) return true;
  return (Date.now() - state.statsLoadedAt) >= STATS_RELOAD_TTL_MS;
}

/**
 * Configura event listeners
 */
function setupEventListeners() {
  // Busca
  if (elements.searchInput) {
    let searchTimeout;
    registerDisposableListener(elements.searchInput, 'input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        state.searchTerm = e.target.value.trim();
        resetPaginationState();
        loadData();
      }, 500);
    });
  }

  if (elements.searchClear) {
    registerDisposableListener(elements.searchClear, 'click', () => {
      if (elements.searchInput) {
        elements.searchInput.value = '';
        state.searchTerm = '';
        resetPaginationState();
        loadData();
      }
    });
  }

  // Tabs de filtro
  elements.tabs.forEach(tab => {
    registerDisposableListener(tab, 'click', (e) => {
      elements.tabs.forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      state.currentFilter = e.target.dataset.filter;
      resetPaginationState();
      loadData();
    });
  });

  // Botoes
  if (elements.refreshBtn) {
    registerDisposableListener(elements.refreshBtn, 'click', refresh);
  }

  if (elements.addBtn) {
    registerDisposableListener(elements.addBtn, 'click', openAddModal);
  }

  if (elements.intakeLinkBtn) {
    registerDisposableListener(elements.intakeLinkBtn, 'click', generatePublicIntakeLink);
  }

  if (elements.solicitacoesBtn) {
    registerDisposableListener(elements.solicitacoesBtn, 'click', openSolicitacoesModal);
  }

  if (elements.addEmptyBtn) {
    registerDisposableListener(elements.addEmptyBtn, 'click', openAddModal);
  }

  if (elements.exportCsv) {
    registerDisposableListener(elements.exportCsv, 'click', exportToCSV);
  }

  if (elements.importCsv) {
    registerDisposableListener(elements.importCsv, 'click', openImportModal);
  }

  if (elements.filtersBtn) {
    registerDisposableListener(elements.filtersBtn, 'click', openFiltersOffcanvas);
  }

  // Paginacao
  if (elements.pageSize) {
    registerDisposableListener(elements.pageSize, 'change', (e) => {
      state.pageSize = parseInt(e.target.value);
      resetPaginationState();
      loadData();
    });
  }

  if (elements.prevBtn) {
    registerDisposableListener(elements.prevBtn, 'click', () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        loadData();
      }
    });
  }

  if (elements.nextBtn) {
    registerDisposableListener(elements.nextBtn, 'click', () => {
      if (state.hasMore) {
        state.currentPage++;
        loadData();
      }
    });
  }

  // Ordenacao nas colunas
  document.querySelectorAll('#aprovacao-table th.sortable').forEach(th => {
    registerDisposableListener(th, 'click', () => {
      const sortField = th.dataset.sort;
      if (state.sortField === sortField) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortField = sortField;
        state.sortDirection = 'desc';
      }
      resetPaginationState();
      loadData();
    });
  });

  // Delegacao de eventos para acoes na tabela
  if (elements.tableBody) {
    registerDisposableListener(elements.tableBody, 'click', handleTableAction);
  }

  if (elements.inlineFilterFields?.length > 0) {
    let inlineFilterInputTimeout;

    elements.inlineFilterFields.forEach((field) => {
      const eventName = field.tagName === 'INPUT' && field.type === 'text' ? 'input' : 'change';
      registerDisposableListener(field, eventName, () => {
        const filterKey = field.dataset.inlineFilter;
        if (!filterKey) return;

        const nextValue = String(field.value || '').trim();
        const previousValue = String(state.inlineFilters[filterKey] || '').trim();
        state.inlineFilters[filterKey] = nextValue;
        if (nextValue === previousValue) return;

        const isTextInput = field.tagName === 'INPUT' && field.type === 'text';
        const triggerReload = () => {
          resetPaginationState();
          loadData();
        };

        if (isTextInput) {
          clearTimeout(inlineFilterInputTimeout);
          inlineFilterInputTimeout = setTimeout(triggerReload, 350);
        } else {
          triggerReload();
        }
      });
    });
  }

  if (elements.inlineFilterClearBtn) {
    registerDisposableListener(elements.inlineFilterClearBtn, 'click', clearInlineFilters);
  }
}

/**
 * Carrega dados da pagina
 */
async function loadData() {
  if (state.loading) return;

  let pageIndex = Math.max(state.currentPage - 1, 0);
  if (
    pageIndex > 0
    && typeof state.pageCursors[pageIndex] === 'undefined'
    && typeof state.pageCursorIds[pageIndex] === 'undefined'
  ) {
    resetPaginationState();
    pageIndex = 0;
  }

  const startAfterDoc = pageIndex > 0 ? state.pageCursors[pageIndex] || null : null;
  const startAfterDocId = pageIndex > 0
    ? (state.pageCursorIds[pageIndex] || startAfterDoc?.id || null)
    : null;

  if (pageIndex > 0 && !startAfterDoc && !startAfterDocId) {
    resetPaginationState();
    pageIndex = 0;
  }

  state.loading = true;
  showLoading();

  try {
    const runtimeFlags = window.firestoreService?.getSystemFlags
      ? await window.firestoreService.getSystemFlags()
      : {};
    const useAggregateReadPath = runtimeFlags.enableAprovacoesAggregatesReadPath === true;

    // Monta opcoes de filtro
    const inlineDataEntrada = String(state.inlineFilters?.dataEntrada || '').trim();
    const inlineEmpreendimento = String(state.inlineFilters?.empreendimento || '').trim();
    const inlineConstrutora = String(state.inlineFilters?.construtora || '').trim();
    const inlineSituacao = String(state.inlineFilters?.situacao || '').trim();
    const inlineDataAprovacao = String(state.inlineFilters?.dataAprovacao || '').trim();
    const inlineAnalista = String(state.inlineFilters?.analista || '').trim();
    const options = {
      pageSize: state.pageSize,
      startAfterDoc,
      startAfterDocId,
      orderBy: state.sortField,
      orderDirection: state.sortDirection,
      searchTerm: state.searchTerm,
      includeAllAuthenticated: true
    };

    // Filtro por situacao (tabs)
    if (state.currentFilter === 'pendentes-conversao') {
      options.situacao = SITUACAO_APROVACAO.APROVADO;
      options.convertidoParaProcesso = false;
    } else if (state.currentFilter !== 'todas') {
      options.situacao = state.currentFilter;
    }

    // Aplica filtros avancados
    if (state.advancedFilters) {
      if (state.advancedFilters.situacao?.length > 0) {
        options.situacao = state.advancedFilters.situacao;
      }
      if (state.advancedFilters.construtora?.length > 0) {
        options.construtora = state.advancedFilters.construtora;
      }
      if (state.advancedFilters.dataInicio) {
        options.dataInicio = state.advancedFilters.dataInicio;
      }
      if (state.advancedFilters.dataFim) {
        options.dataFim = state.advancedFilters.dataFim;
      }
      if (state.advancedFilters.analista) {
        options.analistaAprovacao = state.advancedFilters.analista;
      }
      if (state.advancedFilters.conversao === 'pendente') {
        options.situacao = SITUACAO_APROVACAO.APROVADO;
        options.convertidoParaProcesso = false;
      } else if (state.advancedFilters.conversao === 'convertido') {
        options.convertidoParaProcesso = true;
      }
    }

    // Filtros inline (server-side) com maior prioridade para manter paginação consistente
    if (inlineSituacao) {
      options.situacao = inlineSituacao;
    }
    if (inlineConstrutora) {
      options.construtora = inlineConstrutora;
    }
    if (inlineEmpreendimento) {
      options.empreendimento = inlineEmpreendimento;
    }
    if (inlineAnalista) {
      options.analistaAprovacao = inlineAnalista;
    }
    if (inlineDataAprovacao) {
      options.dataAprovacao = inlineDataAprovacao;
    }
    if (inlineDataEntrada) {
      options.dataEntrada = inlineDataEntrada;
    }

    const statsPeriodInicio = inlineDataAprovacao || state.advancedFilters?.dataInicio || null;
    const statsPeriodFim = inlineDataAprovacao || state.advancedFilters?.dataFim || null;
    const statsAnalystFilter = state.advancedFilters?.analista || inlineAnalista || null;
    const statsSignature = JSON.stringify({
      mode: useAggregateReadPath ? 'aggregate' : 'legacy',
      dataInicio: statsPeriodInicio,
      dataFim: statsPeriodFim,
      analistaAprovacao: statsAnalystFilter
    });

    // Evita reconsulta frequente de estatisticas completas quando somente a listagem mudou.
    const reloadStats = shouldReloadStats() || state.statsSignature !== statsSignature;
    const statsPromise = reloadStats
      ? aprovacaoService.getAprovacaoStats({
        includeAllAuthenticated: true,
        mode: useAggregateReadPath ? 'aggregate' : 'legacy',
        preferAggregates: useAggregateReadPath,
        forceRefresh: reloadStats,
        dataInicio: statsPeriodInicio || undefined,
        dataFim: statsPeriodFim || undefined,
        analistaAprovacao: statsAnalystFilter || undefined
      })
      : Promise.resolve(state.stats);

    const cachedPage = state.pageDataCache.get(pageIndex);
    if (cachedPage) {
      applyPageResultToState(cachedPage, pageIndex, { cachePage: false });
    } else {
      const result = await aprovacaoService.listAprovacoes(options);
      applyPageResultToState(result, pageIndex);
    }

    const stats = await statsPromise;
    state.stats = stats || state.stats;
    if (reloadStats && stats) {
      state.statsLoadedAt = Date.now();
      state.statsSignature = statsSignature;
    }
    state.lastLoadedAt = Date.now();
    state.hasLoadedOnce = true;
    await refreshConversionSummaryIfNeeded();

    // Atualiza UI
    updateKPIs();
    renderTable();
    updatePagination();

    // Atualiza badge no menu lateral
    updateMenuBadge();

  } catch (error) {
    console.error('[AprovacaoPage] Erro ao carregar dados:', error);
    showError('Erro ao carregar aprovacoes: ' + error.message);
  } finally {
    state.loading = false;
  }
}

function getConversionPeriodFilters() {
  return {
    dataInicio: state.advancedFilters?.dataInicio || null,
    dataFim: state.advancedFilters?.dataFim || null
  };
}

function buildConversionSignature(filters = {}) {
  return `${filters.dataInicio || ''}|${filters.dataFim || ''}`;
}

async function refreshConversionSummaryIfNeeded() {
  const filters = getConversionPeriodFilters();
  const signature = buildConversionSignature(filters);
  if (state.conversionSummary && state.conversionSignature === signature) {
    return;
  }

  const cacheKey = `${CONVERSION_SUMMARY_CACHE_PREFIX}${signature}`;
  const cachedSummary = await cacheService.getCached(cacheKey, 'aprovacoesStats');
  if (cachedSummary && (Object.prototype.hasOwnProperty.call(cachedSummary, 'summary') || cachedSummary.partial)) {
    state.conversionSummary = cachedSummary.summary || null;
    state.conversionSignature = signature;
    state.conversionPartial = Boolean(cachedSummary.partial);
    mergeInlineAnalystOptionsFromEntries(cachedSummary.analystEntries || []);
    return;
  }

  try {
    const flags = window.firestoreService?.getSystemFlags
      ? await window.firestoreService.getSystemFlags()
      : {};
    const allowHeavyFallback = flags.enableContractsHeavyFallback !== false;
    const useAggregatePath = flags.enableAprovacoesAggregatesReadPath === true
      && typeof aprovacaoService.getAprovacaoConversionMetricsAggregate === 'function';

    const loadContractsForConversion = async () => {
      let contracts = [];

      if (Array.isArray(window.appState?.allContracts) && window.appState.allContracts.length > 0) {
        contracts = window.appState.allContracts;
      }

      if (
        (!Array.isArray(contracts) || contracts.length === 0)
        && window.cacheService?.getSync
      ) {
        contracts =
          window.cacheService.getSync('reports_contracts_all', 'contractsAll') ||
          window.cacheService.getSync('contracts_all_with_archived', 'contractsAll') ||
          window.cacheService.getSync('contracts_all_active', 'contractsAll') ||
          [];
      }

      if ((!Array.isArray(contracts) || contracts.length === 0) && typeof getContractsPage === 'function') {
        const page = await getContractsPage({
          limit: 300,
          page: 1,
          sortKey: 'updatedAt',
          sortDirection: 'desc',
          includeArchived: true
        });
        contracts = Array.isArray(page?.contracts) ? page.contracts : [];
      }

      if (
        allowHeavyFallback &&
        (!Array.isArray(contracts) || contracts.length === 0)
      ) {
        contracts = await getAllContracts({ includeArchived: true });
      }

      return Array.isArray(contracts) ? contracts : [];
    };

    const computeLegacyConversionSummary = async (contractsInput = null, aprovacoesResponseInput = null) => {
      const aprovacoesResponse = aprovacoesResponseInput || await aprovacaoService.listAprovacoesForMetrics({
        dataInicio: filters.dataInicio || undefined,
        dataFim: filters.dataFim || undefined,
        includeAllAuthenticated: true
      });
      const aprovacoesData = Array.isArray(aprovacoesResponse?.data) ? aprovacoesResponse.data : [];
      mergeInlineAnalystOptionsFromAprovacoes(aprovacoesData);
      analystEntries = Array.from(state.inlineAnalystOptions.values()).map((entry) => ({
        value: entry.value,
        display: entry.display
      }));

      const contracts = Array.isArray(contractsInput) ? contractsInput : await loadContractsForConversion();
      const summary = conversionMetricsService.computeAprovacaoConversaoMetrics({
        aprovacoes: aprovacoesData,
        processos: contracts || [],
        periodStart: filters.dataInicio,
        periodEnd: filters.dataFim,
        approvalDateField: 'dataAprovacao',
        denominatorMode: 'todas',
        matchingMode: 'cpf_intersection'
      });

      return {
        summary,
        aprovacoesResponse,
        contracts
      };
    };

    let analystEntries = [];
    let resolvedFromAggregate = false;
    if (useAggregatePath) {
      try {
        state.conversionSummary = await aprovacaoService.getAprovacaoConversionMetricsAggregate({
          dataInicio: filters.dataInicio || null,
          dataFim: filters.dataFim || null,
          denominatorMode: 'todas'
        });
        state.conversionPartial = false;
        resolvedFromAggregate = true;
      } catch (aggregateError) {
        console.warn('[AprovacaoPage] Falha ao ler KPI de conversao por agregados, aplicando fallback legacy:', aggregateError);
      }
    }

    if (!resolvedFromAggregate) {
      const { summary, aprovacoesResponse, contracts } = await computeLegacyConversionSummary();
      state.conversionSummary = summary;
      state.conversionPartial = Boolean(aprovacoesResponse?.partial);

      const shouldTryHeavyFallback = allowHeavyFallback
        && Number(state.conversionSummary?.totalAnalisesPeriodo || 0) > 0
        && Number(state.conversionSummary?.convertidas || 0) === 0
        && Array.isArray(contracts)
        && contracts.length > 0
        && contracts.length < 1200;

      if (shouldTryHeavyFallback) {
        try {
          const fullContracts = await getAllContracts({ includeArchived: true });
          if (Array.isArray(fullContracts) && fullContracts.length > contracts.length) {
            const recomputed = conversionMetricsService.computeAprovacaoConversaoMetrics({
              aprovacoes: Array.isArray(aprovacoesResponse?.data) ? aprovacoesResponse.data : [],
              processos: fullContracts,
              periodStart: filters.dataInicio,
              periodEnd: filters.dataFim,
              approvalDateField: 'dataAprovacao',
              denominatorMode: 'todas',
              matchingMode: 'cpf_intersection'
            });
            state.conversionSummary = {
              ...recomputed,
              source: 'legacy_full_contracts_fallback'
            };
          }
        } catch (fullFallbackError) {
          console.warn('[AprovacaoPage] Falha no fallback pesado de conversao:', fullFallbackError);
        }
      }
    }

    state.conversionSignature = signature;

    cacheService.set(cacheKey, {
      summary: state.conversionSummary,
      partial: state.conversionPartial,
      analystEntries
    }, 'aprovacoesStats');
  } catch (error) {
    console.warn('[AprovacaoPage] Erro ao calcular KPI de conversao:', error);
    state.conversionSummary = null;
    state.conversionSignature = signature;
    state.conversionPartial = false;
  }
}

/**
 * Atualiza os KPIs
 */
function updateKPIs() {
  const total = Number(state.stats?.total) || 0;
  const aprovados = Number(state.stats?.aprovados) || 0;
  const reprovados = Number(state.stats?.reprovados) || 0;
  const condicionados = Number(state.stats?.condicionados) || 0;

  if (elements.kpiTotal) {
    elements.kpiTotal.textContent = total.toLocaleString('pt-BR');
  }
  if (elements.kpiAprovados) {
    elements.kpiAprovados.textContent = aprovados.toLocaleString('pt-BR');
  }
  if (elements.kpiReprovados) {
    elements.kpiReprovados.textContent = reprovados.toLocaleString('pt-BR');
  }
  if (elements.kpiCondicionados) {
    elements.kpiCondicionados.textContent = condicionados.toLocaleString('pt-BR');
  }

  updateConversionKpi();
}

function updateConversionKpi() {
  const statsFallback = state.stats && typeof state.stats === 'object'
    ? {
      totalAnalisesPeriodo: Number(state.stats.total) || 0,
      convertidas: Math.max(
        (Number(state.stats.aprovados) || 0) - (Number(state.stats.pendentesConversao) || 0),
        0
      ),
      byOrigin: 0,
      byCpf: 0,
      taxaPercentual: (() => {
        const total = Number(state.stats.total) || 0;
        const converted = Math.max(
          (Number(state.stats.aprovados) || 0) - (Number(state.stats.pendentesConversao) || 0),
          0
        );
        return total > 0 ? Number(((converted / total) * 100).toFixed(1)) : 0;
      })(),
      estimated: true
    }
    : null;

  const summaryFromState = (state.conversionSummary && typeof state.conversionSummary === 'object')
    ? state.conversionSummary
    : null;

  let summary = summaryFromState || statsFallback;

  // Em alguns cenarios o caminho agregado pode retornar 0 convertidas por dados ainda
  // nao materializados; nesse caso, usa estimativa coerente baseada em stats.
  if (summaryFromState && statsFallback) {
    const aggregateTotal = Number(summaryFromState.totalAnalisesPeriodo || 0);
    const aggregateConverted = Number(summaryFromState.convertidas || 0);
    const estimatedConverted = Number(statsFallback.convertidas || 0);
    const shouldUseEstimated =
      (aggregateTotal <= 0 && Number(statsFallback.totalAnalisesPeriodo || 0) > 0)
      || (aggregateConverted <= 0 && estimatedConverted > 0);

    if (shouldUseEstimated) {
      summary = {
        ...summaryFromState,
        totalAnalisesPeriodo: aggregateTotal > 0
          ? aggregateTotal
          : Number(statsFallback.totalAnalisesPeriodo || 0),
        convertidas: estimatedConverted,
        taxaPercentual: Number(statsFallback.taxaPercentual || 0),
        estimated: true
      };
    }
  }

  if (!elements.kpiConversaoRate || !elements.kpiConversaoDetail) return;

  if (!summary) {
    elements.kpiConversaoRate.textContent = '0,0%';
    elements.kpiConversaoDetail.textContent = '0/0 convertidas';
    return;
  }

  const total = Number(summary.totalAnalisesPeriodo || 0);
  const converted = Number(summary.convertidas || 0);
  const byOrigin = Number(summary.byOrigin || 0);
  const byCpf = Number(summary.byCpf || 0);
  const pct = Number(summary.taxaPercentual || 0);

  elements.kpiConversaoRate.textContent = `${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

  const detailParts = [
    `${converted.toLocaleString('pt-BR')}/${total.toLocaleString('pt-BR')} convertidas`,
    `origem: ${byOrigin.toLocaleString('pt-BR')}`,
    `cpf: ${byCpf.toLocaleString('pt-BR')}`
  ];

  if (state.conversionPartial) {
    detailParts.push('amostra parcial');
  }
  if (summary.estimated) {
    detailParts.push('estimativa');
  }

  elements.kpiConversaoDetail.textContent = detailParts.join(' | ');
}

/**
 * Atualiza badge no menu lateral
 */
function updateMenuBadge() {
  // Badge de aprovacao removido da sidebar.
}

function registerInlineAnalystOption(value, displayOverride = null) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return;

  const rawKey = normalizeIdentity(rawValue);
  if (!rawKey) return;

  const resolvedDisplay = String(displayOverride || getAnalystDisplayName(rawValue) || rawValue).trim();
  const displayValue = resolvedDisplay && resolvedDisplay !== '-' ? resolvedDisplay : rawValue;
  const existing = state.inlineAnalystOptions.get(rawKey);

  if (!existing) {
    state.inlineAnalystOptions.set(rawKey, {
      value: rawValue,
      display: displayValue
    });
    return;
  }

  if (
    existing.display === existing.value
    && displayValue
    && displayValue !== existing.value
  ) {
    state.inlineAnalystOptions.set(rawKey, {
      value: existing.value,
      display: displayValue
    });
  }
}

function mergeInlineAnalystOptionsFromAprovacoes(aprovacoes = []) {
  if (!Array.isArray(aprovacoes) || aprovacoes.length === 0) return;
  aprovacoes.forEach((aprovacao) => registerInlineAnalystOption(aprovacao?.analistaAprovacao));
}

function mergeInlineAnalystOptionsFromEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    registerInlineAnalystOption(entry.value, entry.display);
  });
}

function applyPageResultToState(result, pageIndex, options = {}) {
  const { cachePage = true } = options;
  const data = Array.isArray(result?.data) ? result.data : [];

  state.allAprovacoesPageData = data;
  state.aprovacoes = data.filter((item) => !isSolicitacaoAnalise(item));
  mergeInlineAnalystOptionsFromAprovacoes(state.aprovacoes);

  state.lastDoc = result?.lastDoc || null;
  state.hasMore = Boolean(result?.hasMore);

  const nextPageCursorId = state.lastDoc?.id || result?.lastDocId || null;
  const nextPageIndex = pageIndex + 1;

  if (state.hasMore) {
    if (state.lastDoc) {
      state.pageCursors[nextPageIndex] = state.lastDoc;
    }
    if (nextPageCursorId) {
      state.pageCursorIds[nextPageIndex] = nextPageCursorId;
    }

    if (!state.pageCursors[nextPageIndex] && !state.pageCursorIds[nextPageIndex]) {
      state.hasMore = false;
    }
  }

  if (state.hasMore) {
    state.pageCursors = state.pageCursors.slice(0, nextPageIndex + 1);
    state.pageCursorIds = state.pageCursorIds.slice(0, nextPageIndex + 1);
  } else {
    state.pageCursors = state.pageCursors.slice(0, pageIndex + 1);
    state.pageCursorIds = state.pageCursorIds.slice(0, pageIndex + 1);
  }

  if (cachePage) {
    state.pageDataCache.set(pageIndex, {
      data,
      hasMore: state.hasMore,
      lastDoc: state.lastDoc,
      lastDocId: nextPageCursorId
    });
  }
}

function clearInlineFilters() {
  const hadAnyInlineFilter = Object.values(state.inlineFilters || {})
    .some((value) => Boolean(String(value || '').trim()));

  state.inlineFilters = {
    dataEntrada: '',
    empreendimento: '',
    construtora: '',
    situacao: '',
    dataAprovacao: '',
    analista: ''
  };

  if (elements.inlineFilterFields?.length > 0) {
    elements.inlineFilterFields.forEach((field) => {
      field.value = '';
    });
  }

  if (hadAnyInlineFilter) {
    resetPaginationState();
    loadData();
    return;
  }

  renderTable();
  updatePagination();
}

function syncInlineAnalistaFilterOptions() {
  const analistaSelect = elements.inlineAnalistaFilter;
  if (!analistaSelect) return;

  mergeInlineAnalystOptionsFromAprovacoes(state.aprovacoes);

  const selectedValue = String(state.inlineFilters.analista || '').trim();
  const options = Array.from(state.inlineAnalystOptions.values())
    .filter((entry) => entry && entry.value)
    .sort((a, b) => {
      const byDisplay = String(a.display || '').localeCompare(String(b.display || ''), 'pt-BR');
      if (byDisplay !== 0) return byDisplay;
      return String(a.value || '').localeCompare(String(b.value || ''), 'pt-BR');
    });
  const displayCollisionCount = new Map();

  options.forEach((entry) => {
    const key = normalizeIdentity(entry.display);
    if (!key) return;
    displayCollisionCount.set(key, (displayCollisionCount.get(key) || 0) + 1);
  });

  analistaSelect.innerHTML = '<option value="">Todos</option>';
  options.forEach((entry) => {
    const displayName = String(entry.display || entry.value || '').trim();
    const showRaw = (displayCollisionCount.get(normalizeIdentity(displayName)) || 0) > 1;

    const option = document.createElement('option');
    option.value = String(entry.value || '').trim();
    option.textContent = showRaw ? `${displayName} (${entry.value})` : displayName;
    analistaSelect.appendChild(option);
  });

  if (selectedValue) {
    if (!options.some((entry) => normalizeIdentity(entry.value) === normalizeIdentity(selectedValue))) {
      const option = document.createElement('option');
      option.value = selectedValue;
      option.textContent = getAnalystDisplayName(selectedValue);
      analistaSelect.appendChild(option);
    }
    analistaSelect.value = selectedValue;
  } else {
    analistaSelect.value = '';
  }
}

function applyInlineFilters(aprovacoes = []) {
  // Filtros inline principais agora são aplicados na consulta server-side para manter
  // paginação e ordenação consistentes entre páginas.
  return Array.isArray(aprovacoes) ? aprovacoes : [];
}

function hasComplexFiltersForStatsTotal() {
  const search = String(state.searchTerm || '').trim();
  if (search) return true;

  const inline = state.inlineFilters || {};
  if (String(inline.empreendimento || '').trim()) return true;
  if (String(inline.construtora || '').trim()) return true;
  if (String(inline.dataEntrada || '').trim()) return true;

  const advanced = state.advancedFilters || {};
  if (Array.isArray(advanced.empreendimento) && advanced.empreendimento.length > 0) return true;
  if (Array.isArray(advanced.construtora) && advanced.construtora.length > 0) return true;
  if (Array.isArray(advanced.cartaFinanciamento) && advanced.cartaFinanciamento.length > 0) return true;

  return false;
}

function sumStatsBySituacoes(stats, situacoes = []) {
  if (!stats || !Array.isArray(situacoes) || situacoes.length === 0) {
    return Number(stats?.total || 0);
  }

  const unique = Array.from(new Set(situacoes.map((item) => String(item || '').trim().toUpperCase())));
  let total = 0;
  unique.forEach((situacao) => {
    if (situacao === SITUACAO_APROVACAO.APROVADO) total += Number(stats.aprovados || 0);
    else if (situacao === SITUACAO_APROVACAO.REPROVADO) total += Number(stats.reprovados || 0);
    else if (situacao === SITUACAO_APROVACAO.CONDICIONADO) total += Number(stats.condicionados || 0);
  });
  return total;
}

function resolveResultsTotalFromStats() {
  if (!state.stats || hasComplexFiltersForStatsTotal()) return null;

  const inline = state.inlineFilters || {};
  const advanced = state.advancedFilters || {};

  const inlineSituacao = String(inline.situacao || '').trim().toUpperCase();
  let situacoesAtivas = [];

  if (inlineSituacao) {
    situacoesAtivas = [inlineSituacao];
  } else if (Array.isArray(advanced.situacao) && advanced.situacao.length > 0) {
    situacoesAtivas = advanced.situacao;
  } else if (
    state.currentFilter === SITUACAO_APROVACAO.APROVADO ||
    state.currentFilter === SITUACAO_APROVACAO.REPROVADO ||
    state.currentFilter === SITUACAO_APROVACAO.CONDICIONADO
  ) {
    situacoesAtivas = [state.currentFilter];
  }

  if (state.currentFilter === 'pendentes-conversao') {
    return Number(state.stats.pendentesConversao || 0);
  }

  let total = sumStatsBySituacoes(state.stats, situacoesAtivas);
  const conversaoFiltro = String(advanced.conversao || '').trim().toLowerCase();

  if (conversaoFiltro === 'pendente') {
    const usaSomenteAprovadas = situacoesAtivas.length === 0
      || situacoesAtivas.every((value) => String(value || '').trim().toUpperCase() === SITUACAO_APROVACAO.APROVADO);
    if (!usaSomenteAprovadas) return null;
    total = Number(state.stats.pendentesConversao || 0);
  } else if (conversaoFiltro === 'convertido') {
    const usaSomenteAprovadas = situacoesAtivas.length === 0
      || situacoesAtivas.every((value) => String(value || '').trim().toUpperCase() === SITUACAO_APROVACAO.APROVADO);
    if (!usaSomenteAprovadas) return null;
    total = Math.max(
      Number(state.stats.aprovados || 0) - Number(state.stats.pendentesConversao || 0),
      0
    );
  }

  return Number.isFinite(total) ? Math.max(total, 0) : null;
}

function formatResultsCountText(pageCount, totalFromStats) {
  const currentPageCount = Math.max(Number(pageCount) || 0, 0);
  const hasKnownTotal = Number.isFinite(totalFromStats) && Number(totalFromStats) >= 0;
  const total = hasKnownTotal ? Math.max(Number(totalFromStats), 0) : null;

  if (currentPageCount === 0) {
    return hasKnownTotal
      ? `Mostrando 0 de ${total.toLocaleString('pt-BR')} registros`
      : '0 registros';
  }

  if (!hasKnownTotal) {
    return `${currentPageCount.toLocaleString('pt-BR')} registros`;
  }

  const pageSize = Math.max(Number(state.pageSize) || currentPageCount, 1);
  const currentPage = Math.max(Number(state.currentPage) || 1, 1);
  const start = ((currentPage - 1) * pageSize) + 1;
  const end = Math.min(start + currentPageCount - 1, total);

  if (end >= start) {
    return `Mostrando ${start.toLocaleString('pt-BR')}-${end.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} registros`;
  }

  return `Mostrando ${currentPageCount.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} registros`;
}

/**
 * Renderiza a tabela de aprovacoes
 */
function renderTable() {
  if (!elements.tableBody) return;

  elements.tableBody.classList.remove('aprovacao-table-loading-soft');

  syncInlineAnalistaFilterOptions();

  const aprovacoesFiltradas = applyInlineFilters(state.aprovacoes);
  state.filteredAprovacoes = aprovacoesFiltradas;

  // Limpa tabela (exceto loading e empty rows)
  const rows = elements.tableBody.querySelectorAll('tr:not(#aprovacao-loading-row):not(#aprovacao-empty-row)');
  rows.forEach(row => row.remove());

  // Esconde loading
  if (elements.loadingRow) {
    elements.loadingRow.classList.add('d-none');
  }

  // Verifica se tem dados
  if (aprovacoesFiltradas.length === 0) {
    if (elements.emptyRow) {
      elements.emptyRow.classList.remove('d-none');
    }
    if (elements.resultsCount) {
      const totalFromStats = resolveResultsTotalFromStats();
      elements.resultsCount.textContent = formatResultsCountText(0, totalFromStats);
    }
    return;
  }

  // Esconde empty row
  if (elements.emptyRow) {
    elements.emptyRow.classList.add('d-none');
  }

  // Renderiza linhas
  aprovacoesFiltradas.forEach(aprovacao => {
    const row = createTableRow(aprovacao);
    elements.tableBody.appendChild(row);
  });

  // Atualiza contador
  if (elements.resultsCount) {
    const pageCount = aprovacoesFiltradas.length;
    const totalFromStats = resolveResultsTotalFromStats();
    elements.resultsCount.textContent = formatResultsCountText(pageCount, totalFromStats);
  }
}

/**
 * Cria uma linha da tabela
 */
function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function parseDateValue(value) {
  if (value === undefined || value === null || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === 'function') {
    const dateFromTimestamp = value.toDate();
    return Number.isNaN(dateFromTimestamp?.getTime?.()) ? null : dateFromTimestamp;
  }

  if (typeof value?.toMillis === 'function') {
    const dateFromMillis = new Date(value.toMillis());
    return Number.isNaN(dateFromMillis.getTime()) ? null : dateFromMillis;
  }

  if (typeof value === 'number') {
    const dateFromNumber = new Date(value);
    return Number.isNaN(dateFromNumber.getTime()) ? null : dateFromNumber;
  }

  if (typeof value === 'object') {
    const seconds = typeof value.seconds === 'number'
      ? value.seconds
      : (typeof value._seconds === 'number' ? value._seconds : null);
    const nanoseconds = typeof value.nanoseconds === 'number'
      ? value.nanoseconds
      : (typeof value._nanoseconds === 'number' ? value._nanoseconds : 0);

    if (seconds !== null) {
      const dateFromSerializedTimestamp = new Date((seconds * 1000) + Math.floor(nanoseconds / 1000000));
      return Number.isNaN(dateFromSerializedTimestamp.getTime()) ? null : dateFromSerializedTimestamp;
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsedIsoDate = new Date(`${trimmed}T00:00:00`);
      return Number.isNaN(parsedIsoDate.getTime()) ? null : parsedIsoDate;
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      const [day, month, year] = trimmed.split('/');
      const parsedBrDate = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(parsedBrDate.getTime()) ? null : parsedBrDate;
    }

    if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
      const [day, month, year] = trimmed.split('-');
      const parsedBrDashDate = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(parsedBrDashDate.getTime()) ? null : parsedBrDashDate;
    }

    const normalized = trimmed.includes(' ') ? trimmed.replace(' ', 'T') : trimmed;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function toComparableDate(value) {
  const date = parseDateValue(value);
  if (!date) return 0;
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function isSolicitacaoAnalise(aprovacao = {}) {
  const origemCanal = normalizeIdentity(aprovacao?.origemCanal);
  const hasKnownOrigin = SOLICITACAO_ORIGENS.has(origemCanal)
    || Boolean(aprovacao?.origemWhatsAppChatId)
    || Boolean(aprovacao?.origemSolicitacaoId);

  if (!hasKnownOrigin) return false;

  const analyst = normalizeIdentity(aprovacao?.analistaAprovacao);
  return !analyst || analyst === INTAKE_ANALYST_QUEUE;
}

function findAprovacaoById(id) {
  if (!id) return null;
  return state.aprovacoes.find((item) => item.id === id)
    || state.allAprovacoesPageData.find((item) => item.id === id)
    || state.solicitacoesAnalise.find((item) => item.id === id)
    || null;
}

function getCurrentUserRole() {
  const roleFromPermissionsHelper = window.permissionsUIHelper?.currentUserPermissions?.role;
  const roleFromAppState = window.appState?.userPermissions?.role;
  return normalizeIdentity(roleFromPermissionsHelper || roleFromAppState);
}

function isCurrentUserAdmin() {
  return ADMIN_ROLES.has(getCurrentUserRole());
}

function isAprovacaoCreatedByCurrentUser(aprovacao) {
  const currentUser = auth.currentUser;
  if (!currentUser) return false;

  const userIdentities = new Set(
    [currentUser.uid, currentUser.email]
      .map(normalizeIdentity)
      .filter(Boolean)
  );
  if (userIdentities.size === 0) return false;

  const creatorCandidates = [
    aprovacao?.criadoPor,
    aprovacao?.createdBy,
    aprovacao?.criadoPorUid,
    aprovacao?.createdByUid,
    aprovacao?.ownerId
  ];

  return creatorCandidates
    .map(normalizeIdentity)
    .some((identity) => identity && userIdentities.has(identity));
}

function canCurrentUserDeleteAprovacao(aprovacao) {
  return isCurrentUserAdmin() || isAprovacaoCreatedByCurrentUser(aprovacao);
}

function createTableRow(aprovacao) {
  const row = document.createElement('tr');
  row.dataset.id = aprovacao.id;

  const situacaoColor = SITUACAO_COLORS[aprovacao.situacao] || SITUACAO_COLORS[SITUACAO_APROVACAO.CONDICIONADO];

  const dataEntradaFormatada = formatDateForDisplay(
    aprovacao.dataEntrada || aprovacao.entrada || aprovacao.createdAt || aprovacao.criadoEm
  );
  const dataAprovacaoFormatada = formatDateForDisplay(aprovacao.dataAprovacao);
  const analistaDisplay = getAnalystDisplayName(aprovacao.analistaAprovacao);

  // Badge de conversao
  let conversionBadge = '';
  if (aprovacao.convertidoParaProcesso) {
    conversionBadge = `<span class="badge bg-info ms-1" title="Convertido para processo"><i class="bi bi-arrow-right-circle"></i></span>`;
  }

  const compradores = getAprovacaoCompradores(aprovacao);
  const principal = compradores.find(comp => comp.principal) || compradores[0];
  const nomePrincipal = principal?.nome || aprovacao.clientePrincipal || aprovacao.nomeClientePrincipal || '-';
  const cpfPrincipal = principal?.cpf || aprovacao.cpfPrincipal || '-';
  const outrosCount = compradores.length > 1 ? compradores.length - 1 : 0;

  row.innerHTML = `
    <td>${escapeHtml(dataEntradaFormatada)}</td>
    <td>
      <div class="fw-medium">${escapeHtml(nomePrincipal)}</div>
      ${outrosCount > 0 ? `<small class="text-muted">+${outrosCount} outros</small>` : ''}
    </td>
    <td>
      <code class="small">${escapeHtml(cpfPrincipal)}</code>
    </td>
    <td>${escapeHtml(aprovacao.empreendimento || '-')}</td>
    <td>${escapeHtml(aprovacao.construtora || '-')}</td>
    <td>
      <span class="badge ${situacaoColor.bg} ${situacaoColor.text}">
        <i class="bi ${situacaoColor.icon} me-1"></i>${aprovacao.situacao}
      </span>
      ${conversionBadge}
    </td>
    <td>${escapeHtml(dataAprovacaoFormatada)}</td>
    <td>${escapeHtml(analistaDisplay)}</td>
    <td class="text-end">
      <div class="btn-group btn-group-sm">
        <button class="btn btn-outline-primary" data-action="view" data-id="${aprovacao.id}" title="Ver detalhes">
          <i class="bi bi-eye"></i>
        </button>
        <button class="btn btn-outline-secondary" data-action="edit" data-id="${aprovacao.id}" title="Editar">
          <i class="bi bi-pencil"></i>
        </button>
        ${aprovacao.situacao === SITUACAO_APROVACAO.APROVADO && !aprovacao.convertidoParaProcesso ? `
          <button class="btn btn-outline-success" data-action="convert" data-id="${aprovacao.id}" title="Converter para processo">
            <i class="bi bi-arrow-right-circle"></i>
          </button>
        ` : ''}
        ${canCurrentUserDeleteAprovacao(aprovacao) ? `
          <button class="btn btn-outline-danger" data-action="delete" data-id="${aprovacao.id}" title="Excluir analise">
            <i class="bi bi-trash"></i>
          </button>
        ` : ''}
      </div>
    </td>
  `;

  return row;
}

function buildAnalystDisplayMap(analysts = []) {
  const map = new Map();

  analysts.forEach((analyst) => {
    const shortName = String(analyst?.shortName || '').trim();
    const fullName = String(analyst?.fullName || '').trim();
    const email = String(analyst?.email || '').trim();
    const displayName = shortName || fullName || email;

    if (!displayName) return;

    [shortName, fullName, email]
      .filter(Boolean)
      .forEach((value) => map.set(value.toLowerCase(), displayName));
  });

  return map;
}

function getAnalystDisplayName(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '-';

  const mapped = state.analystDisplayMap.get(rawValue.toLowerCase());
  return mapped || rawValue;
}

function formatDateForDisplay(timestamp) {
  const date = parseDateValue(timestamp);
  if (!date) return '-';
  // Formata sempre no fuso horário de Brasília (UTC-3)
  const options = { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
    timeZone: 'America/Sao_Paulo'
  };
  return new Intl.DateTimeFormat('pt-BR', options).format(date);
}

function getAprovacaoCompradores(aprovacao) {
  if (Array.isArray(aprovacao.compradores) && aprovacao.compradores.length > 0) {
    return aprovacao.compradores.map((comprador, index) => ({
      cpf: comprador.cpf || '',
      nome: comprador.nome || '',
      principal: comprador.principal ?? index === 0
    }));
  }

  const cpfs = Array.isArray(aprovacao.cpfs) ? aprovacao.cpfs : [];
  const nomes = Array.isArray(aprovacao.nomesClientes) ? aprovacao.nomesClientes : [];
  const maxLength = Math.max(cpfs.length, nomes.length);
  if (maxLength === 0 && (aprovacao.cpfPrincipal || aprovacao.nomeClientePrincipal || aprovacao.clientePrincipal)) {
    return [{
      cpf: aprovacao.cpfPrincipal || '',
      nome: aprovacao.clientePrincipal || aprovacao.nomeClientePrincipal || '',
      principal: true
    }];
  }

  const compradores = [];
  for (let i = 0; i < maxLength; i += 1) {
    compradores.push({
      cpf: cpfs[i] || '',
      nome: nomes[i] || '',
      principal: i === 0
    });
  }
  return compradores;
}

/**
 * Atualiza paginacao
 */
function updatePagination() {
  if (elements.prevBtn) {
    elements.prevBtn.disabled = state.currentPage <= 1;
  }
  if (elements.nextBtn) {
    elements.nextBtn.disabled = !state.hasMore;
  }
  if (elements.pageInfo) {
    elements.pageInfo.textContent = `Pagina ${state.currentPage}`;
  }
}

/**
 * Trata acoes na tabela
 */
async function handleTableAction(e) {
  const button = e.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  switch (action) {
    case 'view':
      openDetailsModal(id);
      break;
    case 'edit':
      openEditModal(id);
      break;
    case 'convert':
      await convertToProcess(id);
      break;
    case 'delete':
      await deleteAprovacaoAction(id);
      break;
  }
}

async function deleteAprovacaoAction(id) {
  const aprovacao = state.aprovacoes.find(a => a.id === id);
  if (!aprovacao) return;

  if (!canCurrentUserDeleteAprovacao(aprovacao)) {
    notify('Voce nao tem permissao para excluir esta analise.', 'error');
    return;
  }

  const confirmMessage = 'Tem certeza que deseja excluir esta analise? Esta acao nao pode ser desfeita.';
  const confirmed = window.uiHelpers?.confirmAction
    ? await window.uiHelpers.confirmAction({
        title: 'Excluir analise',
        message: confirmMessage,
        confirmText: 'Excluir',
        confirmClass: 'btn-danger',
        icon: 'bi-trash',
        iconColor: 'text-danger'
      })
    : window.confirm(confirmMessage);

  if (!confirmed) return;

  try {
    await aprovacaoService.deleteAprovacao(id, { aprovacao });
    notify('Analise excluida com sucesso.', 'success');
    await refresh();
  } catch (error) {
    console.error('[AprovacaoPage] Erro ao excluir analise:', error);
    notify('Erro ao excluir analise: ' + error.message, 'error');
  }
}

/**
 * Abre modal de adicionar
 */
function openAddModal() {
  // Importa e abre o modal
  import('../modals/AddAprovacaoModal.js').then(module => {
    module.default.open(state.vendors);
  }).catch(err => {
    console.error('[AprovacaoPage] Erro ao abrir modal:', err);
    alert('Erro ao abrir formulario de cadastro');
  });
}

async function openSolicitacoesModal() {
  const modalEl = ensureSolicitacoesModal();
  if (!modalEl) return;

  const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
  modalInstance.show();

  const tableBody = document.getElementById('aprovacao-solicitacoes-table-body');
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4">
          <span class="spinner-border spinner-border-sm text-primary me-2" role="status" aria-hidden="true"></span>
          Carregando solicitacoes...
        </td>
      </tr>
    `;
  }

  setSolicitacoesModalLoading(true);
  try {
    await loadSolicitacoesAnalise();
    renderSolicitacoesModalRows(state.solicitacoesAnalise);
  } catch (error) {
    console.error('[AprovacaoPage] Erro ao carregar solicitacoes de analise:', error);
    notify(`Nao foi possivel carregar as solicitacoes: ${error.message}`, 'error');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-4 text-danger">
            Falha ao carregar solicitacoes de analise.
          </td>
        </tr>
      `;
    }
  } finally {
    setSolicitacoesModalLoading(false);
  }
}

function ensureSolicitacoesModal() {
  let modalEl = document.getElementById(SOLICITACOES_MODAL_ID);
  if (modalEl) return modalEl;

  const html = `
    <div class="modal fade" id="${SOLICITACOES_MODAL_ID}" tabindex="-1" aria-labelledby="aprovacao-solicitacoes-title" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="aprovacao-solicitacoes-title">
              <i class="bi bi-inbox me-2 text-warning"></i>Solicitacoes de Analise
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <p class="text-muted mb-0">Entradas de WhatsApp e link publico aguardando triagem inicial.</p>
              <div class="d-flex align-items-center gap-2">
                <span id="aprovacao-solicitacoes-count" class="badge text-bg-light">0 solicitacoes</span>
                <button type="button" class="btn btn-outline-primary btn-sm" id="aprovacao-solicitacoes-refresh-btn">
                  <i class="bi bi-arrow-clockwise me-1"></i>Atualizar
                </button>
              </div>
            </div>
            <div id="aprovacao-solicitacoes-partial" class="alert alert-warning py-2 px-3 small d-none">
              A listagem foi carregada de forma parcial. Refine filtros ou atualize novamente para conferir mais registros.
            </div>
            <div class="table-responsive">
              <table class="table table-sm table-hover align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>Entrada</th>
                    <th>Cliente</th>
                    <th>CPF</th>
                    <th>Canal</th>
                    <th>Contato</th>
                    <th>Situacao</th>
                    <th class="text-end">Acoes</th>
                  </tr>
                </thead>
                <tbody id="aprovacao-solicitacoes-table-body">
                  <tr>
                    <td colspan="7" class="text-center text-muted py-4">Sem dados carregados.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  modalEl = document.getElementById(SOLICITACOES_MODAL_ID);
  if (!modalEl) return null;

  modalEl.addEventListener('hide.bs.modal', () => {
    if (modalEl.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    elements.solicitacoesBtn?.focus?.();
  });

  modalEl.querySelector('#aprovacao-solicitacoes-refresh-btn')?.addEventListener('click', async () => {
    setSolicitacoesModalLoading(true);
    try {
      await loadSolicitacoesAnalise({ force: true });
      renderSolicitacoesModalRows(state.solicitacoesAnalise);
    } catch (error) {
      console.error('[AprovacaoPage] Erro ao atualizar solicitacoes de analise:', error);
      notify(`Nao foi possivel atualizar as solicitacoes: ${error.message}`, 'error');
    } finally {
      setSolicitacoesModalLoading(false);
    }
  });

  modalEl.querySelector('#aprovacao-solicitacoes-table-body')?.addEventListener('click', handleSolicitacoesModalAction);
  return modalEl;
}

function setSolicitacoesModalLoading(isLoading) {
  const refreshBtn = document.getElementById('aprovacao-solicitacoes-refresh-btn');
  if (!refreshBtn) return;

  refreshBtn.disabled = isLoading;
  refreshBtn.innerHTML = isLoading
    ? '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Atualizando...'
    : '<i class="bi bi-arrow-clockwise me-1"></i>Atualizar';
}

async function loadSolicitacoesAnalise(options = {}) {
  const force = Boolean(options.force);
  const canReuseData = !force
    && state.solicitacoesLoadedAt
    && (Date.now() - state.solicitacoesLoadedAt) < SOLICITACOES_RELOAD_TTL_MS;

  if (canReuseData) {
    return state.solicitacoesAnalise;
  }

  const result = typeof aprovacaoService.listSolicitacoesAnalise === 'function'
    ? await aprovacaoService.listSolicitacoesAnalise({
        includeAllAuthenticated: true
      })
    : await aprovacaoService.listAprovacoesForMetrics({
        includeAllAuthenticated: true,
        orderBy: 'dataEntrada',
        orderDirection: 'desc'
      });

  const source = Array.isArray(result?.data) ? result.data : [];
  state.solicitacoesAnalise = source
    .filter((aprovacao) => isSolicitacaoAnalise(aprovacao))
    .sort((a, b) => {
      const dateA = toComparableDate(a?.dataEntrada || a?.createdAt);
      const dateB = toComparableDate(b?.dataEntrada || b?.createdAt);
      return dateB - dateA;
    });
  state.solicitacoesLoadedAt = Date.now();
  state.solicitacoesPartial = Boolean(result?.partial);

  return state.solicitacoesAnalise;
}

function renderSolicitacoesModalRows(solicitacoes = []) {
  const tableBody = document.getElementById('aprovacao-solicitacoes-table-body');
  const countBadge = document.getElementById('aprovacao-solicitacoes-count');
  const partialAlert = document.getElementById('aprovacao-solicitacoes-partial');
  if (!tableBody) return;

  if (countBadge) {
    countBadge.textContent = `${solicitacoes.length} solicitacoes`;
  }

  if (partialAlert) {
    partialAlert.classList.toggle('d-none', !state.solicitacoesPartial);
  }

  if (!Array.isArray(solicitacoes) || solicitacoes.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          Nenhuma solicitacao pendente de triagem.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = solicitacoes.map((aprovacao) => {
    const compradores = getAprovacaoCompradores(aprovacao);
    const principal = compradores.find((comp) => comp.principal) || compradores[0];
    const nomePrincipal = principal?.nome || aprovacao.clientePrincipal || aprovacao.nomeClientePrincipal || '-';
    const cpfPrincipal = principal?.cpf || aprovacao.cpfPrincipal || '-';
    const canal = getSolicitacaoCanalMeta(aprovacao);
    const contatoResumo = getContatoResumo(aprovacao.contato);

    return `
      <tr>
        <td>${escapeHtml(formatDateForDisplay(aprovacao.dataEntrada || aprovacao.createdAt))}</td>
        <td class="fw-medium">${escapeHtml(nomePrincipal)}</td>
        <td><code class="small">${escapeHtml(cpfPrincipal || '-')}</code></td>
        <td><span class="badge ${canal.badgeClass}">${canal.label}</span></td>
        <td class="small">${escapeHtml(contatoResumo)}</td>
        <td>${escapeHtml(aprovacao.situacao || '-')}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" data-action="solicitacao-view" data-id="${aprovacao.id}" title="Ver detalhes">
              <i class="bi bi-eye"></i>
            </button>
            <button class="btn btn-outline-secondary" data-action="solicitacao-edit" data-id="${aprovacao.id}" title="Editar solicitacao">
              <i class="bi bi-pencil"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function getSolicitacaoCanalMeta(aprovacao = {}) {
  const origemCanal = normalizeIdentity(aprovacao?.origemCanal);
  const byWhatsApp = origemCanal === 'whatsapp_bot' || Boolean(aprovacao?.origemWhatsAppChatId);
  const byPublicLink = origemCanal === 'link_publico' || Boolean(aprovacao?.origemSolicitacaoId);

  if (byWhatsApp) {
    return {
      label: 'WhatsApp',
      badgeClass: 'text-bg-success'
    };
  }

  if (byPublicLink) {
    return {
      label: 'Link Publico',
      badgeClass: 'text-bg-primary'
    };
  }

  return {
    label: 'Intake',
    badgeClass: 'text-bg-secondary'
  };
}

function getContatoResumo(contato = {}) {
  const phone = String(contato?.telefone || '').trim();
  const email = String(contato?.email || '').trim();
  const parts = [phone, email].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : '-';
}

function handleSolicitacoesModalAction(e) {
  const button = e.target.closest('button[data-action]');
  if (!button) return;

  const id = button.dataset.id;
  if (!id) return;

  const action = button.dataset.action;
  if (action === 'solicitacao-view') {
    openDetailsModal(id);
  } else if (action === 'solicitacao-edit') {
    openEditModal(id);
  }
}

async function generatePublicIntakeLink() {
  const button = elements.intakeLinkBtn;
  if (!button) return;

  const originalText = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Gerando...';

  try {
    const callable = firebase.app().functions('us-central1').httpsCallable('generateAprovacaoIntakeLink');
    const result = await callable({
      expiresInDays: 7,
      maxUses: 1,
      baseUrl: window.location.origin
    });

    const link = result?.data?.link;
    if (!link) {
      throw new Error('A função não retornou um link válido.');
    }

    let copied = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        copied = true;
      }
    } catch {
      copied = false;
    }

    const message = copied
      ? 'Link de solicitação gerado e copiado para a área de transferência.'
      : `Link gerado:\n${link}`;

    if (window.uiHelpers?.showToast) {
      window.uiHelpers.showToast(message, copied ? 'success' : 'info');
    } else {
      window.alert(message);
    }

    if (!copied) {
      window.prompt('Copie o link de solicitação:', link);
    }
  } catch (error) {
    console.error('[AprovacaoPage] Erro ao gerar link público de solicitação:', error);
    notify(`Não foi possível gerar o link de solicitação: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

/**
 * Abre modal de detalhes
 */
function openDetailsModal(id) {
  const aprovacao = findAprovacaoById(id);
  if (!aprovacao) return;

  import('../modals/AprovacaoDetailsModal.js').then(module => {
    module.default.open(aprovacao);
  }).catch(err => {
    console.error('[AprovacaoPage] Erro ao abrir modal de detalhes:', err);
  });
}

/**
 * Abre modal de edicao
 */
function openEditModal(id) {
  const aprovacao = findAprovacaoById(id);
  if (!aprovacao) return;

  import('../modals/AddAprovacaoModal.js').then(module => {
    module.default.open(state.vendors, aprovacao);
  }).catch(err => {
    console.error('[AprovacaoPage] Erro ao abrir modal de edicao:', err);
  });
}

/**
 * Abre modal de importacao
 */
function openImportModal() {
  import('../modals/ImportAprovacaoModal.js').then(module => {
    module.default.open(() => {
      // Callback apos importacao concluida
      refresh();
    });
  }).catch(err => {
    console.error('[AprovacaoPage] Erro ao abrir modal de importacao:', err);
    alert('Erro ao abrir importacao de CSV');
  });
}

/**
 * Abre offcanvas de filtros avancados
 */
function openFiltersOffcanvas() {
  import('../offcanvas/AprovacaoFiltersOffcanvas.js').then(module => {
    module.default.open((filters) => {
      // Aplica filtros avancados
      state.advancedFilters = filters;
      resetPaginationState();
      loadData();
    }, state.advancedFilters);
  }).catch(err => {
    console.error('[AprovacaoPage] Erro ao abrir filtros:', err);
    alert('Erro ao abrir filtros avancados');
  });
}

function notify(message, type = 'info') {
  if (window.uiHelpers?.showToast) {
    window.uiHelpers.showToast(message, type);
    return;
  }

  console.log(`[AprovacaoPage] ${message}`);
}

/**
 * Converte aprovacao para processo
 */
async function convertToProcess(id) {
  const aprovacao = state.aprovacoes.find(a => a.id === id);
  if (!aprovacao) return;

  let conversionOptions = null;
  try {
    const convertModal = await import('../modals/AprovacaoConvertProcessModal.js');
    conversionOptions = await convertModal.default.open(aprovacao);
  } catch (error) {
    console.error('[AprovacaoPage] Erro ao abrir modal de conversao:', error);
    notify(`Nao foi possivel abrir a janela de conversao: ${error.message || 'erro desconhecido'}`, 'error');
    return;
  }

  if (!conversionOptions) return;

  try {
    const processoId = await aprovacaoService.converterParaProcesso(id, conversionOptions);
    notify(`Processo criado com sucesso (ID: ${processoId}).`, 'success');
    await refresh();
  } catch (error) {
    console.error('[AprovacaoPage] Erro ao converter:', error);
    notify('Erro ao converter para processo: ' + error.message, 'error');
  }
}

/**
 * Exporta dados para CSV
 */
async function exportToCSV() {
  try {
    // Busca todas as aprovacoes sem paginacao
    const result = await aprovacaoService.listAprovacoes({
      pageSize: 10000,
      includeAllAuthenticated: true,
      situacao: state.currentFilter !== 'todas' && state.currentFilter !== 'pendentes-conversao'
        ? state.currentFilter
        : undefined
    });

    if (result.data.length === 0) {
      alert('Nenhum dado para exportar');
      return;
    }

    // Monta CSV
    const headers = [
      'CPF', 'Cliente', 'Data Entrada', 'Data Aprovacao',
      'Vencimento SICAQ',
      'Empreendimento', 'Construtora', 'Corretor', 'Gerente/Imobiliaria',
      'Analista', 'Situacao', 'Pendencia', 'Renda',
      'Carta Financiamento', 'Valor Financiamento', 'Prazo'
    ];

    const rows = result.data.map(a => [
      a.cpfPrincipal || '',
      a.nomeClientePrincipal || '',
      formatDateForCSV(a.dataEntrada),
      formatDateForCSV(a.dataAprovacao),
      formatDateForCSV(a.vencSicaq),
      a.empreendimento || '',
      a.construtora || '',
      a.corretor || '',
      a.gerenteImobiliaria || '',
      a.analistaAprovacao || '',
      a.situacao || '',
      a.pendencia || '',
      a.renda ? `R$ ${a.renda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '',
      a.cartaFinanciamento || '',
      a.valorFinanciamento ? `R$ ${a.valorFinanciamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '',
      a.prazoMeses || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const filename = `aprovacoes_${new Date().toISOString().split('T')[0]}.csv`;
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    activityLogService.downloadBlob(blob, filename);

    await activityLogService.auditFileAction({
      actionType: 'EXPORT_REPORT',
      description: `Relatorio de aprovacoes exportado (${result.data.length} registros)`,
      module: 'aprovacao',
      page: 'aprovacao',
      source: 'aprovacaoPageInit',
      filename,
      blobOrText: blob,
      mimeType: 'text/csv;charset=utf-8;',
      rowCount: result.data.length,
      entityType: 'approval',
      extraData: {
        format: 'CSV',
        situacaoFiltro: state.currentFilter || 'todas'
      }
    });

  } catch (error) {
    console.error('[AprovacaoPage] Erro ao exportar:', error);
    alert('Erro ao exportar CSV: ' + error.message);
  }
}

/**
 * Mostra loading
 */
function showLoading() {
  const dataRows = elements.tableBody?.querySelectorAll('tr:not(#aprovacao-loading-row):not(#aprovacao-empty-row)');
  const hasDataRows = Boolean(dataRows && dataRows.length > 0);

  if (elements.emptyRow) {
    elements.emptyRow.classList.add('d-none');
  }

  if (elements.tableBody) {
    elements.tableBody.classList.toggle('aprovacao-table-loading-soft', hasDataRows);
  }

  if (elements.loadingRow) {
    elements.loadingRow.classList.toggle('d-none', hasDataRows);
  }
}

/**
 * Mostra erro
 */
function showError(message) {
  if (elements.tableBody) {
    elements.tableBody.classList.remove('aprovacao-table-loading-soft');
  }
  if (elements.loadingRow) {
    elements.loadingRow.classList.add('d-none');
  }
  // Poderia mostrar um toast ou alert
  console.error('[AprovacaoPage]', message);
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

/**
 * Formata data para CSV
 */
function formatDateForCSV(timestamp) {
  const date = parseDateValue(timestamp);
  if (!date) return '';
  // Formata sempre no fuso horário de Brasília (UTC-3)
  const options = { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
    timeZone: 'America/Sao_Paulo'
  };
  return new Intl.DateTimeFormat('pt-BR', options).format(date);
}

// Exporta modulo
const aprovacaoPage = {
  initialize,
  show,
  refresh,
  dispose,
  state
};

// Expoe globalmente para debug
if (typeof window !== 'undefined') {
  window.aprovacaoPage = aprovacaoPage;
}

export default aprovacaoPage;
