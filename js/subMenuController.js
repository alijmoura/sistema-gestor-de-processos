/**
 * SubMenuController - Gerenciador de Submenus Expansíveis na Sidebar
 * 
 * Funcionalidades:
 * - Accordion para submenus (Configurações, Relatórios, etc.)
 * - Animações suaves de expansão/colapso
 * - Persistência de estado via localStorage
 * - Favoritos/Recentes personalizáveis
 * - Integração com SidebarController existente
 * - Acessibilidade completa (ARIA)
 * 
 * @version 1.0.0
 * @author GitHub Copilot
 */

class SubMenuController {
    constructor() {
        this.config = {
            storageKey: 'sidebar_submenu_state',
            favoritesKey: 'sidebar_favorites',
            recentsKey: 'sidebar_recents',
            maxRecents: 5,
            animationDuration: 300 // ms
        };

        this.state = {
            expandedMenus: new Set(),
            favorites: [],
            recents: []
        };

        this.submenus = new Map();
        this.initialized = false;

        // Configurações de submenus disponíveis
        this.submenuConfig = {};
    }

    /**
     * Inicializa o controlador de submenus
     */
    init() {
        if (this.initialized) {
            console.warn('[SubMenuController] Já inicializado');
            return;
        }

        this.loadState();
        this.transformMenusToSubmenus();
        this.createFavoritesSection();
        this.createRecentsSection();
        this.setupEventListeners();
        this.restoreExpandedState();

        this.initialized = true;

        // Expor API pública
        if (typeof window !== 'undefined') {
            window.SubMenuController = this;
        }

        console.log('[SubMenuController] Inicializado', {
            expandedMenus: Array.from(this.state.expandedMenus),
            favorites: this.state.favorites.length,
            recents: this.state.recents.length
        });
    }

    /**
     * Carrega estado do localStorage
     */
    loadState() {
        try {
            const savedState = localStorage.getItem(this.config.storageKey);
            if (savedState) {
                const state = JSON.parse(savedState);
                this.state.expandedMenus = new Set(state.expandedMenus || []);
            }

            const savedFavorites = localStorage.getItem(this.config.favoritesKey);
            if (savedFavorites) {
                this.state.favorites = JSON.parse(savedFavorites);
            }

            const savedRecents = localStorage.getItem(this.config.recentsKey);
            if (savedRecents) {
                this.state.recents = JSON.parse(savedRecents);
            }
        } catch (error) {
            console.error('[SubMenuController] Erro ao carregar estado:', error);
        }
    }

    /**
     * Salva estado no localStorage
     */
    saveState() {
        try {
            localStorage.setItem(this.config.storageKey, JSON.stringify({
                expandedMenus: Array.from(this.state.expandedMenus)
            }));
            localStorage.setItem(this.config.favoritesKey, JSON.stringify(this.state.favorites));
            localStorage.setItem(this.config.recentsKey, JSON.stringify(this.state.recents));
        } catch (error) {
            console.error('[SubMenuController] Erro ao salvar estado:', error);
        }
    }

    /**
     * Transforma menus simples em submenus expansíveis
     */
    transformMenusToSubmenus() {
        const sidebarNav = document.querySelector('.sidebar-nav ul');
        if (!sidebarNav) {
            console.error('[SubMenuController] Sidebar nav não encontrada');
            return;
        }

        // Transformar cada submenu configurado
        for (const [menuId, config] of Object.entries(this.submenuConfig)) {
            const menuItem = this.findMenuItemByPage(menuId);
            if (menuItem) {
                const existingContainer = menuItem.querySelector('.submenu-container');
                if (existingContainer) {
                    this.bindExistingSubmenu(menuItem, config);
                } else {
                    this.createSubmenu(menuItem, config);
                }
            }
        }
    }

    /**
     * Encontra item de menu pelo atributo data-page
     */
    findMenuItemByPage(page) {
        return document.querySelector(`.nav-button[data-page="${page}"]`)?.closest('.nav-item');
    }

