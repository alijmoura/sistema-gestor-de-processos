/**
 * @file inlineSuggestFields.js
 * @description Implementa sugestões inline (autocomplete) para campos como Cartório e Agência
 * Similar ao vendorsInlineIntegration.js mas genérico para qualquer campo
 */

import agenciasService from './agenciasService.js';
import cartoriosService from './cartoriosService.js';

// Lista estática de cartórios (fallback)
const CARTORIOS_PADRAO = [
  "1º RI LONDRINA",
  "2º RI LONDRINA",
  "1º RI SÃO JOSÉ DOS PINHAIS",
  "2º RI SÃO JOSÉ DOS PINHAIS",
  "1º RI CURITIBA",
  "2º RI CURITIBA",
  "3º RI CURITIBA",
  "4º RI CURITIBA",
  "5º RI CURITIBA",
  "6º RI CURITIBA",
  "7º RI CURITIBA",
  "8º RI CURITIBA",
  "9º RI CURITIBA",
  "RI ARAUCARIA",
  "RI CAMPO LARGO",
  "RI FAZ. RIO GRANDE",
  "RI PINHAIS",
  "RI ALM.TAMANDARÉ",
  "RI PIRAQUARA",
  "RI COLOMBO",
  "RI CAMPO MAGRO",
  "RI CONTENDA",
  "RI LAPA",
  "RI QUATRO BARRAS",
  "RI CAMPINA GRANDE DO SUL",
  "RI RIO NEGRO",
  "RI BOCAIÚVA DO SUL",
  "RI CERRO AZUL",
  "RI RIO BRANCO DO SUL",
  "RI MATINHOS",
  "RI PONTAL DO PARANÁ",
  "RI PARANAGUA",
  "RI CACHOEIRINHA/RS",
  "3° RI PORTO ALEGRE"
];

class InlineSuggestFields {
  constructor() {
    this.cartorios = [];
    this.agencias = [];
    this.state = {
      activePanel: null,
      highlightIndex: -1,
      filtered: []
    };
  }

  /**
   * Fecha painel de sugestoes de um campo quando ele perde foco
   * (com pequeno delay para nao interromper clique em item da lista).
   */
  handleFieldBlur(input, panel) {
    setTimeout(() => {
      if (!input || !panel) return;
      const wrapper = input.closest('.inline-suggest-wrapper');
      const activeEl = document.activeElement;
      if (wrapper && activeEl && wrapper.contains(activeEl)) return;

      panel.hidden = true;
      this.state.highlightIndex = -1;
      if (!document.querySelector('.inline-suggest-wrapper .suggestions-panel:not([hidden])')) {
        this.state.activePanel = null;
      }
    }, 120);
  }

  /**
   * Inicializa os campos com sugestão inline
   */
  async init() {
    await this.loadAgencias();
    await this.loadCartorios();
    this.setupCartorioField();
    this.setupAgenciaField();
    this.setupGlobalClickHandler();
    
    if (window.__DEBUG__) {
      console.log('[InlineSuggest] Inicializado com', this.cartorios.length, 'cartórios e', this.agencias.length, 'agências');
    }
  }

  /**
   * Carrega agências do serviço (Firestore)
   */
  async loadAgencias() {
    try {
      if (agenciasService) {
        const agencias = await agenciasService.getAllAgencias();
        this.agencias = agencias
          .filter(a => a.ativo !== false)
          .map(a => ({
            id: a.id,
            display: `CEF AG ${a.codigo} - ${a.nome}`,
            codigo: a.codigo,
            nome: a.nome
          }));
      }
    } catch (err) {
      console.warn('[InlineSuggest] Erro ao carregar agências:', err);
    }
  }

  /**
   * Carrega cartórios do serviço (Firestore)
   */
  async loadCartorios() {
    try {
      if (cartoriosService) {
        const cartorios = await cartoriosService.getAllCartorios();
        this.cartorios = cartorios
          .filter(c => c.ativo !== false)
          .map(c => c.nome);
        
        console.log(` [InlineSuggest] ${this.cartorios.length} cartórios carregados para sugestão`);
      }
      
      // Fallback para lista padrão se Firestore estiver vazio
      if (this.cartorios.length === 0) {
        console.log(' [InlineSuggest] Usando lista padrão de cartórios (fallback)');
        this.cartorios = [...CARTORIOS_PADRAO];
      }
    } catch (err) {
      console.warn('[InlineSuggest] Erro ao carregar cartórios, usando fallback:', err);
      this.cartorios = [...CARTORIOS_PADRAO];
    }
  }

