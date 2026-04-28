/**
 * @file whatsappBot.js
 * @description Motor de Bot/Workflow para WhatsApp Business
 * 
 * Funcionalidades:
 * - Processamento de workflows configuráveis
 * - Coleta estruturada de dados dos clientes
 * - Validação de respostas
 * - Fluxos condicionais
 * - Integração com Firestore para persistência de estado
 * - Transição automática para atendimento humano
 * 
 * Data: 2025-11-14
 */

import { db } from './auth.js';
import cacheService from './cacheService.js';

if (window.__DEBUG__) console.log('[whatsappBot] Módulo carregado.');

// Cache de workflows (TTL 5 minutos)
const WORKFLOW_CACHE_KEY = 'whatsapp_workflows_all';
const WORKFLOW_CACHE_TTL = 5 * 60 * 1000;

/**
 * Tipo de validação de entrada
 */
const VALIDATION_TYPES = {
  TEXT: 'text',             // Qualquer texto
  NUMBER: 'number',         // Apenas números
  EMAIL: 'email',           // Email válido
  PHONE: 'phone',           // Telefone válido
  CPF: 'cpf',              // CPF válido
  CNPJ: 'cnpj',            // CNPJ válido
  DATE: 'date',            // Data válida (DD/MM/YYYY)
  OPTION: 'option',        // Opção de lista (1, 2, 3...)
  YES_NO: 'yes_no',        // Sim/Não
  REGEX: 'regex'           // Regex personalizado
};

/**
 * Tipo de ação do workflow
 */
const ACTION_TYPES = {
  SEND_MESSAGE: 'send_message',           // Enviar mensagem
  COLLECT_DATA: 'collect_data',           // Coletar dado do usuário
  SET_VARIABLE: 'set_variable',           // Definir variável
  CONDITION: 'condition',                  // Condição (if/else)
  ASSIGN_AGENT: 'assign_agent',           // Atribuir a agente
  SET_DEPARTMENT: 'set_department',       // Definir departamento
  ADD_TAG: 'add_tag',                     // Adicionar tag
  LINK_CONTRACT: 'link_contract',         // Vincular contrato
  SAVE_CUSTOMER_SUMMARY: 'save_customer_summary', // Salvar resumo do cliente
  END_WORKFLOW: 'end_workflow',           // Finalizar workflow
  TRANSFER_HUMAN: 'transfer_human'        // Transferir para humano
};

/**
 * Estrutura de estado da sessão do bot
 */
class BotSession {
  constructor(chatId) {
    this.chatId = chatId;
    this.workflowId = null;
    this.currentStep = 0;
    this.variables = {};
    this.collectedData = {};
    this.startedAt = new Date();
    this.lastActivity = new Date();
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
    const session = new BotSession(data.chatId);
    Object.assign(session, {
      workflowId: data.workflowId,
      currentStep: data.currentStep || 0,
      variables: data.variables || {},
      collectedData: data.collectedData || {},
      startedAt: data.startedAt?.toDate?.() || new Date(data.startedAt),
      lastActivity: data.lastActivity?.toDate?.() || new Date(data.lastActivity),
      completed: data.completed || false,
      transferredToHuman: data.transferredToHuman || false
    });
    return session;
  }
}

/**
 * Carrega workflows ativos do Firestore
 */
async function loadWorkflows() {
  try {
    // Verificar cache
    const cached = cacheService.get(WORKFLOW_CACHE_KEY);
    if (cached) {
      if (window.__DEBUG__) console.log('[whatsappBot] Workflows carregados do cache');
      return cached;
    }

    if (window.__DEBUG__) console.log('[whatsappBot] Carregando workflows do Firestore...');

    const snapshot = await db.collection('whatsappWorkflows')
      .where('active', '==', true)
      .orderBy('priority', 'desc')
      .get();

    const workflows = [];
    snapshot.forEach(doc => {
      workflows.push({
        id: doc.id,
        ...doc.data()
      });
    });

    // Salvar no cache
    cacheService.set(WORKFLOW_CACHE_KEY, workflows, WORKFLOW_CACHE_TTL);

    if (window.__DEBUG__) console.log(`[whatsappBot] ${workflows.length} workflows carregados`);
    return workflows;
  } catch (error) {
    console.error('[whatsappBot] Erro ao carregar workflows:', error);
    return [];
  }
}

/**
 * Carrega ou cria sessão do bot
 */
