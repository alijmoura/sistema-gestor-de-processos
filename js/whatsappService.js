/**
 * @file whatsappService.js
 * @description Sistema completo de integração WhatsApp Business API com suporte multi-agente
 * Funcionalidades:
 * - Gestão de conversas em tempo real
 * - Sistema de filas por departamento
 * - Distribuição automática para agentes disponíveis
 * - Transferência entre agentes/departamentos
 * - Templates de mensagem
 * - Histórico completo
 * - Status de leitura e entrega
 * - Suporte para 30+ funcionários simultâneos
 * 
 * Estrutura Firestore:
 * - chats/{phoneNumber} - Dados da conversa
 * - chats/{phoneNumber}/messages - Mensagens da conversa
 * - users/{userId}.whatsapp - Dados do agente (status, departamento, estatísticas)
 * - whatsappQueues/{department} - Filas por departamento
 * - whatsappConfig/settings - Configurações gerais
 * 
 * Data: 2025-10-21
 */

import { db, auth, storage } from './auth.js';
import cacheService from './cacheService.js';
import { activityLogService } from './activityLogService.js';

function isServiceDebugEnabled() {
  if (typeof window !== 'undefined') {
    return window.__DEBUG__ === true;
  }
  if (typeof globalThis !== 'undefined') {
    return globalThis.__DEBUG__ === true;
  }
  return false;
}

function resolveChatAuditLabel(chatData = {}, chatId = '') {
  return chatData.customerName
    || chatData.nome
    || chatData.contactName
    || chatData.phoneNumber
    || chatData.numero
    || chatId
    || 'Conversa WhatsApp';
}

function logWhatsappActivity(actionType, description, chatId, extraData = {}) {
  if (!activityLogService?.logActivity) return Promise.resolve(null);

  return activityLogService.logActivity(actionType, description, chatId, {
    module: 'whatsapp',
    page: 'whatsapp',
    entityType: 'chat',
    entityLabel: extraData.entityLabel || extraData.customerName || extraData.phoneNumber || chatId || 'Conversa WhatsApp',
    ...extraData
  });
}

function serviceDebug(...args) {
  if (isServiceDebugEnabled()) {
    console.debug('[whatsappService]', ...args);
  }
}

serviceDebug('Módulo carregado.');

const ADMIN_STATUS_CACHE_TTL = 60 * 1000; // 1 minuto
const adminStatusCache = new Map();

/**
 *  NOVO: Verificar se usuário atual é admin
 * @param {string} userId - ID do usuário (opcional, usa currentUser se não fornecido)
 * @returns {Promise<boolean>} true se admin, false caso contrário
 */
async function checkIfUserIsAdmin(userId = null, options = {}) {
  try {
    const uid = userId || auth.currentUser?.uid;
    if (!uid) return false;

    const { forceRefresh = false } = options;
    const now = Date.now();

    if (!forceRefresh) {
      const cached = adminStatusCache.get(uid);
      if (cached && cached.expires > now) {
        return cached.value;
      }
    }

    let isAdmin = false;

    if (auth.currentUser && auth.currentUser.uid === uid) {
      try {
        const tokenResult = await auth.currentUser.getIdTokenResult(forceRefresh);
        const claims = tokenResult.claims || {};
        if (claims.admin === true || claims.isAdmin === true || claims.role === 'admin') {
          isAdmin = true;
        }
      } catch (tokenErr) {
        serviceDebug('Falha ao obter claims de admin:', tokenErr);
      }
    }

    if (!isAdmin) {
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc.exists) {
        const data = userDoc.data() || {};
        isAdmin = data.isAdmin === true
          || data.role === 'admin'
          || (Array.isArray(data.roles) && data.roles.includes('admin'))
          || data.permissions?.admin === true
          || (Array.isArray(data.permissions) && data.permissions.includes('admin'));
      }
    }

    adminStatusCache.set(uid, { value: isAdmin, expires: now + ADMIN_STATUS_CACHE_TTL });
    return isAdmin;
  } catch (err) {
    console.error('[whatsappService] Erro ao verificar admin:', err);
    return false;
  }
}

// Departamentos disponíveis
const DEPARTMENTS = {
  APROVACAO: 'Aprovação',
  FORMULARIOS: 'Formularios',
  CEHOP: 'CEHOP',
  REGISTRO: 'Registro',
  INDIVIDUAL: 'Individual'
};

// Status de agente
const AGENT_STATUS = {
  ONLINE: 'online',
  BUSY: 'busy',
  AWAY: 'away',
  OFFLINE: 'offline'
};

// Status de chat
const CHAT_STATUS = {
  NEW: 'novo',                   // Nova conversa na fila
  ASSIGNED: 'atribuido',         // Atribuído a um agente
  ACTIVE: 'ativo',               // Conversa ativa (cliente respondeu)
  WAITING: 'aguardando',         // Aguardando resposta do cliente
  RESOLVED: 'resolvido',         // Conversa finalizada
  TRANSFERRED: 'transferido'     // Em processo de transferência
};

// Motivos de finalização
const RESOLUTION_REASONS = {
  RESOLVED: 'Problema resolvido',
  NO_RESPONSE: 'Cliente não respondeu',
  TRANSFERRED: 'Transferido para outro canal',
  DUPLICATE: 'Conversa duplicada',
  SPAM: 'Spam',
  WRONG_NUMBER: 'Número errado',
  OTHER: 'Outro motivo'
};

function getAgentDisplayNameFromUserData(userData = {}) {
  return userData.shortName
    || userData.fullName
    || userData.displayName
    || userData.name
    || userData.email
    || 'Agente';
}

async function getWhatsAppAgentProfile(userId, options = {}) {
  if (!userId) return null;

  const { requireAgent = false } = options;
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    return null;
  }

  const userData = userDoc.data() || {};
  const whatsappData = userData.whatsapp || {};

  if (requireAgent && whatsappData.isAgent !== true) {
    return null;
  }

  return {
    id: userDoc.id,
    name: getAgentDisplayNameFromUserData(userData),
    email: userData.email || null,
    ...whatsappData
  };
}

async function updateWhatsAppAgentCounters(userId, deltas = {}) {
  if (!userId) return;

  const payload = {
    'whatsapp.lastActive': firebase.firestore.FieldValue.serverTimestamp()
  };

  if (typeof deltas.activeChats === 'number' && deltas.activeChats !== 0) {
    payload['whatsapp.activeChats'] = firebase.firestore.FieldValue.increment(deltas.activeChats);
  }

  if (typeof deltas.totalAssigned === 'number' && deltas.totalAssigned !== 0) {
    payload['whatsapp.totalAssigned'] = firebase.firestore.FieldValue.increment(deltas.totalAssigned);
  }

  if (typeof deltas.totalResolved === 'number' && deltas.totalResolved !== 0) {
    payload['whatsapp.totalResolved'] = firebase.firestore.FieldValue.increment(deltas.totalResolved);
  }

  if (typeof deltas.status === 'string' && deltas.status.trim()) {
    payload['whatsapp.status'] = deltas.status.trim();
  }

  await db.collection('users').doc(userId).set(payload, { merge: true });
}

const DEFAULT_WHATSAPP_CONFIG = Object.freeze({
  enabled: false,
  phoneNumberId: null,
  accessToken: null,
  webhookVerifyToken: null,
  fcmPublicVapidKey: null,
  autoAssignment: true,
  autoLinkContracts: true,
  maxChatsPerAgent: 5,
  includeAgentNameInOutgoingMessages: false,
  googleContactsClientId: null,
  googleContactsApiKey: null,
  googleContactsLastSync: null,
  googleContactsLastSyncCount: 0,
  googleContactsLastSyncBy: null,
  googleContactsLastSyncSource: null,
  googleContactsLastSyncFile: null,
  businessHours: Object.freeze({
    start: '08:30',
    end: '18:00',
    days: [1, 2, 3, 4, 5]
  })
});

const CONTRACT_PHONE_FIELDS = Object.freeze([
  'telefone',
  'telefonePrincipal',
  'telefoneSecundario',
  'telefone2',
  'telefoneContato',
  'telefoneResidencial',
  'telefoneComercial',
  'telefoneCliente',
  'telefoneComprador',
  'telefoneTitular',
  'telefoneVendedor',
  'telefoneCorretor',
  'celular',
  'celularPrincipal',
  'celular2',
  'celularComprador',
  'whatsapp',
  'whatsappPhone',
  'whatsappNumero',
  'primaryPhone',
  'customerPhone',
  'customerPhoneNumber',
  'phoneNumber',
  'phone',
  'contatoTelefone'
]);

const PHONE_SEARCH_CONCURRENCY = 8;

const BRAZIL_COUNTRY_CODE = '55';

// Templates de mensagem
const MESSAGE_TEMPLATES = {
  welcome: {
    text: 'Olá! Bem-vindo ao atendimento da Sistema Gestor de Processos. Como posso ajudá-lo?'
  },
  department_menu: {
    text: `Olá! Bem-vindo ao atendimento da Sistema Gestor de Processos.

Sobre qual assunto você gostaria de falar?

1⃣ Aprovação
2⃣ Formulários
3⃣ CEHOP
4⃣ Registro

Digite o número correspondente ao departamento desejado.`
  },
  transferred: {
    text: 'Sua conversa foi transferida para {department}. Em breve você será atendido por um de nossos especialistas.'
  },
  assigned: {
    text: 'Olá! Meu nome é {agentName} e vou ajudá-lo com {department}. Como posso ajudar?'
  },
  offline: {
    text: 'No momento não temos atendentes disponíveis. Seu atendimento será iniciado assim que possível. Horário de atendimento: Segunda a Sexta, 8:30h às 18h.'
  },
  resolved: {
    text: 'Obrigado por entrar em contato! Sua solicitação foi concluída. Se precisar de mais ajuda, é só nos chamar novamente.'
  }
};

/**
 * Normaliza número de telefone para formato WhatsApp Business API (E.164)
 * 
 * Formato esperado pela API: [código país][DDD][número]
 * Exemplo Brasil: 5511999887766 (55 = Brasil, 11 = SP, 999887766 = número)
 * 
 * CASOS TRATADOS:
 * - Remove caracteres não numéricos: (11) 99988-7766 → 11999887766
 * - Remove código do país duplicado: 55 55 11 99988-7766 → 5511999887766
 * - Adiciona código do país (55) se ausente
 * - Adiciona 9º dígito em celulares se faltando
 * - Remove zero à esquerda do DDD: 011 99988-7766 → 11999887766
 * - Valida DDDs brasileiros (11-99)
 * - Valida comprimento final (13 dígitos para Brasil)
 * 
 * @param {string|number} input - Número de telefone em qualquer formato
 * @param {object} options - Opções de normalização
 * @param {string} options.countryCode - Código do país (padrão: '55' para Brasil)
 * @param {boolean} options.addNinthDigit - Adicionar 9º dígito automaticamente (padrão: true)
 * @param {boolean} options.strict - Modo estrito: retorna null se inválido (padrão: false)
 * @returns {string|null} Número normalizado no formato E.164 ou null se inválido
 * 
 * @example
 * normalizePhoneNumber('(11) 99988-7766')     // '5511999887766'
 * normalizePhoneNumber('11 9 9988-7766')      // '5511999887766'
 * normalizePhoneNumber('5511999887766')       // '5511999887766'
 * normalizePhoneNumber('011999887766')        // '5511999887766'
 * normalizePhoneNumber('11999887766')         // '5511999887766'
 * normalizePhoneNumber('1199887766')          // '5511999887766' (adiciona 9)
 * normalizePhoneNumber('+55 11 99988-7766')   // '5511999887766'
 * normalizePhoneNumber('invalid')             // null
 */
