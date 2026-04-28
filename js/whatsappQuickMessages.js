/**
 * @file whatsappQuickMessages.js
 * @description Sistema de Mensagens Rápidas/Templates (inspirado em Whaticket)
 *
 * Funcionalidades:
 * - Criar mensagens rápidas com atalhos (ex: /bem-vindo)
 * - Organizar por departamento
 * - Autocomplete no textarea de mensagem
 * - Variáveis dinâmicas: {agentName}, {customerName}, {department}
 * - Cache inteligente com TTL de 10 minutos
 * - Contador de uso
 * 
 * Estrutura Firestore:
 * - quickMessages/{messageId}
 *   - shortcut: "bem-vindo"
 *   - text: "Olá! Como posso ajudar?"
 *   - department: "Geral" | null (global)
 *   - variables: ["agentName", "department"]
 *   - usageCount: 0
 * 
 * Data: 31/10/2025
 */

import { db, auth } from './auth.js';
import cacheService from './cacheService.js';

if (window.__DEBUG__) console.log('[whatsappQuickMessages] Módulo carregado.');

/**
 * Cria uma nova mensagem rápida
 * @param {string} shortcut - Atalho (ex: "bem-vindo")
 * @param {string} text - Texto da mensagem (pode conter {variáveis})
 * @param {string} [department=null] - Departamento específico ou null para global
 * @param {Array<string>} [variables=[]] - Variáveis usadas no texto
 * @returns {Promise<string>} ID da mensagem criada
 */
export async function createQuickMessage(shortcut, text, department = null, variables = []) {
  if (!shortcut || shortcut.trim() === '') {
    throw new Error('Atalho é obrigatório');
  }

  if (!text || text.trim() === '') {
    throw new Error('Texto da mensagem é obrigatório');
  }

  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('Usuário não autenticado');
  }

  try {
    // Normalizar atalho (lowercase, sem espaços, sem /)
    const normalizedShortcut = shortcut.trim().toLowerCase().replace(/^\/+/, '').replace(/\s+/g, '-');

    // Verificar se já existe mensagem com este atalho no mesmo departamento
    let query = db.collection('quickMessages').where('shortcut', '==', normalizedShortcut);
    
    if (department) {
      query = query.where('department', '==', department);
    } else {
      query = query.where('department', '==', null);
    }

    const existing = await query.limit(1).get();
    
    if (!existing.empty) {
      throw new Error(`Atalho "/${normalizedShortcut}" já existe${department ? ` para ${department}` : ' globalmente'}`);
    }

    // Detectar variáveis no texto automaticamente
    const detectedVars = extractVariables(text);

    const messageData = {
      shortcut: normalizedShortcut,
      text: text.trim(),
      department: department || null,
      variables: variables.length > 0 ? variables : detectedVars,
      createdBy: userId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      usageCount: 0,
      isActive: true
    };

    const messageRef = await db.collection('quickMessages').add(messageData);

    // Invalidar cache
    cacheService.invalidateByPattern(/^whatsapp_quick_messages/);

    if (window.__DEBUG__) {
      console.log(`[whatsappQuickMessages] Mensagem criada: /${normalizedShortcut} (${messageRef.id})`);
    }

    return messageRef.id;
  } catch (error) {
    console.error('[whatsappQuickMessages] Erro ao criar mensagem:', error);
    throw error;
  }
}

/**
 * Atualiza uma mensagem rápida existente
 * @param {string} messageId - ID da mensagem
 * @param {Object} updates - Dados para atualizar
 * @returns {Promise<void>}
 */
