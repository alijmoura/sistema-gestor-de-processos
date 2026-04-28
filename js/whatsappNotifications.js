/**
 * @file whatsappNotifications.js
 * @description Sistema de notificações push para agentes WhatsApp
 *
 * Funcionalidades:
 * - Notificações desktop (Web Notifications API)
 * - Notificações Firebase Cloud Messaging (FCM)
 * - Notificações in-app (toast/badge)
 * - Sons customizados por tipo de notificação
 * - Gerenciamento de permissões
 * - Histórico de notificações
 * - Configurações por agente
 * 
 * Data: 2025-10-29
 */

import { db, auth } from './auth.js';
import { showNotification as showToast } from './ui.js';
import whatsappService from './whatsappService.js';

if (window.__DEBUG__) console.log('[whatsappNotifications] Módulo carregado.');

// Tipos de notificação
const NOTIFICATION_TYPES = {
  NEW_MESSAGE: 'nova_mensagem',
  NEW_CHAT: 'novo_chat',
  CHAT_ASSIGNED: 'chat_atribuido',
  CHAT_TRANSFERRED: 'chat_transferido',
  AGENT_MESSAGE: 'mensagem_agente',
  MENTION: 'mencao',
  SLA_WARNING: 'alerta_sla',
  SYSTEM: 'sistema'
};

// Sons de notificação
const NOTIFICATION_SOUNDS = {
  [NOTIFICATION_TYPES.NEW_MESSAGE]: '/sounds/message.mp3',
  [NOTIFICATION_TYPES.NEW_CHAT]: '/sounds/new-chat.mp3',
  [NOTIFICATION_TYPES.CHAT_ASSIGNED]: '/sounds/assigned.mp3',
  [NOTIFICATION_TYPES.CHAT_TRANSFERRED]: '/sounds/transfer.mp3',
  [NOTIFICATION_TYPES.MENTION]: '/sounds/mention.mp3',
  [NOTIFICATION_TYPES.SLA_WARNING]: '/sounds/warning.mp3'
};

// Estado das notificações
const notificationState = {
  permission: 'default',
  fcmToken: null,
  enabled: false,
  soundEnabled: true,
  desktopEnabled: true,
  unreadCount: 0,
  listeners: []
};

const inboundActivityDedup = new Map();

function buildInboundDedupKey(chatId, timestampValue) {
  const ts = timestampValue?.toDate ? timestampValue.toDate().getTime() : new Date(timestampValue || 0).getTime();
  return `${chatId}_${Number.isFinite(ts) ? ts : Date.now()}`;
}

function shouldLogInboundActivity(chatId, timestampValue) {
  const key = buildInboundDedupKey(chatId, timestampValue);
  const now = Date.now();
  const ttlMs = 2 * 60 * 1000;

  for (const [existingKey, createdAt] of inboundActivityDedup.entries()) {
    if (now - createdAt > ttlMs) {
      inboundActivityDedup.delete(existingKey);
    }
  }

  if (inboundActivityDedup.has(key)) {
    return false;
  }

  inboundActivityDedup.set(key, now);
  return true;
}

const DEFAULT_PAGE_TITLE = 'Sistema Gestor de Processos';

function getUserDocRef(userId) {
  return db.collection('users').doc(userId);
}

function getWhatsAppNotificationsRef(userId) {
  return getUserDocRef(userId).collection('whatsappNotifications');
}

/**
 * Inicializa sistema de notificações
 */
