/**
 * @file eventsDataModel.js
 * @description Modelo de dados e operações para eventos no Firestore
 */

// Configuração da coleção de eventos
const EVENTS_COLLECTION = 'events';

// Schema para eventos locais
const EVENT_SCHEMA = {
    // Identificadores
    id: 'string',                    // ID único do evento local
    googleEventId: 'string',         // ID do evento no Google Calendar (opcional)
    calendarId: 'string',           // ID do calendário do Google (opcional)
    
    // Dados básicos do evento
    title: 'string',                // Título do evento
    description: 'string',          // Descrição detalhada (opcional)
    
    // Data e horário
    startDate: 'string',            // Data de início (YYYY-MM-DD)
    endDate: 'string',              // Data de fim (YYYY-MM-DD, opcional)
    startTime: 'string',            // Horário de início (HH:MM, opcional)
    endTime: 'string',              // Horário de fim (HH:MM, opcional)
    allDay: 'boolean',              // Se é evento de dia inteiro
    
    // Local e participantes
    location: 'string',             // Local do evento (opcional)
    attendees: 'array',             // Array de emails dos participantes
    
    // Integração com contratos
    contractId: 'string',           // ID do contrato vinculado (opcional)
    clienteName: 'string',          // Nome do cliente (opcional)
    
    // Configurações
    reminders: 'array',             // Array de lembretes em minutos [15, 60, 1440]
    eventType: 'string',            // Tipo do agendamento (assinatura, formulario, duvida, custom)
    bookingLink: 'string',          // Link para compartilhar/agendar com cliente
    status: 'string',               // confirmed, tentative, cancelled
    visibility: 'string',           // default, public, private
    
    // Metadados de sincronização
    lastSyncAt: 'timestamp',        // Última sincronização
    syncStatus: 'string',           // pending, synced, error
    syncError: 'string',            // Erro de sincronização (opcional)
    
    // Auditoria
    createdAt: 'timestamp',         // Data de criação
    updatedAt: 'timestamp',         // Data de última atualização
    createdBy: 'string',            // UID do usuário criador
    updatedBy: 'string'             // UID do último usuário que editou
};

// Índices compostos necessários para o Firestore
const FIRESTORE_INDEXES = [
    // Para buscar eventos por período e usuário
    {
        collection: EVENTS_COLLECTION,
        fields: [
            { field: 'createdBy', order: 'ASCENDING' },
            { field: 'startDate', order: 'ASCENDING' },
            { field: 'endDate', order: 'ASCENDING' }
        ]
    },
    
    // Para buscar eventos por contrato
    {
        collection: EVENTS_COLLECTION,
        fields: [
            { field: 'contractId', order: 'ASCENDING' },
            { field: 'startDate', order: 'ASCENDING' }
        ]
    },
    
    // Para buscar eventos por status de sincronização
    {
        collection: EVENTS_COLLECTION,
        fields: [
            { field: 'createdBy', order: 'ASCENDING' },
            { field: 'syncStatus', order: 'ASCENDING' },
            { field: 'updatedAt', order: 'DESCENDING' }
        ]
    },
    
    // Para buscar eventos por Google Calendar ID
    {
        collection: EVENTS_COLLECTION,
        fields: [
            { field: 'googleEventId', order: 'ASCENDING' },
            { field: 'updatedAt', order: 'DESCENDING' }
        ]
    }
];

/**
 * Classe para gerenciar operações de eventos no Firestore
 */
class EventsDataService {
    constructor() {
        this.db = null;
        this.user = null;
        this.initializeAsync();
    }

    /**
     * Inicialização assíncrona
     */
    async initializeAsync() {
        try {
            // Aguardar Firebase estar pronto
            await this.waitForFirebase();
            console.log(' Events Data Service inicializado');
        } catch (error) {
            console.error(' Erro ao inicializar Events Data Service:', error);
        }
    }

