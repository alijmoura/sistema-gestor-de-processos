export const AiAndSlaModals = {
  id: ['modal-ia', 'modal-sla-config'],

  render() {
    // Renderiza modal de IA
    if (!document.getElementById('modal-ia')) {
      const aiModalHtml = `
        <!-- Modal: Provedor de IA (injetado via js/modals/AiAndSlaModals.js) -->
        <div id="modal-ia" class="modal fade modal-top-aligned" tabindex="-1" aria-labelledby="modal-ia-title" aria-hidden="true">
          <div class="modal-dialog modal-dialog-scrollable modal-lg">
            <div class="modal-content modern-modal modal-status-lg">
            <div class="modal-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
              <h2 id="modal-ia-title" class="modal-title mb-0 d-flex align-items-center gap-2">
                <i class="bi bi-robot text-primary"></i>
                 Configuração do Provedor de IA
              </h2>
              <button type="button" class="btn-close-modern" data-bs-dismiss="modal" aria-label="Fechar">×</button>
            </div>

            <div class="modal-body">
              <!-- Status/Info -->
              <div id="ai-settings-status" class="mb-4">
                <!-- Preenchido dinamicamente pelo aiSettings.js -->
              </div>

              <!-- Configurações -->
              <div class="mb-3">
                <label for="ai-provider-select" class="form-label fw-bold">Provedor de IA</label>
                <select id="ai-provider-select" class="form-select" disabled>
                  <option value="backend">Backend (Cloud Functions - Seguro)</option>
                </select>
                <small class="text-muted">Todas as requisições são processadas via backend com chaves protegidas no servidor.</small>
              </div>

              <div class="mb-3">
                <label for="ai-api-key" class="form-label fw-bold">Chave de API</label>
                <input type="password" id="ai-api-key" class="form-control" disabled placeholder="Chaves gerenciadas no backend (seguro)">
                <small class="text-muted">As chaves de API são armazenadas de forma segura no servidor e nunca expostas ao cliente.</small>
              </div>

              <!-- Estatísticas -->
              <div id="ai-stats-container" class="mt-4">
                <!-- Preenchido dinamicamente pelo aiSettings.js -->
              </div>

              <!-- Ações -->
              <div class="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
                <button type="button" id="ai-test-connection" class="btn btn-outline-info btn-sm">
                  <i class="bi bi-lightning-charge"></i>
                  Testar Conexão
                </button>
                <div class="btn-group">
                  <button type="button" id="ai-settings-clear" class="btn btn-outline-warning btn-sm">
                    <i class="bi bi-arrow-counterclockwise"></i>
                    Resetar
                  </button>
                  <button type="button" id="ai-settings-save" class="btn btn-primary btn-sm">
                    <i class="bi bi-check-lg"></i>
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', aiModalHtml);
    }

    // Renderiza modal de SLA
    if (document.getElementById('modal-sla-config')) {
      return;
    }

    // Mantém o HTML/IDs originais para compatibilidade com modalManager.js e módulos legados.
    const html = `
        <!-- Modal: Configuração de Prazos SLA (injetado via js/modals/AiAndSlaModals.js) -->
        <div id="modal-sla-config" class="modal fade modal-top-aligned" tabindex="-1" aria-labelledby="modal-sla-config-title" aria-hidden="true">
          <div class="modal-dialog modal-status-xl">
            <div class="modal-content modern-modal">
            <div class="modal-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
              <h2 id="modal-sla-config-title" class="modal-title mb-0 d-flex align-items-center gap-2">
                <i class="bi bi-clock-history text-primary"></i>
                Configuracao de Prazos SLA
              </h2>
              <button type="button" class="btn-close-modern" data-bs-dismiss="modal" aria-label="Fechar">x</button>
            </div>

            <div class="modal-body">
              <!-- Abas de navegacao (mesmo padrao do DetailsModal) -->
              <div class="sla-tabs-bar mb-4">
                <button type="button" class="sla-tab-btn active" data-sla-tab="sla-status-content">
                  <i class="bi bi-list-check me-1"></i> SLA por Status
                </button>
                <button type="button" class="sla-tab-btn" data-sla-tab="sla-date-content">
                  <i class="bi bi-calendar-event me-1"></i> SLA por Data
                </button>
              </div>

              <!-- Conteudo das abas -->
              <div class="sla-tabs-content">
                <!-- Tab: SLA por Status -->
                <div class="sla-tab-content active" id="sla-status-content">
                  <!-- Descricao -->
                  <div class="alert alert-info mb-4">
                    <i class="bi bi-info-circle me-2"></i>
                    <strong>Como funciona:</strong> Defina prazos (em dias uteis) para cada status do sistema. O sistema calculara automaticamente a data limite de SLA a partir da data de entrada no status.
                    <ul class="mt-2 mb-0">
                      <li>Deixe em branco ou zero para desabilitar SLA naquele status</li>
                      <li>Use valores decimais para prazos fracionados (ex: 0.5 = meio dia util)</li>
                      <li>As alteracoes sao salvas automaticamente ao clicar em "Salvar"</li>
                    </ul>
                  </div>

                  <!-- Filtro rapido -->
                  <div class="mb-3">
                    <input type="text" id="sla-search" class="form-control" placeholder=" Filtrar status por nome...">
                  </div>

                  <!-- Tabela de SLA por Status -->
                  <div class="config-table-wrapper">
                    <table class="table table-striped table-hover">
                      <thead>
                        <tr>
                          <th class="th-w-50">#</th>
                          <th>Status</th>
                          <th class="th-w-150">Etapa</th>
                          <th class="th-w-200">
                            Prazo SLA (dias uteis)
                            <i class="bi bi-question-circle text-muted"
                               title="Numero de dias uteis (excluindo fins de semana) para conclusao"
                               class="cursor-help"></i>
                          </th>
                          <th class="th-w-120">Status Ativo</th>
                        </tr>
                      </thead>
                      <tbody id="sla-config-table-body">
                        <!-- Sera preenchido dinamicamente -->
                      </tbody>
                    </table>
                  </div>

                  <!-- Acoes Rapidas -->
                  <div class="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
                    <div class="btn-group">
                      <button type="button" id="sla-apply-to-all" class="btn btn-outline-secondary btn-sm">
                        <i class="bi bi-distribute-horizontal"></i>
                        Aplicar prazo padrao a todos
                      </button>
                      <button type="button" id="sla-clear-all" class="btn btn-outline-warning btn-sm">
                        <i class="bi bi-trash"></i>
                        Limpar todos os prazos
                      </button>
                    </div>

                    <div class="btn-group">
                      <button type="button" id="sla-refresh" class="btn btn-outline-info btn-sm">
                        <i class="bi bi-arrow-clockwise"></i>
                        Atualizar
                      </button>
                      <button type="button" id="sla-save-all" class="btn btn-primary btn-sm">
                        <i class="bi bi-check-lg"></i>
                        Salvar Configuracoes
                      </button>
                    </div>
                  </div>

                  <!-- Status de salvamento -->
                  <div id="sla-save-status" class="mt-3 text-center text-muted small"></div>
                </div>

                <!-- Tab: SLA por Data (Vencimentos) -->
                <div class="sla-tab-content" id="sla-date-content">
                  <!-- Descricao -->
                  <div class="alert alert-warning mb-4">
                    <i class="bi bi-calendar-x me-2"></i>
                    <strong>Alertas de Vencimento:</strong> Configure quais campos de data devem gerar alertas no Kanban quando estiverem proximos do vencimento ou vencidos.
                    <ul class="mt-2 mb-0">
                      <li>Habilite os campos que deseja monitorar</li>
                      <li>Defina quantos dias antes do vencimento o alerta deve aparecer</li>
                      <li>Apenas o alerta mais urgente sera exibido no card</li>
                    </ul>
                  </div>

                  <!-- Filtro rapido -->
                  <div class="mb-3">
                    <input type="text" id="sla-date-search" class="form-control" placeholder=" Filtrar campos por nome...">
                  </div>

                  <!-- Tabela de SLA por Data -->
                  <div class="config-table-wrapper">
                    <table class="table table-striped table-hover">
                      <thead>
                        <tr>
                          <th class="th-w-50">#</th>
                          <th>Campo de Data</th>
                          <th class="th-w-200">
                            Dias de Aviso
                            <i class="bi bi-question-circle text-muted"
                               title="Quantos dias antes do vencimento o alerta deve aparecer"
                               class="cursor-help"></i>
                          </th>
                          <th class="th-w-120 text-center">Habilitado</th>
                        </tr>
                      </thead>
                      <tbody id="sla-date-config-table-body">
                        <!-- @deprecated - Use o modal unificado StatusWorkflowUnifiedModal -->
                      </tbody>
                    </table>
                  </div>

                  <!-- Acoes Rapidas -->
                  <div class="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
                    <button type="button" id="sla-date-reset" class="btn btn-outline-warning btn-sm">
                      <i class="bi bi-arrow-counterclockwise"></i>
                      Restaurar Padrao
                    </button>

                    <button type="button" id="sla-date-save-all" class="btn btn-primary btn-sm">
                      <i class="bi bi-check-lg"></i>
                      Salvar Configuracoes
                    </button>
                  </div>

                  <!-- Status de salvamento -->
                  <div id="sla-date-save-status" class="mt-3 text-center text-muted small"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },
};
