export const VendorsModals = {
  id: 'modal-vendor-form',

  render() {
    if (
      document.getElementById('modal-vendor-form') ||
      document.getElementById('modal-vendor-empreendimentos') ||
      document.getElementById('modal-empreendimento-edit') ||
      document.getElementById('modal-vendor-detail')
    ) {
      return;
    }

    // Mantém o HTML/IDs originais para compatibilidade com vendorsUI.js e modalManager.js.
    const html = `
    <!-- Modais Construtoras/Empreendimentos (injetados via js/modals/VendorsModals.js) -->

    <!-- Modal Criar/Editar Construtora -->
    <div class="modal fade" id="modal-vendor-form" tabindex="-1" aria-labelledby="modal-vendor-form-title" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modal-vendor-form-title">
              <i class="bi bi-building me-2"></i>Nova Construtora
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <form id="vendor-form" class="needs-validation" novalidate>
            <div class="modal-body">
              <input type="hidden" id="vendor-id" />
              
              <div class="row g-3">
                <div class="col-md-6">
                  <label for="vendor-name" class="form-label">Nome da Construtora *</label>
                  <input type="text" class="form-control" id="vendor-name" required placeholder="Ex.: Construtora XPTO">
                  <div class="invalid-feedback">Nome é obrigatório</div>
                </div>
                
                <div class="col-md-6">
                  <label for="vendor-cnpj" class="form-label">CNPJ</label>
                  <input type="text" class="form-control" id="vendor-cnpj" placeholder="00.000.000/0000-00">
                </div>
                
                <div class="col-md-6">
                  <label for="vendor-email" class="form-label">E-mail</label>
                  <input type="email" class="form-control" id="vendor-email" placeholder="contato@construtora.com">
                  <div class="invalid-feedback">E-mail inválido</div>
                </div>
                
                <div class="col-md-6">
                  <label for="vendor-telefone" class="form-label">Telefone</label>
                  <input type="tel" class="form-control" id="vendor-telefone" placeholder="(00) 00000-0000">
                </div>
                
                <div class="col-12">
                  <label for="vendor-endereco" class="form-label">Endereço</label>
                  <input type="text" class="form-control" id="vendor-endereco" placeholder="Rua, nº, bairro, cidade">
                </div>
                
                <div class="col-12">
                  <label for="vendor-observacoes" class="form-label">Observações</label>
                  <textarea class="form-control" id="vendor-observacoes" rows="3" placeholder="Anotações internas..."></textarea>
                </div>
                
                <div class="col-12">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="vendor-active" checked>
                    <label class="form-check-label" for="vendor-active">Construtora Ativa</label>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary">
                <i class="bi bi-check-circle me-1"></i>Salvar Construtora
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Gerenciar Empreendimentos -->
    <div class="modal fade" id="modal-vendor-empreendimentos" tabindex="-1" aria-labelledby="modal-vendor-empreendimentos-title" aria-hidden="true">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modal-vendor-empreendimentos-title">
              <i class="bi bi-buildings me-2"></i>Empreendimentos
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">
            <!-- Nav tabs -->
            <ul class="nav nav-tabs mb-3" id="empreendimentos-tabs" role="tablist">
              <li class="nav-item" role="presentation">
                <button class="nav-link active" id="tab-empreendimentos-list" data-bs-toggle="tab" data-bs-target="#tab-empreendimentos-content" type="button">
                  <i class="bi bi-list-ul me-1"></i>Lista de Empreendimentos
                </button>
              </li>
              <li class="nav-item" role="presentation">
                <button class="nav-link" id="tab-add-empreendimento" data-bs-toggle="tab" data-bs-target="#tab-add-empreendimento-content" type="button">
                  <i class="bi bi-plus-circle me-1"></i>Adicionar Novo
                </button>
              </li>
            </ul>

            <!-- Tab content -->
            <div class="tab-content">
              <!-- Lista -->
              <div class="tab-pane fade show active" id="tab-empreendimentos-content">
                <div id="empreendimentos-list-container">
                  <!-- Conteúdo dinâmico -->
                </div>
              </div>
              
              <!-- Adicionar Novo -->
              <div class="tab-pane fade" id="tab-add-empreendimento-content">
                <div class="card">
                  <div class="card-body">
                    <h6 class="card-title">Adicionar Novo Empreendimento</h6>
                    <div class="row g-3">
                      <div class="col-12">
                        <label for="new-empreendimento-nome" class="form-label">Nome do empreendimento</label>
                        <input type="text" class="form-control" id="new-empreendimento-nome" placeholder="Ex.: BLUE LAKE FASE I">
                      </div>
                      <div class="col-md-6">
                        <label for="new-empreendimento-cartorio" class="form-label">Cartório padrão</label>
                        <input type="text" class="form-control" id="new-empreendimento-cartorio" list="datalist-empreendimento-cartorios" placeholder="Ex.: RI PINHAIS">
                        <div class="form-text">Será usado no preenchimento automático do details-modal.</div>
                      </div>
                      <div class="col-md-6">
                        <label for="new-empreendimento-agencia" class="form-label">Agência padrão</label>
                        <input type="text" class="form-control" id="new-empreendimento-agencia" list="datalist-empreendimento-agencias" placeholder="Ex.: 3915 ou CEF AG 3915">
                      </div>
                      <div class="col-12 col-md-4 ms-md-auto">
                        <button type="button" class="btn btn-primary w-100" id="btn-add-empreendimento">
                          <i class="bi bi-plus-circle me-1"></i>Adicionar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Editar Empreendimento -->
    <div class="modal fade" id="modal-empreendimento-edit" tabindex="-1" aria-labelledby="modal-empreendimento-edit-title" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modal-empreendimento-edit-title">
              <i class="bi bi-pencil-square me-2"></i>Editar Empreendimento
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <form id="empreendimento-edit-form" class="needs-validation" novalidate>
            <div class="modal-body">
              <input type="hidden" id="empreendimento-edit-vendor-id">
              <input type="hidden" id="empreendimento-edit-id">

              <div class="mb-3">
                <label for="empreendimento-edit-nome" class="form-label">Nome do empreendimento *</label>
                <input type="text" class="form-control" id="empreendimento-edit-nome" required placeholder="Ex.: BLUE LAKE FASE I">
                <div class="invalid-feedback">O nome do empreendimento é obrigatório.</div>
              </div>

              <div class="mb-3">
                <label for="empreendimento-edit-cartorio" class="form-label">Cartório padrão</label>
                <input type="text" class="form-control" id="empreendimento-edit-cartorio" list="datalist-empreendimento-cartorios" placeholder="Ex.: RI PINHAIS">
                <div class="form-text">Preenchimento automático no details-modal.</div>
              </div>

              <div class="mb-1">
                <label for="empreendimento-edit-agencia" class="form-label">Agência padrão</label>
                <input type="text" class="form-control" id="empreendimento-edit-agencia" list="datalist-empreendimento-agencias" placeholder="Ex.: 3915 ou CEF AG 3915">
              </div>
              <div class="mt-3">
                <label for="empreendimento-edit-codigo-cca" class="form-label">Código CCA</label>
                <input type="text" class="form-control" id="empreendimento-edit-codigo-cca" placeholder="Ex.: CCA123">
                <div class="form-text">Preenchimento automático no details-modal.</div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary">
                <i class="bi bi-check-circle me-1"></i>Salvar Alterações
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <datalist id="datalist-empreendimento-cartorios"></datalist>
    <datalist id="datalist-empreendimento-agencias"></datalist>

    <!-- Modal Detalhes Construtora (vendors) -->
    <div id="modal-vendor-detail" class="modal fade" tabindex="-1" aria-labelledby="modal-vendor-detail-title" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content modern-modal">
          <div class="modal-header d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
            <h2 id="modal-vendor-detail-title" class="modal-title mb-0 d-flex align-items-center gap-2">
              <i class="bi bi-buildings text-primary"></i> Detalhes da Construtora
            </h2>
            <button type="button" class="btn-close-modern" data-bs-dismiss="modal" aria-label="Fechar">×</button>
          </div>
          <div class="modal-body vendor-detail-body">
            <div id="modal-vendor-detail-container">
              <!-- Conteúdo dinâmico injetado por vendorsUI.js -->
            </div>
          </div>
        </div>
      </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },
};
