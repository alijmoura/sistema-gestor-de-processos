/**
 * @file cacheService.js
 * @description Sistema de cache inteligente com TTL e invalidação seletiva para otimizar leituras do Firestore
 */

// =============================================================================
// INDEXEDDB CACHE - Persistência entre F5s
// =============================================================================

const IDB_NAME = 'GestorContratosCache';
const IDB_VERSION = 1;
const IDB_STORE_NAME = 'cacheStore';

/**
 * Classe para gerenciar cache persistente com IndexedDB
 * Permite armazenar dados grandes (até ~50MB) que sobrevivem ao F5
 */
class IndexedDBCache {
  constructor() {
    this.db = null;
    this.isReady = false;
    this.initPromise = this.init();
  }

  /**
   * Inicializa a conexão com IndexedDB
   */
  async init() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('[IndexedDBCache] IndexedDB não suportado neste navegador');
        resolve(false);
        return;
      }

      const request = indexedDB.open(IDB_NAME, IDB_VERSION);

      request.onerror = () => {
        console.error('[IndexedDBCache] Erro ao abrir IndexedDB:', request.error);
        resolve(false);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isReady = true;
        console.log('[IndexedDBCache]  Conectado ao IndexedDB');
        resolve(true);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          const store = db.createObjectStore(IDB_STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          console.log('[IndexedDBCache]  ObjectStore criado');
        }
      };
    });
  }

  /**
   * Garante que o DB está pronto antes de operações
   */
  async ensureReady() {
    if (!this.isReady) {
      await this.initPromise;
    }
    return this.isReady && this.db !== null;
  }

  /**
   * Obtém item do IndexedDB
   * @param {string} key - Chave do item
   * @returns {Promise<any|null>} Dados ou null se não existir
   */
  async get(key) {
    if (!await this.ensureReady()) return null;

    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction([IDB_STORE_NAME], 'readonly');
        const store = transaction.objectStore(IDB_STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            resolve(result);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          console.warn('[IndexedDBCache] Erro ao ler:', request.error);
          resolve(null);
        };
      } catch (error) {
        console.warn('[IndexedDBCache] Erro na transação get:', error);
        resolve(null);
      }
    });
  }

  /**
   * Salva item no IndexedDB
   * @param {string} key - Chave do item
   * @param {any} data - Dados para salvar
   * @param {string} type - Tipo de dados
   * @param {number} timestamp - Timestamp de criação
   */
  async set(key, data, type, timestamp = Date.now()) {
    if (!await this.ensureReady()) return false;

    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction([IDB_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(IDB_STORE_NAME);
        
        const item = {
          key,
          data,
          type,
          timestamp,
          size: JSON.stringify(data).length
        };

        const request = store.put(item);

        request.onsuccess = () => {
          resolve(true);
        };

        request.onerror = () => {
          console.warn('[IndexedDBCache] Erro ao salvar:', request.error);
          resolve(false);
        };
      } catch (error) {
        console.warn('[IndexedDBCache] Erro na transação set:', error);
        resolve(false);
      }
    });
  }

  /**
   * Remove item do IndexedDB
   * @param {string} key - Chave do item
   */
  async delete(key) {
    if (!await this.ensureReady()) return false;

    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction([IDB_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(IDB_STORE_NAME);
        const request = store.delete(key);

        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Remove itens que correspondem a um padrão
   * @param {RegExp} pattern - Padrão para match das chaves
   */
  async deleteByPattern(pattern) {
    if (!await this.ensureReady()) return 0;

    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction([IDB_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(IDB_STORE_NAME);
        const request = store.openCursor();
        let count = 0;

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            if (pattern.test(cursor.key)) {
              cursor.delete();
              count++;
            }
            cursor.continue();
          } else {
            resolve(count);
          }
        };

        request.onerror = () => resolve(0);
      } catch {
        resolve(0);
      }
    });
  }

  /**
   *  NOVO: Obtém todas as chaves do IndexedDB (para estatísticas)
   */
  async getAllKeys() {
    if (!await this.ensureReady()) return [];

    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction([IDB_STORE_NAME], 'readonly');
        const store = transaction.objectStore(IDB_STORE_NAME);
        const request = store.getAllKeys();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }
  /**
   * Limpa itens expirados do IndexedDB
   * @param {Object} ttlConfig - Configuração de TTL por tipo
   */
  async cleanup(ttlConfig) {
    if (!await this.ensureReady()) return 0;

    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction([IDB_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(IDB_STORE_NAME);
        const request = store.openCursor();
        const now = Date.now();
        let count = 0;

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const item = cursor.value;
            const ttl = ttlConfig[item.type] || ttlConfig.contracts || 30 * 60 * 1000;
            
            if ((now - item.timestamp) > ttl) {
              cursor.delete();
              count++;
            }
            cursor.continue();
          } else {
            if (count > 0) {
              console.log(`[IndexedDBCache]  Removidos ${count} itens expirados`);
            }
            resolve(count);
          }
        };

        request.onerror = () => resolve(0);
      } catch {
        resolve(0);
      }
    });
  }

  /**
   * Limpa todo o IndexedDB cache
   */
  async clear() {
    if (!await this.ensureReady()) return false;

    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction([IDB_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(IDB_STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          console.log('[IndexedDBCache]  Cache limpo');
          resolve(true);
        };
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }
}

// Instância global do IndexedDB Cache
new IndexedDBCache();

// =============================================================================
// CONFIGURAÇÃO DE TTL
// =============================================================================

/**
 * Configurações de TTL (Time To Live) para diferentes tipos de dados
 * OTIMIZAÇÃO 24/11/2025: TTLs MUITO AUMENTADOS para reduzir drasticamente leituras
 * Problema: 291k leituras/hora com 1 usuário → meta: <20k leituras/hora
 */
const STORAGE_ARCHIVE_LIST_TTL = 5 * 60 * 1000;
const STORAGE_ARCHIVE_ENTRY_TTL = 15 * 60 * 1000;

const CACHE_CONFIG = {
  // Contratos: dados que mudam com frequência moderada
  //  OTIMIZADO: TTL aumentado para 30min - listener gerencia realtime
  contracts: 30 * 60 * 1000,        // 30 minutos  AUMENTADO (listener + cache IndexedDB)
  contractsAll: 30 * 60 * 1000,     // 30 minutos  AUMENTADO (cache IndexedDB persiste F5)
  contractById: 15 * 60 * 1000,     // 15 minutos (menos frequente)
  
  // Usuários: dados que mudam raramente
  users: 24 * 60 * 60 * 1000,      // 24 horas - NÃO MUDAM  CRÍTICO
  userProfile: 24 * 60 * 60 * 1000, // 24 horas - NÃO MUDAM  CRÍTICO
  user_permissions: 15 * 60 * 1000, // 15 minutos
  
  // Dados estáticos que NUNCA mudam (eram carregados 16x!)
  agencias: 24 * 60 * 60 * 1000,   // 24 horas  NOVO - reduz 16 leituras
  cartorios: 24 * 60 * 60 * 1000,  // 24 horas  NOVO - reduz 16 leituras
  vendors: 24 * 60 * 60 * 1000,    // 24 horas  NOVO - vendedores não mudam
  
  // Dashboard e KPIs: aumentar TTL para reduzir leituras
  dashboard: 10 * 60 * 1000,       // 10 minutos (polling automático)
  kpis: 10 * 60 * 1000,            // 10 minutos (polling automático)

  // Aprovações: reduzir leituras ao reabrir página após F5
  aprovacoes: 15 * 60 * 1000,      // 15 minutos
  aprovacoesStats: 15 * 60 * 1000, // 15 minutos
  
  // Status e configurações: mudam muito raramente
  status: 24 * 60 * 60 * 1000,     // 24 horas - administrativas  CRÍTICO
  statusRules: 24 * 60 * 60 * 1000, // 24 horas - administrativas  CRÍTICO
  workflows: 24 * 60 * 60 * 1000,  // 24 horas - workflows raramente mudam  NOVO
  
  // Filtros e pesquisas: TTL maior
  filters: 5 * 60 * 1000,          // 5 minutos
  search: 5 * 60 * 1000,           // 5 minutos
  
  // Notificações: pode ter TTL maior
  notifications: 3 * 60 * 1000,    // 3 minutos
  
  // Uploads e anexos: dados que não mudam
  uploads: 24 * 60 * 60 * 1000,    // 24 horas  CRÍTICO

  // Configurações administrativas: alterações raras
  whatsappConfig: 24 * 60 * 60 * 1000, // 24 horas  CRÍTICO
  settingsFlags: 2 * 60 * 1000, // 2 minutos
  
  // WhatsApp stats: novo tipo para polling otimizado
  whatsappStats: 5 * 60 * 1000,    // 5 minutos - NOVO
  whatsappAgentUsers: 10 * 60 * 1000,  // 10 minutos - agentes em users.whatsapp

  // Contatos externos (Google): atualizados manualmente pelo admin
  googleContacts: 60 * 60 * 1000,  // 60 minutos (era 20)  OTIMIZADO

  // Contratos arquivados: TTL controlado para evitar dados stale indefinidamente
  archivedContracts: STORAGE_ARCHIVE_ENTRY_TTL,
  archivedContractsList: STORAGE_ARCHIVE_LIST_TTL,
  archivedContractsStats: STORAGE_ARCHIVE_LIST_TTL
};

/**
 * Classe principal do serviço de cache
 */
class FirestoreCacheService {
  constructor() {
    this.cache = new Map();
    this.hitCount = 0;
    this.missCount = 0;
    this.isEnabled = true;
    
    // Debug opcional
    this.debug = window.__DEBUG__ || false;
    
    // IndexedDB para persistência de dados grandes (contratos)
    this.indexedDB = new IndexedDBCache();
    this.indexedDBReady = false;
    this._initIndexedDB();
    
    // Limpeza automática a cada 5 minutos
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
    
    this.log(' FirestoreCacheService inicializado');
  }
  
  /**
   * Inicializa o IndexedDB de forma assíncrona
   * @private
   */
  async _initIndexedDB() {
    try {
      await this.indexedDB.init();
      this.indexedDBReady = true;
      this.log(' IndexedDB inicializado com sucesso');
    } catch (error) {
      console.warn('[Cache] IndexedDB não disponível, usando apenas memória:', error.message);
      this.indexedDBReady = false;
    }
  }

  /**
   * Define se uma chave/tipo deve usar persistência em IndexedDB.
   * Mantem contratos, aprovacoes e tambem dados de arquivados em archived_contracts_*.
   * @param {string} key
   * @param {string} type
   * @returns {boolean}
   */
  shouldUseIndexedDB(key, type = 'contracts') {
    if (!key || typeof key !== 'string') return false;

    const isContractsKey = (
      key === 'contractsAll' ||
      key === 'contracts_all_active' ||
      key === 'contracts_all_with_archived' ||
      key.startsWith('contracts_page_') ||
      key.startsWith('contracts_')
    );

    const isAprovacoesKey = key.startsWith('aprovacoes_');
    const isAprovacoesType = (
      type === 'aprovacoes' ||
      type === 'aprovacoesStats'
    );

    const isArchivedContractsKey = key.startsWith('archived_contracts_');
    const isArchivedContractsType = (
      type === 'archivedContracts' ||
      type === 'archivedContractsList' ||
      type === 'archivedContractsStats'
    );

    return (
      isContractsKey ||
      isAprovacoesKey ||
      isAprovacoesType ||
      isArchivedContractsKey ||
      isArchivedContractsType
    );
  }

  /**
   * Verifica se um padrão de invalidação deve atingir o IndexedDB.
   * @param {RegExp} regex
   * @returns {boolean}
   */
  shouldInvalidateIndexedDBByPattern(regex) {
    const testRegex = (sample) => {
      regex.lastIndex = 0;
      return regex.test(sample);
    };

    return (
      testRegex('contractsAll') ||
      testRegex('contracts_page_') ||
      testRegex('contracts_') ||
      testRegex('aprovacoes_') ||
      testRegex('archived_contracts_')
    );
  }

  scopeKey(key) {
    const tenantId = window.currentTenantContext?.tenantId || window.appState?.currentEmpresaId || '';
    if (!tenantId || String(key).startsWith(`tenant:${tenantId}:`)) {
      return key;
    }
    return `tenant:${tenantId}:${key}`;
  }

  /**
   * Obtém dados do cache ou executa função de busca
   * @param {string} key - Chave única para o cache
   * @param {Function} fetchFunction - Função que busca os dados se não estiver em cache
   * @param {string} type - Tipo de dados para determinar TTL (opcional)
   * @param {boolean} forceRefresh - Força atualização ignorando cache
   * @returns {Promise<any>} Dados do cache ou da função de busca
   */
  async get(key, fetchFunction, type = 'contracts', forceRefresh = false) {
    key = this.scopeKey(key);
    if (!this.isEnabled || forceRefresh) {
      this.missCount++;
      this.recordCacheMetric(false);
      const data = await fetchFunction();
      if (this.isEnabled) {
        this.set(key, data, type);
      }
      return data;
    }

    const cached = this.cache.get(key);
    const now = Date.now();
    const ttl = CACHE_CONFIG[type] || CACHE_CONFIG.contracts;

    // Verifica se o cache em memória é válido
    if (cached && (now - cached.timestamp) < ttl) {
      this.hitCount++;
      this.recordCacheMetric(true);
      this.log(` Cache HIT (memória): ${key} (age: ${Math.round((now - cached.timestamp) / 1000)}s)`);
      return cached.data;
    }

    // Para dados de contratos, tenta IndexedDB antes de buscar do Firestore
    //  OTIMIZADO: Usa IndexedDB para todas as keys de contratos (persiste entre F5)
    const useIndexedDB = this.indexedDBReady && this.shouldUseIndexedDB(key, type);
    
    if (useIndexedDB) {
      try {
        const idbData = await this.indexedDB.get(key);
        // Verifica TTL do IndexedDB
        if (idbData && idbData.data && (now - idbData.timestamp) < ttl) {
          this.hitCount++;
          this.recordCacheMetric(true);
          // Popula o cache em memória também
          this.cache.set(key, {
            data: idbData.data,
            timestamp: idbData.timestamp,
            type,
            size: this.estimateSize(idbData.data)
          });
          const age = Math.round((now - idbData.timestamp) / 1000);
          this.log(` Cache HIT (IndexedDB): ${key} (age: ${age}s)`);
          return idbData.data;
        }
      } catch (idbError) {
        this.log(` Erro ao ler IndexedDB para ${key}:`, idbError);
      }
    }

    // Cache miss - busca novos dados
    this.missCount++;
    this.recordCacheMetric(false);
    this.log(` Cache MISS: ${key}`);
    
    //  Validação: fetchFunction deve ser uma função
    if (typeof fetchFunction !== 'function') {
      this.log(` ERRO: fetchFunction não é uma função para ${key}! Tipo: ${typeof fetchFunction}`);
      throw new Error(`fetchFunction inválida para cache key "${key}". Tipo recebido: ${typeof fetchFunction}`);
    }
    
    try {
      const data = await fetchFunction();
      this.set(key, data, type);
      return data;
    } catch (error) {
      this.log(` Erro ao buscar dados para ${key}:`, error);
      
      // Tenta IndexedDB como fallback em caso de erro de rede (ignora TTL)
      if (useIndexedDB) {
        try {
          const idbFallback = await this.indexedDB.get(key);
          if (idbFallback && idbFallback.data) {
            this.log(` Retornando cache IndexedDB (expirado) para ${key} devido ao erro`);
            return idbFallback.data;
          }
        } catch {
          // Silencia erro de IndexedDB no fallback
        }
      }
      
      // Retorna cache em memória expirado se disponível em caso de erro
      if (cached) {
        this.log(` Retornando cache memória expirado para ${key} devido ao erro`);
        return cached.data;
      }
      
      throw error;
    }
  }

  /**
   * Define dados no cache
   * @param {string} key - Chave única
   * @param {any} data - Dados para armazenar
   * @param {string} type - Tipo de dados
   */
  set(key, data, type = 'contracts') {
    key = this.scopeKey(key);
    if (!this.isEnabled) return;
    
    const timestamp = Date.now();
    
    this.cache.set(key, {
      data,
      timestamp,
      type,
      size: this.estimateSize(data)
    });

    // Persiste no IndexedDB para dados de contratos (dados grandes)
    //  OTIMIZADO: Persiste todas as keys de contratos, não só contractsAll
    const shouldPersist = this.shouldUseIndexedDB(key, type);
    
    if (this.indexedDBReady && shouldPersist) {
      this.indexedDB.set(key, data, type, timestamp)
        .then(() => {
          this.log(` Cache SET (IndexedDB): ${key}`);
        })
        .catch(err => {
          this.log(` Erro ao salvar no IndexedDB ${key}:`, err);
        });
    }

    this.log(` Cache SET (memória): ${key} (type: ${type})`);
  }

  /**
   * Define múltiplos itens no cache de uma vez (otimizado para logs)
   * @param {Object} items - Objeto com pares chave-valor
   * @param {string} type - Tipo de dados
   */
  setMulti(items, type = 'contracts') {
    if (!this.isEnabled) return;
    
    let count = 0;
    const now = Date.now();
    
    for (const [key, data] of Object.entries(items)) {
      this.cache.set(key, {
        data,
        timestamp: now,
        type,
        size: this.estimateSize(data)
      });
      count++;
    }

    this.log(` Cache SET Multi: ${count} itens (type: ${type})`);
  }

  /**
   * Obtém dados do cache de forma síncrona (sem buscar se não existir)
   * Útil para verificar rapidamente se dados existem antes de fazer fetch
   * @param {string} key - Chave única para o cache
   * @param {string} type - Tipo de dados para determinar TTL (opcional)
   * @returns {any|null} Dados do cache ou null se não existir/expirado
   */
  getSync(key, type = 'contracts') {
    if (!this.isEnabled) return null;

    const cached = this.cache.get(key);
    if (!cached) {
      this.recordCacheMetric(false);
      return null;
    }
    
    const now = Date.now();
    const ttl = CACHE_CONFIG[type] || CACHE_CONFIG.contracts;

    // Verifica se o cache é válido
    if ((now - cached.timestamp) < ttl) {
      this.recordCacheMetric(true);
      return cached.data;
    }

    // Cache expirado
    this.recordCacheMetric(false);
    return null;
  }

  /**
   * Lê do cache (memória/IndexedDB) sem executar fetch remoto.
   * @param {string} key - Chave única do cache
   * @param {string} type - Tipo de dados para TTL
   * @param {Object} options - Opções de leitura
   * @param {boolean} options.allowExpired - Se true, aceita item expirado
   * @returns {Promise<any|null>} Dados em cache ou null
   */
  async getCached(key, type = 'contracts', { allowExpired = false } = {}) {
    if (!this.isEnabled) return null;

    const now = Date.now();
    const ttl = CACHE_CONFIG[type] || CACHE_CONFIG.contracts;
    const cached = this.cache.get(key);

    if (cached && (allowExpired || (now - cached.timestamp) < ttl)) {
      this.recordCacheMetric(true);
      return cached.data;
    }

    const canUseIndexedDB = this.indexedDBReady && this.shouldUseIndexedDB(key, type);
    if (!canUseIndexedDB) {
      this.recordCacheMetric(false);
      return null;
    }

    try {
      const idbData = await this.indexedDB.get(key);
      if (!idbData || !idbData.data) {
        this.recordCacheMetric(false);
        return null;
      }

      const idbType = idbData.type || type;
      const idbTtl = CACHE_CONFIG[idbType] || CACHE_CONFIG[type] || CACHE_CONFIG.contracts;
      const isValid = allowExpired || (now - idbData.timestamp) < idbTtl;

      if (!isValid) {
        this.recordCacheMetric(false);
        return null;
      }

      this.cache.set(key, {
        data: idbData.data,
        timestamp: idbData.timestamp,
        type: idbType,
        size: this.estimateSize(idbData.data)
      });

      this.recordCacheMetric(true);
      return idbData.data;
    } catch (error) {
      this.log(` Erro ao ler cache-only do IndexedDB (${key}):`, error);
      this.recordCacheMetric(false);
      return null;
    }
  }

  /**
   * Registra hit/miss no serviço de métricas de leitura quando disponível.
   * @param {boolean} isHit
   */
  recordCacheMetric(isHit) {
    try {
      if (window.readMetricsService && typeof window.readMetricsService.recordCacheAccess === 'function') {
        window.readMetricsService.recordCacheAccess(Boolean(isHit));
      }
    } catch {
      // Métrica é best-effort; não deve quebrar cache.
    }
  }

  /**
   * Remove entrada específica do cache
   * @param {string} key - Chave para remover
   */
  invalidate(key) {
    key = this.scopeKey(key);
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.log(` Cache invalidado (memória): ${key}`);
    }

    // Remove também do IndexedDB para chaves persistidas
    if (this.indexedDBReady && this.shouldUseIndexedDB(key)) {
      this.indexedDB.delete(key)
        .then(() => this.log(` Cache invalidado (IndexedDB): ${key}`))
        .catch(err => this.log(` Erro ao invalidar IndexedDB ${key}:`, err));
    }

    // Remove do localStorage para caches que usam localStorage
    const localStorageMapping = {
      'workflows_config': 'cachedWorkflows',
      'status_config_all': 'cachedStatuses',
      'vendors_all': 'cachedVendors'
    };
    if (localStorageMapping[key]) {
      try {
        localStorage.removeItem(localStorageMapping[key]);
        this.log(` Cache invalidado (localStorage): ${localStorageMapping[key]}`);
      } catch { /* ignore */ }
    }

    return deleted;
  }

  /**
   * Remove todas as entradas de um tipo específico
   * @param {string} type - Tipo de dados para invalidar
   */
  invalidateByType(type) {
    let count = 0;
    for (const [key, value] of this.cache.entries()) {
      if (value.type === type) {
        this.cache.delete(key);
        count++;
      }
    }
    
    // Limpa IndexedDB por tipo de chave (sem apagar namespaces não relacionados)
    if (this.indexedDBReady) {
      let pattern = null;
      if (type === 'contracts') {
        pattern = /^contracts/;
      } else if (
        type === 'aprovacoes' ||
        type === 'aprovacoesStats'
      ) {
        pattern = /^aprovacoes_/;
      } else if (
        type === 'archivedContracts' ||
        type === 'archivedContractsList' ||
        type === 'archivedContractsStats'
      ) {
        pattern = /^archived_contracts_/;
      }

      if (pattern) {
        this.indexedDB.deleteByPattern(pattern)
          .then((deletedIdb) => this.log(` IndexedDB invalidado por tipo "${type}": ${deletedIdb} itens`))
          .catch(err => this.log(` Erro ao invalidar IndexedDB por tipo "${type}":`, err));
      }
    }
    
    this.log(` Invalidados ${count} itens do tipo: ${type}`);
    return count;
  }

  /**
   * Remove todas as entradas que correspondem a um padrão
   * @param {RegExp|string} pattern - Padrão para buscar chaves
   */
  async invalidateByPattern(pattern) {
    let count = 0;
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);

    for (const [key] of this.cache.entries()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    // Se o padrão atingir namespaces persistidos, invalida no IndexedDB também.
    if (this.indexedDBReady && this.shouldInvalidateIndexedDBByPattern(regex)) {
      try {
        const deletedIdb = await this.indexedDB.deleteByPattern(regex);
        this.log(` IndexedDB invalidado para padrão ${pattern}: ${deletedIdb} itens`);
      } catch (err) {
        this.log(` Erro ao invalidar IndexedDB por padrão:`, err);
      }
    }

    this.log(` Invalidados ${count} itens com padrão: ${pattern}`);
    return count;
  }

  /**
   * Limpa entradas expiradas do cache
   */
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, value] of this.cache.entries()) {
      const ttl = CACHE_CONFIG[value.type] || CACHE_CONFIG.contracts;
      if ((now - value.timestamp) > ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.log(` Limpeza automática: ${cleanedCount} itens expirados removidos`);
    }
  }

  /**
   * Limpa todo o cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.log(` Cache completamente limpo: ${size} itens removidos`);
  }

  /**
   * Obtém estatísticas do cache
   *  OTIMIZADO: Agora inclui estatísticas do IndexedDB
   */
  async getStats() {
    const total = this.hitCount + this.missCount;
    const hitRate = total > 0 ? (this.hitCount / total * 100).toFixed(1) : 0;
    
    const typeStats = {};
    let totalSize = 0;
    
    for (const [, value] of this.cache.entries()) {
      const type = value.type;
      if (!typeStats[type]) {
        typeStats[type] = { count: 0, size: 0 };
      }
      typeStats[type].count++;
      typeStats[type].size += value.size || 0;
      totalSize += value.size || 0;
    }

    // Estatísticas do IndexedDB
    let idbStats = { count: 0, size: 0, ready: false };
    if (this.indexedDBReady) {
      try {
        const allKeys = await this.indexedDB.getAllKeys();
        idbStats = {
          count: allKeys.length,
          size: 0, // Estimativa não disponível sem ler todos
          ready: true
        };
      } catch (error) {
        this.log(' Erro ao obter stats do IndexedDB:', error);
      }
    }

    return {
      enabled: this.isEnabled,
      size: this.cache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: `${hitRate}%`,
      totalSize: this.formatBytes(totalSize),
      typeStats,
      efficiency: this.calculateEfficiency(),
      indexedDB: idbStats
    };
  }

  /**
   * Calcula eficiência do cache (economia de leituras)
   */
  calculateEfficiency() {
    const total = this.hitCount + this.missCount;
    if (total === 0) return '0%';
    
    // Cada hit evita uma leitura no Firestore
    const savedReads = this.hitCount;
    const efficiency = (savedReads / total * 100).toFixed(1);
    
    return {
      percentage: `${efficiency}%`,
      savedReads,
      totalQueries: total
    };
  }

  /**
   * Estima o tamanho aproximado dos dados em bytes
   */
  estimateSize(data) {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      return 1024; // Estimativa padrão: 1KB
    }
  }

  /**
   * Formata bytes em formato legível
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Ativa ou desativa o cache
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    this.log(`Cache ${enabled ? 'ativado' : 'desativado'}`);
    
    if (!enabled) {
      this.clear();
    }
  }

  /**
   * Logging condicional
   */
  log(message, ...args) {
    if (this.debug) {
      console.log(`[CacheService] ${message}`, ...args);
    }
  }

  /**
   * Destrói o serviço de cache
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
    this.log(' FirestoreCacheService destruído');
  }
}

// Instância global do serviço de cache
const cacheService = new FirestoreCacheService();

// Expor globalmente para debug
if (typeof window !== 'undefined') {
  window.cacheService = cacheService;
}

// Helpers para facilitar uso comum
export const CacheHelpers = {
  /**
   * Gera chave para lista de contratos com filtros
   */
  getContractsKey(filters = {}) {
    const filterStr = JSON.stringify(filters);
    return `contracts_filtered_${btoa(filterStr).slice(0, 20)}`;
  },

  /**
   * Gera chave para página de contratos
   */
  getContractsPageKey(options = {}) {
    const optionsStr = JSON.stringify(options);
    return `contracts_page_${btoa(optionsStr).slice(0, 20)}`;
  },

  /**
   * Gera chave para dados do dashboard
   */
  getDashboardKey(filters = {}) {
    const filterStr = JSON.stringify(filters);
    return `dashboard_${btoa(filterStr).slice(0, 15)}`;
  },

  /**
   * Gera chave para KPI específico
   */
  getKpiKey(kpiConfig) {
    const configStr = JSON.stringify(kpiConfig);
    return `kpi_${btoa(configStr).slice(0, 20)}`;
  },

  /**
   * Invalidação inteligente após operações
   */
  invalidateAfterContractUpdate(contractId) {
    // Invalida caches relacionados a contratos
    cacheService.invalidateByPattern(/^contracts/);
    cacheService.invalidateByPattern(/^dashboard/);
    cacheService.invalidateByPattern(/^kpi/);
    
    // Invalida contrato específico
    cacheService.invalidate(`contract_${contractId}`);
  },

  /**
   * Invalidação após mudanças de status
   */
  invalidateAfterStatusChange() {
    cacheService.invalidateByType('status');
    cacheService.invalidateByPattern(/^contracts/);
    cacheService.invalidateByPattern(/^dashboard/);
  }
};

