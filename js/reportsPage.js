/**
 * reportsPage.js
 * Controla a página "Relatórios" com filtros, gráficos e exportação.
 * Depende de reportsService (window.reportsService) e Chart.js já carregados.
 * @version 2.1.0 - Adicionado suporte a relatórios de WhatsApp
 */

(function () {
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const numberFmt = new Intl.NumberFormat('pt-BR');
  const DAY_MS = 24 * 60 * 60 * 1000;
  const ANALYST_RANKING_PAGE_SIZE = 2000;
  const APROVACOES_METRICS_CACHE_TTL = 2 * 60 * 1000;
  const APPROVAL_SCREEN_TABLE_LIMIT = 250;
  const ATENDIMENTOS_SCORE_WEIGHT = 2;
  const MIN_PROGRESS_BAR_PERCENT = 5;
  const CONVERSION_DATE_FIELD = 'dataEntrada';
  const ACTIVITY_REPORT_LIMIT = 5000;
  const ACTIVITY_QUERY_PAGE_SIZE = 250;

  // Cores consistentes para gráficos
  const CHART_COLORS = [
    '#0d6efd', '#198754', '#ffc107', '#dc3545', '#0dcaf0',
    '#0039BA', '#fd7e14', '#20c997', '#6c757d', '#d63384',
    '#17a2b8', '#28a745', '#d63384', '#007bff', '#002A8C'
  ];

  class ReportsPage {
    constructor() {
      this.pageId = 'relatorios';
      this.state = {
        activeSource: 'processos',
        sources: {
          processos: {
            source: 'processos',
            currentReport: null,
            currentFilters: null,
            dataset: [],
            lastUpdate: null,
            exportsEnabled: false
          },
          aprovacao: {
            source: 'aprovacao',
            currentReport: null,
            currentFilters: null,
            dataset: [],
            lastUpdate: null,
            exportsEnabled: false
          },
          whatsapp: {
            source: 'whatsapp',
            currentReport: null,
            currentFilters: null,
            dataset: [],
            lastUpdate: null,
            exportsEnabled: false
          },
          atividades: {
            source: 'atividades',
            currentReport: null,
            currentFilters: null,
            dataset: [],
            lastUpdate: null,
            exportsEnabled: false
          }
        },
        currentReport: null,
        currentFilters: null,
        contracts: [],
        aprovacoes: [],
        approvalFilters: null,
        approvalReport: null,
        approvalFilterCatalog: null,
        aprovacoesMetricsSnapshot: null,
        analystRankingPartial: false,
        analystRankingLimit: ANALYST_RANKING_PAGE_SIZE,
        conversionMetrics: null,
        conversionContractsCache: [],
        conversionContractsLoadedAt: 0,
        templates: [],
        isLoading: false,
        isAdmin: false,
        activityData: [],
        activityFiltered: [],
        activityPage: 1,
        activityPageSize: 20,
        activityCharts: { type: null, timeline: null },
        activityUsers: [],
      };
      this.charts = {
        status: null,
        month: null,
        empreendimento: null,
        aging: null,
        approvalSituacao: null,
      };
      this.initialized = false;
      this.statusMetadata = new Map();
      this.archivedStatusTexts = new Set();
      this.slaTargetsByStatus = new Map();
      this.analystProfilesByLookup = new Map();
      this.analystDirectoryPromise = null;
      this.customExportFields = [];
      this.customExportCsv = null;
      this.customExportInitialized = false;
      this.qaLoadToken = null;
      this.sectionMap = {
        geral: 'geral',
        status: 'status',
        vendedor: 'vendedor',
        empreendimento: 'empreendimento',
        'approval-situacao': 'approval-situacao',
        analistas: 'analistas',
        conversao: 'conversao',
        'approval-data': 'approval-data',
        periodo: 'periodo',
        sla: 'sla',
        funil: 'funil',
        aging: 'aging',
        pendencias: 'pendencias-report',
        'resumo-periodo': 'reports-month-table-body',
        whatsapp: 'whatsapp',
        atividades: 'activity-reports',
        exportar: 'exportar',
      };
      // Mapeamento de secao -> ID da aba Bootstrap
      this.sectionTabMap = {
        funil: { source: 'processos', processTab: 'process-tab-visao-geral' },
        status: { source: 'processos', processTab: 'process-tab-visao-geral' },
        periodo: { source: 'processos', processTab: 'process-tab-visao-geral' },
        vendedor: { source: 'processos', processTab: 'process-tab-desempenho' },
        empreendimento: { source: 'processos', processTab: 'process-tab-desempenho' },
        sla: { source: 'processos', processTab: 'process-tab-prazos' },
        aging: { source: 'processos', processTab: 'process-tab-prazos' },
        pendencias: { source: 'processos', processTab: 'process-tab-prazos' },
        'resumo-periodo': { source: 'processos', processTab: 'process-tab-resumo-periodo' },
        exportar: { source: 'processos', processTab: 'process-tab-exportar' },
        'approval-situacao': { source: 'aprovacao', processTab: 'process-tab-desempenho' },
        analistas: { source: 'aprovacao', processTab: 'process-tab-desempenho' },
        conversao: { source: 'aprovacao', processTab: 'process-tab-desempenho' },
        'approval-data': { source: 'aprovacao', processTab: 'process-tab-desempenho' },
        whatsapp: { source: 'whatsapp', processTab: 'process-tab-whatsapp' },
        atividades: { source: 'atividades', processTab: 'process-tab-atividades' },
      };
      this.whatsappCharts = {
        department: null,
        timeline: null,
      };
      this.qaCharts = {
        setor: null,
        origem: null,
      };
      this.buttonLabels = {
        processos: '<i class="bi bi-play-fill me-1"></i>Gerar Relatório',
        aprovacao: '<i class="bi bi-play-fill me-1"></i>Gerar Relatório',
        atividades: '<i class="bi bi-play-fill me-1"></i>Gerar Relatório'
      };
      this.aprovacoesDeltaUnsubscribe = null;
      this.aprovacoesDeltaTimer = null;

      this.registerGlobalEvents();
      document.addEventListener('DOMContentLoaded', () => {
        if (window.__REPORTS_AUTO_SHOW__ === false) {
          return;
        }
        if (document.getElementById('page-relatorios')?.classList.contains('active')) {
          this.show();
        }
      });
    }

    registerGlobalEvents() {
      window.addEventListener('pagechange', (evt) => {
        if (evt.detail?.page === this.pageId) {
          this.show(evt.detail?.section);
        }
      });

      window.addEventListener('submenu-navigate', (evt) => {
        const { page, section } = evt.detail || {};
        if (page === this.pageId) {
          this.show(section);
        }
      });
    }

    async show(section) {
      try {
        await this.init();
        if (!this.state.sources.processos.currentReport) {
          await this.generateReport();
        }
        this.syncSourcePanels();
        if (section) this.scrollToSection(section);
      } catch (error) {
        this.handleError(error, 'Erro ao carregar relatórios');
      }
    }

    isCurrentUserAdmin() {
      const role = String(window.appState?.userPermissions?.role || '').toLowerCase();
      return role === 'admin' || role === 'super_admin';
    }

    hasCachedContracts() {
      if (!window.cacheService || typeof window.cacheService.getSync !== 'function') {
        return false;
      }
      const cached =
        window.cacheService.getSync('reports_contracts_all', 'contractsAll') ||
        window.cacheService.getSync('contracts_all_with_archived', 'contractsAll') ||
        window.cacheService.getSync('contracts_all_active', 'contractsAll');
      return Array.isArray(cached) && cached.length > 0;
    }

    async init() {
      if (this.initialized) return;

      this.state.isAdmin = this.isCurrentUserAdmin();

      this.elements = {
        page: document.getElementById('page-relatorios'),
        processFilterPanel: document.getElementById('geral'),
        approvalFilterPanel: document.getElementById('reports-approval-filters'),
        processChrome: document.getElementById('reports-process-chrome'),
        form: document.getElementById('reports-filter-form'),
        template: document.getElementById('reports-template-select'),
        dateStart: document.getElementById('reports-date-start'),
        dateEnd: document.getElementById('reports-date-end'),
        dateField: document.getElementById('reports-date-field'),
        statusSelect: document.getElementById('reports-status-select'),
        vendorSelect: document.getElementById('reports-vendor-select'),
        empreendimentoSelect: document.getElementById('reports-empreendimento-select'),
        analystSelect: document.getElementById('reports-analyst-select'),
        searchInput: document.getElementById('reports-search-input'),
        minValue: document.getElementById('reports-min-value'),
        maxValue: document.getElementById('reports-max-value'),
        workflowSelect: document.getElementById('reports-workflow-select'),
        statusCount: document.getElementById('reports-status-count'),
        vendorCount: document.getElementById('reports-vendor-count'),
        empreendimentoCount: document.getElementById('reports-empreendimento-count'),
        analystCount: document.getElementById('reports-analyst-count'),
        activeFilters: document.getElementById('reports-active-filters'),
        activeFiltersList: document.getElementById('reports-active-filters-list'),
        rangeButtons: Array.from(document.querySelectorAll('#reports-filter-form .reports-range-btn')),
        refreshBtn: document.getElementById('reports-refresh-btn'),
        exportBtn: document.getElementById('reports-export-btn'),
        exportDropdown: document.getElementById('reports-export-dropdown'),
        exportCurrentBtn: document.getElementById('reports-export-current'),
        exportPrintBtn: document.getElementById('reports-export-print'),
        exportTableCsv: document.getElementById('reports-export-table-csv'),
        exportTablePrint: document.getElementById('reports-export-table-print'),
        clearBtn: document.getElementById('reports-clear-btn'),
        runBtn: document.querySelector('#reports-filter-form button[type="submit"]'),
        lastUpdate: document.getElementById('reports-last-update'),
        emptyState: document.getElementById('reports-empty-state'),
        tabs: document.getElementById('reports-tabs'),
        processTabs: document.getElementById('reports-process-tabs'),
        tabContent: document.getElementById('reports-process-tab-content'),
        sourceTabProcessos: document.getElementById('tab-processos'),
        sourceTabAprovacao: document.getElementById('tab-aprovacao'),
        sourceTabWhatsapp: document.getElementById('tab-whatsapp-source'),
        sourceTabAtividades: document.getElementById('tab-atividades'),
        // Status
        statusTotal: document.getElementById('reports-status-total'),
        statusTableBody: document.getElementById('reports-status-table-body'),
        statusChart: document.getElementById('reports-status-chart'),
        // Vendor
        vendorTableBody: document.getElementById('reports-vendor-table-body'),
        vendorTotal: document.getElementById('reports-vendor-total'),
        analystTotal: document.getElementById('reports-analyst-total'),
        analystPodium: document.getElementById('reports-analyst-podium'),
        analystTableBody: document.getElementById('reports-analyst-table-body'),
        // Conversion
        conversionRate: document.getElementById('reports-conversion-rate'),
        conversionTotal: document.getElementById('reports-conversion-total'),
        conversionConverted: document.getElementById('reports-conversion-converted'),
        conversionPending: document.getElementById('reports-conversion-pending'),
        conversionByOrigin: document.getElementById('reports-conversion-by-origin'),
        conversionByCpf: document.getElementById('reports-conversion-by-cpf'),
        conversionWarning: document.getElementById('reports-conversion-warning'),
        conversionBase: document.getElementById('reports-conversion-base'),
        // Monthly
        monthChart: document.getElementById('reports-month-chart'),
        monthTableBody: document.getElementById('reports-month-table-body'),
        // SLA
        slaLeadtime: document.getElementById('reports-sla-leadtime'),
        slaOnTrack: document.getElementById('reports-sla-ontrack'),
        slaLate: document.getElementById('reports-sla-late'),
        slaSamples: document.getElementById('reports-sla-samples'),
        // Table
        resultsTableHead: document.getElementById('reports-results-thead'),
        resultsTableBody: document.getElementById('reports-results-tbody'),
        reportFieldsContainer: document.getElementById('report-fields-container'),
        reportSelectAllBtn: document.getElementById('report-select-all-btn'),
        reportClearAllBtn: document.getElementById('report-clear-all-btn'),
        customExportGenerateBtn: document.getElementById('generate-report-btn'),
        customExportStatus: document.getElementById('report-status'),
        // Funnel
        funnelContainer: document.getElementById('reports-funnel-container'),
        funnelTotal: document.getElementById('reports-funnel-total'),
        // Empreendimento
        empreendimentoChart: document.getElementById('reports-empreendimento-chart'),
        empreendimentoTableBody: document.getElementById('reports-empreendimento-table-body'),
        empreendimentoTotal: document.getElementById('reports-empreendimento-total'),
        // Aging
        agingChart: document.getElementById('reports-aging-chart'),
        agingTableBody: document.getElementById('reports-aging-table-body'),
        agingTotal: document.getElementById('reports-aging-total'),
        // Pendencias
        pendenciasTotal: document.getElementById('reports-pendencias-total'),
        pendenciasUrgent: document.getElementById('reports-pendencias-urgent'),
        pendenciasHigh: document.getElementById('reports-pendencias-high'),
        pendenciasNormal: document.getElementById('reports-pendencias-normal'),
        pendenciasOverdue: document.getElementById('reports-pendencias-overdue'),
        pendenciasTableBody: document.getElementById('reports-pendencias-table-body'),
        // WhatsApp
        whatsappSection: document.getElementById('whatsapp-reports'),
        whatsappForm: document.getElementById('reports-whatsapp-filter-form'),
        whatsappDateStart: document.getElementById('wa-reports-date-start') || document.getElementById('wa-report-start'),
        whatsappDateEnd: document.getElementById('wa-reports-date-end') || document.getElementById('wa-report-end'),
        whatsappReportType: document.getElementById('wa-reports-type') || document.getElementById('wa-report-type'),
        whatsappGenerateBtn: document.getElementById('wa-generate-reports-btn') || document.getElementById('wa-generate-report-btn'),
        whatsappTotalChats: document.getElementById('wa-total-chats'),
        whatsappResolved: document.getElementById('wa-resolved-chats'),
        whatsappAvgResponse: document.getElementById('wa-avg-response'),
        whatsappSatisfaction: document.getElementById('wa-satisfaction') || document.getElementById('wa-avg-satisfaction'),
        whatsappDepartmentChart: document.getElementById('wa-department-chart'),
        whatsappTimelineChart: document.getElementById('wa-timeline-chart'),
        whatsappAgentsTableBody: document.getElementById('wa-agents-tbody') || document.getElementById('wa-agents-table-body'),
        whatsappStatusTableBody: document.getElementById('wa-status-tbody') || document.getElementById('wa-status-table-body'),
        // Atividades
        activityFilterPanel: document.getElementById('reports-activity-filters'),
        activityForm: document.getElementById('reports-activity-filter-form'),
        activityActionType: document.getElementById('reports-activity-action-type'),
        activityUser: document.getElementById('reports-activity-user'),
        activityDateStart: document.getElementById('reports-activity-date-start'),
        activityDateEnd: document.getElementById('reports-activity-date-end'),
        activitySearch: document.getElementById('reports-activity-search'),
        activityGenerateBtn: document.getElementById('reports-activity-generate-btn'),
        activityClearBtn: document.getElementById('reports-activity-clear-btn'),
        activityExportBtn: document.getElementById('reports-activity-export-btn'),
        activityActiveFilters: document.getElementById('reports-activity-active-filters'),
        activityActiveFiltersList: document.getElementById('reports-activity-active-filters-list'),
        activityTotalBadge: document.getElementById('reports-activity-total-badge'),
        activityTotalCount: document.getElementById('activity-total-count'),
        activityActiveUsers: document.getElementById('activity-active-users'),
        activityPeriod: document.getElementById('activity-period'),
        activityAvgPerDay: document.getElementById('activity-avg-per-day'),
        activityTypeChart: document.getElementById('activity-type-chart'),
        activityTimelineChart: document.getElementById('activity-timeline-chart'),
        activityTableBody: document.getElementById('activity-table-body'),
        activityTableTotal: document.getElementById('activity-table-total'),
        activityPrevPage: document.getElementById('activity-prev-page'),
        activityNextPage: document.getElementById('activity-next-page'),
        activityPageInfo: document.getElementById('activity-page-info'),
        // Approval filters
        approvalForm: document.getElementById('reports-approval-filter-form'),
        approvalDateField: document.getElementById('reports-approval-date-field'),
        approvalDateStart: document.getElementById('reports-approval-date-start'),
        approvalDateEnd: document.getElementById('reports-approval-date-end'),
        approvalStatusSelect: document.getElementById('reports-approval-status-select'),
        approvalAnalystSelect: document.getElementById('reports-approval-analyst-select'),
        approvalConstrutoraSelect: document.getElementById('reports-approval-construtora-select'),
        approvalEmpreendimentoSelect: document.getElementById('reports-approval-empreendimento-select'),
        approvalConvertedSelect: document.getElementById('reports-approval-converted-select'),
        approvalSearchInput: document.getElementById('reports-approval-search'),
        approvalStatusCount: document.getElementById('reports-approval-status-count'),
        approvalConstrutoraCount: document.getElementById('reports-approval-construtora-count'),
        approvalEmpreendimentoCount: document.getElementById('reports-approval-empreendimento-count'),
        approvalActiveFilters: document.getElementById('reports-approval-active-filters'),
        approvalActiveFiltersList: document.getElementById('reports-approval-active-filters-list'),
        approvalGenerateBtn: document.getElementById('reports-approval-generate-btn'),
        approvalClearBtn: document.getElementById('reports-approval-clear-btn'),
        approvalEmptyState: document.getElementById('reports-approval-empty-state'),
        approvalSummarySection: document.getElementById('reports-approval-summary'),
        approvalTotal: document.getElementById('reports-approval-total'),
        approvalApproved: document.getElementById('reports-approval-approved'),
        approvalRejected: document.getElementById('reports-approval-rejected'),
        approvalConditioned: document.getElementById('reports-approval-conditioned'),
        approvalPendingConversion: document.getElementById('reports-approval-pending-conversion'),
        approvalConversionRate: document.getElementById('reports-approval-conversion-rate'),
        approvalHealth: document.getElementById('reports-approval-health'),
        approvalSituacaoChart: document.getElementById('reports-approval-situacao-chart'),
        approvalSituacaoTotal: document.getElementById('reports-approval-situacao-total'),
        approvalSituacaoList: document.getElementById('reports-approval-situacao-list'),
        approvalResultsHead: document.getElementById('reports-approval-results-thead'),
        approvalResultsBody: document.getElementById('reports-approval-results-tbody'),
        approvalExportCsv: document.getElementById('reports-approval-export-csv'),
        approvalExportPrint: document.getElementById('reports-approval-export-print'),
        approvalOnlySections: Array.from(document.querySelectorAll('.reports-approval-only')),
        processOnlySections: Array.from(document.querySelectorAll('.reports-process-only')),
      };

      if (!this.state.isAdmin) {
        this.elements.sourceTabAtividades?.classList.add('d-none');
        this.elements.activityFilterPanel?.classList.add('d-none');
        document.getElementById('process-tab-atividades')?.classList.add('d-none');
        document.getElementById('activity-reports')?.classList.add('d-none');
        if (this.state.activeSource === 'atividades') {
          this.state.activeSource = 'processos';
        }
      }

      this.prefillDates();
      await this.populateTemplates();
      await this.populateStatusOptions();
      await this.loadSlaTargets();
      this.prefillFilterOptionsFromCache();
      this.mountSourceToolbars();
      this.applyOrthographyFixes();
      this.bindEvents();
      this.bindTabEvents();
      this.bindFilterAssistants();
      this.bindApprovalFilterEvents();
      await this.initCustomExport();
      this.updateFilterSelectionCounters();
      this.renderActiveFilters();
      this.updateApprovalFilterSelectionCounters();
      this.renderApprovalActiveFilters();
      this.renderConversionMetrics(null);
      this.ensureApprovalTableHeaders();
      this.syncSourcePanels();
      await this.setupAprovacoesDeltaListener();

      if (this.elements.runBtn) {
        this.buttonLabels.processos = this.elements.runBtn.innerHTML;
      }
      if (this.elements.approvalGenerateBtn) {
        this.buttonLabels.aprovacao = this.elements.approvalGenerateBtn.innerHTML;
      }

      this.initialized = true;
      window.debug && window.debug(' ReportsPage inicializado');
    }

    mountSourceToolbars() {
      const approvalAnchor = this.elements.approvalEmptyState || this.elements.approvalSummarySection;
      if (this.elements.approvalFilterPanel && approvalAnchor?.parentNode) {
        approvalAnchor.parentNode.insertBefore(this.elements.approvalFilterPanel, approvalAnchor);
      }
    }

    applyOrthographyFixes() {
      const setHtml = (selector, html) => {
        const element = document.querySelector(selector);
        if (element) element.innerHTML = html;
      };
      const setText = (selector, text) => {
        const element = document.querySelector(selector);
        if (element) element.textContent = text;
      };

      setHtml('#tab-aprovacao', '<i class="bi bi-shield-check me-1 d-none d-md-inline"></i>Aprovação');
      setHtml('#process-tab-desempenho', '<i class="bi bi-briefcase me-1 d-none d-md-inline"></i>Operação');
      setHtml('#reports-approval-filters .card-header h5', '<i class="bi bi-shield-check me-2"></i>Filtros de Aprovação');
      setText('label[for="reports-approval-date-start"]', 'Data Início');
      setText('label[for="reports-approval-date-end"]', 'Data Fim');
      setText('label[for="reports-approval-converted-select"]', 'Conversão');
      setText('#reports-approval-converted-select option[value="false"]', 'Não convertidas');
      setText('label[for="reports-approval-status-select"] span:first-child', 'Situação');
      setText('label[for="reports-approval-analyst-select"]', 'Analista de Aprovação');
      setText('label[for="reports-approval-construtora-select"] span:first-child', 'Construtora');
      setText('label[for="reports-approval-empreendimento-select"] span:first-child', 'Empreendimento');
      setHtml('#reports-approval-generate-btn', '<i class="bi bi-play-fill me-1"></i>Gerar Relatório');
      setText('#reports-approval-empty-state h4', 'Nenhuma aprovação encontrada');
      setText('#reports-approval-empty-state p', 'Ajuste os filtros desta aba para carregar as análises de crédito.');

      if (this.elements.approvalTotal?.previousElementSibling) {
        this.elements.approvalTotal.previousElementSibling.textContent = 'Total de Análises';
      }
      if (this.elements.approvalPendingConversion?.previousElementSibling) {
        this.elements.approvalPendingConversion.previousElementSibling.textContent = 'Pendentes Conversão';
      }
      if (this.elements.approvalConversionRate?.previousElementSibling) {
        this.elements.approvalConversionRate.previousElementSibling.textContent = 'Taxa Conversão';
      }

      setHtml('#approval-situacao .card-header h5', '<i class="bi bi-pie-chart me-2"></i>Distribuição por Situação');
      setHtml('#analistas .card-header h5', '<i class="bi bi-trophy me-2"></i>Ranking de Analistas de Aprovação');
      setHtml('#conversao .card-header h5', '<i class="bi bi-diagram-3 me-2"></i>Taxa de Conversão Aprovação x Processo');
      setHtml('#approval-data .card-header h5', '<i class="bi bi-table me-2"></i>Dados Detalhados de Aprovação');
      setHtml('#analistas thead', '<tr><th>Analista</th><th class="text-end">Total</th><th class="text-end">Aprovadas</th><th class="text-end">Reprovadas</th><th class="text-end">Condicionadas</th><th class="text-end">% Aprovação</th><th class="text-end">Pendentes Conversão</th></tr>');

      if (this.elements.approvalExportCsv) {
        this.elements.approvalExportCsv.title = 'Exportar aprovações como CSV';
      }
      if (this.elements.approvalExportPrint) {
        this.elements.approvalExportPrint.title = 'Imprimir aprovações';
      }

      const approvalHead = this.elements.approvalResultsHead;
      if (approvalHead && approvalHead.innerHTML.trim() === '') {
        approvalHead.innerHTML = '<tr><th>Cliente</th><th>CPF</th><th>Situação</th><th>Analista de Aprovação</th><th>Construtora</th><th>Empreendimento</th><th>Data de Aprovação</th><th>Convertida</th></tr>';
      }
      const approvalPlaceholder = this.elements.approvalResultsBody?.querySelector('td');
      if (approvalPlaceholder && /Selecione os filtros da aba/i.test(approvalPlaceholder.textContent || '')) {
        approvalPlaceholder.textContent = 'Selecione os filtros da aba Aprovação para visualizar os dados.';
      }
    }

    normalizeApprovalRenderedText() {
      if (this.elements.approvalSituacaoTotal) {
        this.elements.approvalSituacaoTotal.textContent = this.elements.approvalSituacaoTotal.textContent.replace(/an.+lises/i, 'análises');
      }

      const podiumTitles = Array.from(this.elements.analystPodium?.querySelectorAll('.small.text-muted') || []);
      ['1º lugar', '2º lugar', '3º lugar'].forEach((title, index) => {
        if (podiumTitles[index]) {
          podiumTitles[index].textContent = title;
        }
      });

      Array.from(this.elements.analystPodium?.querySelectorAll('.fw-bold.mt-1') || []).forEach((element) => {
        const parts = String(element.textContent || '').split(':');
        const suffix = parts.length > 1 ? parts.slice(1).join(':').trim() : '';
        element.textContent = suffix ? `Pendentes conversão: ${suffix}` : 'Pendentes conversão: 0';
      });
    }

    async setupAprovacoesDeltaListener() {
      if (this.aprovacoesDeltaUnsubscribe || !window.aprovacaoService?.listenForAprovacoesDelta) {
        return;
      }

      this.aprovacoesDeltaUnsubscribe = await window.aprovacaoService.listenForAprovacoesDelta(({ updates }) => {
        if (!Array.isArray(updates) || updates.length === 0) return;
        if (!this.elements?.page?.classList.contains('active')) return;

        if (this.aprovacoesDeltaTimer) {
          clearTimeout(this.aprovacoesDeltaTimer);
        }

        this.aprovacoesDeltaTimer = setTimeout(async () => {
          try {
            window.aprovacaoService?.invalidateCache?.();
            this.state.aprovacoesMetricsSnapshot = null;
            this.state.approvalFilterCatalog = null;

            if (this.state.sources.aprovacao.currentReport || this.state.activeSource === 'aprovacao') {
              await this.generateApprovalReport(true);
            }
          } catch (error) {
            console.warn('[ReportsPage] Falha ao aplicar atualização delta de aprovações:', error);
          }
        }, 800);
      });
    }

    bindTabEvents() {
      const handleSourceClick = async (evt) => {
        const button = evt.target.closest('[data-report-source]');
        if (!button) return;

        evt.preventDefault();
        const source = button.dataset.reportSource;
        await this.activateSource(source);
      };

      this.elements.tabs?.addEventListener('click', handleSourceClick);
      [
        this.elements.sourceTabProcessos,
        this.elements.sourceTabAprovacao,
        this.elements.sourceTabWhatsapp,
        this.elements.sourceTabAtividades
      ].forEach((button) => {
        button?.addEventListener('click', handleSourceClick);
      });

      this.elements.processTabs?.addEventListener('shown.bs.tab', (evt) => {
        const targetPane = evt.target.getAttribute('data-bs-target');
        const paneId = String(targetPane || '').replace('#', '');
        const tabChartMap = {
          'tabpane-visao-geral': ['status', 'month'],
          'tabpane-desempenho': ['empreendimento', 'approvalSituacao'],
          'tabpane-prazos': ['aging'],
          'tabpane-resumo-periodo': [],
          'tabpane-whatsapp': [],
          'tabpane-atividades': []
        };
        const chartKeys = tabChartMap[paneId] || [];

        chartKeys.forEach((key) => {
          this.charts[key]?.resize?.();
        });

        if (paneId === 'tabpane-whatsapp') {
          this.whatsappCharts.department?.resize?.();
          this.whatsappCharts.timeline?.resize?.();
        }
        if (paneId === 'tabpane-atividades') {
          this.state.activityCharts.type?.resize?.();
          this.state.activityCharts.timeline?.resize?.();
        }
      });
    }

    bindEvents() {
      // Submit do formulário
      if (this.elements.form) {
        this.elements.form.addEventListener('submit', (evt) => {
          evt.preventDefault();
          this.generateReport();
        });
      }

      // Botão limpar filtros
      this.elements.clearBtn?.addEventListener('click', () => {
        this.resetFilters();
      });

      // Botão atualizar
      this.elements.refreshBtn?.addEventListener('click', () => {
        if (this.state.activeSource === 'aprovacao') {
          this.generateApprovalReport(true);
          return;
        }
        if (this.state.activeSource === 'whatsapp') {
          this.generateWhatsappReport();
          return;
        }
        if (this.state.activeSource === 'atividades') {
          this.generateActivityReport();
          return;
        }
        this.generateReport(true);
      });

      // Exportação principal
      this.elements.exportBtn?.addEventListener('click', () => {
        this.exportCurrent('csv');
      });

      this.elements.exportCurrentBtn?.addEventListener('click', () => {
        this.exportCurrent('csv');
      });

      this.elements.exportPrintBtn?.addEventListener('click', () => {
        this.exportCurrent('print');
      });

      // Exportação da tabela detalhada
      this.elements.exportTableCsv?.addEventListener('click', () => {
        this.exportCurrent('csv');
      });

      this.elements.exportTablePrint?.addEventListener('click', () => {
        this.exportCurrent('print');
      });

      this.elements.approvalExportCsv?.addEventListener('click', () => {
        this.exportCurrent('csv');
      });

      this.elements.approvalExportPrint?.addEventListener('click', () => {
        this.exportCurrent('print');
      });

      // Atualizar vendedores ao mudar status (para pré-filtrar se necessário)
      this.elements.statusSelect?.addEventListener('change', () => {
        // Opcional: reagir a mudanças nos filtros
      });

      // WhatsApp Reports
      this.elements.whatsappGenerateBtn?.addEventListener('click', () => {
        this.generateWhatsappReport();
      });

      this.elements.whatsappForm?.addEventListener('submit', (evt) => {
        evt.preventDefault();
        this.generateWhatsappReport();
      });

      // Atividades Reports
      this.elements.activityForm?.addEventListener('submit', (evt) => {
        evt.preventDefault();
        this.generateActivityReport();
      });

      this.elements.activityGenerateBtn?.addEventListener('click', () => {
        this.generateActivityReport();
      });

      this.elements.activityClearBtn?.addEventListener('click', () => {
        this.resetActivityFilters();
      });

      this.elements.activityExportBtn?.addEventListener('click', () => {
        this.exportActivityReport();
      });

      this.elements.activityPrevPage?.addEventListener('click', () => {
        if (this.state.activityPage > 1) {
          this.state.activityPage--;
          this.renderActivityTable();
        }
      });

      this.elements.activityNextPage?.addEventListener('click', () => {
        const maxPage = Math.ceil(this.state.activityFiltered.length / this.state.activityPageSize);
        if (this.state.activityPage < maxPage) {
          this.state.activityPage++;
          this.renderActivityTable();
        }
      });

      this.elements.activityActionType?.addEventListener('change', () => {
        this.renderActivityActiveFilters();
      });
      this.elements.activityUser?.addEventListener('change', () => {
        this.renderActivityActiveFilters();
      });
      this.elements.activityDateStart?.addEventListener('change', () => {
        this.renderActivityActiveFilters();
      });
      this.elements.activityDateEnd?.addEventListener('change', () => {
        this.renderActivityActiveFilters();
      });
      this.elements.activitySearch?.addEventListener('input', () => {
        this.renderActivityActiveFilters();
      });

      this.elements.activityTableBody?.addEventListener('click', async (evt) => {
        const button = evt.target.closest('.activity-audit-download-btn');
        if (!button) return;
        evt.preventDefault();
        const storagePath = button.dataset.storagePath;
        const fileName = button.dataset.filename || '';

        try {
          const service = await this.ensureActivityLogService();
          if (!service?.downloadAuditFile || !storagePath) {
            throw new Error('Arquivo auditado indisponivel.');
          }
          await service.downloadAuditFile(storagePath, fileName);
        } catch (error) {
          this.handleError(error, 'Erro ao baixar arquivo auditado');
        }
      });
    }

    bindFilterAssistants() {
      this.elements.rangeButtons?.forEach((btn) => {
        btn.addEventListener('click', () => {
          this.applyQuickRange(btn.dataset.range || '');
          this.renderActiveFilters();
        });
      });

      const filterElements = [
        this.elements.statusSelect,
        this.elements.vendorSelect,
        this.elements.empreendimentoSelect,
        this.elements.analystSelect,
        this.elements.dateStart,
        this.elements.dateEnd,
        this.elements.dateField,
        this.elements.minValue,
        this.elements.maxValue,
        this.elements.searchInput,
        this.elements.workflowSelect,
      ];

      filterElements.forEach((element) => {
        element?.addEventListener('change', () => {
          if (element === this.elements.dateStart || element === this.elements.dateEnd) {
            this.highlightRangeButtons(null);
          }
          this.updateFilterSelectionCounters();
          this.renderActiveFilters();
        });
      });

      this.elements.searchInput?.addEventListener('input', () => {
        this.renderActiveFilters();
      });

      this.elements.form?.addEventListener('keydown', (evt) => {
        if ((evt.ctrlKey || evt.metaKey) && evt.key === 'Enter') {
          evt.preventDefault();
          this.generateReport();
        }
      });

      this.elements.activeFiltersList?.addEventListener('click', async (evt) => {
        const button = evt.target.closest('.reports-filter-chip');
        if (!button) return;
        this.clearFilterByChip(button.dataset.filterKey, button.dataset.filterValue);
        this.updateFilterSelectionCounters();
        this.renderActiveFilters();
        await this.generateReport();
      });
    }

    async loadApprovalAdapter() {
      if (window.reportsApprovalAdapter) {
        return window.reportsApprovalAdapter;
      }

      if (!this._approvalAdapterPromise) {
        this._approvalAdapterPromise = import('./reportsApprovalAdapter.js')
          .then((mod) => mod?.default || window.reportsApprovalAdapter || null)
          .catch((error) => {
            console.warn('[ReportsPage] Nao foi possivel carregar reportsApprovalAdapter:', error);
            return null;
          });
      }

      return this._approvalAdapterPromise;
    }

    async activateSource(source) {
      const normalizedSource = ['processos', 'aprovacao', 'whatsapp', 'atividades'].includes(source)
        ? source
        : 'processos';

      if (normalizedSource === 'atividades' && !this.state.isAdmin) {
        this.state.activeSource = 'processos';
        this.syncSourcePanels();
        return;
      }

      this.state.activeSource = normalizedSource;
      this.syncSourcePanels();

      if (normalizedSource === 'processos') {
        const activeProcessTab = this.elements.processTabs?.querySelector('.nav-link.active');
        if (!activeProcessTab) {
          this.showProcessTab('process-tab-visao-geral');
        }
        if (!this.state.sources.processos.currentReport) {
          await this.generateReport();
        }
      }

      if (normalizedSource === 'aprovacao') {
        this.showProcessTab('process-tab-desempenho');
        await Promise.all([
          this.loadApprovalAnalystDirectory(),
          this.populateApprovalFilterOptions()
        ]);
        if (!this.state.sources.aprovacao.currentReport) {
          await this.generateApprovalReport();
        }
      }

      if (normalizedSource === 'whatsapp') {
        this.showProcessTab('process-tab-whatsapp');
      }

      if (normalizedSource === 'atividades') {
        this.showProcessTab('process-tab-atividades');
      }

      this.updateTopLevelExportState();

      if (normalizedSource === 'whatsapp') {
        this.whatsappCharts.department?.resize?.();
        this.whatsappCharts.timeline?.resize?.();
      }
      if (normalizedSource === 'atividades') {
        this.state.activityCharts.type?.resize?.();
        this.state.activityCharts.timeline?.resize?.();
      }
    }

    showProcessTab(tabId) {
      const tabEl = document.getElementById(tabId);
      if (!tabEl) return;
      const bootstrapTab = new bootstrap.Tab(tabEl);
      bootstrapTab.show();
    }

    syncSourcePanels() {
      const source = this.state.activeSource || 'processos';
      const isProcessos = source === 'processos';
      const isAprovacao = source === 'aprovacao';
      const isWhatsapp = source === 'whatsapp';
      const isAtividades = this.state.isAdmin && source === 'atividades';

      const toggle = (element, visible) => {
        element?.classList.toggle('d-none', !visible);
      };

      [
        this.elements.sourceTabProcessos,
        this.elements.sourceTabAprovacao,
        this.elements.sourceTabWhatsapp,
        this.elements.sourceTabAtividades
      ].forEach((button) => {
        if (!button) return;
        const buttonSource = button.dataset.reportSource;
        const active = buttonSource === source;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      toggle(this.elements.processFilterPanel, isProcessos);
      toggle(this.elements.activityFilterPanel, isAtividades);
      toggle(this.elements.processChrome, isProcessos || isAtividades);
      toggle(this.elements.processTabs, isProcessos);
      toggle(this.elements.approvalFilterPanel, isAprovacao);

      (this.elements.processOnlySections || []).forEach((section) => {
        section.classList.toggle('d-none', !isProcessos);
      });
      (this.elements.approvalOnlySections || []).forEach((section) => {
        section.classList.toggle('d-none', !isAprovacao);
      });

      if (isProcessos) {
        const currentPane = this.elements.tabContent?.querySelector('.tab-pane.active');
        if (!currentPane || ['tabpane-whatsapp', 'tabpane-atividades'].includes(currentPane.id)) {
          this.showProcessTab('process-tab-visao-geral');
        }
      }

      if (isAprovacao) {
        this.showProcessTab('process-tab-desempenho');
      }

      if (isWhatsapp) {
        this.showProcessTab('process-tab-whatsapp');
      }

      if (isAtividades) {
        this.showProcessTab('process-tab-atividades');
      }

      this.updateSourceLastUpdateLabel();
    }

    updateSourceLastUpdateLabel() {
      if (!this.elements.lastUpdate) return;

      const sourceState = this.state.sources[this.state.activeSource] || null;
      if (!sourceState?.lastUpdate) {
        this.elements.lastUpdate.textContent = '';
        return;
      }

      this.elements.lastUpdate.textContent = `Atualizado em ${new Date(sourceState.lastUpdate).toLocaleString('pt-BR')}`;
    }

    async populateApprovalFilterOptions(forceRefresh = false) {
      if (this.state.approvalFilterCatalog && !forceRefresh) {
        this.applyApprovalFilterCatalog(this.state.approvalFilterCatalog);
        return;
      }

      const adapter = await this.loadApprovalAdapter();
      if (!adapter?.fetchFilterCatalog) {
        return;
      }

      const catalog = await adapter.fetchFilterCatalog(forceRefresh);
      this.state.approvalFilterCatalog = catalog;
      this.applyApprovalFilterCatalog(catalog);
    }

    normalizeAnalystLookupKey(value) {
      return String(value || '').trim().toLowerCase();
    }

    resolveAnalystProfileDisplayName(profile = null, fallback = '') {
      if (!profile || typeof profile !== 'object') {
        return String(fallback || '').trim() || '-';
      }

      return (
        String(profile.shortName || '').trim()
        || String(profile.fullName || '').trim()
        || String(profile.email || '').trim()
        || String(fallback || '').trim()
        || '-'
      );
    }

    registerAnalystProfileLookup(rawValue, profile = {}) {
      const key = this.normalizeAnalystLookupKey(rawValue);
      if (!key) return;
      this.analystProfilesByLookup.set(key, {
        uid: profile.uid || '',
        email: profile.email || '',
        fullName: profile.fullName || '',
        shortName: profile.shortName || ''
      });
    }

    async loadApprovalAnalystDirectory(forceRefresh = false) {
      if (this.analystProfilesByLookup.size > 0 && !forceRefresh) {
        return this.analystProfilesByLookup;
      }

      if (this.analystDirectoryPromise && !forceRefresh) {
        return this.analystDirectoryPromise;
      }

      this.analystDirectoryPromise = (async () => {
        try {
          const analysts = await window.firestoreService?.getAnalysts?.();
          const nextMap = new Map();

          (Array.isArray(analysts) ? analysts : []).forEach((profile) => {
            const normalizedProfile = {
              uid: String(profile?.uid || '').trim(),
              email: String(profile?.email || '').trim(),
              fullName: String(profile?.fullName || '').trim(),
              shortName: String(profile?.shortName || '').trim()
            };

            [
              normalizedProfile.uid,
              normalizedProfile.email,
              normalizedProfile.fullName,
              normalizedProfile.shortName
            ].forEach((lookupValue) => {
              const key = this.normalizeAnalystLookupKey(lookupValue);
              if (key) {
                nextMap.set(key, normalizedProfile);
              }
            });
          });

          this.analystProfilesByLookup = nextMap;
        } catch (error) {
          console.warn('[ReportsPage] Falha ao carregar diretório de analistas:', error);
        }

        return this.analystProfilesByLookup;
      })();

      try {
        return await this.analystDirectoryPromise;
      } finally {
        this.analystDirectoryPromise = null;
      }
    }

    formatApprovalAnalystDisplay(rawAnalyst, fallback = '-') {
      const normalizedRaw = String(rawAnalyst || '').trim();
      if (!normalizedRaw) return fallback;

      const profile = this.analystProfilesByLookup.get(this.normalizeAnalystLookupKey(normalizedRaw));
      if (!profile) return normalizedRaw;

      return this.resolveAnalystProfileDisplayName(profile, normalizedRaw);
    }

    applyApprovalFilterCatalog(catalog = {}) {
      const selectedSituacoes = new Set(Array.from(this.elements.approvalStatusSelect?.selectedOptions || []).map((option) => option.value));
      const selectedConstrutoras = new Set(Array.from(this.elements.approvalConstrutoraSelect?.selectedOptions || []).map((option) => option.value));
      const selectedEmpreendimentos = new Set(Array.from(this.elements.approvalEmpreendimentoSelect?.selectedOptions || []).map((option) => option.value));
      const selectedAnalyst = this.elements.approvalAnalystSelect?.value || '';
      const catalogAnalysts = Array.from(new Set(
        (Array.isArray(catalog.analysts) ? catalog.analysts : [])
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      ));

      if (selectedAnalyst && !catalogAnalysts.includes(selectedAnalyst)) {
        catalogAnalysts.unshift(selectedAnalyst);
      }

      if (this.elements.approvalStatusSelect) {
        this.elements.approvalStatusSelect.innerHTML = (catalog.situations || []).map((value) => (
          `<option value="${this.escapeHtml(value)}" ${selectedSituacoes.has(value) ? 'selected' : ''}>${this.escapeHtml(value)}</option>`
        )).join('');
      }

      if (this.elements.approvalAnalystSelect) {
        this.elements.approvalAnalystSelect.innerHTML = [
          '<option value="">Todos</option>',
          ...catalogAnalysts.map((value) => {
            const displayValue = this.formatApprovalAnalystDisplay(value, value);
            return `<option value="${this.escapeHtml(value)}" ${selectedAnalyst === value ? 'selected' : ''}>${this.escapeHtml(displayValue)}</option>`;
          })
        ].join('');
      }

      if (this.elements.approvalConstrutoraSelect) {
        this.elements.approvalConstrutoraSelect.innerHTML = (catalog.construtoras || []).map((value) => (
          `<option value="${this.escapeHtml(value)}" ${selectedConstrutoras.has(value) ? 'selected' : ''}>${this.escapeHtml(value)}</option>`
        )).join('');
      }

      if (this.elements.approvalEmpreendimentoSelect) {
        this.elements.approvalEmpreendimentoSelect.innerHTML = (catalog.empreendimentos || []).map((value) => (
          `<option value="${this.escapeHtml(value)}" ${selectedEmpreendimentos.has(value) ? 'selected' : ''}>${this.escapeHtml(value)}</option>`
        )).join('');
      }
    }

    bindApprovalFilterEvents() {
      this.elements.approvalForm?.addEventListener('submit', (evt) => {
        evt.preventDefault();
        this.generateApprovalReport();
      });

      this.elements.approvalClearBtn?.addEventListener('click', () => {
        this.resetApprovalFilters();
      });

      const filterElements = [
        this.elements.approvalDateField,
        this.elements.approvalDateStart,
        this.elements.approvalDateEnd,
        this.elements.approvalStatusSelect,
        this.elements.approvalAnalystSelect,
        this.elements.approvalConstrutoraSelect,
        this.elements.approvalEmpreendimentoSelect,
        this.elements.approvalConvertedSelect
      ];

      filterElements.forEach((element) => {
        element?.addEventListener('change', () => {
          this.updateApprovalFilterSelectionCounters();
          this.renderApprovalActiveFilters();
        });
      });

      this.elements.approvalSearchInput?.addEventListener('input', () => {
        this.renderApprovalActiveFilters();
      });

      this.elements.approvalForm?.addEventListener('keydown', (evt) => {
        if ((evt.ctrlKey || evt.metaKey) && evt.key === 'Enter') {
          evt.preventDefault();
          this.generateApprovalReport();
        }
      });

      this.elements.approvalActiveFiltersList?.addEventListener('click', async (evt) => {
        const button = evt.target.closest('.reports-filter-chip');
        if (!button) return;
        this.clearApprovalFilterByChip(button.dataset.filterKey, button.dataset.filterValue);
        this.updateApprovalFilterSelectionCounters();
        this.renderApprovalActiveFilters();
        await this.generateApprovalReport();
      });
    }

    getApprovalFilters() {
      const parseBooleanFilter = (value) => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return null;
      };

      return {
        situacao: Array.from(this.elements.approvalStatusSelect?.selectedOptions || []).map((option) => option.value),
        analistaAprovacao: this.elements.approvalAnalystSelect?.value || '',
        construtoras: Array.from(this.elements.approvalConstrutoraSelect?.selectedOptions || []).map((option) => option.value),
        empreendimentos: Array.from(this.elements.approvalEmpreendimentoSelect?.selectedOptions || []).map((option) => option.value),
        convertidoParaProcesso: parseBooleanFilter(this.elements.approvalConvertedSelect?.value || ''),
        dataInicio: this.elements.approvalDateStart?.value || null,
        dataFim: this.elements.approvalDateEnd?.value || null,
        campoData: this.elements.approvalDateField?.value || 'dataAprovacao',
        searchTerm: this.elements.approvalSearchInput?.value?.trim() || ''
      };
    }

    updateApprovalFilterSelectionCounters() {
      const setCount = (element, value) => {
        if (!element) return;
        element.textContent = numberFmt.format(value || 0);
      };

      setCount(this.elements.approvalStatusCount, (this.elements.approvalStatusSelect?.selectedOptions || []).length);
      setCount(this.elements.approvalConstrutoraCount, (this.elements.approvalConstrutoraSelect?.selectedOptions || []).length);
      setCount(this.elements.approvalEmpreendimentoCount, (this.elements.approvalEmpreendimentoSelect?.selectedOptions || []).length);
    }

    renderApprovalActiveFilters(filters = this.getApprovalFilters()) {
      if (!this.elements.approvalActiveFilters || !this.elements.approvalActiveFiltersList) return;

      const chips = [];
      const addChip = (key, value, label) => {
        chips.push(
          `<button type="button" class="btn btn-sm btn-light border reports-filter-chip" data-filter-key="${key}" data-filter-value="${this.escapeHtml(value || '')}">
            ${this.escapeHtml(label)} <i class="bi bi-x-lg ms-1"></i>
          </button>`
        );
      };

      if (filters.dataInicio || filters.dataFim) {
        addChip('period', `${filters.dataInicio || ''}|${filters.dataFim || ''}`, `Período: ${filters.dataInicio || '--'} até ${filters.dataFim || '--'}`);
      }
      if (filters.campoData && filters.campoData !== 'dataAprovacao') {
        addChip('dateField', filters.campoData, `Campo: ${this.prettyLabel(filters.campoData)}`);
      }
      (filters.situacao || []).forEach((value) => addChip('situacao', value, `Situação: ${value}`));
      if (filters.analistaAprovacao) {
        addChip('analyst', filters.analistaAprovacao, `Analista: ${this.formatApprovalAnalystDisplay(filters.analistaAprovacao, filters.analistaAprovacao)}`);
      }
      (filters.construtoras || []).forEach((value) => addChip('construtora', value, `Construtora: ${value}`));
      (filters.empreendimentos || []).forEach((value) => addChip('empreendimento', value, `Empreendimento: ${value}`));
      if (typeof filters.convertidoParaProcesso === 'boolean') {
        addChip('converted', String(filters.convertidoParaProcesso), filters.convertidoParaProcesso ? 'Conversão: convertidas' : 'Conversão: não convertidas');
      }
      if (filters.searchTerm) addChip('search', filters.searchTerm, `Busca: ${filters.searchTerm}`);

      this.elements.approvalActiveFiltersList.innerHTML = chips.join('');
      this.elements.approvalActiveFilters.classList.toggle('d-none', chips.length === 0);
    }

    clearApprovalFilterByChip(key, value) {
      const clearMultiOption = (selectEl, targetValue) => {
        if (!selectEl) return;
        Array.from(selectEl.options).forEach((option) => {
          if (option.value === targetValue) {
            option.selected = false;
          }
        });
      };

      switch (key) {
        case 'period':
          if (this.elements.approvalDateStart) this.elements.approvalDateStart.value = '';
          if (this.elements.approvalDateEnd) this.elements.approvalDateEnd.value = '';
          break;
        case 'dateField':
          if (this.elements.approvalDateField) this.elements.approvalDateField.value = 'dataAprovacao';
          break;
        case 'situacao':
          clearMultiOption(this.elements.approvalStatusSelect, value);
          break;
        case 'analyst':
          if (this.elements.approvalAnalystSelect) this.elements.approvalAnalystSelect.value = '';
          break;
        case 'construtora':
          clearMultiOption(this.elements.approvalConstrutoraSelect, value);
          break;
        case 'empreendimento':
          clearMultiOption(this.elements.approvalEmpreendimentoSelect, value);
          break;
        case 'converted':
          if (this.elements.approvalConvertedSelect) this.elements.approvalConvertedSelect.value = '';
          break;
        case 'search':
          if (this.elements.approvalSearchInput) this.elements.approvalSearchInput.value = '';
          break;
        default:
          break;
      }
    }

    resetApprovalFilters() {
      this.elements.approvalForm?.reset();
      if (this.elements.approvalStatusSelect) {
        Array.from(this.elements.approvalStatusSelect.options).forEach((option) => { option.selected = false; });
      }
      if (this.elements.approvalConstrutoraSelect) {
        Array.from(this.elements.approvalConstrutoraSelect.options).forEach((option) => { option.selected = false; });
      }
      if (this.elements.approvalEmpreendimentoSelect) {
        Array.from(this.elements.approvalEmpreendimentoSelect.options).forEach((option) => { option.selected = false; });
      }
      if (this.elements.approvalAnalystSelect) {
        this.elements.approvalAnalystSelect.value = '';
      }
      if (this.elements.approvalConvertedSelect) {
        this.elements.approvalConvertedSelect.value = '';
      }
      if (this.elements.approvalDateField) {
        this.elements.approvalDateField.value = 'dataAprovacao';
      }
      this.elements.approvalForm?.classList.remove('was-validated');
      this.updateApprovalFilterSelectionCounters();
      this.renderApprovalActiveFilters();
    }

    ensureApprovalTableHeaders() {
      const analystHead = this.elements.analystTableBody?.closest('table')?.querySelector('thead tr');
      if (analystHead) {
        analystHead.innerHTML = `
          <th>Analista</th>
          <th class="text-end">Total</th>
          <th class="text-end">Aprovadas</th>
          <th class="text-end">Reprovadas</th>
          <th class="text-end">Condicionadas</th>
          <th class="text-end">% Aprovação</th>
          <th class="text-end">Pendentes Conversão</th>
        `;
      }
    }

    dispose() {
      if (this.aprovacoesDeltaTimer) {
        clearTimeout(this.aprovacoesDeltaTimer);
        this.aprovacoesDeltaTimer = null;
      }

      if (typeof this.aprovacoesDeltaUnsubscribe === 'function') {
        try {
          this.aprovacoesDeltaUnsubscribe();
        } catch (error) {
          console.warn('[ReportsPage] Falha ao encerrar listener delta:', error);
        }
        this.aprovacoesDeltaUnsubscribe = null;
      }

      Object.values(this.charts || {}).forEach((chart) => {
        try {
          chart?.destroy?.();
        } catch (error) {
          console.warn('[ReportsPage] Falha ao destruir grafico principal:', error);
        }
      });
      Object.values(this.whatsappCharts || {}).forEach((chart) => {
        try {
          chart?.destroy?.();
        } catch (error) {
          console.warn('[ReportsPage] Falha ao destruir grafico WhatsApp:', error);
        }
      });
      Object.values(this.qaCharts || {}).forEach((chart) => {
        try {
          chart?.destroy?.();
        } catch (error) {
          console.warn('[ReportsPage] Falha ao destruir grafico QA:', error);
        }
      });

      this.charts = {
        status: null,
        month: null,
        empreendimento: null,
        aging: null,
      };
      this.whatsappCharts = {
        department: null,
        timeline: null,
      };
      this.qaCharts = {
        setor: null,
        origem: null,
      };
      this.initialized = false;
    }

    applyQuickRange(range) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let start = null;
      let end = new Date(today);

      switch (range) {
        case '7d':
          start = new Date(today);
          start.setDate(start.getDate() - 6);
          break;
        case '30d':
          start = new Date(today);
          start.setDate(start.getDate() - 29);
          break;
        case 'this-month':
          start = new Date(today.getFullYear(), today.getMonth(), 1);
          break;
        case 'last-90d':
          start = new Date(today);
          start.setDate(start.getDate() - 89);
          break;
        case 'all':
          start = null;
          end = null;
          break;
        default:
          return;
      }

      if (this.elements.dateStart) this.elements.dateStart.value = start ? this.toDateInput(start) : '';
      if (this.elements.dateEnd) this.elements.dateEnd.value = end ? this.toDateInput(end) : '';

      this.highlightRangeButtons(range);
      this.updateFilterSelectionCounters();
    }

    highlightRangeButtons(range) {
      this.elements.rangeButtons?.forEach((btn) => {
        const isActive = Boolean(range) && btn.dataset.range === range;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }

    updateFilterSelectionCounters() {
      const setCount = (el, value) => {
        if (!el) return;
        el.textContent = numberFmt.format(value || 0);
      };

      setCount(this.elements.statusCount, (this.elements.statusSelect?.selectedOptions || []).length);
      setCount(this.elements.vendorCount, (this.elements.vendorSelect?.selectedOptions || []).length);
      setCount(this.elements.empreendimentoCount, (this.elements.empreendimentoSelect?.selectedOptions || []).length);
      setCount(this.elements.analystCount, (this.elements.analystSelect?.selectedOptions || []).length);
    }

    renderActiveFilters(filters = this.getFilters()) {
      if (!this.elements.activeFilters || !this.elements.activeFiltersList) return;

      const chips = [];
      const addChip = (key, value, label) => {
        chips.push(
          `<button type="button" class="btn btn-sm btn-light border reports-filter-chip" data-filter-key="${key}" data-filter-value="${this.escapeHtml(value || '')}">
            ${this.escapeHtml(label)} <i class="bi bi-x-lg ms-1"></i>
          </button>`
        );
      };

      if (filters.dataInicio || filters.dataFim) {
        const start = filters.dataInicio || '--';
        const end = filters.dataFim || '--';
        addChip('period', `${start}|${end}`, `Período: ${start} até ${end}`);
      }
      if (filters.campoData && filters.campoData !== 'entrada') {
        addChip('dateField', filters.campoData, `Campo: ${this.prettyLabel(filters.campoData)}`);
      }
      (filters.status || []).forEach((status) => addChip('status', status, `Status: ${status}`));
      (filters.vendedores || []).forEach((vendor) => addChip('vendor', vendor, `Vendedor: ${vendor}`));
      (filters.empreendimentos || []).forEach((empreendimento) => addChip('empreendimento', empreendimento, `Empreendimento: ${empreendimento}`));
      (filters.analistas || []).forEach((analyst) => addChip('analyst', analyst, `Analista: ${analyst}`));
      if (filters.workflowType) addChip('workflow', filters.workflowType, `Workflow: ${filters.workflowType}`);
      if (filters.valorMinimo !== null && filters.valorMinimo !== undefined) addChip('min', String(filters.valorMinimo), `Min: ${currency.format(filters.valorMinimo)}`);
      if (filters.valorMaximo !== null && filters.valorMaximo !== undefined) addChip('max', String(filters.valorMaximo), `Max: ${currency.format(filters.valorMaximo)}`);
      if (filters.searchTerm) addChip('search', filters.searchTerm, `Busca: ${filters.searchTerm}`);

      this.elements.activeFiltersList.innerHTML = chips.join('');
      this.elements.activeFilters.classList.toggle('d-none', chips.length === 0);
    }

    clearFilterByChip(key, value) {
      const clearOption = (selectEl, target) => {
        if (!selectEl || !target) return;
        Array.from(selectEl.options).forEach((option) => {
          if (option.value === target) option.selected = false;
        });
      };

      switch (key) {
        case 'period':
          if (this.elements.dateStart) this.elements.dateStart.value = '';
          if (this.elements.dateEnd) this.elements.dateEnd.value = '';
          this.highlightRangeButtons('all');
          break;
        case 'dateField':
          if (this.elements.dateField) this.elements.dateField.value = 'entrada';
          break;
        case 'status':
          clearOption(this.elements.statusSelect, value);
          break;
        case 'vendor':
          clearOption(this.elements.vendorSelect, value);
          break;
        case 'empreendimento':
          clearOption(this.elements.empreendimentoSelect, value);
          break;
        case 'analyst':
          clearOption(this.elements.analystSelect, value);
          break;
        case 'workflow':
          if (this.elements.workflowSelect) this.elements.workflowSelect.value = '';
          break;
        case 'min':
          if (this.elements.minValue) this.elements.minValue.value = '';
          break;
        case 'max':
          if (this.elements.maxValue) this.elements.maxValue.value = '';
          break;
        case 'search':
          if (this.elements.searchInput) this.elements.searchInput.value = '';
          break;
        default:
          break;
      }
    }

    prefillDates() {
      const today = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 89); // Últimos 90 dias por padrão
      if (this.elements.dateEnd) {
        this.elements.dateEnd.value = this.toDateInput(today);
      }
      if (this.elements.dateStart) {
        this.elements.dateStart.value = this.toDateInput(start);
      }
      this.highlightRangeButtons('last-90d');
    }

    toDateInput(date) {
      return date.toISOString().split('T')[0];
    }

    async populateTemplates() {
      if (!window.reportsService || typeof window.reportsService.getTemplates !== 'function') return;
      const templates = window.reportsService.getTemplates();
      this.state.templates = templates;
      if (!this.elements.template) return;

      this.elements.template.innerHTML = templates
        .map((tpl) => `<option value="${tpl.id}">${tpl.nome}</option>`)
        .join('');

      if (templates.some((t) => t.id === 'completo')) {
        this.elements.template.value = 'completo';
      } else if (templates[0]) {
        this.elements.template.value = templates[0].id;
      }
    }

    async populateStatusOptions() {
      try {
        const select = this.elements.statusSelect;
        if (!select) return;

        const selectedValues = new Set(Array.from(select.selectedOptions || []).map((opt) => opt.value));
        let statusOptions = [];
        if (Array.isArray(window.EFFECTIVE_STATUS_CONFIG) && window.EFFECTIVE_STATUS_CONFIG.length > 0) {
          statusOptions = window.EFFECTIVE_STATUS_CONFIG
            .map((status) => ({
              id: status?.id || status?.text || status?.label || '',
              text: status?.text || status?.label || status?.id || '',
              stage: status?.stage || 'Sem etapa',
              order: Number(status?.order) || 999,
              archiveContracts: status?.archiveContracts === true,
            }))
            .filter((status) => status.text);
        } else if (window.firestoreService?.getEffectiveStatuses) {
          statusOptions = (await window.firestoreService.getEffectiveStatuses())
            .map((status) => ({
              id: status?.id || status?.text || status?.label || '',
              text: status?.text || status?.label || status?.id || '',
              stage: status?.stage || 'Sem etapa',
              order: Number(status?.order) || 999,
              archiveContracts: status?.archiveContracts === true,
            }))
            .filter((status) => status.text);
        }

        this.statusMetadata = new Map();
        this.archivedStatusTexts = new Set();
        statusOptions.forEach((status) => {
          this.statusMetadata.set(status.text, status);
          if (status.archiveContracts === true) {
            this.archivedStatusTexts.add(status.text);
          }
        });

        const grouped = statusOptions.reduce((acc, status) => {
          const stage = status.stage || 'Sem etapa';
          if (!acc[stage]) acc[stage] = [];
          acc[stage].push(status.text);
          return acc;
        }, {});

        const stageGroups = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
        select.innerHTML = stageGroups.map((stage) => {
          const options = grouped[stage]
            .sort((a, b) => a.localeCompare(b))
            .map((status) => `<option value="${this.escapeHtml(status)}" ${selectedValues.has(status) ? 'selected' : ''}>${this.escapeHtml(status)}</option>`)
            .join('');
          return `<optgroup label="${this.escapeHtml(stage)}">${options}</optgroup>`;
        }).join('');
      } catch (error) {
        console.warn('[ReportsPage] Erro ao carregar status:', error);
      }
    }

    normalizeStatusKey(status) {
      return String(status || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    getStatusMetadata(status) {
      return this.statusMetadata.get(status) || null;
    }

    isCancelledStatus(status) {
      const normalizedStatus = this.normalizeStatusKey(status);
      return normalizedStatus.includes('cancel')
        || normalizedStatus.includes('distrat')
        || normalizedStatus.includes('desistencia');
    }

    isClosedStatus(status) {
      if (!status) return false;
      if (this.archivedStatusTexts.has(status)) return true;

      const normalized = this.normalizeStatusKey(status);
      return normalized.includes('finalizado')
        || normalized.includes('concluido')
        || normalized.includes('pago')
        || normalized.includes('cancel')
        || normalized.includes('distrat')
        || normalized.includes('desistencia');
    }

    isFinishedStatus(status) {
      return this.isClosedStatus(status) && !this.isCancelledStatus(status);
    }

    async loadSlaTargets(forceRefresh = false) {
      this.slaTargetsByStatus = new Map();

      try {
        const rows = await window.firestoreService?.getSlaConfigForReports?.(forceRefresh);
        (rows || []).forEach((row) => {
          const targetDays = Number(row?.slaDays);
          if (!Number.isFinite(targetDays)) return;

          const rawKey = row?.statusId || row?.id || row?.fieldName || '';
          const normalizedKey = this.normalizeStatusKey(rawKey);
          if (normalizedKey) {
            this.slaTargetsByStatus.set(normalizedKey, targetDays);
          }
        });
      } catch (error) {
        console.warn('[ReportsPage] Falha ao carregar SLA por status:', error);
      }
    }

    getSlaDaysForStatus(status) {
      const metadata = this.getStatusMetadata(status);
      const statusKeys = [
        metadata?.id,
        metadata?.text,
        status
      ]
        .map((value) => this.normalizeStatusKey(value))
        .filter(Boolean);

      for (const key of statusKeys) {
        if (this.slaTargetsByStatus.has(key)) {
          return this.slaTargetsByStatus.get(key);
        }
      }

      if (window.SLA_TARGETS && Number.isFinite(window.SLA_TARGETS[status])) {
        return window.SLA_TARGETS[status];
      }

      return 30;
    }

    async initCustomExport() {
      if (this.customExportInitialized) return;

      try {
        const [configModule, exportModule] = await Promise.all([
          import('./config.js'),
          import('./exportService.js')
        ]);

        this.customExportFields = Array.isArray(configModule?.EXPORTABLE_FIELDS)
          ? configModule.EXPORTABLE_FIELDS
          : [];
        this.customExportCsv = typeof exportModule?.exportToCSV === 'function'
          ? exportModule.exportToCSV
          : null;

        this.renderCustomExportFields();
        this.bindCustomExportEvents();
        this.customExportInitialized = true;
      } catch (error) {
        console.warn('[ReportsPage] Falha ao inicializar exportacao personalizada:', error);
        this.setCustomExportStatus('Nao foi possivel inicializar a exportacao personalizada.', 'danger');
      }
    }

    renderCustomExportFields(selectedKeys = []) {
      const container = this.elements.reportFieldsContainer;
      if (!container) return;

      const selected = selectedKeys.length > 0
        ? new Set(selectedKeys)
        : new Set(this.customExportFields.map((field) => field.key));

      container.innerHTML = this.customExportFields.map((field) => `
        <div class="col-sm-6 col-lg-4">
          <div class="form-check border rounded px-3 py-2 h-100">
            <input class="form-check-input" type="checkbox" value="${this.escapeHtml(field.key)}" id="report-field-${this.escapeHtml(field.key)}" ${selected.has(field.key) ? 'checked' : ''}>
            <label class="form-check-label small" for="report-field-${this.escapeHtml(field.key)}">${this.escapeHtml(field.label)}</label>
          </div>
        </div>
      `).join('');
    }

    bindCustomExportEvents() {
      this.elements.reportSelectAllBtn?.addEventListener('click', (evt) => {
        evt.preventDefault();
        this.elements.reportFieldsContainer?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          input.checked = true;
        });
        this.setCustomExportStatus('');
      });

      this.elements.reportClearAllBtn?.addEventListener('click', (evt) => {
        evt.preventDefault();
        this.elements.reportFieldsContainer?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          input.checked = false;
        });
        this.setCustomExportStatus('');
      });

      this.elements.customExportGenerateBtn?.addEventListener('click', (evt) => {
        evt.preventDefault();
        this.exportCustomCsv();
      });
    }

    getSelectedCustomExportFields() {
      return Array.from(this.elements.reportFieldsContainer?.querySelectorAll('input[type="checkbox"]:checked') || [])
        .map((input) => input.value)
        .filter(Boolean);
    }

    setCustomExportStatus(message = '', type = 'muted') {
      if (!this.elements.customExportStatus) return;
      const colorClass = type === 'danger'
        ? 'text-danger'
        : type === 'success'
          ? 'text-success'
          : 'text-muted';
      this.elements.customExportStatus.className = `mt-2 small ${colorClass}`;
      this.elements.customExportStatus.textContent = message;
    }

    async exportCustomCsv() {
      if (typeof this.customExportCsv !== 'function') {
        this.setCustomExportStatus('Exportacao personalizada indisponivel no momento.', 'danger');
        return;
      }

      const selectedKeys = this.getSelectedCustomExportFields();
      if (selectedKeys.length === 0) {
        this.setCustomExportStatus('Selecione ao menos um campo para exportar.', 'danger');
        return;
      }

      try {
        const report = await this.ensureProcessReportForCurrentFilters();
        const contracts = Array.isArray(report?.rawData) ? report.rawData : [];
        if (contracts.length === 0) {
          this.setCustomExportStatus('Nenhum registro encontrado com os filtros atuais.', 'danger');
          return;
        }

        this.customExportCsv(contracts, selectedKeys);
        this.setCustomExportStatus(`CSV personalizado gerado com ${numberFmt.format(contracts.length)} registros.`, 'success');
      } catch (error) {
        this.setCustomExportStatus(error?.message || 'Falha ao gerar CSV personalizado.', 'danger');
      }
    }

    prefillFilterOptionsFromCache() {
      const cachedContracts =
        (Array.isArray(window.reportsService?.cachedContracts) && window.reportsService.cachedContracts) ||
        window.cacheService?.getSync?.('reports_contracts_all', 'contractsAll') ||
        window.cacheService?.getSync?.('contracts_all_with_archived', 'contractsAll') ||
        window.cacheService?.getSync?.('contracts_all_active', 'contractsAll');

      if (!Array.isArray(cachedContracts) || cachedContracts.length === 0) return;

      this.populateVendorOptions(cachedContracts);
      this.populateEmpreendimentoOptions(cachedContracts);
      this.populateAnalystOptions(cachedContracts);
    }

    async populateVendorOptions(contracts, selectedValues = []) {
      const select = this.elements.vendorSelect;
      if (!select || !Array.isArray(contracts)) return;

      const selectedSet = new Set(selectedValues.filter(Boolean));
      const vendors = Array.from(
        new Set(
          contracts
            .map((c) => c.vendedorConstrutora || 'Não informado')
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b));

      select.innerHTML = vendors
        .map((vendor) => `<option value="${this.escapeHtml(vendor)}" ${selectedSet.has(vendor) ? 'selected' : ''}>${this.escapeHtml(vendor)}</option>`)
        .join('');
    }

    async populateEmpreendimentoOptions(contracts, selectedValues = []) {
      const select = this.elements.empreendimentoSelect;
      if (!select || !Array.isArray(contracts)) return;

      const selectedSet = new Set(selectedValues.filter(Boolean));
      const empreendimentos = Array.from(
        new Set(
          contracts
            .map((contract) => (contract.empreendimento || 'Não informado').toString().trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

      select.innerHTML = empreendimentos
        .map((empreendimento) => `<option value="${this.escapeHtml(empreendimento)}" ${selectedSet.has(empreendimento) ? 'selected' : ''}>${this.escapeHtml(empreendimento)}</option>`)
        .join('');
    }

    async populateAnalystOptions(contracts, selectedValues = []) {
      const select = this.elements.analystSelect;
      if (!select || !Array.isArray(contracts)) return;

      const selectedSet = new Set(selectedValues.filter(Boolean));
      const analysts = Array.from(
        new Set(
          contracts
            .map((contract) => (contract.analista || '').toString().trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b));

      select.innerHTML = analysts
        .map((analyst) => `<option value="${this.escapeHtml(analyst)}" ${selectedSet.has(analyst) ? 'selected' : ''}>${this.escapeHtml(analyst)}</option>`)
        .join('');
    }

    getFilters() {
      const selectedStatuses = Array.from(this.elements.statusSelect?.selectedOptions || []).map((o) => o.value);
      const selectedVendors = Array.from(this.elements.vendorSelect?.selectedOptions || []).map((o) => o.value);
      const selectedEmpreendimentos = Array.from(this.elements.empreendimentoSelect?.selectedOptions || []).map((o) => o.value);
      const selectedAnalysts = Array.from(this.elements.analystSelect?.selectedOptions || []).map((o) => o.value);

      return {
        status: selectedStatuses,
        vendedores: selectedVendors,
        empreendimentos: selectedEmpreendimentos,
        analistas: selectedAnalysts,
        dataInicio: this.elements.dateStart?.value || null,
        dataFim: this.elements.dateEnd?.value || null,
        campoData: this.elements.dateField?.value || 'entrada',
        valorMinimo: this.elements.minValue?.value ? parseFloat(this.elements.minValue.value) : null,
        valorMaximo: this.elements.maxValue?.value ? parseFloat(this.elements.maxValue.value) : null,
        searchTerm: this.elements.searchInput?.value?.trim() || '',
        workflowType: this.elements.workflowSelect?.value || '',
      };
    }

    normalizeComparableText(value) {
      const normalized = String(value ?? '').trim();
      return normalized || null;
    }

    normalizeComparableNumber(value) {
      if (value === '' || value === null || value === undefined) {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    normalizeComparableBoolean(value) {
      return typeof value === 'boolean' ? value : null;
    }

    normalizeComparableArray(values = []) {
      return Array.from(
        new Set(
          (Array.isArray(values) ? values : [])
            .map((item) => String(item ?? '').trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    buildProcessFilterSnapshot(filters = {}, templateId = this.elements.template?.value || 'completo') {
      return {
        templateId: this.normalizeComparableText(templateId) || 'completo',
        status: this.normalizeComparableArray(filters.status),
        vendedores: this.normalizeComparableArray(filters.vendedores),
        empreendimentos: this.normalizeComparableArray(filters.empreendimentos),
        analistas: this.normalizeComparableArray(filters.analistas),
        dataInicio: this.normalizeComparableText(filters.dataInicio),
        dataFim: this.normalizeComparableText(filters.dataFim),
        campoData: this.normalizeComparableText(filters.campoData) || 'entrada',
        valorMinimo: this.normalizeComparableNumber(filters.valorMinimo),
        valorMaximo: this.normalizeComparableNumber(filters.valorMaximo),
        searchTerm: this.normalizeComparableText(filters.searchTerm),
        workflowType: this.normalizeComparableText(filters.workflowType)
      };
    }

    buildApprovalFilterSnapshot(filters = {}) {
      return {
        situacao: this.normalizeComparableArray(filters.situacao),
        analistaAprovacao: this.normalizeComparableText(filters.analistaAprovacao),
        construtoras: this.normalizeComparableArray(filters.construtoras),
        empreendimentos: this.normalizeComparableArray(filters.empreendimentos),
        convertidoParaProcesso: this.normalizeComparableBoolean(filters.convertidoParaProcesso),
        dataInicio: this.normalizeComparableText(filters.dataInicio),
        dataFim: this.normalizeComparableText(filters.dataFim),
        campoData: this.normalizeComparableText(filters.campoData) || 'dataAprovacao',
        searchTerm: this.normalizeComparableText(filters.searchTerm)
      };
    }

    areFilterSnapshotsEqual(left, right) {
      if (!left && !right) return true;
      if (!left || !right) return false;
      return JSON.stringify(left) === JSON.stringify(right);
    }

    hasProcessFiltersChanged() {
      const sourceState = this.state.sources.processos;
      if (!sourceState?.currentReport) return true;

      const currentSnapshot = this.buildProcessFilterSnapshot(
        this.getFilters(),
        this.elements.template?.value || 'completo'
      );
      const storedSnapshot = this.buildProcessFilterSnapshot(
        sourceState.currentFilters || {},
        sourceState.currentReport?.template?.id || 'completo'
      );

      return !this.areFilterSnapshotsEqual(currentSnapshot, storedSnapshot);
    }

    hasApprovalFiltersChanged() {
      const sourceState = this.state.sources.aprovacao;
      if (!sourceState?.currentReport) return true;

      const currentSnapshot = this.buildApprovalFilterSnapshot(this.getApprovalFilters());
      const storedSnapshot = this.buildApprovalFilterSnapshot(sourceState.currentFilters || {});

      return !this.areFilterSnapshotsEqual(currentSnapshot, storedSnapshot);
    }

    async ensureProcessReportForCurrentFilters(forceRefresh = false) {
      const sourceState = this.state.sources.processos;
      if (!sourceState?.currentReport || forceRefresh || this.hasProcessFiltersChanged()) {
        return this.generateReport(forceRefresh);
      }
      return sourceState.currentReport;
    }

    async ensureApprovalReportForCurrentFilters(forceRefresh = false) {
      const sourceState = this.state.sources.aprovacao;
      if (!sourceState?.currentReport || forceRefresh || this.hasApprovalFiltersChanged()) {
        return this.generateApprovalReport(forceRefresh);
      }
      return sourceState.currentReport;
    }

    validateForm() {
      if (!this.elements.form) return true;
      this.elements.form.classList.add('was-validated');
      return this.elements.form.checkValidity();
    }

    async generateReport(forceRefresh = false) {
      if (!window.reportsService) {
        this.handleError(new Error('Serviço de relatórios não disponível'));
        return;
      }

      if (!this.validateForm()) return null;

      const filters = this.getFilters();
      filters.forceRefresh = forceRefresh;
      const templateId = this.elements.template?.value || 'completo';

      const runBtn = this.elements.runBtn;
      this.setLoading(true);

      try {
        if (forceRefresh) {
          await Promise.all([
            this.populateStatusOptions(),
            this.loadSlaTargets(true)
          ]);
        }

        const report = await window.reportsService.generateReport(templateId, filters);
        this.state.activeSource = 'processos';
        this.state.currentReport = report;
        this.state.currentFilters = filters;
        this.state.contracts = report.rawData || [];
        this.state.sources.processos.currentReport = report;
        this.state.sources.processos.currentFilters = filters;
        this.state.sources.processos.dataset = this.state.contracts;
        this.state.sources.processos.lastUpdate = new Date().toISOString();

        const filterOptionsSource = Array.isArray(window.reportsService?.cachedContracts) && window.reportsService.cachedContracts.length > 0
          ? window.reportsService.cachedContracts
          : this.state.contracts;
        await this.populateVendorOptions(filterOptionsSource, filters.vendedores || []);
        await this.populateEmpreendimentoOptions(filterOptionsSource, filters.empreendimentos || []);
        await this.populateAnalystOptions(filterOptionsSource, filters.analistas || []);
        this.updateFilterSelectionCounters();
        this.renderActiveFilters(filters);
        this.renderFunnel(this.state.contracts);
        this.renderStatus(report);
        this.renderVendor(this.state.contracts);
        this.renderEmpreendimento(this.state.contracts);
        this.renderMonthly(this.state.contracts, filters.campoData);
        this.renderSla(this.state.contracts);
        this.renderAging(this.state.contracts);
        await this.loadAndRenderPendencias(forceRefresh);
        this.renderTable(report);
        this.toggleEmptyState(report.metadata?.totalRegistros > 0);
        this.setLastUpdate('processos');
        this.enableExports(report.metadata?.totalRegistros > 0, 'processos');
        this.syncSourcePanels();
        return report;
      } catch (error) {
        this.handleError(error, 'Erro ao gerar relatório');
      } finally {
        this.setLoading(false);
        if (runBtn) {
          runBtn.innerHTML = this.buttonLabels.processos;
        }
      }
    }

    async generateApprovalReport(forceRefresh = false) {
      const adapter = await this.loadApprovalAdapter();
      if (!adapter?.buildReport) {
        this.handleError(new Error('Adaptador de aprovacao indisponivel'), 'Erro ao carregar relatorio de aprovacao');
        return null;
      }

      const filters = this.getApprovalFilters();
      const runBtn = this.elements.approvalGenerateBtn;
      this.setSourceLoading(true, 'aprovacao');

      try {
        if (forceRefresh || !this.state.approvalFilterCatalog || this.analystProfilesByLookup.size === 0) {
          await this.loadApprovalAnalystDirectory(forceRefresh);
          await this.populateApprovalFilterOptions(true);
        }

        const report = await adapter.buildReport(filters, {
          forceRefresh,
          screenOptimized: true,
          tableLimit: APPROVAL_SCREEN_TABLE_LIMIT
        });
        this.state.activeSource = 'aprovacao';
        this.state.approvalReport = report;
        this.state.approvalFilters = filters;
        this.state.aprovacoes = Array.isArray(report.rawData) ? report.rawData : [];
        this.state.sources.aprovacao.currentReport = report;
        this.state.sources.aprovacao.currentFilters = filters;
        this.state.sources.aprovacao.dataset = this.state.aprovacoes;
        this.state.sources.aprovacao.lastUpdate = new Date().toISOString();

        this.renderApprovalSummary(report);
        this.renderApprovalHealth(report.diagnostics?.health || []);
        this.renderApprovalSituacao(report);
        this.renderApprovalRanking(report.ranking || []);
        this.renderConversionMetrics(report.conversion || null, { warnings: [] });
        this.renderApprovalTable(report);
        this.applyOrthographyFixes();
        this.normalizeApprovalRenderedText();
        this.toggleApprovalEmptyState(Number(report.metadata?.totalRegistros || 0) > 0);
        this.setLastUpdate('aprovacao');
        this.enableExports(Number(report.metadata?.totalRegistros || 0) > 0, 'aprovacao');
        this.syncSourcePanels();
        return report;
      } catch (error) {
        this.handleError(error, 'Erro ao gerar relatório de aprovação');
      } finally {
        this.setSourceLoading(false, 'aprovacao');
        if (runBtn) {
          runBtn.innerHTML = this.buttonLabels.aprovacao;
        }
      }
    }

    renderApprovalSummary(report) {
      const stats = report?.stats || {};
      const conversion = report?.conversion || {};

      if (this.elements.approvalTotal) this.elements.approvalTotal.textContent = numberFmt.format(stats.total || 0);
      if (this.elements.approvalApproved) this.elements.approvalApproved.textContent = numberFmt.format(stats.aprovados || 0);
      if (this.elements.approvalRejected) this.elements.approvalRejected.textContent = numberFmt.format(stats.reprovados || 0);
      if (this.elements.approvalConditioned) this.elements.approvalConditioned.textContent = numberFmt.format(stats.condicionados || 0);
      if (this.elements.approvalPendingConversion) this.elements.approvalPendingConversion.textContent = numberFmt.format(stats.pendentesConversao || 0);
      if (this.elements.approvalConversionRate) this.elements.approvalConversionRate.textContent = `${Number(conversion.taxaPercentual || 0).toFixed(1)}%`;
    }

    renderApprovalHealth(messages = []) {
      if (!this.elements.approvalHealth) return;
      const items = Array.isArray(messages) ? messages.filter(Boolean) : [];
      this.elements.approvalHealth.innerHTML = items.length > 0
        ? `<strong>Saude dos dados:</strong><div class="mt-2">${items.map((item) => `<div>${this.escapeHtml(item)}</div>`).join('')}</div>`
        : '';
      this.elements.approvalHealth.classList.toggle('d-none', items.length === 0);
    }

    renderApprovalSituacao(report) {
      const series = Array.isArray(report?.situacaoSeries) ? report.situacaoSeries : [];
      const total = Number(report?.stats?.total || 0);

      if (this.elements.approvalSituacaoTotal) {
        this.elements.approvalSituacaoTotal.textContent = `${numberFmt.format(total)} análises`;
      }

      if (this.elements.approvalSituacaoList) {
        const rows = series.map(([label, value], index) => {
          const percentage = total > 0 ? ((Number(value || 0) / total) * 100).toFixed(1) : '0.0';
          const color = CHART_COLORS[index % CHART_COLORS.length];
          return `
            <tr>
              <td><span class="d-inline-block rounded-circle me-2" style="width:10px;height:10px;background-color:${color}"></span>${this.escapeHtml(label)}</td>
              <td class="text-end">${numberFmt.format(value || 0)}</td>
              <td class="text-end">${percentage}%</td>
            </tr>
          `;
        }).join('');

        this.elements.approvalSituacaoList.innerHTML = rows || '<tr><td colspan="3" class="text-muted text-center py-3">Sem dados</td></tr>';
      }

      if (!this.elements.approvalSituacaoChart || typeof Chart === 'undefined') return;

      this.charts.approvalSituacao?.destroy?.();
      this.charts.approvalSituacao = new Chart(this.elements.approvalSituacaoChart.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: series.map(([label]) => label),
          datasets: [{
            data: series.map(([, value]) => value),
            backgroundColor: series.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]),
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
    }

    renderApprovalRanking(ranking) {
      const list = (Array.isArray(ranking) ? ranking : []).map((entry) => {
        const total = Number(entry.total ?? entry.atendimentos ?? entry.cadastros ?? 0) || 0;
        const aprovados = Number(entry.aprovados || 0);
        const reprovados = Number(entry.reprovados || 0);
        const condicionados = Number(entry.condicionados || 0);
        const pendentesConversao = Number(entry.pendentesConversao || 0);
        return {
          ...entry,
          total,
          aprovados,
          reprovados,
          condicionados,
          pendentesConversao,
          taxaAprovacao: total > 0 ? Number(((aprovados / total) * 100).toFixed(1)) : Number(entry.taxaAprovacao || 0)
        };
      });

      if (this.elements.analystTotal) {
        this.elements.analystTotal.textContent = `${numberFmt.format(list.length)} analistas`;
      }

      if (this.elements.analystPodium) {
        const topThree = list.slice(0, 3);
        this.elements.analystPodium.innerHTML = topThree.length > 0
          ? topThree.map((entry, index) => {
              const medalConfig = [
                { title: '1º lugar', icon: 'bi-trophy-fill', color: 'warning', col: 'col-lg-5' },
                { title: '2º lugar', icon: 'bi-award-fill', color: 'secondary', col: 'col-lg-4' },
                { title: '3º lugar', icon: 'bi-award', color: 'info', col: 'col-lg-3' }
              ][index];
              return `
                <div class="col-12 ${medalConfig.col}">
                  <div class="border rounded p-3 h-100 bg-${medalConfig.color} bg-opacity-10">
                    <div class="d-flex justify-content-between align-items-start">
                      <div>
                        <div class="small text-muted">${medalConfig.title}</div>
                        <div class="fw-semibold">${this.escapeHtml(this.formatApprovalAnalystDisplay(entry.analyst, entry.analyst))}</div>
                      </div>
                      <i class="bi ${medalConfig.icon} text-${medalConfig.color} fs-4"></i>
                    </div>
                    <div class="small mt-2">Total: ${numberFmt.format(entry.total)} | Aprovadas: ${numberFmt.format(entry.aprovados)}</div>
                    <div class="fw-bold mt-1">Pendentes conversão: ${numberFmt.format(entry.pendentesConversao)}</div>
                  </div>
                </div>
              `;
            }).join('')
          : '<div class="col-12 text-muted text-center py-2">Sem dados para exibir destaques.</div>';
      }

      if (!this.elements.analystTableBody) return;
      this.elements.analystTableBody.innerHTML = list.map((entry) => `
        <tr>
          <td class="fw-medium">${this.escapeHtml(this.formatApprovalAnalystDisplay(entry.analyst, entry.analyst))}</td>
          <td class="text-end">${numberFmt.format(entry.total || 0)}</td>
          <td class="text-end text-success">${numberFmt.format(entry.aprovados || 0)}</td>
          <td class="text-end text-danger">${numberFmt.format(entry.reprovados || 0)}</td>
          <td class="text-end text-warning-emphasis">${numberFmt.format(entry.condicionados || 0)}</td>
          <td class="text-end">${Number(entry.taxaAprovacao || 0).toFixed(1)}%</td>
          <td class="text-end fw-semibold">${numberFmt.format(entry.pendentesConversao || 0)}</td>
        </tr>
      `).join('') || '<tr><td colspan="7" class="text-muted text-center py-3">Sem dados</td></tr>';
    }

    renderApprovalSolicitacoes(solicitacoes = [], source = '', partial = false) {
      if (this.elements.approvalSolicitacoesTotal) {
        const suffix = partial ? ' (parcial)' : '';
        this.elements.approvalSolicitacoesTotal.textContent = `${numberFmt.format((solicitacoes || []).length)} solicitações${suffix}`;
      }

      if (!this.elements.approvalSolicitacoesBody) return;

      this.elements.approvalSolicitacoesBody.innerHTML = (solicitacoes || []).map((item) => {
        const createdAt = this.coerceTimestampToDate?.(item.createdAt) || new Date(item.createdAt || item.createdEm || Date.now());
        return `
          <tr>
            <td class="fw-medium">${this.escapeHtml(item.nomeCompleto || item.clientePrincipal || 'Nao informado')}</td>
            <td>${this.escapeHtml(item.cpfPrincipal || '-')}</td>
            <td>${this.escapeHtml(item.status || '-')}</td>
            <td>${this.escapeHtml(item.canalOrigem || item.origemCanal || source || '-')}</td>
            <td>${this.escapeHtml(this.formatApprovalAnalystDisplay(item.analistaAprovacao, '-'))}</td>
            <td>${createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleString('pt-BR') : '-'}</td>
          </tr>
        `;
      }).join('') || '<tr><td colspan="6" class="text-muted text-center py-3">Nenhuma solicitação encontrada.</td></tr>';
    }

    renderApprovalTable(report) {
      if (!this.elements.approvalResultsHead || !this.elements.approvalResultsBody) return;

      const rows = Array.isArray(report?.tableRows) ? report.tableRows : [];
      const totalRegistros = Number(report?.metadata?.totalRegistros || rows.length || 0);
      const headers = ['clientePrincipal', 'cpfPrincipal', 'situacao', 'analistaAprovacao', 'construtora', 'empreendimento', 'dataAprovacao', 'convertidoParaProcesso'];
      this.elements.approvalResultsHead.innerHTML = `<tr>${headers.map((header) => `<th class="text-nowrap">${this.prettyLabel(header)}</th>`).join('')}</tr>`;

      if (!rows.length) {
        this.elements.approvalResultsBody.innerHTML = '<tr><td colspan="8" class="text-muted text-center py-3">Sem dados para exibir.</td></tr>';
        return;
      }

      const visibleRows = rows.map((row) => `
        <tr>
          <td>${this.escapeHtml(row.clientePrincipal || '-')}</td>
          <td>${this.escapeHtml(row.cpfPrincipal || '-')}</td>
          <td>${this.escapeHtml(row.situacao || '-')}</td>
          <td>${this.escapeHtml(this.formatApprovalAnalystDisplay(row.analistaAprovacao, '-'))}</td>
          <td>${this.escapeHtml(row.construtora || '-')}</td>
          <td>${this.escapeHtml(row.empreendimento || '-')}</td>
          <td>${this.formatDateValue(row.dataAprovacao || row.dataEntrada || row.entrada)}</td>
          <td>${row.convertidoParaProcesso ? 'Sim' : 'Nao'}</td>
        </tr>
      `).join('');
      const trimmedNotice = totalRegistros > rows.length
        ? `<tr class="table-light"><td colspan="8" class="text-center text-muted py-2"><i class="bi bi-info-circle me-1"></i>Exibindo ${numberFmt.format(rows.length)} de ${numberFmt.format(totalRegistros)} registros. <a href="#" onclick="window.reportsPage.exportCurrent('csv'); return false;">Exportar CSV completo</a></td></tr>`
        : '';
      this.elements.approvalResultsBody.innerHTML = visibleRows + trimmedNotice;
    }

    toggleApprovalEmptyState(hasData) {
      if (!this.elements.approvalEmptyState) return;
      this.elements.approvalEmptyState.classList.toggle('d-none', hasData);
      this.elements.approvalSummarySection?.classList.toggle('d-none', !hasData);
    }

    setSourceLastUpdate(source = this.state.activeSource || 'processos') {
      const normalizedSource = ['processos', 'aprovacao', 'whatsapp', 'atividades'].includes(source) ? source : 'processos';
      this.state.sources[normalizedSource].lastUpdate = new Date().toISOString();
      this.updateSourceLastUpdateLabel();
    }

    setSourceLoading(isLoading, source = this.state.activeSource || 'processos') {
      const runBtn = source === 'aprovacao'
        ? this.elements.approvalGenerateBtn
        : source === 'atividades'
          ? this.elements.activityGenerateBtn
          : this.elements.runBtn;
      if (runBtn) {
        runBtn.disabled = isLoading;
        if (isLoading) {
          runBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Gerando...';
        } else {
          runBtn.innerHTML = this.buttonLabels[source] || this.buttonLabels.processos;
        }
      }
      if (this.elements.refreshBtn) this.elements.refreshBtn.disabled = isLoading;
      this.elements.rangeButtons?.forEach((btn) => {
        btn.disabled = isLoading;
      });
      if (this.elements.approvalGenerateBtn && source !== 'aprovacao') {
        this.elements.approvalGenerateBtn.disabled = false;
        if (!isLoading) {
          this.elements.approvalGenerateBtn.innerHTML = this.buttonLabels.aprovacao;
        }
      }
      if (this.elements.activityGenerateBtn && source !== 'atividades') {
        this.elements.activityGenerateBtn.disabled = false;
        if (!isLoading) {
          this.elements.activityGenerateBtn.innerHTML = this.buttonLabels.atividades;
        }
      }
    }

    formatDateValue(value) {
      const parsed = this.coerceTimestampToDate?.(value) || new Date(value || '');
      return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleDateString('pt-BR') : '-';
    }

    updateTopLevelExportState() {
      const source = this.state.activeSource || 'processos';
      if (source === 'whatsapp') {
        this.enableExports(false, 'whatsapp');
        return;
      }
      if (source === 'atividades') {
        this.enableExports(false, 'atividades');
        return;
      }

      const sourceState = this.state.sources[source];
      this.enableExports(Boolean(sourceState?.exportsEnabled), source);
    }

    setLoading(isLoading) {
      this.setSourceLoading(isLoading, this.state.activeSource || 'processos');
    }

    setLastUpdate(source = this.state.activeSource || 'processos') {
      this.setSourceLastUpdate(source);
    }

    renderSummary(report) {
      const stats = report.statistics || {};
      const total = stats.total || 0;
      const valorTotal = stats.valorTotal || 0;
      const valorMedio = stats.valorMedio || 0;

      if (this.elements.totalCount) this.elements.totalCount.textContent = numberFmt.format(total);
      if (this.elements.totalValue) this.elements.totalValue.textContent = valorTotal ? currency.format(valorTotal) : '--';
      if (this.elements.avgTicket) this.elements.avgTicket.textContent = valorMedio ? currency.format(valorMedio) : '--';

      const openCount = (this.state.contracts || []).filter((c) => !this.isClosedStatus(c.status)).length;
      if (this.elements.openCount) this.elements.openCount.textContent = numberFmt.format(openCount);
    }

    renderStatus(report) {
      const stats = report.statistics?.porStatus || {};
      const total = report.statistics?.total || 0;

      if (this.elements.statusTotal) this.elements.statusTotal.textContent = `${numberFmt.format(total)} registros`;

      // Ordenar por quantidade (maior para menor)
      const sortedEntries = Object.entries(stats).sort((a, b) => b[1] - a[1]);

      if (this.elements.statusTableBody) {
        const rows = sortedEntries
          .map(([status, count], index) => {
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
            const color = CHART_COLORS[index % CHART_COLORS.length];
            return `<tr>
              <td><span class="d-inline-block rounded-circle me-2" style="width:10px;height:10px;background-color:${color}"></span>${status}</td>
              <td class="text-end">${numberFmt.format(count)}</td>
              <td class="text-end">${pct}%</td>
            </tr>`;
          }).join('');
        this.elements.statusTableBody.innerHTML = rows || '<tr><td colspan="3" class="text-muted text-center">Sem dados</td></tr>';
      }

      // Gráfico de status
      if (!this.elements.statusChart || typeof Chart === 'undefined') return;

      if (this.charts.status) this.charts.status.destroy();
      
      const labels = sortedEntries.map(([status]) => status);
      const data = sortedEntries.map(([, count]) => count);
      const backgroundColors = sortedEntries.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

      this.charts.status = new Chart(this.elements.statusChart.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: backgroundColors,
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { 
              display: false // Legenda na tabela ao lado
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : '0.0';
                  return `${ctx.label}: ${numberFmt.format(ctx.raw)} (${pct}%)`;
                }
              }
            }
          },
          cutout: '50%'
        },
      });
    }

    renderVendor(contracts) {
      if (!this.elements.vendorTableBody) return;
      const summary = {};

      (contracts || []).forEach((contract) => {
        const vendor = contract.vendedorConstrutora || 'Não informado';
        const valor = parseFloat(contract.valorContrato) || 0;
        if (!summary[vendor]) {
          summary[vendor] = { count: 0, total: 0 };
        }
        summary[vendor].count += 1;
        summary[vendor].total += valor;
      });

      const sortedVendors = Object.entries(summary).sort((a, b) => (
        b[1].count - a[1].count
        || b[1].total - a[1].total
        || a[0].localeCompare(b[0], 'pt-BR')
      ));

      const rows = sortedVendors
        .map(([vendor, data], index) => {
          const ticket = data.count > 0 ? data.total / data.count : 0;
          const rank = index + 1;
          const rankBadge = rank <= 3 
            ? `<span class="badge bg-${rank === 1 ? 'warning' : rank === 2 ? 'secondary' : 'danger'} me-2">${rank}º</span>` 
            : '';
          return `<tr>
            <td>${rankBadge}${vendor}</td>
            <td class="text-end">${numberFmt.format(data.count)}</td>
            <td class="text-end">${ticket ? currency.format(ticket) : '--'}</td>
            <td class="text-end fw-semibold">${data.total ? currency.format(data.total) : '--'}</td>
          </tr>`;
        }).join('');

      this.elements.vendorTableBody.innerHTML = rows || '<tr><td colspan="4" class="text-muted text-center">Sem dados</td></tr>';
      if (this.elements.vendorTotal) {
        this.elements.vendorTotal.textContent = `${Object.keys(summary).length} vendedores`;
      }
    }

    buildAprovacoesMetricsCacheKey(options = {}) {
      return JSON.stringify({
        dataInicio: options.dataInicio || null,
        dataFim: options.dataFim || null,
        pageSize: Number(options.pageSize) || ANALYST_RANKING_PAGE_SIZE
      });
    }

    getCachedAprovacoesMetricsSnapshot(cacheKey) {
      const snapshot = this.state.aprovacoesMetricsSnapshot;
      if (!snapshot) return null;
      if (snapshot.key !== cacheKey) return null;
      if ((Date.now() - Number(snapshot.loadedAt || 0)) > APROVACOES_METRICS_CACHE_TTL) {
        return null;
      }
      return snapshot.response || null;
    }

    setAprovacoesMetricsSnapshot(cacheKey, response) {
      this.state.aprovacoesMetricsSnapshot = {
        key: cacheKey,
        loadedAt: Date.now(),
        response
      };
    }

    async fetchAprovacoesForMetrics(options = {}, forceRefresh = false) {
      const normalizedOptions = {
        orderBy: 'createdAt',
        orderDirection: 'desc',
        dataInicio: options.dataInicio || undefined,
        dataFim: options.dataFim || undefined,
        pageSize: Number(options.pageSize) || ANALYST_RANKING_PAGE_SIZE
      };
      const cacheKey = this.buildAprovacoesMetricsCacheKey(normalizedOptions);

      if (!forceRefresh) {
        const cached = this.getCachedAprovacoesMetricsSnapshot(cacheKey);
        if (cached) {
          return cached;
        }
      }

      if (window.aprovacaoService?.listAprovacoesForMetrics) {
        const response = await window.aprovacaoService.listAprovacoesForMetrics(normalizedOptions);
        const normalizedResponse = {
          data: Array.isArray(response?.data) ? response.data : [],
          partial: Boolean(response?.partial),
          limit: Number(response?.limit) || normalizedOptions.pageSize
        };
        this.setAprovacoesMetricsSnapshot(cacheKey, normalizedResponse);
        return normalizedResponse;
      }

      if (!window.aprovacaoService?.listAprovacoes) {
        return { data: [], partial: false, limit: normalizedOptions.pageSize };
      }

      const fallbackResponse = await window.aprovacaoService.listAprovacoes({
        ...normalizedOptions,
        pageSize: normalizedOptions.pageSize
      });
      const normalizedFallback = {
        data: Array.isArray(fallbackResponse?.data) ? fallbackResponse.data : [],
        partial: Boolean(fallbackResponse?.hasMore),
        limit: normalizedOptions.pageSize
      };
      this.setAprovacoesMetricsSnapshot(cacheKey, normalizedFallback);
      return normalizedFallback;
    }

    async loadAnalystRanking() {
      if (!window.aprovacaoService?.listAprovacoesForMetrics && !window.aprovacaoService?.listAprovacoes) {
        this.renderAnalystRanking([]);
        return;
      }

      try {
        const rankingFilters = this.state.currentFilters || {};
        const flags = window.firestoreService?.getSystemFlags
          ? await window.firestoreService.getSystemFlags()
          : {};
        const useAggregatePath = flags.enableAprovacoesAggregatesReadPath === true
          && typeof window.aprovacaoService?.getAprovacaoAnalystRankingAggregate === 'function';

        if (useAggregatePath) {
          const ranking = await window.aprovacaoService.getAprovacaoAnalystRankingAggregate({
            dataInicio: rankingFilters.dataInicio || null,
            dataFim: rankingFilters.dataFim || null
          });
          this.state.aprovacoes = [];
          this.state.analystRankingPartial = false;
          this.state.analystRankingLimit = 0;
          this.renderAnalystRanking(ranking);
          return;
        }

        const response = await this.fetchAprovacoesForMetrics({
          dataInicio: rankingFilters.dataInicio || undefined,
          dataFim: rankingFilters.dataFim || undefined,
          pageSize: ANALYST_RANKING_PAGE_SIZE
        });
        this.state.aprovacoes = Array.isArray(response?.data) ? response.data : [];
        this.state.analystRankingPartial = Boolean(response?.partial);
        this.state.analystRankingLimit = Number(response?.limit) || ANALYST_RANKING_PAGE_SIZE;
      } catch (error) {
        console.warn('[ReportsPage] Erro ao carregar aprovações para ranking:', error);
        this.state.aprovacoes = [];
        this.state.analystRankingPartial = false;
        this.state.analystRankingLimit = ANALYST_RANKING_PAGE_SIZE;
      }

      const ranking = this.computeAnalystRanking(this.state.aprovacoes);
      this.renderAnalystRanking(ranking);
    }

    async getConversionMetricsService() {
      if (
        window.conversionMetricsService &&
        typeof window.conversionMetricsService.computeAprovacaoConversaoMetrics === 'function'
      ) {
        return window.conversionMetricsService;
      }

      if (!this._conversionMetricsServicePromise) {
        this._conversionMetricsServicePromise = import('./js/conversionMetricsService.js')
          .then((mod) => mod?.default || window.conversionMetricsService || null)
          .catch((error) => {
            console.warn('[ReportsPage] Nao foi possivel carregar conversionMetricsService:', error);
            return null;
          });
      }

      return this._conversionMetricsServicePromise;
    }

    async getAprovacoesForConversionMetrics(filters = {}, forceRefresh = false) {
      return this.fetchAprovacoesForMetrics({
        dataInicio: filters.dataInicio || undefined,
        dataFim: filters.dataFim || undefined,
        pageSize: ANALYST_RANKING_PAGE_SIZE
      }, forceRefresh);
    }

    async getContractsForConversionMetrics(forceRefresh = false) {
      const CACHE_TTL_MS = 2 * 60 * 1000;
      const now = Date.now();
      const flags = window.firestoreService?.getSystemFlags
        ? await window.firestoreService.getSystemFlags()
        : {};
      const allowHeavyFallback = flags.enableContractsHeavyFallback !== false;
      const canReuseCache = (
        !forceRefresh &&
        Array.isArray(this.state.conversionContractsCache) &&
        this.state.conversionContractsCache.length > 0 &&
        (now - this.state.conversionContractsLoadedAt) < CACHE_TTL_MS
      );

      if (canReuseCache) {
        return this.state.conversionContractsCache;
      }

      let contracts = [];
      if (!forceRefresh && Array.isArray(window.reportsService?.cachedContracts) && window.reportsService.cachedContracts.length > 0) {
        contracts = window.reportsService.cachedContracts;
      }

      if ((!Array.isArray(contracts) || contracts.length === 0) && window.cacheService?.getSync) {
        contracts =
          window.cacheService.getSync('reports_contracts_all', 'contractsAll') ||
          window.cacheService.getSync('contracts_all_with_archived', 'contractsAll') ||
          window.cacheService.getSync('contracts_all_active', 'contractsAll') ||
          [];
      }

      if ((!Array.isArray(contracts) || contracts.length === 0) && window.firestoreService?.getContractsPage) {
        const page = await window.firestoreService.getContractsPage({
          limit: 300,
          page: 1,
          sortKey: 'updatedAt',
          sortDirection: 'desc',
          includeArchived: true
        });
        contracts = Array.isArray(page?.contracts) ? page.contracts : [];
      }

      if (
        allowHeavyFallback &&
        (!Array.isArray(contracts) || contracts.length === 0) &&
        window.firestoreService?.getAllContracts
      ) {
        contracts = await window.firestoreService.getAllContracts({
          includeArchived: true
        });
      }

      this.state.conversionContractsCache = Array.isArray(contracts) ? contracts : [];
      this.state.conversionContractsLoadedAt = Date.now();
      return this.state.conversionContractsCache;
    }

    async loadConversionMetrics(forceRefresh = false) {
      const filters = this.state.currentFilters || {};
      const flags = window.firestoreService?.getSystemFlags
        ? await window.firestoreService.getSystemFlags()
        : {};
      const useAggregatePath = flags.enableAprovacoesAggregatesReadPath === true
        && typeof window.aprovacaoService?.getAprovacaoConversionMetricsAggregate === 'function';
      const service = useAggregatePath ? null : await this.getConversionMetricsService();
      if (!useAggregatePath && !service) {
        this.renderConversionMetrics(null, { warnings: ['Servico de conversao indisponivel no momento.'] });
        return;
      }

      try {
        let metrics;
        const warnings = [];

        if (useAggregatePath) {
          metrics = await window.aprovacaoService.getAprovacaoConversionMetricsAggregate({
            dataInicio: filters.dataInicio || null,
            dataFim: filters.dataFim || null,
            denominatorMode: 'todas'
          });
        } else {
          const [aprovacoesResponse, contratos] = await Promise.all([
            this.getAprovacoesForConversionMetrics(filters, forceRefresh),
            this.getContractsForConversionMetrics(forceRefresh)
          ]);

          metrics = service.computeAprovacaoConversaoMetrics({
            aprovacoes: aprovacoesResponse?.data || [],
            processos: contratos || [],
            periodStart: filters.dataInicio || null,
            periodEnd: filters.dataFim || null,
            approvalDateField: CONVERSION_DATE_FIELD,
            denominatorMode: 'todas',
            matchingMode: 'cpf_intersection'
          });

          if (aprovacoesResponse?.partial) {
            warnings.push(
              `Amostra parcial de aprovacoes (limite ${numberFmt.format(aprovacoesResponse.limit || 0)} registros).`
            );
          }
        }

        if (
          (metrics?.diagnostics?.processosWithoutDate || 0) > 0
          && String(metrics?.matchingMode || '').toLowerCase() === 'strict_origin_then_cpf'
        ) {
          warnings.push('Processos sem data valida nao entram no fallback por CPF.');
        }

        if ((metrics?.diagnostics?.linksRead || 0) === 0 && (metrics?.totalAnalisesPeriodo || 0) > 0) {
          warnings.push('Nenhum vinculo materializado de conversao foi encontrado para o periodo. Execute o backfill de aprovacoes convertidas para recompor a metrica.');
        }

        this.state.conversionMetrics = metrics;
        this.renderConversionMetrics(metrics, { warnings });
      } catch (error) {
        console.warn('[ReportsPage] Erro ao calcular metricas de conversao:', error);
        this.state.conversionMetrics = null;
        this.renderConversionMetrics(null, { warnings: ['Nao foi possivel calcular a taxa de conversao.'] });
      }
    }

    renderConversionMetrics(metrics, options = {}) {
      const setText = (element, value) => {
        if (element) element.textContent = value;
      };

      if (!metrics) {
        setText(this.elements.conversionRate, '--');
        setText(this.elements.conversionTotal, '--');
        setText(this.elements.conversionConverted, '--');
        setText(this.elements.conversionPending, '--');
        setText(this.elements.conversionByOrigin, '--');
        setText(this.elements.conversionByCpf, '--');

        if (this.elements.conversionWarning) {
          this.elements.conversionWarning.classList.add('d-none');
          this.elements.conversionWarning.textContent = '';
        }
        return;
      }

      const total = Number(metrics.totalAnalisesPeriodo || 0);
      const converted = Number(metrics.convertidas || 0);
      const pending = Number(metrics.pendentes || 0);
      const byOrigin = Number(metrics.byOrigin || 0);
      const byCpf = Number(metrics.byCpf || 0);
      const pct = Number(metrics.taxaPercentual || 0);

      setText(this.elements.conversionRate, `${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
      setText(this.elements.conversionTotal, numberFmt.format(total));
      setText(this.elements.conversionConverted, numberFmt.format(converted));
      setText(this.elements.conversionPending, numberFmt.format(pending));
      setText(this.elements.conversionByOrigin, numberFmt.format(byOrigin));
      setText(this.elements.conversionByCpf, numberFmt.format(byCpf));

      const warnings = Array.isArray(options?.warnings)
        ? options.warnings.filter(Boolean)
        : [];

      if (this.elements.conversionWarning) {
        if (warnings.length > 0) {
          this.elements.conversionWarning.classList.remove('d-none');
          this.elements.conversionWarning.textContent = warnings.join(' ');
        } else {
          this.elements.conversionWarning.classList.add('d-none');
          this.elements.conversionWarning.textContent = '';
        }
      }
    }

    computeAnalystRanking(aprovacoes) {
      const summary = new Map();
      const ensureAnalyst = (rawName) => {
        const analystKey = this.normalizeAnalystKey(rawName);
        if (!analystKey) return null;

        const analystDisplay = this.normalizeAnalystDisplay(rawName);
        if (!summary.has(analystKey)) {
          summary.set(analystKey, {
            analyst: analystDisplay,
            atendimentos: 0,
            cadastros: 0,
            aprovados: 0,
            reprovados: 0,
            pontuacao: 0,
          });
        } else {
          const entry = summary.get(analystKey);
          entry.analyst = this.pickPreferredAnalystDisplay(entry.analyst, analystDisplay);
        }
        return summary.get(analystKey);
      };

      (aprovacoes || []).forEach((aprovacao) => {
        const analyst = this.resolveAnalystName(aprovacao);
        if (!analyst) return;
        const entry = ensureAnalyst(analyst);
        if (!entry) return;
        entry.atendimentos += 1;
        entry.cadastros += 1;
        if (aprovacao.situacao === 'APROVADO') entry.aprovados += 1;
        if (aprovacao.situacao === 'REPROVADO') entry.reprovados += 1;
      });

      return Array.from(summary.values())
        .map((entry) => ({
          ...entry,
          // Atendimentos recebem peso 2 por representarem acompanhamento contínuo do pipeline.
          // Cadastros e aprovados somam positivamente, enquanto reprovados reduzem a pontuação.
          pontuacao: (entry.atendimentos * ATENDIMENTOS_SCORE_WEIGHT) + entry.cadastros + entry.aprovados - entry.reprovados
        }))
        .sort((a, b) => b.pontuacao - a.pontuacao || b.aprovados - a.aprovados || b.cadastros - a.cadastros || a.analyst.localeCompare(b.analyst));
    }

    resolveAnalystName(data = {}) {
      const analyst = String(data.analistaAprovacao || '').trim();
      return analyst || null;
    }

    normalizeAnalystKey(rawAnalyst) {
      const normalized = String(rawAnalyst || '').trim().replace(/\s+/g, ' ');
      if (!normalized) return '';

      if (normalized.includes('@')) {
        return normalized.toLowerCase();
      }

      return normalized.toLocaleLowerCase('pt-BR');
    }

    normalizeAnalystDisplay(rawAnalyst) {
      const normalized = String(rawAnalyst || '').trim().replace(/\s+/g, ' ');
      if (!normalized) return 'Não informado';
      return normalized.includes('@') ? normalized.toLowerCase() : normalized;
    }

    pickPreferredAnalystDisplay(currentDisplay, candidateDisplay) {
      const current = String(currentDisplay || '').trim();
      const candidate = String(candidateDisplay || '').trim();

      if (!current) return candidate || 'Não informado';
      if (!candidate) return current;

      const currentIsEmail = current.includes('@');
      const candidateIsEmail = candidate.includes('@');

      if (currentIsEmail && !candidateIsEmail) return candidate;
      if (!currentIsEmail && candidateIsEmail) return current;

      return candidate.length > current.length ? candidate : current;
    }

    renderAnalystRanking(ranking) {
      const list = Array.isArray(ranking) ? ranking : [];
      if (this.elements.analystTotal) {
        const partialSuffix = this.state.analystRankingPartial
          ? ` (amostra parcial: limite ${numberFmt.format(this.state.analystRankingLimit)})`
          : '';
        this.elements.analystTotal.textContent = `${list.length} analistas${partialSuffix}`;
      }

      if (this.elements.analystPodium) {
        const topThree = list.slice(0, 3);
        this.elements.analystPodium.innerHTML = topThree.length > 0
          ? topThree.map((entry, index) => {
              const medalConfig = [
                { title: '1º Lugar', icon: 'bi-trophy-fill', color: 'warning', col: 'col-lg-5' },
                { title: '2º Lugar', icon: 'bi-award-fill', color: 'secondary', col: 'col-lg-4' },
                { title: '3º Lugar', icon: 'bi-award', color: 'danger', col: 'col-lg-3' }
              ][index];
              return `
                <div class="col-12 ${medalConfig.col}">
                  <div class="border rounded p-3 h-100 bg-${medalConfig.color} bg-opacity-10">
                    <div class="d-flex justify-content-between align-items-start">
                      <div>
                        <div class="small text-muted">${medalConfig.title}</div>
                        <div class="fw-semibold">${entry.analyst}</div>
                      </div>
                      <i class="bi ${medalConfig.icon} text-${medalConfig.color} fs-4"></i>
                    </div>
                    <div class="small mt-2">Atendimentos: ${numberFmt.format(entry.atendimentos)} | Cadastros: ${numberFmt.format(entry.cadastros)}</div>
                    <div class="fw-bold mt-1">Pontuação: ${numberFmt.format(entry.pontuacao)}</div>
                  </div>
                </div>
              `;
            }).join('')
          : '<div class="col-12 text-muted text-center py-2">Sem dados para exibir pódio.</div>';
      }

      if (!this.elements.analystTableBody) return;

      const maxPoints = list[0]?.pontuacao || 1;
      const rows = list.map((entry, index) => {
        // Mantém percentual mínimo para preservar visibilidade da barra mesmo em pontuação baixa.
        const progress = Math.max(MIN_PROGRESS_BAR_PERCENT, Math.round((entry.pontuacao / maxPoints) * 100));
        return `<tr>
          <td>
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-${index < 3 ? 'primary' : 'secondary'}">${index + 1}º</span>
              <div class="w-100">
                <div class="fw-medium">${entry.analyst}</div>
                <div class="progress" style="height: 6px;">
                  <div class="progress-bar" role="progressbar" style="width: ${progress}%"></div>
                </div>
              </div>
            </div>
          </td>
          <td class="text-end">${numberFmt.format(entry.atendimentos)}</td>
          <td class="text-end">${numberFmt.format(entry.cadastros)}</td>
          <td class="text-end text-success">${numberFmt.format(entry.aprovados)}</td>
          <td class="text-end text-danger">${numberFmt.format(entry.reprovados)}</td>
          <td class="text-end fw-semibold">${numberFmt.format(entry.pontuacao)}</td>
        </tr>`;
      }).join('');

      this.elements.analystTableBody.innerHTML = rows || '<tr><td colspan="6" class="text-muted text-center py-3">Sem dados</td></tr>';
    }

    renderMonthly(contracts, dateField = 'entrada') {
      const monthly = this.computeMonthlySummary(contracts, dateField);

      if (this.elements.monthTableBody) {
        const totalGeral = monthly.reduce((acc, m) => acc + m.total, 0);
        this.elements.monthTableBody.innerHTML = monthly.map((m) => `
          <tr>
            <td><i class="bi bi-calendar3 text-muted me-2"></i>${m.label}</td>
            <td class="text-end">${numberFmt.format(m.count)}</td>
            <td class="text-end fw-semibold">${m.total ? currency.format(m.total) : '--'}</td>
          </tr>
        `).join('') || '<tr><td colspan="3" class="text-muted text-center">Sem dados</td></tr>';
        
        // Adicionar linha de total
        if (monthly.length > 0) {
          const totalCount = monthly.reduce((acc, m) => acc + m.count, 0);
          this.elements.monthTableBody.innerHTML += `
            <tr class="table-light fw-bold">
              <td>Total Geral</td>
              <td class="text-end">${numberFmt.format(totalCount)}</td>
              <td class="text-end">${currency.format(totalGeral)}</td>
            </tr>
          `;
        }
      }

      if (!this.elements.monthChart || typeof Chart === 'undefined') return;
      if (this.charts.month) this.charts.month.destroy();

      this.charts.month = new Chart(this.elements.monthChart.getContext('2d'), {
        type: 'bar',
        data: {
          labels: monthly.map((m) => m.label),
          datasets: [
            {
              label: 'Valor Total',
              data: monthly.map((m) => m.total),
              backgroundColor: 'rgba(13, 110, 253, 0.7)',
              borderColor: '#0d6efd',
              borderWidth: 1,
              yAxisID: 'y',
              order: 2
            },
            {
              label: 'Qtd. Processos',
              data: monthly.map((m) => m.count),
              type: 'line',
              borderColor: '#198754',
              backgroundColor: 'rgba(25, 135, 84, 0.2)',
              tension: 0.3,
              fill: true,
              yAxisID: 'y1',
              order: 1
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: { 
              beginAtZero: true, 
              position: 'left',
              title: { display: true, text: 'Valor (R$)' },
              ticks: { 
                callback: (v) => {
                  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
                  if (v >= 1000) return `R$ ${(v / 1000).toFixed(0)}K`;
                  return currency.format(v);
                }
              }
            },
            y1: { 
              beginAtZero: true, 
              position: 'right', 
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'Processos' }
            },
          },
          plugins: { 
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  if (ctx.dataset.label === 'Valor Total') {
                    return `Valor: ${currency.format(ctx.raw)}`;
                  }
                  return `Processos: ${numberFmt.format(ctx.raw)}`;
                }
              }
            }
          },
        },
      });
    }

    renderSla(contracts) {
      const metrics = this.computeSlaMetrics(contracts);
      if (this.elements.slaLeadtime) this.elements.slaLeadtime.textContent = metrics.avgDays !== null ? `${metrics.avgDays.toFixed(1)} dias` : '--';
      if (this.elements.slaOnTrack) this.elements.slaOnTrack.textContent = metrics.onTrackPct !== null ? `${metrics.onTrackPct}%` : '--';
      if (this.elements.slaLate) this.elements.slaLate.textContent = metrics.latePct !== null ? `${metrics.latePct}%` : '--';
      if (this.elements.slaSamples) this.elements.slaSamples.textContent = metrics.samples ? numberFmt.format(metrics.samples) : '--';
    }

    renderTable(report) {
      if (!this.elements.resultsTableHead || !this.elements.resultsTableBody) return;
      const dataArray = Array.isArray(report.data)
        ? report.data
        : Object.entries(report.data || {}).flatMap(([group, items]) => items.map((item) => ({ grupo: group, ...item })));

      if (!dataArray.length) {
        this.elements.resultsTableHead.innerHTML = '<tr><th class="text-center">Dados</th></tr>';
        this.elements.resultsTableBody.innerHTML = '<tr><td class="text-muted text-center py-4">Nenhum registro encontrado com os filtros atuais</td></tr>';
        return;
      }

      const headers = Object.keys(dataArray[0]);
      this.elements.resultsTableHead.innerHTML = `<tr>${headers.map((h) => `<th class="text-nowrap">${this.prettyLabel(h)}</th>`).join('')}</tr>`;

      const MAX_ROWS = 100;
      const rows = dataArray.slice(0, MAX_ROWS).map((row) => {
        const cells = headers.map((h) => {
          let value = row[h] ?? '';
          // Formatar valores monetários
          if (h.toLowerCase().includes('valor') && !isNaN(parseFloat(value))) {
            value = currency.format(parseFloat(value));
          }
          return `<td>${value}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');

      const moreCount = dataArray.length > MAX_ROWS 
        ? `<tr class="table-light"><td colspan="${headers.length}" class="text-center text-muted py-2">
             <i class="bi bi-info-circle me-1"></i>
             Exibindo ${MAX_ROWS} de ${numberFmt.format(dataArray.length)} registros. 
             <a href="#" onclick="window.reportsPage.exportCurrent('csv'); return false;">Exportar todos para CSV</a>
           </td></tr>` 
        : '';
      this.elements.resultsTableBody.innerHTML = rows + moreCount;
    }

    toggleEmptyState(hasData) {
      if (!this.elements.emptyState) return;
      this.elements.emptyState.classList.toggle('d-none', hasData);
      
      // Também mostrar/ocultar a seção de resumo
      [
        this.elements.processTabs,
        this.elements.tabContent
      ].forEach((element) => {
        element?.classList.toggle('d-none', !hasData);
      });
    }

    enableExports(enabled, source = this.state.activeSource || 'processos') {
      const isWhatsapp = source === 'whatsapp';
      const canExport = Boolean(enabled) && !isWhatsapp;
      const buttons = [
        this.elements.exportBtn,
        this.elements.exportDropdown,
        this.elements.exportCurrentBtn,
        this.elements.exportPrintBtn
      ];

      buttons.forEach((btn) => {
        if (btn) btn.disabled = !canExport;
      });

      if (source === 'processos') {
        [
          this.elements.exportTableCsv,
          this.elements.exportTablePrint,
          this.elements.reportSelectAllBtn,
          this.elements.reportClearAllBtn,
          this.elements.customExportGenerateBtn
        ].forEach((btn) => {
          if (btn) btn.disabled = !enabled;
        });
      }

      if (source === 'aprovacao') {
        [
          this.elements.approvalExportCsv,
          this.elements.approvalExportPrint
        ].forEach((btn) => {
          if (btn) btn.disabled = !enabled;
        });
      }

      if (this.state.sources[source]) {
        this.state.sources[source].exportsEnabled = Boolean(enabled);
      }

      if (this.elements.exportBtn) {
        this.elements.exportBtn.innerHTML = source === 'aprovacao'
          ? '<i class="bi bi-file-earmark-spreadsheet me-1"></i>Exportar Aprovação'
          : '<i class="bi bi-file-earmark-spreadsheet me-1"></i>Exportar CSV';
      }
    }

    resetFilters() {
      this.elements.form?.reset();
      this.prefillDates();
      // Desmarcar todas as opções dos selects múltiplos
      if (this.elements.statusSelect) {
        Array.from(this.elements.statusSelect.options).forEach(opt => opt.selected = false);
      }
      if (this.elements.vendorSelect) {
        Array.from(this.elements.vendorSelect.options).forEach(opt => opt.selected = false);
      }
      if (this.elements.empreendimentoSelect) {
        Array.from(this.elements.empreendimentoSelect.options).forEach(opt => opt.selected = false);
      }
      if (this.elements.analystSelect) {
        Array.from(this.elements.analystSelect.options).forEach(opt => opt.selected = false);
      }
      if (this.elements.searchInput) {
        this.elements.searchInput.value = '';
      }
      if (this.state.templates.some((t) => t.id === 'completo')) {
        this.elements.template.value = 'completo';
      }
      this.elements.form?.classList.remove('was-validated');
      this.updateFilterSelectionCounters();
      this.renderActiveFilters();
      this.setCustomExportStatus('');
    }

    scrollToSection(section) {
      const targetId = this.sectionMap[section] || section;
      const tabConfig = this.sectionTabMap[section];
      const performScroll = () => {
        const el = document.getElementById(targetId) || document.querySelector(`[data-section="${targetId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };

      if (!tabConfig) {
        performScroll();
        return;
      }

      this.activateSource(tabConfig.source).then(() => {
        if (tabConfig.processTab) {
          const tabEl = document.getElementById(tabConfig.processTab);
          if (tabEl && !tabEl.classList.contains('active')) {
            const bsTab = new bootstrap.Tab(tabEl);
            bsTab.show();
            tabEl.addEventListener('shown.bs.tab', performScroll, { once: true });
            return;
          }
        }
        performScroll();
      });
    }

    async exportCurrent(format) {
      const exportFormat = format === 'print' ? 'print' : 'csv';
      const source = this.state.activeSource || 'processos';

      try {
        if (source === 'whatsapp') {
          return;
        }

        if (source === 'atividades') {
          this.exportActivityReport();
          return;
        }

        if (source === 'aprovacao') {
          const adapter = await this.loadApprovalAdapter();
          if (!adapter) return;

          const report = await this.ensureApprovalReportForCurrentFilters();
          if (!report) return;

          if (exportFormat === 'print') {
            await adapter.exportToPDF(report);
            return;
          }

          if (typeof adapter.exportFilteredCsv === 'function') {
            await adapter.exportFilteredCsv(this.getApprovalFilters());
            return;
          }

          await adapter.exportToCSV(report);
          return;
        }

        this.state.currentReport = await this.ensureProcessReportForCurrentFilters();
        format = exportFormat;
      } catch (error) {
        const actionLabel = exportFormat === 'print' ? 'preparar impressao' : 'exportar CSV';
        this.handleError(error, `Erro ao ${actionLabel}`);
        return;
      }

      if (!this.state.currentReport || !window.reportsService) return;
      if (format === 'print') {
        window.reportsService.exportToPDF(this.state.currentReport).catch((err) => this.handleError(err, 'Erro ao preparar impressão'));
        return;
      }
      window.reportsService.exportToCSV(this.state.currentReport);
    }

    exportCurrentLegacy(format) {
      return this.exportCurrent(format);
      /*
      if (this.state.activeSource === 'aprovacao') {
        const adapter = window.reportsApprovalAdapter;
        const report = this.state.sources.aprovacao.currentReport;
        if (!adapter || !report) return;
        if (format === 'print') {
          adapter.exportToPDF(report).catch((error) => this.handleError(error, 'Erro ao preparar impressão de aprovação'));
          return;
        }
        adapter.exportToCSV(report).catch((error) => this.handleError(error, 'Erro ao exportar aprovações'));
        return;
      }

      const exportFormat = format === 'print' ? 'print' : 'csv';
      const source = this.state.activeSource || 'processos';

      try {
        if (source === 'whatsapp') {
          return;
        }

        if (source === 'aprovacao') {
          const adapter = await this.loadApprovalAdapter();
          if (!adapter) return;

          const report = await this.ensureApprovalReportForCurrentFilters();
          if (!report) return;

          if (exportFormat === 'print') {
            await adapter.exportToPDF(report);
            return;
          }

          if (typeof adapter.exportFilteredCsv === 'function') {
            await adapter.exportFilteredCsv(this.getApprovalFilters());
            return;
          }

          await adapter.exportToCSV(report);
          return;
        }

        this.state.currentReport = await this.ensureProcessReportForCurrentFilters();
        format = exportFormat;
      } catch (error) {
        const actionLabel = exportFormat === 'print' ? 'preparar impressao' : 'exportar CSV';
        this.handleError(error, `Erro ao ${actionLabel}`);
        return;
      }

      const exportFormat = format === 'print' ? 'print' : 'csv';
      const source = this.state.activeSource || 'processos';

      try {
        if (source === 'whatsapp') {
          return;
        }

        if (source === 'aprovacao') {
          const adapter = await this.loadApprovalAdapter();
          if (!adapter) return;

          const report = await this.ensureApprovalReportForCurrentFilters();
          if (!report) return;

          if (exportFormat === 'print') {
            await adapter.exportToPDF(report);
            return;
          }

          if (typeof adapter.exportFilteredCsv === 'function') {
            await adapter.exportFilteredCsv(this.getApprovalFilters());
            return;
          }

          await adapter.exportToCSV(report);
          return;
        }

        this.state.currentReport = await this.ensureProcessReportForCurrentFilters();
        format = exportFormat;
      } catch (error) {
        const actionLabel = exportFormat === 'print' ? 'preparar impressao' : 'exportar CSV';
        this.handleError(error, `Erro ao ${actionLabel}`);
        return;
      }

      if (!this.state.currentReport || !window.reportsService) return;
      if (format === 'print') {
        window.reportsService.exportToPDF(this.state.currentReport).catch((err) => this.handleError(err, 'Erro ao preparar impressão'));
        return;
      }
      window.reportsService.exportToCSV(this.state.currentReport);
      */
    }

    computeMonthlySummary(contracts, dateField = 'dataAssinatura') {
      const map = new Map();
      (contracts || []).forEach((contract) => {
        const date = this.coerceTimestampToDate(contract[dateField]);
        if (!date) return;

        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!map.has(key)) {
          map.set(key, { count: 0, total: 0 });
        }
        const entry = map.get(key);
        entry.count += 1;
        entry.total += parseFloat(contract.valorContrato) || 0;
      });

      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, data]) => {
          const [year, month] = key.split('-');
          const label = new Date(Number(year), Number(month) - 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
          return { key, label, ...data };
        });
    }

    computeSlaMetrics(contracts) {
      const metrics = { samples: 0, totalDays: 0, onTime: 0, late: 0 };
      const targetFallback = 30;

      (contracts || []).forEach((contract) => {
        // Usar entrada como início e dataRetiradaContratoRegistrado como fim (se existir)
        const start = this.coerceTimestampToDate(contract.entrada || contract.dataAssinatura);
        const end = this.coerceTimestampToDate(contract.dataRetiradaContratoRegistrado || contract.dataEntrega);
        if (!start) return;
        
        // Se tem data de fim, calcular dias decorridos
        let days;
        if (end) {
          days = Math.max(0, (end - start) / DAY_MS);
        } else {
          // Processo em andamento - calcular dias desde início até hoje
          const today = new Date();
          days = Math.max(0, (today - start) / DAY_MS);
        }
        
        metrics.samples += 1;
        metrics.totalDays += days;

        // Verificar se está dentro do prazo configurado para o status
        const target = this.getSlaDaysForStatus(contract.status) || targetFallback;
        if (days <= target) {
          metrics.onTime += 1;
        } else {
          metrics.late += 1;
        }
      });

      metrics.avgDays = metrics.samples ? metrics.totalDays / metrics.samples : null;
      metrics.onTrackPct = metrics.samples ? Math.round((metrics.onTime / metrics.samples) * 100) : null;
      metrics.latePct = metrics.samples ? Math.round((metrics.late / metrics.samples) * 100) : null;
      return metrics;
    }

    legacyIsFinishedStatus(status) {
      const finishedKeywords = ['finalizado', 'concluído', 'concluido', 'pago', 'cancelado'];
      if (!status) return false;
      const normalized = status.toString().toLowerCase();
      return finishedKeywords.some((kw) => normalized.includes(kw));
    }

    prettyLabel(key) {
      const labels = {
        vendedorConstrutora: 'Vendedor/Construtora',
        clientePrincipal: 'Cliente',
        clienteConjuge: 'Cônjuge',
        valorContrato: 'Valor do Contrato',
        dataAssinatura: 'Data de Assinatura',
        dataAssinaturaCliente: 'Data Assinatura Cliente',
        dataEntradaRegistro: 'Data Entrada Cartório',
        dataRetiradaContratoRegistrado: 'Data Contrato Registrado',
        dataEntrega: 'Data de Entrega',
        entrada: 'Entrada',
        financiamento: 'Financiamento',
        saldoReceber: 'Saldo a Receber',
        status: 'Status',
        situacao: 'Situação',
        empreendimento: 'Empreendimento',
        analista: 'Analista',
        analistaAprovacao: 'Analista de Aprovação',
        cpfPrincipal: 'CPF',
        construtora: 'Construtora',
        convertidoParaProcesso: 'Convertida',
        dataAprovacao: 'Data de Aprovação',
        grupo: 'Grupo',
      };
      return labels[key] || key;
    }

    escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    handleError(error, fallbackMessage) {
      console.error('[ReportsPage] ', error);
      if (window.notificationService) {
        window.notificationService.showNotification(fallbackMessage || error.message, 'error');
      } else {
        alert(fallbackMessage || error.message);
      }
    }

    // ==================== KPIs SECUNDARIOS ====================

    renderSecondaryKpis(report, contracts, filters) {
      const total = contracts.length;
      const finished = contracts.filter((c) => this.isFinishedStatus(c.status)).length;
      const cancelled = contracts.filter((c) => this.isCancelledStatus(c.status)).length;
      const completed = contracts.filter((c) => this.isClosedStatus(c.status)).length;

      // Novos no periodo
      let newInPeriod = 0;
      if (filters.dataInicio) {
        const startDate = new Date(filters.dataInicio);
        newInPeriod = contracts.filter((c) => {
          const date = this.coerceTimestampToDate(c.entrada || c.criadoEm);
          return Boolean(date) && date >= startDate;
        }).length;
      } else {
        newInPeriod = total;
      }

      // Taxa de conclusao
      const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';

      // Crescimento mensal (comparar mes atual vs anterior)
      const growth = this.computeMonthlyGrowth(contracts);

      if (this.elements.finishedCount) this.elements.finishedCount.textContent = numberFmt.format(finished);
      if (this.elements.cancelledCount) this.elements.cancelledCount.textContent = numberFmt.format(cancelled);
      if (this.elements.newPeriodCount) this.elements.newPeriodCount.textContent = numberFmt.format(newInPeriod);
      if (this.elements.completionRate) this.elements.completionRate.textContent = `${completionRate}%`;

      if (this.elements.monthlyGrowth) {
        if (growth !== null) {
          const sign = growth >= 0 ? '+' : '';
          this.elements.monthlyGrowth.textContent = `${sign}${growth.toFixed(1)}%`;
          this.elements.monthlyGrowth.className = `fs-5 fw-bold ${growth >= 0 ? 'text-success' : 'text-danger'}`;
        } else {
          this.elements.monthlyGrowth.textContent = '--';
          this.elements.monthlyGrowth.className = 'fs-5 fw-bold';
        }
      }
      if (this.elements.growthIcon) {
        this.elements.growthIcon.className = growth !== null && growth >= 0
          ? 'bi bi-graph-up-arrow text-success fs-4'
          : 'bi bi-graph-down-arrow text-danger fs-4';
      }

      // Pendencias ativas serão preenchidas pela loadAndRenderPendencias
    }

    computeMonthlyGrowth(contracts) {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

      let currentCount = 0;
      let prevCount = 0;
      (contracts || []).forEach((c) => {
        const date = this.coerceTimestampToDate(c.entrada || c.criadoEm);
        if (!date) return;
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (key === currentMonth) currentCount++;
        if (key === prevMonth) prevCount++;
      });

      if (prevCount === 0) return currentCount > 0 ? 100 : null;
      return ((currentCount - prevCount) / prevCount) * 100;
    }

    legacyIsCancelledStatus(status) {
      if (!status) return false;
      const normalized = status.toString().toLowerCase();
      return normalized.includes('cancelado') || normalized.includes('desistencia') || normalized.includes('desistência');
    }

    // ==================== FUNIL DE PROCESSOS ====================

    renderFunnel(contracts) {
      if (!this.elements.funnelContainer) return;

      // Agrupar por statusOrder para criar sequencia logica do funil
      const statusGroups = new Map();
      (contracts || []).forEach((c) => {
        const status = c.status || 'Sem status';
        const statusMetadata = this.getStatusMetadata(status);
        const statusOrder = Number(c.statusOrder ?? statusMetadata?.order);
        if (!statusGroups.has(status)) {
          statusGroups.set(status, {
            count: 0,
            order: Number.isFinite(statusOrder) ? statusOrder : 999
          });
        }
        statusGroups.get(status).count++;
      });

      const sorted = Array.from(statusGroups.entries())
        .sort((a, b) => a[1].order - b[1].order);

      const total = contracts.length || 1;
      if (this.elements.funnelTotal) {
        this.elements.funnelTotal.textContent = `${numberFmt.format(contracts.length)} processos`;
      }

      if (sorted.length === 0) {
        this.elements.funnelContainer.innerHTML = '<div class="text-muted text-center py-3">Sem dados para o funil</div>';
        return;
      }

      const maxCount = sorted[0][1].count || 1;

      // Construir tabela visual como funil
      const rows = sorted.map(([status, data], index) => {
        const widthPct = Math.max(8, (data.count / maxCount) * 100);
        const pctOfTotal = ((data.count / total) * 100).toFixed(1);
        const colorIndex = index % CHART_COLORS.length;
        const color = CHART_COLORS[colorIndex];
        return `<tr>
          <td class="text-end pe-3 text-nowrap small fw-medium" style="width:1%;white-space:nowrap" title="${status}">${status}</td>
          <td style="width:60%">
            <div class="d-flex align-items-center gap-2">
              <div class="rounded-1" style="width:${widthPct}%;height:24px;background-color:${color};opacity:0.85;min-width:28px;transition:width 0.4s ease"></div>
              <span class="small fw-semibold text-nowrap">${numberFmt.format(data.count)}</span>
            </div>
          </td>
          <td class="text-end text-muted small ps-2" style="width:1%;white-space:nowrap">${pctOfTotal}%</td>
        </tr>`;
      }).join('');

      this.elements.funnelContainer.innerHTML = `
        <div class="table-responsive">
          <table class="table table-sm table-borderless align-middle mb-0">
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    // ==================== DESEMPENHO POR EMPREENDIMENTO ====================

    renderEmpreendimento(contracts) {
      if (!this.elements.empreendimentoTableBody) return;

      const summary = {};
      (contracts || []).forEach((c) => {
        const emp = c.empreendimento || 'Nao informado';
        if (!summary[emp]) {
          summary[emp] = { count: 0, total: 0, finished: 0 };
        }
        summary[emp].count++;
        summary[emp].total += parseFloat(c.valorContrato) || 0;
        if (this.isFinishedStatus(c.status)) summary[emp].finished++;
      });

      const sorted = Object.entries(summary).sort((a, b) => b[1].count - a[1].count);

      if (this.elements.empreendimentoTotal) {
        this.elements.empreendimentoTotal.textContent = `${sorted.length} empreendimentos`;
      }

      // Tabela
      this.elements.empreendimentoTableBody.innerHTML = sorted.map(([emp, data]) => {
        const ticket = data.count > 0 ? data.total / data.count : 0;
        const conclusionRate = data.count > 0 ? ((data.finished / data.count) * 100).toFixed(1) : '0.0';
        const rateClass = parseFloat(conclusionRate) >= 70 ? 'text-success' : parseFloat(conclusionRate) >= 40 ? 'text-warning-emphasis' : 'text-danger';
        return `<tr>
          <td class="fw-medium">${emp}</td>
          <td class="text-end">${numberFmt.format(data.count)}</td>
          <td class="text-end">${data.total ? currency.format(data.total) : '--'}</td>
          <td class="text-end">${ticket ? currency.format(ticket) : '--'}</td>
          <td class="text-end"><span class="${rateClass} fw-semibold">${conclusionRate}%</span></td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="text-muted text-center py-3">Sem dados</td></tr>';

      // Grafico (top 10 empreendimentos)
      if (!this.elements.empreendimentoChart || typeof Chart === 'undefined') return;
      if (this.charts.empreendimento) this.charts.empreendimento.destroy();

      const top10 = sorted.slice(0, 10);
      this.charts.empreendimento = new Chart(this.elements.empreendimentoChart.getContext('2d'), {
        type: 'bar',
        data: {
          labels: top10.map(([emp]) => emp.length > 20 ? emp.substring(0, 18) + '...' : emp),
          datasets: [{
            label: 'Processos',
            data: top10.map(([, d]) => d.count),
            backgroundColor: CHART_COLORS.slice(0, top10.length),
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const emp = top10[ctx.dataIndex];
                  return `${numberFmt.format(ctx.raw)} processos | ${currency.format(emp[1].total)}`;
                }
              }
            }
          },
          scales: {
            x: { beginAtZero: true, ticks: { stepSize: 1 } },
          },
        },
      });
    }

    // ==================== AGING REPORT ====================

    renderAging(contracts) {
      if (!this.elements.agingTableBody) return;

      const now = new Date();
      const activeContracts = (contracts || []).filter((c) => !this.isClosedStatus(c.status));

      if (this.elements.agingTotal) {
        this.elements.agingTotal.textContent = `${numberFmt.format(activeContracts.length)} processos ativos`;
      }

      // Agrupar por status e calcular tempo medio/maximo no status
      const agingMap = new Map();
      activeContracts.forEach((c) => {
        const status = c.status || 'Sem status';
        const changedAt = this.coerceTimestampToDate(c.statusChangedAt || c.entrada);
        if (!changedAt) return;

        const days = Math.max(0, (now - changedAt) / DAY_MS);
        if (!agingMap.has(status)) {
          agingMap.set(status, { count: 0, totalDays: 0, maxDays: 0 });
        }
        const entry = agingMap.get(status);
        entry.count++;
        entry.totalDays += days;
        entry.maxDays = Math.max(entry.maxDays, days);
      });

      const sorted = Array.from(agingMap.entries())
        .map(([status, data]) => ({
          status,
          count: data.count,
          avgDays: data.count > 0 ? data.totalDays / data.count : 0,
          maxDays: data.maxDays,
        }))
        .sort((a, b) => b.avgDays - a.avgDays);

      // Tabela
      this.elements.agingTableBody.innerHTML = sorted.map((entry) => {
        const alertLevel = entry.avgDays > 30 ? 'danger' : entry.avgDays > 15 ? 'warning' : 'success';
        const alertIcon = entry.avgDays > 30 ? 'bi-exclamation-triangle-fill' : entry.avgDays > 15 ? 'bi-exclamation-circle' : 'bi-check-circle';
        return `<tr>
          <td>${entry.status}</td>
          <td class="text-end">${numberFmt.format(entry.count)}</td>
          <td class="text-end fw-semibold">${entry.avgDays.toFixed(1)}</td>
          <td class="text-end">${Math.ceil(entry.maxDays)}</td>
          <td class="text-center"><i class="bi ${alertIcon} text-${alertLevel}"></i></td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="text-muted text-center py-3">Sem dados</td></tr>';

      // Grafico de aging
      if (!this.elements.agingChart || typeof Chart === 'undefined') return;
      if (this.charts.aging) this.charts.aging.destroy();

      this.charts.aging = new Chart(this.elements.agingChart.getContext('2d'), {
        type: 'bar',
        data: {
          labels: sorted.map((e) => e.status.length > 18 ? e.status.substring(0, 16) + '...' : e.status),
          datasets: [
            {
              label: 'Media (dias)',
              data: sorted.map((e) => Math.round(e.avgDays * 10) / 10),
              backgroundColor: sorted.map((e) =>
                e.avgDays > 30 ? 'rgba(220, 53, 69, 0.7)' :
                e.avgDays > 15 ? 'rgba(255, 193, 7, 0.7)' :
                'rgba(25, 135, 84, 0.7)'
              ),
              borderWidth: 1,
            },
            {
              label: 'Maximo (dias)',
              data: sorted.map((e) => Math.ceil(e.maxDays)),
              backgroundColor: 'rgba(108, 117, 125, 0.3)',
              borderColor: 'rgba(108, 117, 125, 0.5)',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { position: 'bottom' } },
          scales: {
            x: {
              beginAtZero: true,
              title: { display: true, text: 'Dias' },
            },
          },
        },
      });
    }

    // ==================== PAINEL DE PENDENCIAS ====================

    async loadAndRenderPendencias(forceRefresh = false) {
      try {
        if (!window.firestoreService?.getPendenciasForReports) {
          this.renderPendenciasEmpty();
          return;
        }

        const pendencias = await window.firestoreService.getPendenciasForReports(forceRefresh);
        this.renderPendencias(pendencias);
      } catch (error) {
        console.warn('[ReportsPage] Erro ao carregar pendencias:', error);
        this.renderPendenciasEmpty();
      }
    }

    renderPendenciasEmpty() {
      const setText = (el, val) => { if (el) el.textContent = val; };
      setText(this.elements.pendenciasTotal, '0 pendencias');
      setText(this.elements.pendenciasUrgent, '0');
      setText(this.elements.pendenciasHigh, '0');
      setText(this.elements.pendenciasNormal, '0');
      setText(this.elements.pendenciasOverdue, '0');
      setText(this.elements.activePendencias, '0');
      if (this.elements.pendenciasTableBody) {
        this.elements.pendenciasTableBody.innerHTML = '<tr><td colspan="6" class="text-muted text-center py-3">Sem pendencias registradas</td></tr>';
      }
    }

    renderPendencias(pendencias) {
      const now = new Date();
      const open = pendencias.filter((p) => p.status !== 'resolvida' && p.status !== 'cancelada');
      const urgent = open.filter((p) => p.prioridade === 'urgente');
      const high = open.filter((p) => p.prioridade === 'alta');
      const normal = open.filter((p) => !p.prioridade || p.prioridade === 'normal' || p.prioridade === 'baixa');

      const overdue = open.filter((p) => {
        if (!p.prazo) return false;
        const prazoDate = p.prazo.toDate ? p.prazo.toDate() : new Date(p.prazo);
        return !isNaN(prazoDate.getTime()) && prazoDate < now;
      });

      const setText = (el, val) => { if (el) el.textContent = val; };
      setText(this.elements.pendenciasTotal, `${pendencias.length} pendencias`);
      setText(this.elements.pendenciasUrgent, numberFmt.format(urgent.length));
      setText(this.elements.pendenciasHigh, numberFmt.format(high.length));
      setText(this.elements.pendenciasNormal, numberFmt.format(normal.length));
      setText(this.elements.pendenciasOverdue, numberFmt.format(overdue.length));
      setText(this.elements.activePendencias, numberFmt.format(open.length));

      // Tabela por setor
      const setorMap = new Map();
      pendencias.forEach((p) => {
        const setor = p.setorResponsavel || 'Sem setor';
        if (!setorMap.has(setor)) {
          setorMap.set(setor, { total: 0, open: 0, resolved: 0, overdue: 0 });
        }
        const entry = setorMap.get(setor);
        entry.total++;
        if (p.status === 'resolvida') {
          entry.resolved++;
        } else if (p.status !== 'cancelada') {
          entry.open++;
          if (p.prazo) {
            const prazoDate = p.prazo.toDate ? p.prazo.toDate() : new Date(p.prazo);
            if (!isNaN(prazoDate.getTime()) && prazoDate < now) entry.overdue++;
          }
        }
      });

      if (this.elements.pendenciasTableBody) {
        const rows = Array.from(setorMap.entries())
          .sort((a, b) => b[1].total - a[1].total)
          .map(([setor, data]) => {
            const resRate = data.total > 0 ? ((data.resolved / data.total) * 100).toFixed(1) : '0.0';
            const rateClass = parseFloat(resRate) >= 70 ? 'text-success' : parseFloat(resRate) >= 40 ? 'text-warning-emphasis' : 'text-danger';
            return `<tr>
              <td class="fw-medium">${setor}</td>
              <td class="text-end">${numberFmt.format(data.total)}</td>
              <td class="text-end">${numberFmt.format(data.open)}</td>
              <td class="text-end">${numberFmt.format(data.resolved)}</td>
              <td class="text-end">${data.overdue > 0 ? `<span class="text-danger fw-semibold">${numberFmt.format(data.overdue)}</span>` : '0'}</td>
              <td class="text-end"><span class="${rateClass} fw-semibold">${resRate}%</span></td>
            </tr>`;
          }).join('');
        this.elements.pendenciasTableBody.innerHTML = rows || '<tr><td colspan="6" class="text-muted text-center py-3">Sem dados</td></tr>';
      }
    }

    // ==================== DISTRIBUICAO GEOGRAFICA ====================

    renderGeographic(contracts) {
      if (!this.elements.geoTableBody) return;

      const geoMap = new Map();
      (contracts || []).forEach((c) => {
        // Pegar UF e municipio dos compradores ou do contrato
        let uf = '';
        let municipio = '';
        if (Array.isArray(c.compradores) && c.compradores.length > 0) {
          const principal = c.compradores.find((comp) => comp.principal) || c.compradores[0];
          uf = principal?.uf || '';
          municipio = principal?.cidade || '';
        }
        if (!municipio && c.municipioImovel) {
          municipio = c.municipioImovel;
        }
        if (!uf) uf = 'N/I';
        if (!municipio) municipio = 'N/I';

        const key = `${uf}|${municipio}`;
        if (!geoMap.has(key)) {
          geoMap.set(key, { uf, municipio, count: 0 });
        }
        geoMap.get(key).count++;
      });

      const total = contracts.length || 1;
      const sorted = Array.from(geoMap.values()).sort((a, b) => b.count - a.count);

      // Contagem por UF para grafico
      const ufMap = new Map();
      sorted.forEach((entry) => {
        ufMap.set(entry.uf, (ufMap.get(entry.uf) || 0) + entry.count);
      });

      if (this.elements.geoTotal) {
        const uniqueMunicipios = new Set(sorted.filter((e) => e.municipio !== 'N/I').map((e) => e.municipio));
        this.elements.geoTotal.textContent = `${uniqueMunicipios.size} municipios`;
      }

      // Tabela
      this.elements.geoTableBody.innerHTML = sorted.map((entry) => {
        const pct = ((entry.count / total) * 100).toFixed(1);
        return `<tr>
          <td><span class="badge bg-secondary me-1">${entry.uf}</span></td>
          <td>${entry.municipio}</td>
          <td class="text-end">${numberFmt.format(entry.count)}</td>
          <td class="text-end">${pct}%</td>
        </tr>`;
      }).join('') || '<tr><td colspan="4" class="text-muted text-center py-3">Sem dados</td></tr>';

      // Grafico por UF (top 10)
      if (!this.elements.geoChart || typeof Chart === 'undefined') return;
      if (this.charts.geo) this.charts.geo.destroy();

      const ufSorted = Array.from(ufMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

      this.charts.geo = new Chart(this.elements.geoChart.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ufSorted.map(([uf]) => uf),
          datasets: [{
            data: ufSorted.map(([, count]) => count),
            backgroundColor: CHART_COLORS.slice(0, ufSorted.length),
            borderWidth: 2,
            borderColor: '#fff',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const pct = ((ctx.raw / total) * 100).toFixed(1);
                  return `${ctx.label}: ${numberFmt.format(ctx.raw)} processos (${pct}%)`;
                }
              }
            }
          },
          cutout: '50%',
        },
      });
    }

    // ==================== WHATSAPP REPORTS ====================

    async generateWhatsappReport() {
      const dateStart = this.elements.whatsappDateStart?.value;
      const dateEnd = this.elements.whatsappDateEnd?.value;
      const reportType = this.elements.whatsappReportType?.value || 'geral';

      if (!dateStart || !dateEnd) {
        this.handleError(null, 'Selecione o período para gerar o relatório WhatsApp');
        return;
      }

      this.elements.whatsappGenerateBtn?.setAttribute('disabled', 'true');
      const originalText = this.elements.whatsappGenerateBtn?.innerHTML;
      if (this.elements.whatsappGenerateBtn) {
        this.elements.whatsappGenerateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Gerando...';
      }

      try {
        const filters = {
          startDate: new Date(dateStart),
          endDate: new Date(dateEnd + 'T23:59:59'),
          type: reportType,
        };

        // Buscar dados do WhatsApp
        const chats = await this.fetchWhatsappChats(filters);
        const agents = await this.fetchWhatsappAgents();

        // Calcular métricas
        const metrics = this.computeWhatsappMetrics(chats, agents);

        // Renderizar KPIs
        this.renderWhatsappKpis(metrics);

        // Renderizar gráficos
        this.renderWhatsappDepartmentChart(metrics.byDepartment);
        this.renderWhatsappTimelineChart(metrics.byDate);

        // Renderizar tabelas
        this.renderWhatsappAgentsTable(metrics.byAgent);
        this.renderWhatsappStatusTable(metrics.byDepartmentStatus);

        window.debug && window.debug(' Relatório WhatsApp gerado com sucesso', metrics);
      } catch (error) {
        this.handleError(error, 'Erro ao gerar relatório WhatsApp');
      } finally {
        this.elements.whatsappGenerateBtn?.removeAttribute('disabled');
        if (this.elements.whatsappGenerateBtn) {
          this.elements.whatsappGenerateBtn.innerHTML = originalText || '<i class="bi bi-play-fill me-2"></i>Gerar Relatório';
        }
      }
    }

    async fetchWhatsappChats(filters) {
      try {
        if (!window.firebase?.firestore) {
          throw new Error('Firestore não disponível');
        }
        const db = window.firebase.firestore();
        let query = db.collection('chats');

        if (filters.startDate) {
          query = query.where('createdAt', '>=', filters.startDate);
        }
        if (filters.endDate) {
          query = query.where('createdAt', '<=', filters.endDate);
        }

        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (error) {
        console.warn('[WhatsApp Reports] Erro ao buscar chats:', error);
        return [];
      }
    }

    async fetchWhatsappAgents() {
      try {
        if (!window.firebase?.firestore) {
          throw new Error('Firestore não disponível');
        }
        const db = window.firebase.firestore();
        const snapshot = await db.collection('users')
          .where('whatsapp.isAgent', '==', true)
          .get();
        return snapshot.docs.map(doc => {
          const data = doc.data() || {};
          const whatsapp = data.whatsapp || {};
          return {
            id: doc.id,
            name: data.shortName || data.fullName || data.displayName || data.name || data.email || 'Agente',
            email: data.email || null,
            status: whatsapp.status || null,
            department: whatsapp.department || null,
            activeChats: whatsapp.activeChats || 0,
            totalAssigned: whatsapp.totalAssigned || 0,
            totalResolved: whatsapp.totalResolved || 0
          };
        });
      } catch (error) {
        console.warn('[WhatsApp Reports] Erro ao buscar agentes:', error);
        return [];
      }
    }

    legacyComputeWhatsappMetrics(chats, agents) {
      const metrics = {
        total: chats.length,
        resolved: 0,
        avgResponseTime: 0,
        avgSatisfaction: 0,
        byDepartment: {},
        byAgent: {},
        byDate: {},
        byDepartmentStatus: {},
      };

      let totalResponseTime = 0;
      let responseTimeCount = 0;
      let totalSatisfaction = 0;
      let satisfactionCount = 0;

      const agentMap = new Map(agents.map(a => [a.id, a]));

      chats.forEach(chat => {
        // Status resolvido
        if (chat.status === 'resolvido' || chat.status === 'resolved') {
          metrics.resolved++;
        }

        // Tempo de resposta
        if (chat.firstResponseAt && chat.createdAt) {
          const created = chat.createdAt.toDate ? chat.createdAt.toDate() : new Date(chat.createdAt);
          const firstResponse = chat.firstResponseAt.toDate ? chat.firstResponseAt.toDate() : new Date(chat.firstResponseAt);
          const responseTime = (firstResponse - created) / 60000; // minutos
          if (responseTime > 0 && responseTime < 1440) { // menos de 24h
            totalResponseTime += responseTime;
            responseTimeCount++;
          }
        }

        // Satisfação
        if (chat.satisfactionScore && chat.satisfactionScore > 0) {
          totalSatisfaction += chat.satisfactionScore;
          satisfactionCount++;
        }

        // Por departamento
        const dept = chat.department || 'Não atribuído';
        if (!metrics.byDepartment[dept]) {
          metrics.byDepartment[dept] = { total: 0, resolved: 0 };
        }
        metrics.byDepartment[dept].total++;
        if (chat.status === 'resolvido' || chat.status === 'resolved') {
          metrics.byDepartment[dept].resolved++;
        }

        // Por agente
        if (chat.agentId) {
          const agent = agentMap.get(chat.agentId);
          const agentName = agent?.name || chat.agentId;
          if (!metrics.byAgent[agentName]) {
            metrics.byAgent[agentName] = { total: 0, resolved: 0, avgTime: 0, times: [] };
          }
          metrics.byAgent[agentName].total++;
          if (chat.status === 'resolvido' || chat.status === 'resolved') {
            metrics.byAgent[agentName].resolved++;
          }
          if (chat.resolvedAt && chat.assignedAt) {
            const assigned = chat.assignedAt.toDate ? chat.assignedAt.toDate() : new Date(chat.assignedAt);
            const resolved = chat.resolvedAt.toDate ? chat.resolvedAt.toDate() : new Date(chat.resolvedAt);
            const resTime = (resolved - assigned) / 60000;
            if (resTime > 0) {
              metrics.byAgent[agentName].times.push(resTime);
            }
          }
        }

        // Por data
        const chatDate = chat.createdAt?.toDate ? chat.createdAt.toDate() : new Date(chat.createdAt);
        if (chatDate && !isNaN(chatDate.getTime())) {
          const dateKey = chatDate.toISOString().split('T')[0];
          if (!metrics.byDate[dateKey]) {
            metrics.byDate[dateKey] = { total: 0, resolved: 0 };
          }
          metrics.byDate[dateKey].total++;
          if (chat.status === 'resolvido' || chat.status === 'resolved') {
            metrics.byDate[dateKey].resolved++;
          }
        }

        // Por departamento x status
        const status = chat.status || 'desconhecido';
        if (!metrics.byDepartmentStatus[dept]) {
          metrics.byDepartmentStatus[dept] = {};
        }
        metrics.byDepartmentStatus[dept][status] = (metrics.byDepartmentStatus[dept][status] || 0) + 1;
      });

      // Calcular médias
      metrics.avgResponseTime = responseTimeCount > 0 ? Math.round(totalResponseTime / responseTimeCount) : 0;
      metrics.avgSatisfaction = satisfactionCount > 0 ? (totalSatisfaction / satisfactionCount).toFixed(1) : 'N/A';

      // Calcular tempo médio por agente
      Object.values(metrics.byAgent).forEach(agent => {
        if (agent.times.length > 0) {
          agent.avgTime = Math.round(agent.times.reduce((a, b) => a + b, 0) / agent.times.length);
        }
      });

      return metrics;
    }

    renderWhatsappKpis(metrics) {
      if (this.elements.whatsappTotalChats) {
        this.elements.whatsappTotalChats.textContent = numberFmt.format(metrics.total);
      }
      if (this.elements.whatsappResolved) {
        this.elements.whatsappResolved.textContent = numberFmt.format(metrics.resolved);
      }
      if (this.elements.whatsappAvgResponse) {
        this.elements.whatsappAvgResponse.textContent = metrics.avgResponseTime > 0 
          ? `${metrics.avgResponseTime} min` 
          : 'N/A';
      }
      if (this.elements.whatsappSatisfaction) {
        this.elements.whatsappSatisfaction.textContent = metrics.avgSatisfaction !== 'N/A' 
          ? `${metrics.avgSatisfaction}/5` 
          : 'N/A';
      }
    }

    renderWhatsappDepartmentChart(byDepartment) {
      const canvas = this.elements.whatsappDepartmentChart;
      if (!canvas || typeof Chart === 'undefined') return;

      const ctx = canvas.getContext('2d');
      if (this.whatsappCharts.department) {
        this.whatsappCharts.department.destroy();
      }

      const labels = Object.keys(byDepartment);
      const data = labels.map(dept => byDepartment[dept].total);
      const resolvedData = labels.map(dept => byDepartment[dept].resolved);

      this.whatsappCharts.department = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Total de Chats',
              data,
              backgroundColor: 'rgba(13, 110, 253, 0.7)',
              borderColor: '#0d6efd',
              borderWidth: 1,
            },
            {
              label: 'Resolvidos',
              data: resolvedData,
              backgroundColor: 'rgba(25, 135, 84, 0.7)',
              borderColor: '#198754',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' },
          },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } },
          },
        },
      });
    }

    renderWhatsappTimelineChart(byDate) {
      const canvas = this.elements.whatsappTimelineChart;
      if (!canvas || typeof Chart === 'undefined') return;

      const ctx = canvas.getContext('2d');
      if (this.whatsappCharts.timeline) {
        this.whatsappCharts.timeline.destroy();
      }

      const sortedDates = Object.keys(byDate).sort();
      const labels = sortedDates.map(d => {
        const date = new Date(d);
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      });
      const totalData = sortedDates.map(d => byDate[d].total);
      const resolvedData = sortedDates.map(d => byDate[d].resolved);

      this.whatsappCharts.timeline = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Total de Chats',
              data: totalData,
              borderColor: '#0d6efd',
              backgroundColor: 'rgba(13, 110, 253, 0.1)',
              fill: true,
              tension: 0.3,
            },
            {
              label: 'Resolvidos',
              data: resolvedData,
              borderColor: '#198754',
              backgroundColor: 'rgba(25, 135, 84, 0.1)',
              fill: true,
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' },
          },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } },
          },
        },
      });
    }

    renderWhatsappAgentsTable(byAgent) {
      const tbody = this.elements.whatsappAgentsTableBody;
      if (!tbody) return;

      const agents = Object.entries(byAgent).sort((a, b) => b[1].total - a[1].total);

      if (agents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Nenhum dado de agente encontrado</td></tr>';
        return;
      }

      tbody.innerHTML = agents.map(([name, data]) => {
        const resolutionRate = data.total > 0 ? Math.round((data.resolved / data.total) * 100) : 0;
        const avgTimeStr = data.avgTime > 0 ? `${data.avgTime} min` : 'N/A';
        const rateClass = resolutionRate >= 80 ? 'text-success' : resolutionRate >= 50 ? 'text-warning' : 'text-danger';
        return `
          <tr>
            <td><i class="bi bi-person-circle me-2"></i>${name}</td>
            <td class="text-center">${data.total}</td>
            <td class="text-center">${data.resolved}</td>
            <td class="text-center ${rateClass}">${resolutionRate}%</td>
            <td class="text-center">${avgTimeStr}</td>
          </tr>
        `;
      }).join('');
    }

    legacyRenderWhatsappStatusTable(byDepartmentStatus) {
      const tbody = this.elements.whatsappStatusTableBody;
      if (!tbody) return;

      const departments = Object.keys(byDepartmentStatus);
      
      if (departments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Nenhum dado encontrado</td></tr>';
        return;
      }

      const statusLabels = { // eslint-disable-line no-unused-vars
        novo: { label: 'Novo', class: 'primary' },
        atribuido: { label: 'Atribuído', class: 'info' },
        ativo: { label: 'Ativo', class: 'success' },
        aguardando: { label: 'Aguardando', class: 'warning' },
        resolvido: { label: 'Resolvido', class: 'secondary' },
        resolved: { label: 'Resolvido', class: 'secondary' },
      };

      tbody.innerHTML = departments.map(dept => {
        const statusData = byDepartmentStatus[dept];
        
        return `
          <tr>
            <td><strong>${dept}</strong></td>
            <td class="text-center"><span class="badge bg-primary">${statusData.novo || 0}</span></td>
            <td class="text-center"><span class="badge bg-info">${statusData.atribuido || 0}</span></td>
            <td class="text-center"><span class="badge bg-success">${statusData.ativo || 0}</span></td>
            <td class="text-center"><span class="badge bg-warning text-dark">${statusData.aguardando || 0}</span></td>
            <td class="text-center"><span class="badge bg-secondary">${(statusData.resolvido || 0) + (statusData.resolved || 0)}</span></td>
          </tr>
        `;
      }).join('');
    }

    coerceTimestampToDate(value) {
      if (!value) return null;
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
      if (typeof value?.toDate === 'function') {
        const date = value.toDate();
        return Number.isNaN(date.getTime()) ? null : date;
      }
      if (Number.isFinite(value?.seconds)) {
        const date = new Date(value.seconds * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
      }

      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    getWhatsappChatDate(chat = {}) {
      return this.coerceTimestampToDate(chat.createdAt)
        || this.coerceTimestampToDate(chat.aprovacaoLeadCreatedAt)
        || this.coerceTimestampToDate(chat.lastMessageTimestamp)
        || this.coerceTimestampToDate(chat.updatedAt);
    }

    isResolvedWhatsappStatus(status) {
      const normalized = String(status || '').trim().toLowerCase();
      return normalized === 'resolvido' || normalized === 'resolved';
    }

    getWhatsappSatisfactionScore(chat = {}) {
      const rawScore = chat?.customFields?.satisfactionScore ?? chat?.satisfactionScore;
      const score = Number(rawScore);
      return Number.isFinite(score) && score > 0 ? score : null;
    }

    async loadWhatsappMaterializedMetrics(filters) {
      if (!window.firestoreService?.getWhatsappMetricsDailyForReports) {
        return { current: null, daily: [] };
      }

      try {
        const [current, daily] = await Promise.all([
          window.firestoreService.getWhatsappMetricsCurrent(false),
          window.firestoreService.getWhatsappMetricsDailyForReports({
            startDate: filters?.startDate || null,
            endDate: filters?.endDate || null
          })
        ]);

        return {
          current,
          daily: Array.isArray(daily) ? daily : []
        };
      } catch (error) {
        console.warn('[WhatsApp Reports] Falha ao carregar metricas materializadas:', error);
        return { current: null, daily: [] };
      }
    }

    buildWhatsappTimelineSeries(materialized = {}, byDate = {}) {
      const dailyRows = Array.isArray(materialized?.daily) ? materialized.daily : [];
      if (dailyRows.length > 0) {
        return dailyRows.reduce((acc, row) => {
          const key = String(row?.date || row?.id || '').trim();
          if (!key) return acc;

          acc[key] = {
            total: Number(row?.queueCount ?? row?.activeChats ?? 0),
            resolved: Number(row?.resolvedToday || 0)
          };
          return acc;
        }, {});
      }

      return byDate;
    }

    async legacyGenerateWhatsappReport() {
      const dateStart = this.elements.whatsappDateStart?.value;
      const dateEnd = this.elements.whatsappDateEnd?.value;
      const reportType = this.elements.whatsappReportType?.value || 'overview';

      if (!dateStart || !dateEnd) {
        this.handleError(null, 'Selecione o período para gerar o relatório WhatsApp');
        return;
      }

      this.elements.whatsappGenerateBtn?.setAttribute('disabled', 'true');
      const originalText = this.elements.whatsappGenerateBtn?.innerHTML;
      if (this.elements.whatsappGenerateBtn) {
        this.elements.whatsappGenerateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Gerando...';
      }

      try {
        const filters = {
          startDate: new Date(`${dateStart}T00:00:00`),
          endDate: new Date(`${dateEnd}T23:59:59`),
          type: reportType
        };

        const [chats, agents, materialized] = await Promise.all([
          this.fetchWhatsappChats(filters),
          this.fetchWhatsappAgents(),
          this.loadWhatsappMaterializedMetrics(filters)
        ]);

        const metrics = this.computeWhatsappMetrics(chats, agents, materialized);
        const timelineSeries = this.buildWhatsappTimelineSeries(materialized, metrics.byDate);

        this.renderWhatsappKpis(metrics);
        this.renderWhatsappDepartmentChart(metrics.byDepartment);
        this.renderWhatsappTimelineChart(timelineSeries);
        this.renderWhatsappAgentsTable(metrics.byAgent);
        this.renderWhatsappStatusTable(metrics.byDepartmentStatus);

        window.debug && window.debug(' Relatório WhatsApp gerado com sucesso', metrics);
      } catch (error) {
        this.handleError(error, 'Erro ao gerar relatório WhatsApp');
      } finally {
        this.elements.whatsappGenerateBtn?.removeAttribute('disabled');
        if (this.elements.whatsappGenerateBtn) {
          this.elements.whatsappGenerateBtn.innerHTML = originalText || '<i class="bi bi-play-fill me-2"></i>Gerar Relatório';
        }
      }
    }

    async legacyFetchWhatsappChats(filters) {
      try {
        const chats = await window.firestoreService?.getWhatsappChatsForReports?.(false);
        if (!Array.isArray(chats)) return [];

        return chats.filter((chat) => {
          const chatDate = this.getWhatsappChatDate(chat);
          if (!chatDate) return false;

          if (filters?.startDate && chatDate < filters.startDate) return false;
          if (filters?.endDate && chatDate > filters.endDate) return false;
          return true;
        });
      } catch (error) {
        console.warn('[WhatsApp Reports] Erro ao buscar chats:', error);
        return [];
      }
    }

    async legacyFetchWhatsappAgents() {
      try {
        const users = await window.firestoreService?.getWhatsappAgentsForReports?.(false);
        return Array.isArray(users)
          ? users.map((data) => {
              const whatsapp = data.whatsapp || {};
              return {
                id: data.id,
                name: data.shortName || data.fullName || data.displayName || data.name || data.email || 'Agente',
                email: data.email || null,
                status: whatsapp.status || null,
                department: whatsapp.department || null,
                activeChats: Number(whatsapp.activeChats || 0),
                totalAssigned: Number(whatsapp.totalAssigned || 0),
                totalResolved: Number(whatsapp.totalResolved || 0)
              };
            })
          : [];
      } catch (error) {
        console.warn('[WhatsApp Reports] Erro ao buscar agentes:', error);
        return [];
      }
    }

    computeWhatsappMetrics(chats, agents, materialized = {}) {
      const metrics = {
        total: chats.length,
        resolved: 0,
        avgResponseTime: 0,
        avgSatisfaction: 'N/A',
        byDepartment: {},
        byAgent: {},
        byDate: {},
        byDepartmentStatus: {},
        materialized
      };

      let totalResponseTime = 0;
      let responseTimeCount = 0;
      let totalSatisfaction = 0;
      let satisfactionCount = 0;

      const agentMap = new Map((agents || []).map((agent) => [agent.id, agent]));

      (chats || []).forEach((chat) => {
        const isResolved = this.isResolvedWhatsappStatus(chat.status);
        if (isResolved) {
          metrics.resolved += 1;
        }

        const chatDate = this.getWhatsappChatDate(chat);
        const firstResponseDate = this.coerceTimestampToDate(chat.firstResponseAt);
        const responseTime = firstResponseDate && chatDate
          ? (firstResponseDate - chatDate) / 60000
          : null;

        if (Number.isFinite(responseTime) && responseTime > 0 && responseTime < 10080) {
          totalResponseTime += responseTime;
          responseTimeCount += 1;
        }

        const satisfactionScore = this.getWhatsappSatisfactionScore(chat);
        if (satisfactionScore !== null) {
          totalSatisfaction += satisfactionScore;
          satisfactionCount += 1;
        }

        const department = chat.department || 'Não atribuído';
        if (!metrics.byDepartment[department]) {
          metrics.byDepartment[department] = { total: 0, resolved: 0 };
        }
        metrics.byDepartment[department].total += 1;
        if (isResolved) {
          metrics.byDepartment[department].resolved += 1;
        }

        if (!metrics.byDepartmentStatus[department]) {
          metrics.byDepartmentStatus[department] = {};
        }
        const normalizedStatus = String(chat.status || 'desconhecido').trim().toLowerCase() || 'desconhecido';
        metrics.byDepartmentStatus[department][normalizedStatus] = (metrics.byDepartmentStatus[department][normalizedStatus] || 0) + 1;

        if (chatDate) {
          const dateKey = chatDate.toISOString().split('T')[0];
          if (!metrics.byDate[dateKey]) {
            metrics.byDate[dateKey] = { total: 0, resolved: 0 };
          }
          metrics.byDate[dateKey].total += 1;
          if (isResolved) {
            metrics.byDate[dateKey].resolved += 1;
          }
        }

        if (chat.agentId) {
          const agent = agentMap.get(chat.agentId);
          const agentName = agent?.name || chat.agentName || chat.agentId;
          if (!metrics.byAgent[agentName]) {
            metrics.byAgent[agentName] = {
              total: 0,
              resolved: 0,
              responseTimes: [],
              resolutionTimes: [],
              satisfactionScores: [],
              avgResponse: 0,
              avgResolution: 0,
              avgSatisfaction: 'N/A'
            };
          }

          const agentMetrics = metrics.byAgent[agentName];
          agentMetrics.total += 1;
          if (isResolved) {
            agentMetrics.resolved += 1;
          }

          if (Number.isFinite(responseTime) && responseTime > 0 && responseTime < 10080) {
            agentMetrics.responseTimes.push(responseTime);
          }

          const assignedDate = this.coerceTimestampToDate(chat.assignedAt);
          const resolvedDate = this.coerceTimestampToDate(chat.resolvedAt);
          const resolutionTime = assignedDate && resolvedDate
            ? (resolvedDate - assignedDate) / 60000
            : null;

          if (Number.isFinite(resolutionTime) && resolutionTime > 0) {
            agentMetrics.resolutionTimes.push(resolutionTime);
          }

          if (satisfactionScore !== null) {
            agentMetrics.satisfactionScores.push(satisfactionScore);
          }
        }
      });

      metrics.avgResponseTime = responseTimeCount > 0 ? Math.round(totalResponseTime / responseTimeCount) : 0;
      metrics.avgSatisfaction = satisfactionCount > 0
        ? (totalSatisfaction / satisfactionCount).toFixed(1)
        : 'N/A';

      Object.values(metrics.byAgent).forEach((agentMetrics) => {
        if (agentMetrics.responseTimes.length > 0) {
          const total = agentMetrics.responseTimes.reduce((sum, value) => sum + value, 0);
          agentMetrics.avgResponse = Math.round(total / agentMetrics.responseTimes.length);
        }
        if (agentMetrics.resolutionTimes.length > 0) {
          const total = agentMetrics.resolutionTimes.reduce((sum, value) => sum + value, 0);
          agentMetrics.avgResolution = Math.round(total / agentMetrics.resolutionTimes.length);
        }
        if (agentMetrics.satisfactionScores.length > 0) {
          const total = agentMetrics.satisfactionScores.reduce((sum, value) => sum + value, 0);
          agentMetrics.avgSatisfaction = (total / agentMetrics.satisfactionScores.length).toFixed(1);
        }
      });

      return metrics;
    }

    legacyRenderWhatsappKpis(metrics) {
      const materializedCurrent = metrics?.materialized?.current || null;
      const materializedDaily = Array.isArray(metrics?.materialized?.daily) ? metrics.materialized.daily : [];
      const totalFallback = materializedCurrent
        ? Number(materializedCurrent.queueCount ?? materializedCurrent.activeChats ?? 0)
        : materializedDaily.reduce((sum, row) => sum + Number(row?.queueCount ?? row?.activeChats ?? 0), 0);
      const resolvedFallback = materializedCurrent
        ? Number(materializedCurrent.resolvedToday || 0)
        : materializedDaily.reduce((sum, row) => sum + Number(row?.resolvedToday || 0), 0);

      if (this.elements.whatsappTotalChats) {
        this.elements.whatsappTotalChats.textContent = numberFmt.format(metrics.total || totalFallback);
      }
      if (this.elements.whatsappResolved) {
        this.elements.whatsappResolved.textContent = numberFmt.format(metrics.resolved || resolvedFallback);
      }
      if (this.elements.whatsappAvgResponse) {
        this.elements.whatsappAvgResponse.textContent = metrics.avgResponseTime > 0
          ? `${metrics.avgResponseTime} min`
          : 'N/A';
      }
      if (this.elements.whatsappSatisfaction) {
        this.elements.whatsappSatisfaction.textContent = metrics.avgSatisfaction !== 'N/A'
          ? `${metrics.avgSatisfaction}/5`
          : 'N/A';
      }
    }

    legacyRenderWhatsappTimelineChart(byDate) {
      const canvas = this.elements.whatsappTimelineChart;
      if (!canvas || typeof Chart === 'undefined') return;

      const ctx = canvas.getContext('2d');
      if (this.whatsappCharts.timeline) {
        this.whatsappCharts.timeline.destroy();
      }

      const sortedDates = Object.keys(byDate || {}).sort();
      const labels = sortedDates.map((dateKey) => {
        const date = new Date(dateKey);
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      });
      const totalData = sortedDates.map((dateKey) => Number(byDate[dateKey]?.total || 0));
      const resolvedData = sortedDates.map((dateKey) => Number(byDate[dateKey]?.resolved || 0));

      this.whatsappCharts.timeline = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Volume',
              data: totalData,
              borderColor: '#0d6efd',
              backgroundColor: 'rgba(13, 110, 253, 0.1)',
              fill: true,
              tension: 0.3
            },
            {
              label: 'Resolvidos',
              data: resolvedData,
              borderColor: '#198754',
              backgroundColor: 'rgba(25, 135, 84, 0.08)',
              fill: true,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' }
          },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } }
          }
        }
      });
    }

    legacyRenderWhatsappAgentsTable(byAgent) {
      const tbody = this.elements.whatsappAgentsTableBody;
      if (!tbody) return;

      const agents = Object.entries(byAgent || {}).sort((a, b) => b[1].total - a[1].total);
      if (agents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Nenhum dado de agente encontrado</td></tr>';
        return;
      }

      tbody.innerHTML = agents.map(([name, data]) => `
        <tr>
          <td><i class="bi bi-person-circle me-2"></i>${this.escapeHtml(name)}</td>
          <td class="text-end">${numberFmt.format(data.total)}</td>
          <td class="text-end">${data.avgResponse > 0 ? `${numberFmt.format(data.avgResponse)} min` : 'N/A'}</td>
          <td class="text-end">${data.avgResolution > 0 ? `${numberFmt.format(data.avgResolution)} min` : 'N/A'}</td>
          <td class="text-end">${data.avgSatisfaction !== 'N/A' ? `${data.avgSatisfaction}/5` : 'N/A'}</td>
        </tr>
      `).join('');
    }

    renderWhatsappStatusTable(byDepartmentStatus) {
      const tbody = this.elements.whatsappStatusTableBody;
      if (!tbody) return;

      const departments = Object.keys(byDepartmentStatus || {});
      if (departments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Nenhum dado encontrado</td></tr>';
        return;
      }

      tbody.innerHTML = departments.map((department) => {
        const statusData = byDepartmentStatus[department] || {};
        const total = Object.values(statusData).reduce((sum, value) => sum + Number(value || 0), 0);
        const queue = Number(statusData.novo || 0) + Number(statusData.aguardando || 0) + Number(statusData.desconhecido || 0);
        const active = Number(statusData.atribuido || 0) + Number(statusData.ativo || 0);
        const resolved = Number(statusData.resolvido || 0) + Number(statusData.resolved || 0);
        const resolutionRate = total > 0 ? ((resolved / total) * 100).toFixed(1) : '0.0';

        return `
          <tr>
            <td><strong>${this.escapeHtml(department)}</strong></td>
            <td class="text-end">${numberFmt.format(total)}</td>
            <td class="text-end">${numberFmt.format(queue)}</td>
            <td class="text-end">${numberFmt.format(active)}</td>
            <td class="text-end">${numberFmt.format(resolved)}</td>
            <td class="text-end">${resolutionRate}%</td>
          </tr>
        `;
      }).join('');
    }

    // ===================== QA ERROS =====================

    /**
     * Carrega e renderiza o relatorio de qualidade (erros aprovados)
     */
    async loadAndRenderQAReport(requestToken = null) {
      const isStaleRequest = () => requestToken && this.qaLoadToken !== requestToken;
      const svc = window.errorManagementService;
      if (!svc) {
        if (isStaleRequest()) return;
        this.renderQAEmpty('Servico de erros nao disponivel.');
        return;
      }

      try {
        const filtros = {};
        const isApprovalSource = this.state.activeSource === 'aprovacao';
        const dateStartValue = isApprovalSource
          ? this.elements.approvalDateStart?.value
          : this.elements.dateStart?.value;
        const dateEndValue = isApprovalSource
          ? this.elements.approvalDateEnd?.value
          : this.elements.dateEnd?.value;

        if (dateStartValue) {
          filtros.dataInicio = new Date(dateStartValue);
        }
        if (dateEndValue) {
          filtros.dataFim = new Date(`${dateEndValue}T23:59:59`);
        }

        const erros = await svc.buscarErrosParaRelatorio(filtros);
        if (isStaleRequest()) return;
        const metricas = svc.calcularMetricasQA(erros);

        if (isStaleRequest()) return;
        this.renderQAKpis(metricas);
        this.renderQASetorChart(metricas);
        this.renderQAOrigemChart(metricas);
        this.renderQAOfensoresTable(metricas);
      } catch (error) {
        console.error('[ReportsPage] Erro ao carregar relatorio QA:', error);
        if (isStaleRequest()) return;
        this.renderQAEmpty('Erro ao carregar dados de qualidade.');
      }
    }

    renderQAEmpty(message) {
      if (this.elements.qaTotal) this.elements.qaTotal.textContent = '--';
      if (this.elements.qaTotalBadge) this.elements.qaTotalBadge.textContent = '0 erros';
      if (this.elements.qaProcessos) this.elements.qaProcessos.textContent = '--';
      if (this.elements.qaAprovacoes) this.elements.qaAprovacoes.textContent = '--';
      if (this.elements.qaSetores) this.elements.qaSetores.textContent = '--';
      if (this.elements.qaOfensoresBody) {
        this.elements.qaOfensoresBody.innerHTML = `<tr><td colspan="5" class="text-muted text-center py-3">${message}</td></tr>`;
      }
    }

    renderQAKpis(metricas) {
      if (this.elements.qaTotal) this.elements.qaTotal.textContent = numberFmt.format(metricas.totalErros);
      if (this.elements.qaTotalBadge) this.elements.qaTotalBadge.textContent = `${metricas.totalErros} erros`;
      if (this.elements.qaProcessos) this.elements.qaProcessos.textContent = numberFmt.format(metricas.porOrigem['Processo'] || 0);
      if (this.elements.qaAprovacoes) this.elements.qaAprovacoes.textContent = numberFmt.format(metricas.porOrigem['Aprovacao'] || 0);
      if (this.elements.qaSetores) this.elements.qaSetores.textContent = Object.keys(metricas.porSetor).length;
    }

    renderQASetorChart(metricas) {
      const canvas = this.elements.qaSetorChart;
      if (!canvas || typeof Chart === 'undefined') return;

      if (this.qaCharts.setor) {
        this.qaCharts.setor.destroy();
        this.qaCharts.setor = null;
      }

      const svc = window.errorManagementService;
      const setores = svc?.ERRO_SETORES || {};
      const labels = metricas.ofensores.map(o => setores[o.setor]?.label || o.setor);
      const data = metricas.ofensores.map(o => o.count);

      this.qaCharts.setor = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: CHART_COLORS.slice(0, labels.length),
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { boxWidth: 14, font: { size: 12 } } }
          }
        }
      });
    }

    renderQAOrigemChart(metricas) {
      const canvas = this.elements.qaOrigemChart;
      if (!canvas || typeof Chart === 'undefined') return;

      if (this.qaCharts.origem) {
        this.qaCharts.origem.destroy();
        this.qaCharts.origem = null;
      }

      const labels = Object.keys(metricas.porOrigem);
      const data = Object.values(metricas.porOrigem);

      this.qaCharts.origem = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Erros',
            data,
            backgroundColor: ['#0d6efd', '#dc3545'],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } }
          }
        }
      });
    }

    renderQAOfensoresTable(metricas) {
      const tbody = this.elements.qaOfensoresBody;
      if (!tbody) return;

      if (metricas.ofensores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-center py-3">Nenhum erro encontrado no periodo.</td></tr>';
        return;
      }

      tbody.innerHTML = metricas.ofensores.map((ofensor, idx) => {
        const pct = parseFloat(ofensor.percentual);
        const barWidth = Math.max(MIN_PROGRESS_BAR_PERCENT, pct);
        return `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${ofensor.setorLabel}</strong></td>
            <td class="text-end">${numberFmt.format(ofensor.count)}</td>
            <td class="text-end">${ofensor.percentual}%</td>
            <td>
              <div class="progress" style="height: 20px;">
                <div class="progress-bar bg-danger" role="progressbar" style="width: ${barWidth}%">${ofensor.percentual}%</div>
              </div>
            </td>
          </tr>`;
      }).join('');
    }

    // ==================== RELATÓRIO DE ATIVIDADES ====================

    async ensureActivityLogService() {
      if (window.activityLogService) {
        return window.activityLogService;
      }

      try {
        const module = await import('./activityLogService.js');
        return module?.activityLogService || window.activityLogService || null;
      } catch (error) {
        console.error('[ReportsPage] Erro ao carregar activityLogService:', error);
        return null;
      }
    }

    getActivityDateRange() {
      const dateStart = this.elements.activityDateStart?.value || '';
      const dateEnd = this.elements.activityDateEnd?.value || '';
      return {
        dateStart: dateStart ? new Date(`${dateStart}T00:00:00`) : null,
        dateEnd: dateEnd ? new Date(`${dateEnd}T23:59:59`) : null,
      };
    }

    getActivityFilterValues() {
      const { dateStart, dateEnd } = this.getActivityDateRange();
      return {
        actionType: this.elements.activityActionType?.value || '',
        userUid: this.elements.activityUser?.value || '',
        dateStart,
        dateEnd,
        searchTerm: (this.elements.activitySearch?.value || '').trim(),
      };
    }

    async collectActivitiesWithServerPagination(baseFilters = {}) {
      const activityLogService = await this.ensureActivityLogService();
      if (!activityLogService?.queryActivities) {
        throw new Error('Servico de logs de atividades nao disponivel');
      }

      const data = [];
      let hasMore = true;
      let lastDoc = null;

      while (hasMore && data.length < ACTIVITY_REPORT_LIMIT) {
        const result = await activityLogService.queryActivities({
          ...baseFilters,
          limit: ACTIVITY_QUERY_PAGE_SIZE,
          startAfter: lastDoc,
          orderBy: 'timestamp',
          orderDirection: 'desc',
          enrich: false
        });

        const pageData = Array.isArray(result?.data) ? result.data : [];
        data.push(...pageData);
        hasMore = result?.hasMore === true && pageData.length > 0;
        lastDoc = result?.lastDoc || null;
      }

      return data.slice(0, ACTIVITY_REPORT_LIMIT);
    }

    async generateActivityReport() {
      const activityLogService = await this.ensureActivityLogService();
      if (!activityLogService) {
        this.handleError(new Error('Serviço de logs de atividades não disponível'));
        return;
      }

      this.setLoading(true);
      try {
        const activities = await this.collectActivitiesWithServerPagination({
          ...this.getActivityFilterValues(),
          searchTerm: ''
        });
        this.state.activityData = Array.isArray(activities) ? activities : [];
        this.applyActivityFilters();
        this.populateActivityUserOptions();
        this.renderActivityKpis();
        this.renderActivityTypeChart();
        this.renderActivityTimelineChart();
        this.state.activityPage = 1;
        this.renderActivityTable();
        this.renderActivityActiveFilters();
        this.setSourceLastUpdate('atividades');
        this.updateTopLevelExportState();
        if (this.elements.activityExportBtn) {
          this.elements.activityExportBtn.disabled = this.state.activityFiltered.length === 0;
        }
      } catch (error) {
        console.error('[ReportsPage] Erro ao gerar relatório de atividades:', error);
        this.handleError(error, 'Erro ao carregar relatório de atividades');
      } finally {
        this.setLoading(false);
      }
    }

    applyActivityFilters() {
      const actionType = this.elements.activityActionType?.value || '';
      const userUid = this.elements.activityUser?.value || '';
      const dateStart = this.elements.activityDateStart?.value || '';
      const dateEnd = this.elements.activityDateEnd?.value || '';
      const search = (this.elements.activitySearch?.value || '').toLowerCase().trim();

      this.state.activityFiltered = this.state.activityData.filter((activity) => {
        const ts = activity.timestamp;
        const activityDate = ts ? (ts.toDate ? ts.toDate() : new Date(ts)) : null;

        if (actionType && activity.actionType !== actionType) return false;
        if (userUid && (activity.userUid || activity.actorUid || '') !== userUid) return false;
        if (dateStart && activityDate) {
          const start = new Date(dateStart + 'T00:00:00');
          if (activityDate < start) return false;
        }
        if (dateEnd && activityDate) {
          const end = new Date(dateEnd + 'T23:59:59');
          if (activityDate > end) return false;
        }
        if (search) {
          const text = [
            this.formatActivityDescription(activity),
            activity.userDisplayName,
            activity.userName,
            activity.userEmail,
            activity.actionType,
            this.getActivityProcessName(activity)
          ].filter(Boolean).join(' ').toLowerCase();
          if (!text.includes(search)) return false;
        }
        return true;
      });
    }

    populateActivityUserOptions() {
      const select = this.elements.activityUser;
      if (!select) return;
      const currentValue = select.value;
      const users = new Map();
      this.state.activityData.forEach((activity) => {
        const uid = activity.userUid || activity.actorUid || '';
        const label = activity.userDisplayName || activity.actorName || activity.userName || activity.userEmail || '';
        if (uid && label && !users.has(uid)) {
          users.set(uid, label);
        }
      });

      const options = Array.from(users.entries()).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
      select.innerHTML = '<option value="">Todos</option>' +
        options.map(([uid, label]) => `<option value="${this.escapeHtml(uid)}">${this.escapeHtml(label)}</option>`).join('');
      if (users.has(currentValue)) select.value = currentValue;
    }

    renderActivityKpis() {
      const data = this.state.activityFiltered;
      const total = data.length;
      const uniqueUsers = new Set(data.map((a) => a.userDisplayName || a.userName).filter(Boolean)).size;

      if (this.elements.activityTotalCount) {
        this.elements.activityTotalCount.textContent = numberFmt.format(total);
      }
      if (this.elements.activityTotalBadge) {
        this.elements.activityTotalBadge.textContent = `${numberFmt.format(total)} atividades`;
      }
      if (this.elements.activityActiveUsers) {
        this.elements.activityActiveUsers.textContent = numberFmt.format(uniqueUsers);
      }

      const dateStart = this.elements.activityDateStart?.value;
      const dateEnd = this.elements.activityDateEnd?.value;
      if (this.elements.activityPeriod) {
        if (dateStart && dateEnd) {
          this.elements.activityPeriod.textContent = `${this.formatDateShort(dateStart)} a ${this.formatDateShort(dateEnd)}`;
        } else if (dateStart) {
          this.elements.activityPeriod.textContent = `Desde ${this.formatDateShort(dateStart)}`;
        } else if (dateEnd) {
          this.elements.activityPeriod.textContent = `Até ${this.formatDateShort(dateEnd)}`;
        } else {
          this.elements.activityPeriod.textContent = 'Todo o período';
        }
      }

      if (this.elements.activityAvgPerDay) {
        const timestamps = data.map((a) => {
          const ts = a.timestamp;
          return ts ? (ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime()) : null;
        }).filter(Boolean);
        if (timestamps.length >= 2) {
          const min = Math.min(...timestamps);
          const max = Math.max(...timestamps);
          const days = Math.max(1, Math.ceil((max - min) / DAY_MS));
          this.elements.activityAvgPerDay.textContent = (total / days).toFixed(1);
        } else {
          this.elements.activityAvgPerDay.textContent = total.toString();
        }
      }
    }

    renderActivityTypeChart() {
      const canvas = this.elements.activityTypeChart;
      if (!canvas || typeof Chart === 'undefined') return;
      if (this.state.activityCharts.type) {
        this.state.activityCharts.type.destroy();
      }

      const counts = {};
      this.state.activityFiltered.forEach((a) => {
        const type = a.actionType || 'Desconhecido';
        counts[type] = (counts[type] || 0) + 1;
      });
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const labels = entries.map(([k]) => this.prettyActivityType(k));
      const data = entries.map(([, v]) => v);
      const colors = CHART_COLORS.slice(0, entries.length);

      this.state.activityCharts.type = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: '#fff',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const total = data.reduce((sum, v) => sum + v, 0);
                  const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : '0.0';
                  return `${ctx.label}: ${numberFmt.format(ctx.raw)} (${pct}%)`;
                },
              },
            },
          },
          cutout: '55%',
        },
      });
    }

    renderActivityTimelineChart() {
      const canvas = this.elements.activityTimelineChart;
      if (!canvas || typeof Chart === 'undefined') return;
      if (this.state.activityCharts.timeline) {
        this.state.activityCharts.timeline.destroy();
      }

      const daily = {};
      this.state.activityFiltered.forEach((a) => {
        const ts = a.timestamp;
        const date = ts ? (ts.toDate ? ts.toDate() : new Date(ts)) : null;
        if (!date || isNaN(date.getTime())) return;
        const key = date.toISOString().split('T')[0];
        daily[key] = (daily[key] || 0) + 1;
      });

      const sortedKeys = Object.keys(daily).sort();
      const labels = sortedKeys.map((k) => {
        const d = new Date(k);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      });
      const data = sortedKeys.map((k) => daily[k]);

      this.state.activityCharts.timeline = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Atividades',
            data,
            borderColor: '#0d6efd',
            backgroundColor: 'rgba(13, 110, 253, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } },
          },
        },
      });
    }

    getActivityProcessName(activity = {}) {
      return window.activityLogService?.getProcessName?.(activity)
        || activity.extraData?.primaryBuyerName
        || activity.extraData?.processoName
        || activity.extraData?.clientePrincipal
        || '';
    }

    formatActivityDescription(activity = {}) {
      return window.activityLogService?.formatActivityDescription?.(activity)
        || activity.description
        || '--';
    }

    renderActivityTable() {
      const tbody = this.elements.activityTableBody;
      if (!tbody) return;

      const data = this.state.activityFiltered;
      const total = data.length;
      const pageSize = this.state.activityPageSize;
      const page = this.state.activityPage;
      const maxPage = Math.ceil(total / pageSize) || 1;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const pageData = data.slice(start, end);

      if (this.elements.activityTableTotal) {
        this.elements.activityTableTotal.textContent = `${numberFmt.format(total)} registros`;
      }
      if (this.elements.activityPageInfo) {
        this.elements.activityPageInfo.textContent = `Página ${page} de ${maxPage}`;
      }
      if (this.elements.activityPrevPage) {
        this.elements.activityPrevPage.disabled = page <= 1;
      }
      if (this.elements.activityNextPage) {
        this.elements.activityNextPage.disabled = page >= maxPage;
      }

      if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-center py-3">Nenhuma atividade encontrada com os filtros selecionados</td></tr>';
        return;
      }

      tbody.innerHTML = pageData.map((activity) => {
        const ts = activity.timestamp;
        const date = ts ? (ts.toDate ? ts.toDate() : new Date(ts)) : null;
        const dateStr = date && !isNaN(date.getTime())
          ? date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '--';
        const typeBadge = this.getActivityTypeBadge(activity.actionType);
        const desc = this.escapeHtml(this.formatActivityDescription(activity));
        const user = this.escapeHtml(activity.userDisplayName || activity.actorName || activity.userName || 'Sistema');
        const entity = this.escapeHtml(activity.entityLabel || activity.relatedEntityId || activity.entityId || '--');
        const fileName = this.escapeHtml(activity.filename || '');
        const hasAuditFile = Boolean(activity.storagePath);
        const downloadAction = hasAuditFile
          ? `<button type="button" class="btn btn-sm btn-outline-secondary activity-audit-download-btn" data-storage-path="${this.escapeHtml(activity.storagePath)}" data-filename="${fileName}">
              <i class="bi bi-download"></i>
            </button>`
          : '<span class="text-muted">--</span>';

        return `<tr>
          <td class="text-nowrap small">${dateStr}</td>
          <td>${typeBadge}</td>
          <td class="small">${desc}</td>
          <td class="small">${user}</td>
          <td class="small text-muted">${entity}</td>
          <td class="small text-nowrap">${downloadAction}</td>
        </tr>`;
      }).join('');
    }

    getActivityTypeBadge(type) {
      const colors = {
        STATUS_CHANGE: 'primary',
        BULK_STATUS_CHANGE: 'primary',
        NEW_APPROVAL: 'success',
        APPROVAL_DELETED: 'danger',
        EXPORT_REPORT: 'info',
        CSV_IMPORT: 'info',
        WHATSAPP_MSG: 'success',
        WHATSAPP_CHAT_ASSIGNED: 'success',
        WHATSAPP_CHAT_TRANSFERRED: 'warning',
        WHATSAPP_CHAT_RESOLVED: 'secondary',
        WHATSAPP_CHAT_REOPENED: 'primary',
        WHATSAPP_CHAT_EXPORTED: 'info',
        CONTRACT_ARCHIVED: 'warning',
        CONTRACT_ADDED: 'primary',
        CONTRACT_DELETED: 'danger',
      };
      const color = colors[type] || 'secondary';
      const label = this.prettyActivityType(type);
      return `<span class="badge bg-${color}">${label}</span>`;
    }

    prettyActivityType(type) {
      const labels = {
        STATUS_CHANGE: 'Mudança de Status',
        BULK_STATUS_CHANGE: 'Mudança de Status em Lote',
        NEW_APPROVAL: 'Nova Aprovação',
        APPROVAL_DELETED: 'Exclusão de Análise',
        EXPORT_REPORT: 'Exportação',
        CSV_IMPORT: 'Importação CSV',
        WHATSAPP_MSG: 'WhatsApp',
        WHATSAPP_CHAT_ASSIGNED: 'Atendimento Assumido',
        WHATSAPP_CHAT_TRANSFERRED: 'Transferência WhatsApp',
        WHATSAPP_CHAT_RESOLVED: 'Atendimento Finalizado',
        WHATSAPP_CHAT_REOPENED: 'Atendimento Reaberto',
        WHATSAPP_CHAT_EXPORTED: 'Exportação de Conversa',
        CONTRACT_ARCHIVED: 'Arquivamento',
        CONTRACT_ADDED: 'Novo Contrato',
        CONTRACT_DELETED: 'Exclusão de Processo',
      };
      return labels[type] || type || 'Desconhecido';
    }

    formatDateShort(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    }

    renderActivityActiveFilters() {
      if (!this.elements.activityActiveFilters || !this.elements.activityActiveFiltersList) return;
      const chips = [];
      const addChip = (key, value, label) => {
        chips.push(
          `<button type="button" class="btn btn-sm btn-light border reports-filter-chip" data-filter-key="${key}" data-filter-value="${this.escapeHtml(value || '')}">
            ${this.escapeHtml(label)} <i class="bi bi-x-lg ms-1"></i>
          </button>`
        );
      };

      const actionType = this.elements.activityActionType?.value;
      if (actionType) addChip('actionType', actionType, `Tipo: ${this.prettyActivityType(actionType)}`);
      const user = this.elements.activityUser?.value;
      const userLabel = this.elements.activityUser?.selectedOptions?.[0]?.textContent || user;
      if (user) addChip('user', user, `Usuário: ${userLabel}`);
      const dateStart = this.elements.activityDateStart?.value;
      const dateEnd = this.elements.activityDateEnd?.value;
      if (dateStart || dateEnd) {
        addChip('period', `${dateStart || '--'}|${dateEnd || '--'}`, `Período: ${dateStart || '--'} até ${dateEnd || '--'}`);
      }
      const search = this.elements.activitySearch?.value?.trim();
      if (search) addChip('search', search, `Busca: ${search}`);

      this.elements.activityActiveFiltersList.innerHTML = chips.join('');
      this.elements.activityActiveFilters.classList.toggle('d-none', chips.length === 0);

      // Bind clear chips
      this.elements.activityActiveFiltersList.querySelectorAll('.reports-filter-chip').forEach((btn) => {
        btn.addEventListener('click', (evt) => {
          const chip = evt.currentTarget;
          const key = chip.dataset.filterKey;
          switch (key) {
            case 'actionType':
              if (this.elements.activityActionType) this.elements.activityActionType.value = '';
              break;
            case 'user':
              if (this.elements.activityUser) this.elements.activityUser.value = '';
              break;
            case 'period':
              if (this.elements.activityDateStart) this.elements.activityDateStart.value = '';
              if (this.elements.activityDateEnd) this.elements.activityDateEnd.value = '';
              break;
            case 'search':
              if (this.elements.activitySearch) this.elements.activitySearch.value = '';
              break;
          }
          this.applyActivityFilters();
          this.renderActivityKpis();
          this.renderActivityTypeChart();
          this.renderActivityTimelineChart();
          this.state.activityPage = 1;
          this.renderActivityTable();
          this.renderActivityActiveFilters();
        });
      });
    }

    resetActivityFilters() {
      if (this.elements.activityActionType) this.elements.activityActionType.value = '';
      if (this.elements.activityUser) this.elements.activityUser.value = '';
      if (this.elements.activityDateStart) this.elements.activityDateStart.value = '';
      if (this.elements.activityDateEnd) this.elements.activityDateEnd.value = '';
      if (this.elements.activitySearch) this.elements.activitySearch.value = '';
      this.applyActivityFilters();
      this.renderActivityKpis();
      this.renderActivityTypeChart();
      this.renderActivityTimelineChart();
      this.state.activityPage = 1;
      this.renderActivityTable();
      this.renderActivityActiveFilters();
    }

    exportActivityReport() {
      const data = this.state.activityFiltered;
      if (!data.length) {
        this.handleError(null, 'Nenhum dado para exportar');
        return;
      }

      const headers = ['Data/Hora', 'Tipo', 'Descrição', 'Usuário', 'Entidade', 'ID'];
      const rows = data.map((activity) => {
        const ts = activity.timestamp;
        const date = ts ? (ts.toDate ? ts.toDate() : new Date(ts)) : null;
        const dateStr = date && !isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : '';
        return [
          dateStr,
          this.prettyActivityType(activity.actionType),
          this.formatActivityDescription(activity).replace(/[\r\n]/g, ' '),
          activity.userDisplayName || activity.userName || 'Sistema',
          activity.relatedEntityId || activity.entityId || '',
          activity.id || '',
        ];
      });

      const csvContent = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `relatorio-atividades-${timestamp}.csv`;
      window.activityLogService?.downloadBlob?.(blob, filename);

      window.activityLogService?.auditFileAction?.({
        actionType: 'EXPORT_REPORT',
        description: `Relatorio de atividades exportado (${data.length} registros)`,
        module: 'relatorios',
        page: 'relatorios',
        source: 'reportsPage.activity',
        filename,
        blobOrText: blob,
        mimeType: 'text/csv;charset=utf-8;',
        rowCount: data.length,
        entityType: 'activity-log',
        extraData: {
          format: 'CSV',
          filters: this.getActivityFilterValues()
        }
      }).catch((error) => {
        console.error('[ReportsPage] Falha ao auditar exportacao do relatorio de atividades:', error);
      });

      if (window.__DISABLE_LEGACY_ACTIVITY_EXPORT_LOG__ === true && window.activityLogService?.logActivity) {
        window.activityLogService.logActivity(
          'EXPORT_REPORT',
          `Relatório de atividades exportado (${data.length} registros)`,
          null,
          {
            filename,
            format: 'CSV',
            rowCount: data.length,
            filters: this.getActivityFilterValues()
          }
        );
      }
    }
  }

  window.reportsPage = new ReportsPage();
})();
