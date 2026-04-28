/**
 * Interface de Usuário para Sistema de Relatórios Customizáveis
 */

// usa debug global

class ReportsUI {
    constructor() {
        this.modal = null;
        this.isInitialized = false;
        this.currentTemplate = null;
        this.previewChart = null;
        this.init();
    }

    init() {
        if (this.isInitialized) return;
        
        this.createReportsModal();
        this.addReportsButton();
        this.bindEvents();
        
        this.isInitialized = true;
    window.debug && debug(' Interface de Relatórios inicializada');
    }

    /**
     * Adiciona botão de relatórios na interface
     */
    addReportsButton() {
        // Verificar se já existe
        if (document.getElementById('reports-button')) return;

        // Criar botão principal
        const reportsButton = document.createElement('button');
        reportsButton.id = 'reports-button';
        reportsButton.className = 'btn btn-primary btn-sm d-inline-flex align-items-center gap-2 ms-2';
        reportsButton.innerHTML = `
            <i class="fas fa-chart-bar"></i>
            <span>Relatórios</span>
        `;
        reportsButton.title = 'Sistema de Relatórios Customizáveis';

        // Adicionar ao header
        const header = document.querySelector('.header');
        if (header) {
            header.appendChild(reportsButton);
        }

        // Adicionar estilos
        this.addReportsStyles();
    }

