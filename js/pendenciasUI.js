/**
 * @file pendenciasUI.js
 * @description Interface do usuário para gerenciamento de pendências
 * @version 1.0.0
 * @author GitHub Copilot
 */

import pendenciasService from "./pendenciasService.js";
import { isDetailsModalArchivedPendingRestore } from "./detailsModalController.js";

const ALWAYS_SHOW_RESOLVIDAS = true;

// Estado da UI
const state = {
  contratoAtual: null,
  pendencias: [],
  mostrarResolvidas: ALWAYS_SHOW_RESOLVIDAS,
  modalBootstrap: null,
  editandoId: null,
  lastLoadedContratoId: null,
  loadRequestId: 0,
  emptyTemplate: ''
};

// Elementos DOM (cached)
let elements = {};

function renderArchivedPendenciasPlaceholder() {
  if (elements.loader) {
    elements.loader.style.display = 'none';
  }

  if (elements.lista) {
    elements.lista.innerHTML = '';
    elements.lista.style.display = 'none';
  }

  if (elements.toggleResolvidasContainer) {
    elements.toggleResolvidasContainer.style.display = 'none';
  }

  if (elements.tabBadge) {
    elements.tabBadge.textContent = '0';
    elements.tabBadge.style.display = 'none';
  }

  if (elements.countBadge) {
    elements.countBadge.textContent = '0';
  }

  if (elements.novaPendenciaBtn) {
    elements.novaPendenciaBtn.disabled = true;
  }

  if (elements.novaPendenciaEmptyBtn) {
    elements.novaPendenciaEmptyBtn.disabled = true;
  }

  if (elements.empty) {
    elements.empty.classList.remove('d-none');
    elements.empty.innerHTML = `
      <i class="bi bi-archive text-secondary icon-xl"></i>
      <h5 class="mt-3 text-muted">Pendências disponíveis após restauração</h5>
      <p class="text-muted small mb-0">
        Esta aba será habilitada automaticamente depois que o processo arquivado for restaurado ao salvar ou alterar o status.
      </p>
    `;
  }
}

function restorePendenciasButtonsState() {
  if (elements.novaPendenciaBtn) {
    elements.novaPendenciaBtn.disabled = false;
  }

  if (elements.novaPendenciaEmptyBtn) {
    elements.novaPendenciaEmptyBtn.disabled = false;
  }

  if (elements.empty && state.emptyTemplate) {
    elements.empty.innerHTML = state.emptyTemplate;
  }
}

/**
 * Inicializa o módulo de pendências
 */
function init() {
  cacheElements();
  setupEventListeners();
  setupModal();
  console.log(' [PendenciasUI] Módulo inicializado');
}

/**
 * Cache dos elementos DOM
 */
function cacheElements() {
  elements = {
    // Aba
    tabBadge: document.getElementById('tab-pendencias-badge'),
    countBadge: document.getElementById('pendencias-count-badge'),
    
    // Container
    loader: document.getElementById('pendencias-loader'),
    empty: document.getElementById('pendencias-empty'),
    lista: document.getElementById('pendencias-lista'),
    toggleResolvidasContainer: document.getElementById('pendencias-toggle-resolvidas-container'),
    toggleResolvidas: document.getElementById('pendencias-mostrar-resolvidas'),
    
    // Botões
    novaPendenciaBtn: document.getElementById('nova-pendencia-btn'),
    novaPendenciaEmptyBtn: document.getElementById('nova-pendencia-empty-btn'),
    
    // Modal
    modal: document.getElementById('modal-pendencia'),
    form: document.getElementById('form-pendencia'),
    titleText: document.getElementById('modal-pendencia-title-text'),
    inputId: document.getElementById('pendencia-id'),
    inputContratoId: document.getElementById('pendencia-contrato-id'),
    inputTitulo: document.getElementById('pendencia-titulo'),
    inputDescricao: document.getElementById('pendencia-descricao'),
    selectTipo: document.getElementById('pendencia-tipo'),
    selectPrioridade: document.getElementById('pendencia-prioridade'),
    selectSetor: document.getElementById('pendencia-setor'),
    inputPrazo: document.getElementById('pendencia-prazo'),
    selectAnalista: document.getElementById('pendencia-analista'),
    comentariosSection: document.getElementById('pendencia-comentarios-section'),
    comentariosLista: document.getElementById('pendencia-comentarios-lista'),
    inputNovoComentario: document.getElementById('pendencia-novo-comentario'),
    addComentarioBtn: document.getElementById('pendencia-add-comentario-btn'),
    salvarBtn: document.getElementById('pendencia-salvar-btn')
  };

  state.emptyTemplate = elements.empty?.innerHTML || '';
}

