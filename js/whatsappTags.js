/**
 * @file whatsappTags.js
 * @description Sistema de Tags/Etiquetas para conversas WhatsApp (inspirado em Whaticket)
 *
 * Funcionalidades:
 * - Criar/editar/deletar tags com cores personalizadas
 * - Aplicar múltiplas tags em conversas
 * - Filtrar conversas por tag
 * - Cache inteligente com TTL de 15 minutos
 * - Contador de uso de tags
 * 
 * Estrutura Firestore:
 * - whatsappTags/{tagId} - Dados da tag
 * - chats/{phoneNumber} - tags: ["Urgente", "VIP", "Seguimento"]
 * 
 * Data: 31/10/2025
 */

import { db, auth } from './auth.js';
import cacheService from './cacheService.js';

if (window.__DEBUG__) console.log('[whatsappTags] Módulo carregado.');

// Cores padrão para tags
const DEFAULT_TAG_COLORS = [
  '#FF5733', // Vermelho
  '#33FF57', // Verde
  '#3357FF', // Azul
  '#FF33F5', // Rosa
  '#F5FF33', // Amarelo
  '#33F5FF', // Ciano
  '#FF8C33', // Laranja
  '#8C33FF', // Roxo
  '#33FF8C', // Verde-água
  '#FF3333'  // Vermelho escuro
];

/**
 * Cria uma nova tag
 * @param {string} name - Nome da tag (ex: "Urgente")
 * @param {string} color - Cor em hexadecimal (ex: "#FF5733")
 * @param {string} [description] - Descrição opcional da tag
 * @returns {Promise<string>} ID da tag criada
 */
export async function createTag(name, color = null, description = '') {
  if (!name || name.trim() === '') {
    throw new Error('Nome da tag é obrigatório');
  }

  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('Usuário não autenticado');
  }

  try {
    // Verificar se já existe tag com este nome
    const existingTag = await db.collection('whatsappTags')
      .where('name', '==', name.trim())
      .limit(1)
      .get();

    if (!existingTag.empty) {
      throw new Error(`Tag "${name}" já existe`);
    }

    // Selecionar cor aleatória se não fornecida
    const tagColor = color || DEFAULT_TAG_COLORS[Math.floor(Math.random() * DEFAULT_TAG_COLORS.length)];

    const tagData = {
      name: name.trim(),
      color: tagColor,
      description: description.trim(),
      createdBy: userId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      usageCount: 0,
      isActive: true
    };

    const tagRef = await db.collection('whatsappTags').add(tagData);

    // Invalidar cache de tags
    cacheService.invalidateByPattern(/^whatsapp_tags/);

    if (window.__DEBUG__) {
      console.log(`[whatsappTags] Tag criada: ${name} (${tagRef.id})`);
    }

    return tagRef.id;
  } catch (error) {
    console.error('[whatsappTags] Erro ao criar tag:', error);
    throw error;
  }
}

/**
 * Atualiza uma tag existente
 * @param {string} tagId - ID da tag
 * @param {Object} updates - Dados para atualizar
 * @returns {Promise<void>}
 */
export async function updateTag(tagId, updates) {
  if (!tagId) {
    throw new Error('ID da tag é obrigatório');
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

    await db.collection('whatsappTags').doc(tagId).update(updateData);

    // Invalidar cache
    cacheService.invalidateByPattern(/^whatsapp_tags/);
    cacheService.invalidate(`whatsapp_tag_${tagId}`);

    if (window.__DEBUG__) {
      console.log(`[whatsappTags] Tag atualizada: ${tagId}`);
    }
  } catch (error) {
    console.error('[whatsappTags] Erro ao atualizar tag:', error);
    throw error;
  }
}

/**
 * Deleta uma tag (soft delete)
 * @param {string} tagId - ID da tag
 * @returns {Promise<void>}
 */
