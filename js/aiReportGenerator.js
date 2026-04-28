/**
 * @file aiReportGenerator.js
 * @description Gerador de relatórios inteligente com análise IA
 * Cria relatórios personalizados, insights e recomendações
 */

import aiService from './aiService.js';

class AIReportGenerator {
  constructor() {
    this.reportTypes = {
      executive: 'Relatório Executivo',
      detailed: 'Relatório Detalhado',
      financial: 'Análise Financeira',
      performance: 'Performance de Processos',
      predictive: 'Análise Preditiva',
      custom: 'Relatório Personalizado'
    };
  }

  /**
   * Gera relatório executivo com insights da IA
   * @param {object[]} contracts - Lista de contratos
   * @param {object} options - Opções do relatório
   * @returns {Promise<object>} Relatório gerado
   */
  async generateExecutiveReport(contracts, options = {}) {
    window.debug && window.debug(` Gerando relatório executivo para ${contracts.length} contratos`);

    try {
      // Estatísticas básicas
      const stats = this.calculateBasicStats(contracts);

      // Análise IA para insights avançados
      const aiAnalysis = await aiService.generateContractsSummary(contracts, {
        includeDetails: options.includeDetails || false
      });

      // Monta relatório
      const report = {
        type: 'executive',
        title: 'Relatório Executivo de Contratos',
        generatedAt: new Date().toISOString(),
        period: options.period || 'Todos os períodos',
        totalContracts: contracts.length,
        
        statistics: stats,
        
        executiveSummary: aiAnalysis.executiveSummary || this.generateBasicSummary(stats),
        
        keyInsights: aiAnalysis.keyInsights || [],
        
        trends: aiAnalysis.trends || [],
        
        recommendations: aiAnalysis.recommendations || [],
        
        riskAreas: aiAnalysis.riskAreas || [],
        
        charts: this.generateChartData(contracts, stats),
        
        metadata: {
          generatedBy: 'AI Report Generator',
          aiProvider: aiService.provider,
          includesAI: true
        }
      };

      return report;

    } catch (error) {
      console.error(' Erro ao gerar relatório executivo:', error);
      
      // Fallback: relatório básico sem IA
      const stats = this.calculateBasicStats(contracts);
      return {
        type: 'executive',
        title: 'Relatório Executivo de Contratos',
        generatedAt: new Date().toISOString(),
        totalContracts: contracts.length,
        statistics: stats,
        executiveSummary: this.generateBasicSummary(stats),
        charts: this.generateChartData(contracts, stats),
        error: error.message,
        metadata: {
          generatedBy: 'Basic Report Generator',
          includesAI: false
        }
      };
    }
  }

  /**
   * Calcula estatísticas básicas dos contratos
   */
  calculateBasicStats(contracts) {
    const stats = {
      total: contracts.length,
      totalValue: 0,
      averageValue: 0,
      totalEntry: 0,
      totalFinancing: 0,
      byStatus: {},
      byVendor: {},
      byMonth: {},
      completionRate: 0,
      averageCompletionDays: 0
    };

    const completionDays = [];

    contracts.forEach(contract => {
      // Valores financeiros
      stats.totalValue += contract.valorContrato || 0;
      stats.totalEntry += contract.entrada || 0;
      stats.totalFinancing += contract.financiamento || 0;

      // Por status
      const status = contract.status || 'Sem Status';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

      // Por vendedor
      const vendor = contract.vendedorConstrutora || 'Sem Vendedor';
      stats.byVendor[vendor] = (stats.byVendor[vendor] || 0) + 1;

      // Por mês
      if (contract.criadoEm) {
        const date = contract.criadoEm.toDate ? contract.criadoEm.toDate() : new Date(contract.criadoEm);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        stats.byMonth[monthKey] = (stats.byMonth[monthKey] || 0) + 1;
      }

      // Tempo de conclusão
      if (contract.criadoEm && contract.dataFechamento) {
        const created = contract.criadoEm.toDate ? contract.criadoEm.toDate() : new Date(contract.criadoEm);
        const closed = contract.dataFechamento.toDate ? contract.dataFechamento.toDate() : new Date(contract.dataFechamento);
        const days = Math.floor((closed - created) / (1000 * 60 * 60 * 24));
        completionDays.push(days);
      }
    });

    stats.averageValue = stats.total > 0 ? stats.totalValue / stats.total : 0;
    
    if (completionDays.length > 0) {
      stats.completionRate = (completionDays.length / stats.total) * 100;
      stats.averageCompletionDays = completionDays.reduce((a, b) => a + b, 0) / completionDays.length;
    }

    return stats;
  }

