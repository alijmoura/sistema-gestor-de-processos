/**
 * PreloadingService - Sistema Inteligente de Carregamento Antecipado
 * 
 * Funcionalidades:
 * - Análise de padrões de navegação do usuário
 * - Preloading predictivo baseado em histórico
 * - Cache estratégico de dados relacionados
 * - Otimização de memória com definicao de prioridade
 * - Preloading de próximas páginas e filtros
 */

class PreloadingService {
  constructor() {
    this.navigationHistory = new Map();
    this.preloadCache = new Map();
    this.userPatterns = new Map();
    this.isActive = true;
    
    // Configurações do sistema
    this.config = {
      maxCacheSize: 50, // Máximo de itens no cache de preload
      historyLimit: 100, // Limite do histórico de navegação
      preloadDelay: 1000, // Delay antes de iniciar preload (ms)
      patternMinCount: 3, // Mínimo de repetições para criar padrão
      memoryThreshold: 50 * 1024 * 1024, // 50MB limite de memória
      preloadTimeout: 30000, // 30s timeout para preload
      confidenceThreshold: 0.7 // 70% confiança para preloading
    };

    // Padrões de navegação identificados
    this.commonPatterns = [
      {
        name: 'contract_details_after_list',
        trigger: 'contract_list_view',
        preload: ['contract_details', 'related_documents'],
        probability: 0.85,
        priority: 'high'
      },
      {
        name: 'dashboard_to_reports',
        trigger: 'dashboard_view',
        preload: ['reports_summary', 'chart_data'],
        probability: 0.6,
        priority: 'medium'
      },
      {
        name: 'filter_continuation',
        trigger: 'filter_applied',
        preload: ['next_page', 'related_filters'],
        probability: 0.75,
        priority: 'high'
      },
      {
        name: 'pagination_forward',
        trigger: 'page_view',
        preload: ['next_page', 'next_two_pages'],
        probability: 0.8,
        priority: 'high'
      }
    ];

    this.preloadQueue = [];
    this.activePreloads = new Set();
    
    console.log(' PreloadingService inicializado');
    this.startPatternAnalysis();
  }

  /**
   * Registra navegação do usuário para análise de padrões
   */
  recordNavigation(page, context = {}) {
    const timestamp = Date.now();
    const navigationEvent = {
      page,
      context,
      timestamp,
      sessionId: this.getSessionId()
    };

    // Adiciona ao histórico
    const history = this.navigationHistory.get('global') || [];
    history.push(navigationEvent);

    // Limita tamanho do histórico
    if (history.length > this.config.historyLimit) {
      history.splice(0, history.length - this.config.historyLimit);
    }

    this.navigationHistory.set('global', history);

    // Analisa padrão e inicia preloading se necessário
    this.analyzeAndPreload(navigationEvent);

    console.log(` Navegação registrada: ${page}`, context);
  }

  /**
   * Analisa padrões e inicia preloading preditivo
   */
  analyzeAndPreload(currentNavigation) {
    if (!this.isActive) return;

    // Verifica padrões conhecidos
    const matchedPatterns = this.findMatchingPatterns(currentNavigation);
    
    matchedPatterns.forEach(pattern => {
      if (pattern.probability >= this.config.confidenceThreshold) {
        this.schedulePreload(pattern, currentNavigation);
      }
    });

    // Análise de padrões dinâmicos
    this.analyzeDynamicPatterns(currentNavigation);
  }

  /**
   * Encontra padrões que correspondem à navegação atual
   */
  findMatchingPatterns(navigation) {
    return this.commonPatterns.filter(pattern => {
      return this.matchesPattern(pattern.trigger, navigation);
    });
  }

  /**
   * Verifica se navegação corresponde ao trigger do padrão
   */
  matchesPattern(trigger, navigation) {
    switch (trigger) {
      case 'contract_list_view':
        return navigation.page === 'contracts' || navigation.page === 'main';
      
      case 'dashboard_view':
        return navigation.page === 'dashboard' || navigation.context.isDashboard;
      
      case 'filter_applied':
        return navigation.context.hasFilter || navigation.context.filterApplied;
      
      case 'page_view':
        return navigation.context.pageNumber > 0;
      
      default:
        return false;
    }
  }

