/**
 * PreloadingIntegration - Integração do Sistema de Preloading
 * 
 * Funcionalidades:
 * - Integração automática com navegação existente
 * - Hooks para eventos de página e ações do usuário
 * - Monitoramento de efetividade em tempo real
 * - Configuração automática baseada no comportamento
 */

class PreloadingIntegration {
  constructor() {
    this.isInitialized = false;
    this.originalPushState = null;
    this.originalReplaceState = null;
    this.performanceMetrics = new Map();
    
    console.log(' PreloadingIntegration inicializado');
  }

  /**
   * Inicializa integração com sistema existente
   */
  initialize() {
    if (this.isInitialized) return;

    // Integra com histórico do navegador
    this.setupHistoryTracking();
    
    // Integra com sistema de eventos
    this.setupEventListeners();
    
    // Integra com componentes existentes
    this.integrateWithExistingComponents();
    
    // Configura monitoramento de performance
    this.setupPerformanceMonitoring();

    this.isInitialized = true;
    console.log(' Integração de preloading ativada');
  }

  /**
   * Configura rastreamento de histórico do navegador
   */
  setupHistoryTracking() {
    // Intercepta mudanças de estado
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      this.handleStateChange('push', args);
      return this.originalPushState.apply(history, args);
    };

    history.replaceState = (...args) => {
      this.handleStateChange('replace', args);
      return this.originalReplaceState.apply(history, args);
    };