    /**
     * Aguarda Firebase estar disponível
     */
    async waitForFirebase() {
        return new Promise((resolve) => {
            const checkFirebase = () => {
                if (window.firebase && window.firebase.auth && window.firebase.firestore) {
                    this.db = window.firebase.firestore();
                    
                    // Observar mudanças de autenticação
                    window.firebase.auth().onAuthStateChanged(user => {
                        this.user = user;
                    });
                    
                    resolve();
                } else {
                    setTimeout(checkFirebase, 100);
                }
            };
            checkFirebase();
        });
    }

    /**
     * Cria um novo evento no Firestore
     */
    async createEvent(eventData) {
        if (!this.user) {
            throw new Error('Usuário não autenticado');
        }

        const now = window.firebase.firestore.Timestamp.now();
        
        const event = {
            ...eventData,
            createdAt: now,
            updatedAt: now,
            createdBy: this.user.uid,
            updatedBy: this.user.uid,
            eventType: eventData.eventType || 'outro',
            bookingLink: eventData.bookingLink || null,
            syncStatus: 'pending',
            status: eventData.status || 'confirmed',
            visibility: eventData.visibility || 'default'
        };

        // Validar dados
        this.validateEventData(event);

        try {
            const docRef = await this.db.collection(EVENTS_COLLECTION).add(event);
            
            // Atualizar com o ID gerado
            await docRef.update({ id: docRef.id });
            
            console.log(' Evento criado:', docRef.id);
            
            // Invalidar cache relacionado
            this.invalidateCache();
            
            return docRef.id;

        } catch (error) {
            console.error(' Erro ao criar evento:', error);
            throw error;
        }
    }

    /**
     * Atualiza um evento existente
     */
    async updateEvent(eventId, eventData) {
        if (!this.user) {
            throw new Error('Usuário não autenticado');
        }

        const now = window.firebase.firestore.Timestamp.now();
        
        const updates = {
            ...eventData,
            updatedAt: now,
            updatedBy: this.user.uid,
            eventType: eventData.eventType || eventData.eventType === '' ? eventData.eventType : 'outro',
            syncStatus: 'pending'  // Marcar para re-sincronização
        };

        // Validar dados
        this.validateEventData(updates, true);

        try {
            await this.db.collection(EVENTS_COLLECTION).doc(eventId).update(updates);
            
            console.log(' Evento atualizado:', eventId);
            
            // Invalidar cache
            this.invalidateCache();
            
            return true;

        } catch (error) {
            console.error(' Erro ao atualizar evento:', error);
            throw error;
        }
    }

    /**
     * Busca evento por ID
     */
    async getEventById(eventId) {
        try {
            const doc = await this.db.collection(EVENTS_COLLECTION).doc(eventId).get();
            
            if (!doc.exists) {
                return null;
            }

            const data = doc.data();
            return this.formatEventData(data);

        } catch (error) {
            console.error(' Erro ao buscar evento:', error);
            throw error;
        }
    }

    /**
     * Busca eventos por período
     */
    async getEventsByPeriod(startDate, endDate) {
        if (!this.user) {
            return [];
        }

        try {
            let query = this.db.collection(EVENTS_COLLECTION)
                .where('createdBy', '==', this.user.uid);

            // Aplicar filtros de data
            if (startDate) {
                query = query.where('startDate', '>=', startDate);
            }
            
            if (endDate) {
                query = query.where('startDate', '<=', endDate);
            }

            // Ordenar por data de início
            query = query.orderBy('startDate', 'asc');

            const snapshot = await query.get();
            
            const events = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                events.push(this.formatEventData(data));
            });

