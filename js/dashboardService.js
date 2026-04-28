// =============================================================================
// DASHBOARD SERVICE - Serviço para Dashboard Avançado
// =============================================================================

// uso de debug global (definido em debug.js)

class DashboardService {
    constructor() {
        this.firestoreService = null;
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
        this.cache = new Map();
        this.isInitialized = false;
        this.useCloudFunctions = true; // Flag para usar CFs otimizadas
    }

    dateFromAny(value) {
        try {
            if (!value) return null;
            if (value?.toDate && typeof value.toDate === 'function') {
                const date = value.toDate();
                return Number.isNaN(date?.getTime()) ? null : date;
            }
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? null : date;
        } catch {
            return null;
        }
    }

    getMonthKeyFromDate(value) {
        const date = this.dateFromAny(value);
        if (!date) return '';
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    resolveSignDate(contract = {}) {
        return (
            this.dateFromAny(contract?.dataAssinaturaCliente) ||
            this.dateFromAny(contract?.dataAssinatura) ||
            this.dateFromAny(contract?.createdAt) ||
            null
        );
    }

    /**
     * Inicializa o serviço
     */
    async initialize() {
        try {
            let attempts = 0;
            while (attempts < 30 && !window.firestoreService) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            if (window.firestoreService) {
                this.firestoreService = window.firestoreService;
                this.isInitialized = true;
                if (typeof window !== 'undefined' && typeof window.debug === 'function') {
                    window.debug(' DashboardService inicializado com sucesso');
                }
            } else {
                this.firestoreService = null;
                this.isInitialized = true;
                if (typeof window !== 'undefined' && typeof window.debug === 'function') {
                    window.debug(' FirestoreService não disponível - usando dados simulados');
                }
            }
        } catch (error) {
            this.firestoreService = null;
            this.isInitialized = true;
            console.error(' Erro ao inicializar DashboardService:', error);
        }
    }

    /**
     * Obtém dados em cache ou busca novos
     * Agora usa o cacheService global para melhor coordenação
     */
    async getCachedData(key, fetchFunction, forceRefresh = false) {
        // Usa o cacheService global se disponível, senão fallback para cache local
        if (window.cacheService) {
            return await window.cacheService.get(
                `dashboard_${key}`,
                fetchFunction,
                'dashboard',
                forceRefresh
            );
        }
        
        // Fallback para cache local
        const cacheEntry = this.cache.get(key);
        const now = Date.now();

        if (!forceRefresh && cacheEntry && (now - cacheEntry.timestamp) < this.cacheTimeout) {
            return cacheEntry.data;
        }

        try {
            const data = await fetchFunction();
            this.cache.set(key, { data, timestamp: now });
            return data;
        } catch (error) {
            console.error(`Erro ao buscar dados para ${key}:`, error);
            // Retornar cache antigo se disponível
            return cacheEntry ? cacheEntry.data : null;
        }
    }

    /**
     * Obtém KPIs principais do dashboard usando Cloud Function (OTIMIZADO)
     * Reduz de ~4000 leituras para apenas 1 chamada de função
     */
    async getMainKPIs(filters = {}) {
        // Exibe loading state se chamado pela UI
        if (window.KPIManager && typeof window.KPIManager.setLoading === 'function') {
            window.KPIManager.setLoading(true);
        }
        
        try {
            return await this.getCachedData('mainKPIs', async () => {
                // OTIMIZAÇÃO: Tentar usar Cloud Function primeiro
                if (this.useCloudFunctions && typeof firebase !== 'undefined' && firebase.functions) {
                    try {
                        const getDashboardKPIs = firebase.app().functions('us-central1').httpsCallable('getDashboardKPIs');
                        const response = await getDashboardKPIs({});
                        
                        if (response.data) {
                            console.log(' KPIs obtidos via Cloud Function (otimizado)');
                            const data = response.data;
                            
                            return {
                                contractsThisMonth: data.contractsThisMonth || 0,
                                totalContracts: data.totalContracts || 0,
                                activeContracts: data.activeContracts || 0,
                                avgProcessingTime: 0, // Calculado sob demanda se necessário
                                totalValue: 0, // Calculado sob demanda se necessário
                                approvalRate: data.totalContracts > 0 
                                    ? ((data.finalizadosCount / data.totalContracts) * 100).toFixed(1) 
                                    : 0,
                                pendingContracts: data.pendingContracts || 0,
                                lastUpdate: data.lastUpdate || new Date().toISOString()
                            };
                        }
                    } catch (cfError) {
                        console.warn(' Cloud Function getDashboardKPIs falhou, usando fallback:', cfError.message);
                    }
                }
                
                // FALLBACK: Método original (mais leituras)
                return await this.getMainKPIsLegacy(filters);
            });
        } finally {
            if (window.KPIManager && typeof window.KPIManager.setLoading === 'function') {
                window.KPIManager.setLoading(false);
            }
        }
    }

    /**
     * Método legado para KPIs (fallback se Cloud Function não disponível)
     * @private
     */
    async getMainKPIsLegacy(filters = {}) {
        // OTIMIZAÇÃO: Tenta usar count() do Firestore para contagens básicas
        // Isso economiza milhares de leituras quando não há filtros complexos
        if (Object.keys(filters).length === 0) {
            try {
                const contractsRef = firebase.firestore().collection('contracts');
                
                // Verifica se count() está disponível
                if (typeof contractsRef.count === 'function') {
                    console.log(' [Dashboard] Usando agregação otimizada...');
                    
                    // Contagem total
                    const totalSnap = await contractsRef.count().get();
                    const totalContracts = totalSnap.data().count;
                    
                    // Contratos do mês atual
                    const startOfMonth = new Date();
                    startOfMonth.setDate(1);
                    startOfMonth.setHours(0, 0, 0, 0);
                    
                    const monthQuery = contractsRef.where('createdAt', '>=', startOfMonth);
                    const monthSnap = await monthQuery.count().get();
                    const contractsThisMonth = monthSnap.data().count;
                    
                    // Status pendentes (busca aproximada)
                    let pendingContracts = 0;
                    try {
                        const pendingStatuses = ['Pendente', 'Em Análise', 'Aguardando'];
                        for (const status of pendingStatuses) {
                            const pendingSnap = await contractsRef.where('status', '==', status).count().get();
                            pendingContracts += pendingSnap.data().count;
                        }
                    } catch {
                        // Ignora erros de contagem de pendentes
                    }
                    
                    console.log(` [Dashboard] Agregação: total=${totalContracts}, mês=${contractsThisMonth}`);
                    
                    return {
                        contractsThisMonth: contractsThisMonth,
                        totalContracts: totalContracts,
                        avgProcessingTime: 0, // Requer dados completos
                        totalValue: 0, // Requer dados completos  
                        approvalRate: 0, // Requer dados completos
                        pendingContracts: pendingContracts,
                        lastUpdate: new Date().toISOString(),
                        _source: 'aggregation'
                    };
                }
            } catch (e) {
                console.warn(' Falha na agregação otimizada, usando fallback:', e.message);
            }
        }
        
        // Fallback: carrega todos os contratos (mais caro em leituras)
        let contracts = [];
        try {
            contracts = await this.getAllContracts();
        } catch {
            contracts = [];
        }
        if (!contracts || contracts.length === 0) {
            return this.getSimulatedKPIs();
        }
        // Aplicar filtros
        contracts = this.applyFilters(contracts, filters);
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const dateFromAny = (v) => {
            try {
                if (!v) return null;
                if (v.toDate && typeof v.toDate === 'function') {
                    const d = v.toDate();
                    return isNaN(d?.getTime()) ? null : d;
                }
                const d = new Date(v);
                return isNaN(d.getTime()) ? null : d;
            } catch { return null; }
        };

        const numFromAny = (v) => {
            if (typeof v === 'number') return v;
            if (typeof v === 'string') {
                const s = v.replace(/\./g, '').replace(',', '.').trim();
                const n = parseFloat(s);
                return isNaN(n) ? 0 : n;
            }
            return 0;
        };

        // Datas consideradas para "assinado": preferir dataAssinaturaCliente, senão dataAssinatura, senão createdAt
        const getSignDate = (c) => dateFromAny(c.dataAssinaturaCliente || c.dataAssinatura || c.createdAt);
        // Datas consideradas para "registro/conclusão": preferir dataRetiradaContratoRegistrado, senão dataAnaliseRegistro
        const getRegisterDate = (c) => dateFromAny(c.dataRetiradaContratoRegistrado || c.dataAnaliseRegistro);

        // Contratos assinados no mês atual
        const contractsThisMonth = contracts.filter(contract => {
            const date = getSignDate(contract);
            return !!date && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });

        // Tempo médio de processamento (flexível)
        const contractsWithProcessingTime = contracts
            .map(c => ({ a: dateFromAny(c.dataConformidadeCehop) || getRegisterDate(c), b: dateFromAny(c.dataEntradaRegistro) || getSignDate(c) }))
            .filter(({ a, b }) => a && b && a >= b);

        const avgProcessingTime = contractsWithProcessingTime.length > 0
            ? contractsWithProcessingTime.reduce((sum, { a, b }) => sum + ((a - b) / (1000 * 60 * 60 * 24)), 0) / contractsWithProcessingTime.length
            : 0;

        // Valor total dos contratos
        const totalValue = contracts.reduce((sum, contract) => sum + numFromAny(contract.valorContrato || 0), 0);

        // Taxa de aprovação (considera estados concluídos/registrados)
        const APPROVED_SET = new Set(['Aprovado', 'Liberado', 'Registrado', 'Concluído', 'Contrato Registrado', 'Finalizado']);
        const approvedContracts = contracts.filter(c => c.status && APPROVED_SET.has(String(c.status)));
        const approvalRate = contracts.length > 0 ? (approvedContracts.length / contracts.length) * 100 : 0;

        // Pendentes (heurística ampla)
        const pendingContractsCount = contracts.filter(c => {
            const s = String(c.status || '').toLowerCase();
            return s.includes('pend') || s.includes('anal') || s.includes('aguard');
        }).length;

        return {
            contractsThisMonth: contractsThisMonth.length,
            totalContracts: contracts.length,
            avgProcessingTime: Math.round(avgProcessingTime * 10) / 10,
            totalValue: totalValue,
            approvalRate: Math.round(approvalRate * 10) / 10,
            pendingContracts: pendingContractsCount,
            lastUpdate: new Date().toISOString()
        };
    }

    buildSignedContractsMetrics(sourceContracts = []) {
        const counts = {};
        (Array.isArray(sourceContracts) ? sourceContracts : []).forEach((contract) => {
            const key = this.getMonthKeyFromDate(this.resolveSignDate(contract));
            if (!key) return;
            counts[key] = (counts[key] || 0) + 1;
        });

        const months = Object.keys(counts)
            .sort()
            .reverse()
            .map((key) => ({ key, count: counts[key] }));

        const currentMonthKey = this.getMonthKeyFromDate(new Date());
        return {
            counts,
            months,
            currentMonthKey,
            selectedMonthKey: counts[currentMonthKey] ? currentMonthKey : (months[0]?.key || ''),
            lastUpdate: new Date().toISOString()
        };
    }

    async getSignedContractsMetricsLegacy() {
        try {
            const db = firebase.firestore();
            const [contractsSnapshot, archivedSnapshot] = await Promise.all([
                db.collection('contracts')
                    .select('dataAssinaturaCliente', 'dataAssinatura', 'createdAt')
                    .get(),
                db.collection('archivedContracts')
                    .select('dataAssinaturaCliente', 'dataAssinatura', 'createdAt')
                    .get()
            ]);

            const allContracts = [
                ...contractsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
                ...archivedSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
            ];

            return this.buildSignedContractsMetrics(allContracts);
        } catch (error) {
            console.warn(' Falha ao calcular métricas mensais de assinados via Firestore:', error?.message || error);
            return {
                counts: {},
                months: [],
                currentMonthKey: this.getMonthKeyFromDate(new Date()),
                selectedMonthKey: '',
                lastUpdate: new Date().toISOString()
            };
        }
    }

    async getSignedContractsMetrics(forceRefresh = false) {
        return await this.getCachedData('signedContractsMetrics', async () => {
            if (this.useCloudFunctions && typeof firebase !== 'undefined' && firebase.functions) {
                try {
                    const callable = firebase.app().functions('us-central1').httpsCallable('getDashboardSignedContractsMetrics');
                    const response = await callable({});
                    if (response?.data) {
                        return response.data;
                    }
                } catch (error) {
                    console.warn(' Cloud Function getDashboardSignedContractsMetrics falhou, usando fallback:', error?.message || error);
                }
            }

            return await this.getSignedContractsMetricsLegacy();
        }, forceRefresh);
    }

    async getSignedMonthOptions(forceRefresh = false) {
        const metrics = await this.getSignedContractsMetrics(forceRefresh);
        return Array.isArray(metrics?.months) ? metrics.months : [];
    }

    async getSignedContractsCountForMonth(monthKey, forceRefresh = false) {
        const metrics = await this.getSignedContractsMetrics(forceRefresh);
        const selectedKey = String(monthKey || metrics?.selectedMonthKey || metrics?.currentMonthKey || '').trim();
        return {
            selectedMonthKey: selectedKey,
            count: Number(metrics?.counts?.[selectedKey]) || 0,
            months: Array.isArray(metrics?.months) ? metrics.months : [],
            currentMonthKey: metrics?.currentMonthKey || this.getMonthKeyFromDate(new Date()),
            lastUpdate: metrics?.lastUpdate || new Date().toISOString()
        };
    }

    /**
     * Obtém dados para gráficos
     */
    async getChartData(type, filters = {}) {
        return await this.getCachedData(`chartData_${type}`, async () => {
            // OTIMIZAÇÃO: Para gráfico de status, usar Cloud Function
            if (type === 'status' && this.useCloudFunctions && typeof firebase !== 'undefined' && firebase.functions) {
                try {
                    const getStatusCounts = firebase.app().functions('us-central1').httpsCallable('getStatusCounts');
                    const response = await getStatusCounts({});
                    
                    if (response.data?.counts) {
                        console.log(' Status counts obtidos via Cloud Function (otimizado)');
                        const counts = response.data.counts;
                        
                        // Ordenar por quantidade (maior primeiro) e pegar top 15
                        const sortedEntries = Object.entries(counts)
                            .filter(([, count]) => count > 0)
                            .sort(([,a], [,b]) => b - a)
                            .slice(0, 15);
                        
                        return {
                            labels: sortedEntries.map(([status]) => status),
                            datasets: [{
                                label: 'Contratos por Status',
                                data: sortedEntries.map(([, count]) => count),
                                backgroundColor: this.generateColors(sortedEntries.length),
                                borderWidth: 2,
                                borderColor: '#fff'
                            }]
                        };
                    }
                } catch (cfError) {
                    console.warn(' Cloud Function getStatusCounts falhou, usando fallback:', cfError.message);
                }
            }
            
            // FALLBACK: Método original
            let contracts = await this.getAllContracts();
            
            if (!contracts || contracts.length === 0) {
                return this.getSimulatedChartData(type);
            }

            contracts = this.applyFilters(contracts, filters);

            switch (type) {
                case 'status':
                    return this.getStatusChartData(contracts);
                case 'monthly':
                    return this.getMonthlyChartData(contracts);
                case 'sellers':
                    return this.getSellersChartData(contracts);
                case 'value':
                    return this.getValueChartData(contracts);
                case 'processing':
                    return this.getProcessingTimeData(contracts);
                default:
                    return null;
            }
        });
    }

    /**
     * Gera cores para gráficos
     */
    generateColors(count) {
        const baseColors = [
            '#28a745', '#ffc107', '#dc3545', '#17a2b8', '#6c757d',
            '#fd7e14', '#d63384', '#0039BA', '#20c997', '#007bff',
            '#343a40', '#28a745', '#ffc107', '#dc3545', '#17a2b8'
        ];
        return baseColors.slice(0, count);
    }

    /**
     * Dados do gráfico de status
     */
    getStatusChartData(contracts) {
        const statusCount = {};
        contracts.forEach(contract => {
            const status = contract.status || 'Indefinido';
            statusCount[status] = (statusCount[status] || 0) + 1;
        });

        return {
            labels: Object.keys(statusCount),
            datasets: [{
                label: 'Contratos por Status',
                data: Object.values(statusCount),
                backgroundColor: [
                    '#28a745', // Verde - Aprovado
                    '#ffc107', // Amarelo - Pendente
                    '#dc3545', // Vermelho - Rejeitado
                    '#17a2b8', // Azul - Em Análise
                    '#6c757d', // Cinza - Outros
                    '#fd7e14', // Laranja
                    '#d63384'  // Rosa
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        };
    }

    /**
     * Dados do gráfico mensal
     */
    getMonthlyChartData(contracts) {
        const monthlyData = {};
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                       'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

        // Inicializar meses
        months.forEach(month => monthlyData[month] = 0);

        contracts.forEach(contract => {
            const date = new Date(contract.dataAssinatura || contract.createdAt);
            const monthName = months[date.getMonth()];
            if (monthName) {
                monthlyData[monthName]++;
            }
        });

        return {
            labels: months,
            datasets: [{
                label: 'Contratos por Mês',
                data: months.map(month => monthlyData[month]),
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        };
    }

    /**
     * Dados do gráfico de vendedores
     */
    getSellersChartData(contracts) {
        const sellerData = {};
        contracts.forEach(contract => {
            const seller = contract.vendedor || 'Não Informado';
            sellerData[seller] = (sellerData[seller] || 0) + 1;
        });

        // Ordenar por quantidade e pegar top 10
        const sortedSellers = Object.entries(sellerData)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        return {
            labels: sortedSellers.map(([name]) => name),
            datasets: [{
                label: 'Contratos por Vendedor',
                data: sortedSellers.map(([,count]) => count),
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1
            }]
        };
    }

    /**
     * Dados do gráfico de valores
     */
    getValueChartData(contracts) {
        const ranges = {
            'Até R$ 100k': 0,
            'R$ 100k - 300k': 0,
            'R$ 300k - 500k': 0,
            'R$ 500k - 1M': 0,
            'Acima de R$ 1M': 0
        };

        contracts.forEach(contract => {
            const value = parseFloat(contract.valorContrato || 0);
            if (value <= 100000) ranges['Até R$ 100k']++;
            else if (value <= 300000) ranges['R$ 100k - 300k']++;
            else if (value <= 500000) ranges['R$ 300k - 500k']++;
            else if (value <= 1000000) ranges['R$ 500k - 1M']++;
            else ranges['Acima de R$ 1M']++;
        });

        return {
            labels: Object.keys(ranges),
            datasets: [{
                label: 'Contratos por Valor',
                data: Object.values(ranges),
                backgroundColor: [
                    '#e3f2fd', '#bbdefb', '#90caf9', '#42a5f5', '#1976d2'
                ],
                borderColor: '#1976d2',
                borderWidth: 1
            }]
        };
    }

    /**
     * Dados de tempo de processamento
     */
    getProcessingTimeData(contracts) {
        const timeRanges = {
            '0-7 dias': 0,
            '8-15 dias': 0,
            '16-30 dias': 0,
            '31-60 dias': 0,
            'Mais de 60 dias': 0
        };

        contracts.forEach(contract => {
            if (contract.dataAssinatura && contract.dataRegistro) {
                const signDate = new Date(contract.dataAssinatura);
                const regDate = new Date(contract.dataRegistro);
                const diffDays = Math.abs(regDate - signDate) / (1000 * 60 * 60 * 24);

                if (diffDays <= 7) timeRanges['0-7 dias']++;
                else if (diffDays <= 15) timeRanges['8-15 dias']++;
                else if (diffDays <= 30) timeRanges['16-30 dias']++;
                else if (diffDays <= 60) timeRanges['31-60 dias']++;
                else timeRanges['Mais de 60 dias']++;
            }
        });

        return {
            labels: Object.keys(timeRanges),
            datasets: [{
                label: 'Tempo de Processamento',
                data: Object.values(timeRanges),
                backgroundColor: [
                    '#4caf50', '#8bc34a', '#ffeb3b', '#ff9800', '#f44336'
                ],
                borderColor: '#fff',
                borderWidth: 2
            }]
        };
    }

    /**
     * Aplica filtros aos contratos
     */
    applyFilters(contracts, filters) {
        let filtered = [...contracts];

        if (filters.vendedor && filters.vendedor !== '') {
            filtered = filtered.filter(c => c.vendedor === filters.vendedor);
        }

        if (filters.status && filters.status !== '') {
            filtered = filtered.filter(c => c.status === filters.status);
        }

        if (filters.dataInicio) {
            const startDate = new Date(filters.dataInicio);
            filtered = filtered.filter(c => {
                const contractDate = new Date(c.dataAssinatura || c.createdAt);
                return contractDate >= startDate;
            });
        }

        if (filters.dataFim) {
            const endDate = new Date(filters.dataFim);
            filtered = filtered.filter(c => {
                const contractDate = new Date(c.dataAssinatura || c.createdAt);
                return contractDate <= endDate;
            });
        }

        return filtered;
    }

    /**
     * Obtém todos os contratos
     *  OTIMIZAÇÃO: Usa cache global do appState para evitar leituras duplicadas
     */
    async getAllContracts() {
        //  PRIORIDADE 1: Usar cache global do main.js se disponível
        if (window.appState?.allContracts?.length > 0) {
            let contracts = [...window.appState.allContracts];
            
            // Aplica filtro de workflow se necessário
            try {
                const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
                const activeWorkflowFilter = prefs.defaultWorkflow;
                
                if (activeWorkflowFilter) {
                    contracts = contracts.filter(c => 
                        (c.workflowId === activeWorkflowFilter) || 
                        (c.workflowType === activeWorkflowFilter) ||
                        (!c.workflowId && !c.workflowType && activeWorkflowFilter === 'individual')
                    );
                }
            } catch { /* ignore */ }
            
            if (window.__DEBUG__) {
                console.log(` [DashboardService] Usando ${contracts.length} contratos do cache global`);
            }
            return contracts;
        }
        
        // PRIORIDADE 2: Buscar do Firestore (fallback)
        if (this.firestoreService) {
            try {
                console.warn(' [DashboardService] Cache global vazio, buscando do Firestore...');
                let contracts = await this.firestoreService.getAllContracts();
                
                //  Filtra por preferência de workflow do usuário
                try {
                    const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
                    const activeWorkflowFilter = prefs.defaultWorkflow;
                    
                    if (activeWorkflowFilter) {
                        contracts = contracts.filter(c => 
                            (c.workflowId === activeWorkflowFilter) || 
                            (c.workflowType === activeWorkflowFilter) ||
                            (!c.workflowId && !c.workflowType && activeWorkflowFilter === 'individual')
                        );
                    }
                } catch (e) { console.warn('Erro ao filtrar dashboard por workflow:', e); }

                return contracts;
            } catch (error) {
                console.error('Erro ao buscar contratos:', error);
                return this.getSimulatedContracts();
            }
        }
        return this.getSimulatedContracts();
    }

    /**
     * KPIs simulados para demonstração
     */
    getSimulatedKPIs() {
        return {
            contractsThisMonth: 25,
            totalContracts: 150,
            avgProcessingTime: 12.5,
            totalValue: 15750000,
            approvalRate: 85.3,
            pendingContracts: 8,
            lastUpdate: new Date().toISOString()
        };
    }

    /**
     * Dados simulados para gráficos
     */
    getSimulatedChartData(type) {
        switch (type) {
            case 'status':
                return {
                    labels: ['Aprovado', 'Pendente', 'Em Análise', 'Rejeitado'],
                    datasets: [{
                        label: 'Contratos por Status',
                        data: [65, 15, 12, 8],
                        backgroundColor: ['#28a745', '#ffc107', '#17a2b8', '#dc3545']
                    }]
                };
            case 'monthly':
                return {
                    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                    datasets: [{
                        label: 'Contratos por Mês',
                        data: [12, 19, 8, 15, 25, 18],
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        borderColor: 'rgba(54, 162, 235, 1)'
                    }]
                };
            default:
                return null;
        }
    }

    /**
     * Contratos simulados
     */
    getSimulatedContracts() {
        return []; // Retorna array vazio para forçar uso de dados simulados
    }

    /**
     * Obtém lista de vendedores únicos
     */
    async getUniqueSellers() {
        const contracts = await this.getAllContracts();
        const sellers = new Set();
        
        contracts.forEach(contract => {
            if (contract.vendedor && contract.vendedor.trim()) {
                sellers.add(contract.vendedor.trim());
            }
        });

        return Array.from(sellers).sort();
    }

    /**
     * Obtém lista de status únicos
     */
    async getUniqueStatuses() {
        const contracts = await this.getAllContracts();
        const statuses = new Set();
        
        contracts.forEach(contract => {
            if (contract.status && contract.status.trim()) {
                statuses.add(contract.status.trim());
            }
        });

        return Array.from(statuses).sort();
    }

    /**
     * Limpa cache
     */
    clearCache() {
        this.cache.clear();
        console.log('Cache do dashboard limpo');
    }

    /**
     * Exporta dados para CSV
     */
    async exportToCSV(data, filename) {
        try {
            const headers = Object.keys(data[0] || {});
            const csvContent = [
                headers.join(','),
                ...data.map(row => headers.map(header => 
                    JSON.stringify(row[header] || '')
                ).join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', `${filename}.csv`);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            if (window.activityLogService?.logActivity) {
                window.activityLogService.logActivity(
                    'EXPORT_REPORT',
                    `Relatório do dashboard exportado (${data.length} registros)`,
                    null,
                    {
                        source: 'dashboard',
                        format: 'CSV',
                        fileName: `${filename}.csv`,
                        rowCount: data.length
                    }
                );
            }
            
            return true;
        } catch (error) {
            console.error('Erro ao exportar CSV:', error);
            return false;
        }
    }
}

// Instância global
window.dashboardService = new DashboardService();
// Expor classe globalmente para integração condicional em main.js
window.DashboardService = DashboardService;

if (typeof window !== 'undefined' && typeof window.debug === 'function') {
    window.debug(' DashboardService carregado');
}
