/**
 * @file processScheduleIntegration.js
 * @description Integração entre agenda e detalhes do processo
 */

class ProcessScheduleIntegration {
    constructor() {
        this.currentContract = null;
        this.scheduleModal = null;
        this.scheduleTypes = [];
        this.initializeAsync();
    }

    /**
     * Inicialização assíncrona
     */
    async initializeAsync() {
        try {
            console.log(' Inicializando Process Schedule Integration...');
            
            // Aguardar dependências
            await this.waitForDependencies();

            // Carregar tipos de agendamento
            await this.loadScheduleTypes();
            
            // Configurar modal de agendamento
            this.createScheduleModal();
            
            // Vincular eventos
            this.bindEvents();
            
            console.log(' Process Schedule Integration inicializado');
            
        } catch (error) {
            console.error(' Erro ao inicializar Process Schedule Integration:', error);
        }
    }

    /**
     * Aguarda dependências necessárias
     */
    async waitForDependencies() {
        return new Promise((resolve) => {
            const checkDeps = () => {
                if (window.localCalendarService && window.eventsDataService && window.scheduleTypesService) {
                    resolve();
                } else {
                    setTimeout(checkDeps, 100);
                }
            };
            checkDeps();
        });
    }

    /**
     * Carrega tipos de agendamento disponíveis
     */
    async loadScheduleTypes() {
        try {
            this.scheduleTypes = await window.scheduleTypesService.getTypes();
        } catch (error) {
            console.warn(' Falha ao carregar tipos de agendamento:', error);
            this.scheduleTypes = window.DEFAULT_SCHEDULE_TYPES || [];
        }
    }

    /**
     * Cria modal de agendamento rápido
     */
    createScheduleModal() {
        const modalHTML = `
            <div id="quick-schedule-modal" class="modal fade" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered modal-lg app-modal-dialog">
                    <div class="modal-content modal-shell">
                        <div class="modal-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-1">
                            <h2 class="modal-title mb-0">
                                <i class="bi bi-calendar-event text-primary"></i>
                                Agendar Compromisso
                            </h2>
                            <button type="button" id="close-quick-schedule-modal" class="btn-close btn-close-modern" data-bs-dismiss="modal" aria-label="Fechar">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    
                    <form id="quick-schedule-form" class="needs-validation" novalidate>
                        <div class="modal-body">
                            <!-- Informações do Processo -->
                            <div class="alert alert-info">
                                <div class="d-flex align-items-center">
                                    <i class="bi bi-info-circle me-2"></i>
                                    <div>
                                        <strong>Processo:</strong> 
                                        <span id="schedule-client-name">-</span> - 
                                        <span id="schedule-empreendimento">-</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Tipo de Compromisso (dinâmico) -->
                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="bi bi-ui-checks me-2"></i>
                                    Tipo de Compromisso
                                </label>
                                <select class="form-select" id="schedule-event-type" required>
                                    <option value="">Selecione o tipo...</option>
                                </select>
                                <div class="invalid-feedback">Selecione um tipo.</div>
                            </div>

                            <!-- Título Personalizado -->
                            <div class="mb-3">
                                <div class="form-floating">
                                    <input type="text" class="form-control" id="schedule-custom-title" placeholder="Título personalizado">
                                    <label for="schedule-custom-title">
                                        <i class="bi bi-type me-2"></i>
                                        Título Personalizado (opcional)
                                    </label>
                                </div>
                            </div>

                            <!-- Data e Hora -->
                            <div class="row g-3 mb-3">
                                <div class="col-md-6">
                                    <div class="form-floating">
                                        <input type="date" class="form-control" id="schedule-date" required>
                                        <label for="schedule-date">Data</label>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="form-floating">
                                        <input type="time" class="form-control" id="schedule-time" value="10:00">
                                        <label for="schedule-time">Horário</label>
                                    </div>
                                </div>
                            </div>

                            <!-- Duração -->
                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="bi bi-clock me-2"></i>
                                    Duração
                                </label>
                                <select class="form-select" id="schedule-duration">
                                    <option value="30">30 minutos</option>
                                    <option value="60" selected>1 hora</option>
                                    <option value="90">1h 30min</option>
                                    <option value="120">2 horas</option>
                                    <option value="180">3 horas</option>
                                    <option value="240">4 horas</option>
                                    <option value="full-day">Dia inteiro</option>
                                </select>
                            </div>

                            <!-- Local -->
                            <div class="mb-3">
                                <div class="form-floating">
                                    <input type="text" class="form-control" id="schedule-location" placeholder="Local do compromisso">
                                    <label for="schedule-location">
                                        <i class="bi bi-geo-alt me-2"></i>
                                        Local
                                    </label>
                                </div>
                            </div>

                            <!-- Descrição -->
                            <div class="mb-3">
                                <div class="form-floating">
                                    <textarea class="form-control" id="schedule-description" style="height: 100px" placeholder="Observações sobre o compromisso"></textarea>
                                    <label for="schedule-description">
                                        <i class="bi bi-text-paragraph me-2"></i>
                                        Observações
                                    </label>
                                </div>
                            </div>

                            <!-- Lembrete -->
                            <div class="mb-3">
                                <label class="form-label">
                                    <i class="bi bi-alarm me-2"></i>
                                    Lembrete
                                </label>
                                <select class="form-select" id="schedule-reminder">
                                    <option value="">Sem lembrete</option>
                                    <option value="15">15 minutos antes</option>
                                    <option value="30">30 minutos antes</option>
                                    <option value="60" selected>1 hora antes</option>
                                    <option value="120">2 horas antes</option>
                                    <option value="1440">1 dia antes</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="modal-footer border-top">
                            <button type="button" class="btn btn-secondary" id="cancel-quick-schedule">
                                <i class="bi bi-x-circle me-2"></i>
                                Cancelar
                            </button>
                            <button type="button" class="btn btn-success" id="share-scheduling-link">
                                <i class="bi bi-whatsapp me-2"></i>
                                Enviar para Cliente
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="bi bi-check-circle me-2"></i>
                                Agendar Compromisso
                            </button>
                        </div>
                    </form>
                    </div>
                </div>
            </div>
        `;

        // Adicionar modal ao body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        // Não inicializar a instância aqui - será feita sob demanda em openScheduleModal()
    }

