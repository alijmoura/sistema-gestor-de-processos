/**
 * @file AprovacaoDetailsModal.js
 * @description Modal para visualizar detalhes de uma aprovacao
 */

import aprovacaoService, {
  SITUACAO_APROVACAO,
  SITUACAO_COLORS,
  TIPO_CARTA
} from '../aprovacaoService.js';
import { auth } from '../auth.js';

const MODAL_ID = 'aprovacao-details-modal';
const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const APROVACAO_DOCUMENTS_FUNCTION_REGION = 'us-central1';

let modalInstance = null;
let currentAprovacao = null;
let errosUnsubscribe = null;
let errosBadgeUnsubscribe = null;

/**
 * Renderiza o modal no DOM
 */
function render() {
  const existing = document.getElementById(MODAL_ID);
  if (existing) {
    existing.remove();
  }

  const html = `
    <div class="modal fade" id="${MODAL_ID}" tabindex="-1" aria-labelledby="aprovacao-details-title" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white" id="aprovacao-details-header">
            <h5 class="modal-title" id="aprovacao-details-title">
              <i class="bi bi-file-text me-2"></i>
              Detalhes da Aprovacao
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body" id="aprovacao-details-content">
            <!-- Conteudo dinamico -->
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              <i class="bi bi-x-lg me-1"></i>Fechar
            </button>
            <button type="button" class="btn btn-outline-danger d-none" id="aprovacao-details-delete">
              <i class="bi bi-trash me-1"></i>Excluir
            </button>
            <button type="button" class="btn btn-outline-primary" id="aprovacao-details-edit">
              <i class="bi bi-pencil me-1"></i>Editar
            </button>
            <button type="button" class="btn btn-success d-none" id="aprovacao-details-convert">
              <i class="bi bi-arrow-right-circle me-1"></i>Converter para Processo
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  // Eventos
  document.getElementById('aprovacao-details-delete')?.addEventListener('click', handleDelete);
  document.getElementById('aprovacao-details-edit')?.addEventListener('click', handleEdit);
  document.getElementById('aprovacao-details-convert')?.addEventListener('click', handleConvert);

  return document.getElementById(MODAL_ID);
}

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function getCurrentUserRole() {
  const roleFromPermissionsHelper = window.permissionsUIHelper?.currentUserPermissions?.role;
  const roleFromAppState = window.appState?.userPermissions?.role;
  return normalizeIdentity(roleFromPermissionsHelper || roleFromAppState);
}

function isCurrentUserAdmin() {
  return ADMIN_ROLES.has(getCurrentUserRole());
}

function isAprovacaoCreatedByCurrentUser(aprovacao) {
  const currentUser = auth.currentUser;
  if (!currentUser) return false;

  const userIdentities = new Set(
    [currentUser.uid, currentUser.email]
      .map(normalizeIdentity)
      .filter(Boolean)
  );
  if (userIdentities.size === 0) return false;

  const creatorCandidates = [
    aprovacao?.criadoPor,
    aprovacao?.createdBy,
    aprovacao?.criadoPorUid,
    aprovacao?.createdByUid,
    aprovacao?.ownerId
  ];

  return creatorCandidates
    .map(normalizeIdentity)
    .some((identity) => identity && userIdentities.has(identity));
}

function canCurrentUserDeleteAprovacao(aprovacao) {
  return isCurrentUserAdmin() || isAprovacaoCreatedByCurrentUser(aprovacao);
}

function formatDocumentSize(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function normalizeAprovacaoDocumentos(aprovacao) {
  if (!Array.isArray(aprovacao?.documentos)) return [];

  return aprovacao.documentos.map((doc, index) => {
    const nome = String(doc?.nome || doc?.name || doc?.type || `Documento ${index + 1}`).trim();
    const categoria = String(doc?.categoria || doc?.type || 'outros').trim();
    const tamanho = Number(doc?.tamanho || doc?.size || 0);
    const storagePath = typeof doc?.storagePath === 'string' ? doc.storagePath.trim() : '';
    const directUrl = typeof doc?.url === 'string' ? doc.url.trim() : '';
    const isSignedDownload = storagePath.startsWith('aprovacao-intake/');

    return {
      nome,
      categoria,
      tamanho,
      storagePath,
      directUrl,
      isSignedDownload
    };
  });
}

async function requestAprovacaoDocumentDownloadUrl(aprovacaoId, storagePath) {
  if (!aprovacaoId || !storagePath) {
    throw new Error('Dados do documento inválidos para download.');
  }

  const firebaseGlobal = window.firebase;
  if (!firebaseGlobal?.app) {
    throw new Error('Firebase não está disponível no navegador.');
  }

  const callable = firebaseGlobal
    .app()
    .functions(APROVACAO_DOCUMENTS_FUNCTION_REGION)
    .httpsCallable('generateAprovacaoDocumentDownloadUrl');

  const response = await callable({ aprovacaoId, storagePath });
  const data = response?.data || {};
  if (!data.url) {
    throw new Error('A função não retornou uma URL válida para download.');
  }

  return data;
}

async function handleDocumentDownload(event, aprovacao) {
  const button = event.currentTarget;
  if (!button || !aprovacao?.id) return;

  const storagePath = button.dataset.storagePath || '';
  const fallbackName = button.dataset.fileName || 'documento';
  if (!storagePath) {
    notify('Documento sem caminho de armazenamento para download.', 'error');
    return;
  }

  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Baixando';

  try {
    const downloadData = await requestAprovacaoDocumentDownloadUrl(aprovacao.id, storagePath);
    const link = document.createElement('a');
    link.href = downloadData.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.download = downloadData.fileName || fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    console.error('[AprovacaoDetailsModal] Erro ao baixar documento:', error);
    notify(error.message || 'Não foi possível baixar o documento.', 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

function bindDocumentActions(container, aprovacao) {
  if (!container) return;

  const buttons = container.querySelectorAll('[data-action="download-aprovacao-documento"]');
  buttons.forEach((button) => {
    button.addEventListener('click', (event) => handleDocumentDownload(event, aprovacao));
  });
}

async function loadLegacyContractAttachments(aprovacao) {
  if (!aprovacao?.id) return null;
  const existingDocuments = Array.isArray(aprovacao?.documentos) ? aprovacao.documentos : [];
  const hasDownloadablePrimaryDocument = existingDocuments.some((doc) => {
    const hasStoragePath = typeof doc?.storagePath === 'string' && doc.storagePath.trim().length > 0;
    const hasPath = typeof doc?.path === 'string' && doc.path.trim().length > 0;
    const hasUrl = typeof doc?.url === 'string' && doc.url.trim().length > 0;
    return hasStoragePath || hasPath || hasUrl;
  });
  if (existingDocuments.length > 0 && hasDownloadablePrimaryDocument) {
    return null;
  }

  try {
    const firestoreModule = await import('../firestoreService.js');
    if (typeof firestoreModule.getContractAttachments !== 'function') {
      return null;
    }

    const attachments = await firestoreModule.getContractAttachments(aprovacao.id);
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return null;
    }

    return attachments.map((attachment, index) => ({
      nome: attachment?.nome || attachment?.name || `Documento ${index + 1}`,
      name: attachment?.name || attachment?.nome || `Documento ${index + 1}`,
      categoria: attachment?.categoria || attachment?.type || 'outros',
      type: attachment?.type || attachment?.categoria || 'outros',
      tamanho: Number(attachment?.tamanho || attachment?.size || 0),
      size: Number(attachment?.size || attachment?.tamanho || 0),
      storagePath: attachment?.storagePath || attachment?.path || '',
      path: attachment?.path || attachment?.storagePath || '',
      url: attachment?.url || ''
    }));
  } catch (error) {
    console.warn('[AprovacaoDetailsModal] Nao foi possivel carregar anexos legados:', error);
    return null;
  }
}

function updateAprovacaoErrosBadge(pendingCount = 0) {
  const badge = document.getElementById('tab-gestao-erros-aprovacao-badge');
  if (!badge) return;
  const safeCount = Number.isFinite(pendingCount) ? Math.max(0, pendingCount) : 0;
  badge.textContent = safeCount;
  badge.style.display = safeCount > 0 ? '' : 'none';
}

/**
 * Renderiza o conteudo do modal
 */
function renderContent(aprovacao) {
  const container = document.getElementById('aprovacao-details-content');
  if (!container) return;

  const situacaoColor = SITUACAO_COLORS[aprovacao.situacao] || SITUACAO_COLORS[SITUACAO_APROVACAO.CONDICIONADO];

  // Formata datas
  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    
    const toBR = (date) => {
      // Usa Intl para pegar componentes da data no timezone de Brasília
      const options = { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit',
        timeZone: 'America/Sao_Paulo'
      };
      const formatted = new Intl.DateTimeFormat('pt-BR', options).format(date);
      const [dia, mes, ano] = formatted.split('/');
      return `${dia}-${mes}-${ano}`;
    };

    if (timestamp?.toDate) {
      const dateFromTimestamp = timestamp.toDate();
      if (!Number.isNaN(dateFromTimestamp?.getTime?.())) {
        return toBR(dateFromTimestamp);
      }
    }

    if (timestamp?.toMillis) {
      const dateFromMillis = new Date(timestamp.toMillis());
      if (!Number.isNaN(dateFromMillis.getTime())) {
        return toBR(dateFromMillis);
      }
    }

    if (timestamp instanceof Date) {
      if (!Number.isNaN(timestamp.getTime())) {
        return toBR(timestamp);
      }
    }

    if (typeof timestamp === 'number') {
      const dateFromNumber = new Date(timestamp);
      if (!Number.isNaN(dateFromNumber.getTime())) {
        return toBR(dateFromNumber);
      }
    }

    if (typeof timestamp === 'object') {
      const seconds = typeof timestamp.seconds === 'number'
        ? timestamp.seconds
        : (typeof timestamp._seconds === 'number' ? timestamp._seconds : null);
      const nanoseconds = typeof timestamp.nanoseconds === 'number'
        ? timestamp.nanoseconds
        : (typeof timestamp._nanoseconds === 'number' ? timestamp._nanoseconds : 0);

      if (seconds !== null) {
        const dateFromSerializedTimestamp = new Date((seconds * 1000) + Math.floor(nanoseconds / 1000000));
        if (!Number.isNaN(dateFromSerializedTimestamp.getTime())) {
          return toBR(dateFromSerializedTimestamp);
        }
      }
    }

    const str = typeof timestamp === 'string' ? timestamp.trim() : '';
    if (!str) return '-';

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const [year, month, day] = str.split('-');
      return `${day}-${month}-${year}`;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      return str.replace(/\//g, '-');
    }
    if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
      return str;
    }

    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return toBR(parsed);
    }

    return str;
  };

  // Formata valor monetario
  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const number = typeof value === 'number'
      ? value
      : parseFloat(String(value).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
    if (Number.isNaN(number)) return '-';
    return `R$ ${number.toFixed(2).replace('.', ',')}`;
  };

  const compradores = getAprovacaoCompradores(aprovacao);
  const principal = compradores.find(comp => comp.principal) || compradores[0];
  const nomePrincipal = principal?.nome || aprovacao.clientePrincipal || aprovacao.nomeClientePrincipal || '-';
  const cpfPrincipal = principal?.cpf || aprovacao.cpfPrincipal || '-';
  const nomesSecundarios = compradores.length > 1
    ? compradores.filter((comp) => comp !== principal).map(comp => comp.nome).filter(Boolean)
    : [];
  const cpfsSecundarios = compradores.length > 1
    ? compradores.filter((comp) => comp !== principal).map(comp => comp.cpf).filter(Boolean)
    : [];
  const documentos = normalizeAprovacaoDocumentos(aprovacao);

  // Atualiza cor do header conforme situacao
  const headerEl = document.getElementById('aprovacao-details-header');
  if (headerEl) {
    headerEl.className = `modal-header ${situacaoColor.bg} ${situacaoColor.text}`;
    const closeBtn = headerEl.querySelector('.btn-close');
    if (closeBtn) {
      closeBtn.classList.toggle('btn-close-white', situacaoColor.text === 'text-white');
    }
  }

  // Atualiza titulo com nome do cliente
  const titleEl = document.getElementById('aprovacao-details-title');
  if (titleEl) {
    titleEl.innerHTML = `
      <i class="bi ${situacaoColor.icon} me-2"></i>
      ${escapeHtml(nomePrincipal !== '-' ? nomePrincipal : 'Detalhes da Aprovacao')}
    `;
  }

  // Checklist de aprovacao
  const checklistItems = Array.isArray(aprovacao.checklistAprovacao?.itensMarcados)
    ? aprovacao.checklistAprovacao.itensMarcados
    : [];

  // Secao Dados do Cliente
  const dadosClienteHtml = `
    <div class="card mb-3">
      <div class="card-header bg-light">
        <i class="bi bi-person me-2"></i>Dados do Cliente
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <small class="text-muted d-block">Nome</small>
            <span class="fw-medium">${escapeHtml(nomePrincipal)}</span>
            ${nomesSecundarios.length > 0 ? `<br><small class="text-muted"><i class="bi bi-people me-1"></i>${escapeHtml(nomesSecundarios.join(' / '))}</small>` : ''}
          </div>
          <div class="col-md-6">
            <small class="text-muted d-block">CPF</small>
            <code class="fw-medium">${escapeHtml(cpfPrincipal)}</code>
            ${cpfsSecundarios.length > 0 ? `<br><small class="text-muted">${escapeHtml(cpfsSecundarios.join(' / '))}</small>` : ''}
          </div>
          <div class="col-lg-4 col-md-6">
            <small class="text-muted d-block">Data de Entrada</small>
            <span class="fw-medium"><i class="bi bi-calendar-event me-1 text-muted"></i>${formatDate(aprovacao.dataEntrada)}</span>
          </div>
          <div class="col-lg-4 col-md-6">
            <small class="text-muted d-block">Data de Aprovacao</small>
            <span class="fw-medium"><i class="bi bi-calendar-check me-1 text-muted"></i>${formatDate(aprovacao.dataAprovacao)}</span>
          </div>
          <div class="col-lg-4 col-md-6">
            <small class="text-muted d-block">Vencimento SICAQ</small>
            <span class="fw-medium"><i class="bi bi-calendar-x me-1 text-muted"></i>${formatDate(aprovacao.vencSicaq)}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Secao Empreendimento
  const empreendimentoHtml = `
    <div class="card mb-3">
      <div class="card-header bg-light">
        <i class="bi bi-building me-2"></i>Empreendimento
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <small class="text-muted d-block">Construtora</small>
            <span class="fw-medium">${escapeHtml(aprovacao.construtora || '-')}</span>
          </div>
          <div class="col-md-6">
            <small class="text-muted d-block">Empreendimento</small>
            <span class="fw-medium">${escapeHtml(aprovacao.empreendimento || '-')}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Secao Participantes
  const participantesHtml = `
    <div class="card mb-3">
      <div class="card-header bg-light">
        <i class="bi bi-people me-2"></i>Participantes
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-4">
            <small class="text-muted d-block">Corretor</small>
            <span class="fw-medium">${escapeHtml(aprovacao.corretor || '-')}</span>
          </div>
          <div class="col-md-4">
            <small class="text-muted d-block">Gerente / Imobiliaria</small>
            <span class="fw-medium">${escapeHtml(aprovacao.gerenteImobiliaria || '-')}</span>
          </div>
          <div class="col-md-4">
            <small class="text-muted d-block">Analista Aprovacao</small>
            <span class="fw-medium">${escapeHtml(aprovacao.analistaAprovacao || '-')}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Secao Resultado da Analise
  const resultadoHtml = `
    <div class="card mb-3">
      <div class="card-header bg-light">
        <i class="bi bi-clipboard-check me-2"></i>Resultado da Analise
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <small class="text-muted d-block">Situacao</small>
            <span class="badge ${situacaoColor.bg} ${situacaoColor.text} fs-6 px-3 py-2">
              <i class="bi ${situacaoColor.icon} me-1"></i>${escapeHtml(aprovacao.situacao || '-')}
            </span>
            ${aprovacao.convertidoParaProcesso ? `
              <span class="badge bg-info ms-2">
                <i class="bi bi-arrow-right-circle me-1"></i>Convertido
              </span>
            ` : ''}
          </div>
          <div class="col-md-6">
            <small class="text-muted d-block">Carta de Financiamento</small>
            <span class="badge ${aprovacao.cartaFinanciamento === TIPO_CARTA.MCMV ? 'bg-primary' : aprovacao.cartaFinanciamento === TIPO_CARTA.SBPE ? 'bg-info' : 'bg-secondary'} fs-6 px-3 py-2">
              ${escapeHtml(aprovacao.cartaFinanciamento || 'MCMV')}
            </span>
          </div>
          ${aprovacao.pendencia ? `
            <div class="col-12">
              <small class="text-muted d-block">Pendencia / Observacoes</small>
              <div class="alert alert-warning mb-0 mt-1">
                <i class="bi bi-exclamation-triangle me-1"></i>
                ${escapeHtml(aprovacao.pendencia)}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  // Secao Financiamento
  const financiamentoHtml = `
    <div class="card mb-3">
      <div class="card-header bg-light">
        <i class="bi bi-cash-stack me-2"></i>Dados do Financiamento
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-4">
            <small class="text-muted d-block">Renda</small>
            <span class="fw-medium fs-6">${formatCurrency(aprovacao.renda)}</span>
          </div>
          <div class="col-md-4">
            <small class="text-muted d-block">Valor Financiamento</small>
            <span class="fw-medium fs-6">${formatCurrency(aprovacao.valorFinanciamento)}</span>
          </div>
          <div class="col-md-4">
            <small class="text-muted d-block">Prazo</small>
            <span class="fw-medium fs-6">${aprovacao.prazoMeses ? `${aprovacao.prazoMeses} meses` : '-'}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Secao Documentos
  const documentosHtml = `
    <div class="card mb-3">
      <div class="card-header bg-light d-flex justify-content-between align-items-center">
        <span><i class="bi bi-file-earmark-arrow-up me-2"></i>Documentos Anexados</span>
        <span class="badge bg-secondary">${documentos.length}</span>
      </div>
      <div class="card-body">
        ${documentos.length === 0 ? `
          <div class="text-center py-3">
            <i class="bi bi-folder2-open display-6 text-muted"></i>
            <p class="mt-2 mb-0 text-muted">Nenhum documento vinculado a esta aprovacao.</p>
          </div>
        ` : `
          <div class="list-group list-group-flush">
            ${documentos.map((doc, idx) => {
    const isImage = /\.(jpg|jpeg|png)$/i.test(doc.nome);
    const fileIcon = isImage ? 'bi-file-image' : 'bi-file-pdf';
    return `
              <div class="list-group-item px-0 ${idx === 0 ? 'pt-0' : ''}">
                <div class="d-flex align-items-center gap-3">
                  <i class="bi ${fileIcon} fs-4 text-primary"></i>
                  <div class="flex-grow-1">
                    <div class="fw-medium">${escapeHtml(doc.nome)}</div>
                    <small class="text-muted">
                      <span class="badge bg-light text-dark border me-2">${escapeHtml(doc.categoria || '-')}</span>
                      ${formatDocumentSize(doc.tamanho)}
                    </small>
                  </div>
                  <div>
                    ${doc.isSignedDownload ? `
                      <button
                        type="button"
                        class="btn btn-outline-primary btn-sm"
                        data-action="download-aprovacao-documento"
                        data-storage-path="${escapeHtml(doc.storagePath)}"
                        data-file-name="${escapeHtml(doc.nome)}"
                        title="Baixar documento"
                      >
                        <i class="bi bi-download me-1"></i>Baixar
                      </button>
                    ` : doc.directUrl ? `
                      <a
                        href="${escapeHtml(doc.directUrl)}"
                        target="_blank"
                        rel="noopener"
                        class="btn btn-outline-secondary btn-sm"
                        title="Abrir documento"
                      >
                        <i class="bi bi-box-arrow-up-right me-1"></i>Abrir
                      </a>
                    ` : `
                      <span class="text-muted small">Indisponivel</span>
                    `}
                  </div>
                </div>
              </div>
            `;
  }).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  // Secao Checklist
  const checklistHtml = checklistItems.length > 0 ? `
    <div class="card mb-3">
      <div class="card-header bg-light">
        <i class="bi bi-list-check me-2"></i>Checklist de Aprovacao
      </div>
      <div class="card-body">
        <div class="row g-2">
          ${checklistItems.map(item => `
            <div class="col-md-6">
              <div class="d-flex align-items-center gap-2 p-2 border rounded">
                <i class="bi bi-check-circle-fill text-success"></i>
                <span>${escapeHtml(item.id?.replace(/([A-Z])/g, ' $1')?.trim() || item.id || '-')}</span>
                <span class="badge bg-light text-dark border ms-auto">${escapeHtml(item.produto || '-')}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  ` : '';

  // Secao Auditoria
  const auditoriaHtml = `
    <div class="card border-0 bg-light">
      <div class="card-body py-2">
        <div class="d-flex flex-wrap gap-3 text-muted small">
          <span>
            <i class="bi bi-clock me-1"></i>
            Criado em <strong>${formatDate(aprovacao.createdAt || aprovacao.criadoEm || aprovacao.entrada)}</strong>
            por <strong>${escapeHtml(aprovacao.criadoPor || '-')}</strong>
          </span>
          ${(aprovacao.updatedAt || aprovacao.dataModificacao) ? `
            <span>
              <i class="bi bi-pencil-square me-1"></i>
              Atualizado em <strong>${formatDate(aprovacao.updatedAt || aprovacao.dataModificacao)}</strong>
              ${aprovacao.atualizadoPor ? `por <strong>${escapeHtml(aprovacao.atualizadoPor)}</strong>` : ''}
            </span>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = `
    <!-- Tabs de navegacao -->
    <ul class="nav nav-tabs mb-3" id="aprovacao-details-tabs" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" id="aprovacao-tab-dados-btn" data-bs-toggle="tab" data-bs-target="#aprovacao-tab-dados" type="button" role="tab">
          <i class="bi bi-person me-1"></i>Dados
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="aprovacao-tab-docs-btn" data-bs-toggle="tab" data-bs-target="#aprovacao-tab-docs" type="button" role="tab">
          <i class="bi bi-file-earmark-arrow-up me-1"></i>Documentos
          <span class="badge bg-secondary ms-1">${documentos.length}</span>
        </button>
      </li>
      ${checklistItems.length > 0 ? `
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="aprovacao-tab-checklist-btn" data-bs-toggle="tab" data-bs-target="#aprovacao-tab-checklist" type="button" role="tab">
          <i class="bi bi-list-check me-1"></i>Checklist
          <span class="badge bg-success ms-1">${checklistItems.length}</span>
        </button>
      </li>
      ` : ''}
      <li class="nav-item" role="presentation">
        <button class="nav-link d-flex align-items-center gap-2" id="aprovacao-tab-erros-btn" data-bs-toggle="tab" data-bs-target="#aprovacao-tab-erros" type="button" role="tab">
          <span><i class="bi bi-bug me-1"></i>Erros (QA)</span>
          <span id="tab-gestao-erros-aprovacao-badge" class="badge rounded-pill bg-danger" style="display: none;">0</span>
        </button>
      </li>
    </ul>

    <div class="tab-content" id="aprovacao-details-tabs-content">
      <!-- Tab: Dados -->
      <div class="tab-pane fade show active" id="aprovacao-tab-dados" role="tabpanel" aria-labelledby="aprovacao-tab-dados-btn">
        ${resultadoHtml}
        ${dadosClienteHtml}
        ${empreendimentoHtml}
        ${participantesHtml}
        ${financiamentoHtml}
        ${auditoriaHtml}
      </div>

      <!-- Tab: Documentos -->
      <div class="tab-pane fade" id="aprovacao-tab-docs" role="tabpanel" aria-labelledby="aprovacao-tab-docs-btn">
        ${documentosHtml}
      </div>

      ${checklistItems.length > 0 ? `
      <!-- Tab: Checklist -->
      <div class="tab-pane fade" id="aprovacao-tab-checklist" role="tabpanel" aria-labelledby="aprovacao-tab-checklist-btn">
        ${checklistHtml}
      </div>
      ` : ''}

      <!-- Tab: Erros (QA) -->
      <div class="tab-pane fade" id="aprovacao-tab-erros" role="tabpanel" aria-labelledby="aprovacao-tab-erros-btn">
        <div class="card border-0 shadow-sm">
          <div class="card-header bg-light d-flex align-items-center">
            <i class="bi bi-bug text-danger me-2"></i>
            <h6 class="mb-0">Gestao de Erros (QA)</h6>
          </div>
          <div class="card-body" id="aprovacao-erros-container">
            <div class="text-center py-4">
              <div class="spinner-border text-danger" role="status">
                <span class="visually-hidden">Carregando...</span>
              </div>
              <p class="mt-2 mb-0 text-muted small">Abra a aba para carregar os erros.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindDocumentActions(container, aprovacao);

  const svc = window.errorManagementService;
  if (errosBadgeUnsubscribe) {
    errosBadgeUnsubscribe();
    errosBadgeUnsubscribe = null;
  }
  if (svc?.listarPendenciasVisiveis && aprovacao?.id) {
    errosBadgeUnsubscribe = svc.listarPendenciasVisiveis('aprovacoes', aprovacao.id, updateAprovacaoErrosBadge);
  } else {
    updateAprovacaoErrosBadge(0);
  }

  // Lazy load de erros (QA) ao abrir a aba
  const errosTabButton = document.getElementById('aprovacao-tab-erros-btn');
  if (errosTabButton) {
    let errosLoaded = false;
    errosTabButton.addEventListener('shown.bs.tab', () => {
      if (errosLoaded) return;
      errosLoaded = true;

      const errosContainer = document.getElementById('aprovacao-erros-container');
      if (errosContainer && aprovacao?.id) {
        // Limpa listener anterior
        if (errosUnsubscribe) {
          errosUnsubscribe();
          errosUnsubscribe = null;
        }
        if (svc) {
          errosUnsubscribe = svc.renderErrosSection(errosContainer, 'aprovacoes', aprovacao.id, 'aprovacao');
        } else {
          errosContainer.innerHTML = '<p class="text-muted text-center py-3">Servico de erros nao disponivel.</p>';
        }
      }
    });
  }

  // Mostra/esconde botao de conversao
  const convertBtn = document.getElementById('aprovacao-details-convert');
  if (convertBtn) {
    if (aprovacao.situacao === SITUACAO_APROVACAO.APROVADO && !aprovacao.convertidoParaProcesso) {
      convertBtn.classList.remove('d-none');
    } else {
      convertBtn.classList.add('d-none');
    }
  }

  const deleteBtn = document.getElementById('aprovacao-details-delete');
  if (deleteBtn) {
    if (canCurrentUserDeleteAprovacao(aprovacao)) {
      deleteBtn.classList.remove('d-none');
    } else {
      deleteBtn.classList.add('d-none');
    }
  }
}

/**
 * Trata clique em editar
 */
function handleEdit() {
  if (!currentAprovacao) return;
  const aprovacaoToEdit = currentAprovacao;

  close();

  import('./AddAprovacaoModal.js').then(module => {
    // Carrega vendors antes de abrir
    import('../firestoreService.js').then(fs => {
      fs.getAllVendors().then(vendors => {
        module.default.open(vendors, aprovacaoToEdit);
      });
    });
  }).catch(error => {
    console.error('[AprovacaoDetailsModal] Erro ao abrir modal de edicao:', error);
    notify(`Nao foi possivel abrir a edicao: ${error.message || 'erro desconhecido'}`, 'error');
  });
}

function getAprovacaoCompradores(aprovacao) {
  if (Array.isArray(aprovacao.compradores) && aprovacao.compradores.length > 0) {
    return aprovacao.compradores.map((comprador, index) => ({
      cpf: comprador.cpf || '',
      nome: comprador.nome || '',
      principal: comprador.principal ?? index === 0
    }));
  }

  const cpfs = Array.isArray(aprovacao.cpfs) ? aprovacao.cpfs : [];
  const nomes = Array.isArray(aprovacao.nomesClientes) ? aprovacao.nomesClientes : [];
  const maxLength = Math.max(cpfs.length, nomes.length);
  if (maxLength === 0 && (aprovacao.cpfPrincipal || aprovacao.nomeClientePrincipal || aprovacao.clientePrincipal)) {
    return [{
      cpf: aprovacao.cpfPrincipal || '',
      nome: aprovacao.clientePrincipal || aprovacao.nomeClientePrincipal || '',
      principal: true
    }];
  }

  const compradores = [];
  for (let i = 0; i < maxLength; i += 1) {
    compradores.push({
      cpf: cpfs[i] || '',
      nome: nomes[i] || '',
      principal: i === 0
    });
  }
  return compradores;
}

function notify(message, type = 'info') {
  if (window.uiHelpers?.showToast) {
    window.uiHelpers.showToast(message, type);
    return;
  }

  console.log(`[AprovacaoDetailsModal] ${message}`);
}

/**
 * Trata clique em converter
 */
async function handleConvert() {
  if (!currentAprovacao) return;

  let conversionOptions = null;
  try {
    const convertModal = await import('./AprovacaoConvertProcessModal.js');
    conversionOptions = await convertModal.default.open(currentAprovacao);
  } catch (error) {
    console.error('[AprovacaoDetailsModal] Erro ao abrir modal de conversao:', error);
    notify(`Nao foi possivel abrir a janela de conversao: ${error.message || 'erro desconhecido'}`, 'error');
    return;
  }

  if (!conversionOptions) return;

  try {
    const processoId = await aprovacaoService.converterParaProcesso(currentAprovacao.id, conversionOptions);
    notify(`Processo criado com sucesso (ID: ${processoId}).`, 'success');

    close();

    if (window.aprovacaoPage) {
      window.aprovacaoPage.refresh();
    }
  } catch (error) {
    console.error('[AprovacaoDetailsModal] Erro ao converter:', error);
    notify('Erro ao converter para processo: ' + error.message, 'error');
  }
}

async function handleDelete() {
  if (!currentAprovacao) return;

  if (!canCurrentUserDeleteAprovacao(currentAprovacao)) {
    notify('Voce nao tem permissao para excluir esta analise.', 'error');
    return;
  }

  const confirmMessage = 'Tem certeza que deseja excluir esta analise? Esta acao nao pode ser desfeita.';
  const confirmed = window.uiHelpers?.confirmAction
    ? await window.uiHelpers.confirmAction({
        title: 'Excluir analise',
        message: confirmMessage,
        confirmText: 'Excluir',
        confirmClass: 'btn-danger',
        icon: 'bi-trash',
        iconColor: 'text-danger'
      })
    : window.confirm(confirmMessage);

  if (!confirmed) return;

  try {
    await aprovacaoService.deleteAprovacao(currentAprovacao.id, { aprovacao: currentAprovacao });
    notify('Analise excluida com sucesso.', 'success');
    close();

    if (window.aprovacaoPage?.refresh) {
      await window.aprovacaoPage.refresh();
    }
  } catch (error) {
    console.error('[AprovacaoDetailsModal] Erro ao excluir:', error);
    notify('Erro ao excluir analise: ' + error.message, 'error');
  }
}

/**
 * Abre o modal
 */
function open(aprovacao) {
  if (errosUnsubscribe) {
    errosUnsubscribe();
    errosUnsubscribe = null;
  }
  if (errosBadgeUnsubscribe) {
    errosBadgeUnsubscribe();
    errosBadgeUnsubscribe = null;
  }

  currentAprovacao = aprovacao;

  const modalEl = render();
  renderContent(aprovacao);

  modalInstance = new bootstrap.Modal(modalEl);
  modalInstance.show();

  loadLegacyContractAttachments(aprovacao).then((legacyDocuments) => {
    if (!legacyDocuments || legacyDocuments.length === 0) return;
    if (!currentAprovacao || currentAprovacao.id !== aprovacao.id) return;

    const existingDocuments = Array.isArray(currentAprovacao.documentos)
      ? currentAprovacao.documentos
      : [];
    const documentMap = new Map();
    [...existingDocuments, ...legacyDocuments].forEach((doc, index) => {
      const key = String(
        doc?.storagePath
        || doc?.path
        || doc?.url
        || doc?.nome
        || doc?.name
        || `doc-${index}`
      ).trim();
      if (!key) return;
      if (!documentMap.has(key)) {
        documentMap.set(key, doc);
      }
    });

    currentAprovacao = {
      ...currentAprovacao,
      documentos: Array.from(documentMap.values())
    };

    renderContent(currentAprovacao);
  });
}

/**
 * Fecha o modal
 */
function close() {
  if (errosUnsubscribe) {
    errosUnsubscribe();
    errosUnsubscribe = null;
  }
  if (errosBadgeUnsubscribe) {
    errosBadgeUnsubscribe();
    errosBadgeUnsubscribe = null;
  }
  if (modalInstance) {
    modalInstance.hide();
  }
  currentAprovacao = null;
}

/**
 * Escapa HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Exporta
const AprovacaoDetailsModal = {
  open,
  close
};

export default AprovacaoDetailsModal;
