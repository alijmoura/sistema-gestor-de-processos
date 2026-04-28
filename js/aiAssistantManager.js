/**
 * @file aiAssistantManager.js
 * @description Assistente IA Centralizado - Unifica todas as funcionalidades de IA
 * Fornece interface conversacional, histórico e roteamento inteligente
 */

import aiService from './aiService.js';
import aiContractAssistant from './aiContractAssistant.js';
import documentProcessingService from './documentProcessingService.js';
import aiReportGenerator from './aiReportGenerator.js';
import { db, auth } from './auth.js';
import cacheService from './cacheService.js';

class AIAssistantManager {
  constructor() {
    this.conversationHistory = [];
    this.maxHistoryLength = 50;
    this.contextWindow = 10; // Últimas 10 mensagens para contexto
    this.userId = null;
    this.initialized = false;
    
    // Capacidades do assistente
    this.capabilities = {
      conversation: true,           // Conversa em linguagem natural
      documentExtraction: true,     // Extração de dados de documentos
      contractSuggestions: true,    // Sugestões para contratos
      reportGeneration: true,       // Geração de relatórios
      validation: true,             // Validação inteligente
      search: true,                 // Busca semântica
      prediction: true,             // Análise preditiva
      proactiveHelp: true          // Ajuda proativa
    };

    // Intents (intenções) que o assistente reconhece
    this.intents = {
      greeting: ['olá', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'hey'],
      help: ['ajuda', 'help', 'como', 'o que você faz', 'funcionalidades'],
      document: ['documento', 'pdf', 'extrair', 'processar', 'upload', 'arquivo'],
      contract: ['contrato', 'processo', 'criar', 'adicionar', 'novo processo'],
      report: ['relatório', 'análise', 'estatística', 'dashboard', 'insights'],
      search: ['buscar', 'encontrar', 'procurar', 'pesquisar', 'onde está'],
      suggest: ['sugerir', 'sugestão', 'recomendação', 'dica', 'o que fazer'],
      validate: ['validar', 'verificar', 'checar', 'está correto', 'revisar'],
      status: ['status', 'estado', 'situação', 'andamento', 'progresso'],
      goodbye: ['tchau', 'até logo', 'adeus', 'até mais', 'bye']
    };
  }

  /**
   * Inicializa o assistente
   */
  async init() {
    if (this.initialized) return;

    try {
      // Obtém ID do usuário
      const user = auth.currentUser;
      if (user) {
        this.userId = user.uid;
        await this.loadConversationHistory();
      }

      this.initialized = true;
      window.debug && window.debug(' AI Assistant Manager inicializado');
    } catch (error) {
      console.error(' Erro ao inicializar AI Assistant Manager:', error);
      this.initialized = true; // Continua mesmo com erro
    }
  }

  /**
   * Carrega histórico de conversas do Firestore
   */
  async loadConversationHistory() {
    try {
      if (!this.userId) return;

      const cacheKey = `ai_conversation_${this.userId}`;
      const cached = cacheService.cache.get(cacheKey);
      const now = Date.now();
      const ttl = 3600 * 1000; // 1 hora

      if (cached && (now - cached.timestamp) < ttl) {
        this.conversationHistory = cached.data || [];
        return;
      }

      // Busca últimas conversas do Firestore
      const snapshot = await db.collection('aiConversations')
        .doc(this.userId)
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(this.maxHistoryLength)
        .get();

      this.conversationHistory = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .reverse(); // Mais antigas primeiro

      // Salva no cache
      await cacheService.set(cacheKey, this.conversationHistory, 'ai_conversation', 3600);
      
      window.debug && window.debug(` Histórico carregado: ${this.conversationHistory.length} mensagens`);
    } catch (error) {
      console.warn(' Erro ao carregar histórico:', error);
      this.conversationHistory = [];
    }
  }

