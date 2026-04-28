/**
 * @file whatsappUI.js
 * @description Interface completa de chat WhatsApp com suporte multi-agente
 * Funcionalidades:
 * - Lista de conversas ativas
 * - Interface de chat em tempo real
 * - Painel de fila por departamento
 * - Estatísticas do agente
 * - Transferência entre agentes/departamentos
 * - Vinculação com contratos
 * - Chamadas de voz/vídeo (WebRTC)
 * -  Visualização de conversas antes de atribuir
 * -  Atribuição automática ao responder mensagem
 * 
 * Data: 2025-10-21
 * Atualizado: 2025-11-05 - Adicionado sistema de chamadas
 * Atualizado: 2025-11-11 - Preview e atribuição automática
 */

import whatsappService from './whatsappService.js';
import whatsappPhoneManager from './whatsappPhoneManager.js';
import whatsappCalls from './whatsappCalls.js';
import * as firestore from './firestoreService.js';
import { auth } from './auth.js';
import { showNotification } from './ui.js';
import { normalizePhoneToE164 } from './phoneUtils.js';
import { activityLogService } from './activityLogService.js';

if (window.__DEBUG__) console.log('[whatsappUI] Módulo carregado.');

function createEmptyAudioRecordingState() {
  return {
    active: false,
    recorder: null,
    stream: null,
    chunks: [],
    startTime: null,
    stopTime: null,
    mimeType: null,
    timerInterval: null,
    cancelOnStop: false,
    previewUrl: null,
    previewBlob: null,
    durationMs: null
  };
}

// Estado da UI
const uiState = {
  currentChatId: null,
  currentChat: null,
  currentContract: null,
  messages: [],
  messagesListener: null,
  replyingToMessage: null,
  chatsListener: null,
  waitingListener: null,
  metricsInterval: null, //  NOVO: Intervalo de atualização de métricas
  agentRegistered: false,
  chatFilter: 'all', // 'all', 'active', 'waiting', 'resolved'
  selectedPhoneNumberId: 'all', //  NOVO: Filtro por número ('all' ou phoneNumberId)
  availablePhones: [], //  NOVO: Lista de números disponíveis
  config: null,
  contractLink: {
    loading: false,
    results: [],
    suggested: null,
    lastSearchTerm: ''
  },
  contractSearchCache: {
    items: [],
    loadedAt: 0,
    ttlMs: 2 * 60 * 1000
  },
  forwardingMessage: null,
  availableChats: [],
  availableQueue: [],
  chatSearchTerm: '',
  isAdmin: false,
  selectedAgentId: 'all',
  availableAgents: [],
  isChatsLoading: true,
  metrics: {
    isLoading: true,
    lastUpdated: null
  },
  sidebarBadges: {
    waiting: 0,
    activeMine: 0
  },
  searchSummary: {
    total: 0,
    filtered: 0
  },
  searchDebounceTimer: null,
  audioRecording: createEmptyAudioRecordingState(),
  activeActionPanelId: null,
  layout: {
    sidebarCollapsed: false,
    infoCollapsed: false
  },
  layoutPreference: {
    sidebarCollapsed: false,
    infoCollapsed: false
  },
  autoLink: {
    attemptedChatIds: new Set(),
    inProgress: false,
    lastAttempt: null
  }
};

const DEFAULT_WHATSAPP_DEPARTMENTS = [
  'Aprovação',
  'Formulários',
  'CEHOP',
  'Registro',
  'Individual'
];

const ACTION_PANEL_IDS = Object.freeze({
  ATTACHMENT: 'whatsapp-attachment-panel',
  MEDIA_GALLERY: 'whatsapp-media-gallery-panel',
  TRANSFER: 'whatsapp-transfer-panel',
  LINK_CONTRACT: 'whatsapp-link-contract-panel',
  RESOLVE: 'whatsapp-resolve-panel',
  TAGS: 'whatsapp-tags-panel'
});

const DEBUG_TAG = '[whatsappUI]';

function isDebugEnabled() {
  return typeof window !== 'undefined' && window.__DEBUG__ === true;
}

function debugLog(...args) {
  if (isDebugEnabled()) {
    console.debug(DEBUG_TAG, ...args);
  }
}

let actionPanelListenersBound = false;
let layoutControlsInitialized = false;

const LAYOUT_PREFERENCES_KEY = 'whatsapp_layout_preferences_v1';
const INFO_PANEL_BREAKPOINT = '(max-width: 1279.98px)';
let infoPanelMediaQuery = null;

function loadLayoutPreferences() {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LAYOUT_PREFERENCES_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return {
      sidebarCollapsed: parsed?.sidebarCollapsed === true,
      infoCollapsed: parsed?.infoCollapsed === true
    };
  } catch (err) {
    if (window.__DEBUG__) {
      console.warn('[whatsappUI] Falha ao carregar preferências de layout:', err);
    }
    return null;
  }
}

function saveLayoutPreferences(preferences) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(LAYOUT_PREFERENCES_KEY, JSON.stringify({
      sidebarCollapsed: !!preferences.sidebarCollapsed,
      infoCollapsed: !!preferences.infoCollapsed
    }));
  } catch (err) {
    if (window.__DEBUG__) {
      console.warn('[whatsappUI] Falha ao salvar preferências de layout:', err);
    }
  }
}

function updateLayoutToggleButtons(sidebarCollapsed, infoCollapsed) {
  const sidebarBtn = document.getElementById('whatsapp-toggle-sidebar-btn');
  if (sidebarBtn) {
    sidebarBtn.setAttribute('aria-pressed', sidebarCollapsed ? 'true' : 'false');
    const sidebarTitle = sidebarCollapsed ? 'Mostrar lista de conversas' : 'Ocultar lista de conversas';
    sidebarBtn.setAttribute('title', sidebarTitle);
    sidebarBtn.setAttribute('aria-label', sidebarTitle);

    const icon = sidebarBtn.querySelector('i');
    if (icon) {
      icon.className = sidebarCollapsed
        ? 'bi bi-layout-sidebar me-1'
        : 'bi bi-layout-sidebar-inset me-1';
    }

    const label = sidebarBtn.querySelector('[data-label]');
    if (label) {
      label.textContent = sidebarCollapsed ? 'Mostrar lista' : 'Ocultar lista';
    }
  }

  const infoBtn = document.getElementById('whatsapp-toggle-info-btn');
  if (infoBtn) {
    infoBtn.setAttribute('aria-pressed', infoCollapsed ? 'true' : 'false');
    const infoTitle = infoCollapsed ? 'Mostrar painel de detalhes' : 'Ocultar painel de detalhes';
    infoBtn.setAttribute('title', infoTitle);
    infoBtn.setAttribute('aria-label', infoTitle);

    const icon = infoBtn.querySelector('i');
    if (icon) {
      icon.className = infoCollapsed
        ? 'bi bi-layout-sidebar-reverse me-1'
        : 'bi bi-layout-sidebar-inset-reverse me-1';
    }

    const label = infoBtn.querySelector('[data-label]');
    if (label) {
      label.textContent = infoCollapsed ? 'Mostrar detalhes' : 'Ocultar detalhes';
    }
  }
}

function applyLayoutState({ skipSave = false } = {}) {
  const container = document.querySelector('.whatsapp-body');
  if (container) {
    const sidebarCollapsed = !!uiState.layout.sidebarCollapsed;
    const infoCollapsed = !!uiState.layout.infoCollapsed;

    container.classList.toggle('is-sidebar-collapsed', sidebarCollapsed);
    container.classList.toggle('is-info-collapsed', infoCollapsed);

    updateLayoutToggleButtons(sidebarCollapsed, infoCollapsed);
  } else {
    updateLayoutToggleButtons(!!uiState.layout.sidebarCollapsed, !!uiState.layout.infoCollapsed);
  }

  if (!skipSave) {
    saveLayoutPreferences(uiState.layoutPreference);
  }
}

function toggleSidebar(forceValue) {
  if (!layoutControlsInitialized) {
    initializeLayoutControls();
  }

  const nextValue = typeof forceValue === 'boolean'
    ? forceValue
    : !uiState.layout.sidebarCollapsed;

  uiState.layout.sidebarCollapsed = nextValue;
  uiState.layoutPreference.sidebarCollapsed = nextValue;
  applyLayoutState();
  return nextValue;
}

function toggleInfoPanel(forceValue) {
  if (!layoutControlsInitialized) {
    initializeLayoutControls();
  }

  const nextValue = typeof forceValue === 'boolean'
    ? forceValue
    : !uiState.layout.infoCollapsed;

  uiState.layout.infoCollapsed = nextValue;
  uiState.layoutPreference.infoCollapsed = nextValue;
  applyLayoutState();
  return nextValue;
}

function handleInfoPanelBreakpoint(event) {
  if (!layoutControlsInitialized) return;

  if (event.matches) {
    uiState.layout.infoCollapsed = true;
    applyLayoutState({ skipSave: true });
  } else {
    uiState.layout.infoCollapsed = uiState.layoutPreference.infoCollapsed;
    applyLayoutState({ skipSave: true });
  }
}

function initializeLayoutControls() {
  if (layoutControlsInitialized) return;
  layoutControlsInitialized = true;

  const storedPreferences = loadLayoutPreferences();
  if (storedPreferences) {
    uiState.layoutPreference.sidebarCollapsed = !!storedPreferences.sidebarCollapsed;
    uiState.layoutPreference.infoCollapsed = !!storedPreferences.infoCollapsed;
    uiState.layout.sidebarCollapsed = uiState.layoutPreference.sidebarCollapsed;
    uiState.layout.infoCollapsed = uiState.layoutPreference.infoCollapsed;
  } else {
    uiState.layoutPreference.sidebarCollapsed = false;
    uiState.layoutPreference.infoCollapsed = false;

    if (typeof window.matchMedia === 'function') {
      const prefersCollapsedInfo = window.matchMedia(INFO_PANEL_BREAKPOINT).matches;
      uiState.layout.infoCollapsed = prefersCollapsedInfo;
    }
  }

  applyLayoutState({ skipSave: true });

  const sidebarBtn = document.getElementById('whatsapp-toggle-sidebar-btn');
  if (sidebarBtn) {
    sidebarBtn.addEventListener('click', (event) => {
      event.preventDefault();
      toggleSidebar();
    });
  }

  const infoBtn = document.getElementById('whatsapp-toggle-info-btn');
  if (infoBtn) {
    infoBtn.addEventListener('click', (event) => {
      event.preventDefault();
      toggleInfoPanel();
    });
  }

  if (typeof window.matchMedia === 'function') {
    infoPanelMediaQuery = window.matchMedia(INFO_PANEL_BREAKPOINT);
    handleInfoPanelBreakpoint(infoPanelMediaQuery);

    if (typeof infoPanelMediaQuery.addEventListener === 'function') {
      infoPanelMediaQuery.addEventListener('change', handleInfoPanelBreakpoint);
    } else if (typeof infoPanelMediaQuery.addListener === 'function') {
      infoPanelMediaQuery.addListener(handleInfoPanelBreakpoint);
    }
  }
}

const SKELETON_DEFAULT_ITEMS = 6;
const METRIC_ELEMENTS = [
  'whatsapp-metric-queue',
  'whatsapp-metric-time',
  'whatsapp-metric-agents'
];

function buildListSkeleton(options = {}) {
  const {
    items = SKELETON_DEFAULT_ITEMS,
    dense = false,
    showMeta = true
  } = options;

  const rows = [];
  for (let index = 0; index < items; index += 1) {
    rows.push(`
      <div class="chat-skeleton-item${dense ? ' chat-skeleton-item-dense' : ''}">
        <div class="skeleton-avatar"></div>
        <div class="flex-grow-1">
          <div class="skeleton-line w-75"></div>
          <div class="skeleton-line w-50"></div>
        </div>
        ${showMeta ? '<div class="skeleton-chip d-none d-xl-block"></div>' : ''}
      </div>
    `);
  }

  return `<div class="chat-skeleton-wrapper">${rows.join('')}</div>`;
}

function setListLoading(containerId, isLoading, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (containerId === 'whatsapp-chats-list') {
    uiState.isChatsLoading = isLoading;
  }

  if (isLoading) {
    container.classList.add('is-loading');
    container.innerHTML = buildListSkeleton(options);
  } else {
    container.classList.remove('is-loading');
  }
}

function setMetricsLoading(isLoading) {
  uiState.metrics.isLoading = isLoading;
  METRIC_ELEMENTS.forEach((metricId) => {
    const el = document.getElementById(metricId);
    if (!el) return;

    el.classList.toggle('skeleton-text', isLoading);
    if (isLoading) {
      el.textContent = '--';
    }
  });
}

async function waitForTagsBackend(maxAttempts = 10, delayMs = 250) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (window.__WHATSAPP_TAGS__) {
      return window.__WHATSAPP_TAGS__;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Backend de tags indisponível');
}

function getAvailableWhatsAppDepartments() {
  const result = [];
  const seen = new Set();

  const push = (value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  };

  const serviceDepartments = Object.values(whatsappService?.DEPARTMENTS || {});
  serviceDepartments.forEach(push);

  const globalSources = [
    window?.__WHATSAPP_DEPARTMENTS__,
    window?.WHATSAPP_DEPARTMENTS,
    window?.__WHATSAPP_CONFIG__?.departments,
    window?.WHATSAPP_CONFIG?.departments
  ];

  globalSources.forEach((source) => {
    if (Array.isArray(source)) {
      source.forEach(push);
    }
  });

  DEFAULT_WHATSAPP_DEPARTMENTS.forEach(push);

  return result;
}

function getActionPanelElement(panelId) {
  if (!panelId) return null;
  return document.getElementById(panelId);
}

function hideActionPanel(panelId) {
  if (!panelId) return;
  const panel = getActionPanelElement(panelId);
  if (!panel) return;

  if (window.bootstrap?.Collapse) {
    const instance = bootstrap.Collapse.getOrCreateInstance(panel, { toggle: false });
    instance.hide();
  } else {
    panel.classList.remove('show');
  }

  if (uiState.activeActionPanelId === panelId) {
    uiState.activeActionPanelId = null;
  }
}

function hideAllActionPanels(exceptId = null) {
  Object.values(ACTION_PANEL_IDS).forEach((panelId) => {
    if (panelId !== exceptId) {
      hideActionPanel(panelId);
    }
  });

  if (!exceptId) {
    uiState.activeActionPanelId = null;
  }
}

function showActionPanel(panelId, options = {}) {
  const panel = getActionPanelElement(panelId);
  if (!panel) {
    if (window.__DEBUG__) console.warn(`[whatsappUI] Painel ${panelId} não encontrado`);
    return null;
  }

  const { focusSelector = null, onShow = null } = options;

  if (uiState.activeActionPanelId && uiState.activeActionPanelId !== panelId) {
    hideAllActionPanels(panelId);
  }

  if (typeof onShow === 'function') {
    try {
      onShow();
    } catch (err) {
      console.error('[whatsappUI] Erro ao preparar painel:', err);
    }
  }

  if (uiState.activeActionPanelId === panelId && panel.classList.contains('show')) {
    if (focusSelector) {
      setTimeout(() => {
        const focusTarget = document.querySelector(focusSelector);
        focusTarget?.focus?.();
      }, 150);
    }
    return panel;
  }

  if (window.bootstrap?.Collapse) {
    const instance = bootstrap.Collapse.getOrCreateInstance(panel, { toggle: false });
    instance.show();
  } else {
    panel.classList.add('show');
  }

  uiState.activeActionPanelId = panelId;

  if (focusSelector) {
    setTimeout(() => {
      const focusTarget = document.querySelector(focusSelector);
      focusTarget?.focus?.();
    }, 150);
  }

  return panel;
}

function initializeActionPanelListeners() {
  const container = document.getElementById('whatsapp-action-panels');
  if (!container || actionPanelListenersBound) return;

  actionPanelListenersBound = true;

  container.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-whatsapp-action-close]');
    if (!trigger) return;

    const targetId = trigger.getAttribute('data-whatsapp-action-close');
    if (!targetId) return;

    event.preventDefault();
    hideActionPanel(targetId);
  });

  if (window.bootstrap?.Collapse) {
    container.querySelectorAll('[data-whatsapp-action-panel]').forEach((panel) => {
      panel.addEventListener('hidden.bs.collapse', () => {
        if (uiState.activeActionPanelId === panel.id) {
          uiState.activeActionPanelId = null;
        }
      });

      panel.addEventListener('shown.bs.collapse', () => {
        uiState.activeActionPanelId = panel.id;
      });
    });
  }
}

/**
 * Inicializa a interface do WhatsApp
 */
export async function initWhatsAppUI() {
  console.log('[whatsappUI] Inicializando interface...');

  initializeLayoutControls();
  setMetricsLoading(true);
  setListLoading('whatsapp-chats-list', true);

  const config = await whatsappService.loadWhatsAppConfig();
  uiState.config = config;
  
  if (!config.enabled) {
    updateMainSidebarWhatsAppBadges(0, 0);
    console.warn('[whatsappUI] WhatsApp não está habilitado');
    return;
  }

  // Verificar se agente está registrado
  const agentRegistered = await checkAgentRegistration();
  
  if (!agentRegistered) {
    updateMainSidebarWhatsAppBadges(0, 0);
    console.warn('[whatsappUI] Agente não registrado, abrindo modal...');
    setTimeout(() => openAgentRegistration(), 500);
    bindWhatsAppEvents();
    return;
  }

  console.log('[whatsappUI] Agente registrado, carregando chats...');

  //  NOVO: Verificar se é admin e mostrar filtro por agente
  const isAdmin = await checkIfCurrentUserIsAdmin();
  uiState.isAdmin = isAdmin;
  if (isAdmin) {
    const filterContainer = document.getElementById('whatsapp-filter-my-chats-container');
    if (filterContainer) {
      filterContainer.classList.remove('d-none');
      console.log('[whatsappUI] Filtro admin habilitado');
    }
    await loadAdminAgentsFilter();
  }

  //  NOVO: Pré-carregar cache de tags
  await preloadTagsCache();

  //  NOVO: Renderizar seletor de números
  await renderPhoneNumberSelector();

  // Carregar conversas do agente
  loadAgentChats();

  // Iniciar listener de conversas
  startChatsListener();

  // Bind eventos
  bindWhatsAppEvents();

  // Inicializar validação de formulários em modais WhatsApp
  initModalFormValidation('whatsapp-transfer-panel');
  initModalFormValidation('whatsapp-resolve-panel');
  // Forward agora usa collapse inline, não precisa de validação de modal
  initModalFormValidation('whatsapp-new-chat-modal');
  initModalFormValidation('whatsapp-link-contract-panel');

  console.log('[whatsappUI] Interface inicializada com sucesso');
}

async function checkAgentRegistration() {
  try {
    const userId = whatsappService.getCurrentUserId?.() || window.auth?.currentUser?.uid;
    if (!userId) return false;

    const userDoc = await window.db.collection('users').doc(userId).get();
    return userDoc.exists && userDoc.data()?.whatsapp?.isAgent === true;
  } catch (err) {
    console.error('[whatsappUI] Erro ao verificar registro:', err);
    return false;
  }
}

/**
 *  NOVO: Verificar se usuário atual é admin
 */
async function checkIfCurrentUserIsAdmin() {
  try {
    if (typeof whatsappService.checkIfUserIsAdmin === 'function') {
      return await whatsappService.checkIfUserIsAdmin();
    }

    const currentUser = window.auth?.currentUser;
    if (!currentUser) return false;

    try {
      const tokenResult = await currentUser.getIdTokenResult();
      const claims = tokenResult.claims || {};
      if (claims.admin === true || claims.isAdmin === true || claims.role === 'admin') {
        return true;
      }
    } catch (tokenErr) {
      if (window.__DEBUG__) {
        console.warn('[whatsappUI] Falha ao obter claims admin:', tokenErr);
      }
    }

    const userDoc = await window.db.collection('users').doc(currentUser.uid).get();
    if (!userDoc.exists) return false;
    const data = userDoc.data() || {};
    return data.isAdmin === true
      || data.role === 'admin'
      || (Array.isArray(data.roles) && data.roles.includes('admin'))
      || data.permissions?.admin === true
      || (Array.isArray(data.permissions) && data.permissions.includes('admin'));
  } catch (err) {
    console.error('[whatsappUI] Erro ao verificar admin:', err);
    return false;
  }
}

function resolveSelectedAgentFilterId() {
  if (!uiState.isAdmin) return null;
  const selected = uiState.selectedAgentId;
  if (!selected || selected === 'all') return null;
  return selected;
}

function resolveChatAgentId(chat = {}) {
  return chat.agentId || chat.resolvedBy || chat.lastAgentId || chat.lastAgent?.id || null;
}

async function loadAdminAgentsFilter() {
  const select = document.getElementById('whatsapp-agent-filter');
  if (!select) return;

  select.disabled = true;
  select.innerHTML = '<option value="all">Todos os agentes</option>';

  try {
    const agents = await whatsappService.listRegisteredAgents?.();
    uiState.availableAgents = Array.isArray(agents) ? agents : [];

    if (uiState.availableAgents.length === 0) {
      select.innerHTML = '<option value="all">Nenhum agente cadastrado</option>';
      select.disabled = true;
      return;
    }

    const options = uiState.availableAgents.map(agent => {
      const label = agent.name || agent.email || 'Agente';
      return `<option value="${escapeHtml(agent.id)}">${escapeHtml(label)}</option>`;
    }).join('');

    select.innerHTML = `<option value="all">Todos os agentes</option>${options}`;
    const hasSelection = uiState.availableAgents.some(agent => agent.id === uiState.selectedAgentId);
    select.value = hasSelection ? uiState.selectedAgentId : 'all';
    if (!hasSelection) {
      uiState.selectedAgentId = 'all';
    }
    select.disabled = false;
  } catch (err) {
    console.error('[whatsappUI] Erro ao carregar lista de agentes:', err);
    select.disabled = false;
  }
}

/**
 *  NOVO: Renderiza seletor de números WhatsApp
 */
async function renderPhoneNumberSelector() {
  const container = document.getElementById('whatsapp-phone-selector');
  if (!container) {
    if (window.__DEBUG__) console.warn('[whatsappUI] Container whatsapp-phone-selector não encontrado');
    return;
  }

  try {
    // Carregar números ativos
    const phones = await whatsappPhoneManager.list(true);
    uiState.availablePhones = phones;

    if (phones.length === 0) {
      container.innerHTML = '<small class="text-muted d-block text-center p-2">Nenhum número cadastrado</small>';
      return;
    }

    // Se houver apenas 1 número, selecionar automaticamente
    if (phones.length === 1) {
      uiState.selectedPhoneNumberId = phones[0].phoneNumberId;
    }

    // Renderizar botões
    container.innerHTML = `
      <div class="btn-group btn-group-sm w-100 mb-2" role="group" aria-label="Seletor de números">
        <button type="button" 
                class="btn ${uiState.selectedPhoneNumberId === 'all' ? 'btn-primary' : 'btn-outline-primary'}"
                data-phone-id="all"
                title="Todos os números">
           Todos (${phones.length})
        </button>
        ${phones.slice(0, 3).map(phone => `
          <button type="button" 
                  class="btn ${uiState.selectedPhoneNumberId === phone.phoneNumberId ? 'btn-primary' : 'btn-outline-primary'}"
                  data-phone-id="${phone.phoneNumberId}"
                  title="${phone.phoneNumber}">
            ${phone.displayName}
          </button>
        `).join('')}
        ${phones.length > 3 ? `
          <button type="button" class="btn btn-outline-secondary dropdown-toggle" 
                  data-bs-toggle="dropdown" aria-expanded="false">
            +${phones.length - 3}
          </button>
          <ul class="dropdown-menu">
            ${phones.slice(3).map(phone => `
              <li>
                <a class="dropdown-item" href="#" data-phone-id="${phone.phoneNumberId}">
                  ${phone.displayName}
                </a>
              </li>
            `).join('')}
          </ul>
        ` : ''}
      </div>
    `;

    // Event listeners nos botões
    container.querySelectorAll('[data-phone-id]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const phoneId = e.currentTarget.dataset.phoneId;
        
        if (uiState.selectedPhoneNumberId === phoneId) return; // Já selecionado
        
        uiState.selectedPhoneNumberId = phoneId;
        
        if (window.__DEBUG__) {
          console.log('[whatsappUI] Número selecionado:', phoneId);
        }
        
        // Atualizar UI dos botões
        container.querySelectorAll('button[data-phone-id]').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-outline-primary');
        });
        
        if (e.currentTarget.tagName === 'BUTTON') {
          e.currentTarget.classList.remove('btn-outline-primary');
          e.currentTarget.classList.add('btn-primary');
        }

        // Recarregar chats com filtro
        await loadAgentChats();
      });
    });

    if (window.__DEBUG__) {
      console.log(`[whatsappUI] Seletor renderizado com ${phones.length} números`);
    }

  } catch (err) {
    console.error('[whatsappUI] Erro ao renderizar seletor de números:', err);
    container.innerHTML = `
      <div class="alert alert-sm alert-danger p-2 m-0">
        <small>Erro ao carregar números</small>
      </div>
    `;
  }
}

/**
 * Renderiza lista de conversas do agente
 */
/**
 *  NOVO: Atualiza métricas da sidebar
 */
