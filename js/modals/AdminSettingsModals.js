export const AdminSettingsModals = {
  id: 'modal-agencia-admin',

  render() {
    // Se qualquer um destes modais já existir, assumimos que o bloco já está no DOM.
    if (
      document.getElementById('modal-agencia-admin') ||
      document.getElementById('modal-cartorio-admin') ||
      document.getElementById('permissions-edit-modal')
    ) {
      return;
    }

    const html = `
            <!-- ========================================= -->
            <!-- MODAL DE CONFIGURAÇÃO AGÊNCIAS CEF -->
            <!-- ========================================= -->

            <!-- Modal: Adicionar/Editar Agência CEF -->
            <div class="modal fade" id="modal-agencia-admin" tabindex="-1" aria-labelledby="modal-agencia-admin-title" aria-hidden="true" role="dialog" aria-modal="true">
              <div class="modal-dialog">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title" id="modal-agencia-admin-title">
                      <i class="bi bi-bank2 me-2"></i>Nova Agência CEF
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                  </div>
                  <div class="modal-body">
                    <form id="form-agencia">
                      <input type="hidden" id="agencia-id" />
                      
                      <div class="mb-3">
                        <label for="agencia-codigo" class="form-label">Código da Agência <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" id="agencia-codigo" placeholder="Ex: 0374" required maxlength="10" />
                        <div class="form-text">Código numérico da agência (ex: 0374, 1001)</div>
                      </div>

                      <div class="mb-3">
                        <label for="agencia-nome" class="form-label">Nome da Agência <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" id="agencia-nome" placeholder="Ex: MERCES" required maxlength="100" />
                        <div class="form-text">Nome ou localidade da agência</div>
                      </div>

                      <div class="alert alert-info mb-0">
                        <i class="bi bi-info-circle me-2"></i>
                        <strong>Formato final:</strong> CEF AG <code id="preview-codigo">0000</code> - <code id="preview-nome">NOME</code>
                      </div>
                    </form>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" form="form-agencia" class="btn btn-primary">
                      <i class="bi bi-save me-2"></i>Salvar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Modal: Cadastro/Edição de Cartório (Admin) -->
            <div class="modal fade" id="modal-cartorio-admin" tabindex="-1" aria-labelledby="modal-cartorio-admin-title" aria-hidden="true" role="dialog" aria-modal="true">
              <div class="modal-dialog">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title" id="modal-cartorio-admin-title">
                      <i class="bi bi-building me-2"></i>Novo Cartório
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                  </div>
                  <div class="modal-body">
                    <form id="form-cartorio">
                      <input type="hidden" id="cartorio-id" />
                      
                      <div class="mb-3">
                        <label for="cartorio-nome" class="form-label">Nome do Cartório <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" id="cartorio-nome" placeholder="Ex: 1º RI CURITIBA" required maxlength="150" />
                        <div class="form-text">Nome completo do cartório de registro de imóveis</div>
                      </div>

                      <div class="row">
                        <div class="col-md-8 mb-3">
                          <label for="cartorio-cidade" class="form-label">Cidade</label>
                          <input type="text" class="form-control" id="cartorio-cidade" placeholder="Ex: CURITIBA" maxlength="100" />
                        </div>
                        <div class="col-md-4 mb-3">
                          <label for="cartorio-uf" class="form-label">UF</label>
                          <select class="form-select" id="cartorio-uf">
                            <option value="PR">PR</option>
                            <option value="SC">SC</option>
                            <option value="RS">RS</option>
                            <option value="SP">SP</option>
                            <option value="RJ">RJ</option>
                            <option value="MG">MG</option>
                            <option value="BA">BA</option>
                            <option value="GO">GO</option>
                            <option value="DF">DF</option>
                            <option value="ES">ES</option>
                            <option value="RN">RN</option>
                            <option value="CE">CE</option>
                            <option value="PE">PE</option>
                            <option value="PA">PA</option>
                            <option value="AM">AM</option>
                            <option value="MA">MA</option>
                            <option value="MT">MT</option>
                            <option value="MS">MS</option>
                          </select>
                        </div>
                      </div>

                      <div class="alert alert-info mb-0">
                        <i class="bi bi-info-circle me-2"></i>
                        <strong>Preview:</strong> <code id="preview-cartorio-nome">NOME DO CARTÓRIO</code>
                      </div>
                    </form>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" form="form-cartorio" class="btn btn-primary">
                      <i class="bi bi-save me-2"></i>Salvar
                    </button>
                  </div>
                </div>
              </div>
            </div>

        <!-- Modal: Edição de Permissões de Usuário -->
        <div class="modal fade" id="permissions-edit-modal" tabindex="-1" aria-labelledby="permissions-edit-title" aria-hidden="true" role="dialog" aria-modal="true">
          <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="permissions-edit-title">
                  <i class="bi bi-shield-lock me-2"></i>Configurar Permissões de Usuário
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
              </div>
              <div class="modal-body">
                <!-- Informações do Usuário -->
                <div class="alert alert-info mb-3">
                  <h6 class="mb-1" id="perm-edit-user-name">Carregando...</h6>
                  <small class="text-muted" id="perm-edit-user-email"></small>
                </div>

                <!-- Seleção de Role -->
                <div class="mb-4">
                  <label for="perm-edit-role" class="form-label fw-bold">
                    <i class="bi bi-person-badge"></i> Função (Role)
                  </label>
                  <select id="perm-edit-role" class="form-select">
                    <option value="viewer">Visualizador - Apenas leitura</option>
                    <option value="analyst">Analista - Edição limitada</option>
                    <option value="manager">Gerente - Acesso amplo</option>
                    <option value="admin">Administrador - Acesso completo</option>
                    <option value="super_admin">Super Admin - Acesso irrestrito</option>
                    <option value="custom">Personalizado - Configurar manualmente</option>
                  </select>
                  <div class="form-text">
                    Escolha uma função pré-definida ou "Personalizado" para configurar permissões específicas.
                  </div>
                </div>

                <!-- Abas de Configuração -->
                <ul class="nav nav-tabs mb-3" id="permissionsTabs" role="tablist">
                  <li class="nav-item" role="presentation">
                    <button class="nav-link active" id="modules-tab" data-bs-toggle="tab" data-bs-target="#modules-pane" type="button" role="tab">
                      <i class="bi bi-grid-3x3-gap"></i> Módulos
                    </button>
                  </li>
                  <li class="nav-item" role="presentation">
                    <button class="nav-link" id="fields-tab" data-bs-toggle="tab" data-bs-target="#fields-pane" type="button" role="tab">
                      <i class="bi bi-input-cursor-text"></i> Campos
                    </button>
                  </li>
                  <li class="nav-item" role="presentation">
                    <button class="nav-link" id="filters-tab" data-bs-toggle="tab" data-bs-target="#filters-pane" type="button" role="tab">
                      <i class="bi bi-funnel"></i> Filtros
                    </button>
                  </li>
                </ul>

                <!-- Conteúdo das Abas -->
                <div class="tab-content" id="permissionsTabContent">
                  <!-- Aba: Módulos -->
                  <div class="tab-pane fade show active" id="modules-pane" role="tabpanel">
                    <div class="permissions-advanced-section">
                      <div class="alert alert-warning">
                        <i class="bi bi-info-circle"></i> Configure as ações permitidas para cada módulo do sistema.
                        <strong>Visível apenas em modo "Personalizado".</strong>
                      </div>
                      <div id="perm-modules-list" class="scroll-y-lg">
                        <!-- Gerado dinamicamente por permissionsUI.js -->
                      </div>
                    </div>
                  </div>

                  <!-- Aba: Campos -->
                  <div class="tab-pane fade" id="fields-pane" role="tabpanel">
                    <div class="permissions-advanced-section">
                      <div class="alert alert-warning">
                        <i class="bi bi-info-circle"></i> Configure quais campos de contrato o usuário pode visualizar e editar.
                        <strong>Visível apenas em modo "Personalizado".</strong>
                      </div>
                      <div id="perm-fields-list" class="scroll-y-lg">
                        <!-- Gerado dinamicamente por permissionsUI.js -->
                      </div>
                    </div>
                  </div>

                  <!-- Aba: Filtros -->
                  <div class="tab-pane fade" id="filters-pane" role="tabpanel">
                    <div class="alert alert-info">
                      <i class="bi bi-info-circle"></i> Restrinja quais contratos o usuário pode visualizar.
                      <strong>Deixe vazio para permitir acesso a todos.</strong>
                    </div>

                    <div class="row">
                      <!-- Workflows Permitidos -->
                      <div class="col-md-4 mb-3">
                        <h6><i class="bi bi-diagram-3"></i> Workflows Permitidos</h6>
                        <div id="perm-workflows-list" class="border rounded p-2 scroll-y-sm">
                          <!-- Gerado dinamicamente -->
                        </div>
                        <small class="text-muted">Deixe vazio para acesso a todos os workflows</small>
                      </div>

                      <!-- Vendedores Permitidos -->
                      <div class="col-md-4 mb-3">
                        <h6><i class="bi bi-building"></i> Vendedores/Construtoras</h6>
                        <div id="perm-vendors-list" class="border rounded p-2 scroll-y-sm">
                          <!-- Gerado dinamicamente -->
                        </div>
                        <small class="text-muted">Deixe vazio para acesso a todos os vendedores</small>
                      </div>

                      <!-- Status Permitidos -->
                      <div class="col-md-4 mb-3">
                        <h6><i class="bi bi-tags"></i> Status Permitidos</h6>
                        <div id="perm-status-list" class="border rounded p-2 scroll-y-sm">
                          <!-- Gerado dinamicamente -->
                        </div>
                        <small class="text-muted">Deixe vazio para acesso a todos os status</small>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-primary" id="btn-save-permissions">
                  <i class="bi bi-check-circle"></i> Salvar Permissões
                </button>
              </div>
            </div>
          </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const ids = ['modal-agencia-admin', 'modal-cartorio-admin', 'permissions-edit-modal'];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el && bootstrap?.Modal?.getOrCreateInstance) {
        bootstrap.Modal.getOrCreateInstance(el);
      }
    });
  },
};
