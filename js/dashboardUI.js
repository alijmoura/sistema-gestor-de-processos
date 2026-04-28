// =============================================================================
// DASHBOARD UI - Interface do Dashboard Avançado
// =============================================================================

// usa debug global definido em debug.js

class DashboardUI {
    constructor(service = null) {
        this.dashboardService = service || null;
        this.charts = {};
        this.filters = {};
        this.refreshInterval = null;
        this.isInitialized = false;
        this._initialLoadOptions = { allowHeavyFallback: true };
        this._waitingForFullContracts = false;
        this._fullContractsReadyHandler = null;
        this._isAdminCache = null;
        this._isAdminCacheTimestamp = 0;
        this._isAdminCacheTTL = 60 * 1000;
        this._signedMonthOptions = [];
        this._selectedSignedMonthKey = '';
        this._kpiStorageKeys = {
            local: 'dashboardCustomKPIsLocal',
            legacy: 'dashboardCustomKPIs'
        };
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    getKPIVisibilityKey(kpi) {
        return (kpi && (kpi.type || kpi.id)) || '';
    }

    async isCurrentUserAdmin() {
        const now = Date.now();
        if (this._isAdminCache !== null && (now - this._isAdminCacheTimestamp) < this._isAdminCacheTTL) {
            return this._isAdminCache;
        }

        let isAdmin = false;
        try {
            if (window.firestoreService?.isCurrentUserAdmin) {
                isAdmin = !!(await window.firestoreService.isCurrentUserAdmin());
            }
        } catch (e) {
            console.warn('Falha ao verificar permissao de admin:', e);
        }

        this._isAdminCache = isAdmin;
        this._isAdminCacheTimestamp = now;
        return isAdmin;
    }

    bindFullContractsReadyListener() {
        if (this._fullContractsReadyHandler || typeof window === 'undefined') {
            return;
        }

        this._fullContractsReadyHandler = async (event) => {
            const contracts = Array.isArray(window.appState?.allContracts)
                ? window.appState.allContracts
                : [];

            if (!contracts.length) {
                return;
            }

            this._preloadedContracts = [...contracts];
            this.clearContractsCache();
            this._waitingForFullContracts = false;

            if (!this.isInitialized) {
                return;
            }

            try {
                await this.loadInitialData({
                    allowHeavyFallback: true,
                    source: event?.detail?.source || 'contracts:full-cache-ready'
                });
                console.log(`[DashboardUI] Dados detalhados atualizados com ${contracts.length} contratos em cache`);
            } catch (error) {
                console.warn('[DashboardUI] Falha ao atualizar dashboard após cache completo:', error);
            }
        };

        window.addEventListener('contracts:full-cache-ready', this._fullContractsReadyHandler);
    }

    parseNumericValue(value) {
        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : NaN;
        }
        if (typeof value !== 'string') return NaN;

        const raw = value.trim().replace(/\s+/g, '');
        if (!raw) return NaN;

        // pt-BR: 1.234,56
        if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
            const parsed = Number(raw.replace(/\./g, '').replace(',', '.'));
            return Number.isFinite(parsed) ? parsed : NaN;
        }

