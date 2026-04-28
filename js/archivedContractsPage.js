import * as firestore from './firestoreService.js';
import cacheService from './cacheService.js';
import { activityLogService } from './activityLogService.js';
import { EXPORTABLE_FIELDS } from './config.js';

const state = {
  pageContracts: [], // Contratos exibidos na tela
  allArchivedContracts: [], // Todos os contratos carregados
  loading: false,
  initialized: false,
  searchTerm: '', // Termo de busca atual
  hasLoaded: false, // Carregado automaticamente ao entrar na pagina
  isAdmin: false,
  _loadingPromise: null, // Previne chamadas simultaneas
};

const elements = {
  page: document.getElementById('page-arquivados'),
  searchInput: document.getElementById('archived-search-input'),
  refreshBtn: document.getElementById('archived-refresh-btn'),
  exportBtn: document.getElementById('archived-export-btn'),
  pageInfo: document.getElementById('archived-page-info'),
  tableBody: document.getElementById('archived-contract-list'),
  emptyState: document.getElementById('archived-empty-state'),
};

const ARCHIVED_COLUMNS = [
  { key: 'clientePrincipal', label: 'Cliente' },
  { key: 'empreendimento', label: 'Empreendimento' },
  { key: 'status', label: 'Status' },
  { key: 'updatedAt', label: 'Atualizado' },
  { key: 'vendedorConstrutora', label: 'Origem' },
];

const ARCHIVED_FETCH_LIMIT = 500;
const ARCHIVED_EXPORT_COLUMNS = [
  ...EXPORTABLE_FIELDS,
  { key: 'archivedAt', label: 'Arquivado em', formatter: (c) => formatDateTime(c.archivedAt) },
  { key: 'archivedBy', label: 'Arquivado por' },
  { key: 'updatedAt', label: 'Atualizado em', formatter: (c) => formatDateTime(c.updatedAt) },
];
const DETAILS_MODAL_ENV = {
  promise: null,
  listenersInitialized: false,
  modules: null,
  modalAppState: null,
  usersCache: null,
  usersCacheIsAdmin: null,
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function formatDate(value) {
  if (!value) return '—';
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return "";
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const datePart = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} ${timePart}`;
}

function updateExportButtonState() {
  if (!elements.exportBtn) return;
  elements.exportBtn.disabled = state.loading || !state.hasLoaded || state.pageContracts.length === 0;
}

function setLoading(isLoading) {
  state.loading = isLoading;
  updateExportButtonState();
  if (!elements.tableBody) return;
  if (isLoading) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="${ARCHIVED_COLUMNS.length + 1}" class="text-center text-muted py-4">
          <div class="spinner-border spinner-border-sm me-2" role="status"></div>
          Carregando arquivados...
        </td>
      </tr>`;
  }
}

function renderManualRefreshPrompt() {
  if (!elements.tableBody) return;

  elements.tableBody.innerHTML = `
    <tr>
      <td colspan="${ARCHIVED_COLUMNS.length + 1}" class="text-center text-muted py-5">
        <i class="bi bi-arrow-repeat fs-1 d-block mb-3 text-secondary"></i>
        <p class="mb-1">Nenhum contrato carregado</p>
        <small class="text-muted">Clique em "Recarregar" para buscar os contratos arquivados.</small>
      </td>
    </tr>`;

  elements.emptyState?.classList.add("d-none");
  renderPagination();
  updateExportButtonState();
}

function renderPagination() {
  if (!elements.pageInfo) return;

  if (!state.hasLoaded) {
    elements.pageInfo.textContent = 'Clique em "Recarregar" para carregar';
    return;
  }

  const total = state.pageContracts.length;
  if (state.searchTerm) {
    elements.pageInfo.textContent = total > 0
      ? `${total} resultado(s)`
      : "Nenhum resultado encontrado";
    return;
  }

  elements.pageInfo.textContent = `${total} contrato(s)`;
}

