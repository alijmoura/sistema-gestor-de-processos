// vendorsMigrationUI.js - Interface para migração de vendors
// Adiciona botão e modal para executar pré-cadastro automático

import { runVendorsMigration, previewMigration } from './vendorsMigration.js';
import { showNotification } from './ui.js';

if (window.__DEBUG__) console.log('[vendorsMigrationUI] Módulo carregado.');

const state = {
  preview: null,
  running: false
};

function createMigrationButton() {
  // Buscar o painel específico de Construtoras (não o primeiro card-body)
  const vendorsPanel = document.getElementById('panel-vendors');
  if (!vendorsPanel) {
    if (window.__DEBUG__) console.log('[vendorsMigrationUI] Painel #panel-vendors não encontrado');
    return;
  }
  
  // Verificar se botão já existe
  if (document.getElementById('btn-vendors-migration')) {
    if (window.__DEBUG__) console.log('[vendorsMigrationUI] Botões já existem');
    return;
  }
  
  // Criar botão
  const btnContainer = document.createElement('div');
  btnContainer.className = 'mb-3 d-flex gap-2';
  btnContainer.innerHTML = `
    <button id="btn-vendors-migration" class="btn btn-info btn-sm" title="Criar pré-cadastro a partir de contratos existentes">
      <i class="bi bi-magic"></i> Pré-Cadastro Automático
    </button>
    <button id="btn-vendors-migration-preview" class="btn btn-outline-info btn-sm" title="Ver prévia sem executar">
      <i class="bi bi-eye"></i> Prévia
    </button>
  `;
  
  // Inserir logo após o <h2> e <p> do painel (antes da div.vendors-flex)
  const vendorsFlex = vendorsPanel.querySelector('.vendors-flex');
  if (vendorsFlex) {
    vendorsPanel.insertBefore(btnContainer, vendorsFlex);
  } else {
    // Fallback: inserir no final do painel
    vendorsPanel.appendChild(btnContainer);
  }
  
  if (window.__DEBUG__) console.log('[vendorsMigrationUI] Botões criados no painel de Construtoras');
  
  // Bind eventos
  document.getElementById('btn-vendors-migration').addEventListener('click', openMigrationModal);
  document.getElementById('btn-vendors-migration-preview').addEventListener('click', showPreview);
}

async function showPreview() {
  try {
    showNotification('Analisando contratos...', 'info');
    
    const preview = await previewMigration();
    state.preview = preview;
    
    if (preview.totalOperations === 0) {
      showNotification(' Tudo já está cadastrado! Nada a migrar.', 'success');
      return;
    }
    
    const message = `
 **Prévia de Migração:**

 **Construtoras:**
  • ${preview.novosVendors} novas
  • ${preview.vendorsExistentes} já existentes

 **Empreendimentos:**
  • ${preview.novosEmpreendimentos} novos

 **Blocos:**
  • ${preview.novosBlocos} novos

 **Apartamentos:**
  • ${preview.novosApartamentos} novos

**Total de operações:** ${preview.totalOperations}
    `.trim();
    
    // Mostrar em modal ou alert
    const confirmed = window.uiHelpers
      ? await window.uiHelpers.confirmImportantAction('Executar Migração', message)
      : confirm(message + '\n\nDeseja executar a migração agora?');
    
    if (confirmed) {
      await executeMigration();
    }
    
  } catch (err) {
    console.error('[vendorsMigrationUI] Erro ao gerar prévia:', err);
    showNotification('Erro ao gerar prévia: ' + err.message, 'error');
  }
}

