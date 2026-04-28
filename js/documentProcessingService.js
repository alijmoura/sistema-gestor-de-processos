/**
 * @file documentProcessingService.js
 * @description Servico para processamento de documentos com IA
 * Extrai dados de PDFs, imagens e textos usando IA
 */

import aiService from './aiService.js';

class DocumentProcessingService {
  constructor() {
    this.supportedFormats = ['pdf', 'txt', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.processingLimits = {
      maxPdfInitialPages: 5,
      maxPdfFinalPages: 3,
      maxCharsPerPdfPage: 4000,
      maxCharsTotal: 22000,
      maxPromptChars: 18000,
      maxRawTextChars: 8000
    };
    this.apiKeys = {
      vertex: null,
      openai: null
    };
  }

  /**
   * Define chave de API para um provedor especifico
   * @param {string} provider - 'vertex' ou 'openai'
   * @param {string} apiKey - Chave de API
   */
  setApiKey(provider, apiKey) {
    if (provider === 'vertex' || provider === 'openai') {
      this.apiKeys[provider] = apiKey;
      window.debug && window.debug(` API Key configurada para ${provider}`);
    }
  }

  /**
   * Verifica se o formato do arquivo e suportado
   * @param {string} filename - Nome do arquivo
   */
  isFormatSupported(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return this.supportedFormats.includes(ext);
  }

  /**
   * Verifica se o tamanho do arquivo e valido
   * @param {number} size - Tamanho em bytes
   */
  isFileSizeValid(size) {
    return size <= this.maxFileSize;
  }

  resolvePositiveInt(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  truncateText(value, maxChars) {
    const text = typeof value === 'string' ? value : String(value || '');
    const safeMax = this.resolvePositiveInt(maxChars, text.length || 1);
    if (text.length <= safeMax) return text;
    return `${text.slice(0, safeMax)}\n\n[texto truncado para performance]`;
  }

  buildAIOptions(options = {}) {
    const aiOptions = { ...options };
    delete aiOptions.includeRawText;
    delete aiOptions.rawTextLimit;
    delete aiOptions.maxPromptChars;
    delete aiOptions.maxCharsTotal;
    delete aiOptions.maxCharsPerPdfPage;
    delete aiOptions.maxPdfInitialPages;
    delete aiOptions.maxPdfFinalPages;
    delete aiOptions.maxImageDimension;
    delete aiOptions.imageQuality;
    return aiOptions;
  }

  formatCpf(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 11) return '';
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }

  parseMonetaryToken(value) {
    if (value === null || value === undefined) return null;
    const cleaned = String(value)
      .replace(/[R$\s]/g, '')
      .replace(/\.(?=\d{3}(?:\D|$))/g, '')
      .replace(/,/g, '.')
      .replace(/[^\d.-]/g, '');
    if (!cleaned) return null;
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }

  extractFallbackDataFromText(text) {
    const source = String(text || '');
    if (!source.trim()) return {};

    const data = {};
    const cpfMatches = source.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g) || [];
    const uniqueCpfs = [...new Set(cpfMatches
      .map((cpf) => this.formatCpf(cpf))
      .filter(Boolean))];
    if (uniqueCpfs.length > 0) {
      data.cpfs = uniqueCpfs;
      data.cpf = uniqueCpfs.join(' / ');
    }

    const nameMatch = source.match(/(?:NOME\s+DO\s+CLIENTE|CLIENTE|PROPONENTE)\s*[:-]\s*([^\n\r]+)/i);
    if (nameMatch?.[1]) {
      data.cliente = nameMatch[1].trim();
    }

    const prazoMatch = source.match(/(\d{1,3})\s*(?:mes|meses)\b/i);
    if (prazoMatch?.[1]) {
      const prazo = Number.parseInt(prazoMatch[1], 10);
      if (Number.isFinite(prazo) && prazo > 0) {
        data.prazoMeses = prazo;
      }
    }

    const dataAprovacaoMatch = source.match(/(?:DATA\s+DE\s+APROVACAO|DATA\s+APROVACAO)\s*[:-]\s*(\d{2}[/.-]\d{2}[/.-]\d{4})/i);
    if (dataAprovacaoMatch?.[1]) {
      data.dataAprovacao = dataAprovacaoMatch[1];
    }

    const vencimentoMatch = source.match(/(?:VALIDADE|VENCIMENTO(?:\s+SICAQ)?)\s*[:-]\s*(\d{2}[/.-]\d{2}[/.-]\d{4})/i);
    if (vencimentoMatch?.[1]) {
      data.vencSicaq = vencimentoMatch[1];
    }

    const rendaMatch = source.match(/(?:RENDA(?:\s+BRUTA|\s+TOTAL|\s+LIQUIDA)?)\s*[:-]?\s*R?\$?\s*([\d.,]+)/i);
    const renda = this.parseMonetaryToken(rendaMatch?.[1]);
    if (renda !== null) {
      data.renda = renda;
    }

    const financiamentoMatch = source.match(/(?:VALOR(?:\s+DO)?\s+FINANCIAMENTO|FINANCIAMENTO)\s*[:-]?\s*R?\$?\s*([\d.,]+)/i);
    const valorFinanciamento = this.parseMonetaryToken(financiamentoMatch?.[1]);
    if (valorFinanciamento !== null) {
      data.valorFinanciamento = valorFinanciamento;
    }

    const upper = source.toUpperCase();
    if (upper.includes('REPROV')) {
      data.situacao = 'REPROVADO';
    } else if (upper.includes('CONDIC')) {
      data.situacao = 'CONDICIONADO';
    } else if (upper.includes('APROV')) {
      data.situacao = 'APROVADO';
    }

    if (upper.includes('SBPE')) {
      data.cartaFinanciamento = 'SBPE';
    } else if (upper.includes('MCMV') || upper.includes('FGTS') || upper.includes('NPMCMV')) {
      data.cartaFinanciamento = 'MCMV';
    }

    return data;
  }

