/**
 * PaginationService - Sistema otimizado de paginação para Firestore
 * 
 * Funcionalidades:
 * - Paginação eficiente com startAfter() e endBefore()
 * - Cache inteligente com TTL configurável
 * - Pré-carregamento da próxima página
 * - Navegação bidirecional (prev/next)
 * - Estimativa de total sem contar todos os documentos
 * - Invalidação automática de cache
 */

class PaginationService {
  constructor() {
    this.cache = new Map();
    this.preloadCache = new Map();
    this.totalEstimateCache = new Map(); // Cache para totais estimados por query
    
    // Configurações otimizadas para 30 usuários
    this.config = {
      defaultPageSize: 20,       // Tamanho padrão da página
      maxPageSize: 100,          // Tamanho máximo permitido
      cacheTTL: 300000,          // 5 minutos TTL para cache de páginas
      preloadTTL: 120000,        // 2 minutos TTL para preload
      maxCachedPages: 50,        // Máximo de páginas em cache
      enablePreload: true,       // Habilita pré-carregamento
      estimateTotal: true,       // Usa estimativa em vez de count exato
      estimateSampleSize: 100    // Tamanho da amostra para estimativa
    };
    
    // Estatísticas
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      preloadHits: 0,
      totalRequests: 0
    };
    
