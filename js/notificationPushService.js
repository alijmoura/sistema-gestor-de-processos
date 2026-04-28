/**
 * NotificationPushService - Sistema completo de notificações push
 *
 * Features:
 * - Toast notifications visuais
 * - Sons e vibrações configuráveis
 * - Agrupamento inteligente de notificações
 * - Ações rápidas (Responder, Arquivar, Ver Detalhes)
 * - Persistência de histórico
 * - Integração com notificationUI.js existente
 *
 * @version 1.0.0
 * @author GitHub Copilot
 */

class NotificationPushService {
    constructor() {
        // Configuração do serviço
        this.config = {
            toastDuration: 5000, // 5 segundos padrão
            maxToasts: 3, // Máximo de toasts simultâneos
            soundEnabled: false,
            vibrationEnabled: true,
            groupingTimeout: 5000, // 5s para agrupar notificações similares
            position: 'top-end', // Posição dos toasts
        };

        // Estado interno
        this.activeToasts = [];
        this.pendingGroups = new Map(); // Para agrupamento inteligente
        this.notificationHistory = [];
        this.soundCache = new Map();
        
        // Listeners externos
        this.listeners = new Set();
        
        // Elementos DOM
        this.toastContainer = null;
        
        this.init();
        
        // Expor API pública
        if (typeof window !== 'undefined') {
            window.NotificationPushService = this;
        }
    }

    /**
     * Inicializa o serviço
     */
    init() {
        this.createToastContainer();
        this.preloadSounds();
        this.setupEventListeners();
        this.loadHistory();
        
        console.log('[NotificationPushService] Serviço inicializado', {
            soundEnabled: this.config.soundEnabled,
            vibrationEnabled: this.config.vibrationEnabled,
            maxToasts: this.config.maxToasts
        });
    }

    /**
     * Cria o container de toasts no DOM
     */
    createToastContainer() {
        // Verifica se já existe
        let container = document.getElementById('notification-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-toast-container';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'true');
            
            document.body.appendChild(container);
        }
        this.toastContainer = container;
        
