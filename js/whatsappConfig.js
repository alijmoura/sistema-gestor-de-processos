/**
 * @file whatsappConfig.js
 * @description Configuração e integração do WhatsApp com o sistema
 * Data: 2025-10-21
 */

import whatsappService from './whatsappService.js';
import googleContactsService from './googleContactsService.js';
import { showNotification } from './ui.js';

const WHATSAPP_WEBHOOK_REGION = 'southamerica-east1';
let isPersistingIntegrationToggle = false;

function getExpectedWebhookUrl() {
  const projectId = firebase.app().options.projectId;
  return `https://${WHATSAPP_WEBHOOK_REGION}-${projectId}.cloudfunctions.net/whatsappWebhook`;
}

function applyWhatsAppEnabledState(enabled) {
  const isEnabled = Boolean(enabled);
  const toggle = document.getElementById('whatsapp-enabled');
  const statusText = document.getElementById('whatsapp-status-text');

  if (toggle) {
    toggle.checked = isEnabled;
  }

  if (statusText) {
    statusText.textContent = isEnabled ? 'Habilitado' : 'Desabilitado';
    statusText.classList.toggle('text-success', isEnabled);
    statusText.classList.toggle('text-danger', !isEnabled);
  }
}

async function persistWhatsAppEnabledState(enabled) {
  if (isPersistingIntegrationToggle) return;

  isPersistingIntegrationToggle = true;
  const previousState = !enabled;

  try {
    await whatsappService.saveWhatsAppConfig({
      enabled: Boolean(enabled),
      webhookUrl: getExpectedWebhookUrl()
    });
    showNotification(
      enabled ? 'WhatsApp habilitado com sucesso.' : 'WhatsApp desabilitado com sucesso.',
      'success'
    );
  } catch (err) {
    console.error('[whatsappConfig] Erro ao atualizar status da integração:', err);
    applyWhatsAppEnabledState(previousState);
    showNotification('Erro ao atualizar status da integração do WhatsApp.', 'error');
  } finally {
    isPersistingIntegrationToggle = false;
  }
}

if (window.__DEBUG__) console.log('[whatsappConfig] Módulo carregado.');

/**
 * Carrega configuração atual do WhatsApp
 */
async function loadCurrentWhatsAppConfig() {
  try {
    const config = await whatsappService.loadWhatsAppConfig({ forceRefresh: true });
    
    // Preencher formulário (apenas configurações globais)
    document.getElementById('whatsapp-verify-token').value = config.webhookVerifyToken || '';
    document.getElementById('whatsapp-max-chats').value = config.maxChatsPerAgent || 5;
    document.getElementById('whatsapp-auto-assignment').checked = config.autoAssignment !== false;
    applyWhatsAppEnabledState(config.enabled === true);
    const includeAgentCheckbox = document.getElementById('whatsapp-include-agent-name');
    if (includeAgentCheckbox) {
      includeAgentCheckbox.checked = config.includeAgentNameInOutgoingMessages === true;
    }
    document.getElementById('whatsapp-fcm-vapid').value = config.fcmPublicVapidKey || '';

    const googleClientIdInput = document.getElementById('google-contacts-client-id');
    const googleApiKeyInput = document.getElementById('google-contacts-api-key');
    if (googleClientIdInput) {
      googleClientIdInput.value = config.googleContactsClientId || '';
    }
    if (googleApiKeyInput) {
      googleApiKeyInput.value = config.googleContactsApiKey || '';
    }

    googleContactsService.applyConfig(config);
    updateGoogleContactsStatus(config);

    // Atualizar webhook URL
    const webhookUrl = getExpectedWebhookUrl();
    document.getElementById('webhook-url').textContent = webhookUrl;

    // Verificar validade do token (se houver data de expiração salva)
    checkTokenValidity(config);
    checkWebhookConfigStatus(config, webhookUrl);

    return config;
  } catch (err) {
    console.error('[whatsappConfig] Erro ao carregar configuração:', err);
  }
}

