/**
 * @file listToolbar.js
 * @description Módulo para controle de filtragem e exportação na list-section.
 * Permite personalizar a visualização da tabela de processos.
 */

import { exportToCSV } from './exportService.js';
import { EXPORTABLE_FIELDS, TABLE_COLUMNS } from './config.js';
import { showNotification } from './ui.js';

// Estado interno do módulo
const listToolbarState = {
  quickSearch: '',
  filterField: 'all',
  dateFrom: null,
  dateTo: null,
  isFiltered: false,
  originalContracts: [], // Contratos antes da filtragem local
  filteredContracts: [], // Contratos após filtragem local
};

// Elementos DOM
let elements = {};

/**
 * Inicializa a toolbar da lista
 * @param {Function} getContracts - Função para obter contratos atuais
 * @param {Function} getVisibleColumns - Função para obter colunas visíveis
 * @param {Function} onFilterApply - Callback quando filtro é aplicado
 */
export function initListToolbar(getContracts, getVisibleColumns, onFilterApply) {
  // Captura elementos DOM
  elements = {
    quickSearch: document.getElementById('list-quick-search'),
    clearSearch: document.getElementById('list-clear-search'),
    filterField: document.getElementById('list-filter-field'),
    dateFrom: document.getElementById('list-date-from'),
    dateTo: document.getElementById('list-date-to'),
    applyFilters: document.getElementById('list-apply-filters'),
    clearFilters: document.getElementById('list-clear-filters'),
    exportBtn: document.getElementById('list-export-btn'),
    exportVisible: document.getElementById('list-export-visible'),
    exportFiltered: document.getElementById('list-export-filtered'),
    exportSelected: document.getElementById('list-export-selected'),
    exportCustom: document.getElementById('list-export-custom'),
    printTable: document.getElementById('list-print-table'),
    filterSummary: document.getElementById('list-filter-summary'),
    filterInfo: document.getElementById('list-filter-info'),
  };

  // Verifica se elementos existem (pode estar em outra página)
  if (!elements.quickSearch) return;

  // Event Listeners
  setupEventListeners(getContracts, getVisibleColumns, onFilterApply);
  
  // Popula campos de filtro baseado nas colunas disponíveis
  populateFilterFieldOptions();

  console.log(' List Toolbar inicializada');
}

/**
 * Configura todos os event listeners
 */
function setupEventListeners(getContracts, getVisibleColumns, onFilterApply) {
  // Busca rápida - filtro em tempo real (com debounce)
  let searchTimeout;
  elements.quickSearch?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      listToolbarState.quickSearch = e.target.value.trim().toLowerCase();
      applyLocalFilter(getContracts, onFilterApply);
    }, 300);
  });

  // Limpar busca rápida
  elements.clearSearch?.addEventListener('click', () => {
    elements.quickSearch.value = '';
    listToolbarState.quickSearch = '';
    applyLocalFilter(getContracts, onFilterApply);
  });

  // Mudança no campo de filtro
  elements.filterField?.addEventListener('change', (e) => {
    listToolbarState.filterField = e.target.value;
  });

  // Aplicar filtros (inclui data)
  elements.applyFilters?.addEventListener('click', () => {
    listToolbarState.dateFrom = elements.dateFrom?.value || null;
    listToolbarState.dateTo = elements.dateTo?.value || null;
    applyLocalFilter(getContracts, onFilterApply);
  });

  // Limpar todos os filtros
  elements.clearFilters?.addEventListener('click', () => {
    clearAllFilters(getContracts, onFilterApply);
  });

  // Exportações
  elements.exportBtn?.addEventListener('click', () => {
    exportCurrentView(getContracts, getVisibleColumns, 'visible');
  });

  elements.exportVisible?.addEventListener('click', () => {
    exportCurrentView(getContracts, getVisibleColumns, 'visible');
  });

  elements.exportFiltered?.addEventListener('click', () => {
    exportCurrentView(getContracts, getVisibleColumns, 'filtered');
  });

  elements.exportSelected?.addEventListener('click', () => {
    exportSelectedRows(getVisibleColumns);
  });

  elements.exportCustom?.addEventListener('click', () => {
    openCustomExportModal(getContracts);
  });

  elements.printTable?.addEventListener('click', () => {
    printCurrentTable();
  });

  // Enter na busca aplica filtro
  elements.quickSearch?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      listToolbarState.quickSearch = e.target.value.trim().toLowerCase();
      applyLocalFilter(getContracts, onFilterApply);
    }
  });
}

