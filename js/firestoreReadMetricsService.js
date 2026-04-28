/**
 * @file firestoreReadMetricsService.js
 * @description Serviço de métricas de leituras Firestore com persistência
 *
 * Este serviço:
 * - Agrega métricas de leituras do Firestore
 * - Persiste dados diários no Firestore (collection: _readMetrics)
 * - Rastreia consumo por usuário
 * - Fornece dados históricos para análise
 * - Gera alertas quando limites são atingidos
 *
 * Uso:
 * - readMetricsService.recordRead(collection, count, source)
 * - readMetricsService.getReport()
 * - readMetricsService.getDailyStats()
 */

const METRICS_SCHEMA_VERSION = 3;
const UNKNOWN_METRIC_DIMENSION = 'unknown';
const UNATTRIBUTED_BUCKET_KEY = '__unattributed__';
const LOW_ATTRIBUTION_RATE_PERCENT = 85;
const MAX_RECENT_REQUEST_SAMPLES = 100;

class FirestoreReadMetricsService {
  constructor() {
    this.config = {
      // Limites de alerta (ajuste conforme plano Firebase)
      dailyReadLimit: 50000,       // Alerta ao atingir 50k leituras/dia
      hourlyReadLimit: 5000,       // Alerta ao atingir 5k leituras/hora
      userReadLimit: 10000,        // Alerta por usuário/dia

      // Intervalo de persistência (evita muitas escritas)
      persistIntervalMs: 5 * 60 * 1000, // 5 minutos

      // Retenção de dados
      retentionDays: 30            // Mantém 30 dias de histórico
    };

    // Métricas em memória (agregadas antes de persistir)
    this.currentSession = {
      startTime: Date.now(),
      userId: null,
      reads: {
        total: 0,
        attributedTotal: 0,
        byCollection: {},
        bySource: {},
        byHour: {},
        byOperation: {},
        byPage: {},
        byPageHour: {},
        byPageCollection: {},
        byUserPage: {},
        byUserPageCollection: {}
      },
      requestSamples: [],
      cacheStats: {
        hits: 0,
        misses: 0
      },
      alerts: []
    };

    // Controle de persistência
    this.lastPersist = 0;
    this.pendingPersist = false;

    // Flag de inicialização
    this.initialized = false;

    console.log('[ReadMetrics] Serviço de métricas inicializado');
  }