async function loadBotSession(chatId) {
  try {
    const sessionDoc = await db.collection('whatsappBotSessions').doc(chatId).get();
    
    if (sessionDoc.exists) {
      return BotSession.fromFirestore(sessionDoc.data());
    }
    
    return null;
  } catch (error) {
    console.error('[whatsappBot] Erro ao carregar sessão:', error);
    return null;
  }
}

/**
 * Salva sessão do bot
 */
async function saveBotSession(session) {
  try {
    session.lastActivity = new Date();
    await db.collection('whatsappBotSessions').doc(session.chatId).set(
      session.toFirestore(),
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('[whatsappBot] Erro ao salvar sessão:', error);
    return false;
  }
}

/**
 * Valida resposta do usuário
 */
function validateInput(input, validationType, options = {}) {
  const trimmed = input.trim();

  switch (validationType) {
    case VALIDATION_TYPES.TEXT:
      return {
        valid: trimmed.length > 0,
        value: trimmed,
        error: 'Por favor, digite uma resposta válida.'
      };

    case VALIDATION_TYPES.NUMBER: {
      const num = parseFloat(trimmed.replace(/[,.]/g, match => match === ',' ? '.' : ''));
      return {
        valid: !isNaN(num),
        value: num,
        error: 'Por favor, digite apenas números.'
      };
    }

    case VALIDATION_TYPES.EMAIL: {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isValidEmail = emailRegex.test(trimmed);
      return {
        valid: isValidEmail,
        value: trimmed.toLowerCase(),
        error: 'Por favor, digite um email válido.'
      };
    }

    case VALIDATION_TYPES.PHONE: {
      const phoneDigits = trimmed.replace(/\D/g, '');
      const isValidPhone = phoneDigits.length >= 10 && phoneDigits.length <= 11;
      return {
        valid: isValidPhone,
        value: phoneDigits,
        error: 'Por favor, digite um telefone válido (com DDD).'
      };
    }

    case VALIDATION_TYPES.CPF: {
      const cpfDigits = trimmed.replace(/\D/g, '');
      const isValidCPF = cpfDigits.length === 11;
      return {
        valid: isValidCPF,
        value: cpfDigits,
        error: 'Por favor, digite um CPF válido (11 dígitos).'
      };
    }

    case VALIDATION_TYPES.CNPJ: {
      const cnpjDigits = trimmed.replace(/\D/g, '');
      const isValidCNPJ = cnpjDigits.length === 14;
      return {
        valid: isValidCNPJ,
        value: cnpjDigits,
        error: 'Por favor, digite um CNPJ válido (14 dígitos).'
      };
    }

    case VALIDATION_TYPES.DATE: {
      const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      const dateMatch = trimmed.match(dateRegex);
      if (dateMatch) {
        const [, day, month, year] = dateMatch;
        const date = new Date(`${year}-${month}-${day}`);
        const isValidDate = !isNaN(date.getTime());
        return {
          valid: isValidDate,
          value: trimmed,
          error: 'Por favor, digite uma data válida no formato DD/MM/AAAA.'
        };
      }
      return {
        valid: false,
        value: trimmed,
        error: 'Por favor, digite uma data no formato DD/MM/AAAA.'
      };
    }

    case VALIDATION_TYPES.OPTION: {
      const optionNum = parseInt(trimmed);
      const maxOptions = options.maxOptions || 10;
      const isValidOption = !isNaN(optionNum) && optionNum >= 1 && optionNum <= maxOptions;
      return {
        valid: isValidOption,
        value: optionNum,
        error: `Por favor, digite um número entre 1 e ${maxOptions}.`
      };
    }

    case VALIDATION_TYPES.YES_NO: {
      const normalized = trimmed.toLowerCase();
      const yesOptions = ['sim', 's', 'yes', 'y', '1'];
      const noOptions = ['não', 'nao', 'n', 'no', '0'];

      if (yesOptions.includes(normalized)) {
        return { valid: true, value: true, error: null };
      } else if (noOptions.includes(normalized)) {
        return { valid: true, value: false, error: null };
      }

      return {
        valid: false,
        value: trimmed,
        error: 'Por favor, responda com Sim ou Não.'
      };
    }

    case VALIDATION_TYPES.REGEX: {
      const regex = new RegExp(options.pattern || '.*');
      const isMatch = regex.test(trimmed);
      return {
        valid: isMatch,
        value: trimmed,
        error: options.errorMessage || 'Formato inválido.'
      };
    }

    default:
      return {
        valid: true,
        value: trimmed,
        error: null
      };
  }
}

/**
 * Substitui variáveis no texto
 */
function replaceVariables(text, variables) {
  let result = text;
  
  Object.keys(variables).forEach(key => {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), variables[key] || '');
  });
  
  return result;
}

