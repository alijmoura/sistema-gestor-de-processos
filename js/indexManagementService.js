/**
 *  Index Management Service
 * Serviço para gerenciar índices compostos e otimização de queries
 */

import { compositeIndexOptimizer } from './compositeIndexOptimizer.js';

class IndexManagementService {
    constructor() {
        this.isInitialized = false;
        this.currentOptimization = null;
        this.indexStatus = new Map();
        this.performanceMetrics = {
            queriesAnalyzed: 0,
            optimizationsApplied: 0,
            totalSavings: 0
        };
    }

    /**
     *  Inicializa o serviço de gestão de índices
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            console.log(' Inicializando Index Management Service...');
            
            // Analisa queries atuais
            await this.analyzeCurrentState();
            
            // Registra métricas iniciais
            this.registerPerformanceMonitoring();
            
            this.isInitialized = true;
            console.log(' Index Management Service inicializado');
            
        } catch (error) {
            console.error(' Erro ao inicializar Index Management Service:', error);
        }
    }

    /**
     *  Analisa estado atual do sistema
     */
    async analyzeCurrentState() {
        try {
            console.log(' Analisando estado atual dos índices...');
            
            const optimization = compositeIndexOptimizer.generateOptimizationScript();
            this.currentOptimization = optimization;
            
            // Gera relatório de estado
            const stateReport = {
                timestamp: new Date().toISOString(),
                missingIndexes: optimization.missingIndexes.length,
                potentialSavings: optimization.report.summary.totalSavings,
                criticalQueries: optimization.commands.filter(c => c.priority === 1).length,
                estimatedCostSavings: optimization.report.summary.estimatedMonthlyCost - optimization.report.summary.optimizedMonthlyCost
            };

            console.log(' Estado atual:', stateReport);
            return stateReport;
            
        } catch (error) {
            console.error(' Erro na análise do estado atual:', error);
            return null;
        }
    }

    /**
     *  Gera script de criação de índices
     */
    generateIndexCreationScript() {
        if (!this.currentOptimization) {
            console.warn(' Análise não realizada. Execute analyzeCurrentState() primeiro.');
            return null;
        }

        const script = this.currentOptimization.script;
        
        // Salva script em arquivo para execução
        this.saveScriptToFile(script);
        
        return {
            script,
            commands: this.currentOptimization.commands,
            summary: this.currentOptimization.report.summary
        };
    }

    /**
     *  Salva script em arquivo para execução
     */
    saveScriptToFile(script) {
        try {
            // Cria elemento para download
            const element = document.createElement('a');
            const file = new Blob([script], { type: 'text/plain' });
            element.href = URL.createObjectURL(file);
            element.download = `create-composite-indexes-${Date.now()}.sh`;
            
            // Adiciona ao DOM temporariamente e clica
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
            
            console.log(' Script salvo para download');
            
        } catch (error) {
            console.error(' Erro ao salvar script:', error);
        }
    }

    /**
     *  Monitora performance de queries específicas
     */
    async monitorQueryPerformance(queryId, queryFunction) {
        const startTime = Date.now();
        let result = null;
        let error = null;

        try {
            result = await queryFunction();
            
        } catch (err) {
            error = err;
            
        } finally {
            const duration = Date.now() - startTime;
            
            this.recordQueryMetrics(queryId, {
                duration,
                success: !error,
                timestamp: new Date().toISOString(),
                hasOptimalIndex: this.hasOptimalIndex(queryId)
            });

            if (duration > 500) {
                console.warn(` Query lenta detectada: ${queryId} (${duration}ms)`);
                this.suggestOptimization(queryId);
            }
        }

        if (error) throw error;
        return result;
    }

    /**
     *  Sugere otimizações baseadas em performance
     */
    suggestOptimization(queryId) {
        const pattern = this.findPatternForQuery(queryId);
        
        if (pattern) {
            console.log(` Sugestão de otimização para ${queryId}:`);
            console.log(` Comando: ${pattern.firebaseCommand}`);
            console.log(` Economia esperada: ${pattern.savings}`);
            
            // Mostra notificação no UI
            this.showOptimizationSuggestion(pattern);
        }
    }

    /**
     *  Encontra padrão correspondente para uma query
     */
    findPatternForQuery(queryId) {
        if (!this.currentOptimization) return null;
        
        return this.currentOptimization.commands.find(cmd => 
            cmd.id.includes(queryId) || queryId.includes(cmd.id)
        );
    }

    /**
     *  Registra métricas de query
     */
    recordQueryMetrics(queryId, metrics) {
        if (!this.indexStatus.has(queryId)) {
            this.indexStatus.set(queryId, {
                queries: [],
                avgDuration: 0,
                totalQueries: 0
            });
        }

        const queryStats = this.indexStatus.get(queryId);
        queryStats.queries.push(metrics);
        queryStats.totalQueries++;
        
        // Calcula média móvel
        const recent = queryStats.queries.slice(-10);
        queryStats.avgDuration = recent.reduce((sum, m) => sum + m.duration, 0) / recent.length;
        
        this.performanceMetrics.queriesAnalyzed++;
    }

