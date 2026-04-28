export function renderWhatsAppSendTemplateModal() {
  return `
            <div class="modal fade" id="modal-whatsapp-send-template" tabindex="-1" aria-labelledby="modal-whatsapp-send-template-title" aria-hidden="true">
              <div class="modal-dialog modal-lg">
                <div class="modal-content">
                  <div class="modal-header bg-primary text-white">
                    <h5 class="modal-title" id="modal-whatsapp-send-template-title">
                      <i class="bi bi-envelope-paper me-2"></i>Enviar Template de Mensagem
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
                  </div>
                  <div class="modal-body">
                    <div class="alert alert-info border-info d-flex align-items-start gap-2">
                      <i class="bi bi-info-circle-fill fs-5"></i>
                      <div class="small">
                        <strong>Templates aprovados pela Meta</strong>
                        <p class="mb-1">Estes templates precisam estar criados e aprovados no Meta Business Manager antes de usar.</p>
                        <p class="mb-0">
                          <a href="https://business.facebook.com/" target="_blank" class="text-info">
                            <i class="bi bi-box-arrow-up-right me-1"></i>Abrir Meta Business Manager
                          </a>
                        </p>
                      </div>
                    </div>

                    <div class="mb-3">
                      <label for="template-select" class="form-label fw-semibold">Escolha um Template</label>
                      <select class="form-select" id="template-select">
                        <option value="">-- Selecione um template --</option>
                      </select>
                    </div>

                    <div id="template-preview-area" class="d-none">
                      <div class="card bg-light border-0 mb-3">
                        <div class="card-body">
                          <h6 class="card-subtitle mb-2 text-muted">
                            <i class="bi bi-eye me-1"></i>Preview da mensagem:
                          </h6>
                          <div id="template-example-text" class="fst-italic text-pre-wrap"></div>
                        </div>
                      </div>

                      <div id="template-params"></div>
                    </div>

                    <div id="template-warning-area" class="alert alert-warning border-warning d-none">
                      <i class="bi bi-exclamation-triangle me-2"></i>
                      <strong>Template não aprovado:</strong> Este template precisa ser criado e aprovado no Meta Business Manager antes de enviar.
                    </div>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="button" class="btn btn-primary" id="send-template-btn" disabled>
                      <i class="bi bi-send me-1"></i> Enviar Template
                    </button>
                  </div>
                </div>
              </div>
            </div>
  `;
}
