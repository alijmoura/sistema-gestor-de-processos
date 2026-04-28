export const NotificationCenterOffcanvas = {
  id: 'notification-center',

  render() {
    const existing = document.getElementById(this.id);
    if (existing) {
      return bootstrap?.Offcanvas?.getOrCreateInstance
        ? bootstrap.Offcanvas.getOrCreateInstance(existing)
        : null;
    }

    const html = `
      <div class="offcanvas offcanvas-end" tabindex="-1" id="notification-center" aria-labelledby="notification-center-title">
        <div class="offcanvas-header">
          <h5 class="offcanvas-title" id="notification-center-title">
            <i class="bi bi-bell-fill text-primary me-2"></i>Centro de Notificações
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Fechar"></button>
        </div>
        <div class="offcanvas-body p-0">
          <ul class="nav nav-pills nav-justified border-bottom" id="notification-center-tabs" role="tablist">
            <li class="nav-item" role="presentation">
              <button class="nav-link active d-flex align-items-center justify-content-center gap-2" id="notification-tab-geral-btn"
                      data-bs-toggle="pill" data-bs-target="#notification-tab-geral" type="button" role="tab"
                      aria-controls="notification-tab-geral" aria-selected="true">
                <i class="bi bi-grid"></i>
                <span>Geral</span>
                <span class="badge bg-secondary ms-1 d-none" id="notification-tab-general-count">0</span>
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link d-flex align-items-center justify-content-center gap-2" id="notification-tab-whatsapp-btn"
                      data-bs-toggle="pill" data-bs-target="#notification-tab-whatsapp" type="button" role="tab"
                      aria-controls="notification-tab-whatsapp" aria-selected="false">
                <i class="bi bi-whatsapp"></i>
                <span>WhatsApp</span>
                <span class="badge bg-secondary ms-1 d-none" id="notification-tab-whatsapp-count">0</span>
              </button>
            </li>
          </ul>
          <div class="tab-content">
            <div class="tab-pane fade show active" id="notification-tab-geral" role="tabpanel" aria-labelledby="notification-tab-geral-btn">
              <div class="p-3 d-flex justify-content-between align-items-center border-bottom">
                <h6 class="mb-0">Notificações</h6>
                <div class="btn-group btn-group-sm" role="group">
                  <button id="mark-all-read-btn" class="btn btn-outline-primary" title="Marcar todas como lidas">
                    <i class="bi bi-check-all"></i>
                  </button>
                  <button id="notification-settings-btn" class="btn btn-outline-secondary" title="Configurações">
                    <i class="bi bi-gear"></i>
                  </button>
                </div>
              </div>
              <div id="notification-list" class="notification-list" class="scroll-y-420">
                <!-- Notificações gerais -->
              </div>
              <div class="p-3 border-top text-center">
                <button id="clear-old-notifications-btn" class="btn btn-sm btn-outline-danger">
                  <i class="bi bi-trash"></i> Limpar antigas
                </button>
              </div>
            </div>
            <div class="tab-pane fade" id="notification-tab-whatsapp" role="tabpanel" aria-labelledby="notification-tab-whatsapp-btn">
              <div class="p-3 border-bottom d-flex justify-content-between align-items-center">
                <h6 class="mb-0 d-flex align-items-center gap-2">
                  <i class="bi bi-whatsapp text-success"></i>
                  Notificações WhatsApp
                </h6>
                <div class="btn-group btn-group-sm" role="group">
                  <button class="btn btn-outline-primary" id="whatsapp-mark-all-read-btn">
                    <i class="bi bi-check2-all"></i> Marcar Todas
                  </button>
                  <button class="btn btn-outline-secondary" data-bs-toggle="modal" data-bs-target="#whatsapp-notification-settings-modal" title="Configurações">
                    <i class="bi bi-gear"></i>
                  </button>
                </div>
              </div>
              <div id="whatsapp-notifications-list" class="p-3" class="scroll-y-420">
                <div class="text-center text-muted py-5">
                  <i class="bi bi-bell-slash display-4 d-block mb-3"></i>
                  <p>Nenhuma notificação</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const el = document.getElementById(this.id);
    return bootstrap?.Offcanvas ? bootstrap.Offcanvas.getOrCreateInstance(el) : null;
  },
};
