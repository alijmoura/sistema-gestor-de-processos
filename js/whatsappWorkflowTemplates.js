/**
 * @file whatsappWorkflowTemplates.js
 * @description Templates de workflows pré-configurados para WhatsApp
 * 
 * Templates disponíveis:
 * - Coleta de dados básicos
 * - Qualificação de lead
 * - Triagem de atendimento
 * - Agendamento de visita
 * - Feedback pós-atendimento
 * 
 * Data: 2025-11-14
 */

import whatsappBot from './whatsappBot.js';

const {ACTION_TYPES, VALIDATION_TYPES} = whatsappBot;

/**
 * Template: Coleta de Dados Básicos
 * Coleta nome, email e telefone do cliente antes de transferir para humano
 */
export const WORKFLOW_COLETA_DADOS_BASICOS = {
  name: ' Coleta de Dados Básicos',
  description: 'Coleta nome, email, telefone e CPF do cliente antes de direcionar para triagem',
  active: true,
  priority: 10,
  triggers: [
    {
      type: 'first_message'
    }
  ],
  steps: [
    {
      action: ACTION_TYPES.SEND_MESSAGE,
      message: 'Olá! Bem-vindo à Sistema Gestor de Processos. \n\nAntes de iniciar o atendimento, preciso coletar algumas informações básicas.'
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Por favor, qual é o seu nome completo?',
      variableName: 'nome_cliente',
      validationType: VALIDATION_TYPES.TEXT
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Obrigado, {{nome_cliente}}! \n\nPor favor, qual é o seu email para contato?',
      variableName: 'email_cliente',
      validationType: VALIDATION_TYPES.EMAIL
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Perfeito! Agora, qual é o seu telefone de contato? (apenas números)',
      variableName: 'telefone_cliente',
      validationType: VALIDATION_TYPES.PHONE
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Ótimo! Por último, qual é o seu CPF? (apenas números)',
      variableName: 'cpf_cliente',
      validationType: VALIDATION_TYPES.CPF
    },
    {
      action: ACTION_TYPES.SEND_MESSAGE,
      message: 'Excelente, {{nome_cliente}}! \n\nRecebi suas informações:\n Nome: {{nome_cliente}}\n Email: {{email_cliente}}\n Telefone: {{telefone_cliente}}\n CPF: {{cpf_cliente}}'
    },
    {
      action: 'save_customer_summary',
      summaryTemplate: ' Cliente: {{nome_cliente}}\n Email: {{email_cliente}}\n Telefone: {{telefone_cliente}}\n CPF: {{cpf_cliente}}\n\n Dados coletados automaticamente pelo bot em contato inicial'
      // Sem confirmationMessage - o menu já será a próxima mensagem
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Sobre qual assunto você gostaria de falar?\n\n1⃣ Aprovação\n2⃣ Formulários\n3⃣ CEHOP\n4⃣ Registro\n5⃣ Individual\n\nDigite o número correspondente ao departamento desejado:',
      variableName: 'departamento_numero',
      validationType: VALIDATION_TYPES.OPTION,
      validationOptions: { maxOptions: 5 }
    },
    {
      action: ACTION_TYPES.TRANSFER_HUMAN,
      message: 'Perfeito! Vou conectar você com o departamento escolhido. Aguarde um momento...',
      department: null // Será definido pelo código legado do backend
    }
  ]
};

// NOTA: O backend (functions/index.js) já tem lógica que intercepta números 1-5
// e define o departamento automaticamente. O workflow apenas coleta o número.

/**
 * Template: Qualificação de Lead
 * Qualifica o lead perguntando sobre o interesse e urgência
 */
export const WORKFLOW_QUALIFICACAO_LEAD = {
  name: ' Qualificação de Lead',
  description: 'Qualifica leads perguntando sobre interesse, orçamento e urgência antes de atribuir ao comercial',
  active: false,
  priority: 8,
  triggers: [
    {
      type: 'department',
      department: 'Comercial'
    }
  ],
  steps: [
    {
      action: ACTION_TYPES.SEND_MESSAGE,
      message: 'Olá! Obrigado por entrar em contato com o setor Comercial da Sistema Gestor de Processos. '
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Para melhor atendê-lo, qual é o seu nome?',
      variableName: 'nome_lead',
      validationType: VALIDATION_TYPES.TEXT
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Prazer, {{nome_lead}}! \n\nQual tipo de serviço você está buscando?\n\n1⃣ Correspondência\n2⃣ Assessoria jurídica\n3⃣ Registro de imóveis\n4⃣ Outro\n\nDigite o número da opção:',
      variableName: 'tipo_servico',
      validationType: VALIDATION_TYPES.OPTION,
      validationOptions: { maxOptions: 4 }
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Entendi! E qual é o nível de urgência?\n\n1⃣ Urgente (preciso agora)\n2⃣ Médio (próximos dias)\n3⃣ Baixo (apenas pesquisando)\n\nDigite o número:',
      variableName: 'urgencia',
      validationType: VALIDATION_TYPES.OPTION,
      validationOptions: { maxOptions: 3 }
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Você já possui orçamento definido para este serviço?',
      variableName: 'tem_orcamento',
      validationType: VALIDATION_TYPES.YES_NO
    },
    {
      action: ACTION_TYPES.SEND_MESSAGE,
      message: 'Perfeito, {{nome_lead}}! \n\nRecebi suas informações e vou conectar você com nosso time comercial.'
    },
    {
      action: ACTION_TYPES.ADD_TAG,
      tagId: 'lead_qualificado'
    },
    {
      action: ACTION_TYPES.TRANSFER_HUMAN,
      message: 'Aguarde um momento enquanto conecto você com um consultor...',
      department: 'Comercial'
    }
  ]
};