export async function initNotifications() {
  if (window.__DEBUG__) console.log('[whatsappNotifications] Inicializando...');

  // Carregar configurações do agente
  await loadNotificationSettings();

  // Verificar permissão de notificações
  await checkNotificationPermission();

  // Registrar Service Worker para FCM
  if ('serviceWorker' in navigator) {
    try {
      let registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw.js');
      }
      if (window.__DEBUG__) console.log('[whatsappNotifications] Service Worker registrado:', registration);
    } catch (err) {
      console.error('[whatsappNotifications] Erro ao registrar SW:', err);
    }
  }

  // Inicializar FCM
  await initFCM();

  // Iniciar listeners de notificações
  startNotificationListeners();

  // Atualizar contador de não lidas
  updateUnreadBadge();

  // Eventos de UI do centro de notificações
  const markAllButton = document.getElementById('whatsapp-mark-all-read-btn');
  if (markAllButton) {
    markAllButton.addEventListener('click', () => {
      markAllNotificationsAsRead();
    });
  }

  const whatsappTabBtn = document.getElementById('notification-tab-whatsapp-btn');
  if (whatsappTabBtn && window.bootstrap && window.bootstrap.Tab) {
    whatsappTabBtn.addEventListener('shown.bs.tab', () => {
      renderNotificationHistory();
    });
  }

  const syncWithNotificationUI = () => {
    if (window.notificationUI && typeof window.notificationUI.setExternalUnreadCount === 'function') {
      window.notificationUI.setExternalUnreadCount(notificationState.unreadCount);
      return true;
    }
    return false;
  };

  if (!syncWithNotificationUI()) {
    const onNotificationUIReady = () => {
      if (syncWithNotificationUI()) {
        window.removeEventListener('notification-ui:ready', onNotificationUIReady);
      }
    };
    window.addEventListener('notification-ui:ready', onNotificationUIReady);
  }

  if (window.__DEBUG__) console.log('[whatsappNotifications] Sistema inicializado');
}

/**
 * Verifica e solicita permissão para notificações
 */
async function checkNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('[whatsappNotifications] Notificações não suportadas neste navegador');
    return false;
  }

  notificationState.permission = Notification.permission;

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    notificationState.permission = permission;
  }

  return notificationState.permission === 'granted';
}

/**
 * Inicializa Firebase Cloud Messaging
 */
async function initFCM() {
  if (!firebase.messaging || !firebase.messaging.isSupported()) {
    console.warn('[whatsappNotifications] FCM não suportado');
    return;
  }

  try {
    const messaging = firebase.messaging();

    const config = await whatsappService.loadWhatsAppConfig();
    const vapidKey = config?.fcmPublicVapidKey;

    if (!vapidKey) {
      console.warn('[whatsappNotifications] Chave pública VAPID não configurada em whatsappConfig/settings (campo fcmPublicVapidKey). Notificações push via FCM serão ignoradas.');
      return;
    }

    // Solicitar token FCM
    const token = await messaging.getToken({
      vapidKey
    });

    if (token) {
      notificationState.fcmToken = token;
      await saveFCMToken(token);
      if (window.__DEBUG__) console.log('[whatsappNotifications] FCM Token:', token);
    }

    // Listener para mensagens em foreground
    messaging.onMessage(payload => {
      if (window.__DEBUG__) console.log('[whatsappNotifications] Mensagem FCM:', payload);
      
      const { title, body, data } = payload.notification || payload.data;
      
      showDesktopNotification(title, {
        body,
        data: data || payload.data,
        tag: data?.chatId || 'whatsapp-notification'
      });
    });

  } catch (err) {
    console.error('[whatsappNotifications] Erro ao inicializar FCM:', err);
  }
}

/**
 * Salva token FCM no Firestore
 */
async function saveFCMToken(token) {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  try {
    await getUserDocRef(userId).set({
      whatsapp: {
        fcmToken: token,
        fcmTokenUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }
    }, { merge: true });
  } catch (err) {
    console.error('[whatsappNotifications] Erro ao salvar FCM token:', err);
  }
}

/**
 * Carrega configurações de notificação do agente
 */
async function loadNotificationSettings() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  try {
    const userDoc = await getUserDocRef(userId).get();
    
    if (userDoc.exists) {
      const settings = userDoc.data()?.whatsapp?.notificationSettings || {};
      
      notificationState.enabled = settings.enabled !== false;
      notificationState.soundEnabled = settings.soundEnabled !== false;
      notificationState.desktopEnabled = settings.desktopEnabled !== false;
    }
  } catch (err) {
    console.error('[whatsappNotifications] Erro ao carregar configurações:', err);
  }
}

