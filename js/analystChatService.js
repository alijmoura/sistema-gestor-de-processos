/**
 * @file analystChatService.js
 * @description Servico de chat interno entre analistas do sistema.
 * Utiliza Firestore para persistencia e listeners em tempo real.
 * Segue padrao cache-first com listenerOptimizer.
 *
 * Colecoes Firestore:
 *   analystChats/{chatId}           - conversa (1:1 ou grupo)
 *   analystChats/{chatId}/messages  - mensagens da conversa
 *
 * @version 1.0.0
 */

import { db, auth } from './auth.js';
import cacheService from './cacheService.js';
import listenerOptimizer from './listenerOptimizer.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const COLLECTION = 'analystChats';
const MESSAGES_SUB = 'messages';
const CACHE_PREFIX = 'analystChat_';
const PAGE_SIZE = 30;
const MARK_READ_THROTTLE_MS = 1500;
const GROUP_COLOR_OPTIONS = new Set(['primary', 'info', 'success', 'warning', 'danger', 'secondary']);

// ---------------------------------------------------------------------------
// Estado interno
// ---------------------------------------------------------------------------

let _activeListeners = {};
let _lastMarkReadAt = {};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentUid() {
  return auth?.currentUser?.uid || null;
}

function currentUserData() {
  const user = auth?.currentUser;
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email || 'Analista',
    photoURL: user.photoURL || null,
  };
}

/**
 * Resolve o nome de exibicao com prioridade:
 * 1. shortName (nome reduzido)
 * 2. fullName (nome completo do perfil)
 * 3. displayName (Firebase Auth)
 * 4. nome (campo legado)
 * 5. email
 * @param {object} userData - Dados do documento do usuario
 * @returns {string}
 */
function resolveDisplayName(userData) {
  if (!userData) return 'Sem nome';
  const short = (userData.shortName || '').trim();
  if (short) return short;
  const full = (userData.fullName || '').trim();
  if (full) return full;
  const display = (userData.displayName || '').trim();
  if (display) return display;
  const nome = (userData.nome || '').trim();
  if (nome) return nome;
  return userData.email || 'Sem nome';
}

function resolvePhotoURL(userData, fallback = null) {
  if (!userData) return fallback || null;
  return userData.avatarUrl || userData.photoURL || userData.fotoPerfil || fallback || null;
}

function serverTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

function generateChatId(uid1, uid2) {
  return [uid1, uid2].sort().join('_');
}

// ---------------------------------------------------------------------------
// Chat CRUD
// ---------------------------------------------------------------------------

/**
 * Cria ou obtem conversa 1:1 entre dois usuarios.
 * @param {string} otherUid - UID do outro usuario
 * @returns {Promise<{id: string, data: object}>}
 */
async function getOrCreateDirectChat(otherUid) {
  const uid = currentUid();
  if (!uid || !otherUid) throw new Error('UIDs invalidos');

  const chatId = generateChatId(uid, otherUid);
  const docRef = db.collection(COLLECTION).doc(chatId);
  const snap = await docRef.get();

  if (snap.exists) {
    return { id: snap.id, data: snap.data() };
  }

  const me = currentUserData();
  const [myDoc, otherDoc] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('users').doc(otherUid).get(),
  ]);
  const myData = myDoc.exists ? myDoc.data() : {};
  const otherData = otherDoc.exists ? otherDoc.data() : {};

  const chatData = {
    type: 'direct',
    participants: [uid, otherUid],
    participantNames: {
      [uid]: resolveDisplayName({ ...myData, displayName: me?.displayName, email: me?.email }),
      [otherUid]: resolveDisplayName(otherData),
    },
    participantPhotos: {
      [uid]: resolvePhotoURL(myData, me?.photoURL || null),
      [otherUid]: resolvePhotoURL(otherData, null),
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: null,
    lastMessageAt: null,
    unread: { [uid]: 0, [otherUid]: 0 },
  };

  await docRef.set(chatData);
  return { id: chatId, data: chatData };
}

/**
 * Cria um chat em grupo.
 * @param {string} name - Nome do grupo
 * @param {string[]} memberUids - UIDs dos membros (inclui o criador)
 * @returns {Promise<{id: string, data: object}>}
 */
