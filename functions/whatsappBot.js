/**
 *  WhatsApp Bot Engine - Versão Backend (Node.js)
 * 
 * Motor de processamento de workflows configuráveis para WhatsApp Business API.
 * Versão adaptada para Cloud Functions (sem dependências do navegador).
 */

const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

// ===== CONSTANTES =====

const VALIDATION_TYPES = {
  TEXT: 'text',
  NUMBER: 'number',
  EMAIL: 'email',
  PHONE: 'phone',
  CPF: 'cpf',
  CNPJ: 'cnpj',
  DATE: 'date',
  OPTION: 'option',
  YES_NO: 'yes_no',
  REGEX: 'regex'
};

const ACTION_TYPES = {
  SEND_MESSAGE: 'send_message',
  COLLECT_DATA: 'collect_data',
  SET_VARIABLE: 'set_variable',
  CONDITION: 'condition',
  ASSIGN_AGENT: 'assign_agent',
  SET_DEPARTMENT: 'set_department',
  ADD_TAG: 'add_tag',
  LINK_CONTRACT: 'link_contract',
  SAVE_CUSTOMER_SUMMARY: 'save_customer_summary',
  END_WORKFLOW: 'end_workflow',
  TRANSFER_HUMAN: 'transfer_human'
};

const BOT_MAX_EXECUTION_MS = 5 * 60 * 1000;
const BOT_MAX_STEPS_PER_MESSAGE = 250;
const BOT_TIMEOUT_FALLBACK_MESSAGE = 'Detectei instabilidade no fluxo automático e vou transferir você para atendimento humano.';

// ===== CLASSE DE SESSÃO =====

class BotSession {
  constructor(chatId, workflowId = null) {
    this.chatId = chatId;
    this.workflowId = workflowId;
    this.currentStep = 0;
    this.variables = {};
    this.collectedData = {};
    this.startedAt = Timestamp.now();
    this.lastActivity = Timestamp.now();
    this.completed = false;
    this.transferredToHuman = false;
  }

  toFirestore() {
    return {
      chatId: this.chatId,
      workflowId: this.workflowId,
      currentStep: this.currentStep,
      variables: this.variables,
      collectedData: this.collectedData,
      startedAt: this.startedAt,
      lastActivity: this.lastActivity,
      completed: this.completed,
      transferredToHuman: this.transferredToHuman
    };
  }

  static fromFirestore(data) {
    const session = new BotSession(data.chatId, data.workflowId);
    session.currentStep = data.currentStep || 0;
    session.variables = data.variables || {};
    session.collectedData = data.collectedData || {};
    session.startedAt = data.startedAt;
    session.lastActivity = data.lastActivity;
    session.completed = data.completed || false;
    session.transferredToHuman = data.transferredToHuman || false;
    return session;
  }
}

// ===== FUNÇÕES DE VALIDAÇÃO =====