/**
 * Avalia condição
 */
function evaluateCondition(condition, variables) {
  try {
    const { variable, operator, value } = condition;
    const varValue = variables[variable];

    switch (operator) {
      case 'equals':
        return varValue == value;
      case 'not_equals':
        return varValue != value;
      case 'contains':
        return String(varValue).includes(String(value));
      case 'greater_than':
        return Number(varValue) > Number(value);
      case 'less_than':
        return Number(varValue) < Number(value);
      case 'exists':
        return varValue !== undefined && varValue !== null && varValue !== '';
      case 'not_exists':
        return varValue === undefined || varValue === null || varValue === '';
      default:
        return false;
    }
  } catch (error) {
    console.error('[whatsappBot] Erro ao avaliar condição:', error);
    return false;
  }
}

/**
 * Processa mensagem recebida através do workflow
 */
async function processMessage(chatId, message, chatData = {}) {
  try {
    if (window.__DEBUG__) console.log(`[whatsappBot] Processando mensagem para chat ${chatId}`);

    // Carregar sessão existente ou verificar trigger
    let session = await loadBotSession(chatId);
    
    // Se não há sessão ativa, verificar se algum workflow deve ser iniciado
    if (!session || session.completed || session.transferredToHuman) {
      const workflows = await loadWorkflows();
      
      // Verificar triggers
      for (const workflow of workflows) {
        if (shouldTriggerWorkflow(workflow, message, chatData)) {
          session = new BotSession(chatId);
          session.workflowId = workflow.id;
          await saveBotSession(session);
          
          if (window.__DEBUG__) {
            console.log(`[whatsappBot] Workflow "${workflow.name}" iniciado para chat ${chatId}`);
          }
          break;
        }
      }
      
      // Se ainda não há workflow, não processar
      if (!session || !session.workflowId) {
        return {
          handled: false,
          reason: 'no_workflow_triggered'
        };
      }
    }

    // Carregar workflow
    const workflowDoc = await db.collection('whatsappWorkflows').doc(session.workflowId).get();
    
    if (!workflowDoc.exists) {
      console.error(`[whatsappBot] Workflow ${session.workflowId} não encontrado`);
      return { handled: false, reason: 'workflow_not_found' };
    }

    const workflow = { id: workflowDoc.id, ...workflowDoc.data() };
    const steps = workflow.steps || [];

    if (session.currentStep >= steps.length) {
      session.completed = true;
      await saveBotSession(session);
      return { handled: false, reason: 'workflow_completed' };
    }

    // Processar resposta do usuário (se não for primeira mensagem)
    if (session.currentStep > 0 || message.text) {
      const previousStepData = session.currentStep > 0 ? steps[session.currentStep - 1] : null;
      
      if (previousStepData && previousStepData.action === ACTION_TYPES.COLLECT_DATA) {
        // Validar resposta
        const validation = validateInput(
          message.text,
          previousStepData.validationType || VALIDATION_TYPES.TEXT,
          previousStepData.validationOptions || {}
        );

        if (!validation.valid) {
          // Retornar mensagem de erro
          return {
            handled: true,
            responses: [validation.error],
            waitForReply: true
          };
        }

        // Salvar dado coletado
        const variableName = previousStepData.variableName || `step_${session.currentStep}`;
        session.variables[variableName] = validation.value;
        session.collectedData[variableName] = {
          value: validation.value,
          stepIndex: session.currentStep - 1,
          timestamp: new Date()
        };
      }
    }

    // Executar passo atual
    const responses = [];
    let shouldContinue = true;
    let waitForReply = false;

    while (shouldContinue && session.currentStep < steps.length) {
      const step = steps[session.currentStep];
      
      // Processar ação
      const result = await executeAction(step, session, chatId);
      
      if (result.message) {
        const processedMessage = replaceVariables(result.message, session.variables);
        responses.push(processedMessage);
      }

      if (result.wait) {
        waitForReply = true;
        shouldContinue = false;
      }

      if (result.transfer) {
        session.transferredToHuman = true;
        await saveBotSession(session);
        return {
          handled: true,
          responses,
          transferToHuman: true,
          department: result.department
        };
      }

      if (result.end) {
        session.completed = true;
        await saveBotSession(session);
        return {
          handled: true,
          responses,
          workflowCompleted: true
        };
      }

      // Próximo passo
      if (result.nextStep !== undefined) {
        session.currentStep = result.nextStep;
      } else {
        session.currentStep++;
      }

      // Salvar sessão
      await saveBotSession(session);

      // Se deve aguardar resposta, parar aqui
      if (waitForReply) {
        break;
      }
    }

    return {
      handled: true,
      responses,
      waitForReply,
      session
    };

  } catch (error) {
    console.error('[whatsappBot] Erro ao processar mensagem:', error);
    return {
      handled: false,
      error: error.message
    };
  }
}