/**
 * Configura event listeners
 */
function setupEventListeners() {
  // Botão nova pendência
  elements.novaPendenciaBtn?.addEventListener('click', () => abrirModalNova());
  elements.novaPendenciaEmptyBtn?.addEventListener('click', () => abrirModalNova());
  
  // Checkbox de resolvidas desativado: agora sempre exibimos histórico
  if (elements.toggleResolvidas) {
    elements.toggleResolvidas.checked = true;
    elements.toggleResolvidas.disabled = true;
  }
  hideToggleResolvidas();
  
  // Form submit
  elements.form?.addEventListener('submit', handleFormSubmit);
  
  // Adicionar comentário
  elements.addComentarioBtn?.addEventListener('click', handleAdicionarComentario);
  elements.inputNovoComentario?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdicionarComentario();
    }
  });
  
  // Listener para quando a aba de pendências for ativada
  document.querySelectorAll('[data-tab="pendencias"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isDetailsModalArchivedPendingRestore()) {
        renderArchivedPendenciasPlaceholder();
        return;
      }

      const contratoId = document.getElementById('modal-contract-id')?.value;
      if (contratoId && state.lastLoadedContratoId !== contratoId) {
        carregarPendencias(contratoId);
      }
    });
  });

  // Sincroniza contexto ao abrir/fechar o modal de detalhes
  const detailsModal = document.getElementById('details-modal');
  if (detailsModal) {
    detailsModal.addEventListener('shown.bs.modal', () => {
      if (isDetailsModalArchivedPendingRestore()) {
        renderArchivedPendenciasPlaceholder();
        return;
      }

      const contratoId = document.getElementById('modal-contract-id')?.value;
      if (!contratoId) return;

      if (contratoId !== state.contratoAtual) {
        resetPendenciasContext(contratoId);
      }

      const tabPendenciasAtiva = document.getElementById('tab-pendencias')?.classList.contains('active');
      if (tabPendenciasAtiva && state.lastLoadedContratoId !== contratoId) {
        carregarPendencias(contratoId);
      }
    });

    detailsModal.addEventListener('hidden.bs.modal', () => {
      resetPendenciasContext();
    });
  }

  document.addEventListener('details-modal:restored', () => {
    restorePendenciasButtonsState();

    const contratoId = document.getElementById('modal-contract-id')?.value;
    const tabPendenciasAtiva = document.getElementById('tab-pendencias')?.classList.contains('active');
    if (contratoId && tabPendenciasAtiva) {
      carregarPendencias(contratoId);
    }
  });

  document.addEventListener('details-modal:mode-active', () => {
    restorePendenciasButtonsState();
  });
}

/**
 * Configura o modal Bootstrap
 */
function setupModal() {
  if (elements.modal) {
    state.modalBootstrap = new bootstrap.Modal(elements.modal);
    
    // Resetar ao fechar
    elements.modal.addEventListener('hidden.bs.modal', () => {
      resetForm();
    });
  }
}

/**
 * Carrega pendências de um contrato
 * @param {string} contratoId - ID do contrato
 */
