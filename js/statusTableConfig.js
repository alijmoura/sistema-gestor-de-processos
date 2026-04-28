/**
 * Configurações da Tabela de Status
 * Gerencia visualização, preferências e funcionalidades da tabela de status
 * 
 * @author Sistema de Gestão de Contratos
 * @version 2.0.0
 * @date 2025-01-02
 */

// Configurações padrão
const DEFAULT_CONFIG = {
  height: '60vh',
  columns: {
    numero: true,
    nome: true,
    etapa: true,
    ordem: true,
    proximos: true,
    ativo: true,
    acoes: true
  },
  density: 'normal',
  filter: 'all'
};

// Chave para localStorage
const CONFIG_STORAGE_KEY = 'status_table_config';

// Referências DOM
let modal, tableWrapper, modalTableBody;

/**
 * Inicializa o sistema de configuração da tabela
 */
function initStatusTableConfig() {
  if (window.__DEBUG__) console.log(' Inicializando configurações da tabela de status v2.0');
  
  // Cachear elementos DOM
  modal = document.getElementById('status-table-config-modal');
  tableWrapper = document.querySelector('.status-table-wrapper');
  modalTableBody = document.getElementById('modal-status-table-body');
  
  if (!modal || !tableWrapper) {
    console.warn(' Elementos necessários para configuração da tabela não encontrados');
    return;
  }
  
  // Configurar event listeners
  setupEventListeners();
  
  // Aplicar configurações salvas
  loadAndApplyConfig();
  
  if (window.__DEBUG__) console.log(' Sistema de configuração da tabela v2.0 inicializado');
}

/**
 * Configura os event listeners
 */
function setupEventListeners() {
  // Botão para abrir modal
  const openBtn = document.getElementById('open-table-config');
  if (openBtn) {
    openBtn.addEventListener('click', openConfigModal);
  }
  
  // Botão de expandir/contrair
  const toggleBtn = document.getElementById('toggle-fullscreen-table');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleFullscreen);
  }
  
  // Botão de atualizar
  const refreshBtn = document.getElementById('refresh-status-table');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshTable);
  }
  
  // Fechar modal
  const closeBtn = modal.querySelector('.btn-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeConfigModal);
  }
  
  // Controles do modal
  setupModalControls();
  
  // Fechar modal ao clicar fora (fallback sem Bootstrap)
  modal.addEventListener('click', (e) => {
    if (!window.bootstrap?.Modal && e.target === modal) {
      closeConfigModal();
    }
  });
}

/**
 * Configura controles específicos do modal
 */
function setupModalControls() {
  // Seletores de configuração
  const heightSelect = document.getElementById('modal-table-height-select');
  const densitySelect = document.getElementById('modal-table-density-select');
  
  if (heightSelect) {
    heightSelect.addEventListener('change', applyLiveConfig);
  }
  
  if (densitySelect) {
    densitySelect.addEventListener('change', applyLiveConfig);
  }
  
  // Checkboxes de colunas
  const columnCheckboxes = modal.querySelectorAll('[id^="modal-col-"]');
  columnCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', applyLiveConfig);
  });
  
  // Filtros rápidos
  const filterRadios = modal.querySelectorAll('input[name="status-filter"]');
  filterRadios.forEach(radio => {
    radio.addEventListener('change', applyStatusFilter);
  });
  
  // Botões de ação
  document.getElementById('modal-reset-config')?.addEventListener('click', resetToDefault);
  document.getElementById('modal-refresh-table')?.addEventListener('click', refreshModalTable);
  document.getElementById('modal-export-visible')?.addEventListener('click', () => exportStatusData(false));
  document.getElementById('modal-export-all')?.addEventListener('click', () => exportStatusData(true));
  document.getElementById('modal-apply-config')?.addEventListener('click', applyAndClose);
}

/**
 * Abre o modal de configuração
 */