    /**
     * Vincula eventos da interface
     */
    bindEvents() {
        // Usar event delegation para o botão de agendamento (renderizado dinamicamente)
        document.addEventListener('click', (e) => {
            if (e.target?.id === 'schedule-event-btn' || e.target?.closest('#schedule-event-btn')) {
                this.openScheduleModal();
            }
        });

        // Fechar modal de agendamento
        document.addEventListener('click', (e) => {
            if (e.target?.id === 'close-quick-schedule-modal' || e.target?.closest('#close-quick-schedule-modal')) {
                this.closeScheduleModal();
            }
            if (e.target?.id === 'cancel-quick-schedule' || e.target?.closest('#cancel-quick-schedule')) {
                this.closeScheduleModal();
            }
        });

        // Compartilhar link para cliente (WhatsApp)
        document.getElementById('share-scheduling-link')?.addEventListener('click', () => {
            this.shareSchedulingLinkWithClient();
        });

        // Formulário de agendamento
        document.getElementById('quick-schedule-form')?.addEventListener('submit', (e) => {
            this.handleScheduleSubmit(e);
        });

        // Renderizar tipos de agendamento no select quando modal abre
        const scheduleModal = document.getElementById('quick-schedule-modal');
        if (scheduleModal) {
            const observer = new MutationObserver(() => {
                if (scheduleModal.style.display === 'block') {
                    this.renderTypeOptions();
                }
            });
            observer.observe(scheduleModal, { attributes: true });
        }

        // Observar abertura do modal de detalhes para capturar contrato atual
        this.observeDetailsModal();
    }

