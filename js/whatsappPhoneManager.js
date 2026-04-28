/**
 * @file whatsappPhoneManager.js
 * @description Gerenciamento de múltiplos números WhatsApp Business
 * 
 * Funcionalidades:
 * - CRUD de números de telefone
 * - Centralização de conversas na mesma interface
 * - Filtros por número/departamento
 * - Roteamento automático de mensagens
 * - Cache otimizado (TTL: 15 min)
 * 
 * Padrão: Integrado com cacheService, seguindo arquitetura do projeto
 * Data: 2025-10-30
 */

import { db } from './auth.js';
import cacheService from './cacheService.js';
import { showNotification } from './ui.js';

if (window.__DEBUG__) console.log('[whatsappPhoneManager] Módulo carregado.');

// Cache key prefix
const CACHE_PREFIX = 'whatsapp_phones_';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos (conforme padrão do projeto)

/**
 * Lista todos os números WhatsApp cadastrados
 * @param {boolean} activeOnly - Retornar apenas números ativos
 * @returns {Promise<Array>}
 */
export async function listPhoneNumbers(activeOnly = false) {
  const cacheKey = `${CACHE_PREFIX}list_${activeOnly}`;

  return await cacheService.get(cacheKey, async () => {
    let query = db.collection('whatsappPhoneNumbers').orderBy('priority', 'asc');

    if (activeOnly) {
      query = query.where('isActive', '==', true);
    }

    const snapshot = await query.get();

    const phones = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Normalizar timestamps (padrão do projeto)
      createdAt: doc.data().createdAt?.toDate() || null,
      updatedAt: doc.data().updatedAt?.toDate() || null
    }));

    if (window.__DEBUG__) {
      console.log(`[whatsappPhoneManager] Carregados ${phones.length} números (activeOnly: ${activeOnly})`);
    }

    return phones;
  }, 'whatsappConfig', false, CACHE_TTL);
}

/**
 * Obtém número por ID
 * @param {string} phoneNumberId 
 * @returns {Promise<Object|null>}
 */
export async function getPhoneNumber(phoneNumberId) {
  if (!phoneNumberId) return null;

  const cacheKey = `${CACHE_PREFIX}${phoneNumberId}`;

  return await cacheService.get(cacheKey, async () => {
    const doc = await db.collection('whatsappPhoneNumbers').doc(phoneNumberId).get();

    if (!doc.exists) {
      if (window.__DEBUG__) {
        console.warn(`[whatsappPhoneManager] Número ${phoneNumberId} não encontrado`);
      }
      return null;
    }

    return {
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || null,
      updatedAt: doc.data().updatedAt?.toDate() || null
    };
  }, 'whatsappConfig', false, CACHE_TTL);
}

/**
 * Adiciona novo número WhatsApp
 * @param {Object} phoneData
 * @returns {Promise<string>} ID do documento criado
 */
