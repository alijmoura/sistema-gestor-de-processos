// Configuração de visibilidade de KPIs foi centralizada no DashboardUI (dashboardUI.js)
// Removido código duplicado de gerenciamento do modal e localStorage neste arquivo.
/**
 * @file main.js
 * @description Ponto de entrada principal da aplicação (OTIMIZADO PARA CARREGAMENTO RÁPIDO).
 * Changelog (06/10/2025): Implementado lazy loading e definicao de prioridade de recursos críticos para reduzir tempo de carregamento de ~10s para ~2-3s
 * Changelog (05/12/2025): Adicionado cache warming para reduzir cache misses na inicialização
 */
import { auth } from "./auth.js";
import "./firestoreReadMetricsService.js";
import "./firestoreReadMonitor.js";
import * as firestore from "./firestoreService.js";
import * as UI from "./ui.js";
import { initializeEventListeners, getCurrentView, setCurrentView, loadVendorFilterState, populateVendorFilter, loadEmpreendimentoFilterState, populateEmpreendimentoFilter, updateActiveFiltersBadge } from "./eventListeners.js";
import { STATUS_CONFIG, SLA_TARGETS } from "./config.js";
import { initializeAllValidations } from "./formValidation.js";
import { initializePerformanceOptimizations, performanceMonitor } from "./performance.js";
import listenerOptimizer from "./listenerOptimizer.js";
import agenciasService from "./agenciasService.js";
import agenciasUI from "./agenciasUI.js";
import userPermissionService from "./userPermissionService.js";
import adminPermissionsUI from "./adminPermissionsUI.js";
import permissionsUI from "./permissionsUI.js";
import permissionsUIHelper from "./permissionsUIHelper.js";
import { WorkflowEditorUI } from "./workflowEditorUI.js";
import cacheService, { warmCache } from "./cacheService.js";
import { redirectToLogin } from "./authRedirect.js";
import { initListToolbar } from "./listToolbar.js";
import { initInlineEdit } from "./inlineEditService.js";
import aiDetailsTab from "./aiDetailsTab.js";
import { InactivityService } from "./inactivityService.js";
import { initRealtimeSync } from "./realtimeSyncWrapper.js";
// Otimizadores removidos temporariamente (não utilizados ainda)
// import performanceOptimizer from "./performanceOptimizer.js";
// import lazyLoader from "./lazyLoader.js";

// Serviços de IA (imports comentados - não utilizados atualmente)
// import documentProcessingService from "./documentProcessingService.js";
// import aiContractAssistant from "./aiContractAssistant.js";
// import aiReportGenerator from "./aiReportGenerator.js";
// import aiContractUI from "./aiContractUI.js";

// Imports não críticos - carregados sob demanda
let notificationService = null;
let whatsappConfig = null;
const appState = {
  allUsers: [],
  currentUserProfile: null,
  allContracts: [],
  filteredContracts: [],
  allDashboardContracts: [],
  contracts: [],
  currentSortKey: "clientePrincipal",
  currentSortDirection: "asc",

  selectedStatusState: new Set(), // será inicializado após carregar status efetivos
  selectedChartStatusState: new Set(),
  selectedVendorState: new Set(), // Filtro por Construtora/Vendedor
  selectedEmpreendimentoState: new Set(), // Filtro por Empreendimento
  visibleColumns: [
    "vendedorConstrutora",
    "empreendimento",
    "clientePrincipal",
    "status",
  ],
  currentPage: 1,
  rowsPerPage: 25,
  totalContracts: 0,
  lastVisible: null,
  firstVisible: null,
  pageSnapshots: [null],
  isKanbanDataLoaded: false,
  userPermissions: null, //  NOVO: Armazena permissões do usuário
  currentWorkflowType: 'associativo', // Tipo de workflow ativo (associativo/individual)
};
const PROCESSOS_SEARCH_SESSION_KEY = 'processosSearchState';
let _processosLoadSourceMode = 'full';

/**
 * @typedef {Object} ProcessosViewState
 * @property {string} view
 * @property {string} draftSearchTerm
 * @property {string} appliedSearchTerm
 * @property {Set<string>} selectedStatuses
 * @property {Set<string>} selectedVendors
 * @property {Set<string>} selectedEmpreendimentos
 * @property {string} workflowType
 * @property {{ key: string, direction: string }} sort
 * @property {{ currentPage: number, rowsPerPage: number, totalContracts: number, firstVisible: any, lastVisible: any, pageSnapshots: any[] }} pagination
 * @property {boolean} includeArchived
 * @property {boolean} silentRefreshPending
 */

function normalizeProcessosSet(values) {
  if (values instanceof Set) {
    return new Set(Array.from(values).filter(Boolean));
  }

  if (Array.isArray(values)) {
    return new Set(values.filter(Boolean));
  }

  return new Set();
}

function normalizeProcessosSearchDraft(value = '') {
  return String(value ?? '');
}

function normalizeProcessosSearchApplied(value = '') {
  return String(value ?? '').trim();
}

function createDefaultProcessosViewState() {
  return {
    view: getCurrentView(),
    draftSearchTerm: '',
    appliedSearchTerm: '',
    selectedStatuses: new Set(),
    selectedVendors: new Set(),
    selectedEmpreendimentos: new Set(),
    workflowType: 'associativo',
    sort: {
      key: "clientePrincipal",
      direction: "asc"
    },
    pagination: {
      currentPage: 1,
      rowsPerPage: 25,
      totalContracts: 0,
      firstVisible: null,
      lastVisible: null,
      pageSnapshots: [null]
    },
    includeArchived: false,
    silentRefreshPending: false
  };
}

appState.processosViewState = createDefaultProcessosViewState();
appState.currentView = appState.processosViewState.view;

// Guardas de inicializacao para evitar callbacks duplicados do auth/pagina.
const APP_INIT_STATE = {
  activeUid: null,
  promise: null,
  completedUid: null
};
const PASSWORD_POLICY_CACHE_KEY = 'passwordPolicyStateCache';
const PASSWORD_POLICY_CACHE_TTL_MS = 5 * 60 * 1000;
let nonCriticalResourcesBound = false;
let lastDashboardInitAt = 0;
let contractsPreloadPromise = null;

function loadPersistedProcessosSearchState() {
  try {
    const rawState = sessionStorage.getItem(PROCESSOS_SEARCH_SESSION_KEY);
    if (!rawState) {
      return {
        draftSearchTerm: '',
        appliedSearchTerm: '',
        view: '',
        workflowType: '',
        sort: null,
        pagination: null,
        includeArchived: null
      };
    }

    const parsedState = JSON.parse(rawState);
    return {
      draftSearchTerm: normalizeProcessosSearchDraft(parsedState?.draftSearchTerm || ''),
      appliedSearchTerm: normalizeProcessosSearchApplied(parsedState?.appliedSearchTerm || ''),
      view: String(parsedState?.view || ''),
      workflowType: normalizeWorkflowIdValue(parsedState?.workflowType || ''),
      sort: parsedState?.sort && typeof parsedState.sort === 'object'
        ? {
            key: parsedState.sort.key || "clientePrincipal",
            direction: parsedState.sort.direction === "desc" ? "desc" : "asc"
          }
        : null,
      pagination: parsedState?.pagination && typeof parsedState.pagination === 'object'
        ? {
            rowsPerPage: Math.max(1, Number(parsedState.pagination.rowsPerPage) || 25)
          }
        : null,
      includeArchived: typeof parsedState?.includeArchived === 'boolean'
        ? parsedState.includeArchived
        : null
    };
  } catch (error) {
    console.warn('[ProcessosState] Não foi possível restaurar busca da sessão:', error);
    return {
      draftSearchTerm: '',
      appliedSearchTerm: '',
      view: '',
      workflowType: '',
      sort: null,
      pagination: null,
      includeArchived: null
    };
  }
}

function persistProcessosSearchState() {
  try {
    const viewState = appState.processosViewState || createDefaultProcessosViewState();
    sessionStorage.setItem(
      PROCESSOS_SEARCH_SESSION_KEY,
      JSON.stringify({
        draftSearchTerm: viewState.draftSearchTerm,
        appliedSearchTerm: viewState.appliedSearchTerm,
        view: viewState.view,
        workflowType: viewState.workflowType,
        sort: viewState.sort,
        pagination: {
          rowsPerPage: viewState.pagination.rowsPerPage
        },
        includeArchived: viewState.includeArchived
      })
    );
  } catch (error) {
    console.warn('[ProcessosState] Não foi possível persistir busca na sessão:', error);
  }
}

function getFilterContractsSource() {
  if (Array.isArray(appState.allContracts) && appState.allContracts.length > 0) {
    return appState.allContracts;
  }

  if (Array.isArray(appState.filteredContracts) && appState.filteredContracts.length > 0) {
    return appState.filteredContracts;
  }

  return Array.isArray(appState.contracts) ? appState.contracts : [];
}

function syncProcessosSearchUI() {
  const viewState = appState.processosViewState || createDefaultProcessosViewState();
  const searchInput = UI.DOMElements.searchInput;
  const clearButton = UI.DOMElements.searchClearBtn;
  const searchIndicator = UI.DOMElements.processosSearchIndicator;
  const hasDraft = viewState.draftSearchTerm.trim().length > 0;
  const hasApplied = viewState.appliedSearchTerm.trim().length > 0;

  if (searchInput && searchInput.value !== viewState.draftSearchTerm) {
    searchInput.value = viewState.draftSearchTerm;
  }

  if (clearButton) {
    clearButton.classList.toggle('d-none', !hasDraft && !hasApplied);
  }

  if (searchIndicator) {
    if (hasApplied) {
      searchIndicator.textContent = `Busca ativa: ${viewState.appliedSearchTerm}`;
      searchIndicator.classList.remove('d-none');
    } else {
      searchIndicator.textContent = '';
      searchIndicator.classList.add('d-none');
    }
  }
}

function syncProcessosFilterControls() {
  updateActiveFiltersBadge();

  const statusContainer = document.getElementById("table-filter-scroll-content-offcanvas");
  if (statusContainer) {
    statusContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = appState.selectedStatusState.has(checkbox.value);
    });
  }

  const vendorContainer = document.getElementById("vendor-filter-scroll-content-offcanvas");
  const empreendimentoContainer = document.getElementById("empreendimento-filter-scroll-content-offcanvas");
  const shouldRefreshVendorUi = Boolean(vendorContainer?.children?.length);
  const shouldRefreshEmpreendimentoUi = Boolean(empreendimentoContainer?.children?.length);

  if (shouldRefreshVendorUi) {
    populateVendorFilter(getFilterContractsSource(), appState.selectedVendorState);
  }

  if (shouldRefreshEmpreendimentoUi) {
    populateEmpreendimentoFilter(
      getFilterContractsSource(),
      appState.selectedEmpreendimentoState,
      appState.selectedVendorState
    );
  }
}

function syncLegacyStateFromProcessosViewState({ syncDom = true } = {}) {
  const viewState = appState.processosViewState || createDefaultProcessosViewState();

  appState.selectedStatusState = viewState.selectedStatuses;
  appState.selectedVendorState = viewState.selectedVendors;
  appState.selectedEmpreendimentoState = viewState.selectedEmpreendimentos;
  appState.currentWorkflowType = normalizeWorkflowIdValue(viewState.workflowType) || 'associativo';
  appState.currentSortKey = viewState.sort.key || "clientePrincipal";
  appState.currentSortDirection = viewState.sort.direction === "desc" ? "desc" : "asc";
  appState.currentPage = Math.max(1, Number(viewState.pagination.currentPage) || 1);
  appState.rowsPerPage = Math.max(1, Number(viewState.pagination.rowsPerPage) || 25);
  appState.totalContracts = Math.max(0, Number(viewState.pagination.totalContracts) || 0);
  appState.firstVisible = viewState.pagination.firstVisible || null;
  appState.lastVisible = viewState.pagination.lastVisible || null;
  appState.pageSnapshots = Array.isArray(viewState.pagination.pageSnapshots)
    ? [...viewState.pagination.pageSnapshots]
    : [null];
  appState.currentView = viewState.view;

  if (getCurrentView() !== viewState.view) {
    setCurrentView(viewState.view);
  }

  if (!syncDom) {
    return;
  }

  if (UI.DOMElements.rowsPerPageSelect) {
    UI.DOMElements.rowsPerPageSelect.value = String(appState.rowsPerPage);
  }

  if (UI.DOMElements.includeArchivedCheckbox) {
    UI.DOMElements.includeArchivedCheckbox.checked = viewState.includeArchived === true;
  }

  syncProcessosSearchUI();
  syncProcessosFilterControls();
}

export function getProcessosViewState() {
  const viewState = appState.processosViewState || createDefaultProcessosViewState();
  return {
    ...viewState,
    selectedStatuses: new Set(viewState.selectedStatuses),
    selectedVendors: new Set(viewState.selectedVendors),
    selectedEmpreendimentos: new Set(viewState.selectedEmpreendimentos),
    sort: { ...viewState.sort },
    pagination: {
      ...viewState.pagination,
      pageSnapshots: Array.isArray(viewState.pagination.pageSnapshots)
        ? [...viewState.pagination.pageSnapshots]
        : [null]
    }
  };
}

export function updateProcessosViewState(patch = {}, options = {}) {
  const viewState = appState.processosViewState || createDefaultProcessosViewState();

  if (Object.prototype.hasOwnProperty.call(patch, 'view') && patch.view) {
    viewState.view = String(patch.view);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'draftSearchTerm')) {
    viewState.draftSearchTerm = normalizeProcessosSearchDraft(patch.draftSearchTerm);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'appliedSearchTerm')) {
    viewState.appliedSearchTerm = normalizeProcessosSearchApplied(patch.appliedSearchTerm);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'selectedStatuses')) {
    viewState.selectedStatuses = normalizeProcessosSet(patch.selectedStatuses);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'selectedVendors')) {
    viewState.selectedVendors = normalizeProcessosSet(patch.selectedVendors);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'selectedEmpreendimentos')) {
    viewState.selectedEmpreendimentos = normalizeProcessosSet(patch.selectedEmpreendimentos);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'workflowType')) {
    viewState.workflowType = normalizeWorkflowIdValue(patch.workflowType) || 'associativo';
  }

  if (patch.sort && typeof patch.sort === 'object') {
    viewState.sort = {
      key: patch.sort.key || viewState.sort.key || "clientePrincipal",
      direction: patch.sort.direction === "desc" ? "desc" : "asc"
    };
  }

  if (patch.pagination && typeof patch.pagination === 'object') {
    viewState.pagination = {
      ...viewState.pagination,
      ...patch.pagination,
      currentPage: Math.max(1, Number(patch.pagination.currentPage ?? viewState.pagination.currentPage) || 1),
      rowsPerPage: Math.max(1, Number(patch.pagination.rowsPerPage ?? viewState.pagination.rowsPerPage) || 25),
      totalContracts: Math.max(0, Number(patch.pagination.totalContracts ?? viewState.pagination.totalContracts) || 0),
      pageSnapshots: Array.isArray(patch.pagination.pageSnapshots)
        ? [...patch.pagination.pageSnapshots]
        : Array.isArray(viewState.pagination.pageSnapshots)
          ? [...viewState.pagination.pageSnapshots]
          : [null]
    };
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'includeArchived')) {
    viewState.includeArchived = patch.includeArchived === true;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'silentRefreshPending')) {
    viewState.silentRefreshPending = patch.silentRefreshPending === true;
  }

  appState.processosViewState = viewState;
  appState.currentView = viewState.view;
  syncLegacyStateFromProcessosViewState({ syncDom: options.syncDom !== false });

  if (options.persistSearch !== false) {
    persistProcessosSearchState();
  }

  return getProcessosViewState();
}

function captureProcessosViewStateFromLegacyState(overrides = {}, options = {}) {
  return updateProcessosViewState(
    {
      view: getCurrentView(),
      selectedStatuses: appState.selectedStatusState,
      selectedVendors: appState.selectedVendorState,
      selectedEmpreendimentos: appState.selectedEmpreendimentoState,
      workflowType: appState.currentWorkflowType,
      sort: {
        key: appState.currentSortKey,
        direction: appState.currentSortDirection
      },
      pagination: {
        currentPage: appState.currentPage,
        rowsPerPage: appState.rowsPerPage,
        totalContracts: appState.totalContracts,
        firstVisible: appState.firstVisible,
        lastVisible: appState.lastVisible,
        pageSnapshots: appState.pageSnapshots
      },
      includeArchived: UI.DOMElements.includeArchivedCheckbox?.checked || false,
      ...overrides
    },
    options
  );
}

function normalizeWorkflowIdValue(value) {
  return value === undefined || value === null
    ? ''
    : String(value).trim().toLowerCase();
}

const WORKFLOW_FIELD_CANDIDATES = [
  'workflowId',
  'workflowID',
  'workflowid',
  'workFlowId',
  'workflowType',
  'workflowtype'
];

// Contratos legados sem workflow explicito sao classificados neste fluxo por padrao.
const LEGACY_WORKFLOW_FALLBACK = 'associativo';

