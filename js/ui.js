/**
 * @file ui.js
 * @description Módulo para manipulação do DOM e da interface do utilizador.
 */
import {
  STATUS_CONFIG,
  EXPORTABLE_FIELDS,
  FIELDS_TO_TRACK,
  TABLE_COLUMNS,
  FIELD_CASE_MAPPING,
} from "./config.js";
import * as firestore from "./firestoreService.js";
import { auth } from "./auth.js";
import whatsappService from "./whatsappService.js";
import {
  normalizePhoneToE164,
  formatPhoneToE164,
} from "./phoneUtils.js";
import { applyCPFMask, formatCPF } from "./formValidation.js";
import {
  getConsultaKeyState,
  normalizeConsultaKeyValue,
} from "./consultaKeyService.js";
import pendenciasService from "./pendenciasService.js";
import workflowService from "./workflowService.js";
import userPermissionService from "./userPermissionService.js";
import { DEFAULT_WORKFLOWS } from "./workflowConfig.js";
import { renderRequirementsUI } from "./requirementsUI.js";
import { escapeHtml, sanitizeAttribute } from "./sanitization.js";
import {
  getArchivedDetailsPlaceholderMarkup,
  isDetailsModalArchivedPendingRestore,
} from "./detailsModalController.js";

// Cache local de workflows para uso síncrono no renderKanbanBoard
let cachedWorkflows = [...DEFAULT_WORKFLOWS];

// Debounce e proteção contra renderizações duplicadas do Kanban
let _kanbanRenderInProgress = false;
let _kanbanLastRenderTime = 0;
const KANBAN_MIN_RENDER_INTERVAL = 300; // 300ms mínimo entre renderizações

// Estado do card de compradores no details modal:
// por padrão abre em modo leitura e o usuário pode habilitar edição.
let compradoresEditModeEnabled = false;
let renderContractsHeaderClickHandler = null;
let renderContractsSelectAllHandler = null;
let renderContractsSelectAllElement = null;
let statusFilterChangeHandler = null;
let statusFilterChangeElement = null;

const WORKFLOW_FIELD_CANDIDATES = [
  'workflowId',
  'workflowID',
  'workflowid',
  'workFlowId',
  'workflowType',
  'workflowtype'
];

const LEGACY_FIELD_ALIAS_BY_TARGET = (() => {
  const aliasMap = new Map();

  Object.entries(FIELD_CASE_MAPPING || {}).forEach(([legacyKeyRaw, targetKeyRaw]) => {
    const legacyKey = String(legacyKeyRaw || "").trim();
    const targetKey = String(targetKeyRaw || "").trim();
    if (!legacyKey || !targetKey) return;

    if (!aliasMap.has(targetKey)) {
      aliasMap.set(targetKey, []);
    }
    aliasMap.get(targetKey).push(legacyKey);
  });

  return aliasMap;
})();

function getContractValueForColumn(contract, key) {
  if (!contract || !key) return undefined;

  if (Object.prototype.hasOwnProperty.call(contract, key)) {
    return contract[key];
  }

  const aliases = LEGACY_FIELD_ALIAS_BY_TARGET.get(key) || [];
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(contract, alias)) {
      return contract[alias];
    }
  }

  const lowerKey = String(key).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(contract, lowerKey)) {
    return contract[lowerKey];
  }

  return undefined;
}

function normalizeWorkflowIdValue(value) {
  return value === undefined || value === null
    ? ''
    : String(value).trim().toLowerCase();
}

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

export function getCachedWorkflows() {
  return Array.isArray(cachedWorkflows) ? [...cachedWorkflows] : [];
}

// Helper: retorna a lista de status efetiva (dinâmica se disponível; senão, fallback para STATUS_CONFIG)
function getStatusConfigList() {
  const dyn = window.EFFECTIVE_STATUS_CONFIG;
  if (Array.isArray(dyn) && dyn.length > 0) return dyn;
  return STATUS_CONFIG;
}

/**
 * Converte cor hexadecimal para RGBA com opacidade
 * @param {string} hex - Cor em formato hexadecimal (#RRGGBB)
 * @param {number} alpha - Opacidade (0 a 1)
 * @returns {string} Cor em formato rgba()
 */
function hexToRgba(hex, alpha = 1) {
  // Remove # se presente
  const cleanHex = hex.replace('#', '');
  
  // Parse RGB
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Descobre todos os status existentes nos contratos e retorna lista expandida
 * @param {Array} contracts - Lista de contratos para análise
 * @returns {Array} Lista de status conhecidos + órfãos descobertos
 */
function getExpandedStatusList(contracts = []) {
  const knownStatuses = getStatusConfigList();
  const knownStatusTexts = new Set(knownStatuses.map(s => s.text));
  
  // Descobre status órfãos
  const orphanStatuses = new Set();
  contracts.forEach(contract => {
    if (contract.status && !knownStatusTexts.has(contract.status)) {
      orphanStatuses.add(contract.status);
    }
  });
  
  // Adiciona status órfãos como configurações temporárias
  const orphanConfigs = Array.from(orphanStatuses).map((statusText, index) => ({
    text: statusText,
    stage: 'Órfão',
    order: 999 + index, // Order alto para aparecer no final
    active: true,
    isOrphan: true
  }));
  
  const expandedList = [...knownStatuses, ...orphanConfigs];
  
  if (orphanConfigs.length > 0) {
    console.log(` Status órfãos descobertos: ${orphanConfigs.length}`, orphanConfigs.map(s => s.text));
  }
  
  return expandedList;
}

function normalizeStatusText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function buildStatusCheckboxId(statusText, index, prefix = "status") {
  const safeText = normalizeStatusText(statusText)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "status";
  return `${prefix}-${safeText}-${index}`;
}

function sanitizeStringValue(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  return value || "";
}

function prepareCompradoresForDisplay(list = []) {
  if (!Array.isArray(list)) return [];

  return list
    .filter((item) => item && typeof item === "object")
    .map((comprador) => {
      const normalized = { ...comprador };
      normalized.nome = sanitizeStringValue(normalized.nome);
      normalized.cpf = sanitizeStringValue(normalized.cpf);
      normalized.email = sanitizeStringValue(normalized.email);
      normalized.telefone = normalized.telefone
        ? formatPhoneToE164(normalized.telefone)
        : "";
      [
        "estadoCivil",
        "filiacaoPai",
        "filiacaoMae",
        "rg",
        "orgaoExpedidor",
        "nascimento",
        "nacionalidade",
        "profissao",
        "endereco",
        "cidade",
        "uf",
        "cep",
      ].forEach((field) => {
        normalized[field] = sanitizeStringValue(normalized[field]);
      });
      return normalized;
    });
}

function prepareCompradoresForStorage(list = []) {
  if (!Array.isArray(list)) return [];

  return list
    .filter((item) => item && typeof item === "object")
    .map((comprador) => {
      const normalized = { ...comprador };
      normalized.nome = sanitizeStringValue(normalized.nome);
      normalized.cpf = sanitizeStringValue(normalized.cpf);
      normalized.email = sanitizeStringValue(normalized.email);

      [
        "estadoCivil",
        "filiacaoPai",
        "filiacaoMae",
        "rg",
        "orgaoExpedidor",
        "nascimento",
        "nacionalidade",
        "profissao",
        "endereco",
        "cidade",
        "uf",
        "cep",
      ].forEach((field) => {
        normalized[field] = sanitizeStringValue(normalized[field]);
      });

      if (normalized.telefone) {
        const e164 = normalizePhoneToE164(normalized.telefone);
        normalized.telefone = e164 || sanitizeStringValue(normalized.telefone);
      } else {
        normalized.telefone = "";
      }

      return normalized;
    });
}

function getPrimaryComprador(compradores = []) {
  if (!Array.isArray(compradores) || compradores.length === 0) {
    return {};
  }

  return compradores.find((comprador) => comprador?.principal) || compradores[0];
}

export function isCompradoresEditModeEnabled() {
  return compradoresEditModeEnabled;
}

export function setCompradoresEditMode(enabled = false) {
  compradoresEditModeEnabled = Boolean(enabled);

  const compradoresContainer = DOMElements.compradoresContainer;
  const addCompradorBtn = DOMElements.addCompradorBtn;
  const toggleBtn = document.getElementById("toggle-compradores-edit-btn");

  if (compradoresContainer) {
    compradoresContainer.dataset.editEnabled = compradoresEditModeEnabled ? "true" : "false";
    compradoresContainer.classList.toggle("compradores-readonly", !compradoresEditModeEnabled);

    const editableFields = compradoresContainer.querySelectorAll(
      "input[data-field], select[data-field], textarea[data-field]"
    );

    editableFields.forEach((field) => {
      const fieldTag = String(field.tagName || "").toLowerCase();
      const isRadio = fieldTag === "input" && field.type === "radio";
      const isSelect = fieldTag === "select";
      const isTextInput = fieldTag === "input" || fieldTag === "textarea";

      if (isRadio || isSelect) {
        field.disabled = !compradoresEditModeEnabled;
      } else if (isTextInput) {
        field.readOnly = !compradoresEditModeEnabled;
      }

      field.setAttribute(
        "aria-readonly",
        (!compradoresEditModeEnabled).toString()
      );
    });

    const actionLinks = compradoresContainer.querySelectorAll(".comprador-action-link");
    actionLinks.forEach((link) => {
      link.classList.toggle("disabled", !compradoresEditModeEnabled);
      link.setAttribute("aria-disabled", (!compradoresEditModeEnabled).toString());

      if (!compradoresEditModeEnabled) {
        link.setAttribute("tabindex", "-1");
      } else {
        link.removeAttribute("tabindex");
      }
    });
  }

  if (addCompradorBtn) {
    addCompradorBtn.disabled = !compradoresEditModeEnabled;
  }

  if (toggleBtn) {
    toggleBtn.setAttribute("aria-pressed", compradoresEditModeEnabled.toString());
    toggleBtn.classList.toggle("btn-outline-secondary", !compradoresEditModeEnabled);
    toggleBtn.classList.toggle("btn-outline-warning", compradoresEditModeEnabled);
    const buttonLabel = compradoresEditModeEnabled
      ? "Bloquear edicao dos compradores"
      : "Habilitar edicao dos compradores";
    toggleBtn.setAttribute("title", buttonLabel);
    toggleBtn.setAttribute("aria-label", buttonLabel);
    toggleBtn.innerHTML = compradoresEditModeEnabled
      ? '<i class="bi bi-lock-fill"></i>'
      : '<i class="bi bi-pencil-square"></i>';
  }
}

/**
 * Força atualização de todos os filtros de status com dados dinâmicos
 * Deve ser chamada após o carregamento dos status dinâmicos
 */
export function refreshAllStatusFilters(selectedStatusState, selectedChartStatusState, onViewUpdate, saveStatusFilterState) {
  console.log(' Atualizando todos os filtros de status com dados dinâmicos...');
  const statusList = getStatusConfigList();
  const filterStatuses = statusList.filter(status => !status.archiveContracts);

  // Garante que estados arquivados não fiquem marcados no filtro da tabela
  statusList.forEach(status => {
    if (status.archiveContracts && selectedStatusState.has(status.text)) {
      selectedStatusState.delete(status.text);
    }
  });
  
  // 1. Atualiza filtro da tela de processos
  const filterContent = document.getElementById("table-filter-scroll-content-offcanvas");
  if (filterContent) {
    filterContent.innerHTML = "";
    filterStatuses.forEach((status, index) => {
      const div = document.createElement("div");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = status.text;
      checkbox.checked = selectedStatusState.has(status.text);
      checkbox.id = buildStatusCheckboxId(status.text, index, "filter");

      const labelElement = document.createElement("label");
      labelElement.htmlFor = checkbox.id;
      labelElement.classList.add('d-flex', 'align-items-center', 'gap-2');
      labelElement.title = status.text;
      labelElement.appendChild(checkbox);

      const textSpan = document.createElement('span');
      const statusOrder = status.order ?? "S/N";
      textSpan.textContent = `${statusOrder} - ${status.text}`;
      labelElement.appendChild(textSpan);

      div.appendChild(labelElement);
      filterContent.appendChild(div);
    });

    // Re-adiciona event listeners sem acumular handlers antigos
    if (statusFilterChangeElement && statusFilterChangeHandler) {
      statusFilterChangeElement.removeEventListener("change", statusFilterChangeHandler);
    }

    statusFilterChangeElement = filterContent;
    statusFilterChangeHandler = (event) => {
      const statusCheckbox = event.target;
      if (statusCheckbox.type === "checkbox" && statusCheckbox.value) {
        if (statusCheckbox.checked) {
          selectedStatusState.add(statusCheckbox.value);
        } else {
          selectedStatusState.delete(statusCheckbox.value);
        }
        saveStatusFilterState();
        onViewUpdate({ statusFilterChange: true });
      }
    };

    filterContent.addEventListener("change", statusFilterChangeHandler);
  }

  // 2. Atualiza legenda do dashboard/gráfico
  const legendContainer = document.getElementById("custom-legend");
  if (legendContainer) {
    legendContainer.innerHTML = "";
    statusList.forEach((status, index) => {
      const div = document.createElement("div");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = status.text;
      checkbox.checked = selectedChartStatusState.has(status.text);
      checkbox.id = buildStatusCheckboxId(status.text, index, "check");

      const labelElement = document.createElement("label");
      labelElement.htmlFor = checkbox.id;
      labelElement.classList.add('d-flex', 'align-items-center', 'gap-2');
      labelElement.title = status.archiveContracts ? `${status.text} • Arquivado: permanece disponível apenas para métricas` : status.text;
      labelElement.appendChild(checkbox);

      const legendText = document.createElement('span');
      const statusOrder = status.order ?? "S/N";
      legendText.textContent = `${statusOrder} - ${status.text}`;
      labelElement.appendChild(legendText);

      if (status.archiveContracts) {
        const badge = document.createElement('span');
        badge.className = 'badge bg-secondary text-uppercase fw-semibold';
        badge.innerHTML = '<i class="bi bi-archive me-1"></i>Arquivado';
        labelElement.appendChild(badge);
      }
      div.appendChild(labelElement);
      legendContainer.appendChild(div);

      // Adiciona listener para mudanças
      checkbox.addEventListener("change", (e) => {
        if (e.target.checked) {
          selectedChartStatusState.add(e.target.value);
        } else {
          selectedChartStatusState.delete(e.target.value);
        }
        // Força atualização do gráfico se houver dados
        if (window.appState && window.appState.allContracts && window.appState.allContracts.length > 0) {
          updateStatusChart(window.appState.allContracts, selectedChartStatusState);
        }
      });
    });
  }

  console.log(' Filtros de status atualizados com', statusList.length, 'status dinâmicos');
}

// Objeto que centraliza a seleção de todos os elementos do DOM.
export const DOMElements = {
  // Geral
  notification: document.getElementById("notification"),
  pages: document.querySelectorAll(".page"),
  navButtons: document.querySelectorAll(".nav-button"),
  userEmailSpan: document.getElementById("user-email"),
  logoutButton: document.getElementById("logout-button"),
  settingsNavButton: document.querySelector(
    '.nav-button[data-page="configuracoes"]'
  ),

  // Tabela de Processos
  contractList: document.getElementById("contract-list"),
  searchInput: document.getElementById("search-input"),
  searchClearBtn: document.getElementById("search-clear-btn"),
  processosSearchIndicator: document.getElementById("processos-search-indicator"),
  tableHeader: document.getElementById("table-header"),

  processosViewContainer: document.getElementById("processos-view-container"),
  kanbanBoard: document.getElementById("kanban-board"),
  toggleViewBtn: document.getElementById("toggle-view-btn"),
  rowsPerPageSelect: document.getElementById("rows-per-page-select"),

  paginationControls: document.getElementById("pagination-controls"),
  prevPageBtn: document.getElementById("prev-page-btn"),
  nextPageBtn: document.getElementById("next-page-btn"),
  pageInfo: document.getElementById("page-info"),

  // Elementos para o seletor de colunas (offcanvas)
  openColumnSelectorBtn: document.getElementById("open-column-selector-btn"),
  columnSelectorModal: document.getElementById("column-selector-modal"), // Mantido por compatibilidade
  columnSelectorGrid: document.getElementById("column-selector-grid-offcanvas"),
  columnSelectorForm: document.getElementById("column-selector-form-offcanvas"),

  // Modal de Detalhes
  detailsModal: document.getElementById("details-modal"),
  detailsForm: document.getElementById("details-form"),
  closeModalBtn: document.querySelector("#details-modal .btn-close-modern"),
  modalContractId: document.getElementById("modal-contract-id"),
  modalSummary: {
    id: document.getElementById("modal-summary-id"),
    status: document.getElementById("modal-summary-status"),
    stage: document.getElementById("modal-summary-stage"),
    time: document.getElementById("modal-summary-time"),
    created: document.getElementById("modal-summary-created"),
    updated: document.getElementById("modal-summary-updated"),
    empreendimento: document.getElementById("modal-summary-empreendimento"),
    unidade: document.getElementById("modal-summary-unidade"),
    analista: document.getElementById("modal-summary-analista"),
    analistaAprovacao: document.getElementById("modal-summary-analistaAprovacao"),
    analistaCehop: document.getElementById("modal-summary-analistaCehop"),
    ultimoAnalistaAlteracao: document.getElementById("modal-summary-ultimoAnalistaAlteracao"),
    vendedor: document.getElementById("modal-summary-vendedor"),
  },
  historyListDiv: document.getElementById("modal-history-list"),
  addCompradorBtn: document.getElementById("add-comprador-btn"),
  compradoresContainer: document.getElementById("compradores-container"),

  // Adicionar Processo
  addContractModal: document.getElementById("add-contract-modal"),
  openAddModalBtn: document.getElementById("open-add-modal-btn"),
  closeAddModalBtn: document.getElementById("close-add-modal-btn"),
  contractForm: document.getElementById("contract-form"),

  addVendedorConstrutora: document.getElementById("add-vendedorConstrutora"),
  addEmpreendimento: document.getElementById("add-empreendimento"),

  addCompradoresContainer: document.getElementById("add-compradores-container"),
  addCompradorBtnNewModal: document.getElementById(
    "add-comprador-btn-new-modal"
  ),
  addApto: document.getElementById("add-apto"),
  addBloco: document.getElementById("add-bloco"),

  bulkUpdateModal: document.getElementById("bulk-update-modal"),
  bulkUpdateForm: document.getElementById("bulk-update-form"),
  selectAllCheckbox: document.getElementById("select-all-checkbox"),
  bulkActionsContainer: document.getElementById("bulk-actions-container"),
  bulkActionsCounter: document.getElementById("bulk-actions-counter"),
  bulkUpdateBtn: document.getElementById("bulk-update-btn"),
  listHeader: document.querySelector(".list-header"),

  // AJUSTE: Adicionados os botões de ação dos filtros para fácil acesso.
  chartSelectAllBtn: document.getElementById("chart-select-all"),
  chartClearAllBtn: document.getElementById("chart-clear-all"),
  tableSelectAllBtn: document.getElementById("table-select-all-offcanvas"),
  tableClearAllBtn: document.getElementById("table-clear-all-offcanvas"),
  includeArchivedCheckbox: document.getElementById("include-archived-checkbox"),

  // Adicionado o formulário para criar novo utilizador
  userListTbody: document.getElementById("user-list-tbody"),
  addUserForm: document.getElementById("add-user-form"),

  profileEmail: document.getElementById("profile-email"),
  profileFullName: document.getElementById("profile-fullname"),
  profileShortName: document.getElementById("profile-shortname"),
  profileCpf: document.getElementById("profile-cpf"),
  profileForm: document.getElementById("profile-form"),
  passwordChangeForm: document.getElementById("password-change-form"),

  //elementos de importação
  importCsvButton: document.getElementById("import-csv-button"),
  csvFileInput: document.getElementById("csv-file-input"),
  importProgress: document.getElementById("import-progress"),
  exportCsvBtn: document.getElementById("export-csv-btn"),

  reportFieldsContainer: document.getElementById("report-fields-container"),
  reportSelectAllBtn: document.getElementById("report-select-all-btn"),
  reportClearAllBtn: document.getElementById("report-clear-all-btn"),
  generateReportBtn: document.getElementById("generate-report-btn"),
  reportStatus: document.getElementById("report-status"),

  editRuleModal: document.getElementById("edit-rule-modal"),
  editRuleForm: document.getElementById("edit-rule-form"),

  openStatusRulesModalBtn: document.getElementById(
    "open-status-rules-modal-btn"
  ),
  statusRulesModal: document.getElementById("status-rules-modal"),
};

function getDetailsModalSummaryElements() {
  return {
    id: document.getElementById("modal-summary-id"),
    status: document.getElementById("modal-summary-status"),
    stage: document.getElementById("modal-summary-stage"),
    time: document.getElementById("modal-summary-time"),
    created: document.getElementById("modal-summary-created"),
    updated: document.getElementById("modal-summary-updated"),
    empreendimento: document.getElementById("modal-summary-empreendimento"),
    unidade: document.getElementById("modal-summary-unidade"),
    analista: document.getElementById("modal-summary-analista"),
    analistaAprovacao: document.getElementById("modal-summary-analistaAprovacao"),
    analistaCehop: document.getElementById("modal-summary-analistaCehop"),
    ultimoAnalistaAlteracao: document.getElementById("modal-summary-ultimoAnalistaAlteracao"),
    vendedor: document.getElementById("modal-summary-vendedor"),
  };
}

export function refreshDetailsModalDOMReferences() {
  DOMElements.detailsModal = document.getElementById("details-modal");
  DOMElements.detailsForm = document.getElementById("details-form");
  DOMElements.closeModalBtn = document.querySelector("#details-modal .btn-close-modern");
  DOMElements.modalContractId = document.getElementById("modal-contract-id");
  DOMElements.modalSummary = getDetailsModalSummaryElements();
  DOMElements.historyListDiv = document.getElementById("modal-history-list");
  DOMElements.addCompradorBtn = document.getElementById("add-comprador-btn");
  DOMElements.compradoresContainer = document.getElementById("compradores-container");

  return DOMElements.detailsModal;
}

refreshDetailsModalDOMReferences();

const whatsappTabState = {
  currentContractId: null,
  lastLoadedContractId: null,
  linkedChatId: null,
  linkedChats: [],
  messageCache: {},
  loading: false,
  messagesLoading: false,
  autoLinkAttempted: false,
  currentContract: null,
};

// Estado para lazy loading de anexos
const anexosTabState = {
  currentContractId: null,
  lastLoadedContractId: null,
  loading: false
};

let currentSummaryContract = null;

// Log de depuração para verificar se os elementos foram encontrados
debug(" DOMElements - Debug de inicialização:");
debug(` Páginas encontradas: ${DOMElements.pages.length}`);
DOMElements.pages.forEach((page, index) => {
  debug(`  ${index + 1}. ${page.id} - display: ${getComputedStyle(page).display}`);
});
debug(` Botões de navegação encontrados: ${DOMElements.navButtons.length}`);
DOMElements.navButtons.forEach((btn, index) => {
  debug(`  ${index + 1}. data-page="${btn.dataset.page}" - display: ${getComputedStyle(btn).display}`);
});

let notificationTimer;
let statusChart = null; // Variável global para o gráfico

// === Sistema simples de debug ===
// Ative definindo window.__DEBUG__ = true no console ou aqui.
if (window.__DEBUG__ === undefined) {
  window.__DEBUG__ = false; // padrão produção (mudo)
}
export function debug(...args) {
  if (window.__DEBUG__) {
    console.log(...args);
  }
}

/**
 * Mostra uma notificação no ecrã.
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} type - 'success' ou 'error'.
 */
export function showNotification(message, type = "success") {
  clearTimeout(notificationTimer);
  DOMElements.notification.textContent = message;
  DOMElements.notification.className = "notification"; // Reseta as classes
  DOMElements.notification.classList.add(type, "show");
  notificationTimer = setTimeout(() => {
    DOMElements.notification.classList.remove("show");
  }, 3000);
}

/**
 * Navega para uma página específica da aplicação.
 * OTIMIZAÇÃO 30/10/2025: Dispara evento customizado para controle de listeners
 * @param {string} pageId - O ID da página (ex: 'dashboard').
 */
export function navigateTo(pageId) {
  debug(` DEBUG: Tentando navegar para: ${pageId}`);
  debug(` Navegando para a página: ${pageId}`);

  // Re-selecionar elementos para garantir que estão atualizados
  const pages = document.querySelectorAll('.page');
  const navButtons = document.querySelectorAll('.nav-button');

  debug(` DEBUG: Encontrados ${pages.length} páginas e ${navButtons.length} botões`);

  pages.forEach((page) => {
    page.classList.remove("active");
    debug(` remov 'active': ${page.id}`);
  });

  navButtons.forEach((button) => {
    button.classList.remove("active");
    debug(` btn off: ${button.dataset.page}`);
  });

  // Fullscreen apenas se entrando em processos (evita repetir)
  if (pageId === 'processos') {
    if (!document.body.classList.contains('fullscreen-processos')) {
      document.body.classList.add('fullscreen-processos');
      debug(' fullscreen ON processos');
    }
  } else if (document.body.classList.contains('fullscreen-processos')) {
    document.body.classList.remove('fullscreen-processos');
    debug(' fullscreen OFF');
  }

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) {
    targetPage.classList.add("active");
    debug(` page ativa: page-${pageId}`);
  } else {
    console.error(` Página não encontrada: page-${pageId}`);
  }

  const targetButton = document.querySelector(`.nav-button[data-page="${pageId}"]`);
  if (targetButton) {
    targetButton.classList.add("active");
    debug(` botão ativo: ${pageId}`);
  } else {
    // Verificar se é o botão de perfil (sidebar-user)
    const profileButton = document.querySelector(`.sidebar-user[data-page="${pageId}"]`);
    if (profileButton) {
      profileButton.classList.add("active");
      debug(` botão sidebar-user ativo: ${pageId}`);
    } else {
      // Não logar erro para páginas sem botão de navegação
      debug(` Botão não encontrado para a página: ${pageId}`);
    }
  }
  
  //  OTIMIZAÇÃO: Dispara evento customizado para que listeners possam reagir
  window.dispatchEvent(new CustomEvent('pagechange', { 
    detail: { page: pageId } 
  }));

  // Removido auto toggleView aqui para evitar render duplo; controle fica na lógica de processos.
}

/**
 * Popula o painel de filtro de status da tabela com checkboxes.
 * @param {Set} selectedStatusState - Um Set com os status atualmente selecionados.
 * @param {Function} onViewUpdate - Função para notificar o main.js sobre a atualização da visão.
 * @param {Function} saveStatusFilterState - Função para salvar o estado do filtro.
 */
export function populateStatusFilter(
  selectedStatusState,
  onViewUpdate,
  saveStatusFilterState,
  contracts = []
) {
  const filterContent = document.getElementById("table-filter-scroll-content-offcanvas");
  if (!filterContent) return; // Garante que o elemento existe

  filterContent.innerHTML = ""; // Limpa o conteúdo anterior

  // MELHORIA: Usa lista expandida incluindo status órfãos
  const statusList = contracts.length > 0 ? getExpandedStatusList(contracts) : getStatusConfigList();
  // Esconde status marcados como arquivados para evitar leituras extras
  const filterStatuses = statusList.filter(status => !status.archiveContracts);

  // Limpa seleções antigas que ficaram com status arquivados
  statusList.forEach(status => {
    if (status.archiveContracts && selectedStatusState.has(status.text)) {
      selectedStatusState.delete(status.text);
    }
  });

  console.log(` Populando filtros com ${filterStatuses.length} status (incluindo órfãos ativos)`);

  filterStatuses.forEach((status, index) => {
    const div = document.createElement("div");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = status.text;
    checkbox.checked = selectedStatusState.has(status.text);
    checkbox.id = buildStatusCheckboxId(status.text, index, "filter");

    const labelElement = document.createElement("label");
    labelElement.htmlFor = checkbox.id;
    labelElement.appendChild(checkbox);
    const statusOrder = status.order ?? "S/N";
    labelElement.appendChild(
      document.createTextNode(`${statusOrder} - ${status.text}`)
    );
    labelElement.title = status.text;

    div.appendChild(labelElement);
    filterContent.appendChild(div);
  });

  // Adiciona o ouvinte AGORA que os elementos foram criados.
  if (statusFilterChangeElement && statusFilterChangeHandler) {
    statusFilterChangeElement.removeEventListener("change", statusFilterChangeHandler);
  }

  statusFilterChangeElement = filterContent;
  statusFilterChangeHandler = (event) => {
    const statusCheckbox = event.target;
    if (statusCheckbox.type === "checkbox" && statusCheckbox.value) {
      if (statusCheckbox.checked) {
        selectedStatusState.add(statusCheckbox.value);
      } else {
        selectedStatusState.delete(statusCheckbox.value);
      }

      // Chama a função de salvamento que agora está disponível
      saveStatusFilterState();

      // Notifica a aplicação principal para atualizar a visualização
      onViewUpdate({ statusFilterChange: true });
    }
  };

  filterContent.addEventListener("change", statusFilterChangeHandler);
}

/**
 * Renderiza os controlos de paginação e atualiza o seu estado.
 * @param {object} paginationState - O estado da paginação.
 */