  /**
   * Agenda preloading baseado no padrão
   */
  schedulePreload(pattern, navigation) {
    const preloadId = `${pattern.name}_${Date.now()}`;
    
    setTimeout(() => {
      this.executePreload(pattern, navigation, preloadId);
    }, this.config.preloadDelay);

    console.log(` Preload agendado: ${pattern.name} (${pattern.probability * 100}% confiança)`);
  }

  /**
   * Executa o preloading estratégico
   */
  async executePreload(pattern, navigation, preloadId) {
    if (this.activePreloads.has(preloadId)) return;
    if (!this.checkMemoryLimits()) return;

    this.activePreloads.add(preloadId);

    try {
      for (const preloadType of pattern.preload) {
        await this.preloadByType(preloadType, navigation, pattern.priority);
      }
      
      console.log(` Preload concluído: ${pattern.name}`);
    } catch (error) {
      console.error(` Erro no preload ${pattern.name}:`, error);
    } finally {
      this.activePreloads.delete(preloadId);
    }
  }

  /**
   * Executa preloading por tipo específico
   */
  async preloadByType(type, navigation, priority) {
    const cacheKey = `${type}_${this.generateContextKey(navigation)}`;
    
    // Verifica se já está em cache
    if (this.preloadCache.has(cacheKey)) {
      return this.preloadCache.get(cacheKey);
    }

    let preloadPromise;

    switch (type) {
      case 'contract_details':
        preloadPromise = this.preloadContractDetails(navigation);
        break;
      
      case 'related_documents':
        preloadPromise = this.preloadRelatedDocuments(navigation);
        break;
      
      case 'next_page':
        preloadPromise = this.preloadNextPage(navigation);
        break;
      
      case 'next_two_pages':
        preloadPromise = this.preloadMultiplePages(navigation, 2);
        break;
      
      case 'reports_summary':
        preloadPromise = this.preloadReportsSummary(navigation);
        break;
      
      case 'chart_data':
        preloadPromise = this.preloadChartData(navigation);
        break;
      
      case 'related_filters':
        preloadPromise = this.preloadRelatedFilters(navigation);
        break;
      
      default:
        console.warn(`Tipo de preload desconhecido: ${type}`);
        return;
    }

    // Executa preload com timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Preload timeout')), this.config.preloadTimeout);
    });

    try {
      const result = await Promise.race([preloadPromise, timeoutPromise]);
      
      // Armazena no cache com prioridade
      this.addToPreloadCache(cacheKey, result, priority);
      
      return result;
    } catch (error) {
      console.warn(`Preload falhou para ${type}:`, error.message);
      return null;
    }
  }

  /**
   * Preload de detalhes de contratos mais visualizados
   */
  async preloadContractDetails(navigation) {
    // Identifica contratos com maior probabilidade de serem acessados
    const likelyContracts = await this.identifyLikelyContracts(navigation);
    
    const preloadPromises = likelyContracts.slice(0, 5).map(async contractId => {
      try {
        return await window.firestoreService.getContract(contractId);
      } catch (error) {
        console.warn(`Falha no preload do contrato ${contractId}:`, error);
        return null;
      }
    });

    return Promise.allSettled(preloadPromises);
  }

  /**
   * Identifica contratos com maior probabilidade de acesso
   */
  async identifyLikelyContracts(navigation) {
    // Baseado no contexto atual, determina quais contratos são mais prováveis
    if (navigation.context.currentContracts) {
      return navigation.context.currentContracts.slice(0, 5).map(c => c.id);
    }

    // Fallback: contratos recentes ou em status ativos
    try {
      const activeContracts = await window.firestoreService.getContractsPage({
        filters: [{ field: 'status', operator: 'in', value: ['ativo', 'pendente', 'analise'] }],
        limit: 5
      });
      
      return activeContracts.contracts.map(c => c.id);
    } catch (error) {
      console.warn('Falha ao identificar contratos prováveis:', error);
      return [];
    }
  }

  /**
   * Preload da próxima página
   */
  async preloadNextPage(navigation) {
    const currentPage = navigation.context.pageNumber || 0;
    const nextPage = currentPage + 1;

    if (window.paginationService) {
      return window.paginationService.preloadPage(nextPage);
    }

    return null;
  }

  /**
   * Preload de múltiplas páginas à frente
   */
  async preloadMultiplePages(navigation, count) {
    const currentPage = navigation.context.pageNumber || 0;
    const preloadPromises = [];

    for (let i = 1; i <= count; i++) {
      if (window.paginationService) {
        preloadPromises.push(
          window.paginationService.preloadPage(currentPage + i)
        );
      }
    }

    return Promise.allSettled(preloadPromises);
  }

  /**
   * Preload de dados de relatórios
   */
  async preloadReportsSummary() {
    try {
      // Preload de dados agregados básicos
      const summaryData = await window.dashboardService?.getBasicStats();
      return summaryData;
    } catch (error) {
      console.warn('Falha no preload de relatórios:', error);
      return null;
    }
  }

  /**
   * Preload de dados para gráficos
   */
  async preloadChartData() {
    try {
      // Dados básicos para gráficos do dashboard
      const chartData = await window.dashboardService?.getChartData();
      return chartData;
    } catch (error) {
      console.warn('Falha no preload de gráficos:', error);
      return null;
    }
  }

  /**
   * Preload de documentos relacionados
   */
  async preloadRelatedDocuments() {
    // Implementação simplificada
    return { message: 'Documentos relacionados precarregados' };
  }

  /**
   * Preload de filtros relacionados
   */
  async preloadRelatedFilters() {
    // Preload de opções de filtro baseadas no contexto atual
    return { message: 'Filtros relacionados precarregados' };
  }

  /**
   * Adiciona item ao cache de preload com gerenciamento de memória
   */
  addToPreloadCache(key, data, priority) {
    // Verifica limite de cache
    if (this.preloadCache.size >= this.config.maxCacheSize) {
      this.evictLeastUsed();
    }

    const cacheItem = {
      data,
      priority,
      timestamp: Date.now(),
      accessCount: 0,
      size: this.estimateDataSize(data)
    };

    this.preloadCache.set(key, cacheItem);
    console.log(` Adicionado ao cache de preload: ${key} (${priority})`);
  }

  /**
   * Remove itens menos usados do cache
   */
  evictLeastUsed() {
    const entries = Array.from(this.preloadCache.entries());
    
    // Ordena por prioridade e uso
    entries.sort((a, b) => {
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      const aScore = (priorityWeight[a[1].priority] || 1) * a[1].accessCount;
      const bScore = (priorityWeight[b[1].priority] || 1) * b[1].accessCount;
      
      return aScore - bScore;
    });

    // Remove os 25% menos importantes
    const toRemove = Math.ceil(entries.length * 0.25);
    for (let i = 0; i < toRemove; i++) {
      this.preloadCache.delete(entries[i][0]);
    }

    console.log(` Cache limpo: removidos ${toRemove} itens`);
  }

  /**
   * Obtém item do cache de preload
   */
  getFromPreloadCache(key) {
    const item = this.preloadCache.get(key);
    if (item) {
      item.accessCount++;
      item.lastAccess = Date.now();
      return item.data;
    }
    return null;
  }

  /**
   * Análise de padrões dinâmicos baseada no histórico
   */
  analyzeDynamicPatterns() {
    const history = this.navigationHistory.get('global') || [];
    if (history.length < this.config.patternMinCount) return;

    // Analisa sequências de navegação
    const recentHistory = history.slice(-10);
    this.findSequencePatterns(recentHistory);
  }

  /**
   * Encontra padrões em sequências de navegação
   */
  findSequencePatterns(history) {
    // Implementação simplificada de análise de sequências
    const sequences = new Map();
    
    for (let i = 0; i < history.length - 1; i++) {
      const current = history[i].page;
      const next = history[i + 1].page;
      const sequence = `${current}->${next}`;
      
      sequences.set(sequence, (sequences.get(sequence) || 0) + 1);
    }

    // Identifica padrões com alta frequência
    for (const [sequence, count] of sequences.entries()) {
      if (count >= this.config.patternMinCount) {
        console.log(` Padrão identificado: ${sequence} (${count}x)`);
      }
    }
  }

  /**
   * Verifica limites de memória
   */
  checkMemoryLimits() {
    if (performance.memory) {
      const usedMemory = performance.memory.usedJSHeapSize;
      if (usedMemory > this.config.memoryThreshold) {
        console.warn(' Limite de memória atingido, pausando preloading');
        return false;
      }
    }
    return true;
  }

  /**
   * Estima tamanho dos dados
   */
  estimateDataSize(data) {
    try {
      return JSON.stringify(data).length * 2; // Estimativa em bytes
    } catch {
      return 1000; // Fallback
    }
  }

  /**
   * Gera chave de contexto para cache
   */
  generateContextKey(navigation) {
    const context = navigation.context || {};
    const keyParts = [
      navigation.page,
      context.pageNumber || 0,
      context.filterApplied || 'none',
      context.sortBy || 'default'
    ];
    
    return keyParts.join('_');
  }

  /**
   * Obtém ID da sessão
   */
  getSessionId() {
    if (!window.sessionStorage.getItem('preload_session')) {
      window.sessionStorage.setItem('preload_session', Date.now().toString());
    }
    return window.sessionStorage.getItem('preload_session');
  }

  /**
   * Ativa/desativa o sistema de preloading
   */
  setActive(isActive) {
    this.isActive = isActive;
    console.log(` Preloading ${isActive ? 'ativado' : 'desativado'}`);
  }

  /**
   * Inicia análise contínua de padrões
   */
  startPatternAnalysis() {
    // Análise periódica a cada 5 minutos
    setInterval(() => {
      this.analyzeStoredPatterns();
    }, 300000);
  }

  /**
   * Analisa padrões armazenados e atualiza estratégias
   */
  analyzeStoredPatterns() {
    const history = this.navigationHistory.get('global') || [];
    if (history.length < 10) return;

    console.log(` Analisando ${history.length} eventos de navegação...`);
    
    // Análise de efetividade dos preloads
    this.analyzePreloadEffectiveness();
  }

  /**
   * Analisa efetividade dos preloads realizados
   */
  analyzePreloadEffectiveness() {
    const cacheHits = Array.from(this.preloadCache.values())
      .filter(item => item.accessCount > 0).length;
    
    const totalPreloads = this.preloadCache.size;
    const hitRate = totalPreloads > 0 ? (cacheHits / totalPreloads) * 100 : 0;

    console.log(` Taxa de acerto do preloading: ${hitRate.toFixed(1)}%`);
    
    if (hitRate < 30) {
      console.warn(' Taxa de acerto baixa, ajustando estratégia de preloading');
      this.adjustPreloadingStrategy();
    }
  }

  /**
   * Ajusta estratégia de preloading baseada na efetividade
   */
  adjustPreloadingStrategy() {
    // Aumenta threshold de confiança se efetividade baixa
    this.config.confidenceThreshold = Math.min(0.9, this.config.confidenceThreshold + 0.1);
    console.log(` Threshold ajustado para ${this.config.confidenceThreshold}`);
  }

  /**
   * Limpa cache e histórico
   */
  clearCache() {
    this.preloadCache.clear();
    this.navigationHistory.clear();
    console.log(' Cache e histórico limpos');
  }

  /**
   * Obtém estatísticas do sistema
   */
  getStats() {
    const history = this.navigationHistory.get('global') || [];
    const cacheHits = Array.from(this.preloadCache.values())
      .filter(item => item.accessCount > 0).length;

    return {
      isActive: this.isActive,
      navigationEvents: history.length,
      cacheSize: this.preloadCache.size,
      cacheHits,
      hitRate: this.preloadCache.size > 0 ? (cacheHits / this.preloadCache.size) * 100 : 0,
      activePreloads: this.activePreloads.size,
      memoryUsage: performance.memory ? performance.memory.usedJSHeapSize : 'unknown'
    };
  }
}

// Instância global
const preloadingService = new PreloadingService();
window.preloadingService = preloadingService;

// export default preloadingService; // Removido para compatibilidade