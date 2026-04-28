export const WhatsAppDashboardModals = {
  id: 'whatsapp-dashboard-modals',

  render() {
    const modalIds = [
      'whatsapp-transfer-modal',
      'whatsapp-agent-modal',
      'whatsapp-resolve-modal',
      'whatsapp-contract-link-modal',
      'whatsapp-new-chat-modal',
    ];

    if (modalIds.some((id) => document.getElementById(id))) {
      return;
    }

    const html = `
  <!-- Modal Transferência WhatsApp -->
  <!-- Modal Transferir Conversa -->
  <div class="modal fade" id="whatsapp-transfer-modal" tabindex="-1" aria-labelledby="whatsappTransferModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="whatsappTransferModalLabel">
            <i class="bi bi-arrow-left-right me-2"></i>Transferir Conversa
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
        </div>
        <div class="modal-body">
          <form id="whatsapp-transfer-form" class="needs-validation" novalidate>
            <div id="whatsapp-transfer-modal-body">
              <!-- Conteúdo será inserido via JS -->
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
            <i class="bi bi-x-circle me-1"></i>Cancelar
          </button>
          <button type="button" class="btn btn-primary" id="whatsapp-confirm-transfer-btn">
            <i class="bi bi-check-circle me-1"></i>Confirmar Transferência
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal Registro de Agente WhatsApp -->
  <div class="modal fade" id="whatsapp-agent-modal" tabindex="-1" aria-labelledby="whatsappAgentModalLabel" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="whatsappAgentModalLabel">
            <i class="bi bi-person-gear me-2"></i>Registrar como Agente WhatsApp
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
        </div>
        <div class="modal-body" id="whatsapp-agent-modal-body">
          <!-- Conteúdo dinâmico -->
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-primary" id="whatsapp-save-agent-btn">
            <i class="bi bi-save me-2"></i>Salvar
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal Finalizar Atendimento WhatsApp -->
  <div class="modal fade" id="whatsapp-resolve-modal" tabindex="-1" aria-labelledby="whatsappResolveModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="whatsappResolveModalLabel">
            <i class="bi bi-check-circle me-2"></i>Finalizar Atendimento
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
        </div>
        <div class="modal-body">
          <form id="whatsapp-resolve-form" class="needs-validation" novalidate>
            <div class="mb-3">
              <label for="whatsapp-resolution-reason" class="form-label">
                Motivo do Encerramento <span class="text-danger">*</span>
              </label>
              <select class="form-select" id="whatsapp-resolution-reason" required>
                <option value="Problema resolvido">Problema resolvido</option>
                <option value="Informação fornecida">Informação fornecida</option>
                <option value="Sem resposta do cliente">Sem resposta do cliente</option>
                <option value="Encaminhado para outro canal">Encaminhado para outro canal</option>
                <option value="Solicitação inválida">Solicitação inválida</option>
                <option value="Cliente satisfeito">Cliente satisfeito</option>
                <option value="Spam/Indevido">Spam/Indevido</option>
                <option value="Conversa duplicada">Conversa duplicada</option>
                <option value="Outros">Outros</option>
              </select>
              <div class="invalid-feedback">
                Selecione um motivo
              </div>
            </div>
            <div class="mb-3">
              <label for="whatsapp-resolution-notes" class="form-label">Observações</label>
              <textarea class="form-control" id="whatsapp-resolution-notes" rows="3" placeholder="Adicione detalhes sobre a finalização (opcional)"></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label d-block">Satisfação do Cliente (Opcional)</label>
              <div class="btn-group w-100" role="group" aria-label="Avaliação de satisfação">
                <input type="radio" class="btn-check" name="whatsapp-satisfaction" id="sat-1" value="1">
                <label class="btn btn-outline-danger" for="sat-1">
                  <i class="bi bi-emoji-frown"></i> 1
                </label>

                <input type="radio" class="btn-check" name="whatsapp-satisfaction" id="sat-2" value="2">
                <label class="btn btn-outline-warning" for="sat-2">
                  <i class="bi bi-emoji-neutral"></i> 2
                </label>

                <input type="radio" class="btn-check" name="whatsapp-satisfaction" id="sat-3" value="3">
                <label class="btn btn-outline-info" for="sat-3">
                  <i class="bi bi-emoji-smile"></i> 3
                </label>

                <input type="radio" class="btn-check" name="whatsapp-satisfaction" id="sat-4" value="4">
                <label class="btn btn-outline-primary" for="sat-4">
                  <i class="bi bi-emoji-heart-eyes"></i> 4
                </label>

                <input type="radio" class="btn-check" name="whatsapp-satisfaction" id="sat-5" value="5">
                <label class="btn btn-outline-success" for="sat-5">
                  <i class="bi bi-star-fill"></i> 5
                </label>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
            <i class="bi bi-x-circle me-1"></i>Cancelar
          </button>
          <button type="button" class="btn btn-success" id="whatsapp-confirm-resolve-btn">
            <i class="bi bi-check-circle me-1"></i>Finalizar Atendimento
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal Vincular a Processo -->
  <div class="modal fade" id="whatsapp-contract-link-modal" tabindex="-1" aria-labelledby="whatsappContractLinkModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="whatsappContractLinkModalLabel">
            <i class="bi bi-link-45deg me-2"></i>Vincular Conversa a Processo
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
        </div>
        <div class="modal-body" id="whatsapp-contract-link-modal-body">
          <!-- Conteúdo dinâmico -->
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-primary" id="whatsapp-confirm-link-btn">
            <i class="bi bi-check me-2"></i>Confirmar Vinculação
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal Novo Chat -->
  <div class="modal fade" id="whatsapp-new-chat-modal" tabindex="-1" aria-labelledby="whatsappNewChatModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="whatsappNewChatModalLabel">
            <i class="bi bi-chat-dots me-2"></i>Iniciar Nova Conversa
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
        </div>
        <div class="modal-body">
          <form id="whatsapp-new-chat-form" class="needs-validation" novalidate>
            <div class="mb-3">
              <label for="whatsapp-new-chat-phone" class="form-label">
                Número do WhatsApp <span class="text-danger">*</span>
              </label>
              <input type="tel"
                     class="form-control"
                     id="whatsapp-new-chat-phone"
                     placeholder="Ex: 5541987654321"
                     required
                     pattern="^\\d{12,13}$">
              <div class="invalid-feedback">
                Informe um número válido (12-13 dígitos com código do país).
              </div>
              <div class="form-text">
                Formato: Código país + DDD + Número (Ex: 5541987654321)
              </div>
            </div>
            <div class="mb-3">
              <label for="whatsapp-new-chat-message" class="form-label">Mensagem Inicial</label>
              <textarea class="form-control"
                        id="whatsapp-new-chat-message"
                        rows="3"
                        placeholder="Digite a mensagem inicial (opcional)"></textarea>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
            <i class="bi bi-x-circle me-1"></i>Cancelar
          </button>
          <button type="submit" form="whatsapp-new-chat-form" class="btn btn-primary" id="whatsapp-new-chat-btn">
            <i class="bi bi-send me-1"></i>Iniciar Conversa
          </button>
        </div>
      </div>
    </div>
  </div>
`;

    document.body.insertAdjacentHTML('beforeend', html);
  },
};
