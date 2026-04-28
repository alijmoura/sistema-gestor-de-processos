export function renderWhatsAppTagsTab() {
  return `
                      <!-- ABA: TAGS -->
                      <div class="tab-pane fade min-h-tab-pane" id="whatsapp-tags-pane" role="tabpanel">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                          <div>
                            <h5 class="mb-1">
                              <i class="bi bi-tags me-2"></i>Gerenciar Tags
                            </h5>
                            <p class="text-muted mb-0">Organize conversas com etiquetas coloridas</p>
                          </div>
                          <button type="button" class="btn btn-primary" onclick="window.__WHATSAPP_TAGS_UI__?.openCreateModal()">
                            <i class="bi bi-plus-circle me-2"></i>Nova Tag
                          </button>
                        </div>

                        <!-- Filtros e Busca -->
                        <div class="row mb-3">
                          <div class="col-md-8">
                            <div class="input-group">
                              <span class="input-group-text"><i class="bi bi-search"></i></span>
                              <input type="text" class="form-control" id="tags-search-input" 
                                     placeholder="Buscar tags por nome...">
                            </div>
                          </div>
                          <div class="col-md-4">
                            <select class="form-select" id="tags-filter-select">
                              <option value="all">Todas</option>
                              <option value="active">Ativas</option>
                              <option value="unused">Não utilizadas</option>
                            </select>
                          </div>
                        </div>

                        <!-- Loading -->
                        <div id="tags-loading" class="text-center py-5 d-none">
                          <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Carregando...</span>
                          </div>
                          <p class="text-muted mt-2">Carregando tags...</p>
                        </div>

                        <!-- Lista de Tags -->
                        <div id="tags-list-container" class="row g-3">
                          <!-- Tags serão renderizadas aqui via JS -->
                        </div>

                        <!-- Estado Vazio -->
                        <div id="tags-empty-state" class="text-center py-5 d-none">
                          <i class="bi bi-tags display-1 text-muted"></i>
                          <p class="text-muted mt-3">Nenhuma tag encontrada</p>
                          <button type="button" class="btn btn-primary" onclick="window.__WHATSAPP_TAGS_UI__?.openCreateModal()">
                            <i class="bi bi-plus-circle me-2"></i>Criar Primeira Tag
                          </button>
                        </div>
                      </div>
  `;
}