    /**
     * Renderiza opções de tipos de agendamento no select
     */
    renderTypeOptions() {
        const select = document.getElementById('schedule-event-type');
        if (!select) return;

        select.innerHTML = '<option value="">Selecione o tipo...</option>';
        (this.scheduleTypes || []).forEach((type) => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.name;
            option.dataset.description = type.description || '';
            select.appendChild(option);
        });
    }

    /**
     * Observa abertura do modal de detalhes
     */
    observeDetailsModal() {
        const detailsModal = document.getElementById('details-modal');
        if (!detailsModal) return;

        // Usar MutationObserver para detectar quando modal abre
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    if (detailsModal.style.display === 'block') {
                        this.captureCurrentContract();
                    }
                }
            });
        });

        observer.observe(detailsModal, { attributes: true });
    }

    /**
     * Captura contrato atual do modal de detalhes
     */
    captureCurrentContract() {
        try {
            // Buscar dados do contrato no modal
            const contractId = document.getElementById('modal-contract-id')?.value;
            const clienteName = document.getElementById('modal-clientePrincipal')?.value || 
                             document.querySelector('#details-modal .cliente-name')?.textContent;
            const empreendimento = document.getElementById('modal-empreendimento')?.value ||
                                 document.querySelector('#details-modal .empreendimento-name')?.textContent;

            if (contractId) {
                this.currentContract = {
                    id: contractId,
                    clientePrincipal: clienteName || 'Cliente não identificado',
                    empreendimento: empreendimento || 'Empreendimento não identificado'
                };

                console.log(' Contrato capturado para agendamento:', this.currentContract);
            }
        } catch (error) {
            console.warn(' Erro ao capturar contrato atual:', error);
        }
    }

    /**
     * Abre modal de agendamento
     */
    openScheduleModal() {
        if (!this.currentContract) {
            this.showError('Erro: Contrato não identificado. Tente novamente.');
            return;
        }

        // Preencher informações do processo
        document.getElementById('schedule-client-name').textContent = this.currentContract.clientePrincipal;
        document.getElementById('schedule-empreendimento').textContent = this.currentContract.empreendimento;

        // Definir data padrão (amanhã)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        document.getElementById('schedule-date').value = tomorrow.toISOString().split('T')[0];

        // Limpar formulário
        const form = document.getElementById('quick-schedule-form');
        form.reset();
        form.classList.remove('was-validated');
        document.getElementById('schedule-date').value = tomorrow.toISOString().split('T')[0];
        document.getElementById('schedule-time').value = '10:00';
        document.getElementById('schedule-duration').value = '60';
        document.getElementById('schedule-reminder').value = '60';

        // Renderizar tipos de agendamento
        this.renderTypeOptions();

        // Mostrar modal usando Bootstrap 5 API
        if (!this.scheduleModal) {
            this.scheduleModal = new bootstrap.Modal(document.getElementById('quick-schedule-modal'));
        }
        this.scheduleModal.show();
    }

    /**
     * Fecha modal de agendamento
     */
    closeScheduleModal() {
        if (this.scheduleModal) {
            this.scheduleModal.hide();
        }
        document.body.style.overflow = '';
    }

    /**
     * Atualiza título sugerido baseado no tipo
     */
    updateSuggestedTitle(eventType) {
        if (!this.currentContract) return;

        const titles = {
            'reuniao': `Reunião - ${this.currentContract.clientePrincipal}`,
            'assinatura': `Assinatura de Contrato - ${this.currentContract.clientePrincipal}`,
            'vistoria': `Vistoria - ${this.currentContract.empreendimento}`,
            'documentacao': `Entrega de Documentação - ${this.currentContract.clientePrincipal}`,
            'cartorio': `Cartório - ${this.currentContract.empreendimento}`,
            'itbi': `Pagamento ITBI - ${this.currentContract.empreendimento}`,
            'registro': `Registro - ${this.currentContract.empreendimento}`,
            'entrega': `Entrega de Chaves - ${this.currentContract.empreendimento}`,
            'follow-up': `Follow-up - ${this.currentContract.clientePrincipal}`
        };

        const customTitleField = document.getElementById('schedule-custom-title');
        if (customTitleField && !customTitleField.value) {
            customTitleField.placeholder = titles[eventType] || `Compromisso - ${this.currentContract.clientePrincipal}`;
        }
    }

    /**
     * Processa envio do formulário de agendamento
     */
    async handleScheduleSubmit(e) {
        e.preventDefault();

        const form = document.getElementById('quick-schedule-form');
        if (form && !form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }

        if (!this.currentContract) {
            this.showError('Erro: Contrato não identificado.');
            return;
        }

        try {
            const formData = this.getScheduleFormData();
            
            // Criar evento usando o serviço local
            await window.localCalendarService.createEventFromContract(
                this.currentContract,
                formData
            );

            this.showSuccess('Compromisso agendado com sucesso!');
            this.closeScheduleModal();

            // Atualizar lista de eventos se agenda estiver aberta
            if (window.agendaUI) {
                await window.agendaUI.loadEvents();
            }

        } catch (error) {
            console.error(' Erro ao agendar compromisso:', error);
            this.showError('Erro ao agendar compromisso: ' + error.message);
        }
    }

    /**
     * Coleta dados do formulário de agendamento
     */
    getScheduleFormData() {
        const eventType = document.getElementById('schedule-event-type').value;
        const customTitle = document.getElementById('schedule-custom-title').value;
        const date = document.getElementById('schedule-date').value;
        const time = document.getElementById('schedule-time').value;
        const duration = document.getElementById('schedule-duration').value;
        const location = document.getElementById('schedule-location').value;
        const description = document.getElementById('schedule-description').value;
        const reminder = document.getElementById('schedule-reminder').value;

        // Encontrar o tipo selecionado para obter o nome formatado
        const selectedTypeObj = (this.scheduleTypes || []).find(t => t.id === eventType);
        const typeLabel = selectedTypeObj?.name || eventType;

        // Determinar título do evento
        let title = customTitle;
        if (!title) {
            title = `${typeLabel} - ${this.currentContract.clientePrincipal}`;
        }

        // Calcular horário de fim
        let endTime = null;
        let allDay = false;

        if (duration === 'full-day') {
            allDay = true;
        } else {
            const startTime = new Date(`1970-01-01T${time}:00`);
            const endTimeDate = new Date(startTime.getTime() + (parseInt(duration) * 60000));
            endTime = endTimeDate.toTimeString().slice(0, 5);
        }

        // Preparar descrição completa
        let fullDescription = `Tipo: ${typeLabel}\n`;
        fullDescription += `Cliente: ${this.currentContract.clientePrincipal}\n`;
        fullDescription += `Empreendimento: ${this.currentContract.empreendimento}\n`;
        if (description) {
            fullDescription += `\nObservações: ${description}`;
        }

        return {
            title: title,
            description: fullDescription,
            startDate: date,
            endDate: date,
            startTime: allDay ? null : time,
            endTime: allDay ? null : endTime,
            allDay: allDay,
            location: location,
            reminders: reminder ? [parseInt(reminder)] : [],
            attendees: [],
            eventType: eventType,
            bookingLink: null
        };
    }

    /**
     * Compartilha link de agendamento com cliente via WhatsApp
     */
    async shareSchedulingLinkWithClient() {
        if (!this.currentContract) {
            this.showError('Contrato não identificado.');
            return;
        }

        try {
            const formData = this.getScheduleFormData();

            // Gerar link de agendamento
            const bookingLink = window.bookingLinkService?.generatePublicLink(
                this.currentContract.id,
                formData.eventType
            ) || '#';

            // Construir mensagem
            const whatsAppMessage = window.bookingLinkService?.buildWhatsAppMessage(
                this.currentContract,
                formData
            ) || `Olá! Precisamos agendar um compromisso com você. ${bookingLink}`;

            // Copiar link e abrir WhatsApp
            if (window.bookingLinkService) {
                await window.bookingLinkService.copyToClipboard(whatsAppMessage);
                window.bookingLinkService.openWhatsApp(whatsAppMessage);
                this.showSuccess('Mensagem copiada! Abra o WhatsApp para enviar.');
            } else {
                this.showError('Serviço de link de agendamento não disponível.');
            }
        } catch (error) {
            console.error(' Erro ao compartilhar link:', error);
            this.showError('Erro ao preparar link de agendamento.');
        }
    }

    /**
     * Obtém label do tipo de evento
     */
    getEventTypeLabel(eventType) {
        const selectedTypeObj = (this.scheduleTypes || []).find(t => t.id === eventType);
        return selectedTypeObj?.name || eventType || 'Compromisso';
    }

    /**
     * Exibe mensagem de sucesso
     */
    showSuccess(message) {
        if (window.showNotification) {
            window.showNotification(message, 'success');
        } else {
            alert(message);
        }
    }

    /**
     * Exibe mensagem de erro
     */
    showError(message) {
        if (window.showNotification) {
            window.showNotification(message, 'error');
        } else {
            alert('Erro: ' + message);
        }
    }

    /**
     * Lista eventos do contrato atual
     */
    async getContractEvents() {
        if (!this.currentContract || !window.localCalendarService) {
            return [];
        }

        try {
            return await window.localCalendarService.getEventsByContract(this.currentContract.id);
        } catch (error) {
            console.error(' Erro ao buscar eventos do contrato:', error);
            return [];
        }
    }
}

