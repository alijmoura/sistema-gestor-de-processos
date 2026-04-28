/**
 * @file inlineEditService.js
 * @description Serviço para edição inline de campos na tabela da list-section.
 * Permite clicar nas células e editar valores diretamente sem abrir modal.
 */

import * as firestore from './firestoreService.js';
import { showNotification } from './ui.js';
import { TABLE_COLUMNS } from './config.js';

// Campos que podem ser editados inline (todos os campos do sistema)
// Gerados dinamicamente a partir de TABLE_COLUMNS
const INLINE_EDITABLE_FIELDS = TABLE_COLUMNS
  .filter(col => {
    // Exclui campos que não fazem sentido editar inline (IDs, campos complexos)
    const excludeFields = ['id', 'compradores', 'gastosAdicionais', 'repasses', 'cartaCohapar', 'workflowId'];
    return !excludeFields.includes(col.key);
  })
  .map(col => col.key);

// Configuração de tipos de inputs por campo
// Define se é text, select, date, etc. e qual source usar para selects
const FIELD_INPUT_CONFIG = {
  // Selects (campos com opções pré-definidas)
  status: { type: 'select', optionSource: 'statuses' },
  agencia: { type: 'select', optionSource: 'agencias' },
  analista: { type: 'select', optionSource: 'users' },
  analistaCehop: { type: 'select', optionSource: 'users' },
  cartorio: { type: 'select', optionSource: 'cartorios' },
  certificadora: { type: 'select', optionSource: 'text' },
  
  // Campos de data
  entrada: { type: 'date' },
  dataMinuta: { type: 'date' },
  dataAssinaturaCliente: { type: 'date' },
  dataEntradaRegistro: { type: 'date' },
  dataAnaliseRegistro: { type: 'date' },
  dataPrevistaRegistro: { type: 'date' },
  dataRetornoRi: { type: 'date' },
  dataRetiradaContratoRegistrado: { type: 'date' },
  solicitaITBI: { type: 'date' },
  retiradaITBI: { type: 'date' },
  enviadoPgtoItbi: { type: 'date' },
  retornoPgtoItbi: { type: 'date' },
  dataSolicitacaoFunrejus: { type: 'date' },
  dataEmissaoFunrejus: { type: 'date' },
  funrejusEnviadoPgto: { type: 'date' },
  funrejusRetornoPgto: { type: 'date' },
  enviadoVendedor: { type: 'date' },
  retornoVendedor: { type: 'date' },
  enviadoAgencia: { type: 'date' },
  retornoAgencia: { type: 'date' },
  dataConformidadeCehop: { type: 'date' },
  certificacaoSolicEm: { type: 'date' },
  certificacaoRealizadaEm: { type: 'date' },
  dataEmissaoNF: { type: 'date' },
  dataEnvioLiberacaoGarantia: { type: 'date' },
  
  // Campos de texto (padrão para campos não especificados)
  clientePrincipal: { type: 'text' },
  empreendimento: { type: 'text' },
  vendedorConstrutora: { type: 'text' },
  nContratoCEF: { type: 'text' },
  gerente: { type: 'text' },
  apto: { type: 'text' },
  bloco: { type: 'text' },
  iptu: { type: 'text' },
  protocoloRi: { type: 'text' },
  matriculaImovel: { type: 'text' },
  municipioImovel: { type: 'text' },
  produto: { type: 'text' },
  imobiliaria: { type: 'text' },
  portaDeEntrada: { type: 'text' },
  corretor: { type: 'text' },
  formaPagamentoRi: { type: 'text' },
  
  // Campos numéricos
  valorITBI: { type: 'number' },
  valorContrato: { type: 'number' },
  valorDepositoRi: { type: 'number' },
  valorFinalRi: { type: 'number' },
  valorFunrejus: { type: 'number' },
  valorDespachante: { type: 'number' },
  subsidio: { type: 'number' },
  
  // Campos de texto especializado
  entregueCehop: { type: 'text' },
  conformeEm: { type: 'text' },
  solicitacaoCohapar: { type: 'text' },
  cohaparAprovada: { type: 'text' },
};

// Estado global de edição
const editState = {
  activeCell: null,
  activeField: null,
  activeContractId: null,
  originalValue: null,
  isEditing: false,
};

// Cache de opções para selects
const selectOptions = {
  statuses: [],
  agencias: [],
  users: [],
  cartorios: [],
};