function formatGoogleSyncDate(timestamp) {
  if (!timestamp) return null;
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function updateGoogleContactsStatus(config = {}) {
  const statusEl = document.getElementById('google-contacts-status');
  if (!statusEl) return;

  const hasCredentials = Boolean(config.googleContactsClientId && config.googleContactsApiKey);
  const lastSyncDate = formatGoogleSyncDate(config.googleContactsLastSync);
  const lastSyncCount = config.googleContactsLastSyncCount || 0;
  const lastSyncBy = config.googleContactsLastSyncBy || null;
  const lastSyncSource = config.googleContactsLastSyncSource || 'googleApi';
  const lastSyncFile = config.googleContactsLastSyncFile || null;
  const sourceLabel = lastSyncSource === 'manualCsv' ? 'Importação manual (CSV)' : 'Sincronização Google API';
  const allowWithoutCredentials = lastSyncSource === 'manualCsv' && lastSyncDate;

  statusEl.classList.remove('text-muted', 'text-success', 'text-warning', 'text-danger');

  if (!hasCredentials && !allowWithoutCredentials) {
    statusEl.classList.add('text-warning');
    statusEl.innerHTML = '<i class="bi bi-exclamation-circle me-1"></i>Informe o Client ID e a API Key para sincronizar automaticamente ou utilize a importação manual via CSV abaixo.';
    return;
  }

  if (!lastSyncDate) {
    statusEl.classList.add('text-muted');
    statusEl.innerHTML = '<i class="bi bi-info-circle me-1"></i>Nenhuma sincronização realizada ainda.';
    return;
  }

  const formattedDate = lastSyncDate.toLocaleString('pt-BR');
  const syncInfo = [`Última sincronização em ${formattedDate}`];
  if (lastSyncCount) {
    syncInfo.push(`${lastSyncCount} contato(s) atualizados`);
  }
  if (lastSyncBy) {
    syncInfo.push(`por ${lastSyncBy}`);
  }
  syncInfo.push(`Fonte: ${sourceLabel}`);
  if (lastSyncSource === 'manualCsv' && lastSyncFile) {
    syncInfo.push(`Arquivo: ${lastSyncFile}`);
  }
  if (!hasCredentials && allowWithoutCredentials) {
    syncInfo.push('API Google não configurada');
  }

  statusEl.classList.add('text-success');
  statusEl.innerHTML = `<i class="bi bi-check-circle me-1"></i>${syncInfo.join(' • ')}`;
}

/**
 * Verifica validade do token e exibe alerta se necessário
 */
function checkWebhookConfigStatus(config = {}, expectedWebhookUrl = getExpectedWebhookUrl()) {
  const alertDiv = document.getElementById('whatsapp-webhook-alert');
  if (!alertDiv) return;

  const savedWebhookUrl = typeof config.webhookUrl === 'string' ? config.webhookUrl.trim() : '';
  const hasLegacyRegion = savedWebhookUrl.includes('us-central1');
  const isMismatch = savedWebhookUrl && savedWebhookUrl !== expectedWebhookUrl;

  alertDiv.classList.remove('d-none');

  if (!savedWebhookUrl) {
    alertDiv.className = 'alert alert-secondary mt-2 mb-0';
    alertDiv.innerHTML = `
      <i class="bi bi-info-circle me-2"></i>
      URL do webhook ainda nao registrada. Salve esta aba para sincronizar a URL atual.
    `;
    return;
  }

  if (hasLegacyRegion || isMismatch) {
    alertDiv.className = 'alert alert-warning mt-2 mb-0';
    alertDiv.innerHTML = `
      <div class="small">
        <div class="fw-semibold mb-1">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>Webhook com URL divergente
        </div>
        <div><strong>Salva:</strong> <code>${savedWebhookUrl}</code></div>
        <div><strong>Esperada:</strong> <code>${expectedWebhookUrl}</code></div>
        <div class="mt-1">Atualize esta URL no Meta Business para voltar a receber mensagens.</div>
      </div>
    `;
    return;
  }

  alertDiv.className = 'alert alert-success mt-2 mb-0';
  alertDiv.innerHTML = `
    <i class="bi bi-check-circle-fill me-2"></i>
    URL do webhook alinhada com a regiao ativa (${WHATSAPP_WEBHOOK_REGION}).
  `;
}

async function testWhatsAppWebhook() {
  const verifyToken = document.getElementById('whatsapp-verify-token')?.value.trim();
  if (!verifyToken) {
    showNotification('Informe o Webhook Verify Token antes de testar.', 'warning');
    return;
  }

  const webhookUrl = getExpectedWebhookUrl();
  const challenge = `healthcheck_${Date.now()}`;
  const testUrl = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${encodeURIComponent(challenge)}`;
  const testBtn = document.getElementById('test-whatsapp-webhook-btn');

  if (testBtn) {
    testBtn.disabled = true;
    testBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Testando...';
  }

  try {
    const response = await fetch(testUrl, { method: 'GET' });
    const body = (await response.text()).trim();

    if (!response.ok || body !== challenge) {
      throw new Error(`Webhook respondeu com status ${response.status}.`);
    }

    showNotification('Webhook validado com sucesso. A URL esta acessivel.', 'success');
  } catch (err) {
    console.error('[whatsappConfig] Erro ao testar webhook:', err);
    showNotification(`Falha no teste do webhook: ${err.message}`, 'error');
  } finally {
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.innerHTML = '<i class="bi bi-patch-check me-2"></i>Testar webhook';
    }
  }
}

function renderWhatsAppIntegrationHealth(payload = null) {
  const container = document.getElementById('whatsapp-integration-health');
  if (!container) return;

  if (!payload) {
    container.classList.add('d-none');
    container.innerHTML = '';
    return;
  }

  const checks = Array.isArray(payload.checks) ? payload.checks : [];
  const criticalIssues = checks.filter(check => check.status !== 'ok');
  const alertClass = payload.healthy ? 'alert-success' : 'alert-warning';
  const summary = payload.summary || {};
  const updatedAt = payload.checkedAt ? new Date(payload.checkedAt).toLocaleString('pt-BR') : 'agora';

  container.className = `alert ${alertClass} mt-2 mb-3`;
  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-start gap-2">
      <div>
        <div class="fw-semibold">
          <i class="bi ${payload.healthy ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} me-1"></i>
          Diagnóstico da integração WhatsApp
        </div>
        <div class="small mt-1">
          Números ativos com credenciais: <strong>${summary.activePhoneNumbersWithCredentials || 0}</strong> |
          Agentes online: <strong>${summary.onlineAgents || 0}</strong> |
          Atualizado em: <strong>${updatedAt}</strong>
        </div>
        ${criticalIssues.length > 0 ? `
          <div class="small mt-2">
            ${criticalIssues.map(issue => `• ${issue.message}`).join('<br>')}
          </div>
        ` : '<div class="small mt-2">Todos os checks principais estão saudáveis.</div>'}
      </div>
    </div>
  `;
}

async function loadWhatsAppIntegrationHealth() {
  const container = document.getElementById('whatsapp-integration-health');
  if (!container) return;
  if (!canInvokeWhatsAppCallables()) {
    renderWhatsAppIntegrationHealth(null);
    return;
  }

  try {
    const callable = firebase.app().functions('southamerica-east1').httpsCallable('checkWhatsAppIntegrationHealth');
    const response = await callable({});
    renderWhatsAppIntegrationHealth(response?.data || null);
  } catch (err) {
    const code = normalizeFunctionsErrorCode(err);
    if (['permission-denied', 'not-found', 'unimplemented'].includes(code)) {
      renderWhatsAppIntegrationHealth(null);
      return;
    }
    if (temporarilyDisableWhatsAppCallablesIfUnavailable(err)) {
      renderWhatsAppIntegrationHealth(null);
      return;
    }

    console.error('[whatsappConfig] Erro ao carregar diagnóstico da integração:', err);
    container.className = 'alert alert-warning mt-2 mb-3';
    container.innerHTML = `
      <i class="bi bi-exclamation-triangle me-1"></i>
      Não foi possível carregar o diagnóstico da integração no momento.
    `;
  }
}

function checkTokenValidity(config) {
  if (!config.tokenExpiresAt && !config.tokenLastUpdated) {
    // Se não temos data de expiração, mostrar aviso genérico
    if (config.enabled && config.accessToken) {
      const alertDiv = document.getElementById('whatsapp-token-alert');
      if (alertDiv) {
        alertDiv.innerHTML = `
          <div class="alert alert-warning d-flex align-items-center" role="alert">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>
            <div>
              <strong>Atenção:</strong> Tokens do WhatsApp Business API expiram periodicamente.
              Se você não conseguir enviar mensagens, atualize o Access Token nas configurações do Meta Business.
            </div>
          </div>
        `;
        alertDiv.style.display = 'block';
      }
    }
    return;
  }

  const expiresAt = config.tokenExpiresAt ? new Date(config.tokenExpiresAt) : null;
  const now = new Date();
  const alertDiv = document.getElementById('whatsapp-token-alert');
  
  if (!alertDiv) return;

  if (expiresAt && expiresAt < now) {
    // Token expirado
    alertDiv.innerHTML = `
      <div class="alert alert-danger d-flex align-items-center" role="alert">
        <i class="bi bi-x-circle-fill me-2"></i>
        <div>
          <strong>Token Expirado!</strong> O Access Token expirou em ${expiresAt.toLocaleString('pt-BR')}.
          Atualize imediatamente para continuar enviando mensagens.
        </div>
      </div>
    `;
    alertDiv.style.display = 'block';
  } else if (expiresAt) {
    const daysUntilExpiry = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry <= 7) {
      // Token expira em menos de 7 dias
      alertDiv.innerHTML = `
        <div class="alert alert-warning d-flex align-items-center" role="alert">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>
          <div>
            <strong>Atenção:</strong> O Access Token expira em ${daysUntilExpiry} dia(s) (${expiresAt.toLocaleString('pt-BR')}).
            Atualize-o antes do vencimento.
          </div>
        </div>
      `;
      alertDiv.style.display = 'block';
    } else {
      alertDiv.style.display = 'none';
    }
  }
}

