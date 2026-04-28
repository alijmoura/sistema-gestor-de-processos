/**
 *  SEGURANÇA: Utilitários de sanitização e validação
 * Protege contra XSS, injection e outros ataques comuns
 */

/**
 * Escapa caracteres HTML perigosos para prevenir XSS
 * @param {string} text - Texto a ser escapado
 * @returns {string} Texto seguro para inserção em HTML
 */
export function escapeHtml(text) {
  if (text == null || text === '') return '';
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  
  return String(text).replace(/[&<>"'/]/g, char => map[char]);
}

/**
 * Remove tags HTML de uma string
 * @param {string} html - HTML a ser limpo
 * @returns {string} Texto sem tags HTML
 */
export function stripHtml(html) {
  if (html == null || html === '') return '';
  const tmp = document.createElement('div');
  tmp.textContent = html;
  return tmp.textContent || tmp.innerText || '';
}

/**
 * Sanitiza URL para prevenir javascript: e data: URIs maliciosos
 * @param {string} url - URL a ser validada
 * @returns {string} URL segura ou '#' se inválida
 */
export function sanitizeUrl(url) {
  if (!url) return '#';
  
  const urlStr = String(url).trim().toLowerCase();
  
  // Bloqueia protocolos perigosos
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
  if (dangerousProtocols.some(proto => urlStr.startsWith(proto))) {
    console.warn(' URL perigosa bloqueada:', url);
    return '#';
  }
  
  return url;
}

/**
 * Valida email com regex básico
 * @param {string} email - Email a ser validado
 * @returns {boolean} true se válido
 */
export function isValidEmail(email) {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(email).toLowerCase());
}

/**
 * Sanitiza nome de arquivo removendo caracteres perigosos
 * @param {string} filename - Nome do arquivo
 * @returns {string} Nome seguro
 */
export function sanitizeFilename(filename) {
  if (!filename) return 'file';
  return String(filename)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
}

/**
 * Cria elemento HTML de forma segura
 * @param {string} tag - Tag HTML
 * @param {Object} attrs - Atributos (serão escapados)
 * @param {string} content - Conteúdo de texto (será escapado)
 * @returns {HTMLElement} Elemento criado
 */
export function createSafeElement(tag, attrs = {}, content = '') {
  const el = document.createElement(tag);
  
  // Define atributos de forma segura
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'href' || key === 'src') {
      el.setAttribute(key, sanitizeUrl(value));
    } else if (key === 'class') {
      el.className = String(value);
    } else if (key.startsWith('data-')) {
      el.setAttribute(key, String(value));
    } else if (key === 'id') {
      el.id = String(value);
    } else {
      // Outros atributos: apenas string segura
      el.setAttribute(key, escapeHtml(String(value)));
    }
  });
  
  // Define conteúdo de texto de forma segura
  if (content) {
    el.textContent = content;
  }
  
  return el;
}

/**
 * Valida e sanitiza JSON input
 * @param {string} jsonStr - String JSON
 * @returns {Object|null} Objeto parseado ou null se inválido
 */
export function safeJsonParse(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn(' JSON inválido:', e);
    return null;
  }
}

/**
 * Gera token CSRF simples para formulários
 * @returns {string} Token CSRF
 */
export function generateCsrfToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Valida token CSRF
 * @param {string} token - Token a validar
 * @param {string} storedToken - Token armazenado
 * @returns {boolean} true se válido
 */
export function validateCsrfToken(token, storedToken) {
  if (!token || !storedToken) return false;
  return token === storedToken;
}

/**
 * Wrapper seguro para innerHTML - valida e sanitiza
 * @param {HTMLElement} element - Elemento alvo
 * @param {string} html - HTML a inserir
 * @param {boolean} allowBasicTags - Se true, permite tags seguras (<b>, <i>, <p>, etc)
 */
export function safeInnerHTML(element, html, allowBasicTags = false) {
  if (!element) return;
  
  if (!html) {
    element.innerHTML = '';
    return;
  }
  
  if (!allowBasicTags) {
    // Modo mais seguro: apenas texto
    element.textContent = stripHtml(html);
  } else {
    // Permite tags básicas seguras
    const allowedTags = ['b', 'i', 'em', 'strong', 'p', 'br', 'span', 'div', 'ul', 'ol', 'li', 'small'];
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    
    // Remove scripts e event handlers
    const scripts = tmp.querySelectorAll('script, link, style');
    scripts.forEach(s => s.remove());
    
    // Remove event handlers
    const allElements = tmp.querySelectorAll('*');
    allElements.forEach(el => {
      // Remove atributos on*
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
      });
      
      // Remove tags não permitidas
      if (!allowedTags.includes(el.tagName.toLowerCase())) {
        el.replaceWith(...el.childNodes);
      }
    });
    
    element.innerHTML = tmp.innerHTML;
  }
}

// Exporta todas as funções como objeto também
export default {
  escapeHtml,
  stripHtml,
  sanitizeUrl,
  isValidEmail,
  sanitizeFilename,
  createSafeElement,
  safeJsonParse,
  generateCsrfToken,
  validateCsrfToken,
  safeInnerHTML
};