/**
 * Popula opções do select de campo de filtro baseado em TABLE_COLUMNS
 */
function populateFilterFieldOptions() {
  if (!elements.filterField) return;

  // Mantém a opção "todos"
  const defaultOption = elements.filterField.querySelector('option[value="all"]');
  elements.filterField.innerHTML = '';
  if (defaultOption) {
    elements.filterField.appendChild(defaultOption);
  }

  // Adiciona opções baseadas nas colunas da tabela
  TABLE_COLUMNS.forEach(col => {
    const option = document.createElement('option');
    option.value = col.key;
    option.textContent = col.label;
    elements.filterField.appendChild(option);
  });
}

/**
 * Aplica filtros locais na tabela (highlight visual)
 */
function applyLocalFilter(getContracts, onFilterApply) {
  const contracts = getContracts();
  if (!contracts || contracts.length === 0) {
    updateFilterSummary(0, 0);
    return;
  }

  const { quickSearch, filterField, dateFrom, dateTo } = listToolbarState;
  
  // Filtra os contratos
  const filtered = contracts.filter(contract => {
    // Filtro por texto
    if (quickSearch) {
      let match = false;
      
      if (filterField === 'all') {
        // Busca em todos os campos visíveis
        match = Object.values(contract).some(value => {
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(quickSearch);
        });
      } else {
        // Busca em campo específico
        const fieldValue = contract[filterField];
        if (fieldValue) {
          match = String(fieldValue).toLowerCase().includes(quickSearch);
        }
      }
      
      if (!match) return false;
    }

    // Filtro por período (usa o campo selecionado ou 'entrada' como padrão)
    if (dateFrom || dateTo) {
      // Determina qual campo de data usar baseado no filterField
      const dateFieldKey = filterField === 'all' ? 'entrada' : filterField;
      const contractDate = getContractDate(contract[dateFieldKey]);
      
      if (!contractDate) return false;
      
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (contractDate < fromDate) return false;
      }
      
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (contractDate > toDate) return false;
      }
    }

    return true;
  });

  listToolbarState.filteredContracts = filtered;
  listToolbarState.isFiltered = quickSearch || dateFrom || dateTo;

  // Atualiza visual da tabela (highlight)
  highlightTableRows(filtered, quickSearch);
  
  // Atualiza resumo
  updateFilterSummary(filtered.length, contracts.length);

  // Chama callback se houver filtro significativo
  if (onFilterApply && typeof onFilterApply === 'function') {
    onFilterApply(filtered, listToolbarState.isFiltered);
  }
}

/**
 * Extrai data de um campo de contrato
 */
function getContractDate(dateField) {
  if (!dateField) return null;
  
  // Timestamp do Firestore
  if (dateField.toDate) {
    return dateField.toDate();
  }
  
  // String de data
  if (typeof dateField === 'string') {
    // Tenta formato brasileiro dd/mm/yyyy
    const brMatch = dateField.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brMatch) {
      return new Date(brMatch[3], brMatch[2] - 1, brMatch[1]);
    }
    return new Date(dateField);
  }
  
  // Date object
  if (dateField instanceof Date) {
    return dateField;
  }
  
  return null;
}

/**
 * Destaca visualmente as linhas que correspondem ao filtro
 */
function highlightTableRows(filteredContracts, searchTerm) {
  const tbody = document.getElementById('contract-list');
  if (!tbody) return;

  const filteredIds = new Set(filteredContracts.map(c => c.id));
  const rows = tbody.querySelectorAll('tr');

  rows.forEach(row => {
    const checkbox = row.querySelector('.row-checkbox');
    if (!checkbox) return;
    
    const contractId = checkbox.dataset.id;
    
    if (filteredIds.has(contractId)) {
      row.classList.remove('d-none');
      if (searchTerm) {
        row.classList.add('highlight-match');
      } else {
        row.classList.remove('highlight-match');
      }
    } else if (listToolbarState.isFiltered) {
      row.classList.add('d-none');
      row.classList.remove('highlight-match');
    } else {
      row.classList.remove('d-none', 'highlight-match');
    }
  });
}

