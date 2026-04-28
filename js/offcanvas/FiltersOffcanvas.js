export const FiltersOffcanvas = {
  id: 'filtersOffcanvas',

  render() {
    if (document.getElementById(this.id)) {
      return document.getElementById(this.id);
    }

    const html = `
      <!-- Painel de Filtros Offcanvas -->
      <div class="offcanvas offcanvas-end" tabindex="-1" id="filtersOffcanvas" aria-labelledby="filtersOffcanvasLabel">
        <div class="offcanvas-header border-bottom">
          <h5 id="filtersOffcanvasLabel"><i class="bi bi-funnel me-2"></i>Filtros e Opções</h5>
          <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Fechar"></button>
        </div>
        <div class="offcanvas-body p-0">
          <!-- Accordion de Filtros -->
          <div class="accordion accordion-flush" id="filtersAccordion">
            
            <!-- Filtrar por Status -->
            <div class="accordion-item">
              <h2 class="accordion-header" id="headingStatus">
                <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseStatus" aria-expanded="true" aria-controls="collapseStatus">
                  <i class="bi bi-tags me-2"></i>Filtrar por Status
                  <span id="status-filter-count" class="badge bg-primary rounded-pill ms-2 d-none">0</span>
                </button>
              </h2>
              <div id="collapseStatus" class="accordion-collapse collapse show" aria-labelledby="headingStatus" data-bs-parent="#filtersAccordion">
                <div class="accordion-body">
                  <p class="text-muted small mb-3">Selecione os status que deseja visualizar nos processos.</p>
                  <div id="table-filter-scroll-content-offcanvas" class="filter-list"></div>
                  <div class="d-flex justify-content-start gap-2 mt-3 pt-2 border-top">
                    <button type="button" class="btn btn-link btn-sm text-decoration-none p-0" id="table-select-all-offcanvas">
                      <i class="bi bi-check-all me-1"></i>Selecionar Todos
                    </button>
                    <button type="button" class="btn btn-link btn-sm text-decoration-none p-0" id="table-clear-all-offcanvas">
                      <i class="bi bi-x-lg me-1"></i>Limpar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Filtrar por Construtora -->
            <div class="accordion-item">
              <h2 class="accordion-header" id="headingVendor">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseVendor" aria-expanded="false" aria-controls="collapseVendor">
                  <i class="bi bi-building me-2"></i>Filtrar por Construtora
                  <span id="vendor-filter-count" class="badge bg-primary rounded-pill ms-2 d-none">0</span>
                </button>
              </h2>
              <div id="collapseVendor" class="accordion-collapse collapse" aria-labelledby="headingVendor" data-bs-parent="#filtersAccordion">
                <div class="accordion-body">
                  <p class="text-muted small mb-3">Filtre processos por construtora/vendedor.</p>
                  <div id="vendor-filter-scroll-content-offcanvas" class="filter-list"></div>
                  <div class="d-flex justify-content-start gap-2 mt-3 pt-2 border-top">
                    <button type="button" class="btn btn-link btn-sm text-decoration-none p-0" id="vendor-select-all-offcanvas">
                      <i class="bi bi-check-all me-1"></i>Todos
                    </button>
                    <button type="button" class="btn btn-link btn-sm text-decoration-none p-0" id="vendor-clear-all-offcanvas">
                      <i class="bi bi-x-lg me-1"></i>Limpar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Filtrar por Empreendimento -->
            <div class="accordion-item">
              <h2 class="accordion-header" id="headingEmpreendimento">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseEmpreendimento" aria-expanded="false" aria-controls="collapseEmpreendimento">
                  <i class="bi bi-geo-alt me-2"></i>Filtrar por Empreendimento
                  <span id="empreendimento-filter-count" class="badge bg-primary rounded-pill ms-2 d-none">0</span>
                </button>
              </h2>
              <div id="collapseEmpreendimento" class="accordion-collapse collapse" aria-labelledby="headingEmpreendimento" data-bs-parent="#filtersAccordion">
                <div class="accordion-body">
                  <p class="text-muted small mb-3">Filtre processos por empreendimento. Os empreendimentos exibidos correspondem às construtoras selecionadas.</p>
                  <div id="empreendimento-filter-scroll-content-offcanvas" class="filter-list"></div>
                  <div class="d-flex justify-content-start gap-2 mt-3 pt-2 border-top">
                    <button type="button" class="btn btn-link btn-sm text-decoration-none p-0" id="empreendimento-select-all-offcanvas">
                      <i class="bi bi-check-all me-1"></i>Todos
                    </button>
                    <button type="button" class="btn btn-link btn-sm text-decoration-none p-0" id="empreendimento-clear-all-offcanvas">
                      <i class="bi bi-x-lg me-1"></i>Limpar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Selecionar Colunas -->
            <div class="accordion-item">
              <h2 class="accordion-header" id="headingColumns">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseColumns" aria-expanded="false" aria-controls="collapseColumns">
                  <i class="bi bi-table me-2"></i>Colunas Visíveis
                </button>
              </h2>
              <div id="collapseColumns" class="accordion-collapse collapse" aria-labelledby="headingColumns" data-bs-parent="#filtersAccordion">
                <div class="accordion-body">
                  <p class="text-muted small mb-3">Escolha quais colunas exibir na tabela de processos.</p>
                  <form id="column-selector-form-offcanvas">
                    <div id="column-selector-grid-offcanvas" class="column-selector-grid"></div>
                    <div class="d-grid gap-2 mt-3 pt-2 border-top">
                      <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="fw-semibold small text-muted">Ações rápidas</span>
                        <div class="btn-group btn-group-sm">
                          <button type="button" id="column-select-all-offcanvas" class="btn btn-outline-primary btn-sm py-0 px-2">
                            <i class="bi bi-check-all"></i> Todos
                          </button>
                          <button type="button" id="column-clear-all-offcanvas" class="btn btn-outline-secondary btn-sm py-0 px-2">
                            <i class="bi bi-x-lg"></i> Limpar
                          </button>
                        </div>
                      </div>
                      <button type="submit" class="btn btn-primary btn-sm">
                        <i class="bi bi-check-circle me-1"></i>Aplicar Seleção
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const el = document.getElementById(this.id);
    if (el && window.bootstrap?.Offcanvas) {
      window.bootstrap.Offcanvas.getOrCreateInstance(el);
    }

    return el;
  },
};
