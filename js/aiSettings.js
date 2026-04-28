// Importa serviços de IA
import aiService from './aiService.js';
import aiContractAssistant from './aiContractAssistant.js';

function el(id) { return document.getElementById(id); }

function loadSettings() {
  //  SEGURANÇA: Sempre usa backend, nunca armazena chaves no cliente
  const status = el('ai-settings-status');
  
  if (!status) {
    // Elementos de configuração IA não encontrados - normal se não estiver na página de configurações
    return;
  }
  
  // Esconde campos de configuração (não são mais necessários)
  const providerSelect = el('ai-provider-select');
  const apiKeyField = el('ai-api-key');
  const saveBtn = el('ai-save-settings');
  const clearBtn = el('ai-clear-settings');
  
  if (providerSelect) providerSelect.closest('.mb-3')?.classList.add('d-none');
  if (apiKeyField) apiKeyField.closest('.mb-3')?.classList.add('d-none');
  if (saveBtn) saveBtn.classList.add('d-none');
  if (clearBtn) clearBtn.classList.add('d-none');

  status.innerHTML = `
    <div class="alert alert-success mb-0">
      <div class="d-flex align-items-start gap-3">
        <i class="bi bi-shield-check fs-2 text-success"></i>
        <div>
          <h6 class="mb-1"><strong> IA Configurada no Backend</strong></h6>
          <p class="mb-2 text-muted">Todas as requisições são processadas de forma segura via Cloud Functions com Vertex AI.</p>
          <ul class="small mb-0">
            <li><strong>Provedor:</strong> Google Vertex AI (Gemini 1.5 Pro)</li>
            <li><strong>Segurança:</strong> Chaves protegidas no servidor</li>
            <li><strong>Região:</strong> southamerica-east1</li>
            <li><strong>Status:</strong> <span class="badge bg-success">Ativo</span></li>
          </ul>
        </div>
      </div>
    </div>
  `;
  
  // Remove chaves antigas do localStorage se existirem
  localStorage.removeItem('AI_API_KEY');
  localStorage.removeItem('AI_GOOGLE_KEY');
  localStorage.removeItem('AI_OPENAI_KEY');
  localStorage.setItem('AI_PROVIDER', 'backend');
  
  // Atualiza estatísticas de IA se disponíveis
  updateAIStats();
}

function saveSettings() {
  //  SEGURANÇA: Função mantida apenas para compatibilidade, mas não faz nada
  // Backend é forçado e não pode ser alterado
  loadSettings();
}

function clearSettings() {
  //  SEGURANÇA: Função mantida apenas para compatibilidade
  // Remove todas as chaves antigas e recarrega
  localStorage.removeItem('AI_API_KEY');
  localStorage.removeItem('AI_GOOGLE_KEY');
  localStorage.removeItem('AI_OPENAI_KEY');
  localStorage.setItem('AI_PROVIDER', 'backend');
  loadSettings();
}

/**
 * Atualiza estatísticas de uso de IA na interface
 */
function updateAIStats() {
  try {
    const statsContainer = el('ai-stats-container');
    if (!statsContainer) return;
    
    const aiStats = aiService.getStats();
    const assistantStats = aiContractAssistant.getStats();
    
    statsContainer.innerHTML = `
      <div class="mt-3 p-3 bg-light rounded">
        <h6>Estatísticas de IA</h6>
        <small class="text-muted">
          <div>Provider atual: <strong>${aiStats.provider}</strong></div>
          <div>Requisições realizadas: <strong>${aiStats.requestCount}</strong></div>
          <div>Assistente: <strong>${assistantStats.enabled ? 'Ativo' : 'Desativado'}</strong></div>
          <div>Contratos históricos: <strong>${assistantStats.historicalContracts}</strong></div>
          <div>Sugestões em cache: <strong>${assistantStats.cachedSuggestions}</strong></div>
        </small>
      </div>
    `;
  } catch (error) {
    console.warn(' Erro ao atualizar estatísticas IA:', error);
  }
}

// Variável para armazenar o intervalo
let statsUpdateInterval = null;

/**
 * Inicia atualização periódica de stats
 */
function startStatsUpdates() {
  // Limpa intervalo anterior se existir
  if (statsUpdateInterval) {
    clearInterval(statsUpdateInterval);
  }
  
  // Atualiza a cada 30 segundos
  statsUpdateInterval = setInterval(updateAIStats, 30000);
}

/**
 * Para atualização periódica de stats
 */
function stopStatsUpdates() {
  if (statsUpdateInterval) {
    clearInterval(statsUpdateInterval);
    statsUpdateInterval = null;
  }
}

/**
 * Testa a conexão com o provedor de IA
 */
async function testAIConnection() {
  const status = el('ai-settings-status');
  status.textContent = 'Testando conexão com IA...';
  status.className = 'text-info';
  
  try {
    const testPrompt = 'Responda apenas "OK" se você está funcionando corretamente.';
    const result = await aiService.processText(testPrompt, { skipCache: true });
    
    status.textContent = ' Conexão com IA funcionando perfeitamente!';
    status.className = 'text-success';
    
    window.debug && window.debug(' Teste de IA bem-sucedido:', result);
  } catch (error) {
    status.textContent = ` Erro ao conectar com IA: ${error.message}`;
    status.className = 'text-danger';
    console.error(' Teste de IA falhou:', error);
  }
}

function bindEvents() {
  const saveBtn = el('ai-settings-save');
  const clearBtn = el('ai-settings-clear');
  const testBtn = el('ai-test-connection');
  
  if (saveBtn) saveBtn.addEventListener('click', saveSettings);
  if (clearBtn) clearBtn.addEventListener('click', clearSettings);
  if (testBtn) testBtn.addEventListener('click', testAIConnection);
}

(function initAISettings() {
  const init = () => {
    loadSettings();
    bindEvents();
    
    // Inicia atualização periódica de estatísticas
    startStatsUpdates();
    
    // Limpa intervalo ao sair da página
    window.addEventListener('beforeunload', stopStatsUpdates);
  };

  if (window.__UI_COMPONENTS_RENDERED__) {
    init();
  } else {
    window.addEventListener('ui:components:rendered', init);
    // Fallback para garantir inicialização
    document.addEventListener('DOMContentLoaded', () => {
      if (window.__UI_COMPONENTS_RENDERED__) init();
    });
  }
})();