/**
 * Atualiza o resumo dos filtros ativos
 */
function updateFilterSummary(shown, total) {
  if (!elements.filterSummary || !elements.filterInfo) return;

  const { quickSearch, dateFrom, dateTo, filterField } = listToolbarState;
  
  if (!listToolbarState.isFiltered) {
    elements.filterSummary.classList.add('d-none');
    elements.filterSummary.classList.remove('has-filters');
    return;
  }

  elements.filterSummary.classList.remove('d-none');
  elements.filterSummary.classList.add('has-filters');

  // Monta descrição dos filtros
  const filterParts = [];
  
  if (quickSearch) {
    const fieldName = filterField === 'all' 
      ? 'todos os campos' 
      : TABLE_COLUMNS.find(c => c.key === filterField)?.label || filterField;
    filterParts.push(`"${quickSearch}" em ${fieldName}`);
  }
  
  if (dateFrom && dateTo) {
    filterParts.push(`período de ${formatDateBR(dateFrom)} a ${formatDateBR(dateTo)}`);
  } else if (dateFrom) {
    filterParts.push(`a partir de ${formatDateBR(dateFrom)}`);
  } else if (dateTo) {
    filterParts.push(`até ${formatDateBR(dateTo)}`);
  }

  const filterText = filterParts.length > 0 ? ` (${filterParts.join(', ')})` : '';
  elements.filterInfo.textContent = `Mostrando ${shown} de ${total} registros${filterText}`;
}

/**
 * Formata data para exibição BR
 */
function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Limpa todos os filtros
 */
function clearAllFilters(getContracts, onFilterApply) {
  // Reseta estado
  listToolbarState.quickSearch = '';
  listToolbarState.filterField = 'all';
  listToolbarState.dateFrom = null;
  listToolbarState.dateTo = null;
  listToolbarState.isFiltered = false;

  // Reseta inputs
  if (elements.quickSearch) elements.quickSearch.value = '';
  if (elements.filterField) elements.filterField.value = 'all';
  if (elements.dateFrom) elements.dateFrom.value = '';
  if (elements.dateTo) elements.dateTo.value = '';

  // Remove highlights
  const tbody = document.getElementById('contract-list');
  if (tbody) {
    tbody.querySelectorAll('tr').forEach(row => {
      row.classList.remove('d-none', 'highlight-match');
    });
  }

  // Atualiza resumo
  const contracts = getContracts();
  updateFilterSummary(contracts.length, contracts.length);

  // Callback
  if (onFilterApply) {
    onFilterApply(contracts, false);
  }

  showNotification('Filtros limpos', 'info');
}

/**
 * Exporta visualização atual
 */
function exportCurrentView(getContracts, getVisibleColumns, mode) {
  try {
    let contractsToExport;
    const visibleColumns = getVisibleColumns();
    
    if (mode === 'filtered' && listToolbarState.isFiltered) {
      contractsToExport = listToolbarState.filteredContracts;
    } else {
      contractsToExport = getContracts();
    }

    if (!contractsToExport || contractsToExport.length === 0) {
      showNotification('Nenhum registro para exportar', 'warning');
      return;
    }

    // Mapeia colunas visíveis para campos exportáveis
    const exportKeys = visibleColumns.filter(key => 
      EXPORTABLE_FIELDS.some(f => f.key === key)
    );

    if (exportKeys.length === 0) {
      // Fallback: usa colunas padrão
      exportKeys.push('vendedorConstrutora', 'empreendimento', 'clientePrincipal', 'status');
    }

    exportToCSV(contractsToExport, exportKeys);
    
    const modeText = mode === 'filtered' ? 'filtrados' : 'visíveis';
    showNotification(`${contractsToExport.length} registros ${modeText} exportados!`, 'success');
  } catch (error) {
    console.error('Erro ao exportar:', error);
    showNotification('Erro ao exportar: ' + error.message, 'danger');
  }
}