// CSS adicional para o modal de agendamento
const scheduleIntegrationStyles = `
<style>
.modal-footer-buttons {
    padding-top: 1rem;
    border-top: 1px solid #dee2e6;
}

.btn-outline {
    background: transparent;
    border: 2px solid var(--primary-color);
    color: var(--primary-color);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 500;
    transition: all 0.3s ease;
    display: inline-flex;
    align-items: center;
    text-decoration: none;
}

.btn-outline:hover {
    background: var(--primary-color);
    color: white;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
}

#quick-schedule-modal .alert {
    border-radius: 8px;
    border: none;
}

#quick-schedule-modal .form-floating label {
    color: var(--secondary-color);
}

#quick-schedule-modal .form-select:focus,
#quick-schedule-modal .form-control:focus {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.schedule-summary {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem 0;
    border-left: 4px solid var(--primary-color);
}
</style>
`;

// Adicionar estilos ao head
document.head.insertAdjacentHTML('beforeend', scheduleIntegrationStyles);

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        console.log(' Inicializando Process Schedule Integration...');
        window.processScheduleIntegration = new ProcessScheduleIntegration();
    }, 1200);
});

// Exposição global
window.ProcessScheduleIntegration = ProcessScheduleIntegration;

console.log(' Process Schedule Integration carregado');