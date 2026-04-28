export const NotificationSettingsModal = {
  id: 'notification-settings-modal',

  render() {
    const existing = document.getElementById(this.id);
    if (existing) {
      if (window.bootstrap?.Modal?.getOrCreateInstance) {
        window.bootstrap.Modal.getOrCreateInstance(existing);
      }
      return existing;
    }

    // Mantém estrutura/classes/IDs para não quebrar CSS e NotificationUI.
    const html = `
      <div id="notification-settings-modal" class="modal fade notification-settings-modal" tabindex="-1" aria-labelledby="notification-settings-title" aria-hidden="true">
        <div class="modal-dialog modal-w-md">
          <div class="modal-content">
            <div class="modal-header">
            <h3 id="notification-settings-title">
              <i class="bi bi-gear"></i>
              Configurações de Notificações
            </h3>
            <button type="button" class="btn-close-modern" data-bs-dismiss="modal" aria-label="Fechar">
              <i class="bi bi-x"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="notification-setting-item">
              <div>
                <div class="notification-setting-label">Notificações Desktop</div>
                <div class="notification-setting-description">Receber notificações do sistema operacional</div>
              </div>
              <div class="form-check form-switch">
                <input type="checkbox" id="desktop-notifications-toggle" class="form-check-input" checked>
              </div>
            </div>

            <div class="notification-setting-item">
              <div>
                <div class="notification-setting-label">Sons de Notificação</div>
                <div class="notification-setting-description">Reproduzir som ao receber notificações</div>
              </div>
              <div class="form-check form-switch">
                <input type="checkbox" id="sound-notifications-toggle" class="form-check-input" checked>
              </div>
            </div>

            <div class="notification-setting-item">
              <div>
                <div class="notification-setting-label">Verificação Automática</div>
                <div class="notification-setting-description">Verificar novas notificações automaticamente</div>
              </div>
              <div class="form-check form-switch">
                <input type="checkbox" id="auto-check-toggle" class="form-check-input" checked>
              </div>
            </div>

            <div class="notification-setting-item">
              <div>
                <div class="notification-setting-label">Intervalo de Verificação</div>
                <div class="notification-setting-description">Frequência de verificação (em minutos)</div>
              </div>
              <select id="check-interval-select" class="form-select th-w-120">
                <option value="1">1 min</option>
                <option value="5" selected>5 min</option>
                <option value="10">10 min</option>
                <option value="30">30 min</option>
                <option value="60">1 hora</option>
              </select>
            </div>

            <div class="notification-setting-item">
              <div>
                <div class="notification-setting-label">Notificações de Prioridade Alta</div>
                <div class="notification-setting-description">Receber apenas notificações importantes</div>
              </div>
              <div class="form-check form-switch">
                <input type="checkbox" id="high-priority-only-toggle" class="form-check-input">
              </div>
            </div>

            <div class="notification-setting-item">
              <div>
                <div class="notification-setting-label">Limpeza Automática</div>
                <div class="notification-setting-description">Remover notificações antigas automaticamente</div>
              </div>
              <div class="form-check form-switch">
                <input type="checkbox" id="auto-cleanup-toggle" class="form-check-input" checked>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" id="save-notification-settings-btn" class="btn btn-primary">Salvar Configurações</button>
          </div>
        </div>
      </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const created = document.getElementById(this.id);
    if (created && window.bootstrap?.Modal?.getOrCreateInstance) {
      window.bootstrap.Modal.getOrCreateInstance(created);
    }
    return created;
  },
};
