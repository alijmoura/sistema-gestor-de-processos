// =============================================================================
// NOTIFICATION UI - Interface de Usuário para Sistema de Notificações
// =============================================================================

class NotificationUI {
    constructor() {
        this.isPanelVisible = false;
        this.notificationBtn = null;
        this.notificationList = null;
        this.notificationBadge = null;
        this.settingsModal = null;
        this.notificationService = null;
        this.offcanvasElement = null;
        this.offcanvasInstance = null;
        this.baseUnreadCount = 0;
        this.externalUnreadCount = 0;
        
        this.init();
    }

    /**
     * Inicializa a interface de notificações
     */
    init() {
        // Aguardar DOM estar pronto
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeUI());
        } else {
            this.initializeUI();
        }
    }

    /**
     * Inicialização da UI
     */
    async initializeUI() {
        const ready = await this.waitForEssentialElements();
        if (!ready) {
            console.error('NotificationUI não pôde localizar os elementos essenciais no DOM. Inicialização abortada.');
            return;
        }

        this.setupDOM();
        this.bindEvents();
        
        // Tentar conectar com o serviço de notificações
        await this.connectToService();
        
        // Se não conseguiu conectar, funcionar em modo básico
        if (!this.notificationService) {
            this.renderBasicUI();
            this.baseUnreadCount = 0;
            this.updateGeneralTabBadge();
            this.refreshCombinedBadge();
        } else {
            await this.updateBadgeCount();
        }
        
        console.log('NotificationUI inicializada');

        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('notification-ui:ready'));
        }
    }

    /**
     * Tenta conectar com o serviço de notificações
     */
    async connectToService() {
        let attempts = 0;
        while (attempts < 30) {
            try {
                // Tentar importação dinâmica
                const module = await import('./notificationServiceSimple.js');
                if (module.notificationService) {
                    this.notificationService = module.notificationService;
                    console.log(' Conectado ao NotificationService');
                    return;
                }
            } catch {
                // Ignore - tentará novamente
            }
            
            // Tentar acesso global
            if (window.notificationService) {
                this.notificationService = window.notificationService;
                console.log(' Conectado ao NotificationService (global)');
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        console.log(' NotificationService não disponível - funcionando em modo básico');
    }

    /**
     * Renderiza UI básica quando o serviço não está disponível
     */
    renderBasicUI() {
        if (this.notificationList) {
            this.notificationList.innerHTML = `
                <div class="notification-empty">
                    <i class="bi bi-info-circle text-info"></i>
                    <p>Sistema de notificações carregando...</p>
                </div>
            `;
        }
        
        if (this.notificationBadge) {
            this.notificationBadge.style.display = 'none';
        }
    }

    /**
     * Configura as referências do DOM
     */
    setupDOM() {
        this.notificationBtn = document.getElementById('notification-btn');
        this.notificationList = document.getElementById('notification-list');
        this.notificationBadge = document.getElementById('notification-badge');
        this.settingsModal = document.getElementById('notification-settings-modal');
        this.offcanvasElement = document.getElementById('notification-center');
        
        // Verificar se os elementos essenciais existem
        if (!this.notificationBtn || !this.notificationList || !this.notificationBadge || !this.offcanvasElement) {
            console.error(' Elementos essenciais de notificação não encontrados no DOM:', {
                notificationBtn: !!this.notificationBtn,
                notificationList: !!this.notificationList,
                notificationBadge: !!this.notificationBadge,
                offcanvasElement: !!this.offcanvasElement
            });
            return;
        }
        
        console.log(' Elementos de notificação configurados com sucesso');

        // IMPORTANTE: Garantir que o offcanvas está sempre no body, não dentro de modais
        // Isso evita o bug onde ele aparece dentro do modal de detalhes do processo
        if (this.offcanvasElement && this.offcanvasElement.parentElement !== document.body) {
            console.log(' Movendo offcanvas de notificações para o body (prevenir bug de modal)');
            document.body.appendChild(this.offcanvasElement);
        }

        if (window.bootstrap && window.bootstrap.Offcanvas) {
            this.offcanvasInstance = window.bootstrap.Offcanvas.getOrCreateInstance(this.offcanvasElement);
        }
    }

    /**
     * Vincula eventos aos elementos da interface
     */
    bindEvents() {
        // Botão principal de notificações
        // O botão tem data-bs-toggle="offcanvas" no HTML, então o Bootstrap
        // já gerencia a abertura. Vamos apenas garantir que funcione corretamente.
        const notificationBtn = document.getElementById('notification-btn');
        if (notificationBtn) {
            // Remover listener duplicado se existir
            notificationBtn.removeEventListener('click', this._handleNotificationBtnClick);
            
            // Adicionar listener para garantir que o offcanvas seja movido para o body
            // antes de abrir (evita que apareça dentro de modais)
            this._handleNotificationBtnClick = () => {
                // Garantir que o offcanvas está no body, não dentro de um modal
                if (this.offcanvasElement && this.offcanvasElement.parentElement !== document.body) {
                    console.warn(' Offcanvas estava dentro de outro elemento, movendo para body');
                    document.body.appendChild(this.offcanvasElement);
                }
            };
            
            // Usar capturing phase para executar ANTES do Bootstrap abrir o offcanvas
            notificationBtn.addEventListener('click', this._handleNotificationBtnClick, true);
        }

        if (this.offcanvasElement && window.bootstrap && window.bootstrap.Offcanvas) {
            // Listener para quando o offcanvas começar a abrir
            this.offcanvasElement.addEventListener('show.bs.offcanvas', () => {
                this.isPanelVisible = true;
                console.log(' Offcanvas de notificações começando a abrir');
            });
            
            // Listener para quando o offcanvas estiver totalmente aberto
            this.offcanvasElement.addEventListener('shown.bs.offcanvas', () => {
                this.onPanelShown();
                console.log(' Offcanvas de notificações totalmente aberto');
            });
            
            // Listener para quando o offcanvas for fechado
            this.offcanvasElement.addEventListener('hidden.bs.offcanvas', () => {
                this.isPanelVisible = false;
                console.log(' Offcanvas de notificações fechado');
            });
        }

        // Marcar todas como lidas
        const markAllReadBtn = document.getElementById('mark-all-read-btn');
        if (markAllReadBtn) {
            markAllReadBtn.addEventListener('click', () => {
                this.markAllAsRead();
            });
        }

        // Botão de configurações
        const settingsBtn = document.getElementById('notification-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.openSettingsModal();
            });
        }

        // Limpar notificações antigas
        const clearOldBtn = document.getElementById('clear-old-notifications-btn');
        if (clearOldBtn) {
            clearOldBtn.addEventListener('click', () => {
                this.clearOldNotifications();
            });
        }

    // Eventos do modal de configurações
        this.bindSettingsModalEvents();

        // Escutar novas notificações do serviço
        if (this.notificationService && typeof this.notificationService.onNotificationReceived === 'function') {
            this.notificationService.onNotificationReceived((notification) => {
                this.handleNewNotification(notification);
            });
        }
    }

    /**
     * Vincula eventos do modal de configurações
     */
    bindSettingsModalEvents() {
        // Tenta pegar o modal novamente caso não tenha sido encontrado no setupDOM
        if (!this.settingsModal) {
            this.settingsModal = document.getElementById('notification-settings-modal');
        }
        
        if (!this.settingsModal) {
            console.warn(' Modal de configurações de notificações não encontrado');
            return;
        }

        // Botão salvar configurações
        const saveBtn = document.getElementById('save-notification-settings-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveSettings();
            });
        }

        // Botões de fechar modal (data-dismiss="modal")
        const closeButtons = this.settingsModal.querySelectorAll('[data-dismiss="modal"]');
        if (closeButtons.length > 0) {
            closeButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.closeSettingsModal();
                });
            });
            console.log(` ${closeButtons.length} botão(ões) de fechar vinculado(s) ao modal de notificações`);
        }
        // Nota: botões [data-dismiss="modal"] são opcionais no modal de notificações

        // Fechar modal ao clicar no backdrop
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) {
                this.closeSettingsModal();
            }
        });
    }

    /**
     * Abre o painel de notificações
     */
    showPanel() {
        if (!this.offcanvasElement) {
            this.setupDOM();
        }

        if (!this.offcanvasElement || !window.bootstrap || !window.bootstrap.Offcanvas) {
            return;
        }

        if (!this.offcanvasInstance) {
            this.offcanvasInstance = window.bootstrap.Offcanvas.getOrCreateInstance(this.offcanvasElement);
        }
        this.offcanvasInstance.show();
    }

    /**
     * Aguarda elementos essenciais estarem disponíveis no DOM
     */
    async waitForEssentialElements() {
        const selectors = [
            '#notification-btn',
            '#notification-list',
            '#notification-badge',
            '#notification-center'
        ];

        const maxAttempts = 40; // Aumentado de 25 para 40
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const missing = selectors.filter(selector => !document.querySelector(selector));
            if (missing.length === 0) {
                console.log(' Elementos essenciais do Centro de Notificações encontrados');
                return true;
            }

            if (attempt === 0 || attempt % 10 === 0) {
                console.log(` Aguardando elementos: ${missing.join(', ')} (tentativa ${attempt + 1}/${maxAttempts})`);
            }

            await new Promise(resolve => setTimeout(resolve, 100 + attempt * 25)); // Aumentado intervalo
        }

        console.warn(' Elementos essenciais do Centro de Notificações não foram encontrados após múltiplas tentativas.');
        return false;
    }

    /**
     * Fecha o painel de notificações
     */
    hidePanel() {
        if (this.offcanvasInstance) {
            this.offcanvasInstance.hide();
        }
    }

    /**
     * Ações ao exibir o painel
     */
    onPanelShown() {
        // Marcar como visualizadas (mas não como lidas)
        this.markAsViewed();

        // Recarregar notificações para mostrar as mais recentes
        this.loadNotifications();
    }

    /**
     * Carrega e exibe as notificações
     */
    async loadNotifications() {
        if (!this.notificationService) {
            this.renderBasicUI();
            return;
        }

        try {
            const notifications = await this.notificationService.getAllNotifications();
            this.renderNotifications(notifications);
        } catch (error) {
            console.error('Erro ao carregar notificações:', error);
            this.renderError();
        }
    }

    /**
     * Renderiza a lista de notificações
     */
    renderNotifications(notifications) {
        if (!this.notificationList) return;

        this.notificationList.innerHTML = '';

        if (notifications.length === 0) {
            this.renderEmptyState();
            return;
        }

        notifications.forEach(notification => {
            const notificationElement = this.createNotificationElement(notification);
            this.notificationList.appendChild(notificationElement);
        });
    }

    /**
     * Cria um elemento de notificação
     */
    createNotificationElement(notification) {
        const div = document.createElement('div');
        div.className = `notification-item ${notification.read ? '' : 'unread'} notification-priority-${notification.priority}`;
        div.dataset.notificationId = notification.id;

        const timeAgo = this.getTimeAgo(notification.createdAt);
        
        div.innerHTML = `
            <div class="notification-title">${notification.title}</div>
            <div class="notification-message">${notification.message}</div>
            <div class="notification-time">${timeAgo}</div>
            <div class="notification-actions">
                ${!notification.read ? '<button class="btn btn-sm btn-outline-primary mark-read-btn" title="Marcar como lida"><i class="bi bi-check"></i></button>' : ''}
                <button class="btn btn-sm btn-outline-danger delete-btn" title="Excluir"><i class="bi bi-trash"></i></button>
            </div>
        `;

        // Eventos para ações individuais
        this.bindNotificationActions(div, notification);

        return div;
    }

    /**
     * Vincula eventos às ações de uma notificação
     */
    bindNotificationActions(element, notification) {
        // Marcar como lida
        const markReadBtn = element.querySelector('.mark-read-btn');
        if (markReadBtn) {
            markReadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.markAsRead(notification.id);
            });
        }

        // Excluir notificação
        const deleteBtn = element.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteNotification(notification.id);
            });
        }

        // Clique na notificação (marcar como lida se não estiver)
        element.addEventListener('click', () => {
            if (!notification.read) {
                this.markAsRead(notification.id);
            }
        });
    }

    /**
     * Renderiza o estado vazio (sem notificações)
     */
    renderEmptyState() {
        this.notificationList.innerHTML = `
            <div class="notification-empty">
                <i class="bi bi-bell-slash"></i>
                <p>Nenhuma notificação no momento</p>
            </div>
        `;
    }

    /**
     * Renderiza estado de erro
     */
    renderError() {
        this.notificationList.innerHTML = `
            <div class="notification-empty">
                <i class="bi bi-exclamation-triangle text-warning"></i>
                <p>Erro ao carregar notificações</p>
                <button class="btn btn-sm btn-outline-primary" onclick="window.notificationUI.loadNotifications()">
                    Tentar novamente
                </button>
            </div>
        `;
    }

    /**
     * Atualiza o contador no badge principal (somando integrações externas)
     */
    async updateBadgeCount(forceCount) {
        if (typeof forceCount === 'number') {
            this.baseUnreadCount = Math.max(0, forceCount);
        } else if (this.notificationService) {
            try {
                const unreadCount = await this.notificationService.getNotificationCount();
                this.baseUnreadCount = Math.max(0, unreadCount || 0);
            } catch (error) {
                console.error('Erro ao atualizar contador de notificações:', error);
                return;
            }
        } else {
            this.baseUnreadCount = 0;
        }

        this.updateGeneralTabBadge();
        this.refreshCombinedBadge();
    }

    /**
     * Atualiza badge da aba geral
     */
    updateGeneralTabBadge() {
        const generalBadge = document.getElementById('notification-tab-general-count');
        if (!generalBadge) return;

        generalBadge.textContent = this.baseUnreadCount;
        if (this.baseUnreadCount > 0) {
            generalBadge.classList.remove('d-none');
        } else {
            generalBadge.classList.add('d-none');
        }
    }

    /**
     * Permite que integrações externas (ex.: WhatsApp) adicionem contagem ao badge principal
     */
    setExternalUnreadCount(count) {
        this.externalUnreadCount = Math.max(0, Number(count) || 0);

        const whatsappBadge = document.getElementById('notification-tab-whatsapp-count');
        if (whatsappBadge) {
            whatsappBadge.textContent = this.externalUnreadCount;
            if (this.externalUnreadCount > 0) {
                whatsappBadge.classList.remove('d-none');
            } else {
                whatsappBadge.classList.add('d-none');
            }
        }

        this.refreshCombinedBadge();
    }

    /**
     * Atualiza badge total mostrado no ícone do header
     */
    refreshCombinedBadge() {
        if (!this.notificationBadge) return;

        const total = (this.baseUnreadCount || 0) + (this.externalUnreadCount || 0);

        if (total > 0) {
            this.notificationBadge.textContent = total > 99 ? '99+' : total;
            this.notificationBadge.classList.remove('d-none');
            this.notificationBadge.style.display = 'inline-block';
        } else {
            this.notificationBadge.classList.add('d-none');
            this.notificationBadge.style.display = 'none';
        }

        const notificationBtn = document.getElementById('notification-btn');
        if (notificationBtn) {
            notificationBtn.classList.toggle('has-notifications', total > 0);
        }
    }

    /**
     * Marca todas as notificações como lidas
     */
    async markAllAsRead() {
        if (!this.notificationService) return;
        
        try {
            await this.notificationService.markAllAsRead();
            this.loadNotifications();
            await this.updateBadgeCount();
            
            // Mostrar feedback
            this.showToast('Todas as notificações foram marcadas como lidas', 'success');
        } catch (error) {
            console.error('Erro ao marcar todas como lidas:', error);
            this.showToast('Erro ao marcar notificações como lidas', 'error');
        }
    }

    /**
     * Marca uma notificação específica como lida
     */
    async markAsRead(notificationId) {
        if (!this.notificationService) return;
        
        try {
            await this.notificationService.markAsRead(notificationId);
            this.loadNotifications();
            await this.updateBadgeCount();
        } catch (error) {
            console.error('Erro ao marcar notificação como lida:', error);
        }
    }

    /**
     * Marca notificações como visualizadas (não necessariamente lidas)
     */
    async markAsViewed() {
        if (!this.notificationService) return;
        
        try {
            // Nota: markAsViewed não existe no serviço simplificado
            // Substituindo por markAllAsRead temporariamente
            await this.notificationService.markAllAsRead();
        } catch (error) {
            console.error('Erro ao marcar como visualizadas:', error);
        }
    }

    /**
     * Exclui uma notificação
     */
    async deleteNotification(notificationId) {
        if (!this.notificationService) return;
        
        // Usa modal de confirmação padronizado se disponível
        const confirmed = window.uiHelpers 
            ? await window.uiHelpers.confirmDelete('esta notificação')
            : confirm('Tem certeza que deseja excluir esta notificação?');
            
        if (!confirmed) {
            return;
        }

        try {
            await this.notificationService.deleteNotification(notificationId);
            this.loadNotifications();
            await this.updateBadgeCount();
            
            this.showToast('Notificação excluída com sucesso', 'success');
        } catch (error) {
            console.error('Erro ao excluir notificação:', error);
            this.showToast('Erro ao excluir notificação', 'error');
        }
    }

    /**
     * Limpa notificações antigas
     */
    async clearOldNotifications() {
        if (!this.notificationService) return;
        
        if (!confirm('Tem certeza que deseja limpar todas as notificações antigas?')) {
            return;
        }

        try {
            const count = await this.notificationService.clearOldNotifications();
            this.loadNotifications();
            await this.updateBadgeCount();
            
            this.showToast(`${count} notificações antigas foram removidas`, 'success');
        } catch (error) {
            console.error('Erro ao limpar notificações antigas:', error);
            this.showToast('Erro ao limpar notificações antigas', 'error');
        }
    }

    /**
     * Lida com nova notificação recebida
     */
    handleNewNotification(notification) {
        // Atualizar contador
        this.updateBadgeCount();
        
        // Se o painel estiver aberto, recarregar
        if (this.isPanelVisible) {
            this.loadNotifications();
        }
        
        // Mostrar notificação desktop se habilitada
        this.showDesktopNotification(notification);
        
        // Reproduzir som se habilitado
        this.playNotificationSound();
        
        // Animar o botão de notificação
        this.animateNotificationButton();
    }

    /**
     * Mostra notificação desktop
     */
    showDesktopNotification(notification) {
        if (!this.notificationService) return;
        
        const settings = this.notificationService.getSettings();
        
        if (settings.desktop && 'Notification' in window) {
            if (Notification.permission === 'granted') {
                new Notification(notification.title, {
                    body: notification.message,
                    icon: '/images/logologin.png',
                    tag: notification.id
                });
            }
        }
    }

    /**
     * Reproduz som de notificação
     */
    playNotificationSound() {
        if (!this.notificationService) return;
        
        const settings = this.notificationService.getSettings();
        
        if (settings.sound) {
            // Criar um beep simples usando Web Audio API
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        }
    }

    /**
     * Anima o botão de notificação
     */
    animateNotificationButton() {
        const notificationBtn = document.getElementById('notification-btn');
        if (notificationBtn) {
            notificationBtn.style.animation = 'none';
            notificationBtn.offsetHeight; // trigger reflow
            notificationBtn.style.animation = 'pulse-badge 0.5s ease-in-out';
        }
    }

    /**
     * Abre o modal de configurações
     */
    openSettingsModal() {
        if (this.settingsModal) {
            this.loadSettingsToModal();
            if (typeof window.openModal === 'function') {
                window.openModal(this.settingsModal);
            } else {
                this.settingsModal.style.display = 'block';
            }
            this.hidePanel(); // Fechar painel se estiver aberto
        }
    }

    /**
     * Fecha o modal de configurações
     */
    closeSettingsModal() {
        if (this.settingsModal) {
            if (typeof window.closeModal === 'function') {
                window.closeModal(this.settingsModal);
            } else {
                this.settingsModal.style.display = 'none';
            }
        }
    }

    /**
     * Carrega configurações no modal
     */
    loadSettingsToModal() {
        if (!this.notificationService) return;
        
        const settings = this.notificationService.getSettings();
        
        // Carregar valores nos controles
        const desktopToggle = document.getElementById('desktop-notifications-toggle');
        const soundToggle = document.getElementById('sound-notifications-toggle');
        const autoCheckToggle = document.getElementById('auto-check-toggle');
        const intervalSelect = document.getElementById('check-interval-select');
        const systemEnabledToggle = document.getElementById('system-enabled-toggle');
        
        if (desktopToggle) desktopToggle.checked = settings.desktop;
        if (soundToggle) soundToggle.checked = settings.sound;
        if (autoCheckToggle) autoCheckToggle.checked = settings.autoCheck;
        if (intervalSelect) intervalSelect.value = settings.checkInterval;
        if (systemEnabledToggle) systemEnabledToggle.checked = settings.enabled;
    }

    /**
     * Salva as configurações do modal
     */
    async saveSettings() {
        if (!this.notificationService) return;
        
        const settings = {
            enabled: document.getElementById('system-enabled-toggle')?.checked || false,
            desktop: document.getElementById('desktop-notifications-toggle')?.checked || false,
            sound: document.getElementById('sound-notifications-toggle')?.checked || false,
            autoCheck: document.getElementById('auto-check-toggle')?.checked || false,
            checkInterval: parseInt(document.getElementById('check-interval-select')?.value) || 5
        };

        try {
            await this.notificationService.updateSettings(settings);
            this.closeSettingsModal();
            this.setupAutoCheck(); // Reconfigurar verificação automática
            
            // Solicitar permissão para notificações desktop se habilitadas
            if (settings.desktopNotifications && 'Notification' in window) {
                if (Notification.permission === 'default') {
                    await Notification.requestPermission();
                }
            }
            
            this.showToast('Configurações salvas com sucesso', 'success');
        } catch (error) {
            console.error('Erro ao salvar configurações:', error);
            this.showToast('Erro ao salvar configurações', 'error');
        }
    }

    /**
     * Configura verificação automática
     */
    setupAutoCheck() {
        if (!this.notificationService) return;
        
        // Limpar interval anterior se existir
        if (this.autoCheckInterval) {
            clearInterval(this.autoCheckInterval);
        }

        const settings = this.notificationService.getSettings();
        
        if (settings.autoCheck) {
            const intervalMs = settings.checkInterval * 60 * 1000; // converter para ms
            
            this.autoCheckInterval = setInterval(() => {
                this.checkForNewNotifications();
            }, intervalMs);
        }
    }

    /**
     * Verifica por novas notificações
     */
    async checkForNewNotifications() {
        if (!this.notificationService) return;
        
        try {
            // Nota: checkForNewNotifications não existe no serviço simplificado
            // Apenas atualizar a contagem
            this.updateBadgeCount();
        } catch (error) {
            console.error('Erro ao verificar novas notificações:', error);
        }
    }

    /**
     * Calcula tempo decorrido em formato amigável
     */
    getTimeAgo(timestamp) {
        const now = new Date();
        const notificationTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const diffMs = now - notificationTime;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Agora';
        if (diffMins < 60) return `${diffMins}m atrás`;
        if (diffHours < 24) return `${diffHours}h atrás`;
        if (diffDays < 7) return `${diffDays}d atrás`;
        
        return notificationTime.toLocaleDateString('pt-BR');
    }

    /**
     * Mostra toast de feedback
     */
    showToast(message, type = 'info') {
        // Usar o sistema de notificações existente se disponível
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`Toast [${type}]: ${message}`);
        }
    }

    /**
     * Método público para criar notificação programaticamente
     */
    async createNotification(title, message, priority = 'low', data = {}) {
        if (!this.notificationService) return;
        
        try {
            await this.notificationService.createNotification({
                title,
                message,
                priority,
                ...data
            });
            this.updateBadgeCount();
        } catch (error) {
            console.error('Erro ao criar notificação:', error);
        }
    }

    /**
     * Método público para obter estatísticas
     */
    async getStats() {
        if (!this.notificationService) return null;
        
        try {
            // Nota: getNotificationStats não existe no serviço simplificado
            const notifications = await this.notificationService.getAllNotifications();
            return {
                total: notifications.length,
                unread: notifications.filter(n => !n.read).length,
                read: notifications.filter(n => n.read).length
            };
        } catch (error) {
            console.error('Erro ao obter estatísticas:', error);
            return null;
        }
    }

    /**
     * Limpa recursos quando a instância é destruída
     */
    destroy() {
        if (this.autoCheckInterval) {
            clearInterval(this.autoCheckInterval);
        }
        
        console.log('NotificationUI destruída');
    }
}

// Instância global
let notificationUI = null;

function bootstrapNotificationUI() {
    if (notificationUI) return;

    notificationUI = new NotificationUI();
    window.notificationUI = notificationUI;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapNotificationUI);
} else {
    bootstrapNotificationUI();
}

export { NotificationUI, notificationUI };