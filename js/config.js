/**
 * @file config.js
 * @description Contém as configurações e constantes da aplicação.
 */

// ========================= AGÊNCIAS CEF =========================
// Lista de agências da Caixa Econômica Federal disponíveis no sistema.
// Esta lista pode ser expandida conforme necessário.
export const AGENCIAS_CEF = [
  "CEF AG 0368 - COMENDADOR",
  "CEF AG 0369 - CARLOS GOMES/PR",
  "CEF AG 0370 - BARÃO DO SERRO AZUL",
  "CEF AG 0371 - BACACHERI",
  "CEF AG 0372 - CRISTO REI",
  "CEF AG 0373 - MARECHAL DEODORO",
  "CEF AG 0374 - MERCES",
  "CEF AG 0375 - PORTAO",
  "CEF AG 0376 - SANTA FELICIDADE",
  "CEF AG 0377 - RUA DAS FLORES",
  "CEF AG 0381 - ARAUCARIA",
  "CEF AG 0385 - CAMPO LARGO",
  "CEF AG 0403 - RIO NEGRO",
  "CEF AG 0406 - SÃO JOSÉ DOS PINHAIS",
  "CEF AG 0450 - GUIA LOPES/RS",
  "CEF AG 0873 - TERRA BELA",
  "CEF AG 0997 - JUVEVE",
  "CEF AG 0998 - PINHEIRINHO",
  "CEF AG 1000 - CIDADE SORRISO",
  "CEF AG 1001 - VILA HAUER",
  "CEF AG 1282 - PRAÇA DO CARMO",
  "CEF AG 1286 - SEMINARIO",
  "CEF AG 1398 - ITAPERUÇU",
  "CEF AG 1482 - AGENCIA AGUA VERDE",
  "CEF AG 1524 - BIGORRILHO",
  "CEF AG 1565 - AGENCIA CURITIBA",
  "CEF AG 1627 - JOAO NEGRÃO",
  "CEF AG 1632 - CAPÃO DA IMBUIA",
  "CEF AG 1633 - REBOUÇAS",
  "CEF AG 1952 - NOVA ORLEANS",
  "CEF AG 1971 - AV BRASILIA",
  "CEF AG 2553 - NOVO MUNDO",
  "CEF AG 2863 - PEDRA BRANCA",
  "CEF AG 2937 - ECOVILLE",
  "CEF AG 2974 - ALTO MARACANÃ",
  "CEF AG 2975 - TINGUI",
  "CEF AG 2997 - CIC",
  "CEF AG 3342 - BARREIRINHA",
  "CEF AG 3371 - GRACIOSA",
  "CEF AG 3492 - PINHEIRO DO PARANÁ",
  "CEF AG 3510 - COLOMBO/PR",
  "CEF AG 3733 - AVENIDA INGLATERRA",
  "CEF AG 3877 - KENNEDY",
  "CEF AG 3915 - PINHAIS",
  "CEF AG 4538 - CAMPO MAGRO/PR",
  "CEF AG 4609 - PIEN",
  "CEF AG 4744 - TATUQUARA"
];

// STATUS_CONFIG antigo
// export const STATUS_CONFIG = [
//     { order: 1.0, text: 'Formulários', stage: 'Assinatura' },
//     { order: 1.1, text: 'Em certificação', stage: 'Assinatura' },
//     { order: 1.2, text: 'Certificação Realizada - em Montagem', stage: 'Assinatura' },
//     { order: 1.3, text: 'Pré-conferência', stage: 'Assinatura' },
//     { order: 2.0, text: 'Validação Cohapar', stage: 'Registro' },
//     { order: 2.1, text: 'Aguardando CCS', stage: 'Registro' },
//     { order: 3.0, text: 'Pendência', stage: 'Registro' },
//     { order: 3.1, text: 'Diferença de valores', stage: 'Registro' },
//     { order: 3.2, text: 'Restrição', stage: 'Registro' },
//     { order: 3.3, text: 'Reavaliação', stage: 'Registro' },
//     { order: 3.4, text: 'Reprovado', stage: 'Registro' },
//     { order: 3.5, text: 'Contrato IR', stage: 'Registro' },
//     { order: 3.6, text: 'Pré-Conferência - CEHOP', stage: 'Registro' },
//     { order: 4.0, text: 'Formulários (CEHOP)', stage: 'Registro' },
//     { order: 4.1, text: 'Formulários enviados', stage: 'Registro' },
//     { order: 4.2, text: 'Internalizado', stage: 'Registro' },
//     { order: 5.0, text: 'Finalização CEHOP', stage: 'Registro' },
//     { order: 5.1, text: 'CEHOP - Inconforme', stage: 'Registro' },
//     { order: 6.0, text: 'Entrevista Banco', stage: 'Registro' },
//     { order: 6.1, text: 'Entrevista realizada - Pendente', stage: 'Registro' },
//     { order: 7.0, text: 'Aguardando Minuta', stage: 'Registro' },
//     { order: 7.1, text: 'Minuta recebida - Conferência de valores', stage: 'Registro' },
//     { order: 7.2, text: 'Minuta Recebida - Aguardando edição', stage: 'Registro' },
//     { order: 7.3, text: 'Minuta Editada - Aguardando assinatura cliente', stage: 'Registro' },
//     { order: 7.4, text: 'Em assinatura vendedor', stage: 'Registro' },
//     { order: 7.5, text: 'Em assinatura Banco', stage: 'Registro' },
//     { order: 8.0, text: 'Registro', stage: 'Cartório' },
//     { order: 8.1, text: 'Em preparação - Conferência Minuta', stage: 'Cartório' },
//     { order: 8.2, text: 'Em preparação - Emissão ITBI', stage: 'Cartório' },
//     { order: 8.3, text: 'ITBI enviado para pagamento', stage: 'Cartório' },
//     { order: 8.4, text: 'ITBI quitado', stage: 'Cartório' },
//     { order: 9.0, text: 'Envio ao Registro', stage: 'Cartório' },
//     { order: 9.1, text: 'Em registro - FUNREJUS pendente', stage: 'Cartório' },
//     { order: 9.2, text: 'Em registro - Ag. análise RI', stage: 'Cartório' },
//     { order: 9.3, text: 'Em registro - Exigência', stage: 'Cartório' },
//     { order: 9.4, text: 'Em registro - aguardando finalização RI', stage: 'Cartório' },
//     { order: 9.5, text: 'Registrado', stage: 'Cartório' },
//     { order: 10.0, text: 'Liberação da garantia - enviado CEHOP', stage: 'Finalização' },
//     { order: 10.1, text: 'Liberação da Garantia Inconforme – em tratativa', stage: 'Finalização' },
//     { order: 10.2, text: 'Liberação da Garantia Conforme', stage: 'Finalização' },
//     { order: 11.0, text: 'Finalização - Pendente aviso cliente/banco', stage: 'Finalização' },
//     { order: 11.1, text: 'Finalização - Solicitar troca titularidade IPTU', stage: 'Finalização' },
//     { order: 11.2, text: 'Finalização - Solicitar repasse despachante', stage: 'Finalização' },
//     { order: 11.3, text: 'Finalização - Aguardando repasse despachante', stage: 'Finalização' },
//     { order: 12.0, text: 'Finalizado/Concluído', stage: 'Concluído' },
//     { order: 14.0, text: 'Demanda Mínima', stage: 'Outros' },
//     { order: 15.0, text: 'Em Distrato/Problemas', stage: 'Outros' },
//     { order: 15.1, text: 'Distrato', stage: 'Outros' }
// ];

