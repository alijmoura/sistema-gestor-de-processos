export function renderWhatsAppTemplatesModal() {
  return `
            <div class="modal fade" id="modal-whatsapp-templates" tabindex="-1" aria-labelledby="modal-whatsapp-templates-title" aria-hidden="true">
              <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title" id="modal-whatsapp-templates-title">
                      <i class="bi bi-bookmark me-2"></i>Templates Disponíveis
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                  </div>
                  <div class="modal-body">
                    <div class="alert alert-info border-info">
                      <i class="bi bi-info-circle me-2"></i>
                      <strong>Como usar templates:</strong> Estes templates devem ser criados no Meta Business Manager.
                      Após aprovação, você pode usá-los para iniciar conversas fora da janela de 24h.
                    </div>
                    
                    <div id="whatsapp-templates-list">
                    </div>
                  </div>
                  <div class="modal-footer">
                    <a href="https://business.facebook.com/" target="_blank" class="btn btn-primary">
                      <i class="bi bi-box-arrow-up-right me-1"></i> Abrir Meta Business Manager
                    </a>
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                  </div>
                </div>
              </div>
            </div>
  `;
}
