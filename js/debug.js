// debug.js - Sistema centralizado de logging com níveis (modo global, sem ES modules)
// Changelog (05/12/2025): Adicionado níveis de log e filtragem por categoria
(function(){
  // Níveis de log: 0=off, 1=error, 2=warn, 3=info, 4=debug, 5=verbose
  if (window.__DEBUG_LEVEL__ === undefined) {
    window.__DEBUG_LEVEL__ = 3; // Padrão: info (sem debug/verbose em produção)
  }
  
  // Flag de debug legado (mantido para compatibilidade)
  if (window.__DEBUG__ === undefined) {
    window.__DEBUG__ = false;
  }
  
  // Categorias que podem ser filtradas
  if (window.__DEBUG_CATEGORIES__ === undefined) {
    window.__DEBUG_CATEGORIES__ = {
      cache: false,     // Logs do cacheService
      firestore: false, // Logs de leituras Firestore
      ui: false,        // Logs de UI/render
      whatsapp: false,  // Logs de WhatsApp
      perf: true,       // Performance (ativo por padrão)
      nav: false,       // Navegação
      auth: true,       // Autenticação
      '*': false        // Wildcard para todos
    };
  }
  
  // Função para verificar se categoria está ativa
  function isCategoryEnabled(category) {
    if (!category) return window.__DEBUG__;
    if (window.__DEBUG_CATEGORIES__['*']) return true;
    return window.__DEBUG_CATEGORIES__[category] || window.__DEBUG__;
  }
  
  // Factory com níveis
  function createLogger(level, method, emoji = '') {
    return function(category, ...args) {
      // Se primeiro arg não é categoria conhecida, trata como mensagem
      if (typeof category === 'string' && !Object.prototype.hasOwnProperty.call(window.__DEBUG_CATEGORIES__, category)) {
        args.unshift(category);
        category = '*';
      }
      
      const effectiveLevel = window.__DEBUG__ ? 5 : window.__DEBUG_LEVEL__;
      if (level <= effectiveLevel && isCategoryEnabled(category)) {
        const prefix = emoji ? `${emoji} ` : '';
        method.apply(console, [prefix + args[0], ...args.slice(1)]);
      }
    };
  }
  
  // Loggers por nível
  window.logError = createLogger(1, console.error, '');
  window.logWarn = createLogger(2, console.warn, '');
  window.logInfo = createLogger(3, console.log, '');
  window.logDebug = createLogger(4, console.log, '');
  window.logVerbose = createLogger(5, console.log, '');
  
  // Aliases legados (mantidos para compatibilidade)
  window.debug = function(...args) {
    if (window.__DEBUG__) console.log(...args);
  };
  window.debugWarn = function(...args) {
    if (window.__DEBUG__) console.warn(...args);
  };
  window.debugError = function(...args) {
    if (window.__DEBUG__) console.error(...args);
  };
  
  // Helpers para ativar/desativar categorias
  window.enableDebugCategory = function(category) {
    window.__DEBUG_CATEGORIES__[category] = true;
    console.log(` Debug ativado para categoria: ${category}`);
  };
  
  window.disableDebugCategory = function(category) {
    window.__DEBUG_CATEGORIES__[category] = false;
    console.log(` Debug desativado para categoria: ${category}`);
  };
  
  // Helper para ver status atual
  window.debugStatus = function() {
    console.table({
      '__DEBUG__': window.__DEBUG__,
      '__DEBUG_LEVEL__': window.__DEBUG_LEVEL__,
      ...window.__DEBUG_CATEGORIES__
    });
  };
})();
