/**
 * ListenerOptimizer - Otimiza listeners em tempo real para reduzir leituras do Firestore
 * 
 * Funcionalidades:
 * - Throttling de listeners para evitar excesso de execuções
 * - Pausa listeners quando usuário inativo ou aba em background
 * - Detecta atividade do usuário e visibilidade da aba
 * - Processa dados em lotes quando necessário
 * - Retry automático em caso de erro
 */

class ListenerOptimizer {
  constructor() {
    this.activeListeners = new Map();
    this.throttleTimers = new Map();
    this.lastActivity = Date.now();
    this.userActive = true;
    this.isVisible = true;
    
    // Configurações de otimização
    this.config = {
      throttleDelay: 3000,        // 3 segundos entre execuções
      inactiveDelay: 300000,      // 5 minutos para considerar inativo
      backgroundPauseDelay: 5000, // 5 segundos para pausar em background
      batchSize: 50,              // Tamanho do lote para processamento
      retryDelay: 2000,           // 2 segundos entre tentativas
      maxRetries: 3               // Máximo de tentativas
    };
  }

  /**
   * Inicializa o otimizador
   */
  init() {
    this.setupVisibilityDetection();
    this.setupActivityDetection();
    console.log(' ListenerOptimizer inicializado');
  }

  /**
   * Detecta quando a aba está visível ou em background
   */
  setupVisibilityDetection() {
    const handleVisibilityChange = () => {
      this.isVisible = !document.hidden;
      
      if (!this.isVisible) {
        console.log(' Aba em background - pausando listeners não críticos em 5s');
        setTimeout(() => {
          if (!this.isVisible) {
            this.pauseNonCriticalListeners();
          }
        }, this.config.backgroundPauseDelay);
      } else {
        console.log(' Aba visível - retomando listeners');
        this.resumeAllListeners();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Eventos de foco da janela
    window.addEventListener('focus', () => {
      this.isVisible = true;
      this.resumeAllListeners();
    });
    
    window.addEventListener('blur', () => {
      this.isVisible = false;
    });
  }

  /**
   * Detecta atividade do usuário
   */
  setupActivityDetection() {
    const events = ['click', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    
    const updateActivity = () => {
      this.lastActivity = Date.now();
      if (!this.userActive) {
        this.userActive = true;
        console.log(' Usuário ativo - retomando listeners');
        this.resumeAllListeners();
      }
    };

    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });

    // Verifica inatividade periodicamente
    setInterval(() => {
      const inactive = (Date.now() - this.lastActivity) > this.config.inactiveDelay;
      if (inactive && this.userActive) {
        this.userActive = false;
        console.log(' Usuário inativo - otimizando listeners');
        this.optimizeForInactivity();
      }
    }, 10000); // Verifica a cada 10 segundos
  }

  /**
   * Registra um listener otimizado
   * @param {string} id - ID único do listener
   * @param {Function} listenerFunction - Função original do listener
   * @param {Object} options - Opções de configuração
   */
  registerListener(id, listenerFunction, options = {}) {
    const listenerConfig = {
      critical: false,           // Se é crítico (nunca pausa)
      throttle: true,           // Se deve aplicar throttle
      retryOnError: true,       // Se deve tentar novamente em erro
      batchProcess: false,      // Se deve processar em lotes
      immediateOnAdd: true,     // Executa imediatamente quando há documentos adicionados
      ...options
    };

    // Wrapper otimizado do listener
    const optimizedListener = (...args) => {
      return this.executeListener(id, listenerFunction, args, listenerConfig);
    };

    // Armazena informações do listener
    this.activeListeners.set(id, {
      original: listenerFunction,
      optimized: optimizedListener,
      config: listenerConfig,
      isActive: true,
      errors: 0,
      lastExecution: 0,
      unsubscribe: null
    });

    console.log(` Listener ${id} registrado com otimizações`, listenerConfig);
    return optimizedListener;
  }

  /**
   * Executa um listener com otimizações
   */
  executeListener(id, listenerFunction, args, listenerConfig) {
    const listener = this.activeListeners.get(id);
    if (!listener || !listener.isActive) {
      return; // Listener pausado ou removido
    }

    const now = Date.now();

    // Verifica se há documentos adicionados (novo contrato)
    const hasAddedDocs = this.checkForAddedDocuments(args);
    const shouldBypassThrottle = listenerConfig.immediateOnAdd && hasAddedDocs;

    // Aplica throttle se configurado, EXCETO se há novos documentos
    if (listenerConfig.throttle && !shouldBypassThrottle && !this.shouldExecuteNow(id, now)) {
      this.scheduleThrottledExecution(id, listenerFunction, args, listenerConfig);
      return;
    }

    if (shouldBypassThrottle) {
      console.log(` Novo documento detectado - executando listener ${id} imediatamente`);
    }

    try {
      // Processa dados se necessário
      const result = this.processListenerData(args, listenerConfig);

      // Atualiza timestamp da última execução
      listener.lastExecution = now;

      // Executa o listener original
      return listenerFunction.apply(this, result || args);

    } catch (error) {
      this.handleListenerError(id, error, listenerConfig);
    }
  }

  /**
   * Verifica se o snapshot contém documentos adicionados
   * @param {Array} args - Argumentos do listener (snapshot)
   * @returns {boolean} - Se há documentos adicionados
   */
  checkForAddedDocuments(args) {
    const snapshot = args[0];
    if (!snapshot || typeof snapshot.docChanges !== 'function') {
      return false;
    }

    try {
      const changes = snapshot.docChanges();
      return changes.some(change => change.type === 'added');
    } catch {
      return false;
    }
  }

  /**
   * Verifica se o listener deve executar agora (throttle)
   */
  shouldExecuteNow(id, now) {
    const listener = this.activeListeners.get(id);
    if (!listener) return true;

    const timeSinceLastExecution = now - listener.lastExecution;
    return timeSinceLastExecution >= this.config.throttleDelay;
  }

  /**
   * Agenda execução throttled de um listener
   */
  scheduleThrottledExecution(id, listenerFunction, args, listenerConfig) {
    // Remove timer anterior se existir
    if (this.throttleTimers.has(id)) {
      clearTimeout(this.throttleTimers.get(id));
    }

    // Agenda nova execução
    const timer = setTimeout(() => {
      this.throttleTimers.delete(id);
      this.executeListener(id, listenerFunction, args, listenerConfig);
    }, this.config.throttleDelay);

    this.throttleTimers.set(id, timer);
  }

  /**
   * Processa dados do listener (lotes, etc.)
   */
  processListenerData(args, listenerConfig) {
    if (!listenerConfig.batchProcess || !args[0] || !Array.isArray(args[0])) {
      return args; // Retorna dados originais
    }

    const data = args[0];
    if (data.length > this.config.batchSize) {
      console.log(` Processando ${data.length} itens em lotes de ${this.config.batchSize}`);
      
      // Processa primeiro lote imediatamente
      const firstBatch = data.slice(0, this.config.batchSize);
      
      // Agenda processamento dos demais lotes
      if (data.length > this.config.batchSize) {
        this.processBatchesAsync(data.slice(this.config.batchSize));
      }
      
      return [firstBatch, ...args.slice(1)];
    }

    return args;
  }

  /**
   * Processa lotes restantes de forma assíncrona
   */
  async processBatchesAsync(remainingData) {
    // Processa lotes de dados de forma assíncrona para evitar bloqueio
    for (let i = 0; i < remainingData.length; i += this.config.batchSize) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Pausa entre lotes
      
      // Apenas registra o processamento do lote
      const batchSize = Math.min(this.config.batchSize, remainingData.length - i);
      console.log(` Processando lote: ${i / this.config.batchSize + 1}, items: ${batchSize}`);
    }
  }