function validateInput(input, validationType, options = {}) {
  const trimmedInput = String(input || '').trim();

  if (!trimmedInput && !options.optional) {
    return { valid: false, error: 'Campo obrigatório' };
  }

  if (!trimmedInput && options.optional) {
    return { valid: true, value: null };
  }

  switch (validationType) {
    case VALIDATION_TYPES.TEXT:
      if (options.minLength && trimmedInput.length < options.minLength) {
        return { valid: false, error: `Mínimo ${options.minLength} caracteres` };
      }
      if (options.maxLength && trimmedInput.length > options.maxLength) {
        return { valid: false, error: `Máximo ${options.maxLength} caracteres` };
      }
      return { valid: true, value: trimmedInput };

    case VALIDATION_TYPES.NUMBER:
      const num = parseFloat(trimmedInput);
      if (isNaN(num)) {
        return { valid: false, error: 'Digite apenas números' };
      }
      if (options.min !== undefined && num < options.min) {
        return { valid: false, error: `Valor mínimo: ${options.min}` };
      }
      if (options.max !== undefined && num > options.max) {
        return { valid: false, error: `Valor máximo: ${options.max}` };
      }
      return { valid: true, value: num };

    case VALIDATION_TYPES.EMAIL:
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedInput)) {
        return { valid: false, error: 'Email inválido. Exemplo: nome@email.com' };
      }
      return { valid: true, value: trimmedInput.toLowerCase() };

    case VALIDATION_TYPES.PHONE:
      const phoneDigits = trimmedInput.replace(/\D/g, '');
      if (phoneDigits.length < 10 || phoneDigits.length > 11) {
        return { valid: false, error: 'Telefone inválido. Digite 10 ou 11 dígitos' };
      }
      return { valid: true, value: phoneDigits };

    case VALIDATION_TYPES.CPF:
      const cpfDigits = trimmedInput.replace(/\D/g, '');
      if (cpfDigits.length !== 11) {
        return { valid: false, error: 'CPF deve ter 11 dígitos' };
      }
      return { valid: true, value: cpfDigits };

    case VALIDATION_TYPES.CNPJ:
      const cnpjDigits = trimmedInput.replace(/\D/g, '');
      if (cnpjDigits.length !== 14) {
        return { valid: false, error: 'CNPJ deve ter 14 dígitos' };
      }
      return { valid: true, value: cnpjDigits };

    case VALIDATION_TYPES.DATE:
      const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      const match = trimmedInput.match(dateRegex);
      if (!match) {
        return { valid: false, error: 'Data inválida. Use DD/MM/AAAA' };
      }
      const [, day, month, year] = match;
      const date = new Date(year, month - 1, day);
      if (date.getDate() !== parseInt(day) || date.getMonth() !== parseInt(month) - 1) {
        return { valid: false, error: 'Data não existe' };
      }
      return { valid: true, value: trimmedInput };

    case VALIDATION_TYPES.OPTION:
      const optionNum = parseInt(trimmedInput);
      if (isNaN(optionNum)) {
        return { valid: false, error: 'Digite apenas o número da opção' };
      }
      if (options.validOptions && !options.validOptions.includes(optionNum)) {
        return { valid: false, error: `Opção inválida. Escolha entre: ${options.validOptions.join(', ')}` };
      }
      return { valid: true, value: optionNum };

    case VALIDATION_TYPES.YES_NO:
      const normalized = trimmedInput.toLowerCase();
      const yesVariants = ['sim', 's', 'yes', 'y', '1'];
      const noVariants = ['não', 'nao', 'n', 'no', '0'];
      
      if (yesVariants.includes(normalized)) {
        return { valid: true, value: true };
      }
      if (noVariants.includes(normalized)) {
        return { valid: true, value: false };
      }
      return { valid: false, error: 'Digite "Sim" ou "Não"' };

    case VALIDATION_TYPES.REGEX:
      if (!options.pattern) {
        return { valid: false, error: 'Padrão de validação não configurado' };
      }
      const regex = new RegExp(options.pattern);
      if (!regex.test(trimmedInput)) {
        return { valid: false, error: options.errorMessage || 'Formato inválido' };
      }
      return { valid: true, value: trimmedInput };

    default:
      return { valid: true, value: trimmedInput };
  }
}

// ===== FUNÇÕES DE PROCESSAMENTO =====

async function loadWorkflows(db) {
  try {
    const snapshot = await db.collection('whatsappWorkflows')
      .where('active', '==', true)
      .orderBy('priority', 'desc')
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    logger.error('[whatsappBot] Erro ao carregar workflows:', error);
    return [];
  }
}

async function loadBotSession(db, chatId) {
  try {
    const doc = await db.collection('whatsappBotSessions').doc(chatId).get();
    if (doc.exists) {
      return BotSession.fromFirestore(doc.data());
    }
    return null;
  } catch (error) {
    logger.error('[whatsappBot] Erro ao carregar sessão:', error);
    return null;
  }
}