function normalizePhoneNumber(input, options = {}) {
  // Configurações padrão
  const {
    countryCode = '55',      // Brasil
    addNinthDigit = true,    // Adicionar 9 em celulares
    strict = false           // Modo estrito
  } = options;

  // Validação inicial
  if (!input) {
    if (window.__DEBUG__) console.warn('[normalizePhone] Input vazio');
    return null;
  }

  // Converter para string e remover todos os caracteres não numéricos
  let digits = String(input).replace(/\D/g, '');

  if (!digits || digits.length < 10) {
    if (window.__DEBUG__) console.warn('[normalizePhone] Menos de 10 dígitos:', input);
    return strict ? null : digits || null;
  }

  // Remover zeros à esquerda (ex: 011 → 11)
  digits = digits.replace(/^0+/, '');

  // Se começar com código do país (55), validar
  if (digits.startsWith(countryCode)) {
    // Remover código do país para processar
    digits = digits.slice(countryCode.length);
  }

  // Agora digits deve ter: [DDD][número] (10 ou 11 dígitos)
  
  // Validar DDD (primeiros 2 dígitos devem estar entre 11 e 99)
  const ddd = digits.slice(0, 2);
  const dddNum = parseInt(ddd, 10);
  
  if (dddNum < 11 || dddNum > 99) {
    if (window.__DEBUG__) console.warn('[normalizePhone] DDD inválido:', ddd, 'em', input);
    return strict ? null : `${countryCode}${digits}`;
  }

  // Separar DDD e número
  const phoneNumber = digits.slice(2);

  // Validar e corrigir comprimento do número
  let finalNumber = phoneNumber;

  if (phoneNumber.length === 8) {
    // Telefone fixo (8 dígitos) - OK
    // OU celular sem 9º dígito
    
    if (addNinthDigit) {
      // Verificar se é celular (começa com 6, 7, 8 ou 9)
      const firstDigit = phoneNumber[0];
      if (['6', '7', '8', '9'].includes(firstDigit)) {
        // Adicionar 9 no início (padrão celular brasileiro desde 2016)
        finalNumber = '9' + phoneNumber;
        if (window.__DEBUG__) {
          console.log('[normalizePhone] 9º dígito adicionado:', phoneNumber, '→', finalNumber);
        }
      }
    }
  } else if (phoneNumber.length === 9) {
    // Celular com 9º dígito (9 dígitos) - OK
    
    // Validar que começa com 9
    if (phoneNumber[0] !== '9') {
      if (window.__DEBUG__) {
        console.warn('[normalizePhone] Celular de 9 dígitos não começa com 9:', phoneNumber);
      }
      if (strict) return null;
    }
  } else {
    // Comprimento inválido
    if (window.__DEBUG__) {
      console.warn('[normalizePhone] Comprimento inválido:', phoneNumber.length, 'dígitos em', phoneNumber);
    }
    if (strict) return null;
  }

  // Montar número final: [código país][DDD][número]
  const normalized = `${countryCode}${ddd}${finalNumber}`;

  // Validação final de comprimento (Brasil: 13 dígitos)
  const expectedLength = countryCode.length + 2 + 9; // 55 + DD + 9 dígitos
  
  if (strict && normalized.length !== expectedLength && normalized.length !== (expectedLength - 1)) {
    if (window.__DEBUG__) {
      console.warn('[normalizePhone] Comprimento final inválido:', normalized.length, 'em', normalized);
    }
    return null;
  }

  if (window.__DEBUG__) {
    console.log(`[normalizePhone] ${input} → ${normalized}`);
  }

  return normalized;
}

function toTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object') {
    if (typeof value.seconds === 'number') {
      return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1000000);
    }
    if (typeof value._seconds === 'number') {
      return (value._seconds * 1000) + Math.floor((value._nanoseconds || 0) / 1000000);
    }
  }
  return 0;
}

function getWaitingChatTimestampMillis(chat) {
  if (!chat || typeof chat !== 'object') return 0;

  const candidates = [
    chat.reopenedAt,
    chat.createdAt,
    chat.aprovacaoLeadCreatedAt,
    chat.lastMessageTimestamp,
    chat.updatedAt,
    chat.lastBotUpdate
  ];

  for (const candidate of candidates) {
    const millis = toTimestampMillis(candidate);
    if (millis > 0) {
      return millis;
    }
  }

  return 0;
}

function applyAgentSignature(text, agentName) {
  if (!text || !agentName) return text;

  const trimmed = text.trim();
  if (!trimmed) return text;

  const lowerCase = trimmed.toLowerCase();
  if (lowerCase.startsWith('atendente')) {
    return text;
  }

  return `*${agentName}:* ${trimmed}`; //atendente ${agentName}:  
}

function createForwardedMetadata(rawMetadata = {}) {
  if (!rawMetadata || typeof rawMetadata !== 'object') {
    return null;
  }

  const hasAnyValue = Object.values(rawMetadata).some(value => value !== undefined && value !== null && value !== '');
  if (!hasAnyValue) {
    return null;
  }

  return {
    chatId: rawMetadata.chatId || null,
    messageId: rawMetadata.messageId || null,
    author: rawMetadata.author || null,
    direction: rawMetadata.direction || null,
    sentAt: rawMetadata.sentAt || null,
    note: rawMetadata.note || null,
    forwardedBy: auth.currentUser?.uid || null,
    forwardedByName: resolveAgentDisplayName(),
    forwardedByEmail: auth.currentUser?.email || null,
    forwardedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
}

function getMediaEmoji(mediaType = '') {
  const normalized = String(mediaType).toLowerCase();
  if (normalized.includes('image')) return '';
  if (normalized.includes('video')) return '';
  if (normalized.includes('audio')) return '';
  if (normalized.includes('pdf')) return '';
  return '';
}

function inferMediaTypeFromMessage(message = {}) {
  const directType = message.mediaType || message.type;
  if (typeof directType === 'string' && directType.trim()) {
    return directType.toLowerCase();
  }

  const mime = (message.mimeType || message.contentType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  return 'document';
}

function resolveAgentDisplayName() {
  const normalizeToken = (value) => {
    if (!value) return null;
    const token = value.trim().split(/[\s._-]+/).filter(Boolean)[0];
    if (!token) return null;
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  };

  const fromDisplayName = normalizeToken(auth.currentUser?.displayName || '');
  if (fromDisplayName) {
    return fromDisplayName;
  }

  const email = auth.currentUser?.email;
  if (email && email.includes('@')) {
    const localPart = email.split('@')[0];
    const fromEmail = normalizeToken(localPart);
    if (fromEmail) {
      return fromEmail;
    }
  }

  return null;
}

/**
 * Carrega configurações do WhatsApp do Firestore
 */
function mergeWhatsAppConfig(rawConfig = {}) {
  const baseConfig = {
    ...DEFAULT_WHATSAPP_CONFIG,
    businessHours: {
      ...DEFAULT_WHATSAPP_CONFIG.businessHours
    }
  };

  const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const businessHours = source.businessHours && typeof source.businessHours === 'object'
    ? { ...baseConfig.businessHours, ...source.businessHours }
    : { ...baseConfig.businessHours };

  const merged = {
    ...baseConfig,
    ...source,
    businessHours
  };

  if (typeof merged.autoLinkContracts !== 'boolean') {
    merged.autoLinkContracts = DEFAULT_WHATSAPP_CONFIG.autoLinkContracts;
  }

  return merged;
}

async function loadWhatsAppConfig(options = {}) {
  const { forceRefresh = false } = options;
  const cacheKey = 'whatsapp_config';
  
  try {
    // Usar cacheService.get com fetchFunction
    const config = await cacheService.get(cacheKey, async () => {
      const configDoc = await db.collection('whatsappConfig').doc('settings').get();
      
      if (!configDoc.exists) {
        console.warn('[whatsappService] Configuração não encontrada');
        return mergeWhatsAppConfig();
      }

      return mergeWhatsAppConfig(configDoc.data() || {});
    }, 'whatsappConfig', forceRefresh);
    
    return mergeWhatsAppConfig(config);
  } catch (err) {
    console.error('[whatsappService] Erro ao carregar configuração:', err);
    return { enabled: false };
  }
}

/**
 * Salva configurações do WhatsApp
 */
async function saveWhatsAppConfig(config) {
  try {
    await db.collection('whatsappConfig').doc('settings').set({
      ...config,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: auth.currentUser?.email
    }, { merge: true });

    cacheService.invalidate('whatsapp_config');
    
    if (window.__DEBUG__) {
      console.log('[whatsappService] Configuração salva');
    }

    return { success: true };
  } catch (err) {
    console.error('[whatsappService] Erro ao salvar configuração:', err);
    throw err;
  }
}

/**
 * Envia mensagem via WhatsApp Business API
 * ATUALIZADO: Backend agora busca phoneNumberId automaticamente por número
 */
async function sendMessage(to, text, context = {}) {
  try {
    const config = await loadWhatsAppConfig();
    
    if (!config.enabled) {
      console.warn('[whatsappService] WhatsApp não habilitado');
      throw new Error('WhatsApp não está habilitado. Ative nas configurações.');
    }

    //  REMOVIDO: Validação de phoneNumberId/accessToken (backend faz isso agora)
    // Backend busca automaticamente as credenciais do número via getPhoneConfigForNumber()

    const contextObject = context && typeof context === 'object' ? { ...context } : {};
    const chatIdOverride = contextObject.__chatDocId || null;
    const forwardedMetadata = contextObject.forwardedFrom ? { ...contextObject.forwardedFrom } : null;

    // Não enviar campos internos para a Cloud Function
    if (contextObject.__chatDocId !== undefined) {
      delete contextObject.__chatDocId;
    }

    let preparedText = text;
    const payloadContext = { ...contextObject };

    const phoneNumberIdOverride = contextObject.phoneNumberId || null;
    const phoneNumberDisplay = contextObject.phoneNumberDisplay || null;
    const businessPhoneNumber = contextObject.businessPhoneNumber || null;

    const replyMetadata = contextObject?.replyTo?.messageId
      ? {
          messageId: contextObject.replyTo.messageId,
          text: contextObject.replyTo.text || null,
          author: contextObject.replyTo.author || null,
          direction: contextObject.replyTo.direction || null
        }
      : null;

    if (contextObject?.origin === 'agent-ui' && config.includeAgentNameInOutgoingMessages) {
      const agentName = resolveAgentDisplayName();
      preparedText = applyAgentSignature(text, agentName);
      if (agentName) {
        payloadContext.agentName = payloadContext.agentName || agentName;
        payloadContext.agentSignatureApplied = true;
      }
    }

    if (replyMetadata) {
      payloadContext.replyTo = { messageId: replyMetadata.messageId };
      payloadContext.replyToMessageId = replyMetadata.messageId;
    }

    // Chamar Cloud Function para enviar mensagem
    const sendWhatsAppMessage = firebase.app().functions('southamerica-east1').httpsCallable('sendWhatsAppMessage');
    const callablePayload = {
      to,
      text: preparedText,
      context: payloadContext
    };

    if (phoneNumberIdOverride) {
      callablePayload.phoneNumberId = phoneNumberIdOverride;
    }

    const result = await sendWhatsAppMessage(callablePayload);

    // Salvar mensagem no Firestore
    const metadata = {};
    if (replyMetadata) {
      metadata.replyTo = replyMetadata;
    }
    if (forwardedMetadata) {
      metadata.forwardedFrom = forwardedMetadata;
    }
    if (phoneNumberIdOverride) {
      metadata.phoneNumberId = phoneNumberIdOverride;
    }
    if (phoneNumberDisplay) {
      metadata.phoneNumberDisplay = phoneNumberDisplay;
    }
    if (businessPhoneNumber) {
      metadata.businessPhoneNumber = businessPhoneNumber;
    }

    const chatIdForPersistence = chatIdOverride || to;
    await saveMessageToFirestore(chatIdForPersistence, preparedText, 'outbound', result.data.messageId, metadata);

    if (window.__DEBUG__) {
      console.log('[whatsappService] Mensagem enviada:', result.data);
    }

    return result.data;
  } catch (err) {
    console.error('[whatsappService] Erro ao enviar mensagem:', err);
    
    // Tratamento específico de erros
    const errorMessage = err.message || '';
    
    // Erro específico de phoneNumberId undefined
    if (errorMessage.includes('Object with ID') && errorMessage.includes('undefined')) {
      throw new Error(' Phone Number ID não configurado! O campo está vazio ou indefinido. Acesse Configurações > WhatsApp e configure o Phone Number ID do Meta Business.');
    }

    if (errorMessage.includes('Phone Number ID não configurado')) {
      throw new Error(errorMessage); // Já está formatado
    }
    
    if (errorMessage.includes('Session has expired') || errorMessage.includes('expired')) {
      throw new Error(' Token de acesso expirado! Por favor, atualize o token nas configurações do WhatsApp.');
    }
    
    if (errorMessage.includes('unauthenticated')) {
      throw new Error('Você precisa estar autenticado para enviar mensagens.');
    }
    
    if (errorMessage.includes('invalid-argument')) {
      throw new Error('Dados inválidos. Verifique o número e a mensagem.');
    }

    if (errorMessage.includes('Invalid OAuth') || errorMessage.includes('190')) {
      throw new Error(' Token inválido ou expirado (código 190). Gere um novo Access Token no Meta Business.');
    }
    
    //  NOVO: Erro 131047 - Janela de 24h expirou (contato não pode receber mensagens livres)
    if (errorMessage.includes('131047') || errorMessage.includes('24 hours have passed')) {
      throw new Error(' Não é possível enviar mensagens para este contato porque ele não enviou mensagem nas últimas 24 horas.\n\n SOLUÇÕES:\n1. Peça ao contato para enviar uma mensagem primeiro\n2. Use um Template de Mensagem aprovado (se disponível)\n3. Entre em contato pelo telefone');
    }
    
    throw err;
  }
}

/**
 * Salva mensagem no Firestore
 */
async function saveMessageToFirestore(phoneNumber, text, direction, messageId = null, metadata = {}) {
  try {
    const chatRef = db.collection('chats').doc(phoneNumber);
    const messageRef = chatRef.collection('messages').doc();

    const agentDisplayName = direction === 'outbound' ? resolveAgentDisplayName() : null;

    const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};

    const messageData = {
      text,
      direction: direction, // 'inbound' ou 'outbound'
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      read: direction === 'outbound',
      messageId,
      agentId: direction === 'outbound' ? auth.currentUser?.uid : null,
      agentName: direction === 'outbound' ? agentDisplayName : null
    };

    if (safeMetadata.replyTo?.messageId) {
      messageData.replyTo = {
        messageId: safeMetadata.replyTo.messageId,
        text: safeMetadata.replyTo.text || null,
        author: safeMetadata.replyTo.author || null,
        direction: safeMetadata.replyTo.direction || null
      };
    }

    const forwardedMetadata = createForwardedMetadata(safeMetadata.forwardedFrom);
    if (forwardedMetadata) {
      messageData.forwardedFrom = forwardedMetadata;
    }

    if (safeMetadata.phoneNumberId) {
      messageData.phoneNumberId = safeMetadata.phoneNumberId;
    }

    if (safeMetadata.phoneNumberDisplay) {
      messageData.phoneNumberDisplay = safeMetadata.phoneNumberDisplay;
    }

    if (safeMetadata.businessPhoneNumber) {
      messageData.businessPhoneNumber = safeMetadata.businessPhoneNumber;
    }

    await messageRef.set(messageData);

    // Atualizar última mensagem no chat
    const chatUpdate = {
      lastMessageText: text,
      lastMessageTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessageDirection: direction
    };

    if (safeMetadata.phoneNumberId) {
      chatUpdate.phoneNumberId = safeMetadata.phoneNumberId;
    }

    if (safeMetadata.phoneNumberDisplay) {
      chatUpdate.phoneNumberDisplay = safeMetadata.phoneNumberDisplay;
    }

    if (safeMetadata.businessPhoneNumber) {
      chatUpdate.businessPhoneNumber = safeMetadata.businessPhoneNumber;
    }

    await chatRef.set(chatUpdate, { merge: true });

    // Invalidar cache
    cacheService.invalidateByPattern(new RegExp(`^whatsapp_chat_${phoneNumber}`));
    cacheService.invalidateByPattern(/^whatsapp_messages_/);

    return messageRef.id;
  } catch (err) {
    console.error('[whatsappService] Erro ao salvar mensagem:', err);
    throw err;
  }
}

async function saveMediaMessageToFirestore(phoneNumber, mediaData = {}, metadata = {}) {
  try {
    const chatRef = db.collection('chats').doc(phoneNumber);
    const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};

    const messagePayload = {
      type: 'media',
      mediaType: mediaData.mediaType || 'document',
      mediaUrl: mediaData.mediaUrl || mediaData.url || null,
      fileName: mediaData.fileName || mediaData.name || null,
      fileSize: mediaData.fileSize || mediaData.size || null,
      caption: mediaData.caption || '',
      direction: 'outbound',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      read: true,
      agentId: auth.currentUser?.uid || null,
      agentName: resolveAgentDisplayName(),
      status: mediaData.status || 'sent'
    };

    if (mediaData.messageId) {
      messagePayload.messageId = mediaData.messageId;
    }

    if (safeMetadata.phoneNumberId) {
      messagePayload.phoneNumberId = safeMetadata.phoneNumberId;
    }

    if (safeMetadata.phoneNumberDisplay) {
      messagePayload.phoneNumberDisplay = safeMetadata.phoneNumberDisplay;
    }

    if (safeMetadata.businessPhoneNumber) {
      messagePayload.businessPhoneNumber = safeMetadata.businessPhoneNumber;
    }

    const forwardedMetadata = createForwardedMetadata(safeMetadata.forwardedFrom);
    if (forwardedMetadata) {
      messagePayload.forwardedFrom = forwardedMetadata;
    }

    const replyMetadata = safeMetadata.replyTo;
    if (replyMetadata?.messageId) {
      messagePayload.replyTo = {
        messageId: replyMetadata.messageId,
        text: replyMetadata.text || null,
        author: replyMetadata.author || null,
        direction: replyMetadata.direction || null
      };
    }

    await chatRef.collection('messages').add(messagePayload);

    const lastMessageText = mediaData.caption
      ? mediaData.caption
      : mediaData.fileName
        ? `${getMediaEmoji(mediaData.mediaType)} ${mediaData.fileName}`
        : `${getMediaEmoji(mediaData.mediaType)} Arquivo enviado`;

    const chatUpdate = {
      lastMessageText,
      lastMessageTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessageDirection: 'outbound'
    };

    if (safeMetadata.phoneNumberId) {
      chatUpdate.phoneNumberId = safeMetadata.phoneNumberId;
    }

    if (safeMetadata.phoneNumberDisplay) {
      chatUpdate.phoneNumberDisplay = safeMetadata.phoneNumberDisplay;
    }

    if (safeMetadata.businessPhoneNumber) {
      chatUpdate.businessPhoneNumber = safeMetadata.businessPhoneNumber;
    }

    await chatRef.set(chatUpdate, { merge: true });

    cacheService.invalidateByPattern(new RegExp(`^whatsapp_messages_${phoneNumber}`));
    cacheService.invalidateByPattern(/^whatsapp_agent_chats_/);

    return { success: true };
  } catch (err) {
    console.error('[whatsappService] Erro ao salvar mensagem de mídia encaminhada:', err);
    throw err;
  }
}