// ========================= SLA TARGETS =========================
// Define o objetivo (em dias) máximo recomendado para permanência em cada status.
// Caso um status não esteja listado aqui, ele será considerado "sem alvo" e não exibirá SLA.
// Ajuste conforme necessidade de negócio.
export const SLA_TARGETS = {
  'Formulários': 3,
  'Em certificação': 2,
  'Certificação Realizada - em Montagem': 4,
  'Pré-conferência': 5,
  'Validação Cohapar': 7,
  'Aguardando CCS': 5,
  'Pendência': 10, // pendências podem demorar mais
  'Diferença de valores': 5,
  'Restrição': 12,
  'Reavaliação': 8,
  'Contrato IR': 4,
  'Pré-Conferência - CEHOP': 5,
  'Formulários (CEHOP)': 3,
  'Formulários enviados': 3,
  'Internalizado': 2,
  'Finalização CEHOP': 5,
  'CEHOP - Inconforme': 6,
  'Entrevista Banco': 4,
  'Entrevista realizada - Pendente': 3,
  'Aguardando Minuta': 7,
  'Minuta recebida - Conferência de valores': 3,
  'Minuta Recebida - Aguardando edição': 4,
  'Minuta Editada - Aguardando assinatura cliente': 5,
  'Em assinatura vendedor': 2,
  'Em assinatura Banco': 2,
  'Registro': 10,
  'Em preparação - Conferência Minuta': 3,
  'Em preparação - Emissão ITBI': 3,
  'ITBI enviado para pagamento': 5,
  'ITBI quitado': 4,
  'Envio ao Registro': 3,
  'Em registro - FUNREJUS pendente': 6,
  'Em registro - Ag. análise RI': 7,
  'Em registro - Exigência': 10,
  'Em registro - aguardando finalização RI': 8,
  'Registrado': 2,
  'Liberação da garantia - enviado CEHOP': 5,
  'Liberação da Garantia Inconforme – em tratativa': 7,
  'Liberação da Garantia Conforme': 4,
  'Finalização - Pendente aviso cliente/banco': 5,
  'Finalização - Solicitar troca titularidade IPTU': 7,
  'Finalização - Solicitar repasse despachante': 5,
  'Finalização - Aguardando repasse despachante': 6,
  'Finalizado/Concluído': 0
};

// ========================= STATUS CONFIGURATION =========================
// STATUS_CONFIG foi migrado para o banco de dados Firebase.
// O sistema agora carrega os status dinamicamente da coleção 'status'.
// Esta configuração mínima serve apenas como fallback de emergência.