/**
 * Salva configuração do WhatsApp
 */
async function saveWhatsAppConfig(e) {
  e?.preventDefault();

  const webhookVerifyToken = document.getElementById('whatsapp-verify-token').value.trim();
  const maxChatsPerAgent = parseInt(document.getElementById('whatsapp-max-chats').value) || 5;
  const autoAssignment = document.getElementById('whatsapp-auto-assignment').checked;
  const integrationToggle = document.getElementById('whatsapp-enabled');
  const enabled = integrationToggle ? integrationToggle.checked : false;
  const includeAgentCheckbox = document.getElementById('whatsapp-include-agent-name');
  const includeAgentSignature = includeAgentCheckbox ? includeAgentCheckbox.checked : false;
  const fcmPublicVapidKey = document.getElementById('whatsapp-fcm-vapid').value.trim();
  const googleContactsClientId = document.getElementById('google-contacts-client-id')?.value.trim() || '';
  const googleContactsApiKey = document.getElementById('google-contacts-api-key')?.value.trim() || '';

  if (!webhookVerifyToken) {
    showNotification('Webhook Verify Token é obrigatório', 'warning');
    return;
  }

  try {
    await whatsappService.saveWhatsAppConfig({
      webhookVerifyToken,
      verifyToken: webhookVerifyToken,
      webhookUrl: getExpectedWebhookUrl(),
      enabled,
      maxChatsPerAgent,
      autoAssignment,
      fcmPublicVapidKey: fcmPublicVapidKey || null,
      includeAgentNameInOutgoingMessages: includeAgentSignature,
      googleContactsClientId: googleContactsClientId || null,
      googleContactsApiKey: googleContactsApiKey || null
    });

    googleContactsService.updateCredentials({
      clientId: googleContactsClientId || null,
      apiKey: googleContactsApiKey || null
    });

    applyWhatsAppEnabledState(enabled);

    showNotification('Configuração WhatsApp salva com sucesso', 'success');

    // Recarregar estatísticas
    loadWhatsAppStats();
    await loadCurrentWhatsAppConfig();
    await loadWhatsAppIntegrationHealth();
  } catch (err) {
    console.error('[whatsappConfig] Erro ao salvar:', err);
    showNotification('Erro ao salvar configuração', 'error');
  }
}

