/**
 * @file eventNotificationsService.js
 * @description Sistema de notificações para eventos da agenda
 */

// Evitar re-declarações se o arquivo for carregado múltiplas vezes
if (typeof window.EventNotificationsService !== 'undefined') {
    console.warn(' EventNotificationsService já foi carregado');
} else {

class EventNotificationsService {
    constructor() {
        this.checkInterval = null;
        this.lastCheck = null;
        this.notificationSettings = {
            enabled: true,
            checkFrequency: 5, // minutos
            reminderTypes: {
                '15min': { enabled: true, message: 'Evento começa em 15 minutos' },
                '1hour': { enabled: true, message: 'Evento começa em 1 hora' },
                '1day': { enabled: true, message: 'Evento amanhã' }
            }
        };
        
        this.initializeAsync();
    }

    /**
     * Inicialização assíncrona
     */
    async initializeAsync() {
        try {
            console.log(' Inicializando Event Notifications Service...');
            
            // Aguardar dependências
            await this.waitForDependencies();
            
            // Carregar configurações
            await this.loadSettings();
            
            // Iniciar verificação periódica
            this.startPeriodicCheck();
            
            console.log(' Event Notifications Service inicializado');
            
        } catch (error) {
            console.error(' Erro ao inicializar Event Notifications Service:', error);
        }
    }

    /**
     * Aguarda dependências necessárias
     */
    async waitForDependencies() {
        return new Promise((resolve) => {
            const checkDeps = () => {
                if (window.eventsDataService && 
                    window.localCalendarService &&
                    window.notificationService && 
                    window.firebase?.auth) {
                    resolve();
                } else {
                    setTimeout(checkDeps, 100);
                }
            };
            checkDeps();
        });
    }

    /**
     * Carrega configurações de notificação
     */
    async loadSettings() {
        try {
            const saved = localStorage.getItem('eventNotificationSettings');
            if (saved) {
                this.notificationSettings = { ...this.notificationSettings, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.warn(' Erro ao carregar configurações de notificação:', error);
        }
    }

    /**
     * Salva configurações de notificação
     */
    saveSettings() {
        try {
            localStorage.setItem('eventNotificationSettings', JSON.stringify(this.notificationSettings));
        } catch (error) {
            console.warn(' Erro ao salvar configurações de notificação:', error);
        }
    }

    /**
     * Inicia verificação periódica de eventos
     */
    startPeriodicCheck() {
        if (!this.notificationSettings.enabled) {
            console.log(' Notificações de eventos desabilitadas');
            return;
        }

        // Limpar verificação anterior se existir
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        // Verificação inicial
        setTimeout(() => this.checkUpcomingEvents(), 2000);

        // Verificação periódica
        const intervalMs = this.notificationSettings.checkFrequency * 60 * 1000;
        this.checkInterval = setInterval(() => {
            this.checkUpcomingEvents();
        }, intervalMs);

        console.log(` Verificação de eventos agendada a cada ${this.notificationSettings.checkFrequency} minutos`);
    }

    /**
     * Para verificação periódica
     */
    stopPeriodicCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * Verifica eventos próximos e envia notificações
     */
    async checkUpcomingEvents() {
        try {
            if (!window.firebase.auth().currentUser) {
                return; // Usuário não está logado
            }

            console.log(' Verificando eventos próximos...');

            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Buscar eventos das próximas 24 horas
            const events = await window.eventsDataService.getEventsByPeriod(
                now.toISOString().split('T')[0],
                tomorrow.toISOString().split('T')[0]
            );

            // Verificar cada evento
            for (const event of events) {
                await this.checkEventNotifications(event, now);
            }

            this.lastCheck = now;

        } catch (error) {
            console.error(' Erro ao verificar eventos próximos:', error);
        }
    }

    /**
     * Verifica notificações para um evento específico
     */
    async checkEventNotifications(event, now) {
        try {
            // Pular eventos cancelados ou de dia inteiro sem horário
            if (event.status === 'cancelled' || 
                (event.allDay && !event.startTime)) {
                return;
            }

            const eventDateTime = this.getEventDateTime(event);
            if (!eventDateTime) return;

            const timeDiff = eventDateTime.getTime() - now.getTime();
            const minutesDiff = Math.floor(timeDiff / (1000 * 60));

            // Verificar se está no passado ou muito longe
            if (minutesDiff < 0 || minutesDiff > 1440) { // 24 horas
                return;
            }

            // Determinar tipo de lembrete
            let reminderType = null;
            if (minutesDiff <= 15 && minutesDiff > 0) {
                reminderType = '15min';
            } else if (minutesDiff <= 60 && minutesDiff > 15) {
                reminderType = '1hour';
            } else if (minutesDiff <= 1440 && minutesDiff > 60) {
                reminderType = '1day';
            }

            if (!reminderType || !this.notificationSettings.reminderTypes[reminderType]?.enabled) {
                return;
            }

            // Verificar se já foi notificado
            const notificationKey = `event_${event.id}_${reminderType}`;
            if (this.hasBeenNotified(notificationKey)) {
                return;
            }

            // Enviar notificação
            await this.sendEventNotification(event, reminderType, minutesDiff);
            
            // Marcar como notificado
            this.markAsNotified(notificationKey);

        } catch (error) {
            console.error(' Erro ao verificar notificações do evento:', error);
        }
    }

    /**
     * Obtém data/hora do evento como objeto Date
     */
    getEventDateTime(event) {
        try {
            if (event.allDay && event.startTime) {
                // Evento de dia inteiro com horário específico
                const dateTime = new Date(`${event.startDate}T${event.startTime}`);
                return dateTime;
            } else if (!event.allDay && event.startTime) {
                // Evento com horário específico
                const dateTime = new Date(`${event.startDate}T${event.startTime}`);
                return dateTime;
            }
            
            return null;
        } catch (error) {
            console.warn(' Erro ao obter data/hora do evento:', error);
            return null;
        }
    }

    /**
     * Envia notificação de evento
     */
    async sendEventNotification(event, reminderType, minutesDiff) {
        try {
            const config = this.notificationSettings.reminderTypes[reminderType];
            
            // Preparar dados da notificação
            const notification = {
                id: `event_${event.id}_${reminderType}_${Date.now()}`,
                type: 'event_reminder',
                title: 'Lembrete de Evento',
                message: this.formatNotificationMessage(event, config.message, minutesDiff),
                priority: this.getNotificationPriority(reminderType),
                data: {
                    eventId: event.id,
                    eventTitle: event.title,
                    eventDateTime: this.getEventDateTime(event)?.toISOString(),
                    reminderType: reminderType,
                    contractId: event.contractId,
                    clienteName: event.clienteName
                },
                actions: [
                    {
                        label: 'Ver Evento',
                        action: 'view_event',
                        eventId: event.id
                    }
                ]
            };

            // Enviar via sistema de notificações existente
            if (window.notificationService && window.notificationService.addNotification) {
                await window.notificationService.addNotification(notification);
                console.log(` Notificação enviada para evento: ${event.title}`);
            }

            // Notificação do browser se permitido
            await this.sendBrowserNotification(event, config.message, minutesDiff);

        } catch (error) {
            console.error(' Erro ao enviar notificação:', error);
        }
    }

    /**
     * Formata mensagem da notificação
     */
    formatNotificationMessage(event, baseMessage, minutesDiff) {
        let timeText = '';
        
        if (minutesDiff <= 15) {
            timeText = `em ${minutesDiff} minuto(s)`;
        } else if (minutesDiff <= 60) {
            timeText = 'em menos de 1 hora';
        } else if (minutesDiff <= 1440) {
            const hours = Math.floor(minutesDiff / 60);
            timeText = `em ${hours} hora(s)`;
        }

        let message = `${event.title} ${timeText}`;
        
        if (event.location) {
            message += ` - Local: ${event.location}`;
        }
        
        if (event.clienteName) {
            message += ` - Cliente: ${event.clienteName}`;
        }

        return message;
    }

    /**
     * Obtém prioridade da notificação
     */
    getNotificationPriority(reminderType) {
        const priorities = {
            '15min': 'high',
            '1hour': 'medium',
            '1day': 'low'
        };
        return priorities[reminderType] || 'medium';
    }

    /**
     * Envia notificação do browser
     */
    async sendBrowserNotification(event, baseMessage, minutesDiff) {
        try {
            // Verificar se notificações estão permitidas
            if (Notification.permission !== 'granted') {
                return;
            }

            const title = 'Lembrete de Evento - Sistema Gestor de Processos';
            const message = this.formatNotificationMessage(event, baseMessage, minutesDiff);
            
            const notification = new Notification(title, {
                body: message,
                icon: './images/logobarra.png',
                badge: './images/logobarra.png',
                tag: `event_${event.id}`,
                requireInteraction: minutesDiff <= 15, // Manter visível se for muito próximo
                data: {
                    eventId: event.id,
                    action: 'view_event'
                }
            });

            // Configurar clique na notificação
            notification.onclick = () => {
                window.focus();
                this.handleNotificationClick('view_event', event.id);
                notification.close();
            };

            // Auto-fechar após 10 segundos (exceto para lembretes de 15 min)
            if (minutesDiff > 15) {
                setTimeout(() => notification.close(), 10000);
            }

        } catch (error) {
            console.warn(' Erro ao enviar notificação do browser:', error);
        }
    }

    /**
     * Manipula clique em notificações
     */
    handleNotificationClick(action, eventId) {
        try {
            if (action === 'view_event' && eventId) {
                // Navegar para a agenda e focar no evento
                const navButton = document.querySelector('[data-page="agenda"]');
                if (navButton) {
                    navButton.click();
                    
                    // Aguardar carregamento da agenda e focar no evento
                    setTimeout(() => {
                        if (window.agendaUI && window.agendaUI.focusEvent) {
                            window.agendaUI.focusEvent(eventId);
                        }
                    }, 1000);
                }
            }
        } catch (error) {
            console.error(' Erro ao processar clique na notificação:', error);
        }
    }

    /**
     * Verifica se já foi notificado
     */
    hasBeenNotified(notificationKey) {
        try {
            const today = new Date().toDateString();
            const notifiedToday = localStorage.getItem(`notified_${today}`);
            
            if (notifiedToday) {
                const notified = JSON.parse(notifiedToday);
                return notified.includes(notificationKey);
            }
            
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Marca como notificado
     */
    markAsNotified(notificationKey) {
        try {
            const today = new Date().toDateString();
            const storageKey = `notified_${today}`;
            
            let notified = [];
            const existing = localStorage.getItem(storageKey);
            if (existing) {
                notified = JSON.parse(existing);
            }
            
            if (!notified.includes(notificationKey)) {
                notified.push(notificationKey);
                localStorage.setItem(storageKey, JSON.stringify(notified));
            }
            
            // Limpar notificações de dias anteriores
            this.cleanupOldNotifications();
            
        } catch (error) {
            console.warn(' Erro ao marcar notificação:', error);
        }
    }

    /**
     * Limpa notificações antigas
     */
    cleanupOldNotifications() {
        try {
            const today = new Date().toDateString();
            const keys = Object.keys(localStorage);
            
            for (const key of keys) {
                if (key.startsWith('notified_') && !key.includes(today)) {
                    localStorage.removeItem(key);
                }
            }
        } catch (error) {
            console.warn(' Erro ao limpar notificações antigas:', error);
        }
    }

    /**
     * Solicita permissão para notificações do browser
     */
    async requestNotificationPermission() {
        try {
            if ('Notification' in window) {
                const permission = await Notification.requestPermission();
                console.log(' Permissão de notificação:', permission);
                return permission === 'granted';
            }
            return false;
        } catch (error) {
            console.error(' Erro ao solicitar permissão de notificação:', error);
            return false;
        }
    }

    /**
     * Atualiza configurações de notificação
     */
    updateSettings(newSettings) {
        this.notificationSettings = { ...this.notificationSettings, ...newSettings };
        this.saveSettings();
        
        // Reiniciar verificação com novas configurações
        if (this.notificationSettings.enabled) {
            this.startPeriodicCheck();
        } else {
            this.stopPeriodicCheck();
        }
    }

    /**
     * Obtém configurações atuais
     */
    getSettings() {
        return { ...this.notificationSettings };
    }

    /**
     * Testa notificação
     */
    async testNotification() {
        try {
            const testEvent = {
                id: 'test_' + Date.now(),
                title: 'Evento de Teste',
                startDate: new Date().toISOString().split('T')[0],
                startTime: new Date(Date.now() + 15 * 60000).toTimeString().slice(0, 5), // 15 min no futuro
                location: 'Local de Teste',
                clienteName: 'Cliente de Teste'
            };

            await this.sendEventNotification(testEvent, '15min', 15);
            return true;
        } catch (error) {
            console.error(' Erro ao testar notificação:', error);
            return false;
        }
    }

    /**
     * Obtém estatísticas de notificações
     */
    getStats() {
        try {
            const today = new Date().toDateString();
            const notifiedToday = localStorage.getItem(`notified_${today}`);
            const todayCount = notifiedToday ? JSON.parse(notifiedToday).length : 0;
            
            return {
                enabled: this.notificationSettings.enabled,
                checkFrequency: this.notificationSettings.checkFrequency,
                lastCheck: this.lastCheck,
                notificationsToday: todayCount,
                nextCheck: this.checkInterval ? new Date(Date.now() + this.notificationSettings.checkFrequency * 60000) : null
            };
        } catch {
            return {
                enabled: false,
                checkFrequency: 0,
                lastCheck: null,
                notificationsToday: 0,
                nextCheck: null
            };
        }
    }

    /**
     * Força verificação imediata
     */
    async forceCheck() {
        console.log(' Verificação forçada de eventos...');
        await this.checkUpcomingEvents();
    }
}

// Extensão para agendaUI para suporte a foco de eventos
if (window.AgendaUI) {
    window.AgendaUI.prototype.focusEvent = function(eventId) {
        try {
            // Encontrar e focar no evento
            const eventElement = document.querySelector(`[data-event-id="${eventId}"]`);
            if (eventElement) {
                eventElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                eventElement.classList.add('event-highlighted');
                
                // Remover destaque após 3 segundos
                setTimeout(() => {
                    eventElement.classList.remove('event-highlighted');
                }, 3000);
                
                // Abrir modal do evento se for clicável
                eventElement.click();
            }
        } catch (error) {
            console.error(' Erro ao focar evento:', error);
        }
    };
}

// CSS para destaque de eventos - inserir estilos no head
const eventNotificationStyles = `
.event-highlighted {
    background-color: #fff3cd !important;
    border: 2px solid #ffc107 !important;
    box-shadow: 0 0 10px rgba(255, 193, 7, 0.5) !important;
    animation: pulse-highlight 1s ease-in-out 3;
}

@keyframes pulse-highlight {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
}

.notification-settings {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem 0;
}

.notification-settings h6 {
    color: var(--primary-color);
    margin-bottom: 0.75rem;
}

.notification-toggle {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
}

.notification-frequency {
    margin-top: 1rem;
}
`;

// Adicionar estilos ao head uma única vez
if (!document.getElementById('event-notification-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'event-notification-styles';
    styleElement.textContent = eventNotificationStyles;
    document.head.appendChild(styleElement);
}

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        console.log(' Inicializando Event Notifications Service...');
        window.eventNotificationsService = new EventNotificationsService();
    }, 1500);
});

// Exposição global
window.EventNotificationsService = EventNotificationsService;

console.log(' Event Notifications Service carregado');

} // Fechar bloco de proteção contra re-declaração

// Exemplo de uso:
/*
// Testar notificação
await window.eventNotificationsService.testNotification();

// Obter estatísticas
const stats = window.eventNotificationsService.getStats();
console.log('Estatísticas:', stats);

// Atualizar configurações
window.eventNotificationsService.updateSettings({
    enabled: true,
    checkFrequency: 10,
    reminderTypes: {
        '15min': { enabled: true, message: 'Evento muito próximo!' },
        '1hour': { enabled: false },
        '1day': { enabled: true, message: 'Evento amanhã' }
    }
});

// Solicitar permissão do browser
await window.eventNotificationsService.requestNotificationPermission();

// Verificação forçada
await window.eventNotificationsService.forceCheck();
*/