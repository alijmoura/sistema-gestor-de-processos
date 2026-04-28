/**
 * @file localCalendarService.js
 * @description Serviço de agenda local independente (sem Google Calendar)
 */

class LocalCalendarService {
    constructor() {
        this.events = [];
        this.isInitialized = false;
        this.initializeAsync();
    }

    /**
     * Inicialização assíncrona
     */
    async initializeAsync() {
        try {
            console.log(' Inicializando Local Calendar Service...');
            
            // Aguardar dependências
            await this.waitForDependencies();
            
            // Carregar eventos do Firestore
            await this.loadEvents();
            
            this.isInitialized = true;
            console.log(' Local Calendar Service inicializado');
            
        } catch (error) {
            console.error(' Erro ao inicializar Local Calendar Service:', error);
        }
    }

    /**
     * Aguarda dependências necessárias
     */
    async waitForDependencies() {
        return new Promise((resolve) => {
            const checkDeps = () => {
                if (window.eventsDataService && window.firebase?.auth) {
                    resolve();
                } else {
                    setTimeout(checkDeps, 100);
                }
            };
            checkDeps();
        });
    }

    /**
     * Verifica se o serviço está pronto
     */
    isReady() {
        return this.isInitialized && window.firebase?.auth()?.currentUser;
    }

    /**
     * Carrega eventos do Firestore
     */
    async loadEvents() {
        if (!window.eventsDataService) return;

        try {
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 1); // 1 mês atrás
            
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + 6); // 6 meses à frente