    /**
     * Cria modal de relatórios
     */
    createReportsModal() {
        const modalHTML = `
            <div id="reports-modal" class="modal fade" tabindex="-1" aria-labelledby="reports-modal-title" aria-hidden="true">
                <div class="modal-dialog modal-dialog-scrollable modal-w-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2 id="reports-modal-title" class="modal-title">
                                <i class="fas fa-chart-bar me-2"></i>
                                Sistema de Relatórios Customizáveis
                            </h2>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                        </div>
                        
                        <div class="modal-body">
                            <ul class="nav nav-tabs mb-3" role="tablist">
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link active" type="button" data-tab="templates" role="tab" aria-controls="templates-tab" aria-selected="true">Templates</button>
                                </li>
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link" type="button" data-tab="custom" role="tab" aria-controls="custom-tab" aria-selected="false">Personalizar</button>
                                </li>
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link" type="button" data-tab="generate" role="tab" aria-controls="generate-tab" aria-selected="false">Gerar</button>
                                </li>
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link" type="button" data-tab="history" role="tab" aria-controls="history-tab" aria-selected="false">Histórico</button>
                                </li>
                            </ul>

                            <div class="tab-content">

                            <!-- Tab Templates -->
                            <div id="templates-tab" class="tab-pane fade show active">
                                <div class="card mb-3">
                                    <div class="card-body">
                                        <h5 class="card-title">Templates Disponíveis</h5>
                                        <p class="card-text text-muted">Selecione um template predefinido para gerar relatórios rapidamente</p>
                                        <div id="templates-grid" class="templates-grid">
                                            <!-- Templates serão preenchidos dinamicamente -->
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Tab Personalizar -->
                            <div id="custom-tab" class="tab-pane fade">
                                <div class="card mb-3">
                                    <div class="card-body">
                                        <h5 class="card-title">Criar Template Personalizado</h5>
                                        
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <label for="template-name" class="form-label">Nome do Template:</label>
                                                <input type="text" id="template-name" class="form-control" placeholder="Ex: Relatório Mensal">
                                            </div>
                                            <div class="col-md-6">
                                                <label for="template-desc" class="form-label">Descrição:</label>
                                                <input type="text" id="template-desc" class="form-control" placeholder="Descrição do template">
                                            </div>
                                        </div>

                                        <div class="mt-3">
                                            <label class="form-label">Campos a incluir:</label>
                                            <div id="fields-selector" class="border rounded p-2 row g-2 scroll-y-sm">
                                                <!-- Campos serão preenchidos dinamicamente -->
                                            </div>
                                        </div>

                                        <div class="row g-3 mt-1">
                                            <div class="col-md-6">
                                                <label for="template-format" class="form-label">Formato:</label>
                                                <select id="template-format" class="form-select">
                                                    <option value="tabela">Tabela</option>
                                                    <option value="agrupado">Agrupado</option>
                                                </select>
                                            </div>
                                            <div class="col-md-6 d-none" id="group-by-container">
                                                <label for="template-group-by" class="form-label">Agrupar por:</label>
                                                <select id="template-group-by" class="form-select">
                                                    <option value="status">Status</option>
                                                    <option value="empreendimento">Empreendimento</option>
                                                    <option value="vendedorConstrutora">Vendedor</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div class="row g-3 mt-1">
                                            <div class="col-md-6">
                                                <label for="template-sort-field" class="form-label">Ordenar por:</label>
                                                <select id="template-sort-field" class="form-select">
                                                    <option value="dataAssinatura">Data de Assinatura</option>
                                                    <option value="valorContrato">Valor do Contrato</option>
                                                    <option value="clientePrincipal">Cliente Principal</option>
                                                    <option value="status">Status</option>
                                                </select>
                                            </div>
                                            <div class="col-md-6">
                                                <label for="template-sort-dir" class="form-label">Direção:</label>
                                                <select id="template-sort-dir" class="form-select">
                                                    <option value="asc">Crescente</option>
                                                    <option value="desc">Decrescente</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div class="mt-3">
                                            <label class="form-label">Opções adicionais:</label>
                                            <div class="row g-2">
                                                <div class="col-md-6">
                                                    <div class="form-check">
                                                        <input class="form-check-input" type="checkbox" id="template-include-charts">
                                                        <label class="form-check-label" for="template-include-charts">Incluir gráficos</label>
                                                    </div>
                                                </div>
                                                <div class="col-md-6">
                                                    <div class="form-check">
                                                        <input class="form-check-input" type="checkbox" id="template-include-summary">
                                                        <label class="form-check-label" for="template-include-summary">Incluir resumo</label>
                                                    </div>
                                                </div>
                                                <div class="col-md-6">
                                                    <div class="form-check">
                                                        <input class="form-check-input" type="checkbox" id="template-include-stats">
                                                        <label class="form-check-label" for="template-include-stats">Incluir estatísticas</label>
                                                    </div>
                                                </div>
                                                <div class="col-md-6">
                                                    <div class="form-check">
                                                        <input class="form-check-input" type="checkbox" id="template-include-totals">
                                                        <label class="form-check-label" for="template-include-totals">Incluir totais</label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="d-flex flex-wrap gap-2 mt-3 pt-3 border-top">
                                            <button id="save-template-btn" class="btn btn-primary">
                                                <i class="fas fa-save me-1"></i>
                                                Salvar Template
                                            </button>
                                            <button id="preview-template-btn" class="btn btn-secondary">
                                                <i class="fas fa-eye me-1"></i>
                                                Visualizar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Tab Gerar -->
                            <div id="generate-tab" class="tab-pane fade">
                                <div class="card mb-3">
                                    <div class="card-body">
                                        <h5 class="card-title">Gerar Relatório</h5>
                                        
                                        <div class="mb-3">
                                            <label for="selected-template" class="form-label">Template:</label>
                                            <select id="selected-template" class="form-select">
                                                <!-- Templates serão preenchidos dinamicamente -->
                                            </select>
                                        </div>

                                        <div class="border-top pt-3 mt-3">
                                            <h6 class="mb-3">Filtros</h6>
                                            <div class="row g-3">
                                                <div class="col-md-6">
                                                    <label for="filter-status" class="form-label">Status:</label>
                                                    <select id="filter-status" class="form-select" multiple>
                                                        <!-- Status serão preenchidos dinamicamente -->
                                                    </select>
                                                </div>
                                                <div class="col-md-6">
                                                    <label for="filter-date-start" class="form-label">Data de Início:</label>
                                                    <input type="date" id="filter-date-start" class="form-control">
                                                </div>
                                                <div class="col-md-6">
                                                    <label for="filter-date-end" class="form-label">Data de Fim:</label>
                                                    <input type="date" id="filter-date-end" class="form-control">
                                                </div>
                                                <div class="col-md-6">
                                                    <label for="filter-value-min" class="form-label">Valor Mínimo:</label>
                                                    <input type="number" id="filter-value-min" class="form-control" min="0" step="1000">
                                                </div>
                                                <div class="col-md-6">
                                                    <label for="filter-value-max" class="form-label">Valor Máximo:</label>
                                                    <input type="number" id="filter-value-max" class="form-control" min="0" step="1000">
                                                </div>
                                            </div>
                                        </div>

                                        <div class="d-flex flex-wrap gap-2 mt-3 pt-3 border-top">
                                            <button id="generate-report-btn" class="btn btn-primary">
                                                <i class="fas fa-play me-1"></i>
                                                Gerar Relatório
                                            </button>
                                        </div>

                                        <div id="report-preview" class="report-preview d-none mt-3">
                                            <!-- Preview ser? preenchido dinamicamente -->
                                        </div>

                                        <div id="report-actions" class="d-flex flex-wrap gap-2 mt-3 d-none">
                                            <button id="export-csv-btn" class="btn btn-success">
                                                <i class="fas fa-file-csv me-1"></i>
                                                Exportar CSV
                                            </button>
                                            <button id="export-pdf-btn" class="btn btn-danger">
                                                <i class="fas fa-file-pdf me-1"></i>
                                                Exportar PDF
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Tab Histórico -->
                            <div id="history-tab" class="tab-pane fade">
                                <div class="card mb-3">
                                    <div class="card-body">
                                        <h5 class="card-title">Histórico de Relatórios</h5>
                                        
                                        <div class="d-flex flex-wrap gap-2 mt-2">
                                            <button id="clear-history-btn" class="btn btn-warning">
                                                <i class="fas fa-trash me-1"></i>
                                                Limpar Histórico
                                            </button>
                                        </div>

                                        <div id="reports-history-list" class="reports-history mt-3">
                                            <!-- Histórico ser? preenchido dinamicamente -->
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('reports-modal');
    }

    /**
     * Adiciona estilos CSS para relatórios
     */
    addReportsStyles() {
        const styles = `
            .templates-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 15px;
                margin-top: 15px;
            }