async function createGroupChat(name, memberUids = []) {
  const uid = currentUid();
  if (!uid) throw new Error('Usuario nao autenticado');

  const allMembers = [...new Set([uid, ...memberUids])];

  // Buscar nomes dos participantes
  const participantNames = {};
  const participantPhotos = {};

  for (const memberUid of allMembers) {
    const userDoc = await db.collection('users').doc(memberUid).get();
    if (userDoc.exists) {
      const d = userDoc.data();
      participantNames[memberUid] = resolveDisplayName(d);
      participantPhotos[memberUid] = resolvePhotoURL(d, null);
    }
  }

  const chatData = {
    type: 'group',
    name: name || 'Grupo',
    groupDescription: '',
    groupEmoji: '👥',
    groupColor: 'primary',
    groupAvatarUrl: null,
    groupAvatarPath: null,
    participants: allMembers,
    participantNames,
    participantPhotos,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: null,
    lastMessageAt: null,
    unread: allMembers.reduce((acc, m) => { acc[m] = 0; return acc; }, {}),
  };

  const docRef = await db.collection(COLLECTION).add(chatData);
  return { id: docRef.id, data: chatData };
}

/**
 * Atualiza personalizacao de chat em grupo.
 * @param {string} chatId
 * @param {object} updates - { name?, groupDescription?, groupEmoji?, groupColor?, groupAvatarUrl?, groupAvatarPath?, memberUids? }
 * @returns {Promise<object>} payload aplicado
 */
async function updateGroupChat(chatId, updates = {}) {
  const uid = currentUid();
  if (!uid || !chatId) throw new Error('Parametros invalidos');

  const chatRef = db.collection(COLLECTION).doc(chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) throw new Error('Conversa nao encontrada');

  const chatData = chatSnap.data() || {};
  if (chatData.type !== 'group') throw new Error('A conversa nao e um grupo');
  if (!(chatData.participants || []).includes(uid)) throw new Error('Sem permissao para editar este grupo');

  const payload = {};

  if (typeof updates.name === 'string') {
    const name = updates.name.trim().slice(0, 60);
    if (name) payload.name = name;
  }

  if (typeof updates.groupDescription === 'string') {
    payload.groupDescription = updates.groupDescription.trim().slice(0, 200);
  }

  if (typeof updates.groupEmoji === 'string') {
    const emoji = updates.groupEmoji.trim();
    payload.groupEmoji = emoji ? emoji.slice(0, 4) : '👥';
  }

  if (typeof updates.groupColor === 'string') {
    const color = updates.groupColor.trim().toLowerCase();
    if (GROUP_COLOR_OPTIONS.has(color)) {
      payload.groupColor = color;
    }
  }

  if (typeof updates.groupAvatarUrl === 'string') {
    payload.groupAvatarUrl = updates.groupAvatarUrl.trim() || null;
  } else if (updates.groupAvatarUrl === null) {
    payload.groupAvatarUrl = null;
  }

  if (typeof updates.groupAvatarPath === 'string') {
    payload.groupAvatarPath = updates.groupAvatarPath.trim() || null;
  } else if (updates.groupAvatarPath === null) {
    payload.groupAvatarPath = null;
  }

  if (Array.isArray(updates.memberUids)) {
    const requestedMembers = [...new Set(
      updates.memberUids
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )];

    // O editor sempre permanece no grupo; para sair use leaveChat
    if (!requestedMembers.includes(uid)) {
      requestedMembers.unshift(uid);
    }

    if (requestedMembers.length < 2) {
      throw new Error('Grupo precisa ter ao menos 2 membros');
    }

    const existingNames = chatData.participantNames || {};
    const existingPhotos = chatData.participantPhotos || {};
    const existingUnread = chatData.unread || {};
    const existingTyping = chatData.typing || {};

    const participantNames = {};
    const participantPhotos = {};
    const unread = {};
    const typing = {};

    // Carrega dados apenas de membros que ainda nao existem no mapa atual
    const missingUids = requestedMembers.filter((memberUid) => !existingNames[memberUid] && !existingPhotos[memberUid]);
    const missingDocs = await Promise.all(
      missingUids.map(async (memberUid) => {
        try {
          const snap = await db.collection('users').doc(memberUid).get();
          return { memberUid, snap };
        // eslint-disable-next-line no-unused-vars
        } catch (error) {
          return { memberUid, snap: null };
        }
      })
    );
    const missingMap = {};
    missingDocs.forEach(({ memberUid, snap }) => {
      if (snap?.exists) missingMap[memberUid] = snap.data();
    });

    requestedMembers.forEach((memberUid) => {
      const profile = missingMap[memberUid] || null;
      participantNames[memberUid] = existingNames[memberUid]
        || resolveDisplayName(profile || { email: '' });
      participantPhotos[memberUid] = existingPhotos[memberUid]
        || resolvePhotoURL(profile, null);
      unread[memberUid] = typeof existingUnread[memberUid] === 'number'
        ? existingUnread[memberUid]
        : 0;
      if (existingTyping[memberUid]) {
        typing[memberUid] = existingTyping[memberUid];
      }
    });

    payload.participants = requestedMembers;
    payload.participantNames = participantNames;
    payload.participantPhotos = participantPhotos;
    payload.unread = unread;
    payload.typing = typing;
  }

  if (!Object.keys(payload).length) {
    return {};
  }

  payload.updatedAt = serverTimestamp();
  payload.updatedBy = uid;

  await chatRef.update(payload);
  cacheService.invalidate(`${CACHE_PREFIX}list_${uid}`);
  return payload;
}