/**
 * Template: Triagem de Atendimento
 * Menu interativo para direcionar cliente ao departamento correto
 */
export const WORKFLOW_TRIAGEM_ATENDIMENTO = {
  name: ' Triagem de Atendimento',
  description: 'Menu interativo para direcionar o cliente ao departamento correto',
  active: false, //  DESATIVADO: Conflitava com Coleta de Dados Básicos
  priority: 15,
  triggers: [
    {
      type: 'first_message'
    }
  ],
  steps: [
    {
      action: ACTION_TYPES.SEND_MESSAGE,
      message: 'Olá! Bem-vindo à Sistema Gestor de Processos! \n\nSobre qual assunto você gostaria de falar?'
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: '1⃣ Aprovação de documentos\n2⃣ Formulários\n3⃣ CEHOP\n4⃣ Registro de imóveis\n5⃣ Atendimento geral\n\nDigite o número correspondente ao departamento desejado:',
      variableName: 'departamento_escolhido',
      validationType: VALIDATION_TYPES.OPTION,
      validationOptions: { maxOptions: 5 }
    },
    {
      action: ACTION_TYPES.CONDITION,
      condition: {
        variable: 'departamento_escolhido',
        operator: 'equals',
        value: 1
      },
      ifTrueStep: 3,
      ifFalseStep: 4
    },
    {
      action: ACTION_TYPES.SET_DEPARTMENT,
      department: 'Aprovação'
    },
    {
      action: ACTION_TYPES.CONDITION,
      condition: {
        variable: 'departamento_escolhido',
        operator: 'equals',
        value: 2
      },
      ifTrueStep: 5,
      ifFalseStep: 6
    },
    {
      action: ACTION_TYPES.SET_DEPARTMENT,
      department: 'Formularios'
    },
    {
      action: ACTION_TYPES.CONDITION,
      condition: {
        variable: 'departamento_escolhido',
        operator: 'equals',
        value: 3
      },
      ifTrueStep: 7,
      ifFalseStep: 8
    },
    {
      action: ACTION_TYPES.SET_DEPARTMENT,
      department: 'CEHOP'
    },
    {
      action: ACTION_TYPES.CONDITION,
      condition: {
        variable: 'departamento_escolhido',
        operator: 'equals',
        value: 4
      },
      ifTrueStep: 9,
      ifFalseStep: 10
    },
    {
      action: ACTION_TYPES.SET_DEPARTMENT,
      department: 'Registro'
    },
    {
      action: ACTION_TYPES.SET_DEPARTMENT,
      department: 'Individual'
    },
    {
      action: ACTION_TYPES.TRANSFER_HUMAN,
      message: 'Sua conversa foi encaminhada. Em breve você será atendido por um de nossos especialistas.',
      department: null // Usa o departamento definido anteriormente
    }
  ]
};

/**
 * Template: Agendamento de Visita
 * Coleta informações para agendar visita técnica
 */
export const WORKFLOW_AGENDAMENTO_VISITA = {
  name: ' Agendamento de Visita',
  description: 'Coleta informações para agendar visita técnica ou reunião',
  active: false,
  priority: 5,
  triggers: [
    {
      type: 'keyword',
      keywords: ['agendar', 'visita', 'reunião', 'reuniao', 'horário', 'horario']
    }
  ],
  steps: [
    {
      action: ACTION_TYPES.SEND_MESSAGE,
      message: 'Perfeito! Vou te ajudar a agendar uma visita. '
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Primeiro, qual é o seu nome completo?',
      variableName: 'nome_agendamento',
      validationType: VALIDATION_TYPES.TEXT
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Obrigado, {{nome_agendamento}}! \n\nQual é o seu telefone para contato?',
      variableName: 'telefone_agendamento',
      validationType: VALIDATION_TYPES.PHONE
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Qual endereço completo da visita? (Rua, número, bairro, cidade)',
      variableName: 'endereco_visita',
      validationType: VALIDATION_TYPES.TEXT
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Qual data você prefere para a visita? (formato DD/MM/AAAA)',
      variableName: 'data_preferida',
      validationType: VALIDATION_TYPES.DATE
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Qual período você prefere?\n\n1⃣ Manhã (08h às 12h)\n2⃣ Tarde (13h às 17h)\n\nDigite o número:',
      variableName: 'periodo_preferido',
      validationType: VALIDATION_TYPES.OPTION,
      validationOptions: { maxOptions: 2 }
    },
    {
      action: ACTION_TYPES.SEND_MESSAGE,
      message: 'Perfeito! \n\nResumo do agendamento:\n Nome: {{nome_agendamento}}\n Telefone: {{telefone_agendamento}}\n Endereço: {{endereco_visita}}\n Data: {{data_preferida}}\n Período: {{periodo_preferido}}'
    },
    {
      action: ACTION_TYPES.ADD_TAG,
      tagId: 'agendamento_visita'
    },
    {
      action: ACTION_TYPES.TRANSFER_HUMAN,
      message: 'Vou transferir para nossa equipe confirmar o agendamento. Aguarde um momento...',
      department: 'Registro'
    }
  ]
};

