// @file schedulingPortal.js
// @description Lógica para o portal de agendamento público (scheduling-portal.html)
// Permite que clientes confirmem agendamentos via link compartilhado

class SchedulingPortal {
  constructor() {
    this.contractId = null;
    this.eventType = null;
    this.contractData = null;
    this.eventData = null;
    this.init();
  }

  init() {
    this.parseUrlParams();
    this.loadContractData();
    this.bindFormEvents();
  }

  parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    this.contractId = params.get('contract');
    this.eventType = params.get('type') || 'outro';

    if (!this.contractId) {
      this.showError('ID do contrato não fornecido no link.');
    }
  }

  async loadContractData() {
    try {
      this.showLoading();

      // Simular carregamento de dados do contrato (em produção, seria via API)
      // Por enquanto, exibir campos genéricos
      await this.simulateContractLoad();

      this.renderForm();
      this.hideLoading();
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      this.showError(`Erro ao carregar dados do agendamento: ${error.message}`);
    }
  }

  async simulateContractLoad() {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.contractData = {
          id: this.contractId,
          clientePrincipal: 'Cliente Padrão',
          empreendimento: 'Imóvel em análise'
        };
        this.eventData = {
          eventType: this.eventType,
          startDate: this.getNextValidDate(),
          startTime: '10:00'
        };
        resolve();
      }, 500);
    });
  }

  getNextValidDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  renderForm() {
    document.getElementById('contract-client').textContent = this.contractData.clientePrincipal;
    document.getElementById('contract-property').textContent = `Imóvel: ${this.contractData.empreendimento}`;
    document.getElementById('schedule-date').value = this.eventData.startDate;
    document.getElementById('schedule-time').value = this.eventData.startTime;
    document.getElementById('schedule-type').value = this.eventType;

    document.getElementById('scheduling-form').style.display = 'block';
  }

  bindFormEvents() {
    const form = document.getElementById('scheduling-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleFormSubmit(e));
    }
  }

  async handleFormSubmit(e) {
    e.preventDefault();

    const form = document.getElementById('scheduling-form');
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    try {
      const formData = {
        clientName: document.getElementById('client-name').value,
        clientEmail: document.getElementById('client-email').value,
        clientPhone: document.getElementById('client-phone').value,
        scheduledDate: document.getElementById('schedule-date').value,
        scheduledTime: document.getElementById('schedule-time').value,
        eventType: this.eventType,
        notes: document.getElementById('schedule-notes').value,
        contractId: this.contractId,
        confirmedAt: new Date().toISOString()
      };

      // Simular envio de dados
      await this.submitScheduling(formData);

      this.showSuccess(formData);
    } catch (error) {
      console.error('Erro ao confirmar agendamento:', error);
      this.showError(`Erro ao confirmar: ${error.message}`);
    }
  }

  async submitScheduling(data) {
    return new Promise((resolve) => {
      // Em produção, aqui seria feita uma chamada à API/Cloud Function
      // Por enquanto, apenas simular um delay
      setTimeout(() => {
        console.log(' Agendamento confirmado:', data);
        // Armazenar confirmação em localStorage para referência
        localStorage.setItem(`scheduling_${this.contractId}_${Date.now()}`, JSON.stringify(data));
        resolve();
      }, 500);
    });
  }

  showLoading() {
    document.getElementById('loading-state').style.display = 'flex';
    document.getElementById('error-state').style.display = 'none';
    document.getElementById('success-state').style.display = 'none';
    document.getElementById('scheduling-form').style.display = 'none';
  }

  hideLoading() {
    document.getElementById('loading-state').style.display = 'none';
  }

  showError(message) {
    document.getElementById('error-message').textContent = message;
    document.getElementById('error-state').style.display = 'block';
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('scheduling-form').style.display = 'none';
    document.getElementById('success-state').style.display = 'none';
  }

  showSuccess(data) {
    document.getElementById('success-date').textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(`${data.scheduledDate}T00:00:00`));
    document.getElementById('success-time').textContent = data.scheduledTime;
    document.getElementById('success-type').textContent = this.eventType;

    document.getElementById('success-state').style.display = 'block';
    document.getElementById('scheduling-form').style.display = 'none';
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'none';
  }
}

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  window.schedulingPortal = new SchedulingPortal();
});