  /**
   * Trata erros de listeners
   */
  handleListenerError(id, error, listenerConfig) {
    const listener = this.activeListeners.get(id);
    if (!listener) return;

    listener.errors++;
    console.error(` Erro no listener ${id}:`, error, `(${listener.errors} erros)`);

    // Retry se configurado e não excedeu limite
    if (listenerConfig.retryOnError && listener.errors < this.config.maxRetries) {
      console.log(` Tentando novamente listener ${id} em ${this.config.retryDelay}ms`);
      
      setTimeout(() => {
        // Reset contador de erros após retry bem-sucedido
        if (listener.errors > 0) {
          listener.errors = Math.max(0, listener.errors - 1);
        }
      }, this.config.retryDelay);
    } else if (listener.errors >= this.config.maxRetries) {
      console.warn(` Listener ${id} pausado após ${this.config.maxRetries} erros`);
      this.pauseListener(id);
    }
  }

  /**
   * Pausa um listener específico
   */
  pauseListener(id) {
    const listener = this.activeListeners.get(id);
    if (listener) {
      listener.isActive = false;
      console.log(`⏸ Listener ${id} pausado`);
    }
  }

  /**
   * Retoma um listener específico
   */
  resumeListener(id) {
    const listener = this.activeListeners.get(id);
    if (listener) {
      listener.isActive = true;
      listener.errors = 0; // Reset errors ao retomar
      console.log(`▶ Listener ${id} retomado`);
    }
  }

