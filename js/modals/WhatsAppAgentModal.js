export const WhatsAppAgentModal = {
  id: 'whatsapp-agent-modal',

  render() {
    const existing = document.getElementById(this.id);
    if (existing) {
      return bootstrap?.Modal?.getOrCreateInstance
        ? bootstrap.Modal.getOrCreateInstance(existing)
        : null;
    }

    const html = `
      <div class="modal fade" id="whatsapp-agent-modal" tabindex="-1" aria-labelledby="whatsappAgentModalLabel" aria-hidden="true">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="whatsappAgentModalLabel">
                <i class="bi bi-person-gear me-2"></i>Registrar como Agente WhatsApp
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body" id="whatsapp-agent-modal-body">
              <!-- Conteúdo dinâmico -->
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-primary" id="whatsapp-save-agent-btn">
                <i class="bi bi-save me-2"></i>Salvar
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const el = document.getElementById(this.id);
    return bootstrap?.Modal ? new bootstrap.Modal(el) : null;
  },
};
