/**
 * @file aiChatUI.js
 * @description Widget flutuante unificado: Assistente IA + Chat Interno entre analistas.
 * Usa sistema de abas para alternar entre os dois modos no mesmo container.
 *
 * Dependencias:
 *   - aiAssistantManager.js  (processamento IA)
 *   - analystChatService.js  (CRUD chat entre analistas)
 *   - Bootstrap Icons
 *
 * @version 2.0.0
 */

import aiAssistantManager from './aiAssistantManager.js';
import analystChatService from './analystChatService.js';
import { db } from './auth.js';

// ---------------------------------------------------------------------------
// Classe principal
// ---------------------------------------------------------------------------

class AIChatUI {
  constructor() {
    // Estado geral
    this.isOpen = false;
    this.isMinimized = false;
    this.chatContainer = null;
    this.initialized = false;
    this.activeTab = 'ai'; // 'ai' | 'chat'

    // Estado AI
    this.aiMessagesContainer = null;
    this.aiInputField = null;
    this.unreadCountAI = 0;

    // Estado Chat Interno
    this.chatView = 'list'; // 'list' | 'conversation' | 'newChat' | 'newGroup'
    this.activeChatId = null;
    this.activeChatData = null;
    this.chatList = [];
    this.unreadCountChat = 0;
    this._chatUnsubChats = null;
    this._chatUnsubMessages = null;
    this._chatListenerUid = null;
    this._authStateUnsub = null;
    this._typingTimeout = null;
    this._isTypingActive = false;
    this._chatInitialized = false;
    this._currentUserProfile = null;
    this._cachedUsers = null;
    this._groupSettingsMembers = [];
    this._groupSettingsSearch = '';
    this._groupSettingsAvatarFile = null;
    this._groupSettingsAvatarPreviewUrl = null;
    this._groupSettingsAvatarRemove = false;

    // Sons de notificacao
    this._sounds = {};
    this._soundEnabled = true;
    this._prevChatUnreads = null;
  }

  // =========================================================================
  // Inicializacao
  // =========================================================================

  init() {
    if (this.initialized) return;
    this.injectChatWidget();
    this.bindEvents();
    this._initChatBackgroundSync();
    this._preloadSounds();
    this.initialized = true;
    window.debug && window.debug('AI Chat UI v2 inicializado');
  }

  // =========================================================================
  // Injecao do Widget (DOM)
  // =========================================================================

  injectChatWidget() {
    if (document.getElementById('ai-chat-widget')) {
      console.warn('AI Chat Widget ja existe');
      return;
    }

    const widget = document.createElement('div');
    widget.id = 'ai-chat-widget';
    widget.className = 'ai-chat-widget';
    widget.innerHTML = this._buildWidgetHTML();
    document.body.appendChild(widget);

    // Referencias
    this.chatContainer = document.getElementById('ai-chat-container');
    this.aiMessagesContainer = document.getElementById('ai-chat-messages');
    this.aiInputField = document.getElementById('ai-chat-input-field');
  }

  /** Gera o HTML completo do widget */
  _buildWidgetHTML() {
    return `
      <!-- FAB -->
      <button class="ai-chat-fab" id="ai-chat-fab" aria-label="Abrir assistente">
        <i class="bi bi-chat-square-dots"></i>
        <span class="ai-chat-badge d-none" id="ai-chat-badge">0</span>
      </button>

      <!-- Container -->
      <div class="ai-chat-container d-none" id="ai-chat-container">

        <!-- Header -->
        <div class="ai-chat-header">
          <div class="ai-chat-header-top">
            <div class="d-flex align-items-center gap-2 flex-grow-1 overflow-hidden">
              <span class="d-none" id="ac-header-avatar"></span>
              <i class="bi bi-chat-square-dots fs-5" id="ac-header-icon"></i>
              <div class="text-truncate">
                <h6 class="mb-0 text-truncate" id="ac-header-title">Assistente IA</h6>
                <small class="text-white-50" id="ac-header-sub">Sempre pronto para ajudar</small>
              </div>
            </div>
            <div class="d-flex gap-1 flex-shrink-0">
              <button class="btn btn-sm btn-link text-white p-0 d-none" id="ac-header-group-settings" aria-label="Personalizar grupo">
                <i class="bi bi-sliders"></i>
              </button>
              <button class="btn btn-sm btn-link text-white p-0 d-none" id="ac-header-back" aria-label="Voltar">
                <i class="bi bi-arrow-left"></i>
              </button>
              <button class="btn btn-sm btn-link text-white p-0" id="ai-chat-minimize" aria-label="Minimizar">
                <i class="bi bi-dash-lg"></i>
              </button>
              <button class="btn btn-sm btn-link text-white p-0" id="ai-chat-close" aria-label="Fechar">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
          <!-- Abas -->
          <div class="ai-chat-tabs">
            <button class="ai-chat-tab active" data-tab="ai" id="ac-tab-ai">
              <i class="bi bi-robot"></i> Assistente
            </button>
            <button class="ai-chat-tab" data-tab="chat" id="ac-tab-chat">
              <i class="bi bi-people"></i> Chat Interno
              <span class="ai-chat-tab-badge d-none" id="ac-tab-chat-badge">0</span>
            </button>
          </div>
        </div>

        <!-- ============ PAINEL: Assistente IA ============ -->
        <div class="ai-chat-panel" id="ac-panel-ai">
          <!-- Quick Actions -->
          <div class="ai-chat-quick-actions" id="ai-chat-quick-actions">
            <button class="btn btn-sm btn-outline-primary" data-quick-action="help">
              <i class="bi bi-question-circle"></i> Ajuda
            </button>
            <button class="btn btn-sm btn-outline-primary" data-quick-action="document">
              <i class="bi bi-file-earmark"></i> Documento
            </button>
            <button class="btn btn-sm btn-outline-primary" data-quick-action="contract">
              <i class="bi bi-folder"></i> Contrato
            </button>
            <button class="btn btn-sm btn-outline-primary" data-quick-action="report">
              <i class="bi bi-graph-up"></i> Relatorio
            </button>
          </div>

          <!-- Messages -->
          <div class="ai-chat-messages" id="ai-chat-messages">
            <div class="ai-chat-message ai-message">
              <div class="ai-message-avatar"><i class="bi bi-robot"></i></div>
              <div class="ai-message-content">
                <strong>Assistente IA</strong>
                <p>Ola! Sou seu assistente inteligente. Como posso ajudar hoje?</p>
                <div class="ai-message-suggestions">
                  <button class="btn btn-sm btn-outline-secondary" data-suggestion="Ajuda">Ajuda</button>
                  <button class="btn btn-sm btn-outline-secondary" data-suggestion="O que voce faz?">O que voce faz?</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Typing -->
          <div class="ai-chat-typing d-none" id="ai-chat-typing">
            <div class="ai-message-avatar"><i class="bi bi-robot"></i></div>
            <div class="ai-typing-indicator"><span></span><span></span><span></span></div>
          </div>

          <!-- Input -->
          <div class="ai-chat-input">
            <input type="file" id="ai-chat-file-input" class="d-none" accept=".pdf,.txt,.jpg,.jpeg,.png,.doc,.docx" />
            <button class="btn btn-light" id="ai-chat-attach-btn" aria-label="Anexar arquivo" title="Anexar documento">
              <i class="bi bi-paperclip"></i>
            </button>
            <textarea class="form-control" id="ai-chat-input-field" placeholder="Digite sua mensagem..." rows="1"></textarea>
            <button class="btn btn-primary" id="ai-chat-send-btn" aria-label="Enviar mensagem">
              <i class="bi bi-send-fill"></i>
            </button>
          </div>

          <!-- Footer -->
          <div class="ai-chat-footer">
            <small class="text-muted"><i class="bi bi-shield-check"></i> Seguro e privado</small>
            <button class="btn btn-sm btn-link text-muted p-0" id="ai-chat-clear">
              <i class="bi bi-trash"></i> Limpar
            </button>
          </div>
        </div>

        <!-- ============ PAINEL: Chat Interno ============ -->
        <div class="ai-chat-panel d-none" id="ac-panel-chat">

          <!-- == Vista: Lista de conversas == -->
          <div class="ac-chat-view" id="ac-view-list">
            <div class="ac-chat-list-toolbar">
              <div class="input-group input-group-sm">
                <span class="input-group-text bg-transparent border-end-0"><i class="bi bi-search"></i></span>
                <input type="text" class="form-control border-start-0" id="ac-chat-search" placeholder="Buscar conversa..." />
              </div>
              <div class="d-flex gap-1">
                <button class="btn btn-sm btn-primary" id="ac-btn-new-chat" title="Nova conversa">
                  <i class="bi bi-chat-left-text"></i>
                </button>
                <button class="btn btn-sm btn-outline-primary" id="ac-btn-new-group" title="Novo grupo">
                  <i class="bi bi-people"></i>
                </button>
              </div>
            </div>
            <div class="ac-chat-list" id="ac-chat-list">
              <div class="ac-chat-empty">
                <i class="bi bi-chat-dots fs-1 text-muted"></i>
                <p class="text-muted mb-0 mt-2">Nenhuma conversa ainda</p>
                <button class="btn btn-sm btn-primary mt-2" id="ac-btn-start-chat">Iniciar conversa</button>
              </div>
            </div>
          </div>

          <!-- == Vista: Conversa ativa == -->
          <div class="ac-chat-view d-none" id="ac-view-conversation">
            <div class="ac-conv-messages" id="ac-conv-messages"></div>
            <div class="ac-conv-typing d-none" id="ac-conv-typing">
              <small class="text-muted"><span id="ac-conv-typing-name"></span> esta digitando...</small>
            </div>
            <div class="ac-conv-input">
              <input type="file" id="ac-conv-file-input" class="d-none" />
              <button class="btn btn-sm btn-light" id="ac-conv-attach-btn" aria-label="Anexar">
                <i class="bi bi-paperclip"></i>
              </button>
              <textarea class="form-control form-control-sm" id="ac-conv-input-field" placeholder="Mensagem..." rows="1"></textarea>
              <button class="btn btn-sm btn-primary" id="ac-conv-send-btn" aria-label="Enviar">
                <i class="bi bi-send-fill"></i>
              </button>
            </div>
          </div>

          <!-- == Vista: Personalizar grupo == -->
          <div class="ac-chat-view d-none" id="ac-view-group-settings">
            <div class="p-3 border-bottom">
              <div class="small fw-semibold mb-1">Personalizacao do grupo</div>
              <div class="text-muted small">Ajuste como esse grupo aparece para os participantes.</div>
            </div>
            <div class="p-3 overflow-auto flex-grow-1">
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="ac-group-edit-name">Nome do grupo</label>
                <input type="text" class="form-control form-control-sm" id="ac-group-edit-name" maxlength="60" />
              </div>
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="ac-group-edit-description">Descricao</label>
                <textarea class="form-control form-control-sm" id="ac-group-edit-description" rows="2" maxlength="200" placeholder="Opcional"></textarea>
              </div>
              <div class="row g-2">
                <div class="col-5">
                  <label class="form-label small fw-semibold" for="ac-group-edit-emoji">Emoji</label>
                  <input type="text" class="form-control form-control-sm" id="ac-group-edit-emoji" maxlength="4" placeholder="👥" />
                </div>
                <div class="col-7">
                  <label class="form-label small fw-semibold" for="ac-group-edit-color">Cor</label>
                  <select class="form-select form-select-sm" id="ac-group-edit-color">
                    <option value="primary">Azul</option>
                    <option value="info">Ciano</option>
                    <option value="success">Verde</option>
                    <option value="warning">Amarelo</option>
                    <option value="danger">Vermelho</option>
                    <option value="secondary">Cinza</option>
                  </select>
                </div>
              </div>

              <div class="mt-3">
                <label class="form-label small fw-semibold mb-1">Foto do grupo</label>
                <input type="file" id="ac-group-avatar-input" class="d-none" accept="image/*" />
                <div class="d-flex flex-wrap gap-2">
                  <button class="btn btn-sm btn-outline-secondary" id="ac-btn-group-avatar-pick" type="button">
                    <i class="bi bi-image me-1"></i>Selecionar foto
                  </button>
                  <button class="btn btn-sm btn-outline-danger d-none" id="ac-btn-group-avatar-remove" type="button">
                    <i class="bi bi-trash me-1"></i>Remover foto
                  </button>
                </div>
                <small class="text-muted d-block mt-1" id="ac-group-avatar-hint">Use JPG ou PNG (ate 2MB).</small>
              </div>

              <div class="ac-group-preview mt-3" id="ac-group-preview"></div>

              <div class="mt-3">
                <label class="form-label small fw-semibold mb-2">Membros do grupo</label>
                <div class="ac-group-members-current mb-2" id="ac-group-members-current"></div>

                <div class="input-group input-group-sm mb-2">
                  <span class="input-group-text bg-transparent border-end-0"><i class="bi bi-search"></i></span>
                  <input type="text" class="form-control border-start-0" id="ac-group-members-search" placeholder="Buscar para adicionar/remover..." />
                </div>

                <div class="ac-group-members-candidates" id="ac-group-members-candidates"></div>
              </div>
            </div>
            <div class="p-2 border-top">
              <button class="btn btn-sm btn-primary w-100" id="ac-btn-save-group-settings">
                <i class="bi bi-check2-circle me-1"></i>Salvar personalizacao
              </button>
            </div>
          </div>

          <!-- == Vista: Nova conversa (selecionar usuario) == -->
          <div class="ac-chat-view d-none" id="ac-view-new-chat">
            <div class="p-2">
              <div class="input-group input-group-sm mb-2">
                <span class="input-group-text bg-transparent border-end-0"><i class="bi bi-search"></i></span>
                <input type="text" class="form-control border-start-0" id="ac-new-chat-search" placeholder="Buscar usuario..." />
              </div>
            </div>
            <div class="ac-user-list" id="ac-user-list"></div>
          </div>

          <!-- == Vista: Novo grupo == -->
          <div class="ac-chat-view d-none" id="ac-view-new-group">
            <div class="p-2">
              <div class="mb-2">
                <input type="text" class="form-control form-control-sm" id="ac-group-name" placeholder="Nome do grupo" maxlength="50" />
              </div>
              <div class="input-group input-group-sm mb-2">
                <span class="input-group-text bg-transparent border-end-0"><i class="bi bi-search"></i></span>
                <input type="text" class="form-control border-start-0" id="ac-group-search" placeholder="Buscar membros..." />
              </div>
              <div class="ac-group-selected mb-2 d-none" id="ac-group-selected"></div>
            </div>
            <div class="ac-user-list" id="ac-group-user-list"></div>
            <div class="p-2 border-top">
              <button class="btn btn-sm btn-primary w-100" id="ac-btn-create-group" disabled>
                <i class="bi bi-people-fill"></i> Criar grupo
              </button>
            </div>
          </div>

        </div><!-- /ac-panel-chat -->

      </div><!-- /ai-chat-container -->
    `;
  }