function openConfigModal() {
  loadConfigToModal();
  loadStatusDataToModal();
  const instance = window.bootstrap?.Modal
    ? window.bootstrap.Modal.getOrCreateInstance(modal)
    : null;

  if (instance) {
    instance.show();
  } else {
    // Fallback CSS-only
    modal.classList.remove('hidden');
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  
  // Aplicar configurações em tempo real
  setTimeout(() => {
    applyLiveConfig();
  }, 100);
}

/**
 * Fecha o modal de configuração
 */
function closeConfigModal() {
  const instance = window.bootstrap?.Modal
    ? window.bootstrap.Modal.getOrCreateInstance(modal)
    : null;

  if (instance) {
    instance.hide();
  } else {
    modal.classList.remove('show');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

/**
 * Carrega dados de status para o modal
 */
async function loadStatusDataToModal() {
  if (!modalTableBody) return;
  
  try {
    modalTableBody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando dados...</td></tr>';
    
    // Buscar dados dos status
    let statusData = [];
    
    if (window.firestoreService && typeof window.firestoreService.getEffectiveStatuses === 'function') {
      statusData = await window.firestoreService.getEffectiveStatuses();
    } else {
      console.warn(' firestoreService não disponível, usando dados mock');
      statusData = getMockStatusData();
    }
    
    renderStatusInModal(statusData);
    updateStatusCount(statusData.length);
    
  } catch (error) {
    console.error(' Erro ao carregar dados dos status:', error);
    modalTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar dados</td></tr>';
  }
}

/**
 * Renderiza status no modal
 */
function renderStatusInModal(statusData) {
  if (!modalTableBody) {
    console.error(' modalTableBody não encontrado!');
    return;
  }
  
  if (!Array.isArray(statusData) || statusData.length === 0) {
    modalTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum status encontrado</td></tr>';
    return;
  }
  
  if (window.__DEBUG__) {
    console.log(` Renderizando ${statusData.length} status no modal`);
  }
  
  modalTableBody.innerHTML = statusData.map((status, index) => {
    const isActive = status.active !== false;
    const statusClass = isActive ? 'table-success' : 'table-secondary';
    const toggleIcon = isActive ? 'bi-toggle-on text-success' : 'bi-toggle-off text-danger';
    const toggleText = isActive ? 'Ativo' : 'Inativo';
    
    return `
      <tr class="${statusClass}" data-status-id="${status.id || index}">
        <td data-column="numero">${index + 1}</td>
        <td data-column="nome">
          <strong>${status.text || status.name || 'Sem nome'}</strong>
          ${status.description ? `<br><small class="text-muted">${status.description}</small>` : ''}
        </td>
        <td data-column="etapa">
          <span class="badge bg-info">${status.stage || status.etapa || 'N/A'}</span>
        </td>
        <td data-column="ordem" class="text-center">
          <span class="badge bg-secondary">${status.order || status.ordem || 0}</span>
        </td>
        <td data-column="proximos">
          ${(status.nextSteps || status.proximos || []).length > 0 
            ? `<small>${(status.nextSteps || status.proximos).slice(0, 2).join(', ')}${(status.nextSteps || status.proximos).length > 2 ? '...' : ''}</small>`
            : '<span class="text-muted">Nenhum</span>'
          }
        </td>
        <td data-column="ativo" class="text-center">
          <i class="bi ${toggleIcon}" title="${toggleText}"></i>
          <small class="d-block">${toggleText}</small>
        </td>
        <td data-column="acoes" class="text-center">
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-primary btn-sm" title="Editar">
              <i class="bi bi-pencil"></i>
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" title="Duplicar">
              <i class="bi bi-files"></i>
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm" title="Remover">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Dados mock para fallback
 */
function getMockStatusData() {
  return [
    { id: 1, text: 'Aguardando Documentos', stage: 'Registro', order: 1, active: true, nextSteps: ['Análise', 'Validação'] },
    { id: 2, text: 'Em Análise', stage: 'Processamento', order: 2, active: true, nextSteps: ['Aprovação'] },
    { id: 3, text: 'Aprovado', stage: 'Finalização', order: 3, active: true, nextSteps: [] },
    { id: 4, text: 'Rejeitado', stage: 'Finalização', order: 4, active: false, nextSteps: ['Revisão'] }
  ];
}

/**
 * Carrega configuração para o modal
 */
function loadConfigToModal() {
  const config = getStoredConfig();
  
  // Altura da tabela
  const heightSelect = document.getElementById('modal-table-height-select');
  if (heightSelect) {
    heightSelect.value = config.height;
  }
  
  // Densidade
  const densitySelect = document.getElementById('modal-table-density-select');
  if (densitySelect) {
    densitySelect.value = config.density;
  }
  
  // Colunas visíveis
  Object.keys(config.columns).forEach(colKey => {
    const checkbox = document.getElementById(`modal-col-${colKey}`);
    if (checkbox) {
      checkbox.checked = config.columns[colKey];
    }
  });
  
  // Filtro
  const filterRadio = document.querySelector(`input[name="status-filter"][value="${config.filter}"]`);
  if (filterRadio) {
    filterRadio.checked = true;
  }
}

/**
 * Aplica configurações em tempo real
 */
function applyLiveConfig() {
  const config = getConfigFromModal();
  applyConfigToModalTable(config);
  
  // Salvar temporariamente
  saveConfig(config);
}

/**
 * Obtém configuração do modal
 */
function getConfigFromModal() {
  const config = {
    height: document.getElementById('modal-table-height-select')?.value || '60vh',
    density: document.getElementById('modal-table-density-select')?.value || 'normal',
    columns: {},
    filter: document.querySelector('input[name="status-filter"]:checked')?.value || 'all'
  };
  
  // Coletar estado das colunas
  Object.keys(DEFAULT_CONFIG.columns).forEach(colKey => {
    const checkbox = document.getElementById(`modal-col-${colKey}`);
    config.columns[colKey] = checkbox ? checkbox.checked : true;
  });
  
  return config;
}

/**
 * Aplica configuração à tabela do modal
 */
function applyConfigToModalTable(config) {
  const modalTable = modal.querySelector('.config-table-wrapper');
  if (!modalTable) return;
  
  // Aplicar densidade
  modalTable.className = modalTable.className.replace(/density-\w+/g, '');
  modalTable.classList.add(`density-${config.density}`);
  
  // Aplicar altura
  if (config.height === 'none') {
    modalTable.style.maxHeight = 'none';
  } else {
    modalTable.style.maxHeight = config.height;
  }
  
  // Aplicar visibilidade das colunas no modal
  applyColumnVisibilityToModal(config.columns);
}

/**
 * Aplica visibilidade das colunas no modal
 */
function applyColumnVisibilityToModal(columns) {
  const modalTable = modal.querySelector('.config-table-wrapper table');
  if (!modalTable) return;
  
  Object.keys(columns).forEach(colKey => {
    const isVisible = columns[colKey];
    
    // Header
    const headerCell = modalTable.querySelector(`th[data-column="${colKey}"]`);
    if (headerCell) {
      headerCell.style.display = isVisible ? '' : 'none';
    }
    
    // Body cells
    const bodyCells = modalTable.querySelectorAll(`td[data-column="${colKey}"]`);
    bodyCells.forEach(cell => {
      cell.style.display = isVisible ? '' : 'none';
    });
  });
}

/**
 * Aplica filtro de status
 */
function applyStatusFilter() {
  const filterValue = document.querySelector('input[name="status-filter"]:checked')?.value || 'all';
  const rows = modalTableBody.querySelectorAll('tr');
  
  rows.forEach(row => {
    const statusIcon = row.querySelector('[data-column="ativo"] i');
    if (!statusIcon) return;
    
    const isActive = statusIcon.classList.contains('text-success');
    
    let shouldShow = true;
    
    switch (filterValue) {
      case 'active':
        shouldShow = isActive;
        break;
      case 'inactive':
        shouldShow = !isActive;
        break;
      case 'all':
      default:
        shouldShow = true;
        break;
    }
    
    row.style.display = shouldShow ? '' : 'none';
  });
  
  // Atualizar contador
  const visibleRows = Array.from(rows).filter(row => row.style.display !== 'none').length;
  updateStatusCount(visibleRows);
}

/**
 * Atualiza contador de status
 */
function updateStatusCount(count) {
  const countElement = document.getElementById('modal-status-count');
  if (countElement) {
    countElement.textContent = count;
  }
}

/**
 * Atualiza dados da tabela do modal
 */
function refreshModalTable() {
  const btn = document.getElementById('modal-refresh-table');
  const originalHtml = btn?.innerHTML;
  
  if (btn) {
    btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Atualizando...';
    btn.disabled = true;
  }
  
  loadStatusDataToModal().then(() => {
    setTimeout(() => {
      if (btn) {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }
      showNotification('Dados atualizados!', 'success');
      applyLiveConfig(); // Reaplicar configurações
    }, 1000);
  });
}

/**
 * Aplica configuração e fecha modal
 */
function applyAndClose() {
  const config = getConfigFromModal();
  saveConfig(config);
  applyConfig(config);
  closeConfigModal();
  showNotification('Configurações aplicadas com sucesso!', 'success');
}

// Manter funções existentes com pequenos ajustes
function saveConfig(config) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    if (window.__DEBUG__) console.log(' Configuração da tabela salva:', config);
  } catch (error) {
    console.error(' Erro ao salvar configuração:', error);
  }
}

function getStoredConfig() {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    const config = stored ? JSON.parse(stored) : DEFAULT_CONFIG;
    
    return {
      ...DEFAULT_CONFIG,
      ...config,
      columns: { ...DEFAULT_CONFIG.columns, ...(config.columns || {}) }
    };
  } catch (error) {
    console.error(' Erro ao carregar configuração:', error);
    return DEFAULT_CONFIG;
  }
}

function loadAndApplyConfig() {
  const config = getStoredConfig();
  applyConfig(config);
}

function applyConfig(config) {
  if (!tableWrapper) return;
  
  // Aplicar altura
  if (config.height === 'none') {
    tableWrapper.style.maxHeight = 'none';
  } else {
    tableWrapper.style.setProperty('--status-table-height', config.height);
  }
  
  // Aplicar densidade
  tableWrapper.className = tableWrapper.className.replace(/density-\w+/g, '');
  tableWrapper.classList.add(`density-${config.density}`);
  
  // Aplicar visibilidade das colunas na tabela principal
  applyColumnVisibility(config.columns);
  
  if (window.__DEBUG__) console.log(' Configuração aplicada:', config);
}

function applyColumnVisibility(columns) {
  const table = tableWrapper.querySelector('table');
  if (!table) return;
  
  const columnMap = {
    numero: 0,
    nome: 1,
    etapa: 2,
    ordem: 3,
    proximos: 4,
    ativo: 5,
    acoes: 6
  };
  
  Object.keys(columnMap).forEach(colKey => {
    const colIndex = columnMap[colKey];
    const isVisible = columns[colKey];
    
    // Header
    const headerCell = table.querySelector(`thead tr th:nth-child(${colIndex + 1})`);
    if (headerCell) {
      headerCell.style.display = isVisible ? '' : 'none';
    }
    
    // Body cells
    const bodyCells = table.querySelectorAll(`tbody tr td:nth-child(${colIndex + 1})`);
    bodyCells.forEach(cell => {
      cell.style.display = isVisible ? '' : 'none';
    });
  });
}

function toggleFullscreen() {
  const btn = document.getElementById('toggle-fullscreen-table');
  const isFullscreen = tableWrapper.classList.contains('fullscreen');
  
  if (isFullscreen) {
    tableWrapper.classList.remove('fullscreen');
    btn.innerHTML = '<i class="bi bi-arrows-fullscreen"></i><span class="d-none d-sm-inline">Expandir</span>';
    btn.title = 'Expandir tabela';
  } else {
    tableWrapper.classList.add('fullscreen');
    btn.innerHTML = '<i class="bi bi-arrows-collapse"></i><span class="d-none d-sm-inline">Contrair</span>';
    btn.title = 'Contrair tabela';
  }
}

function refreshTable() {
  const btn = document.getElementById('refresh-status-table');
  const originalHtml = btn.innerHTML;
  
  btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i><span class="d-none d-sm-inline">Atualizando...</span>';
  btn.disabled = true;
  
  if (window.statusAdminUI && typeof window.statusAdminUI.renderStatuses === 'function') {
    window.statusAdminUI.renderStatuses();
  }
  
  setTimeout(() => {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
    showNotification('Tabela atualizada!', 'info');
  }, 1000);
}

function resetToDefault() {
  const doReset = async () => {
    const confirmed = window.uiHelpers
      ? await window.uiHelpers.confirmAction({ title: 'Restaurar Configurações', message: 'Deseja restaurar as configurações padrão da tabela?' })
      : confirm('Deseja restaurar as configurações padrão da tabela?');
      
    if (confirmed) {
      saveConfig(DEFAULT_CONFIG);
      loadConfigToModal();
      applyLiveConfig();
      showNotification('Configurações restauradas para o padrão!', 'info');
    }
  };
  doReset();
}

function exportStatusData(exportAll = false) {
  try {
    const sourceTable = exportAll ? modal.querySelector('.config-table-wrapper table') : tableWrapper.querySelector('table');
    if (!sourceTable) {
      showNotification('Nenhuma tabela encontrada para exportar', 'error');
      return;
    }
    
    const headers = Array.from(sourceTable.querySelectorAll('thead th'))
      .filter(th => th.style.display !== 'none')
      .map(th => th.textContent.trim());
    
    const rows = Array.from(sourceTable.querySelectorAll('tbody tr'))
      .filter(row => exportAll || row.style.display !== 'none')
      .map(row => {
        return Array.from(row.querySelectorAll('td'))
          .filter((td, index) => {
            const th = sourceTable.querySelector(`thead th:nth-child(${index + 1})`);
            return th && th.style.display !== 'none';
          })
          .map(td => {
            const text = td.textContent.trim();
            return text.replace(/\s+/g, ' ');
          });
      });
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const filename = `status-tabela-${exportAll ? 'completa' : 'visiveis'}-${new Date().toISOString().slice(0, 10)}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification(`Dados ${exportAll ? 'completos' : 'visíveis'} exportados com sucesso!`, 'success');
    
  } catch (error) {
    console.error(' Erro ao exportar dados:', error);
    showNotification('Erro ao exportar dados da tabela', 'error');
  }
}

function showNotification(message, type = 'info') {
  if (window.notificationSystem && typeof window.notificationSystem.show === 'function') {
    window.notificationSystem.show(message, type);
    return;
  }
  
  const alertClass = type === 'error' ? 'alert-danger' : 
                    type === 'success' ? 'alert-success' : 'alert-info';
  
  const notification = document.createElement('div');
  notification.className = `alert ${alertClass} alert-dismissible fade show position-fixed`;
  notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 300px;';
  notification.innerHTML = `
    ${message}
    <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 3000);
}

// Estilos adicionais já incluídos no CSS principal

// Expor funções globalmente para debug
if (window.__DEBUG__) {
  window.statusTableConfig = {
    init: initStatusTableConfig,
    openModal: openConfigModal,
    applyConfig,
    getStoredConfig,
    resetToDefault,
    exportStatusData
  };
}

// Auto-inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStatusTableConfig);
} else {
  initStatusTableConfig();
}

export { initStatusTableConfig, applyConfig, getStoredConfig };