/* STATUS_CONFIG ORIGINAL - MIGRADO PARA BANCO DE DADOS
export const STATUS_CONFIG = [
  {
    order: 1.0,
    text: "Formulários",
    stage: "Assinatura",
    nextSteps: ["Em certificação"],
  },
  {
    order: 1.1,
    text: "Em certificação",
    stage: "Assinatura",
    nextSteps: ["Certificação Realizada - em Montagem"],
  },
  {
    order: 1.2,
    text: "Certificação Realizada - em Montagem",
    stage: "Assinatura",
    nextSteps: ["Pré-conferência"],
  },
  {
    order: 1.3,
    text: "Pré-conferência",
    stage: "Assinatura",
    nextSteps: ["Validação Cohapar", "Aguardando CCS", "Pendência"],
  },
  {
    order: 2.0,
    text: "Validação Cohapar",
    stage: "Registro",
    nextSteps: ["Aguardando CCS"],
  },
  {
    order: 2.1,
    text: "Aguardando CCS",
    stage: "Registro",
    nextSteps: ["Formulários (CEHOP)"],
  },
  {
    order: 3.0,
    text: "Pendência",
    stage: "Registro",
    nextSteps: ["Formulários"],
  },
  {
    order: 3.1,
    text: "Diferença de valores",
    stage: "Registro",
    nextSteps: ["Formulários"],
  },
  {
    order: 3.2,
    text: "Restrição",
    stage: "Registro",
    nextSteps: ["Formulários"],
  },
  {
    order: 3.3,
    text: "Reavaliação",
    stage: "Registro",
    nextSteps: ["Formulários"],
  },
  { order: 3.4, text: "Reprovado", stage: "Registro", nextSteps: [] },
  {
    order: 3.5,
    text: "Contrato IR",
    stage: "Registro",
    nextSteps: ["Formulários"],
  },
  {
    order: 3.6,
    text: "Pré-Conferência - CEHOP",
    stage: "Registro",
    nextSteps: ["Formulários (CEHOP)"],
  },
  {
    order: 4.0,
    text: "Formulários (CEHOP)",
    stage: "Registro",
    nextSteps: ["Formulários enviados"],
  },
  {
    order: 4.1,
    text: "Formulários enviados",
    stage: "Registro",
    nextSteps: ["Internalizado"],
  },
  {
    order: 4.2,
    text: "Internalizado",
    stage: "Registro",
    nextSteps: ["Finalização CEHOP"],
  },
  {
    order: 5.0,
    text: "Finalização CEHOP",
    stage: "Registro",
    nextSteps: ["Entrevista Banco"],
  },
  {
    order: 5.1,
    text: "CEHOP - Inconforme",
    stage: "Registro",
    nextSteps: ["Formulários (CEHOP)"],
  },
  {
    order: 6.0,
    text: "Entrevista Banco",
    stage: "Registro",
    nextSteps: ["Entrevista realizada - Pendente", "Aguardando Minuta"],
  },
  {
    order: 6.1,
    text: "Entrevista realizada - Pendente",
    stage: "Registro",
    nextSteps: ["Aguardando Minuta"],
  },
  {
    order: 7.0,
    text: "Aguardando Minuta",
    stage: "Registro",
    nextSteps: ["Minuta recebida - Conferência de valores"],
  },
  {
    order: 7.1,
    text: "Minuta recebida - Conferência de valores",
    stage: "Registro",
    nextSteps: ["Minuta Recebida - Aguardando edição"],
  },
  {
    order: 7.2,
    text: "Minuta Recebida - Aguardando edição",
    stage: "Registro",
    nextSteps: ["Minuta Editada - Aguardando assinatura cliente"],
  },
  {
    order: 7.3,
    text: "Minuta Editada - Aguardando assinatura cliente",
    stage: "Registro",
    nextSteps: ["Em assinatura vendedor"],
  },
  {
    order: 7.4,
    text: "Em assinatura vendedor",
    stage: "Registro",
    nextSteps: ["Em assinatura Banco"],
  },
  {
    order: 7.5,
    text: "Em assinatura Banco",
    stage: "Registro",
    nextSteps: ["Registro"],
  },
  {
    order: 8.0,
    text: "Registro",
    stage: "Cartório",
    nextSteps: ["Em preparação - Conferência Minuta"],
  },
  {
    order: 8.1,
    text: "Em preparação - Conferência Minuta",
    stage: "Cartório",
    nextSteps: ["Em preparação - Emissão ITBI"],
  },
  {
    order: 8.2,
    text: "Em preparação - Emissão ITBI",
    stage: "Cartório",
    nextSteps: ["ITBI enviado para pagamento"],
  },
  {
    order: 8.3,
    text: "ITBI enviado para pagamento",
    stage: "Cartório",
    nextSteps: ["ITBI quitado"],
  },
  {
    order: 8.4,
    text: "ITBI quitado",
    stage: "Cartório",
    nextSteps: ["Envio ao Registro"],
  },
  {
    order: 9.0,
    text: "Envio ao Registro",
    stage: "Cartório",
    nextSteps: [
      "Em registro - FUNREJUS pendente",
      "Em registro - Ag. análise RI",
    ],
  },
  {
    order: 9.1,
    text: "Em registro - FUNREJUS pendente",
    stage: "Cartório",
    nextSteps: ["Em registro - Ag. análise RI"],
  },
  {
    order: 9.2,
    text: "Em registro - Ag. análise RI",
    stage: "Cartório",
    nextSteps: [
      "Em registro - Exigência",
      "Em registro - aguardando finalização RI",
    ],
  },
  {
    order: 9.3,
    text: "Em registro - Exigência",
    stage: "Cartório",
    nextSteps: ["Envio ao Registro"],
  },
  {
    order: 9.4,
    text: "Em registro - aguardando finalização RI",
    stage: "Cartório",
    nextSteps: ["Registrado"],
  },
  {
    order: 9.5,
    text: "Registrado",
    stage: "Cartório",
    nextSteps: ["Liberação da garantia - enviado CEHOP"],
    requiredFields: [
      {
        fieldId: "modal-dataRetiradaContratoRegistrado",
        message: 'A "Data do Contrato Registrado" é obrigatória para avançar.',
      },
      {
        fieldId: "modal-nContratoCEF",
        message: 'O "Nº do Contrato CEF" deve ser preenchido.',
      },
    ],
  },
  {
    order: 10.0,
    text: "Liberação da garantia - enviado CEHOP",
    stage: "Finalização",
    nextSteps: [
      "Liberação da Garantia Inconforme – em tratativa",
      "Liberação da Garantia Conforme",
    ],
  },
  {
    order: 10.1,
    text: "Liberação da Garantia Inconforme – em tratativa",
    stage: "Finalização",
    nextSteps: ["Liberação da garantia - enviado CEHOP"],
  },
  {
    order: 10.2,
    text: "Liberação da Garantia Conforme",
    stage: "Finalização",
    nextSteps: ["Finalização - Pendente aviso cliente/banco"],
  },
  {
    order: 11.0,
    text: "Finalização - Pendente aviso cliente/banco",
    stage: "Finalização",
    nextSteps: ["Finalização - Solicitar troca titularidade IPTU"],
  },
  {
    order: 11.1,
    text: "Finalização - Solicitar troca titularidade IPTU",
    stage: "Finalização",
    nextSteps: ["Finalização - Solicitar repasse despachante"],
  },
  {
    order: 11.2,
    text: "Finalização - Solicitar repasse despachante",
    stage: "Finalização",
    nextSteps: ["Finalização - Aguardando repasse despachante"],
  },
  {
    order: 11.3,
    text: "Finalização - Aguardando repasse despachante",
    stage: "Finalização",
    nextSteps: ["Finalizado/Concluído"],
  },
  {
    order: 12.0,
    text: "Finalizado/Concluído",
    stage: "Concluído",
    nextSteps: [],
  },
  { order: 14.0, text: "Demanda Mínima", stage: "Outros", nextSteps: [] },
  {
    order: 15.0,
    text: "Em Distrato/Problemas",
    stage: "Outros",
    nextSteps: ["Distrato"],
  },
  { order: 15.1, text: "Distrato", stage: "Outros", nextSteps: [] },
]; 
FIM DO STATUS_CONFIG ORIGINAL */

// @deprecated STATUS_CONFIG fallback removido em 2026-01-20
// O sistema agora utiliza exclusivamente dados dinâmicos do Firestore (coleção statusConfig)
// Em caso de erro ao carregar do Firestore, será exibida mensagem de erro apropriada
// ao invés de usar fallback hardcoded que poderia estar desatualizado.
// 
// Para configurar status, use: Configurações > Gerenciador de Status e Workflows
export const STATUS_CONFIG = [];

