/**
 * Sidebar Controller
 *
 * Controla o comportamento de recolher/expandir da sidebar lateral
 * seguindo os padrões Bootstrap 5 e as regras do projeto.
 */

(function() {
  'use strict';

  // Estado da sidebar (salvo em localStorage)
  const STORAGE_KEY = 'sidebar-collapsed';
  
  /**
   * Inicializa o controle da sidebar
   */
  function initSidebar() {
    const body = document.body;
    const sidebarToggle = document.getElementById('sidebar-toggle');
    
    if (!sidebarToggle) {
      console.warn('[Sidebar] Botão de toggle não encontrado');
      return;
    }

    // Restaurar estado salvo
    const isCollapsed = localStorage.getItem(STORAGE_KEY) === 'true';
    if (isCollapsed) {
      body.classList.add('sidebar-collapsed');
      updateAriaState(sidebarToggle, true);
    }

    // Evento de click no botão toggle
    sidebarToggle.addEventListener('click', toggleSidebar);

    // Suporte para teclado (acessibilidade)
    sidebarToggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSidebar();
      }
    });

    // Ajustar em telas pequenas (mobile)
    handleResponsive();
    window.addEventListener('resize', handleResponsive);

    // Inicializar tooltips para estado collapsed
    initTooltips();
    
    // Atualizar tooltips quando sidebar é toggleada
    window.addEventListener('sidebar-toggled', handleTooltipsOnToggle);

    // Configurar botão de perfil de usuário
    setupProfileButton();

    console.log('[Sidebar] Inicializado com sucesso');
  }

  /**
   * Alterna o estado da sidebar (expandida/recolhida)
   */
  function toggleSidebar() {
    const body = document.body;
    const isCollapsed = body.classList.toggle('sidebar-collapsed');
    
    // Salvar estado
    localStorage.setItem(STORAGE_KEY, isCollapsed);
    
    // Atualizar ARIA
    const sidebarToggle = document.getElementById('sidebar-toggle');
    updateAriaState(sidebarToggle, isCollapsed);

    // Disparar evento customizado para outros componentes
    window.dispatchEvent(new CustomEvent('sidebar-toggled', { 
      detail: { collapsed: isCollapsed }
    }));

    console.log(`[Sidebar] ${isCollapsed ? 'Recolhida' : 'Expandida'}`);
  }

  /**
   * Atualiza os atributos ARIA para acessibilidade
   */
  function updateAriaState(button, isCollapsed) {
    if (button) {
      button.setAttribute('aria-expanded', !isCollapsed);
      button.setAttribute('aria-label', isCollapsed ? 'Expandir menu' : 'Recolher menu');
    }
  }

  /**
   * Lida com comportamento responsivo
   * Em telas pequenas, a sidebar deve ser recolhida por padrão
   */
  function handleResponsive() {
    const body = document.body;
    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      // Em mobile, sempre recolher
      if (!body.classList.contains('sidebar-collapsed')) {
        body.classList.add('sidebar-collapsed');
        localStorage.setItem(STORAGE_KEY, 'true');
      }
    }
  }

  /**
   * Inicializa tooltips do Bootstrap para botões da sidebar
   * Mostra o nome do item quando a sidebar está recolhida
   */
  function initTooltips() {
    const navButtons = document.querySelectorAll('.nav-button');
    const sidebarButtons = document.querySelectorAll('.sidebar-actions .btn');

    // Adicionar tooltips aos botões de navegação
    navButtons.forEach(button => {
      const textElement = button.querySelector('.nav-text');
      if (textElement) {
        const text = textElement.textContent.trim();
        
        // Inicializar tooltip do Bootstrap
        const tooltip = new bootstrap.Tooltip(button, {
          title: text,
          placement: 'right',
          trigger: 'hover',
          container: 'body',
          customClass: 'sidebar-tooltip',
          delay: { show: 500, hide: 100 }
        });

        // Apenas mostrar tooltip quando collapsed
        button.addEventListener('mouseenter', () => {
          if (!document.body.classList.contains('sidebar-collapsed')) {
            tooltip.disable();
          } else {
            tooltip.enable();
          }
        });
      }
    });

    // Adicionar tooltips aos botões de ação (notificações, tema, sair)
    sidebarButtons.forEach(button => {
      const textElement = button.querySelector('.nav-text');
      const existingTitle = button.getAttribute('title');
      const text = textElement ? textElement.textContent.trim() : existingTitle;
      
      if (text) {
        const tooltip = new bootstrap.Tooltip(button, {
          title: text,
          placement: 'right',
          trigger: 'hover',
          container: 'body',
          customClass: 'sidebar-tooltip',
          delay: { show: 500, hide: 100 }
        });

        button.addEventListener('mouseenter', () => {
          if (!document.body.classList.contains('sidebar-collapsed')) {
            tooltip.disable();
          } else {
            tooltip.enable();
          }
        });
      }
    });

    console.log('[Sidebar] Tooltips inicializados');
  }

  /**
   * Atualiza estado dos tooltips quando sidebar é toggleada
   */
  function handleTooltipsOnToggle(event) {
    const isCollapsed = event.detail.collapsed;
    const allButtons = document.querySelectorAll('.nav-button, .sidebar-actions .btn');
    
    allButtons.forEach(button => {
      const tooltipInstance = bootstrap.Tooltip.getInstance(button);
      if (tooltipInstance) {
        if (isCollapsed) {
          tooltipInstance.enable();
        } else {
          tooltipInstance.disable();
          tooltipInstance.hide(); // Esconder se estiver visível
        }
      }
    });
  }

  /**
   * Configura o botão de perfil do usuário
   * Transforma o elemento .sidebar-user em um botão clicável para navegar ao perfil
   */
  function setupProfileButton() {
    const profileButton = document.querySelector('.sidebar-user');
    
    if (!profileButton) {
      console.warn('[Sidebar] Botão de perfil não encontrado');
      return;
    }

    if (
      profileButton.tagName === 'A'
      && profileButton.getAttribute('href')
      && !profileButton.getAttribute('data-page')
    ) {
      console.log('[Sidebar] Perfil configurado como link externo');
      return;
    }

    // Adicionar event listener para navegar à página de perfil
    profileButton.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = profileButton.getAttribute('data-page');
      
      if (pageId && window.navigateTo) {
        // Remover active de todos os botões nav-button
        document.querySelectorAll('.nav-button').forEach(btn => {
          btn.classList.remove('active');
        });
        
        // Adicionar active ao botão de perfil
        profileButton.classList.add('active');
        
        // Navegar para a página
        window.navigateTo(pageId);
        console.log(`[Sidebar] Navegando para: ${pageId}`);
      } else {
        console.warn('[Sidebar] Função navigateTo não disponível ou data-page não definido');
      }
    });

    // Adicionar suporte para teclado (acessibilidade)
    profileButton.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        profileButton.click();
      }
    });

    // Configurar atributos de acessibilidade
    profileButton.setAttribute('role', 'button');
    profileButton.setAttribute('tabindex', '0');

    console.log('[Sidebar] Botão de perfil configurado');
  }

  /**
   * Expõe API pública para outros módulos
   */
  window.SidebarController = {
    toggle: toggleSidebar,
    isCollapsed: () => document.body.classList.contains('sidebar-collapsed'),
    collapse: () => {
      if (!document.body.classList.contains('sidebar-collapsed')) {
        toggleSidebar();
      }
    },
    expand: () => {
      if (document.body.classList.contains('sidebar-collapsed')) {
        toggleSidebar();
      }
    }
  };

  // Inicializar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
  } else {
    initSidebar();
  }

})();
