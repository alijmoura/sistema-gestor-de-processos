/**
 * @file notificationService.js
 * @description Sistema avançado de notificações com configurações personalizáveis
 * @version 4.1
 * @author Alisson Moura
 */

import * as firestore from './firestoreService.js';
import { auth } from './auth.js';

// Estado do sistema de notificações
let notificationState = {
  notifications: [],
  unreadCount: 0,
  settings: {
    enabled: true,
    sound: true,
    desktop: false,
    autoCheck: true,
    frequency: 120000, //  OTIMIZAÇÃO 24/11/2025: 2 minutos (era 30s) para reduzir leituras Firestore
    maxNotifications: 50
  },
  checkInterval: null,
  isInitialized: false
};

/**
 * Tipos de notificação disponíveis
 */
const NOTIFICATION_TYPES = {
  CONTRACT_STATUS_CHANGE: 'contract_status_change',
  CONTRACT_ASSIGNED: 'contract_assigned',
  CONTRACT_OVERDUE: 'contract_overdue',
  CONTRACT_DEADLINE: 'contract_deadline',
  SYSTEM_MESSAGE: 'system_message',
  USER_MENTION: 'user_mention',
  BACKUP_COMPLETED: 'backup_completed',
  IMPORT_COMPLETED: 'import_completed'
};

/**
 * Configurações visuais por tipo de notificação
 */
const NOTIFICATION_CONFIG = {
  [NOTIFICATION_TYPES.CONTRACT_STATUS_CHANGE]: {
    icon: 'bi-arrow-repeat',
    color: 'info',
    priority: 'medium'
  },
  [NOTIFICATION_TYPES.CONTRACT_ASSIGNED]: {
    icon: 'bi-person-check',
    color: 'success',
    priority: 'high'
  },
  [NOTIFICATION_TYPES.CONTRACT_OVERDUE]: {
    icon: 'bi-exclamation-triangle',
    color: 'warning',
    priority: 'high'
  },
  [NOTIFICATION_TYPES.CONTRACT_DEADLINE]: {
    icon: 'bi-calendar-event',
    color: 'warning',
    priority: 'medium'
  },
  [NOTIFICATION_TYPES.SYSTEM_MESSAGE]: {
    icon: 'bi-info-circle',
    color: 'primary',
    priority: 'low'
  },
  [NOTIFICATION_TYPES.USER_MENTION]: {
    icon: 'bi-at',
    color: 'primary',
    priority: 'high'
  },
  [NOTIFICATION_TYPES.BACKUP_COMPLETED]: {
    icon: 'bi-check-circle',
    color: 'success',
    priority: 'low'
  },
  [NOTIFICATION_TYPES.IMPORT_COMPLETED]: {
    icon: 'bi-upload',
    color: 'success',
    priority: 'medium'
  }
};

/**
 * Inicializa o sistema de notificações
 * @param {string} userId - ID do usuário (para compatibilidade)
 */
export async function initialize() {
  return await initializeNotifications();
}

/**
 * Inicializa o sistema de notificações
 */
