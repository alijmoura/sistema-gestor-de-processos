export function renderWhatsAppConfigModal({ generalTab, tagsTab, quickMessagesTab }) {
  return `
            <div class="modal fade" id="modal-whatsapp-config" tabindex="-1" aria-labelledby="modal-whatsapp-config-title" aria-hidden="true">
              <div class="modal-dialog modal-xl modal-dialog-scrollable">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title" id="modal-whatsapp-config-title">
                      <i class="bi bi-gear me-2"></i>Configurações WhatsApp
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                  </div>
                  <div class="modal-body min-h-modal-lg">
                    <ul class="nav nav-tabs mb-3" id="whatsapp-config-tabs" role="tablist">
                      <li class="nav-item" role="presentation">
                        <button class="nav-link active" id="whatsapp-general-tab" data-bs-toggle="tab" 
                                data-bs-target="#whatsapp-general-pane" type="button" role="tab">
                          <i class="bi bi-gear me-2"></i>Gerais
                        </button>
                      </li>
                      <li class="nav-item" role="presentation">
                        <button class="nav-link" id="whatsapp-tags-tab" data-bs-toggle="tab" 
                                data-bs-target="#whatsapp-tags-pane" type="button" role="tab">
                          <i class="bi bi-tags me-2"></i>Tags
                        </button>
                      </li>
                      <li class="nav-item" role="presentation">
                        <button class="nav-link" id="whatsapp-quick-messages-tab" data-bs-toggle="tab" 
                                data-bs-target="#whatsapp-quick-messages-pane" type="button" role="tab">
                          <i class="bi bi-lightning me-2"></i>Mensagens Rápidas
                        </button>
                      </li>
                    </ul>

                    <div class="tab-content min-h-tab-content" id="whatsapp-config-tabs-content">
                      ${generalTab || ''}
                      ${tagsTab || ''}
                      ${quickMessagesTab || ''}
                    </div>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                    <button type="submit" form="whatsapp-config-form" class="btn btn-primary" id="whatsapp-save-general-btn">
                      <i class="bi bi-save me-2"></i>Salvar Configurações
                    </button>
                  </div>
                </div>
              </div>
            </div>
  `;
}