/**
 * Inicializa o serviço de edição inline
 * @param {Function} getStatusConfig - Função para obter status disponíveis
 * @param {Function} getUsers - Função para obter usuários
 */
export function initInlineEdit(getStatusConfig, getUsers) {
  // Carrega opções de selects
  if (typeof getStatusConfig === 'function') {
    selectOptions.statuses = (getStatusConfig() || []).map(s => ({
      value: s.text,
      label: s.text
    }));
  }

  if (typeof getUsers === 'function') {
    const users = getUsers() || [];
    selectOptions.users = users.map(u => ({
      value: u.uid,
      label: u.displayName || u.email
    }));
  }

  // Carrega agências e cartórios de forma assíncrona
  loadSelectOptionsAsync();

  // Adiciona listeners de clique nas células
  setupTableEditListeners();

  console.log(' Inline Edit inicializado');
}

/**
 * Carrega opções de selects de forma assíncrona
 */
async function loadSelectOptionsAsync() {
  try {
    // Carrega agências
    if (window.agenciasService) {
      const agencias = await window.agenciasService.getAllAgencias();
      selectOptions.agencias = (agencias || []).map(a => ({
        value: a.nome || a.codigo || a.id,
        label: a.nome || a.codigo || a.id
      }));
      console.log(` ${selectOptions.agencias.length} agências carregadas`);
    }

    // Carrega cartórios
    if (window.cartoriosService) {
      const cartorios = await window.cartoriosService.getAllCartorios();
      selectOptions.cartorios = (cartorios || []).map(c => ({
        value: c.nome || c.id,
        label: c.nome || c.id
      }));
      console.log(` ${selectOptions.cartorios.length} cartórios carregados`);
    }
  } catch (error) {
    console.warn('Erro ao carregar opções de selects:', error);
  }
}

/**
 * Configura listeners de clique duplo nas células
 */
function setupTableEditListeners() {
  document.addEventListener('dblclick', (e) => {
    const cell = e.target.closest('#contract-list td:not(.checkbox-column):not(.actions-cell)');
    if (!cell) return;

    const row = cell.closest('tr');
    const checkbox = row?.querySelector('.row-checkbox');
    const contractId = checkbox?.dataset.id;

    if (!contractId) return;

    // Encontra qual campo é essa coluna
    const cellIndex = Array.from(cell.parentElement.children).indexOf(cell);
    const headerCells = document.querySelectorAll('#table-header th:not(.checkbox-column):not(:last-child)');
    
    if (cellIndex < 1 || cellIndex - 1 >= headerCells.length) return;

    const headerCell = headerCells[cellIndex - 1];
    const fieldName = headerCell.dataset.sortKey;

    if (!fieldName || !INLINE_EDITABLE_FIELDS.includes(fieldName)) {
      return; // Campo não editável
    }

    startEditing(cell, fieldName, contractId);
  });

  // Fecha edição ao clicar fora
  document.addEventListener('click', (e) => {
    if (editState.isEditing) {
      if (!e.target.closest('#inline-edit-input') && !e.target.closest('td')) {
        saveEdit();
      }
    }
  });

  // Teclas de atalho
  document.addEventListener('keydown', (e) => {
    if (!editState.isEditing) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  });
}

/**
 * Inicia edição de uma célula
 */
function startEditing(cell, fieldName, contractId) {
  // Se já estava editando outra, salva primeiro
  if (editState.isEditing && editState.activeCell !== cell) {
    saveEdit();
  }

  editState.activeCell = cell;
  editState.activeField = fieldName;
  editState.activeContractId = contractId;
  editState.originalValue = cell.textContent.trim();
  editState.isEditing = true;

  const config = FIELD_INPUT_CONFIG[fieldName];
  const inputType = config?.type || 'text';

  // Limpa o conteúdo e cria input
  cell.style.padding = '0';
  cell.style.backgroundColor = '#fff9e6';
  cell.style.border = '2px solid #ffc107';

  if (inputType === 'select') {
    createSelectInput(cell, fieldName, config);
  } else if (inputType === 'date') {
    createDateInput(cell, fieldName);
  } else if (inputType === 'number') {
    createNumberInput(cell, fieldName);
  } else {
    createTextInput(cell, fieldName);
  }

  // Focus no input
  const input = cell.querySelector('#inline-edit-input');
  if (input) {
    setTimeout(() => input.focus(), 0);
    if (input.type === 'text' || input.type === 'number') {
      input.select();
    }
  }
}

/**
 * Cria input de texto para edição
 */