async function carregarPendencias(contratoId) {
  if (!contratoId) return;

  if (isDetailsModalArchivedPendingRestore()) {
    renderArchivedPendenciasPlaceholder();
    return;
  }

  restorePendenciasButtonsState();

  const requestId = ++state.loadRequestId;
  state.contratoAtual = contratoId;
  state.mostrarResolvidas = ALWAYS_SHOW_RESOLVIDAS;
  const incluirResolvidas = ALWAYS_SHOW_RESOLVIDAS;
  
  // Mostrar loader
  showLoader(true);
  hideEmpty();
  hideLista();
  
  try {
    const pendencias = await pendenciasService.listarPorContrato(contratoId, {
      incluirResolvidas
    });

    // Ignora resposta antiga quando houve troca de contrato/filtro durante o fetch
    if (
      requestId !== state.loadRequestId ||
      state.contratoAtual !== contratoId
    ) {
      return;
    }
    
    state.pendencias = pendencias;
    state.lastLoadedContratoId = contratoId;
    
    // Contar ativas
    const ativas = pendencias.filter(p => !['resolvida', 'cancelada'].includes(p.status));
    
    // Atualizar badges
    atualizarBadges(ativas.length);
    
    // Renderizar
    if (pendencias.length === 0) {
      showEmpty();
      hideToggleResolvidas();
    } else {
      renderizarLista(pendencias);
      hideToggleResolvidas();
    }
  } catch (error) {
    if (requestId !== state.loadRequestId) return;

    console.error(' Erro ao carregar pendências:', error);
    showEmpty();
    showToast('Erro ao carregar pendências', 'danger');
  } finally {
    if (requestId === state.loadRequestId) {
      showLoader(false);
    }
  }
}

/**
 * Renderiza a lista de pendências
 * @param {Array} pendencias - Lista de pendências
 */
function renderizarLista(pendencias) {
  if (!elements.lista) return;
  
  elements.lista.innerHTML = '';
  
  // Separar ativas e resolvidas
  const ativas = pendencias.filter(p => !['resolvida', 'cancelada'].includes(p.status));
  const resolvidas = pendencias.filter(p => ['resolvida', 'cancelada'].includes(p.status));
  
  // Renderizar ativas primeiro
  if (ativas.length > 0) {
    ativas.forEach(pendencia => {
      const card = criarCardPendencia(pendencia);
      elements.lista.appendChild(card);
    });
  }
  
  // Se mostrando resolvidas, adicionar separador e histórico
  if (resolvidas.length > 0) {
    // Separador visual
    const separador = document.createElement('div');
    separador.className = 'historico-separador d-flex align-items-center gap-2 my-3';
    separador.innerHTML = `
      <hr class="flex-grow-1 m-0">
      <span class="badge bg-secondary">
        <i class="bi bi-archive me-1"></i>Histórico (${resolvidas.length})
      </span>
      <hr class="flex-grow-1 m-0">
    `;
    elements.lista.appendChild(separador);
    
    // Renderizar resolvidas
    resolvidas.forEach(pendencia => {
      const card = criarCardPendencia(pendencia);
      elements.lista.appendChild(card);
    });
  }
  
  // Atualizar label do toggle com contador
  if (elements.toggleResolvidas) {
    const label = elements.toggleResolvidas.nextElementSibling;
    if (label) {
      label.innerHTML = '<i class="bi bi-archive me-1"></i>Pendências resolvidas sempre visíveis';
    }
  }
  
  showLista();
}

function resetPendenciasContext(contratoId = null) {
  // Invalida qualquer request em andamento para evitar render fora de ordem
  state.loadRequestId += 1;
  state.contratoAtual = contratoId;
  state.mostrarResolvidas = ALWAYS_SHOW_RESOLVIDAS;
  state.lastLoadedContratoId = null;
  state.pendencias = [];
  state.editandoId = null;

  if (elements.lista) {
    elements.lista.innerHTML = '';
  }

  showLoader(false);
  hideLista();
  hideEmpty();
  hideToggleResolvidas();
  atualizarBadges(0);
}