async function updateSidebarMetrics() {
  try {
    const queueEl = document.getElementById('whatsapp-metric-queue');
    const timeEl = document.getElementById('whatsapp-metric-time');
    const agentsEl = document.getElementById('whatsapp-metric-agents');

    if (uiState.metrics.isLoading) {
      setMetricsLoading(true);
    }

    const currentAgentId = auth.currentUser?.uid || whatsappService.getCurrentUserId?.() || null;

    // Buscar dados
    const [waitingChats, activeAgents, stats, activeChatsFromCurrentAgent] = await Promise.all([
      whatsappService.getWaitingChats(null, { skipCache: true }).catch(() => []),
      whatsappService.getActiveAgents?.() || Promise.resolve([]),
      whatsappService.getAgentStats?.() || Promise.resolve(null),
      currentAgentId ? whatsappService.getActiveChats(currentAgentId).catch(() => []) : Promise.resolve([])
    ]);

    const waitingStatuses = [
      whatsappService.CHAT_STATUS.NEW,
      whatsappService.CHAT_STATUS.WAITING
    ];

    const waitingQueueCount = Array.isArray(waitingChats)
      ? waitingChats.filter((chat) => waitingStatuses.includes(chat?.status)).length
      : 0;

    const activeMineCount = Array.isArray(activeChatsFromCurrentAgent)
      ? activeChatsFromCurrentAgent.filter((chat) => {
          const status = chat?.status;
          return status === whatsappService.CHAT_STATUS.ASSIGNED
            || status === whatsappService.CHAT_STATUS.ACTIVE;
        }).length
      : 0;

    updateMainSidebarWhatsAppBadges(waitingQueueCount, activeMineCount);

    // Atualizar fila
    if (queueEl) {
      queueEl.textContent = waitingChats.length || 0;
    }

    // Atualizar agentes online
    if (agentsEl) {
      agentsEl.textContent = Array.isArray(activeAgents) ? activeAgents.length : 0;
    }

    // Atualizar tempo médio (se disponível)
    if (stats && stats.averageResponseTime && timeEl) {
      const minutes = Math.round(stats.averageResponseTime / 60);
      timeEl.textContent = minutes > 0 ? `${minutes}min` : '<1min';
    } else if (timeEl) {
      // Calcular tempo médio manualmente se não houver stats
      const allChats = uiState.availableChats || [];
      if (allChats.length > 0) {
        const times = allChats
          .filter(chat => chat.firstResponseTime && chat.createdAt)
          .map(chat => {
            const created = chat.createdAt?.toMillis?.() || 0;
            const responded = chat.firstResponseTime?.toMillis?.() || 0;
            return (responded - created) / 1000; // segundos
          });
        
        if (times.length > 0) {
          const avgSeconds = times.reduce((a, b) => a + b, 0) / times.length;
          const minutes = Math.round(avgSeconds / 60);
          timeEl.textContent = minutes > 0 ? `${minutes}min` : '<1min';
        }
      }
    }

    setMetricsLoading(false);
    uiState.metrics.lastUpdated = Date.now();

    if (isDebugEnabled()) {
      debugLog('Métricas atualizadas:', {
        queue: queueEl?.textContent ?? null,
        time: timeEl?.textContent ?? null,
        agents: agentsEl?.textContent ?? null
      });
    }
  } catch (err) {
    console.error('[whatsappUI] Erro ao atualizar métricas:', err);
  }
}

/**
 *  MODIFICADO: Carrega conversas do agente com suporte a admin
 */