async function saveBotSession(db, session) {
  try {
    session.lastActivity = Timestamp.now();
    await db.collection('whatsappBotSessions').doc(session.chatId).set(session.toFirestore());
    return true;
  } catch (error) {
    logger.error('[whatsappBot] Erro ao salvar sessão:', error);
    return false;
  }
}

function replaceVariables(text, variables) {
  if (!text) return text;
  
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), value);
  }
  return result;
}

/**
 * Gera resumo padrão do cliente baseado nos dados coletados
 */
function generateDefaultSummary(collectedData, variables) {
  const lines = [];
  
  // Nome
  if (variables.nome_cliente || variables.nome || variables.nome_lead) {
    lines.push(` ${variables.nome_cliente || variables.nome || variables.nome_lead}`);
  }
  
  // Email
  if (variables.email_cliente || variables.email) {
    lines.push(` ${variables.email_cliente || variables.email}`);
  }
  
  // Telefone
  if (variables.telefone_cliente || variables.telefone) {
    lines.push(` ${variables.telefone_cliente || variables.telefone}`);
  }
  
  // CPF/CNPJ
  if (variables.cpf) {
    lines.push(` CPF: ${variables.cpf}`);
  }
  if (variables.cnpj) {
    lines.push(` CNPJ: ${variables.cnpj}`);
  }
  
  // Outros dados relevantes
  const otherFields = Object.keys(variables).filter(key => 
    !['nome_cliente', 'nome', 'nome_lead', 'email_cliente', 'email', 
      'telefone_cliente', 'telefone', 'cpf', 'cnpj', '_department', '_tag'].includes(key)
  );
  
  otherFields.forEach(field => {
    const label = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    lines.push(`• ${label}: ${variables[field]}`);
  });
  
  return lines.length > 0 ? lines.join('\n') : 'Dados do cliente coletados pelo bot';
}

function checkTrigger(workflow, messageText, chatData = {}) {
  if (!workflow.triggers || workflow.triggers.length === 0) {
    return false;
  }

  for (const trigger of workflow.triggers) {
    switch (trigger.type) {
      case 'first_message':
        if (!chatData.hasMessages) {
          return true;
        }
        break;

      case 'keyword':
        if (trigger.keywords && messageText) {
          const lowerText = messageText.toLowerCase();
          for (const keyword of trigger.keywords) {
            if (lowerText.includes(keyword.toLowerCase())) {
              return true;
            }
          }
        }
        break;

      case 'department':
        if (trigger.department && chatData.department === trigger.department) {
          return true;
        }
        break;
    }
  }

  return false;
}

