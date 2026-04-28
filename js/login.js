import { auth } from './auth.js';
import { initializeLoginValidation } from './formValidation.js';
import { resolvePostLoginDestination } from './authRedirect.js';

// Seleciona os elementos do formulário
const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');

// Inicializa a validação do formulário
let formValidation;
let loginInProgress = false;

document.addEventListener('DOMContentLoaded', () => {
    formValidation = initializeLoginValidation();

    // Verifica se houve logout por inatividade
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reason') === 'inactivity') {
        showError('Sua sessão expirou por inatividade (12h). Por favor, faça login novamente.');
    }
});

// Função para mostrar mensagem de erro
function showError(message) {
    if (errorText) {
        errorText.textContent = message;
    }
    if (errorMessage) {
        errorMessage.classList.remove('d-none');
        errorMessage.classList.add('show');
    }
}

// Função para esconder mensagem de erro
function hideError() {
    if (errorMessage) {
        errorMessage.classList.add('d-none');
        errorMessage.classList.remove('show');
    }
}

// Adiciona um "ouvinte" para o evento de envio do formulário
loginForm.addEventListener('submit', (event) => {
    event.preventDefault(); // Impede que a página recarregue

    if (loginInProgress) {
        return;
    }
    
    // Esconde erro anterior
    hideError();

    // Valida o formulário primeiro
    if (formValidation) {
        formValidation.validate().then((status) => {
            if (status === 'Valid') {
                performLogin();
            }
        });
    } else {
        performLogin();
    }
});

// Função para realizar o login
function performLogin() {
    // Pega os valores digitados pelo usuário
    const email = loginForm.email.value;
    const password = loginForm.password.value;
    
    performLoginWithData(email, password);
}

// Função para realizar login com dados fornecidos
function performLoginWithData(email, password) {
    if (loginInProgress) {
        return;
    }

    // Adiciona indicador de loading ao botão
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const originalContent = submitButton.innerHTML;
    submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Entrando...';
    submitButton.disabled = true;
    loginInProgress = true;

    if (!auth || typeof auth.signInWithEmailAndPassword !== 'function') {
        submitButton.innerHTML = originalContent;
        submitButton.disabled = false;
        loginInProgress = false;
        showError('Serviço de autenticação indisponível. Recarregue a página e tente novamente.');
        return;
    }

    // Usa a função de login do Firebase
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Se o login for bem-sucedido...
            console.log('Login bem-sucedido!', userCredential.user);
            
            // Mostra sucesso temporariamente
            submitButton.innerHTML = '<i class="bi bi-check-circle me-2"></i>Sucesso!';
            submitButton.classList.replace('btn-primary', 'btn-success');

            // Redireciona imediatamente após login
            window.location.href = resolvePostLoginDestination('index.html');
        })
        .catch((error) => {
            // Se ocorrer um erro...
            console.error('Erro de login:', error.code, error.message);

            // Restaura o botão
            submitButton.innerHTML = originalContent;
            submitButton.disabled = false;
            loginInProgress = false;

            // Define mensagem de erro baseada no código do erro
            let errorMsg = 'E-mail ou senha incorretos. Tente novamente.';
            
            switch (error.code) {
                case 'auth/user-not-found':
                    errorMsg = 'Usuário não encontrado. Verifique o e-mail digitado.';
                    break;
                case 'auth/wrong-password':
                    errorMsg = 'Senha incorreta. Tente novamente.';
                    break;
                case 'auth/invalid-email':
                    errorMsg = 'E-mail inválido. Verifique o formato do e-mail.';
                    break;
                case 'auth/user-disabled':
                    errorMsg = 'Esta conta foi desabilitada. Entre em contato com o administrador.';
                    break;
                case 'auth/too-many-requests':
                    errorMsg = 'Muitas tentativas de login. Tente novamente mais tarde.';
                    break;
                default:
                    errorMsg = 'Erro ao fazer login. Tente novamente.';
            }

            // Mostra a mensagem de erro
            showError(errorMsg);
        });
}