async function loadAgentChats() {
  const isQueueFilter = uiState.chatFilter === 'waiting';
  const targetListId = isQueueFilter ? 'whatsapp-queue-list' : 'whatsapp-chats-list';
  const skeletonOptions = {
    items: isQueueFilter ? 4 : 6,
    dense: isQueueFilter,
    showMeta: !isQueueFilter
  };
  setListLoading(targetListId, true, skeletonOptions);
  try {
    const chatList = document.getElementById('whatsapp-chats-list');
    const queueList = document.getElementById('whatsapp-queue-list');

    //  NOVO: Verificar se é admin e agente selecionado
    const isAdmin = uiState.isAdmin || await checkIfCurrentUserIsAdmin();
    uiState.isAdmin = isAdmin;
    const agentFilterId = resolveSelectedAgentFilterId();
    
    debugLog(`Carregando chats como ${isAdmin ? 'ADMIN' : 'AGENTE'}`);

    if (uiState.chatFilter === 'waiting') {
      let queue = await whatsappService.getWaitingChats(null, { skipCache: true });

      if (agentFilterId) {
        queue = queue.filter(chat => resolveChatAgentId(chat) === agentFilterId);
      }

      if (chatList) {
        chatList.style.display = 'none';
        chatList.classList.add('d-none');
      }

      if (queueList) {
        queueList.style.display = 'block';
        queueList.classList.remove('d-none');
      }

      renderQueue(queue);
      return;
    }

    //  NOVO: Filtro para conversas finalizadas
    if (uiState.chatFilter === 'resolved') {
      debugLog('Carregando conversas finalizadas...');
      
    //  NOVO: Admin vê todas ou por agente selecionado; agente só as suas
    const chats = isAdmin 
      ? await whatsappService.getResolvedChats(agentFilterId) // Admin: todas ou por agente
      : await whatsappService.getResolvedChats(); // Agente: filtrado automaticamente
      
      debugLog(`Foram retornados ${chats.length} chats finalizados`);
      
      // Filtrar por número selecionado
      const filteredChats = uiState.selectedPhoneNumberId !== 'all'
        ? chats.filter(chat => chat.phoneNumberId === uiState.selectedPhoneNumberId)
        : chats;
      
      debugLog(`Após filtro de número: ${filteredChats.length} chats`);
      
      if (queueList) {
        queueList.style.display = 'none';
        queueList.classList.add('d-none');
      }
      if (chatList) {
        chatList.style.display = 'block';
        chatList.classList.remove('d-none');
      }
      
      renderChatsList(filteredChats);
      return;
    }

    let chats;
    if (uiState.chatFilter === 'active') {
      //  NOVO: Admin vê todas ou por agente selecionado; agente só as suas
      chats = isAdmin 
        ? await whatsappService.getActiveChats(agentFilterId) // Admin: todas ou por agente
        : await whatsappService.getActiveChats(); // Agente: filtrado automaticamente
    } else if (uiState.chatFilter === 'all') {
      //  TODAS: Busca conversas ativas + aguardando (fila) + finalizadas
      debugLog('Carregando TODAS as conversas...');
      const [activeChats, waitingChats, resolvedChats] = await Promise.all([
        isAdmin 
          ? whatsappService.getActiveChats(agentFilterId) 
          : whatsappService.getActiveChats(),
        whatsappService.getWaitingChats(null, { skipCache: true }),
        isAdmin 
          ? whatsappService.getResolvedChats(agentFilterId) 
          : whatsappService.getResolvedChats()
      ]);

      const filteredWaiting = agentFilterId
        ? waitingChats.filter(chat => resolveChatAgentId(chat) === agentFilterId)
        : waitingChats;
      
      // Combina e ordena por última mensagem
      chats = [...activeChats, ...filteredWaiting, ...resolvedChats].sort((a, b) => {
        const timeA = a.lastMessageTimestamp?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
        const timeB = b.lastMessageTimestamp?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      
      debugLog('Resumo de conversas carregadas:', {
        total: chats.length,
        ativas: activeChats.length,
        aguardando: filteredWaiting.length,
        finalizadas: resolvedChats.length
      });
    } else {
      // Fallback: conversas do agente atual
      chats = await whatsappService.getAgentChats();
    }

    //  NOVO: Filtrar por número selecionado
    if (uiState.selectedPhoneNumberId !== 'all') {
      chats = chats.filter(chat => chat.phoneNumberId === uiState.selectedPhoneNumberId);
      
      debugLog(`Filtrado ${chats.length} chats para número ${uiState.selectedPhoneNumberId}`);
    }

    if (queueList) {
      queueList.style.display = 'none';
      queueList.classList.add('d-none');
    }
    if (chatList) {
      chatList.style.display = 'block';
      chatList.classList.remove('d-none');
    }

    renderChatsList(chats);
    
    //  NOVO: Atualizar métricas após carregar chats
    updateSidebarMetrics();
  } catch (err) {
    console.error('[whatsappUI] Erro ao carregar chats:', err);
  } finally {
    setListLoading(targetListId, false);
  }
}

/**
 * Altera filtro de conversas
 */
function setChatsFilter(filter) {
  console.log(`[whatsappUI]  Alterando filtro para: ${filter}`);
  uiState.chatFilter = filter;
  
  document.querySelectorAll('.chat-filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });

  if (filter === 'waiting') {
    startWaitingQueueListener();
  } else {
    stopWaitingQueueListener();
  }
  
  console.log(`[whatsappUI]  Chamando loadAgentChats() com filtro: ${uiState.chatFilter}`);
  loadAgentChats();
}

/**
 * Renderiza badges de tags para uma conversa
 * @param {Array} tags - Array de IDs de tags
 * @returns {string} HTML das badges
 */
function renderTagBadges(tags) {
  if (!tags || tags.length === 0) return '';
  
  // Buscar tags do cache/backend
  const tagsBackend = window.__WHATSAPP_TAGS__;
  if (!tagsBackend) return '';
  
  // Cache de tags (para evitar múltiplas chamadas)
  if (!window.__TAGS_CACHE__) {
    window.__TAGS_CACHE__ = {};
  }
  
  const tagBadges = [];
  const maxVisible = 3;
  
  for (let i = 0; i < Math.min(tags.length, maxVisible); i++) {
    const tagId = tags[i];
    
    // Tentar buscar do cache
    if (window.__TAGS_CACHE__[tagId]) {
      const tag = window.__TAGS_CACHE__[tagId];
      tagBadges.push(`
        <span class="badge me-1" 
              style="background-color: ${tag.color}; color: white; font-size: 0.7rem;"
              title="${tag.name}${tag.description ? ': ' + tag.description : ''}">
          ${tag.name}
        </span>
      `);
    }
  }
  
  // Se houver mais tags, mostrar contador
  if (tags.length > maxVisible) {
    const remaining = tags.length - maxVisible;
    tagBadges.push(`
      <span class="badge bg-secondary me-1" style="font-size: 0.7rem;" 
            title="${remaining} tag(s) adicional(is)">
        +${remaining}
      </span>
    `);
  }
  
  return tagBadges.length > 0 ? `<div class="mt-1">${tagBadges.join('')}</div>` : '';
}

function getTagNames(tagIds = []) {
  if (!Array.isArray(tagIds) || tagIds.length === 0) {
    return [];
  }

  const cache = window.__TAGS_CACHE__ || {};
  return tagIds
    .map((tagId) => cache?.[tagId]?.name || '')
    .filter(Boolean);
}

function collectChatSearchFields(chat = {}) {
  const textFields = new Set();
  const digitFields = new Set();

  const pushText = (value) => {
    const normalized = normalizeSearchValue(value);
    if (normalized) {
      textFields.add(normalized);
    }
  };

  const pushDigits = (value) => {
    const digits = normalizeDigits(value);
    if (digits.length >= 3) {
      digitFields.add(digits);
    }
  };

  pushText(chat.id);
  pushText(chat.customerName);
  pushText(chat.displayName);
  pushText(chat.nome);
  pushText(chat.name);
  pushText(chat.customerEmail);
  pushText(chat.customerDocument);
  pushText(chat.department);
  pushText(chat.agentName);
  pushText(chat.agentEmail);
  pushText(chat.lastMessageText);
  pushText(chat.lastMessage);
  pushText(chat.quickNotes);
  pushText(chat.contractName);
  pushText(chat.contractCustomer);
  pushText(chat.contractStatus);

  if (chat.status) {
    pushText(chat.status);
    pushText(formatStatusLabel(chat.status));
  }

  if (chat.contractId) {
    pushText(chat.contractId);
    pushDigits(chat.contractId);
  }

  const phoneCandidates = [
    chat.phoneNumber,
    chat.numero,
    chat.phone,
    chat.from,
    chat.phoneNumberDisplay,
    chat.businessPhoneNumber
  ];

  phoneCandidates.forEach((value) => {
    pushText(value);
    pushDigits(value);
  });

  if (Array.isArray(chat.tags) && chat.tags.length > 0) {
    const tagNames = getTagNames(chat.tags);
    tagNames.forEach(pushText);
  }

  if (Array.isArray(chat.relatedContracts)) {
    chat.relatedContracts.forEach((contract = {}) => {
      pushText(contract.id);
      pushText(contract.label);
      pushText(contract.name);
      pushText(contract.customer);
      pushDigits(contract.id);
    });
  }

  return {
    text: Array.from(textFields),
    digits: Array.from(digitFields)
  };
}

function buildSearchTokens(rawTerm = '') {
  const trimmed = rawTerm || '';
  const normalizedTerm = normalizeSearchValue(trimmed);
  const normalizedTokens = normalizedTerm.split(/\s+/).filter(Boolean);
  const rawTokens = String(trimmed).split(/\s+/).filter(Boolean);

  return normalizedTokens.map((token, index) => ({
    text: token,
    digits: normalizeDigits(rawTokens[index] ?? token)
  }));
}

function chatMatchesSearch(chat, tokens) {
  if (!tokens || tokens.length === 0) {
    return true;
  }

  const fields = collectChatSearchFields(chat);
  if (fields.text.length === 0 && fields.digits.length === 0) {
    return false;
  }

  return tokens.every(({ text, digits }) => {
    const hasTextMatch = text ? fields.text.some(field => field.includes(text)) : false;
    const hasDigitMatch = digits && digits.length >= 3
      ? fields.digits.some(fieldDigits => fieldDigits.includes(digits))
      : false;

    return hasTextMatch || hasDigitMatch;
  });
}

function filterChatsBySearch(chats, searchTerm) {
  if (!Array.isArray(chats) || chats.length === 0) {
    return [];
  }

  //  NOVO: Aplicar filtro por agente selecionado (admin)
  let filteredChats = [...chats];

  const agentFilterId = resolveSelectedAgentFilterId();
  if (agentFilterId) {
    filteredChats = filteredChats.filter(chat => resolveChatAgentId(chat) === agentFilterId);
  }

  const tokens = buildSearchTokens(searchTerm);
  if (tokens.length === 0) {
    return filteredChats;
  }

  return filteredChats.filter(chat => chatMatchesSearch(chat, tokens));
}

function refreshSearchBadge(filtered, total, term) {
  const badge = document.getElementById('whatsapp-sidebar-badge');
  if (!badge) return;

  if (total === 0) {
    badge.textContent = '0';
    badge.classList.remove('bg-warning');
    badge.classList.add('bg-secondary');
    return;
  }

  if (term) {
    badge.textContent = `${filtered}/${total}`;
    badge.classList.add('bg-warning');
    badge.classList.remove('bg-secondary');
  } else {
    badge.textContent = `${total}`;
    badge.classList.remove('bg-warning');
    badge.classList.add('bg-secondary');
  }
}

function updateSearchSummary(filtered, total) {
  uiState.searchSummary.filtered = filtered;
  uiState.searchSummary.total = total;
  refreshSearchBadge(filtered, total, uiState.chatSearchTerm);
}

function updateMainSidebarWhatsAppBadges(waitingCount = 0, activeMineCount = 0) {
  const normalizedWaiting = Math.max(0, Number(waitingCount) || 0);
  const normalizedActiveMine = Math.max(0, Number(activeMineCount) || 0);

  uiState.sidebarBadges.waiting = normalizedWaiting;
  uiState.sidebarBadges.activeMine = normalizedActiveMine;

  const waitingBadge = document.getElementById('whatsapp-chats-counter');
  if (waitingBadge) {
    waitingBadge.textContent = normalizedWaiting > 99 ? '99+' : String(normalizedWaiting);
    waitingBadge.classList.toggle('d-none', normalizedWaiting === 0);
    const waitingLabel = normalizedWaiting === 1
      ? '1 conversa aguardando'
      : `${normalizedWaiting} conversas aguardando`;
    waitingBadge.title = waitingLabel;
    waitingBadge.setAttribute('aria-label', waitingLabel);
  }

  const activeBadge = document.getElementById('whatsapp-active-chats-counter');
  if (activeBadge) {
    activeBadge.textContent = normalizedActiveMine > 99 ? '99+' : String(normalizedActiveMine);
    activeBadge.classList.toggle('d-none', normalizedActiveMine === 0);
    const activeLabel = normalizedActiveMine === 1
      ? '1 conversa ativa vinculada a este agente'
      : `${normalizedActiveMine} conversas ativas vinculadas a este agente`;
    activeBadge.title = activeLabel;
    activeBadge.setAttribute('aria-label', activeLabel);
  }
}

function applyChatSearchAndRender() {
  if (uiState.chatFilter === 'waiting') {
    renderQueue(uiState.availableQueue, { persist: false });
  } else {
    renderChatsList(uiState.availableChats, { persist: false });
  }
}

function setChatSearchTerm(rawValue, options = {}) {
  const value = typeof rawValue === 'string' ? rawValue : '';
  const previous = uiState.chatSearchTerm;
  uiState.chatSearchTerm = value;

  if (options.skipRender) {
    return;
  }

  if (previous !== value || options.force) {
    applyChatSearchAndRender();
  }
}

function clearChatSearch() {
  const input = document.getElementById('whatsapp-search-input');
  if (input) {
    input.value = '';
  }
  if (uiState.searchDebounceTimer) {
    clearTimeout(uiState.searchDebounceTimer);
    uiState.searchDebounceTimer = null;
  }
  setChatSearchTerm('', { force: true });
}

/**
 * Pré-carrega tags no cache (chamado ao inicializar UI)
 */
async function preloadTagsCache() {
  let tagsBackend;
  try {
    tagsBackend = await waitForTagsBackend();
  } catch (err) {
    console.warn('[whatsappUI] Backend de tags não disponível:', err.message);
    return;
  }
  
  try {
    const tags = await tagsBackend.listTags(true);
    window.__TAGS_CACHE__ = {};
    tags.forEach(tag => {
      window.__TAGS_CACHE__[tag.id] = tag;
    });
    if (window.__DEBUG__) console.log(`[whatsappUI] ${tags.length} tags carregadas no cache`);
  } catch (error) {
    console.error('[whatsappUI] Erro ao carregar tags:', error);
  }
}

/**
 * Renderiza conversas na sidebar
 */
function renderChatsList(chats, options = {}) {
  const container = document.getElementById('whatsapp-chats-list');
  if (!container) return;

  const { persist = true } = options;
  const baseList = Array.isArray(chats) ? [...chats] : [];

  if (persist) {
    uiState.availableChats = [...baseList];
  }

  const sourceList = persist ? uiState.availableChats : baseList;
  const filteredChats = filterChatsBySearch(sourceList, uiState.chatSearchTerm);

  updateSearchSummary(filteredChats.length, sourceList.length);
  updateChatCounter(filteredChats.length, sourceList.length, uiState.chatSearchTerm);

  if (sourceList.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted py-4">
        <i class="bi bi-inbox display-4"></i>
        <p class="mt-2">Nenhuma conversa disponível</p>
      </div>
    `;
    return;
  }

  if (filteredChats.length === 0) {
    const term = escapeHtml(uiState.chatSearchTerm.trim());
    container.innerHTML = `
      <div class="alert alert-light border rounded shadow-sm mt-3" role="status">
        <div class="d-flex flex-column flex-sm-row align-items-sm-center gap-3">
          <div class="flex-grow-1">
            <h6 class="mb-1"><i class="bi bi-search me-2"></i>Nenhuma conversa encontrada</h6>
            <p class="mb-0 text-muted small">Ajuste os termos de busca ${term ? `para <mark>${term}</mark>` : ''} ou limpe o filtro.</p>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-role="clear-search">
            <i class="bi bi-arrow-counterclockwise me-1"></i>Limpar busca
          </button>
        </div>
      </div>
    `;

    container.querySelector('[data-role="clear-search"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      clearChatSearch();
    });

    return;
  }

  container.innerHTML = filteredChats.map(chat => {
    const lastMessageTime = formatTime(resolveTimestamp(chat.lastMessageTimestamp));
    const unreadClass = chat.lastMessageDirection === 'inbound' ? 'fw-bold' : '';
    const isResolved = chat.status === 'resolvido';
    
    //  Suporte para diferentes formatos de número
    const phoneNumber = chat.numero || chat.phoneNumber || chat.phone || chat.from;
    const displayName = chat.customerName || formatPhoneNumber(phoneNumber);
    
    //  NOVO: Renderizar badges de tags
    const tagsBadgesHtml = renderTagBadges(chat.tags || []);
    
    //  NOVO: Badge do agente responsável (visível para admin)
    const agentBadgeHtml = chat.agentName 
      ? `<span class="badge bg-primary me-1" title="Agente: ${chat.agentName}">
           <i class="bi bi-person-fill me-1"></i>${chat.agentName}
         </span>`
      : '';
    
    //  NOVO: Badge de retorno automático
    const returnBadgeHtml = chat.returnedToLastAgent
      ? `<span class="badge bg-success me-1" title="Cliente recorrente - retornado automaticamente">
           <i class="bi bi-arrow-clockwise me-1"></i>Retorno
         </span>`
      : '';
    
    return `
      <div class="chat-item ${uiState.currentChatId === chat.id ? 'active' : ''} ${isResolved ? 'chat-item-resolved' : ''}" 
           data-chat-id="${chat.id}">
        <div class="d-flex align-items-start" onclick="window.__WHATSAPP_UI__.openChat('${chat.id}')">
          <div class="chat-avatar me-2">
            <i class="bi bi-person-circle fs-3"></i>
          </div>
          <div class="flex-grow-1 overflow-hidden">
            <div class="d-flex justify-content-between align-items-center">
              <span class="fw-semibold">${displayName}</span>
              <small class="text-muted">${lastMessageTime}</small>
            </div>
            ${chat.contractId ? `<small class="badge bg-info">Processo: ${chat.contractId.slice(-6)}</small>` : ''}
            ${chat.phoneNumberDisplay ? `<small class="badge bg-success"><i class="bi bi-telephone"></i> ${chat.phoneNumberDisplay}</small>` : ''}
            <p class="mb-0 text-truncate ${unreadClass} small">
              ${chat.lastMessageText || chat.lastMessage || 'Sem mensagens'}
            </p>
            <div class="mt-1">
              <span class="badge bg-${getStatusColor(chat.status)} me-1">${chat.status}</span>
              ${chat.department ? `<span class="badge bg-secondary me-1">${chat.department}</span>` : ''}
              ${agentBadgeHtml}
              ${returnBadgeHtml}
            </div>
            ${tagsBadgesHtml}
          </div>
        </div>
        ${isResolved ? `
          <div class="mt-2">
            <button class="btn btn-sm btn-outline-success w-100" 
                    onclick="event.stopPropagation(); window.__WHATSAPP_UI__.reopenChat('${chat.id}')">
              <i class="bi bi-arrow-clockwise me-1"></i>
              Reabrir conversa
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

/**
 * Abre chat específico
 *  MODIFICADO: Suporta modo preview (visualização sem atribuir)
 */
export async function openChat(chatId, options = {}) {
  if (uiState.currentChatId === chatId) return;

  const { previewMode = false } = options;

  // Parar listener anterior
  if (uiState.messagesListener) {
    uiState.messagesListener();
    uiState.messagesListener = null;
  }

  uiState.currentChatId = chatId;
  uiState.currentChat = null;
  uiState.currentContract = null;
  clearReplyState();
  cancelAudioRecording(true);
  hideAllActionPanels();
  
  //  NOVO: Limpar cache de contexto do autocomplete ao trocar de chat
  if (window.__WHATSAPP_QUICK_MESSAGES_AUTOCOMPLETE__) {
    window.__WHATSAPP_QUICK_MESSAGES_AUTOCOMPLETE__.clearContextCache();
  }

  try {
    const chatData = await whatsappService.getChatById(chatId, { forceRefresh: true });
    if (chatData) {
      uiState.currentChat = { id: chatId, ...chatData };
    } else {
      uiState.currentChat = { id: chatId };
    }
  } catch (err) {
    console.error('[whatsappUI] Erro ao carregar dados do chat:', err);
    uiState.currentChat = { id: chatId };
  }

  updateClientInfoDisplay();
  updateQuickNotesField();
  await loadContractForCurrentChat();

  // Atualizar UI
  document.querySelectorAll('.chat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.chatId === chatId);
  });

  // Carregar mensagens
  loadChatMessages(chatId);

  //  Remover banner de preview existente (se houver)
  const existingBanner = document.getElementById('whatsapp-preview-banner');
  if (existingBanner) {
    existingBanner.remove();
  }

  //  NOVO: Verificar se conversa não está atribuída ao agente atual
  const currentUserId = auth.currentUser?.uid;
  const chatAgentId = uiState.currentChat?.agentId;
  const isUnassigned = !chatAgentId || 
                       (chatAgentId !== currentUserId && 
                        (uiState.currentChat?.status === 'novo' || 
                         uiState.currentChat?.status === 'aguardando'));
  
  if (isUnassigned || previewMode) {
    showPreviewModeBanner(chatId);
  } else {
    //  Reabilitar botões de áudio e anexo quando conversa está atribuída
    const audioBtn = document.getElementById('whatsapp-audio-btn');
    const attachBtn = document.getElementById('whatsapp-attachment-btn');
    
    if (audioBtn) {
      audioBtn.disabled = false;
      audioBtn.title = 'Gravar áudio';
    }
    
    if (attachBtn) {
      attachBtn.disabled = false;
      attachBtn.title = 'Enviar anexo';
    }
  }

  //  NOVO: Verificar janela de 24h e exibir aviso se necessário
  checkAndDisplayMessagingWindowWarning(chatId);

  // Iniciar listener de mensagens
  uiState.messagesListener = whatsappService.listenToChatMessages(chatId, messages => {
    uiState.messages = Array.isArray(messages) ? [...messages] : [];
    renderMessages(messages);
  });

  // Marcar como lidas apenas se já estiver atribuído ao agente atual
  const isAssignedToCurrentAgent = chatAgentId === currentUserId;
  
  if (isAssignedToCurrentAgent) {
    await whatsappService.markMessagesAsRead(chatId);
  }

  // Mostrar painel de chat
  document.getElementById('whatsapp-chat-panel')?.classList.remove('d-none');
  document.getElementById('whatsapp-empty-state')?.classList.add('d-none');
}

/**
 *  NOVO: Exibe banner de modo preview para conversas não atribuídas
 */
function showPreviewModeBanner(chatId) {
  // Remover banner existente
  const existingBanner = document.getElementById('whatsapp-preview-banner');
  if (existingBanner) {
    existingBanner.remove();
  }

  const messagesContainer = document.getElementById('whatsapp-messages-container');
  if (!messagesContainer) return;

  const banner = document.createElement('div');
  banner.id = 'whatsapp-preview-banner';
  banner.className = 'alert alert-info border-info shadow-sm m-3 mb-2 d-flex align-items-center gap-3';
  banner.style.borderLeft = '4px solid #0dcaf0';
  banner.style.animation = 'slideDownBanner 0.3s ease-out';
  banner.innerHTML = `
    <i class="bi bi-eye-fill text-info fs-4"></i>
    <div class="flex-grow-1">
      <strong><i class="bi bi-info-circle me-1"></i>Modo Visualização</strong>
      <p class="mb-0 small mt-1">
        Esta conversa ainda não está atribuída a você. 
        <strong>Responda a primeira mensagem</strong> para assumir automaticamente o atendimento.
      </p>
    </div>
    <button class="btn btn-primary btn-sm" onclick="window.__WHATSAPP_UI__.assignChatToMe('${chatId}')">
      <i class="bi bi-person-check me-1"></i> Assumir Agora
    </button>
  `;

  messagesContainer.parentElement.insertBefore(banner, messagesContainer);

  // Desabilitar gravação de áudio e anexos em modo preview
  const audioBtn = document.getElementById('whatsapp-audio-btn');
  const attachBtn = document.getElementById('whatsapp-attachment-btn');
  
  if (audioBtn) {
    audioBtn.disabled = true;
    audioBtn.title = 'Assuma a conversa para gravar áudio';
  }
  
  if (attachBtn) {
    attachBtn.disabled = true;
    attachBtn.title = 'Assuma a conversa para enviar anexos';
  }
}

/**
 * Verifica janela de 24h e exibe aviso se necessário
 */
async function checkAndDisplayMessagingWindowWarning(chatId) {
  try {
    const windowInfo = await whatsappService.checkChatMessagingWindow(chatId);
    
    // Remover aviso existente
    const existingWarning = document.getElementById('whatsapp-24h-warning');
    if (existingWarning) {
      existingWarning.remove();
    }

    // Se NÃO pode enviar mensagens livres, exibir aviso
    if (!windowInfo.canSendFreeform) {
      const messagesContainer = document.getElementById('whatsapp-messages-container');
      if (!messagesContainer) return;

      const warning = document.createElement('div');
      warning.id = 'whatsapp-24h-warning';
      warning.className = 'alert alert-warning border-warning shadow-sm m-3 mb-2 d-flex align-items-start gap-2 position-relative';
      warning.innerHTML = `
        <i class="bi bi-exclamation-triangle-fill text-warning fs-5"></i>
        <div class="flex-grow-1 small">
          <strong> Janela de 24h expirada</strong>
          <p class="mb-1 mt-1">
            Este contato não enviou mensagem nas últimas 24 horas. 
            Você <strong>NÃO pode enviar mensagens de texto livre</strong>.
          </p>
          <p class="mb-2">
            <strong> Soluções:</strong><br>
            - Peça ao contato para enviar uma mensagem primeiro<br>
            - Use um Template de Mensagem aprovado (botão abaixo)<br>
            - Entre em contato por outro meio (telefone, e-mail)
          </p>
          <div class="dropdown">
            <button class="btn btn-primary btn-sm dropdown-toggle" 
                    type="button" 
                    id="whatsapp-template-dropdown-btn" 
                    data-bs-toggle="dropdown" 
                    aria-expanded="false">
              <i class="bi bi-envelope-paper me-1"></i> Enviar Template
            </button>
            <ul class="dropdown-menu p-3" id="whatsapp-template-dropdown-menu" style="min-width: 350px;">
              <li>
                <h6 class="dropdown-header px-0">Selecione um Template</h6>
              </li>
              <li>
                <select class="form-select form-select-sm mb-2" id="template-select-dropdown">
                  <option value="">-- Carregando... --</option>
                </select>
              </li>
              <li><hr class="dropdown-divider"></li>
              <li>
                <div id="template-params-dropdown" class="mb-2">
                  <!-- Parâmetros serão inseridos aqui -->
                </div>
              </li>
              <li>
                <button class="btn btn-success btn-sm w-100" id="send-template-btn-dropdown">
                  <i class="bi bi-send me-1"></i> Enviar Template
                </button>
              </li>
            </ul>
          </div>
        </div>
        <button type="button" class="btn-close position-absolute top-0 end-0 m-2" 
                aria-label="Fechar aviso" 
                style="font-size: 0.7rem; padding: 0.5rem;"
                id="whatsapp-24h-warning-close"></button>
      `;
      
      // Adicionar evento de fechar
      setTimeout(() => {
        const closeBtn = document.getElementById('whatsapp-24h-warning-close');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            warning.remove();
            console.log('[whatsappUI] Aviso de 24h oculto pelo usuário');
          });
        }
      }, 100);

      messagesContainer.parentElement.insertBefore(warning, messagesContainer);

      // Desabilitar input de mensagem
      const input = document.getElementById('whatsapp-message-input');
      const sendBtn = document.getElementById('whatsapp-send-btn');
      if (input) {
        input.disabled = true;
        input.placeholder = ' Janela de 24h expirada - Aguarde mensagem do contato';
      }
      if (sendBtn) {
        sendBtn.disabled = true;
      }
    } else {
      // Pode enviar normalmente - habilitar input
      const input = document.getElementById('whatsapp-message-input');
      const sendBtn = document.getElementById('whatsapp-send-btn');
      if (input) {
        input.disabled = false;
        input.placeholder = 'Digite sua mensagem...';
      }
      if (sendBtn) {
        sendBtn.disabled = false;
      }

      // Exibir aviso informativo se estiver perto de expirar (< 2 horas)
      if (windowInfo.hoursRemaining < 2 && windowInfo.hoursRemaining > 0) {
        const messagesContainer = document.getElementById('whatsapp-messages-container');
        if (!messagesContainer) return;

        const warning = document.createElement('div');
        warning.id = 'whatsapp-24h-warning';
        warning.className = 'alert alert-info border-info m-3 mb-2 d-flex align-items-start gap-2 position-relative';
        warning.innerHTML = `
          <i class="bi bi-info-circle-fill text-info fs-5"></i>
          <div class="flex-grow-1 small">
            <strong> Atenção:</strong> Janela de 24h expira em <strong>${windowInfo.hoursRemaining}h</strong>.
          </div>
          <button type="button" class="btn-close position-absolute top-0 end-0 m-2" 
                  aria-label="Fechar aviso" 
                  style="font-size: 0.7rem; padding: 0.5rem;"
                  id="whatsapp-24h-warning-info-close"></button>
        `;

        messagesContainer.parentElement.insertBefore(warning, messagesContainer);
        
        // Adicionar evento de fechar
        setTimeout(() => {
          const closeBtn = document.getElementById('whatsapp-24h-warning-info-close');
          if (closeBtn) {
            closeBtn.addEventListener('click', () => {
              warning.remove();
              console.log('[whatsappUI] Aviso informativo de 24h oculto pelo usuário');
            });
          }
        }, 100);
      }
    }
  } catch (err) {
    console.error('[whatsappUI] Erro ao verificar janela de 24h:', err);
  }
}

/**
 * Carrega mensagens do chat
 */
async function loadChatMessages(chatId) {
  try {
    const messages = await whatsappService.getChatMessages(chatId);
    uiState.messages = Array.isArray(messages) ? [...messages] : [];
    renderMessages(messages);
  } catch (err) {
    console.error('[whatsappUI] Erro ao carregar mensagens:', err);
  }
}

function truncateText(text, maxLength = 120) {
  if (!text) return '';
  const normalized = String(text);
  if (normalized.length <= maxLength) return normalized;
  const sliceLength = Math.max(maxLength - 3, 0);
  return `${normalized.slice(0, sliceLength)}...`;
}

function extractMessagePreview(message) {
  if (!message) return '';

  if (typeof message.text === 'string' && message.text.trim()) {
    return message.text.trim();
  }

  if (typeof message.caption === 'string' && message.caption.trim()) {
    return message.caption.trim();
  }

  if (message.type === 'media' || message.mediaType) {
    const mediaLabel = (message.mediaType || '').toString().toLowerCase();
    const label = mediaLabel ? mediaLabel.charAt(0).toUpperCase() + mediaLabel.slice(1) : 'Arquivo';
    const name = message.fileName || '';
    return name ? ` ${label}: ${name}` : ` ${label}`;
  }

  if (message.type === 'system' && message.text) {
    return message.text;
  }

  return '';
}

function findMessageByWhatsAppId(messageId) {
  if (!messageId) return null;
  return uiState.messages.find(msg => msg.messageId === messageId || msg.id === messageId) || null;
}

function buildReplyAuthorLabel(message) {
  if (!message) return 'Mensagem';

  if (message.direction === 'outbound') {
    return message.agentName || 'Você';
  }

  if (message.direction === 'inbound') {
    return uiState.currentChat?.customerName || 'Cliente';
  }

  return 'Mensagem';
}

function renderReplyReference(message) {
  const reply = message?.replyTo;
  if (!reply || !reply.messageId) return '';

  const original = findMessageByWhatsAppId(reply.messageId);
  const originDirection = reply.direction || original?.direction || null;
  const highlightClass = originDirection === 'outbound'
    ? 'border-primary'
    : originDirection === 'inbound'
      ? 'border-success'
      : 'border-secondary';

  const author = reply.author || buildReplyAuthorLabel(original);
  const preview = reply.text || extractMessagePreview(original) || 'Mensagem anterior';

  const safeAuthor = escapeHtml(author || 'Mensagem');
  const safePreview = escapeHtml(truncateText(preview));

  return `
    <div class="reply-reference bg-light border-start border-4 ${highlightClass} ps-2 pe-2 py-1 mb-2 rounded small text-muted cursor-pointer" data-reply-target="${reply.messageId}">
      <div class="fw-semibold text-body">${safeAuthor}</div>
      <div class="reply-reference-text">${safePreview}</div>
    </div>
  `;
}

function renderForwardedLabel(message) {
  const metadata = message?.forwardedFrom;
  if (!metadata) return '';

  const details = [];

  if (metadata.author) {
    details.push(escapeHtml(metadata.author));
  }

  if (metadata.chatName) {
    details.push(escapeHtml(metadata.chatName));
  } else if (metadata.chatId && metadata.chatId !== uiState.currentChatId) {
    details.push(escapeHtml(formatPhoneNumber(String(metadata.chatId))));
  }

  const description = details.length ? ` de ${details.join(' | ')}` : '';

  return `
    <div class="forwarded-label text-muted small mb-2">
      <i class="bi bi-forward-fill me-1"></i>Mensagem encaminhada${description}
    </div>
  `;
}

function renderReplyPreview() {
  const container = document.getElementById('whatsapp-reply-preview');
  if (!container) return;

  const authorEl = container.querySelector('.reply-preview-author');
  const snippetEl = container.querySelector('.reply-preview-snippet');

  if (!uiState.replyingToMessage) {
    container.classList.add('d-none');
    if (authorEl) authorEl.textContent = '';
    if (snippetEl) snippetEl.textContent = '';
    return;
  }

  const { authorLabel, preview } = uiState.replyingToMessage;
  if (authorEl) {
    authorEl.textContent = authorLabel || 'Mensagem';
  }
  if (snippetEl) {
    snippetEl.textContent = truncateText(preview || '', 160);
  }

  container.classList.remove('d-none');
}

function clearReplyState() {
  uiState.replyingToMessage = null;
  renderReplyPreview();
}

function startReplyByMessageId(messageId) {
  if (!messageId) {
    showNotification('Mensagem não encontrada para responder.', 'warning');
    return;
  }

  const message = findMessageByWhatsAppId(messageId);
  if (!message) {
    showNotification('Mensagem fora do histórico recente. Carregue mensagens anteriores.', 'warning');
    return;
  }

  const whatsappId = message.messageId || messageId;
  if (!whatsappId) {
    showNotification('Esta mensagem não possui ID válido para citação.', 'warning');
    return;
  }

  const preview = extractMessagePreview(message) || 'Mensagem anterior';
  const authorLabel = buildReplyAuthorLabel(message);

  uiState.replyingToMessage = {
    messageId: whatsappId,
    localId: message.id,
    direction: message.direction,
    preview,
    authorLabel,
    type: message.type || null
  };

  renderReplyPreview();

  const input = document.getElementById('whatsapp-message-input');
  input?.focus();
}

function cancelReply(event) {
  event?.preventDefault?.();
  clearReplyState();
}

function buildForwardPreviewHtml(message) {
  if (!message) {
    return '<div class="text-muted">Selecione uma mensagem para encaminhar.</div>';
  }

  const direction = message.direction || 'inbound';
  const author = direction === 'outbound'
    ? (message.agentName || 'Você')
    : (uiState.currentChat?.customerName || 'Cliente');

  const timestamp = formatTime(resolveTimestamp(message.timestamp));

  let contentHtml = '';
  if ((message.type === 'media' && message.mediaUrl) || message.mediaUrl) {
    const label = (message.mediaType || 'arquivo').toString().toLowerCase();
    const fileName = message.fileName || message.name || label;
    const caption = message.caption ? `<div class="mt-2">${escapeHtml(truncateText(message.caption, 220))}</div>` : '';
    contentHtml = `
      <div class="d-flex align-items-center small">
        <i class="bi bi-paperclip me-2"></i>
        <span>${escapeHtml(fileName)}</span>
      </div>
      ${caption}
    `;
  } else {
    const text = message.text || message.body || '';
    contentHtml = `<p class="mb-0">${escapeHtml(truncateText(text, 320))}</p>`;
  }

  return `
    <div>
      <div class="d-flex justify-content-between align-items-center mb-2">
        <strong>${escapeHtml(author)}</strong>
        <small class="text-muted">${timestamp}</small>
      </div>
      ${contentHtml}
    </div>
  `;
}

function populateForwardTargetsDropdown() {
  const select = document.getElementById('whatsapp-forward-target-select');
  if (!select) return;

  const chats = (uiState.availableChats || []).filter(chat => chat?.id && chat.id !== uiState.currentChatId);

  if (chats.length === 0) {
    select.innerHTML = '<option value="">Nenhuma conversa disponível</option>';
    select.disabled = true;
    return;
  }

  const options = ['<option value="">Selecionar conversa</option>'];
  chats.forEach(chat => {
    const displayName = chat.customerName || chat.displayName || formatPhoneNumber(chat.phoneNumber || chat.id);
    const statusLabel = chat.status ? ` | ${formatStatusLabel(chat.status)}` : '';
    options.push(`<option value="${chat.id}">${escapeHtml(displayName)}${statusLabel}</option>`);
  });

  select.innerHTML = options.join('');
  select.disabled = false;
}

function updateForwardPreview(message) {
  const preview = document.getElementById('whatsapp-forward-preview');
  if (!preview) return;
  preview.innerHTML = buildForwardPreviewHtml(message);
}

function resetForwardState() {
  uiState.forwardingMessage = null;

  const form = document.getElementById('whatsapp-forward-form');
  if (form) {
    form.reset();
    form.classList.remove('was-validated');
  }

  const targetSelect = document.getElementById('whatsapp-forward-target-select');
  const phoneInput = document.getElementById('whatsapp-forward-phone');
  targetSelect?.setCustomValidity('');
  phoneInput?.setCustomValidity('');

  const preview = document.getElementById('whatsapp-forward-preview');
  if (preview) {
    preview.innerHTML = '<div class="text-muted">Selecione uma mensagem para encaminhar.</div>';
  }

  const confirmBtn = document.getElementById('whatsapp-forward-confirm-btn');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i class="bi bi-forward-fill me-2"></i>Encaminhar';
  }
}

function startForwardByMessageId(messageId, fallbackId = null) {
  const candidateId = messageId || fallbackId;
  if (!candidateId) {
    showNotification('Mensagem não encontrada para encaminhar.', 'warning');
    return;
  }

  const message = findMessageByWhatsAppId(candidateId) || (fallbackId ? findMessageByWhatsAppId(fallbackId) : null);

  if (!message) {
    showNotification('Mensagem fora do histórico recente. Carregue mensagens anteriores.', 'warning');
    return;
  }

  if (message.type === 'system') {
    showNotification('Mensagens automáticas não podem ser encaminhadas.', 'warning');
    return;
  }

  uiState.forwardingMessage = { ...message };
  updateForwardPreview(uiState.forwardingMessage);
  populateForwardTargetsDropdown();

  // Usar collapse ao invés de modal
  const collapseEl = document.getElementById('whatsapp-forward-collapse');
  if (!collapseEl) {
    showNotification('Interface de encaminhamento não disponível.', 'error');
    return;
  }

  const collapse = new bootstrap.Collapse(collapseEl, { toggle: false });
  collapse.show();

  const form = document.getElementById('whatsapp-forward-form');
  form?.classList.remove('was-validated');

  const targetSelect = document.getElementById('whatsapp-forward-target-select');
  const phoneInput = document.getElementById('whatsapp-forward-phone');
  targetSelect?.setCustomValidity('');
  phoneInput?.setCustomValidity('');

  setTimeout(() => {
    if (targetSelect && !targetSelect.disabled && targetSelect.options.length > 1) {
      targetSelect.focus();
    } else {
      phoneInput?.focus();
    }
    
    // Scroll suave até o collapse
    collapseEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 150);
}

async function handleForwardFormSubmit(event) {
  event?.preventDefault?.();

  if (!uiState.forwardingMessage) {
    showNotification('Selecione uma mensagem para encaminhar.', 'warning');
    return;
  }

  const form = document.getElementById('whatsapp-forward-form');
  if (!form) return;

  const targetSelect = document.getElementById('whatsapp-forward-target-select');
  const phoneInput = document.getElementById('whatsapp-forward-phone');
  const noteInput = document.getElementById('whatsapp-forward-note');

  targetSelect?.setCustomValidity('');
  phoneInput?.setCustomValidity('');

  const selectedChatId = targetSelect?.value?.trim() || '';
  const rawPhone = phoneInput?.value?.trim() || '';
  const note = noteInput?.value?.trim() || '';

  if (!selectedChatId && !rawPhone) {
    targetSelect?.setCustomValidity('Selecione uma conversa ou informe um número.');
    phoneInput?.setCustomValidity('Selecione uma conversa ou informe um número.');
    form.classList.add('was-validated');
    return;
  }

  if (!selectedChatId && rawPhone) {
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      phoneInput?.setCustomValidity('Informe um número com DDD (mínimo 10 dígitos).');
      form.classList.add('was-validated');
      return;
    }
  }

  const isValid = form.checkValidity();
  form.classList.add('was-validated');
  if (!isValid) {
    return;
  }

  const confirmBtn = document.getElementById('whatsapp-forward-confirm-btn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Encaminhando...';
  }

  try {
    await whatsappService.forwardMessage({
      sourceChatId: uiState.currentChatId,
      targetChatId: selectedChatId || null,
      targetPhoneNumber: selectedChatId ? null : rawPhone,
      message: uiState.forwardingMessage,
      note
    });

    showNotification('Mensagem encaminhada com sucesso.', 'success');

    // Fechar collapse ao invés de modal
    const collapseEl = document.getElementById('whatsapp-forward-collapse');
    if (collapseEl) {
      const collapseInstance = bootstrap.Collapse.getInstance(collapseEl);
      if (collapseInstance) {
        collapseInstance.hide();
      } else {
        collapseEl.classList.remove('show');
      }
    }

    resetForwardState();
    await loadAgentChats();
  } catch (err) {
    console.error('[whatsappUI] Erro ao encaminhar mensagem:', err);
    showNotification(err.message || 'Erro ao encaminhar mensagem.', 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '<i class="bi bi-forward-fill me-2"></i>Encaminhar';
    }
  }
}

function scrollToMessage(messageId) {
  if (!messageId) return;
  const container = document.getElementById('whatsapp-messages-container');
  if (!container) return;

  const target = container.querySelector(`[data-message-dom-id="${messageId}"]`) ||
    container.querySelector(`[data-message-id="${messageId}"]`);

  if (!target) return;

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('border', 'border-warning', 'rounded');
  setTimeout(() => {
    target.classList.remove('border', 'border-warning', 'rounded');
  }, 2000);
}

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  // Prioridade ajustada para compatibilidade com WhatsApp Business API
  // OGG Opus é o formato mais compatível entre navegadores e WhatsApp
  const preferredTypes = [
    'audio/ogg;codecs=opus',  //  MELHOR: Suportado por WhatsApp e navegadores modernos
    'audio/webm;codecs=opus', //  Alternativa (mas OGG é preferível)
    'audio/ogg',              //  Fallback OGG genérico
    'audio/mp4',              //  MP4/M4A também funciona no WhatsApp
    'audio/mpeg',             //  MP3 funciona mas não é ideal para gravação
    'audio/webm',             //  Pode ter problemas no WhatsApp
    'audio/wav'               //  Tamanho muito grande
  ];

  const supported = preferredTypes.find(type => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch (error) {
      if (window.__DEBUG__) {
        console.warn('[whatsappUI] Tipo de áudio não suportado:', type, error);
      }
      return false;
    }
  }) || '';

  if (window.__DEBUG__) {
    console.log('[whatsappUI] Formato de áudio selecionado:', supported);
  }

  return supported;
}

/**
 * Determina extensão de arquivo baseado no mimeType
 * @param {string} mimeType - MIME type do áudio
 * @returns {string} - Extensão do arquivo
 */
function determineAudioExtension(mimeType) {
  if (!mimeType || typeof mimeType !== 'string') return 'webm';
  const normalized = mimeType.toLowerCase();

  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mpeg')) return 'mp3';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('aac')) return 'aac';
  if (normalized.includes('wav')) return 'wav';
  return 'webm';
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(Math.floor(durationMs / 1000), 0);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

let activeAudioPlayer = null;

function pauseActiveAudioPlayer(excludePlayer = null) {
  if (activeAudioPlayer && activeAudioPlayer.player && activeAudioPlayer.player !== excludePlayer) {
    activeAudioPlayer.audio.pause();
  }
}

function resolveAudioAvatarMarkup(message) {
  const possibleKeys = ['avatarUrl', 'profileImageUrl', 'customerAvatar', 'contactAvatar', 'senderAvatarUrl', 'photoUrl'];
  let avatarUrl = null;

  for (const key of possibleKeys) {
    if (message && typeof message[key] === 'string' && message[key].trim()) {
      avatarUrl = message[key].trim();
      break;
    }
  }

  if (avatarUrl) {
    const safeUrl = escapeHtml(avatarUrl);
    return `<img src="${safeUrl}" alt="Avatar" loading="lazy" referrerpolicy="no-referrer">`;
  }

  return '<div class="whatsapp-audio-avatar-fallback"><i class="bi bi-mic-fill"></i></div>';
}

function renderWhatsAppAudioPlayerHtml({
  audioId,
  src,
  mimeType,
  durationLabel = '--:--',
  message,
  variant = 'inbound'
}) {
  const safeSrc = escapeHtml(src || '');
  const safeMime = escapeHtml(mimeType || 'audio/mpeg');
  const safeDuration = durationLabel || '--:--';
  const avatarMarkup = resolveAudioAvatarMarkup(message);

  return `
    <div class="whatsapp-audio-player audio-${variant}" data-audio-id="${audioId}">
      <button type="button" class="btn btn-link whatsapp-audio-toggle" aria-label="Reproduzir áudio">
        <i class="bi bi-play-fill"></i>
      </button>
      <div class="whatsapp-audio-wave flex-grow-1">
        <div class="whatsapp-audio-progress">
          <div class="whatsapp-audio-progress-fill"></div>
        </div>
        <div class="d-flex justify-content-between small mt-1">
          <span class="whatsapp-audio-current">00:00</span>
          <span class="whatsapp-audio-duration">${safeDuration}</span>
        </div>
      </div>
      <div class="whatsapp-audio-avatar ms-3">
        ${avatarMarkup}
      </div>
      <audio class="d-none whatsapp-audio-element" preload="metadata" src="${safeSrc}" type="${safeMime}"></audio>
    </div>
  `;
}

function resolveAudioDurationLabel(message) {
  const msFields = ['audioDurationMs', 'durationMs'];
  for (const field of msFields) {
    const value = message?.[field];
    if (typeof value === 'number' && value > 0) {
      return formatDuration(Math.round(value));
    }
  }

  const secondsFields = ['audioDuration', 'durationSeconds', 'mediaDuration'];
  for (const field of secondsFields) {
    const value = message?.[field];
    if (typeof value === 'number' && value > 0) {
      return formatDuration(Math.round(value * 1000));
    }
  }

  return '--:--';
}

function initializeWhatsAppAudioPlayers(root = document) {
  if (!root) return;

  root.querySelectorAll('.whatsapp-audio-player').forEach((player) => {
    if (player.dataset.audioInitialized === 'true') return;

    const audioEl = player.querySelector('.whatsapp-audio-element');
    const toggleBtn = player.querySelector('.whatsapp-audio-toggle');
    const progressTrack = player.querySelector('.whatsapp-audio-progress');
    const progressFill = player.querySelector('.whatsapp-audio-progress-fill');
    const currentLabel = player.querySelector('.whatsapp-audio-current');
    const durationLabel = player.querySelector('.whatsapp-audio-duration');

    if (!audioEl) {
      return;
    }

    const updateProgress = () => {
      if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
        const percent = (audioEl.currentTime / audioEl.duration) * 100;
        if (progressFill) progressFill.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
      }
      if (currentLabel) {
        currentLabel.textContent = formatDuration(Math.round(audioEl.currentTime * 1000));
      }
    };

    const resetPlayerUI = () => {
      if (progressFill) progressFill.style.width = '0%';
      if (currentLabel) currentLabel.textContent = '00:00';
      player.classList.remove('is-playing');
      if (toggleBtn) toggleBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
    };

    audioEl.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audioEl.duration) && durationLabel) {
        durationLabel.textContent = formatDuration(Math.round(audioEl.duration * 1000));
      }
    });

    audioEl.addEventListener('timeupdate', updateProgress);

    audioEl.addEventListener('play', () => {
      pauseActiveAudioPlayer(player);
      player.classList.add('is-playing');
      if (toggleBtn) toggleBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
      activeAudioPlayer = { player, audio: audioEl, toggleBtn, progressFill, currentLabel };
    });

    audioEl.addEventListener('pause', () => {
      if (toggleBtn) toggleBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
      player.classList.remove('is-playing');
      if (activeAudioPlayer?.player === player) {
        activeAudioPlayer = null;
      }
    });

    audioEl.addEventListener('ended', () => {
      audioEl.pause();
      audioEl.currentTime = 0;
      resetPlayerUI();
    });

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (audioEl.paused) {
          audioEl.play().catch((error) => {
            console.error('[whatsappUI] Erro ao reproduzir áudio:', error);
            showNotification('Não foi possível reproduzir o áudio.', 'error');
          });
        } else {
          audioEl.pause();
        }
      });
    }

    if (progressTrack) {
      let pointerActive = false;

      const scrubToPosition = (clientX) => {
        if (!Number.isFinite(audioEl.duration) || audioEl.duration === 0) return;
        const rect = progressTrack.getBoundingClientRect();
        const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
        audioEl.currentTime = ratio * audioEl.duration;
        updateProgress();
      };

      progressTrack.addEventListener('pointerdown', (event) => {
        pointerActive = true;
        progressTrack.setPointerCapture(event.pointerId);
        scrubToPosition(event.clientX);
      });

      progressTrack.addEventListener('pointermove', (event) => {
        if (!pointerActive) return;
        scrubToPosition(event.clientX);
      });

      const pointerUpHandler = (event) => {
        if (!pointerActive) return;
        scrubToPosition(event.clientX);
        pointerActive = false;
        try {
          progressTrack.releasePointerCapture(event.pointerId);
        } catch {
          // Ignorar erros de release quando pointer já foi liberado
        }
      };

      progressTrack.addEventListener('pointerup', pointerUpHandler);
      progressTrack.addEventListener('pointercancel', () => {
        pointerActive = false;
      });
      progressTrack.addEventListener('pointerleave', () => {
        pointerActive = false;
      });
    }

    player.dataset.audioInitialized = 'true';
    resetPlayerUI();
  });
}

function renderAudioIndicator(state, label) {
  const indicator = document.getElementById('whatsapp-audio-indicator');
  if (!indicator) return;

  const iconWrapper = indicator.querySelector('.audio-indicator-icon');
  const textEl = indicator.querySelector('.audio-indicator-text');
  const cancelBtn = document.getElementById('whatsapp-cancel-audio-btn');
  const sendBtn = document.getElementById('whatsapp-send-audio-btn');
  const discardBtn = document.getElementById('whatsapp-discard-audio-btn');
  const previewContainer = indicator.querySelector('.audio-preview-container');
  const audioEl = document.getElementById('whatsapp-audio-preview-player');

  indicator.classList.remove('alert-danger', 'alert-info', 'alert-secondary', 'alert-warning', 'alert-success');

  if (state === 'hidden') {
    indicator.classList.add('d-none');
    if (iconWrapper) {
      iconWrapper.classList.remove('text-info');
      iconWrapper.classList.add('text-danger');
      iconWrapper.innerHTML = '<i class="bi bi-record-circle-fill"></i>';
    }
    if (textEl) textEl.textContent = '';
    if (cancelBtn) {
      cancelBtn.classList.remove('d-none');
      cancelBtn.disabled = false;
    }
    if (sendBtn) {
      sendBtn.classList.add('d-none');
      sendBtn.disabled = false;
    }
    if (discardBtn) {
      discardBtn.classList.add('d-none');
      discardBtn.disabled = false;
    }
    if (previewContainer) previewContainer.classList.add('d-none');
    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
    }
    return;
  }

  indicator.classList.remove('d-none');
  if (previewContainer) previewContainer.classList.add('d-none');
  if (sendBtn) {
    sendBtn.classList.add('d-none');
    sendBtn.disabled = false;
  }
  if (discardBtn) {
    discardBtn.classList.add('d-none');
    discardBtn.disabled = false;
  }

  switch (state) {
    case 'recording':
      indicator.classList.add('alert-danger');
      if (iconWrapper) {
        iconWrapper.classList.remove('text-info');
        iconWrapper.classList.add('text-danger');
        iconWrapper.innerHTML = '<i class="bi bi-record-circle-fill"></i>';
      }
      if (textEl) {
        textEl.textContent = label || 'Gravando...';
      }
      if (cancelBtn) {
        cancelBtn.classList.remove('d-none');
        cancelBtn.disabled = false;
      }
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute('src');
        audioEl.load();
      }
      break;
    case 'processing':
      indicator.classList.add('alert-secondary');
      if (iconWrapper) {
        iconWrapper.classList.remove('text-danger');
        iconWrapper.classList.add('text-info');
        iconWrapper.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
      }
      if (textEl) {
        textEl.textContent = label || 'Processando áudio...';
      }
      if (audioEl) {
        audioEl.pause();
      }
      if (cancelBtn) {
        cancelBtn.classList.add('d-none');
        cancelBtn.disabled = true;
      }
      if (sendBtn) {
        sendBtn.classList.add('d-none');
        sendBtn.disabled = true;
      }
      if (discardBtn) {
        discardBtn.classList.add('d-none');
        discardBtn.disabled = true;
      }
      if (previewContainer) previewContainer.classList.add('d-none');
      break;
    case 'preview':
      indicator.classList.add('alert-info');
      if (iconWrapper) {
        iconWrapper.classList.remove('text-danger');
        iconWrapper.classList.add('text-info');
        iconWrapper.innerHTML = '<i class="bi bi-soundwave"></i>';
      }
      if (textEl) {
        textEl.textContent = label || 'Pré-visualização pronta';
      }
      if (previewContainer) {
        previewContainer.classList.remove('d-none');
      }
      if (cancelBtn) {
        cancelBtn.classList.add('d-none');
        cancelBtn.disabled = true;
      }
      if (sendBtn) {
        sendBtn.classList.remove('d-none');
        sendBtn.disabled = false;
      }
      if (discardBtn) {
        discardBtn.classList.remove('d-none');
        discardBtn.disabled = false;
      }
      break;
    default:
      if (textEl) {
        textEl.textContent = label || '';
      }
      break;
  }
}

function updateAudioButtonUI(isRecording = false) {
  const audioBtn = document.getElementById('whatsapp-audio-btn');
  if (!audioBtn) return;

  const hasPreview = Boolean(uiState.audioRecording?.previewUrl);

  if (isRecording) {
    audioBtn.classList.add('recording');
    audioBtn.innerHTML = '<i class="bi bi-stop-fill"></i>';
    audioBtn.setAttribute('aria-pressed', 'true');
    audioBtn.setAttribute('title', 'Parar gravação');
    audioBtn.disabled = false;
  } else {
    audioBtn.classList.remove('recording');
    audioBtn.innerHTML = '<i class="bi bi-mic-fill"></i>';
    audioBtn.setAttribute('aria-pressed', 'false');
    audioBtn.setAttribute('title', hasPreview ? 'Finalize ou descarte a gravação atual' : 'Gravar mensagem de áudio');
    audioBtn.disabled = !uiState.currentChatId || hasPreview;
  }
}

function updateAudioRecordingTimer(recording) {
  if (!recording?.active) return;
  const elapsed = Date.now() - (recording.startTime || Date.now());
  renderAudioIndicator('recording', `Gravando... ${formatDuration(elapsed)}`);
}

function cleanupAudioRecording(recording, resetUI = false) {
  if (recording?.timerInterval) {
    clearInterval(recording.timerInterval);
  }

  if (recording?.stream) {
    try {
      recording.stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      if (window.__DEBUG__) {
        console.warn('[whatsappUI] Falha ao encerrar stream de áudio:', err);
      }
    }
  }

  if (recording?.previewUrl) {
    try {
      URL.revokeObjectURL(recording.previewUrl);
    } catch (error) {
      if (window.__DEBUG__) {
        console.warn('[whatsappUI] Não foi possível revogar URL de áudio:', error);
      }
    }
  }

  const audioPreview = document.getElementById('whatsapp-audio-preview-player');
  if (audioPreview) {
    audioPreview.pause();
    audioPreview.removeAttribute('src');
    audioPreview.load();
  }

  const previewIndicator = document.getElementById('whatsapp-audio-indicator');
  if (previewIndicator) {
    const durationEl = previewIndicator.querySelector('.audio-preview-container .whatsapp-audio-duration');
    const currentEl = previewIndicator.querySelector('.audio-preview-container .whatsapp-audio-current');
    const progressFill = previewIndicator.querySelector('.audio-preview-container .whatsapp-audio-progress-fill');
    const player = previewIndicator.querySelector('.audio-preview-container .whatsapp-audio-player');

    if (durationEl) durationEl.textContent = '--:--';
    if (currentEl) currentEl.textContent = '00:00';
    if (progressFill) progressFill.style.width = '0%';
    if (player) player.classList.remove('is-playing');
  }

  if (uiState.audioRecording === recording) {
    uiState.audioRecording = createEmptyAudioRecordingState();
  }

  if (resetUI) {
    renderAudioIndicator('hidden');
    updateAudioButtonUI(false);
  }
}

function displayAudioPreview(recording) {
  if (!recording?.previewUrl) return;

  pauseActiveAudioPlayer();

  const durationLabel = formatDuration(recording.durationMs ?? 0);
  renderAudioIndicator('preview', `Pré-visualização | ${durationLabel}`);

  const audioPreview = document.getElementById('whatsapp-audio-preview-player');
  if (audioPreview) {
    audioPreview.pause();
    audioPreview.src = recording.previewUrl;
    audioPreview.load();
    audioPreview.currentTime = 0;
  }

  const indicator = document.getElementById('whatsapp-audio-indicator');
  if (indicator) {
    const durationEl = indicator.querySelector('.audio-preview-container .whatsapp-audio-duration');
    const currentEl = indicator.querySelector('.audio-preview-container .whatsapp-audio-current');
    const progressFill = indicator.querySelector('.audio-preview-container .whatsapp-audio-progress-fill');

    if (durationEl) durationEl.textContent = durationLabel;
    if (currentEl) currentEl.textContent = '00:00';
    if (progressFill) progressFill.style.width = '0%';

    initializeWhatsAppAudioPlayers(indicator);
  }

  updateAudioButtonUI(false);
}

async function sendRecordedAudioBlob(blob) {
  const chatId = uiState.currentChatId;
  if (!chatId) {
    throw new Error('Nenhum chat selecionado para envio de áudio.');
  }

  const attachmentsApi = window.__WHATSAPP_ATTACHMENTS__;
  if (!attachmentsApi || typeof attachmentsApi.send !== 'function') {
    throw new Error('Serviço de anexos indisponível no momento.');
  }

  //  CONVERSÃO AUTOMÁTICA: WebM -> OGG Opus (WhatsApp compatível)
  // Preparar áudio para envio (conversão será feita server-side)
  const processedBlob = blob;
  const mimeType = blob.type || 'audio/webm;codecs=opus';
  
  //  Nota: conversão WebM->OGG é feita automaticamente pela Cloud Function
  // porque o navegador não suporta re-codificar para OGG Opus
  
  const extension = determineAudioExtension(mimeType);
  const fileName = `audio-${Date.now()}.${extension}`;
  
  if (window.__DEBUG__) {
    console.log('[whatsappUI]  Enviando áudio para conversão server-side:', {
      mimeType,
      extension,
      fileName,
      size: processedBlob.size,
      chatId,
      note: 'Cloud Function converterá WebM -> OGG automaticamente'
    });
  }

  const audioFile = new File([processedBlob], fileName, { type: mimeType });

  await attachmentsApi.send(chatId, audioFile, '');
}

async function handleAudioRecordingStop(recording) {
  if (!recording) return;

  if (recording.timerInterval) {
    clearInterval(recording.timerInterval);
    recording.timerInterval = null;
  }

  if (recording.stream) {
    try {
      recording.stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      if (window.__DEBUG__) {
        console.warn('[whatsappUI] Erro ao finalizar tracks de áudio:', err);
      }
    }
  }

  const chunks = Array.isArray(recording.chunks) ? recording.chunks : [];
  const canceled = recording.cancelOnStop === true;

  if (canceled || chunks.length === 0) {
    cleanupAudioRecording(recording, true);
    if (!canceled && chunks.length === 0) {
      showNotification('Nenhum áudio capturado.', 'warning');
    }
    return;
  }

  try {
    const blob = new Blob(chunks, { type: recording.mimeType || 'audio/webm' });
    const previewUrl = URL.createObjectURL(blob);
    recording.previewBlob = blob;
    recording.previewUrl = previewUrl;
    recording.durationMs = (recording.stopTime && recording.startTime)
      ? Math.max(recording.stopTime - recording.startTime, 0)
      : Math.max(Date.now() - (recording.startTime || Date.now()), 0);
    displayAudioPreview(recording);
  } catch (error) {
    console.error('[whatsappUI] Erro ao preparar pré-visualização de áudio:', error);
    showNotification('Não foi possível preparar a pré-visualização do áudio.', 'error');
    cleanupAudioRecording(recording, true);
  } finally {
    recording.chunks = [];
  }
}

async function confirmSendRecordedAudio() {
  const recording = uiState.audioRecording;
  if (!recording?.previewBlob) {
    showNotification('Nenhuma pré-visualização disponível para envio.', 'warning');
    return;
  }

  try {
    renderAudioIndicator('processing', 'Enviando áudio...');
    await sendRecordedAudioBlob(recording.previewBlob);
    cleanupAudioRecording(recording, true);
  } catch (error) {
    console.error('[whatsappUI] Erro ao enviar mensagem de áudio:', error);
    showNotification('Não foi possível enviar a mensagem de áudio.', 'error');
    displayAudioPreview(recording);
  }
}

function discardRecordedAudioPreview() {
  const recording = uiState.audioRecording;
  if (!recording?.previewUrl && !recording?.active) {
    cleanupAudioRecording(recording, true);
    return;
  }

  cleanupAudioRecording(recording, true);
}

async function startAudioRecording() {
  if (uiState.audioRecording?.active) {
    stopAudioRecording();
    return;
  }

  if (uiState.audioRecording?.previewUrl) {
    discardRecordedAudioPreview();
  }

  if (!uiState.currentChatId) {
    showNotification('Selecione um chat antes de gravar áudio.', 'warning');
    return;
  }

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    showNotification('Seu navegador não suporta gravação de áudio.', 'error');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedAudioMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    const recordingState = createEmptyAudioRecordingState();
    recordingState.active = true;
    recordingState.recorder = recorder;
    recordingState.stream = stream;
    recordingState.chunks = [];
    recordingState.startTime = Date.now();
    recordingState.mimeType = recorder.mimeType || mimeType || 'audio/webm';

    uiState.audioRecording = recordingState;

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) {
        recordingState.chunks.push(event.data);
      }
    });

    recorder.addEventListener('stop', () => {
      handleAudioRecordingStop(recordingState).catch((err) => {
        console.error('[whatsappUI] Falha ao finalizar gravação de áudio:', err);
        showNotification('Erro ao finalizar gravação de áudio.', 'error');
      });
    });

    recorder.addEventListener('error', (event) => {
      console.error('[whatsappUI] Erro no MediaRecorder:', event.error || event);
      showNotification('Erro durante a gravação de áudio.', 'error');
      cleanupAudioRecording(recordingState, true);
    });

    recorder.start();

    updateAudioButtonUI(true);
    renderAudioIndicator('recording', 'Gravando... 00:00');

    recordingState.timerInterval = window.setInterval(() => {
      updateAudioRecordingTimer(recordingState);
    }, 200);
  } catch (err) {
    console.error('[whatsappUI] Não foi possível iniciar a captura de áudio:', err);
    const errorMessage = err?.name === 'NotAllowedError'
      ? 'Permita o acesso ao microfone para gravar áudio.'
      : 'Não foi possível acessar o microfone.';
    showNotification(errorMessage, 'error');
    cleanupAudioRecording(uiState.audioRecording, true);
  }
}

function stopAudioRecording(options = {}) {
  const recording = uiState.audioRecording;
  if (!recording?.recorder) {
    if (options?.cancel) {
      renderAudioIndicator('hidden');
      updateAudioButtonUI(false);
    }
    return;
  }

  const { cancel = false } = options;

  recording.active = false;
  recording.cancelOnStop = cancel;
  recording.stopTime = Date.now();

  if (recording.timerInterval) {
    clearInterval(recording.timerInterval);
    recording.timerInterval = null;
  }

  if (cancel) {
    renderAudioIndicator('hidden');
    updateAudioButtonUI(false);
  } else {
    renderAudioIndicator('processing', 'Processando áudio...');
  }

  try {
    if (recording.recorder.state !== 'inactive') {
      recording.recorder.stop();
    } else {
      handleAudioRecordingStop(recording).catch((err) => {
        console.error('[whatsappUI] Erro ao finalizar gravação:', err);
      });
    }
  } catch (err) {
    console.error('[whatsappUI] Erro ao parar MediaRecorder:', err);
    cleanupAudioRecording(recording, true);
    showNotification('Não foi possível finalizar a gravação.', 'error');
  }
}

function cancelAudioRecording(force = false) {
  const recording = uiState.audioRecording;

  if (recording?.recorder && (recording.active || recording.recorder.state !== 'inactive')) {
    stopAudioRecording({ cancel: true });
    return;
  }

  if (recording?.previewUrl && !force) {
    discardRecordedAudioPreview();
    return;
  }

  if (force) {
    cleanupAudioRecording(recording, true);
    return;
  }

  renderAudioIndicator('hidden');
  updateAudioButtonUI(false);
}

/**
 * Atualiza o indicador de quantidade de mensagens
 */
function updateMessagesCountIndicator(count) {
  // Remover indicador anterior se existir
  const oldIndicator = document.getElementById('whatsapp-messages-count-indicator');
  if (oldIndicator) {
    oldIndicator.remove();
  }

  // Criar novo indicador
  const container = document.getElementById('whatsapp-messages-container');
  if (!container || count === 0) return;

  const indicator = document.createElement('div');
  indicator.id = 'whatsapp-messages-count-indicator';
  indicator.className = 'alert alert-info border-0 rounded-0 text-center py-2 mb-0 small';
  indicator.innerHTML = `
    <i class="bi bi-chat-left-text me-1"></i>
    <strong>${count}</strong> ${count === 1 ? 'mensagem carregada' : 'mensagens carregadas'} 
    | Histórico completo da conversa
  `;

  // Inserir no topo do container
  container.parentElement.insertBefore(indicator, container);
}

/**
 * Renderiza mensagens no chat
 */
function renderMessages(messages) {
  const container = document.getElementById('whatsapp-messages-container');
  if (!container) {
    console.warn('[whatsappUI] Container de mensagens não encontrado');
    return;
  }

  pauseActiveAudioPlayer();

  uiState.messages = Array.isArray(messages) ? [...messages] : [];
  renderReplyPreview();

  console.log(`[whatsappUI] Renderizando ${messages.length} mensagens`);
  console.log('[whatsappUI] Mensagens recebidas:', JSON.stringify(messages, null, 2));

  container.innerHTML = messages.map(msg => {
    const isOutbound = msg.direction === 'outbound';
    const time = formatTime(resolveTimestamp(msg.timestamp));
    const fallbackId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const messageDomId = msg.messageId || msg.id || fallbackId;
    const replyReferenceHtml = renderReplyReference(msg);
    const forwardedLabelHtml = renderForwardedLabel(msg);
    const canReply = Boolean(msg.messageId && (msg.direction === 'outbound' || msg.direction === 'inbound'));
    const replyButtonHtml = canReply
      ? `<button type="button" class="btn btn-link btn-sm text-muted p-0 message-reply-btn" data-message-id="${msg.messageId}" title="Responder" aria-label="Responder mensagem"><i class="bi bi-reply"></i></button>`
      : '';
    const canForward = msg.type !== 'system' && (
      (typeof msg.text === 'string' && msg.text.trim().length > 0) ||
      Boolean(msg.mediaUrl)
    );
    const forwardButtonHtml = canForward
      ? `<button type="button" class="btn btn-link btn-sm text-muted p-0 message-forward-btn" data-message-id="${msg.messageId || ''}" data-local-id="${msg.id || ''}" title="Encaminhar" aria-label="Encaminhar mensagem"><i class="bi bi-forward-fill"></i></button>`
      : '';
    
    // Verificar se a mensagem tem anexo
    const hasMedia = msg.type === 'media';
    const hasValidMediaUrl = hasMedia && msg.mediaUrl && !msg.needsMediaDownload;
    const isTemplate = msg.type === 'template';
    
    let contentHtml = '';
    
    if (hasMedia) {
      // Verificar se a mídia precisa ser reprocessada
      if (!hasValidMediaUrl || msg.needsMediaDownload || msg.mediaDownloadFailed) {
        const mediaType = (msg.mediaType || 'arquivo').toLowerCase();
        const fileName = msg.fileName || `${mediaType}`;
        const retries = msg.mediaDownloadRetries || 0;
        const errorMsg = msg.mediaDownloadError || '';
        
        contentHtml = `
          <div class="media-message media-unavailable">
            <div class="alert alert-warning mb-0 p-2">
              <div class="d-flex align-items-center">
                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                <div class="flex-grow-1">
                  <strong>Mídia indisponível</strong>
                  <small class="d-block text-muted">${escapeHtml(fileName)}</small>
                  ${retries > 0 ? `<small class="d-block text-muted">${retries} tentativa(s) de download</small>` : ''}
                  ${errorMsg ? `<small class="d-block text-danger">${escapeHtml(errorMsg.substring(0, 100))}</small>` : ''}
                </div>
                ${msg.mediaId ? `
                  <button 
                    type="button" 
                    class="btn btn-sm btn-warning ms-2" 
                    onclick="if(window.__WHATSAPP_CONFIG__?.retryMediaForChat) window.__WHATSAPP_CONFIG__.retryMediaForChat('${msg.chatId || uiState.currentChatId}')"
                    title="Tentar baixar novamente"
                  >
                    <i class="bi bi-arrow-clockwise"></i>
                  </button>
                ` : ''}
              </div>
              ${msg.caption ? `<p class="mb-0 mt-2">${escapeHtml(msg.caption)}</p>` : ''}
            </div>
          </div>
        `;
      } else {
        // Renderizar mídia normalmente
        const mediaType = (msg.mediaType || '').toLowerCase();
        const fileName = msg.fileName || 'arquivo';
        const caption = msg.caption || '';
        
        if (mediaType === 'image') {
          contentHtml = `
            <div class="media-message">
              <img src="${msg.mediaUrl}" alt="${fileName}" class="img-fluid rounded" style="max-width: 300px; cursor: pointer;" onclick="window.open('${msg.mediaUrl}', '_blank')">
              ${caption ? `<p class="mb-1 mt-2">${escapeHtml(caption)}</p>` : ''}
            </div>
          `;
        } else if (mediaType === 'video') {
          contentHtml = `
            <div class="media-message">
              <video controls class="rounded" style="max-width: 300px;">
                <source src="${msg.mediaUrl}" type="${msg.mimeType || 'video/mp4'}">
                Seu navegador não suporta vídeo.
              </video>
              ${caption ? `<p class="mb-1 mt-2">${escapeHtml(caption)}</p>` : ''}
            </div>
          `;
        } else if (mediaType === 'audio') {
          const audioPlayerHtml = renderWhatsAppAudioPlayerHtml({
            audioId: `${messageDomId}-audio`,
            src: msg.mediaUrl || '',
            mimeType: msg.mimeType || 'audio/mpeg',
            durationLabel: resolveAudioDurationLabel(msg),
            message: msg,
            variant: isOutbound ? 'outbound' : 'inbound'
          });

          contentHtml = `
            <div class="media-message">
              ${audioPlayerHtml}
              ${caption ? `<p class="mb-1 mt-2">${escapeHtml(caption)}</p>` : ''}
            </div>
          `;
        } else {
          // Documento ou arquivo genérico
          contentHtml = `
            <div class="media-message">
              <a href="${msg.mediaUrl}" target="_blank" class="btn btn-sm btn-outline-primary">
                <i class="bi bi-file-earmark-arrow-down"></i> ${escapeHtml(fileName)}
              </a>
              ${caption ? `<p class="mb-1 mt-2">${escapeHtml(caption)}</p>` : ''}
            </div>
          `;
        }
      }
    } else if (isTemplate) {
      // Mensagem de template - exibir com badge e texto formatado
      const templateDisplayName = msg.templateDisplayName || msg.templateName || 'Template';
      const templateText = msg.text || `[Template: ${templateDisplayName}]`;
      
      contentHtml = `
        <div class="template-message">
          <div class="d-flex align-items-center mb-2">
            <span class="badge bg-info text-white me-2" title="Mensagem enviada via Template">
              <i class="bi bi-file-text me-1"></i>${escapeHtml(templateDisplayName)}
            </span>
          </div>
          <p class="mb-1" style="white-space: pre-wrap;">${escapeHtml(templateText)}</p>
        </div>
      `;
    } else {
      // Mensagem de texto normal
      contentHtml = `<p class="mb-1">${escapeHtml(msg.text || '')}</p>`;
    }
    
    return `
      <div class="message ${isOutbound ? 'message-outbound' : 'message-inbound'}" data-message-dom-id="${messageDomId}" data-message-id="${msg.messageId || ''}">
        <div class="message-bubble">
          ${forwardedLabelHtml}
          ${replyReferenceHtml}
          ${contentHtml}
          <div class="message-meta">
            ${forwardButtonHtml}
            ${replyButtonHtml}
            <small class="text-muted">${time}</small>
            ${isOutbound ? `<i class="bi bi-check2-all ms-1 ${msg.read ? 'text-primary' : ''}"></i>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.message-reply-btn').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const messageId = btn.dataset.messageId;
      startReplyByMessageId(messageId);
    });
  });

  container.querySelectorAll('.message-forward-btn').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const messageId = btn.dataset.messageId || null;
      const localId = btn.dataset.localId || null;
      const identifier = messageId || localId;
      startForwardByMessageId(identifier, localId);
    });
  });

  container.querySelectorAll('.reply-reference').forEach(reference => {
    reference.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const targetId = reference.dataset.replyTarget;
      scrollToMessage(targetId);
    });
  });

  initializeWhatsAppAudioPlayers(container);

  // Adicionar indicador de total de mensagens
  updateMessagesCountIndicator(messages.length);

  // Scroll para última mensagem
  container.scrollTop = container.scrollHeight;
  console.log('[whatsappUI] Mensagens renderizadas, scroll ajustado');
}

/**
 * Envia mensagem
 */
export async function sendMessage(event) {
  event?.preventDefault();

  const input = document.getElementById('whatsapp-message-input');
  const text = input?.value?.trim();

  if (!text || !uiState.currentChatId) return;

  try {
    input.disabled = true;
    const sendBtn = document.getElementById('whatsapp-send-btn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    }

    //  NOVO: Verificar se conversa precisa ser atribuída automaticamente
    const currentUserId = auth.currentUser?.uid;
    const isUnassigned = !uiState.currentChat?.agentId || 
                         uiState.currentChat?.status === 'novo' || 
                         uiState.currentChat?.status === 'aguardando';
    
    // Se não está atribuída, atribuir automaticamente ao agente que está respondendo
    if (isUnassigned && currentUserId) {
      console.log('[whatsappUI]  Atribuição automática: conversa será atribuída ao agente ao enviar primeira mensagem');
      
      try {
        await whatsappService.assignChatToAgent(uiState.currentChatId, currentUserId, {
          sendWelcome: false // Não enviar mensagem de boas-vindas automática
        });
        
        // Atualizar estado local
        if (uiState.currentChat) {
          uiState.currentChat.agentId = currentUserId;
          uiState.currentChat.status = 'atribuido';
        }
        
        // Remover banner de preview
        const previewBanner = document.getElementById('whatsapp-preview-banner');
        if (previewBanner) {
          previewBanner.remove();
        }
        
        // Reabilitar botões de áudio e anexos
        const audioBtn = document.getElementById('whatsapp-audio-btn');
        const attachBtn = document.getElementById('whatsapp-attachment-btn');
        if (audioBtn) {
          audioBtn.disabled = false;
          audioBtn.title = 'Gravar mensagem de áudio';
        }
        if (attachBtn) {
          attachBtn.disabled = false;
          attachBtn.title = 'Anexar arquivo';
        }
        
        console.log('[whatsappUI]  Conversa atribuída automaticamente ao agente');
      } catch (assignErr) {
        console.error('[whatsappUI]  Erro ao atribuir conversa automaticamente:', assignErr);
        // Continua com envio mesmo se atribuição falhar
      }
    }

    const replyMetadata = uiState.replyingToMessage
      ? {
          messageId: uiState.replyingToMessage.messageId,
          text: truncateText(uiState.replyingToMessage.preview || '', 280),
          author: uiState.replyingToMessage.authorLabel,
          direction: uiState.replyingToMessage.direction || null
        }
      : null;

    const contextOptions = { origin: 'agent-ui' };
    if (replyMetadata) {
      contextOptions.replyTo = replyMetadata;
      contextOptions.replyToMessageId = replyMetadata.messageId;
    }

    const phoneNumberId = uiState.currentChat?.phoneNumberId;
    if (phoneNumberId) {
      contextOptions.phoneNumberId = phoneNumberId;
    }

    const phoneNumberDisplay = uiState.currentChat?.phoneNumberDisplay;
    if (phoneNumberDisplay) {
      contextOptions.phoneNumberDisplay = phoneNumberDisplay;
    }

    const businessPhoneNumber = uiState.currentChat?.businessPhoneNumber;
    if (businessPhoneNumber) {
      contextOptions.businessPhoneNumber = businessPhoneNumber;
    }

    await whatsappService.sendMessage(uiState.currentChatId, text, contextOptions);

    input.value = '';
    input.disabled = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="bi bi-send-fill"></i>';
    }
    input.focus();
    clearReplyState();
    
    //  NOVO: Recarregar lista de chats se foi atribuição automática
    if (isUnassigned) {
      loadAgentChats();
    }
  } catch (err) {
    console.error('[whatsappUI] Erro ao enviar mensagem:', err);
    
    // Mensagem de erro personalizada
    const errorMsg = err.message || 'Erro ao enviar mensagem';
    
    //  Erro 131047: Janela de 24h expirada
    if (errorMsg.includes('131047') || errorMsg.includes('24 horas') || errorMsg.includes('24 hours')) {
      showNotification(
        ' Este contato não enviou mensagem nas últimas 24 horas.\n\n Peça ao contato para enviar uma mensagem primeiro, ou use um Template aprovado.',
        'error',
        10000 // 10 segundos
      );
    } 
    // Token expirado
    else if (errorMsg.includes('expirado') || errorMsg.includes('expired')) {
      showNotification(
        ' Token de acesso expirado! Acesse as Configurações -> WhatsApp e atualize o Access Token.',
        'error',
        8000
      );
    } 
    // Outros erros
    else {
      showNotification(errorMsg, 'error', 6000);
    }
    
    input.disabled = false;
    const sendBtn = document.getElementById('whatsapp-send-btn');
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="bi bi-send-fill"></i>';
    }
  }
}

/**
 * Transfere chat
 *  NOVO: Suporte para transferência para departamento OU agente específico
 */
export async function transferChat() {
  if (!uiState.currentChatId) {
    showNotification('Selecione uma conversa primeiro.', 'warning');
    return;
  }

  const panel = document.getElementById(ACTION_PANEL_IDS.TRANSFER);
  const panelBody = document.getElementById('whatsapp-transfer-panel-body');
  const confirmBtn = document.getElementById('whatsapp-confirm-transfer-btn');
  const transferForm = document.getElementById('whatsapp-transfer-form');

  if (!panel || !panelBody || !confirmBtn || !transferForm) {
    console.error('[whatsappUI] Painel de transferência não encontrado no DOM');
    showNotification('Não foi possível abrir o painel de transferência.', 'error');
    return;
  }

  const departments = getAvailableWhatsAppDepartments();
  const currentDepartment = uiState.currentChat?.department || '';
  const departmentOptions = departments.map((dept) => {
    const value = escapeHtml(dept);
    const selected = dept === currentDepartment ? 'selected' : '';
    return `<option value="${value}" ${selected}>${value}</option>`;
  }).join('');

  panelBody.innerHTML = `
    <div class="mb-3">
      <label class="form-label fw-semibold">
        <i class="bi bi-arrow-left-right me-1"></i>
        Tipo de Transferência
      </label>
      <div class="btn-group w-100" role="group">
        <input type="radio" class="btn-check" name="transfer-type" id="transfer-type-dept" value="department" checked>
        <label class="btn btn-outline-primary" for="transfer-type-dept">
          <i class="bi bi-diagram-3 me-1"></i>
          Departamento
        </label>
        <input type="radio" class="btn-check" name="transfer-type" id="transfer-type-agent" value="agent">
        <label class="btn btn-outline-primary" for="transfer-type-agent">
          <i class="bi bi-person me-1"></i>
          Agente Específico
        </label>
      </div>
    </div>

    <div id="transfer-department-section">
      <div class="mb-3">
        <label for="transfer-department-select" class="form-label">
          Transferir para departamento <span class="text-danger">*</span>
        </label>
        <select class="form-select" id="transfer-department-select" required>
          <option value="">Selecione um departamento</option>
          ${departmentOptions}
        </select>
        <div class="invalid-feedback">
          Selecione um departamento válido.
        </div>
      </div>
    </div>

    <div id="transfer-agent-section" class="d-none">
      <div class="mb-3">
        <label for="transfer-agent-department-select" class="form-label">
          Departamento do agente <span class="text-danger">*</span>
        </label>
        <select class="form-select" id="transfer-agent-department-select">
          <option value="">Selecione um departamento</option>
          ${departmentOptions}
        </select>
        <div class="invalid-feedback">
          Selecione um departamento.
        </div>
      </div>

      <div class="mb-3">
        <label for="transfer-agent-select" class="form-label">
          Agente <span class="text-danger">*</span>
        </label>
        <select class="form-select" id="transfer-agent-select" required disabled>
          <option value="">Primeiro selecione um departamento</option>
        </select>
        <div class="invalid-feedback">
          Selecione um agente válido.
        </div>
        <div id="transfer-agent-loading" class="d-none small text-muted mt-1">
          <span class="spinner-border spinner-border-sm me-1"></span>
          Carregando agentes...
        </div>
      </div>

      <div class="mb-3">
        <label for="transfer-notes" class="form-label">
          Observações (opcional)
        </label>
        <textarea class="form-control" id="transfer-notes" rows="2" 
                  placeholder="Adicione informações úteis para o próximo agente..."></textarea>
      </div>
    </div>
  `;

  transferForm.classList.remove('was-validated');

  //  Event listeners para alternar entre departamento/agente
  const typeRadios = panelBody.querySelectorAll('input[name="transfer-type"]');
  const deptSection = document.getElementById('transfer-department-section');
  const agentSection = document.getElementById('transfer-agent-section');
  const deptSelect = document.getElementById('transfer-department-select');
  const agentDeptSelect = document.getElementById('transfer-agent-department-select');
  const agentSelect = document.getElementById('transfer-agent-select');
  const agentLoading = document.getElementById('transfer-agent-loading');

  typeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'department') {
        deptSection.classList.remove('d-none');
        agentSection.classList.add('d-none');
        deptSelect.required = true;
        agentDeptSelect.required = false;
        agentSelect.required = false;
      } else {
        deptSection.classList.add('d-none');
        agentSection.classList.remove('d-none');
        deptSelect.required = false;
        agentDeptSelect.required = true;
        agentSelect.required = true;
      }
      transferForm.classList.remove('was-validated');
    });
  });

  //  Carregar agentes quando departamento for selecionado
  agentDeptSelect.addEventListener('change', async (e) => {
    const selectedDept = e.target.value;
    
    if (!selectedDept) {
      agentSelect.innerHTML = '<option value="">Primeiro selecione um departamento</option>';
      agentSelect.disabled = true;
      return;
    }

    agentLoading.classList.remove('d-none');
    agentSelect.disabled = true;

    try {
      const agents = await whatsappService.getAvailableAgents(selectedDept);
      
      if (agents.length === 0) {
        agentSelect.innerHTML = '<option value="">Nenhum agente disponível neste departamento</option>';
      } else {
        const options = agents.map(agent => {
          const chatsInfo = agent.activeChats ? ` (${agent.activeChats} conversas ativas)` : '';
          return `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}${chatsInfo}</option>`;
        }).join('');
        agentSelect.innerHTML = `<option value="">Selecione um agente</option>${options}`;
      }
      
      agentSelect.disabled = false;
    } catch (err) {
      console.error('[whatsappUI] Erro ao carregar agentes:', err);
      agentSelect.innerHTML = '<option value="">Erro ao carregar agentes</option>';
      showNotification('Erro ao carregar lista de agentes.', 'error');
    } finally {
      agentLoading.classList.add('d-none');
    }
  });

  showActionPanel(ACTION_PANEL_IDS.TRANSFER, {
    focusSelector: '#transfer-type-dept'
  });

  confirmBtn.onclick = async () => {
    if (!uiState.currentChatId) {
      showNotification('Nenhuma conversa ativa para transferir.', 'warning');
      return;
    }

    const transferType = document.querySelector('input[name="transfer-type"]:checked')?.value;

    if (!transferForm.checkValidity()) {
      transferForm.classList.add('was-validated');
      showNotification('Preencha todos os campos obrigatórios.', 'warning');
      return;
    }

    try {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Transferindo...';

      if (transferType === 'department') {
        const department = deptSelect.value.trim();
        
        if (window.__DEBUG__) {
          console.log('[whatsappUI]  Transferindo para departamento:', {
            chatId: uiState.currentChatId,
            department,
            currentAgent: uiState.currentChat?.agentName
          });
        }
        
        await whatsappService.transferChat(uiState.currentChatId, department);
        showNotification(`Conversa transferida para o departamento "${department}".`, 'success');
      } else {
        const agentId = agentSelect.value;
        const agentName = agentSelect.selectedOptions[0]?.textContent?.split('(')[0].trim() || 'agente';
        const notes = document.getElementById('transfer-notes')?.value.trim() || '';
        
        if (window.__DEBUG__) {
          console.log('[whatsappUI]  Transferindo para agente específico:', {
            chatId: uiState.currentChatId,
            fromAgent: uiState.currentChat?.agentName,
            toAgent: agentName,
            toAgentId: agentId,
            notes
          });
        }
        
        await whatsappService.transferChatToAgent(uiState.currentChatId, agentId, notes);
        
        if (window.__DEBUG__) {
          console.log('[whatsappUI]  Transferência concluída com sucesso');
        }
        
        showNotification(`Conversa transferida para ${agentName}.`, 'success');
      }

      hideActionPanel(ACTION_PANEL_IDS.TRANSFER);

      // Limpar conversa atual
      uiState.currentChatId = null;
      uiState.currentChat = null;
      uiState.currentContract = null;
      if (uiState.messagesListener) {
        uiState.messagesListener();
        uiState.messagesListener = null;
      }

      // Ocultar painel de chat e mostrar estado vazio
      document.getElementById('whatsapp-chat-panel')?.classList.add('d-none');
      document.getElementById('whatsapp-empty-state')?.classList.remove('d-none');

      await loadAgentChats();
    } catch (err) {
      console.error('[whatsappUI] Erro ao transferir:', err);
      showNotification('Erro ao transferir conversa: ' + (err.message || 'Erro desconhecido'), 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Confirmar Transferência';
    }
  };
}

/**
 * Finaliza conversa
 */
export async function resolveChat() {
  if (!uiState.currentChatId) {
    console.warn('[whatsappUI]  Nenhum chat ativo para finalizar');
    showNotification('Selecione uma conversa primeiro', 'warning');
    return;
  }

  const panel = document.getElementById(ACTION_PANEL_IDS.RESOLVE);
  const form = document.getElementById('whatsapp-resolve-form');
  const confirmBtn = document.getElementById('whatsapp-confirm-resolve-btn');

  if (!panel || !form || !confirmBtn) {
    console.error('[whatsappUI] Painel de finalização não encontrado no DOM');
    showNotification('Não foi possível abrir o painel de finalização.', 'error');
    return;
  }

  // Limpar valores anteriores
  document.getElementById('whatsapp-resolution-reason').value = 'Problema resolvido';
  document.getElementById('whatsapp-resolution-notes').value = '';
  document.querySelectorAll('input[name="whatsapp-satisfaction"]').forEach(input => {
    input.checked = false;
  });

  form.classList.remove('was-validated');

  showActionPanel(ACTION_PANEL_IDS.RESOLVE, {
    focusSelector: '#whatsapp-resolution-reason'
  });

  // Configurar botão de confirmação
  confirmBtn.onclick = async () => {
    if (!uiState.currentChatId) {
      showNotification('Nenhuma conversa ativa para finalizar.', 'warning');
      return;
    }

    const reason = document.getElementById('whatsapp-resolution-reason').value;
    const notes = document.getElementById('whatsapp-resolution-notes').value;
    const satisfaction = document.querySelector('input[name="whatsapp-satisfaction"]:checked')?.value;

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      showNotification('Selecione um motivo para continuar.', 'warning');
      return;
    }

    try {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Finalizando...';

      await whatsappService.resolveChat(uiState.currentChatId, notes, reason);
      
      // Se houver avaliação de satisfação, salvar
      if (satisfaction) {
        await whatsappService.updateChatCustomFields(uiState.currentChatId, {
          satisfactionScore: parseInt(satisfaction)
        });
      }

      showNotification('Conversa finalizada com sucesso', 'success');
      
      hideActionPanel(ACTION_PANEL_IDS.RESOLVE);
      
      // Fechar chat
      uiState.currentChatId = null;
      uiState.currentChat = null;
      uiState.currentContract = null;
      if (uiState.messagesListener) {
        uiState.messagesListener();
        uiState.messagesListener = null;
      }
      
      await loadAgentChats();
    } catch (err) {
      console.error('[whatsappUI] Erro ao finalizar:', err);
      showNotification('Erro ao finalizar conversa', 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Finalizar Atendimento';
    }
  };
}

/**
 * Abre painel de gerenciamento de tags
 */
async function openTagsPanel() {
  if (!uiState.currentChatId) {
    console.warn('[whatsappUI]  Nenhum chat ativo para gerenciar tags');
    showNotification('Selecione uma conversa primeiro', 'warning');
    return;
  }

  const panel = document.getElementById(ACTION_PANEL_IDS.TAGS);
  const listContainer = document.getElementById('whatsapp-tags-list');
  const searchInput = document.getElementById('whatsapp-tags-search');
  const counterDiv = document.getElementById('whatsapp-tags-counter');
  const counterText = document.getElementById('whatsapp-tags-counter-text');
  const createBtn = document.getElementById('whatsapp-create-tag-btn');

  if (!panel || !listContainer) {
    console.error('[whatsappUI] Painel de tags não encontrado no DOM');
    showNotification('Não foi possível abrir o painel de tags.', 'error');
    return;
  }

  // Função para renderizar tags
  const renderTags = async (searchTerm = '') => {
    try {
      // Mostrar loading
      listContainer.innerHTML = '<div class="text-center text-muted py-3"><small>Carregando tags...</small></div>';

      // Buscar chat atual e suas tags
      let tagsBackend;
      try {
        tagsBackend = await waitForTagsBackend();
      } catch (backendErr) {
        console.warn('[whatsappUI] Falha ao inicializar backend de tags:', backendErr);
        listContainer.innerHTML = '<div class="alert alert-danger small">Backend de tags indisponível</div>';
        return;
      }

      const chat = await whatsappService.getChatById(uiState.currentChatId, { forceRefresh: true });
      const chatTags = chat?.tags || [];

      // Garantir que o cache de tags esteja carregado
      if (!window.__TAGS_CACHE__ || Object.keys(window.__TAGS_CACHE__).length === 0) {
        await preloadTagsCache();
      }

      // Buscar todas as tags ativas do cache
      let allTags = Object.values(window.__TAGS_CACHE__ || {})
        .filter(tag => tag && tag.isActive !== false)
        .sort((a, b) => a.name.localeCompare(b.name));

      // Se ainda não houver tags no cache, tentar carregar diretamente do backend
      if (allTags.length === 0) {
        const backendTags = await tagsBackend.listTags(true);
        backendTags.forEach(tag => {
          if (!window.__TAGS_CACHE__) window.__TAGS_CACHE__ = {};
          window.__TAGS_CACHE__[tag.id] = tag;
        });

        allTags = Object.values(window.__TAGS_CACHE__ || {})
          .filter(tag => tag && tag.isActive !== false)
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      // Filtrar por busca
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        allTags = allTags.filter(tag => 
          tag.name.toLowerCase().includes(term) ||
          (tag.description && tag.description.toLowerCase().includes(term))
        );
      }

      if (allTags.length === 0) {
        listContainer.innerHTML = '<div class="alert alert-info small">Nenhuma tag encontrada</div>';
        updateTagCounter(0);
        return;
      }

      // Renderizar checkboxes
      const checkboxesHtml = allTags.map(tag => {
        const isChecked = chatTags.includes(tag.id);
        return `
          <div class="form-check mb-2 p-2 border rounded">
            <input 
              class="form-check-input" 
              type="checkbox" 
              id="tag-${tag.id}" 
              ${isChecked ? 'checked' : ''}
              data-tag-id="${tag.id}"
            >
            <label class="form-check-label d-flex align-items-center gap-2 w-100" for="tag-${tag.id}" style="cursor: pointer;">
              <span class="badge" style="background-color: ${tag.color}; color: white;">
                ${escapeHtml(tag.name)}
              </span>
              ${tag.description ? `<small class="text-muted">${escapeHtml(tag.description)}</small>` : ''}
            </label>
          </div>
        `;
      }).join('');

      listContainer.innerHTML = checkboxesHtml;

      // Atualizar contador
      updateTagCounter(chatTags.length);

      // Configurar listeners nos checkboxes
      listContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
          const tagId = e.target.dataset.tagId;
          const isChecked = e.target.checked;
          await handleTagToggle(uiState.currentChatId, tagId, isChecked);
          
          // Atualizar contador
          const newChat = await whatsappService.getChatById(uiState.currentChatId, { forceRefresh: true });
          updateTagCounter(newChat?.tags?.length || 0);
        });
      });

    } catch (error) {
      console.error('[whatsappUI] Erro ao renderizar tags:', error);
      listContainer.innerHTML = '<div class="alert alert-danger small">Erro ao carregar tags</div>';
    }
  };

  // Função para atualizar contador de tags
  const updateTagCounter = (count) => {
    if (!counterDiv || !counterText) return;
    
    if (count === 0) {
      counterText.textContent = 'Nenhuma tag aplicada';
      counterDiv.classList.remove('alert-success');
      counterDiv.classList.add('alert-info');
    } else {
      counterText.textContent = `${count} tag${count > 1 ? 's' : ''} aplicada${count > 1 ? 's' : ''}`;
      counterDiv.classList.remove('alert-info');
      counterDiv.classList.add('alert-success');
    }
    
    counterDiv.classList.remove('d-none');
  };

  // Configurar busca
  if (searchInput) {
    searchInput.value = '';
    searchInput.addEventListener('input', (e) => {
      renderTags(e.target.value);
    });
  }

  // Configurar botão de criar nova tag
  if (createBtn) {
    createBtn.onclick = () => {
      // Abrir modal de criação de tags (se houver whatsappTagsUI)
      if (window.__WHATSAPP_TAGS_UI__?.openCreateModal) {
        window.__WHATSAPP_TAGS_UI__.openCreateModal();
      } else {
        // Fallback: abrir config modal na aba de tags
        document.getElementById('whatsapp-config-btn')?.click();
        setTimeout(() => document.getElementById('whatsapp-tags-tab')?.click(), 100);
      }
    };
  }

  // Renderizar tags inicialmente
  await renderTags();

  // Abrir painel
  showActionPanel(ACTION_PANEL_IDS.TAGS, {
    focusSelector: '#whatsapp-tags-search'
  });
}

/**
 *  NOVO: Inicia chamada de voz
 */
async function startVoiceCall() {
  if (!uiState.currentChatId || !uiState.currentChat) {
    showNotification('Selecione uma conversa primeiro', 'warning');
    return;
  }

  try {
    const phoneNumber = uiState.currentChat.numero;
    
    if (!phoneNumber) {
      showNotification('Número de telefone não disponível', 'error');
      return;
    }

    // Inicializar sistema de chamadas se ainda não foi
    if (!window.__WHATSAPP_CALLS_INITIALIZED__) {
      const success = await whatsappCalls.initCallSystem();
      if (!success) {
        showNotification('Sistema de chamadas não disponível neste navegador', 'error');
        return;
      }
      window.__WHATSAPP_CALLS_INITIALIZED__ = true;
    }

    showNotification('Iniciando chamada de voz...', 'info');
    
    await whatsappCalls.startVoiceCall(uiState.currentChatId, phoneNumber);
    
  } catch (err) {
    console.error('[whatsappUI] Erro ao iniciar chamada de voz:', err);
    showNotification(err.message || 'Erro ao iniciar chamada de voz', 'error');
  }
}

/**
 *  NOVO: Inicia chamada de vídeo
 */
async function startVideoCall() {
  if (!uiState.currentChatId || !uiState.currentChat) {
    showNotification('Selecione uma conversa primeiro', 'warning');
    return;
  }

  try {
    const phoneNumber = uiState.currentChat.numero;
    
    if (!phoneNumber) {
      showNotification('Número de telefone não disponível', 'error');
      return;
    }

    // Inicializar sistema de chamadas se ainda não foi
    if (!window.__WHATSAPP_CALLS_INITIALIZED__) {
      const success = await whatsappCalls.initCallSystem();
      if (!success) {
        showNotification('Sistema de chamadas não disponível neste navegador', 'error');
        return;
      }
      window.__WHATSAPP_CALLS_INITIALIZED__ = true;
    }

    showNotification('Iniciando chamada de vídeo...', 'info');
    
    await whatsappCalls.startVideoCall(uiState.currentChatId, phoneNumber);
    
  } catch (err) {
    console.error('[whatsappUI] Erro ao iniciar chamada de vídeo:', err);
    showNotification(err.message || 'Erro ao iniciar chamada de vídeo', 'error');
  }
}

/**
 * Abre modal de registro de agente
 */
export function openAgentRegistration() {
  const departments = getAvailableWhatsAppDepartments();
  
  const html = `
    <div class="mb-3">
      <label class="form-label">Nome:</label>
      <input type="text" class="form-control" id="agent-name-input" placeholder="Seu nome">
    </div>
    <div class="mb-3">
      <label class="form-label">Departamento:</label>
      <select class="form-select" id="agent-department-select">
        <option value="">Selecione seu departamento</option>
        ${departments.map(dept => `<option value="${dept}">${dept}</option>`).join('')}
      </select>
    </div>
  `;

  const modalEl = document.getElementById('whatsapp-agent-modal');
  if (!modalEl) {
    console.error('[whatsappUI] Modal de agente não encontrado');
    return;
  }

  document.getElementById('whatsapp-agent-modal-body').innerHTML = html;
  
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: true });
  modal.show();

  document.getElementById('whatsapp-save-agent-btn').onclick = async () => {
    const name = document.getElementById('agent-name-input').value.trim();
    const department = document.getElementById('agent-department-select').value;

    if (!name || !department) {
      showNotification('Preencha todos os campos', 'warning');
      return;
    }

    try {
      await whatsappService.registerAgent({ name, department });
      showNotification('Agente registrado com sucesso', 'success');
      modal.hide();
      uiState.agentRegistered = true;
      initWhatsAppUI();
    } catch (err) {
      console.error('[whatsappUI] Erro ao registrar agente:', err);
      showNotification('Erro ao registrar agente', 'error');
    }
  };
}

/**
 * Carrega fila de departamento
 */
export async function loadDepartmentQueue(department) {
  try {
    const queue = await whatsappService.getDepartmentQueue(department);
    renderQueue(queue);
  } catch (err) {
    console.error('[whatsappUI] Erro ao carregar fila:', err);
  }
}

/**
 * Renderiza fila
 */
function renderQueue(queue, options = {}) {
  const container = document.getElementById('whatsapp-queue-list');
  if (!container) return;

  const { persist = true } = options;
  const baseQueue = Array.isArray(queue) ? [...queue] : [];

  if (persist) {
    uiState.availableQueue = [...baseQueue];
  }

  const sourceQueue = persist ? uiState.availableQueue : baseQueue;
  const filteredQueue = filterChatsBySearch(sourceQueue, uiState.chatSearchTerm);

  updateSearchSummary(filteredQueue.length, sourceQueue.length);
  updateChatCounter(filteredQueue.length, sourceQueue.length, uiState.chatSearchTerm);

  if (sourceQueue.length === 0) {
    container.innerHTML = '<p class="text-center text-muted">Nenhuma conversa na fila</p>';
    return;
  }

  if (filteredQueue.length === 0) {
    container.innerHTML = `
      <div class="alert alert-light border rounded shadow-sm mt-3" role="status">
        <div class="d-flex flex-column flex-sm-row align-items-sm-center gap-3">
          <div class="flex-grow-1">
            <h6 class="mb-1"><i class="bi bi-search me-2"></i>Fila sem resultados</h6>
            <p class="mb-0 text-muted small">Nenhum atendimento na fila corresponde ao filtro aplicado.</p>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-role="clear-search">
            <i class="bi bi-arrow-counterclockwise me-1"></i>Limpar busca
          </button>
        </div>
      </div>
    `;

    container.querySelector('[data-role="clear-search"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      clearChatSearch();
    });

    return;
  }

  container.innerHTML = filteredQueue.map(chat => {
    const phoneRaw = chat.numero || chat.phoneNumber || chat.phone || chat.from;
    const formattedNumber = formatPhoneNumber(phoneRaw);
    const displayName = chat.customerName || chat.displayName || formattedNumber;
    const waitingSince = resolveWaitingQueueTimestamp(chat);
    const waitingLabel = waitingSince
      ? `Aguardando há ${getWaitingTime(waitingSince)}`
      : 'Tempo de espera indisponível';

    return `
    <div class="queue-item card mb-2" style="cursor: pointer;" onclick="window.__WHATSAPP_UI__.openChat('${chat.id}', { previewMode: true })">
      <div class="card-body p-2">
        <div class="d-flex justify-content-between align-items-start">
          <div class="flex-grow-1">
            <strong>${escapeHtml(displayName)}</strong>
            ${displayName !== formattedNumber ? `<div class="small text-muted">${escapeHtml(formattedNumber)}</div>` : ''}
            ${chat.lastMessageText ? `<p class="mb-1 text-muted small">${escapeHtml(chat.lastMessageText.substring(0, 60))}${chat.lastMessageText.length > 60 ? '...' : ''}</p>` : ''}
            <div class="mt-1">
              ${chat.contractId ? `<span class="badge bg-info">Processo</span> ` : ''}
              ${chat.phoneNumberDisplay ? `<span class="badge bg-success"><i class="bi bi-telephone"></i> ${chat.phoneNumberDisplay}</span> ` : ''}
              ${chat.department ? `<span class="badge bg-secondary">${chat.department}</span>` : ''}
            </div>
            <small class="text-muted d-block mt-1">
              <i class="bi bi-clock"></i> ${waitingLabel}
            </small>
          </div>
          <div class="d-flex flex-column gap-1" style="min-width: 100px;">
            <button class="btn btn-sm btn-outline-primary" 
                    onclick="event.stopPropagation(); window.__WHATSAPP_UI__.openChat('${chat.id}', { previewMode: true })" 
                    title="Visualizar conversa">
              <i class="bi bi-eye"></i> Visualizar
            </button>
            <button class="btn btn-sm btn-primary" 
                    onclick="event.stopPropagation(); window.__WHATSAPP_UI__.assignChatToMe('${chat.id}')" 
                    title="Assumir conversa imediatamente">
              <i class="bi bi-person-check"></i> Assumir
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

/**
 * Atribui chat ao agente atual
 */
export async function assignChatToMe(chatId) {
  try {
    await whatsappService.assignChatToAgent(chatId);
    showNotification('Conversa atribuída', 'success');
    openChat(chatId);
    loadAgentChats();
  } catch (err) {
    console.error('[whatsappUI] Erro ao atribuir chat:', err);
    showNotification(err.message || 'Erro ao atribuir conversa', 'error');
  }
}

/**
 * Inicia listener de conversas do agente
 */
function startChatsListener() {
  if (uiState.chatsListener) {
    uiState.chatsListener();
  }

  const listenerAgentId = resolveSelectedAgentFilterId();

  if (uiState.isAdmin && !listenerAgentId) {
    uiState.chatsListener = null;
  } else {
    uiState.chatsListener = whatsappService.listenToAgentChats(listenerAgentId, chats => {
      if (uiState.chatFilter === 'waiting') return;

      renderChatsList(chats);
      
      //  NOVO: Atualizar métricas quando chats mudam
      updateSidebarMetrics();
    });
  }
  
  //  OTIMIZAÇÃO 24/11/2025: Intervalo aumentado para 2 minutos (era 30s)
  if (uiState.metricsInterval) {
    clearInterval(uiState.metricsInterval);
  }
  
  uiState.metricsInterval = setInterval(() => {
    updateSidebarMetrics();
  }, 120000); // 2 minutos
}

function startWaitingQueueListener() {
  stopWaitingQueueListener();

  uiState.waitingListener = whatsappService.listenToWaitingChats(null, queue => {
    if (uiState.chatFilter !== 'waiting') {
      return;
    }

    const chatList = document.getElementById('whatsapp-chats-list');
    const queueList = document.getElementById('whatsapp-queue-list');

    if (chatList) {
      chatList.style.display = 'none';
      chatList.classList.add('d-none');
    }

    if (queueList) {
      queueList.style.display = 'block';
      queueList.classList.remove('d-none');
    }

    const agentFilterId = resolveSelectedAgentFilterId();
    const filteredQueue = agentFilterId
      ? queue.filter(chat => resolveChatAgentId(chat) === agentFilterId)
      : queue;

    renderQueue(filteredQueue);
    
    //  NOVO: Atualizar métricas quando fila muda
    updateSidebarMetrics();
  });
}

function stopWaitingQueueListener() {
  if (uiState.waitingListener) {
    uiState.waitingListener();
    uiState.waitingListener = null;
  }
}

/**
 * Atualiza contador de chats
 */
function updateChatCounter() {
  updateMainSidebarWhatsAppBadges(
    uiState.sidebarBadges.waiting,
    uiState.sidebarBadges.activeMine
  );
}

/**
 * Popula dropdown de tags com checkboxes
 */
async function populateTagsDropdown(chatId) {
  const listContainer = document.getElementById('tags-dropdown-list');
  if (!listContainer) return;

  try {
    // Mostrar loading
    listContainer.innerHTML = '<li class="dropdown-item-text text-muted small">Carregando...</li>';

    // Buscar chat atual para ver tags aplicadas
    let tagsBackend;
    try {
      tagsBackend = await waitForTagsBackend();
    } catch (backendErr) {
      console.warn('[WhatsApp UI] Falha ao inicializar backend de tags:', backendErr);
      listContainer.innerHTML = `
        <li class="dropdown-item-text text-danger small">
          Backend de tags indisponível
        </li>
      `;
      return;
    }

    const chat = await whatsappService.getChatById(chatId, { forceRefresh: true });
    const chatTags = chat?.tags || [];

    // Garantir que o cache de tags esteja carregado
    if (!window.__TAGS_CACHE__ || Object.keys(window.__TAGS_CACHE__).length === 0) {
      await preloadTagsCache();
    }

    // Buscar todas as tags ativas do cache
    const allTags = Object.values(window.__TAGS_CACHE__ || {})
      .filter(tag => tag && tag.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Se ainda não houver tags no cache, tentar carregar diretamente do backend
    if (allTags.length === 0) {
      const backendTags = await tagsBackend.listTags(true);
      backendTags.forEach(tag => {
        if (!window.__TAGS_CACHE__) window.__TAGS_CACHE__ = {};
        window.__TAGS_CACHE__[tag.id] = tag;
      });

      const refreshedTags = Object.values(window.__TAGS_CACHE__ || {})
        .filter(tag => tag && tag.isActive !== false)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (refreshedTags.length > 0) {
        listContainer.innerHTML = refreshedTags.map(tag => {
          const isChecked = chatTags.includes(tag.id);
          return `
            <li>
              <label class="dropdown-item d-flex align-items-center" style="cursor: pointer;" data-tag-id="${tag.id}">
                <input 
                  type="checkbox" 
                  class="form-check-input me-2" 
                  ${isChecked ? 'checked' : ''}
                  data-tag-id="${tag.id}"
                  onchange="window.__WHATSAPP_UI__.handleTagToggle('${chatId}', '${tag.id}', this.checked)"
                >
                <span class="badge me-2" style="background-color: ${tag.color}; color: white;">
                  ${escapeHtml(tag.name)}
                </span>
                ${tag.description ? `<small class="text-muted">${escapeHtml(tag.description)}</small>` : ''}
              </label>
            </li>
          `;
        }).join('');
        return;
      }
    }

    if (allTags.length === 0) {
      listContainer.innerHTML = `
        <li class="dropdown-item-text text-muted small">
          Nenhuma tag disponível
        </li>
      `;
      return;
    }

    // Renderizar checkboxes
    const checkboxesHtml = allTags.map(tag => {
      const isChecked = chatTags.includes(tag.id);
      return `
        <li>
          <label class="dropdown-item d-flex align-items-center" style="cursor: pointer;" data-tag-id="${tag.id}">
            <input 
              type="checkbox" 
              class="form-check-input me-2" 
              ${isChecked ? 'checked' : ''}
              data-tag-id="${tag.id}"
              onchange="window.__WHATSAPP_UI__.handleTagToggle('${chatId}', '${tag.id}', this.checked)"
            >
            <span class="badge me-2" style="background-color: ${tag.color}; color: white;">
              ${escapeHtml(tag.name)}
            </span>
            ${tag.description ? `<small class="text-muted">${escapeHtml(tag.description)}</small>` : ''}
          </label>
        </li>
      `;
    }).join('');

    listContainer.innerHTML = checkboxesHtml;

  } catch (error) {
    console.error('[WhatsApp UI] Erro ao popular dropdown de tags:', error);
    listContainer.innerHTML = `
      <li class="dropdown-item-text text-danger small">
        Erro ao carregar tags
      </li>
    `;
  }
}

/**
 * Filtra tags no dropdown com base na busca
 */
function filterTagsDropdown(searchTerm) {
  const listContainer = document.getElementById('tags-dropdown-list');
  if (!listContainer) return;

  const term = searchTerm.toLowerCase().trim();
  const items = listContainer.querySelectorAll('li');

  items.forEach(item => {
    const label = item.querySelector('label');
    if (!label) return;

    const tagName = label.querySelector('.badge')?.textContent?.toLowerCase() || '';
    const tagDesc = label.querySelector('.text-muted')?.textContent?.toLowerCase() || '';

    const matches = tagName.includes(term) || tagDesc.includes(term);
    item.style.display = matches ? '' : 'none';
  });
}

/**
 * Adiciona ou remove tag de um chat
 */
async function handleTagToggle(chatId, tagId, checked) {
  if (!chatId || !tagId) return;

  try {
    const tagsBackend = window.__WHATSAPP_TAGS__;
    if (!tagsBackend) {
      console.error('[WhatsApp UI] Backend de tags não disponível');
      return;
    }

    if (checked) {
      await tagsBackend.addTagToChat(chatId, tagId);
      console.log(`[WhatsApp UI] Tag ${tagId} adicionada ao chat ${chatId}`);
    } else {
      await tagsBackend.removeTagFromChat(chatId, tagId);
      console.log(`[WhatsApp UI] Tag ${tagId} removida do chat ${chatId}`);
    }

    // Atualizar estado local da conversa atual
    if (uiState.currentChatId === chatId) {
      const refreshedChat = await whatsappService.getChatById(chatId, { forceRefresh: true });
      if (refreshedChat) {
        uiState.currentChat = { ...(uiState.currentChat || {}), ...refreshedChat };
        updateChatHeaderDisplay();
      }
    }

    // Recarregar lista de conversas para refletir as novas tags
    await loadAgentChats();

    // Manter dropdown sincronizado
    await populateTagsDropdown(chatId);

  } catch (error) {
    console.error('[WhatsApp UI] Erro ao alternar tag:', error);
    showNotification('Erro ao atualizar tag. Tente novamente.', 'error');
    
    // Reverter checkbox em caso de erro
    const checkbox = document.querySelector(`input[type="checkbox"][data-tag-id="${tagId}"]`);
    if (checkbox) {
      checkbox.checked = !checked;
    }
  }
}

/**
 * Inicializa validação Bootstrap em formulários de modais
 * @param {string} modalId - ID do modal a ser inicializado
 */
function initModalFormValidation(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) {
    if (window.__DEBUG__) console.warn(`[whatsappUI] Modal ${modalId} não encontrado para validação`);
    return;
  }
  
  const forms = modal.querySelectorAll('.needs-validation');
  forms.forEach(form => {
    form.addEventListener('submit', event => {
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
      form.classList.add('was-validated');
    }, false);
  });
  
  if (window.__DEBUG__) console.log(`[whatsappUI]  Validação inicializada para modal: ${modalId}`);
}

/**
 * Inicializa autocomplete de mensagens rápidas
 */
function initializeQuickMessagesAutocomplete() {
  const textarea = document.getElementById('whatsapp-message-input');
  if (!textarea) {
    console.warn('[WhatsApp UI] Textarea de mensagens não encontrado');
    return;
  }

  // Verificar se classe está disponível
  if (typeof WhatsAppQuickMessagesAutocomplete === 'undefined') {
    console.warn('[WhatsApp UI] WhatsAppQuickMessagesAutocomplete não disponível');
    return;
  }

  // Criar e inicializar instância
  const autocomplete = new WhatsAppQuickMessagesAutocomplete();
  autocomplete.init(textarea);
  
  // Expor globalmente
  window.__WHATSAPP_QUICK_MESSAGES_AUTOCOMPLETE__ = autocomplete;
  
  console.log('[WhatsApp UI] Autocomplete de mensagens rápidas inicializado');
}

/**
 * Bind eventos da interface
 */
function bindWhatsAppEvents() {
  initializeActionPanelListeners();

  const chatsSearchInput = document.getElementById('whatsapp-search-input');
  if (chatsSearchInput) {
    chatsSearchInput.value = uiState.chatSearchTerm;

    const scheduleSearchUpdate = (value, options = {}) => {
      const { immediate = false } = options;

      if (uiState.searchDebounceTimer) {
        clearTimeout(uiState.searchDebounceTimer);
        uiState.searchDebounceTimer = null;
      }

      if (immediate) {
        setChatSearchTerm(value);
        return;
      }

      uiState.searchDebounceTimer = setTimeout(() => {
        uiState.searchDebounceTimer = null;
        setChatSearchTerm(value);
      }, 200);
    };

    chatsSearchInput.addEventListener('input', (event) => {
      scheduleSearchUpdate(event.target.value || '');
    });

    chatsSearchInput.addEventListener('blur', () => {
      scheduleSearchUpdate(chatsSearchInput.value || '', { immediate: true });
    });

    chatsSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        clearChatSearch();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        scheduleSearchUpdate(event.target.value || '', { immediate: true });
      }
    });
  }

  //  NOVO: Event listener para filtro por agente (admin)
  const agentFilterSelect = document.getElementById('whatsapp-agent-filter');
  if (agentFilterSelect) {
    agentFilterSelect.addEventListener('change', () => {
      uiState.selectedAgentId = agentFilterSelect.value || 'all';

      startChatsListener();
      loadAgentChats();

      console.log('[whatsappUI] Filtro por agente:', uiState.selectedAgentId);
    });
  }

  const input = document.getElementById('whatsapp-message-input');
  if (input) {
    input.addEventListener('keypress', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  const audioBtn = document.getElementById('whatsapp-audio-btn');
  if (audioBtn) {
    audioBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        if (uiState.audioRecording?.active) {
          stopAudioRecording();
        } else {
          await startAudioRecording();
        }
      } catch (error) {
        console.error('[whatsappUI] Erro ao alternar gravação de áudio:', error);
        showNotification('Não foi possível controlar a gravação de áudio.', 'error');
      }
    });
  }

  document.getElementById('whatsapp-cancel-audio-btn')?.addEventListener('click', (event) => {
    event.preventDefault();
    cancelAudioRecording();
  });

  document.getElementById('whatsapp-send-audio-btn')?.addEventListener('click', async (event) => {
    event.preventDefault();
    await confirmSendRecordedAudio();
  });

  document.getElementById('whatsapp-discard-audio-btn')?.addEventListener('click', (event) => {
    event.preventDefault();
    discardRecordedAudioPreview();
  });

  updateAudioButtonUI(uiState.audioRecording?.active);
  renderAudioIndicator('hidden');
  initializeWhatsAppAudioPlayers(document.getElementById('whatsapp-audio-indicator'));

  document.getElementById('whatsapp-message-form')?.addEventListener('submit', sendMessage);
  document.getElementById('whatsapp-send-btn')?.addEventListener('click', sendMessage);

  document.getElementById('whatsapp-transfer-btn')?.addEventListener('click', transferChat);
  document.getElementById('whatsapp-resolve-btn')?.addEventListener('click', resolveChat);
  document.getElementById('whatsapp-tags-btn')?.addEventListener('click', openTagsPanel);
  
  //  NOVO: Event listeners para chamadas
  document.getElementById('whatsapp-voice-call-btn')?.addEventListener('click', startVoiceCall);
  document.getElementById('whatsapp-video-call-btn')?.addEventListener('click', startVideoCall);
  
  document.getElementById('whatsapp-new-chat-btn')?.addEventListener('click', openNewChatModal);

  const closeNewChatPanel = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const collapseEl = document.getElementById('whatsapp-new-chat-modal');
    const form = document.getElementById('whatsapp-new-chat-form');
    const confirmBtn = document.getElementById('whatsapp-start-chat-btn');
    if (form) {
      form.reset();
      form.classList.remove('was-validated');
    }
    if (confirmBtn) {
      confirmBtn.disabled = false;
      const defaultContent = confirmBtn.dataset.originalContent || '<i class="bi bi-send me-1"></i>Iniciar conversa';
      confirmBtn.innerHTML = defaultContent;
    }
    if (!collapseEl || !window.bootstrap?.Collapse) {
      return;
    }
    const collapseInstance = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
    collapseInstance.hide();
  };

  ['whatsapp-new-chat-cancel-btn', 'whatsapp-new-chat-close-btn'].forEach((id) => {
    const button = document.getElementById(id);
    if (!button) {
      return;
    }
    button.addEventListener('click', closeNewChatPanel);
  });
  document.getElementById('whatsapp-cancel-reply-btn')?.addEventListener('click', cancelReply);

  document.getElementById('whatsapp-view-contract-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    viewLinkedContract(e);
  });

  document.querySelectorAll('.whatsapp-link-contract-action').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      openContractLinkModal();
    });
  });

  document.getElementById('whatsapp-contract-open-btn')?.addEventListener('click', (event) => {
    event.preventDefault();
    viewLinkedContract(event);
  });

  document.getElementById('whatsapp-contract-unlink-btn')?.addEventListener('click', unlinkChatFromContract);

  document.getElementById('contract-link-search-form')?.addEventListener('submit', handleContractLinkSearch);

  document.getElementById('whatsapp-export-chat-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    exportChat();
  });

  document.getElementById('whatsapp-delete-chat-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    deleteChat();
  });

  // Configurar collapse de template
  setupTemplateCollapseListeners();

  const forwardForm = document.getElementById('whatsapp-forward-form');
  if (forwardForm) {
    forwardForm.addEventListener('submit', handleForwardFormSubmit);
  }

  document.getElementById('whatsapp-forward-confirm-btn')?.addEventListener('click', handleForwardFormSubmit);

  // Event listener para resetar estado quando o collapse for fechado
  const forwardCollapseEl = document.getElementById('whatsapp-forward-collapse');
  if (forwardCollapseEl) {
    forwardCollapseEl.addEventListener('hidden.bs.collapse', resetForwardState);
  }

  const forwardTargetSelect = document.getElementById('whatsapp-forward-target-select');
  if (forwardTargetSelect) {
    forwardTargetSelect.addEventListener('change', () => {
      forwardTargetSelect.setCustomValidity('');
      const phoneInput = document.getElementById('whatsapp-forward-phone');
      phoneInput?.setCustomValidity('');
    });
  }

  const forwardPhoneInput = document.getElementById('whatsapp-forward-phone');
  if (forwardPhoneInput) {
    forwardPhoneInput.addEventListener('input', () => {
      forwardPhoneInput.setCustomValidity('');
      const selectEl = document.getElementById('whatsapp-forward-target-select');
      selectEl?.setCustomValidity('');
    });
  }
  
  // Botões do painel de informações do cliente
  document.getElementById('whatsapp-edit-client-btn')?.addEventListener('click', toggleEditClientInfo);
  document.getElementById('whatsapp-save-client-btn')?.addEventListener('click', saveClientInfo);
  document.getElementById('whatsapp-cancel-edit-btn')?.addEventListener('click', cancelEditClientInfo);
  document.getElementById('whatsapp-save-notes-btn')?.addEventListener('click', saveQuickNotes);
  
  // Botões de anexos (header + inline)
  const attachmentButtonIds = ['whatsapp-attachment-btn', 'whatsapp-inline-attachment-btn'];
  attachmentButtonIds
    .map((id) => document.getElementById(id))
    .filter(Boolean)
    .forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();

        if (!uiState.currentChatId) {
          showNotification('Selecione uma conversa primeiro.', 'warning');
          return;
        }

        if (typeof window.__WHATSAPP_ATTACHMENTS__?.openModal === 'function') {
          await window.__WHATSAPP_ATTACHMENTS__.openModal(uiState.currentChatId);
        } else {
          console.error('[WhatsApp UI] Módulo de anexos não disponível.');
        }
      });
    });
  
  // Galeria de mídia - abrir painel de forma consistente
  const galleryBtn = document.getElementById('whatsapp-gallery-btn');
  if (galleryBtn) {
    galleryBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!uiState.currentChatId) {
        showNotification('Selecione uma conversa primeiro.', 'warning');
        return;
      }
      
      if (typeof window.__WHATSAPP_ATTACHMENTS__?.openGallery === 'function') {
        await window.__WHATSAPP_ATTACHMENTS__.openGallery(uiState.currentChatId);
      } else {
        console.error('[WhatsApp UI] Módulo de anexos não disponível. Execute whatsappAttachments.init() primeiro.');
      }
    });
  }

  // Tags dropdown - popular ao abrir
  const tagsDropdown = document.getElementById('whatsapp-tags-dropdown');
  if (tagsDropdown) {
    tagsDropdown.addEventListener('shown.bs.dropdown', async () => {
      if (!uiState.currentChatId) {
        console.warn('[WhatsApp UI] Nenhum chat selecionado para gerenciar tags');
        return;
      }
      await populateTagsDropdown(uiState.currentChatId);
    });
  }

  // Tags dropdown - busca/filtro
  const tagsSearch = document.getElementById('tags-search-dropdown');
  if (tagsSearch) {
    tagsSearch.addEventListener('input', (e) => {
      filterTagsDropdown(e.target.value);
    });
  }

  // Inicializar autocomplete de mensagens rápidas
  initializeQuickMessagesAutocomplete();
}