/**
 * Verifica se workflow deve ser disparado
 */
function shouldTriggerWorkflow(workflow, message, chatData) {
  const triggers = workflow.triggers || [];
  
  for (const trigger of triggers) {
    if (trigger.type === 'first_message' && !chatData.hasMessages) {
      return true;
    }
    
    if (trigger.type === 'keyword') {
      const keywords = trigger.keywords || [];
      const messageText = message.text?.toLowerCase() || '';
      
      for (const keyword of keywords) {
        if (messageText.includes(keyword.toLowerCase())) {
          return true;
        }
      }
    }
    
    if (trigger.type === 'department' && chatData.department === trigger.department) {
      return true;
    }
  }
  
  return false;
}

/**
 * Executa ação do workflow
 */
async function executeAction(step, session, chatId) {
  switch (step.action) {
    case ACTION_TYPES.SEND_MESSAGE:
      return {
        message: step.message,
        wait: false
      };

    case ACTION_TYPES.COLLECT_DATA:
      return {
        message: step.question,
        wait: true
      };

    case ACTION_TYPES.SET_VARIABLE:
      session.variables[step.variableName] = step.value;
      return { wait: false };

    case ACTION_TYPES.CONDITION: {
      const conditionMet = evaluateCondition(step.condition, session.variables);
      return {
        nextStep: conditionMet ? step.ifTrueStep : step.ifFalseStep,
        wait: false
      };
    }

    case ACTION_TYPES.SET_DEPARTMENT:
      // Atualizar departamento no chat
      await db.collection('chats').doc(chatId).update({
        department: step.department
      });
      return { wait: false };

    case ACTION_TYPES.ADD_TAG: {
      // Adicionar tag ao chat
      const chatRef = db.collection('chats').doc(chatId);
      await chatRef.update({
        tags: firebase.firestore.FieldValue.arrayUnion(step.tagId)
      });
      return { wait: false };
    }

    case ACTION_TYPES.TRANSFER_HUMAN:
      return {
        message: step.message || 'Vou transferir você para um de nossos atendentes. Aguarde um momento.',
        transfer: true,
        department: step.department,
        wait: false
      };

    case ACTION_TYPES.END_WORKFLOW:
      return {
        message: step.message,
        end: true,
        wait: false
      };

    default:
      console.warn(`[whatsappBot] Ação desconhecida: ${step.action}`);
      return { wait: false };
  }
}

/**
 * Cancela workflow ativo
 */
async function cancelWorkflow(chatId) {
  try {
    const session = await loadBotSession(chatId);
    if (session) {
      session.completed = true;
      session.transferredToHuman = true;
      await saveBotSession(session);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[whatsappBot] Erro ao cancelar workflow:', error);
    return false;
  }
}

/**
 * Obtém dados coletados pelo bot
 */
async function getCollectedData(chatId) {
  try {
    const session = await loadBotSession(chatId);
    return session?.collectedData || {};
  } catch (error) {
    console.error('[whatsappBot] Erro ao obter dados coletados:', error);
    return {};
  }
}

/**
 * Limpa cache de workflows
 */
function invalidateWorkflowCache() {
  cacheService.invalidate(WORKFLOW_CACHE_KEY);
}

// Exportar API
export const whatsappBot = {
  processMessage,
  loadWorkflows,
  loadBotSession,
  cancelWorkflow,
  getCollectedData,
  invalidateWorkflowCache,
  VALIDATION_TYPES,
  ACTION_TYPES
};

// Expor globalmente para debug
if (typeof window !== 'undefined') {
  window.__WHATSAPP_BOT__ = whatsappBot;
}

export default whatsappBot;