async function forwardMessage(options = {}) {
  const {
    targetChatId = null,
    targetPhoneNumber = null,
    message,
    sourceChatId = null,
    note = ''
  } = options || {};

  if (!message) {
    throw new Error('Mensagem inválida para encaminhar.');
  }

  let destinationChatId = null;
  let normalizedDestination = null;
  let targetChatData = null;

  if (targetChatId && typeof targetChatId === 'string') {
    destinationChatId = targetChatId.trim();
    if (destinationChatId) {
      try {
        targetChatData = await getChatById(destinationChatId, { forceRefresh: true });
      } catch (chatErr) {
        if (window.__DEBUG__) {
          console.warn('[whatsappService] Não foi possível carregar chat de destino para encaminhamento:', chatErr);
        }
      }
    }

    const candidateNumber = targetChatData?.numero
      || targetChatData?.phoneNumber
      || targetChatData?.from
      || destinationChatId;

    normalizedDestination = normalizePhoneNumber(candidateNumber) || String(candidateNumber || '').replace(/\D/g, '');
  }

  if (!normalizedDestination && targetPhoneNumber && typeof targetPhoneNumber === 'string') {
    normalizedDestination = normalizePhoneNumber(targetPhoneNumber);
    destinationChatId = destinationChatId || normalizedDestination;
  }

  if (!normalizedDestination) {
    throw new Error('Informe uma conversa ou número válido para encaminhar.');
  }

  normalizedDestination = normalizedDestination.replace(/\D/g, '');

  if (!normalizedDestination || normalizedDestination.length < 10) {
    throw new Error('Número de destino inválido.');
  }

  const persistenceChatId = destinationChatId || normalizedDestination;

  if (!targetChatData) {
    await getOrCreateChat(persistenceChatId);
  }

  const forwardedFrom = {
    chatId: sourceChatId || message.chatId || message.numero || null,
    messageId: message.messageId || message.id || null,
    author: message.agentName || message.author || message.customerName || message.from || null,
    direction: message.direction || null,
    sentAt: message.timestamp || message.createdAt || null,
    chatName: message.chatName || message.customerName || message.customer || message.displayName || null
  };

  if (!forwardedFrom.chatId) {
    forwardedFrom.chatId = sourceChatId || null;
  }

  const sanitizedNote = note?.trim();

  if (String(message.type).toLowerCase() === 'media' || message.mediaUrl) {
    if (!message.mediaUrl) {
      throw new Error('Não foi possível localizar o arquivo da mensagem para encaminhar.');
    }
    const mediaType = inferMediaTypeFromMessage(message);
    const captionParts = [];
    captionParts.push('*Mensagem encaminhada*');
    if (message.caption) {
      captionParts.push(message.caption);
    }
    const caption = captionParts.join('\n\n');

    const sendWhatsAppMedia = firebase.app().functions('southamerica-east1').httpsCallable('sendWhatsAppMedia');
    const payload = {
      to: normalizedDestination,
      mediaUrl: message.mediaUrl,
      mediaType,
      caption,
      fileName: message.fileName || message.name || `arquivo-${Date.now()}`,
      context: {
        origin: 'forward',
        forwardedFrom
      }
    };

    const result = await sendWhatsAppMedia(payload);
    const mediaMessageId = result?.data?.messageId || null;

    await saveMediaMessageToFirestore(persistenceChatId, {
      mediaType,
      mediaUrl: message.mediaUrl,
      fileName: payload.fileName,
      caption,
      messageId: mediaMessageId
    }, { forwardedFrom });
  } else {
    const originalText = (message.text || message.body || '').trim();
    if (!originalText) {
      throw new Error('Esta mensagem não possui conteúdo de texto para encaminhar.');
    }

    const forwardedHeader = '*Mensagem encaminhada*';
    const textToSend = `${forwardedHeader}\n${originalText}`;

    await sendMessage(normalizedDestination, textToSend, {
      origin: 'forward',
      forwardedFrom,
      __chatDocId: persistenceChatId
    });
  }

  if (sanitizedNote) {
    await sendMessage(normalizedDestination, sanitizedNote, {
      origin: 'agent-ui',
      __chatDocId: persistenceChatId
    });
  }

  cacheService.invalidateByPattern(new RegExp(`^whatsapp_messages_${persistenceChatId}`));
  cacheService.invalidate(`whatsapp_chat_${persistenceChatId}`);
  cacheService.invalidateByPattern(/^whatsapp_agent_chats_/);
  cacheService.invalidateByPattern(/^whatsapp_active_chats_/);
  cacheService.invalidateByPattern(/^whatsapp_waiting_chats_/);

  return { success: true, chatId: persistenceChatId };
}

/**
 *  NOVO: Busca o último agente que atendeu um número (conversas finalizadas)
 * @param {string} phoneNumber - Número de telefone normalizado
 * @returns {Promise<Object|null>} Dados do último agente ou null
 */