/**
 * Salva configurações de notificação
 */
export async function saveNotificationSettings(settings) {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  try {
    await getUserDocRef(userId).set({
      whatsapp: {
        notificationSettings: {
          enabled: settings.enabled !== false,
          soundEnabled: settings.soundEnabled !== false,
          desktopEnabled: settings.desktopEnabled !== false,
          types: settings.types || Object.values(NOTIFICATION_TYPES),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }
      }
    }, { merge: true });

    // Atualizar estado local
    Object.assign(notificationState, settings);

    showToast('Configurações de notificação salvas', 'success');
  } catch (err) {
    console.error('[whatsappNotifications] Erro ao salvar configurações:', err);
    showToast('Erro ao salvar configurações', 'error');
  }
}

/**
 * Inicia listeners de eventos para notificações
 */
function startNotificationListeners() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  // Listener para novos chats atribuídos
  const assignedListener = db.collection('chats')
    .where('agentId', '==', userId)
    .where('assignedAt', '>', new Date())
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const chat = change.doc.data();
          notify({
            type: NOTIFICATION_TYPES.CHAT_ASSIGNED,
            title: 'Nova Conversa Atribuída',
            body: `Cliente: ${formatPhone(chat.numero)}${chat.department ? ` - ${chat.department}` : ''}`,
            data: { chatId: change.doc.id },
            requireInteraction: true
          });
        }
      });
    }, error => {
      console.warn('[whatsappNotifications] Erro no listener de chats atribuídos:', error);
    });

  notificationState.listeners.push(assignedListener);

  // Listener para novas mensagens nos chats do agente
  // Escuta mudanças nos chats atribuídos ao agente (via campo lastMessageAt)
  // em vez de collectionGroup('messages') que falha por permissões em outras subcollections
  const agentChatsListener = db.collection('chats')
    .where('agentId', '==', userId)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'modified') {
          const chat = change.doc.data();
          const chatId = change.doc.id;
          
          // Verificar se houve nova mensagem inbound (lastMessageDirection ou lastMessage)
          if (chat.lastMessageDirection === 'inbound' && chat.lastMessageAt) {
            const lastMsgTime = chat.lastMessageAt?.toDate ? chat.lastMessageAt.toDate() : new Date(chat.lastMessageAt);
            const now = new Date();
            const diffMs = now - lastMsgTime;
            
            // Notifica apenas se a mensagem foi recebida nos ultimos 30 segundos
            if (diffMs < 30000) {
              if (window.activityLogService?.logActivity && shouldLogInboundActivity(chatId, chat.lastMessageAt)) {
                window.activityLogService.logActivity(
                  'WHATSAPP_MSG',
                  `Nova mensagem WhatsApp de ${formatPhone(chat.numero || chatId)}`,
                  chatId,
                  {
                    source: 'whatsappNotifications',
                    chatId,
                    phone: chat.numero || chatId,
                    direction: chat.lastMessageDirection || 'inbound',
                    preview: truncateText(chat.lastMessage || 'Nova mensagem', 120),
                    timestamp: chat.lastMessageAt,
                  }
                );
              }

              notify({
                type: NOTIFICATION_TYPES.NEW_MESSAGE,
                title: `Mensagem de ${formatPhone(chat.numero || chatId)}`,
                body: truncateText(chat.lastMessage || ' Nova mensagem', 100),
                data: { chatId },
                tag: chatId
              });
            }
          }
        }
      });
    }, error => {
      console.warn('[whatsappNotifications] Erro no listener de mensagens:', error);
    });

  notificationState.listeners.push(agentChatsListener);

  // Listener para transferências
  const transferListener = db.collection('chats')
    .where('agentId', '==', userId)
    .where('transferredAt', '>', new Date())
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'modified') {
          const chat = change.doc.data();
          
          if (chat.agentId === userId && chat.previousAgentId) {
            notify({
              type: NOTIFICATION_TYPES.CHAT_TRANSFERRED,
              title: 'Conversa Transferida',
              body: `Transferida de outro agente${chat.transferNotes ? `: ${chat.transferNotes}` : ''}`,
              data: { chatId: change.doc.id },
              requireInteraction: true
            });
          }
        }
      });
    }, error => {
      console.warn('[whatsappNotifications] Erro no listener de transferências:', error);
    });

  notificationState.listeners.push(transferListener);

  if (window.__DEBUG__) console.log('[whatsappNotifications] Listeners iniciados');
}