// Mapeamento de campos para o histórico de alterações, para nomes mais amigáveis.
export const FIELDS_TO_TRACK = {
  // Dados Principais
  status: "Status",
  entrada: "Data de Entrada",
  analista: "Analista",
  vendedorConstrutora: "Vendedor/Construtora",
  empreendimento: "Empreendimento",
  apto: "Apto",
  bloco: "Bloco",
  valorContrato: "Valor Financiado",
  valorAvaliacao: "Valor de Avaliação",
  valorNegociadoConstrutora: "Valor Negociado com a Construtora",
  valorContratoBanco: "Valor do Contrato Banco",
  valorRecursosProprios: "Valor Recursos Proprios",
  valorFgts: "Valor FGTS",
  valorSubsidio: "Valor Subsidio",
  compradores: "Compradores", // Rastreia a lista de compradores como um todo

  // Formulários e CEHOP
  renda: "Renda",
  validacao: "Validação",
  fgts: "FGTS",
  casaFacil: "Casa Fácil",
  certificadora: "Certificadora",
  montagemComplementar: "Montagem Complementar",
  montagemCehop: "Montagem CEHOP",
  certificacaoSolicEm: "Solicitação Certificação",
  certificacaoRealizadaEm: "Certificação Realizada em",
  solicitacaoCohapar: "Solicitação Cohapar",
  cohaparAprovada: "Cohapar Aprovada",
  cartaCohapar: "Carta Cohapar",
  produto: "Produto",
  vencSicaq: "Vencimento SICAQ",
  agendamentoFormulario: "Agendamento Formulário",
  formulariosEnviadosEm: "Formulários Enviados Em",
  formulariosAssinadosEm: "Formulários Assinados Em",
  entregueCehop: "Entregue CEHOP",
  devolucaoParaCorrecao: "Devolução p/ Correção",
  devolvidoCorrigido: "Devolvido Corrigido",
  enviadoACehop: "Enviado a CEHOP",
  conformeEm: "Conforme Em",
  dataDeEnvioDaPastaAgencia: "Envio Pasta Agência",
  entrevistaCef: "Entrevista CEF",
  contratoCef: "Contrato CEF",
  agencia: "Agência",
  gerente: "Gerente",
  corretor: "Corretor",
  subsidio: "Subsídio",
  anotacoes: "Anotações e Observações",
  pesquisas: "Pesquisas",
  portaDeEntrada: "Porta de Entrada",
  sehab: "SEHAB",
  faltaFinalizar: "Falta para Finalizar",
  analistaCehop: "Analista CEHOP",
  analistaAprovacao: "Analista Aprovacao",
  conferenciaCehopNatoEntregueEm: "Conferencia CEHOP entregue em",
  conferenciaCehopNatoDevolvidaEm: "Conferencia CEHOP devolvida em",
  preEntrevista: "Pré Entrevista",
  docAssinarEntregar: "Doc assinar/entregar",
  imobiliaria: "Imobiliária",

  // Registro
  nContratoCEF: "Nº Contrato CEF",
  dataMinuta: "Data da Minuta",
  dataAssinaturaCliente: "Data Assinatura Cliente",
  enviadoVendedor: "Enviado Vendedor",
  retornoVendedor: "Retorno Vendedor",
  enviadoAgencia: "Enviado Agência",
  retornoAgencia: "Retorno Agência",
  iptu: "IPTU",
  cartorio: "Cartório",
  solicitaITBI: "Solicita ITBI",
  retiradaITBI: "Retirada ITBI",
  valorITBI: "Valor ITBI",
  enviadoPgtoItbi: "Enviado Pgto ITBI",
  retornoPgtoItbi: "Retorno Pgto ITBI",
  formaPagamentoRi: "Forma Pgto RI",
  valorDepositoRi: "Valor Depósito RI",
  dataEntradaRegistro: "Data Entrada Cartório",
  protocoloRi: "Protocolo RI",
  dataAnaliseRegistro: "Data Análise Registro",
  dataPrevistaRegistro: "Data Prevista Registro",
  dataRetornoRi: "Data Retorno RI",
  valorFunrejus: "Valor Funrejus",
  dataSolicitacaoFunrejus: "Data Solicitação Funrejus",
  dataEmissaoFunrejus: "Data Emissão Funrejus",
  funrejusEnviadoPgto: "Funrejus Enviado Pgto",
  funrejusRetornoPgto: "Funrejus Retorno Pgto",
  valorFinalRi: "Valor Final RI",
  dataRetiradaContratoRegistrado: "Data Contrato Registrado",
  dataEnvioLiberacaoGarantia: "Data Envio Lib. Garantia",
  dataConformidadeCehop: "Data Conformidade Garantia",
  codigoCCA: "Código CCA",
  tipoConsulta: "Tipo de Consulta",
  chaveConsulta: "Chave de Consulta",

  // Fechamento
  dataEmissaoNF: "Data Emissão NF",
  valorDespachante: "Valor Despachante",
  gastosAdicionais: "Gastos Adicionais",
  repasses: "Repasses",
  documentacaoRepasse: "Documentação e Repasse",
};

// Função auxiliar para formatar datas (pode ser usada por vários módulos)
const parseDateValue = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value.toDate === "function") {
    const dateFromTimestamp = value.toDate();
    return Number.isNaN(dateFromTimestamp.getTime()) ? null : dateFromTimestamp;
  }

  if (typeof value === "number") {
    const dateFromNumber = new Date(value);
    return Number.isNaN(dateFromNumber.getTime()) ? null : dateFromNumber;
  }

  if (typeof value === "object" && typeof value.seconds === "number") {
    const dateFromSeconds = new Date(value.seconds * 1000);
    return Number.isNaN(dateFromSeconds.getTime()) ? null : dateFromSeconds;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const brDateMatch = trimmed.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (brDateMatch) {
      const day = Number(brDateMatch[1]);
      const month = Number(brDateMatch[2]) - 1;
      const year = Number(brDateMatch[3]);
      const hour = Number(brDateMatch[4] || 0);
      const minute = Number(brDateMatch[5] || 0);
      const second = Number(brDateMatch[6] || 0);
      const dateFromBr = new Date(year, month, day, hour, minute, second);
      return Number.isNaN(dateFromBr.getTime()) ? null : dateFromBr;
    }

    const normalizedIsoLike = trimmed.includes(" ")
      ? trimmed.replace(" ", "T")
      : trimmed;
    const dateFromString = new Date(normalizedIsoLike);
    return Number.isNaN(dateFromString.getTime()) ? null : dateFromString;
  }

  return null;
};