async function getLastAgentForPhone(phoneNumber) {
  try {
    const snapshot = await db.collection('chats')
      .where('numero', '==', phoneNumber)
      .where('status', '==', CHAT_STATUS.RESOLVED)
      .orderBy('resolvedAt', 'desc')
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      if (window.__DEBUG__) {
        console.log(`[whatsappService] Nenhum atendimento anterior encontrado para ${phoneNumber}`);
      }
      return null;
    }
    
    const lastChat = snapshot.docs[0].data();
    const lastAgent = {
      agentId: lastChat.resolvedBy || lastChat.lastAgentId || lastChat.agentId,
      agentName: lastChat.lastAgentName || lastChat.agentName,
      department: lastChat.lastDepartment || lastChat.department,
      resolvedAt: lastChat.resolvedAt
    };
    
    if (window.__DEBUG__) {
      console.log(`[whatsappService]  Cliente recorrente! Último agente: ${lastAgent.agentName} (${lastAgent.department})`);
    }
    
    return lastAgent;
  } catch (err) {
    console.error('[whatsappService] Erro ao buscar último agente:', err);
    
    // Se erro de índice, tentar busca mais simples
    if (err.message?.includes('index')) {
      console.warn('[whatsappService] Índice composto não encontrado, tentando busca simples...');
      try {
        const fallbackSnapshot = await db.collection('chats')
          .where('numero', '==', phoneNumber)
          .where('status', '==', CHAT_STATUS.RESOLVED)
          .limit(10)
          .get();
        
        if (!fallbackSnapshot.empty) {
          // Ordenar manualmente
          const resolvedChats = fallbackSnapshot.docs
            .map(doc => doc.data())
            .sort((a, b) => {
              const dateA = a.resolvedAt?.toMillis?.() || 0;
              const dateB = b.resolvedAt?.toMillis?.() || 0;
              return dateB - dateA;
            });
          
          const lastChat = resolvedChats[0];
          return {
            agentId: lastChat.resolvedBy || lastChat.lastAgentId || lastChat.agentId,
            agentName: lastChat.lastAgentName || lastChat.agentName,
            department: lastChat.lastDepartment || lastChat.department,
            resolvedAt: lastChat.resolvedAt
          };
        }
      } catch (fallbackErr) {
        console.error('[whatsappService] Erro no fallback:', fallbackErr);
      }
    }
    
    return null;
  }
}

/**
 *  MODIFICADO: Obtém ou cria chat com retorno automático ao último agente
 */
async function getOrCreateChat(phoneNumber, initialData = {}) {
  try {
    const chatRef = db.collection('chats').doc(phoneNumber);
    const chatDoc = await chatRef.get();

    if (chatDoc.exists) {
      return { id: chatDoc.id, ...chatDoc.data() };
    }

    //  NOVO: Buscar último agente que atendeu este número
    const lastAgent = await getLastAgentForPhone(phoneNumber);
    
    // Criar novo chat
    const newChatData = {
      numero: phoneNumber,
      status: CHAT_STATUS.NEW,
      department: null,
      agentId: null,
      agentName: null,
      contractId: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessageTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
      ...initialData
    };
    
    //  NOVO: Se encontrou último agente, atribuir automaticamente
    if (lastAgent && lastAgent.agentId) {
      newChatData.status = CHAT_STATUS.ASSIGNED;
      newChatData.agentId = lastAgent.agentId;
      newChatData.agentName = lastAgent.agentName;
      newChatData.department = lastAgent.department;
      newChatData.assignedAt = firebase.firestore.FieldValue.serverTimestamp();
      newChatData.returnedToLastAgent = true; //  Flag para tracking
      newChatData.autoAssignedReason = 'Cliente recorrente'; //  Motivo
      
      // Incrementar contador do agente em users.whatsapp
      try {
        await updateWhatsAppAgentCounters(lastAgent.agentId, {
          activeChats: 1,
          totalAssigned: 1
        });
      } catch (userErr) {
        console.warn('[whatsappService] Erro ao atualizar users.whatsapp:', userErr);
      }
      
      console.log(`[whatsappService]  Cliente recorrente ${phoneNumber} atribuído automaticamente ao agente ${lastAgent.agentName}`);
    }

    await chatRef.set(newChatData);

    if (window.__DEBUG__) {
      console.log('[whatsappService] Chat criado:', phoneNumber, lastAgent ? '(retorno automático)' : '(novo)');
    }
    
    // Invalidar cache
    cacheService.invalidateByPattern(/^whatsapp_/);

    return { id: phoneNumber, ...newChatData };
  } catch (err) {
    console.error('[whatsappService] Erro ao obter/criar chat:', err);
    throw err;
  }
}

async function getChatById(chatId, options = {}) {
  if (!chatId) return null;

  const { forceRefresh = false } = options;
  const cacheKey = `whatsapp_chat_${chatId}`;

  try {
    return await cacheService.get(
      cacheKey,
      async () => {
        const doc = await db.collection('chats').doc(chatId).get();
        if (!doc.exists) {
          return null;
        }

        return { id: doc.id, ...doc.data() };
      },
      'whatsappChats',
      forceRefresh
    );
  } catch (err) {
    console.error('[whatsappService] Erro ao buscar chat por ID:', err);
    return null;
  }
}

async function getChatByContractId(contractId, options = {}) {
  if (!contractId) return null;

  const { forceRefresh = false } = options;
  const cacheKey = `whatsapp_chat_contract_${contractId}`;

  const fetchByField = async (field) => {
    try {
      const snapshot = await db.collection('chats')
        .where(field, '==', contractId)
        .limit(5)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const chats = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      chats.sort(
        (a, b) =>
          toTimestampMillis(b.lastMessageTimestamp || b.updatedAt || b.createdAt) -
          toTimestampMillis(a.lastMessageTimestamp || a.updatedAt || a.createdAt)
      );

      return chats[0];
    } catch (err) {
      if (window.__DEBUG__) {
        console.warn(
          `[whatsappService] Falha ao buscar chat por ${field}:`,
          err
        );
      }
      return null;
    }
  };

  try {
    return await cacheService.get(
      cacheKey,
      async () => {
        const chat = await fetchByField('contractId');
        if (chat) return chat;
        return await fetchByField('linkedContractId');
      },
      'filters',
      forceRefresh
    );
  } catch (err) {
    console.error('[whatsappService] Erro ao buscar chat por contrato:', err);
    return null;
  }
}

