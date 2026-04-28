/**
 * Configuração padrão dos Workflows do sistema.
 * Define os tipos de processos e seus estágios iniciais.
 */

export const WORKFLOW_TYPES = {
  INDIVIDUAL: 'individual',
  ASSOCIATIVO: 'associativo'
};

// Lista completa de status para referência e fallback
const ALL_STATUSES = [
  'Aguardando', 'Em Análise', 'Aprovado', 'Formulários', 'Formularios enviados',
  'Validação COHAPAR', 'Aguardando CCS', 'Em certificação', 'Certificação Realizada em Montagem',
  'Internalizado', 'Pendência', 'Finalização CEHOP', 'Entrevista Banco', 'Diferença de valores',
  'Contrato IR', 'Reavaliação', 'Entrevista realizada - Pendente', 'Reprovado',
  'Pré-Conferência - CEHOP', 'Restrição', 'Formulários (CEHOP)', 'Formulários enviados',
  'Demanda Mínima', 'CEHOP', 'CEHOP - Inconforme', 'SIOPI', 'Aguardando Minuta',
  'Minuta recebida - Conferência de valores', 'Minuta Recebida - Aguardando edição',
  'Minuta Editada - Aguardando assinatura cliente', 'Em assinatura vendedor', 'Em assinatura Banco',
  'Registro', 'Em preparação - Emissão ITBI', 'ITBI enviado para pagamento', 'ITBI quitado',
  'Envio ao Registro', 'Em registro - FUNREJUS pendente', 'Em registro - FUNREJUS aguardando pagamento',
  'Em registro - Exigência', 'Em registro - Ag. análise RI', 'Em registro - aguardando finalização RI',
  'Registrado', 'Liberação da garantia - enviado CEHOP', 'Liberação da Garantia Inconforme – em tratativa',
  'Liberação da Garantia Conforme', 'Contrato registrado - anexar SIOPI',
  'Finalização - Pendente aviso cliente/banco', 'Finalização - Solicitar troca titularidade IPTU',
  'Finalização - Solicitar repasse despachante', 'Finalização - Aguardando repasse despachante',
  'Finalizado/Concluído', 'Em Distrato/Problemas', 'Distrato'
];

export const DEFAULT_WORKFLOWS = [
  {
    id: WORKFLOW_TYPES.INDIVIDUAL,
    name: 'Processo Individual',
    description: 'Fluxo para processos de financiamento individual',
    active: true,
    stages: ALL_STATUSES, // Usa todos os status
    requiredDocuments: ['RG', 'CPF', 'Comprovante de Renda', 'Comprovante de Residência']
  },
  {
    id: WORKFLOW_TYPES.ASSOCIATIVO,
    name: 'Processo Associativo',
    description: 'Fluxo para processos de financiamento associativo (PJ)',
    active: true,
    stages: ALL_STATUSES, // Usa todos os status
    requiredDocuments: ['RG', 'CPF', 'Comprovante de Renda', 'Comprovante de Residência']
  }
];

/**
 * Estrutura de permissões de usuário
 */
export const PERMISSION_LEVELS = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  ANALYST: 'analyst',
  VIEWER: 'viewer'
};

export const DEFAULT_USER_PERMISSIONS = {
  role: PERMISSION_LEVELS.ANALYST,
  allowedWorkflows: [WORKFLOW_TYPES.INDIVIDUAL, WORKFLOW_TYPES.ASSOCIATIVO], // Acesso a todos por padrão
  allowedVendors: [], // Array vazio = todos
  minStageVisibility: null // null = ver desde o início
};
