/**
 * Serviço de Relatórios Customizáveis
 * Responsável por gerar relatórios personalizados com templates e exportação
 */

// usa debug global
import { auth } from './auth.js';
import { activityLogService } from './activityLogService.js';

const DATE_ONLY_FIELD_KEYS = new Set([
    'dataAssinatura',
    'dataAssinaturaCliente',
    'dataEntradaRegistro',
    'dataRetiradaContratoRegistrado',
    'dataEntrega',
    'dataMinuta',
    'dataAnaliseRegistro',
    'dataPrevistaRegistro',
    'dataRetornoRi',
    'solicitaITBI',
    'retiradaITBI',
    'enviadoPgtoItbi',
    'retornoPgtoItbi',
    'dataSolicitacaoFunrejus',
    'dataEmissaoFunrejus',
    'funrejusEnviadoPgto',
    'funrejusRetornoPgto',
    'dataConformidadeCehop',
    'certificacaoSolicEm',
    'vencSicaq',
    'espelhoEnviado',
    'ccsAprovada',
    'minutaRecebida',
    'devolucaoParaCorrecao',
    'devolvidoCorrigido',
    'dataDeEnvioDaPastaAgencia',
    'enviadoVendedor',
    'retornoVendedor',
    'enviadoAgencia',
    'retornoAgencia',
    'solicitacaoCohapar',
    'cohaparAprovada',
    'dataEmissaoNF',
    'dataEnvioLiberacaoGarantia'
]);

const DATE_TIME_FIELD_KEYS = new Set([
    'createdAt',
    'updatedAt',
    'archivedAt',
    'statusChangedAt',
    'entregueCehop',
    'conformeEm',
    'certificacaoRealizadaEm',
    'conferenciaCehopNatoEntregueEm',
    'conferenciaCehopNatoDevolvidaEm',
    'formulariosEnviadosEm',
    'formulariosAssinadosEm',
    'enviadoACehop',
    'reenviadoCehop',
    'entrevistaCef',
    'contratoCef'
]);

