/**
 * @file ReadMetricsDashboardModal.js
 * @description Modal de dashboard para monitoramento de leituras Firestore
 *
 * Exibe:
 * - Estatísticas do dia atual
 * - Histórico de leituras (últimos 7 dias)
 * - Consumo por coleção
 * - Consumo por usuário
 * - Alertas e recomendações
 * - Projeção de uso
 */

/**
 * Classe do modal de métricas de leituras
 */
class ReadMetricsDashboardModal {
  constructor() {
    this.modalId = 'readMetricsDashboardModal';
    this.isLoading = false;
    this.refreshInterval = null;
  }

  /**
   * Obtém a instância global do serviço de métricas
   */
  getMetricsService() {
    if (!window.readMetricsService) {
      throw new Error('Serviço de métricas de leituras não foi inicializado. Recarregue a página.');
    }
    return window.readMetricsService;
  }

  /**
   * Abre o modal
   */
  async open() {
    // Verifica permissão de admin
    if (!this.isAdmin()) {
      console.warn('[ReadMetrics] Acesso negado: apenas admins');
      return;
    }

    this.createModal();
    this.showModal();
    await this.loadData();

    // Auto-refresh a cada 30 segundos
    this.refreshInterval = setInterval(() => {
      this.loadData(true);
    }, 30000);
  }

  /**
   * Verifica se usuário é admin
   */
  isAdmin() {
    // Método 1: Verifica se o botão de configurações está visível (só admins veem)
    const settingsBtn = document.querySelector('[data-page="configuracoes"]');
    if (settingsBtn && settingsBtn.style.display !== 'none') {
      return true;
    }

    // Método 2: Verifica via Firebase Auth token (se disponível)
    if (window.currentUserAuth) {
      // O token é verificado em main.js e a UI é ajustada conforme
      // Se o usuário está na página de configurações, é admin
      const configPage = document.getElementById('page-configuracoes');
      if (configPage) {
        return true;
      }
    }

    // Método 3: Fallback - verifica localStorage
    const userRole = localStorage.getItem('userRole');
    return userRole === 'admin' || userRole === 'superadmin';
  }