/**
 * Template: Feedback Pós-Atendimento
 * Coleta feedback após atendimento finalizado
 */
export const WORKFLOW_FEEDBACK_POS_ATENDIMENTO = {
  name: '⭐ Feedback Pós-Atendimento',
  description: 'Coleta feedback e avaliação após atendimento finalizado',
  active: false,
  priority: 3,
  triggers: [
    {
      type: 'keyword',
      keywords: ['finalizado', 'resolvido', 'obrigado', 'obrigada']
    }
  ],
  steps: [
    {
      action: ACTION_TYPES.SEND_MESSAGE,
      message: 'Ficamos felizes em ajudar! \n\nSua opinião é muito importante para nós.'
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Como você avalia o atendimento que recebeu?\n\n1⃣ ⭐ Ruim\n2⃣ ⭐⭐ Regular\n3⃣ ⭐⭐⭐ Bom\n4⃣ ⭐⭐⭐⭐ Muito Bom\n5⃣ ⭐⭐⭐⭐⭐ Excelente\n\nDigite o número:',
      variableName: 'avaliacao',
      validationType: VALIDATION_TYPES.OPTION,
      validationOptions: { maxOptions: 5 }
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Você recomendaria nossos serviços?',
      variableName: 'recomendaria',
      validationType: VALIDATION_TYPES.YES_NO
    },
    {
      action: ACTION_TYPES.COLLECT_DATA,
      question: 'Tem algum comentário ou sugestão? (opcional - digite "não" para pular)',
      variableName: 'comentario',
      validationType: VALIDATION_TYPES.TEXT
    },
    {
      action: ACTION_TYPES.SEND_MESSAGE,
      message: 'Muito obrigado pelo seu feedback! \n\nSua avaliação nos ajuda a melhorar continuamente nossos serviços.'
    },
    {
      action: ACTION_TYPES.ADD_TAG,
      tagId: 'feedback_coletado'
    },
    {
      action: ACTION_TYPES.END_WORKFLOW,
      message: 'Se precisar de algo mais, estamos à disposição! Até logo! '
    }
  ]
};

/**
 * Cria workflows padrão no Firestore
 */
export async function criarWorkflowsPadrao(db, userId) {
  const templates = [
    WORKFLOW_COLETA_DADOS_BASICOS,
    WORKFLOW_QUALIFICACAO_LEAD,
    WORKFLOW_TRIAGEM_ATENDIMENTO,
    WORKFLOW_AGENDAMENTO_VISITA,
    WORKFLOW_FEEDBACK_POS_ATENDIMENTO
  ];

  const results = [];

  for (const template of templates) {
    try {
      // Verificar se já existe
      const existingQuery = await db.collection('whatsappWorkflows')
        .where('name', '==', template.name)
        .limit(1)
        .get();

      if (!existingQuery.empty) {
        console.log(`[whatsappWorkflowTemplates] Template "${template.name}" já existe`);
        continue;
      }

      // Criar novo
      const docRef = await db.collection('whatsappWorkflows').add({
        ...template,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: userId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: userId
      });

      console.log(`[whatsappWorkflowTemplates] Template "${template.name}" criado com ID: ${docRef.id}`);
      results.push({ success: true, name: template.name, id: docRef.id });

    } catch (error) {
      console.error(`[whatsappWorkflowTemplates] Erro ao criar template "${template.name}":`, error);
      results.push({ success: false, name: template.name, error: error.message });
    }
  }

  // Invalidar cache
  whatsappBot.invalidateWorkflowCache();

  return results;
}

export default {
  WORKFLOW_COLETA_DADOS_BASICOS,
  WORKFLOW_QUALIFICACAO_LEAD,
  WORKFLOW_TRIAGEM_ATENDIMENTO,
  WORKFLOW_AGENDAMENTO_VISITA,
  WORKFLOW_FEEDBACK_POS_ATENDIMENTO,
  criarWorkflowsPadrao
};
