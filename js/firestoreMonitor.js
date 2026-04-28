/**
 * @file firestoreMonitor.js
 * @description Monitor de leituras e performance do Firestore em tempo real
 * 
 * Uso:
 * 1. Importar no index.html: <script type="module" src="js/firestoreMonitor.js"></script>
 * 2. Abrir console: window.firestoreMonitor.getReport()
 * 3. Ativar logging: window.firestoreMonitor.enableLogging(true)
 */

class FirestoreMonitor {
  constructor() {
    this.metrics = {
      totalReads: 0,
      readsByCollection: {},
      readsByOperation: {},
      cacheHits: 0,
      cacheMisses: 0,
      listenerCount: 0,
      activeListeners: new Set(),
      startTime: Date.now()
    };
    
    this.config = {
      logReads: false,
      logThreshold: 10, // Alerta se > 10 leituras em operação única
      alertOnHighReads: true
    };
    
    this.readHistory = [];
    this.maxHistorySize = 1000;
    
    console.log(' FirestoreMonitor inicializado');
  }

  /**
   * Inicia monitoramento interceptando chamadas do Firestore
   */
  startMonitoring() {
    if (this.isMonitoring) {
      console.warn(' Monitor já está ativo');
      return;
    }

    this.isMonitoring = true;
    console.log(' Iniciando monitoramento do Firestore...');

    // Intercepta métodos de leitura do Firestore
    this.patchFirestoreMethods();
    
    // Monitora listeners
    this.monitorListeners();
    
    // Relatório periódico
    this.reportInterval = setInterval(() => {
      this.printPeriodicReport();
    }, 60000); // A cada 1 minuto

    console.log(' Monitoramento ativo');
  }

