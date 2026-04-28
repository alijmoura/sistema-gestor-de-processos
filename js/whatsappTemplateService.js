/**
 * WhatsApp Template Service
 * Gerencia envio de Message Templates aprovados pela Meta
 * Permite iniciar conversas fora da janela de 24h
 */

/**
 * Templates disponíveis (devem estar aprovados no Meta Business Manager)
 * 
 * IMPORTANTE: Estes templates precisam ser criados e aprovados no Meta Business Manager
 * https://business.facebook.com/ → WhatsApp Manager → Message Templates
 */
const AVAILABLE_TEMPLATES = {
  // Template de apresentação
  apresentacao: {
    name: 'apresentacao',
    displayName: ' Apresentação',
    description: 'Olá! Recebemos o teu pedido de contato na Sistema Gestor de Processos...',
    language: 'pt_BR',
    category: 'UTILITY',
    example: `Olá Alisson!

Recebemos o teu pedido de contato na Sistema Gestor de Processos referente a Compra do APTO 01 BL 01 do Residencial Monte.

A tua solicitação foi registrada com o número PRO1234. Um dos nossos especialistas entrará em contato em breve para ajudar.

Obrigado!`,
    parameters: [
      { name: 'nome', label: 'Nome do Cliente', placeholder: 'Ex: Alisson', required: true },
      { name: 'assunto', label: 'Assunto do Pedido', placeholder: 'Ex: Compra do APTO 01 BL 01 do Residencial Monte', required: true },
      { name: 'numero', label: 'Número da Solicitação', placeholder: 'Ex: PRO1234', required: true }
    ],
    buildComponents: (params) => [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: params.nome || 'Cliente' },
          { type: 'text', text: params.assunto || '[ASSUNTO]' },
          { type: 'text', text: params.numero || '[NÚMERO]' }
        ]
      }
    ]
  },

  // Template de confirmação de agendamento
  confirmacao_agendamento: {
    name: 'confirmacao_agendamento',
    displayName: ' Confirmação de Agendamento',
    description: 'Olá! Temos um agendamento para você...',
    language: 'pt_BR',
    category: 'UTILITY',
    example: `Olá! Alisson, 
Temos um agendamento para você no dia 29/11/2025 às 15:30. Você confirma?`,
    parameters: [
      { name: 'nome', label: 'Nome do Cliente', placeholder: 'Ex: Alisson', required: true },
      { name: 'data', label: 'Data', placeholder: 'Ex: 29/11/2025', required: true },
      { name: 'hora', label: 'Hora', placeholder: 'Ex: 15:30', required: true }
    ],
    buildComponents: (params) => [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: params.nome || 'Cliente' },
          { type: 'text', text: params.data || '[DATA]' },
          { type: 'text', text: params.hora || '[HORA]' }
        ]
      }
    ]
  },

  // Template de atualização de processo
  atualizacao_processo: {
    name: 'atualizacao_processo',
    displayName: ' Atualização de Processo',
    description: 'A Sistema Gestor de Processos tem uma atualização sobre o teu processo...',
    language: 'pt_BR',
    category: 'UTILITY',
    example: `Olá Alisson.

A Sistema Gestor de Processos tem uma atualização sobre o teu processo.

O status atual é: Aguardando emissão ITBI.

Estamos a disposição!`,
    parameters: [
      { name: 'nome', label: 'Nome do Cliente', placeholder: 'Ex: Alisson', required: true },
      { name: 'status', label: 'Status do Processo', placeholder: 'Ex: Aguardando emissão ITBI', required: true }
    ],
    buildComponents: (params) => [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: params.nome || 'Cliente' },
          { type: 'text', text: params.status || '[STATUS]' }
        ]
      }
    ]
  },

  // Template de retorno de atendimento
  retorna_atendimento: {
    name: 'retorna_atendimento',
    displayName: ' Retomar Atendimento',
    description: 'Gostaríamos de retomar o seu atendimento que ficou pendente...',
    language: 'pt_BR',
    category: 'UTILITY',
    example: `Olá Alisson. Gostaríamos de retomar o seu atendimento sobre aprovação e dúvidas que ficou pendente. Podemos prosseguir agora?`,
    parameters: [
      { name: 'nome', label: 'Nome do Cliente', placeholder: 'Ex: Alisson', required: true },
      { name: 'assunto', label: 'Assunto Pendente', placeholder: 'Ex: aprovação e dúvidas', required: true }
    ],
    buildComponents: (params) => [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: params.nome || 'Cliente' },
          { type: 'text', text: params.assunto || '[ASSUNTO]' }
        ]
      }
    ]
  }
};

