// @file bookingLinkService.js
// @description Serviço para gerar e compartilhar links de agendamento para clientes
// Permite enviar via WhatsApp com mensagem pré-formatada

class BookingLinkService {
  constructor() {
    this.baseUrl = this.getBaseUrl();
  }

  getBaseUrl() {
    return new URL('.', window.location.href).toString();
  }

  generatePublicLink(contractId, eventType = 'outro') {
    const params = new URLSearchParams({
      contract: contractId,
      type: eventType,
      ts: Date.now()
    });
    const publicUrl = new URL('scheduling-portal.html', this.baseUrl);
    publicUrl.search = params.toString();
    return publicUrl.toString();
  }

  buildWhatsAppMessage(contract, eventData = {}) {
    const clientName = contract.clientePrincipal || 'Cliente';
    const eventType = eventData.eventType || 'agendamento';
    const dateStr = eventData.startDate
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(`${eventData.startDate}T00:00:00`))
      : 'data a combinar';
    const timeStr = eventData.allDay ? 'dia inteiro' : eventData.startTime ? `às ${eventData.startTime}` : '';
    const location = eventData.location ? ` Local: ${eventData.location}.` : '';

    const message = `Olá ${clientName}! \n\nPrecisamos agendar um(a) ${eventType} com você.\n Data: ${dateStr}\n Hora: ${timeStr}${location}\n\nVocê confirma ou prefere outro horário?\n\nAguardamos seu retorno!`;
    return message;
  }

  async copyToClipboard(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (error) {
      console.error(' Erro ao copiar:', error);
      return false;
    }
  }

  openWhatsApp(message, phone = '') {
    const encodedMsg = encodeURIComponent(message);
    const url = phone
      ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodedMsg}`
      : `https://wa.me/?text=${encodedMsg}`;
    window.open(url, '_blank');
  }

  async shareLink(link) {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Agendamento',
          text: 'Clique para agendar',
          url: link
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Erro ao compartilhar:', error);
          await this.copyToClipboard(link);
        }
      }
    } else {
      await this.copyToClipboard(link);
    }
  }

  buildCompleteLink(contractId, eventData) {
    const link = this.generatePublicLink(contractId, eventData.eventType);
    const message = eventData ? this.buildWhatsAppMessage(eventData.contract || {}, eventData) : '';
    return { link, message };
  }
}

window.BookingLinkService = BookingLinkService;
window.bookingLinkService = new BookingLinkService();