    /**
     * Cria estrutura de submenu
     */
    createSubmenu(menuItem, config) {
        const button = menuItem.querySelector('.nav-button');
        if (!button) return;

        // Adicionar classe de submenu
        menuItem.classList.add('has-submenu');
        button.classList.add('submenu-toggle');

        // Adicionar ícone de expansão
        if (!button.querySelector('.submenu-expand-icon')) {
            const expandIcon = document.createElement('i');
            expandIcon.className = 'bi bi-chevron-right submenu-expand-icon';
            button.appendChild(expandIcon);
        }

        // Criar container de itens do submenu
        const submenuContainer = document.createElement('div');
        submenuContainer.className = 'submenu-container';
        submenuContainer.id = `submenu-${config.id}`;
        submenuContainer.setAttribute('aria-hidden', 'true');
        submenuContainer.setAttribute('inert', ''); // Previne foco em elementos ocultos

        const submenuList = document.createElement('ul');
        submenuList.className = 'submenu-list';
        submenuList.setAttribute('role', 'menu');

        // Adicionar itens
        config.items.forEach(item => {
            const li = this.createSubmenuItem(item);
            submenuList.appendChild(li);
        });

        submenuContainer.appendChild(submenuList);
        menuItem.appendChild(submenuContainer);

        // Armazenar referência
        this.submenus.set(config.id, {
            button,
            container: submenuContainer,
            config,
            expanded: false
        });

        // Event listener para toggle
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSubmenu(config.id);
        });

        // Acessibilidade
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', `submenu-${config.id}`);
    }

    /**
     * Aproveita submenu existente no HTML e sincroniza com configuração atual
     */
    bindExistingSubmenu(menuItem, config) {
        const button = menuItem.querySelector('.nav-button');
        const submenuContainer = menuItem.querySelector('.submenu-container');
        if (!button || !submenuContainer) return;

        menuItem.classList.add('has-submenu');
        button.classList.add('submenu-toggle');

        if (!button.querySelector('.submenu-expand-icon')) {
            const expandIcon = document.createElement('i');
            expandIcon.className = 'bi bi-chevron-right submenu-expand-icon';
            button.appendChild(expandIcon);
        }

        submenuContainer.id = `submenu-${config.id}`;
        submenuContainer.setAttribute('aria-hidden', 'true');
        submenuContainer.setAttribute('inert', '');
        submenuContainer.classList.remove('expanded');
        submenuContainer.style.maxHeight = '0';

        let submenuList = submenuContainer.querySelector('.submenu-list');
        if (!submenuList) {
            submenuList = document.createElement('ul');
            submenuList.className = 'submenu-list';
            submenuList.setAttribute('role', 'menu');
            submenuContainer.appendChild(submenuList);
        }

        submenuList.innerHTML = '';
        config.items.forEach(item => {
            const li = this.createSubmenuItem(item);
            submenuList.appendChild(li);
        });

        this.submenus.set(config.id, {
            button,
            container: submenuContainer,
            config,
            expanded: false
        });

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSubmenu(config.id);
        });

        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', `submenu-${config.id}`);
    }

    /**
     * Cria item individual do submenu
     */
    createSubmenuItem(item) {
        const li = document.createElement('li');
        li.className = 'submenu-item';
        li.setAttribute('role', 'none');

        const button = document.createElement('button');
        button.className = 'submenu-button';
        button.dataset.submenuItem = item.id;
        button.dataset.page = item.page;
        button.dataset.section = item.section || '';
        button.setAttribute('role', 'menuitem');

        const icon = document.createElement('i');
        icon.className = `bi ${item.icon}`;

        const text = document.createElement('span');
        text.className = 'submenu-text';
        text.textContent = item.label;

        // Ícone de favorito
        const favoriteIcon = document.createElement('i');
        favoriteIcon.className = 'bi bi-star submenu-favorite-icon';
        favoriteIcon.title = 'Adicionar aos favoritos';
        favoriteIcon.setAttribute('data-favorite-toggle', item.id);

        if (this.state.favorites.includes(item.id)) {
            favoriteIcon.classList.add('favorited');
            favoriteIcon.classList.replace('bi-star', 'bi-star-fill');
        }

        button.appendChild(icon);
        button.appendChild(text);
        button.appendChild(favoriteIcon);

        // Event listeners
        button.addEventListener('click', (e) => {
            if (!e.target.closest('.submenu-favorite-icon')) {
                this.handleSubmenuClick(item);
            }
        });

        favoriteIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFavorite(item.id);
        });

        li.appendChild(button);
        return li;
    }

    /**
     * Expande ou colapsa submenu
     */
    toggleSubmenu(menuId) {
        const submenu = this.submenus.get(menuId);
        if (!submenu) return;

        const isExpanding = !submenu.expanded;

        if (isExpanding) {
            this.expandSubmenu(menuId);
        } else {
            this.collapseSubmenu(menuId);
        }
    }

    /**
     * Expande submenu
     */
    expandSubmenu(menuId) {
        const submenu = this.submenus.get(menuId);
        if (!submenu || submenu.expanded) return;

        submenu.expanded = true;
        submenu.button.classList.add('expanded');
        submenu.container.classList.add('expanded');
        submenu.button.setAttribute('aria-expanded', 'true');
        submenu.container.setAttribute('aria-hidden', 'false');
        submenu.container.removeAttribute('inert');

        // Animação de altura
        const height = submenu.container.scrollHeight;
        submenu.container.style.maxHeight = `${height}px`;

        this.state.expandedMenus.add(menuId);
        this.saveState();
    }

    /**
     * Colapsa submenu
     */
    collapseSubmenu(menuId) {
        const submenu = this.submenus.get(menuId);
        if (!submenu || !submenu.expanded) return;

        submenu.expanded = false;
        submenu.button.classList.remove('expanded');
        submenu.container.classList.remove('expanded');
        submenu.button.setAttribute('aria-expanded', 'false');
        submenu.container.setAttribute('inert', '');
        submenu.container.setAttribute('aria-hidden', 'true');

        submenu.container.style.maxHeight = '0';

        this.state.expandedMenus.delete(menuId);
        this.saveState();
    }

    /**
     * Restaura estado expandido dos submenus
     */
    restoreExpandedState() {
        this.state.expandedMenus.forEach(menuId => {
            this.expandSubmenu(menuId);
        });
    }

    /**
     * Handler de clique em item do submenu
     */
    handleSubmenuClick(item) {
        console.log('[SubMenuController] Item clicado:', item);

        const role = String(
            window.permissionsUIHelper?.currentUserPermissions?.role
            || window.appState?.userPermissions?.role
            || ''
        ).toLowerCase();
        const isAdmin = role === 'admin' || role === 'super_admin';
        const adminOnlyPages = new Set(['configuracoes', 'relatorios']);
        if (adminOnlyPages.has(item.page) && !isAdmin) {
            if (typeof window.showNotification === 'function') {
                window.showNotification('Acesso permitido apenas para administradores.', 'error');
            }
            return;
        }

        // Adicionar aos recentes
        this.addToRecents(item);

        // Navegar para a página/seção
        if (item.page) {
            // Se houver seção específica, passar como hash ou parâmetro
            if (item.section) {
                // Trigger evento customizado para navegação com seção
                window.dispatchEvent(new CustomEvent('submenu-navigate', {
                    detail: { page: item.page, section: item.section, item }
                }));
            }

            // Clicar no botão principal da página (integração com sistema existente)
            const mainButton = document.querySelector(`.nav-button[data-page="${item.page}"]`);
            if (mainButton) {
                mainButton.click();

                // Se houver seção, scroll até ela após um delay
                if (item.section) {
                    setTimeout(() => {
                        const sectionEl = document.getElementById(item.section) || 
                                        document.querySelector(`[data-section="${item.section}"]`);
                        if (sectionEl) {
                            sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 300);
                }
            }
        }
    }

    /**
     * Adiciona item aos recentes
     */
    addToRecents(item) {
        // Remover se já existe
        this.state.recents = this.state.recents.filter(r => r.id !== item.id);

        // Adicionar no início
        this.state.recents.unshift(item);

        // Limitar tamanho
        if (this.state.recents.length > this.config.maxRecents) {
            this.state.recents = this.state.recents.slice(0, this.config.maxRecents);
        }

        this.saveState();
        this.updateRecentsSection();
    }

    /**
     * Toggle favorito
     */
    toggleFavorite(itemId) {
        const index = this.state.favorites.indexOf(itemId);
        const icon = document.querySelector(`[data-favorite-toggle="${itemId}"]`);

        if (index > -1) {
            // Remover dos favoritos
            this.state.favorites.splice(index, 1);
            if (icon) {
                icon.classList.remove('favorited');
                icon.classList.replace('bi-star-fill', 'bi-star');
            }
        } else {
            // Adicionar aos favoritos
            this.state.favorites.push(itemId);
            if (icon) {
                icon.classList.add('favorited');
                icon.classList.replace('bi-star', 'bi-star-fill');
            }
        }

        this.saveState();
        this.updateFavoritesSection();
    }

    /**
     * Cria seção de Favoritos
     * @deprecated Temporariamente desabilitado
     */
    createFavoritesSection() {
        // Desabilitado temporariamente
        return;
    }

    /**
     * Cria seção de Recentes
     * @deprecated Temporariamente desabilitado
     */
    createRecentsSection() {
        // Desabilitado temporariamente
        return;
    }

    /**
     * Cria seção de acesso rápido (Favoritos/Recentes)
     */
    createQuickAccessSection(type, label, icon) {
        const section = document.createElement('li');
        section.className = `nav-item quick-access-section quick-access-${type}`;
        section.id = `quick-access-${type}`;

        const header = document.createElement('div');
        header.className = 'quick-access-header';
        header.innerHTML = `
            <i class="bi ${icon}"></i>
            <span class="quick-access-label">${label}</span>
        `;

        const container = document.createElement('div');
        container.className = 'quick-access-container';
        container.id = `${type}-container`;

        section.appendChild(header);
        section.appendChild(container);

        return section;
    }

    /**
     * Atualiza seção de favoritos
     */
    updateFavoritesSection() {
        const container = document.getElementById('favorites-container');
        if (!container) return;

        container.innerHTML = '';

        if (this.state.favorites.length === 0) {
            container.innerHTML = '<p class="quick-access-empty">Nenhum favorito ainda</p>';
            return;
        }

        const items = this.getAllSubmenuItems().filter(item => 
            this.state.favorites.includes(item.id)
        );

        items.forEach(item => {
            const btn = this.createQuickAccessButton(item);
            container.appendChild(btn);
        });
    }

    /**
     * Atualiza seção de recentes
     */
    updateRecentsSection() {
        const container = document.getElementById('recents-container');
        if (!container) return;

        container.innerHTML = '';

        if (this.state.recents.length === 0) {
            container.innerHTML = '<p class="quick-access-empty">Nenhum item recente</p>';
            return;
        }

        this.state.recents.forEach(item => {
            const btn = this.createQuickAccessButton(item);
            container.appendChild(btn);
        });
    }

    /**
     * Cria botão de acesso rápido
     */
    createQuickAccessButton(item) {
        const button = document.createElement('button');
        button.className = 'quick-access-button';
        button.dataset.submenuItem = item.id;
        button.innerHTML = `
            <i class="bi ${item.icon}"></i>
            <span>${item.label}</span>
        `;

        button.addEventListener('click', () => {
            this.handleSubmenuClick(item);
        });

        return button;
    }

    /**
     * Retorna todos os itens de submenu
     */
    getAllSubmenuItems() {
        const items = [];
        for (const config of Object.values(this.submenuConfig)) {
            items.push(...config.items);
        }
        return items;
    }

    /**
     * Setup de event listeners globais
     */
    setupEventListeners() {
        // Colapsar outros submenus ao clicar em botão principal (opcional)
        // document.querySelectorAll('.nav-button:not(.submenu-toggle)').forEach(btn => {
        //     btn.addEventListener('click', () => {
        //         this.collapseAllSubmenus();
        //     });
        // });
    }

    /**
     * Colapsa todos os submenus
     */
    collapseAllSubmenus() {
        this.submenus.forEach((submenu, menuId) => {
            this.collapseSubmenu(menuId);
        });
    }

    /**
     * Expande todos os submenus
     */
    expandAllSubmenus() {
        this.submenus.forEach((submenu, menuId) => {
            this.expandSubmenu(menuId);
        });
    }

    /**
     * Limpa favoritos
     */
    clearFavorites() {
        this.state.favorites = [];
        this.saveState();
        
        // Remover classe favorited de todos os ícones
        document.querySelectorAll('.submenu-favorite-icon.favorited').forEach(icon => {
            icon.classList.remove('favorited');
            icon.classList.replace('bi-star-fill', 'bi-star');
        });

        this.updateFavoritesSection();
    }

    /**
     * Limpa recentes
     */
    clearRecents() {
        this.state.recents = [];
        this.saveState();
        this.updateRecentsSection();
    }

    /**
     * Destroi o controlador
     */
    destroy() {
        this.submenus.clear();
        this.state.expandedMenus.clear();
        this.initialized = false;
        console.log('[SubMenuController] Destruído');
    }
}

// Inicializar quando DOM estiver pronto
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.subMenuController = new SubMenuController();
            window.subMenuController.init();
        });
    } else {
        window.subMenuController = new SubMenuController();
        window.subMenuController.init();
    }
}
