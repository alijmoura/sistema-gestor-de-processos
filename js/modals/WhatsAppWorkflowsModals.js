export const WhatsAppWorkflowsModals = {
  id: 'workflowEditorModal',

  render() {
    if (
      document.getElementById('workflowEditorModal') ||
      document.getElementById('workflowTriggerModal') ||
      document.getElementById('workflowStepModal')
    ) {
      return;
    }

    const html = `
  <!-- Modais Workflows WhatsApp (injetados via js/modals/WhatsAppWorkflowsModals.js) -->

  <!-- Modal: Novo/Editar Workflow -->
  <!-- Este modal será gerenciado por whatsappWorkflowUI.js -->
  <div class="modal fade" id="workflowEditorModal" tabindex="-1" data-bs-backdrop="static">
    <div class="modal-dialog modal-xl">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-robot me-2"></i>
            <span id="workflow-modal-title">Novo Workflow</span>
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <form id="workflow-editor-form" class="needs-validation" novalidate>
            <div id="workflow-editor-body">
              <!-- Conteúdo gerado por whatsappWorkflowUI.js -->
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
            <i class="bi bi-x-circle me-2"></i>Cancelar
          </button>
          <button type="submit" class="btn btn-primary" id="save-workflow-btn" form="workflow-editor-form">
            <i class="bi bi-check-circle me-2"></i>Salvar Workflow
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Trigger -->
  <div class="modal fade" id="workflowTriggerModal" tabindex="-1" aria-labelledby="workflowTriggerModalLabel" data-bs-backdrop="static">
    <div class="modal-dialog">
      <div class="modal-content">
        <form id="workflow-trigger-form" class="needs-validation" novalidate>
          <div class="modal-header">
            <h5 class="modal-title" id="workflowTriggerModalLabel">
              <i class="bi bi-bullseye me-2"></i>Configurar Trigger
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="trigger-index" value="">
            <div class="mb-3">
              <label for="trigger-type" class="form-label">Tipo de Trigger *</label>
              <select class="form-select" id="trigger-type" required>
                <option value="" selected>Selecione...</option>
                <option value="first_message">Primeira mensagem</option>
                <option value="keyword">Palavras-chave</option>
                <option value="department">Departamento</option>
              </select>
              <div class="invalid-feedback">Escolha um tipo de trigger.</div>
            </div>
            <div class="mb-3 d-none" data-trigger-field="keywords">
              <label for="trigger-keywords" class="form-label">Palavras-chave *</label>
              <input type="text" class="form-control" id="trigger-keywords" placeholder="Ex.: agendar, visita" autocomplete="off">
              <div class="form-text">Separe por vírgula. O bot procura correspondências exatas.</div>
              <div class="invalid-feedback">Informe ao menos uma palavra-chave.</div>
            </div>
            <div class="mb-3 d-none" data-trigger-field="department">
              <label for="trigger-department" class="form-label">Departamento *</label>
              <select class="form-select" id="trigger-department">
                <option value="">Selecione...</option>
                <option value="Aprovação">Aprovação</option>
                <option value="Formularios">Formulários</option>
                <option value="CEHOP">CEHOP</option>
                <option value="Registro">Registro</option>
                <option value="Individual">Individual</option>
              </select>
              <div class="invalid-feedback">Selecione um departamento válido.</div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">
              <i class="bi bi-x-circle me-2"></i>Cancelar
            </button>
            <button type="submit" class="btn btn-primary">
              <i class="bi bi-check2-circle me-2"></i>Salvar Trigger
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- Modal: Etapa do Workflow -->
  <div class="modal fade" id="workflowStepModal" tabindex="-1" aria-labelledby="workflowStepModalLabel" data-bs-backdrop="static">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <form id="workflow-step-form" class="needs-validation" novalidate>
          <div class="modal-header">
            <h5 class="modal-title" id="workflowStepModalLabel">
              <i class="bi bi-diagram-3 me-2"></i>Configurar Etapa
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="step-index" value="">
            <div class="row g-3">
              <div class="col-md-6">
                <label for="step-action" class="form-label">Tipo de Ação *</label>
                <select class="form-select" id="step-action" required>
                  <option value="" selected>Selecione...</option>
                </select>
                <div class="invalid-feedback">Escolha uma ação para esta etapa.</div>
              </div>
              <div class="col-md-6">
                <label for="step-label" class="form-label">Nome interno</label>
                <input type="text" class="form-control" id="step-label" name="internalLabel" placeholder="Opcional para organização" autocomplete="off">
                <div class="form-text">Visível apenas para admins. Útil para identificar etapas complexas.</div>
              </div>
            </div>
            <hr class="my-4">
            <div id="step-dynamic-fields" class="d-flex flex-column gap-3">
              <div class="alert alert-info d-flex align-items-center" role="alert">
                <i class="bi bi-info-circle me-2"></i>
                <div>Selecione um tipo de ação para exibir os campos necessários.</div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">
              <i class="bi bi-x-circle me-2"></i>Cancelar
            </button>
            <button type="submit" class="btn btn-primary">
              <i class="bi bi-check-circle me-2"></i>Salvar Etapa
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },
};
