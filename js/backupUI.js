/**
 * Interface de Usuário para Sistema de Backup
 */

// usa debug global

class BackupUI {
    constructor() {
        this.modal = null;
        this.isInitialized = false;
        this.init();
    }

    init() {
        if (this.isInitialized) return;
        
        this.createBackupModal();
        this.addBackupButton();
        this.bindEvents();
        
        this.isInitialized = true;
    window.debug && debug(' Interface de Backup inicializada');
    }

    /**
     * Adiciona botão de backup na interface
     */
    addBackupButton() {
        // Verificar se já existe
        if (document.getElementById('backup-button')) return;

        // Criar botão principal
        const backupButton = document.createElement('button');
        backupButton.id = 'backup-button';
        backupButton.className = 'btn btn-success btn-sm d-inline-flex align-items-center gap-2 ms-2';
        backupButton.innerHTML = `
            <i class="fas fa-shield-alt"></i>
            <span>Backup</span>
        `;
        backupButton.title = 'Sistema de Backup';

        // Adicionar ao header
        const header = document.querySelector('.header');
        if (header) {
            header.appendChild(backupButton);
        }

        // Adicionar estilos
        this.addBackupStyles();
    }

    /**
     * Cria modal de backup
     */
    createBackupModal() {
        const modalHTML = `
            <div id="backup-modal" class="modal fade" tabindex="-1" aria-labelledby="backup-modal-title" aria-hidden="true">
                <div class="modal-dialog modal-dialog-scrollable modal-w-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2 id="backup-modal-title" class="modal-title">
                                <i class="fas fa-shield-alt me-2"></i>
                                Sistema de Backup
                            </h2>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                        </div>

                        <div class="modal-body">
                            <ul class="nav nav-tabs mb-3" role="tablist">
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link active" type="button" data-tab="backup" role="tab" aria-controls="backup-tab" aria-selected="true">Backup</button>
                                </li>
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link" type="button" data-tab="restore" role="tab" aria-controls="restore-tab" aria-selected="false">Restaurar</button>
                                </li>
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link" type="button" data-tab="settings" role="tab" aria-controls="settings-tab" aria-selected="false">Configurações</button>
                                </li>
                                <li class="nav-item" role="presentation">
                                    <button class="nav-link" type="button" data-tab="stats" role="tab" aria-controls="stats-tab" aria-selected="false">Estatísticas</button>
                                </li>
                            </ul>

                            <div class="tab-content">

                            <!-- Tab Backup -->
                            <div id="backup-tab" class="tab-pane fade show active">
                                <div class="card mb-3">
                                    <div class="card-body">
                                        <h5 class="card-title">Backup Manual</h5>
                                        <p class="card-text text-muted mb-3">Criar backup imediato dos seus dados</p>
                                        <button id="create-backup-btn" class="btn btn-primary">
                                            <i class="fas fa-download me-1"></i>
                                            Criar Backup
                                        </button>
                                    </div>
                                </div>

                                <div class="card mb-3">
                                    <div class="card-body">
                                        <h5 class="card-title">Status do Backup Automático</h5>
                                        <div id="backup-status" class="list-group list-group-flush mt-3">
                                            <div class="list-group-item d-flex justify-content-between align-items-center px-0">
                                                <span class="fw-semibold">Último Backup:</span>
                                                <span id="last-backup-time" class="text-primary fw-semibold">-</span>
                                            </div>
                                            <div class="list-group-item d-flex justify-content-between align-items-center px-0">
                                                <span class="fw-semibold">Próximo Backup:</span>
                                                <span id="next-backup-time" class="text-primary fw-semibold">-</span>
                                            </div>
                                            <div class="list-group-item d-flex justify-content-between align-items-center px-0">
                                                <span class="fw-semibold">Frequência:</span>
                                                <span id="backup-frequency" class="text-primary fw-semibold">-</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Tab Restaurar -->
                            <div id="restore-tab" class="tab-pane fade">
                                <div class="card mb-3">
                                    <div class="card-body">
                                        <h5 class="card-title">Restaurar de Arquivo</h5>
                                        <p class="card-text text-muted mb-3">Selecione um arquivo de backup para restaurar</p>
                                        <input type="file" id="restore-file-input" class="d-none" accept=".json">
                                        <div class="d-flex flex-wrap gap-2">
                                            <button id="select-restore-file-btn" class="btn btn-secondary">
                                                <i class="fas fa-upload me-1"></i>
                                                Selecionar Arquivo
                                            </button>
                                            <button id="restore-from-file-btn" class="btn btn-warning d-none">
                                                <i class="fas fa-undo me-1"></i>
                                                Restaurar
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div class="card mb-3">
                                    <div class="card-body">
                                        <h5 class="card-title">Backups Armazenados</h5>
                                        <div id="stored-backups-list" class="list-group scroll-y-md">
                                            <!-- Lista será preenchida dinamicamente -->
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Tab Configurações -->
                            <div id="settings-tab" class="tab-pane fade">
                                <div class="card mb-3">
                                    <div class="card-body">
                                        <h5 class="card-title">Backup Automático</h5>
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <label for="backup-frequency-select" class="form-label">Frequência:</label>
                                                <select id="backup-frequency-select" class="form-select">
                                                    <option value="daily">Diário</option>
                                                    <option value="weekly">Semanal</option>
                                                    <option value="monthly">Mensal</option>
                                                </select>
                                            </div>
                                            <div class="col-md-6">
                                                <label for="max-backups-input" class="form-label">Máximo de Backups:</label>
                                                <input type="number" id="max-backups-input" class="form-control" min="1" max="50" value="10">
                                            </div>
                                        </div>
                                        <div class="mt-3">
                                            <button id="save-backup-settings-btn" class="btn btn-primary">
                                                <i class="fas fa-save me-1"></i>
                                                Salvar Configurações
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div class="card mb-3">
                                    <div class="card-body">
                                        <h5 class="card-title">Ações Avançadas</h5>
                                        <button id="clear-backups-btn" class="btn btn-danger">
                                            <i class="fas fa-trash me-1"></i>
                                            Limpar Todos os Backups
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- Tab Estatísticas -->
                            <div id="stats-tab" class="tab-pane fade">
                                <div class="card mb-3">
                                    <div class="card-body">
                                        <h5 class="card-title">Estatísticas do Sistema</h5>
                                        <div id="backup-stats" class="row g-3">
                                            <!-- Estatísticas serão preenchidas dinamicamente -->
                                        </div>
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
        this.modal = document.getElementById('backup-modal');
    }

    /**
     * Adiciona estilos CSS para backup
     */
    addBackupStyles() {
        const styles = `
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
        `;

        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    /**
     * Vincula eventos
     */
    bindEvents() {
        // Botão principal de backup
        const backupButton = document.getElementById('backup-button');
        if (backupButton) {
            backupButton.addEventListener('click', () => this.openModal());
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

            // Criar backup
            const createBackupBtn = document.getElementById('create-backup-btn');
            if (createBackupBtn) {
                createBackupBtn.addEventListener('click', () => this.createManualBackup());
            }

            // Selecionar arquivo para restaurar
            const selectFileBtn = document.getElementById('select-restore-file-btn');
            const fileInput = document.getElementById('restore-file-input');
            if (selectFileBtn && fileInput) {
                selectFileBtn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
            }

            // Restaurar de arquivo
            const restoreBtn = document.getElementById('restore-from-file-btn');
            if (restoreBtn) {
                restoreBtn.addEventListener('click', () => this.restoreFromFile());
            }

            // Salvar configurações
            const saveSettingsBtn = document.getElementById('save-backup-settings-btn');
            if (saveSettingsBtn) {
                saveSettingsBtn.addEventListener('click', () => this.saveSettings());
            }

            // Limpar backups
            const clearBackupsBtn = document.getElementById('clear-backups-btn');
            if (clearBackupsBtn) {
                clearBackupsBtn.addEventListener('click', () => this.clearAllBackups());
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
     * Atualiza conteúdo do modal
     */
    updateModalContent() {
        this.updateBackupStatus();
        this.updateStoredBackups();
        this.updateSettings();
        this.updateStats();
    }

    /**
     * Atualiza status do backup
     */
    updateBackupStatus() {
        if (!window.backupService) return;

        const stats = window.backupService.getBackupStats();
        
        const lastBackupElement = document.getElementById('last-backup-time');
        const nextBackupElement = document.getElementById('next-backup-time');
        const frequencyElement = document.getElementById('backup-frequency');

        if (lastBackupElement) {
            lastBackupElement.textContent = stats.lastBackupTime 
                ? this.formatDate(stats.lastBackupTime)
                : 'Nunca';
        }

        if (nextBackupElement) {
            const nextTime = stats.nextBackupTime;
            nextBackupElement.textContent = nextTime === 'Imediatamente' 
                ? nextTime 
                : this.formatDate(nextTime);
        }

        if (frequencyElement) {
            const frequencyMap = {
                daily: 'Diário',
                weekly: 'Semanal',
                monthly: 'Mensal'
            };
            frequencyElement.textContent = frequencyMap[stats.frequency] || stats.frequency;
        }
    }

    /**
     * Atualiza lista de backups armazenados
     */
    updateStoredBackups() {
        if (!window.backupService) return;

        const backups = window.backupService.getStoredBackups();
        const container = document.getElementById('stored-backups-list');
        
        if (!container) return;

        if (backups.length === 0) {
            container.innerHTML = '<div class="list-group-item text-muted">Nenhum backup armazenado</div>';
            return;
        }

        container.innerHTML = backups.map(backup => `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <div class="d-flex flex-column">
                    <span class="fw-semibold">${this.formatDate(backup.timestamp)}</span>
                    <small class="text-muted">${this.formatFileSize(JSON.stringify(backup).length)}</small>
                </div>
                <div class="d-flex gap-2">
                    <button class="btn btn-outline-secondary btn-sm" onclick="backupUI.downloadStoredBackup('${backup.timestamp}')">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-outline-success btn-sm" onclick="backupUI.restoreStoredBackup('${backup.timestamp}')">
                        <i class="fas fa-undo"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="backupUI.deleteStoredBackup('${backup.timestamp}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Atualiza configurações
     */
    updateSettings() {
        if (!window.backupService) return;

        const stats = window.backupService.getBackupStats();
        
        const frequencySelect = document.getElementById('backup-frequency-select');
        const maxBackupsInput = document.getElementById('max-backups-input');

        if (frequencySelect) {
            frequencySelect.value = stats.frequency;
        }

        if (maxBackupsInput) {
            maxBackupsInput.value = stats.maxBackups;
        }
    }

    /**
     * Atualiza estatísticas
     */
    updateStats() {
        if (!window.backupService) return;

        const stats = window.backupService.getBackupStats();
        const container = document.getElementById('backup-stats');
        
        if (!container) return;

        const totalSize = stats.backupSizes.reduce((sum, backup) => sum + backup.size, 0);
        const avgSize = stats.backupSizes.length > 0 ? totalSize / stats.backupSizes.length : 0;

        container.innerHTML = `
            <div class="col-6 col-lg-3">
                <div class="card h-100 text-center">
                    <div class="card-body">
                        <div class="fs-4 fw-semibold">${stats.totalBackups}</div>
                        <div class="text-muted small">Total de Backups</div>
                    </div>
                </div>
            </div>
            <div class="col-6 col-lg-3">
                <div class="card h-100 text-center">
                    <div class="card-body">
                        <div class="fs-4 fw-semibold">${this.formatFileSize(totalSize)}</div>
                        <div class="text-muted small">Espaço Total</div>
                    </div>
                </div>
            </div>
            <div class="col-6 col-lg-3">
                <div class="card h-100 text-center">
                    <div class="card-body">
                        <div class="fs-4 fw-semibold">${this.formatFileSize(avgSize)}</div>
                        <div class="text-muted small">Tamanho Médio</div>
                    </div>
                </div>
            </div>
            <div class="col-6 col-lg-3">
                <div class="card h-100 text-center">
                    <div class="card-body">
                        <div class="fs-4 fw-semibold">${stats.frequency}</div>
                        <div class="text-muted small">Frequência</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Atualiza conteúdo específico da tab
     */
    updateTabContent(tabName) {
        switch (tabName) {
            case 'backup':
                this.updateBackupStatus();
                break;
            case 'restore':
                this.updateStoredBackups();
                break;
            case 'settings':
                this.updateSettings();
                break;
            case 'stats':
                this.updateStats();
                break;
        }
    }

    /**
     * Cria backup manual
     */
    async createManualBackup() {
        if (!window.backupService) return;

        const button = document.getElementById('create-backup-btn');
        const originalHtml = button.innerHTML;
        
        try {
            button.innerHTML = '<span class="loading-spinner"></span> Criando...';
            button.disabled = true;

            await window.backupService.createManualBackup();
            this.updateModalContent();

        } catch (error) {
            console.error('Erro ao criar backup:', error);
        } finally {
            button.innerHTML = originalHtml;
            button.disabled = false;
        }
    }

    /**
     * Manipula seleção de arquivo
     */
    handleFileSelect(event) {
        const file = event.target.files[0];
        const restoreBtn = document.getElementById('restore-from-file-btn');
        const selectBtn = document.getElementById('select-restore-file-btn');

        if (file && file.type === 'application/json') {
            selectBtn.innerHTML = `<i class="fas fa-check me-1"></i>${file.name}`;
            restoreBtn.classList.remove('d-none');
            this.selectedFile = file;
        } else {
            selectBtn.innerHTML = '<i class="fas fa-upload me-1"></i>Selecionar Arquivo';
            restoreBtn.classList.add('d-none');
            this.selectedFile = null;
        }
    }

    /**
     * Restaura de arquivo
     */
    async restoreFromFile() {
        if (!this.selectedFile || !window.backupService) return;

        const button = document.getElementById('restore-from-file-btn');
        const originalHtml = button.innerHTML;
        
        try {
            button.innerHTML = '<span class="loading-spinner"></span> Restaurando...';
            button.disabled = true;

            const text = await this.selectedFile.text();
            const backup = JSON.parse(text);
            
            await window.backupService.restoreBackup(backup);

        } catch (error) {
            console.error('Erro ao restaurar backup:', error);
            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Erro ao restaurar backup: ' + error.message,
                    'error'
                );
            }
        } finally {
            button.innerHTML = originalHtml;
            button.disabled = false;
        }
    }

    /**
     * Salva configurações
     */
    saveSettings() {
        if (!window.backupService) return;

        const frequency = document.getElementById('backup-frequency-select').value;
        const maxBackups = parseInt(document.getElementById('max-backups-input').value);

        window.backupService.setBackupFrequency(frequency);
        window.backupService.setMaxBackups(maxBackups);

        this.updateModalContent();
    }

    /**
     * Limpa todos os backups
     */
    clearAllBackups() {
        const confirm = window.confirm(
            'Tem certeza de que deseja excluir todos os backups armazenados? ' +
            'Esta ação não pode ser desfeita.'
        );

        if (confirm) {
            localStorage.removeItem('storedBackups');
            this.updateStoredBackups();
            
            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Todos os backups foram excluídos',
                    'success'
                );
            }
        }
    }

    /**
     * Baixa backup armazenado
     */
    downloadStoredBackup(timestamp) {
        if (!window.backupService) return;

        const backups = window.backupService.getStoredBackups();
        const backup = backups.find(b => b.timestamp === timestamp);
        
        if (backup) {
            window.backupService.downloadBackup(backup);
        }
    }

    /**
     * Restaura backup armazenado
     */
    async restoreStoredBackup(timestamp) {
        if (!window.backupService) return;

        const backups = window.backupService.getStoredBackups();
        const backup = backups.find(b => b.timestamp === timestamp);
        
        if (backup) {
            await window.backupService.restoreBackup(backup);
        }
    }

    /**
     * Exclui backup armazenado
     */
    deleteStoredBackup(timestamp) {
        if (!window.backupService) return;

        const confirm = window.confirm('Tem certeza de que deseja excluir este backup?');
        
        if (confirm) {
            window.backupService.deleteStoredBackup(timestamp);
            this.updateStoredBackups();
        }
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

    /**
     * Formata tamanho de arquivo
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Instância global
window.backupUI = new BackupUI();