  /**
   * Gera resumo básico sem IA
   */
  generateBasicSummary(stats) {
    return `Análise de ${stats.total} contratos. Valor total: R$ ${this.formatCurrency(stats.totalValue)}. ` +
           `Valor médio por contrato: R$ ${this.formatCurrency(stats.averageValue)}. ` +
           `Taxa de conclusão: ${stats.completionRate.toFixed(1)}%. ` +
           `Tempo médio de conclusão: ${Math.round(stats.averageCompletionDays)} dias.`;
  }

  /**
   * Gera dados para gráficos
   */
  generateChartData(contracts, stats) {
    return {
      statusDistribution: {
        type: 'pie',
        title: 'Distribuição por Status',
        data: stats.byStatus,
        colors: this.generateColors(Object.keys(stats.byStatus).length)
      },
      
      vendorDistribution: {
        type: 'bar',
        title: 'Contratos por Vendedor',
        data: stats.byVendor
      },
      
      monthlyTrend: {
        type: 'line',
        title: 'Tendência Mensal',
        data: stats.byMonth
      },
      
      financialBreakdown: {
        type: 'bar',
        title: 'Distribuição Financeira',
        data: {
          'Valor Total': stats.totalValue,
          'Entradas': stats.totalEntry,
          'Financiamentos': stats.totalFinancing
        }
      }
    };
  }

  /**
   * Gera relatório de análise financeira
   */
  async generateFinancialReport(contracts) {
    window.debug && window.debug(` Gerando relatório financeiro`);

    const financialStats = {
      totalValue: 0,
      totalEntry: 0,
      totalFinancing: 0,
      averageEntry: 0,
      entryPercentage: 0,
      financingPercentage: 0,
      byVendor: {},
      byStatus: {}
    };

    contracts.forEach(contract => {
      const value = contract.valorContrato || 0;
      const entry = contract.entrada || 0;
      const financing = contract.financiamento || 0;

      financialStats.totalValue += value;
      financialStats.totalEntry += entry;
      financialStats.totalFinancing += financing;

      // Por vendedor
      const vendor = contract.vendedorConstrutora || 'Sem Vendedor';
      if (!financialStats.byVendor[vendor]) {
        financialStats.byVendor[vendor] = { value: 0, entry: 0, financing: 0, count: 0 };
      }
      financialStats.byVendor[vendor].value += value;
      financialStats.byVendor[vendor].entry += entry;
      financialStats.byVendor[vendor].financing += financing;
      financialStats.byVendor[vendor].count += 1;

      // Por status
      const status = contract.status || 'Sem Status';
      if (!financialStats.byStatus[status]) {
        financialStats.byStatus[status] = { value: 0, count: 0 };
      }
      financialStats.byStatus[status].value += value;
      financialStats.byStatus[status].count += 1;
    });

    if (financialStats.totalValue > 0) {
      financialStats.averageEntry = financialStats.totalEntry / contracts.length;
      financialStats.entryPercentage = (financialStats.totalEntry / financialStats.totalValue) * 100;
      financialStats.financingPercentage = (financialStats.totalFinancing / financialStats.totalValue) * 100;
    }

    // Análise IA para insights financeiros
    let aiInsights = null;
    try {
      const prompt = `Analise estes dados financeiros e gere insights:

${JSON.stringify(financialStats, null, 2)}

Retorne um JSON com:
{
  "insights": ["insight 1", "insight 2", ...],
  "concerns": ["preocupação 1", ...],
  "opportunities": ["oportunidade 1", ...],
  "recommendations": ["recomendação 1", ...]
}`;

      aiInsights = await aiService.processText(prompt);
    } catch (error) {
      console.warn(' Erro ao gerar insights financeiros:', error);
    }

    return {
      type: 'financial',
      title: 'Análise Financeira de Contratos',
      generatedAt: new Date().toISOString(),
      statistics: financialStats,
      insights: aiInsights?.insights || [],
      concerns: aiInsights?.concerns || [],
      opportunities: aiInsights?.opportunities || [],
      recommendations: aiInsights?.recommendations || [],
      charts: {
        vendorComparison: {
          type: 'bar',
          title: 'Comparação Financeira por Vendedor',
          data: Object.entries(financialStats.byVendor).reduce((acc, [vendor, data]) => {
            acc[vendor] = data.value;
            return acc;
          }, {})
        },
        statusFinancial: {
          type: 'bar',
          title: 'Valor Financeiro por Status',
          data: Object.entries(financialStats.byStatus).reduce((acc, [status, data]) => {
            acc[status] = data.value;
            return acc;
          }, {})
        }
      }
    };
  }