  normalizeLocalParserText(text) {
    return String(text || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\r/g, '\n')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/([A-Za-zÀ-ÿ])Cliente\b/g, '$1 Cliente')
      .replace(/([A-Za-zÀ-ÿ])Participante\b/g, '$1 Participante')
      .replace(/([A-Za-zÀ-ÿ])Produto\b/g, '$1 Produto')
      .replace(/([0-9]),([0-9]{2})([0-9]{1,3}\.)/g, '$1,$2 $3')
      .replace(/([0-9]),([0-9]{2})([A-Za-zÀ-ÿ])/g, '$1,$2 $3')
      .trim();
  }

  normalizePersonName(rawValue) {
    const cleaned = String(rawValue || '')
      .replace(/[^A-Za-zÀ-ÿ\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b(?:FORMULARIO|FORMUL[ÁA]RIO|IMPRESSAO|IMPRESS[ÃA]O|AVALIACAO|AVALIA[CÇ][AÃ]O|RISCO|CLIENTE|CPF|DADOS|PROPONENTE)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return '';

    return cleaned
      .split(' ')
      .filter(Boolean)
      .map((token) => {
        if (token.length <= 2) return token.toUpperCase();
        return `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`;
      })
      .join(' ')
      .trim();
  }

  cleanExtractedText(rawValue, maxLength = 140) {
    const cleaned = String(rawValue || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return '';
    return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
  }

  extractMonetaryValues(text) {
    const source = String(text || '');
    const matches = source.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
    return matches
      .map((token) => ({
        token,
        value: this.parseMonetaryToken(token)
      }))
      .filter((item) => item.value !== null);
  }

  extractLatestMonthYearToken(text) {
    const source = String(text || '');
    const matches = Array.from(source.matchAll(/\b(0?[1-9]|1[0-2])\/(20\d{2})\b/g));
    if (matches.length === 0) return '';

    const latest = matches
      .map((match) => ({
        month: Number(match[1]),
        year: Number(match[2])
      }))
      .sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month))[0];

    return `${String(latest.month).padStart(2, '0')}/${latest.year}`;
  }

  inferCartaFinanciamento(produto, origemRecurso) {
    const ref = `${produto || ''} ${origemRecurso || ''}`.toUpperCase();
    if (ref.includes('SBPE')) return 'SBPE';
    if (ref.includes('MCMV') || ref.includes('NPMCMV') || ref.includes('FGTS')) return 'MCMV';
    return '';
  }

  extractAprovacaoCaixaDataFromText(text) {
    const source = this.normalizeLocalParserText(text);
    if (!source) return {};

    const data = {};
    const upper = source.toUpperCase();
    const cpfMatches = source.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g) || [];
    const uniqueCpfs = [...new Set(cpfMatches
      .map((cpf) => this.formatCpf(cpf))
      .filter(Boolean))];

    if (uniqueCpfs.length > 0) {
      data.cpfs = uniqueCpfs;
      data.cpf = uniqueCpfs.join(' / ');
    }

    const cpfClienteMatch = source.match(/CPF\s+CLIENTE\s+(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i);
    if (cpfClienteMatch?.[1]) {
      const cpfCliente = this.formatCpf(cpfClienteMatch[1]);
      if (cpfCliente) {
        data.cpf = cpfCliente;
        const cpfs = Array.isArray(data.cpfs) ? data.cpfs : [];
        data.cpfs = [...new Set([cpfCliente, ...cpfs])];
      }
    }

    const clienteMatch = source.match(/AVALIA[CÇ][AÃ]O\s+DE\s+RISCO\s+(.+?)\s+CLIENTE\s+CPF\s+CLIENTE/i);
    if (clienteMatch?.[1]) {
      const cliente = this.normalizePersonName(clienteMatch[1]);
      if (cliente) data.cliente = cliente;
    }

    const participanteInlineMatch = source.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\s+([A-ZÀ-Ü\s]{5,}?)\s+CPF\s+PARTICIPANTE/i);
    if (participanteInlineMatch?.[1]) {
      const cpfParticipante = this.formatCpf(participanteInlineMatch[1]);
      if (cpfParticipante) {
        data.cpfParticipante = cpfParticipante;
        const cpfs = Array.isArray(data.cpfs) ? data.cpfs : [];
        data.cpfs = [...new Set([...cpfs, cpfParticipante])];
      }
      const participante = this.normalizePersonName(participanteInlineMatch[2]);
      if (participante) {
        data.participante = participante;
      }
    }

    if (!data.cpfParticipante) {
      const cpfParticipanteMatch = source.match(/CPF\s+PARTICIPANTE\s+(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i);
      if (cpfParticipanteMatch?.[1]) {
        const cpfParticipante = this.formatCpf(cpfParticipanteMatch[1]);
        if (cpfParticipante) {
          data.cpfParticipante = cpfParticipante;
          const cpfs = Array.isArray(data.cpfs) ? data.cpfs : [];
          data.cpfs = [...new Set([...cpfs, cpfParticipante])];
        }
      }
    }

    if (Array.isArray(data.cpfs) && data.cpfs.length > 0) {
      data.cpf = data.cpfs.join(' / ');
    }

    const situacaoMatch = source.match(/AVALIA[CÇ][AÃ]O\s+DE\s+RISCO\s+(APROVADA\s+CONDICIONAL|REPROVADA|APROVADA|CONDICIONADA|APROVADO|REPROVADO|CONDICIONADO)/i);
    const situacaoRef = situacaoMatch?.[1] || upper;
    if (/REPROV/.test(situacaoRef)) {
      data.situacao = 'REPROVADO';
    } else if (/CONDIC/.test(situacaoRef)) {
      data.situacao = 'CONDICIONADO';
    } else if (/APROV/.test(situacaoRef)) {
      data.situacao = 'APROVADO';
    }

    const prazoDirectMatch = source.match(/PRAZO\s*\(?\s*MESES?\s*\)?[^\d]{0,30}(\d{2,3})\b/i);
    const prazoFallbackMatch = source.match(/DADOS\s+DA\s+AVALIA[CÇ][AÃ]O\s+(\d{2,3})\b/i);
    const prazoRaw = prazoDirectMatch?.[1] || prazoFallbackMatch?.[1];
    if (prazoRaw) {
      const prazo = Number.parseInt(prazoRaw, 10);
      if (Number.isFinite(prazo) && prazo > 0 && prazo <= 600) {
        data.prazoMeses = prazo;
      }
    }

    const prestacaoMatch = source.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*PRESTA[CÇ][AÃ]O/i);
    const prestacao = this.parseMonetaryToken(prestacaoMatch?.[1]);
    if (prestacao !== null) {
      data.prestacao = prestacao;
    }

    const financialWindowMatch = source.match(/PRAZO\s*\(?\s*MESES?\s*\)?([\s\S]{0,260})ORIGEM\s+DE\s+RECURSO/i)
      || source.match(/MODALIDADE([\s\S]{0,320})ORIGEM\s+DE\s+RECURSO/i);
    const financialWindow = financialWindowMatch?.[1] || '';
    const monetaryWindowValues = this.extractMonetaryValues(financialWindow).map((item) => item.value);
    if (monetaryWindowValues.length >= 2) {
      data.valorImovel = monetaryWindowValues[0];
      data.valorFinanciamento = monetaryWindowValues[1];
    } else if (monetaryWindowValues.length === 1) {
      data.valorFinanciamento = monetaryWindowValues[0];
    }

    const priceCodeMatch = financialWindow.match(/PRICE\s+(\d{8,14})/i)
      || source.match(/(?:C[ÓO]DIGO\s+AVALIA[CÇ][AÃ]O|PRICE)\s*(\d{8,14})/i);
    if (priceCodeMatch?.[1]) {
      data.codigoAvaliacao = priceCodeMatch[1];
    }

    const codigoPropostaMatch = source.match(/(?:FGTS|SBPE|MCMV|NPMCMV)\s+(\d{6,14})\s+SISTEMA\s+DE\s+AMORTIZA[CÇ][AÃ]O/i)
      || source.match(/C[ÓO]DIGO\s+PROPOSTA[^\d]{0,30}(\d{6,14})/i);
    if (codigoPropostaMatch?.[1]) {
      data.codigoProposta = codigoPropostaMatch[1];
    }

    const protocoloMatch = source.match(/PROTOCOLO\s+DO\s+CADASTRO\s+(\d{6,14})/i);
    if (protocoloMatch?.[1]) {
      data.protocoloCadastro = protocoloMatch[1];
    }

    const agenciaMatch = source.match(/AG[ÊE]NCIA\s+DE\s+RELACIONAMENTO\s+(\d{2,8})/i);
    if (agenciaMatch?.[1]) {
      data.agenciaRelacionamento = agenciaMatch[1];
    }

    const origemMatch = source.match(
      /ORIGEM\s+DE\s+RECURSO\s+(.+?)(?:\s+PRODUTO\b|\s+VALOR\s+DO\s+IM[ÓO]VEL|\s+SISTEMA\s+ORIGINADOR|\s+DADOS\s+DA\s+AVALIA[CÇ][AÃ]O)/i
    );
    if (origemMatch?.[1]) {
      data.origemRecurso = this.cleanExtractedText(origemMatch[1]);
    }

    const produtoMatch = source.match(/PRESTA[CÇ][AÃ]O\s+([A-Z]{3,20})\s+\d{6,14}/i)
      || source.match(/\b(FGTS|SBPE|MCMV|NPMCMV)\b/i);
    if (produtoMatch?.[1]) {
      data.produto = this.cleanExtractedText(produtoMatch[1], 24).toUpperCase();
    }

    const carta = this.inferCartaFinanciamento(data.produto, data.origemRecurso);
    if (carta) {
      data.cartaFinanciamento = carta;
    }

    const validadeRangeMatch = source.match(
      /VALIDADE[^\d]{0,25}(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s*(?:A|ATE|-)\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i
    );
    if (validadeRangeMatch?.[1] && validadeRangeMatch?.[2]) {
      data.validadeInicio = validadeRangeMatch[1];
      data.validadeFim = validadeRangeMatch[2];
      data.vencSicaq = validadeRangeMatch[2];
    } else {
      const validadeSingleMatch = source.match(
        /VALIDADE[^\d]{0,25}(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}\/\d{4})/i
      );
      if (validadeSingleMatch?.[1]) {
        data.vencSicaq = validadeSingleMatch[1];
      } else {
        const latestMonthYear = this.extractLatestMonthYearToken(source);
        if (latestMonthYear) {
          data.vencSicaq = latestMonthYear;
        }
      }
    }

    const rendaSectionMatch = source.match(/RENDA([\s\S]{0,1800})OBSERVA[CÇ][AÃ]O/i);
    const rendaScope = rendaSectionMatch?.[1] || '';
    const rendaValues = this.extractMonetaryValues(rendaScope)
      .map((item) => item.value)
      .filter((value) => typeof value === 'number' && value > 0);

    if (rendaValues.length > 0) {
      const sorted = [...rendaValues].sort((a, b) => b - a);
      const hasParticipanteSection = /PARTICIPANTE/i.test(rendaScope);
      if (hasParticipanteSection && sorted.length >= 2) {
        const rendaConsolidada = Number((sorted[0] + sorted[1]).toFixed(2));
        data.renda = rendaConsolidada;
        data.rendaBrutaTotal = rendaConsolidada;
        data.rendaLiquidaTotal = sorted[1];
      } else {
        data.renda = sorted[0];
        data.rendaBrutaTotal = sorted[0];
        if (sorted.length >= 2) {
          data.rendaLiquidaTotal = sorted[1];
        }
      }
    }

    return data;
  }

  /**
   * Processa um formulario de aprovacao localmente sem uso de IA
   * @param {File} file - Arquivo para processar
   * @param {object} options - Opcoes de processamento
   * @returns {Promise<object>} Dados extraidos localmente
   */
  async processAprovacaoFileLocally(file, options = {}) {
    if (!this.isFormatSupported(file.name)) {
      throw new Error(`Formato nao suportado: ${file.name}`);
    }

    if (!this.isFileSizeValid(file.size)) {
      throw new Error(`Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(2)}MB (maximo: 10MB)`);
    }

    const ext = file.name.split('.').pop().toLowerCase();
    let text = '';

    try {
      if (ext === 'pdf') {
        text = await this.extractTextFromPDF(file, options);
      } else if (ext === 'txt') {
        text = await this.extractTextFromTXT(file);
      } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
        throw new Error('Preenchimento local sem IA suporta apenas PDF ou TXT no momento.');
      } else {
        throw new Error(`Formato nao implementado para parser local: ${ext}`);
      }

      if (!text || text.trim().length === 0) {
        throw new Error('Nenhum texto foi extraido do documento');
      }

      const maxCharsTotal = this.resolvePositiveInt(options.maxCharsTotal, this.processingLimits.maxCharsTotal);
      const maxRawTextChars = this.resolvePositiveInt(options.rawTextLimit, this.processingLimits.maxRawTextChars);
      const parserText = this.truncateText(text, maxCharsTotal);
      const rawText = options.includeRawText ? this.truncateText(text, maxRawTextChars) : undefined;

      const caixaData = this.extractAprovacaoCaixaDataFromText(parserText);
      const fallbackData = this.extractFallbackDataFromText(parserText);
      const mergedData = {
        ...fallbackData,
        ...caixaData
      };

      const mergedCpfs = [...new Set([
        ...(Array.isArray(fallbackData.cpfs) ? fallbackData.cpfs : []),
        ...(Array.isArray(caixaData.cpfs) ? caixaData.cpfs : [])
      ])];
      if (mergedCpfs.length > 0) {
        mergedData.cpfs = mergedCpfs;
        mergedData.cpf = mergedCpfs.join(' / ');
      }

      text = '';

      return {
        success: true,
        data: this.normalizeExtractedData(mergedData),
        rawText,
        metadata: {
          filename: file.name,
          filesize: file.size,
          processedAt: new Date().toISOString(),
          provider: 'local_parser',
          fallbackUsed: true,
          parser: 'caixa_aprovacao_v1'
        }
      };
    } catch (error) {
      console.error('[DocumentProcessingService][LocalParser] Erro ao processar arquivo localmente:', error);
      return {
        success: false,
        error: error.message,
        metadata: {
          filename: file.name,
          filesize: file.size,
          processedAt: new Date().toISOString(),
          provider: 'local_parser',
          fallbackUsed: true
        }
      };
    }
  }

  /**
   * Extrai texto de um arquivo PDF usando PDF.js
   * @param {File} file - Arquivo PDF
   * @param {object} options - Opcoes de processamento
   * @returns {Promise<string>} Texto extraido
   */
  async extractTextFromPDF(file, options = {}) {
    let pdf = null;

    try {
      if (typeof pdfjsLib === 'undefined') {
        const maxWait = 5000;
        const startTime = Date.now();

        while (typeof pdfjsLib === 'undefined' && (Date.now() - startTime) < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (typeof pdfjsLib === 'undefined') {
          throw new Error('PDF.js nao esta disponivel. Verifique se o script foi carregado.');
        }
      }

      let arrayBuffer = await file.arrayBuffer();
      pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      arrayBuffer = null;

      let fullText = '';
      const maxCharsPerPage = this.resolvePositiveInt(options.maxCharsPerPdfPage, this.processingLimits.maxCharsPerPdfPage);
      const maxCharsTotal = this.resolvePositiveInt(options.maxCharsTotal, this.processingLimits.maxCharsTotal);
      const initialPages = this.resolvePositiveInt(options.maxPdfInitialPages, this.processingLimits.maxPdfInitialPages);
      const finalPages = this.resolvePositiveInt(options.maxPdfFinalPages, this.processingLimits.maxPdfFinalPages);

      const totalPages = pdf.numPages;
      const pagesToProcess = [];

      for (let i = 1; i <= Math.min(initialPages, totalPages); i++) {
        pagesToProcess.push(i);
      }

      if (totalPages > initialPages) {
        for (let i = Math.max(initialPages + 1, totalPages - finalPages + 1); i <= totalPages; i++) {
          if (!pagesToProcess.includes(i)) {
            pagesToProcess.push(i);
          }
        }
      }

      window.debug && window.debug(` Processando ${pagesToProcess.length} paginas do PDF`);

      for (const pageNum of pagesToProcess) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        const clippedPageText = this.truncateText(pageText, maxCharsPerPage);
        fullText += `\n--- Pagina ${pageNum} ---\n${clippedPageText}\n`;

        if (typeof page.cleanup === 'function') {
          page.cleanup();
        }

        if (fullText.length >= maxCharsTotal) {
          fullText = this.truncateText(fullText, maxCharsTotal);
          break;
        }
      }

      return fullText;
    } catch (error) {
      console.error('Erro ao extrair texto do PDF:', error);
      throw new Error(`Falha ao processar PDF: ${error.message}`);
    } finally {
      if (pdf) {
        try {
          if (typeof pdf.cleanup === 'function') {
            pdf.cleanup();
          }
          if (typeof pdf.destroy === 'function') {
            pdf.destroy();
          }
        } catch (cleanupError) {
          window.debug && window.debug('Erro no cleanup do PDF:', cleanupError);
        }
      }
    }
  }

  /**
   * Extrai texto de um arquivo de texto simples
   * @param {File} file - Arquivo de texto
   * @returns {Promise<string>} Texto extraido
   */
  async extractTextFromTXT(file) {
    return await file.text();
  }

  /**
   * Extrai texto de uma imagem usando OCR (via IA)
   * @param {File} file - Arquivo de imagem
   * @param {object} options - Opcoes de processamento
   * @returns {Promise<string>} Texto extraido
   */
  async extractTextFromImage(file, options = {}) {
    const base64 = await this.fileToBase64(file, options);

    const prompt = `Extraia todo o texto visivel desta imagem de contrato.
Retorne apenas o texto extraido, mantendo a formatacao e estrutura original.`;

    const result = await aiService.processText(prompt, {
      image: base64,
      skipCache: true
    });

    return result.text || '';
  }

  /**
   * Converte arquivo para base64.
   * Para imagem, reduz resolucao quando necessario para diminuir uso de memoria.
   * @param {File} file - Arquivo
   * @param {object} options - Opcoes de processamento
   * @returns {Promise<string>} String base64
   */
  async fileToBase64(file, options = {}) {
    const isImageFile = typeof file?.type === 'string' && file.type.startsWith('image/');
    if (isImageFile && typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
      try {
        const bitmap = await createImageBitmap(file);
        const maxDimension = this.resolvePositiveInt(options.maxImageDimension, 1600);
        const quality = Number.isFinite(Number(options.imageQuality)) ? Number(options.imageQuality) : 0.82;
        const largestSide = Math.max(bitmap.width, bitmap.height);

        if (largestSide > maxDimension) {
          const scale = maxDimension / largestSide;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const ctx = canvas.getContext('2d');

          if (ctx) {
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close();

            const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
            const dataUrl = outputType === 'image/png'
              ? canvas.toDataURL(outputType)
              : canvas.toDataURL(outputType, quality);
            canvas.width = 0;
            canvas.height = 0;
            return dataUrl.split(',')[1];
          }
          bitmap.close();
        } else {
          bitmap.close();
        }
      } catch (resizeError) {
        window.debug && window.debug('Falha ao otimizar imagem para OCR:', resizeError);
      }
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Processa um arquivo e extrai dados estruturados
   * @param {File} file - Arquivo para processar
   * @param {object} options - Opcoes de processamento
   * @returns {Promise<object>} Dados extraidos
   */
  async processFile(file, options = {}) {
    if (!this.isFormatSupported(file.name)) {
      throw new Error(`Formato nao suportado: ${file.name}`);
    }

    if (!this.isFileSizeValid(file.size)) {
      throw new Error(`Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(2)}MB (maximo: 10MB)`);
    }

    window.debug && window.debug(` Processando arquivo: ${file.name} (${(file.size / 1024).toFixed(2)}KB)`);

    try {
      let text = '';
      const ext = file.name.split('.').pop().toLowerCase();

      if (ext === 'pdf') {
        text = await this.extractTextFromPDF(file, options);
      } else if (ext === 'txt') {
        text = await this.extractTextFromTXT(file);
      } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
        text = await this.extractTextFromImage(file, options);
      } else {
        throw new Error('Formato nao implementado ainda');
      }

      if (!text || text.trim().length === 0) {
        throw new Error('Nenhum texto foi extraido do documento');
      }

      const maxPromptChars = this.resolvePositiveInt(options.maxPromptChars, this.processingLimits.maxPromptChars);
      const maxRawTextChars = this.resolvePositiveInt(options.rawTextLimit, this.processingLimits.maxRawTextChars);
      const textForAI = this.truncateText(text, maxPromptChars);
      const rawText = options.includeRawText ? this.truncateText(text, maxRawTextChars) : undefined;

      window.debug && window.debug(` Texto extraido: ${textForAI.length} caracteres (limite aplicado)`);

      let extractedData = null;
      let fallbackInfo = null;
      try {
        extractedData = await aiService.extractContractData(textForAI, this.buildAIOptions(options));
      } catch (aiError) {
        const fallbackData = this.extractFallbackDataFromText(textForAI);
        const shouldFallbackForAprovacao = options.extractType === 'aprovacao'
          || options.documentType === 'formulario_aprovacao';

        if (Object.keys(fallbackData).length > 0 || shouldFallbackForAprovacao) {
          extractedData = fallbackData;
          fallbackInfo = {
            reason: aiError?.message || 'Todos os provedores de IA falharam'
          };
          console.warn('[DocumentProcessingService] IA indisponivel, usando extracao local de fallback:', fallbackInfo.reason);
        } else {
          throw aiError;
        }
      }
      text = '';

      const normalizedData = this.normalizeExtractedData(extractedData);

      return {
        success: true,
        data: normalizedData,
        rawText,
        metadata: {
          filename: file.name,
          filesize: file.size,
          processedAt: new Date().toISOString(),
          provider: fallbackInfo ? 'local_fallback' : aiService.provider,
          fallbackUsed: Boolean(fallbackInfo),
          fallbackReason: fallbackInfo?.reason || null
        }
      };
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      return {
        success: false,
        error: error.message,
        metadata: {
          filename: file.name,
          filesize: file.size,
          processedAt: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Normaliza dados extraidos pela IA
   * @param {object} data - Dados brutos da IA
   * @returns {object} Dados normalizados
   */
  normalizeExtractedData(data) {
    if (!data) return {};

    const payload = (
      data?.data
      && typeof data.data === 'object'
      && !Array.isArray(data.data)
    )
      ? data.data
      : data;

    const normalized = { ...payload };

    if (
      typeof normalized.text === 'string'
      && Object.keys(normalized).length === 1
    ) {
      return {};
    }

    const splitCandidates = (value) => String(value || '')
      .split(/\s*\/\s*|\s+\be\b\s+/i)
      .map((item) => item.trim())
      .filter(Boolean);

    if ((!normalized.vendedorConstrutora || !String(normalized.vendedorConstrutora).trim())) {
      normalized.vendedorConstrutora = normalized.construtora
        || normalized.vendedor
        || normalized.imobiliaria
        || normalized.empresa
        || normalized.vendedorConstrutora;
    }

    if ((!normalized.clientePrincipal || !String(normalized.clientePrincipal).trim())) {
      if (Array.isArray(normalized.nomesClientes) && normalized.nomesClientes.length > 0) {
        normalized.clientePrincipal = normalized.nomesClientes[0];
      } else if (normalized.cliente) {
        normalized.clientePrincipal = splitCandidates(normalized.cliente)[0] || normalized.cliente;
      }
    }

    if ((!normalized.clienteConjuge || !String(normalized.clienteConjuge).trim())) {
      if (Array.isArray(normalized.nomesClientes) && normalized.nomesClientes.length > 1) {
        normalized.clienteConjuge = normalized.nomesClientes[1];
      } else if (normalized.participante) {
        normalized.clienteConjuge = normalized.participante;
      } else if (normalized.cliente) {
        normalized.clienteConjuge = splitCandidates(normalized.cliente)[1] || '';
      }
    }

    if ((!normalized.cpfCliente || !String(normalized.cpfCliente).trim())) {
      if (Array.isArray(normalized.cpfs) && normalized.cpfs.length > 0) {
        normalized.cpfCliente = normalized.cpfs[0];
      } else if (normalized.cpf) {
        normalized.cpfCliente = splitCandidates(normalized.cpf)[0] || normalized.cpf;
      }
    }

    if ((!normalized.cpfParticipante || !String(normalized.cpfParticipante).trim())) {
      if (Array.isArray(normalized.cpfs) && normalized.cpfs.length > 1) {
        normalized.cpfParticipante = normalized.cpfs[1];
      } else if (normalized.cpf) {
        normalized.cpfParticipante = splitCandidates(normalized.cpf)[1] || '';
      }
    }

    if ((!normalized.apto || !String(normalized.apto).trim())) {
      normalized.apto = normalized.unidade || normalized.apartamento || normalized.lote || normalized.apto;
    }

    if ((!normalized.bloco || !String(normalized.bloco).trim())) {
      normalized.bloco = normalized.torre || normalized.quadra || normalized.bloco;
    }

    const dateFields = [
      'dataAssinatura',
      'dataEntrega',
      'dataMinuta',
      'dataEntradaRegistro',
      'entrada',
      'dataEntrada',
      'dataAprovacao',
      'validadeInicio',
      'validadeFim',
      'dataInicioInformal',
      'dataNascimento'
    ];
    dateFields.forEach(field => {
      if (normalized[field]) {
        normalized[field] = this.normalizeDate(normalized[field]);
      }
    });

    const numericFields = [
      'valorContrato',
      'entrada',
      'financiamento',
      'saldoReceber',
      'valorDepositoRi',
      'valorITBI',
      'renda',
      'valorFinanciamento',
      'prazoMeses',
      'valorImovel',
      'prestacao',
      'rendaLiquidaTotal',
      'rendaBrutaTotal',
      'rendaLiquidaProponente',
      'rendaBrutaProponente',
      'rendaLiquidaParticipante',
      'rendaBrutaParticipante',
      'rendaLiquidaInformal'
    ];
    numericFields.forEach(field => {
      if (normalized[field]) {
        normalized[field] = this.normalizeNumber(normalized[field]);
      }
    });

    if (Array.isArray(normalized.compradores)) {
      normalized.compradores = normalized.compradores.map((comprador) => {
        const buyer = { ...comprador };
        if (buyer.nascimento) {
          buyer.nascimento = this.normalizeDate(buyer.nascimento);
        }
        return buyer;
      });
    }

    if (!normalized.compradores || normalized.compradores.length === 0) {
      const compradores = [];
      const nomesClientes = Array.isArray(normalized.nomesClientes)
        ? normalized.nomesClientes.map((nome) => String(nome || '').trim()).filter(Boolean)
        : [];
      const cpfs = Array.isArray(normalized.cpfs)
        ? normalized.cpfs.map((cpf) => this.formatCpf(cpf)).filter(Boolean)
        : [];

      if (nomesClientes.length > 0) {
        nomesClientes.forEach((nome, index) => {
          compradores.push({
            nome,
            cpf: cpfs[index] || '',
            email: '',
            telefone: '',
            principal: index === 0
          });
        });
      }

      if (compradores.length === 0 && normalized.clientePrincipal) {
        compradores.push({
          nome: normalized.clientePrincipal,
          cpf: normalized.cpfCliente || '',
          email: '',
          telefone: '',
          principal: true
        });
      }

      if (compradores.length <= 1 && normalized.clienteConjuge) {
        compradores.push({
          nome: normalized.clienteConjuge,
          cpf: normalized.cpfParticipante || '',
          email: '',
          telefone: '',
          principal: false
        });
      }

      if (compradores.length > 0) {
        normalized.compradores = compradores;
      }
    }

    Object.keys(normalized).forEach(key => {
      if (key === 'compradores') return;
      if (normalized[key] === null || normalized[key] === undefined || normalized[key] === '') {
        delete normalized[key];
      }
    });

    return normalized;
  }

  /**
   * Normaliza uma data para o formato YYYY-MM-DD
   * @param {string|Date} date - Data em qualquer formato
   * @returns {string|null} Data normalizada
   */
  normalizeDate(date) {
    if (!date) return null;

    try {
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date;
      }

      if (typeof date === 'string' && /^\d{2}[/.-]\d{2}[/.-]\d{4}$/.test(date)) {
        const parts = date.split(/[/.-]/);
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        if (day > 0 && day <= 31 && month > 0 && month <= 12 && year > 1900) {
          const normalized = new Date(year, month - 1, day);
          if (!Number.isNaN(normalized.getTime())) {
            return normalized.toISOString().split('T')[0];
          }
        }
      }

      const d = new Date(date);
      if (Number.isNaN(d.getTime())) {
        return null;
      }

      return d.toISOString().split('T')[0];
    } catch (error) {
      window.debug && window.debug(` Erro ao normalizar data: ${date}`, error);
      return null;
    }
  }

  /**
   * Normaliza um numero removendo formatacao
   * @param {string|number} value - Valor em qualquer formato
   * @returns {number} Numero normalizado
   */
  normalizeNumber(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;

    try {
      const cleaned = String(value)
        .replace(/[R$\s]/g, '')
        .replace(/\./g, '')
        .replace(/,/g, '.');

      const number = parseFloat(cleaned);
      return Number.isNaN(number) ? 0 : number;
    } catch (error) {
      window.debug && window.debug(' Erro ao normalizar numero', error);
      return 0;
    }
  }

  /**
   * Processa multiplos arquivos em lote
   * @param {File[]} files - Array de arquivos
   * @param {object} options - Opcoes de processamento
   * @returns {Promise<object[]>} Array de resultados
   */
  async processMultipleFiles(files, options = {}) {
    const results = [];

    for (const file of files) {
      try {
        const result = await this.processFile(file, options);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          metadata: { filename: file.name }
        });
      }
    }

    return results;
  }

  /**
   * Valida dados extraidos
   * @param {object} data - Dados para validar
   * @returns {object} Resultado da validacao
   */
  async validateExtractedData(data) {
    return await aiService.analyzeContract(data);
  }

  /**
   * Gera sugestoes para campos vazios
   * @param {object} partialData - Dados parciais do contrato
   * @returns {Promise<object>} Sugestoes de preenchimento
   */
  async suggestMissingFields(partialData) {
    const missingFields = [];
    const requiredFields = [
      'clientePrincipal', 'vendedorConstrutora', 'empreendimento',
      'valorContrato', 'dataAssinatura'
    ];

    requiredFields.forEach(field => {
      if (!partialData[field]) {
        missingFields.push(field);
      }
    });

    if (missingFields.length === 0) {
      return { complete: true, suggestions: {} };
    }

    const suggestions = {};
    for (const field of missingFields) {
      try {
        const suggestion = await aiService.suggestFieldValue(field, partialData);
        suggestions[field] = suggestion;
      } catch (error) {
        console.warn(`Falha ao gerar sugestao para ${field}:`, error);
      }
    }

    return {
      complete: false,
      missingFields,
      suggestions
    };
  }
}

const documentProcessingService = new DocumentProcessingService();
export default documentProcessingService;

window.documentProcessingService = documentProcessingService;