async function executeAction(db, session, step, workflow) {
  const responses = [];
  let moveToNext = true;
  let transferToHuman = false;
  let department = null;

  switch (step.action) {
    case ACTION_TYPES.SEND_MESSAGE:
      const message = replaceVariables(step.message, session.variables);
      responses.push(message);
      break;

    case ACTION_TYPES.COLLECT_DATA:
      const question = replaceVariables(step.question, session.variables);
      responses.push(question);
      moveToNext = false; // Aguarda resposta do usuário
      break;

    case ACTION_TYPES.SET_VARIABLE:
      session.variables[step.variableName] = step.value;
      break;

    case ACTION_TYPES.CONDITION:
      if (step.condition) {
        const varValue = session.variables[step.condition.variable];
        let conditionMet = false;

        switch (step.condition.operator) {
          case 'equals':
            conditionMet = varValue == step.condition.value;
            break;
          case 'not_equals':
            conditionMet = varValue != step.condition.value;
            break;
          case 'greater_than':
            conditionMet = varValue > step.condition.value;
            break;
          case 'less_than':
            conditionMet = varValue < step.condition.value;
            break;
          case 'contains':
            conditionMet = String(varValue).includes(step.condition.value);
            break;
        }

        if (conditionMet && step.ifTrueStep !== undefined) {
          session.currentStep = step.ifTrueStep - 1; // -1 porque será incrementado depois
        } else if (!conditionMet && step.ifFalseStep !== undefined) {
          session.currentStep = step.ifFalseStep - 1;
        }
      }
      break;

    case ACTION_TYPES.SET_DEPARTMENT:
      department = step.department;
      session.variables._department = department;
      
      // Atualizar chat no Firestore
      try {
        await db.collection('chats').doc(session.chatId).update({
          department: department,
          status: 'novo'
        });
      } catch (error) {
        logger.error('[whatsappBot] Erro ao definir departamento:', error);
      }
      break;

    case ACTION_TYPES.ADD_TAG:
      // Tags serão adicionadas no frontend ou em função separada
      session.variables._tag = step.tagId;
      break;

    case ACTION_TYPES.SAVE_CUSTOMER_SUMMARY:
      // Salvar resumo do cliente baseado nos dados coletados
      try {
        const summary = step.summaryTemplate 
          ? replaceVariables(step.summaryTemplate, session.variables)
          : generateDefaultSummary(session.collectedData, session.variables);
        
        // Extrair campos individuais das variáveis coletadas
        const updateData = {
          customerSummary: summary,
          summaryGeneratedAt: Timestamp.now(),
          summaryData: {
            ...session.collectedData,
            generatedBy: 'bot',
            workflowId: session.workflowId
          }
        };

        // Adicionar campos individuais se disponíveis
        if (session.variables.nome_cliente) {
          updateData.customerName = session.variables.nome_cliente;
          updateData.displayName = session.variables.nome_cliente;
        }
        if (session.variables.email_cliente) {
          updateData.customerEmail = session.variables.email_cliente;
        }
        if (session.variables.telefone_cliente) {
          updateData.customerPhone = session.variables.telefone_cliente;
        }
        if (session.variables.cpf_cliente) {
          updateData.customerDocument = session.variables.cpf_cliente;
        }
        
        await db.collection('chats').doc(session.chatId).update(updateData);
        
        logger.info('[whatsappBot] Resumo do cliente salvo:', { chatId: session.chatId });
        
        if (step.confirmationMessage) {
          const confirmation = replaceVariables(step.confirmationMessage, session.variables);
          responses.push(confirmation);
        }
      } catch (error) {
        logger.error('[whatsappBot] Erro ao salvar resumo do cliente:', error);
      }
      break;

    case ACTION_TYPES.TRANSFER_HUMAN:
      transferToHuman = true;
      department = step.department || session.variables._department;
      
      if (step.message) {
        const transferMessage = replaceVariables(step.message, session.variables);
        responses.push(transferMessage);
      }
      
      session.transferredToHuman = true;
      session.completed = true;
      break;

    case ACTION_TYPES.END_WORKFLOW:
      if (step.message) {
        const endMessage = replaceVariables(step.message, session.variables);
        responses.push(endMessage);
      }
      session.completed = true;
      break;
  }

  return { responses, moveToNext, transferToHuman, department };
}