            .template-card {
                background: var(--card-background);
                border: 2px solid var(--border-color);
                border-radius: 8px;
                padding: 15px;
                cursor: pointer;
                transition: all 0.3s ease;
            }

            .template-card:hover {
                border-color: var(--primary-color);
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }

            .template-card.selected {
                border-color: var(--primary-color);
                background: var(--primary-color-light);
            }

            .template-card h4 {
                margin: 0 0 8px 0;
                color: var(--primary-color);
            }

            .template-card p {
                margin: 0 0 10px 0;
                color: var(--text-secondary);
                font-size: 14px;
            }

            .template-card .template-info {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 12px;
                color: var(--text-secondary);
            }

            .report-preview {
                border: 1px solid var(--border-color);
                border-radius: 4px;
                padding: 15px;
                max-height: 400px;
                overflow-y: auto;
                background: var(--card-background);
            }

            .preview-table {
                width: 100%;
                border-collapse: collapse;
                margin: 10px 0;
            }

            .preview-table th,
            .preview-table td {
                border: 1px solid var(--border-color);
                padding: 8px;
                text-align: left;
                font-size: 12px;
            }

            .preview-table th {
                background: var(--header-background);
                font-weight: bold;
            }

            .preview-stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 10px;
                margin-bottom: 15px;
            }

            .preview-stat {
                background: var(--stat-background);
                padding: 10px;
                border-radius: 4px;
                text-align: center;
                border: 1px solid var(--border-color);
            }

            .preview-stat-value {
                font-size: 18px;
                font-weight: bold;
                color: var(--primary-color);
            }

            .preview-stat-label {
                font-size: 12px;
                color: var(--text-secondary);
                margin-top: 4px;
            }

            .reports-history {
                max-height: 400px;
                overflow-y: auto;
            }

            .history-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px;
                border: 1px solid var(--border-color);
                border-radius: 6px;
                margin-bottom: 8px;
                background: var(--card-background);
            }

            .history-item-info {
                flex: 1;
            }

            .history-item-name {
                font-weight: 500;
                color: var(--text-color);
            }

            .history-item-details {
                font-size: 12px;
                color: var(--text-secondary);
                margin-top: 4px;
            }

            .history-item-actions {
                display: flex;
                gap: 8px;
            }

            .loading-spinner {
                display: inline-block;
                width: 16px;
                height: 16px;
                border: 2px solid #f3f3f3;
                border-top: 2px solid var(--primary-color);
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `

        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    /**
     * Vincula eventos
     */
    bindEvents() {
        // Botão principal de relatórios
        const reportsButton = document.getElementById('reports-button');
        if (reportsButton) {
            reportsButton.addEventListener('click', () => this.openModal());
        }

        // Modal events
        if (this.modal) {
            // Fechar modal (fallback)
            const closeBtn = this.modal.querySelector('.btn-close');
            if (closeBtn && !window.bootstrap?.Modal) {
                closeBtn.addEventListener('click', () => this.closeModal());
            }

            // Tabs
            const tabBtns = this.modal.querySelectorAll('.nav-link[data-tab]');
            tabBtns.forEach(btn => {
                btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
            });

            // Formato do template
            const formatSelect = document.getElementById('template-format');
            if (formatSelect) {
                formatSelect.addEventListener('change', () => this.toggleGroupByField());
            }

            // Salvar template
            const saveTemplateBtn = document.getElementById('save-template-btn');
            if (saveTemplateBtn) {
                saveTemplateBtn.addEventListener('click', () => this.saveCustomTemplate());
            }

            // Visualizar template
            const previewTemplateBtn = document.getElementById('preview-template-btn');
            if (previewTemplateBtn) {
                previewTemplateBtn.addEventListener('click', () => this.previewTemplate());
            }

            // Gerar relatório
            const generateReportBtn = document.getElementById('generate-report-btn');
            if (generateReportBtn) {
                generateReportBtn.addEventListener('click', () => this.generateReport());
            }

            // Exportar CSV
            const exportCsvBtn = document.getElementById('export-csv-btn');
            if (exportCsvBtn) {
                exportCsvBtn.addEventListener('click', () => this.exportCurrentReport('csv'));
            }

            // Exportar PDF
            const exportPdfBtn = document.getElementById('export-pdf-btn');
            if (exportPdfBtn) {
                exportPdfBtn.addEventListener('click', () => this.exportCurrentReport('pdf'));
            }

            // Limpar histórico
            const clearHistoryBtn = document.getElementById('clear-history-btn');
            if (clearHistoryBtn) {
                clearHistoryBtn.addEventListener('click', () => this.clearHistory());
            }
        }
    }

    /**
     * Abre modal
     */
    openModal() {
        if (!this.modal) return;
        this.updateModalContent();
        
        // Aplicar tema atual
        const currentTheme = document.documentElement.getAttribute('data-theme');
        this.modal.setAttribute('data-theme', currentTheme || 'light');

        if (window.bootstrap?.Modal) {
            window.bootstrap.Modal.getOrCreateInstance(this.modal).show();
        } else {
            this.modal.classList.add('show');
            this.modal.style.display = 'block';
        }
    }

    /**
     * Fecha modal
     */
    closeModal() {
        if (!this.modal) return;
        if (window.bootstrap?.Modal) {
            window.bootstrap.Modal.getOrCreateInstance(this.modal).hide();
        } else {
            this.modal.classList.remove('show');
            this.modal.style.display = 'none';
        }
    }

    /**
     * Troca de tab
     */
    switchTab(tabName) {
        // Atualizar botões
        const tabBtns = this.modal.querySelectorAll('.nav-link[data-tab]');
        tabBtns.forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        // Atualizar conteúdo
        const tabContents = this.modal.querySelectorAll('.tab-pane');
        tabContents.forEach(content => {
            const isActive = content.id === `${tabName}-tab`;
            content.classList.toggle('active', isActive);
            content.classList.toggle('show', isActive);
        });

        // Atualizar conteúdo específico da tab
        this.updateTabContent(tabName);
    }

    /**
     * Atualiza conteÃºdo do modal
     */
    updateModalContent() {
        this.updateTemplatesGrid();
        this.updateFieldsSelector();
        this.updateTemplateSelector();
        this.updateStatusFilter();
        this.updateHistoryList();
    }

    /**
     * Atualiza grid de templates
     */
    updateTemplatesGrid() {
        if (!window.reportsService) return;

        const templates = window.reportsService.getTemplates();
        const container = document.getElementById('templates-grid');
        
        if (!container) return;

        container.innerHTML = templates.map(template => `
            <div class="template-card" data-template-id="${template.id}">
                <h4>${template.nome}</h4>
                <p>${template.descricao}</p>
                <div class="template-info">
                    <span>${template.campos.length} campos</span>
                    <span>${template.incluirGraficos ? 'Com gráficos' : 'Sem gráficos'}</span>
                </div>
            </div>
        `).join('');

        // Adicionar eventos de clique
        container.querySelectorAll('.template-card').forEach(card => {
            card.addEventListener('click', () => this.selectTemplate(card.dataset.templateId));
        });
    }

    /**
     * Atualiza seletor de campos
     */
    updateFieldsSelector() {
        const availableFields = [
            'vendedorConstrutora',
            'empreendimento',
            'clientePrincipal',
            'clienteConjuge',
            'valorContrato',
            'entrada',
            'financiamento',
            'saldoReceber',
            'status',
            'dataAssinatura',
            'dataEntrega',
            'observacoes'
        ];

        const container = document.getElementById('fields-selector');
        if (!container) return;

        container.innerHTML = availableFields.map(field => `
            <div class="col-md-6">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="field-${field}" value="${field}">
                    <label class="form-check-label" for="field-${field}">${this.getFieldLabel(field)}</label>
                </div>
            </div>
        `).join('');
    }

    /**
     * Obtém label do campo
     */
    getFieldLabel(field) {
        const labels = {
            vendedorConstrutora: 'Vendedor/Construtora',
            empreendimento: 'Empreendimento',
            clientePrincipal: 'Cliente Principal',
            clienteConjuge: 'Cônjuge',
            valorContrato: 'Valor do Contrato',
            entrada: 'Entrada',
            financiamento: 'Financiamento',
            saldoReceber: 'Saldo a Receber',
            status: 'Status',
            dataAssinatura: 'Data de Assinatura',
            dataEntrega: 'Data de Entrega',
            observacoes: 'Observações'
        };
        return labels[field] || field;
    }

    /**
     * Atualiza seletor de templates
     */
    updateTemplateSelector() {
        if (!window.reportsService) return;

        const templates = window.reportsService.getTemplates();
        const select = document.getElementById('selected-template');
        
        if (!select) return;

        select.innerHTML = templates.map(template => 
            `<option value="${template.id}">${template.nome}</option>`
        ).join('');
    }

    /**
     * Atualiza filtro de status usando status dinâmicos
     */
    updateStatusFilter() {
        // Usa status dinâmicos se disponíveis, senão fallback para lista básica
        let statusOptions;
        if (window.EFFECTIVE_STATUS_CONFIG && window.EFFECTIVE_STATUS_CONFIG.length > 0) {
            statusOptions = window.EFFECTIVE_STATUS_CONFIG.map(s => s.text);
        } else {
            // Fallback para status básicos se não conseguir carregar dinâmicos
            statusOptions = [
                'Ativo', 'Pago', 'Cancelado', 'Em andamento', 
                'Pendente', 'Finalizado', 'Suspenso'
            ];
        }

        const select = document.getElementById('filter-status');
        if (!select) return;

        select.innerHTML = statusOptions.map(status => 
            `<option value="${status}">${status}</option>`
        ).join('');
    }

    /**
     * Atualiza lista do histórico
     */
    updateHistoryList() {
        if (!window.reportsService) return;

        const history = window.reportsService.getReportHistory();
        const container = document.getElementById('reports-history-list');
        
        if (!container) return;

        if (history.length === 0) {
            container.innerHTML = '<p>Nenhum relatório gerado ainda</p>';
            return;
        }

        container.innerHTML = history.map(item => `
            <div class="history-item">
                <div class="history-item-info">
                    <div class="history-item-name">${item.templateNome}</div>
                    <div class="history-item-details">
                        ${this.formatDate(item.geradoEm)} ? 
                        ${item.totalRegistros} registros ? 
                        ${item.usuario}
                    </div>
                </div>
                <div class="history-item-actions d-flex gap-2">
                    <button class="btn btn-outline-secondary btn-sm" onclick="reportsUI.regenerateReport('${item.id}')">
                        <i class="fas fa-redo"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Atualiza conteúdo específico da tab
     */
    updateTabContent(tabName) {
        switch (tabName) {
            case 'templates':
                this.updateTemplatesGrid();
                break;
            case 'custom':
                this.updateFieldsSelector();
                break;
            case 'generate':
                this.updateTemplateSelector();
                this.updateStatusFilter();
                break;
            case 'history':
                this.updateHistoryList();
                break;
        }
    }

    /**
     * Seleciona template
     */
    selectTemplate(templateId) {
        // Remover seleÃ§Ã£o anterior
        this.modal.querySelectorAll('.template-card').forEach(card => {
            card.classList.remove('selected');
        });

        // Selecionar novo template
        const card = this.modal.querySelector(`[data-template-id="${templateId}"]`);
        if (card) {
            card.classList.add('selected');
        }

        // Ir para tab de geração
        this.switchTab('generate');
        
        // Selecionar template no dropdown
        const select = document.getElementById('selected-template');
        if (select) {
            select.value = templateId;
        }
    }

    /**
     * Toggle campo agrupar por
     */
    toggleGroupByField() {
        const format = document.getElementById('template-format').value;
        const container = document.getElementById('group-by-container');
        
        if (container) {
            container.classList.toggle('d-none', format !== 'agrupado');
        }
    }

    /**
     * Salva template customizado
     */
    async saveCustomTemplate() {
        if (!window.reportsService) return;

        try {
            const name = document.getElementById('template-name').value.trim();
            const description = document.getElementById('template-desc').value.trim();
            
            if (!name) {
                alert('Nome do template é obrigatório');
                return;
            }

            // Obter campos selecionados
            const selectedFields = [];
            document.querySelectorAll('#fields-selector input:checked').forEach(input => {
                selectedFields.push(input.value);
            });

            if (selectedFields.length === 0) {
                alert('Selecione pelo menos um campo');
                return;
            }

            const template = {
                id: this.generateTemplateId(name),
                nome: name,
                descricao: description,
                campos: selectedFields,
                filtros: {
                    status: [],
                    dataInicio: null,
                    dataFim: null
                },
                ordenacao: {
                    campo: document.getElementById('template-sort-field').value,
                    direcao: document.getElementById('template-sort-dir').value
                },
                formato: document.getElementById('template-format').value,
                incluirGraficos: document.getElementById('template-include-charts').checked,
                incluirResumo: document.getElementById('template-include-summary').checked,
                incluirEstatisticas: document.getElementById('template-include-stats').checked,
                incluirTotais: document.getElementById('template-include-totals').checked
            };

            if (template.formato === 'agrupado') {
                template.agruparPor = document.getElementById('template-group-by').value;
            }

            window.reportsService.saveCustomTemplate(template);
            
            // Limpar formulário
            this.clearCustomTemplateForm();
            
            // Atualizar grid
            this.updateTemplatesGrid();
            this.updateTemplateSelector();
            
            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Template salvo com sucesso!',
                    'success'
                );
            }

        } catch (error) {
            console.error('Erro ao salvar template:', error);
            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Erro ao salvar template: ' + error.message,
                    'error'
                );
            }
        }
    }

    /**
     * Gera ID do template
     */
    generateTemplateId(name) {
        return `custom_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    }

    /**
     * Limpa formulário de template customizado
     */
    clearCustomTemplateForm() {
        document.getElementById('template-name').value = '';
        document.getElementById('template-desc').value = '';
        document.querySelectorAll('#fields-selector input').forEach(input => {
            input.checked = false;
        });
        document.getElementById('template-format').value = 'tabela';
        document.getElementById('template-sort-field').value = 'dataAssinatura';
        document.getElementById('template-sort-dir').value = 'desc';
        document.getElementById('template-include-charts').checked = false;
        document.getElementById('template-include-summary').checked = true;
        document.getElementById('template-include-stats').checked = false;
        document.getElementById('template-include-totals').checked = false;
        this.toggleGroupByField();
    }

    /**
     * Visualiza template
     */
    async previewTemplate() {
        // Implementar preview do template
        alert('Função de preview será implementada');
    }

    /**
     * Gera relatório
     */
    async generateReport() {
        if (!window.reportsService) return;

        const button = document.getElementById('generate-report-btn');
        const originalHtml = button.innerHTML;
        
        try {
            button.innerHTML = '<span class="loading-spinner"></span> Gerando...';
            button.disabled = true;

            const templateId = document.getElementById('selected-template').value;
            
            // Obter filtros
            const filters = this.getFiltersFromForm();
            
            // Gerar relatório
            const report = await window.reportsService.generateReport(templateId, filters);
            this.currentReport = report;
            
            // Mostrar preview
            this.showReportPreview(report);
            
            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Relatório gerado com sucesso!',
                    'success'
                );
            }

        } catch (error) {
            console.error('Erro ao gerar relatório:', error);
            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Erro ao gerar relatório: ' + error.message,
                    'error'
                );
            }
        } finally {
            button.innerHTML = originalHtml;
            button.disabled = false;
        }
    }

    /**
     * Obtém filtros do formulário
     */
    getFiltersFromForm() {
        const filters = {};

        // Status
        const statusSelect = document.getElementById('filter-status');
        const selectedStatuses = Array.from(statusSelect.selectedOptions).map(option => option.value);
        if (selectedStatuses.length > 0) {
            filters.status = selectedStatuses;
        }

        // Datas
        const startDate = document.getElementById('filter-date-start').value;
        if (startDate) {
            filters.dataInicio = startDate;
        }

        const endDate = document.getElementById('filter-date-end').value;
        if (endDate) {
            filters.dataFim = endDate;
        }

        // Valores
        const minValue = document.getElementById('filter-value-min').value;
        if (minValue) {
            filters.valorMinimo = parseFloat(minValue);
        }

        const maxValue = document.getElementById('filter-value-max').value;
        if (maxValue) {
            filters.valorMaximo = parseFloat(maxValue);
        }

        return filters;
    }

    /**
     * Mostra preview do relatório
     */
    showReportPreview(report) {
        const container = document.getElementById('report-preview');
        const actionsContainer = document.getElementById('report-actions');
        
        if (!container || !actionsContainer) return;

        let html = '';

        // Estatísticas
        if (report.statistics) {
            html += '<div class="preview-stats">';
            html += `<div class="preview-stat">
                <div class="preview-stat-value">${report.statistics.total}</div>
                <div class="preview-stat-label">Total de Registros</div>
            </div>`;
            
            if (report.statistics.valorTotal > 0) {
                html += `<div class="preview-stat">
                    <div class="preview-stat-value">R$ ${report.statistics.valorTotal.toLocaleString('pt-BR')}</div>
                    <div class="preview-stat-label">Valor Total</div>
                </div>`;
                
                html += `<div class="preview-stat">
                    <div class="preview-stat-value">R$ ${report.statistics.valorMedio.toLocaleString('pt-BR')}</div>
                    <div class="preview-stat-label">Valor Médio</div>
                </div>`;
            }
            html += '</div>';
        }

        // Dados
        html += '<h4>Dados do Relatório</h4>';
        
        if (Array.isArray(report.data)) {
            // Tabela simples
            if (report.data.length > 0) {
                html += '<table class="preview-table">';
                
                // Cabeçalho
                const headers = Object.keys(report.data[0]);
                html += '<tr>';
                headers.forEach(header => {
                    html += `<th>${this.getFieldLabel(header)}</th>`;
                });
                html += '</tr>';
                
                // Dados (mostrar apenas primeiros 10)
                report.data.slice(0, 10).forEach(row => {
                    html += '<tr>';
                    headers.forEach(header => {
                        const value = row[header] || '';
                        html += `<td>${value}</td>`;
                    });
                    html += '</tr>';
                });
                
                if (report.data.length > 10) {
                    html += `<tr><td colspan="${headers.length}"><em>... e mais ${report.data.length - 10} registros</em></td></tr>`;
                }
                
                html += '</table>';
            }
        } else {
            // Dados agrupados
            Object.entries(report.data).forEach(([group, items]) => {
                html += `<h5>${group} (${items.length} registros)</h5>`;
                
                if (items.length > 0) {
                    html += '<table class="preview-table">';
                    
                    // Cabeçalho
                    const headers = Object.keys(items[0]);
                    html += '<tr>';
                    headers.forEach(header => {
                        html += `<th>${this.getFieldLabel(header)}</th>`;
                    });
                    html += '</tr>';
                    
                    // Dados (mostrar apenas primeiros 5 de cada grupo)
                    items.slice(0, 5).forEach(row => {
                        html += '<tr>';
                        headers.forEach(header => {
                            const value = row[header] || '';
                            html += `<td>${value}</td>`;
                        });
                        html += '</tr>';
                    });
                    
                    if (items.length > 5) {
                        html += `<tr><td colspan="${headers.length}"><em>... e mais ${items.length - 5} registros</em></td></tr>`;
                    }
                    
                    html += '</table>';
                }
            });
        }

        container.innerHTML = html;
        container.classList.remove('d-none');
        actionsContainer.classList.remove('d-none');
    }

    /**
     * Exporta relatório atual
     */
    async exportCurrentReport(format) {
        if (!this.currentReport || !window.reportsService) return;

        try {
            if (format === 'csv') {
                window.reportsService.exportToCSV(this.currentReport);
            } else if (format === 'pdf') {
                await window.reportsService.exportToPDF(this.currentReport);
            }

            if (window.notificationService) {
                window.notificationService.showNotification(
                    `Relatório exportado em ${format.toUpperCase()} com sucesso!`,
                    'success'
                );
            }

        } catch (error) {
            console.error(`Erro ao exportar ${format}:`, error);
            if (window.notificationService) {
                window.notificationService.showNotification(
                    `Erro ao exportar ${format.toUpperCase()}: ${error.message}`,
                    'error'
                );
            }
        }
    }

    /**
     * Limpa histÃ³rico
     */
    clearHistory() {
        if (!window.reportsService) return;

        const confirm = window.confirm(
            'Tem certeza de que deseja limpar todo o histórico de relatórios?'
        );

        if (confirm) {
            window.reportsService.clearReportHistory();
            this.updateHistoryList();
            
            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Histórico de relatórios limpo com sucesso',
                    'success'
                );
            }
        }
    }

    /**
     * Regenera relatório do histórico
     */
    async regenerateReport() {
        // Implementar regeneração de relatório
        alert('Função de regeneração será implementada');
    }

    /**
     * Formata data
     */
    formatDate(date) {
        if (!date) return '-';
        
        const d = new Date(date);
        return d.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

// Instância global
window.reportsUI = new ReportsUI();
