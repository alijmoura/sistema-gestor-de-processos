/**
 * Serviço de Backup Automático
 * Responsável por fazer backup e restauração dos dados do Firestore
 */

// usa debug global

class BackupService {
    constructor() {
        this.isInitialized = false;
        this.backupInterval = null;
        this.lastBackupTime = null;
        this.backupFrequency = 'daily'; // daily, weekly, monthly
        this.maxBackups = 10; // Máximo de backups a manter
        this.init();
    }

    async init() {
        if (this.isInitialized) return;
        
        try {
            // Carregar configurações de backup
            await this.loadBackupSettings();
            
            // Configurar backup automático
            this.setupAutomaticBackup();
            
            // Verificar se precisa fazer backup imediato
            await this.checkBackupSchedule();
            
            this.isInitialized = true;
            window.debug && debug(' Serviço de Backup inicializado');
            
        } catch (error) {
            console.error(' Erro ao inicializar serviço de backup:', error);
        }
    }

    /**
     * Carrega configurações de backup do localStorage
     */
    async loadBackupSettings() {
        try {
            const settings = localStorage.getItem('backupSettings');
            if (settings) {
                const parsed = JSON.parse(settings);
                this.backupFrequency = parsed.frequency || 'daily';
                this.maxBackups = parsed.maxBackups || 10;
                this.lastBackupTime = parsed.lastBackupTime ? new Date(parsed.lastBackupTime) : null;
            }
        } catch (error) {
            console.error('Erro ao carregar configurações de backup:', error);
        }
    }

    /**
     * Salva configurações de backup no localStorage
     */
    saveBackupSettings() {
        try {
            const settings = {
                frequency: this.backupFrequency,
                maxBackups: this.maxBackups,
                lastBackupTime: this.lastBackupTime?.toISOString()
            };
            localStorage.setItem('backupSettings', JSON.stringify(settings));
        } catch (error) {
            console.error('Erro ao salvar configurações de backup:', error);
        }
    }

    /**
     * Configura backup automático baseado na frequência
     */
    setupAutomaticBackup() {
        // Limpar intervalo anterior se existir
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
        }