const formatDate = (timestamp) => {
  const date = parseDateValue(timestamp);
  if (!date) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatDateTime = (timestamp) => {
  const date = parseDateValue(timestamp);
  if (!date) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

// Lista Mestra de todos os campos disponíveis para exportação
export const EXPORTABLE_FIELDS = [
  { key: "id", label: "ID do Processo" },
  { key: "status", label: "Status" },
  {
    key: "entrada",
    label: "Data de Entrada",
    formatter: (c) => formatDate(c.entrada),
  },
  { key: "analista", label: "Analista" },
  { key: "vendedorConstrutora", label: "Vendedor/Construtora" },
  { key: "empreendimento", label: "Empreendimento" },
  { key: "bloco", label: "Bloco" },
  { key: "apto", label: "Apto" },
  {
    key: "clientePrincipal",
    label: "Cliente Principal",
    formatter: (c) => {
      // PRIORIDADE 1: Campo clientePrincipal direto
      if (c.clientePrincipal && c.clientePrincipal.trim() !== '') {
        return c.clientePrincipal;
      }
      // PRIORIDADE 2: Array compradores
      if (c.compradores && c.compradores.length > 0) {
        const principal = c.compradores.find(comp => comp.principal) || c.compradores[0];
        return principal ? principal.nome : "";
      }
      // PRIORIDADE 3: Campos de comprador do CSV
      if (c.comprador_1_nome && c.comprador_1_nome.trim() !== '') {
        return c.comprador_1_nome;
      }
      return "";
    },
  },
  // Compradores (gerados dinamicamente)
  ...Array.from({ length: 4 }, (_, i) => [
    {
      key: `comprador_${i + 1}_nome`,
      label: `Comprador ${i + 1}: Nome`,
      formatter: (c) => c.compradores?.[i]?.nome || "",
    },
    {
      key: `comprador_${i + 1}_cpf`,
      label: `Comprador ${i + 1}: CPF`,
      formatter: (c) => c.compradores?.[i]?.cpf || "",
    },
    {
      key: `comprador_${i + 1}_email`,
      label: `Comprador ${i + 1}: Email`,
      formatter: (c) => c.compradores?.[i]?.email || "",
    },
    {
      key: `comprador_${i + 1}_telefone`,
      label: `Comprador ${i + 1}: Telefone`,
      formatter: (c) => c.compradores?.[i]?.telefone || "",
    },
    {
      key: `comprador_${i + 1}_principal`,
      label: `Comprador ${i + 1}: É Principal`,
      formatter: (c) => c.compradores?.[i]?.principal || false,
    },
  ]).flat(),
  // Outros campos
  { key: "nContratoCEF", label: "Nº Contrato CEF" },
  { key: "agencia", label: "Agência" },
  { key: "cartorio", label: "Cartório" },
  {
    key: "dataAssinaturaCliente",
    label: "Data Assinatura Cliente",
    formatter: (c) => formatDate(c.dataAssinaturaCliente),
  },
  {
    key: "dataEntradaRegistro",
    label: "Data Entrada Cartório",
    formatter: (c) => formatDate(c.dataEntradaRegistro),
  },
  {
    key: "dataRetiradaContratoRegistrado",
    label: "Data Contrato Registrado",
    formatter: (c) => formatDate(c.dataRetiradaContratoRegistrado),
  },
  { key: "valorITBI", label: "Valor ITBI" },
  { key: "valorFinalRi", label: "Valor Final RI" },
  { key: "valorFunrejus", label: "Valor Funrejus" },
  { key: "valorDespachante", label: "Valor Despachante" },
  // Campos adicionais de TABLE_COLUMNS
  { key: "gerente", label: "Gerente" },
  { key: "corretor", label: "Corretor" },
  { key: "matriculaImovel", label: "Matrícula Imóvel" },
  { key: "municipioImovel", label: "Município Imóvel" },
  { key: "iptu", label: "IPTU" },
  { key: "protocoloRi", label: "Protocolo RI" },
  { key: "dataMinuta", label: "Data da Minuta", formatter: (c) => formatDate(c.dataMinuta) },
  { key: "dataAnaliseRegistro", label: "Data Análise Registro", formatter: (c) => formatDate(c.dataAnaliseRegistro) },
  { key: "dataPrevistaRegistro", label: "Data Prevista Registro", formatter: (c) => formatDate(c.dataPrevistaRegistro) },
  { key: "dataRetornoRi", label: "Data Retorno RI", formatter: (c) => formatDate(c.dataRetornoRi) },
  { key: "solicitaITBI", label: "Data Solicita ITBI", formatter: (c) => formatDate(c.solicitaITBI) },
  { key: "retiradaITBI", label: "Data Retirada ITBI", formatter: (c) => formatDate(c.retiradaITBI) },
  { key: "enviadoPgtoItbi", label: "Enviado Pgto ITBI", formatter: (c) => formatDate(c.enviadoPgtoItbi) },
  { key: "retornoPgtoItbi", label: "Retorno Pgto ITBI", formatter: (c) => formatDate(c.retornoPgtoItbi) },
  { key: "dataSolicitacaoFunrejus", label: "Data Solic. Funrejus", formatter: (c) => formatDate(c.dataSolicitacaoFunrejus) },
  { key: "dataEmissaoFunrejus", label: "Data Emissão Funrejus", formatter: (c) => formatDate(c.dataEmissaoFunrejus) },
  { key: "funrejusEnviadoPgto", label: "Funrejus Env. Pgto", formatter: (c) => formatDate(c.funrejusEnviadoPgto) },
  { key: "funrejusRetornoPgto", label: "Funrejus Ret. Pgto", formatter: (c) => formatDate(c.funrejusRetornoPgto) },
  { key: "valorContrato", label: "Valor Contrato" },
  { key: "valorDepositoRi", label: "Valor Depósito RI" },
  { key: "subsidio", label: "Subsídio" },
  { key: "analistaCehop", label: "Analista CEHOP" },
  { key: "entregueCehop", label: "Entregue CEHOP", formatter: (c) => formatDate(c.entregueCehop) },
  { key: "conformeEm", label: "Conforme Em", formatter: (c) => formatDate(c.conformeEm) },
  { key: "dataConformidadeCehop", label: "Data Conform. CEHOP", formatter: (c) => formatDate(c.dataConformidadeCehop) },
  { key: "certificadora", label: "Certificadora" },
  { key: "certificacaoSolicEm", label: "Certificação Solic.", formatter: (c) => formatDate(c.certificacaoSolicEm) },
  { key: "certificacaoRealizadaEm", label: "Certificação Realizada", formatter: (c) => formatDate(c.certificacaoRealizadaEm) },
  { key: "enviadoVendedor", label: "Enviado Vendedor", formatter: (c) => formatDate(c.enviadoVendedor) },
  { key: "retornoVendedor", label: "Retorno Vendedor", formatter: (c) => formatDate(c.retornoVendedor) },
  { key: "enviadoAgencia", label: "Enviado Agência", formatter: (c) => formatDate(c.enviadoAgencia) },
  { key: "retornoAgencia", label: "Retorno Agência", formatter: (c) => formatDate(c.retornoAgencia) },
  { key: "solicitacaoCohapar", label: "Solicitação Cohapar", formatter: (c) => formatDate(c.solicitacaoCohapar) },
  { key: "cohaparAprovada", label: "Cohapar Aprovada", formatter: (c) => formatDate(c.cohaparAprovada) },
  { key: "cartaCohapar", label: "Carta Cohapar" },
  { key: "produto", label: "Produto" },
  { key: "imobiliaria", label: "Imobiliária" },
  { key: "portaDeEntrada", label: "Porta de Entrada" },
  { key: "formaPagamentoRi", label: "Forma Pgto RI" },
  { key: "dataEmissaoNF", label: "Data Emissão NF", formatter: (c) => formatDate(c.dataEmissaoNF) },
  { key: "dataEnvioLiberacaoGarantia", label: "Envio Lib. Garantia", formatter: (c) => formatDate(c.dataEnvioLiberacaoGarantia) },
  { key: "workflowId", label: "Workflow" },
];

// Lista mestra para as colunas da tabela de Processos
// Expandida em 05/12/2025 para incluir todos os campos disponíveis
export const TABLE_COLUMNS = [
  // === DADOS PRINCIPAIS ===
  { key: "vendedorConstrutora", label: "Vendedor/Construtora", isSortable: true, isDefault: true },
  { key: "empreendimento", label: "Empreendimento", isSortable: true, isDefault: true },
  { key: "clientePrincipal", label: "Cliente Principal", isSortable: true, isDefault: true },
  { key: "status", label: "Status", isSortable: true, isDefault: true },
  { key: "entrada", label: "Data de Entrada", isSortable: true, isDefault: false, formatter: (c) => formatDateTime(c.entrada) },
  { key: "analista", label: "Analista", isSortable: true, isDefault: false },
  { key: "apto", label: "Apto", isSortable: true, isDefault: false },
  { key: "bloco", label: "Bloco", isSortable: true, isDefault: false },
  
  // === CONTRATO E AGÊNCIA ===
  { key: "nContratoCEF", label: "Nº Contrato CEF", isSortable: true, isDefault: false },
  { key: "agencia", label: "Agência", isSortable: true, isDefault: false },
  { key: "gerente", label: "Gerente", isSortable: true, isDefault: false },
  { key: "corretor", label: "Corretor", isSortable: true, isDefault: false },
  
  // === CARTÓRIO E REGISTRO ===
  { key: "cartorio", label: "Cartório", isSortable: true, isDefault: false },
  { key: "matriculaImovel", label: "Matrícula Imóvel", isSortable: true, isDefault: false },
  { key: "municipioImovel", label: "Município Imóvel", isSortable: true, isDefault: false },
  { key: "iptu", label: "IPTU", isSortable: true, isDefault: false },
  { key: "protocoloRi", label: "Protocolo RI", isSortable: true, isDefault: false },

  // === DADOS DO IMÓVEL ===
  { key: "enderecoImovel", label: "Endereço do Imóvel", isSortable: true, isDefault: false },
  { key: "cidadeImovel", label: "Cidade do Imóvel", isSortable: true, isDefault: false },
  { key: "ufImovel", label: "UF do Imóvel", isSortable: true, isDefault: false },
  { key: "cepImovel", label: "CEP do Imóvel", isSortable: true, isDefault: false },
  { key: "inscricaoImobiliaria", label: "Inscrição Imobiliária", isSortable: true, isDefault: false },
  { key: "areaTerreno", label: "Área do Terreno (m²)", isSortable: true, isDefault: false },
  { key: "areaConstruida", label: "Área Construída (m²)", isSortable: true, isDefault: false },
  { key: "tipoImovel", label: "Tipo do Imóvel", isSortable: true, isDefault: false },
  { key: "valorContratoBanco", label: "Valor Contrato Banco", isSortable: true, isDefault: false },

  // === DATAS IMPORTANTES ===
  { key: "dataMinuta", label: "Data da Minuta", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.dataMinuta) },
  { key: "dataAssinaturaCliente", label: "Data Assinatura Cliente", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.dataAssinaturaCliente) },
  { key: "dataEntradaRegistro", label: "Data Entrada Cartório", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.dataEntradaRegistro) },
  { key: "dataAnaliseRegistro", label: "Data Análise Registro", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.dataAnaliseRegistro) },
  { key: "dataPrevistaRegistro", label: "Data Prevista Registro", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.dataPrevistaRegistro) },
  { key: "dataRetornoRi", label: "Data Retorno RI", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.dataRetornoRi) },
  { key: "dataRetiradaContratoRegistrado", label: "Data Contrato Registrado", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.dataRetiradaContratoRegistrado) },
  
  // === ITBI ===
  { key: "solicitaITBI", label: "Data Solicita ITBI", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.solicitaITBI) },
  { key: "retiradaITBI", label: "Data Retirada ITBI", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.retiradaITBI) },
  { key: "valorITBI", label: "Valor ITBI", isSortable: true, isDefault: false },
  { key: "enviadoPgtoItbi", label: "Enviado Pgto ITBI", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.enviadoPgtoItbi) },
  { key: "retornoPgtoItbi", label: "Retorno Pgto ITBI", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.retornoPgtoItbi) },
  
  // === FUNREJUS ===
  { key: "valorFunrejus", label: "Valor Funrejus", isSortable: true, isDefault: false },
  { key: "dataSolicitacaoFunrejus", label: "Data Solic. Funrejus", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.dataSolicitacaoFunrejus) },
  { key: "dataEmissaoFunrejus", label: "Data Emissão Funrejus", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.dataEmissaoFunrejus) },
  { key: "funrejusEnviadoPgto", label: "Funrejus Env. Pgto", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.funrejusEnviadoPgto) },
  { key: "funrejusRetornoPgto", label: "Funrejus Ret. Pgto", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.funrejusRetornoPgto) },
  
  // === VALORES ===
  { key: "valorContrato", label: "Valor Contrato", isSortable: true, isDefault: false },
  { key: "valorDepositoRi", label: "Valor Depósito RI", isSortable: true, isDefault: false },
  { key: "valorFinalRi", label: "Valor Final RI", isSortable: true, isDefault: false },
  { key: "valorDespachante", label: "Valor Despachante", isSortable: true, isDefault: false },
  { key: "subsidio", label: "Subsídio", isSortable: true, isDefault: false },
  
  // === CEHOP E FORMULÁRIOS ===
  { key: "analistaCehop", label: "Analista CEHOP", isSortable: true, isDefault: false },
  { key: "entregueCehop", label: "Entregue CEHOP", isSortable: true, isDefault: false, formatter: (c) => formatDateTime(c.entregueCehop) },
  { key: "conformeEm", label: "Conforme Em", isSortable: true, isDefault: false, formatter: (c) => formatDateTime(c.conformeEm) },
  { key: "dataConformidadeCehop", label: "Data Conform. CEHOP", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.dataConformidadeCehop) },
  { key: "certificadora", label: "Certificadora", isSortable: true, isDefault: false },
  { key: "certificacaoSolicEm", label: "Certificação Solic.", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.certificacaoSolicEm) },
  { key: "certificacaoRealizadaEm", label: "Certificação Realizada", isSortable: true, isDefault: false, formatter: (c) => formatDateTime(c.certificacaoRealizadaEm) },
  { key: "vencSicaq", label: "Venc. SICAQ", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.vencSicaq) },
  { key: "renda", label: "Renda", isSortable: true, isDefault: false },
  { key: "validacao", label: "Validação", isSortable: true, isDefault: false },
  { key: "fgts", label: "FGTS", isSortable: true, isDefault: false },
  { key: "casaFacil", label: "Casa Fácil", isSortable: true, isDefault: false },
  { key: "pesquisas", label: "Pesquisas", isSortable: true, isDefault: false },
  { key: "sehab", label: "SEHAB", isSortable: true, isDefault: false },
  { key: "espelhoEnviado", label: "Espelho Enviado", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.espelhoEnviado) },
  { key: "ccsAprovada", label: "CCS Aprovada", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.ccsAprovada) },
  { key: "faltaFinalizar", label: "Falta Finalizar", isSortable: true, isDefault: false },
  { key: "montagemComplementar", label: "Montagem Complementar", isSortable: true, isDefault: false },
  { key: "montagemCehop", label: "Montagem CEHOP", isSortable: true, isDefault: false },
  { key: "conferenciaCehopNatoEntregueEm", label: "Conf. CEHOP NATO Entregue", isSortable: true, isDefault: false, formatter: (c) => formatDateTime(c.conferenciaCehopNatoEntregueEm) },
  { key: "conferenciaCehopNatoDevolvidaEm", label: "Conf. CEHOP NATO Devolvida", isSortable: true, isDefault: false, formatter: (c) => formatDateTime(c.conferenciaCehopNatoDevolvidaEm) },
  { key: "formulariosEnviadosEm", label: "Formulários Enviados", isSortable: true, isDefault: false, formatter: (c) => formatDateTime(c.formulariosEnviadosEm) },
  { key: "formulariosAssinadosEm", label: "Formulários Assinados", isSortable: true, isDefault: false, formatter: (c) => formatDateTime(c.formulariosAssinadosEm) },
  { key: "enviadoACehop", label: "Enviado a CEHOP", isSortable: true, isDefault: false, formatter: (c) => formatDateTime(c.enviadoACehop) },
  { key: "reenviadoCehop", label: "Reenviado CEHOP", isSortable: true, isDefault: false, formatter: (c) => formatDateTime(c.reenviadoCehop) },
  { key: "preEntrevista", label: "Pré Entrevista", isSortable: true, isDefault: false },
  { key: "certidaoAtualizada", label: "Certidão Atualizada", isSortable: true, isDefault: false },
  { key: "declaracaoEstadoCivil", label: "Declaração Estado Civil", isSortable: true, isDefault: false },
  { key: "entrevistaCef", label: "Entrevista CEF", isSortable: true, isDefault: false, formatter: (c) => formatDateTime(c.entrevistaCef) },
  { key: "minutaRecebida", label: "Minuta Recebida", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.minutaRecebida) },
  { key: "contratoCef", label: "Contrato CEF Agendado", isSortable: true, isDefault: false, formatter: (c) => formatDateTime(c.contratoCef) },
  { key: "devolucaoParaCorrecao", label: "Devolução p/ Correção", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.devolucaoParaCorrecao) },
  { key: "devolvidoCorrigido", label: "Devolvido Corrigido", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.devolvidoCorrigido) },
  { key: "dataDeEnvioDaPastaAgencia", label: "Envio Pasta Agência", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.dataDeEnvioDaPastaAgencia) },

  // === VENDEDOR/AGÊNCIA COMUNICAÇÃO ===
  { key: "enviadoVendedor", label: "Enviado Vendedor", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.enviadoVendedor) },
  { key: "retornoVendedor", label: "Retorno Vendedor", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.retornoVendedor) },
  { key: "enviadoAgencia", label: "Enviado Agência", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.enviadoAgencia) },
  { key: "retornoAgencia", label: "Retorno Agência", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.retornoAgencia) },
  
  // === COHAPAR ===
  { key: "solicitacaoCohapar", label: "Solicitação Cohapar", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.solicitacaoCohapar) },
  { key: "cohaparAprovada", label: "Cohapar Aprovada", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.cohaparAprovada) },
  { key: "cartaCohapar", label: "Carta Cohapar", isSortable: false, isDefault: false },
  
  // === OUTROS ===
  { key: "produto", label: "Produto", isSortable: true, isDefault: false },
  { key: "imobiliaria", label: "Imobiliária", isSortable: true, isDefault: false },
  { key: "portaDeEntrada", label: "Porta de Entrada", isSortable: true, isDefault: false },
  { key: "formaPagamentoRi", label: "Forma Pgto RI", isSortable: true, isDefault: false },
  { key: "dataEmissaoNF", label: "Data Emissão NF", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.dataEmissaoNF) },
  { key: "dataEnvioLiberacaoGarantia", label: "Envio Lib. Garantia", isSortable: true, isDefault: false, formatter: (c) => formatDate(c.dataEnvioLiberacaoGarantia) },
  { key: "workflowId", label: "Workflow", isSortable: true, isDefault: false },
  { key: "documentacaoRepasse", label: "Doc. e Repasse", isSortable: false, isDefault: false },
];