async function getChatsByContractId(contractId, options = {}) {
  if (!contractId) return [];

  const { forceRefresh = false, limit = 20 } = options;
  const cacheKey = `whatsapp_chats_contract_${contractId}`;

  const fetchByField = async (field) => {
    try {
      const snapshot = await db.collection('chats')
        .where(field, '==', contractId)
        .limit(limit)
        .get();

      if (snapshot.empty) {
        return [];
      }

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (err) {
      if (window.__DEBUG__) {
        console.warn(`[whatsappService] Falha ao buscar conversas por ${field}:`, err);
      }
      return [];
    }
  };

  try {
    return await cacheService.get(
      cacheKey,
      async () => {
        const [primaryMatches, legacyMatches] = await Promise.all([
          fetchByField('contractId'),
          fetchByField('linkedContractId')
        ]);

        const chatsMap = new Map();
        [...primaryMatches, ...legacyMatches].forEach((chat) => {
          if (chat?.id) {
            chatsMap.set(chat.id, chat);
          }
        });

        const combined = Array.from(chatsMap.values());
        combined.sort(
          (a, b) =>
            toTimestampMillis(b.lastMessageTimestamp || b.updatedAt || b.createdAt) -
            toTimestampMillis(a.lastMessageTimestamp || a.updatedAt || a.createdAt)
        );

        return combined;
      },
      'filters',
      forceRefresh
    );
  } catch (err) {
    console.error('[whatsappService] Erro ao buscar conversas por contrato:', err);
    return [];
  }
}

/**
 * Lista chats do agente atual
 */
async function getAgentChats(agentId = null) {
  const currentAgentId = agentId || auth.currentUser?.uid;
  
  if (!currentAgentId) {
    console.warn('[whatsappService] Agente não identificado');
    return [];
  }

  const cacheKey = `whatsapp_agent_chats_${currentAgentId}`;
  
  try {
    return await cacheService.get(cacheKey, async () => {
      const snapshot = await db.collection('chats')
        .where('agentId', '==', currentAgentId)
        .where('status', 'in', [CHAT_STATUS.ASSIGNED, CHAT_STATUS.ACTIVE, CHAT_STATUS.WAITING])
        .orderBy('lastMessageTimestamp', 'desc')
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }, 'filters');
  } catch (err) {
    console.error('[whatsappService] Erro ao listar chats do agente:', err);
    return [];
  }
}

/**
 * Lista chats na fila de um departamento
 */
async function getDepartmentQueue(department) {
  const cacheKey = `whatsapp_queue_${department}`;
  
  try {
    return await cacheService.get(cacheKey, async () => {
      const snapshot = await db.collection('chats')
        .where('department', '==', department)
        .where('status', '==', CHAT_STATUS.NEW)
        .orderBy('createdAt', 'asc')
        .limit(50)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }, 'whatsappQueue');
  } catch (err) {
    console.error('[whatsappService] Erro ao listar fila:', err);
    return [];
  }
}

/**
 * Atribui chat a um agente
 */
async function assignChatToAgent(chatId, agentId = null, sendWelcomeOrOptions = true, extraOptions = {}) {
  const currentAgentId = agentId || auth.currentUser?.uid;

  if (!currentAgentId) {
    throw new Error('Agente não identificado');
  }

  let sendWelcome = true;
  let phoneNumberIdOption = null;
  let phoneNumberDisplayOption = null;
  let businessPhoneNumberOption = null;

  if (typeof sendWelcomeOrOptions === 'object' && sendWelcomeOrOptions !== null) {
    const options = sendWelcomeOrOptions;
    sendWelcome = options.sendWelcome !== undefined ? options.sendWelcome : true;
    phoneNumberIdOption = options.phoneNumberId || null;
    phoneNumberDisplayOption = options.phoneNumberDisplay || null;
    businessPhoneNumberOption = options.businessPhoneNumber || null;
  } else {
    sendWelcome = sendWelcomeOrOptions;
    if (extraOptions && typeof extraOptions === 'object') {
      if (extraOptions.sendWelcome !== undefined) {
        sendWelcome = extraOptions.sendWelcome;
      }
      phoneNumberIdOption = extraOptions.phoneNumberId || null;
      phoneNumberDisplayOption = extraOptions.phoneNumberDisplay || null;
      businessPhoneNumberOption = extraOptions.businessPhoneNumber || null;
    }
  }

  try {
    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    const agentData = await getWhatsAppAgentProfile(currentAgentId, { requireAgent: true });

    if (!agentData) {
      throw new Error('Agente não cadastrado no sistema WhatsApp');
    }

    const chatData = chatDoc.exists ? chatDoc.data() : {};
    const targetDepartment = chatData.department || agentData.department || null;

    const effectivePhoneNumberId = phoneNumberIdOption || chatData.phoneNumberId || null;
    const effectivePhoneNumberDisplay = phoneNumberDisplayOption || chatData.phoneNumberDisplay || null;
    const effectiveBusinessPhoneNumber = businessPhoneNumberOption || chatData.businessPhoneNumber || null;

    // Verificar limite de chats
    const config = await loadWhatsAppConfig();
    const currentChats = await getAgentChats(currentAgentId);

    if (currentChats.length >= config.maxChatsPerAgent) {
      throw new Error(`Limite de ${config.maxChatsPerAgent} conversas simultâneas atingido`);
    }

    const updates = {
      status: CHAT_STATUS.ASSIGNED,
      agentId: currentAgentId,
      agentName: agentData.name || auth.currentUser?.displayName,
      assignedAt: firebase.firestore.FieldValue.serverTimestamp(),
      department: targetDepartment
    };

    if (effectivePhoneNumberId && chatData.phoneNumberId !== effectivePhoneNumberId) {
      updates.phoneNumberId = effectivePhoneNumberId;
    }

    if (effectivePhoneNumberDisplay && chatData.phoneNumberDisplay !== effectivePhoneNumberDisplay) {
      updates.phoneNumberDisplay = effectivePhoneNumberDisplay;
    }

    if (effectiveBusinessPhoneNumber && chatData.businessPhoneNumber !== effectiveBusinessPhoneNumber) {
      updates.businessPhoneNumber = effectiveBusinessPhoneNumber;
    }

    await chatRef.update(updates);

    // Atualizar estatísticas do agente
    await updateWhatsAppAgentCounters(currentAgentId, {
      activeChats: 1,
      totalAssigned: 1
    });

    // Enviar mensagem de boas-vindas (não bloqueia se falhar)
    if (sendWelcome && MESSAGE_TEMPLATES.assigned) {
      const welcomeText = MESSAGE_TEMPLATES.assigned.text
        .replace('{agentName}', agentData.name || 'Atendente')
        .replace('{department}', agentData.department || 'nosso time');

      try {
        await sendMessage(chatId, welcomeText, {
          origin: 'auto-welcome',
          phoneNumberId: effectivePhoneNumberId || null,
          phoneNumberDisplay: effectivePhoneNumberDisplay || null,
          businessPhoneNumber: effectiveBusinessPhoneNumber || null
        });
      } catch (msgError) {
        console.warn('[whatsappService]  Não foi possível enviar mensagem de boas-vindas:', msgError.message);
        // Não propagar erro - atribuição deve ocorrer mesmo se mensagem falhar
      }
    }

    // Invalidar cache
    cacheService.invalidateByPattern(/^whatsapp_/);
    cacheService.invalidateByPattern(/^whatsapp_waiting_chats_/);
    await logWhatsappActivity(
      'WHATSAPP_CHAT_ASSIGNED',
      `Conversa assumida por ${agentData.name || auth.currentUser?.displayName || 'Agente'}`,
      chatId,
      {
        customerName: resolveChatAuditLabel(chatData, chatId),
        phoneNumber: chatData.phoneNumber || chatData.numero || chatId,
        newAgentName: agentData.name || auth.currentUser?.displayName || 'Agente',
        phoneNumberId: effectivePhoneNumberId || null,
        source: 'assignChatToAgent'
      }
    );

    if (window.__DEBUG__) {
      console.log('[whatsappService] Chat atribuído:', chatId, 'para', currentAgentId, 'via número', effectivePhoneNumberId || 'padrão');
    }

    return {
      success: true,
      phoneNumberId: effectivePhoneNumberId || null
    };
  } catch (err) {
    console.error('[whatsappService] Erro ao atribuir chat:', err);
    throw err;
  }
}

/**
 * Transfere chat para outro departamento ou agente
 */
async function transferChat(chatId, targetDepartment = null, targetAgentId = null) {
  try {
    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    
    if (!chatDoc.exists) {
      throw new Error('Chat não encontrado');
    }

    const chatData = chatDoc.data();
    const updates = {
      status: CHAT_STATUS.TRANSFERRED,
      transferredAt: firebase.firestore.FieldValue.serverTimestamp(),
      transferredFrom: chatData.agentId
    };

    if (targetDepartment) {
      updates.department = targetDepartment;
      updates.status = CHAT_STATUS.NEW;
      updates.agentId = null;
      updates.agentName = null;
      
      // Notificar cliente (não bloqueia se falhar)
      const message = MESSAGE_TEMPLATES.transferred.text
        .replace('{department}', targetDepartment);
      
      try {
        await sendMessage(chatId, message);
      } catch (msgError) {
        console.warn('[whatsappService]  Não foi possível enviar mensagem de transferência:', msgError.message);
        // Não propagar erro - transferência deve ocorrer mesmo se mensagem falhar
      }
    }

    if (targetAgentId) {
      const targetAgentData = await getWhatsAppAgentProfile(targetAgentId, { requireAgent: true });
      if (!targetAgentData) {
        throw new Error('Agente de destino não encontrado');
      }

      updates.agentId = targetAgentId;
      updates.agentName = targetAgentData.name;
      updates.status = CHAT_STATUS.ASSIGNED;
      updates.department = targetAgentData.department;
    }

    await chatRef.update(updates);

    // Atualizar estatísticas
    if (chatData.agentId) {
      await updateWhatsAppAgentCounters(chatData.agentId, {
        activeChats: -1
      });
    }

    if (targetAgentId) {
      await updateWhatsAppAgentCounters(targetAgentId, {
        activeChats: 1,
        totalAssigned: 1
      });
    }

    // Invalidar cache
    cacheService.invalidateByPattern(/^whatsapp_/);

    return { success: true };
  } catch (err) {
    console.error('[whatsappService] Erro ao transferir chat:', err);
    throw err;
  }
}

/**
 * Finaliza conversa
 */
async function resolveChat(chatId, resolution = '', reason = '') {
  try {
    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    
    if (!chatDoc.exists) {
      throw new Error('Chat não encontrado');
    }

    const chatData = chatDoc.data();

    await chatRef.update({
      status: CHAT_STATUS.RESOLVED,
      resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      resolvedBy: auth.currentUser?.uid, //  Já existe
      lastAgentId: chatData.agentId, //  NOVO: Backup do último agente
      lastAgentName: chatData.agentName, //  NOVO: Nome do último agente
      lastDepartment: chatData.department, //  NOVO: Departamento ao finalizar
      resolution,
      resolutionReason: reason
    });

    // Atualizar estatísticas do agente
    if (chatData.agentId) {
      await updateWhatsAppAgentCounters(chatData.agentId, {
        activeChats: -1,
        totalResolved: 1
      });
    }

    // Enviar mensagem de encerramento (não bloqueia se falhar)
    if (MESSAGE_TEMPLATES.resolved) {
      try {
        await sendMessage(chatId, MESSAGE_TEMPLATES.resolved.text);
      } catch (msgError) {
        console.warn('[whatsappService]  Não foi possível enviar mensagem de encerramento:', msgError.message);
        // Não propagar erro - chat deve ser finalizado mesmo se mensagem falhar
        // Comum em modo desenvolvimento quando número não está na whitelist
      }
    }

    // Invalidar cache
    cacheService.invalidateByPattern(/^whatsapp_/);
    await logWhatsappActivity(
      'WHATSAPP_CHAT_RESOLVED',
      `Conversa finalizada por ${chatData.agentName || 'Agente'}`,
      chatId,
      {
        customerName: resolveChatAuditLabel(chatData, chatId),
        phoneNumber: chatData.phoneNumber || chatData.numero || chatId,
        reason,
        resolutionReason: reason,
        source: 'resolveChat'
      }
    );

    return { success: true };
  } catch (err) {
    console.error('[whatsappService] Erro ao finalizar chat:', err);
    throw err;
  }
}

/**
 * Reabre uma conversa finalizada
 * @param {string} chatId - ID da conversa a reabrir
 * @param {string} agentId - ID do agente que está reabrindo (opcional, usa currentUser se não fornecido)
 * @returns {Promise<object>} Resultado da operação
 */
async function reopenChat(chatId, agentId = null) {
  try {
    const currentAgentId = agentId || auth.currentUser?.uid;
    
    if (!currentAgentId) {
      throw new Error('Usuário não autenticado');
    }

    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    
    if (!chatDoc.exists) {
      throw new Error('Chat não encontrado');
    }

    const chatData = chatDoc.data();

    // Verificar se está realmente finalizado
    if (chatData.status !== CHAT_STATUS.RESOLVED) {
      throw new Error('Apenas conversas finalizadas podem ser reabertas');
    }

    // Atualizar conversa
    await chatRef.update({
      status: CHAT_STATUS.ACTIVE,
      assignedTo: currentAgentId,
      agentId: currentAgentId,
      reopenedAt: firebase.firestore.FieldValue.serverTimestamp(),
      reopenedBy: currentAgentId,
      // Limpar campos de resolução
      resolvedAt: firebase.firestore.FieldValue.delete(),
      resolvedBy: firebase.firestore.FieldValue.delete(),
      resolution: firebase.firestore.FieldValue.delete(),
      resolutionReason: firebase.firestore.FieldValue.delete()
    });

    // Atualizar estatísticas do agente
    await updateWhatsAppAgentCounters(currentAgentId, {
      activeChats: 1,
      totalResolved: -1 // Decrementar pois foi reaberto
    });

    // Enviar mensagem de reabertura
    try {
      const agent = await getWhatsAppAgentProfile(currentAgentId);
      const agentName = agent?.name || 'Agente';
      
      await sendMessage(
        chatId, 
        `Olá! Sua conversa foi reaberta por ${agentName}. Como posso ajudá-lo novamente?`
      );
    } catch (msgError) {
      console.warn('[whatsappService]  Não foi possível enviar mensagem de reabertura:', msgError.message);
      // Não propagar erro
    }

    // Invalidar cache
    cacheService.invalidateByPattern(/^whatsapp_/);
    await logWhatsappActivity(
      'WHATSAPP_CHAT_REOPENED',
      `Conversa reaberta por ${auth.currentUser?.displayName || 'Agente'}`,
      chatId,
      {
        customerName: resolveChatAuditLabel(chatData, chatId),
        phoneNumber: chatData.phoneNumber || chatData.numero || chatId,
        newAgentName: auth.currentUser?.displayName || 'Agente',
        source: 'reopenChat'
      }
    );

    if (window.__DEBUG__) {
      console.log(`[whatsappService]  Chat ${chatId} reaberto por agente ${currentAgentId}`);
    }

    return { 
      success: true,
      message: 'Conversa reaberta com sucesso'
    };
  } catch (err) {
    console.error('[whatsappService] Erro ao reabrir chat:', err);
    throw err;
  }
}

/**
 * Obtém mensagens de um chat
 */
async function getChatMessages(chatId, limit = 50) {
  const cacheKey = `whatsapp_messages_${chatId}_${limit}`;
  
  try {
    return await cacheService.get(cacheKey, async () => {
      const snapshot = await db.collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).reverse();
    }, 'whatsappMessages');
  } catch (err) {
    console.error('[whatsappService] Erro ao buscar mensagens:', err);
    return [];
  }
}

/**
 * Marca mensagens como lidas
 */
async function markMessagesAsRead(chatId) {
  try {
    const messagesSnapshot = await db.collection('chats')
      .doc(chatId)
      .collection('messages')
      .where('direction', '==', 'inbound')
      .where('read', '==', false)
      .get();

    const batch = db.batch();
    
    messagesSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, { read: true });
    });

    await batch.commit();

    // Invalidar cache
    cacheService.invalidateByPattern(new RegExp(`^whatsapp_messages_${chatId}`));

    return { success: true, count: messagesSnapshot.size };
  } catch (err) {
    console.error('[whatsappService] Erro ao marcar como lidas:', err);
    throw err;
  }
}

/**
 * Registra ou atualiza agente
 */
async function registerAgent(agentData) {
  const userId = auth.currentUser?.uid;
  
  if (!userId) {
    throw new Error('Usuário não autenticado');
  }

  try {
    //  NOVO: Salvar em users.whatsapp (Opção 2 - Unificação)
    const userRef = db.collection('users').doc(userId);
    
    await userRef.set({
      whatsapp: {
        isAgent: true,
        department: agentData.department,
        status: AGENT_STATUS.ONLINE,
        activeChats: 0,
        totalAssigned: 0,
        totalResolved: 0,
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
        registeredAt: firebase.firestore.FieldValue.serverTimestamp()
      }
    }, { merge: true });

    cacheService.invalidateByPattern(/^whatsapp_agents/);
    cacheService.invalidateByPattern(/^users/);

    return { success: true };
  } catch (err) {
    console.error('[whatsappService] Erro ao registrar agente:', err);
    throw err;
  }
}

/**
 * Atualiza status do agente
 */
async function updateAgentStatus(status) {
  const userId = auth.currentUser?.uid;
  
  if (!userId) return;

  try {
    //  NOVO: Atualizar em users.whatsapp
    await db.collection('users').doc(userId).update({
      'whatsapp.status': status,
      'whatsapp.lastActive': firebase.firestore.FieldValue.serverTimestamp()
    });

    cacheService.invalidateByPattern(/^whatsapp_agents/);
    cacheService.invalidateByPattern(/^users/);
  } catch (err) {
    console.error('[whatsappService] Erro ao atualizar status:', err);
  }
}

/**
 * Lista agentes online de um departamento
 */
async function getAvailableAgents(department) {
  const cacheKey = `whatsapp_agents_${department}`;
  
  try {
    return await cacheService.get(cacheKey, async () => {
      const config = await loadWhatsAppConfig();
      
      //  NOVO: Buscar em users.whatsapp
      const snapshot = await db.collection('users')
        .where('whatsapp.isAgent', '==', true)
        .where('whatsapp.department', '==', department)
        .where('whatsapp.status', 'in', [AGENT_STATUS.ONLINE, AGENT_STATUS.AWAY])
        .get();

      return snapshot.docs
        .map(doc => {
          const data = doc.data() || {};
          return {
            id: doc.id,
            name: getAgentDisplayNameFromUserData(data),
            email: data.email,
            avatarUrl: data.avatarUrl,
            ...(data.whatsapp || {})
          };
        })
        .filter(agent => agent.activeChats < config.maxChatsPerAgent)
        .sort((a, b) => a.activeChats - b.activeChats);
    }, 'users');
  } catch (err) {
    console.error('[whatsappService] Erro ao listar agentes:', err);
    return [];
  }
}

/**
 * Lista agentes cadastrados (para filtros/admin)
 */
