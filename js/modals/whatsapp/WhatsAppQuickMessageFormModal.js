export function renderWhatsAppQuickMessageFormModal() {
  return `
            <div class="modal fade" id="modal-quick-message-form" tabindex="-1" aria-labelledby="modal-quick-message-form-title" aria-hidden="true">
              <div class="modal-dialog modal-lg">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title" id="modal-quick-message-form-title">
                      <i class="bi bi-lightning me-2"></i>Nova Mensagem Rápida
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                  </div>
                  <div class="modal-body">
                    <form id="quick-message-form">
                      <input type="hidden" id="quick-message-form-id">
                      
                      <div class="row">
                        <div class="col-md-6 mb-3">
                          <label for="quick-message-form-shortcut" class="form-label">
                            Atalho <span class="text-danger">*</span>
                          </label>
                          <div class="input-group">
                            <span class="input-group-text">/</span>
                            <input type="text" class="form-control" id="quick-message-form-shortcut" 
                                   placeholder="bv" required pattern="[a-z0-9-]+" maxlength="20">
                          </div>
                          <small class="text-muted">Apenas letras minúsculas, números e hífen. Ex: bv, aguarde, formulario-link</small>
                        </div>

                        <div class="col-md-6 mb-3">
                          <label for="quick-message-form-department" class="form-label">
                            Departamento
                          </label>
                          <select class="form-select" id="quick-message-form-department">
                            <option value="">Global (todos)</option>
                            <option value="Aprovação">Aprovação</option>
                            <option value="Formulários">Formulários</option>
                            <option value="CEHOP">CEHOP</option>
                            <option value="Registro">Registro</option>
                            <option value="Geral">Geral</option>
                          </select>
                          <small class="text-muted">Deixe em branco para disponibilizar em todos os departamentos</small>
                        </div>
                      </div>

                      <div class="mb-3">
                        <label for="quick-message-form-text" class="form-label">
                          Texto da Mensagem <span class="text-danger">*</span>
                        </label>
                        <textarea class="form-control" id="quick-message-form-text" rows="4" 
                                  placeholder="Digite a mensagem..." required maxlength="1000"></textarea>
                        <small class="text-muted">Máximo 1000 caracteres. Use variáveis: 
                          <code>{customerName}</code>, <code>{agentName}</code>, <code>{department}</code>, 
                          <code>{date}</code>, <code>{time}</code>
                        </small>
                      </div>

                      <div class="mb-3">
                        <label class="form-label">Preview com Variáveis</label>
                        <div class="border rounded p-3 bg-light text-pre-wrap" id="quick-message-preview" class="min-h-60">
                          Digite uma mensagem para ver o preview...
                        </div>
                      </div>

                      <div class="alert alert-info mb-0">
                        <strong><i class="bi bi-lightbulb me-2"></i>Dica:</strong>
                        As variáveis serão substituídas automaticamente ao usar a mensagem. Por exemplo:
                        <code>{customerName}</code> será substituído pelo nome do cliente.
                      </div>
                    </form>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" form="quick-message-form" class="btn btn-primary">
                      <i class="bi bi-save me-2"></i>Salvar Mensagem
                    </button>
                  </div>
                </div>
              </div>
            </div>
  `;
}
