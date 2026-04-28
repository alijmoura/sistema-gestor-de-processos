/**
 * @file eventListeners.js
 * @description Módulo para configurar todos os event listeners da aplicação.
 */
import * as UI from "./ui.js";
import { initializeDashboard } from "./main.js";
import {
  DOMElements,
  showNotification,
  navigateTo,
  populateDetailsModal,
  renderHistory,
  getFormData,
  setCompradoresEditMode,
  isCompradoresEditModeEnabled,
  updateDashboard,
  updateBulkActionUI,
  loadAndRenderUsers,
  createGastoRow,
  createRepasseRow,
  updateFechamentoCalculations,
  renderAnotacaoEntry,
  populateFieldsForExport,
} from "./ui.js";
import { exportToCSV } from "./exportService.js";
import * as firestore from "./firestoreService.js";
import { auth } from "./auth.js";
import { STATUS_CONFIG, EXPORTABLE_FIELDS } from "./config.js";
import { confirmAction, confirmDelete, confirmInline } from "./uiHelpers.js";
import aiService from "./aiService.js";
import {
  clearArchivedDetailsModalState,
  configureDetailsModalContext,
  ensureDetailsModalReadyForMutation,
  setDetailsModalSourceContract,
} from "./detailsModalController.js";
import {
  getConsultaKeyState,
  getConsultaKeyValidationMessage,
} from "./consultaKeyService.js";

let originalContractData = null; // Armazena os dados originais ao abrir o modal
let appStateRef = {}; // Referência para o estado da aplicação em main.js
var currentView; // Evita TDZ em dependências circulares

function setCurrentDetailsModalContract(contract = null) {
  originalContractData = contract || null;
  setDetailsModalSourceContract(originalContractData);
}

export function setOriginalContractData(contract = null) {
  setCurrentDetailsModalContract(contract);
}

function getDetailsModalUsersPayload() {
  const analysts = Array.isArray(appStateRef.analysts) ? appStateRef.analysts : [];
  const allUsers = Array.isArray(appStateRef.allUsers) ? appStateRef.allUsers : [];

  return {
    analysts,
    allUsers,
    usersList: analysts.length > 0 ? analysts : allUsers,
  };
}

function applyDetailsModalUsersPayload(payload = {}) {
  if (Array.isArray(payload.analysts)) {
    appStateRef.analysts = payload.analysts;
  }

  if (Array.isArray(payload.allUsers)) {
    appStateRef.allUsers = payload.allUsers;
  }
}

function configureActiveDetailsModalContext(contractId) {
  configureDetailsModalContext({
    mode: "active",
    beforeMutate: async () => null,
    loadContract: async (id) =>
      firestore.getContractById(id || contractId, { forceRefresh: true }),
    loadUsers: async () => getDetailsModalUsersPayload(),
    onRestored: async () => undefined,
  });

  clearArchivedDetailsModalState();
  setDetailsModalSourceContract(originalContractData);
}

async function prepareDetailsModalMutation(action, contractId) {
  const result = await ensureDetailsModalReadyForMutation(action, { contractId });
  applyDetailsModalUsersPayload(result?.users || {});

  if (result?.contract) {
    setCurrentDetailsModalContract(result.contract);
  }

  return result;
}

// Estado salvo antes de filtrar por status único (clique no header do Kanban)
let savedStatusStateBeforeFilter = null;

function getInitialCurrentView() {
  try {
    const savedView = localStorage.getItem("processViewMode");
    if (savedView === "list" || savedView === "kanban") {
      return savedView;
    }
  } catch {
    // Ignora erros de storage e usa fallback seguro.
  }

  return "kanban";
}

function normalizeVendorName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeVendorKey(value) {
  return normalizeVendorName(value).toLowerCase();
}

async function getKnownVendorsForValidation() {
  const inlineVendors = Array.isArray(window.__VENDORS_INLINE__?.state?.vendors)
    ? window.__VENDORS_INLINE__.state.vendors
    : [];

  if (inlineVendors.length > 0) {
    return inlineVendors;
  }

  try {
    const fetchedVendors = await firestore.getAllVendors();
    return Array.isArray(fetchedVendors) ? fetchedVendors : [];
  } catch (error) {
    console.warn("[vendorValidation] Falha ao carregar listagem de construtoras:", error);
    return [];
  }
}

async function validateVendorFromCatalog(rawVendorName, options = {}) {
  const { allowEmpty = false } = options;
  const vendorName = normalizeVendorName(rawVendorName);

  if (!vendorName) {
    return {
      valid: allowEmpty,
      reason: allowEmpty ? "empty_allowed" : "empty",
      vendorName,
    };
  }

  const vendors = await getKnownVendorsForValidation();
  if (!vendors.length) {
    return {
      valid: false,
      reason: "catalog_unavailable",
      vendorName,
    };
  }

  const vendorKey = normalizeVendorKey(vendorName);
  const exists = vendors.some(
    (vendor) => vendor?.active !== false && normalizeVendorKey(vendor?.name) === vendorKey
  );

  return {
    valid: exists,
    reason: exists ? "ok" : "not_listed",
    vendorName,
  };
}

function setVendorFieldValidationState(inputEl, validation, options = {}) {
  if (!inputEl) return;

  const requiredMessage =
    options.requiredMessage ||
    "Informe uma construtora cadastrada em Configurações > Construtoras & Empreendimentos.";
  const notListedMessage =
    options.notListedMessage ||
    "A construtora informada não está cadastrada na listagem de Construtoras & Empreendimentos.";
  const unavailableMessage =
    options.unavailableMessage ||
    "Não foi possível validar a construtora no momento. Tente novamente em instantes.";

  let message = "";
  if (validation?.reason === "empty") {
    message = requiredMessage;
  } else if (validation?.reason === "not_listed") {
    message = notListedMessage;
  } else if (validation?.reason === "catalog_unavailable") {
    message = unavailableMessage;
  }

  inputEl.setCustomValidity(message);
  inputEl.classList.toggle("is-invalid", Boolean(message));
}

const CONSULTA_FORM_CONFIG = Object.freeze({
  details: {
    nContratoCEF: "modal-nContratoCEF",
    codigoCCA: "modal-codigoCCA",
    tipoConsulta: "modal-tipoConsulta",
    chaveConsulta: "modal-chaveConsulta",
    compradoresContainerId: "compradores-container",
  },
});

const DETAILS_FORMULARIOS_MIRROR_MAP = Object.freeze({
  "details-formularios-codigoCCA": "modal-codigoCCA",
  "details-formularios-nContratoCEF": "modal-nContratoCEF",
  "details-formularios-tipoConsulta": "modal-tipoConsulta",
  "details-formularios-chaveConsulta": "modal-chaveConsulta",
  "details-formularios-dataAssinaturaCliente": "modal-dataAssinaturaCliente",
});

const DETAILS_PRIMARY_TO_MIRROR_MAP = Object.freeze(
  Object.entries(DETAILS_FORMULARIOS_MIRROR_MAP).reduce((acc, [mirrorId, primaryId]) => {
    acc[primaryId] = mirrorId;
    return acc;
  }, {})
);

function getConsultaFormConfig(kind) {
  return CONSULTA_FORM_CONFIG[kind] || CONSULTA_FORM_CONFIG.details;
}

function getConsultaFormElements(kind) {
  const config = getConsultaFormConfig(kind);
  return {
    config,
    nContratoCEF: document.getElementById(config.nContratoCEF),
    codigoCCA: document.getElementById(config.codigoCCA),
    tipoConsulta: document.getElementById(config.tipoConsulta),
    chaveConsulta: document.getElementById(config.chaveConsulta),
    compradoresContainer: document.getElementById(config.compradoresContainerId),
  };
}

function collectCompradoresFromContainer(container) {
  if (!container) {
    return [];
  }

  const compradores = [];
  container.querySelectorAll(".comprador-item").forEach((item) => {
    const comprador = {};
    item.querySelectorAll("[data-field]").forEach((field) => {
      const fieldName = field.dataset.field;
      if (!fieldName) {
        return;
      }

      if (field.type === "radio") {
        comprador[fieldName] = field.checked;
        return;
      }

      comprador[fieldName] =
        typeof field.value === "string" ? field.value.trim() : field.value;
    });
    compradores.push(comprador);
  });

  return compradores;
}

function buildConsultaSourceFromForm(kind) {
  const elements = getConsultaFormElements(kind);
  return {
    codigoCCA: elements.codigoCCA?.value || "",
    tipoConsulta: elements.tipoConsulta?.value || "",
    nContratoCEF: elements.nContratoCEF?.value || "",
    chaveConsulta: elements.chaveConsulta?.value || "",
    compradores: collectCompradoresFromContainer(elements.compradoresContainer),
    cpfPrincipal: originalContractData?.cpfPrincipal || "",
    comprador_1_cpf: originalContractData?.comprador_1_cpf || "",
    cpf: originalContractData?.cpf || "",
  };
}

function markModalFieldAsModified(field) {
  if (field?.id?.startsWith("modal-")) {
    field.dataset.userModified = "true";
  }
}

function setConsultaFieldValue(field, value, { markDirty = false } = {}) {
  if (!field) {
    return;
  }

  const normalizedValue = value ?? "";
  if (field.value !== normalizedValue) {
    field.value = normalizedValue;
  }

  if (markDirty) {
    markModalFieldAsModified(field);
  }

  syncDetailsMirrorField(field.id);
}

function syncDetailsMirrorField(primaryId) {
  const mirrorId = DETAILS_PRIMARY_TO_MIRROR_MAP[primaryId];
  if (!mirrorId) {
    return;
  }

  const primaryField = document.getElementById(primaryId);
  const mirrorField = document.getElementById(mirrorId);
  if (!primaryField || !mirrorField) {
    return;
  }

  const normalizedValue = primaryField.value ?? "";
  if (mirrorField.value !== normalizedValue) {
    mirrorField.value = normalizedValue;
  }
}

function refreshConsultaKeyForForm(kind, options = {}) {
  const { markDirty = false, notifyMissing = false } = options;
  const elements = getConsultaFormElements(kind);
  if (!elements.chaveConsulta) {
    return true;
  }

  const state = getConsultaKeyState(buildConsultaSourceFromForm(kind));

  setConsultaFieldValue(elements.codigoCCA, state.codigoCCA, {
    markDirty: kind === "details" && markDirty,
  });
  setConsultaFieldValue(elements.tipoConsulta, state.tipoConsulta, {
    markDirty: kind === "details" && markDirty,
  });

  if (state.canGenerate) {
    setConsultaFieldValue(elements.chaveConsulta, state.expectedKey, {
      markDirty: kind === "details" && markDirty,
    });
    return true;
  }

  setConsultaFieldValue(elements.chaveConsulta, "", {
    markDirty: kind === "details" && markDirty,
  });

  if (notifyMissing && state.shouldRequireUpToDateKey) {
    showNotification(getConsultaKeyValidationMessage(state, { action: "gerar" }), "error");
  }

  return false;
}

function validateConsultaKeyBeforeSave(kind) {
  refreshConsultaKeyForForm(kind, { markDirty: kind === "details" });
  return true;
}

function isConsultaDependencyTarget(target, kind) {
  if (!target) {
    return false;
  }

  const config = getConsultaFormConfig(kind);
  if ([config.nContratoCEF, config.codigoCCA, config.tipoConsulta].includes(target.id)) {
    return true;
  }

  const fieldName = target.dataset?.field;
  return fieldName === "cpf" || fieldName === "principal";
}

function isDetailsMirrorField(target) {
  return Boolean(target?.id && DETAILS_FORMULARIOS_MIRROR_MAP[target.id]);
}

function applyDetailsMirrorChange(target) {
  const primaryId = DETAILS_FORMULARIOS_MIRROR_MAP[target?.id];
  if (!primaryId) {
    return;
  }

  const primaryField = document.getElementById(primaryId);
  if (!primaryField) {
    return;
  }

  if (primaryField.value !== target.value) {
    primaryField.value = target.value;
  }

  markModalFieldAsModified(primaryField);
  delete primaryField.dataset.autoFilledByEmpreendimento;

  if (isConsultaDependencyTarget(primaryField, "details")) {
    refreshConsultaKeyForForm("details", { markDirty: true });
  } else {
    syncDetailsMirrorField(primaryId);
  }
}

/**
 *  SINCRONIZAÇÃO DE EDIÇÃO INLINE
 * Listener que atualiza originalContractData quando uma edição inline ocorre
 * Previne mudanças falsas ao comparar com dados desatualizados no modal
 */
window.addEventListener('inline-edit-sync', (event) => {
  const { contractId, updatedData } = event.detail;
  // Verifica se estamos editando o mesmo contrato
  if (originalContractData && originalContractData.id === contractId) {
    setCurrentDetailsModalContract(updatedData);
    console.log(` [EVENT LISTENER] originalContractData sincronizado para ${contractId}`);
  }
});

// --- Persistência de Preferências de Filtro no Firestore ---
let savePreferencesDebounceTimer = null;

/**
 * Salva preferências de filtro no Firestore com debounce (evita chamadas excessivas)
 * @param {Object} preferences - Preferências parciais a salvar
 */
async function persistFilterPreferencesToFirestore(preferences = {}) {
  // Debounce: aguarda 1.5s sem novas chamadas antes de salvar
  if (savePreferencesDebounceTimer) {
    clearTimeout(savePreferencesDebounceTimer);
  }
  
  savePreferencesDebounceTimer = setTimeout(async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        console.warn('[Preferências]  Usuário não autenticado - não é possível salvar');
        return;
      }
      
      // Coleta estado atual completo
      const currentPreferences = {
        visibleColumns: appStateRef.visibleColumns || [],
        selectedStatus: Array.from(appStateRef.selectedStatusState || []),
        selectedVendors: Array.from(appStateRef.selectedVendorState || []),
        selectedEmpreendimentos: Array.from(appStateRef.selectedEmpreendimentoState || []),
        ...preferences
      };

      console.log('[Preferências]  Salvando no Firestore...', {
        usuario: user.email,
        statusCount: currentPreferences.selectedStatus.length,
        vendorsCount: currentPreferences.selectedVendors.length,
        empreendimentosCount: currentPreferences.selectedEmpreendimentos.length,
        columnsCount: currentPreferences.visibleColumns.length
      });
      
      await firestore.saveUserFilterPreferences(user.uid, currentPreferences);
      
      console.log('[Preferências]  Salvas com sucesso no Firestore');
      
      if (window.__DEBUG__) {
        console.log('[Preferências] Detalhes:', currentPreferences);
      }
    } catch (error) {
      console.error('[Preferências]  Erro ao salvar no Firestore:', error);
      // Não interrompe o fluxo - localStorage já tem os dados
    }
  }, 1500);
}

/**
 * Carrega preferências de filtro do Firestore (chamado na inicialização)
 * @returns {Promise<Object|null>} Preferências salvas ou null
 */
export async function loadFilterPreferencesFromFirestore() {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.warn('[Preferências]  Usuário não autenticado - não é possível carregar');
      return null;
    }
    
    console.log('[Preferências]  Carregando do Firestore para:', user.email);
    
    const prefs = await firestore.loadUserFilterPreferences(user.uid);
    
    if (prefs) {
      console.log('[Preferências]  Carregadas com sucesso:', {
        statusCount: prefs.selectedStatus?.length || 0,
        vendorsCount: prefs.selectedVendors?.length || 0,
        empreendimentosCount: prefs.selectedEmpreendimentos?.length || 0,
        columnsCount: prefs.visibleColumns?.length || 0
      });
      
      if (window.__DEBUG__) {
        console.log('[Preferências] Detalhes:', prefs);
      }
    } else {
      console.log('[Preferências]  Nenhuma preferência encontrada no Firestore');
    }
    
    return prefs;
  } catch (error) {
    console.error('[Preferências]  Erro ao carregar do Firestore:', error);
    return null;
  }
}

/**
 * Atualiza o badge de filtros ativos no botão do offcanvas
 * e os badges individuais em cada seção do accordion
 */
function updateActiveFiltersBadge() {
  const mainBadge = document.getElementById('active-filters-badge');
  const statusBadge = document.getElementById('status-filter-count');
  const vendorBadge = document.getElementById('vendor-filter-count');
  const empreendimentoBadge = document.getElementById('empreendimento-filter-count');

  let totalActiveFilters = 0;

  // Conta e atualiza filtros de status
  const statusCount = appStateRef.selectedStatusState ? appStateRef.selectedStatusState.size : 0;
  if (statusCount > 0) {
    totalActiveFilters += statusCount;
    if (statusBadge) {
      statusBadge.textContent = statusCount;
      statusBadge.classList.remove('d-none');
    }
  } else if (statusBadge) {
    statusBadge.classList.add('d-none');
  }

  // Conta e atualiza filtros de vendedores
  const vendorCount = appStateRef.selectedVendorState ? appStateRef.selectedVendorState.size : 0;
  if (vendorCount > 0) {
    totalActiveFilters += vendorCount;
    if (vendorBadge) {
      vendorBadge.textContent = vendorCount;
      vendorBadge.classList.remove('d-none');
    }
  } else if (vendorBadge) {
    vendorBadge.classList.add('d-none');
  }

  // Conta e atualiza filtros de empreendimentos
  const empreendimentoCount = appStateRef.selectedEmpreendimentoState ? appStateRef.selectedEmpreendimentoState.size : 0;
  if (empreendimentoCount > 0) {
    totalActiveFilters += empreendimentoCount;
    if (empreendimentoBadge) {
      empreendimentoBadge.textContent = empreendimentoCount;
      empreendimentoBadge.classList.remove('d-none');
    }
  } else if (empreendimentoBadge) {
    empreendimentoBadge.classList.add('d-none');
  }

  // Atualiza o badge principal
  if (mainBadge) {
    if (totalActiveFilters > 0) {
      mainBadge.textContent = totalActiveFilters;
      mainBadge.classList.remove('d-none');
    } else {
      mainBadge.classList.add('d-none');
    }
  }

  // Debug log
  if (window.__DEBUG__) {
    console.log(`[FilterBadge] Status: ${statusCount}, Vendors: ${vendorCount}, Empreendimentos: ${empreendimentoCount}, Total: ${totalActiveFilters}`);
  }
}

// Exporta a função para uso externo
export { updateActiveFiltersBadge };

// --- Funções auxiliares para Filtro de Construtora/Vendedor ---

/**
 * Obtém lista única de vendedores/construtoras dos contratos
 * @param {Array} contracts - Lista de contratos
 * @returns {Array} Lista única de vendedores ordenada
 */
