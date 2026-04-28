// =============================================================================
// SISTEMA DE NOTIFICAÇÕES SIMPLIFICADO - VERSÃO ESTÁVEL
// =============================================================================

/**
 * Estado do sistema de notificações
 */
const notificationState = {
  isInitialized: false,
  notifications: [],
  unreadCount: 0,
  settings: {
    enabled: true,
    desktop: true,
    sound: true,
    autoCheck: false,
    checkInterval: 5
  }
};

/**
 * Tipos de notificação
 */
const NOTIFICATION_TYPES = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  SUCCESS: 'success'
};

/**
 * Configurações de prioridade
 */
const NOTIFICATION_CONFIG = {
  HIGH: { priority: 'high', color: '#dc3545' },
  MEDIUM: { priority: 'medium', color: '#ffc107' },
  LOW: { priority: 'low', color: '#007bff' }
};

/**
 * Inicializa o sistema de notificações
 * @param {string} userId - ID do usuário (opcional)
 */
async function initialize(_userId = null) {
  try {
    void _userId;
    if (typeof window.debug === 'function') {
      window.debug(' Inicializando sistema de notificações...');
    }
    
    notificationState.isInitialized = true;
    
    // Carregar configurações do localStorage
    loadSettingsFromStorage();
    
    if (typeof window.debug === 'function') {
      window.debug(' Sistema de notificações inicializado com sucesso');
    }
    return true;
  } catch (error) {
    console.error('Erro ao inicializar sistema de notificações:', error);
    return false;
  }
}

/**
 * Carrega configurações do localStorage
 */
function loadSettingsFromStorage() {
  try {
    const stored = localStorage.getItem('notificationSettings');
    if (stored) {
      const settings = JSON.parse(stored);
      notificationState.settings = { ...notificationState.settings, ...settings };
    }
  } catch (error) {
    console.warn('Erro ao carregar configurações:', error);
  }
}

/**
 * Salva configurações no localStorage
 */
function saveSettingsToStorage() {
  try {
    localStorage.setItem('notificationSettings', JSON.stringify(notificationState.settings));
  } catch (error) {
    console.warn('Erro ao salvar configurações:', error);
  }
}

/**
 * Cria uma nova notificação
 * @param {Object} notificationData - Dados da notificação
 */
async function createNotification(notificationData) {
  try {
    const notification = {
      id: Date.now().toString(),
      title: notificationData.title || 'Notificação',
      message: notificationData.message || '',
      type: notificationData.type || NOTIFICATION_TYPES.INFO,
      priority: notificationData.priority || 'low',
      read: false,
      createdAt: new Date(),
      data: notificationData.data || {}
    };

    notificationState.notifications.unshift(notification);
    if (!notification.read) {
      notificationState.unreadCount++;
    }

    // Mostrar notificação se habilitada
    if (notificationState.settings.enabled) {
      showNotificationPopup(notification);
      
      if (notificationState.settings.sound) {
        playNotificationSound();
      }
      
      if (notificationState.settings.desktop) {
        showDesktopNotification(notification);
      }
    }

    updateUI();
    return notification;
  } catch (error) {
    console.error('Erro ao criar notificação:', error);
    return null;
  }
}

/**
 * Marca notificação como lida
 * @param {string} notificationId - ID da notificação
 */
async function markAsRead(notificationId) {
  try {
    const notification = notificationState.notifications.find(n => n.id === notificationId);
    if (notification && !notification.read) {
      notification.read = true;
      notificationState.unreadCount = Math.max(0, notificationState.unreadCount - 1);
      updateUI();
    }
    return true;
  } catch (error) {
    console.error('Erro ao marcar como lida:', error);
    return false;
  }
}

/**
 * Marca todas as notificações como lidas
 */
async function markAllAsRead() {
  try {
    notificationState.notifications.forEach(notification => {
      notification.read = true;
    });
    notificationState.unreadCount = 0;
    updateUI();
    return true;
  } catch (error) {
    console.error('Erro ao marcar todas como lidas:', error);
    return false;
  }
}

/**
 * Remove uma notificação
 * @param {string} notificationId - ID da notificação
 */
async function deleteNotification(notificationId) {
  try {
    const index = notificationState.notifications.findIndex(n => n.id === notificationId);
    if (index !== -1) {
      const notification = notificationState.notifications[index];
      if (!notification.read) {
        notificationState.unreadCount = Math.max(0, notificationState.unreadCount - 1);
      }
      notificationState.notifications.splice(index, 1);
      updateUI();
    }
    return true;
  } catch (error) {
    console.error('Erro ao deletar notificação:', error);
    return false;
  }
}

/**
 * Limpa notificações antigas
 * @param {number} daysOld - Dias de antiguidade
 */
async function clearOldNotifications(daysOld = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const before = notificationState.notifications.length;
    notificationState.notifications = notificationState.notifications.filter(notification => {
      return new Date(notification.createdAt) > cutoffDate;
    });
    
    // Recalcular contadores
    notificationState.unreadCount = notificationState.notifications.filter(n => !n.read).length;
    
    const removed = before - notificationState.notifications.length;
    updateUI();
    
    return removed;
  } catch (error) {
    console.error('Erro ao limpar notificações antigas:', error);
    return 0;
  }
}