        // en-US: 1,234.56
        if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(raw)) {
            const parsed = Number(raw.replace(/,/g, ''));
            return Number.isFinite(parsed) ? parsed : NaN;
        }

        const parsed = Number(raw.replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    normalizeKPIDefinition(kpi, source = 'local') {
        if (!kpi || typeof kpi !== 'object') return null;

        const id = String(kpi.id || '').trim();
        const title = String(kpi.title || '').trim();
        if (!id || !title) return null;

        const agg = String(kpi.agg || 'count');
        const field = kpi.field ? String(kpi.field).trim() : '';

        const normalized = {
            ...kpi,
            id,
            title,
            type: String(kpi.type || id).trim() || id,
            icon: String(kpi.icon || '').trim(),
            color: String(kpi.color || 'primary').trim() || 'primary',
            unit: String(kpi.unit || '').trim(),
            agg,
            ...(field ? { field } : {}),
            formatType: String(kpi.formatType || 'raw').trim() || 'raw',
            decimals: Number.isFinite(Number(kpi.decimals))
                ? Math.max(0, Math.min(Number(kpi.decimals), 6))
                : 0,
            _source: source
        };

        if (normalized.id === 'kpi-total' || normalized.type === 'total') {
            normalized.title = 'Processos em Andamento';
        }

        return normalized;
    }

    normalizeKPIList(list, source = 'local') {
        if (!Array.isArray(list)) return [];
        return list
            .map((item) => this.normalizeKPIDefinition(item, item?._source || source))
            .filter(Boolean);
    }

    loadLocalCustomKPIList() {
        const { local, legacy } = this._kpiStorageKeys;
        try {
            const rawLocal = localStorage.getItem(local);
            if (rawLocal) {
                const parsedLocal = this.normalizeKPIList(JSON.parse(rawLocal), 'local');
                const sanitizedLocal = this.sanitizeKPIList(parsedLocal);
                if (sanitizedLocal.removed) {
                    this.saveLocalCustomKPIList(sanitizedLocal.list);
                }
                return sanitizedLocal.list;
            }
        } catch { /* noop */ }

        // Fallback legado
        try {
            const rawLegacy = localStorage.getItem(legacy);
            if (rawLegacy) {
                const parsed = this.normalizeKPIList(JSON.parse(rawLegacy), 'local');
                const sanitizedLegacy = this.sanitizeKPIList(parsed);
                try {
                    localStorage.setItem(local, JSON.stringify(sanitizedLegacy.list.map((item) => {
                        return this.stripKPIInternalFields(item);
                    })));
                } catch { /* noop */ }
                return sanitizedLegacy.list;
            }
        } catch { /* noop */ }

        return [];
    }

    saveLocalCustomKPIList(list) {
        const { local, legacy } = this._kpiStorageKeys;
        const clean = this.normalizeKPIList(list, 'local').map((item) => {
            return this.stripKPIInternalFields(item);
        });
        try {
            localStorage.setItem(local, JSON.stringify(clean));
            // Mantem chave legada para compatibilidade retroativa.
            localStorage.setItem(legacy, JSON.stringify(clean));
        } catch { /* noop */ }
    }

    stripKPIInternalFields(item) {
        const clone = { ...(item || {}) };
        delete clone._source;
        return clone;
    }

    shouldRemoveDeprecatedKPI(item) {
        if (!item || typeof item !== 'object') return false;
        const id = String(item.id || '').trim().toLowerCase();
        const type = String(item.type || '').trim().toLowerCase();
        const title = String(item.title || '').trim().toLowerCase();
        return id === 'kpi-value'
            || title === 'valor total financiamento'
            || id === 'kpi-em-andamento'
            || type === 'emandamento';
    }

    sanitizeKPIList(list) {
        const source = Array.isArray(list) ? list : [];
        const sanitized = source.filter((item) => !this.shouldRemoveDeprecatedKPI(item));
        return {
            list: sanitized,
            removed: sanitized.length !== source.length
        };
    }

    /**
     * Inicializa a interface do dashboard
     * @param {Array} preloadedContracts - Contratos já carregados (opcional, evita re-busca)
     */
    async init(preloadedContracts = null, options = {}) {
        try {
            //  Proteção contra inicialização duplicada
            if (this.isInitialized) {
                console.warn(' [DashboardUI] Já inicializado, ignorando chamada duplicada');
                return;
            }

            this._initialLoadOptions = {
                allowHeavyFallback: options.allowHeavyFallback !== false
            };
            this.bindFullContractsReadyListener();
            
            //  Armazena contratos pré-carregados para uso posterior
            if (preloadedContracts && Array.isArray(preloadedContracts) && preloadedContracts.length > 0) {
                this._preloadedContracts = preloadedContracts;
                if (window.__DEBUG__) {
                    console.log(` [DashboardUI] Cache pré-carregado recebido: ${preloadedContracts.length} contratos`);
                }
            }
            
            // Aguardar DOM e serviços estarem prontos
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.initializeUI());
            } else {
                this.initializeUI();
            }
        } catch (error) {
            console.error('Erro ao inicializar DashboardUI:', error);
        }
    }

    /**
     * Inicialização da interface
     */
    async initializeUI() {
        try {
            // Conectar com o serviço
            await this.connectToService();
            
            // Configurar interface
            this.setupAdvancedDashboard();
            // Carregar config de KPIs (Firestore se disponível, fallback localStorage)
            await this.loadAndApplyKPIVisibilityConfig();
            this.bindEvents();
            
            // Carregar dados iniciais
            await this.loadInitialData(this._initialLoadOptions);
            
            // Configurar auto-refresh
            this.setupAutoRefresh();
            
            this.isInitialized = true;
            window.debug && debug(' DashboardUI inicializado com sucesso');
        } catch (error) {
            console.error(' Erro ao inicializar DashboardUI:', error);
        }
    }

    /**
     * Conecta com o serviço de dashboard
     */
    async connectToService() {
        let attempts = 0;
        while (attempts < 30 && !this.dashboardService && !window.dashboardService) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (this.dashboardService || window.dashboardService) {
            this.dashboardService = this.dashboardService || window.dashboardService;
            await this.dashboardService.initialize();
            window.debug && debug(' Conectado ao DashboardService');
        } else {
            console.warn(' DashboardService não disponível');
        }
    }

    /**
     * Configura o dashboard avançado integrando com o existente
     */
    setupAdvancedDashboard() {
        // Em vez de substituir, vamos melhorar o dashboard existente
        this.enhanceExistingDashboard();
        // Ações extras removidas por solicitação
    }

    /**
     * Melhora o dashboard existente sem substituir
     */
    enhanceExistingDashboard() {
        const dashboardSection = document.getElementById('dashboard');
        if (!dashboardSection) return;

        // Adicionar classes e estilos ao dashboard existente
        dashboardSection.classList.add('dashboard-enhanced');
        
        // Melhorar os cards existentes
        const existingCards = dashboardSection.querySelectorAll('.dashboard-card');
        existingCards.forEach((card, index) => {
            card.classList.add('kpi-card');
            
            // Adicionar ícones aos cards existentes
            const iconMap = [
                'bi-calendar-month text-primary',
                'bi-clock text-warning', 
                'bi-hourglass-split text-info'
            ];
            
            if (iconMap[index]) {
                const icon = document.createElement('div');
                icon.className = 'kpi-icon';
                icon.innerHTML = `<i class="${iconMap[index]}"></i>`;
                card.insertBefore(icon, card.firstChild);
            }
        });

        // Removido: KPIs complementares fixos. Agora apenas KPIs personalizados via KPIManager.
    }

    /**
     * Adiciona KPIs complementares ao dashboard existente
     */
    // addComplementaryKPIs removido

    // addAdvancedFilters removido (filtros adicionais foram solicitados para remoção)

    /**
     * Vincula eventos da interface
     */
    bindEvents() {
        // Offcanvas de Gerenciamento de KPIs personalizados
        const kpiManagerOffcanvas = document.getElementById('kpiManagerOffcanvas');
        if (window.__DEBUG__) {
            console.log('[DashboardUI] kpiManagerOffcanvas element:', kpiManagerOffcanvas);
        }
        if (kpiManagerOffcanvas) {
            // Preencher selects de campos disponíveis quando offcanvas abrir
            kpiManagerOffcanvas.addEventListener('show.bs.offcanvas', () => {
                if (window.__DEBUG__) console.log('[DashboardUI] Offcanvas show.bs.offcanvas disparado');
                this.populateKpiFieldSelects(); // Síncrono - não faz queries
                this.renderCustomKpisList();
                // Ajustar inputs extras conforme operador atual
                this.adjustFilterExtraInputs();
            });
            kpiManagerOffcanvas.addEventListener('shown.bs.offcanvas', () => {
                if (window.__DEBUG__) console.log('[DashboardUI] Offcanvas shown.bs.offcanvas disparado (totalmente aberto)');
            });
            // Cancelar edição quando offcanvas for fechado
            kpiManagerOffcanvas.addEventListener('hidden.bs.offcanvas', () => {
                if (this._editingKPIId) {
                    this.cancelEditKPI();
                }
            });
        } else {
            console.warn('[DashboardUI] Elemento #kpiManagerOffcanvas NÃO encontrado no DOM!');
        }

        // Bind eventos de KPI (funciona tanto com offcanvas quanto fallback)
        document.getElementById('kpi-add-btn')?.addEventListener('click', async () => {
            await this.handleAddCustomKPI();
        });

        // Operador: alternar inputs extras
        document.getElementById('kpi-filter-operator-select')?.addEventListener('change', () => {
            this.adjustFilterExtraInputs();
        });

        // Botão de pré-visualização
        document.getElementById('kpi-preview-btn')?.addEventListener('click', async () => {
            await this.previewCustomKPI();
        });

        // Botão de restaurar padrões
        document.getElementById('kpi-reset-defaults-btn')?.addEventListener('click', async () => {
            if (!confirm('Isso irá substituir todos os KPIs pelos padrões do sistema. Deseja continuar?')) return;
            await this.resetToDefaultKPIs();
        });

        // Botão de atualizar dashboard
        document.getElementById('kpi-refresh-btn')?.addEventListener('click', async () => {
            this.clearContractsCache();
            await this.loadKPIs();
            this.showNotification('Dashboard atualizado!', 'success');
        });

        // Templates rápidos de KPI
        const tplMap = {
            'kpi-template-assinados-mes': 'assinados-mes',
            'kpi-template-total-contratos': 'total-contratos',
            'kpi-template-tempo-medio-analise-cehop': 'tempo-medio-analise-cehop',
            'kpi-template-tempo-medio-liberacao-garantia': 'tempo-medio-liberacao-garantia',
            'kpi-template-entradas-mes': 'entradas-mes',
            'kpi-template-entradas-ano': 'entradas-ano'
        };
        Object.keys(tplMap).forEach(id => {
            document.getElementById(id)?.addEventListener('click', () => this.applyKpiTemplate(tplMap[id]));
        });
    }

    /**
     * Carrega dados iniciais
     */
    async loadInitialData(options = {}) {
        try {
            // Filtros adicionais removidos; nenhuma opção extra para carregar
            
            // Carregar KPIs (sistema unificado - já carrega tudo da lista configurada)
            await this.loadKPIs(options);
            // NOTA: loadCustomKPIsFromSettings foi removido pois causava duplicação.
            // loadKPIs() já lê a lista de KPIs (getCustomKPIList) que inclui os customizados.
            
            // Atualizar timestamp
            this.updateTimestamp();
        } catch (error) {
            console.error('Erro ao carregar dados iniciais:', error);
        }
    }

    /**
     * Carrega opções dos filtros aprimorados
     */
    async loadFilterOptions() { /* filtros adicionais removidos */ }

    /**
     * Carrega KPIs - sistema unificado (todos configuráveis)
     */
    async loadKPIs(options = {}) {
        if (!this.dashboardService) return;
        const row = document.getElementById('dashboard-kpis-row');
        if (!row) return;
        const allowHeavyFallback = options.allowHeavyFallback !== false;

        // Exibe loading state com layout horizontal
        row.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            const col = document.createElement('div');
            col.className = 'col-12 col-md-6 col-lg-3 dashboard-kpi-col';
            col.innerHTML = `
              <div class="dashboard-card kpi-card placeholder-glow">
                <div class="kpi-icon placeholder rounded"></div>
                <div class="kpi-body">
                  <div class="kpi-title placeholder col-8 mb-1"></div>
                  <div class="kpi-value placeholder col-5"></div>
                </div>
              </div>
            `;
            row.appendChild(col);
        }

        try {
            // Obter lista de KPIs configurados
            let kpiList = await this.getCustomKPIList();
            
            // Se não houver KPIs, inicializa com os padrões
            if (!kpiList || kpiList.length === 0) {
                kpiList = this.getDefaultKPIs();
                await this.saveCustomKPIList(kpiList);
            }

            // Carregar config de visibilidade
            const cfg = this.currentKPIConfig || this.loadSavedKPIConfig();

            // Limpa row
            row.innerHTML = '';

            // Filtra apenas KPIs visíveis
            const visibleKPIs = kpiList.filter(k => cfg?.[this.getKPIVisibilityKey(k)] !== false);

            // PRÉ-CARREGA contratos uma única vez para evitar múltiplas queries paralelas
            //  OTIMIZAÇÃO: Usa SEMPRE o cache global do appState (já carregado no main.js)
            const now = Date.now();
            const CONTRACTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutos de TTL para KPIs
            
            if (!this._contractsCache || !this._contractsCacheTimestamp || (now - this._contractsCacheTimestamp) > CONTRACTS_CACHE_TTL) {
                // PRIORIDADE 1: Usar cache global do appState (dados mais recentes)
                if (window.appState?.allContracts?.length > 0) {
                    this._contractsCache = window.appState.allContracts;
                    console.log(` [DashboardUI/KPIs] Usando ${this._contractsCache.length} contratos do cache global (appState)`);
                    
                    //  DEBUG: Verificar se os campos necessários estão presentes
                    if (window.__DEBUG__) {
                        const sampleContract = this._contractsCache[0] || {};
                        const hasFinanciamento = this._contractsCache.filter(c => c.financiamento).length;
                        const hasDataAssinatura = this._contractsCache.filter(c => c.dataAssinaturaCliente).length;
                        console.log('[DashboardUI/KPIs]  Diagnóstico dos contratos:');
                        console.log(`  - Total de contratos: ${this._contractsCache.length}`);
                        console.log(`  - Com campo 'financiamento': ${hasFinanciamento}`);
                        console.log(`  - Com campo 'dataAssinaturaCliente': ${hasDataAssinatura}`);
                        console.log('  - Amostra do 1º contrato:', {
                            id: sampleContract.id,
                            status: sampleContract.status,
                            financiamento: sampleContract.financiamento,
                            dataAssinaturaCliente: sampleContract.dataAssinaturaCliente,
                            entrada: sampleContract.entrada
                        });
                    }
                }
                // PRIORIDADE 2: Usar contratos pre-carregados (fallback)
                else if (this._preloadedContracts && this._preloadedContracts.length > 0) {
                    this._contractsCache = this._preloadedContracts;
                    if (window.__DEBUG__) {
                        console.log(` [DashboardUI/KPIs] Usando ${this._contractsCache.length} contratos pre-carregados`);
                    }
                } else {
                    this._contractsCache = null;
                    if (allowHeavyFallback) {
                        console.warn(' [DashboardUI/KPIs] Cache global vazio, usando fallback...');
                        this._contractsCache = await this.dashboardService.getAllContracts();
                    }
                }
                if (this._contractsCache) {
                    this._contractsCacheTimestamp = now;
                }
            }
            const cachedContracts = this._contractsCache || [];
            if (!cachedContracts.length && !allowHeavyFallback) {
                this._waitingForFullContracts = true;
                const lightweightKPIs = await this.tryLoadLightweightKPIs(visibleKPIs);

                if (lightweightKPIs) {
                    this.renderComputedKPIs(row, lightweightKPIs);
                    return;
                }

                row.innerHTML = `
                    <div class="col-12">
                        <div class="alert alert-light border d-flex align-items-center gap-2 mb-0">
                            <i class="bi bi-hourglass-split text-primary"></i>
                            Carregando indicadores detalhados em segundo plano.
                        </div>
                    </div>
                `;
                return;
            }

            this._waitingForFullContracts = false;
            console.log(`[DashboardUI/KPIs]  Calculando KPIs com ${cachedContracts.length} contratos`);

            const signedMonthPayload = visibleKPIs.some((kpi) => kpi.type === 'assinadosMes')
                ? await this.loadSignedMonthPayload()
                : null;

            // Calcula valores para todos os KPIs visíveis em paralelo (usando cache compartilhado)
            const kpiPromises = visibleKPIs.map(async (kpiDef) => {
                try {
                    if (kpiDef.type === 'assinadosMes' && signedMonthPayload) {
                        return {
                            ...kpiDef,
                            computedValue: Number(signedMonthPayload.count) || 0,
                            count: Number(signedMonthPayload.count) || 0,
                            monthOptions: signedMonthPayload.months || [],
                            selectedMonthKey: signedMonthPayload.selectedMonthKey || '',
                            currentMonthKey: signedMonthPayload.currentMonthKey || ''
                        };
                    }

                    const result = await this.computeKPIValue(kpiDef, cachedContracts);
                    console.log(`[DashboardUI/KPIs] KPI "${kpiDef.title}" calculado:`, {
                        type: kpiDef.type,
                        agg: kpiDef.agg,
                        field: kpiDef.field,
                        value: result.value,
                        count: result.count
                    });
                    return { ...kpiDef, computedValue: result.value, count: result.count };
                } catch (e) {
                    console.warn(`Erro ao calcular KPI ${kpiDef.id}:`, e);
                    return { ...kpiDef, computedValue: '--', count: 0 };
                }
            });

            const computedKPIs = await Promise.all(kpiPromises);
            this.renderComputedKPIs(row, computedKPIs);

        } catch (error) {
            row.innerHTML = '<div class="col-12"><div class="alert alert-danger">Erro ao carregar KPIs do dashboard.</div></div>';
            console.error('Erro ao carregar KPIs:', error);
        }
    }

    /**
     * Retorna lista de KPIs padrão para inicialização
     */
    getDefaultKPIs() {
        return [
            {
                id: 'kpi-assinados-mes',
                type: 'assinadosMes',
                title: 'Contratos Assinados no Mês',
                icon: 'bi-pen',
                color: 'success',
                agg: 'count',
                filter: { field: 'dataAssinaturaCliente', op: 'includes', value: '__CURRENT_MONTH__' },
                formatType: 'number',
                decimals: 0
            },
            {
                id: 'kpi-total',
                type: 'total',
                title: 'Processos em Andamento',
                icon: 'bi-collection',
                color: 'info',
                agg: 'count',
                formatType: 'number',
                decimals: 0
            }
        ];
    }

    formatSignedMonthLabel(monthKey) {
        const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
        if (!match) return String(monthKey || '');

        const [, year, month] = match;
        const label = new Date(Number(year), Number(month) - 1, 1)
            .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

        return label.charAt(0).toUpperCase() + label.slice(1);
    }

    async loadSignedMonthPayload(forceRefresh = false) {
        if (!this.dashboardService || typeof this.dashboardService.getSignedContractsMetrics !== 'function') {
            return {
                selectedMonthKey: '',
                currentMonthKey: '',
                months: [],
                count: 0
            };
        }

        const metrics = await this.dashboardService.getSignedContractsMetrics(forceRefresh);
        const months = Array.isArray(metrics?.months) ? metrics.months : [];
        const validKeys = new Set(months.map((item) => item.key));
        const fallbackKey = metrics?.selectedMonthKey || metrics?.currentMonthKey || months[0]?.key || '';

        if (!this._selectedSignedMonthKey || !validKeys.has(this._selectedSignedMonthKey)) {
            this._selectedSignedMonthKey = fallbackKey;
        }

        this._signedMonthOptions = months;

        return {
            selectedMonthKey: this._selectedSignedMonthKey,
            currentMonthKey: metrics?.currentMonthKey || fallbackKey,
            months,
            count: Number(metrics?.counts?.[this._selectedSignedMonthKey]) || 0
        };
    }

    async tryLoadLightweightKPIs(visibleKPIs = []) {
        if (!this.dashboardService || !visibleKPIs.length) {
            return null;
        }

        const unsupportedKPI = visibleKPIs.find((kpi) => {
            return kpi.agg !== 'count' || !['assinadosMes', 'emAndamento', 'total'].includes(kpi.type);
        });

        if (unsupportedKPI) {
            return null;
        }

        const needsSummary = visibleKPIs.some((kpi) => ['emAndamento', 'total'].includes(kpi.type));
        const [summary, signedMonthPayload] = await Promise.all([
            needsSummary ? this.dashboardService.getMainKPIs(this.filters || {}) : Promise.resolve(null),
            visibleKPIs.some((kpi) => kpi.type === 'assinadosMes')
                ? this.loadSignedMonthPayload()
                : Promise.resolve(null)
        ]);

        return visibleKPIs.map((kpi) => {
            let value = 0;
            if (kpi.type === 'assinadosMes') {
                value = Number(signedMonthPayload?.count) || 0;
            } else if (kpi.type === 'emAndamento') {
                value = Number(summary?.activeContracts) || 0;
            } else {
                value = Number(summary?.totalContracts) || 0;
            }

            return {
                ...kpi,
                computedValue: value,
                count: value,
                monthOptions: signedMonthPayload?.months || [],
                selectedMonthKey: signedMonthPayload?.selectedMonthKey || '',
                currentMonthKey: signedMonthPayload?.currentMonthKey || ''
            };
        });
    }

    renderComputedKPIs(row, computedKPIs = []) {
        row.innerHTML = '';

        computedKPIs.forEach(kpi => {
            const col = document.createElement('div');
            col.className = 'col-12 col-md-6 col-lg-3 dashboard-kpi-col';
            col.setAttribute('data-kpi-id', kpi.id);
            if (kpi.type) col.setAttribute('data-type', kpi.type);

            const formattedValue = this.formatKPIValue(kpi.computedValue, kpi.formatType, kpi.decimals);
            const color = kpi.color || 'primary';
            const colorClass = `kpi-${color}`;

            let iconHtml = '';
            if (kpi.icon) {
                if (/^bi-[a-z0-9-]+$/i.test(kpi.icon)) {
                    iconHtml = `<i class="bi ${kpi.icon}"></i>`;
                } else {
                    iconHtml = `<span>${this.escapeHtml(kpi.icon)}</span>`;
                }
            }

            const valueClass = kpi.formatType === 'currency' ? 'kpi-value kpi-value--currency' : 'kpi-value';
            const monthOptions = Array.isArray(kpi.monthOptions) ? kpi.monthOptions : [];
            const monthSelectHtml = kpi.type === 'assinadosMes' && monthOptions.length > 0
                ? `
                  <div class="kpi-filter mt-2">
                    <label class="visually-hidden" for="signed-month-select-${this.escapeHtml(kpi.id)}">Mês de referência</label>
                    <select
                      id="signed-month-select-${this.escapeHtml(kpi.id)}"
                      class="form-select form-select-sm kpi-month-select"
                      data-kpi-id="${this.escapeHtml(kpi.id)}"
                    >
                      ${monthOptions.map((option) => {
                          const optionKey = String(option?.key || '');
                          const selected = optionKey === kpi.selectedMonthKey ? 'selected' : '';
                          return `<option value="${this.escapeHtml(optionKey)}" ${selected}>${this.escapeHtml(this.formatSignedMonthLabel(optionKey))}</option>`;
                      }).join('')}
                    </select>
                  </div>
                `
                : '';

            col.innerHTML = `
              <div class="dashboard-card kpi-card ${colorClass}">
                <div class="kpi-icon">${iconHtml}</div>
                <div class="kpi-body">
                  <div class="kpi-title">${this.escapeHtml(kpi.title)}</div>
                  <div class="${valueClass}">${formattedValue}</div>
                  ${monthSelectHtml}
                </div>
              </div>
            `;
            row.appendChild(col);
        });

        row.querySelectorAll('.kpi-month-select').forEach((select) => {
            select.addEventListener('change', async (event) => {
                const nextMonthKey = String(event.target.value || '').trim();
                if (!nextMonthKey || nextMonthKey === this._selectedSignedMonthKey) {
                    return;
                }

                this._selectedSignedMonthKey = nextMonthKey;
                await this.loadKPIs(this._initialLoadOptions || {});
            });
        });

        if (computedKPIs.length === 0) {
            row.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info d-flex align-items-center gap-2">
                        <i class="bi bi-info-circle"></i>
                        Nenhum KPI configurado para exibição. 
                        <button class="btn btn-sm btn-outline-primary ms-2" data-bs-toggle="offcanvas" data-bs-target="#kpiManagerOffcanvas">
                            Gerenciar KPIs
                        </button>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Reseta KPIs para os valores padrão
     */
    async resetToDefaultKPIs() {
        try {
            const defaultKPIs = this.getDefaultKPIs();
            await this.saveCustomKPIList(defaultKPIs);
            this.clearContractsCache();
            await this.loadKPIs();
            await this.renderCustomKpisList();
            this.showNotification('KPIs restaurados para os padrões!', 'success');
        } catch (e) {
            console.error('Erro ao resetar KPIs:', e);
            this.showNotification('Erro ao restaurar KPIs padrão.', 'error');
        }
    }

    /**
     * Formata valor do KPI conforme tipo
     */
    formatKPIValue(value, formatType, decimals = 0) {
        if (value === '--' || value === undefined || value === null) return '--';
        
        const num = typeof value === 'number' ? value : this.parseNumericValue(value);
        if (isNaN(num)) return '--';

        switch (formatType) {
            case 'currency':
                return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: decimals, maximumFractionDigits: decimals });
            case 'percent':
                return num.toFixed(decimals) + '%';
            case 'days':
                return Math.round(num) + ' dias';
            case 'number':
                return num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
            default:
                return String(num);
        }
    }

    /**
     * Carrega KPIs customizados do Firestore/localStorage e registra no KPIManager
     */
    async loadCustomKPIsFromSettings() {
        try {
            let customKPIs = [];
            // Tenta buscar do Firestore
            if (window.firestoreService?.getDashboardSettings) {
                const settings = await window.firestoreService.getDashboardSettings();
                if (settings?.customKPIs && Array.isArray(settings.customKPIs)) {
                    customKPIs = settings.customKPIs;
                }
            }
            // Fallback local
            if (!customKPIs.length) {
                const raw = localStorage.getItem('dashboardCustomKPIs');
                if (raw) {
                    try { customKPIs = JSON.parse(raw) || []; } catch { /* noop */ }
                }
            }

            // Registrar
            customKPIs.forEach(k => this.registerCustomKPI(k));

            // Aplicar visibilidade com base em kpiVisibility
            const cfg = this.currentKPIConfig || this.loadSavedKPIConfig();
            this.applyKPIVisibility(cfg);
        } catch (e) {
            console.warn('Falha ao carregar KPIs customizados:', e);
        }
    }

    /**
     * Registra um KPI customizado a partir de sua definição
     * def: { id, title, icon, unit, type, agg, field, filter?: { field, op, value } }
     */
    registerCustomKPI(def) {
        if (!window.KPIManager) return;
        const id = def.id || this.slugify(def.title);
        const type = def.type || id; // type usado para visibilidade
        const compute = (kpisFromService, dashboardService) => {
            // agrega sobre a lista completa após filtros atuais
            // usa dashboardService.getAllContracts() aplicado com this.filters
            return (async () => {
                const all = await dashboardService.getAllContracts();
                const filtered = dashboardService.applyFilters(all, this.filters || {});
                const source = filtered || [];

                // aplicar filtro custom opcional
                const predicate = this.buildPredicate(def.filter);
                const rows = predicate ? source.filter(predicate) : source;

                const values = def.agg === 'count' ? rows : rows.map(r => this.getFieldValue(r, def.field));
                const numeric = values
                    .map(v => this.parseNumericValue(v))
                    .filter(v => Number.isFinite(v));

                switch (def.agg) {
                    case 'count':
                        return rows.length;
                    case 'sum':
                        return numeric.reduce((a, b) => a + b, 0);
                    case 'avg':
                        return numeric.length ? (numeric.reduce((a, b) => a + b, 0) / numeric.length) : 0;
                    case 'min':
                        return numeric.length ? Math.min(...numeric) : 0;
                    case 'max':
                        return numeric.length ? Math.max(...numeric) : 0;
                    default:
                        return '--';
                }
            })();
        };

    window.KPIManager.register({ id, type, title: def.title, icon: def.icon || '', unit: def.unit || '', compute, formatType: def.formatType || 'raw', decimals: def.decimals || 0 });
    }

    /**
     * Converte um valor de timestamp Firestore para Date JS
     * @param {any} val - Valor que pode ser Timestamp, Date ou string
     * @returns {Date|null} Data JS ou null se inválido
     */
    toJsDate(val) {
        if (!val) return null;
        
        //  FIX: Timestamp serializado do IndexedDB (objeto simples com seconds/nanoseconds)
        if (val && typeof val === 'object' && 'seconds' in val && 'nanoseconds' in val) {
            try {
                // Reconstrói Date a partir de seconds (Firestore Timestamp serializado)
                return new Date(val.seconds * 1000);
            } catch { return null; }
        }
        
        // Timestamp do Firestore
        if (val?.toDate && typeof val.toDate === 'function') {
            try { return val.toDate(); } catch { return null; }
        }
        // Já é Date
        if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
        // String ou número
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    }

    getFieldValue(obj, path) {
        if (!path) return undefined;
        try {
            // Suporte a campo derivado diffDays(campoFim,campoInicio)
            const diffMatch = String(path).match(/^diffDays\(([^,]+),([^)]+)\)$/);
            if (diffMatch) {
                const a = diffMatch[1].trim(); // fim
                const b = diffMatch[2].trim(); // início
                const vA = a.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);
                const vB = b.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);
                if (!vA || !vB) return undefined;
                // Converte timestamps do Firestore para Date JS
                const dA = this.toJsDate(vA);
                const dB = this.toJsDate(vB);
                if (!dA || !dB) return undefined;
                const ms = dA.getTime() - dB.getTime();
                return Math.round(ms / (1000 * 60 * 60 * 24));
            }
            
            const value = path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);
            
            // Normaliza valores numericos em formatos pt-BR/en-US.
            if (value !== undefined && value !== null && value !== '') {
                const numeric = this.parseNumericValue(value);
                if (Number.isFinite(numeric)) {
                    return numeric;
                }
            }
            
            return value;
        } catch { return undefined; }
    }

    buildPredicate(filter) {
        // Suporte a múltiplos filtros (array) combinados com AND
        if (Array.isArray(filter)) {
            const predicates = filter.map(f => this.buildSinglePredicate(f)).filter(Boolean);
            if (!predicates.length) return null;
            return (row) => predicates.every(p => p(row));
        }
        return this.buildSinglePredicate(filter);
    }

    buildSinglePredicate(filter) {
        if (!filter || !filter.field || !filter.op) return null;
        
        // Filtro especial: __EXCLUDE_ARCHIVED_STATUS__ - exclui status com archiveContracts: true
        if (filter.value === '__EXCLUDE_ARCHIVED_STATUS__') {
            return (row) => {
                const statusText = row?.status;
                if (!statusText) return false;
                // Usa EFFECTIVE_STATUS_CONFIG global para verificar se é arquivado
                const statusConfig = window.EFFECTIVE_STATUS_CONFIG || [];
                const statusObj = statusConfig.find(s => s.text === statusText);
                // Se não encontrar ou não for arquivado, inclui
                return !statusObj?.archiveContracts;
            };
        }
        
        const op = filter.op;
        let value = filter.value;
        let value2 = filter.value2;
        // Placeholders dinâmicos para data corrente
        try {
            const now = new Date();
            if (value === '__CURRENT_MONTH__') {
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                value = `${y}-${m}`;
            } else if (value === '__CURRENT_YEAR__') {
                value = String(now.getFullYear());
            } else if (value === '__LAST_7_DAYS__') {
                const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                value = d.toISOString().slice(0, 10);
            } else if (value === '__LAST_30_DAYS__') {
                const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                value = d.toISOString().slice(0, 10);
            } else if (value === '__LAST_90_DAYS__') {
                const d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                value = d.toISOString().slice(0, 10);
            }
    } catch { /* noop */ }
        // Normalizações por operador
        if (op === 'in') {
            if (Array.isArray(value)) {
                // ok
            } else if (typeof value === 'string') {
                value = value.split(',').map(s => s.trim()).filter(Boolean);
            } else {
                value = [value];
            }
        }
        if (op === 'between') {
            if (Array.isArray(value) && value.length >= 2) {
                [value, value2] = value;
            } else if (typeof value === 'string' && value.includes(',')) {
                const parts = value.split(',');
                value = parts[0]?.trim();
                value2 = parts[1]?.trim();
            }
        }
        if (op === 'lastNDays') {
            const n = parseInt(value, 10);
            value = isNaN(n) ? 0 : n;
        }
        return (row) => {
            const v = this.getFieldValue(row, filter.field);
            // Usa toJsDate para converter timestamps do Firestore
            const toJsDate = (x) => this.toJsDate(x);
            const toNumber = (x) => this.parseNumericValue(x);
            const compareNumbersOrDates = (left, right, cmp) => {
                const leftDate = toJsDate(left);
                const rightDate = toJsDate(right);
                if (leftDate && rightDate) {
                    return cmp(leftDate.getTime(), rightDate.getTime());
                }

                const leftNumber = toNumber(left);
                const rightNumber = toNumber(right);
                if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
                    return cmp(leftNumber, rightNumber);
                }

                return false;
            };
            switch (op) {
                case '==': {
                    // Para datas, compara por data (YYYY-MM-DD)
                    const vDate = toJsDate(v);
                    if (vDate && typeof value === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(value)) {
                        const vStr = vDate.toISOString().slice(0, value.length);
                        return vStr === value;
                    }
                    return v == value;
                }
                case '!=': {
                    const vDate = toJsDate(v);
                    if (vDate && typeof value === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(value)) {
                        const vStr = vDate.toISOString().slice(0, value.length);
                        return vStr !== value;
                    }
                    return v != value;
                }
                case '>': return compareNumbersOrDates(v, value, (a, b) => a > b);
                case '>=': return compareNumbersOrDates(v, value, (a, b) => a >= b);
                case '<': return compareNumbersOrDates(v, value, (a, b) => a < b);
                case '<=': return compareNumbersOrDates(v, value, (a, b) => a <= b);
                case 'includes': {
                    // Para datas, compara pelo formato YYYY-MM ou YYYY-MM-DD
                    const vDate = toJsDate(v);
                    if (vDate && typeof value === 'string') {
                        const vStr = vDate.toISOString().slice(0, 10); // YYYY-MM-DD
                        return vStr.includes(value) || value.includes(vStr.slice(0, 7));
                    }
                    return String(v || '').toLowerCase().includes(String(value || '').toLowerCase());
                }
                case 'in': {
                    if (!Array.isArray(value)) return false;
                    if (typeof v === 'string') {
                        const lv = v.toLowerCase().trim();
                        return value.some(it => String(it).toLowerCase().trim() === lv);
                    }
                    const nv = toNumber(v);
                    return value.some(it => toNumber(it) === nv);
                }
                case 'notIn': {
                    // Operador "não está em lista" - útil para excluir status arquivados
                    if (!Array.isArray(value)) return true;
                    if (typeof v === 'string') {
                        const lv = v.toLowerCase().trim();
                        return !value.some(it => String(it).toLowerCase().trim() === lv);
                    }
                    const nv = toNumber(v);
                    return !value.some(it => toNumber(it) === nv);
                }
                case 'exists': {
                    // Operador "campo existe e não está vazio"
                    if (value === true || value === 'true') {
                        return v !== undefined && v !== null && v !== '';
                    }
                    // Se value for false, retorna true se campo NÃO existir
                    return v === undefined || v === null || v === '';
                }
                case 'between': {
                    // Converte timestamps para Date usando toJsDate
                    const dv = toJsDate(v);
                    const d1 = toJsDate(value);
                    const d2 = toJsDate(value2);
                    if (dv && d1 && d2) {
                        const dvT = dv.getTime();
                        const d1T = d1.getTime();
                        const d2T = d2.getTime();
                        const [min, max] = d1T <= d2T ? [d1T, d2T] : [d2T, d1T];
                        return dvT >= min && dvT <= max;
                    }
                    const nv = toNumber(v);
                    const n1 = toNumber(value);
                    const n2 = toNumber(value2);
                    const [min, max] = n1 <= n2 ? [n1, n2] : [n2, n1];
                    return !isNaN(nv) && !isNaN(min) && !isNaN(max) && nv >= min && nv <= max;
                }
                case 'lastNDays': {
                    // Converte timestamp para Date usando toJsDate
                    const dv = toJsDate(v);
                    if (!dv) return false;
                    const n = parseInt(value, 10);
                    if (!n || n <= 0) return false;
                    const now = new Date();
                    const cutoff = new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
                    return dv >= cutoff;
                }
                default: return true;
            }
        };
    }

    slugify(str) {
        return String(str || '')
            .toLowerCase()
            .normalize('NFD').replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '')
            .slice(0, 40);
    }

    /** UI helpers para o modal de KPIs **/
    populateKpiFieldSelects() {
        const fieldSelect = document.getElementById('kpi-field-select');
        const filterFieldSelect = document.getElementById('kpi-filter-field-select');
        if (!fieldSelect || !filterFieldSelect) return;

        // Mapa completo de rótulos amigáveis baseado em FIELDS_TO_TRACK, EXPORTABLE_FIELDS e TABLE_COLUMNS
        const labelMap = {
            // === DADOS PRINCIPAIS ===
            status: 'Status',
            entrada: 'Data de Entrada',
            analista: 'Analista',
            vendedorConstrutora: 'Vendedor/Construtora',
            empreendimento: 'Empreendimento',
            apto: 'Apto',
            bloco: 'Bloco',
            clientePrincipal: 'Cliente Principal',
            
            // === CONTRATO E AGÊNCIA ===
            nContratoCEF: 'Nº Contrato CEF',
            agencia: 'Agência',
            gerente: 'Gerente',
            corretor: 'Corretor',
            
            // === CARTÓRIO E REGISTRO ===
            cartorio: 'Cartório',
            matriculaImovel: 'Matrícula Imóvel',
            municipioImovel: 'Município Imóvel',
            iptu: 'IPTU',
            protocoloRi: 'Protocolo RI',
            formaPagamentoRi: 'Forma Pgto RI',
            
            // === VALORES (NUMÉRICOS) ===
            valorContrato: 'Valor do Contrato',
            valorITBI: 'Valor ITBI',
            valorFinalRi: 'Valor Final RI',
            valorFunrejus: 'Valor Funrejus',
            valorDespachante: 'Valor Despachante',
            valorDepositoRi: 'Valor Depósito RI',
            financiamento: 'Financiamento',
            saldoReceber: 'Saldo a Receber',
            subsidio: 'Subsídio',
            gastosAdicionais: 'Gastos Adicionais',
            repasses: 'Repasses',
            
            // === DATAS DO CONTRATO ===
            dataMinuta: 'Data da Minuta',
            dataAssinaturaCliente: 'Data Assinatura Cliente',
            dataEntradaRegistro: 'Data Entrada Cartório',
            dataAnaliseRegistro: 'Data Análise Registro',
            dataPrevistaRegistro: 'Data Prevista Registro',
            dataRetornoRi: 'Data Retorno RI',
            dataRetiradaContratoRegistrado: 'Data Contrato Registrado',
            
            // === DATAS ITBI ===
            solicitaITBI: 'Data Solicita ITBI',
            retiradaITBI: 'Data Retirada ITBI',
            enviadoPgtoItbi: 'Enviado Pgto ITBI',
            retornoPgtoItbi: 'Retorno Pgto ITBI',
            
            // === DATAS FUNREJUS ===
            dataSolicitacaoFunrejus: 'Data Solic. Funrejus',
            dataEmissaoFunrejus: 'Data Emissão Funrejus',
            funrejusEnviadoPgto: 'Funrejus Env. Pgto',
            funrejusRetornoPgto: 'Funrejus Ret. Pgto',
            
            // === DATAS CEHOP E FINALIZAÇÃO ===
            entregueCehop: 'Entregue CEHOP',
            conformeEm: 'Conforme Em',
            dataConformidadeCehop: 'Data Conformidade Garantia',
            dataEnvioLiberacaoGarantia: 'Envio Lib. Garantia',
            dataEmissaoNF: 'Data Emissão NF',
            analistaCehop: 'Analista CEHOP',
            enviadoACehop: 'Enviado a CEHOP',
            devolucaoParaCorrecao: 'Devolução p/ Correção',
            devolvidoCorrigido: 'Devolvido Corrigido',
            conferenciaCehopNatoEntregueEm: 'Conf. CEHOP NATO Entregue',
            conferenciaCehopNatoDevolvidaEm: 'Conf. CEHOP NATO Devolvida',
            
            // === CERTIFICAÇÃO ===
            certificadora: 'Certificadora',
            certificacaoSolicEm: 'Certificação Solic.',
            certificacaoRealizadaEm: 'Certificação Realizada',
            
            // === VENDEDOR/AGÊNCIA COMUNICAÇÃO ===
            enviadoVendedor: 'Enviado Vendedor',
            retornoVendedor: 'Retorno Vendedor',
            enviadoAgencia: 'Enviado Agência',
            retornoAgencia: 'Retorno Agência',
            dataDeEnvioDaPastaAgencia: 'Data Envio Pasta Agência',
            
            // === COHAPAR ===
            solicitacaoCohapar: 'Solicitação Cohapar',
            cohaparAprovada: 'Cohapar Aprovada',
            cartaCohapar: 'Carta Cohapar',
            
            // === FORMULÁRIOS ===
            vencSicaq: 'Venc. SICAQ',
            agendamentoFormulario: 'Agendamento Formulário',
            formulariosEnviadosEm: 'Formulários Enviados Em',
            formulariosAssinadosEm: 'Formulários Assinados Em',
            
            // === ENTREVISTA E CEF ===
            entrevistaCef: 'Entrevista CEF',
            contratoCef: 'Contrato CEF',
            preEntrevista: 'Pré Entrevista',
            
            // === OUTROS CAMPOS ===
            produto: 'Produto',
            imobiliaria: 'Imobiliária',
            portaDeEntrada: 'Porta de Entrada',
            renda: 'Renda',
            validacao: 'Validação',
            fgts: 'FGTS',
            casaFacil: 'Casa Fácil',
            montagemComplementar: 'Montagem Complementar',
            montagemCehop: 'Montagem CEHOP',
            anotacoes: 'Anotações',
            pesquisas: 'Pesquisas',
            sehab: 'SEHAB',
            faltaFinalizar: 'Falta Finalizar',
            docAssinarEntregar: 'Doc Assinar/Entregar',
            documentacaoRepasse: 'Documentação e Repasse',
            workflowId: 'Workflow'
        };

        // Sobrescrever com EXPORTABLE_FIELDS se existir
        try {
            (window.EXPORTABLE_FIELDS || []).forEach(f => { labelMap[f.key] = f.label || labelMap[f.key] || f.key; });
        } catch { /* noop */ }

        // === CAMPOS NUMÉRICOS (para soma, média, min, max) ===
        const numericKeys = [
            'valorContrato', 'valorITBI', 'valorFinalRi', 'valorFunrejus', 
            'valorDespachante', 'valorDepositoRi', 'financiamento', 
            'saldoReceber', 'subsidio', 'gastosAdicionais', 'repasses', 'renda'
        ];
        
        // === CAMPOS DE DATA (para contagem, filtros temporais) ===
        const dateKeys = [
            // Datas principais
            'entrada', 'dataMinuta', 'dataAssinaturaCliente', 'dataEntradaRegistro',
            'dataAnaliseRegistro', 'dataPrevistaRegistro', 'dataRetornoRi', 
            'dataRetiradaContratoRegistrado',
            // ITBI
            'solicitaITBI', 'retiradaITBI', 'enviadoPgtoItbi', 'retornoPgtoItbi',
            // Funrejus
            'dataSolicitacaoFunrejus', 'dataEmissaoFunrejus', 'funrejusEnviadoPgto', 'funrejusRetornoPgto',
            // CEHOP e Finalização
            'entregueCehop', 'conformeEm', 'dataConformidadeCehop', 
            'dataEnvioLiberacaoGarantia', 'dataEmissaoNF',
            'enviadoACehop', 'devolucaoParaCorrecao', 'devolvidoCorrigido',
            'conferenciaCehopNatoEntregueEm', 'conferenciaCehopNatoDevolvidaEm',
            // Certificação
            'certificacaoSolicEm', 'certificacaoRealizadaEm',
            // Vendedor/Agência
            'enviadoVendedor', 'retornoVendedor', 'enviadoAgencia', 'retornoAgencia',
            'dataDeEnvioDaPastaAgencia',
            // Cohapar
            'solicitacaoCohapar', 'cohaparAprovada',
            // Formulários
            'vencSicaq', 'agendamentoFormulario', 'formulariosEnviadosEm', 'formulariosAssinadosEm',
            // CEF
            'entrevistaCef', 'contratoCef'
        ];
        
        // === CAMPOS DE TEXTO (para filtros e agrupamentos) ===
        const stringKeys = [
            // Principais
            'status', 'analista', 'vendedorConstrutora', 'empreendimento', 
            'clientePrincipal', 'bloco', 'apto',
            // Contrato e Agência
            'nContratoCEF', 'agencia', 'gerente', 'corretor',
            // Cartório
            'cartorio', 'matriculaImovel', 'municipioImovel', 'iptu', 'protocoloRi',
            // CEHOP
            'analistaCehop', 'certificadora',
            // Cohapar
            'cartaCohapar',
            // Outros
            'produto', 'imobiliaria', 'portaDeEntrada', 'formaPagamentoRi',
            'validacao', 'fgts', 'casaFacil', 'montagemComplementar', 'montagemCehop',
            'sehab', 'faltaFinalizar', 'docAssinarEntregar', 'workflowId'
        ];
        
        // === CAMPOS CALCULADOS (diffDays) - diferença em dias entre datas ===
        const diffDaysFields = [
            // Tempos de processo principais
            { key: 'diffDays(dataRetiradaContratoRegistrado,dataAssinaturaCliente)', label: 'Tempo: Assinatura → Registro' },
            { key: 'diffDays(dataRetiradaContratoRegistrado,dataEntradaRegistro)', label: 'Tempo: Entrada Cartório → Registro' },
            { key: 'diffDays(dataConformidadeCehop,dataEntradaRegistro)', label: 'Tempo: Entrada → Conformidade CEHOP' },
            { key: 'diffDays(dataEnvioLiberacaoGarantia,dataConformidadeCehop)', label: 'Tempo: CEHOP → Lib. Garantia' },
            { key: 'diffDays(dataRetornoRi,dataAnaliseRegistro)', label: 'Tempo: Análise → Retorno RI' },
            // Tempos ITBI
            { key: 'diffDays(retornoPgtoItbi,solicitaITBI)', label: 'Tempo: Solic. ITBI → Retorno Pgto' },
            { key: 'diffDays(retiradaITBI,solicitaITBI)', label: 'Tempo: Solic. → Retirada ITBI' },
            // Tempos Funrejus  
            { key: 'diffDays(funrejusRetornoPgto,dataSolicitacaoFunrejus)', label: 'Tempo: Solic. → Retorno Funrejus' },
            // Tempos Certificação
            { key: 'diffDays(certificacaoRealizadaEm,certificacaoSolicEm)', label: 'Tempo: Solic. → Certificação' },
            // Tempos Vendedor/Agência
            { key: 'diffDays(retornoVendedor,enviadoVendedor)', label: 'Tempo: Env. → Ret. Vendedor' },
            { key: 'diffDays(retornoAgencia,enviadoAgencia)', label: 'Tempo: Env. → Ret. Agência' },
            // Tempos Cohapar
            { key: 'diffDays(cohaparAprovada,solicitacaoCohapar)', label: 'Tempo: Solic. → Aprov. Cohapar' },
            // Tempos Formulários
            { key: 'diffDays(formulariosAssinadosEm,formulariosEnviadosEm)', label: 'Tempo: Env. → Assin. Formulários' }
        ];

        // Montar opções com rótulos
        const makeOption = (key) => `<option value="${key}">${labelMap[key] || key}</option>`;
        const makeDiffOption = (item) => `<option value="${item.key}">${item.label}</option>`;

        // Campo (fonte dos dados) -> numéricos, datas e calculados (úteis para sum/avg/min/max)
        const fieldOptions = [
            '<option value="">(não se aplica)</option>',
            '<optgroup label=" Campos Numéricos (Valores)">',
            ...numericKeys.map(makeOption),
            '</optgroup>',
            '<optgroup label=" Campos de Data">',
            ...dateKeys.map(makeOption),
            '</optgroup>',
            '<optgroup label="⏱ Tempo (dias entre datas)">',
            ...diffDaysFields.map(makeDiffOption),
            '</optgroup>'
        ].join('');
        fieldSelect.innerHTML = fieldOptions;

        // Filtro (qualquer campo útil para filtragem)
        const filterOptions = [
            '<option value="">(nenhum)</option>',
            '<optgroup label=" Campos de Texto">',
            ...stringKeys.map(makeOption),
            '</optgroup>',
            '<optgroup label=" Campos Numéricos">',
            ...numericKeys.map(makeOption),
            '</optgroup>',
            '<optgroup label=" Campos de Data">',
            ...dateKeys.map(makeOption),
            '</optgroup>'
        ].join('');
        filterFieldSelect.innerHTML = filterOptions;
    }

    async handleAddCustomKPI() {
        const isAdmin = await this.isCurrentUserAdmin();
        const title = document.getElementById('kpi-title-input')?.value?.trim();
        const iconRaw = document.getElementById('kpi-icon-input')?.value?.trim();
        const color = document.getElementById('kpi-color-select')?.value || 'primary';
        const unit = document.getElementById('kpi-unit-input')?.value?.trim();
        const agg = document.getElementById('kpi-agg-select')?.value;
        const field = document.getElementById('kpi-field-select')?.value;
        const filterField = document.getElementById('kpi-filter-field-select')?.value;
        const op = document.getElementById('kpi-filter-operator-select')?.value;
        const filterValue = document.getElementById('kpi-filter-value-input')?.value;
        const filterValue2 = document.getElementById('kpi-filter-value-input-2')?.value;
        const filterNDays = document.getElementById('kpi-filter-ndays-input')?.value;
        const formatType = document.getElementById('kpi-format-select')?.value || 'raw';
        const decimals = parseInt(document.getElementById('kpi-format-decimals')?.value || '0', 10);

        // Validação: count, distinct e ratio não precisam de campo
        const needsField = !['count', 'distinct', 'ratio'].includes(agg);
        if (!title || !agg || (needsField && !field)) {
            this.showNotification('Preencha Título e selecione a Agregação e Campo (quando aplicável).', 'error');
            return;
        }

        let list = await this.getCustomKPIList();
        
        // Verificar se estamos em modo edição
        const isEditing = this._editingKPIId != null;
        let id = isEditing ? this._editingKPIId : null;
        
        if (!isEditing) {
            // Criar novo: gera ID único
            let idBase = this.slugify(title) || `kpi-${Date.now()}`;
            id = idBase;
            let i = 2;
            while (list.find(k => k.id === id)) {
                id = `${idBase}-${i++}`;
            }
        }
        
        // Montar filtro conforme operador
        let filter = null;
        if (filterField) {
            if (op === 'between') {
                filter = { field: filterField, op, value: [filterValue, filterValue2] };
            } else if (op === 'in') {
                const arr = (filterValue || '').split(',').map(s => s.trim()).filter(Boolean);
                filter = { field: filterField, op, value: arr };
            } else if (op === 'lastNDays') {
                const n = parseInt(filterNDays || '0', 10);
                filter = { field: filterField, op, value: n };
            } else {
                filter = { field: filterField, op, value: filterValue };
            }
        }

        const def = this.normalizeKPIDefinition({
            id,
            title,
            icon: iconRaw || '',
            color,
            unit: unit || '',
            type: id,
            agg,
            ...(!needsField ? {} : field ? { field } : {}),
            filter,
            formatType,
            decimals: isNaN(decimals) ? 0 : Math.max(0, Math.min(decimals, 6))
        }, 'local');

        if (!def) {
            this.showNotification('Nao foi possivel montar a definicao do KPI.', 'error');
            return;
        }

        if (isEditing) {
            // Atualizar KPI existente
            const idx = list.findIndex(k => k.id === id);
            if (idx !== -1) {
                list[idx] = def;
            } else {
                list.push(def);
            }
            this.cancelEditKPI();
        } else {
            // Adicionar novo KPI
            list.push(def);
        }
        
        await this.saveCustomKPIList(list);
        
        // Limpa cache para recarregar
        this.clearContractsCache();
        // Recarrega KPIs na tela
        await this.loadKPIs();
        await this.renderCustomKpisList();
        
        // Limpa formulário
        this.clearKPIForm();

        if (isEditing) {
            this.showNotification('KPI atualizado com sucesso.', 'success');
            return;
        }

        if (isAdmin) {
            this.showNotification('KPI adicionado e salvo globalmente.', 'success');
        } else {
            this.showNotification('KPI adicionado para o seu usuário (salvo localmente).', 'success');
        }
    }
    
    /**
     * Inicia modo de edição de um KPI existente
     */
    async startEditKPI(id) {
        const list = await this.getCustomKPIList();
        const kpi = list.find(k => k.id === id);
        if (!kpi) {
            this.showNotification('KPI não encontrado.', 'error');
            return;
        }

        const isAdmin = await this.isCurrentUserAdmin();
        if (kpi._source === 'global' && !isAdmin) {
            this.showNotification('Somente administradores podem editar KPIs globais.', 'warning');
            return;
        }
        
        // Armazena ID em edição
        this._editingKPIId = id;
        
        // Preenche o formulário com os dados do KPI
        this.fillKPIForm(kpi);
        
        // Expande accordion de criação e colapsa lista
        const collapseNew = document.getElementById('collapseNewKpi');
        const collapseList = document.getElementById('collapseKpiList');
        if (collapseNew) {
            const bsCollapseNew = new bootstrap.Collapse(collapseNew, { toggle: false });
            bsCollapseNew.show();
        }
        if (collapseList) {
            const bsCollapseList = new bootstrap.Collapse(collapseList, { toggle: false });
            bsCollapseList.hide();
        }
        
        // Altera o botão "Adicionar" para "Salvar"
        const addBtn = document.getElementById('kpi-add-btn');
        if (addBtn) {
            addBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar KPI';
            addBtn.classList.remove('btn-primary');
            addBtn.classList.add('btn-success');
        }
        
        // Adiciona botão de cancelar se não existir
        let cancelBtn = document.getElementById('kpi-cancel-edit-btn');
        if (!cancelBtn) {
            cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.id = 'kpi-cancel-edit-btn';
            cancelBtn.className = 'btn btn-outline-secondary btn-sm';
            cancelBtn.innerHTML = '<i class="bi bi-x-lg me-1"></i>Cancelar';
            cancelBtn.onclick = () => this.cancelEditKPI();
            addBtn?.parentElement?.insertBefore(cancelBtn, addBtn);
        }
        cancelBtn.style.display = '';
        
        // Muda título do accordion
        const accordionBtn = document.querySelector('#collapseNewKpi')?.closest('.accordion-item')?.querySelector('.accordion-button');
        if (accordionBtn) {
            accordionBtn.innerHTML = '<i class="bi bi-pencil me-2"></i>Editar KPI: ' + this.escapeHtml(kpi.title);
        }
    }
    
    /**
     * Preenche o formulário com os dados de um KPI
     */
    fillKPIForm(kpi) {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val ?? '';
        };
        
        setVal('kpi-title-input', kpi.title);
        setVal('kpi-icon-input', kpi.icon);
        setVal('kpi-color-select', kpi.color);
        setVal('kpi-unit-input', kpi.unit);
        setVal('kpi-agg-select', kpi.agg);
        setVal('kpi-field-select', kpi.field);
        setVal('kpi-format-select', kpi.formatType);
        setVal('kpi-format-decimals', kpi.decimals);
        
        // Filtro
        if (kpi.filter) {
            setVal('kpi-filter-field-select', kpi.filter.field);
            setVal('kpi-filter-operator-select', kpi.filter.op);
            
            if (kpi.filter.op === 'between' && Array.isArray(kpi.filter.value)) {
                setVal('kpi-filter-value-input', kpi.filter.value[0]);
                setVal('kpi-filter-value-input-2', kpi.filter.value[1]);
            } else if (kpi.filter.op === 'in' && Array.isArray(kpi.filter.value)) {
                setVal('kpi-filter-value-input', kpi.filter.value.join(', '));
            } else if (kpi.filter.op === 'lastNDays') {
                setVal('kpi-filter-ndays-input', kpi.filter.value);
            } else {
                setVal('kpi-filter-value-input', kpi.filter.value);
            }
            
            // Ajustar visibilidade dos inputs extras
            this.adjustFilterExtraInputs();
        } else {
            setVal('kpi-filter-field-select', '');
            setVal('kpi-filter-operator-select', '==');
            setVal('kpi-filter-value-input', '');
        }
    }
    
    /**
     * Cancela o modo de edição
     */
    cancelEditKPI() {
        this._editingKPIId = null;
        this.clearKPIForm();
        
        // Restaura botão "Adicionar"
        const addBtn = document.getElementById('kpi-add-btn');
        if (addBtn) {
            addBtn.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Adicionar KPI';
            addBtn.classList.remove('btn-success');
            addBtn.classList.add('btn-primary');
        }
        
        // Esconde botão cancelar
        const cancelBtn = document.getElementById('kpi-cancel-edit-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';
        
        // Restaura título do accordion
        const accordionBtn = document.querySelector('#collapseNewKpi')?.closest('.accordion-item')?.querySelector('.accordion-button');
        if (accordionBtn) {
            accordionBtn.innerHTML = '<i class="bi bi-plus-circle me-2"></i>Criar Novo KPI';
        }
    }
    
    /**
     * Limpa o formulário de KPI
     */
    clearKPIForm() {
        const fields = [
            'kpi-title-input', 'kpi-icon-input', 'kpi-unit-input',
            'kpi-filter-value-input', 'kpi-filter-value-input-2', 'kpi-filter-ndays-input'
        ];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        // Reset selects para valores padrão
        const setSelect = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        setSelect('kpi-color-select', 'primary');
        setSelect('kpi-agg-select', 'count');
        setSelect('kpi-field-select', '');
        setSelect('kpi-filter-field-select', '');
        setSelect('kpi-filter-operator-select', '==');
        setSelect('kpi-format-select', 'raw');
        
        const decimalsEl = document.getElementById('kpi-format-decimals');
        if (decimalsEl) decimalsEl.value = '0';
        
        // Esconde preview
        const preview = document.getElementById('kpi-preview-container');
        if (preview) preview.style.display = 'none';
    }

    /**
     * Ajusta exibição de inputs extras para operadores especiais
     */
    adjustFilterExtraInputs() {
        const op = document.getElementById('kpi-filter-operator-select')?.value;
        const input2 = document.getElementById('kpi-filter-value-input-2');
        const inDays = document.getElementById('kpi-filter-ndays-input');
        if (!op || !input2 || !inDays) return;
        // esconder todos por padrão
        input2.style.display = 'none';
        inDays.style.display = 'none';
        if (op === 'between') {
            input2.style.display = '';
        } else if (op === 'lastNDays') {
            inDays.style.display = '';
        }
    }

    /**
     * Constrói filtro a partir dos inputs atuais do modal
     */
    buildFilterFromInputs() {
        const filterField = document.getElementById('kpi-filter-field-select')?.value;
        const op = document.getElementById('kpi-filter-operator-select')?.value;
        const v1 = document.getElementById('kpi-filter-value-input')?.value;
        const v2 = document.getElementById('kpi-filter-value-input-2')?.value;
        const n = document.getElementById('kpi-filter-ndays-input')?.value;
        if (!filterField) return null;
        if (op === 'between') return { field: filterField, op, value: [v1, v2] };
        if (op === 'in') return { field: filterField, op, value: (v1 || '').split(',').map(s=>s.trim()).filter(Boolean) };
        if (op === 'lastNDays') return { field: filterField, op, value: parseInt(n || '0', 10) };
        return { field: filterField, op, value: v1 };
    }

    /**
     * Calcula valor e contagem para uma definição de KPI
     * @param {Object} def - Definição do KPI
     * @param {Array} [cachedContracts] - Contratos já carregados (opcional, evita múltiplas queries)
     */
    async computeKPIValue(def, cachedContracts = null) {
        // Usa contratos em cache se fornecido, senão busca
        if (!this._contractsCache && !cachedContracts) {
            this._contractsCache = await this.dashboardService.getAllContracts();
        }
        const all = cachedContracts || this._contractsCache || [];
        const filtered = this.dashboardService?.applyFilters ? this.dashboardService.applyFilters(all, this.filters || {}) : all;
        const predicate = this.buildPredicate(def.filter);
        const rows = predicate ? filtered.filter(predicate) : filtered;
        
        //  DEBUG: Log detalhado da filtragem
        if (window.__DEBUG__ || (def.agg === 'sum' && def.field === 'financiamento')) {
            console.log(`[computeKPIValue] "${def.title}":`, {
                total: all.length,
                afterFilters: filtered.length,
                afterPredicate: rows.length,
                agg: def.agg,
                field: def.field,
                filter: def.filter
            });
            
            // Para KPI de soma, mostrar amostra dos valores
            if (def.agg === 'sum' && rows.length > 0) {
                const sampleValues = rows.slice(0, 3).map(r => ({
                    id: r.id,
                    [def.field]: this.getFieldValue(r, def.field)
                }));
                console.log(`  Amostra de valores do campo "${def.field}":`, sampleValues);
            }
        }
        
        if (def.agg === 'count') return { value: rows.length, count: rows.length };
        const values = rows.map(r => this.getFieldValue(r, def.field));
        const numeric = values
            .map(v => this.parseNumericValue(v))
            .filter(v => Number.isFinite(v));
        let value = 0;
        switch (def.agg) {
            case 'sum': value = numeric.reduce((a, b) => a + b, 0); break;
            case 'avg': value = numeric.length ? (numeric.reduce((a, b) => a + b, 0) / numeric.length) : 0; break;
            case 'min': value = numeric.length ? Math.min(...numeric) : 0; break;
            case 'max': value = numeric.length ? Math.max(...numeric) : 0; break;
            case 'distinct': value = new Set(values.filter(v => v !== undefined && v !== null)).size; break;
            case 'ratio': {
                // ratio: calcula percentual (rows com filtro / total)
                const total = filtered.length;
                value = total > 0 ? (rows.length / total) * 100 : 0;
                break;
            }
            default: value = '--';
        }
        return { value, count: rows.length };
    }
    
    /**
     * Limpa cache de contratos (chamar quando dados mudam)
     */
    clearContractsCache() {
        this._contractsCache = null;
        this._contractsCacheTimestamp = null;
    }

    /**
     * Força atualização de contratos para uso no dashboard
     */
    async forceRefreshContractsData() {
        this.clearContractsCache();
        this._preloadedContracts = null;

        if (this.dashboardService) {
            this.dashboardService.clearCache();
        }

        if (window.cacheService?.invalidateByPattern) {
            await window.cacheService.invalidateByPattern(/^dashboard/);
            await window.cacheService.invalidateByPattern(/^kpi/);
        }

        let dashboardContracts = [];
        if (Array.isArray(window.appState?.allContracts) && window.appState.allContracts.length > 0) {
            dashboardContracts = window.appState.allContracts;
        } else if (Array.isArray(window.appState?.filteredContracts) && window.appState.filteredContracts.length > 0) {
            dashboardContracts = window.appState.filteredContracts;
        } else if (this.dashboardService && typeof this.dashboardService.getAllContracts === 'function') {
            dashboardContracts = await this.dashboardService.getAllContracts();
        }

        this._contractsCache = Array.isArray(dashboardContracts) ? dashboardContracts : [];
        this._contractsCacheTimestamp = Date.now();

        return this._contractsCache.length;
    }

    /**
     * Pré-visualiza o KPI com os campos atuais do formulário
     */
    async previewCustomKPI() {
        if (!this.dashboardService) {
            this.showNotification('Serviço de dashboard não disponível.', 'error');
            return;
        }
        const container = document.getElementById('kpi-preview-container');
        const iconEl = document.getElementById('kpi-preview-icon');
        const titleEl = document.getElementById('kpi-preview-title');
        const valEl = document.getElementById('kpi-preview-value');
        
        // Mostra container de preview
        if (container) container.style.display = '';
        if (titleEl) titleEl.textContent = document.getElementById('kpi-title-input')?.value || '--';
        if (iconEl) iconEl.textContent = document.getElementById('kpi-icon-input')?.value || '';
        if (valEl) valEl.textContent = 'Calculando...';

        try {
            const agg = document.getElementById('kpi-agg-select')?.value;
            const field = document.getElementById('kpi-field-select')?.value;
            const formatType = document.getElementById('kpi-format-select')?.value || 'raw';
            const decimals = parseInt(document.getElementById('kpi-format-decimals')?.value || '0', 10);
            if (!agg || (agg !== 'count' && !field)) {
                if (valEl) valEl.textContent = 'Preencha agregação/campo';
                return;
            }
            const def = {
                agg,
                field,
                filter: this.buildFilterFromInputs(),
                formatType,
                decimals: isNaN(decimals) ? 0 : Math.max(0, Math.min(decimals, 6))
            };
            const { value } = await this.computeKPIValue(def);
            const text = window.KPIManager && window.KPIManager._formatValue
                ? window.KPIManager._formatValue(value, def.formatType, def.decimals)
                : String(value);
            if (valEl) valEl.textContent = text;
        } catch (e) {
            console.warn('Falha no preview do KPI:', e);
            if (valEl) valEl.textContent = 'Erro ao calcular';
        }
    }

    /**
     * Aplica um template rápido ao formulário de novo KPI
     */
    applyKpiTemplate(templateId) {
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        switch (templateId) {
            case 'assinados-mes':
                setVal('kpi-title-input', 'Contratos Assinados no Mês');
                setVal('kpi-icon-input', 'bi-pen');
                setVal('kpi-color-select', 'success');
                setVal('kpi-unit-input', '');
                setVal('kpi-agg-select', 'count');
                setVal('kpi-field-select', '');
                setVal('kpi-filter-field-select', 'dataAssinaturaCliente');
                setVal('kpi-filter-operator-select', 'includes');
                setVal('kpi-filter-value-input', '__CURRENT_MONTH__');
                setVal('kpi-format-select', 'number');
                setVal('kpi-format-decimals', '0');
                break;
            case 'total-contratos':
                setVal('kpi-title-input', 'Processos em Andamento');
                setVal('kpi-icon-input', 'bi-collection');
                setVal('kpi-color-select', 'primary');
                setVal('kpi-unit-input', '');
                setVal('kpi-agg-select', 'count');
                setVal('kpi-field-select', '');
                setVal('kpi-filter-field-select', '');
                setVal('kpi-filter-operator-select', '==');
                setVal('kpi-filter-value-input', '');
                setVal('kpi-format-select', 'number');
                setVal('kpi-format-decimals', '0');
                break;
            case 'tempo-medio-analise-cehop':
                setVal('kpi-title-input', 'Tempo Médio Análise CEHOP');
                setVal('kpi-icon-input', 'bi-clock');
                setVal('kpi-color-select', 'secondary');
                setVal('kpi-unit-input', 'dias');
                setVal('kpi-agg-select', 'avg');
                setVal('kpi-field-select', 'diffDays(dataConformidadeCehop,dataEntradaRegistro)');
                setVal('kpi-filter-field-select', '');
                setVal('kpi-filter-operator-select', '==');
                setVal('kpi-filter-value-input', '');
                setVal('kpi-format-select', 'days');
                setVal('kpi-format-decimals', '0');
                break;
            case 'tempo-medio-liberacao-garantia':
                setVal('kpi-title-input', 'Tempo Médio Liberação Garantia');
                setVal('kpi-icon-input', 'bi-shield-check');
                setVal('kpi-color-select', 'success');
                setVal('kpi-unit-input', 'dias');
                setVal('kpi-agg-select', 'avg');
                setVal('kpi-field-select', 'diffDays(dataEnvioLiberacaoGarantia,dataConformidadeCehop)');
                setVal('kpi-filter-field-select', '');
                setVal('kpi-filter-operator-select', '==');
                setVal('kpi-filter-value-input', '');
                setVal('kpi-format-select', 'days');
                setVal('kpi-format-decimals', '0');
                break;
            case 'entradas-mes':
                setVal('kpi-title-input', 'Entradas (mês atual)');
                setVal('kpi-icon-input', '');
                setVal('kpi-unit-input', '');
                setVal('kpi-agg-select', 'count');
                setVal('kpi-field-select', '');
                setVal('kpi-filter-field-select', 'dataAssinaturaCliente');
                setVal('kpi-filter-operator-select', 'includes');
                setVal('kpi-filter-value-input', '__CURRENT_MONTH__');
                setVal('kpi-format-select', 'number');
                setVal('kpi-format-decimals', '0');
                break;
            case 'entradas-ano':
                setVal('kpi-title-input', 'Entradas (ano atual)');
                setVal('kpi-icon-input', '');
                setVal('kpi-unit-input', '');
                setVal('kpi-agg-select', 'count');
                setVal('kpi-field-select', '');
                setVal('kpi-filter-field-select', 'dataAssinaturaCliente');
                setVal('kpi-filter-operator-select', 'includes');
                setVal('kpi-filter-value-input', '__CURRENT_YEAR__');
                setVal('kpi-format-select', 'number');
                setVal('kpi-format-decimals', '0');
                break;
            case 'status-pendente':
                setVal('kpi-title-input', 'Processos Pendentes');
                setVal('kpi-icon-input', '');
                setVal('kpi-unit-input', '');
                setVal('kpi-agg-select', 'count');
                setVal('kpi-field-select', '');
                setVal('kpi-filter-field-select', 'status');
                setVal('kpi-filter-operator-select', '==');
                setVal('kpi-filter-value-input', 'Pendente');
                setVal('kpi-format-select', 'number');
                setVal('kpi-format-decimals', '0');
                break;
            case 'status-em-analise':
                setVal('kpi-title-input', 'Processos em Análise');
                setVal('kpi-icon-input', '');
                setVal('kpi-unit-input', '');
                setVal('kpi-agg-select', 'count');
                setVal('kpi-field-select', '');
                setVal('kpi-filter-field-select', 'status');
                setVal('kpi-filter-operator-select', '==');
                setVal('kpi-filter-value-input', 'Em Análise');
                setVal('kpi-format-select', 'number');
                setVal('kpi-format-decimals', '0');
                break;
            case 'status-aprovado':
                setVal('kpi-title-input', 'Finalizados');
                setVal('kpi-icon-input', 'bi-check-circle');
                setVal('kpi-color-select', 'success');
                setVal('kpi-unit-input', '');
                setVal('kpi-agg-select', 'count');
                setVal('kpi-field-select', '');
                setVal('kpi-filter-field-select', 'status');
                setVal('kpi-filter-operator-select', '==');
                setVal('kpi-filter-value-input', 'Finalizado');
                setVal('kpi-format-select', 'number');
                setVal('kpi-format-decimals', '0');
                break;
            case 'ultimos-30-dias':
                setVal('kpi-title-input', 'Últimos 30 Dias');
                setVal('kpi-icon-input', 'bi-calendar-range');
                setVal('kpi-color-select', 'info');
                setVal('kpi-unit-input', '');
                setVal('kpi-agg-select', 'count');
                setVal('kpi-field-select', '');
                setVal('kpi-filter-field-select', 'dataAssinaturaCliente');
                setVal('kpi-filter-operator-select', '>=');
                setVal('kpi-filter-value-input', '__LAST_30_DAYS__');
                setVal('kpi-format-select', 'number');
                setVal('kpi-format-decimals', '0');
                break;
            case 'taxa-aprovacao':
                setVal('kpi-title-input', 'Taxa de Aprovação');
                setVal('kpi-icon-input', 'bi-percent');
                setVal('kpi-color-select', 'success');
                setVal('kpi-unit-input', '%');
                setVal('kpi-agg-select', 'ratio');
                setVal('kpi-field-select', '');
                setVal('kpi-filter-field-select', 'status');
                setVal('kpi-filter-operator-select', '==');
                setVal('kpi-filter-value-input', 'Finalizado');
                setVal('kpi-format-select', 'percent');
                setVal('kpi-format-decimals', '1');
                break;
            default:
                return;
        }
        this.adjustFilterExtraInputs();
        this.showNotification('Template aplicado. Revise e clique em "Adicionar KPI".', 'info');
    }

    async renderCustomKpisList() {
        const listEl = document.getElementById('custom-kpis-list');
        const emptyEl = document.getElementById('custom-kpis-empty');
        const countBadge = document.getElementById('kpi-count-badge');
        if (!listEl) return;

        const [list, isAdmin] = await Promise.all([
            this.getCustomKPIList(),
            this.isCurrentUserAdmin()
        ]);

        listEl.innerHTML = '';
        
        // Atualiza badge de contagem
        if (countBadge) countBadge.textContent = String(list.length);
        
        if (!list.length) {
            emptyEl && (emptyEl.style.display = '');
            return;
        }
        emptyEl && (emptyEl.style.display = 'none');

        const cfg = this.currentKPIConfig || this.loadSavedKPIConfig();
        
        // Mapeamento de agregações para texto legível
        const aggLabels = {
            count: 'Contagem',
            sum: 'Soma',
            avg: 'Média',
            min: 'Mínimo',
            max: 'Máximo',
            distinct: 'Distintos',
            ratio: 'Taxa (%)'
        };

        const summarizeFilter = (filter) => {
            if (!filter) return '';
            if (Array.isArray(filter)) {
                return filter
                    .map(f => `${f.field} ${f.op} ${Array.isArray(f.value) ? f.value.join(',') : f.value}`)
                    .join(' + ');
            }
            return `${filter.field} ${filter.op} ${Array.isArray(filter.value) ? filter.value.join(',') : filter.value}`;
        };

        const allowedColors = new Set(['primary', 'success', 'warning', 'danger', 'info', 'secondary']);

        list.forEach(k => {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex align-items-center justify-content-between py-2';

            const visibilityKey = this.getKPIVisibilityKey(k);
            const visible = cfg?.[visibilityKey] !== false;
            const source = k._source === 'global' ? 'global' : 'local';
            const sourceLabel = source === 'global' ? 'global' : 'local';
            const sourceBadgeClass = source === 'global'
                ? 'bg-primary-subtle text-primary-emphasis border border-primary-subtle'
                : 'bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle';
            const isGlobalLocked = source === 'global' && !isAdmin;
            const safeColor = allowedColors.has(k.color) ? k.color : 'primary';
            const filterInfo = summarizeFilter(k.filter);
            const aggText = aggLabels[k.agg] || k.agg;
            const safeTitle = this.escapeHtml(k.title);
            const safeField = k.field ? this.escapeHtml(String(k.field).slice(0, 24)) : '';
            const safeFilter = filterInfo ? this.escapeHtml(String(filterInfo).slice(0, 34)) : '';
            
            // Renderiza ícone (Bootstrap Icon ou texto)
            let iconHtml = '';
            if (k.icon) {
                if (/^bi-[a-z0-9-]+$/i.test(k.icon)) {
                    iconHtml = `<i class="bi ${k.icon} text-${safeColor}"></i>`;
                } else {
                    iconHtml = this.escapeHtml(k.icon);
                }
            } else {
                iconHtml = '';
            }

            const lockTitle = isGlobalLocked
                ? 'Somente administradores podem alterar KPIs globais'
                : '';
            
            item.innerHTML = `
                <div class="d-flex align-items-center gap-2">
                    <span class="fs-5 d-flex align-items-center justify-content-center" style="width:28px;">${iconHtml}</span>
                    <div>
                        <div class="d-flex align-items-center gap-1">
                            <strong>${safeTitle}</strong>
                            <span class="badge bg-${safeColor} badge-sm" style="font-size:0.65rem;">${safeColor}</span>
                            <span class="badge badge-sm ${sourceBadgeClass}" style="font-size:0.65rem;">${sourceLabel}</span>
                        </div>
                        <small class="text-muted">${this.escapeHtml(aggText)}${safeField ? ` de ${safeField}` : ''}${safeFilter ? ` • ${safeFilter}` : ''}</small>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <div class="form-check form-switch mb-0" title="Visível no dashboard">
                        <input class="form-check-input kpi-toggle" type="checkbox" data-id="${k.id}" data-key="${visibilityKey}" ${visible ? 'checked' : ''}>
                    </div>
                    <button class="btn btn-sm btn-outline-secondary kpi-edit" data-id="${k.id}" data-source="${source}" ${isGlobalLocked ? 'disabled' : ''} title="${isGlobalLocked ? lockTitle : 'Editar KPI'}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger kpi-remove" data-id="${k.id}" data-source="${source}" ${isGlobalLocked ? 'disabled' : ''} title="${isGlobalLocked ? lockTitle : 'Remover KPI'}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>`;
            listEl.appendChild(item);
        });

        // Bind toggles
        listEl.querySelectorAll('.kpi-toggle').forEach(el => {
            el.addEventListener('change', async (e) => {
                const typeKey = e.target.getAttribute('data-key') || e.target.getAttribute('data-id');
                const cfg = this.currentKPIConfig || this.loadSavedKPIConfig();
                cfg[typeKey] = e.target.checked;
                this.saveKPIConfig(cfg);
                this.currentKPIConfig = cfg;
                this.applyKPIVisibility(cfg);
                await this.persistKPIConfigIfAdmin(cfg);
            });
        });

        // Bind edit
        listEl.querySelectorAll('.kpi-edit').forEach(el => {
            el.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const source = e.currentTarget.getAttribute('data-source');
                if (source === 'global' && !isAdmin) {
                    this.showNotification('Somente administradores podem editar KPIs globais.', 'warning');
                    return;
                }
                await this.startEditKPI(id);
            });
        });

        // Bind remove
        listEl.querySelectorAll('.kpi-remove').forEach(el => {
            el.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const source = e.currentTarget.getAttribute('data-source');
                if (source === 'global' && !isAdmin) {
                    this.showNotification('Somente administradores podem remover KPIs globais.', 'warning');
                    return;
                }
                if (!confirm('Remover este KPI personalizado?')) return;
                let list = await this.getCustomKPIList();
                // Remove por id, mas se houver duplicados, remove todos com mesmo id
                list = list.filter(k => k.id !== id);
                await this.saveCustomKPIList(list);
                if (window.KPIManager) window.KPIManager.unregister(id);
                // Limpa cache e recarrega KPIs
                this.clearContractsCache();
                await this.loadKPIs();
                await this.renderCustomKpisList();
                this.showNotification('KPI removido.', 'info');
            });
        });
    }

    async getCustomKPIList() {
        const isAdmin = await this.isCurrentUserAdmin();
        const localList = this.loadLocalCustomKPIList();

        let globalList = [];
        try {
            if (window.firestoreService?.getDashboardSettings) {
                const settings = await window.firestoreService.getDashboardSettings();
                globalList = this.normalizeKPIList(settings?.customKPIs || [], 'global');
            }
        } catch { /* noop */ }

        let resultList = [];
        if (isAdmin) {
            resultList = globalList.length ? globalList : localList;
        } else if (!globalList.length) {
            resultList = localList;
        } else if (!localList.length) {
            resultList = globalList;
        } else {
            // Merge para nao-admin: global + local (local pode sobrescrever mesmo id).
            const merged = new Map();
            globalList.forEach(k => merged.set(k.id, k));
            localList.forEach(k => merged.set(k.id, { ...k, _source: 'local' }));
            resultList = Array.from(merged.values());
        }

        const sanitized = this.sanitizeKPIList(resultList);
        if (!sanitized.removed) {
            return sanitized.list;
        }

        // Persistência automática da remoção deste KPI legado.
        if (isAdmin && globalList.length && window.firestoreService?.saveDashboardSettings) {
            try {
                const cleanedGlobal = sanitized.list
                    .filter(k => k._source !== 'local')
                    .map((item) => this.stripKPIInternalFields(item));
                await window.firestoreService.saveDashboardSettings({ customKPIs: cleanedGlobal });
            } catch (e) {
                console.warn('Falha ao remover KPI legado globalmente:', e);
            }
        } else {
            const cleanedLocal = sanitized.list
                .filter(k => k._source !== 'global')
                .map((item) => this.stripKPIInternalFields(item));
            this.saveLocalCustomKPIList(cleanedLocal);
        }

        return sanitized.list;
    }

    async saveCustomKPIList(list) {
        const normalized = this.normalizeKPIList(list);
        const cleaned = normalized.map((item) => this.stripKPIInternalFields(item));
        const isAdmin = await this.isCurrentUserAdmin();

        if (isAdmin) {
            // Mantem backup local para fallback offline.
            this.saveLocalCustomKPIList(cleaned);
            try {
                if (window.firestoreService?.saveDashboardSettings) {
                    await window.firestoreService.saveDashboardSettings({ customKPIs: cleaned });
                }
            } catch (e) {
                console.warn('Falha ao salvar KPIs customizados globalmente:', e);
            }
            return;
        }

        // Nao-admin persiste somente KPIs locais.
        const localOnly = normalized
            .filter(k => k._source !== 'global')
            .map((item) => this.stripKPIInternalFields(item));
        this.saveLocalCustomKPIList(localOnly);
    }

    /**
     * Aplica filtros aprimorados - integra com o sistema existente
     */
    // Métodos de filtros adicionais removidos

    /**
     * Limpa filtros aprimorados
     */
    // clearEnhancedFilters removido

    /**
     * Carrega gráficos - integra com o sistema existente
     */
    async loadCharts(options = {}) {
        if (!document.getElementById('statusChartCanvas') || !document.getElementById('custom-legend')) {
            debug('Gráficos do dashboard removidos; atualização ignorada');
            return;
        }

        const allowHeavyFallback = options.allowHeavyFallback !== false;
        // O dashboard já tem seu próprio sistema de gráficos
        // Vamos apenas garantir que os dados sejam atualizados
        debug(' Gráficos mantidos do sistema existente');
        
        // Trigger update no sistema existente se disponível
        //  FIX: Usar window.UI.updateDashboard (não window.updateDashboard)
        const updateDashboardFn = window.UI?.updateDashboard;
        if (window.firestoreService && typeof updateDashboardFn === 'function') {
            try {
                //  OTIMIZAÇÃO: Usa SEMPRE cache (prioridade: global > preloaded > dashboardService)
                //  FIX: getAllContractsFiltered() popula appState.allContracts imediatamente
                let contracts;
                // PRIORIDADE 1: Usar cache global do appState
                if (window.appState?.allContracts?.length > 0) {
                    contracts = [...window.appState.allContracts];
                    if (window.__DEBUG__) {
                        console.log(` [Charts] Usando ${contracts.length} contratos do cache global`);
                    }
                }
                // PRIORIDADE 2: Usar contratos pre-carregados (fallback)
                else if (this._preloadedContracts && this._preloadedContracts.length > 0) {
                    contracts = [...this._preloadedContracts];
                    if (window.__DEBUG__) {
                        console.log(` [Charts] Usando ${contracts.length} contratos pre-carregados`);
                    }
                } else {
                    if (!allowHeavyFallback) {
                        console.log(' [Charts] Aguardando cache completo de contratos antes de atualizar grÃ¡ficos');
                        return;
                    }
                    // PRIORIDADE 3: Fallback - buscar do dashboardService
                    console.warn(' [Charts] Cache global vazio, usando dashboardService...');
                    if (this.dashboardService && typeof this.dashboardService.getAllContracts === 'function') {
                        contracts = await this.dashboardService.getAllContracts();
                    } else {
                        contracts = await window.firestoreService.getAllContracts();
                    }
                }

                // Aplicar filtros se necessário
                const filteredContracts = (this.dashboardService && typeof this.dashboardService.applyFilters === 'function') ? 
                    this.dashboardService.applyFilters(contracts, this.filters) : 
                    contracts;
                
                // Obter estado dos checkboxes selecionados do gráfico
                const legendContainer = document.getElementById('custom-legend');
                const selectedStatuses = new Set();
                if (legendContainer) {
                    legendContainer.querySelectorAll('input:checked').forEach(cb => {
                        selectedStatuses.add(cb.value);
                    });
                }
                
                // Usar a função existente do dashboard via window.UI
                updateDashboardFn(filteredContracts, selectedStatuses);
                console.log(` [Charts] Gráfico atualizado com ${filteredContracts.length} contratos`);
            } catch (error) {
                console.error('Erro ao atualizar gráficos existentes:', error);
            }
        } else {
            console.warn(' [Charts] window.UI.updateDashboard não disponível');
        }
    }

    /**
     * Remove métodos de gráficos não utilizados
     */
    createChart() {
        // Método mantido para compatibilidade mas não usado
        return null;
    }

    /**
     * Aplica filtros (método simplificado - sem filtros externos no momento)
     */
    async applyFilters() {
        this.filters = {};
        if (this.dashboardService) this.dashboardService.clearCache();
        await this.loadKPIs();
        await this.loadCharts();
        this.updateTimestamp();
    }

    /**
     * Limpa filtros (método simplificado)
     */
    async clearFilters() {
        this.filters = {};
        if (this.dashboardService) this.dashboardService.clearCache();
        await this.loadKPIs();
        await this.loadCharts();
        this.updateTimestamp();
    }

    /**
     * Atualiza dashboard
     */
    async refreshDashboard() {
        if (this._isRefreshingDashboard) return;

        const btn = document.getElementById('btn-refresh-dashboard-enhanced');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Atualizando...';
        }

        try {
            this._isRefreshingDashboard = true;

            const refreshedCount = await this.forceRefreshContractsData();
            await this.loadInitialData();
            this.showNotification('Dashboard atualizado com ' + refreshedCount + ' contratos.', 'success');
        } catch (error) {
            console.error('Erro ao atualizar dashboard:', error);
            this.showNotification('Falha ao atualizar o dashboard.', 'error');
        } finally {
            this._isRefreshingDashboard = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Atualizar Dados';
            }
        }
    }

    /**
     * Exporta dados
     */
    async exportData() {
        if (!this.dashboardService) return;

        try {
            const contracts = await this.dashboardService.getAllContracts();
            const filtered = this.dashboardService.applyFilters(contracts, this.filters);
            
            if (filtered.length === 0) {
                alert('Nenhum dado para exportar com os filtros aplicados.');
                return;
            }

            const success = await this.dashboardService.exportToCSV(
                filtered, 
                `dashboard_export_${new Date().toISOString().split('T')[0]}`
            );

            if (success) {
                this.showNotification('Dados exportados com sucesso!', 'success');
            } else {
                this.showNotification('Erro ao exportar dados.', 'error');
            }
        } catch (error) {
            console.error('Erro ao exportar dados:', error);
            this.showNotification('Erro ao exportar dados.', 'error');
        }
    }

    /**
     * Imprime dashboard
     */
    printDashboard() {
        window.print();
    }

    /**
     * Exporta gráfico específico
     */
    exportChart(chartType) {
        const chart = this.charts[chartType];
        if (!chart) return;

        const link = document.createElement('a');
        link.download = `chart_${chartType}_${Date.now()}.png`;
        link.href = chart.toBase64Image();
        link.click();
    }

    /**
     * Destrói gráficos existentes
     */
    destroyCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        this.charts = {};
    }

    /**
     * Configura auto-refresh
     */
    setupAutoRefresh() {
        // Refresh a cada 5 minutos
        this.refreshInterval = setInterval(() => {
            this.refreshDashboard();
        }, 5 * 60 * 1000);
    }

    /**
     * Formata valor como moeda
     */
    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }

    /**
     * Atualiza timestamp
     */
    updateTimestamp() {
        const element = document.getElementById('last-update-enhanced');
        if (element) {
            element.textContent = new Date().toLocaleString('pt-BR');
        }
    }

    /**
     * Carrega config do Firestore (se disponível) e aplica visibilidade
     */
    async loadAndApplyKPIVisibilityConfig() {
        let cfg = null;
        try {
            if (window.firestoreService?.getDashboardSettings) {
                const settings = await window.firestoreService.getDashboardSettings();
                if (settings?.kpiVisibility) {
                    cfg = settings.kpiVisibility;
                }
            }
        } catch (e) {
            console.warn('Não foi possível carregar config do Firestore, usando localStorage:', e);
        }
        if (!cfg) {
            // Migração: antiga chave usada em main.js
            try {
                const legacy = localStorage.getItem('dashboardKpisVisible');
                if (legacy) {
                    const parsed = JSON.parse(legacy);
                    if (parsed && typeof parsed === 'object') {
                        cfg = { ...parsed };
                        // salva na nova chave e remove legado
                        this.saveKPIConfig(cfg);
                        localStorage.removeItem('dashboardKpisVisible');
                    }
                }
            } catch { /* ignore */ }
        }
        if (!cfg) cfg = this.loadSavedKPIConfig();

        // Compatibilidade com chaves legadas de visibilidade.
        const legacyKeyMap = {
            assinado: 'assinadosMes',
            pendente: 'emAndamento',
            total: 'total'
        };
        Object.entries(legacyKeyMap).forEach(([legacyKey, currentKey]) => {
            if (cfg?.[legacyKey] !== undefined && cfg?.[currentKey] === undefined) {
                cfg[currentKey] = cfg[legacyKey];
            }
        });

        this.currentKPIConfig = cfg;
        this.applyKPIVisibility(cfg);
        // Dica: ajustar botão de configuração para não-admin (opcional)
        this.toggleConfigButtonForNonAdmin();
    }

    /**
     * Se usuário não for admin, opcionalmente esconder botão de configurar
     */
    async toggleConfigButtonForNonAdmin() {
        const btn = document.querySelector('[data-bs-target="#dashboardConfigModal"]');
        if (!btn || !window.firestoreService?.isCurrentUserAdmin) return;
        try {
            const isAdmin = await window.firestoreService.isCurrentUserAdmin();
            // Não remove acesso, só deixa visível para admins (autorização real é via regras do Firestore)
            btn.style.display = isAdmin ? '' : 'none';
    } catch { /* ignore */ }
    }

    /**
     * Lê configuração salva de visibilidade dos KPIs principais
     */
    loadSavedKPIConfig() {
        try {
            const raw = localStorage.getItem('dashboardKPIConfig');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return parsed;
            }
        } catch { /* ignore */ }
        // Padrão: sem chaves explicitas (qualquer KPI nao mapeado permanece visivel).
        return {};
    }

    /**
     * Salva configuração de KPIs
     */
    saveKPIConfig(cfg) {
        try {
            localStorage.setItem('dashboardKPIConfig', JSON.stringify(cfg || {}));
        } catch { /* ignore */ }
    }

    /**
     * Aplica visibilidade dos KPIs no grid principal (#dashboard-kpis-row)
     */
    applyKPIVisibility(cfg) {
        try {
            const row = document.getElementById('dashboard-kpis-row');
            if (!row) return;
            row.querySelectorAll('.dashboard-kpi-col').forEach(col => {
                const type = col.getAttribute('data-type') || col.getAttribute('data-kpi-id');
                const visible = cfg?.[type];
                // Se cfg[type] === false, esconder; caso contrário mostrar
                col.style.display = visible === false ? 'none' : '';
            });

            // Também aplicar aos KPIs registrados (se tiverem type)
            if (window.KPIManager && typeof window.KPIManager.applyVisibility === 'function') {
                window.KPIManager.applyVisibility(cfg);
            }
        } catch (e) {
            console.warn('Falha ao aplicar visibilidade de KPIs:', e);
        }
    }

    /**
     * Persiste configurações de KPIs para todos (somente admin)
     */
    async persistKPIConfigIfAdmin(cfg) {
        try {
            if (!window.firestoreService?.isCurrentUserAdmin) return;
            const isAdmin = await window.firestoreService.isCurrentUserAdmin();
            if (!isAdmin) return;
            if (window.firestoreService?.saveDashboardSettings) {
                await window.firestoreService.saveDashboardSettings({ kpiVisibility: cfg });
                this.showNotification('Configurações do dashboard salvas globalmente.', 'success');
            }
        } catch (e) {
            console.warn('Não foi possível persistir configurações globais:', e);
            this.showNotification('Não foi possível salvar globalmente. Verifique permissões.', 'error');
        }
    }

    /**
     * Mostra notificação
     */
    showNotification(message, type = 'info') {
        if (window.showNotification) {
            window.showNotification(message, type);
        } else if (typeof debug === 'function') {
            debug(`[${type}] ${message}`);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }

    /**
     * Cleanup ao destruir
     */
    destroy() {
        this.destroyCharts();
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        this.isInitialized = false;
    }
}