async function processMessage(chatId, message, chatData = {}) {
  const db = getFirestore();
  
  try {
    logger.info(`[whatsappBot] Processando mensagem de ${chatId}`);

    // Carregar ou criar sessão
    let session = await loadBotSession(db, chatId);
    let workflow = null;

    // Se não há sessão ativa, verificar triggers
    if (!session || session.completed) {
      const workflows = await loadWorkflows(db);
      
      for (const wf of workflows) {
        if (checkTrigger(wf, message.text, chatData)) {
          logger.info(`[whatsappBot] Workflow "${wf.name}" acionado para ${chatId}`);
          
          session = new BotSession(chatId, wf.id);
          workflow = wf;
          break;
        }
      }

      if (!workflow) {
        logger.info(`[whatsappBot] Nenhum workflow acionado para ${chatId}`);
        return { handled: false };
      }
    } else {
      // Carregar workflow da sessão existente
      const workflowDoc = await db.collection('whatsappWorkflows').doc(session.workflowId).get();
      
      if (!workflowDoc.exists) {
        logger.warn(`[whatsappBot] Workflow ${session.workflowId} não encontrado`);
        return { handled: false };
      }

      workflow = { id: workflowDoc.id, ...workflowDoc.data() };
    }

    const responses = [];
    let transferToHuman = false;
    let department = null;
    const executionStart = Date.now();
    let processedSteps = 0;

    // Se há etapa atual esperando validação
    if (session.currentStep > 0 || (session.currentStep === 0 && workflow.steps[0]?.action === ACTION_TYPES.COLLECT_DATA)) {
      const currentStepData = workflow.steps[session.currentStep];

      if (currentStepData?.action === ACTION_TYPES.COLLECT_DATA) {
        // Validar entrada do usuário
        const validation = validateInput(
          message.text,
          currentStepData.validationType,
          currentStepData.validationOptions || {}
        );

        if (!validation.valid) {
          responses.push(` ${validation.error}\n\n${currentStepData.question}`);
          await saveBotSession(db, session);
          
          return {
            handled: true,
            responses,
            transferToHuman: false
          };
        }

        // Salvar dado coletado
        session.variables[currentStepData.variableName] = validation.value;
        session.collectedData[currentStepData.variableName] = {
          value: validation.value,
          timestamp: Timestamp.now()
        };

        session.currentStep++;
      }
    }

    // Executar etapas do workflow
    while (session.currentStep < workflow.steps.length && !session.completed) {
      const elapsedMs = Date.now() - executionStart;
      if (elapsedMs > BOT_MAX_EXECUTION_MS || processedSteps >= BOT_MAX_STEPS_PER_MESSAGE) {
        logger.warn('[whatsappBot] Limite de execução atingido; transferindo para humano', {
          chatId,
          workflowId: session.workflowId,
          elapsedMs,
          processedSteps,
          currentStep: session.currentStep
        });

        transferToHuman = true;
        department = session.variables?._department || null;
        session.transferredToHuman = true;
        session.completed = true;
        responses.push(BOT_TIMEOUT_FALLBACK_MESSAGE);
        break;
      }

      processedSteps += 1;
      const step = workflow.steps[session.currentStep];
      
      const result = await executeAction(db, session, step, workflow);
      
      responses.push(...result.responses);
      
      if (result.transferToHuman) {
        transferToHuman = true;
        department = result.department;
        break;
      }

      if (!result.moveToNext) {
        break; // Aguarda próxima mensagem do usuário
      }

      session.currentStep++;
    }

    // Verificar se workflow foi completado
    if (session.currentStep >= workflow.steps.length && !session.completed) {
      session.completed = true;
    }

    // Salvar sessão atualizada
    await saveBotSession(db, session);

    // Atualizar chat com dados coletados
    if (Object.keys(session.collectedData).length > 0) {
      try {
        await db.collection('chats').doc(chatId).update({
          botData: session.collectedData,
          lastBotUpdate: Timestamp.now()
        });
      } catch (error) {
        logger.error('[whatsappBot] Erro ao atualizar chat com dados do bot:', error);
      }
    }

    logger.info(`[whatsappBot] Processamento concluído. Respostas: ${responses.length}, Transfer: ${transferToHuman}`);

    return {
      handled: true,
      responses,
      transferToHuman,
      department,
      collectedData: session.collectedData
    };

  } catch (error) {
    logger.error('[whatsappBot] Erro ao processar mensagem:', error);
    return { handled: false, error: error.message };
  }
}

// ===== EXPORTS =====

module.exports = {
  processMessage,
  VALIDATION_TYPES,
  ACTION_TYPES,
  BotSession
};
