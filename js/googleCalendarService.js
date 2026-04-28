/**
 * @file googleCalendarService.js
 * @description Serviço de integração com Google Calendar API
 */

class GoogleCalendarService {
    constructor() {
        this.isInitialized = false;
        this.isAuthenticated = false;
        this.gapi = null;
        this.currentUser = null;
        
        // Configurações da API
        this.CLIENT_ID = null; // Será configurado via localStorage ou Firebase Config
        this.API_KEY = null;
        this.DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'];
        this.SCOPES = 'https://www.googleapis.com/auth/calendar';
        
        // Cache de eventos
        this.eventsCache = new Map();
        this.lastSync = null;
        
        this.initializeAsync();
    }

    /**
     * Inicialização assíncrona do serviço
     */
    async initializeAsync() {
        try {
            console.log(' Inicializando Google Calendar Service...');
            
            // Carregar configurações
            await this.loadConfiguration();
            
            if (!this.CLIENT_ID) {
                console.warn(' Google Calendar: CLIENT_ID não configurado');
                return;
            }
            
            // Carregar Google API
            await this.loadGoogleAPI();
            
            // Inicializar API
            await this.initializeGoogleAPI();
            
            console.log(' Google Calendar Service inicializado');
            this.isInitialized = true;
            
        } catch (error) {
            console.error(' Erro ao inicializar Google Calendar Service:', error);
        }
    }

    /**
     * Carrega configurações do Google API
     */
    async loadConfiguration() {
        try {
            // Tentar carregar do localStorage primeiro (configuração admin)
            this.CLIENT_ID = localStorage.getItem('GOOGLE_CALENDAR_CLIENT_ID');
            this.API_KEY = localStorage.getItem('GOOGLE_CALENDAR_API_KEY');
            
            // Se não encontrar, tentar Firebase Config (futuro)
            if (!this.CLIENT_ID && window.firestoreService) {
                // Implementar busca de configuração no Firestore se necessário
                console.log(' Buscando configurações no Firestore...');
            }
            
            if (this.CLIENT_ID) {
                console.log(' Configurações Google Calendar carregadas');
            }
            
        } catch (error) {
            console.error(' Erro ao carregar configurações:', error);
        }
    }

