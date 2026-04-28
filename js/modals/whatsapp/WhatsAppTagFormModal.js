export function renderWhatsAppTagFormModal() {
  return `
            <div class="modal fade" id="modal-tag-form" tabindex="-1" aria-labelledby="modal-tag-form-title" aria-hidden="true">
              <div class="modal-dialog">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title" id="modal-tag-form-title">
                      <i class="bi bi-tag me-2"></i>Nova Tag
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                  </div>
                  <div class="modal-body">
                    <form id="tag-form">
                      <input type="hidden" id="tag-form-id">
                      
                      <div class="mb-3">
                        <label for="tag-form-name" class="form-label">
                          Nome da Tag <span class="text-danger">*</span>
                        </label>
                        <input type="text" class="form-control" id="tag-form-name" 
                               placeholder="Ex: Urgente, VIP, Bug..." required maxlength="30">
                        <small class="text-muted">Máximo 30 caracteres</small>
                      </div>

                      <div class="mb-3">
                        <label for="tag-form-color" class="form-label">
                          Cor <span class="text-danger">*</span>
                        </label>
                        <div class="d-flex gap-2 align-items-center">
                          <input type="color" class="form-control form-control-color" id="tag-form-color" 
                                 value="#FF5733" title="Escolha uma cor">
                          <span class="badge badge-lg" id="tag-color-preview">
                            Preview
                          </span>
                        </div>
                        <div class="d-flex flex-wrap gap-2 mt-2">
                          <button type="button" class="btn btn-sm btn-outline-secondary" 
                                  onclick="document.getElementById('tag-form-color').value='#FF5733'; document.getElementById('tag-form-color').dispatchEvent(new Event('input'))">
                             Vermelho
                          </button>
                          <button type="button" class="btn btn-sm btn-outline-secondary" 
                                  onclick="document.getElementById('tag-form-color').value='#FFC300'; document.getElementById('tag-form-color').dispatchEvent(new Event('input'))">
                             Amarelo
                          </button>
                          <button type="button" class="btn btn-sm btn-outline-secondary" 
                                  onclick="document.getElementById('tag-form-color').value='#28C76F'; document.getElementById('tag-form-color').dispatchEvent(new Event('input'))">
                             Verde
                          </button>
                          <button type="button" class="btn btn-sm btn-outline-secondary" 
                                  onclick="document.getElementById('tag-form-color').value='#00D9FF'; document.getElementById('tag-form-color').dispatchEvent(new Event('input'))">
                             Azul
                          </button>
                          <button type="button" class="btn btn-sm btn-outline-secondary" 
                                  onclick="document.getElementById('tag-form-color').value='#9C27B0'; document.getElementById('tag-form-color').dispatchEvent(new Event('input'))">
                             Roxo
                          </button>
                        </div>
                      </div>

                      <div class="mb-3">
                        <label for="tag-form-description" class="form-label">Descrição</label>
                        <textarea class="form-control" id="tag-form-description" rows="2" 
                                  placeholder="Breve descrição do uso desta tag..." maxlength="200"></textarea>
                        <small class="text-muted">Máximo 200 caracteres</small>
                      </div>
                    </form>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" form="tag-form" class="btn btn-primary">
                      <i class="bi bi-save me-2"></i>Salvar Tag
                    </button>
                  </div>
                </div>
              </div>
            </div>
  `;
}
