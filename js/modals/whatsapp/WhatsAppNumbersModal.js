export function renderWhatsAppNumbersModal() {
  return `
            <div class="modal fade" id="modal-whatsapp-numbers" tabindex="-1" aria-labelledby="modal-whatsapp-numbers-title" aria-hidden="true">
              <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title" id="modal-whatsapp-numbers-title">
                      <i class="bi bi-phone me-2"></i>Números WhatsApp Business
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                  </div>
                  <div class="modal-body">
                    <p class="text-muted">Gerencie múltiplos números WhatsApp Business. Todas as conversas são centralizadas na mesma interface.</p>
                    <div class="d-flex justify-content-end mb-3">
                      <button class="btn btn-success" id="add-phone-number-btn">
                        <i class="bi bi-plus-circle me-1"></i>Adicionar Número
                      </button>
                    </div>

                    <div id="phone-numbers-list">
                      <div class="text-center p-4">
                        <div class="spinner-border text-primary" role="status">
                          <span class="visually-hidden">Carregando...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                  </div>
                </div>
              </div>
            </div>
  `;
}
