/**
 * @file aiService.js
 * @description Serviço centralizado de IA para integração com múltiplos provedores
 * Suporta: Google AI Studio, OpenAI, Vertex AI (via backend)
 */

import { auth } from './auth.js';
import cacheService from './cacheService.js';

class AIService {
  constructor() {
    this.provider = null;
    this.apiKey = null;
    this.initialized = false;
    this.requestCount = 0;
    this.lastRequestTime = null;
    this.rateLimitDelay = 1000; // 1 segundo entre requisições
    
    this.init();
  }

  /**
   * Inicializa o serviço carregando configurações do localStorage
   */
  init() {
    try {
      this.provider = (localStorage.getItem('AI_PROVIDER') || 'backend').toLowerCase();
      this.apiKey = localStorage.getItem('AI_API_KEY') || '';
      this.initialized = true;
      
      window.debug && window.debug(` AIService inicializado - Provider: ${this.provider}`);
    } catch (error) {
      console.error(' Erro ao inicializar AIService:', error);
      this.provider = 'backend'; // Fallback seguro
      this.initialized = true;
    }
  }

  /**
   * Define o provedor e chave de API
   * @param {string} provider - 'google', 'openai', ou 'backend'
   * @param {string} apiKey - Chave de API (opcional para backend)
   */
  setProvider(provider, apiKey = null) {
    this.provider = provider.toLowerCase();
    this.apiKey = apiKey;
    
    localStorage.setItem('AI_PROVIDER', this.provider);
    if (apiKey) {
      localStorage.setItem('AI_API_KEY', apiKey);
    } else {
      localStorage.removeItem('AI_API_KEY');
    }
    
    window.debug && window.debug(` Provider IA atualizado: ${this.provider}`);
  }