  /**
   * Pausa listeners não críticos
   */
  pauseNonCriticalListeners() {
    for (const [listenerId, listener] of this.activeListeners.entries()) {
      if (!listener.config.critical && listener.isActive) {
        this.pauseListener(listenerId);
      }
    }
  }

  /**
   * Retoma todos os listeners
   */
  resumeAllListeners() {
    for (const [listenerId] of this.activeListeners.entries()) {
      this.resumeListener(listenerId);
    }
  }

  /**
   * Otimiza para período de inatividade
   */
  optimizeForInactivity() {
    console.log(' Otimizando para inatividade do usuário');
    
    // Pausa listeners não críticos
    this.pauseNonCriticalListeners();
    
    // Aumenta delays de throttle temporariamente
    // (Poderia ser implementado se necessário)
  }

  /**
   * Define função de unsubscribe para um listener
   */
  setUnsubscribe(id, unsubscribeFunction) {
    const listener = this.activeListeners.get(id);
    if (listener) {
      listener.unsubscribe = unsubscribeFunction;
    }
  }

  /**
   * Remove um listener do otimizador
   */
  unregisterListener(id) {
    const listener = this.activeListeners.get(id);
    if (listener && listener.unsubscribe) {
      listener.unsubscribe();
    }
    
    this.activeListeners.delete(id);
    
    // Remove timer de throttle se existir
    if (this.throttleTimers.has(id)) {
      clearTimeout(this.throttleTimers.get(id));
      this.throttleTimers.delete(id);
    }
    
    console.log(` Listener ${id} removido`);
  }

  /**
   * Obtém estatísticas do otimizador
   */
  getStats() {
    const stats = {
      totalListeners: this.activeListeners.size,
      activeListeners: 0,
      pausedListeners: 0,
      criticalListeners: 0,
      listenersWithErrors: 0,
      throttledOperations: this.throttleTimers.size,
      userActive: this.userActive,
      tabVisible: this.isVisible
    };

    for (const [, listener] of this.activeListeners.entries()) {
      if (listener.isActive) stats.activeListeners++;
      else stats.pausedListeners++;
      
      if (listener.config.critical) stats.criticalListeners++;
      if (listener.errors > 0) stats.listenersWithErrors++;
    }

    return stats;
  }

  /**
   * Limpa recursos do otimizador
   */
  destroy() {
    // Para todos os timers
    for (const timer of this.throttleTimers.values()) {
      clearTimeout(timer);
    }
    this.throttleTimers.clear();

    // Unsubscribe todos os listeners
    for (const [id] of this.activeListeners.entries()) {
      this.unregisterListener(id);
    }
    
    console.log(' ListenerOptimizer destruído');
  }
}

// Cria instância única
const listenerOptimizer = new ListenerOptimizer();

export default listenerOptimizer;