// Cache simples para evitar recomputar indice de status->workflows em cada contrato.
let _workflowIndexCache = {
  signature: '',
  statusToWorkflows: new Map()
};

function resolveContractWorkflow(contract, fallback = '') {
  if (!contract) return fallback;
  for (const key of WORKFLOW_FIELD_CANDIDATES) {
    if (contract[key]) {
      const normalized = normalizeWorkflowIdValue(contract[key]);
      if (normalized) {
        return normalized;
      }
    }
  }
  return fallback;
}

function normalizeStatusValue(value) {
  return value === undefined || value === null
    ? ''
    : String(value).trim().toLowerCase();
}

function getActivePageId() {
  const activePage = document.querySelector('.page.active');
  return activePage?.id?.replace(/^page-/, '') || '';
}

function shouldRenderKanbanView() {
  const currentView = getCurrentView();
  const activePageId = getActivePageId();
  return currentView === 'kanban' && (activePageId === 'processos' || activePageId === 'kanban');
}

function hasProcessosShell() {
  return Boolean(
    document.getElementById('page-processos')
    && UI.DOMElements.contractList
    && UI.DOMElements.processosViewContainer
  );
}

function resolveInitialPage(options = {}) {
  const requested = String(
    options.initialPage
    || window.__INITIAL_PAGE__
    || 'dashboard'
  ).trim().toLowerCase();

  if (requested === 'processos' && !hasProcessosShell()) {
    return 'dashboard';
  }

  return requested || 'dashboard';
}

function tryActivatePageFromHash() {
  const target = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
  if (!target || target === 'processos' || target === 'aprovacao') {
    return false;
  }

  const trigger = document.querySelector(
    `.nav-button[data-page="${target}"]:not(.nav-link-external), .sidebar-user[data-page="${target}"]`
  );

  if (!trigger || typeof trigger.click !== 'function') {
    return false;
  }

  trigger.click();
  return true;
}

function getWorkflowStatusIndex() {
  if (typeof UI.getCachedWorkflows !== 'function') {
    return _workflowIndexCache.statusToWorkflows;
  }

  try {
    const workflows = UI.getCachedWorkflows();
    if (!Array.isArray(workflows) || workflows.length === 0) {
      return _workflowIndexCache.statusToWorkflows;
    }

    const signature = workflows
      .map((wf) => `${normalizeWorkflowIdValue(wf?.id)}:${Array.isArray(wf?.stages) ? wf.stages.length : 0}`)
      .sort()
      .join('|');

    if (_workflowIndexCache.signature === signature) {
      return _workflowIndexCache.statusToWorkflows;
    }

    const statusToWorkflows = new Map();
    workflows.forEach((wf) => {
      const wfId = normalizeWorkflowIdValue(wf?.id);
      if (!wfId || !Array.isArray(wf?.stages)) return;

      wf.stages.forEach((stage) => {
        const normalizedStage = normalizeStatusValue(stage);
        if (!normalizedStage) return;
        if (!statusToWorkflows.has(normalizedStage)) {
          statusToWorkflows.set(normalizedStage, new Set());
        }
        statusToWorkflows.get(normalizedStage).add(wfId);
      });
    });

    _workflowIndexCache = { signature, statusToWorkflows };
    return _workflowIndexCache.statusToWorkflows;
  } catch (error) {
    console.warn(' Erro ao montar indice de workflows para filtro:', error);
    return _workflowIndexCache.statusToWorkflows;
  }
}

function inferLegacyWorkflowByStatus(contract) {
  const status = normalizeStatusValue(contract?.status);
  if (!status) {
    return LEGACY_WORKFLOW_FALLBACK;
  }

  const statusToWorkflows = getWorkflowStatusIndex();
  const workflowsForStatus = statusToWorkflows.get(status);

  // Se o status pertence a um unico workflow, classifica de forma objetiva.
  if (workflowsForStatus && workflowsForStatus.size === 1) {
    return Array.from(workflowsForStatus)[0];
  }

  // Em status compartilhado (ou nao mapeado), aplica fallback legado deterministico.
  return LEGACY_WORKFLOW_FALLBACK;
}

function resolveContractWorkflowForFiltering(contract) {
  const explicitWorkflow = resolveContractWorkflow(contract, '');
  if (explicitWorkflow) {
    return explicitWorkflow;
  }
  return inferLegacyWorkflowByStatus(contract);
}

function doesContractMatchWorkflowFilter(contract, activeWorkflowFilter) {
  if (!activeWorkflowFilter) {
    return true;
  }

  const resolvedWorkflow = resolveContractWorkflowForFiltering(contract);
  return resolvedWorkflow === activeWorkflowFilter;
}

function getActiveWorkflowFilterFromState() {
  let activeWorkflowFilter = normalizeWorkflowIdValue(appState.currentWorkflowType);
  if (!activeWorkflowFilter) {
    try {
      const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
      if (prefs.defaultWorkflow) {
        activeWorkflowFilter = normalizeWorkflowIdValue(prefs.defaultWorkflow);
      }
    } catch (error) {
      console.warn(error);
    }
  }

  return activeWorkflowFilter;
}

