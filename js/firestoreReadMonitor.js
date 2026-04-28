/**
 * Firestore Read Monitor - Sistema de Monitoramento de Leituras
 * 
 * Este serviço rastreia todas as operações de leitura do Firestore,
 * permitindo identificar quais funções estão consumindo mais leituras.
 * 
 * Características:
 * -  Funciona automaticamente na inicialização
 * -  Intercepta operações do Firestore SDK 9.x
 * -  Rastreia leituras por coleção e origem
 * -  Integra com firestoreService
 * 
 * USO:
 * - Automático: enable() é chamado ao carregar
 * - Veja o relatório: firestoreMonitor.report()
 * - Veja em tempo real: firestoreMonitor.watch()
 * - Desative: firestoreMonitor.disable()
 */

class FirestoreReadMonitor {
    constructor() {
        this.enabled = false;
        this.reads = [];
        this.summary = {};
        this.startTime = null;
        this.watchInterval = null;
        this.originalMethods = {};
        this.firestoreServicePatched = false;
        this.snapshotListenerStates = new Map();
        
        // Configurações
        this.config = {
            maxLogs: 1000, // Máximo de logs armazenados
            alertThreshold: 100, // Alerta se uma operação ler mais que X docs
            watchIntervalMs: 5000, // Intervalo do watch em ms
            autoEnable: true, // Auto-ativa ao carregar
            patchFirestoreService: false // Evita dupla contagem quando o SDK já está interceptado
        };
    }

    /**
     * Ativa o monitoramento
     */
    enable() {
        if (this.enabled) {
            console.log(' Monitor já está ativo');
            return;
        }

        this.enabled = true;
        this.startTime = new Date();
        this.reads = [];
        this.summary = {};
        
        this._interceptFirestore();
        
        console.log('%c Firestore Read Monitor ATIVADO', 'color: #28a745; font-weight: bold; font-size: 14px');
        console.log('Comandos disponíveis:');
        console.log('  firestoreMonitor.report()  - Ver relatório completo');
        console.log('  firestoreMonitor.watch()   - Monitoramento em tempo real');
        console.log('  firestoreMonitor.top(10)   - Top 10 operações');
        console.log('  firestoreMonitor.disable() - Desativar');
        
        return this;
    }

    /**
     * Desativa o monitoramento
     */
    disable() {
        if (!this.enabled) {
            console.log(' Monitor já está desativado');
            return;
        }

        this.enabled = false;
        this._restoreFirestore();
        this.snapshotListenerStates.clear();
        
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
        }
        
        console.log('%c Firestore Read Monitor DESATIVADO', 'color: #dc3545; font-weight: bold');
        console.log(`Total de leituras rastreadas: ${this.getTotalReads()}`);
        