/**
 * Cache Warming - Pré-carrega dados críticos no login
 * Reduz cache misses e melhora tempo de inicialização
 * @param {Object} options - Opções de warming
 * @returns {Promise<Object>} Status do warming
 */
export async function warmCache(options = {}) {
  const {
    userId,
    skipRemoteStatus = false,
    skipRemoteUserPermissions = false,
    skipRemoteVendors = false,
    skipRemoteWorkflows = false
  } = options;
  const startTime = performance.now();
  const results = { success: [], failed: [], skipped: [] };

  // 0. Aguarda IndexedDB estar pronto (máx 500ms para não bloquear muito)
  if (!cacheService.indexedDBReady && cacheService.indexedDB) {
    await Promise.race([
      cacheService.indexedDB.init().then(() => { cacheService.indexedDBReady = true; }),
      new Promise(resolve => setTimeout(resolve, 500))
    ]).catch(() => { /* silencia timeout */ });
  }

  // 1. Warm PRIORITÁRIO do IndexedDB - Contratos (maior payload, ~2-5MB)
  // Isso evita re-download de todos os contratos a cada F5
  // Carrega ambas as keys: contractsAll e contracts_all_active
  if (cacheService.indexedDBReady) {
    const contractKeys = ['contracts_all_active', 'contractsAll'];
    const ttl = CACHE_CONFIG.contractsAll;
    const now = Date.now();

    for (const cacheKey of contractKeys) {
      try {
        // Se já carregou uma key, copia para a outra
        const existingCache = cacheService.cache.get(cacheKey);
        if (existingCache && (now - existingCache.timestamp) < ttl) {
          continue; // Já está em cache
        }

        const contractsFromIDB = await cacheService.indexedDB.get(cacheKey);

        // Verifica se dados existem e estão válidos (dentro do TTL)
        if (contractsFromIDB && contractsFromIDB.data && (now - contractsFromIDB.timestamp) < ttl) {
          const contracts = contractsFromIDB.data;
          const age = Math.round((now - contractsFromIDB.timestamp) / 1000);

          // Popula o cache em memória
          cacheService.cache.set(cacheKey, {
            data: contracts,
            timestamp: contractsFromIDB.timestamp,
            type: 'contractsAll',
            size: cacheService.estimateSize(contracts)
          });

          results.success.push(`${cacheKey} (IndexedDB, ${contracts.length} contratos, ${age}s)`);
          console.log(` [Cache Warm] ${cacheKey}: ${contracts.length} contratos do IndexedDB (age: ${age}s)`);

          // Sincroniza ambas as keys para evitar cache miss na outra
          const otherKey = cacheKey === 'contracts_all_active' ? 'contractsAll' : 'contracts_all_active';
          if (!cacheService.cache.has(otherKey)) {
            cacheService.cache.set(otherKey, {
              data: contracts,
              timestamp: contractsFromIDB.timestamp,
              type: 'contractsAll',
              size: cacheService.estimateSize(contracts)
            });
          }
          break; // Encontrou dados válidos, não precisa verificar a outra key
        }
      } catch (idbError) {
        console.warn(`[Cache Warm] IndexedDB indisponível para ${cacheKey}:`, idbError.message);
        results.skipped.push(`${cacheKey} (IndexedDB error)`);
      }
    }
  }

  // 2. Verifica se há dados salvos no localStorage para warmup instantâneo
  const localCacheKeys = [
    { key: 'cachedStatuses', cacheKey: 'status_config_all', type: 'status' },
    { key: 'cachedVendors', cacheKey: 'vendors_all', type: 'vendors' },
    { key: 'cachedWorkflows', cacheKey: 'workflows_config', type: 'workflows' },
  ];

  // 3. Warm instantâneo do localStorage (status, vendors, workflows)
  for (const { key, cacheKey, type } of localCacheKeys) {
    try {
      const cached = localStorage.getItem(key);
      if (cached && !cacheService.getSync(cacheKey, type)) {
        const data = JSON.parse(cached);
        cacheService.set(cacheKey, data, type);
        results.success.push(`${cacheKey} (localStorage)`);
      }
    } catch {
      results.skipped.push(key);
    }
  }

  // 4. Warm paralelo de dados críticos (não bloqueia)
  const warmingPromises = [];

  // Status config (crítico para UI)
  if (!skipRemoteStatus && !cacheService.getSync('status_config_all', 'status')) {
    warmingPromises.push(
      fetchAndCacheWithLocalStorage('status_config_all', 'status', 'cachedStatuses', async () => {
        if (window.firebase?.functions) {
          const listStatuses = window.firebase.app().functions('us-central1').httpsCallable('listStatuses');
          const result = await listStatuses();
          return result.data;
        }
        return null;
      }).then(r => r ? results.success.push('status_config_all') : results.skipped.push('status_config_all'))
        .catch(() => results.failed.push('status_config_all'))
    );
  }

  // Vendors (necessário para formulários)
  if (!skipRemoteVendors && !cacheService.getSync('vendors_all', 'vendors')) {
    warmingPromises.push(
      fetchAndCacheWithLocalStorage('vendors_all', 'vendors', 'cachedVendors', async () => {
        if (window.firebase?.firestore) {
          const db = window.firebase.firestore();
          const snapshot = await db.collection('vendors').get();
          return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        return [];
      }).then(r => r ? results.success.push('vendors_all') : results.skipped.push('vendors_all'))
        .catch(() => results.failed.push('vendors_all'))
    );
  }

  // Workflows (necessário para UI e transições)
  if (!skipRemoteWorkflows && !cacheService.getSync('workflows_config', 'workflows')) {
    warmingPromises.push(
      fetchAndCacheWithLocalStorage('workflows_config', 'workflows', 'cachedWorkflows', async () => {
        if (window.firebase?.firestore) {
          const db = window.firebase.firestore();
          // IMPORTANTE: Filtrar apenas workflows ativos (active == true)
          const snapshot = await db.collection('workflows').where('active', '==', true).get();
          return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        return [];
      }).then(r => r ? results.success.push('workflows_config') : results.skipped.push('workflows_config'))
        .catch(() => results.failed.push('workflows_config'))
    );
  }

  // User permissions (crítico para segurança)
  if (!skipRemoteUserPermissions && userId && !cacheService.getSync(`user_perm_${userId}`, 'user_permissions')) {
    warmingPromises.push(
      (async () => {
        if (window.firebase?.firestore) {
          const db = window.firebase.firestore();
          const doc = await db.collection('user_permissions').doc(userId).get();
          if (doc.exists) {
            const data = doc.data();
            cacheService.set(`user_perm_${userId}`, data, 'user_permissions');
            cacheService.set(`user_perm_v2_${userId}`, data, 'user_permissions');
            results.success.push(`user_perm_${userId}`);
          }
        }
      })().catch(() => results.failed.push(`user_perm_${userId}`))
    );
  }

  // Aguarda warming paralelo (max 2s timeout)
  await Promise.race([
    Promise.allSettled(warmingPromises),
    new Promise(resolve => setTimeout(resolve, 2000))
  ]);

  const duration = performance.now() - startTime;
  cacheService.log(` Cache warming concluído em ${duration.toFixed(0)}ms: ${results.success.length} OK, ${results.failed.length} falhas, ${results.skipped.length} pulados`);

  return results;
}

/**
 * Helper para buscar dados e salvar em cache + localStorage
 */
async function fetchAndCacheWithLocalStorage(cacheKey, type, localStorageKey, fetchFn) {
  try {
    const data = await fetchFn();
    if (data && (Array.isArray(data) ? data.length > 0 : true)) {
      cacheService.set(cacheKey, data, type);
      try {
        localStorage.setItem(localStorageKey, JSON.stringify(data));
      } catch { /* localStorage cheio */ }
      return true;
    }
    return false;
  } catch (error) {
    cacheService.log(` Warming falhou para ${cacheKey}:`, error);
    return false;
  }
}

export default cacheService;
export { cacheService, CACHE_CONFIG };