function normalizeProcessosSearchValue(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getCurrentProcessosSearchState() {
  const viewState = appState.processosViewState || createDefaultProcessosViewState();
  const rawSearchTerm = normalizeProcessosSearchApplied(viewState.appliedSearchTerm).toLowerCase();
  const normalizedSearchTerm = normalizeProcessosSearchValue(rawSearchTerm);
  const numericSearchTerm = rawSearchTerm.replace(/\D/g, '');
  const hasTextSearch = normalizedSearchTerm.length >= 2;
  const hasNumericSearch = numericSearchTerm.length >= 3;

  return {
    rawSearchTerm,
    normalizedSearchTerm,
    numericSearchTerm,
    hasTextSearch,
    hasNumericSearch,
    hasSearchTerm: hasTextSearch || hasNumericSearch
  };
}

function filterContractsForCurrentProcessosState(contracts = []) {
  const sourceContracts = Array.isArray(contracts) ? contracts : [];
  const searchState = getCurrentProcessosSearchState();
  const selectedStatuses = Array.from(appState.selectedStatusState || []);
  const selectedVendors = Array.from(appState.selectedVendorState || []);
  const selectedEmpreendimentos = Array.from(appState.selectedEmpreendimentoState || []);
  const activeWorkflowFilter = getActiveWorkflowFilterFromState();

  return sourceContracts.filter((contract) => {
    const workflowMatch = doesContractMatchWorkflowFilter(contract, activeWorkflowFilter);
    const statusMatch = selectedStatuses.length > 0 && selectedStatuses.includes(contract.status);
    const vendorMatch = selectedVendors.length === 0
      || selectedVendors.includes((contract.vendedorConstrutora || '').trim());
    const empreendimentoMatch = selectedEmpreendimentos.length === 0
      || selectedEmpreendimentos.includes((contract.empreendimento || '').trim());

    const searchMatch = !searchState.hasSearchTerm || (
      (searchState.hasTextSearch && (
        (contract.clientePrincipal && normalizeProcessosSearchValue(contract.clientePrincipal).includes(searchState.normalizedSearchTerm)) ||
        (contract.empreendimento && normalizeProcessosSearchValue(contract.empreendimento).includes(searchState.normalizedSearchTerm)) ||
        (contract.vendedorConstrutora && normalizeProcessosSearchValue(contract.vendedorConstrutora).includes(searchState.normalizedSearchTerm)) ||
        (contract.nContratoCEF && normalizeProcessosSearchValue(contract.nContratoCEF).includes(searchState.normalizedSearchTerm)) ||
        (contract.protocoloRi && normalizeProcessosSearchValue(contract.protocoloRi).includes(searchState.normalizedSearchTerm)) ||
        (contract.compradores && contract.compradores.some((comprador) =>
          comprador.nome && normalizeProcessosSearchValue(comprador.nome).includes(searchState.normalizedSearchTerm)
        ))
      )) ||
      (searchState.hasNumericSearch && (
        (contract.nContratoCEF && contract.nContratoCEF.replace(/\D/g, '').includes(searchState.numericSearchTerm)) ||
        (contract.protocoloRi && contract.protocoloRi.replace(/\D/g, '').includes(searchState.numericSearchTerm)) ||
        (contract.compradores && contract.compradores.some((comprador) =>
          comprador.cpf && comprador.cpf.replace(/\D/g, '').includes(searchState.numericSearchTerm)
        ))
      ))
    );

    return statusMatch && vendorMatch && empreendimentoMatch && searchMatch && workflowMatch;
  });
}

function sortContractsForCurrentProcessosState(contracts = []) {
  const sourceContracts = Array.isArray(contracts) ? [...contracts] : [];

  sourceContracts.sort((a, b) => {
    let aValue = a[appState.currentSortKey];
    let bValue = b[appState.currentSortKey];

    const aIsEmpty = aValue === undefined || aValue === null || aValue === "";
    const bIsEmpty = bValue === undefined || bValue === null || bValue === "";

    if (aIsEmpty && bIsEmpty) return 0;
    if (aIsEmpty) return 1;
    if (bIsEmpty) return -1;

    let comparison = 0;
    const isDate = aValue?.toDate || aValue instanceof Date;
    const isNumeric = typeof aValue === "number" || !isNaN(Number(aValue));

    if (isDate) {
      aValue = aValue.toDate ? aValue.toDate().getTime() : aValue.getTime();
      bValue = bValue.toDate ? bValue.toDate().getTime() : bValue.getTime();
    } else if (isNumeric) {
      aValue = Number(aValue);
      bValue = Number(bValue);
    } else {
      aValue = String(aValue).toLowerCase();
      bValue = String(bValue).toLowerCase();
    }

    if (aValue < bValue) {
      comparison = -1;
    } else if (aValue > bValue) {
      comparison = 1;
    }

    return appState.currentSortDirection === "desc" ? -comparison : comparison;
  });

  return sourceContracts;
}

function getFilteredAndSortedContractsForCurrentProcessosState(contracts = []) {
  const filteredContracts = filterContractsForCurrentProcessosState(contracts);
  return sortContractsForCurrentProcessosState(filteredContracts);
}

function formatTopbarDisplayName(user = {}, profile = null) {
  const profileData = profile || appState.currentUserProfile || {};
  const shortName = (profileData.shortName || "").trim();
  if (shortName) {
    console.log(` Exibindo nome reduzido: ${shortName}`);
    return shortName;
  }

  const fullName = (profileData.fullName || "").trim();
  if (fullName) {
    console.log(` Exibindo nome completo: ${fullName}`);
    return fullName;
  }

  const userDisplayName = (user.displayName || "").trim();
  if (userDisplayName) {
    console.log(` Exibindo displayName: ${userDisplayName}`);
    return userDisplayName;
  }

  const email = user.email || "Usuário";
  console.log(` Exibindo email: ${email}`);
  return email;
}

function updateSidebarUserRole(user = {}, profile = null) {
  const roleElement = document.querySelector('.sidebar-user-role');
  if (!roleElement) return;

  const profileData = profile || appState.currentUserProfile || {};
  const shortName = (profileData.shortName || "").trim();
  const fullName = (profileData.fullName || "").trim();
  const email = user.email || "Usuário";

  const displayValue = shortName || fullName || email;
  roleElement.textContent = displayValue;
  console.log(` Sidebar role atualizado: ${displayValue}`);
}

function updateSidebarUserAvatar() {
  const avatarContainer = document.querySelector('.sidebar-user-avatar');
  if (!avatarContainer) return;

  const profileData = appState.currentUserProfile || {};
  const avatarUrl = (profileData.avatarUrl || "").trim();

  // Limpa conteúdo anterior
  avatarContainer.innerHTML = '';

  if (avatarUrl) {
    // Cria elemento img para exibir a foto
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = 'Avatar do usuário';
    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 10px;';
    img.onerror = () => {
      // Fallback para ícone padrão se imagem falhar
      avatarContainer.innerHTML = '<i class="bi bi-person-circle"></i>';
    };
    avatarContainer.appendChild(img);
    console.log(` Avatar atualizado com foto: ${avatarUrl}`);
  } else {
    // Usa ícone padrão se não houver foto
    avatarContainer.innerHTML = '<i class="bi bi-person-circle"></i>';
    console.log(` Avatar usando ícone padrão`);
  }
}

/**
 * Função principal de inicialização (OTIMIZADA).
 * Da-se prioridade a recursos críticos e adia não-críticos para carregamento assíncrono.
 */
async function initializeApp(user, isAdmin, options = {}) {
  const initStart = performance.now();
  const initialPage = resolveInitialPage(options);
  const processosEnabled = options.processosEnabled !== false && hasProcessosShell();
  console.log(` Iniciando aplicação para ${user.email} (Admin: ${isAdmin})`);

  //  Cache Warming - pré-carrega dados críticos para reduzir cache misses
  // Executa em paralelo com inicialização para não bloquear
  warmCache({
    userId: user.uid,
    isAdmin,
    skipRemoteStatus: true,
    skipRemoteUserPermissions: true
  }).catch(e => {
    console.warn(' Cache warming falhou (não crítico):', e);
  });

  // Inicializa o listenerOptimizer para otimização de leituras
  listenerOptimizer.init();

  // Inicializa serviço de inatividade (Logout automático após 12h)
  InactivityService.init();
  
  // Disponibilizar serviços globalmente para outros módulos
  window.firestoreService = firestore;
  window.appState = appState;
  window.loadContractsPage = loadContractsPage; // Exporta para lazy loading
  window.handleViewUpdate = handleViewUpdate; // Exporta para re-renderização externa
  window.getProcessosViewState = getProcessosViewState;
  window.updateProcessosViewState = updateProcessosViewState;
  window.renderProcessosFromState = renderProcessosFromState;
  window.applyRealtimeContractDelta = applyRealtimeContractDelta;
  window.SLA_TARGETS = SLA_TARGETS; // Expor SLA targets para computeSLA em ui.js

  // Inicializa sincronização leve em tempo real (notificações)
  if (!window.__realtimeSyncInitialized) {
    window.__realtimeSyncInitialized = true;
    window.__realtimeSyncUnsubscribe = initRealtimeSync();
  }

  // UI básica (não bloqueante)
  if (UI.DOMElements.settingsNavButton) {
    UI.DOMElements.settingsNavButton.style.display = isAdmin ? "inline-block" : "none";
  }
  
  // Garantir que o elemento userEmailSpan existe (pode ter sido criado antes do botão)
  if (!UI.DOMElements.userEmailSpan || !UI.DOMElements.userEmailSpan.parentNode) {
    console.warn(' Elemento userEmailSpan não encontrado, re-selecionando...');
    UI.DOMElements.userEmailSpan = document.getElementById("user-email");
  }
  
  const initialDisplayName = formatTopbarDisplayName(user, null);
  if (UI.DOMElements.userEmailSpan) {
    UI.DOMElements.userEmailSpan.textContent = initialDisplayName;
    UI.DOMElements.userEmailSpan.title = user.email || "";
  }
  updateSidebarUserRole(user, null);
  updateSidebarUserAvatar(user, null);
  
  console.log(` [INICIAL] Nome definido: "${initialDisplayName}"`);
  console.log(` [INICIAL] Elemento:`, UI.DOMElements.userEmailSpan);
  console.log(` [INICIAL] textContent atual: "${UI.DOMElements.userEmailSpan?.textContent || ''}"`);
  
  // Debug: observar mudanças no elemento
  if (window.__DEBUG__ && UI.DOMElements.userEmailSpan) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          console.log(`[DEBUG] userEmailSpan modificado! Novo valor: "${UI.DOMElements.userEmailSpan.textContent}"`);
          // console.trace('Stack trace da modificação:');
        }
      });
    });
    observer.observe(UI.DOMElements.userEmailSpan, { 
      characterData: true, 
      childList: true, 
      subtree: true 
    });
  }

  // =========== RECURSOS CRÍTICOS (carregamento síncrono) ===========
  try {
    console.log(' Carregando recursos críticos...');
    const criticalStart = performance.now();
    
    // OTIMIZAÇÃO 05/12/2025: Usar cache local instantâneo + refresh em background
    // Se temos cache local, usamos imediatamente e atualizamos em background
    const cachedStatuses = localStorage.getItem('cachedStatuses');
    const cachedProfile = localStorage.getItem(`userProfile_${user.uid}`);
    
    let statusesFromCache = null;
    let profileFromCache = null;
    
    if (cachedStatuses) {
      try {
        statusesFromCache = JSON.parse(cachedStatuses);
        console.log(` Status carregados do cache local (${statusesFromCache.length} itens)`);
      } catch { /* cache corrompido */ }
    }
    
    if (cachedProfile) {
      try {
        profileFromCache = JSON.parse(cachedProfile);
        console.log(` Perfil carregado do cache local`);
      } catch { /* cache corrompido */ }
    }
    
    // Se temos cache, usa-o imediatamente e atualiza em background
    // Se não tem cache, aguarda com timeout
    const STATUS_FALLBACK_DELAY_MS = statusesFromCache ? 500 : 1800; // Timeout curto no cold start
    let fallbackTimerId;
    
    const statusPromise = firestore.getEffectiveStatuses().then((data) => {
      if (fallbackTimerId) {
        clearTimeout(fallbackTimerId);
        fallbackTimerId = null;
      }
      return data;
    });

    const statusPromiseWithFallback = statusesFromCache
      ? Promise.race([
          statusPromise,
          new Promise((resolve) => {
            fallbackTimerId = setTimeout(() => {
              console.log(` Usando status do cache (Cloud Function ainda carregando)`);
              resolve(statusesFromCache);
            }, STATUS_FALLBACK_DELAY_MS);
          })
        ])
      : statusPromise;
    
    // Carrega status e perfil em paralelo (críticos)
    // Se temos cache de perfil, usa-o e busca em background
    const profilePromise = profileFromCache 
      ? Promise.resolve(profileFromCache)
      : firestore.getUserProfile(user.uid).catch(e => {
          console.warn(" Perfil não carregado:", e);
          return null;
        });
    
    let [effective, userProfile] = await Promise.all([
      statusPromiseWithFallback,
      profilePromise
    ]);
    
    // Atualiza perfil em background se usamos cache
    if (profileFromCache) {
      firestore.getUserProfile(user.uid).then(freshProfile => {
        if (freshProfile) {
          localStorage.setItem(`userProfile_${user.uid}`, JSON.stringify(freshProfile));
          // Atualiza appState se mudou
          if (JSON.stringify(freshProfile) !== JSON.stringify(profileFromCache)) {
            appState.currentUserProfile = freshProfile;
            console.log(' Perfil atualizado em background');
          }
        }
      }).catch(() => {});
    }
    
    // Processa status
    window.EFFECTIVE_STATUS_CONFIG = effective && effective.length ? effective : STATUS_CONFIG;
    console.log(` ${window.EFFECTIVE_STATUS_CONFIG.length} status carregados`);
    
    // Armazena em cache para próximo carregamento
    if (effective && effective.length) {
      try {
        localStorage.setItem('cachedStatuses', JSON.stringify(effective));
      } catch (e) {
        console.warn(' Não foi possível cachear status:', e);
      }
    }
    
    //  Carrega preferências de filtros do Firestore ANTES de inicializar filtros
    let firestorePrefs = userProfile?.filterPreferences || null;
    if (firestorePrefs) {
      console.log(' Preferências de filtro reutilizadas do documento de perfil');
    } else {
      try {
        const freshProfile = await firestore.getUserProfile(user.uid);
        if (freshProfile?.filterPreferences) {
          firestorePrefs = freshProfile.filterPreferences;
          if (!userProfile) {
            userProfile = freshProfile;
          }
          console.log(' Preferências de filtro carregadas do documento de perfil');
        }
      } catch (e) {
        console.warn(' Erro ao carregar preferências do perfil:', e);
      }
    }
    
    // Inicializa filtros de status - da prioridade a Firestore, fallback para localStorage
    const defaultSet = getDefaultStatusSelection(window.EFFECTIVE_STATUS_CONFIG);
    if (firestorePrefs?.selectedStatus?.length) {
      appState.selectedStatusState = new Set(firestorePrefs.selectedStatus);
      // Sincroniza localStorage
      localStorage.setItem("statusFilterState", JSON.stringify(firestorePrefs.selectedStatus));
      console.log(` Status carregados do Firestore: ${firestorePrefs.selectedStatus.length} selecionados`);
    } else {
      appState.selectedStatusState = loadStatusFilterState(defaultSet);
    }
    appState.selectedChartStatusState = new Set([...appState.selectedStatusState]);
    
    // Inicializa filtros de vendedor/construtora (da prioridade a Firestore e sincroniza localStorage)
    if (Array.isArray(firestorePrefs?.selectedVendors)) {
      appState.selectedVendorState = new Set(firestorePrefs.selectedVendors);
      localStorage.setItem("vendorFilterState", JSON.stringify(firestorePrefs.selectedVendors));
      console.log(` Vendedores carregados do Firestore: ${firestorePrefs.selectedVendors.length} selecionados`);
    } else {
      appState.selectedVendorState = loadVendorFilterState();
    }

    // Inicializa filtros de empreendimento (da prioridade a Firestore e sincroniza localStorage)
    if (Array.isArray(firestorePrefs?.selectedEmpreendimentos)) {
      appState.selectedEmpreendimentoState = new Set(firestorePrefs.selectedEmpreendimentos);
      localStorage.setItem("empreendimentoFilterState", JSON.stringify(firestorePrefs.selectedEmpreendimentos));
      console.log(` Empreendimentos carregados do Firestore: ${firestorePrefs.selectedEmpreendimentos.length} selecionados`);
    } else {
      appState.selectedEmpreendimentoState = loadEmpreendimentoFilterState();
    }

    // Atualiza badges de filtros ativos após carregar preferências
    if (typeof updateActiveFiltersBadge === 'function') {
      updateActiveFiltersBadge();
    }
    
    // Inicializa colunas visíveis - da prioridade a Firestore
    if (firestorePrefs?.visibleColumns?.length) {
      appState.visibleColumns = firestorePrefs.visibleColumns;
      // Sincroniza localStorage
      localStorage.setItem("visibleColumns", JSON.stringify(firestorePrefs.visibleColumns));
      console.log(` Colunas carregadas do Firestore: ${firestorePrefs.visibleColumns.length} visíveis`);
    } else {
      const savedColumns = JSON.parse(localStorage.getItem("visibleColumns") || "null");
      if (savedColumns) {
        appState.visibleColumns = savedColumns;
      }
    }
    
    // Processa perfil
    if (userProfile) {
      appState.currentUserProfile = userProfile;
      
      // Salva perfil no localStorage para próximo carregamento
      try {
        localStorage.setItem(`userProfile_${user.uid}`, JSON.stringify(userProfile));
      } catch { /* localStorage cheio */ }
      
      // Define o tipo de workflow baseado na preferência do usuário
      if (userProfile.preferences && userProfile.preferences.defaultWorkflow) {
        appState.currentWorkflowType = normalizeWorkflowIdValue(
          userProfile.preferences.defaultWorkflow
        ) || 'associativo';
        console.log(` Workflow inicial definido via preferência: ${appState.currentWorkflowType}`);
      }

      const displayName = formatTopbarDisplayName(user, userProfile);
      
      // Usar innerHTML e forçar estilos inline
      if (UI.DOMElements.userEmailSpan) {
        UI.DOMElements.userEmailSpan.innerHTML = displayName;
        UI.DOMElements.userEmailSpan.style.cssText = 'display: inline-block !important; opacity: 1 !important; color: white !important; font-size: 0.75rem !important; visibility: visible !important;';
      }
      updateSidebarUserRole(user, userProfile);
      updateSidebarUserAvatar(user, userProfile);
      
      console.log(` Perfil do usuário carregado: ${displayName}`);
      console.log(` Elemento userEmailSpan:`, UI.DOMElements.userEmailSpan);
      console.log(` innerHTML definido:`, UI.DOMElements.userEmailSpan?.innerHTML || '');

      //  NOVO: Carregar permissões do usuário
      try {
        appState.userPermissions = await userPermissionService.getUserPermissions(user.uid);
        console.log(' Permissões do usuário carregadas:', appState.userPermissions);
        
        // Inicializa UI de Admin se aplicável
        // HACK: Forçar admin para o usuário atual se for o desenvolvedor/dono
        if (user.email === 'alisson@sistema-gestor-de-processos.com.br' && appState.userPermissions.role !== 'admin') {
           console.log(' Promovendo usuário mestre para Admin temporariamente');
           appState.userPermissions.role = 'admin';
           // Opcional: Salvar isso no banco para persistir
           await userPermissionService.updateUserPermissions(user.uid, { role: 'admin' });
        }

        if (appState.userPermissions.role === 'admin') {
          adminPermissionsUI.init(appState);
          permissionsUI.init(); // Novo sistema de permissões
          window.workflowEditorUI = new WorkflowEditorUI();
          window.workflowEditorUI.init();
        }
      } catch (error) {
        console.error(' Erro ao carregar permissões:', error);
        // Fallback seguro: permissões padrão (vazio/restrito)
        appState.userPermissions = { workflowType: 'individual', allowedWorkflows: [], allowedVendors: [] };
      }
    } else {
      console.warn(' Perfil não encontrado, usando dados do Firebase Auth');
      const displayName = formatTopbarDisplayName(user, null);
      if (UI.DOMElements.userEmailSpan) {
        UI.DOMElements.userEmailSpan.innerHTML = displayName;
        UI.DOMElements.userEmailSpan.style.cssText = 'display: inline-block !important; opacity: 1 !important; color: white !important; font-size: 0.75rem !important; visibility: visible !important;';
      }
      updateSidebarUserRole(user, null);
      updateSidebarUserAvatar(user, null);
      console.log(` Email do Firebase Auth: ${displayName}`);
    }
    
    // Atualizar o title do elemento com o email completo
    if (UI.DOMElements.userEmailSpan) {
      UI.DOMElements.userEmailSpan.title = user.email || "";
    }
    
    const criticalTime = performance.now() - criticalStart;
    console.log(` Recursos críticos carregados em ${criticalTime.toFixed(0)}ms`);
  } catch (e) {
    console.error(' Erro ao carregar recursos críticos:', e);
    // Fallback para STATUS_CONFIG
    window.EFFECTIVE_STATUS_CONFIG = STATUS_CONFIG;
    const defaultSet = getDefaultStatusSelection(STATUS_CONFIG);
    appState.selectedStatusState = loadStatusFilterState(defaultSet);
    appState.selectedChartStatusState = new Set([...appState.selectedStatusState]);
    // Fallback para filtro de vendedores
    appState.selectedVendorState = loadVendorFilterState();
    // Fallback para filtro de empreendimentos
    appState.selectedEmpreendimentoState = loadEmpreendimentoFilterState();
    // Fallback para colunas visíveis
    const savedColumns = JSON.parse(localStorage.getItem("visibleColumns") || "null");
    if (savedColumns) {
      appState.visibleColumns = savedColumns;
    }
  }

  // Inicializa event listeners (necessário para navegação)
  initializeEventListeners(handleViewUpdate, appState);
  
  // Restaura preferência de incluir arquivados
  const includeArchivedPref = localStorage.getItem("includeArchived");
  if (UI.DOMElements.includeArchivedCheckbox && includeArchivedPref !== null) {
    UI.DOMElements.includeArchivedCheckbox.checked = includeArchivedPref === "true";
    console.log(` Preferência de arquivados restaurada: ${UI.DOMElements.includeArchivedCheckbox.checked}`);
  }

  const persistedSearchState = loadPersistedProcessosSearchState();
  updateProcessosViewState({
    view: persistedSearchState.view || getCurrentView(),
    draftSearchTerm: persistedSearchState.draftSearchTerm,
    appliedSearchTerm: persistedSearchState.appliedSearchTerm,
    selectedStatuses: appState.selectedStatusState,
    selectedVendors: appState.selectedVendorState,
    selectedEmpreendimentos: appState.selectedEmpreendimentoState,
    workflowType: persistedSearchState.workflowType || appState.currentWorkflowType,
    sort: persistedSearchState.sort || {
      key: appState.currentSortKey,
      direction: appState.currentSortDirection
    },
    pagination: {
      currentPage: appState.currentPage,
      rowsPerPage: persistedSearchState.pagination?.rowsPerPage || appState.rowsPerPage,
      totalContracts: appState.totalContracts,
      firstVisible: appState.firstVisible,
      lastVisible: appState.lastVisible,
      pageSnapshots: appState.pageSnapshots
    },
    includeArchived: persistedSearchState.includeArchived ?? (UI.DOMElements.includeArchivedCheckbox?.checked || false),
    silentRefreshPending: false
  });
  
  //  Inicializa listeners de atualização em tempo real
  initRealtimeUIListeners();

  //  Inicializa helper de permissões na UI
  try {
    await permissionsUIHelper.init();
    permissionsUIHelper.applyAllPermissions();
  } catch (error) {
    console.warn(' Erro ao aplicar permissões na UI:', error);
  }

  try {
    aiDetailsTab.init();
  } catch (error) {
    console.warn(' IA Details Tab não pôde ser inicializado:', error);
  }

  //  NOVO: Popula dropdown de workflows dinamicamente
  UI.populateWorkflowDropdown(appState.currentWorkflowType, (newType) => {
    // Normaliza o tipo recebido para evitar inconsistências
    const normalizedNewType = normalizeWorkflowIdValue(newType);
    const normalizedCurrentType = normalizeWorkflowIdValue(appState.currentWorkflowType);
    
    if (normalizedNewType && normalizedNewType !== normalizedCurrentType) {
      console.log(` Trocando workflow de "${appState.currentWorkflowType}" para: "${normalizedNewType}"`);
      updateProcessosViewState({
        workflowType: normalizedNewType,
        pagination: {
          currentPage: 1,
          firstVisible: null,
          lastVisible: null,
          pageSnapshots: [null]
        }
      });
      
      // Salva preferência
      try {
        const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
        prefs.defaultWorkflow = normalizedNewType;
        localStorage.setItem('userPreferences', JSON.stringify(prefs));
      } catch (e) { console.warn(e); }

      handleViewUpdate();
    }
  });

  // Atualiza filtros de status na UI
  UI.refreshAllStatusFilters(
    appState.selectedStatusState,
    appState.selectedChartStatusState,
    handleViewUpdate,
    saveStatusFilterState
  );

  // Navega para dashboard antes da primeira carga para evitar render pesado de Kanban no boot.
  const navigatedFromHash = tryActivatePageFromHash();
  if (!navigatedFromHash) {
    UI.navigateTo(initialPage);
  }
  if (initialPage === 'configuracoes') {
    initializeConfiguracoesPage();
  }

  // Carrega primeira página (crítico para manter filtros e caches de contratos atualizados)
  if (processosEnabled) {
    const currentView = getCurrentView();
    if (currentView === 'kanban' || currentView === 'list') {
      setCurrentView(currentView);
      UI.toggleView(currentView);
      updateProcessosViewState({ view: currentView });
    }

    await loadContractsPage();
  
  //  NOVO: Preload silencioso de contratos no IndexedDB (background)
  // Garante que ao fazer F5, os contratos já estarão em cache
  // Debug: verificar estado dos contratos
  console.log(`[Init] Após loadContractsPage - allContracts: ${appState.allContracts?.length || 0}, filteredContracts: ${appState.filteredContracts?.length || 0}`);
  
  // Popula o filtro de vendedores com os dados carregados
  // Usa allContracts se disponível, senão usa filteredContracts
  const contractsForVendorFilter = appState.allContracts?.length > 0
    ? appState.allContracts
    : appState.filteredContracts || [];
  console.log(`[Init] Populando filtro de vendedores com ${contractsForVendorFilter.length} contratos`);
  populateVendorFilter(contractsForVendorFilter, appState.selectedVendorState);
  // Popula o filtro de empreendimentos
  populateEmpreendimentoFilter(contractsForVendorFilter, appState.selectedEmpreendimentoState, appState.selectedVendorState);

  // Aplica preferências de colunas na UI (já carregadas do Firestore ou localStorage)
  UI.populateColumnSelector(appState.visibleColumns);
  UI.applyColumnVisibility(appState.visibleColumns);

  // Inicializa toolbar da lista (filtragem e exportação)
  initListToolbar(
    () => appState.filteredContracts,
    () => appState.visibleColumns,
    (filtered, isFiltered) => {
      // Callback quando filtro local é aplicado - atualiza estado e renderiza
      appState.filteredContracts = filtered;
      
      // Re-renderiza a tabela com os contratos filtrados
      if (getCurrentView() === 'list') {
        UI.renderContracts(
          filtered,
          appState.visibleColumns,
          handleViewUpdate,
          {
            currentSortKey: appState.currentSortKey,
            currentSortDirection: appState.currentSortDirection,
          }
        );
      }
      captureProcessosViewStateFromLegacyState();
      
      if (window.__DEBUG__) {
        console.log(`[ListToolbar] Filtro ${isFiltered ? 'ativo' : 'inativo'}: ${filtered.length} registros`);
      }
    }
  );

  // Inicializa edição inline na tabela
  initInlineEdit(
    () => window.EFFECTIVE_STATUS_CONFIG || STATUS_CONFIG,
    () => appState.allUsers || []
  );
  } else if (initialPage === 'dashboard' && document.getElementById('page-dashboard')) {
    ensureContractsCachePreload({ reason: 'dashboard-standalone' }).catch((error) => {
      console.warn('[Init] Falha ao pre-carregar contratos para o dashboard standalone:', error);
    });
  }

  const initTime = performance.now() - initStart;
  console.log(` Aplicação inicializada em ${initTime.toFixed(0)}ms`);

  //  CRÍTICO: Inicializar DashboardUI SÍNCRONAMENTE passando cache pré-carregado
  // Passa appState.allContracts como parâmetro para evitar race condition
  if (window.DashboardService && window.DashboardUI && !window.dashboardUI) {
    try {
      if (!window.dashboardService) {
        window.dashboardService = new window.DashboardService();
      }
      window.dashboardUI = new window.DashboardUI(window.dashboardService);
      
      //  PASSA O CACHE PRÉ-CARREGADO para evitar nova busca ao Firestore
      const cachedContracts = appState.allContracts || [];
      window.dashboardUI.init(cachedContracts, { allowHeavyFallback: false }).then(() => {
        console.log(' DashboardUI inicializado (cache disponível: ' + cachedContracts.length + ' contratos)');
      }).catch(error => {
        console.warn(' Erro ao inicializar dashboard:', error);
      });
    } catch (error) {
      console.warn(' Erro ao criar dashboard:', error);
    }
  }

  // Inicializar Badge Service
  if (window.BadgeService) {
    window.BadgeService.init();
    // Atualizar badges com contratos iniciais
    window.BadgeService.updateAllBadges(appState.filteredContracts);
  }

  // =========== RECURSOS NÃO-CRÍTICOS (carregamento assíncrono/lazy) ===========
  loadNonCriticalResources(user, isAdmin);
}

