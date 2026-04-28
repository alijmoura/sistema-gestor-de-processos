/**
 * @file formValidation.js
 * @description Módulo para validação nativa de formulários usando Bootstrap 5
 */

/**
 * Configuração de validação para o formulário de login
 */
export function initializeLoginValidation() {
    console.log(' Inicializando validação nativa para formulário de login');
    initializeBasicValidation();
    return {
        validate: async () => {
            const form = document.getElementById('login-form');
            if (!form) return 'Invalid';
            return runBasicValidation(form) ? 'Valid' : 'Invalid';
        }
    };
}

/**
 * Validação básica nativa para formulário de login
 */
function initializeBasicValidation() {
    const form = document.getElementById('login-form');
    if (!form) return;

    if (form.dataset.basicValidationInitialized === 'true') {
        return;
    }
    form.dataset.basicValidationInitialized = 'true';
    
    // Validação em tempo real
    const inputs = form.querySelectorAll('input[required]');
    inputs.forEach(input => {
        input.addEventListener('blur', validateField);
        input.addEventListener('input', clearFieldError);
    });
    
    console.log(' Validação básica inicializada para formulário de login');
}

/**
 * Executa validação básica do formulário
 */
function runBasicValidation(form) {
    if (!form) return false;

    let isValid = true;
    
    // Limpa erros anteriores
    clearAllErrors(form);
    
    // Valida email
    const emailInput = form.querySelector('#email');
    if (emailInput) {
        if (!emailInput.value.trim()) {
            showFieldError(emailInput, 'O e-mail é obrigatório');
            isValid = false;
        } else if (!isValidEmail(emailInput.value)) {
            showFieldError(emailInput, 'Por favor, insira um e-mail válido');
            isValid = false;
        }
    }
    
    // Valida senha
    const passwordInput = form.querySelector('#password');
    if (passwordInput) {
        if (!passwordInput.value.trim()) {
            showFieldError(passwordInput, 'A senha é obrigatória');
            isValid = false;
        } else if (passwordInput.value.length < 6) {
            showFieldError(passwordInput, 'A senha deve ter pelo menos 6 caracteres');
            isValid = false;
        }
    }
    
    return isValid;
}

/**
 * Valida um campo individual
 */
function validateField(e) {
    const input = e.target;
    clearFieldError(input);
    
    if (input.type === 'email') {
        if (input.value.trim() && !isValidEmail(input.value)) {
            showFieldError(input, 'Por favor, insira um e-mail válido');
        }
    }
    
    if (input.required && !input.value.trim()) {
        const label = input.closest('.mb-3, .mb-4')?.querySelector('label')?.textContent || 'Campo';
        showFieldError(input, `${label} é obrigatório`);
    }
}

/**
 * Limpa erro de um campo
 */
function clearFieldError(e) {
    const input = e?.target ?? e;
    if (!input) return;
    const container = input.closest('.mb-3, .mb-4');
    const errorElement = container?.querySelector('.invalid-feedback');
    
    input.classList.remove('is-invalid');
    if (errorElement) {
        errorElement.remove();
    }
}

/**
 * Mostra erro em um campo
 */
function showFieldError(input, message) {
    input.classList.add('is-invalid');
    
    const container = input.closest('.mb-3, .mb-4');
    if (container) {
        // Remove erro anterior se existir
        const existingError = container.querySelector('.invalid-feedback');
        if (existingError) {
            existingError.remove();
        }
        
        // Adiciona novo erro
        const errorDiv = document.createElement('div');
        errorDiv.className = 'invalid-feedback';
        errorDiv.textContent = message;
        container.appendChild(errorDiv);
    }
}

/**
 * Limpa todos os erros do formulário
 */
function clearAllErrors(form) {
    const inputs = form.querySelectorAll('.is-invalid');
    inputs.forEach(input => input.classList.remove('is-invalid'));
    
    const errors = form.querySelectorAll('.invalid-feedback');
    errors.forEach(error => error.remove());
}

/**
 * Valida formato de email
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Configuração básica para outros formulários (placeholder)
 */
export function initializeUserFormValidation() {
    console.log(' Validação de formulário de usuário não implementada na versão básica');
    return null;
}

export function initializeContractFormValidation() {
    console.log(' Validação de formulário de contrato não implementada na versão básica');
    return null;
}

export function initializeEditContractFormValidation() {
    console.log(' Validação de edição de contrato não implementada na versão básica');
    return null;
}

export function initializeStatusFormValidation() {
    console.log(' Validação de formulário de status não implementada na versão básica');
    return null;
}

/**
 * Função para validar todos os formulários (placeholder)
 */
export function initializeAllValidations() {
    console.log(' Sistema de validação básica inicializado');
    
    // Inicializa máscaras de CPF em campos conhecidos
    const cpfFields = [
        'profile-cpf',
        'new-user-cpf'
    ];
    
    cpfFields.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            applyCPFMask(input);
            // Define maxlength para 14 caracteres (xxx.xxx.xxx-xx)
            input.setAttribute('maxlength', '14');
        }
    });

    // Inicializa máscara de Documento (CPF/CNPJ)
    const documentFields = [
        'edit-client-document'
    ];

    documentFields.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            applyDocumentMask(input);
            input.setAttribute('maxlength', '18'); // CNPJ formatado
        }
    });
    
    // Em uma implementação completa, aqui verificaríamos quais formulários existem
    // e inicializaríamos suas validações apropriadas
}

/**
 * Formata CPF para o padrão xxx.xxx.xxx-xx
 * @param {string} value - Valor atual do input
 * @returns {string} - Valor formatado
 */
export function formatCPF(value) {
    // Remove tudo que não é dígito
    let v = value.replace(/\D/g, "");
    
    // Limita a 11 dígitos
    v = v.substring(0, 11);
    
    // Aplica a máscara
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    
    return v;
}

/**
 * Formata Documento (CPF ou CNPJ)
 * @param {string} value - Valor atual
 * @returns {string} - Valor formatado
 */
export function formatDocument(value) {
    let v = value.replace(/\D/g, "");
    
    if (v.length <= 11) {
        // CPF
        return formatCPF(v);
    } else {
        // CNPJ
        v = v.substring(0, 14);
        v = v.replace(/^(\d{2})(\d)/, "$1.$2");
        v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
        v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
        v = v.replace(/(\d{4})(\d)/, "$1-$2");
        return v;
    }
}

/**
 * Aplica máscara de CPF a um input
 * @param {HTMLInputElement} input - Elemento input
 */
export function applyCPFMask(input) {
    if (!input) return;
    
    const handler = (e) => {
        e.target.value = formatCPF(e.target.value);
    };
    
    input.addEventListener('input', handler);
    input.addEventListener('paste', (e) => {
        setTimeout(() => {
            e.target.value = formatCPF(e.target.value);
        }, 10);
    });
    
    if (input.value) {
        input.value = formatCPF(input.value);
    }
}

/**
 * Aplica máscara de Documento (CPF/CNPJ) a um input
 * @param {HTMLInputElement} input - Elemento input
 */
export function applyDocumentMask(input) {
    if (!input) return;
    
    const handler = (e) => {
        e.target.value = formatDocument(e.target.value);
    };
    
    input.addEventListener('input', handler);
    input.addEventListener('paste', (e) => {
        setTimeout(() => {
            e.target.value = formatDocument(e.target.value);
        }, 10);
    });
    
    if (input.value) {
        input.value = formatDocument(input.value);
    }
}