function openNewChatModal() {
  const collapseEl = document.getElementById('whatsapp-new-chat-modal');
  if (!collapseEl || !window.bootstrap?.Collapse) {
    return;
  }

  const collapseInstance = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
  collapseInstance.show();

  const form = document.getElementById('whatsapp-new-chat-form');
  const phoneInput = document.getElementById('whatsapp-new-chat-phone');
  const messageInput = document.getElementById('whatsapp-new-chat-message');
  const departmentSelect = document.getElementById('whatsapp-new-chat-department');
  const confirmBtn = document.getElementById('whatsapp-start-chat-btn');

  if (form) {
    form.reset();
    form.classList.remove('was-validated');
  }

  if (departmentSelect) {
    const departments = getAvailableWhatsAppDepartments();
    departmentSelect.innerHTML = ['<option value="">Selecionar departamento (opcional)</option>',
      ...departments.map(dept => `<option value="${dept}">${dept}</option>`)
    ].join('');
    departmentSelect.dataset.loaded = 'true';
    departmentSelect.value = '';
  }

  if (phoneInput) {
    phoneInput.value = '';
  }

  if (messageInput) {
    messageInput.value = '';
  }

  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i class="bi bi-send me-1"></i>Iniciar conversa';
    confirmBtn.onclick = () => startNewChat(collapseInstance);
  }

  setTimeout(() => phoneInput?.focus(), 150);
}

