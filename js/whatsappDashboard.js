/**
 * @file whatsappDashboard.js
 * @description Dashboard avançado de métricas WhatsApp por departamento
 *
 * Funcionalidades:
 * - KPIs em tempo real por departamento
 * - Gráficos interativos (Chart.js)
 * - Comparativo entre departamentos
 * - Métricas de performance de agentes
 * - Estatísticas de SLA
 * - Exportação de relatórios
 * - Filtros por período e departamento
 * 
 * Data: 2025-10-29
 */

import { db } from './auth.js';
import whatsappService from './whatsappService.js';
import cacheService from './cacheService.js';
import { showNotification } from './ui.js';

if (window.__DEBUG__) console.log('[whatsappDashboard] Módulo carregado.');

// Estado do dashboard
const dashboardState = {
  selectedPeriod: 'today', // today, week, month, custom
  selectedDepartment: 'all',
  startDate: null,
  endDate: null,
  autoRefresh: true,
  refreshInterval: null,
  charts: {}
};

// Configuração de períodos
const PERIODS = {
  today: { label: 'Hoje', days: 0 },
  week: { label: 'Última Semana', days: 7 },
  month: { label: 'Último Mês', days: 30 },
  quarter: { label: 'Último Trimestre', days: 90 }
};

/**
 * Inicializa dashboard de métricas
 */
export async function initDashboard() {
  if (window.__DEBUG__) console.log('[whatsappDashboard] Inicializando dashboard...');

  // Configurar filtros
  setupDashboardFilters();

  // Carregar dados iniciais
  await refreshDashboard();

  //  OTIMIZAÇÃO 24/11/2025: Auto-refresh aumentado para 3 minutos (era 30s)
  // Isso reduz ~6x as leituras do dashboard WhatsApp
  if (dashboardState.autoRefresh) {
    dashboardState.refreshInterval = setInterval(refreshDashboard, 3 * 60 * 1000);
  }

  if (window.__DEBUG__) console.log('[whatsappDashboard] Dashboard inicializado');
}

/**
 * Configura filtros do dashboard
 */
function setupDashboardFilters() {
  // Período
  const periodSelect = document.getElementById('dashboard-period-select');
  if (periodSelect) {
    periodSelect.addEventListener('change', (e) => {
      dashboardState.selectedPeriod = e.target.value;
      updateDateRange();
      refreshDashboard();
    });
  }

  // Departamento
  const deptSelect = document.getElementById('dashboard-department-select');
  if (deptSelect) {
    // Popular departamentos
    const departments = Object.values(whatsappService.DEPARTMENTS);
    deptSelect.innerHTML = `
      <option value="all">Todos os Departamentos</option>
      ${departments.map(dept => `<option value="${dept}">${dept}</option>`).join('')}
    `;

    deptSelect.addEventListener('change', (e) => {
      dashboardState.selectedDepartment = e.target.value;
      refreshDashboard();
    });
  }

  // Datas customizadas
  const startDateInput = document.getElementById('dashboard-start-date');
  const endDateInput = document.getElementById('dashboard-end-date');

  if (startDateInput && endDateInput) {
    startDateInput.addEventListener('change', () => {
      dashboardState.selectedPeriod = 'custom';
      dashboardState.startDate = new Date(startDateInput.value);
      refreshDashboard();
    });

    endDateInput.addEventListener('change', () => {
      dashboardState.selectedPeriod = 'custom';
      dashboardState.endDate = new Date(endDateInput.value);
      refreshDashboard();
    });
  }

  // Botão de atualizar
  const refreshBtn = document.getElementById('dashboard-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshDashboard);
  }

  // Toggle auto-refresh
  const autoRefreshToggle = document.getElementById('dashboard-auto-refresh');
  if (autoRefreshToggle) {
    autoRefreshToggle.checked = dashboardState.autoRefresh;
    autoRefreshToggle.addEventListener('change', (e) => {
      dashboardState.autoRefresh = e.target.checked;
      
      //  OTIMIZAÇÃO 24/11/2025: Intervalo aumentado para 3 minutos
      if (dashboardState.autoRefresh) {
        dashboardState.refreshInterval = setInterval(refreshDashboard, 3 * 60 * 1000);
      } else if (dashboardState.refreshInterval) {
        clearInterval(dashboardState.refreshInterval);
      }
    });
  }
}

