export function renderWhatsAppPhoneNumberModal() {
  return `
            <div class="modal fade" id="phone-number-modal" tabindex="-1" aria-labelledby="phone-number-modal-title" aria-hidden="true">
              <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title" id="phone-number-modal-title">
                      <i class="bi bi-phone me-2"></i>Adicionar Número WhatsApp
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                  </div>
                  <div class="modal-body">
                    <form id="phone-number-form" class="needs-validation" novalidate>
                      <div class="mb-3">
                        <label for="phone-number-input" class="form-label">
                          <i class="bi bi-telephone me-1"></i>Número WhatsApp *
                        </label>
                        <input 
                          type="tel" 
                          class="form-control" 
                          id="phone-number-input"
                          name="phoneNumber"
                          placeholder="(41) 98290-7950 ou 5541982907950"
                          required
                        >
                        <div class="invalid-feedback">Informe um número de WhatsApp válido.</div>
                        <small class="form-text text-muted">
                          Formato aceito: (XX) XXXXX-XXXX ou 55XXXXXXXXXXX
                        </small>
                      </div>

                      <div class="mb-3">
                        <label for="display-name-input" class="form-label">
                          <i class="bi bi-tag me-1"></i>Nome de Exibição *
                        </label>
                        <input 
                          type="text" 
                          class="form-control" 
                          id="display-name-input"
                          name="displayName"
                          placeholder="Atendimento Comercial"
                          required
                        >
                        <div class="invalid-feedback">Defina um nome de exibição para identificar o número.</div>
                        <small class="form-text text-muted">
                          Nome que aparecerá na interface (ex: Suporte, Vendas, Financeiro)
                        </small>
                      </div>

                      <div class="mb-3">
                        <label for="department-select" class="form-label">
                          <i class="bi bi-building me-1"></i>Departamento
                        </label>
                        <select class="form-select" id="department-select" name="department">
                          <option value="">Todos os Departamentos</option>
                          <option value="Aprovação">Aprovação</option>
                          <option value="Formulários">Formulários</option>
                          <option value="CEHOP">CEHOP</option>
                          <option value="Registro">Registro</option>
                          <option value="Financeiro">Financeiro</option>
                          <option value="Suporte">Suporte</option>
                          <option value="Vendas">Vendas</option>
                        </select>
                        <small class="form-text text-muted">Opcional, para segmentar atendimentos</small>
                      </div>

                      <div class="row g-3">
                        <div class="col-md-4">
                          <label for="business-account-id-input" class="form-label">
                            <i class="bi bi-building me-1"></i>Business Account ID
                          </label>
                          <input
                            type="text"
                            class="form-control"
                            id="business-account-id-input"
                            name="businessAccountId"
                            placeholder="1029384756"
                          >
                          <small class="text-muted">Opcional: ID da conta Business no Meta</small>
                        </div>
                        <div class="col-md-4">
                          <label for="phone-number-id-input" class="form-label">
                            <i class="bi bi-hash me-1"></i>Phone Number ID
                          </label>
                          <input
                            type="text"
                            class="form-control"
                            id="phone-number-id-input"
                            name="phoneNumberId"
                            placeholder="123456789"
                            required
                          >
                          <div class="invalid-feedback">Informe o Phone Number ID.</div>
                          <small class="text-muted">Copie da seção WhatsApp → API → Phone numbers no Meta</small>
                        </div>
                        <div class="col-md-4">
                          <label for="access-token-input" class="form-label">
                            <i class="bi bi-key me-1"></i>Access Token
                          </label>
                          <div class="input-group">
                            <input
                              type="password"
                              class="form-control"
                              id="access-token-input"
                              name="accessToken"
                              placeholder="EAA..."
                              required
                            >
                            <button
                              type="button"
                              class="btn btn-outline-secondary"
                              id="toggle-phone-access-token"
                              title="Mostrar/ocultar token"
                            >
                              <i class="bi bi-eye"></i>
                            </button>
                            <div class="invalid-feedback">Informe o Access Token.</div>
                          </div>
                          <small class="text-muted">Token de longo prazo obtido no Meta</small>
                        </div>
                      </div>

                      <hr class="my-3">

                      <div class="row g-3">
                        <div class="col-md-6">
                          <label for="priority-input" class="form-label">
                            <i class="bi bi-sort-numeric-up me-1"></i>Prioridade
                          </label>
                          <input
                            type="number"
                            class="form-control"
                            id="priority-input"
                            name="priority"
                            min="1"
                            value="99"
                          >
                          <small class="text-muted">Menor valor = maior prioridade na distribuição</small>
                        </div>
                        <div class="col-md-6">
                          <label for="max-concurrent-chats-input" class="form-label">
                            <i class="bi bi-people me-1"></i>Máximo de Conversas Ativas
                          </label>
                          <input
                            type="number"
                            class="form-control"
                            id="max-concurrent-chats-input"
                            name="maxConcurrentChats"
                            min="1"
                            value="50"
                          >
                          <small class="text-muted">Limite de atendimentos simultâneos para este número</small>
                        </div>
                      </div>

                      <div class="row g-2 mt-1">
                        <div class="col-md-6">
                          <div class="form-check form-switch">
                            <input
                              class="form-check-input"
                              type="checkbox"
                              role="switch"
                              id="auto-assign-switch"
                              name="autoAssign"
                              checked
                            >
                            <label class="form-check-label" for="auto-assign-switch">
                              Ativar atribuição automática
                            </label>
                          </div>
                        </div>
                        <div class="col-md-6">
                          <div class="form-check form-switch">
                            <input
                              class="form-check-input"
                              type="checkbox"
                              role="switch"
                              id="is-active-switch"
                              name="isActive"
                              checked
                            >
                            <label class="form-check-label" for="is-active-switch">
                              Número ativo
                            </label>
                          </div>
                        </div>
                      </div>
                    </form>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" form="phone-number-form" class="btn btn-primary" id="save-phone-number-btn">
                      <i class="bi bi-check-circle me-1"></i>Salvar Número
                    </button>
                  </div>
                </div>
              </div>
            </div>
  `;
}
