/**
 * Melhorias Modernas para Formulários
 * Adiciona funcionalidades avançadas de UX aos formulários modernizados
 */

class ModernFormEnhancements {
    constructor() {
        this.init();
    }

    init() {
        this.setupFloatingLabelAnimations();
        this.setupFormValidationFeedback();
        this.setupButtonLoadingStates();
        this.setupTooltips();
        this.setupTabKeyboardNavigation();
        console.log(' Modern Form Enhancements initialized');
    }

    /**
     * Configura animações suaves para floating labels
     */
    setupFloatingLabelAnimations() {
        const floatingInputs = document.querySelectorAll('.form-floating input, .form-floating select');
        
        floatingInputs.forEach(input => {
            // Animação de foco
            input.addEventListener('focus', (e) => {
                e.target.parentElement.classList.add('focused');
            });

            // Animação de blur
            input.addEventListener('blur', (e) => {
                e.target.parentElement.classList.remove('focused');
                
                // Adiciona classe preenchido se tiver valor
                if (e.target.value.trim() !== '') {
                    e.target.parentElement.classList.add('filled');
                } else {
                    e.target.parentElement.classList.remove('filled');
                }
            });

            // Verifica se já tem valor ao carregar
            if (input.value.trim() !== '') {
                input.parentElement.classList.add('filled');
            }
        });
    }

    /**
     * Configura feedback visual para validação de formulários
     */
    setupFormValidationFeedback() {
        const forms = document.querySelectorAll('form');
        
        forms.forEach(form => {
            const inputs = form.querySelectorAll('input, select, textarea');
            
            inputs.forEach(input => {
                // Validação em tempo real
                input.addEventListener('input', (e) => {
                    this.validateField(e.target);
                });

                // Validação no blur
                input.addEventListener('blur', (e) => {
                    this.validateField(e.target);
                });
            });
        });
    }

    /**
     * Valida um campo individual
     * @param {HTMLElement} field - Campo a ser validado
     */
    validateField(field) {
        const isRequired = field.hasAttribute('required');
        const value = field.value.trim();
        const type = field.type;

        // Remove classe de erro anterior
        field.classList.remove('is-invalid');

        // Validação de campo obrigatório
        if (isRequired && value === '') {
            this.setFieldState(field, 'invalid', 'Este campo é obrigatório');
            return false;
        }

        // Validação por tipo
        switch (type) {
            case 'email':
                if (value && !this.isValidEmail(value)) {
                    this.setFieldState(field, 'invalid', 'Por favor, insira um e-mail válido');
                    return false;
                }
                break;
            
            case 'tel':
                if (value && !this.isValidPhone(value)) {
                    this.setFieldState(field, 'invalid', 'Por favor, insira um telefone válido');
                    return false;
                }
                break;
        }

        // Se chegou até aqui, é válido - apenas remove estado de erro
        field.classList.remove('is-invalid');

        return true;
    }

    /**
     * Define o estado visual do campo (apenas para erro)
     * @param {HTMLElement} field - Campo
     * @param {string} state - 'invalid' (valid não mostra feedback)
     * @param {string} message - Mensagem de feedback
     */
    setFieldState(field, state, message) {
        if (state === 'invalid') {
            field.classList.add('is-invalid');
        } else {
            field.classList.remove('is-invalid');
        }

        // Adiciona/atualiza mensagem de feedback apenas para erros
        if (state === 'invalid') {
            let feedback = field.parentElement.querySelector('.invalid-feedback');
            if (!feedback) {
                feedback = document.createElement('div');
                feedback.className = 'invalid-feedback';
                field.parentElement.appendChild(feedback);
            }
            feedback.textContent = message;
        }
    }