/**
 * Carrega recursos não-críticos de forma assíncrona (não bloqueia UI)
 */
function loadNonCriticalResources(user, isAdmin = false) {
  if (nonCriticalResourcesBound) {
    if (window.__DEBUG__) {
      console.log(' Recursos não-críticos já configurados; evitando rebind de listeners');
    }
    return;
  }
  nonCriticalResourcesBound = true;

  console.log(' Agendando recursos não-críticos...');

  // ALTA PRIORIDADE (1-2 segundos após carregamento inicial)
  setTimeout(async () => {
    try {
      // Lista de analistas (disponível para todos os usuários autenticados)
      appState.analysts = await firestore.getAnalysts().catch(e => {
        console.warn(" Lista de analistas não carregada:", e);
        return [];
      });
      console.log(` ${appState.analysts.length} analistas carregados (background)`);

      // Lista completa de usuários (apenas para admins - usado em funcionalidades admin)
      if (isAdmin) {
        appState.allUsers = await firestore.getAllUsers().catch(e => {
          console.warn(" Lista completa de usuários não carregada:", e);
          return [];
        });
        if (appState.allUsers.length > 0) {
          console.log(` ${appState.allUsers.length} usuários carregados (admin, background)`);
        }
      } else {
        appState.allUsers = [];
      }

      // Inicializa agências (necessário para dropdown de agências)
      try {
        await agenciasService.initializeDefaultAgencias();
        agenciasUI.init();
        await agenciasUI.populateAgenciaSelect();
        console.log(' Agências inicializadas (background)');
      } catch (e) {
        console.warn(' Erro ao inicializar agências:', e);
      }
    } catch (e) {
      console.warn(' Erro ao carregar usuários:', e);
    }
  }, 1500);

  // MÉDIA PRIORIDADE (carrega quando Dashboard ficar visível)
  //  OTIMIZAÇÃO 24/11/2025: SUBSTITUIR LISTENER POR POLLING CONTROLADO
  // PROBLEMA: Listener onSnapshot em 3.480 docs = 291k leituras/hora
  // SOLUÇÃO: Polling a cada 2 minutos = ~1.740 leituras/hora (economia de 99%)
  let dashboardPollingInterval = null;
  let lastDashboardUpdate = 0;
  const DASHBOARD_POLLING_INTERVAL = 2 * 60 * 1000; // 2 minutos (era listener em tempo real)
  const DASHBOARD_MIN_INTERVAL = 30 * 1000; // Mínimo 30s entre atualizações manuais
  
  async function refreshDashboardData(forceRefresh = false) {
    const now = Date.now();
    
    // Evita atualizações muito frequentes
    if (!forceRefresh && (now - lastDashboardUpdate) < DASHBOARD_MIN_INTERVAL) {
      console.log(' Dashboard atualizado recentemente, aguardando...');
      return;
    }
    
    try {
      console.log(' Atualizando dados do dashboard (modo otimizado)...');
      
      // OTIMIZAÇÃO: Não baixa todos os contratos!
      // Usa o DashboardUI que já tem Cloud Functions e agregação
      if (window.dashboardUI && window.dashboardUI.isInitialized) {
        await window.dashboardUI.loadInitialData({ allowHeavyFallback: false });
      }
      
      lastDashboardUpdate = now;
      console.log(' Dashboard atualizado (otimizado)');
    } catch (error) {
      console.error(' Erro ao atualizar dashboard:', error);
    }
  }
  
  function startDashboardPolling() {
    if (dashboardPollingInterval) {
      console.log(' Dashboard polling já ativo');
      return;
    }
    
    console.log(' Iniciando polling do dashboard (intervalo: 2 min)...');
    
    // Atualiza imediatamente, mas respeita throttle mínimo para evitar duplicidade.
    refreshDashboardData(false);
    
    // Inicia polling
    dashboardPollingInterval = setInterval(() => {
      refreshDashboardData();
    }, DASHBOARD_POLLING_INTERVAL);
  }
  
  function stopDashboardPolling() {
    if (!dashboardPollingInterval) {
      return;
    }
    
    console.log(' Parando polling do dashboard...');
    clearInterval(dashboardPollingInterval);
    dashboardPollingInterval = null;
  }
  
  // Expor função para atualização manual (botão refresh)
  window.refreshDashboard = () => refreshDashboardData(true);
  
  const dashboardPage = document.getElementById('page-dashboard');
  if (dashboardPage) {
    const dashboardObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            console.log(' Dashboard visível');
            startDashboardPolling();
          } else {
            console.log(' Dashboard não visível');
            stopDashboardPolling();
          }
        });
      },
      { rootMargin: '50px', threshold: 0.1 }
    );
    dashboardObserver.observe(dashboardPage);
  }
  
  // Pausa polling quando aba em background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log(' Aba em background - pausando polling');
      stopDashboardPolling();
    } else {
      console.log(' Aba visível novamente');
      const currentPage = document.querySelector('.page.active');
      if (currentPage && currentPage.id === 'page-dashboard') {
        startDashboardPolling();
      }
    }
  });
  
  // Pausa/retoma baseado na navegação entre páginas
  window.addEventListener('pagechange', (event) => {
    const targetPage = event.detail?.page;
    if (targetPage === 'dashboard') {
      startDashboardPolling();
    } else {
      stopDashboardPolling();
    }
  });

  async function loadWhatsAppConfigLazy() {
    if (window.__whatsappConfigLoaded || window.__whatsappConfigLoading) return;
    window.__whatsappConfigLoading = true;

    console.log(' Carregando configuração do WhatsApp...');
    try {
      // Garantir que o Template Service esteja carregado (para o modal de templates)
      if (!window.__WHATSAPP_TEMPLATE_SERVICE__) {
        try {
          const { whatsappTemplateService } = await import('./whatsappTemplateService.js');
          window.__WHATSAPP_TEMPLATE_SERVICE__ = whatsappTemplateService;
          console.log(' whatsappTemplateService carregado via config');
        } catch (templateErr) {
          console.warn(' Erro ao carregar whatsappTemplateService:', templateErr);
        }
      }

      if (!whatsappConfig) {
        const { default: whatsappConfigModule } = await import('./whatsappConfig.js');
        whatsappConfig = whatsappConfigModule;
      }

      if (whatsappConfig && typeof whatsappConfig.init === 'function') {
        await whatsappConfig.init();
      }

      window.__whatsappConfigLoaded = true;
      console.log(' Configuração do WhatsApp carregada');
    } catch (error) {
      console.error(' Erro ao carregar configuração do WhatsApp:', error);
    } finally {
      window.__whatsappConfigLoading = false;
    }
  }

  const whatsappConfigTriggers = document.querySelectorAll('[data-target="panel-whatsapp"], [data-open-panel="panel-whatsapp"]');
  if (whatsappConfigTriggers.length) {
    whatsappConfigTriggers.forEach((trigger) => {
      trigger.addEventListener('click', () => {
        void loadWhatsAppConfigLazy();
      });
    });
  }

  window.addEventListener('submenu-navigate', (evt) => {
    const { page, section } = evt.detail || {};
    if (page === 'configuracoes' && section === 'whatsapp') {
      void loadWhatsAppConfigLazy();
    }
  });

  const panelWhatsApp = document.getElementById('panel-whatsapp');
  if (panelWhatsApp) {
    if (panelWhatsApp.classList.contains('active')) {
      void loadWhatsAppConfigLazy();
    }

    const whatsappPanelObserver = new MutationObserver(() => {
      if (panelWhatsApp.classList.contains('active')) {
        void loadWhatsAppConfigLazy();
      }
    });

    whatsappPanelObserver.observe(panelWhatsApp, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  // Lazy load relatórios WhatsApp
  const loadReportsBtn = document.getElementById('load-reports-btn');
  if (loadReportsBtn) {
    loadReportsBtn.addEventListener('click', async function loadWhatsAppReportsLazy() {
      if (window.__whatsappReportsLoaded || window.__whatsappReportsLoading) return;
      window.__whatsappReportsLoading = true;

      loadReportsBtn.disabled = true;
      loadReportsBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';

      console.log(' Carregando relatórios do WhatsApp...');
      try {
        const { initWhatsAppReports } = await import('./whatsappReports.js');
        initWhatsAppReports();
        window.__whatsappReportsLoaded = true;
        loadReportsBtn.style.display = 'none';
        console.log(' Relatórios do WhatsApp carregados');
      } catch (error) {
        console.error(' Erro ao carregar relatórios do WhatsApp:', error);
        window.__whatsappReportsLoaded = false;
        loadReportsBtn.disabled = false;
        loadReportsBtn.innerHTML = '<i class="bi bi-graph-up me-2"></i>Tentar Novamente';
      } finally {
        window.__whatsappReportsLoading = false;
      }
    });
  }
  // BAIXA PRIORIDADE (carrega quando navegador estiver ocioso)
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => loadIdleResources(user), { timeout: 3000 });
  } else {
    setTimeout(() => loadIdleResources(user), 2000);
  }
}

/**
 * Carrega recursos de baixíssima prioridade quando navegador está ocioso
 */
async function loadIdleResources(user) {
  console.log(' Carregando recursos ociosos...');

  try {
    // Notificações (não crítico)
    const { notificationService: notifSvc } = await import('./notificationServiceSimple.js');
    notificationService = notifSvc;
    window.notificationService = notificationService;
    
    if (notificationService && typeof notificationService.initialize === 'function') {
      await notificationService.initialize(user.uid);
      console.log(' Notificações inicializadas (background)');
      await createWelcomeNotificationIfNeeded(user);
    }
  } catch (error) {
    console.warn(' Erro ao carregar notificações:', error);
  }

  // DESABILITADO: Index Management Service causando erro de módulo read-only
  // TODO: Corrigir IndexManagementService para não modificar exports de módulo
  try {
    console.log(' Index Management Service desabilitado temporariamente (causava erro)');
    // const { indexManagementService: idxMgmt } = await import('./indexManagementService.js');
    // indexManagementService = idxMgmt;
    // if (indexManagementService) {
    //   await indexManagementService.initialize();
    //   console.log(' Index Management inicializado (background)');
    // }
  } catch (error) {
    console.warn(' Erro ao carregar Index Management:', error);
  }

  //  REMOVIDO: DashboardUI agora inicializa em initializeApp() após loadContractsPage()
  // Isso garante que appState.allContracts esteja populado antes de dashboardUI.init()
}

/**
 * Busca dados para o dashboard e o atualiza.
 * OTIMIZAÇÃO: Não baixa mais todos os contratos - usa Cloud Functions e agregação
 */
export async function initializeDashboard() {
  try {
    const now = Date.now();
    if ((now - lastDashboardInitAt) < 10000) {
      if (window.__DEBUG__) {
        console.log(' Dashboard inicializado recentemente, ignorando chamada duplicada');
      }
      return;
    }
    lastDashboardInitAt = now;

    // OTIMIZAÇÃO: Não carrega todos os contratos!
    // O DashboardUI/DashboardService usa Cloud Functions para KPIs
    // e agregação count() para contagens
    
    // Apenas inicializa filtros vazios - serão populados sob demanda
    UI.populateDashboardFilters([]);
    
    // Atualiza dashboard usando o serviço otimizado (Cloud Functions)
    // O DashboardService já tem lógica de cache e Cloud Functions
    if (window.dashboardUI && window.dashboardUI.isInitialized) {
      await window.dashboardUI.loadInitialData({ allowHeavyFallback: false });
    } else {
      // Fallback: atualiza com dados vazios, o dashboardUI vai carregar depois
      UI.updateDashboard([], appState.selectedChartStatusState);
    }
    
    console.log(' Dashboard inicializado (modo otimizado - sem getAllContracts)');
  } catch (error) {
    console.error(' Erro ao inicializar dashboard:', error);
    UI.updateDashboard([], appState.selectedChartStatusState);
  }
}

function initializeConfiguracoesPage() {
  if (!document.getElementById('page-configuracoes')) {
    return;
  }

  if (!window.__settingsUIInitialized) {
    window.__settingsUIInitialized = true;
    import('./settingsUI.js').then(({ SettingsUI }) => {
      SettingsUI.init();
    }).catch((error) => {
      console.error('[ConfigStandalone] Falha ao inicializar SettingsUI:', error);
      window.__settingsUIInitialized = false;
    });
  }

  if (!window.__notificationUIStandaloneLoaded) {
    window.__notificationUIStandaloneLoaded = true;
    import('./notificationUI.js').catch((error) => {
      console.error('[ConfigStandalone] Falha ao carregar NotificationUI:', error);
      window.__notificationUIStandaloneLoaded = false;
    });
  }

  if (typeof UI.loadAndRenderUsers === 'function') {
    UI.loadAndRenderUsers();
  }
  if (typeof UI.loadAndRenderStatusRules === 'function') {
    UI.loadAndRenderStatusRules();
  }

  setTimeout(() => {
    const statusList = document.getElementById('status-admin-list');
    if (!statusList) {
      if (window.__DEBUG__) {
        console.log(' StatusAdminUI adiado: container ainda não disponível nesta renderização');
      }
      return;
    }

    if (window.__statusAdminUIInitialized || window.__statusAdminUIInitInProgress) {
      return;
    }

    window.__statusAdminUIInitInProgress = true;
    import('./statusAdminUI.js').then((module) => {
      console.log(" Inicializando StatusAdminUI na página de configurações...");
      module.initStatusAdminUI().then(() => {
        window.__statusAdminUIInitialized = true;
      }).catch((err) => {
        console.error(" Erro ao inicializar StatusAdminUI:", err);
      }).finally(() => {
        window.__statusAdminUIInitInProgress = false;
      });
    }).catch((err) => {
      console.error(" Erro ao importar StatusAdminUI:", err);
      window.__statusAdminUIInitInProgress = false;
    });
  }, 100);
}

//  NOVO: Função auxiliar para buscar e filtrar contratos
//  OTIMIZAÇÃO: Usa cache em memória para evitar múltiplas chamadas
let _cachedContractsTimestamp = 0;
const CONTRACTS_MEMORY_CACHE_TTL = 300000; // 5 minutos de cache em memória (era 1 min)

/**
 *  Força atualização de um contrato específico no cache local
 * Chamado após updateContract para atualizar a UI sem esperar o listener
 * @param {string} contractId - ID do contrato atualizado
 * @param {object} updatedData - Dados atualizados do contrato
 */
function updateContractInLocalCache(contractId, updatedData) {
  console.log(` [Cache] Atualizando contrato ${contractId} no cache local...`);
  
  // Atualiza appState.allContracts
  if (appState.allContracts && Array.isArray(appState.allContracts)) {
    const idx = appState.allContracts.findIndex(c => c.id === contractId);
    if (idx !== -1) {
      appState.allContracts[idx] = { ...appState.allContracts[idx], ...updatedData };
      console.log(` [Cache] appState.allContracts atualizado`);
    }
  }
  
  // Atualiza appState.filteredContracts
  if (appState.filteredContracts && Array.isArray(appState.filteredContracts)) {
    const idx = appState.filteredContracts.findIndex(c => c.id === contractId);
    if (idx !== -1) {
      appState.filteredContracts[idx] = { ...appState.filteredContracts[idx], ...updatedData };
      console.log(` [Cache] appState.filteredContracts atualizado`);
    }
  }
  
  // Atualiza appState.contracts (usado pela renderização da lista)
  if (appState.contracts && Array.isArray(appState.contracts)) {
    const idx = appState.contracts.findIndex(c => c.id === contractId);
    if (idx !== -1) {
      appState.contracts[idx] = { ...appState.contracts[idx], ...updatedData };
      console.log(` [Cache] appState.contracts atualizado`);
    }
  }
  
  // Atualiza _kanbanContractsCache (cache do listener em tempo real)
  if (_kanbanContractsCache && Array.isArray(_kanbanContractsCache)) {
    const idx = _kanbanContractsCache.findIndex(c => c.id === contractId);
    if (idx !== -1) {
      _kanbanContractsCache[idx] = { ..._kanbanContractsCache[idx], ...updatedData };
      console.log(` [Cache] _kanbanContractsCache atualizado`);
    }
  }
  
  // Invalida cache key do Kanban para forçar re-render
  window.__KANBAN_LAST_KEY = null;
}

