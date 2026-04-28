/**
 *  CSRF Protection Service
 * Proteção contra Cross-Site Request Forgery
 */

const CSRF_TOKEN_KEY = '__csrf_token__';
const CSRF_TOKEN_EXPIRY_MS = 3600000; // 1 hora

class CsrfProtectionService {
  constructor() {
    this.tokens = new Map();
    this.initializeToken();
  }

  /**
   * Inicializa token CSRF na sessão
   */
  initializeToken() {
    const stored = sessionStorage.getItem(CSRF_TOKEN_KEY);
    if (stored) {
      try {
        const { token, expiry } = JSON.parse(stored);
        if (Date.now() < expiry) {
          this.currentToken = token;
          return;
        }
      } catch {
        console.warn(' Token CSRF inválido no sessionStorage');
      }
    }
    this.refreshToken();
  }

  /**
   * Gera novo token CSRF
   */
  generateToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Atualiza token CSRF
   */
  refreshToken() {
    this.currentToken = this.generateToken();
    const expiry = Date.now() + CSRF_TOKEN_EXPIRY_MS;
    
    sessionStorage.setItem(CSRF_TOKEN_KEY, JSON.stringify({
      token: this.currentToken,
      expiry
    }));
    
    console.log(' Novo token CSRF gerado');
  }

  /**
   * Obtém token atual
   * @returns {string} Token CSRF
   */
  getToken() {
    // Verifica expiração
    const stored = sessionStorage.getItem(CSRF_TOKEN_KEY);
    if (stored) {
      try {
        const { expiry } = JSON.parse(stored);
        if (Date.now() >= expiry) {
          this.refreshToken();
        }
      } catch {
        this.refreshToken();
      }
    }
    return this.currentToken;
  }

  /**
   * Valida token CSRF
   * @param {string} token - Token a validar
   * @returns {boolean} true se válido
   */
  validateToken(token) {
    if (!token || !this.currentToken) {
      console.warn(' Token CSRF ausente');
      return false;
    }
    
    if (token !== this.currentToken) {
      console.warn(' Token CSRF inválido');
      return false;
    }
    
    return true;
  }

  /**
   * Adiciona token CSRF a um formulário
   * @param {HTMLFormElement} form - Formulário
   */
  protectForm(form) {
    if (!form || !(form instanceof HTMLFormElement)) {
      console.warn(' Elemento inválido para proteção CSRF');
      return;
    }

    // Remove token existente se houver
    const existingToken = form.querySelector('input[name="__csrf_token"]');
    if (existingToken) {
      existingToken.remove();
    }

    // Adiciona novo token
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = '__csrf_token';
    input.value = this.getToken();
    form.appendChild(input);
  }

  /**
   * Valida token CSRF de um formulário
   * @param {HTMLFormElement|FormData} formOrData - Formulário ou FormData
   * @returns {boolean} true se válido
   */
  validateForm(formOrData) {
    let token;
    
    if (formOrData instanceof FormData) {
      token = formOrData.get('__csrf_token');
    } else if (formOrData instanceof HTMLFormElement) {
      const formData = new FormData(formOrData);
      token = formData.get('__csrf_token');
    } else {
      console.warn(' Tipo inválido para validação CSRF');
      return false;
    }

    return this.validateToken(token);
  }

  /**
   * Adiciona token CSRF a headers de requisição
   * @param {Object} headers - Headers existentes
   * @returns {Object} Headers com token CSRF
   */
  addToHeaders(headers = {}) {
    return {
      ...headers,
      'X-CSRF-Token': this.getToken()
    };
  }

  /**
   * Valida token CSRF de headers
   * @param {Headers|Object} headers - Headers da requisição
   * @returns {boolean} true se válido
   */
  validateHeaders(headers) {
    let token;
    
    if (headers instanceof Headers) {
      token = headers.get('X-CSRF-Token');
    } else if (typeof headers === 'object') {
      token = headers['X-CSRF-Token'] || headers['x-csrf-token'];
    }

    return this.validateToken(token);
  }

  /**
   * Protege automaticamente todos os formulários da página
   */
  protectAllForms() {
    const forms = document.querySelectorAll('form[data-csrf-protect]');
    forms.forEach(form => {
      this.protectForm(form);
      
      // Valida antes de submeter
      form.addEventListener('submit', (e) => {
        if (!this.validateForm(form)) {
          e.preventDefault();
          console.error(' Validação CSRF falhou - submissão bloqueada');
          alert('Erro de segurança: token CSRF inválido. Por favor, recarregue a página.');
        }
      });
    });
  }

  /**
   * Intercepta fetch para adicionar token CSRF automaticamente
   */
  enableFetchInterceptor() {
    const originalFetch = window.fetch;
    const self = this;
    
    window.fetch = function(url, options = {}) {
      // Apenas para métodos que modificam dados
      const method = (options.method || 'GET').toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        options.headers = self.addToHeaders(options.headers);
      }
      
      return originalFetch.call(this, url, options);
    };
    
    console.log(' Interceptor CSRF ativado para fetch');
  }
}

// Instância singleton
const csrfProtection = new CsrfProtectionService();

// Auto-inicialização quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    csrfProtection.protectAllForms();
  });
} else {
  csrfProtection.protectAllForms();
}

// Exporta para uso em módulos
export default csrfProtection;

// Também disponibiliza globalmente
if (typeof window !== 'undefined') {
  window.csrfProtection = csrfProtection;
}