export async function initializeNotifications() {
  try {
    console.log(' Inicializando sistema de notificações...');
    
    // Aguardar Firebase estar disponível
    let attempts = 0;
    while ((!auth) && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!auth) {
      console.warn('Firebase não disponível - modo offline para notificações');
      notificationState.isInitialized = true;
      return;
    }
    
    // Carrega configurações do usuário
    await loadUserSettings();
    
    // Carrega notificações existentes
    await loadNotifications();
    
    // Inicia verificação automática se habilitada
    if (notificationState.settings.autoCheck && notificationState.settings.enabled) {
      startAutoCheck();
    }
    
    // Solicita permissão para notificações desktop
    if (notificationState.settings.desktop && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    
    notificationState.isInitialized = true;
    updateNotificationUI();
    
    console.log(' Sistema de notificações inicializado com sucesso');
    
    // Notificação de boas-vindas
    await createNotification({
      type: NOTIFICATION_TYPES.SYSTEM_MESSAGE,
      title: 'Sistema Ativo',
      message: 'Sistema de notificações carregado com sucesso!',
      priority: 'low'
    });
    
  } catch (error) {
    console.error(' Erro ao inicializar notificações:', error);
  }
}

/**
 * Carrega configurações do usuário do localStorage
 */
async function loadUserSettings() {
  try {
    const savedSettings = localStorage.getItem('notificationSettings');
    if (savedSettings) {
      notificationState.settings = { 
        ...notificationState.settings, 
        ...JSON.parse(savedSettings) 
      };
    }
  } catch (error) {
    console.warn(' Erro ao carregar configurações de notificação:', error);
  }
}

/**
 * Salva configurações do usuário no localStorage
 */
export function saveUserSettings(newSettings) {
  try {
    notificationState.settings = { ...notificationState.settings, ...newSettings };
    localStorage.setItem('notificationSettings', JSON.stringify(notificationState.settings));
    
    // Reinicia verificação automática se necessário
    if (newSettings.autoCheck !== undefined || newSettings.frequency !== undefined) {
      stopAutoCheck();
      if (notificationState.settings.autoCheck && notificationState.settings.enabled) {
        startAutoCheck();
      }
    }
    
    updateNotificationUI();
    return true;
  } catch (error) {
    console.error(' Erro ao salvar configurações:', error);
    return false;
  }
}

/**
 * Carrega notificações do Firestore
 */
async function loadNotifications() {
  try {
  const currentUser = auth?.currentUser;
    if (!currentUser) return;
    
    const notifications = await firestore.getUserNotifications(currentUser.uid);
    
    notificationState.notifications = notifications.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    
    notificationState.unreadCount = notifications.filter(n => !n.read).length;
    
    // Limita o número de notificações em memória
    if (notificationState.notifications.length > notificationState.settings.maxNotifications) {
      notificationState.notifications = notificationState.notifications.slice(0, notificationState.settings.maxNotifications);
    }
    
    updateNotificationUI();
    
  } catch (error) {
    console.error(' Erro ao carregar notificações:', error);
  }
}

/**
 * Cria uma nova notificação
 */
export async function createNotification(notificationData) {
  try {
  const currentUser = auth?.currentUser;
    if (!currentUser) {
      console.warn(' Usuário não autenticado para criar notificação');
      return;
    }
    
    const notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: currentUser.uid,
      type: notificationData.type || NOTIFICATION_TYPES.SYSTEM_MESSAGE,
      title: notificationData.title,
      message: notificationData.message,
      data: notificationData.data || {},
      read: false,
      createdAt: new Date().toISOString(),
      priority: notificationData.priority || 'medium',
      expiresAt: notificationData.expiresAt || null
    };
    
    // Salva no Firestore
    await firestore.createNotification(notification);
    
    // Adiciona à lista local
    notificationState.notifications.unshift(notification);
    notificationState.unreadCount++;
    
    // Limita o número de notificações
    if (notificationState.notifications.length > notificationState.settings.maxNotifications) {
      notificationState.notifications.pop();
    }
    
    // Exibe notificação
    if (notificationState.settings.enabled) {
      showNotificationPopup(notification);
      
      if (notificationState.settings.sound) {
        playNotificationSound();
      }
      
      if (notificationState.settings.desktop && Notification.permission === 'granted') {
        showDesktopNotification(notification);
      }
    }
    
    updateNotificationUI();
    
    return notification;
    
  } catch (error) {
    console.error(' Erro ao criar notificação:', error);
    return null;
  }
}

/**
 * Marca uma notificação como lida
 */
export async function markAsRead(notificationId) {
  try {
    const notification = notificationState.notifications.find(n => n.id === notificationId);
    if (!notification || notification.read) return;
    
    // Atualiza no Firestore
    await firestore.updateNotification(notificationId, { read: true });
    
    // Atualiza localmente
    notification.read = true;
    notificationState.unreadCount = Math.max(0, notificationState.unreadCount - 1);
    
    updateNotificationUI();
    
  } catch (error) {
    console.error(' Erro ao marcar notificação como lida:', error);
  }
}

/**
 * Marca todas as notificações como lidas
 */
export async function markAllAsRead() {
  try {
    const unreadNotifications = notificationState.notifications.filter(n => !n.read);
    
    if (unreadNotifications.length === 0) return;
    
    // Atualiza no Firestore em lote
    const updatePromises = unreadNotifications.map(n => 
      firestore.updateNotification(n.id, { read: true })
    );
    
    await Promise.all(updatePromises);
    
    // Atualiza localmente
    unreadNotifications.forEach(n => n.read = true);
    notificationState.unreadCount = 0;
    
    updateNotificationUI();
    
  } catch (error) {
    console.error(' Erro ao marcar todas como lidas:', error);
  }
}

/**
 * Remove uma notificação
 */
export async function deleteNotification(notificationId) {
  try {
    // Remove do Firestore
    await firestore.deleteNotification(notificationId);
    
    // Remove localmente
    const index = notificationState.notifications.findIndex(n => n.id === notificationId);
    if (index > -1) {
      const notification = notificationState.notifications[index];
      if (!notification.read) {
        notificationState.unreadCount = Math.max(0, notificationState.unreadCount - 1);
      }
      notificationState.notifications.splice(index, 1);
    }
    
    updateNotificationUI();
    
  } catch (error) {
    console.error(' Erro ao deletar notificação:', error);
  }
}

