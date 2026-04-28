/**
 * @file csvImportValidatorService.js
 * @description Serviço de validação e análise de arquivos CSV para importação de contratos.
 *
 * Responsabilidades:
 * - Detectar delimitador e fazer parsing robusto do CSV
 * - Mapear cabeçalhos CSV para campos do Firestore
 * - Converter datas (BR e ISO) e valores monetários
 * - Agrupar compradores por índice
 * - Fornecer preview, validação e dados prontos para importação
 */

// ===========================================================================
// MAPEAMENTO DE CABEÇALHOS CSV -> CAMPOS FIRESTORE
// ===========================================================================

const HEADER_FIELD_MAP = {
  // Identidade
  id: 'id',

  // Dados principais
  status: 'status',
  entrada: 'entrada',
  analista: 'analista',
  empreendimento: 'empreendimento',
  apto: 'apto',
  bloco: 'bloco',

  // Vendedor / Construtora
  vendedorconstrutora: 'vendedorConstrutora',
  'vendedor/construtora': 'vendedorConstrutora',
  vendedor: 'vendedorConstrutora',
  construtora: 'vendedorConstrutora',

  // Agência / Banco
  agencia: 'agencia',
  'agência': 'agencia',
  gerente: 'gerente',
  corretor: 'corretor',

  // Contratos e Registro
  ncontratocef: 'nContratoCEF',
  'nº contrato cef': 'nContratoCEF',
  'n contrato cef': 'nContratoCEF',
  'numero contrato cef': 'nContratoCEF',
  'número contrato cef': 'nContratoCEF',
  cartorio: 'cartorio',
  'cartório': 'cartorio',
  iptu: 'iptu',
  matriculaimovel: 'matriculaImovel',
  'matricula imovel': 'matriculaImovel',
  municipioimovel: 'municipioImovel',
  'municipio imovel': 'municipioImovel',
  protocolori: 'protocoloRi',
  'protocolo ri': 'protocoloRi',
  'protocolo do ri': 'protocoloRi',
  formapagamentori: 'formaPagamentoRi',
  'forma pagamento ri': 'formaPagamentoRi',
  'forma de pagamento ri': 'formaPagamentoRi',

  // Datas de Registro/Minuta
  dataminuta: 'dataMinuta',
  'data minuta': 'dataMinuta',
  dataassinaturacliente: 'dataAssinaturaCliente',
  'data assinatura cliente': 'dataAssinaturaCliente',
  'data de assinatura do cliente': 'dataAssinaturaCliente',
  dataentradaregistro: 'dataEntradaRegistro',
  'data entrada registro': 'dataEntradaRegistro',
  'data entrada cartorio': 'dataEntradaRegistro',
  'data entrada cartório': 'dataEntradaRegistro',
  dataanaliseregistro: 'dataAnaliseRegistro',
  'data analise registro': 'dataAnaliseRegistro',
  dataprevistaregistro: 'dataPrevistaRegistro',
  'data prevista registro': 'dataPrevistaRegistro',
  dataretornori: 'dataRetornoRi',
  'data retorno ri': 'dataRetornoRi',
  dataretiradacontratoregistrado: 'dataRetiradaContratoRegistrado',
  'data retirada contrato registrado': 'dataRetiradaContratoRegistrado',
  'data contrato registrado': 'dataRetiradaContratoRegistrado',

  // ITBI
  solicitaitbi: 'solicitaITBI',
  'solicita itbi': 'solicitaITBI',
  retiradaitbi: 'retiradaITBI',
  'retirada itbi': 'retiradaITBI',
  valoritbi: 'valorITBI',
  'valor itbi': 'valorITBI',
  enviadopgtoitbi: 'enviadoPgtoItbi',
  'enviado pgto itbi': 'enviadoPgtoItbi',
  retornopgtoitbi: 'retornoPgtoItbi',
  'retorno pgto itbi': 'retornoPgtoItbi',

  // Funrejus
  valorfunrejus: 'valorFunrejus',
  'valor funrejus': 'valorFunrejus',
  datasolicitacaofunrejus: 'dataSolicitacaoFunrejus',
  'data solicitacao funrejus': 'dataSolicitacaoFunrejus',
  dataemissaofunrejus: 'dataEmissaoFunrejus',
  'data emissao funrejus': 'dataEmissaoFunrejus',
  funrejusenviadopgto: 'funrejusEnviadoPgto',
  'funrejus enviado pgto': 'funrejusEnviadoPgto',
  funrejusretornopgto: 'funrejusRetornoPgto',
  'funrejus retorno pgto': 'funrejusRetornoPgto',

  // Valores financeiros
  valorfinalri: 'valorFinalRi',
  'valor final ri': 'valorFinalRi',
  valordepositori: 'valorDepositoRi',
  'valor deposito ri': 'valorDepositoRi',
  'valor depósito ri': 'valorDepositoRi',
  valorcontrato: 'valorContrato',
  'valor contrato': 'valorContrato',
  subsidio: 'subsidio',
  'subsídio': 'subsidio',
  valordespachante: 'valorDespachante',
  'valor despachante': 'valorDespachante',

  // CEHOP / Cohapar
  analistacehop: 'analistaCehop',
  'analista cehop': 'analistaCehop',
  analistaaprovacao: 'analistaAprovacao',
  'analista aprovacao': 'analistaAprovacao',
  entreguecehop: 'entregueCehop',
  entregue_cehop: 'entregueCehop',
  'entregue cehop': 'entregueCehop',
  entregue: 'entregueCehop',
  conformeem: 'conformeEm',
  'conforme em': 'conformeEm',
  dataconformidadecehop: 'dataConformidadeCehop',
  'data conformidade cehop': 'dataConformidadeCehop',
  solicitacaocohapar: 'solicitacaoCohapar',
  'solicitacao cohapar': 'solicitacaoCohapar',
  cohaparaprovada: 'cohaparAprovada',
  'cohapar aprovada': 'cohaparAprovada',
  cartacohapar: 'cartaCohapar',
  'carta cohapar': 'cartaCohapar',

  // Certificação
  certificadora: 'certificadora',
  certificacaosolicsem: 'certificacaoSolicEm',
  'certificacao solic em': 'certificacaoSolicEm',
  certificacaorealizadaem: 'certificacaoRealizadaEm',
  'certificacao realizada em': 'certificacaoRealizadaEm',

  // Envio/Retorno
  enviadovendedor: 'enviadoVendedor',
  'enviado vendedor': 'enviadoVendedor',
  retornovendedor: 'retornoVendedor',
  'retorno vendedor': 'retornoVendedor',
  enviadoagencia: 'enviadoAgencia',
  'enviado agencia': 'enviadoAgencia',
  'enviado agência': 'enviadoAgencia',
  retornoagencia: 'retornoAgencia',
  'retorno agencia': 'retornoAgencia',
  'retorno agência': 'retornoAgencia',
  dataenvioliberacaogarantia: 'dataEnvioLiberacaoGarantia',
  'data envio liberacao garantia': 'dataEnvioLiberacaoGarantia',

  // Produto e canal
  produto: 'produto',
  imobiliaria: 'imobiliaria',
  imobiliária: 'imobiliaria',
  portadeentrada: 'portaDeEntrada',
  'porta de entrada': 'portaDeEntrada',
  sehab: 'sehab',
  preentrevista: 'preEntrevista',
  'pre entrevista': 'preEntrevista',
  'pré entrevista': 'preEntrevista',

  // Fechamento
  dataemissaonf: 'dataEmissaoNF',
  'data emissao nf': 'dataEmissaoNF',
  gastosadicionais: 'gastosAdicionais',
  'gastos adicionais': 'gastosAdicionais',
  repasses: 'repasses',
  documentacaorepasse: 'documentacaoRepasse',
  'documentacao repasse': 'documentacaoRepasse',

  // Outros
  renda: 'renda',
  fgts: 'fgts',
  casafacil: 'casaFacil',
  'casa facil': 'casaFacil',
  'casa fácil': 'casaFacil',
  validacao: 'validacao',
  'validação': 'validacao',
  anotacoes: 'anotacoes',
  'anotações': 'anotacoes',
  'anotações e observações': 'anotacoes',
  pesquisas: 'pesquisas',
  faltafinalizar: 'faltaFinalizar',
  'falta finalizar': 'faltaFinalizar',
  workflowid: 'workflowId',
  'workflow id': 'workflowId',
  workflow: 'workflowId',

  // Compradores (dinâmico: comprador_1_nome, comprador_1_cpf, etc.)
  comprador_1_nome: 'comprador_1_nome',
  comprador_1_cpf: 'comprador_1_cpf',
  comprador_1_email: 'comprador_1_email',
  comprador_1_telefone: 'comprador_1_telefone',
  'comprador 1 nome': 'comprador_1_nome',
  'comprador 1 cpf': 'comprador_1_cpf',
  'comprador 1 email': 'comprador_1_email',
  'comprador 1 telefone': 'comprador_1_telefone',
  comprador_2_nome: 'comprador_2_nome',
  comprador_2_cpf: 'comprador_2_cpf',
  comprador_2_email: 'comprador_2_email',
  comprador_2_telefone: 'comprador_2_telefone',
  'comprador 2 nome': 'comprador_2_nome',
  'comprador 2 cpf': 'comprador_2_cpf',
  'comprador 2 email': 'comprador_2_email',
  'comprador 2 telefone': 'comprador_2_telefone',
  comprador_3_nome: 'comprador_3_nome',
  comprador_3_cpf: 'comprador_3_cpf',
  comprador_3_email: 'comprador_3_email',
  comprador_3_telefone: 'comprador_3_telefone',
  comprador_4_nome: 'comprador_4_nome',
  comprador_4_cpf: 'comprador_4_cpf',
  comprador_4_email: 'comprador_4_email',
  comprador_4_telefone: 'comprador_4_telefone',

  // Alias legados
  cliente: 'clientePrincipal',
  nome: 'clientePrincipal',
  comprador: 'clientePrincipal',
  nome_cliente: 'clientePrincipal',
  'nome do cliente': 'clientePrincipal',
  clienteprincipal: 'clientePrincipal',
  'cliente principal': 'clientePrincipal',

  // Colunas de compradores em formato unificado
  // (pode conter múltiplos valores separados por \n para contratos com mais de um comprador)
  compradores: '_compradores_raw',
  'nome comprador': '_compradores_raw',
  'nome do comprador': '_compradores_raw',
  cpf: '_cpf_raw',
  cpfcliente: '_cpf_raw',
  'cpf cliente': '_cpf_raw',
  'cpf comprador': '_cpf_raw',
  telefone: '_telefone_raw',
  'telefone comprador': '_telefone_raw',
  fone: '_telefone_raw',
  celular: '_telefone_raw',

  // SICAQ
  vencsicaq: 'vencSicaq',
  'venc sicaq': 'vencSicaq',
  'vencimento sicaq': 'vencSicaq',
  'venc. sicaq': 'vencSicaq',
};