function createTextInput(cell) {
  const input = document.createElement('input');
  input.id = 'inline-edit-input';
  input.type = 'text';
  input.className = 'form-control form-control-sm';
  input.value = editState.originalValue;
  input.style.margin = '0';
  input.style.borderRadius = '3px';

  cell.innerHTML = '';
  cell.appendChild(input);
}

/**
 * Cria input de data para edição
 */
function createDateInput(cell) {
  const input = document.createElement('input');
  input.id = 'inline-edit-input';
  input.type = 'date';
  input.className = 'form-control form-control-sm';
  input.style.margin = '0';
  input.style.borderRadius = '3px';

  // Converte valor exibido para formato de input date (YYYY-MM-DD)
  // O valor pode estar em diversos formatos (DD/MM/YYYY, YYYY-MM-DD, etc)
  const value = editState.originalValue;
  if (value) {
    const dateObj = parseDate(value);
    if (dateObj) {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      input.value = `${year}-${month}-${day}`;
    }
  }

  cell.innerHTML = '';
  cell.appendChild(input);
}

/**
 * Cria input numérico para edição
 */
function createNumberInput(cell) {
  const input = document.createElement('input');
  input.id = 'inline-edit-input';
  input.type = 'number';
  input.className = 'form-control form-control-sm';
  input.value = editState.originalValue;
  input.step = '0.01';
  input.style.margin = '0';
  input.style.borderRadius = '3px';

  cell.innerHTML = '';
  cell.appendChild(input);
}

/**
 * Tenta parsear uma data em múltiplos formatos
 */
function parseDate(dateString) {
  if (!dateString) return null;

  const str = dateString.trim();

  // Tenta YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return new Date(str + 'T00:00:00');
  }

  // Tenta DD/MM/YYYY
  const ddmmyyyyMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddmmyyyyMatch) {
    return new Date(ddmmyyyyMatch[3], parseInt(ddmmyyyyMatch[2]) - 1, ddmmyyyyMatch[1]);
  }

  // Tenta MM/DD/YYYY (formato americano)
  const mmddyyyyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mmddyyyyMatch) {
    return new Date(mmddyyyyMatch[3], parseInt(mmddyyyyMatch[1]) - 1, mmddyyyyMatch[2]);
  }

  return null;
}

/**
 * Cria select para edição
 */
function createSelectInput(cell, fieldName, config) {
  const select = document.createElement('select');
  select.id = 'inline-edit-input';
  select.className = 'form-select form-select-sm';
  select.style.margin = '0';
  select.style.borderRadius = '3px';

  const optionSource = config.optionSource;
  const options = selectOptions[optionSource] || [];

  // Adiciona opção vazia
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = '-- Selecionar --';
  select.appendChild(emptyOption);

  // Adiciona opções
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === editState.originalValue) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  cell.innerHTML = '';
  cell.appendChild(select);
}

/**
 * Salva a edição
 */