/**
 * Renderiza o texto do template substituindo os parâmetros
 * @param {string} templateId - ID do template
 * @param {Object} parameters - Parâmetros para preencher
 * @returns {string} Texto renderizado
 */
function renderTemplateText(templateId, parameters = {}) {
  const template = AVAILABLE_TEMPLATES[templateId];
  if (!template) return '';

  // Templates com texto formatado
  const templateTexts = {
    apresentacao: `Olá ${parameters.nome || '{{1}}'}!

Recebemos o teu pedido de contato na Sistema Gestor de Processos referente a ${parameters.assunto || '{{2}}'}.

A tua solicitação foi registrada com o número ${parameters.numero || '{{3}}'}. Um dos nossos especialistas entrará em contato em breve para ajudar.

Obrigado!`,

    confirmacao_agendamento: `Olá! ${parameters.nome || '{{1}}'}, 
Temos um agendamento para você no dia ${parameters.data || '{{2}}'} às ${parameters.hora || '{{3}}'}. Você confirma?`,

    atualizacao_processo: `Olá ${parameters.nome || '{{1}}'}.

A Sistema Gestor de Processos tem uma atualização sobre o teu processo.

O status atual é: ${parameters.status || '{{2}}'}

Estamos a disposição!`,

    retorna_atendimento: `Olá ${parameters.nome || '{{1}}'}. Gostaríamos de retomar o seu atendimento sobre ${parameters.assunto || '{{2}}'} que ficou pendente. Podemos prosseguir agora?`
  };

  return templateTexts[templateId] || `[Template: ${template.displayName}]`;
}

/**
 * Envia Message Template para contato
 * @param {string} to - Número do destinatário
 * @param {string} templateName - Nome do template (chave de AVAILABLE_TEMPLATES)
 * @param {Object} parameters - Parâmetros para preencher template
 * @param {Object} options - Opções adicionais de envio
 * @returns {Promise<{success: boolean, messageId: string}>}
 */
