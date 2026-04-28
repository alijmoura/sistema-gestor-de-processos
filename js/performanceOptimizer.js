/**
 * @file performanceOptimizer.js
 * @description Otimizações de performance para carregamento inicial rápido
 * Implementa estratégias de lazy loading e definicao de prioridade de recursos críticos
 */

import lazyLoader from './lazyLoader.js';
import { auth } from './auth.js';

class PerformanceOptimizer {
  constructor() {
    this.metrics = {
      startTime: performance.now(),
      firstPaint: 0,
      firstContentfulPaint: 0,
      domContentLoaded: 0,
      loadComplete: 0,
      timeToInteractive: 0
    };

    this.criticalDataLoaded = false;
    this.debug = window.__DEBUG__ || false;
  }

  /**
   * Inicializa otimizações de performance
   */
  async initialize() {
    this.log(' Inicializando otimizações de performance...');

    // Captura métricas de performance
    this.captureMetrics();

    // Estratégia de carregamento em camadas
    await this.loadCriticalResources();
    this.loadHighPriorityResources();
    this.loadMediumPriorityResources();
    this.loadLowPriorityResources();

    this.logMetrics();
  }

  /**
   * Carrega recursos críticos (bloqueiam renderização inicial)
   */
  async loadCriticalResources() {
    this.log(' Carregando recursos críticos...');
    
    const criticalStart = performance.now();

    try {
      // Apenas o essencial para primeira renderização
      await Promise.all([
        // Status efetivos (necessário para UI básica)
        this.loadEffectiveStatuses(),
        
        // Perfil do usuário (para personalização básica)
        this.loadUserProfile(),
      ]);

      this.criticalDataLoaded = true;
      const criticalTime = performance.now() - criticalStart;
      this.log(` Recursos críticos carregados em ${criticalTime.toFixed(2)}ms`);
    } catch (error) {
      console.error(' Erro ao carregar recursos críticos:', error);
    }
  }

  /**
   * Carrega recursos de alta prioridade (necessários logo após)
   */
  loadHighPriorityResources() {
    this.log(' Agendando recursos de alta prioridade...');

    // Usa requestIdleCallback para não bloquear thread principal
    this.scheduleWork(() => {
      lazyLoader.loadModules([
        {
          name: 'users-list',
          priority: 'high',
          load: async () => {
            if (window.firestoreService && window.firestoreService.getAllUsers) {
              // Apenas admin pode chamar listAllUsers Cloud Function
              try {
                const currentUser = auth.currentUser;
                if (!currentUser) return;
                const tokenResult = await currentUser.getIdTokenResult();
                if (!tokenResult.claims.admin) return;
                const users = await window.firestoreService.getAllUsers();
                if (window.appState) window.appState.allUsers = users;
              } catch (err) {
                console.warn('performanceOptimizer: erro ao carregar lista de usuários', err);
              }
            }
          }
        },
        {
          name: 'first-contracts-page',
          priority: 'high',
          load: async () => {
            if (window.loadContractsPage) {
              await window.loadContractsPage();
            }
          }
        }
      ]);
    }, 100);
  }

  /**
   * Carrega recursos de média prioridade (dashboard, etc)
   */
  loadMediumPriorityResources() {
    this.log(' Agendando recursos de média prioridade...');

    this.scheduleWork(() => {
      // Dashboard só carrega quando usuário visitar a aba
      const dashboardPage = document.getElementById('page-dashboard');
      if (dashboardPage) {
        lazyLoader.loadOnVisible(
          dashboardPage,
          'dashboard-data',
          async () => {
            if (window.initializeDashboard) {
              await window.initializeDashboard();
            }
          }
        );
      }

      // Notificações podem carregar em background
      lazyLoader.loadOnIdle('notifications', async () => {
        const user = auth.currentUser;
        if (user && window.notificationService) {
          await window.notificationService.initialize(user.uid);
        }
      });
    }, 500);
  }