            console.log(` ${events.length} eventos encontrados para o período`);
            return events;

        } catch (error) {
            console.error(' Erro ao buscar eventos por período:', error);
            throw error;
        }
    }

    /**
     * Busca eventos por contrato
     */
    async getEventsByContract(contractId) {
        if (!this.user) {
            return [];
        }

        try {
            const snapshot = await this.db.collection(EVENTS_COLLECTION)
                .where('contractId', '==', contractId)
                .orderBy('startDate', 'asc')
                .get();

            const events = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                events.push(this.formatEventData(data));
            });

            return events;

        } catch (error) {
            console.error(' Erro ao buscar eventos por contrato:', error);
            throw error;
        }
    }

    /**
     * Busca eventos por Google Event ID
     */
    async getEventByGoogleId(googleEventId) {
        if (!this.user) {
            return null;
        }

        try {
            const snapshot = await this.db.collection(EVENTS_COLLECTION)
                .where('googleEventId', '==', googleEventId)
                .where('createdBy', '==', this.user.uid)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            const data = doc.data();
            return this.formatEventData(data);

        } catch (error) {
            console.error(' Erro ao buscar evento por Google ID:', error);
            throw error;
        }
    }

    /**
     * Busca eventos pendentes de sincronização
     */
    async getPendingSyncEvents() {
        if (!this.user) {
            return [];
        }

        try {
            const snapshot = await this.db.collection(EVENTS_COLLECTION)
                .where('createdBy', '==', this.user.uid)
                .where('syncStatus', '==', 'pending')
                .orderBy('updatedAt', 'desc')
                .get();

            const events = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                events.push(this.formatEventData(data));
            });

            return events;

        } catch (error) {
            console.error(' Erro ao buscar eventos pendentes de sync:', error);
            throw error;
        }
    }

    /**
     * Atualiza status de sincronização
     */
    async updateSyncStatus(eventId, status, googleEventId = null, error = null) {
        const updates = {
            syncStatus: status,
            lastSyncAt: window.firebase.firestore.Timestamp.now()
        };

        if (googleEventId) {
            updates.googleEventId = googleEventId;
        }

        if (error) {
            updates.syncError = error;
        } else {
            updates.syncError = window.firebase.firestore.FieldValue.delete();
        }

        try {
            await this.db.collection(EVENTS_COLLECTION).doc(eventId).update(updates);
            return true;

        } catch (err) {
            console.error(' Erro ao atualizar status de sync:', err);
            throw err;
        }
    }

    /**
     * Exclui um evento
     */
    async deleteEvent(eventId) {
        try {
            await this.db.collection(EVENTS_COLLECTION).doc(eventId).delete();
            
            console.log(' Evento excluído:', eventId);
            
            // Invalidar cache
            this.invalidateCache();
            
            return true;

        } catch (error) {
            console.error(' Erro ao excluir evento:', error);
            throw error;
        }
    }

    /**
     * Valida dados do evento
     */
    validateEventData(eventData, isUpdate = false) {
        // Campos obrigatórios para criação
        if (!isUpdate) {
            if (!eventData.title || eventData.title.trim().length === 0) {
                throw new Error('Título do evento é obrigatório');
            }
            
            if (!eventData.startDate) {
                throw new Error('Data de início é obrigatória');
            }
        }

        // Validar formato de data
        if (eventData.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventData.startDate)) {
            throw new Error('Formato de data de início inválido (YYYY-MM-DD)');
        }

        if (eventData.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventData.endDate)) {
            throw new Error('Formato de data de fim inválido (YYYY-MM-DD)');
        }

        // Validar horários
        if (eventData.startTime && !/^\d{2}:\d{2}$/.test(eventData.startTime)) {
            throw new Error('Formato de horário de início inválido (HH:MM)');
        }

        if (eventData.endTime && !/^\d{2}:\d{2}$/.test(eventData.endTime)) {
            throw new Error('Formato de horário de fim inválido (HH:MM)');
        }

        // Validar emails de participantes
        if (eventData.attendees && Array.isArray(eventData.attendees)) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            eventData.attendees.forEach(email => {
                if (!emailRegex.test(email)) {
                    throw new Error(`Email inválido: ${email}`);
                }
            });
        }

        // Validar status
        const validStatuses = ['confirmed', 'tentative', 'cancelled'];
        if (eventData.status && !validStatuses.includes(eventData.status)) {
            throw new Error('Status do evento inválido');
        }

        // Validar visibilidade
        const validVisibilities = ['default', 'public', 'private'];
        if (eventData.visibility && !validVisibilities.includes(eventData.visibility)) {
            throw new Error('Visibilidade do evento inválida');
        }

        if (eventData.eventType && eventData.eventType.length > 80) {
            throw new Error('Tipo de evento muito longo');
        }

        if (eventData.bookingLink && eventData.bookingLink.length > 500) {
            throw new Error('Link de agendamento muito longo');
        }

        return true;
    }

    /**
     * Formata dados do evento para uso na aplicação
     */
    formatEventData(data) {
        return {
            ...data,
            createdAt: data.createdAt?.toDate?.() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
            lastSyncAt: data.lastSyncAt?.toDate?.() || data.lastSyncAt,
            attendees: data.attendees || [],
            reminders: data.reminders || []
        };
    }

    /**
     * Invalida cache relacionado aos eventos
     */
    invalidateCache() {
        if (window.cacheService) {
            window.cacheService.invalidateByPattern(/^events/);
            window.cacheService.invalidateByPattern(/^calendar/);
        }
    }

    /**
     * Estatísticas de eventos
     */
    async getEventStats() {
        if (!this.user) {
            return { total: 0, synced: 0, pending: 0, errors: 0 };
        }

        try {
            const snapshot = await this.db.collection(EVENTS_COLLECTION)
                .where('createdBy', '==', this.user.uid)
                .get();

            let total = 0;
            let synced = 0;
            let pending = 0;
            let errors = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                total++;
                
                switch (data.syncStatus) {
                    case 'synced':
                        synced++;
                        break;
                    case 'pending':
                        pending++;
                        break;
                    case 'error':
                        errors++;
                        break;
                }
            });

            return { total, synced, pending, errors };

        } catch (error) {
            console.error(' Erro ao obter estatísticas:', error);
            return { total: 0, synced: 0, pending: 0, errors: 0 };
        }
    }
}