/**
 * Cria o card HTML de uma pendência
 * @param {Object} pendencia - Dados da pendência
 * @returns {HTMLElement}
 */
function criarCardPendencia(pendencia) {
  const container = document.createElement('div');
  const isResolvida = pendencia.status === 'resolvida';
  const isCancelada = pendencia.status === 'cancelada';
  const isHistorico = isResolvida || isCancelada;
  
  container.className = `card border-start border-4 ${isHistorico ? 'border-secondary bg-light' : getBorderColorClass(pendencia.prioridade)}`;
  container.dataset.pendenciaId = pendencia.id;
  
  const tipoInfo = pendenciasService.TIPOS[pendencia.tipo] || pendenciasService.TIPOS.outro;
  const prioridadeInfo = pendenciasService.PRIORIDADES[pendencia.prioridade] || pendenciasService.PRIORIDADES.media;
  const statusInfo = pendenciasService.STATUS[pendencia.status] || pendenciasService.STATUS.aberta;
  const prazoInfo = pendenciasService.formatarPrazo(pendencia.prazo);
  
  // Formatar data de resolução
  let resolucaoInfo = '';
  if (isResolvida && pendencia.resolvidoEm) {
    const dataResolucao = pendencia.resolvidoEm?.toDate?.() || new Date(pendencia.resolvidoEm);
    const dataFormatada = dataResolucao.toLocaleDateString('pt-BR', { 
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
    resolucaoInfo = `
      <div class="mt-2 pt-2 border-top small">
        <span class="text-success">
          <i class="bi bi-check-circle-fill me-1"></i>
          Resolvido em ${dataFormatada} por ${escapeHtml(pendencia.resolvidoPorNome || 'Usuário')}
        </span>
      </div>
    `;
  }
  
  container.innerHTML = `
    <div class="card-body py-3">
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div class="flex-grow-1">
          <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
            ${!isHistorico ? `
              <span class="badge" style="background-color: ${prioridadeInfo.color};">
                <i class="bi ${prioridadeInfo.icon} me-1"></i>${prioridadeInfo.label}
              </span>
            ` : ''}
            <span class="badge bg-light text-dark border">
              <i class="bi ${tipoInfo.icon} me-1"></i>${tipoInfo.label}
            </span>
            <span class="badge" style="background-color: ${statusInfo.color};">
              <i class="bi ${statusInfo.icon} me-1"></i>${statusInfo.label}
            </span>
          </div>
          
          <h6 class="mb-1 ${isHistorico ? 'text-decoration-line-through text-muted' : ''}">${escapeHtml(pendencia.titulo)}</h6>
          
          ${pendencia.descricao ? `<p class="small text-muted mb-2">${escapeHtml(pendencia.descricao)}</p>` : ''}
          
          <div class="d-flex flex-wrap gap-2 small text-muted">
            <span><i class="bi bi-building me-1"></i>${pendenciasService.SETORES[pendencia.setorResponsavel]?.label || 'Individual'}</span>
            ${!isHistorico && pendencia.prazo ? `<span class="${prazoInfo.classe}"><i class="bi bi-calendar-event me-1"></i>${prazoInfo.texto}</span>` : ''}
            <span><i class="bi bi-person me-1"></i>${escapeHtml(pendencia.criadoPorNome || 'Usuário')}</span>
            ${pendencia.comentarios?.length ? `<span><i class="bi bi-chat-dots me-1"></i>${pendencia.comentarios.length}</span>` : ''}
          </div>
          
          ${resolucaoInfo}
        </div>
        
        <div class="d-flex flex-column gap-1">
          ${!isHistorico ? `
            <button type="button" class="btn btn-sm btn-success" onclick="window.pendenciasUI.resolver('${pendencia.id}')" title="Resolver">
              <i class="bi bi-check-lg"></i>
            </button>
            <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.pendenciasUI.editar('${pendencia.id}')" title="Editar">
              <i class="bi bi-pencil"></i>
            </button>
          ` : `
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.pendenciasUI.reabrir('${pendencia.id}')" title="Reabrir">
              <i class="bi bi-arrow-counterclockwise"></i>
            </button>
          `}
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="window.pendenciasUI.excluir('${pendencia.id}')" title="Excluir">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    </div>
  `;
  
  return container;
}

/**
 * Popula dropdown de analistas com usuários do sistema
 * Usa allUsers (admin) ou analysts (todos os usuários) como fallback
 * @param {string} selectedAnalista - Analista atualmente selecionado
 */
function populatePendenciaAnalistaDropdown(selectedAnalista = '') {
  const select = elements.selectAnalista;
  if (!select) return;

  select.innerHTML = '<option value="">-- Selecione --</option>';

  // Usa allUsers se disponível (admin), senão usa analysts (disponível para todos)
  const users = window.appState?.allUsers?.length > 0
    ? window.appState.allUsers
    : (window.appState?.analysts || []);

  users.forEach(user => {
    if (user.fullName) {
      const option = document.createElement('option');
      option.value = user.fullName;
      option.textContent = user.fullName;
      if (user.fullName === selectedAnalista) option.selected = true;
      select.appendChild(option);
    }
  });
}

/**
 * Abre modal para nova pendência
 */
function abrirModalNova() {
  resetForm();
  state.editandoId = null;

  elements.titleText.textContent = 'Nova Pendência';
  elements.inputContratoId.value = state.contratoAtual || document.getElementById('modal-contract-id')?.value || '';
  elements.comentariosSection.style.display = 'none';
  elements.salvarBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Criar Pendência';

  populatePendenciaAnalistaDropdown();

  state.modalBootstrap?.show();
}

/**
 * Abre modal para editar pendência
 * @param {string} pendenciaId - ID da pendência
 */
async function abrirModalEditar(pendenciaId) {
  const pendencia = state.pendencias.find(p => p.id === pendenciaId);
  if (!pendencia) {
    showToast('Pendência não encontrada', 'warning');
    return;
  }
  
  state.editandoId = pendenciaId;
  
  elements.titleText.textContent = 'Editar Pendência';
  elements.inputId.value = pendencia.id;
  elements.inputContratoId.value = pendencia.contratoId;
  elements.inputTitulo.value = pendencia.titulo || '';
  elements.inputDescricao.value = pendencia.descricao || '';
  elements.selectTipo.value = pendencia.tipo || 'outro';
  elements.selectPrioridade.value = pendencia.prioridade || 'media';
  elements.selectSetor.value = pendencia.setorResponsavel || 'individual';

  // Analista
  populatePendenciaAnalistaDropdown(pendencia.analista || '');

  // Prazo
  if (pendencia.prazo) {
    const prazoDate = pendencia.prazo.toDate ? pendencia.prazo.toDate() : new Date(pendencia.prazo);
    elements.inputPrazo.value = prazoDate.toISOString().split('T')[0];
  } else {
    elements.inputPrazo.value = '';
  }
  
  // Comentários
  elements.comentariosSection.style.display = 'block';
  renderizarComentarios(pendencia.comentarios || []);
  
  elements.salvarBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Salvar Alterações';
  
  state.modalBootstrap?.show();
}

/**
 * Renderiza lista de comentários
 * @param {Array} comentarios - Lista de comentários
 */
function renderizarComentarios(comentarios) {
  if (!elements.comentariosLista) return;
  
  if (!comentarios || comentarios.length === 0) {
    elements.comentariosLista.innerHTML = '<p class="text-muted small text-center mb-0">Nenhum comentário ainda.</p>';
    return;
  }
  
  elements.comentariosLista.innerHTML = comentarios.map(c => `
    <div class="d-flex gap-2 mb-2 pb-2 border-bottom">
      <div class="flex-shrink-0">
        <i class="bi ${c.tipo === 'resolucao' ? 'bi-check-circle-fill text-success' : 'bi-chat-fill text-primary'}"></i>
      </div>
      <div class="flex-grow-1">
        <div class="d-flex justify-content-between align-items-center">
          <strong class="small">${escapeHtml(c.usuarioNome || 'Usuário')}</strong>
          <small class="text-muted">${formatarData(c.data)}</small>
        </div>
        <p class="mb-0 small">${escapeHtml(c.texto)}</p>
      </div>
    </div>
  `).join('');
}

/**
 * Handler do submit do formulário
 * @param {Event} e - Evento submit
 */
async function handleFormSubmit(e) {
  e.preventDefault();
  e.stopPropagation();
  
  if (!elements.form.checkValidity()) {
    elements.form.classList.add('was-validated');
    return;
  }
  
  const dados = {
    contratoId: elements.inputContratoId.value,
    titulo: elements.inputTitulo.value.trim(),
    descricao: elements.inputDescricao.value.trim(),
    tipo: elements.selectTipo.value,
    prioridade: elements.selectPrioridade.value,
    setorResponsavel: elements.selectSetor.value,
    prazo: elements.inputPrazo.value || null,
    analista: elements.selectAnalista?.value || null
  };
  
  elements.salvarBtn.disabled = true;
  elements.salvarBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...';
  
  try {
    if (state.editandoId) {
      // Atualizar
      await pendenciasService.atualizar(state.editandoId, dados);
      showToast('Pendência atualizada com sucesso!', 'success');
    } else {
      // Criar
      await pendenciasService.criar(dados);
      showToast('Pendência criada com sucesso!', 'success');
    }
    
    state.modalBootstrap?.hide();
    await carregarPendencias(dados.contratoId);
    
  } catch (error) {
    console.error(' Erro ao salvar pendência:', error);
    showToast(error.message || 'Erro ao salvar pendência', 'danger');
  } finally {
    elements.salvarBtn.disabled = false;
    elements.salvarBtn.innerHTML = state.editandoId 
      ? '<i class="bi bi-check-circle me-1"></i>Salvar Alterações'
      : '<i class="bi bi-check-circle me-1"></i>Criar Pendência';
  }
}

/**
 * Handler para adicionar comentário
 */
async function handleAdicionarComentario() {
  if (!state.editandoId) return;
  
  const texto = elements.inputNovoComentario?.value?.trim();
  if (!texto) return;
  
  elements.addComentarioBtn.disabled = true;
  
  try {
    await pendenciasService.adicionarComentario(state.editandoId, texto);
    elements.inputNovoComentario.value = '';
    
    // Recarregar pendência para atualizar comentários
    await carregarPendencias(state.contratoAtual);
    
    // Atualizar comentários no modal se ainda estiver aberto
    const pendencia = state.pendencias.find(p => p.id === state.editandoId);
    if (pendencia) {
      renderizarComentarios(pendencia.comentarios || []);
    }
    
    showToast('Comentário adicionado!', 'success');
  } catch (error) {
    console.error(' Erro ao adicionar comentário:', error);
    showToast('Erro ao adicionar comentário', 'danger');
  } finally {
    elements.addComentarioBtn.disabled = false;
  }
}

/**
 * Resolve uma pendência
 * @param {string} pendenciaId - ID da pendência
 */
async function resolverPendencia(pendenciaId) {
  const confirmar = await confirmarAcao('Resolver Pendência', 'Tem certeza que deseja marcar esta pendência como resolvida?');
  if (!confirmar) return;
  
  try {
    await pendenciasService.resolver(pendenciaId);
    showToast('Pendência resolvida!', 'success');
    await carregarPendencias(state.contratoAtual);
  } catch (error) {
    console.error(' Erro ao resolver pendência:', error);
    showToast('Erro ao resolver pendência', 'danger');
  }
}

/**
 * Reabre uma pendência resolvida
 * @param {string} pendenciaId - ID da pendência
 */
async function reabrirPendencia(pendenciaId) {
  const confirmar = await confirmarAcao('Reabrir Pendência', 'Deseja reabrir esta pendência? Ela voltará para o status "Aberta".');
  if (!confirmar) return;
  
  try {
    await pendenciasService.reabrir(pendenciaId);
    showToast('Pendência reaberta!', 'info');
    await carregarPendencias(state.contratoAtual);
  } catch (error) {
    console.error(' Erro ao reabrir pendência:', error);
    showToast('Erro ao reabrir pendência', 'danger');
  }
}

/**
 * Exclui uma pendência
 * @param {string} pendenciaId - ID da pendência
 */
async function excluirPendencia(pendenciaId) {
  const confirmar = await confirmarAcao('Excluir Pendência', 'Tem certeza que deseja excluir esta pendência? Esta ação não pode ser desfeita.');
  if (!confirmar) return;
  
  try {
    await pendenciasService.excluir(pendenciaId);
    showToast('Pendência excluída!', 'success');
    await carregarPendencias(state.contratoAtual);
  } catch (error) {
    console.error(' Erro ao excluir pendência:', error);
    showToast('Erro ao excluir pendência', 'danger');
  }
}

/**
 * Atualiza os badges de contagem
 * @param {number} count - Quantidade de pendências ativas
 */
function atualizarBadges(count) {
  if (elements.tabBadge) {
    if (count > 0) {
      elements.tabBadge.textContent = count;
      elements.tabBadge.style.display = '';
    } else {
      elements.tabBadge.style.display = 'none';
    }
  }
  
  if (elements.countBadge) {
    if (count > 0) {
      elements.countBadge.textContent = count;
      elements.countBadge.style.display = '';
    } else {
      elements.countBadge.style.display = 'none';
    }
  }
}

/**
 * Reseta o formulário
 */
function resetForm() {
  elements.form?.reset();
  elements.form?.classList.remove('was-validated');
  elements.inputId.value = '';
  elements.comentariosLista.innerHTML = '';
  state.editandoId = null;
}

// === Helpers de UI ===

function showLoader(show) {
  if (elements.loader) {
    elements.loader.style.display = show ? 'block' : 'none';
  }
}

function showEmpty() {
  if (elements.empty) elements.empty.style.display = 'block';
}

function hideEmpty() {
  if (elements.empty) elements.empty.style.display = 'none';
}

function showLista() {
  if (elements.lista) elements.lista.style.setProperty('display', 'flex', 'important');
}

function hideLista() {
  if (elements.lista) elements.lista.style.setProperty('display', 'none', 'important');
}

function hideToggleResolvidas() {
  if (elements.toggleResolvidasContainer) elements.toggleResolvidasContainer.style.display = 'none';
}

function getBorderColorClass(prioridade) {
  const map = {
    baixa: 'border-success',
    media: 'border-warning',
    alta: 'border-orange',
    urgente: 'border-danger'
  };
  return map[prioridade] || 'border-warning';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function formatarData(data) {
  if (!data) return '';
  const date = new Date(data);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function showToast(message, type = 'info') {
  // Usar toast do Bootstrap se disponível, senão alert
  if (window.showToast) {
    window.showToast(message, type);
  } else if (window.ui?.showToast) {
    window.ui.showToast(message, type);
  } else {
    console.log(`[Toast ${type}] ${message}`);
  }
}

async function confirmarAcao(titulo, mensagem) {
  // Usar confirmação do sistema se disponível
  if (window.uiHelpers?.confirmAction) {
    return await window.uiHelpers.confirmAction(titulo, mensagem);
  }
  return confirm(mensagem);
}

// === API Pública ===

const pendenciasUI = {
  init,
  carregar: carregarPendencias,
  nova: abrirModalNova,
  editar: abrirModalEditar,
  resolver: resolverPendencia,
  reabrir: reabrirPendencia,
  excluir: excluirPendencia,
  atualizarBadges,
  
  // Estado (para debug)
  get state() { return state; }
};

// Expor globalmente
if (typeof window !== 'undefined') {
  window.pendenciasUI = pendenciasUI;
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export default pendenciasUI;
