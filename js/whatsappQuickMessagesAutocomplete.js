/**
 * WhatsApp Quick Messages Autocomplete
 * Detecta "/" no textarea e exibe sugestões de mensagens rápidas
 * Navegação com setas, Enter para inserir, ESC para fechar
 * Processa variáveis em tempo real com contexto do chat
 *
 * @version 1.0.0
 * @author GitHub Copilot
 */

class WhatsAppQuickMessagesAutocomplete {
  constructor() {
    this.isActive = false;
    this.currentQuery = '';
    this.suggestions = [];
    this.selectedIndex = 0;
    this.startPosition = 0;
    
    // Elementos DOM
    this.textarea = null;
    this.dropdown = null;
    
    // Backend
    this.quickMessagesBackend = null;
    
    // Contexto do chat atual
    this.currentChatContext = null;
    
  if (window.__DEBUG__) console.log('[WhatsAppQuickMessagesAutocomplete] Módulo carregado');
  }

  /**
   * Inicializa o autocomplete
   */
  async init(textareaElement) {
    if (!textareaElement) {
      console.error('[WhatsAppQuickMessagesAutocomplete] Textarea não fornecido');
      return false;
    }

    this.textarea = textareaElement;
    
    // Verificar backend
    this.quickMessagesBackend = window.__WHATSAPP_QUICK_MESSAGES__;
    if (!this.quickMessagesBackend) {
      console.error('[WhatsAppQuickMessagesAutocomplete] Backend de quick messages não disponível');
      return false;
    }

    // Criar dropdown
    this.createDropdown();
    
    // Configurar event listeners
    this.setupEventListeners();
    
  if (window.__DEBUG__) console.log('[WhatsAppQuickMessagesAutocomplete] Inicializado com sucesso');
    return true;
  }

  /**
   * Cria elemento dropdown para sugestões
   */
  createDropdown() {
    // Remover dropdown existente se houver
    const existing = document.getElementById('quick-messages-autocomplete');
    if (existing) {
      existing.remove();
    }

    // Criar novo dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.id = 'quick-messages-autocomplete';
    this.dropdown.className = 'quick-messages-autocomplete-dropdown';
    this.dropdown.style.display = 'none';
    
    // Inserir após o textarea
    this.textarea.parentNode.insertBefore(this.dropdown, this.textarea.nextSibling);
    
    // Estilos inline (podem ser movidos para CSS depois)
    Object.assign(this.dropdown.style, {
      position: 'absolute',
      backgroundColor: '#fff',
      border: '1px solid #ddd',
      borderRadius: '4px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      maxHeight: '300px',
      overflowY: 'auto',
      zIndex: '9999',
      minWidth: '300px',
      maxWidth: '500px'
    });
  }