  // =========================================================================
  // Bind de eventos
  // =========================================================================

  bindEvents() {
    // --- Geral ---
    document.getElementById('ai-chat-fab')?.addEventListener('click', () => this.toggle());
    document.getElementById('ai-chat-close')?.addEventListener('click', () => this.close());
    document.getElementById('ai-chat-minimize')?.addEventListener('click', () => this.minimize());

    // --- Abas ---
    document.getElementById('ac-tab-ai')?.addEventListener('click', () => this.switchTab('ai'));
    document.getElementById('ac-tab-chat')?.addEventListener('click', () => this.switchTab('chat'));

    // --- Header back ---
    document.getElementById('ac-header-back')?.addEventListener('click', () => this._chatGoBack());
    document.getElementById('ac-header-group-settings')?.addEventListener('click', () => this._showGroupSettings());

    // --- AI: Enviar ---
    document.getElementById('ai-chat-send-btn')?.addEventListener('click', () => this.sendAIMessage());
    this.aiInputField?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendAIMessage(); }
    });
    this.aiInputField?.addEventListener('input', () => {
      this.aiInputField.style.height = 'auto';
      this.aiInputField.style.height = Math.min(this.aiInputField.scrollHeight, 120) + 'px';
    });

    // --- AI: Attach ---
    document.getElementById('ai-chat-attach-btn')?.addEventListener('click', () => {
      document.getElementById('ai-chat-file-input')?.click();
    });
    document.getElementById('ai-chat-file-input')?.addEventListener('change', (e) => this.handleAIFileSelection(e));

    // --- AI: Quick Actions ---
    document.querySelectorAll('[data-quick-action]').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleQuickAction(e.currentTarget.dataset.quickAction));
    });

    // --- AI: Limpar ---
    document.getElementById('ai-chat-clear')?.addEventListener('click', () => this.clearAIConversation());

    // --- AI: Suggestions (delegacao) ---
    this.aiMessagesContainer?.addEventListener('click', (e) => {
      const s = e.target.closest('[data-suggestion]');
      if (s) { this.aiInputField.value = s.dataset.suggestion; this.sendAIMessage(); }
    });

    // --- Chat: toolbar ---
    document.getElementById('ac-btn-new-chat')?.addEventListener('click', () => this._showChatView('newChat'));
    document.getElementById('ac-btn-new-group')?.addEventListener('click', () => this._showChatView('newGroup'));
    document.getElementById('ac-btn-start-chat')?.addEventListener('click', () => this._showChatView('newChat'));

    // --- Chat: busca conversas ---
    document.getElementById('ac-chat-search')?.addEventListener('input', (e) => this._filterChatList(e.target.value));

    // --- Chat: lista (delegacao) ---
    document.getElementById('ac-chat-list')?.addEventListener('click', (e) => {
      const item = e.target.closest('[data-chat-id]');
      if (item) this._openConversation(item.dataset.chatId);
    });
    document.getElementById('ac-chat-list')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('[data-chat-id]');
      if (!item) return;
      e.preventDefault();
      this._openConversation(item.dataset.chatId);
    });

    // --- Chat: enviar mensagem ---
    document.getElementById('ac-conv-send-btn')?.addEventListener('click', () => this._sendChatMessage());
    document.getElementById('ac-conv-input-field')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendChatMessage(); }
    });
    document.getElementById('ac-conv-input-field')?.addEventListener('input', (e) => {
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 80) + 'px';
      this._handleTypingIndicator();
    });

    // --- Chat: anexar arquivo ---
    document.getElementById('ac-conv-attach-btn')?.addEventListener('click', () => {
      document.getElementById('ac-conv-file-input')?.click();
    });
    document.getElementById('ac-conv-file-input')?.addEventListener('change', (e) => this._handleChatFileUpload(e));

    // --- Chat: selecao de usuario (nova conversa) ---
    document.getElementById('ac-user-list')?.addEventListener('click', (e) => {
      const item = e.target.closest('[data-user-uid]');
      if (item) this._startDirectChat(item.dataset.userUid);
    });
    document.getElementById('ac-user-list')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('[data-user-uid]');
      if (!item) return;
      e.preventDefault();
      this._startDirectChat(item.dataset.userUid);
    });
    document.getElementById('ac-new-chat-search')?.addEventListener('input', (e) => this._filterUserList(e.target.value, 'ac-user-list'));

    // --- Chat: grupo ---
    document.getElementById('ac-group-user-list')?.addEventListener('click', (e) => {
      const item = e.target.closest('[data-user-uid]');
      if (item) this._toggleGroupMember(item.dataset.userUid);
    });
    document.getElementById('ac-group-user-list')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('[data-user-uid]');
      if (!item) return;
      e.preventDefault();
      this._toggleGroupMember(item.dataset.userUid);
    });
    document.getElementById('ac-group-search')?.addEventListener('input', (e) => this._filterUserList(e.target.value, 'ac-group-user-list'));
    document.getElementById('ac-btn-create-group')?.addEventListener('click', () => this._createGroup());

    // --- Chat: personalizacao de grupo ---
    document.getElementById('ac-btn-save-group-settings')?.addEventListener('click', () => this._saveGroupSettings());
    document.getElementById('ac-group-edit-emoji')?.addEventListener('input', () => this._renderGroupPreview());
    document.getElementById('ac-group-edit-color')?.addEventListener('change', () => this._renderGroupPreview());
    document.getElementById('ac-group-edit-name')?.addEventListener('input', () => this._renderGroupPreview());
    document.getElementById('ac-btn-group-avatar-pick')?.addEventListener('click', () => {
      document.getElementById('ac-group-avatar-input')?.click();
    });
    document.getElementById('ac-group-avatar-input')?.addEventListener('change', (e) => this._handleGroupAvatarSelection(e));
    document.getElementById('ac-btn-group-avatar-remove')?.addEventListener('click', () => this._removeGroupAvatarDraft());
    document.getElementById('ac-group-members-search')?.addEventListener('input', (e) => {
      this._groupSettingsSearch = (e.target?.value || '').trim().toLowerCase();
      this._renderGroupMembersManager();
    });

    document.getElementById('ac-group-members-current')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-member-uid]');
      if (!btn) return;
      this._toggleGroupMemberSetting(btn.dataset.removeMemberUid);
    });

    document.getElementById('ac-group-members-candidates')?.addEventListener('click', (e) => {
      const row = e.target.closest('[data-toggle-member-uid]');
      if (!row) return;
      this._toggleGroupMemberSetting(row.dataset.toggleMemberUid);
    });
    document.getElementById('ac-group-members-candidates')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('[data-toggle-member-uid]');
      if (!row) return;
      e.preventDefault();
      this._toggleGroupMemberSetting(row.dataset.toggleMemberUid);
    });
  }

  // =========================================================================
  // Abas
  // =========================================================================

  switchTab(tab) {
    if (tab === this.activeTab) return;
    this.activeTab = tab;

    // Toggle classes nas abas
    document.getElementById('ac-tab-ai')?.classList.toggle('active', tab === 'ai');
    document.getElementById('ac-tab-chat')?.classList.toggle('active', tab === 'chat');

    // Toggle paineis
    document.getElementById('ac-panel-ai')?.classList.toggle('d-none', tab !== 'ai');
    document.getElementById('ac-panel-chat')?.classList.toggle('d-none', tab !== 'chat');

    // Header
    const icon = document.getElementById('ac-header-icon');
    const title = document.getElementById('ac-header-title');
    const sub = document.getElementById('ac-header-sub');

    if (tab === 'ai') {
      if (icon) { icon.className = 'bi bi-robot fs-5'; icon.classList.remove('d-none'); }
      if (title) title.textContent = 'Assistente IA';
      if (sub) sub.textContent = 'Sempre pronto para ajudar';
      document.getElementById('ac-header-back')?.classList.add('d-none');
      document.getElementById('ac-header-avatar')?.classList.add('d-none');
      this.aiInputField?.focus();
    } else {
      this._initChatInterno();
      this._updateChatHeader();
    }
  }

  // =========================================================================
  // Abrir / Fechar / Minimizar
  // =========================================================================

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    this.chatContainer?.classList.remove('d-none');
    this.chatContainer?.classList.remove('minimized');
    this.isOpen = true;
    this.isMinimized = false;

    if (this.activeTab === 'ai') {
      this.unreadCountAI = 0;
      this.aiInputField?.focus();
    } else {
      this._initChatInterno();
    }
    this._updateGlobalBadge();
  }

  close() {
    this._resetTypingStatus();
    this.chatContainer?.classList.add('d-none');
    this.isOpen = false;
    this.isMinimized = false;
  }

  minimize() {
    this.chatContainer?.classList.add('minimized');
    this.isMinimized = true;
  }

  // =========================================================================
  // Badge global (FAB)
  // =========================================================================

  _updateGlobalBadge() {
    const badge = document.getElementById('ai-chat-badge');
    if (!badge) return;

    const total = this.unreadCountAI + this.unreadCountChat;
    if (total > 0) {
      badge.textContent = total > 9 ? '9+' : total;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }

    // Badge da aba Chat Interno
    const tabBadge = document.getElementById('ac-tab-chat-badge');
    if (tabBadge) {
      if (this.unreadCountChat > 0) {
        tabBadge.textContent = this.unreadCountChat > 9 ? '9+' : this.unreadCountChat;
        tabBadge.classList.remove('d-none');
      } else {
        tabBadge.classList.add('d-none');
      }
    }

    // Badge na sidebar (se existir)
    const sidebarBadge = document.getElementById('analyst-chat-badge');
    if (sidebarBadge) {
      if (this.unreadCountChat > 0) {
        sidebarBadge.textContent = this.unreadCountChat > 9 ? '9+' : this.unreadCountChat;
        sidebarBadge.classList.remove('d-none');
      } else {
        sidebarBadge.classList.add('d-none');
      }
    }
  }

  // =========================================================================
  // ====  Assistente IA  ====
  // =========================================================================

  async sendAIMessage() {
    const message = this.aiInputField?.value.trim();
    const fileInput = document.getElementById('ai-chat-file-input');
    const file = fileInput?.files[0];
    if (!message && !file) return;

    if (message) this._addAIUserMessage(message);
    if (file) this._addAIFileMessage(file);

    this.aiInputField.value = '';
    this.aiInputField.style.height = 'auto';
    if (fileInput) fileInput.value = '';

    this._showAITyping();

    try {
      const options = {};
      if (file) options.documentFile = file;
      const response = await aiAssistantManager.processMessage(
        message || `Analisar arquivo: ${file.name}`, options
      );
      this._hideAITyping();
      this._addAIAssistantMessage(response);
    } catch (error) {
      console.error('Erro ao processar mensagem IA:', error);
      this._hideAITyping();
      this._addAIAssistantMessage({ content: 'Desculpe, ocorreu um erro. Tente novamente.', action: 'error' });
    }
  }

  _addAIUserMessage(message) {
    const el = document.createElement('div');
    el.className = 'ai-chat-message user-message';
    el.innerHTML = `
      <div class="ai-message-content"><p>${this._esc(message)}</p></div>
      <div class="ai-message-avatar"><i class="bi bi-person-circle"></i></div>
    `;
    this.aiMessagesContainer?.appendChild(el);
    this._scrollAI();
  }

  _addAIFileMessage(file) {
    const el = document.createElement('div');
    el.className = 'ai-chat-message user-message';
    const icon = file.type.startsWith('image/') ? 'bi-image' : 'bi-file-earmark-pdf';
    const size = (file.size / 1024).toFixed(1) + ' KB';
    el.innerHTML = `
      <div class="ai-message-content">
        <div class="d-flex align-items-center gap-2">
          <i class="bi ${icon} fs-4"></i>
          <div><strong>${this._esc(file.name)}</strong><small class="d-block text-muted">${size}</small></div>
        </div>
      </div>
      <div class="ai-message-avatar"><i class="bi bi-person-circle"></i></div>
    `;
    this.aiMessagesContainer?.appendChild(el);
    this._scrollAI();
  }

  _addAIAssistantMessage(response) {
    const el = document.createElement('div');
    el.className = 'ai-chat-message ai-message';
    const content = this._formatAIContent(response.content);
    const suggestions = response.suggestions || [];
    el.innerHTML = `
      <div class="ai-message-avatar"><i class="bi bi-robot"></i></div>
      <div class="ai-message-content">
        <strong>Assistente IA</strong>
        ${content}
        ${suggestions.length > 0 ? this._renderSuggestions(suggestions) : ''}
      </div>
    `;
    this.aiMessagesContainer?.appendChild(el);
    this._scrollAI();

    if (!this.isOpen || this.activeTab !== 'ai') {
      this.unreadCountAI++;
      this._updateGlobalBadge();
    }
  }

  _formatAIContent(text) {
    let f = this._esc(text);
    f = f.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    f = f.replace(/\*(.+?)\*/g, '<em>$1</em>');
    f = f.replace(/^- (.+)$/gm, '<li>$1</li>');
    f = f.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    f = f.replace(/\n/g, '<br>');
    return `<div class="ai-message-text">${f}</div>`;
  }

  _renderSuggestions(suggestions) {
    return `<div class="ai-message-suggestions">${
      suggestions.map(s => `<button class="btn btn-sm btn-outline-secondary" data-suggestion="${this._esc(s)}">${this._esc(s)}</button>`).join('')
    }</div>`;
  }

  _showAITyping() { document.getElementById('ai-chat-typing')?.classList.remove('d-none'); this._scrollAI(); }
  _hideAITyping() { document.getElementById('ai-chat-typing')?.classList.add('d-none'); }

  _scrollAI() {
    setTimeout(() => {
      this.aiMessagesContainer?.scrollTo({ top: this.aiMessagesContainer.scrollHeight, behavior: 'smooth' });
    }, 100);
  }

  handleAIFileSelection(e) {
    const file = e.target?.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      this._addAIAssistantMessage({ content: 'Arquivo muito grande. Tamanho maximo: 10MB', action: 'error' });
      e.target.value = '';
      return;
    }
    const allowed = ['application/pdf','text/plain','image/jpeg','image/png','image/jpg',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type)) {
      this._addAIAssistantMessage({ content: 'Tipo de arquivo nao suportado. Use PDF, TXT, JPG, PNG ou DOC/DOCX', action: 'error' });
      e.target.value = '';
      return;
    }
    const btn = document.getElementById('ai-chat-attach-btn');
    if (btn) {
      btn.innerHTML = '<i class="bi bi-check-circle-fill text-success"></i>';
      setTimeout(() => { btn.innerHTML = '<i class="bi bi-paperclip"></i>'; }, 2000);
    }
  }

  async clearAIConversation() {
    if (!confirm('Deseja limpar toda a conversa com o assistente?')) return;
    this.aiMessagesContainer.innerHTML = `
      <div class="ai-chat-message ai-message">
        <div class="ai-message-avatar"><i class="bi bi-robot"></i></div>
        <div class="ai-message-content">
          <strong>Assistente IA</strong>
          <p>Conversa limpa! Como posso ajudar?</p>
        </div>
      </div>
    `;
    await aiAssistantManager.clearHistory();
  }

  async handleQuickAction(action) {
    const m = { help: 'Ajuda', document: 'Como processar um documento?', contract: 'Quero criar um novo contrato', report: 'Gerar relatorio executivo' };
    this.aiInputField.value = m[action] || action;
    await this.sendAIMessage();
  }

  // =========================================================================
  // ====  Chat Interno  ====
  // =========================================================================

  _initChatBackgroundSync() {
    if (this._authStateUnsub) return;
    if (!firebase?.auth) return;

    const authInstance = firebase.auth();
    if (!authInstance?.onAuthStateChanged) return;

    this._authStateUnsub = authInstance.onAuthStateChanged((user) => {
      if (!user?.uid) {
        if (this._chatUnsubChats) {
          this._chatUnsubChats();
          this._chatUnsubChats = null;
        }
        this._chatListenerUid = null;
        this.chatList = [];
        this.unreadCountChat = 0;
        this._prevChatUnreads = null;
        this._cachedUsers = null;
        this._currentUserProfile = null;
        this._updateGlobalBadge();
        return;
      }

      this._ensureChatListListener(user.uid);
      this.refreshChatBadge();
    });
  }

  _ensureChatListListener(uid) {
    if (!uid) return;
    if (this._chatUnsubChats && this._chatListenerUid === uid) return;

    if (this._chatUnsubChats) {
      this._chatUnsubChats();
      this._chatUnsubChats = null;
    }

    this._chatListenerUid = uid;
    this._chatUnsubChats = analystChatService.onMyChatsChanged((chats) => {
      this._checkNewMessages(chats);
      this.chatList = chats;
      this._updateChatUnread(chats);

      if (this.activeTab === 'chat' && this.chatView === 'list') {
        this._renderChatList(chats);
      }

      if (this.activeTab === 'chat') {
        this._updateChatHeader();
      }
    });
  }

  /** Inicializa listener de conversas (chamado uma vez ao abrir a aba) */
  _initChatInterno() {
    const uid = analystChatService.currentUid();
    if (!uid) return; // usuario nao logado

    if (!this._chatInitialized) {
      this._chatInitialized = true;
      analystChatService.updatePresence(true);

      // Carrega perfil do usuario atual para header
      this._loadCurrentUserProfile(uid);

      // Pre-carrega lista de usuarios para resolver nomes/fotos
      analystChatService.listAvailableUsers()
        .then(users => {
          this._cachedUsers = users;
          if (this.activeTab === 'chat' && this.chatView === 'list') {
            this._renderChatList(this.chatList);
          }
          if (this.activeTab === 'chat' && this.chatView === 'conversation') {
            this._updateChatHeader();
          }
        })
        .catch(() => {});

      // Limpa ao deslogar
      const origClose = this.close.bind(this);
      window.addEventListener('beforeunload', () => {
        analystChatService.updatePresence(false);
        origClose();
      });
    }

    this._ensureChatListListener(uid);
  }

  /** Atualiza contagem de nao lidas */
  _updateChatUnread(chats) {
    const uid = analystChatService.currentUid();
    this.unreadCountChat = chats.reduce((sum, c) => sum + (c.data?.unread?.[uid] || 0), 0);
    this._updateGlobalBadge();
  }

  /** Carrega perfil Firestore do usuario atual (shortName, fullName, avatarUrl) */
  async _loadCurrentUserProfile(uid) {
    try {
      const doc = await db.collection('users').doc(uid).get();
      if (doc.exists) {
        this._currentUserProfile = doc.data();
        // Atualiza header se ja estiver na aba chat
        if (this.activeTab === 'chat' && this.chatView === 'list') {
          this._updateChatHeader();
        }
      }
    // eslint-disable-next-line no-unused-vars
    } catch (err) {
      // Silencia - header vai usar fallback
    }
  }

  /** Resolve nome de exibicao: shortName > fullName > displayName > email */
  _resolveMyName() {
    const p = this._currentUserProfile;
    if (p) {
      const short = (p.shortName || '').trim();
      if (short) return short;
      const full = (p.fullName || '').trim();
      if (full) return full;
      const display = (p.displayName || '').trim();
      if (display) return display;
      const nome = (p.nome || '').trim();
      if (nome) return nome;
      if (p.email) return p.email;
    }
    // Fallback Firebase Auth
    const user = analystChatService.currentUserData();
    return user?.displayName || user?.email || 'Chat Interno';
  }

  /** Retorna URL do avatar do usuario logado */
  _resolveMyAvatar() {
    const p = this._currentUserProfile;
    return p?.avatarUrl || p?.photoURL || p?.fotoPerfil || null;
  }

  // ---- Header dinamico para Chat Interno ----

  _updateChatHeader() {
    const icon = document.getElementById('ac-header-icon');
    const avatar = document.getElementById('ac-header-avatar');
    const title = document.getElementById('ac-header-title');
    const sub = document.getElementById('ac-header-sub');
    const backBtn = document.getElementById('ac-header-back');
    const groupSettingsBtn = document.getElementById('ac-header-group-settings');

    groupSettingsBtn?.classList.add('d-none');

    if (this.chatView === 'list') {
      // Mostra avatar e nome do usuario logado
      const myAvatar = this._resolveMyAvatar();
      if (myAvatar && avatar) {
        avatar.innerHTML = `<img src="${this._esc(myAvatar)}" alt="" class="ac-header-avatar-img" />`;
        avatar.classList.remove('d-none');
        if (icon) icon.classList.add('d-none');
      } else {
        if (avatar) avatar.classList.add('d-none');
        if (icon) { icon.className = 'bi bi-person-circle fs-5'; icon.classList.remove('d-none'); }
      }
      if (title) title.textContent = this._resolveMyName();
      if (sub) sub.textContent = `${this.chatList.length} conversa(s)`;
      backBtn?.classList.add('d-none');
    } else if (this.chatView === 'conversation') {
      const name = this._getChatDisplayName(this.activeChatData);
      const contactPhoto = this._getChatContactPhoto(this.activeChatData);
      const isGroup = this.activeChatData?.type === 'group';

      if (isGroup && avatar) {
        avatar.innerHTML = this._getGroupAvatarHTML(this.activeChatData, true);
        avatar.classList.remove('d-none');
        if (icon) icon.classList.add('d-none');
      } else if (!isGroup && contactPhoto && avatar) {
        avatar.innerHTML = `<img src="${this._esc(contactPhoto)}" alt="" class="ac-header-avatar-img" />`;
        avatar.classList.remove('d-none');
        if (icon) icon.classList.add('d-none');
      } else {
        if (avatar) avatar.classList.add('d-none');
        if (icon) {
          icon.classList.remove('d-none');
          icon.className = isGroup ? 'bi bi-people-fill fs-5' : 'bi bi-person-circle fs-5';
        }
      }

      if (title) title.textContent = name;
      if (sub) {
        const groupDesc = (this.activeChatData?.groupDescription || '').trim();
        sub.textContent = isGroup
          ? (groupDesc || `${(this.activeChatData.participants || []).length} membros`)
          : 'Online';
      }
      backBtn?.classList.remove('d-none');
      if (isGroup) groupSettingsBtn?.classList.remove('d-none');
    } else if (this.chatView === 'groupSettings') {
      if (avatar) avatar.classList.add('d-none');
      if (icon) icon.classList.remove('d-none');
      if (icon) icon.className = 'bi bi-sliders fs-5';
      if (title) title.textContent = 'Personalizar grupo';
      if (sub) sub.textContent = this._getChatDisplayName(this.activeChatData);
      backBtn?.classList.remove('d-none');
    } else if (this.chatView === 'newChat') {
      if (avatar) avatar.classList.add('d-none');
      if (icon) icon.classList.remove('d-none');
      if (icon) icon.className = 'bi bi-chat-left-text fs-5';
      if (title) title.textContent = 'Nova conversa';
      if (sub) sub.textContent = 'Selecione um usuario';
      backBtn?.classList.remove('d-none');
    } else if (this.chatView === 'newGroup') {
      if (avatar) avatar.classList.add('d-none');
      if (icon) icon.classList.remove('d-none');
      if (icon) icon.className = 'bi bi-people-fill fs-5';
      if (title) title.textContent = 'Novo grupo';
      if (sub) sub.textContent = 'Selecione os membros';
      backBtn?.classList.remove('d-none');
    }
  }

  _chatGoBack() {
    if (this.chatView === 'groupSettings') {
      this._resetGroupAvatarDraft();
      this._showChatView('conversation');
      return;
    }

    if (this.chatView === 'conversation' || this.chatView === 'newChat' || this.chatView === 'newGroup') {
      // Desfaz listener de mensagens ativo
      if (this._chatUnsubMessages) {
        this._chatUnsubMessages();
        this._chatUnsubMessages = null;
      }
      this._resetTypingStatus();
      this.activeChatId = null;
      this.activeChatData = null;
      this._showChatView('list');
    }
  }

  // ---- Navegacao de vistas ----

  _showChatView(view) {
    this.chatView = view;
    const views = ['list', 'conversation', 'newChat', 'newGroup', 'groupSettings'];
    const viewIdMap = {
      list: 'ac-view-list',
      conversation: 'ac-view-conversation',
      newChat: 'ac-view-new-chat',
      newGroup: 'ac-view-new-group',
      groupSettings: 'ac-view-group-settings',
    };
    views.forEach(v => {
      const el = document.getElementById(viewIdMap[v]);
      el?.classList.toggle('d-none', v !== view);
    });
    this._updateChatHeader();

    if (view === 'newChat') this._loadUserList('ac-user-list');
    if (view === 'newGroup') {
      this._selectedGroupMembers = [];
      this._loadUserList('ac-group-user-list');
      this._renderGroupSelected();
      const createBtn = document.getElementById('ac-btn-create-group');
      if (createBtn) createBtn.disabled = true;
      const nameInput = document.getElementById('ac-group-name');
      if (nameInput) nameInput.value = '';
    }
  }

  // ---- Renderizar lista de conversas ----

  _renderChatList(chats) {
    const container = document.getElementById('ac-chat-list');
    if (!container) return;

    if (!chats || chats.length === 0) {
      container.innerHTML = `
        <div class="ac-chat-empty">
          <i class="bi bi-chat-dots fs-1 text-muted"></i>
          <p class="text-muted mb-0 mt-2">Nenhuma conversa ainda</p>
          <button class="btn btn-sm btn-primary mt-2" id="ac-btn-start-chat-2" onclick="document.getElementById('ac-btn-new-chat')?.click()">Iniciar conversa</button>
        </div>
      `;
      return;
    }

    const uid = analystChatService.currentUid();
    container.innerHTML = chats.map(chat => {
      const d = chat.data;
      const name = this._getChatDisplayName(d);
      const unread = d.unread?.[uid] || 0;
      const lastMsg = d.lastMessage || '';
      const time = d.lastMessageAt ? this._formatTime(d.lastMessageAt) : '';
      const isGroup = d.type === 'group';
      const avatar = isGroup
        ? this._getGroupAvatarHTML(d)
        : this._getAvatarHTML(d, uid);

      return `
        <div class="ac-chat-item ${unread > 0 ? 'ac-chat-unread' : ''}" data-chat-id="${chat.id}" role="button" tabindex="0">
          <div class="ac-chat-avatar">${avatar}</div>
          <div class="ac-chat-info">
            <div class="d-flex justify-content-between align-items-center">
              <strong class="text-truncate">${this._esc(name)}</strong>
              <small class="text-muted flex-shrink-0 ms-1">${time}</small>
            </div>
            <div class="d-flex justify-content-between align-items-center">
              <small class="text-muted text-truncate">${this._esc(lastMsg)}</small>
              ${unread > 0 ? `<span class="ac-chat-unread-badge">${unread > 9 ? '9+' : unread}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  _filterChatList(query) {
    const q = (query || '').toLowerCase();
    const items = document.querySelectorAll('#ac-chat-list .ac-chat-item');
    items.forEach(item => {
      const name = item.querySelector('strong')?.textContent?.toLowerCase() || '';
      item.style.display = !q || name.includes(q) ? '' : 'none';
    });
  }

  // ---- Abrir conversa ----

  async _openConversation(chatId) {
    const chat = this.chatList.find(c => c.id === chatId);
    if (!chat) return;

    this.activeChatId = chatId;
    this.activeChatData = chat.data;
    this._showChatView('conversation');
    this._ensureActiveChatPhoto();

    // Marca como lida
    if (this._getUnreadForChat(chatId) > 0) {
      await analystChatService.markAsRead(chatId);
    }

    // Limpa container
    const msgContainer = document.getElementById('ac-conv-messages');
    if (msgContainer) msgContainer.innerHTML = '<div class="text-center text-muted p-3"><div class="spinner-border spinner-border-sm"></div></div>';

    // Listener de mensagens
    if (this._chatUnsubMessages) this._chatUnsubMessages();
    this._chatUnsubMessages = analystChatService.onMessagesChanged(chatId, (messages) => {
      this._renderConversationMessages(messages);
      if (this.chatView === 'conversation'
          && this.activeChatId === chatId
          && this._getUnreadForChat(chatId) > 0) {
        analystChatService.markAsRead(chatId);
      }
    });
  }

  // ---- Renderizar mensagens da conversa ----

  _renderConversationMessages(messages) {
    const container = document.getElementById('ac-conv-messages');
    if (!container) return;
    const uid = analystChatService.currentUid();

    if (!messages || messages.length === 0) {
      container.innerHTML = '<div class="text-center text-muted p-3"><small>Nenhuma mensagem ainda. Diga ola!</small></div>';
      return;
    }

    let lastDate = '';
    const html = messages.map(msg => {
      const d = msg.data;
      const isMine = d.senderUid === uid;
      const time = d.createdAt ? this._formatTime(d.createdAt) : '';
      const dateStr = d.createdAt ? this._formatDate(d.createdAt) : '';

      let dateSep = '';
      if (dateStr && dateStr !== lastDate) {
        lastDate = dateStr;
        dateSep = `<div class="ac-msg-date-sep"><span>${dateStr}</span></div>`;
      }

      let content = '';
      if (d.type === 'image' && d.fileURL) {
        content = `<img src="${this._esc(d.fileURL)}" class="ac-msg-image" alt="Imagem" loading="lazy" />`;
      } else if (d.type === 'file' && d.fileURL) {
        content = `<a href="${this._esc(d.fileURL)}" target="_blank" class="ac-msg-file"><i class="bi bi-file-earmark"></i> ${this._esc(d.fileName || 'Arquivo')}</a>`;
      } else {
        content = `<span>${this._esc(d.text || '')}</span>`;
      }

      return `${dateSep}
        <div class="ac-msg ${isMine ? 'ac-msg-mine' : 'ac-msg-other'}">
          ${!isMine && this.activeChatData?.type === 'group' ? `<small class="ac-msg-sender">${this._esc(d.senderName || '')}</small>` : ''}
          <div class="ac-msg-bubble">
            ${content}
            <span class="ac-msg-time">${time}</span>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
  }

  // ---- Enviar mensagem no chat ----

  async _sendChatMessage() {
    const input = document.getElementById('ac-conv-input-field');
    const text = input?.value.trim();
    if (!text || !this.activeChatId) return;

    input.value = '';
    input.style.height = 'auto';

    try {
      await analystChatService.sendMessage(this.activeChatId, text);
      this._resetTypingStatus();
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    }
  }

  // ---- Upload de arquivo no chat ----

  async _handleChatFileUpload(e) {
    const file = e.target?.files[0];
    if (!file || !this.activeChatId) return;

    const canSend = confirm(`Enviar o anexo "${file.name}" para esta conversa?`);
    if (!canSend) {
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Arquivo muito grande. Maximo: 10MB');
      e.target.value = '';
      return;
    }

    try {
      const storageRef = firebase.storage().ref(`analystChat/${this.activeChatId}/${Date.now()}_${file.name}`);
      const uid = analystChatService.currentUid();
      const metadata = {
        customMetadata: {
          uploadedBy: uid || '',
          chatId: this.activeChatId,
        },
      };
      const snap = await storageRef.put(file, metadata);
      const url = await snap.ref.getDownloadURL();

      const type = file.type.startsWith('image/') ? 'image' : 'file';
      await analystChatService.sendMessage(this.activeChatId, '', {
        type,
        fileURL: url,
        fileName: file.name,
      });
    } catch (error) {
      console.error('Erro ao enviar arquivo:', error);
      alert('Erro ao enviar arquivo.');
    }

    e.target.value = '';
  }

  // ---- Typing indicator ----

  _handleTypingIndicator() {
    if (!this.activeChatId) return;

    if (!this._isTypingActive) {
      this._isTypingActive = true;
      analystChatService.setTypingStatus(this.activeChatId, true);
    }

    clearTimeout(this._typingTimeout);
    this._typingTimeout = setTimeout(() => {
      if (this.activeChatId && this._isTypingActive) {
        analystChatService.setTypingStatus(this.activeChatId, false);
      }
      this._isTypingActive = false;
    }, 3000);
  }

  // ---- Lista de usuarios (nova conversa / novo grupo) ----

  async _loadUserList(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Verifica autenticacao antes de tentar carregar
    const uid = analystChatService.currentUid();
    if (!uid) {
      container.innerHTML = '<div class="text-center text-warning p-3"><small><i class="bi bi-exclamation-triangle me-1"></i>Faca login para ver os usuarios</small></div>';
      return;
    }

    container.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm"></div></div>';

    try {
      const users = await analystChatService.listAvailableUsers();
      this._cachedUsers = users;
      this._renderUserList(users, containerId);
    } catch (error) {
      console.error('[Chat Interno] Erro ao carregar usuarios:', error);
      const msg = error?.code === 'permission-denied'
        ? 'Sem permissao para acessar usuarios'
        : 'Erro ao carregar usuarios. Verifique o console.';
      container.innerHTML = `<div class="text-center text-danger p-3"><small><i class="bi bi-exclamation-circle me-1"></i>${msg}</small></div>`;
    }
  }

  _renderUserList(users, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!users || users.length === 0) {
      container.innerHTML = '<div class="text-center text-muted p-3"><small>Nenhum usuario encontrado</small></div>';
      return;
    }

    const isGroupMode = containerId === 'ac-group-user-list';
    const selected = this._selectedGroupMembers || [];

    container.innerHTML = users.map(u => {
      const isSelected = isGroupMode && selected.includes(u.uid);
      const photo = this._getUserPhoto(u);
      return `
        <div class="ac-user-item ${isSelected ? 'ac-user-selected' : ''}" data-user-uid="${u.uid}" role="button" tabindex="0">
          <div class="ac-user-avatar">
            ${photo ? `<img src="${this._esc(photo)}" alt="" />` : `<i class="bi bi-person-circle"></i>`}
            ${u.online ? '<span class="ac-online-dot"></span>' : ''}
          </div>
          <div class="ac-user-info">
            <strong class="text-truncate d-block">${this._esc(u.displayName)}</strong>
            <small class="text-muted text-truncate d-block">${this._esc(u.email || u.role || '')}</small>
          </div>
          ${isGroupMode ? `<i class="bi ${isSelected ? 'bi-check-circle-fill text-primary' : 'bi-circle'} ms-auto"></i>` : ''}
        </div>
      `;
    }).join('');
  }

  _filterUserList(query, containerId) {
    const q = (query || '').toLowerCase();
    const users = (this._cachedUsers || []).filter(u =>
      !q || (u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    );
    this._renderUserList(users, containerId);
  }

  // ---- Iniciar conversa direta ----

  async _startDirectChat(otherUid) {
    try {
      const { id } = await analystChatService.getOrCreateDirectChat(otherUid);
      await this._openConversation(id);
    } catch (error) {
      console.error('Erro ao criar conversa:', error);
    }
  }

  // ---- Grupo ----

  _selectedGroupMembers = [];

  _toggleGroupMember(uid) {
    const idx = this._selectedGroupMembers.indexOf(uid);
    if (idx === -1) {
      this._selectedGroupMembers.push(uid);
    } else {
      this._selectedGroupMembers.splice(idx, 1);
    }
    this._renderGroupSelected();
    this._renderUserList(this._cachedUsers || [], 'ac-group-user-list');

    const createBtn = document.getElementById('ac-btn-create-group');
    if (createBtn) createBtn.disabled = this._selectedGroupMembers.length < 2;
  }

  _renderGroupSelected() {
    const container = document.getElementById('ac-group-selected');
    if (!container) return;

    if (this._selectedGroupMembers.length === 0) {
      container.classList.add('d-none');
      return;
    }
    container.classList.remove('d-none');

    const users = (this._cachedUsers || []).filter(u => this._selectedGroupMembers.includes(u.uid));
    container.innerHTML = users.map(u =>
      `<span class="badge bg-primary me-1 mb-1">${this._esc(u.displayName)} <i class="bi bi-x" data-remove-uid="${u.uid}" role="button"></i></span>`
    ).join('');

    // Remove listener
    container.querySelectorAll('[data-remove-uid]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleGroupMember(e.target.dataset.removeUid || e.target.closest('[data-remove-uid]').dataset.removeUid);
      });
    });
  }

  async _createGroup() {
    const name = document.getElementById('ac-group-name')?.value.trim() || 'Grupo';
    if (this._selectedGroupMembers.length < 2) return;

    try {
      const { id } = await analystChatService.createGroupChat(name, this._selectedGroupMembers);
      this._selectedGroupMembers = [];
      await this._openConversation(id);
    } catch (error) {
      console.error('Erro ao criar grupo:', error);
    }
  }

  async _showGroupSettings() {
    if (!this.activeChatData || this.activeChatData.type !== 'group') return;

    const nameInput = document.getElementById('ac-group-edit-name');
    const descInput = document.getElementById('ac-group-edit-description');
    const emojiInput = document.getElementById('ac-group-edit-emoji');
    const colorInput = document.getElementById('ac-group-edit-color');
    const searchInput = document.getElementById('ac-group-members-search');
    const participantIds = [...new Set(
      (this.activeChatData.participants || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )];
    const myUid = analystChatService.currentUid();
    if (myUid && !participantIds.includes(myUid)) {
      participantIds.unshift(myUid);
    }

    if (nameInput) nameInput.value = this.activeChatData.name || 'Grupo';
    if (descInput) descInput.value = this.activeChatData.groupDescription || '';
    if (emojiInput) emojiInput.value = this.activeChatData.groupEmoji || '👥';
    if (colorInput) colorInput.value = this._normalizeGroupColor(this.activeChatData.groupColor);
    if (searchInput) searchInput.value = '';

    this._groupSettingsMembers = participantIds;
    this._groupSettingsSearch = '';
    this._resetGroupAvatarDraft();

    if (!this._cachedUsers) {
      try {
        this._cachedUsers = await analystChatService.listAvailableUsers();
      // eslint-disable-next-line no-unused-vars
      } catch (error) {
        // Usa apenas participantes atuais como fallback
      }
    }

    this._showChatView('groupSettings');
    this._renderGroupAvatarControls();
    this._renderGroupPreview();
    this._renderGroupMembersManager();
  }

  _revokeGroupAvatarPreviewUrl() {
    if (this._groupSettingsAvatarPreviewUrl) {
      URL.revokeObjectURL(this._groupSettingsAvatarPreviewUrl);
      this._groupSettingsAvatarPreviewUrl = null;
    }
  }

  _resetGroupAvatarDraft() {
    this._groupSettingsAvatarFile = null;
    this._groupSettingsAvatarRemove = false;
    this._revokeGroupAvatarPreviewUrl();
    const input = document.getElementById('ac-group-avatar-input');
    if (input) input.value = '';
  }

  _getGroupSettingsAvatarPreviewUrl() {
    if (this._groupSettingsAvatarPreviewUrl) return this._groupSettingsAvatarPreviewUrl;
    if (this._groupSettingsAvatarRemove) return null;
    const avatar = (this.activeChatData?.groupAvatarUrl || '').toString().trim();
    return avatar || null;
  }

  _renderGroupAvatarControls() {
    const removeBtn = document.getElementById('ac-btn-group-avatar-remove');
    const hint = document.getElementById('ac-group-avatar-hint');
    if (!removeBtn || !hint) return;

    const hasAvatar = !!this._getGroupSettingsAvatarPreviewUrl();
    removeBtn.classList.toggle('d-none', !hasAvatar);

    if (this._groupSettingsAvatarFile) {
      hint.textContent = `Arquivo selecionado: ${this._groupSettingsAvatarFile.name}`;
    } else if (this._groupSettingsAvatarRemove) {
      hint.textContent = 'Foto removida. Salve para confirmar.';
    } else if (hasAvatar) {
      hint.textContent = 'Foto atual do grupo.';
    } else {
      hint.textContent = 'Use JPG ou PNG (ate 2MB).';
    }
  }

  _handleGroupAvatarSelection(e) {
    const input = e?.target;
    const file = input?.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith('image/')) {
      window.showNotification?.('Selecione um arquivo de imagem valido.', 'warning');
      input.value = '';
      return;
    }

    if (file.size > (2 * 1024 * 1024)) {
      window.showNotification?.('A foto do grupo deve ter no maximo 2MB.', 'warning');
      input.value = '';
      return;
    }

    this._groupSettingsAvatarFile = file;
    this._groupSettingsAvatarRemove = false;
    this._revokeGroupAvatarPreviewUrl();
    this._groupSettingsAvatarPreviewUrl = URL.createObjectURL(file);
    this._renderGroupAvatarControls();
    this._renderGroupPreview();
  }

  _removeGroupAvatarDraft() {
    const hadAvatar = !!this._getGroupSettingsAvatarPreviewUrl();
    if (!hadAvatar) return;
    this._groupSettingsAvatarFile = null;
    this._groupSettingsAvatarRemove = true;
    this._revokeGroupAvatarPreviewUrl();
    const input = document.getElementById('ac-group-avatar-input');
    if (input) input.value = '';
    this._renderGroupAvatarControls();
    this._renderGroupPreview();
  }

  _getGroupSettingsUserList() {
    const usersMap = new Map();

    (this._cachedUsers || []).forEach((user) => {
      const uid = String(user?.uid || '').trim();
      if (!uid) return;
      usersMap.set(uid, {
        uid,
        displayName: user.displayName || user.email || 'Usuario',
        email: user.email || '',
        photoURL: this._getUserPhoto(user),
        online: !!user.online,
      });
    });

    const myUid = analystChatService.currentUid();
    const myAuthData = analystChatService.currentUserData?.() || null;
    if (myUid && !usersMap.has(myUid)) {
      usersMap.set(myUid, {
        uid: myUid,
        displayName: this._resolveMyName(),
        email: myAuthData?.email || this._currentUserProfile?.email || '',
        photoURL: this._resolveMyAvatar() || myAuthData?.photoURL || null,
        online: true,
      });
    }

    const participantNames = this.activeChatData?.participantNames || {};
    const participantPhotos = this.activeChatData?.participantPhotos || {};

    (this._groupSettingsMembers || []).forEach((memberUidRaw) => {
      const memberUid = String(memberUidRaw || '').trim();
      if (!memberUid || usersMap.has(memberUid)) return;
      usersMap.set(memberUid, {
        uid: memberUid,
        displayName: participantNames[memberUid] || 'Usuario',
        email: '',
        photoURL: participantPhotos[memberUid] || null,
        online: false,
      });
    });

    return Array.from(usersMap.values())
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'pt-BR', { sensitivity: 'base' }));
  }

  _renderGroupMembersManager() {
    const selectedContainer = document.getElementById('ac-group-members-current');
    const candidatesContainer = document.getElementById('ac-group-members-candidates');
    if (!selectedContainer || !candidatesContainer) return;

    const normalizedMembers = [...new Set(
      (this._groupSettingsMembers || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )];
    this._groupSettingsMembers = normalizedMembers;

    const users = this._getGroupSettingsUserList();
    const userMap = new Map(users.map((user) => [user.uid, user]));
    const myUid = analystChatService.currentUid();

    if (!normalizedMembers.length) {
      selectedContainer.innerHTML = '<small class="text-muted">Nenhum membro selecionado.</small>';
    } else {
      selectedContainer.innerHTML = normalizedMembers.map((memberUid) => {
        const user = userMap.get(memberUid) || {
          uid: memberUid,
          displayName: this.activeChatData?.participantNames?.[memberUid] || 'Usuario',
          email: '',
          photoURL: this.activeChatData?.participantPhotos?.[memberUid] || null,
        };
        const isSelf = memberUid === myUid;
        return `
          <span class="ac-group-member-chip ${isSelf ? 'is-self' : ''}">
            <span class="ac-group-member-chip-avatar">
              ${user.photoURL ? `<img src="${this._esc(user.photoURL)}" alt="" />` : '<i class="bi bi-person-circle"></i>'}
            </span>
            <span class="text-truncate">${this._esc(user.displayName)}${isSelf ? ' (voce)' : ''}</span>
            ${isSelf ? '' : `
              <button type="button" class="ac-group-member-remove" data-remove-member-uid="${this._esc(memberUid)}" aria-label="Remover membro">
                <i class="bi bi-x-lg"></i>
              </button>
            `}
          </span>
        `;
      }).join('');
    }

    const query = (this._groupSettingsSearch || '').toLowerCase();
    const filteredUsers = users.filter((user) => {
      const name = (user.displayName || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      return !query || name.includes(query) || email.includes(query);
    });

    if (!filteredUsers.length) {
      candidatesContainer.innerHTML = '<div class="text-center text-muted p-3"><small>Nenhum usuario encontrado</small></div>';
      return;
    }

    candidatesContainer.innerHTML = filteredUsers.map((user) => {
      const isSelected = normalizedMembers.includes(user.uid);
      const isSelf = user.uid === myUid;
      const actionIcon = isSelf
        ? '<span class="badge text-bg-light">voce</span>'
        : `<i class="bi ${isSelected ? 'bi-check-circle-fill text-success' : 'bi-plus-circle'}"></i>`;
      const toggleAttrs = isSelf
        ? ''
        : `data-toggle-member-uid="${this._esc(user.uid)}" role="button" tabindex="0"`;

      return `
        <div class="ac-group-member-row ${isSelected ? 'is-selected' : ''} ${isSelf ? 'is-self' : ''}" ${toggleAttrs}>
          <div class="ac-group-member-avatar">
            ${user.photoURL ? `<img src="${this._esc(user.photoURL)}" alt="" />` : '<i class="bi bi-person-circle"></i>'}
            ${user.online ? '<span class="ac-online-dot"></span>' : ''}
          </div>
          <div class="ac-group-member-main">
            <strong class="d-block text-truncate">${this._esc(user.displayName)}</strong>
            <small class="text-muted d-block text-truncate">${this._esc(user.email || user.uid)}</small>
          </div>
          <div class="ac-group-member-action">${actionIcon}</div>
        </div>
      `;
    }).join('');
  }

  _toggleGroupMemberSetting(uid) {
    const memberUid = String(uid || '').trim();
    if (!memberUid) return;

    const myUid = analystChatService.currentUid();
    if (memberUid === myUid) {
      window.showNotification?.('Voce nao pode remover seu proprio usuario do grupo.', 'warning');
      return;
    }

    const nextMembers = [...new Set(
      (this._groupSettingsMembers || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )];
    const idx = nextMembers.indexOf(memberUid);

    if (idx >= 0) {
      if (nextMembers.length <= 2) {
        window.showNotification?.('O grupo precisa manter ao menos 2 membros.', 'warning');
        return;
      }
      nextMembers.splice(idx, 1);
    } else {
      nextMembers.push(memberUid);
    }

    this._groupSettingsMembers = nextMembers;
    this._renderGroupPreview();
    this._renderGroupMembersManager();
  }

  _renderGroupPreview() {
    const preview = document.getElementById('ac-group-preview');
    if (!preview) return;

    const name = document.getElementById('ac-group-edit-name')?.value?.trim() || 'Grupo';
    const emoji = document.getElementById('ac-group-edit-emoji')?.value?.trim() || '👥';
    const color = this._normalizeGroupColor(document.getElementById('ac-group-edit-color')?.value);
    const avatarUrl = this._getGroupSettingsAvatarPreviewUrl();
    const members = this._groupSettingsMembers?.length || (this.activeChatData?.participants || []).length || 0;
    const avatarHTML = this._getGroupAvatarHTML({
      groupEmoji: emoji,
      groupColor: color,
      groupAvatarUrl: avatarUrl,
    });

    preview.innerHTML = `
      <div class="ac-group-preview-card">
        ${avatarHTML}
        <div class="min-width-0">
          <div class="fw-semibold text-truncate small">${this._esc(name)}</div>
          <div class="text-muted small">${members} membro(s)</div>
        </div>
      </div>
    `;
  }

  async _saveGroupSettings() {
    if (!this.activeChatId || !this.activeChatData || this.activeChatData.type !== 'group') return;

    const name = document.getElementById('ac-group-edit-name')?.value?.trim() || '';
    const groupDescription = document.getElementById('ac-group-edit-description')?.value?.trim() || '';
    const groupEmoji = (document.getElementById('ac-group-edit-emoji')?.value?.trim() || '👥').slice(0, 4);
    const groupColor = this._normalizeGroupColor(document.getElementById('ac-group-edit-color')?.value);
    const myUid = analystChatService.currentUid();
    const memberUids = [...new Set(
      (this._groupSettingsMembers || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )];

    if (myUid && !memberUids.includes(myUid)) {
      memberUids.unshift(myUid);
    }

    if (!name) {
      window.showNotification?.('Informe o nome do grupo.', 'warning');
      return;
    }

    if (memberUids.length < 2) {
      window.showNotification?.('Selecione ao menos 2 membros para manter o grupo.', 'warning');
      return;
    }

    try {
      const avatarUpdates = {};
      if (this._groupSettingsAvatarFile) {
        const safeName = this._groupSettingsAvatarFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `analystChat/${this.activeChatId}/group_avatar_${Date.now()}_${safeName}`;
        const storageRef = firebase.storage().ref(path);
        const metadata = {
          customMetadata: {
            uploadedBy: myUid || '',
            chatId: this.activeChatId,
            fileKind: 'groupAvatar',
          },
        };
        const snap = await storageRef.put(this._groupSettingsAvatarFile, metadata);
        avatarUpdates.groupAvatarUrl = await snap.ref.getDownloadURL();
        avatarUpdates.groupAvatarPath = snap.ref.fullPath;
      } else if (this._groupSettingsAvatarRemove) {
        avatarUpdates.groupAvatarUrl = null;
        avatarUpdates.groupAvatarPath = null;
      }

      const updates = await analystChatService.updateGroupChat(this.activeChatId, {
        name,
        groupDescription,
        groupEmoji,
        groupColor,
        memberUids,
        ...avatarUpdates,
      });

      const mergedUpdates = {
        ...updates,
        participants: updates.participants || memberUids,
      };

      this.activeChatData = { ...this.activeChatData, ...mergedUpdates };
      const chatRef = this.chatList.find((c) => c.id === this.activeChatId);
      if (chatRef) {
        chatRef.data = { ...chatRef.data, ...mergedUpdates };
      }
      this._groupSettingsMembers = [...(mergedUpdates.participants || [])];

      this._renderChatList(this.chatList);
      this._updateChatHeader();
      this._showChatView('conversation');
      this._resetGroupAvatarDraft();
      window.showNotification?.('Grupo atualizado com sucesso.', 'success');
    } catch (error) {
      console.error('Erro ao salvar personalizacao do grupo:', error);
      window.showNotification?.(error?.message || 'Erro ao salvar personalizacao do grupo.', 'danger');
    }
  }

  // =========================================================================
  // Helpers & Utilitarios
  // =========================================================================

  _esc(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  _normalizeGroupColor(color) {
    const normalized = (color || '').toString().trim().toLowerCase();
    const allowed = ['primary', 'info', 'success', 'warning', 'danger', 'secondary'];
    return allowed.includes(normalized) ? normalized : 'primary';
  }

  _getGroupVisual(chatData) {
    const emoji = (chatData?.groupEmoji || '👥').toString().trim() || '👥';
    const color = this._normalizeGroupColor(chatData?.groupColor);
    const avatarUrl = (chatData?.groupAvatarUrl || '').toString().trim();
    return {
      emoji: emoji.slice(0, 4),
      color,
      avatarUrl: avatarUrl || null,
    };
  }

  _getGroupAvatarHTML(chatData, compact = false) {
    const visual = this._getGroupVisual(chatData);
    const compactClass = compact ? ' ac-group-avatar-header' : '';
    if (visual.avatarUrl) {
      return `<span class="ac-group-avatar ac-group-avatar-image${compactClass}"><img src="${this._esc(visual.avatarUrl)}" alt="" /></span>`;
    }
    return `<span class="ac-group-avatar ac-group-color-${this._esc(visual.color)}${compactClass}">${this._esc(visual.emoji)}</span>`;
  }

  _getChatDisplayName(chatData) {
    if (!chatData) return 'Chat';
    if (chatData.type === 'group') return chatData.name || 'Grupo';
    const uid = analystChatService.currentUid();
    const otherUid = (chatData.participants || []).find(p => p !== uid);

    // Prioridade 1: buscar nos usuarios cacheados (tem shortName/fullName)
    if (otherUid && this._cachedUsers) {
      const cachedUser = this._cachedUsers.find(u => u.uid === otherUid);
      if (cachedUser?.displayName) return cachedUser.displayName;
    }

    // Prioridade 2: nome salvo no documento da conversa
    const names = chatData.participantNames || {};
    return names[otherUid] || 'Usuario';
  }

  _getAvatarHTML(chatData, uid) {
    const photos = chatData.participantPhotos || {};
    const otherUid = (chatData.participants || []).find(p => p !== uid);
    const cachedUser = (this._cachedUsers || []).find(u => u.uid === otherUid);
    const photo = photos[otherUid] || this._getUserPhoto(cachedUser);
    if (photo) return `<img src="${this._esc(photo)}" alt="" />`;
    return '<i class="bi bi-person-circle"></i>';
  }

  _getUserPhoto(userData) {
    if (!userData) return null;
    return userData.avatarUrl || userData.photoURL || userData.fotoPerfil || null;
  }

  _getChatContactPhoto(chatData) {
    if (!chatData || chatData.type === 'group') return null;
    const uid = analystChatService.currentUid();
    const otherUid = (chatData.participants || []).find(p => p !== uid);
    if (!otherUid) return null;

    const chatPhoto = chatData.participantPhotos?.[otherUid];
    if (chatPhoto) return chatPhoto;

    const cachedUser = (this._cachedUsers || []).find(u => u.uid === otherUid);
    return this._getUserPhoto(cachedUser);
  }

  async _ensureActiveChatPhoto() {
    if (!this.activeChatData || this.activeChatData.type === 'group') return;

    const uid = analystChatService.currentUid();
    const otherUid = (this.activeChatData.participants || []).find(p => p !== uid);
    if (!otherUid) return;

    const existingPhoto = this.activeChatData.participantPhotos?.[otherUid];
    if (existingPhoto) return;

    let photo = null;
    const cachedUser = (this._cachedUsers || []).find(u => u.uid === otherUid);
    if (cachedUser) {
      photo = this._getUserPhoto(cachedUser);
    }

    if (!photo) {
      try {
        const userDoc = await db.collection('users').doc(otherUid).get();
        if (userDoc.exists) {
          photo = this._getUserPhoto(userDoc.data());
        }
      // eslint-disable-next-line no-unused-vars
      } catch (error) {
        // Silencia erro de fallback de avatar
      }
    }

    if (!photo) return;

    if (!this.activeChatData.participantPhotos) {
      this.activeChatData.participantPhotos = {};
    }
    this.activeChatData.participantPhotos[otherUid] = photo;

    const chatRef = this.chatList.find((c) => c.id === this.activeChatId);
    if (chatRef) {
      if (!chatRef.data.participantPhotos) {
        chatRef.data.participantPhotos = {};
      }
      chatRef.data.participantPhotos[otherUid] = photo;
    }

    this._updateChatHeader();
    if (this.activeTab === 'chat' && this.chatView === 'list') {
      this._renderChatList(this.chatList);
    }
  }

  _formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'agora';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;

    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'ontem';

    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  _formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return 'Hoje';

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Ontem';

    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  _getUnreadForChat(chatId) {
    const uid = analystChatService.currentUid();
    if (!uid || !chatId) return 0;
    const chat = this.chatList.find(c => c.id === chatId);
    return chat?.data?.unread?.[uid] || 0;
  }

  _resetTypingStatus() {
    clearTimeout(this._typingTimeout);
    if (this.activeChatId && this._isTypingActive) {
      analystChatService.setTypingStatus(this.activeChatId, false);
    }
    this._isTypingActive = false;
  }

  // =========================================================================
  // Sons de notificacao
  // =========================================================================

  /** Pre-carrega sons para evitar latencia na primeira reproducao */
  _preloadSounds() {
    const soundFiles = {
      message: 'sounds/message.mp3',
      newChat: 'sounds/new-chat.mp3',
      notification: 'sounds/notification.mp3',
    };

    for (const [key, path] of Object.entries(soundFiles)) {
      try {
        const audio = new Audio(path);
        audio.volume = 0.4;
        audio.preload = 'auto';
        this._sounds[key] = audio;
      // eslint-disable-next-line no-unused-vars
      } catch (err) {
        // Silencia - som nao essencial
      }
    }
  }

  /** Toca um som de notificacao */
  _playSound(soundName) {
    if (!this._soundEnabled) return;
    const audio = this._sounds[soundName];
    if (!audio) return;

    try {
      // Reseta para o inicio caso ainda esteja tocando
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Navegador pode bloquear autoplay antes de interacao do usuario
      });
    // eslint-disable-next-line no-unused-vars
    } catch (err) {
      // Silencia
    }
  }

  /**
   * Detecta novas mensagens comparando unread counts entre snapshots.
   * Toca som se houver aumento de nao lidas em algum chat.
   */
  _checkNewMessages(newChats) {
    const uid = analystChatService.currentUid();
    if (!uid) return;

    // Se nao tem lista anterior, armazena e sai (primeiro load)
    if (!this._prevChatUnreads) {
      this._prevChatUnreads = {};
      newChats.forEach(c => {
        this._prevChatUnreads[c.id] = c.data?.unread?.[uid] || 0;
      });
      return;
    }

    let hasNewMessage = false;
    let isNewChat = false;

    for (const chat of newChats) {
      const prevUnread = this._prevChatUnreads[chat.id] ?? 0;
      const currUnread = chat.data?.unread?.[uid] || 0;

      if (currUnread > prevUnread) {
        // Se e uma conversa que nao existia, e um novo chat
        if (!(chat.id in this._prevChatUnreads)) {
          isNewChat = true;
        } else {
          hasNewMessage = true;
        }
      }
    }

    // Verifica chats totalmente novos
    for (const chat of newChats) {
      if (!(chat.id in this._prevChatUnreads)) {
        isNewChat = true;
      }
    }

    // Atualiza mapa de unreads para proxima comparacao
    this._prevChatUnreads = {};
    newChats.forEach(c => {
      this._prevChatUnreads[c.id] = c.data?.unread?.[uid] || 0;
    });

    // Toca som se houver novidade (e nao estiver com a conversa aberta)
    if (isNewChat) {
      this._playSound('newChat');
    } else if (hasNewMessage) {
      // So toca se nao estiver olhando a conversa ativa
      const isViewingActiveChat = this.isOpen && this.activeTab === 'chat' && this.chatView === 'conversation';
      if (!isViewingActiveChat) {
        this._playSound('message');
      }
    }
  }

  // =========================================================================
  // API publica (retrocompatibilidade)
  // =========================================================================

  /** @deprecated use sendAIMessage */
  async sendMessage() { return this.sendAIMessage(); }

  /** Abre chat com mensagem pre-definida (AI) */
  openWithMessage(message) {
    this.open();
    this.switchTab('ai');
    this.aiInputField.value = message;
    this.aiInputField.focus();
  }

  /** Abre direto na aba Chat Interno */
  openChatInterno() {
    this.open();
    this.switchTab('chat');
  }

  /** Abre conversa direta com um usuario pelo UID */
  async openDirectChat(otherUid) {
    this.open();
    this.switchTab('chat');
    await this._startDirectChat(otherUid);
  }

  /** Notificacao visual (retrocompatibilidade) */
  showNotification() {
    if (this.isOpen && this.activeTab === 'ai') return;
    this.unreadCountAI++;
    this._updateGlobalBadge();
    const fab = document.getElementById('ai-chat-fab');
    fab?.classList.add('ai-chat-fab-pulse');
    setTimeout(() => fab?.classList.remove('ai-chat-fab-pulse'), 2000);
  }

  /** Atualiza badge do chat interno (chamado externamente) */
  async refreshChatBadge() {
    try {
      const count = await analystChatService.getTotalUnreadCount();
      this.unreadCountChat = count;
      this._updateGlobalBadge();
    // eslint-disable-next-line no-unused-vars
    } catch (error) { /* silencia */ }
  }

  /** Getter para total de nao lidas */
  get unreadCount() {
    return this.unreadCountAI + this.unreadCountChat;
  }

  /** Setter retrocompatibilidade */
  set unreadCount(val) {
    this.unreadCountAI = val;
  }

  /** Retrocompatibilidade: messagesContainer */
  get messagesContainer() { return this.aiMessagesContainer; }
  get inputField() { return this.aiInputField; }

  /** Retrocompatibilidade: updateBadge */
  updateBadge() { this._updateGlobalBadge(); }

  /** Retrocompatibilidade: addUserMessage */
  addUserMessage(msg) { this._addAIUserMessage(msg); }
  addAssistantMessage(resp) { this._addAIAssistantMessage(resp); }
  addFileMessage(file) { this._addAIFileMessage(file); }
  showTyping() { this._showAITyping(); }
  hideTyping() { this._hideAITyping(); }
  scrollToBottom() { this._scrollAI(); }
  formatMessageContent(c) { return this._formatAIContent(c); }
  renderSuggestions(s) { return this._renderSuggestions(s); }
  escapeHtml(t) { return this._esc(t); }
  handleFileSelection(e) { return this.handleAIFileSelection(e); }
  async clearConversation() { return this.clearAIConversation(); }
  async handleSuggestion(s) { this.aiInputField.value = s; await this.sendAIMessage(); }
}

// ---------------------------------------------------------------------------
// Singleton & auto-init
// ---------------------------------------------------------------------------

const aiChatUI = new AIChatUI();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => aiChatUI.init());
} else {
  aiChatUI.init();
}

window.aiChatUI = aiChatUI;

export default aiChatUI;
