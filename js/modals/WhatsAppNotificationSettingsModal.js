export const WhatsAppNotificationSettingsModal = {
  id: 'whatsapp-notification-settings-modal',

  render() {
    const existing = document.getElementById(this.id);
    if (existing) {
      return bootstrap?.Modal?.getOrCreateInstance
        ? bootstrap.Modal.getOrCreateInstance(existing)
        : null;
    }

    const html = `
      <div class="modal fade" id="whatsapp-notification-settings-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                <i class="bi bi-gear me-2"></i>Configurações de Notificações
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
              <form id="whatsapp-notification-settings-form">
                <div class="mb-3">
                  <h6 class="mb-3">Tipos de Notificação</h6>

                  <div class="form-check form-switch mb-2">
                    <input class="form-check-input" type="checkbox" id="notify-new-message" checked>
                    <label class="form-check-label" for="notify-new-message">Nova mensagem</label>
                  </div>

                  <div class="form-check form-switch mb-2">
                    <input class="form-check-input" type="checkbox" id="notify-new-chat" checked>
                    <label class="form-check-label" for="notify-new-chat">Novo chat</label>
                  </div>

                  <div class="form-check form-switch mb-2">
                    <input class="form-check-input" type="checkbox" id="notify-chat-assigned" checked>
                    <label class="form-check-label" for="notify-chat-assigned">Chat atribuído a mim</label>
                  </div>

                  <div class="form-check form-switch mb-2">
                    <input class="form-check-input" type="checkbox" id="notify-chat-transferred" checked>
                    <label class="form-check-label" for="notify-chat-transferred">Chat transferido</label>
                  </div>

                  <div class="form-check form-switch mb-2">
                    <input class="form-check-input" type="checkbox" id="notify-mention" checked>
                    <label class="form-check-label" for="notify-mention">Menção em comentário</label>
                  </div>
                </div>

                <div class="mb-3">
                  <h6 class="mb-3">Preferências</h6>

                  <div class="form-check form-switch mb-2">
                    <input class="form-check-input" type="checkbox" id="notify-sound-enabled" checked>
                    <label class="form-check-label" for="notify-sound-enabled">Ativar sons</label>
                  </div>

                  <div class="form-check form-switch mb-2">
                    <input class="form-check-input" type="checkbox" id="notify-desktop-enabled" checked>
                    <label class="form-check-label" for="notify-desktop-enabled">Notificações desktop</label>
                  </div>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
              <button type="button" class="btn btn-primary" id="whatsapp-save-notification-settings-btn">
                <i class="bi bi-check-lg"></i> Salvar
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
