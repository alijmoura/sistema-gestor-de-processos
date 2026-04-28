/**
 * @file agendaUI.js
 * @description Interface de usuário para agenda integrada com Google Calendar
 */

class AgendaUI {
    constructor() {
        this.currentView = 'month'; // month, week, day
        this.currentDate = new Date();
        this.events = [];
        this.selectedEvent = null;
        this.calendarService = null;
        this.scheduleTypes = [];
        this.eventModal = null; // Bootstrap Modal instance
        
        this.initializeAsync();
    }

    /**
     * Inicialização assíncrona
     */
    async initializeAsync() {
        try {
            console.log(' Inicializando Agenda UI...');
            
            // Aguardar o serviço local do calendário
            await this.waitForCalendarService();

            // Carregar tipos de agendamento
            await this.loadScheduleTypes();
            
            // Criar elementos da interface
            this.createAgendaPage();
            
            // Carregar eventos
            await this.loadEvents();
            
            console.log(' Agenda UI inicializada');
            
        } catch (error) {
            console.error(' Erro ao inicializar Agenda UI:', error);
        }
    }

    /**
     * Aguarda o serviço local do calendário estar disponível
     */
    async waitForCalendarService() {
        return new Promise((resolve) => {
            const checkService = () => {
                if (window.localCalendarService) {
                    this.calendarService = window.localCalendarService;
                    resolve();
                } else {
                    setTimeout(checkService, 100);
                }
            };
            checkService();
        });
    }

