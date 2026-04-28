/**
 * @file settingsUI.js
 * @description Gerencia a navegação e interação na página de configurações.
 * Controla a troca de painéis (tabs) e a integração com o menu lateral.
 */

export const SettingsUI = {
  initialized: false,

  init() {
    if (this.initialized) return;

    this.setupNavigation();
    this.setupSubmenuIntegration();
    this.setupReadMetricsButton();

    // Verificar se há um hash na URL ou estado inicial para abrir a aba correta
    this.checkInitialState();

    this.initialized = true;
    console.log(' SettingsUI inicializado');
  },

  /**
   * Configura o botão de abertura do dashboard de métricas de leituras
   */
  setupReadMetricsButton() {
    const readMetricsButtons = document.querySelectorAll('#btn-open-read-metrics, #btn-open-read-metrics-quick');
    if (readMetricsButtons.length) {
      readMetricsButtons.forEach((btn) => {
        btn.addEventListener('click', async (e) => {
        e.preventDefault();

        // Carrega o modal dinamicamente se ainda não estiver carregado
        if (!window.readMetricsDashboardModal) {
          try {
            const module = await import('./modals/ReadMetricsDashboardModal.js');
            window.readMetricsDashboardModal = module.default;
          } catch (error) {
            console.error('[SettingsUI] Erro ao carregar ReadMetricsDashboardModal:', error);
            if (window.showNotification) {
              window.showNotification('Erro ao carregar dashboard de métricas', 'error');
            }
            return;
          }
        }

        // Abre o modal
        window.readMetricsDashboardModal.open();
      });
      });
    }
  },

  /**
   * Configura os listeners para os botões de navegação lateral (.settings-nav)
   */
  setupNavigation() {
    const navButtons = document.querySelectorAll('.settings-nav button[data-target]');
    
    navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute('data-target');
        this.activatePanel(targetId);
      });
    });

    // Listeners para botões dentro dos cards que abrem outros painéis
    // Ex: data-open-panel="panel-vendors"
    const internalLinks = document.querySelectorAll('[data-open-panel]');
    internalLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('data-open-panel');
        this.activatePanel(targetId);
      });
    });

    // Handler para data-trigger-click (simula clique em outro elemento)
    // Útil para botões que devem acionar inputs hidden ou outros botões
    const triggerButtons = document.querySelectorAll('[data-trigger-click]');
    triggerButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute('data-trigger-click');
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          targetEl.click();
        } else {
          console.warn(`[SettingsUI] Alvo do trigger não encontrado: #${targetId}`);
        }
      });
    });
  },

  /**
   * Ativa um painel específico e atualiza a navegação
   * @param {string} panelId - ID do painel a ser exibido (ex: 'panel-overview')
   */
  activatePanel(panelId) {
    if (!panelId) return;

    // 1. Atualizar botões da navegação
    const navButtons = document.querySelectorAll('.settings-nav button');
    navButtons.forEach(btn => {
      if (btn.getAttribute('data-target') === panelId) {
        btn.classList.add('active');
        // Scroll o botão para a vista se necessário (mobile)
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } else {
        btn.classList.remove('active');
      }
    });

    // 2. Alternar painéis
    const panels = document.querySelectorAll('.settings-panel');
    panels.forEach(panel => {
      if (panel.id === panelId) {
        panel.classList.add('active');
        // Animação suave de entrada
        panel.style.animation = 'none';
        panel.offsetHeight; /* trigger reflow */
        panel.style.animation = 'fadeIn 0.25s ease';
      } else {
        panel.classList.remove('active');
      }
    });

    // 3. Atualizar URL/Hash (opcional, para deep linking)
    // window.location.hash = panelId;
  },

  /**
   * Integração com o SubMenuController (sidebar principal)
   * Escuta eventos de navegação vindos do menu lateral
   */
  setupSubmenuIntegration() {
    window.addEventListener('submenu-navigate', (evt) => {
      const { page, section } = evt.detail || {};
      
      // Só agir se a navegação for para a página de configurações
      if (page === 'configuracoes' && section) {
        // Mapeamento de seções do submenu para IDs dos painéis
        const sectionMap = {
          'overview': 'panel-overview',
          'status': 'panel-status',
          'usuarios': 'panel-users',
          'sla': 'panel-status', // SLA fica dentro de status ou tem painel próprio? No HTML está em panel-status
          'notificacoes': 'panel-notifications',
          'sistema': 'panel-overview',
          'ia': 'panel-ia',
          'vendors': 'panel-vendors',
          'agencias': 'panel-agencias',
          'cartorios': 'panel-cartorios',
          'whatsapp': 'panel-whatsapp'
        };

        const targetPanel = sectionMap[section] || `panel-${section}`;
        this.activatePanel(targetPanel);
      }
    });
  },

  /**
   * Verifica estado inicial ao carregar
   */
  checkInitialState() {
    // Se a página de configurações já estiver ativa, verificar se precisamos abrir um painel específico
    const pageConfig = document.getElementById('page-configuracoes');
    if (pageConfig && pageConfig.classList.contains('active')) {
      // Lógica para restaurar última aba ou padrão
      // Por padrão, o HTML já define 'panel-overview' como active
    }
  }
};
