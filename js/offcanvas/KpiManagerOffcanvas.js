export const KpiManagerOffcanvas = {
  id: 'kpiManagerOffcanvas',

  render() {
    if (document.getElementById(this.id)) {
      return document.getElementById(this.id);
    }

    const html = `
      <!-- Offcanvas: Gerenciar KPIs personalizados -->
      <div class="offcanvas offcanvas-end offcanvas-w-lg" tabindex="-1" id="kpiManagerOffcanvas" aria-labelledby="kpiManagerOffcanvasLabel">
        <div class="offcanvas-header border-bottom bg-primary text-white">
          <h5 id="kpiManagerOffcanvasLabel" class="d-flex align-items-center gap-2 mb-0">
            <i class="bi bi-kanban"></i>
            Gerenciar KPIs
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Fechar"></button>
        </div>
        <div class="offcanvas-body p-0">
          <!-- Accordion para organizar as seções -->
          <div class="accordion accordion-flush" id="kpiManagerAccordion">
            
            <!-- Seção: Templates Rápidos -->
            <div class="accordion-item">
              <h2 class="accordion-header">
                <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseTemplates" aria-expanded="true">
                  <i class="bi bi-lightning me-2"></i>Templates Rápidos
                </button>
              </h2>
              <div id="collapseTemplates" class="accordion-collapse collapse show" data-bs-parent="#kpiManagerAccordion">
                <div class="accordion-body">
                  <div class="d-flex flex-wrap gap-2">
                    <button type="button" class="btn btn-outline-success btn-sm" id="kpi-template-assinados-mes">
                      <i class="bi bi-pen me-1"></i>Assinados no Mês
                    </button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" id="kpi-template-total-contratos">
                      <i class="bi bi-collection me-1"></i>Processos em Andamento
                    </button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" id="kpi-template-tempo-medio-analise-cehop">
                      <i class="bi bi-clock me-1"></i>Tempo CEHOP
                    </button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" id="kpi-template-tempo-medio-liberacao-garantia">
                      <i class="bi bi-shield-check me-1"></i>Liberação Garantia
                    </button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" id="kpi-template-entradas-mes">
                      <i class="bi bi-calendar-month me-1"></i>Mês Atual
                    </button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" id="kpi-template-entradas-ano">
                      <i class="bi bi-calendar-event me-1"></i>Ano Atual
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Seção: Criar Novo KPI -->
            <div class="accordion-item">
              <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseNewKpi" aria-expanded="false">
                  <i class="bi bi-plus-circle me-2"></i>Criar Novo KPI
                </button>
              </h2>
              <div id="collapseNewKpi" class="accordion-collapse collapse" data-bs-parent="#kpiManagerAccordion">
                <div class="accordion-body">
                  <!-- Campos do KPI -->
                  <div class="mb-2">
                    <label class="form-label small mb-1">Título <span class="text-danger">*</span></label>
                    <input type="text" class="form-control form-control-sm" id="kpi-title-input" placeholder="Ex.: Ticket Médio" required />
                  </div>
                  <div class="row g-2 mb-2">
                    <div class="col-4">
                      <label class="form-label small mb-1">Ícone</label>
                      <input type="text" class="form-control form-control-sm" id="kpi-icon-input" placeholder=" ou bi-*" list="kpi-icon-datalist" />
                    </div>
                    <div class="col-4">
                      <label class="form-label small mb-1">Cor</label>
                      <select class="form-select form-select-sm" id="kpi-color-select">
                        <option value="primary">Azul</option>
                        <option value="success">Verde</option>
                        <option value="warning">Amarelo</option>
                        <option value="danger">Vermelho</option>
                        <option value="info">Ciano</option>
                        <option value="secondary">Cinza</option>
                      </select>
                    </div>
                    <div class="col-4">
                      <label class="form-label small mb-1">Unidade</label>
                      <input type="text" class="form-control form-control-sm" id="kpi-unit-input" placeholder="R$, %" />
                    </div>
                  </div>
                  <div class="row g-2 mb-2">
                    <div class="col-6">
                      <label class="form-label small mb-1">Agregação <span class="text-danger">*</span></label>
                      <select class="form-select form-select-sm" id="kpi-agg-select">
                        <option value="count">Contagem</option>
                        <option value="sum">Soma</option>
                        <option value="avg">Média</option>
                        <option value="min">Mínimo</option>
                        <option value="max">Máximo</option>
                        <option value="distinct">Distintos</option>
                        <option value="ratio">Taxa (%)</option>
                      </select>
                    </div>
                    <div class="col-6">
                      <label class="form-label small mb-1">Campo (fonte)</label>
                      <select class="form-select form-select-sm" id="kpi-field-select"></select>
                    </div>
                  </div>
                  <!-- Filtro opcional -->
                  <div class="mb-2">
                    <label class="form-label small mb-1">Filtro (opcional)</label>
                    <div class="row g-1">
                      <div class="col-5">
                        <select class="form-select form-select-sm" id="kpi-filter-field-select">
                          <option value="">Nenhum</option>
                        </select>
                      </div>
                      <div class="col-3">
                        <select class="form-select form-select-sm" id="kpi-filter-operator-select">
                          <option value="==">=</option>
                          <option value=">=">≥</option>
                          <option value="<=">≤</option>
                          <option value=">">></option>
                          <option value="<">&lt;</option>
                          <option value="!=">≠</option>
                          <option value="includes">contém</option>
                          <option value="between">entre</option>
                          <option value="in">em lista</option>
                          <option value="notIn">não em lista</option>
                          <option value="exists">existe</option>
                          <option value="lastNDays">últimos N dias</option>
                        </select>
                      </div>
                      <div class="col-4">
                        <input type="text" class="form-control form-control-sm" id="kpi-filter-value-input" placeholder="valor" />
                      </div>
                    </div>
                    <div class="row g-1 mt-1">
                      <div class="col-6">
                        <input type="text" class="form-control form-control-sm d-none" id="kpi-filter-value-input-2" placeholder="valor 2 (entre)" />
                      </div>
                      <div class="col-6">
                        <input type="number" min="1" class="form-control form-control-sm d-none" id="kpi-filter-ndays-input" placeholder="N dias" />
                      </div>
                    </div>
                  </div>
                  <!-- Formato -->
                  <div class="row g-2 mb-3">
                    <div class="col-7">
                      <label class="form-label small mb-1">Formato</label>
                      <select class="form-select form-select-sm" id="kpi-format-select">
                        <option value="raw" selected>Sem formatação</option>
                        <option value="currency">Moeda (R$)</option>
                        <option value="number">Número</option>
                        <option value="percent">Percentual</option>
                        <option value="days">Dias</option>
                      </select>
                    </div>
                    <div class="col-5">
                      <label class="form-label small mb-1">Decimais</label>
                      <input type="number" min="0" max="6" value="0" class="form-control form-control-sm" id="kpi-format-decimals" />
                    </div>
                  </div>
                  <!-- Pré-visualização -->
                  <div class="mb-3 p-2 border rounded bg-light d-none" id="kpi-preview-container">
                    <small class="text-muted d-block mb-1">Pré-visualização:</small>
                    <div class="d-flex align-items-center gap-2">
                      <span id="kpi-preview-icon"></span>
                      <strong id="kpi-preview-title">--</strong>
                      <span class="ms-auto fs-5 fw-bold" id="kpi-preview-value">--</span>
                    </div>
                  </div>
                  <!-- Botões de ação -->
                  <div class="d-flex gap-2">
                    <button type="button" class="btn btn-outline-secondary btn-sm" id="kpi-preview-btn">
                      <i class="bi bi-eye me-1"></i>Pré-visualizar
                    </button>
                    <button type="button" class="btn btn-primary btn-sm" id="kpi-add-btn">
                      <i class="bi bi-plus-lg me-1"></i>Adicionar KPI
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Seção: KPIs Configurados -->
            <div class="accordion-item">
              <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseKpiList" aria-expanded="false">
                  <i class="bi bi-list-ul me-2"></i>KPIs Configurados
                  <span class="badge bg-primary rounded-pill ms-2" id="kpi-count-badge">0</span>
                </button>
              </h2>
              <div id="collapseKpiList" class="accordion-collapse collapse" data-bs-parent="#kpiManagerAccordion">
                <div class="accordion-body">
                  <div id="custom-kpis-list" class="list-group list-group-flush">
                    <!-- Lista de KPIs será preenchida dinamicamente -->
                  </div>
                  <div class="text-muted text-center py-3" id="custom-kpis-empty">
                    <i class="bi bi-inbox fs-3 d-block mb-2"></i>
                    Nenhum KPI configurado.<br>
                    <small>Use os templates ou crie um novo.</small>
                  </div>
                  <div class="border-top pt-3 mt-3 d-flex justify-content-between">
                    <button type="button" class="btn btn-outline-warning btn-sm" id="kpi-reset-defaults-btn">
                      <i class="bi bi-arrow-counterclockwise me-1"></i>Restaurar Padrões
                    </button>
                    <button type="button" class="btn btn-outline-primary btn-sm" id="kpi-refresh-btn">
                      <i class="bi bi-arrow-repeat me-1"></i>Atualizar Dashboard
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Seção: Ajuda -->
            <div class="accordion-item">
              <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseKpiHelp" aria-expanded="false">
                  <i class="bi bi-question-circle me-2"></i>Como usar
                </button>
              </h2>
              <div id="collapseKpiHelp" class="accordion-collapse collapse" data-bs-parent="#kpiManagerAccordion">
                <div class="accordion-body small">
                  <p><strong>Como criar um KPI:</strong></p>
                  <ol class="ps-3 mb-3">
                    <li>Use um template rápido ou preencha os campos manualmente</li>
                    <li>Escolha o tipo de agregação (contagem, soma, média, etc)</li>
                    <li>Selecione o campo de dados e, se desejar, adicione um filtro</li>
                    <li>Clique em "Adicionar KPI"</li>
                  </ol>
                  <p><strong>Dicas:</strong></p>
                  <ul class="ps-3 mb-0">
                    <li>Para filtrar datas relativas, use: <code>__LAST_30_DAYS__</code>, <code>__CURRENT_MONTH__</code>, <code>__CURRENT_YEAR__</code></li>
                    <li>Os KPIs criados ficam visíveis para todos (se você for admin)</li>
                    <li>Use o toggle para ocultar/mostrar KPIs no dashboard</li>
                  </ul>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- Datalist para ícones do KPI -->
      <datalist id="kpi-icon-datalist">
        <option value="">Gráfico</option>
        <option value="">Alta</option>
        <option value="">Baixa</option>
        <option value="">Dinheiro</option>
        <option value="⏱">Tempo</option>
        <option value="">OK</option>
        <option value="">Pendente</option>
        <option value="bi-collection">Coleção</option>
        <option value="bi-currency-dollar">Moeda</option>
        <option value="bi-percent">Percentual</option>
        <option value="bi-alarm">Tempo</option>
        <option value="bi-kanban">Kanban</option>
      </datalist>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const el = document.getElementById(this.id);
    if (el && window.bootstrap?.Offcanvas) {
      window.bootstrap.Offcanvas.getOrCreateInstance(el);
    }

    return el;
  },
};