async function handleGoogleContactsSync() {
  const syncBtn = document.getElementById('google-contacts-sync-btn');
  const statusEl = document.getElementById('google-contacts-status');
  const defaultLabel = '<i class="bi bi-arrow-repeat me-1"></i>Sincronizar contatos agora';

  if (!syncBtn || !statusEl) return;

  const clientId = document.getElementById('google-contacts-client-id')?.value.trim();
  const apiKey = document.getElementById('google-contacts-api-key')?.value.trim();

  if (!clientId || !apiKey) {
    statusEl.classList.remove('text-muted', 'text-success', 'text-warning', 'text-danger');
    statusEl.classList.add('text-warning');
    statusEl.innerHTML = '<i class="bi bi-exclamation-circle me-1"></i>Informe o Client ID e a API Key antes de sincronizar.';
    showNotification('Informe o Client ID e a API Key do Google Contacts para sincronizar.', 'warning');
    return;
  }

  googleContactsService.updateCredentials({ clientId: clientId || null, apiKey: apiKey || null });

  try {
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Sincronizando...';
  statusEl.classList.remove('text-muted', 'text-success', 'text-warning', 'text-danger');
    statusEl.classList.add('text-muted');
    statusEl.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Iniciando sincronização com Google Contacts...';

    const result = await googleContactsService.syncContacts({ interactiveAuth: true, forceConfigReload: false });

    showNotification(`Sincronização concluída: ${result.totalSaved} contato(s) atualizados.`, 'success');

    // Recarregar configuração para refletir metadados atualizados
    const updatedConfig = await whatsappService.loadWhatsAppConfig({ forceRefresh: true });
    googleContactsService.applyConfig(updatedConfig);
    updateGoogleContactsStatus(updatedConfig);
  } catch (err) {
    console.error('[whatsappConfig] Erro ao sincronizar Google Contacts:', err);
    statusEl.classList.remove('text-muted', 'text-success', 'text-warning', 'text-danger');
    statusEl.classList.add('text-danger');
    statusEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Falha na sincronização: ${err.message}`;
    showNotification(`Erro ao sincronizar contatos: ${err.message}`, 'error');
  } finally {
    syncBtn.disabled = false;
    syncBtn.innerHTML = defaultLabel;
  }
}

/**
 * Testa envio de mensagem
 * ATUALIZADO: Não precisa mais dos campos phoneId e accessToken (backend busca automaticamente)
 */
async function testWhatsAppMessage() {
  try {
    // Verificar se há números WhatsApp cadastrados
    const db = firebase.firestore();
    const phonesSnapshot = await db.collection('whatsappPhoneNumbers')
      .where('isActive', '==', true)
      .limit(1)
      .get();
    
    if (phonesSnapshot.empty) {
      showNotification(' Nenhum número WhatsApp ativo configurado. Configure um número primeiro em "Números WhatsApp".', 'warning');
      return;
    }

    const testNumber = prompt('Digite um número de telefone para teste (com código do país, ex: 5541999999999):');
    if (!testNumber) return;

    showNotification('Enviando mensagem de teste...', 'info');

    await whatsappService.sendMessage(
      testNumber,
      ' Teste de integração WhatsApp Business API funcionando! Sistema Sistema Gestor de Processos.'
    );

    showNotification('Mensagem de teste enviada com sucesso!', 'success');
  } catch (err) {
    console.error('[whatsappConfig] Erro no teste:', err);
    showNotification(`Erro: ${err.message}`, 'error');
  }
}

/**
 * Carrega lista de agentes registrados
 */
async function loadAgentsList() {
  try {
    const db = firebase.firestore();
    //  NOVO: Buscar em users.whatsapp
    const snapshot = await db.collection('users')
      .where('whatsapp.isAgent', '==', true)
      .get();

    const container = document.getElementById('whatsapp-agents-list');
    if (!container) return;

    if (snapshot.empty) {
      container.innerHTML = '<p class="text-muted">Nenhum agente registrado</p>';
      return;
    }

    const agentsHtml = snapshot.docs.map(doc => {
      const data = doc.data() || {};
      const agent = data.whatsapp || {};
      const statusColor = {
        'online': 'success',
        'away': 'warning',
        'busy': 'danger',
        'offline': 'secondary'
      }[agent.status] || 'secondary';

      const lastActive = agent.lastActive?.toDate?.();
      const lastActiveStr = lastActive 
        ? new Date(lastActive).toLocaleString('pt-BR')
        : 'Nunca';

      return `
        <div class="card mb-2">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <h6 class="mb-1">${data.shortName || data.fullName || 'Sem nome'}</h6>
                <small class="text-muted">${data.email}</small>
              </div>
              <div class="text-end">
                <span class="badge bg-${statusColor}">${agent.status}</span>
                <br>
                <small class="text-muted">${agent.department}</small>
              </div>
            </div>
            <div class="mt-2 small text-muted">
              <div>Conversas ativas: ${agent.activeChats || 0}</div>
              <div>Total atribuídas: ${agent.totalAssigned || 0}</div>
              <div>Total finalizadas: ${agent.totalResolved || 0}</div>
              <div>Última atividade: ${lastActiveStr}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = agentsHtml;
  } catch (err) {
    console.error('[whatsappConfig] Erro ao carregar agentes:', err);
  }
}

