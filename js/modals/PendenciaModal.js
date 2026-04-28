export const PendenciaModal = {
  id: 'modal-pendencia',

  render() {
    const existing = document.getElementById(this.id);
    if (existing) {
      return bootstrap?.Modal?.getOrCreateInstance
        ? bootstrap.Modal.getOrCreateInstance(existing)
        : null;
    }

    const html = `
      <div class="modal fade" id="modal-pendencia" tabindex="-1" aria-labelledby="modal-pendencia-title" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header bg-warning bg-opacity-10">
              <h5 class="modal-title d-flex align-items-center" id="modal-pendencia-title">
                <i class="bi bi-exclamation-circle text-warning me-2"></i>
                <span id="modal-pendencia-title-text">Nova Pendência</span>
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <form id="form-pendencia" class="needs-validation" novalidate>
              <input type="hidden" id="pendencia-id" value="">
              <input type="hidden" id="pendencia-contrato-id" value="">
              <div class="modal-body">
                <div class="mb-3">
                  <label for="pendencia-titulo" class="form-label">Título <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="pendencia-titulo" placeholder="Ex.: Aguardando documento de identidade" required maxlength="100">
                  <div class="invalid-feedback">Informe um título para a pendência.</div>
                </div>

                <div class="mb-3">
                  <label for="pendencia-descricao" class="form-label">Descrição</label>
                  <textarea class="form-control" id="pendencia-descricao" rows="3" placeholder="Detalhes adicionais sobre a pendência..." maxlength="500"></textarea>
                </div>

                <div class="row g-3">
                  <div class="col-md-6">
                    <label for="pendencia-tipo" class="form-label">Tipo</label>
                    <select class="form-select" id="pendencia-tipo">
                      <option value="documento"> Documento</option>
                      <option value="aprovacao"> Aprovação</option>
                      <option value="pagamento"> Pagamento</option>
                      <option value="assinatura"> Assinatura</option>
                      <option value="correcao"> Correção</option>
                      <option value="outro"> Outro</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label for="pendencia-prioridade" class="form-label">Prioridade</label>
                    <select class="form-select" id="pendencia-prioridade">
                      <option value="baixa"> Baixa</option>
                      <option value="media" selected> Média</option>
                      <option value="alta"> Alta</option>
                      <option value="urgente"> Urgente</option>
                    </select>
                  </div>
                </div>

                <div class="row g-3 mt-1">
                  <div class="col-md-6">
                    <label for="pendencia-setor" class="form-label">Setor Responsável</label>
                    <select class="form-select" id="pendencia-setor">
                      <option value="individual"> Individual</option>
                      <option value="cehop"> CEHOP</option>
                      <option value="formularios"> Formulários</option>
                      <option value="aprovacao"> Aprovação</option>
                      <option value="registro"> Registro</option>
                      <option value="financeiro"> Financeiro</option>
                    </select>
                  </div>
                  
                 <div class="mb-3 mt-3">
                  <label for="pendencia-analista" class="form-label">Analista Responsável</label>
                  <select class="form-select" id="pendencia-analista">
                    <option value="">-- Selecione --</option>
                  </select>
                  </div>

                  <div class="col-md-6">
                    <label for="pendencia-prazo" class="form-label">Prazo</label>
                    <input type="date" class="form-control" id="pendencia-prazo">
                  </div>
                </div>

                <div id="pendencia-comentarios-section" class="mt-4" class="d-none">
                  <hr>
                  <h6 class="d-flex align-items-center mb-3">
                    <i class="bi bi-chat-dots me-2"></i>Comentários
                  </h6>
                  <div id="pendencia-comentarios-lista" class="mb-3" class="scroll-y-xs"></div>
                  <div class="input-group">
                    <input type="text" class="form-control" id="pendencia-novo-comentario" placeholder="Adicionar comentário...">
                    <button type="button" class="btn btn-outline-primary" id="pendencia-add-comentario-btn">
                      <i class="bi bi-send"></i>
                    </button>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">
                  <i class="bi bi-x-circle me-1"></i>Cancelar
                </button>
                <button type="submit" class="btn btn-warning" id="pendencia-salvar-btn">
                  <i class="bi bi-check-circle me-1"></i>Salvar Pendência
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const el = document.getElementById(this.id);
    return bootstrap?.Modal ? new bootstrap.Modal(el) : null;
  },
};