function createDetailsModalAppState() {
  const sharedState = window.appState || {};
  sharedState.selectedStatusState = sharedState.selectedStatusState || new Set();
  sharedState.selectedChartStatusState = sharedState.selectedChartStatusState || new Set();
  sharedState.analysts = Array.isArray(sharedState.analysts) ? sharedState.analysts : [];
  sharedState.allUsers = Array.isArray(sharedState.allUsers) ? sharedState.allUsers : [];
  sharedState.currentUserProfile = sharedState.currentUserProfile || null;
  return sharedState;
}

async function ensureDetailsModalEnvironmentLoaded() {
  if (DETAILS_MODAL_ENV.promise) {
    return DETAILS_MODAL_ENV.promise;
  }

  DETAILS_MODAL_ENV.promise = (async () => {
    window.__AUTO_RENDER_UI_COMPONENTS__ = false;
    window.__DISABLE_MAIN_AUTO_BOOTSTRAP__ = true;
    window.__INITIAL_PAGE__ = "arquivados";

    const { DetailsModal } = await import("./modals/DetailsModal.js");
    DetailsModal.render();

    await Promise.all([
      import("./modalManager.js"),
      import("./inlineSuggestFields.js"),
      import("./vendorsInlineIntegration.js"),
      import("./seedVendors.js"),
      import("./pendenciasUI.js"),
      import("./errorManagementService.js"),
    ]);

    const [
      ui,
      eventListeners,
      controller,
      aiDetailsTabModule,
      agenciasServiceModule,
      agenciasUIModule,
    ] = await Promise.all([
      import("./ui.js"),
      import("./eventListeners.js"),
      import("./detailsModalController.js"),
      import("./aiDetailsTab.js"),
      import("./agenciasService.js"),
      import("./agenciasUI.js"),
    ]);

    DETAILS_MODAL_ENV.modalAppState = createDetailsModalAppState();
    DETAILS_MODAL_ENV.modalAppState.currentUserProfile =
      window.appState?.currentUserProfile || DETAILS_MODAL_ENV.modalAppState.currentUserProfile || null;

    ui.refreshDetailsModalDOMReferences();

    if (!DETAILS_MODAL_ENV.listenersInitialized) {
      eventListeners.initializeEventListeners(() => undefined, DETAILS_MODAL_ENV.modalAppState);
      DETAILS_MODAL_ENV.listenersInitialized = true;
    }

    try {
      const effectiveStatuses = await firestore.getEffectiveStatuses();
      if (Array.isArray(effectiveStatuses) && effectiveStatuses.length > 0) {
        window.EFFECTIVE_STATUS_CONFIG = effectiveStatuses;
      }
    } catch (error) {
      console.warn("[Arquivados] Falha ao carregar status dinamicos do details modal:", error);
    }

    try {
      await agenciasServiceModule.default.initializeDefaultAgencias();
      agenciasUIModule.default.init();
      await agenciasUIModule.default.populateAgenciaSelect();
    } catch (error) {
      console.warn("[Arquivados] Falha ao inicializar agencias para o details modal:", error);
    }

    try {
      aiDetailsTabModule.default?.init?.();
    } catch (error) {
      console.warn("[Arquivados] Falha ao inicializar aba de IA do details modal:", error);
    }

    DETAILS_MODAL_ENV.modules = {
      ui,
      eventListeners,
      controller,
    };

    return DETAILS_MODAL_ENV.modules;
  })();

  return DETAILS_MODAL_ENV.promise;
}