  /**
   * Gera relatório de performance de processos
   */
  async generatePerformanceReport(contracts) {
    window.debug && window.debug(` Gerando relatório de performance`);

    const performanceStats = {
      totalProcessed: 0,
      completed: 0,
      inProgress: 0,
      delayed: 0,
      averageProcessingTime: 0,
      fastestProcess: null,
      slowestProcess: null,
      byStatus: {}
    };

    const processingTimes = [];
    const now = new Date();

    contracts.forEach(contract => {
      const created = contract.criadoEm?.toDate ? contract.criadoEm.toDate() : new Date(contract.criadoEm);
      const daysSinceCreation = Math.floor((now - created) / (1000 * 60 * 60 * 24));

      // Status
      const status = contract.status || 'Sem Status';
      if (!performanceStats.byStatus[status]) {
        performanceStats.byStatus[status] = {
          count: 0,
          avgDays: 0,
          days: []
        };
      }
      performanceStats.byStatus[status].count += 1;
      performanceStats.byStatus[status].days.push(daysSinceCreation);

      processingTimes.push(daysSinceCreation);

      // Concluídos vs Em andamento
      if (status.includes('Fechado') || status.includes('Concluído')) {
        performanceStats.completed += 1;
      } else {
        performanceStats.inProgress += 1;
      }

      // Atrasados (mais de 30 dias)
      if (daysSinceCreation > 30 && !status.includes('Fechado')) {
        performanceStats.delayed += 1;
      }
    });

    // Calcula médias por status
    Object.keys(performanceStats.byStatus).forEach(status => {
      const days = performanceStats.byStatus[status].days;
      performanceStats.byStatus[status].avgDays = days.reduce((a, b) => a + b, 0) / days.length;
      delete performanceStats.byStatus[status].days;
    });

    if (processingTimes.length > 0) {
      performanceStats.averageProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
      performanceStats.fastestProcess = Math.min(...processingTimes);
      performanceStats.slowestProcess = Math.max(...processingTimes);
    }

    performanceStats.totalProcessed = contracts.length;
    performanceStats.completionRate = (performanceStats.completed / performanceStats.totalProcessed) * 100;
    performanceStats.delayRate = (performanceStats.delayed / performanceStats.totalProcessed) * 100;

    return {
      type: 'performance',
      title: 'Relatório de Performance de Processos',
      generatedAt: new Date().toISOString(),
      statistics: performanceStats,
      charts: {
        statusTime: {
          type: 'bar',
          title: 'Tempo Médio por Status (dias)',
          data: Object.entries(performanceStats.byStatus).reduce((acc, [status, data]) => {
            acc[status] = Math.round(data.avgDays);
            return acc;
          }, {})
        },
        processStatus: {
          type: 'pie',
          title: 'Status dos Processos',
          data: {
            'Concluídos': performanceStats.completed,
            'Em Andamento': performanceStats.inProgress,
            'Atrasados': performanceStats.delayed
          }
        }
      }
    };
  }

  /**
   * Gera relatório personalizado baseado em descrição textual
   * @param {object[]} contracts - Contratos
   * @param {string} description - Descrição do que o usuário quer
   * @returns {Promise<object>} Relatório personalizado
   */
  async generateCustomReport(contracts, description) {
    window.debug && window.debug(` Gerando relatório personalizado`);

    try {
      const contractSample = contracts.slice(0, 5).map(c => ({
        id: c.id,
        status: c.status,
        valorContrato: c.valorContrato,
        vendedorConstrutora: c.vendedorConstrutora,
        criadoEm: c.criadoEm
      }));

      const prompt = `Gere um relatório personalizado conforme solicitado pelo usuário.

Solicitação: ${description}

Dados disponíveis (amostra de ${contracts.length} contratos):
${JSON.stringify(contractSample, null, 2)}

Retorne um JSON completo com a estrutura do relatório:
{
  "title": "título do relatório",
  "summary": "resumo executivo",
  "sections": [
    {
      "title": "título da seção",
      "content": "conteúdo detalhado",
      "data": { "chave": "valor", ... }
    }
  ],
  "insights": ["insight 1", "insight 2", ...],
  "recommendations": ["recomendação 1", ...]
}`;

      const aiReport = await aiService.processText(prompt);

      return {
        type: 'custom',
        ...aiReport,
        generatedAt: new Date().toISOString(),
        totalContracts: contracts.length,
        metadata: {
          userRequest: description,
          aiGenerated: true
        }
      };

    } catch (error) {
      console.error(' Erro ao gerar relatório personalizado:', error);
      throw error;
    }
  }

