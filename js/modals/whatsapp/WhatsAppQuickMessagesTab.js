export function renderWhatsAppQuickMessagesTab() {
  return `
                      <!-- ABA: MENSAGENS RÁPIDAS -->
                      <div class="tab-pane fade min-h-tab-pane" id="whatsapp-quick-messages-pane" role="tabpanel">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                          <div>
                            <h5 class="mb-1">
                              <i class="bi bi-lightning me-2"></i>Mensagens Rápidas
                            </h5>
                            <p class="text-muted mb-0">Crie atalhos para mensagens frequentes</p>
                          </div>
                          <button type="button" class="btn btn-primary" onclick="window.__WHATSAPP_QUICK_MESSAGES_UI__?.openCreateModal()">
                            <i class="bi bi-plus-circle me-2"></i>Nova Mensagem
                          </button>
                        </div>

                        <!-- Informação sobre uso -->
                        <div class="alert alert-info">
                          <i class="bi bi-info-circle me-2"></i>
                          <strong>Como usar:</strong> Digite <code>/</code> no chat seguido do atalho (ex: <code>/bv</code>) 
                          para inserir mensagens rápidas. Use variáveis como <code>{customerName}</code> e <code>{agentName}</code>.
                        </div>

                        <!-- Filtros -->
                        <div class="row mb-3">
                          <div class="col-md-6">
                            <div class="input-group">
                              <span class="input-group-text"><i class="bi bi-search"></i></span>
                              <input type="text" class="form-control" id="quick-messages-search-input" 
                                     placeholder="Buscar por atalho ou texto...">
                            </div>
                          </div>
                          <div class="col-md-3">
                            <select class="form-select" id="quick-messages-department-filter">
                              <option value="">Todos os Departamentos</option>
                              <option value="_global">Globais</option>
                              <option value="Aprovação">Aprovação</option>
                              <option value="Formulários">Formulários</option>
                              <option value="CEHOP">CEHOP</option>
                              <option value="Registro">Registro</option>
                              <option value="Geral">Geral</option>
                            </select>
                          </div>
                          <div class="col-md-3">
                            <select class="form-select" id="quick-messages-sort-select">
                              <option value="recent">Mais Recentes</option>
                              <option value="usage">Mais Usadas</option>
                              <option value="shortcut">Atalho (A-Z)</option>
                            </select>
                          </div>
                        </div>

                        <!-- Loading -->
                        <div id="quick-messages-loading" class="text-center py-5 d-none">
                          <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Carregando...</span>
                          </div>
                          <p class="text-muted mt-2">Carregando mensagens...</p>
                        </div>

                        <!-- Tabela de Mensagens -->
                        <div id="quick-messages-table-container" class="table-responsive">
                          <table class="table table-hover">
                            <thead>
                              <tr>
                                <th class="th-w-120">Atalho</th>
                                <th>Texto</th>
                                <th class="th-w-150">Departamento</th>
                                <th class="th-w-80 text-center">Usos</th>
                                <th class="th-w-100 text-center">Ações</th>
                              </tr>
                            </thead>
                            <tbody id="quick-messages-list">
                              <!-- Mensagens serão renderizadas aqui via JS -->
                            </tbody>
                          </table>
                        </div>

                        <!-- Estado Vazio -->
                        <div id="quick-messages-empty-state" class="text-center py-5 d-none">
                          <i class="bi bi-lightning display-1 text-muted"></i>
                          <p class="text-muted mt-3">Nenhuma mensagem rápida encontrada</p>
                          <button type="button" class="btn btn-primary" onclick="window.__WHATSAPP_QUICK_MESSAGES_UI__?.openCreateModal()">
                            <i class="bi bi-plus-circle me-2"></i>Criar Primeira Mensagem
                          </button>
                        </div>
                      </div>
  `;
}