// Campos que contêm datas
const DATE_FIELDS = new Set([
  'entrada', 'dataMinuta', 'dataAssinaturaCliente', 'dataEntradaRegistro',
  'dataAnaliseRegistro', 'dataPrevistaRegistro', 'dataRetornoRi',
  'dataRetiradaContratoRegistrado', 'solicitaITBI', 'retiradaITBI',
  'enviadoPgtoItbi', 'retornoPgtoItbi', 'dataSolicitacaoFunrejus',
  'dataEmissaoFunrejus', 'funrejusEnviadoPgto', 'funrejusRetornoPgto',
  'conformeEm', 'dataConformidadeCehop', 'entregueCehop',
  'dataEnvioLiberacaoGarantia', 'dataEmissaoNF', 'cohaparAprovada',
  'solicitacaoCohapar', 'certificacaoSolicEm', 'certificacaoRealizadaEm',
  'enviadoVendedor', 'retornoVendedor', 'enviadoAgencia', 'retornoAgencia',
  'formulariosEnviadosEm', 'formulariosAssinadosEm',
  'vencSicaq',
]);

// Campos que contêm valores monetários
const CURRENCY_FIELDS = new Set([
  'valorITBI', 'valorFinalRi', 'valorDepositoRi', 'valorFunrejus',
  'valorDespachante', 'valorContrato', 'subsidio', 'gastosAdicionais',
]);