  /**
   * Para monitoramento e restaura métodos originais
   */
  stopMonitoring() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
    }

    // Restaura métodos originais (se necessário)
    console.log(' Monitoramento pausado');
  }

  /**
   * Intercepta métodos de leitura do Firestore
   */
  patchFirestoreMethods() {
    const self = this;
    
    // Não podemos modificar prototypes do Firebase diretamente
    // Vamos monitorar através dos wrappers do firestoreService
    if (window.firestoreService) {
      const originalGetAll = window.firestoreService.getAllContracts;
      window.firestoreService.getAllContracts = async function(...args) {
        const startTime = performance.now();
        const result = await originalGetAll.apply(this, args);
        const duration = performance.now() - startTime;
        
        const readCount = Array.isArray(result) ? result.length : 0;
        self.recordRead('getAllContracts', 'contracts', readCount, duration);
        
        if (readCount > self.config.logThreshold && self.config.alertOnHighReads) {
          console.warn(` ALTO CONSUMO: getAllContracts leu ${readCount} documentos em ${duration.toFixed(0)}ms`);
        }
        
        return result;
      };

      const originalGetPage = window.firestoreService.getContractsPage;
      window.firestoreService.getContractsPage = async function(...args) {
        const startTime = performance.now();
        const result = await originalGetPage.apply(this, args);
        const duration = performance.now() - startTime;
        
        const readCount = result.contracts ? result.contracts.length : 0;
        self.recordRead('getContractsPage', 'contracts', readCount, duration);
        
        return result;
      };

      const originalGetById = window.firestoreService.getContractById;
      window.firestoreService.getContractById = async function(...args) {
        const startTime = performance.now();
        const result = await originalGetById.apply(this, args);
        const duration = performance.now() - startTime;
        
        self.recordRead('getContractById', 'contracts', 1, duration);
        
        return result;
      };

      console.log(' Métodos do firestoreService interceptados');
    }

    // Monitora cacheService
    if (window.cacheService) {
      const originalGet = window.cacheService.get.bind(window.cacheService);
      window.cacheService.get = async function(key, fetchFn, type, forceRefresh) {
        const cached = this.cache.get(key);
        const isHit = cached && !forceRefresh && 
                     (Date.now() - cached.timestamp) < (window.cacheService.config?.[type] || 180000);
        
        if (isHit) {
          self.metrics.cacheHits++;
        } else {
          self.metrics.cacheMisses++;
        }
        
        return originalGet.call(this, key, fetchFn, type, forceRefresh);
      };
    }
  }

  /**
   * Monitora listeners ativos
   */
  monitorListeners() {
    if (window.listenerOptimizer) {
      // Obtém estatísticas de listeners
      const stats = window.listenerOptimizer.getStats();
      this.metrics.listenerCount = stats.totalListeners || 0;
      this.metrics.activeListeners = new Set(
        window.listenerOptimizer.activeListeners.keys()
      );
    }
  }

  /**
   * Registra uma operação de leitura
   */
  recordRead(operation, collection, count, duration) {
    this.metrics.totalReads += count;
    
    // Por coleção
    if (!this.metrics.readsByCollection[collection]) {
      this.metrics.readsByCollection[collection] = 0;
    }
    this.metrics.readsByCollection[collection] += count;
    
    // Por operação
    if (!this.metrics.readsByOperation[operation]) {
      this.metrics.readsByOperation[operation] = { count: 0, totalDuration: 0, calls: 0 };
    }
    this.metrics.readsByOperation[operation].count += count;
    this.metrics.readsByOperation[operation].totalDuration += duration;
    this.metrics.readsByOperation[operation].calls += 1;
    
    // Histórico
    const record = {
      timestamp: Date.now(),
      operation,
      collection,
      count,
      duration
    };
    
    this.readHistory.push(record);
    
    // Limita tamanho do histórico
    if (this.readHistory.length > this.maxHistorySize) {
      this.readHistory.shift();
    }
    
    // Log se ativado
    if (this.config.logReads) {
      console.log(` [${operation}] ${count} leituras em ${collection} (${duration.toFixed(0)}ms)`);
    }
  }

  /**
   * Calcula taxa de leituras por minuto
   */
  getReadsPerMinute() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const recentReads = this.readHistory.filter(r => r.timestamp > oneMinuteAgo);
    return recentReads.reduce((sum, r) => sum + r.count, 0);
  }

  /**
   * Identifica operações mais custosas
   */
  getTopOperations(limit = 5) {
    const operations = Object.entries(this.metrics.readsByOperation)
      .map(([name, stats]) => ({
        name,
        totalReads: stats.count,
        avgReadsPerCall: (stats.count / stats.calls).toFixed(1),
        totalCalls: stats.calls,
        avgDuration: (stats.totalDuration / stats.calls).toFixed(0)
      }))
      .sort((a, b) => b.totalReads - a.totalReads)
      .slice(0, limit);
    
    return operations;
  }

  /**
   * Gera relatório completo
   */
  getReport() {
    const uptimeMs = Date.now() - this.metrics.startTime;
    const uptimeMin = Math.floor(uptimeMs / 60000);
    
    const cacheTotal = this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheHitRate = cacheTotal > 0 
      ? ((this.metrics.cacheHits / cacheTotal) * 100).toFixed(1)
      : '0.0';
    
    const readsPerMin = this.getReadsPerMinute();
    const topOps = this.getTopOperations();
    
    this.monitorListeners(); // Atualiza contagem de listeners
    
    const report = {
      summary: {
        totalReads: this.metrics.totalReads,
        readsPerMinute: readsPerMin,
        uptime: `${uptimeMin} minutos`,
        cacheHitRate: `${cacheHitRate}%`,
        activeListeners: this.metrics.listenerCount
      },
      readsByCollection: this.metrics.readsByCollection,
      topOperations: topOps,
      cache: {
        hits: this.metrics.cacheHits,
        misses: this.metrics.cacheMisses,
        hitRate: `${cacheHitRate}%`
      },
      listeners: {
        total: this.metrics.listenerCount,
        active: Array.from(this.metrics.activeListeners)
      },
      recommendations: this.generateRecommendations()
    };
    
    return report;
  }

  /**
   * Gera recomendações baseadas em métricas
   */
  generateRecommendations() {
    const recommendations = [];
    
    // Verifica taxa de leituras
    const readsPerMin = this.getReadsPerMinute();
    if (readsPerMin > 100) {
      recommendations.push({
        severity: 'high',
        message: `Taxa de leituras muito alta: ${readsPerMin}/min. Considere aumentar TTL do cache ou otimizar listeners.`
      });
    }
    
    // Verifica cache hit rate
    const cacheTotal = this.metrics.cacheHits + this.metrics.cacheMisses;
    const hitRate = cacheTotal > 0 ? (this.metrics.cacheHits / cacheTotal) : 0;
    if (hitRate < 0.5 && cacheTotal > 20) {
      recommendations.push({
        severity: 'medium',
        message: `Cache hit rate baixo (${(hitRate * 100).toFixed(0)}%). Considere aumentar TTL dos caches.`
      });
    }
    
    // Verifica getAllContracts
    const getAllOp = this.metrics.readsByOperation['getAllContracts'];
    if (getAllOp && getAllOp.calls > 5) {
      recommendations.push({
        severity: 'high',
        message: `getAllContracts chamado ${getAllOp.calls} vezes (${getAllOp.count} leituras). Use paginação.`
      });
    }
    
    // Verifica listeners
    if (this.metrics.listenerCount > 5) {
      recommendations.push({
        severity: 'medium',
        message: `${this.metrics.listenerCount} listeners ativos. Considere pausar quando aba em background.`
      });
    }
    
    return recommendations;
  }

  /**
   * Imprime relatório periódico no console
   */
  printPeriodicReport() {
    console.group(' Relatório Firestore (último minuto)');
    
    const readsPerMin = this.getReadsPerMinute();
    const cacheTotal = this.metrics.cacheHits + this.metrics.cacheMisses;
    const hitRate = cacheTotal > 0 
      ? ((this.metrics.cacheHits / cacheTotal) * 100).toFixed(1)
      : '0.0';
    
    console.log(` Leituras/min: ${readsPerMin}`);
    console.log(` Cache hit rate: ${hitRate}%`);
    console.log(` Listeners ativos: ${this.metrics.listenerCount}`);
    
    const topOps = this.getTopOperations(3);
    if (topOps.length > 0) {
      console.log('\n Top operações:');
      topOps.forEach((op, i) => {
        console.log(`  ${i + 1}. ${op.name}: ${op.totalReads} leituras em ${op.totalCalls} chamadas`);
      });
    }
    
    const recs = this.generateRecommendations();
    if (recs.length > 0) {
      console.log('\n Recomendações:');
      recs.forEach(rec => {
        const icon = rec.severity === 'high' ? '' : '';
        console.log(`  ${icon} ${rec.message}`);
      });
    }
    
    console.groupEnd();
  }

  /**
   * Imprime relatório formatado no console
   */
  printReport() {
    const report = this.getReport();
    
    console.group(' RELATÓRIO COMPLETO - Firestore Monitor');
    
    console.log('\n RESUMO');
    console.table(report.summary);
    
    console.log('\n LEITURAS POR COLEÇÃO');
    console.table(report.readsByCollection);
    
    console.log('\n TOP OPERAÇÕES');
    console.table(report.topOperations);
    
    console.log('\n CACHE');
    console.table(report.cache);
    
    console.log('\n LISTENERS');
    console.log('Total:', report.listeners.total);
    console.log('Ativos:', report.listeners.active);
    
    if (report.recommendations.length > 0) {
      console.log('\n RECOMENDAÇÕES');
      report.recommendations.forEach(rec => {
        const icon = rec.severity === 'high' ? '' : rec.severity === 'medium' ? '' : '';
        console.log(`${icon} ${rec.message}`);
      });
    }
    
    console.groupEnd();
  }

  /**
   * Reseta todas as métricas
   */
  reset() {
    this.metrics = {
      totalReads: 0,
      readsByCollection: {},
      readsByOperation: {},
      cacheHits: 0,
      cacheMisses: 0,
      listenerCount: 0,
      activeListeners: new Set(),
      startTime: Date.now()
    };
    this.readHistory = [];
    console.log(' Métricas resetadas');
  }

  /**
   * Ativa/desativa logging de leituras
   */
  enableLogging(enabled) {
    this.config.logReads = enabled;
    console.log(` Logging ${enabled ? 'ativado' : 'desativado'}`);
  }

  /**
   * Exporta dados para análise externa
   */
  exportData() {
    const data = {
      metrics: this.metrics,
      history: this.readHistory,
      report: this.getReport(),
      exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firestore-monitor-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log(' Dados exportados');
  }
}

// Instância global
const firestoreMonitor = new FirestoreMonitor();

// Inicia automaticamente em modo debug
if (window.__DEBUG__) {
  firestoreMonitor.startMonitoring();
}

// Expõe globalmente
window.firestoreMonitor = firestoreMonitor;

// Comandos úteis no console
console.log(`
 FIRESTORE MONITOR CARREGADO

Comandos disponíveis:
  firestoreMonitor.startMonitoring()  - Inicia monitoramento
  firestoreMonitor.stopMonitoring()   - Para monitoramento
  firestoreMonitor.getReport()        - Retorna relatório completo
  firestoreMonitor.printReport()      - Imprime relatório formatado
  firestoreMonitor.enableLogging(true) - Ativa logging de cada leitura
  firestoreMonitor.reset()            - Reseta métricas
  firestoreMonitor.exportData()       - Exporta dados em JSON

Acesse: window.firestoreMonitor
`);

export default firestoreMonitor;