export function renderPaginationControls(paginationState) {
  const { currentPage, rowsPerPage, totalContracts, currentListSize } =
    paginationState;

  // GUARDA DE SEGURANÇA: Se não encontrar o container principal, interrompe a função.
  if (!DOMElements.paginationControls) {
    return;
  }

  if (totalContracts === 0) {
    DOMElements.paginationControls.style.display = "none";
    return;
  }

  DOMElements.paginationControls.style.display = "flex";
  const totalPages = Math.ceil(totalContracts / rowsPerPage);

  // Adiciona verificações para cada elemento individual antes de os usar
  if (DOMElements.pageInfo) {
    DOMElements.pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
  }
  if (DOMElements.prevPageBtn) {
    DOMElements.prevPageBtn.disabled = currentPage === 1;
  }
  if (DOMElements.nextPageBtn) {
    DOMElements.nextPageBtn.disabled =
      currentPage * rowsPerPage >= totalContracts ||
      currentListSize < rowsPerPage;
  }
}

/**
 * Renderiza a lista de contratos na tabela.
 * @param {Array} contracts - A lista de contratos a ser renderizada.
 * @param {Array} visibleKeys - As chaves das colunas que devem ser visíveis.
 * @param {Function} onViewUpdate - Função para notificar o main.js sobre a ordenação.
 * @param {object} sortState - O estado atual de ordenação (chave e direção).
 */
export function renderContracts(
  contracts,
  visibleKeys = [],
  onViewUpdate,
  sortState
) {
  //  VALIDAÇÃO CRÍTICA: Verificar se elementos DOM existem
  const tableHeader = DOMElements.tableHeader;
  const list = DOMElements.contractList;

  if (!tableHeader) {
    console.error(' renderContracts: elemento #table-header não encontrado no DOM');
    return;
  }

  if (!list) {
    console.error(' renderContracts: elemento #contract-list não encontrado no DOM');
    return;
  }

  // Validação do parâmetro onViewUpdate
  if (typeof onViewUpdate !== 'function') {
    console.warn('renderContracts: onViewUpdate não é uma função válida');
    onViewUpdate = () => {}; // Fallback para evitar erros
  }

  // Adiciona as classes CSS para a ordenação visual
  const getSortClass = (key) => {
    if (sortState.currentSortKey === key) {
      return sortState.currentSortDirection;
    }
    return "";
  };

  // Limpa o cabeçalho e o corpo da tabela antes de renderizar
  tableHeader.innerHTML = `
        <tr>
            <th class="checkbox-column"><input type="checkbox" id="select-all-checkbox" title="Selecionar Todos"/></th>
            ${TABLE_COLUMNS.filter((col) => visibleKeys.includes(col.key))
              .map(
                (col) =>
                  `<th class="sortable ${getSortClass(
                    col.key
                  )}" data-sort-key="${sanitizeAttribute(col.key)}">${escapeHtml(col.label)}</th>`
              )
              .join("")}
            <th>Ações</th>
        </tr>
    `;
  list.innerHTML = ""; // Limpa as linhas anteriores

  // Remove listeners antigos antes de registrar novamente.
  if (renderContractsHeaderClickHandler) {
    tableHeader.removeEventListener("click", renderContractsHeaderClickHandler);
  }

  renderContractsHeaderClickHandler = (event) => {
    const header = event.target.closest(".sortable");
    if (!header) return;
    onViewUpdate({ sortKey: header.dataset.sortKey });
  };

  tableHeader.addEventListener("click", renderContractsHeaderClickHandler);

  // Atualiza o ouvinte do checkbox "Selecionar Todos"
  const selectAllCheckbox = document.getElementById("select-all-checkbox");
  if (selectAllCheckbox) {
    if (renderContractsSelectAllElement && renderContractsSelectAllHandler) {
      renderContractsSelectAllElement.removeEventListener(
        "change",
        renderContractsSelectAllHandler
      );
    }

    renderContractsSelectAllElement = selectAllCheckbox;
    renderContractsSelectAllHandler = (event) => {
      const rowCheckboxes = list.querySelectorAll(".row-checkbox");
      rowCheckboxes.forEach((checkbox) => {
        checkbox.checked = event.target.checked;
      });
      updateBulkActionUI();
    };

    selectAllCheckbox.addEventListener("change", renderContractsSelectAllHandler);
  }

  if (contracts.length === 0) {
    list.innerHTML =
      '<tr><td colspan="' +
      (visibleKeys.length + 2) +
      '">Nenhum contrato encontrado.</td></tr>';
    return;
  }

  contracts.forEach((contract) => {
    const tr = document.createElement("tr");
    
    // Buscar cores do status para aplicar indicador visual
    const statusInfo = getStatusConfigList().find(s => s.text === contract.status);
    const statusBgColor = statusInfo?.bgColor || '#6C757D';
    
    // Adicionar data-attribute com o status para possíveis estilizações CSS
    tr.setAttribute('data-status', contract.status || '');
    
    // Aplicar cor de fundo na linha inteira (suave, 12% opacidade)
    const rowBgColor = hexToRgba(statusBgColor, 0.12);
    tr.style.backgroundColor = rowBgColor;
    tr.style.borderLeft = `5px solid ${statusBgColor}`;
    const safeContractId = sanitizeAttribute(contract.id || "");
    
    tr.innerHTML = `
            <td class="checkbox-column"><input type="checkbox" class="row-checkbox" data-id="${
              safeContractId
            }"></td>
            ${TABLE_COLUMNS.filter((col) => visibleKeys.includes(col.key))
              .map((col) => {
                let value = getContractValueForColumn(contract, col.key);
                if (value === undefined || value === null) {
                  value = "";
                }

                // Se a coluna for a do cliente principal, pegamos o nome do campo clientePrincipal primeiro
                if (col.key === "clientePrincipal") {
                  // PRIORIDADE 1: Campo clientePrincipal direto (dados do CSV)
                  if (contract.clientePrincipal && contract.clientePrincipal.trim() !== '') {
                    value = contract.clientePrincipal;
                  } 
                  // PRIORIDADE 2: Array compradores (dados inseridos manualmente)
                  else if (contract.compradores && contract.compradores.length > 0) {
                    const compradorPrincipal = contract.compradores.find((c) => c.principal) || contract.compradores[0];
                    value = compradorPrincipal ? compradorPrincipal.nome : "Não informado";
                  }
                  // PRIORIDADE 3: Campos de comprador do CSV
                  else if (contract.comprador_1_nome && contract.comprador_1_nome.trim() !== '') {
                    value = contract.comprador_1_nome;
                  }
                  // FALLBACK: Não informado
                  else {
                    value = "Não informado";
                  }
                }

                // Se a coluna for de data, usamos o formatador
                if (col.formatter) {
                  value = col.formatter(contract);
                }

                return `<td>${escapeHtml(value)}</td>`;
              })
              .join("")}
            <td class="actions-cell">
                <button class="details-btn" data-id="${
                  safeContractId
                }">Ver Detalhes</button>
                <button class="delete-btn admin-only" data-id="${
                  safeContractId
                }">Excluir</button>
            </td>
        `;
    list.appendChild(tr);
  });
}

// Função auxiliar para formatar uma data para o formato de input 'datetime-local'
function toInputDateTimeLocal(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== "function") {
    return "";
  }

  const date = timestamp.toDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value._seconds === "number") return new Date(value._seconds * 1000);
  return null;
}

function formatSummaryDate(value) {
  const date = normalizeTimestamp(value);
  if (!date) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// === CEHOP NATO - Campos com multiplas datas ===
const CEHOP_NATO_FIELDS = [
  "conferenciaCehopNatoEntregueEm",
  "conferenciaCehopNatoDevolvidaEm",
  "reenviadoCehop",
];
const CEHOP_NATO_MAX_DATES = 10;

/**
 * Normaliza o valor do campo CEHOP NATO para array.
 * Migra automaticamente valores legados (Timestamp unico) para array.
 */
function normalizeCehopDatesArray(value) {
  if (!value) return [];

  // Ja e um array
  if (Array.isArray(value)) {
    return value
      .filter((item) => item && item.data)
      .sort((a, b) => {
        const dateA = normalizeTimestamp(a.data);
        const dateB = normalizeTimestamp(b.data);
        if (!dateA || !dateB) return 0;
        return dateB.getTime() - dateA.getTime(); // Mais recente primeiro
      });
  }

  // Migracao: Timestamp unico -> Array
  if (typeof value.toDate === "function" || value.seconds || value._seconds) {
    return [{ data: value, registradoPor: null, registradoEm: null }];
  }

  return [];
}

/**
 * Formata uma data CEHOP para exibicao amigavel.
 */
function formatCehopDateDisplay(timestamp) {
  const date = normalizeTimestamp(timestamp);
  if (!date) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Renderiza o historico de datas CEHOP no dropdown especificado.
 */
function renderCehopDatesHistory(fieldId, datesArray) {
  const dropdown = document.getElementById(`${fieldId}-historico`);
  if (!dropdown) return;

  const listContainer = dropdown.querySelector(".cehop-dates-list");
  const emptyMessage = dropdown.querySelector(".cehop-dates-empty");
  const historyBtn = document.querySelector(
    `.btn-cehop-history-toggle[data-field="${fieldId}"]`
  );
  const countBadge = historyBtn?.querySelector(".cehop-history-count");

  const normalizedDates = normalizeCehopDatesArray(datesArray);

  // Atualiza badge de contagem
  if (countBadge) {
    if (normalizedDates.length > 0) {
      countBadge.textContent = normalizedDates.length;
      countBadge.classList.remove("d-none");
    } else {
      countBadge.classList.add("d-none");
    }
  }

  // Mostra/oculta mensagem de vazio
  if (emptyMessage) {
    emptyMessage.classList.toggle("d-none", normalizedDates.length > 0);
  }

  if (!listContainer) return;

  if (normalizedDates.length === 0) {
    listContainer.innerHTML = "";
    return;
  }

  const html = normalizedDates
    .map((item, index) => {
      const dateStr = formatCehopDateDisplay(item.data);
      const isFirst = index === 0;
      const badgeClass = isFirst ? "bg-primary" : "bg-secondary";
      const label = isFirst ? "Atual" : `#${normalizedDates.length - index}`;

      return `
        <div class="cehop-date-item d-flex align-items-center justify-content-between py-1 px-2 mb-1" data-index="${index}">
          <div class="d-flex align-items-center">
            <span class="badge ${badgeClass} me-2">${label}</span>
            <span class="cehop-date-value">${dateStr}</span>
          </div>
          <button type="button" class="btn btn-sm btn-link text-danger p-0 ms-2 btn-remove-cehop-date"
                  data-field="${fieldId}" data-index="${index}" title="Remover esta data">
            <i class="bi bi-x-circle"></i>
          </button>
        </div>
      `;
    })
    .join("");

  listContainer.innerHTML = html;
}

/**
 * Popula o campo CEHOP NATO com array de datas.
 * Exibe a data mais recente no input e o historico no container.
 */
function populateCehopDateField(fieldId, datesArray) {
  const input = document.getElementById(`modal-${fieldId}`);
  if (!input) return;

  const normalizedDates = normalizeCehopDatesArray(datesArray);

  // Data mais recente no input (para visualizacao)
  if (normalizedDates.length > 0) {
    const mostRecent = normalizedDates[0];
    input.value = toInputDateTimeLocal(mostRecent.data);
  } else {
    input.value = "";
  }

  // Renderiza historico
  renderCehopDatesHistory(fieldId, normalizedDates);

  // Armazena array no dataset para uso posterior
  input.dataset.cehopDates = JSON.stringify(normalizedDates);
}

/**
 * Adiciona uma nova data ao array CEHOP NATO.
 * Retorna o novo array (limitado a CEHOP_NATO_MAX_DATES).
 */
function addCehopDate(fieldId, newDateValue, userEmail) {
  const input = document.getElementById(`modal-${fieldId}`);
  if (!input || !newDateValue) return null;

  let currentDates = [];
  try {
    currentDates = JSON.parse(input.dataset.cehopDates || "[]");
  } catch {
    currentDates = [];
  }

  // Cria novo item
  const newItem = {
    data: newDateValue, // Sera convertido para Timestamp no save
    registradoPor: userEmail || null,
    registradoEm: new Date().toISOString(),
  };

  // Adiciona no inicio (mais recente primeiro)
  currentDates.unshift(newItem);

  // Limita ao maximo permitido
  if (currentDates.length > CEHOP_NATO_MAX_DATES) {
    currentDates = currentDates.slice(0, CEHOP_NATO_MAX_DATES);
  }

  // Atualiza dataset e renderiza
  input.dataset.cehopDates = JSON.stringify(currentDates);
  input.dataset.userModified = "true";
  renderCehopDatesHistory(fieldId, currentDates);

  // Limpa o input para nova entrada
  input.value = "";

  return currentDates;
}

/**
 * Remove uma data do array CEHOP NATO pelo indice.
 */
function removeCehopDate(fieldId, index) {
  const input = document.getElementById(`modal-${fieldId}`);
  if (!input) return null;

  let currentDates = [];
  try {
    currentDates = JSON.parse(input.dataset.cehopDates || "[]");
  } catch {
    currentDates = [];
  }

  if (index < 0 || index >= currentDates.length) return currentDates;

  // Remove o item
  currentDates.splice(index, 1);

  // Atualiza dataset e renderiza
  input.dataset.cehopDates = JSON.stringify(currentDates);
  input.dataset.userModified = "true";
  renderCehopDatesHistory(fieldId, currentDates);

  return currentDates;
}

/**
 * Coleta os dados dos campos CEHOP NATO para salvamento.
 * Se houver uma data no input que nao esta no array, adiciona automaticamente.
 */
function getCehopNatoDatesForSave(fieldId) {
  const input = document.getElementById(`modal-${fieldId}`);
  if (!input) return null;

  let currentDates = [];
  try {
    currentDates = JSON.parse(input.dataset.cehopDates || "[]");
  } catch {
    currentDates = [];
  }

  // Se o input tem uma data preenchida, adiciona ao array
  const inputValue = input.value;
  if (inputValue) {
    // Verifica se a data do input ja existe no array
    const inputDateStr = inputValue;
    const alreadyExists = currentDates.some((item) => {
      // Compara a data do item com a data do input
      if (!item.data) return false;
      const itemDateStr =
        typeof item.data === "string"
          ? item.data
          : toInputDateTimeLocal(item.data);
      return itemDateStr === inputDateStr;
    });

    // Se nao existe, adiciona como nova entrada
    if (!alreadyExists) {
      const userEmail = window.userProfile?.email || null;
      const newItem = {
        data: inputValue,
        registradoPor: userEmail,
        registradoEm: new Date().toISOString(),
      };
      currentDates.unshift(newItem);

      // Limita ao maximo permitido
      if (currentDates.length > CEHOP_NATO_MAX_DATES) {
        currentDates = currentDates.slice(0, CEHOP_NATO_MAX_DATES);
      }
    }
  }

  return currentDates;
}

// Exporta funcoes para uso externo
window.cehopNatoUtils = {
  CEHOP_NATO_FIELDS,
  normalizeCehopDatesArray,
  populateCehopDateField,
  renderCehopDatesHistory,
  addCehopDate,
  removeCehopDate,
  getCehopNatoDatesForSave,
};

function setupSummaryLiveListeners() {
  if (setupSummaryLiveListeners.initialized) return;

  const fields = [
    "modal-status",
    "modal-analista",
    "modal-analistaAprovacao",
    "modal-analistaCehop",
    "modal-vendedorConstrutora",
    "modal-empreendimento",
    "modal-apto",
    "modal-bloco",
  ];

  const handler = () => updateDetailsModalSummary();

  fields.forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.addEventListener("change", handler);
    if (element.tagName === "INPUT") {
      element.addEventListener("input", handler);
      element.addEventListener("blur", handler);
    }
  });

  setupSummaryLiveListeners.initialized = true;
}
setupSummaryLiveListeners.initialized = false;

function updateDetailsModalSummary(contractOverride = null) {
  if (contractOverride) {
    currentSummaryContract = contractOverride;
  }

  const baseContract = currentSummaryContract || {};
  const summaryEls = DOMElements.modalSummary || {};

  const setText = (el, value) => {
    if (!el) return;
    const display = value !== undefined && value !== null && String(value).trim() !== "" ? value : "—";
    el.textContent = display;
  };

  const processId =
    baseContract.numeroProcesso ||
    baseContract.numeroContrato ||
    baseContract.codigoProcesso ||
    baseContract.id ||
    DOMElements.modalContractId?.value ||
    "—";
  setText(summaryEls.id, processId);

  const statusSelect = document.getElementById("modal-details-status");
  const statusValue = (statusSelect && statusSelect.value) || baseContract.status || "";

  const statusInfo = getStatusConfigList().find((status) => status.text === statusValue) || null;
  setText(summaryEls.stage, statusInfo?.stage || "—");

  const statusBadge = summaryEls.status;
  if (statusBadge) {
    const slaInfo = computeSLA({ ...baseContract, status: statusValue || baseContract.status });

    const badgeVariants = {
      late: ["badge", "rounded-pill", "fw-semibold", "bg-danger", "text-white"],
      warn: ["badge", "rounded-pill", "fw-semibold", "bg-warning", "text-dark"],
      ok: ["badge", "rounded-pill", "fw-semibold", "bg-success", "text-white"],
      none: ["badge", "rounded-pill", "fw-semibold", "bg-secondary", "text-white"],
    };

    const resolvedVariant = badgeVariants[slaInfo.status] || badgeVariants.none;
    statusBadge.className = resolvedVariant.join(" ");
    statusBadge.textContent = statusValue || "—";
    statusBadge.title = statusInfo
      ? `${statusInfo.order} • ${statusInfo.text}`
      : statusValue || "Sem status";
  }

  if (summaryEls.time) {
    setText(summaryEls.time, calculateTimeInStatus(baseContract));
  }

  if (summaryEls.created) {
    const createdDate = baseContract.criadoEm || baseContract.createdAt;
    setText(summaryEls.created, formatSummaryDate(createdDate));
  }

  if (summaryEls.updated) {
    const lastUpdated =
      baseContract.dataModificacao ||
      baseContract.updatedAt ||
      baseContract.updated_at ||
      baseContract.createdAt;
    setText(summaryEls.updated, formatSummaryDate(lastUpdated));
  }

  const empreendimentoInput = document.getElementById("modal-empreendimento");
  const empreendimentoValue =
    (empreendimentoInput && empreendimentoInput.value.trim()) ||
    baseContract.empreendimento ||
    baseContract.construtora ||
    "";
  setText(summaryEls.empreendimento, empreendimentoValue);

  const blocoInput = document.getElementById("modal-bloco");
  const aptoInput = document.getElementById("modal-apto");
  const blocoValue = (blocoInput && blocoInput.value.trim()) || baseContract.bloco || "";
  const aptoValue = (aptoInput && aptoInput.value.trim()) || baseContract.apto || "";
  const unidade = [blocoValue, aptoValue].filter(Boolean).join(" • ");
  setText(summaryEls.unidade, unidade);

  const analistaSelect = document.getElementById("modal-analista");
  const analistaValue = (analistaSelect && analistaSelect.value) || baseContract.analista || "";
  setText(summaryEls.analista, analistaValue);

  const analistaAprovacaoSelect = document.getElementById("modal-analistaAprovacao");
  const analistaAprovacaoValue =
    (analistaAprovacaoSelect && analistaAprovacaoSelect.value) || baseContract.analistaAprovacao || "";
  setText(summaryEls.analistaAprovacao, analistaAprovacaoValue);

  const analistaCehopSelect = document.getElementById("modal-analistaCehop");
  const analistaCehopValue = (analistaCehopSelect && analistaCehopSelect.value) || baseContract.analistaCehop || "";
  setText(summaryEls.analistaCehop, analistaCehopValue);

  const ultimoAnalistaInput = document.getElementById("modal-ultimoAnalistaAlteracao");
  const ultimoAnalistaValue = (ultimoAnalistaInput && ultimoAnalistaInput.value.trim()) || baseContract.ultimoAnalistaAlteracao || "";
  setText(summaryEls.ultimoAnalistaAlteracao, ultimoAnalistaValue);

  const vendedorInput = document.getElementById("modal-vendedorConstrutora");
  const vendedorValue =
    (vendedorInput && vendedorInput.value.trim()) ||
    baseContract.vendedorConstrutora ||
    baseContract.vendedor ||
    "";
  setText(summaryEls.vendedor, vendedorValue);
}

function resetDetailsFormDirtyState() {
  if (!DOMElements.detailsForm) {
    return;
  }

  DOMElements.detailsForm
    .querySelectorAll("[id^='modal-']")
    .forEach((field) => {
      if (field?.dataset) {
        delete field.dataset.userModified;
      }
    });
}

/**
 * Preenche o formulário do modal com os detalhes de um contrato.
 * @param {object} contract - O objeto do contrato.
 */
/**
 * Preenche o formulário do modal com os detalhes de um contrato.
 * @param {object} contract - O objeto do contrato.
 */
