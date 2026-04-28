/**
 * PerformanceMonitor - Sistema Completo de Monitoramento de Performance
 * 
 * Funcionalidades:
 * - Métricas em tempo real (CPU, memória, rede, banco de dados)
 * - Alertas automáticos baseados em thresholds
 * - Histórico de performance com tendências
 * - Health checks automáticos
 * - Relatórios detalhados
 * - Dashboard visual de monitoring
 */

import { auth } from './auth.js';

class PerformanceMonitor {
  constructor() {
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.alertsEnabled = true;
    
    // Configurações de thresholds
    this.thresholds = {
      cpuUsage: 80,           // % CPU
      memoryUsage: 512,       // MB
      networkLatency: 1000,   // ms
      databaseQueries: 100,   // queries/min
      errorRate: 5,           // % errors
      cacheHitRate: 70,       // % cache hits
      loadTime: 3000          // ms
    };
    
    // Métricas atuais
    this.currentMetrics = {
      timestamp: Date.now(),
      cpu: { usage: 0, cores: navigator.hardwareConcurrency || 4 },
      memory: { used: 0, total: 0, heap: 0 },
      network: { latency: 0, bandwidth: 0, requests: 0 },
      database: { reads: 0, writes: 0, errors: 0, latency: 0 },
      cache: { hits: 0, misses: 0, size: 0 },
      application: { loadTime: 0, errors: 0, users: 0 },
      optimization: { compressionRatio: 0, minificationRatio: 0 }
    };
    
    // Histórico de métricas (últimas 100 medições)
    this.metricsHistory = [];
    this.maxHistorySize = 100;
    
    // Sistema de alertas
    this.alerts = [];
    this.alertCallbacks = [];
    
    // Performance observers
    this.observers = [];
    
    console.log(' PerformanceMonitor inicializado');
  }

  /**
   * Inicia o monitoramento
   */
  startMonitoring(interval = 5000) {
    if (this.isMonitoring) return;
    
    this.setupPerformanceObservers();
    this.startMetricsCollection(interval);
    this.startHealthChecks();
    
    this.isMonitoring = true;
    console.log(` Monitoramento iniciado (${interval}ms interval)`);
  }

  /**
   * Para o monitoramento
   */
  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.cleanupObservers();
    this.isMonitoring = false;
    
