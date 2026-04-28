/**
 * Sistema de Modo Escuro
 * Gerencia a alternância entre modo claro e escuro com persistência
 */

class DarkModeManager {
    constructor() {
        this.init();
    }

    init() {
        this.setupToggleButton();
        this.loadSavedTheme();
        this.setupSystemThemeDetection();
        console.log(' Dark Mode Manager initialized');
    }

    /**
     * Configura o botão de toggle
     */
    setupToggleButton() {
        const toggleButton = document.getElementById('dark-mode-toggle');
        if (!toggleButton) {
            console.warn('Dark mode toggle button not found');
            return;
        }

        toggleButton.addEventListener('click', () => {
            this.toggleTheme();
        });

        // Adiciona suporte a teclado
        toggleButton.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggleTheme();
            }
        });
    }

    /**
     * Alterna entre modo claro e escuro
     */
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        this.setTheme(newTheme);
        this.saveTheme(newTheme);
        
        // Feedback visual suave
        this.showThemeChangeNotification(newTheme);
    }

    /**
     * Define o tema atual
     * @param {string} theme - 'light' ou 'dark'
     */
    setTheme(theme) {
        const html = document.documentElement;
        const icon = document.getElementById('dark-mode-icon');

        if (theme === 'dark') {
            html.setAttribute('data-theme', 'dark');
            html.setAttribute('data-bs-theme', 'dark');
            if (icon) {
                icon.className = 'bi bi-sun-fill';
            }
        } else {
            html.removeAttribute('data-theme');
            html.removeAttribute('data-bs-theme');
            if (icon) {
                icon.className = 'bi bi-moon-fill';
            }
        }

        // Dispara evento customizado para outros componentes
        window.dispatchEvent(new CustomEvent('themeChanged', {
            detail: { theme }
        }));

        console.log(` Theme switched to: ${theme}`);
    }

    /**
     * Salva a preferência do usuário
     * @param {string} theme 
     */
    saveTheme(theme) {
        try {
            localStorage.setItem('preferred-theme', theme);
            const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
            prefs.darkMode = theme === 'dark';
            localStorage.setItem('userPreferences', JSON.stringify(prefs));
        } catch (error) {
            console.warn('Could not save theme preference:', error);
        }
    }

    /**
     * Carrega o tema salvo ou detecta preferência do sistema
     */
    loadSavedTheme() {
        try {
            const savedTheme = localStorage.getItem('preferred-theme');
            
            if (savedTheme) {
                this.setTheme(savedTheme);
                return;
            }
        } catch (error) {
            console.warn('Could not load saved theme:', error);
        }

        // Se não há preferência salva, usa detecção do sistema
        this.detectSystemTheme();
    }

    /**
     * Detecta preferência do sistema operacional
     */
    detectSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            this.setTheme('dark');
        } else {
            this.setTheme('light');
        }
    }

    /**
     * Configura detecção automática de mudanças no tema do sistema
     */
    setupSystemThemeDetection() {
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            
            mediaQuery.addListener((e) => {
                // Só aplica automaticamente se o usuário não definiu preferência
                if (!localStorage.getItem('preferred-theme')) {
                    this.setTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    }

    /**
     * Mostra notificação sutil da mudança de tema
     * @param {string} theme 
     */
    showThemeChangeNotification(theme) {
        const message = theme === 'dark' ? 'Modo escuro ativado' : 'Modo claro ativado';
        const icon = theme === 'dark' ? '' : '';
        
        // Cria notificação temporária
        const notification = document.createElement('div');
        notification.className = 'theme-change-notification';
        notification.innerHTML = `${icon} ${message}`;
        
        // Aplica estilos
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: theme === 'dark' ? '#2d2d2d' : '#ffffff',
            color: theme === 'dark' ? '#ffffff' : '#212529',
            padding: '12px 20px',
            borderRadius: '8px',
            border: `1px solid ${theme === 'dark' ? '#404040' : '#dee2e6'}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: '10000',
            fontSize: '14px',
            fontWeight: '500',
            opacity: '0',
            transform: 'translateY(-10px)',
            transition: 'all 0.3s ease'
        });

        document.body.appendChild(notification);

        // Anima entrada
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);

        // Remove após 2 segundos
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 2000);
    }

    /**
     * Obtém o tema atual
     * @returns {string} 'light' ou 'dark'
     */
    getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    /**
     * Força um tema específico (para uso programático)
     * @param {string} theme 
     * @param {boolean} save - Se deve salvar a preferência
     */
    forceTheme(theme, save = true) {
        this.setTheme(theme);
        if (save) {
            this.saveTheme(theme);
        }
    }

    /**
     * Reseta para preferência do sistema
     */
    resetToSystem() {
        localStorage.removeItem('preferred-theme');
        try {
            const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
            delete prefs.darkMode;
            localStorage.setItem('userPreferences', JSON.stringify(prefs));
        } catch {
            // ignore
        }
        this.detectSystemTheme();
        this.showThemeChangeNotification('Seguindo sistema');
    }
}

// CSS adicional para notificações
const notificationStyles = `
    .theme-change-notification {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        user-select: none;
        pointer-events: none;
    }
`;

// Adiciona estilos se não existirem
if (!document.querySelector('#theme-notification-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'theme-notification-styles';
    styleSheet.textContent = notificationStyles;
    document.head.appendChild(styleSheet);
}

// Inicializa quando DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.darkModeManager = new DarkModeManager();
    });
} else {
    window.darkModeManager = new DarkModeManager();
}

// Exporta para uso global
window.DarkModeManager = DarkModeManager;