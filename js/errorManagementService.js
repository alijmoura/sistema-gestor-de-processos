/**
 * @file errorManagementService.js
 * @description Servico de gestao de erros (QA) para processos e aprovacoes.
 * Permite reportar, listar e avaliar erros em qualquer setor do fluxo.
 * Erros de admins sao automaticamente aprovados; demais exigem avaliacao.
 * @version 1.0.0
 */

import { db, auth } from './auth.js';
import listenerOptimizer from './listenerOptimizer.js';

// ===================== CONSTANTES =====================

/** Status possiveis de um erro */
export const ERRO_STATUS = {
  PENDENTE: 'PENDENTE',
  APROVADO: 'APROVADO',
  REJEITADO: 'REJEITADO'
};

/** Cores e icones por status */
export const ERRO_STATUS_CONFIG = {
  PENDENTE: { label: 'Pendente', bg: 'bg-warning', text: 'text-dark', icon: 'bi-hourglass-split' },
  APROVADO: { label: 'Aprovado', bg: 'bg-success', text: 'text-white', icon: 'bi-check-circle-fill' },
  REJEITADO: { label: 'Rejeitado', bg: 'bg-danger', text: 'text-white', icon: 'bi-x-circle-fill' }
};

/** Setores disponiveis para classificacao de erros */
export const ERRO_SETORES = {
  aprovacao: { label: 'Aprovacao', icon: 'bi-clipboard-check' },
  formularios: { label: 'Formularios', icon: 'bi-file-earmark-text' },
  cehop: { label: 'CEHOP', icon: 'bi-building' },
  registro: { label: 'Registro', icon: 'bi-journal-check' },
  financeiro: { label: 'Financeiro', icon: 'bi-cash-stack' },
  individual: { label: 'Individual', icon: 'bi-person' },
  outro: { label: 'Outro', icon: 'bi-question-circle' }
};

/** Origens possiveis */
export const ERRO_ORIGEM = {
  PROCESSO: 'Processo',
  APROVACAO: 'Aprovacao'
};

/** Roles considerados admin */
const ADMIN_ROLES = new Set(['admin', 'super_admin']);
let listenerSequence = 0;

function nextListenerId(prefix) {
  listenerSequence += 1;
  return `${prefix}_${listenerSequence}`;
}

// ===================== HELPERS =====================

/**
 * Normaliza identidade para comparacoes (uid/email)
 * @param {string} value
 * @returns {string}
 */
function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Verifica se o usuario atual e admin
 * @returns {boolean}
 */
function isCurrentUserAdmin() {
  const role = window.permissionsUIHelper?.currentUserPermissions?.role
    || window.appState?.userPermissions?.role
    || '';
  return ADMIN_ROLES.has(String(role).trim().toLowerCase());
}

/**
 * Retorna referencia a subcole cao de erros
 * @param {string} colecaoPai - 'contracts' ou 'aprovacoes'
 * @param {string} documentoId - ID do documento pai
 * @returns {firebase.firestore.CollectionReference}
 */
function getErrosRef(colecaoPai, documentoId) {
  return db.collection(colecaoPai).doc(documentoId).collection('erros');
}

/**
 * Exibe notificacao usando o sistema global
 * @param {string} message
 * @param {string} type
 */
function notify(message, type = 'info') {
  if (window.uiHelpers?.showNotification) {
    window.uiHelpers.showNotification(message, type);
  } else if (window.showNotification) {
    window.showNotification(message, type);
  } else {
    console.log(`[ErrorManagement] ${type}: ${message}`);
  }
}

/**
 * Valida os campos obrigatorios do formulario de erro
 * @param {string} prefix
 * @param {HTMLElement} formContainer
 * @returns {boolean}
 */
function getErroRequiredFields(prefix) {
  return [
    document.getElementById(`${prefix}-erro-setor`),
    document.getElementById(`${prefix}-erro-descricao`)
  ].filter(Boolean);
}

function setFieldInvalidFeedbackVisibility(field, show) {
  if (!field) return;
  const feedback = field.parentElement?.querySelector('.invalid-feedback');
  if (!feedback) return;
  feedback.style.display = show ? 'block' : 'none';
}

/**
 * Verifica manualmente se um campo do formulario de erro e valido,
 * usando data-attributes em vez de atributos nativos (para nao interferir
 * na validacao do form principal do modal).
 */
function isErroFieldValid(field) {
  if (!field) return true;
  const isRequired = field.hasAttribute('data-erro-required');
  const minLen = parseInt(field.getAttribute('data-erro-minlength'), 10) || 0;
  const value = (field.value || '').trim();

  if (isRequired && !value) return false;
  if (minLen > 0 && value.length < minLen) return false;
  return true;
}