// Lista de campos de data para a importação.
// Garante que o conversor de datas no firestoreService.js processe todos os campos relevantes.
export const DATE_FIELDS_IMPORT = [
  // Campos que já existiam
  "dataMinuta",
  "dataAssinaturaCliente",
  "enviadoVendedor",
  "retornoVendedor",
  "enviadoAgencia",
  "retornoAgencia",
  "solicitaITBI",
  "retiradaITBI",
  "enviadoPgtoItbi",
  "retornoPgtoItbi",
  "dataEntradaRegistro",
  "dataAnaliseRegistro",
  "dataPrevistaRegistro",
  "dataRetornoRi",
  "dataSolicitacaoFunrejus", // Adicionado para consistência
  "dataEmissaoFunrejus",
  "funrejusEnviadoPgto",
  "funrejusRetornoPgto",
  "dataRetiradaContratoRegistrado",
  "dataEnvioLiberacaoGarantia",
  "dataConformidadeCehop",
  "dataEmissaoNF",

  // CAMPOS QUE FALTAVAM (AQUI ESTÁ A CORREÇÃO PRINCIPAL)
  "entrada",
  "certificacaoSolicEm",
  "certificacaoRealizadaEm",
  "solicitacaoCohapar",
  "cohaparAprovada",
  "vencSicaq",
  "agendamentoFormulario",
  "formulariosEnviadosEm",
  "formulariosAssinadosEm",
  "entregueCehop",
  "devolucaoParaCorrecao",
  "devolvidoCorrigido",
  "enviadoACehop",
  "conformeEm",
  "dataDeEnvioDaPastaAgencia",
  "entrevistaCef",
  "contratoCef",
  "conferenciaCehopNatoEntregueEm",
  "conferenciaCehopNatoDevolvidaEm",

  // Campos com nomes em lowercase que também são datas
  "enviadoagencia",
  "retornoagencia", 
  "solicitaitbi",
  "retiradaitbi",
  "enviadopgtoitbi",
  "retornopgtoitbi",
  "funrejusenviadopgto",
  "funrejusretornopgto",
  "dataconformidadecehop",
  "dataemissaofunrejus",
  "dataemissaonf",
  "dataenvioliberacaogarantia"
];