  /**
   * Atualiza lista de cartórios (chamado quando cartórios são modificados)
   */
  async refreshCartorios() {
    console.log(' [InlineSuggest] Atualizando lista de cartórios...');
    await this.loadCartorios();
  }

  /**
   * Configura o campo de Cartório (aceita múltiplos IDs)
   */
  setupCartorioField() {
    // Lista de IDs de campos cartório (modal detalhes e modal adicionar)
    const fieldIds = ['modal-cartorio', 'add-cartorio'];
    
    fieldIds.forEach(fieldId => {
      const input = document.getElementById(fieldId);
      if (!input || input.__inlineSuggestBound) return;

      // Se for select, não podemos usar - o HTML precisa ser alterado
      if (input.tagName === 'SELECT') {
        if (window.__DEBUG__) console.warn(`[InlineSuggest] Campo ${fieldId} é SELECT, precisa ser convertido para INPUT`);
        return;
      }

      const wrapper = input.closest('.inline-suggest-wrapper');
      const panel = wrapper?.querySelector('.suggestions-panel');
      const list = wrapper?.querySelector('.suggestions-list');

      if (!wrapper || !panel || !list) {
        if (window.__DEBUG__) console.warn(`[InlineSuggest] Estrutura do campo ${fieldId} incompleta`);
        return;
      }

      input.addEventListener('input', () => this.handleInput(input, panel, list, 'cartorio'));
      input.addEventListener('focus', () => this.showPanel(input, panel, list, 'cartorio'));
      input.addEventListener('keydown', (e) => this.handleKeydown(e, input, panel, list, 'cartorio'));
      input.addEventListener('blur', () => this.handleFieldBlur(input, panel));
      
      input.__inlineSuggestBound = true;
      
      if (window.__DEBUG__) console.log(` [InlineSuggest] Campo ${fieldId} configurado`);
    });
  }

  /**
   * Configura o campo de Agência
   */
  setupAgenciaField() {
    const input = document.getElementById('modal-agencia');
    if (!input || input.__inlineSuggestBound) return;

    // Se for select, não podemos usar
    if (input.tagName === 'SELECT') {
      if (window.__DEBUG__) console.warn('[InlineSuggest] Campo agencia é SELECT, precisa ser convertido para INPUT');
      return;
    }

    const wrapper = input.closest('.inline-suggest-wrapper');
    const panel = wrapper?.querySelector('.suggestions-panel');
    const list = wrapper?.querySelector('.suggestions-list');

    if (!wrapper || !panel || !list) {
      if (window.__DEBUG__) console.warn('[InlineSuggest] Estrutura do campo agencia incompleta');
      return;
    }

    input.addEventListener('input', () => this.handleInput(input, panel, list, 'agencia'));
    input.addEventListener('focus', () => this.showPanel(input, panel, list, 'agencia'));
    input.addEventListener('keydown', (e) => this.handleKeydown(e, input, panel, list, 'agencia'));
    input.addEventListener('blur', () => this.handleFieldBlur(input, panel));
    
    input.__inlineSuggestBound = true;
  }

  /**
   * Handler para input (digitação)
   */
  handleInput(input, panel, list, fieldType) {
    const query = (input.value || '').toLowerCase().trim();
    let items = fieldType === 'cartorio' ? this.cartorios : this.agencias.map(a => a.display);
    
    if (query) {
      items = items.filter(item => item.toLowerCase().includes(query));
    }

    this.state.filtered = items;
    this.state.highlightIndex = -1;
    this.renderSuggestions(list, items, input, panel);
    
    if (items.length > 0) {
      panel.hidden = false;
    } else {
      panel.hidden = true;
    }
  }