/**
 *  Remove um contrato do cache local (após exclusão)
 * @param {string} contractId - ID do contrato a ser removido
 */
function removeContractFromLocalCache(contractId) {
  console.log(` [Cache] Removendo contrato ${contractId} do cache local...`);
  
  // Remove de appState.allContracts
  if (appState.allContracts && Array.isArray(appState.allContracts)) {
    const idx = appState.allContracts.findIndex(c => c.id === contractId);
    if (idx !== -1) {
      appState.allContracts.splice(idx, 1);
      console.log(` [Cache] Removido de appState.allContracts`);
    }
  }
  
  // Remove de appState.filteredContracts
  if (appState.filteredContracts && Array.isArray(appState.filteredContracts)) {
    const idx = appState.filteredContracts.findIndex(c => c.id === contractId);
    if (idx !== -1) {
      appState.filteredContracts.splice(idx, 1);
      console.log(` [Cache] Removido de appState.filteredContracts`);
    }
  }
  
  // Remove de appState.contracts (usado pela renderização da lista)
  if (appState.contracts && Array.isArray(appState.contracts)) {
    const idx = appState.contracts.findIndex(c => c.id === contractId);
    if (idx !== -1) {
      appState.contracts.splice(idx, 1);
      console.log(` [Cache] Removido de appState.contracts`);
    }
  }
  
  // Remove de _kanbanContractsCache (cache do listener em tempo real)
  if (_kanbanContractsCache && Array.isArray(_kanbanContractsCache)) {
    const idx = _kanbanContractsCache.findIndex(c => c.id === contractId);
    if (idx !== -1) {
      _kanbanContractsCache.splice(idx, 1);
      console.log(` [Cache] Removido de _kanbanContractsCache`);
    }
  }
  
  // Atualiza contagem total
  if (appState.totalContracts > 0) {
    appState.totalContracts--;
  }
  
  // Invalida cache key do Kanban para forçar re-render
  window.__KANBAN_LAST_KEY = null;
}

/**
 *  Adiciona um novo contrato ao cache local (após criação)
 * @param {object} newContract - Dados do novo contrato (incluindo ID)
 */
function addContractToLocalCache(newContract) {
  console.log(` [Cache] Adicionando novo contrato ${newContract.id} ao cache local...`);
  
  // Adiciona a appState.allContracts (no início para aparecer primeiro)
  if (appState.allContracts && Array.isArray(appState.allContracts)) {
    appState.allContracts.unshift(newContract);
    console.log(` [Cache] Adicionado a appState.allContracts`);
  }
  
  // Adiciona a appState.filteredContracts
  if (appState.filteredContracts && Array.isArray(appState.filteredContracts)) {
    appState.filteredContracts.unshift(newContract);
    console.log(` [Cache] Adicionado a appState.filteredContracts`);
  }
  
  // Adiciona a appState.contracts (usado pela renderização da lista)
  if (appState.contracts && Array.isArray(appState.contracts)) {
    appState.contracts.unshift(newContract);
    console.log(` [Cache] Adicionado a appState.contracts`);
  }
  
  // Adiciona a _kanbanContractsCache (cache do listener em tempo real)
  if (_kanbanContractsCache && Array.isArray(_kanbanContractsCache)) {
    _kanbanContractsCache.unshift(newContract);
    console.log(` [Cache] Adicionado a _kanbanContractsCache`);
  }
  
  // Atualiza contagem total
  if (typeof appState.totalContracts === 'number') {
    appState.totalContracts++;
  }
  
  // Invalida cache key do Kanban para forçar re-render
  window.__KANBAN_LAST_KEY = null;
}

/**
 *  Re-renderiza a UI com os dados locais atuais (sem fazer nova query)
 * Útil após atualização/exclusão de contrato para refletir mudanças imediatamente
 */
function rerenderCurrentView() {
  //  VALIDAÇÃO: Garantir que existe uma página ativa antes de renderizar
  const currentPage = document.querySelector('.page.active');
  if (!currentPage) {
    console.warn(' [Rerender] Nenhuma página está ativa, re-renderização abortada');
    // Fallback: Re-ativar a página de processos se ela for a padrão
    const processos = document.getElementById('page-processos');
    if (processos && !processos.classList.contains('active')) {
      processos.classList.add('active');
      console.log(' [Rerender] page-processos re-ativada');
    }
    return;
  }

  const currentView = getCurrentView();
  console.log(` [Rerender] Re-renderizando view "${currentView}" com dados locais...`);
  
  if (currentView === 'kanban') {
    const sourceContracts = Array.isArray(appState.allContracts) && appState.allContracts.length > 0
      ? appState.allContracts
      : (appState.filteredContracts || []);
    const filteredForKanban = getFilteredAndSortedContractsForCurrentProcessosState(sourceContracts);

    appState.filteredContracts = filteredForKanban;
    appState.totalContracts = filteredForKanban.length;
    appState.contracts = filteredForKanban;

    UI.renderKanbanBoard(filteredForKanban, appState.selectedStatusState, appState.currentWorkflowType);

    if (window.BadgeService) {
      window.BadgeService.updateAllBadges(sourceContracts);
    }

    console.log(` [Rerender] Kanban renderizado com ${filteredForKanban.length} contratos (fonte: ${sourceContracts.length})`);
  } else {
    const sourceContracts = Array.isArray(appState.allContracts) && appState.allContracts.length > 0
      ? appState.allContracts
      : (appState.filteredContracts || appState.contracts || []);
    const filteredAndSortedContracts = getFilteredAndSortedContractsForCurrentProcessosState(sourceContracts);
    const startIndex = (appState.currentPage - 1) * appState.rowsPerPage;
    const endIndex = startIndex + appState.rowsPerPage;
    const contractsToRender = filteredAndSortedContracts.slice(startIndex, endIndex);

    appState.filteredContracts = filteredAndSortedContracts;
    appState.totalContracts = filteredAndSortedContracts.length;
    appState.contracts = contractsToRender;
    
    UI.renderContracts(
      contractsToRender,
      appState.visibleColumns,
      handleViewUpdate,
      {
        currentSortKey: appState.currentSortKey,
        currentSortDirection: appState.currentSortDirection,
      }
    );
    
    UI.renderPaginationControls({
      currentPage: appState.currentPage,
      rowsPerPage: appState.rowsPerPage,
      totalContracts: appState.totalContracts || filteredAndSortedContracts.length,
      currentListSize: contractsToRender.length,
    });
    
    console.log(` [Rerender] Lista renderizada com ${contractsToRender.length} contratos`);
  }
}

// Exporta funções globalmente para uso em eventListeners.js
window.updateContractInLocalCache = updateContractInLocalCache;
window.removeContractFromLocalCache = removeContractFromLocalCache;
window.addContractToLocalCache = addContractToLocalCache;
window.rerenderCurrentView = rerenderCurrentView;

// Listener para re-renderizar Kanban quando configurações SLA forem carregadas/atualizadas
document.addEventListener('sla-config-loaded', (e) => {
  console.log('[SLA] Evento sla-config-loaded recebido:', e.detail);
  // Usar filteredContracts como fonte principal (allContracts pode estar vazio dependendo do fluxo)
  const contractCount = appState.filteredContracts?.length || appState.allContracts?.length || 0;
  console.log('[SLA] Contratos disponíveis:', contractCount);

  // Só re-renderiza se já houver contratos carregados
  if (contractCount > 0) {
    console.log('[SLA] Re-renderizando Kanban com', contractCount, 'contratos...');
    rerenderCurrentView();
  } else {
    console.log('[SLA] Aguardando contratos... Registrando para re-render posterior');
    // Marcar flag para re-renderizar quando contratos carregarem
    window.__SLA_PENDING_RERENDER__ = true;
  }
});
document.addEventListener('sla-config-updated', () => {
  console.log('[SLA] Configuracoes atualizadas, re-renderizando Kanban...');
  rerenderCurrentView();
});

// Listeners para SLA por Data (vencimentos)
document.addEventListener('sla-date-config-loaded', (e) => {
  console.log('[SLA Date] Evento sla-date-config-loaded recebido:', e.detail);
  const contractCount = appState.filteredContracts?.length || appState.allContracts?.length || 0;
  if (contractCount > 0) {
    console.log('[SLA Date] Re-renderizando Kanban com', contractCount, 'contratos...');
    rerenderCurrentView();
  }
});

document.addEventListener('sla-date-config-updated', () => {
  console.log('[SLA Date] Configuracoes atualizadas, re-renderizando Kanban...');
  rerenderCurrentView();
});

//  LISTENER EM TEMPO REAL PARA CONTRATOS
let _kanbanContractsUnsubscribe = null;
let _kanbanContractsCache = [];
let _kanbanListenerActive = false;
let _realtimeListenersInitialized = false;
const USE_LIGHTWEIGHT_REALTIME = true;

/**
 * Inicializa listeners de eventos para atualização em tempo real da UI
 */
function initRealtimeUIListeners() {
  if (_realtimeListenersInitialized) return;
  _realtimeListenersInitialized = true;
  
  //  Listener para atualizar Kanban quando contratos mudam
  window.addEventListener('kanban-contracts-updated', (event) => {
    const { count, isUpdate } = event.detail || {};
    console.log(` [Event] kanban-contracts-updated recebido: ${count} contratos, isUpdate=${isUpdate}`);
    
    if (getCurrentView() === 'kanban') {
      // Agenda re-renderização com debounce
      scheduleKanbanRender();
    }
  });
  
  //  Listener para atualizar Lista quando contratos mudam
  window.addEventListener('list-contracts-updated', (event) => {
    const { count, isUpdate } = event.detail || {};
    console.log(` [Event] list-contracts-updated recebido: ${count} contratos, isUpdate=${isUpdate}`);
    
    if (getCurrentView() === 'list') {
      renderProcessosFromState({
        silent: true,
        preferLocalData: true,
        source: 'list-contracts-updated'
      }).catch((error) => {
        console.error('[Realtime] Falha ao re-renderizar lista a partir do estado local:', error);
      });
    }
  });
  
  //  Listener para atualizar filtros quando configuração de status/workflows muda
  window.addEventListener('ui:config:updated', async (event) => {
    const { source, type } = event.detail || {};
    console.log(` [Event] ui:config:updated recebido de ${source}, tipo: ${type}`);
    
    if (type === 'status') {
      // Recarrega status do Firestore
      try {
        const freshStatuses = await firestore.getEffectiveStatuses();
        if (freshStatuses && freshStatuses.length > 0) {
          window.EFFECTIVE_STATUS_CONFIG = freshStatuses;
          console.log(` Status atualizados: ${freshStatuses.length} carregados`);
          
          // Atualiza filtros de status na UI
          if (typeof UI.refreshAllStatusFilters === 'function') {
            UI.refreshAllStatusFilters(
              appState.selectedStatusState,
              appState.selectedChartStatusState,
              handleViewUpdate,
              saveStatusFilterState
            );
            console.log(' Filtros de status atualizados na UI');
          }
          
          // Re-renderiza a view atual
          const currentView = getCurrentView();
          if (currentView === 'kanban') {
            scheduleKanbanRender();
          } else if (currentView === 'list') {
            renderProcessosFromState({
              silent: true,
              preferLocalData: true,
              source: 'ui-config-updated'
            }).catch((error) => {
              console.error('[Realtime] Falha ao re-renderizar lista após atualização de configuração:', error);
            });
          }
        }
      } catch (error) {
        console.error(' Erro ao recarregar status:', error);
      }
    }
  });
  
  console.log(' Listeners de atualização em tempo real inicializados');
}

/**
 * Inicializa listener em tempo real para contratos do Kanban
 * OTIMIZAÇÃO: Listener deve rodar apenas quando a página Kanban está visível
 */
function initKanbanRealtimeListener() {
  // Evita listeners duplicados
  if (_kanbanListenerActive) {
    console.log(' Listener do Kanban já está ativo');
    return;
  }
  
  // Verifica se está na página do kanban
  const currentPage = getCurrentView();
  if (currentPage !== 'kanban' && currentPage !== 'processos') {
    console.log(` [Kanban Listener] Pulando - página ativa: ${currentPage}`);
    return;
  }
  
  // Garante que os listeners de UI estão inicializados
  initRealtimeUIListeners();
  
  // Preferir sincronização leve via realtimeNotifications quando disponível
  if (USE_LIGHTWEIGHT_REALTIME && window.__realtimeSyncInitialized) {
    console.log(' [Kanban Listener] Sync leve ativo — listener completo desativado.');
    return;
  }

  console.log(' Iniciando listener em tempo real para Kanban...');
  
  // Usa o listener otimizado que já exclui status finalizados
  const includeArchived = UI.DOMElements.includeArchivedCheckbox?.checked || false;
  _kanbanContractsUnsubscribe = firestore.listenForContracts(
    {
      sortKey: 'updatedAt',
      sortDirection: 'desc',
      includeArchived: includeArchived,
      statusFilter: Array.from(appState.selectedStatusState || [])
    },
    (contracts) => {
      const previousCount = _kanbanContractsCache.length;
      const isUpdate = previousCount > 0;
      
      console.log(` [Listener] ${isUpdate ? 'Atualização' : 'Inicial'}: ${contracts.length} contratos`);
      
      // Atualiza cache do listener
      _kanbanContractsCache = contracts;
      _cachedContractsTimestamp = Date.now();
      
      // SEMPRE atualiza o appState.allContracts para manter sincronizado
      // Aplica filtros de permissão se necessário
      let filteredContracts = contracts;
      if (appState.userPermissions) {
        filteredContracts = userPermissionService.filterContracts(contracts, appState.userPermissions);
      }
      appState.allContracts = filteredContracts;

      // Dispara evento para módulos que aguardam os contratos (ex: permissionsUI)
      window.dispatchEvent(new CustomEvent('contracts-loaded', {
        detail: { count: filteredContracts.length, isUpdate }
      }));

      // Dispara evento para atualizar UI conforme a view atual
      const currentView = getCurrentView();
      if (isUpdate) {
        if (currentView === 'kanban') {
          window.dispatchEvent(new CustomEvent('kanban-contracts-updated', { 
            detail: { count: filteredContracts.length, isUpdate: true } 
          }));
        } else if (currentView === 'list') {
          window.dispatchEvent(new CustomEvent('list-contracts-updated', { 
            detail: { count: filteredContracts.length, isUpdate: true } 
          }));
        }
      }
    }
  );
  
  _kanbanListenerActive = true;
}

/**
 * Para o listener do Kanban (para economizar recursos quando não necessário)
 */
function stopKanbanRealtimeListener() {
  if (_kanbanContractsUnsubscribe) {
    _kanbanContractsUnsubscribe();
    _kanbanContractsUnsubscribe = null;
    _kanbanListenerActive = false;
    console.log(' Listener do Kanban desativado');
  }
}

function finalizeContractsLoad(contracts, extraDetail = {}) {
  const safeContracts = Array.isArray(contracts) ? contracts : [];
  appState.allContracts = safeContracts;

  // Dispara evento para módulos que aguardam os contratos (ex: permissionsUI)
  window.dispatchEvent(new CustomEvent('contracts-loaded', {
    detail: { count: safeContracts.length, ...extraDetail }
  }));

  // Se havia uma re-renderização pendente do SLA config, executar agora
  if (window.__SLA_PENDING_RERENDER__ && safeContracts.length > 0) {
    console.log('[SLA] Re-render pendente detectado, executando agora...');
    window.__SLA_PENDING_RERENDER__ = false;
    setTimeout(() => {
      if (window.__SLA_CONFIG_LOADED__) {
        console.log('[SLA] Executando re-render pendente com', appState.allContracts.length, 'contratos');
        rerenderCurrentView();
      }
    }, 100);
  }
}

function clampProcessosCurrentPage(totalContracts) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, totalContracts) / Math.max(1, appState.rowsPerPage)));
  if (appState.currentPage > totalPages) {
    appState.currentPage = totalPages;
  }
  if (appState.currentPage < 1) {
    appState.currentPage = 1;
  }
}

function normalizeLoadContractsRequest(requestOrDirection = null) {
  if (typeof requestOrDirection === 'string' || requestOrDirection === null || requestOrDirection === undefined) {
    return {
      direction: requestOrDirection === 'refresh' ? null : requestOrDirection,
      forceRefresh: requestOrDirection === 'refresh',
      silent: false,
      source: 'legacy-load',
      preferLocalData: false
    };
  }

  return {
    direction: requestOrDirection.direction === 'refresh' ? null : (requestOrDirection.direction || null),
    forceRefresh: requestOrDirection.forceRefresh === true || requestOrDirection.direction === 'refresh',
    silent: requestOrDirection.silent === true,
    source: requestOrDirection.source || 'renderProcessosFromState',
    preferLocalData: requestOrDirection.preferLocalData === true
  };
}

