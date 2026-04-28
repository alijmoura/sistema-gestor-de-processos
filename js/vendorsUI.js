// vendorsUI.js - UI de gestão de Construtoras & Empreendimentos (Redesign 2025-12-02)
// Interface moderna com tabela, filtros e modais Bootstrap 5

import { getAllVendors, createOrUpdateVendor, addEmpreendimentoToVendor, addBlocoToEmpreendimento, addApartamento, syncVendorsFromContracts, normalizeVendorsLegacyStructure, updateVendorNameInContracts, updateEmpreendimentoNameInContracts, patchVendor, detectDuplicateVendors, mergeVendors, unifyAllDuplicateVendors, deleteVendor, deleteEmpreendimento, deleteBloco } from './firestoreService.js';
import { showNotification } from './ui.js';
import agenciasService from './agenciasService.js';
import cartoriosService from './cartoriosService.js';

if (window.__DEBUG__) console.log('[vendorsUI] Módulo carregado (redesign).');

// Estado global
const state = {
  vendors: [],
  filtered: [],
  currentVendor: null,
  loading: false,
  openVendorCollapseIds: new Set(),
  filters: { search: '', status: '', emp: '', sort: 'name-asc' },
  modalFormInstance: null,
  modalEmpreendimentosInstance: null,
  empreendimentoDefaultsSuggestions: {
    loaded: false,
    loading: false,
    cartorios: [],
    agencias: []
  }
};

// Elementos DOM
const els = {
  // Tabela
  tableBody: document.getElementById('vendors-table-body'),
  emptyState: document.getElementById('vendors-empty-state'),
  
  // Filtros
  searchInput: document.getElementById('vendor-search'),
  statusFilter: document.getElementById('vendor-status-filter'),
  empFilter: document.getElementById('vendor-emp-filter'),
  sortSelect: document.getElementById('vendor-sort'),
  clearFiltersBtn: document.getElementById('btn-clear-filters'),
  
  // Botões principais
  btnNewVendor: document.getElementById('btn-new-vendor'),
  btnNewVendorEmpty: document.getElementById('btn-new-vendor-empty'),
  
  // Modal Formulário
  modalForm: document.getElementById('modal-vendor-form'),
  form: document.getElementById('vendor-form'),
  formTitle: document.getElementById('modal-vendor-form-title'),
  vendorId: document.getElementById('vendor-id'),
  vendorName: document.getElementById('vendor-name'),
  vendorCnpj: document.getElementById('vendor-cnpj'),
  vendorEmail: document.getElementById('vendor-email'),
  vendorTelefone: document.getElementById('vendor-telefone'),
  vendorEndereco: document.getElementById('vendor-endereco'),
  vendorObservacoes: document.getElementById('vendor-observacoes'),
  vendorActive: document.getElementById('vendor-active'),
  
  // Modal Empreendimentos
  modalEmpreendimentos: document.getElementById('modal-vendor-empreendimentos'),
  empreendimentosTitle: document.getElementById('modal-vendor-empreendimentos-title'),
  empreendimentosContainer: document.getElementById('empreendimentos-list-container'),
  newEmpNome: document.getElementById('new-empreendimento-nome'),
  newEmpCartorio: document.getElementById('new-empreendimento-cartorio'),
  newEmpAgencia: document.getElementById('new-empreendimento-agencia'),
  empreendimentoCartoriosDatalist: document.getElementById('datalist-empreendimento-cartorios'),
  empreendimentoAgenciasDatalist: document.getElementById('datalist-empreendimento-agencias'),
  btnAddEmp: document.getElementById('btn-add-empreendimento'),

  // Modal Editar Empreendimento
  modalEmpreendimentoEdit: document.getElementById('modal-empreendimento-edit'),
  empreendimentoEditForm: document.getElementById('empreendimento-edit-form'),
  empreendimentoEditTitle: document.getElementById('modal-empreendimento-edit-title'),
  empreendimentoEditVendorId: document.getElementById('empreendimento-edit-vendor-id'),
  empreendimentoEditId: document.getElementById('empreendimento-edit-id'),
  empreendimentoEditNome: document.getElementById('empreendimento-edit-nome'),
  empreendimentoEditCartorio: document.getElementById('empreendimento-edit-cartorio'),
  empreendimentoEditAgencia: document.getElementById('empreendimento-edit-agencia'),
  empreendimentoEditCodigoCCA: document.getElementById('empreendimento-edit-codigo-cca')
};

function sanitizeEmpreendimentoDefaults(payload = {}) {
  const normalize = (value) => (typeof value === 'string' ? value.trim() : '');
  const normalizeUpper = (value) => normalize(value).toUpperCase();
  return {
    cartorioPadrao: normalize(
      payload.cartorioPadrao || payload.cartorio || payload.cartorioRegistroPadrao
    ),
    agenciaPadrao: normalize(
      payload.agenciaPadrao || payload.agencia || payload.agenciaCefPadrao
    ),
    codigoCCAPadrao: normalizeUpper(
      payload.codigoCCAPadrao || payload.codigoCCA || payload.ccaCodigo
    ),
  };
}

function ensureEmpreendimentoEditModalElements() {
  if (!els.modalEmpreendimentoEdit) {
    els.modalEmpreendimentoEdit = document.getElementById('modal-empreendimento-edit');
  }
  if (!els.empreendimentoEditForm) {
    els.empreendimentoEditForm = document.getElementById('empreendimento-edit-form');
  }
  if (!els.empreendimentoEditTitle) {
    els.empreendimentoEditTitle = document.getElementById('modal-empreendimento-edit-title');
  }
  if (!els.empreendimentoEditVendorId) {
    els.empreendimentoEditVendorId = document.getElementById('empreendimento-edit-vendor-id');
  }
  if (!els.empreendimentoEditId) {
    els.empreendimentoEditId = document.getElementById('empreendimento-edit-id');
  }
  if (!els.empreendimentoEditNome) {
    els.empreendimentoEditNome = document.getElementById('empreendimento-edit-nome');
  }
  if (!els.empreendimentoEditCartorio) {
    els.empreendimentoEditCartorio = document.getElementById('empreendimento-edit-cartorio');
  }
  if (!els.empreendimentoEditAgencia) {
    els.empreendimentoEditAgencia = document.getElementById('empreendimento-edit-agencia');
  }
  if (!els.empreendimentoEditCodigoCCA) {
    els.empreendimentoEditCodigoCCA = document.getElementById('empreendimento-edit-codigo-cca');
  }
}