        return this;
    }

    /**
     * Registra uma leitura
     */
    _logRead(operation, collection, docsCount, source, metadata = {}) {
        if (!this.enabled) return;

        const entry = {
            timestamp: new Date(),
            operation, // 'get', 'getDocs', 'onSnapshot', 'count'
            collection,
            docsCount,
            source, // Nome da função/módulo que chamou
            page: this._identifyPage(),
            stack: this._getCallStack(),
            metadata
        };

        this.reads.push(entry);

        // Limitar tamanho do array
        if (this.reads.length > this.config.maxLogs) {
            this.reads.shift();
        }

        // Atualizar summary
        const key = `${collection}::${source}`;
        if (!this.summary[key]) {
            this.summary[key] = {
                collection,
                source,
                totalReads: 0,
                totalDocs: 0,
                calls: 0,
                lastCall: null
            };
        }
        this.summary[key].totalReads++;
        this.summary[key].totalDocs += docsCount;
        this.summary[key].calls++;
        this.summary[key].lastCall = new Date();

        // Alerta se muitos docs lidos de uma vez
        if (docsCount > this.config.alertThreshold) {
            console.warn(`%c ALERTA: ${docsCount} documentos lidos de uma vez!`,
                'color: #ffc107; font-weight: bold',
                `\n  Coleção: ${collection}`,
                `\n  Operação: ${operation}`,
                `\n  Fonte: ${source}`
            );
        }

        // Log em tempo real se debug ativo
        if (window.__DEBUG_READS__) {
            console.log(` [${operation}] ${collection}: ${docsCount} docs | ${source}`);
        }

        // Integração com serviço de métricas persistente
        if (window.readMetricsService && docsCount > 0) {
            window.readMetricsService.recordRead(collection, docsCount, source, operation, {
                ...metadata,
                page: entry.page,
                userId: window.firebase?.auth?.()?.currentUser?.uid || window.appState?.currentUser?.uid || '',
                timestamp: entry.timestamp.toISOString()
            });
        }
    }

    _identifyPage() {
        const pathname = window.location?.pathname || '';
        const filename = pathname.split('/').filter(Boolean).pop() || 'index.html';
        const hash = String(window.location?.hash || '').replace(/^#/, '').trim();
        return hash || filename.replace(/\.html$/i, '') || 'unknown';
    }

    /**
     * Obtém a stack de chamadas para identificar a origem
     */
    _getCallStack() {
        const stack = new Error().stack;
        const lines = stack.split('\n').slice(3, 8); // Pega 5 níveis relevantes
        return lines.map(line => line.trim()).join('\n');
    }

    /**
     * Verifica se snapshot do listener deve ser ignorado para métricas de leitura.
     * Ignora snapshots estritamente locais (cache/pending writes).
     */
    _shouldIgnoreListenerSnapshot(snapshot) {
        const metadata = snapshot?.metadata || {};
        if (metadata.hasPendingWrites === true) {
            return true;
        }
        if (metadata.fromCache === true) {
            return true;
        }
        return false;
    }

    _isDeltaCountingEnabled() {
        if (typeof window === 'undefined') return true;
        const runtimeFlags = window.__SYSTEM_FLAGS__ || {};
        return runtimeFlags.enableReadMonitorDeltaCounting !== false;
    }

    /**
     * Extrai o nome da coleção de um Query object
     * Tenta múltiplas estratégias para ser robusto com diferentes versões do SDK
     *  Estratégia 3 é a que funciona com Firebase SDK 9.x + _delegate
     */
    _extractCollectionFromQuery(query) {
        if (!query) return 'unknown';
        
        // Estratégia 1: _delegate._query.path.segments (PRIMÁRIA - Firebase SDK 9.x com delegado)
        if (query._delegate?._query?.path?.segments && query._delegate._query.path.segments.length > 0) {
            const collection = query._delegate._query.path.segments[0];
            if (window.__DEBUG_READS__) console.log(`  [Extraction] Estratégia 1 (_delegate._query.path.segments): ${collection}`);
            return collection;
        }
        
        // Estratégia 2: _delegate.path.segments (acesso direto ao caminho do delegado)
        if (query._delegate?.path?.segments && query._delegate.path.segments.length > 0) {
            const collection = query._delegate.path.segments[0];
            if (window.__DEBUG_READS__) console.log(`  [Extraction] Estratégia 2 (_delegate.path.segments): ${collection}`);
            return collection;
        }
        
        // Estratégia 3: _query.path.segments (Firebase SDK 9.x sem delegado)
        if (query._query?.path?.segments && query._query.path.segments.length > 0) {
            const collection = query._query.path.segments[0];
            if (window.__DEBUG_READS__) console.log(`  [Extraction] Estratégia 3 (_query.path.segments): ${collection}`);
            return collection;
        }
        
        // Estratégia 4: _query.collectionGroup
        if (query._query?.collectionGroup) {
            if (window.__DEBUG_READS__) console.log(`  [Extraction] Estratégia 4 (_query.collectionGroup): ${query._query.collectionGroup}`);
            return query._query.collectionGroup;
        }
        
        // Estratégia 5: path property direto
        if (query.path) {
            const segments = query.path.split('/');
            if (segments.length > 0 && segments[0]) {
                if (window.__DEBUG_READS__) console.log(`  [Extraction] Estratégia 5 (path property): ${segments[0]}`);
                return segments[0];
            }
        }
        
        // Estratégia 6: _key.path.segments
        if (query._key?.path?.segments && query._key.path.segments.length > 0) {
            const collection = query._key.path.segments[0];
            if (window.__DEBUG_READS__) console.log(`  [Extraction] Estratégia 6 (_key.path.segments): ${collection}`);
            return collection;
        }
        
        // Estratégia 7: Inspecionar propriedades do _delegate
        if (query._delegate) {
            const delegateProps = Object.getOwnPropertyNames(query._delegate);
            for (const prop of delegateProps) {
                try {
                    const val = query._delegate[prop];
                    if (typeof val === 'object' && val?.segments?.length > 0 && typeof val.segments[0] === 'string') {
                        if (val.segments[0].length > 1) { // Evitar segmentos vazios
                            if (window.__DEBUG_READS__) console.log(`  [Extraction] Estratégia 7 (_delegate.${prop}.segments): ${val.segments[0]}`);
                            return val.segments[0];
                        }
                    }
                } catch {
                    // Ignorar erros ao inspecionar propriedades
                }
            }
        }
        
        // Estratégia 8: _parentPath.collectionPath
        if (query._parentPath?.collectionPath) {
            if (window.__DEBUG_READS__) console.log(`  [Extraction] Estratégia 8 (_parentPath.collectionPath): ${query._parentPath.collectionPath}`);
            return query._parentPath.collectionPath;
        }
        
        // Estratégia 9: Fallback - inspeção de todas as propriedades
        const props = Object.getOwnPropertyNames(query);
        for (const prop of props) {
            try {
                const val = query[prop];
                if (typeof val === 'object' && val?.segments?.length > 0) {
                    const firstSegment = val.segments[0];
                if (typeof firstSegment === 'string' && firstSegment.length > 1) {
                    if (window.__DEBUG_READS__) console.log(`  [Extraction] Estratégia 9 (propriedade ${prop}): ${firstSegment}`);
                    return firstSegment;
                }
                }
            } catch {
                // Ignorar erros ao inspecionar propriedades
            }
        }
        
        // Nenhuma estratégia funcionou
        return 'unknown';
    }

    /**
     * Identifica a fonte da chamada analisando stack trace
     */
    _identifySource() {
        const stack = new Error().stack;
        const lines = stack.split('\n');
        
        // Procura por arquivos JS do projeto (não bibliotecas)
        for (const line of lines) {
            // Ignora linhas do próprio monitor
            if (line.includes('firestoreReadMonitor')) continue;
            if (line.includes('firestoreReadMetricsService')) continue;
            if (line.includes('firebase-app') || line.includes('firebase.js')) continue;
            if (line.includes('get @') || line.includes('apply') || line.includes('then')) continue;
            
            // Procura por nomes de arquivo com função
            const fileMatch = line.match(/\/([a-zA-Z-]+)\.js:(\d+):(\d+)\)$/);
            if (fileMatch) {
                const fileName = fileMatch[1];
                // Remove sufixos comuns
                return fileName
                    .replace('Service', '')
                    .replace('UI', '')
                    .replace('Modal', '')
                    .replace(/[-_]/g, '');
            }
            
            // Procura por funções conhecidas do projeto
            const funcMatch = line.match(/at\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
            if (funcMatch) {
                const funcName = funcMatch[1];
                if (!['Object', 'Array', 'Promise', 'apply', 'call', 'then', 'async', 'http', 'Module'].includes(funcName)) {
                    return funcName;
                }
            }
            
            // Procura por módulos do projeto
            const moduleMatch = line.match(/\/js\/([a-zA-Z-]+)\.js/);
            if (moduleMatch) {
                return moduleMatch[1];
            }
        }
        
        return 'unknown';
    }

    /**
     * Intercepta métodos do Firestore com suporte a Firebase SDK 9.x
     */
    _interceptFirestore() {
        const self = this;
        
        const hasFirebaseCompat = typeof firebase !== 'undefined' && typeof firebase.firestore === 'function';

        // Sem SDK disponivel: usa fallback via Proxy no firestoreService.
        if (!hasFirebaseCompat) {
            console.warn(' Firebase Firestore não encontrado. Usando fallback firestoreService');
            this._patchFirestoreService();
            return;
        }

        // Opcional: Proxy adicional. Desabilitado por padrao para evitar dupla contagem.
        if (this.config.patchFirestoreService === true) {
            this._patchFirestoreService();
        }

        try {
            firebase.firestore();

            // Interceptar collection().get()
            const originalCollectionGet = firebase.firestore.CollectionReference.prototype.get;
            if (originalCollectionGet) {
                this.originalMethods.collectionGet = originalCollectionGet;
                firebase.firestore.CollectionReference.prototype.get = function(...args) {
                    // Tenta extrair do path ou usa função genérica
                    let collection = this.path;
                    if (!collection || collection === 'unknown') {
                        collection = self._extractCollectionFromQuery(this);
                    }
                    const source = self._identifySource();
                    
                    return originalCollectionGet.apply(this, args).then(snapshot => {
                        self._logRead('getDocs', collection, snapshot.size, source, {
                            query: 'full collection'
                        });
                        return snapshot;
                    }).catch(error => {
                        console.warn('[Monitor] Erro em collection.get():', error);
                        throw error;
                    });
                };
            }

            // Interceptar query.get() (CRUCIAL para queries com filtros)
            const originalQueryGet = firebase.firestore.Query.prototype.get;
            if (originalQueryGet) {
                this.originalMethods.queryGet = originalQueryGet;
                firebase.firestore.Query.prototype.get = function(...args) {
                    // Usa método robusto para extrair coleção
                    const collection = self._extractCollectionFromQuery(this);
                    const source = self._identifySource();
                    
                    return originalQueryGet.apply(this, args).then(snapshot => {
                        self._logRead('getDocs', collection, snapshot.size, source, {
                            query: 'with filters'
                        });
                        return snapshot;
                    }).catch(error => {
                        console.warn('[Monitor] Erro em query.get():', error);
                        throw error;
                    });
                };
            }

            // Interceptar doc().get()
            const originalDocGet = firebase.firestore.DocumentReference.prototype.get;
            if (originalDocGet) {
                this.originalMethods.docGet = originalDocGet;
                firebase.firestore.DocumentReference.prototype.get = function(...args) {
                    const path = this.path;
                    const collection = path.split('/')[0];
                    const source = self._identifySource();
                    
                    return originalDocGet.apply(this, args).then(snapshot => {
                        self._logRead('getDoc', collection, snapshot.exists ? 1 : 0, source, {
                            docId: this.id
                        });
                        return snapshot;
                    }).catch(error => {
                        console.warn('[Monitor] Erro em doc.get():', error);
                        throw error;
                    });
                };
            }

            // Interceptar onSnapshot em Query (inclui CollectionReference)
            const originalQueryOnSnapshot = firebase.firestore.Query.prototype.onSnapshot;
            if (originalQueryOnSnapshot) {
                this.originalMethods.queryOnSnapshot = originalQueryOnSnapshot;
                firebase.firestore.Query.prototype.onSnapshot = function(...args) {
                    let collection = 'unknown';
                    if (this._query?.path) {
                        collection = this._query.path.segments?.[0] || 'unknown';
                    } else if (this.path) {
                        collection = this.path.split('/')[0];
                    }
                    const source = self._identifySource();
                    const listenerId = `query_${collection}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                    self.snapshotListenerStates.set(listenerId, { initialized: false });
                    
                    // Encontrar callback
                    const callbackIndex = args.findIndex(arg => typeof arg === 'function');
                    if (callbackIndex >= 0) {
                        const originalCallback = args[callbackIndex];
                        const newCallback = (snapshot) => {
                            const state = self.snapshotListenerStates.get(listenerId) || { initialized: false };
                            let docsCount = 0;
                            const isInitialEvent = !state.initialized;
                            const useDeltaCounting = self._isDeltaCountingEnabled();

                            if (useDeltaCounting && self._shouldIgnoreListenerSnapshot(snapshot)) {
                                self.snapshotListenerStates.set(listenerId, state);
                                originalCallback(snapshot);
                                return;
                            }

                            if (!useDeltaCounting) {
                                docsCount = snapshot.size;
                                state.initialized = true;
                            } else if (isInitialEvent) {
                                docsCount = snapshot.size;
                                state.initialized = true;
                            } else {
                                const changes = snapshot.docChanges?.() || [];
                                docsCount = changes.filter((change) => (
                                    change?.type === 'added' || change?.type === 'modified'
                                )).length;
                            }

                            if (docsCount > 0) {
                                self._logRead('onSnapshot', collection, docsCount, source, {
                                    type: 'listener',
                                    initial: isInitialEvent,
                                    changes: snapshot.docChanges?.().length || 0
                                });
                            }

                            self.snapshotListenerStates.set(listenerId, state);
                            originalCallback(snapshot);
                        };
                        args[callbackIndex] = newCallback;
                    }
                    
                    const unsubscribe = originalQueryOnSnapshot.apply(this, args);
                    if (typeof unsubscribe === 'function') {
                        return () => {
                            self.snapshotListenerStates.delete(listenerId);
                            unsubscribe();
                        };
                    }
                    return unsubscribe;
                };
            }

            // Interceptar onSnapshot em DocumentReference
            const originalDocOnSnapshot = firebase.firestore.DocumentReference.prototype.onSnapshot;
            if (originalDocOnSnapshot) {
                this.originalMethods.docOnSnapshot = originalDocOnSnapshot;
                firebase.firestore.DocumentReference.prototype.onSnapshot = function(...args) {
                    const path = this.path;
                    const collection = path.split('/')[0];
                    const source = self._identifySource();
                    const listenerId = `doc_${path}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                    self.snapshotListenerStates.set(listenerId, { initialized: false, lastUpdateTime: null });
                    
                    const callbackIndex = args.findIndex(arg => typeof arg === 'function');
                    if (callbackIndex >= 0) {
                        const originalCallback = args[callbackIndex];
                        const newCallback = (snapshot) => {
                            const state = self.snapshotListenerStates.get(listenerId) || {
                                initialized: false,
                                lastUpdateTime: null
                            };
                            let docsCount = 0;
                            const useDeltaCounting = self._isDeltaCountingEnabled();
                            const isInitialEvent = !state.initialized;

                            if (useDeltaCounting && self._shouldIgnoreListenerSnapshot(snapshot)) {
                                self.snapshotListenerStates.set(listenerId, state);
                                originalCallback(snapshot);
                                return;
                            }

                            if (!useDeltaCounting) {
                                docsCount = snapshot.exists ? 1 : 0;
                                state.initialized = true;
                                state.lastUpdateTime = snapshot?.updateTime?.toMillis
                                    ? snapshot.updateTime.toMillis()
                                    : null;
                            } else {
                                const currentUpdateTime = snapshot?.updateTime?.toMillis
                                    ? snapshot.updateTime.toMillis()
                                    : null;

                                if (!state.initialized) {
                                    docsCount = snapshot.exists ? 1 : 0;
                                    state.initialized = true;
                                } else if (snapshot.exists) {
                                    docsCount = currentUpdateTime && state.lastUpdateTime === currentUpdateTime ? 0 : 1;
                                }

                                state.lastUpdateTime = currentUpdateTime;
                            }

                            if (docsCount > 0) {
                                self._logRead('onSnapshot', collection, docsCount, source, {
                                    type: 'doc listener',
                                    docId: this.id,
                                    initial: isInitialEvent
                                });
                            }

                            self.snapshotListenerStates.set(listenerId, state);
                            originalCallback(snapshot);
                        };
                        args[callbackIndex] = newCallback;
                    }
                    
                    const unsubscribe = originalDocOnSnapshot.apply(this, args);
                    if (typeof unsubscribe === 'function') {
                        return () => {
                            self.snapshotListenerStates.delete(listenerId);
                            unsubscribe();
                        };
                    }
                    return unsubscribe;
                };
            }

            console.log(' Interceptadores Firebase SDK 9.x instalados');
        } catch (error) {
            console.warn(' Erro ao interceptar Firebase SDK:', error.message);
        }
    }

    /**
     * Intercepta métodos do firestoreService usando Proxy (não modifica propriedades)
     */
    _patchFirestoreService() {
        const self = this;
        
        // Espera o firestoreService estar disponível
        const checkService = () => {
            if (!window.firestoreService) {
                setTimeout(checkService, 100);
                return;
            }

            try {
                // Cria um Proxy para interceptar chamadas sem modificar o módulo original
                const serviceProxy = new Proxy(window.firestoreService, {
                    get: (target, prop, receiver) => {
                        const original = Reflect.get(target, prop, receiver);
                        
                        // Se é função, envolve com logging
                        if (typeof original === 'function') {
                            return function(...args) {
                                const methodName = prop.toString();
                                
                                // Mapeamento de coleções por método
                                const collectionMap = {
                                    'getAllContracts': 'contracts',
                                    'getContractById': 'contracts',
                                    'searchContracts': 'contracts',
                                    'addContractListener': 'contracts',
                                    'getAgencies': 'agencias',
                                    'getContractors': 'contractors',
                                    'getWhatsappConfigs': 'whatsappConfigs',
                                    'getWorkflows': 'workflows'
                                };
                                
                                const collection = collectionMap[methodName] || methodName;
                                
                                // Executa função original
                                const result = original.apply(this, args);
                                
                                // Se retorna Promise, log após resolução
                                if (result && typeof result.then === 'function') {
                                    return result.then(data => {
                                        let count = 0;
                                        if (Array.isArray(data)) {
                                            count = data.length;
                                        } else if (data?.docs) {
                                            count = data.docs.length;
                                        } else if (data) {
                                            count = 1;
                                        }
                                        self._logRead(methodName, collection, count, methodName);
                                        return data;
                                    });
                                } else {
                                    // Resultado síncrono
                                    let count = 0;
                                    if (Array.isArray(result)) {
                                        count = result.length;
                                    } else if (result?.docs) {
                                        count = result.docs.length;
                                    } else if (result) {
                                        count = 1;
                                    }
                                    self._logRead(methodName, collection, count, methodName);
                                    return result;
                                }
                            };
                        }
                        
                        return original;
                    }
                });
                
                // Substitui apenas a referência global (não modifica o módulo)
                window._originalFirestoreService = window.firestoreService;
                window.firestoreService = serviceProxy;
                
                console.log(' firestoreService interceptado com Proxy');
                self.firestoreServicePatched = true;
            } catch (error) {
                console.warn(' Erro ao criar Proxy para firestoreService:', error.message);
            }
        };

        checkService();
    }


    /**
     * Restaura métodos originais do Firestore
     */
    _restoreFirestore() {
        if (this.originalMethods.collectionGet) {
            firebase.firestore.CollectionReference.prototype.get = this.originalMethods.collectionGet;
        }
        if (this.originalMethods.queryGet) {
            firebase.firestore.Query.prototype.get = this.originalMethods.queryGet;
        }
        if (this.originalMethods.docGet) {
            firebase.firestore.DocumentReference.prototype.get = this.originalMethods.docGet;
        }
        if (this.originalMethods.collectionOnSnapshot) {
            firebase.firestore.CollectionReference.prototype.onSnapshot = this.originalMethods.collectionOnSnapshot;
        }
        if (this.originalMethods.queryOnSnapshot) {
            firebase.firestore.Query.prototype.onSnapshot = this.originalMethods.queryOnSnapshot;
        }
        if (this.originalMethods.docOnSnapshot) {
            firebase.firestore.DocumentReference.prototype.onSnapshot = this.originalMethods.docOnSnapshot;
        }
        
        this.originalMethods = {};
        console.log(' Métodos Firestore restaurados');
    }

    /**
     * Total de leituras
     */
    getTotalReads() {
        return Object.values(this.summary).reduce((acc, item) => acc + item.totalDocs, 0);
    }

    /**
     * Relatório completo
     */
    report() {
        const duration = this.startTime ? (new Date() - this.startTime) / 1000 : 0;
        const totalDocs = this.getTotalReads();
        const readsPerMinute = duration > 0 ? Math.round((totalDocs / duration) * 60) : 0;

        console.log('%c\n RELATÓRIO DE LEITURAS FIRESTORE', 'color: #007bff; font-weight: bold; font-size: 16px');
        console.log('═'.repeat(60));
        
        console.log(`\n RESUMO GERAL:`);
        console.log(`   Tempo monitorado: ${Math.round(duration)}s (${Math.round(duration/60)}min)`);
        console.log(`   Total de documentos lidos: ${totalDocs}`);
        console.log(`   Leituras por minuto: ${readsPerMinute}`);
        console.log(`   Projeção por hora: ${readsPerMinute * 60}`);
        
        // Agrupa por coleção
        const byCollection = {};
        Object.values(this.summary).forEach(item => {
            if (!byCollection[item.collection]) {
                byCollection[item.collection] = { totalDocs: 0, calls: 0 };
            }
            byCollection[item.collection].totalDocs += item.totalDocs;
            byCollection[item.collection].calls += item.calls;
        });

        console.log(`\n POR COLEÇÃO:`);
        Object.entries(byCollection)
            .sort((a, b) => b[1].totalDocs - a[1].totalDocs)
            .forEach(([collection, data]) => {
                const percent = totalDocs > 0 ? ((data.totalDocs / totalDocs) * 100).toFixed(1) : 0;
                console.log(`   ${collection}: ${data.totalDocs} docs (${percent}%) em ${data.calls} chamadas`);
            });

        // Agrupa por fonte
        const bySource = {};
        Object.values(this.summary).forEach(item => {
            if (!bySource[item.source]) {
                bySource[item.source] = { totalDocs: 0, calls: 0 };
            }
            bySource[item.source].totalDocs += item.totalDocs;
            bySource[item.source].calls += item.calls;
        });

        console.log(`\n POR MÓDULO/FUNÇÃO:`);
        Object.entries(bySource)
            .sort((a, b) => b[1].totalDocs - a[1].totalDocs)
            .forEach(([source, data]) => {
                const percent = totalDocs > 0 ? ((data.totalDocs / totalDocs) * 100).toFixed(1) : 0;
                console.log(`   ${source}: ${data.totalDocs} docs (${percent}%) em ${data.calls} chamadas`);
            });

        console.log(`\n DETALHAMENTO COMPLETO:`);
        console.table(
            Object.values(this.summary)
                .sort((a, b) => b.totalDocs - a.totalDocs)
                .map(item => ({
                    'Coleção': item.collection,
                    'Fonte': item.source,
                    'Docs Lidos': item.totalDocs,
                    'Chamadas': item.calls,
                    'Média/Chamada': Math.round(item.totalDocs / item.calls)
                }))
        );

        console.log('═'.repeat(60));
        
        return this.summary;
    }

    /**
     * Top N operações mais custosas
     */
    top(n = 10) {
        console.log(`%c\n TOP ${n} OPERAÇÕES MAIS CUSTOSAS`, 'color: #ffc107; font-weight: bold');
        
        const sorted = Object.values(this.summary)
            .sort((a, b) => b.totalDocs - a.totalDocs)
            .slice(0, n);

        console.table(
            sorted.map((item, index) => ({
                '#': index + 1,
                'Coleção': item.collection,
                'Fonte': item.source,
                'Total Docs': item.totalDocs,
                'Chamadas': item.calls
            }))
        );

        return sorted;
    }

    /**
     * Monitoramento em tempo real
     */
    watch(intervalMs = null) {
        const interval = intervalMs || this.config.watchIntervalMs;
        
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
            console.log('⏹ Watch desativado');
            return;
        }

        console.log(`%c Watch ATIVADO (intervalo: ${interval/1000}s)`, 'color: #17a2b8; font-weight: bold');
        console.log('Execute firestoreMonitor.watch() novamente para desativar\n');

        let lastTotal = this.getTotalReads();

        this.watchInterval = setInterval(() => {
            const currentTotal = this.getTotalReads();
            const diff = currentTotal - lastTotal;
            lastTotal = currentTotal;

            if (diff > 0) {
                const duration = (new Date() - this.startTime) / 1000;
                const rate = Math.round((currentTotal / duration) * 60);
                
                console.log(
                    `%c ${new Date().toLocaleTimeString()} | ` +
                    `+${diff} docs | Total: ${currentTotal} | ${rate}/min`,
                    diff > 50 ? 'color: #dc3545' : diff > 20 ? 'color: #ffc107' : 'color: #28a745'
                );
            }
        }, interval);

        return this;
    }

    /**
     * Logs recentes
     */
    recent(n = 20) {
        console.log(`%c\n ${n} LEITURAS MAIS RECENTES`, 'color: #6c757d; font-weight: bold');
        
        const recent = this.reads.slice(-n).reverse();
        
        console.table(
            recent.map(entry => ({
                'Hora': entry.timestamp.toLocaleTimeString(),
                'Operação': entry.operation,
                'Coleção': entry.collection,
                'Docs': entry.docsCount,
                'Fonte': entry.source
            }))
        );

        return recent;
    }

    /**
     * Exporta dados para análise
     */
    export() {
        const data = {
            startTime: this.startTime,
            endTime: new Date(),
            durationSeconds: (new Date() - this.startTime) / 1000,
            totalReads: this.getTotalReads(),
            summary: this.summary,
            recentLogs: this.reads.slice(-100)
        };

        // Copia para clipboard se disponível
        if (navigator.clipboard) {
            navigator.clipboard.writeText(JSON.stringify(data, null, 2))
                .then(() => console.log(' Dados copiados para clipboard'))
                .catch(() => console.log('Dados:', data));
        } else {
            console.log('Dados exportados:', data);
        }

        return data;
    }

    /**
     * Reseta contadores
     */
    reset() {
        this.reads = [];
        this.summary = {};
        this.startTime = new Date();
        this.snapshotListenerStates.clear();
        console.log(' Contadores resetados');
        return this;
    }

    /**
     * Ativa log de cada leitura individual
     */
    verbose(enable = true) {
        window.__DEBUG_READS__ = enable;
        console.log(enable ? ' Modo verbose ATIVADO' : ' Modo verbose DESATIVADO');
        return this;
    }
}