async function sendTemplate(to, templateName, parameters = {}, options = {}) {
  const template = AVAILABLE_TEMPLATES[templateName];
  const requestedPhoneNumberId = typeof options?.phoneNumberId === 'string' ? options.phoneNumberId.trim() : '';
  
  if (!template) {
    throw new Error(`Template "${templateName}" não encontrado. Templates disponíveis: ${Object.keys(AVAILABLE_TEMPLATES).join(', ')}`);
  }

  try {
    // Construir componentes se template tiver parâmetros
    let components = template.components || [];
    if (template.buildComponents && Object.keys(parameters).length > 0) {
      components = template.buildComponents(parameters);
    }

    // Renderizar texto do template para exibição no histórico
    const renderedText = renderTemplateText(templateName, parameters);

    // Chamar Cloud Function
    const sendWhatsAppTemplate = firebase.app().functions('southamerica-east1').httpsCallable('sendWhatsAppTemplate');
    const payload = {
      to,
      templateName: template.name,
      templateDisplayName: template.displayName,
      languageCode: template.language,
      components,
      renderedText,
      parameters
    };

    if (requestedPhoneNumberId) {
      payload.phoneNumberId = requestedPhoneNumberId;
    }

    const result = await sendWhatsAppTemplate(payload);

    if (window.__DEBUG__) {
      console.log('[whatsappTemplateService] Template enviado:', {
        to,
        templateName,
        parameters,
        requestedPhoneNumberId: requestedPhoneNumberId || null,
        result: result.data
      });
    }

    return result.data;
  } catch (err) {
    console.error('[whatsappTemplateService] Erro ao enviar template:', err);
    
    // Tratamento de erros específicos do Firebase Functions
    const errorMessage = err.message || '';
    const errorCode = err.code || '';
    
    // Erro de template não encontrado/aprovado (132000, 132001)
    if (errorMessage.includes('não encontrado') || errorMessage.includes('não aprovado') || errorMessage.includes('não existe') || errorMessage.includes('132000') || errorMessage.includes('132001')) {
      const specificMsg = errorMessage.includes('132001') || errorMessage.includes('não existe')
        ? ` Template "${template.displayName}" não existe no Meta Business Manager!\n\n O nome do template no código é: "${template.name}"\n\n Soluções:\n1. Acesse https://business.facebook.com/ → WhatsApp Manager → Message Templates\n2. Verifique se existe um template com o nome EXATAMENTE igual: "${template.name}"\n3. Se o nome estiver diferente, crie um novo template com este nome\n4. Aguarde aprovação da Meta (pode levar até 24h)\n5. Status deve estar APROVADO (verde)`
        : ` Template "${template.displayName}" não está aprovado no Meta Business Manager.\n\n Acesse https://business.facebook.com/ → WhatsApp Manager → Message Templates e aprove o template "${template.name}".`;
      
      throw new Error(specificMsg);
    }
    
    // Erro de parâmetros inválidos (133016)
    if (errorMessage.includes('Parâmetros') || errorMessage.includes('inválidos') || errorMessage.includes('133016')) {
      throw new Error(` Parâmetros inválidos para o template "${template.displayName}".\n\nVerifique se todos os campos obrigatórios foram preenchidos corretamente.`);
    }
    
    // Erro de número bloqueado (131047)
    if (errorMessage.includes('131047') || errorMessage.includes('bloqueou') || errorMessage.includes('permission-denied')) {
      throw new Error(' O número bloqueou mensagens ou não está registrado no WhatsApp.\n\nVerifique se o número está ativo e não bloqueou sua empresa.');
    }
    
    // Erro de qualidade do ecossistema (131049)
    if (errorMessage.includes('131049') || errorMessage.includes('ecosystem engagement') || errorMessage.includes('failed-precondition')) {
      throw new Error(` WhatsApp bloqueou o template "${template.displayName}" para este destinatário.\n\n Possíveis causas:\n• O destinatário não interage há muito tempo\n• Baixa taxa de resposta do template\n• WhatsApp considera o conteúdo repetitivo\n\n Soluções:\n1. Aguarde o usuário iniciar uma conversa\n2. Use outro template aprovado\n3. Verifique a qualidade do template no Meta Business Manager`);
    }
    
    // Erro de autenticação
    if (errorCode === 'unauthenticated' || errorMessage.includes('autenticação')) {
      throw new Error(' Erro de autenticação. Faça login novamente.');
    }
    
    // Erro de configuração do WhatsApp
    if (errorMessage.includes('WhatsApp ativo configurado') || errorMessage.includes('Phone Number ID') || errorMessage.includes('Access Token')) {
      throw new Error(` Configuração do WhatsApp incompleta.\n\n${errorMessage}\n\n Acesse Configurações > WhatsApp e configure seu número corretamente.`);
    }
    
    // Log detalhado do erro para debug
    console.error('[whatsappTemplateService] Detalhes do erro:', {
      errorCode,
      errorMessage,
      fullError: err
    });
    
    // Erro genérico com mensagem original
    if (errorMessage) {
      throw new Error(` Erro ao enviar template: ${errorMessage}`);
    }
    
    throw err;
  }
}

/**
 * Obtém lista de templates disponíveis
 * @returns {Array} Lista de templates com metadados
 */
function getAvailableTemplates() {
  return Object.entries(AVAILABLE_TEMPLATES).map(([key, template]) => ({
    id: key,
    name: template.name,
    displayName: template.displayName,
    description: template.description,
    category: template.category,
    example: template.example,
    hasParameters: (template.parameters && template.parameters.length > 0),
    parameters: template.parameters || []
  }));
}

/**
 * Obtém template específico por ID
 * @param {string} templateId - ID do template
 * @returns {Object|null} Template ou null se não encontrado
 */
function getTemplateById(templateId) {
  return AVAILABLE_TEMPLATES[templateId] || null;
}

/**
 * Valida parâmetros do template
 * @param {string} templateId - ID do template
 * @param {Object} parameters - Parâmetros fornecidos
 * @returns {Object} { valid: boolean, errors: Array }
 */
function validateTemplateParameters(templateId, parameters) {
  const template = AVAILABLE_TEMPLATES[templateId];
  
  if (!template) {
    return { valid: false, errors: ['Template não encontrado'] };
  }

  if (!template.parameters || template.parameters.length === 0) {
    return { valid: true, errors: [] };
  }

  const errors = [];
  
  template.parameters.forEach(param => {
    if (!parameters[param.name] || parameters[param.name].trim() === '') {
      errors.push(`Campo "${param.label}" é obrigatório`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

// Exportar API pública
export const whatsappTemplateService = {
  sendTemplate,
  getAvailableTemplates,
  getTemplateById,
  validateTemplateParameters,
  renderTemplateText,
  AVAILABLE_TEMPLATES
};

// Expor globalmente para uso em outros scripts
if (typeof window !== 'undefined') {
  window.__WHATSAPP_TEMPLATE_SERVICE__ = whatsappTemplateService;
}
