export function renderWhatsAppGeneralTab() {
  return `
                      <!-- ABA: GERAIS -->
                      <div class="tab-pane fade show active min-h-tab-pane" id="whatsapp-general-pane" role="tabpanel">
                        <div class="alert alert-primary d-flex align-items-center mb-3" role="alert">
                          <i class="bi bi-info-circle-fill me-2"></i>
                          <div>
                            <strong>Precisa de ajuda?</strong> 
                            <a href="docs/whatsapp/WHATSAPP_GUIA_ATIVACAO.md" target="_blank" class="alert-link">
                              Veja o guia completo de configuração
                              <i class="bi bi-box-arrow-up-right ms-1"></i>
                            </a>
                          </div>
                        </div>

                        <p class="text-muted">
                          Configurações aplicadas a todos os números WhatsApp. 
                          Para configurar Phone Number ID e Access Token, vá em <strong>"Números WhatsApp"</strong>.
                        </p>
                        
                        <!-- Alertas de validade/configuração -->
                        <div id="whatsapp-token-alert" class="d-none"></div>
                        <div id="whatsapp-webhook-alert" class="d-none"></div>
                        <div id="whatsapp-integration-health" class="d-none mt-2"></div>
                        
                        <form id="whatsapp-config-form">
                          <!-- Webhook Verify Token -->
                          <div class="form-group mb-3">
                            <label for="whatsapp-verify-token" class="form-label">
                              <i class="bi bi-shield-check me-2"></i>Webhook Verify Token
                              <span class="text-danger">*</span>
                            </label>
                            <input 
                              type="text" 
                              class="form-control" 
                              id="whatsapp-verify-token"
                              placeholder="meu_token_secreto_123"
                              autocomplete="off"
                            >
                            <small class="form-text text-muted">
                              Token único que você define e usa no Meta para verificar seu webhook
                            </small>
                          </div>

                          <!-- FCM Public VAPID Key -->
                          <div class="form-group mb-3">
                            <label for="whatsapp-fcm-vapid" class="form-label">
                              <i class="bi bi-broadcast-pin me-2"></i>FCM Public VAPID Key
                            </label>
                            <input 
                              type="text" 
                              class="form-control" 
                              id="whatsapp-fcm-vapid"
                              placeholder="BEXAMPLE123..."
                              autocomplete="off"
                            >
                            <small class="form-text text-muted">
                              Cole aqui a chave pública VAPID disponível em Firebase Console → Cloud Messaging. Necessária para notificações push.
                            </small>
                          </div>

                          <!-- Webhook URL -->
                          <div class="alert alert-info">
                            <div class="d-flex justify-content-between align-items-center">
                              <div>
                                <strong><i class="bi bi-link-45deg"></i> Webhook URL:</strong><br>
                                <code id="webhook-url" class="user-select-all">https://southamerica-east1-sistema-gestor-de-processos-demo.cloudfunctions.net/whatsappWebhook</code>
                              </div>
                              <div class="d-flex flex-column gap-2">
                                <button type="button" class="btn btn-sm btn-secondary" onclick="navigator.clipboard.writeText(document.getElementById('webhook-url').textContent); alert('URL copiada!')">
                                  <i class="bi bi-clipboard"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-primary" id="test-whatsapp-webhook-btn">
                                  <i class="bi bi-patch-check me-2"></i>Testar webhook
                                </button>
                              </div>
                            </div>
                            <small class="text-muted d-block mt-2">
                              Configure esta URL no Meta Business Manager → WhatsApp → Configuration → Webhooks
                            </small>
                          </div>

                          <hr>

                          <!-- Max Chats per Agent -->
                          <div class="form-group mb-3">
                            <label for="whatsapp-max-chats" class="form-label">
                              <i class="bi bi-chat-dots me-2"></i>Máximo de Conversas por Agente
                            </label>
                            <input 
                              type="number" 
                              class="form-control" 
                              id="whatsapp-max-chats"
                              min="1"
                              max="20"
                              value="5"
                            >
                            <small class="form-text text-muted">
                              Limite de conversas simultâneas que cada agente pode atender
                            </small>
                          </div>

                          <!-- Auto Assignment -->
                          <div class="form-group mb-3">
                            <div class="form-check">
                              <input class="form-check-input" type="checkbox" id="whatsapp-auto-assignment" checked>
                              <label class="form-check-label" for="whatsapp-auto-assignment">
                                <strong>Atribuição automática de conversas</strong>
                              </label>
                            </div>
                            <small class="form-text text-muted">
                              Distribui conversas automaticamente para agentes disponíveis
                            </small>
                          </div>

                          <div class="form-group mb-3">
                            <div class="form-check">
                              <input class="form-check-input" type="checkbox" id="whatsapp-include-agent-name">
                              <label class="form-check-label" for="whatsapp-include-agent-name">
                                <strong>Incluir nome do atendente nas mensagens enviadas</strong>
                              </label>
                            </div>
                            <small class="form-text text-muted">
                              Quando ativo, cada mensagem enviada pelo agente informa automaticamente
                              quem está realizando o atendimento.
                            </small>
                          </div>

                          <hr>

                          <!-- Seção Administrativa: Manutenção de Mídias -->
                          <div class="alert alert-warning">
                            <h6 class="alert-heading">
                              <i class="bi bi-tools me-2"></i>Manutenção de Mídias WhatsApp
                            </h6>
                            <p class="mb-2">
                              <small>
                                As URLs de mídia do WhatsApp expiram após algumas horas. 
                                Use esta ferramenta para baixar e salvar permanentemente imagens/arquivos que falharam no download automático.
                              </small>
                            </p>
                            <div class="d-flex gap-2">
                              <button 
                                type="button" 
                                class="btn btn-sm btn-warning" 
                                id="btn-retry-whatsapp-media"
                                onclick="if(window.__WHATSAPP_CONFIG__?.retryMedia) window.__WHATSAPP_CONFIG__.retryMedia(false)"
                              >
                                <i class="bi bi-arrow-clockwise me-2"></i>Reprocessar Mídias Pendentes
                              </button>
                              <button 
                                type="button" 
                                class="btn btn-sm btn-outline-warning" 
                                onclick="if(confirm('Isso irá re-baixar TODAS as mídias, mesmo as que já foram salvas. Continuar?') && window.__WHATSAPP_CONFIG__?.retryMedia) window.__WHATSAPP_CONFIG__.retryMedia(true)"
                                title="Re-baixa todas as mídias, incluindo as que já foram salvas"
                              >
                                <i class="bi bi-arrow-repeat me-2"></i>Forçar Reprocessamento Completo
                              </button>
                            </div>
                            <small class="text-muted d-block mt-2">
                              <i class="bi bi-info-circle me-1"></i>
                              <strong>Nota:</strong> Esta operação pode levar alguns minutos dependendo da quantidade de mídias. 
                              Apenas administradores podem executar esta função.
                            </small>
                          </div>
                        </form>
                      </div>
  `;
}
