/**
 * OptimizationPanel - Painel de Controle de Otimização
 * 
 * Funcionalidades:
 * - Monitor de performance em tempo real
 * - Controle de serviços de otimização
 * - Estatísticas e métricas
 * - Exportação de relatórios
 * - Controles de cache
 */

class OptimizationPanel {
  constructor() {
    this.isInitialized = false;
    this.updateInterval = null;
    this.stats = {
      compression: {},
      cdn: {},
      dashboard: {},
      serviceWorker: {},
      performance: {}
    };
    
    console.log(' OptimizationPanel inicializado');
  }

  /**
   * Inicializa o painel
   */
  initialize() {
    if (this.isInitialized) return;
    
    this.bindEvents();
    this.startStatsUpdater();
    this.checkServiceWorkerStatus();
    
    this.isInitialized = true;
    console.log(' OptimizationPanel ativo');
  }

  /**
   * Vincula eventos aos controles
   */
  bindEvents() {
    // Toggle Compressão
    const compressionToggle = document.getElementById('compression-toggle');
    if (compressionToggle) {
      compressionToggle.addEventListener('change', (e) => {
        this.toggleCompression(e.target.checked);
      });
    }

    // Toggle CDN
    const cdnToggle = document.getElementById('cdn-toggle');
    if (cdnToggle) {
      cdnToggle.addEventListener('change', (e) => {
        this.toggleCDN(e.target.checked);
      });
    }

    // Limpar Cache de Compressão
    const clearCompressionCache = document.getElementById('clear-compression-cache');
    if (clearCompressionCache) {
      clearCompressionCache.addEventListener('click', () => {
        this.clearCompressionCache();
      });
    }

    // Limpar Cache CDN
    const clearCdnCache = document.getElementById('clear-cdn-cache');
    if (clearCdnCache) {
      clearCdnCache.addEventListener('click', () => {
        this.clearCDNCache();
      });
    }

    // Atualizar estatísticas do dashboard
    const refreshDashboard = document.getElementById('refresh-dashboard-stats');
    if (refreshDashboard) {
      refreshDashboard.addEventListener('click', () => {
        this.updateDashboardStats();
      });
    }

    // Desregistrar Service Worker
    const unregisterSW = document.getElementById('unregister-sw');
    if (unregisterSW) {
      unregisterSW.addEventListener('click', () => {
        this.unregisterServiceWorker();
      });
    }

    // Exportar relatório
    const exportReport = document.getElementById('export-optimization-report');
    if (exportReport) {
      exportReport.addEventListener('click', () => {
        this.exportOptimizationReport();
      });
    }

    // Reset estatísticas
    const resetStats = document.getElementById('reset-optimization-stats');
    if (resetStats) {
      resetStats.addEventListener('click', () => {
        this.resetOptimizationStats();
      });
    }
  }

  /**
   * Inicia atualizador automático de estatísticas
   */
  startStatsUpdater() {
    // Atualização inicial
    this.updateAllStats();
    
    // Atualização periódica (a cada 5 segundos)
    this.updateInterval = setInterval(() => {
      this.updateAllStats();
    }, 5000);
  }

  /**
   * Atualiza todas as estatísticas
   */
  updateAllStats() {
    this.updateCompressionStats();
    this.updateCDNStats();
    this.updateDashboardStats();
    this.updatePerformanceStats();
  }

  /**
   * Atualiza estatísticas de compressão
   */
  updateCompressionStats() {
    const compressionService = window.compressionService;
    const minificationService = window.minificationService;

    if (compressionService) {
      const stats = compressionService.getStats();
      this.stats.compression = stats;

      // Atualiza UI
      this.updateElement('compression-rate', `${stats.compressionRatio || 0}%`);
      this.updateElement('bytes-saved', this.formatBytes(stats.totalBytesSaved || 0));
      this.updateElement('files-processed', stats.totalFiles || 0);
    }

    if (minificationService) {
      const minStats = minificationService.getStats();
      this.stats.compression.minification = minStats;
    }
  }