/**
 * Atualiza range de datas baseado no período selecionado
 */
function updateDateRange() {
  const period = PERIODS[dashboardState.selectedPeriod];
  
  if (!period) return; // Custom

  const now = new Date();
  dashboardState.endDate = now;

  if (period.days === 0) {
    // Hoje: 00:00 até agora
    dashboardState.startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else {
    dashboardState.startDate = new Date(now.getTime() - (period.days * 24 * 60 * 60 * 1000));
  }
}

/**
 * Garante que a biblioteca Chart.js esteja carregada
 */
async function ensureChartLibrary() {
  if (typeof Chart !== 'undefined') return true;
  
  if (window.lazyLoader) {
    try {
      await window.lazyLoader.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', 'ChartJS');
      return true;
    } catch (e) {
      console.error('Falha ao carregar Chart.js via lazyLoader', e);
    }
  }
  
  // Fallback
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.error('Falha crítica ao carregar Chart.js');
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

/**
 * Atualiza todos os dados do dashboard
 */
async function refreshDashboard() {
  updateDateRange();

  try {
    // Mostrar loading
    showDashboardLoading(true);

    // Carregar dados em paralelo
    const [overview, departmentStats, agentPerformance, slaMetrics, volumeTimeline] = await Promise.all([
      loadOverviewMetrics(),
      loadDepartmentStatistics(),
      loadAgentPerformance(),
      loadSLAMetrics(),
      loadVolumeTimeline()
    ]);

    // Garantir que Chart.js esteja carregado antes de renderizar gráficos
    await ensureChartLibrary();

    // Renderizar seções
    renderOverviewCards(overview);
    renderDepartmentComparison(departmentStats);
    renderAgentRanking(agentPerformance);
    renderSLAGauge(slaMetrics);
    renderVolumeChart(volumeTimeline);

    // Atualizar timestamp
    updateLastRefreshTimestamp();

  } catch (err) {
    console.error('[whatsappDashboard] Erro ao atualizar dashboard:', err);
  } finally {
    showDashboardLoading(false);
  }
}

/**
 * Carrega métricas gerais (overview)
 */
async function loadOverviewMetrics() {
  const cacheKey = `dashboard_overview_${dashboardState.selectedPeriod}_${dashboardState.selectedDepartment}`;

  return await cacheService.get(cacheKey, async () => {
    let query = db.collection('chats')
      .where('createdAt', '>=', dashboardState.startDate)
      .where('createdAt', '<=', dashboardState.endDate);

    if (dashboardState.selectedDepartment !== 'all') {
      query = query.where('department', '==', dashboardState.selectedDepartment);
    }

    const snapshot = await query.get();

    const metrics = {
      totalChats: snapshot.size,
      activeChats: 0,
      resolvedChats: 0,
      avgResponseTime: 0,
      avgResolutionTime: 0,
      satisfactionScore: 0,
      totalAgents: 0,
      onlineAgents: 0
    };

    let totalResponseTime = 0;
    let totalResolutionTime = 0;
    let responseCount = 0;
    let resolutionCount = 0;
    let satisfactionCount = 0;
    let satisfactionSum = 0;

    snapshot.docs.forEach(doc => {
      const chat = doc.data();

      if (chat.status === 'ativo' || chat.status === 'atribuido') {
        metrics.activeChats++;
      }

      if (chat.status === 'resolvido') {
        metrics.resolvedChats++;
      }

      // Tempo de primeira resposta
      if (chat.firstResponseAt && chat.createdAt) {
        const responseTime = toMillis(chat.firstResponseAt) - toMillis(chat.createdAt);
        totalResponseTime += responseTime;
        responseCount++;
      }

      // Tempo de resolução
      if (chat.resolvedAt && chat.createdAt) {
        const resolutionTime = toMillis(chat.resolvedAt) - toMillis(chat.createdAt);
        totalResolutionTime += resolutionTime;
        resolutionCount++;
      }

      // Satisfação
      if (chat.customFields?.satisfactionScore) {
        satisfactionSum += chat.customFields.satisfactionScore;
        satisfactionCount++;
      }
    });

    metrics.avgResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;
    metrics.avgResolutionTime = resolutionCount > 0 ? totalResolutionTime / resolutionCount : 0;
    metrics.satisfactionScore = satisfactionCount > 0 ? satisfactionSum / satisfactionCount : 0;

    // Contar agentes (users.whatsapp)
    const agentsSnapshot = await db.collection('users')
      .where('whatsapp.isAgent', '==', true)
      .get();
    metrics.totalAgents = agentsSnapshot.size;
    
    agentsSnapshot.docs.forEach(doc => {
      const status = doc.data()?.whatsapp?.status;
      if (status === 'online') {
        metrics.onlineAgents++;
      }
    });

    return metrics;
  }, 'dashboard', true); // skipCache = true para dados em tempo real
}

/**
 * Carrega estatísticas por departamento
 */
async function loadDepartmentStatistics() {
  const cacheKey = `dashboard_departments_${dashboardState.selectedPeriod}`;

  return await cacheService.get(cacheKey, async () => {
    const snapshot = await db.collection('chats')
      .where('createdAt', '>=', dashboardState.startDate)
      .where('createdAt', '<=', dashboardState.endDate)
      .get();

    const deptStats = {};

    snapshot.docs.forEach(doc => {
      const chat = doc.data();
      const dept = chat.department || 'Sem Departamento';

      if (!deptStats[dept]) {
        deptStats[dept] = {
          total: 0,
          active: 0,
          resolved: 0,
          avgResponseTime: 0,
          avgResolutionTime: 0,
          satisfactionScore: 0,
          _responseTimes: [],
          _resolutionTimes: [],
          _satisfactionScores: []
        };
      }

      const stats = deptStats[dept];
      stats.total++;

      if (chat.status === 'ativo' || chat.status === 'atribuido') {
        stats.active++;
      }

      if (chat.status === 'resolvido') {
        stats.resolved++;
      }

      if (chat.firstResponseAt && chat.createdAt) {
        const responseTime = toMillis(chat.firstResponseAt) - toMillis(chat.createdAt);
        stats._responseTimes.push(responseTime);
      }

      if (chat.resolvedAt && chat.createdAt) {
        const resolutionTime = toMillis(chat.resolvedAt) - toMillis(chat.createdAt);
        stats._resolutionTimes.push(resolutionTime);
      }

      if (chat.customFields?.satisfactionScore) {
        stats._satisfactionScores.push(chat.customFields.satisfactionScore);
      }
    });

    // Calcular médias
    Object.keys(deptStats).forEach(dept => {
      const stats = deptStats[dept];
      
      if (stats._responseTimes.length > 0) {
        stats.avgResponseTime = stats._responseTimes.reduce((a, b) => a + b, 0) / stats._responseTimes.length;
      }
      
      if (stats._resolutionTimes.length > 0) {
        stats.avgResolutionTime = stats._resolutionTimes.reduce((a, b) => a + b, 0) / stats._resolutionTimes.length;
      }
      
      if (stats._satisfactionScores.length > 0) {
        stats.satisfactionScore = stats._satisfactionScores.reduce((a, b) => a + b, 0) / stats._satisfactionScores.length;
      }

      // Limpar arrays auxiliares
      delete stats._responseTimes;
      delete stats._resolutionTimes;
      delete stats._satisfactionScores;
    });

    return deptStats;
  }, 'dashboard', true);
}

/**
 * Carrega performance de agentes
 */
async function loadAgentPerformance() {
  const cacheKey = `dashboard_agents_${dashboardState.selectedPeriod}_${dashboardState.selectedDepartment}`;

  return await cacheService.get(cacheKey, async () => {
    //  FIX: Firestore não permite múltiplos campos com desigualdade
    // Removemos where('agentId', '!=', null) e filtramos em memória
    let query = db.collection('chats')
      .where('createdAt', '>=', dashboardState.startDate)
      .where('createdAt', '<=', dashboardState.endDate);

    if (dashboardState.selectedDepartment !== 'all') {
      query = query.where('department', '==', dashboardState.selectedDepartment);
    }

    const snapshot = await query.get();

    const agentStats = {};

    snapshot.docs.forEach(doc => {
      const chat = doc.data();
      const agentId = chat.agentId;

      //  Filtro em memória: ignorar chats sem agente atribuído
      if (!agentId) return;

      if (!agentStats[agentId]) {
        agentStats[agentId] = {
          agentId,
          agentName: chat.agentName || 'Desconhecido',
          totalChats: 0,
          resolvedChats: 0,
          avgResponseTime: 0,
          avgResolutionTime: 0,
          satisfactionScore: 0,
          _responseTimes: [],
          _resolutionTimes: [],
          _satisfactionScores: []
        };
      }

      const stats = agentStats[agentId];
      stats.totalChats++;

      if (chat.status === 'resolvido') {
        stats.resolvedChats++;
      }

      if (chat.firstResponseAt && chat.createdAt) {
        const responseTime = toMillis(chat.firstResponseAt) - toMillis(chat.createdAt);
        stats._responseTimes.push(responseTime);
      }

      if (chat.resolvedAt && chat.createdAt) {
        const resolutionTime = toMillis(chat.resolvedAt) - toMillis(chat.createdAt);
        stats._resolutionTimes.push(resolutionTime);
      }

      if (chat.customFields?.satisfactionScore) {
        stats._satisfactionScores.push(chat.customFields.satisfactionScore);
      }
    });

    // Calcular médias e ordenar
    const agentList = Object.values(agentStats);

    agentList.forEach(stats => {
      if (stats._responseTimes.length > 0) {
        stats.avgResponseTime = stats._responseTimes.reduce((a, b) => a + b, 0) / stats._responseTimes.length;
      }
      
      if (stats._resolutionTimes.length > 0) {
        stats.avgResolutionTime = stats._resolutionTimes.reduce((a, b) => a + b, 0) / stats._resolutionTimes.length;
      }
      
      if (stats._satisfactionScores.length > 0) {
        stats.satisfactionScore = stats._satisfactionScores.reduce((a, b) => a + b, 0) / stats._satisfactionScores.length;
      }

      delete stats._responseTimes;
      delete stats._resolutionTimes;
      delete stats._satisfactionScores;
    });

    // Ordenar por total de chats
    agentList.sort((a, b) => b.totalChats - a.totalChats);

    return agentList.slice(0, 10); // Top 10
  }, 'dashboard', true);
}

/**
 * Carrega métricas de SLA
 */
async function loadSLAMetrics() {
  const SLA_TARGET = 5 * 60 * 1000; // 5 minutos

  const cacheKey = `dashboard_sla_${dashboardState.selectedPeriod}_${dashboardState.selectedDepartment}`;

  return await cacheService.get(cacheKey, async () => {
    //  FIX: Remover filtro firstResponseAt != null (desigualdade dupla)
    let query = db.collection('chats')
      .where('createdAt', '>=', dashboardState.startDate)
      .where('createdAt', '<=', dashboardState.endDate);

    if (dashboardState.selectedDepartment !== 'all') {
      query = query.where('department', '==', dashboardState.selectedDepartment);
    }

    const snapshot = await query.get();

    let withinSLA = 0;
    let total = 0; // Contar apenas chats com firstResponseAt

    snapshot.docs.forEach(doc => {
      const chat = doc.data();
      
      //  Filtro em memória: apenas chats com primeira resposta
      if (chat.firstResponseAt && chat.createdAt) {
        total++; // Incrementar total apenas para chats válidos
        
        const responseTime = toMillis(chat.firstResponseAt) - toMillis(chat.createdAt);
        
        if (responseTime <= SLA_TARGET) {
          withinSLA++;
        }
      }
    });

    const slaPercentage = total > 0 ? (withinSLA / total) * 100 : 0;

    return {
      slaPercentage,
      withinSLA,
      total,
      target: SLA_TARGET
    };
  }, 'dashboard', true);
}

/**
 * Carrega timeline de volume
 */
async function loadVolumeTimeline() {
  const cacheKey = `dashboard_volume_${dashboardState.selectedPeriod}_${dashboardState.selectedDepartment}`;

  return await cacheService.get(cacheKey, async () => {
    let query = db.collection('chats')
      .where('createdAt', '>=', dashboardState.startDate)
      .where('createdAt', '<=', dashboardState.endDate);

    if (dashboardState.selectedDepartment !== 'all') {
      query = query.where('department', '==', dashboardState.selectedDepartment);
    }

    const snapshot = await query.get();

    // Agrupar por dia/hora dependendo do período
    const groupBy = dashboardState.selectedPeriod === 'today' ? 'hour' : 'day';
    const timeline = {};

    snapshot.docs.forEach(doc => {
      const chat = doc.data();
      const date = toDate(chat.createdAt);
      
      if (!date) return;

      let key;
      if (groupBy === 'hour') {
        key = `${date.getHours()}:00`;
      } else {
        key = `${date.getDate()}/${date.getMonth() + 1}`;
      }

      if (!timeline[key]) {
        timeline[key] = {
          total: 0,
          resolved: 0,
          active: 0
        };
      }

      timeline[key].total++;

      if (chat.status === 'resolvido') {
        timeline[key].resolved++;
      } else if (chat.status === 'ativo' || chat.status === 'atribuido') {
        timeline[key].active++;
      }
    });

    return timeline;
  }, 'dashboard', true);
}

// Funções de renderização

/**
 * Renderiza cards de overview
 */
function renderOverviewCards(metrics) {
  // Total de conversas
  updateCardValue('total-chats-card', metrics.totalChats);

  // Conversas ativas
  updateCardValue('active-chats-card', metrics.activeChats);

  // Taxa de resolução
  const resolutionRate = metrics.totalChats > 0 
    ? ((metrics.resolvedChats / metrics.totalChats) * 100).toFixed(1)
    : 0;
  updateCardValue('resolution-rate-card', `${resolutionRate}%`);

  // Tempo médio de resposta
  updateCardValue('avg-response-time-card', formatTime(metrics.avgResponseTime));

  // Tempo médio de resolução
  updateCardValue('avg-resolution-time-card', formatTime(metrics.avgResolutionTime));

  // Satisfação média
  const satisfactionStars = metrics.satisfactionScore > 0 
    ? `${metrics.satisfactionScore.toFixed(1)} ⭐`
    : 'N/A';
  updateCardValue('avg-satisfaction-card', satisfactionStars);

  // Agentes online
  updateCardValue('online-agents-card', `${metrics.onlineAgents}/${metrics.totalAgents}`);
}

/**
 * Renderiza comparação entre departamentos
 */
function renderDepartmentComparison(deptStats) {
  const container = document.getElementById('department-comparison-container');
  if (!container) return;

  const departments = Object.keys(deptStats).sort((a, b) => 
    deptStats[b].total - deptStats[a].total
  );

  if (departments.length === 0) {
    container.innerHTML = '<p class="text-center text-muted">Nenhum dado disponível</p>';
    return;
  }

  // Destruir gráfico anterior se existir
  if (dashboardState.charts.deptComparison) {
    dashboardState.charts.deptComparison.destroy();
  }

  const canvas = document.getElementById('dept-comparison-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  dashboardState.charts.deptComparison = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: departments,
      datasets: [
        {
          label: 'Total',
          data: departments.map(dept => deptStats[dept].total),
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        },
        {
          label: 'Resolvidas',
          data: departments.map(dept => deptStats[dept].resolved),
          backgroundColor: 'rgba(75, 192, 192, 0.5)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        },
        {
          label: 'Ativas',
          data: departments.map(dept => deptStats[dept].active),
          backgroundColor: 'rgba(255, 206, 86, 0.5)',
          borderColor: 'rgba(255, 206, 86, 1)',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

/**
 * Renderiza ranking de agentes
 */
function renderAgentRanking(agentList) {
  const container = document.getElementById('agent-ranking-container');
  if (!container) return;

  if (agentList.length === 0) {
    container.innerHTML = '<p class="text-center text-muted">Nenhum agente com dados no período</p>';
    return;
  }

  container.innerHTML = agentList.map((agent, index) => `
    <div class="card mb-2">
      <div class="card-body p-2">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <span class="badge bg-${index < 3 ? 'warning' : 'secondary'} me-2">#${index + 1}</span>
            <strong>${agent.agentName}</strong>
          </div>
          <div class="text-end">
            <div><small class="text-muted">Conversas:</small> <strong>${agent.totalChats}</strong></div>
            <div><small class="text-muted">Resolvidas:</small> <strong>${agent.resolvedChats}</strong></div>
            ${agent.satisfactionScore > 0 ? `
              <div><small class="text-muted">Satisfação:</small> <strong>${agent.satisfactionScore.toFixed(1)} ⭐</strong></div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * Renderiza gauge de SLA
 */
function renderSLAGauge(slaMetrics) {
  const container = document.getElementById('sla-gauge-container');
  if (!container) return;

  const percentage = Math.round(slaMetrics.slaPercentage);

  // Determinar cor baseado na performance
  let color = 'danger';
  if (percentage >= 90) color = 'success';
  else if (percentage >= 70) color = 'warning';

  container.innerHTML = `
    <div class="text-center">
      <div class="position-relative d-inline-block" style="width: 200px; height: 200px;">
        <svg viewBox="0 0 100 100" class="position-absolute top-0 start-0 w-100 h-100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#e9ecef" stroke-width="8"/>
          <circle cx="50" cy="50" r="45" fill="none" 
                  stroke="var(--bs-${color})" stroke-width="8"
                  stroke-dasharray="${percentage * 2.827} 282.7"
                  transform="rotate(-90 50 50)"
                  style="transition: stroke-dasharray 0.5s ease;"/>
        </svg>
        <div class="position-absolute top-50 start-50 translate-middle">
          <h1 class="mb-0 text-${color}">${percentage}%</h1>
          <small class="text-muted">SLA</small>
        </div>
      </div>
      <p class="mt-3 mb-0">
        <strong>${slaMetrics.withinSLA}</strong> de <strong>${slaMetrics.total}</strong> conversas
        <br>
        <small class="text-muted">respondidas em até 5 minutos</small>
      </p>
    </div>
  `;
}

/**
 * Renderiza gráfico de volume
 */
function renderVolumeChart(timeline) {
  const canvas = document.getElementById('volume-timeline-chart');
  if (!canvas) return;

  const labels = Object.keys(timeline).sort();
  
  if (labels.length === 0) {
    const container = canvas.parentElement;
    container.innerHTML = '<p class="text-center text-muted">Nenhum dado disponível</p>';
    return;
  }

  // Destruir gráfico anterior
  if (dashboardState.charts.volumeTimeline) {
    dashboardState.charts.volumeTimeline.destroy();
  }

  const ctx = canvas.getContext('2d');

  dashboardState.charts.volumeTimeline = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Total',
          data: labels.map(key => timeline[key].total),
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Resolvidas',
          data: labels.map(key => timeline[key].resolved),
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Ativas',
          data: labels.map(key => timeline[key].active),
          borderColor: 'rgba(255, 206, 86, 1)',
          backgroundColor: 'rgba(255, 206, 86, 0.1)',
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      },
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

// Funções auxiliares

function updateCardValue(cardId, value) {
  const card = document.getElementById(cardId);
  if (card) {
    const valueEl = card.querySelector('.card-value') || card;
    valueEl.textContent = value;
  }
}

function showDashboardLoading(show) {
  const loadingOverlay = document.getElementById('dashboard-loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.classList.toggle('d-none', !show);
  }
}

function updateLastRefreshTimestamp() {
  const timestamp = document.getElementById('dashboard-last-refresh');
  if (timestamp) {
    timestamp.textContent = new Date().toLocaleTimeString('pt-BR');
  }
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function formatTime(ms) {
  if (!ms || ms === 0) return 'N/A';
  
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  
  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  }
  
  return minutes > 0 ? `${minutes}min ${seconds}s` : `${seconds}s`;
}

/**
 * Exporta relatório do dashboard
 */
export async function exportDashboardReport(format = 'pdf') {
  try {
    showNotification('Gerando relatório...', 'info');

    const data = {
      period: dashboardState.selectedPeriod,
      department: dashboardState.selectedDepartment,
      startDate: dashboardState.startDate,
      endDate: dashboardState.endDate,
      overview: await loadOverviewMetrics(),
      departments: await loadDepartmentStatistics(),
      agents: await loadAgentPerformance(),
      sla: await loadSLAMetrics()
    };

    if (format === 'pdf') {
      // Implementar geração de PDF (requer biblioteca como jsPDF)
      showNotification('Exportação PDF em desenvolvimento', 'warning');
    } else if (format === 'csv') {
      exportToCSV(data);
    } else if (format === 'json') {
      downloadJSON(data, 'dashboard-report.json');
    }

  } catch (err) {
    console.error('[whatsappDashboard] Erro ao exportar:', err);
    showNotification('Erro ao exportar relatório', 'error');
  }
}

function exportToCSV(data) {
  let csv = 'Métrica,Valor\n';
  csv += `Período,${PERIODS[data.period]?.label || 'Customizado'}\n`;
  csv += `Departamento,${data.department}\n`;
  csv += `Total de Conversas,${data.overview.totalChats}\n`;
  csv += `Conversas Ativas,${data.overview.activeChats}\n`;
  csv += `Conversas Resolvidas,${data.overview.resolvedChats}\n`;
  csv += `Tempo Médio de Resposta,${formatTime(data.overview.avgResponseTime)}\n`;
  csv += `Satisfação Média,${data.overview.satisfactionScore.toFixed(2)}\n`;
  csv += `SLA (%),${data.sla.slaPercentage.toFixed(2)}\n\n`;

  csv += 'Top Agentes\n';
  csv += 'Nome,Total,Resolvidas,Satisfação\n';
  data.agents.forEach(agent => {
    csv += `${agent.agentName},${agent.totalChats},${agent.resolvedChats},${agent.satisfactionScore.toFixed(2)}\n`;
  });

  downloadCSV(csv, 'dashboard-report.csv');
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showNotification('Relatório CSV exportado!', 'success');
}

function downloadJSON(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showNotification('Relatório JSON exportado!', 'success');
}

/**
 * Para auto-refresh do dashboard
 */
export function stopDashboard() {
  if (dashboardState.refreshInterval) {
    clearInterval(dashboardState.refreshInterval);
  }

  // Destruir gráficos
  Object.values(dashboardState.charts).forEach(chart => {
    if (chart) chart.destroy();
  });

  dashboardState.charts = {};
}

/**
 * Abre modal do dashboard em nova janela
 */
export function openDashboard() {
  if (window.__DEBUG__) console.log('[whatsappDashboard] Abrindo dashboard...');
  
  // Abrir em nova janela
  const width = 1200;
  const height = 800;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  
  const dashboardWindow = window.open(
    '/whatsapp-dashboard.html',
    'WhatsAppDashboard',
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
  
  if (!dashboardWindow) {
    showNotification('Popup bloqueado! Habilite popups para este site.', 'error');
    return;
  }
  
  // Quando a janela carregar, inicializar dashboard
  dashboardWindow.addEventListener('load', async () => {
    try {
      if (dashboardWindow.__WHATSAPP_DASHBOARD__) {
        await dashboardWindow.__WHATSAPP_DASHBOARD__.init();
      }
    } catch (err) {
      console.error('[whatsappDashboard] Erro ao inicializar dashboard:', err);
    }
  });
}

// API pública
export const whatsappDashboard = {
  init: initDashboard,
  refresh: refreshDashboard,
  export: exportDashboardReport,
  stop: stopDashboard,
  openDashboard
};

// Expor globalmente
window.__WHATSAPP_DASHBOARD__ = whatsappDashboard;

export default whatsappDashboard;
