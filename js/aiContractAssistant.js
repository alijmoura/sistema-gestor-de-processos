/**
 * @file aiContractAssistant.js
 * @description Assistente IA para criação e atualização de contratos
 * Fornece sugestões inteligentes, validações e auto-preenchimento
 */

import aiService from './aiService.js';
import { db, auth } from './auth.js';
import cacheService from './cacheService.js';

class AIContractAssistant {
  constructor() {
    this.enabled = true;
    this.suggestionsCache = new Map();
    this.historicalData = null;
    this._authPatternsBound = false;
    this.bindAuthPatternsRefresh();
    this.loadHistoricalPatterns();
  }

  bindAuthPatternsRefresh() {
    if (this._authPatternsBound || !auth?.onAuthStateChanged) {
      return;
    }

    this._authPatternsBound = true;
    auth.onAuthStateChanged((user) => {
      if (!user) {
        return;
      }

      this.loadHistoricalPatterns().catch((error) => {
        console.warn(' Falha ao recarregar padrões históricos da IA após autenticação:', error);
      });
    });
  }

  /**
   * Carrega padrões históricos para melhorar sugestões
   */
  async loadHistoricalPatterns() {
    try {
      // Evita consulta antes de autenticação, que gera permission-denied no boot.
      if (!auth.currentUser) {
        this.historicalData = { totalContracts: 0, loadedAt: new Date() };
        return;
      }

      const cacheKey = 'ai_historical_patterns';
      const cached = cacheService.cache.get(cacheKey);
      const now = Date.now();
      const ttl = 3600 * 1000; // 1 hora
      
      if (cached && (now - cached.timestamp) < ttl) {
        this.historicalData = cached.data;
        return;
      }

      // Busca últimos 100 contratos para análise de padrões
      const snapshot = await db.collection('contracts')
        .orderBy('criadoEm', 'desc')
        .limit(100)
        .get();

      const contracts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      this.historicalData = {
        totalContracts: contracts.length,
        vendors: this.extractUniqueValues(contracts, 'vendedorConstrutora'),
        developments: this.extractUniqueValues(contracts, 'empreendimento'),
        averageValue: this.calculateAverage(contracts, 'valorContrato'),
        commonStatuses: this.extractUniqueValues(contracts, 'status'),
        loadedAt: new Date()
      };

      // Salva no cache por 1 hora
      await cacheService.set(cacheKey, this.historicalData, 'ai_patterns', 3600);
      
      window.debug && window.debug(' Padrões históricos carregados');
    } catch (error) {
      console.warn(' Erro ao carregar padrões históricos:', error);
      this.historicalData = { totalContracts: 0 };
    }
  }

  /**
   * Extrai valores únicos de um campo
   */
  extractUniqueValues(contracts, field) {
    const values = contracts
      .map(c => c[field])
      .filter(v => v && v !== '');
    return [...new Set(values)];
  }

  /**
   * Calcula média de valores numéricos
   */
  calculateAverage(contracts, field) {
    const values = contracts
      .map(c => c[field])
      .filter(v => typeof v === 'number' && !isNaN(v));
    
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Ativa/desativa o assistente
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    window.debug && window.debug(` Assistente IA ${enabled ? 'ativado' : 'desativado'}`);
  }

  /**
   * Gera sugestões para um campo específico
   * @param {string} fieldName - Nome do campo
   * @param {object} currentData - Dados atuais do contrato
   * @param {object} context - Contexto adicional
   * @returns {Promise<object>} Sugestões
   */
  async suggestFieldValue(fieldName, currentData = {}, context = {}) {
    if (!this.enabled) {
      return { suggestions: [], confidence: 0 };
    }

    // Verifica cache de sugestões
    const cacheKey = `${fieldName}_${JSON.stringify(currentData)}`;
    if (this.suggestionsCache.has(cacheKey)) {
      return this.suggestionsCache.get(cacheKey);
    }

    try {
      // Sugestões baseadas em padrões históricos (rápido)
      const historicalSuggestions = this.getHistoricalSuggestions(fieldName, currentData);
      
      // Se temos sugestões históricas com alta confiança, usa elas
      if (historicalSuggestions.confidence > 0.7) {
        this.suggestionsCache.set(cacheKey, historicalSuggestions);
        return historicalSuggestions;
      }

      // Caso contrário, usa IA para sugestões mais inteligentes
      const aiSuggestion = await aiService.suggestFieldValue(fieldName, {
        ...currentData,
        ...context,
        historicalData: this.historicalData
      });

      const result = {
        suggestions: Array.isArray(aiSuggestion.value) ? aiSuggestion.value : [aiSuggestion.value],
        confidence: aiSuggestion.confidence || 0.5,
        reasoning: aiSuggestion.reasoning || '',
        source: 'ai'
      };

      this.suggestionsCache.set(cacheKey, result);
      return result;

    } catch (error) {
      console.warn(` Erro ao gerar sugestão para ${fieldName}:`, error);
      return { suggestions: [], confidence: 0, error: error.message };
    }
  }