function syncErroFormValidationFeedback(prefix, formContainer) {
  const requiredFields = getErroRequiredFields(prefix);
  const shouldShowFeedback = formContainer?.classList.contains('was-validated');

  requiredFields.forEach((field) => {
    const showInvalid = shouldShowFeedback && !isErroFieldValid(field);
    setFieldInvalidFeedbackVisibility(field, showInvalid);
  });
}

function validateErroForm(prefix, formContainer) {
  const requiredFields = getErroRequiredFields(prefix);

  const isValid = requiredFields.every((field) => isErroFieldValid(field));
  if (formContainer) {
    if (!isValid) {
      formContainer.classList.add('was-validated');
    } else {
      formContainer.classList.remove('was-validated');
    }
    syncErroFormValidationFeedback(prefix, formContainer);
  }

  return isValid;
}

/**
 * Resolve o melhor rótulo para exibicao de um usuario
 * @param {Object|string} user
 * @returns {string}
 */
function resolveAnalistaOptionLabel(user) {
  if (typeof user === 'string') return user.trim();
  if (!user || typeof user !== 'object') return '';

  const candidates = [
    user.fullName,
    user.fullname,
    user.shortName,
    user.displayName,
    user.nome,
    user.email
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) return normalized;
  }

  return '';
}

/**
 * Extrai analistas de um select existente no DOM
 * @param {string} selectId
 * @returns {string[]}
 */
function getAnalistasFromSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return [];

  return Array.from(select.options || [])
    .map((opt) => String(opt?.value || '').trim())
    .filter(Boolean);
}

/**
 * Retorna lista deduplicada de analistas disponiveis para o formulario de erro.
 * No details modal, da prioridade a os mesmos selects da aba "Dados Principais".
 * @param {string} prefix
 * @returns {string[]}
 */