  /**
   * Inicializa o serviço com o usuário atual
   * @param {string} userId - ID do usuário
   */
  async init(userId) {
    if (this.initialized) return;

    this.currentSession.userId = userId;
    this.initialized = true;

    // Carrega métricas do dia atual (se existirem)
    await this.loadTodayMetrics();

    // Inicia persistência periódica
    this.startPeriodicPersist();

    // Persiste ao fechar página
    window.addEventListener('beforeunload', () => {
      this.persistMetrics(true);
    });

    // Persiste ao perder visibilidade
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.persistMetrics(true);
      }
    });

    console.log('[ReadMetrics] Iniciado para usuário:', userId);
  }

  /**
   * Registra uma operação de leitura
   * @param {string} collection - Nome da coleção
   * @param {number} count - Número de documentos lidos
   * @param {string} source - Módulo/função de origem
   * @param {string} operation - Tipo de operação (get, getDocs, onSnapshot)
   */
  recordRead(collection, count, source = 'unknown', operation = 'get', metadata = {}) {
    const readCount = Number(count);
    if (!Number.isFinite(readCount) || readCount <= 0) return;

    const requestDate = this.resolveRequestDate(metadata?.timestamp);
    const requestTimestamp = requestDate.toISOString();
    const hourKey = requestTimestamp.slice(0, 13); // YYYY-MM-DDTHH
    const collectionKey = this.normalizeMetricDimension(collection);
    const sourceKey = this.normalizeMetricDimension(source);
    const operationKey = this.normalizeMetricDimension(operation, 'get');
    const pageKey = this.resolveCurrentPage(metadata?.page);
    const userKey = this.resolveCurrentUser(metadata?.userId);
    const pageHourKey = `${pageKey}__${hourKey}`;
    const pageCollectionKey = `${pageKey}__${collectionKey}`;
    const userPageKey = `${userKey}__${pageKey}`;
    const userPageCollectionKey = `${userKey}__${pageKey}__${collectionKey}`;

    // Atualiza totais
    this.currentSession.reads.total += readCount;
    this.currentSession.reads.attributedTotal += readCount;

    // Por coleção
    if (!this.currentSession.reads.byCollection[collectionKey]) {
      this.currentSession.reads.byCollection[collectionKey] = 0;
    }
    this.currentSession.reads.byCollection[collectionKey] += readCount;

    // Por fonte/módulo
    if (!this.currentSession.reads.bySource[sourceKey]) {
      this.currentSession.reads.bySource[sourceKey] = 0;
    }
    this.currentSession.reads.bySource[sourceKey] += readCount;

    // Por hora
    if (!this.currentSession.reads.byHour[hourKey]) {
      this.currentSession.reads.byHour[hourKey] = 0;
    }
    this.currentSession.reads.byHour[hourKey] += readCount;

    // Por operação
    if (!this.currentSession.reads.byOperation[operationKey]) {
      this.currentSession.reads.byOperation[operationKey] = 0;
    }
    this.currentSession.reads.byOperation[operationKey] += readCount;

    if (!this.currentSession.reads.byPage[pageKey]) {
      this.currentSession.reads.byPage[pageKey] = 0;
    }
    this.currentSession.reads.byPage[pageKey] += readCount;

    if (!this.currentSession.reads.byPageHour[pageHourKey]) {
      this.currentSession.reads.byPageHour[pageHourKey] = 0;
    }
    this.currentSession.reads.byPageHour[pageHourKey] += readCount;

    if (!this.currentSession.reads.byPageCollection[pageCollectionKey]) {
      this.currentSession.reads.byPageCollection[pageCollectionKey] = 0;
    }
    this.currentSession.reads.byPageCollection[pageCollectionKey] += readCount;

    if (!this.currentSession.reads.byUserPage[userPageKey]) {
      this.currentSession.reads.byUserPage[userPageKey] = 0;
    }
    this.currentSession.reads.byUserPage[userPageKey] += readCount;

    if (!this.currentSession.reads.byUserPageCollection[userPageCollectionKey]) {
      this.currentSession.reads.byUserPageCollection[userPageCollectionKey] = 0;
    }
    this.currentSession.reads.byUserPageCollection[userPageCollectionKey] += readCount;

    this.addRequestSample({
      timestamp: requestTimestamp,
      userId: userKey,
      page: pageKey,
      collection: collectionKey,
      source: sourceKey,
      operation: operationKey,
      count: readCount
    });

    // Verifica alertas
    this.checkAlerts();

    // Agenda persistência se necessário
    this.schedulePersist();
  }

  resolveRequestDate(value = null) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    }
    return new Date();
  }

  resolveCurrentPage(explicitPage = '') {
    const rawPage = String(explicitPage || '').trim();
    if (rawPage) return this.normalizeMetricDimension(rawPage);

    const pathname = window.location?.pathname || '';
    const filename = pathname.split('/').filter(Boolean).pop() || 'index.html';
    const hash = String(window.location?.hash || '').replace(/^#/, '').trim();
    const page = hash || filename.replace(/\.html$/i, '') || 'unknown';
    return this.normalizeMetricDimension(page);
  }

  resolveCurrentUser(explicitUserId = '') {
    const rawUserId = String(explicitUserId || this.currentSession.userId || '').trim();
    if (rawUserId) return this.normalizeMetricDimension(rawUserId, 'anonymous');

    const authUserId = window.firebase?.auth?.()?.currentUser?.uid || '';
    return this.normalizeMetricDimension(authUserId, 'anonymous');
  }

  addRequestSample(sample = {}) {
    this.currentSession.requestSamples.push(sample);
    if (this.currentSession.requestSamples.length > MAX_RECENT_REQUEST_SAMPLES) {
      this.currentSession.requestSamples.splice(
        0,
        this.currentSession.requestSamples.length - MAX_RECENT_REQUEST_SAMPLES
      );
    }
  }

  /**
   * Registra hit/miss de cache
   * @param {boolean} isHit - true se foi cache hit
   */
  recordCacheAccess(isHit) {
    if (isHit) {
      this.currentSession.cacheStats.hits++;
    } else {
      this.currentSession.cacheStats.misses++;
    }
  }

  /**
   * Verifica e gera alertas quando limites são atingidos
   */
  checkAlerts() {
    const now = Date.now();
    const currentHour = new Date(now).toISOString().slice(0, 13);
    const hourlyReads = this.currentSession.reads.byHour[currentHour] || 0;

    // Alerta de limite horário
    if (hourlyReads >= this.config.hourlyReadLimit) {
      const alertKey = `hourly_${currentHour}`;
      if (!this.currentSession.alerts.find(a => a.key === alertKey)) {
        this.addAlert('high', `Limite horário atingido: ${hourlyReads} leituras`, alertKey);
      }
    }

    // Alerta de limite diário
    if (this.currentSession.reads.total >= this.config.dailyReadLimit) {
      const today = new Date().toISOString().slice(0, 10);
      const alertKey = `daily_${today}`;
      if (!this.currentSession.alerts.find(a => a.key === alertKey)) {
        this.addAlert('critical', `Limite diário atingido: ${this.currentSession.reads.total} leituras`, alertKey);
      }
    }
  }

  /**
   * Adiciona um alerta
   */
  addAlert(severity, message, key) {
    const alert = {
      key,
      severity,
      message,
      timestamp: Date.now(),
      userId: this.currentSession.userId
    };

    this.currentSession.alerts.push(alert);

    // Log no console
    const icon = severity === 'critical' ? '' : severity === 'high' ? '' : '';
    console.warn(`${icon} [ReadMetrics ALERTA] ${message}`);

    // Notifica admin se crítico (pode integrar com sistema de notificações)
    if (severity === 'critical' && window.notificationService) {
      window.notificationService.showWarning('Alerta de Leituras Firestore', message);
    }
  }

  /**
   * Agenda persistência de métricas
   */
  schedulePersist() {
    if (this.pendingPersist) return;

    const now = Date.now();
    const timeSinceLastPersist = now - this.lastPersist;

    if (timeSinceLastPersist >= this.config.persistIntervalMs) {
      this.persistMetrics();
    } else {
      this.pendingPersist = true;
      setTimeout(() => {
        this.pendingPersist = false;
        this.persistMetrics();
      }, this.config.persistIntervalMs - timeSinceLastPersist);
    }
  }

  /**
   * Inicia persistência periódica
   */
  startPeriodicPersist() {
    setInterval(() => {
      if (this.currentSession.reads.total > 0) {
        this.persistMetrics();
      }
    }, this.config.persistIntervalMs);
  }

  /**
   * Persiste métricas no Firestore
   * @param {boolean} force - Força persistência imediata
   */
  async persistMetrics(force = false) {
    if (!this.initialized) return;

    const sessionReads = {
      total: Number(this.currentSession.reads.total) || 0,
      attributedTotal: Number(this.currentSession.reads.attributedTotal) || 0,
      byCollection: { ...this.currentSession.reads.byCollection },
      bySource: { ...this.currentSession.reads.bySource },
      byHour: { ...this.currentSession.reads.byHour },
      byOperation: { ...this.currentSession.reads.byOperation },
      byPage: { ...this.currentSession.reads.byPage },
      byPageHour: { ...this.currentSession.reads.byPageHour },
      byPageCollection: { ...this.currentSession.reads.byPageCollection },
      byUserPage: { ...this.currentSession.reads.byUserPage },
      byUserPageCollection: { ...this.currentSession.reads.byUserPageCollection }
    };
    const requestSamples = this.currentSession.requestSamples.slice(-MAX_RECENT_REQUEST_SAMPLES);
    const lastRequest = requestSamples[requestSamples.length - 1] || null;
    const sessionCache = { ...this.currentSession.cacheStats };
    const pendingAlerts = this.currentSession.alerts
      .filter(a => !a.persisted)
      .map(a => ({ ...a, persisted: true }));
    const unattributedTotal = Math.max(0, sessionReads.total - sessionReads.attributedTotal);

    if (!force && sessionReads.total === 0) return;

    try {
      const db = window.firebase?.firestore();
      if (!db) return;

      const today = new Date().toISOString().slice(0, 10);
      const docId = `${today}_${this.currentSession.userId || 'anonymous'}`;

      const metricsRef = db.collection('_readMetrics').doc(docId);

      const payload = {
        schemaVersion: METRICS_SCHEMA_VERSION,
        date: today,
        userId: this.currentSession.userId,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        reads: {
          total: firebase.firestore.FieldValue.increment(sessionReads.total),
          attributedTotal: firebase.firestore.FieldValue.increment(sessionReads.attributedTotal),
          unattributedTotal: firebase.firestore.FieldValue.increment(unattributedTotal),
          byCollection: this.mergeCounters(sessionReads.byCollection),
          bySource: this.mergeCounters(sessionReads.bySource),
          byHour: this.mergeCounters(sessionReads.byHour),
          byOperation: this.mergeCounters(sessionReads.byOperation),
          byPage: this.mergeCounters(sessionReads.byPage),
          byPageHour: this.mergeCounters(sessionReads.byPageHour),
          byPageCollection: this.mergeCounters(sessionReads.byPageCollection),
          byUserPage: this.mergeCounters(sessionReads.byUserPage),
          byUserPageCollection: this.mergeCounters(sessionReads.byUserPageCollection)
        },
        cache: {
          hits: firebase.firestore.FieldValue.increment(sessionCache.hits),
          misses: firebase.firestore.FieldValue.increment(sessionCache.misses)
        }
      };

      if (pendingAlerts.length > 0) {
        payload.alerts = firebase.firestore.FieldValue.arrayUnion(...pendingAlerts);
      }
      if (lastRequest) {
        payload.lastRequest = lastRequest;
      }
      if (requestSamples.length > 0) {
        payload.recentRequests = requestSamples;
      }

      // Usa merge para acumular ao longo do dia
      await metricsRef.set(payload, { merge: true });

      // Limpa contadores locais após persistir
      this.resetSessionCounters();
      this.lastPersist = Date.now();

      console.log('[ReadMetrics] Métricas persistidas');
    } catch (error) {
      console.error('[ReadMetrics] Erro ao persistir:', error);
    }
  }

  /**
   * Converte contadores para incrementos do Firestore
   */
  mergeCounters(counters) {
    const result = {};
    for (const [key, value] of Object.entries(counters)) {
      const numericValue = Number(value) || 0;
      if (numericValue <= 0) continue;
      // Sanitiza a chave (Firestore não aceita . ou /)
      const safeKey = this.normalizeMetricDimension(key).replace(/[./]/g, '_');
      result[safeKey] = firebase.firestore.FieldValue.increment(numericValue);
    }
    return result;
  }

  /**
   * Reseta contadores da sessão (após persistir)
   */
  resetSessionCounters() {
    this.currentSession.reads = {
      total: 0,
      attributedTotal: 0,
      byCollection: {},
      bySource: {},
      byHour: {},
      byOperation: {},
      byPage: {},
      byPageHour: {},
      byPageCollection: {},
      byUserPage: {},
      byUserPageCollection: {}
    };
    this.currentSession.requestSamples = [];
    this.currentSession.cacheStats = { hits: 0, misses: 0 };
    this.currentSession.alerts = this.currentSession.alerts.filter(a => !a.persisted);
  }

  /**
   * Carrega métricas do dia atual
   */
  async loadTodayMetrics() {
    try {
      const db = window.firebase?.firestore();
      if (!db) return;

      const today = new Date().toISOString().slice(0, 10);
      const docId = `${today}_${this.currentSession.userId || 'anonymous'}`;

      const doc = await db.collection('_readMetrics').doc(docId).get();
      if (doc.exists) {
        const data = doc.data();
        const attribution = this.resolveReadAttribution(data.reads);
        if (attribution.unattributedReads > 0) {
          console.warn(
            `[ReadMetrics] Documento atual possui ${attribution.unattributedReads} leituras sem atribuicao. ` +
            'Novas medicoes vao persistir esse gap explicitamente.'
          );
        }
        console.log(`[ReadMetrics] Carregado histórico de hoje: ${data.reads?.total || 0} leituras`);
      }
    } catch (error) {
      console.warn('[ReadMetrics] Erro ao carregar métricas:', error);
    }
  }

  /**
   * Obtém estatísticas do dia atual
   * @returns {Promise<Object>} Estatísticas do dia
   */
  async getDailyStats() {
    try {
      const db = window.firebase?.firestore();
      if (!db) return this.getLocalStats();

      const today = new Date().toISOString().slice(0, 10);
      const userId = this.currentSession.userId || window.firebase?.auth()?.currentUser?.uid;

      // Verifica se o usuario e admin para decidir escopo da query
      let isAdmin = false;
      try {
        const tokenResult = await window.firebase?.auth()?.currentUser?.getIdTokenResult();
        isAdmin = tokenResult?.claims?.admin === true;
      } catch {
        // Se nao conseguir verificar, assume nao-admin
      }

      let snapshot;
      if (isAdmin) {
        // Admin: busca todos os documentos do dia (todos os usuarios)
        snapshot = await db.collection('_readMetrics')
          .where('date', '==', today)
          .get();
      } else {
        // Usuario comum: busca apenas seu proprio documento
        const docId = `${today}_${userId}`;
        const doc = await db.collection('_readMetrics').doc(docId).get();
        snapshot = { docs: doc.exists ? [doc] : [], forEach: function(fn) { this.docs.forEach(fn); } };
      }

      let totalReads = 0;
      let attributedReads = 0;
      let unattributedReads = 0;
      let totalCacheHits = 0;
      let totalCacheMisses = 0;
      const byCollection = {};
      const byPage = {};
      const byUser = {};
      const alerts = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        const attribution = this.resolveReadAttribution(data.reads);
        totalReads += attribution.totalReads;
        attributedReads += attribution.attributedReads;
        unattributedReads += attribution.unattributedReads;
        totalCacheHits += data.cache?.hits || 0;
        totalCacheMisses += data.cache?.misses || 0;

        // Agrega por coleção
        if (data.reads?.byCollection) {
          for (const [col, count] of Object.entries(data.reads.byCollection)) {
            byCollection[col] = (byCollection[col] || 0) + count;
          }
        }
        if (data.reads?.byPage) {
          for (const [page, count] of Object.entries(data.reads.byPage)) {
            byPage[page] = (byPage[page] || 0) + count;
          }
        }
        this.addUnattributedBucket(byCollection, attribution.unattributedReads);

        // Por usuário
        if (data.userId) {
          byUser[data.userId] = (byUser[data.userId] || 0) + attribution.totalReads;
        }

        // Alertas
        if (data.alerts) {
          alerts.push(...data.alerts);
        }
      });

      // Adiciona dados locais ainda não persistidos
      const local = this.getLocalStats();
      totalReads += local.reads.total;
      attributedReads += local.attribution.attributedReads;
      unattributedReads += local.attribution.unattributedReads;
      totalCacheHits += local.cache.hits;
      totalCacheMisses += local.cache.misses;
      this.mergeCounterMap(byCollection, local.reads.byCollection);
      this.mergeCounterMap(byPage, local.reads.byPage);
      this.addUnattributedBucket(byCollection, local.attribution.unattributedReads);

      const cacheTotal = totalCacheHits + totalCacheMisses;
      const cacheHitRate = cacheTotal > 0 ? (totalCacheHits / cacheTotal * 100).toFixed(1) : 0;
      const attributionRate = totalReads > 0
        ? ((attributedReads / totalReads) * 100).toFixed(1)
        : '100.0';

      return {
        date: today,
        totalReads,
        readsRemaining: Math.max(0, this.config.dailyReadLimit - totalReads),
        percentUsed: ((totalReads / this.config.dailyReadLimit) * 100).toFixed(1),
        cache: {
          hits: totalCacheHits,
          misses: totalCacheMisses,
          hitRate: `${cacheHitRate}%`
        },
        attribution: {
          attributedReads,
          unattributedReads,
          rate: `${attributionRate}%`
        },
        byCollection,
        byPage,
        byUser,
        alerts: alerts.slice(-10), // Últimos 10 alertas
        projectedDaily: this.calculateProjection(totalReads)
      };
    } catch (error) {
      console.error('[ReadMetrics] Erro ao obter stats:', error);
      return this.getLocalStats();
    }
  }

  /**
   * Obtém estatísticas históricas (últimos N dias)
   * @param {number} days - Número de dias
   * @returns {Promise<Array>} Array de estatísticas diárias
   */
  async getHistoricalStats(days = 7) {
    try {
      const db = window.firebase?.firestore();
      if (!db) return [];

      const userId = this.currentSession.userId || window.firebase?.auth()?.currentUser?.uid;

      // Verifica se o usuario e admin para decidir escopo da query
      let isAdmin = false;
      try {
        const tokenResult = await window.firebase?.auth()?.currentUser?.getIdTokenResult();
        isAdmin = tokenResult?.claims?.admin === true;
      } catch {
        // Se nao conseguir verificar, assume nao-admin
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().slice(0, 10);

      let snapshot;
      if (isAdmin) {
        snapshot = await db.collection('_readMetrics')
          .where('date', '>=', startDateStr)
          .orderBy('date', 'desc')
          .get();
      } else {
        // Usuario comum: busca seus proprios documentos por docId (YYYY-MM-DD_userId)
        // Evita necessidade de indice composto
        const docs = [];
        const current = new Date();
        for (let i = 0; i < days; i++) {
          const dateStr = current.toISOString().slice(0, 10);
          if (dateStr < startDateStr) break;
          const docId = `${dateStr}_${userId}`;
          const doc = await db.collection('_readMetrics').doc(docId).get();
          if (doc.exists) docs.push(doc);
          current.setDate(current.getDate() - 1);
        }
        snapshot = { docs, forEach: function(fn) { this.docs.forEach(fn); } };
      }

      const byDate = {};

      snapshot.forEach(doc => {
        const data = doc.data();
        const date = data.date;

        if (!byDate[date]) {
          byDate[date] = {
            date,
            totalReads: 0,
            attributedReads: 0,
            unattributedReads: 0,
            cacheHits: 0,
            cacheMisses: 0,
            users: new Set()
          };
        }

        const attribution = this.resolveReadAttribution(data.reads);
        byDate[date].totalReads += attribution.totalReads;
        byDate[date].attributedReads += attribution.attributedReads;
        byDate[date].unattributedReads += attribution.unattributedReads;
        byDate[date].cacheHits += data.cache?.hits || 0;
        byDate[date].cacheMisses += data.cache?.misses || 0;
        if (data.userId) byDate[date].users.add(data.userId);
      });

      return Object.values(byDate).map(day => ({
        ...day,
        userCount: day.users.size,
        users: undefined, // Remove Set
        attributionRate: day.totalReads > 0
          ? ((day.attributedReads / day.totalReads) * 100).toFixed(1) + '%'
          : '100%',
        cacheHitRate: day.cacheHits + day.cacheMisses > 0
          ? ((day.cacheHits / (day.cacheHits + day.cacheMisses)) * 100).toFixed(1) + '%'
          : '0%'
      }));
    } catch (error) {
      console.error('[ReadMetrics] Erro ao obter histórico:', error);
      return [];
    }
  }

  /**
   * Calcula projeção de leituras para o dia
   */
  calculateProjection(currentReads) {
    const now = new Date();
    const hoursElapsed = now.getHours() + (now.getMinutes() / 60);

    if (hoursElapsed < 1) return currentReads;

    const readsPerHour = currentReads / hoursElapsed;
    const projectedDaily = Math.round(readsPerHour * 24);

    return {
      readsPerHour: Math.round(readsPerHour),
      projectedDaily,
      willExceedLimit: projectedDaily > this.config.dailyReadLimit
    };
  }

  /**
   * Obtém estatísticas locais (não persistidas)
   */
  getLocalStats() {
    const cacheTotal = this.currentSession.cacheStats.hits + this.currentSession.cacheStats.misses;
    const hitRate = cacheTotal > 0
      ? (this.currentSession.cacheStats.hits / cacheTotal * 100).toFixed(1)
      : 0;
    const attribution = this.resolveReadAttribution(this.currentSession.reads);

    return {
      sessionDuration: Math.round((Date.now() - this.currentSession.startTime) / 1000),
      reads: { ...this.currentSession.reads },
      attribution,
      cache: {
        ...this.currentSession.cacheStats,
        hitRate: `${hitRate}%`
      },
      alerts: this.currentSession.alerts
    };
  }

  /**
   * Gera relatório completo
   */
  async getReport() {
    const daily = await this.getDailyStats();
    const history = await this.getHistoricalStats(7);
    const local = this.getLocalStats();

    return {
      current: local,
      daily,
      history,
      config: this.config,
      recommendations: this.generateRecommendations(daily)
    };
  }

  /**
   * Gera recomendações baseadas nas métricas
   */
  generateRecommendations(stats) {
    const recommendations = [];

    if (stats.percentUsed > 80) {
      recommendations.push({
        severity: 'critical',
        message: `Uso de leituras em ${stats.percentUsed}%. Considere otimizar queries ou aumentar cache TTL.`
      });
    }

    const cacheHitRate = parseFloat(stats.cache?.hitRate) || 0;
    if (cacheHitRate < 50) {
      recommendations.push({
        severity: 'high',
        message: `Taxa de cache baixa (${cacheHitRate}%). Aumente TTL do cacheService.`
      });
    }

    const attributionRate = parseFloat(stats.attribution?.rate) || 100;
    const unattributedReads = Number(stats.attribution?.unattributedReads) || 0;
    if (unattributedReads > 0 && attributionRate < LOW_ATTRIBUTION_RATE_PERCENT) {
      recommendations.push({
        severity: 'high',
        message: `${unattributedReads} leituras estao sem atribuicao (${stats.attribution.rate}). Revise clientes legados e a instrumentacao de _readMetrics.`
      });
    }

    if (stats.projectedDaily?.willExceedLimit) {
      recommendations.push({
        severity: 'high',
        message: `Projeção: ${stats.projectedDaily.projectedDaily} leituras/dia. Limite será excedido.`
      });
    }

    // Identifica coleções mais consumidas
    if (stats.byCollection) {
      const sorted = Object.entries(stats.byCollection)
        .sort(([,a], [,b]) => b - a);

      if (sorted.length > 0 && sorted[0][1] > stats.totalReads * 0.5) {
        recommendations.push({
          severity: 'medium',
          message: `Coleção "${sorted[0][0]}" representa ${((sorted[0][1] / stats.totalReads) * 100).toFixed(0)}% das leituras. Considere otimizar.`
        });
      }
    }

    return recommendations;
  }

  /**
   * Limpa métricas antigas (manutenção)
   */
  async cleanupOldMetrics() {
    try {
      const db = window.firebase?.firestore();
      if (!db) return;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
      const cutoffStr = cutoffDate.toISOString().slice(0, 10);

      const snapshot = await db.collection('_readMetrics')
        .where('date', '<', cutoffStr)
        .limit(100)
        .get();

      const batch = db.batch();
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      if (snapshot.size > 0) {
        await batch.commit();
        console.log(`[ReadMetrics] Removidas ${snapshot.size} métricas antigas`);
      }
    } catch (error) {
      console.error('[ReadMetrics] Erro na limpeza:', error);
    }
  }

  /**
   * Imprime relatório no console
   */
  async printReport() {
    const report = await this.getReport();

    console.group(' RELATÓRIO DE LEITURAS FIRESTORE');

    console.log('\n SESSÃO ATUAL');
    console.log(`   Duração: ${Math.round(report.current.sessionDuration / 60)} min`);
    console.log(`   Leituras: ${report.current.reads.total}`);
    console.log(`   Cache hit rate: ${report.current.cache.hitRate}`);

    console.log('\n HOJE');
    console.log(`   Total leituras: ${report.daily.totalReads}`);
    console.log(`   Uso: ${report.daily.percentUsed}% do limite`);
    console.log(`   Restante: ${report.daily.readsRemaining}`);
    console.log(`   Cache hit rate: ${report.daily.cache.hitRate}`);
    console.log(`   Atribuicao: ${report.daily.attribution?.rate || '100%'}`);

    if (report.daily.projectedDaily) {
      console.log(`\n PROJEÇÃO`);
      console.log(`   Leituras/hora: ${report.daily.projectedDaily.readsPerHour}`);
      console.log(`   Projeção diária: ${report.daily.projectedDaily.projectedDaily}`);
    }

    if (report.daily.byCollection && Object.keys(report.daily.byCollection).length > 0) {
      console.log('\n POR COLEÇÃO');
      const sorted = Object.entries(report.daily.byCollection)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);
      sorted.forEach(([col, count]) => {
        console.log(`   ${col}: ${count}`);
      });
    }

    if (report.recommendations.length > 0) {
      console.log('\n RECOMENDAÇÕES');
      report.recommendations.forEach(rec => {
        const icon = rec.severity === 'critical' ? '' : rec.severity === 'high' ? '' : '';
        console.log(`   ${icon} ${rec.message}`);
      });
    }

    console.groupEnd();

    return report;
  }
}