/**
 * Exporta apenas linhas selecionadas (checkboxes)
 */
function exportSelectedRows(getVisibleColumns) {
  const selectedCheckboxes = document.querySelectorAll('#contract-list .row-checkbox:checked');
  
  if (selectedCheckboxes.length === 0) {
    showNotification('Selecione pelo menos um registro para exportar', 'warning');
    return;
  }

  const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);
  
  // Busca contratos pelo ID (do appState global)
  const allContracts = window.appState?.filteredContracts || [];
  const selectedContracts = allContracts.filter(c => selectedIds.includes(c.id));

  if (selectedContracts.length === 0) {
    showNotification('Não foi possível encontrar os registros selecionados', 'warning');
    return;
  }

  const visibleColumns = getVisibleColumns();
  const exportKeys = visibleColumns.filter(key => 
    EXPORTABLE_FIELDS.some(f => f.key === key)
  );

  if (exportKeys.length === 0) {
    exportKeys.push('vendedorConstrutora', 'empreendimento', 'clientePrincipal', 'status');
  }

  try {
    exportToCSV(selectedContracts, exportKeys);
    showNotification(`${selectedContracts.length} registros selecionados exportados!`, 'success');
  } catch (error) {
    console.error('Erro ao exportar selecionados:', error);
    showNotification('Erro ao exportar: ' + error.message, 'danger');
  }
}

/**
 * Abre modal de exportação personalizada (redireciona para relatórios)
 */
function openCustomExportModal() {
  // Navega para a página de relatórios
  const reportsNav = document.querySelector('[data-page="relatorios"]');
  if (reportsNav) {
    reportsNav.click();
    showNotification('Use a Central de Relatórios para exportação personalizada', 'info');
  } else {
    showNotification('Acesse Relatórios no menu para exportação avançada', 'info');
  }
}

/**
 * Imprime a tabela atual
 */
function printCurrentTable() {
  const tableSection = document.getElementById('list-section');
  if (!tableSection) {
    showNotification('Tabela não encontrada', 'warning');
    return;
  }

  // Cria janela de impressão
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showNotification('Popup bloqueado. Permita popups para imprimir.', 'warning');
    return;
  }

  const table = tableSection.querySelector('table');
  if (!table) {
    showNotification('Tabela não encontrada', 'warning');
    printWindow.close();
    return;
  }

  // Clone da tabela sem checkboxes e ações
  const tableClone = table.cloneNode(true);
  
  // Remove colunas de checkbox e ações
  tableClone.querySelectorAll('.checkbox-column, th:last-child, td:last-child').forEach(el => el.remove());
  
  // Remove linhas ocultas
  tableClone.querySelectorAll('tr.d-none').forEach(el => el.remove());

  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Processos - Impressão</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
        h1 { font-size: 16px; margin-bottom: 10px; }
        .print-info { color: #666; margin-bottom: 15px; font-size: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
        th { background-color: #f5f5f5; font-weight: bold; }
        tr:nth-child(even) { background-color: #fafafa; }
        @media print {
          body { margin: 0; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <h1>Lista de Processos</h1>
      <div class="print-info">
        Impresso em: ${new Date().toLocaleString('pt-BR')}
        ${listToolbarState.isFiltered ? ' | Filtro aplicado' : ''}
      </div>
      ${tableClone.outerHTML}
    </body>
    </html>
  `;

  printWindow.document.write(printContent);
  printWindow.document.close();
  
  // Aguarda carregar e imprime
  printWindow.onload = () => {
    printWindow.print();
  };
}

/**
 * Retorna contratos filtrados (para uso externo)
 */
export function getFilteredContracts() {
  return listToolbarState.isFiltered 
    ? listToolbarState.filteredContracts 
    : [];
}

/**
 * Verifica se há filtro ativo
 */
export function hasActiveFilter() {
  return listToolbarState.isFiltered;
}

// Exporta estado para debug
if (typeof window !== 'undefined') {
  window.listToolbarState = listToolbarState;
}

export default {
  initListToolbar,
  getFilteredContracts,
  hasActiveFilter,
};