async function startNewChat(panelInstance) {
  const phoneInput = document.getElementById('whatsapp-new-chat-phone');
  const messageInput = document.getElementById('whatsapp-new-chat-message');
  const departmentSelect = document.getElementById('whatsapp-new-chat-department');
  const confirmBtn = document.getElementById('whatsapp-start-chat-btn');

  const phone = phoneInput?.value?.trim();
  const initialMessage = messageInput?.value?.trim() || '';
  const department = departmentSelect?.value || null;
  const selectedPhoneId = uiState.selectedPhoneNumberId !== 'all'
    ? uiState.selectedPhoneNumberId
    : null;
  const selectedPhone = selectedPhoneId
    ? uiState.availablePhones.find(phoneItem => phoneItem.phoneNumberId === selectedPhoneId)
    : null;

  if (!phone) {
    showNotification('Informe um número de telefone.', 'warning');
    phoneInput?.focus();
    return;
  }

  try {
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.dataset.originalContent = confirmBtn.dataset.originalContent || confirmBtn.innerHTML;
      confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Iniciando...';
    }

    const chatOptions = {
      initialMessage,
      department: department || null
    };

    if (selectedPhone) {
      chatOptions.phoneNumberId = selectedPhone.phoneNumberId || null;
      chatOptions.businessPhoneNumber = selectedPhone.phoneNumber || selectedPhone.id || null;
      chatOptions.phoneNumberDisplay = selectedPhone.displayName || null;
    }

    const chatId = await whatsappService.startChatWithNumber(phone, chatOptions);

    showNotification('Conversa iniciada com sucesso.', 'success');
    const form = document.getElementById('whatsapp-new-chat-form');
    form?.reset();
    form?.classList.remove('was-validated');
    if (panelInstance?.hide) {
      panelInstance.hide();
    }

    if (uiState.chatFilter === 'waiting') {
      setChatsFilter('all');
    }

    await loadAgentChats();
    await openChat(chatId);
  } catch (err) {
    console.error('[whatsappUI] Erro ao iniciar conversa:', err);
    showNotification(err.message || 'Erro ao iniciar conversa', 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      const defaultContent = confirmBtn.dataset.originalContent || '<i class="bi bi-send me-1"></i>Iniciar conversa';
      confirmBtn.innerHTML = defaultContent;
    }
  }
}

