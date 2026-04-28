/**
 * @file aprovacaoService.js
 * @description Servico para gerenciamento de aprovacoes de credito
 * Responsavel por CRUD, cache e integracao com Firestore
 */

import { db, auth } from "./auth.js";
import cacheService from "./cacheService.js";
import permissionsService, { PERMISSION_MODULES, PERMISSION_ACTIONS, PERMISSION_ROLES } from "./permissionsService.js";
import aprovacaoRealtimeSyncService from "./aprovacaoRealtimeSyncService.js";
import realtimeSyncService from "./realtimeSyncService.js";
import { activityLogService } from "./activityLogService.js";
import { tenantQuery, withTenantData } from "./tenantService.js";

// Constantes
const COLLECTION_NAME = 'aprovacoes';
const CACHE_KEY_ALL = 'aprovacoes_all';
const CACHE_KEY_PREFIX = 'aprovacao_';
const CACHE_KEY_LIST_PREFIX = 'aprovacoes_list_';
const CACHE_KEY_STATS_PREFIX = 'aprovacoes_stats_';
const CACHE_KEY_AGG_DAILY_PREFIX = 'aprovacoes_agg_daily_';
const CACHE_KEY_AGG_SUMMARY = 'aprovacoes_agg_summary_global';
const CACHE_KEY_ANALYST_CATALOG = 'aprovacoes_analyst_catalog';
const CACHE_TYPE_LIST = 'aprovacoes';
const CACHE_TYPE_STATS = 'aprovacoesStats';
const PAGE_SIZE_DEFAULT = 20;
const FIRESTORE_MAX_QUERY_LIMIT = 10000;
const METRICS_QUERY_LIMIT_DEFAULT = 500;
const SOLICITACOES_SCAN_LIMIT_DEFAULT = 300;
const ANALYST_FIELD = 'analistaAprovacao';
const LEGACY_ANALYST_FIELD = 'analistaResponsavel';
const APROVACOES_AGG_DAILY_COLLECTION = 'aprovacoesAggDaily';
const APROVACOES_AGG_SUMMARY_COLLECTION = 'aprovacoesAggSummary';
const APROVACOES_AGG_SUMMARY_DOC_ID = 'global';
const APROVACAO_CONVERSAO_LINKS_COLLECTION = 'aprovacaoConversaoLinks';
const APROVACAO_SOLICITACOES_COLLECTION = 'aprovacaoSolicitacoes';
const INTAKE_ANALYST_QUEUE = 'fila-aprovacao';
const SOLICITACAO_ORIGENS = new Set(['whatsapp_bot', 'link_publico']);
const DEFAULT_SYSTEM_FLAGS = Object.freeze({
  enableAprovacoesRealtimeDelta: true,
  enableAprovacoesAggregatesReadPath: true
});

/**
 * Situacoes possiveis para uma aprovacao
 */
export const SITUACAO_APROVACAO = {
  APROVADO: 'APROVADO',
  REPROVADO: 'REPROVADO',
  CONDICIONADO: 'CONDICIONADO'
};

/**
 * Tipos de carta de financiamento
 */
export const TIPO_CARTA = {
  MCMV: 'MCMV',
  SBPE: 'SBPE',
  SFI: 'SFI'
};

/**
 * Cores para badges de situacao
 */
export const SITUACAO_COLORS = {
  [SITUACAO_APROVACAO.APROVADO]: { bg: 'bg-success', text: 'text-white', icon: 'bi-check-circle' },
  [SITUACAO_APROVACAO.REPROVADO]: { bg: 'bg-danger', text: 'text-white', icon: 'bi-x-circle' },
  [SITUACAO_APROVACAO.CONDICIONADO]: { bg: 'bg-warning', text: 'text-dark', icon: 'bi-exclamation-triangle' }
};

/**
 * Valores padrao sugeridos ao converter aprovacao em processo
 */
export const CONVERSAO_PROCESSO_DEFAULTS = Object.freeze({
  workflowId: 'associativo',
  status: 'aguardando'
});

/**
 * Referencia para a colecao
 */
const aprovacaoCollection = db.collection(COLLECTION_NAME);

async function getSystemFlags(forceRefresh = false) {
  try {
    if (window.firestoreService?.getSystemFlags) {
      const flags = await window.firestoreService.getSystemFlags({ forceRefresh });
      return { ...DEFAULT_SYSTEM_FLAGS, ...(flags || {}) };
    }
  } catch (error) {
    if (window.__DEBUG__) {
      console.warn('[AprovacaoService] Falha ao obter system flags, usando defaults:', error);
    }
  }
  return { ...DEFAULT_SYSTEM_FLAGS };
}

async function shouldUseAggregateReadPath(options = {}) {
  if (options.mode === 'legacy') return false;
  if (options.mode === 'aggregate') return true;
  if (options.preferAggregates === true) return true;

  const flags = await getSystemFlags();
  return flags.enableAprovacoesAggregatesReadPath === true;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeByAnalystMap(byAnalyst = {}) {
  if (!byAnalyst || typeof byAnalyst !== 'object') return {};
  const normalized = {};
  Object.entries(byAnalyst).forEach(([key, value]) => {
    const analyst = String(key || '').trim();
    if (!analyst) return;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      normalized[analyst] = {
        total: Number(value.total) || 0,
        aprovados: Number(value.aprovados) || 0,
        reprovados: Number(value.reprovados) || 0,
        condicionados: Number(value.condicionados) || 0,
        convertidas: Number(value.convertidas) || 0,
        pendentesConversao: Number(value.pendentesConversao) || 0,
        label: String(value.label || analyst)
      };
      return;
    }

    const count = Number(value) || 0;
    if (count <= 0) return;
    normalized[analyst] = {
      total: count,
      aprovados: 0,
      reprovados: 0,
      condicionados: 0,
      convertidas: 0,
      pendentesConversao: 0,
      label: analyst
    };
  });
  return normalized;
}

function normalizeAggregateRowByAnalystMap(row = {}) {
  if (!row || typeof row !== 'object') return {};

  const byAnalyst = {
    ...(row.byAnalyst && typeof row.byAnalyst === 'object' ? row.byAnalyst : {})
  };

  Object.entries(row).forEach(([fieldPath, value]) => {
    if (!String(fieldPath).startsWith('byAnalyst.')) return;

    const parts = String(fieldPath).split('.');
    if (parts.length < 3) return;

    const analystKey = parts[1];
    const fieldName = parts[2];
    if (!analystKey || !fieldName) return;

    if (!byAnalyst[analystKey] || typeof byAnalyst[analystKey] !== 'object') {
      byAnalyst[analystKey] = {};
    }

    if (fieldName === 'label') {
      byAnalyst[analystKey].label = String(value || analystKey);
      return;
    }

    byAnalyst[analystKey][fieldName] =
      (Number(byAnalyst[analystKey][fieldName]) || 0) + (Number(value) || 0);
  });

  return normalizeByAnalystMap(byAnalyst);
}

