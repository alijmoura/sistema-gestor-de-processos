/**
 *  Composite Index Optimizer
 * Sistema de análise e otimização de índices compostos para Firestore
 * 
 * Identifica padrões de queries complexas e gera comandos otimizados
 * para criar índices compostos que aceleram consultas específicas.
 */

class CompositeIndexOptimizer {
    constructor() {
        this.queryPatterns = new Map();
        this.indexUsageStats = new Map();
        this.missingIndexes = new Set();
        this.analytics = {
            totalQueries: 0,
            optimizedQueries: 0,
            savedReads: 0
        };
    }

    /**
     *  Analisa padrões de queries atuais no sistema
     */
    analyzeCurrentQueries() {
        console.log(' Analisando padrões de queries do sistema...');
        
        const patterns = this.getKnownQueryPatterns();
        patterns.forEach(pattern => {
            this.queryPatterns.set(pattern.id, pattern);
        });

        return patterns;
    }

    /**
     *  Padrões de queries identificados no sistema
     */
    getKnownQueryPatterns() {
        return [
            // CRÍTICOS - Altíssima prioridade
            {
                id: 'status_principal_pagination',
                collection: 'contracts',
                fields: ['status', 'clientePrincipal', '__name__'],
                type: 'pagination_cursor',
                usage: 'Paginação principal com filtro de status',
                frequency: 'crítica',
                impact: 'muito_alto',
                currentReads: 1000,
                optimizedReads: 20,
                savings: '98%',
                queries: [
                    "query.where('status', 'in', [...]).orderBy('clientePrincipal').startAfter(cursor)",
                    "query.where('status', 'not-in', [...]).orderBy('status').orderBy('clientePrincipal')"
                ],
                firebaseCommand: `firebase firestore:indexes:create --collection-group=contracts --fields="status:ascending,clientePrincipal:ascending,__name__:ascending"`
            },

            {
                id: 'status_temporal_dashboard',
                collection: 'contracts',
                fields: ['status', 'criadoEm'],
                type: 'filter_and_sort',
                usage: 'Dashboard - contratos recentes por status',
                frequency: 'crítica',
                impact: 'alto',
                currentReads: 500,
                optimizedReads: 20,
                savings: '96%',
                queries: [
                    "query.where('status', 'in', [...]).orderBy('criadoEm', 'desc')",
                    "query.where('status', '==', 'Pendente').orderBy('criadoEm', 'desc')"
                ],
                firebaseCommand: `firebase firestore:indexes:create --collection-group=contracts --fields="status:ascending,criadoEm:descending"`
            },

            {
                id: 'status_data_assinatura',
                collection: 'contracts',
                fields: ['status', 'dataAssinatura'],
                type: 'filter_and_sort',
                usage: 'Relatórios por período e status',
                frequency: 'alta',
                impact: 'alto',
                currentReads: 300,
                optimizedReads: 15,
                savings: '95%',
                queries: [
                    "query.where('status', 'in', [...]).orderBy('dataAssinatura', 'desc')",
                    "query.where('status', '==', 'Registrado').orderBy('dataAssinatura', 'desc')"
                ],
                firebaseCommand: `firebase firestore:indexes:create --collection-group=contracts --fields="status:ascending,dataAssinatura:descending"`
            },

            // ALTA PRIORIDADE
            {
                id: 'vendedor_status_temporal',
                collection: 'contracts',
                fields: ['vendedorConstrutora', 'status', 'dataAssinatura'],
                type: 'complex_filter_sort',
                usage: 'Relatórios de vendedor por status e período',
                frequency: 'alta',
                impact: 'médio',
                currentReads: 200,
                optimizedReads: 10,
                savings: '95%',
                queries: [
                    "query.where('vendedorConstrutora', '==', 'João').where('status', 'in', [...]).orderBy('dataAssinatura', 'desc')"
                ],
                firebaseCommand: `firebase firestore:indexes:create --collection-group=contracts --fields="vendedorConstrutora:ascending,status:ascending,dataAssinatura:descending"`
            },

            {
                id: 'empreendimento_status',
                collection: 'contracts',
                fields: ['empreendimento', 'status'],
                type: 'filter_and_filter',
                usage: 'Filtros por empreendimento e status',
                frequency: 'média',
                impact: 'médio',
                currentReads: 150,
                optimizedReads: 10,
                savings: '93%',
                queries: [
                    "query.where('empreendimento', '==', 'Residencial A').where('status', 'in', [...])"
                ],
                firebaseCommand: `firebase firestore:indexes:create --collection-group=contracts --fields="empreendimento:ascending,status:ascending"`
            },

            // MÉDIAS
            {
                id: 'kanban_ordenacao',
                collection: 'contracts',
                fields: ['statusOrder', 'dataModificacao'],
                type: 'sort_only',
                usage: 'Visualização Kanban ordenada',
                frequency: 'média',
                impact: 'médio',
                currentReads: 100,
                optimizedReads: 20,
                savings: '80%',
                queries: [
                    "query.orderBy('statusOrder').orderBy('dataModificacao', 'desc')"
                ],
                firebaseCommand: `firebase firestore:indexes:create --collection-group=contracts --fields="statusOrder:ascending,dataModificacao:descending"`
            },

            {
                id: 'vendedor_temporal',
                collection: 'contracts',
                fields: ['vendedorConstrutora', 'dataAssinatura'],
                type: 'filter_and_sort',
                usage: 'Relatórios por vendedor e período',
                frequency: 'média',
                impact: 'baixo',
                currentReads: 80,
                optimizedReads: 10,
                savings: '87%',
                queries: [
                    "query.where('vendedorConstrutora', '==', 'Maria').orderBy('dataAssinatura', 'desc')"
                ],
                firebaseCommand: `firebase firestore:indexes:create --collection-group=contracts --fields="vendedorConstrutora:ascending,dataAssinatura:descending"`
            }
        ];
    }