// Utilitários

function resolveTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object') {
    if (typeof value.seconds === 'number') {
      return new Date((value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1000000));
    }
    if (typeof value._seconds === 'number') {
      return new Date((value._seconds * 1000) + Math.floor((value._nanoseconds || 0) / 1000000));
    }
  }
  return null;
}

function resolveWaitingQueueTimestamp(chat) {
  if (!chat || typeof chat !== 'object') return null;

  return resolveTimestamp(
    chat.reopenedAt ||
    chat.createdAt ||
    chat.aprovacaoLeadCreatedAt ||
    chat.lastMessageTimestamp ||
    chat.updatedAt ||
    chat.lastBotUpdate
  );
}

function formatPhoneNumber(phone) {
  if (!phone) return null; // Retorna null ao invés de mensagem
  
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

function formatTime(date) {
  if (!date) return '';
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Agora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function getWaitingTime(date) {
  if (!date) return '?';
  const diff = Math.max(0, new Date() - date);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function getStatusColor(status) {
  const colors = {
    'novo': 'warning',
    'atribuido': 'primary',
    'aguardando': 'info',
    'resolvido': 'success',
    'transferido': 'secondary'
  };
  return colors[status] || 'secondary';
}

function formatStatusLabel(status) {
  if (!status) return '';

  const labels = {
    'novo': 'Novo',
    'atribuido': 'Atribuído',
    'aguardando': 'Aguardando',
    'resolvido': 'Resolvido',
    'transferido': 'Transferido'
  };

  return labels[status] || (status.charAt(0).toUpperCase() + status.slice(1));
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Reabre uma conversa finalizada
 */
export async function reopenChat(chatId) {
  let button = null;
  let originalHtml = '';
  
  try {
    if (!chatId) {
      throw new Error('ID da conversa não fornecido');
    }

    // Confirmar com o usuário (usa modal padronizado se disponível)
    const confirmed = window.uiHelpers
      ? await window.uiHelpers.confirmAction({ message: 'Deseja realmente reabrir esta conversa?' })
      : confirm('Deseja realmente reabrir esta conversa?');
    
    if (!confirmed) {
      return;
    }

    // Mostrar loading
    button = event?.target?.closest('button');
    originalHtml = button?.innerHTML || '';
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="bi bi-hourglass-split"></i> Reabrindo...';
    }

    // Chamar serviço
    const result = await whatsappService.reopenChat(chatId);

    if (result.success) {
      // Atualizar UI
      await loadAgentChats();
      
      // Abrir conversa reaberta
      await openChat(chatId);
      
      // Mostrar mensagem de sucesso
      showToast('success', 'Conversa reaberta com sucesso!');
    }
  } catch (err) {
    console.error('[whatsappUI] Erro ao reabrir conversa:', err);
    showToast('error', err.message || 'Erro ao reabrir conversa');
    
    // Restaurar botão
    if (button && originalHtml) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
}

/**
 * Mostra toast de notificação
 */
function showToast(type, message) {
  const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
  const icon = type === 'success' ? 'check-circle-fill' : 'exclamation-triangle-fill';

  const toast = document.createElement('div');
  toast.className = `alert ${alertClass} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
  toast.style.zIndex = '9999';
  toast.innerHTML = `
    <i class="bi bi-${icon} me-2"></i>
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 5000);
}

function normalizeSearchValue(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeDigits(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\D/g, '');
}

function isAutoLinkEnabled() {
  const flag = uiState.config?.autoLinkContracts;
  if (typeof flag === 'boolean') {
    return flag;
  }

  return true;
}

function collectChatPhoneCandidates(chat = {}) {
  const rawValues = new Set();

  const pushValue = (value) => {
    if (value === undefined || value === null) return;
    const str = String(value).trim();
    if (!str) return;
    rawValues.add(str);
  };

  const phoneKeys = [
    'numero',
    'phoneNumber',
    'phone',
    'from',
    'customerPhone',
    'customerPhoneNumber',
    'clienteTelefone',
    'telefoneCliente',
    'primaryPhone',
    'phoneNumberDisplay',
    'businessPhoneNumber',
    'waId',
    'rawPhoneNumber'
  ];

  phoneKeys.forEach((key) => pushValue(chat[key]));

  if (Array.isArray(chat.customerPhones)) {
    chat.customerPhones.forEach(pushValue);
  }

  if (Array.isArray(chat.phones)) {
    chat.phones.forEach(pushValue);
  }

  if (Array.isArray(chat.rawPhones)) {
    chat.rawPhones.forEach(pushValue);
  }

  const candidates = new Set();

  rawValues.forEach((raw) => {
    candidates.add(raw);

    const e164 = normalizePhoneToE164(raw, {
      keepOriginalOnFailure: false
    });
    if (e164) {
      candidates.add(e164);
    }

    const digits = normalizeDigits(raw);
    if (digits.length >= 8) {
      candidates.add(digits);

      if (!e164 && digits.length >= 10) {
        candidates.add(`+55${digits}`);
      }
    }
  });

  return Array.from(candidates).filter(Boolean);
}

async function attemptAutoLinkForCurrentChat() {
  const chat = uiState.currentChat;
  if (!chat || !chat.id) return null;
  if (chat.contractId) return null;
  const autoLinkState = uiState.autoLink;
  if (!autoLinkState) return null;

  const setAttempt = (payload) => {
    if (!autoLinkState) return;
    autoLinkState.lastAttempt = payload
      ? {
          chatId: chat.id,
          timestamp: Date.now(),
          ...payload
        }
      : null;
    updateContractInfoDisplay();
  };

  if (!isAutoLinkEnabled()) {
    setAttempt({ status: 'disabled' });
    return null;
  }

  if (autoLinkState.inProgress) return null;
  if (autoLinkState.attemptedChatIds.has(chat.id)) {
    updateContractInfoDisplay();
    return null;
  }

  autoLinkState.attemptedChatIds.add(chat.id);

  const phoneCandidates = collectChatPhoneCandidates(chat);
  if (phoneCandidates.length === 0) {
    setAttempt({ status: 'no-phone' });
    return null;
  }

  autoLinkState.inProgress = true;

  try {
    const matches = await whatsappService.findContractsByPhoneCandidates(phoneCandidates, {
      limit: 3,
      stopOnMultiple: true
    });

    if (!Array.isArray(matches) || matches.length === 0) {
      setAttempt({ status: 'not-found', candidates: phoneCandidates });
      return null;
    }

    if (matches.length > 1) {
      setAttempt({
        status: 'multiple',
        candidates: phoneCandidates,
        matches: matches.map((item) => ({
          id: item.id,
          cliente: item.clientePrincipal || item.cliente || item.nome || null,
          context: item.matchContext || []
        }))
      });

      if (window.__DEBUG__) {
        console.warn('[whatsappUI] Auto-link encontrou múltiplos processos para os telefones do chat', {
          chatId: chat.id,
          candidates: phoneCandidates,
          matches: matches.map((item) => item.id)
        });
      }
      return null;
    }

    const [match] = matches;
    const matchContext = Array.isArray(match.matchContext) ? [...match.matchContext] : [];
    const contractData = { ...match };
    delete contractData.matchContext;

    try {
      await linkChatToContractId(match.id, {
        contract: contractData,
        source: 'auto-link',
        silent: true
      });

      setAttempt({
        status: 'linked',
        contractId: match.id,
        candidates: phoneCandidates,
        matchContext,
        contractName: contractData.clientePrincipal || contractData.cliente || contractData.nome || null
      });

      showNotification('Conversa vinculada automaticamente ao processo correspondente.', 'success');
      return match;
    } catch (linkErr) {
      console.error('[whatsappUI] Falha ao vincular conversa automaticamente:', linkErr);
      setAttempt({
        status: 'error',
        candidates: phoneCandidates,
        message: linkErr?.message || 'Erro ao confirmar vínculo automático'
      });
      return null;
    }
  } catch (err) {
    console.error('[whatsappUI] Falha ao tentar auto-vincular processo:', err);
    setAttempt({
      status: 'error',
      message: err?.message || 'Erro inesperado na tentativa de auto-vínculo'
    });
  } finally {
    autoLinkState.inProgress = false;
  }

  return null;
}

function buildAutoLinkStatusHtml(chat) {
  if (!chat || !chat.id) return '';
  const autoLinkState = uiState.autoLink;
  if (!autoLinkState?.lastAttempt || autoLinkState.lastAttempt.chatId !== chat.id) {
    return '';
  }

  const attempt = autoLinkState.lastAttempt;
  if (!attempt?.status) return '';

  const timestamp = attempt.timestamp ? new Date(attempt.timestamp) : null;
  const timeLabel = timestamp && !Number.isNaN(timestamp.getTime())
    ? timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  const contexts = Array.isArray(attempt.matchContext) ? attempt.matchContext : [];
  const firstContext = contexts[0] || null;

  const matches = Array.isArray(attempt.matches) ? attempt.matches : [];

  let icon = 'info-circle';
  let textClass = 'text-muted';
  let message = '';

  switch (attempt.status) {
    case 'linked': {
      icon = 'check-circle';
      textClass = 'text-success';
      const contractName = attempt.contractName ? ` ao processo ${escapeHtml(attempt.contractName)}` : '';
      const timeText = timeLabel ? ` as ${timeLabel}` : '';
      const contextHint = firstContext?.field ? ` (campo ${escapeHtml(firstContext.field)})` : '';
      message = `Vinculado automaticamente${contractName}${timeText}${contextHint}.`;
      break;
    }
    case 'multiple': {
      icon = 'exclamation-triangle';
      textClass = 'text-warning';
      const total = matches.length || 2;
      const suggestions = matches
        .slice(0, 2)
        .map((match) => escapeHtml(match.cliente || match.id || 'processo'))
        .join(', ');
      const extra = matches.length > 2 ? '...' : '';
      message = `Encontramos ${total} processos possíveis${suggestions ? ` (${suggestions}${extra})` : ''}. Abra o painel "Vincular processo" para escolher manualmente.`;
      break;
    }
    case 'not-found': {
      icon = 'search';
      textClass = 'text-muted';
      message = 'Tentativa automática não encontrou processos correspondentes.';
      break;
    }
    case 'no-phone': {
      icon = 'telephone-x';
      textClass = 'text-muted';
      message = 'Nenhum telefone válido disponível para tentar vínculo automático.';
      break;
    }
    case 'disabled': {
      icon = 'slash-circle';
      textClass = 'text-muted';
      message = 'Auto-vínculo está desativado nas configurações do WhatsApp.';
      break;
    }
    case 'error': {
      icon = 'x-circle';
      textClass = 'text-danger';
      message = `Falha ao vincular automaticamente: ${escapeHtml(attempt.message || 'erro desconhecido')}.`;
      break;
    }
    default:
      return '';
  }

  return `<div class="small mt-2 ${textClass}"><i class="bi bi-${icon} me-1"></i>${message}</div>`;
}

async function refreshCurrentChat(forceRefresh = false) {
  if (!uiState.currentChatId) return null;

  try {
    const chatData = await whatsappService.getChatById(uiState.currentChatId, { forceRefresh });
    if (chatData) {
      uiState.currentChat = { id: uiState.currentChatId, ...chatData };
    } else {
      uiState.currentChat = { id: uiState.currentChatId };
    }

    updateClientInfoDisplay();
    updateQuickNotesField();
    await loadContractForCurrentChat();
    return uiState.currentChat;
  } catch (err) {
    console.error('[whatsappUI] Erro ao atualizar chat atual:', err);
    return null;
  }
}

async function loadContractForCurrentChat() {
  if (!uiState.currentChat?.contractId) {
    uiState.currentContract = null;
    updateContractInfoDisplay();
    // Tenta vincular automaticamente sem bloquear a renderização do chat
    Promise.resolve().then(() => attemptAutoLinkForCurrentChat()).catch((err) => {
      if (window.__DEBUG__) {
        console.warn('[whatsappUI] Auto-link assíncrono falhou:', err);
      }
    });
    return null;
  }

  try {
    const contract = await firestore.getContractById(uiState.currentChat.contractId);
    uiState.currentContract = contract;
  } catch (err) {
    console.error('[whatsappUI] Erro ao carregar processo vinculado:', err);
    uiState.currentContract = null;
  }

  updateContractInfoDisplay();
  return uiState.currentContract;
}

function updateContractInfoDisplay() {
  const content = document.getElementById('whatsapp-contract-content');
  const actions = document.getElementById('whatsapp-contract-actions');
  const linkButton = document.getElementById('whatsapp-link-contract-btn');
  const openBtn = document.getElementById('whatsapp-contract-open-btn');
  const unlinkBtn = document.getElementById('whatsapp-contract-unlink-btn');

  if (!content || !linkButton) return;

  const chat = uiState.currentChat;
  const contract = uiState.currentContract;

  if (chat?.contractId && contract) {
    const cliente = contract.clientePrincipal || contract.cliente || 'Cliente';
    const empreendimento = contract.empreendimento || '--';
    const responsavel = contract.vendedorConstrutora || contract.analista || '';
    const statusText = contract.status ? `Status: ${contract.status}` : 'Processo vinculado';
    const autoLinkHint = buildAutoLinkStatusHtml(chat);

    const extraInfo = [
      `<p class="mb-1"><strong>${escapeHtml(cliente)}</strong></p>`,
      `<p class="text-muted small mb-0">Empreendimento: ${escapeHtml(empreendimento)}</p>`,
      responsavel ? `<p class="text-muted small mb-0">Responsável: ${escapeHtml(responsavel)}</p>` : ''
    ].join('');

    content.innerHTML = `
      ${extraInfo}
      <p class="text-muted small mb-2" id="whatsapp-contract-status-text">${escapeHtml(statusText)}</p>
      ${autoLinkHint}
    `;

    actions?.classList.remove('d-none');
    linkButton.innerHTML = '<i class="bi bi-link-45deg me-1"></i> Alterar vínculo';
    linkButton.classList.remove('btn-outline-primary');
    linkButton.classList.add('btn-outline-secondary');
  } else if (chat?.contractId) {
    content.innerHTML = `
      <p class="text-muted small mb-1">Processo ID:</p>
      <p class="fw-semibold mb-1"><code>${escapeHtml(chat.contractId)}</code></p>
      <p class="text-muted small mb-2" id="whatsapp-contract-status-text">Sincronizando detalhes do processo...</p>
      ${buildAutoLinkStatusHtml(chat)}
    `;
    actions?.classList.remove('d-none');
    linkButton.innerHTML = '<i class="bi bi-link-45deg me-1"></i> Alterar vínculo';
    linkButton.classList.remove('btn-outline-primary');
    linkButton.classList.add('btn-outline-secondary');
  } else {
    content.innerHTML = `
      <p class="text-muted small mb-2" id="whatsapp-contract-status-text">Nenhum processo vinculado.</p>
      ${buildAutoLinkStatusHtml(chat)}
    `;
    actions?.classList.add('d-none');
    linkButton.innerHTML = '<i class="bi bi-link-45deg me-1"></i> Vincular processo';
    linkButton.classList.add('btn-outline-primary');
    linkButton.classList.remove('btn-outline-secondary');
  }

  const isLinked = Boolean(chat?.contractId);
  if (openBtn) openBtn.disabled = !isLinked;
  if (unlinkBtn) unlinkBtn.disabled = !isLinked;
  linkButton.disabled = !uiState.currentChatId;
}

function updateQuickNotesField() {
  const textarea = document.getElementById('whatsapp-quick-notes');
  if (!textarea) return;
  textarea.value = uiState.currentChat?.quickNotes || '';
}

async function getContractsForLinkSearch(forceRefresh = false) {
  const cache = uiState.contractSearchCache;
  const now = Date.now();

  if (!forceRefresh && Array.isArray(cache.items) && cache.items.length > 0) {
    if ((now - cache.loadedAt) < cache.ttlMs) {
      return cache.items;
    }
  }

  let contracts = [];
  const flags = typeof firestore.getSystemFlags === 'function'
    ? await firestore.getSystemFlags()
    : {};
  const allowHeavyFallback = flags.enableContractsHeavyFallback !== false;

  try {
    if (typeof firestore.getContractsPage === 'function') {
      const page = await firestore.getContractsPage({
        limit: 150,
        page: 1,
        sortKey: 'updatedAt',
        sortDirection: 'desc',
        includeArchived: false
      });
      contracts = Array.isArray(page?.contracts) ? page.contracts : [];
    }
  } catch (err) {
    console.warn('[whatsappUI] Falha ao carregar página enxuta de contratos para busca:', err);
  }

  if ((!Array.isArray(contracts) || contracts.length === 0) && allowHeavyFallback) {
    contracts = await firestore.getAllContracts();
  }

  cache.items = Array.isArray(contracts) ? contracts : [];
  cache.loadedAt = Date.now();
  return cache.items;
}

async function searchContractsForLink(term) {
  const normalizedTerm = normalizeSearchValue(term);
  const numericTerm = normalizeDigits(term);

  if (!normalizedTerm) return [];

  try {
    const contracts = await getContractsForLinkSearch(false);
    if (!Array.isArray(contracts)) return [];

    const matches = [];

    contracts.forEach((contract) => {
      const matchData = evaluateContractMatch(contract, normalizedTerm, numericTerm);
      if (matchData.matched) {
        matches.push({
          contract,
          rank: matchData.rank,
          reason: matchData.reason
        });
      }
    });

    matches.sort((a, b) => a.rank - b.rank);
    return matches.slice(0, 10);
  } catch (err) {
    console.error('[whatsappUI] Erro na busca de processos:', err);
    throw err;
  }
}

function evaluateContractMatch(contract, normalizedTerm, numericTerm) {
  const fields = [
    { value: contract.id, reason: 'ID do processo', rank: 0 },
    { value: contract.numeroProcesso, reason: 'Número do processo', rank: 1 },
    { value: contract.clientePrincipal, reason: 'Cliente principal', rank: 2 },
    { value: contract.cliente, reason: 'Cliente', rank: 3 },
    { value: contract.empreendimento, reason: 'Empreendimento', rank: 4 },
    { value: contract.vendedorConstrutora, reason: 'Responsável', rank: 5 },
    { value: contract.status, reason: 'Status', rank: 6 },
    { value: contract.telefone, reason: 'Telefone', rank: 2 },
    { value: contract.celular, reason: 'Celular', rank: 2 },
    { value: contract.cpf, reason: 'Documento', rank: 2 },
    { value: contract.cnpj, reason: 'Documento', rank: 2 }
  ];

  if (Array.isArray(contract.compradores)) {
    contract.compradores.forEach((comprador, index) => {
      fields.push({ value: comprador?.nome, reason: `Comprador ${index + 1}`, rank: 3 });
      fields.push({ value: comprador?.cpf, reason: `CPF Comprador ${index + 1}`, rank: 2 });
    });
  }

  let matched = false;
  let bestRank = Number.MAX_SAFE_INTEGER;
  let reason = '';

  fields.forEach((field) => {
    if (!field.value) return;

    const normalizedField = normalizeSearchValue(field.value);
    if (normalizedField && normalizedField.includes(normalizedTerm)) {
      matched = true;
      if (field.rank < bestRank) {
        bestRank = field.rank;
        reason = field.reason;
      }
      if (field.rank === 0 && normalizedField === normalizedTerm) {
        bestRank = -1;
        reason = field.reason;
      }
    }

    if (numericTerm && numericTerm.length >= 4) {
      const fieldDigits = normalizeDigits(field.value);
      if (fieldDigits && fieldDigits.includes(numericTerm)) {
        matched = true;
        const digitRank = Math.min(field.rank, 1);
        if (digitRank < bestRank) {
          bestRank = digitRank;
          reason = field.reason;
        }
      }
    }
  });

  return {
    matched,
    rank: matched ? bestRank : Number.MAX_SAFE_INTEGER,
    reason
  };
}

function renderContractSearchResults(results) {

  const container = document.getElementById('contract-link-results');
  if (!container) return;

  if (!Array.isArray(results) || results.length === 0) {
    container.innerHTML = '<div class="list-group-item text-center text-muted py-3">Nenhum processo encontrado para os critérios informados.</div>';
    return;
  }

  const currentContractId = uiState.currentChat?.contractId || null;

  container.innerHTML = results.map(({ contract, reason }) => {
    const cliente = contract.clientePrincipal || contract.cliente || 'Cliente';
    const empreendimento = contract.empreendimento || '--';
    const statusText = contract.status || 'Sem status';
    const isCurrent = currentContractId === contract.id;
    const matchInfo = reason ? `<div class="text-muted small fst-italic">Coincidência: ${escapeHtml(reason)}</div>` : '';

    return `
      <div class="list-group-item">
        <div class="d-flex justify-content-between align-items-start">
          <div class="me-3">
            <strong>${escapeHtml(cliente)}</strong>
            <div class="text-muted small">Empreendimento: ${escapeHtml(empreendimento)}</div>
            ${matchInfo}
            <div class="text-muted small mt-1">ID: <code>${escapeHtml(contract.id)}</code></div>
          </div>
          <div class="text-end">
            <span class="badge bg-secondary">${escapeHtml(statusText)}</span>
            <button type="button" class="btn btn-sm ${isCurrent ? 'btn-outline-secondary' : 'btn-primary'} mt-2 contract-link-action-button" data-contract-id="${escapeHtml(contract.id)}" ${isCurrent ? 'disabled' : ''}>
              <i class="bi bi-link-45deg me-1"></i>${isCurrent ? 'Já vinculado' : 'Vincular'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.contract-link-action-button').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      const target = event.currentTarget;
      const { contractId } = target.dataset;
      if (!contractId) return;

      const entry = results.find((item) => item.contract.id === contractId);
      const originalHtml = target.innerHTML;
      target.disabled = true;
      target.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

      try {
        await linkChatToContractId(contractId, { contract: entry?.contract });
      } finally {
        if (target.isConnected) {
          target.disabled = false;
          target.innerHTML = originalHtml;
        }
      }
    });
  });
}

function setContractLinkLoading(isLoading) {
  const searchBtn = document.getElementById('contract-link-search-btn');
  if (!searchBtn) return;

  if (uiState.contractLink) {
    uiState.contractLink.loading = isLoading;
  }

  const spinner = searchBtn.querySelector('.spinner-border');
  if (spinner) {
    spinner.classList.toggle('d-none', !isLoading);
  }
  searchBtn.disabled = isLoading;
}

function renderContractLinkFeedback(type, message, allowHtml = false) {
  const container = document.getElementById('contract-link-feedback');
  if (!container) return;

  const classes = {
    success: 'alert alert-success py-2',
    error: 'alert alert-danger py-2',
    warning: 'alert alert-warning py-2',
    info: 'alert alert-info py-2'
  };

  container.className = classes[type] || classes.info;
  container.innerHTML = allowHtml ? message : escapeHtml(message);
}

function clearContractLinkFeedback() {
  const container = document.getElementById('contract-link-feedback');
  if (!container) return;
  container.className = '';
  container.innerHTML = '';
}

async function handleContractLinkSearch(event) {
  event.preventDefault();
  const form = event.currentTarget;
  form.classList.add('was-validated');

  const input = document.getElementById('contract-link-search-input');
  if (!input) return;

  const term = input.value.trim();
  if (!form.checkValidity()) {
    renderContractLinkFeedback('warning', 'Informe ao menos 3 caracteres para realizar a busca.');
    return;
  }

  setContractLinkLoading(true);
  clearContractLinkFeedback();

  try {
    const results = await searchContractsForLink(term);
    uiState.contractLink.results = results;
    uiState.contractLink.lastSearchTerm = term;
    renderContractSearchResults(results);

    if (results.length === 0) {
      renderContractLinkFeedback('warning', 'Nenhum processo encontrado para os critérios informados.');
    }
  } catch (err) {
    console.error('[whatsappUI] Erro ao executar busca de processos:', err);
    renderContractLinkFeedback('error', 'Erro ao buscar processos. Tente novamente.');
  } finally {
    setContractLinkLoading(false);
  }
}

async function preloadContractSuggestion() {
  const container = document.getElementById('contract-link-suggestion');
  if (!container) return;

  container.classList.add('d-none');
  container.innerHTML = '';

  const phoneRaw = uiState.currentChat?.numero || uiState.currentChat?.phoneNumber || uiState.currentChat?.phone || uiState.currentChat?.from;
  if (!phoneRaw) return;

  try {
    const contract = await whatsappService.findContractByPhone(phoneRaw);
    if (!contract) return;

    uiState.contractLink.suggested = contract;

    const alreadyLinked = uiState.currentChat?.contractId === contract.id;
    const buttonLabel = alreadyLinked ? 'Já vinculado' : 'Vincular';
    const disabledAttr = alreadyLinked ? 'disabled' : '';

    container.innerHTML = `
      <div class="alert alert-primary d-flex justify-content-between align-items-start mb-0">
        <div>
          <strong>Sugestão automática pelo telefone</strong>
          <div class="small">${escapeHtml(contract.clientePrincipal || contract.cliente || '--')}</div>
          <div class="text-muted small mb-0">Processo ID: <code>${escapeHtml(contract.id)}</code></div>
        </div>
        <button type="button" class="btn btn-sm btn-outline-primary ms-3 contract-link-suggestion-btn" data-contract-id="${escapeHtml(contract.id)}" ${disabledAttr}>
          <i class="bi bi-link-45deg me-1"></i>${buttonLabel}
        </button>
      </div>
    `;
    container.classList.remove('d-none');

    container.querySelector('.contract-link-suggestion-btn')?.addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      if (btn.disabled) return;
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
      try {
        await linkChatToContractId(contract.id, { contract, source: 'suggestion' });
      } finally {
        if (btn.isConnected) {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        }
      }
    });
  } catch (err) {
    console.error('[whatsappUI] Erro ao carregar sugestão de processo:', err);
  }
}

async function linkChatToContractId(contractId, options = {}) {
  if (!uiState.currentChatId) {
    showNotification('Selecione uma conversa para vincular.', 'warning');
    return;
  }

  const {
    contract: providedContract = null,
    silent = false,
    source = null
  } = options;
  const previousContractId = uiState.currentChat?.contractId || null;
  const manageUiFeedback = !silent;

  try {
    if (manageUiFeedback) {
      setContractLinkLoading(true);
      clearContractLinkFeedback();
    }

    await whatsappService.linkChatToContract(uiState.currentChatId, contractId);

    if (!silent) {
      const successMessage = source === 'auto-link'
        ? 'Conversa vinculada automaticamente ao processo.'
        : 'Conversa vinculada ao processo com sucesso.';
      showNotification(successMessage, 'success');
    }

    if (uiState.currentChat) {
      uiState.currentChat.contractId = contractId;
    }

    if (providedContract) {
      uiState.currentContract = providedContract;
    } else {
      uiState.currentContract = null;
    }
    updateContractInfoDisplay();

    hideActionPanel(ACTION_PANEL_IDS.LINK_CONTRACT);

    window.dispatchEvent(new CustomEvent('whatsapp:chatLinked', {
      detail: {
        chatId: uiState.currentChatId,
        contractId,
        previousContractId,
        source
      }
    }));

    await refreshCurrentChat(true);
    await loadAgentChats();

    uiState.contractLink.results = [];
    uiState.contractLink.lastSearchTerm = '';
    uiState.contractLink.suggested = null;
  } catch (err) {
    console.error('[whatsappUI] Erro ao vincular processo:', err);
    if (!silent) {
      showNotification(err.message || 'Erro ao vincular processo.', 'error');
      renderContractLinkFeedback('error', err.message || 'Não foi possível concluir o vínculo.');
    }
  } finally {
    if (manageUiFeedback) {
      setContractLinkLoading(false);
    }
  }
}

async function unlinkChatFromContract(event) {
  event?.preventDefault?.();

  if (!uiState.currentChatId || !uiState.currentChat?.contractId) {
    showNotification('Nenhum processo vinculado a esta conversa.', 'warning');
    return;
  }

  const confirmed = window.uiHelpers
    ? await window.uiHelpers.confirmAction({ message: 'Deseja remover o vínculo com o processo atual?' })
    : confirm('Deseja remover o vínculo com o processo atual?');
  
  if (!confirmed) {
    return;
  }

  const contractId = uiState.currentChat.contractId;

  try {
    await whatsappService.unlinkChatFromContract(uiState.currentChatId);
    showNotification('Vínculo removido com sucesso.', 'success');

    window.dispatchEvent(new CustomEvent('whatsapp:chatUnlinked', {
      detail: {
        chatId: uiState.currentChatId,
        contractId
      }
    }));

    await refreshCurrentChat(true);
    await loadAgentChats();
  } catch (err) {
    console.error('[whatsappUI] Erro ao remover vínculo:', err);
    showNotification(err.message || 'Erro ao remover vínculo.', 'error');
  }
}

function openContractLinkModal() {
  if (!uiState.currentChatId) {
    showNotification('Selecione uma conversa para vincular.', 'warning');
    return;
  }

  const panel = document.getElementById(ACTION_PANEL_IDS.LINK_CONTRACT);
  if (!panel) {
    showNotification('Não foi possível abrir o painel de vínculo.', 'error');
    return;
  }

  clearContractLinkFeedback();
  setContractLinkLoading(false);

  const resultsContainer = document.getElementById('contract-link-results');
  if (resultsContainer) {
    resultsContainer.innerHTML = '';
  }

  const suggestionContainer = document.getElementById('contract-link-suggestion');
  if (suggestionContainer) {
    suggestionContainer.classList.add('d-none');
    suggestionContainer.innerHTML = '';
  }

  const searchInput = document.getElementById('contract-link-search-input');
  if (searchInput) {
    searchInput.value = '';
  }

  const searchForm = document.getElementById('contract-link-search-form');
  if (searchForm) {
    searchForm.classList.remove('was-validated');
  }

  if (uiState.currentChat?.contractId) {
    renderContractLinkFeedback('info', `Esta conversa está vinculada ao processo <code>${escapeHtml(uiState.currentChat.contractId)}</code>. Selecione outro processo para alterar o vínculo.`, true);
  }

  showActionPanel(ACTION_PANEL_IDS.LINK_CONTRACT, {
    focusSelector: '#contract-link-search-input',
    onShow: preloadContractSuggestion
  });
}

function viewLinkedContract(event) {
  event?.preventDefault?.();

  if (!uiState.currentChat?.contractId) {
    showNotification('Esta conversa não está vinculada a nenhum processo.', 'warning');
    return;
  }

  const contractId = uiState.currentChat.contractId;
  window.UI?.navigateTo?.('processos');
  window.dispatchEvent(new CustomEvent('whatsapp:openContract', {
    detail: { contractId }
  }));
  showNotification('Abrindo detalhes do processo vinculado...', 'success');
}

function linkToContract(event) {
  event?.preventDefault?.();
  openContractLinkModal();
}

/**
 * Configura listeners do collapse de template
 */
function setupTemplateCollapseListeners() {
  const collapseEl = document.getElementById('whatsapp-template-collapse');
  const templateSelect = document.getElementById('template-select-collapse');
  const sendBtn = document.getElementById('send-template-collapse-btn');
  
  if (!collapseEl) {
    console.warn('[WhatsApp UI] Collapse de template não encontrado');
    return;
  }
  
  // Quando o collapse abrir, carregar templates
  collapseEl.addEventListener('show.bs.collapse', () => {
    console.log('[WhatsApp UI] Collapse de template abrindo...');
    
    if (!uiState.currentChatId) {
      showNotification('Selecione uma conversa primeiro.', 'warning');
      // Fechar o collapse
      const collapse = bootstrap.Collapse.getInstance(collapseEl);
      if (collapse) collapse.hide();
      return;
    }
    
    loadTemplatesIntoCollapseSelect();
  });
  
  // Quando o collapse fechar, resetar estado
  collapseEl.addEventListener('hidden.bs.collapse', () => {
    resetTemplateCollapseState();
  });
  
  // Listener para seleção de template
  if (templateSelect) {
    templateSelect.addEventListener('change', handleTemplateCollapseSelect);
  }
  
  // Listener para envio
  if (sendBtn) {
    sendBtn.addEventListener('click', handleSendTemplateFromCollapse);
  }
  
  console.log('[WhatsApp UI] Listeners do collapse de template configurados');
}

/**
 * Carrega templates no select do collapse
 */
function loadTemplatesIntoCollapseSelect() {
  const select = document.getElementById('template-select-collapse');
  if (!select) return;

  const templateService = window.__WHATSAPP_TEMPLATE_SERVICE__;
  if (!templateService) {
    console.warn('[WhatsApp UI] Template Service não disponível');
    showNotification('Serviço de templates não disponível.', 'error');
    return;
  }

  const templates = templateService.getAvailableTemplates();
  
  select.innerHTML = '<option value="">-- Selecione um template --</option>';

  templates.forEach(template => {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.name;
    select.appendChild(option);
  });
  
  // Reset visual
  resetTemplateCollapseState();
  
  console.log('[WhatsApp UI] Templates carregados no collapse:', templates.length);
}

/**
 * Manipula seleção de template no collapse
 */
function handleTemplateCollapseSelect(e) {
  const templateId = e.target.value;
  
  const previewArea = document.getElementById('template-preview-collapse');
  const previewText = document.getElementById('template-text-collapse');
  const paramsContainer = document.getElementById('template-params-collapse');
  const warningArea = document.getElementById('template-warning-collapse');
  const sendBtn = document.getElementById('send-template-collapse-btn');
  
  // Limpar parâmetros
  if (paramsContainer) paramsContainer.innerHTML = '';
  
  // Se nenhum template selecionado
  if (!templateId) {
    if (previewArea) previewArea.classList.add('d-none');
    if (warningArea) warningArea.classList.add('d-none');
    if (sendBtn) sendBtn.disabled = true;
    return;
  }

  const templateService = window.__WHATSAPP_TEMPLATE_SERVICE__;
  const template = templateService?.getTemplateById(templateId);
  
  if (!template) {
    if (previewArea) previewArea.classList.add('d-none');
    if (warningArea) warningArea.classList.add('d-none');
    if (sendBtn) sendBtn.disabled = true;
    return;
  }

  // Mostrar preview inicial
  if (previewArea && previewText) {
    previewArea.classList.remove('d-none');
    updateTemplatePreview(templateId, {});
  }
  
  // Warning se não aprovado
  if (warningArea) {
    warningArea.classList.toggle('d-none', template.approved !== false);
  }
  
  // Habilitar botão
  if (sendBtn) sendBtn.disabled = false;

  // Gerar campos de parâmetros com listener para atualizar preview
  if (template.parameters && template.parameters.length > 0) {
    template.parameters.forEach(param => {
      const div = document.createElement('div');
      div.className = 'mb-2';
      div.innerHTML = `
        <label class="form-label small fw-semibold mb-1">${param.label}</label>
        <input type="text" 
               class="form-control form-control-sm" 
               data-param="${param.name}" 
               placeholder="${param.placeholder || ''}"
               ${param.required ? 'required' : ''}>
      `;
      paramsContainer.appendChild(div);
      
      // Adicionar listener para atualizar preview em tempo real
      const input = div.querySelector('input');
      if (input) {
        input.addEventListener('input', () => {
          updateTemplatePreviewFromInputs(templateId);
        });
      }
    });
  }
}

/**
 * Atualiza o preview do template com os parâmetros fornecidos
 */
function updateTemplatePreview(templateId, params) {
  const previewText = document.getElementById('template-text-collapse');
  if (!previewText) return;
  
  const templateService = window.__WHATSAPP_TEMPLATE_SERVICE__;
  const template = templateService?.getTemplateById(templateId);
  
  if (!template) return;
  
  // Usar renderTemplateText se disponível, senão fazer substituição manual
  if (templateService.renderTemplateText) {
    const rendered = templateService.renderTemplateText(templateId, params);
    previewText.textContent = rendered;
  } else {
    // Fallback: substituição manual baseada no exemplo
    let text = template.example || template.body || '';
    
    // Substituir placeholders pelos valores dos parâmetros
    if (template.parameters) {
      template.parameters.forEach((param) => {
        const value = params[param.name];

        if (value && value.trim()) {
          // Substituir valor do exemplo pelo valor digitado
          // Buscar o placeholder ou o valor de exemplo e substituir
          text = replaceParameterInText(text, param, value, template.example);
        }
      });
    }
    
    previewText.textContent = text;
  }
}

/**
 * Substitui parâmetro no texto do template
 */
function replaceParameterInText(text, param, value) {
  // Tenta encontrar o placeholder original baseado no nome do parâmetro
  const placeholderPatterns = {
    nome: /Alisson|Cliente|João|Maria/gi,
    assunto: /Compra do APTO[^.]+|assunto do pedido/gi,
    numero: /PRO\d+|número da solicitação/gi,
    data: /\d{2}\/\d{2}\/\d{4}/g,
    hora: /\d{2}:\d{2}/g,
    status: /Aguardando[^.]+|status atual/gi
  };
  
  const pattern = placeholderPatterns[param.name];
  if (pattern) {
    return text.replace(pattern, value);
  }
  
  return text;
}

/**
 * Atualiza preview coletando valores dos inputs
 */
function updateTemplatePreviewFromInputs(templateId) {
  const paramsContainer = document.getElementById('template-params-collapse');
  const inputs = paramsContainer?.querySelectorAll('input[data-param]') || [];
  
  const params = {};
  inputs.forEach(input => {
    params[input.dataset.param] = input.value;
  });
  
  updateTemplatePreview(templateId, params);
}

/**
 * Reseta estado do collapse de template
 */
function resetTemplateCollapseState() {
  const select = document.getElementById('template-select-collapse');
  const previewArea = document.getElementById('template-preview-collapse');
  const paramsContainer = document.getElementById('template-params-collapse');
  const warningArea = document.getElementById('template-warning-collapse');
  const sendBtn = document.getElementById('send-template-collapse-btn');
  
  if (select) select.value = '';
  if (previewArea) previewArea.classList.add('d-none');
  if (paramsContainer) paramsContainer.innerHTML = '';
  if (warningArea) warningArea.classList.add('d-none');
  if (sendBtn) sendBtn.disabled = true;
}

/**
 * Envia template a partir do collapse
 */
async function handleSendTemplateFromCollapse() {
  const select = document.getElementById('template-select-collapse');
  const templateId = select?.value;
  
  if (!uiState.currentChatId) {
    showNotification('Nenhuma conversa selecionada.', 'error');
    return;
  }

  if (!templateId) {
    showNotification('Selecione um template.', 'warning');
    return;
  }

  const paramsContainer = document.getElementById('template-params-collapse');
  const inputs = paramsContainer?.querySelectorAll('input[data-param]') || [];
  
  const templateParameters = {};
  let hasError = false;

  inputs.forEach(input => {
    const key = input.dataset.param;
    const value = input.value.trim();
    
    if (input.required && !value) {
      input.classList.add('is-invalid');
      hasError = true;
    } else {
      input.classList.remove('is-invalid');
      templateParameters[key] = value;
    }
  });

  if (hasError) {
    showNotification('Preencha todos os campos obrigatórios.', 'warning');
    return;
  }

  const sendBtn = document.getElementById('send-template-collapse-btn');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Enviando...';
  }

  try {
    const templateService = window.__WHATSAPP_TEMPLATE_SERVICE__;
    const options = {};
    const phoneNumberId = uiState.currentChat?.phoneNumberId;
    if (typeof phoneNumberId === 'string' && phoneNumberId.trim()) {
      options.phoneNumberId = phoneNumberId.trim();
    }

    await templateService.sendTemplate(uiState.currentChatId, templateId, templateParameters, options);
    
    showNotification('Template enviado com sucesso!', 'success');
    
    // Fechar collapse
    const collapseEl = document.getElementById('whatsapp-template-collapse');
    const collapse = bootstrap.Collapse.getInstance(collapseEl);
    if (collapse) collapse.hide();
    
  } catch (error) {
    console.error('[WhatsApp UI] Erro ao enviar template:', error);
    showNotification(error.message || 'Erro ao enviar template.', 'error');
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="bi bi-send me-1"></i>Enviar';
    }
  }
}

/**
 * Abre o modal de envio de template (legacy - mantido para compatibilidade, não utilizado)
 */
// function openSendTemplateModal() {
//   console.log('[WhatsApp UI] openSendTemplateModal() chamada');
//   console.log('[WhatsApp UI] currentChatId:', uiState.currentChatId);
//
//   if (!uiState.currentChatId) {
//     showNotification('Selecione uma conversa primeiro.', 'warning');
//     return;
//   }
//
//   const modalEl = document.getElementById('modal-whatsapp-send-template');
//   console.log('[WhatsApp UI] Modal element encontrado:', !!modalEl);
//
//   if (!modalEl) {
//     showNotification('Modal de template não encontrado.', 'error');
//     return;
//   }
//
//   // Verificar se o serviço de templates está disponível
//   console.log('[WhatsApp UI] Template Service disponível:', !!window.__WHATSAPP_TEMPLATE_SERVICE__);
//
//   if (!window.__WHATSAPP_TEMPLATE_SERVICE__) {
//     showNotification('Serviço de templates não disponível. Recarregue a página.', 'error');
//     return;
//   }
//
//   // Abrir modal
//   console.log('[WhatsApp UI] Abrindo modal de template...');
//   const modal = new bootstrap.Modal(modalEl);
//   modal.show();
// }

function exportChat() {
  if (!uiState.currentChatId) {
    showNotification('Nenhuma conversa selecionada.', 'warning');
    return;
  }

  const currentChat = uiState.currentChat;
  const messages = uiState.messages || [];

  if (messages.length === 0) {
    showNotification('Nenhuma mensagem disponível para exportar.', 'warning');
    return;
  }

  const chatText = messages.map((msg) => {
    const time = msg.timestamp?.toDate?.()
      ? new Date(msg.timestamp.toDate()).toLocaleString('pt-BR')
      : 'Data desconhecida';
    const direction = msg.direction === 'inbound' ? 'Cliente' : 'Agente';
    return `[${time}] ${direction}: ${msg.body || msg.text || ''}`;
  }).join('\n');

  const filename = `conversa_${currentChat.phoneNumber || currentChat.numero || 'whatsapp'}_${new Date().toISOString().split('T')[0]}.txt`;
  const blob = new Blob([chatText], { type: 'text/plain;charset=utf-8;' });
  activityLogService.downloadBlob(blob, filename);

  activityLogService.auditFileAction({
    actionType: 'WHATSAPP_CHAT_EXPORTED',
    description: `Conversa exportada (${messages.length} mensagens)`,
    module: 'whatsapp',
    page: 'whatsapp',
    source: 'exportChat',
    relatedEntityId: uiState.currentChatId,
    filename,
    blobOrText: blob,
    mimeType: 'text/plain;charset=utf-8;',
    rowCount: messages.length,
    entityType: 'chat',
    entityLabel: currentChat.customerName || currentChat.phoneNumber || currentChat.numero || uiState.currentChatId,
    extraData: {
      phoneNumber: currentChat.phoneNumber || currentChat.numero || uiState.currentChatId,
      customerName: currentChat.customerName || currentChat.nome || ''
    }
  }).catch((error) => {
    console.error('[whatsappUI] Falha ao auditar exportacao de conversa:', error);
  });

  showNotification('Conversa exportada com sucesso.', 'success');
}

async function deleteChat() {
  if (!uiState.currentChatId) {
    showNotification('Nenhuma conversa selecionada.', 'warning');
    return;
  }

  const confirmed = window.uiHelpers
    ? await window.uiHelpers.confirmDelete('esta conversa')
    : confirm('Tem certeza que deseja excluir esta conversa? Esta ação não pode ser desfeita.');
  
  if (!confirmed) {
    return;
  }

  try {
    await whatsappService.deleteChat(uiState.currentChatId);
    showNotification('Conversa excluída com sucesso.', 'success');

    uiState.currentChatId = null;
    uiState.currentChat = null;
    document.getElementById('whatsapp-empty-state').classList.remove('d-none');
    document.getElementById('whatsapp-chat-panel').classList.add('d-none');

    await loadAgentChats();
  } catch (err) {
    console.error('[whatsappUI] Erro ao excluir conversa:', err);
    showNotification(err.message || 'Erro ao excluir conversa.', 'error');
  }
}

function toggleEditClientInfo() {
  const summaryView = document.getElementById('whatsapp-client-summary');
  const editForm = document.getElementById('whatsapp-client-edit-form');
  const editBtn = document.getElementById('whatsapp-edit-client-btn');

  if (!summaryView || !editForm) return;

  const currentChat = uiState.currentChat || {};
  document.getElementById('edit-client-name').value = currentChat.customerName || '';
  document.getElementById('edit-client-email').value = currentChat.customerEmail || '';
  document.getElementById('edit-client-document').value = currentChat.customerDocument || '';

  summaryView.classList.add('d-none');
  editForm.classList.remove('d-none');
  editBtn.classList.add('d-none');
}

function cancelEditClientInfo() {
  const summaryView = document.getElementById('whatsapp-client-summary');
  const editForm = document.getElementById('whatsapp-client-edit-form');
  const editBtn = document.getElementById('whatsapp-edit-client-btn');

  if (!summaryView || !editForm) return;

  summaryView.classList.remove('d-none');
  editForm.classList.add('d-none');
  editBtn.classList.remove('d-none');
}

async function saveClientInfo() {
  if (!uiState.currentChatId) {
    showNotification('Nenhuma conversa selecionada.', 'warning');
    return;
  }

  const customerName = document.getElementById('edit-client-name').value.trim();
  const customerEmail = document.getElementById('edit-client-email').value.trim();
  const customerDocument = document.getElementById('edit-client-document').value.trim();

  try {
    const updates = {
      customerName,
      customerEmail,
      customerDocument,
      updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || new Date()
    };

    await whatsappService.updateChatInfo(uiState.currentChatId, updates);

    if (uiState.currentChat) {
      Object.assign(uiState.currentChat, updates);
    }

    updateClientInfoDisplay();
    cancelEditClientInfo();

    showNotification('Informações salvas com sucesso.', 'success');
  } catch (err) {
    console.error('[whatsappUI] Erro ao salvar informações:', err);
    showNotification('Erro ao salvar informações.', 'error');
  }
}

function updateClientInfoDisplay() {
  const currentChat = uiState.currentChat || {};
  
  // Tentar buscar dados do summaryData se campos diretos não existirem
  const summaryData = currentChat.summaryData || {};
  const collectedData = currentChat.collectedData || {};

  const infoNameEl = document.getElementById('whatsapp-info-name');
  const infoEmailEl = document.getElementById('whatsapp-info-email');
  const infoNumberEl = document.getElementById('whatsapp-info-number');
  const infoDocumentEl = document.getElementById('whatsapp-info-document');

  // Nome: dar prioridade a customerName, depois displayName, depois variáveis do bot
  const customerName = currentChat.customerName 
    || currentChat.displayName 
    || summaryData.nome_cliente?.value 
    || collectedData.nome_cliente?.value
    || '--';

  // Email
  const customerEmail = currentChat.customerEmail 
    || summaryData.email_cliente?.value 
    || collectedData.email_cliente?.value
    || '--';

  // Telefone
  const customerPhone = currentChat.customerPhone
    || summaryData.telefone_cliente?.value 
    || collectedData.telefone_cliente?.value
    || formatPhoneNumber(currentChat.phoneNumber || currentChat.numero) 
    || '--';

  // Documento (CPF/CNPJ)
  const customerDocument = currentChat.customerDocument 
    || summaryData.cpf_cliente?.value 
    || collectedData.cpf_cliente?.value
    || '--';

  infoNameEl && (infoNameEl.textContent = customerName);
  infoEmailEl && (infoEmailEl.textContent = customerEmail);
  infoNumberEl && (infoNumberEl.textContent = customerPhone);
  infoDocumentEl && (infoDocumentEl.textContent = customerDocument);

  const lastInteraction = currentChat.lastMessageTimestamp || currentChat.createdAt;
  const infoLastEl = document.getElementById('whatsapp-info-last');
  if (infoLastEl) {
    infoLastEl.textContent = lastInteraction
      ? formatTime(resolveTimestamp(lastInteraction))
      : '--';
  }

  updateChatHeaderDisplay();
}

function updateChatHeaderDisplay() {
  const currentChat = uiState.currentChat || {};
  const titleEl = document.getElementById('whatsapp-chat-title');
  const subtitleEl = document.getElementById('whatsapp-chat-subtitle');
  const metaEl = document.getElementById('whatsapp-chat-meta');

  if (!titleEl && !subtitleEl && !metaEl) return;

  // Tentar buscar dados do summaryData se campos diretos não existirem
  const summaryData = currentChat.summaryData || {};
  const collectedData = currentChat.collectedData || {};

  // Nome: dar prioridade a customerName, depois displayName, depois variáveis do bot, depois número formatado
  const rawNumber = currentChat.phoneNumberDisplay || currentChat.phoneNumber || currentChat.numero;
  const formattedNumber = rawNumber ? (currentChat.phoneNumberDisplay || formatPhoneNumber(rawNumber)) : null;
  
  const displayName = currentChat.customerName 
    || currentChat.displayName 
    || summaryData.nome_cliente?.value 
    || collectedData.nome_cliente?.value
    || formattedNumber 
    || 'Cliente';

  if (titleEl) {
    titleEl.textContent = displayName;
  }

  if (subtitleEl) {
    const subtitleParts = [];

    if (formattedNumber && formattedNumber !== displayName) {
      subtitleParts.push(formattedNumber);
    }

    if (currentChat.department) {
      subtitleParts.push(currentChat.department);
    }

    if (currentChat.contractId) {
      const contractId = String(currentChat.contractId);
      const contractLabel = contractId.length > 6 ? `Processo ${contractId.slice(-6)}` : `Processo ${contractId}`;
      subtitleParts.push(contractLabel);
    }

    const statusLabel = formatStatusLabel(currentChat.status);
    if (statusLabel) {
      subtitleParts.push(`Status: ${statusLabel}`);
    }

    if (currentChat.agentName) {
      subtitleParts.push(`Agente: ${currentChat.agentName}`);
    }

    subtitleEl.textContent = subtitleParts.length ? subtitleParts.join(' | ') : '--';
  }

  if (metaEl) {
    const metaBadges = [];

    if (currentChat.status) {
      const statusLabel = formatStatusLabel(currentChat.status);
      const statusColor = getStatusColor(currentChat.status);
      metaBadges.push(`
        <span class="badge text-bg-${statusColor}">
          <i class="bi bi-circle-fill"></i>${escapeHtml(statusLabel)}
        </span>
      `);
    }

    if (currentChat.department) {
      metaBadges.push(`
        <span class="badge text-bg-secondary">
          <i class="bi bi-diagram-3"></i>${escapeHtml(`Depto: ${currentChat.department}`)}
        </span>
      `);
    }

    if (currentChat.agentName) {
      metaBadges.push(`
        <span class="badge text-bg-primary">
          <i class="bi bi-person-fill"></i>${escapeHtml(currentChat.agentName)}
        </span>
      `);
    }

    if (Array.isArray(currentChat.tags) && currentChat.tags.length > 0) {
      metaBadges.push(`
        <span class="badge text-bg-info text-dark">
          <i class="bi bi-tags-fill"></i>${escapeHtml(`${currentChat.tags.length} tag(s)`)}
        </span>
      `);
    }

    if (currentChat.returnedToLastAgent) {
      metaBadges.push(`
        <span class="badge text-bg-success">
          <i class="bi bi-arrow-repeat"></i>Retorno automático
        </span>
      `);
    }

    const lastInteractionTimestamp = currentChat.lastMessageTimestamp || currentChat.updatedAt || currentChat.createdAt;
    if (lastInteractionTimestamp) {
      const resolvedTimestamp = resolveTimestamp(lastInteractionTimestamp);
      const formattedInteraction = formatTime(resolvedTimestamp);
      metaBadges.push(`
        <span class="badge bg-light text-secondary border">
          <i class="bi bi-clock-history"></i>${escapeHtml(formattedInteraction)}
        </span>
      `);
    }

    metaEl.innerHTML = metaBadges.join('');
    metaEl.classList.toggle('d-none', metaBadges.length === 0);
  }
}

async function saveQuickNotes() {
  if (!uiState.currentChatId) {
    showNotification('Nenhuma conversa selecionada.', 'warning');
    return;
  }

  const notes = document.getElementById('whatsapp-quick-notes').value.trim();

  try {
    await whatsappService.updateChatInfo(uiState.currentChatId, {
      quickNotes: notes,
      updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || new Date()
    });

    if (uiState.currentChat) {
      uiState.currentChat.quickNotes = notes;
    }

    updateQuickNotesField();
    showNotification('Notas salvas com sucesso.', 'success');
  } catch (err) {
    console.error('[whatsappUI] Erro ao salvar notas:', err);
    showNotification('Erro ao salvar notas.', 'error');
  }
}

function linkToContractFromPanel() {
  linkToContract();
}

// Expor API pública
const whatsappUI = {
  init: initWhatsAppUI,
  openChat,
  sendMessage,
  transferChat,
  resolveChat,
  reopenChat, //  NOVO: Reabrir conversa
  openAgentRegistration,
  loadDepartmentQueue,
  assignChatToMe,
  setChatsFilter,
  openNewChatModal,
  linkToContractFromPanel,
  startReply: startReplyByMessageId,
  cancelReply,
  confirmAudioPreview: confirmSendRecordedAudio,
  discardAudioPreview: discardRecordedAudioPreview,
  startAudioRecording,
  stopAudioRecording,
  cancelAudioRecording,
  scrollToMessage,
  // Tags management
  populateTagsDropdown,
  filterTagsDropdown,
  handleTagToggle,
  openTagsPanel,
  startForward: startForwardByMessageId,
  cancelForward: resetForwardState,
  showActionPanel,
  hideActionPanel,
  hideAllActionPanels,
  toggleSidebar,
  toggleInfoPanel,
  setSidebarCollapsed: (value) => toggleSidebar(Boolean(value)),
  setInfoPanelCollapsed: (value) => toggleInfoPanel(Boolean(value)),
  getLayoutState: () => ({
    sidebarCollapsed: uiState.layout.sidebarCollapsed,
    infoCollapsed: uiState.layout.infoCollapsed
  }),
  clearChatSearch,
  setChatSearchTerm: (value) => setChatSearchTerm(typeof value === 'string' ? value : '', { force: true }),
  // Expor estado para outros módulos (ex: whatsappAttachments)
  getState: () => uiState,
  getCurrentChatId: () => uiState.currentChatId
};

window.__WHATSAPP_UI__ = whatsappUI;

// Debug: confirmar que API está exposta
if (window.__DEBUG__) {
  console.log('[whatsappUI]  API pública exposta em window.__WHATSAPP_UI__');
  console.log('[whatsappUI]  getCurrentChatId disponível:', typeof window.__WHATSAPP_UI__.getCurrentChatId);
}

export default whatsappUI;