function parseDateValue(value) {
    if (value === undefined || value === null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === 'function') {
        const parsed = value.toDate();
        return Number.isNaN(parsed?.getTime?.()) ? null : parsed;
    }
    if (typeof value === 'object' && Number.isFinite(value.seconds)) {
        const parsed = new Date(value.seconds * 1000);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value === 'object' && Number.isFinite(value._seconds)) {
        const parsed = new Date(value._seconds * 1000);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateBr(date, includeTime = false) {
    const dateOptions = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    };

    const datePart = date.toLocaleDateString('pt-BR', dateOptions);
    if (!includeTime) return datePart;

    const timePart = date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    return `${datePart} ${timePart}`;
}

function isDateLikeField(fieldName = '') {
    return DATE_ONLY_FIELD_KEYS.has(fieldName)
        || DATE_TIME_FIELD_KEYS.has(fieldName)
        || /^data[A-Z]/.test(fieldName)
        || /(?:At|Em)$/.test(fieldName)
        || /timestamp/i.test(fieldName);
}

class ReportsService {
    constructor() {
        this.isInitialized = false;
        this.templates = new Map();
        this.reportHistory = [];
        this.cachedContracts = null;
        this.init();
    }

    async init() {
        if (this.isInitialized) return;
        
        try {
            // Carregar templates padrão
            this.loadDefaultTemplates();
            
            // Carregar histórico de relatórios
            this.loadReportHistory();
            
            this.isInitialized = true;
            window.debug && window.debug(' Serviço de Relatórios inicializado');
            
        } catch (error) {
            console.error(' Erro ao inicializar serviço de relatórios:', error);
        }
    }

    /**
     * Carrega templates padrão
     */
    loadDefaultTemplates() {
        // Template Básico
        this.templates.set('basico', {
            id: 'basico',
            nome: 'Relatório Básico',
            descricao: 'Relatório simples com informações básicas dos contratos',
            campos: [
                'vendedorConstrutora',
                'empreendimento', 
                'clientePrincipal',
                'status',
                'dataAssinatura',
                'valorContrato'
            ],
            filtros: {
                status: [],
                dataInicio: null,
                dataFim: null
            },
            ordenacao: {
                campo: 'dataAssinatura',
                direcao: 'desc'
            },
            formato: 'tabela',
            incluirGraficos: false,
            incluirResumo: true
        });

        // Template Completo
        this.templates.set('completo', {
            id: 'completo',
            nome: 'Relatório Completo',
            descricao: 'Relatório detalhado com todas as informações disponíveis',
            campos: [
                'vendedorConstrutora',
                'empreendimento',
                'clientePrincipal',
                'clienteConjuge',
                'valorContrato',
                'entrada',
                'financiamento',
                'saldoReceber',
                'status',
                'dataAssinatura',
                'dataEntrega',
                'observacoes'
            ],
            filtros: {
                status: [],
                dataInicio: null,
                dataFim: null,
                valorMinimo: null,
                valorMaximo: null
            },
            ordenacao: {
                campo: 'valorContrato',
                direcao: 'desc'
            },
            formato: 'tabela',
            incluirGraficos: true,
            incluirResumo: true,
            incluirEstatisticas: true
        });

        // Template Financeiro
        this.templates.set('financeiro', {
            id: 'financeiro',
            nome: 'Relatório Financeiro',
            descricao: 'Foco em informações financeiras e valores',
            campos: [
                'clientePrincipal',
                'empreendimento',
                'valorContrato',
                'entrada',
                'financiamento',
                'saldoReceber',
                'dataAssinatura',
                'status'
            ],
            filtros: {
                status: ['Ativo', 'Pago'],
                dataInicio: null,
                dataFim: null,
                valorMinimo: 50000,
                valorMaximo: null
            },
            ordenacao: {
                campo: 'valorContrato',
                direcao: 'desc'
            },
            formato: 'tabela',
            incluirGraficos: true,
            incluirResumo: true,
            incluirTotais: true
        });

        // Template de Status
        this.templates.set('status', {
            id: 'status',
            nome: 'Relatório por Status',
            descricao: 'Análise detalhada por status dos contratos',
            campos: [
                'status',
                'clientePrincipal',
                'empreendimento',
                'valorContrato',
                'dataAssinatura'
            ],
            filtros: {
                status: [],
                dataInicio: null,
                dataFim: null
            },
            ordenacao: {
                campo: 'status',
                direcao: 'asc'
            },
            formato: 'agrupado',
            agruparPor: 'status',
            incluirGraficos: true,
            incluirResumo: true
        });

    window.debug && window.debug(` ${this.templates.size} templates carregados`);
    }

    /**
     * Carrega histórico de relatórios
     */
    loadReportHistory() {
        try {
            const history = localStorage.getItem('reportHistory');
            if (history) {
                this.reportHistory = JSON.parse(history);
            }
        } catch (error) {
            console.error('Erro ao carregar histórico de relatórios:', error);
            this.reportHistory = [];
        }
    }

    /**
     * Salva histórico de relatórios
     */
    saveReportHistory() {
        try {
            localStorage.setItem('reportHistory', JSON.stringify(this.reportHistory));
        } catch (error) {
            console.error('Erro ao salvar histórico de relatórios:', error);
        }
    }

    /**
     * Gera relatório baseado em template
     */
    async generateReport(templateId, customFilters = {}) {
        try {
            window.debug && window.debug(` Gerando relatório com template: ${templateId}`);
            
            const template = this.templates.get(templateId);
            if (!template) {
                throw new Error(`Template ${templateId} não encontrado`);
            }

            // Aplicar filtros customizados ao template
            const finalFilters = { ...template.filtros, ...customFilters };
            
            // Obter dados dos contratos
            const contratos = await this.getFilteredContracts(finalFilters);
            
            // Processar dados conforme template
            const processedData = this.processContractData(contratos, template);
            
            // Gerar relatório
            const report = {
                id: this.generateReportId(),
                template: template,
                filters: finalFilters,
                data: processedData,
                rawData: contratos,
                metadata: {
                    geradoEm: new Date().toISOString(),
                    totalRegistros: contratos.length,
                    usuario: (auth?.currentUser?.email) || 'Anônimo'
                },
                statistics: this.calculateStatistics(contratos),
                charts: template.incluirGraficos ? this.generateChartData(contratos) : null
            };

            // Salvar no histórico
            this.addToHistory(report);
            
            window.debug && window.debug(` Relatório gerado: ${report.id}`);
            return report;
            
        } catch (error) {
            console.error(' Erro ao gerar relatório:', error);
            throw error;
        }
    }

    /**
     * Obtém contratos filtrados
     */
    async getFilteredContracts(filters) {
        try {
            const normalizedFilters = filters || {};
            const statusList = Array.isArray(normalizedFilters.status) ? normalizedFilters.status.filter(Boolean) : [];
            const vendorList = Array.isArray(normalizedFilters.vendedores) ? normalizedFilters.vendedores.filter(Boolean) : [];
            const empreendimentoList = Array.isArray(normalizedFilters.empreendimentos) ? normalizedFilters.empreendimentos.filter(Boolean) : [];
            const analistas = Array.isArray(normalizedFilters.analistas) ? normalizedFilters.analistas.filter(Boolean) : [];
            const workflowFilter = normalizedFilters.workflowType;
            const searchTerm = (normalizedFilters.searchTerm || '').trim().toLowerCase();
            const dateField = normalizedFilters.campoData || 'dataAssinatura';
            const forceRefresh = normalizedFilters.forceRefresh === true;
            let contratos = [];

            if (!forceRefresh && Array.isArray(this.cachedContracts) && this.cachedContracts.length > 0) {
                contratos = this.cachedContracts;
            }

            const fetchContracts = async () => {
                if (window.firestoreService?.getAllContracts) {
                    return window.firestoreService.getAllContracts({
                        includeArchived: true
                    });
                }
                if (window.firestoreService?.getAllContratos) {
                    return window.firestoreService.getAllContratos();
                }
                if (window.firestoreService?.getContractsPage) {
                    const page = await window.firestoreService.getContractsPage({
                        limit: 300,
                        page: 1,
                        sortKey: 'updatedAt',
                        sortDirection: 'desc',
                        includeArchived: true
                    });
                    return Array.isArray(page?.contracts) ? page.contracts : [];
                }
                throw new Error('Serviço Firestore não disponível');
            };

            // Tenta usar cache em memória antes de fazer nova leitura
            if (forceRefresh && window.cacheService?.invalidate) {
                window.cacheService.invalidate('reports_contracts_all');
                window.cacheService.invalidate('contracts_all_with_archived');
                window.cacheService.invalidate('contracts_all_active');
            }

            if (!forceRefresh && window.cacheService?.getSync) {
                contratos =
                    window.cacheService.getSync('reports_contracts_all', 'contractsAll') ||
                    window.cacheService.getSync('contracts_all_with_archived', 'contractsAll') ||
                    window.cacheService.getSync('contracts_all_active', 'contractsAll') ||
                    [];
            }

            if (!Array.isArray(contratos) || contratos.length === 0) {
                if (window.cacheService && typeof window.cacheService.get === 'function') {
                    contratos = await window.cacheService.get(
                        'reports_contracts_all',
                        fetchContracts,
                        'contractsAll',
                        forceRefresh
                    );
                } else {
                    contratos = await fetchContracts();
                }
            }

            this.cachedContracts = contratos;

            return contratos.filter(contrato => {
                // Filtro por status
                if (statusList.length > 0 && !statusList.includes(contrato.status)) {
                    return false;
                }

                // Filtro por vendedor
                if (vendorList.length > 0 && !vendorList.includes(contrato.vendedorConstrutora)) {
                    return false;
                }

                // Filtro por empreendimento
                if (empreendimentoList.length > 0 && !empreendimentoList.includes(contrato.empreendimento)) {
                    return false;
                }

                // Filtro por analista
                if (analistas.length > 0 && !analistas.includes(contrato.analista)) {
                    return false;
                }

                // Filtro por workflow escolhido na UI
                if (workflowFilter) {
                    const workflowValue = (contrato.workflowType || contrato.workflowId || '').toString().toLowerCase();
                    const normalizedWorkflowFilter = workflowFilter.toString().toLowerCase();

                    if (normalizedWorkflowFilter === 'sem-workflow') {
                        if (workflowValue) {
                            return false;
                        }
                    } else if (!workflowValue || workflowValue !== normalizedWorkflowFilter) {
                        return false;
                    }
                }

                // Filtro por data
                const rawDate = contrato[dateField];
                const dateObj = parseDateValue(rawDate);
                if (normalizedFilters.dataInicio) {
                    const dataInicio = new Date(normalizedFilters.dataInicio);
                    if (!dateObj || dateObj < dataInicio) {
                        return false;
                    }
                }

                if (normalizedFilters.dataFim) {
                    const dataFim = new Date(normalizedFilters.dataFim);
                    if (!dateObj || dateObj > dataFim) {
                        return false;
                    }
                }

                // Filtro por valor mínimo/máximo
                const valor = parseFloat(contrato.valorContrato) || 0;
                if (normalizedFilters.valorMinimo !== null && normalizedFilters.valorMinimo !== undefined) {
                    if (valor < normalizedFilters.valorMinimo) return false;
                }
                if (normalizedFilters.valorMaximo !== null && normalizedFilters.valorMaximo !== undefined) {
                    if (valor > normalizedFilters.valorMaximo) return false;
                }

                // Busca textual simples
                if (searchTerm) {
                    const haystack = [
                        contrato.clientePrincipal,
                        contrato.empreendimento,
                        contrato.vendedorConstrutora,
                        contrato.status,
                        contrato.analista,
                        contrato.id
                    ]
                        .filter(Boolean)
                        .join(' ')
                        .toLowerCase();

                    if (!haystack.includes(searchTerm)) {
                        return false;
                    }
                }

                return true;
            });
            
        } catch (error) {
            console.error('Erro ao obter contratos filtrados:', error);
            throw error;
        }
    }

    /**
     * Processa dados dos contratos conforme template
     */
    processContractData(contratos, template) {
        // Ordenar contratos
        const sorted = [...contratos].sort((a, b) => {
            const aValue = a[template.ordenacao.campo];
            const bValue = b[template.ordenacao.campo];
            
            let comparison = 0;
            if (aValue < bValue) comparison = -1;
            if (aValue > bValue) comparison = 1;
            
            return template.ordenacao.direcao === 'desc' ? -comparison : comparison;
        });

        // Extrair apenas campos necessários
        const filtered = sorted.map(contrato => {
            const filtered = {};
            template.campos.forEach(campo => {
                filtered[campo] = contrato[campo];
            });
            return filtered;
        });

        // Agrupar se necessário
        if (template.formato === 'agrupado' && template.agruparPor) {
            return this.groupDataBy(filtered, template.agruparPor);
        }

        return filtered;
    }

    /**
     * Agrupa dados por campo específico
     */
    groupDataBy(data, field) {
        const grouped = {};
        
        data.forEach(item => {
            const key = item[field] || 'Não definido';
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(item);
        });

        return grouped;
    }

    /**
     * Calcula estatísticas do relatório
     */
    calculateStatistics(contratos) {
        const stats = {
            total: contratos.length,
            valorTotal: 0,
            valorMedio: 0,
            entradaTotal: 0,
            financiamentoTotal: 0,
            saldoReceberTotal: 0
        };

        if (contratos.length === 0) return stats;

        // Calcular valores financeiros
        contratos.forEach(contrato => {
            const valor = parseFloat(contrato.valorContrato) || 0;
            const entrada = parseFloat(contrato.entrada) || 0;
            const financiamento = parseFloat(contrato.financiamento) || 0;
            const saldoReceber = parseFloat(contrato.saldoReceber) || 0;

            stats.valorTotal += valor;
            stats.entradaTotal += entrada;
            stats.financiamentoTotal += financiamento;
            stats.saldoReceberTotal += saldoReceber;
        });

        stats.valorMedio = stats.valorTotal / contratos.length;

        // Estatísticas por status
        stats.porStatus = {};
        contratos.forEach(contrato => {
            const status = contrato.status || 'Não definido';
            if (!stats.porStatus[status]) {
                stats.porStatus[status] = 0;
            }
            stats.porStatus[status]++;
        });

        // Estatísticas por empreendimento
        stats.porEmpreendimento = {};
        contratos.forEach(contrato => {
            const emp = contrato.empreendimento || 'Não definido';
            if (!stats.porEmpreendimento[emp]) {
                stats.porEmpreendimento[emp] = 0;
            }
            stats.porEmpreendimento[emp]++;
        });

        return stats;
    }

    /**
     * Gera dados para gráficos
     */
    generateChartData(contratos) {
        const charts = {};

        // Gráfico por status
        charts.status = {
            type: 'pie',
            title: 'Distribuição por Status',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
                        '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
                    ]
                }]
            }
        };

        const statusCount = {};
        contratos.forEach(contrato => {
            const status = contrato.status || 'Não definido';
            statusCount[status] = (statusCount[status] || 0) + 1;
        });

        Object.entries(statusCount).forEach(([status, count]) => {
            charts.status.data.labels.push(status);
            charts.status.data.datasets[0].data.push(count);
        });

        // Gráfico de valores por mês
        charts.valorPorMes = {
            type: 'line',
            title: 'Valor de Contratos por Mês',
            data: {
                labels: [],
                datasets: [{
                    label: 'Valor Total',
                    data: [],
                    borderColor: '#36A2EB',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    fill: true
                }]
            }
        };

        const monthlyValues = {};
        contratos.forEach(contrato => {
            if (contrato.dataAssinatura) {
                const date = new Date(contrato.dataAssinatura);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                const valor = parseFloat(contrato.valorContrato) || 0;
                
                monthlyValues[monthKey] = (monthlyValues[monthKey] || 0) + valor;
            }
        });

        Object.entries(monthlyValues)
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([month, value]) => {
                const [year, monthNum] = month.split('-');
                const monthName = new Date(year, monthNum - 1).toLocaleDateString('pt-BR', { 
                    year: 'numeric', 
                    month: 'short' 
                });
                charts.valorPorMes.data.labels.push(monthName);
                charts.valorPorMes.data.datasets[0].data.push(value);
            });

        return charts;
    }

    /**
     * Gera ID único para relatório
     */
    generateReportId() {
        return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Adiciona relatório ao histórico
     */
    addToHistory(report) {
        const historyItem = {
            id: report.id,
            templateId: report.template.id,
            templateNome: report.template.nome,
            geradoEm: report.metadata.geradoEm,
            totalRegistros: report.metadata.totalRegistros,
            usuario: report.metadata.usuario
        };

        this.reportHistory.unshift(historyItem);
        
        // Manter apenas os últimos 50 relatórios
        if (this.reportHistory.length > 50) {
            this.reportHistory = this.reportHistory.slice(0, 50);
        }

        this.saveReportHistory();
    }

    /**
     * Exporta relatório para CSV
     */
    exportToCSV(report) {
        try {
            let csvContent = '';
            const formatCsvValue = (value, fieldName = '') => {
                if (value === undefined || value === null) return '';

                if (isDateLikeField(fieldName)) {
                    const date = parseDateValue(value);
                    if (date) {
                        return formatDateBr(date, DATE_TIME_FIELD_KEYS.has(fieldName));
                    }
                }

                if (value instanceof Date || typeof value?.toDate === 'function') {
                    const date = parseDateValue(value);
                    if (date) {
                        return formatDateBr(date, true);
                    }
                }

                if (Array.isArray(value)) {
                    return value.map((item) => formatCsvValue(item)).filter(Boolean).join(' | ');
                }

                if (typeof value === 'object') {
                    if (Number.isFinite(value.seconds) || Number.isFinite(value._seconds)) {
                        const date = parseDateValue(value);
                        return date ? formatDateBr(date, true) : '';
                    }
                    return JSON.stringify(value);
                }

                return value;
            };
            
            // Cabeçalho
            if (Array.isArray(report.data)) {
                if (report.data.length > 0) {
                    const headers = Object.keys(report.data[0]);
                    csvContent = headers.join(',') + '\n';
                    
                    // Dados
                    report.data.forEach(row => {
                        const values = headers.map(header => {
                            const value = formatCsvValue(row[header], header);
                            return `"${value.toString().replace(/"/g, '""')}"`;
                        });
                        csvContent += values.join(',') + '\n';
                    });
                }
            } else {
                // Dados agrupados
                Object.entries(report.data).forEach(([group, items]) => {
                    csvContent += `\n"${group}"\n`;
                    if (items.length > 0) {
                        const headers = Object.keys(items[0]);
                        csvContent += headers.join(',') + '\n';
                        
                        items.forEach(row => {
                            const values = headers.map(header => {
                                const value = formatCsvValue(row[header], header);
                                return `"${value.toString().replace(/"/g, '""')}"`;
                            });
                            csvContent += values.join(',') + '\n';
                        });
                    }
                });
            }

            const filename = `relatorio_${report.id}.csv`;
            const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
            activityLogService.downloadBlob(blob, filename);

            activityLogService.auditFileAction({
                actionType: 'EXPORT_REPORT',
                description: `Relatorio exportado: ${report.nome || report.name || report.id || 'sem nome'}`,
                module: 'relatorios',
                page: 'relatorios',
                source: 'reportsService',
                relatedEntityId: report.id || null,
                filename,
                blobOrText: blob,
                mimeType: 'text/csv;charset=utf-8;',
                rowCount: Array.isArray(report.data) ? report.data.length : null,
                entityType: 'report',
                entityLabel: report.nome || report.name || report.id || 'sem nome',
                extraData: {
                    format: 'CSV'
                }
            }).catch((error) => {
                console.error('[reportsService] Falha ao auditar exportacao CSV:', error);
            });
            
            window.debug && window.debug(` Relatório exportado para CSV: ${report.id}`);
            
        } catch (error) {
            console.error(' Erro ao exportar CSV:', error);
            throw error;
        }
    }

    /**
     * Exporta relatório para PDF
     */
    async exportToPDF(report) {
        try {
            // Para implementar PDF, seria necessário uma biblioteca como jsPDF
            // Por enquanto, vamos simular com um HTML que pode ser impresso
            const printWindow = window.open('', '_blank');
            const htmlContent = this.generatePrintableHTML(report);
            
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            printWindow.focus();
            
            // Dar tempo para carregar antes de imprimir
            setTimeout(() => {
                printWindow.print();
            }, 1000);
            
            window.debug && window.debug(` Relatório preparado para PDF: ${report.id}`);
            
        } catch (error) {
            console.error(' Erro ao exportar PDF:', error);
            throw error;
        }
    }

    /**
     * Gera HTML imprimível do relatório
     */
    generatePrintableHTML(report) {
        const date = new Date(report.metadata.geradoEm).toLocaleDateString('pt-BR');
        const time = new Date(report.metadata.geradoEm).toLocaleTimeString('pt-BR');
        
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${report.template.nome}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px; }
                    .metadata { margin-bottom: 20px; background: #f5f5f5; padding: 10px; }
                    .statistics { margin: 20px 0; }
                    .stat-item { display: inline-block; margin: 10px; padding: 10px; background: #e3f2fd; border-radius: 5px; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; font-weight: bold; }
                    .group-header { background-color: #e8f5e8; font-weight: bold; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${report.template.nome}</h1>
                    <p>${report.template.descricao}</p>
                </div>
                
                <div class="metadata">
                    <strong>Gerado em:</strong> ${date} às ${time}<br>
                    <strong>Usuário:</strong> ${report.metadata.usuario}<br>
                    <strong>Total de registros:</strong> ${report.metadata.totalRegistros}
                </div>
        `;

        // Estatísticas
        if (report.statistics) {
            html += '<div class="statistics"><h3>Resumo</h3>';
            html += `<div class="stat-item">Total: ${report.statistics.total}</div>`;
            if (report.statistics.valorTotal > 0) {
                html += `<div class="stat-item">Valor Total: R$ ${report.statistics.valorTotal.toLocaleString('pt-BR')}</div>`;
                html += `<div class="stat-item">Valor Médio: R$ ${report.statistics.valorMedio.toLocaleString('pt-BR')}</div>`;
            }
            html += '</div>';
        }

        // Dados
        html += '<div class="data"><h3>Dados</h3>';
        
        if (Array.isArray(report.data)) {
            // Tabela simples
            if (report.data.length > 0) {
                html += '<table>';
                
                // Cabeçalho
                const headers = Object.keys(report.data[0]);
                html += '<tr>';
                headers.forEach(header => {
                    html += `<th>${header}</th>`;
                });
                html += '</tr>';
                
                // Dados
                report.data.forEach(row => {
                    html += '<tr>';
                    headers.forEach(header => {
                        const value = row[header] || '';
                        html += `<td>${value}</td>`;
                    });
                    html += '</tr>';
                });
                
                html += '</table>';
            }
        } else {
            // Dados agrupados
            Object.entries(report.data).forEach(([group, items]) => {
                html += `<h4 class="group-header">${group}</h4>`;
                
                if (items.length > 0) {
                    html += '<table>';
                    
                    // Cabeçalho
                    const headers = Object.keys(items[0]);
                    html += '<tr>';
                    headers.forEach(header => {
                        html += `<th>${header}</th>`;
                    });
                    html += '</tr>';
                    
                    // Dados do grupo
                    items.forEach(row => {
                        html += '<tr>';
                        headers.forEach(header => {
                            const value = row[header] || '';
                            html += `<td>${value}</td>`;
                        });
                        html += '</tr>';
                    });
                    
                    html += '</table>';
                }
            });
        }
        
        html += '</div>';
        html += '</body></html>';
        
        return html;
    }

    /**
     * Salva template customizado
     */
    saveCustomTemplate(template) {
        try {
            // Validar template
            if (!template.id || !template.nome || !template.campos) {
                throw new Error('Template inválido: faltam campos obrigatórios');
            }

            this.templates.set(template.id, template);
            
            // Salvar templates customizados no localStorage
            const customTemplates = {};
            this.templates.forEach((template, id) => {
                if (!['basico', 'completo', 'financeiro', 'status'].includes(id)) {
                    customTemplates[id] = template;
                }
            });
            
            localStorage.setItem('customReportTemplates', JSON.stringify(customTemplates));
            
            window.debug && window.debug(` Template salvo: ${template.id}`);
            
        } catch (error) {
            console.error(' Erro ao salvar template:', error);
            throw error;
        }
    }

    /**
     * Remove template customizado
     */
    removeCustomTemplate(templateId) {
        // Não permitir remoção de templates padrão
        if (['basico', 'completo', 'financeiro', 'status'].includes(templateId)) {
            throw new Error('Não é possível remover templates padrão');
        }

        this.templates.delete(templateId);
        
        // Atualizar localStorage
        const customTemplates = {};
        this.templates.forEach((template, id) => {
            if (!['basico', 'completo', 'financeiro', 'status'].includes(id)) {
                customTemplates[id] = template;
            }
        });
        
        localStorage.setItem('customReportTemplates', JSON.stringify(customTemplates));
        
    window.debug && window.debug(` Template removido: ${templateId}`);
    }

    /**
     * Obtém todos os templates
     */
    getTemplates() {
        return Array.from(this.templates.values());
    }

    /**
     * Obtém template por ID
     */
    getTemplate(id) {
        return this.templates.get(id);
    }

    /**
     * Obtém histórico de relatórios
     */
    getReportHistory() {
        return [...this.reportHistory];
    }

    /**
     * Limpa histórico de relatórios
     */
    clearReportHistory() {
        this.reportHistory = [];
        this.saveReportHistory();
    }
}

// Instância global
window.reportsService = new ReportsService();
