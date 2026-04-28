/**
 * whatsappReports.js
 * Sistema de relatórios e métricas do WhatsApp
 * 
 * Funcionalidades:
 * - Tempo médio de atendimento
 * - Taxa de resolução
 * - Satisfação dos clientes
 * - Volume por departamento/agente
 * - Relatórios exportáveis
 */

import { db } from './auth.js';

/**
 * Gera relatório de desempenho de agentes
 */
export async function generateAgentPerformanceReport(startDate, endDate, agentId = null) {
  try {
    let query = db.collection('chats')
      .where('status', '==', 'resolvido')
      .where('resolvedAt', '>=', startDate)
      .where('resolvedAt', '<=', endDate);

    if (agentId) {
      query = query.where('agentId', '==', agentId);
    }

    const snapshot = await query.get();
    
    const agentStats = {};

    snapshot.docs.forEach(doc => {
      const chat = doc.data();
      const agent = chat.agentId;

      if (!agentStats[agent]) {
        agentStats[agent] = {
          totalChats: 0,
          totalMessages: 0,
          avgResponseTime: 0,
          avgResolutionTime: 0,
          satisfactionScores: []
        };
      }

      const stats = agentStats[agent];
      stats.totalChats++;

      // Calcular tempo de resposta
      if (chat.firstResponseAt && chat.createdAt) {
        const responseTime = chat.firstResponseAt.toMillis() - chat.createdAt.toMillis();
        stats.avgResponseTime = (stats.avgResponseTime * (stats.totalChats - 1) + responseTime) / stats.totalChats;
      }

      // Calcular tempo de resolução
      if (chat.resolvedAt && chat.createdAt) {
        const resolutionTime = chat.resolvedAt.toMillis() - chat.createdAt.toMillis();
        stats.avgResolutionTime = (stats.avgResolutionTime * (stats.totalChats - 1) + resolutionTime) / stats.totalChats;
      }

      // Satisfação
      if (chat.satisfactionScore) {
        stats.satisfactionScores.push(chat.satisfactionScore);
      }
    });

    // Calcular médias de satisfação
    Object.keys(agentStats).forEach(agent => {
      const stats = agentStats[agent];
      if (stats.satisfactionScores.length > 0) {
        stats.avgSatisfaction = stats.satisfactionScores.reduce((a, b) => a + b, 0) / stats.satisfactionScores.length;
      } else {
        stats.avgSatisfaction = null;
      }
    });

    return agentStats;
  } catch (err) {
    console.error('[whatsappReports] Erro ao gerar relatório de agentes:', err);
    throw err;
  }
}

/**
 * Gera relatório de volume por departamento
 */
export async function generateDepartmentVolumeReport(startDate, endDate) {
  try {
    const snapshot = await db.collection('chats')
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .get();

    const departmentStats = {};

    snapshot.docs.forEach(doc => {
      const chat = doc.data();
      const dept = chat.department || 'Sem Departamento';

      if (!departmentStats[dept]) {
        departmentStats[dept] = {
          total: 0,
          waiting: 0,
          active: 0,
          resolved: 0
        };
      }

      departmentStats[dept].total++;
      
      if (chat.status === 'aguardando') {
        departmentStats[dept].waiting++;
      } else if (chat.status === 'ativo') {
        departmentStats[dept].active++;
      } else if (chat.status === 'resolvido') {
        departmentStats[dept].resolved++;
      }
    });

    return departmentStats;
  } catch (err) {
    console.error('[whatsappReports] Erro ao gerar relatório de departamentos:', err);
    throw err;
  }
}

/**
 * Gera relatório de satisfação
 */
export async function generateSatisfactionReport(startDate, endDate) {
  try {
    const snapshot = await db.collection('chats')
      .where('status', '==', 'resolvido')
      .where('resolvedAt', '>=', startDate)
      .where('resolvedAt', '<=', endDate)
      .where('satisfactionScore', '>', 0)
      .get();

    const scores = [];
    const scoreDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    snapshot.docs.forEach(doc => {
      const score = doc.data().satisfactionScore;
      if (score) {
        scores.push(score);
        scoreDistribution[score]++;
      }
    });

    const avgScore = scores.length > 0 
      ? scores.reduce((a, b) => a + b, 0) / scores.length 
      : null;

    return {
      avgScore,
      totalResponses: scores.length,
      distribution: scoreDistribution
    };
  } catch (err) {
    console.error('[whatsappReports] Erro ao gerar relatório de satisfação:', err);
    throw err;
  }
}

/**
 * Gera relatório de tempo médio de atendimento
 */