function getUniqueVendors(contracts) {
  const vendors = new Set();
  contracts.forEach(contract => {
    const vendor = (contract.vendedorConstrutora || '').trim();
    if (vendor) {
      vendors.add(vendor);
    }
  });
  return Array.from(vendors).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Popula o painel de filtro de vendedores
 * @param {Array} contracts - Lista de contratos
 * @param {Set} selectedVendorState - Estado atual dos vendedores selecionados
 */
function populateVendorFilter(contracts, selectedVendorState) {
  const filterContent = document.getElementById("vendor-filter-scroll-content-offcanvas");
  if (!filterContent) {
    console.warn('[VendorFilter] Container não encontrado');
    return;
  }

  // Debug: verifica se há contratos
  console.log(`[VendorFilter] Populando com ${contracts?.length || 0} contratos, ${selectedVendorState?.size || 0} selecionados`);

  filterContent.innerHTML = "";
  const vendors = getUniqueVendors(contracts);
  
  // Debug: verifica vendedores únicos
  console.log(`[VendorFilter] ${vendors.length} vendedores únicos encontrados`);

  // Se não há vendedores, mostra mensagem
  if (vendors.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "text-muted p-2 text-center";
    emptyMsg.innerHTML = '<i class="bi bi-info-circle me-1"></i>Nenhuma construtora encontrada';
    filterContent.appendChild(emptyMsg);
    return;
  }

  // Verifica se há preferência salva (localStorage ou Firestore)
  // Se não houver preferência, inicia com nenhum selecionado (mostra todos)
  // Não força seleção para permitir que usuário mantenha "nenhum selecionado = todos"
  // O estado já foi carregado do Firestore/localStorage antes desta função ser chamada

  vendors.forEach((vendor, index) => {
    const div = document.createElement("div");
    div.className = "vendor-filter-item";
    
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = vendor;
    checkbox.checked = selectedVendorState.has(vendor);
    checkbox.id = `vendor-filter-${index}`;

    const labelElement = document.createElement("label");
    labelElement.htmlFor = checkbox.id;
    labelElement.appendChild(checkbox);
    labelElement.appendChild(document.createTextNode(` ${vendor}`));
    labelElement.title = vendor;

    div.appendChild(labelElement);
    filterContent.appendChild(div);
  });

  // Contador de contratos por vendedor
  const countByVendor = {};
  contracts.forEach(c => {
    const v = (c.vendedorConstrutora || '').trim();
    if (v) countByVendor[v] = (countByVendor[v] || 0) + 1;
  });

  // Adiciona contagem visual
  filterContent.querySelectorAll('label').forEach(label => {
    const checkbox = label.querySelector('input');
    if (checkbox) {
      const vendor = checkbox.value;
      const count = countByVendor[vendor] || 0;
      const badge = document.createElement('span');
      badge.className = 'vendor-count-badge';
      badge.textContent = `(${count})`;
      label.appendChild(badge);
    }
  });
}

/**
 * Salva o estado do filtro de vendedores no localStorage
 */
function saveVendorFilterState() {
  try {
    const state = Array.from(appStateRef.selectedVendorState || []);
    localStorage.setItem('vendorFilterState', JSON.stringify(state));
    // Persiste também no Firestore (com debounce)
    persistFilterPreferencesToFirestore({ selectedVendors: state });
  } catch (e) {
    console.warn('[Filtro Vendedor] Erro ao salvar estado:', e);
  }
}

/**
 * Carrega o estado do filtro de vendedores do localStorage
 * @returns {Set} Set com os vendedores selecionados
 */
function loadVendorFilterState() {
  try {
    const saved = localStorage.getItem('vendorFilterState');
    if (saved) {
      return new Set(JSON.parse(saved));
    }
  } catch (e) {
    console.warn('[Filtro Vendedor] Erro ao carregar estado:', e);
  }
  return new Set();
}

// Exporta funções para uso externo
export { getUniqueVendors, populateVendorFilter, saveVendorFilterState, loadVendorFilterState };

// ==========================================
// FILTRO DE EMPREENDIMENTO
// ==========================================

/**
 * Extrai empreendimentos únicos dos contratos, filtrando por construtoras selecionadas
 * @param {Array} contracts - Lista de contratos
 * @param {Set} selectedVendorState - Construtoras selecionadas (se vazio, retorna todos)
 * @returns {Array} Array ordenado de empreendimentos únicos
 */
function getUniqueEmpreendimentos(contracts, selectedVendorState) {
  const empreendimentos = new Set();
  const selectedVendors = Array.from(selectedVendorState || []);

  contracts.forEach(contract => {
    const empreendimento = (contract.empreendimento || '').trim();
    const vendor = (contract.vendedorConstrutora || '').trim();

    // Se nenhuma construtora selecionada, mostra todos os empreendimentos
    // Se há construtoras selecionadas, filtra empreendimentos dessas construtoras
    if (empreendimento && (selectedVendors.length === 0 || selectedVendors.includes(vendor))) {
      empreendimentos.add(empreendimento);
    }
  });
  return Array.from(empreendimentos).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Popula o painel de filtro de empreendimentos
 * @param {Array} contracts - Lista de contratos
 * @param {Set} selectedEmpreendimentoState - Estado atual dos empreendimentos selecionados
 * @param {Set} selectedVendorState - Estado atual das construtoras selecionadas
 */
function populateEmpreendimentoFilter(contracts, selectedEmpreendimentoState, selectedVendorState) {
  const filterContent = document.getElementById("empreendimento-filter-scroll-content-offcanvas");
  if (!filterContent) {
    console.warn('[EmpreendimentoFilter] Container não encontrado');
    return;
  }

  console.log(`[EmpreendimentoFilter] Populando com ${contracts?.length || 0} contratos, ${selectedEmpreendimentoState?.size || 0} selecionados`);

  filterContent.innerHTML = "";
  const empreendimentos = getUniqueEmpreendimentos(contracts, selectedVendorState);

  console.log(`[EmpreendimentoFilter] ${empreendimentos.length} empreendimentos únicos encontrados`);

  if (empreendimentos.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "text-muted p-2 text-center";
    emptyMsg.innerHTML = '<i class="bi bi-info-circle me-1"></i>Nenhum empreendimento encontrado';
    filterContent.appendChild(emptyMsg);
    return;
  }

  empreendimentos.forEach((empreendimento, index) => {
    const div = document.createElement("div");
    div.className = "vendor-filter-item"; // Reutiliza estilo

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = empreendimento;
    checkbox.checked = selectedEmpreendimentoState.has(empreendimento);
    checkbox.id = `empreendimento-filter-${index}`;

    const labelElement = document.createElement("label");
    labelElement.htmlFor = checkbox.id;
    labelElement.appendChild(checkbox);
    labelElement.appendChild(document.createTextNode(` ${empreendimento}`));
    labelElement.title = empreendimento;

    div.appendChild(labelElement);
    filterContent.appendChild(div);
  });

  // Contador de contratos por empreendimento (filtrando por construtoras selecionadas)
  const selectedVendors = Array.from(selectedVendorState || []);
  const countByEmpreendimento = {};
  contracts.forEach(c => {
    const e = (c.empreendimento || '').trim();
    const v = (c.vendedorConstrutora || '').trim();
    if (e && (selectedVendors.length === 0 || selectedVendors.includes(v))) {
      countByEmpreendimento[e] = (countByEmpreendimento[e] || 0) + 1;
    }
  });

  // Adiciona contagem visual
  filterContent.querySelectorAll('label').forEach(label => {
    const checkbox = label.querySelector('input');
    if (checkbox) {
      const empreendimento = checkbox.value;
      const count = countByEmpreendimento[empreendimento] || 0;
      const badge = document.createElement('span');
      badge.className = 'vendor-count-badge';
      badge.textContent = `(${count})`;
      label.appendChild(badge);
    }
  });
}

/**
 * Salva o estado do filtro de empreendimentos no localStorage
 */
function saveEmpreendimentoFilterState() {
  try {
    const state = Array.from(appStateRef.selectedEmpreendimentoState || []);
    localStorage.setItem('empreendimentoFilterState', JSON.stringify(state));
    // Persiste também no Firestore (com debounce)
    persistFilterPreferencesToFirestore({ selectedEmpreendimentos: state });
  } catch (e) {
    console.warn('[Filtro Empreendimento] Erro ao salvar estado:', e);
  }
}

/**
 * Carrega o estado do filtro de empreendimentos do localStorage
 * @returns {Set} Set com os empreendimentos selecionados
 */
function loadEmpreendimentoFilterState() {
  try {
    const saved = localStorage.getItem('empreendimentoFilterState');
    if (saved) {
      return new Set(JSON.parse(saved));
    }
  } catch (e) {
    console.warn('[Filtro Empreendimento] Erro ao carregar estado:', e);
  }
  return new Set();
}

// Exporta funções de empreendimento
export { getUniqueEmpreendimentos, populateEmpreendimentoFilter, saveEmpreendimentoFilterState, loadEmpreendimentoFilterState };

const getBootstrapModalInstance = (element, create = true) => {
  if (!element || !window.bootstrap || !window.bootstrap.Modal) {
    return null;
  }
  return create
    ? window.bootstrap.Modal.getOrCreateInstance(element)
    : window.bootstrap.Modal.getInstance(element);
};

const showModal = (element) => {
  if (!element) return;
  const modalInstance = getBootstrapModalInstance(element, true);
  if (modalInstance) {
    modalInstance.show();
  } else {
    element.style.display = "block";
  }
};

const hideModal = (element) => {
  if (!element) return;
  const modalInstance = getBootstrapModalInstance(element, false);
  if (modalInstance) {
    modalInstance.hide();
  } else {
    element.style.display = "none";
  }
};

// --- FUNÇÕES AUXILIARES PARA EDIÇÃO DE ANOTAÇÕES ---

/**
 * Entra no modo de edição de uma anotação
 * @param {HTMLElement} anotacaoItem - O elemento da anotação
 * @param {object} anotacaoData - Os dados da anotação
 */
function enterAnotacaoEditMode(anotacaoItem, anotacaoData) {
  const textoElement = anotacaoItem.querySelector('.anotacao-texto');
  const contentDiv = anotacaoItem.querySelector('.anotacao-content');
  const originalText = anotacaoData.texto;

  // Cria o container de edição
  const editContainer = document.createElement('div');
  editContainer.className = 'anotacao-edit-container';
  editContainer.innerHTML = `
    <textarea class="form-control anotacao-edit-textarea" rows="3">${originalText}</textarea>
    <div class="anotacao-edit-actions mt-2">
      <button type="button" class="btn btn-sm btn-outline-primary improve-with-ai-btn" title="Melhorar com IA">
        <i class="bi bi-stars me-1"></i>Melhorar com IA
      </button>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-sm btn-secondary cancel-edit-btn">Cancelar</button>
        <button type="button" class="btn btn-sm btn-primary save-edit-btn">Salvar</button>
      </div>
    </div>
    <div class="ai-preview-container d-none mt-2">
      <div class="alert alert-info mb-0">
        <strong><i class="bi bi-stars me-1"></i>Sugestão da IA:</strong>
        <p class="ai-preview-text mb-2 mt-2"></p>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-sm btn-success accept-ai-btn">
            <i class="bi bi-check-lg me-1"></i>Aceitar
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary reject-ai-btn">
            <i class="bi bi-x-lg me-1"></i>Rejeitar
          </button>
        </div>
      </div>
    </div>
  `;

  // Esconde o texto original e adiciona o container de edição
  if (textoElement) textoElement.classList.add('d-none');
  if (contentDiv) {
    contentDiv.insertBefore(editContainer, contentDiv.querySelector('.anotacao-meta'));
  }

  // Esconde o botão de editar durante o modo de edição
  const editBtn = anotacaoItem.querySelector('.edit-anotacao-btn');
  if (editBtn) editBtn.classList.add('d-none');

  // Foca no textarea
  const textarea = editContainer.querySelector('.anotacao-edit-textarea');
  if (textarea) {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }
}

/**
 * Sai do modo de edição e restaura a visualização normal
 * @param {HTMLElement} anotacaoItem - O elemento da anotação
 */
function exitAnotacaoEditMode(anotacaoItem) {
  const editContainer = anotacaoItem.querySelector('.anotacao-edit-container');
  const textoElement = anotacaoItem.querySelector('.anotacao-texto');
  const editBtn = anotacaoItem.querySelector('.edit-anotacao-btn');

  if (editContainer) editContainer.remove();
  if (textoElement) textoElement.classList.remove('d-none');
  if (editBtn) editBtn.classList.remove('d-none');

  // Limpa dados temporários
  delete anotacaoItem.dataset.aiSuggestion;
  delete anotacaoItem.dataset.aiImproved;
}

/**
 * Normaliza valores de data de anotação para Date quando possível.
 * Aceita Date, Firestore Timestamp, ISO string e objetos serializados ({seconds}/{_seconds}).
 * Mantém o valor original quando não for possível converter.
 * @param {any} value
 * @returns {any}
 */
function normalizeAnotacaoDateValue(value) {
  if (!value) return value;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value._seconds === "number") return new Date(value._seconds * 1000);
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return value;
}

/**
 * Sanitiza uma anotação para persistência no Firestore.
 * Remove chaves com valor undefined e normaliza datas quando possível.
 * @param {object} anotacao
 * @returns {object}
 */
function sanitizeAnotacaoForPersist(anotacao = {}) {
  const cleaned = { ...(anotacao || {}) };

  const normalizedData = normalizeAnotacaoDateValue(cleaned.data);
  if (normalizedData === undefined) {
    delete cleaned.data;
  } else {
    cleaned.data = normalizedData;
  }

  const normalizedEditedAt = normalizeAnotacaoDateValue(cleaned.editadoEm);
  if (normalizedEditedAt === undefined) {
    delete cleaned.editadoEm;
  } else {
    cleaned.editadoEm = normalizedEditedAt;
  }

  Object.keys(cleaned).forEach((key) => {
    if (cleaned[key] === undefined) {
      delete cleaned[key];
    }
  });

  return cleaned;
}

/**
 * Salva as alterações de uma anotação editada
 * @param {HTMLElement} saveBtn - O botão de salvar
 */
async function handleSaveAnotacaoEdit(saveBtn) {
  const anotacaoItem = saveBtn.closest(".anotacao-item");
  const textarea = anotacaoItem.querySelector(".anotacao-edit-textarea");
  const newText = textarea.value.trim();

  if (!newText) {
    showNotification("A anotação não pode estar vazia.", "error");
    return;
  }

  const contractId = DOMElements.modalContractId?.value;
  if (!contractId || !originalContractData) {
    showNotification("Erro: Dados do contrato não encontrados.", "error");
    return;
  }

  // Encontra o índice desta anotação
  const allItems = document.querySelectorAll("#anotacoes-historico .anotacao-item");
  const index = Array.from(allItems).indexOf(anotacaoItem);

  // Verifica se foi melhorado com IA
  const wasImprovedWithAI = anotacaoItem.dataset.aiImproved === 'true';

  // Desabilita o botão e mostra loading
  saveBtn.disabled = true;
  const originalBtnContent = saveBtn.innerHTML;
  saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...';

  try {
    // Coleta as anotações atuais do DOM
    const anotacoesAtuais = [];
    allItems.forEach((item, idx) => {
      const data = sanitizeAnotacaoForPersist(JSON.parse(item.dataset.anotacao));

      if (idx === index) {
        // Atualiza esta anotação
        data.texto = newText;
        data.editadoEm = new Date();
        if (wasImprovedWithAI) {
          data.melhoradoComIA = true;
        }
      }
      anotacoesAtuais.push(data);
    });

    // Salva no Firestore
    const updatedData = {
      ...originalContractData,
      anotacoes: anotacoesAtuais
    };

    await prepareDetailsModalMutation("anotacao-edicao", contractId);

    await firestore.updateContract(
      contractId,
      updatedData,
      originalContractData,
      appStateRef.currentUserProfile
    );

    // Atualiza originalContractData
    originalContractData.anotacoes = anotacoesAtuais;
    setDetailsModalSourceContract(originalContractData);

    // Atualiza o dataset da anotação
    const updatedAnotacao = anotacoesAtuais[index];
    anotacaoItem.dataset.anotacao = JSON.stringify(updatedAnotacao);

    // Sai do modo de edição
    exitAnotacaoEditMode(anotacaoItem);

    // Atualiza o texto exibido
    const textoElement = anotacaoItem.querySelector('.anotacao-texto');
    if (textoElement) {
      textoElement.innerHTML = newText.replace(/\n/g, "<br>");
    }

    // Adiciona/atualiza o indicador de editado
    const metaDiv = anotacaoItem.querySelector('.anotacao-meta');
    if (metaDiv && !metaDiv.querySelector('.anotacao-editado')) {
      const editadoSpan = document.createElement('span');
      editadoSpan.className = 'anotacao-editado';
      editadoSpan.title = `Editado em ${new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
      editadoSpan.innerHTML = '<i class="bi bi-pencil-fill"></i> editado';
      metaDiv.appendChild(editadoSpan);
    }

    // Adiciona badge de IA se aplicável
    if (wasImprovedWithAI && metaDiv && !metaDiv.querySelector('.anotacao-ia-badge')) {
      const iaBadge = document.createElement('span');
      iaBadge.className = 'anotacao-ia-badge';
      iaBadge.title = 'Melhorado com IA';
      iaBadge.innerHTML = '<i class="bi bi-stars"></i>';
      metaDiv.appendChild(iaBadge);
    }

    // Atualiza o histórico de alterações no modal
    const history = await firestore.getContractHistory(contractId);
    renderHistory(history);

    showNotification("Anotação atualizada com sucesso!", "success");

  } catch (error) {
    console.error("Erro ao salvar edição:", error);
    showNotification(error?.message || "Erro ao salvar. Tente novamente.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalBtnContent;
  }
}

/**
 * Processa a melhoria de texto com IA
 * @param {HTMLElement} improveBtn - O botão de melhorar com IA
 */
async function handleImproveAnotacaoWithAI(improveBtn) {
  const anotacaoItem = improveBtn.closest(".anotacao-item");
  const textarea = anotacaoItem.querySelector(".anotacao-edit-textarea");
  const previewContainer = anotacaoItem.querySelector(".ai-preview-container");
  const previewText = anotacaoItem.querySelector(".ai-preview-text");

  const currentText = textarea.value.trim();
  if (!currentText) {
    showNotification("Digite algum texto primeiro.", "error");
    return;
  }

  // Mostra loading
  improveBtn.disabled = true;
  const originalBtnContent = improveBtn.innerHTML;
  improveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Processando...';

  try {
    const result = await aiService.improveText(currentText);

    if (result && result.improvedText) {
      previewText.textContent = result.improvedText;
      previewContainer.classList.remove('d-none');
      anotacaoItem.dataset.aiSuggestion = result.improvedText;
    } else {
      showNotification("Não foi possível melhorar o texto. Tente novamente.", "warning");
    }
  } catch (error) {
    console.error("Erro ao melhorar com IA:", error);
    showNotification("Erro ao processar com IA. Tente novamente.", "error");
  } finally {
    improveBtn.disabled = false;
    improveBtn.innerHTML = originalBtnContent;
  }
}

/**
 * Aceita a sugestão da IA
 * @param {HTMLElement} acceptBtn - O botão de aceitar
 */
function handleAcceptAISuggestion(acceptBtn) {
  const anotacaoItem = acceptBtn.closest(".anotacao-item");
  const textarea = anotacaoItem.querySelector(".anotacao-edit-textarea");
  const previewContainer = anotacaoItem.querySelector(".ai-preview-container");
  const suggestion = anotacaoItem.dataset.aiSuggestion;

  if (suggestion) {
    textarea.value = suggestion;
    anotacaoItem.dataset.aiImproved = 'true';
  }

  previewContainer.classList.add('d-none');
  delete anotacaoItem.dataset.aiSuggestion;

  showNotification("Sugestão aplicada! Clique em Salvar para confirmar.", "success");
}

/**
 * Rejeita a sugestão da IA
 * @param {HTMLElement} rejectBtn - O botão de rejeitar
 */
function handleRejectAISuggestion(rejectBtn) {
  const anotacaoItem = rejectBtn.closest(".anotacao-item");
  const previewContainer = anotacaoItem.querySelector(".ai-preview-container");

  previewContainer.classList.add('d-none');
  delete anotacaoItem.dataset.aiSuggestion;
}

// Variável para armazenar a sugestão da IA para nova anotação
let novaAnotacaoAISuggestion = null;

/**
 * Processa a melhoria de texto com IA para nova anotação
 * @param {HTMLElement} improveBtn - O botão de melhorar com IA
 */
async function handleImproveNovaAnotacaoWithAI(improveBtn) {
  const textarea = document.getElementById("nova-anotacao-texto");
  const previewContainer = document.getElementById("nova-anotacao-ai-preview");
  const previewText = document.getElementById("nova-anotacao-ai-text");

  const currentText = textarea.value.trim();
  if (!currentText) {
    showNotification("Digite algum texto primeiro.", "error");
    return;
  }

  // Mostra loading
  improveBtn.disabled = true;
  const originalBtnContent = improveBtn.innerHTML;
  improveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Processando...';

  try {
    const result = await aiService.improveText(currentText);

    if (result && result.improvedText) {
      previewText.textContent = result.improvedText;
      previewContainer.classList.remove('d-none');
      novaAnotacaoAISuggestion = result.improvedText;
    } else {
      showNotification("Não foi possível melhorar o texto. Tente novamente.", "warning");
    }
  } catch (error) {
    console.error("Erro ao melhorar com IA:", error);
    showNotification("Erro ao processar com IA. Tente novamente.", "error");
  } finally {
    improveBtn.disabled = false;
    improveBtn.innerHTML = originalBtnContent;
  }
}

/**
 * Aceita a sugestão da IA para nova anotação
 */
function handleAcceptNovaAnotacaoAI() {
  const textarea = document.getElementById("nova-anotacao-texto");
  const previewContainer = document.getElementById("nova-anotacao-ai-preview");

  if (novaAnotacaoAISuggestion) {
    textarea.value = novaAnotacaoAISuggestion;
  }

  previewContainer.classList.add('d-none');
  novaAnotacaoAISuggestion = null;

  showNotification("Sugestão aplicada!", "success");
}

/**
 * Rejeita a sugestão da IA para nova anotação
 */
function handleRejectNovaAnotacaoAI() {
  const previewContainer = document.getElementById("nova-anotacao-ai-preview");

  previewContainer.classList.add('d-none');
  novaAnotacaoAISuggestion = null;
}

/**
 * Obtém a visualização atual (kanban ou list)
 * @returns {string} A visualização atual
 */
export function getCurrentView() {
  if (!currentView) {
    currentView = getInitialCurrentView();
  }
  return currentView;
}

/**
 * Define a visualização atual
 * @param {string} view - A nova visualização (kanban ou list)
 */
export function setCurrentView(view) {
  currentView = view;
  if (appStateRef?.processosViewState) {
    appStateRef.processosViewState.view = view;
    appStateRef.currentView = view;
  }

  try {
    localStorage.setItem("processViewMode", view);
  } catch {
    // Persistência best-effort.
  }
}

/**
 * Função principal que inicializa todos os event listeners.
 * @param {Function} onViewUpdate - Função a ser chamada quando a view da tabela precisa ser atualizada.
 * @param {object} appState - O objeto de estado da aplicação.
 */
export function initializeEventListeners(onViewUpdate, appState) {
  // Verificar se o DOM está pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeEventListeners(onViewUpdate, appState);
    });
    return;
  }

  // Referencia o estado para uso nos listeners
  appStateRef = appState;
  if (DOMElements.processosViewContainer) {
    UI.toggleView(currentView);
  }

  // --- LISTENER: Clique no header do Kanban para filtrar por status ---
  document.addEventListener('kanbanHeaderClick', (event) => {
    const statusName = event.detail?.status;
    if (!statusName) return;
    
    console.log(` Kanban Header Click: Filtrando por "${statusName}" e alternando para Lista`);
    
    // 1. SALVA o estado atual dos filtros ANTES de modificar (para restaurar ao voltar ao Kanban)
    savedStatusStateBeforeFilter = new Set(appStateRef.selectedStatusState);
    console.log(` Estado salvo: ${savedStatusStateBeforeFilter.size} status selecionados`);
    
    // 2. Limpa todos os status selecionados
    appStateRef.selectedStatusState.clear();
    
    // 3. Adiciona apenas o status clicado
    appStateRef.selectedStatusState.add(statusName);
    
    // 4. Salva o estado TEMPORÁRIO no localStorage (será restaurado ao voltar)
    try {
      localStorage.setItem("statusFilterState", JSON.stringify([statusName]));
    } catch (e) {
      console.error("Erro ao salvar filtro:", e);
    }
    
    // 5. Alterna para visualização em lista
    setCurrentView("list");
    UI.toggleView("list");
    
    // 6. Atualiza os checkboxes do filtro de status na UI
    const filterContent = document.getElementById(
    "table-filter-scroll-content-offcanvas"
  );
    if (filterContent) {
      filterContent.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = checkbox.value === statusName;
      });
    }
    
    // 7. Notifica para recarregar os dados com o novo filtro
    onViewUpdate({ statusFilterChange: true });
    
    // 8. Mostra notificação
    UI.showNotification(`Filtrado por "${statusName}" - Volte ao Kanban para restaurar filtros`, "info");
  });

  const markDetailsFieldDirty = (event) => {
    const target = event.target;
    if (!target || !target.id || !target.id.startsWith("modal-")) {
      return;
    }

    // Ignora eventos disparados via script para não marcar o campo como alterado artificialmente
    if (!event.isTrusted) {
      return;
    }

    if (window.__DEBUG__) {
      console.debug(
        "[detailsForm] Alteração detectada",
        target.id,
        "via",
        event.type,
        "valor:",
        target.value
      );
    }

    target.dataset.userModified = "true";
  };

  const addSafeListener = (target, eventName, handler, options) => {
    if (!target?.addEventListener) {
      return false;
    }

    target.addEventListener(eventName, handler, options);
    return true;
  };

  if (DOMElements.detailsForm && !DOMElements.detailsForm.__dirtyTrackerBound) {
    DOMElements.detailsForm.addEventListener("input", markDetailsFieldDirty, true);
    DOMElements.detailsForm.addEventListener("change", markDetailsFieldDirty, true);
    DOMElements.detailsForm.__dirtyTrackerBound = true;
  }

  if (DOMElements.detailsForm && !DOMElements.detailsForm.__consultaKeyBound) {
    DOMElements.detailsForm.addEventListener(
      "input",
      (event) => {
        if (isConsultaDependencyTarget(event.target, "details")) {
          refreshConsultaKeyForForm("details", { markDirty: true });
        }

        if (isDetailsMirrorField(event.target)) {
          applyDetailsMirrorChange(event.target);
        }

        if (DETAILS_PRIMARY_TO_MIRROR_MAP[event.target?.id]) {
          syncDetailsMirrorField(event.target.id);
        }
      },
      true
    );

    DOMElements.detailsForm.addEventListener(
      "change",
      (event) => {
        if (isConsultaDependencyTarget(event.target, "details")) {
          refreshConsultaKeyForForm("details", { markDirty: true });
        }

        if (isDetailsMirrorField(event.target)) {
          applyDetailsMirrorChange(event.target);
        }

        if (DETAILS_PRIMARY_TO_MIRROR_MAP[event.target?.id]) {
          syncDetailsMirrorField(event.target.id);
        }
      },
      true
    );

    DOMElements.detailsForm.__consultaKeyBound = true;
  }

  // --- LISTENER: Botoes CEHOP NATO (adicionar/remover datas) ---
  if (DOMElements.detailsForm && !DOMElements.detailsForm.__cehopNatoBound) {
    // Delegacao de eventos para botoes de adicionar data
    DOMElements.detailsForm.addEventListener("click", (e) => {
      const addBtn = e.target.closest(".btn-add-cehop-date");
      if (addBtn) {
        e.preventDefault();
        const fieldId = addBtn.dataset.field;
        const input = document.getElementById(`modal-${fieldId}`);
        if (input && input.value) {
          // Obtem email do usuario atual
          const userEmail = window.userProfile?.email || null;
          // Adiciona a data usando a funcao do ui.js
          if (window.cehopNatoUtils && window.cehopNatoUtils.addCehopDate) {
            window.cehopNatoUtils.addCehopDate(fieldId, input.value, userEmail);
          }
        } else {
          // Alerta se nao houver data selecionada
          alert("Selecione uma data antes de adicionar ao historico.");
        }
        return;
      }

      // Delegacao para botoes de remover data
      const removeBtn = e.target.closest(".btn-remove-cehop-date");
      if (removeBtn) {
        e.preventDefault();
        const fieldId = removeBtn.dataset.field;
        const index = parseInt(removeBtn.dataset.index, 10);
        if (window.cehopNatoUtils && window.cehopNatoUtils.removeCehopDate) {
          window.cehopNatoUtils.removeCehopDate(fieldId, index);
        }
        return;
      }
    });
    DOMElements.detailsForm.__cehopNatoBound = true;
  }

  // --- LISTENER: Checkbox de processos arquivados ---
  if (DOMElements.includeArchivedCheckbox && !DOMElements.includeArchivedCheckbox.__listenerBound) {
    DOMElements.includeArchivedCheckbox.addEventListener("change", () => {
      console.log(` Checkbox Arquivados alterado: ${DOMElements.includeArchivedCheckbox.checked}`);
      if (typeof window.updateProcessosViewState === 'function') {
        window.updateProcessosViewState({ includeArchived: DOMElements.includeArchivedCheckbox.checked });
      }
      
      // Salva preferência no localStorage
      try {
        localStorage.setItem("includeArchived", DOMElements.includeArchivedCheckbox.checked);
      } catch (e) {
        console.error("Erro ao salvar preferência de arquivados:", e);
      }
      
      // Recarrega os contratos com o novo estado
      onViewUpdate({ includeArchivedChange: true });
    });
    DOMElements.includeArchivedCheckbox.__listenerBound = true;
  }

  // DEBUG: Verificar se elementos existem
  if (window.__DEBUG__) {
    console.log(' DEBUG: Verificando elementos DOM...');
    console.log(' DEBUG: DOMElements.navButtons:', DOMElements.navButtons);
    console.log(' DEBUG: document.querySelectorAll(".nav-button"):', document.querySelectorAll(".nav-button"));
    console.log(' DEBUG: DOMElements.pages:', DOMElements.pages);
  }

  // Re-selecionar elementos para garantir que estão atualizados
  // Excluir links externos (.nav-link-external) que devem navegar normalmente
  // Inclui atalhos fora da sidebar com data-page.
  const navButtons = document.querySelectorAll(
    '.nav-button:not(.nav-link-external), .page-shortcut[data-page]'
  );

  // Navegação Principal e Logout
  if (window.__DEBUG__) {
    console.log(` DEBUG: Encontrados ${navButtons.length} nav-buttons`);
  }
  const adminOnlyPages = new Set(["configuracoes", "relatorios"]);

  const getCurrentUserRole = () => {
    const roleFromPermissionsHelper = window.permissionsUIHelper?.currentUserPermissions?.role;
    const roleFromAppState = appStateRef.userPermissions?.role;
    return String(roleFromPermissionsHelper || roleFromAppState || "").toLowerCase();
  };

  const isCurrentUserAdmin = () => {
    const role = getCurrentUserRole();
    return role === "admin" || role === "super_admin";
  };

  navButtons.forEach((button, index) => {
    if (window.__DEBUG__) {
      console.log(` DEBUG: Nav-button ${index}: data-page="${button.dataset.page}"`);
    }
    button.addEventListener("click", async (e) => {
      e.preventDefault();
      const pageId = button.dataset.page;
      const sectionId = button.dataset.section;
      if (window.__DEBUG__) {
        console.log(` DEBUG: Clique no botão ${pageId}`);
      }

      if (adminOnlyPages.has(pageId) && !isCurrentUserAdmin()) {
        showNotification("Acesso permitido apenas para administradores.", "error");
        return;
      }

      navigateTo(pageId);

      if (pageId === "dashboard") {
        // Carrega os dados do dashboard quando navegar para a página
        initializeDashboard();
      }

      if (pageId === "relatorios") {
        if (window.reportsPage && typeof window.reportsPage.show === 'function') {
          window.reportsPage.show(sectionId);
        } else {
          populateFieldsForExport();
        }
      }

      if (pageId === "aprovacao") {
        if (window.aprovacaoPage && typeof window.aprovacaoPage.show === 'function') {
          window.aprovacaoPage.show();
        }
      }

      if (pageId === "processos") {
        const targetView = getCurrentView();
        setCurrentView(targetView);
        UI.toggleView(targetView);

        // Sempre recalcula a visualização de Processos para evitar usar estado paginado (25 itens)
        // quando o Kanban precisa do conjunto completo filtrado.
        if (typeof window.renderProcessosFromState === 'function') {
          try {
            await window.renderProcessosFromState({
              silent: true,
              source: 'navigate-processos'
            });
            const totalAfterReload = appStateRef.filteredContracts?.length || 0;
            console.log(` Navegando para Processos: ${totalAfterReload} contratos disponíveis`);
          } catch (err) {
            console.error(' Erro ao recarregar Processos:', err);
          }
        } else {
          const contractsToRender = appStateRef.allContracts || appStateRef.filteredContracts || [];
          console.log(` Navegando para Processos (fallback): ${contractsToRender.length} contratos disponíveis`);
          UI.renderKanbanBoard(
            contractsToRender,
            appStateRef.selectedStatusState,
            appStateRef.currentWorkflowType
          );
        }
      }
      if (pageId === "perfil") {
        UI.populateProfilePage();
      }

      if (pageId === "configuracoes") {
        loadAndRenderUsers();
        UI.loadAndRenderStatusRules();
        
        // Aguarda um pouco para garantir que a página está completamente renderizada
        setTimeout(() => {
          const statusList = document.getElementById('status-admin-list');
          if (!statusList) {
            if (window.__DEBUG__) {
              console.log(' StatusAdminUI adiado: container ainda não disponível nesta renderização');
            }
            return;
          }

          if (window.__statusAdminUIInitialized) {
            return;
          }
          if (window.__statusAdminUIInitInProgress) {
            return;
          }

          window.__statusAdminUIInitInProgress = true;
          // Inicializa o gerenciamento de status
          import('./statusAdminUI.js').then(module => {
            console.log(" Inicializando StatusAdminUI na página de configurações...");
            module.initStatusAdminUI().then(() => {
              window.__statusAdminUIInitialized = true;
            }).catch(err => {
              console.error(" Erro ao inicializar StatusAdminUI:", err);
            }).finally(() => {
              window.__statusAdminUIInitInProgress = false;
            });
          }).catch(err => {
            console.error(" Erro ao importar StatusAdminUI:", err);
            window.__statusAdminUIInitInProgress = false;
          });
        }, 100); // Delay de 100ms para garantir que o DOM está pronto
      }

      if (pageId === "ferramentas") {
        if (window.toolsPage && typeof window.toolsPage.show === "function") {
          window.toolsPage.show();
        }
      }
    });
  });

  if (DOMElements.logoutButton && !DOMElements.logoutButton.dataset.logoutBound) {
    DOMElements.logoutButton.dataset.logoutBound = "1";
    DOMElements.logoutButton.addEventListener("click", () => {
      auth
        .signOut()
        .then(() => (window.location.href = "login.html"))
        .catch(() => showNotification("Erro ao tentar sair.", "error"));
    });
  }

  // --- OUVINTES DO DASHBOARD ---
  const toggleLegendBtn = document.getElementById("toggle-legend-btn");
  const legendContainer = document.getElementById("chart-legend-container");

  // Função que aplica os filtros do dashboard (simplificada - sem filtro de construtora)
  function applyDashboardFilters() {
    // Verificar se os dados estão disponíveis
    if (!appStateRef.allDashboardContracts || appStateRef.allDashboardContracts.length === 0) {
      console.warn(" Dados do dashboard não disponíveis. Carregando...");
      initializeDashboard();
      return;
    }

    // Usa todos os contratos do dashboard (sem filtro de construtora)
    const filteredData = appStateRef.allDashboardContracts;

    // AJUSTE: Passa o estado de seleção do gráfico para a função de atualização.
    updateDashboard(filteredData, appStateRef.selectedChartStatusState);
  }

  // Adiciona o "ouvinte" para o botão "Filtrar Status" do gráfico
  if (toggleLegendBtn && legendContainer) toggleLegendBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    legendContainer.classList.toggle("is-open");
  });

  // AJUSTE: Adicionados os listeners para os botões de ação do filtro do gráfico.
  if (DOMElements.chartSelectAllBtn) DOMElements.chartSelectAllBtn.addEventListener("click", () => {
    const legendCheckboxes = document.querySelectorAll('#custom-legend input[type="checkbox"]');
    const availableChartStatuses = legendCheckboxes.length > 0
      ? Array.from(legendCheckboxes).map((checkbox) => checkbox.value)
      : (window.EFFECTIVE_STATUS_CONFIG || STATUS_CONFIG).map((status) => status.text);

    appStateRef.selectedChartStatusState = new Set(availableChartStatuses);
    applyDashboardFilters(); // O botão do gráfico agora também aciona a função que aplica todos os filtros
  });

  if (DOMElements.chartClearAllBtn) DOMElements.chartClearAllBtn.addEventListener("click", () => {
    appStateRef.selectedChartStatusState.clear();
    applyDashboardFilters(); // O botão do gráfico agora também aciona a função que aplica todos os filtros
  });

  // --- OUVINTES DA PÁGINA DE PROCESSOS ---
  // Busca: mantém rascunho local e só aplica ao confirmar
  if (DOMElements.searchInput) {
    DOMElements.searchInput.addEventListener("input", (e) => {
      if (typeof window.updateProcessosViewState === 'function') {
        window.updateProcessosViewState({ draftSearchTerm: e.target.value });
      }
    });

    DOMElements.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (typeof window.updateProcessosViewState === 'function') {
          window.updateProcessosViewState(
            { draftSearchTerm: DOMElements.searchInput.value },
            { syncDom: false }
          );
        }
        onViewUpdate({ searchTerm: true, source: 'search-enter' });
      }
    });
  }

  const searchClearBtn = document.getElementById("search-clear-btn");
  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", () => {
      if (typeof window.updateProcessosViewState === 'function') {
        window.updateProcessosViewState({
          draftSearchTerm: '',
          appliedSearchTerm: ''
        });
      } else if (DOMElements.searchInput) {
        DOMElements.searchInput.value = '';
      }

      onViewUpdate({ searchTerm: true, source: 'search-clear' });
      DOMElements.searchInput?.focus();
    });
  }

  // Botão de busca
  const searchBtn = document.getElementById("search-btn");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      if (typeof window.updateProcessosViewState === 'function') {
        window.updateProcessosViewState(
          { draftSearchTerm: DOMElements.searchInput?.value || '' },
          { syncDom: false }
        );
      }
      onViewUpdate({ searchTerm: true, source: 'search-button' });
    });
  }

  // Filtro de Status - agora usando offcanvas unificado
  const tableFilterContentOffcanvas = document.getElementById(
    "table-filter-scroll-content-offcanvas"
  );

  // Helper para salvar estado do filtro de status no localStorage
  const saveStatusFilterState = () => {
    try {
      const statusArray = Array.from(appState.selectedStatusState);
      localStorage.setItem("statusFilterState", JSON.stringify(statusArray));
      // Persiste também no Firestore (com debounce)
      persistFilterPreferencesToFirestore({ selectedStatus: statusArray });
    } catch (e) {
      console.error("Erro ao salvar o estado do filtro no localStorage:", e);
    }
  };

  // Popula o filtro de status quando o offcanvas abre
  const filtersOffcanvas = document.getElementById('filtersOffcanvas');
  if (filtersOffcanvas) {
    filtersOffcanvas.addEventListener('show.bs.offcanvas', () => {
      UI.populateStatusFilter(
        appState.selectedStatusState,
        onViewUpdate,
        saveStatusFilterState,
        appState.allContracts
      );
      // Também popula o filtro de vendedores
      populateVendorFilterOffcanvas();
      // Popula o filtro de empreendimentos
      populateEmpreendimentoFilterOffcanvas();
      // Popula o seletor de colunas
      UI.populateColumnSelector(appState.visibleColumns);
    });
  }

  if (tableFilterContentOffcanvas) tableFilterContentOffcanvas.addEventListener("change", (e) => {
    if (e.target.type === "checkbox") {
      const status = e.target.value;
      if (e.target.checked) {
        appState.selectedStatusState.add(status);
      } else {
        appState.selectedStatusState.delete(status);
      }
      // Persiste o estado do filtro
      saveStatusFilterState();
      if (typeof window.updateProcessosViewState === 'function') {
        window.updateProcessosViewState({ selectedStatuses: appState.selectedStatusState }, { syncDom: false });
      }
      // Atualiza o badge de filtros ativos
      updateActiveFiltersBadge();
      // Chama o onViewUpdate com a flag de mudança de filtro
      onViewUpdate({ statusFilterChange: true });
    }
  });

  // Ouvintes para o seletor de colunas (agora usando offcanvas unificado)
  // Popula colunas quando o offcanvas abre (já tratado no listener acima)

  // Botões Selecionar Todos / Limpar para Colunas
  const columnSelectAllBtn = document.getElementById("column-select-all-offcanvas");
  const columnClearAllBtn = document.getElementById("column-clear-all-offcanvas");

  if (columnSelectAllBtn) {
    columnSelectAllBtn.addEventListener("click", () => {
      document
        .querySelectorAll('#column-selector-grid-offcanvas input[type="checkbox"]')
        .forEach((cb) => (cb.checked = true));
    });
  }

  if (columnClearAllBtn) {
    columnClearAllBtn.addEventListener("click", () => {
      document
        .querySelectorAll('#column-selector-grid-offcanvas input[type="checkbox"]')
        .forEach((cb) => (cb.checked = false));
    });
  }

  if (DOMElements.columnSelectorForm) {
    DOMElements.columnSelectorForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const selectedCheckboxes =
        DOMElements.columnSelectorGrid.querySelectorAll("input:checked");
      const newVisibleKeys = Array.from(selectedCheckboxes).map((cb) => cb.value);

      // Validação: pelo menos uma coluna deve estar selecionada
      if (newVisibleKeys.length === 0) {
        UI.showNotification("Selecione pelo menos uma coluna", "warning");
        return;
      }

      appState.visibleColumns = newVisibleKeys;

      onViewUpdate();

      localStorage.setItem("visibleColumns", JSON.stringify(newVisibleKeys));
      // Persiste também no Firestore (com debounce)
      persistFilterPreferencesToFirestore({ visibleColumns: newVisibleKeys });
      
      // Não fecha o offcanvas, permitindo ajustes contínuos
    });
  }

  // Adicionados os listeners para os botões de ação do filtro da tabela.
  if (DOMElements.tableSelectAllBtn) DOMElements.tableSelectAllBtn.addEventListener("click", () => {
    document
      .querySelectorAll('#table-filter-scroll-content-offcanvas input[type="checkbox"]')
      .forEach((cb) => (cb.checked = true));
    appState.selectedStatusState = new Set((window.EFFECTIVE_STATUS_CONFIG || STATUS_CONFIG).map((s) => s.text));
    if (typeof window.updateProcessosViewState === 'function') {
      window.updateProcessosViewState({ selectedStatuses: appState.selectedStatusState }, { syncDom: false });
    }
    saveStatusFilterState();
    updateActiveFiltersBadge();
    onViewUpdate();
  });

  if (DOMElements.tableClearAllBtn) DOMElements.tableClearAllBtn.addEventListener("click", () => {
    document
      .querySelectorAll('#table-filter-scroll-content-offcanvas input[type="checkbox"]')
      .forEach((cb) => (cb.checked = false));
    appState.selectedStatusState.clear();
    // Persistir estado vazio para consistência entre sessões
    try {
      localStorage.setItem("statusFilterState", JSON.stringify([]));
      // Persiste também no Firestore
      persistFilterPreferencesToFirestore({ selectedStatus: [] });
    } catch (e) {
      console.warn(' Falha ao persistir statusFilterState vazio', e);
    }
    if (typeof window.updateProcessosViewState === 'function') {
      window.updateProcessosViewState({ selectedStatuses: appState.selectedStatusState }, { syncDom: false });
    }
    updateActiveFiltersBadge();
    onViewUpdate();
  });

  // --- Filtro de Construtora/Vendedor - agora usando offcanvas unificado ---
  const vendorFilterContentOffcanvas = document.getElementById("vendor-filter-scroll-content-offcanvas");

  const getContractsForOffcanvasFilters = async () => {
    const localSources = [
      appState.allContracts,
      appState.filteredContracts,
      appState.contracts
    ];

    for (const source of localSources) {
      if (Array.isArray(source) && source.length > 0) {
        return source;
      }
    }

    if (window.cacheService?.getCached) {
      const cacheKeys = [
        'contracts_all_active',
        'contractsAll',
        'contracts_all_with_archived',
        'reports_contracts_all'
      ];

      for (const key of cacheKeys) {
        try {
          const cached = await window.cacheService.getCached(key, 'contractsAll');
          if (Array.isArray(cached) && cached.length > 0) {
            appState.allContracts = cached;
            return cached;
          }
        } catch (error) {
          console.warn(`[FiltersOffcanvas] Falha ao ler cache local (${key})`, error);
        }
      }
    }

    return [];
  };

  // Função para popular o filtro de vendedores no offcanvas
  const populateVendorFilterOffcanvas = async () => {
    console.log('[VendorFilter] Offcanvas aberto - populando...');
    const contracts = await getContractsForOffcanvasFilters();
    if (!contracts.length) {
      console.log('[VendorFilter] Nenhum contrato disponível em cache local; evitando leitura remota.');
    }

    populateVendorFilter(contracts, appState.selectedVendorState);
  };

  if (vendorFilterContentOffcanvas) {
    vendorFilterContentOffcanvas.addEventListener("change", (e) => {
      if (e.target.type === "checkbox") {
        const vendor = e.target.value;
        if (e.target.checked) {
          appState.selectedVendorState.add(vendor);
        } else {
          appState.selectedVendorState.delete(vendor);
        }
        if (typeof window.updateProcessosViewState === 'function') {
          window.updateProcessosViewState({ selectedVendors: appState.selectedVendorState }, { syncDom: false });
        }
        saveVendorFilterState();
        updateActiveFiltersBadge();
        onViewUpdate({ vendorFilterChange: true });
        // Atualiza lista de empreendimentos quando construtora muda
        const sourceContracts = (appState.allContracts?.length ? appState.allContracts : appState.filteredContracts) || [];
        populateEmpreendimentoFilter(sourceContracts, appState.selectedEmpreendimentoState, appState.selectedVendorState);
      }
    });
  }

  // Botões Selecionar Todos / Limpar para Construtora
  const vendorSelectAllBtn = document.getElementById("vendor-select-all-offcanvas");
  const vendorClearAllBtn = document.getElementById("vendor-clear-all-offcanvas");

  if (vendorSelectAllBtn) {
    vendorSelectAllBtn.addEventListener("click", () => {
      document
        .querySelectorAll('#vendor-filter-scroll-content-offcanvas input[type="checkbox"]')
        .forEach((cb) => (cb.checked = true));
      // Adiciona todos os vendedores ao estado
      const sourceContracts = (appState.allContracts?.length ? appState.allContracts : appState.filteredContracts) || [];
      const allVendors = getUniqueVendors(sourceContracts);
      appState.selectedVendorState = new Set(allVendors);
      if (typeof window.updateProcessosViewState === 'function') {
        window.updateProcessosViewState({ selectedVendors: appState.selectedVendorState }, { syncDom: false });
      }
      saveVendorFilterState();
      updateActiveFiltersBadge();
      onViewUpdate();
      // Atualiza lista de empreendimentos
      populateEmpreendimentoFilter(sourceContracts, appState.selectedEmpreendimentoState, appState.selectedVendorState);
    });
  }

  if (vendorClearAllBtn) {
    vendorClearAllBtn.addEventListener("click", () => {
      document
        .querySelectorAll('#vendor-filter-scroll-content-offcanvas input[type="checkbox"]')
        .forEach((cb) => (cb.checked = false));
      appState.selectedVendorState.clear();
      if (typeof window.updateProcessosViewState === 'function') {
        window.updateProcessosViewState({ selectedVendors: appState.selectedVendorState }, { syncDom: false });
      }
      saveVendorFilterState();
      updateActiveFiltersBadge();
      onViewUpdate();
      // Atualiza lista de empreendimentos (mostra todos quando nenhuma construtora selecionada)
      const sourceContracts = (appState.allContracts?.length ? appState.allContracts : appState.filteredContracts) || [];
      populateEmpreendimentoFilter(sourceContracts, appState.selectedEmpreendimentoState, appState.selectedVendorState);
    });
  }

  // --- Filtro de Empreendimento ---
  const empreendimentoFilterContentOffcanvas = document.getElementById("empreendimento-filter-scroll-content-offcanvas");

  // Função para popular o filtro de empreendimentos no offcanvas
  const populateEmpreendimentoFilterOffcanvas = async () => {
    console.log('[EmpreendimentoFilter] Offcanvas aberto - populando...');
    const contracts = await getContractsForOffcanvasFilters();
    if (!contracts.length) {
      console.log('[EmpreendimentoFilter] Nenhum contrato disponível em cache local; evitando leitura remota.');
    }

    populateEmpreendimentoFilter(contracts, appState.selectedEmpreendimentoState, appState.selectedVendorState);
  };

  if (empreendimentoFilterContentOffcanvas) {
    empreendimentoFilterContentOffcanvas.addEventListener("change", (e) => {
      if (e.target.type === "checkbox") {
        const empreendimento = e.target.value;
        if (e.target.checked) {
          appState.selectedEmpreendimentoState.add(empreendimento);
        } else {
          appState.selectedEmpreendimentoState.delete(empreendimento);
        }
        if (typeof window.updateProcessosViewState === 'function') {
          window.updateProcessosViewState({ selectedEmpreendimentos: appState.selectedEmpreendimentoState }, { syncDom: false });
        }
        saveEmpreendimentoFilterState();
        updateActiveFiltersBadge();
        onViewUpdate({ empreendimentoFilterChange: true });
      }
    });
  }

  // Botões Selecionar Todos / Limpar para Empreendimento
  const empreendimentoSelectAllBtn = document.getElementById("empreendimento-select-all-offcanvas");
  const empreendimentoClearAllBtn = document.getElementById("empreendimento-clear-all-offcanvas");

  if (empreendimentoSelectAllBtn) {
    empreendimentoSelectAllBtn.addEventListener("click", () => {
      document
        .querySelectorAll('#empreendimento-filter-scroll-content-offcanvas input[type="checkbox"]')
        .forEach((cb) => (cb.checked = true));
      // Adiciona todos os empreendimentos visíveis ao estado
      const allEmpreendimentos = getUniqueEmpreendimentos(appState.allContracts, appState.selectedVendorState);
      appState.selectedEmpreendimentoState = new Set(allEmpreendimentos);
      if (typeof window.updateProcessosViewState === 'function') {
        window.updateProcessosViewState({ selectedEmpreendimentos: appState.selectedEmpreendimentoState }, { syncDom: false });
      }
      saveEmpreendimentoFilterState();
      updateActiveFiltersBadge();
      onViewUpdate();
    });
  }

  if (empreendimentoClearAllBtn) {
    empreendimentoClearAllBtn.addEventListener("click", () => {
      document
        .querySelectorAll('#empreendimento-filter-scroll-content-offcanvas input[type="checkbox"]')
        .forEach((cb) => (cb.checked = false));
      appState.selectedEmpreendimentoState.clear();
      if (typeof window.updateProcessosViewState === 'function') {
        window.updateProcessosViewState({ selectedEmpreendimentos: appState.selectedEmpreendimentoState }, { syncDom: false });
      }
      saveEmpreendimentoFilterState();
      updateActiveFiltersBadge();
      onViewUpdate();
    });
  }

  // --- Filtro de Tipo de Workflow ---
  //  Lógica movida para UI.populateWorkflowDropdown em js/ui.js
  // Chamado via main.js -> UI.populateWorkflowDropdown(...)
  const workflowTypeDropdown = document.getElementById("workflow-type-dropdown");
  if (workflowTypeDropdown) {
     // Apenas garante que o botão existe, mas a lógica de clique é injetada dinamicamente
  }

  // --- Paginação ---
  // Adiciona o ouvinte para o botão "Próximo"
  if (DOMElements.nextPageBtn) DOMElements.nextPageBtn.addEventListener("click", () => {
    // Verifica se há uma próxima página antes de avançar
    const isNextPageAvailable =
      appState.currentPage * appState.rowsPerPage < appState.totalContracts;
    if (isNextPageAvailable) {
      appState.currentPage++;
      if (typeof window.updateProcessosViewState === 'function') {
        window.updateProcessosViewState({
          pagination: {
            currentPage: appState.currentPage
          }
        }, { syncDom: false });
      }
      onViewUpdate(); // Chama a função para atualizar a visualização da tabela
    }
  });

  // Adiciona o ouvinte para o botão "Anterior"
  if (DOMElements.prevPageBtn) DOMElements.prevPageBtn.addEventListener("click", () => {
    if (appState.currentPage > 1) {
      appState.currentPage--;
      if (typeof window.updateProcessosViewState === 'function') {
        window.updateProcessosViewState({
          pagination: {
            currentPage: appState.currentPage
          }
        }, { syncDom: false });
      }
      onViewUpdate(); // Chama a função para atualizar a visualização da tabela
    }
  });

  // Adiciona o ouvinte para o seletor de itens por página
  if (DOMElements.rowsPerPageSelect) DOMElements.rowsPerPageSelect.addEventListener("change", (event) => {
    // Atualiza a quantidade de itens por página
    appState.rowsPerPage = parseInt(event.target.value, 10);
    appState.currentPage = 1; // Volta para a primeira página para evitar problemas de visualização
    if (typeof window.updateProcessosViewState === 'function') {
      window.updateProcessosViewState({
        pagination: {
          currentPage: 1,
          rowsPerPage: appState.rowsPerPage,
          firstVisible: null,
          lastVisible: null,
          pageSnapshots: [null]
        }
      }, { syncDom: false });
    }
    onViewUpdate({ rowsPerPage: true, source: 'rows-per-page-change' }); // Atualiza a visualização
  });

  if (DOMElements.tableHeader) DOMElements.tableHeader.addEventListener("click", (event) => {
    // 1. Encontra o elemento <th> que foi clicado.
    const th = event.target.closest("th");
    if (!th || !th.dataset.sortKey) return; // Ignora se não for um cabeçalho ordenável

    const newSortKey = th.dataset.sortKey;
    // Delega o cálculo de direção e reset de paginação ao main.js.
    // Evita dupla inversão quando múltiplos listeners de sort coexistem.
    onViewUpdate({ sortKey: newSortKey });
  });

  // Adicionar Contrato
  if (DOMElements.openAddModalBtn) DOMElements.openAddModalBtn.addEventListener(
    "click",
    () => {
      showModal(DOMElements.addContractModal);
      if (typeof UI.populateAddModalWorkflows === 'function') {
        UI.populateAddModalWorkflows();
      }
    }
  );
  if (DOMElements.closeAddModalBtn) DOMElements.closeAddModalBtn.addEventListener(
    "click",
    () => hideModal(DOMElements.addContractModal)
  );

  // ADICIONE ESTA LINHA PARA O BOTÃO 'X' DO MODAL DE DETALHES
  if (DOMElements.closeModalBtn) DOMElements.closeModalBtn.addEventListener("click", () => {
    hideModal(DOMElements.detailsModal);
  });

  // Ouvinte para o formulário de novo processo:
  if (DOMElements.contractForm) DOMElements.contractForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = event.target.querySelector("button[type=\"submit\"]");
    
    // Validar se botão existe (pode ser null se submit foi programático)
    if (btn) {
      btn.disabled = true;
      btn.textContent = "A guardar...";
    }

    try {
      //  AQUI ESTÁ A MUDANÇA: Usamos a nova função para coletar os dados
      const data = UI.getAddFormData();

      // Validação por campo (HTML5 + Bootstrap feedback)
      const form = event.target;
      const setFieldValidity = (fieldEl, message = "") => {
        if (!fieldEl) return;
        fieldEl.setCustomValidity(message);
        fieldEl.classList.toggle("is-invalid", Boolean(message));
      };

      const workflowField = document.getElementById("add-workflowId");
      const statusField = document.getElementById("add-status");
      const addVendorInput = document.getElementById("add-vendedorConstrutora");
      const empreendimentoField = document.getElementById("add-empreendimento");
      const nomeInput = document.querySelector("#add-compradores-container input[data-field='nome']");

      let hasErrors = false;

      // Workflow é obrigatório
      if (!workflowField?.value?.trim()) {
        setFieldValidity(workflowField, "Selecione o tipo de processo (workflow).");
        hasErrors = true;
      } else {
        setFieldValidity(workflowField, "");
      }

      // Status é obrigatório
      if (!statusField?.value?.trim()) {
        setFieldValidity(statusField, "Selecione o status inicial do processo.");
        hasErrors = true;
      } else {
        setFieldValidity(statusField, "");
      }

      // Construtora deve existir na listagem de vendors
      const vendorValidation = await validateVendorFromCatalog(data.vendedorConstrutora, {
        allowEmpty: false,
      });
      setVendorFieldValidationState(addVendorInput, vendorValidation);
      if (!vendorValidation.valid) {
        hasErrors = true;
      }

      // Empreendimento é obrigatório
      if (!data.empreendimento || data.empreendimento.trim() === "") {
        setFieldValidity(
          empreendimentoField,
          "Selecione um empreendimento vinculado à construtora informada."
        );
        hasErrors = true;
      } else {
        setFieldValidity(empreendimentoField, "");
      }

      // Verifica se há pelo menos um comprador com nome antes de salvar
      const hasValidComprador = data.compradores?.some(
        (c) => c.nome && c.nome.trim() !== ""
      );
      if (!hasValidComprador) {
        setFieldValidity(nomeInput, "Informe o nome do comprador principal.");
        hasErrors = true;
      } else {
        setFieldValidity(nomeInput, "");
      }

      if (hasErrors) {
        form.classList.add("was-validated");
        if (typeof form.reportValidity === "function") {
          form.reportValidity();
        }
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Adicionar Processo";
        }
        return;
      }

      // Chama a função de serviço, que já espera a estrutura com 'compradores'
      await firestore.addContract(data);
      showNotification("Processo adicionado com sucesso!", "success");
      DOMElements.contractForm.reset();
      DOMElements.contractForm.classList.remove("was-validated");

      // Limpa o container de compradores para o próximo uso
      UI.createCompradorFields({}, 0);

      hideModal(DOMElements.addContractModal);

      //  Força refresh completo do Firestore (sem usar cache)
      console.log(' [AddContract] Recarregando lista de contratos...');
      
      if (typeof window.loadContractsPage === 'function') {
        // Aguarda um momento e força refresh
        await new Promise(resolve => setTimeout(resolve, 300));
        await window.loadContractsPage('refresh');
        console.log(' Página de contratos recarregada após adicionar novo processo');
      } else {
        // Fallback: Recarrega a página se a função não estiver disponível
        console.warn(' loadContractsPage não disponível, usando onViewUpdate');
        onViewUpdate();
      }
    } catch (e) {
      showNotification(e?.message || "Erro ao adicionar o processo.", "error");
      console.error(e);
    } finally {
      //  Verifica se btn existe antes de usar
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Adicionar Processo";
      }
    }
  });
  // Ações na Tabela (Ver Detalhes, Excluir)
  addSafeListener(
    DOMElements.processosViewContainer,
    "click",
    async (event) => {
      const target = event.target;
      
      // Usa closest() para encontrar o botão mesmo se o clique foi em um filho (ícone, texto, etc)
      const detailsBtn = target.closest(".details-btn");
      const deleteBtn = target.closest(".delete-btn");
      
      // Se não clicou em nenhum botão relevante, ignora
      if (!detailsBtn && !deleteBtn) return;
      
      const btn = detailsBtn || deleteBtn;
      const id = btn?.dataset?.id;
      
      if (!id) return;

      // Lógica para o botão de detalhes (agora funciona em qualquer vista)
      if (detailsBtn) {
        try {
          setCurrentDetailsModalContract(await firestore.getContractById(id));
          if (originalContractData) {
            configureActiveDetailsModalContext(id);
            // Usa lista de analistas (disponível para todos) com fallback para allUsers (admin)
            const usersList = getDetailsModalUsersPayload().usersList;
            populateDetailsModal(originalContractData, usersList);
            const history = await firestore.getContractHistory(id);
            renderHistory(history);
          } else {
            showNotification("Contrato não encontrado.", "error");
          }
        } catch (error) {
          console.error("Erro ao buscar detalhes:", error);
          showNotification("Falha ao carregar detalhes.", "error");
        }
      }

      // Lógica para o botão de apagar (continua a funcionar na tabela)
      if (deleteBtn) {
        //  VERIFICAÇÃO DE PERMISSÃO: Apenas admin pode excluir
        if (window.permissionsUIHelper?.currentUserPermissions) {
          const userRole = window.permissionsUIHelper.currentUserPermissions.role;
          const isAdmin = userRole === 'super_admin' || userRole === 'admin';
          
          if (!isAdmin) {
            showNotification("Você não tem permissão para excluir processos.", "error");
            return;
          }
        }
        
        const confirmed = await confirmDelete('este processo');
        if (confirmed) {
          try {
            await firestore.deleteContract(id);
            showNotification("Processo excluído com sucesso!", "success");
            
            //  CORREÇÃO 05/12/2025: Remove do cache local e re-renderiza sem nova query
            if (window.removeContractFromLocalCache) {
              window.removeContractFromLocalCache(id);
            }
            if (window.rerenderCurrentView) {
              window.rerenderCurrentView();
            }
          } catch (e) {
            showNotification("Erro ao excluir o processo.", "error");
            console.error(e);
          }
        }
      }
    }
  );

  // Submissão do Formulário de Detalhes (Atualização)
  addSafeListener(DOMElements.detailsForm, "submit", async (event) => {
    event.preventDefault();
    
    // CORREÇÃO: O botão pode estar fora do form (vinculado por atributo form)
    // event.submitter é o padrão moderno, fallback para busca por seletor
    let btn = event.submitter;
    
    if (!btn) {
       // Fallback para navegadores antigos ou disparos programáticos
       btn = document.querySelector('button[type="submit"][form="details-form"]') || 
             event.target.querySelector('button[type="submit"]');
    }
    
    // Se ainda assim não achar, cria um objeto dummy para não quebrar
    if (!btn) {
        console.warn('Botão de submit não encontrado, criando dummy.');
        btn = { innerHTML: '', disabled: false }; 
    }

    const originalBtnContent = btn.innerHTML;
    btn.disabled = true;
    // Só altera HTML se for um elemento real
    if (btn instanceof HTMLElement) {
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Atualizando...';
    }

    const id = DOMElements.modalContractId.value;

    const vendorInput = document.getElementById("modal-vendedorConstrutora");
    const originalVendor = originalContractData?.vendedorConstrutora || "";
    const currentVendorFieldValue = normalizeVendorName(vendorInput?.value);
    const currentVendorValue = normalizeVendorName(
      typeof vendorInput?.value === "string" ? vendorInput.value : ""
    );
    const vendorAlterado =
      vendorInput?.dataset.userModified === "true" &&
      normalizeVendorKey(currentVendorFieldValue) !== normalizeVendorKey(originalVendor);

    // Se o usuário alterou o vendedor/construtora, o valor precisa existir na listagem
    if (vendorInput && vendorAlterado) {
      const vendorValidation = await validateVendorFromCatalog(currentVendorFieldValue, {
        allowEmpty: false,
      });
      setVendorFieldValidationState(vendorInput, vendorValidation);

      if (!vendorValidation.valid) {
        showNotification(
          vendorInput.validationMessage ||
            "Selecione uma construtora cadastrada na listagem antes de salvar.",
          "error"
        );
        vendorInput.focus();
        if (typeof vendorInput.reportValidity === "function") {
          vendorInput.reportValidity();
        }
        btn.disabled = false;
        if (btn instanceof HTMLElement) {
          btn.innerHTML = originalBtnContent;
        }
        return;
      }

    } else if (vendorInput) {
      setVendorFieldValidationState(vendorInput, { valid: true, reason: "ok" });
    }

    // Evita perda acidental do vendedor quando o campo não foi editado
    if (
      vendorInput &&
      vendorInput.dataset.userModified !== "true" &&
      currentVendorValue === "" &&
      originalContractData?.vendedorConstrutora
    ) {
      vendorInput.value = originalContractData.vendedorConstrutora;
    }

    const empreendimentoInput = document.getElementById("modal-empreendimento");
    const originalEmpreendimento = originalContractData?.empreendimento || "";
    const currentEmpreendimentoValue = (empreendimentoInput?.value || "").trim();

    // Preserva o empreendimento enquanto o vendedor permanecer inalterado
    if (
      empreendimentoInput &&
      empreendimentoInput.dataset.userModified !== "true" &&
      (currentEmpreendimentoValue === "") &&
      originalContractData?.empreendimento &&
      !vendorAlterado
    ) {
      empreendimentoInput.value = originalEmpreendimento;
    }

    if (!validateConsultaKeyBeforeSave("details")) {
      btn.disabled = false;
      if (btn instanceof HTMLElement) {
        btn.innerHTML = originalBtnContent;
      }
      return;
    }

    const updatedData = getFormData();

    //  PROTEÇÃO CONTRA PERDA DE STATUS: Se o status não foi coletado no getFormData(),
    // usa o status atual do contrato original para evitar perda
    if (!updatedData.status && originalContractData && originalContractData.status) {
      updatedData.status = originalContractData.status;
      console.log(` Status preservado do original: ${updatedData.status}`);
    }

    if (vendorInput && vendorAlterado) {
      updatedData.vendedorConstrutora = currentVendorFieldValue;
    } else if (
      vendorInput &&
      vendorInput.dataset.userModified !== "true" &&
      originalContractData?.vendedorConstrutora
    ) {
      updatedData.vendedorConstrutora = originalContractData.vendedorConstrutora;
    }

    if (
      empreendimentoInput &&
      empreendimentoInput.dataset.userModified !== "true" &&
      originalContractData?.empreendimento &&
      !vendorAlterado
    ) {
      updatedData.empreendimento = originalEmpreendimento;
    }

    const selectedStatusText = updatedData.status;
    const statusInfo =
      (window.EFFECTIVE_STATUS_CONFIG || STATUS_CONFIG).find((s) => s.text === selectedStatusText) ||
      (window.EFFECTIVE_STATUS_CONFIG || STATUS_CONFIG)[0];
    
    if (statusInfo) {
      updatedData.statusOrder = statusInfo.order;
    } else {
      console.warn(" Status não encontrado na configuração:", selectedStatusText);
    }

    try {
      await prepareDetailsModalMutation("save", id);

      // A correção está aqui: usamos 'originalContractData' em vez de 'originalData'
      await firestore.updateContract(
        id,
        updatedData,
        originalContractData,
        appStateRef.currentUserProfile
      );

      showNotification("Contrato atualizado com sucesso!", "success");

      //  ATUALIZAÇÃO (17/12/2025): Modal permanece ABERTO após salvar
      // Permite múltiplas edições sem precisar reabrir o modal

      const dadosAtualizados = await firestore.getContractById(id);
      if (dadosAtualizados) {
        setCurrentDetailsModalContract(dadosAtualizados);
        configureActiveDetailsModalContext(id);
        
        //  Re-popular o modal com os dados atualizados para refletir mudanças
        if (window.UI && window.UI.populateDetailsModal) {
          const usersList = getDetailsModalUsersPayload().usersList;
          window.UI.populateDetailsModal(dadosAtualizados, usersList);
        }
        
        const history = await firestore.getContractHistory(id);
        renderHistory(history);
        
        //  CORREÇÃO 05/12/2025: Atualizar TODOS os caches locais com dados atualizados
        // Usa função centralizada que atualiza appState, filteredContracts e _kanbanContractsCache
        if (window.updateContractInLocalCache) {
          window.updateContractInLocalCache(id, dadosAtualizados);
        }
        
        //  Re-renderiza a UI com dados locais (sem nova query ao Firestore)
        // Modal permanece aberto para permitir edições adicionais
        if (window.rerenderCurrentView) {
          console.log(' [UpdateContract] Re-renderizando UI com dados locais (modal aberto)...');
          window.rerenderCurrentView();
        }
      }
    } catch (e) {
      showNotification(e?.message || "Erro ao atualizar o contrato.", "error");
      console.error(e);
    } finally {
      if (btn instanceof HTMLElement) {
        btn.disabled = false;
        btn.innerHTML = originalBtnContent;
      }
    }
  });

  //  PROTEÇÃO: Listener para garantir que a página permaneça ativa ao fechar o modal de detalhes
  // Isso previne o problema de tela em branco caso a página perca o .active durante a re-renderização
  if (DOMElements.detailsModal) {
    DOMElements.detailsModal.addEventListener('hidden.bs.modal', () => {
      if (window.__DEBUG__) {
        console.log('[DetailsModal]  Modal de detalhes foi fechado, validando estado da página...');
      }
      
      // Verifica se alguma página está ativa
      const activePage = document.querySelector('.page.active');
      if (!activePage) {
        console.warn(' [DetailsModal] Nenhuma página ativa detectada! Re-ativando page-processos...');
        
        // Re-ativa a página de processos como fallback
        const processosPage = document.getElementById('page-processos');
        if (processosPage) {
          processosPage.classList.add('active');
          console.log(' [DetailsModal] page-processos re-ativada com sucesso');
          
          // Dispara evento customizado para notificar a aplicação
          document.dispatchEvent(new CustomEvent('pageReactivated', {
            detail: { pageId: 'page-processos', reason: 'details-modal-closed' }
          }));
        }
      } else if (window.__DEBUG__) {
        console.log('[DetailsModal]  Página ativa mantida:', activePage.id);
      }
    }, { once: false });
  }

  // AJUSTE: Fechar modais e painéis ao clicar fora
  window.addEventListener("click", (event) => {
    if (event.target == DOMElements.addContractModal)
      hideModal(DOMElements.addContractModal);
    
    //  REMOVIDO: Modal de bulk update foi convertido para collapse
    // Não precisa mais fechar ao clicar fora

    // Fechar modal de detalhes ao clicar no backdrop (elemento vazio ao redor)
    if (event.target == DOMElements.detailsModal) {
      hideModal(DOMElements.detailsModal);
    }

    // AJUSTE: Lógica para fechar a legenda do gráfico
    if (
      legendContainer &&
      legendContainer.classList.contains("is-open") &&
      !legendContainer.contains(event.target) &&
      event.target !== toggleLegendBtn
    ) {
      legendContainer.classList.remove("is-open");
    }

    // Nota: Os painéis de filtro de status e construtora agora usam Bootstrap Dropdown
    // que gerencia o fechamento automaticamente
  });

  if (DOMElements.bulkUpdateForm) DOMElements.bulkUpdateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = DOMElements.bulkUpdateForm.querySelector("button");
    btn.disabled = true;
    btn.textContent = "A aplicar...";

    const selectedIds = Array.from(
      DOMElements.contractList.querySelectorAll(".row-checkbox:checked")
    ).map((cb) => cb.dataset.id);

    const dataToUpdate = {};

    // 1. STATUS
    const newStatusText = document.getElementById("bulk-status").value;
    if (newStatusText) {
      const statusSource = window.EFFECTIVE_STATUS_CONFIG || STATUS_CONFIG;
      const statusInfo = statusSource.find((s) => s.text === newStatusText);
      if (statusInfo) {
        dataToUpdate.status = statusInfo.text;
        dataToUpdate.statusOrder = statusInfo.order;
      }
    }

    // 2. ANALISTA
    const newAnalista = document.getElementById("bulk-analista").value;
    if (newAnalista) {
      dataToUpdate.analistaCadastro = newAnalista;
    }

    // 3. CARTÓRIO
    const newCartorio = document.getElementById("bulk-cartorio").value;
    if (newCartorio) {
      dataToUpdate.cartorioRegistro = newCartorio;
    }

    // 4. CAMPOS SELECT ADICIONAIS
    const selectFields = [
      { id: 'bulk-workflowId', field: 'workflowId' },
      { id: 'bulk-analistaCehop', field: 'analistaCehop' },
      { id: 'bulk-tipoImovel', field: 'tipoImovel' },
      { id: 'bulk-renda', field: 'renda' },
      { id: 'bulk-validacao', field: 'validacao' },
      { id: 'bulk-fgts', field: 'fgts', isBoolean: true },
      { id: 'bulk-casaFacil', field: 'casaFacil', isBoolean: true },
      { id: 'bulk-certificadora', field: 'certificadora' },
      { id: 'bulk-sehab', field: 'sehab' },
      { id: 'bulk-pesquisas', field: 'pesquisas' },
      { id: 'bulk-tipoConsulta', field: 'tipoConsulta' },
      { id: 'bulk-montagemComplementar', field: 'montagemComplementar' },
      { id: 'bulk-montagemCehop', field: 'montagemCehop' },
      { id: 'bulk-preEntrevista', field: 'preEntrevista' },
      { id: 'bulk-certidaoAtualizada', field: 'certidaoAtualizada' },
      { id: 'bulk-declaracaoEstadoCivil', field: 'declaracaoEstadoCivil' },
      { id: 'bulk-produto', field: 'produto' }
    ];

    selectFields.forEach(({ id, field, isBoolean }) => {
      const el = document.getElementById(id);
      if (el && el.value) {
        if (isBoolean) {
          dataToUpdate[field] = el.value === 'true';
        } else {
          dataToUpdate[field] = el.value;
        }
      }
    });

    // 5. CAMPOS DE TEXTO
    const textFields = [
      'vendedorConstrutora', 'empreendimento', 'apto', 'bloco',
      'agencia', 'gerente', 'imobiliaria', 'corretor',
      'nContratoCEF', 'codigoCCA', 'iptu', 'protocoloRi', 'formaPagamentoRi',
      'enderecoImovel', 'cidadeImovel', 'ufImovel', 'cepImovel',
      'inscricaoImobiliaria', 'matriculaImovel', 'faltaFinalizar',
      'documentacaoRepasse'
    ];

    textFields.forEach(field => {
      const el = document.getElementById(`bulk-${field}`);
      if (el && el.value && el.value.trim() !== '') {
        dataToUpdate[field] = el.value.trim();
      }
    });

    // 6. CAMPOS NUMÉRICOS (8 campos)
    const numericFields = [
      'valorITBI', 'valorFunrejus', 'valorFinalRi', 'valorContratoBanco',
      'valorDespachante', 'valorDepositoRi', 'areaTerreno', 'areaConstruida'
    ];

    numericFields.forEach(field => {
      const el = document.getElementById(`bulk-${field}`);
      if (el && el.value !== '' && el.value !== null) {
        const numVal = parseFloat(el.value);
        if (!isNaN(numVal)) {
          dataToUpdate[field] = numVal;
        }
      }
    });

    // 7. CAMPOS DE DATA (todos os campos dinamicamente criados com classe .bulk-date-field)
    const dateFieldElements = document.querySelectorAll('.bulk-date-field');
    dateFieldElements.forEach(field => {
      if (field.value) {
        const fieldName = field.dataset.field;
        dataToUpdate[fieldName] = new Date(field.value);
      }
    });

    if (Object.keys(dataToUpdate).length === 0) {
      showNotification("Nenhum campo foi preenchido para alteração.", "error");
      btn.disabled = false;
      btn.textContent = "Aplicar Alterações";
      return;
    }

    try {
      // Chama a nossa nova função de serviço centralizada
      await firestore.bulkUpdateContracts(selectedIds, dataToUpdate);

      const updatedFieldsCount = Object.keys(dataToUpdate).length;
      showNotification(
        `${selectedIds.length} processos atualizados com ${updatedFieldsCount} campo(s) modificado(s)!`,
        "success"
      );

      // Limpa a UI e fecha o collapse
      DOMElements.bulkUpdateForm.reset();

      //  Fecha o collapse usando Bootstrap
      const collapseElement = document.getElementById('bulk-update-collapse');
      if (collapseElement && window.bootstrap?.Collapse) {
        const bsCollapse = window.bootstrap.Collapse.getInstance(collapseElement) || new window.bootstrap.Collapse(collapseElement, { toggle: false });
        bsCollapse.hide();
      }

      //  Atualização em massa requer refresh completo pois múltiplos contratos mudaram
      // Invalida caches e recarrega dados
      onViewUpdate();
    } catch (error) {
      console.error("Erro ao atualizar em massa: ", error);
      showNotification(error?.message || "Ocorreu um erro ao aplicar as alterações.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Aplicar Alterações";
    }
  });

  // Este ouvinte genérico lida com cada checkbox de cada linha
  if (DOMElements.contractList) DOMElements.contractList.addEventListener("change", (event) => {
    // Verifica se o elemento que ativou o evento é um dos nossos checkboxes de linha
    if (event.target.classList.contains("row-checkbox")) {
      // Chama a função que acabamos de adicionar em ui.js
      updateBulkActionUI();
    }
  });

  // --- OUVINTE PARA BOTÃO DE ALTERAÇÃO EM MASSA ---
  if (DOMElements.bulkUpdateBtn) DOMElements.bulkUpdateBtn.addEventListener("click", () => {
    // 1. POPULA O SELECT DE STATUS (DINÂMICO)
    const statusSelect = document.getElementById("bulk-status");
    statusSelect.innerHTML = '<option value="">-- Manter Status Atual --</option>';

    // Usa configuração dinâmica de status se disponível, senão fallback
    const statusSource = window.EFFECTIVE_STATUS_CONFIG || STATUS_CONFIG;
    statusSource.forEach((statusInfo) => {
      const option = document.createElement("option");
      option.value = statusInfo.text;
      option.textContent = `${statusInfo.order} - ${statusInfo.text}`;
      statusSelect.appendChild(option);
    });

    // 2. POPULA O SELECT DE ANALISTA (usa analysts para todos, fallback para allUsers)
    const analistaSelect = document.getElementById("bulk-analista");
    const usersList = appStateRef.analysts?.length > 0 ? appStateRef.analysts : appStateRef.allUsers;
    if (analistaSelect && usersList) {
      analistaSelect.innerHTML = '<option value="">-- Manter Atual --</option>';
      usersList.forEach((user) => {
        const option = document.createElement("option");
        option.value = user.fullName || user.fullname || user.email;
        option.textContent = user.fullName || user.fullname || user.email;
        analistaSelect.appendChild(option);
      });
    }

    // 3. POPULA O SELECT DE ANALISTA CEHOP (mesma lista de usuários)
    const analistaCehopSelect = document.getElementById("bulk-analistaCehop");
    if (analistaCehopSelect && usersList) {
      analistaCehopSelect.innerHTML = '<option value="">-- Manter --</option>';
      usersList.forEach((user) => {
        const option = document.createElement("option");
        option.value = user.fullName || user.fullname || user.email;
        option.textContent = user.fullName || user.fullname || user.email;
        analistaCehopSelect.appendChild(option);
      });
    }

    // 4. POPULA O SELECT DE WORKFLOW (dinâmico do appState)
    const workflowSelect = document.getElementById("bulk-workflowId");
    if (workflowSelect && appStateRef.workflows) {
      workflowSelect.innerHTML = '<option value="">-- Manter --</option>';
      appStateRef.workflows.forEach((wf) => {
        const option = document.createElement("option");
        option.value = wf.id;
        option.textContent = wf.name || wf.id;
        workflowSelect.appendChild(option);
      });
    }

    // 5. POPULA OS CAMPOS DE DATA DINAMICAMENTE (VERSÃO EXPANDIDA)
    const dateFieldsContainer = document.getElementById("bulk-date-fields");
    dateFieldsContainer.innerHTML = '';

    // Lista completa de todos os campos de data disponíveis (incluindo datetime-local)
    const dateFields = [
      // Campos de data simples (type="date")
      { key: "entrada", text: "Entrada", type: "date" },
      { key: "dataAssinaturaCliente", text: "Assinatura Cliente", type: "date" },
      { key: "dataMinuta", text: "Minuta", type: "date" },
      { key: "minutaRecebida", text: "Minuta Recebida", type: "date" },
      { key: "dataEntradaRegistro", text: "Entrada Cartório", type: "date" },
      { key: "dataRetiradaContratoRegistrado", text: "Contrato Reg.", type: "date" },
      { key: "enviadoVendedor", text: "Env. Vendedor", type: "date" },
      { key: "retornoVendedor", text: "Ret. Vendedor", type: "date" },
      { key: "enviadoAgencia", text: "Env. Agência", type: "date" },
      { key: "retornoAgencia", text: "Ret. Agência", type: "date" },
      { key: "solicitaITBI", text: "Solic. ITBI", type: "date" },
      { key: "retiradaITBI", text: "Ret. ITBI", type: "date" },
      { key: "enviadoPgtoItbi", text: "Env. Pgto ITBI", type: "date" },
      { key: "retornoPgtoItbi", text: "Ret. Pgto ITBI", type: "date" },
      { key: "dataAnaliseRegistro", text: "Análise Reg.", type: "date" },
      { key: "dataPrevistaRegistro", text: "Prevista Reg.", type: "date" },
      { key: "dataRetornoRi", text: "Retorno RI", type: "date" },
      { key: "dataSolicitacaoFunrejus", text: "Solic. Funrejus", type: "date" },
      { key: "dataEmissaoFunrejus", text: "Emissão Funrejus", type: "date" },
      { key: "funrejusEnviadoPgto", text: "Funrejus Env.", type: "date" },
      { key: "funrejusRetornoPgto", text: "Funrejus Ret.", type: "date" },
      { key: "dataEnvioLiberacaoGarantia", text: "Lib. Garantia", type: "date" },
      { key: "dataConformidadeCehop", text: "Conf. CEHOP", type: "date" },
      { key: "dataEmissaoNF", text: "Emissão NF", type: "date" },
      { key: "certificacaoSolicEm", text: "Solic. Certif.", type: "date" },
      { key: "solicitacaoCohapar", text: "Solic. Cohapar", type: "date" },
      { key: "cohaparAprovada", text: "Cohapar Aprov.", type: "date" },
      { key: "vencSicaq", text: "Venc. SICAQ", type: "date" },
      { key: "agendamentoFormulario", text: "Agend. Form.", type: "date" },
      { key: "espelhoEnviado", text: "Espelho Enviado", type: "date" },
      { key: "ccsAprovada", text: "CCS Aprovada", type: "date" },
      { key: "devolucaoParaCorrecao", text: "Dev. p/ Correção", type: "date" },
      { key: "devolvidoCorrigido", text: "Dev. Corrigido", type: "date" },
      { key: "dataDeEnvioDaPastaAgencia", text: "Env. Pasta Agên.", type: "date" },
      // Campos datetime-local
      { key: "certificacaoRealizadaEm", text: "Certif. Realizada", type: "datetime-local" },
      { key: "formulariosEnviadosEm", text: "Form. Enviados", type: "datetime-local" },
      { key: "formulariosAssinadosEm", text: "Form. Assinados", type: "datetime-local" },
      { key: "entregueCehop", text: "Entregue CEHOP", type: "datetime-local" },
      { key: "enviadoACehop", text: "Env. CEHOP", type: "datetime-local" },
      { key: "reenviadoCehop", text: "Reenv. CEHOP", type: "datetime-local" },
      { key: "conformeEm", text: "Conforme Em", type: "datetime-local" },
      { key: "conferenciaCehopNatoEntregueEm", text: "Conf. NATO Entregue", type: "datetime-local" },
      { key: "conferenciaCehopNatoDevolvidaEm", text: "Conf. NATO Devolvida", type: "datetime-local" },
      { key: "entrevistaCef", text: "Entrevista CEF", type: "datetime-local" },
      { key: "contratoCef", text: "Contrato CEF", type: "datetime-local" }
    ];

    // Criar campos de data em grupos de 3 por linha (mais compacto)
    for (let i = 0; i < dateFields.length; i += 3) {
      const row = document.createElement('div');
      row.className = 'row g-2 mb-2';

      for (let j = i; j < Math.min(i + 3, dateFields.length); j++) {
        const field = dateFields[j];
        const inputType = field.type || 'date';
        const col = document.createElement('div');
        col.className = 'col-md-4';
        col.innerHTML = `
          <label for="bulk-${field.key}" class="form-label small mb-1">${field.text}:</label>
          <input type="${inputType}" id="bulk-${field.key}" class="form-control form-control-sm bulk-date-field" data-field="${field.key}" data-type="${inputType}">
        `;
        row.appendChild(col);
      }

      dateFieldsContainer.appendChild(row);
    }

    //  Agora o collapse é aberto automaticamente via Bootstrap (data-bs-toggle no botão)
    // Não precisa mais de código manual para abrir/fechar
  });

  // --- REMOVIDO: Listener para fechar modal (não é mais necessário com collapse) ---
  // O collapse é fechado via data-bs-toggle no botão de fechar

  // --- OUVINTE PARA CRIAR NOVO UTILIZADOR ---
  const setupUserListeners = () => {
  const addUserForm = document.getElementById('add-user-form');
  if (addUserForm) {
    addUserForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!addUserForm.checkValidity()) {
        addUserForm.classList.add("was-validated");
        showNotification(
          "Revise os campos obrigatórios antes de continuar.",
          "error"
        );
        return;
      }

      const btn = addUserForm.querySelector('button[type="submit"]');
      const fullName = document.getElementById("new-user-fullname").value.trim();
      const cpf = document.getElementById("new-user-cpf").value.trim();
      const email = document.getElementById("new-user-email").value.trim();
      const password = document.getElementById("new-user-password").value;
      const originalBtnHtml = btn ? btn.innerHTML : "";

      if (btn) {
        btn.disabled = true;
        btn.innerHTML =
          '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>A criar...';
      }

      try {
        const result = await firestore.createNewUser(
          email,
          password,
          fullName,
          cpf
        );
        showNotification(result.data.result, "success");
        addUserForm.reset();
        addUserForm.classList.remove("was-validated");

        if (typeof UI.loadAndRenderUsers === "function") {
          UI.loadAndRenderUsers();
        }
      } catch (error) {
        console.error("Erro ao criar usuário:", error);
        showNotification(error.message, "error");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalBtnHtml;
        }
      }
    });
  }

  // --- OUVINTE PARA GESTÃO DE UTILIZADORES ---
  const userListTbody = document.getElementById('user-list-tbody');
  if (userListTbody) {
    userListTbody.addEventListener("click", async (event) => {
      const actionButton = event.target.closest(".action-btn");
      if (!actionButton || actionButton.disabled || !userListTbody.contains(actionButton)) {
        return;
      }

      const uid = actionButton.dataset.uid;
      const email = actionButton.dataset.email;

      try {
        if (actionButton.classList.contains("promote")) {
          const confirmed = await confirmInline({
            title: 'Promover a administrador',
            message: `Tem certeza que deseja promover <strong>${email}</strong> a administrador?`,
            confirmText: 'Promover',
            confirmClass: 'btn-success',
            icon: 'bi-shield-check'
          });
          if (confirmed) {
            const result = await firestore.setAdminRole(email);
            showNotification(result.data.message, "success");
          }
        } else if (actionButton.classList.contains("demote")) {
          const confirmed = await confirmInline({
            title: 'Rebaixar administrador',
            message: `Tem certeza que deseja rebaixar <strong>${email}</strong> para usuário comum?`,
            confirmText: 'Rebaixar',
            confirmClass: 'btn-warning',
            icon: 'bi-shield-minus'
          });
          if (confirmed) {
            const result = await firestore.removeAdminRole(email);
            showNotification(result.data.message, "success");
          }
        } else if (actionButton.classList.contains("disable")) {
          const confirmed = await confirmInline({
            title: 'Alterar status do usuário',
            message: 'Tem certeza que deseja alterar o status deste usuário?',
            confirmText: 'Alterar',
            confirmClass: 'btn-warning',
            icon: 'bi-toggle-on'
          });
          if (confirmed) {
            const result = await firestore.toggleUserStatus(uid);
            showNotification(result.data.message, "success");
          }
        } else if (actionButton.classList.contains("delete")) {
          const confirmed = await confirmInline({
            title: 'Excluir usuário',
            message: '<strong>Atenção!</strong> Esta ação é irreversível.<br>Tem certeza que deseja excluir este usuário?',
            confirmText: 'Excluir',
            confirmClass: 'btn-danger',
            icon: 'bi-trash'
          });
          if (confirmed) {
            const result = await firestore.deleteUser(uid);
            showNotification(result.data.message, "success");
          }
        }

        // Após qualquer ação bem-sucedida, recarrega a lista de usuários
        loadAndRenderUsers();
      } catch (error) {
        console.error("Erro ao executar ação de usuário:", error);
        showNotification(error.message, "error");
      }
    });
  }

  // --- OUVINTE PARA CARREGAR USUARIOS AO ABRIR O MODAL ---
  const modalUsuarios = document.getElementById('modal-usuarios');
  if (modalUsuarios) {
    modalUsuarios.addEventListener('shown.bs.modal', () => {
      loadAndRenderUsers();
    });
    // Fallback: também escuta o evento 'show' do modal customizado (CSS-only)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class' && modalUsuarios.classList.contains('show')) {
          loadAndRenderUsers();
        }
      });
    });
    observer.observe(modalUsuarios, { attributes: true });
  }

  // --- OUVINTES PARA FILTROS LOCAIS DE UTILIZADORES ---
  const userSearchInput = document.getElementById('user-search');
  if (userSearchInput) {
    userSearchInput.addEventListener('input', () => {
      if (typeof UI.applyUsersTableFilters === "function") {
        UI.applyUsersTableFilters();
      }
    });
  }

  const userFilterRadios = document.querySelectorAll('input[name="user-filter"]');
  userFilterRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (typeof UI.applyUsersTableFilters === "function") {
        UI.applyUsersTableFilters();
      }
    });
  });

  // --- OUVINTE PARA BOTAO ATUALIZAR USUARIOS ---
  const refreshUsersBtn = document.getElementById('refresh-users-btn');
  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener('click', () => {
      loadAndRenderUsers();
    });
  }
  };
  if (window.__UI_COMPONENTS_RENDERED__) setupUserListeners();
  else window.addEventListener('ui:components:rendered', setupUserListeners);

  // --- OUVINTE PARA ALTERNAR A VISUALIZAÇÃO DE PROCESSOS ---
  if (DOMElements.toggleViewBtn) {
    DOMElements.toggleViewBtn.addEventListener("click", async () => {
      console.log(" Botão de alternância clicado! Estado atual:", currentView);
      
      // Alterna o estado da vista
      const newView = currentView === "list" ? "kanban" : "list";
      setCurrentView(newView);
      if (typeof window.updateProcessosViewState === 'function') {
        window.updateProcessosViewState({ view: newView }, { syncDom: false });
      }
      
      console.log(" Novo estado da vista:", currentView);

      // Chama a função do ui.js para mudar o CSS e o texto do botão
      UI.toggleView(newView);

      // Re-renderiza os dados na nova visualização
      if (newView === "kanban") {
        if ((!Array.isArray(appStateRef.allContracts) || appStateRef.allContracts.length === 0)
          && typeof window.ensureContractsCachePreload === "function") {
          try {
            UI.showNotification("Carregando todos os processos para o Kanban...", "info");
            const contracts = await window.ensureContractsCachePreload({ reason: "toggle-to-kanban" });
            if (Array.isArray(contracts) && contracts.length > 0) {
              appStateRef.allContracts = contracts;
            }
          } catch (error) {
            console.error(" Erro ao preparar cache completo para Kanban:", error);
            UI.showNotification("Não foi possível carregar os processos completos para o Kanban.", "error");
            return;
          }
        }

        console.log(" Renderizando Kanban...");
        
        // RESTAURA o estado salvo antes do clique no header (se existir)
        if (savedStatusStateBeforeFilter && savedStatusStateBeforeFilter.size > 0) {
          console.log(` Restaurando ${savedStatusStateBeforeFilter.size} status salvos anteriormente`);
          
          // Restaura o estado
          appStateRef.selectedStatusState.clear();
          savedStatusStateBeforeFilter.forEach(status => {
            appStateRef.selectedStatusState.add(status);
          });
          
          // Salva no localStorage
          try {
            localStorage.setItem("statusFilterState", JSON.stringify(Array.from(savedStatusStateBeforeFilter)));
          } catch (e) {
            console.error("Erro ao salvar filtro restaurado:", e);
          }
          
          // Atualiza os checkboxes do filtro de status na UI
          const filterContent = document.getElementById(
    "table-filter-scroll-content-offcanvas"
  );
          if (filterContent) {
            filterContent.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
              checkbox.checked = savedStatusStateBeforeFilter.has(checkbox.value);
            });
          }
          
          // Limpa o estado salvo
          savedStatusStateBeforeFilter = null;
          
          UI.showNotification("Filtros restaurados", "success");
        }

        if (typeof window.renderProcessosFromState === 'function') {
          await window.renderProcessosFromState({
            silent: true,
            preferLocalData: true,
            source: 'toggle-view-kanban'
          });
        } else {
          UI.renderKanbanBoard(appStateRef.allContracts || [], appStateRef.selectedStatusState, appStateRef.currentWorkflowType);
        }
      } else {
        console.log(" Renderizando Lista...");
        if (typeof window.renderProcessosFromState === 'function') {
          await window.renderProcessosFromState({
            silent: true,
            source: 'toggle-view-list'
          });
        } else {
          onViewUpdate();
        }
      }
  });
  }

  // --- FUNCIONALIDADE: DRAG-TO-SCROLL PARA O KANBAN ---
  if (DOMElements.kanbanBoard) {
    // 1. Variáveis de estado para o arraste
    let isDown = false;
    let startX;
    let scrollLeft;

    const kanbanBoard = DOMElements.kanbanBoard;

    // 2. Ouvinte quando o botão do rato é pressionado
    kanbanBoard.addEventListener("mousedown", (e) => {
      isDown = true;
      kanbanBoard.classList.add("active-drag"); // Adiciona um cursor de arraste visual (opcional)
      startX = e.pageX - kanbanBoard.offsetLeft;
      scrollLeft = kanbanBoard.scrollLeft;
    });

    // 3. Ouvinte quando o rato sai ou o botão é solto
    kanbanBoard.addEventListener("mouseleave", () => {
      isDown = false;
      kanbanBoard.classList.remove("active-drag");
    });
    kanbanBoard.addEventListener("mouseup", () => {
      isDown = false;
      kanbanBoard.classList.remove("active-drag");
    });

    // 4. Ouvinte quando o rato se move
    kanbanBoard.addEventListener("mousemove", (e) => {
      if (!isDown) return; // Se o botão não estiver pressionado, ignora
      e.preventDefault();
      const x = e.pageX - kanbanBoard.offsetLeft;
      const walk = (x - startX) * 2; // Multiplica para um scroll mais rápido
      kanbanBoard.scrollLeft = scrollLeft - walk;
    });
  }

  const toggleCompradoresEditBtn = document.getElementById(
    "toggle-compradores-edit-btn"
  );
  if (toggleCompradoresEditBtn) {
    toggleCompradoresEditBtn.addEventListener("click", () => {
      const nextState = !isCompradoresEditModeEnabled();
      setCompradoresEditMode(nextState);
      showNotification(
        nextState
          ? "Edição de compradores habilitada."
          : "Edição de compradores bloqueada.",
        "info"
      );
    });
  }

  addSafeListener(DOMElements.addCompradorBtn, "click", () => {
    if (!isCompradoresEditModeEnabled()) {
      showNotification(
        "Habilite a edição dos compradores para adicionar novos registros.",
        "info"
      );
      return;
    }

    // Obtenha a contagem atual de compradores para determinar o índice
    const index = DOMElements.compradoresContainer.children.length;
    const newCompradorElement = UI.createCompradorFields({}, index);
    DOMElements.compradoresContainer.appendChild(newCompradorElement);

    // Reaplica estado para garantir consistência no novo card.
    setCompradoresEditMode(true);
    refreshConsultaKeyForForm("details", { markDirty: true });
  });

  addSafeListener(DOMElements.compradoresContainer, "click", (e) => {
    const target = e.target;
    const actionLink = target.closest(".comprador-action-link");

    if (actionLink) {
      e.preventDefault(); // Previne navegação dos links de ação
    }

    if (!isCompradoresEditModeEnabled() && actionLink) {
      showNotification(
        "Habilite a edição dos compradores para alterar este bloco.",
        "info"
      );
      return;
    }

    const allCompradores =
      DOMElements.compradoresContainer.querySelectorAll(".comprador-item");

    // Lógica para REMOVER um comprador
    if (actionLink && actionLink.classList.contains("remove-comprador-link")) {
      if (allCompradores.length > 1) {
        actionLink.closest(".comprador-item").remove();
        refreshConsultaKeyForForm("details", { markDirty: true });
      } else {
        UI.showNotification(
          "É necessário ter pelo menos um comprador.",
          "error"
        );
      }
      return; // Encerra a execução aqui
    }

    // Lógica para TORNAR um comprador o PRINCIPAL
    if (actionLink && actionLink.dataset.action === "set-principal") {
      const thisCard = actionLink.closest(".comprador-item");
      // Desmarca todos os outros
      allCompradores.forEach((card) => {
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = false;
      });
      // Marca o do card clicado
      const radioToSelect = thisCard.querySelector('input[type="radio"]');
      if (radioToSelect) radioToSelect.checked = true;

      // Força uma nova renderização de todos os cards para atualizar a UI (badges e links)
      const formData = getFormData(); // Pega os dados atuais do form
      DOMElements.compradoresContainer.innerHTML = ""; // Limpa o container
      formData.compradores.forEach((comprador, index) => {
        const compradorElement = UI.createCompradorFields(comprador, index);
        DOMElements.compradoresContainer.appendChild(compradorElement);
      });

      // Preserva o modo de edição atual após re-render.
      setCompradoresEditMode(true);
      refreshConsultaKeyForForm("details", { markDirty: true });
    }
  });

  const tabFechamento =
    DOMElements.detailsModal?.querySelector("#tab-fechamento");
  if (tabFechamento) {
    // Adiciona uma verificação para segurança

    addSafeListener(tabFechamento, "click", (e) => {
      // Adicionar Gasto
      if (e.target.id === "add-gasto-btn") {
        const container = document.getElementById(
          "gastos-adicionais-container"
        );
        container.appendChild(createGastoRow()); // Chama a função importada
      }

      // Adicionar Repasse
      if (e.target.id === "add-repasse-btn") {
        const container = document.getElementById("repasses-container");
        container.appendChild(createRepasseRow()); // Chama a função importada
      }

      // Remover Linha (funciona para ambos)
      if (e.target.classList.contains("remove-row-btn")) {
        e.target.closest(".dynamic-row").remove();
        updateFechamentoCalculations(); // Recalcula após remover
      }
    });

    // Ouvinte para recalcular totais ao digitar em qualquer campo relevante
    addSafeListener(DOMElements.detailsModal, "input", (e) => {
      const targetId = e.target.id;
      const targetClassList = e.target.classList;

      if (
        targetId === "modal-valorDespachante" ||
        targetClassList.contains("gasto-valor") ||
        targetClassList.contains("repasse-valor") ||
        // Se alterar na aba de registro, também atualiza o resumo
        targetId === "modal-valorITBI" ||
        targetId === "modal-valorFinalRi" ||
        targetId === "modal-valorFunrejus"
      ) {
        updateFechamentoCalculations();
      }
    });
  }

  // --- OUVINTE PARA O BOTÃO DE ADICIONAR ANOTAÇÃO ---
  //  MELHORADO: Usa delegação de eventos no modal de detalhes
  //  Agora salva automaticamente a anotação no Firestore e registra no histórico
  if (DOMElements.detailsModal) {
    DOMElements.detailsModal.addEventListener("click", async (event) => {
      // Verifica se o clique foi no botão de adicionar anotação ou em um filho dele
      const addAnotacaoBtn = event.target.closest("#add-anotacao-btn");
      if (!addAnotacaoBtn) return;
      
      // Previne propagação para não conflitar com outros handlers
      event.stopPropagation();
      
      // Previne duplo clique
      if (addAnotacaoBtn.disabled) return;
      
      console.log(" [Anotação] Botão clicado!");
      
      const textoInput = document.getElementById("nova-anotacao-texto");
      const historicoDiv = document.getElementById("anotacoes-historico");
      const texto = textoInput?.value?.trim() || "";
      const contractId = DOMElements.modalContractId?.value;

      if (texto === "") {
        showNotification("Por favor, escreva uma anotação.", "error");
        return;
      }

      if (!contractId) {
        showNotification("Erro: ID do contrato não encontrado.", "error");
        return;
      }

      // Verifica se temos os dados originais do contrato
      if (!originalContractData) {
        showNotification("Erro: Dados do contrato não carregados. Reabra o modal.", "error");
        return;
      }

      const user = auth.currentUser;
      if (!user) {
        showNotification("Erro: utilizador não autenticado.", "error");
        return;
      }

      // Cria o objeto da nova anotação
      const novaAnotacao = {
        texto: texto,
        usuario: appStateRef.currentUserProfile?.fullName || user.email,
        usuarioEmail: user.email,
        data: new Date(),
      };

      // Desabilita o botão enquanto salva
      const btnOriginalContent = addAnotacaoBtn.innerHTML;
      addAnotacaoBtn.disabled = true;
      addAnotacaoBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Salvando...';

      try {
        // Coleta as anotações existentes do DOM e normaliza as datas
        const anotacoesExistentes = [];
        document.querySelectorAll("#anotacoes-historico .anotacao-item").forEach((itemDiv) => {
          if (itemDiv.dataset.anotacao) {
            const anotacaoParsed = sanitizeAnotacaoForPersist(
              JSON.parse(itemDiv.dataset.anotacao)
            );
            anotacoesExistentes.push(anotacaoParsed);
          }
        });

        // Adiciona a nova anotação à lista
        anotacoesExistentes.push(novaAnotacao);

        // Prepara os dados para atualização
        // IMPORTANTE: Mescla os dados originais com as novas anotações para evitar
        // que o generateChangeLog interprete campos ausentes como "vazios"
        const updatedData = { 
          ...originalContractData,
          anotacoes: anotacoesExistentes 
        };
        
        console.log(" [Anotação] Salvando anotações:", anotacoesExistentes.length, "anotações");
        console.log(" [Anotação] Contract ID:", contractId);
        console.log(" [Anotação] Original Contract Data existe:", !!originalContractData);

        // Salva no Firestore e registra no histórico
        await prepareDetailsModalMutation("anotacao-nova", contractId);

        await firestore.updateContract(
          contractId,
          updatedData,
          originalContractData,
          appStateRef.currentUserProfile
        );
        
        console.log(" [Anotação] Salvo com sucesso no Firestore");

        // Atualiza os dados originais do contrato com as novas anotações
        if (originalContractData) {
          originalContractData.anotacoes = anotacoesExistentes;
          setDetailsModalSourceContract(originalContractData);
        }

        // Adiciona a nova anotação à interface
        const novaAnotacaoElemento = renderAnotacaoEntry(novaAnotacao, user.email);
        historicoDiv.appendChild(novaAnotacaoElemento);

        // Limpa o campo de texto e faz scroll para a nova mensagem
        textoInput.value = "";
        historicoDiv.scrollTop = historicoDiv.scrollHeight;

        // Atualiza o histórico de alterações no modal
        const history = await firestore.getContractHistory(contractId);
        renderHistory(history);

        showNotification("Anotação adicionada e salva com sucesso!", "success");
      } catch (error) {
        console.error("Erro ao salvar anotação:", error);
        showNotification(error?.message || "Erro ao salvar a anotação. Tente novamente.", "error");
      } finally {
        // Restaura o botão
        addAnotacaoBtn.disabled = false;
        addAnotacaoBtn.innerHTML = btnOriginalContent;
      }
    });

    // --- OUVINTE PARA EDIÇÃO E IA EM ANOTAÇÕES ---
    DOMElements.detailsModal.addEventListener("click", async (event) => {
      // 1. BOTÃO DE EDITAR ANOTAÇÃO
      const editBtn = event.target.closest(".edit-anotacao-btn");
      if (editBtn) {
        event.stopPropagation();
        const entryId = editBtn.dataset.entryId;
        const anotacaoItem = document.getElementById(entryId);
        if (!anotacaoItem) return;

        const anotacaoData = JSON.parse(anotacaoItem.dataset.anotacao);
        enterAnotacaoEditMode(anotacaoItem, anotacaoData);
        return;
      }

      // 2. BOTÃO DE CANCELAR EDIÇÃO
      const cancelBtn = event.target.closest(".cancel-edit-btn");
      if (cancelBtn) {
        event.stopPropagation();
        const anotacaoItem = cancelBtn.closest(".anotacao-item");
        exitAnotacaoEditMode(anotacaoItem);
        return;
      }

      // 3. BOTÃO DE SALVAR EDIÇÃO
      const saveBtn = event.target.closest(".save-edit-btn");
      if (saveBtn) {
        event.stopPropagation();
        await handleSaveAnotacaoEdit(saveBtn);
        return;
      }

      // 4. BOTÃO DE MELHORAR COM IA
      const improveBtn = event.target.closest(".improve-with-ai-btn");
      if (improveBtn) {
        event.stopPropagation();
        await handleImproveAnotacaoWithAI(improveBtn);
        return;
      }

      // 5. ACEITAR SUGESTÃO DA IA
      const acceptAIBtn = event.target.closest(".accept-ai-btn");
      if (acceptAIBtn) {
        event.stopPropagation();
        handleAcceptAISuggestion(acceptAIBtn);
        return;
      }

      // 6. REJEITAR SUGESTÃO DA IA
      const rejectAIBtn = event.target.closest(".reject-ai-btn");
      if (rejectAIBtn) {
        event.stopPropagation();
        handleRejectAISuggestion(rejectAIBtn);
        return;
      }

      // 7. MELHORAR NOVA ANOTAÇÃO COM IA
      const improveNovaBtn = event.target.closest("#improve-nova-anotacao-btn");
      if (improveNovaBtn) {
        event.stopPropagation();
        await handleImproveNovaAnotacaoWithAI(improveNovaBtn);
        return;
      }

      // 8. ACEITAR SUGESTÃO DA IA PARA NOVA ANOTAÇÃO
      const acceptNovaAIBtn = event.target.closest("#nova-anotacao-accept-ai-btn");
      if (acceptNovaAIBtn) {
        event.stopPropagation();
        handleAcceptNovaAnotacaoAI();
        return;
      }

      // 9. REJEITAR SUGESTÃO DA IA PARA NOVA ANOTAÇÃO
      const rejectNovaAIBtn = event.target.closest("#nova-anotacao-reject-ai-btn");
      if (rejectNovaAIBtn) {
        event.stopPropagation();
        handleRejectNovaAnotacaoAI();
        return;
      }
    });
  }

  // --- OUVINTE PARA O BOTÃO DE EXPORTAR CSV ---
  if (DOMElements.exportCsvBtn) {
    DOMElements.exportCsvBtn.addEventListener("click", () => {
      showNotification(
        "A preparar a exportação. Por favor, aguarde...",
        "success"
      );
      try {
        // Usamos a lista completa de contratos que já está no estado da aplicação
        if (!appState.allContracts || appState.allContracts.length === 0) {
          showNotification("Não há dados para exportar.", "error");
          return;
        }
        // Usa colunas visíveis ou fallback para colunas padrão
        let exportKeys = (appState.visibleColumns || []).filter(key =>
          EXPORTABLE_FIELDS.some(f => f.key === key)
        );
        if (exportKeys.length === 0) {
          exportKeys = ["vendedorConstrutora", "empreendimento", "clientePrincipal", "status"];
        }
        // Chama a função de exportação
        exportToCSV(appState.allContracts, exportKeys);
        showNotification(`${appState.allContracts.length} registros exportados!`, "success");
      } catch (error) {
        console.error("Erro ao exportar para CSV:", error);
        showNotification("Ocorreu um erro ao gerar o ficheiro.", "error");
      }
    });
  }

  // --- TOGGLE PARA OCULTAR/MOSTRAR HEADER ---
  const toggleHeaderBtn = document.getElementById("toggle-header-btn");
  const listHeader = document.querySelector(".list-header");
  
  if (toggleHeaderBtn && listHeader) {
    // Carregar estado salvo do localStorage para header
    const headerHidden = localStorage.getItem("headerHidden") === "true";
    
    // Aplicar estado inicial
    if (headerHidden) {
      listHeader.style.display = "none";
      toggleHeaderBtn.innerHTML = '<i class="bi bi-chevron-down"></i><span class="ms-1">Mostrar Cabeçalho</span>';
    }
    
    // Adicionar listener de clique
    toggleHeaderBtn.addEventListener("click", () => {
      const isHidden = listHeader.style.display === "none";

      if (isHidden) {
        // Mostrar
        listHeader.style.display = "";
        toggleHeaderBtn.innerHTML = '<i class="bi bi-chevron-up"></i><span class="ms-1">Ocultar Cabeçalho</span>';
        localStorage.setItem("headerHidden", "false");
      } else {
        // Ocultar
        listHeader.style.display = "none";
        toggleHeaderBtn.innerHTML = '<i class="bi bi-chevron-down"></i><span class="ms-1">Mostrar Cabeçalho</span>';
        localStorage.setItem("headerHidden", "true");
      }
    });
  }

  // --- OUVINTES PARA EXPORTAÇÃO NA PÁGINA DE PROCESSOS ---
  const exportCsvBtn = document.getElementById("export-csv-btn");
  const exportCsvAllColumnsBtn = document.getElementById("export-csv-all-columns-btn");

  /**
   * Exporta dados filtrados para CSV
   * @param {boolean} allColumns - Se true, exporta todas as colunas; se false, apenas as visíveis
   */
  function exportFilteredDataToCSV(allColumns = false) {
    const contracts = appState.filteredContracts || [];

    if (contracts.length === 0) {
      showNotification("Nenhum registro para exportar", "warning");
      return;
    }

    let exportKeys;
    if (allColumns) {
      // Usa todas as colunas exportáveis
      exportKeys = EXPORTABLE_FIELDS.map(f => f.key);
    } else {
      // Usa apenas colunas visíveis que são exportáveis
      exportKeys = (appState.visibleColumns || []).filter(key =>
        EXPORTABLE_FIELDS.some(f => f.key === key)
      );

      // Fallback para colunas padrão se nenhuma coluna visível for exportável
      if (exportKeys.length === 0) {
        exportKeys = ["vendedorConstrutora", "empreendimento", "clientePrincipal", "status"];
      }
    }

    try {
      exportToCSV(contracts, exportKeys);
      const modeText = allColumns ? "com todas as colunas" : "com colunas visíveis";
      showNotification(`${contracts.length} registros exportados ${modeText}!`, "success");
    } catch (error) {
      console.error("Erro ao exportar para CSV:", error);
      showNotification("Erro ao exportar: " + error.message, "danger");
    }
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
      exportFilteredDataToCSV(false);
    });
  }

  if (exportCsvAllColumnsBtn) {
    exportCsvAllColumnsBtn.addEventListener("click", () => {
      exportFilteredDataToCSV(true);
    });
  }

  // --- OUVINTES DA PÁGINA DE RELATÓRIOS ---
  if (DOMElements.generateReportBtn) {
    addSafeListener(DOMElements.reportSelectAllBtn, "click", () => {
      DOMElements.reportFieldsContainer
        .querySelectorAll('input[type="checkbox"]')
        .forEach((cb) => (cb.checked = true));
    });

    addSafeListener(DOMElements.reportClearAllBtn, "click", () => {
      DOMElements.reportFieldsContainer
        .querySelectorAll('input[type="checkbox"]')
        .forEach((cb) => (cb.checked = false));
    });

    addSafeListener(DOMElements.generateReportBtn, "click", () => {
      const selectedKeys = Array.from(
        DOMElements.reportFieldsContainer.querySelectorAll("input:checked")
      ).map((cb) => cb.value);

      if (selectedKeys.length === 0) {
        showNotification(
          "Por favor, selecione pelo menos um campo para exportar.",
          "error"
        );
        return;
      }

      DOMElements.reportStatus.textContent =
        "A preparar a exportação... Por favor, aguarde.";

      try {
        if (!appState.allContracts || appState.allContracts.length === 0) {
          showNotification("Não há dados para exportar.", "error");
          DOMElements.reportStatus.textContent = "";
          return;
        }
        exportToCSV(appState.allContracts, selectedKeys);
        DOMElements.reportStatus.textContent = "Relatório gerado com sucesso!";
      } catch (error) {
        console.error("Erro ao exportar relatório:", error);
        showNotification("Ocorreu um erro ao gerar o relatório.", "error");
        DOMElements.reportStatus.textContent = "Falha na exportação.";
      }
    });
  }

  // Ouve o clique no botão "Adicionar Comprador" do novo modal
  if (DOMElements.addCompradorBtnNewModal && DOMElements.addCompradoresContainer) {
    DOMElements.addCompradorBtnNewModal.addEventListener("click", () => {
      const index = DOMElements.addCompradoresContainer.children.length;
      const newCompradorElement = UI.createCompradorFields({ principal: index === 0 }, index);
      DOMElements.addCompradoresContainer.appendChild(newCompradorElement);
    });
  }

  if (DOMElements.addCompradoresContainer) {
    DOMElements.addCompradoresContainer.addEventListener("click", (e) => {
      const target = e.target;
      const actionLink = target.closest(".comprador-action-link");

      if (actionLink) {
        e.preventDefault();
      }

      const allCompradores =
        DOMElements.addCompradoresContainer.querySelectorAll(".comprador-item");

      if (actionLink && actionLink.classList.contains("remove-comprador-link")) {
        if (allCompradores.length > 1) {
          actionLink.closest(".comprador-item").remove();
        } else {
          UI.showNotification("É necessário ter pelo menos um comprador.", "error");
        }
        return;
      }

      if (actionLink && actionLink.dataset.action === "set-principal") {
        const thisCard = actionLink.closest(".comprador-item");
        allCompradores.forEach((card) => {
          const radio = card.querySelector('input[type="radio"]');
          if (radio) radio.checked = false;
        });

        const radioToSelect = thisCard.querySelector('input[type="radio"]');
        if (radioToSelect) radioToSelect.checked = true;

        const formData = UI.getAddFormData();
        DOMElements.addCompradoresContainer.innerHTML = "";
        formData.compradores.forEach((comprador, index) => {
          const compradorElement = UI.createCompradorFields(comprador, index);
          DOMElements.addCompradoresContainer.appendChild(compradorElement);
        });
      }
    });
  }

  // Ouve cliques nos botões de alteração de status no modal de detalhes
  // SUBSTITUA A SUA FUNÇÃO INTEIRA POR ESTA VERSÃO FINAL

  // Ouve cliques nos botões de alteração de status no modal de detalhes
  if (DOMElements.detailsModal) {
    DOMElements.detailsModal.addEventListener("click", async (event) => {
    // Listener para exportar extrato financeiro
    const exportBtn = event.target.closest("#btn-export-finance");
    if (exportBtn) {
      if (originalContractData) {
        UI.exportFinancialReport(originalContractData);
      } else {
        UI.showNotification("Dados do contrato não disponíveis para exportação.", "error");
      }
      return;
    }

    // Listener para gerar recibo do cliente
    const receiptBtn = event.target.closest("#btn-export-receipt");
    if (receiptBtn) {
      if (originalContractData) {
        UI.exportClientReceipt(originalContractData);
      } else {
        UI.showNotification("Dados do contrato não disponíveis para gerar recibo.", "error");
      }
      return;
    }

    const button = event.target.closest(".status-change-btn");
    if (!button) return;

    const newStatus = button.dataset.status;
    const contractId = DOMElements.modalContractId.value;

    // --- INÍCIO DA LÓGICA APRIMORADA ---

    // 1. Pega o status ATUAL para saber de onde estamos partindo.
    const currentStatus = document.getElementById("modal-details-status").value;

    // Se o usuário clicou no botão do status que já está ativo, não faz nada.
    if (newStatus === currentStatus) {
      return;
    }

    // Usa configuração dinâmica se carregada, senão fallback
    const STATUS_SOURCE = window.EFFECTIVE_STATUS_CONFIG || STATUS_CONFIG;

    const currentStatusConfig = STATUS_SOURCE.find(
      (s) => s.text === currentStatus
    );
    const newStatusConfig = STATUS_SOURCE.find((s) => s.text === newStatus);

    // Guarda para novo status - este precisa existir na configuração
    if (!newStatusConfig) {
      console.warn('[status-change] Config do novo status não encontrada:', newStatus);
      UI.showNotification('Configuração do status de destino não encontrada.', 'error');
      return;
    }

    // 2. VALIDAÇÃO DE FLUXO: Verifica se o novo status é um "próximo passo" válido OU um passo anterior.
    // Se o status atual é desconhecido (contrato órfão), permite mudança mas marca como fora do fluxo
    let isOutOfFlow = false;
    let isOrphanContract = false;
    let nextStepsArr = [];

    if (!currentStatusConfig) {
      console.warn('[status-change] Config do status atual não encontrada (contrato órfão):', currentStatus);
      isOutOfFlow = true;
      isOrphanContract = true;
    } else {
      nextStepsArr = Array.isArray(currentStatusConfig.nextSteps) ? currentStatusConfig.nextSteps : [];
      const isNextStep = nextStepsArr.includes(newStatus);
      const isGoingBack = newStatusConfig.order < currentStatusConfig.order;

      // Flag para indicar se é uma mudança fora do fluxo normal (requer confirmação extra)
      isOutOfFlow = !isNextStep && !isGoingBack;
    }

    // --- INÍCIO DA ALTERAÇÃO (ETAPA 3) ---
    // Este é o bloco que você estava procurando. Trocamos a validação estática pela dinâmica.

    // 3. VALIDAÇÃO DE CAMPOS OBRIGATÓRIOS (Lógica Dinâmica)
    try {
      const rule = await firestore.getStatusRule(newStatus);
      if (rule && rule.requiredFields && rule.requiredFields.length > 0) {
        const errors = [];
        for (const field of rule.requiredFields) {
          // Busca elemento com prefixo modal- (padrao do DetailsModal) ou sem prefixo
          const inputElement = document.getElementById(`modal-${field.fieldId}`) || document.getElementById(field.fieldId);
          if (!inputElement || !inputElement.value.trim()) {
            errors.push(`O campo "${field.label}" é obrigatório para avançar.`);
          }
        }
        if (errors.length > 0) {
          UI.showNotification(errors[0], "error");
          return;
        }
      }
    } catch (error) {
      console.error("[status-change] Erro ao validar regras de status:", error);
      // Continua com a alteração mesmo se houver erro nas regras
      // Isso evita que problemas de configuração impeçam mudanças de status
      if (window.__DEBUG__) {
        UI.showNotification(`Aviso: Erro ao validar regras para "${newStatus}". Alteração prosseguirá.`, "warning");
      }
    }
    // --- FIM DA ALTERAÇÃO (ETAPA 3) ---

    // 4. SALVAR DADOS: valida a chave automática e só então coleta os dados do formulário.
    if (!validateConsultaKeyBeforeSave("details")) {
      return;
    }
    const allFormData = UI.getFormData();

    // Monta mensagem de confirmação baseada no tipo de transição
    let confirmMessage = `Confirma alteração para <strong>"${newStatus}"</strong>?<br><small class="text-muted">Todos os dados modificados no formulário serão salvos juntos.</small>`;
    let confirmTitle = 'Alterar status do processo';
    let confirmBtnClass = 'btn-primary';
    let confirmIcon = 'bi-arrow-repeat';
    let confirmIconColor = 'text-primary';

    if (isOutOfFlow) {
      if (isOrphanContract) {
        // Contrato órfão - status atual não existe na configuração
        confirmMessage = `<div class="alert alert-info mb-3 py-2">
          <i class="bi bi-info-circle-fill me-2"></i>
          <strong>Contrato órfão:</strong> O status atual "<em>${currentStatus}</em>" não existe mais na configuração.
          <br><small>Esta alteração irá normalizar o processo para um status válido.</small>
        </div>
        Confirma alteração para <strong>"${newStatus}"</strong>?<br>
        <small class="text-muted">Todos os dados modificados no formulário serão salvos juntos.</small>`;
        confirmTitle = 'Normalizar status do processo';
        confirmBtnClass = 'btn-info';
        confirmIcon = 'bi-arrow-repeat';
        confirmIconColor = 'text-info';
      } else {
        // Mudança fora do fluxo normal
        const expectedSteps = nextStepsArr.length > 0 ? nextStepsArr.join(', ') : 'nenhum definido';
        confirmMessage = `<div class="alert alert-warning mb-3 py-2">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>
          <strong>Atenção:</strong> Esta mudança está fora do fluxo normal configurado.
          <br><small>Os próximos status esperados são: ${expectedSteps}</small>
        </div>
        Confirma alteração para <strong>"${newStatus}"</strong>?<br>
        <small class="text-muted">Todos os dados modificados no formulário serão salvos juntos.</small>`;
        confirmTitle = 'Alterar status (fora do fluxo)';
        confirmBtnClass = 'btn-warning';
        confirmIcon = 'bi-exclamation-triangle';
        confirmIconColor = 'text-warning';
      }
    }

    const confirmed = await confirmAction({
      title: confirmTitle,
      message: confirmMessage,
      confirmText: 'Alterar status',
      confirmClass: confirmBtnClass,
      icon: confirmIcon,
      iconColor: confirmIconColor
    });

    if (confirmed) {
      try {
        await prepareDetailsModalMutation("status", contractId);

        const contractData = {
          ...allFormData,
          status: newStatus,
          statusOrder: newStatusConfig.order,
          dataModificacao: new Date(),
        };

        await firestore.updateContract(
          contractId,
          contractData,
          originalContractData,
          appStateRef.currentUserProfile
        );

        UI.showNotification(
          `Status do processo atualizado para "${newStatus}"`,
          "success"
        );

        const dadosAtualizados = await firestore.getContractById(contractId);
        if (dadosAtualizados) {
          setCurrentDetailsModalContract(dadosAtualizados);
          configureActiveDetailsModalContext(contractId);
          const usersList = getDetailsModalUsersPayload().usersList;
          UI.populateDetailsModal(dadosAtualizados, usersList);
          
          //  CORREÇÃO 05/12/2025: Atualiza cache local e re-renderiza sem nova query
          if (window.updateContractInLocalCache) {
            window.updateContractInLocalCache(contractId, dadosAtualizados);
          }
          if (window.rerenderCurrentView) {
            window.rerenderCurrentView();
          }
        }
      } catch (e) {
        UI.showNotification(e?.message || "Erro ao atualizar o status do processo.", "error");
        console.error("Erro ao atualizar o status:", e);
      }
    }
    });
  }

  // Listener para o botão de alternar a visualização de status
  const toggleStatusViewBtn = document.getElementById("toggle-status-view-btn");
  if (toggleStatusViewBtn) {
    toggleStatusViewBtn.addEventListener("click", (event) => {
      event.stopPropagation(); // Previne outros eventos de clique

      // Verifica o estado atual pelo texto do botão
      const isShowingAll = toggleStatusViewBtn.textContent === "Mostrar todos";
      const currentStatus = document.getElementById("modal-details-status").value;

      if (isShowingAll) {
        // Se está mostrando todos, então queremos a visão limitada
        UI.toggleStatusButtonVisibility(currentStatus, false); // Mostra todos
        toggleStatusViewBtn.textContent = "Mostrar próximos";
        // Alterna visão de campos para mostrar todos
        UI.applyDetailsFieldVisibility(currentStatus, true);
      } else {
        // Se está mostrando a visão limitada, então queremos ver todos
        UI.toggleStatusButtonVisibility(currentStatus, true); // Mostra apenas os relevantes
        toggleStatusViewBtn.textContent = "Mostrar todos";
        // Alterna visão de campos para status
        UI.applyDetailsFieldVisibility(currentStatus, false);
      }
    });
  }
  // Toggle: Exibir todos os campos no modal de detalhes
  const showAllFieldsToggle = document.getElementById('details-show-all-fields');
  if (showAllFieldsToggle) {
    showAllFieldsToggle.addEventListener('change', () => {
      const currentStatus = document.getElementById("modal-details-status").value;
      UI.applyDetailsFieldVisibility(currentStatus, showAllFieldsToggle.checked);
    });
  }

  // Ouve cliques na área de gerenciamento de regras na página de Configurações
  const statusRulesContainer = document.getElementById(
    "status-rules-container"
  );
  if (statusRulesContainer) {
    statusRulesContainer.addEventListener("click", (event) => {
      const editButton = event.target.closest(".edit-rule-btn");

      // Se o clique não foi no botão "Editar", não faz nada
      if (!editButton) return;

      const statusName = editButton.dataset.status;

      // Chama a função da UI para abrir e popular o modal
      UI.openRuleEditModal(statusName);
    });
  }

  const editRuleModal = document.getElementById("edit-rule-modal");
  if (editRuleModal) {
    const closeBtn = editRuleModal.querySelector(".btn-close");
    if (closeBtn && !window.bootstrap?.Modal) {
      closeBtn.addEventListener("click", () => {
        editRuleModal.classList.remove('show');
        editRuleModal.classList.add('hidden');
        document.body.style.overflow = '';
      });
    }

    // Fecha o modal ao clicar fora dele (fallback sem Bootstrap)
    editRuleModal.addEventListener("click", (event) => {
      if (!window.bootstrap?.Modal && event.target === editRuleModal) {
        editRuleModal.classList.remove('show');
        editRuleModal.classList.add('hidden');
        document.body.style.overflow = '';
      }
    });
  }

  // Ouve a submissão do formulário de edição de regras
  if (DOMElements.editRuleForm) {
    DOMElements.editRuleForm.addEventListener("submit", async (event) => {
      event.preventDefault(); // Impede o recarregamento da página
      const saveButton = DOMElements.editRuleForm.querySelector(
        "button[type='submit']"
      );
      saveButton.disabled = true;
      saveButton.textContent = "A salvar...";

      try {
        // 1. Pega o nome do status que está sendo editado (guardamos no dataset)
        const statusName = DOMElements.editRuleForm.dataset.statusName;

        // 2. Coleta os dados separados: obrigatórios e visíveis
        const requiredChecked = DOMElements.editRuleForm.querySelectorAll("input[id^='rule-required-']:checked");
        const visibleChecked = DOMElements.editRuleForm.querySelectorAll("input[id^='rule-visible-']:checked");

        const requiredFields = Array.from(requiredChecked).map((cb) => ({
          fieldId: cb.value,
          label: cb.dataset.label,
        }));
        const visibleFields = Array.from(visibleChecked).map((cb) => ({
          fieldId: cb.value,
          label: cb.dataset.label,
        }));

        // 4. Chama a função do Firestore para salvar com campos visíveis
        await firestore.saveStatusRule(statusName, requiredFields, visibleFields);

        showNotification(
          `Regra para "${statusName}" salva com sucesso!`,
          "success"
        );

        // 5. Fecha o modal e ATUALIZA a lista de regras para mostrar a mudança
        const editRuleInstance = window.bootstrap?.Modal
          ? window.bootstrap.Modal.getOrCreateInstance(DOMElements.editRuleModal)
          : null;

        if (editRuleInstance) {
          editRuleInstance.hide();
        } else {
          DOMElements.editRuleModal.classList.remove('show');
          DOMElements.editRuleModal.classList.add('hidden');
          document.body.style.overflow = '';
        }
        UI.loadAndRenderStatusRules(); // Re-renderiza a lista de regras
      } catch (error) {
        console.error("Erro ao salvar a regra:", error);
        showNotification("Erro ao salvar a regra.", "error");
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Salvar Regra";
      }
    });
  }

  // --- OUVINTES PARA O NOVO MODAL DE REGRAS DE STATUS ---
  if (DOMElements.openStatusRulesModalBtn && DOMElements.statusRulesModal) {
    // Abre o modal ao clicar no botão "Gerir Regras"
    DOMElements.openStatusRulesModalBtn.addEventListener("click", () => {
      const statusRulesInstance = window.bootstrap?.Modal
        ? window.bootstrap.Modal.getOrCreateInstance(DOMElements.statusRulesModal)
        : null;

      if (statusRulesInstance) {
        statusRulesInstance.show();
      } else {
        // Fallback CSS-only
        DOMElements.statusRulesModal.classList.remove('hidden');
        DOMElements.statusRulesModal.classList.add('show');
        document.body.style.overflow = 'hidden';
      }
      // Carrega as regras quando o modal é aberto
      UI.loadAndRenderStatusRules();
    });

    // Fecha o modal ao clicar no 'X'
    const closeBtn = DOMElements.statusRulesModal.querySelector(".btn-close");
    if (closeBtn && !window.bootstrap?.Modal) {
      closeBtn.addEventListener("click", () => {
        DOMElements.statusRulesModal.classList.remove('show');
        DOMElements.statusRulesModal.classList.add('hidden');
        document.body.style.overflow = '';
      });
    }

    // Fecha o modal ao clicar fora dele
    DOMElements.statusRulesModal.addEventListener("click", (event) => {
      if (!window.bootstrap?.Modal && event.target === DOMElements.statusRulesModal) {
        DOMElements.statusRulesModal.classList.remove('show');
        DOMElements.statusRulesModal.classList.add('hidden');
        document.body.style.overflow = '';
      }
    });
  }

  // --- OUVINTES PARA ANEXOS ---
  const uploadBtn = document.getElementById("upload-anexo-btn");
  const dropzone = document.getElementById("anexo-dropzone");
  const fileInput = document.getElementById("modal-anexo-input");
  const pendingFilesContainer = document.getElementById("pending-files-container");
  const pendingFilesList = document.getElementById("pending-files-list");

  if (!uploadBtn || !dropzone || !fileInput || !pendingFilesContainer) {
    console.warn('[Anexos] Elementos de UI não encontrados na inicialização');
  }

  // Array para armazenar arquivos pendentes com seus tipos
  let pendingFiles = [];

  // Opções de tipo de documento
  const documentTypes = [
    { value: "", label: "-- Selecione o tipo --" },
    { value: "Contrato", label: "Contrato" },
    { value: "Contrato Registrado", label: "Contrato Registrado" },
    { value: "Arquivo CEHOP", label: "Arquivo CEHOP" },
    { value: "Documento Pessoal", label: "Documento Pessoal (RG/CPF)" },
    { value: "Comprovante de Renda", label: "Comprovante de Renda" },
    { value: "Comprovante de Endereço", label: "Comprovante de Endereço" },
    { value: "ITBI", label: "ITBI" },
    { value: "Matrícula", label: "Matrícula" },
    { value: "Outros", label: "Outros" }
  ];

  // Função para renderizar lista de arquivos pendentes
  const renderPendingFiles = () => {
    if (pendingFiles.length === 0) {
      pendingFilesContainer.classList.add('d-none'); // Força ocultar com classe Bootstrap
      pendingFilesContainer.style.display = 'none'; // Backup
      return;
    }

    pendingFilesContainer.classList.remove('d-none'); // Remove classe Bootstrap
    pendingFilesContainer.style.display = 'block'; // Backup
    pendingFilesList.innerHTML = '';

    pendingFiles.forEach((item, index) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'border-bottom pb-2 mb-2';
      fileItem.innerHTML = `
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-file-earmark text-primary"></i>
          <div class="flex-grow-1">
            <div class="fw-semibold small">${item.file.name}</div>
            <div class="text-muted" style="font-size: 0.75rem;">${(item.file.size / 1024).toFixed(1)} KB</div>
          </div>
          <select class="form-select form-select-sm" style="width: 200px;" data-index="${index}">
            ${documentTypes.map(type => 
              `<option value="${type.value}" ${item.type === type.value ? 'selected' : ''}>${type.label}</option>`
            ).join('')}
          </select>
          <button type="button" class="btn btn-sm btn-outline-danger" data-index="${index}" title="Remover">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `;
      pendingFilesList.appendChild(fileItem);
    });

    // Event listeners para selects e botões de remover
    pendingFilesList.querySelectorAll('select').forEach(select => {
      select.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        pendingFiles[index].type = e.target.value;
      });
    });

    pendingFilesList.querySelectorAll('button[data-index]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        pendingFiles.splice(index, 1);
        renderPendingFiles();
      });
    });
  };

  // Função para adicionar arquivos à lista pendente
  const addFilesToPendingList = (files) => {
    for (let file of files) {
      pendingFiles.push({ file, type: '' });
    }
    renderPendingFiles();
    
    // Atualiza visual do dropzone
    if (dropzone) {
      dropzone.querySelector('p.fw-semibold').textContent = `${pendingFiles.length} arquivo(s) adicionado(s)`;
      dropzone.style.borderColor = '#198754';
      dropzone.style.backgroundColor = '#d1e7dd';
    }
  };

  // Função para processar upload de múltiplos arquivos
  const processMultipleFilesUpload = async () => {
    const contractId = DOMElements.modalContractId.value;

    // Validação
    const filesWithoutType = pendingFiles.filter(item => !item.type);
    if (filesWithoutType.length > 0) {
      UI.showNotification(
        `Por favor, selecione o tipo para todos os ${filesWithoutType.length} arquivo(s).`,
        "error"
      );
      return;
    }

    if (pendingFiles.length === 0) {
      UI.showNotification("Nenhum arquivo para enviar.", "error");
      return;
    }

    uploadBtn.disabled = true;
    const totalFiles = pendingFiles.length;
    let successCount = 0;
    let errorCount = 0;

    uploadBtn.innerHTML = `<i class="bi bi-hourglass-split me-1"></i>Enviando ${totalFiles} arquivo(s)...`;

    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const { file, type } = pendingFiles[i];
        try {
          await firestore.uploadFile(
            contractId,
            file,
            type,
            (progress) => {
              UI.updateUploadProgress(progress);
              const fileName = file.name.length > 25 ? file.name.substring(0, 25) + '...' : file.name;
              uploadBtn.innerHTML = `<i class="bi bi-hourglass-split me-1"></i>Enviando ${i + 1}/${totalFiles}: ${fileName} (${Math.round(progress)}%)`;
            }
          );
          successCount++;
        } catch (error) {
          console.error(`Falha ao enviar ${file.name}:`, error);
          errorCount++;
        }
      }

      // Mostra resultado final
      if (errorCount === 0) {
        UI.showNotification(
          `${successCount} arquivo(s) enviado(s) com sucesso!`,
          "success"
        );
      } else if (successCount > 0) {
        UI.showNotification(
          `${successCount} arquivo(s) enviado(s), ${errorCount} falharam.`,
          "warning"
        );
      } else {
        UI.showNotification(
          `Falha ao enviar todos os arquivos.`,
          "error"
        );
      }

      // Recarrega a lista de anexos
      const attachments = await firestore.getContractAttachments(contractId);
      UI.renderAttachments(attachments, contractId);

      // Limpa tudo
      pendingFiles = [];
      fileInput.value = "";
      renderPendingFiles();
      
      // Reset visual do dropzone
      if (dropzone) {
        dropzone.querySelector('p.fw-semibold').textContent = 'Arraste arquivos aqui';
        dropzone.style.borderColor = '#dee2e6';
        dropzone.style.backgroundColor = '#f8f9fa';
      }
    } catch (error) {
      console.error("Erro geral no upload:", error);
      UI.showNotification("Erro ao processar uploads.", "error");
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = '<i class="bi bi-upload me-1"></i>Enviar Todos os Arquivos';
      UI.updateUploadProgress(0);
    }
  };

  // Drag and drop handlers
  if (dropzone && fileInput) {
    // Click para abrir seletor de arquivos
    dropzone.addEventListener("click", () => {
      fileInput.click();
    });

    // Quando arquivo é selecionado via input
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        addFilesToPendingList(Array.from(e.target.files));
        e.target.value = ''; // Limpa para permitir adicionar mais
      }
    });

    // Prevenir comportamento padrão em drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    // Highlight na área quando arquivo está sobre ela
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, () => {
        dropzone.style.borderColor = '#0d6efd';
        dropzone.style.backgroundColor = '#e7f1ff';
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, () => {
        if (pendingFiles.length === 0) {
          dropzone.style.borderColor = '#dee2e6';
          dropzone.style.backgroundColor = '#f8f9fa';
        }
      });
    });

    // Handler do drop
    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        addFilesToPendingList(Array.from(files));
      }
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", async () => {
      await processMultipleFilesUpload();
    });
  }

  // Listener para excluir anexos
  const anexosList = document.getElementById("anexos-list");
  if (anexosList) {
    anexosList.addEventListener("click", async (event) => {
      if (event.target.classList.contains("delete-anexo-btn")) {
        const button = event.target;
        const { contractId, attachmentId, filePath } = button.dataset;

        const confirmed = await confirmDelete('este anexo');
        if (confirmed) {
          try {
            button.disabled = true;
            await firestore.deleteAttachment(
              contractId,
              attachmentId,
              filePath
            );
            UI.showNotification("Anexo excluído com sucesso!", "success");

            // Remove o item da lista na UI
            button.closest(".anexo-item").remove();
          } catch (error) {
            console.error("Erro ao excluir o anexo:", error);
            UI.showNotification("Erro ao excluir o anexo.", "error");
            button.disabled = false;
          }
        }
      }
    });
  }

  // --- OUVINTE PARA ATUALIZAR DADOS DO PERFIL ---
  if (DOMElements.profileForm) {
    DOMElements.profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = DOMElements.profileForm.querySelector("button");
      btn.disabled = true;
      btn.textContent = "A salvar...";

      const data = {
        fullName: DOMElements.profileFullName.value.trim(),
        shortName: DOMElements.profileShortName?.value.trim() || "",
        cpf: DOMElements.profileCpf.value.trim(),
      };

      try {
        await firestore.updateUserProfile(data);
        showNotification("Perfil atualizado com sucesso!", "success");
      } catch (error) {
        showNotification(error.message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Salvar Alterações";
      }
    });
  }

  // --- OUVINTE PARA ALTERAR A SENHA ---
  if (DOMElements.passwordChangeForm) {
    DOMElements.passwordChangeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = DOMElements.passwordChangeForm.querySelector("button");
      const newPassword = document.getElementById("profile-new-password").value;

      btn.disabled = true;
      btn.textContent = "A alterar...";

      try {
        await auth.currentUser.updatePassword(newPassword);
        await firestore.markPasswordRotationCompleted();
        showNotification("Senha alterada com sucesso!", "success");
        DOMElements.passwordChangeForm.reset();
      } catch (error) {
        console.error("Erro ao alterar senha:", error);
        let message = "Ocorreu um erro ao tentar alterar a senha.";
        if (error.code === "auth/requires-recent-login") {
          message =
            "Esta operação é sensível e exige autenticação recente. Por favor, faça logout e login novamente antes de tentar alterar a sua senha.";
        }
        showNotification(message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Alterar Senha";
      }
    });
  }

  // --- OUVINTE PARA IMPORTAÇÃO AVANÇADA DE CSV ---
  const openCsvValidatorBtn = document.getElementById("open-csv-validator-btn");
  if (openCsvValidatorBtn) {
    openCsvValidatorBtn.addEventListener("click", () => {
      // Importa dinamicamente o módulo de UI se ainda não estiver carregado
      if (window.csvImportValidatorUI) {
        window.csvImportValidatorUI.open();
      } else {
        import('./advanced/csvImportValidatorUI.js').then(module => {
          if (module.default) {
            module.default.init();
            module.default.open();
          }
        }).catch(err => {
          console.error("Erro ao carregar módulo de importação avançada:", err);
          UI.showNotification("Erro ao carregar ferramenta de importação.", "error");
        });
      }
    });
  }
}

// Exposição global das funções
window.getCurrentView = getCurrentView;
window.setCurrentView = setCurrentView;
window.initializeEventListeners = initializeEventListeners;