    async waitForScheduleTypesService() {
        return new Promise((resolve) => {
            const check = () => {
                if (window.scheduleTypesService) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    async loadScheduleTypes() {
        await this.waitForScheduleTypesService();
        try {
            this.scheduleTypes = await window.scheduleTypesService.getTypes();
        } catch (error) {
            console.warn(' Falha ao carregar tipos de agendamento, usando padrão.', error);
            this.scheduleTypes = window.DEFAULT_SCHEDULE_TYPES || [];
        }
    }

    renderTypeOptions(selectEl) {
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">Selecione o tipo</option>';
        (this.scheduleTypes || []).forEach((type) => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.name;
            option.dataset.category = type.category;
            selectEl.appendChild(option);
        });
    }

    /**
     * Cria a página da agenda
     */
    createAgendaPage() {
        const pageAgenda = document.getElementById('page-agenda');
        if (!pageAgenda) {
            console.error(' Elemento page-agenda não encontrado');
            return;
        }

        pageAgenda.innerHTML = `
            <div class="agenda-container">
                <!-- Header da Agenda -->
                <div class="agenda-header">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <div>
                            <h1 class="h3 mb-1">
                                <i class="bi bi-calendar-event text-primary me-2"></i>
                                Agenda
                            </h1>
                            <p class="text-muted mb-0">Gerencie seus compromissos e eventos</p>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-outline-primary" id="sync-calendar-btn">
                                <i class="bi bi-arrow-clockwise me-2"></i>
                                Sincronizar
                            </button>
                            <button class="btn btn-primary" id="add-event-btn">
                                <i class="bi bi-plus-circle me-2"></i>
                                Novo Evento
                            </button>
                        </div>
                    </div>

                    <!-- Status da Agenda -->
                    <div id="connection-status" class="alert alert-info">
                        <div class="d-flex align-items-center">
                            <div class="spinner-border spinner-border-sm me-2" role="status">
                                <span class="visually-hidden">Carregando...</span>
                            </div>
                            <span>Carregando agenda local...</span>
                        </div>
                    </div>

                    <!-- Controles de Navegação -->
                    <div class="calendar-controls">
                        <div class="row g-3 align-items-center">
                            <div class="col-md-6">
                                <div class="btn-group" role="group">
                                    <button type="button" class="btn btn-outline-secondary" id="prev-period">
                                        <i class="bi bi-chevron-left"></i>
                                    </button>
                                    <button type="button" class="btn btn-outline-secondary" id="today-btn">
                                        Hoje
                                    </button>
                                    <button type="button" class="btn btn-outline-secondary" id="next-period">
                                        <i class="bi bi-chevron-right"></i>
                                    </button>
                                </div>
                                <span class="ms-3 h5 mb-0" id="current-period-display">
                                    ${this.formatPeriodDisplay()}
                                </span>
                            </div>
                            <div class="col-md-6">
                                <div class="btn-group ms-auto" role="group">
                                    <input type="radio" class="btn-check" name="calendar-view" id="month-view" checked>
                                    <label class="btn btn-outline-primary" for="month-view">Mês</label>
                                    
                                    <input type="radio" class="btn-check" name="calendar-view" id="week-view">
                                    <label class="btn btn-outline-primary" for="week-view">Semana</label>
                                    
                                    <input type="radio" class="btn-check" name="calendar-view" id="day-view">
                                    <label class="btn btn-outline-primary" for="day-view">Dia</label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Calendário Principal -->
                <div class="calendar-main">
                    <div class="row">
                        <div class="col-lg-9">
                            <div class="card border-0 shadow-sm">
                                <div class="card-body p-0">
                                    <div id="calendar-display">
                                        <!-- O calendário será renderizado aqui -->
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-3">
                            <!-- Sidebar com mini calendário e eventos -->
                            <div class="calendar-sidebar">
                                <!-- Mini Calendário -->
                                <div class="card border-0 shadow-sm mb-4">
                                    <div class="card-header bg-light">
                                        <h6 class="mb-0">
                                            <i class="bi bi-calendar3 me-2"></i>
                                            Navegação Rápida
                                        </h6>
                                    </div>
                                    <div class="card-body">
                                        <div id="mini-calendar">
                                            <!-- Mini calendário será renderizado aqui -->
                                        </div>
                                    </div>
                                </div>

                                <!-- Eventos do Dia -->
                                <div class="card border-0 shadow-sm">
                                    <div class="card-header bg-light">
                                        <h6 class="mb-0">
                                            <i class="bi bi-clock me-2"></i>
                                            Eventos de Hoje
                                        </h6>
                                    </div>
                                    <div class="card-body">
                                        <div id="today-events">
                                            <!-- Eventos de hoje serão listados aqui -->
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal de Evento -->
            <div id="event-modal" class="modal fade" tabindex="-1" aria-labelledby="event-modal-title" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content">
                        <div class="modal-header border-bottom">
                            <h2 class="modal-title" id="event-modal-title">
                                <i class="bi bi-calendar-plus text-primary"></i>
                                <span id="modal-title">Novo Evento</span>
                            </h2>
                            <button type="button" class="btn-close" id="close-event-modal" data-bs-dismiss="modal" aria-label="Fechar"></button>
                        </div>
                    
                    <form id="event-form" class="needs-validation" novalidate>
                        <div class="modal-body">
                            <!-- Título do Evento -->
                            <div class="row g-3 mb-3">
                                <div class="col-12">
                                    <div class="form-floating">
                                        <input type="text" class="form-control" id="event-title" placeholder="Título do evento" required>
                                        <label for="event-title">
                                            <i class="bi bi-type me-2"></i>
                                            Título do Evento
                                        </label>
                                        <div class="invalid-feedback">Informe o título.</div>
                                    </div>
                                </div>
                            </div>

                            <!-- Data e Hora -->
                            <div class="row g-3 mb-3">
                                <div class="col-md-6">
                                    <div class="form-floating">
                                        <input type="date" class="form-control" id="event-start-date" required>
                                        <label for="event-start-date">Data de Início</label>
                                        <div class="invalid-feedback">Data de início é obrigatória.</div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="form-floating">
                                        <input type="date" class="form-control" id="event-end-date">
                                        <label for="event-end-date">Data de Fim</label>
                                    </div>
                                </div>
                            </div>

                            <!-- Horários -->
                            <div class="row g-3 mb-3" id="time-fields">
                                <div class="col-md-6">
                                    <div class="form-floating">
                                        <input type="time" class="form-control" id="event-start-time" value="09:00">
                                        <label for="event-start-time">Hora de Início</label>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="form-floating">
                                        <input type="time" class="form-control" id="event-end-time" value="10:00">
                                        <label for="event-end-time">Hora de Fim</label>
                                    </div>
                                </div>
                            </div>

                            <!-- Checkbox Evento Inteiro -->
                            <div class="mb-3">
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="all-day-event">
                                    <label class="form-check-label" for="all-day-event">
                                        Evento de dia inteiro
                                    </label>
                                </div>
                            </div>

                            <!-- Descrição -->
                            <div class="mb-3">
                                <div class="form-floating">
                                    <textarea class="form-control h-textarea-md" id="event-description" placeholder="Descrição do evento"></textarea>
                                    <label for="event-description">
                                        <i class="bi bi-text-paragraph me-2"></i>
                                        Descrição
                                    </label>
                                </div>
                            </div>

                            <!-- Local -->
                            <div class="mb-3">
                                <div class="form-floating">
                                    <input type="text" class="form-control" id="event-location" placeholder="Local do evento">
                                    <label for="event-location">
                                        <i class="bi bi-geo-alt me-2"></i>
                                        Local
                                    </label>
                                </div>
                            </div>

                            <!-- Vinculação com Contrato -->
                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="bi bi-link-45deg me-2"></i>
                                    Vincular ao Contrato
                                </label>
                                <select class="form-select" id="event-contract">
                                    <option value="">Selecione um contrato (opcional)</option>
                                    <!-- Opções serão carregadas dinamicamente -->
                                </select>
                            </div>

                            <!-- Tipo de Agendamento -->
                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="bi bi-ui-checks me-2"></i>
                                    Tipo de Agendamento
                                </label>
                                <select class="form-select" id="event-type" required>
                                    <option value="">Selecione o tipo</option>
                                </select>
                                <div class="invalid-feedback">Selecione um tipo.</div>
                            </div>

                            <input type="hidden" id="event-booking-link" />

                            <!-- Participantes -->
                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="bi bi-people me-2"></i>
                                    Participantes (emails)
                                </label>
                                <input type="text" class="form-control" id="event-attendees" placeholder="email1@exemplo.com, email2@exemplo.com">
                                <small class="text-muted">Separe múltiplos emails com vírgula</small>
                            </div>

                            <!-- Lembretes -->
                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="bi bi-alarm me-2"></i>
                                    Lembretes
                                </label>
                                <div class="d-flex gap-2 flex-wrap">
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="reminder-15" value="15">
                                        <label class="form-check-label" for="reminder-15">15 min</label>
                                    </div>
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="reminder-60" value="60" checked>
                                        <label class="form-check-label" for="reminder-60">1 hora</label>
                                    </div>
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="reminder-1440" value="1440">
                                        <label class="form-check-label" for="reminder-1440">1 dia</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="modal-footer border-top">
                            <button type="button" class="btn btn-secondary" id="cancel-event" data-bs-dismiss="modal">Cancelar</button>
                            <button type="button" class="btn btn-danger d-none" id="delete-event">
                                <i class="bi bi-trash me-2"></i>
                                Excluir
                            </button>
                            <button type="button" class="btn btn-outline-primary" id="copy-booking-link">
                                <i class="bi bi-link-45deg me-2"></i>
                                Copiar link p/ cliente
                            </button>
                            <button type="button" class="btn btn-outline-success" id="copy-whatsapp-link">
                                <i class="bi bi-whatsapp me-2"></i>
                                Mensagem WhatsApp
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="bi bi-check-circle me-2"></i>
                                Salvar Evento
                            </button>
                        </div>
                    </form>
                    </div>
                </div>
            </div>
        `;

        // Vincular eventos
        this.bindEvents();
    }

    /**
     * Vincula eventos da interface
     */
    bindEvents() {
        // Navegação de período
        document.getElementById('prev-period')?.addEventListener('click', () => this.navigatePeriod(-1));
        document.getElementById('next-period')?.addEventListener('click', () => this.navigatePeriod(1));
        document.getElementById('today-btn')?.addEventListener('click', () => this.goToToday());

        // Mudança de visualização
        document.querySelectorAll('input[name="calendar-view"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.currentView = e.target.id.replace('-view', '');
                    this.renderCalendar();
                }
            });
        });