  /**
   * Carrega recursos de baixa prioridade (background)
   */
  loadLowPriorityResources() {
    this.log(' Agendando recursos de baixa prioridade...');

    this.scheduleWork(() => {
      // Dashboard avançado só quando realmente necessário
      lazyLoader.loadOnIdle('advanced-dashboard', async () => {
        if (window.DashboardService && window.DashboardUI) {
          if (!window.dashboardService) {
            window.dashboardService = new window.DashboardService();
          }
          if (!window.dashboardUI) {
            window.dashboardUI = new window.DashboardUI(window.dashboardService);
            await window.dashboardUI.init();
          }
        }
      }, { timeout: 3000 });

      // Index management service (não crítico)
      lazyLoader.loadOnIdle('index-management', async () => {
        if (window.indexManagementService) {
          await window.indexManagementService.initialize();
        }
      });
    }, 1000);
  }

  /**
   * Carrega status efetivos (crítico)
   */
  async loadEffectiveStatuses() {
    try {
      if (window.firestoreService && window.firestoreService.getEffectiveStatuses) {
        const effective = await window.firestoreService.getEffectiveStatuses();
        window.EFFECTIVE_STATUS_CONFIG = effective && effective.length ? effective : window.STATUS_CONFIG || [];
        this.log(` ${window.EFFECTIVE_STATUS_CONFIG.length} status carregados`);
      }
    } catch (error) {
      console.warn(' Usando status de fallback:', error);
      window.EFFECTIVE_STATUS_CONFIG = window.STATUS_CONFIG || [];
    }
  }

  /**
   * Carrega perfil do usuário (crítico)
   */
  async loadUserProfile() {
    try {
      const user = auth.currentUser;
      if (user && window.firestoreService && window.firestoreService.getUserProfile) {
        const profile = await window.firestoreService.getUserProfile(user.uid);
        if (window.appState) {
          window.appState.currentUserProfile = profile;
        }
        return profile;
      }
    } catch (error) {
      console.warn(' Não foi possível carregar perfil:', error);
    }
  }

  /**
   * Agenda trabalho para execução quando navegador estiver ocioso
   */
  scheduleWork(callback, delay = 0) {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        setTimeout(callback, delay);
      }, { timeout: delay + 1000 });
    } else {
      setTimeout(callback, delay);
    }
  }

  /**
   * Captura métricas de performance do navegador
   */
  captureMetrics() {
    if ('PerformanceObserver' in window) {
      try {
        const paintObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-paint') {
              this.metrics.firstPaint = entry.startTime;
            }
            if (entry.name === 'first-contentful-paint') {
              this.metrics.firstContentfulPaint = entry.startTime;
            }
          }
        });
        paintObserver.observe({ entryTypes: ['paint'] });
      } catch {
        // Silenciar erros em navegadores sem suporte
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      this.metrics.domContentLoaded = performance.now() - this.metrics.startTime;
    });

    window.addEventListener('load', () => {
      this.metrics.loadComplete = performance.now() - this.metrics.startTime;
    });
  }

  /**
   * Registra métricas de performance
   */
  logMetrics() {
    setTimeout(() => {
      const metrics = {
        'First Paint': this.metrics.firstPaint,
        'First Contentful Paint': this.metrics.firstContentfulPaint,
        'DOM Content Loaded': this.metrics.domContentLoaded,
        'Load Complete': this.metrics.loadComplete,
        'Time to Interactive': performance.now() - this.metrics.startTime
      };

      console.log(' Métricas de Performance:');
      Object.entries(metrics).forEach(([key, value]) => {
        if (value > 0) {
          console.log(`  ${key}: ${value.toFixed(2)}ms`);
        }
      });
    }, 1000);
  }

  /**
   * Logging condicional
   */
  log(message, ...args) {
    if (this.debug) {
      console.log(`[PerformanceOptimizer] ${message}`, ...args);
    }
  }
}

// Exporta instância
const performanceOptimizer = new PerformanceOptimizer();

if (typeof window !== 'undefined') {
  window.performanceOptimizer = performanceOptimizer;
}

export default performanceOptimizer;
export { performanceOptimizer };