// ===========================================================================
// FUNÇÕES AUXILIARES
// ===========================================================================

function detectDelimiter(text) {
  const sample = (text || '').split(/\r?\n/).find(l => l && l.trim().length > 0) || '';
  const c = (sample.match(/,/g) || []).length;
  const s = (sample.match(/;/g) || []).length;
  const t = (sample.match(/\t/g) || []).length;
  if (s > c && s >= t) return ';';
  if (t > c && t > s) return '\t';
  return ',';
}

function parseCSVRobust(text, delimiter) {
  const lines = [];
  let current = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        current.push(field.trim());
        field = '';
      } else if (ch === '\n') {
        current.push(field.trim());
        if (current.some(v => v !== '')) lines.push(current);
        current = [];
        field = '';
      } else if (ch !== '\r') {
        field += ch;
      }
    }
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field.trim());
    if (current.some(v => v !== '')) lines.push(current);
  }
  return lines;
}

function normalizeHeader(header) {
  return (typeof header === 'string' ? header : '')
    .replace(/^\uFEFF/, '')
    .split('\0').join('')
    .trim()
    .toLowerCase();
}

function parseDate(value) {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;

  // DD/MM/YYYY ou D/M/YYYY (com hora opcional)
  const brMatch = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (brMatch) {
    const d = new Date(
      +brMatch[3], +brMatch[2] - 1, +brMatch[1],
      brMatch[4] ? +brMatch[4] : 0,
      brMatch[5] ? +brMatch[5] : 0
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v.includes('T') ? v : v + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function parseCurrency(value) {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'string') return null;
  const v = value
    .trim()
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '');

  // Formato BR: 1.000,50
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(v)) {
    return parseFloat(v.replace(/\./g, '').replace(',', '.'));
  }
  // Formato US: 1000.50
  const parsed = parseFloat(v.replace(',', '.'));
  return isNaN(parsed) ? null : parsed;
}