        // Botões de ação
        document.getElementById('sync-calendar-btn')?.addEventListener('click', () => this.syncCalendar());
        document.getElementById('add-event-btn')?.addEventListener('click', () => this.openEventModal());

        // Modal de evento
        const eventModalEl = document.getElementById('event-modal');
        if (eventModalEl) {
            eventModalEl.addEventListener('hidden.bs.modal', () => {
                this.selectedEvent = null;
            });
        }
        document.getElementById('delete-event')?.addEventListener('click', () => this.deleteEvent());
        document.getElementById('event-form')?.addEventListener('submit', (e) => this.saveEvent(e));
        document.getElementById('copy-booking-link')?.addEventListener('click', () => this.copyBookingLink());
        document.getElementById('copy-whatsapp-link')?.addEventListener('click', () => this.copyWhatsappMessage());

        // Checkbox de dia inteiro
        document.getElementById('all-day-event')?.addEventListener('change', (e) => {
            const timeFields = document.getElementById('time-fields');
            if (timeFields) {
                timeFields.classList.toggle('d-none', e.target.checked);
            }
        });

        // Sincronização de data de fim
        document.getElementById('event-start-date')?.addEventListener('change', (e) => {
            const endDate = document.getElementById('event-end-date');
            if (endDate && !endDate.value) {
                endDate.value = e.target.value;
            }
        });