  /**
   * Rate limiting para evitar excesso de requisições
   */
  async enforceRateLimit() {
    if (this.lastRequestTime) {
      const elapsed = Date.now() - this.lastRequestTime;
      if (elapsed < this.rateLimitDelay) {
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - elapsed));
      }
    }
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Processa texto com IA usando o provedor configurado
   * @param {string} prompt - Texto ou prompt para a IA
   * @param {object} options - Opções adicionais
   * @returns {Promise<object>} Resposta da IA
   */
  async processText(prompt, options = {}) {
    if (!this.initialized) {
      this.init();
    }

    await this.enforceRateLimit();

    // Verifica cache primeiro
    const cacheKey = `ai_response_${this.hashString(prompt)}`;
    if (!options.skipCache) {
      const cached = cacheService.cache.get(cacheKey);
      const now = Date.now();
      const ttl = 3600 * 1000; // 1 hora
      if (cached && (now - cached.timestamp) < ttl) {
        window.debug && window.debug(' Resposta IA do cache');
        return cached.data;
      }
    }

    let result;
    const providers = this.getProviderFallbackChain();

    // Tenta cada provedor na cadeia de fallback
    for (const provider of providers) {
      try {
        window.debug && window.debug(` Tentando provider: ${provider}`);
        
        if (provider === 'backend') {
          result = await this.processWithBackend(prompt, options);
        } else if (provider === 'google') {
          result = await this.processWithGoogle(prompt, options);
        } else if (provider === 'openai') {
          result = await this.processWithOpenAI(prompt, options);
        }

        if (result) {
          // Salva no cache
          await cacheService.set(cacheKey, result, 'ai_responses', 3600); // 1 hora
          return result;
        }
      } catch (error) {
        console.warn(` Falha no provider ${provider}:`, error.message);
        // Continua para o próximo provider
      }
    }

    throw new Error('Todos os provedores de IA falharam');
  }

  /**
   * Retorna a cadeia de fallback baseada no provedor principal
   */
  getProviderFallbackChain() {
    const chains = {
      'backend': ['backend', 'google', 'openai'],
      'google': ['google', 'backend', 'openai'],
      'openai': ['openai', 'google', 'backend']
    };
    return chains[this.provider] || chains['backend'];
  }

  /**
   * Processa com Vertex AI via backend (mais seguro)
   */
  async processWithBackend(prompt, options = {}) {
    if (!auth.currentUser) {
      throw new Error('Usuário não autenticado');
    }

    const endpoint = options.endpoint || 'processContractWithAI';
    
    // Usa explicitamente a região southamerica-east1
    const functions = window.firebase.app().functions('southamerica-east1');
    const callable = functions.httpsCallable(endpoint);
    
    try {
      const result = await callable({ text: prompt, ...options });
      return result.data;
    } catch (error) {
      throw new Error(`Backend AI error: ${error.message}`);
    }
  }

  /**
   * Processa com Google AI Studio (cliente)
   */
  async processWithGoogle(prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error('Google AI API key não configurada');
    }

    const { GoogleGenerativeAI } = await import('https://cdn.skypack.dev/@google/generative-ai');
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: options.model || 'gemini-1.5-flash' });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Tenta parsear JSON se possível
    try {
      return JSON.parse(text.replace(/^```json\s*|```\s*$/g, '').trim());
    } catch {
      return { text };
    }
  }

  /**
   * Processa com OpenAI (cliente)
   */
  async processWithOpenAI(prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key não configurada');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: options.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é um assistente especializado em análise de contratos e processos.' },
          { role: 'user', content: prompt }
        ],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content;
    
    // Tenta parsear JSON se possível
    try {
      return JSON.parse(text.replace(/^```json\s*|```\s*$/g, '').trim());
    } catch {
      return { text };
    }
  }

  /**
   * Gera um hash simples para cache
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Extrai dados de contrato de um documento
   */
  async extractContractData(text, options = {}) {
    const isAprovacao = options.extractType === 'aprovacao' || options.documentType === 'formulario_aprovacao';

    if (isAprovacao) {
      const prompt = `Voce e um extrator de dados. Leia o texto OCR de um documento "AVALIACAO DE RISCO - Formulario de Impressao" (Caixa).
Retorne SOMENTE um JSON valido (sem markdown). Use "" ou null quando nao houver dado.

Campos principais:
{
  "cpf": "CPF principal (ou varios separados por /)",
  "cpfs": ["CPF1", "CPF2", "..."],
  "cliente": "nome completo do cliente (ou varios separados por /)",
  "nomesClientes": ["Nome 1", "Nome 2", "..."],
  "cpfParticipante": "CPF do participante (se houver)",
  "participante": "nome do participante (se houver)",
  "dataAprovacao": "DD-MM-YYYY",
  "vencSicaq": "DD-MM-YYYY",
  "validadeInicio": "DD-MM-YYYY",
  "validadeFim": "DD-MM-YYYY",
  "situacao": "APROVADO|REPROVADO|CONDICIONADO",
  "resultadoAvaliacao": "texto do resultado",
  "renda": numero,
  "rendaLiquidaTotal": numero,
  "rendaBrutaTotal": numero,
  "rendaLiquidaProponente": numero,
  "rendaBrutaProponente": numero,
  "rendaLiquidaParticipante": numero,
  "rendaBrutaParticipante": numero,
  "rendaLiquidaInformal": numero,
  "atividadeInformal": "nome da atividade informal",
  "dataInicioInformal": "DD-MM-YYYY",
  "valorImovel": numero,
  "valorFinanciamento": numero,
  "prestacao": numero,
  "prazoMeses": numero,
  "cartaFinanciamento": "MCMV|SBPE",
  "codigoAvaliacao": "codigo",
  "codigoProposta": "codigo",
  "protocoloCadastro": "codigo",
  "agenciaRelacionamento": "codigo ou nome",
  "origemRecurso": "FGTS, etc",
  "modalidade": "modalidade",
  "produto": "produto",
  "indexador": "TR, etc",
  "sistemaAmortizacao": "PRICE, SAC, etc",
  "sistemaOriginador": "sistema",
  "convenio": "codigo do convenio",
  "operadorCCA": "nome do operador",
  "operadorIdentificacao": "identificacao do operador",
  "telefone": "telefone de contato",
  "email": "email",
  "endereco": "endereco completo",
  "municipio": "municipio",
  "uf": "UF",
  "cep": "CEP",
  "bairro": "bairro",
  "logradouro": "logradouro",
  "numero": "numero",
  "complemento": "complemento",
  "dataNascimento": "DD-MM-YYYY",
  "sexo": "sexo",
  "estadoCivil": "estado civil",
  "nacionalidade": "nacionalidade",
  "naturalidade": "naturalidade",
  "nomeMae": "nome da mae",
  "nomePai": "nome do pai"
}

Regras:
- Extraia apenas campos preenchidos no formulario; nao invente.
- "CPF Cliente" + "CPF Participante" devem alimentar cpfs[] e cpf (string com " / "); nomes idem.
- Se houver "Validade dd/mm/aaaa a dd/mm/aaaa", preencha validadeInicio e validadeFim.
- Se a validade aparecer apenas como MM/AAAA, converta para DD-MM-YYYY usando o ultimo dia do mes e use em vencSicaq.
- Quando houver a validade final, use-a em vencSicaq.
- Use validadeInicio como dataAprovacao somente se nao houver outra data de aprovacao explicita.
- Mapear situacao a partir de resultadoAvaliacao: se contiver "APROVADA" => APROVADO; "REPROVADA" => REPROVADO; "CONDICIONADA" => CONDICIONADO.
- Na secao de renda, alguns valores podem vir colados sem separador (ex: "2.484,373.038,49"). Separe corretamente os dois valores.
- Quando houver renda de proponente e participante, calcular rendaBrutaTotal e rendaLiquidaTotal com a soma quando possivel.
- Renda: dar prioridade a renda bruta (rendaBrutaTotal ou soma rendaBrutaProponente + rendaBrutaParticipante). Se nao houver renda bruta, usar renda liquida (rendaLiquidaTotal ou soma rendaLiquidaProponente + rendaLiquidaParticipante). Se houver renda informal e nao houver renda comprovada, usar rendaLiquidaInformal.
- cartaFinanciamento: "MCMV" se produto/origem contiver "MCMV" ou "NPMCMV" ou "FGTS"; "SBPE" se contiver "SBPE"; caso contrario vazio.
- Datas sempre em DD-MM-YYYY.
- Valores monetarios no formato 123456,78 (sem ponto de milhar e sem simbolo de moeda). Prazo em meses inteiro.

TEXTO DO FORMULARIO:
${text}`;

      return await this.processText(prompt, { ...options, endpoint: 'processContractWithAI' });
    }

    const prompt = `Analise o texto abaixo e extraia TODOS os dados possíveis do contrato.
Retorne um JSON com estes campos (use string vazia ou null quando não houver dado):
{
  "workflowId": "nome/tipo do processo (ex: registro, cartório, associativo)",
  "status": "status inicial descrito",
  "vendedorConstrutora": "construtora ou vendedor",
  "empreendimento": "nome do empreendimento",
  "apto": "número do apartamento",
  "bloco": "bloco/torre",
  "nContratoCEF": "número do contrato CEF",
  "dataMinuta": "YYYY-MM-DD",
  "dataAssinatura": "YYYY-MM-DD (data de assinatura do cliente)",
  "valorContrato": número do valor total do contrato (apenas dígitos e separador decimal),
  "entrada": número da entrada se informada,
  "financiamento": número do financiamento se informado,
  "cartorio": "nome do cartório",
  "matriculaImovel": "número da matrícula do imóvel",
  "municipioImovel": "município do imóvel",
  "iptu": "informação de IPTU",
  "formaPagamentoRi": "forma de pagamento do RI",
  "valorDepositoRi": número do depósito do RI,
  "dataEntradaRegistro": "YYYY-MM-DD",
  "protocoloRi": "protocolo do RI",
  "valorITBI": número do ITBI,
  "agencia": "agência responsável",
  "gerente": "nome do gerente",
  "observacoes": "observações relevantes",
  "dataEntrega": "YYYY-MM-DD se houver",
  "compradores": [
    {
      "nome": "nome completo do comprador",
      "cpf": "CPF formatado",
      "email": "email se houver",
      "telefone": "telefone se houver",
      "estadoCivil": "estado civil",
      "filiacaoPai": "nome do pai",
      "filiacaoMae": "nome da mãe",
      "rg": "RG",
      "orgaoExpedidor": "órgão expedidor do RG",
      "nascimento": "YYYY-MM-DD",
      "nacionalidade": "nacionalidade",
      "profissao": "profissão",
      "endereco": "endereço residencial",
      "cidade": "cidade",
      "uf": "UF",
      "cep": "CEP",
      "principal": true (o primeiro sempre principal)
    }
  ]
}

Regras:
- Retorne datas no formato YYYY-MM-DD.
- Para valores monetários, retorne apenas números (sem símbolo de moeda).
- Inclua todos os compradores citados, mantendo o primeiro como principal.

TEXTO DO CONTRATO:
${text}`;

    return await this.processText(prompt, { ...options, endpoint: 'processContractWithAI' });
  }

  /**
   * Gera sugestões para preenchimento de campos
   */
  async suggestFieldValue(fieldName, context = {}) {
    const prompt = `Baseado no contexto fornecido, sugira um valor apropriado para o campo "${fieldName}".
Contexto: ${JSON.stringify(context, null, 2)}

Retorne um JSON com: { "value": "valor sugerido", "confidence": 0.0-1.0, "reasoning": "explicação" }`;

    return await this.processText(prompt, { skipCache: true });
  }

  /**
   * Analisa um contrato e detecta inconsistências
   */
  async analyzeContract(contractData) {
    const prompt = `Analise os dados do contrato abaixo e identifique possíveis inconsistências, erros ou campos que precisam de atenção:

${JSON.stringify(contractData, null, 2)}

Retorne um JSON com:
{
  "inconsistencies": [
    { "field": "nome do campo", "issue": "descrição do problema", "severity": "high|medium|low" }
  ],
  "suggestions": [
    { "field": "nome do campo", "suggestion": "sugestão de correção" }
  ],
  "completeness": 0.0-1.0,
  "overallStatus": "ok|warning|error"
}`;

    return await this.processText(prompt);
  }

  /**
   * Gera um resumo executivo de múltiplos contratos
   */
  async generateContractsSummary(contracts, options = {}) {
    const summary = {
      total: contracts.length,
      valueTotal: contracts.reduce((sum, c) => sum + (c.valorContrato || 0), 0),
      byStatus: {}
    };

    contracts.forEach(c => {
      const status = c.status || 'Sem Status';
      summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
    });

    const prompt = `Analise este resumo de contratos e gere insights relevantes:

${JSON.stringify(summary, null, 2)}

${options.includeDetails ? `Contratos detalhados:\n${JSON.stringify(contracts.slice(0, 10), null, 2)}` : ''}

Retorne um JSON com:
{
  "executiveSummary": "resumo executivo em português",
  "keyInsights": ["insight 1", "insight 2", ...],
  "trends": ["tendência 1", "tendência 2", ...],
  "recommendations": ["recomendação 1", "recomendação 2", ...],
  "riskAreas": ["área de risco 1", ...]
}`;

    return await this.processText(prompt);
  }

  /**
   * Prevê o próximo status baseado em padrões históricos
   */
  async predictNextStatus(contractData, history = []) {
    const prompt = `Baseado nos dados do contrato atual e histórico de mudanças, preveja qual deve ser o próximo status.

Contrato atual:
${JSON.stringify(contractData, null, 2)}

Histórico de mudanças:
${JSON.stringify(history.slice(-5), null, 2)}

Retorne um JSON com:
{
  "suggestedStatus": "nome do status",
  "confidence": 0.0-1.0,
  "reasoning": "explicação da sugestão",
  "estimatedDays": número de dias estimados,
  "alternatives": ["status alternativo 1", "status alternativo 2"]
}`;

    return await this.processText(prompt);
  }

  /**
   * Gera relatório personalizado com análise IA
   */
  async generateReport(contracts, reportConfig) {
    const prompt = `Gere um relatório customizado baseado nas especificações:

Configuração do relatório:
${JSON.stringify(reportConfig, null, 2)}

Dados dos contratos (primeiros 20):
${JSON.stringify(contracts.slice(0, 20), null, 2)}

Total de contratos: ${contracts.length}

Retorne um JSON com:
{
  "title": "título do relatório",
  "summary": "resumo executivo",
  "sections": [
    {
      "title": "título da seção",
      "content": "conteúdo da seção",
      "charts": [{ "type": "bar|line|pie", "data": {}, "label": "legenda" }]
    }
  ],
  "conclusions": "conclusões",
  "recommendations": ["recomendação 1", ...]
}`;

    return await this.processText(prompt);
  }

  /**
   * Melhora a qualidade de um texto usando IA
   * @param {string} text - Texto original
   * @param {object} options - Opções adicionais
   * @returns {Promise<object>} { improvedText: string, changes: string[] }
   */
  async improveText(text, options = {}) {
    if (!text || text.trim().length === 0) {
      throw new Error('Texto vazio não pode ser melhorado');
    }

    const prompt = `Melhore o seguinte texto de anotação/observação profissional, corrigindo:
- Erros gramaticais e ortográficos
- Clareza e objetividade
- Tom profissional adequado

Regras importantes:
- Mantenha o sentido e informações originais intactos
- NÃO adicione informações que não estejam no texto original
- NÃO remova informações importantes
- Retorne em português brasileiro
- Mantenha o texto conciso

Texto original:
${text}

Retorne APENAS um JSON válido (sem markdown) com esta estrutura:
{
  "improvedText": "texto melhorado aqui",
  "changes": ["lista de mudanças realizadas"]
}`;

    try {
      const result = await this.processText(prompt, {
        ...options,
        skipCache: true
      });

      // Valida o resultado
      if (result && typeof result.improvedText === 'string') {
        return result;
      }

      // Se o resultado não tem a estrutura esperada, tenta extrair
      if (result && result.text) {
        try {
          const parsed = JSON.parse(result.text.replace(/^```json\s*|```\s*$/g, '').trim());
          if (parsed.improvedText) return parsed;
        } catch {
          // Se não conseguir parsear, retorna o texto como está
          return { improvedText: text, changes: ['Não foi possível processar'] };
        }
      }

      return { improvedText: text, changes: ['Sem alterações sugeridas'] };
    } catch (error) {
      console.error(' Erro ao melhorar texto com IA:', error);
      throw error;
    }
  }

  /**
   * Limpa o cache de respostas IA
   */
  async clearCache() {
    await cacheService.clearByNamespace('ai_responses');
    window.debug && window.debug(' Cache de IA limpo');
  }

  /**
   * Retorna estatísticas de uso
   */
  getStats() {
    return {
      provider: this.provider,
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
      cacheEnabled: true
    };
  }
}

// Exporta instância singleton
const aiService = new AIService();
export default aiService;

// Expõe globalmente para compatibilidade
window.aiService = aiService;