export async function deleteTag(tagId) {
  if (!tagId) {
    throw new Error('ID da tag é obrigatório');
  }

  try {
    // Soft delete - apenas marcar como inativa
    await db.collection('whatsappTags').doc(tagId).update({
      isActive: false,
      deletedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Remover tag de todas as conversas
    const chatsWithTag = await db.collection('chats')
      .where('tags', 'array-contains', tagId)
      .get();

    const batch = db.batch();
    chatsWithTag.forEach(doc => {
      batch.update(doc.ref, {
        tags: firebase.firestore.FieldValue.arrayRemove(tagId)
      });
    });

    await batch.commit();

    // Invalidar cache
    cacheService.invalidateByPattern(/^whatsapp_tags/);
    cacheService.invalidateByPattern(/^whatsapp_chat/);

    if (window.__DEBUG__) {
      console.log(`[whatsappTags] Tag deletada: ${tagId} (${chatsWithTag.size} conversas afetadas)`);
    }
  } catch (error) {
    console.error('[whatsappTags] Erro ao deletar tag:', error);
    throw error;
  }
}

/**
 * Lista todas as tags ativas
 * @param {boolean} [activeOnly=true] - Retornar apenas tags ativas
 * @returns {Promise<Array>} Lista de tags
 */
export async function listTags(activeOnly = true) {
  const cacheKey = `whatsapp_tags_${activeOnly ? 'active' : 'all'}`;

  return await cacheService.get(cacheKey, async () => {
    try {
      const baseQuery = db.collection('whatsappTags').orderBy('name', 'asc');
      let primarySnapshot = null;
      let tags = [];

      if (activeOnly) {
        try {
          primarySnapshot = await baseQuery.where('isActive', '==', true).get();
        } catch (error) {
          // Fallback para estruturas legadas (sem campo isActive ou sem índice).
          if (window.__DEBUG__) {
            console.warn('[whatsappTags] Falha na consulta filtrada, aplicando fallback para tags legadas:', error);
          }
        }
      } else {
        primarySnapshot = await baseQuery.get();
      }

      if (primarySnapshot) {
        tags = primarySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        if (activeOnly) {
          tags = tags.filter(tag => tag.isActive !== false);
        }
      }

      const shouldFallbackToAll = activeOnly && (!primarySnapshot || tags.length === 0);

      if (shouldFallbackToAll) {
        const fallbackSnapshot = await baseQuery.get();
        tags = fallbackSnapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          .filter(tag => tag.isActive !== false);

        if (window.__DEBUG__) {
          console.warn(`[whatsappTags] Fallback carregou ${tags.length} tags (incluindo registros sem campo isActive).`);
        }
      }

      if (window.__DEBUG__) {
        console.log(`[whatsappTags] ${tags.length} tags carregadas (${activeOnly ? 'ativas' : 'todas'})`);
      }

      return tags;
    } catch (error) {
      console.error('[whatsappTags] Erro ao listar tags:', error);
      throw error;
    }
  }, 900000); // TTL: 15 minutos
}

/**
 * Busca uma tag por ID
 * @param {string} tagId - ID da tag
 * @returns {Promise<Object|null>} Dados da tag ou null
 */
export async function getTagById(tagId) {
  if (!tagId) return null;

  const cacheKey = `whatsapp_tag_${tagId}`;

  return await cacheService.get(cacheKey, async () => {
    try {
      const doc = await db.collection('whatsappTags').doc(tagId).get();
      
      if (!doc.exists) {
        return null;
      }

      return {
        id: doc.id,
        ...doc.data()
      };
    } catch (error) {
      console.error('[whatsappTags] Erro ao buscar tag:', error);
      return null;
    }
  }, 900000); // TTL: 15 minutos
}

/**
 * Adiciona uma tag a uma conversa
 * @param {string} chatId - ID da conversa (phoneNumber)
 * @param {string} tagId - ID da tag
 * @returns {Promise<void>}
 */
export async function addTagToChat(chatId, tagId) {
  if (!chatId || !tagId) {
    throw new Error('chatId e tagId são obrigatórios');
  }

  try {
    // Verificar se tag existe
    const tag = await getTagById(tagId);
    if (!tag || !tag.isActive) {
      throw new Error('Tag não encontrada ou inativa');
    }

    // Adicionar tag à conversa
    await db.collection('chats').doc(chatId).update({
      tags: firebase.firestore.FieldValue.arrayUnion(tagId),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Incrementar contador de uso
    await db.collection('whatsappTags').doc(tagId).update({
      usageCount: firebase.firestore.FieldValue.increment(1)
    });

    // Invalidar caches
    cacheService.invalidate(`whatsapp_chat_${chatId}`);
    cacheService.invalidate(`whatsapp_tag_${tagId}`);
    cacheService.invalidateByPattern(/^whatsapp_chats/);

    if (window.__DEBUG__) {
      console.log(`[whatsappTags] Tag "${tag.name}" adicionada ao chat ${chatId}`);
    }
  } catch (error) {
    console.error('[whatsappTags] Erro ao adicionar tag:', error);
    throw error;
  }
}

/**
 * Remove uma tag de uma conversa
 * @param {string} chatId - ID da conversa
 * @param {string} tagId - ID da tag
 * @returns {Promise<void>}
 */
export async function removeTagFromChat(chatId, tagId) {
  if (!chatId || !tagId) {
    throw new Error('chatId e tagId são obrigatórios');
  }

  try {
    await db.collection('chats').doc(chatId).update({
      tags: firebase.firestore.FieldValue.arrayRemove(tagId),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Decrementar contador de uso
    await db.collection('whatsappTags').doc(tagId).update({
      usageCount: firebase.firestore.FieldValue.increment(-1)
    });

    // Invalidar caches
    cacheService.invalidate(`whatsapp_chat_${chatId}`);
    cacheService.invalidate(`whatsapp_tag_${tagId}`);
    cacheService.invalidateByPattern(/^whatsapp_chats/);

    if (window.__DEBUG__) {
      console.log(`[whatsappTags] Tag removida do chat ${chatId}`);
    }
  } catch (error) {
    console.error('[whatsappTags] Erro ao remover tag:', error);
    throw error;
  }
}

/**
 * Filtra conversas por tag
 * @param {string} tagId - ID da tag para filtrar
 * @param {number} [limit=50] - Limite de resultados
 * @returns {Promise<Array>} Lista de conversas
 */
export async function filterChatsByTag(tagId, limit = 50) {
  if (!tagId) {
    throw new Error('tagId é obrigatório');
  }

  const cacheKey = `whatsapp_chats_by_tag_${tagId}_${limit}`;

  return await cacheService.get(cacheKey, async () => {
    try {
      const snapshot = await db.collection('chats')
        .where('tags', 'array-contains', tagId)
        .orderBy('lastMessageAt', 'desc')
        .limit(limit)
        .get();

      const chats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      if (window.__DEBUG__) {
        console.log(`[whatsappTags] ${chats.length} conversas com tag ${tagId}`);
      }

      return chats;
    } catch (error) {
      console.error('[whatsappTags] Erro ao filtrar chats por tag:', error);
      throw error;
    }
  }, 120000); // TTL: 2 minutos (conversas mudam rápido)
}

/**
 * Busca tags por nome (autocomplete)
 * @param {string} query - Texto de busca
 * @param {number} [limit=10] - Limite de resultados
 * @returns {Promise<Array>} Tags encontradas
 */
export async function searchTags(query, limit = 10) {
  if (!query || query.trim() === '') {
    return [];
  }

  try {
    const allTags = await listTags(true);
    
    const searchLower = query.toLowerCase();
    const filtered = allTags.filter(tag => 
      tag.name.toLowerCase().includes(searchLower) ||
      tag.description?.toLowerCase().includes(searchLower)
    );

    return filtered.slice(0, limit);
  } catch (error) {
    console.error('[whatsappTags] Erro ao buscar tags:', error);
    return [];
  }
}

/**
 * Obtém estatísticas de uso de tags
 * @returns {Promise<Object>} Estatísticas
 */
export async function getTagsStats() {
  const cacheKey = 'whatsapp_tags_stats';

  return await cacheService.get(cacheKey, async () => {
    try {
      const tags = await listTags(true);
      
      const totalTags = tags.length;
      const totalUsage = tags.reduce((sum, tag) => sum + (tag.usageCount || 0), 0);
      const mostUsed = [...tags].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0)).slice(0, 5);
      const leastUsed = tags.filter(tag => (tag.usageCount || 0) === 0);

      return {
        totalTags,
        totalUsage,
        averageUsage: totalTags > 0 ? (totalUsage / totalTags).toFixed(2) : 0,
        mostUsed,
        unusedTags: leastUsed.length
      };
    } catch (error) {
      console.error('[whatsappTags] Erro ao obter estatísticas:', error);
      return null;
    }
  }, 300000); // TTL: 5 minutos
}

// Export objeto padrão para compatibilidade
const whatsappTags = {
  createTag,
  updateTag,
  deleteTag,
  listTags,
  getTagById,
  addTagToChat,
  removeTagFromChat,
  filterChatsByTag,
  searchTags,
  getTagsStats
};

export default whatsappTags;

// Expor globalmente (necessário para UIs)
window.__WHATSAPP_TAGS__ = whatsappTags;
console.log('[whatsappTags]  Backend exportado globalmente e disponível em window.__WHATSAPP_TAGS__');

if (window.__DEBUG__) {
  console.log('[whatsappTags] Funções disponíveis:', Object.keys(whatsappTags));
}
