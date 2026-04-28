export function renderWhatsAppAgentsModal() {
  return `
            <div class="modal fade" id="modal-whatsapp-agents" tabindex="-1" aria-labelledby="modal-whatsapp-agents-title" aria-hidden="true">
              <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title" id="modal-whatsapp-agents-title">
                      <i class="bi bi-people me-2"></i>Agentes Registrados
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                  </div>
                  <div class="modal-body">
                    <p class="text-muted">Usuários habilitados para atender conversas pelo WhatsApp</p>
                    
                    <div id="whatsapp-agents-list">
                      <div class="text-center p-4">
                        <div class="spinner-border spinner-border-sm text-primary" role="status">
                          <span class="visually-hidden">Carregando agentes...</span>
                        </div>
                        <p class="text-muted small mt-2 mb-0">Carregando lista de agentes...</p>
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