function normalizeAnalystAggregateKey(value) {
  return normalizeIdentity(value)
    .replace(/[.#$/[\]]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function resolveAnalystAggregateStats(byAnalyst = {}, analystFilter = '') {
  const rawFilter = String(analystFilter || '').trim();
  if (!rawFilter) return null;

  if (byAnalyst[rawFilter]) {
    return byAnalyst[rawFilter];
  }

  const normalizedKey = normalizeAnalystAggregateKey(rawFilter);
  if (normalizedKey && byAnalyst[normalizedKey]) {
    return byAnalyst[normalizedKey];
  }

  const normalizedFilter = normalizeIdentity(rawFilter);
  return Object.values(byAnalyst).find((entry) => {
    const label = normalizeIdentity(entry?.label);
    return Boolean(label) && label === normalizedFilter;
  }) || null;
}

function buildDateKeysBetween(dataInicio, dataFim) {
  const start = toDateForMetrics(dataInicio);
  const end = toDateForMetrics(dataFim, { endOfDay: true });

  if (!start || !end || start > end) {
    return [];
  }

  const keys = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cursor <= endDate) {
    keys.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

function parseDayAggregationToStats(docs = [], analystFilter = null) {
  const stats = {
    total: 0,
    aprovados: 0,
    reprovados: 0,
    condicionados: 0,
    pendentesConversao: 0
  };

  docs.forEach((doc) => {
    const data = doc || {};
    if (analystFilter) {
      const byAnalyst = normalizeAggregateRowByAnalystMap(data);
      const analystStats = resolveAnalystAggregateStats(byAnalyst, analystFilter);
      if (!analystStats || typeof analystStats !== 'object') {
        return;
      }
      stats.total += Number(analystStats.total) || 0;
      stats.aprovados += Number(analystStats.aprovados) || 0;
      stats.reprovados += Number(analystStats.reprovados) || 0;
      stats.condicionados += Number(analystStats.condicionados) || 0;
      stats.pendentesConversao += Number(analystStats.pendentesConversao) || 0;
      return;
    }

    stats.total += Number(data.total) || 0;
    stats.aprovados += Number(data.aprovados) || 0;
    stats.reprovados += Number(data.reprovados) || 0;
    stats.condicionados += Number(data.condicionados) || 0;
    stats.pendentesConversao += Number(data.pendentesConversao) || 0;
  });

  stats.taxaAprovacao = stats.total > 0
    ? Math.round((stats.aprovados / stats.total) * 100)
    : 0;

  return stats;
}

async function getDailyAggregationsByDateRange(dataInicio, dataFim) {
  const keys = buildDateKeysBetween(dataInicio, dataFim);
  if (keys.length === 0) {
    return [];
  }

  const results = [];
  for (let i = 0; i < keys.length; i += 10) {
    const batchKeys = keys.slice(i, i + 10);
    const snapshot = await tenantQuery(db.collection(APROVACOES_AGG_DAILY_COLLECTION))
      .where(firebase.firestore.FieldPath.documentId(), 'in', batchKeys)
      .get();
    snapshot.docs.forEach((doc) => results.push({ id: doc.id, ...doc.data() }));
  }

  return results;
}

function buildAggDailyCacheKey(dataInicio, dataFim) {
  return `${CACHE_KEY_AGG_DAILY_PREFIX}${buildCacheSignature({
    dataInicio: dataInicio ? formatDateKey(dataInicio) : '',
    dataFim: dataFim ? formatDateKey(dataFim) : ''
  })}`;
}

async function getDailyAggregationsForStats(dataInicio, dataFim) {
  const startDate = toDateForMetrics(dataInicio);
  const endDate = toDateForMetrics(dataFim, { endOfDay: true });
  const cacheKey = buildAggDailyCacheKey(startDate, endDate);

  return cacheService.get(
    cacheKey,
    async () => {
      if (startDate && endDate) {
        return getDailyAggregationsByDateRange(startDate, endDate);
      }

      let query = tenantQuery(db.collection(APROVACOES_AGG_DAILY_COLLECTION));

      if (startDate) {
        query = query.where('date', '>=', formatDateKey(startDate));
      }
      if (endDate) {
        query = query.where('date', '<=', formatDateKey(endDate));
      }

      const snapshot = await query
        .orderBy('date', 'desc')
        .limit(730)
        .get();

      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
    CACHE_TYPE_STATS
  );
}

async function getAprovacaoAggregateSummary(forceRefresh = false) {
  return cacheService.get(
    CACHE_KEY_AGG_SUMMARY,
    async () => {
      const doc = await db.collection(APROVACOES_AGG_SUMMARY_COLLECTION)
        .doc(APROVACOES_AGG_SUMMARY_DOC_ID)
        .get();

      if (!doc.exists) {
        return null;
      }

      return doc.data() || null;
    },
    CACHE_TYPE_STATS,
    forceRefresh
  );
}

function chunkArray(items = [], chunkSize = 10) {
  const normalized = Array.isArray(items) ? items.filter(Boolean) : [];
  const size = Math.max(1, Number(chunkSize) || 10);
  const chunks = [];

  for (let index = 0; index < normalized.length; index += size) {
    chunks.push(normalized.slice(index, index + size));
  }

  return chunks;
}

/**
 * Cria uma nova aprovacao
 * @param {Object} data - Dados da aprovacao
 * @returns {Promise<string>} ID da aprovacao criada
 */
export async function createAprovacao(data) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Usuario nao autenticado');
  }

  // Valida permissao
  const permissions = await permissionsService.getUserPermissions(currentUser.uid);
  if (!permissionsService.can(permissions, PERMISSION_MODULES.APROVACOES, PERMISSION_ACTIONS.CREATE)) {
    throw new Error('Voce nao tem permissao para criar aprovacoes');
  }

  // Normaliza CPFs, nomes e compradores
  const cpfs = normalizeCPFs(data.cpf || data.cpfs);
  const nomesClientes = normalizeNomes(data.cliente || data.nomesClientes);
  const compradores = normalizeCompradoresAprovacao(data.compradores, cpfs, nomesClientes);

  const now = firebase.firestore.Timestamp.now();
  const dataEntradaTs = data.dataEntrada ? toTimestamp(data.dataEntrada) : now;
  const dataAprovacaoTs = data.dataAprovacao ? toTimestamp(data.dataAprovacao) : null;
  const vencSicaqTs = data.vencSicaq ? toTimestamp(data.vencSicaq) : null;

  const aprovacaoData = {
    // Identificacao
    cpfs,
    nomesClientes,
    cpfPrincipal: cpfs[0] || '',
    nomeClientePrincipal: nomesClientes[0] || '',
    clientePrincipal: nomesClientes[0] || '',
    compradores,

    // Datas
    dataEntrada: dataEntradaTs,
    dataAprovacao: dataAprovacaoTs,
    vencSicaq: vencSicaqTs,
    createdAt: now,
    updatedAt: now,
    criadoEm: now,
    entrada: dataEntradaTs,
    dataModificacao: now,
    modificadoPor: currentUser.email || currentUser.uid,

    // Empreendimento
    empreendimento: (data.empreendimento || '').trim(),
    construtora: (data.construtora || '').trim(),

    // Participantes
    corretor: (data.corretor || '').trim(),
    gerenteImobiliaria: (data.gerenteImobiliaria || '').trim(),
    analistaAprovacao: resolveAnalistaAprovacao(data, currentUser.email || ''),

    // Resultado
    situacao: normalizeSituacao(data.situacao),
    pendencia: (data.pendencia || '').trim(),

    // Financiamento
    renda: parseMonetaryValue(data.renda),
    cartaFinanciamento: normalizeCartaFinanciamento(data.cartaFinanciamento),
    valorFinanciamento: parseMonetaryValue(data.valorFinanciamento),
    prazoMeses: parseInt(data.prazoMeses || data.prazo) || 0,

    // Auditoria
    criadoPor: currentUser.email || currentUser.uid,
    atualizadoPor: currentUser.email || currentUser.uid,

    // Conversao
    convertidoParaProcesso: false,
    processoId: null,
    dataConversao: null,

    // Documentos e validacao IA
    documentos: data.documentos || [],
    aiValidation: data.aiValidation || null,
    checklistAprovacao: data.checklistAprovacao || null
  };

  const docRef = await aprovacaoCollection.add(withTenantData(aprovacaoData));

  // Registra no feed global de atividades
  if (activityLogService?.logActivity) {
    const identity = activityLogService.getCurrentUserActivityIdentity
      ? await activityLogService.getCurrentUserActivityIdentity()
      : null;
    activityLogService.logActivity(
      'NEW_APPROVAL',
      `Nova aprovação criada para ${aprovacaoData.clientePrincipal || 'Cliente não informado'}`,
      docRef.id,
      {
        module: 'aprovacao',
        page: 'aprovacao',
        entityType: 'approval',
        entityLabel: aprovacaoData.clientePrincipal || 'Cliente nao informado',
        situacao: aprovacaoData.situacao || 'Pendente',
        processoName: aprovacaoData.clientePrincipal,
        clientePrincipal: aprovacaoData.clientePrincipal,
        source: 'createAprovacao',
        actorName: identity?.userName || currentUser.email || 'Analista'
      }
    );
  }

  // Invalida cache
  invalidateCache();

  if (window.__DEBUG__) {
    console.log('[AprovacaoService] Aprovacao criada:', docRef.id);
  }

  return docRef.id;
}

/**
 * Atualiza uma aprovacao existente
 * @param {string} id - ID da aprovacao
 * @param {Object} data - Dados a atualizar
 * @returns {Promise<void>}
 */
export async function updateAprovacao(id, data) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Usuario nao autenticado');
  }

  const cpfs = normalizeCPFs(data.cpf || data.cpfs);
  const nomesClientes = normalizeNomes(data.cliente || data.nomesClientes);

  const permissions = await permissionsService.getUserPermissions(currentUser.uid);
  if (!permissionsService.can(permissions, PERMISSION_MODULES.APROVACOES, PERMISSION_ACTIONS.EDIT)) {
    throw new Error('Voce nao tem permissao para editar aprovacoes');
  }

  const now = firebase.firestore.Timestamp.now();
  const updateData = {
    ...data,
    updatedAt: now,
    atualizadoPor: currentUser.email || currentUser.uid,
    dataModificacao: now,
    modificadoPor: currentUser.email || currentUser.uid
  };

  if (Object.prototype.hasOwnProperty.call(data, 'analistaAprovacao')
    || Object.prototype.hasOwnProperty.call(data, LEGACY_ANALYST_FIELD)) {
    updateData.analistaAprovacao = resolveAnalistaAprovacao(data, currentUser.email || '');
  }
  if (Object.prototype.hasOwnProperty.call(updateData, LEGACY_ANALYST_FIELD)) {
    delete updateData[LEGACY_ANALYST_FIELD];
  }

  // Normaliza campos se fornecidos
  if (data.cpf || data.cpfs) {
    updateData.cpfs = normalizeCPFs(data.cpf || data.cpfs);
    updateData.cpfPrincipal = updateData.cpfs[0] || '';
  }
  if (data.cliente || data.nomesClientes) {
    updateData.nomesClientes = normalizeNomes(data.cliente || data.nomesClientes);
    updateData.nomeClientePrincipal = updateData.nomesClientes[0] || '';
    updateData.clientePrincipal = updateData.nomesClientes[0] || '';
  }
  if (data.compradores || data.cpf || data.cpfs || data.cliente || data.nomesClientes) {
    const baseCpfs = updateData.cpfs || cpfs;
    const baseNomes = updateData.nomesClientes || nomesClientes;
    updateData.compradores = normalizeCompradoresAprovacao(data.compradores, baseCpfs, baseNomes);
  }
  if (data.dataEntrada) {
    updateData.dataEntrada = toTimestamp(data.dataEntrada);
    updateData.entrada = updateData.dataEntrada;
  }
  if (data.dataAprovacao) {
    updateData.dataAprovacao = toTimestamp(data.dataAprovacao);
  }
  if (data.vencSicaq !== undefined) {
    updateData.vencSicaq = data.vencSicaq ? toTimestamp(data.vencSicaq) : null;
  }
  if (data.situacao) {
    updateData.situacao = normalizeSituacao(data.situacao);
  }
  if (data.cartaFinanciamento) {
    updateData.cartaFinanciamento = normalizeCartaFinanciamento(data.cartaFinanciamento);
  }
  if (data.renda !== undefined) {
    updateData.renda = parseMonetaryValue(data.renda);
  }
  if (data.valorFinanciamento !== undefined) {
    updateData.valorFinanciamento = parseMonetaryValue(data.valorFinanciamento);
  }

  // Documentos e validacao IA
  if (data.documentos !== undefined) {
    updateData.documentos = data.documentos;
  }
  if (data.aiValidation !== undefined) {
    updateData.aiValidation = data.aiValidation;
  }

  await aprovacaoCollection.doc(id).update(withTenantData(updateData));

  // Invalida cache
  invalidateCache();
  cacheService.invalidate(`${CACHE_KEY_PREFIX}${id}`);

  if (window.__DEBUG__) {
    console.log('[AprovacaoService] Aprovacao atualizada:', id);
  }
}

/**
 * Busca uma aprovacao por ID
 * @param {string} id - ID da aprovacao
 * @returns {Promise<Object|null>}
 */
export async function getAprovacao(id) {
  const cacheKey = `${CACHE_KEY_PREFIX}${id}`;

  return await cacheService.get(
    cacheKey,
    async () => {
      const doc = await aprovacaoCollection.doc(id).get();
      if (!doc.exists) return null;
      return normalizeAprovacaoDoc({ id: doc.id, ...doc.data() });
    },
    COLLECTION_NAME
  );
}

/**
 * Resolve um DocumentSnapshot por ID para uso como cursor de paginacao.
 * @param {string} id - ID do documento de aprovacao
 * @returns {Promise<any|null>}
 */
export async function getAprovacaoCursorDocById(id) {
  if (!id) return null;

  const doc = await aprovacaoCollection.doc(id).get();
  if (!doc.exists) return null;
  return doc;
}