/**
 * Limpa notificações antigas
 */
export async function clearOldNotifications(daysOld = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const oldNotifications = notificationState.notifications.filter(n => 
      new Date(n.createdAt) < cutoffDate
    );
    
    if (oldNotifications.length === 0) return;
    
    // Remove do Firestore
    const deletePromises = oldNotifications.map(n => firestore.deleteNotification(n.id));
    await Promise.all(deletePromises);
    
    // Remove localmente
    notificationState.notifications = notificationState.notifications.filter(n => 
      new Date(n.createdAt) >= cutoffDate
    );
    
    // Recalcula contador
    notificationState.unreadCount = notificationState.notifications.filter(n => !n.read).length;
    
    updateNotificationUI();
    
    console.log(` Removidas ${oldNotifications.length} notificações antigas`);
    
  } catch (error) {
    console.error(' Erro ao limpar notificações antigas:', error);
  }
}

/**
 * Inicia verificação automática de novas notificações
 */
function startAutoCheck() {
  if (notificationState.checkInterval) {
    clearInterval(notificationState.checkInterval);
  }
  
  notificationState.checkInterval = setInterval(async () => {
    await checkForNewNotifications();
  }, notificationState.settings.frequency);
  
  console.log(` Verificação automática iniciada (${notificationState.settings.frequency}ms)`);
}

/**
 * Para verificação automática
 */
function stopAutoCheck() {
  if (notificationState.checkInterval) {
    clearInterval(notificationState.checkInterval);
    notificationState.checkInterval = null;
    console.log('⏹ Verificação automática interrompida');
  }
}

/**
 * Verifica por novas notificações
 */
async function checkForNewNotifications() {
  try {
  const currentUser = auth?.currentUser;
    if (!currentUser) return;
    
    const latestNotification = notificationState.notifications[0];
    const lastCheck = latestNotification ? latestNotification.createdAt : null;
    
    const newNotifications = await firestore.getNewNotifications(currentUser.uid, lastCheck);
    
    if (newNotifications.length > 0) {
      // Adiciona novas notificações
      newNotifications.reverse().forEach(notification => {
        notificationState.notifications.unshift(notification);
        if (!notification.read) {
          notificationState.unreadCount++;
        }
        
        // Exibe notificação se habilitada
        if (notificationState.settings.enabled) {
          showNotificationPopup(notification);
          
          if (notificationState.settings.sound) {
            playNotificationSound();
          }
          
          if (notificationState.settings.desktop && Notification.permission === 'granted') {
            showDesktopNotification(notification);
          }
        }
      });
      
      // Limita número de notificações
      if (notificationState.notifications.length > notificationState.settings.maxNotifications) {
        notificationState.notifications = notificationState.notifications.slice(0, notificationState.settings.maxNotifications);
      }
      
      updateNotificationUI();
    }
    
  } catch (error) {
    console.error(' Erro ao verificar novas notificações:', error);
  }
}

/**
 * Exibe popup de notificação na interface
 */
function showNotificationPopup(notification) {
  const config = NOTIFICATION_CONFIG[notification.type] || NOTIFICATION_CONFIG[NOTIFICATION_TYPES.SYSTEM_MESSAGE];
  
  // Usar o sistema de notificação existente do UI
  if (window.UI && window.UI.showNotification) {
    window.UI.showNotification(`${notification.title}: ${notification.message}`, config.color);
  }
}

/**
 * Reproduz som de notificação
 */
function playNotificationSound() {
  try {
    // Cria um som básico usando AudioContext
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.warn(' Não foi possível reproduzir som de notificação:', error);
  }
}

/**
 * Exibe notificação desktop do navegador
 */
function showDesktopNotification(notification) {
  try {
    if (Notification.permission !== 'granted') return;
    
    const config = NOTIFICATION_CONFIG[notification.type] || NOTIFICATION_CONFIG[NOTIFICATION_TYPES.SYSTEM_MESSAGE];
    
    const desktopNotification = new Notification(notification.title, {
      body: notification.message,
      icon: '/images/logobarra.png', // Usar logo do sistema
      badge: '/images/logobarra.png',
      tag: notification.id,
      requireInteraction: config.priority === 'high'
    });
    
    desktopNotification.onclick = () => {
      window.focus();
      markAsRead(notification.id);
      desktopNotification.close();
    };
    
    // Auto-close após 5 segundos (exceto alta prioridade)
    if (config.priority !== 'high') {
      setTimeout(() => {
        desktopNotification.close();
      }, 5000);
    }
    
  } catch (error) {
    console.warn(' Erro ao exibir notificação desktop:', error);
  }
}

