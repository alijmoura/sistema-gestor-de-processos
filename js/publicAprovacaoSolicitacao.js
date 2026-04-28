const PUBLIC_FUNCTIONS_BASE_URL = 'https://southamerica-east1-sistema-gestor-de-processos-demo.cloudfunctions.net';
const SUBMIT_INTAKE_ENDPOINT = `${PUBLIC_FUNCTIONS_BASE_URL}/submitAprovacaoIntake`;
const MAX_FILES = 8;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_SIZE_BYTES = 18 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const state = {
  token: ''
};

function sanitizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || '');
    reader.onerror = () => reject(new Error(`Falha ao ler o arquivo ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function resolveErrorMessage(errorCode) {
  const map = {
    token_required: 'O link de solicitação está incompleto. Solicite um novo link ao atendimento.',
    token_invalido: 'Este link não é válido. Solicite um novo link ao atendimento.',
    token_inativo: 'Este link foi desativado. Solicite um novo link ao atendimento.',
    token_expirado: 'Este link expirou. Solicite um novo link ao atendimento.',
    token_sem_uso_disponivel: 'Este link já foi utilizado no limite permitido.',
    nome_obrigatorio: 'Informe o nome completo para continuar.',
    cpf_invalido: 'Informe um CPF válido com 11 dígitos.',
    contato_obrigatorio: 'Informe ao menos um canal de contato (telefone ou e-mail).',
    consentimento_lgpd_obrigatorio: 'É necessário aceitar o consentimento LGPD para envio da solicitação.',
    documentos_limite_quantidade: `Você pode enviar no máximo ${MAX_FILES} arquivos por solicitação.`,
    documento_tipo_invalido: 'Um ou mais anexos estão em formato inválido. Use PDF, JPG, PNG ou WEBP.',
    documento_tamanho_invalido: 'Um ou mais anexos excedem o tamanho máximo permitido por arquivo.',
    documentos_tamanho_total_excedido: 'O total dos anexos excede o limite permitido para envio.',
    documento_payload_invalido: 'Não foi possível ler um dos anexos enviados.',
    too_many_requests: 'Foram detectadas muitas tentativas. Aguarde alguns minutos e tente novamente.',
    internal_error: 'Não foi possível concluir agora. Tente novamente em alguns minutos.'
  };

  return map[errorCode] || 'Não foi possível concluir a solicitação. Verifique os dados e tente novamente.';
}

function setSubmitLoading(isLoading) {
  const submitBtn = document.getElementById('intake-submit-btn');
  const submitText = document.getElementById('intake-submit-text');
  const submitSpinner = document.getElementById('intake-submit-spinner');

  if (!submitBtn || !submitText || !submitSpinner) return;

  submitBtn.disabled = isLoading;
  submitSpinner.classList.toggle('d-none', !isLoading);
  submitText.textContent = isLoading ? 'Enviando dados...' : 'Enviar solicitação';
}

function showMessage(type, message) {
  const successBox = document.getElementById('intake-success-box');
  const errorBox = document.getElementById('intake-error-box');
  const successText = document.getElementById('intake-success-text');
  const errorText = document.getElementById('intake-error-text');

  if (!successBox || !errorBox || !successText || !errorText) return;

  successBox.classList.add('d-none');
  errorBox.classList.add('d-none');

  if (type === 'success') {
    successText.textContent = message;
    successBox.classList.remove('d-none');
  }

  if (type === 'error') {
    errorText.textContent = message;
    errorBox.classList.remove('d-none');
  }
}

function renderSelectedFiles(fileList) {
  const container = document.getElementById('intake-file-list');
  if (!container) return;

  const files = Array.from(fileList || []);

  if (files.length === 0) {
    container.innerHTML = '<p class="intake-muted small mb-0">Nenhum arquivo selecionado.</p>';
    return;
  }

  const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);

  container.innerHTML = files.map((file) => {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return `
      <div class="intake-file-item d-flex justify-content-between align-items-center mb-2">
        <span class="small text-truncate pe-2">${file.name}</span>
        <span class="badge bg-light text-dark border">${sizeMb} MB</span>
      </div>
    `;
  }).join('') + `<p class="intake-muted small mb-0">Total selecionado: ${totalMb} MB</p>`;
}

function validateFiles(files) {
  if (files.length > MAX_FILES) {
    return `Você pode enviar no máximo ${MAX_FILES} arquivos por solicitação.`;
  }

  const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  if (totalBytes > MAX_TOTAL_SIZE_BYTES) {
    return 'O total dos anexos excede 18MB. Reduza a quantidade ou tamanho dos arquivos.';
  }

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `O arquivo ${file.name} excede o limite de 8MB.`;
    }

    if (!ALLOWED_FILE_TYPES.has(file.type)) {
      return `O formato do arquivo ${file.name} não é suportado. Use PDF, JPG, PNG ou WEBP.`;
    }
  }

  return '';
}

async function buildDocumentPayload(files, category) {
  const payload = [];

  for (const file of files) {
    const dataUrl = await readFileAsDataUrl(file);
    payload.push({
      name: file.name,
      contentType: file.type,
      size: file.size,
      category,
      base64: dataUrl
    });
  }

  return payload;
}

function resolveToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('t') || '';
}

function updateTokenStatus(hasToken) {
  const tokenStatus = document.getElementById('intake-token-status');
  const formEl = document.getElementById('aprovacao-intake-form');

  if (!tokenStatus || !formEl) return;

  if (hasToken) {
    tokenStatus.innerHTML = '<span class="badge bg-success-subtle text-success border border-success-subtle">Link validado para envio</span>';
    formEl.classList.remove('d-none');
    return;
  }

  tokenStatus.innerHTML = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Link inválido ou ausente</span>';
  formEl.classList.add('d-none');
  showMessage('error', 'Não foi possível identificar um token válido na URL. Solicite um novo link ao atendimento.');
}

async function handleSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  if (!state.token) {
    showMessage('error', 'Não foi possível validar o link de solicitação.');
    return;
  }

  const fileInput = document.getElementById('intake-documentos');
  const files = Array.from(fileInput?.files || []);
  const filesError = validateFiles(files);

  if (filesError) {
    showMessage('error', filesError);
    return;
  }

  setSubmitLoading(true);
  showMessage('', '');

  try {
    const documentos = await buildDocumentPayload(
      files,
      document.getElementById('intake-document-category')?.value || 'outros'
    );

    const payload = {
      token: state.token,
      nomeCompleto: document.getElementById('intake-nome')?.value?.trim(),
      cpf: sanitizeDigits(document.getElementById('intake-cpf')?.value),
      email: document.getElementById('intake-email')?.value?.trim(),
      telefone: sanitizeDigits(document.getElementById('intake-telefone')?.value),
      rendaMensal: document.getElementById('intake-renda')?.value,
      origemContato: document.getElementById('intake-origem')?.value,
      corretorNome: document.getElementById('intake-corretor')?.value?.trim(),
      empreendimentoInteresse: document.getElementById('intake-empreendimento')?.value?.trim(),
      construtoraInteresse: document.getElementById('intake-construtora')?.value?.trim(),
      cartaFinanciamento: document.getElementById('intake-carta')?.value,
      mensagem: document.getElementById('intake-mensagem')?.value?.trim(),
      consentimentoLgpd: document.getElementById('intake-lgpd')?.checked === true,
      documentos
    };

    const response = await fetch(SUBMIT_INTAKE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(resolveErrorMessage(result?.error));
    }

    const protocolo = result?.solicitacaoId || 'gerado';
    const docsInfo = `Documentos enviados: ${result?.documentosEnviados || 0}.`;
    showMessage('success', `Solicitação registrada com sucesso. Protocolo: ${protocolo}. ${docsInfo}`);

    form.reset();
    form.classList.remove('was-validated');
    renderSelectedFiles([]);
  } catch (error) {
    showMessage('error', error.message || 'Erro ao enviar a solicitação.');
  } finally {
    setSubmitLoading(false);
  }
}

function init() {
  state.token = resolveToken();
  updateTokenStatus(Boolean(state.token));

  const fileInput = document.getElementById('intake-documentos');
  const form = document.getElementById('aprovacao-intake-form');

  if (fileInput) {
    fileInput.addEventListener('change', (event) => {
      renderSelectedFiles(event.target.files || []);
    });
  }

  if (form) {
    form.addEventListener('submit', handleSubmit);
  }

  renderSelectedFiles([]);
}

document.addEventListener('DOMContentLoaded', init);