/**
 * Registra listener delta de aprovacoes com fallback seguro.
 * @param {(payload: { aprovacoes: Array, updates: Array }) => void} callback
 * @param {{ forceLegacy?: boolean }} options
 * @returns {Promise<Function>} unsubscribe
 */
export async function listenForAprovacoesDelta(callback, options = {}) {
  const useLegacy = options.forceLegacy === true;
  if (useLegacy) {
    return () => {};
  }

  const flags = await getSystemFlags();
  if (flags.enableAprovacoesRealtimeDelta !== true) {
    return () => {};
  }

  await aprovacaoRealtimeSyncService.start();
  const listenerId = `aprovacoes_delta_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return aprovacaoRealtimeSyncService.registerListener(listenerId, ({ aprovacoes, updates }) => {
    if (typeof callback === 'function') {
      callback({ aprovacoes: aprovacoes || [], updates: updates || [] });
    }
  });
}

/**
 * Lista aprovacoes com filtros e paginacao
 * @param {Object} options - Opcoes de busca
 * @returns {Promise<{data: Array, hasMore: boolean, lastDoc: any}>}
 */
export async function listAprovacoes(options = {}) {
  const {
    situacao,
    construtora,
    empreendimento,
    analistaAprovacao,
    analistaResponsavel,
    analista,
    includeAllAuthenticated = false,
    convertidoParaProcesso,
    dataInicio,
    dataFim,
    dataEntrada,
    dataEntradaInicio,
    dataEntradaFim,
    dataAprovacao,
    dataAprovacaoInicio,
    dataAprovacaoFim,
    searchTerm,
    pageSize = PAGE_SIZE_DEFAULT,
    startAfterDoc = null,
    startAfterDocId = null,
    disablePersistentCache = false,
    exhaustiveClientSideScan = false,
    orderBy = 'dataAprovacao',
    orderDirection = 'desc'
  } = options;
  const analystFilter = resolveAnalistaAprovacao({
    analistaAprovacao,
    analistaResponsavel,
    analista
  });
  const normalizedOrderBy = orderBy === LEGACY_ANALYST_FIELD ? ANALYST_FIELD : orderBy;

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Usuario nao autenticado');
  }

  let shouldRestrictToCurrentAnalyst = false;
  if (!includeAllAuthenticated) {
    const permissions = await permissionsService.getUserPermissions(currentUser.uid);
    shouldRestrictToCurrentAnalyst = permissions.role === PERMISSION_ROLES.ANALYST;
  }
  const normalizedPageSize = normalizePageSize(pageSize);
  const normalizedCursorId = startAfterDoc?.id || startAfterDocId || null;
  const canUsePersistentCache = !disablePersistentCache;
  const cacheScope = shouldRestrictToCurrentAnalyst
    ? (currentUser.email || currentUser.uid || 'analyst')
    : 'all';
  const listCacheKey = canUsePersistentCache
    ? `${CACHE_KEY_LIST_PREFIX}${buildCacheSignature({
      scope: cacheScope,
      situacao,
      construtora,
      empreendimento,
      analystFilter,
      convertidoParaProcesso,
      dataInicio,
      dataFim,
      dataEntrada,
      dataEntradaInicio,
      dataEntradaFim,
      dataAprovacao,
      dataAprovacaoInicio,
      dataAprovacaoFim,
      searchTerm,
      cursorId: normalizedCursorId,
      pageSize: normalizedPageSize,
      exhaustiveClientSideScan: exhaustiveClientSideScan === true,
      orderBy: normalizedOrderBy,
      orderDirection
    })}`
    : null;

  const fetchList = async () => {
    let query = tenantQuery(aprovacaoCollection);
    const clientSidePredicates = [];
    const canProbeHasMore = normalizedPageSize < FIRESTORE_MAX_QUERY_LIMIT;
    const targetMatches = canProbeHasMore ? normalizedPageSize + 1 : normalizedPageSize;
    const normalizedSearchTerm = String(searchTerm || '').trim().toLowerCase();
    const inlineEmpreendimento = typeof empreendimento === 'string' ? empreendimento.trim() : '';
    const inlineConstrutora = typeof construtora === 'string' ? construtora.trim() : '';
    const situacaoValues = normalizeInFilterValues(situacao);
    const construtoraValues = normalizeInFilterValues(construtora);
    const analistaValues = normalizeInFilterValues(analystFilter);
    const dataAprovacaoStart = parseDateBoundary(dataAprovacaoInicio || dataAprovacao || dataInicio, { endOfDay: false });
    const dataAprovacaoEnd = parseDateBoundary(dataAprovacaoFim || dataAprovacao || dataFim, { endOfDay: true });
    const dataEntradaStart = parseDateBoundary(dataEntradaInicio || dataEntrada, { endOfDay: false });
    const dataEntradaEnd = parseDateBoundary(dataEntradaFim || dataEntrada, { endOfDay: true });
    let rangeField = null;
    let shouldFilterDataEntradaClientSide = false;

    // Filtro por situacao
    if (situacaoValues.length === 1) {
      query = query.where('situacao', '==', situacaoValues[0]);
    } else if (situacaoValues.length > 1 && situacaoValues.length <= 10) {
      query = query.where('situacao', 'in', situacaoValues);
    } else if (situacaoValues.length > 10) {
      const allowedSituacoes = new Set(situacaoValues);
      clientSidePredicates.push((item) => allowedSituacoes.has(String(item?.situacao || '').trim()));
    }

    // Filtro por construtora
    if (Array.isArray(construtora) && construtoraValues.length === 1) {
      query = query.where('construtora', '==', construtoraValues[0]);
    } else if (Array.isArray(construtora) && construtoraValues.length > 1 && construtoraValues.length <= 10) {
      query = query.where('construtora', 'in', construtoraValues);
    } else if (Array.isArray(construtora) && construtoraValues.length > 10) {
      const allowedConstrutoras = new Set(construtoraValues.map((value) => value.toLowerCase()));
      clientSidePredicates.push((item) => allowedConstrutoras.has(String(item?.construtora || '').trim().toLowerCase()));
    } else if (inlineConstrutora) {
      const normalizedInlineConstrutora = inlineConstrutora.toLowerCase();
      clientSidePredicates.push((item) =>
        String(item?.construtora || '').trim().toLowerCase().includes(normalizedInlineConstrutora)
      );
    }

    // Filtro por empreendimento
    if (Array.isArray(empreendimento)) {
      const empreendimentoValues = normalizeInFilterValues(empreendimento);
      if (empreendimentoValues.length === 1) {
        query = query.where('empreendimento', '==', empreendimentoValues[0]);
      } else if (empreendimentoValues.length > 1 && empreendimentoValues.length <= 10) {
        query = query.where('empreendimento', 'in', empreendimentoValues);
      } else if (empreendimentoValues.length > 10) {
        const allowedEmpreendimentos = new Set(empreendimentoValues.map((value) => value.toLowerCase()));
        clientSidePredicates.push((item) => allowedEmpreendimentos.has(String(item?.empreendimento || '').trim().toLowerCase()));
      }
    } else if (inlineEmpreendimento) {
      const normalizedInlineEmpreendimento = inlineEmpreendimento.toLowerCase();
      clientSidePredicates.push((item) =>
        String(item?.empreendimento || '').trim().toLowerCase().includes(normalizedInlineEmpreendimento)
      );
    }

    // Filtro por analista
    if (analistaValues.length === 1) {
      query = query.where(ANALYST_FIELD, '==', analistaValues[0]);
    } else if (analistaValues.length > 1 && analistaValues.length <= 10) {
      query = query.where(ANALYST_FIELD, 'in', analistaValues);
    } else if (analistaValues.length > 10) {
      const allowedAnalistas = new Set(analistaValues.map((value) => value.toLowerCase()));
      clientSidePredicates.push((item) => allowedAnalistas.has(String(item?.[ANALYST_FIELD] || '').trim().toLowerCase()));
    }

    // Filtro por conversao
    if (convertidoParaProcesso !== undefined) {
      query = query.where('convertidoParaProcesso', '==', convertidoParaProcesso);
    }

    // Escopo opcional: restringe analista ao proprio identificador apenas quando solicitado.
    if (shouldRestrictToCurrentAnalyst) {
      query = query.where(ANALYST_FIELD, '==', (currentUser.email || currentUser.uid || ''));
    }

    // Filtros por datas (preferencialmente server-side)
    if (dataAprovacaoStart) {
      query = query.where('dataAprovacao', '>=', firebase.firestore.Timestamp.fromDate(dataAprovacaoStart));
      rangeField = 'dataAprovacao';
    }
    if (dataAprovacaoEnd) {
      query = query.where('dataAprovacao', '<=', firebase.firestore.Timestamp.fromDate(dataAprovacaoEnd));
      rangeField = 'dataAprovacao';
    }

    if (dataEntradaStart || dataEntradaEnd) {
      if (rangeField && rangeField !== 'dataEntrada') {
        shouldFilterDataEntradaClientSide = true;
      } else {
        if (dataEntradaStart) {
          query = query.where('dataEntrada', '>=', firebase.firestore.Timestamp.fromDate(dataEntradaStart));
        }
        if (dataEntradaEnd) {
          query = query.where('dataEntrada', '<=', firebase.firestore.Timestamp.fromDate(dataEntradaEnd));
        }
        rangeField = 'dataEntrada';
      }
    }

    if (shouldFilterDataEntradaClientSide) {
      clientSidePredicates.push((item) => {
        const itemDate = item?.dataEntrada?.toDate?.() || item?.entrada?.toDate?.() || null;
        if (!itemDate) return false;
        if (dataEntradaStart && itemDate < dataEntradaStart) return false;
        if (dataEntradaEnd && itemDate > dataEntradaEnd) return false;
        return true;
      });
    }

    if (normalizedSearchTerm) {
      clientSidePredicates.push((item) => (
        item.nomeClientePrincipal?.toLowerCase().includes(normalizedSearchTerm) ||
        item.cpfPrincipal?.includes(normalizedSearchTerm) ||
        item.empreendimento?.toLowerCase().includes(normalizedSearchTerm) ||
        item.construtora?.toLowerCase().includes(normalizedSearchTerm) ||
        item.corretor?.toLowerCase().includes(normalizedSearchTerm)
      ));
    }

    const shouldApplyClientSideFilters = clientSidePredicates.length > 0;
    const filterClientSide = shouldApplyClientSideFilters
      ? (item) => clientSidePredicates.every((predicate) => predicate(item))
      : null;

    const effectiveOrderBy = rangeField || normalizedOrderBy;
    const secondaryOrderBy = (rangeField && normalizedOrderBy !== rangeField)
      ? normalizedOrderBy
      : null;
    let useSecondaryOrder = Boolean(secondaryOrderBy);

    // Ordenacao
    const buildOrderedQuery = (enableSecondary = true) => {
      let orderedQuery = query.orderBy(effectiveOrderBy, orderDirection);
      if (enableSecondary && secondaryOrderBy) {
        orderedQuery = orderedQuery.orderBy(secondaryOrderBy, orderDirection);
      }
      return orderedQuery;
    };

    let orderedBaseQuery = buildOrderedQuery(useSecondaryOrder);

    // Paginacao (Firestore limita query.limit() a 10000)
    let cursorDoc = startAfterDoc || null;
    if (!cursorDoc && startAfterDocId) {
      cursorDoc = await getAprovacaoCursorDocById(startAfterDocId);
    }

    const batchSize = shouldApplyClientSideFilters
      ? Math.min(Math.max(normalizedPageSize * 2, 40), 200)
      : targetMatches;
    const maxScannedDocs = shouldApplyClientSideFilters
      ? (exhaustiveClientSideScan === true
        ? FIRESTORE_MAX_QUERY_LIMIT
        : Math.min(Math.max(normalizedPageSize * 15, 300), 1500))
      : targetMatches;

    const matchedEntries = [];
    let scannedDocs = 0;
    let sourceCursor = cursorDoc;
    let exhausted = false;

    while (!exhausted && matchedEntries.length < targetMatches && scannedDocs < maxScannedDocs) {
      let pageQuery = orderedBaseQuery;
      if (sourceCursor) {
        pageQuery = pageQuery.startAfter(sourceCursor);
      }
      pageQuery = pageQuery.limit(batchSize);

      let snapshot;
      try {
        snapshot = await pageQuery.get();
      } catch (error) {
        if (useSecondaryOrder && isFirestoreMissingIndexError(error)) {
          useSecondaryOrder = false;
          orderedBaseQuery = buildOrderedQuery(false);
          matchedEntries.length = 0;
          scannedDocs = 0;
          sourceCursor = cursorDoc;
          exhausted = false;
          continue;
        }
        throw error;
      }
      const docs = snapshot.docs || [];
      if (docs.length === 0) {
        exhausted = true;
        break;
      }

      for (const doc of docs) {
        sourceCursor = doc;
        scannedDocs += 1;

        const normalizedItem = normalizeAprovacaoDoc({ id: doc.id, ...doc.data() });
        if (!filterClientSide || filterClientSide(normalizedItem)) {
          matchedEntries.push({ item: normalizedItem, doc });
          if (matchedEntries.length >= targetMatches) break;
        }

        if (scannedDocs >= maxScannedDocs) {
          break;
        }
      }

      if (docs.length < batchSize) {
        exhausted = true;
      }
    }

    const pageEntries = matchedEntries.slice(0, normalizedPageSize);
    const hasMoreMatches = matchedEntries.length > normalizedPageSize;
    const mayHaveMore = !exhausted && scannedDocs >= maxScannedDocs;
    const hasMore = hasMoreMatches || mayHaveMore;
    const lastDoc = pageEntries.length > 0 ? pageEntries[pageEntries.length - 1].doc : null;

    return {
      data: pageEntries.map((entry) => entry.item),
      hasMore,
      lastDoc
    };
  };

  if (!canUsePersistentCache) {
    return await fetchList();
  }

  const cachedResult = await cacheService.get(
    listCacheKey,
    async () => {
      const fresh = await fetchList();
      return {
        data: fresh.data,
        hasMore: fresh.hasMore,
        lastDocId: fresh.lastDoc?.id || null
      };
    },
    CACHE_TYPE_LIST
  );

  return {
    data: Array.isArray(cachedResult?.data) ? cachedResult.data : [],
    hasMore: Boolean(cachedResult?.hasMore),
    lastDoc: null,
    lastDocId: cachedResult?.lastDocId || null
  };
}

/**
 * Lista aprovacoes para metricas agregadas com limite alto e indicador de amostra parcial.
 * @param {Object} options - filtros opcionais (datas, analista, etc.)
 * @returns {Promise<{data: Array, partial: boolean, limit: number}>}
 */
export async function listAprovacoesForMetrics(options = {}) {
  const {
    dataInicio,
    dataFim,
    pageSize,
    orderBy,
    orderDirection,
    preferAggregates = false,
    ...restOptions
  } = options;

  const canUseAggregateRows = preferAggregates === true
    && (await shouldUseAggregateReadPath(options));
  if (canUseAggregateRows) {
    const aggregateRows = await getDailyAggregationsForStats(dataInicio, dataFim);
    return {
      data: [],
      partial: false,
      limit: 0,
      aggregates: aggregateRows,
      source: 'aggregate_daily'
    };
  }

  const limit = normalizePageSize(pageSize || METRICS_QUERY_LIMIT_DEFAULT);
  const response = await listAprovacoes({
    ...restOptions,
    pageSize: limit,
    orderBy: orderBy || 'createdAt',
    orderDirection: orderDirection || 'desc'
  });

  const startDate = toDateForMetrics(dataInicio);
  const endDate = toDateForMetrics(dataFim, { endOfDay: true });
  const sourceData = Array.isArray(response?.data) ? response.data : [];
  const filteredData = (!startDate && !endDate)
    ? sourceData
    : sourceData.filter((item) => {
      const dataBase = resolveAprovacaoMetricDate(item);
      if (!dataBase) return false;
      if (startDate && dataBase.getTime() < startDate.getTime()) return false;
      if (endDate && dataBase.getTime() > endDate.getTime()) return false;
      return true;
    });

  return {
    data: filteredData,
    partial: Boolean(response?.hasMore),
    limit,
    source: 'legacy_list'
  };
}

function choosePreferredAnalystCatalogValue(currentValue = '', candidateValue = '') {
  const current = String(currentValue || '').trim();
  const candidate = String(candidateValue || '').trim();

  if (!candidate) return current;
  if (!current) return candidate;
  if (candidate.length !== current.length) {
    return candidate.length > current.length ? candidate : current;
  }

  return candidate.localeCompare(current, 'pt-BR') < 0 ? candidate : current;
}

/**
 * Lista os analistas distintos existentes na colecao `aprovacoes`.
 * O catalogo eh global da colecao e independe dos agregados diarios.
 * @param {Object} options
 * @param {boolean} options.forceRefresh
 * @param {number} options.batchSize
 * @returns {Promise<{analysts:Array<string>, partial:boolean, source:string}>}
 */
export async function listAprovacaoAnalystCatalog(options = {}) {
  const {
    forceRefresh = false,
    batchSize = 500
  } = options;

  if (!auth.currentUser) {
    throw new Error('Usuario nao autenticado');
  }

  const normalizedBatchSize = Math.min(Math.max(Number(batchSize) || 500, 50), 1000);

  return cacheService.get(
    CACHE_KEY_ANALYST_CATALOG,
    async () => {
      const analystByKey = new Map();
      let lastDoc = null;
      let exhausted = false;

      while (!exhausted) {
        let query = tenantQuery(aprovacaoCollection)
          .orderBy(firebase.firestore.FieldPath.documentId())
          .limit(normalizedBatchSize);

        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();
        const docs = snapshot.docs || [];

        if (docs.length === 0) {
          break;
        }

        docs.forEach((doc) => {
          const normalized = normalizeAprovacaoDoc({ id: doc.id, ...doc.data() });
          const analystValue = resolveAnalistaAprovacao(normalized);
          const analystKey = normalizeIdentity(analystValue);

          if (!analystKey) return;

          analystByKey.set(
            analystKey,
            choosePreferredAnalystCatalogValue(analystByKey.get(analystKey), analystValue)
          );
        });

        lastDoc = docs[docs.length - 1] || null;
        exhausted = docs.length < normalizedBatchSize;
      }

      return {
        analysts: Array.from(analystByKey.values())
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'pt-BR')),
        partial: false,
        source: 'collection_scan'
      };
    },
    CACHE_TYPE_LIST,
    forceRefresh
  );
}

/**
 * Lista solicitacoes de analise com scan incremental leve.
 * Evita varrer toda a colecao de aprovacoes apenas para preencher o modal de triagem.
 * @param {Object} options
 * @param {number} options.limit
 * @param {boolean} options.includeAllAuthenticated
 * @returns {Promise<{data: Array, partial: boolean, scanned: number, limit: number}>}
 */
export async function listSolicitacoesAnalise(options = {}) {
  const {
    limit = SOLICITACOES_SCAN_LIMIT_DEFAULT,
    includeAllAuthenticated = true
  } = options;

  const normalizedLimit = normalizePageSize(limit);
  const batchSize = Math.min(Math.max(Math.ceil(normalizedLimit / 2), 50), 100);
  const maxScannedDocs = Math.min(Math.max(normalizedLimit * 3, 200), 800);
  const cacheKey = `${CACHE_KEY_LIST_PREFIX}${buildCacheSignature({
    scope: includeAllAuthenticated ? 'all' : 'restricted',
    solicitacoes: true,
    limit: normalizedLimit
  })}`;

  const cached = await cacheService.get(
    cacheKey,
    async () => {
      const found = [];
      let scanned = 0;
      let lastDoc = null;
      let exhausted = false;

      while (!exhausted && found.length < normalizedLimit && scanned < maxScannedDocs) {
        let query = tenantQuery(aprovacaoCollection)
          .orderBy('dataEntrada', 'desc')
          .limit(batchSize);

        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();
        const docs = snapshot.docs || [];
        if (docs.length === 0) {
          exhausted = true;
          break;
        }

        docs.forEach((doc) => {
          scanned += 1;
          const normalized = normalizeAprovacaoDoc({ id: doc.id, ...doc.data() });
          if (isSolicitacaoAnaliseRecord(normalized)) {
            found.push(normalized);
          }
        });

        lastDoc = docs[docs.length - 1] || lastDoc;
        if (docs.length < batchSize) {
          exhausted = true;
        }
      }

      return {
        data: found.slice(0, normalizedLimit),
        partial: !exhausted,
        scanned,
        limit: normalizedLimit
      };
    },
    CACHE_TYPE_LIST
  );

  return {
    data: Array.isArray(cached?.data) ? cached.data : [],
    partial: Boolean(cached?.partial),
    scanned: Number(cached?.scanned) || 0,
    limit: Number(cached?.limit) || normalizedLimit
  };
}

/**
 * Lista links materializados de conversao aprovacao -> processo.
 * Usa approvalIds quando disponiveis para respeitar filtros detalhados da UI.
 * @param {Object} options
 * @param {Array<string>} options.approvalIds
 * @param {string|null} options.dataInicio
 * @param {string|null} options.dataFim
 * @param {number} options.limit
 * @returns {Promise<Array<Object>>}
 */
export async function listAprovacaoConversionLinks(options = {}) {
  const {
    approvalIds = [],
    dataInicio = null,
    dataFim = null,
    limit = FIRESTORE_MAX_QUERY_LIMIT
  } = options;

  const normalizedIds = Array.isArray(approvalIds)
    ? approvalIds.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  const cacheKey = `${CACHE_KEY_LIST_PREFIX}${buildCacheSignature({
    conversionLinks: true,
    approvalIds: normalizedIds.slice().sort(),
    dataInicio,
    dataFim,
    limit
  })}`;

  return cacheService.get(
    cacheKey,
    async () => {
      if (normalizedIds.length > 0) {
        const items = [];
        const seenIds = new Set();

        for (const chunk of chunkArray(normalizedIds, 10)) {
          const snapshot = await tenantQuery(db.collection(APROVACAO_CONVERSAO_LINKS_COLLECTION))
            .where('aprovacaoId', 'in', chunk)
            .limit(Math.min(limit, FIRESTORE_MAX_QUERY_LIMIT))
            .get();

          snapshot.docs.forEach((doc) => {
            if (seenIds.has(doc.id)) return;
            seenIds.add(doc.id);
            items.push({ id: doc.id, ...doc.data() });
          });
        }

        return items;
      }

      let query = tenantQuery(db.collection(APROVACAO_CONVERSAO_LINKS_COLLECTION));
      const startKey = toDateForMetrics(dataInicio) ? formatDateKey(toDateForMetrics(dataInicio)) : null;
      const endKey = toDateForMetrics(dataFim, { endOfDay: true })
        ? formatDateKey(toDateForMetrics(dataFim, { endOfDay: true }))
        : null;

      if (startKey) {
        query = query.where('approvalDateKey', '>=', startKey);
      }
      if (endKey) {
        query = query.where('approvalDateKey', '<=', endKey);
      }

      const snapshot = await query
        .limit(Math.min(limit, FIRESTORE_MAX_QUERY_LIMIT))
        .get();

      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
    CACHE_TYPE_LIST
  );
}

/**
 * Lista solicitacoes de analise na colecao dedicada `aprovacaoSolicitacoes`.
 * @param {Object} options
 * @param {string|null} options.dataInicio
 * @param {string|null} options.dataFim
 * @param {string|null} options.status
 * @param {string|null} options.searchTerm
 * @param {number} options.limit
 * @param {boolean} options.forceRefresh
 * @returns {Promise<{data:Array, partial:boolean, source:string}>}
 */
export async function listAprovacaoSolicitacoesRecords(options = {}) {
  const {
    dataInicio = null,
    dataFim = null,
    status = null,
    searchTerm = '',
    limit = 100,
    forceRefresh = false
  } = options;

  const normalizedLimit = Math.min(normalizePageSize(limit), FIRESTORE_MAX_QUERY_LIMIT);
  const normalizedSearch = String(searchTerm || '').trim().toLowerCase();
  const cacheKey = `${CACHE_KEY_LIST_PREFIX}${buildCacheSignature({
    solicitacoesCollection: true,
    dataInicio,
    dataFim,
    status,
    searchTerm: normalizedSearch,
    limit: normalizedLimit
  })}`;

  return cacheService.get(
    cacheKey,
    async () => {
      let query = tenantQuery(db.collection(APROVACAO_SOLICITACOES_COLLECTION))
        .orderBy('createdAt', 'desc')
        .limit(normalizedLimit + 1);

      const startDate = toDateForMetrics(dataInicio);
      const endDate = toDateForMetrics(dataFim, { endOfDay: true });
      if (startDate) {
        query = query.where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(startDate));
      }
      if (endDate) {
        query = query.where('createdAt', '<=', firebase.firestore.Timestamp.fromDate(endDate));
      }
      if (status) {
        query = query.where('status', '==', status);
      }

      const snapshot = await query.get();
      let data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      if (normalizedSearch) {
        data = data.filter((item) => {
          const haystack = [
            item.nomeCompleto,
            item.cpfPrincipal,
            item.email,
            item.telefone,
            item.empreendimentoInteresse,
            item.construtoraInteresse,
            item.analistaAprovacao
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return haystack.includes(normalizedSearch);
        });
      }

      const partial = data.length > normalizedLimit || snapshot.size > normalizedLimit;

      return {
        data: data.slice(0, normalizedLimit),
        partial,
        source: 'aprovacaoSolicitacoes'
      };
    },
    CACHE_TYPE_LIST,
    forceRefresh
  );
}

/**
 * Busca estatisticas de aprovacoes
 * @param {Object} options - Filtros opcionais
 * @returns {Promise<Object>}
 */
export async function getAprovacaoStats(options = {}) {
  const {
    analistaAprovacao,
    analistaResponsavel,
    analista,
    includeAllAuthenticated = false,
    dataInicio,
    dataFim,
    mode = 'auto',
    forceRefresh = false
  } = options;
  const analystFilter = resolveAnalistaAprovacao({
    analistaAprovacao,
    analistaResponsavel,
    analista
  });

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Usuario nao autenticado');
  }

  let shouldRestrictToCurrentAnalyst = false;
  if (!includeAllAuthenticated) {
    const permissions = await permissionsService.getUserPermissions(currentUser.uid);
    shouldRestrictToCurrentAnalyst = permissions.role === PERMISSION_ROLES.ANALYST;
  }
  const cacheScope = shouldRestrictToCurrentAnalyst
    ? (currentUser.email || currentUser.uid || 'analyst')
    : (analystFilter || 'all');
  const effectiveAnalyst = shouldRestrictToCurrentAnalyst
    ? (currentUser.email || currentUser.uid || '')
    : analystFilter;
  const useAggregateMode = mode === 'legacy'
    ? false
    : await shouldUseAggregateReadPath(options);
  const resolvedMode = useAggregateMode ? 'aggregate' : 'legacy';
  const statsCacheKey = `${CACHE_KEY_STATS_PREFIX}${buildCacheSignature({
    scope: cacheScope,
    dataInicio,
    dataFim,
    mode: resolvedMode
  })}`;

  return await cacheService.get(
    statsCacheKey,
    async () => {
      if (resolvedMode === 'aggregate') {
        try {
          if (!dataInicio && !dataFim) {
            const summary = await getAprovacaoAggregateSummary(forceRefresh);
            if (summary && typeof summary === 'object') {
              if (effectiveAnalyst) {
                const byAnalyst = normalizeByAnalystMap(summary.byAnalyst);
                const analystStats = resolveAnalystAggregateStats(byAnalyst, effectiveAnalyst || null);
                if (analystStats && typeof analystStats === 'object') {
                  const total = Number(analystStats.total) || 0;
                  const aprovados = Number(analystStats.aprovados) || 0;
                  return {
                    total,
                    aprovados,
                    reprovados: Number(analystStats.reprovados) || 0,
                    condicionados: Number(analystStats.condicionados) || 0,
                    pendentesConversao: Number(analystStats.pendentesConversao) || 0,
                    taxaAprovacao: total > 0 ? Math.round((aprovados / total) * 100) : 0,
                    source: 'aggregate_summary_by_analyst'
                  };
                }
              } else {
                const total = Number(summary.total) || 0;
                const aprovados = Number(summary.aprovados) || 0;
                return {
                  total,
                  aprovados,
                  reprovados: Number(summary.reprovados) || 0,
                  condicionados: Number(summary.condicionados) || 0,
                  pendentesConversao: Number(summary.pendentesConversao) || 0,
                  taxaAprovacao: total > 0 ? Math.round((aprovados / total) * 100) : 0,
                  source: 'aggregate_summary_global'
                };
              }
            }
          }

          const aggregateRows = await getDailyAggregationsForStats(dataInicio, dataFim);
          const stats = parseDayAggregationToStats(aggregateRows, effectiveAnalyst || null);
          return {
            ...stats,
            source: 'aggregate_daily'
          };
        } catch (error) {
          console.warn('[AprovacaoService] Falha na leitura agregada, aplicando fallback legado:', error);
        }
      }

      let query = tenantQuery(aprovacaoCollection);

      // Escopo opcional: restringe analista ao proprio identificador apenas quando solicitado.
      if (shouldRestrictToCurrentAnalyst) {
        query = query.where(ANALYST_FIELD, '==', (currentUser.email || currentUser.uid || ''));
      } else if (analystFilter) {
        query = query.where(ANALYST_FIELD, '==', analystFilter);
      }

      const dataAprovacaoStart = toDateForMetrics(dataInicio);
      const dataAprovacaoEnd = toDateForMetrics(dataFim, { endOfDay: true });
      if (dataAprovacaoStart) {
        query = query.where('dataAprovacao', '>=', firebase.firestore.Timestamp.fromDate(dataAprovacaoStart));
      }
      if (dataAprovacaoEnd) {
        query = query.where('dataAprovacao', '<=', firebase.firestore.Timestamp.fromDate(dataAprovacaoEnd));
      }

      const supportsCountAggregate = typeof query.count === 'function';
      const readCount = async (baseQuery) => {
        const aggregate = await baseQuery.count().get();
        return Number(aggregate?.data?.().count || 0);
      };

      if (supportsCountAggregate) {
        try {
          const [total, aprovados, reprovados, condicionados, pendentesConversao] = await Promise.all([
            readCount(query),
            readCount(query.where('situacao', '==', SITUACAO_APROVACAO.APROVADO)),
            readCount(query.where('situacao', '==', SITUACAO_APROVACAO.REPROVADO)),
            readCount(query.where('situacao', '==', SITUACAO_APROVACAO.CONDICIONADO)),
            readCount(
              query
                .where('situacao', '==', SITUACAO_APROVACAO.APROVADO)
                .where('convertidoParaProcesso', '==', false)
            )
          ]);

          const taxaAprovacao = total > 0
            ? Math.round((aprovados / total) * 100)
            : 0;

          return {
            total,
            aprovados,
            reprovados,
            condicionados,
            pendentesConversao,
            taxaAprovacao,
            source: 'legacy_count_aggregate'
          };
        } catch (countError) {
          console.warn('[AprovacaoService] Falha em count() agregado, aplicando fallback leve:', countError);
        }
      }

      if (resolvedMode === 'legacy') {
        const legacyMetrics = await listAprovacoesForMetrics({
          includeAllAuthenticated,
          analistaAprovacao: effectiveAnalyst || undefined,
          dataInicio,
          dataFim,
          mode: 'legacy',
          preferAggregates: false,
          pageSize: FIRESTORE_MAX_QUERY_LIMIT
        });
        const data = Array.isArray(legacyMetrics?.data) ? legacyMetrics.data : [];
        const total = data.length;
        const aprovados = data.filter((item) => item?.situacao === SITUACAO_APROVACAO.APROVADO).length;
        return {
          total,
          aprovados,
          reprovados: data.filter((item) => item?.situacao === SITUACAO_APROVACAO.REPROVADO).length,
          condicionados: data.filter((item) => item?.situacao === SITUACAO_APROVACAO.CONDICIONADO).length,
          pendentesConversao: data.filter((item) =>
            item?.situacao === SITUACAO_APROVACAO.APROVADO && !item?.convertidoParaProcesso
          ).length,
          taxaAprovacao: total > 0 ? Math.round((aprovados / total) * 100) : 0,
          partial: Boolean(legacyMetrics?.partial),
          source: 'legacy_metrics_list'
        };
      }

      // Fallback prioritário para modo agregado: ler agregados diários.
      try {
        const aggregateRows = await getDailyAggregationsForStats(dataInicio, dataFim);
        const stats = parseDayAggregationToStats(aggregateRows, effectiveAnalyst || null);
        return {
          ...stats,
          source: 'aggregate_daily_fallback'
        };
      } catch (aggregateFallbackError) {
        console.warn('[AprovacaoService] Falha no fallback por agregados diários:', aggregateFallbackError);
      }

      // Fallback final: amostragem limitada para evitar varredura completa.
      const SAMPLE_LIMIT = 500;
      const sampledSnapshot = await query.limit(SAMPLE_LIMIT).get();
      const docs = sampledSnapshot.docs.map(doc => normalizeAprovacaoDoc({ id: doc.id, ...doc.data() }));

      let partial = sampledSnapshot.size >= SAMPLE_LIMIT;
      if (partial && sampledSnapshot.docs.length > 0) {
        try {
          const lastDoc = sampledSnapshot.docs[sampledSnapshot.docs.length - 1];
          const probe = await query.startAfter(lastDoc).limit(1).get();
          partial = !probe.empty;
        } catch (probeError) {
          partial = true;
          if (window.__DEBUG__) {
            console.warn('[AprovacaoService] Falha ao verificar pagina adicional do fallback amostrado:', probeError);
          }
        }
      }

      const aprovados = docs.filter(d => d.situacao === SITUACAO_APROVACAO.APROVADO).length;
      const total = docs.length;
      return {
        total,
        aprovados,
        reprovados: docs.filter(d => d.situacao === SITUACAO_APROVACAO.REPROVADO).length,
        condicionados: docs.filter(d => d.situacao === SITUACAO_APROVACAO.CONDICIONADO).length,
        pendentesConversao: docs.filter(d =>
          d.situacao === SITUACAO_APROVACAO.APROVADO && !d.convertidoParaProcesso
        ).length,
        taxaAprovacao: total > 0 ? Math.round((aprovados / total) * 100) : 0,
        partial,
        source: 'legacy_sampled_fallback'
      };
    },
    CACHE_TYPE_STATS,
    forceRefresh
  );
}

/**
 * Obtém ranking agregado por analista a partir dos agregados diários.
 * Evita carregar milhares de documentos de aprovações apenas para compor o ranking.
 * @param {Object} options
 * @param {string|null} options.dataInicio
 * @param {string|null} options.dataFim
 * @returns {Promise<Array<{analyst:string, total:number, aprovados:number, reprovados:number, condicionados:number, pendentesConversao:number, taxaAprovacao:number}>>}
 */
export async function getAprovacaoAnalystRankingAggregate(options = {}) {
  const { dataInicio = null, dataFim = null, forceRefresh = false } = options;

  if (!dataInicio && !dataFim) {
    const summary = await getAprovacaoAggregateSummary(forceRefresh);
    if (summary && typeof summary === 'object') {
      const ranking = Object.values(normalizeAggregateRowByAnalystMap(summary))
        .map((entry) => {
          const total = Number(entry.total) || 0;
          const aprovados = Number(entry.aprovados) || 0;
          const reprovados = Number(entry.reprovados) || 0;
          const condicionados = Number(entry.condicionados) || 0;
          const pendentesConversao = Number(entry.pendentesConversao) || 0;
          return {
            analyst: String(entry.label || 'Nao informado'),
            total,
            aprovados,
            reprovados,
            condicionados,
            pendentesConversao,
            taxaAprovacao: total > 0 ? Number(((aprovados / total) * 100).toFixed(1)) : 0
          };
        })
        .sort((a, b) => b.total - a.total || b.aprovados - a.aprovados || a.analyst.localeCompare(b.analyst, 'pt-BR'));

      return ranking;
    }
  }

  const aggregateRows = await getDailyAggregationsForStats(dataInicio, dataFim);
  const summary = new Map();

  aggregateRows.forEach((row) => {
    const byAnalyst = normalizeAggregateRowByAnalystMap(row);
    Object.entries(byAnalyst).forEach(([analystKey, stats]) => {
      const display = String(stats?.label || analystKey || '').trim();
      if (!display) return;

      if (!summary.has(analystKey)) {
        summary.set(analystKey, {
          analyst: display,
          total: 0,
          aprovados: 0,
          reprovados: 0,
          condicionados: 0,
          pendentesConversao: 0
        });
      }

      const entry = summary.get(analystKey);
      entry.analyst = display.length > entry.analyst.length ? display : entry.analyst;
      const total = Number(stats?.total) || 0;
      entry.total += total;
      entry.aprovados += Number(stats?.aprovados) || 0;
      entry.reprovados += Number(stats?.reprovados) || 0;
      entry.condicionados += Number(stats?.condicionados) || 0;
      entry.pendentesConversao += Number(stats?.pendentesConversao) || 0;
    });
  });

  return Array.from(summary.values())
    .map((entry) => ({
      ...entry,
      taxaAprovacao: entry.total > 0 ? Number(((entry.aprovados / entry.total) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.total - a.total || b.aprovados - a.aprovados || a.analyst.localeCompare(b.analyst, 'pt-BR'));
}

/**
 * Obtém métricas de conversão a partir de agregados diários e links materializados.
 * @param {Object} options
 * @param {string|null} options.dataInicio
 * @param {string|null} options.dataFim
 * @param {'todas'|'aprovadas'} options.denominatorMode
 * @returns {Promise<Object>}
 */
export async function getAprovacaoConversionMetricsAggregate(options = {}) {
  const {
    dataInicio = null,
    dataFim = null,
    denominatorMode = 'todas'
  } = options;

  const aggregateRows = await getDailyAggregationsForStats(dataInicio, dataFim);
  const denominatorByMode = aggregateRows.reduce((acc, row) => {
    const total = Number(row?.total) || 0;
    const aprovados = Number(row?.aprovados) || 0;
    acc.todas += total;
    acc.aprovadas += aprovados;
    return acc;
  }, { todas: 0, aprovadas: 0 });

  const effectiveMode = String(denominatorMode || 'todas').toLowerCase() === 'aprovadas'
    ? 'aprovadas'
    : 'todas';
  const totalAnalisesPeriodo = denominatorByMode[effectiveMode] || 0;

  const startKey = toDateForMetrics(dataInicio) ? formatDateKey(toDateForMetrics(dataInicio)) : null;
  const endKey = toDateForMetrics(dataFim, { endOfDay: true })
    ? formatDateKey(toDateForMetrics(dataFim, { endOfDay: true }))
    : null;

  let linksQuery = tenantQuery(db.collection(APROVACAO_CONVERSAO_LINKS_COLLECTION));
  if (startKey) {
    linksQuery = linksQuery.where('approvalDateKey', '>=', startKey);
  }
  if (endKey) {
    linksQuery = linksQuery.where('approvalDateKey', '<=', endKey);
  }

  const linksSnapshot = await linksQuery.limit(FIRESTORE_MAX_QUERY_LIMIT).get();
  const links = linksSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const byOrigin = links.filter((item) => String(item?.source || '').toLowerCase() === 'origem').length;
  const byCpf = links.filter((item) => String(item?.source || '').toLowerCase() === 'cpf').length;
  let convertidas = links.length;
  let countFallbackUsed = false;

  if (convertidas === 0 && totalAnalisesPeriodo > 0) {
    const convertedCount = await countConvertedAprovacoesByDateRange(dataInicio, dataFim);
    if (Number.isFinite(convertedCount) && convertedCount >= 0) {
      convertidas = convertedCount;
      countFallbackUsed = true;
    }
  }

  const pendentes = Math.max(totalAnalisesPeriodo - convertidas, 0);
  const taxa = totalAnalisesPeriodo > 0 ? (convertidas / totalAnalisesPeriodo) : 0;

  return {
    totalAnalisesPeriodo,
    convertidas,
    pendentes,
    byOrigin,
    byCpf,
    taxa,
    taxaPercentual: totalAnalisesPeriodo > 0 ? Number((taxa * 100).toFixed(1)) : 0,
    denominatorMode: effectiveMode,
    periodStart: toDateForMetrics(dataInicio),
    periodEnd: toDateForMetrics(dataFim, { endOfDay: true }),
    source: countFallbackUsed ? 'aggregate_links_count_fallback' : 'aggregate_links',
    diagnostics: {
      aggregateRows: aggregateRows.length,
      linksRead: links.length,
      countFallbackUsed
    },
    matches: []
  };
}

/**
 * Deleta uma aprovacao
 * @param {string} id - ID da aprovacao
 * @returns {Promise<void>}
 */
export async function deleteAprovacao(id, options = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Usuario nao autenticado');
  }

  const permissions = await permissionsService.getUserPermissions(currentUser.uid);
  const hasDeletePermission = permissionsService.can(
    permissions,
    PERMISSION_MODULES.APROVACOES,
    PERMISSION_ACTIONS.DELETE
  );
  const isAdminRole = isAdminRolePermission(permissions);

  let aprovacaoData = (options && typeof options === 'object' && options.aprovacao)
    ? options.aprovacao
    : null;

  if (!aprovacaoData) {
    const doc = await aprovacaoCollection.doc(id).get();
    if (!doc.exists) {
      throw new Error('Aprovacao nao encontrada');
    }
    aprovacaoData = normalizeAprovacaoDoc({ id: doc.id, ...doc.data() });
  }

  const isOwner = isAprovacaoOwner(aprovacaoData, currentUser);

  if (!hasDeletePermission && !isAdminRole && !isOwner) {
    throw new Error('Voce nao tem permissao para excluir aprovacoes');
  }

  if (activityLogService?.logActivity) {
    const identity = activityLogService.getCurrentUserActivityIdentity
      ? await activityLogService.getCurrentUserActivityIdentity()
      : null;
    activityLogService.logActivity(
      'APPROVAL_DELETED',
      `Analise excluida: ${aprovacaoData?.clientePrincipal || aprovacaoData?.nomeClientePrincipal || 'Cliente nao informado'}`,
      id,
      {
        module: 'aprovacao',
        page: 'aprovacao',
        entityType: 'approval',
        entityLabel: aprovacaoData?.clientePrincipal || aprovacaoData?.nomeClientePrincipal || 'Cliente nao informado',
        actorName: identity?.userName || currentUser.email || 'Analista',
        clientePrincipal: aprovacaoData?.clientePrincipal || aprovacaoData?.nomeClientePrincipal || '',
        situacao: aprovacaoData?.situacao || '',
        source: 'deleteAprovacao'
      }
    );
  }

  await aprovacaoCollection.doc(id).delete();

  invalidateCache();
  cacheService.invalidate(`${CACHE_KEY_PREFIX}${id}`);

  if (window.__DEBUG__) {
    console.log('[AprovacaoService] Aprovacao excluida:', id);
  }
}

/**
 * Converte uma aprovacao para processo
 * @param {string} aprovacaoId - ID da aprovacao
 * @param {{workflowId?: string, status?: string}} options - Dados opcionais do processo
 * @returns {Promise<string>} ID do processo criado
 */
export async function converterParaProcesso(aprovacaoId, options = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Usuario nao autenticado');
  }

  const aprovacao = await getAprovacao(aprovacaoId);

  if (!aprovacao) {
    throw new Error('Aprovacao nao encontrada');
  }

  if (aprovacao.situacao !== SITUACAO_APROVACAO.APROVADO) {
    throw new Error('Apenas aprovacoes APROVADAS podem ser convertidas em processo');
  }

  if (aprovacao.convertidoParaProcesso) {
    throw new Error('Esta aprovacao ja foi convertida em processo');
  }

  const conversionOptions = options && typeof options === 'object' ? options : {};
  const workflowId = normalizeProcessField(
    conversionOptions.workflowId,
    CONVERSAO_PROCESSO_DEFAULTS.workflowId
  );
  const status = normalizeProcessField(
    conversionOptions.status,
    CONVERSAO_PROCESSO_DEFAULTS.status
  );

  // Monta dados do processo
  const now = firebase.firestore.Timestamp.now();
  const dataEntradaProcesso = aprovacao.dataEntrada || now;

  const compradores = Array.isArray(aprovacao.compradores) && aprovacao.compradores.length > 0
    ? aprovacao.compradores.map((comprador, index) => ({
        cpf: comprador.cpf || '',
        nome: comprador.nome || aprovacao.nomesClientes?.[index] || '',
        principal: comprador.principal ?? index === 0
      }))
    : normalizeCompradoresAprovacao(null, aprovacao.cpfs || [], aprovacao.nomesClientes || []);

  const processoData = {
    // Compradores
    compradores,
    clientePrincipal: compradores[0]?.nome || '',

    // Dados do empreendimento
    empreendimento: aprovacao.empreendimento,
    vendedorConstrutora: aprovacao.construtora,

    // Dados financeiros
    renda: aprovacao.renda,
    valorFinanciamento: aprovacao.valorFinanciamento,

    // Metadata
    status,
    workflowId,
    origemAprovacao: aprovacaoId,
    analistaAprovacao: resolveAnalistaAprovacao(aprovacao),
    vencSicaq: aprovacao.vencSicaq || null,

    // Datas
    dataEntrada: dataEntradaProcesso,
    createdAt: now,
    updatedAt: now,
    criadoEm: now,
    entrada: dataEntradaProcesso,
    dataModificacao: now,
    modificadoPor: currentUser.email || currentUser.uid,
    criadoPor: currentUser.email || currentUser.uid
  };

  // Executa em batch
  const batch = db.batch();

  // Cria o processo
  const processoRef = db.collection('contracts').doc();
  batch.set(processoRef, withTenantData(processoData));

  // Atualiza a aprovacao
  const aprovacaoRef = aprovacaoCollection.doc(aprovacaoId);
  batch.update(aprovacaoRef, withTenantData({
    convertidoParaProcesso: true,
    processoId: processoRef.id,
    dataConversao: now,
    updatedAt: now,
    atualizadoPor: currentUser.email || currentUser.uid,
    dataModificacao: now,
    modificadoPor: currentUser.email || currentUser.uid
  }));

  await batch.commit();

  invalidateCache();
  cacheService.invalidate(`${CACHE_KEY_PREFIX}${aprovacaoId}`);

  if (window.__DEBUG__) {
    console.log('[AprovacaoService] Aprovacao convertida para processo:', aprovacaoId, '->', processoRef.id);
  }

  realtimeSyncService.publishUpdate(processoRef.id, 'origemAprovacao', 'create').catch((error) => {
    console.warn('[AprovacaoService] Falha ao publicar delta do processo convertido:', error);
  });

  return processoRef.id;
}

/**
 * Importa aprovacoes de um array (CSV parseado)
 * @param {Array} rows - Array de objetos com dados das aprovacoes
 * @param {Function} onProgress - Callback de progresso (current, total)
 * @returns {Promise<{success: number, errors: Array}>}
 */
export async function importAprovacoes(rows, onProgress = null, options = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Usuario nao autenticado');
  }

  const permissions = await permissionsService.getUserPermissions(currentUser.uid);
  if (!permissionsService.can(permissions, PERMISSION_MODULES.APROVACOES, PERMISSION_ACTIONS.IMPORT)) {
    throw new Error('Voce nao tem permissao para importar aprovacoes');
  }

  const BATCH_SIZE = 50;
  let success = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = rows.slice(i, i + BATCH_SIZE);

    for (const row of chunk) {
      try {
        const now = firebase.firestore.Timestamp.now();
        const dataEntradaTs = parseDate(row['DATA ENTRADA'] || row.dataEntrada) || now;
        const dataAprovacaoTs = parseDate(row['DATA DE APROVACAO'] || row['DATA APROVACAO'] || row.dataAprovacao);
        const vencSicaqTs = parseDate(
          row['VENCIMENTO SICAQ']
          || row['VENC SICAQ']
          || row['DATA VENC SICAQ']
          || row.vencSicaq
          || row.vencimentoSicaq
        );

        const compradores = normalizeCompradoresAprovacao(
          row.COMPRADORES || row.compradores,
          normalizeCPFs(row.CPF || row.cpf),
          normalizeNomes(row.CLIENTE || row.cliente)
        );

        const aprovacaoData = {
          cpfs: normalizeCPFs(row.CPF || row.cpf),
          nomesClientes: normalizeNomes(row.CLIENTE || row.cliente),
          cpfPrincipal: normalizeCPFs(row.CPF || row.cpf)[0] || '',
          nomeClientePrincipal: normalizeNomes(row.CLIENTE || row.cliente)[0] || '',
          clientePrincipal: normalizeNomes(row.CLIENTE || row.cliente)[0] || '',
          compradores,

          dataEntrada: dataEntradaTs,
          dataAprovacao: dataAprovacaoTs,
          vencSicaq: vencSicaqTs,
          createdAt: now,
          updatedAt: now,
          criadoEm: now,
          entrada: dataEntradaTs,
          dataModificacao: now,
          modificadoPor: currentUser.email || currentUser.uid,

          empreendimento: (row.EMPREENDIMENTO || row.empreendimento || '').trim(),
          construtora: (row.CONSTRUTORA || row.construtora || '').trim(),

          corretor: (row.CORRETOR || row.corretor || '').trim(),
          gerenteImobiliaria: (row['GERENTE/IMOBILIARIA'] || row.gerenteImobiliaria || '').trim(),
          analistaAprovacao: resolveAnalistaAprovacao(row),

          situacao: normalizeSituacao(row['SITUACAO'] || row.situacao),
          pendencia: (row['PENDENCIA'] || row.pendencia || '').trim(),

          renda: parseMonetaryValue(row.RENDA || row.renda),
          cartaFinanciamento: normalizeCartaFinanciamento(row['CARTA DE FINANCIAMENTO'] || row.cartaFinanciamento),
          valorFinanciamento: parseMonetaryValue(row['VALOR FINANCIAMENTO'] || row.valorFinanciamento),
          prazoMeses: parseInt(row.PRAZO || row.prazoMeses) || 0,

          criadoPor: currentUser.email || currentUser.uid,
          atualizadoPor: currentUser.email || currentUser.uid,
          importadoEm: now,

          convertidoParaProcesso: false,
          processoId: null,
          dataConversao: null
        };

        const ref = aprovacaoCollection.doc();
        batch.set(ref, withTenantData(aprovacaoData));
        success++;
      } catch (error) {
        errors.push({ row: i + rows.indexOf(row), error: error.message });
      }
    }

    await batch.commit();

    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, rows.length), rows.length);
    }

    // Pequeno delay entre batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  invalidateCache();

  if (window.__DEBUG__) {
    console.log('[AprovacaoService] Importacao concluida:', success, 'sucesso,', errors.length, 'erros');
  }

  if (activityLogService?.auditFileAction) {
    const fileName = options.fileName || `importacao_aprovacoes_${new Date().toISOString().slice(0, 10)}.csv`;
    const rawCsvContent = typeof options.rawCsvContent === 'string'
      ? options.rawCsvContent
      : JSON.stringify(rows, null, 2);

    await activityLogService.auditFileAction({
      actionType: 'CSV_IMPORT',
      description: `Importacao CSV de aprovacoes (${success} registros importados)`,
      module: 'aprovacao',
      page: 'aprovacao',
      source: 'importAprovacoes',
      filename: fileName,
      blobOrText: rawCsvContent,
      mimeType: 'text/csv;charset=utf-8;',
      rowCount: success,
      entityType: 'approval',
      extraData: {
        format: 'CSV',
        importedCount: success,
        errorCount: errors.length
      }
    });
  }

  return { success, errors };
}

// ============== FUNCOES AUXILIARES ==============

/**
 * Normaliza array de CPFs
 */
function normalizeCPFs(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(cpf => cpf.trim());

  // Separa por /, |, ou ;
  return String(input)
    .split(/[/|;]/)
    .map(cpf => cpf.trim())
    .filter(cpf => cpf.length > 0);
}

/**
 * Normaliza array de nomes
 */
function normalizeNomes(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(nome => nome.trim());

  // Separa por / ou |
  return String(input)
    .split(/[/|]/)
    .map(nome => nome.trim())
    .filter(nome => nome.length > 0);
}

/**
 * Normaliza compradores para o padrao da colecao contracts
 */
function normalizeCompradoresAprovacao(input, cpfs = [], nomesClientes = []) {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((comprador, index) => ({
      cpf: String(comprador.cpf || '').trim(),
      nome: String(comprador.nome || comprador.cliente || comprador.nomeCompleto || '').trim(),
      principal: comprador.principal !== undefined ? !!comprador.principal : index === 0
    }));
  }

  const maxLength = Math.max(cpfs.length, nomesClientes.length);
  const compradores = [];

  for (let i = 0; i < maxLength; i += 1) {
    compradores.push({
      cpf: cpfs[i] || '',
      nome: nomesClientes[i] || '',
      principal: i === 0
    });
  }

  return compradores;
}

/**
 * Normaliza situacao
 */
function normalizeSituacao(input) {
  if (!input) return SITUACAO_APROVACAO.CONDICIONADO;

  const upper = String(input).toUpperCase().trim();

  if (upper.includes('APROVAD')) return SITUACAO_APROVACAO.APROVADO;
  if (upper.includes('REPROVAD')) return SITUACAO_APROVACAO.REPROVADO;
  if (upper.includes('CONDICION')) return SITUACAO_APROVACAO.CONDICIONADO;

  return SITUACAO_APROVACAO.CONDICIONADO;
}

/**
 * Normaliza tipo de carta
 */
function normalizeCartaFinanciamento(input) {
  if (!input) return TIPO_CARTA.MCMV;

  const upper = String(input).toUpperCase().trim();

  if (upper.includes('SBPE')) return TIPO_CARTA.SBPE;
  if (upper.includes('SFI')) return TIPO_CARTA.SFI;
  return TIPO_CARTA.MCMV;
}

/**
 * Converte valor monetario para numero
 */
function parseMonetaryValue(input) {
  if (!input) return 0;
  if (typeof input === 'number') return input;

  // Remove R$, pontos de milhar e troca virgula por ponto
  const cleaned = String(input)
    .replace(/R\$/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
    .trim();

  return parseFloat(cleaned) || 0;
}

/**
 * Converte data para Timestamp
 */
function toTimestamp(input) {
  if (!input) return null;
  if (input instanceof firebase.firestore.Timestamp) return input;

  let date = null;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      date = new Date(year, month - 1, day);
    } else {
      date = new Date(trimmed);
    }
  } else {
    date = new Date(input);
  }

  if (isNaN(date.getTime())) return null;

  return firebase.firestore.Timestamp.fromDate(date);
}

function toDateForMetrics(input, { endOfDay = false } = {}) {
  if (!input) return null;

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  if (typeof input?.toDate === 'function') {
    const asDate = input.toDate();
    return Number.isNaN(asDate?.getTime?.()) ? null : asDate;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsed = new Date(`${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof input === 'number') {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function resolveAprovacaoMetricDate(item = {}) {
  const candidates = [
    item.dataEntrada,
    item.entrada,
    item.createdAt,
    item.criadoEm
  ];

  for (const candidate of candidates) {
    const parsed = toDateForMetrics(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function isSolicitacaoAnaliseRecord(aprovacao = {}) {
  const origemCanal = normalizeIdentity(aprovacao?.origemCanal);
  const hasKnownOrigin = SOLICITACAO_ORIGENS.has(origemCanal)
    || Boolean(aprovacao?.origemWhatsAppChatId)
    || Boolean(aprovacao?.origemSolicitacaoId);

  if (!hasKnownOrigin) return false;

  const analyst = normalizeIdentity(aprovacao?.analistaAprovacao);
  return !analyst || analyst === INTAKE_ANALYST_QUEUE;
}

function applyDateRangeToAprovacaoQuery(query, dataInicio, dataFim, field = 'dataAprovacao') {
  const startDate = toDateForMetrics(dataInicio);
  const endDate = toDateForMetrics(dataFim, { endOfDay: true });

  let nextQuery = query;
  if (startDate) {
    nextQuery = nextQuery.where(field, '>=', firebase.firestore.Timestamp.fromDate(startDate));
  }
  if (endDate) {
    nextQuery = nextQuery.where(field, '<=', firebase.firestore.Timestamp.fromDate(endDate));
  }

  return nextQuery;
}

async function countConvertedAprovacoesByDateRange(dataInicio, dataFim) {
  let query = tenantQuery(aprovacaoCollection).where('convertidoParaProcesso', '==', true);
  query = applyDateRangeToAprovacaoQuery(query, dataInicio, dataFim, 'dataAprovacao');

  if (typeof query.count !== 'function') {
    return null;
  }

  try {
    const aggregate = await query.count().get();
    return Number(aggregate?.data?.().count || 0);
  } catch (error) {
    if (window.__DEBUG__) {
      console.warn('[AprovacaoService] Falha ao contar aprovacoes convertidas por periodo:', error);
    }
    return null;
  }
}

/**
 * Parse de data de string
 */
function parseDate(input) {
  if (!input) return null;

  // Tenta varios formatos
  let date;

  // dd/mm/yyyy ou dd-mm-yyyy ou dd.mm.yyyy
  const ddmmyyyy = input.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (ddmmyyyy) {
    date = new Date(ddmmyyyy[3], ddmmyyyy[2] - 1, ddmmyyyy[1]);
  }

  // mm/dd/yyyy (formato US)
  if (!date || isNaN(date.getTime())) {
    const mmddyyyy = input.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mmddyyyy) {
      date = new Date(mmddyyyy[3], mmddyyyy[1] - 1, mmddyyyy[2]);
    }
  }

  // yyyy-mm-dd
  if (!date || isNaN(date.getTime())) {
    date = new Date(input);
  }

  if (isNaN(date.getTime())) return null;

  return firebase.firestore.Timestamp.fromDate(date);
}

function normalizePageSize(pageSize) {
  const parsed = Number(pageSize);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return PAGE_SIZE_DEFAULT;
  }

  return Math.min(Math.floor(parsed), FIRESTORE_MAX_QUERY_LIMIT);
}

function normalizeInFilterValues(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter((item) => item && item.toLowerCase() !== 'todas');
  }

  const single = String(value || '').trim();
  if (!single || single === 'todas') return [];
  return [single];
}

function parseDateBoundary(input, { endOfDay = false } = {}) {
  if (!input) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  let parsedDate = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    parsedDate = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  } else {
    parsedDate = new Date(raw);
  }

  if (Number.isNaN(parsedDate.getTime())) return null;
  return parsedDate;
}

function isFirestoreMissingIndexError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  return (
    code.includes('failed-precondition') ||
    message.includes('failed precondition') ||
    message.includes('requires an index') ||
    message.includes('index')
  );
}