export async function generateResponseTimeReport(startDate, endDate) {
  try {
    const snapshot = await db.collection('chats')
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .get();

    let totalResponseTime = 0;
    let totalResolutionTime = 0;
    let responseCount = 0;
    let resolutionCount = 0;

    snapshot.docs.forEach(doc => {
      const chat = doc.data();

      // Tempo de primeira resposta
      if (chat.firstResponseAt && chat.createdAt) {
        const responseTime = chat.firstResponseAt.toMillis() - chat.createdAt.toMillis();
        totalResponseTime += responseTime;
        responseCount++;
      }

      // Tempo de resolução
      if (chat.resolvedAt && chat.createdAt) {
        const resolutionTime = chat.resolvedAt.toMillis() - chat.createdAt.toMillis();
        totalResolutionTime += resolutionTime;
        resolutionCount++;
      }
    });

    return {
      avgResponseTime: responseCount > 0 ? totalResponseTime / responseCount : null,
      avgResolutionTime: resolutionCount > 0 ? totalResolutionTime / resolutionCount : null,
      responseCount,
      resolutionCount
    };
  } catch (err) {
    console.error('[whatsappReports] Erro ao gerar relatório de tempo:', err);
    throw err;
  }
}

/**
 * Exporta relatório para CSV
 */
export function exportReportToCSV(reportData, reportName) {
  try {
    let csvContent = '';

    if (Array.isArray(reportData)) {
      // Array de objetos
      const headers = Object.keys(reportData[0] || {});
      csvContent = headers.join(',') + '\n';
      
      reportData.forEach(row => {
        const values = headers.map(header => {
          const value = row[header];
          return typeof value === 'string' ? `"${value}"` : value;
        });
        csvContent += values.join(',') + '\n';
      });
    } else if (typeof reportData === 'object') {
      // Objeto simples
      csvContent = 'Métrica,Valor\n';
      Object.entries(reportData).forEach(([key, value]) => {
        csvContent += `"${key}","${value}"\n`;
      });
    }

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${reportName}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return { success: true };
  } catch (err) {
    console.error('[whatsappReports] Erro ao exportar relatório:', err);
    throw err;
  }
}

/**
 * Renderiza UI de relatórios
 */
export function initWhatsAppReports() {
  const container = document.getElementById('whatsapp-reports-container');
  if (!container) return;

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h5><i class="bi bi-graph-up"></i> Relatórios WhatsApp</h5>
      </div>
      <div class="card-body">
        <!-- Filtros -->
        <div class="row mb-4">
          <div class="col-md-4">
            <label class="form-label">Data Início</label>
            <input type="date" id="report-start-date" class="form-control">
          </div>
          <div class="col-md-4">
            <label class="form-label">Data Fim</label>
            <input type="date" id="report-end-date" class="form-control">
          </div>
          <div class="col-md-4">
            <label class="form-label">Tipo de Relatório</label>
            <select id="report-type" class="form-select">
              <option value="agents">Desempenho de Agentes</option>
              <option value="departments">Volume por Departamento</option>
              <option value="satisfaction">Satisfação</option>
              <option value="response-time">Tempo de Atendimento</option>
            </select>
          </div>
        </div>

        <!-- Botões -->
        <div class="mb-4">
          <button id="generate-report-btn" class="btn btn-primary">
            <i class="bi bi-file-earmark-bar-graph"></i> Gerar Relatório
          </button>
          <button id="export-report-btn" class="btn btn-success" disabled>
            <i class="bi bi-download"></i> Exportar CSV
          </button>
        </div>

        <!-- Resultado -->
        <div id="report-result"></div>
      </div>
    </div>
  `;

  bindReportEvents();
}

/**
 * Bind de eventos dos relatórios
 */
function bindReportEvents() {
  const generateBtn = document.getElementById('generate-report-btn');
  const exportBtn = document.getElementById('export-report-btn');
  const resultDiv = document.getElementById('report-result');

  let currentReportData = null;

  generateBtn?.addEventListener('click', async () => {
    try {
      const startDate = new Date(document.getElementById('report-start-date').value);
      const endDate = new Date(document.getElementById('report-end-date').value);
      const reportType = document.getElementById('report-type').value;

      if (!startDate || !endDate) {
        if (window.uiHelpers) window.uiHelpers.showToast('Selecione o período do relatório', 'warning');
        else alert('Selecione o período do relatório');
        return;
      }

      generateBtn.disabled = true;
      generateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Gerando...';

      let reportData;
      let reportHTML = '';

      switch (reportType) {
        case 'agents':
          reportData = await generateAgentPerformanceReport(startDate, endDate);
          reportHTML = renderAgentPerformanceReport(reportData);
          break;
        case 'departments':
          reportData = await generateDepartmentVolumeReport(startDate, endDate);
          reportHTML = renderDepartmentVolumeReport(reportData);
          break;
        case 'satisfaction':
          reportData = await generateSatisfactionReport(startDate, endDate);
          reportHTML = renderSatisfactionReport(reportData);
          break;
        case 'response-time':
          reportData = await generateResponseTimeReport(startDate, endDate);
          reportHTML = renderResponseTimeReport(reportData);
          break;
      }

      resultDiv.innerHTML = reportHTML;
      currentReportData = reportData;
      exportBtn.disabled = false;

    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      resultDiv.innerHTML = '<div class="alert alert-danger">Erro ao gerar relatório</div>';
    } finally {
      generateBtn.disabled = false;
      generateBtn.innerHTML = '<i class="bi bi-file-earmark-bar-graph"></i> Gerar Relatório';
    }
  });

  exportBtn?.addEventListener('click', () => {
    if (!currentReportData) return;

    const reportType = document.getElementById('report-type').value;
    exportReportToCSV(currentReportData, `relatorio_${reportType}`);
  });
}

/**
 * Renderiza relatório de agentes
 */
function renderAgentPerformanceReport(data) {
  let html = '<div class="table-responsive"><table class="table table-striped">';
  html += '<thead><tr><th>Agente</th><th>Total Chats</th><th>Tempo Resposta (min)</th><th>Tempo Resolução (min)</th><th>Satisfação</th></tr></thead><tbody>';

  Object.entries(data).forEach(([agentId, stats]) => {
    html += `<tr>
      <td>${agentId}</td>
      <td>${stats.totalChats}</td>
      <td>${(stats.avgResponseTime / 60000).toFixed(1)}</td>
      <td>${(stats.avgResolutionTime / 60000).toFixed(1)}</td>
      <td>${stats.avgSatisfaction ? stats.avgSatisfaction.toFixed(1) : 'N/A'}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  return html;
}