    /**
     * Carrega a Google API dinamicamente
     */
    async loadGoogleAPI() {
        return new Promise((resolve, reject) => {
            if (window.gapi) {
                this.gapi = window.gapi;
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = () => {
                this.gapi = window.gapi;
                resolve();
            };
            script.onerror = () => reject(new Error('Falha ao carregar Google API'));
            document.head.appendChild(script);
        });
    }

    /**
     * Inicializa a Google API
     */
    async initializeGoogleAPI() {
        return new Promise((resolve, reject) => {
            this.gapi.load('client:auth2', async () => {
                try {
                    await this.gapi.client.init({
                        apiKey: this.API_KEY,
                        clientId: this.CLIENT_ID,
                        discoveryDocs: this.DISCOVERY_DOCS,
                        scope: this.SCOPES
                    });
                    
                    // Verificar se já está autenticado
                    const authInstance = this.gapi.auth2.getAuthInstance();
                    this.isAuthenticated = authInstance.isSignedIn.get();
                    
                    if (this.isAuthenticated) {
                        this.currentUser = authInstance.currentUser.get();
                        console.log(' Usuário já autenticado no Google Calendar');
                    }
                    
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    /**
     * Autentica o usuário no Google
     */
    async authenticate() {
        if (!this.isInitialized) {
            throw new Error('Serviço não inicializado');
        }
        
        try {
            const authInstance = this.gapi.auth2.getAuthInstance();
            const user = await authInstance.signIn();
            
            this.isAuthenticated = true;
            this.currentUser = user;
            
            console.log(' Autenticado no Google Calendar');
            return true;
            
        } catch (error) {
            console.error(' Erro na autenticação:', error);
            throw error;
        }
    }

    /**
     * Remove autenticação do Google
     */
    async signOut() {
        if (!this.isAuthenticated) return;
        
        try {
            const authInstance = this.gapi.auth2.getAuthInstance();
            await authInstance.signOut();
            
            this.isAuthenticated = false;
            this.currentUser = null;
            this.eventsCache.clear();
            
            console.log(' Desconectado do Google Calendar');
            
        } catch (error) {
            console.error(' Erro ao desconectar:', error);
        }
    }

    /**
     * Verifica se está autenticado e inicializado
     */
    isReady() {
        return this.isInitialized && this.isAuthenticated;
    }

    /**
     * Lista eventos do calendário
     */
    async listEvents(options = {}) {
        if (!this.isReady()) {
            throw new Error('Serviço não está pronto. Autentique primeiro.');
        }
        
        try {
            const {
                calendarId = 'primary',
                timeMin = new Date().toISOString(),
                timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 dias
                maxResults = 250,
                singleEvents = true,
                orderBy = 'startTime'
            } = options;
            
            console.log(' Buscando eventos do Google Calendar...');
            
            const response = await this.gapi.client.calendar.events.list({
                calendarId,
                timeMin,
                timeMax,
                maxResults,
                singleEvents,
                orderBy
            });
            
            const events = response.result.items || [];
            
            // Atualizar cache
            const cacheKey = `${calendarId}_${timeMin}_${timeMax}`;
            this.eventsCache.set(cacheKey, {
                events,
                timestamp: Date.now()
            });
            
            console.log(` ${events.length} eventos carregados`);
            return events;
            
        } catch (error) {
            console.error(' Erro ao listar eventos:', error);
            throw error;
        }
    }

    /**
     * Cria um novo evento
     */
    async createEvent(eventData) {
        if (!this.isReady()) {
            throw new Error('Serviço não está pronto. Autentique primeiro.');
        }
        
        try {
            const event = this.formatEventForGoogle(eventData);
            
            console.log(' Criando evento no Google Calendar:', event.summary);
            
            const response = await this.gapi.client.calendar.events.insert({
                calendarId: 'primary',
                resource: event
            });
            
            // Limpar cache relevante
            this.clearRelevantCache();
            
            console.log(' Evento criado com sucesso');
            return response.result;
            
        } catch (error) {
            console.error(' Erro ao criar evento:', error);
            throw error;
        }
    }

    /**
     * Atualiza um evento existente
     */
    async updateEvent(eventId, eventData) {
        if (!this.isReady()) {
            throw new Error('Serviço não está pronto. Autentique primeiro.');
        }
        
        try {
            const event = this.formatEventForGoogle(eventData);
            
            console.log(' Atualizando evento:', eventId);
            
            const response = await this.gapi.client.calendar.events.update({
                calendarId: 'primary',
                eventId: eventId,
                resource: event
            });
            
            // Limpar cache relevante
            this.clearRelevantCache();
            
            console.log(' Evento atualizado com sucesso');
            return response.result;
            
        } catch (error) {
            console.error(' Erro ao atualizar evento:', error);
            throw error;
        }
    }

    /**
     * Remove um evento
     */
    async deleteEvent(eventId) {
        if (!this.isReady()) {
            throw new Error('Serviço não está pronto. Autentique primeiro.');
        }
        
        try {
            console.log(' Removendo evento:', eventId);
            
            await this.gapi.client.calendar.events.delete({
                calendarId: 'primary',
                eventId: eventId
            });
            
            // Limpar cache relevante
            this.clearRelevantCache();
            
            console.log(' Evento removido com sucesso');
            return true;
            
        } catch (error) {
            console.error(' Erro ao remover evento:', error);
            throw error;
        }
    }

    /**
     * Formata dados do evento para o formato do Google Calendar
     */
    formatEventForGoogle(eventData) {
        const {
            title,
            description,
            startDate,
            endDate,
            startTime,
            endTime,
            location,
            attendees = [],
            reminders = [],
            allDay = false,
            contractId = null,
            clienteName = null
        } = eventData;
        
        // Construir objeto de evento do Google
        const event = {
            summary: title,
            description: this.buildEventDescription(description, contractId, clienteName),
            location: location || '',
        };
        
        // Configurar datas/horários
        if (allDay) {
            event.start = {
                date: startDate,
                timeZone: 'America/Sao_Paulo'
            };
            event.end = {
                date: endDate || startDate,
                timeZone: 'America/Sao_Paulo'
            };
        } else {
            const startDateTime = `${startDate}T${startTime || '09:00'}:00`;
            const endDateTime = `${endDate || startDate}T${endTime || '10:00'}:00`;
            
            event.start = {
                dateTime: startDateTime,
                timeZone: 'America/Sao_Paulo'
            };
            event.end = {
                dateTime: endDateTime,
                timeZone: 'America/Sao_Paulo'
            };
        }
        
        // Configurar participantes
        if (attendees.length > 0) {
            event.attendees = attendees.map(email => ({ email }));
        }
        
        // Configurar lembretes
        if (reminders.length > 0) {
            event.reminders = {
                useDefault: false,
                overrides: reminders.map(minutes => ({
                    method: 'popup',
                    minutes: parseInt(minutes)
                }))
            };
        } else {
            event.reminders = {
                useDefault: true
            };
        }
        
        // Adicionar metadados customizados
        event.extendedProperties = {
            private: {
                source: 'gestor-contratos',
                contractId: contractId || '',
                clienteName: clienteName || ''
            }
        };
        
        return event;
    }

    /**
     * Constrói descrição do evento com metadados
     */
    buildEventDescription(description, contractId, clienteName) {
        let fullDescription = description || '';
        
        if (contractId || clienteName) {
            fullDescription += '\n\n--- Detalhes do Sistema ---\n';
            
            if (clienteName) {
                fullDescription += ` Cliente: ${clienteName}\n`;
            }
            
            if (contractId) {
                fullDescription += ` Contrato: ${contractId}\n`;
            }
            
            fullDescription += ` Sistema: Gestor de Contratos`;
        }
        
        return fullDescription;
    }

    /**
     * Converte evento do Google para formato do sistema
     */
    formatEventFromGoogle(googleEvent) {
        const {
            id,
            summary,
            description,
            start,
            end,
            location,
            attendees = [],
            extendedProperties = {}
        } = googleEvent;
        
        // Extrair dados customizados
        const customData = extendedProperties.private || {};
        
        return {
            id,
            googleEventId: id,
            title: summary || 'Evento sem título',
            description: this.extractSystemDescription(description),
            startDate: start.date || start.dateTime?.split('T')[0],
            endDate: end.date || end.dateTime?.split('T')[0],
            startTime: start.dateTime ? start.dateTime.split('T')[1]?.substring(0, 5) : null,
            endTime: end.dateTime ? end.dateTime.split('T')[1]?.substring(0, 5) : null,
            allDay: !!start.date,
            location: location || '',
            attendees: attendees.map(att => att.email).filter(Boolean),
            contractId: customData.contractId || null,
            clienteName: customData.clienteName || null,
            source: 'google-calendar',
            lastSync: new Date().toISOString()
        };
    }

    /**
     * Extrai descrição do sistema removendo metadados
     */
    extractSystemDescription(description) {
        if (!description) return '';
        
        const systemDataStart = description.indexOf('--- Detalhes do Sistema ---');
        if (systemDataStart !== -1) {
            return description.substring(0, systemDataStart).trim();
        }
        
        return description;
    }

    /**
     * Limpa cache relevante
     */
    clearRelevantCache() {
        this.eventsCache.clear();
        this.lastSync = null;
    }

    /**
     * Sincroniza eventos bidirecionalmente
     */
    async syncEvents() {
        if (!this.isReady()) {
            console.warn(' Não é possível sincronizar - serviço não está pronto');
            return { success: false, error: 'Serviço não está pronto' };
        }
        
        try {
            console.log(' Iniciando sincronização bidirecional...');
            
            // 1. Buscar eventos do Google
            const googleEvents = await this.listEvents({
                timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 dias atrás
                timeMax: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 dias à frente
            });
            
            // 2. Buscar eventos locais (Firestore)
            const localEvents = await this.getLocalEvents();
            
            // 3. Identificar diferenças e sincronizar
            const syncResults = await this.performBidirectionalSync(googleEvents, localEvents);
            
            this.lastSync = new Date().toISOString();
            console.log(' Sincronização concluída:', syncResults);
            
            return { success: true, results: syncResults };
            
        } catch (error) {
            console.error(' Erro na sincronização:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Busca eventos locais do Firestore
     */
    async getLocalEvents() {
        if (!window.firestoreService) {
            return [];
        }
        
        // Implementar busca de eventos no Firestore
        // Por enquanto retorna array vazio
        return [];
    }

    /**
     * Realiza sincronização bidirecional
     */
    async performBidirectionalSync(googleEvents) {
        const results = {
            googleToLocal: { created: 0, updated: 0, deleted: 0 },
            localToGoogle: { created: 0, updated: 0, deleted: 0 },
            conflicts: 0
        };
        
        // Implementar lógica de sincronização bidirecional
        // Por enquanto apenas mapeia eventos do Google
        const mappedEvents = googleEvents.map(event => this.formatEventFromGoogle(event));
        
        console.log(` Sincronização: ${mappedEvents.length} eventos do Google mapeados`);
        
        return results;
    }

    /**
     * Cria evento rápido a partir de dados do contrato
     */
    async createContractEvent(contractData, eventType = 'follow-up') {
        const eventTemplates = {
            'follow-up': {
                title: `Follow-up: ${contractData.clientePrincipal}`,
                description: `Acompanhamento do processo de ${contractData.clientePrincipal}`,
                duration: 30
            },
            'assinatura': {
                title: `Assinatura: ${contractData.clientePrincipal}`,
                description: `Agendamento para assinatura do contrato`,
                duration: 60
            },
            'entrega': {
                title: `Entrega de documentos: ${contractData.clientePrincipal}`,
                description: `Entrega de documentos finalizados`,
                duration: 30
            },
            'vencimento': {
                title: `Vencimento: ${contractData.clientePrincipal}`,
                description: `Vencimento de prazo importante`,
                duration: 15
            }
        };
        
        const template = eventTemplates[eventType] || eventTemplates['follow-up'];
        
        // Calcular data/hora sugerida
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        
        const eventData = {
            title: template.title,
            description: template.description,
            startDate: tomorrow.toISOString().split('T')[0],
            startTime: '09:00',
            endTime: this.addMinutes('09:00', template.duration),
            contractId: contractData.id,
            clienteName: contractData.clientePrincipal,
            location: contractData.empreendimento || '',
            reminders: [15, 60] // 15 min e 1 hora antes
        };
        
        return await this.createEvent(eventData);
    }

    /**
     * Adiciona minutos a um horário
     */
    addMinutes(time, minutes) {
        const [hours, mins] = time.split(':').map(Number);
        const totalMinutes = hours * 60 + mins + minutes;
        const newHours = Math.floor(totalMinutes / 60);
        const newMins = totalMinutes % 60;
        
        return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
    }

    /**
     * Obtém estatísticas de uso
     */
    getStats() {
        return {
            isInitialized: this.isInitialized,
            isAuthenticated: this.isAuthenticated,
            cacheSize: this.eventsCache.size,
            lastSync: this.lastSync,
            currentUser: this.currentUser?.getBasicProfile()?.getEmail() || null
        };
    }

    /**
     * Configuração manual das credenciais (para admins)
     */
    async configureCredentials(clientId, apiKey) {
        try {
            localStorage.setItem('GOOGLE_CALENDAR_CLIENT_ID', clientId);
            localStorage.setItem('GOOGLE_CALENDAR_API_KEY', apiKey);
            
            console.log(' Credenciais Google Calendar configuradas');
            
            // Reinicializar com novas credenciais
            await this.initializeAsync();
            
            return { success: true };
            
        } catch (error) {
            console.error(' Erro ao configurar credenciais:', error);
            return { success: false, error: error.message };
        }
    }
}

// Instância singleton
const googleCalendarService = new GoogleCalendarService();

// Exposição global
window.googleCalendarService = googleCalendarService;

// Export para módulos (CommonJS - disabled in browser context)
// if (typeof module !== 'undefined' && module.exports) {
//     module.exports = googleCalendarService;
// }

console.log(' Google Calendar Service carregado');