function normalizeDetailsModalCopy(root) {
  if (!root || typeof root.querySelector !== 'function') {
    return;
  }

  const textBySelector = new Map([
    ['[data-tab="dados-principais"] .tab-text', 'Dados Principais'],
    ['[data-tab="formularios"] .tab-text', 'Formulários'],
    ['[data-tab="anotacoes-historico"] .tab-text', 'Anotações e Histórico'],
    ['[data-tab="pendencias"] .tab-text', 'Pendências'],
    ['#tab-fechamento .financial-column:nth-of-type(1) h4', 'Débitos (Custos)'],
    ['#tab-fechamento .financial-column:nth-of-type(1) .section-label', 'Valores de Referência'],
    ['#tab-fechamento .financial-column:nth-of-type(1) .readonly-group:nth-of-type(2) label', 'Cartório (RI):'],
    ['#tab-fechamento .financial-column:nth-of-type(1) .financial-total strong', 'Total de Débitos:'],
    ['#tab-fechamento .financial-column:nth-of-type(2) h4', 'Repasses (Créditos)'],
    ['#tab-fechamento fieldset:nth-of-type(2) legend', 'Documentação e NF'],
    ['label[for="modal-dataEmissaoNF"]', 'Data Emissão NF:'],
    ['label[for="modal-documentacaoRepasse"]', 'Documentação e Repasse (Observações):'],
    ['#modal-documentacaoRepasse', 'Observações sobre documentação, repasses pendentes, etc.'],
    ['#ai-tab-clear-btn', 'Limpar sugestões'],
    ['#ai-tab-status', 'Pronto para usar IA.'],
    ['#tab-whatsapp-empty strong', 'Vincular processo'],
    ['.save-btn', 'Salvar Alterações']
  ]);

  textBySelector.forEach((text, selector) => {
    const el = root.querySelector(selector);
    if (!el) return;

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.setAttribute('placeholder', text);
      return;
    }

    if (selector === '#ai-tab-clear-btn') {
      el.innerHTML = '<i class="bi bi-eraser me-1"></i>Limpar sugestões';
      return;
    }

    if (selector === '[data-tab="dados-principais"] .tab-text'
      || selector === '[data-tab="formularios"] .tab-text'
      || selector === '[data-tab="anotacoes-historico"] .tab-text'
      || selector === '[data-tab="pendencias"] .tab-text') {
      el.textContent = text;
      return;
    }

    if (selector === '#tab-fechamento fieldset:nth-of-type(2) legend') {
      el.innerHTML = '<i class="bi bi-file-earmark-text me-2"></i>Documentação e NF';
      return;
    }

    if (selector === '.save-btn') {
      el.innerHTML = '<i class="bi bi-save me-2"></i>Salvar Alterações';
      return;
    }

    el.textContent = text;
  });

  const whatsappEmpty = root.querySelector('#whatsapp-tab-empty');
  if (whatsappEmpty) {
    whatsappEmpty.innerHTML = '<i class="bi bi-exclamation-circle me-1"></i>Nenhuma conversa vinculada a este processo.<br />Use o botão <strong>Vincular processo</strong> no painel do WhatsApp para associar esta conversa.';
  }
}