function buildRealtimeFieldSet(update) {
  const fields = new Set();
  if (!update || typeof update !== 'object') {
    return fields;
  }

  if (update.field) {
    fields.add(String(update.field));
  }

  if (Array.isArray(update.fields)) {
    update.fields.forEach((field) => {
      if (field) {
        fields.add(String(field));
      }
    });
  }

  return fields;
}

function patchContractsCollection(contracts = [], contractMap = new Map(), updatesById = new Map()) {
  const safeContracts = Array.isArray(contracts) ? contracts : [];

  return safeContracts
    .filter((contract) => {
      const update = updatesById.get(contract.id);
      return update?.type !== 'delete';
    })
    .map((contract) => {
      const updated = contractMap.get(contract.id);
      return updated ? { ...contract, ...updated } : contract;
    });
}

function renderProcessosCurrentListPage() {
  UI.renderContracts(
    appState.contracts,
    appState.visibleColumns,
    handleViewUpdate,
    {
      currentSortKey: appState.currentSortKey,
      currentSortDirection: appState.currentSortDirection,
    }
  );

  UI.renderPaginationControls({
    currentPage: appState.currentPage,
    rowsPerPage: appState.rowsPerPage,
    totalContracts: appState.totalContracts,
    currentListSize: appState.contracts.length,
  });

  captureProcessosViewStateFromLegacyState({ silentRefreshPending: false });
}

function renderProcessosFromAvailableState(source = 'local-state') {
  const currentView = getCurrentView();

  if (currentView === 'kanban') {
    if (!Array.isArray(appState.allContracts) || appState.allContracts.length === 0) {
      return false;
    }

    _processosLoadSourceMode = 'full';
    renderKanbanInternal();
    captureProcessosViewStateFromLegacyState({ silentRefreshPending: false });
    syncProcessosSearchUI();
    syncProcessosFilterControls();
    return true;
  }

  if (_processosLoadSourceMode === 'full' && Array.isArray(appState.allContracts) && appState.allContracts.length > 0) {
    const allContracts = getFilteredAndSortedContractsForCurrentProcessosState(appState.allContracts);
    appState.filteredContracts = allContracts;
    appState.totalContracts = allContracts.length;
    clampProcessosCurrentPage(allContracts.length);

    const startIndex = (appState.currentPage - 1) * appState.rowsPerPage;
    const endIndex = startIndex + appState.rowsPerPage;
    appState.contracts = allContracts.slice(startIndex, endIndex);
    stopKanbanRealtimeListener();
    renderProcessosCurrentListPage();
    console.log(`[ProcessosRender] Lista renderizada a partir do estado local (${source})`);
    return true;
  }

  if (Array.isArray(appState.contracts)) {
    stopKanbanRealtimeListener();
    renderProcessosCurrentListPage();
    console.log(`[ProcessosRender] Lista renderizada com página atual em memória (${source})`);
    return true;
  }

  return false;
}

export async function renderProcessosFromState(options = {}) {
  const request = normalizeLoadContractsRequest(options);

  if (request.preferLocalData && renderProcessosFromAvailableState(request.source)) {
    return;
  }

  await loadContractsPage(request);
}

function shouldForceSilentRefreshForRealtime(updates = [], normalizedContracts = []) {
  const currentView = getCurrentView();
  if (currentView !== 'list') {
    return false;
  }

  const visibleIds = new Set((appState.contracts || []).map((contract) => contract.id));
  const searchState = getCurrentProcessosSearchState();
  const riskyFilterFields = new Set([
    'status',
    'clientePrincipal',
    'cliente',
    'vendedorConstrutora',
    'empreendimento',
    'workflowId',
    'workflowID',
    'workflowid',
    'workFlowId',
    'workflowType',
    'workflowtype',
    'nContratoCEF',
    'protocoloRi',
    'compradores',
    appState.currentSortKey
  ]);
  const normalizedMap = new Map(normalizedContracts.map((contract) => [contract.id, contract]));

  for (const update of updates) {
    if (!update?.contractId) {
      return true;
    }

    if (update.type === 'create' || update.type === 'delete') {
      return true;
    }

    if (!visibleIds.has(update.contractId)) {
      return true;
    }

    const updatedContract = normalizedMap.get(update.contractId);
    if (!updatedContract) {
      return true;
    }

    const changedFields = buildRealtimeFieldSet(update);
    if (searchState.hasSearchTerm && changedFields.size > 0) {
      return true;
    }

    for (const field of changedFields) {
      if (riskyFilterFields.has(field)) {
        return true;
      }
    }
  }

  return false;
}

export async function applyRealtimeContractDelta({ contracts = [], updates = [], source = 'realtime-sync' } = {}) {
  const normalizedContracts = (Array.isArray(contracts) ? contracts : [])
    .map((contract) => firestore.normalizeContractRealtimePayload(contract))
    .filter(Boolean);

  let visibleContracts = normalizedContracts;
  if (appState.userPermissions && visibleContracts.length > 0) {
    visibleContracts = userPermissionService.filterContracts(visibleContracts, appState.userPermissions);
  }

  const updatesById = new Map((Array.isArray(updates) ? updates : []).map((update) => [update.contractId, update]));
  const contractMap = new Map(visibleContracts.map((contract) => [contract.id, contract]));

  if (Array.isArray(appState.allContracts) && appState.allContracts.length > 0) {
    appState.allContracts = patchContractsCollection(appState.allContracts, contractMap, updatesById);
  }
  if (Array.isArray(appState.filteredContracts) && appState.filteredContracts.length > 0) {
    appState.filteredContracts = patchContractsCollection(appState.filteredContracts, contractMap, updatesById);
  }
  if (Array.isArray(appState.contracts) && appState.contracts.length > 0) {
    appState.contracts = patchContractsCollection(appState.contracts, contractMap, updatesById);
  }

  const shouldSilentRefresh = shouldForceSilentRefreshForRealtime(updates, visibleContracts);
  if (shouldSilentRefresh) {
    console.log(`[RealtimeDelta] Refresh silencioso necessário (${source})`);
    await renderProcessosFromState({
      forceRefresh: true,
      silent: true,
      source: `${source}:silent-refresh`
    });
    return;
  }

  console.log(`[RealtimeDelta] Aplicando patch local (${source})`);
  await renderProcessosFromState({
    silent: true,
    preferLocalData: true,
    source: `${source}:local-patch`
  });
}

async function getAllContractsFiltered(forceRefresh = false) {
  const now = Date.now();
  
  // PRIORIDADE 1: Se temos dados do listener em tempo real, usa eles
  if (!forceRefresh && _kanbanContractsCache.length > 0 && _kanbanListenerActive) {
    console.log(` [Listener] Usando ${_kanbanContractsCache.length} contratos do listener em tempo real`);
    let contracts = _kanbanContractsCache;
    
    if (appState.userPermissions) {
      contracts = userPermissionService.filterContracts(contracts, appState.userPermissions);
    }
    
    // Popula appState.allContracts mesmo quando usando listener
    appState.allContracts = contracts;
    _cachedContractsTimestamp = now;
    finalizeContractsLoad(contracts, { fromCache: true, source: 'listener' });

    return contracts;
  }
  
  // PRIORIDADE 2: Se já temos contratos em memória e não expirou, retorna do cache
  if (!forceRefresh && 
      appState.allContracts && 
      appState.allContracts.length > 0 && 
      (now - _cachedContractsTimestamp) < CONTRACTS_MEMORY_CACHE_TTL) {
    console.log(` [Cache] Usando ${appState.allContracts.length} contratos do cache em memória (${Math.round((now - _cachedContractsTimestamp)/1000)}s)`);
    return appState.allContracts;
  }
  
  const statusFilter = Array.from(appState.selectedStatusState || []);
  const includeArchived = UI.DOMElements.includeArchivedCheckbox?.checked || false;

  // PRIORIDADE 3: Cache persistente (IndexedDB/local) antes de bater no Firestore.
  if (!forceRefresh && !includeArchived) {
    try {
      const persistedContracts = await cacheService.getCached('contracts_all_active', 'contractsAll');
      if (Array.isArray(persistedContracts) && persistedContracts.length > 0) {
        console.log(` [Cache] Usando ${persistedContracts.length} contratos do cache persistente`);

        // Mantém o mesmo comportamento do caminho via Firestore:
        // hidrata o conjunto completo de contratos ativos e aplica filtros depois.
        let contracts = persistedContracts;

        if (appState.userPermissions) {
          contracts = userPermissionService.filterContracts(contracts, appState.userPermissions);
        }

        _cachedContractsTimestamp = now;
        finalizeContractsLoad(contracts, { fromCache: true, source: 'persistent' });
        return contracts;
      }
    } catch (cacheError) {
      console.warn(' [Cache] Falha ao ler cache persistente de contratos:', cacheError);
    }
  }

  // PRIORIDADE 4: Busca do Firestore (com cache do cacheService)
  console.log(' [Firestore] Buscando contratos do servidor...');

  let contracts;
  if (includeArchived) {
    // Firestore-first: ativos + arquivados da coleção dedicada
    console.log(' [Arquivados] Filtro ligado — carregando ativos e archivedContracts');

    const [activeContracts, archivedIndex] = await Promise.all([
      firestore.getAllContracts({ statusFilter, includeArchived: false }),
      firestore.listArchivedContractsFromStorage({ limit: 200, forceRefresh })
        .catch((err) => {
          console.error(' Erro ao listar arquivados do Storage:', err);
          return { contracts: [] };
        })
    ]);

    const archivedContracts = (archivedIndex.contracts || []).map((c) => ({
      ...c,
      wasArchived: true,
      archivedFromCollection: true
    }));

    contracts = [...activeContracts, ...archivedContracts];
    console.log(` [Arquivados] Merge concluído: ativos=${activeContracts.length}, arquivados=${archivedContracts.length}`);
  } else {
    contracts = await firestore.getAllContracts({
      statusFilter,
      includeArchived: false
    });
  }
  
  if (appState.userPermissions) {
    // Usa o serviço de permissões para filtrar
    contracts = userPermissionService.filterContracts(contracts, appState.userPermissions);
  }
  
  // Atualiza cache em memória E popula appState.allContracts
  _cachedContractsTimestamp = now;
  finalizeContractsLoad(contracts, { source: 'firestore' });
  
  //  DEBUG: Verificar integridade dos dados carregados
  if (contracts.length > 0) {
    const hasFinanciamento = contracts.filter(c => c.financiamento).length;
    const hasDataAssinatura = contracts.filter(c => c.dataAssinaturaCliente).length;
    console.log('[getAllContractsFiltered]  Dados carregados:', {
      total: contracts.length,
      comFinanciamento: hasFinanciamento,
      comDataAssinatura: hasDataAssinatura,
      amostra: {
        id: contracts[0].id,
        status: contracts[0].status,
        financiamento: contracts[0].financiamento,
        dataAssinaturaCliente: contracts[0].dataAssinaturaCliente,
        entrada: contracts[0].entrada
      }
    });
  }
  
  console.log(` [getAllContractsFiltered] appState.allContracts populado: ${contracts.length} contratos`);

  return contracts;
}

/**
 * Carrega uma página de contratos com base no estado atual da aplicação.
 * OTIMIZAÇÃO 30/10/2025: Usa paginação real do Firestore em vez de getAllContracts()
 * @param {string} direction - 'next', 'prev', 'refresh' ou null.
 *        'refresh' força carregamento imediato sem cache
 */