async function loadDetailsModalUsers() {
  const mustRefreshCache = DETAILS_MODAL_ENV.usersCacheIsAdmin !== state.isAdmin;
  if (!mustRefreshCache && DETAILS_MODAL_ENV.usersCache) {
    if (DETAILS_MODAL_ENV.modalAppState) {
      DETAILS_MODAL_ENV.modalAppState.analysts = DETAILS_MODAL_ENV.usersCache.analysts;
      DETAILS_MODAL_ENV.modalAppState.allUsers = DETAILS_MODAL_ENV.usersCache.allUsers;
    }
    return DETAILS_MODAL_ENV.usersCache;
  }

  const analysts = await firestore.getAnalysts().catch((error) => {
    console.warn("[Arquivados] Falha ao carregar analistas para o details modal:", error);
    return [];
  });

  const allUsers = state.isAdmin
    ? await firestore.getAllUsers().catch((error) => {
        console.warn("[Arquivados] Falha ao carregar usuarios completos para o details modal:", error);
        return [];
      })
    : [];

  DETAILS_MODAL_ENV.usersCache = {
    analysts,
    allUsers,
    usersList: analysts.length > 0 ? analysts : allUsers,
  };
  DETAILS_MODAL_ENV.usersCacheIsAdmin = state.isAdmin;

  if (DETAILS_MODAL_ENV.modalAppState) {
    DETAILS_MODAL_ENV.modalAppState.analysts = analysts;
    DETAILS_MODAL_ENV.modalAppState.allUsers = allUsers;
    DETAILS_MODAL_ENV.modalAppState.currentUserProfile =
      window.appState?.currentUserProfile || DETAILS_MODAL_ENV.modalAppState.currentUserProfile || null;
  }

  return DETAILS_MODAL_ENV.usersCache;
}

async function openDetails(contract) {
  const env = await ensureDetailsModalEnvironmentLoaded();
  const contractId = contract.id || contract.docId;

  if (!contractId) {
    console.warn("[Arquivados] Contrato sem ID para abrir details modal");
    return;
  }

  try {
    const [usersPayload, archivedContract] = await Promise.all([
      loadDetailsModalUsers(),
      firestore.getArchivedContractFromStorage(contractId).catch((error) => {
        console.warn("[Arquivados] Falha ao carregar snapshot completo do arquivado:", error);
        return null;
      }),
    ]);

    const fullData = archivedContract || { ...contract, id: contractId };
    DETAILS_MODAL_ENV.modalAppState.currentUserProfile =
      window.appState?.currentUserProfile || DETAILS_MODAL_ENV.modalAppState.currentUserProfile || null;

    env.controller.configureDetailsModalContext({
      mode: "archived",
      beforeMutate: async (targetContractId) => {
        if (!state.isAdmin) {
          throw new Error("Apenas administradores podem restaurar contratos arquivados para edição.");
        }

        await firestore.restoreContractFromStorageArchive(targetContractId);
        return null;
      },
      loadContract: async (targetContractId) => firestore.getContractById(targetContractId),
      loadUsers: async () => loadDetailsModalUsers(),
      onRestored: async (targetContractId) => {
        const restoredId = targetContractId || fullData.id;
        state.allArchivedContracts = state.allArchivedContracts.filter(
          (item) => (item.id || item.docId) !== restoredId
        );
        cacheService.set('archived_contracts_all', state.allArchivedContracts, 'archivedContractsList');
        state.pageContracts = filterArchivedContracts(state.allArchivedContracts, state.searchTerm);
        renderRows();
        renderPagination();
        env.ui.showNotification(
          "Processo restaurado para a listagem ativa. As proximas alteracoes usarao o mesmo fluxo de Processos.",
          "success"
        );
      },
    });

    env.eventListeners.setOriginalContractData(fullData);
    env.controller.setDetailsModalSourceContract(fullData);

    await env.ui.populateDetailsModal(fullData, usersPayload.usersList);
    env.controller.applyArchivedDetailsModalState(fullData);
  } catch (error) {
    console.error("[Arquivados] Erro ao abrir details modal unificado:", error);
    env?.ui?.showNotification?.(
      error?.message || "Nao foi possivel carregar o modal de detalhes do processo arquivado.",
      "error"
    );
  }
}