function resolveAnalistaAprovacao(source = {}, fallback = '') {
  const candidates = [];

  if (source && typeof source === 'object') {
    candidates.push(
      source.analistaAprovacao,
      source[ANALYST_FIELD],
      source.analistaResponsavel,
      source[LEGACY_ANALYST_FIELD],
      source.analista,
      source.ANALISTA
    );
  } else {
    candidates.push(source);
  }

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim();
  }

  return '';
}

function normalizeAprovacaoDoc(docData = {}) {
  return {
    ...docData,
    analistaAprovacao: resolveAnalistaAprovacao(docData)
  };
}

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function isAdminRolePermission(permissions = {}) {
  const role = normalizeIdentity(permissions?.role);
  return role === PERMISSION_ROLES.ADMIN || role === PERMISSION_ROLES.SUPER_ADMIN;
}

function isAprovacaoOwner(aprovacao = {}, currentUser = {}) {
  const userIdentities = new Set(
    [currentUser.uid, currentUser.email]
      .map(normalizeIdentity)
      .filter(Boolean)
  );
  if (userIdentities.size === 0) return false;

  const ownerCandidates = [
    aprovacao?.criadoPor,
    aprovacao?.createdBy,
    aprovacao?.criadoPorUid,
    aprovacao?.createdByUid,
    aprovacao?.ownerId
  ];

  return ownerCandidates
    .map(normalizeIdentity)
    .some((identity) => identity && userIdentities.has(identity));
}