function ensureEmpreendimentoDefaultsDatalistElements() {
  if (!els.empreendimentoCartoriosDatalist) {
    els.empreendimentoCartoriosDatalist = document.getElementById('datalist-empreendimento-cartorios');
  }
  if (!els.empreendimentoAgenciasDatalist) {
    els.empreendimentoAgenciasDatalist = document.getElementById('datalist-empreendimento-agencias');
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uniqueNormalizedValues(values = []) {
  const map = new Map();
  values.forEach((value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return;
    const key = text.toLowerCase();
    if (!map.has(key)) {
      map.set(key, text);
    }
  });
  return Array.from(map.values()).sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
  );
}

function collectEmpreendimentoDefaultsFromVendors(vendors = []) {
  const cartorios = [];
  const agencias = [];

  (vendors || []).forEach((vendor) => {
    (vendor.empreendimentos || []).forEach((empreendimento) => {
      const defaults = sanitizeEmpreendimentoDefaults(empreendimento);
      if (defaults.cartorioPadrao) {
        cartorios.push(defaults.cartorioPadrao);
      }
      if (defaults.agenciaPadrao) {
        agencias.push(defaults.agenciaPadrao);
      }
    });
  });

  return {
    cartorios: uniqueNormalizedValues(cartorios),
    agencias: uniqueNormalizedValues(agencias),
  };
}

function formatAgenciaForSuggestion(agencia = {}) {
  const codigo = agencia.codigo !== undefined && agencia.codigo !== null
    ? String(agencia.codigo).trim()
    : '';
  const nome = agencia.nome !== undefined && agencia.nome !== null
    ? String(agencia.nome).trim()
    : '';
  if (codigo && nome) return `CEF AG ${codigo} - ${nome}`;
  if (codigo) return `CEF AG ${codigo}`;
  return nome;
}

function getCombinedEmpreendimentoDefaultsSuggestions() {
  const fromVendors = collectEmpreendimentoDefaultsFromVendors(state.vendors);
  return {
    cartorios: uniqueNormalizedValues([
      ...(state.empreendimentoDefaultsSuggestions.cartorios || []),
      ...fromVendors.cartorios,
    ]),
    agencias: uniqueNormalizedValues([
      ...(state.empreendimentoDefaultsSuggestions.agencias || []),
      ...fromVendors.agencias,
    ]),
  };
}

function renderEmpreendimentoDefaultsDatalists() {
  ensureEmpreendimentoDefaultsDatalistElements();
  const suggestions = getCombinedEmpreendimentoDefaultsSuggestions();

  if (els.empreendimentoCartoriosDatalist) {
    els.empreendimentoCartoriosDatalist.innerHTML = suggestions.cartorios
      .map((value) => `<option value="${escapeHtml(value)}"></option>`)
      .join('');
  }

  if (els.empreendimentoAgenciasDatalist) {
    els.empreendimentoAgenciasDatalist.innerHTML = suggestions.agencias
      .map((value) => `<option value="${escapeHtml(value)}"></option>`)
      .join('');
  }
}

async function loadEmpreendimentoDefaultsSuggestions(force = false) {
  renderEmpreendimentoDefaultsDatalists();

  if (state.empreendimentoDefaultsSuggestions.loading) {
    return;
  }
  if (!force && state.empreendimentoDefaultsSuggestions.loaded) {
    return;
  }

  state.empreendimentoDefaultsSuggestions.loading = true;
  try {
    const [agencias, cartorios] = await Promise.all([
      agenciasService.getAllAgencias(),
      cartoriosService.getAllCartorios(),
    ]);

    state.empreendimentoDefaultsSuggestions.agencias = uniqueNormalizedValues(
      (agencias || [])
        .filter((agencia) => agencia && agencia.ativo !== false)
        .map((agencia) => formatAgenciaForSuggestion(agencia))
    );
    state.empreendimentoDefaultsSuggestions.cartorios = uniqueNormalizedValues(
      (cartorios || [])
        .filter((cartorio) => cartorio && cartorio.ativo !== false)
        .map((cartorio) =>
          cartorio.nome !== undefined && cartorio.nome !== null
            ? String(cartorio.nome).trim()
            : ''
        )
    );
    state.empreendimentoDefaultsSuggestions.loaded = true;
  } catch (error) {
    console.warn('[vendorsUI] Falha ao carregar sugestões de cartórios/agências:', error);
  } finally {
    state.empreendimentoDefaultsSuggestions.loading = false;
    renderEmpreendimentoDefaultsDatalists();
  }
}

// ========== FUNÇÕES DE CARREGAMENTO ==========

async function loadVendors(force=false){
  try {
    state.loading = true;
    state.openVendorCollapseIds = getOpenVendorCollapseIdsFromDom();
    if (window.__DEBUG__) console.log('[vendorsUI] Carregando vendors (force=' + force + ')');
    const data = await getAllVendors({ forceRefresh: force });
    state.vendors = data;
    if (window.__DEBUG__) console.log('[vendorsUI] Carregado: ' + data.length);
    applyFilters();
    updateAllDatalists();
    renderEmpreendimentoDefaultsDatalists();
  } catch (e){ 
    console.warn('Falha ao carregar vendors', e);
    showNotification('Erro ao carregar construtoras', 'error');
  } finally { 
    state.loading=false;
  }
}

function applyFilters() {
  const { search, status, emp, sort } = state.filters;
  
  state.filtered = state.vendors.filter(v => {
    // Filtro de busca
    if (search) {
      const searchLower = search.toLowerCase();
      const matchName = (v.name || '').toLowerCase().includes(searchLower);
      const matchCnpj = (v.cnpj || '').toLowerCase().includes(searchLower);
      const matchEmail = (v.email || '').toLowerCase().includes(searchLower);
      const matchTelefone = (v.telefone || '').toLowerCase().includes(searchLower);
      
      if (!matchName && !matchCnpj && !matchEmail && !matchTelefone) return false;
    }
    
    // Filtro de status
    if (status === 'active' && v.active === false) return false;
    if (status === 'inactive' && v.active !== false) return false;

    // Filtro de empreendimentos
    const empCount = (v.empreendimentos || []).length;
    if (emp === 'with' && empCount === 0) return false;
    if (emp === 'without' && empCount > 0) return false;
    
    return true;
  });

  const byName = (a, b) => (a.name || '').toLowerCase().localeCompare(
    (b.name || '').toLowerCase(),
    'pt-BR',
    { sensitivity: 'base' }
  );

  state.filtered.sort((a, b) => {
    const aCount = (a.empreendimentos || []).length;
    const bCount = (b.empreendimentos || []).length;
    switch (sort) {
      case 'name-desc':
        return -byName(a, b);
      case 'emp-desc': {
        const diff = bCount - aCount;
        return diff !== 0 ? diff : byName(a, b);
      }
      case 'emp-asc': {
        const diff = aCount - bCount;
        return diff !== 0 ? diff : byName(a, b);
      }
      default:
        return byName(a, b);
    }
  });
  
  renderTable();
}

/**
 * Renderiza o conteudo do collapse de empreendimentos para um vendor
 */
function renderEmpreendimentosCollapse(vendor) {
  const emps = vendor.empreendimentos || [];

  if (emps.length === 0) {
    return `
      <div class="d-flex justify-content-between align-items-center">
        <span class="text-muted"><i class="bi bi-info-circle me-2"></i>Nenhum empreendimento cadastrado.</span>
        <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.__VENDORS_UI__.addEmpreendimentoInline('${vendor.id}')">
          <i class="bi bi-plus-circle me-1"></i>Adicionar Empreendimento
        </button>
      </div>
    `;
  }

  let html = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h6 class="mb-0"><i class="bi bi-buildings me-2"></i>Empreendimentos de ${vendor.name}</h6>
      <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.__VENDORS_UI__.addEmpreendimentoInline('${vendor.id}')">
        <i class="bi bi-plus-circle me-1"></i>Adicionar
      </button>
    </div>
    <div class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-2">
  `;

  emps.forEach(emp => {
    const empName = emp.nome || emp.name || '-';
    const empId = emp.id || emp._id || null;
    const defaults = sanitizeEmpreendimentoDefaults(emp);
    const cartorioPadrao = defaults.cartorioPadrao;
    const agenciaPadrao = defaults.agenciaPadrao;
    const blocos = emp.blocos || [];
    let totalAptos = 0;
    blocos.forEach(b => totalAptos += (b.apartamentos || []).length);

    const editBtn = empId
      ? `<button type="button" class="btn btn-xs btn-outline-warning" onclick="window.__VENDORS_UI__.editEmpreendimentoData('${vendor.id}', '${empId}')" title="Editar nome e padrões"><i class="bi bi-pencil"></i></button>`
      : '';

    const addBlocoBtn = empId
      ? `<button type="button" class="btn btn-xs btn-outline-success" onclick="window.__VENDORS_UI__.promptAddBloco('${vendor.id}', '${empId}')" title="Adicionar bloco"><i class="bi bi-plus-lg"></i></button>`
      : '';

    const blocosHtml = blocos.length > 0
      ? blocos.map(b => {
          const blocoName = b.nome || b.name || '-';
          const aptos = b.apartamentos || [];
          return `<span class="badge bg-light text-dark border me-1 mb-1">${blocoName} <small class="text-muted">(${aptos.length})</small></span>`;
        }).join('')
      : '<small class="text-muted">Sem blocos</small>';

    html += `
      <div class="col">
        <div class="card h-100">
          <div class="card-body p-2">
            <div class="d-flex justify-content-between align-items-start mb-1">
              <strong class="small">${empName}</strong>
              <div class="btn-group btn-group-sm">
                ${editBtn}
                ${addBlocoBtn}
              </div>
            </div>
            <div class="small">
              <span class="badge bg-secondary me-1">${blocos.length} blocos</span>
              <span class="badge bg-info">${totalAptos} aptos</span>
            </div>
            <div class="small mt-1 text-muted">
              <div><strong>Cartório:</strong> ${cartorioPadrao || 'não definido'}</div>
              <div><strong>Agência:</strong> ${agenciaPadrao || 'não definida'}</div>
            </div>
            <div class="mt-1" style="font-size: 0.7rem;">
              ${blocosHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  return html;
}

function renderTable() {
  if (!els.tableBody) return;
  
  if (state.filtered.length === 0) {
    els.tableBody.innerHTML = '';
    if (els.emptyState) els.emptyState.style.display = 'block';
    return;
  }
  
  if (els.emptyState) els.emptyState.style.display = 'none';
  
  els.tableBody.innerHTML = state.filtered.map(v => {
    const vendorId = String(v.id || '');
    const totalEmps = (v.empreendimentos || []).length;
    const isCollapseOpen = state.openVendorCollapseIds.has(vendorId);
    const statusBadge = v.active !== false
      ? '<span class="badge bg-success">Ativo</span>'
      : '<span class="badge bg-secondary">Inativo</span>';

    const collapseContent = renderEmpreendimentosCollapse(v);

    return `
      <tr data-vendor-id="${vendorId}">
        <td>
          <strong>${v.name || '—'}</strong>
          ${v.endereco ? `<br><small class="text-muted">${v.endereco}</small>` : ''}
        </td>
        <td><small>${v.cnpj || '—'}</small></td>
        <td><small>${v.telefone || '—'}</small></td>
        <td><small>${v.email || '—'}</small></td>
        <td class="text-center">
          <span class="badge bg-info">${totalEmps}</span>
        </td>
        <td class="text-center">${statusBadge}</td>
        <td class="text-center">
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-primary btn-sm" onclick="window.__VENDORS_UI__.editVendor('${v.id}')" title="Editar">
              <i class="bi bi-pencil"></i>
            </button>
            <button type="button" class="btn btn-outline-info btn-sm ${isCollapseOpen ? '' : 'collapsed'}"
                    data-bs-toggle="collapse"
                    data-bs-target="#collapse-vendor-${vendorId}"
                    aria-expanded="${isCollapseOpen ? 'true' : 'false'}"
                    aria-controls="collapse-vendor-${vendorId}"
                    title="Ver Empreendimentos">
              <i class="bi bi-buildings"></i>
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm" onclick="window.__VENDORS_UI__.deleteVendorUI('${v.id}', '${(v.name || '').replace(/'/g, "\\'")}')" title="Excluir Construtora">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
      <tr class="collapse-row">
        <td colspan="7" class="p-0 border-0">
          <div class="collapse ${isCollapseOpen ? 'show' : ''}" id="collapse-vendor-${vendorId}">
            <div class="card card-body m-2 bg-light">
              ${collapseContent}
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateAllDatalists() {
  const dlVendedores = document.getElementById('datalist-vendedores');
  if (dlVendedores) {
    dlVendedores.innerHTML = state.vendors
      .filter(v => v.active !== false)
      .map(v => `<option value="${v.name}"></option>`)
      .join('');
  }

  // Atualizar empreendimentos se algum vendedor já estiver selecionado
  const vendInputs = [
    document.getElementById('add-vendedorConstrutora'),
    document.getElementById('modal-vendedorConstrutora')
  ];

  vendInputs.forEach(vendInput => {
    if (vendInput && vendInput.value) {
      updateEmpreendimentosForVendor(vendInput.value);
    }
  });
}

function updateEmpreendimentosForVendor(vendorName) {
  const dlEmp = document.getElementById('datalist-empreendimentos');
  if (!dlEmp) return;

  const vendor = state.vendors.find(v => 
    v.name.toLowerCase() === vendorName.toLowerCase()
  );

  if (vendor) {
    dlEmp.innerHTML = (vendor.empreendimentos || [])
      .map(e => `<option value="${e.nome}"></option>`)
      .join('');
  } else {
    dlEmp.innerHTML = '';
  }
}

// ========== FUNÇÕES AUXILIARES ==========
function resetForm() {
  if (!els.form) return;
  els.form.reset();
  if (els.vendorId) els.vendorId.value = '';
  if (els.formTitle) els.formTitle.textContent = 'Nova Construtora';
}

function fillForm(vendor) {
  if (!vendor || !els.form) return;
  if (els.vendorId) els.vendorId.value = vendor.id;
  if (els.vendorName) els.vendorName.value = vendor.name || '';
  if (els.vendorCnpj) els.vendorCnpj.value = vendor.cnpj || '';
  if (els.vendorEmail) els.vendorEmail.value = vendor.email || '';
  if (els.vendorTelefone) els.vendorTelefone.value = vendor.telefone || '';
  if (els.vendorEndereco) els.vendorEndereco.value = vendor.endereco || '';
  if (els.vendorObservacoes) els.vendorObservacoes.value = vendor.observacoes || '';
  if (els.vendorActive) els.vendorActive.checked = vendor.active !== false;
  if (els.formTitle) els.formTitle.textContent = 'Editar Construtora';
}

// ========== SINCRONIZAÇÃO AUTOMÁTICA ==========
async function syncVendorsFromContractsUI() {
  const btn = document.getElementById('btn-sync-vendors');
  if (!btn) return;
  
  // Confirmação antes de sincronizar
  const confirmed = confirm(
    ' SINCRONIZAÇÃO COMPLETA\n\n' +
    'Esta ação irá:\n' +
    '• Criar construtoras que existem nos processos mas não estão cadastradas\n' +
    '• Adicionar empreendimentos, blocos e apartamentos faltantes\n' +
    '• Unificar nomes duplicados (ex: "Axar" e "AXAR")\n\n' +
    'Deseja continuar?'
  );
  
  if (!confirmed) return;
  
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Sincronizando...';
  
  try {
    showNotification('Iniciando sincronização completa...', 'info');
    
    const result = await syncVendorsFromContracts({ updateExisting: true, unifyDuplicates: true });
    
    // Monta mensagem de resultado
    const messages = [];
    
    if (result.created > 0) {
      messages.push(` ${result.created} construtora(s) criada(s)`);
    }
    if (result.updated > 0) {
      messages.push(` ${result.updated} construtora(s) atualizada(s)`);
    }
    if (result.details.newEmpreendimentos > 0) {
      messages.push(` ${result.details.newEmpreendimentos} empreendimento(s) adicionado(s)`);
    }
    if (result.details.newBlocos > 0) {
      messages.push(` ${result.details.newBlocos} bloco(s) adicionado(s)`);
    }
    if (result.details.newApartamentos > 0) {
      messages.push(` ${result.details.newApartamentos} apartamento(s) adicionado(s)`);
    }
    
    if (messages.length > 0) {
      showSyncResultModal(result);
      showNotification('Sincronização concluída com sucesso!', 'success');
      await loadVendors(true);
    } else if (result.existing > 0) {
      showNotification(' Todas as construtoras já estão sincronizadas.', 'info');
    } else {
      showNotification('Nenhuma construtora encontrada nos processos.', 'warning');
    }
    
    if (result.errors.length > 0) {
      console.warn('Erros durante sincronização:', result.errors);
      showNotification(` ${result.errors.length} erro(s) durante sincronização`, 'warning');
    }
  } catch (err) {
    console.error('Erro na sincronização:', err);
    showNotification('Erro ao sincronizar construtoras: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// ========== NORMALIZACAO DE LEGADO ==========
async function normalizeVendorsLegacyUI() {
  const btn = document.getElementById('btn-normalize-vendors');
  if (!btn) return;

  const confirmed = confirm(
    'NORMALIZACAO DE LEGADO\n\n' +
    'Esta acao ira:\n' +
    '• Converter empreendimentos em texto para o formato novo\n' +
    '• Gerar IDs faltantes em empreendimentos/blocos/apartamentos\n' +
    '• Manter os dados atuais (apenas normaliza estrutura)\n\n' +
    'Deseja continuar?'
  );
  if (!confirmed) return;

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Normalizando...';

  try {
    showNotification('Iniciando normalizacao de legado...', 'info');
    const result = await normalizeVendorsLegacyStructure();
    if (result.updated > 0) {
      showNotification(`Normalizacao concluida: ${result.updated} construtora(s) atualizada(s).`, 'success');
    } else {
      showNotification('Nenhuma construtora precisava de normalizacao.', 'info');
    }
    await loadVendors(true);
  } catch (err) {
    console.error('Erro na normalizacao:', err);
    showNotification('Erro ao normalizar legado: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

/**
 * Exibe modal com resultado detalhado da sincronização.
 */
function showSyncResultModal(result) {
  // Remove modal anterior se existir
  const oldModal = document.getElementById('modal-sync-result');
  if (oldModal) oldModal.remove();
  
  const modalHtml = `
    <div class="modal fade" id="modal-sync-result" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-success text-white">
            <h5 class="modal-title">
              <i class="bi bi-check-circle me-2"></i>Sincronização Concluída
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">
            <div class="row text-center mb-3">
              <div class="col-4">
                <div class="h2 text-success mb-0">${result.created}</div>
                <small class="text-muted">Criadas</small>
              </div>
              <div class="col-4">
                <div class="h2 text-primary mb-0">${result.updated}</div>
                <small class="text-muted">Atualizadas</small>
              </div>
              <div class="col-4">
                <div class="h2 text-secondary mb-0">${result.existing}</div>
                <small class="text-muted">Inalteradas</small>
              </div>
            </div>
            
            <hr>
            
            <div class="row text-center">
              <div class="col-4">
                <i class="bi bi-building text-info fs-4"></i>
                <div class="fw-bold">${result.details.newEmpreendimentos}</div>
                <small class="text-muted">Empreend.</small>
              </div>
              <div class="col-4">
                <i class="bi bi-buildings text-warning fs-4"></i>
                <div class="fw-bold">${result.details.newBlocos}</div>
                <small class="text-muted">Blocos</small>
              </div>
              <div class="col-4">
                <i class="bi bi-door-open text-success fs-4"></i>
                <div class="fw-bold">${result.details.newApartamentos}</div>
                <small class="text-muted">Apartamentos</small>
              </div>
            </div>
            
            ${result.details.newVendors.length > 0 ? `
              <hr>
              <details class="mt-2">
                <summary class="text-muted" style="cursor: pointer;">
                  <i class="bi bi-list"></i> Ver construtoras criadas (${result.details.newVendors.length})
                </summary>
                <ul class="list-unstyled mt-2 ms-3" style="font-size: 0.85rem;">
                  ${result.details.newVendors.slice(0, 20).map(v => `<li>• ${v}</li>`).join('')}
                  ${result.details.newVendors.length > 20 ? `<li class="text-muted">... e mais ${result.details.newVendors.length - 20}</li>` : ''}
                </ul>
              </details>
            ` : ''}
            
            ${result.details.updatedVendors.length > 0 ? `
              <details class="mt-2">
                <summary class="text-muted" style="cursor: pointer;">
                  <i class="bi bi-list"></i> Ver construtoras atualizadas (${result.details.updatedVendors.length})
                </summary>
                <ul class="list-unstyled mt-2 ms-3" style="font-size: 0.85rem;">
                  ${result.details.updatedVendors.slice(0, 20).map(v => `<li>• ${v}</li>`).join('')}
                  ${result.details.updatedVendors.length > 20 ? `<li class="text-muted">... e mais ${result.details.updatedVendors.length - 20}</li>` : ''}
                </ul>
              </details>
            ` : ''}
            
            ${result.errors.length > 0 ? `
              <div class="alert alert-warning mt-3 mb-0">
                <i class="bi bi-exclamation-triangle"></i> ${result.errors.length} erro(s) durante o processo.
                <details class="mt-1">
                  <summary style="cursor: pointer;">Ver detalhes</summary>
                  <small class="d-block mt-1">${result.errors.slice(0, 5).join('<br>')}</small>
                </details>
              </div>
            ` : ''}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  const modal = new bootstrap.Modal(document.getElementById('modal-sync-result'));
  modal.show();
}

// ========== EVENT BINDING ==========
function bind(){
  // Eventos da tabela e filtros
  els.searchInput?.addEventListener('input', e => {
    state.filters.search = e.target.value;
    applyFilters();
  });
  els.statusFilter?.addEventListener('change', e => {
    state.filters.status = e.target.value;
    applyFilters();
  });
  els.empFilter?.addEventListener('change', e => {
    state.filters.emp = e.target.value;
    applyFilters();
  });
  els.sortSelect?.addEventListener('change', e => {
    state.filters.sort = e.target.value;
    applyFilters();
  });
  els.clearFiltersBtn?.addEventListener('click', () => {
    state.filters = { search: '', status: '', emp: '', sort: 'name-asc' };
    if (els.searchInput) els.searchInput.value = '';
    if (els.statusFilter) els.statusFilter.value = '';
    if (els.empFilter) els.empFilter.value = '';
    if (els.sortSelect) els.sortSelect.value = 'name-asc';
    applyFilters();
  });
  
  // Botão de sincronização automática
  const btnSync = document.getElementById('btn-sync-vendors');
  btnSync?.addEventListener('click', syncVendorsFromContractsUI);
  // Botao de normalizacao de legado
  const btnNormalize = document.getElementById('btn-normalize-vendors');
  btnNormalize?.addEventListener('click', normalizeVendorsLegacyUI);
  
  // Botão de detecção de duplicatas
  const btnDetectDuplicates = document.getElementById('btn-detect-duplicates');
  btnDetectDuplicates?.addEventListener('click', detectDuplicateVendorsUI);
  
  // Botões nova construtora
  els.btnNewVendor?.addEventListener('click', openNewVendorModal);
  els.btnNewVendorEmpty?.addEventListener('click', openNewVendorModal);
  
  // Formulário
  els.form?.addEventListener('submit', onSubmitForm);
  
  // Empreendimentos (novo modal)
  els.btnAddEmp?.addEventListener('click', onAddEmpreendimentoNew);
  bindEmpreendimentoEditForm();
  loadEmpreendimentoDefaultsSuggestions().catch((error) => {
    console.warn('[vendorsUI] Falha ao inicializar sugestões de cartórios/agências:', error);
  });
  
  bindVendorInputListeners();
  bindVendorCollapseStateListeners();

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      if (els.searchInput) {
        e.preventDefault();
        els.searchInput.focus();
        els.searchInput.select();
      }
    }
  });
}

function bindVendorCollapseStateListeners() {
  if (!els.tableBody || els.tableBody.__vendorCollapseStateBound) return;

  els.tableBody.addEventListener('shown.bs.collapse', (event) => {
    const vendorId = getVendorIdFromCollapseId(event.target?.id || '');
    if (!vendorId) return;
    state.openVendorCollapseIds.add(vendorId);
  });

  els.tableBody.addEventListener('hidden.bs.collapse', (event) => {
    const vendorId = getVendorIdFromCollapseId(event.target?.id || '');
    if (!vendorId) return;
    state.openVendorCollapseIds.delete(vendorId);
  });

  els.tableBody.__vendorCollapseStateBound = true;
}

function bindVendorInputListeners() {
  const inputs = [
    document.getElementById('add-vendedorConstrutora'),
    document.getElementById('modal-vendedorConstrutora')
  ];

  inputs.forEach(input => {
    if (!input || input.__vendorListenerBound) return;
    
    input.addEventListener('change', () => {
      updateEmpreendimentosForVendor(input.value);
    });

    input.addEventListener('input', (event) => {
      if (!event.isTrusted) return; // evita limpar quando evento é disparado via script

      // Limpar empreendimento quando vendedor muda
      const empInput = input.id === 'add-vendedorConstrutora' 
        ? document.getElementById('add-empreendimento')
        : document.getElementById('modal-empreendimento');
      
      if (empInput) empInput.value = '';
    });

    input.__vendorListenerBound = true;
  });
}

function initLazy(){
  const page = document.getElementById('page-configuracoes');
  if(!page){ if(window.__DEBUG__) console.log('[vendorsUI] page-configuracoes não encontrado. Carregando imediato.'); return loadVendors(); }
  if(page.classList.contains('active')){
    if(window.__DEBUG__) console.log('[vendorsUI] Configurações já ativa. Carregando vendors.');
    loadVendors();
  }
  const obs = new MutationObserver(()=>{
    if(page.classList.contains('active') && !state.vendors.length){
      if(window.__DEBUG__) console.log('[vendorsUI] Ativação detectada. Carregando vendors...');
      loadVendors();
    }
  });
  obs.observe(page,{ attributes:true, attributeFilter:['class'] });
}

bind();
initLazy();

// Event delegation para botões que podem não existir no momento do bind()
document.addEventListener('click', (e) => {
  // Botão Sincronizar dos Processos
  if (e.target.closest('#btn-sync-vendors')) {
    e.preventDefault();
    syncVendorsFromContractsUI();
  }
  if (e.target.closest('#btn-normalize-vendors')) {
    e.preventDefault();
    normalizeVendorsLegacyUI();
  }
  // Botão Unificar Duplicadas
  if (e.target.closest('#btn-detect-duplicates')) {
    e.preventDefault();
    detectDuplicateVendorsUI();
  }
});

// Observar quando modais abrem para carregar vendors
const modalObserver = new MutationObserver(() => {
  const addModal = document.getElementById('add-contract-modal');
  const detailsModal = document.getElementById('details-modal');
  
  const isAddModalOpen = addModal && (addModal.style.display === 'block' || addModal.classList.contains('show'));
  const isDetailsModalOpen = detailsModal && (detailsModal.style.display === 'block' || detailsModal.classList.contains('show'));
  
  if ((isAddModalOpen || isDetailsModalOpen) && !state.vendors.length) {
    loadVendors();
  } else if (isAddModalOpen || isDetailsModalOpen) {
    // Atualizar datalists se vendors já carregados
    updateAllDatalists();
    bindVendorInputListeners();
  }
});

const addModal = document.getElementById('add-contract-modal');
const detailsModal = document.getElementById('details-modal');

if (addModal) {
  modalObserver.observe(addModal, { attributes: true, attributeFilter: ['style', 'class'] });
}
if (detailsModal) {
  modalObserver.observe(detailsModal, { attributes: true, attributeFilter: ['style', 'class'] });
}

// ========== MODAL FORMULÁRIO ==========
function openNewVendorModal() {
  console.log('[vendorsUI] openNewVendorModal chamado');
  console.log('[vendorsUI] els.modalForm:', els.modalForm);
  console.log('[vendorsUI] typeof bootstrap:', typeof bootstrap);
  
  if (!els.modalForm) {
    console.error('[vendorsUI] Modal form element not found');
    return;
  }
  
  if (typeof bootstrap === 'undefined') {
    console.error('[vendorsUI] Bootstrap não está disponível');
    return;
  }
  
  resetForm();
  if(els.formTitle) els.formTitle.innerHTML = '<i class="bi bi-building me-2"></i>Nova Construtora';
  
  // Garante que o modal está no DOM root (não dentro de elemento hidden)
  if (els.modalForm.parentElement !== document.body) {
    console.warn('[vendorsUI] Movendo modal para body');
    document.body.appendChild(els.modalForm);
  }
  
  // Usa Bootstrap.Modal.getOrCreateInstance (API recomendada)
  const modalInstance = bootstrap.Modal.getOrCreateInstance(els.modalForm);
  console.log('[vendorsUI] Modal instance:', modalInstance);
  console.log('[vendorsUI] Chamando show()...');
  modalInstance.show();
  console.log('[vendorsUI] show() chamado. Modal._isShown:', modalInstance._isShown);
}

function editVendor(vendorId) {
  const vendor = state.vendors.find(v => v.id === vendorId);
  if (!vendor) return;
  if (!els.modalForm) {
    console.error('[vendorsUI] Modal form element not found');
    return;
  }
  
  state.currentVendor = vendor;
  fillForm(vendor);
  if(els.formTitle) els.formTitle.innerHTML = '<i class="bi bi-pencil me-2"></i>Editar Construtora';
  
  // Garante que o modal está no DOM root
  if (els.modalForm.parentElement !== document.body) {
    document.body.appendChild(els.modalForm);
  }
  
  const modalInstance = bootstrap.Modal.getOrCreateInstance(els.modalForm);
  modalInstance.show();
}

async function onSubmitForm(e) {
  e.preventDefault();
  if (!els.form) return;
  if (!els.form.checkValidity()) {
    e.stopPropagation();
    els.form.classList.add('was-validated');
    return;
  }
  
  const vendorId = els.vendorId?.value || undefined;
  const newName = els.vendorName?.value.trim() || '';
  
  // Verifica se é edição e se o nome mudou
  const isEdit = !!vendorId;
  const oldVendor = isEdit ? state.vendors.find(v => v.id === vendorId) : null;
  const oldName = oldVendor?.name || '';
  const nameChanged = isEdit && oldName && newName && oldName !== newName;
  
  try {
    // Se o nome da construtora mudou, atualiza em todos os processos
    if (nameChanged) {
      showNotification('Atualizando nome nos processos...', 'info');
      const result = await updateVendorNameInContracts(oldName, newName);
      if (result.updated > 0) {
        showNotification(`Nome atualizado em ${result.updated} processo(s)`, 'success');
      }
      if (result.errors.length > 0) {
        console.warn('Erros ao atualizar processos:', result.errors);
      }
    }
    
    await createOrUpdateVendor({
      id: vendorId,
      name: newName,
      cnpj: els.vendorCnpj?.value.trim() || null,
      email: els.vendorEmail?.value.trim() || null,
      telefone: els.vendorTelefone?.value.trim() || null,
      endereco: els.vendorEndereco?.value.trim() || null,
      observacoes: els.vendorObservacoes?.value.trim() || null,
      active: els.vendorActive?.checked !== false
    });
    showNotification('Construtora salva com sucesso', 'success');
    const modalInstance = bootstrap.Modal.getInstance(els.modalForm);
    if(modalInstance) modalInstance.hide();
    await loadVendors(true);
  } catch (err) {
    console.error(err);
    showNotification('Erro ao salvar construtora', 'error');
  }
}

// ========== GERENCIAR EMPREENDIMENTOS ==========
async function manageEmpreendimentos(vendorId) {
  const vendor = state.vendors.find(v => v.id === vendorId);
  if (!vendor) {
    console.error('[vendorsUI] Vendor não encontrado:', vendorId);
    return;
  }

  // Re-fetch dos elementos do modal caso ainda nao tenham sido capturados
  // (modais sao injetados apos o carregamento inicial do modulo)
  if (!els.modalEmpreendimentos) {
    els.modalEmpreendimentos = document.getElementById('modal-vendor-empreendimentos');
  }
  if (!els.empreendimentosTitle) {
    els.empreendimentosTitle = document.getElementById('modal-vendor-empreendimentos-title');
  }
  if (!els.empreendimentosContainer) {
    els.empreendimentosContainer = document.getElementById('empreendimentos-list-container');
  }
  if (!els.newEmpNome) {
    els.newEmpNome = document.getElementById('new-empreendimento-nome');
  }
  if (!els.newEmpCartorio) {
    els.newEmpCartorio = document.getElementById('new-empreendimento-cartorio');
  }
  if (!els.newEmpAgencia) {
    els.newEmpAgencia = document.getElementById('new-empreendimento-agencia');
  }
  ensureEmpreendimentoDefaultsDatalistElements();
  if (!els.btnAddEmp) {
    els.btnAddEmp = document.getElementById('btn-add-empreendimento');
    els.btnAddEmp?.addEventListener('click', onAddEmpreendimentoNew);
  }

  if (!els.modalEmpreendimentos) {
    console.error('[vendorsUI] Modal empreendimentos element not found');
    return;
  }

  await loadEmpreendimentoDefaultsSuggestions();
  
  state.currentVendor = vendor;
  if (els.empreendimentosTitle) {
    els.empreendimentosTitle.innerHTML = `<i class="bi bi-building me-2"></i>Empreendimentos: ${vendor.name}`;
  }
  
  // Garante que o modal está no DOM root (não dentro de elemento hidden)
  if (els.modalEmpreendimentos.parentElement !== document.body) {
    document.body.appendChild(els.modalEmpreendimentos);
  }
  
  // Usa Bootstrap.Modal.getOrCreateInstance (API recomendada)
  const modalInstance = bootstrap.Modal.getOrCreateInstance(els.modalEmpreendimentos);
  
  // Garante que a aba de lista está ativa ANTES de renderizar
  const tabListButton = document.getElementById('tab-empreendimentos-list');
  const tabContent = document.getElementById('tab-empreendimentos-content');
  if (tabListButton && tabContent) {
    // Ativa a aba de lista
    tabListButton.classList.add('active');
    tabContent.classList.add('show', 'active');
    
    // Desativa a aba de adicionar
    const tabAddButton = document.getElementById('tab-add-empreendimento');
    const tabAddContent = document.getElementById('tab-add-empreendimento-content');
    if (tabAddButton) tabAddButton.classList.remove('active');
    if (tabAddContent) tabAddContent.classList.remove('show', 'active');
  }
  
  // Renderiza conteúdo ANTES de mostrar o modal
  renderEmpreendimentosList();
  
  // Mostra o modal com o conteúdo já renderizado
  modalInstance.show();
}

function renderEmpreendimentosList() {
  if (!els.empreendimentosContainer) {
    els.empreendimentosContainer = document.getElementById('empreendimentos-list-container');
  }
  if (!els.empreendimentosContainer || !state.currentVendor) {
    console.warn('[vendorsUI] Container ou vendor ausente');
    return;
  }

  let emps = [];
  if (Array.isArray(state.currentVendor.empreendimentos)) {
    emps = state.currentVendor.empreendimentos;
  }

  if (emps.length === 0) {
    els.empreendimentosContainer.innerHTML = '<div class="alert alert-info"><i class="bi bi-info-circle me-2"></i>Nenhum empreendimento cadastrado.</div>';
    return;
  }

  try {
    const html = `<div class="accordion" id="accordion-empreendimentos">${emps.map((emp, idx) => {
      let empObj = emp;
      if (!empObj || typeof empObj !== 'object') {
        empObj = { nome: String(emp) };
      }

      let empName = '';
      if (empObj.nome !== undefined && empObj.nome !== null) {
        empName = String(empObj.nome);
      } else if (empObj.name !== undefined && empObj.name !== null) {
        empName = String(empObj.name);
      }
      let empNameDisplay = empName;
      if (!empNameDisplay) empNameDisplay = '-';

      const empId = empObj.id || empObj._id || null;
      let empIdSafe = empId;
      if (!empIdSafe) empIdSafe = `emp-${idx}`;
      const hasEmpId = Boolean(empId);

      let blocos = [];
      if (Array.isArray(empObj.blocos)) {
        blocos = empObj.blocos;
      }

      let totalAptos = 0;
      blocos.forEach(b => totalAptos += (b.apartamentos || []).length);

      let editAttrs = 'disabled';
      let editTitle = 'Empreendimento sem ID';
      if (hasEmpId) {
        editAttrs = `onclick="event.stopPropagation(); window.__VENDORS_UI__.editEmpreendimentoData('${state.currentVendor.id}', '${empId}')"`;
        editTitle = 'Editar nome e padrões';
      }

      let addBlocoAttrs = 'disabled';
      let addBlocoTitle = 'Empreendimento sem ID';
      if (hasEmpId) {
        addBlocoAttrs = `onclick="window.__VENDORS_UI__.addBloco('${empId}')"`;
        addBlocoTitle = 'Adicionar bloco';
      }

      let accordionBtnClass = '';
      let accordionCollapseClass = '';
      if (idx !== 0) {
        accordionBtnClass = 'collapsed';
      } else {
        accordionCollapseClass = 'show';
      }

      return `
        <div class="accordion-item">
          <div class="accordion-header d-flex align-items-center" id="heading-emp-${empIdSafe}">
            <button class="accordion-button flex-grow-1 ${accordionBtnClass}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-emp-${empIdSafe}">
              <strong>${empNameDisplay}</strong>
              <span class="ms-auto me-2">
                <span class="badge bg-secondary">${blocos.length} blocos</span>
                <span class="badge bg-info">${totalAptos} aptos</span>
              </span>
            </button>
            <button type="button" class="btn btn-sm btn-outline-warning mx-2" ${editAttrs} title="${editTitle}">
              <i class="bi bi-pencil"></i>
            </button>
          </div>
          <div id="collapse-emp-${empIdSafe}" class="accordion-collapse collapse ${accordionCollapseClass}" data-bs-parent="#accordion-empreendimentos">
            <div class="accordion-body">
              <div class="card mb-3">
                <div class="card-body">
                  <h6 class="card-title">Adicionar Bloco</h6>
                  <div class="input-group input-group-sm">
                    <input type="text" class="form-control" id="input-bloco-${empIdSafe}" placeholder="Nome do bloco">
                    <button class="btn btn-outline-primary" ${addBlocoAttrs} title="${addBlocoTitle}">
                      <i class="bi bi-plus-circle"></i> Adicionar
                    </button>
                  </div>
                </div>
              </div>
              ${blocos.map((bl, bIdx) => {
                let blocoObj = bl;
                if (!blocoObj || typeof blocoObj !== 'object') {
                  blocoObj = { nome: String(bl) };
                }

                let blocoName = '';
                if (blocoObj.nome !== undefined && blocoObj.nome !== null) {
                  blocoName = String(blocoObj.nome);
                } else if (blocoObj.name !== undefined && blocoObj.name !== null) {
                  blocoName = String(blocoObj.name);
                }
                if (!blocoName) blocoName = '-';

                const blocoId = blocoObj.id || blocoObj._id || null;
                let blocoIdSafe = blocoId;
                if (!blocoIdSafe) blocoIdSafe = `${empIdSafe}-b${bIdx}`;
                const hasBlocoId = Boolean(blocoId);

                let aptos = [];
                if (Array.isArray(blocoObj.apartamentos)) {
                  aptos = blocoObj.apartamentos;
                }

                const canAddApto = hasEmpId && hasBlocoId;
                let addAptoAttrs = 'disabled';
                let addAptoTitle = 'Bloco/empreendimento sem ID';
                if (canAddApto) {
                  addAptoAttrs = `onclick="window.__VENDORS_UI__.addApartamento('${empId}', '${blocoId}')"`;
                  addAptoTitle = 'Adicionar apartamento';
                }

                return `
                <div class="card mb-2">
                  <div class="card-header d-flex justify-content-between align-items-center">
                    <strong>${blocoName}</strong>
                    <span class="badge bg-info">${aptos.length} aptos</span>
                  </div>
                  <div class="card-body">
                    <div class="input-group input-group-sm mb-2">
                      <input type="text" class="form-control" id="input-apto-${empIdSafe}-${blocoIdSafe}" placeholder="Numero do apartamento">
                      <button class="btn btn-outline-secondary btn-sm" ${addAptoAttrs} title="${addAptoTitle}">
                        <i class="bi bi-plus"></i> Add
                      </button>
                    </div>
                    <div class="d-flex flex-wrap gap-1">
                      ${aptos.map(a => {
                        let aptoVal = a;
                        if (a && typeof a === 'object') {
                          if (a.numero !== undefined && a.numero !== null) {
                            aptoVal = a.numero;
                          } else {
                            aptoVal = '';
                          }
                        }
                        return `<span class="badge bg-light text-dark border">${aptoVal}</span>`;
                      }).join('')}
                    </div>
                  </div>
                </div>
              `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('')}</div>`;

    els.empreendimentosContainer.innerHTML = html;

    // Forca re-render do accordion Bootstrap
    setTimeout(() => {
      const accordionEl = document.getElementById('accordion-empreendimentos');
      if (accordionEl) {
        accordionEl.querySelectorAll('.accordion-collapse').forEach(collapseEl => {
          if (window.bootstrap && bootstrap.Collapse) {
            const bsCollapse = bootstrap.Collapse.getInstance(collapseEl);
            if (!bsCollapse) {
              new bootstrap.Collapse(collapseEl, { toggle: false });
            }
          }
        });
      }
    }, 50);
  } catch (err) {
    console.error('[vendorsUI] Erro ao renderizar empreendimentos:', err);
  }
}

async function onAddEmpreendimentoNew() {
  if (!state.currentVendor) return;
  const nome = els.newEmpNome?.value.trim();
  const defaults = sanitizeEmpreendimentoDefaults({
    cartorioPadrao: els.newEmpCartorio?.value,
    agenciaPadrao: els.newEmpAgencia?.value
  });
  if (!nome) {
    showNotification('Informe o nome do empreendimento', 'error');
    return;
  }
  try {
    await addEmpreendimentoToVendor(state.currentVendor.id, nome, defaults);
    showNotification('Empreendimento adicionado', 'success');
    if(els.newEmpNome) els.newEmpNome.value = '';
    if(els.newEmpCartorio) els.newEmpCartorio.value = '';
    if(els.newEmpAgencia) els.newEmpAgencia.value = '';
    await loadVendors(true);
    state.currentVendor = state.vendors.find(v => v.id === state.currentVendor.id);
    renderEmpreendimentosList();
  } catch {
    showNotification('Erro ao adicionar empreendimento', 'error');
  }
}

/**
 * Adiciona empreendimento via prompt (usado no collapse inline)
 */
async function addEmpreendimentoInline(vendorId) {
  const nome = prompt('Nome do novo empreendimento:');
  if (!nome || !nome.trim()) return;

  try {
    await addEmpreendimentoToVendor(vendorId, nome.trim());
    showNotification('Empreendimento adicionado com sucesso!', 'success');
    await loadVendors(true);
  } catch (err) {
    console.error('Erro ao adicionar empreendimento:', err);
    showNotification('Erro ao adicionar empreendimento', 'error');
  }
}

/**
 * Adiciona bloco via prompt (usado no collapse inline)
 */
async function promptAddBloco(vendorId, empId) {
  const nome = prompt('Nome do novo bloco:');
  if (!nome || !nome.trim()) return;

  try {
    await addBlocoToEmpreendimento(vendorId, empId, nome.trim());
    showNotification('Bloco adicionado com sucesso!', 'success');
    await loadVendors(true);
  } catch (err) {
    console.error('Erro ao adicionar bloco:', err);
    showNotification('Erro ao adicionar bloco', 'error');
  }
}

async function addBloco(empId) {
  if (!state.currentVendor) return;
  const input = document.getElementById(`input-bloco-${empId}`);
  if(!input) return;
  const nome = input.value.trim();
  if (!nome) {
    showNotification('Informe o nome do bloco', 'error');
    return;
  }
  try {
    await addBlocoToEmpreendimento(state.currentVendor.id, empId, nome);
    showNotification('Bloco adicionado', 'success');
    input.value = '';
    await loadVendors(true);
    state.currentVendor = state.vendors.find(v => v.id === state.currentVendor.id);
    renderEmpreendimentosList();
  } catch {
    showNotification('Erro ao adicionar bloco', 'error');
  }
}

async function addApartamentoFn(empId, blocoId) {
  if (!state.currentVendor) return;
  const input = document.getElementById(`input-apto-${empId}-${blocoId}`);
  if(!input) return;
  const numero = input.value.trim();
  if (!numero) {
    showNotification('Informe o número do apartamento', 'error');
    return;
  }
  try {
    await addApartamento(state.currentVendor.id, empId, blocoId, numero);
    showNotification('Apartamento adicionado', 'success');
    input.value = '';
    await loadVendors(true);
    state.currentVendor = state.vendors.find(v => v.id === state.currentVendor.id);
    renderEmpreendimentosList();
  } catch {
    showNotification('Erro ao adicionar apartamento', 'error');
  }
}

function bindEmpreendimentoEditForm() {
  ensureEmpreendimentoEditModalElements();
  if (!els.empreendimentoEditForm || els.empreendimentoEditForm.__submitBound) {
    return;
  }
  els.empreendimentoEditForm.addEventListener('submit', onSubmitEmpreendimentoEdit);
  els.empreendimentoEditForm.__submitBound = true;
}

/**
 * Abre modal para editar nome + padrões de cartório/agência do empreendimento.
 */
async function editEmpreendimentoData(vendorId, empId) {
  ensureEmpreendimentoEditModalElements();
  ensureEmpreendimentoDefaultsDatalistElements();
  bindEmpreendimentoEditForm();
  await loadEmpreendimentoDefaultsSuggestions();

  const vendor = state.vendors.find(v => v.id === vendorId) || state.currentVendor;
  if (!vendor || !empId) return;

  const empreendimentoAtual = (vendor.empreendimentos || []).find(e => e.id === empId);
  if (!empreendimentoAtual) {
    showNotification('Empreendimento não encontrado', 'error');
    return;
  }

  if (!els.modalEmpreendimentoEdit || !els.empreendimentoEditForm) {
    showNotification('Modal de edição de empreendimento indisponível', 'error');
    return;
  }

  const nomeAtual = empreendimentoAtual.nome || empreendimentoAtual.name || '';
  const defaultsAtuais = sanitizeEmpreendimentoDefaults(empreendimentoAtual);

  if (els.empreendimentoEditTitle) {
    els.empreendimentoEditTitle.innerHTML = `<i class="bi bi-pencil-square me-2"></i>Editar Empreendimento`;
  }
  if (els.empreendimentoEditVendorId) {
    els.empreendimentoEditVendorId.value = vendor.id;
  }
  if (els.empreendimentoEditId) {
    els.empreendimentoEditId.value = empId;
  }
  if (els.empreendimentoEditNome) {
    els.empreendimentoEditNome.value = nomeAtual;
  }
  if (els.empreendimentoEditCartorio) {
    els.empreendimentoEditCartorio.value = defaultsAtuais.cartorioPadrao;
  }
  if (els.empreendimentoEditAgencia) {
    els.empreendimentoEditAgencia.value = defaultsAtuais.agenciaPadrao;
  }
  if (els.empreendimentoEditCodigoCCA) {
    els.empreendimentoEditCodigoCCA.value = defaultsAtuais.codigoCCAPadrao;
  }

  els.empreendimentoEditForm.classList.remove('was-validated');

  if (els.modalEmpreendimentoEdit.parentElement !== document.body) {
    document.body.appendChild(els.modalEmpreendimentoEdit);
  }

  const modalInstance = bootstrap.Modal.getOrCreateInstance(els.modalEmpreendimentoEdit);
  modalInstance.show();
}

async function onSubmitEmpreendimentoEdit(event) {
  event.preventDefault();

  ensureEmpreendimentoEditModalElements();
  if (!els.empreendimentoEditForm) return;

  if (!els.empreendimentoEditForm.checkValidity()) {
    els.empreendimentoEditForm.classList.add('was-validated');
    return;
  }

  const vendorId = els.empreendimentoEditVendorId?.value || '';
  const empId = els.empreendimentoEditId?.value || '';
  const newName = (els.empreendimentoEditNome?.value || '').trim();

  const vendor = state.vendors.find(v => v.id === vendorId) || state.currentVendor;
  if (!vendor || !empId) {
    showNotification('Empreendimento não encontrado', 'error');
    return;
  }

  const empreendimentoAtual = (vendor.empreendimentos || []).find(e => e.id === empId);
  if (!empreendimentoAtual) {
    showNotification('Empreendimento não encontrado', 'error');
    return;
  }

  const defaultsAtuais = sanitizeEmpreendimentoDefaults(empreendimentoAtual);
  const novosDefaults = sanitizeEmpreendimentoDefaults({
    cartorioPadrao: els.empreendimentoEditCartorio?.value,
    agenciaPadrao: els.empreendimentoEditAgencia?.value,
    codigoCCAPadrao: els.empreendimentoEditCodigoCCA?.value
  });

  const nomeAtual = empreendimentoAtual.nome || empreendimentoAtual.name || '';
  const nomeMudou = newName !== nomeAtual;
  const cartorioMudou = novosDefaults.cartorioPadrao !== defaultsAtuais.cartorioPadrao;
  const agenciaMudou = novosDefaults.agenciaPadrao !== defaultsAtuais.agenciaPadrao;
  const codigoCCAMudou = novosDefaults.codigoCCAPadrao !== defaultsAtuais.codigoCCAPadrao;

  if (!nomeMudou && !cartorioMudou && !agenciaMudou && !codigoCCAMudou) {
    showNotification('Nenhuma alteração detectada', 'info');
    return;
  }

  const submitBtn = els.empreendimentoEditForm.querySelector('button[type="submit"]');
  const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...';
  }

  try {
    if (nomeMudou) {
      showNotification('Atualizando nome nos processos...', 'info');
      const result = await updateEmpreendimentoNameInContracts(
        vendor.name,
        nomeAtual,
        newName
      );
      if (result.updated > 0) {
        showNotification(`Nome atualizado em ${result.updated} processo(s)`, 'success');
      }
    }

    const updatedEmpreendimentos = (vendor.empreendimentos || []).map(emp => {
      if (emp.id !== empId) return emp;
      const updated = { ...emp, nome: newName };
      if (novosDefaults.cartorioPadrao) {
        updated.cartorioPadrao = novosDefaults.cartorioPadrao;
      } else {
        delete updated.cartorioPadrao;
      }
      if (novosDefaults.agenciaPadrao) {
        updated.agenciaPadrao = novosDefaults.agenciaPadrao;
      } else {
        delete updated.agenciaPadrao;
      }
      if (novosDefaults.codigoCCAPadrao) {
        updated.codigoCCAPadrao = novosDefaults.codigoCCAPadrao;
      } else {
        delete updated.codigoCCAPadrao;
      }
      return updated;
    });

    await patchVendor(vendor.id, { empreendimentos: updatedEmpreendimentos });

    await loadVendors(true);
    state.currentVendor = state.vendors.find(v => v.id === vendor.id) || null;
    if (state.currentVendor && els.modalEmpreendimentos?.classList.contains('show')) {
      renderEmpreendimentosList();
    }

    showNotification('Empreendimento atualizado com sucesso', 'success');
  } catch (err) {
    console.error('Erro ao atualizar empreendimento:', err);
    showNotification('Erro ao atualizar empreendimento', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  }
}

function getVendorIdFromCollapseId(collapseId = '') {
  if (typeof collapseId !== 'string' || !collapseId.startsWith('collapse-vendor-')) {
    return '';
  }
  return collapseId.replace('collapse-vendor-', '').trim();
}

function getOpenVendorCollapseIdsFromDom() {
  const openIds = new Set();
  if (!els.tableBody) return openIds;

  els.tableBody
    .querySelectorAll('.collapse[id^="collapse-vendor-"].show')
    .forEach((collapseEl) => {
      const vendorId = getVendorIdFromCollapseId(collapseEl.id);
      if (vendorId) openIds.add(vendorId);
    });

  return openIds;
}

function editEmpreendimentoName(empId) {
  if (!state.currentVendor) return;
  editEmpreendimentoData(state.currentVendor.id, empId);
}

// ========== FUNÇÕES DE EXCLUSÃO ==========

/**
 * Exclui uma construtora após confirmação do usuário.
 * Verifica se não há processos vinculados antes de permitir a exclusão.
 */
async function deleteVendorUI(vendorId, vendorName) {
  const confirmed = confirm(` ATENÇÃO!\n\nDeseja realmente excluir a construtora "${vendorName}"?\n\nEsta ação não pode ser desfeita.`);
  if (!confirmed) return;
  
  try {
    showNotification('Verificando vínculos...', 'info');
    const result = await deleteVendor(vendorId);
    
    if (!result.success) {
      // Se há processos vinculados, pergunta se quer forçar
      if (result.contractsCount > 0) {
        const forceConfirm = confirm(`${result.message}\n\nDeseja excluir mesmo assim? Os processos NÃO serão removidos, apenas a construtora.`);
        if (forceConfirm) {
          const forceResult = await deleteVendor(vendorId, true);
          if (forceResult.success) {
            showNotification(forceResult.message, 'success');
            await loadVendors(true);
          } else {
            showNotification(forceResult.message, 'error');
          }
        }
        return;
      }
      showNotification(result.message, 'error');
      return;
    }
    
    showNotification(result.message, 'success');
    await loadVendors(true);
  } catch (err) {
    console.error('Erro ao excluir construtora:', err);
    showNotification(err.message || 'Erro ao excluir construtora', 'error');
  }
}

/**
 * Exclui um empreendimento de uma construtora após confirmação.
 */
async function deleteEmpreendimentoUI(vendorId, empId, empName) {
  const confirmed = confirm(` ATENÇÃO!\n\nDeseja realmente excluir o empreendimento "${empName}"?\n\nTodos os blocos e apartamentos vinculados também serão removidos.\nEsta ação não pode ser desfeita.`);
  if (!confirmed) return;
  
  try {
    showNotification('Verificando vínculos...', 'info');
    const result = await deleteEmpreendimento(vendorId, empId);
    
    if (!result.success) {
      // Se há processos vinculados, pergunta se quer forçar
      if (result.contractsCount > 0) {
        const forceConfirm = confirm(`${result.message}\n\nDeseja excluir mesmo assim? Os processos NÃO serão removidos, apenas o empreendimento.`);
        if (forceConfirm) {
          const forceResult = await deleteEmpreendimento(vendorId, empId, true);
          if (forceResult.success) {
            showNotification(forceResult.message, 'success');
            await loadVendors(true);
          } else {
            showNotification(forceResult.message, 'error');
          }
        }
        return;
      }
      showNotification(result.message, 'error');
      return;
    }
    
    showNotification(result.message, 'success');
    await loadVendors(true);
  } catch (err) {
    console.error('Erro ao excluir empreendimento:', err);
    showNotification(err.message || 'Erro ao excluir empreendimento', 'error');
  }
}

/**
 * Exclui um bloco de um empreendimento após confirmação.
 */
async function deleteBlocoUI(vendorId, empId, blocoId, blocoName) {
  const confirmed = confirm(` ATENÇÃO!\n\nDeseja realmente excluir o bloco "${blocoName}"?\n\nTodos os apartamentos vinculados também serão removidos.\nEsta ação não pode ser desfeita.`);
  if (!confirmed) return;
  
  try {
    showNotification('Excluindo bloco...', 'info');
    const result = await deleteBloco(vendorId, empId, blocoId);
    
    if (!result.success) {
      showNotification(result.message, 'error');
      return;
    }
    
    showNotification(result.message, 'success');
    await loadVendors(true);
  } catch (err) {
    console.error('Erro ao excluir bloco:', err);
    showNotification(err.message || 'Erro ao excluir bloco', 'error');
  }
}

window.__VENDORS_UI__ = {
  state,
  reload: ()=>loadVendors(true),
  updateAllDatalists,
  editVendor,
  manageEmpreendimentos,
  addBloco,
  addApartamento: addApartamentoFn,
  editEmpreendimentoName,
  editEmpreendimentoData,
  syncVendors: syncVendorsFromContractsUI,
  // Funções inline (collapse)
  addEmpreendimentoInline,
  promptAddBloco,
  // Funções de unificação de duplicatas
  detectDuplicates: detectDuplicateVendorsUI,
  mergeDuplicates: mergeDuplicateVendorsUI,
  unifyAll: unifyAllDuplicatesUI,
  // Funções de exclusão
  deleteVendorUI,
  deleteEmpreendimentoUI,
  deleteBlocoUI
};

// ========== FUNÇÕES DE UNIFICAÇÃO DE DUPLICATAS ==========

/**
 * Detecta e exibe construtoras duplicadas (case-insensitive).
 */
async function detectDuplicateVendorsUI() {
  try {
    showNotification('Analisando construtoras duplicadas...', 'info');
    const duplicates = await detectDuplicateVendors();
    
    if (duplicates.length === 0) {
      showNotification('Nenhuma construtora duplicada encontrada!', 'success');
      return;
    }
    
    // Exibe modal com as duplicatas
    showDuplicatesModal(duplicates);
    
  } catch (err) {
    console.error('Erro ao detectar duplicatas:', err);
    showNotification('Erro ao detectar duplicatas: ' + err.message, 'error');
  }
}

/**
 * Exibe modal com construtoras duplicadas para revisão/unificação.
 */
function showDuplicatesModal(duplicates) {
  // Remove modal anterior se existir
  const oldModal = document.getElementById('modal-duplicates');
  if (oldModal) oldModal.remove();
  
  // Calcula totais
  const totalGroups = duplicates.length;
  const totalContracts = duplicates.reduce((sum, g) => 
    sum + g.duplicates.reduce((s, d) => s + d.count, 0), 0);
  
  const modalHtml = `
    <div class="modal fade" id="modal-duplicates" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-warning text-dark">
            <h5 class="modal-title">
              <i class="bi bi-exclamation-triangle"></i> Construtoras Duplicadas
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <i class="bi bi-info-circle"></i> 
              Foram encontrados <strong>${totalGroups} grupos</strong> de construtoras duplicadas, 
              afetando <strong>${totalContracts} processos</strong>.
              <br><small>A versão com mais processos será mantida como padrão (geralmente em MAIÚSCULAS).</small>
            </div>
            
            <div class="duplicates-list">
              ${duplicates.map((group, idx) => {
                const total = group.duplicates.reduce((s, d) => s + d.count, 0);
                const target = group.duplicates[0]; // Maior contagem
                const sources = group.duplicates.slice(1);
                
                return `
                  <div class="card mb-3" data-group-idx="${idx}">
                    <div class="card-header d-flex justify-content-between align-items-center">
                      <div>
                        <strong>${group.canonical}</strong>
                        <span class="badge bg-secondary ms-2">${total} processos</span>
                      </div>
                      <button type="button" class="btn btn-sm btn-outline-success btn-merge-group" 
                              data-target="${target.name}" 
                              data-sources='${JSON.stringify(sources.map(s => s.name))}'>
                        <i class="bi bi-arrow-left-right"></i> Unificar
                      </button>
                    </div>
                    <div class="card-body">
                      <table class="table table-sm table-borderless mb-0">
                        <tbody>
                          ${group.duplicates.map((d, i) => `
                            <tr class="${i === 0 ? 'table-success' : ''}">
                              <td style="width:40px;">
                                ${i === 0 
                                  ? '<i class="bi bi-check-circle-fill text-success" title="Será mantido"></i>' 
                                  : '<i class="bi bi-arrow-right text-muted" title="Será mesclado"></i>'}
                              </td>
                              <td>
                                <code>${d.name}</code>
                                ${d.vendorId ? '<span class="badge bg-info ms-1" title="Cadastrado no sistema">Cadastrada</span>' : ''}
                              </td>
                              <td class="text-end">
                                <span class="badge bg-primary">${d.count} processos</span>
                              </td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
          <div class="modal-footer justify-content-between">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
            <button type="button" class="btn btn-success" id="btn-unify-all-duplicates">
              <i class="bi bi-check2-all"></i> Unificar Todas (${totalGroups} grupos)
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  const modal = new bootstrap.Modal(document.getElementById('modal-duplicates'));
  modal.show();
  
  // Event listeners
  document.querySelectorAll('.btn-merge-group').forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = btn.dataset.target;
      const sources = JSON.parse(btn.dataset.sources);
      await mergeSingleGroupUI(target, sources, btn);
    });
  });
  
  document.getElementById('btn-unify-all-duplicates')?.addEventListener('click', async () => {
    await unifyAllDuplicatesUI();
    modal.hide();
  });
}

/**
 * Mescla um único grupo de duplicatas.
 */
async function mergeSingleGroupUI(target, sources, btn) {
  if (!confirm(`Unificar "${sources.join('", "')}" em "${target}"?\n\nTodos os processos serão atualizados.`)) {
    return;
  }
  
  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    
    const result = await mergeVendors(target, sources);
    
    showNotification(
      ` Unificado! ${result.contractsUpdated} processos atualizados.`,
      'success'
    );
    
    // Atualiza UI
    btn.closest('.card').classList.add('border-success');
    btn.innerHTML = '<i class="bi bi-check-lg"></i> Feito';
    btn.classList.remove('btn-outline-success');
    btn.classList.add('btn-success');
    
    // Recarrega lista de vendors
    await loadVendors(true);
    
  } catch (err) {
    console.error('Erro ao mesclar grupo:', err);
    showNotification('Erro ao unificar: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-arrow-left-right"></i> Unificar';
  }
}

/**
 * Mescla manualmente construtoras específicas.
 */
async function mergeDuplicateVendorsUI(targetName, sourceNames) {
  if (!targetName || !sourceNames || sourceNames.length === 0) {
    showNotification('Informe o nome alvo e os nomes a serem mesclados.', 'warning');
    return;
  }
  
  if (!confirm(`Unificar "${sourceNames.join('", "')}" em "${targetName}"?\n\nEsta ação atualizará todos os processos relacionados.`)) {
    return;
  }
  
  try {
    showNotification('Unificando construtoras...', 'info');
    
    const result = await mergeVendors(targetName, sourceNames);
    
    showNotification(
      ` Unificação concluída!\n${result.contractsUpdated} processos atualizados\n${result.vendorsDeleted} cadastros removidos`,
      'success'
    );
    
    await loadVendors(true);
    
  } catch (err) {
    console.error('Erro ao mesclar construtoras:', err);
    showNotification('Erro ao unificar: ' + err.message, 'error');
  }
}

/**
 * Unifica automaticamente todas as construtoras duplicadas.
 */
async function unifyAllDuplicatesUI() {
  const duplicates = await detectDuplicateVendors();
  
  if (duplicates.length === 0) {
    showNotification('Nenhuma construtora duplicada encontrada!', 'success');
    return;
  }
  
  const totalGroups = duplicates.length;
  const message = `Unificar TODOS os ${totalGroups} grupos de construtoras duplicadas?\n\n` +
    `Esta ação irá:\n` +
    `• Manter a versão com mais processos de cada grupo\n` +
    `• Atualizar todos os processos afetados\n` +
    `• Mesclar os cadastros de empreendimentos\n\n` +
    `ATENÇÃO: Esta operação não pode ser desfeita.`;
  
  if (!confirm(message)) {
    return;
  }
  
  try {
    showNotification('Unificando todas as construtoras duplicadas... Aguarde.', 'info');
    
    const result = await unifyAllDuplicateVendors();
    
    // Prepara resumo
    let summary = ` Unificação concluída!\n\n`;
    summary += ` Resumo:\n`;
    summary += `• ${result.totalMerged} grupos unificados\n`;
    summary += `• ${result.totalContractsUpdated} processos atualizados\n`;
    summary += `• ${result.totalVendorsDeleted} cadastros removidos\n\n`;
    
    if (result.groups.some(g => g.status === 'error')) {
      summary += ` Alguns grupos tiveram erros:\n`;
      result.groups.filter(g => g.status === 'error').forEach(g => {
        summary += `• ${g.target}: ${g.error}\n`;
      });
    }
    
    showNotification(summary, 'success');
    
    // Exibe detalhes no console
    console.log(' Detalhes da unificação:', result);
    
    // Recarrega lista de vendors
    await loadVendors(true);
    
    // Fecha modal se aberto
    const modal = document.getElementById('modal-duplicates');
    if (modal) {
      bootstrap.Modal.getInstance(modal)?.hide();
    }
    
  } catch (err) {
    console.error('Erro ao unificar todas:', err);
    showNotification('Erro na unificação: ' + err.message, 'error');
  }
}

// ---------- Modal Detalhes Construtora ----------
function openVendorDetailModal(){
  if(!state.current) return;
  const modal = document.getElementById('modal-vendor-detail');
  const container = document.getElementById('modal-vendor-detail-container');
  if(!modal || !container) return;
  const v = state.current;
  // Estatísticas
  const totalEmp = (v.empreendimentos||[]).length;
  let totalBlocos = 0; let totalAptos = 0;
  (v.empreendimentos||[]).forEach(e=>{ totalBlocos += (e.blocos||[]).length; (e.blocos||[]).forEach(b=> totalAptos += (b.apartamentos||[]).length); });
  const activeBadge = v.active!==false ? '<span class="badge bg-success">Ativa</span>' : '<span class="badge bg-secondary">Inativa</span>';
  
  // Informações de contato
  const contactInfo = [];
  if(v.cnpj) contactInfo.push(`<div><i class="bi bi-file-earmark-text"></i> <strong>CNPJ:</strong> ${v.cnpj}</div>`);
  if(v.email) contactInfo.push(`<div><i class="bi bi-envelope"></i> <strong>E-mail:</strong> <a href="mailto:${v.email}">${v.email}</a></div>`);
  if(v.telefone) contactInfo.push(`<div><i class="bi bi-telephone"></i> <strong>Telefone:</strong> <a href="tel:${v.telefone}">${v.telefone}</a></div>`);
  if(v.endereco) contactInfo.push(`<div><i class="bi bi-geo-alt"></i> <strong>Endereço:</strong> ${v.endereco}</div>`);
  
  container.innerHTML = `
    <div class="vendor-detail-header">
      <div>
        <h3>${v.name}</h3>
        <div class="vendor-meta-stats">
          <span>${totalEmp} empreend.</span>
          <span>${totalBlocos} blocos</span>
          <span>${totalAptos} aptos</span>
          ${activeBadge}
        </div>
      </div>
    </div>
    ${contactInfo.length > 0 ? `<div class="vendor-contact-info mb-3 d-flex flex-column gap-2 small">${contactInfo.join('')}</div>` : ''}
    ${v.observacoes ? `<div class="alert alert-info mb-3 small"><strong>Observações:</strong><br>${v.observacoes}</div>` : ''}
    <div class="vendor-hierarchy">
      ${(v.empreendimentos||[]).map(e=>{
        const blocos = (e.blocos||[]).map(b=>{
          const apts = (b.apartamentos||[]).map(a=>`<span class="apt" title="Apartamento">${a.numero}</span>`).join('');
          return `<div class="bloco"><div class="bloco-title"> ${b.nome} <span class="badge bg-info">${(b.apartamentos||[]).length} aptos</span></div><div class="apts">${apts||'<span class=\'text-muted small\'>Sem apartamentos</span>'}</div></div>`;
        }).join('');
        return `<div class="emp-card"><div class="emp-title"> ${e.nome} <span class="badge bg-secondary">${(e.blocos||[]).length} blocos</span></div><div class="blocos">${blocos||'<span class=\'text-muted small\'>Sem blocos</span>'}</div></div>`;
      }).join('') || '<div class="text-muted small">Nenhum empreendimento cadastrado.</div>'}
    </div>
  `;
  if (window.bootstrap?.Modal) {
    window.bootstrap.Modal.getOrCreateInstance(modal).show();
  } else {
    modal.classList.add('show');
    modal.style.display = 'block';
  }
}

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('#vendor-open-detail-btn');
  if(btn){ openVendorDetailModal(); }
});
