export function renderWhatsAppStatsModal() {
  return `
            <div class="modal fade" id="modal-whatsapp-stats" tabindex="-1" aria-labelledby="modal-whatsapp-stats-title" aria-hidden="true">
              <div class="modal-dialog modal-xl modal-dialog-scrollable">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title" id="modal-whatsapp-stats-title">
                      <i class="bi bi-bar-chart me-2"></i>Estatísticas WhatsApp
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                  </div>
                  <div class="modal-body">
                    <h6 class="mb-3">Métricas em Tempo Real</h6>
                    <div id="whatsapp-stats">
                      <div class="row">
                        <div class="col-md-3 mb-3">
                          <div class="text-center p-3 border rounded">
                            <h4 class="text-primary mb-1" id="stat-active-chats">0</h4>
                            <p class="text-muted mb-0 small">Conversas Ativas</p>
                          </div>
                        </div>
                        <div class="col-md-3 mb-3">
                          <div class="text-center p-3 border rounded">
                            <h4 class="text-success mb-1" id="stat-agents-online">0</h4>
                            <p class="text-muted mb-0 small">Agentes Online</p>
                          </div>
                        </div>
                        <div class="col-md-3 mb-3">
                          <div class="text-center p-3 border rounded">
                            <h4 class="text-warning mb-1" id="stat-queue-count">0</h4>
                            <p class="text-muted mb-0 small">Fila de Espera</p>
                          </div>
                        </div>
                        <div class="col-md-3 mb-3">
                          <div class="text-center p-3 border rounded">
                            <h4 class="text-info mb-1" id="stat-resolved-today">0</h4>
                            <p class="text-muted mb-0 small">Resolvidas Hoje</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <hr class="my-4">

                    <div class="d-flex justify-content-between align-items-center mb-3">
                      <h6 class="mb-0">Relatórios Detalhados</h6>
                      <button type="button" class="btn btn-primary" id="load-reports-btn">
                        <i class="bi bi-graph-up me-2"></i>Gerar Relatórios
                      </button>
                    </div>
                    
                    <div id="whatsapp-reports-container">
                      <p class="text-muted text-center p-4">Clique em "Gerar Relatórios" para visualizar análises detalhadas</p>
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