    console.log('⏹ Monitoramento parado');
  }

  /**
   * Configura Performance Observers
   */
  setupPerformanceObservers() {
    try {
      // Observer para navigation timing
      if ('PerformanceObserver' in window) {
        const navObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'navigation') {
              this.updateNavigationMetrics(entry);
            }
          }
        });
        
        navObserver.observe({ entryTypes: ['navigation'] });
        this.observers.push(navObserver);
        
        // Observer para resource timing
        const resourceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.updateResourceMetrics(entry);
          }
        });
        
        resourceObserver.observe({ entryTypes: ['resource'] });
        this.observers.push(resourceObserver);
        
        // Observer para measure timing
        const measureObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.updateMeasureMetrics(entry);
          }
        });
        
        measureObserver.observe({ entryTypes: ['measure'] });
        this.observers.push(measureObserver);
      }
      
    } catch (error) {
      console.warn('Performance Observers não suportados:', error);
    }
  }

  /**
   * Inicia coleta de métricas
   */
  startMetricsCollection(interval) {
    this.monitoringInterval = setInterval(() => {
      this.collectAllMetrics();
      this.checkThresholds();
      this.saveMetricsHistory();
    }, interval);
  }

  /**
   * Coleta todas as métricas
   */
  async collectAllMetrics() {
    const timestamp = Date.now();
    
    // Métricas de memória
    this.collectMemoryMetrics();
    
    // Métricas de rede
    await this.collectNetworkMetrics();
    
    // Métricas do banco de dados
    this.collectDatabaseMetrics();
    
    // Métricas de cache
    this.collectCacheMetrics();
    
    // Métricas da aplicação
    this.collectApplicationMetrics();
    
    // Métricas de otimização
    this.collectOptimizationMetrics();
    
    this.currentMetrics.timestamp = timestamp;
  }

  /**
   * Coleta métricas de memória
   */
  collectMemoryMetrics() {
    if ('memory' in performance) {
      const memory = performance.memory;
      this.currentMetrics.memory = {
        used: Math.round(memory.usedJSHeapSize / 1024 / 1024), // MB
        total: Math.round(memory.totalJSHeapSize / 1024 / 1024), // MB
        heap: Math.round(memory.jsHeapSizeLimit / 1024 / 1024) // MB
      };
    }
  }

  /**
   * Coleta métricas de rede
   */
  async collectNetworkMetrics() {
    try {
      // Testa latência com uma requisição pequena
      const startTime = performance.now();
      await fetch('/favicon.ico', { 
        method: 'HEAD',
        cache: 'no-cache'
      });
      const latency = performance.now() - startTime;
      
      this.currentMetrics.network.latency = Math.round(latency);
      this.currentMetrics.network.requests++;
      
      // Estima bandwidth baseado em Connection API
      if ('connection' in navigator) {
        const connection = navigator.connection;
        this.currentMetrics.network.bandwidth = connection.downlink || 0;
      }
      
    } catch (error) {
      console.warn('Erro ao coletar métricas de rede:', error);
    }
  }

  /**
   * Coleta métricas do banco de dados
   */
  collectDatabaseMetrics() {
    // Integra com firestoreService se disponível
    const firestoreService = window.firestoreService;
    if (firestoreService && firestoreService.getMetrics) {
      const dbMetrics = firestoreService.getMetrics();
      this.currentMetrics.database = {
        reads: dbMetrics.reads || 0,
        writes: dbMetrics.writes || 0,
        errors: dbMetrics.errors || 0,
        latency: dbMetrics.averageLatency || 0
      };
    }
  }

  /**
   * Coleta métricas de cache
   */
  collectCacheMetrics() {
    const cacheService = window.cacheService;
    if (cacheService && cacheService.getStats) {
      const cacheStats = cacheService.getStats();
      const totalRequests = cacheStats.hits + cacheStats.misses;
      const hitRate = totalRequests > 0 ? (cacheStats.hits / totalRequests) * 100 : 0;
      
      this.currentMetrics.cache = {
        hits: cacheStats.hits || 0,
        misses: cacheStats.misses || 0,
        size: cacheStats.size || 0,
        hitRate: Math.round(hitRate)
      };
    }
  }

  /**
   * Coleta métricas da aplicação
   */
  collectApplicationMetrics() {
    // Tempo de carregamento da página
    const navigationEntry = performance.getEntriesByType('navigation')[0];
    if (navigationEntry) {
      this.currentMetrics.application.loadTime = Math.round(navigationEntry.loadEventEnd);
    }
    
    // Contagem de erros JavaScript
    this.currentMetrics.application.errors = this.getErrorCount();
    
    // Usuários ativos (baseado em autenticação)
    this.currentMetrics.application.users = auth?.currentUser ? 1 : 0;
  }

  /**
   * Coleta métricas de otimização
   */
  collectOptimizationMetrics() {
    const compressionService = window.compressionService;
    const minificationService = window.minificationService;
    
    if (compressionService && compressionService.getStats) {
      const compStats = compressionService.getStats();
      this.currentMetrics.optimization.compressionRatio = compStats.compressionRatio || 0;
    }
    
    if (minificationService && minificationService.getStats) {
      const minStats = minificationService.getStats();
      this.currentMetrics.optimization.minificationRatio = minStats.averageReduction || 0;
    }
  }

  /**
   * Atualiza métricas de navegação
   */
  updateNavigationMetrics(entry) {
    this.currentMetrics.application.loadTime = Math.round(entry.loadEventEnd);
  }

  /**
   * Atualiza métricas de recursos
   */
  updateResourceMetrics(entry) {
    this.currentMetrics.network.requests++;
    
    // Calcula latência média dos recursos
    const resourceLatency = entry.responseEnd - entry.requestStart;
    const currentLatency = this.currentMetrics.network.latency;
    const newLatency = (currentLatency + resourceLatency) / 2;
    this.currentMetrics.network.latency = Math.round(newLatency);
  }

  /**
   * Atualiza métricas de medidas customizadas
   */
  updateMeasureMetrics(entry) {
    // Processa medidas personalizadas do sistema
    if (entry.name.startsWith('database-')) {
      this.currentMetrics.database.latency = Math.round(entry.duration);
    }
  }

  /**
   * Verifica thresholds e gera alertas
   */
  checkThresholds() {
    const alerts = [];
    
    // Verifica uso de memória
    if (this.currentMetrics.memory.used > this.thresholds.memoryUsage) {
      alerts.push({
        type: 'warning',
        category: 'memory',
        message: `Alto uso de memória: ${this.currentMetrics.memory.used}MB`,
        value: this.currentMetrics.memory.used,
        threshold: this.thresholds.memoryUsage
      });
    }
    
    // Verifica latência de rede
    if (this.currentMetrics.network.latency > this.thresholds.networkLatency) {
      alerts.push({
        type: 'warning',
        category: 'network',
        message: `Alta latência de rede: ${this.currentMetrics.network.latency}ms`,
        value: this.currentMetrics.network.latency,
        threshold: this.thresholds.networkLatency
      });
    }
    
    // Verifica taxa de hit do cache
    if (this.currentMetrics.cache.hitRate < this.thresholds.cacheHitRate) {
      alerts.push({
        type: 'info',
        category: 'cache',
        message: `Baixa taxa de hit do cache: ${this.currentMetrics.cache.hitRate}%`,
        value: this.currentMetrics.cache.hitRate,
        threshold: this.thresholds.cacheHitRate
      });
    }
    
    // Verifica tempo de carregamento
    if (this.currentMetrics.application.loadTime > this.thresholds.loadTime) {
      alerts.push({
        type: 'warning',
        category: 'performance',
        message: `Tempo de carregamento alto: ${this.currentMetrics.application.loadTime}ms`,
        value: this.currentMetrics.application.loadTime,
        threshold: this.thresholds.loadTime
      });
    }
    
    // Processa novos alertas
    alerts.forEach(alert => this.processAlert(alert));
  }

  /**
   * Processa um alerta
   */
  processAlert(alert) {
    alert.id = Date.now() + Math.random();
    alert.timestamp = Date.now();
    
    // Adiciona ao array de alertas
    this.alerts.unshift(alert);
    
    // Mantém apenas os últimos 50 alertas
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(0, 50);
    }
    
    // Executa callbacks de alerta
    if (this.alertsEnabled) {
      this.alertCallbacks.forEach(callback => {
        try {
          callback(alert);
        } catch (error) {
          console.error('Erro no callback de alerta:', error);
        }
      });
    }
    
    console.warn(` Alerta ${alert.type}:`, alert.message);
  }

  /**
   * Salva métricas no histórico
   */
  saveMetricsHistory() {
    const metricsSnapshot = JSON.parse(JSON.stringify(this.currentMetrics));
    this.metricsHistory.unshift(metricsSnapshot);
    
    // Mantém apenas as últimas medições
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Inicia health checks automáticos
   */
  startHealthChecks() {
    // Health check a cada 30 segundos
    setInterval(() => {
      this.performHealthCheck();
    }, 30000);
  }

  /**
   * Executa health check
   */
  async performHealthCheck() {
    const healthStatus = {
      timestamp: Date.now(),
      overall: 'healthy',
      services: {}
    };
    
    // Verifica Firebase
    try {
      if (auth && window.firebase && window.firebase.firestore) {
  await window.firebase.firestore().collection('test').limit(1).get();
        healthStatus.services.firebase = { status: 'healthy', latency: Date.now() - healthStatus.timestamp };
      } else {
        healthStatus.services.firebase = { status: 'unavailable', error: 'Firebase não inicializado' };
      }
    } catch (error) {
      healthStatus.services.firebase = { status: 'error', error: error.message };
      healthStatus.overall = 'degraded';
    }
    
    // Verifica Service Worker
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        healthStatus.services.serviceWorker = { 
          status: registration ? 'healthy' : 'inactive',
          active: !!registration?.active
        };
      } catch (error) {
        healthStatus.services.serviceWorker = { status: 'error', error: error.message };
      }
    }
    
    // Verifica serviços de otimização
    const optimizationServices = ['cacheService', 'compressionService', 'cdnOptimizer'];
    optimizationServices.forEach(serviceName => {
      const service = window[serviceName];
      healthStatus.services[serviceName] = {
        status: service ? 'healthy' : 'unavailable',
        initialized: !!service
      };
    });
    
    this.lastHealthCheck = healthStatus;
    console.log(' Health check concluído:', healthStatus.overall);
  }

  /**
   * Gera relatório de performance
   */
  generateReport(timeRange = '1h') {
    const now = Date.now();
    const timeRanges = {
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000
    };
    
    const rangeMs = timeRanges[timeRange] || timeRanges['1h'];
    const cutoff = now - rangeMs;
    
    const relevantMetrics = this.metricsHistory.filter(m => m.timestamp >= cutoff);
    
    if (relevantMetrics.length === 0) {
      return { error: 'Não há dados suficientes para o período solicitado' };
    }
    
    const report = {
      timeRange,
      periodStart: new Date(cutoff).toISOString(),
      periodEnd: new Date(now).toISOString(),
      dataPoints: relevantMetrics.length,
      summary: this.calculateSummaryStats(relevantMetrics),
      trends: this.calculateTrends(relevantMetrics),
      alerts: this.alerts.filter(a => a.timestamp >= cutoff),
      recommendations: this.generateRecommendations(relevantMetrics)
    };
    
    return report;
  }

  /**
   * Calcula estatísticas resumidas
   */
  calculateSummaryStats(metrics) {
    const getValue = (metric, path) => {
      const pathParts = path.split('.');
      let value = metric;
      for (const part of pathParts) {
        value = value?.[part];
      }
      return typeof value === 'number' ? value : 0;
    };
    
    const calculateStats = (values) => ({
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      current: values[0] || 0
    });
    
    return {
      memory: calculateStats(metrics.map(m => getValue(m, 'memory.used'))),
      networkLatency: calculateStats(metrics.map(m => getValue(m, 'network.latency'))),
      databaseLatency: calculateStats(metrics.map(m => getValue(m, 'database.latency'))),
      cacheHitRate: calculateStats(metrics.map(m => getValue(m, 'cache.hitRate'))),
      loadTime: calculateStats(metrics.map(m => getValue(m, 'application.loadTime')))
    };
  }

  /**
   * Calcula tendências
   */
  calculateTrends(metrics) {
    if (metrics.length < 2) return {};
    
    const first = metrics[metrics.length - 1];
    const last = metrics[0];
    
    const calculateTrend = (firstVal, lastVal) => {
      if (firstVal === 0) return 0;
      return ((lastVal - firstVal) / firstVal) * 100;
    };
    
    return {
      memory: calculateTrend(first.memory.used, last.memory.used),
      networkLatency: calculateTrend(first.network.latency, last.network.latency),
      cacheHitRate: calculateTrend(first.cache.hitRate, last.cache.hitRate),
      loadTime: calculateTrend(first.application.loadTime, last.application.loadTime)
    };
  }

  /**
   * Gera recomendações baseadas nas métricas
   */
  generateRecommendations(metrics) {
    const recommendations = [];
    const recent = metrics.slice(0, 5); // Últimas 5 medições
    
    // Verifica uso de memória
    const avgMemory = recent.reduce((sum, m) => sum + m.memory.used, 0) / recent.length;
    if (avgMemory > this.thresholds.memoryUsage * 0.8) {
      recommendations.push({
        type: 'memory',
        priority: 'high',
        message: 'Considere otimizar o uso de memória',
        actions: ['Limpar caches desnecessários', 'Revisar vazamentos de memória', 'Implementar garbage collection manual']
      });
    }
    
    // Verifica cache hit rate
    const avgCacheHit = recent.reduce((sum, m) => sum + m.cache.hitRate, 0) / recent.length;
    if (avgCacheHit < this.thresholds.cacheHitRate) {
      recommendations.push({
        type: 'cache',
        priority: 'medium',
        message: 'Taxa de hit do cache pode ser melhorada',
        actions: ['Revisar estratégias de cache', 'Aumentar TTL adequadamente', 'Implementar preloading inteligente']
      });
    }
    
    // Verifica latência de rede
    const avgLatency = recent.reduce((sum, m) => sum + m.network.latency, 0) / recent.length;
    if (avgLatency > this.thresholds.networkLatency * 0.7) {
      recommendations.push({
        type: 'network',
        priority: 'medium',
        message: 'Latência de rede acima do ideal',
        actions: ['Verificar CDN', 'Otimizar tamanho de recursos', 'Implementar compressão adicional']
      });
    }
    
    return recommendations;
  }

  /**
   * Registra callback de alerta
   */
  onAlert(callback) {
    this.alertCallbacks.push(callback);
  }

  /**
   * Remove callback de alerta
   */
  offAlert(callback) {
    const index = this.alertCallbacks.indexOf(callback);
    if (index > -1) {
      this.alertCallbacks.splice(index, 1);
    }
  }

  /**
   * Configura thresholds
   */
  setThresholds(newThresholds) {
    Object.assign(this.thresholds, newThresholds);
    console.log(' Thresholds atualizados:', this.thresholds);
  }

  /**
   * Habilita/desabilita alertas
   */
  setAlertsEnabled(enabled) {
    this.alertsEnabled = enabled;
    console.log(` Alertas ${enabled ? 'habilitados' : 'desabilitados'}`);
  }

  /**
   * Obtém contagem de erros JavaScript
   */
  getErrorCount() {
    return window.errorCount || 0;
  }

  /**
   * Limpa observers
   */
  cleanupObservers() {
    this.observers.forEach(observer => {
      try {
        observer.disconnect();
      } catch (error) {
        console.warn('Erro ao desconectar observer:', error);
      }
    });
    this.observers = [];
  }

  /**
   * Obtém métricas atuais
   */
  getCurrentMetrics() {
    return JSON.parse(JSON.stringify(this.currentMetrics));
  }

  /**
   * Obtém histórico de métricas
   */
  getMetricsHistory(limit = 50) {
    return this.metricsHistory.slice(0, limit);
  }

  /**
   * Obtém alertas
   */
  getAlerts(limit = 20) {
    return this.alerts.slice(0, limit);
  }

  /**
   * Limpa alertas
   */
  clearAlerts() {
    this.alerts = [];
    console.log(' Alertas limpos');
  }

  /**
   * Obtém último health check
   */
  getLastHealthCheck() {
    return this.lastHealthCheck;
  }

  /**
   * Exporta dados de monitoramento
   */
  exportData() {
    return {
      currentMetrics: this.currentMetrics,
      metricsHistory: this.metricsHistory,
      alerts: this.alerts,
      thresholds: this.thresholds,
      lastHealthCheck: this.lastHealthCheck,
      exportTimestamp: Date.now()
    };
  }

  /**
   * Limpa todos os dados
   */
  clearAllData() {
    this.metricsHistory = [];
    this.alerts = [];
    this.currentMetrics = {
      timestamp: Date.now(),
      cpu: { usage: 0, cores: navigator.hardwareConcurrency || 4 },
      memory: { used: 0, total: 0, heap: 0 },
      network: { latency: 0, bandwidth: 0, requests: 0 },
      database: { reads: 0, writes: 0, errors: 0, latency: 0 },
      cache: { hits: 0, misses: 0, size: 0 },
      application: { loadTime: 0, errors: 0, users: 0 },
      optimization: { compressionRatio: 0, minificationRatio: 0 }
    };
    
    console.log(' Todos os dados de monitoramento limpos');
  }

  /**
   * Destroi o monitor
   */
  destroy() {
    this.stopMonitoring();
    this.clearAllData();
    this.alertCallbacks = [];
    console.log(' PerformanceMonitor destruído');
  }
}

// Instância global
const performanceMonitor = new PerformanceMonitor();
// Expor no escopo global para uso em outras partes da app
window.performanceMonitor = performanceMonitor;

// Contador global de erros JavaScript
window.errorCount = 0;
window.addEventListener('error', () => {
  window.errorCount++;
});

window.addEventListener('unhandledrejection', () => {
  window.errorCount++;
});

// Exposição global já feita na criação da instância
// export default performanceMonitor; // Removido para compatibilidade