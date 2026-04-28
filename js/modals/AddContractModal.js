export const AddContractModal = {
  id: 'add-contract-modal',

  render() {
    const existing = document.getElementById(this.id);
    if (existing) {
      return bootstrap?.Modal?.getOrCreateInstance
        ? bootstrap.Modal.getOrCreateInstance(existing)
        : null;
    }

    const html = `
      <div class="modal fade" id="add-contract-modal" tabindex="-1" aria-labelledby="add-contract-modal-title" aria-hidden="true" role="dialog" aria-modal="true">
        <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable modal-fullscreen-lg-down app-modal-dialog">
          <div class="modal-content modal-shell" style="max-height: 94vh; overflow: hidden; display: flex; flex-direction: column;">
            <div class="modal-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-1 flex-shrink-0">
              <h2 class="modal-title mb-0" id="add-contract-modal-title">
                <i class="bi bi-plus-circle text-primary"></i>
                Adicionar Novo Processo
              </h2>
              <button type="button" id="close-add-modal-btn" class="btn-close btn-close-modern" data-bs-dismiss="modal" aria-label="Fechar">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
            <div class="modal-body" style="overflow-y: auto; flex: 1 1 auto; min-height: 0;">
              <form id="contract-form" class="needs-validation h-100 d-flex flex-column" novalidate>
                <div class="card border-0 shadow-sm mb-4">
                  <div class="card-header bg-light">
                    <h5 class="mb-0 d-flex align-items-center">
                      <i class="bi bi-building text-primary me-2"></i>
                      Dados Principais
                    </h5>
                  </div>
                  <div class="card-body">
                    <div class="row g-3">
                      <div class="col-12 d-none" id="vendors-explorer">
                        <div class="vendors-explorer-wrapper">
                          <div class="ve-col ve-col-vendors">
                            <div class="ve-title">Construtoras</div>
                            <ul id="ve-vendors-list" class="ve-list"></ul>
                          </div>
                          <div class="ve-col ve-col-emps">
                            <div class="ve-title">Empreendimentos</div>
                            <ul id="ve-emps-list" class="ve-list"></ul>
                          </div>
                          <div class="ve-col ve-col-help">
                            <div class="ve-title">Ajuda</div>
                            <div class="small text-muted">Clique em uma construtora para listar empreendimentos e depois clique em um empreendimento para preencher os campos. O botão "Mostrar Lista" alterna esta área.</div>
                          </div>
                        </div>
                        <hr />
                      </div>
                      <div class="col-12 d-flex justify-content-end">
                        <button type="button" id="toggle-vendors-explorer-btn" class="btn btn-sm btn-outline-secondary">Mostrar Lista</button>
                      </div>
                      <div class="col-md-6">
                        <div class="form-floating">
                          <select class="form-select" id="add-workflowId" required>
                            <option value="" selected>Processo Associativo</option>
                            <!-- Opções carregadas dinamicamente -->
                          </select>
                          <label for="add-workflowId">
                            <i class="bi bi-diagram-2 me-2"></i>
                            Tipo de Processo (Workflow)
                          </label>
                          <div class="invalid-feedback">Selecione o tipo de processo (workflow).</div>
                        </div>
                      </div>
                      <div class="col-md-6">
                        <div class="form-floating">
                          <select class="form-select" id="add-status" required>
                            <option value="">Selecione o status inicial</option>
                            <!-- Opções carregadas dinamicamente -->
                          </select>
                          <label for="add-status">
                            <i class="bi bi-list-check me-2"></i>
                            Status Inicial *
                          </label>
                          <div class="invalid-feedback">Selecione o status inicial do processo.</div>
                        </div>
                      </div>
                      <div class="col-md-6">
                        <div class="inline-suggest-wrapper">
                          <div class="form-floating has-validation">
                            <input
                              type="text"
                              class="form-control"
                              id="add-vendedorConstrutora"
                              placeholder="Vendedor/Construtora"
                              list="datalist-vendedores"
                              autocomplete="off"
                              required
                            />
                            <label for="add-vendedorConstrutora">
                              <i class="bi bi-shop me-2"></i>
                              Vendedor/Construtora
                            </label>
                            <div class="invalid-feedback">Selecione uma construtora cadastrada em Configurações &gt; Construtoras & Empreendimentos.</div>
                          </div>
                          <div class="suggestions-panel" id="suggestions-vendors" data-source="vendors" hidden>
                            <ul class="suggestions-list" id="suggestions-vendors-list"></ul>
                          </div>
                        </div>
                      </div>
                      <div class="col-md-6">
                        <div class="inline-suggest-wrapper">
                          <div class="form-floating has-validation">
                            <input
                              type="text"
                              class="form-control"
                              id="add-empreendimento"
                              placeholder="Empreendimento"
                              list="datalist-empreendimentos"
                              autocomplete="off"
                              required
                            />
                            <label for="add-empreendimento">
                              <i class="bi bi-buildings me-2"></i>
                              Empreendimento
                            </label>
                            <div class="invalid-feedback">Selecione um empreendimento vinculado à construtora informada.</div>
                          </div>
                          <div class="suggestions-panel" id="suggestions-emps" data-source="empreendimentos" hidden>
                            <div class="suggestions-empty small text-muted d-none px-2 py-1">Nenhum empreendimento encontrado</div>
                            <ul class="suggestions-list" id="suggestions-emps-list"></ul>
                          </div>
                        </div>
                      </div>
                      <div class="col-md-6">
                        <div class="form-floating">
                          <input type="text" class="form-control" id="add-apto" placeholder="Apto" />
                          <label for="add-apto">
                            <i class="bi bi-door-open me-2"></i>
                            Apartamento
                          </label>
                        </div>
                      </div>
                      <div class="col-md-6">
                        <div class="form-floating">
                          <input type="text" class="form-control" id="add-bloco" placeholder="Bloco" />
                          <label for="add-bloco">
                            <i class="bi bi-box me-2"></i>
                            Bloco
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="card border-0 shadow-sm mb-0">
                  <div class="card-header bg-light">
                    <h5 class="mb-0 d-flex align-items-center">
                      <i class="bi bi-people-fill text-primary me-2"></i>
                      Compradores
                    </h5>
                  </div>
                  <div class="card-body">
                    <div id="add-compradores-container" class="mb-3"></div>
                    <button type="button" id="add-comprador-btn-new-modal" class="btn btn-outline-primary">
                      <i class="bi bi-person-plus me-2"></i>
                      Adicionar Comprador
                    </button>
                  </div>
                </div>
              </form>
            </div>

            <!-- Footer fixo dentro do modal-content -->
            <div class="modal-footer flex-wrap gap-2 justify-content-between border-top py-3 bg-white flex-shrink-0">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">
                <i class="bi bi-x-lg me-1"></i>Cancelar
              </button>
              <button type="submit" class="btn btn-primary" form="contract-form">
                <i class="bi bi-check-circle me-2"></i>
                Adicionar Processo
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const el = document.getElementById(this.id);
    if (el && bootstrap?.Modal?.getOrCreateInstance) {
      return bootstrap.Modal.getOrCreateInstance(el);
    }

    return el;
  },
};