        // Configurar novo intervalo (verificar a cada hora)
        this.backupInterval = setInterval(() => {
            this.checkBackupSchedule();
        }, 60 * 60 * 1000); // 1 hora
    }

    /**
     * Verifica se é hora de fazer backup
     */
    async checkBackupSchedule() {
        if (!this.shouldBackupNow()) return;

        try {
            await this.createAutomaticBackup();
        } catch (error) {
            console.error('Erro no backup automático:', error);
            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Erro no backup automático',
                    'error'
                );
            }
        }
    }

    /**
     * Verifica se deve fazer backup agora
     */
    shouldBackupNow() {
        if (!this.lastBackupTime) return true;

        const now = new Date();
        const timeDiff = now - this.lastBackupTime;
        
        switch (this.backupFrequency) {
            case 'daily':
                return timeDiff >= 24 * 60 * 60 * 1000; // 24 horas
            case 'weekly':
                return timeDiff >= 7 * 24 * 60 * 60 * 1000; // 7 dias
            case 'monthly':
                return timeDiff >= 30 * 24 * 60 * 60 * 1000; // 30 dias
            default:
                return false;
        }
    }

    /**
     * Cria backup automático
     */
    async createAutomaticBackup() {
        try {
            const backup = await this.createBackup();
            
            // Salvar backup no localStorage
            this.saveBackupToStorage(backup);
            
            // Atualizar tempo do último backup
            this.lastBackupTime = new Date();
            this.saveBackupSettings();

            // Notificar usuário
            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Backup automático realizado com sucesso',
                    'success'
                );
            }

            debug(' Backup automático criado:', backup.timestamp);
            
        } catch (error) {
            console.error(' Erro no backup automático:', error);
            throw error;
        }
    }

    /**
     * Cria backup manual
     */
    async createManualBackup() {
        try {
            const backup = await this.createBackup();
            
            // Baixar backup imediatamente
            this.downloadBackup(backup);
            
            // Também salvar no localStorage
            this.saveBackupToStorage(backup);
            
            // Atualizar tempo do último backup
            this.lastBackupTime = new Date();
            this.saveBackupSettings();

            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Backup manual criado e baixado com sucesso',
                    'success'
                );
            }

            return backup;
            
        } catch (error) {
            console.error(' Erro no backup manual:', error);
            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Erro ao criar backup manual',
                    'error'
                );
            }
            throw error;
        }
    }

    /**
     * Cria backup dos dados
     */
    async createBackup() {
        try {
            const backup = {
                timestamp: new Date().toISOString(),
                version: '1.0',
                data: {}
            };

            // Backup dos contratos
            if (window.firestoreService) {
                const contratos = await window.firestoreService.getAllContratos();
                backup.data.contratos = contratos;
            }

            // Backup das configurações
            const configuracoes = this.getLocalStorageData();
            backup.data.configuracoes = configuracoes;

            // Backup dos eventos do calendário (se existirem)
            if (window.calendarService) {
                try {
                    const eventos = await window.calendarService.getAllEvents();
                    backup.data.eventos = eventos;
                } catch (error) {
                    console.warn('Não foi possível fazer backup dos eventos:', error);
                }
            }

            return backup;
            
        } catch (error) {
            console.error('Erro ao criar backup:', error);
            throw error;
        }
    }

    /**
     * Obtém dados do localStorage
     */
    getLocalStorageData() {
        const data = {};
        const keys = [
            'backupSettings',
            'notificationSettings',
            'dashboardSettings',
            'calendarSettings',
            'theme',
            'userPreferences'
        ];

        keys.forEach(key => {
            const value = localStorage.getItem(key);
            if (value) {
                try {
                    data[key] = JSON.parse(value);
                } catch {
                    data[key] = value;
                }
            }
        });

        return data;
    }

    /**
     * Salva backup no localStorage
     */
    saveBackupToStorage(backup) {
        try {
            const backups = this.getStoredBackups();
            
            // Adicionar novo backup
            backups.unshift(backup);
            
            // Manter apenas os últimos backups
            if (backups.length > this.maxBackups) {
                backups.splice(this.maxBackups);
            }
            
            localStorage.setItem('storedBackups', JSON.stringify(backups));
            
        } catch (error) {
            console.error('Erro ao salvar backup no storage:', error);
        }
    }

    /**
     * Obtém backups armazenados
     */
    getStoredBackups() {
        try {
            const backups = localStorage.getItem('storedBackups');
            return backups ? JSON.parse(backups) : [];
        } catch (error) {
            console.error('Erro ao obter backups armazenados:', error);
            return [];
        }
    }

    /**
     * Baixa backup como arquivo
     */
    downloadBackup(backup) {
        try {
            const dataStr = JSON.stringify(backup, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const url = window.URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `backup_${backup.timestamp.replace(/[:.]/g, '-')}.json`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            window.URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('Erro ao baixar backup:', error);
        }
    }

    /**
     * Restaura backup
     */
    async restoreBackup(backup) {
        try {
            if (!backup || !backup.data) {
                throw new Error('Backup inválido');
            }

            // Confirmar com o usuário - usa modal padronizado se disponível
            const confirmRestore = window.uiHelpers 
                ? await window.uiHelpers.confirmImportantAction(
                    'Restaurar backup',
                    'Todos os dados atuais serão substituídos. Esta ação não pode ser desfeita.'
                  )
                : confirm(
                    'Tem certeza de que deseja restaurar este backup? ' +
                    'Todos os dados atuais serão substituídos.'
                  );

            if (!confirmRestore) return false;

            // Restaurar contratos
            if (backup.data.contratos && window.firestoreService) {
                await this.restoreContratos(backup.data.contratos);
            }

            // Restaurar configurações
            if (backup.data.configuracoes) {
                this.restoreConfiguracoes(backup.data.configuracoes);
            }

            // Restaurar eventos (se existirem)
            if (backup.data.eventos && window.calendarService) {
                try {
                    await this.restoreEventos(backup.data.eventos);
                } catch (error) {
                    console.warn('Não foi possível restaurar eventos:', error);
                }
            }

            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Backup restaurado com sucesso! Recarregando página...',
                    'success'
                );
            }

            // Recarregar página após 2 segundos
            setTimeout(() => {
                window.location.reload();
            }, 2000);

            return true;
            
        } catch (error) {
            console.error('Erro ao restaurar backup:', error);
            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Erro ao restaurar backup: ' + error.message,
                    'error'
                );
            }
            throw error;
        }
    }

    /**
     * Restaura contratos do backup
     */
    async restoreContratos(contratos) {
        try {
            // Limpar contratos existentes (cuidado!)
            const existingContratos = await window.firestoreService.getAllContratos();
            
            for (const contrato of existingContratos) {
                await window.firestoreService.deleteContrato(contrato.id);
            }

            // Adicionar contratos do backup
            for (const contrato of contratos) {
                const { ...contratoData } = contrato;
                await window.firestoreService.addContrato(contratoData);
            }

            debug(` ${contratos.length} contratos restaurados`);
            
        } catch (error) {
            console.error('Erro ao restaurar contratos:', error);
            throw error;
        }
    }

    /**
     * Restaura configurações do backup
     */
    restoreConfiguracoes(configuracoes) {
        try {
            Object.keys(configuracoes).forEach(key => {
                const value = configuracoes[key];
                const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;
                localStorage.setItem(key, valueStr);
            });

            debug(' Configurações restauradas');
            
        } catch (error) {
            console.error('Erro ao restaurar configurações:', error);
            throw error;
        }
    }

    /**
     * Restaura eventos do backup
     */
    async restoreEventos() {
        try {
            // Implementar quando o calendarService estiver disponível
            debug(' Eventos restaurados (placeholder)');
        } catch (error) {
            console.error('Erro ao restaurar eventos:', error);
            throw error;
        }
    }

    /**
     * Exclui backup armazenado
     */
    deleteStoredBackup(timestamp) {
        try {
            const backups = this.getStoredBackups();
            const filteredBackups = backups.filter(backup => backup.timestamp !== timestamp);
            localStorage.setItem('storedBackups', JSON.stringify(filteredBackups));
            
            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Backup excluído com sucesso',
                    'success'
                );
            }
            
        } catch (error) {
            console.error('Erro ao excluir backup:', error);
            if (window.notificationService) {
                window.notificationService.showNotification(
                    'Erro ao excluir backup',
                    'error'
                );
            }
        }
    }

    /**
     * Configura frequência de backup
     */
    setBackupFrequency(frequency) {
        this.backupFrequency = frequency;
        this.saveBackupSettings();
        this.setupAutomaticBackup();
        
        if (window.notificationService) {
            window.notificationService.showNotification(
                `Frequência de backup alterada para: ${frequency}`,
                'success'
            );
        }
    }

    /**
     * Configura número máximo de backups
     */
    setMaxBackups(maxBackups) {
        this.maxBackups = maxBackups;
        this.saveBackupSettings();
        
        // Limitar backups existentes
        const backups = this.getStoredBackups();
        if (backups.length > maxBackups) {
            const limitedBackups = backups.slice(0, maxBackups);
            localStorage.setItem('storedBackups', JSON.stringify(limitedBackups));
        }
        
        if (window.notificationService) {
            window.notificationService.showNotification(
                `Número máximo de backups alterado para: ${maxBackups}`,
                'success'
            );
        }
    }

    /**
     * Obtém estatísticas de backup
     */
    getBackupStats() {
        const backups = this.getStoredBackups();
        
        return {
            totalBackups: backups.length,
            lastBackupTime: this.lastBackupTime,
            frequency: this.backupFrequency,
            maxBackups: this.maxBackups,
            nextBackupTime: this.getNextBackupTime(),
            backupSizes: backups.map(backup => ({
                timestamp: backup.timestamp,
                size: JSON.stringify(backup).length
            }))
        };
    }

    /**
     * Calcula próximo horário de backup
     */
    getNextBackupTime() {
        if (!this.lastBackupTime) return 'Imediatamente';

        const next = new Date(this.lastBackupTime);
        
        switch (this.backupFrequency) {
            case 'daily':
                next.setDate(next.getDate() + 1);
                break;
            case 'weekly':
                next.setDate(next.getDate() + 7);
                break;
            case 'monthly':
                next.setMonth(next.getMonth() + 1);
                break;
        }
        
        return next;
    }

    /**
     * Limpa todos os dados do serviço
     */
    cleanup() {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
            this.backupInterval = null;
        }
        this.isInitialized = false;
    }
}

// Instância global
window.backupService = new BackupService();