function getAnalistasDisponiveis(prefix) {
  const analistas = new Set();
  const addAnalista = (value) => {
    const normalized = String(value || '').trim();
    if (normalized) analistas.add(normalized);
  };

  // Fonte primaria do details modal: mesmos selects da aba Dados Principais
  if (prefix === 'details') {
    ['modal-analista', 'modal-analistaAprovacao', 'modal-analistaCehop']
      .forEach((selectId) => getAnalistasFromSelect(selectId).forEach(addAnalista));
  }

  // Fallback global: appState.analysts / appState.allUsers
  const appAnalysts = Array.isArray(window.appState?.analysts) ? window.appState.analysts : [];
  const appAllUsers = Array.isArray(window.appState?.allUsers) ? window.appState.allUsers : [];
  [...appAnalysts, ...appAllUsers]
    .map(resolveAnalistaOptionLabel)
    .forEach(addAnalista);

  return Array.from(analistas).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Resolve o analista padrao para o formulario de erro.
 * @param {string} prefix
 * @returns {string}
 */
function getAnalistaPadrao(prefix) {
  const selectId = prefix === 'aprovacao' ? 'modal-analistaAprovacao' : 'modal-analista';
  const selectedFromModal = String(document.getElementById(selectId)?.value || '').trim();
  if (selectedFromModal) return selectedFromModal;

  return auth.currentUser?.displayName || auth.currentUser?.email || '';
}

/**
 * Verifica se o erro foi criado pelo usuario informado
 * @param {Object} erro
 * @param {Object} currentUser
 * @returns {boolean}
 */
function isErroCriadoPeloUsuario(erro, currentUser) {
  const userUid = normalizeIdentity(currentUser?.uid);
  const userEmail = normalizeIdentity(currentUser?.email);
  if (!userUid && !userEmail) return false;

  const criadorUid = normalizeIdentity(erro?.criadoPor || erro?.createdByUid || erro?.createdBy);
  const criadorEmail = normalizeIdentity(erro?.criadoPorEmail || erro?.createdByEmail || erro?.email);

  return (userUid && criadorUid && userUid === criadorUid)
    || (userEmail && criadorEmail && userEmail === criadorEmail)
    || (userEmail && criadorUid && userEmail === criadorUid);
}

/**
 * Verifica se o usuario atual pode excluir o erro.
 * Regra: admin OU criador do erro.
 * @param {Object} erro
 * @param {Object} currentUser
 * @param {boolean} userIsAdmin
 * @returns {boolean}
 */
function canCurrentUserDeleteErro(erro, currentUser, userIsAdmin = false) {
  if (userIsAdmin) return true;
  return isErroCriadoPeloUsuario(erro, currentUser);
}

// ===================== CRUD =====================

/**
 * Reporta um novo erro no processo/aprovacao.
 * Se o usuario for admin, o erro e automaticamente aprovado.
 * @param {string} colecaoPai - 'contracts' ou 'aprovacoes'
 * @param {string} documentoId - ID do documento pai
 * @param {Object} dadosErro - { setor, descricao, observacoes, analista }
 * @returns {Promise<string>} ID do erro criado
 */
async function reportarErro(colecaoPai, documentoId, dadosErro) {
  const user = auth.currentUser;
  if (!user) throw new Error('Usuario nao autenticado');

  if (!colecaoPai || !documentoId) {
    throw new Error('Colecao pai e ID do documento sao obrigatorios');
  }

  if (!dadosErro.descricao?.trim()) {
    throw new Error('Descricao do erro e obrigatoria');
  }

  const userIsAdmin = isCurrentUserAdmin();
  const origem = colecaoPai === 'contracts' ? ERRO_ORIGEM.PROCESSO : ERRO_ORIGEM.APROVACAO;

  const novoErro = {
    origem,
    setor: ERRO_SETORES[dadosErro.setor] ? dadosErro.setor : 'outro',
    descricao: dadosErro.descricao.trim(),
    observacoes: dadosErro.observacoes?.trim() || '',
    analista: dadosErro.analista?.trim() || user.displayName || user.email || '',
    status: userIsAdmin ? ERRO_STATUS.APROVADO : ERRO_STATUS.PENDENTE,
    criadoPor: user.uid,
    criadoPorEmail: user.email || '',
    criadoPorNome: user.displayName || user.email || '',
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    avaliadoPor: userIsAdmin ? user.uid : null,
    avaliadoPorNome: userIsAdmin ? (user.displayName || user.email) : null,
    avaliadoEm: userIsAdmin ? firebase.firestore.FieldValue.serverTimestamp() : null
  };

  const ref = getErrosRef(colecaoPai, documentoId);
  const docRef = await ref.add(novoErro);

  const statusLabel = userIsAdmin ? 'aprovado automaticamente' : 'pendente de avaliacao';
  notify(`Erro reportado com sucesso (${statusLabel}).`, 'success');

  return docRef.id;
}

/**
 * Lista erros de um documento com listener em tempo real.
 * @param {string} colecaoPai - 'contracts' ou 'aprovacoes'
 * @param {string} documentoId - ID do documento pai
 * @param {Function} callback - Recebe array de erros ordenados por data
 * @returns {Function} Funcao de unsubscribe do listener
 */
function listarErros(colecaoPai, documentoId, callback) {
  if (!colecaoPai || !documentoId) {
    callback([]);
    return () => {};
  }

  const ref = getErrosRef(colecaoPai, documentoId).orderBy('criadoEm', 'desc');
  const listenerId = nextListenerId(`error_mgmt_erros_${colecaoPai}_${documentoId}`);
  const optimizedListener = listenerOptimizer.registerListener(
    listenerId,
    (snapshot) => {
      const erros = [];
      snapshot.forEach((doc) => {
        erros.push({ id: doc.id, ...doc.data() });
      });
      callback(erros);
    },
    { critical: true, throttle: false, immediateOnAdd: true }
  );

  const firestoreUnsubscribe = ref.onSnapshot(
    optimizedListener,
    (error) => {
      console.error('[ErrorManagement] Erro ao escutar erros:', error);
      callback([]);
    }
  );

  listenerOptimizer.setUnsubscribe(listenerId, firestoreUnsubscribe);
  const unsubscribe = () => listenerOptimizer.unregisterListener(listenerId);
  return unsubscribe;
}

/**
 * Escuta a contagem de erros pendentes visiveis para o usuario atual.
 * Admins veem todos os pendentes; usuarios comuns apenas os proprios.
 * @param {string} colecaoPai - 'contracts' ou 'aprovacoes'
 * @param {string} documentoId - ID do documento pai
 * @param {Function} callback - Recebe a contagem de pendentes visiveis
 * @returns {Function} Funcao de unsubscribe do listener
 */
function listarPendenciasVisiveis(colecaoPai, documentoId, callback) {
  if (!colecaoPai || !documentoId) {
    callback(0);
    return () => {};
  }

  const currentUser = auth.currentUser;
  const userIsAdmin = isCurrentUserAdmin();
  const ref = getErrosRef(colecaoPai, documentoId).where('status', '==', ERRO_STATUS.PENDENTE);
  const listenerId = nextListenerId(`error_mgmt_pending_${colecaoPai}_${documentoId}`);
  const optimizedListener = listenerOptimizer.registerListener(
    listenerId,
    (snapshot) => {
      let count = 0;
      snapshot.forEach((doc) => {
        const erro = doc.data() || {};
        if (userIsAdmin || isErroCriadoPeloUsuario(erro, currentUser)) {
          count += 1;
        }
      });
      callback(count);
    },
    { critical: false, throttle: true, immediateOnAdd: true }
  );

  const firestoreUnsubscribe = ref.onSnapshot(
    optimizedListener,
    (error) => {
      console.error('[ErrorManagement] Erro ao escutar pendencias:', error);
      callback(0);
    }
  );

  listenerOptimizer.setUnsubscribe(listenerId, firestoreUnsubscribe);
  const unsubscribe = () => listenerOptimizer.unregisterListener(listenerId);
  return unsubscribe;
}

/**
 * Avalia (aprova ou rejeita) um erro. Restrito a admins.
 * @param {string} colecaoPai
 * @param {string} documentoId
 * @param {string} erroId
 * @param {boolean} aprovado - true = APROVADO, false = REJEITADO
 * @returns {Promise<void>}
 */
async function avaliarErro(colecaoPai, documentoId, erroId, aprovado) {
  const user = auth.currentUser;
  if (!user) throw new Error('Usuario nao autenticado');

  if (!isCurrentUserAdmin()) {
    throw new Error('Apenas administradores podem avaliar erros');
  }

  const ref = getErrosRef(colecaoPai, documentoId).doc(erroId);
  await ref.update({
    status: aprovado ? ERRO_STATUS.APROVADO : ERRO_STATUS.REJEITADO,
    avaliadoPor: user.uid,
    avaliadoPorNome: user.displayName || user.email || '',
    avaliadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });

  const acao = aprovado ? 'aprovado' : 'rejeitado';
  notify(`Erro ${acao} com sucesso.`, 'success');
}

/**
 * Exclui um erro. Permitido para admins ou criador do erro.
 * @param {string} colecaoPai
 * @param {string} documentoId
 * @param {string} erroId
 * @returns {Promise<void>}
 */
async function excluirErro(colecaoPai, documentoId, erroId) {
  const user = auth.currentUser;
  if (!user) throw new Error('Usuario nao autenticado');

  const ref = getErrosRef(colecaoPai, documentoId).doc(erroId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new Error('Erro nao encontrado');
  }

  const userIsAdmin = isCurrentUserAdmin();
  const erro = snapshot.data() || {};
  if (!canCurrentUserDeleteErro(erro, user, userIsAdmin)) {
    throw new Error('Apenas administradores ou o criador podem excluir erros');
  }

  await ref.delete();

  notify('Erro excluido com sucesso.', 'success');
}

// ===================== RELATORIOS =====================

/**
 * Busca todos os erros aprovados de todas as colecoes usando collectionGroup.
 * Usado para alimentar os relatorios de qualidade.
 * @param {Object} filtros - { dataInicio, dataFim }
 * @returns {Promise<Array>} Lista de erros aprovados
 */
async function buscarErrosParaRelatorio(filtros = {}) {
  const buildTimestamp = (value, endOfDay = false) => {
    if (!value) return null;
    if (value instanceof Date) {
      const normalizedDate = new Date(value);
      if (endOfDay) {
        normalizedDate.setHours(23, 59, 59, 999);
      }
      return firebase.firestore.Timestamp.fromDate(normalizedDate);
    }
    return value;
  };

  const resolveErroDate = (erro = {}) => {
    const rawDate = erro.criadoEm;
    if (rawDate?.toDate) return rawDate.toDate();
    if (rawDate?.seconds) return new Date(rawDate.seconds * 1000);
    if (rawDate instanceof Date) return rawDate;
    const parsed = rawDate ? new Date(rawDate) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  };

  const inicio = buildTimestamp(filtros.dataInicio, false);
  const fim = buildTimestamp(filtros.dataFim, true);

  const normalizeErroDoc = (doc) => ({
    id: doc.id,
    parentPath: doc.ref.parent.parent?.path || '',
    ...doc.data()
  });

  const filterErrosInMemory = (erros = []) => erros.filter((erro) => {
    if (erro.status !== ERRO_STATUS.APROVADO) return false;

    if (!inicio && !fim) return true;

    const erroDate = resolveErroDate(erro);
    if (!erroDate) return false;

    if (inicio?.toDate && erroDate < inicio.toDate()) return false;
    if (fim?.toDate && erroDate > fim.toDate()) return false;
    return true;
  });

  try {
    let query = db.collectionGroup('erros')
      .where('status', '==', ERRO_STATUS.APROVADO);

    if (inicio) {
      query = query.where('criadoEm', '>=', inicio);
    }

    if (fim) {
      query = query.where('criadoEm', '<=', fim);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(normalizeErroDoc);
  } catch (error) {
    const errorMessage = String(error?.message || '').toLowerCase();
    const isIndexLikeError = String(error?.code || '').includes('failed-precondition')
      || errorMessage.includes('failed precondition')
      || errorMessage.includes('requires an index')
      || errorMessage.includes('index');

    if (!isIndexLikeError) {
      throw error;
    }

    console.warn('[ErrorManagement] Fallback para leitura completa de erros no relatorio QA:', error);
    const fallbackSnapshot = await db.collectionGroup('erros').get();
    return filterErrosInMemory(fallbackSnapshot.docs.map(normalizeErroDoc));
  }
}

/**
 * Gera metricas agregadas de erros para o dashboard de relatorios.
 * @param {Array} erros - Lista de erros (resultado de buscarErrosParaRelatorio)
 * @returns {Object} Metricas agregadas
 */
function calcularMetricasQA(erros) {
  const totalErros = erros.length;

  // Erros por setor
  const porSetor = {};
  erros.forEach((erro) => {
    const setor = erro.setor || 'outro';
    porSetor[setor] = (porSetor[setor] || 0) + 1;
  });

  // Erros por origem (Processo vs Aprovacao)
  const porOrigem = {};
  erros.forEach((erro) => {
    const origem = erro.origem || 'Desconhecido';
    porOrigem[origem] = (porOrigem[origem] || 0) + 1;
  });

  // Top ofensores (setores com mais erros)
  const ofensores = Object.entries(porSetor)
    .map(([setor, count]) => ({
      setor,
      setorLabel: ERRO_SETORES[setor]?.label || setor,
      count,
      percentual: totalErros > 0 ? ((count / totalErros) * 100).toFixed(1) : '0.0'
    }))
    .sort((a, b) => b.count - a.count);

  // Erros por mes (para grafico de tendencia)
  const porMes = {};
  erros.forEach((erro) => {
    let data = erro.criadoEm;
    if (data?.toDate) data = data.toDate();
    else if (data?.seconds) data = new Date(data.seconds * 1000);
    else data = null;
    if (data) {
      const key = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      porMes[key] = (porMes[key] || 0) + 1;
    }
  });

  return {
    totalErros,
    porSetor,
    porOrigem,
    ofensores,
    porMes
  };
}

// ===================== RENDERIZACAO =====================

/**
 * Renderiza a secao de erros (formulario + listas) dentro de um container.
 * Usado tanto no DetailsModal quanto no AprovacaoDetailsModal.
 * @param {HTMLElement} container - Container onde renderizar
 * @param {string} colecaoPai - 'contracts' ou 'aprovacoes'
 * @param {string} documentoId - ID do documento pai
 * @param {string} prefix - Prefixo para IDs unicos (ex: 'details', 'aprovacao')
 * @returns {Function|null} Funcao unsubscribe do listener ou null
 */
function renderErrosSection(container, colecaoPai, documentoId, prefix = 'details') {
  if (!container) return null;

  const setoresOptions = Object.entries(ERRO_SETORES)
    .map(([key, val]) => `<option value="${key}">${val.label}</option>`)
    .join('');
  const analistas = getAnalistasDisponiveis(prefix);
  const analistaPadrao = getAnalistaPadrao(prefix);
  const analistaPadraoInList = analistas.includes(analistaPadrao);
  const analistasOptions = analistas
    .map((nome) => {
      const selected = nome === analistaPadrao ? ' selected' : '';
      return `<option value="${escapeHtml(nome)}"${selected}>${escapeHtml(nome)}</option>`;
    })
    .join('');
  const analistaPadraoExtraOption = analistaPadrao && !analistaPadraoInList
    ? `<option value="${escapeHtml(analistaPadrao)}" selected>${escapeHtml(analistaPadrao)}</option>`
    : '';

  container.innerHTML = `
    <!-- Formulario de registro de erro -->
    <div class="card mb-4 border-0 shadow-sm">
      <div class="card-header bg-light d-flex align-items-center">
        <i class="bi bi-bug me-2 text-danger"></i>
        <h6 class="mb-0">Reportar Novo Erro</h6>
      </div>
      <div class="card-body">
        <div id="${prefix}-erro-form" class="needs-validation">
          <div class="row g-3">
            <div class="col-md-6">
              <label for="${prefix}-erro-setor" class="form-label">Setor</label>
              <select class="form-select" id="${prefix}-erro-setor" data-erro-required="true">
                <option value="" disabled selected>Selecione o setor...</option>
                ${setoresOptions}
              </select>
              <div class="invalid-feedback">Selecione um setor.</div>
            </div>
            <div class="col-md-6">
              <label for="${prefix}-erro-analista" class="form-label">Analista Responsavel pelo erro:</label>
              <select class="form-select" id="${prefix}-erro-analista">
                <option value="">Selecione (opcional)...</option>
                ${analistaPadraoExtraOption}
                ${analistasOptions}
              </select>
            </div>
            <div class="col-12">
              <label for="${prefix}-erro-descricao" class="form-label">Descricao do Erro</label>
              <textarea class="form-control" id="${prefix}-erro-descricao" rows="3" 
                data-erro-required="true" data-erro-minlength="10" placeholder="Descreva o erro encontrado..."></textarea>
              <div class="invalid-feedback">A descricao deve ter pelo menos 10 caracteres.</div>
            </div>
            <div class="col-12">
              <label for="${prefix}-erro-observacoes" class="form-label">Observacoes</label>
              <textarea class="form-control" id="${prefix}-erro-observacoes" rows="2" 
                placeholder="Observacoes adicionais (opcional)"></textarea>
            </div>
            <div class="col-12 text-end">
              <button type="button" class="btn btn-danger btn-sm" data-action="reportar-erro">
                <i class="bi bi-bug me-1"></i>Reportar Erro
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Erros Pendentes (visivel para admin e criador) -->
    <div class="card mb-4 border-0 shadow-sm" id="${prefix}-erros-pendentes-card">
      <div class="card-header bg-warning bg-opacity-25 d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center">
          <i class="bi bi-hourglass-split me-2 text-warning"></i>
          <h6 class="mb-0">Erros Pendentes de Avaliacao</h6>
        </div>
        <span class="badge bg-warning text-dark" id="${prefix}-erros-pendentes-count">0</span>
      </div>
      <div class="card-body p-0" id="${prefix}-erros-pendentes-list">
        <div class="text-center text-muted py-4">
          <i class="bi bi-inbox fs-3 d-block mb-2"></i>
          Nenhum erro pendente de avaliacao.
        </div>
      </div>
    </div>

    <!-- Historico Consolidado -->
    <div class="card border-0 shadow-sm" id="${prefix}-erros-historico-card">
      <div class="card-header bg-light d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center">
          <i class="bi bi-clock-history me-2 text-primary"></i>
          <h6 class="mb-0">Historico Consolidado de Erros</h6>
        </div>
        <span class="badge bg-primary" id="${prefix}-erros-historico-count">0</span>
      </div>
      <div class="card-body p-0" id="${prefix}-erros-historico-list">
        <div class="text-center text-muted py-4">
          <i class="bi bi-inbox fs-3 d-block mb-2"></i>
          Nenhum erro no historico.
        </div>
      </div>
    </div>
  `;

  // Setup formulario
  const form = document.getElementById(`${prefix}-erro-form`);
  const submitBtn = form?.querySelector('[data-action="reportar-erro"]');
  if (form && submitBtn) {
    const requiredFields = getErroRequiredFields(prefix);
    // Oculta feedback inicialmente (CSS global define .invalid-feedback como display:block).
    requiredFields.forEach((field) => setFieldInvalidFeedbackVisibility(field, false));

    // Atualiza feedback em tempo real após primeira tentativa de envio.
    requiredFields.forEach((field) => {
      const handler = () => syncErroFormValidationFeedback(prefix, form);
      field.addEventListener('input', handler);
      field.addEventListener('change', handler);
      field.addEventListener('blur', handler);
    });

    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!validateErroForm(prefix, form)) {
        return;
      }

      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Enviando...';

      try {
        await reportarErro(colecaoPai, documentoId, {
          setor: document.getElementById(`${prefix}-erro-setor`).value,
          analista: document.getElementById(`${prefix}-erro-analista`).value,
          descricao: document.getElementById(`${prefix}-erro-descricao`).value,
          observacoes: document.getElementById(`${prefix}-erro-observacoes`).value
        });

        const setorSelect = document.getElementById(`${prefix}-erro-setor`);
        const descricaoInput = document.getElementById(`${prefix}-erro-descricao`);
        const observacoesInput = document.getElementById(`${prefix}-erro-observacoes`);
        const analistaSelect = document.getElementById(`${prefix}-erro-analista`);

        if (setorSelect) setorSelect.value = '';
        if (descricaoInput) descricaoInput.value = '';
        if (observacoesInput) observacoesInput.value = '';
        if (analistaSelect) analistaSelect.value = analistaPadrao || '';

        form.classList.remove('was-validated');
        syncErroFormValidationFeedback(prefix, form);
      } catch (error) {
        console.error('[ErrorManagement] Erro ao reportar:', error);
        notify('Erro ao reportar: ' + error.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // Iniciar listener
  const unsubscribe = listarErros(colecaoPai, documentoId, (erros) => {
    renderErrosLists(erros, prefix, colecaoPai, documentoId);
  });

  return unsubscribe;
}

/**
 * Renderiza as listas de erros (pendentes e historico)
 * @param {Array} erros
 * @param {string} prefix
 * @param {string} colecaoPai
 * @param {string} documentoId
 */
function renderErrosLists(erros, prefix, colecaoPai, documentoId) {
  const userIsAdmin = isCurrentUserAdmin();
  const currentUser = auth.currentUser;

  // Separa pendentes e historico
  const pendentes = erros.filter((e) => e.status === ERRO_STATUS.PENDENTE);
  const pendentesVisiveis = userIsAdmin
    ? pendentes
    : pendentes.filter((e) => isErroCriadoPeloUsuario(e, currentUser));
  const historico = erros.filter((e) => e.status === ERRO_STATUS.APROVADO);

  // --- Pendentes ---
  const pendentesCard = document.getElementById(`${prefix}-erros-pendentes-card`);
  const pendentesList = document.getElementById(`${prefix}-erros-pendentes-list`);
  const pendentesCount = document.getElementById(`${prefix}-erros-pendentes-count`);

  if (pendentesCount) pendentesCount.textContent = pendentesVisiveis.length;

  // Visivel para admin ou quando existir pendencia criada pelo usuario atual
  if (pendentesCard) {
    pendentesCard.style.display = (userIsAdmin || pendentesVisiveis.length > 0) ? '' : 'none';
  }

  if (pendentesList) {
    if (pendentesVisiveis.length === 0) {
      pendentesList.innerHTML = `
        <div class="text-center text-muted py-4">
          <i class="bi bi-inbox fs-3 d-block mb-2"></i>
          Nenhum erro pendente de avaliacao.
        </div>`;
    } else {
      pendentesList.innerHTML = '<div class="list-group list-group-flush">' +
        pendentesVisiveis.map((erro) => renderErroItem(erro, prefix, userIsAdmin, currentUser)).join('') +
        '</div>';
      bindErroActions(pendentesList, colecaoPai, documentoId);
    }
  }

  // --- Historico ---
  const historicoCard = document.getElementById(`${prefix}-erros-historico-card`);
  const historicoList = document.getElementById(`${prefix}-erros-historico-list`);
  const historicoCount = document.getElementById(`${prefix}-erros-historico-count`);

  if (historicoCard) {
    historicoCard.style.display = userIsAdmin ? '' : 'none';
  }

  if (!userIsAdmin) {
    if (historicoCount) historicoCount.textContent = '0';
    if (historicoList) historicoList.innerHTML = '';
    updateTabBadge(prefix, pendentesVisiveis.length);
    return;
  }

  if (historicoCount) historicoCount.textContent = historico.length;

  if (historicoList) {
    if (historico.length === 0) {
      historicoList.innerHTML = `
        <div class="text-center text-muted py-4">
          <i class="bi bi-inbox fs-3 d-block mb-2"></i>
          Nenhum erro no historico.
        </div>`;
    } else {
      historicoList.innerHTML = '<div class="list-group list-group-flush">' +
        historico.map((erro) => renderErroItem(erro, prefix, userIsAdmin, currentUser)).join('') +
        '</div>';
      bindErroActions(historicoList, colecaoPai, documentoId);
    }
  }

  // Atualiza badge na aba
  updateTabBadge(prefix, pendentesVisiveis.length);
}

/**
 * Renderiza um item de erro individual
 */
function renderErroItem(erro, prefix, userIsAdmin, currentUser) {
  const statusConfig = ERRO_STATUS_CONFIG[erro.status] || ERRO_STATUS_CONFIG.PENDENTE;
  const setorConfig = ERRO_SETORES[erro.setor] || ERRO_SETORES.outro;

  let dataStr = '';
  if (erro.criadoEm) {
    let d = erro.criadoEm;
    if (d.toDate) d = d.toDate();
    else if (d.seconds) d = new Date(d.seconds * 1000);
    if (d instanceof Date && !isNaN(d.getTime())) {
      dataStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
  }

  const isPendente = erro.status === ERRO_STATUS.PENDENTE;
  const botaoAcoes = userIsAdmin && isPendente ? `
    <div class="btn-group btn-group-sm mt-2">
      <button class="btn btn-outline-success btn-sm" data-action="aprovar-erro" data-erro-id="${erro.id}" title="Aprovar">
        <i class="bi bi-check-lg me-1"></i>Aprovar
      </button>
      <button class="btn btn-outline-danger btn-sm" data-action="rejeitar-erro" data-erro-id="${erro.id}" title="Rejeitar">
        <i class="bi bi-x-lg me-1"></i>Rejeitar
      </button>
    </div>` : '';

  const canDelete = canCurrentUserDeleteErro(erro, currentUser, userIsAdmin);
  const botaoExcluir = canDelete ? `
    <button class="btn btn-outline-secondary btn-sm ms-1" data-action="excluir-erro" data-erro-id="${erro.id}" title="Excluir">
      <i class="bi bi-trash"></i>
    </button>` : '';

  const avaliadoInfo = erro.avaliadoPor ? `
    <div class="small text-muted mt-1">
      <i class="bi bi-person-check me-1"></i>
      Avaliado por ${escapeHtml(erro.avaliadoPorNome || erro.avaliadoPor)}
      ${erro.avaliadoEm ? (' em ' + formatTimestamp(erro.avaliadoEm)) : ''}
    </div>` : '';
  const analistaInfo = escapeHtml(erro.analista || 'Nao informado');
  const reportadoPorInfo = escapeHtml(erro.criadoPorNome || erro.criadoPorEmail || erro.criadoPor || 'Nao informado');

  return `
    <div class="list-group-item px-3 py-3">
      <div class="d-flex align-items-start justify-content-between">
        <div class="flex-grow-1">
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="badge ${statusConfig.bg} ${statusConfig.text}">
              <i class="bi ${statusConfig.icon} me-1"></i>${statusConfig.label}
            </span>
            <span class="badge bg-light text-dark border">
              <i class="bi ${setorConfig.icon} me-1"></i>${setorConfig.label}
            </span>
          </div>
          <p class="mb-1">${escapeHtml(erro.descricao)}</p>
          ${erro.observacoes ? `<p class="small text-muted mb-1"><i class="bi bi-chat-left-text me-1"></i>${escapeHtml(erro.observacoes)}</p>` : ''}
          <div class="small text-muted mb-1">
            <i class="bi bi-person-badge me-1"></i><strong>Analista responsavel pelo erro:</strong> ${analistaInfo}
          </div>
          <div class="small text-muted mb-1">
            <i class="bi bi-person me-1"></i><strong>Erro reportado por:</strong> ${reportadoPorInfo}
          </div>
          <div class="small text-muted">
            <i class="bi bi-clock me-1"></i>${dataStr}
          </div>
          ${avaliadoInfo}
          ${botaoAcoes}
        </div>
        <div class="ms-2">
          ${botaoExcluir}
        </div>
      </div>
    </div>`;
}

/**
 * Vincula eventos de acao nos botoes de aprovar/rejeitar/excluir
 */
function bindErroActions(container, colecaoPai, documentoId) {
  if (!container) return;

  container.querySelectorAll('[data-action="aprovar-erro"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await avaliarErro(colecaoPai, documentoId, btn.dataset.erroId, true);
      } catch (error) {
        notify('Erro ao aprovar: ' + error.message, 'error');
      }
      btn.disabled = false;
    });
  });

  container.querySelectorAll('[data-action="rejeitar-erro"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await avaliarErro(colecaoPai, documentoId, btn.dataset.erroId, false);
      } catch (error) {
        notify('Erro ao rejeitar: ' + error.message, 'error');
      }
      btn.disabled = false;
    });
  });

  container.querySelectorAll('[data-action="excluir-erro"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = window.uiHelpers?.confirmAction
        ? await window.uiHelpers.confirmAction({
            title: 'Excluir erro',
            message: 'Tem certeza que deseja excluir este erro? Esta acao nao pode ser desfeita.',
            confirmText: 'Excluir',
            confirmClass: 'btn-danger',
            icon: 'bi-trash',
            iconColor: 'text-danger'
          })
        : window.confirm('Tem certeza que deseja excluir este erro?');

      if (!confirmed) return;

      btn.disabled = true;
      try {
        await excluirErro(colecaoPai, documentoId, btn.dataset.erroId);
      } catch (error) {
        notify('Erro ao excluir: ' + error.message, 'error');
      }
      btn.disabled = false;
    });
  });
}