        // Sincronização de hora de fim
        document.getElementById('event-start-time')?.addEventListener('change', (e) => {
            const endTime = document.getElementById('event-end-time');
            if (endTime && endTime.value <= e.target.value) {
                const [hours, minutes] = e.target.value.split(':');
                const newHour = (parseInt(hours) + 1).toString().padStart(2, '0');
                endTime.value = `${newHour}:${minutes}`;
            }
        });
    }

    /**
     * Carrega eventos do calendário
     */
    async loadEvents() {
        try {
            await this.updateConnectionStatus();
            
            if (!this.calendarService.isReady()) {
                console.log(' Agenda local não está pronta');
                this.renderCalendar();
                return;
            }

            console.log(' Carregando eventos...');
            
            const events = await this.calendarService.listEvents({
                timeMin: this.getViewStartDate().toISOString(),
                timeMax: this.getViewEndDate().toISOString()
            });

            this.events = events;
            this.renderCalendar();
            this.renderTodayEvents();

        } catch (error) {
            console.error(' Erro ao carregar eventos:', error);
            this.showError('Erro ao carregar eventos: ' + error.message);
        }
    }

    /**
     * Atualiza status da agenda
     */
    async updateConnectionStatus() {
        const statusDiv = document.getElementById('connection-status');
        if (!statusDiv) return;

        const stats = this.calendarService.getStats();

        if (stats.isReady) {
            statusDiv.className = 'alert alert-success';
            statusDiv.innerHTML = `
                <div class="d-flex align-items-center">
                    <i class="bi bi-check-circle me-2"></i>
                    <span>Agenda pronta - ${stats.totalEvents} evento(s) carregado(s)</span>
                    <span class="badge bg-primary ms-2">${stats.todayEvents} hoje</span>
                </div>
            `;
        } else if (stats.isInitialized) {
            statusDiv.className = 'alert alert-warning';
            statusDiv.innerHTML = `
                <div class="d-flex align-items-center">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    <span>Agenda carregada - faça login para acessar seus eventos</span>
                </div>
            `;
        } else {
            statusDiv.className = 'alert alert-danger';
            statusDiv.innerHTML = `
                <div class="d-flex align-items-center">
                    <i class="bi bi-x-circle me-2"></i>
                    <span>Erro ao carregar agenda. Verifique sua conexão.</span>
                </div>
            `;
        }
    }

    /**
     * Renderiza o calendário principal
     */
    renderCalendar() {
        const calendarDisplay = document.getElementById('calendar-display');
        if (!calendarDisplay) return;

        // Atualizar display do período
        const periodDisplay = document.getElementById('current-period-display');
        if (periodDisplay) {
            periodDisplay.textContent = this.formatPeriodDisplay();
        }

        switch (this.currentView) {
            case 'month':
                this.renderMonthView(calendarDisplay);
                break;
            case 'week':
                this.renderWeekView(calendarDisplay);
                break;
            case 'day':
                this.renderDayView(calendarDisplay);
                break;
        }
    }

    /**
     * Renderiza visualização mensal
     */
    renderMonthView(container) {
        const startDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        
        // Ajustar para começar na segunda-feira
        const firstDay = new Date(startDate);
        firstDay.setDate(firstDay.getDate() - (firstDay.getDay() || 7) + 1);

        let html = `
            <div class="calendar-month">
                <div class="calendar-header">
                    <div class="row g-0">
                        <div class="col calendar-day-header">Seg</div>
                        <div class="col calendar-day-header">Ter</div>
                        <div class="col calendar-day-header">Qua</div>
                        <div class="col calendar-day-header">Qui</div>
                        <div class="col calendar-day-header">Sex</div>
                        <div class="col calendar-day-header">Sáb</div>
                        <div class="col calendar-day-header">Dom</div>
                    </div>
                </div>
                <div class="calendar-body">
        `;

        let currentWeekDate = new Date(firstDay);
        
        for (let week = 0; week < 6; week++) {
            html += '<div class="row g-0 calendar-week">';
            
            for (let day = 0; day < 7; day++) {
                const isCurrentMonth = currentWeekDate.getMonth() === this.currentDate.getMonth();
                const isToday = this.isToday(currentWeekDate);
                const dayEvents = this.getEventsForDate(currentWeekDate);
                
                const cssClasses = [
                    'col', 'calendar-day',
                    !isCurrentMonth ? 'other-month' : '',
                    isToday ? 'today' : '',
                    dayEvents.length > 0 ? 'has-events' : ''
                ].filter(Boolean).join(' ');

                html += `
                    <div class="${cssClasses}" data-date="${currentWeekDate.toISOString().split('T')[0]}">
                        <div class="day-number">${currentWeekDate.getDate()}</div>
                        <div class="day-events">
                            ${dayEvents.slice(0, 3).map(event => `
                                <div class="event-item" data-event-id="${event.id}" title="${event.title}">
                                    ${event.title}
                                </div>
                            `).join('')}
                            ${dayEvents.length > 3 ? `<div class="more-events">+${dayEvents.length - 3} mais</div>` : ''}
                        </div>
                    </div>
                `;
                
                currentWeekDate.setDate(currentWeekDate.getDate() + 1);
            }
            
            html += '</div>';
            
            // Se chegou ao fim do mês e já mostrou todas as semanas necessárias
            if (currentWeekDate.getMonth() !== this.currentDate.getMonth() && week >= 4) {
                break;
            }
        }

        html += '</div></div>';
        container.innerHTML = html;

        // Vincular eventos de clique
        this.bindCalendarEvents(container);
    }

    /**
     * Renderiza visualização semanal
     */
    renderWeekView(container) {
        const startDate = this.getWeekStart(this.currentDate);
        const hours = Array.from({length: 24}, (_, i) => i);

        let html = `
            <div class="calendar-week-view">
                <div class="time-column">
                    <div class="time-header"></div>
                    ${hours.map(hour => `
                        <div class="time-slot">
                            ${hour.toString().padStart(2, '0')}:00
                        </div>
                    `).join('')}
                </div>
                <div class="days-container">
                    <div class="days-header">
        `;

        // Cabeçalho dos dias
        for (let i = 0; i < 7; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const isToday = this.isToday(date);
            
            html += `
                <div class="day-header ${isToday ? 'today' : ''}">
                    <div class="day-name">${this.getDayName(date)}</div>
                    <div class="day-number">${date.getDate()}</div>
                </div>
            `;
        }

        html += '</div><div class="days-grid">';

        // Grid dos dias
        for (let i = 0; i < 7; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const dayEvents = this.getEventsForDate(date);
            
            html += `
                <div class="day-column" data-date="${date.toISOString().split('T')[0]}">
                    ${hours.map(hour => `
                        <div class="hour-slot" data-hour="${hour}">
                            ${this.renderHourEvents(dayEvents, hour)}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        html += '</div></div></div>';
        container.innerHTML = html;

        this.bindCalendarEvents(container);
    }

    /**
     * Renderiza visualização diária
     */
    renderDayView(container) {
        const hours = Array.from({length: 24}, (_, i) => i);
        const dayEvents = this.getEventsForDate(this.currentDate);

        let html = `
            <div class="calendar-day-view">
                <div class="day-header-large">
                    <h3>${this.formatDate(this.currentDate, 'full')}</h3>
                    <p class="text-muted">${dayEvents.length} evento(s)</p>
                </div>
                <div class="day-timeline">
                    <div class="time-column">
                        ${hours.map(hour => `
                            <div class="time-slot">
                                ${hour.toString().padStart(2, '0')}:00
                            </div>
                        `).join('')}
                    </div>
                    <div class="events-column">
                        ${hours.map(hour => `
                            <div class="hour-slot" data-hour="${hour}">
                                ${this.renderHourEvents(dayEvents, hour)}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
        this.bindCalendarEvents(container);
    }

    /**
     * Renderiza eventos de hoje na sidebar
     */
    renderTodayEvents() {
        const todayEventsContainer = document.getElementById('today-events');
        if (!todayEventsContainer) return;

        const todayEvents = this.getEventsForDate(new Date());

        if (todayEvents.length === 0) {
            todayEventsContainer.innerHTML = `
                <p class="text-muted text-center">
                    <i class="bi bi-calendar-x me-2"></i>
                    Nenhum evento hoje
                </p>
            `;
            return;
        }

        const html = todayEvents.map(event => `
            <div class="event-item-sidebar" data-event-id="${event.id}">
                <div class="d-flex align-items-start">
                    <div class="event-time">
                        ${event.allDay ? 'Dia todo' : event.startTime || ''}
                    </div>
                    <div class="event-details ms-2">
                        <div class="event-title">${event.title}</div>
                        ${event.location ? `<small class="text-muted"><i class="bi bi-geo-alt"></i> ${event.location}</small>` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        todayEventsContainer.innerHTML = html;

        // Vincular cliques
        todayEventsContainer.querySelectorAll('.event-item-sidebar').forEach(item => {
            item.addEventListener('click', () => {
                const eventId = item.dataset.eventId;
                const event = this.events.find(e => e.id === eventId);
                if (event) {
                    this.openEventModal(event);
                }
            });
        });
    }

    /**
     * Vincula eventos de clique do calendário
     */
    bindCalendarEvents(container) {
        // Clique em dias
        container.querySelectorAll('.calendar-day, .day-column').forEach(dayEl => {
            dayEl.addEventListener('click', (e) => {
                if (e.target.classList.contains('event-item')) return;
                
                const date = dayEl.dataset.date;
                if (date) {
                    this.openEventModal(null, date);
                }
            });
        });

        // Clique em eventos
        container.querySelectorAll('.event-item').forEach(eventEl => {
            eventEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const eventId = eventEl.dataset.eventId;
                const event = this.events.find(e => e.id === eventId);
                if (event) {
                    this.openEventModal(event);
                }
            });
        });
    }

    /**
     * Renderiza eventos de uma hora específica
     */
    renderHourEvents(dayEvents, hour) {
        const hourEvents = dayEvents.filter(event => {
            if (event.allDay) return hour === 0; // Mostrar eventos de dia inteiro na primeira hora
            
            const startHour = event.startTime ? parseInt(event.startTime.split(':')[0]) : 0;
            const endHour = event.endTime ? parseInt(event.endTime.split(':')[0]) : startHour + 1;
            
            return startHour <= hour && hour < endHour;
        });

        return hourEvents.map(event => `
            <div class="event-item-hour" data-event-id="${event.id}" title="${event.title}">
                <div class="event-title">${event.title}</div>
                ${event.startTime && !event.allDay ? `<div class="event-time">${event.startTime}</div>` : ''}
            </div>
        `).join('');
    }

    /**
     * Abre modal de evento
     */
    openEventModal(event = null, defaultDate = null) {
        const modal = document.getElementById('event-modal');
        const form = document.getElementById('event-form');
        const modalTitle = document.getElementById('modal-title');
        const deleteBtn = document.getElementById('delete-event');

        if (!modal || !form) return;

        this.selectedEvent = event;

        if (event) {
            // Editando evento existente
            modalTitle.textContent = 'Editar Evento';
            deleteBtn.classList.remove('d-none');
            form.classList.remove('was-validated');
            this.populateEventForm(event);
        } else {
            // Novo evento
            modalTitle.textContent = 'Novo Evento';
            deleteBtn.classList.add('d-none');
            form.reset();
            form.classList.remove('was-validated');
            const timeFields = document.getElementById('time-fields');
            if (timeFields) {
                timeFields.classList.remove('d-none');
            }
            
            if (defaultDate) {
                document.getElementById('event-start-date').value = defaultDate;
                document.getElementById('event-end-date').value = defaultDate;
            } else {
                const today = new Date().toISOString().split('T')[0];
                document.getElementById('event-start-date').value = today;
                document.getElementById('event-end-date').value = today;
            }
        }

        // Carregar contratos no select
        this.loadContractsForSelect();
        this.renderTypeOptions(document.getElementById('event-type'));

        // Mostrar modal usando Bootstrap 5 API
        if (!this.eventModal) {
            this.eventModal = new bootstrap.Modal(modal);
        }
        this.eventModal.show();
    }

    /**
     * Fecha modal de evento
     */
    closeEventModal() {
        if (this.eventModal) {
            this.eventModal.hide();
            document.body.style.overflow = '';
            this.selectedEvent = null;
        }
    }

    /**
     * Popula formulário com dados do evento
     */
    populateEventForm(event) {
        document.getElementById('event-title').value = event.title || '';
        document.getElementById('event-description').value = event.description || '';
        document.getElementById('event-start-date').value = event.startDate || '';
        document.getElementById('event-end-date').value = event.endDate || event.startDate || '';
        document.getElementById('event-start-time').value = event.startTime || '09:00';
        document.getElementById('event-end-time').value = event.endTime || '10:00';
        document.getElementById('event-location').value = event.location || '';
        document.getElementById('all-day-event').checked = event.allDay || false;
        document.getElementById('event-attendees').value = (event.attendees || []).join(', ');
        document.getElementById('event-type').value = event.eventType || '';
        document.getElementById('event-booking-link').value = event.bookingLink || '';

        // Configurar campos de contrato
        if (event.contractId) {
            document.getElementById('event-contract').value = event.contractId;
        }

        // Ocultar campos de hora se for dia inteiro
        const timeFields = document.getElementById('time-fields');
        if (timeFields) {
            timeFields.classList.toggle('d-none', !!event.allDay);
        }
    }

    /**
     * Carrega contratos para o select
     */
    async loadContractsForSelect() {
        const select = document.getElementById('event-contract');
        if (!select || !window.firestoreService) return;

        try {
            // Buscar somente uma página enxuta para o seletor (evita full-read).
            let contracts = [];

            if (typeof window.firestoreService.getContractsPage === 'function') {
                const page = await window.firestoreService.getContractsPage({
                    limit: 50,
                    page: 1,
                    sortKey: 'updatedAt',
                    sortDirection: 'desc',
                    includeArchived: false
                });
                contracts = Array.isArray(page?.contracts) ? page.contracts : [];
            } else {
                // Fallback legado
                contracts = await window.firestoreService.getAllContracts();
            }
            
            // Limpar e popular select
            select.innerHTML = '<option value="">Selecione um contrato (opcional)</option>';
            
            contracts.slice(0, 50).forEach(contract => {
                const option = document.createElement('option');
                option.value = contract.id;
                option.textContent = `${contract.clientePrincipal} - ${contract.empreendimento}`;
                select.appendChild(option);
            });

        } catch (error) {
            console.error(' Erro ao carregar contratos:', error);
        }
    }

    /**
     * Salva evento
     */
    async saveEvent(e) {
        e.preventDefault();
        const form = document.getElementById('event-form');
        if (form && !form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }
        
        if (!this.calendarService.isReady()) {
            this.showError('Agenda não está pronta');
            return;
        }

        try {
            const formData = this.getEventFormData();
            
            if (this.selectedEvent) {
                // Atualizar evento existente
                await this.calendarService.updateEvent(this.selectedEvent.id, formData);
                this.showSuccess('Evento atualizado com sucesso!');
            } else {
                // Criar novo evento
                await this.calendarService.createEvent(formData);
                this.showSuccess('Evento criado com sucesso!');
            }

            this.closeEventModal();
            await this.loadEvents();

        } catch (error) {
            console.error(' Erro ao salvar evento:', error);
            this.showError('Erro ao salvar evento: ' + error.message);
        }
    }

    /**
     * Coleta dados do formulário de evento
     */
    getEventFormData() {
        const attendeesText = document.getElementById('event-attendees').value;
        const attendees = attendeesText ? attendeesText.split(',').map(email => email.trim()).filter(Boolean) : [];
        
        const reminders = [];
        if (document.getElementById('reminder-15').checked) reminders.push(15);
        if (document.getElementById('reminder-60').checked) reminders.push(60);
        if (document.getElementById('reminder-1440').checked) reminders.push(1440);

        return {
            title: document.getElementById('event-title').value,
            description: document.getElementById('event-description').value,
            startDate: document.getElementById('event-start-date').value,
            endDate: document.getElementById('event-end-date').value,
            startTime: document.getElementById('event-start-time').value,
            endTime: document.getElementById('event-end-time').value,
            allDay: document.getElementById('all-day-event').checked,
            location: document.getElementById('event-location').value,
            attendees,
            reminders,
            contractId: document.getElementById('event-contract').value || null,
            clienteName: this.getClientNameFromContract(document.getElementById('event-contract').value),
            eventType: document.getElementById('event-type').value || 'outro',
            bookingLink: document.getElementById('event-booking-link').value || null
        };
    }

    /**
     * Obtém nome do cliente do contrato selecionado
     */
    getClientNameFromContract(contractId) {
        if (!contractId || !window.firestoreService) return null;
        
        // Esta é uma simplificação - seria melhor ter um cache dos contratos
        const select = document.getElementById('event-contract');
        const selectedOption = select.querySelector(`option[value="${contractId}"]`);
        
        if (selectedOption) {
            return selectedOption.textContent.split(' - ')[0];
        }
        
        return null;
    }

    async copyBookingLink() {
        try {
            const formData = this.getEventFormData();
            const link = window.bookingLinkService?.generatePublicLink(
                formData.contractId || 'undefined',
                formData.eventType
            ) || `${window.location.origin}/scheduling-portal.html?contract=${formData.contractId}&type=${formData.eventType}`;
            document.getElementById('event-booking-link').value = link;
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(link);
                this.showSuccess('Link de agendamento copiado para a área de transferência!');
            } else {
                this.showError('Clipboard não suportado. Copie manualmente o link.');
            }
        } catch (error) {
            console.error(' Erro ao copiar link de agendamento:', error);
            this.showError('Não foi possível gerar o link.');
        }
    }

    async copyWhatsappMessage() {
        try {
            const formData = this.getEventFormData();
            const link = window.bookingLinkService?.generatePublicLink(
                formData.contractId || 'undefined',
                formData.eventType
            ) || `${window.location.origin}/scheduling-portal.html?contract=${formData.contractId}&type=${formData.eventType}`;

            const dateStr = formData.startDate
                ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(`${formData.startDate}T00:00:00`))
                : 'data a combinar';
            const timeStr = formData.allDay ? 'dia inteiro' : formData.startTime ? `às ${formData.startTime}` : '';

            const message = `Olá! \n\nPrecisamos agendar um(a) ${formData.eventType} com você.\n Data: ${dateStr}\n Hora: ${timeStr}\n\nClique no link abaixo para confirmar o agendamento:\n${link}\n\nAguardamos seu retorno!`;

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(message);
                this.showSuccess('Mensagem copiada! Abra o WhatsApp para enviar.');
            }
            window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
        } catch (error) {
            console.error(' Erro ao copiar mensagem do WhatsApp:', error);
            this.showError('Não foi possível preparar a mensagem.');
        }
    }

    /**
     * Exclui evento
     */
    async deleteEvent() {
        if (!this.selectedEvent || !confirm('Tem certeza que deseja excluir este evento?')) {
            return;
        }

        try {
            await this.calendarService.deleteEvent(this.selectedEvent.id);
            this.showSuccess('Evento excluído com sucesso!');
            this.closeEventModal();
            await this.loadEvents();

        } catch (error) {
            console.error(' Erro ao excluir evento:', error);
            this.showError('Erro ao excluir evento: ' + error.message);
        }
    }

    /**
     * Sincroniza calendário
     */
    async syncCalendar() {
        const syncBtn = document.getElementById('sync-calendar-btn');
        if (!syncBtn) return;

        const originalText = syncBtn.innerHTML;
        syncBtn.innerHTML = '<i class="bi bi-arrow-clockwise spinning me-2"></i>Sincronizando...';
        syncBtn.disabled = true;

        try {
            const result = await this.calendarService.syncEvents();
            
            if (result.success) {
                this.showSuccess('Sincronização concluída!');
                await this.loadEvents();
            } else {
                this.showError('Erro na sincronização: ' + result.error);
            }

        } catch (error) {
            console.error(' Erro na sincronização:', error);
            this.showError('Erro na sincronização: ' + error.message);
        } finally {
            syncBtn.innerHTML = originalText;
            syncBtn.disabled = false;
        }
    }

    // Métodos auxiliares para navegação e formatação

    navigatePeriod(direction) {
        switch (this.currentView) {
            case 'month':
                this.currentDate.setMonth(this.currentDate.getMonth() + direction);
                break;
            case 'week':
                this.currentDate.setDate(this.currentDate.getDate() + (7 * direction));
                break;
            case 'day':
                this.currentDate.setDate(this.currentDate.getDate() + direction);
                break;
        }
        this.loadEvents();
    }

    goToToday() {
        this.currentDate = new Date();
        this.loadEvents();
    }

    formatPeriodDisplay() {
        switch (this.currentView) {
            case 'month':
                return this.formatDate(this.currentDate, 'monthYear');
            case 'week': {
                const weekStart = this.getWeekStart(this.currentDate);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);
                return `${this.formatDate(weekStart, 'short')} - ${this.formatDate(weekEnd, 'short')}`;
            }
            case 'day':
                return this.formatDate(this.currentDate, 'full');
            default:
                return '';
        }
    }

    formatDate(date, format) {
        const options = {
            monthYear: { year: 'numeric', month: 'long' },
            full: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
            short: { month: 'short', day: 'numeric' }
        };

        return new Intl.DateTimeFormat('pt-BR', options[format]).format(date);
    }

    getDayName(date) {
        return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date);
    }

    getWeekStart(date) {
        const start = new Date(date);
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Ajustar para segunda-feira
        start.setDate(diff);
        return start;
    }

    getViewStartDate() {
        switch (this.currentView) {
            case 'month': {
                const start = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
                start.setDate(start.getDate() - (start.getDay() || 7) + 1);
                return start;
            }
            case 'week':
                return this.getWeekStart(this.currentDate);
            case 'day':
                return new Date(this.currentDate);
        }
    }

    getViewEndDate() {
        switch (this.currentView) {
            case 'month': {
                const end = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
                end.setDate(end.getDate() + (7 - end.getDay()) % 7);
                return end;
            }
            case 'week': {
                const weekEnd = this.getWeekStart(this.currentDate);
                weekEnd.setDate(weekEnd.getDate() + 6);
                return weekEnd;
            }
            case 'day': {
                const dayEnd = new Date(this.currentDate);
                dayEnd.setHours(23, 59, 59, 999);
                return dayEnd;
            }
        }
    }

    getEventsForDate(date) {
        const dateStr = date.toISOString().split('T')[0];
        return this.events.filter(event => {
            return event.startDate === dateStr || 
                   (event.endDate && event.startDate <= dateStr && dateStr <= event.endDate);
        });
    }

    isToday(date) {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }

    showSuccess(message) {
        if (window.showNotification) {
            window.showNotification(message, 'success');
        } else {
            alert(message);
        }
    }

    showError(message) {
        if (window.showNotification) {
            window.showNotification(message, 'error');
        } else {
            alert('Erro: ' + message);
        }
    }
}

// CSS adicional para o calendário
const agendaStyles = `
<style>
.calendar-header .calendar-day-header {
    padding: 1rem;
    background: var(--light-color);
    border: 1px solid #dee2e6;
    text-align: center;
    font-weight: 600;
    color: var(--dark-color);
}

.calendar-week {
    min-height: 120px;
}

.calendar-day {
    border: 1px solid #dee2e6;
    padding: 0.5rem;
    cursor: pointer;
    transition: background-color 0.2s;
    min-height: 120px;
}

.calendar-day:hover {
    background-color: #f8f9fa;
}

.calendar-day.today {
    background-color: #e3f2fd;
    border-color: var(--primary-color);
}

.calendar-day.other-month {
    color: #adb5bd;
    background-color: #f8f9fa;
}

.day-number {
    font-weight: 600;
    margin-bottom: 0.25rem;
}

.day-events {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.event-item {
    background: var(--primary-color);
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.event-item:hover {
    background: var(--info-color);
}

.more-events {
    font-size: 0.7rem;
    color: var(--secondary-color);
    text-align: center;
    cursor: pointer;
}

.calendar-week-view, .calendar-day-view {
    display: flex;
    height: 600px;
    overflow: auto;
}

.time-column {
    width: 80px;
    flex-shrink: 0;
    border-right: 1px solid #dee2e6;
}

.time-slot {
    height: 60px;
    padding: 0.25rem;
    border-bottom: 1px solid #eee;
    font-size: 0.75rem;
    color: var(--secondary-color);
    display: flex;
    align-items: center;
}

.days-container {
    flex: 1;
}

.days-header {
    display: flex;
    height: 60px;
    border-bottom: 2px solid #dee2e6;
}

.day-header {
    flex: 1;
    padding: 0.5rem;
    text-align: center;
    border-right: 1px solid #dee2e6;
}

.day-header.today {
    background-color: #e3f2fd;
    color: var(--primary-color);
    font-weight: 600;
}

.day-name {
    font-size: 0.8rem;
    color: var(--secondary-color);
}

.day-number {
    font-size: 1.2rem;
    font-weight: 600;
}

.days-grid {
    display: flex;
    height: calc(100% - 60px);
}

.day-column {
    flex: 1;
    border-right: 1px solid #dee2e6;
}

.hour-slot {
    height: 60px;
    border-bottom: 1px solid #eee;
    position: relative;
    padding: 2px;
}

.event-item-hour {
    background: var(--primary-color);
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.75rem;
    cursor: pointer;
    margin: 1px 0;
    position: relative;
    z-index: 10;
}

.event-item-sidebar {
    padding: 0.75rem;
    border-bottom: 1px solid #eee;
    cursor: pointer;
    transition: background-color 0.2s;
}

.event-item-sidebar:hover {
    background-color: #f8f9fa;
}

.event-time {
    font-size: 0.75rem;
    color: var(--primary-color);
    font-weight: 600;
    white-space: nowrap;
}

.event-title {
    font-weight: 500;
    line-height: 1.2;
}

.spinning {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
</style>
`;

// Adicionar estilos ao head
document.head.insertAdjacentHTML('beforeend', agendaStyles);

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        console.log(' Inicializando Agenda UI...');
        window.agendaUI = new AgendaUI();
    }, 1000);
});

// Exposição global
window.AgendaUI = AgendaUI;

console.log(' Agenda UI carregada');