    /**
     * Configura estados de carregamento para botões
     */
    setupButtonLoadingStates() {
        const forms = document.querySelectorAll('form');
        
        forms.forEach(form => {
            form.addEventListener('submit', () => {
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) {
                    this.setButtonLoading(submitBtn, true);
                    
                    // Remove loading após 3 segundos (fallback)
                    setTimeout(() => {
                        this.setButtonLoading(submitBtn, false);
                    }, 3000);
                }
            });
        });
    }

    /**
     * Define estado de carregamento do botão
     * @param {HTMLElement} button - Botão
     * @param {boolean} loading - Se está carregando
     */
    setButtonLoading(button, loading) {
        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
            button.setAttribute('data-original-text', button.textContent);
        } else {
            button.classList.remove('loading');
            button.disabled = false;
            const originalText = button.getAttribute('data-original-text');
            if (originalText) {
                button.textContent = originalText;
            }
        }
    }

    /**
     * Configura tooltips para elementos com title
     */
    setupTooltips() {
        const elementsWithTooltips = document.querySelectorAll('[title]');
        
        elementsWithTooltips.forEach(element => {
            // Remove listeners anteriores se existirem
            const newElement = element.cloneNode(true);
            element.parentNode.replaceChild(newElement, element);
            
            newElement.addEventListener('mouseenter', (e) => {
                this.showTooltip(e.target);
            });

            newElement.addEventListener('mouseleave', (e) => {
                this.hideTooltip(e.target);
            });

            // Proteção adicional: remove tooltip se o mouse sair da página
            newElement.addEventListener('mouseout', (e) => {
                // Se o mouse saiu completamente do elemento
                if (!e.relatedTarget || !newElement.contains(e.relatedTarget)) {
                    this.removeAllTooltips();
                }
            });
        });

        // Proteção global: remove tooltips se o mouse sair da janela
        document.addEventListener('mouseleave', () => {
            this.removeAllTooltips();
        });
    }

    /**
     * Configura navegação por teclado nas abas
     */
    setupTabKeyboardNavigation() {
        const tabButtons = document.querySelectorAll('.nav-link[data-tab]');
        
        tabButtons.forEach((tab, index) => {
            tab.addEventListener('keydown', (e) => {
                let nextIndex;
                
                switch (e.key) {
                    case 'ArrowRight':
                        nextIndex = (index + 1) % tabButtons.length;
                        tabButtons[nextIndex].focus();
                        tabButtons[nextIndex].click();
                        e.preventDefault();
                        break;
                        
                    case 'ArrowLeft':
                        nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
                        tabButtons[nextIndex].focus();
                        tabButtons[nextIndex].click();
                        e.preventDefault();
                        break;
                        
                    case 'Home':
                        tabButtons[0].focus();
                        tabButtons[0].click();
                        e.preventDefault();
                        break;
                        
                    case 'End':
                        tabButtons[tabButtons.length - 1].focus();
                        tabButtons[tabButtons.length - 1].click();
                        e.preventDefault();
                        break;
                }
            });
        });
    }

    /**
     * Valida formato de e-mail
     * @param {string} email 
     * @returns {boolean}
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Valida formato de telefone brasileiro
     * @param {string} phone 
     * @returns {boolean}
     */
    isValidPhone(phone) {
        const phoneRegex = /^(\(?\d{2}\)?\s?)?(9?\d{4})-?(\d{4})$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    }

    /**
     * Mostra tooltip
     * @param {HTMLElement} element 
     */
    showTooltip(element) {
        const title = element.getAttribute('title');
        if (!title) return;

        // Remove qualquer tooltip existente primeiro
        this.removeAllTooltips();

        // Remove title para evitar tooltip nativo
        element.setAttribute('data-title', title);
        element.removeAttribute('title');

        // Cria tooltip customizado
        const tooltip = document.createElement('div');
        tooltip.className = 'custom-tooltip';
        tooltip.textContent = title;
        tooltip.setAttribute('data-tooltip-for', element.id || 'temp-' + Date.now());
        
        document.body.appendChild(tooltip);

        // Posiciona tooltip
        const rect = element.getBoundingClientRect();
        tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
        tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';

        // Anima entrada
        setTimeout(() => tooltip.classList.add('show'), 10);

        // Auto-remove após 5 segundos como proteção adicional
        tooltip.setAttribute('data-timeout', setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.classList.remove('show');
                setTimeout(() => {
                    if (tooltip.parentNode) {
                        tooltip.remove();
                    }
                }, 200);
            }
        }, 5000));
    }

    /**
     * Esconde tooltip
     * @param {HTMLElement} element 
     */
    hideTooltip(element) {
        const tooltip = document.querySelector('.custom-tooltip');
        if (tooltip) {
            tooltip.classList.remove('show');
            setTimeout(() => {
                if (tooltip.parentNode) {
                    tooltip.remove();
                }
            }, 200);
        }

        // Restaura title
        const title = element.getAttribute('data-title');
        if (title) {
            element.setAttribute('title', title);
            element.removeAttribute('data-title');
        }
    }

    /**
     * Remove todos os tooltips (método auxiliar)
     */
    removeAllTooltips() {
        const tooltips = document.querySelectorAll('.custom-tooltip');
        tooltips.forEach(tooltip => {
            // Limpa timeout se existir
            const timeoutId = tooltip.getAttribute('data-timeout');
            if (timeoutId) {
                clearTimeout(parseInt(timeoutId));
            }
            
            // Remove o elemento
            if (tooltip.parentNode) {
                tooltip.remove();
            }
        });
    }

    /**
     * Método público para definir estado de carregamento
     * @param {string} buttonId - ID do botão
     * @param {boolean} loading - Estado de carregamento
     */
    static setButtonLoading(buttonId, loading) {
        const button = document.getElementById(buttonId);
        if (button) {
            const instance = new ModernFormEnhancements();
            instance.setButtonLoading(button, loading);
        }
    }

    /**
     * Método público para validar formulário
     * @param {string} formId - ID do formulário
     * @returns {boolean} - Se o formulário é válido
     */
    static validateForm(formId) {
        const form = document.getElementById(formId);
        if (!form) return false;

        const instance = new ModernFormEnhancements();
        let isValid = true;

        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (!instance.validateField(input)) {
                isValid = false;
            }
        });

        return isValid;
    }
}

// CSS adicional para tooltips customizados
const tooltipStyles = `
    .custom-tooltip {
        position: absolute;
        background: linear-gradient(135deg, #343a40, #6c757d);
        color: white;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 0.875rem;
        z-index: 10000;
        opacity: 0;
        transform: translateY(4px);
        transition: all 0.2s ease;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .custom-tooltip.show {
        opacity: 1;
        transform: translateY(0);
    }

    .custom-tooltip:after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        margin-left: -5px;
        border: 5px solid transparent;
        border-top-color: #343a40;
    }

    .form-feedback {
        font-size: 0.875rem;
        margin-top: 0.25rem;
    }

    .invalid-feedback {
        color: #dc3545;
    }

    .form-floating.focused label {
        color: #0d6efd !important;
    }

    .form-floating.filled:not(.focused) label {
        color: #198754 !important;
    }
`;

// Adiciona estilos ao documento
if (!document.querySelector('#modern-form-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'modern-form-styles';
    styleSheet.textContent = tooltipStyles;
    document.head.appendChild(styleSheet);
}

// Inicializa quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new ModernFormEnhancements();
    });
} else {
    new ModernFormEnhancements();
}

// Exporta para uso global
window.ModernFormEnhancements = ModernFormEnhancements;