  /**
   * Cria o HTML do modal
   */
  createModal() {
    // Remove modal existente se houver
    const existing = document.getElementById(this.modalId);
    if (existing) existing.remove();

    const modalHtml = `
      <div class="modal fade" id="${this.modalId}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header bg-primary text-white">
              <h5 class="modal-title">
                <i class="bi bi-speedometer2 me-2"></i>
                Monitor de Leituras Firestore
              </h5>
              <div class="d-flex align-items-center gap-2">
                <button type="button" class="btn btn-sm btn-outline-light" id="btnRefreshMetrics" title="Atualizar">
                  <i class="bi bi-arrow-clockwise"></i>
                </button>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
            </div>
            <div class="modal-body p-0">
              <!-- Loading -->
              <div id="metricsLoading" class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Carregando...</span>
                </div>
                <p class="mt-2 text-muted">Carregando métricas...</p>
              </div>

              <!-- Content -->
              <div id="metricsContent" class="d-none">
                <!-- Resumo do Dia -->
                <div class="p-3 border-bottom">
                  <h6 class="text-muted mb-3">
                    <i class="bi bi-calendar-day me-1"></i>
                    Hoje
                  </h6>
                  <div class="row g-3" id="dailySummaryCards">
                    <!-- Cards serão inseridos via JS -->
                  </div>
                </div>

                <!-- Barra de Progresso do Limite -->
                <div class="p-3 border-bottom">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="small text-muted">Uso do limite diário</span>
                    <span class="small fw-bold" id="limitPercentText">0%</span>
                  </div>
                  <div class="progress" style="height: 12px;">
                    <div class="progress-bar" id="limitProgressBar" role="progressbar" style="width: 0%"></div>
                  </div>
                  <div class="d-flex justify-content-between mt-1">
                    <small class="text-muted">0</small>
                    <small class="text-muted" id="limitMaxText">50.000</small>
                  </div>
                </div>

                <!-- Alertas -->
                <div id="alertsSection" class="p-3 border-bottom d-none">
                  <h6 class="text-danger mb-3">
                    <i class="bi bi-exclamation-triangle me-1"></i>
                    Alertas
                  </h6>
                  <div id="alertsList"></div>
                </div>

                <!-- Recomendações -->
                <div id="recommendationsSection" class="p-3 border-bottom d-none">
                  <h6 class="text-info mb-3">
                    <i class="bi bi-lightbulb me-1"></i>
                    Recomendações
                  </h6>
                  <div id="recommendationsList"></div>
                </div>

                <!-- Tabs de detalhes -->
                <div class="p-3">
                  <ul class="nav nav-tabs nav-fill mb-3" role="tablist">
                    <li class="nav-item">
                      <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tabCollections">
                        <i class="bi bi-folder2 me-1"></i>
                        Por Coleção
                      </button>
                    </li>
                    <li class="nav-item">
                      <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tabUsers">
                        <i class="bi bi-people me-1"></i>
                        Por Usuário
                      </button>
                    </li>
                    <li class="nav-item">
                      <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tabHistory">
                        <i class="bi bi-graph-up me-1"></i>
                        Histórico
                      </button>
                    </li>
                    <li class="nav-item">
                      <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tabSession">
                        <i class="bi bi-clock-history me-1"></i>
                        Sessão Atual
                      </button>
                    </li>
                  </ul>

                  <div class="tab-content">
                    <!-- Tab: Por Coleção -->
                    <div class="tab-pane fade show active" id="tabCollections">
                      <div class="table-responsive">
                        <table class="table table-sm table-hover" id="collectionsTable">
                          <thead class="table-light">
                            <tr>
                              <th>Coleção</th>
                              <th class="text-end">Leituras</th>
                              <th class="text-end">%</th>
                              <th style="width: 200px;">Proporção</th>
                            </tr>
                          </thead>
                          <tbody></tbody>
                        </table>
                      </div>
                    </div>

                    <!-- Tab: Por Usuário -->
                    <div class="tab-pane fade" id="tabUsers">
                      <div class="table-responsive">
                        <table class="table table-sm table-hover" id="usersTable">
                          <thead class="table-light">
                            <tr>
                              <th>Usuário</th>
                              <th class="text-end">Leituras</th>
                              <th class="text-end">%</th>
                              <th style="width: 200px;">Proporção</th>
                            </tr>
                          </thead>
                          <tbody></tbody>
                        </table>
                      </div>
                    </div>

                    <!-- Tab: Histórico -->
                    <div class="tab-pane fade" id="tabHistory">
                      <div class="table-responsive">
                        <table class="table table-sm table-hover" id="historyTable">
                          <thead class="table-light">
                            <tr>
                              <th>Data</th>
                              <th class="text-end">Leituras</th>
                              <th class="text-end">Cache Hit</th>
                              <th class="text-end">Usuários</th>
                            </tr>
                          </thead>
                          <tbody></tbody>
                        </table>
                      </div>
                    </div>

                    <!-- Tab: Sessão Atual -->
                    <div class="tab-pane fade" id="tabSession">
                      <div id="sessionStats">
                        <!-- Dados da sessão atual -->
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <div class="flex-grow-1">
                <small class="text-muted">
                  <i class="bi bi-info-circle me-1"></i>
                  Dados atualizados automaticamente a cada 30s
                </small>
              </div>
              <button type="button" class="btn btn-outline-secondary" id="btnExportMetrics">
                <i class="bi bi-download me-1"></i>
                Exportar
              </button>
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Event listeners
    document.getElementById('btnRefreshMetrics').addEventListener('click', () => this.loadData());
    document.getElementById('btnExportMetrics').addEventListener('click', () => this.exportData());

    // Cleanup ao fechar
    document.getElementById(this.modalId).addEventListener('hidden.bs.modal', () => {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
    });
  }

  /**
   * Exibe o modal
   */
  showModal() {
    const modal = new bootstrap.Modal(document.getElementById(this.modalId));
    modal.show();
  }

  /**
   * Carrega dados de métricas
   */
  async loadData(silent = false) {
    if (this.isLoading) return;
    this.isLoading = true;

    const loadingEl = document.getElementById('metricsLoading');
    const contentEl = document.getElementById('metricsContent');

    if (!silent) {
      loadingEl.classList.remove('d-none');
      contentEl.classList.add('d-none');
    }

    try {
      const metricsService = this.getMetricsService();
      const report = await metricsService.getReport();
      this.renderData(report);
    } catch (error) {
      console.error('[ReadMetrics] Erro ao carregar dados:', error);
      this.showError('Erro ao carregar métricas: ' + error.message);
    } finally {
      this.isLoading = false;
      loadingEl.classList.add('d-none');
      contentEl.classList.remove('d-none');
    }
  }

  /**
   * Renderiza os dados no modal
   */
  renderData(report) {
    this.renderSummaryCards(report.daily);
    this.renderProgressBar(report.daily);
    this.renderAlerts(report.daily.alerts);
    this.renderRecommendations(report.recommendations);
    this.renderCollectionsTable(report.daily.byCollection, report.daily.totalReads);
    this.renderUsersTable(report.daily.byUser, report.daily.totalReads);
    this.renderHistoryTable(report.history);
    this.renderSessionStats(report.current);
  }

  /**
   * Renderiza cards de resumo
   */
  renderSummaryCards(daily) {
    const container = document.getElementById('dailySummaryCards');

    const cards = [
      {
        icon: 'bi-database',
        label: 'Total Leituras',
        value: this.formatNumber(daily.totalReads),
        color: 'primary'
      },
      {
        icon: 'bi-lightning',
        label: 'Cache Hit Rate',
        value: daily.cache?.hitRate || '0%',
        color: daily.cache?.hitRate && parseFloat(daily.cache.hitRate) > 70 ? 'success' : 'warning'
      },
      {
        icon: 'bi-bullseye',
        label: 'Atribuicao',
        value: daily.attribution?.rate || '100%',
        color: Number(daily.attribution?.unattributedReads || 0) > 0 ? 'warning' : 'success'
      },
      {
        icon: 'bi-graph-up-arrow',
        label: 'Projeção Diária',
        value: daily.projectedDaily?.projectedDaily
          ? this.formatNumber(daily.projectedDaily.projectedDaily)
          : '-',
        color: daily.projectedDaily?.willExceedLimit ? 'danger' : 'info'
      },
      {
        icon: 'bi-hourglass-split',
        label: 'Restante',
        value: this.formatNumber(daily.readsRemaining),
        color: parseFloat(daily.percentUsed) > 80 ? 'danger' : 'success'
      }
    ];

    container.innerHTML = cards.map(card => `
      <div class="col-6 col-lg">
        <div class="card h-100 border-0 bg-light">
          <div class="card-body text-center py-3">
            <i class="bi ${card.icon} text-${card.color} fs-4 mb-2"></i>
            <div class="fs-4 fw-bold text-${card.color}">${card.value}</div>
            <small class="text-muted">${card.label}</small>
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * Renderiza barra de progresso do limite
   */
  renderProgressBar(daily) {
    const percent = parseFloat(daily.percentUsed) || 0;
    const bar = document.getElementById('limitProgressBar');
    const text = document.getElementById('limitPercentText');
    const maxText = document.getElementById('limitMaxText');

    bar.style.width = `${Math.min(percent, 100)}%`;
    bar.className = 'progress-bar';

    if (percent > 90) {
      bar.classList.add('bg-danger');
    } else if (percent > 70) {
      bar.classList.add('bg-warning');
    } else {
      bar.classList.add('bg-success');
    }

    text.textContent = `${percent}%`;
    const metricsService = this.getMetricsService();
    maxText.textContent = this.formatNumber(metricsService.config.dailyReadLimit);
  }

  /**
   * Renderiza seção de alertas
   */
  renderAlerts(alerts) {
    const section = document.getElementById('alertsSection');
    const list = document.getElementById('alertsList');

    if (!alerts || alerts.length === 0) {
      section.classList.add('d-none');
      return;
    }

    section.classList.remove('d-none');
    list.innerHTML = alerts.map(alert => {
      const icon = alert.severity === 'critical' ? 'exclamation-circle' : 'exclamation-triangle';
      const color = alert.severity === 'critical' ? 'danger' : 'warning';
      const time = new Date(alert.timestamp).toLocaleTimeString('pt-BR');

      return `
        <div class="alert alert-${color} py-2 mb-2 d-flex align-items-center">
          <i class="bi bi-${icon} me-2"></i>
          <span class="flex-grow-1">${alert.message}</span>
          <small class="text-muted">${time}</small>
        </div>
      `;
    }).join('');
  }

  /**
   * Renderiza recomendações
   */
  renderRecommendations(recommendations) {
    const section = document.getElementById('recommendationsSection');
    const list = document.getElementById('recommendationsList');

    if (!recommendations || recommendations.length === 0) {
      section.classList.add('d-none');
      return;
    }

    section.classList.remove('d-none');
    list.innerHTML = recommendations.map(rec => {
      const icon = rec.severity === 'critical' ? 'exclamation-circle' :
                   rec.severity === 'high' ? 'exclamation-triangle' : 'lightbulb';
      const color = rec.severity === 'critical' ? 'danger' :
                    rec.severity === 'high' ? 'warning' : 'info';

      return `
        <div class="alert alert-${color} py-2 mb-2">
          <i class="bi bi-${icon} me-2"></i>
          ${rec.message}
        </div>
      `;
    }).join('');
  }

  /**
   * Renderiza tabela de coleções
   */
  renderCollectionsTable(byCollection, total) {
    const tbody = document.querySelector('#collectionsTable tbody');

    if (!byCollection || Object.keys(byCollection).length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Sem dados</td></tr>';
      return;
    }

    const sorted = Object.entries(byCollection)
      .sort(([,a], [,b]) => b - a);

    tbody.innerHTML = sorted.map(([collection, count]) => {
      const percent = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
      const isUnattributed = collection === '__unattributed__' || collection === '__sem_colecao_mapeada__';
      const displayCollection = this.formatMetricDimension(collection);
      const barClass = isUnattributed ? 'bg-warning' : 'bg-primary';
      const label = isUnattributed
        ? `<span class="badge text-bg-warning">${displayCollection}</span>`
        : `<code>${displayCollection}</code>`;
      return `
        <tr>
          <td>${label}</td>
          <td class="text-end">${this.formatNumber(count)}</td>
          <td class="text-end">${percent}%</td>
          <td>
            <div class="progress" style="height: 8px;">
              <div class="progress-bar ${barClass}" style="width: ${percent}%"></div>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Renderiza tabela de usuários
   */
  renderUsersTable(byUser, total) {
    const tbody = document.querySelector('#usersTable tbody');

    if (!byUser || Object.keys(byUser).length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Sem dados</td></tr>';
      return;
    }

    const sorted = Object.entries(byUser)
      .sort(([,a], [,b]) => b - a);

    tbody.innerHTML = sorted.map(([userId, count]) => {
      const percent = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
      const shortId = userId.length > 20 ? userId.slice(0, 8) + '...' : userId;

      return `
        <tr>
          <td title="${userId}"><code>${shortId}</code></td>
          <td class="text-end">${this.formatNumber(count)}</td>
          <td class="text-end">${percent}%</td>
          <td>
            <div class="progress" style="height: 8px;">
              <div class="progress-bar bg-info" style="width: ${percent}%"></div>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Renderiza tabela de histórico
   */
  renderHistoryTable(history) {
    const tbody = document.querySelector('#historyTable tbody');

    if (!history || history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Sem dados históricos</td></tr>';
      return;
    }

    tbody.innerHTML = history.map(day => {
      const date = new Date(day.date).toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit'
      });

      return `
        <tr>
          <td>${date}</td>
          <td class="text-end">${this.formatNumber(day.totalReads)}</td>
          <td class="text-end">${day.cacheHitRate}</td>
          <td class="text-end">${day.userCount}</td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Renderiza estatísticas da sessão atual
   */
  renderSessionStats(session) {
    const container = document.getElementById('sessionStats');

    const duration = Math.round(session.sessionDuration / 60);
    const operations = Object.entries(session.reads.byOperation || {})
      .map(([op, count]) => `${op}: ${count}`)
      .join(', ') || 'Nenhuma';

    container.innerHTML = `
      <div class="row g-3">
        <div class="col-md-6">
          <div class="card bg-light border-0">
            <div class="card-body">
              <h6 class="card-title">
                <i class="bi bi-clock me-1"></i>
                Sessão
              </h6>
              <p class="mb-1">Duração: <strong>${duration} min</strong></p>
              <p class="mb-1">Leituras: <strong>${session.reads.total}</strong></p>
              <p class="mb-1">Atribuição: <strong>${session.attribution?.rate || '100%'}</strong></p>
              <p class="mb-0">Cache hits: <strong>${session.cache.hits}</strong> | misses: <strong>${session.cache.misses}</strong></p>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card bg-light border-0">
            <div class="card-body">
              <h6 class="card-title">
                <i class="bi bi-diagram-3 me-1"></i>
                Operações
              </h6>
              <p class="mb-0 small">${operations}</p>
            </div>
          </div>
        </div>
      </div>
      ${session.alerts.length > 0 ? `
        <div class="alert alert-warning mt-3">
          <i class="bi bi-exclamation-triangle me-1"></i>
          ${session.alerts.length} alerta(s) na sessão atual
        </div>
      ` : ''}
    `;
  }

  /**
   * Exporta dados para JSON
   */
  async exportData() {
    try {
      const metricsService = this.getMetricsService();
      const report = await metricsService.getReport();
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `firestore-metrics-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[ReadMetrics] Erro ao exportar:', error);
    }
  }

  /**
   * Exibe erro
   */
  showError(message) {
    const contentEl = document.getElementById('metricsContent');
    contentEl.innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-exclamation-triangle text-danger fs-1"></i>
        <p class="mt-2 text-muted">${message}</p>
        <button class="btn btn-primary" onclick="document.querySelector('#btnRefreshMetrics').click()">
          Tentar novamente
        </button>
      </div>
    `;
    contentEl.classList.remove('d-none');
  }

  /**
   * Formata número com separador de milhar
   */
  formatNumber(num) {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('pt-BR');
  }

  formatMetricDimension(value) {
    const normalized = String(value || '').trim();
    if (normalized === '__unattributed__' || normalized === '__sem_colecao_mapeada__') {
      return 'Sem colecao mapeada';
    }
    if (normalized === '__sem_fonte_mapeada__') {
      return 'Sem fonte mapeada';
    }
    return normalized || 'Desconhecido';
  }
}

// Instância global
const readMetricsDashboardModal = new ReadMetricsDashboardModal();

// Expor globalmente
if (typeof window !== 'undefined') {
  window.readMetricsDashboardModal = readMetricsDashboardModal;

  // Atalho para abrir via console
  window.openReadMetrics = () => readMetricsDashboardModal.open();
}

export default readMetricsDashboardModal;
export { readMetricsDashboardModal };