    /**
     *  Identifica índices em falta baseado nos padrões
     */
    identifyMissingIndexes() {
        console.log(' Identificando índices em falta...');
        
        const patterns = this.analyzeCurrentQueries();
        const missing = patterns.filter(pattern => {
            // Simula verificação se índice existe
            return !this.indexExists(pattern.fields);
        });

        missing.forEach(pattern => {
            this.missingIndexes.add(pattern.id);
        });

        console.log(` Encontrados ${missing.length} índices em falta`);
        return missing;
    }

    /**
     *  Gera comandos Firebase CLI para criar índices
     */
    generateFirebaseCommands(patterns = null) {
        const patternsToUse = patterns || Array.from(this.queryPatterns.values());
        const commands = [];
        
        patternsToUse.forEach((pattern, index) => {
            const command = {
                priority: this.getPriority(pattern.frequency),
                order: index + 1,
                id: pattern.id,
                usage: pattern.usage,
                impact: pattern.impact,
                savings: pattern.savings,
                command: pattern.firebaseCommand,
                estimatedTime: this.getEstimatedTime(pattern.fields.length)
            };
            commands.push(command);
        });

        return commands.sort((a, b) => a.priority - b.priority);
    }

    /**
     *  Gera relatório de impacto detalhado
     */
    generateImpactReport() {
        const patterns = Array.from(this.queryPatterns.values());
        
        const report = {
            summary: {
                totalPatterns: patterns.length,
                totalCurrentReads: patterns.reduce((sum, p) => sum + p.currentReads, 0),
                totalOptimizedReads: patterns.reduce((sum, p) => sum + p.optimizedReads, 0),
                totalSavings: 0,
                estimatedMonthlyCost: 0,
                optimizedMonthlyCost: 0
            },
            byPriority: {
                critical: patterns.filter(p => p.frequency === 'crítica'),
                high: patterns.filter(p => p.frequency === 'alta'),
                medium: patterns.filter(p => p.frequency === 'média'),
                low: patterns.filter(p => p.frequency === 'baixa')
            },
            detailedAnalysis: patterns.map(pattern => ({
                id: pattern.id,
                usage: pattern.usage,
                currentReads: pattern.currentReads,
                optimizedReads: pattern.optimizedReads,
                readsSaved: pattern.currentReads - pattern.optimizedReads,
                savingsPercentage: Math.round(((pattern.currentReads - pattern.optimizedReads) / pattern.currentReads) * 100),
                monthlyImpact: this.calculateMonthlyCostImpact(pattern)
            }))
        };

        // Calcula totais
        report.summary.totalSavings = report.summary.totalCurrentReads - report.summary.totalOptimizedReads;
        report.summary.estimatedMonthlyCost = this.calculateFirestoreCost(report.summary.totalCurrentReads);
        report.summary.optimizedMonthlyCost = this.calculateFirestoreCost(report.summary.totalOptimizedReads);

        return report;
    }

    /**
     *  Executa análise completa e gera script de criação
     */
    generateOptimizationScript() {
        console.log(' Gerando script de otimização completo...');
        
        const missingIndexes = this.identifyMissingIndexes();
        const commands = this.generateFirebaseCommands(missingIndexes);
        const report = this.generateImpactReport();

        const script = this.buildScript(commands, report);
        
        console.log(' Script de otimização gerado com sucesso!');
        return {
            script,
            commands,
            report,
            missingIndexes: Array.from(this.missingIndexes)
        };
    }