  /**
   * Atualiza estatísticas do CDN
   */
  updateCDNStats() {
    const cdnOptimizer = window.cdnOptimizer;

    if (cdnOptimizer) {
      const stats = cdnOptimizer.getStats();
      this.stats.cdn = stats;

      // Atualiza UI
      this.updateElement('assets-optimized', stats.assetsOptimized || 0);
      this.updateElement('avg-load-time', `${stats.averageLoadTime || 0}ms`);
      this.updateElement('cache-hits', `${stats.cacheHitRate || 0}%`);
    }
  }

  /**
   * Atualiza estatísticas do dashboard
   */
  updateDashboardStats() {
    const intelligentDashboard = window.intelligentDashboard;

    if (intelligentDashboard) {
      const dashStats = intelligentDashboard.getStats ? intelligentDashboard.getStats() : {};
      
      this.stats.dashboard = { ...dashStats };

      // Atualiza UI
      this.updateElement('active-widgets', this.stats.dashboard.activeWidgets || 0);
      this.updateElement('optimized-queries', this.stats.dashboard.optimizedQueries || 0);
      this.updateElement('response-time', `${this.stats.dashboard.averageResponseTime || 0}ms`);
    }
  }

  /**
   * Atualiza estatísticas de performance
   */
  updatePerformanceStats() {
    const performanceMetrics = window.performanceMetrics;

    if (performanceMetrics) {
      const stats = performanceMetrics.getStats ? performanceMetrics.getStats() : {};
      this.stats.performance = stats;

      // Atualiza UI
      this.updateElement('perf-database-reads', stats.databaseReads || 0);
      this.updateElement('perf-cache-efficiency', `${stats.cacheEfficiency || 0}%`);
      this.updateElement('perf-load-time', stats.loadTime || 0);
      this.updateElement('perf-memory-usage', this.formatBytes(stats.memoryUsage || 0));
    }
  }

  /**
   * Verifica status do Service Worker
   */
  async checkServiceWorkerStatus() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        
        if (registration) {
          this.updateElement('sw-status', 'Ativo', 'badge bg-success');
          
          // Calcula tamanho do cache
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            let totalSize = 0;
            
            for (const name of cacheNames) {
              const cache = await caches.open(name);
              const keys = await cache.keys();
              totalSize += keys.length;
            }
            
            this.updateElement('sw-cache-size', `${totalSize} itens`);
          }
          