// Lista de campos numéricos para a importação
// Garante que valores sejam convertidos para números ao invés de strings
export const NUMERIC_FIELDS_IMPORT = [
  "valorITBI",
  "valorDepositoRi", 
  "valorFinalRi",
  "valorfunrejus",
  "valorRepasse",
  "entrada", // valor de entrada quando não for data
  "iptu" // quando for valor numérico
];

// Mapeamento de campos lowercase para PascalCase
// Corrige inconsistências de nomenclatura entre CSV e banco
export const FIELD_CASE_MAPPING = {
  // Campos de data
  "enviadovendedor": "enviadoVendedor",
  "retornovendedor": "retornoVendedor", 
  "enviadoagencia": "enviadoAgencia",
  "retornoagencia": "retornoAgencia",
  "solicitaitbi": "solicitaITBI",
  "retiradaitbi": "retiradaITBI",
  "enviadopgtoitbi": "enviadoPgtoItbi",
  "retornopgtoitbi": "retornoPgtoItbi",
  "dataemissaofunrejus": "dataEmissaoFunrejus",
  "funrejusenviadopgto": "funrejusEnviadoPgto",
  "funrejusretornopgto": "funrejusRetornoPgto",
  "dataenvioliberacaogarantia": "dataEnvioLiberacaoGarantia",
  "dataconformidadecehop": "dataConformidadeCehop",
  "dataemissaonf": "dataEmissaoNF",
  
  // Campos de texto/outros
  "formapagamentori": "formaPagamentoRi",
  "codigocca": "codigoCCA",
  "tipoconsulta": "tipoConsulta",
  "chaveconsulta": "chaveConsulta",
  "ncontratocef": "nContratoCEF",
  "protocolo": "protocoloRi"
};