// ---------------------------------------------------------------------------
// Listar conversas do usuario
// ---------------------------------------------------------------------------

/**
 * Lista todas as conversas do usuario atual.
 * @returns {Promise<Array<{id: string, data: object}>>}
 */
async function listMyChats() {
  const uid = currentUid();
  if (!uid) return [];

  const cacheKey = `${CACHE_PREFIX}list_${uid}`;
  const cached = cacheService.getSync(cacheKey, 'notifications');
  if (cached) return cached;

  const snap = await db
    .collection(COLLECTION)
    .where('participants', 'array-contains', uid)
    .orderBy('lastMessageAt', 'desc')
    .get();

  const chats = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  cacheService.set(cacheKey, chats, 'notifications');
  return chats;
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------

/**
 * Envia uma mensagem em uma conversa.
 * @param {string} chatId
 * @param {string} text
 * @param {object} [options] - { type: 'text'|'image'|'file', fileURL, fileName }
 * @returns {Promise<string>} messageId
 */
async function sendMessage(chatId, text, options = {}) {
  const uid = currentUid();
  const user = currentUserData();
  if (!uid || !chatId) throw new Error('Parametros invalidos');

  const messageData = {
    text: text || '',
    type: options.type || 'text',
    senderUid: uid,
    senderName: user?.displayName || user?.email || '',
    senderPhoto: user?.photoURL || null,
    createdAt: serverTimestamp(),
    readBy: [uid],
  };

  if (options.fileURL) {
    messageData.fileURL = options.fileURL;
    messageData.fileName = options.fileName || 'arquivo';
  }

  const msgRef = await db
    .collection(COLLECTION)
    .doc(chatId)
    .collection(MESSAGES_SUB)
    .add(messageData);

  // Atualiza metadados da conversa
  const chatRef = db.collection(COLLECTION).doc(chatId);
  const chatSnap = await chatRef.get();
  const chatData = chatSnap.data() || {};

  const unreadUpdate = {};
  (chatData.participants || []).forEach((p) => {
    if (p !== uid) {
      unreadUpdate[`unread.${p}`] = firebase.firestore.FieldValue.increment(1);
    }
  });

  await chatRef.update({
    lastMessage: text || (options.type === 'image' ? 'Imagem' : 'Arquivo'),
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...unreadUpdate,
  });

  // Invalida cache da lista
  cacheService.invalidate(`${CACHE_PREFIX}list_${uid}`);

  return msgRef.id;
}

/**
 * Carrega mensagens de uma conversa (paginacao cursor-based).
 * @param {string} chatId
 * @param {object} [lastDoc] - Ultimo documento para paginacao
 * @returns {Promise<{messages: Array, lastDoc: object, hasMore: boolean}>}
 */
async function loadMessages(chatId, lastDoc = null) {
  let query = db
    .collection(COLLECTION)
    .doc(chatId)
    .collection(MESSAGES_SUB)
    .orderBy('createdAt', 'desc')
    .limit(PAGE_SIZE);

  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }

  const snap = await query.get();
  const messages = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

  return {
    messages: messages.reverse(), // ordem cronologica
    lastDoc: newLastDoc,
    hasMore: snap.docs.length === PAGE_SIZE,
  };
}

/**
 * Marca as mensagens como lidas pelo usuario atual.
 * @param {string} chatId
 */