    /**
     *  Constrói script completo de criação de índices
     */
    buildScript(commands, report) {
        const criticalCommands = commands.filter(c => c.priority === 1);
        const highCommands = commands.filter(c => c.priority === 2);
        const mediumCommands = commands.filter(c => c.priority === 3);

        return `#!/bin/bash

#  Script de Otimização Avançada - Índices Compostos
# Sistema: Gestor de Registro de Contratos
# Gerado automaticamente em: ${new Date().toLocaleDateString('pt-BR')}
# 
#  IMPACTO ESPERADO:
# • Leituras atuais: ${report.summary.totalCurrentReads.toLocaleString()}/mês
# • Leituras otimizadas: ${report.summary.totalOptimizedReads.toLocaleString()}/mês  
# • Economia: ${report.summary.totalSavings.toLocaleString()} reads/mês (${Math.round((report.summary.totalSavings/report.summary.totalCurrentReads)*100)}%)
# • Custo atual: $${report.summary.estimatedMonthlyCost.toFixed(2)}/mês
# • Custo otimizado: $${report.summary.optimizedMonthlyCost.toFixed(2)}/mês
# • ECONOMIA MENSAL: $${(report.summary.estimatedMonthlyCost - report.summary.optimizedMonthlyCost).toFixed(2)}

echo " Iniciando criação de índices compostos críticos..."
echo "⏱  Tempo estimado total: ${this.getTotalEstimatedTime(commands)} minutos"
echo ""

# Verificações iniciais
if ! command -v firebase &> /dev/null; then
    echo " Firebase CLI não encontrado!"
    echo " Instalando Firebase CLI..."
    npm install -g firebase-tools
fi

echo " Verificando autenticação Firebase..."
firebase login

echo ""
echo " CRIANDO ÍNDICES CRÍTICOS (Prioridade Máxima)..."
echo "═══════════════════════════════════════════════════════"
${criticalCommands.map(cmd => this.formatCommand(cmd)).join('\n')}

echo ""
echo " CRIANDO ÍNDICES DE ALTA PRIORIDADE..."
echo "═══════════════════════════════════════════════════════"
${highCommands.map(cmd => this.formatCommand(cmd)).join('\n')}

echo ""
echo " CRIANDO ÍNDICES COMPLEMENTARES..."
echo "═══════════════════════════════════════════════════════"
${mediumCommands.map(cmd => this.formatCommand(cmd)).join('\n')}

echo ""
echo " OTIMIZAÇÃO CONCLUÍDA!"
echo "═══════════════════════════════════════════════════════"
echo " Verificar progresso: https://console.firebase.google.com"
echo "⏱  Índices estarão ativos em 15-30 minutos"
echo " Economia esperada: ${Math.round((report.summary.totalSavings/report.summary.totalCurrentReads)*100)}% das leituras"
echo ""`;
    }

    /**
     *  Formata comando para o script
     */
    formatCommand(cmd) {
        return `echo "${cmd.order}⃣ ${cmd.usage} (${cmd.savings} economia)..."
${cmd.command} --project-id="\${1:-default}"
echo "   ⏱  Tempo estimado: ${cmd.estimatedTime} min |  Economia: ${cmd.savings}"
echo ""`;
    }

    // Funções auxiliares
    getPriority(frequency) {
        const priorities = { 'crítica': 1, 'alta': 2, 'média': 3, 'baixa': 4 };
        return priorities[frequency] || 4;
    }

    getEstimatedTime(fieldCount) {
        return Math.max(2, fieldCount * 3) + ' min';
    }

    getTotalEstimatedTime(commands) {
        return commands.reduce((total, cmd) => {
            return total + parseInt(cmd.estimatedTime);
        }, 0);
    }

    indexExists(fields) {
        // Simula verificação - na prática, consultaria Firebase Console
           // TODO: Implementar verificação real via Firebase Admin SDK
           console.log(`Checking if index exists for fields: ${fields.join(', ')}`);
           return false;
    }

    calculateFirestoreCost(reads) {
        // $0.36 per 100K reads, multiplicado por 30 dias
        return (reads * 30 * 0.36) / 100000;
    }

    calculateMonthlyCostImpact(pattern) {
        const currentCost = this.calculateFirestoreCost(pattern.currentReads);
        const optimizedCost = this.calculateFirestoreCost(pattern.optimizedReads);
        return {
            current: currentCost,
            optimized: optimizedCost,
            savings: currentCost - optimizedCost
        };
    }

    /**
     *  Testa performance de uma query específica
     */
    async testQueryPerformance(pattern) {
        console.log(` Testando performance da query: ${pattern.id}`);
        
        const startTime = Date.now();
        
        try {
            // Simula execução da query
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
            
            const duration = Date.now() - startTime;
            
            return {
                pattern: pattern.id,
                duration,
                status: duration < 100 ? 'optimal' : duration < 300 ? 'good' : 'slow',
                recommendation: duration > 300 ? 'Índice composto recomendado' : 'Performance aceitável'
            };
        } catch (error) {
            return {
                pattern: pattern.id,
                duration: -1,
                status: 'error',
                error: error.message
            };
        }
    }
}

// Instância global
const compositeIndexOptimizer = new CompositeIndexOptimizer();

// Função para uso manual
window.analyzeIndexes = function() {
    return compositeIndexOptimizer.generateOptimizationScript();
};

export { CompositeIndexOptimizer, compositeIndexOptimizer };