FirestoreReadMetricsService.prototype.normalizeMetricDimension = function(value, fallback = UNKNOWN_METRIC_DIMENSION) {
  const normalized = String(value || '').trim();
  return normalized || fallback;
};

FirestoreReadMetricsService.prototype.sumCounterValues = function(counter = {}) {
  if (!counter || typeof counter !== 'object') return 0;
  return Object.values(counter).reduce((sum, value) => sum + (Number(value) || 0), 0);
};

FirestoreReadMetricsService.prototype.resolveReadAttribution = function(reads = {}) {
  const totalReads = Number(reads?.total) || 0;
  const collectionAttributedReads = this.sumCounterValues(reads?.byCollection);
  const sourceAttributedReads = this.sumCounterValues(reads?.bySource);
  const operationAttributedReads = this.sumCounterValues(reads?.byOperation);
  const pageAttributedReads = this.sumCounterValues(reads?.byPage);
  const attributedReads = Math.max(collectionAttributedReads, sourceAttributedReads, operationAttributedReads, pageAttributedReads);
  const storedUnattributedReads = Number(reads?.unattributedTotal);
  const calculatedUnattributedReads = Math.max(
    Number.isFinite(storedUnattributedReads) ? Math.max(0, storedUnattributedReads) : 0,
    totalReads - attributedReads
  );
  const safeTotalReads = Math.max(totalReads, attributedReads + calculatedUnattributedReads);
  const rate = safeTotalReads > 0
    ? `${((attributedReads / safeTotalReads) * 100).toFixed(1)}%`
    : '100.0%';

  return {
    totalReads: safeTotalReads,
    attributedReads,
    collectionAttributedReads,
    sourceAttributedReads,
    operationAttributedReads,
    pageAttributedReads,
    unattributedReads: calculatedUnattributedReads,
    rate
  };
};

FirestoreReadMetricsService.prototype.mergeCounterMap = function(target, source) {
  if (!target || !source || typeof source !== 'object') return;
  Object.entries(source).forEach(([key, value]) => {
    const safeKey = this.normalizeMetricDimension(key);
    target[safeKey] = (target[safeKey] || 0) + (Number(value) || 0);
  });
};

FirestoreReadMetricsService.prototype.addUnattributedBucket = function(target, count) {
  const numericCount = Number(count) || 0;
  if (!target || numericCount <= 0) return;
  target[UNATTRIBUTED_BUCKET_KEY] = (target[UNATTRIBUTED_BUCKET_KEY] || 0) + numericCount;
};

// Instância global
const readMetricsService = new FirestoreReadMetricsService();

// Expor globalmente
if (typeof window !== 'undefined') {
  window.readMetricsService = readMetricsService;
}

export default readMetricsService;
export { readMetricsService };