// Expor classe global para inicialização controlada via main.js
window.DashboardUI = DashboardUI;

if (typeof window !== 'undefined' && typeof window.debug === 'function') {
    window.debug(' DashboardUI disponível');
}

// -----------------------------------------------------------------------------
// KPIManager global simples para registrar/remover KPIs no grid principal
// -----------------------------------------------------------------------------
(function initKPIManager() {
    if (window.KPIManager) return; // já definido

    const registry = new Map();

    // Utilitário de formatação interno
    function formatValue(value, formatType = 'raw', decimals = 0) {
        if (value == null || value === '--') return '--';
        switch (formatType) {
            case 'currency':
                try {
                    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0);
                } catch { return String(value); }
            case 'number':
                try { return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0); } catch { return String(value); }
            case 'percent':
                try { return `${(Number(value) || 0).toFixed(decimals)}%`; } catch { return String(value); }
            case 'days':
                try { return `${Math.round(Number(value) || 0)} dias`; } catch { return String(value); }
            case 'raw':
            default:
                return String(value);
        }
    }

    window.KPIManager = {
        /**
         * Registra um KPI no registry (NÃO adiciona ao DOM - isso é feito por loadKPIs())
         * opts: { id, type, title, icon, unit, compute } -> compute(kpis, dashboardService) => valor
         * NOTA: Este método apenas mantém referência para funções auxiliares (setLoading, applyVisibility, etc.)
         */
        register(opts) {
            if (!opts?.id || !opts?.title) throw new Error('KPI inválido: id e title são obrigatórios');

            // Evitar duplicação no registry
            if (registry.has(opts.id)) {
                window.__DEBUG__ && console.warn(`[KPIManager] KPI ${opts.id} já registrado`);
                return;
            }

            // Apenas registra - NÃO cria elemento DOM (loadKPIs faz isso)
            registry.set(opts.id, { ...opts, element: null });
        },
        /** Exibe/oculta estado de carregamento nos KPIs registrados */
        setLoading(isLoading) {
            try {
                registry.forEach((entry) => {
                    const card = entry.element?.querySelector('.card-body');
                    const valueEl = document.getElementById(entry.id);
                    if (card) {
                        card.classList.toggle('placeholder-glow', !!isLoading);
                    }
                    if (valueEl && isLoading) {
                        valueEl.textContent = '--';
                    }
                });
            } catch { /* noop */ }
        },

        /** Remove um KPI do grid e do registro */
        unregister(id) {
            const entry = registry.get(id);
            if (!entry) return;
            if (entry.element && entry.element.parentNode) {
                entry.element.parentNode.removeChild(entry.element);
            }
            registry.delete(id);
        },

        /** Atualiza valores de todos os KPIs registrados (suporta compute assíncrono) */
        async updateAll(kpisFromService, dashboardService) {
            const tasks = [];
            registry.forEach((entry) => {
                const task = (async () => {
                    try {
                        let value = '--';
                        if (typeof entry.compute === 'function') {
                            value = await entry.compute(kpisFromService || {}, dashboardService);
                            if (value == null) value = '--';
                        }
                        const el = document.getElementById(entry.id);
                        if (el) {
                            const formatted = formatValue(value, entry.formatType || 'raw', entry.decimals || 0);
                            el.textContent = formatted;
                        }
                    } catch (e) {
                        console.warn(`Falha ao atualizar KPI ${entry.id}:`, e);
                    }
                })();
                tasks.push(task);
            });
            await Promise.allSettled(tasks);
        },

        /** Aplica visibilidade baseada em cfg { [type]: boolean } */
        applyVisibility(cfg) {
            registry.forEach((entry) => {
                const typeKey = entry.type || entry.id;
                const visible = cfg?.[typeKey];
                if (entry.element) {
                    entry.element.style.display = visible === false ? 'none' : '';
                }
            });
        },

        /** Lista KPIs registrados (inclui title e type) */
        list() {
            return Array.from(registry.values()).map(({ id, title, type }) => ({ id, title, type }));
        },
        // utilitário interno (usado pelo preview no modal)
        _formatValue: formatValue
    };
})();