export async function addPhoneNumber(phoneData) {
  try {
    // Validação
    if (!phoneData.phoneNumber || !phoneData.displayName) {
      throw new Error('phoneNumber e displayName são obrigatórios');
    }

    // Normalizar número (reutilizar função do whatsappService)
    const normalizedPhone = normalizePhoneNumber(phoneData.phoneNumber);
    if (!normalizedPhone) {
      throw new Error('Número de telefone inválido');
    }

    // Verificar duplicatas
    const existing = await db.collection('whatsappPhoneNumbers')
      .where('phoneNumber', '==', normalizedPhone)
      .limit(1)
      .get();

    if (!existing.empty) {
      throw new Error(`Número ${phoneData.phoneNumber} já está cadastrado`);
    }

    // Preparar documento
    const phoneDoc = {
      phoneNumber: normalizedPhone,
      phoneNumberId: phoneData.phoneNumberId || null, //  ID da API WhatsApp Business
      accessToken: phoneData.accessToken || null, //  Token de acesso da API
      displayName: phoneData.displayName.trim(),
      businessAccountId: phoneData.businessAccountId || null,
      department: phoneData.department || null,
      isActive: phoneData.isActive !== false, // default true
      priority: phoneData.priority || 99,
      metadata: {
        maxConcurrentChats: phoneData.maxConcurrentChats || 50,
        businessHours: phoneData.businessHours || null,
        autoAssign: phoneData.autoAssign !== false
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Criar documento (usar phoneNumberId como doc ID para facilitar lookup)
    await db.collection('whatsappPhoneNumbers').doc(normalizedPhone).set(phoneDoc);

    // Invalidar cache
    cacheService.invalidateByPattern(new RegExp(`^${CACHE_PREFIX}`));

    if (window.__DEBUG__) {
      console.log('[whatsappPhoneManager] Número adicionado:', normalizedPhone, phoneData.displayName);
    }

    showNotification(` Número ${phoneData.displayName} cadastrado com sucesso!`, 'success');

    return normalizedPhone;

  } catch (err) {
    console.error('[whatsappPhoneManager] Erro ao adicionar número:', err);
    showNotification(` ${err.message || 'Erro ao cadastrar número'}`, 'error');
    throw err;
  }
}

/**
 * Atualiza número existente
 * @param {string} phoneNumberId 
 * @param {Object} updates 
 */
export async function updatePhoneNumber(phoneNumberId, updates) {
  try {
    const docRef = db.collection('whatsappPhoneNumbers').doc(phoneNumberId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error('Número não encontrado');
    }

    // Não permitir alterar phoneNumber diretamente (usar ID como chave)
    if (updates.phoneNumber) {
      delete updates.phoneNumber;
      console.warn('[whatsappPhoneManager] Tentativa de alterar phoneNumber ignorada');
    }

    // Preparar updates (preservar metadata existente se não fornecida)
    const currentData = doc.data();
    const finalUpdates = { ...updates };

    if (updates.metadata) {
      finalUpdates.metadata = {
        ...currentData.metadata,
        ...updates.metadata
      };
    }

    // Atualizar
    await docRef.update({
      ...finalUpdates,
      updatedAt: new Date()
    });

    // Invalidar cache
    cacheService.invalidate(`${CACHE_PREFIX}${phoneNumberId}`);
    cacheService.invalidateByPattern(new RegExp(`^${CACHE_PREFIX}list`));

    if (window.__DEBUG__) {
      console.log('[whatsappPhoneManager] Número atualizado:', phoneNumberId);
    }

    showNotification(' Número atualizado com sucesso!', 'success');

  } catch (err) {
    console.error('[whatsappPhoneManager] Erro ao atualizar:', err);
    showNotification(` ${err.message || 'Erro ao atualizar número'}`, 'error');
    throw err;
  }
}

/**
 * Remove número (soft delete - marca como inativo)
 * @param {string} phoneNumberId 
 */
export async function removePhoneNumber(phoneNumberId) {
  try {
    // Verificar se há chats ativos para este número
    const activeChats = await db.collection('chats')
      .where('phoneNumberId', '==', phoneNumberId)
      .where('status', 'in', ['ativo', 'atribuido', 'aguardando'])
      .limit(1)
      .get();

    if (!activeChats.empty) {
      throw new Error('Não é possível remover: existem conversas ativas neste número');
    }

    // Soft delete: marcar como inativo
    await db.collection('whatsappPhoneNumbers').doc(phoneNumberId).update({
      isActive: false,
      updatedAt: new Date()
    });

    // Invalidar cache
    cacheService.invalidateByPattern(new RegExp(`^${CACHE_PREFIX}`));

    if (window.__DEBUG__) {
      console.log('[whatsappPhoneManager] Número desativado:', phoneNumberId);
    }

    showNotification(' Número desativado com sucesso', 'success');

  } catch (err) {
    console.error('[whatsappPhoneManager] Erro ao remover:', err);
    showNotification(` ${err.message || 'Erro ao remover número'}`, 'error');
    throw err;
  }
}

/**
 * Normaliza número de telefone (reutiliza função existente do whatsappService)
 * @param {string} phone 
 * @returns {string|null}
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;

  // Tentar usar normalização do whatsappService se disponível
  if (window.__WHATSAPP_SERVICE__?.normalizePhoneNumber) {
    return window.__WHATSAPP_SERVICE__.normalizePhoneNumber(phone);
  }

  // Fallback: normalização básica conforme padrão E.164
  let cleaned = phone.replace(/\D/g, '');

  // Remover zeros à esquerda
  cleaned = cleaned.replace(/^0+/, '');

  // Adicionar código do país se não tiver
  if (!cleaned.startsWith('55')) {
    cleaned = `55${cleaned}`;
  }

  // Validar tamanho mínimo (55 + DDD + número)
  if (cleaned.length < 12) {
    console.warn('[whatsappPhoneManager] Número muito curto:', phone);
    return null;
  }

  // Adicionar 9º dígito se necessário (celular sem 9)
  if (cleaned.length === 12) {
    const ddd = cleaned.substring(2, 4);
    const firstDigit = cleaned.charAt(4);
    
    // Se DDD válido e primeiro dígito for 6-9, adicionar 9
    if (parseInt(ddd) >= 11 && parseInt(ddd) <= 99 && ['6', '7', '8', '9'].includes(firstDigit)) {
      cleaned = cleaned.substring(0, 4) + '9' + cleaned.substring(4);
    }
  }

  return cleaned;
}

/**
 * Obtém número padrão (primeiro ativo com maior prioridade)
 * @returns {Promise<Object|null>}
 */
export async function getDefaultPhoneNumber() {
  const phones = await listPhoneNumbers(true);
  return phones.length > 0 ? phones[0] : null;
}

/**
 * Valida se número está ativo e disponível para receber novas conversas
 * @param {string} phoneNumberId 
 * @returns {Promise<boolean>}
 */
export async function isPhoneNumberAvailable(phoneNumberId) {
  try {
    const phone = await getPhoneNumber(phoneNumberId);
    
    if (!phone || !phone.isActive) {
      return false;
    }

    // Verificar limite de conversas simultâneas
    const maxConcurrent = phone.metadata?.maxConcurrentChats || 50;
    
    const activeChatsSnapshot = await db.collection('chats')
      .where('phoneNumberId', '==', phoneNumberId)
      .where('status', 'in', ['ativo', 'atribuido'])
      .get();

    const available = activeChatsSnapshot.size < maxConcurrent;

    if (window.__DEBUG__) {
      console.log(`[whatsappPhoneManager] ${phoneNumberId} disponível: ${available} (${activeChatsSnapshot.size}/${maxConcurrent})`);
    }

    return available;

  } catch (err) {
    console.error('[whatsappPhoneManager] Erro ao verificar disponibilidade:', err);
    return false;
  }
}

/**
 * Obtém estatísticas de uso de um número
 * @param {string} phoneNumberId 
 * @returns {Promise<Object>}
 */
export async function getPhoneNumberStats(phoneNumberId) {
  try {
    const [totalChats, activeChats, todayChats] = await Promise.all([
      // Total de conversas
      db.collection('chats')
        .where('phoneNumberId', '==', phoneNumberId)
        .get()
        .then(snap => snap.size),

      // Conversas ativas
      db.collection('chats')
        .where('phoneNumberId', '==', phoneNumberId)
        .where('status', 'in', ['ativo', 'atribuido', 'aguardando'])
        .get()
        .then(snap => snap.size),

      // Conversas de hoje
      (() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return db.collection('chats')
          .where('phoneNumberId', '==', phoneNumberId)
          .where('createdAt', '>=', today)
          .get()
          .then(snap => snap.size);
      })()
    ]);

    return {
      totalChats,
      activeChats,
      todayChats
    };

  } catch (err) {
    console.error('[whatsappPhoneManager] Erro ao obter estatísticas:', err);
    return { totalChats: 0, activeChats: 0, todayChats: 0 };
  }
}

// API pública
export const whatsappPhoneManager = {
  list: listPhoneNumbers,
  get: getPhoneNumber,
  add: addPhoneNumber,
  update: updatePhoneNumber,
  remove: removePhoneNumber,
  getDefault: getDefaultPhoneNumber,
  isAvailable: isPhoneNumberAvailable,
  getStats: getPhoneNumberStats
};

// Expor globalmente para debug
if (window.__DEBUG__) {
  window.__WHATSAPP_PHONE_MANAGER__ = whatsappPhoneManager;
}

export default whatsappPhoneManager;