/**
 * Renderiza relatório de departamentos
 */
function renderDepartmentVolumeReport(data) {
  let html = '<div class="table-responsive"><table class="table table-striped">';
  html += '<thead><tr><th>Departamento</th><th>Total</th><th>Aguardando</th><th>Ativo</th><th>Resolvido</th></tr></thead><tbody>';

  Object.entries(data).forEach(([dept, stats]) => {
    html += `<tr>
      <td>${dept}</td>
      <td>${stats.total}</td>
      <td>${stats.waiting}</td>
      <td>${stats.active}</td>
      <td>${stats.resolved}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  return html;
}

/**
 * Renderiza relatório de satisfação
 */
function renderSatisfactionReport(data) {
  let html = '<div class="row">';
  html += `<div class="col-md-6">
    <div class="card">
      <div class="card-body text-center">
        <h3>${data.avgScore ? data.avgScore.toFixed(2) : 'N/A'}</h3>
        <p class="text-muted">Nota Média</p>
      </div>
    </div>
  </div>`;
  html += `<div class="col-md-6">
    <div class="card">
      <div class="card-body text-center">
        <h3>${data.totalResponses}</h3>
        <p class="text-muted">Total de Avaliações</p>
      </div>
    </div>
  </div>`;
  html += '</div>';

  html += '<div class="mt-3"><h6>Distribuição de Notas:</h6><ul class="list-group">';
  Object.entries(data.distribution).forEach(([score, count]) => {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      ${score} estrela${score > 1 ? 's' : ''}
      <span class="badge bg-primary rounded-pill">${count}</span>
    </li>`;
  });
  html += '</ul></div>';

  return html;
}

/**
 * Renderiza relatório de tempo
 */
function renderResponseTimeReport(data) {
  let html = '<div class="row">';
  html += `<div class="col-md-6">
    <div class="card">
      <div class="card-body text-center">
        <h3>${data.avgResponseTime ? (data.avgResponseTime / 60000).toFixed(1) : 'N/A'} min</h3>
        <p class="text-muted">Tempo Médio de Resposta</p>
      </div>
    </div>
  </div>`;
  html += `<div class="col-md-6">
    <div class="card">
      <div class="card-body text-center">
        <h3>${data.avgResolutionTime ? (data.avgResolutionTime / 60000).toFixed(1) : 'N/A'} min</h3>
        <p class="text-muted">Tempo Médio de Resolução</p>
      </div>
    </div>
  </div>`;
  html += '</div>';

  return html;
}