async function loadContractsPage(requestOrDirection = null) {
  const request = normalizeLoadContractsRequest(requestOrDirection);
  const direction = request.direction;

  // Se forceRefresh, força carregamento imediato sem cache
  if (request.forceRefresh) {
    console.log(' [loadContractsPage] Modo REFRESH - ignorando cache e debounce');
    // Aguarda invalidação do cache (inclui limpeza do IndexedDB)
    await cacheService.invalidateByPattern(/^contracts/);
    // Zera também o timestamp do cache em memória
    _cachedContractsTimestamp = 0;
  }

  if (!request.silent && UI.DOMElements.contractList) {
    UI.DOMElements.contractList.innerHTML =
      '<tr><td colspan="6">A carregar dados...</td></tr>';
  }

  updateProcessosViewState({ silentRefreshPending: request.silent }, { syncDom: true });

  const searchState = getCurrentProcessosSearchState();
  const hasSearchTerm = searchState.hasSearchTerm;
  const selectedStatuses = Array.from(appState.selectedStatusState);
  const selectedVendors = Array.from(appState.selectedVendorState);
  const selectedEmpreendimentos = Array.from(appState.selectedEmpreendimentoState);
  const renderKanban = shouldRenderKanbanView();

  //  Comportamento consistente: se nenhum status estiver selecionado, não exibe itens
  if (selectedStatuses.length === 0) {
    console.log(' Nenhum status selecionado — lista ficará vazia');
    appState.filteredContracts = [];
    appState.totalContracts = 0;
    appState.contracts = [];

    if (renderKanban) {
      UI.renderKanbanBoard([], appState.selectedStatusState, appState.currentWorkflowType);
      if (window.BadgeService) {
        window.BadgeService.updateAllBadges([]);
      }
    } else {
      UI.renderContracts(
        [],
        appState.visibleColumns,
        handleViewUpdate,
        {
          currentSortKey: appState.currentSortKey,
          currentSortDirection: appState.currentSortDirection,
        }
      );
      UI.renderPaginationControls({
        currentPage: appState.currentPage,
        rowsPerPage: appState.rowsPerPage,
        totalContracts: 0,
        currentListSize: 0,
      });
    }
    captureProcessosViewStateFromLegacyState({ silentRefreshPending: false });
    return;
  }

  //  OTIMIZAÇÃO: Usa paginação real apenas no modo lista, quando não há busca por texto
  // e não há filtro de construtora. No Kanban sempre precisamos do conjunto completo
  // para montar colunas e contadores corretamente.
  const hasVendorFilter = selectedVendors.length > 0;
  
  // Verifica restrições reais de permissão (admins não devem cair no full-scan por padrão).
  const userRole = String(appState.userPermissions?.role || '').toLowerCase();
  const isAdminRole = userRole === 'admin' || userRole === 'super_admin';

  //  NOVO: Verifica se há preferência de workflow ativa (filtro de visualização)
  let activeWorkflowFilter = normalizeWorkflowIdValue(appState.currentWorkflowType);
  if (!activeWorkflowFilter) {
    try {
      const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
      if (prefs.defaultWorkflow) {
        activeWorkflowFilter = normalizeWorkflowIdValue(prefs.defaultWorkflow);
      }
    } catch (e) { console.warn(e); }
  }

  const allowedWorkflowsRaw = Array.isArray(appState.userPermissions?.allowedWorkflows)
    ? appState.userPermissions.allowedWorkflows
    : [];
  const normalizedAllowedWorkflows = allowedWorkflowsRaw
    .map((workflow) => normalizeWorkflowIdValue(workflow))
    .filter(Boolean);
  const hasWorkflowRestrictions = normalizedAllowedWorkflows.length > 0
    && activeWorkflowFilter
    && !normalizedAllowedWorkflows.includes(activeWorkflowFilter);
  const hasVendorRestrictions = Array.isArray(appState.userPermissions?.allowedVendors)
    && appState.userPermissions.allowedVendors.length > 0;
  const hasPermissionRestrictions = !isAdminRole
    && (hasWorkflowRestrictions || hasVendorRestrictions);
  
  //  DEBUG: Log do filtro de workflow ativo
  console.log(` loadContractsPage: appState.currentWorkflowType="${appState.currentWorkflowType}", activeWorkflowFilter="${activeWorkflowFilter}"`);

  // Em geral, workflow exige filtro em memória.
  // Exceção: workflow legado padrão ("associativo"), onde aceitamos paginação
  // e refinamos no cliente apenas os itens da página para evitar full-scan.
  const hasWorkflowFilter = !!activeWorkflowFilter;
  const workflowRequiresFullScan =
    hasWorkflowFilter && activeWorkflowFilter !== LEGACY_WORKFLOW_FALLBACK;

  if (!renderKanban && !hasSearchTerm && !hasVendorFilter && !hasPermissionRestrictions && !workflowRequiresFullScan) {
    try {
      console.log(' Usando paginação otimizada do Firestore');
      
      const options = {
        limit: appState.rowsPerPage,
        page: appState.currentPage,
        sortKey: appState.currentSortKey,
        sortDirection: appState.currentSortDirection,
        statusFilter: selectedStatuses,
        cursor: direction === 'next' ? appState.lastVisible : 
                direction === 'prev' ? appState.firstVisible : null,
        direction: direction || 'next'
      };
      
      const result = await firestore.getContractsPage(options);
      
      // Atualiza estado com resultados paginados
      _processosLoadSourceMode = 'paged';
      appState.filteredContracts = result.contracts;
      // Preserva o total anterior se o resultado não tiver total (fallback de segurança)
      if (result.totalCount && result.totalCount > 0) {
        appState.totalContracts = result.totalCount;
      } else if (appState.totalContracts === 0) {
        // Se não temos total ainda, usa o tamanho dos contratos como fallback
        appState.totalContracts = result.contracts.length;
      }
      appState.firstVisible = result.firstVisible;
      appState.lastVisible = result.lastVisible;
      appState.contracts = result.contracts;

      if (appState.totalContracts > 0 && result.contracts.length === 0 && appState.currentPage > 1) {
        appState.currentPage = Math.max(1, appState.currentPage - 1);
        appState.firstVisible = null;
        appState.lastVisible = null;
        appState.pageSnapshots = [null];
        captureProcessosViewStateFromLegacyState({ silentRefreshPending: request.silent }, { syncDom: false });
        await loadContractsPage({
          silent: true,
          source: `${request.source}:page-clamp`
        });
        return;
      }
      
      // Não renderiza Kanban/lista pesada fora da view Kanban; apenas prepara dados para quando abrir
      stopKanbanRealtimeListener();

      // Aplica filtros no modo lista.
      // Quando o workflow padrão está ativo, filtra apenas os itens da página
      // para evitar fallback de full-scan.
      const filteredForList = result.contracts.filter((c) => {
        const workflowMatch = !hasWorkflowFilter ||
          doesContractMatchWorkflowFilter(c, activeWorkflowFilter);
        const vendorMatch = selectedVendors.length === 0 ||
          selectedVendors.includes((c.vendedorConstrutora || '').trim());
        const empreendimentoMatch = selectedEmpreendimentos.length === 0 ||
          selectedEmpreendimentos.includes((c.empreendimento || '').trim());
        return workflowMatch && vendorMatch && empreendimentoMatch;
      });

      appState.filteredContracts = filteredForList;

      // Renderiza lista de contratos com a função correta
      UI.renderContracts(
        filteredForList,
        appState.visibleColumns,
        handleViewUpdate,
        {
          currentSortKey: appState.currentSortKey,
          currentSortDirection: appState.currentSortDirection,
        }
      );

      // Renderiza controles de paginação
      UI.renderPaginationControls({
        currentPage: appState.currentPage,
        rowsPerPage: appState.rowsPerPage,
        totalContracts: appState.totalContracts,
        currentListSize: filteredForList.length,
      });
      captureProcessosViewStateFromLegacyState({ silentRefreshPending: false });
      
      // Informações de paginação já estão no estado (appState.totalContracts, etc.)
      return; // Retorna cedo - otimização aplicada com sucesso
      
    } catch (error) {
      console.warn(' Fallback para método original:', error);
      // Continua para método antigo em caso de erro
    }
  }

  // FALLBACK: Método original para busca por texto, filtro de workflow ou erro na paginação
  // O getAllContractsFiltered agora usa cache em memória de 1 minuto para evitar múltiplas chamadas
  const reason = renderKanban ? 'kanban requer dataset completo' :
                 hasSearchTerm ? 'busca por texto' :
                 hasVendorFilter ? 'filtro de construtora' : 
                 workflowRequiresFullScan ? 'filtro de workflow (requer inferência completa)' :
                 hasPermissionRestrictions ? 'restrições de permissão' : 'fallback';
  console.log(` Usando método completo (${reason})`);
  _processosLoadSourceMode = 'full';
  
  // getAllContractsFiltered() já popula appState.allContracts internamente
  const allContracts = await getAllContractsFiltered();

  // Obtém os vendedores e empreendimentos selecionados (fallback)
  const selectedVendorsFallback = Array.from(appState.selectedVendorState);
  const selectedEmpreendimentosFallback = Array.from(appState.selectedEmpreendimentoState);

  const normalizeValue = (value = '') => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let filteredAndSortedContracts = allContracts.filter((c) => {
    // Filtro de Workflow (Preferência do Usuário)
    const workflowMatch = doesContractMatchWorkflowFilter(c, activeWorkflowFilter);

    // Filtro de status - Se nenhum status selecionado, não mostra nada
    const statusMatch =
      selectedStatuses.length > 0 && selectedStatuses.includes(c.status);

    // Filtro de vendedor/construtora
    const vendorMatch =
      selectedVendorsFallback.length === 0 || // Se nenhum selecionado, mostra todos
      selectedVendorsFallback.includes((c.vendedorConstrutora || '').trim());

    // Filtro de empreendimento
    const empreendimentoMatch =
      selectedEmpreendimentosFallback.length === 0 || // Se nenhum selecionado, mostra todos
      selectedEmpreendimentosFallback.includes((c.empreendimento || '').trim());

    // Busca por termo
    const searchMatch = !hasSearchTerm || (
      (searchState.hasTextSearch && (
        (c.clientePrincipal && normalizeValue(c.clientePrincipal).includes(searchState.normalizedSearchTerm)) ||
        (c.empreendimento && normalizeValue(c.empreendimento).includes(searchState.normalizedSearchTerm)) ||
        (c.vendedorConstrutora && normalizeValue(c.vendedorConstrutora).includes(searchState.normalizedSearchTerm)) ||
        (c.nContratoCEF && normalizeValue(c.nContratoCEF).includes(searchState.normalizedSearchTerm)) ||
        (c.protocoloRi && normalizeValue(c.protocoloRi).includes(searchState.normalizedSearchTerm)) ||
        (c.compradores && c.compradores.some(comprador => comprador.nome && normalizeValue(comprador.nome).includes(searchState.normalizedSearchTerm)))
      )) ||
      (searchState.hasNumericSearch && (
        (c.nContratoCEF && c.nContratoCEF.replace(/\D/g, '').includes(searchState.numericSearchTerm)) ||
        (c.protocoloRi && c.protocoloRi.replace(/\D/g, '').includes(searchState.numericSearchTerm)) ||
        (c.compradores && c.compradores.some(comprador => comprador.cpf && comprador.cpf.replace(/\D/g, '').includes(searchState.numericSearchTerm)))
      ))
    );

    return statusMatch && vendorMatch && empreendimentoMatch && searchMatch && workflowMatch;
  });

  // Ordenação
  filteredAndSortedContracts.sort((a, b) => {
    let aValue = a[appState.currentSortKey];
    let bValue = b[appState.currentSortKey];

    // 1. Tratar valores nulos ou indefinidos primeiro
    const aIsEmpty = aValue === undefined || aValue === null || aValue === "";
    const bIsEmpty = bValue === undefined || bValue === null || bValue === "";

    if (aIsEmpty && bIsEmpty) return 0;
    if (aIsEmpty) return 1; // Coloca a no final
    if (bIsEmpty) return -1; // Coloca b no final

    // 2. Lógica de ordenação por tipo de dado
    let comparison = 0;

    // Converter para o tipo certo para comparação
    const isDate = aValue.toDate || aValue instanceof Date;
    const isNumeric = typeof aValue === "number" || !isNaN(Number(aValue));

    if (isDate) {
      // Converte para timestamp para comparação numérica
      aValue = aValue.toDate ? aValue.toDate().getTime() : aValue.getTime();
      bValue = bValue.toDate ? bValue.toDate().getTime() : bValue.getTime();
    } else if (isNumeric) {
      // Converte para número para comparação numérica
      aValue = Number(aValue);
      bValue = Number(bValue);
    } else {
      // Padrão para string, garantindo que seja case-insensitive
      aValue = String(aValue).toLowerCase();
      bValue = String(bValue).toLowerCase();
    }

    // 3. Realizar a comparação final
    if (aValue < bValue) {
      comparison = -1;
    } else if (aValue > bValue) {
      comparison = 1;
    }

    return appState.currentSortDirection === "desc" ? -comparison : comparison;
  });

  appState.filteredContracts = filteredAndSortedContracts;
  appState.totalContracts = filteredAndSortedContracts.length;
  clampProcessosCurrentPage(filteredAndSortedContracts.length);

  // Aplica a paginação
  const startIndex = (appState.currentPage - 1) * appState.rowsPerPage;
  const endIndex = startIndex + appState.rowsPerPage;
  const contractsToRender = appState.filteredContracts.slice(
    startIndex,
    endIndex
  );

  appState.contracts = contractsToRender;

  // Verifica qual visualização deve ser renderizada
  const currentView = getCurrentView();
  console.log(" loadContractsPage - Visualização atual:", currentView, "| Kanban ativo:", renderKanban);
  
  if (renderKanban) {
    //  Inicia listener em tempo real se ainda não está ativo
    initKanbanRealtimeListener();
    
    // Para kanban, usa todos os contratos filtrados (sem paginação)
    console.log(" Renderizando Kanban com", appState.filteredContracts.length, "contratos");
    UI.renderKanbanBoard(appState.filteredContracts, appState.selectedStatusState, appState.currentWorkflowType);
    
    // Atualizar badges
    if (window.BadgeService) {
      window.BadgeService.updateAllBadges(appState.filteredContracts);
    }
  } else {
    //  OTIMIZAÇÃO: Desativa listener quando sai do Kanban para economizar leituras
    if (_kanbanListenerActive) {
      console.log(' [Otimização] Parando listener do Kanban (página não-kanban ativa)...');
      stopKanbanRealtimeListener();
    }

    // Para lista, usa contratos paginados
    console.log(" Renderizando Lista com", appState.contracts.length, "contratos");
    UI.renderContracts(
      appState.contracts,
      appState.visibleColumns,
      handleViewUpdate,
      {
        currentSortKey: appState.currentSortKey,
        currentSortDirection: appState.currentSortDirection,
      }
    );
    
    // Só renderiza paginação no modo lista
    UI.renderPaginationControls({
      currentPage: appState.currentPage,
      rowsPerPage: appState.rowsPerPage,
      totalContracts: appState.totalContracts,
      currentListSize: appState.contracts.length,
    });
  }

  captureProcessosViewStateFromLegacyState({ silentRefreshPending: false });
}

/**
 * Carrega a seleção de status do localStorage.
 * @returns {Set<string>} O Set com os status salvos ou o padrão.
 */
function getDefaultStatusSelection(statusList = (window.EFFECTIVE_STATUS_CONFIG && window.EFFECTIVE_STATUS_CONFIG.length ? window.EFFECTIVE_STATUS_CONFIG : STATUS_CONFIG)) {
  const normalizedList = Array.isArray(statusList) ? statusList : [];
  const nonArchived = normalizedList
    .filter((status) => status && status.archiveContracts !== true)
    .map((status) => status.text);

  if (nonArchived.length > 0) {
    return new Set(nonArchived);
  }

  return new Set(normalizedList.map((status) => status.text));
}

function loadStatusFilterState(defaultSet = getDefaultStatusSelection()) {
  try {
    const savedState = localStorage.getItem("statusFilterState");
    if (savedState) {
      // Converte a string JSON de volta para um Set
      const statusArray = JSON.parse(savedState);
      
      //  FIX: Se o array salvo está vazio, retorna o padrão (todos selecionados)
      // Isso evita que o usuário veja uma lista vazia ao acessar a página de Processos
      if (!statusArray || statusArray.length === 0) {
        console.log(' Estado de filtro vazio no localStorage, usando padrão (todos selecionados)');
        return new Set(defaultSet);
      }
      
      // Valida se pelo menos alguns dos status salvos existem no sistema atual
      const validStatuses = statusArray.filter(s => 
        Array.from(defaultSet).includes(s)
      );
      
      // Se nenhum status salvo é válido, retorna o padrão
      if (validStatuses.length === 0) {
        console.log(' Nenhum status salvo é válido no sistema atual, usando padrão');
        return new Set(defaultSet);
      }
      
      //  FIX: Se há MUITO MAIS status disponíveis do que salvos (ex: 47 disponíveis vs 5 salvos),
      // significa que o sistema foi expandido e devemos usar TODOS os status por padrão
      // Isso evita que usuários vejam apenas status antigos após migração de dados
      const availableCount = defaultSet.size;
      const savedCount = validStatuses.length;
      const newStatusesFound = availableCount - savedCount;
      
      // Se há mais de 5 novos status que não estavam salvos, seleciona todos por padrão
      if (newStatusesFound > 5) {
        console.log(` ${newStatusesFound} novos status encontrados no sistema (${availableCount} total vs ${savedCount} salvos), selecionando todos por padrão`);
        // Limpa o localStorage antigo para forçar recalculação
        localStorage.removeItem("statusFilterState");
        return new Set(defaultSet);
      }
      
      return new Set(validStatuses);
    }
  } catch (e) {
    console.error("Erro ao carregar o estado do filtro do localStorage:", e);
  }
  // Retorna o estado padrão se não houver nada salvo
  return new Set(defaultSet);
}

/**
 * Salva a seleção de status atual no localStorage.
 */
function saveStatusFilterState() {
  try {
    // Converte o Set para um Array e depois para uma string JSON
    const statusArray = Array.from(appState.selectedStatusState);
    localStorage.setItem("statusFilterState", JSON.stringify(statusArray));
  } catch (e) {
    console.error("Erro ao salvar o estado do filtro no localStorage:", e);
  }
}

/**
 * Lida com pedidos de atualização da view (chamado pelos event listeners).
 */
function handleViewUpdate(changes = {}) {
  const hasSortChange = Boolean(changes.sortKey);
  const nextPatch = {
    view: getCurrentView(),
    selectedStatuses: appState.selectedStatusState,
    selectedVendors: appState.selectedVendorState,
    selectedEmpreendimentos: appState.selectedEmpreendimentoState,
    workflowType: appState.currentWorkflowType,
    includeArchived: UI.DOMElements.includeArchivedCheckbox?.checked || false,
    pagination: {
      currentPage: appState.currentPage,
      rowsPerPage: appState.rowsPerPage,
      totalContracts: appState.totalContracts,
      firstVisible: appState.firstVisible,
      lastVisible: appState.lastVisible,
      pageSnapshots: appState.pageSnapshots
    }
  };

  // Se a chave de ordenação mudou, atualiza o estado
  if (hasSortChange) {
    const isSameSortKey = appState.currentSortKey === changes.sortKey;
    const explicitDirection =
      changes.direction === "asc" || changes.direction === "desc"
        ? changes.direction
        : null;

    if (isSameSortKey) {
      // Se houver direção explícita, respeita. Caso contrário, inverte.
      appState.currentSortDirection =
        explicitDirection ||
        (appState.currentSortDirection === "asc" ? "desc" : "asc");
    } else {
      // Se for uma nova coluna, define chave e direção inicial.
      appState.currentSortKey = changes.sortKey;
      appState.currentSortDirection = explicitDirection || "asc";
    }

    nextPatch.sort = {
      key: appState.currentSortKey,
      direction: appState.currentSortDirection
    };
  }

  if (changes.searchTerm) {
    nextPatch.appliedSearchTerm = appState.processosViewState?.draftSearchTerm || '';
  }

  // Se a busca, paginação ou filtros mudaram, reseta a página atual
  if (
    hasSortChange ||
    changes.searchTerm ||
    changes.rowsPerPage ||
    changes.statusFilterChange ||
    changes.vendorFilterChange ||
    changes.empreendimentoFilterChange ||
    changes.includeArchivedChange
  ) {
    appState.currentPage = 1;
    appState.firstVisible = null;
    appState.lastVisible = null;
    appState.pageSnapshots = [null];
    nextPatch.pagination = {
      ...nextPatch.pagination,
      currentPage: 1,
      firstVisible: null,
      lastVisible: null,
      pageSnapshots: [null]
    };
  } else {
    nextPatch.pagination = {
      ...nextPatch.pagination,
      currentPage: appState.currentPage,
      rowsPerPage: appState.rowsPerPage,
      totalContracts: appState.totalContracts,
      firstVisible: appState.firstVisible,
      lastVisible: appState.lastVisible,
      pageSnapshots: appState.pageSnapshots
    };
  }

  updateProcessosViewState(nextPatch);

  // REMOVIDO: renderKanban() direto aqui causava dupla renderização
  // O loadContractsPage() já chama renderKanbanBoard quando necessário

  // Sempre carrega a página de contratos com o estado atualizado (debounced)
  scheduleLoadContractsPage({
    silent: changes.silent === true,
    forceRefresh: changes.forceRefresh === true,
    source: changes.source || 'handleViewUpdate'
  });

  // Atualiza os indicadores de ordenação na UI
  updateSortableHeaders();
}

// Debounce para agrupar múltiplas mudanças rápidas na UI
let _loadContractsScheduled = false;
let _loadContractsTimeout = null;
let _pendingLoadContractsRequest = null;
function scheduleLoadContractsPage(requestOrDirection = null){
  const nextRequest = normalizeLoadContractsRequest(requestOrDirection);
  _pendingLoadContractsRequest = {
    ...(_pendingLoadContractsRequest || {}),
    ...nextRequest,
    forceRefresh: Boolean((_pendingLoadContractsRequest?.forceRefresh) || nextRequest.forceRefresh),
    silent: Boolean((_pendingLoadContractsRequest?.silent) || nextRequest.silent)
  };

  if (_loadContractsScheduled) return;
  _loadContractsScheduled = true;
  
  // Cancela timeout anterior se existir
  if (_loadContractsTimeout) {
    clearTimeout(_loadContractsTimeout);
  }
  
  _loadContractsTimeout = setTimeout(()=>{
    _loadContractsScheduled = false;
    _loadContractsTimeout = null;
    const pendingRequest = _pendingLoadContractsRequest || null;
    _pendingLoadContractsRequest = null;
    renderProcessosFromState(pendingRequest).catch((error) => {
      console.error('[ProcessosState] Erro ao renderizar página de processos:', error);
    });
  }, 150); // 150ms: mais tempo para agrupar múltiplos cliques de filtro
}