// Criar instância global
const firestoreMonitor = new FirestoreReadMonitor();

// Expor globalmente
window.firestoreMonitor = firestoreMonitor;

// Atalhos convenientes
window.fmon = firestoreMonitor;

// ===== FUNÇÕES DE TESTE =====
window.testMonitorStatus = async function() {
    console.clear();
    console.log('%c=== STATUS DO FIRESTORE MONITOR ===', 'color: #0066cc; font-weight: bold; font-size: 14px');
    
    // Status do monitor
    console.log('\n MONITOR:');
    console.log('   Ativado:', window.firestoreMonitor.enabled);
    console.log('   Uptime:', Math.round((Date.now() - window.firestoreMonitor.startTime) / 1000), 's');
    console.log('   Leituras registradas:', Object.keys(window.firestoreMonitor.summary).length);
    console.log('   Total docs lidos:', window.firestoreMonitor.getTotalReads());
    
    // Status do Firebase
    console.log('\n FIREBASE:');
    console.log('   Firebase disponível:', typeof firebase !== 'undefined');
    console.log('   Firestore disponível:', typeof firebase?.firestore !== 'undefined');
    
    // Status do firestoreService
    console.log('\n FIRESTORE SERVICE:');
    console.log('   Disponível:', typeof window.firestoreService !== 'undefined');
    console.log('   getAllContracts:', typeof window.firestoreService?.getAllContracts === 'function');
    console.log('   getAgencies:', typeof window.firestoreService?.getAgencies === 'function');
    
    // Status do readMetricsService
    console.log('\n READ METRICS SERVICE:');
    console.log('   Disponível:', typeof window.readMetricsService !== 'undefined');
    console.log('   Inicializado:', window.readMetricsService?.initialized);
    
    console.log('\n Tudo pronto para testar!');
};