            this.events = await window.eventsDataService.getEventsByPeriod(
                startDate.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0]
            );

            console.log(` ${this.events.length} eventos carregados`);
            
        } catch (error) {
            console.error(' Erro ao carregar eventos:', error);
            this.events = [];
        }
    }

    /**
     * Lista eventos por período
     */
    async listEvents(options = {}) {
        const { timeMin, timeMax } = options;
        
        let filteredEvents = [...this.events];

        if (timeMin) {
            const minDate = new Date(timeMin).toISOString().split('T')[0];
            filteredEvents = filteredEvents.filter(event => event.startDate >= minDate);
        }

        if (timeMax) {
            const maxDate = new Date(timeMax).toISOString().split('T')[0];
            filteredEvents = filteredEvents.filter(event => event.startDate <= maxDate);
        }

        return filteredEvents.sort((a, b) => {
            const dateA = new Date(`${a.startDate}T${a.startTime || '00:00'}`);
            const dateB = new Date(`${b.startDate}T${b.startTime || '00:00'}`);
            return dateA - dateB;
        });
    }

    /**
     * Cria novo evento
     */
    async createEvent(eventData) {
        if (!window.eventsDataService) {
            throw new Error('Events Data Service não disponível');
        }

        try {
            // Formatar dados do evento
            const formattedEvent = this.formatEventForStorage(eventData);
            
            // Criar no Firestore
            const eventId = await window.eventsDataService.createEvent(formattedEvent);
            
            // Adicionar à lista local
            const newEvent = { ...formattedEvent, id: eventId };
            this.events.push(newEvent);
            
            console.log(' Evento criado:', eventId);
            return { id: eventId, ...newEvent };
            
        } catch (error) {
            console.error(' Erro ao criar evento:', error);
            throw error;
        }
    }

    /**
     * Atualiza evento existente
     */
    async updateEvent(eventId, eventData) {
        if (!window.eventsDataService) {
            throw new Error('Events Data Service não disponível');
        }

        try {
            // Formatar dados do evento
            const formattedEvent = this.formatEventForStorage(eventData);
            
            // Atualizar no Firestore
            await window.eventsDataService.updateEvent(eventId, formattedEvent);
            
            // Atualizar na lista local
            const eventIndex = this.events.findIndex(e => e.id === eventId);
            if (eventIndex !== -1) {
                this.events[eventIndex] = { ...this.events[eventIndex], ...formattedEvent };
            }
            
            console.log(' Evento atualizado:', eventId);
            return { id: eventId, ...formattedEvent };
            
        } catch (error) {
            console.error(' Erro ao atualizar evento:', error);
            throw error;
        }
    }

    /**
     * Exclui evento
     */
    async deleteEvent(eventId) {
        if (!window.eventsDataService) {
            throw new Error('Events Data Service não disponível');
        }

        try {
            // Excluir do Firestore
            await window.eventsDataService.deleteEvent(eventId);
            
            // Remover da lista local
            this.events = this.events.filter(e => e.id !== eventId);
            
            console.log(' Evento excluído:', eventId);
            return true;
            
        } catch (error) {
            console.error(' Erro ao excluir evento:', error);
            throw error;
        }
    }

    /**
     * Cria evento a partir de um contrato
     */
    async createEventFromContract(contractData, eventData) {
        try {
            const eventToCreate = {
                title: eventData.title || `Compromisso: ${contractData.clientePrincipal}`,
                description: eventData.description || `Compromisso relacionado ao contrato ${contractData.empreendimento}`,
                startDate: eventData.startDate,
                endDate: eventData.endDate || eventData.startDate,
                startTime: eventData.startTime,
                endTime: eventData.endTime,
                allDay: eventData.allDay || false,
                location: eventData.location || '',
                contractId: contractData.id,
                clienteName: contractData.clientePrincipal,
                empreendimento: contractData.empreendimento,
                reminders: eventData.reminders || [60], // 1 hora antes por padrão
                attendees: eventData.attendees || [],
                eventType: eventData.eventType || 'assinatura',
                bookingLink: eventData.bookingLink || null,
                status: 'confirmed'
            };

            return await this.createEvent(eventToCreate);
            
        } catch (error) {
            console.error(' Erro ao criar evento do contrato:', error);
            throw error;
        }
    }

    /**
     * Busca eventos por contrato
     */
    async getEventsByContract(contractId) {
        try {
            return this.events.filter(event => event.contractId === contractId);
        } catch (error) {
            console.error(' Erro ao buscar eventos por contrato:', error);
            return [];
        }
    }

    /**
     * Formata evento para armazenamento
     */
    formatEventForStorage(eventData) {
        return {
            title: eventData.title,
            description: eventData.description || '',
            startDate: eventData.startDate,
            endDate: eventData.endDate || eventData.startDate,
            startTime: eventData.allDay ? null : eventData.startTime,
            endTime: eventData.allDay ? null : eventData.endTime,
            allDay: Boolean(eventData.allDay),
            location: eventData.location || '',
            contractId: eventData.contractId || null,
            clienteName: eventData.clienteName || '',
            empreendimento: eventData.empreendimento || '',
            attendees: Array.isArray(eventData.attendees) ? eventData.attendees : [],
            reminders: Array.isArray(eventData.reminders) ? eventData.reminders : [60],
            eventType: eventData.eventType || 'outro',
            bookingLink: eventData.bookingLink || null,
            status: eventData.status || 'confirmed',
            visibility: eventData.visibility || 'default'
        };
    }

    /**
     * Formata evento vindo do Firestore para uso na UI
     */
    formatEventFromStorage(eventData) {
        return {
            id: eventData.id,
            title: eventData.title,
            description: eventData.description || '',
            startDate: eventData.startDate,
            endDate: eventData.endDate || eventData.startDate,
            startTime: eventData.startTime,
            endTime: eventData.endTime,
            allDay: Boolean(eventData.allDay),
            location: eventData.location || '',
            contractId: eventData.contractId,
            clienteName: eventData.clienteName || '',
            empreendimento: eventData.empreendimento || '',
            attendees: eventData.attendees || [],
            reminders: eventData.reminders || [],
            eventType: eventData.eventType || 'outro',
            bookingLink: eventData.bookingLink || null,
            status: eventData.status || 'confirmed',
            createdAt: eventData.createdAt,
            updatedAt: eventData.updatedAt
        };
    }

    /**
     * Sincroniza eventos (recarrega do Firestore)
     */
    async syncEvents() {
        try {
            console.log(' Sincronizando eventos...');
            await this.loadEvents();
            return { success: true, message: 'Eventos sincronizados com sucesso' };
        } catch (error) {
            console.error(' Erro na sincronização:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtém estatísticas do serviço
     */
    getStats() {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        
        const todayEvents = this.events.filter(event => event.startDate === today);
        const upcomingEvents = this.events.filter(event => event.startDate > today);
        const pastEvents = this.events.filter(event => event.startDate < today);

        return {
            isInitialized: this.isInitialized,
            isReady: this.isReady(),
            totalEvents: this.events.length,
            todayEvents: todayEvents.length,
            upcomingEvents: upcomingEvents.length,
            pastEvents: pastEvents.length,
            currentUser: window.firebase?.auth()?.currentUser?.email || null
        };
    }

    /**
     * Busca eventos próximos (para notificações)
     */
    getUpcomingEvents(hoursAhead = 24) {
        const now = new Date();
        const futureTime = new Date(now.getTime() + (hoursAhead * 60 * 60 * 1000));

        return this.events.filter(event => {
            if (event.allDay) {
                // Para eventos de dia inteiro, considerar apenas a data
                const eventDate = new Date(event.startDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                eventDate.setHours(0, 0, 0, 0);
                
                return eventDate >= today && eventDate <= futureTime;
            } else if (event.startTime) {
                // Para eventos com horário específico
                const eventDateTime = new Date(`${event.startDate}T${event.startTime}`);
                return eventDateTime >= now && eventDateTime <= futureTime;
            }
            
            return false;
        });
    }

    /**
     * Obtém eventos de um dia específico
     */
    getEventsForDate(date) {
        const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
        
        return this.events.filter(event => {
            return event.startDate === dateStr || 
                   (event.endDate && event.startDate <= dateStr && dateStr <= event.endDate);
        });
    }

    /**
     * Limpa cache local e recarrega
     */
    async refresh() {
        this.events = [];
        await this.loadEvents();
    }
}

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        console.log(' Inicializando Local Calendar Service...');
        window.localCalendarService = new LocalCalendarService();
    }, 800);
});

// Exposição global
window.LocalCalendarService = LocalCalendarService;

console.log(' Local Calendar Service carregado');

// Exemplo de uso:
/*
// Criar evento simples
const event = await window.localCalendarService.createEvent({
    title: 'Reunião com cliente',
    startDate: '2025-09-20',
    startTime: '10:00',
    endTime: '11:00',
    location: 'Escritório'
});

// Criar evento a partir de contrato
const contractEvent = await window.localCalendarService.createEventFromContract(
    contract, // objeto do contrato
    {
        title: 'Assinatura de contrato',
        startDate: '2025-09-25',
        startTime: '14:00',
        description: 'Assinatura final do contrato'
    }
);

// Buscar eventos do dia
const todayEvents = window.localCalendarService.getEventsForDate(new Date());

// Buscar eventos por contrato
const contractEvents = await window.localCalendarService.getEventsByContract('contract123');
*/