  /**
   * Configura event listeners
   */
  setupEventListeners() {
    // Input no textarea
    this.textarea.addEventListener('input', (e) => {
      this.handleInput(e);
      this.autoResize();
    });
    
    // Teclas especiais
    this.textarea.addEventListener('keydown', (e) => this.handleKeyDown(e));
    
    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
      if (!this.dropdown.contains(e.target) && e.target !== this.textarea) {
        this.close();
      }
    });
    
    // Auto-resize inicial
    this.autoResize();
  }
  
  /**
   * Auto-resize do textarea baseado no conteúdo
   */
  autoResize() {
    if (!this.textarea) return;
    
    // Reset height para calcular scrollHeight corretamente
    this.textarea.style.height = 'auto';
    
    // Calcular nova altura (min 1 linha, max 120px)
    const newHeight = Math.min(this.textarea.scrollHeight, 120);
    this.textarea.style.height = newHeight + 'px';
    
    // Habilitar scroll se exceder max-height
    if (this.textarea.scrollHeight > 120) {
      this.textarea.style.overflowY = 'auto';
    } else {
      this.textarea.style.overflowY = 'hidden';
    }
  }

  /**
   * Processa input do textarea
   */
  async handleInput() {
    const text = this.textarea.value;
    const cursorPos = this.textarea.selectionStart;
    
    // Buscar "/" antes do cursor
    const textBeforeCursor = text.substring(0, cursorPos);
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/');
    
    // Verificar se "/" é o início de uma palavra (não no meio)
    if (lastSlashIndex === -1) {
      this.close();
      return;
    }

    const charBeforeSlash = lastSlashIndex > 0 ? textBeforeCursor[lastSlashIndex - 1] : ' ';
    const isStartOfWord = charBeforeSlash === ' ' || charBeforeSlash === '\n';
    
    if (!isStartOfWord) {
      this.close();
      return;
    }

    // Extrair query (texto após "/")
    const query = textBeforeCursor.substring(lastSlashIndex + 1);
    
    // Verificar se não há espaço após "/" (ainda digitando o atalho)
    if (query.includes(' ') || query.includes('\n')) {
      this.close();
      return;
    }

    // Atualizar estado
    this.currentQuery = query.toLowerCase();
    this.startPosition = lastSlashIndex;
    
    // Buscar sugestões
    await this.searchSuggestions();
    
    // Exibir dropdown se houver sugestões
    if (this.suggestions.length > 0) {
      this.show();
    } else {
      this.close();
    }
  }

  /**
   * Busca sugestões de mensagens rápidas
   */
  async searchSuggestions() {
    try {
      // Buscar mensagens que correspondem ao query
      const allMessages = await this.quickMessagesBackend.searchQuickMessages(
        this.currentQuery,
        null, // sem filtro de departamento
        10    // máximo 10 sugestões
      );
      
      this.suggestions = allMessages.filter(msg => msg.isActive);
      this.selectedIndex = 0; // Reset seleção
      
      if (window.__DEBUG__) {
        console.log(`[WhatsAppQuickMessagesAutocomplete] ${this.suggestions.length} sugestões encontradas`);
      }
    } catch (error) {
      console.error('[WhatsAppQuickMessagesAutocomplete] Erro ao buscar sugestões:', error);
      this.suggestions = [];
    }
  }

  /**
   * Processa teclas especiais
   */
  handleKeyDown(event) {
    if (!this.isActive) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectNext();
        break;
        
      case 'ArrowUp':
        event.preventDefault();
        this.selectPrevious();
        break;
        
      case 'Enter':
        if (this.suggestions.length > 0) {
          event.preventDefault();
          this.insertSelectedMessage();
        }
        break;
        
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
        
      case 'Tab':
        if (this.suggestions.length > 0) {
          event.preventDefault();
          this.insertSelectedMessage();
        }
        break;
    }
  }

  /**
   * Seleciona próxima sugestão
   */
  selectNext() {
    this.selectedIndex = (this.selectedIndex + 1) % this.suggestions.length;
    this.renderSuggestions();
  }

  /**
   * Seleciona sugestão anterior
   */
  selectPrevious() {
    this.selectedIndex = this.selectedIndex - 1;
    if (this.selectedIndex < 0) {
      this.selectedIndex = this.suggestions.length - 1;
    }
    this.renderSuggestions();
  }

  /**
   * Insere mensagem selecionada no textarea
   */
  async insertSelectedMessage() {
    if (this.suggestions.length === 0) return;

    const selectedMessage = this.suggestions[this.selectedIndex];
    
    try {
      // Processar variáveis
      const processedText = await this.processMessageText(selectedMessage.text);
      
      // Substituir "/{query}" pelo texto processado
      const currentText = this.textarea.value;
      const beforeSlash = currentText.substring(0, this.startPosition);
      const afterQuery = currentText.substring(this.textarea.selectionStart);
      
      const newText = beforeSlash + processedText + afterQuery;
      this.textarea.value = newText;
      
      // Posicionar cursor após o texto inserido
      const newCursorPos = beforeSlash.length + processedText.length;
      this.textarea.setSelectionRange(newCursorPos, newCursorPos);
      
      // Focar textarea
      this.textarea.focus();
      
      // Incrementar contador de uso
      await this.quickMessagesBackend.incrementUsageCount(selectedMessage.id);
      
      if (window.__DEBUG__) {
        console.log(`[WhatsAppQuickMessagesAutocomplete] Mensagem "${selectedMessage.shortcut}" inserida`);
      }
      
      // Fechar dropdown
      this.close();
      
    } catch (error) {
      console.error('[WhatsAppQuickMessagesAutocomplete] Erro ao inserir mensagem:', error);
    }
  }

  /**
   * Processa texto da mensagem substituindo variáveis
   */
  async processMessageText(text) {
    // Obter contexto do chat atual
    const context = await this.getChatContext();
    
    // Usar backend para processar
    return this.quickMessagesBackend.processMessageText(text, context);
  }

  /**
   * Obtém contexto do chat atual
   */
  async getChatContext() {
    // Se já tem contexto em cache, usar
    if (this.currentChatContext) {
      return this.currentChatContext;
    }

    // Tentar obter do WhatsApp UI
    const whatsappUI = window.__WHATSAPP_UI__;
    if (!whatsappUI) {
      return this.getDefaultContext();
    }

    const chatId = whatsappUI.getCurrentChatId();
    if (!chatId) {
      return this.getDefaultContext();
    }

    // Buscar dados do chat diretamente do Firestore
    try {
      const db = firebase.firestore();
      if (!db) {
        return this.getDefaultContext();
      }

      const chatDoc = await db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) {
        return this.getDefaultContext();
      }

      const chat = chatDoc.data();

      // Obter nome do agente (usuário logado)
      // Sistema armazena perfil em appState.currentUserProfile (ver main.js linha 125)
      const currentUser = window.appState?.currentUserProfile || {};
      const firebaseUser = firebase.auth().currentUser;
      
      // Prioridade: 1) shortName (campo dedicado) 2) fallback para fullName processado 3) Firebase Auth
      const agentName = currentUser.shortName?.trim() 
        || this.extractShortName(currentUser.fullName || firebaseUser?.displayName || firebaseUser?.email?.split('@')[0] || 'Atendente');

      // Montar contexto
      this.currentChatContext = {
        customerName: chat.customerName || chat.phoneNumber || chat.numero || 'Cliente',
        agentName: agentName,
        department: chat.department || 'Geral',
        date: new Date().toLocaleDateString('pt-BR'),
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };

      return this.currentChatContext;

    } catch (error) {
      console.warn('[WhatsAppQuickMessagesAutocomplete] Erro ao obter contexto do chat:', error);
      return this.getDefaultContext();
    }
  }

  /**
   * Retorna contexto padrão quando não há chat ativo
   */
  getDefaultContext() {
    const currentUser = window.appState?.currentUserProfile || {};
    const firebaseUser = firebase.auth().currentUser;
    
    // Prioridade: 1) shortName (campo dedicado) 2) fallback para fullName processado 3) Firebase Auth
    const agentName = currentUser.shortName?.trim() 
      || this.extractShortName(currentUser.fullName || firebaseUser?.displayName || firebaseUser?.email?.split('@')[0] || 'Atendente');
    
    return {
      customerName: 'Cliente',
      agentName: agentName,
      department: 'Geral',
      date: new Date().toLocaleDateString('pt-BR'),
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
  }

  /**
   * Extrai primeiro nome ou "primeiro + último" nome
   * Exemplos: "João Silva Santos" → "João Santos"
   *           "Maria" → "Maria"
   *           "Pedro Paulo" → "Pedro Paulo"
   * @param {string} fullName - Nome completo
   * @returns {string} - Primeiro nome ou primeiro + último
   */
  extractShortName(fullName) {
    if (!fullName || typeof fullName !== 'string') {
      return 'Atendente';
    }

    const nameParts = fullName.trim().split(/\s+/); // Remove espaços extras e divide
    
    if (nameParts.length === 0) {
      return 'Atendente';
    }
    
    if (nameParts.length === 1) {
      // Apenas um nome: retorna ele
      return nameParts[0];
    }
    
    // Dois ou mais nomes: retorna primeiro + último
    return `${nameParts[0]} ${nameParts[nameParts.length - 1]}`;
  }

  /**
   * Limpa cache de contexto (chamar ao trocar de chat)
   */
  clearContextCache() {
    this.currentChatContext = null;
  }

  /**
   * Renderiza lista de sugestões
   */
  renderSuggestions() {
    if (this.suggestions.length === 0) {
      this.dropdown.innerHTML = '<div class="p-2 text-muted small">Nenhuma mensagem encontrada</div>';
      return;
    }

    const html = this.suggestions.map((msg, index) => {
      const isSelected = index === this.selectedIndex;
      const textPreview = msg.text.length > 60 
        ? msg.text.substring(0, 60) + '...' 
        : msg.text;

      return `
        <div class="autocomplete-item ${isSelected ? 'selected' : ''}" 
             data-index="${index}"
             style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee; transition: background-color 0.2s; ${isSelected ? 'background-color: #e3f2fd;' : ''}">
          <div class="d-flex align-items-center">
            <code class="me-2" style="font-size: 0.9rem; color: #0d6efd;">/${msg.shortcut}</code>
            ${msg.department ? `<span class="badge bg-secondary me-2" style="font-size: 0.7rem;">${msg.department}</span>` : ''}
            ${msg.usageCount > 0 ? `<span class="text-muted small me-2">${msg.usageCount} usos</span>` : ''}
          </div>
          <div class="text-muted small mt-1">${this.escapeHtml(textPreview)}</div>
        </div>
      `;
    }).join('');

    this.dropdown.innerHTML = html;
    
    // Adicionar event listeners aos itens
    this.dropdown.querySelectorAll('.autocomplete-item').forEach((item, index) => {
      // Hover
      item.addEventListener('mouseenter', () => {
        // Remover seleção anterior
        this.dropdown.querySelectorAll('.autocomplete-item').forEach(i => {
          i.classList.remove('selected');
          i.style.backgroundColor = 'transparent';
        });
        
        // Adicionar nova seleção
        item.classList.add('selected');
        item.style.backgroundColor = '#e3f2fd';
        this.selectedIndex = index;
      });
      
      // Click
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectByIndex(index);
      });
    });
  }

  /**
   * Seleciona sugestão por índice (click no item)
   */
  selectByIndex(index) {
    this.selectedIndex = index;
    this.insertSelectedMessage();
  }

  /**
   * Exibe dropdown
   */
  show() {
    this.isActive = true;
    this.positionDropdown();
    this.renderSuggestions();
    this.dropdown.style.display = 'block';
  }

  /**
   * Posiciona dropdown perto do cursor
   */
  positionDropdown() {
    // Obter posição do textarea
    const textareaRect = this.textarea.getBoundingClientRect();
    
    // Calcular posição aproximada do cursor
    // Como é difícil calcular posição exata, posicionar abaixo do textarea
    this.dropdown.style.position = 'fixed';
    this.dropdown.style.left = `${textareaRect.left}px`;
    this.dropdown.style.top = `${textareaRect.bottom + 5}px`;
    this.dropdown.style.width = `${Math.min(textareaRect.width, 500)}px`;
  }

  /**
   * Fecha dropdown
   */
  close() {
    this.isActive = false;
    this.dropdown.style.display = 'none';
    this.suggestions = [];
    this.currentQuery = '';
    this.selectedIndex = 0;
  }

  /**
   * Escapa HTML para prevenir XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Destrói instância (cleanup)
   */
  destroy() {
    if (this.dropdown) {
      this.dropdown.remove();
    }
    this.textarea = null;
    this.quickMessagesBackend = null;
  if (window.__DEBUG__) console.log('[WhatsAppQuickMessagesAutocomplete] Instância destruída');
  }
}

// Exportar globalmente
window.WhatsAppQuickMessagesAutocomplete = WhatsAppQuickMessagesAutocomplete;
window.__WHATSAPP_QUICK_MESSAGES_AUTOCOMPLETE__ = null; // Será instanciado quando necessário

if (window.__DEBUG__) console.log('[whatsappQuickMessagesAutocomplete] Módulo exportado globalmente');