/**
 * Atualiza elementos UI relacionados às notificações
 */
function updateNotificationUI() {
  if (window.notificationUI && typeof window.notificationUI.updateBadgeCount === 'function') {
    window.notificationUI.updateBadgeCount(notificationState.unreadCount);
  } else {
    const badge = document.getElementById('notification-badge');
    if (badge) {
      badge.textContent = notificationState.unreadCount > 99 ? '99+' : notificationState.unreadCount.toString();
      badge.style.display = notificationState.unreadCount > 0 ? 'inline' : 'none';
    }
  }
  
  // Atualiza botão de notificações
  const notificationBtn = document.getElementById('notification-btn');
  if (notificationBtn) {
    notificationBtn.classList.toggle('has-notifications', notificationState.unreadCount > 0);
  }
  
  // Atualiza lista no dropdown
  renderNotificationList();
}

/**
 * Renderiza lista de notificações no dropdown
 */
function renderNotificationList() {
  const container = document.getElementById('notification-list');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (notificationState.notifications.length === 0) {
    container.innerHTML = `
      <div class="notification-item empty">
        <i class="bi bi-bell-slash"></i>
        <span>Nenhuma notificação</span>
      </div>
    `;
    return;
  }
  
  notificationState.notifications.slice(0, 20).forEach(notification => {
    const config = NOTIFICATION_CONFIG[notification.type] || NOTIFICATION_CONFIG[NOTIFICATION_TYPES.SYSTEM_MESSAGE];
    const timeAgo = getTimeAgo(new Date(notification.createdAt));
    
    const notificationElement = document.createElement('div');
    notificationElement.className = `notification-item ${notification.read ? 'read' : 'unread'} priority-${config.priority}`;
    notificationElement.innerHTML = `
      <div class="notification-icon">
        <i class="bi ${config.icon} text-${config.color}"></i>
      </div>
      <div class="notification-content">
        <div class="notification-title">${notification.title}</div>
        <div class="notification-message">${notification.message}</div>
        <div class="notification-time">${timeAgo}</div>
      </div>
      <div class="notification-actions">
        ${!notification.read ? `<button class="btn-mark-read" data-id="${notification.id}" title="Marcar como lida"><i class="bi bi-check"></i></button>` : ''}
        <button class="btn-delete" data-id="${notification.id}" title="Remover"><i class="bi bi-x"></i></button>
      </div>
    `;
    
    container.appendChild(notificationElement);
  });
}

/**
 * Utilitário para calcular tempo relativo
 */
function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'Agora';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
  
  return date.toLocaleDateString('pt-BR');
}

/**
 * Getters para acesso externo ao estado
 */
export function getNotificationCount() {
  return notificationState.unreadCount;
}

export function getAllNotifications() {
  return [...notificationState.notifications];
}

export function getSettings() {
  return { ...notificationState.settings };
}

export function isInitialized() {
  return notificationState.isInitialized;
}

// Exporta tipos e configurações para uso externo
export { NOTIFICATION_TYPES, NOTIFICATION_CONFIG };

/**
 * Objeto principal do serviço de notificações
 * Centraliza todas as funcionalidades em uma única interface
 */
export const notificationService = {
  // Inicialização
  initialize,
  initializeNotifications,
  
  // Gerenciamento de notificações
  createNotification,
  deleteNotification,
  markAsRead,
  markAllAsRead,
  
  // Configurações
  saveUserSettings,
  getSettings,
  
  // Estado e dados
  getNotificationCount,
  getAllNotifications,
  
  // Sistema automático
  clearOldNotifications: clearOldNotifications,
  
  // Status
  isInitialized,
  
  // Eventos
  onNotificationReceived: (callback) => {
    if (notificationState.eventHandlers && notificationState.eventHandlers.notificationReceived) {
      notificationState.eventHandlers.notificationReceived.push(callback);
    }
  },
  
  onSettingsChanged: (callback) => {
    if (notificationState.eventHandlers && notificationState.eventHandlers.settingsChanged) {
      notificationState.eventHandlers.settingsChanged.push(callback);
    }
  },
  
  // Utilitários
  playNotificationSound,
  showDesktopNotification
};

// Cleanup ao descarregar a página
window.addEventListener('beforeunload', () => {
  stopAutoCheck();
});

console.log(' NotificationService carregado');