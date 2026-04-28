/**
 * @file lazyLoader.js
 * @description Gerenciador de carregamento preguiçoso (lazy loading) para módulos e componentes
 * Da-se prioridade a carregamento inicial rápido, adiando componentes não críticos
 */

class LazyLoader {
  constructor() {
    this.loadedModules = new Set();
    this.loadQueue = [];
    this.isProcessing = false;
    this.debug = window.__DEBUG__ || false;
  }

  /**
   * Registra um módulo como carregado
   */
  markAsLoaded(moduleName) {
    this.loadedModules.add(moduleName);
    this.log(` Módulo carregado: ${moduleName}`);
  }

  /**
   * Verifica se um módulo já foi carregado
   */
  isLoaded(moduleName) {
    return this.loadedModules.has(moduleName);
  }

  /**
   * Carrega módulo sob demanda
   * @param {string} moduleName - Nome do módulo para debug
   * @param {Function} loadFunction - Função que carrega o módulo
   * @param {Object} options - Opções de carregamento
   */
  async loadModule(moduleName, loadFunction, options = {}) {
    const {
      priority = 'low', // 'critical', 'high', 'medium', 'low'
      timeout = 5000,
      retries = 1
    } = options;

    if (this.isLoaded(moduleName)) {
      this.log(` Módulo já carregado: ${moduleName}`);
      return;
    }

    this.log(` Carregando módulo: ${moduleName} (prioridade: ${priority})`);

    let attempts = 0;
    while (attempts <= retries) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout ao carregar ${moduleName}`)), timeout)
        );

        await Promise.race([loadFunction(), timeoutPromise]);
        this.markAsLoaded(moduleName);
        return;
      } catch (error) {
        attempts++;
        if (attempts > retries) {
          console.error(` Falha ao carregar ${moduleName} após ${retries + 1} tentativas:`, error);
          throw error;
        }
        this.log(` Tentativa ${attempts} falhou para ${moduleName}, tentando novamente...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  /**
   * Carrega múltiplos módulos em paralelo com prioridade
   */
  async loadModules(modules) {
    const sorted = modules.sort((a, b) => {
      const priorities = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorities[a.priority || 'low'] - priorities[b.priority || 'low'];
    });

    for (const module of sorted) {
      await this.loadModule(module.name, module.load, module);
    }
  }

  /**
   * Carrega componentes quando se tornam visíveis (Intersection Observer)
   */
  loadOnVisible(element, moduleName, loadFunction) {
    if (!element) {
      console.warn(`Elemento não encontrado para ${moduleName}`);
      return;
    }

    if (this.isLoaded(moduleName)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(async (entry) => {
          if (entry.isIntersecting) {
            observer.disconnect();
            await this.loadModule(moduleName, loadFunction, { priority: 'medium' });
          }
        });
      },
      { rootMargin: '50px' }
    );

    observer.observe(element);
  }

  /**
   * Carrega um script externo dinamicamente
   * @param {string} url - URL do script
   * @param {string} moduleName - Nome para registro (opcional)
   */
  loadScript(url, moduleName) {
    const name = moduleName || url;
    
    return this.loadModule(name, () => {
      return new Promise((resolve, reject) => {
        // Verifica se já existe
        if (document.querySelector(`script[src="${url}"]`)) {
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Falha ao carregar script: ${url}`));
        document.head.appendChild(script);
      });
    }, { priority: 'high' });
  }

  /**
   * Carrega módulo quando usuário interagir com elemento
   */
  loadOnInteraction(element, moduleName, loadFunction, events = ['click', 'focus']) {
    if (!element) {
      console.warn(`Elemento não encontrado para ${moduleName}`);
      return;
    }

    if (this.isLoaded(moduleName)) return;

    const handler = async () => {
      events.forEach(evt => element.removeEventListener(evt, handler));
      await this.loadModule(moduleName, loadFunction, { priority: 'high' });
    };

    events.forEach(evt => element.addEventListener(evt, handler, { once: true }));
  }

  /**
   * Carrega módulo quando o navegador estiver ocioso
   */
  loadOnIdle(moduleName, loadFunction, options = {}) {
    if (this.isLoaded(moduleName)) return;

    if ('requestIdleCallback' in window) {
      requestIdleCallback(
        () => this.loadModule(moduleName, loadFunction, { priority: 'low', ...options }),
        { timeout: 2000 }
      );
    } else {
      // Fallback para navegadores sem suporte
      setTimeout(
        () => this.loadModule(moduleName, loadFunction, { priority: 'low', ...options }),
        1000
      );
    }
  }

  /**
   * Pré-carrega módulo em background
   */
  preload(moduleName, loadFunction) {
    this.loadOnIdle(moduleName, loadFunction, { priority: 'low' });
  }

  /**
   * Logging condicional
   */
  log(message, ...args) {
    if (this.debug) {
      console.log(`[LazyLoader] ${message}`, ...args);
    }
  }
}

// Instância global
const lazyLoader = new LazyLoader();

// Expor globalmente
if (typeof window !== 'undefined') {
  window.lazyLoader = lazyLoader;
}

export default lazyLoader;
export { lazyLoader };