/**
 * Atualiza o badge de contagem na aba de erros
 */
function updateTabBadge(prefix, pendingCount) {
  const badgeId = prefix === 'details'
    ? 'tab-gestao-erros-badge'
    : 'tab-gestao-erros-aprovacao-badge';
  const badge = document.getElementById(badgeId);
  if (badge) {
    badge.textContent = pendingCount;
    badge.style.display = pendingCount > 0 ? '' : 'none';
  }
}

/**
 * Formata timestamp para exibicao
 */
function formatTimestamp(ts) {
  let d = ts;
  if (d?.toDate) d = d.toDate();
  else if (d?.seconds) d = new Date(d.seconds * 1000);
  if (d instanceof Date && !isNaN(d.getTime())) {
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return '';
}

/**
 * Escapa HTML para prevenir XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===================== EXPORT =====================

const errorManagementService = {
  reportarErro,
  listarErros,
  listarPendenciasVisiveis,
  avaliarErro,
  excluirErro,
  buscarErrosParaRelatorio,
  calcularMetricasQA,
  renderErrosSection,
  isCurrentUserAdmin,
  ERRO_STATUS,
  ERRO_STATUS_CONFIG,
  ERRO_SETORES,
  ERRO_ORIGEM
};

// Expoe globalmente para scripts nao-module
window.errorManagementService = errorManagementService;

export default errorManagementService;