export async function updateQuickMessage(messageId, updates) {
  if (!messageId) {
    throw new Error('ID da mensagem é obrigatório');
  }

  try {
    const updateData = {
      ...updates,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Remover campos não permitidos
    delete updateData.createdBy;
    delete updateData.createdAt;
    delete updateData.usageCount;

    // Re-detectar variáveis se texto foi alterado
    if (updateData.text) {
      updateData.variables = extractVariables(updateData.text);
    }

    await db.collection('quickMessages').doc(messageId).update(updateData);

    // Invalidar cache
    cacheService.invalidateByPattern(/^whatsapp_quick_messages/);
    cacheService.invalidate(`whatsapp_quick_message_${messageId}`);

    if (window.__DEBUG__) {
      console.log(`[whatsappQuickMessages] Mensagem atualizada: ${messageId}`);
    }
  } catch (error) {
    console.error('[whatsappQuickMessages] Erro ao atualizar mensagem:', error);
    throw error;
  }
}

/**
 * Deleta uma mensagem rápida (soft delete)
 * @param {string} messageId - ID da mensagem
 * @returns {Promise<void>}
 */
export async function deleteQuickMessage(messageId) {
  if (!messageId) {
    throw new Error('ID da mensagem é obrigatório');
  }

  try {
    await db.collection('quickMessages').doc(messageId).update({
      isActive: false,
      deletedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Invalidar cache
    cacheService.invalidateByPattern(/^whatsapp_quick_messages/);

    if (window.__DEBUG__) {
      console.log(`[whatsappQuickMessages] Mensagem deletada: ${messageId}`);
    }
  } catch (error) {
    console.error('[whatsappQuickMessages] Erro ao deletar mensagem:', error);
    throw error;
  }
}

/**
 * Lista mensagens rápidas por departamento
 * @param {string} [department=null] - Departamento específico ou null para todas
 * @param {boolean} [includeGlobal=true] - Incluir mensagens globais (department=null)
 * @returns {Promise<Array>} Lista de mensagens
 */
export async function listQuickMessages(department = null, includeGlobal = true) {
  const cacheKey = `whatsapp_quick_messages_${department || 'all'}_${includeGlobal}`;

  return await cacheService.get(cacheKey, async () => {
    try {
      let messages = [];

      // Buscar mensagens do departamento específico
      if (department) {
        const deptSnapshot = await db.collection('quickMessages')
          .where('isActive', '==', true)
          .where('department', '==', department)
          .orderBy('shortcut', 'asc')
          .get();

        messages = deptSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }

      // Buscar mensagens globais (se includeGlobal)
      if (includeGlobal || !department) {
        const globalSnapshot = await db.collection('quickMessages')
          .where('isActive', '==', true)
          .where('department', '==', null)
          .orderBy('shortcut', 'asc')
          .get();

        const globalMessages = globalSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        messages = [...messages, ...globalMessages];
      }

      // Ordenar por shortcut
      messages.sort((a, b) => a.shortcut.localeCompare(b.shortcut));

      if (window.__DEBUG__) {
        console.log(`[whatsappQuickMessages] ${messages.length} mensagens carregadas (dept: ${department || 'all'})`);
      }

      return messages;
    } catch (error) {
      console.error('[whatsappQuickMessages] Erro ao listar mensagens:', error);
      throw error;
    }
  }, 600000); // TTL: 10 minutos
}

/**
 * Busca mensagens por atalho ou texto (autocomplete)
 * @param {string} query - Texto de busca
 * @param {string} [department=null] - Filtrar por departamento
 * @param {number} [limit=10] - Limite de resultados
 * @returns {Promise<Array>} Mensagens encontradas
 */
export async function searchQuickMessages(query, department = null, limit = 10) {
  if (!query || query.trim() === '') {
    return [];
  }

  try {
    const allMessages = await listQuickMessages(department, true);
    
    const searchLower = query.toLowerCase().replace(/^\/+/, '');
    
    const filtered = allMessages.filter(msg => 
      msg.shortcut.toLowerCase().includes(searchLower) ||
      msg.text.toLowerCase().includes(searchLower)
    );

    // Dar prioridade a correspondência exata no início do atalho
    filtered.sort((a, b) => {
      const aStarts = a.shortcut.toLowerCase().startsWith(searchLower);
      const bStarts = b.shortcut.toLowerCase().startsWith(searchLower);
      
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      
      return a.shortcut.localeCompare(b.shortcut);
    });

    return filtered.slice(0, limit);
  } catch (error) {
    console.error('[whatsappQuickMessages] Erro ao buscar mensagens:', error);
    return [];
  }
}

/**
 * Obtém mensagem por atalho
 * @param {string} shortcut - Atalho (ex: "bem-vindo" ou "/bem-vindo")
 * @param {string} [department=null] - Departamento específico
 * @returns {Promise<Object|null>} Mensagem encontrada ou null
 */
export async function getQuickMessageByShortcut(shortcut, department = null) {
  if (!shortcut) return null;

  const normalized = shortcut.trim().toLowerCase().replace(/^\/+/, '');

  try {
    const messages = await listQuickMessages(department, true);
    return messages.find(msg => msg.shortcut === normalized) || null;
  } catch (error) {
    console.error('[whatsappQuickMessages] Erro ao buscar por atalho:', error);
    return null;
  }
}

/**
 * Processa texto da mensagem substituindo variáveis
 * @param {string} text - Texto com variáveis (ex: "Olá {customerName}!")
 * @param {Object} context - Contexto com valores das variáveis
 * @returns {string} Texto processado
 */
export function processMessageText(text, context = {}) {
  if (!text) return '';

  let processed = text;

  // Substituir variáveis conhecidas
  const replacements = {
    agentName: context.agentName || context.userName || 'Atendente',
    customerName: context.customerName || context.clientName || 'Cliente',
    department: context.department || 'Atendimento',
    date: new Date().toLocaleDateString('pt-BR'),
    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  };

  // Substituir {variavel} por valor
  Object.entries(replacements).forEach(([key, value]) => {
    const regex = new RegExp(`\\{${key}\\}`, 'gi');
    processed = processed.replace(regex, value);
  });

  // Variáveis customizadas do contexto
  if (context.custom) {
    Object.entries(context.custom).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'gi');
      processed = processed.replace(regex, value);
    });
  }

  return processed;
}