function formatDateBr(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

function formatCurrency(value) {
  if (typeof value !== 'number') return '';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Divide um campo multi-valor (nomes/CPFs separados por \n) em array limpo.
 */
function splitMultiValue(raw) {
  if (!raw) return [];
  return String(raw)
    .split('\n')
    .map(v => v.trim())
    .filter(v => v !== '');
}

/**
 * Constrói o array de compradores a partir dos campos disponíveis.
 * Suporta dois formatos:
 *   1) Colunas unificadas: `compradores` / `cpf` / `telefone` (valores \n-separados)
 *   2) Colunas indexadas: `comprador_1_nome` / `comprador_1_cpf` etc.
 */
function buildCompradores(rawRow) {
  const compradores = [];

  // --- FORMATO 1: colunas unificadas (_compradores_raw / _cpf_raw / _telefone_raw) ---
  if (rawRow._compradores_raw) {
    const nomes = splitMultiValue(rawRow._compradores_raw);
    const cpfs = splitMultiValue(rawRow._cpf_raw);
    const telefones = splitMultiValue(rawRow._telefone_raw);

    nomes.forEach((nome, idx) => {
      compradores.push({
        nome,
        cpf: cpfs[idx] || '',
        email: '',
        telefone: telefones[idx] || '',
        principal: idx === 0,
      });
    });
  }

  // --- FORMATO 2: colunas indexadas comprador_N_* ---
  if (compradores.length === 0) {
    for (let i = 1; i <= 4; i++) {
      const nome = rawRow[`comprador_${i}_nome`];
      if (nome && nome.trim() !== '') {
        compradores.push({
          nome: nome.trim(),
          cpf: rawRow[`comprador_${i}_cpf`] ? rawRow[`comprador_${i}_cpf`].trim() : '',
          email: rawRow[`comprador_${i}_email`] ? rawRow[`comprador_${i}_email`].trim() : '',
          telefone: rawRow[`comprador_${i}_telefone`] ? rawRow[`comprador_${i}_telefone`].trim() : '',
          principal: i === 1,
        });
      }
    }
  }

  // --- FALLBACK: campo clientePrincipal simples ---
  if (compradores.length === 0 && rawRow.clientePrincipal) {
    compradores.push({
      nome: rawRow.clientePrincipal.trim(),
      cpf: rawRow._cpf_raw ? rawRow._cpf_raw.trim() : '',
      email: '',
      telefone: rawRow._telefone_raw ? rawRow._telefone_raw.trim() : '',
      principal: true,
    });
  }

  return compradores;
}

function getAvailableStatuses() {
  // Tenta pegar lista de status do serviço carregado em window
  if (window.slaStatusConfigService && typeof window.slaStatusConfigService.getAll === 'function') {
    const statuses = window.slaStatusConfigService.getAll();
    if (Array.isArray(statuses) && statuses.length > 0) return statuses;
  }
  if (Array.isArray(window.STATUS_CONFIG) && window.STATUS_CONFIG.length > 0) {
    return window.STATUS_CONFIG;
  }
  // Fallback: retorna lista vazia (o select ficará sem opções carregadas)
  return [];
}

// ===========================================================================
// CLASSE PRINCIPAL
// ===========================================================================

class CsvImportValidatorService {
  constructor() {
    this._parsedRows = [];       // Linhas brutas após parsing
    this._processedRows = [];    // Linhas com conversões (datas, moedas, compradores)
    this._headers = [];          // Cabeçalhos originais
    this._mappedHeaders = [];    // Cabeçalhos mapeados para campos Firestore
    this._warnings = [];
    this._filename = '';
  }

  /**
   * Analisa o conteúdo de um arquivo CSV.
   * @param {string} csvText - Conteúdo do arquivo como texto
   * @param {string} filename - Nome do arquivo
   * @returns {Promise<AnalysisResult>}
   */
  async analyzeCSV(csvText, filename = '') {
    this._filename = filename;
    this._parsedRows = [];
    this._processedRows = [];
    this._headers = [];
    this._mappedHeaders = [];
    this._warnings = [];

    try {
      const delimiter = detectDelimiter(csvText);
      const lines = parseCSVRobust(csvText, delimiter);

      if (lines.length < 2) {
        return { success: false, error: 'Arquivo CSV vazio ou sem linhas de dados.' };
      }

      this._headers = lines[0];
      const dataLines = lines.slice(1);

      // Mapeia cabeçalhos -> campos Firestore
      this._mappedHeaders = this._headers.map(h => {
        const normalized = normalizeHeader(h);
        return HEADER_FIELD_MAP[normalized] || `_unknown_${normalized}`;
      });

      // Verifica campos desconhecidos
      const unknownHeaders = this._headers.filter((_, i) =>
        this._mappedHeaders[i].startsWith('_unknown_')
      );
      if (unknownHeaders.length > 0) {
        this._warnings.push(
          `${unknownHeaders.length} coluna(s) não mapeada(s): ${unknownHeaders.join(', ')}`
        );
      }

      // Processa cada linha
      const statusCount = {};
      this._parsedRows = dataLines;

      for (let i = 0; i < dataLines.length; i++) {
        const rawValues = dataLines[i];
        const rawRow = {};

        this._mappedHeaders.forEach((field, idx) => {
          if (!field.startsWith('_unknown_')) {
            const val = rawValues[idx] !== undefined ? rawValues[idx] : '';
            if (val !== '') rawRow[field] = val;
          }
        });

        const processed = this._processRow(rawRow, i);
        this._processedRows.push(processed);

        // Conta status
        const st = processed.statusOriginal || processed.status || '(sem status)';
        statusCount[st] = (statusCount[st] || 0) + 1;
      }

      // Status únicos
      const uniqueStatuses = Object.entries(statusCount)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

      return {
        success: true,
        totalRecords: this._processedRows.length,
        totalColumns: this._headers.length,
        headers: this._headers,
        mappedHeaders: this._mappedHeaders,
        uniqueStatuses,
        validationWarnings: this._warnings,
        availableStatuses: getAvailableStatuses(),
      };

    } catch (err) {
      console.error('[CsvImportValidatorService] Erro ao analisar CSV:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Retorna linhas para preview com campos processados.
   * @param {number} limit - Máximo de linhas a retornar
   * @returns {Array}
   */
  getPreviewData(limit = 50) {
    return this._processedRows.slice(0, limit);
  }

  /**
   * Valida os dados analisados e retorna lista de avisos.
   * @returns {{ warnings: string[] }}
   */
  validate() {
    const warnings = [...this._warnings];

    // Verifica campos obrigatórios ausentes
    let semStatus = 0;
    let semCliente = 0;

    for (const row of this._processedRows) {
      if (!row.status && !row.statusOriginal) semStatus++;
      if (!row.clientePrincipal) semCliente++;
    }

    if (semStatus > 0) {
      warnings.push(`${semStatus} registro(s) sem campo "status".`);
    }
    if (semCliente > 0) {
      warnings.push(`${semCliente} registro(s) sem nome do cliente.`);
    }

    return { warnings };
  }

  /**
   * Retorna dados prontos para importação no Firestore.
   * @param {string|null} selectedStatus - Se informado, substitui o status de todos os registros
   * @returns {Array}
   */
  getDataForImport(selectedStatus = null) {
    return this._processedRows.map(row => {
      const contract = { ...row };

      // Remove campos de exibição (_display, _original, _invalid)
      for (const key of Object.keys(contract)) {
        if (key.endsWith('_display') || key.endsWith('_original') || key.endsWith('_invalid')) {
          delete contract[key];
        }
      }

      // Remove campos internos de UI
      delete contract.statusOriginal;
      delete contract.totalCompradores;
      delete contract.compradores_display;

      // Remove campos de compradores (já convertidos para array)
      for (let i = 1; i <= 4; i++) {
        delete contract[`comprador_${i}_nome`];
        delete contract[`comprador_${i}_cpf`];
        delete contract[`comprador_${i}_email`];
        delete contract[`comprador_${i}_telefone`];
      }
      delete contract.cpfClientePrincipal;
      delete contract._compradores_raw;
      delete contract._cpf_raw;
      delete contract._telefone_raw;

      // Substitui status se selecionado
      if (selectedStatus) {
        contract.status = selectedStatus;
      }

      // Metadados de importação
      contract.importadoPelaFerramentaUI = true;
      contract.importadoEm = new Date();

      return contract;
    });
  }

  // ===========================================================================
  // PROCESSAMENTO INTERNO DE LINHA
  // ===========================================================================

  _processRow(rawRow, index) {
    const row = { ...rawRow };

    // Guarda status original para exibição
    row.statusOriginal = rawRow.status || '';

    // Converte datas
    for (const field of DATE_FIELDS) {
      const val = row[field];
      if (val && typeof val === 'string') {
        const parsed = parseDate(val);
        if (parsed) {
          row[`${field}_display`] = formatDateBr(parsed);
          row[field] = parsed;
        } else if (val.trim() !== '') {
          row[`_${field}_invalid`] = true;
          row[`_${field}_original`] = val;
          this._warnings.push(`Linha ${index + 2}: valor de data inválido em "${field}": "${val}"`);
        }
      }
    }

    // Converte valores monetários
    for (const field of CURRENCY_FIELDS) {
      const val = row[field];
      if (val && typeof val === 'string') {
        const parsed = parseCurrency(val);
        if (parsed !== null) {
          row[`${field}_display`] = formatCurrency(parsed);
          row[field] = parsed;
        }
      }
    }

    // Monta array de compradores
    const compradores = buildCompradores(row);
    if (compradores.length > 0) {
      row.compradores = compradores;
      row.clientePrincipal = compradores.find(c => c.principal)?.nome || compradores[0]?.nome || row.clientePrincipal || '';
      row.compradores_display = compradores.map(c => c.nome).join(', ');
    }
    row.totalCompradores = (row.compradores || []).length || 1;

    return row;
  }
}

// ===========================================================================
// EXPORTAÇÃO
// ===========================================================================

const csvImportValidator = new CsvImportValidatorService();

if (typeof window !== 'undefined') {
  window.csvImportValidator = csvImportValidator;
}

export default csvImportValidator;
export { CsvImportValidatorService };