async function listRegisteredAgents() {
  const cacheKey = 'whatsapp_agents_registered';

  try {
    return await cacheService.get(cacheKey, async () => {
      let agents = [];

      // Preferência: users.whatsapp
      try {
        const snapshot = await db.collection('users')
          .where('whatsapp.isAgent', '==', true)
          .get();

        agents = snapshot.docs.map(doc => {
          const data = doc.data() || {};
          const whatsappData = data.whatsapp || {};
          return {
            id: doc.id,
            name: data.shortName || data.fullName || data.displayName || data.name || data.email || 'Agente',
            email: data.email || null,
            status: whatsappData.status || data.status || null,
            department: whatsappData.department || data.department || null
          };
        });
      } catch (usersErr) {
        console.warn('[whatsappService] Falha ao listar agentes em users:', usersErr);
      }

      return agents
        .filter(agent => agent && agent.id)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
    }, 'users');
  } catch (err) {
    console.error('[whatsappService] Erro ao listar agentes cadastrados:', err);
    return [];
  }
}

/**
 * Distribuição automática de chat para agente disponível
 */
async function autoAssignChat(chatId, department) {
  try {
    const agents = await getAvailableAgents(department);
    
    if (agents.length === 0) {
      // Nenhum agente disponível - manter na fila
      await db.collection('chats').doc(chatId).update({
        status: CHAT_STATUS.NEW,
        department
      });
      
      // Notificar cliente que está na fila (não bloqueia se falhar)
      try {
        await sendMessage(chatId, MESSAGE_TEMPLATES.offline.text);
      } catch (msgError) {
        console.warn('[whatsappService]  Não foi possível enviar mensagem de offline:', msgError.message);
        // Não propagar erro - chat deve ficar na fila mesmo se mensagem falhar
      }
      
      return { success: false, reason: 'no_agents_available' };
    }

    // Atribuir ao agente com menos conversas ativas
    const selectedAgent = agents[0];
    await assignChatToAgent(chatId, selectedAgent.id);

    return { success: true, agentId: selectedAgent.id };
  } catch (err) {
    console.error('[whatsappService] Erro na distribuição automática:', err);
    throw err;
  }
}

/**
 * Verifica se o chat está dentro da janela de 24h para envio de mensagens livres
 * @param {string} chatId - ID do chat (número do telefone)
 * @returns {Promise<{canSendFreeform: boolean, lastInboundTimestamp: Date|null, hoursRemaining: number}>}
 */
async function checkChatMessagingWindow(chatId) {
  try {
    // Buscar última mensagem RECEBIDA (inbound) do contato
    const messagesSnapshot = await db.collection('chats')
      .doc(chatId)
      .collection('messages')
      .where('direction', '==', 'inbound')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (messagesSnapshot.empty) {
      // Sem mensagens recebidas = precisa usar template
      return {
        canSendFreeform: false,
        lastInboundTimestamp: null,
        hoursRemaining: 0,
        requiresTemplate: true
      };
    }

    const lastMessage = messagesSnapshot.docs[0].data();
    const lastInboundTimestamp = lastMessage.timestamp?.toDate();
    
    if (!lastInboundTimestamp) {
      return {
        canSendFreeform: false,
        lastInboundTimestamp: null,
        hoursRemaining: 0,
        requiresTemplate: true
      };
    }

    // Calcular diferença em horas
    const now = new Date();
    const hoursPassed = (now - lastInboundTimestamp) / (1000 * 60 * 60);
    const hoursRemaining = Math.max(0, 24 - hoursPassed);

    return {
      canSendFreeform: hoursPassed < 24,
      lastInboundTimestamp,
      hoursRemaining: Math.floor(hoursRemaining),
      requiresTemplate: hoursPassed >= 24
    };
  } catch (err) {
    console.error('[whatsappService] Erro ao verificar janela de mensagens:', err);
    // Em caso de erro, assumir que pode enviar (não bloquear)
    return {
      canSendFreeform: true,
      lastInboundTimestamp: null,
      hoursRemaining: 24,
      requiresTemplate: false
    };
  }
}

/**
 * Listener em tempo real para mensagens de um chat
 */
function listenToChatMessages(chatId, callback) {
  console.log(`[whatsappService] Iniciando listener de mensagens para chat: ${chatId}`);
  console.log(`[whatsappService] Usuário autenticado: ${auth.currentUser?.uid || 'NENHUM'}`);
  console.log(`[whatsappService] Firestore disponível: ${db ? 'SIM' : 'NÃO'}`);
  
  if (!db) {
    console.error('[whatsappService] Firestore não disponível!');
    return () => {};
  }

  const messagesRef = db.collection('chats')
    .doc(chatId)
    .collection('messages')
    .orderBy('timestamp', 'desc');

  console.log('[whatsappService] Criando listener com path:', `chats/${chatId}/messages`);
  
  const unsubscribe = messagesRef.onSnapshot(snapshot => {
      console.log(`[whatsappService] Mensagens atualizadas para ${chatId}: ${snapshot.size} mensagens`);
      console.log(`[whatsappService] Snapshot metadata:`, {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites
      });
      
      const messages = snapshot.docs
        .map(doc => {
          const data = doc.data();
          console.log(`[whatsappService] Mensagem raw:`, doc.id, JSON.stringify(data, null, 2));
          return { id: doc.id, ...data };
        })
        .reverse();
      
      console.log('[whatsappService] Mensagens processadas:', messages.length);
      callback(messages);
      
      // Invalidar cache
      cacheService.invalidateByPattern(new RegExp(`^whatsapp_messages_${chatId}`));
    }, err => {
      console.error('[whatsappService] Erro no listener de mensagens:', err);
      console.error('[whatsappService] Código do erro:', err.code);
      console.error('[whatsappService] Mensagem:', err.message);
    });

  return unsubscribe;
}

/**
 * Listener em tempo real para chats do agente
 */
function listenToAgentChats(agentId, callback) {
  const currentAgentId = agentId || auth.currentUser?.uid;
  
  if (!currentAgentId) return () => {};

  const unsubscribe = db.collection('chats')
    .where('agentId', '==', currentAgentId)
    .where('status', 'in', [CHAT_STATUS.ASSIGNED, CHAT_STATUS.ACTIVE, CHAT_STATUS.WAITING])
    .orderBy('lastMessageTimestamp', 'desc')
    .onSnapshot(snapshot => {
      const chats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      callback(chats);
      
      // Invalidar cache
      cacheService.invalidateByPattern(new RegExp(`^whatsapp_agent_chats_${currentAgentId}`));
    }, err => {
      console.error('[whatsappService] Erro no listener de chats:', err);
    });

  return unsubscribe;
}

function listenToWaitingChats(department, callback) {
  const waitingStatuses = [CHAT_STATUS.NEW, CHAT_STATUS.WAITING];

  let query = db.collection('chats')
    .where('status', 'in', waitingStatuses)
    .limit(50);

  if (department) {
    query = query.where('department', '==', department);
  }

  const unsubscribe = query.onSnapshot(snapshot => {
    const queue = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
      .sort((a, b) => getWaitingChatTimestampMillis(a) - getWaitingChatTimestampMillis(b))
      .slice(0, 50);

    callback(queue);
  }, err => {
    console.error('[whatsappService] Erro no listener de fila:', err);
  });

  return unsubscribe;
}

/**
 * Vincular chat a um contrato existente
 */
