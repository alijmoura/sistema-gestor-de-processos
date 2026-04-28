export const UsersAndStatusModals = {
  id: 'modal-usuarios',

  render() {
    if (
      document.getElementById('modal-usuarios') ||
      document.getElementById('modal-status') ||
      document.getElementById('status-rules-modal') ||
      document.getElementById('edit-rule-modal') ||
      document.getElementById('status-table-config-modal')
    ) {
      return;
    }

    // Mantém o HTML/IDs originais para compatibilidade com modalManager.js e módulos legados.
    const html = `
        <!-- Modal Usuarios e Permissoes (injetado via js/modals/UsersAndStatusModals.js) -->
        <div id="modal-usuarios" class="modal fade" tabindex="-1" aria-labelledby="modal-usuarios-title" aria-hidden="true">
          <div class="modal-dialog modal-w-xl modal-dialog-scrollable users-modal-dialog">
            <div class="modal-content modern-modal users-modal">
              <div class="modal-header users-modal__header d-flex justify-content-between align-items-center">
                <div class="users-modal__header-copy pe-3">
                  <h5 id="modal-usuarios-title" class="modal-title users-modal__title mb-1">
                    <i class="bi bi-people me-2"></i>Usuários e Permissões
                  </h5>
                  <p class="users-modal__subtitle mb-0">Crie contas, ajuste papéis e controle o acesso ao sistema.</p>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
              </div>

              <div class="modal-body users-modal__body">
                <ul class="nav users-modal-tabs" id="users-modal-tabs" role="tablist">
                  <li class="nav-item" role="presentation">
                    <button
                      class="nav-link active"
                      id="users-tab-create"
                      data-bs-toggle="tab"
                      data-bs-target="#users-tab-create-pane"
                      type="button"
                      role="tab"
                      aria-controls="users-tab-create-pane"
                      aria-selected="true"
                    >
                      <i class="bi bi-person-plus"></i>
                      <span class="tab-text">Adicionar novo usuário</span>
                    </button>
                  </li>
                  <li class="nav-item" role="presentation">
                    <button
                      class="nav-link"
                      id="users-tab-list"
                      data-bs-toggle="tab"
                      data-bs-target="#users-tab-list-pane"
                      type="button"
                      role="tab"
                      aria-controls="users-tab-list-pane"
                      aria-selected="false"
                    >
                      <i class="bi bi-people"></i>
                      <span class="tab-text">Utilizadores do sistema</span>
                    </button>
                  </li>
                </ul>

                <div class="tab-content users-modal__tab-content">
                  <div class="tab-pane fade show active" id="users-tab-create-pane" role="tabpanel" aria-labelledby="users-tab-create" tabindex="0">
                    <!-- Secao: Adicionar Novo Usuario -->
                    <section class="settings-card users-create-card">
                      <div class="users-create-shell">
                        <div class="users-create-header">
                          <span class="users-create-eyebrow">Cadastro rápido</span>
                          <div class="users-create-heading">
                            <div>
                              <h3 class="modal-section-title mb-2 d-flex align-items-center gap-2">
                                <i class="bi bi-person-plus-fill text-success"></i>
                                Adicionar novo usuário
                              </h3>
                              <p class="users-create-copy mb-0">Cadastre o acesso inicial com os dados essenciais. Ajustes finos de permissão e status podem ser feitos na aba de utilizadores.</p>
                            </div>
                            <div class="users-create-meta">
                              <span class="badge users-create-badge">
                                <i class="bi bi-shield-lock me-1"></i>Acesso inicial
                              </span>
                              <span class="users-create-note">
                                <i class="bi bi-info-circle"></i>
                                Nome, e-mail e senha são obrigatórios.
                              </span>
                            </div>
                          </div>
                        </div>
                    
                        <form id="add-user-form" class="row g-3 needs-validation users-form" novalidate>
                          <div class="col-12 users-form__field">
                            <label for="new-user-fullname" class="form-label">Nome completo <span class="text-danger">*</span></label>
                            <div class="input-group">
                              <span class="input-group-text"><i class="bi bi-person"></i></span>
                              <input type="text" class="form-control" id="new-user-fullname" placeholder="Nome completo do usuário" autocomplete="name" minlength="3" required />
                              <div class="invalid-feedback w-100">Informe o nome completo.</div>
                            </div>
                          </div>
                          <div class="col-12 users-form__field">
                            <label for="new-user-cpf" class="form-label">CPF</label>
                            <div class="input-group">
                              <span class="input-group-text"><i class="bi bi-card-text"></i></span>
                              <input type="text" class="form-control" id="new-user-cpf" inputmode="numeric" maxlength="14" pattern="[0-9]{3}\\.[0-9]{3}\\.[0-9]{3}-[0-9]{2}" placeholder="000.000.000-00" />
                              <div class="invalid-feedback w-100">Use o formato 000.000.000-00.</div>
                            </div>
                          </div>
                          <div class="col-12 users-form__field">
                            <label for="new-user-email" class="form-label">E-mail <span class="text-danger">*</span></label>
                            <div class="input-group">
                              <span class="input-group-text"><i class="bi bi-envelope"></i></span>
                              <input type="email" class="form-control" id="new-user-email" placeholder="usuario@empresa.com.br" autocomplete="email" required />
                              <div class="invalid-feedback w-100">Informe um e-mail válido.</div>
                            </div>
                          </div>
                          <div class="col-12 users-form__field">
                            <label for="new-user-password" class="form-label">Senha temporária <span class="text-danger">*</span></label>
                            <div class="input-group">
                              <span class="input-group-text"><i class="bi bi-key"></i></span>
                              <input type="password" class="form-control" id="new-user-password" placeholder="Mínimo 6 caracteres" autocomplete="new-password" minlength="6" required />
                              <div class="invalid-feedback w-100">A senha deve ter no mínimo 6 caracteres.</div>
                            </div>
                          </div>
                          <div class="col-12 users-form__footer">
                            <p class="users-form__helper mb-0">A senha informada será temporária e pode ser redefinida pelo próprio utilizador no primeiro acesso.</p>
                            <button type="submit" class="btn btn-success">
                              <i class="bi bi-person-plus me-1"></i>Criar usuário
                            </button>
                          </div>
                        </form>
                      </div>
                    </section>
                  </div>

                  <div class="tab-pane fade" id="users-tab-list-pane" role="tabpanel" aria-labelledby="users-tab-list" tabindex="0">
                    <!-- Secao: Lista de Usuarios com panel-users -->
                    <section class="panel-users users-list-card">
                      <div class="panel-header">
                        <div class="panel-title-wrap">
                          <h3 class="panel-title"><i class="bi bi-people-fill"></i>Utilizadores do sistema</h3>
                          <small class="panel-subtitle text-muted">Busca e filtros locais com distribuição ajustada para leitura sem rolagem lateral.</small>
                        </div>
                        <div class="panel-filters">
                          <div class="input-group users-search-group">
                            <span class="input-group-text"><i class="bi bi-search"></i></span>
                            <input type="text" class="form-control" id="user-search" placeholder="Buscar por nome, e-mail ou CPF..." aria-label="Buscar usuário">
                          </div>
                          <div class="btn-group btn-group-sm user-filter-group" role="group" aria-label="Filtro de status">
                            <input type="radio" class="btn-check" name="user-filter" id="filter-users-all" value="all" checked>
                            <label class="btn btn-outline-secondary" for="filter-users-all">Todos</label>
                            <input type="radio" class="btn-check" name="user-filter" id="filter-users-active" value="active">
                            <label class="btn btn-outline-success" for="filter-users-active">Ativos</label>
                            <input type="radio" class="btn-check" name="user-filter" id="filter-users-inactive" value="inactive">
                            <label class="btn btn-outline-danger" for="filter-users-inactive">Inativos</label>
                          </div>
                        </div>
                      </div>
                      <div class="panel-body">
                        <table class="table table-sm table-hover align-middle mb-0 users-table">
                          <colgroup>
                            <col class="users-col-name">
                            <col class="users-col-email">
                            <col class="users-col-cpf">
                            <col class="users-col-role">
                            <col class="users-col-status">
                            <col class="users-col-actions">
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Nome completo</th>
                              <th>E-mail</th>
                              <th>CPF</th>
                              <th>Permissão</th>
                              <th>Status</th>
                              <th class="text-end">Ações</th>
                            </tr>
                          </thead>
                          <tbody id="user-list-tbody"></tbody>
                        </table>
                      </div>
                      <div class="panel-footer">
                        <span class="footer-info">Total: <strong id="user-count">0</strong> usuários</span>
                        <button type="button" class="btn btn-outline-secondary btn-sm" id="refresh-users-btn">
                          <i class="bi bi-arrow-clockwise me-1"></i>Atualizar
                        </button>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Status e Regras (sem alteração estrutural principal além de navegação externa) -->
  <div id="modal-status" class="modal fade modal-top-aligned" tabindex="-1" aria-labelledby="modal-status-title" aria-hidden="true">
          <div class="modal-dialog modal-status-xl">
          <div class="modal-content modern-modal">
            <div class="modal-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
              <h2 id="modal-status-title" class="modal-title mb-0 d-flex align-items-center gap-2"><i class="bi bi-diagram-3 text-primary"></i>Status & Regras</h2>
              <button type="button" class="btn-close-modern" data-bs-dismiss="modal" aria-label="Fechar">×</button>
            </div>
            <div class="modal-body">
            <div class="status-grid-layout">
              <div class="status-grid-col">
                <section class="settings-card" >
                  <h3 class="modal-section-title"> Regras de Status (Campos Obrigatórios)</h3>
                  <p>Defina campos obrigatórios antes de mover processos para um status especí­fico.</p>
                  <button id="open-status-rules-modal-btn" class="btn-action full-width-btn">Gerir Regras de Status</button>
                </section>
                <section class="settings-card" >
                  <h3 class="modal-section-title"> Ajuda Rápida</h3>
                  <ul class="quick-help-list">
                    <li><strong>Ordem</strong>: controla sequência exibida no Kanban.</li>
                    <li><strong>Próximos</strong>: sugere transições rápidas (separar por vírgula).</li>
                    <li>Use <em>Sincronizar com Config</em> apenas em emergências.</li>
                  </ul>
                </section>
              </div>
              <div class="status-grid-col wide">
                <section class="settings-card" >
                  <h3 class="modal-section-title"> Gerenciar Status do Sistema</h3>
                  <p>Admins podem criar, ativar/desativar e remover status disponíveis.</p>
                  <form id="status-admin-form" class="form-grid-advanced no-inline-gaps">
                    <div class="form-group">
                      <label for="status-text">Nome do Status</label>
                      <input type="text" id="status-text" placeholder="Ex.: Registrado" required />
                    </div>
                    <div class="form-group">
                      <label for="status-stage">Etapa</label>
                      <input type="text" id="status-stage" placeholder="Ex.: Cartório" required />
                    </div>
                    <div class="form-group">
                      <label for="status-order">Ordem</label>
                      <input type="number" id="status-order" step="0.1" placeholder="Ex.: 9.5" required />
                    </div>
                    <div class="form-group">
                      <label for="status-next-steps">Próximos (opcional)</label>
                      <input type="text" id="status-next-steps" placeholder="Separados por ví­rgula" />
                    </div>
                    <div class="form-group">
                      <div class="form-check form-switch mt-2">
                        <input class="form-check-input" type="checkbox" id="status-archive-flag">
                        <label class="form-check-label" for="status-archive-flag">
                          <i class="bi bi-archive me-1"></i>Arquivar processos automaticamente
                        </label>
                      </div>
                      <small class="text-muted d-block">Contratos nesse status saem da leitura contí­nua, mas continuam disponí­veis para métricas e buscas.</small>
                    </div>
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                      <button type="submit" id="status-admin-save-btn" class="btn btn-primary"><i class="bi bi-save me-1"></i>Adicionar / Atualizar</button>
                      <button type="button" id="status-admin-reload-btn" class="btn btn-outline-secondary"><i class="bi bi-arrow-clockwise me-1"></i>Recarregar Lista</button>
                      <!-- <button type="button" id="status-admin-sync-btn" class="btn-action btn-warning">Sincronizar Config</button> -->
                      <!-- Botão de migração legacy removido (migração concluída 2025-09-19) -->
                      <span id="status-admin-status" class="import-progress min-h-progress"></span>
                    </div>
                    <div id="status-migration-result" class="small text-muted d-none"></div>
                  </form>
                  
                  <!-- Acesso rápido ao modal de configurações -->
                  <div class="text-center mt-3">
                    <button type="button" id="open-table-config" class="btn btn-outline-success" title="Configurações da tabela">
                      <i class="bi bi-gear-fill"></i>
                      Configurar e Gerenciar Status
                    </button>
                    <small class="text-muted d-block mt-2">
                      Use o botão acima para visualizar, editar e gerenciar todos os status do sistema
                    </small>
                  </div>
                </section>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>

        <div id="status-rules-modal" class="modal fade" tabindex="-1" aria-labelledby="status-rules-title" aria-hidden="true">
          <div class="modal-dialog modal-w-700">
            <div class="modal-content">
              <div class="modal-header">
                <h5 id="status-rules-title" class="modal-title">Regras de Status</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
              </div>
              <div class="modal-body">
                <p>Selecione um status para editar os campos obrigatórios.</p>
                <div id="status-rules-container"></div>
              </div>
            </div>
          </div>
        </div>
<div id="edit-rule-modal" class="modal fade" tabindex="-1" aria-labelledby="rule-modal-status-name" aria-hidden="true">
          <div class="modal-dialog modal-w-md">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">Editar Regra para o Status: "<span id="rule-modal-status-name"></span>"</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
              </div>
              <div class="modal-body">
                <p>Selecione os campos que serão obrigatórios para este status.</p>

                <form id="edit-rule-form">
                  <div
                    id="rule-fields-container"
                    class="fields-selection-grid"
                  ></div>

                  <button type="submit" class="btn btn-primary mt-3"><i class="bi bi-save me-1"></i>Salvar Regra</button>
                </form>
              </div>
            </div>
          </div>
        </div>

        <div id="status-table-config-modal" class="modal fade" tabindex="-1" aria-labelledby="status-table-config-title" aria-hidden="true">
          <div class="modal-dialog modal-fullscreen">
            <div class="modal-content modal-fullscreen-content">
            <!-- Header fixo -->
            <div class="modal-header d-flex justify-content-between align-items-center border-bottom pb-3">
              <div class="d-flex align-items-center gap-3">
                <h2 id="status-table-config-title" class="modal-title mb-0">
                  <i class="bi bi-gear-fill text-primary"></i>
                  Configurações de Status
                </h2>
                <span class="badge bg-secondary" id="modal-status-count-badge">0 status</span>
              </div>
              <div class="d-flex align-items-center gap-2">
                <!-- Filtros rápidos inline -->
                <div class="btn-group btn-group-sm" role="group">
                  <input type="radio" class="btn-check" name="status-filter" id="filter-all" value="all" checked>
                  <label class="btn btn-outline-secondary" for="filter-all">Todos</label>
                  <input type="radio" class="btn-check" name="status-filter" id="filter-active" value="active">
                  <label class="btn btn-outline-success" for="filter-active">Ativos</label>
                  <input type="radio" class="btn-check" name="status-filter" id="filter-inactive" value="inactive">
                  <label class="btn btn-outline-danger" for="filter-inactive">Inativos</label>
                </div>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="modal-refresh-table" title="Atualizar dados">
                  <i class="bi bi-arrow-clockwise"></i>
                </button>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
              </div>
            </div>

            <!-- Layout principal em duas colunas -->
            <div class="modal-body-split">
              <!-- Painel lateral: Formulário -->
              <aside class="status-form-panel">
                <div class="panel-header">
                  <h5 class="mb-0">
                    <i class="bi bi-plus-circle-fill text-primary" id="modal-status-form-icon"></i>
                    <span id="modal-status-form-title">Adicionar Status</span>
                  </h5>
                  <span class="badge status-preview-badge" id="modal-status-preview">Preview</span>
                </div>
                
                <form id="modal-status-form" class="needs-validation" novalidate>
                  <div class="form-stack">
                    <!-- Nome -->
                    <div class="form-group">
                      <label for="modal-status-text" class="form-label">
                        <i class="bi bi-tag-fill text-primary"></i> Nome <span class="text-danger">*</span>
                      </label>
                      <input type="text" class="form-control form-control-sm" id="modal-status-text" 
                             placeholder="Ex.: Aguardando Documentos" required maxlength="50">
                      <div class="invalid-feedback">Obrigatório</div>
                    </div>
                    
                    <!-- Etapa e Ordem lado a lado -->
                    <div class="form-row-2">
                      <div class="form-group">
                        <label for="modal-status-stage" class="form-label">
                          <i class="bi bi-layers-fill text-info"></i> Etapa <span class="text-danger">*</span>
                        </label>
                        <input type="text" class="form-control form-control-sm" id="modal-status-stage" 
                               list="stage-suggestions" placeholder="Ex.: Cartório" required maxlength="30">
                        <datalist id="stage-suggestions">
                          <option value="Pré-Registro">
                          <option value="Registro">
                          <option value="Cartório">
                          <option value="CEF">
                          <option value="Análise">
                          <option value="Finalização">
                          <option value="Pendências">
                        </datalist>
                        <div class="invalid-feedback">Obrigatório</div>
                      </div>
                      
                      <div class="form-group">
                        <label for="modal-status-order" class="form-label">
                          <i class="bi bi-sort-numeric-up text-warning"></i> Ordem <span class="text-danger">*</span>
                        </label>
                        <div class="input-group input-group-sm">
                          <input type="number" class="form-control" id="modal-status-order" 
                                 step="0.5" min="0" max="999" placeholder="5" required>
                          <button class="btn btn-outline-secondary" type="button" id="btn-auto-order" title="Auto">
                            <i class="bi bi-magic"></i>
                          </button>
                        </div>
                        <div class="invalid-feedback">Obrigatório</div>
                      </div>
                    </div>
                    
                    <!-- Cores lado a lado -->
                    <div class="form-row-2">
                      <div class="form-group">
                        <label for="modal-status-color" class="form-label">
                          <i class="bi bi-palette-fill"></i> Cor Texto
                        </label>
                        <div class="input-group input-group-sm">
                          <input type="color" class="form-control form-control-color" id="modal-status-color" 
                                 value="#FFFFFF" title="Cor do texto">
                          <input type="text" class="form-control" id="modal-status-color-hex" 
                                 value="#FFFFFF" maxlength="7" placeholder="#FFFFFF">
                        </div>
                      </div>
                      
                      <div class="form-group">
                        <label for="modal-status-bg-color" class="form-label">
                          <i class="bi bi-paint-bucket"></i> Cor Fundo
                        </label>
                        <div class="input-group input-group-sm">
                          <input type="color" class="form-control form-control-color" id="modal-status-bg-color" 
                                 value="#0D6EFD" title="Cor de fundo">
                          <input type="text" class="form-control" id="modal-status-bg-color-hex" 
                                 value="#0D6EFD" maxlength="7" placeholder="#0D6EFD">
                        </div>
                      </div>
                    </div>
                    
                    <!-- Próximos Status -->
                    <div class="form-group">
                      <label for="modal-status-next-steps" class="form-label">
                        <i class="bi bi-signpost-split-fill text-success"></i> Próximos Status
                      </label>
                      <div class="next-steps-selector compact">
                        <div class="next-steps-selected" id="next-steps-selected">
                          <span class="placeholder-text">Clique para selecionar...</span>
                        </div>
                        <div class="next-steps-dropdown d-none" id="next-steps-dropdown">
                          <div class="next-steps-search">
                            <input type="text" class="form-control form-control-sm" 
                                   id="next-steps-search" placeholder="Buscar...">
                          </div>
                          <div class="next-steps-list" id="next-steps-list"></div>
                          <div class="next-steps-actions">
                            <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-clear-next-steps">
                              <i class="bi bi-x-circle"></i> Limpar
                            </button>
                            <button type="button" class="btn btn-sm btn-primary" id="btn-close-next-steps">
                              <i class="bi bi-check"></i> OK
                            </button>
                          </div>
                        </div>
                      </div>
                      <input type="hidden" id="modal-status-next-steps" value="">
                    </div>
                    
                    <div class="form-group">
                      <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" id="modal-status-archive">
                        <label class="form-check-label fw-semibold" for="modal-status-archive">
                          <i class="bi bi-archive me-1"></i>Arquivar processos neste status
                        </label>
                      </div>
                      <div class="form-text">Quando marcado, os processos deixam a lista padrão e reduzem leituras em tempo real (ainda disponíveis para métricas e buscas).</div>
                    </div>

                    <!-- Botões -->
                    <div class="form-actions">
                      <button type="submit" class="btn btn-primary w-100">
                        <i class="bi bi-check-lg"></i>
                        <span id="modal-status-form-submit-text">Adicionar</span>
                      </button>
                      <button type="button" id="modal-status-form-cancel" class="btn btn-outline-secondary w-100 d-none">
                        <i class="bi bi-x-lg"></i> Cancelar
                      </button>
                    </div>
                    <div id="modal-status-form-status" class="status-form-feedback"></div>
                  </div>
                </form>
              </aside>

              <!-- Área principal: Tabela -->
              <main class="status-table-panel">
                <!-- Toolbar da tabela -->
                <div class="table-toolbar">
                  <div class="toolbar-left">
                    <div class="input-group input-group-sm" class="w-filter-md">
                      <span class="input-group-text"><i class="bi bi-search"></i></span>
                      <input type="text" class="form-control" id="status-table-search" placeholder="Buscar status...">
                    </div>
                  </div>
                  <div class="toolbar-right">
                    <div class="btn-group btn-group-sm">
                      <button type="button" class="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="bi bi-eye"></i> Colunas
                      </button>
                      <ul class="dropdown-menu dropdown-menu-end">
                        <li><label class="dropdown-item"><input type="checkbox" id="modal-col-numero" checked disabled> # (fixo)</label></li>
                        <li><label class="dropdown-item"><input type="checkbox" id="modal-col-nome" checked disabled> Nome (fixo)</label></li>
                        <li><label class="dropdown-item"><input type="checkbox" id="modal-col-etapa" checked> Etapa</label></li>
                        <li><label class="dropdown-item"><input type="checkbox" id="modal-col-ordem" checked> Ordem</label></li>
                        <li><label class="dropdown-item"><input type="checkbox" id="modal-col-cor" checked> Cor</label></li>
                        <li><label class="dropdown-item"><input type="checkbox" id="modal-col-proximos" checked> Próximos</label></li>
                        <li><label class="dropdown-item"><input type="checkbox" id="modal-col-ativo" checked> Ativo</label></li>
                        <li><label class="dropdown-item"><input type="checkbox" id="modal-col-arquivar" checked> Arquivar</label></li>
                        <li><label class="dropdown-item"><input type="checkbox" id="modal-col-acoes" checked disabled> Ações (fixo)</label></li>
                      </ul>
                    </div>
                    <button type="button" id="modal-export-visible" class="btn btn-outline-success btn-sm" title="Exportar visí­veis">
                      <i class="bi bi-download"></i>
                    </button>
                    <button type="button" id="modal-export-all" class="btn btn-outline-info btn-sm" title="Exportar todos">
                      <i class="bi bi-file-earmark-spreadsheet"></i>
                    </button>
                  </div>
                </div>

                <!-- Container da tabela com scroll -->
                <div class="config-table-wrapper">
                  <table class="table table-sm table-striped table-hover status-config-table">
                    <thead class="table-light sticky-top">
                      <tr>
                        <th class="th-w-45" data-column="numero" title="Arraste para reordenar">
                          <i class="bi bi-grip-vertical text-muted"></i>
                        </th>
                        <th data-column="nome" class="th-min-w-150">Nome</th>
                        <th data-column="etapa" class="th-w-120">Etapa</th>
                        <th data-column="ordem" class="th-w-70 text-center">Ordem</th>
                        <th data-column="cor" class="th-w-70 text-center">Cor</th>
                        <th data-column="proximos" class="th-min-w-180">Próximos</th>
                        <th data-column="ativo" class="th-w-70 text-center">Ativo</th>
                        <th data-column="arquivar" class="th-w-90 text-center"><i class="bi bi-archive"></i></th>
                        <th data-column="acoes" class="th-w-90 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody id="modal-status-table-body">
                      <!-- Tabela será populada dinamicamente -->
                    </tbody>
                  </table>
                </div>

                <!-- Footer da tabela -->
                <div class="table-footer">
                  <div class="footer-info">
                    <span class="text-muted">Total: <strong id="modal-status-count">0</strong> registros</span>
                  </div>
                  <div class="footer-actions">
                    <button type="button" id="modal-reset-config" class="btn btn-outline-secondary btn-sm">
                      <i class="bi bi-arrow-counterclockwise"></i> Restaurar Padrão
                    </button>
                    <button type="button" id="modal-apply-config" class="btn btn-primary btn-sm">
                      <i class="bi bi-check-lg"></i> Aplicar e Fechar
                    </button>
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },
};