  /**
   * Gera sugestões baseadas em dados históricos (sem IA)
   */
  getHistoricalSuggestions(fieldName, currentData) {
    if (!this.historicalData || this.historicalData.totalContracts === 0) {
      return { suggestions: [], confidence: 0 };
    }

    const suggestions = [];
    let confidence = 0.5;

    switch (fieldName) {
      case 'vendedorConstrutora':
        suggestions.push(...this.historicalData.vendors.slice(0, 5));
        confidence = 0.8;
        break;

      case 'empreendimento':
        // Se tem vendedor, filtra empreendimentos desse vendedor
        if (currentData.vendedorConstrutora) {
          // Aqui seria ideal buscar do banco, mas por ora usa lista completa
          suggestions.push(...this.historicalData.developments.slice(0, 5));
          confidence = 0.7;
        } else {
          suggestions.push(...this.historicalData.developments.slice(0, 5));
          confidence = 0.6;
        }
        break;

      case 'valorContrato':
        if (this.historicalData.averageValue > 0) {
          // Sugestões baseadas na média +/- 20%
          const avg = this.historicalData.averageValue;
          suggestions.push(
            Math.round(avg * 0.8),
            Math.round(avg),
            Math.round(avg * 1.2)
          );
          confidence = 0.6;
        }
        break;

      case 'status':
        suggestions.push(...this.historicalData.commonStatuses.slice(0, 3));
        confidence = 0.9;
        break;
    }

    return {
      suggestions: suggestions.filter(s => s !== null && s !== undefined),
      confidence,
      source: 'historical'
    };
  }

  /**
   * Auto-completa múltiplos campos de uma vez
   * @param {object} partialData - Dados parciais do contrato
   * @returns {Promise<object>} Dados auto-completados
   */
  async autoCompleteContract(partialData) {
    if (!this.enabled) {
      return { ...partialData };
    }

    window.debug && window.debug(' Auto-completando contrato...');

    const completed = { ...partialData };
    const fieldsToComplete = [
      'workflowId',
      'status',
      'vendedorConstrutora',
      'empreendimento',
      'apto',
      'bloco',
      'nContratoCEF',
      'dataMinuta',
      'dataAssinatura',
      'valorContrato',
      'entrada',
      'financiamento',
      'cartorio',
      'matriculaImovel',
      'municipioImovel',
      'iptu',
      'formaPagamentoRi',
      'valorDepositoRi',
      'dataEntradaRegistro',
      'protocoloRi',
      'valorITBI',
      'agencia',
      'gerente'
    ];

    for (const field of fieldsToComplete) {
      if (!completed[field]) {
        const suggestion = await this.suggestFieldValue(field, completed);
        if (suggestion.suggestions.length > 0 && suggestion.confidence > 0.6) {
          completed[field] = suggestion.suggestions[0];
          completed[`${field}_aiSuggested`] = true;
          completed[`${field}_confidence`] = suggestion.confidence;
        }
      }
    }

    // Calcula campos derivados
    if (completed.valorContrato && !completed.entrada) {
      completed.entrada = Math.round(completed.valorContrato * 0.2); // 20% padrão
      completed.entrada_aiSuggested = true;
    }

    if (completed.valorContrato && completed.entrada && !completed.financiamento) {
      completed.financiamento = completed.valorContrato - completed.entrada;
      completed.financiamento_aiSuggested = true;
    }

    return completed;
  }

  /**
   * Valida dados do contrato e retorna inconsistências
   * @param {object} contractData - Dados do contrato
   * @returns {Promise<object>} Resultado da validação
   */
  async validateContract(contractData) {
    if (!this.enabled) {
      return { valid: true, issues: [] };
    }

    try {
      // Validações básicas (rápidas)
      const basicIssues = this.performBasicValidation(contractData);

      // Se há muitas issues básicas, retorna sem chamar IA
      if (basicIssues.length > 5) {
        return {
          valid: false,
          issues: basicIssues,
          source: 'basic',
          overallStatus: 'error'
        };
      }

      // Validação avançada com IA
      const aiAnalysis = await aiService.analyzeContract(contractData);

      return {
        valid: aiAnalysis.overallStatus === 'ok',
        issues: [...basicIssues, ...aiAnalysis.inconsistencies],
        suggestions: aiAnalysis.suggestions || [],
        completeness: aiAnalysis.completeness || 0,
        overallStatus: aiAnalysis.overallStatus || 'unknown',
        source: 'ai'
      };

    } catch (error) {
      console.warn(' Erro na validação IA:', error);
      // Fallback para validação básica
      const basicIssues = this.performBasicValidation(contractData);
      return {
        valid: basicIssues.length === 0,
        issues: basicIssues,
        source: 'basic',
        error: error.message
      };
    }
  }