async function linkChatToContract(chatId, contractId) {
  try {
    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    const previousContractId = chatDoc.exists
      ? chatDoc.data().contractId || chatDoc.data().linkedContractId || null
      : null;

    const updatePayload = {
      contractId,
      linkedContractId: contractId,
      linkedAt: firebase.firestore.FieldValue.serverTimestamp(),
      linkedBy: auth.currentUser?.uid || null,
      linkedByEmail: auth.currentUser?.email || null,
      linkedByName: auth.currentUser?.displayName || auth.currentUser?.email || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await chatRef.update(updatePayload);

    cacheService.invalidateByPattern(new RegExp(`^whatsapp_chat_${chatId}`));
    if (contractId) {
      cacheService.invalidate(`whatsapp_chat_contract_${contractId}`);
      cacheService.invalidate(`whatsapp_chats_contract_${contractId}`);
    }
    if (previousContractId && previousContractId !== contractId) {
      cacheService.invalidate(`whatsapp_chat_contract_${previousContractId}`);
      cacheService.invalidate(`whatsapp_chats_contract_${previousContractId}`);
    }

    return { success: true };
  } catch (err) {
    console.error('[whatsappService] Erro ao vincular contrato:', err);
    throw err;
  }
}

function buildPhoneVariants(rawPhone) {
  if (rawPhone === undefined || rawPhone === null) {
    return [];
  }

  const variants = new Set();
  const trimmed = String(rawPhone).trim();

  if (!trimmed) {
    return [];
  }

  variants.add(trimmed);

  const digits = trimmed.replace(/\D/g, '');
  if (digits) {
    variants.add(digits);

    if (trimmed.startsWith('+')) {
      variants.add(`+${digits}`);
    }

    if (digits.length >= 10) {
      if (!trimmed.startsWith('+')) {
        if (digits.startsWith(BRAZIL_COUNTRY_CODE)) {
          variants.add(`+${digits}`);
        } else {
          variants.add(`+${BRAZIL_COUNTRY_CODE}${digits}`);
        }
      }

      const hasLocalFormat = digits.length === 10 || digits.length === 11;
      if (hasLocalFormat) {
        const ddd = digits.slice(0, 2);
        const middleLength = digits.length === 11 ? 5 : 4;
        const firstSegment = digits.slice(2, 2 + middleLength);
        const lastSegment = digits.slice(2 + middleLength);

        if (ddd && firstSegment && lastSegment) {
          variants.add(`(${ddd}) ${firstSegment}-${lastSegment}`);
          variants.add(`${ddd}${firstSegment}${lastSegment}`);
          variants.add(`${ddd}-${firstSegment}-${lastSegment}`);
        }
      }
    }
  }

  return Array.from(variants).filter(Boolean);
}

async function findContractsByPhoneCandidates(phoneNumbers = [], options = {}) {
  try {
    const inputs = Array.isArray(phoneNumbers) ? phoneNumbers : [phoneNumbers];
    const uniqueInputs = Array.from(new Set(inputs
      .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
      .filter(Boolean)));

    if (uniqueInputs.length === 0) {
      return [];
    }

    const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 5;
    const stopOnMultiple = options.stopOnMultiple !== false;
    const perQueryLimit = Math.min(Math.max(limit, 1), 5);

    const seenContracts = new Map();
    const results = [];
    const scheduledPairs = new Set();
    const pairContexts = new Map();
    const queue = [];

    for (const input of uniqueInputs) {
      const variants = buildPhoneVariants(input);

      for (const variant of variants) {
        if (!variant || variant.length < 3) {
          continue;
        }

        for (const field of CONTRACT_PHONE_FIELDS) {
          const key = `${field}__${variant}`;
          if (!pairContexts.has(key)) {
            pairContexts.set(key, new Set());
          }
          pairContexts.get(key).add(input);

          if (scheduledPairs.has(key)) {
            continue;
          }

          scheduledPairs.add(key);
          queue.push({ field, variant, key });
        }
      }
    }

    if (queue.length === 0) {
      return [];
    }

    let shouldStop = false;
    let cursor = 0;

    const runQuery = async ({ field, variant, key }) => {
      try {
        const snapshot = await db.collection('contracts')
          .where(field, '==', variant)
          .limit(perQueryLimit)
          .get();

        snapshot.docs.forEach((doc) => {
          const existing = seenContracts.get(doc.id);
          const contextEntries = Array.from(pairContexts.get(key) || []);

          if (!existing) {
            const data = doc.data() || {};
            const entry = {
              id: doc.id,
              ...data,
              matchContext: contextEntries.map((candidate) => ({
                field,
                value: variant,
                candidate
              }))
            };
            seenContracts.set(doc.id, entry);
            results.push(entry);
          } else if (Array.isArray(existing.matchContext)) {
            contextEntries.forEach((candidate) => {
              existing.matchContext.push({
                field,
                value: variant,
                candidate
              });
            });
          }
        });

        if (stopOnMultiple && results.length >= limit) {
          shouldStop = true;
        }
      } catch (queryErr) {
        if (window.__DEBUG__) {
          console.warn('[whatsappService] Falha ao consultar contrato por telefone', {
            field,
            variant,
            error: queryErr?.message || queryErr
          });
        }
      }
    };

    const worker = async () => {
      while (!shouldStop) {
        const index = cursor++;
        if (index >= queue.length) {
          break;
        }

        await runQuery(queue[index]);

        if (shouldStop) {
          break;
        }
      }
    };

    const concurrency = Math.max(1, Math.min(options.concurrency || PHONE_SEARCH_CONCURRENCY, queue.length));
    const workers = Array.from({ length: concurrency }, worker);
    await Promise.all(workers);

    return results.slice(0, limit);
  } catch (err) {
    console.error('[whatsappService] Erro ao buscar contratos por telefone:', err);
    return [];
  }
}

/**
 * Busca contrato por telefone
 */
async function findContractByPhone(phoneNumber) {
  if (!phoneNumber) {
    return null;
  }

  try {
    const matches = await findContractsByPhoneCandidates([phoneNumber], {
      limit: 1,
      stopOnMultiple: false
    });

    if (matches.length === 0) {
      return null;
    }

    const [match] = matches;
    const contractData = { ...(match || {}) };
    delete contractData.matchContext;

    if (!contractData.id && match?.id) {
      contractData.id = match.id;
    }

    return contractData;
  } catch (err) {
    console.error('[whatsappService] Erro ao buscar contrato:', err);
    return null;
  }
}

/**
 * Atualiza campos personalizados da conversa
 */
async function updateChatCustomFields(chatId, customFields = {}) {
  try {
    await db.collection('chats').doc(chatId).update({
      customFields,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    cacheService.invalidateByPattern(/^whatsapp_/);
    return { success: true };
  } catch (err) {
    console.error('[whatsappService] Erro ao atualizar campos personalizados:', err);
    throw err;
  }
}

/**
 * Cria/atualiza mensagem rápida
 */
async function saveQuickMessage(data) {
  try {
    const { id, shortcut, text, department, isGlobal = false } = data;
    
    if (!shortcut || !text) {
      throw new Error('Atalho e texto são obrigatórios');
    }

    const quickMessageData = {
      shortcut,
      text,
      department: department || null,
      isGlobal,
      createdBy: auth.currentUser?.uid,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (id) {
      await db.collection('quickMessages').doc(id).update(quickMessageData);
    } else {
      quickMessageData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('quickMessages').add(quickMessageData);
    }

    cacheService.invalidate('whatsapp_quick_messages');
    return { success: true };
  } catch (err) {
    console.error('[whatsappService] Erro ao salvar mensagem rápida:', err);
    throw err;
  }
}

/**
 * Lista mensagens rápidas
 */
async function getQuickMessages(department = null) {
  const cacheKey = `whatsapp_quick_messages_${department || 'all'}`;
  
  try {
    return await cacheService.get(cacheKey, async () => {
      let query = db.collection('quickMessages');
      
      if (department) {
        query = query.where('department', 'in', [department, null]);
      }

      const snapshot = await query.orderBy('shortcut').get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }, 'whatsappMessages');
  } catch (err) {
    console.error('[whatsappService] Erro ao buscar mensagens rápidas:', err);
    return [];
  }
}

/**
 * Deleta mensagem rápida
 */
async function deleteQuickMessage(id) {
  try {
    await db.collection('quickMessages').doc(id).delete();
    cacheService.invalidateByPattern(/^whatsapp_quick_messages/);
    return { success: true };
  } catch (err) {
    console.error('[whatsappService] Erro ao deletar mensagem rápida:', err);
    throw err;
  }
}

/**
 * Remove vínculo de conversa com contrato
 */
async function unlinkChatFromContract(chatId) {
  try {
    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    const existingContractId = chatDoc.exists
      ? chatDoc.data().contractId || chatDoc.data().linkedContractId || null
      : null;

    await chatRef.update({
      contractId: firebase.firestore.FieldValue.delete(),
      linkedContractId: firebase.firestore.FieldValue.delete(),
      linkedAt: firebase.firestore.FieldValue.delete()
    });

    cacheService.invalidateByPattern(new RegExp(`^whatsapp_chat_${chatId}`));
    if (existingContractId) {
      cacheService.invalidate(`whatsapp_chat_contract_${existingContractId}`);
      cacheService.invalidate(`whatsapp_chats_contract_${existingContractId}`);
    }
    cacheService.invalidateByPattern(/^whatsapp_/);
    return { success: true };
  } catch (err) {
    console.error('[whatsappService] Erro ao desvincular chat do contrato:', err);
    throw err;
  }
}

async function deleteChat(chatId, options = {}) {
  const chatDocId = typeof chatId === 'string' ? chatId.trim() : '';
  if (!chatDocId) {
    throw new Error('ID da conversa é obrigatório.');
  }

  const {
    batchSize = 200,
    forceRefreshClaims = false
  } = options;

  const isAdmin = await checkIfUserIsAdmin(null, { forceRefresh: forceRefreshClaims });
  if (!isAdmin) {
    throw new Error('Apenas administradores podem excluir conversas.');
  }

  try {
    const chatRef = db.collection('chats').doc(chatDocId);
    const chatSnapshot = await chatRef.get();

    if (!chatSnapshot.exists) {
      throw new Error('Conversa não encontrada.');
    }

    const chatData = chatSnapshot.data() || {};
    const sanitizedBatchSize = Math.min(Math.max(parseInt(batchSize, 10) || 200, 50), 500);

    const attachmentsRef = chatRef.collection('attachments');
    let deletedAttachments = 0;

    while (true) {
      const attachmentsSnapshot = await attachmentsRef.limit(sanitizedBatchSize).get();
      if (attachmentsSnapshot.empty) {
        break;
      }

      for (const doc of attachmentsSnapshot.docs) {
        const attachmentData = doc.data() || {};
        const storagePath = attachmentData.path || attachmentData.storagePath || null;
        if (storagePath && storage?.ref) {
          try {
            await storage.ref(storagePath).delete();
          } catch (storageErr) {
            if (window.__DEBUG__) {
              console.warn('[whatsappService] Falha ao remover arquivo do Storage:', storagePath, storageErr);
            }
          }
        }
      }

      const batch = db.batch();
      attachmentsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deletedAttachments += attachmentsSnapshot.size;
    }

    const messagesRef = chatRef.collection('messages');
    let deletedMessages = 0;
    const documentIdField = typeof firebase?.firestore?.FieldPath?.documentId === 'function'
      ? firebase.firestore.FieldPath.documentId()
      : '__name__';

    while (true) {
      const messagesSnapshot = await messagesRef
        .orderBy(documentIdField)
        .limit(sanitizedBatchSize)
        .get();

      if (messagesSnapshot.empty) {
        break;
      }

      const batch = db.batch();
      messagesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deletedMessages += messagesSnapshot.size;
    }

    await chatRef.delete();

    if (chatData.agentId && [CHAT_STATUS.ASSIGNED, CHAT_STATUS.ACTIVE, CHAT_STATUS.WAITING].includes(chatData.status)) {
      try {
        await updateWhatsAppAgentCounters(chatData.agentId, {
          activeChats: -1
        });
      } catch (agentErr) {
        if (window.__DEBUG__) {
          console.warn('[whatsappService] Falha ao ajustar contagem do agente:', agentErr);
        }
      }
    }

    cacheService.invalidate(`whatsapp_chat_${chatDocId}`);
    cacheService.invalidateByPattern(new RegExp(`^whatsapp_messages_${chatDocId}`));
    cacheService.invalidateByPattern(new RegExp(`^whatsapp_attachments_${chatDocId}`));
    cacheService.invalidateByPattern(/^whatsapp_agent_chats_/);
    cacheService.invalidateByPattern(/^whatsapp_waiting_chats_/);
    cacheService.invalidateByPattern(/^whatsapp_active_chats_/);
    cacheService.invalidateByPattern(/^whatsapp_/);

    if (window.__DEBUG__) {
      console.log('[whatsappService] Conversa removida:', chatDocId, {
        deletedMessages,
        deletedAttachments
      });
    }

    return {
      success: true,
      deletedMessages,
      deletedAttachments
    };
  } catch (err) {
    console.error('[whatsappService] Erro ao excluir conversa:', err);
    throw err;
  }
}

/**
 * Busca conversas ativas (em atendimento)
 */
/**
 * Busca conversas ativas (em atendimento)
 * @param {string|null} agentId - ID do agente (null = todos, apenas para admin)
 * @returns {Promise<Array>} Lista de conversas ativas
 */
async function getActiveChats(agentId = null) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.warn('[whatsappService] Usuário não autenticado');
    return [];
  }

  //  NOVO: Verificar se é admin
  const isAdmin = await checkIfUserIsAdmin(currentUser.uid);
  
  const cacheKey = `whatsapp_active_chats_${agentId || (isAdmin ? 'all' : currentUser.uid)}`;
  
  try {
    return await cacheService.get(cacheKey, async () => {
      const activeStatuses = [
        CHAT_STATUS.ASSIGNED,
        CHAT_STATUS.ACTIVE,
        CHAT_STATUS.WAITING
      ];

      let query = db.collection('chats')
        .where('status', 'in', activeStatuses);

      //  NOVO: Se não é admin, SEMPRE filtrar por agentId
      if (!isAdmin) {
        const currentAgentId = agentId || currentUser.uid;
        query = query.where('agentId', '==', currentAgentId);
        
        if (window.__DEBUG__) {
          console.log(`[whatsappService] Agente comum - filtrando por agentId: ${currentAgentId}`);
        }
      } else if (agentId) {
        // Admin pode filtrar por agente específico se quiser
        query = query.where('agentId', '==', agentId);
        
        if (window.__DEBUG__) {
          console.log(`[whatsappService] Admin - filtrando por agentId específico: ${agentId}`);
        }
      } else {
        if (window.__DEBUG__) {
          console.log('[whatsappService] Admin - buscando TODAS as conversas ativas');
        }
      }

      const snapshot = await query
        .orderBy('lastMessageTimestamp', 'desc')
        .limit(50)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }, 'whatsappChats');
  } catch (err) {
    console.error('[whatsappService] Erro ao buscar chats ativos:', err);
    return [];
  }
}

/**
 * Busca conversas aguardando atendimento
 */
async function getWaitingChats(department = null, options = {}) {
  const cacheKey = `whatsapp_waiting_chats_${department || 'all'}`;
  const { skipCache = false } = options;
  
  try {
    return await cacheService.get(cacheKey, async () => {
      const waitingStatuses = [CHAT_STATUS.NEW, CHAT_STATUS.WAITING];

      let query = db.collection('chats')
        .where('status', 'in', waitingStatuses)
        .limit(50);

      if (department) {
        query = query.where('department', '==', department);
      }

      const snapshot = await query.get();

      const queue = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      queue.sort((a, b) => getWaitingChatTimestampMillis(a) - getWaitingChatTimestampMillis(b));

      return queue.slice(0, 50);
    }, 'filters', skipCache);
  } catch (err) {
    console.error('[whatsappService] Erro ao buscar chats aguardando:', err);
    return [];
  }
}

/**
 *  MODIFICADO: Busca conversas finalizadas com validação de admin
 * @param {string|null} agentId - ID do agente (null = todos, apenas para admin)
 * @param {number} limit - Limite de resultados
 */
async function getResolvedChats(agentId = null, limit = 50) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.warn('[whatsappService] Usuário não autenticado');
    return [];
  }

  //  NOVO: Verificar se é admin
  const isAdmin = await checkIfUserIsAdmin(currentUser.uid);
  const currentAgentId = agentId || currentUser.uid;
  
  const cacheKey = `whatsapp_resolved_chats_${isAdmin && !agentId ? 'all' : currentAgentId}_${limit}`;
  
  try {
    return await cacheService.get(cacheKey, async () => {
      let query = db.collection('chats')
        .where('status', '==', CHAT_STATUS.RESOLVED)
        .limit(limit);

      //  NOVO: Se não é admin, SEMPRE filtrar por resolvedBy ou agentId
      if (!isAdmin) {
        //  Tentar filtrar por resolvedBy (requer índice composto)
        try {
          query = query.where('resolvedBy', '==', currentAgentId);
          
          if (window.__DEBUG__) {
            console.log(`[whatsappService] Agente comum - filtrando finalizadas por resolvedBy: ${currentAgentId}`);
          }
        } catch (indexError) {
          // Fallback: filtrar por agentId (quem TINHA a conversa ao finalizar)
          console.warn('[whatsappService] Índice resolvedBy não encontrado, usando agentId', indexError);
          query = query.where('agentId', '==', currentAgentId);
        }
      } else if (agentId) {
        // Admin pode filtrar por agente específico
        try {
          query = query.where('resolvedBy', '==', agentId);
        } catch {
          query = query.where('agentId', '==', agentId);
        }
        
        if (window.__DEBUG__) {
          console.log(`[whatsappService] Admin - filtrando finalizadas por agente: ${agentId}`);
        }
      } else {
        if (window.__DEBUG__) {
          console.log('[whatsappService] Admin - buscando TODAS as conversas finalizadas');
        }
      }

      // Tentar ordenar por resolvedAt se o índice existir
      try {
        query = query.orderBy('resolvedAt', 'desc');
      } catch {
        if (window.__DEBUG__) {
          console.warn('[whatsappService] Índice resolvedAt não encontrado, usando sem ordenação');
        }
      }

      const snapshot = await query.get();
      let chats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Ordenar manualmente por resolvedAt se não foi feito no query
      chats.sort((a, b) => {
        const dateA = a.resolvedAt?.toMillis ? a.resolvedAt.toMillis() : 0;
        const dateB = b.resolvedAt?.toMillis ? b.resolvedAt.toMillis() : 0;
        return dateB - dateA; // Mais recentes primeiro
      });

      if (window.__DEBUG__) {
        console.log(`[whatsappService] ${chats.length} chats finalizados retornados`);
      }

      return chats;
    }, 'filters');
  } catch (err) {
    console.error('[whatsappService] Erro ao buscar chats finalizados:', err);
    if (window.__DEBUG__) {
      console.error('Stack:', err.stack);
    }
    return [];
  }
}