/**
 * Envia notificação (orquestra desktop/sound/in-app)
 */
export function notify(options) {
  if (!notificationState.enabled) return;

  const {
    type = NOTIFICATION_TYPES.SYSTEM,
    title,
    body,
    data = {},
    icon = '/images/whatsapp-icon.png',
    badge = '/images/badge-icon.png',
    tag,
    requireInteraction = false
  } = options;

  // Notificação in-app (toast)
  showToast(body, getToastType(type), 5000);

  // Som
  if (notificationState.soundEnabled) {
    playNotificationSound(type);
  }

  // Notificação desktop
  if (notificationState.desktopEnabled && notificationState.permission === 'granted') {
    showDesktopNotification(title, {
      body,
      icon,
      badge,
      tag,
      data,
      requireInteraction
    });
  }

  // Incrementar contador de não lidas
  incrementUnreadCount();

  // Salvar no histórico
  saveNotificationHistory({
    type,
    title,
    body,
    data,
    timestamp: new Date()
  });
}

/**
 * Exibe notificação desktop
 */
function showDesktopNotification(title, options) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  try {
    const notification = new Notification(title, options);

    notification.onclick = (event) => {
      event.preventDefault();
      
      // Focar na janela
      window.focus();
      
      // Navegar para o chat se houver chatId
      if (options.data?.chatId && window.__WHATSAPP_UI__) {
        window.__WHATSAPP_UI__.openChat(options.data.chatId);
      }
      
      notification.close();
    };

    // Auto-fechar após 10 segundos se não requerer interação
    if (!options.requireInteraction) {
      setTimeout(() => notification.close(), 10000);
    }

  } catch (err) {
    console.error('[whatsappNotifications] Erro ao exibir notificação:', err);
  }
}

/**
 * Toca som de notificação
 */
function playNotificationSound(type) {
  // Desabilitado temporariamente - arquivos de som não disponíveis
  if (!notificationState.soundEnabled) return;
  
  const soundPath = NOTIFICATION_SOUNDS[type];
  if (!soundPath) return;

  try {
    const audio = new Audio(soundPath);
    audio.volume = 0.5;
    
    // Verificar se o arquivo existe antes de tocar
    audio.addEventListener('error', () => {
      if (window.__DEBUG__) {
        console.warn(`[whatsappNotifications] Arquivo de som não encontrado: ${soundPath}`);
      }
    }, { once: true });
    
    audio.play().catch(err => {
      // Silenciar erro se arquivo não existir (404)
      if (window.__DEBUG__ && !err.message?.includes('404')) {
        console.warn('[whatsappNotifications] Erro ao tocar som:', err);
      }
    });
  } catch (err) {
    if (window.__DEBUG__) {
      console.error('[whatsappNotifications] Erro ao criar áudio:', err);
    }
  }
}

/**
 * Salva notificação no histórico
 */