// Debounce para renderização do Kanban (evita múltiplas renderizações)
let _kanbanRenderScheduled = false;
let _kanbanRenderTimeout = null;
function scheduleKanbanRender() {
  if (_kanbanRenderScheduled) return;
  _kanbanRenderScheduled = true;
  
  if (_kanbanRenderTimeout) {
    clearTimeout(_kanbanRenderTimeout);
  }
  
  _kanbanRenderTimeout = setTimeout(() => {
    _kanbanRenderScheduled = false;
    _kanbanRenderTimeout = null;
    renderKanbanInternal();
  }, 200); // 200ms de debounce para Kanban
}

function renderKanbanInternal() {
  const contractsToShow = getFilteredAndSortedContractsForCurrentProcessosState(appState.allContracts);
  appState.filteredContracts = contractsToShow;
  appState.totalContracts = contractsToShow.length;
  appState.contracts = contractsToShow;
  UI.renderKanbanBoard(contractsToShow, appState.selectedStatusState, appState.currentWorkflowType);
  captureProcessosViewStateFromLegacyState({ silentRefreshPending: false });
}

// Função pública para compatibilidade (usa debounce) - Desabilitada (não utilizada)
// function renderKanban() {
//   scheduleKanbanRender();
// }

/**
 * Atualiza os indicadores visuais de ordenação no cabeçalho da tabela.
 */
function updateSortableHeaders() {
  document.querySelectorAll(".sortable").forEach((th) => {
    th.classList.remove("asc", "desc");
    if (th.dataset.sortKey === appState.currentSortKey) {
      th.classList.add(appState.currentSortDirection);
    }
  });
}

// --- Ponto de Partida da Aplicação ---
async function redirectIfPasswordRotationRequired() {
  try {
    const cachedRaw = sessionStorage.getItem(PASSWORD_POLICY_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached?.timestamp && (Date.now() - cached.timestamp) < PASSWORD_POLICY_CACHE_TTL_MS) {
        if (cached.data?.mustChangePassword === true) {
          console.warn('Política de senha: troca obrigatória pendente (cache da sessão). Redirecionando para perfil.');
          window.location.href = 'profile.html?forcePasswordRotation=1';
          return true;
        }
        return false;
      }
    }
  } catch {
    // Ignora cache inválido e segue para a verificação remota.
  }

  try {
    const policyState = await firestore.getPasswordPolicyState();
    try {
      sessionStorage.setItem(PASSWORD_POLICY_CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: policyState || null
      }));
    } catch {
      // Cache best-effort.
    }
    if (policyState?.mustChangePassword === true) {
      console.warn('Política de senha: troca obrigatória pendente. Redirecionando para perfil.');
      window.location.href = 'profile.html?forcePasswordRotation=1';
      return true;
    }
  } catch (error) {
    console.warn('Não foi possível verificar política de senha. Seguindo inicialização:', error);
  }
  return false;
}

function clearProcessosRuntimeState() {
  stopKanbanRealtimeListener();
  listenerOptimizer.destroy();

  if (typeof window.__realtimeSyncUnsubscribe === 'function') {
    try {
      window.__realtimeSyncUnsubscribe();
    } catch (error) {
      console.warn('[ProcessosPage] Falha ao encerrar realtime sync:', error);
    }
    window.__realtimeSyncUnsubscribe = null;
    window.__realtimeSyncInitialized = false;
  }

  if (_loadContractsTimeout) {
    clearTimeout(_loadContractsTimeout);
    _loadContractsTimeout = null;
  }
  if (_kanbanRenderTimeout) {
    clearTimeout(_kanbanRenderTimeout);
    _kanbanRenderTimeout = null;
  }

  _loadContractsScheduled = false;
  _pendingLoadContractsRequest = null;
  _kanbanRenderScheduled = false;
  _kanbanListenerActive = false;
  _kanbanContractsCache = [];
  _cachedContractsTimestamp = 0;
  _processosLoadSourceMode = 'full';
  contractsPreloadPromise = null;

  appState.allContracts = [];
  appState.filteredContracts = [];
  appState.contracts = [];
  appState.totalContracts = 0;
  appState.currentPage = 1;
  appState.firstVisible = null;
  appState.lastVisible = null;
  appState.pageSnapshots = [null];
  appState.processosViewState = createDefaultProcessosViewState();
  appState.currentView = appState.processosViewState.view;
}

export async function initializeProcessosPage({ user, isAdmin } = {}) {
  if (!user) {
    throw new Error("Usuario autenticado obrigatorio para inicializar Processos.");
  }

  await initializeApp(user, isAdmin, {
    initialPage: 'processos',
    processosEnabled: true
  });
}

export async function refreshProcessosPage() {
  if (!hasProcessosShell()) return;
  await renderProcessosFromState({
    forceRefresh: true,
    silent: true,
    source: 'refreshProcessosPage'
  });
}

export async function disposeProcessosPage(reason = 'manual') {
  console.log(`[ProcessosPage] Liberando recursos (${reason})`);
  clearProcessosRuntimeState();
}

function bindMainAuthState() {
  auth.onAuthStateChanged(async (user) => {
  if (user) {
    window.currentUserAuth = user;
    window.getCurrentUserAuth = async () => auth.currentUser || window.currentUserAuth || null;
    window.dispatchEvent(new CustomEvent('auth-state-changed', { detail: { user } }));

    if (APP_INIT_STATE.completedUid === user.uid) {
      if (window.__DEBUG__) {
        console.log(' Inicialização já concluída para este usuário, ignorando callback duplicado do Auth');
      }
      return;
    }

    if (APP_INIT_STATE.activeUid === user.uid && APP_INIT_STATE.promise) {
      if (window.__DEBUG__) {
        console.log(' Inicialização já em andamento para este usuário, aguardando...');
      }
      await APP_INIT_STATE.promise;
      return;
    }

    APP_INIT_STATE.activeUid = user.uid;
    APP_INIT_STATE.promise = (async () => {
      // Carrega flags de sistema para rollout gradual de otimizações.
      if (typeof firestore.getSystemFlags === 'function') {
        firestore.getSystemFlags().catch((err) => {
          console.warn('[main] Não foi possível carregar system flags:', err);
        });
      }

      // Inicializa o serviço de métricas de leituras Firestore
      if (window.readMetricsService) {
        window.readMetricsService.init(user.uid).catch(err => {
          console.warn('[ReadMetrics] Erro ao inicializar:', err);
        });
      }

      // Inicia medição de performance
      performanceMonitor.startMeasure('app-initialization');

      try {
        const mustRotatePassword = await redirectIfPasswordRotationRequired();
        if (mustRotatePassword) {
          return;
        }

        const idTokenResult = await user.getIdTokenResult();
        const isAdmin = idTokenResult.claims.admin === true;
        await initializeApp(user, isAdmin);

        if (typeof window.__SEED_VENDORS_RUN__ === 'function') {
          try {
            await window.__SEED_VENDORS_RUN__();
          } catch (seedError) {
            console.warn('[seedVendors] Execução pós-auth falhou:', seedError);
          }
        }

        APP_INIT_STATE.completedUid = user.uid;
      } catch (error) {
        console.error('Erro ao obter token do usuário:', error);
      } finally {
        performanceMonitor.endMeasure('app-initialization');
      }
    })();

    try {
      await APP_INIT_STATE.promise;
    } finally {
      APP_INIT_STATE.promise = null;
    }
  } else {
    APP_INIT_STATE.activeUid = null;
    APP_INIT_STATE.promise = null;
    APP_INIT_STATE.completedUid = null;
    nonCriticalResourcesBound = false;
    lastDashboardInitAt = 0;
    window.currentUserAuth = null;
    window.getCurrentUserAuth = async () => null;
    window.dispatchEvent(new CustomEvent('auth-state-changed', { detail: { user: null } }));
    console.log("Nenhum utilizador autenticado. A redirecionar...");
    redirectToLogin();
  }
  });
}

if (window.__DISABLE_MAIN_AUTO_BOOTSTRAP__ !== true) {
  bindMainAuthState();
}

// Inicializa otimizações de performance
document.addEventListener('DOMContentLoaded', () => {
    try {
        initializePerformanceOptimizations();
        performanceMonitor.observePageLoad();
    } catch (error) {
        console.warn('Erro ao inicializar otimizações de performance:', error);
    }
    
    // Inicializa validações de formulário com tratamento de erro
    try {
        initializeAllValidations();
    } catch (error) {
        console.warn('Erro ao inicializar validações:', error);
    }
});

/**
 * Cria notificação de boas-vindas se for o primeiro login do dia
 */
async function createWelcomeNotificationIfNeeded(user) {
    try {
        const today = new Date().toDateString();
        const lastWelcome = localStorage.getItem('lastWelcomeNotification');
        
        if (lastWelcome !== today) {
            const userName = typeof formatTopbarDisplayName === 'function' ? formatTopbarDisplayName(user, appState.currentUserProfile) : (user.displayName || user.email.split('@')[0]);
            
            // Verificar se o serviço está disponível e tem o método correto
            if (notificationService && typeof notificationService.createNotification === 'function') {
                await notificationService.createNotification({
                    title: 'Bem-vindo de volta!',
                    message: `Olá ${userName}, você tem acesso ao Gestor de Processos.`,
                    priority: 'low',
                    data: { type: 'welcome', timestamp: new Date() }
                });
            } else {
                console.log('Serviço de notificações não disponível para notificação de boas-vindas');
            }
            
            localStorage.setItem('lastWelcomeNotification', today);
        }
    } catch (error) {
        console.error('Erro ao criar notificação de boas-vindas:', error);
    }
}

/**
 *  DIAGNÓSTICO: Monitora estado dos listeners e cache
 * Use no console: window.diagnosticListenersStatus()
 */
window.diagnosticListenersStatus = function() {
    console.log('DIAGNÓSTICO DE LISTENERS E CACHE', 'color: #2196F3; font-weight: bold; font-size: 14px');
    console.log('═════════════════════════════════════════════════════');
    
    // Estado dos listeners
    console.log('\n LISTENERS:');
    console.log(`  Kanban Listener Ativo: ${_kanbanListenerActive ? ' SIM' : ' NÃƒO'}`);
    console.log(`  Contratos em cache: ${_kanbanContractsCache.length}`);
    console.log(`  Cache timestamp: ${_cachedContractsTimestamp ? new Date(_cachedContractsTimestamp).toLocaleTimeString() : 'N/A'}`);
    
    // Estado do cache
    console.log('\n CACHE:');
    const cacheData = window.__CACHE_DEBUG__ || {};
    const hitRate = cacheData.hits + cacheData.misses > 0 
        ? ((cacheData.hits / (cacheData.hits + cacheData.misses)) * 100).toFixed(1) 
        : '0';
    console.log(`  Hit Rate: ${hitRate}%`);
    console.log(`  Hits: ${cacheData.hits || 0}`);
    console.log(`  Misses: ${cacheData.misses || 0}`);
    
    // Página ativa
    console.log('\n PÁGINA ATIVA:');
    const currentView = getCurrentView();
    console.log(`  View: ${currentView}`);
    console.log(`  Esperado listener: ${currentView === 'kanban' ? 'SIM' : 'NÃO'}`);
    console.log(`  Listener rodando: ${_kanbanListenerActive ? 'SIM' : 'NÃO'}`);
    
    if (_kanbanListenerActive !== (currentView === 'kanban')) {
        console.warn('\n DESALINHAMENTO: Listener status não corresponde à página ativa!');
    }
    
    console.log('═════════════════════════════════════════════════════');
};

/**
 *  OTIMIZAÇÃO: Reiniciar listeners (útil para debug)
 */
window.restartListeners = function() {
    console.log(' Reiniciando listeners...');
    stopKanbanRealtimeListener();
    setTimeout(() => {
        if (getCurrentView() === 'kanban') {
            initKanbanRealtimeListener();
            console.log(' Listeners reiniciados');
        }
    }, 500);
};

/**
 *  OTIMIZAÇÃO: Pré-carrega contratos no cache IndexedDB em background
 * Garante que no próximo F5 os dados já estão disponíveis offline
 */
async function preloadContractsToCache(options = {}) {
  const { reason = 'manual' } = options;
  console.log(` [Preload] Iniciando pré-carregamento de contratos... motivo=${reason}`);
  
  try {
    // Usa getAllContractsFiltered que já tem cache integrado
    // Isso populará o IndexedDB em background
    const contracts = await getAllContractsFiltered();
    console.log(` [Preload] ${contracts.length} contratos pré-carregados no cache`);
    
    // Marca timestamp do último preload
    localStorage.setItem('lastContractsPreload', Date.now());
    
    // Atualiza métrica de cache
    if (window.__CACHE_DEBUG__) {
      window.__CACHE_DEBUG__.lastPreload = new Date().toISOString();
      window.__CACHE_DEBUG__.preloadCount = contracts.length;
    }

    window.dispatchEvent(new CustomEvent('contracts:full-cache-ready', {
      detail: {
        count: contracts.length,
        source: 'preloadContractsToCache',
        reason
      }
    }));
    
    return contracts;
  } catch (error) {
    console.error(' [Preload] Erro ao pré-carregar contratos:', error);
    return [];
  }
}

// Exporta para uso externo
window.preloadContractsToCache = preloadContractsToCache;

async function ensureContractsCachePreload(options = {}) {
  const { force = false, reason = 'ensure' } = options;

  if (!force && Array.isArray(appState.allContracts) && appState.allContracts.length > 0) {
    return appState.allContracts;
  }

  if (contractsPreloadPromise) {
    return contractsPreloadPromise;
  }

  contractsPreloadPromise = preloadContractsToCache({ reason })
    .finally(() => {
      contractsPreloadPromise = null;
    });

  return contractsPreloadPromise;
}

window.ensureContractsCachePreload = ensureContractsCachePreload;

function scheduleContractsCachePreload() {
  const runPreload = () => {
    ensureContractsCachePreload({ reason: 'scheduled-idle' }).catch(err => {
      console.warn('[Preload] Erro ao pré-carregar contratos:', err);
    });
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => {
      runPreload();
    }, { timeout: 4000 });
    return;
  }

  setTimeout(() => {
    runPreload();
  }, 2000);
}

window.scheduleContractsCachePreload = scheduleContractsCachePreload;

/**
 *  DIAGNÓSTICO: Exibe estatísticas detalhadas de cache
 */
window.diagnosticCacheStats = async function() {
  console.log('═════════════════════════════════════════════════════');
  console.log(' DIAGNÓSTICO DE CACHE');
  console.log('═════════════════════════════════════════════════════\n');
  
  // Stats do cacheService
  if (window.cacheService) {
    const stats = await window.cacheService.getStats();
    
    console.log(' CACHE EM MEMÓRIA:');
    console.log(`  Status: ${stats.enabled ? ' Ativo' : ' Desativado'}`);
    console.log(`  Itens em cache: ${stats.size}`);
    console.log(`  Tamanho total: ${stats.totalSize}`);
    console.log(`  Hit Rate: ${stats.hitRate}`);
    console.log(`  Hits: ${stats.hitCount}`);
    console.log(`  Misses: ${stats.missCount}`);
    console.log(`  Eficiência: ${stats.efficiency.percentage}`);
    console.log(`  Leituras economizadas: ${stats.efficiency.savedReads}`);
    
    console.log('\n INDEXEDDB:');
    console.log(`  Status: ${stats.indexedDB.ready ? ' Conectado' : ' Não disponível'}`);
    console.log(`  Itens persistidos: ${stats.indexedDB.count}`);
    
    if (Object.keys(stats.typeStats).length > 0) {
      console.log('\n POR TIPO DE DADO:');
      for (const [type, data] of Object.entries(stats.typeStats)) {
        console.log(`  ${type}: ${data.count} itens (${window.cacheService.formatBytes(data.size)})`);
      }
    }
  } else {
    console.warn(' cacheService não disponível');
  }
  
  // Último preload
  const lastPreload = localStorage.getItem('lastContractsPreload');
  if (lastPreload) {
    const age = Math.round((Date.now() - parseInt(lastPreload)) / 1000 / 60);
    console.log(`\n ÚLTIMO PRELOAD: há ${age} minutos`);
  }
  
  console.log('\n═════════════════════════════════════════════════════');
  console.log(' COMANDOS ÚTEIS:');
  console.log('  window.preloadContractsToCache() - Força preload');
  console.log('  window.cacheService.clear() - Limpa cache');
  console.log('  window.diagnosticListenersStatus() - Status dos listeners');
  console.log('═════════════════════════════════════════════════════');
};

// Gera relatório de performance após o carregamento
window.addEventListener('load', () => {
    setTimeout(() => {
        try {
            performanceMonitor.generateReport();
        } catch (error) {
            console.warn('Erro ao gerar relatório de performance:', error);
        }
    }, 2000);
});