          this.updateElement('offline-support', registration.active ? 'Sim' : 'Não');
          
        } else {
          this.updateElement('sw-status', 'Inativo', 'badge bg-danger');
          this.updateElement('sw-cache-size', '--');
          this.updateElement('offline-support', 'Não');
        }
        
      } catch (error) {
        console.warn('Erro ao verificar Service Worker:', error);
        this.updateElement('sw-status', 'Erro', 'badge bg-warning');
      }
    } else {
      this.updateElement('sw-status', 'Não suportado', 'badge bg-secondary');
    }
  }

  /**
   * Toggle compressão
   */
  toggleCompression(enabled) {
    const compressionService = window.compressionService;
    const minificationService = window.minificationService;

    if (compressionService) {
      compressionService.setEnabled(enabled);
    }
    
    if (minificationService) {
      minificationService.setEnabled(enabled);
    }

    console.log(` Compressão ${enabled ? 'habilitada' : 'desabilitada'}`);
  }

  /**
   * Toggle CDN
   */
  toggleCDN(enabled) {
    const cdnOptimizer = window.cdnOptimizer;

    if (cdnOptimizer) {
      cdnOptimizer.setEnabled(enabled);
    }

    console.log(` CDN ${enabled ? 'habilitado' : 'desabilitado'}`);
  }

  /**
   * Limpa cache de compressão
   */
  clearCompressionCache() {
    const compressionService = window.compressionService;
    const minificationService = window.minificationService;

    if (compressionService) {
      compressionService.clearCache();
    }
    
    if (minificationService) {
      minificationService.clearCache();
    }

    this.updateCompressionStats();
    console.log(' Cache de compressão limpo');
  }

  /**
   * Limpa cache do CDN
   */
  clearCDNCache() {
    const cdnOptimizer = window.cdnOptimizer;

    if (cdnOptimizer) {
      cdnOptimizer.clearCache();
    }

    this.updateCDNStats();
    console.log(' Cache CDN limpo');
  }

  /**
   * Desregistra Service Worker
   */
  async unregisterServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        
        if (registration) {
          await registration.unregister();
          console.log(' Service Worker desregistrado');
          
          // Limpa caches
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            console.log(' Caches limpos');
          }
          
          this.checkServiceWorkerStatus();
        }
        
      } catch (error) {
        console.error('Erro ao desregistrar Service Worker:', error);
      }
    }
  }

  /**
   * Exporta relatório de otimização
   */
  exportOptimizationReport() {
    const report = {
      timestamp: new Date().toISOString(),
      compression: this.stats.compression,
      cdn: this.stats.cdn,
      dashboard: this.stats.dashboard,
      performance: this.stats.performance,
      serviceWorker: this.stats.serviceWorker,
      summary: this.generateSummary()
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optimization-report-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    console.log(' Relatório de otimização exportado');
  }

  /**
   * Reset estatísticas
   */
  resetOptimizationStats() {
    if (confirm('Tem certeza que deseja resetar todas as estatísticas?')) {
      // Reset serviços
      const services = [
        'compressionService',
        'minificationService', 
        'cdnOptimizer',
        'performanceMetrics'
      ];

      services.forEach(serviceName => {
        const service = window[serviceName];
        if (service && service.reset) {
          service.reset();
        }
      });

      // Reset stats locais
      this.stats = {
        compression: {},
        cdn: {},
        dashboard: {},
        serviceWorker: {},
        performance: {}
      };

      this.updateAllStats();
      console.log(' Estatísticas resetadas');
    }
  }

  /**
   * Gera resumo das otimizações
   */
  generateSummary() {
    const totalBytesSaved = (this.stats.compression.totalBytesSaved || 0);
    const compressionRatio = (this.stats.compression.compressionRatio || 0);
    const cacheEfficiency = (this.stats.performance.cacheEfficiency || 0);

    return {
      totalBytesSaved: this.formatBytes(totalBytesSaved),
      averageCompression: `${compressionRatio}%`,
      cacheEfficiency: `${cacheEfficiency}%`,
      optimizationScore: this.calculateOptimizationScore()
    };
  }

  /**
   * Calcula score de otimização
   */
  calculateOptimizationScore() {
    const factors = [
      (this.stats.compression.compressionRatio || 0) / 100, // 0-1
      (this.stats.performance.cacheEfficiency || 0) / 100, // 0-1
      (this.stats.cdn.cacheHitRate || 0) / 100, // 0-1
      this.stats.serviceWorker.active ? 1 : 0 // 0-1
    ];

    const average = factors.reduce((sum, factor) => sum + factor, 0) / factors.length;
    return Math.round(average * 100);
  }

  /**
   * Atualiza elemento do DOM
   */
  updateElement(id, value, className = null) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
      if (className) {
        element.className = className;
      }
    }
  }

  /**
   * Formata bytes para leitura humana
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Para atualizador automático
   */
  stopStatsUpdater() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Destroi o painel
   */
  destroy() {
    this.stopStatsUpdater();
    this.isInitialized = false;
    console.log(' OptimizationPanel destruído');
  }
}

// Instância global
const optimizationPanel = new OptimizationPanel();

// Auto-inicialização quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    optimizationPanel.initialize();
  });
} else {
  optimizationPanel.initialize();
}

// Exposição global
window.optimizationPanel = optimizationPanel;

// export default optimizationPanel; // Removido para compatibilidade