// Expor API global
window.notificationSimpleService = {
  initialize,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearOldNotifications,
  NOTIFICATION_TYPES,
  NOTIFICATION_CONFIG
};

/**
 * Atualiza configurações
 * @param {Object} newSettings - Novas configurações
 */
export function updateSettings(newSettings) {
  notificationState.settings = { ...notificationState.settings, ...newSettings };
  saveSettingsToStorage();
}

/**
 * Obtém configurações atuais
 */
export function getSettings() {
  return { ...notificationState.settings };
}

/**
 * Obtém contagem de não lidas
 */
export function getNotificationCount() {
  return notificationState.unreadCount;
}

/**
 * Obtém todas as notificações
 */
export function getAllNotifications() {
  return [...notificationState.notifications];
}

/**
 * Verifica se está inicializado
 */
export function isInitialized() {
  return notificationState.isInitialized;
}

/**
 * Mostra popup de notificação
 */
function showNotificationPopup(notification) {
  // Implementação simples usando window.showNotification se disponível
  if (typeof window.showNotification === 'function') {
    window.showNotification(notification.message, notification.type);
  }
}

/**
 * Reproduz som de notificação
 */
export function playNotificationSound() {
  try {
    // Som simples usando Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.warn('Erro ao reproduzir som:', error);
  }
}

/**
 * Mostra notificação desktop
 */
export function showDesktopNotification(notification) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(notification.title, {
      body: notification.message,
      icon: '/images/logologin.png',
      tag: notification.id
    });
  }
}

/**
 * Atualiza a interface
 */
function updateUI() {
  if (window.notificationUI && typeof window.notificationUI.updateBadgeCount === 'function') {
    window.notificationUI.updateBadgeCount(notificationState.unreadCount);
  } else {
    const badge = document.getElementById('notification-badge');
    if (badge) {
      if (notificationState.unreadCount > 0) {
        badge.textContent = notificationState.unreadCount > 99 ? '99+' : notificationState.unreadCount;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    const notificationBtn = document.getElementById('notification-btn');
    if (notificationBtn) {
      notificationBtn.classList.toggle('has-notifications', notificationState.unreadCount > 0);
    }
  }

  // Atualizar lista se visível
  const list = document.getElementById('notification-list');
  if (list) {
    renderNotificationList(list);
  }
}

/**
 * Renderiza lista de notificações
 */
function renderNotificationList(container) {
  if (!container) return;
  
  container.innerHTML = '';
  
  if (notificationState.notifications.length === 0) {
    container.innerHTML = `
      <div class="notification-empty">
        <i class="bi bi-bell-slash"></i>
        <p>Nenhuma notificação</p>
      </div>
    `;
    return;
  }
  
  notificationState.notifications.slice(0, 20).forEach(notification => {
    const item = createNotificationElement(notification);
    container.appendChild(item);
  });
}

/**
 * Cria elemento HTML para notificação
 */
function createNotificationElement(notification) {
  const div = document.createElement('div');
  div.className = `notification-item ${notification.read ? '' : 'unread'} notification-priority-${notification.priority}`;
  div.dataset.notificationId = notification.id;
  
  const timeAgo = getTimeAgo(notification.createdAt);
  
  div.innerHTML = `
    <div class="notification-title">${notification.title}</div>
    <div class="notification-message">${notification.message}</div>
    <div class="notification-time">${timeAgo}</div>
    <div class="notification-actions">
      ${!notification.read ? '<button class="btn btn-sm btn-outline-primary mark-read-btn" title="Marcar como lida"><i class="bi bi-check"></i></button>' : ''}
      <button class="btn btn-sm btn-outline-danger delete-btn" title="Excluir"><i class="bi bi-trash"></i></button>
    </div>
  `;
  
  // Eventos
  const markReadBtn = div.querySelector('.mark-read-btn');
  if (markReadBtn) {
    markReadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      markAsRead(notification.id);
    });
  }
  
  const deleteBtn = div.querySelector('.delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNotification(notification.id);
    });
  }
  
  return div;
}

/**
 * Calcula tempo decorrido
 */
function getTimeAgo(date) {
  const now = new Date();
  const notificationDate = new Date(date);
  const diffMs = now - notificationDate;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'Agora';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  
  return notificationDate.toLocaleDateString('pt-BR');
}

/**
 * Objeto principal do serviço - simplificado e funcional
 */
export const notificationService = {
  initialize,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearOldNotifications,
  updateSettings,
  getSettings,
  getNotificationCount,
  getAllNotifications,
  isInitialized,
  playNotificationSound,
  showDesktopNotification
};

// Debug log - usando global debug function
if (typeof window !== 'undefined' && window.debug) {
  window.debug(' NotificationService (simplificado) carregado');
}