    // Monitora evento popstate
    window.addEventListener('popstate', (event) => {
      this.handlePopState(event);
    });
  }

  /**
   * Manipula mudanças de estado do histórico
   */
  handleStateChange(type, args) {
    const [state, , url] = args;
    
    const navigationData = {
      type,
      state,
      url: url || window.location.href,
      timestamp: Date.now()
    };

    this.recordNavigationFromHistory(navigationData);
  }

  /**
   * Manipula evento popstate (botão voltar/avançar)
   */
  handlePopState(event) {
    const navigationData = {
      type: 'popstate',
      state: event.state,
      url: window.location.href,
      timestamp: Date.now()
    };

    this.recordNavigationFromHistory(navigationData);
  }

  /**
   * Registra navegação a partir do histórico
   */
  recordNavigationFromHistory(navigationData) {
    const page = this.extractPageFromURL(navigationData.url);
    const context = this.extractContextFromURL(navigationData.url);

    if (window.preloadingService) {
      window.preloadingService.recordNavigation(page, context);
    }
  }

  /**
   * Extrai página da URL
   */
  extractPageFromURL(url) {
    const urlObj = new URL(url, window.location.origin);
    const pathname = urlObj.pathname;
    
    if (pathname.includes('dashboard')) return 'dashboard';
    if (pathname.includes('contract')) return 'contracts';
    if (pathname.includes('report')) return 'reports';
    if (pathname.includes('admin')) return 'admin';
    
    return 'main';
  }

  /**
   * Extrai contexto da URL
   */
  extractContextFromURL(url) {
    const urlObj = new URL(url, window.location.origin);
    const searchParams = urlObj.searchParams;
    
    return {
      pageNumber: parseInt(searchParams.get('page')) || 0,
      filterApplied: searchParams.has('filter'),
      sortBy: searchParams.get('sort') || 'default',
      hasSearch: searchParams.has('search'),
      isDashboard: urlObj.pathname.includes('dashboard')
    };
  }

  /**
   * Configura listeners de eventos
   */
  setupEventListeners() {
    // Monitora cliques em elementos de navegação
    document.addEventListener('click', (event) => {
      this.handleNavigationClick(event);
    });

    // Monitora mudanças em filtros
    document.addEventListener('change', (event) => {
      this.handleFilterChange(event);
    });

    // Monitora foco em campos de busca
    document.addEventListener('focus', (event) => {
      this.handleSearchFocus(event);
    });

    // Monitora hover em links importantes
    document.addEventListener('mouseover', (event) => {
      this.handleHover(event);
    });
  }

  /**
   * Manipula cliques de navegação
   */
  handleNavigationClick(event) {
    const target = event.target.closest('a, button[data-navigate]');
    if (!target) return;

    const navigationInfo = this.extractNavigationInfo(target);
    if (navigationInfo) {
      // Inicia preloading preventivo
      this.triggerPreventivePreload(navigationInfo);
    }
  }

  /**
   * Manipula mudanças em filtros
   */
  handleFilterChange(event) {
    const target = event.target;
    if (target.matches('select[name*="filter"], input[name*="filter"]')) {
      const filterContext = {
        filterType: target.name,
        filterValue: target.value,
        hasFilter: true,
        filterApplied: true
      };

      if (window.preloadingService) {
        window.preloadingService.recordNavigation('filter_applied', filterContext);
      }
    }
  }

  /**
   * Manipula foco em campos de busca
   */
  handleSearchFocus(event) {
    const target = event.target;
    if (target.matches('input[type="search"], input[name*="search"]')) {
      // Preload de dados de busca comuns
      this.preloadSearchData();
    }
  }

  /**
   * Manipula hover em elementos importantes
   */
  handleHover(event) {
    const target = event.target.closest('.contract-item, .contract-row');
    if (target) {
      const contractId = target.dataset.contractId;
      if (contractId) {
        // Preload com delay menor para hover
        setTimeout(() => {
          this.preloadContractOnHover(contractId);
        }, 300);
      }
    }
  }

  /**
   * Extrai informações de navegação do elemento
   */
  extractNavigationInfo(element) {
    const href = element.href || element.dataset.navigate;
    if (!href) return null;

    return {
      target: href,
      page: this.extractPageFromURL(href),
      context: this.extractContextFromURL(href),
      element: element.tagName.toLowerCase(),
      text: element.textContent?.trim().substring(0, 50)
    };
  }

  /**
   * Dispara preloading preventivo
   */
  triggerPreventivePreload(navigationInfo) {
    console.log(` Preloading preventivo: ${navigationInfo.page}`);
    
    // Adiciona pequeno delay para evitar preloads desnecessários
    setTimeout(() => {
      if (window.preloadingService) {
        window.preloadingService.recordNavigation(navigationInfo.page, {
          ...navigationInfo.context,
          preventive: true,
          trigger: 'click_intent'
        });
      }
    }, 100);
  }

  /**
   * Preload de dados de busca
   */
  async preloadSearchData() {
    try {
      // Preload de dados comuns de busca (vendedores, empreendimentos, etc.)
      if (window.firestoreService && window.cacheService) {
        const cacheKey = 'search_metadata';
        const cached = window.cacheService.get(cacheKey);
        
        if (!cached) {
          console.log(' Preloading dados de busca...');
          
          // Preload de listas para autocomplete
          const searchData = {
            vendedores: await this.getUniqueValues('vendedorConstrutora'),
            empreendimentos: await this.getUniqueValues('empreendimento'),
            status: ['ativo', 'pendente', 'cancelado', 'concluido', 'analise']
          };

          window.cacheService.set(cacheKey, searchData, 1800000); // 30 minutos
        }
      }
    } catch (error) {
      console.warn('Falha no preload de dados de busca:', error);
    }
  }

  /**
   * Obtém valores únicos para autocomplete
   */
  async getUniqueValues(field) {
    try {
      // Implementação simplificada - na prática usaria agregação
      const contracts = await window.firestoreService.getContractsPage({ limit: 100 });
      const values = [...new Set(contracts.contracts.map(c => c[field]).filter(Boolean))];
      return values.slice(0, 20); // Limita a 20 valores
    } catch (error) {
      console.warn(`Falha ao obter valores únicos para ${field}:`, error);
      return [];
    }
  }

  /**
   * Preload de contrato no hover
   */
  async preloadContractOnHover(contractId) {
    try {
      if (window.cacheService && !window.cacheService.get(`contract_${contractId}`)) {
        console.log(` Preload por hover: contrato ${contractId}`);
        
        // Preload silencioso do contrato
        const contract = await window.firestoreService.getContract(contractId);
        window.cacheService.set(`contract_${contractId}`, contract, 600000); // 10 minutos
      }
    } catch (error) {
      console.warn(`Falha no preload por hover do contrato ${contractId}:`, error);
    }
  }

  /**
   * Integra com componentes existentes
   */
  integrateWithExistingComponents() {
    // Integração com paginação
    this.integrateWithPagination();
    
    // Integração com dashboard
    this.integrateWithDashboard();
    
    // Integração com formulários
    this.integrateWithForms();
  }

  /**
   * Integra com sistema de paginação
   */
  integrateWithPagination() {
    if (window.paginationService) {
      const originalGoToPage = window.paginationService.goToPage;
      
      window.paginationService.goToPage = function(pageNumber, ...args) {
        // Registra navegação de página
        if (window.preloadingService) {
          window.preloadingService.recordNavigation('page_view', {
            pageNumber,
            fromPagination: true
          });
        }
        
        return originalGoToPage.call(this, pageNumber, ...args);
      };
    }
  }

  /**
   * Integra com dashboard
   */
  integrateWithDashboard() {
    if (window.dashboardService) {
      const originalLoadDashboard = window.dashboardService.loadDashboard;
      
      window.dashboardService.loadDashboard = function(...args) {
        // Registra carregamento do dashboard
        if (window.preloadingService) {
          window.preloadingService.recordNavigation('dashboard', {
            isDashboard: true,
            loadType: 'full'
          });
        }
        
        return originalLoadDashboard?.call(this, ...args);
      };
    }
  }

  /**
   * Integra com formulários
   */
  integrateWithForms() {
    // Monitora submissões de formulário
    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (form.matches('form')) {
        this.handleFormSubmission(form);
      }
    });
  }

  /**
   * Manipula submissões de formulário
   */
  handleFormSubmission(form) {
    const formData = new FormData(form);
    const formType = form.dataset.formType || 'unknown';
    
    // Registra submissão para análise de padrões
    if (window.preloadingService) {
      window.preloadingService.recordNavigation('form_submit', {
        formType,
        hasData: formData.entries().next().done === false
      });
    }

    // Preload de próximas ações comuns após submissão
    this.preloadPostSubmissionData(formType);
  }

  /**
   * Preload de dados após submissão
   */
  preloadPostSubmissionData(formType) {
    setTimeout(() => {
      switch (formType) {
        case 'contract':
          // Após criar/editar contrato, provável visualização da lista
          this.triggerPreventivePreload({
            page: 'contracts',
            context: { fromSubmission: true }
          });
          break;
        
        case 'filter':
          // Após aplicar filtro, preload de próxima página
          this.triggerPreventivePreload({
            page: 'page_view',
            context: { pageNumber: 1, filtered: true }
          });
          break;
      }
    }, 500);
  }

  /**
   * Configura monitoramento de performance
   */
  setupPerformanceMonitoring() {
    // Monitora tempo de carregamento de páginas
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            this.recordPerformanceMetric('page_load', entry.duration);
          }
        }
      });

      observer.observe({ entryTypes: ['navigation'] });
    }

    // Monitora tempo de resposta de APIs
    this.monitorAPIPerformance();
  }

  /**
   * Monitora performance de APIs
   */
  monitorAPIPerformance() {
    if (window.firestoreService) {
      const originalGet = window.firestoreService.getContract;
      
      window.firestoreService.getContract = async function(contractId, ...args) {
        const startTime = performance.now();
        
        try {
          const result = await originalGet.call(this, contractId, ...args);
          const duration = performance.now() - startTime;
          
          if (window.preloadingIntegration) {
            window.preloadingIntegration.recordPerformanceMetric('contract_fetch', duration);
          }
          
          return result;
        } catch (error) {
          const duration = performance.now() - startTime;
          if (window.preloadingIntegration) {
            window.preloadingIntegration.recordPerformanceMetric('contract_fetch_error', duration);
          }
          throw error;
        }
      };
    }
  }

  /**
   * Registra métrica de performance
   */
  recordPerformanceMetric(type, duration) {
    const metrics = this.performanceMetrics.get(type) || [];
    metrics.push({
      duration,
      timestamp: Date.now()
    });

    // Limita histórico
    if (metrics.length > 100) {
      metrics.splice(0, metrics.length - 100);
    }

    this.performanceMetrics.set(type, metrics);
  }

  /**
   * Obtém estatísticas de performance
   */
  getPerformanceStats() {
    const stats = {};
    
    for (const [type, metrics] of this.performanceMetrics.entries()) {
      if (metrics.length > 0) {
        const durations = metrics.map(m => m.duration);
        stats[type] = {
          count: metrics.length,
          average: durations.reduce((a, b) => a + b) / durations.length,
          min: Math.min(...durations),
          max: Math.max(...durations)
        };
      }
    }

    return stats;
  }

  /**
   * Desativa integração
   */
  disable() {
    if (!this.isInitialized) return;

    // Restaura funções originais
    if (this.originalPushState) {
      history.pushState = this.originalPushState;
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
    }

    this.isInitialized = false;
    console.log(' Integração de preloading desativada');
  }

  /**
   * Obtém estatísticas da integração
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      performanceMetrics: this.performanceMetrics.size,
      preloadingServiceActive: window.preloadingService?.isActive || false
    };
  }
}

// Instância global
const preloadingIntegration = new PreloadingIntegration();

// Auto-inicialização quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    preloadingIntegration.initialize();
  });
} else {
  preloadingIntegration.initialize();
}

export default preloadingIntegration;