// Configurações para importação CSV
export const CSV_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  SUPPORTED_EXTENSIONS: ['.csv'],
  AI_TIMEOUT: 30000, // 30 segundos
  FALLBACK_ENABLED: true,
  REQUIRED_COLUMNS: ['id'], // Colunas obrigatórias mínimas
  RECOMMENDED_COLUMNS: ['cliente', 'empreendimento', 'status'],
  
  // Mapeamento de colunas comuns para padronização
  COLUMN_MAPPING: {
    'cliente': 'clientePrincipal',
    'nome_cliente': 'clientePrincipal',
    'nome do cliente': 'clientePrincipal',
    'vendedor': 'vendedorConstrutora',
    'vendedor_construtora': 'vendedorConstrutora',
    'vendedor construtora': 'vendedorConstrutora',
    'projeto': 'empreendimento',
    'data_entrada': 'dataEntradaRegistro',
    'data entrada': 'dataEntradaRegistro',
    'data_assinatura': 'dataAssinaturaCliente',
    'data assinatura': 'dataAssinaturaCliente',
    'valor_itbi': 'valorITBI',
    'valor itbi': 'valorITBI',
    'contrato_cef': 'nContratoCEF',
    'contrato cef': 'nContratoCEF',
    'n_contrato_cef': 'nContratoCEF',
    'numero contrato cef': 'nContratoCEF'
  }
};