    /**
     *  Verifica se query tem índice otimizado
     */
    hasOptimalIndex(queryId) {
        // Simula verificação baseada nos padrões conhecidos
        return this.currentOptimization && 
               !this.currentOptimization.missingIndexes.includes(queryId);
    }

    /**
     *  Mostra sugestão de otimização no UI
     */
    showOptimizationSuggestion(pattern) {
        if (window.showNotification) {
            window.showNotification(
                ` Otimização disponível: ${pattern.usage}. Economia de ${pattern.savings}!`,
                'info',
                5000
            );
        }
    }

    /**
     *  Registra monitoramento de performance contínuo
     */
    registerPerformanceMonitoring() {
        // Intercepta queries do firestoreService se disponível
        if (window.firestoreService) {
            this.wrapFirestoreQueries();
        }

        // Monitora cache hits do cacheService
        if (window.cacheService) {
            this.monitorCachePerformance();
        }
    }

    /**
     *  Envolve queries do Firestore para monitoramento
     */
    wrapFirestoreQueries() {
        const originalGetContracts = window.firestoreService.getAllContracts;
        
        if (originalGetContracts) {
            window.firestoreService.getAllContracts = async (...args) => {
                return await this.monitorQueryPerformance(
                    'get_all_contracts',
                    () => originalGetContracts.apply(window.firestoreService, args)
                );
            };
        }
    }

    /**
     *  Monitora performance do cache
     */
    monitorCachePerformance() {
        const originalGet = window.cacheService.get;
        
        if (originalGet) {
            window.cacheService.get = async (key, fetchFunction, category, forceRefresh) => {
                const startTime = Date.now();
                const result = await originalGet.call(window.cacheService, key, fetchFunction, category, forceRefresh);
                const duration = Date.now() - startTime;
                
                if (duration < 10) {
                    // Cache hit - query otimizada
                    this.performanceMetrics.totalSavings += 100; // Reads aproximados economizados
                }
                
                return result;
            };
        }
    }

    /**
     *  Gera relatório de performance atual
     */
    generatePerformanceReport() {
        const slowQueries = [];
        const optimizedQueries = [];
        
        for (const [queryId, stats] of this.indexStatus.entries()) {
            if (stats.avgDuration > 300) {
                slowQueries.push({
                    queryId,
                    avgDuration: Math.round(stats.avgDuration),
                    totalQueries: stats.totalQueries,
                    status: 'needs_optimization'
                });
            } else {
                optimizedQueries.push({
                    queryId,
                    avgDuration: Math.round(stats.avgDuration),
                    totalQueries: stats.totalQueries,
                    status: 'optimal'
                });
            }
        }

        return {
            summary: {
                totalQueries: this.performanceMetrics.queriesAnalyzed,
                slowQueries: slowQueries.length,
                optimizedQueries: optimizedQueries.length,
                estimatedSavings: this.performanceMetrics.totalSavings
            },
            slowQueries,
            optimizedQueries,
            recommendations: this.generateRecommendations(slowQueries)
        };
    }

    /**
     *  Gera recomendações de otimização
     */
    generateRecommendations(slowQueries) {
        return slowQueries.map(query => {
            const pattern = this.findPatternForQuery(query.queryId);
            
            return {
                queryId: query.queryId,
                currentPerformance: `${query.avgDuration}ms`,
                recommendation: pattern ? pattern.firebaseCommand : 'Análise de índice necessária',
                expectedImprovement: pattern ? pattern.savings : 'A determinar',
                priority: query.avgDuration > 1000 ? 'critical' : query.avgDuration > 500 ? 'high' : 'medium'
            };
        });
    }

    /**
     *  Função para teste manual
     */
    async runCompleteAnalysis() {
        console.log(' Executando análise completa de índices...');
        
        try {
            // 1. Analisa estado atual
            const stateReport = await this.analyzeCurrentState();
            
            // 2. Gera script de otimização
            const scriptData = this.generateIndexCreationScript();
            
            // 3. Gera relatório de performance
            const performanceReport = this.generatePerformanceReport();
            
            // 4. Mostra resumo
            console.log(' RESUMO DA ANÁLISE:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(` Índices em falta: ${stateReport.missingIndexes}`);
            console.log(` Economia potencial: $${stateReport.estimatedCostSavings.toFixed(2)}/mês`);
            console.log(` Economia de reads: ${stateReport.potentialSavings.toLocaleString()}/mês`);
            console.log(` Queries críticas: ${stateReport.criticalQueries}`);
            
            return {
                stateReport,
                scriptData,
                performanceReport
            };
            
        } catch (error) {
            console.error(' Erro na análise completa:', error);
            throw error;
        }
    }
}

// Instância global
const indexManagementService = new IndexManagementService();

// Função para uso manual
window.analyzeIndexes = async function() {
    await indexManagementService.initialize();
    return await indexManagementService.runCompleteAnalysis();
};

window.generateIndexScript = function() {
    return indexManagementService.generateIndexCreationScript();
};

export { IndexManagementService, indexManagementService };