async function saveNotificationHistory(notification) {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  try {
    await getWhatsAppNotificationsRef(userId)
      .add({
        ...notification,
        userId,
        read: false,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
  } catch (err) {
    console.error('[whatsappNotifications] Erro ao salvar histórico:', err);
  }
}

/**
 * Marca notificação como lida
 */
export async function markNotificationAsRead(notificationId) {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  try {
    await getWhatsAppNotificationsRef(userId)
      .doc(notificationId)
      .update({ read: true });

    decrementUnreadCount();
  } catch (err) {
    console.error('[whatsappNotifications] Erro ao marcar como lida:', err);
  }
}

/**
 * Marca todas notificações como lidas
 */
export async function markAllNotificationsAsRead() {
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  try {
    const snapshot = await getWhatsAppNotificationsRef(userId)
      .where('read', '==', false)
      .get();

    const batch = db.batch();
    
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { read: true });
    });

    await batch.commit();

    notificationState.unreadCount = 0;
    updateUnreadBadge();

    showToast('Todas notificações marcadas como lidas', 'success');
  } catch (err) {
    console.error('[whatsappNotifications] Erro ao marcar todas como lidas:', err);
  }
}

/**
 * Busca histórico de notificações
 */
export async function getNotificationHistory(limit = 50) {
  const userId = auth.currentUser?.uid;
  if (!userId) return [];

  try {
    const snapshot = await getWhatsAppNotificationsRef(userId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (err) {
    console.error('[whatsappNotifications] Erro ao buscar histórico:', err);
    return [];
  }
}

/**
 * Incrementa contador de não lidas
 */
function incrementUnreadCount() {
  notificationState.unreadCount++;
  updateUnreadBadge();
}

/**
 * Decrementa contador de não lidas
 */
function decrementUnreadCount() {
  if (notificationState.unreadCount > 0) {
    notificationState.unreadCount--;
    updateUnreadBadge();
  }
}

/**
 * Atualiza badge visual de não lidas
 */
function updateUnreadBadge() {
  if (window.notificationUI && typeof window.notificationUI.setExternalUnreadCount === 'function') {
    window.notificationUI.setExternalUnreadCount(notificationState.unreadCount);
  } else {
    const tabBadge = document.getElementById('notification-tab-whatsapp-count');
    if (tabBadge) {
      tabBadge.textContent = notificationState.unreadCount;
      tabBadge.classList.toggle('d-none', notificationState.unreadCount === 0);
    }

    const mainBadge = document.getElementById('notification-badge');
    if (mainBadge) {
      if (notificationState.unreadCount > 0) {
        mainBadge.textContent = notificationState.unreadCount > 99 ? '99+' : notificationState.unreadCount;
        mainBadge.classList.remove('d-none');
        mainBadge.style.display = 'inline-block';
      } else {
        mainBadge.classList.add('d-none');
        mainBadge.style.display = 'none';
      }
    }
  }

  // Mantém o título da aba consistente em todas as telas da aplicação.
  document.title = DEFAULT_PAGE_TITLE;

  // Atualizar favicon (opcional)
  updateFavicon(notificationState.unreadCount > 0);
}

/**
 * Atualiza favicon para indicar notificações
 */
function updateFavicon(hasNotifications) {
  const favicon = document.querySelector('link[rel="icon"]');
  
  if (!favicon) return;

  if (hasNotifications) {
    // Trocar para favicon com badge vermelho (você pode criar uma versão alternativa)
    favicon.href = '/images/favicon-notification.png';
  } else {
    favicon.href = '/images/favicon.png';
  }
}

/**
 * Para todos os listeners de notificação
 */
export function stopNotificationListeners() {
  notificationState.listeners.forEach(unsubscribe => unsubscribe());
  notificationState.listeners = [];
}

/**
 * Abre painel de notificações
 */
export function openNotificationPanel() {
  const offcanvasEl = document.getElementById('notification-center');
  const tabBtn = document.getElementById('notification-tab-whatsapp-btn');

  if (!offcanvasEl || !window.bootstrap || !window.bootstrap.Offcanvas) {
    console.warn('[whatsappNotifications] Centro de notificações não disponível');
    return;
  }

  const offcanvas = window.bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);
  offcanvas.show();

  if (tabBtn && window.bootstrap.Tab) {
    const tabInstance = window.bootstrap.Tab.getOrCreateInstance(tabBtn);
    tabInstance.show();
  }

  renderNotificationHistory();
}

/**
 * Renderiza histórico de notificações
 */
async function renderNotificationHistory() {
  const container = document.getElementById('whatsapp-notifications-list');
  if (!container) return;

  container.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>';

  try {
    const notifications = await getNotificationHistory(20);

    if (notifications.length === 0) {
      container.innerHTML = '<p class="text-center text-muted py-4">Nenhuma notificação</p>';
      return;
    }

    container.innerHTML = notifications.map(notif => `
      <div class="notification-item ${notif.read ? 'read' : 'unread'}" data-id="${notif.id}">
        <div class="d-flex align-items-start">
          <div class="notification-icon me-2">
            ${getNotificationIcon(notif.type)}
          </div>
          <div class="flex-grow-1">
            <strong>${notif.title}</strong>
            <p class="mb-1 small">${notif.body}</p>
            <small class="text-muted">${formatTimestamp(notif.timestamp)}</small>
          </div>
          ${!notif.read ? `
            <button class="btn btn-sm btn-link" onclick="window.__WHATSAPP_NOTIFICATIONS__.markAsRead('${notif.id}')">
              <i class="bi bi-check2"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error('[whatsappNotifications] Erro ao renderizar histórico:', err);
    container.innerHTML = '<p class="text-center text-danger">Erro ao carregar notificações</p>';
  }
}

// Utilitários

function formatPhone(phone) {
  if (!phone) {
    return '';
  }

  const cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length === 13 && cleaned.startsWith('55')) {
    const ddd = cleaned.substring(2, 4);
    const num = cleaned.substring(4);
    return `(${ddd}) ${num.substring(0, 5)}-${num.substring(5)}`;
  }
  return phone;
}

function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function getToastType(notificationType) {
  const typeMap = {
    [NOTIFICATION_TYPES.NEW_MESSAGE]: 'info',
    [NOTIFICATION_TYPES.NEW_CHAT]: 'success',
    [NOTIFICATION_TYPES.CHAT_ASSIGNED]: 'success',
    [NOTIFICATION_TYPES.CHAT_TRANSFERRED]: 'warning',
    [NOTIFICATION_TYPES.SLA_WARNING]: 'error',
    [NOTIFICATION_TYPES.SYSTEM]: 'info'
  };
  return typeMap[notificationType] || 'info';
}

function getNotificationIcon(type) {
  const iconMap = {
    [NOTIFICATION_TYPES.NEW_MESSAGE]: '<i class="bi bi-chat-dots text-primary"></i>',
    [NOTIFICATION_TYPES.NEW_CHAT]: '<i class="bi bi-person-plus text-success"></i>',
    [NOTIFICATION_TYPES.CHAT_ASSIGNED]: '<i class="bi bi-person-check text-success"></i>',
    [NOTIFICATION_TYPES.CHAT_TRANSFERRED]: '<i class="bi bi-arrow-left-right text-warning"></i>',
    [NOTIFICATION_TYPES.SLA_WARNING]: '<i class="bi bi-exclamation-triangle text-danger"></i>',
    [NOTIFICATION_TYPES.SYSTEM]: '<i class="bi bi-info-circle text-info"></i>'
  };
  return iconMap[type] || '<i class="bi bi-bell"></i>';
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Agora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min atrás`;
  if (diff < 86400000) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// API pública
export const whatsappNotifications = {
  init: initNotifications,
  notify,
  saveSettings: saveNotificationSettings,
  markAsRead: markNotificationAsRead,
  markAllAsRead: markAllNotificationsAsRead,
  getHistory: getNotificationHistory,
  openPanel: openNotificationPanel,
  stop: stopNotificationListeners,
  TYPES: NOTIFICATION_TYPES
};

// Expor globalmente
window.__WHATSAPP_NOTIFICATIONS__ = whatsappNotifications;

export default whatsappNotifications;