  /**
   * Exporta relatório para diferentes formatos
   */
  async exportReport(report, format = 'json') {
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(report, null, 2);
      
      case 'html':
        return this.generateHTMLReport(report);
      
      case 'markdown':
        return this.generateMarkdownReport(report);
      
      default:
        throw new Error(`Formato não suportado: ${format}`);
    }
  }

  /**
   * Gera HTML do relatório
   */
  generateHTMLReport(report) {
    // Função auxiliar para escapar HTML e prevenir XSS
    const escapeHtml = (text) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };
    
    const safeTitle = escapeHtml(report.title || 'Relatório');
    const safeDate = escapeHtml(new Date(report.generatedAt).toLocaleString('pt-BR'));
    const safeSummary = report.executiveSummary ? escapeHtml(report.executiveSummary) : '';
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${safeTitle}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #0d6efd; }
    h2 { color: #6c757d; margin-top: 30px; }
    .stat { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; }
    .insight { background: #d1ecf1; padding: 10px; margin: 5px 0; border-left: 4px solid #0c5460; }
    .recommendation { background: #d4edda; padding: 10px; margin: 5px 0; border-left: 4px solid #155724; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <p><em>Gerado em: ${safeDate}</em></p>
  
  ${safeSummary ? `<div class="stat"><h2>Resumo Executivo</h2><p>${safeSummary}</p></div>` : ''}
  
  ${report.keyInsights && report.keyInsights.length > 0 ? `
    <h2>Principais Insights</h2>
    ${report.keyInsights.map(insight => `<div class="insight">${escapeHtml(insight)}</div>`).join('')}
  ` : ''}
  
  ${report.recommendations && report.recommendations.length > 0 ? `
    <h2>Recomendações</h2>
    ${report.recommendations.map(rec => `<div class="recommendation">${escapeHtml(rec)}</div>`).join('')}
  ` : ''}
  
  <h2>Estatísticas</h2>
  <div class="stat">
    <pre>${escapeHtml(JSON.stringify(report.statistics, null, 2))}</pre>
  </div>
</body>
</html>`;
  }

  /**
   * Gera Markdown do relatório
   */
  generateMarkdownReport(report) {
    let md = `# ${report.title}\n\n`;
    md += `*Gerado em: ${new Date(report.generatedAt).toLocaleString('pt-BR')}*\n\n`;
    
    if (report.executiveSummary) {
      md += `## Resumo Executivo\n\n${report.executiveSummary}\n\n`;
    }
    
    if (report.keyInsights && report.keyInsights.length > 0) {
      md += `## Principais Insights\n\n`;
      report.keyInsights.forEach(insight => {
        md += `- ${insight}\n`;
      });
      md += '\n';
    }
    
    if (report.recommendations && report.recommendations.length > 0) {
      md += `## Recomendações\n\n`;
      report.recommendations.forEach(rec => {
        md += `- ${rec}\n`;
      });
      md += '\n';
    }
    
    md += `## Estatísticas\n\n\`\`\`json\n${JSON.stringify(report.statistics, null, 2)}\n\`\`\`\n`;
    
    return md;
  }

  /**
   * Utilitários
   */
  formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  generateColors(count) {
    const colors = [
      '#0d6efd', '#6c757d', '#28a745', '#dc3545', '#ffc107',
      '#17a2b8', '#f8f9fa', '#343a40', '#6610f2', '#e83e8c'
    ];
    return colors.slice(0, count);
  }
}

// Exporta instância singleton
const aiReportGenerator = new AIReportGenerator();
export default aiReportGenerator;

// Expõe globalmente
window.aiReportGenerator = aiReportGenerator;
