export const ConfirmModal = {
  id: 'confirmModal',
  _modalInstance: null,

  render() {
    const existing = document.getElementById(this.id);
    if (existing) {
      const instance = bootstrap?.Modal?.getOrCreateInstance
        ? bootstrap.Modal.getOrCreateInstance(existing)
        : null;
      this._modalInstance = instance;
      return instance;
    }

    const html = `
      <div class="modal fade" id="confirmModal" tabindex="-1" aria-labelledby="confirmModalLabel" aria-hidden="true" role="dialog" aria-modal="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="confirmModalLabel">
                <i class="bi bi-question-circle me-2 text-warning"></i>
                <span id="confirmModalTitle">Confirmar ação</span>
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body" id="confirmModalBody">
              Tem certeza que deseja continuar?
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" id="confirmModalCancel">
                <i class="bi bi-x-circle me-1"></i>Cancelar
              </button>
              <button type="button" class="btn btn-primary" id="confirmModalConfirm">
                <i class="bi bi-check-circle me-1"></i>Confirmar
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const el = document.getElementById(this.id);
    const instance = bootstrap?.Modal ? new bootstrap.Modal(el, { backdrop: 'static', keyboard: false }) : null;
    
    //  CRÍTICO: Adicionar listener para remover backdrop ao fechar
    if (el && instance) {
      el.addEventListener('hidden.bs.modal', () => {
        this._cleanupBackdrop();
      }, { once: false });
    }
    
    this._modalInstance = instance;
    return instance;
  },

  _cleanupBackdrop() {
    // Remove backdrop órfão deixado pelo Bootstrap
    const backdrop = document.querySelector('.modal-backdrop.fade.show');
    if (backdrop) {
      backdrop.remove();
      if (window.__DEBUG__) {
        console.log('[ConfirmModal] Backdrop removido ao fechar modal');
      }
    }
    // Garante que body não tenha modal-open se não houver modais visíveis
    const visibleModals = document.querySelectorAll('.modal.show');
    if (visibleModals.length === 0) {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
    }
  },
};