function normalizeProcessField(input, fallback) {
  if (typeof input !== 'string') {
    return fallback;
  }

  const normalized = input.trim();
  return normalized || fallback;
}

function normalizeCachePart(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item || '').trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join(',');
  }

  if (value === undefined || value === null || value === '') {
    return '';
  }

  return String(value).trim().toLowerCase();
}

function buildCacheSignature(parts = {}) {
  return Object.keys(parts)
    .sort()
    .map((key) => `${key}:${encodeURIComponent(normalizeCachePart(parts[key]))}`)
    .join('|');
}

/**
 * Invalida cache de aprovacoes
 */
function invalidateCache() {
  cacheService.invalidate(CACHE_KEY_ALL);
  cacheService.invalidateByPattern(/^aprovacao_/);
  cacheService.invalidateByPattern(/^aprovacoes_/);
}

// Exporta servico como objeto
const aprovacaoService = {
  createAprovacao,
  updateAprovacao,
  getAprovacao,
  getAprovacaoCursorDocById,
  listenForAprovacoesDelta,
  listAprovacoes,
  listAprovacoesForMetrics,
  listAprovacaoAnalystCatalog,
  listAprovacaoConversionLinks,
  listAprovacaoSolicitacoesRecords,
  listSolicitacoesAnalise,
  getAprovacaoStats,
  getAprovacaoAnalystRankingAggregate,
  getAprovacaoConversionMetricsAggregate,
  deleteAprovacao,
  converterParaProcesso,
  importAprovacoes,
  SITUACAO_APROVACAO,
  TIPO_CARTA,
  SITUACAO_COLORS,
  CONVERSAO_PROCESSO_DEFAULTS,
  invalidateCache
};

// Expoe globalmente para debug
if (typeof window !== 'undefined') {
  window.aprovacaoService = aprovacaoService;
}

export default aprovacaoService;