/**
 * Extrai variáveis de um texto (ex: {agentName}, {customerName})
 * @param {string} text - Texto para analisar
 * @returns {Array<string>} Lista de variáveis encontradas
 */
function extractVariables(text) {
  if (!text) return [];

  const regex = /\{([a-zA-Z0-9_]+)\}/g;
  const matches = text.matchAll(regex);
  const variables = new Set();

  for (const match of matches) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * Incrementa contador de uso de uma mensagem
 * @param {string} messageId - ID da mensagem
 * @returns {Promise<void>}
 */
export async function incrementUsageCount(messageId) {
  if (!messageId) return;

  try {
    await db.collection('quickMessages').doc(messageId).update({
      usageCount: firebase.firestore.FieldValue.increment(1),
      lastUsedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Invalidar cache específico (stats mudam)
    cacheService.invalidate(`whatsapp_quick_message_${messageId}`);
    
  } catch (error) {
    console.error('[whatsappQuickMessages] Erro ao incrementar uso:', error);
  }
}

/**
 * Obtém estatísticas de mensagens rápidas
 * @returns {Promise<Object>} Estatísticas
 */
export async function getQuickMessagesStats() {
  const cacheKey = 'whatsapp_quick_messages_stats';

  return await cacheService.get(cacheKey, async () => {
    try {
      const messages = await listQuickMessages(null, true);
      
      const totalMessages = messages.length;
      const totalUsage = messages.reduce((sum, msg) => sum + (msg.usageCount || 0), 0);
      const mostUsed = [...messages].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0)).slice(0, 5);
      const neverUsed = messages.filter(msg => (msg.usageCount || 0) === 0);

      // Mensagens por departamento
      const byDepartment = messages.reduce((acc, msg) => {
        const dept = msg.department || 'Global';
        acc[dept] = (acc[dept] || 0) + 1;
        return acc;
      }, {});

      return {
        totalMessages,
        totalUsage,
        averageUsage: totalMessages > 0 ? (totalUsage / totalMessages).toFixed(2) : 0,
        mostUsed,
        neverUsed: neverUsed.length,
        byDepartment
      };
    } catch (error) {
      console.error('[whatsappQuickMessages] Erro ao obter estatísticas:', error);
      return null;
    }
  }, 300000); // TTL: 5 minutos
}

// Export objeto padrão para compatibilidade
const whatsappQuickMessages = {
  createQuickMessage,
  updateQuickMessage,
  deleteQuickMessage,
  listQuickMessages,
  searchQuickMessages,
  getQuickMessageByShortcut,
  processMessageText,
  incrementUsageCount,
  getQuickMessagesStats
};

export default whatsappQuickMessages;

// Expor globalmente (necessário para UIs)
window.__WHATSAPP_QUICK_MESSAGES__ = whatsappQuickMessages;
console.log('[whatsappQuickMessages]  Backend exportado globalmente e disponível em window.__WHATSAPP_QUICK_MESSAGES__');

if (window.__DEBUG__) {
  console.log('[whatsappQuickMessages] Funções disponíveis:', Object.keys(whatsappQuickMessages));
}