window.testContractsRead = async function() {
    console.clear();
    console.log('%c=== TESTE: Leitura de Contratos ===', 'color: #0066cc; font-weight: bold; font-size: 14px');
    
    try {
        // Reseta contador
        firestoreMonitor.reset();
        
        console.log('\n Fazendo leitura via firestoreService...');
        const contracts = await window.firestoreService.getAllContracts();
        console.log(` Leitura concluída: ${contracts.length} contratos`);
        
        // Exibe relatório
        console.log('\n RELATÓRIO:');
        firestoreMonitor.report();
        
    } catch (error) {
        console.error(' Erro:', error);
    }
};

window.testAgenciesRead = async function() {
    console.clear();
    console.log('%c=== TESTE: Leitura de Agências ===', 'color: #0066cc; font-weight: bold; font-size: 14px');
    
    try {
        // Reseta contador
        firestoreMonitor.reset();
        
        console.log('\n Fazendo leitura via firestoreService...');
        const agencies = await window.firestoreService.getAgencies();
        console.log(` Leitura concluída: ${agencies.length} agências`);
        
        // Exibe relatório
        console.log('\n RELATÓRIO:');
        firestoreMonitor.report();
        
    } catch (error) {
        console.error(' Erro:', error);
    }
};

window.testAllCollections = async function() {
    console.clear();
    console.log('%c=== TESTE: Leitura de Todas as Coleções ===', 'color: #0066cc; font-weight: bold; font-size: 14px');
    
    try {
        // Reseta contador
        firestoreMonitor.reset();
        
        console.log('\n Fazendo leituras...\n');
        
        const results = {
            contracts: 0,
            agencies: 0,
            contractors: 0,
            whatsappConfigs: 0,
            workflows: 0
        };
        
        // Contratos
        console.log('   Lendo contratos...');
        results.contracts = (await window.firestoreService.getAllContracts()).length;
        console.log(`     ${results.contracts} contratos`);
        
        // Agências
        console.log('   Lendo agências...');
        results.agencies = (await window.firestoreService.getAgencies()).length;
        console.log(`     ${results.agencies} agências`);
        
        // Contratados
        console.log('   Lendo contratados...');
        results.contractors = (await window.firestoreService.getContractors()).length;
        console.log(`     ${results.contractors} contratados`);
        
        // Configs WhatsApp
        console.log('   Lendo configs WhatsApp...');
        results.whatsappConfigs = (await window.firestoreService.getWhatsappConfigs()).length;
        console.log(`     ${results.whatsappConfigs} configs`);
        
        // Workflows
        console.log('   Lendo workflows...');
        results.workflows = (await window.firestoreService.getWorkflows()).length;
        console.log(`     ${results.workflows} workflows`);
        
        // Resumo
        console.log('\n RESUMO:');
        console.table(results);
        
        // Relatório do monitor
        console.log('\n MONITOR:');
        firestoreMonitor.report();
        
    } catch (error) {
        console.error(' Erro:', error);
    }
};