function openMigrationModal() {
  // Criar modal se não existir
  let modal = document.getElementById('migration-modal');
  
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'migration-modal';
    modal.className = 'modal fade';
    modal.innerHTML = `
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-magic me-2"></i>
              Pré-Cadastro Automático de Construtoras
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <i class="bi bi-info-circle me-2"></i>
              Esta ferramenta cria automaticamente o cadastro de <strong>construtoras</strong> e <strong>empreendimentos</strong> 
              com base nos processos já existentes no sistema.
            </div>
            
            <div id="migration-preview" class="mb-3" style="display:none;">
              <h6> Análise dos Dados</h6>
              <div class="card">
                <div class="card-body">
                  <div id="migration-stats"></div>
                </div>
              </div>
            </div>
            
            <div id="migration-progress" style="display:none;">
              <h6> Progresso</h6>
              <div class="progress mb-2">
                <div id="migration-progress-bar" class="progress-bar progress-bar-striped progress-bar-animated" 
                     role="progressbar" style="width: 0%"></div>
              </div>
              <div id="migration-status" class="small text-muted"></div>
            </div>
            
            <div id="migration-result" style="display:none;">
              <h6> Resultado</h6>
              <div id="migration-result-content"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
            <button type="button" id="btn-run-migration" class="btn btn-primary">
              <i class="bi bi-play-fill me-1"></i>
              Executar Migração
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Bind eventos
    document.getElementById('btn-run-migration').addEventListener('click', executeMigration);
  }
  
  // Reset e mostrar preview
  resetModal();
  loadPreviewInModal();
  
  // Abrir modal
  const bsModal = new window.bootstrap.Modal(modal);
  bsModal.show();
}

function resetModal() {
  document.getElementById('migration-preview').style.display = 'none';
  document.getElementById('migration-progress').style.display = 'none';
  document.getElementById('migration-result').style.display = 'none';
  document.getElementById('btn-run-migration').disabled = false;
}

async function loadPreviewInModal() {
  try {
    updateProgress(10, 'Analisando contratos...');
    document.getElementById('migration-progress').style.display = 'block';
    
    const preview = await previewMigration();
    state.preview = preview;
    
    document.getElementById('migration-progress').style.display = 'none';
    
    if (preview.totalOperations === 0) {
      document.getElementById('migration-stats').innerHTML = `
        <div class="alert alert-success mb-0">
          <i class="bi bi-check-circle me-2"></i>
          <strong>Tudo em ordem!</strong> Todos os dados já estão cadastrados.
        </div>
      `;
      document.getElementById('btn-run-migration').disabled = true;
      document.getElementById('btn-run-migration').innerHTML = '<i class="bi bi-check me-1"></i> Nada a Fazer';
    } else {
      document.getElementById('migration-stats').innerHTML = `
        <table class="table table-sm mb-0">
          <tbody>
            <tr>
              <td><i class="bi bi-building text-primary"></i> Construtoras</td>
              <td class="text-end">
                <span class="badge bg-success">${preview.novosVendors} novas</span>
                <span class="badge bg-secondary">${preview.vendorsExistentes} existentes</span>
              </td>
            </tr>
            <tr>
              <td><i class="bi bi-buildings text-info"></i> Empreendimentos</td>
              <td class="text-end"><span class="badge bg-success">${preview.novosEmpreendimentos} novos</span></td>
            </tr>
            <tr>
              <td><i class="bi bi-box text-warning"></i> Blocos</td>
              <td class="text-end"><span class="badge bg-success">${preview.novosBlocos} novos</span></td>
            </tr>
            <tr>
              <td><i class="bi bi-door-open text-danger"></i> Apartamentos</td>
              <td class="text-end"><span class="badge bg-success">${preview.novosApartamentos} novos</span></td>
            </tr>
            <tr class="table-primary fw-bold">
              <td>Total de Operações</td>
              <td class="text-end">${preview.totalOperations}</td>
            </tr>
          </tbody>
        </table>
      `;
    }
    
    document.getElementById('migration-preview').style.display = 'block';
    
  } catch (err) {
    console.error('[vendorsMigrationUI] Erro ao carregar prévia:', err);
    document.getElementById('migration-progress').style.display = 'none';
    document.getElementById('migration-stats').innerHTML = `
      <div class="alert alert-danger mb-0">
        <i class="bi bi-exclamation-triangle me-2"></i>
        Erro ao analisar dados: ${err.message}
      </div>
    `;
    document.getElementById('btn-run-migration').disabled = true;
  }
}

function updateProgress(percent, message) {
  const bar = document.getElementById('migration-progress-bar');
  const status = document.getElementById('migration-status');
  
  if (bar) bar.style.width = percent + '%';
  if (status) status.textContent = message;
}

async function executeMigration() {
  if (state.running) return;
  
  const confirmed = window.uiHelpers
    ? await window.uiHelpers.confirmImportantAction(
        'Confirmar Migração',
        'Esta operação irá criar/atualizar registros no banco de dados.'
      )
    : confirm('Confirma a execução da migração? Esta operação irá criar/atualizar registros no banco de dados.');
  
  if (!confirmed) {
    return;
  }
  
  state.running = true;
  document.getElementById('btn-run-migration').disabled = true;
  document.getElementById('migration-preview').style.display = 'none';
  document.getElementById('migration-progress').style.display = 'block';
  document.getElementById('migration-result').style.display = 'none';
  
  try {
    const report = await runVendorsMigration({
      dryRun: false,
      onProgress: (progress) => {
        const messages = {
          analyzing: 'Analisando contratos existentes...',
          loading: 'Carregando vendors cadastrados...',
          comparing: 'Comparando dados...',
          migrating: 'Executando migração...',
          complete: 'Concluído!'
        };
        
        const percentages = {
          analyzing: 20,
          loading: 40,
          comparing: 60,
          migrating: 80,
          complete: 100
        };
        
        updateProgress(percentages[progress.step] || 50, messages[progress.step] || progress.message);
      }
    });
    
    document.getElementById('migration-progress').style.display = 'none';
    
    // Mostrar resultado
    const resultContent = document.getElementById('migration-result-content');
    
    if (report.success) {
      const errors = report.result?.errors || [];
      const hasErrors = errors.length > 0;
      
      resultContent.innerHTML = `
        <div class="alert alert-${hasErrors ? 'warning' : 'success'}">
          <h6 class="alert-heading">
            <i class="bi bi-${hasErrors ? 'exclamation-triangle' : 'check-circle'} me-2"></i>
            Migração ${hasErrors ? 'Concluída com Avisos' : 'Concluída com Sucesso'}
          </h6>
          <hr>
          <div class="mb-2">
            <strong>Criados:</strong> ${report.result.created} vendors<br>
            <strong>Atualizados:</strong> ${report.result.updated} vendors
          </div>
          ${hasErrors ? `
            <hr>
            <div class="text-danger">
              <strong>Erros (${errors.length}):</strong>
              <ul class="small mb-0 mt-2">
                ${errors.slice(0, 5).map(e => `<li>${e.vendor || 'N/A'}: ${e.error}</li>`).join('')}
                ${errors.length > 5 ? `<li><em>... e mais ${errors.length - 5} erros</em></li>` : ''}
              </ul>
            </div>
          ` : ''}
        </div>
      `;
      
      showNotification(`Migração concluída: ${report.result.created} criados, ${report.result.updated} atualizados`, 'success');
      
      // Recarregar lista de vendors
      if (window.__VENDORS_UI__) {
        setTimeout(() => window.__VENDORS_UI__.reload(), 1000);
      }
      
    } else {
      resultContent.innerHTML = `
        <div class="alert alert-danger">
          <h6 class="alert-heading">
            <i class="bi bi-x-circle me-2"></i>
            Erro na Migração
          </h6>
          <hr>
          <p class="mb-0">${report.error || 'Erro desconhecido'}</p>
        </div>
      `;
      showNotification('Erro na migração: ' + (report.error || 'desconhecido'), 'error');
    }
    
    document.getElementById('migration-result').style.display = 'block';
    document.getElementById('btn-run-migration').innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i> Executar Novamente';
    
  } catch (err) {
    console.error('[vendorsMigrationUI] Erro ao executar migração:', err);
    
    document.getElementById('migration-progress').style.display = 'none';
    document.getElementById('migration-result-content').innerHTML = `
      <div class="alert alert-danger">
        <i class="bi bi-exclamation-triangle me-2"></i>
        Erro fatal: ${err.message}
      </div>
    `;
    document.getElementById('migration-result').style.display = 'block';
    
    showNotification('Erro ao executar migração', 'error');
  } finally {
    state.running = false;
    document.getElementById('btn-run-migration').disabled = false;
  }
}

// Inicialização
function init() {
  // Aguardar página de configurações estar pronta
  const observer = new MutationObserver(() => {
    const page = document.getElementById('page-configuracoes');
    if (page && page.classList.contains('active')) {
      createMigrationButton();
    }
  });
  
  const page = document.getElementById('page-configuracoes');
  if (page) {
    observer.observe(page, { attributes: true, attributeFilter: ['class'] });
    
    // Se já estiver ativa, criar imediatamente
    if (page.classList.contains('active')) {
      createMigrationButton();
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export para debug
window.__VENDORS_MIGRATION_UI__ = { state, openModal: openMigrationModal };