function filterArchivedContracts(contracts = [], term = '') {
  const searchTerm = term.trim().toLowerCase();
  if (!searchTerm) return contracts;

  const cleanTerm = searchTerm.replace(/[.\-\s/]/g, '');

  return contracts.filter((contract) => {
    const cliente = (contract.clientePrincipal || '').toLowerCase();
    const empreendimento = (contract.empreendimento || '').toLowerCase();
    const vendedor = (contract.vendedorConstrutora || '').toLowerCase();
    const status = (contract.status || '').toLowerCase();
    const apto = (contract.apto || '').toLowerCase();
    const bloco = (contract.bloco || '').toLowerCase();

    if (/^\d{3,}$/.test(cleanTerm)) {
      const cpfPrincipal = (contract.cpfPrincipal || '').replace(/[.\-\s/]/g, '');
      if (cpfPrincipal.includes(cleanTerm)) return true;

      if (Array.isArray(contract.compradores)) {
        return contract.compradores.some((comprador) =>
          (comprador.cpf || '').replace(/[.\-\s/]/g, '').includes(cleanTerm)
        );
      }
      return false;
    }

    return cliente.includes(searchTerm)
      || empreendimento.includes(searchTerm)
      || vendedor.includes(searchTerm)
      || status.includes(searchTerm)
      || apto.includes(searchTerm)
      || bloco.includes(searchTerm);
  });
}

async function handleRestore(contract, button) {
  const contractId = contract?.id || contract?.docId;
  if (!contractId) return;

  const label = contract?.clientePrincipal || contract?.empreendimento || contractId;
  if (!confirm(`Restaurar o contrato "${label}" para processos ativos?\n\nIsso fara o contrato reaparecer na pagina de Processos.`)) {
    return;
  }

  const originalHtml = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Restaurando...';
  }

  try {
    await firestore.restoreContractFromStorageArchive(contractId);

    state.allArchivedContracts = state.allArchivedContracts.filter(
      (item) => (item.id || item.docId) !== contractId
    );
    state.pageContracts = filterArchivedContracts(state.allArchivedContracts, state.searchTerm);
    renderRows();
    renderPagination();

    if (window.showNotification) {
      window.showNotification('Contrato restaurado com sucesso!', 'success');
    } else {
      alert('Contrato restaurado com sucesso!');
    }
  } catch (error) {
    console.error('[Arquivados] Erro ao restaurar contrato:', error);
    if (window.showNotification) {
      window.showNotification('Erro ao restaurar contrato. Tente novamente.', 'error');
    } else {
      alert('Erro ao restaurar contrato. Tente novamente.');
    }
  } finally {
    if (button && originalHtml) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
}