  /**
   * Realiza validações básicas sem IA
   */
  performBasicValidation(data) {
    const issues = [];

    // Campos obrigatórios
    const requiredFields = {
      'clientePrincipal': 'Cliente Principal',
      'vendedorConstrutora': 'Vendedor/Construtora',
      'empreendimento': 'Empreendimento',
      'valorContrato': 'Valor do Contrato'
    };

    Object.entries(requiredFields).forEach(([field, label]) => {
      if (!data[field]) {
        issues.push({
          field,
          issue: `${label} é obrigatório`,
          severity: 'high'
        });
      }
    });

    // Validações de valores
    if (data.valorContrato && data.valorContrato < 0) {
      issues.push({
        field: 'valorContrato',
        issue: 'Valor do contrato não pode ser negativo',
        severity: 'high'
      });
    }

    if (data.entrada && data.valorContrato && data.entrada > data.valorContrato) {
      issues.push({
        field: 'entrada',
        issue: 'Entrada não pode ser maior que o valor total',
        severity: 'high'
      });
    }

    // Validação de matemática financeira
    if (data.valorContrato && data.entrada && data.financiamento) {
      const expectedFinancing = data.valorContrato - data.entrada;
      const diff = Math.abs(data.financiamento - expectedFinancing);
      
      if (diff > 1) { // Margem de 1 real
        issues.push({
          field: 'financiamento',
          issue: `Financiamento inconsistente. Esperado: R$ ${expectedFinancing.toFixed(2)}`,
          severity: 'medium'
        });
      }
    }

    return issues;
  }

  /**
   * Sugere próximo status baseado no atual
   * @param {object} contractData - Dados do contrato
   * @param {array} history - Histórico de mudanças
   * @returns {Promise<object>} Sugestão de próximo status
   */
  async suggestNextStatus(contractData, history = []) {
    if (!this.enabled) {
      return { suggestedStatus: null, confidence: 0 };
    }

    try {
      return await aiService.predictNextStatus(contractData, history);
    } catch (error) {
      console.warn(' Erro ao sugerir próximo status:', error);
      return { suggestedStatus: null, confidence: 0, error: error.message };
    }
  }

  /**
   * Analisa atrasos e gera alertas
   * @param {object} contractData - Dados do contrato
   * @returns {Promise<object>} Análise de atrasos
   */
  async analyzeDelays(contractData) {
    if (!contractData.criadoEm) {
      return { hasDelay: false, analysis: 'Sem data de criação' };
    }

    const now = new Date();
    const createdDate = contractData.criadoEm.toDate ? contractData.criadoEm.toDate() : new Date(contractData.criadoEm);
    const daysSinceCreation = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));

    // Thresholds baseados no status
    const thresholds = {
      'Aguardando/Documentação': 7,
      'Aguardando/Análise': 10,
      'Em Análise/Banco': 15,
      'Em Análise/CEHOP': 20,
      'Aguardando/Registro': 30
    };

    const threshold = thresholds[contractData.status] || 15;
    const hasDelay = daysSinceCreation > threshold;

    if (!hasDelay) {
      return {
        hasDelay: false,
        daysSinceCreation,
        threshold,
        status: 'ok'
      };
    }

    // Se há atraso, usa IA para análise mais detalhada
    try {
      const prompt = `Analise este contrato em atraso:

Status: ${contractData.status}
Dias desde criação: ${daysSinceCreation}
Threshold: ${threshold} dias
Dados: ${JSON.stringify(contractData, null, 2)}

Retorne um JSON com:
{
  "severity": "low|medium|high",
  "reasons": ["razão 1", "razão 2"],
  "recommendations": ["recomendação 1", "recomendação 2"],
  "estimatedResolutionDays": número
}`;

      const analysis = await aiService.processText(prompt);

      return {
        hasDelay: true,
        daysSinceCreation,
        threshold,
        daysOverdue: daysSinceCreation - threshold,
        ...analysis
      };

    } catch (error) {
      return {
        hasDelay: true,
        daysSinceCreation,
        threshold,
        daysOverdue: daysSinceCreation - threshold,
        severity: daysSinceCreation > threshold * 2 ? 'high' : 'medium',
        error: error.message
      };
    }
  }

  /**
   * Limpa cache de sugestões
   */
  clearCache() {
    this.suggestionsCache.clear();
    window.debug && window.debug(' Cache de sugestões limpo');
  }

  /**
   * Retorna estatísticas do assistente
   */
  getStats() {
    return {
      enabled: this.enabled,
      cachedSuggestions: this.suggestionsCache.size,
      historicalContracts: this.historicalData?.totalContracts || 0,
      historicalDataLoaded: !!this.historicalData
    };
  }
}

// Exporta instância singleton
const aiContractAssistant = new AIContractAssistant();
export default aiContractAssistant;

// Expõe globalmente
window.aiContractAssistant = aiContractAssistant;