window.testMonitorVerbose = function() {
    console.log('%c=== TESTE: Monitor em Modo Verbose ===', 'color: #0066cc; font-weight: bold; font-size: 14px');
    
    firestoreMonitor.verbose(true);
    console.log('\n Modo verbose ATIVADO - verá logs de cada leitura\n');
    console.log('Use testContractsRead() para fazer uma leitura com logs detalhados');
};

// ===== AUTO-ATIVAÇÃO =====
// Ativa o monitor automaticamente quando a página carrega
// Usa um pequeno delay para garantir que Firebase está pronto
if (typeof window !== 'undefined') {
    // Se em modo debug, ativa com logs mais verbosos
    if (window.__DEBUG__) {
        setTimeout(() => {
            firestoreMonitor.enable();
            firestoreMonitor.verbose(true);
            console.log('%c Monitor em modo DEBUG com logs verbose', 'color: #0066cc; font-weight: bold');
        }, 500);
    } else {
        // Modo produção - ativa silenciosamente
        setTimeout(() => {
            firestoreMonitor.enable();
            console.log('%c Firestore Monitor ativado automaticamente', 'color: #28a745; font-size: 12px');
        }, 1000);
    }
}

console.log('%c Firestore Monitor carregado!', 'color: #6c757d');
console.log('   Comandos disponíveis:');
console.log('   - firestoreMonitor.report()    Ver relatório completo');
console.log('   - firestoreMonitor.watch()     Monitoramento em tempo real');
console.log('   - firestoreMonitor.top(10)     Top 10 operações');
console.log('   - firestoreMonitor.disable()   Desativar');
console.log('\n Funções de teste:');
console.log('   - testMonitorStatus()     Ver status do monitor');
console.log('   - testContractsRead()     Testar leitura de contratos');
console.log('   - testAgenciesRead()      Testar leitura de agências');
console.log('   - testAllCollections()    Testar todas as coleções');
console.log('   - testMonitorVerbose()    Ativar modo verbose');

export default firestoreMonitor;