export const DetailsModal = {
  id: 'details-modal',

  render() {
    const existing = document.getElementById(this.id);
    if (existing) {
      normalizeDetailsModalCopy(existing);
      return bootstrap?.Modal?.getOrCreateInstance
        ? bootstrap.Modal.getOrCreateInstance(existing)
        : null;
    }

    const html = `
    <div class="modal fade" id="details-modal" tabindex="-1" aria-labelledby="details-modal-title" aria-hidden="true" role="dialog" aria-modal="true">
      <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable modal-fullscreen-lg-down app-modal-dialog">
        <div class="modal-content modal-shell" style="max-height: 94vh; overflow: hidden; display: flex; flex-direction: column;">
          <div class="modal-header d-flex justify-content-between align-items-center border-bottom pb-3 mb-1 flex-shrink-0">
            <h2 class="modal-title mb-0" id="details-modal-title">
              <i class="bi bi-file-earmark-text text-primary"></i>
              Detalhes do Processo
            </h2>
            <button type="button" class="btn-close btn-close-modern" data-bs-dismiss="modal" aria-label="Fechar">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>

          <!-- Navegação principal das abas (FORA do modal-body para ficar sempre visível) -->
          <div class="px-3 pb-3 border-bottom bg-white">
            <div class="nav nav-pills nav-fill modern-tabs" role="tablist">
              <button
                class="nav-link active d-flex align-items-center justify-content-center"
                type="button"
                data-tab="dados-principais"
                role="tab"
              >
                <i class="bi bi-person-fill me-2"></i>
                <span class="tab-text">Dados Principais</span>
              </button>
              <button
                class="nav-link d-flex align-items-center justify-content-center"
                type="button"
                data-tab="formularios"
                role="tab"
              >
                <i class="bi bi-file-earmark-ruled me-2"></i>
                <span class="tab-text">Formulários</span>
              </button>
              <button
                class="nav-link d-flex align-items-center justify-content-center"
                type="button"
                data-tab="registro"
                role="tab"
              >
                <i class="bi bi-clipboard-check me-2"></i>
                <span class="tab-text">Registro</span>
              </button>
              <button
                class="nav-link d-flex align-items-center justify-content-center"
                type="button"
                data-tab="anotacoes-historico"
                role="tab"
              >
                <i class="bi bi-journal-bookmark me-2"></i>
                <span class="tab-text">Anotações e Histórico</span>
              </button>
              <button
                class="nav-link d-flex align-items-center justify-content-center position-relative"
                type="button"
                data-tab="pendencias"
                role="tab"
              >
                <i class="bi bi-exclamation-circle me-2"></i>
                <span class="tab-text">Pendências</span>
                <span id="tab-pendencias-badge" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style="display: none;">
                  0
                </span>
              </button>
              <button
                class="nav-link d-flex align-items-center justify-content-center position-relative"
                type="button"
                data-tab="gestao-erros"
                role="tab"
              >
                <i class="bi bi-bug me-2"></i>
                <span class="tab-text">Erros (QA)</span>
                <span id="tab-gestao-erros-badge" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style="display: none;">
                  0
                </span>
              </button>
              <button
                class="nav-link d-flex align-items-center justify-content-center"
                type="button"
                data-tab="anexos"
                role="tab"
              >
                <i class="bi bi-paperclip me-2"></i>
                <span class="tab-text">Anexos</span>
              </button>
              <button
                class="nav-link d-flex align-items-center justify-content-center"
                type="button"
                data-tab="requerimentos"
                role="tab"
              >
                <i class="bi bi-file-earmark-plus me-2"></i>
                <span class="tab-text">Requerimentos</span>
              </button>
              <button
                class="nav-link d-flex align-items-center justify-content-center"
                type="button"
                data-tab="fechamento"
                role="tab"
              >
                <i class="bi bi-calculator me-2"></i>
                <span class="tab-text">Fechamento</span>
              </button>
              <button
                class="nav-link d-flex align-items-center justify-content-center"
                type="button"
                data-tab="ia"
                role="tab"
              >
                <i class="bi bi-magic me-2"></i>
                <span class="tab-text">IA</span>
              </button>
              <button
                class="nav-link d-flex align-items-center justify-content-center position-relative"
                type="button"
                data-tab="whatsapp"
                role="tab"
              >
                <i class="bi bi-whatsapp me-2"></i>
                <span class="tab-text">WhatsApp</span>
                <span id="tab-whatsapp-badge" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-success" style="display: none;">
                  0
                </span>
              </button>
            </div>
            <!-- Controle de visibilidade de campos (afeta abas Formulários e Registro) -->
            <div class="d-flex align-items-center justify-content-end mt-2">
              <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" id="details-show-all-fields">
                <label class="form-check-label small text-muted" for="details-show-all-fields">
                  <i class="bi bi-eye me-1"></i>Exibir todos os campos
                </label>
              </div>
            </div>
          </div>

          <div class="modal-body" style="overflow-y: auto; flex: 1; min-height: 0;">
            <form id="details-form" autocomplete="off">
              <input type="hidden" id="modal-contract-id" />
            <div class="row g-4">
              <div class="col-12 col-lg-4 col-xl-3">
              <div class="d-flex flex-column gap-4 sticky-offset-sm">
                <div class="card border-0 shadow-sm">
                  <div class="card-header bg-light">
                    <div class="d-flex justify-content-between align-items-center">
                      <h5 class="mb-0 d-flex align-items-center">
                        <i class="bi bi-speedometer text-primary me-2"></i>
                        Visão Geral
                      </h5>
                      <span class="badge bg-light text-dark border border-light" id="modal-summary-id">—</span>
                    </div>
                  </div>

                    <div class="card border-0 shadow-sm">
                      <div class="card-header bg-gradient-primary text-white">
                    <h5 class="mb-0 d-flex align-items-center">
                      <i class="bi bi-gear-fill me-2"></i>
                      Alterar Status do Processo
                    </h5>
                  </div>
                  <div class="card-body">
                    <div class="status-controls"></div>
                    <div id="status-action-container"></div>
                    <div class="d-none">
                      <label for="modal-details-status" class="form-label">Status Atual do Processo</label>
                      <select id="modal-details-status" name="status" class="form-select"></select>
                    </div>
                  </div>
                  <div class="card-footer bg-light">
                    <button
                      type="button"
                      id="toggle-status-view-btn"
                      class="btn btn-outline-primary btn-sm w-100 btn-outline"
                    >
                      Mostrar próximos
                    </button>
                  </div>
                </div>

                      <div class="card-body">
                        <div class="vstack gap-3">
                      <div class="d-flex align-items-center justify-content-between gap-2">
                        <div class="d-flex align-items-center text-muted small">
                          <i class="bi bi-info-circle me-2"></i>
                          Status
                        </div>
                        <span id="modal-summary-status" class="badge rounded-pill fw-semibold bg-secondary">—</span>
                      </div>
                      <div class="d-flex align-items-center justify-content-between gap-2">
                        <div class="d-flex align-items-center text-muted small">
                          <i class="bi bi-diagram-3 me-2"></i>
                          Etapa
                        </div>
                        <span id="modal-summary-stage" class="fw-semibold small text-end text-truncate">—</span>
                      </div>
                      <div class="d-flex align-items-center justify-content-between gap-2">
                        <div class="d-flex align-items-center text-muted small">
                          <i class="bi bi-stopwatch me-2"></i>
                          Tempo no status
                        </div>
                        <span id="modal-summary-time" class="badge bg-light text-dark border border-light">—</span>
                      </div>
                      <div class="d-flex align-items-center justify-content-between gap-2">
                        <div class="d-flex align-items-center text-muted small">
                          <i class="bi bi-calendar-plus me-2"></i>
                          Criado em
                        </div>
                        <span id="modal-summary-created" class="fw-semibold small text-end text-truncate">—</span>
                      </div>
                      <div class="d-flex align-items-center justify-content-between gap-2">
                        <div class="d-flex align-items-center text-muted small">
                          <i class="bi bi-clock-history me-2"></i>
                          Atualizado em
                        </div>
                        <span id="modal-summary-updated" class="fw-semibold small text-end text-truncate">—</span>
                      </div>
                      <div class="d-flex align-items-start justify-content-between gap-2">
                        <div class="d-flex align-items-center text-muted small">
                          <i class="bi bi-building me-2"></i>
                          Empreendimento
                        </div>
                        <span id="modal-summary-empreendimento" class="fw-semibold small text-end text-break">—</span>
                      </div>
                      <div class="d-flex align-items-start justify-content-between gap-2">
                        <div class="d-flex align-items-center text-muted small">
                          <i class="bi bi-hash me-2"></i>
                          Unidade
                        </div>
                        <span id="modal-summary-unidade" class="fw-semibold small text-end text-break">—</span>
                      </div>
                      <div class="d-flex align-items-start justify-content-between gap-2">
                        <div class="d-flex align-items-center text-muted small">
                          <i class="bi bi-person-vcard me-2"></i>
                          Analista Aprovacao
                        </div>
                        <span id="modal-summary-analistaAprovacao" class="fw-semibold small text-end text-break">—</span>
                      </div>
                      <div class="d-flex align-items-start justify-content-between gap-2">
                        <div class="d-flex align-items-center text-muted small">
                          <i class="bi bi-person-badge me-2"></i>
                          Analista Formulários
                        </div>
                        <span id="modal-summary-analista" class="fw-semibold small text-end text-break">—</span>
                      </div>
                      <div class="d-flex align-items-start justify-content-between gap-2">
                        <div class="d-flex align-items-center text-muted small">
                          <i class="bi bi-person-check me-2"></i>
                          Analista CEHOP
                        </div>
                        <span id="modal-summary-analistaCehop" class="fw-semibold small text-end text-break">—</span>
                      </div>
                      <div class="d-flex align-items-start justify-content-between gap-2">
                        <div class="d-flex align-items-center text-muted small">
                          <i class="bi bi-person-gear me-2"></i>
                          Última alteração por
                        </div>
                        <span id="modal-summary-ultimoAnalistaAlteracao" class="fw-semibold small text-end text-break">—</span>
                      </div>
                      <div class="d-flex align-items-start justify-content-between gap-2">
                        <div class="d-flex align-items-center text-muted small">
                          <i class="bi bi-shop-window me-2"></i>
                          Vendedor
                        </div>
                        <span id="modal-summary-vendedor" class="fw-semibold small text-end text-break">—</span>
                      </div>
                        </div>
                      </div>
                    </div>

                    <!-- status estavam aqui -->

                  </div>
                </div>

                <div class="col-12 col-lg-8 col-xl-9">
                  <!-- Abas do processo -->
                  <div class="tabs-container">
                    <!-- Dados Principais -->
                    <div id="tab-dados-principais" class="tab-content active">
              
              <!-- Compradores Section -->
              <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-light">
                  <div class="d-flex justify-content-between align-items-center gap-2">
                    <h5 class="mb-0 d-flex align-items-center">
                      <i class="bi bi-people-fill text-primary me-2"></i>
                      Compradores
                    </h5>
                    <button
                      type="button"
                      id="toggle-compradores-edit-btn"
                      class="btn btn-outline-secondary btn-sm"
                      title="Habilitar edicao dos compradores"
                      aria-label="Habilitar edicao dos compradores"
                      aria-pressed="false"
                    >
                      <i class="bi bi-pencil-square"></i>
                    </button>
                  </div>
                </div>
                <div class="card-body">
                  <div id="compradores-container" class="mb-3"></div>
                  <button
                    type="button"
                    id="add-comprador-btn"
                    class="btn btn-outline-primary"
                  >
                    <i class="bi bi-person-plus me-2"></i>
                    Adicionar Comprador
                  </button>
                </div>
              </div>

              <!-- Analistas -->
              <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-light">
                  <h5 class="mb-0 d-flex align-items-center">
                    <i class="bi bi-person-badge text-primary me-2"></i>
                    Analistas
                  </h5>
                </div>
                <div class="card-body">
                  <div class="form-grid-advanced grid-cols-auto-fit-220">
                    <div class="form-group">
                      <label for="modal-entrada">Data de Entrada:</label>
                      <input type="date" id="modal-entrada" class="form-control" />
                    </div>
                    <div class="form-group">
                      <label for="modal-analistaAprovacao">Analista Aprovação:</label>
                      <select id="modal-analistaAprovacao" class="form-select">
                        <option value="">-- Selecione --</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="modal-analista">Analista Formulários:</label>
                      <select id="modal-analista" class="form-select">
                        <option value="">-- Nenhum --</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="modal-analistaCehop">Analista CEHOP:</label>
                      <select id="modal-analistaCehop" class="form-select">
                        <option value="">-- Selecione --</option>
                        <!-- Será preenchido dinamicamente com os usuários do sistema -->
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="modal-ultimoAnalistaAlteracao">Analista da última alteração/atualização:</label>
                      <input type="text" id="modal-ultimoAnalistaAlteracao" class="form-control" readonly style="background-color: #f8f9fa;" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Empreendimento e Imóvel -->
              <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-light">
                  <h5 class="mb-0 d-flex align-items-center">
                    <i class="bi bi-building text-primary me-2"></i>
                    Empreendimento / Dados do Imóvel
                  </h5>
                </div>
                <div class="card-body">
                  <div class="form-grid-advanced grid-cols-auto-fit-220">
                    <div class="form-group inline-suggest-wrapper span-2">
                      <label for="modal-vendedorConstrutora">Vendedor/Construtora:</label>
                      <input
                        type="text"
                        id="modal-vendedorConstrutora"
                        class="form-control"
                        list="datalist-vendedores"
                        autocomplete="off"
                      />
                      <div class="suggestions-panel" id="suggestions-modal-vendors" data-source="vendors" hidden>
                        <ul class="suggestions-list" id="suggestions-modal-vendors-list"></ul>
                      </div>
                    </div>
                    <div class="form-group inline-suggest-wrapper span-2">
                      <label for="modal-empreendimento">Empreendimento:</label>
                      <input
                        type="text"
                        id="modal-empreendimento"
                        class="form-control"
                        list="datalist-empreendimentos"
                        autocomplete="off"
                      />
                      <div class="suggestions-panel" id="suggestions-modal-emps" data-source="empreendimentos" hidden>
                        <ul class="suggestions-list" id="suggestions-modal-emps-list"></ul>
                      </div>
                    </div>
                    <div class="form-group">
                      <label for="modal-apto">Apartamento:</label>
                      <input type="text" id="modal-apto" class="form-control" />
                    </div>
                    <div class="form-group">
                      <label for="modal-bloco">Bloco:</label>
                      <input type="text" id="modal-bloco" class="form-control" />
                    </div>
                  </div>
                  <div class="mt-4">
                    <div class="text-muted small fw-semibold text-uppercase mb-2">Dados do Imóvel</div>
                    <div class="form-grid-advanced grid-cols-auto-fit-220">
                      <div class="form-group span-2">
                        <label for="modal-enderecoImovel">Endereço do Imóvel:</label>
                        <input type="text" id="modal-enderecoImovel" class="form-control" placeholder="Rua, número, complemento" />
                      </div>
                      <div class="form-group">
                        <label for="modal-cidadeImovel">Cidade:</label>
                        <input type="text" id="modal-cidadeImovel" class="form-control" />
                      </div>
                      <div class="form-group">
                        <label for="modal-ufImovel">UF:</label>
                        <input type="text" id="modal-ufImovel" class="form-control" maxlength="2" />
                      </div>
                      <div class="form-group">
                        <label for="modal-cepImovel">CEP:</label>
                        <input type="text" id="modal-cepImovel" class="form-control" />
                      </div>
                      <div class="form-group">
                        <label for="modal-inscricaoImobiliaria">Inscrição/Indicação Fiscal:</label>
                        <input type="text" id="modal-inscricaoImobiliaria" class="form-control" />
                      </div>
                      <div class="form-group">
                        <label for="modal-matriculaImovel">Matrícula do RI:</label>
                        <input type="text" id="modal-matriculaImovel" class="form-control" />
                      </div>
                      <div class="form-group">
                        <label for="modal-areaTerreno">Área do Terreno (m²):</label>
                        <input type="number" step="0.01" id="modal-areaTerreno" class="form-control" />
                      </div>
                      <div class="form-group">
                        <label for="modal-areaConstruida">Área Construída (m²):</label>
                        <input type="number" step="0.01" id="modal-areaConstruida" class="form-control" />
                      </div>
                      <div class="form-group">
                        <label for="modal-tipoImovel">Tipo do Imóvel:</label>
                        <select id="modal-tipoImovel" class="form-select">
                          <option value="">-- Selecione --</option>
                          <option value="urbano">Urbano</option>
                          <option value="rural">Rural</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div class="mt-4">
                    <div class="text-muted small fw-semibold text-uppercase mb-2">Valores de Aquisição</div>
                    <div class="form-grid-advanced grid-cols-auto-fit-220">
                      <div class="form-group">
                        <label for="modal-valorAvaliacao">Valor de Avaliação (R$):</label>
                        <input
                          type="text"
                          id="modal-valorAvaliacao"
                          class="form-control"
                          inputmode="decimal"
                          placeholder="0,00"
                        />
                      </div>
                      <div class="form-group">
                        <label for="modal-valorNegociadoConstrutora">Valor Compra e Venda Construtora/Vendedor (R$):</label>
                        <input
                          type="text"
                          id="modal-valorNegociadoConstrutora"
                          class="form-control"
                          inputmode="decimal"
                          placeholder="0,00"
                        />
                      </div>
                      <div class="form-group">
                        <label for="modal-valorContratoBanco">Valor do Contrato Banco (R$):</label>
                        <input
                          type="text"
                          id="modal-valorContratoBanco"
                          class="form-control"
                          inputmode="decimal"
                          placeholder="0,00"
                        />
                      </div>
                      <div class="form-group">
                        <label for="modal-valorContrato">Valor Financiado (R$):</label>
                        <input
                          type="text"
                          id="modal-valorContrato"
                          class="form-control"
                          inputmode="decimal"
                          placeholder="0,00"
                        />
                      </div>
                      <div class="form-group">
                        <label for="modal-valorRecursosProprios">Valor Recursos Proprios (R$):</label>
                        <input
                          type="text"
                          id="modal-valorRecursosProprios"
                          class="form-control"
                          inputmode="decimal"
                          placeholder="0,00"
                        />
                      </div>
                      <div class="form-group">
                        <label for="modal-valorSubsidio">Valor Subsidio (R$):</label>
                        <input
                          type="text"
                          id="modal-valorSubsidio"
                          class="form-control"
                          inputmode="decimal"
                          placeholder="0,00"
                        />
                      </div>
                      <div class="form-group">
                        <label for="modal-valorFgts">Valor FGTS (R$):</label>
                        <input
                          type="text"
                          id="modal-valorFgts"
                          class="form-control"
                          inputmode="decimal"
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- Workflow do Processo -->
              <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-light" role="button" data-bs-toggle="collapse" data-bs-target="#collapse-config-processo" aria-expanded="false" aria-controls="collapse-config-processo">
                  <h5 class="mb-0 d-flex align-items-center justify-content-between">
                    <span class="d-flex align-items-center">
                      <i class="bi bi-diagram-2 text-primary me-2"></i>
                      Workflow do Processo
                    </span>
                    <i class="bi bi-chevron-down collapse-icon transition-transform"></i>
                  </h5>
                </div>
                <div class="collapse" id="collapse-config-processo">
                  <div class="card-body">
                    <div class="row g-3">
                      <div class="col-md-12">
                        <label for="modal-workflowId" class="form-label">Tipo de Processo (Workflow)</label>
                        <select class="form-select" id="modal-workflowId" name="workflowId">
                          <option value="" selected>Padrão (Sistema)</option>
                          <!-- Opções carregadas dinamicamente -->
                        </select>
                        <div class="form-text">Define as etapas e regras aplicáveis a este contrato.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Formularios e CEHOP -->
            <div id="tab-formularios" class="tab-content">
              <fieldset>
                <legend>Formulários e CEHOP</legend>
                <div
                  class="form-grid-advanced"
                  class="grid-cols-4"
                >
                  <div class="form-group">
                    <label for="details-formularios-codigoCCA">Código CCA:</label>
                    <input type="text" id="details-formularios-codigoCCA" />
                    </div>
                  <div class="form-group">
                    <label for="modal-vencSicaq">Vencimento SICAQ:</label>
                    <input type="date" id="modal-vencSicaq" />
                  </div>
                  <div class="form-group">
                    <label for="modal-renda">Renda:</label>
                    <select id="modal-renda">
                      <option value="">-- Selecione --</option>
                      <option value="E-social">E-social</option>
                      <option value="FORMAL">FORMAL</option>
                      <option value="Imposto de Renda">Imposto de Renda</option>
                      <option value="INFORMAL">INFORMAL</option>
                      <option value="MISTA">MISTA</option>
                      <option value="PRO-LABORE">PRO-LABORE</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="modal-validacao">Validação:</label>
                    <select id="modal-validacao">
                      <option value="">-- Selecione --</option>
                      <option value="Validada">Validada</option>
                      <option value="Não validada">Não validada</option>
                      <option value="Enviado para validação">Enviado para validação</option>
                      <option value="Não se aplica">Não se aplica</option>
                      <option value="Doc Pendente">Doc Pendente</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="modal-fgts">FGTS:</label>
                    <select id="modal-fgts">
                      <option value="">-- Selecione --</option>
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="modal-casaFacil">Casa Fácil/Porta de Entrada:</label>
                    <select id="modal-casaFacil">
                      <option value="">-- Selecione --</option>
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="modal-certificadora">Certificadora:</label>
                    <select id="modal-certificadora">
                      <option value="">-- Selecione --</option>
                      <option value="BrasilCertec">BrasilCertec</option>
                      <option value="BrasilCertec/Parceiro">BrasilCertec/Parceiro</option>
                      <option value="BrasilCertec/Finanville">BrasilCertec/Finanville</option>
                      <option value="Finanville">Finanville</option>
                      <option value="Manual">Manual</option>
                      <option value="Parceiro">Parceiro</option>
                      <option value="GOV">GOV</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="modal-certificacaoSolicEm">Solicitação Certificação:</label>
                    <input type="date" id="modal-certificacaoSolicEm" />
                  </div>
                  <div class="form-group">
                    <label for="modal-certificacaoRealizadaEm">Certificação Realizada em:</label>
                    <input type="datetime-local" id="modal-certificacaoRealizadaEm" />
                  </div>
                  <div class="form-group">
                    <label for="modal-solicitacaoCohapar">Solicitação Cohapar:</label>
                    <input type="date" id="modal-solicitacaoCohapar" />
                  </div>
                  <div class="form-group">
                    <label for="modal-cohaparAprovada">Cohapar Aprovada:</label>
                    <input type="date" id="modal-cohaparAprovada" />
                  </div>
                  <div class="form-group">
                    <label for="modal-sehab">SEHAB:</label>
                    <select id="modal-sehab">
                      <option value="">-- Selecione --</option>
                      <option value="Conferencia Inicial">Conferência Inicial</option>
                      <option value="Ag Liberação Lyx">Aguardando Liberação LYX</option>
                      <option value="Cadastro Errado">Cadastro Errado</option>
                      <option value="Espelho anexo">Espelho Anexo</option>
                      <option value="CCS aprovada">CCS Aprovada</option>
                      <option value="Ag Comp. Endereço">Aguardando Comprovante de Endereço</option>
                      <option value="Sem cadastro">Sem Cadastro</option>
                      <option value="RG Vencido">RG Vencido</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="modal-espelhoEnviado">Espelho Enviado:</label>
                    <input type="date" id="modal-espelhoEnviado" />
                  </div>
                  <div class="form-group">
                    <label for="modal-ccsAprovada">CCS Aprovada:</label>
                    <input type="date" id="modal-ccsAprovada" />
                  </div>
                  <div class="form-group">
                    <label for="modal-pesquisas">Pesquisas:</label>
                    <select id="modal-pesquisas">
                      <option value="">-- Selecione --</option>
                      <option value="OK">OK</option>
                      <option value="Serasa">Serasa</option>
                      <option value="CND">CND</option>
                      <option value="CND e Serasa">CND e Serasa</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="modal-faltaFinalizar">Falta para Finalizar:</label>
                    <input type="text" id="modal-faltaFinalizar" />
                  </div>
                  <div class="form-group">
                    <label for="modal-montagemComplementar">Montagem Complementar:</label>
                    <select id="modal-montagemComplementar">
                      <option value="">-- Selecione --</option>
                      <option value="Não">Não</option>
                      <option value="Iniciado">Iniciado</option>
                      <option value="Finalizado">Finalizado</option>
                      <option value="Aguard. Doc">Aguard. Doc</option>
                      <option value="Validar renda">Validar renda</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="modal-montagemCehop">Montagem CEHOP:</label>
                    <select id="modal-montagemCehop">
                      <option value="">-- Selecione --</option>
                      <option value="Não">Não</option>
                      <option value="Iniciado">Iniciado</option>
                      <option value="Finalizado">Finalizado</option>
                      <option value="Aguard. Doc">Aguard. Doc</option>
                      <option value="Validar renda">Validar renda</option>
                    </select>
                  </div>
                  <div class="form-group cehop-nato-field">
                    <label for="modal-conferenciaCehopNatoEntregueEm">Conferencia CEHOP entregue em:</label>
                    <div class="input-group">
                      <input type="datetime-local" id="modal-conferenciaCehopNatoEntregueEm" class="form-control" />
                      <button type="button" class="btn btn-outline-primary btn-add-cehop-date"
                              data-field="conferenciaCehopNatoEntregueEm" title="Adicionar data ao historico">
                        <i class="bi bi-plus-lg"></i>
                      </button>
                      <div class="dropdown">
                        <button type="button" class="btn btn-outline-secondary btn-cehop-history-toggle"
                                data-field="conferenciaCehopNatoEntregueEm"
                                data-bs-toggle="dropdown" aria-expanded="false"
                                title="Ver historico de datas">
                          <i class="bi bi-clock-history"></i>
                          <span class="badge bg-primary cehop-history-count d-none">0</span>
                        </button>
                        <div id="conferenciaCehopNatoEntregueEm-historico" class="dropdown-menu dropdown-menu-end cehop-dates-dropdown p-2">
                          <div class="cehop-dates-list"></div>
                          <div class="cehop-dates-empty text-muted small text-center py-2">Nenhuma data no historico</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="form-group cehop-nato-field">
                    <label for="modal-conferenciaCehopNatoDevolvidaEm">Conferencia CEHOP devolvida em:</label>
                    <div class="input-group">
                      <input type="datetime-local" id="modal-conferenciaCehopNatoDevolvidaEm" class="form-control" />
                      <button type="button" class="btn btn-outline-primary btn-add-cehop-date"
                              data-field="conferenciaCehopNatoDevolvidaEm" title="Adicionar data ao historico">
                        <i class="bi bi-plus-lg"></i>
                      </button>
                      <div class="dropdown">
                        <button type="button" class="btn btn-outline-secondary btn-cehop-history-toggle"
                                data-field="conferenciaCehopNatoDevolvidaEm"
                                data-bs-toggle="dropdown" aria-expanded="false"
                                title="Ver historico de datas">
                          <i class="bi bi-clock-history"></i>
                          <span class="badge bg-primary cehop-history-count d-none">0</span>
                        </button>
                        <div id="conferenciaCehopNatoDevolvidaEm-historico" class="dropdown-menu dropdown-menu-end cehop-dates-dropdown p-2">
                          <div class="cehop-dates-list"></div>
                          <div class="cehop-dates-empty text-muted small text-center py-2">Nenhuma data no historico</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="form-group">
                    <label for="modal-formulariosEnviadosEm">Formulários Enviados Em:</label>
                    <input type="datetime-local" id="modal-formulariosEnviadosEm" />
                  </div>
                  <div class="form-group">
                    <label for="modal-formulariosAssinadosEm">Formulários Assinados Em:</label>
                    <input type="datetime-local" id="modal-formulariosAssinadosEm" />
                  </div>
                  <div class="form-group">
                    <label for="modal-entregueCehop">Entregue CEHOP:</label>
                    <input type="datetime-local" id="modal-entregueCehop" />
                  </div>
                                    <div class="form-group">
                    <label for="details-formularios-nContratoCEF">Nº Contrato CEF:</label>
                    <input type="text" id="details-formularios-nContratoCEF" />
                  </div>
                  <div class="form-group">
                    <label for="modal-enviadoACehop">Enviado a CEHOP:</label>
                    <input type="datetime-local" id="modal-enviadoACehop" />
                  </div>
                  <div class="form-group cehop-nato-field">
                    <label for="modal-reenviadoCehop">Reenviado CEHOP:</label>
                    <div class="input-group">
                      <input type="datetime-local" id="modal-reenviadoCehop" class="form-control" />
                      <button type="button" class="btn btn-outline-primary btn-add-cehop-date"
                              data-field="reenviadoCehop" title="Adicionar data ao historico">
                        <i class="bi bi-plus-lg"></i>
                      </button>
                      <div class="dropdown">
                        <button type="button" class="btn btn-outline-secondary btn-cehop-history-toggle"
                                data-field="reenviadoCehop"
                                data-bs-toggle="dropdown" aria-expanded="false"
                                title="Ver historico de datas">
                          <i class="bi bi-clock-history"></i>
                          <span class="badge bg-primary cehop-history-count d-none">0</span>
                        </button>
                        <div id="reenviadoCehop-historico" class="dropdown-menu dropdown-menu-end cehop-dates-dropdown p-2">
                          <div class="cehop-dates-list"></div>
                          <div class="cehop-dates-empty text-muted small text-center py-2">Nenhuma data no historico</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="form-group">
                    <label for="modal-conformeEm">Conforme Em:</label>
                    <input type="datetime-local" id="modal-conformeEm" />
                  </div>
                   <div class="form-group">
                    <label for="details-formularios-tipoConsulta">Tipo de Consulta:</label>
                    <select id="details-formularios-tipoConsulta">
                      <option value="">-- Selecione --</option>
                      <option value="PR">PR</option>
                      <option value="CP">CP</option>
                      <option value="GR">GR</option>
                      <option value="RV">RV</option>
                      <option value="MI">MI</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="details-formularios-chaveConsulta">Chave de Consulta:</label>
                    <input type="text" id="details-formularios-chaveConsulta" readonly />
                  </div>
                    <div class="form-group">
                    <label for="modal-preEntrevista">Pré Entrevista:</label>
                    <select id="modal-preEntrevista">
                      <option value="">-- Selecione --</option>
                      <option value="Realizada">Realizada</option>
                      <option value="Pendente ligação">Pendente ligação</option>
                      <option value="Não passou">Não passou</option>
                    </select>
                  </div> 
                  <div class="form-group">
                    <label for="modal-certidaoAtualizada">Certidão Atualizada:</label>
                    <select id="modal-certidaoAtualizada">
                      <option value="">-- Selecione --</option>
                      <option value="Solicitado">Solicitado</option>
                      <option value="Entregue">Entregue</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="modal-declaracaoEstadoCivil">Declaração de Estado Civil:</label>
                    <select id="modal-declaracaoEstadoCivil">
                      <option value="">-- Selecione --</option>
                      <option value="Solicitado">Solicitado</option>
                      <option value="Entregue">Entregue</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="modal-entrevistaCef">Entrevista CEF:</label>
                    <input type="datetime-local" id="modal-entrevistaCef" />
                  </div>
                  <div class="form-group">
                    <label for="modal-minutaRecebida">Minuta Recebida:</label>
                    <input type="date" id="modal-minutaRecebida" />
                  </div>

                  <div class="form-group">
                    <label for="modal-contratoCef">Contrato CEF Agendado:</label>
                    <input type="datetime-local" id="modal-contratoCef" />
                  </div>
                  <div class="form-group">
                    <label for="details-formularios-dataAssinaturaCliente">Data Assinatura CEF Cliente:</label>
                    <input type="date" id="details-formularios-dataAssinaturaCliente" />
                  </div>

                  <div class="form-group inline-suggest-wrapper">
                    <label for="modal-agencia">Agência:</label>
                    <input
                      type="text"
                      id="modal-agencia"
                      class="form-control"
                      autocomplete="off"
                      placeholder="Digite para buscar..."
                    />
                    <div class="suggestions-panel" id="suggestions-modal-agencia" hidden>
                      <ul class="suggestions-list" id="suggestions-modal-agencia-list"></ul>
                    </div>
                  </div>
                  <div class="form-group">
                    <label for="modal-gerente">Gerente:</label>
                    <input type="text" id="modal-gerente" />
                  </div>
                  <div class="form-group">
                    <label for="modal-imobiliaria">Imobiliária:</label>
                    <input type="text" id="modal-imobiliaria" />
                  </div>
                  <div class="form-group">
                    <label for="modal-corretor">Corretor:</label>
                    <input type="text" id="modal-corretor" />
                  </div>
                  <div class="form-group">
                    <label for="modal-produto">Produto:</label>
                    <select id="modal-produto">
                      <option value="">-- Selecione --</option>
                      <option value="CCA">CCA</option>
                      <option value="Agencia">Agencia</option>
                    </select>
                  </div>               
                </div>
              </fieldset>
            </div>

            <!-- Registro -->
            <div id="tab-registro" class="tab-content">
              <fieldset>
                <legend>Registro</legend>
                <div class="form-grid-advanced">
                  <div class="form-group">
                    <label for="modal-nContratoCEF">Nº Contrato CEF:</label>
                    <input type="text" id="modal-nContratoCEF" />
                  </div>
                  <div class="form-group">
                    <label for="modal-codigoCCA">Código CCA:</label>
                    <input type="text" id="modal-codigoCCA" />
                  </div>
                  <div class="form-group">
                    <label for="modal-tipoConsulta">Tipo de Consulta:</label>
                    <select id="modal-tipoConsulta">
                      <option value="">-- Selecione --</option>
                      <option value="PR">PR</option>
                      <option value="CP">CP</option>
                      <option value="GR">GR</option>
                      <option value="RV">RV</option>
                      <option value="MI">MI</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="modal-chaveConsulta">Chave de Consulta:</label>
                    <input type="text" id="modal-chaveConsulta" readonly />
                  </div>
                  <div class="form-group">
                    <label for="modal-dataMinuta">Data da Minuta:</label
                    ><input type="date" id="modal-dataMinuta" />
                  </div>
                  <div class="form-group">
                    <label for="modal-dataAssinaturaCliente"
                      >Data Assinatura Cliente:</label
                    ><input type="date" id="modal-dataAssinaturaCliente" />
                  </div>
                  <div class="form-group">
                    <label for="modal-enviadoVendedor">Enviado Vendedor:</label
                    ><input type="date" id="modal-enviadoVendedor" />
                  </div>
                  <div class="form-group">
                    <label for="modal-retornoVendedor">Retorno Vendedor:</label
                    ><input type="date" id="modal-retornoVendedor" />
                  </div>
                  <div class="form-group">
                    <label for="modal-enviadoAgencia">Enviado Agência:</label
                    ><input type="date" id="modal-enviadoAgencia" />
                  </div>
                  <div class="form-group">
                    <label for="modal-retornoAgencia">Retorno Agência:</label
                    ><input type="date" id="modal-retornoAgencia" />
                  </div>
                  <div class="form-group">
                    <label for="modal-iptu">IPTU:</label
                    ><input type="text" id="modal-iptu" />
                  </div>
                  <div class="form-group inline-suggest-wrapper">
                    <label for="modal-cartorio">Cartório:</label>
                    <input 
                      type="text" 
                      id="modal-cartorio" 
                      class="form-control"
                      autocomplete="off"
                      placeholder="Digite para buscar..."
                    />
                    <div class="suggestions-panel" id="suggestions-modal-cartorio" hidden>
                      <ul class="suggestions-list" id="suggestions-modal-cartorio-list"></ul>
                    </div>
                  </div>
                  <div class="form-group">
                    <label for="modal-solicitaITBI">Solicita ITBI:</label
                    ><input type="date" id="modal-solicitaITBI" />
                  </div>
                  <div class="form-group">
                    <label for="modal-retiradaITBI">Retirada ITBI:</label
                    ><input type="date" id="modal-retiradaITBI" />
                  </div>
                  <div class="form-group">
                    <label for="modal-valorITBI">Valor ITBI:</label
                    ><input type="number" id="modal-valorITBI" step="0.01" />
                  </div>
                  <div class="form-group">
                    <label for="modal-enviadoPgtoItbi">Enviado Pgto ITBI:</label
                    ><input type="date" id="modal-enviadoPgtoItbi" />
                  </div>
                  <div class="form-group">
                    <label for="modal-retornoPgtoItbi">Retorno Pgto ITBI:</label
                    ><input type="date" id="modal-retornoPgtoItbi" />
                  </div>
                  <div class="form-group">
                    <label for="modal-formaPagamentoRi">Forma Pgto RI:</label
                    ><input type="text" id="modal-formaPagamentoRi" />
                  </div>
                  <div class="form-group">
                    <label for="modal-valorDepositoRi">Valor Depósito RI:</label
                    ><input
                      type="number"
                      id="modal-valorDepositoRi"
                      step="0.01"
                    />
                  </div>
                  <div class="form-group">
                    <label for="modal-dataEntradaRegistro"
                      >Data Entrada Cartório:</label
                    ><input type="date" id="modal-dataEntradaRegistro" />
                  </div>
                  <div class="form-group">
                    <label for="modal-protocoloRi">Protocolo RI:</label
                    ><input type="text" id="modal-protocoloRi" />
                  </div>
                  <div class="form-group">
                    <label for="modal-dataAnaliseRegistro"
                      >Data Análise Registro:</label
                    ><input type="date" id="modal-dataAnaliseRegistro" />
                  </div>
                  <div class="form-group">
                    <label for="modal-dataPrevistaRegistro"
                      >Data Prevista Registro:</label
                    ><input type="date" id="modal-dataPrevistaRegistro" />
                  </div>
                  <div class="form-group">
                    <label for="modal-dataRetornoRi">Data Retorno RI:</label
                    ><input type="date" id="modal-dataRetornoRi" />
                  </div>
                  <div class="form-group">
                    <label for="modal-valorFunrejus">Valor Funrejus:</label
                    ><input
                      type="number"
                      id="modal-valorFunrejus"
                      step="0.01"
                    />
                  </div>
                  <div class="form-group">
                    <label for="modal-dataSolicitacaoFunrejus"
                      >Data Solicitação Funrejus:</label
                    ><input type="date" id="modal-dataSolicitacaoFunrejus" />
                  </div>
                  <div class="form-group">
                    <label for="modal-dataEmissaoFunrejus"
                      >Data Emissão Funrejus:</label
                    ><input type="date" id="modal-dataEmissaoFunrejus" />
                  </div>
                  <div class="form-group">
                    <label for="modal-funrejusEnviadoPgto"
                      >Funrejus Enviado Pgto:</label
                    ><input type="date" id="modal-funrejusEnviadoPgto" />
                  </div>
                  <div class="form-group">
                    <label for="modal-funrejusRetornoPgto"
                      >Funrejus Retorno Pgto:</label
                    ><input type="date" id="modal-funrejusRetornoPgto" />
                  </div>
                  <div class="form-group">
                    <label for="modal-valorFinalRi">Valor Final RI:</label
                    ><input type="number" id="modal-valorFinalRi" step="0.01" />
                  </div>
                  <div class="form-group">
                    <label for="modal-dataRetiradaContratoRegistrado"
                      >Data Contrato Registrado:</label
                    ><input
                      type="date"
                      id="modal-dataRetiradaContratoRegistrado"
                    />
                  </div>
                  <div class="form-group">
                    <label for="modal-dataEnvioLiberacaoGarantia"
                      >Data Envio Lib. Garantia:</label
                    ><input type="date" id="modal-dataEnvioLiberacaoGarantia" />
                  </div>
                  <div class="form-group">
                    <label for="modal-dataConformidadeCehop"
                      >Data Conformidade Garantia:</label
                    ><input type="date" id="modal-dataConformidadeCehop" />
                  </div>
                </div>
              </fieldset>
            </div>

            <div id="tab-anotacoes-historico" class="tab-content">

            <!-- Anotações e Observações -->
            <div class="card border-0 shadow-sm mb-4">
              <div class="card-header bg-light">
                <h5 class="mb-0 d-flex align-items-center">
                  <i class="bi bi-journal-text text-primary me-2"></i>
                  Anotações e Observações
                </h5>
              </div>
              <div class="card-body">
                <div class="form-group full-width">
                  <div id="anotacoes-historico" class="history-log-display"></div>

                  <div id="nova-anotacao-container" class="new-entry-container">
                    <textarea
                      id="nova-anotacao-texto"
                      class="form-control"
                      placeholder="Digite a sua anotação aqui..."
                      rows="3"
                    ></textarea>
                    <div id="nova-anotacao-ai-preview" class="ai-preview-container d-none mt-2">
                      <div class="alert alert-info mb-0">
                        <strong><i class="bi bi-stars me-1"></i>Sugestão da IA:</strong>
                        <p id="nova-anotacao-ai-text" class="ai-preview-text mb-2 mt-2"></p>
                        <div class="d-flex gap-2">
                          <button type="button" id="nova-anotacao-accept-ai-btn" class="btn btn-sm btn-success">
                            <i class="bi bi-check-lg me-1"></i>Aceitar
                          </button>
                          <button type="button" id="nova-anotacao-reject-ai-btn" class="btn btn-sm btn-outline-secondary">
                            <i class="bi bi-x-lg me-1"></i>Rejeitar
                          </button>
                        </div>
                      </div>
                    </div>
                    <div class="new-entry-actions mt-2">
                      <button type="button" id="improve-nova-anotacao-btn" class="btn btn-outline-primary">
                        <i class="bi bi-stars me-1"></i>Melhorar com IA
                      </button>
                      <button type="button" id="add-anotacao-btn" class="btn btn-primary">
                        <i class="bi bi-plus-circle me-2"></i>
                        Adicionar Anotação
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Histórico de Alterações -->
            <div class="card border-0 shadow-sm mb-4">
              <div class="card-header bg-light">
                <h5 class="mb-0 d-flex align-items-center">
                  <i class="bi bi-clock-history text-primary me-2"></i>
                  Histórico de Alterações
                </h5>
              </div>
              <div class="card-body">
                <div id="modal-history-list"></div>
              </div>
            </div>

            </div>

            <!-- Pendências -->
            <div id="tab-pendencias" class="tab-content">
              <div class="card border-0 shadow-sm">
                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                  <h5 class="mb-0 d-flex align-items-center">
                    <i class="bi bi-exclamation-circle text-warning me-2"></i>
                    Pendências do Processo
                    <span id="pendencias-count-badge" class="badge bg-warning text-dark ms-2" class="d-none">0</span>
                  </h5>
                  <button type="button" class="btn btn-sm btn-success" id="nova-pendencia-btn">
                    <i class="bi bi-plus-circle me-1"></i>Nova Pendência
                  </button>
                </div>
                <div class="card-body">
                  <!-- Loader -->
                  <div class="text-center py-4" id="pendencias-loader" class="d-none">
                    <div class="spinner-border text-warning" role="status">
                      <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-2 mb-0 text-muted small">Carregando pendências...</p>
                  </div>

                  <!-- Empty State -->
                  <div class="text-center py-5" id="pendencias-empty">
                    <i class="bi bi-check-circle text-success" class="icon-xl"></i>
                    <h5 class="mt-3 text-muted">Nenhuma pendência ativa</h5>
                    <p class="text-muted small mb-3">Este processo não possui pendências abertas.</p>
                    <button type="button" class="btn btn-outline-success btn-sm" id="nova-pendencia-empty-btn">
                      <i class="bi bi-plus-circle me-1"></i>Criar primeira pendência
                    </button>
                  </div>

                  <!-- Lista de Pendências -->
                  <div id="pendencias-lista" class="d-flex flex-column gap-3" style="display: none !important;"></div>

                  <!-- Toggle para mostrar resolvidas -->
                  <div class="form-check mt-3 pt-3 border-top" id="pendencias-toggle-resolvidas-container" class="d-none">
                    <input class="form-check-input" type="checkbox" id="pendencias-mostrar-resolvidas">
                    <label class="form-check-label small text-muted" for="pendencias-mostrar-resolvidas">
                      <i class="bi bi-archive me-1"></i>Mostrar pendências resolvidas
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <!-- Anexos -->
            <div id="tab-anexos" class="tab-content">
              <fieldset>
                <legend>Gerenciar Anexos</legend>
                <div class="form-group">
                  <label for="modal-anexo-input">Selecionar arquivos:</label>
                  <input type="file" id="modal-anexo-input" multiple class="d-none" />
                  <div id="anexo-dropzone" class="border rounded p-4 text-center dropzone-style">
                    <i class="bi bi-cloud-upload" class="icon-lg text-muted"></i>
                    <p class="mt-2 mb-1 fw-semibold">Arraste arquivos aqui</p>
                    <p class="text-muted small mb-0">ou clique para selecionar (múltiplos arquivos)</p>
                  </div>
                </div>

                <!-- Lista de arquivos pendentes para upload -->
                <div id="pending-files-container" class="d-none mt-3">
                  <label class="fw-semibold mb-2">Arquivos para enviar:</label>
                  <div id="pending-files-list" class="border rounded p-2 scroll-y-300">
                    <!-- Arquivos pendentes serão inseridos aqui -->
                  </div>
                  <button
                    type="button"
                    id="upload-anexo-btn"
                    class="btn btn-primary mt-3"
                  >
                    <i class="bi bi-upload me-1"></i>Enviar Todos os Arquivos
                  </button>
                </div>

                <div
                  id="upload-progress-container"
                  class="d-none mt-2"
                >
                  <progress id="upload-progress" value="0" max="100"></progress>
                  <span id="upload-progress-text"></span>
                </div>
                <div class="form-group full-width mt-4">
                  <label>Arquivos Anexados:</label>
                  <ul id="anexos-list" class="anexos-list-container"></ul>
                </div>
              </fieldset>
            </div>
            <!-- Requerimentos e Declarações -->
            <div id="tab-requerimentos" class="tab-content">
              <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                  <h5 class="mb-0 d-flex align-items-center">
                    <i class="bi bi-file-earmark-plus text-primary me-2"></i>
                    Requerimentos e Declarações
                  </h5>
                  <span class="badge bg-secondary" id="requirements-participants-badge">0 participantes</span>
                </div>
                <div class="card-body">
                  <div class="row g-4">
                    <div class="col-lg-4">
                      <div class="vstack gap-3">
                        <div class="form-group">
                          <label for="requirements-template">Modelo:</label>
                          <select id="requirements-template" class="form-select">
                            <option value="uniao_negativa">Declaração Negativa de União Estável</option>
                            <option value="uniao_positiva">Declaração Positiva de União Estável</option>
                            <option value="itbi">Requerimento de ITBI (Almirante Tamandaré/PR)</option>
                            <option value="funrejus_pr">Isenção FUNREJUS (PR)</option>
                            <option value="pacto">Requerimento Registro do Pacto</option>
                          </select>
                        </div>
                        <div id="requirements-template-options" class="card card-body bg-light border-0 p-3">
                          <!-- Opções dinâmicas do modelo -->
                        </div>
                        <div class="d-grid">
                          <button type="button" id="requirements-generate-btn" class="btn btn-primary">
                            <i class="bi bi-magic me-2"></i>Gerar para todos os participantes
                          </button>
                        </div>
                        <div id="requirements-missing-alert" class="alert alert-warning d-none" role="alert"></div>
                        <div class="small text-muted">
                          Gere um documento por participante do processo. Campos ausentes impedem a geração e serão listados acima.
                        </div>
                      </div>
                    </div>
                    <div class="col-lg-8">
                      <div class="d-flex align-items-center justify-content-between mb-2">
                        <span class="text-uppercase small text-muted fw-semibold d-flex align-items-center"><i class="bi bi-people me-2"></i>Saídas geradas</span>
                        <button type="button" class="btn btn-outline-secondary btn-sm" id="requirements-clear-btn">
                          <i class="bi bi-trash me-1"></i>Limpar resultados
                        </button>
                      </div>
                      <div id="requirements-output" class="d-flex flex-column gap-3"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- Fechamento -->
            <div id="tab-fechamento" class="tab-content">
              <fieldset>
                <legend><i class="bi bi-calculator me-2"></i>Controle Financeiro do Fechamento</legend>
                <div class="form-grid-advanced">
                  <!-- Coluna de Débitos (Custos) -->
                  <div class="financial-column">
                    <h4>Débitos (Custos)</h4>

                    <label class="section-label">Valores de Referência</label>
                    <div class="form-group readonly-group">
                      <label>ITBI:</label>
                      <span id="display-valorITBI">R$ 0,00</span>
                    </div>
                    <div class="form-group readonly-group">
                      <label>Cartório (RI):</label>
                      <span id="display-valorFinalRi">R$ 0,00</span>
                    </div>
                    <div class="form-group readonly-group">
                      <label>Funrejus:</label>
                      <span id="display-valorFunrejus">R$ 0,00</span>
                    </div>

                    <div class="form-group" class="mt-3">
                      <label for="modal-valorDespachante">Valor Despachante:</label>
                      <input
                        type="number"
                        id="modal-valorDespachante"
                        class="form-control"
                        step="0.01"
                        placeholder="0,00"
                      />
                    </div>

                    <hr />
                    <label>Outros Gastos</label>
                    <div id="gastos-adicionais-container"></div>
                    <button type="button" id="add-gasto-btn" class="btn btn-outline-secondary btn-sm">
                      <i class="bi bi-plus-lg me-1"></i>Adicionar Gasto
                    </button>

                    <hr />
                    <div class="financial-total">
                      <strong>Total de Débitos:</strong>
                      <span id="total-debitos">R$ 0,00</span>
                    </div>
                  </div>

                  <!-- Coluna de Créditos (Repasses) -->
                  <div class="financial-column">
                    <h4>Repasses (Créditos)</h4>

                    <label>Valores Recebidos para Pagamentos</label>
                    <div id="repasses-container"></div>
                    <button type="button" id="add-repasse-btn" class="btn btn-outline-secondary btn-sm">
                      <i class="bi bi-plus-lg me-1"></i>Adicionar Repasse
                    </button>

                    <hr />
                    <div class="financial-total">
                      <strong>Total Repassado:</strong>
                      <span id="total-repasses">R$ 0,00</span>
                    </div>
                  </div>
                </div>

                <!-- Saldo Final -->
                <div class="financial-balance">
                  <h3>
                    <i class="bi bi-wallet2"></i>
                    Saldo:
                    <span id="saldo-final" class="saldo-zerado">R$ 0,00</span>
                  </h3>
                  <button type="button" id="btn-export-finance" class="btn btn-outline-primary mt-2">
                    <i class="bi bi-printer me-2"></i>Imprimir Extrato
                  </button>
                  <button type="button" id="btn-export-receipt" class="btn btn-outline-success mt-2 ms-2">
                    <i class="bi bi-receipt me-2"></i>Gerar Recibo
                  </button>
                </div>
              </fieldset>

              <fieldset>
                <legend><i class="bi bi-file-earmark-text me-2"></i>Documentação e NF</legend>
                <div class="form-grid-advanced" class="grid-cols-2">
                  <div class="form-group">
                    <label for="modal-dataEmissaoNF">Data Emissão NF:</label>
                    <input type="date" id="modal-dataEmissaoNF" class="form-control" />
                  </div>
                  <div class="form-group full-width">
                    <label for="modal-documentacaoRepasse">Documentação e Repasse (Observações):</label>
                    <textarea id="modal-documentacaoRepasse" class="form-control" rows="3" placeholder="Observações sobre documentação, repasses pendentes, etc."></textarea>
                  </div>
                </div>
              </fieldset>
            </div>
            <!-- IA -->
            <div id="tab-ia" class="tab-content">
              <div class="card border-0 shadow-sm">
                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                  <h5 class="mb-0 d-flex align-items-center">
                    <i class="bi bi-magic text-primary me-2"></i>
                    IA Assistida
                  </h5>
                  <div class="d-flex align-items-center gap-2">
                    <button type="button" class="btn btn-sm btn-outline-primary" id="ai-tab-validate-btn">
                      <i class="bi bi-shield-check me-1"></i>Validar dados
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="ai-tab-clear-btn">
                      <i class="bi bi-eraser me-1"></i>Limpar sugestões
                    </button>
                  </div>
                </div>
                <div class="card-body">
                  <div class="row g-3">
                    <div class="col-12 col-lg-5">
                      <div class="border rounded p-3 h-100 d-flex flex-column gap-3">
                        <div>
                          <label class="form-label fw-semibold">Documentos para leitura</label>
                          <input type="file" id="ai-tab-file-input" class="d-none" multiple accept=".pdf,.jpg,.jpeg,.png,.txt" />
                          <div id="ai-tab-dropzone" class="border border-dashed rounded p-4 text-center text-muted ai-dropzone">
                            <i class="bi bi-cloud-upload display-6 d-block mb-2"></i>
                            <div class="fw-semibold">Arraste PDFs ou imagens</div>
                            <div class="small">ou clique para selecionar (máx. 10MB cada)</div>
                          </div>
                        </div>
                        <div class="d-flex gap-2 flex-wrap">
                          <button type="button" class="btn btn-primary" id="ai-tab-process-btn">
                            <i class="bi bi-magic me-1"></i>Extrair e sugerir
                          </button>
                          <button type="button" class="btn btn-outline-success" id="ai-tab-apply-selected-btn">
                            <i class="bi bi-check2-circle me-1"></i>Aplicar selecionados
                          </button>
                        </div>
                        <div class="small text-muted" id="ai-tab-status">Pronto para usar IA.</div>
                        <div class="progress d-none" id="ai-tab-progress-wrapper" style="height: 6px;">
                          <div class="progress-bar" id="ai-tab-progress" role="progressbar" style="width: 0%;"></div>
                        </div>
                      </div>
                    </div>
                    <div class="col-12 col-lg-7">
                      <div class="h-100 d-flex flex-column gap-3">
                        <div class="border rounded p-3">
                          <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="fw-semibold">Sugestões da IA</span>
                            <span class="badge bg-light text-dark" id="ai-tab-suggestions-count">0</span>
                          </div>
                          <div class="small text-muted mb-2">Selecione quais campos aplicar. Valores existentes não serão sobrescritos sem marcação.</div>
                          <div id="ai-tab-suggestions" class="ai-suggestions-list small"></div>
                        </div>
                        <div class="border rounded p-3">
                          <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="fw-semibold">Validação e conferência</span>
                            <span class="badge bg-light text-dark" id="ai-tab-issues-count">0</span>
                          </div>
                          <div class="small text-muted mb-2">Comparação entre dados do sistema e o que a IA encontrou nos documentos.</div>
                          <div id="ai-tab-validation" class="ai-validation-list small"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- WhatsApp -->
            <div id="tab-whatsapp" class="tab-content">
              <div class="card border-0 shadow-sm">
                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                  <h5 class="mb-0 d-flex align-items-center">
                    <i class="bi bi-whatsapp text-success me-2"></i>
                    Conversa WhatsApp
                  </h5>
                  <div class="btn-group btn-group-sm" role="group">
                    <button type="button" class="btn btn-outline-success" id="whatsapp-tab-open-panel" disabled>
                      <i class="bi bi-box-arrow-up-right me-1"></i>Abrir painel
                    </button>
                  </div>
                </div>
                <div class="card-body">
                  <div class="alert alert-info d-none align-items-center gap-2" id="whatsapp-tab-suggestion" role="alert"></div>
                  <p class="small text-muted mb-3" id="whatsapp-tab-status">
                    <i class="bi bi-info-circle me-1"></i>Selecione esta aba para carregar a conversa vinculada.
                  </p>
                  <div class="d-flex flex-wrap align-items-center justify-content-between mb-3 d-none" id="whatsapp-tab-summary"></div>
                  <div class="text-center py-4 d-none" id="whatsapp-tab-loader">
                    <div class="spinner-border text-success" role="status">
                      <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-2 mb-0 text-muted small">Carregando conversa...</p>
                  </div>
                  <div class="alert alert-warning d-none" id="whatsapp-tab-empty" role="alert">
                    <i class="bi bi-exclamation-circle me-1"></i>Nenhuma conversa vinculada a este processo.
                    <br />Use o botão <strong>Vincular processo</strong> no painel do WhatsApp para associar esta conversa.
                  </div>
                  <div class="mb-3 d-none" id="whatsapp-tab-conversations-wrapper">
                    <div class="d-flex align-items-center justify-content-between mb-2">
                      <span class="text-uppercase small text-muted fw-semibold d-flex align-items-center"><i class="bi bi-collection me-1"></i>Conversas vinculadas</span>
                      <span class="badge bg-secondary" id="whatsapp-tab-conversations-count">0</span>
                    </div>
                    <div class="list-group border rounded overflow-auto scroll-y-220" id="whatsapp-tab-conversations"></div>
                  </div>
                  <div class="bg-light border rounded p-3 d-none scroll-y-360" id="whatsapp-tab-messages">
                    <div class="list-group list-group-flush" id="whatsapp-tab-messages-list"></div>
                  </div>
                </div>
              </div>
                  </div>
                </div>

            <!-- Aba: Erros (QA) -->
            <div id="tab-gestao-erros" class="tab-content">
              <div class="card border-0 shadow-sm">
                <div class="card-header bg-light d-flex align-items-center">
                  <i class="bi bi-bug text-danger me-2"></i>
                  <h5 class="mb-0">Gestao de Erros (QA)</h5>
                </div>
                <div class="card-body" id="details-erros-container">
                  <div class="text-center py-4">
                    <div class="spinner-border text-danger" role="status">
                      <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-2 mb-0 text-muted small">Carregando erros...</p>
                  </div>
                </div>
              </div>
            </div>

              </div>
            </div>


            </form>
          </div>
          
          <div class="modal-footer flex-wrap gap-2 justify-content-between border-top py-3 bg-white flex-shrink-0" style="position: sticky; bottom: 0; z-index: 10;">
            <button type="button" id="schedule-event-btn" class="btn btn-outline-secondary btn-outline">
              <i class="bi bi-calendar-plus me-2"></i>
              Agendar Compromisso
            </button>
            <button type="submit" class="btn btn-primary save-btn" form="details-form">
              <i class="bi bi-save me-2"></i>
              Salvar Alterações
            </button>
          </div>
      </div>
    </div>



    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const el = document.getElementById(this.id);
    normalizeDetailsModalCopy(el);
    if (el && bootstrap?.Modal?.getOrCreateInstance) {
      return bootstrap.Modal.getOrCreateInstance(el);
    }

    return el;
  },
};
