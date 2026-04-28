(function () {
  'use strict';

  function escapeAttr(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function resolveModuleName(item) {
    if (!item?.page) return '';

    const moduleByPage = {
      dashboard: 'dashboard',
      aprovacao: 'aprovacoes',
      processos: 'contracts',
      whatsapp: 'whatsapp',
      agenda: 'calendar',
      relatorios: 'reports'
    };

    return moduleByPage[item.page] || '';
  }

  function renderNavItem(item, activePage) {
    if (item.type === 'divider') {
      return `
        <li class="nav-section-divider" aria-hidden="true">
          <span class="nav-section-label">${item.label}</span>
        </li>
      `;
    }

    const classes = ['nav-button'];
    if (item.external) classes.push('nav-link-external');
    if (item.className) classes.push(item.className);
    if (item.page === activePage) classes.push('active');

    const adminClass = item.adminOnly ? ' admin-only' : '';
    const moduleName = resolveModuleName(item);
    const moduleAttr = moduleName ? ` data-module="${escapeAttr(moduleName)}"` : '';
    const adminNavAttr = item.adminOnly ? ' data-admin-only-nav="true"' : '';
    const currentAttr = item.page === activePage ? ' aria-current="page"' : '';
    const content = `
      <i class="bi ${item.icon}"></i>
      <span class="nav-text">${item.label}</span>
      ${item.trailingHtml || ''}
    `;

    if (item.external) {
      return `
        <li class="nav-item${adminClass}" role="none"${moduleAttr}${adminNavAttr}>
          <a class="${classes.join(' ')}" href="${escapeAttr(item.href)}" role="menuitem"${currentAttr}>
            ${content}
          </a>
        </li>
      `;
    }

    return `
      <li class="nav-item${adminClass}" role="none"${moduleAttr}${adminNavAttr}>
        <button class="${classes.join(' ')}" data-page="${escapeAttr(item.page)}" role="menuitem"${currentAttr}>
          ${content}
        </button>
      </li>
    `;
  }

  function renderActionButton(action) {
    if (action.type === 'divider') {
      return '<div class="sidebar-actions-divider"></div>';
    }

    const attrs = Object.entries(action.attrs || {})
      .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
      .join(' ');

    const extraBadge = action.badgeId
      ? `<span id="${action.badgeId}" class="sidebar-action-badge d-none" aria-label="${escapeAttr(action.badgeLabel || action.label)}">0</span>`
      : '';

    return `
      <button id="${action.id}" class="${action.className || 'sidebar-action-btn'}" ${attrs}>
        <i class="bi ${action.icon}"></i>
        ${extraBadge}
        <span class="nav-text">${action.label}</span>
      </button>
    `;
  }

  function getConfig(mode) {
    if (mode === 'standalone') {
      return {
        items: [
          { external: true, href: 'dashboard.html', page: 'dashboard', icon: 'bi-speedometer2', label: 'Dashboard' },
          { external: true, href: 'aprovacao.html', page: 'aprovacao', icon: 'bi-check-circle', label: 'Aprovação' },
          { external: true, href: 'processos.html', page: 'processos', icon: 'bi-folder2-open', label: 'Processos' },
          { external: true, href: 'whatsapp.html', page: 'whatsapp', icon: 'bi-whatsapp', label: 'WhatsApp' },
          { external: true, href: 'agenda.html', page: 'agenda', icon: 'bi-calendar-event', label: 'Agenda' },
          { external: true, href: 'arquivados.html', page: 'arquivados', icon: 'bi-archive', label: 'Arquivados' },
          { type: 'divider', label: 'Análise' },
          { external: true, href: 'relatorios.html', page: 'relatorios', icon: 'bi-bar-chart', label: 'Relatórios', adminOnly: true, className: 'admin-only' },
          { type: 'divider', label: 'Sistema' },
          { external: true, href: 'ferramentas.html', page: 'ferramentas', icon: 'bi-tools', label: 'Ferramentas' },
          { external: true, href: 'configuracoes.html', page: 'configuracoes', icon: 'bi-gear', label: 'Configurações', adminOnly: true, className: 'admin-only' }
        ],
        profile: {
          mode: 'link',
          href: 'profile.html',
          roleText: 'Painel dedicado'
        },
        showSyncIndicator: false,
        actions: [
          { type: 'divider' },
          { id: 'logout-button', icon: 'bi-box-arrow-right', label: 'Sair', className: 'sidebar-action-btn sidebar-action-btn-danger' }
        ]
      };
    }

    return {
      items: [
        { external: true, href: 'dashboard.html', page: 'dashboard', icon: 'bi-speedometer2', label: 'Dashboard' },
        { external: true, href: 'aprovacao.html', page: 'aprovacao', icon: 'bi-check-circle', label: 'Aprovação' },
        {
          external: true,
          href: 'processos.html',
          page: 'processos',
          icon: 'bi-folder2-open',
          label: 'Processos',
          trailingHtml: '<span id="processos-criticos-badge" class="badge bg-danger ms-auto d-none" aria-label="Processos críticos">0</span>'
        },
        {
          external: true,
          href: 'whatsapp.html',
          page: 'whatsapp',
          icon: 'bi-whatsapp',
          label: 'WhatsApp',
          trailingHtml: '<span id="whatsapp-chats-counter" class="badge bg-warning text-dark ms-auto d-none" aria-label="Conversas aguardando">0</span><span id="whatsapp-active-chats-counter" class="badge bg-success ms-1 d-none" aria-label="Conversas ativas vinculadas a este agente">0</span>'
        },
        { external: true, href: 'agenda.html', page: 'agenda', icon: 'bi-calendar-event', label: 'Agenda' },
        { external: true, href: 'arquivados.html', page: 'arquivados', icon: 'bi-archive', label: 'Arquivados' },
        { type: 'divider', label: 'Análise' },
        { external: true, href: 'relatorios.html', page: 'relatorios', icon: 'bi-bar-chart', label: 'Relatórios', adminOnly: true, className: 'admin-only' },
        { type: 'divider', label: 'Sistema' },
        { external: true, href: 'ferramentas.html', page: 'ferramentas', icon: 'bi-tools', label: 'Ferramentas' },
        { external: true, href: 'configuracoes.html', page: 'configuracoes', icon: 'bi-gear', label: 'Configurações', adminOnly: true, className: 'admin-only' }
      ],
      profile: {
        mode: 'link',
        href: 'profile.html',
          roleText: 'Usuário'
      },
      showSyncIndicator: true,
      actions: [
        {
          id: 'analyst-chat-btn',
          icon: 'bi-chat-dots',
          label: 'Chat',
          className: 'sidebar-action-btn',
          badgeId: 'analyst-chat-badge',
          badgeLabel: 'Mensagens não lidas',
          attrs: {
            title: 'Chat Interno',
            onclick: 'window.aiChatUI?.openChatInterno()'
          }
        },
        {
          id: 'notification-btn',
          icon: 'bi-bell',
          label: 'Notificações',
          className: 'sidebar-action-btn',
          badgeId: 'notification-badge',
          badgeLabel: 'Notificações não lidas',
          attrs: {
            title: 'Notificações',
            'data-bs-toggle': 'offcanvas',
            'data-bs-target': '#notification-center',
            'aria-controls': 'notification-center'
          }
        },
        { type: 'divider' },
        { id: 'logout-button', icon: 'bi-box-arrow-right', label: 'Sair', className: 'sidebar-action-btn sidebar-action-btn-danger' }
      ]
    };
  }

  function renderProfile(profile, activePage) {
    const avatar = `
      <div class="sidebar-user-avatar">
        <i class="bi bi-person-circle"></i>
      </div>
      <div class="sidebar-user-info">
        <span id="user-email" class="sidebar-user-email"></span>
        <span class="sidebar-user-role">${profile.roleText}</span>
      </div>
      <i class="bi bi-chevron-right sidebar-user-arrow"></i>
    `;

    if (profile.mode === 'link') {
      return `<a class="sidebar-user" href="${escapeAttr(profile.href)}" title="Acessar Meu Perfil">${avatar}</a>`;
    }

    const currentAttr = profile.page === activePage ? ' aria-current="page"' : '';
    return `<button class="sidebar-user" data-page="${escapeAttr(profile.page)}" title="Acessar Meu Perfil" role="button" tabindex="0"${currentAttr}>${avatar}</button>`;
  }

  function render(config = {}) {
    const mountId = config.mountId || 'sidebar-shell-mount';
    const mount = document.getElementById(mountId);
    if (!mount) return;

    const mode = config.mode || 'app';
    const activePage = config.activePage || '';
    const resolvedConfig = getConfig(mode);

    mount.innerHTML = `
      <aside id="sidebar" class="sidebar" role="navigation" aria-label="Menu principal">
        <div class="sidebar-header">
          <button class="sidebar-toggle" id="sidebar-toggle" type="button" aria-label="Alternar menu lateral" aria-expanded="true" aria-controls="sidebar">
            <i class="bi bi-layout-sidebar-inset"></i>
          </button>
          <div class="sidebar-brand">
            <img src="./images/logobarra.png" alt="Logo Sistema Gestor de Processos" class="sidebar-logo">
            <span class="sidebar-brand-text">Sistema Gestor de Processos</span>
          </div>
        </div>
        <nav class="sidebar-nav" role="menubar">
          <ul class="nav flex-column">
            ${resolvedConfig.items.map((item) => renderNavItem(item, activePage)).join('')}
          </ul>
        </nav>
        <div class="sidebar-footer">
          ${renderProfile(resolvedConfig.profile, activePage)}
          ${resolvedConfig.showSyncIndicator ? `
            <div id="sync-indicator" class="sync-indicator d-none" role="status" aria-live="polite">
              <i class="bi bi-cloud-check-fill text-success"></i>
              <span class="sync-text">Sincronizado</span>
            </div>
          ` : ''}
          <div class="sidebar-actions">
            ${resolvedConfig.actions.map(renderActionButton).join('')}
          </div>
        </div>
      </aside>
    `;
  }

  window.SidebarShell = {
    render
  };
})();