// Script para criar índices compostos (PowerShell)
`
# Script para criar índices compostos no Firestore
# Execute este script no diretório do projeto

# Instalar Firebase CLI se necessário
# npm install -g firebase-tools

# Login no Firebase
# firebase login

# Criar arquivo de índices
@"
{
  "indexes": [
    {
      "collectionGroup": "${EVENTS_COLLECTION}",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "createdBy", "order": "ASCENDING" },
        { "fieldPath": "startDate", "order": "ASCENDING" },
        { "fieldPath": "endDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "${EVENTS_COLLECTION}",
      "queryScope": "COLLECTION", 
      "fields": [
        { "fieldPath": "contractId", "order": "ASCENDING" },
        { "fieldPath": "startDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "${EVENTS_COLLECTION}",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "createdBy", "order": "ASCENDING" },
        { "fieldPath": "syncStatus", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "${EVENTS_COLLECTION}",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "googleEventId", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
"@ | Out-File -FilePath "firestore-events-indexes.json" -Encoding UTF8

Write-Host "Arquivo de índices criado: firestore-events-indexes.json"
Write-Host "Execute: firebase firestore:indexes firestore-events-indexes.json"
`;

// Inicializar serviço quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        console.log(' Inicializando Events Data Service...');
        window.eventsDataService = new EventsDataService();
    }, 500);
});

// Exposição global
window.EventsDataService = EventsDataService;
window.EVENTS_COLLECTION = EVENTS_COLLECTION;
window.EVENT_SCHEMA = EVENT_SCHEMA;
window.FIRESTORE_INDEXES = FIRESTORE_INDEXES;

console.log(' Events Data Model carregado');

// Exemplo de uso:
/*
// Criar evento
const eventId = await window.eventsDataService.createEvent({
    title: 'Reunião com cliente',
    description: 'Discussão sobre projeto',
    startDate: '2024-01-15',
    startTime: '10:00',
    endTime: '11:00',
    location: 'Escritório',
    contractId: 'contract123',
    attendees: ['cliente@email.com']
});

// Buscar eventos do mês
const events = await window.eventsDataService.getEventsByPeriod(
    '2024-01-01', 
    '2024-01-31'
);

// Atualizar evento
await window.eventsDataService.updateEvent(eventId, {
    title: 'Nova reunião',
    description: 'Atualizada'
});

// Buscar eventos por contrato
const contractEvents = await window.eventsDataService.getEventsByContract('contract123');
*/