function downloadCsv() {
  const rows = state.searchTerm ? state.pageContracts : state.allArchivedContracts;
  if (!rows.length) return;

  const headers = ARCHIVED_EXPORT_COLUMNS.map((col) => col.label);

  const csvLines = [
    headers.join(";"),
    ...rows.map((row) =>
      ARCHIVED_EXPORT_COLUMNS
        .map((column) => {
          const rawValue = column.key === "id"
            ? (row.id || row.docId || "")
            : column.formatter
              ? column.formatter(row)
              : row[column.key] ?? "";
          const safeValue = String(rawValue).replace(/"/g, '""');
          return `"${safeValue}"`;
        })
        .join(";")
    ),
  ];

  const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "arquivados.csv";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  if (activityLogService?.logActivity) {
    activityLogService.logActivity(
      'EXPORT_REPORT',
      `Relatório de arquivados exportado (${rows.length} registros)`,
      null,
      {
        source: 'archivedContracts',
        format: 'CSV',
        fileName: 'arquivados.csv',
        rowCount: rows.length,
      }
    );
  }
}

function renderRows() {
  if (!elements.tableBody) return;

  if (!state.hasLoaded) {
    renderManualRefreshPrompt();
    return;
  }

  const pageItems = state.pageContracts;
  updateExportButtonState();

  if (pageItems.length === 0) {
    elements.tableBody.innerHTML = state.searchTerm
      ? `
        <tr>
          <td colspan="${ARCHIVED_COLUMNS.length + 1}" class="text-center text-muted py-5">
            <i class="bi bi-search fs-1 d-block mb-3 text-secondary"></i>
            <p class="mb-1">Nenhum resultado encontrado para "<strong>${escapeHtml(state.searchTerm)}</strong>"</p>
            <small class="text-muted">Tente buscar por nome do cliente, empreendimento, vendedor, CPF, apartamento ou bloco</small>
          </td>
        </tr>`
      : "";

    if (!state.searchTerm) {
      elements.emptyState?.classList.remove('d-none');
    }
    return;
  }

  elements.emptyState?.classList.add('d-none');

  elements.tableBody.innerHTML = pageItems
    .map((contract) => {
      const cols = ARCHIVED_COLUMNS.map((col) => {
      const value = col.key === 'updatedAt' ? formatDate(contract[col.key]) : (contract[col.key] || '—');
        return `<td>${escapeHtml(value)}</td>`;
    }).join('');

    const restoreDisabled = state.isAdmin ? '' : 'disabled';
      const restoreTitle = state.isAdmin
        ? 'Restaurar contrato para processos ativos'
        : 'Apenas administradores podem restaurar';

      return `
        <tr data-id="${escapeHtml(contract.id || contract.docId || "")}">
          ${cols}
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary" data-action="details">
              <i class="bi bi-eye me-1"></i>Detalhes
            </button>
            <button class="btn btn-sm btn-outline-success ms-2" data-action="restore" ${restoreDisabled} title="${restoreTitle}">
              <i class="bi bi-arrow-counterclockwise me-1"></i>Restaurar
            </button>
          </td>
        </tr>`;
    })
    .join("");

  elements.tableBody.querySelectorAll('button[data-action="details"]').forEach((btn, index) => {
    btn.addEventListener("click", () => openDetails(pageItems[index]));
  });

  elements.tableBody.querySelectorAll('button[data-action="restore"]').forEach((btn, index) => {
    btn.addEventListener("click", () => handleRestore(pageItems[index], btn));
  });
}

function applyArchivedContractsToState(contracts = []) {
  const contractsMap = new Map();

  contracts.forEach((contract) => {
    const id = contract.id || contract.docId;
    if (!id || contractsMap.has(id)) return;
    contractsMap.set(id, contract);
  });

  const merged = Array.from(contractsMap.values()).sort((a, b) => {
    const dateA = a.archivedAt?.toDate?.() || new Date(a.archivedAt || a.updatedAt || 0);
    const dateB = b.archivedAt?.toDate?.() || new Date(b.archivedAt || b.updatedAt || 0);
    return dateB - dateA;
  });

  state.allArchivedContracts = merged;
  state.pageContracts = filterArchivedContracts(merged, state.searchTerm);
  renderPagination();
  renderRows();
}

async function tryHydrateArchivedFromCache() {
  if (state.hasLoaded) return true;
  if (!firebase.auth().currentUser) return false;

  try {
    const cachedContracts = await cacheService.getCached('archived_contracts_all', 'archivedContractsList');

    if (Array.isArray(cachedContracts) && cachedContracts.length > 0) {
      state.hasLoaded = true;
      applyArchivedContractsToState(cachedContracts);
      console.log(`[Arquivados] Cache persistente restaurado: ${cachedContracts.length} contrato(s)`);
      return true;
    }
    return false;
  } catch (error) {
    console.warn("[Arquivados] Nao foi possivel restaurar cache persistente:", error);
    return false;
  }
}

async function loadArchivedContracts(options = {}) {
  const { forceRefresh = false } = options;

  if (!state.hasLoaded || forceRefresh) {
    state.hasLoaded = true;
  }

  if (state._loadingPromise) {
    return state._loadingPromise;
  }

  if (!elements.page || state.loading) {
    return Promise.resolve();
  }

  setLoading(true);

  state._loadingPromise = (async () => {
    try {
      const allContracts = [];
      let lastDoc = null;
      let hasMore = true;
      let isFirstPage = true;

      while (hasMore) {
        const result = await firestore.listArchivedContractsFromStorage({
          limit: ARCHIVED_FETCH_LIMIT,
          lastDoc,
          forceRefresh: forceRefresh && isFirstPage,
        });

        allContracts.push(...(result?.contracts || []));
        if (isFirstPage) {
          applyArchivedContractsToState(allContracts);
        }

        hasMore = Boolean(result?.hasMore);
        lastDoc = result?.lastDoc || null;
        isFirstPage = false;

        if (hasMore && !lastDoc) {
          console.warn('[Arquivados] Paginação interrompida: lastDoc ausente com hasMore=true.');
          hasMore = false;
        }
      }

      if (allContracts.length > 0) {
        cacheService.set('archived_contracts_all', allContracts, 'archivedContractsList');
      }

      applyArchivedContractsToState(allContracts);
    } catch (error) {
      console.error('[Arquivados] Erro ao carregar arquivados:', error);
      if (elements.tableBody) {
        elements.tableBody.innerHTML = `
          <tr>
            <td colspan="${ARCHIVED_COLUMNS.length + 1}" class="text-danger text-center py-3">
              Erro ao carregar arquivados. Tente novamente.
            </td>
          </tr>`;
      }
    } finally {
      setLoading(false);
      state._loadingPromise = null;
      updateExportButtonState();
    }
  })();

  return state._loadingPromise;
}

function applyFilters() {
  const nextTerm = (elements.searchInput?.value || "").trim();
  if (nextTerm === state.searchTerm) return;

  state.searchTerm = nextTerm;

  if (!state.hasLoaded) {
    renderManualRefreshPrompt();
    return;
  }

  if (!state.allArchivedContracts.length) {
    void loadArchivedContracts();
    return;
  }

  state.pageContracts = filterArchivedContracts(state.allArchivedContracts, state.searchTerm);
  renderRows();
  renderPagination();
}

function bindEvents() {
  let searchTimeout;

  elements.searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => applyFilters(), 300);
  });

  elements.refreshBtn?.addEventListener("click", () => {
    state.searchTerm = (elements.searchInput?.value || "").trim();
    state.hasLoaded = true;
    void loadArchivedContracts({ forceRefresh: true });
  });

  elements.exportBtn?.addEventListener("click", () => downloadCsv());

  window.addEventListener('pagechange', async (event) => {
    if (event.detail?.page !== 'arquivados') return;

    await checkAdminPermissions();
    if (!state.hasLoaded) {
      const restored = await tryHydrateArchivedFromCache();
      if (!restored) {
        await loadArchivedContracts();
      }
    }
  });

  firebase.auth().onAuthStateChanged((user) => {
    if (!user || !elements.page?.classList.contains('active')) return;

    void checkAdminPermissions();
    if (!state.hasLoaded) {
      void tryHydrateArchivedFromCache().then((restored) => {
        if (!restored) {
          void loadArchivedContracts();
        }
      });
    }
  });
}

async function checkAdminPermissions() {
  try {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      console.log("[Arquivados] Nenhum usuario autenticado para verificar permissoes");
      return;
    }

    const tokenResult = await currentUser.getIdTokenResult();
    const isAdmin = tokenResult.claims?.admin === true;

    if (state.isAdmin !== isAdmin) {
      DETAILS_MODAL_ENV.usersCache = null;
      DETAILS_MODAL_ENV.usersCacheIsAdmin = null;
    }

    state.isAdmin = isAdmin;

    if (state.hasLoaded && state.pageContracts.length > 0) {
      renderRows();
    }
  } catch (error) {
    console.error('[Arquivados] Erro ao verificar permissões:', error);
  }
}

function init() {
  if (state.initialized) return;

  state.initialized = true;
  bindEvents();
  void checkAdminPermissions();

  if (elements.page?.classList.contains('active')) {
    void tryHydrateArchivedFromCache().then((restored) => {
      if (!restored) {
        void loadArchivedContracts();
      }
    });
  } else {
    renderManualRefreshPrompt();
  }
}

init();