    console.log(' PaginationService inicializado');
  }

  /**
   * Busca uma página de documentos com otimizações
   * @param {object} collection - Coleção do Firestore
   * @param {object} query - Query base do Firestore
   * @param {object} options - Opções de paginação
   * @returns {Promise<object>} Resultado da página
   */
  async getPage(collection, query, options = {}) {
    const pageOptions = {
      pageSize: Math.min(options.pageSize || this.config.defaultPageSize, this.config.maxPageSize),
      page: options.page || 1,
      sortField: options.sortField || 'id',
      sortDirection: options.sortDirection || 'asc',
      filters: options.filters || {},
      cursor: options.cursor || null,
      direction: options.direction || 'next',
      inequalityField: options.inequalityField || null // Campo com filtro de desigualdade
    };

    this.stats.totalRequests++;

    // Gera chave única para cache
    const cacheKey = this.generateCacheKey(collection.path, query, pageOptions);
    
    // Verifica cache primeiro
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      console.log(` Cache hit para página ${pageOptions.page}`);
      
      // Agenda pré-carregamento da próxima página em background
      if (this.config.enablePreload && pageOptions.direction === 'next') {
        this.schedulePreload(collection, query, pageOptions, cached.lastDocument);
      }
      
      return cached;
    }

    this.stats.cacheMisses++;
    console.log(` Cache miss - buscando página ${pageOptions.page} do Firestore`);

    try {
      // Executa query otimizada
      const result = await this.executeQuery(collection, query, pageOptions);
      
      // Adiciona ao cache
      this.addToCache(cacheKey, result);
      
      // Agenda pré-carregamento se habilitado
      if (this.config.enablePreload && result.hasNextPage && pageOptions.direction === 'next') {
        this.schedulePreload(collection, query, pageOptions, result.lastDocument);
      }
      
      return result;
      
    } catch (error) {
      console.error(' Erro na paginação:', error);
      throw error;
    }
  }

  /**
   * Executa query otimizada no Firestore
   */
  async executeQuery(collection, baseQuery, options) {
    let query = baseQuery;
    
    // IMPORTANTE: Firestore exige que os filtros WHERE venham ANTES dos orderBy
    // E quando usamos 'in' no campo status, devemos ordenar por status primeiro
    
    // 1. Primeiro aplica TODOS os filtros WHERE
    let hasInFilter = false;
    let inFilterField = null;
    
    Object.entries(options.filters).forEach(([field, value]) => {
      if (Array.isArray(value)) {
        query = query.where(field, 'in', value);
        hasInFilter = true;
        inFilterField = field;
      } else {
        query = query.where(field, '==', value);
      }
    });
    
    // 2. Depois aplica ordenação
    // Regra do Firestore: quando há desigualdade (ex.: not-in, !=, <, >, >=, <=),
    // o primeiro orderBy DEVE ser no mesmo campo do filtro.
    // O firestoreService informa esse campo via options.inequalityField.
    if (options.inequalityField) {
      const inequalityField = options.inequalityField;
      const primaryDir = options.sortField === inequalityField ? options.sortDirection : 'asc';
      query = query.orderBy(inequalityField, primaryDir);
      if (options.sortField && options.sortField !== inequalityField) {
        query = query.orderBy(options.sortField, options.sortDirection);
      }
    } else if (hasInFilter && inFilterField) {
      // Para 'in', não é obrigatório ordenar pelo mesmo campo, mas podemos manter a ordenação principal
      query = query.orderBy(options.sortField, options.sortDirection);
    } else {
      // Sem filtros especiais, aplica a ordenação solicitada
      query = query.orderBy(options.sortField, options.sortDirection);
    }
    
    // Aplica paginação com cursor
    if (options.cursor) {
      if (options.direction === 'prev') {
        query = query.endBefore(options.cursor).limitToLast(options.pageSize);
      } else {
        query = query.startAfter(options.cursor);
      }
    }
    
    if (options.direction !== 'prev') {
      query = query.limit(options.pageSize);
    }
    
    // Executa query principal
    const snapshot = await query.get();
    const documents = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      _document: doc // Mantém referência para navegação
    }));
    
    // Calcula ou recupera total estimado
    // IMPORTANTE: Usa cache de totais para manter consistência entre páginas
    const totalCacheKey = this.generateTotalCacheKey(collection.path, options);
    let totalEstimate = this.totalEstimateCache.get(totalCacheKey);
    
    if (totalEstimate === undefined && this.config.estimateTotal) {
      // Calcula o total apenas se não estiver em cache
      totalEstimate = await this.estimateTotal(collection, baseQuery, options.filters);
      // Armazena no cache de totais (com TTL maior)
      this.totalEstimateCache.set(totalCacheKey, totalEstimate);
      console.log(` Total estimado armazenado em cache: ${totalEstimate}`);
    } else if (totalEstimate !== undefined) {
      console.log(` Total estimado recuperado do cache: ${totalEstimate}`);
    }
    
    const result = {
      documents,
      page: options.page,
      pageSize: options.pageSize,
      totalDocuments: documents.length,
      totalEstimate,
      hasNextPage: documents.length === options.pageSize,
      hasPrevPage: options.page > 1,
      firstDocument: snapshot.docs[0] || null,
      lastDocument: snapshot.docs[snapshot.docs.length - 1] || null,
      timestamp: Date.now()
    };
    
    console.log(` Página ${options.page} carregada: ${documents.length} itens`);
    return result;
  }

  /**
   * Estima total de documentos usando amostra
   */
  async estimateTotal(collection, baseQuery, filters = {}) {
    try {
      let sampleQuery = baseQuery;
      
      // Aplica os mesmos filtros da query principal
      Object.entries(filters).forEach(([field, value]) => {
        if (Array.isArray(value)) {
          sampleQuery = sampleQuery.where(field, 'in', value);
        } else {
          sampleQuery = sampleQuery.where(field, '==', value);
        }
      });
      
      // Pega uma amostra maior para melhor estimativa
      const sampleSnapshot = await sampleQuery.limit(this.config.estimateSampleSize).get();
      const sampleSize = sampleSnapshot.size;
      
      if (sampleSize < this.config.estimateSampleSize) {
        // Se a amostra é menor que o limite, este é o total exato
        console.log(` Total exato: ${sampleSize} documentos`);
        return sampleSize;
      }
      
      // Estimativa baseada na amostra (conservadora)
      const estimatedTotal = Math.round(sampleSize * 1.2); // +20% de margem
      console.log(` Total estimado: ~${estimatedTotal} documentos (baseado em amostra de ${sampleSize})`);
      return estimatedTotal;
      
    } catch (error) {
      console.warn(' Erro ao estimar total:', error);
      return null;
    }
  }

  /**
   * Agenda pré-carregamento da próxima página
   */
  schedulePreload(collection, query, currentOptions, lastDocument) {
    if (!lastDocument) return;
    
    // Evita múltiplos preloads da mesma página
    const nextPageOptions = {
      ...currentOptions,
      page: currentOptions.page + 1,
      cursor: lastDocument,
      direction: 'next'
    };
    
    const preloadKey = this.generateCacheKey(collection.path, query, nextPageOptions);
    
    if (this.preloadCache.has(preloadKey)) {
      return;
    }
    
    // Marca como sendo carregado
    this.preloadCache.set(preloadKey, { loading: true, timestamp: Date.now() });
    
    // Executa preload em background
    setTimeout(async () => {
      try {
        console.log(` Pré-carregando página ${nextPageOptions.page}`);
        const result = await this.executeQuery(collection, query, nextPageOptions);
        
        // Adiciona ao cache com TTL menor
        this.addToCache(preloadKey, result, this.config.preloadTTL);
        this.preloadCache.set(preloadKey, { loaded: true, timestamp: Date.now() });
        
      } catch (error) {
        console.warn(' Erro no pré-carregamento:', error);
        this.preloadCache.delete(preloadKey);
      }
    }, 100); // Delay mínimo para não impactar operação atual
  }

  /**
   * Gera chave única para cache
   */
  generateCacheKey(collectionPath, query, options) {
    const keyParts = [
      collectionPath,
      options.page,
      options.pageSize,
      options.sortField,
      options.sortDirection,
      JSON.stringify(options.filters),
      options.inequalityField || 'no-inequality',
      options.cursor?.id || 'no-cursor'
    ];
    
    return keyParts.join('|');
  }

  /**
   * Gera chave para cache de total estimado (independente da página)
   */
  generateTotalCacheKey(collectionPath, options) {
    const keyParts = [
      'total',
      collectionPath,
      options.pageSize,
      options.sortField,
      options.sortDirection,
      JSON.stringify(options.filters),
      options.inequalityField || 'no-inequality'
    ];
    
    return keyParts.join('|');
  }

  /**
   * Busca item do cache verificando TTL
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const isExpired = (Date.now() - cached.timestamp) > this.config.cacheTTL;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Adiciona item ao cache com TTL
   */
  addToCache(key, data, customTTL = null) {
    // Remove itens expirados antes de adicionar
    this.cleanExpiredCache();
    
    // Limita tamanho do cache
    if (this.cache.size >= this.config.maxCachedPages) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    const ttl = customTTL || this.config.cacheTTL;
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
    
    console.log(` Página adicionada ao cache (${this.cache.size}/${this.config.maxCachedPages})`);
  }

  /**
   * Remove itens expirados do cache
   */
  cleanExpiredCache() {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if ((now - cached.timestamp) > cached.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Busca próxima página (navegação otimizada)
   */
  async getNextPage(collection, query, currentPageResult) {
    if (!currentPageResult.hasNextPage || !currentPageResult.lastDocument) {
      return null;
    }
    
    const nextOptions = {
      page: currentPageResult.page + 1,
      pageSize: currentPageResult.pageSize,
      cursor: currentPageResult.lastDocument,
      direction: 'next'
    };
    
    return this.getPage(collection, query, nextOptions);
  }

  /**
   * Busca página anterior (navegação otimizada)
   */
  async getPrevPage(collection, query, currentPageResult) {
    if (!currentPageResult.hasPrevPage || !currentPageResult.firstDocument) {
      return null;
    }
    
    const prevOptions = {
      page: currentPageResult.page - 1,
      pageSize: currentPageResult.pageSize,
      cursor: currentPageResult.firstDocument,
      direction: 'prev'
    };
    
    return this.getPage(collection, query, prevOptions);
  }

  /**
   * Invalida cache por padrão
   */
  invalidateCache(pattern = null) {
    if (!pattern) {
      // Limpa todo o cache
      this.cache.clear();
      this.preloadCache.clear();
      this.totalEstimateCache.clear(); // Limpa cache de totais também
      console.log(' Cache completamente limpo');
      return;
    }
    
    // Limpa cache que corresponde ao padrão
    let removedCount = 0;
    for (const [key] of this.cache.entries()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        removedCount++;
      }
    }
    
    for (const [key] of this.preloadCache.entries()) {
      if (key.includes(pattern)) {
        this.preloadCache.delete(key);
      }
    }
    
    // Limpa cache de totais que corresponde ao padrão
    for (const [key] of this.totalEstimateCache.entries()) {
      if (key.includes(pattern)) {
        this.totalEstimateCache.delete(key);
      }
    }
    
    if (removedCount > 0) {
      console.log(` Cache invalidado: ${removedCount} páginas removidas (padrão: ${pattern})`);
    }
  }

  /**
   * Obtém estatísticas do serviço
   */
  getStats() {
    const cacheUtilization = this.stats.totalRequests > 0 
      ? (this.stats.cacheHits / this.stats.totalRequests * 100).toFixed(1)
      : '0.0';
    
    return {
      cachedPages: this.cache.size,
      preloadedPages: this.preloadCache.size,
      maxCachedPages: this.config.maxCachedPages,
      cacheUtilization: `${cacheUtilization}%`,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      preloadHits: this.stats.preloadHits,
      totalRequests: this.stats.totalRequests
    };
  }

  /**
   * Limpa recursos do serviço
   */
  destroy() {
    this.cache.clear();
    this.preloadCache.clear();
    this.totalEstimateCache.clear();
    console.log(' PaginationService destruído');
  }
}

// Cria instância única
const paginationService = new PaginationService();

export default paginationService;