  /**
   * Mostra o painel de sugestões
   */
  showPanel(input, panel, list, fieldType) {
    this.state.activePanel = fieldType;
    let items = fieldType === 'cartorio' ? this.cartorios : this.agencias.map(a => a.display);
    
    const query = (input.value || '').toLowerCase().trim();
    if (query) {
      items = items.filter(item => item.toLowerCase().includes(query));
    }

    this.state.filtered = items;
    this.state.highlightIndex = -1;
    this.renderSuggestions(list, items, input, panel);
    panel.hidden = false;
  }

  /**
   * Esconde todos os painéis de sugestão
   */
  hideAllPanels() {
    document.querySelectorAll('.inline-suggest-wrapper .suggestions-panel').forEach(p => {
      p.hidden = true;
    });
    this.state.activePanel = null;
    this.state.highlightIndex = -1;
  }

  /**
   * Renderiza as sugestões na lista
   */
  renderSuggestions(list, items, input, panel) {
    list.innerHTML = '';
    
    if (items.length === 0) {
      const li = document.createElement('li');
      li.className = 'suggestion-item no-results';
      li.textContent = 'Nenhum resultado encontrado';
      list.appendChild(li);
      return;
    }

    items.slice(0, 15).forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'suggestion-item';
      if (index === this.state.highlightIndex) {
        li.classList.add('highlighted');
      }
      li.textContent = item;
      li.addEventListener('click', () => {
        input.value = item;
        panel.hidden = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      list.appendChild(li);
    });

    if (items.length > 15) {
      const li = document.createElement('li');
      li.className = 'suggestion-item more-results';
      li.textContent = `... e mais ${items.length - 15} resultados`;
      list.appendChild(li);
    }
  }

  /**
   * Handler para navegação por teclado
   */
  handleKeydown(e, input, panel, list) {
    if (panel.hidden) return;

    const items = list.querySelectorAll('.suggestion-item:not(.no-results):not(.more-results)');
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.state.highlightIndex = Math.min(this.state.highlightIndex + 1, items.length - 1);
        this.updateHighlight(items);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.state.highlightIndex = Math.max(this.state.highlightIndex - 1, -1);
        this.updateHighlight(items);
        break;
      case 'Enter':
        e.preventDefault();
        if (this.state.highlightIndex >= 0 && items[this.state.highlightIndex]) {
          input.value = items[this.state.highlightIndex].textContent;
          panel.hidden = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        break;
      case 'Escape':
        panel.hidden = true;
        this.state.highlightIndex = -1;
        break;
    }
  }

  /**
   * Atualiza o destaque visual
   */
  updateHighlight(items) {
    items.forEach((item, index) => {
      item.classList.toggle('highlighted', index === this.state.highlightIndex);
    });
    
    // Scroll into view
    if (this.state.highlightIndex >= 0 && items[this.state.highlightIndex]) {
      items[this.state.highlightIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Configura handler global para fechar ao clicar fora
   */
  setupGlobalClickHandler() {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.inline-suggest-wrapper')) {
        this.hideAllPanels();
      }
    });
  }

  /**
   * Atualiza lista de agências (chamado quando agências são modificadas)
   */
  async refreshAgencias() {
    await this.loadAgencias();
  }
}

// Instância singleton
const inlineSuggestFields = new InlineSuggestFields();

// Expõe globalmente para outros módulos
window.inlineSuggestFields = inlineSuggestFields;

function initWhenReady() {
  // Aguarda um pouco para garantir que outros módulos carregaram
  setTimeout(() => {
    inlineSuggestFields.init();
  }, 500);
}

// Inicialização quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWhenReady, { once: true });
} else {
  initWhenReady();
}

// Re-inicializa quando modais são abertos
document.addEventListener('shown.bs.modal', (e) => {
  if (e.target.id === 'details-modal' || e.target.id === 'add-contract-modal') {
    // Re-carrega cartórios para garantir que estão atualizados
    inlineSuggestFields.refreshCartorios().then(() => {
      inlineSuggestFields.setupCartorioField();
      inlineSuggestFields.setupAgenciaField();
    });
  }
});

export { inlineSuggestFields };
export default inlineSuggestFields;