async function markAsRead(chatId) {
  const uid = currentUid();
  if (!uid || !chatId) return;

  const throttleKey = `${chatId}_${uid}`;
  const now = Date.now();
  const lastRun = _lastMarkReadAt[throttleKey] || 0;
  if ((now - lastRun) < MARK_READ_THROTTLE_MS) return;
  _lastMarkReadAt[throttleKey] = now;

  const chatRef = db.collection(COLLECTION).doc(chatId);
  const chatSnap = await chatRef.get().catch(() => null);
  if (!chatSnap?.exists) return;

  const unreadCount = chatSnap.data()?.unread?.[uid] || 0;
  if (unreadCount <= 0) {
    cacheService.invalidate(`${CACHE_PREFIX}list_${uid}`);
    return;
  }

  // Zera contador de unread apenas quando necessario
  await chatRef.update({
    [`unread.${uid}`]: 0,
  }).catch(() => {});

  // Marca mensagens nao lidas recentes (limita para reduzir custo de leitura)
  const recentSnap = await chatRef
    .collection(MESSAGES_SUB)
    .orderBy('createdAt', 'desc')
    .limit(30)
    .get()
    .catch(() => ({ docs: [] }));

  if (recentSnap.docs?.length) {
    const batch = db.batch();
    let count = 0;

    recentSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (!data.readBy || !data.readBy.includes(uid)) {
        batch.update(doc.ref, {
          readBy: firebase.firestore.FieldValue.arrayUnion(uid),
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }
  }

  // Limpeza de throttling para evitar crescimento do mapa
  if (Object.keys(_lastMarkReadAt).length > 200) {
    const cutoff = Date.now() - 60 * 60 * 1000;
    Object.keys(_lastMarkReadAt).forEach((key) => {
      if ((_lastMarkReadAt[key] || 0) < cutoff) {
        delete _lastMarkReadAt[key];
      }
    });
  }

  cacheService.invalidate(`${CACHE_PREFIX}list_${uid}`);
}

/**
 * Remove todos os listeners ativos.
 */
function removeAllListeners() {
  Object.values(_activeListeners).forEach((unsub) => {
    if (typeof unsub === 'function') unsub();
  });
  _activeListeners = {};
  _lastMarkReadAt = {};
}

// ---------------------------------------------------------------------------
// Real-time listeners
// ---------------------------------------------------------------------------

/**
 * Escuta conversas do usuario em tempo real.
 * @param {Function} callback - (chats: Array) => void
 * @returns {Function} unsubscribe
 */
function onMyChatsChanged(callback) {
  const uid = currentUid();
  if (!uid) return () => {};

  const key = `chats_${uid}`;
  const listenerId = `analyst_chat_${key}`;
  if (_activeListeners[key]) {
    _activeListeners[key]();
  }

  const optimizedListener = listenerOptimizer.registerListener(
    listenerId,
    (snap) => {
      const chats = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
      cacheService.set(`${CACHE_PREFIX}list_${uid}`, chats, 'notifications');
      callback(chats);
    },
    { critical: true, throttle: false, immediateOnAdd: true }
  );

  const firestoreUnsubscribe = db
    .collection(COLLECTION)
    .where('participants', 'array-contains', uid)
    .orderBy('lastMessageAt', 'desc')
    .onSnapshot(
      optimizedListener,
      (error) => {
        console.warn('Erro no listener de chats do analista:', error);
      }
    );

  listenerOptimizer.setUnsubscribe(listenerId, firestoreUnsubscribe);
  const unsubscribe = () => {
    listenerOptimizer.unregisterListener(listenerId);
    if (_activeListeners[key] === unsubscribe) {
      delete _activeListeners[key];
    }
  };

  _activeListeners[key] = unsubscribe;
  return unsubscribe;
}

/**
 * Escuta mensagens de uma conversa em tempo real.
 * @param {string} chatId
 * @param {Function} callback - (messages: Array) => void
 * @returns {Function} unsubscribe
 */
function onMessagesChanged(chatId, callback) {
  if (!chatId) return () => {};

  const key = `messages_${chatId}`;
  const listenerId = `analyst_chat_${key}`;
  if (_activeListeners[key]) {
    _activeListeners[key]();
  }

  const optimizedListener = listenerOptimizer.registerListener(
    listenerId,
    (snap) => {
      const messages = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
      callback(messages);
    },
    { critical: true, throttle: false, immediateOnAdd: true }
  );

  const firestoreUnsubscribe = db
    .collection(COLLECTION)
    .doc(chatId)
    .collection(MESSAGES_SUB)
    .orderBy('createdAt', 'asc')
    .limitToLast(100)
    .onSnapshot(
      optimizedListener,
      (error) => {
        console.warn('Erro no listener de mensagens:', error);
      }
    );

  listenerOptimizer.setUnsubscribe(listenerId, firestoreUnsubscribe);
  const unsubscribe = () => {
    listenerOptimizer.unregisterListener(listenerId);
    if (_activeListeners[key] === unsubscribe) {
      delete _activeListeners[key];
    }
  };

  _activeListeners[key] = unsubscribe;
  return unsubscribe;
}

// ---------------------------------------------------------------------------
// Listar usuarios (para selecionar destinatario)
// ---------------------------------------------------------------------------

/**
 * Lista usuarios disponiveis para chat (exceto o atual).
 * @returns {Promise<Array<{uid: string, displayName: string, email: string, photoURL: string|null, role: string}>>}
 */
async function listAvailableUsers() {
  const uid = currentUid();
  if (!uid) return [];

  const cacheKey = `${CACHE_PREFIX}users_v2`;
  const cached = cacheService.getSync(cacheKey, 'users');
  if (cached) return cached;

  const snap = await db.collection('users').get();
  const users = [];

  snap.docs.forEach((doc) => {
    if (doc.id === uid) return;
    const d = doc.data();
    users.push({
      uid: doc.id,
      displayName: resolveDisplayName(d),
      email: d.email || '',
      photoURL: resolvePhotoURL(d, null),
      avatarUrl: d.avatarUrl || null,
      role: d.role || d.cargo || 'analyst',
      online: d.online || false,
    });
  });

  cacheService.set(cacheKey, users, 'users');
  return users;
}

/**
 * Obtem a contagem total de mensagens nao lidas.
 * @returns {Promise<number>}
 */
async function getTotalUnreadCount() {
  const uid = currentUid();
  if (!uid) return 0;

  const chats = await listMyChats();
  return chats.reduce((total, chat) => {
    const unread = chat.data?.unread?.[uid] || 0;
    return total + unread;
  }, 0);
}

/**
 * Atualiza status de presenca do usuario (online/offline).
 */
async function updatePresence(online = true) {
  const uid = currentUid();
  if (!uid) return;

  try {
    await db.collection('users').doc(uid).update({
      online,
      lastSeen: serverTimestamp(),
    });
  // eslint-disable-next-line no-unused-vars
  } catch (error) {
    // Ignora se campo nao existir
  }
}

// ---------------------------------------------------------------------------
// Deletar conversa (soft delete - sai da conversa)
// ---------------------------------------------------------------------------

/**
 * Remove o usuario da conversa.
 * @param {string} chatId
 */
async function leaveChat(chatId) {
  const uid = currentUid();
  if (!uid || !chatId) return;

  await db.collection(COLLECTION).doc(chatId).update({
    participants: firebase.firestore.FieldValue.arrayRemove(uid),
  });

  cacheService.invalidate(`${CACHE_PREFIX}list_${uid}`);
}

// ---------------------------------------------------------------------------
// Tipagem em tempo real (typing indicator)
// ---------------------------------------------------------------------------

/**
 * Atualiza indicador de digitacao.
 * @param {string} chatId
 * @param {boolean} isTyping
 */
async function setTypingStatus(chatId, isTyping) {
  const uid = currentUid();
  if (!uid || !chatId) return;

  try {
    if (isTyping) {
      await db.collection(COLLECTION).doc(chatId).update({
        [`typing.${uid}`]: serverTimestamp(),
      });
    } else {
      await db.collection(COLLECTION).doc(chatId).update({
        [`typing.${uid}`]: firebase.firestore.FieldValue.delete(),
      });
    }
  // eslint-disable-next-line no-unused-vars
  } catch (error) {
    // Silencia erro se chat nao existir
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const analystChatService = {
  getOrCreateDirectChat,
  createGroupChat,
  updateGroupChat,
  listMyChats,
  sendMessage,
  loadMessages,
  markAsRead,
  onMyChatsChanged,
  onMessagesChanged,
  removeAllListeners,
  listAvailableUsers,
  getTotalUnreadCount,
  updatePresence,
  leaveChat,
  setTypingStatus,
  currentUid,
  currentUserData,
};

export default analystChatService;