export async function populateDetailsModal(contract, allUsers = []) {
  refreshDetailsModalDOMReferences();
  resetDetailsFormDirtyState();
  DOMElements.detailsForm.reset();

  // Reseta o toggle "Exibir todos os campos" para o estado padrão (desmarcado)
  const showAllFieldsToggle = document.getElementById('details-show-all-fields');
  if (showAllFieldsToggle) {
    showAllFieldsToggle.checked = false;
  }

  // Remove os campos de cliente antigos se eles ainda estiverem no formulário HTML
  const oldClientFields = document.getElementById("modal-cliente");
  if (oldClientFields) {
    oldClientFields.closest(".form-group").remove();
  }
  if (document.getElementById("modal-cpf")) {
    document.getElementById("modal-cpf").closest(".form-group").remove();
  }
  if (document.getElementById("modal-telefone")) {
    document.getElementById("modal-telefone").closest(".form-group").remove();
  }
  if (document.getElementById("modal-emailCliente")) {
    document
      .getElementById("modal-emailCliente")
      .closest(".form-group")
      .remove();
  }

  if (!DOMElements.compradoresContainer) {
    console.error(
      "Erro: O elemento #compradores-container não foi encontrado no DOM."
    );
    return;
  }

  // Atualiza o título do modal com informações do processo
  const modalTitle = document.getElementById("details-modal-title");
  if (modalTitle) {
    const empreendimento = sanitizeStringValue(contract.empreendimento);
    const apto = sanitizeStringValue(contract.apto);
    const bloco = sanitizeStringValue(contract.bloco);

    const aptoLabel = apto ? `Apto ${apto}` : "";
    const blocoLabel = bloco ? `Bloco ${bloco}` : "";

    let compradorPrincipalNome = "";
    let compradorPrincipalCpf = "";

    if (Array.isArray(contract.compradores) && contract.compradores.length > 0) {
      const principal =
        contract.compradores.find((c) => c?.principal) || contract.compradores[0];
      compradorPrincipalNome = sanitizeStringValue(principal?.nome);
      compradorPrincipalCpf = sanitizeStringValue(principal?.cpf);
    } else if (contract.clientePrincipal) {
      compradorPrincipalNome = sanitizeStringValue(contract.clientePrincipal);
    } else if (contract.cliente) {
      compradorPrincipalNome = sanitizeStringValue(contract.cliente);
    }

    if (!compradorPrincipalCpf) {
      compradorPrincipalCpf = sanitizeStringValue(
        contract.cpfPrincipal || contract.comprador_1_cpf || contract.cpf
      );
    }

    const cpfDigits = compradorPrincipalCpf.replace(/\D/g, "");
    const cpfPrincipalFormatado =
      cpfDigits.length === 11 ? formatCPF(cpfDigits) : compradorPrincipalCpf;

    const partesSubtitulo = [
      empreendimento
        ? `<span class="empreendimento-name">${escapeHtmlLight(empreendimento)}</span>`
        : "",
      aptoLabel
        ? `<span class="unidade-name">${escapeHtmlLight(aptoLabel)}</span>`
        : "",
      blocoLabel
        ? `<span class="unidade-name">${escapeHtmlLight(blocoLabel)}</span>`
        : "",
      compradorPrincipalNome
        ? `<span class="cliente-name">${escapeHtmlLight(compradorPrincipalNome)}</span>`
        : "",
      cpfPrincipalFormatado
        ? `<span class="cliente-cpf">${escapeHtmlLight(cpfPrincipalFormatado)}</span>`
        : "",
    ].filter(Boolean);

    const subtituloHtml = partesSubtitulo.join(
      '<span class="details-modal-title-separator" aria-hidden="true"> - </span>'
    );

    modalTitle.innerHTML = `
      <i class="bi bi-file-earmark-text details-modal-title-icon"></i>
      <span class="details-modal-title-label">Detalhes do Processo</span>
      ${subtituloHtml ? `<div class="details-modal-title-meta">${subtituloHtml}</div>` : ""}
    `;
  }

  initializeWhatsAppTabForContract(contract);
  currentSummaryContract = contract || {};

  //  LÓGICA DE STATUS BASEADA EM WORKFLOW 
  let statusList = getStatusConfigList();
  
  if (contract.workflowId) {
    try {
      const wf = await workflowService.getWorkflowById(contract.workflowId);
      // Só usa estágios personalizados se eles existirem E não estiverem vazios
      // Para workflows padrão (Individual/Associativo) sem estágios definidos, usa o global
      if (wf && wf.stages && wf.stages.length > 0) {
        // Mapeia strings de estágio para objetos de status completos (preservando cores/ordem se possível)
        const globalStatuses = getStatusConfigList();

        const mappedStatuses = wf.stages.map((stageName, index) => {
          // Tenta encontrar metadados no global
          const globalMatch = globalStatuses.find(s => s.text === stageName);

          return {
            text: stageName,
            order: globalMatch ? globalMatch.order : (index + 1),
            stage: globalMatch ? globalMatch.stage : ('Etapa ' + (index + 1)),
            color: globalMatch ? globalMatch.color : null,
            bgColor: globalMatch ? globalMatch.bgColor : null
          };
        });

        // Deduplicar por texto e ordenar por order
        const seen = new Set();
        statusList = mappedStatuses
          .filter(s => {
            if (seen.has(s.text)) return false;
            seen.add(s.text);
            return true;
          })
          .sort((a, b) => (a.order || 0) - (b.order || 0));
      }
    } catch (e) {
      console.warn('Erro ao carregar workflow específico:', e);
    }
  }

  //  AQUI ESTÁ A LÓGICA PARA POPULAR O SELECT DE STATUS 
  const statusSelect = document.getElementById("modal-details-status");
  if (statusSelect) {
    statusSelect.innerHTML = ""; // Limpa as opções existentes
    statusList.forEach((statusInfo) => {
      const option = document.createElement("option");
      option.value = statusInfo.text;
      option.textContent = `${statusInfo.order} - ${statusInfo.text}`;
      statusSelect.appendChild(option);
    });
    
    //  GARANTIA: Define o valor do contrato e força a atualização
    const currentStatus = contract.status || "";
    statusSelect.value = currentStatus;
    
    // Verificação extra: se o valor não foi definido corretamente, tenta novamente
    if (statusSelect.value !== currentStatus && currentStatus) {
      console.warn(`Status "${currentStatus}" não encontrado nas opções. Valores disponíveis:`, 
        Array.from(statusSelect.options).map(opt => opt.value));
      
      // Fallback: Adiciona o status atual se ele não existir na lista (para não quebrar a UI)
      const option = document.createElement("option");
      option.value = currentStatus;
      option.textContent = `? - ${currentStatus}`;
      statusSelect.appendChild(option);
      statusSelect.value = currentStatus;
    }
  }

  //  NOVO: Renderiza todos os botões de status com o estilo correto 
  const statusActionContainer = document.getElementById(
    "status-action-container"
  );
  if (statusActionContainer) {
    statusActionContainer.innerHTML = ""; // Limpa os botões anteriores

    statusList.forEach((statusInfo) => {
      const button = document.createElement("button");
      button.type = "button"; // Impede que o botão envie o formulário
      button.className = "status-btn status-change-btn";
      button.dataset.status = statusInfo.text; // Guarda o nome do status no botão
      button.textContent = statusInfo.text;

      // Adiciona a classe 'active' se for o status atual do contrato
      if (statusInfo.text === contract.status) {
        button.classList.add("active");
        
        // Aplica cores personalizadas se definidas
        if (statusInfo.color) {
          button.style.color = statusInfo.color;
        }
        if (statusInfo.bgColor) {
          button.style.backgroundColor = statusInfo.bgColor;
          button.style.borderColor = statusInfo.bgColor;
        }
      } else {
        button.classList.add("inactive");
      }

      statusActionContainer.appendChild(button);
    });
  }

  // 1. Preenchimento de campos fixos e de dados principais.
  DOMElements.modalContractId.value = contract.id || "";
  document.getElementById("modal-entrada").value =
    contract.entrada && typeof contract.entrada.toDate === "function"
      ? contract.entrada.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-analista").value = contract.analista || "";
  document.getElementById("modal-analistaAprovacao").value = contract.analistaAprovacao || "";
  const vendedorInput = document.getElementById("modal-vendedorConstrutora");
  const empreendimentoInput = document.getElementById("modal-empreendimento");

  if (window.__DEBUG__) {
    console.debug(
      "[detailsModal] Populando vendedor",
      contract.vendedorConstrutora || "(vazio)"
    );
    console.debug(
      "[detailsModal] Populando empreendimento",
      contract.empreendimento || "(vazio)"
    );
  }

  const normalizeModalValue = (value) =>
    typeof value === "string" ? value.trim() : "";

  const ensureLegacySelectOption = (selectEl, rawValue) => {
    if (!selectEl || selectEl.tagName !== "SELECT") {
      return normalizeModalValue(rawValue);
    }

    const value = normalizeModalValue(rawValue);
    if (!value) return "";

    const target = value.toLowerCase();
    const existing = Array.from(selectEl.options || []).find(
      (option) => normalizeModalValue(option.value).toLowerCase() === target
    );

    if (existing) return existing.value;

    const option = document.createElement("option");
    option.value = value;
    option.textContent = `${value} (legado)`;
    option.dataset.legacy = "true";
    selectEl.appendChild(option);
    return option.value;
  };

  if (vendedorInput) {
    const vendorValue = normalizeModalValue(contract.vendedorConstrutora || "");
    vendedorInput.dataset.preferredValue = vendorValue;
    vendedorInput.value = ensureLegacySelectOption(vendedorInput, vendorValue);
  }

  if (empreendimentoInput) {
    const empreendimentoValue = normalizeModalValue(contract.empreendimento || "");
    empreendimentoInput.dataset.preferredValue = empreendimentoValue;
    empreendimentoInput.value = ensureLegacySelectOption(
      empreendimentoInput,
      empreendimentoValue
    );

    if (window.__VENDORS_INLINE__?.refreshFields) {
      window.__VENDORS_INLINE__.refreshFields();
    } else if (window.__VENDORS_INLINE__?.refreshSelects) {
      // Compatibilidade com implementacoes antigas da integracao de vendors.
      window.__VENDORS_INLINE__.refreshSelects();
    }

    if (window.__DEBUG__) {
      console.debug(
        "[detailsModal] Empreendimento após atribuição",
        empreendimentoInput.value || "(vazio)"
      );
    }

    if (contract.empreendimento) {
      const reapplyValue = () => {
        if (!empreendimentoInput.value) {
          empreendimentoInput.value = ensureLegacySelectOption(
            empreendimentoInput,
            contract.empreendimento
          );
          if (window.__DEBUG__) {
            console.debug(
              "[detailsModal] Empreendimento reaplicado após interferência externa",
              empreendimentoInput.value
            );
          }
        }
      };

      if (typeof queueMicrotask === "function") {
        queueMicrotask(reapplyValue);
      } else {
        setTimeout(reapplyValue, 0);
      }
    }
  }
  document.getElementById("modal-apto").value = contract.apto || "";
  document.getElementById("modal-bloco").value = contract.bloco || "";
  document.getElementById("modal-pesquisas").value = contract.pesquisas || "";
  document.getElementById("modal-enderecoImovel").value =
    contract.enderecoImovel || "";
  document.getElementById("modal-cidadeImovel").value =
    contract.cidadeImovel || "";
  document.getElementById("modal-ufImovel").value = contract.ufImovel || "";
  document.getElementById("modal-cepImovel").value = contract.cepImovel || "";
  document.getElementById("modal-inscricaoImobiliaria").value =
    contract.inscricaoImobiliaria || contract.indicacaoFiscal || "";
  document.getElementById("modal-matriculaImovel").value =
    contract.matriculaImovel || contract.matricula || "";
  document.getElementById("modal-areaTerreno").value =
    contract.areaTerreno || "";
  document.getElementById("modal-areaConstruida").value =
    contract.areaConstruida || "";
  const valorContratoBancoCompat =
    contract.valorContratoBanco ||
    contract.valorContratoFinanciamento ||
    contract.valorFinanciamento ||
    contract.valorDeclaradoTransacao ||
    "";
  document.getElementById("modal-valorContrato").value =
    contract.valorContrato || valorContratoBancoCompat;
  const valorAvaliacao = contract.valorAvaliacao ?? contract.valorAvaliacaoImovel;
  document.getElementById("modal-valorAvaliacao").value =
    valorAvaliacao !== null && valorAvaliacao !== undefined
      ? String(valorAvaliacao)
      : "";
  document.getElementById("modal-valorNegociadoConstrutora").value =
    contract.valorNegociadoConstrutora || "";
  document.getElementById("modal-valorContratoBanco").value =
    valorContratoBancoCompat;
  const valorRecursosProprios =
    contract.valorRecursosProprios ?? contract.recursosProprios;
  document.getElementById("modal-valorRecursosProprios").value =
    valorRecursosProprios !== null && valorRecursosProprios !== undefined
      ? String(valorRecursosProprios)
      : "";
  const valorFgts = contract.valorFgts ?? contract.valorFGTS;
  document.getElementById("modal-valorFgts").value =
    valorFgts !== null && valorFgts !== undefined ? String(valorFgts) : "";
  const valorSubsidio = contract.valorSubsidio ?? contract.subsidio;
  document.getElementById("modal-valorSubsidio").value =
    valorSubsidio !== null && valorSubsidio !== undefined
      ? String(valorSubsidio)
      : "";
  document.getElementById("modal-tipoImovel").value = contract.tipoImovel || "";

  // Preenche o dropdown de analistas
  populateAnalystDropdown(allUsers, contract.analista);

  // Preenche o dropdown de analista de aprovacao
  populateAnalistaAprovacaoDropdown(allUsers, contract.analistaAprovacao);
  
  // Preenche o dropdown de analista CEHOP
  populateAnalistaCehopDropdown(allUsers, contract.analistaCehop);
  
  // Preenche o campo de último analista que fez alteração (readonly)
  let ultimoAnalistaDisplay = "";
  if (contract.ultimoAnalistaAlteracao) {
    // Usa o valor já salvo (prioridade: shortName > fullName > email)
    ultimoAnalistaDisplay = contract.ultimoAnalistaAlteracao;
  } else if (contract.modificadoPor && allUsers.length > 0) {
    // Para contratos antigos sem o campo, busca o nome do usuário pelo email
    const usuario = allUsers.find(u => u.email === contract.modificadoPor);
    if (usuario) {
      ultimoAnalistaDisplay = usuario.shortName || usuario.fullName || contract.modificadoPor;
    } else {
      ultimoAnalistaDisplay = contract.modificadoPor;
    }
  }
  document.getElementById("modal-ultimoAnalistaAlteracao").value = ultimoAnalistaDisplay;
  
  setupSummaryLiveListeners();
  updateDetailsModalSummary(contract);

  // 2. Preenchimento da aba Formulários e CEHOP.
  document.getElementById("modal-renda").value = contract.renda || "";
  document.getElementById("modal-validacao").value = contract.validacao || "";
  document.getElementById("modal-fgts").value =
    contract.fgts !== null && contract.fgts !== undefined
      ? String(contract.fgts)
      : "";
  document.getElementById("modal-casaFacil").value =
    contract.casaFacil !== null && contract.casaFacil !== undefined
      ? String(contract.casaFacil)
      : "";
  document.getElementById("modal-certificadora").value =
    contract.certificadora || "";
  document.getElementById("modal-certificacaoSolicEm").value =
    contract.certificacaoSolicEm &&
    typeof contract.certificacaoSolicEm.toDate === "function"
      ? contract.certificacaoSolicEm.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-certificacaoRealizadaEm").value =
    contract.certificacaoRealizadaEm &&
    typeof contract.certificacaoRealizadaEm.toDate === "function"
      ? toInputDateTimeLocal(contract.certificacaoRealizadaEm)
      : "";
  document.getElementById("modal-solicitacaoCohapar").value =
    contract.solicitacaoCohapar &&
    typeof contract.solicitacaoCohapar.toDate === "function"
      ? contract.solicitacaoCohapar.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-cohaparAprovada").value =
    contract.cohaparAprovada &&
    typeof contract.cohaparAprovada.toDate === "function"
      ? contract.cohaparAprovada.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-sehab").value = contract.sehab || "";
  document.getElementById("modal-espelhoEnviado").value =
    contract.espelhoEnviado &&
    typeof contract.espelhoEnviado.toDate === "function"
      ? contract.espelhoEnviado.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-ccsAprovada").value =
    contract.ccsAprovada &&
    typeof contract.ccsAprovada.toDate === "function"
      ? contract.ccsAprovada.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-produto").value =
    contract.produto || "";
  document.getElementById("modal-vencSicaq").value =
    contract.vencSicaq && typeof contract.vencSicaq.toDate === "function"
      ? contract.vencSicaq.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-formulariosEnviadosEm").value =
    contract.formulariosEnviadosEm &&
    typeof contract.formulariosEnviadosEm.toDate === "function"
      ? toInputDateTimeLocal(contract.formulariosEnviadosEm)
      : "";
  document.getElementById("modal-formulariosAssinadosEm").value =
    contract.formulariosAssinadosEm &&
    typeof contract.formulariosAssinadosEm.toDate === "function"
      ? toInputDateTimeLocal(contract.formulariosAssinadosEm)
      : "";
  document.getElementById("modal-entregueCehop").value =
    contract.entregueCehop &&
    typeof contract.entregueCehop.toDate === "function"
      ? toInputDateTimeLocal(contract.entregueCehop)
      : "";
  document.getElementById("modal-enviadoACehop").value =
    contract.enviadoACehop &&
    typeof contract.enviadoACehop.toDate === "function"
      ? toInputDateTimeLocal(contract.enviadoACehop)
      : "";
  // Campo Reenviado CEHOP com suporte a multiplas datas
  populateCehopDateField("reenviadoCehop", contract.reenviadoCehop);
  document.getElementById("modal-conformeEm").value =
    contract.conformeEm && typeof contract.conformeEm.toDate === "function"
      ? toInputDateTimeLocal(contract.conformeEm)
      : "";
  document.getElementById("modal-contratoCef").value =
    contract.contratoCef && typeof contract.contratoCef.toDate === "function"
      ? toInputDateTimeLocal(contract.contratoCef)
      : "";
  document.getElementById("modal-entrevistaCef").value =
    contract.entrevistaCef && typeof contract.entrevistaCef.toDate === "function"
      ? toInputDateTimeLocal(contract.entrevistaCef)
      : "";
  document.getElementById("modal-agencia").value = contract.agencia || "";
  document.getElementById("modal-gerente").value = contract.gerente || "";
  document.getElementById("modal-corretor").value = contract.corretor || "";
  document.getElementById("modal-faltaFinalizar").value = contract.faltaFinalizar || "";
  document.getElementById("modal-montagemComplementar").value = contract.montagemComplementar || "";
  document.getElementById("modal-montagemCehop").value = contract.montagemCehop || "";
  document.getElementById("modal-preEntrevista").value = contract.preEntrevista || "";
  // Campos CEHOP NATO com suporte a multiplas datas
  populateCehopDateField(
    "conferenciaCehopNatoEntregueEm",
    contract.conferenciaCehopNatoEntregueEm
  );
  populateCehopDateField(
    "conferenciaCehopNatoDevolvidaEm",
    contract.conferenciaCehopNatoDevolvidaEm
  );
  document.getElementById("modal-imobiliaria").value = contract.imobiliaria || "";
  document.getElementById("modal-certidaoAtualizada").value = contract.certidaoAtualizada || "";
  document.getElementById("modal-declaracaoEstadoCivil").value = contract.declaracaoEstadoCivil || "";
  document.getElementById("modal-minutaRecebida").value =
    contract.minutaRecebida &&
    typeof contract.minutaRecebida.toDate === "function"
      ? contract.minutaRecebida.toDate().toISOString().split("T")[0]
      : "";

  //  NOVO: Campo Tipo de Processo (Workflow)
  const workflowSelect = document.getElementById("modal-workflowId");
  if (workflowSelect) {
    workflowSelect.innerHTML = '<option value="">Carregando...</option>';
    
    try {
      // Busca workflows (usa cache interno do serviço)
      const allWorkflows = await workflowService.getAllWorkflows();
      
      workflowSelect.innerHTML = '<option value="">Padrão (Sistema)</option>';
      
      allWorkflows.forEach(wf => {
        const option = document.createElement('option');
        option.value = wf.id;
        option.textContent = wf.name;
        workflowSelect.appendChild(option);
      });

      const resolvedWorkflow = resolveContractWorkflow(contract);
      console.log(` Debug Workflow Modal: Raw ID=${contract.workflowId}, Raw Type=${contract.workflowType}, Resolved=${resolvedWorkflow}`);

      if (resolvedWorkflow) {
        const matchingOption = Array.from(workflowSelect.options).find(
          (option) => option.value.toLowerCase() === resolvedWorkflow
        );

        if (matchingOption) {
          workflowSelect.value = matchingOption.value;
        } else {
          // Se não houver opção correspondente, mantém o fallback visual mas não altera valor
          console.warn(` Workflow '${resolvedWorkflow}' não encontrado nas opções atuais.`);
          workflowSelect.value = '';
        }
      } else {
        workflowSelect.value = '';
      }

      // Fallback para padrão 'individual' se nada selecionado, mantendo compatibilidade
      if (!workflowSelect.value) {
        const defaultOption = Array.from(workflowSelect.options).find(
          (option) => option.value === 'individual'
        );
        if (defaultOption) {
          workflowSelect.value = defaultOption.value;
        }
      }

      console.log(` Workflow selecionado no modal: ${workflowSelect.value}`);
      
    } catch (e) {
      console.warn("Erro ao carregar workflows no modal:", e);
      workflowSelect.innerHTML = '<option value="">Erro ao carregar</option>';
    }
  }

  // 3. Preenchimento da aba Registro.
  const consultaKeyState = getConsultaKeyState(contract || {});
  const consultaDisplayKey =
    consultaKeyState.expectedKey ||
    consultaKeyState.currentKey ||
    normalizeConsultaKeyValue(contract.chaveConsulta || "");
  document.getElementById("modal-nContratoCEF").value =
    contract.nContratoCEF || "";
  document.getElementById("modal-codigoCCA").value =
    consultaKeyState.codigoCCA || "";
  document.getElementById("modal-tipoConsulta").value =
    consultaKeyState.tipoConsulta || "";
  document.getElementById("modal-chaveConsulta").value =
    consultaDisplayKey;
  document.getElementById("modal-dataMinuta").value =
    contract.dataMinuta && typeof contract.dataMinuta.toDate === "function"
      ? contract.dataMinuta.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-dataAssinaturaCliente").value =
    contract.dataAssinaturaCliente &&
    typeof contract.dataAssinaturaCliente.toDate === "function"
      ? contract.dataAssinaturaCliente.toDate().toISOString().split("T")[0]
      : "";
  const formulariosCodigoCCA = document.getElementById("details-formularios-codigoCCA");
  if (formulariosCodigoCCA) {
    formulariosCodigoCCA.value = consultaKeyState.codigoCCA || "";
  }
  const formulariosContrato = document.getElementById("details-formularios-nContratoCEF");
  if (formulariosContrato) {
    formulariosContrato.value = contract.nContratoCEF || "";
  }
  const formulariosTipoConsulta = document.getElementById("details-formularios-tipoConsulta");
  if (formulariosTipoConsulta) {
    formulariosTipoConsulta.value = consultaKeyState.tipoConsulta || "";
  }
  const formulariosChave = document.getElementById("details-formularios-chaveConsulta");
  if (formulariosChave) {
    formulariosChave.value = consultaDisplayKey;
  }
  const formulariosAssinatura = document.getElementById("details-formularios-dataAssinaturaCliente");
  if (formulariosAssinatura) {
    formulariosAssinatura.value = document.getElementById("modal-dataAssinaturaCliente").value;
  }
  document.getElementById("modal-enviadoVendedor").value =
    contract.enviadoVendedor &&
    typeof contract.enviadoVendedor.toDate === "function"
      ? contract.enviadoVendedor.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-retornoVendedor").value =
    contract.retornoVendedor &&
    typeof contract.retornoVendedor.toDate === "function"
      ? contract.retornoVendedor.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-enviadoAgencia").value =
    contract.enviadoAgencia &&
    typeof contract.enviadoAgencia.toDate === "function"
      ? contract.enviadoAgencia.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-retornoAgencia").value =
    contract.retornoAgencia &&
    typeof contract.retornoAgencia.toDate === "function"
      ? contract.retornoAgencia.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-iptu").value = contract.iptu || "";
  document.getElementById("modal-cartorio").value = contract.cartorio || "";
  document.getElementById("modal-solicitaITBI").value =
    contract.solicitaITBI && typeof contract.solicitaITBI.toDate === "function"
      ? contract.solicitaITBI.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-retiradaITBI").value =
    contract.retiradaITBI && typeof contract.retiradaITBI.toDate === "function"
      ? contract.retiradaITBI.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-valorITBI").value = contract.valorITBI || "";
  document.getElementById("modal-enviadoPgtoItbi").value =
    contract.enviadoPgtoItbi &&
    typeof contract.enviadoPgtoItbi.toDate === "function"
      ? contract.enviadoPgtoItbi.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-retornoPgtoItbi").value =
    contract.retornoPgtoItbi &&
    typeof contract.retornoPgtoItbi.toDate === "function"
      ? contract.retornoPgtoItbi.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-formaPagamentoRi").value =
    contract.formaPagamentoRi || "";
  document.getElementById("modal-valorDepositoRi").value =
    contract.valorDepositoRi || "";
  document.getElementById("modal-dataEntradaRegistro").value =
    contract.dataEntradaRegistro &&
    typeof contract.dataEntradaRegistro.toDate === "function"
      ? contract.dataEntradaRegistro.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-protocoloRi").value =
    contract.protocoloRi || "";
  document.getElementById("modal-dataAnaliseRegistro").value =
    contract.dataAnaliseRegistro &&
    typeof contract.dataAnaliseRegistro.toDate === "function"
      ? contract.dataAnaliseRegistro.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-dataPrevistaRegistro").value =
    contract.dataPrevistaRegistro &&
    typeof contract.dataPrevistaRegistro.toDate === "function"
      ? contract.dataPrevistaRegistro.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-dataRetornoRi").value =
    contract.dataRetornoRi &&
    typeof contract.dataRetornoRi.toDate === "function"
      ? contract.dataRetornoRi.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-valorFunrejus").value =
    contract.valorFunrejus || "";
  document.getElementById("modal-dataSolicitacaoFunrejus").value =
    contract.dataSolicitacaoFunrejus &&
    typeof contract.dataSolicitacaoFunrejus.toDate === "function"
      ? contract.dataSolicitacaoFunrejus.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-dataEmissaoFunrejus").value =
    contract.dataEmissaoFunrejus &&
    typeof contract.dataEmissaoFunrejus.toDate === "function"
      ? contract.dataEmissaoFunrejus.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-funrejusEnviadoPgto").value =
    contract.funrejusEnviadoPgto &&
    typeof contract.funrejusEnviadoPgto.toDate === "function"
      ? contract.funrejusEnviadoPgto.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-funrejusRetornoPgto").value =
    contract.funrejusRetornoPgto &&
    typeof contract.funrejusRetornoPgto.toDate === "function"
      ? contract.funrejusRetornoPgto.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-valorFinalRi").value =
    contract.valorFinalRi || "";
  document.getElementById("modal-dataRetiradaContratoRegistrado").value =
    contract.dataRetiradaContratoRegistrado &&
    typeof contract.dataRetiradaContratoRegistrado.toDate === "function"
      ? contract.dataRetiradaContratoRegistrado
          .toDate()
          .toISOString()
          .split("T")[0]
      : "";
  document.getElementById("modal-dataEnvioLiberacaoGarantia").value =
    contract.dataEnvioLiberacaoGarantia &&
    typeof contract.dataEnvioLiberacaoGarantia.toDate === "function"
      ? contract.dataEnvioLiberacaoGarantia.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-dataConformidadeCehop").value =
    contract.dataConformidadeCehop &&
    typeof contract.dataConformidadeCehop.toDate === "function"
      ? contract.dataConformidadeCehop.toDate().toISOString().split("T")[0]
      : "";

  // 4. Preenchimento da aba Fechamento.
  document.getElementById("modal-valorDespachante").value =
    contract.valorDespachante || "";
  document.getElementById("modal-dataEmissaoNF").value =
    contract.dataEmissaoNF &&
    typeof contract.dataEmissaoNF.toDate === "function"
      ? contract.dataEmissaoNF.toDate().toISOString().split("T")[0]
      : "";
  document.getElementById("modal-documentacaoRepasse").value =
    contract.documentacaoRepasse || "";

  // 5. Preenchimento de campos dinâmicos (Compradores, Gastos e Repasses).
  //  NOVA LÓGICA: Compatibilidade com dados CSV e compradores manuais
  let compradores = [];

  if (Array.isArray(contract.compradores) && contract.compradores.length > 0) {
    compradores = prepareCompradoresForDisplay(contract.compradores);
  } else {
    const reconstruidos = [];

    for (let i = 1; i <= 4; i++) {
      const nomeField = `comprador_${i}_nome`;
      const cpfField = `comprador_${i}_cpf`;
      const emailField = `comprador_${i}_email`;
      const telefoneField = `comprador_${i}_telefone`;
      const principalField = `comprador_${i}_principal`;

      const nome = sanitizeStringValue(contract[nomeField]);
      if (nome) {
        const flagPrincipal = sanitizeStringValue(contract[principalField]).toLowerCase();
        reconstruidos.push({
          nome,
          cpf: sanitizeStringValue(contract[cpfField]),
          email: sanitizeStringValue(contract[emailField]),
          telefone: sanitizeStringValue(contract[telefoneField]),
          principal:
            flagPrincipal === "1" ||
            flagPrincipal === "true" ||
            flagPrincipal === "sim" ||
            i === 1,
        });
      }
    }

    if (
      reconstruidos.length === 0 &&
      sanitizeStringValue(contract.clientePrincipal)
    ) {
      reconstruidos.push({
        nome: sanitizeStringValue(contract.clientePrincipal),
        cpf: sanitizeStringValue(contract.cpf),
        email: sanitizeStringValue(contract.emailCliente || contract.email),
        telefone: sanitizeStringValue(contract.telefone || contract.celular),
        principal: true,
      });
    } else if (
      reconstruidos.length === 0 &&
      sanitizeStringValue(contract.cliente)
    ) {
      reconstruidos.push({
        nome: sanitizeStringValue(contract.cliente),
        cpf: sanitizeStringValue(contract.cpf),
        email: sanitizeStringValue(contract.emailCliente || contract.email),
        telefone: sanitizeStringValue(contract.telefone || contract.celular),
        principal: true,
      });
    }

    if (reconstruidos.length === 0) {
      reconstruidos.push({ nome: "", cpf: "", email: "", telefone: "", principal: true });
    }

    compradores = prepareCompradoresForDisplay(reconstruidos);
  }

  if (compradores.length === 0) {
    compradores = [{ nome: "", cpf: "", email: "", telefone: "", principal: true }];
  }

  debug(" Compradores detectados no modal:", compradores);

  DOMElements.compradoresContainer.innerHTML = "";
  compradores.forEach((comprador, index) => {
    const compradorElement = createCompradorFields(comprador, index);
    DOMElements.compradoresContainer.appendChild(compradorElement);
  });
  const hasPrincipal = compradores.some((c) => c.principal);
  if (!hasPrincipal && compradores.length > 0) {
    DOMElements.compradoresContainer.querySelector(
      'input[data-field="principal"]'
    ).checked = true;
  }

  // Compradores abre em modo leitura por padrão.
  setCompradoresEditMode(false);

  const gastosContainer = document.getElementById(
    "gastos-adicionais-container"
  );
  gastosContainer.innerHTML = "";
  if (contract.gastosAdicionais && Array.isArray(contract.gastosAdicionais)) {
    contract.gastosAdicionais.forEach((gasto) => {
      gastosContainer.appendChild(createGastoRow(gasto));
    });
  }

  const repassesContainer = document.getElementById("repasses-container");
  repassesContainer.innerHTML = "";
  if (contract.repasses && Array.isArray(contract.repasses)) {
    contract.repasses.forEach((repasse) => {
      repassesContainer.appendChild(createRepasseRow(repasse));
    });
  }

  updateFechamentoCalculations();

  renderRequirementsUI(contract, { notify: showNotification });

  // Lazy loading: anexos são carregados apenas quando a aba for clicada
  // Reseta o estado de anexos para o novo contrato
  resetAnexosTabState();

  // Lazy loading: erros (QA) são carregados apenas quando a aba for clicada
  resetErrosTabState();
  startErrosBadgeListenerForCurrentContract();

  // 6. Preenchimento de Anotações.
  const historicoDiv = document.getElementById("anotacoes-historico");
  historicoDiv.innerHTML = "";
  const currentUserEmail = auth.currentUser?.email || null;
  if (contract.anotacoes && Array.isArray(contract.anotacoes)) {
    contract.anotacoes.forEach((anotacao) => {
      historicoDiv.appendChild(renderAnotacaoEntry(anotacao, currentUserEmail));
    });
  } else {
    let textoAntigo = "";
    if (contract.anotacoes) textoAntigo += contract.anotacoes;
    if (contract.observacoes)
      textoAntigo += `\n\n--- OBSERVAÇÕES ANTIGAS ---\n` + contract.observacoes;
    if (textoAntigo.trim() !== "") {
      const anotacaoAntiga = {
        texto: textoAntigo,
        usuario: "Sistema (Dados Migrados)",
        data: contract.dataModificacao || new Date(),
      };
      historicoDiv.appendChild(renderAnotacaoEntry(anotacaoAntiga, currentUserEmail));
    }
  }

  // 7. Exibição final.
  // Resetar o estado da visualização de status para "mostrar próximos" (visão focada)
  const toggleBtn = document.getElementById("toggle-status-view-btn");
  if (toggleBtn) {
    // 1. O texto inicial agora oferece a opção de ver tudo
    toggleBtn.textContent = "Mostrar todos";
  }
  // 2. Inicia mostrando apenas os botões relevantes
  toggleStatusButtonVisibility(contract.status, true);

  // Aplica visibilidade de campos por status (por padrão, visão focada)
  await applyDetailsFieldVisibility(contract.status, false);

  //  Abrir modal usando Bootstrap API - USAR SELETOR STRING em vez de elemento
  const modalEl = document.getElementById('details-modal');
  if (!modalEl?.dataset.errosQaCleanupBound) {
    modalEl?.addEventListener('hidden.bs.modal', () => {
      resetErrosTabState();
    });
    if (modalEl) {
      modalEl.dataset.errosQaCleanupBound = '1';
    }
  }
  if (!modalEl) {
    console.error('[UI]  Modal #details-modal não encontrado no DOM!');
    return;
  }

  // Debug do estado do modal ANTES de tentar abrir
  if (window.__DEBUG__) {
    console.log('[DEBUG Details Modal] Estado ANTES de show():', {
      exists: !!modalEl,
      parentNode: modalEl.parentNode?.nodeName,
      display: window.getComputedStyle(modalEl).display,
      visibility: window.getComputedStyle(modalEl).visibility,
      classes: modalEl.className,
      hasBackdrop: !!document.querySelector('.modal-backdrop')
    });
  }

  const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl, {
    backdrop: true,
    keyboard: true,
    focus: true
  });

  if (window.__DEBUG__) {
    console.log('[DEBUG Details Modal] Instância Bootstrap:', {
      exists: !!modalInstance,
      isShown: modalInstance._isShown
    });
  }

  // Resetar scroll do modal-body para o topo sempre que abrir
  modalEl.addEventListener('show.bs.modal', function resetScroll() {
    const modalBody = modalEl.querySelector('.modal-body');
    if (modalBody) {
      modalBody.scrollTop = 0;
      if (window.__DEBUG__) {
        console.log('[Details Modal] Scroll resetado para topo');
      }
    }
  }, { once: true });

  // Popula select de agências antes de mostrar o modal
  if (window.agenciasUI && typeof window.agenciasUI.populateAgenciaSelect === 'function') {
    await window.agenciasUI.populateAgenciaSelect();
  }

  modalInstance.show();

  // Debug de backdrop e modal após abrir
  if (window.__DEBUG__) {
    setTimeout(() => {
      const backdrop = document.querySelector('.modal-backdrop');
      console.log('[DEBUG Details Modal] Estado APÓS show():', {
        modalDisplay: window.getComputedStyle(modalEl).display,
        modalClasses: modalEl.className,
        backdropExists: !!backdrop,
        backdropClasses: backdrop?.className,
        bodyClasses: document.body.className
      });
    }, 100);
  }

  // Força atualização dos labels do form-floating no primeiro frame
  requestAnimationFrame(() => {
    const floatingContainers = DOMElements.detailsModal.querySelectorAll('.form-floating');
    floatingContainers.forEach(container => {
      const input = container.querySelector('input, select');
      const label = container.querySelector('label');
      
      if (input && label) {
        if (input.value && input.value.trim() !== '') {
          container.classList.add('has-value');
          label.classList.add('floating-active');
        } else {
          container.classList.remove('has-value');
          label.classList.remove('floating-active');
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });

  // Garante tabs e labels preparados após abrir
  setupTabs();
  setupFormFloatingLabels();

}

/**
 * Controla a visibilidade de campos no modal de detalhes com base no status.
 * Considera apenas campos nas abas "Formulários" e "Registro".
 * @param {string} statusName
 * @param {boolean} showAll - quando true, exibe todos os campos nas abas alvo
 */
export async function applyDetailsFieldVisibility(statusName, showAll = false) {
  try {
    const scopeIds = ['tab-formularios', 'tab-registro'];
    const fieldItems = [];
    const seen = new Set();
    scopeIds.forEach((sid) => {
      const container = document.getElementById(sid);
      if (!container) return;
      container.querySelectorAll('input, select, textarea').forEach((el) => {
        if (!el.id || !el.id.startsWith('modal-')) return;
        if (seen.has(el.id)) return;
        seen.add(el.id);
        const wrapper = el.closest('.form-group, .form-floating, .inline-suggest-wrapper') || el.parentElement;
        fieldItems.push({ id: el.id, el, wrapper });
      });
    });

    if (showAll) {
      fieldItems.forEach(({ el, wrapper }) => {
        if (wrapper) wrapper.classList.remove('d-none');
        el.disabled = false;
        el.setAttribute('aria-hidden', 'false');
      });
      return;
    }

    // Carrega regra do status
    const rule = await firestore.getStatusRule(statusName);
    if (!rule || !Array.isArray(rule.visibleFields) || rule.visibleFields.length === 0) {
      // Sem regra → mostra tudo
      fieldItems.forEach(({ el, wrapper }) => {
        if (wrapper) wrapper.classList.remove('d-none');
        el.disabled = false;
        el.setAttribute('aria-hidden', 'false');
      });
      return;
    }

    const visibleSet = new Set(
      rule.visibleFields.map((f) => (typeof f === 'string' ? f : f.fieldId))
    );

    fieldItems.forEach(({ id, el, wrapper }) => {
      const shouldShow = visibleSet.has(id);
      if (wrapper) wrapper.classList.toggle('d-none', !shouldShow);
      el.disabled = !shouldShow;
      el.setAttribute('aria-hidden', (!shouldShow).toString());
    });
  } catch (err) {
    console.error('[UI] applyDetailsFieldVisibility error:', err);
  }
}

// Função para configurar labels flutuantes que detectam mudanças de valor
function setupFormFloatingLabels() {
  const floatingContainers = document.querySelectorAll('#details-modal .form-floating');
  
  floatingContainers.forEach(container => {
    const input = container.querySelector('input, select');
    const label = container.querySelector('label');
    
    if (!input || !label) return;
    
    // Desabilita autocomplete do navegador
    input.setAttribute('autocomplete', 'off');
    
    // Função para atualizar estado do label
    const updateLabelState = () => {
      if (input.value && input.value.trim() !== '') {
        container.classList.add('has-value');
        label.classList.add('floating-active');
      } else {
        container.classList.remove('has-value');
        label.classList.remove('floating-active');
      }
    };
    
    // Atualiza estado inicial
    updateLabelState();
    
    // Adiciona listeners para detectar mudanças
    input.addEventListener('input', updateLabelState);
    input.addEventListener('change', updateLabelState);
    input.addEventListener('blur', updateLabelState);
  });
}

// Função auxiliar para calcular o tempo em dias desde a última mudança de status
// Da-se prioridade a statusChangedAt para não resetar quando outros campos são editados
function calculateTimeInStatus(contract) {
  const lastModifiedDate =
    normalizeTimestamp(contract.statusChangedAt) ||
    normalizeTimestamp(contract.dataModificacao) ||
    normalizeTimestamp(contract.updatedAt) ||
    normalizeTimestamp(contract.createdAt);

  if (!lastModifiedDate) {
    return "Novo";
  }
  const now = new Date();
  const timeDiff = now.getTime() - lastModifiedDate.getTime();
  const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

  if (daysDiff === 0) {
    return "Hoje";
  }
  if (daysDiff === 1) {
    return "1 dia";
  }
  return `${daysDiff} dias`;
}

// ==== SLA UTILS ====
// Retorna objeto { elapsedDays, targetDays, status: 'ok'|'warn'|'late'|'none', percent }
function computeSLA(contract) {
  try {
    if (!contract || !contract.status) return { elapsedDays: 0, targetDays: 0, status: 'none', percent: 0 };

    // Prioridade: 1) Firestore slaConfig via SLAConfigManager, 2) config.js SLA_TARGETS, 3) 0
    let targetDays = 0;
    const hasSLAManager = window.SLAConfigManager && typeof window.SLAConfigManager.getSLAForStatus === 'function';
    const hasSLATargets = window.SLA_TARGETS && window.SLA_TARGETS[contract.status];

    if (hasSLAManager) {
      targetDays = window.SLAConfigManager.getSLAForStatus(contract.status) || 0;
    }
    if (targetDays === 0 && hasSLATargets) {
      targetDays = window.SLA_TARGETS[contract.status] || 0;
    }

    // Debug para primeiro contrato apenas
    if (window.__DEBUG__ && !window.__SLA_DEBUG_DONE__) {
      console.log('[SLA Debug] computeSLA para:', contract.status, {
        hasSLAManager,
        hasSLATargets,
        targetDays,
        slaConfigLoaded: window.__SLA_CONFIG_LOADED__
      });
      window.__SLA_DEBUG_DONE__ = true;
    }

    // Se não há SLA configurado para este status, não mostrar alerta
    if (targetDays === 0) return { elapsedDays: 0, targetDays: 0, status: 'none', percent: 0 };

    // Helper para converter Firestore Timestamp (nativo ou serializado) para Date
    const toDate = (timestamp) => {
      if (!timestamp) return null;
      // Timestamp nativo do Firestore com método toDate()
      if (typeof timestamp.toDate === 'function') return timestamp.toDate();
      // Timestamp serializado {seconds, nanoseconds} - comum quando vem do cache
      if (timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
      // Já é uma Date
      if (timestamp instanceof Date) return timestamp;
      // String ISO
      if (typeof timestamp === 'string') return new Date(timestamp);
      return null;
    };

    // Prioridade: statusChangedAt (quando o status mudou) > dataModificacao > updatedAt > createdAt
    // Isso garante que o SLA conte dias no status atual, não dias desde última edição
    const baseDate = toDate(contract.statusChangedAt)
      || toDate(contract.dataModificacao)
      || toDate(contract.updatedAt)
      || toDate(contract.createdAt);

    if (!baseDate) return { elapsedDays: 0, targetDays, status: 'none', percent: 0 };
    
    const now = new Date();
    const diffDays = Math.floor((now - baseDate) / (1000 * 60 * 60 * 24));
    const percent = targetDays > 0 ? Math.min(100, Math.round((diffDays / targetDays) * 100)) : 0;
    
    let status = 'ok';
    if (diffDays > targetDays) status = 'late';
    else if (diffDays >= Math.max(1, Math.floor(targetDays * 0.7))) status = 'warn';
    
    return { elapsedDays: diffDays, targetDays, status, percent };
  } catch (e) {
    console.warn('Erro ao calcular SLA para contrato:', contract?.id, e);
    return { elapsedDays: 0, targetDays: 0, status: 'none', percent: 0 };
  }
}

/**
 * Renderiza o histórico de alterações no modal.
 * @param {Array} history - A lista de entradas de histórico.
 */
export function renderHistory(history) {
  const listDiv = DOMElements.historyListDiv;
  if (history.length === 0) {
    listDiv.innerHTML = "<p>Nenhum histórico de alterações encontrado.</p>";
    return;
  }
  let historyHtml = "<ul>";
  history.forEach((log) => {
    const timestamp = log.alteradoEm.toDate
      ? log.alteradoEm.toDate()
      : new Date();
    const formattedDate = timestamp.toLocaleString("pt-BR");
    historyHtml += `
            <li>
                <div class="history-meta">
                    <strong>${log.alteradoPor}</strong> em ${formattedDate}
                </div>
                <div class="history-changes">
                    ${log.mudancas.map((c) => `<span>${c}</span>`).join("")}
                </div>
            </li>`;
  });
  historyHtml += "</ul>";
  listDiv.innerHTML = historyHtml;
}

/**
 * Extrai os dados do formulário do modal.
 *  CORREÇÃO CRÍTICA: Apenas retorna campos que foram REALMENTE alterados pelo usuário
 * Isto evita mudanças falsas ao comparar com dados originais
 * @returns {object} Um objeto com APENAS os dados do formulário que foram editados
 */
export function getFormData() {
  const data = {};
  DOMElements.detailsForm
    .querySelectorAll("input, textarea, select")
    .forEach((el) => {
      // Ignora campos desabilitados (ex.: ocultos por regra de visibilidade)
      if (el.disabled) return;
      if (el.id && el.id.startsWith("modal-")) {
        //  PROTEÇÃO CRÍTICA: Só incluir campo se foi marcado como modificado pelo usuário
        // Isto evita que campos não-alterados causem mudanças falsas no histórico
        if (el.dataset.userModified !== "true") {
          return; // Pula campos não modificados
        }

        const key = el.id.replace("modal-", "");
        
        // Exclui campos calculados automaticamente pelo sistema
        if (key === "ultimoAnalistaAlteracao") {
          return; // Campo readonly calculado automaticamente
        }

        // Campos CEHOP NATO com multiplas datas - tratamento especial
        if (CEHOP_NATO_FIELDS.includes(key)) {
          const cehopDates = getCehopNatoDatesForSave(key);
          if (cehopDates && cehopDates.length > 0) {
            // Converte datas string para Timestamps do Firestore
            data[key] = cehopDates.map((item) => ({
              data: firestore.parseDateString(item.data),
              registradoPor: item.registradoPor || null,
              registradoEm: item.registradoEm
                ? firestore.parseDateString(item.registradoEm)
                : null,
            }));
          }
          return; // Ja processado, pula o processamento padrao
        }

        //  PROTEÇÃO CONTRA PERDA DE STATUS: Não incluir status vazio
        // Se o campo de status estiver vazio ou oculto, não o incluiremos nos dados
        // Isso previne que o status atual seja sobrescrito acidentalmente
        if (key === "status" && (!el.value || el.value.trim() === "")) {
          return; // Pula este campo se estiver vazio
        }

        //  PROTEÇÃO DO ANALISTA: Não incluir analista vazio
        // Se o campo de analista estiver vazio, não sobrescreve o valor existente
        // O analista será definido automaticamente como o usuário que fez a última alteração
        if (key === "analista" && (!el.value || el.value.trim() === "")) {
          return; // Pula este campo se estiver vazio
        }

        //  AQUI ESTÁ A CORREÇÃO: Conversão de data/hora
        const isDateField = el.type === "date" || el.type === "datetime-local";
        if (isDateField) {
          data[key] = firestore.parseDateString(el.value);
        } else if (el.type === "checkbox") {
          data[key] = el.checked;
        } else {
          data[key] = el.value;
          if (key === "workflowId") {
            const normalizedWorkflow = data[key] ? data[key].trim().toLowerCase() : "";
            data[key] = normalizedWorkflow;
            if (normalizedWorkflow) {
              data.workflowType = normalizedWorkflow;
            }
          }
        }
      }
    });

  // --- INÍCIO DA COLETA DE DADOS DINÂMICOS E FINANCEIROS ---

  // 1. Coleta Gastos Adicionais
  const gastosAdicionais = [];
  document.querySelectorAll(".gasto-item").forEach((row) => {
    const descricao = row.querySelector(".gasto-descricao").value.trim();
    const valor = parseFloat(row.querySelector(".gasto-valor").value) || 0;
    if (descricao || valor > 0) {
      gastosAdicionais.push({ descricao, valor });
    }
  });
  // Sempre atualiza o array, mesmo que vazio (para permitir remover todos)
  data.gastosAdicionais = gastosAdicionais;

  // 2. Coleta Repasses
  const repasses = [];
  document.querySelectorAll(".repasse-item").forEach((row) => {
    const origem = row.querySelector(".repasse-origem").value.trim();
    const valor = parseFloat(row.querySelector(".repasse-valor").value) || 0;
    if (origem || valor > 0) {
      repasses.push({ origem, valor });
    }
  });
  data.repasses = repasses;

  //  Coleta compradores (sempre necessário manter atualizado)
  const rawCompradores = [];
  const compradorItems =
    DOMElements.compradoresContainer.querySelectorAll(".comprador-item");
  compradorItems.forEach((item) => {
    const comprador = {};
    item.querySelectorAll("[data-field]").forEach((field) => {
      const fieldName = field.dataset.field;

      if (field.type === "radio") {
        comprador[fieldName] = field.checked;
        return;
      }

      const rawValue = typeof field.value === "string" ? field.value.trim() : field.value;

      if (fieldName === "telefone") {
        const normalizedPhone = rawValue ? normalizePhoneToE164(rawValue) : "";
        comprador[fieldName] = normalizedPhone || rawValue || "";
        if (normalizedPhone && field.value !== normalizedPhone) {
          field.value = normalizedPhone;
        }
      } else {
        comprador[fieldName] = sanitizeStringValue(rawValue);
      }
    });
    rawCompradores.push(comprador);
  });

  data.compradores = prepareCompradoresForStorage(rawCompradores);

  // --- FIM DA COLETA ---

  return data;
}

/**
 * Preenche os seletores de filtro do dashboard com os dados disponíveis.
 * NOTA: Filtro de construtora/vendedor removido da UI em 09/12/2025
 * Função mantida para compatibilidade - não faz nada atualmente
 * @param {Array} contractsData - A lista completa de contratos.
 */
export function populateDashboardFilters(contractsData) {
  // Função mantida para compatibilidade - filtro de construtora foi removido
  void contractsData;
}

/**
 * Atualiza os cartões de KPIs e o gráfico do dashboard.
 * @param {Array} contractsData - A lista de contratos (filtrada ou completa).
 * @param {Set} selectedChartStatusState - O estado de seleção do filtro do gráfico.
 */
export function updateDashboard(contractsData, selectedChartStatusState) {
  // Apenas atualiza o gráfico do dashboard; KPIs fixos foram removidos
  updateStatusChart(contractsData, selectedChartStatusState, true);
}

/**
 * Gera e imprime um relatório financeiro (Extrato) do contrato.
 * @param {object} contract - Os dados do contrato.
 */
export function exportFinancialReport(contract) {
  if (!contract) return;

  const formatCurrency = (value) =>
    (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Cálculo dos totais (similar ao updateFechamentoCalculations mas com dados do objeto)
  const valorITBI = parseFloat(contract.valorITBI) || 0;
  const valorFinalRi = parseFloat(contract.valorFinalRi) || 0;
  const valorFunrejus = parseFloat(contract.valorFunrejus) || 0;
  const valorDespachante = parseFloat(contract.valorDespachante) || 0;

  let totalDebitos = valorITBI + valorFinalRi + valorFunrejus + valorDespachante;
  const gastosHtml = (contract.gastosAdicionais || []).map(g => {
    totalDebitos += parseFloat(g.valor) || 0;
    return `<tr><td>${g.descricao}</td><td class="text-end">${formatCurrency(parseFloat(g.valor) || 0)}</td></tr>`;
  }).join("");

  let totalRepasses = 0;
  const repassesHtml = (contract.repasses || []).map(r => {
    totalRepasses += parseFloat(r.valor) || 0;
    return `<tr><td>${r.origem}</td><td class="text-end">${formatCurrency(parseFloat(r.valor) || 0)}</td></tr>`;
  }).join("");

  const saldo = totalRepasses - totalDebitos;
  const saldoClass = saldo >= 0 ? "text-success" : "text-danger";

  // Cria um iframe oculto ou nova janela para impressão
  const printWindow = window.open("", "_blank");
  
  const content = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Extrato Financeiro - ${contract.clientePrincipal || "Processo"}</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
      <style>
        body { padding: 40px; font-family: 'Segoe UI', sans-serif; }
        .header { border-bottom: 2px solid #0d6efd; padding-bottom: 20px; margin-bottom: 30px; }
        .logo-text { font-weight: bold; font-size: 1.5rem; color: #0d6efd; }
        .contract-info { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .section-title { font-weight: 600; color: #495057; margin-top: 20px; margin-bottom: 10px; border-left: 4px solid #0d6efd; padding-left: 10px; }
        .table-custom th { background-color: #e9ecef; }
        .balance-box { background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin-top: 30px; text-align: center; }
        .balance-value { font-size: 2rem; font-weight: bold; }
        .text-end { text-align: right; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header d-flex justify-content-between align-items-center">
        <div class="logo-text">Sistema Gestor de Processos</div>
        <div class="text-muted">Extrato Financeiro</div>
      </div>

      <div class="contract-info">
        <div class="row">
          <div class="col-6"><strong>Cliente:</strong> ${contract.clientePrincipal || "-"}</div>
          <div class="col-6"><strong>Empreendimento:</strong> ${contract.empreendimento || "-"}</div>
          <div class="col-6 mt-2"><strong>Unidade:</strong> ${contract.unidade || "-"}</div>
          <div class="col-6 mt-2"><strong>Data Extrato:</strong> ${new Date().toLocaleDateString("pt-BR")}</div>
        </div>
      </div>

      <h5 class="section-title">Débitos e Custos</h5>
      <table class="table table-bordered table-sm table-custom">
        <thead>
          <tr><th>Descrição</th><th class="text-end" style="width: 150px;">Valor</th></tr>
        </thead>
        <tbody>
          <tr><td>ITBI</td><td class="text-end">${formatCurrency(valorITBI)}</td></tr>
          <tr><td>Registro de Imóveis (RI)</td><td class="text-end">${formatCurrency(valorFinalRi)}</td></tr>
          <tr><td>FUNREJUS</td><td class="text-end">${formatCurrency(valorFunrejus)}</td></tr>
          <tr><td>Despachante</td><td class="text-end">${formatCurrency(valorDespachante)}</td></tr>
          ${gastosHtml}
        </tbody>
        <tfoot>
          <tr class="table-light"><th>Total de Débitos</th><th class="text-end text-danger">${formatCurrency(totalDebitos)}</th></tr>
        </tfoot>
      </table>

      <h5 class="section-title">Repasses e Créditos</h5>
      <table class="table table-bordered table-sm table-custom">
        <thead>
          <tr><th>Origem</th><th class="text-end" style="width: 150px;">Valor</th></tr>
        </thead>
        <tbody>
          ${repassesHtml.length ? repassesHtml : '<tr><td colspan="2" class="text-muted text-center">Nenhum repasse registrado</td></tr>'}
        </tbody>
        <tfoot>
          <tr class="table-light"><th>Total de Repasses</th><th class="text-end text-success">${formatCurrency(totalRepasses)}</th></tr>
        </tfoot>
      </table>

      <div class="balance-box">
        <div class="text-muted text-uppercase small mb-1">Saldo Final</div>
        <div class="balance-value ${saldoClass}">${formatCurrency(saldo)}</div>
        <div class="small text-muted mt-2">${saldo >= 0 ? "Crédito a favor do cliente/processo" : "Débito pendente"}</div>
      </div>

      <div class="text-center mt-5 text-muted small no-print">
        <button onclick="window.print()" class="btn btn-primary btn-lg"> Imprimir / Salvar PDF</button>
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(content);
  printWindow.document.close();
}

/**
 * Gera um recibo completo para o cliente com valores devidos e pagamentos realizados.
 * @param {Object} contract - Os dados do contrato.
 */
export function exportClientReceipt(contract) {
  if (!contract) return;

  const formatCurrency = (value) =>
    (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Gerar numero do recibo
  const timestamp = Date.now();
  const contractIdShort = (contract.id || "000").slice(-6).toUpperCase();
  const receiptNumber = `REC-${contractIdShort}-${timestamp.toString().slice(-6)}`;

  // Calculo dos totais com parseFloat
  const valorITBI = parseFloat(contract.valorITBI) || 0;
  const valorFinalRi = parseFloat(contract.valorFinalRi) || 0;
  const valorFunrejus = parseFloat(contract.valorFunrejus) || 0;
  const valorDespachante = parseFloat(contract.valorDespachante) || 0;

  let totalDebitos = valorITBI + valorFinalRi + valorFunrejus + valorDespachante;

  // Construir linhas de debitos
  let debitosRows = `
    <tr><td>ITBI</td><td class="text-end">${formatCurrency(valorITBI)}</td></tr>
    <tr><td>Registro de Imoveis (RI)</td><td class="text-end">${formatCurrency(valorFinalRi)}</td></tr>
    <tr><td>FUNREJUS</td><td class="text-end">${formatCurrency(valorFunrejus)}</td></tr>
    <tr><td>Despachante</td><td class="text-end">${formatCurrency(valorDespachante)}</td></tr>
  `;

  // Gastos adicionais
  (contract.gastosAdicionais || []).forEach(g => {
    const valor = parseFloat(g.valor) || 0;
    totalDebitos += valor;
    debitosRows += `<tr><td>${g.descricao || "Gasto adicional"}</td><td class="text-end">${formatCurrency(valor)}</td></tr>`;
  });

  // Construir linhas de pagamentos/repasses
  let totalRepasses = 0;
  let repassesRows = "";
  (contract.repasses || []).forEach(r => {
    const valor = parseFloat(r.valor) || 0;
    totalRepasses += valor;
    repassesRows += `<tr><td>${r.origem || "Pagamento"}</td><td class="text-end">${formatCurrency(valor)}</td></tr>`;
  });

  if (!repassesRows) {
    repassesRows = '<tr><td colspan="2" class="text-muted text-center">Nenhum pagamento registrado</td></tr>';
  }

  const saldo = totalRepasses - totalDebitos;
  const saldoClass = saldo >= 0 ? "text-success" : "text-danger";
  const saldoTexto = saldo >= 0 ? "Credito a favor do cliente" : "Saldo devedor";

  const printWindow = window.open("", "_blank");

  const content = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Recibo - ${contract.clientePrincipal || "Cliente"}</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
      <style>
        body { padding: 40px; font-family: 'Segoe UI', sans-serif; }
        .header { border-bottom: 3px solid #198754; padding-bottom: 20px; margin-bottom: 30px; }
        .logo-text { font-weight: bold; font-size: 1.5rem; color: #198754; }
        .receipt-title { font-size: 2rem; font-weight: bold; color: #333; letter-spacing: 2px; }
        .receipt-number { font-size: 0.9rem; color: #666; }
        .contract-info { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #198754; }
        .section-title { font-weight: 600; color: #495057; margin-top: 25px; margin-bottom: 15px; border-left: 4px solid #198754; padding-left: 10px; }
        .table-custom th { background-color: #e9ecef; }
        .summary-box { background-color: #f8f9fa; border: 2px solid #dee2e6; border-radius: 8px; padding: 20px; margin-top: 30px; }
        .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .summary-row:last-child { border-bottom: none; font-weight: bold; font-size: 1.2rem; }
        .signature-section { margin-top: 60px; padding-top: 30px; }
        .signature-line { border-top: 1px solid #333; width: 350px; margin: 0 auto; padding-top: 8px; text-align: center; }
        .signature-label { font-size: 0.85rem; color: #666; }
        .date-line { margin-top: 30px; text-align: center; }
        .declaration { margin-top: 40px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; font-size: 0.9rem; text-align: center; }
        .text-end { text-align: right; }
        @media print {
          body { padding: 20px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="d-flex justify-content-between align-items-center">
          <div class="logo-text">Sistema Gestor de Processos</div>
          <div class="text-end">
            <div class="receipt-title">RECIBO</div>
            <div class="receipt-number">N. ${receiptNumber}</div>
          </div>
        </div>
      </div>

      <div class="contract-info">
        <div class="row">
          <div class="col-6"><strong>Cliente:</strong> ${contract.clientePrincipal || "-"}</div>
          <div class="col-6"><strong>Empreendimento:</strong> ${contract.empreendimento || "-"}</div>
          <div class="col-6 mt-2"><strong>Unidade:</strong> ${contract.unidade || "-"}</div>
          <div class="col-6 mt-2"><strong>Data de Emissao:</strong> ${new Date().toLocaleDateString("pt-BR")}</div>
        </div>
      </div>

      <h5 class="section-title">Valores do Processo (Debitos)</h5>
      <table class="table table-bordered table-sm table-custom">
        <thead>
          <tr><th>Descricao</th><th class="text-end" style="width: 150px;">Valor</th></tr>
        </thead>
        <tbody>
          ${debitosRows}
        </tbody>
        <tfoot>
          <tr class="table-light"><th>Total de Debitos</th><th class="text-end text-danger">${formatCurrency(totalDebitos)}</th></tr>
        </tfoot>
      </table>

      <h5 class="section-title">Pagamentos Realizados (Creditos)</h5>
      <table class="table table-bordered table-sm table-custom">
        <thead>
          <tr><th>Origem</th><th class="text-end" style="width: 150px;">Valor</th></tr>
        </thead>
        <tbody>
          ${repassesRows}
        </tbody>
        <tfoot>
          <tr class="table-light"><th>Total de Pagamentos</th><th class="text-end text-success">${formatCurrency(totalRepasses)}</th></tr>
        </tfoot>
      </table>

      <div class="summary-box">
        <h6 class="text-center mb-3"><strong>RESUMO FINANCEIRO</strong></h6>
        <div class="summary-row">
          <span>Total de Debitos:</span>
          <span class="text-danger">${formatCurrency(totalDebitos)}</span>
        </div>
        <div class="summary-row">
          <span>Total de Pagamentos:</span>
          <span class="text-success">${formatCurrency(totalRepasses)}</span>
        </div>
        <div class="summary-row">
          <span>SALDO:</span>
          <span class="${saldoClass}">${formatCurrency(saldo)} (${saldoTexto})</span>
        </div>
      </div>

      <div class="declaration">
        Declaro ter recebido e conferido os valores acima discriminados, estando de acordo com as informacoes apresentadas.
      </div>

      <div class="signature-section">
        <div class="signature-line">
          <div class="signature-label">Assinatura do Responsavel</div>
        </div>
        <div class="date-line">
          <span>Data: ____/____/________</span>
        </div>
      </div>

      <div class="text-center mt-5 no-print">
        <button onclick="window.print()" class="btn btn-success btn-lg">
          <i class="bi bi-printer me-2"></i>Imprimir / Salvar PDF
        </button>
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(content);
  printWindow.document.close();
}

/**
 * Atualiza o gráfico de status.
 * @param {Array} contractsData - A lista de contratos a ser usada para o gráfico.
 * @param {Set} selectedChartStatusState - O estado de seleção atual do filtro do gráfico.
 */
export function updateStatusChart(contractsData, selectedChartStatusState, forceRecreateFilters = false) {
  const legendContainer = document.getElementById("custom-legend");
  if (!legendContainer) {
    console.warn("[Chart] Container de legenda #custom-legend não encontrado.");
    return;
  }

  if (!(selectedChartStatusState instanceof Set)) {
    selectedChartStatusState = new Set();
  }

  const contracts = Array.isArray(contractsData) ? contractsData : [];
  const statusCounts = contracts.reduce((acc, contract) => {
    const status = normalizeStatusText(contract?.status) || "Não definido";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const statusMap = new Map();
  getExpandedStatusList(contracts).forEach((status, index) => {
    const text = normalizeStatusText(status?.text);
    if (!text || statusMap.has(text)) return;

    const parsedOrder = Number(status?.order);
    statusMap.set(text, {
      ...status,
      text,
      order: Number.isFinite(parsedOrder) ? parsedOrder : 9000 + index,
    });
  });

  Object.keys(statusCounts).forEach((statusText, index) => {
    if (statusMap.has(statusText)) return;
    statusMap.set(statusText, {
      text: statusText,
      stage: "Órfão",
      order: 9500 + index,
      active: true,
      isOrphan: true,
    });
  });

  const availableStatuses = Array.from(statusMap.values()).sort((a, b) => {
    const orderA = Number(a?.order);
    const orderB = Number(b?.order);
    const hasOrderA = Number.isFinite(orderA);
    const hasOrderB = Number.isFinite(orderB);

    if (hasOrderA && hasOrderB && orderA !== orderB) return orderA - orderB;
    if (hasOrderA && !hasOrderB) return -1;
    if (!hasOrderA && hasOrderB) return 1;

    return String(a?.text || "").localeCompare(String(b?.text || ""), "pt-BR");
  });

  // Exibe no gráfico apenas status que possuem ao menos um contrato.
  const statusesWithContracts = availableStatuses.filter(
    (status) => (statusCounts[status.text] || 0) > 0
  );

  // Só limpa e recria a legenda se forçado ou se estiver vazia
  const shouldRecreateFilters = forceRecreateFilters || legendContainer.children.length === 0;
  if (shouldRecreateFilters) {
    legendContainer.innerHTML = "";
  }

  const redrawChart = async () => {
    const selectedLabelSet = new Set(
      Array.from(legendContainer.querySelectorAll("input:checked"))
        .map((cb) => normalizeStatusText(cb.value))
        .filter(Boolean)
    );

    // Filtra os dados com base nos status selecionados
    const filteredStatuses = statusesWithContracts.filter((status) =>
      selectedLabelSet.has(status.text)
    );
    const chartLabels = filteredStatuses.map((status) => status.text);
    const chartData = chartLabels.map((label) => statusCounts[label] || 0);

    // Cores por status: usar bgColor (cor de fundo configurada) para manter
    // consistência com badges e demais pontos da UI.
    const defaultColor = "#0039BA";
    const resolveStatusBarColor = (status) => {
      const bgColor = typeof status?.bgColor === "string" ? status.bgColor.trim() : "";
      const textColor = typeof status?.color === "string" ? status.color.trim() : "";
      return bgColor || textColor || defaultColor;
    };
    const bgColors = filteredStatuses.map((status) => hexToRgba(resolveStatusBarColor(status), 0.7));
    const borderColors = filteredStatuses.map((status) => resolveStatusBarColor(status));

    if (statusChart) {
      statusChart.data.labels = chartLabels;
      statusChart.data.datasets[0].data = chartData;
      statusChart.data.datasets[0].backgroundColor = bgColors;
      statusChart.data.datasets[0].borderColor = borderColors;
      statusChart.update();
    } else {
      // Lazy load do Chart.js
      if (typeof Chart === 'undefined') {
        try {
          if (window.lazyLoader) {
            await window.lazyLoader.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', 'ChartJS');
          } else {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
              script.onload = resolve;
              script.onerror = reject;
              document.head.appendChild(script);
            });
          }
        } catch (error) {
          console.error('Falha ao carregar Chart.js:', error);
          return;
        }
      }

      const ctx = document.getElementById("statusChartCanvas").getContext("2d");
      statusChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: chartLabels,
          datasets: [
            {
              label: "Contratos",
              data: chartData,
              backgroundColor: bgColors,
              borderColor: borderColors,
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: { precision: 0 },
            },
            x: {
              ticks: {
                maxRotation: 45,
                minRotation: 0,
                font: { size: 11 },
              },
            },
          },
          plugins: {
            legend: { display: false },
            title: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.parsed.y} contrato${ctx.parsed.y !== 1 ? 's' : ''}`,
              },
            },
          },
        },
      });
    }
  };

  // Só cria a legenda se necessário (primeira vez ou forçado)
  if (shouldRecreateFilters) {
    statusesWithContracts.forEach((status, index) => {
      const div = document.createElement("div");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = status.text;
      checkbox.checked = selectedChartStatusState.has(status.text);
      checkbox.id = buildStatusCheckboxId(status.text, index, "check");

      const labelElement = document.createElement("label");
      labelElement.htmlFor = checkbox.id;
      labelElement.appendChild(checkbox);
      const statusOrder = status.order ?? "S/N";
      labelElement.appendChild(
        document.createTextNode(`${statusOrder} - ${status.text}`)
      );
      labelElement.title = status.text;
      div.appendChild(labelElement);
      legendContainer.appendChild(div);

      // Adiciona um listener para atualizar o estado e redesenhar o gráfico.
      checkbox.addEventListener("change", (e) => {
        if (e.target.checked) {
          selectedChartStatusState.add(e.target.value);
        } else {
          selectedChartStatusState.delete(e.target.value);
        }
        redrawChart();
      });
    });
  }

  redrawChart();
}

// Função auxiliar para calcular diferença de dias
// eslint-disable-next-line no-unused-vars
function calculateDateDiffInDays(dateStr1, dateStr2) {
  if (!dateStr1 || !dateStr2) return null;
  const date1 = dateStr1.toDate ? dateStr1.toDate() : new Date(dateStr1);
  const date2 = dateStr2.toDate ? dateStr2.toDate() : new Date(dateStr2);
  if (isNaN(date1) || isNaN(date2)) return null;
  const timeDiff = date2.getTime() - date1.getTime();
  const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  return dayDiff >= 0 ? dayDiff : null;
}

/**
 * Atualiza a contagem de itens selecionados e a UI para ações em massa.
 */
export function updateBulkActionUI() {
  const selectedCheckboxes = DOMElements.contractList.querySelectorAll(
    ".row-checkbox:checked"
  );
  const selectedCount = selectedCheckboxes.length;

  if (selectedCount > 0) {
    DOMElements.listHeader.classList.add("bulk-mode");
    DOMElements.bulkActionsCounter.textContent = `${selectedCount} item(s) selecionado(s)`;
  } else {
    DOMElements.listHeader.classList.remove("bulk-mode");
  }
  const totalCheckboxes =
    DOMElements.contractList.querySelectorAll(".row-checkbox").length;
  // Adiciona uma verificação para garantir que o elemento existe antes de tentar acessá-lo.
  if (DOMElements.selectAllCheckbox) {
    DOMElements.selectAllCheckbox.checked =
      selectedCount > 0 && selectedCount === totalCheckboxes;
  }
}

/**
 * Aplica filtros locais de busca e status na tabela de usuários.
 */
export function applyUsersTableFilters() {
  const userListTbody = document.getElementById("user-list-tbody");
  if (!userListTbody) return;

  const rows = Array.from(
    userListTbody.querySelectorAll('tr[data-user-row="true"]')
  );
  if (rows.length === 0) return;

  const searchInput = document.getElementById("user-search");
  const selectedFilter =
    document.querySelector('input[name="user-filter"]:checked')?.value || "all";
  const searchTerm = sanitizeStringValue(searchInput?.value).toLowerCase();
  let visibleRows = 0;

  rows.forEach((row) => {
    const rowSearch = (row.dataset.search || "").toLowerCase();
    const rowStatus = row.dataset.status || "active";
    const matchesSearch = !searchTerm || rowSearch.includes(searchTerm);
    const matchesStatus = selectedFilter === "all" || rowStatus === selectedFilter;
    const shouldShow = matchesSearch && matchesStatus;

    row.classList.toggle("d-none", !shouldShow);
    if (shouldShow) visibleRows += 1;
  });

  const existingEmpty = userListTbody.querySelector(".user-filter-empty");
  if (existingEmpty) existingEmpty.remove();

  if (visibleRows === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.className = "user-filter-empty";
    emptyRow.innerHTML =
      '<td colspan="6" class="text-center text-muted py-4"><i class="bi bi-search me-1"></i>Nenhum usuário encontrado para o filtro atual.</td>';
    userListTbody.appendChild(emptyRow);
  }
}

/**
 * Carrega a lista de usuários e a renderiza na tabela.
 * Requer permissão de administrador.
 */
export async function loadAndRenderUsers() {
  const userListTbody = document.getElementById("user-list-tbody");
  const userCountEl = document.getElementById("user-count");

  if (!userListTbody) return;

  // Verifica se o usuário é admin antes de chamar a Cloud Function
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const tokenResult = await currentUser.getIdTokenResult();
    if (!tokenResult.claims.admin) {
      userListTbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted py-4">Acesso restrito a administradores.</td></tr>';
      if (userCountEl) userCountEl.textContent = "0";
      return;
    }
  } catch (authErr) {
    console.warn("loadAndRenderUsers: erro ao verificar permissões", authErr);
    return;
  }

  userListTbody.innerHTML =
    '<tr><td colspan="6" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Carregando usuários...</td></tr>';
  try {
    const users = await firestore.getAllUsers();
    if (users.length === 0) {
      userListTbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted py-4">Nenhum usuário encontrado.</td></tr>';
      if (userCountEl) userCountEl.textContent = "0";
      return;
    }

    userListTbody.innerHTML = "";

    users.forEach((u) => {
      const tr = document.createElement("tr");
      const permissionClass = u.isAdmin ? "admin" : "user";
      const permissionText = u.isAdmin ? "Admin" : "Usuário";
      const statusClass = u.disabled ? "disabled" : "active";
      const statusText = u.disabled ? "Desativado" : "Ativo";
      const isCurrentUser = auth.currentUser && u.uid === auth.currentUser.uid;
      const safeUid = escapeHtmlLight(u.uid || "");
      const safeName = escapeHtmlLight(u.fullName || "Nao informado");
      const safeEmail = escapeHtmlLight(u.email || "");
      const safeCpf = escapeHtmlLight(u.cpf || "");
      const searchIndex = [u.fullName, u.email, u.cpf]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const toggleStatusLabel = statusText === "Ativo" ? "Desativar" : "Ativar";
      const toggleStatusIcon = statusText === "Ativo" ? "bi-toggle-off" : "bi-toggle-on";
      const toggleStatusBtnClass =
        statusText === "Ativo" ? "btn-outline-secondary" : "btn-outline-success";
      const currentUserBadge = isCurrentUser
        ? '<span class="badge rounded-pill text-bg-light border ms-1">Você</span>'
        : "";

      tr.dataset.userRow = "true";
      tr.dataset.status = u.disabled ? "inactive" : "active";
      tr.dataset.search = searchIndex;

      const promoteOrDemoteBtn = u.isAdmin
        ? `<button type="button" class="action-btn demote btn btn-outline-warning btn-sm" data-email="${safeEmail}" title="Rebaixar para usuário comum" ${isCurrentUser ? "disabled" : ""}><i class="bi bi-shield-minus me-1"></i>Rebaixar</button>`
        : `<button type="button" class="action-btn promote btn btn-outline-primary btn-sm" data-email="${safeEmail}" title="Promover a administrador" ${isCurrentUser ? "disabled" : ""}><i class="bi bi-shield-check me-1"></i>Promover</button>`;

      tr.innerHTML = `
            <td class="fw-semibold">${safeName}${currentUserBadge}</td>
            <td class="text-break">${safeEmail}</td>
            <td><code>${safeCpf || "-"}</code></td>
            <td><span class="user-permission ${permissionClass}">${permissionText}</span></td>
            <td><span class="user-status ${statusClass}">${statusText}</span></td>
            <td class="user-actions text-end">
                ${promoteOrDemoteBtn}
                <button type="button" class="action-btn disable btn ${toggleStatusBtnClass} btn-sm" data-uid="${safeUid}" title="${toggleStatusLabel} usuário" ${
        isCurrentUser ? "disabled" : ""
      }><i class="bi ${toggleStatusIcon} me-1"></i>${toggleStatusLabel}</button>
                <button type="button" class="action-btn delete btn btn-outline-danger btn-sm" data-uid="${safeUid}" title="Excluir usuário" ${
        isCurrentUser ? "disabled" : ""
      }><i class="bi bi-trash me-1"></i>Excluir</button>
            </td>
        `;
      userListTbody.appendChild(tr);
    });

    if (userCountEl) userCountEl.textContent = users.length;
    applyUsersTableFilters();
  } catch (error) {
    console.error("Erro ao listar usuários:", error);
    userListTbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">${error.message}</td></tr>`;
    showNotification(error.message, "error");
  }
}
/**
 * Carrega as regras de status do Firestore e renderiza a lista na página de Configurações.
 */
export async function loadAndRenderStatusRules() {
  const container = document.getElementById("status-rules-container");
  if (!container) {
    console.warn("Container 'status-rules-container' não encontrado. Modal pode não estar visível.");
    return;
  }

  container.innerHTML = "<p>A carregar regras...</p>";

  try {
    // 1. Busca todas as regras que já existem no Firestore.
    const existingRules = await firestore.getAllStatusRules();

    // Mapeia as regras por status para fácil acesso usando o nome original do status
    // Importante: usa originalStatusName (salvo no Firestore) ou fallback para id
    const rulesMap = new Map(existingRules.map((rule) => {
      const key = rule.originalStatusName || rule.id;
      return [key, rule];
    }));

    if (window.__DEBUG__) {
      console.log('[DEBUG] Regras carregadas do Firestore:', existingRules.length);
      console.log('[DEBUG] Mapeamento de regras:', Array.from(rulesMap.keys()));
    }

    container.innerHTML = ""; // Limpa a mensagem de "carregando".

    // 2. Verifica se a lista de status está disponível
    const statusList = getStatusConfigList();
    if (!statusList || statusList.length === 0) {
      container.innerHTML = '<p style="color: orange;">Nenhum status configurado encontrado.</p>';
      return;
    }

    // 3. Itera sobre a nossa lista efetiva de status (dinâmica com fallback).
    statusList.forEach((statusInfo) => {
      const rule = rulesMap.get(statusInfo.text); // Pega a regra para o status atual

      const ruleItemDiv = document.createElement("div");
      ruleItemDiv.className = "status-rule-item";

      let requiredFieldsHtml =
        '<p class="no-rules">Nenhuma regra definida.</p>';
      if (rule && rule.requiredFields && rule.requiredFields.length > 0) {
        // Se a regra existir, formata os nomes dos campos para exibição.
        requiredFieldsHtml = `<p><strong>Campos obrigatórios:</strong> ${rule.requiredFields
          .map((f) => f.label || f.fieldId)
          .join(", ")}</p>`;
      }

      ruleItemDiv.innerHTML = `
                <div class="status-rule-info">
                    <h5>${statusInfo.order || ''} - ${statusInfo.text}</h5>
                    ${requiredFieldsHtml}
                </div>
                <div class="status-rule-actions">
                    <button class="btn btn-outline-primary btn-sm edit-rule-btn" data-status="${statusInfo.text}"><i class="bi bi-pencil me-1"></i>Editar</button>
                </div>
            `;

      container.appendChild(ruleItemDiv);
    });
    
    // Debug: Confirma que os botões foram criados
    if (window.__DEBUG__) {
      console.log(` ${statusList.length} regras de status renderizadas com botões de edição`);
    }
  } catch (error) {
    console.error("Erro ao carregar regras de status:", error);
    container.innerHTML =
      '<p style="color: red;">Falha ao carregar as regras. Verifique o console.</p>';
  }
}

/**
 * Atualiza a mensagem de progresso da importação na tela.
 * @param {string} message - A mensagem a ser exibida.
 */
export function updateImportProgress(message) {
  if (DOMElements.importProgress) {
    DOMElements.importProgress.textContent = message;
  }
}

/**
 * Renderiza o quadro Kanban com base na lista de contratos.
 * @param {Array} contracts - A lista COMPLETA de contratos.
 * @param {Set<string>} selectedStatusState - O estado atual do filtro de status.
 * @param {string} workflowType - O tipo de workflow ativo (associativo/individual).
 */
export function renderKanbanBoard(contracts, selectedStatusState, workflowType = 'associativo') {
  //  VALIDAÇÃO CRÍTICA: Verificar se elemento Kanban existe
  if (!DOMElements.kanbanBoard) {
    console.error(' renderKanbanBoard: elemento #kanban-board não encontrado no DOM');
    return;
  }

  // PROTEÇÃO: Evita renderizações simultâneas e muito frequentes
  const now = Date.now();
  if (_kanbanRenderInProgress) {
    console.log(' Kanban render já em progresso, ignorando chamada duplicada');
    return;
  }
  
  if (now - _kanbanLastRenderTime < KANBAN_MIN_RENDER_INTERVAL) {
    console.log(` Kanban render muito frequente (${now - _kanbanLastRenderTime}ms), ignorando`);
    return;
  }
  
  _kanbanRenderInProgress = true;
  _kanbanLastRenderTime = now;
  
  // Limpa o board antes de renderizar
  if (DOMElements.kanbanBoard) DOMElements.kanbanBoard.innerHTML = "";
  
  // Invalida cache de colunas renderizadas
  window.__KANBAN_RENDERED_COLUMNS = new Set();

  // Aplica filtro de status se necessário
  let contractsToShow = contracts;
  if (selectedStatusState && selectedStatusState.size > 0) {
    contractsToShow = contracts.filter(c => selectedStatusState.has(c.status));
  }
  
  // IMPORTANTE: Garante que contratos órfãos sejam incluídos se não há filtro específico
  if (!selectedStatusState || selectedStatusState.size === 0) {
    contractsToShow = contracts; // Mostra TODOS os contratos quando não há filtro
    console.log(` Exibindo todos os ${contractsToShow.length} contratos (sem filtro de status)`);
  } else {
    console.log(` Filtro de status ativo: ${selectedStatusState.size} status selecionados`);
    console.log(` Contratos filtrados: ${contractsToShow.length}/${contracts.length}`);
  }
  
  // Cache & dedupe: gera chave que INCLUI o status de cada contrato para detectar mudanças
  // CORREÇÃO 05/12/2025: A chave antiga só usava contracts.length, não detectava mudanças de status
  try {
    const statusKey = [...selectedStatusState].sort().join('|');
    // Gera hash simples dos IDs e status dos contratos para detectar mudanças
    const contractsHash = contracts.slice(0, 100).map(c => `${c.id}:${c.status}`).join(',');
    const cacheKey = `${contracts.length}::${statusKey}::${contractsHash}`;
    if (window.__KANBAN_LAST_KEY === cacheKey && DOMElements.kanbanBoard && DOMElements.kanbanBoard.children.length > 0) {
      debug(' renderKanbanBoard: reutilizando render anterior (sem mudanças)');
      _kanbanRenderInProgress = false;
      updateKanbanCounters();
      return;
    }
    window.__KANBAN_LAST_KEY = cacheKey;
  } catch { /* se algo falhar segue fluxo normal */ }

  // --- INÍCIO DA ADIÇÃO PARA DEBUG ---
  debug("--- DEBUG: Passo 2 (UI.js) ---");
  debug(
    "Função renderKanbanBoard RECEBEU (contratos):",
    contracts.length
  );
  debug(
    "Função renderKanbanBoard RECEBEU (filtro):",
    selectedStatusState
  );
  // --- FIM DA ADIÇÃO PARA DEBUG ---

  const board = DOMElements.kanbanBoard;

  // --- INÍCIO DA ADIÇÃO PARA DEBUG ---
  debug(
    "Contratos a serem mostrados APÓS o filtro:",
    contractsToShow.length
  );
  // --- FIM DA ADIÇÃO PARA DEBUG ---

  const knownStatuses = new Set(getStatusConfigList().map((s) => s.text));
  
  // MELHORIA: Usa lista expandida que inclui status órfãos
  const expandedStatusList = getExpandedStatusList(contracts);
  
  console.log(` Status disponíveis: ${expandedStatusList.length} (${getStatusConfigList().length} conhecidos + ${expandedStatusList.length - getStatusConfigList().length} órfãos)`);
  
  // DEBUG: Verificar alinhamento de workflows com status dinâmicos
  if (window.__DEBUG__) {
    const currentWorkflowDebug = cachedWorkflows.find(w => w.id === workflowType);
    if (currentWorkflowDebug) {
      const workflowStages = new Set(currentWorkflowDebug.stages);
      const statusTexts = new Set(getStatusConfigList().map(s => s.text));
      const missingInConfig = [...workflowStages].filter(s => !statusTexts.has(s));
      const missingInWorkflow = [...statusTexts].filter(s => !workflowStages.has(s));
      
      if (missingInConfig.length > 0) {
        console.warn(` Status no workflow mas não na configuração dinâmica:`, missingInConfig);
      }
      if (missingInWorkflow.length > 0) {
        console.log(` Status na configuração mas não no workflow '${workflowType}':`, missingInWorkflow);
      }
    }
  }

  // Cria colunas para status conhecidos que têm contratos na lista filtrada
  // Progressive render: dividir em lotes para não bloquear a UI
  // Filtra colunas baseadas no workflow ativo
  const currentWorkflow = cachedWorkflows.find(w => w.id === workflowType);
  const allowedStages = currentWorkflow ? new Set(currentWorkflow.stages) : null;
  
  let STATUS_LIST = [...getStatusConfigList()];
  
  // CORREÇÃO APRIMORADA: Adiciona automaticamente status que têm contratos
  // mesmo que não estejam no workflow (evita perda de visualização)
  const statusWithContracts = new Set(contractsToShow.map(c => c.status).filter(Boolean));
  
  if (allowedStages && allowedStages.size < STATUS_LIST.length) {
    const beforeFilter = STATUS_LIST.length;
    
    // Filtra por workflow MAS garante que status com contratos sempre aparecem
    STATUS_LIST = STATUS_LIST.filter(s => {
      const inWorkflow = allowedStages.has(s.text);
      const hasContracts = statusWithContracts.has(s.text);
      return inWorkflow || hasContracts; // Inclui se está no workflow OU tem contratos
    });
    
    const addedByContracts = STATUS_LIST.filter(s => 
      !allowedStages.has(s.text) && statusWithContracts.has(s.text)
    );
    
    console.log(` Kanban filtrado por workflow '${workflowType}': ${STATUS_LIST.length}/${beforeFilter} colunas`);
    
    if (addedByContracts.length > 0) {
      console.log(` Status adicionados por terem contratos (fora do workflow):`, addedByContracts.map(s => s.text));
    }
    
    // Log de debug: mostrar status realmente filtrados
    const trulyFiltered = getStatusConfigList().filter(s => 
      !allowedStages.has(s.text) && !statusWithContracts.has(s.text)
    );
    if (trulyFiltered.length > 0) {
      console.log(` Status filtrados (sem contratos):`, trulyFiltered.map(s => s.text));
    }
  } else {
    console.log(` Kanban SEM filtro de workflow (mostrando todos os ${STATUS_LIST.length} status)`);
  }

  const BATCH_SIZE = 6; // colunas por frame
  let index = 0;
  const renderedStatuses = new Set(); // Evitar duplicatas
  
  function renderBatch() {
    const slice = STATUS_LIST.slice(index, index + BATCH_SIZE);
    slice.forEach(statusInfo => {
      // Evitar duplicatas - verificar se já foi renderizado
      if (renderedStatuses.has(statusInfo.text)) return;
      
      const contractsInStatus = contractsToShow.filter(c => c.status === statusInfo.text);
      if (contractsInStatus.length > 0) {
        const column = createKanbanColumn(statusInfo.text, contractsInStatus);
        board.appendChild(column);
        renderedStatuses.add(statusInfo.text);
      }
    });
    index += BATCH_SIZE;
    if (index < STATUS_LIST.length) {
      // agenda próxima batch sem travar
      requestIdleCallback ? requestIdleCallback(renderBatch) : setTimeout(renderBatch, 16);
    } else {
      // final
      updateKanbanCounters();
      // Atualiza badges de pendências de forma assíncrona (não bloqueia render)
      setTimeout(() => updatePendenciasBadges(), 100);
      debug(' Kanban render completo');
    }
  }
  renderBatch();

  // Encontra e cria colunas para contratos "órfãos" (status desconhecidos)
  const orphanContracts = contractsToShow.filter(
    (c) => c.status && !knownStatuses.has(c.status)
  );
  
  console.log(` Contratos órfãos encontrados: ${orphanContracts.length}`);
  if (orphanContracts.length > 0) {
    console.log(' Status órfãos:', [...new Set(orphanContracts.map(c => c.status))]);
    
    // MODIFICAÇÃO: Executa de forma síncrona para garantir exibição
    const orphansByStatus = orphanContracts.reduce((acc, contract) => {
      acc[contract.status] = acc[contract.status] || [];
      acc[contract.status].push(contract);
      return acc;
    }, {});
    
    Object.keys(orphansByStatus).forEach((statusText) => {
      const contractsInStatus = orphansByStatus[statusText];
      const columnTitle = ` ${statusText}`;
      const column = createKanbanColumn(columnTitle, contractsInStatus, true);
      board.appendChild(column);
      console.log(` Coluna órfã criada: "${columnTitle}" com ${contractsInStatus.length} contratos`);
    });
    
    updateKanbanCounters();
    // Atualiza badges de pendências após colunas órfãs
    setTimeout(() => updatePendenciasBadges(), 100);
  }
  
  // Libera o lock de renderização
  _kanbanRenderInProgress = false;
}

/**
 * Função auxiliar para criar uma coluna do Kanban.
 * @param {string} title - O título da coluna.
 * @param {Array} contracts - Os contratos que pertencem a esta coluna.
 * @param {boolean} isOrphan - Se a coluna é para status desconhecidos.
 * @returns {HTMLElement} - O elemento da coluna pronto para ser adicionado ao quadro.
 */
function createKanbanColumn(title, contracts, isOrphan = false) {
  const column = document.createElement("div");
  column.className = "kanban-column";
  // Expor status no atributo para permitir estilização por status
  column.setAttribute('data-status', title);
  if (isOrphan) {
    column.classList.add("orphan-column");
  }
  
  // Buscar cores do status
  const statusInfo = getStatusConfigList().find(s => s.text === title);
  const statusColor = statusInfo?.color || '#FFFFFF';
  const statusBgColor = statusInfo?.bgColor || '#6C757D';
  
  // Calcular cor de fundo suave para a coluna (10% de opacidade)
  const columnBgColor = hexToRgba(statusBgColor, 0.08);
  
  // Aplicar cor de fundo na coluna inteira
  column.style.backgroundColor = columnBgColor;
  column.style.borderTop = `4px solid ${statusBgColor}`;
  
  // Cabeçalho com título e contador dinâmico (fixo no topo)
  const header = document.createElement('div');
  header.className = 'column-header';
  header.style.cssText = `background: ${statusBgColor}; color: ${statusColor}; border-radius: 8px 8px 0 0; cursor: pointer;`;
  header.title = `Clique para ver "${title}" em lista`;
  header.innerHTML = `
    <h4 style="color: ${statusColor}; margin: 0;">${title}</h4>
    <div class="count" style="background: rgba(255,255,255,0.25); color: ${statusColor};">${contracts.length}</div>
  `;
  
  // Evento: ao clicar no header, filtra por este status e alterna para lista
  header.addEventListener('click', () => {
    filterByStatusAndSwitchToList(title);
  });
  
  column.appendChild(header);
  
  // Container de cards com scroll próprio
  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'column-cards-container';
  column.appendChild(cardsContainer);

  // Ordenar contratos por tempo no status (mais antigo primeiro = maior tempo no status no topo)
  const sortedContracts = [...contracts].sort((a, b) => {
    const getStatusDate = (contract) => {
      return normalizeTimestamp(contract.statusChangedAt) ||
             normalizeTimestamp(contract.dataModificacao) ||
             normalizeTimestamp(contract.updatedAt) ||
             normalizeTimestamp(contract.createdAt) ||
             new Date();
    };
    const dateA = getStatusDate(a);
    const dateB = getStatusDate(b);
    return dateA.getTime() - dateB.getTime(); // Mais antigo primeiro
  });

  // Função para criar card do Kanban (usada em render normal e virtual scroll)
  function buildKanbanCard(contract){
    let nomeProponente = 'Não informado';
    if (contract.clientePrincipal && contract.clientePrincipal.trim() !== '') {
      nomeProponente = contract.clientePrincipal;
    } else if (contract.compradores && contract.compradores.length > 0) {
      const compradorPrincipal = contract.compradores.find(c=>c.principal) || contract.compradores[0];
      nomeProponente = compradorPrincipal ? compradorPrincipal.nome : 'Não informado';
    } else if (contract.comprador_1_nome && contract.comprador_1_nome.trim() !== '') {
      nomeProponente = contract.comprador_1_nome;
    } else if (contract.cliente && contract.cliente.trim() !== '') {
      nomeProponente = contract.cliente;
    }
    
    // Tempo no status (dias)
    const tempoNoStatus = calculateTimeInStatus(contract);
    
    // Calcular SLA e gerar badge apropriado
    const sla = computeSLA(contract);
    let slaBadgeClass = 'sla-none';
    let slaBadgeIcon = '';
    let slaBadgeText = '';
    let slaBadgeTitle = '';
    
    if (sla.status === 'late') {
      slaBadgeClass = 'sla-late';
      slaBadgeIcon = '<i class="bi bi-exclamation-triangle-fill"></i>';
      slaBadgeText = 'Vencido';
      slaBadgeTitle = `SLA vencido! ${sla.elapsedDays}/${sla.targetDays} dias`;
    } else if (sla.status === 'warn') {
      slaBadgeClass = 'sla-warn';
      slaBadgeIcon = '<i class="bi bi-clock-fill"></i>';
      slaBadgeText = `${sla.elapsedDays}/${sla.targetDays}d`;
      slaBadgeTitle = `Atencao: ${sla.elapsedDays}/${sla.targetDays} dias (${sla.percent}%)`;
    } else if (sla.status === 'ok' && sla.targetDays > 0) {
      slaBadgeClass = 'sla-ok';
      slaBadgeIcon = '<i class="bi bi-check-circle-fill"></i>';
      slaBadgeText = `${sla.elapsedDays}/${sla.targetDays}d`;
      slaBadgeTitle = `No prazo: ${sla.elapsedDays}/${sla.targetDays} dias (${sla.percent}%)`;
    }

    // Calcular SLA por data (vencimentos) - apenas o mais urgente
    let dateSLABadge = '';
    if (window.SLADateConfigManager && typeof window.SLADateConfigManager.getExpiryStatus === 'function') {
      const dateAlert = window.SLADateConfigManager.getExpiryStatus(contract);
      if (dateAlert) {
        const dateClass = dateAlert.status === 'expired' ? 'sla-date-expired' : 'sla-date-warn';
        const dateIcon = dateAlert.status === 'expired'
          ? '<i class="bi bi-calendar-x-fill"></i>'
          : '<i class="bi bi-calendar-event-fill"></i>';
        // Extrair nome curto do campo (ex: "Vencimento SICAQ" -> "SICAQ", "Data Prevista Registro" -> "Prev. Registro")
        const shortName = dateAlert.label.replace(/^Vencimento\s*/i, '').replace(/^Data\s*/i, '') || dateAlert.label;
        const dateText = dateAlert.status === 'expired'
          ? `${shortName} Vencido`
          : `${shortName} em ${dateAlert.days}d`;
        const dateTitle = dateAlert.status === 'expired'
          ? `${dateAlert.label} vencido ha ${dateAlert.days} dias`
          : `${dateAlert.label} vence em ${dateAlert.days} dias`;

        dateSLABadge = `
          <span class="card-badge ${dateClass}" title="${dateTitle}">
            ${dateIcon} ${dateText}
          </span>
        `;
      }
    }

    // Empreendimento formatado
    const empreendimento = contract.empreendimento || '';
    const bloco = contract.bloco ? `Bl. ${contract.bloco}` : '';
    const apto = contract.apto ? `Ap. ${contract.apto}` : '';
    const enderecoCompleto = [empreendimento, bloco, apto].filter(Boolean).join(' - ') || 'Não informado';
    
    // CPF mascarado (últimos 2 dígitos)
    let cpfMascarado = '';
    const cpf = contract.comprador_1_cpf || contract.cpf || '';
    if (cpf && cpf.length >= 4) {
      cpfMascarado = `***.***.***-${cpf.slice(-2)}`;
    }
    
    const card = document.createElement('div');
    card.className = 'kanban-card kanban-card-enhanced';
    card.dataset.contractId = contract.id;
    
    card.innerHTML = `
      <div class="card-header-row">
        <div class="card-avatar">
          <i class="bi bi-person-fill"></i>
        </div>
        <div class="card-title-area">
          <h5 class="card-name" title="${nomeProponente}">${nomeProponente}</h5>
          ${cpfMascarado ? `<span class="card-cpf">${cpfMascarado}</span>` : ''}
        </div>
        <div class="card-quick-actions">
          <button class="btn-quick-action" data-action="pin" title="Fixar processo">
            <i class="bi bi-pin"></i>
          </button>
        </div>
      </div>
      
      <div class="card-location">
        <i class="bi bi-building"></i>
        <span title="${enderecoCompleto}">${enderecoCompleto}</span>
      </div>
      
      <div class="card-badges">
        ${sla.targetDays > 0 ? `
          <span class="card-badge ${slaBadgeClass}" title="${slaBadgeTitle}">
            ${slaBadgeIcon} ${slaBadgeText}
          </span>
        ` : ''}
        ${dateSLABadge}
        <span class="card-badge badge-time" title="Tempo neste status">
          <i class="bi bi-clock-history"></i> ${tempoNoStatus}
        </span>
        <span class="pendencias-container" data-contract-id="${contract.id}"></span>
      </div>

      <div class="card-footer-row">
        <button class="details-btn" data-id="${contract.id}">
          <i class="bi bi-eye"></i> Ver detalhes
        </button>
      </div>
    `;
    
    // Adicionar evento para ação rápida de fixar
    const pinBtn = card.querySelector('.btn-quick-action[data-action="pin"]');
    if (pinBtn) {
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pinBtn.classList.toggle('active');
        const icon = pinBtn.querySelector('i');
        icon.classList.toggle('bi-pin');
        icon.classList.toggle('bi-pin-fill');
      });
    }
    
    return card;
  }
  
  // Virtual scroll simples por coluna
  const VIRTUAL_THRESHOLD = 120; // apenas ativa virtual scroll para colunas muito grandes
  const BATCH_SIZE_CARDS = 40; // quantidade de cartões por lote
  const total = sortedContracts.length;

  if (total === 0) return column;

  if (total <= VIRTUAL_THRESHOLD) {
    // Render normal - criar wrapper para padding
    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'kanban-cards-wrapper';
    sortedContracts.forEach(c => cardWrapper.appendChild(buildKanbanCard(c)));
    cardsContainer.appendChild(cardWrapper);
    return column;
  }

  // Estrutura para virtual scroll
  const viewport = document.createElement('div');
  viewport.className = 'kanban-virtual-viewport';
  viewport.style.minHeight = '60px';

  // Placeholder de altura (estimativa) – será ajustado após primeira medição
  const averageHeight = 140; // estimativa média de card enhanced
  cardsContainer.appendChild(viewport);

  let renderedStart = 0;
  let renderedEnd = -1;
  let measuring = false;
  let cardHeights = [];

  function ensureRange(){
    const scrollTop = viewport.parentElement ? viewport.parentElement.scrollTop : 0;
    const viewHeight = viewport.parentElement ? viewport.parentElement.clientHeight : 600;
    // Estimar índice inicial e final baseado em altura média até termos medições reais
    const avg = cardHeights.length ? (cardHeights.reduce((a,b)=>a+b,0)/cardHeights.length) : averageHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / avg) - BATCH_SIZE_CARDS);
    const endIndex = Math.min(total -1, Math.ceil((scrollTop + viewHeight)/avg) + BATCH_SIZE_CARDS);
    if (startIndex === renderedStart && endIndex === renderedEnd) return;
    renderedStart = startIndex; renderedEnd = endIndex;
    renderWindow(startIndex, endIndex);
  }

  function renderWindow(start, end){
    viewport.innerHTML = '';
    // Renderiza os cards visíveis
    for (let i=start;i<=end;i++){
      const card = buildKanbanCard(sortedContracts[i]);
      viewport.appendChild(card);
    }
    if (!measuring){
      measuring = true;
      requestAnimationFrame(()=>{
        const measured = [...viewport.querySelectorAll('.kanban-card')].map(el=>el.getBoundingClientRect().height);
        if (measured.length){
          cardHeights = measured;
        }
        measuring = false;
      });
    }
  }

  // Listener de scroll no container pai (kanban-board tem scroll horizontal; cada coluna pode rolar vertical se overflow-y:auto for aplicado via CSS)
  column.addEventListener('scroll', ()=>{
    requestAnimationFrame(ensureRange);
  });
  ensureRange();
  return column;
}

/**
 * Alterna a visualização entre lista e Kanban.
 * @param {string} viewType - 'list' ou 'kanban'.
 */
export function toggleView(viewType) {
  debug(" toggleView chamada com:", viewType);
  
  const container = DOMElements.processosViewContainer;
  const toggleBtn = DOMElements.toggleViewBtn;
  
  debug(" Container encontrado:", !!container);
  debug(" Botão encontrado:", !!toggleBtn);

  if (!container) {
    debug(" toggleView ignorada: container de Processos não existe nesta página.");
    return;
  }

  if (viewType === "kanban") {
  debug(" Ativando modo Kanban");
    container.classList.remove("list-view-active");
    container.classList.add("kanban-view-active");
    if (toggleBtn) toggleBtn.textContent = "Alternar para Lista";
  debug(" Classes atualizadas para Kanban");
  } else {
  debug(" Ativando modo Lista");
    container.classList.remove("kanban-view-active");
    container.classList.add("list-view-active");
    if (toggleBtn) toggleBtn.textContent = "Alternar para Kanban";
  debug(" Classes atualizadas para Lista");
  }
  
  debug(" Classes atuais do container:", container.className);
}

/**
 * Atualiza os contadores (badges) das colunas do Kanban com base na quantidade de cartões
 */
export function updateKanbanCounters() {
  const columns = document.querySelectorAll('.kanban-column');
  columns.forEach(col => {
    const countEl = col.querySelector('.column-header .count');
    if (countEl) {
      const cards = col.querySelectorAll('.kanban-card');
      const newValue = String(cards.length);
      // Só atualiza se houver mudança real para evitar mutações desnecessárias
      if (countEl.textContent !== newValue) {
        countEl.textContent = newValue;
        countEl.classList.remove('bounce');
        // force reflow para reiniciar animação
        void countEl.offsetWidth;
        countEl.classList.add('bounce');
      }
    }
  });
}

// Observador simples que atualiza os contadores quando o DOM do Kanban muda
function setupKanbanObserver() {
  const board = DOMElements.kanbanBoard;
  if (!board) return;
  let scheduled = false;
  const obs = new MutationObserver((mutations) => {
    // Ignora mutações que não envolvam adição/remoção de cartões (evita loop ao alterar apenas o texto do contador)
    const relevant = mutations.some(m => {
      if ((m.addedNodes && m.addedNodes.length) || (m.removedNodes && m.removedNodes.length)) {
        const added = [...m.addedNodes].some(n => n.classList && n.classList.contains('kanban-card'));
        const removed = [...m.removedNodes].some(n => n.classList && n.classList.contains('kanban-card'));
        return added || removed;
      }
      return false;
    });
    if (!relevant) return;
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        try {
          updateKanbanCounters();
        } finally {
          scheduled = false;
        }
      });
    }
  });
  obs.observe(board, { childList: true, subtree: true });
}

// Tooltip fallback: exibe um pequeno tooltip com base no title quando houver mouseover
function setupBadgeTooltips() {
  document.body.addEventListener('mouseover', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('status-badge')) {
      // use title attribute already set; nada a fazer para fallback
    }
  });
}

// Inicializações para Kanban quando o módulo é carregado
document.addEventListener('DOMContentLoaded', () => {
  // Delay curto para caso o Kanban seja renderizado logo após o carregamento
  setTimeout(() => {
    updateKanbanCounters();
    setupKanbanObserver();
    setupBadgeTooltips();
  }, 200);
});

/**
 * Atualiza badges de pendências nos cards do Kanban
 * Chama o serviço de pendências para contar ativas por contrato
 */
export async function updateKanbanPendenciasBadges() {
  const badges = document.querySelectorAll('.badge-pendencias[data-contract-id]');
  if (badges.length === 0) return;
  
  // Coletar IDs únicos
  const contractIds = [...new Set([...badges].map(b => b.dataset.contractId))];
  
  try {
    // Usar serviço de pendências se disponível
    if (window.pendenciasService?.contarMultiplos) {
      const contagens = await window.pendenciasService.contarMultiplos(contractIds);
      
      badges.forEach(badge => {
        const contractId = badge.dataset.contractId;
        const count = contagens[contractId] || 0;
        const countSpan = badge.querySelector('.count');
        
        if (count > 0) {
          if (countSpan) countSpan.textContent = count;
          badge.style.display = '';
          badge.classList.add('badge-warning');
        } else {
          badge.style.display = 'none';
        }
      });
      
      console.log(` Badges de pendências atualizados para ${contractIds.length} contratos`);
    }
  } catch (error) {
    console.warn(' Erro ao atualizar badges de pendências:', error);
  }
}

/**
 * Carrega anexos do contrato atual (lazy loading)
 * Chamado quando o usuário clica na aba de anexos
 */
async function loadAnexosForCurrentContract(force = false) {
  const contractId = DOMElements.modalContractId?.value;
  if (!contractId) {
    console.warn('[Anexos] Nenhum contrato selecionado para carregar anexos');
    return;
  }

  if (isDetailsModalArchivedPendingRestore()) {
    const listContainer = document.getElementById("anexos-list");
    if (listContainer) {
      listContainer.innerHTML = getArchivedDetailsPlaceholderMarkup("anexos");
    }
    return;
  }

  // Evita recarregar se já foi carregado para este contrato
  if (anexosTabState.loading) return;
  if (!force && anexosTabState.lastLoadedContractId === contractId) return;

  anexosTabState.loading = true;
  anexosTabState.currentContractId = contractId;

  const listContainer = document.getElementById("anexos-list");
  if (listContainer) {
    listContainer.innerHTML = `
      <li class="text-muted text-center py-3">
        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
        Carregando anexos...
      </li>
    `;
  }

  try {
    const attachments = await firestore.getContractAttachments(contractId);
    renderAttachments(attachments, contractId);
    anexosTabState.lastLoadedContractId = contractId;
    debug(` [Anexos] Carregados ${attachments.length} anexos para contrato ${contractId}`);
  } catch (error) {
    console.error("[Anexos] Erro ao carregar anexos:", error);
    if (listContainer) {
      listContainer.innerHTML = `
        <li class="text-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Erro ao carregar anexos. <button class="btn btn-link btn-sm p-0" onclick="loadAnexosForCurrentContract(true)">Tentar novamente</button>
        </li>
      `;
    }
  } finally {
    anexosTabState.loading = false;
  }
}

// Expor função globalmente para retry
window.loadAnexosForCurrentContract = loadAnexosForCurrentContract;

/**
 * Reseta o estado de anexos (chamado ao abrir novo contrato)
 */
function resetAnexosTabState() {
  anexosTabState.currentContractId = null;
  anexosTabState.lastLoadedContractId = null;
  anexosTabState.loading = false;

  const listContainer = document.getElementById("anexos-list");
  if (listContainer) {
    listContainer.innerHTML = `
      <li class="text-muted text-center py-3">
        <i class="bi bi-folder2-open me-2"></i>
        Clique na aba "Anexos" para carregar os arquivos
      </li>
    `;
  }
}

// ===================== ERROS (QA) TAB =====================

/** Estado da aba de erros */
const errosTabState = {
  currentContractId: null,
  lastLoadedContractId: null,
  loading: false,
  unsubscribe: null,
  badgeUnsubscribe: null
};

/**
 * Atualiza o badge da aba de erros no details modal.
 * @param {number} pendingCount
 */
function setErrosTabBadgeCount(pendingCount = 0) {
  const badge = document.getElementById('tab-gestao-erros-badge');
  if (!badge) return;
  const safeCount = Number.isFinite(pendingCount) ? Math.max(0, pendingCount) : 0;
  badge.textContent = safeCount;
  badge.style.display = safeCount > 0 ? '' : 'none';
}

/**
 * Inicia listener leve de pendencias para atualizar badge sem abrir a aba.
 */
function startErrosBadgeListenerForCurrentContract() {
  const contractId = DOMElements.modalContractId?.value;

  if (errosTabState.badgeUnsubscribe) {
    errosTabState.badgeUnsubscribe();
    errosTabState.badgeUnsubscribe = null;
  }

  if (!contractId) {
    setErrosTabBadgeCount(0);
    return;
  }

  if (isDetailsModalArchivedPendingRestore()) {
    setErrosTabBadgeCount(0);
    return;
  }

  const svc = window.errorManagementService;
  if (!svc?.listarPendenciasVisiveis) {
    setErrosTabBadgeCount(0);
    return;
  }

  errosTabState.badgeUnsubscribe = svc.listarPendenciasVisiveis(
    'contracts',
    contractId,
    (pendingCount) => setErrosTabBadgeCount(pendingCount)
  );
}

/**
 * Carrega a secao de erros (QA) para o contrato atual.
 * Usa lazy loading - so carrega quando a aba e acessada.
 */
function loadErrosForCurrentContract(force = false) {
  const contractId = DOMElements.modalContractId?.value;
  if (!contractId) return;

  if (isDetailsModalArchivedPendingRestore()) {
    const container = document.getElementById('details-erros-container');
    if (container) {
      container.innerHTML = getArchivedDetailsPlaceholderMarkup("erros");
    }
    setErrosTabBadgeCount(0);
    return;
  }

  if (errosTabState.loading) return;
  if (!force && errosTabState.lastLoadedContractId === contractId) return;

  errosTabState.loading = true;
  errosTabState.currentContractId = contractId;

  // Limpa listener anterior
  if (errosTabState.unsubscribe) {
    errosTabState.unsubscribe();
    errosTabState.unsubscribe = null;
  }

  const container = document.getElementById('details-erros-container');
  if (!container) {
    errosTabState.loading = false;
    return;
  }

  const svc = window.errorManagementService;
  if (!svc) {
    container.innerHTML = '<p class="text-muted text-center py-3">Servico de erros nao disponivel.</p>';
    errosTabState.loading = false;
    return;
  }

  errosTabState.unsubscribe = svc.renderErrosSection(container, 'contracts', contractId, 'details');
  errosTabState.lastLoadedContractId = contractId;
  errosTabState.loading = false;
}

/**
 * Reseta o estado da aba de erros (chamado ao abrir novo contrato)
 */
function resetErrosTabState() {
  if (errosTabState.unsubscribe) {
    errosTabState.unsubscribe();
    errosTabState.unsubscribe = null;
  }
  if (errosTabState.badgeUnsubscribe) {
    errosTabState.badgeUnsubscribe();
    errosTabState.badgeUnsubscribe = null;
  }
  errosTabState.currentContractId = null;
  errosTabState.lastLoadedContractId = null;
  errosTabState.loading = false;
  setErrosTabBadgeCount(0);

  const container = document.getElementById('details-erros-container');
  if (container) {
    container.innerHTML = `
      <div class="text-center py-4">
        <div class="spinner-border text-danger" role="status">
          <span class="visually-hidden">Carregando...</span>
        </div>
        <p class="mt-2 mb-0 text-muted small">Carregando erros...</p>
      </div>`;
  }
}

/**
 * Configura a funcionalidade de abas para o modal de detalhes.
 */
export function setupTabs() {
  const modalRoot = document.getElementById("details-modal");
  if (!modalRoot) return;

  const tabButtons = modalRoot.querySelectorAll(
    ".nav-link[data-tab], .btn[data-tab]"
  );
  const tabContents = modalRoot.querySelectorAll(".tab-content");

  const setActiveTab = (targetButton) => {
    if (!targetButton) return;

    const targetTabId = targetButton.dataset.tab;
    const targetTabContent = Array.from(tabContents).find(
      (content) => content.id === `tab-${targetTabId}`
    );

    tabButtons.forEach((btn) => btn.classList.remove("active"));
    tabContents.forEach((content) => content.classList.remove("active"));

    const relatedButtons = modalRoot.querySelectorAll(
      `.nav-link[data-tab="${targetTabId}"], .btn[data-tab="${targetTabId}"]`
    );
    relatedButtons.forEach((btn) => btn.classList.add("active"));

    if (targetTabContent) {
      targetTabContent.classList.add("active");
    }

    // Reset scroll do modal-body para o topo ao trocar de aba
    const modalBody = document.querySelector('#details-modal .modal-body');
    if (modalBody) {
      modalBody.scrollTop = 0;
    }

    if (targetTabId === "whatsapp") {
      loadWhatsAppConversationForCurrentContract();
    }

    // Lazy loading de anexos - carrega apenas quando a aba for acessada
    if (targetTabId === "anexos") {
      loadAnexosForCurrentContract();
    }

    // Lazy loading de erros (QA) - carrega apenas quando a aba for acessada
    if (targetTabId === "gestao-erros") {
      loadErrosForCurrentContract();
    }

    console.log(` Navegando para aba: ${targetTabId}`);
  };

  tabButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      setActiveTab(button);
    });
  });

  const defaultActive = modalRoot.querySelector(
    ".nav-link[data-tab].active, .btn[data-tab].active"
  );
  if (defaultActive) {
    setActiveTab(defaultActive);
  }
}

function initializeWhatsAppTabForContract(contract = {}) {
  whatsappTabState.currentContractId = contract?.id || null;
  whatsappTabState.lastLoadedContractId = null;
  whatsappTabState.linkedChatId = null;
  whatsappTabState.linkedChats = [];
  whatsappTabState.messageCache = {};
  whatsappTabState.autoLinkAttempted = false;
  whatsappTabState.currentContract = contract || null;
  resetWhatsAppTabUI();

  if (!whatsappTabState.currentContractId) {
    setWhatsAppTabStatus(
      "Salve ou selecione um processo para visualizar a conversa do WhatsApp.",
      "warning"
    );
    setWhatsAppTabBadgeCount(0);
    return;
  }

  // Iniciar busca leve de contagem de conversas vinculadas para o badge
  updateWhatsAppTabBadge();

  setWhatsAppTabStatus("Selecione esta aba para carregar a conversa vinculada.");

  if (isWhatsAppTabActive()) {
    loadWhatsAppConversationForCurrentContract(true);
  }
}

function isWhatsAppTabActive() {
  return Boolean(
    document.querySelector("#details-modal #tab-whatsapp.tab-content.active")
  );
}

function resetWhatsAppTabUI() {
  whatsappTabState.loading = false;
  whatsappTabState.messagesLoading = false;
  whatsappTabState.linkedChatId = null;
  whatsappTabState.linkedChats = [];
  whatsappTabState.messageCache = {};
  whatsappTabState.autoLinkAttempted = false;
  toggleWhatsAppLoader(false);
  setWhatsAppSuggestion("");
  setWhatsAppTabBadgeCount(0);

  const wrapper = document.getElementById("whatsapp-tab-messages");
  if (wrapper) {
    wrapper.classList.add("d-none");
  }

  const list = document.getElementById("whatsapp-tab-messages-list");
  if (list) {
    list.innerHTML = "";
  }

  const emptyEl = document.getElementById("whatsapp-tab-empty");
  if (emptyEl) {
    emptyEl.classList.add("d-none");
  }

  const conversationsWrapper = document.getElementById("whatsapp-tab-conversations-wrapper");
  if (conversationsWrapper) {
    conversationsWrapper.classList.add("d-none");
  }

  const conversationsList = document.getElementById("whatsapp-tab-conversations");
  if (conversationsList) {
    conversationsList.innerHTML = "";
  }

  const conversationsCount = document.getElementById("whatsapp-tab-conversations-count");
  if (conversationsCount) {
    conversationsCount.textContent = "0";
  }

  const summary = document.getElementById("whatsapp-tab-summary");
  if (summary) {
    summary.classList.add("d-none");
    summary.innerHTML = "";
  }

  updateWhatsAppOpenPanelButton();
  setWhatsAppTabStatus("Selecione esta aba para carregar a conversa vinculada.");
}

/**
 * Atualiza o badge da aba WhatsApp no details modal.
 * @param {number} count - Quantidade de conversas vinculadas
 */
function setWhatsAppTabBadgeCount(count = 0) {
  const badge = document.getElementById('tab-whatsapp-badge');
  if (!badge) return;
  const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
  badge.textContent = safeCount;
  badge.style.display = safeCount > 0 ? '' : 'none';
}

/**
 * Busca contagem de conversas vinculadas ao contrato atual e atualiza o badge.
 * Executa de forma assincrona sem bloquear.
 */
async function updateWhatsAppTabBadge() {
  const contractId = whatsappTabState.currentContractId;
  if (!contractId) {
    setWhatsAppTabBadgeCount(0);
    return;
  }

  try {
    const chats = await whatsappService.getChatsByContractId(contractId);
    const count = Array.isArray(chats) ? chats.filter((c) => c && c.id).length : 0;
    setWhatsAppTabBadgeCount(count);

    // Se nao tem conversas vinculadas, tenta auto-link
    if (count === 0) {
      const autoLinkedCount = await attemptAutoLinkFromContract();
      if (autoLinkedCount > 0) {
        const refreshedChats = await whatsappService.getChatsByContractId(contractId, {
          forceRefresh: true,
        });
        const refreshedCount = Array.isArray(refreshedChats)
          ? refreshedChats.filter((chat) => chat && chat.id).length
          : 0;
        setWhatsAppTabBadgeCount(refreshedCount);
      }
    }
  } catch (err) {
    console.warn('[ui] Erro ao buscar badge de conversas WhatsApp:', err);
    setWhatsAppTabBadgeCount(0);
  }
}

/**
 * Coleta telefones do contrato atual para busca de conversas WhatsApp.
 * @param {Object} contract - Dados do contrato
 * @returns {string[]} Lista de candidatos de telefone
 */
function collectContractPhoneCandidates(contract) {
  if (!contract || typeof contract !== "object") return [];
  const candidates = new Set();
  const pushCandidate = (value) => {
    if (!value) return;

    const raw = String(value).trim();
    if (!raw) return;

    candidates.add(raw);

    const normalized = normalizePhoneToE164(raw);
    if (normalized) {
      candidates.add(normalized);
      const normalizedDigits = String(normalized).replace(/\D/g, "");
      if (normalizedDigits) {
        candidates.add(normalizedDigits);
      }
    }

    const digits = raw.replace(/\D/g, "");
    if (digits) {
      candidates.add(digits);

      if (digits.startsWith("55")) {
        candidates.add(`+${digits}`);
      } else if (digits.length >= 10) {
        candidates.add(`55${digits}`);
        candidates.add(`+55${digits}`);
      }
    }
  };

  const phoneFields = [
    'telefone', 'telefonePrincipal', 'telefoneSecundario', 'telefone2',
    'telefoneContato', 'telefoneCliente', 'telefoneComprador', 'telefoneTitular',
    'celular', 'celularPrincipal', 'celular2', 'celularComprador',
    'whatsapp', 'whatsappPhone', 'whatsappNumero',
    'primaryPhone', 'customerPhone', 'phoneNumber', 'phone', 'contatoTelefone'
  ];

  phoneFields.forEach((field) => {
    pushCandidate(contract[field]);
  });

  // Buscar telefones nos compradores
  if (Array.isArray(contract.compradores)) {
    contract.compradores.forEach((comprador) => {
      if (!comprador) return;
      ['telefone', 'celular', 'whatsapp', 'phone'].forEach((field) => {
        pushCandidate(comprador[field]);
      });
    });
  }

  // Campos legados de CSV (comprador_1_telefone, comprador_2_telefone, etc.)
  for (let i = 1; i <= 6; i++) {
    pushCandidate(contract[`comprador_${i}_telefone`]);
  }

  return Array.from(candidates).filter(Boolean);
}

/**
 * Tenta vincular automaticamente conversas WhatsApp ao contrato atual
 * com base nos telefones do contrato. So executa se nao ha conversas
 * vinculadas e nao foi tentado anteriormente nesta sessao do modal.
 */
async function attemptAutoLinkFromContract() {
  const contractId = whatsappTabState.currentContractId;
  const contract = whatsappTabState.currentContract;
  if (!contractId || !contract) return 0;
  if (whatsappTabState.autoLinkAttempted) return 0;
  whatsappTabState.autoLinkAttempted = true;

  const phoneCandidates = collectContractPhoneCandidates(contract);
  if (phoneCandidates.length === 0) {
    console.log('[ui] Auto-link: nenhum telefone encontrado no contrato.');
    return 0;
  }

  try {
    const chatIdCandidates = new Set();
    phoneCandidates.forEach((candidate) => {
      const raw = String(candidate || "").trim();
      if (!raw) return;

      const digits = raw.replace(/\D/g, "");
      if (digits.length >= 10) {
        chatIdCandidates.add(digits);
        if (!digits.startsWith("55")) {
          chatIdCandidates.add(`55${digits}`);
        }
      }
    });

    if (chatIdCandidates.size === 0) {
      return 0;
    }

    const chatSearchPromises = Array.from(chatIdCandidates).map((chatId) =>
      whatsappService.getChatById(chatId)
    );
    const results = (await Promise.all(chatSearchPromises)).filter(Boolean);

    // Deduplicar por ID
    const uniqueChats = new Map();
    results.forEach((chat) => {
      if (chat?.id) uniqueChats.set(chat.id, chat);
    });

    const matchedChats = Array.from(uniqueChats.values());

    if (matchedChats.length === 0) {
      console.log('[ui] Auto-link: nenhuma conversa encontrada para os telefones do contrato.');
      return 0;
    }

    // Vincular somente conversas sem vínculo prévio com outro processo
    let linkedCount = 0;
    for (const chat of matchedChats) {
      const existingContractId = chat.contractId || chat.linkedContractId || null;
      if (existingContractId && existingContractId !== contractId) {
        continue;
      }
      if (existingContractId === contractId) {
        continue;
      }

      try {
        await whatsappService.linkChatToContract(chat.id, contractId);
        linkedCount++;
        console.log(`[ui] Auto-link: conversa ${chat.id} vinculada ao contrato ${contractId}.`);
      } catch (linkErr) {
        console.warn(`[ui] Auto-link: falha ao vincular conversa ${chat.id}:`, linkErr);
      }
    }
    return linkedCount;
  } catch (err) {
    console.warn('[ui] Auto-link: erro na busca de conversas por telefone:', err);
    return 0;
  }
}

function setWhatsAppTabStatus(message, variant = "info") {
  const statusEl = document.getElementById("whatsapp-tab-status");
  if (!statusEl) return;

  const variants = {
    success: { className: "text-success", icon: "bi-check-circle" },
    warning: { className: "text-warning", icon: "bi-exclamation-triangle" },
    error: { className: "text-danger", icon: "bi-x-circle" },
    info: { className: "text-muted", icon: "bi-info-circle" },
  };

  const config = variants[variant] || variants.info;
  statusEl.className = `small mb-3 ${config.className}`;
  statusEl.innerHTML = `<i class="bi ${config.icon} me-1"></i>${escapeHtmlLight(
    message
  )}`;
}

function setWhatsAppSuggestion(message = "") {
  const suggestionEl = document.getElementById("whatsapp-tab-suggestion");
  if (!suggestionEl) return;

  if (!message) {
    suggestionEl.classList.add("d-none");
    suggestionEl.innerHTML = "";
    return;
  }

  suggestionEl.classList.remove("d-none");
  suggestionEl.innerHTML = `<i class="bi bi-chat-left-text me-1"></i>${escapeHtmlLight(
    message
  )}`;
}

function toggleWhatsAppLoader(show) {
  const loader = document.getElementById("whatsapp-tab-loader");
  if (loader) {
    loader.classList.toggle("d-none", !show);
  }
}

function updateWhatsAppOpenPanelButton() {
  const button = document.getElementById("whatsapp-tab-open-panel");
  if (!button) return;

  if (whatsappTabState.linkedChatId) {
    button.disabled = false;
    button.onclick = openWhatsAppTabChat;
  } else {
    button.disabled = true;
    button.onclick = null;
  }
}

function openWhatsAppTabChat() {
  if (!whatsappTabState.linkedChatId) return;
  navigateTo("whatsapp");
  setTimeout(() => {
    const api = window.__WHATSAPP_UI__;
    if (api?.openChat) {
      api.openChat(whatsappTabState.linkedChatId);
    }
  }, 400);
}

async function loadWhatsAppConversationForCurrentContract(force = false) {
  const contractId = whatsappTabState.currentContractId;
  if (!contractId) {
    setWhatsAppTabStatus(
      "Nenhum ID de processo disponível para carregar a conversa.",
      "warning"
    );
    updateWhatsAppOpenPanelButton();
    return;
  }

  if (whatsappTabState.loading) return;
  if (!force && whatsappTabState.lastLoadedContractId === contractId) return;

  whatsappTabState.loading = true;
  toggleWhatsAppLoader(true);
  setWhatsAppSuggestion("");
  setWhatsAppTabStatus("Carregando conversas vinculadas...");

  try {
    const chats = await whatsappService.getChatsByContractId(contractId, {
      forceRefresh: force,
    });

    whatsappTabState.linkedChats = Array.isArray(chats)
      ? chats.filter((chat) => chat && chat.id)
      : [];

    if (force) {
      whatsappTabState.messageCache = {};
    } else if (whatsappTabState.messageCache) {
      const validIds = new Set(
        whatsappTabState.linkedChats.map((chat) => chat.id)
      );
      whatsappTabState.messageCache = Object.fromEntries(
        Object.entries(whatsappTabState.messageCache).filter(([id]) =>
          validIds.has(id)
        )
      );
    }

    if (whatsappTabState.linkedChats.length === 0) {
      whatsappTabState.linkedChatId = null;
      updateWhatsAppOpenPanelButton();
      setWhatsAppTabBadgeCount(0);
      let autoLinkedCount = 0;

      // Tentar auto-vinculacao antes de mostrar "nenhuma conversa"
      if (!whatsappTabState.autoLinkAttempted) {
        setWhatsAppTabStatus("Buscando conversas pelos telefones do contrato...");
        autoLinkedCount = await attemptAutoLinkFromContract();

        if (autoLinkedCount > 0) {
          const refreshedChats = await whatsappService.getChatsByContractId(contractId, {
            forceRefresh: true,
          });
          whatsappTabState.linkedChats = Array.isArray(refreshedChats)
            ? refreshedChats.filter((chat) => chat && chat.id)
            : [];

          const validIds = new Set(
            whatsappTabState.linkedChats.map((chat) => chat.id)
          );
          whatsappTabState.messageCache = Object.fromEntries(
            Object.entries(whatsappTabState.messageCache || {}).filter(([id]) =>
              validIds.has(id)
            )
          );
        }
      }

      if (whatsappTabState.linkedChats.length === 0) {
        const emptyEl = document.getElementById("whatsapp-tab-empty");
        if (emptyEl) emptyEl.classList.remove("d-none");
        setWhatsAppTabStatus(
          "Nenhuma conversa do WhatsApp est\u00e1 vinculada a este processo.",
          "warning"
        );
        whatsappTabState.lastLoadedContractId = contractId;
        renderWhatsAppConversationsList([]);
        return;
      }

      if (autoLinkedCount > 0) {
        setWhatsAppTabStatus(
          `${autoLinkedCount} conversa(s) vinculada(s) automaticamente a este processo.`,
          "success"
        );
      }
    }

    setWhatsAppTabBadgeCount(whatsappTabState.linkedChats.length);

    const currentSelection = whatsappTabState.linkedChatId;
    const selectedChat =
      whatsappTabState.linkedChats.find((chat) => chat.id === currentSelection) ||
      whatsappTabState.linkedChats[0];

    whatsappTabState.linkedChatId = selectedChat?.id || null;
    renderWhatsAppConversationsList(whatsappTabState.linkedChats);
    updateWhatsAppOpenPanelButton();

    if (selectedChat) {
      await loadSelectedWhatsAppChat(force);
    }

    whatsappTabState.lastLoadedContractId = contractId;
  } catch (error) {
    console.error("[ui] Erro ao carregar conversa do WhatsApp:", error);
    setWhatsAppTabStatus(
      "Não foi possível carregar a conversa vinculada.",
      "error"
    );
  } finally {
    toggleWhatsAppLoader(false);
    whatsappTabState.loading = false;
  }
}

async function loadSelectedWhatsAppChat(forceMessages = false) {
  const chatId = whatsappTabState.linkedChatId;
  if (!chatId) return;

  const selectedChat = whatsappTabState.linkedChats.find((chat) => chat.id === chatId);
  if (!selectedChat) return;

  if (whatsappTabState.messagesLoading) return;
  whatsappTabState.messagesLoading = true;

  try {
    updateWhatsAppTabSummary(selectedChat);

    let messages = [];
    if (!forceMessages && whatsappTabState.messageCache[chatId]) {
      messages = whatsappTabState.messageCache[chatId];
    } else {
      messages = await whatsappService.getChatMessages(chatId, 100);
      whatsappTabState.messageCache[chatId] = messages;
    }

    renderWhatsAppMessagesList(messages);

    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      setWhatsAppTabStatus(
        `Última mensagem registrada em ${formatWhatsAppTimestamp(lastMessage.timestamp)}.`
      );
      setWhatsAppSuggestion(
        `Exibindo ${messages.length} mensagens recentes da conversa selecionada.`
      );
    } else {
      setWhatsAppTabStatus(
        "Conversa selecionada encontrada, mas sem mensagens registradas.",
        "info"
      );
      setWhatsAppSuggestion("");
    }

    highlightSelectedWhatsAppConversation();
  } catch (error) {
    console.error("[ui] Falha ao carregar mensagens da conversa selecionada:", error);
    setWhatsAppTabStatus(
      "Não foi possível carregar as mensagens da conversa selecionada.",
      "error"
    );
  } finally {
    whatsappTabState.messagesLoading = false;
  }
}

function renderWhatsAppConversationsList(chats = []) {
  const wrapper = document.getElementById("whatsapp-tab-conversations-wrapper");
  const list = document.getElementById("whatsapp-tab-conversations");
  const countEl = document.getElementById("whatsapp-tab-conversations-count");

  if (!wrapper || !list) return;

  list.innerHTML = "";

  if (!Array.isArray(chats) || chats.length === 0) {
    wrapper.classList.add("d-none");
    if (countEl) countEl.textContent = "0";
    return;
  }

  const html = chats.map((chat) => renderWhatsAppConversationItem(chat)).join("");
  list.innerHTML = html;
  wrapper.classList.remove("d-none");
  if (countEl) countEl.textContent = String(chats.length);

  const items = list.querySelectorAll("[data-chat-id]");
  items.forEach((element) => {
    element.addEventListener("click", () => {
      const chatId = element.getAttribute("data-chat-id");
      selectWhatsAppConversation(chatId);
    });
  });

  highlightSelectedWhatsAppConversation();
}

function renderWhatsAppConversationItem(chat = {}) {
  const id = chat.id ? String(chat.id) : "";
  const customerName = chat.customerName || chat.displayName || chat.nome || "Cliente";
  const phone = chat.phoneNumberDisplay || chat.phoneNumber || chat.numero || "--";
  const status = chat.status || "Sem status";
  const statusBadge = getWhatsAppStatusBadge(status);
  const timestamp = chat.lastMessageTimestamp || chat.updatedAt || chat.createdAt;
  const timeLabel = formatWhatsAppTimestamp(timestamp);
  const agentName = chat.agentName || "";

  return `
    <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-start" data-chat-id="${escapeHtmlLight(id)}">
      <div class="me-3 text-start">
        <div class="fw-semibold text-truncate" style="max-width: 220px;">
          ${escapeHtmlLight(customerName)}
        </div>
        <div class="small text-muted text-truncate" style="max-width: 220px;">
          ${escapeHtmlLight(phone)}
        </div>
      </div>
      <div class="text-end">
        <span class="badge bg-${statusBadge}">${escapeHtmlLight(status)}</span>
        <div class="small text-muted mt-1">${escapeHtmlLight(timeLabel || "--")}</div>
        ${
          agentName
            ? `<div class="small text-muted"><i class="bi bi-person-workspace me-1"></i>${escapeHtmlLight(
                agentName
              )}</div>`
            : ""
        }
      </div>
    </button>
  `;
}

function highlightSelectedWhatsAppConversation() {
  const list = document.getElementById("whatsapp-tab-conversations");
  if (!list) return;

  const activeId = whatsappTabState.linkedChatId;
  list.querySelectorAll("[data-chat-id]").forEach((element) => {
    const elementId = element.getAttribute("data-chat-id");
    element.classList.toggle("active", elementId === activeId);
  });
}

async function selectWhatsAppConversation(chatId, { forceMessages = false } = {}) {
  if (!chatId || whatsappTabState.loading) {
    return;
  }

  const exists = whatsappTabState.linkedChats.some((chat) => chat.id === chatId);
  if (!exists) {
    return;
  }

  const isSameChat = whatsappTabState.linkedChatId === chatId;
  whatsappTabState.linkedChatId = chatId;
  updateWhatsAppOpenPanelButton();
  highlightSelectedWhatsAppConversation();

  if (isSameChat && !forceMessages) {
    return;
  }

  const hasCachedMessages =
    !forceMessages && Array.isArray(whatsappTabState.messageCache?.[chatId]);

  if (!hasCachedMessages) {
    toggleWhatsAppLoader(true);
  }
  try {
    await loadSelectedWhatsAppChat(forceMessages);
  } finally {
    if (!hasCachedMessages) {
      toggleWhatsAppLoader(false);
    }
  }
}

function updateWhatsAppTabSummary(chat) {
  const summary = document.getElementById("whatsapp-tab-summary");
  if (!summary) return;

  if (!chat) {
    summary.classList.add("d-none");
    summary.innerHTML = "";
    return;
  }

  const customerName = chat.customerName || chat.displayName || "Cliente";
  const phone =
    chat.phoneNumberDisplay || chat.phoneNumber || chat.numero || "--";
  const agentName = chat.agentName;
  const status = chat.status || "";
  const statusDisplay = status || "Sem status";

  summary.classList.remove("d-none");
  summary.innerHTML = `
    <div>
      <strong>${escapeHtmlLight(customerName)}</strong>
      <div class="small text-muted">${escapeHtmlLight(phone)}</div>
    </div>
    <div class="text-end">
      <span class="badge bg-${getWhatsAppStatusBadge(status)}">${escapeHtmlLight(
    statusDisplay
  )}</span>
      ${
        agentName
          ? `<div class="small text-muted mt-1"><i class="bi bi-person-workspace me-1"></i>${escapeHtmlLight(
              agentName
            )}</div>`
          : ""
      }
    </div>
  `;
}

function renderWhatsAppMessagesList(messages = []) {
  const wrapper = document.getElementById("whatsapp-tab-messages");
  const list = document.getElementById("whatsapp-tab-messages-list");
  const emptyEl = document.getElementById("whatsapp-tab-empty");
  if (!wrapper || !list) return;

  list.innerHTML = "";

  if (!Array.isArray(messages) || messages.length === 0) {
    wrapper.classList.add("d-none");
    if (emptyEl) emptyEl.classList.remove("d-none");
    return;
  }

  const html = messages.map(renderWhatsAppMessageItem).join("");
  list.innerHTML = html;
  wrapper.classList.remove("d-none");
  if (emptyEl) emptyEl.classList.add("d-none");
}

function renderWhatsAppMessageItem(msg = {}) {
  const isOutbound = msg.direction === "outbound";
  const authorLabel = isOutbound ? "Equipe" : "Cliente";
  const badgeClass = isOutbound ? "bg-success" : "bg-secondary";
  const timeLabel = formatWhatsAppTimestamp(msg.timestamp);
  const statusIcon = isOutbound
    ? msg.read === true || msg.status === "read"
      ? ' <i class="bi bi-check2-all text-primary ms-1"></i>'
      : ' <i class="bi bi-check2 ms-1"></i>'
    : "";
  const content = renderWhatsAppMessageContent(msg);

  return `
    <div class="list-group-item border-0 border-bottom px-3 py-2">
      <div class="d-flex align-items-center gap-2">
        <span class="badge ${badgeClass}">${authorLabel}</span>
        <small class="text-muted">${timeLabel}${statusIcon}</small>
      </div>
      <div class="mt-2">${content}</div>
    </div>
  `;
}

function renderWhatsAppMessageContent(msg = {}) {
  if (msg.mediaUrl) {
    const fileLabel = escapeHtmlLight(msg.fileName || "Arquivo");
    const rawUrl = sanitizeUrl(msg.mediaUrl);
    const download = rawUrl
      ? `<a href="${escapeHtmlLight(rawUrl)}" class="btn btn-sm btn-outline-primary" target="_blank" rel="noopener"><i class="bi bi-paperclip me-1"></i>${fileLabel}</a>`
      : '<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle me-1"></i>Arquivo indisponível</span>';
    const caption = msg.caption
      ? `<p class="mb-0 mt-2">${escapeHtmlLight(msg.caption)}</p>`
      : "";
    return `${download}${caption}`;
  }

  const text = msg.text || msg.body || "";
  if (!text) {
    return '<p class="mb-0 text-muted fst-italic">Mensagem sem conteúdo.</p>';
  }

  return `<p class="mb-0">${escapeHtmlLight(text).replace(/\n/g, "<br>")}</p>`;
}

function formatWhatsAppTimestamp(timestamp) {
  const date = normalizeWhatsAppTimestamp(timestamp);
  if (!date) return "--";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const options = sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };
  return date.toLocaleString("pt-BR", options);
}

function normalizeWhatsAppTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "number") {
    return new Date(value);
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  if (typeof value._seconds === "number") {
    return new Date(value._seconds * 1000);
  }
  return null;
}

function escapeHtmlLight(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(url) {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return "";
}

function getWhatsAppStatusBadge(status = "") {
  const normalized = String(status || "").toLowerCase();
  switch (normalized) {
    case "resolvido":
      return "success";
    case "aguardando":
    case "novo":
      return "warning";
    case "atribuido":
    case "ativo":
      return "primary";
    case "transferido":
      return "secondary";
    default:
      return "secondary";
  }
}

window.addEventListener("whatsapp:chatLinked", (event) => {
  const detail = event.detail || {};
  if (!detail.contractId || detail.contractId !== whatsappTabState.currentContractId) {
    return;
  }

  whatsappTabState.lastLoadedContractId = null;
  whatsappTabState.autoLinkAttempted = false;
  whatsappTabState.linkedChatId = detail.chatId || whatsappTabState.linkedChatId;

  if (isWhatsAppTabActive()) {
    loadWhatsAppConversationForCurrentContract(true);
  } else {
    setWhatsAppTabStatus(
      "Uma conversa do WhatsApp foi vinculada a este processo. Abra esta aba para visualizar.",
      "info"
    );
  }
});

window.addEventListener("whatsapp:chatUnlinked", (event) => {
  const detail = event.detail || {};
  if (!detail.contractId || detail.contractId !== whatsappTabState.currentContractId) {
    return;
  }

  whatsappTabState.lastLoadedContractId = null;
  whatsappTabState.autoLinkAttempted = false;
  whatsappTabState.linkedChatId = null;
  resetWhatsAppTabUI();
  setWhatsAppTabStatus("Conversa do WhatsApp desvinculada deste processo.", "warning");
});

/**
 * Cria e retorna o HTML para um único comprador.
 * @param {object} comprador - Dados do comprador (nome, cpf, etc.).
 * @param {number} index - O índice do comprador na lista.
 * @returns {HTMLElement} O elemento <div> completo.
 */
export function createCompradorFields(comprador = {}, index) {
  const compradorDiv = document.createElement("div");
  // Usaremos uma classe 'card' para um melhor design
  compradorDiv.className = "comprador-item comprador-card";

  const nome = sanitizeStringValue(comprador.nome);
  const cpf = sanitizeStringValue(comprador.cpf);
  const email = sanitizeStringValue(comprador.email);
  const telefone = comprador.telefone
    ? formatPhoneToE164(comprador.telefone)
    : "";
  const estadoCivil = sanitizeStringValue(comprador.estadoCivil);
  const filiacaoPai = sanitizeStringValue(comprador.filiacaoPai || comprador.filiacao_pai);
  const filiacaoMae = sanitizeStringValue(comprador.filiacaoMae || comprador.filiacao_mae);
  const rg = sanitizeStringValue(comprador.rg);
  const orgaoExpedidor = sanitizeStringValue(comprador.orgaoExpedidor || comprador.orgao_expedidor);
  const nascimento = sanitizeStringValue(comprador.nascimento);
  const nacionalidade = sanitizeStringValue(comprador.nacionalidade);
  const profissao = sanitizeStringValue(comprador.profissao);
  const endereco = sanitizeStringValue(comprador.endereco);
  const cidade = sanitizeStringValue(comprador.cidade);
  const uf = sanitizeStringValue(comprador.uf);
  const cep = sanitizeStringValue(comprador.cep);

  // Operador ternário para decidir se mostra o indicador "Principal" ou o botão "Tornar Principal"
  const acaoPrincipal = comprador.principal
    ? '<span class="principal-badge">⭐ Principal</span>'
    : '<a href="#" class="comprador-action-link" data-action="set-principal">Tornar Principal</a>';

  compradorDiv.innerHTML = `
    <div class="comprador-header">
      <h4>Comprador ${index + 1}</h4>
      <div class="comprador-actions">
        ${acaoPrincipal}
        ${
          index > 0
            ? '<a href="#" class="comprador-action-link remove-comprador-link">Remover</a>'
            : ""
        }
      </div>
    </div>
    <div class="comprador-body">
        <div class="form-grid-advanced" style="grid-template-columns: 1fr 1fr; gap: 15px;">
            <input type="text" placeholder="Nome" data-field="nome" value="${nome}">
            <input type="text" placeholder="CPF" data-field="cpf" value="${cpf}" maxlength="14">
            <input type="email" placeholder="E-mail" data-field="email" value="${email}">
            <input type="tel" placeholder="Telefone" data-field="telefone" value="${telefone}">
            <input type="radio" name="comprador_principal" data-field="principal" ${
              comprador.principal ? "checked" : ""
            } style="display: none;">
        </div>
        <div class="form-grid-advanced mt-3" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px;">
          <div class="form-group">
            <label class="small text-muted">Estado Civil</label>
            <select data-field="estadoCivil" class="form-select form-select-sm">
              <option value="" ${estadoCivil === "" ? "selected" : ""}>Selecionar</option>
              <option value="solteiro" ${estadoCivil === "solteiro" ? "selected" : ""}>Solteiro(a)</option>
              <option value="casado" ${estadoCivil === "casado" ? "selected" : ""}>Casado(a)</option>
              <option value="uniao_estavel" ${estadoCivil === "uniao_estavel" ? "selected" : ""}>União estável</option>
              <option value="divorciado" ${estadoCivil === "divorciado" ? "selected" : ""}>Divorciado(a)</option>
              <option value="separado" ${estadoCivil === "separado" ? "selected" : ""}>Separado(a)</option>
              <option value="viuvo" ${estadoCivil === "viuvo" ? "selected" : ""}>Viúvo(a)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="small text-muted">Filiação (Pai)</label>
            <input type="text" class="form-control form-control-sm" data-field="filiacaoPai" value="${filiacaoPai}" placeholder="Nome do pai" />
          </div>
          <div class="form-group">
            <label class="small text-muted">Filiação (Mãe)</label>
            <input type="text" class="form-control form-control-sm" data-field="filiacaoMae" value="${filiacaoMae}" placeholder="Nome da mãe" />
          </div>
          <div class="form-group">
            <label class="small text-muted">RG</label>
            <input type="text" class="form-control form-control-sm" data-field="rg" value="${rg}" />
          </div>
          <div class="form-group">
            <label class="small text-muted">Órgão Expedidor</label>
            <input type="text" class="form-control form-control-sm" data-field="orgaoExpedidor" value="${orgaoExpedidor}" />
          </div>
          <div class="form-group">
            <label class="small text-muted">Data de Nascimento</label>
            <input type="date" class="form-control form-control-sm" data-field="nascimento" value="${nascimento}" />
          </div>
          <div class="form-group">
            <label class="small text-muted">Nacionalidade</label>
            <input type="text" class="form-control form-control-sm" data-field="nacionalidade" value="${nacionalidade}" />
          </div>
          <div class="form-group">
            <label class="small text-muted">Profissão</label>
            <input type="text" class="form-control form-control-sm" data-field="profissao" value="${profissao}" />
          </div>
          <div class="form-group span-2">
            <label class="small text-muted">Endereço Residencial</label>
            <input type="text" class="form-control form-control-sm" data-field="endereco" value="${endereco}" placeholder="Rua, número, complemento" />
          </div>
          <div class="form-group">
            <label class="small text-muted">Cidade</label>
            <input type="text" class="form-control form-control-sm" data-field="cidade" value="${cidade}" />
          </div>
          <div class="form-group">
            <label class="small text-muted">UF</label>
            <input type="text" class="form-control form-control-sm" maxlength="2" data-field="uf" value="${uf}" />
          </div>
          <div class="form-group">
            <label class="small text-muted">CEP</label>
            <input type="text" class="form-control form-control-sm" data-field="cep" value="${cep}" />
          </div>
        </div>
    </div>
    `;

  // Aplica máscara de CPF
  const cpfInput = compradorDiv.querySelector('input[data-field="cpf"]');
  if (cpfInput) {
    applyCPFMask(cpfInput);
  }

  return compradorDiv;
}

/**
 * Cria e retorna o HTML para uma linha de gasto adicional.
 * @param {object} gasto - Dados do gasto (descricao, valor).
 * @returns {HTMLElement} O elemento <div> completo da linha.
 */
export function createGastoRow(gasto = {}) {
  const gastoDiv = document.createElement("div");
  gastoDiv.className = "dynamic-row gasto-item";
  gastoDiv.innerHTML = `
        <input type="text" class="gasto-descricao" placeholder="Descrição do gasto" value="${
          gasto.descricao || ""
        }">
        <input type="number" class="gasto-valor" step="0.01" placeholder="0.00" value="${
          gasto.valor || ""
        }">
        <button type="button" class="btn-danger remove-row-btn" title="Remover Gasto">&times;</button>
    `;
  return gastoDiv;
}

/**
 * Cria e retorna o HTML para uma linha de repasse.
 * @param {object} repasse - Dados do repasse (origem, valor).
 * @returns {HTMLElement} O elemento <div> completo da linha.
 */
export function createRepasseRow(repasse = {}) {
  const repasseDiv = document.createElement("div");
  repasseDiv.className = "dynamic-row repasse-item";
  repasseDiv.innerHTML = `
        <input type="text" class="repasse-origem" placeholder="Origem do valor (ex: Cliente)" value="${
          repasse.origem || ""
        }">
        <input type="number" class="repasse-valor" step="0.01" placeholder="0.00" value="${
          repasse.valor || ""
        }">
        <button type="button" class="btn-danger remove-row-btn" title="Remover Repasse">&times;</button>
    `;
  return repasseDiv;
}

/**
 * Calcula e atualiza os totais e o saldo na aba de fechamento.
 */
export function updateFechamentoCalculations() {
  // Valores de referência (somente leitura)
  const valorITBI =
    parseFloat(document.getElementById("modal-valorITBI").value) || 0;
  const valorFinalRi =
    parseFloat(document.getElementById("modal-valorFinalRi").value) || 0;
  const valorFunrejus =
    parseFloat(document.getElementById("modal-valorFunrejus").value) || 0;

  // Exibe os valores de referência na aba de fechamento
  const formatCurrency = (value) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  document.getElementById("display-valorITBI").textContent =
    formatCurrency(valorITBI);
  document.getElementById("display-valorFinalRi").textContent =
    formatCurrency(valorFinalRi);
  document.getElementById("display-valorFunrejus").textContent =
    formatCurrency(valorFunrejus);

  // Débitos
  let totalDebitos = valorITBI + valorFinalRi + valorFunrejus;
  totalDebitos +=
    parseFloat(document.getElementById("modal-valorDespachante").value) || 0;

  document.querySelectorAll(".gasto-item .gasto-valor").forEach((input) => {
    totalDebitos += parseFloat(input.value) || 0;
  });

  // Repasses
  let totalRepasses = 0;
  document.querySelectorAll(".repasse-item .repasse-valor").forEach((input) => {
    totalRepasses += parseFloat(input.value) || 0;
  });

  // Saldo
  const saldoFinal = totalRepasses - totalDebitos;

  // Atualiza a UI
  document.getElementById("total-debitos").textContent =
    formatCurrency(totalDebitos);
  document.getElementById("total-repasses").textContent =
    formatCurrency(totalRepasses);
  const saldoFinalEl = document.getElementById("saldo-final");
  saldoFinalEl.textContent = formatCurrency(saldoFinal);

  // Adiciona cor para feedback visual
  saldoFinalEl.classList.remove("saldo-positivo", "saldo-negativo", "saldo-zerado");
  if (saldoFinal > 0) {
    saldoFinalEl.classList.add("saldo-positivo");
  } else if (saldoFinal < 0) {
    saldoFinalEl.classList.add("saldo-negativo");
  } else {
    saldoFinalEl.classList.add("saldo-zerado");
  }
}

/**
 * Cria e retorna o elemento HTML para uma única entrada no histórico de anotações.
 * @param {object} anotacao - O objeto da anotação {texto, usuario, data, editadoEm?, melhoradoComIA?}.
 * @param {string|null} currentUserEmail - Email do usuário atual para verificar permissão de edição.
 * @returns {HTMLElement} O elemento <div> da anotação.
 */
export function renderAnotacaoEntry(anotacao, currentUserEmail = null) {
  const anotacaoSafe =
    anotacao && typeof anotacao === "object" ? anotacao : {};
  const itemDiv = document.createElement("div");
  itemDiv.className = "anotacao-item";

  // Verifica se o usuário atual é o autor da anotação
  const isAuthor = currentUserEmail &&
    (anotacaoSafe.usuarioEmail === currentUserEmail || anotacaoSafe.usuario === currentUserEmail);

  const formatAnnotationDate = (value) => {
    const date = normalizeTimestamp(value);
    if (!date) return "Data não informada";
    return date.toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  // Converte timestamps do Firestore, Date, string ISO ou objetos serializados {seconds,_seconds}
  const dataFormatada = formatAnnotationDate(anotacaoSafe.data);

  // Verifica se foi editado
  const foiEditado = !!anotacaoSafe.editadoEm;
  let editadoFormatado = '';
  if (foiEditado) {
    editadoFormatado = formatAnnotationDate(anotacaoSafe.editadoEm);
  }

  const textoBase =
    typeof anotacaoSafe.texto === "string"
      ? anotacaoSafe.texto
      : String(anotacaoSafe.texto || "");
  const textoLimpo = textoBase.replace(/\n/g, "<br>"); // Converte quebras de linha

  // Gera ID único para o elemento
  const entryId = `anotacao-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  itemDiv.id = entryId;

  // O objeto de dados completo é guardado no elemento para fácil recuperação
  itemDiv.dataset.anotacao = JSON.stringify(anotacaoSafe);

  itemDiv.innerHTML = `
        <div class="anotacao-content">
            <p class="anotacao-texto">${textoLimpo}</p>
            <div class="anotacao-meta">
                <strong>${anotacaoSafe.usuario || "Sistema"}</strong> em ${dataFormatada}
                ${foiEditado ? `<span class="anotacao-editado" title="Editado em ${editadoFormatado}"><i class="bi bi-pencil-fill"></i> editado</span>` : ''}
                ${anotacaoSafe.melhoradoComIA ? `<span class="anotacao-ia-badge" title="Melhorado com IA"><i class="bi bi-stars"></i></span>` : ''}
            </div>
        </div>
        ${isAuthor ? `
        <div class="anotacao-actions">
            <button type="button" class="btn btn-sm btn-outline-secondary edit-anotacao-btn" data-entry-id="${entryId}" title="Editar anotação">
                <i class="bi bi-pencil"></i>
            </button>
        </div>
        ` : ''}
    `;
  return itemDiv;
}

/**
 * Popula a tela de relatórios com checkboxes para cada campo exportável.
 */
export function populateFieldsForExport() {
  if (!DOMElements.reportFieldsContainer) return;

  DOMElements.reportFieldsContainer.innerHTML = ""; // Limpa antes de popular
  EXPORTABLE_FIELDS.forEach((field) => {
    const div = document.createElement("div");
    div.className = "field-checkbox-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `field-${field.key}`;
    checkbox.value = field.key;
    checkbox.checked = true; // Começam todos selecionados

    const label = document.createElement("label");
    label.htmlFor = `field-${field.key}`;
    label.textContent = field.label;

    div.appendChild(checkbox);
    div.appendChild(label);
    DOMElements.reportFieldsContainer.appendChild(div);
  });
}

/**
 * Popula o modal de seleção de colunas com checkboxes.
 * @param {Array} currentVisibleKeys - As chaves das colunas atualmente visíveis.
 */
export function populateColumnSelector(currentVisibleKeys) {
  const container = DOMElements.columnSelectorGrid;
  if (!container) return;
  container.innerHTML = "";

  TABLE_COLUMNS.forEach((field) => {
    const div = document.createElement("div");
    div.className = "column-checkbox-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `col-${field.key}`;
    checkbox.value = field.key;
    checkbox.checked = currentVisibleKeys.includes(field.key);

    const labelElement = document.createElement("label");
    labelElement.htmlFor = `col-${field.key}`;
    labelElement.textContent = field.label;

    div.appendChild(checkbox);
    div.appendChild(labelElement);
    container.appendChild(div);
  });
}

/**
 * Aplica a visibilidade das colunas na tabela.
 * @param {Array} visibleKeys - As chaves das colunas que devem ser visíveis.
 */
export function applyColumnVisibility(visibleKeys) {
  const allHeaders = DOMElements.tableHeader.querySelectorAll("th");
  const allRows = DOMElements.contractList.querySelectorAll("tr");

  allHeaders.forEach((th) => {
    const key = th.dataset.sortKey;
    if (key && !visibleKeys.includes(key)) {
      th.classList.add("hidden-column");
    } else {
      th.classList.remove("hidden-column");
    }
  });

  allRows.forEach((tr) => {
    tr.querySelectorAll("td").forEach(() => {
      // NOTA: Esta lógica é mais complexa, pois depende da ordem das colunas.
      // Por simplicidade, usaremos uma abordagem de estilo.
      // Uma abordagem mais robusta seria usar data-attributes nas células,
      // mas a refatoração do renderContracts seria necessária.
    });
  });
}

/**
 * Extrai os dados do formulário do modal de adicionar novo processo.
 * @returns {object} Um objeto com os dados do formulário.
 */
export function getAddFormData() {
  const data = {};

  // Coleta campos simples
  data.vendedorConstrutora = DOMElements.addVendedorConstrutora.value;
  data.empreendimento = DOMElements.addEmpreendimento.value;
  data.apto = DOMElements.addApto.value;
  data.bloco = DOMElements.addBloco.value;

  // Workflow ID
  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : "";
  };
  const rawWorkflowAdd = getVal("add-workflowId");
  const normalizedWorkflowAdd = rawWorkflowAdd ? rawWorkflowAdd.trim().toLowerCase() : "";
  if (normalizedWorkflowAdd) {
    data.workflowId = normalizedWorkflowAdd;
    data.workflowType = normalizedWorkflowAdd; // Mantém compatibilidade com legado
  }

  // Coleta os dados dos compradores
  const rawCompradores = [];
  const compradorItems =
    DOMElements.addCompradoresContainer.querySelectorAll(".comprador-item");
  compradorItems.forEach((item) => {
    const comprador = {};
    item.querySelectorAll("[data-field]").forEach((field) => {
      const fieldName = field.dataset.field;

      if (field.type === "radio") {
        comprador[fieldName] = field.checked;
        return;
      }

      const rawValue = typeof field.value === "string" ? field.value.trim() : field.value;

      if (fieldName === "telefone") {
        const normalizedPhone = rawValue ? normalizePhoneToE164(rawValue) : "";
        comprador[fieldName] = normalizedPhone || rawValue || "";
        if (normalizedPhone && field.value !== normalizedPhone) {
          field.value = normalizedPhone;
        }
      } else {
        comprador[fieldName] = sanitizeStringValue(rawValue);
      }
    });
    rawCompradores.push(comprador);
  });
  data.compradores = prepareCompradoresForStorage(rawCompradores);

  // Define o cliente principal para a exibição na tabela
  const compradorPrincipal = getPrimaryComprador(data.compradores);
  data.clientePrincipal = compradorPrincipal.nome || "";

  // Define a data de entrada como a data atual
  data.entrada = new Date();

  // Define statusChangedAt para o SLA começar a contar na criação do processo
  data.statusChangedAt = new Date();

  // Status selecionado pelo usuário
  const selectedStatus = getVal("add-status");
  if (selectedStatus) {
    data.status = selectedStatus;
    // Busca o statusOrder do status selecionado
    const statusInfo = getStatusConfigList().find(s => s.text === selectedStatus);
    data.statusOrder = statusInfo ? statusInfo.order : 1.0;
  } else {
    // Fallback: usa o primeiro status ativo da lista
    const statusList = getStatusConfigList().filter(s => s.isActive !== false);
    if (statusList.length > 0) {
      data.status = statusList[0].text;
      data.statusOrder = statusList[0].order;
    } else {
      // Fallback final
      data.status = "Aguardando";
      data.statusOrder = 1.0;
    }
  }

  return data;
}

/**
 * Controla a visibilidade dos botões de status.
 * @param {string} currentStatus - O status atual do contrato.
 * @param {boolean} showOnlyRelevant - True para mostrar a visão sequencial, false para mostrar tudo.
 */
export function toggleStatusButtonVisibility(currentStatus, showOnlyRelevant) {
  const allStatusButtons = document.querySelectorAll(
    "#status-action-container .status-btn"
  );
  const statusConfig = getStatusConfigList().find((s) => s.text === currentStatus);

  // Se for para mostrar TUDO
  if (!showOnlyRelevant || !statusConfig) {
    allStatusButtons.forEach((button) => {
      button.classList.remove("hidden-by-toggle");
    });
    return;
  }

  // Lógica para mostrar apenas os relevantes
  const currentOrder = statusConfig.order;
  const nextSteps = statusConfig.nextSteps || [];

  // Se nextSteps estiver vazio, mostra todos os status (comportamento permissivo)
  if (nextSteps.length === 0) {
    allStatusButtons.forEach((button) => {
      button.classList.remove("hidden-by-toggle");
    });
    return;
  }

  // Cria um Set com os status que devem ficar visíveis
  const visibleStatuses = new Set(nextSteps);
  visibleStatuses.add(currentStatus); // Adiciona o status atual

  // Adiciona até 2 status anteriores
  const allStatusesSorted = [...getStatusConfigList()].sort(
    (a, b) => a.order - b.order
  );
  const currentIndex = allStatusesSorted.findIndex(
    (s) => s.order === currentOrder
  );
  if (currentIndex > 0)
    visibleStatuses.add(allStatusesSorted[currentIndex - 1].text);
  if (currentIndex > 1)
    visibleStatuses.add(allStatusesSorted[currentIndex - 2].text);

  // Itera sobre todos os botões e aplica a lógica
  allStatusButtons.forEach((button) => {
    const buttonStatus = button.dataset.status;
    if (visibleStatuses.has(buttonStatus)) {
      button.classList.remove("hidden-by-toggle");
    } else {
      button.classList.add("hidden-by-toggle");
    }
  });
}

/**
 * Abre o modal de edição de regra para um status específico.
 * @param {string} statusName - O nome do status a ser editado.
 */
export async function openRuleEditModal(statusName) {
  const modal = document.getElementById("edit-rule-modal");
  const statusNameSpan = document.getElementById("rule-modal-status-name");
  const fieldsContainer = document.getElementById("rule-fields-container");
  const form = document.getElementById("edit-rule-form");

  if (!modal || !statusNameSpan || !fieldsContainer || !form) {
    console.error("Elementos do modal de edição de regras não encontrados");
    showNotification("Erro: Modal não configurado corretamente.", "error");
    return;
  }

  // Guarda o nome do status no próprio formulário para uso posterior
  form.dataset.statusName = statusName;
  statusNameSpan.textContent = statusName;
  fieldsContainer.innerHTML = "<p>A carregar campos...</p>";
  
  const editRuleInstance = window.bootstrap?.Modal
    ? window.bootstrap.Modal.getOrCreateInstance(modal)
    : null;

  if (editRuleInstance) {
    editRuleInstance.show();
  } else {
    // Fallback CSS-only
    modal.classList.remove('hidden');
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  try {
    // 1. Busca a regra ATUAL para este status no Firestore.
    const rule = await firestore.getStatusRule(statusName);
    const requiredFieldIds = new Set(
      rule ? rule.requiredFields.map((f) => f.fieldId) : []
    );
    const visibleFieldIds = new Set(
      rule && Array.isArray(rule.visibleFields) ? rule.visibleFields.map((f) => f.fieldId || f) : []
    );

    fieldsContainer.innerHTML = ""; // Limpa a mensagem de "carregando".

    // 2. Mantém compatibilidade, mas não bloqueia se FIELDS_TO_TRACK não existir
    if (!FIELDS_TO_TRACK || typeof FIELDS_TO_TRACK !== 'object') {
      if (window.__DEBUG__) console.warn('FIELDS_TO_TRACK ausente — seguindo com detecção via DOM');
    }

    // 2.1 Campo de busca
    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'mb-2';
    searchWrapper.innerHTML = `
      <div class="input-group input-group-sm">
        <span class="input-group-text"><i class="bi bi-search"></i></span>
        <input type="text" class="form-control" id="rule-fields-search" placeholder="Pesquisar campos..." aria-label="Pesquisar campos">
        <button class="btn btn-outline-secondary" type="button" id="rule-fields-clear" title="Limpar">
          <i class="bi bi-x-circle"></i>
        </button>
      </div>
    `;
    fieldsContainer.appendChild(searchWrapper);

    // Cabeçalho de grupo: Campos obrigatórios
    const reqHeader = document.createElement('h4');
    reqHeader.textContent = 'Campos obrigatórios para avançar';
    reqHeader.className = 'mt-2 mb-2';
    fieldsContainer.appendChild(reqHeader);

    // 3a. Lista de campos obrigatórios
    const reqList = document.createElement('div');
    reqList.className = 'fields-selection-grid';
    fieldsContainer.appendChild(reqList);

    // Cabeçalho de grupo: Campos visíveis no Detalhes
    const visHeader = document.createElement('h4');
    visHeader.textContent = 'Campos visíveis no modal de Detalhes';
    visHeader.className = 'mt-3 mb-2';
    fieldsContainer.appendChild(visHeader);

    const visList = document.createElement('div');
    visList.className = 'fields-selection-grid';
    fieldsContainer.appendChild(visList);

    // 3. Obter apenas campos existentes nas abas "Formulários" e "Registro" do modal de detalhes
    const scopeIds = ['tab-formularios', 'tab-registro'];
    const seen = new Set();
    const collectFields = [];
    scopeIds.forEach((sid) => {
      const container = document.getElementById(sid);
      if (!container) return;
      container.querySelectorAll('input, select, textarea').forEach((el) => {
        if (!el.id || !el.id.startsWith('modal-')) return;
        if (seen.has(el.id)) return;
        seen.add(el.id);
        // Tenta descobrir o label mais amigável
        let labelText = '';
        const explicit = container.querySelector(`label[for='${el.id}']`);
        if (explicit && explicit.textContent) {
          labelText = explicit.textContent.trim();
        } else {
          const wrap = el.closest('.form-group, .form-floating, .inline-suggest-wrapper');
          const innerLabel = wrap ? wrap.querySelector('label') : null;
          if (innerLabel && innerLabel.textContent) labelText = innerLabel.textContent.trim();
        }
        if (!labelText) labelText = el.placeholder || el.id.replace('modal-', '');
        collectFields.push({ fieldId: el.id, label: labelText });
      });
    });

    // 3a. Renderizar caixas com base nos campos coletados
    collectFields.forEach(({ fieldId, label }) => {
      const reqDiv = document.createElement('div');
      reqDiv.className = 'field-checkbox-item';
      reqDiv.dataset.label = (label || '').toLowerCase();
      const reqCb = document.createElement('input');
      reqCb.type = 'checkbox';
      reqCb.id = `rule-required-${fieldId}`;
      reqCb.value = fieldId;
      reqCb.dataset.label = label;
      if (requiredFieldIds.has(fieldId)) reqCb.checked = true;
      const reqLbl = document.createElement('label');
      reqLbl.htmlFor = reqCb.id;
      reqLbl.textContent = label;
      reqDiv.appendChild(reqCb);
      reqDiv.appendChild(reqLbl);
      reqList.appendChild(reqDiv);

      const visDiv = document.createElement('div');
      visDiv.className = 'field-checkbox-item';
      visDiv.dataset.label = (label || '').toLowerCase();
      const visCb = document.createElement('input');
      visCb.type = 'checkbox';
      visCb.id = `rule-visible-${fieldId}`;
      visCb.value = fieldId;
      visCb.dataset.label = label;
      if (visibleFieldIds.has(fieldId)) visCb.checked = true;
      const visLbl = document.createElement('label');
      visLbl.htmlFor = visCb.id;
      visLbl.textContent = label;
      visDiv.appendChild(visCb);
      visDiv.appendChild(visLbl);
      visList.appendChild(visDiv);
    });

    // 3b. Lógica de filtro de busca
    const searchInput = document.getElementById('rule-fields-search');
    const clearBtn = document.getElementById('rule-fields-clear');
    const applyFilter = () => {
      const term = (searchInput.value || '').toLowerCase().trim();
      const filterItems = (container) => {
        container.querySelectorAll('.field-checkbox-item').forEach((item) => {
          const label = item.dataset.label || '';
          const match = term === '' || label.includes(term);
          item.classList.toggle('d-none', !match);
        });
      };
      filterItems(reqList);
      filterItems(visList);
    };
    searchInput.addEventListener('input', applyFilter);
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      applyFilter();
      searchInput.focus();
    });

    if (fieldsContainer.children.length === 0) {
      fieldsContainer.innerHTML = '<p style="color: orange;">Nenhum campo disponível para configuração.</p>';
    }

  } catch (error) {
    console.error("Erro ao carregar dados da regra:", error);
    showNotification("Erro ao carregar dados da regra.", "error");
    fieldsContainer.innerHTML = '<p style="color: red;">Falha ao carregar.</p>';
  }
}

/**
 * Renderiza a lista de anexos no modal.
 * @param {Array} attachments - A lista de arquivos anexados.
 * @param {string} contractId - O ID do contrato atual.
 */
export function renderAttachments(attachments, contractId) {
  const listContainer = document.getElementById("anexos-list");
  if (!listContainer) return;

  listContainer.innerHTML = ""; // Limpa a lista anterior

  if (!attachments || attachments.length === 0) {
    listContainer.innerHTML = "<li class='text-muted p-2'>Nenhum anexo encontrado.</li>";
    return;
  }

  attachments.forEach((file) => {
    const li = document.createElement("li");
    li.className = "anexo-item";
    const uploadedBy = file.uploadedBy || "Sistema";
    const fileType = file.type || "Geral";
    
    li.innerHTML = `
        <div>
            <span class="anexo-tipo">${fileType}</span>
            <a href="${file.url}" target="_blank" class="anexo-link text-truncate" style="max-width: 300px; display: inline-block; vertical-align: middle;">${file.name}</a>
        </div>
        <div class="anexo-details">
            <span class="anexo-meta d-none d-md-inline">Enviado por: ${uploadedBy}</span>
            <button class="btn-danger delete-anexo-btn" data-contract-id="${contractId}" data-attachment-id="${file.id}" data-file-path="${file.path}" title="Excluir Anexo">&times;</button>
        </div>
    `;
    listContainer.appendChild(li);
  });
}
/**
 * Atualiza a barra de progresso do upload.
 * @param {number} progress - O progresso de 0 a 100.
 */
export function updateUploadProgress(progress) {
  const container = document.getElementById("upload-progress-container");
  const progressBar = document.getElementById("upload-progress");
  const progressText = document.getElementById("upload-progress-text");

  if (progress > 0 && progress < 100) {
    container.style.display = "block";
    progressBar.value = progress;
    progressText.textContent = `${Math.round(progress)}%`;
  } else {
    container.style.display = "none";
  }
}

/**
 * Preenche a página de perfil com os dados do utilizador logado.
 */
export async function populateProfilePage() {
  const user = auth.currentUser;
  if (!user) return;

  DOMElements.profileEmail.value = user.email;

  try {
    const profileData = await firestore.getUserProfile(user.uid);
    if (profileData) {
      DOMElements.profileFullName.value = profileData.fullName || "";
      if (DOMElements.profileShortName) {
        DOMElements.profileShortName.value = profileData.shortName || "";
      }
      DOMElements.profileCpf.value = profileData.cpf || "";
    }
  } catch {
  console.error("Erro ao carregar perfil");
    showNotification("Erro ao carregar os dados do perfil.", "error");
  }
}

/**
 * Popula o dropdown de analistas com uma lista de utilizadores.
 * @param {Array} users - A lista de utilizadores do sistema.
 * @param {string} selectedAnalyst - O nome do analista atualmente selecionado no contrato.
 */
export function populateAnalystDropdown(users, selectedAnalyst) {
  populateAnalystSelect("modal-analista", users, selectedAnalyst, "-- Nenhum --");
}

export function populateAnalistaAprovacaoDropdown(users, selectedAnalystAprovacao) {
  populateAnalystSelect(
    "modal-analistaAprovacao",
    users,
    selectedAnalystAprovacao,
    "-- Selecione --"
  );
}

/**
 * Popula o dropdown de Analista CEHOP com uma lista de utilizadores.
 * @param {Array} users - A lista de utilizadores do sistema.
 * @param {string} selectedAnalystCehop - O nome do analista CEHOP atualmente selecionado no contrato.
 */
export function populateAnalistaCehopDropdown(users, selectedAnalystCehop) {
  populateAnalystSelect("modal-analistaCehop", users, selectedAnalystCehop, "-- Selecione --");
}

function populateAnalystSelect(selectId, users, selectedValue, placeholder) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = "";
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);

  const optionValues = new Set();
  const usersArray = Array.isArray(users) ? users : [];
  const normalizedSelected = normalizeAnalystValue(selectedValue);

  usersArray.forEach((user) => {
    const optionLabel = resolveAnalystOptionLabel(user);
    if (!optionLabel) {
      return;
    }

    if (optionValues.has(optionLabel)) {
      return;
    }
    optionValues.add(optionLabel);

    const option = document.createElement("option");
    option.value = optionLabel;
    option.textContent = optionLabel;
    option.selected = optionLabel === normalizedSelected;
    select.appendChild(option);
  });

  if (normalizedSelected && !optionValues.has(normalizedSelected)) {
    const customOption = document.createElement("option");
    customOption.value = normalizedSelected;
    customOption.textContent = normalizedSelected;
    customOption.selected = true;
    select.appendChild(customOption);
  }
}

function resolveAnalystOptionLabel(user = {}) {
  if (!user || typeof user !== "object") return "";

  const candidates = [
    user.fullName,
    user.fullname,
    user.shortName,
    user.email
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAnalystValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function normalizeAnalystValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}
/**
 * Renderiza a tabela de revisão com os dados processados pela IA.
 * @param {Array<object>} processedContracts - A lista de contratos retornada pela IA.
 */
export function renderCsvReviewTable(processedContracts) {
    const table = document.getElementById('csv-review-table');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    if (!processedContracts || processedContracts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="100%">A IA não retornou dados para revisão.</td></tr>';
        return;
    }

    // Cria o cabeçalho dinamicamente a partir das chaves do primeiro objeto
    const headers = Object.keys(processedContracts[0]);
    thead.innerHTML = `
        <tr>
            <th><input type="checkbox" id="select-all-review-rows" checked /></th>
            ${headers.map(h => `<th>${h}</th>`).join('')}
        </tr>
    `;

    // Cria as linhas da tabela
    tbody.innerHTML = '';
    processedContracts.forEach((contract, index) => {
        const tr = document.createElement('tr');
        // Adiciona uma classe de 'aviso' se a IA marcou a linha
        if (contract.statusIA === 'AVISO') {
            tr.classList.add('warning-row'); // (Vamos adicionar este estilo no CSS)
        }
        // Guarda os dados completos da linha no próprio elemento TR
        tr.dataset.contractData = JSON.stringify(contract);

        tr.innerHTML = `
            <td><input type="checkbox" class="review-row-checkbox" data-index="${index}" checked /></td>
            ${headers.map(h => `<td>${contract[h] || ''}</td>`).join('')}
        `;
        tbody.appendChild(tr);
    });

    // Adiciona um listener para o checkbox "Selecionar Todos"
    document.getElementById('select-all-review-rows').addEventListener('change', (e) => {
        tbody.querySelectorAll('.review-row-checkbox').forEach(cb => cb.checked = e.target.checked);
    });
}

// Controle de debounce para atualização de badges
let pendenciasBadgesTimeout = null;

/**
 * Atualiza os badges de pendências nos cards do Kanban
 * OTIMIZADO: Com debounce de 500ms para evitar múltiplas chamadas
 * Busca contagem de pendências ativas para cada contrato visível
 * @returns {Promise<void>}
 */
export async function updatePendenciasBadges() {
  // Debounce: aguarda 500ms para agrupar múltiplas chamadas
  return new Promise((resolve) => {
    if (pendenciasBadgesTimeout) {
      clearTimeout(pendenciasBadgesTimeout);
    }
    
    pendenciasBadgesTimeout = setTimeout(async () => {
      try {
        await _doUpdatePendenciasBadges();
      } catch (error) {
        console.error('Erro ao atualizar badges de pendências:', error);
      }
      resolve();
    }, 500);
  });
}

/**
 * Execução real da atualização de badges (chamada após debounce)
 * @private
 */
async function _doUpdatePendenciasBadges() {
  try {
    // Encontrar todos os containers de pendências no Kanban
    const containers = document.querySelectorAll('.pendencias-container[data-contract-id]');
    if (containers.length === 0) return;

    // Coletar IDs únicos dos contratos
    const contractIds = [...new Set([...containers].map(c => c.dataset.contractId))];

    if (contractIds.length === 0) return;

    debug(` Atualizando badges de pendências para ${contractIds.length} contratos`);

    // Buscar contagens e títulos em lote (usa Cloud Function - mais eficiente)
    const result = await pendenciasService.contarMultiplos(contractIds);
    const titulos = result._titulos || {};

    // Debug: verificar títulos recebidos
    const contratosComTitulos = Object.entries(titulos).filter(([, arr]) => arr && arr.length > 0);
    debug(` Títulos recebidos: ${contratosComTitulos.length} contratos com títulos`);
    if (contratosComTitulos.length > 0 && contratosComTitulos.length <= 5) {
      debug(` Amostra de títulos: ${JSON.stringify(contratosComTitulos.slice(0, 3))}`);
    }

    // Atualizar cada container
    containers.forEach(container => {
      const contractId = container.dataset.contractId;
      const count = result[contractId] || 0;
      const titulosArray = titulos[contractId] || [];

      // Limpar container
      container.innerHTML = '';

      if (count > 0) {
        // Criar um badge para cada pendência
        titulosArray.forEach(titulo => {
          const badge = document.createElement('span');
          badge.className = 'card-badge badge-pendencias badge-pendencias-low';
          badge.title = titulo;
          badge.textContent = titulo || 'Pendência';

          // Classe de urgência baseada no índice (mais pendências = mais urgente)
          if (count >= 3) {
            badge.classList.remove('badge-pendencias-low');
            badge.classList.add('badge-pendencias-high');
          }

          container.appendChild(badge);
        });

        // Fallback se não houver títulos mas houver contagem
        if (titulosArray.length === 0) {
          for (let i = 0; i < count; i++) {
            const badge = document.createElement('span');
            badge.className = 'card-badge badge-pendencias badge-pendencias-low';
            badge.title = 'Pendência';
            badge.textContent = 'Pendência';
            if (count >= 3) {
              badge.classList.remove('badge-pendencias-low');
              badge.classList.add('badge-pendencias-high');
            }
            container.appendChild(badge);
          }
        }
      }
    });

    debug(` Badges de pendências atualizados`);
  } catch (error) {
    console.error('Erro ao atualizar badges de pendências:', error);
  }
}

/**
 * Filtra por um status específico e alterna para a visualização em lista.
 * Chamada ao clicar no header de uma coluna do Kanban.
 * @param {string} statusName - O nome do status para filtrar
 */
function filterByStatusAndSwitchToList(statusName) {
  debug(` Filtrando por status "${statusName}" e alternando para lista`);
  
  // Dispara evento customizado para que o main.js possa tratar
  const event = new CustomEvent('kanbanHeaderClick', {
    detail: { status: statusName }
  });
  document.dispatchEvent(event);
}

// Exposição global de todas as funções e objetos
window.UI = {
  DOMElements,
  debug,
  showNotification,
  navigateTo,
  populateStatusFilter,
  renderPaginationControls,
  renderContracts,
  populateDetailsModal,
  renderHistory,
  getFormData,
  setCompradoresEditMode,
  isCompradoresEditModeEnabled,
  populateDashboardFilters,
  updateDashboard,
  updateStatusChart,
  updateBulkActionUI,
  loadAndRenderUsers,
  loadAndRenderStatusRules,
  updateImportProgress,
  renderKanbanBoard,
  toggleView,
  updateKanbanCounters,
  refreshAllStatusFilters,
  getExpandedStatusList,
  updatePendenciasBadges
};

// Exposição individual das funções principais
window.navigateTo = navigateTo;
window.DOMElements = DOMElements;
window.debug = debug;
window.showNotification = showNotification;
window.createCompradorFields = createCompradorFields;

// FUNÇÃO GLOBAL: Força inclusão de status órfãos
window.forceIncludeOrphanStatuses = function(contracts) {
  console.log(' Forçando inclusão de status órfãos...');
  const expandedList = getExpandedStatusList(contracts);
  window.EFFECTIVE_STATUS_CONFIG = expandedList;
  console.log(` ${expandedList.length} status disponíveis (incluindo órfãos)`);
  return expandedList;
};

/**
 * Popula o seletor de workflows no modal de adicionar processo.
 */
export async function populateAddModalWorkflows() {
  const select = document.getElementById("add-workflowId");
  if (!select) return;

  // Salva o valor atual caso já tenha sido selecionado
  const currentValue = select.value;

  select.innerHTML = '<option value="">Selecione o tipo de processo</option>';

  // Verifica permissões do usuário
  const userUid = auth.currentUser ? auth.currentUser.uid : null;

  try {
    let allWorkflows = [];
    // Tenta usar cache do editor se disponível
    if (window.workflowEditorUI && window.workflowEditorUI.workflows.length > 0) {
      allWorkflows = window.workflowEditorUI.workflows;
    } else {
      allWorkflows = await workflowService.getAllWorkflows();
    }

    for (const wf of allWorkflows) {
      // Verifica acesso
      const hasAccess = await userPermissionService.canAccessWorkflow(userUid, wf.id);
      
      if (hasAccess) {
        const option = document.createElement('option');
        option.value = wf.id;
        option.textContent = wf.name;
        select.appendChild(option);
      }
    }
  } catch (e) {
    console.warn("Erro ao carregar workflows:", e);
  }

  // Restaura valor ou define padrão do usuário
  if (currentValue) {
    select.value = currentValue;
  } else {
    // Tenta pegar do localStorage (preferência de visualização)
    try {
      const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
      if (prefs.defaultWorkflow) {
        const normalizedPref = prefs.defaultWorkflow.toString().trim().toLowerCase();
        const preferredOption = Array.from(select.options).find(
          (option) => option.value.toLowerCase() === normalizedPref
        );
        if (preferredOption) {
          select.value = preferredOption.value;
        }
      }
    } catch (e) {
      console.warn("Erro ao ler preferências locais:", e);
    }
  }
  
  // Popula também o select de status
  populateAddModalStatus();
}

/**
 * Popula o seletor de status inicial no modal de adicionar processo.
 */
export function populateAddModalStatus() {
  const select = document.getElementById("add-status");
  if (!select) return;

  // Salva o valor atual
  const currentValue = select.value;

  select.innerHTML = '<option value="">Selecione o status inicial</option>';

  // Obtém a lista de status ativos
  const statusList = getStatusConfigList().filter(s => s.isActive !== false);
  
  // Ordena por order
  statusList.sort((a, b) => (a.order || 0) - (b.order || 0));

  // Adiciona as opções
  statusList.forEach(status => {
    const option = document.createElement('option');
    option.value = status.text;
    option.textContent = status.text;
    
    // Define o primeiro status como padrão se não houver valor
    if (!currentValue && statusList.indexOf(status) === 0) {
      option.selected = true;
    }
    
    select.appendChild(option);
  });

  // Restaura valor se havia
  if (currentValue) {
    select.value = currentValue;
  }
}


/**
 * Popula o dropdown de tipos de workflow dinamicamente
 * @param {string} currentType - Tipo atual selecionado
 * @param {Function} onSelect - Callback ao selecionar (type) => void
 */
export async function populateWorkflowDropdown(currentType, onSelect) {
  const dropdownContainer = document.getElementById("workflow-type-dropdown");
  if (!dropdownContainer) return;

  const ul = dropdownContainer.querySelector(".dropdown-menu");
  const toggleBtn = document.getElementById("toggle-workflow-type-btn");
  
  if (!ul || !toggleBtn) return;

  const normalizedCurrentType = (currentType || "")
    .toString()
    .trim()
    .toLowerCase();

  // Loading state
  ul.innerHTML = '<li><span class="dropdown-item-text">Carregando...</span></li>';

  try {
    const workflows = await workflowService.getAllWorkflows();
    
    // Atualiza cache local para uso no Kanban
    cachedWorkflows = workflows;
    
    ul.innerHTML = '';
    
    workflows.forEach(wf => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = `dropdown-item ${wf.id === normalizedCurrentType ? 'active' : ''}`;
      btn.type = 'button';
      btn.dataset.workflow = wf.id;
      btn.textContent = wf.name;
      
      btn.onclick = () => {
        // Update UI immediately
        ul.querySelectorAll('.dropdown-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        toggleBtn.innerHTML = `<i class="bi bi-diagram-2 me-1"></i>Tipo: ${wf.name}`;
        
        if (onSelect) onSelect(wf.id);
      };
      
      li.appendChild(btn);
      ul.appendChild(li);
    });

    // Update toggle button text for current selection
    const currentWf = workflows.find(w => w.id === normalizedCurrentType);
    if (currentWf) {
      toggleBtn.innerHTML = `<i class="bi bi-diagram-2 me-1"></i>Tipo: ${currentWf.name}`;
    }

  } catch (error) {
    console.error("Erro ao carregar workflows para dropdown:", error);
    ul.innerHTML = '<li><span class="dropdown-item-text text-danger">Erro ao carregar</span></li>';
  }
}