/**
 * Carrega estatísticas do WhatsApp - OTIMIZADO com cache
 *  OTIMIZAÇÃO 24/11/2025: Adicionado cache para reduzir leituras
 */
let whatsappStatsCache = null;
let whatsappStatsCacheTime = 0;
const WHATSAPP_STATS_CACHE_TTL = 5 * 60 * 1000; // 5 minutos
let whatsappStatsRefreshInFlight = null;
let whatsappStatsRefreshLastAttempt = 0;
const WHATSAPP_STATS_REFRESH_TTL = 2 * 60 * 1000; // 2 minutos
const WHATSAPP_CALLABLE_RETRY_TTL = 10 * 60 * 1000; // 10 minutos
let whatsappCallablesUnavailableUntil = 0;

function normalizeFunctionsErrorCode(err) {
  const code = String(err?.code || '').toLowerCase();
  return code.startsWith('functions/') ? code.replace('functions/', '') : code;
}

function canInvokeWhatsAppCallables() {
  return Date.now() >= whatsappCallablesUnavailableUntil;
}

function isNetworkOrCorsCallableError(err) {
  const code = normalizeFunctionsErrorCode(err);
  const message = String(err?.message || '').toLowerCase();

  if (['unavailable', 'deadline-exceeded', 'cancelled'].includes(code)) {
    return true;
  }

  if (code === 'internal') {
    const host = String(window?.location?.hostname || '').toLowerCase();
    if (host === '127.0.0.1' || host === 'localhost') {
      return true;
    }

    return (
      message.includes('cors') ||
      message.includes('preflight') ||
      message.includes('err_failed') ||
      message.includes('failed to fetch') ||
      message.includes('network')
    );
  }

  return (
    message.includes('cors') ||
    message.includes('preflight') ||
    message.includes('err_failed')
  );
}