        // Aplicar posição após container estar atribuído
        this.setToastPosition(this.config.position);
    }

    /**
     * Define a posição dos toasts
     * @param {string} position - 'top-start', 'top-center', 'top-end', 'bottom-start', 'bottom-center', 'bottom-end'
     */
    setToastPosition(position) {
        if (!this.toastContainer) {
            console.warn('[NotificationPushService] Toast container não inicializado');
            return;
        }
        
        const positionMap = {
            'top-start': 'top-0 start-0',
            'top-center': 'top-0 start-50 translate-middle-x',
            'top-end': 'top-0 end-0',
            'bottom-start': 'bottom-0 start-0',
            'bottom-center': 'bottom-0 start-50 translate-middle-x',
            'bottom-end': 'bottom-0 end-0'
        };

        const classes = positionMap[position] || positionMap['top-end'];
        this.toastContainer.className = `toast-container position-fixed p-3 ${classes}`;
        this.config.position = position;
    }

    /**
     * Pré-carrega os sons de notificação
     */
    preloadSounds() {
        const sounds = {
            default: 'sounds/notification.mp3',
            success: 'sounds/success.mp3',
            warning: 'sounds/warning.mp3',
            error: 'sounds/error.mp3',
            info: 'sounds/info.mp3'
        };

        for (const [key, path] of Object.entries(sounds)) {
            const audio = new Audio(path);
            audio.preload = 'auto';
            this.soundCache.set(key, audio);
        }
    }

    /**
     * Configura event listeners globais
     */
    setupEventListeners() {
        // Listener para visibilidade da página (pausar sons quando em background)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseAllSounds();
            }
        });

        // Listener para preferências do usuário
        this.loadUserPreferences();
    }

    /**
     * Carrega preferências do usuário do localStorage
     */
    loadUserPreferences() {
        try {
            const prefs = JSON.parse(localStorage.getItem('notificationPushPreferences')) || {};
            if (prefs.soundEnabled !== undefined) this.config.soundEnabled = prefs.soundEnabled;
            if (prefs.vibrationEnabled !== undefined) this.config.vibrationEnabled = prefs.vibrationEnabled;
            if (prefs.position) this.setToastPosition(prefs.position);
        } catch (error) {
            console.warn('[NotificationPushService] Erro ao carregar preferências:', error);
        }
    }

    /**
     * Salva preferências do usuário
     */
    saveUserPreferences() {
        try {
            const prefs = {
                soundEnabled: this.config.soundEnabled,
                vibrationEnabled: this.config.vibrationEnabled,
                position: this.config.position
            };
            localStorage.setItem('notificationPushPreferences', JSON.stringify(prefs));
        } catch (error) {
            console.warn('[NotificationPushService] Erro ao salvar preferências:', error);
        }
    }

    /**
     * Carrega histórico de notificações
     */
    loadHistory() {
        try {
            const history = JSON.parse(localStorage.getItem('notificationHistory')) || [];
            this.notificationHistory = history.slice(-50); // Manter últimas 50
        } catch (error) {
            console.warn('[NotificationPushService] Erro ao carregar histórico:', error);
        }
    }

    /**
     * Salva histórico de notificações
     */
    saveHistory() {
        try {
            const history = this.notificationHistory.slice(-50);
            localStorage.setItem('notificationHistory', JSON.stringify(history));
        } catch (error) {
            console.warn('[NotificationPushService] Erro ao salvar histórico:', error);
        }
    }

    /**
     * Exibe uma notificação push
     * @param {Object} options - Opções da notificação
     * @returns {string} ID da notificação criada
     */
    show(options = {}) {
        const notification = this.normalizeNotification(options);
        
        // Verificar agrupamento
        if (this.shouldGroup(notification)) {
            return this.addToGroup(notification);
        }

        // Limitar toasts simultâneos
        if (this.activeToasts.length >= this.config.maxToasts) {
            this.removeOldestToast();
        }

        // Criar toast
        const toastId = this.createToast(notification);
        
        // Reproduzir som
        if (notification.sound !== false) {
            this.playSound(notification.type);
        }

        // Vibrar (mobile)
        if (notification.vibrate !== false) {
            this.vibrate(notification.type);
        }

        // Adicionar ao histórico
        this.addToHistory(notification);

        // Notificar listeners
        this.notifyListeners('show', notification);

        return toastId;
    }

    /**
     * Normaliza as opções de notificação
     * @param {Object} options - Opções brutas
     * @returns {Object} Notificação normalizada
     */
    normalizeNotification(options) {
        return {
            id: options.id || `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: options.type || 'info', // 'success', 'info', 'warning', 'error'
            title: options.title || 'Notificação',
            message: options.message || '',
            icon: options.icon || this.getDefaultIcon(options.type),
            duration: options.duration !== undefined ? options.duration : this.config.toastDuration,
            sound: options.sound,
            vibrate: options.vibrate,
            actions: options.actions || [],
            groupKey: options.groupKey || null, // Para agrupamento
            data: options.data || {}, // Dados extras
            timestamp: Date.now()
        };
    }

    /**
     * Retorna o ícone padrão para cada tipo
     * @param {string} type - Tipo da notificação
     * @returns {string} Classe do ícone Bootstrap
     */
    getDefaultIcon(type) {
        const icons = {
            success: 'bi-check-circle-fill',
            info: 'bi-info-circle-fill',
            warning: 'bi-exclamation-triangle-fill',
            error: 'bi-x-circle-fill'
        };
        return icons[type] || icons.info;
    }

    /**
     * Verifica se deve agrupar a notificação
     * @param {Object} notification - Notificação
     * @returns {boolean}
     */
    shouldGroup(notification) {
        if (!notification.groupKey) return false;
        
        // Verifica se existe grupo ativo com mesma chave
        return this.pendingGroups.has(notification.groupKey);
    }

    /**
     * Adiciona notificação a um grupo existente
     * @param {Object} notification - Notificação
     * @returns {string} ID do grupo
     */
    addToGroup(notification) {
        const group = this.pendingGroups.get(notification.groupKey);
        group.notifications.push(notification);
        group.count++;

        // Atualizar toast do grupo
        this.updateGroupToast(notification.groupKey);

        return notification.groupKey;
    }

    /**
     * Atualiza o toast de um grupo
     * @param {string} groupKey - Chave do grupo
     */
    updateGroupToast(groupKey) {
        const group = this.pendingGroups.get(groupKey);
        if (!group || !group.toastId) return;

        const toastEl = document.getElementById(group.toastId);
        if (!toastEl) return;

        // Atualizar contador
        const badge = toastEl.querySelector('.notification-group-badge');
        if (badge) {
            badge.textContent = group.count;
            badge.classList.add('notification-badge-pulse');
            setTimeout(() => badge.classList.remove('notification-badge-pulse'), 300);
        }

        // Atualizar mensagem
        const messageEl = toastEl.querySelector('.toast-body .notification-message');
        if (messageEl) {
            const latest = group.notifications[group.notifications.length - 1];
            messageEl.textContent = `${latest.message} (+${group.count - 1} similar)`;
        }

        // Resetar timer de auto-hide
        if (group.hideTimer) {
            clearTimeout(group.hideTimer);
        }
        group.hideTimer = setTimeout(() => {
            this.hideToast(group.toastId);
            this.pendingGroups.delete(groupKey);
        }, this.config.toastDuration);
    }

    /**
     * Cria um toast no DOM
     * @param {Object} notification - Notificação
     * @returns {string} ID do toast criado
     */
    createToast(notification) {
        const toastId = `toast-${notification.id}`;
        
        const toastEl = document.createElement('div');
        toastEl.id = toastId;
        toastEl.className = `toast notification-toast notification-${notification.type}`;
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');
        
        // Header
        const header = `
            <div class="toast-header">
                <i class="bi ${notification.icon} me-2"></i>
                <strong class="me-auto">${this.escapeHtml(notification.title)}</strong>
                ${notification.groupKey ? `<span class="badge notification-group-badge bg-secondary">1</span>` : ''}
                <small class="text-body-secondary">${this.getTimeAgo(notification.timestamp)}</small>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Fechar"></button>
            </div>
        `;

        // Body
        const body = `
            <div class="toast-body">
                <p class="notification-message mb-2">${this.escapeHtml(notification.message)}</p>
                ${this.createActionsHtml(notification.actions, toastId)}
            </div>
        `;

        toastEl.innerHTML = header + body;
        this.toastContainer.appendChild(toastEl);

        // Instanciar Bootstrap Toast
        const bsToast = new bootstrap.Toast(toastEl, {
            autohide: notification.duration !== 0,
            delay: notification.duration
        });

        // Event listeners
        toastEl.addEventListener('hidden.bs.toast', () => {
            this.removeToast(toastId);
        });

        // Adicionar ações aos botões
        this.attachActionHandlers(toastEl, notification);

        // Exibir toast
        bsToast.show();

        // Adicionar ao controle
        this.activeToasts.push({
            id: toastId,
            notification,
            element: toastEl,
            bsToast
        });

        // Criar grupo se necessário
        if (notification.groupKey && !this.pendingGroups.has(notification.groupKey)) {
            this.pendingGroups.set(notification.groupKey, {
                toastId,
                notifications: [notification],
                count: 1,
                hideTimer: null
            });
        }

        return toastId;
    }

    /**
     * Cria HTML para ações rápidas
     * @param {Array} actions - Array de ações
     * @returns {string} HTML das ações
     */
    createActionsHtml(actions) {
        if (!actions || actions.length === 0) return '';

        const buttonsHtml = actions.map((action, index) => {
            const variant = action.variant || 'secondary';
            return `
                <button 
                    type="button" 
                    class="btn btn-sm btn-${variant} notification-action-btn" 
                    data-action-index="${index}"
                >
                    ${action.icon ? `<i class="bi ${action.icon} me-1"></i>` : ''}
                    ${this.escapeHtml(action.label)}
                </button>
            `;
        }).join('');

        return `<div class="notification-actions mt-2 d-flex gap-2">${buttonsHtml}</div>`;
    }

    /**
     * Anexa handlers aos botões de ação
     * @param {HTMLElement} toastEl - Elemento do toast
     * @param {Object} notification - Dados da notificação
     */
    attachActionHandlers(toastEl, notification) {
        const actionButtons = toastEl.querySelectorAll('.notification-action-btn');
        actionButtons.forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.actionIndex);
                const action = notification.actions[index];
                
                if (action && typeof action.handler === 'function') {
                    action.handler(notification, e);
                }

                // Fechar toast após ação (se configurado)
                if (action.closeAfter !== false) {
                    this.hideToast(toastEl.id);
                }
            });
        });
    }

    /**
     * Remove o toast mais antigo
     */
    removeOldestToast() {
        if (this.activeToasts.length === 0) return;
        
        const oldest = this.activeToasts[0];
        this.hideToast(oldest.id);
    }

    /**
     * Esconde um toast específico
     * @param {string} toastId - ID do toast
     */
    hideToast(toastId) {
        const toast = this.activeToasts.find(t => t.id === toastId);
        if (!toast) return;

        toast.bsToast.hide();
    }

    /**
     * Remove um toast do controle e do DOM
     * @param {string} toastId - ID do toast
     */
    removeToast(toastId) {
        const index = this.activeToasts.findIndex(t => t.id === toastId);
        if (index === -1) return;

        const toast = this.activeToasts[index];
        toast.element.remove();
        this.activeToasts.splice(index, 1);
    }

    /**
     * Reproduz som de notificação
     * @param {string} type - Tipo da notificação
     */
    playSound(type) {
        if (!this.config.soundEnabled) return;

        const sound = this.soundCache.get(type) || this.soundCache.get('default');
        if (!sound) return;

        sound.currentTime = 0;
        sound.play().catch(err => {
            console.warn('[NotificationPushService] Erro ao reproduzir som:', err);
        });
    }

    /**
     * Pausa todos os sons ativos
     */
    pauseAllSounds() {
        this.soundCache.forEach(sound => {
            if (!sound.paused) {
                sound.pause();
            }
        });
    }

    /**
     * Vibra o dispositivo (mobile)
     * @param {string} type - Tipo da notificação
     */
    vibrate(type) {
        if (!this.config.vibrationEnabled) return;
        if (!navigator.vibrate) return;

        const patterns = {
            success: [100],
            info: [100],
            warning: [100, 50, 100],
            error: [200, 100, 200]
        };

        const pattern = patterns[type] || patterns.info;
        navigator.vibrate(pattern);
    }

    /**
     * Adiciona notificação ao histórico
     * @param {Object} notification - Notificação
     */
    addToHistory(notification) {
        this.notificationHistory.push({
            ...notification,
            viewedAt: null
        });

        // Manter apenas últimas 50
        if (this.notificationHistory.length > 50) {
            this.notificationHistory.shift();
        }

        this.saveHistory();
    }

    /**
     * Retorna o histórico de notificações
     * @returns {Array}
     */
    getHistory() {
        return [...this.notificationHistory];
    }

    /**
     * Limpa o histórico
     */
    clearHistory() {
        this.notificationHistory = [];
        this.saveHistory();
    }

    /**
     * Fecha todas as notificações ativas
     */
    closeAll() {
        [...this.activeToasts].forEach(toast => {
            this.hideToast(toast.id);
        });
    }

    /**
     * Adiciona listener para eventos
     * @param {Function} callback - Callback(event, data)
     */
    addListener(callback) {
        if (typeof callback === 'function') {
            this.listeners.add(callback);
        }
    }

    /**
     * Remove listener
     * @param {Function} callback - Callback a remover
     */
    removeListener(callback) {
        this.listeners.delete(callback);
    }

    /**
     * Notifica todos os listeners
     * @param {string} event - Nome do evento
     * @param {*} data - Dados do evento
     */
    notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('[NotificationPushService] Erro no listener:', error);
            }
        });
    }

    /**
     * Escapa HTML para prevenir XSS
     * @param {string} str - String para escapar
     * @returns {string}
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Retorna string de tempo relativo
     * @param {number} timestamp - Timestamp em ms
     * @returns {string}
     */
    getTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'agora';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
        return `${Math.floor(seconds / 86400)}d`;
    }

    /**
     * Toggle som
     * @param {boolean} enabled - Habilitar ou não
     */
    setSoundEnabled(enabled) {
        this.config.soundEnabled = !!enabled;
        this.saveUserPreferences();
    }

    /**
     * Toggle vibração
     * @param {boolean} enabled - Habilitar ou não
     */
    setVibrationEnabled(enabled) {
        this.config.vibrationEnabled = !!enabled;
        this.saveUserPreferences();
    }

    /**
     * Destroi o serviço
     */
    destroy() {
        this.closeAll();
        this.pauseAllSounds();
        this.listeners.clear();
        this.pendingGroups.clear();
        
        if (this.toastContainer) {
            this.toastContainer.remove();
        }

        console.log('[NotificationPushService] Serviço destruído');
    }
}

// Instanciar e expor globalmente quando DOM estiver pronto
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.notificationPushService = new NotificationPushService();
        });
    } else {
        // DOM já está pronto
        window.notificationPushService = new NotificationPushService();
    }
}