async function saveEdit() {
  if (!editState.isEditing || !editState.activeCell) {
    cancelEdit();
    return;
  }

  const input = editState.activeCell.querySelector('#inline-edit-input');
  if (!input) {
    cancelEdit();
    return;
  }

  let newValue = input.value.trim();
  const { activeCell, originalValue, activeField, activeContractId } = editState;
  const config = FIELD_INPUT_CONFIG[activeField];
  const inputType = config?.type || 'text';

  // Se não mudou, apenas cancela
  if (newValue === originalValue) {
    cancelEdit();
    return;
  }

  try {
    // Validação básica
    if (!newValue && inputType !== 'number') {
      showNotification('Campo não pode ficar vazio', 'warning');
      return;
    }

    // Formata valor de data para exibição (DD/MM/YYYY)
    let displayValue = newValue;
    if (inputType === 'date' && newValue) {
      const parts = newValue.split('-'); // YYYY-MM-DD
      if (parts.length === 3) {
        displayValue = `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
        newValue = displayValue; // Salva no formato DD/MM/YYYY
      }
    }

    // Converte número se necessário
    if (inputType === 'number' && newValue) {
      newValue = parseFloat(newValue);
    }

    // Log detalhado para debugging de histórico
    console.log(`
 ═══════════════════════════════════════════════════════
   EDIÇÃO INLINE - INICIANDO SALVAMENTO
   Campo: ${activeField}
   Valor Antigo: "${editState.originalValue}"
   Valor Novo: "${newValue}"
   Contrato ID: ${activeContractId}
   Tipo: ${inputType}
═══════════════════════════════════════════════════════`);
    
    await firestore.updateContract(activeContractId, {
      [activeField]: newValue
    });

    console.log(` Contrato atualizado no Firestore. Aguardando geração de histórico...`);

    //  SINCRONIZAÇÃO: Se o modal de detalhes está aberto para este contrato,
    // atualizar o originalContractData para evitar mudanças falsas
    const detailsModal = document.getElementById('details-modal');
    if (detailsModal && detailsModal.classList.contains('show')) {
      const contractIdInModal = document.getElementById('modal-contract-id')?.value;
      if (contractIdInModal === activeContractId) {
        try {
          const updatedData = await firestore.getContractById(activeContractId);
          // Dispara evento para atualizar originalContractData no eventListeners.js
          window.dispatchEvent(new CustomEvent('inline-edit-sync', {
            detail: { contractId: activeContractId, updatedData: updatedData }
          }));
          console.log(` originalContractData sincronizado após edição inline`);
        } catch (err) {
          console.warn('Aviso: Falha ao sincronizar originalContractData:', err);
        }
      }
    }

    // Restaura célula com novo valor
    activeCell.style.padding = '';
    activeCell.style.backgroundColor = '';
    activeCell.style.border = '';
    activeCell.textContent = displayValue;
    activeCell.classList.add('updated-cell');

    // Remove classe após animação
    setTimeout(() => {
      activeCell.classList.remove('updated-cell');
    }, 1500);

    showNotification(`${getFieldLabel(activeField)} atualizado com sucesso`, 'success');
    
    console.log(`
 ═══════════════════════════════════════════════════════
   EDIÇÃO INLINE - SUCESSO
   Campo: ${activeField}
   Novo Valor: "${displayValue}"
   Status: Salvo em Firestore + Histórico registrado
   ⏱  Verifique o Firestore em: contracts/${activeContractId}/historico
═══════════════════════════════════════════════════════`);
    
    //  Atualiza cache local e re-renderiza a UI para refletir mudanças visuais
    // Principalmente importante para campos como 'status' que afetam estilos (cor de fundo, border)
    if (typeof window.updateContractInLocalCache === 'function') {
      window.updateContractInLocalCache(activeContractId, {
        [activeField]: newValue
      });
      console.log(` [Inline Edit] Cache local atualizado para ${activeField}`);
    }
    
    // Re-renderiza a view completa se disponível (garante que cores/estilos sejam aplicados)
    if (typeof window.rerenderCurrentView === 'function') {
      window.rerenderCurrentView();
      console.log(` [Inline Edit] View re-renderizada para refletir mudanças`);
    }
    
    editState.isEditing = false;
    editState.activeCell = null;

  } catch (error) {
    console.error(`
 ═══════════════════════════════════════════════════════
   ERRO AO SALVAR EDIÇÃO INLINE
   Campo: ${editState.activeField}
   Contrato ID: ${editState.activeContractId}
   Erro: ${error.message}
   Stack: ${error.stack}
═══════════════════════════════════════════════════════`);
    
    showNotification('Erro ao salvar: ' + error.message, 'danger');
    cancelEdit();
  }
}

/**
 * Cancela edição
 */
function cancelEdit() {
  if (!editState.activeCell) return;

  const { activeCell, originalValue } = editState;

  // Restaura célula
  activeCell.style.padding = '';
  activeCell.style.backgroundColor = '';
  activeCell.style.border = '';
  activeCell.textContent = originalValue;

  editState.isEditing = false;
  editState.activeCell = null;
  editState.activeField = null;
  editState.activeContractId = null;
  editState.originalValue = null;
}

/**
 * Obtém label do campo
 */
function getFieldLabel(fieldName) {
  const column = TABLE_COLUMNS.find(c => c.key === fieldName);
  return column?.label || fieldName;
}

/**
 * Atualiza opções de selects dinamicamente
 */
export function updateSelectOptions(source, options) {
  if (Object.prototype.hasOwnProperty.call(selectOptions, source)) {
    selectOptions[source] = options;
  }
}

/**
 * Verifica se um campo é editável
 */
export function isFieldEditable(fieldName) {
  return INLINE_EDITABLE_FIELDS.includes(fieldName);
}

/**
 * Retorna lista de campos editáveis
 */
export function getEditableFields() {
  return INLINE_EDITABLE_FIELDS;
}

export default {
  initInlineEdit,
  updateSelectOptions,
  isFieldEditable,
  getEditableFields,
};