function temporarilyDisableWhatsAppCallablesIfUnavailable(err) {
  if (!isNetworkOrCorsCallableError(err)) {
    return false;
  }

  whatsappCallablesUnavailableUntil = Date.now() + WHATSAPP_CALLABLE_RETRY_TTL;
  console.warn('[whatsappConfig] Callables WhatsApp indisponiveis temporariamente; usando fallback local.');
  return true;
}

async function refreshMaterializedWhatsAppStatsIfNeeded() {
  const now = Date.now();
  if (!canInvokeWhatsAppCallables()) {
    return null;
  }
  if ((now - whatsappStatsRefreshLastAttempt) < WHATSAPP_STATS_REFRESH_TTL) {
    return null;
  }

  if (whatsappStatsRefreshInFlight) {
    return whatsappStatsRefreshInFlight;
  }

  whatsappStatsRefreshLastAttempt = now;
  const callable = firebase.app().functions('southamerica-east1').httpsCallable('refreshWhatsAppMetrics');

  whatsappStatsRefreshInFlight = callable({})
    .then((res) => {
      const payload = res?.data || {};
      const snapshot = payload.snapshot || payload;
      return {
        activeChats: Number(snapshot.activeChats || 0),
        agentsOnline: Number(snapshot.agentsOnline || 0),
        queueCount: Number(snapshot.queueCount || 0),
        resolvedToday: Number(snapshot.resolvedToday || 0)
      };
    })
    .catch((err) => {
      const code = normalizeFunctionsErrorCode(err);
      if (['permission-denied', 'not-found', 'unimplemented'].includes(code)) {
        return null;
      }
      if (temporarilyDisableWhatsAppCallablesIfUnavailable(err)) {
        return null;
      }
      console.warn('[whatsappConfig] Falha ao atualizar métricas materializadas:', err);
      return null;
    })
    .finally(() => {
      whatsappStatsRefreshInFlight = null;
    });

  return whatsappStatsRefreshInFlight;
}

async function loadWhatsAppStats() {
  try {
    const now = Date.now();
    
    // Verifica cache
    if (whatsappStatsCache && (now - whatsappStatsCacheTime) < WHATSAPP_STATS_CACHE_TTL) {
      console.log('[whatsappConfig]  Usando cache de stats');
      applyWhatsAppStats(whatsappStatsCache);
      return;
    }
    
    const db = firebase.firestore();

    let materializedStats = null;
    try {
      const metricsDoc = await db.collection('whatsappMetrics').doc('current').get();
      if (metricsDoc.exists) {
        const metrics = metricsDoc.data() || {};
        const updatedAt = metrics.updatedAt?.toDate?.() || null;
        const ageMs = updatedAt ? (Date.now() - updatedAt.getTime()) : Number.POSITIVE_INFINITY;
        if (ageMs <= 15 * 60 * 1000) {
          materializedStats = {
            activeChats: Number(metrics.activeChats || 0),
            agentsOnline: Number(metrics.agentsOnline || 0),
            queueCount: Number(metrics.queueCount || 0),
            resolvedToday: Number(metrics.resolvedToday || 0)
          };
        }
      }
    } catch (metricsErr) {
      console.warn('[whatsappConfig] Falha ao carregar whatsappMetrics/current:', metricsErr);
    }

    if (materializedStats) {
      whatsappStatsCache = materializedStats;
      whatsappStatsCacheTime = now;
      applyWhatsAppStats(whatsappStatsCache);
      return;
    }

    const refreshedStats = await refreshMaterializedWhatsAppStatsIfNeeded();
    if (refreshedStats) {
      whatsappStatsCache = refreshedStats;
      whatsappStatsCacheTime = now;
      applyWhatsAppStats(whatsappStatsCache);
      return;
    }

    // Fallback sem métricas materializadas
    const [activeChatsSnap, agentsOnlineSnap, queueSnap, resolvedTodaySnap] = await Promise.all([
      db.collection('chats')
        .where('status', 'in', ['atribuido', 'ativo', 'aguardando'])
        .get(),
      db.collection('users')
        .where('whatsapp.isAgent', '==', true)
        .where('whatsapp.status', '==', 'online')
        .get(),
      db.collection('chats')
        .where('status', '==', 'novo')
        .get(),
      (() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return db.collection('chats')
          .where('status', '==', 'resolvido')
          .where('resolvedAt', '>=', today)
          .get();
      })()
    ]);

    whatsappStatsCache = {
      activeChats: activeChatsSnap.size,
      agentsOnline: agentsOnlineSnap.size,
      queueCount: queueSnap.size,
      resolvedToday: resolvedTodaySnap.size
    };
    whatsappStatsCacheTime = now;
    
    applyWhatsAppStats(whatsappStatsCache);

  } catch (err) {
    console.error('[whatsappConfig] Erro ao carregar estatísticas:', err);
  }
}