async function startChatWithNumber(rawNumber, options = {}) {
  const {
    initialMessage = '',
    department = null,
    phoneNumberId: outboundPhoneNumberId = null,
    businessPhoneNumber = null,
    phoneNumberDisplay = null
  } = options;
  const normalized = normalizePhoneNumber(rawNumber);

  if (!normalized) {
    throw new Error('Número de telefone inválido.');
  }

  if (normalized.length < 11) {
    throw new Error('Número de telefone muito curto.');
  }

  if (!auth.currentUser?.uid) {
    throw new Error('Agente não autenticado.');
  }

  try {
    const chatRef = db.collection('chats').doc(normalized);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      await chatRef.set({
        numero: normalized,
        status: CHAT_STATUS.NEW,
        department: department || null,
        agentId: null,
        agentName: null,
        contractId: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastMessageTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
        lastMessageDirection: null,
        lastMessageText: null,
        phoneNumberId: outboundPhoneNumberId || null,
        phoneNumberDisplay: phoneNumberDisplay || null,
        businessPhoneNumber: businessPhoneNumber || null
      });
    } else {
      const updates = {
        lastMessageTimestamp: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (department && chatDoc.data().department !== department) {
        updates.department = department;
      }

      if (outboundPhoneNumberId && chatDoc.data().phoneNumberId !== outboundPhoneNumberId) {
        updates.phoneNumberId = outboundPhoneNumberId;
      }

      if (phoneNumberDisplay && chatDoc.data().phoneNumberDisplay !== phoneNumberDisplay) {
        updates.phoneNumberDisplay = phoneNumberDisplay;
      }

      if (businessPhoneNumber && chatDoc.data().businessPhoneNumber !== businessPhoneNumber) {
        updates.businessPhoneNumber = businessPhoneNumber;
      }

      if ([CHAT_STATUS.RESOLVED, CHAT_STATUS.TRANSFERRED].includes(chatDoc.data().status)) {
        updates.status = CHAT_STATUS.NEW;
        updates.reopenedAt = firebase.firestore.FieldValue.serverTimestamp();
      }

      await chatRef.update(updates);
    }

    const assignOptions = {
      sendWelcome: !initialMessage,
      phoneNumberId: outboundPhoneNumberId || null,
      phoneNumberDisplay: phoneNumberDisplay || null,
      businessPhoneNumber: businessPhoneNumber || null
    };

    await assignChatToAgent(normalized, auth.currentUser.uid, assignOptions);

    if (initialMessage) {
      await sendMessage(normalized, initialMessage.trim(), {
        origin: 'agent-start',
        phoneNumberId: outboundPhoneNumberId || null,
        phoneNumberDisplay: phoneNumberDisplay || null,
        businessPhoneNumber: businessPhoneNumber || null
      });
    }

    cacheService.invalidateByPattern(/^whatsapp_waiting_chats_/);
    cacheService.invalidateByPattern(/^whatsapp_agent_chats_/);

    return normalized;
  } catch (err) {
    console.error('[whatsappService] Erro ao iniciar conversa manualmente:', err);
    throw err;
  }
}

/**
 * Transfere conversa para outro agente
 */
async function transferChatToAgent(chatId, targetAgentId, notes = '') {
  try {
    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    
    if (!chatDoc.exists) {
      throw new Error('Chat não encontrado');
    }

    const chatData = chatDoc.data();
    const currentAgentId = chatData.agentId;
    const currentAgentName = chatData.agentName;

    //  Buscar dados do agente de destino
    const targetAgentDoc = await db.collection('users').doc(targetAgentId).get();
    if (!targetAgentDoc.exists) {
      throw new Error('Agente de destino não encontrado');
    }

    const targetAgentData = targetAgentDoc.data();
    const targetAgentName = targetAgentData.shortName || targetAgentData.fullName || 'Agente';
    const targetAgentEmail = targetAgentData.email;
    const targetAgentDepartment = targetAgentData.whatsapp?.department;

    //  Atualizar chat com todas as informações do novo agente
    await chatRef.update({
      agentId: targetAgentId,
      agentName: targetAgentName,
      agentEmail: targetAgentEmail,
      department: targetAgentDepartment || chatData.department,
      previousAgentId: currentAgentId,
      previousAgentName: currentAgentName,
      transferredAt: firebase.firestore.FieldValue.serverTimestamp(),
      transferNotes: notes,
      status: CHAT_STATUS.ASSIGNED //  ASSIGNED em vez de ACTIVE
    });

    //  Atualizar estatísticas do agente anterior (em users.whatsapp)
    if (currentAgentId) {
      try {
        await db.collection('users').doc(currentAgentId).update({
          'whatsapp.activeChats': firebase.firestore.FieldValue.increment(-1)
        });
      } catch (err) {
        console.warn('[whatsappService]  Não foi possível atualizar stats do agente anterior:', err.message);
      }
    }

    //  Atualizar estatísticas do novo agente (em users.whatsapp)
    try {
      await db.collection('users').doc(targetAgentId).update({
        'whatsapp.activeChats': firebase.firestore.FieldValue.increment(1),
        'whatsapp.totalAssigned': firebase.firestore.FieldValue.increment(1)
      });
    } catch (err) {
      console.warn('[whatsappService]  Não foi possível atualizar stats do novo agente:', err.message);
    }

    //  Adicionar mensagem de sistema com mais contexto
    const systemMessage = currentAgentName 
      ? `Conversa transferida de ${currentAgentName} para ${targetAgentName}`
      : `Conversa transferida para ${targetAgentName}`;
    
    await db.collection('chats').doc(chatId).collection('messages').add({
      type: 'system',
      text: `${systemMessage}${notes ? ': ' + notes : ''}`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      fromAgent: currentAgentId,
      fromAgentName: currentAgentName,
      toAgent: targetAgentId,
      toAgentName: targetAgentName
    });

    // Invalidar cache
    cacheService.invalidateByPattern(/^whatsapp_/);
    await logWhatsappActivity(
      'WHATSAPP_CHAT_TRANSFERRED',
      currentAgentName
        ? `Conversa transferida de ${currentAgentName} para ${targetAgentName}`
        : `Conversa transferida para ${targetAgentName}`,
      chatId,
      {
        customerName: resolveChatAuditLabel(chatData, chatId),
        phoneNumber: chatData.phoneNumber || chatData.numero || chatId,
        previousAgentName: currentAgentName || '',
        newAgentName: targetAgentName || '',
        notes,
        reason: notes,
        source: 'transferChatToAgent'
      }
    );

    if (window.__DEBUG__) {
      console.log('[whatsappService]  Chat transferido:', {
        chatId,
        from: currentAgentName,
        to: targetAgentName,
        notes
      });
    }

    return { success: true };
  } catch (err) {
    console.error('[whatsappService] Erro ao transferir chat para agente:', err);
    throw err;
  }
}

/**
 * Atualizar informações do chat (nome, email, notas, etc)
 */
async function updateChatInfo(chatId, updates) {
  if (!chatId) {
    throw new Error('ID do chat é obrigatório');
  }
  
  try {
    await db.collection('chats').doc(chatId).update(updates);
    
    // Invalidar cache
    cacheService.invalidateByPattern(/^whatsapp_/);
    
    console.log(`[whatsappService]  Informações do chat ${chatId} atualizadas`);
    return { success: true };
  } catch (err) {
    console.error('[whatsappService] Erro ao atualizar informações do chat:', err);
    throw err;
  }
}

/**
 * Busca agentes disponíveis por departamento
 */
async function getAvailableAgentsByDepartment(department) {
  const cacheKey = `whatsapp_agents_${department}`;
  
  try {
    return await cacheService.get(cacheKey, async () => {
      const snapshot = await db.collection('users')
        .where('whatsapp.isAgent', '==', true)
        .where('whatsapp.department', '==', department)
        .where('whatsapp.status', 'in', [AGENT_STATUS.ONLINE, AGENT_STATUS.AWAY])
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          name: getAgentDisplayNameFromUserData(data),
          email: data.email || null,
          ...(data.whatsapp || {})
        };
      });
    }, 'users');
  } catch (err) {
    console.error('[whatsappService] Erro ao buscar agentes disponíveis:', err);
    return [];
  }
}

// Exportar API pública
export const whatsappService = {
  // Configurações
  loadWhatsAppConfig,
  saveWhatsAppConfig,
  
  // Mensagens
  sendMessage,
  forwardMessage,
  getChatMessages,
  markMessagesAsRead,
  checkChatMessagingWindow, //  NOVO: Verificar janela de 24h
  
  // Chats
  getOrCreateChat,
  getChatById,
  getChatByContractId,
  getChatsByContractId,
  getAgentChats,
  getActiveChats,
  getWaitingChats,
  getResolvedChats, //  NOVO: Buscar conversas finalizadas
  getDepartmentQueue,
  assignChatToAgent,
  transferChat,
  transferChatToAgent,
  resolveChat,
  reopenChat, //  NOVO: Reabrir conversa finalizada
  startChatWithNumber,
  autoAssignChat,
  linkChatToContract,
  unlinkChatFromContract,
  deleteChat,
  findContractByPhone,
  findContractsByPhoneCandidates,
  updateChatCustomFields,
  updateChatInfo, //  NOVO: Atualizar informações do chat (nome, email, notas)
  
  // Agentes
  registerAgent,
  updateAgentStatus,
  listRegisteredAgents,
  getAvailableAgents,
  getAvailableAgentsByDepartment,
  getCurrentUserId: () => auth.currentUser?.uid,
  
  // Mensagens Rápidas
  saveQuickMessage,
  getQuickMessages,
  deleteQuickMessage,

  // Helpers
  checkIfUserIsAdmin,
  normalizePhoneNumber,
  
  // Listeners
  listenToChatMessages,
  listenToAgentChats,
  listenToWaitingChats,
  
  // Constantes
  DEPARTMENTS,
  AGENT_STATUS,
  CHAT_STATUS,
  MESSAGE_TEMPLATES,
  RESOLUTION_REASONS
};

// Expor globalmente para debug
window.__WHATSAPP_SERVICE__ = whatsappService;

// Atualizar status do agente ao carregar
if (auth.currentUser) {
  updateAgentStatus(AGENT_STATUS.ONLINE).catch(err => {
    console.warn('[whatsappService] Falha ao atualizar status inicial:', err);
  });
}

// Atualizar status ao descarregar página
window.addEventListener('beforeunload', () => {
  if (auth.currentUser) {
    updateAgentStatus(AGENT_STATUS.OFFLINE);
  }
});

export default whatsappService;