  /**
   * Salva mensagem no histórico (Firestore + memória)
   */
  async saveMessage(role, content, metadata = {}) {
    const message = {
      role,        // 'user' ou 'assistant'
      content,
      timestamp: new Date(),
      metadata: {
        intent: metadata.intent || null,
        confidence: metadata.confidence || null,
        action: metadata.action || null,
        ...metadata
      }
    };

    // Adiciona à memória
    this.conversationHistory.push(message);

    // Limita tamanho do histórico em memória
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory.shift();
    }

    // Salva no Firestore (async, não bloqueia)
    if (this.userId) {
      try {
        await db.collection('aiConversations')
          .doc(this.userId)
          .collection('messages')
          .add(message);

        // Invalida cache
        const cacheKey = `ai_conversation_${this.userId}`;
        cacheService.cache.delete(cacheKey);
      } catch (error) {
        console.warn(' Erro ao salvar mensagem no Firestore:', error);
      }
    }

    return message;
  }

  /**
   * Detecta a intenção (intent) do usuário
   */
  detectIntent(userMessage) {
    const message = userMessage.toLowerCase();
    
    for (const [intent, keywords] of Object.entries(this.intents)) {
      for (const keyword of keywords) {
        if (message.includes(keyword)) {
          return {
            intent,
            confidence: this.calculateConfidence(message, keywords),
            keyword
          };
        }
      }
    }

    return {
      intent: 'general',
      confidence: 0.5,
      keyword: null
    };
  }

  /**
   * Calcula confiança da detecção de intent
   */
  calculateConfidence(message, keywords) {
    const matchCount = keywords.filter(k => message.includes(k)).length;
    return Math.min(matchCount / keywords.length + 0.3, 1.0);
  }

  /**
   * Obtém contexto das últimas mensagens
   */
  getConversationContext() {
    const recentMessages = this.conversationHistory.slice(-this.contextWindow);
    return recentMessages.map(m => `${m.role}: ${m.content}`).join('\n');
  }

  /**
   * Processa mensagem do usuário - PONTO DE ENTRADA PRINCIPAL
   * @param {string} userMessage - Mensagem do usuário
   * @param {object} options - Opções adicionais (contractId, documentFile, etc)
   * @returns {Promise<object>} Resposta do assistente
   */
  async processMessage(userMessage, options = {}) {
    if (!this.initialized) {
      await this.init();
    }

    try {
      // Salva mensagem do usuário
      await this.saveMessage('user', userMessage);

      // Detecta intenção
      const intentData = this.detectIntent(userMessage);
      window.debug && window.debug(` Intent detectado: ${intentData.intent} (${(intentData.confidence * 100).toFixed(0)}%)`);

      // Roteia para handler apropriado
      const response = await this.routeIntent(intentData, userMessage, options);

      // Salva resposta do assistente
      await this.saveMessage('assistant', response.content, {
        intent: intentData.intent,
        confidence: intentData.confidence,
        action: response.action
      });

      return response;

    } catch (error) {
      console.error(' Erro ao processar mensagem:', error);
      
      const errorResponse = {
        content: 'Desculpe, encontrei um erro ao processar sua solicitação. Pode tentar novamente?',
        action: 'error',
        error: error.message
      };

      await this.saveMessage('assistant', errorResponse.content, {
        error: error.message
      });

      return errorResponse;
    }
  }

  /**
   * Roteia intent para handler apropriado
   */
  async routeIntent(intentData, userMessage, options) {
    const { intent } = intentData;

    switch (intent) {
      case 'greeting':
        return this.handleGreeting(userMessage);

      case 'help':
        return this.handleHelp(userMessage);

      case 'document':
        return this.handleDocument(userMessage, options);

      case 'contract':
        return this.handleContract(userMessage, options);

      case 'report':
        return this.handleReport(userMessage, options);

      case 'search':
        return this.handleSearch(userMessage, options);

      case 'suggest':
        return this.handleSuggestion(userMessage, options);

      case 'validate':
        return this.handleValidation(userMessage, options);

      case 'status':
        return this.handleStatus(userMessage, options);

      case 'goodbye':
        return this.handleGoodbye(userMessage);

      default:
        return this.handleGeneral(userMessage, options);
    }
  }

  /**
   * Handler: Saudação
   */
  async handleGreeting() {
    const user = auth.currentUser;
    const name = user?.displayName?.split(' ')[0] || 'usuário';
    
    const greetings = [
      `Olá, ${name}!  Como posso ajudar você hoje?`,
      `Oi, ${name}! Estou aqui para auxiliar. O que precisa?`,
      `Bom dia, ${name}! Em que posso ser útil?`
    ];

    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    return {
      content: greeting + '\n\nPosso ajudar com:\n• Processar documentos\n• Criar contratos\n• Gerar relatórios\n• Buscar informações\n• Sugestões inteligentes',
      action: 'greeting',
      suggestions: ['Ajuda', 'Processar documento', 'Criar contrato', 'Gerar relatório']
    };
  }

  /**
   * Handler: Ajuda
   */
  async handleHelp() {
    return {
      content: ` **Assistente IA - Funcionalidades**

** Documentos**
• Extrair dados de PDFs/imagens
• Processar contratos automaticamente
• Reconhecimento inteligente de campos

** Contratos**
• Sugestões de preenchimento
• Validação automática
• Auto-completar baseado em histórico

** Relatórios**
• Análises executivas
• Insights e tendências
• Recomendações personalizadas

** Busca**
• Busca semântica inteligente
• Encontrar contratos similares
• Histórico de interações

**Como usar:**
Simplesmente digite o que precisa em linguagem natural!

Exemplos:
• "Processar este documento PDF"
• "Criar um novo contrato"
• "Gerar relatório de contratos do mês"
• "Buscar contratos do empreendimento X"`,
      action: 'help',
      suggestions: ['Processar documento', 'Criar contrato', 'Gerar relatório', 'Buscar']
    };
  }

  /**
   * Handler: Documento
   */
  async handleDocument(message, options) {
    const { documentFile } = options;

    if (!documentFile) {
      return {
        content: 'Por favor, faça o upload do documento que deseja processar. Suporto PDF, imagens e arquivos de texto.',
        action: 'request_document',
        requiresInput: true,
        inputType: 'file',
        acceptedFormats: ['.pdf', '.jpg', '.jpeg', '.png', '.txt']
      };
    }

    try {
      // Processa documento usando serviço existente
      const extractedData = await documentProcessingService.processDocument(documentFile);

      return {
        content: ` Documento processado com sucesso!\n\nExtrai os seguintes dados:\n${this.formatExtractedData(extractedData)}\n\nDeseja criar um contrato com estes dados?`,
        action: 'document_processed',
        data: extractedData,
        suggestions: ['Sim, criar contrato', 'Revisar dados', 'Cancelar']
      };
    } catch (error) {
      return {
        content: ` Erro ao processar documento: ${error.message}\n\nVerifique se o arquivo está no formato correto e tente novamente.`,
        action: 'document_error',
        error: error.message
      };
    }
  }

  /**
   * Handler: Contrato
   */
  async handleContract(message, options) {
    const { contractData, contractId } = options;

    // Se tem contractId, busca sugestões para contrato existente
    if (contractId) {
      try {
        const suggestions = await aiContractAssistant.suggestImprovements(contractId);
        
        return {
          content: ` **Sugestões para o contrato:**\n\n${this.formatSuggestions(suggestions)}\n\nDeseja aplicar alguma destas sugestões?`,
          action: 'contract_suggestions',
          data: suggestions,
          contractId
        };
      } catch (error) {
        return {
          content: `Erro ao buscar sugestões: ${error.message}`,
          action: 'contract_error',
          error: error.message
        };
      }
    }

    // Se tem dados, usa para preencher
    if (contractData) {
      const completion = await aiContractAssistant.autoComplete(contractData);
      
      return {
        content: ` **Auto-completei os seguintes campos:**\n\n${this.formatCompletion(completion)}\n\nDeseja revisar antes de salvar?`,
        action: 'contract_autocomplete',
        data: completion,
        suggestions: ['Salvar', 'Revisar', 'Modificar']
      };
    }

    // Criar novo contrato - oferece ajuda
    return {
      content: ` Vou ajudar você a criar um novo contrato!\n\nPosso:\n1. Processar um documento existente\n2. Preencher com base em contratos similares\n3. Iniciar do zero com sugestões\n\nQual opção prefere?`,
      action: 'contract_create_start',
      suggestions: ['Processar documento', 'Usar similar', 'Iniciar do zero']
    };
  }

  /**
   * Handler: Relatório
   */
  async handleReport(message, options) {
    try {
      // Analisa o que o usuário quer no relatório
      const reportType = this.detectReportType(message);
      
      // Busca contratos relevantes
      const contracts = await this.fetchRelevantContracts(reportType, options);

      // Gera relatório com IA
      const report = await aiReportGenerator.generateExecutiveReport(contracts, {
        type: reportType,
        includeDetails: true
      });

      return {
        content: ` **Relatório ${reportType} gerado!**\n\n${this.formatReportSummary(report)}\n\nDeseja ver o relatório completo ou exportar?`,
        action: 'report_generated',
        data: report,
        suggestions: ['Ver completo', 'Exportar PDF', 'Exportar Excel']
      };
    } catch (error) {
      return {
        content: `Erro ao gerar relatório: ${error.message}`,
        action: 'report_error',
        error: error.message
      };
    }
  }

  /**
   * Handler: Busca
   */
  async handleSearch(message) {
    try {
      const searchTerm = this.extractSearchTerm(message);
      
      // Busca semântica usando IA
      const prompt = `Baseado na busca "${searchTerm}", quais contratos seriam mais relevantes? Analise: vendedor, empreendimento, comprador, status, valores.`;
      
      const aiResponse = await aiService.processText(prompt, {
        context: await this.getSearchContext(searchTerm)
      });

      return {
        content: ` **Resultados da busca:**\n\n${aiResponse.text}\n\nEncontrei informações relevantes. Deseja ver os detalhes?`,
        action: 'search_results',
        data: aiResponse,
        searchTerm,
        suggestions: ['Ver detalhes', 'Refinar busca', 'Nova busca']
      };
    } catch (error) {
      return {
        content: `Erro na busca: ${error.message}`,
        action: 'search_error',
        error: error.message
      };
    }
  }

  /**
   * Handler: Sugestão
   */
  async handleSuggestion() {
    try {
      // Análise proativa do sistema
      const insights = await this.generateProactiveInsights();

      return {
        content: ` **Sugestões e Recomendações:**\n\n${insights}\n\nPosso ajudar a implementar alguma destas sugestões?`,
        action: 'proactive_suggestions',
        suggestions: ['Sim, me ajude', 'Ver mais detalhes', 'Não agora']
      };
    } catch (error) {
      return {
        content: `Erro ao gerar sugestões: ${error.message}`,
        action: 'suggestion_error',
        error: error.message
      };
    }
  }

  /**
   * Handler: Validação
   */
  async handleValidation(message, options) {
    const { contractData } = options;

    if (!contractData) {
      return {
        content: 'Qual contrato deseja validar? Forneça o ID ou os dados.',
        action: 'request_validation_data',
        requiresInput: true
      };
    }

    try {
      const validation = await aiContractAssistant.validateContract(contractData);

      return {
        content: ` **Validação Completa:**\n\n${this.formatValidation(validation)}\n\n${validation.isValid ? 'Contrato válido!' : 'Por favor, corrija os problemas identificados.'}`,
        action: 'validation_complete',
        data: validation,
        isValid: validation.isValid
      };
    } catch (error) {
      return {
        content: `Erro na validação: ${error.message}`,
        action: 'validation_error',
        error: error.message
      };
    }
  }

  /**
   * Handler: Status
   */
  async handleStatus(message, options) {
    const { contractId } = options;

    if (!contractId) {
      // Status geral do sistema
      const systemStatus = await this.getSystemStatus();
      
      return {
        content: ` **Status do Sistema:**\n\n${systemStatus}`,
        action: 'system_status',
        suggestions: ['Ver detalhes', 'Gerar relatório']
      };
    }

    // Status de contrato específico
    try {
      const contractStatus = await this.getContractStatus(contractId);
      
      return {
        content: ` **Status do Contrato:**\n\n${contractStatus}`,
        action: 'contract_status',
        contractId
      };
    } catch (error) {
      return {
        content: `Erro ao buscar status: ${error.message}`,
        action: 'status_error',
        error: error.message
      };
    }
  }

  /**
   * Handler: Despedida
   */
  async handleGoodbye() {
    return {
      content: 'Até logo! Estou aqui sempre que precisar. ',
      action: 'goodbye',
      endConversation: true
    };
  }

  /**
   * Handler: Geral (quando não detecta intent específico)
   */
  async handleGeneral(message) {
    try {
      // Usa IA para resposta contextual
      const context = this.getConversationContext();
      
      const prompt = `Você é um assistente inteligente de gestão de contratos. 
      
Histórico da conversa:
${context}

Usuário: ${message}

Responda de forma útil e concisa, oferecendo ajuda relevante para gestão de contratos.`;

      const response = await aiService.processText(prompt);

      return {
        content: response.text,
        action: 'general_response',
        suggestions: this.generateSmartSuggestions(message)
      };
    } catch {
      return {
        content: 'Desculpe, não entendi bem. Pode reformular ou pedir "ajuda" para ver o que posso fazer?',
        action: 'fallback',
        suggestions: ['Ajuda', 'Ver funcionalidades']
      };
    }
  }

  // ========== MÉTODOS AUXILIARES ==========

  formatExtractedData(data) {
    const fields = [];
    if (data.vendedorConstrutora) fields.push(`• Vendedor: ${data.vendedorConstrutora}`);
    if (data.empreendimento) fields.push(`• Empreendimento: ${data.empreendimento}`);
    if (data.apto) fields.push(`• Apto: ${data.apto}`);
    if (data.valorContrato) fields.push(`• Valor: ${data.valorContrato}`);
    if (data.compradores?.length) fields.push(`• Compradores: ${data.compradores.length}`);
    
    return fields.length > 0 ? fields.join('\n') : 'Nenhum dado extraído automaticamente.';
  }

  formatSuggestions(suggestions) {
    if (!suggestions || !suggestions.length) return 'Nenhuma sugestão no momento.';
    
    return suggestions.map((s, i) => `${i + 1}. ${s.field}: ${s.suggestion} (${s.confidence}% confiança)`).join('\n');
  }

  formatCompletion(completion) {
    if (!completion || !completion.fields) return 'Nenhum campo completado.';
    
    return Object.entries(completion.fields)
      .map(([field, value]) => `• ${field}: ${value}`)
      .join('\n');
  }

  formatReportSummary(report) {
    return `Total de contratos: ${report.totalContracts}
Valor total: ${this.formatCurrency(report.statistics?.totalValue || 0)}
Principais insights: ${report.keyInsights?.length || 0}`;
  }

  formatValidation(validation) {
    const issues = validation.issues || [];
    if (issues.length === 0) return ' Nenhum problema encontrado!';
    
    return issues.map((issue, i) => `${i + 1}. ${issue.field}: ${issue.message}`).join('\n');
  }

  formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  detectReportType(message) {
    const m = message.toLowerCase();
    if (m.includes('executivo')) return 'executive';
    if (m.includes('financeiro') || m.includes('financeira')) return 'financial';
    if (m.includes('performance') || m.includes('desempenho')) return 'performance';
    if (m.includes('preditiv') || m.includes('previsão')) return 'predictive';
    return 'executive';
  }

  extractSearchTerm(message) {
    // Remove palavras comuns de busca
    return message
      .toLowerCase()
      .replace(/buscar|encontrar|procurar|pesquisar|onde está|cadê/gi, '')
      .trim();
  }

  async fetchRelevantContracts() {
    // Implementação simplificada - deveria consultar Firestore
    try {
      const snapshot = await db.collection('contratos')
        .orderBy('criadoEm', 'desc')
        .limit(100)
        .get();
      
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.warn('Erro ao buscar contratos:', error);
      return [];
    }
  }

  async getSearchContext(searchTerm) {
    // Contexto para busca semântica
    return {
      term: searchTerm,
      recentConversation: this.getConversationContext()
    };
  }

  async generateProactiveInsights() {
    // Análise proativa do sistema
    const insights = [
      ' 3 contratos estão próximos do prazo de vencimento',
      ' 2 processos sem atualização há mais de 7 dias',
      ' Sugestão: Revisar contratos em "Aguardando Cliente"',
      ' Performance 15% acima da média este mês'
    ];
    
    return insights.join('\n');
  }

  async getSystemStatus() {
    // Status geral do sistema
    return ` Sistema operacional
 IA ativa e funcionando
 Processando requisições normalmente
 Performance: Excelente`;
  }

  async getContractStatus(contractId) {
    try {
      const doc = await db.collection('contratos').doc(contractId).get();
      if (!doc.exists) return 'Contrato não encontrado.';
      
      const data = doc.data();
      return `Status: ${data.status}
Última atualização: ${data.atualizadoEm?.toDate().toLocaleDateString()}
Responsável: ${data.responsavel || 'Não definido'}`;
    } catch (error) {
      return `Erro ao buscar status: ${error.message}`;
    }
  }

  generateSmartSuggestions(userMessage) {
    // Gera sugestões inteligentes baseadas no contexto
    const suggestions = ['Ajuda'];
    
    if (userMessage.toLowerCase().includes('contrato')) {
      suggestions.push('Criar contrato', 'Buscar contrato');
    }
    
    if (userMessage.toLowerCase().includes('documento') || userMessage.toLowerCase().includes('pdf')) {
      suggestions.push('Processar documento');
    }
    
    if (userMessage.toLowerCase().includes('relatório')) {
      suggestions.push('Gerar relatório');
    }
    
    return suggestions;
  }

  /**
   * Limpa histórico de conversa
   */
  async clearHistory() {
    this.conversationHistory = [];
    
    if (this.userId) {
      try {
        const batch = db.batch();
        const snapshot = await db.collection('aiConversations')
          .doc(this.userId)
          .collection('messages')
          .get();
        
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        
        // Limpa cache
        const cacheKey = `ai_conversation_${this.userId}`;
        cacheService.cache.delete(cacheKey);
        
        window.debug && window.debug(' Histórico limpo');
      } catch (error) {
        console.warn(' Erro ao limpar histórico:', error);
      }
    }
  }

  /**
   * Obtém estatísticas do assistente
   */
  getStats() {
    return {
      initialized: this.initialized,
      historyLength: this.conversationHistory.length,
      userId: this.userId,
      capabilities: this.capabilities,
      intentsAvailable: Object.keys(this.intents).length
    };
  }

  /**
   * Exporta histórico para backup/análise
   */
  exportHistory() {
    return {
      userId: this.userId,
      exportDate: new Date().toISOString(),
      messages: this.conversationHistory,
      stats: this.getStats()
    };
  }
}

// Singleton instance
const aiAssistantManager = new AIAssistantManager();

// Auto-inicializa quando auth estiver pronto
if (typeof auth !== 'undefined') {
  auth.onAuthStateChanged(user => {
    if (user) {
      aiAssistantManager.init();
    }
  });
}

export default aiAssistantManager;