function applyWhatsAppStats(stats) {
  const el1 = document.getElementById('stat-active-chats');
  const el2 = document.getElementById('stat-agents-online');
  const el3 = document.getElementById('stat-queue-count');
  const el4 = document.getElementById('stat-resolved-today');
  
  if (el1) el1.textContent = stats.activeChats;
  if (el2) el2.textContent = stats.agentsOnline;
  if (el3) el3.textContent = stats.queueCount;
  if (el4) el4.textContent = stats.resolvedToday;
}

/**
 * Carrega e exibe a lista de templates disponíveis no modal
 */
function loadTemplatesList() {
  const container = document.getElementById('whatsapp-templates-list');
  if (!container) return;

  const templateService = window.__WHATSAPP_TEMPLATE_SERVICE__;
  if (!templateService) {
    container.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-exclamation-triangle me-2"></i>
        Serviço de templates não disponível. Recarregue a página.
      </div>
    `;
    return;
  }

  const templates = templateService.getAvailableTemplates();

  if (!templates || templates.length === 0) {
    container.innerHTML = `
      <div class="alert alert-secondary">
        <i class="bi bi-inbox me-2"></i>
        Nenhum template configurado no sistema.
      </div>
    `;
    return;
  }

  container.innerHTML = templates.map(template => `
    <div class="card mb-3">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span>
          <strong>${template.displayName || template.name}</strong>
          <span class="badge bg-secondary ms-2">${template.category || 'UTILITY'}</span>
        </span>
        <code class="text-muted small">${template.name}</code>
      </div>
      <div class="card-body">
        <p class="text-muted small mb-2">${template.description || ''}</p>
        
        ${template.parameters && template.parameters.length > 0 ? `
          <div class="mb-3">
            <strong class="small">Parâmetros:</strong>
            <ul class="list-unstyled mb-0 mt-1">
              ${template.parameters.map((p, i) => `
                <li class="small">
                  <code>{{${i + 1}}}</code> - ${p.label} ${p.required ? '<span class="text-danger">*</span>' : ''}
                  ${p.placeholder ? `<span class="text-muted">(${p.placeholder})</span>` : ''}
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
        
        <div class="bg-light p-3 rounded">
          <strong class="small d-block mb-2">
            <i class="bi bi-chat-quote me-1"></i>Exemplo de mensagem:
          </strong>
          <pre class="mb-0 small" style="white-space: pre-wrap; font-family: inherit;">${escapeHtmlForTemplates(template.example || '')}</pre>
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * Escapa HTML para exibição segura
 */
function escapeHtmlForTemplates(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Inicializa configuração do WhatsApp
 */
export async function initWhatsAppConfig() {
  if (window.__DEBUG__) console.log('[whatsappConfig] Inicializando configuração...');

  // Carregar configuração atual
  await loadCurrentWhatsAppConfig();

  // Carregar agentes
  await loadAgentsList();

  // Carregar estatísticas
  await loadWhatsAppStats();
  await loadWhatsAppIntegrationHealth();

  // Bind eventos
  const form = document.getElementById('whatsapp-config-form');
  if (form) {
    form.addEventListener('submit', saveWhatsAppConfig);
  }

  const integrationToggle = document.getElementById('whatsapp-enabled');
  if (integrationToggle && !integrationToggle.dataset.persistBound) {
    integrationToggle.dataset.persistBound = 'true';
    integrationToggle.addEventListener('change', async () => {
      if (isPersistingIntegrationToggle) return;
      const enabled = integrationToggle.checked;
      applyWhatsAppEnabledState(enabled);
      await persistWhatsAppEnabledState(enabled);
    });
  }

  const testBtn = document.getElementById('test-whatsapp-btn');
  if (testBtn) {
    testBtn.addEventListener('click', testWhatsAppMessage);
  }

  const testWebhookBtn = document.getElementById('test-whatsapp-webhook-btn');
  if (testWebhookBtn) {
    testWebhookBtn.addEventListener('click', testWhatsAppWebhook);
  }

  const googleSyncBtn = document.getElementById('google-contacts-sync-btn');
  if (googleSyncBtn) {
    googleSyncBtn.addEventListener('click', handleGoogleContactsSync);
  }

  // Configurar modal de templates
  const templatesModal = document.getElementById('modal-whatsapp-templates');
  if (templatesModal) {
    templatesModal.addEventListener('show.bs.modal', loadTemplatesList);
  }

  // Importação de contatos via CSV será inicializada quando o modal for aberto
  console.log('[whatsappConfig]  Importação CSV será configurada ao abrir o modal');

  //  OTIMIZAÇÃO 24/11/2025: Intervalos aumentados para reduzir leituras
  // Era: 30s para stats, 60s para agentes
  // Agora: 5 min para stats (com cache), 5 min para agentes
  setInterval(loadWhatsAppStats, 5 * 60 * 1000);  // 5 minutos (era 30s)
  setInterval(loadAgentsList, 5 * 60 * 1000);     // 5 minutos (era 60s)
  setInterval(loadWhatsAppIntegrationHealth, 10 * 60 * 1000); // 10 minutos

  if (window.__DEBUG__) console.log('[whatsappConfig] Configuração inicializada');
}

/**
 * Reprocessa mídias do WhatsApp que falharam no download
 * @param {boolean} forceRedownload - Se true, reprocessa todas as mídias, não apenas as que falharam
 */
async function retryWhatsAppMedia(forceRedownload = false) {
  const btn = document.getElementById('btn-retry-whatsapp-media');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Reprocessando...';
  }

  try {
    const retryFunction = firebase.app().functions('southamerica-east1').httpsCallable('retryDownloadWhatsAppMedia');
    const result = await retryFunction({ 
      limit: 100,
      forceRedownload 
    });

    const data = result.data;
    const stats = data.results;

    let message = `Reprocessamento concluído!\n\n`;
    message += `Total processado: ${stats.total}\n`;
    message += ` Sucesso: ${stats.success}\n`;
    message += ` Falhas: ${stats.failed}\n`;
    message += ` Puladas: ${stats.skipped}`;

    if (stats.errors && stats.errors.length > 0) {
      message += `\n\nPrimeiros erros:\n`;
      stats.errors.slice(0, 3).forEach(err => {
        message += `• ${err.mediaId}: ${err.error}\n`;
      });
    }

    showNotification(message, 'info');

    // Se houver chat aberto, recarregar mensagens
    if (window.__WHATSAPP_UI__?.reloadMessages) {
      setTimeout(() => window.__WHATSAPP_UI__.reloadMessages(), 1000);
    }

  } catch (err) {
    console.error('[whatsappConfig] Erro ao reprocessar mídias:', err);
    showNotification(`Erro ao reprocessar mídias: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-arrow-clockwise me-2"></i>Reprocessar Mídias';
    }
  }
}

/**
 * Reprocessa mídias de um chat específico
 * @param {string} chatId - ID do chat
 */
async function retryWhatsAppMediaForChat(chatId) {
  if (!chatId) {
    showNotification('ID do chat não fornecido', 'warning');
    return;
  }

  try {
    showNotification('Reprocessando mídias do chat...', 'info');

    const retryFunction = firebase.functions().httpsCallable('retryDownloadWhatsAppMedia');
    const result = await retryFunction({ 
      chatId,
      limit: 50,
      forceRedownload: false
    });

    const data = result.data;
    const stats = data.results;

    let message = `Reprocessamento do chat concluído!\n\n`;
    message += `Total: ${stats.total} | `;
    message += ` ${stats.success} | `;
    message += ` ${stats.failed} | `;
    message += ` ${stats.skipped}`;

    showNotification(message, stats.failed > 0 ? 'warning' : 'success');

    // Recarregar mensagens do chat
    if (window.__WHATSAPP_UI__?.reloadMessages) {
      setTimeout(() => window.__WHATSAPP_UI__.reloadMessages(), 1000);
    }

  } catch (err) {
    console.error('[whatsappConfig] Erro ao reprocessar mídias do chat:', err);
    showNotification(`Erro: ${err.message}`, 'error');
  }
}

// Expor globalmente
window.__WHATSAPP_CONFIG__ = {
  init: initWhatsAppConfig,
  load: loadCurrentWhatsAppConfig,
  save: saveWhatsAppConfig,
  test: testWhatsAppMessage,
  loadAgents: loadAgentsList,
  loadStats: loadWhatsAppStats,
  retryMedia: retryWhatsAppMedia,
  retryMediaForChat: retryWhatsAppMediaForChat
};

export default {
  init: initWhatsAppConfig,
  load: loadCurrentWhatsAppConfig,
  save: saveWhatsAppConfig
};
