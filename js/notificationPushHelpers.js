/**
 * NotificationPushHelpers - Funções auxiliares para integração
 * 
 * Facilita o uso do NotificationPushService em diferentes partes do sistema
 * com ações pré-configuradas e templates comuns.
 * 
 * @version 1.0.0
 */

const NotificationPushHelpers = {
    /**
     * Notificação de sucesso simples
     * @param {string} message - Mensagem
     * @param {Object} options - Opções adicionais
     */
    success(message, options = {}) {
        return window.notificationPushService.show({
            type: 'success',
            title: options.title || 'Sucesso!',
            message,
            icon: options.icon || 'bi-check-circle-fill',
            duration: options.duration || 4000,
            ...options
        });
    },

    /**
     * Notificação de erro simples
     * @param {string} message - Mensagem
     * @param {Object} options - Opções adicionais
     */
    error(message, options = {}) {
        return window.notificationPushService.show({
            type: 'error',
            title: options.title || 'Erro',
            message,
            icon: options.icon || 'bi-x-circle-fill',
            duration: options.duration || 6000,
            vibrate: true,
            ...options
        });
    },

    /**
     * Notificação de alerta/warning
     * @param {string} message - Mensagem
     * @param {Object} options - Opções adicionais
     */
    warning(message, options = {}) {
        return window.notificationPushService.show({
            type: 'warning',
            title: options.title || 'Atenção',
            message,
            icon: options.icon || 'bi-exclamation-triangle-fill',
            duration: options.duration || 5000,
            ...options
        });
    },

    /**
     * Notificação informativa
     * @param {string} message - Mensagem
     * @param {Object} options - Opções adicionais
     */
    info(message, options = {}) {
        return window.notificationPushService.show({
            type: 'info',
            title: options.title || 'Informação',
            message,
            icon: options.icon || 'bi-info-circle-fill',
            duration: options.duration || 4000,
            ...options
        });
    },

    /**
     * Notificação de processo/contrato atualizado
     * @param {Object} contract - Dados do contrato
     */
    contractUpdated(contract) {
        return window.notificationPushService.show({
            type: 'success',
            title: 'Processo Atualizado',
            message: `${contract.processo || 'Processo'} foi atualizado com sucesso`,
            icon: 'bi-file-earmark-check',
            groupKey: 'contract-updates',
            duration: 4000,
            actions: [
                {
                    label: 'Ver Detalhes',
                    icon: 'bi-eye',
                    variant: 'primary',
                    handler: () => {
                        if (contract.id) {
                            window.contractDetailsModal?.show(contract.id);
                        }
                    }
                }
            ],
            data: { contractId: contract.id }
        });
    },

    /**
     * Notificação de SLA vencendo
     * @param {Object} contract - Dados do contrato
     * @param {number} daysRemaining - Dias restantes
     */
    slaWarning(contract, daysRemaining) {
        return window.notificationPushService.show({
            type: 'warning',
            title: 'SLA Próximo do Vencimento',
            message: `${contract.processo || 'Processo'} vence em ${daysRemaining} dia(s)`,
            icon: 'bi-clock-fill',
            groupKey: 'sla-warnings',
            duration: 8000,
            vibrate: true,
            actions: [
                {
                    label: 'Ver Processo',
                    icon: 'bi-eye',
                    variant: 'warning',
                    handler: () => {
                        if (contract.id) {
                            window.contractDetailsModal?.show(contract.id);
                        }
                    }
                },
                {
                    label: 'Lembrar Depois',
                    icon: 'bi-clock',
                    variant: 'secondary',
                    handler: () => {
                        // Lógica de snooze (implementar conforme necessidade)
                        NotificationPushHelpers.info('Você será lembrado em 1 hora');
                    }
                }
            ],
            data: { contractId: contract.id, slaType: 'warning' }
        });
    },

    /**
     * Notificação de SLA vencido (crítico)
     * @param {Object} contract - Dados do contrato
     * @param {number} daysOverdue - Dias em atraso
     */
    slaOverdue(contract, daysOverdue) {
        return window.notificationPushService.show({
            type: 'error',
            title: 'SLA VENCIDO!',
            message: `${contract.processo || 'Processo'} está ${daysOverdue} dia(s) atrasado`,
            icon: 'bi-exclamation-octagon-fill',
            groupKey: 'sla-overdue',
            duration: 0, // Não fechar automaticamente
            vibrate: true,
            actions: [
                {
                    label: 'Ver Agora',
                    icon: 'bi-eye-fill',
                    variant: 'danger',
                    handler: () => {
                        if (contract.id) {
                            window.contractDetailsModal?.show(contract.id);
                        }
                    }
                },
                {
                    label: 'Atribuir a Mim',
                    icon: 'bi-person-check',
                    variant: 'primary',
                    handler: async () => {
                        try {
                            const user = firebase.auth().currentUser;
                            await window.firestoreService.updateContract(contract.id, {
                                responsavel: user.displayName || user.email
                            });
                            NotificationPushHelpers.success('Processo atribuído a você');
                        } catch {
                            NotificationPushHelpers.error('Erro ao atribuir processo');
                        }
                    },
                    closeAfter: false
                }
            ],
            data: { contractId: contract.id, slaType: 'overdue', priority: 'critical' }
        });
    },

    /**
     * Notificação de aprovação pendente
     * @param {Object} contract - Dados do contrato
     */
    approvalPending(contract) {
        return window.notificationPushService.show({
            type: 'info',
            title: 'Aprovação Pendente',
            message: `${contract.processo || 'Processo'} aguarda sua aprovação`,
            icon: 'bi-shield-check',
            groupKey: 'approvals',
            duration: 7000,
            actions: [
                {
                    label: 'Aprovar',
                    icon: 'bi-check-lg',
                    variant: 'success',
                    handler: async () => {
                        try {
                            await window.firestoreService.updateContract(contract.id, {
                                status: 'Aprovado'
                            });
                            NotificationPushHelpers.success('Processo aprovado!');
                        } catch {
                            NotificationPushHelpers.error('Erro ao aprovar processo');
                        }
                    }
                },
                {
                    label: 'Rejeitar',
                    icon: 'bi-x-lg',
                    variant: 'danger',
                    handler: async () => {
                        try {
                            await window.firestoreService.updateContract(contract.id, {
                                status: 'Rejeitado'
                            });
                            NotificationPushHelpers.warning('Processo rejeitado');
                        } catch {
                            NotificationPushHelpers.error('Erro ao rejeitar processo');
                        }
                    }
                },
                {
                    label: 'Ver Detalhes',
                    icon: 'bi-eye',
                    variant: 'secondary',
                    handler: () => {
                        if (contract.id) {
                            window.contractDetailsModal?.show(contract.id);
                        }
                    }
                }
            ],
            data: { contractId: contract.id, type: 'approval' }
        });
    },

    /**
     * Notificação de novo comentário
     * @param {Object} comment - Dados do comentário
     * @param {Object} contract - Dados do contrato
     */
    newComment(comment, contract) {
        return window.notificationPushService.show({
            type: 'info',
            title: 'Novo Comentário',
            message: `${comment.author}: "${comment.text.substring(0, 50)}${comment.text.length > 50 ? '...' : ''}"`,
            icon: 'bi-chat-left-text',
            groupKey: `comments-${contract.id}`,
            duration: 5000,
            actions: [
                {
                    label: 'Responder',
                    icon: 'bi-reply',
                    variant: 'primary',
                    handler: () => {
                        // Abrir modal de detalhes e focar no campo de comentários
                        if (contract.id) {
                            window.contractDetailsModal?.show(contract.id);
                            setTimeout(() => {
                                document.querySelector('#commentText')?.focus();
                            }, 500);
                        }
                    }
                },
                {
                    label: 'Ver Processo',
                    icon: 'bi-eye',
                    variant: 'secondary',
                    handler: () => {
                        if (contract.id) {
                            window.contractDetailsModal?.show(contract.id);
                        }
                    }
                }
            ],
            data: { contractId: contract.id, commentId: comment.id }
        });
    },

    /**
     * Notificação de novo anexo
     * @param {Object} attachment - Dados do anexo
     * @param {Object} contract - Dados do contrato
     */
    newAttachment(attachment, contract) {
        return window.notificationPushService.show({
            type: 'info',
            title: 'Novo Anexo',
            message: `Arquivo "${attachment.name}" adicionado a ${contract.processo || 'processo'}`,
            icon: 'bi-paperclip',
            groupKey: `attachments-${contract.id}`,
            duration: 4000,
            actions: [
                {
                    label: 'Visualizar',
                    icon: 'bi-eye',
                    variant: 'primary',
                    handler: () => {
                        if (attachment.url) {
                            window.open(attachment.url, '_blank');
                        }
                    }
                },
                {
                    label: 'Ver Processo',
                    icon: 'bi-folder',
                    variant: 'secondary',
                    handler: () => {
                        if (contract.id) {
                            window.contractDetailsModal?.show(contract.id);
                        }
                    }
                }
            ],
            data: { contractId: contract.id, attachmentId: attachment.id }
        });
    },

    /**
     * Notificação de importação CSV concluída
     * @param {Object} result - Resultado da importação
     */
    csvImportComplete(result) {
        const type = result.errors && result.errors.length > 0 ? 'warning' : 'success';
        return window.notificationPushService.show({
            type,
            title: 'Importação Concluída',
            message: `${result.success || 0} processo(s) importado(s)${result.errors?.length > 0 ? ` (${result.errors.length} erro(s))` : ''}`,
            icon: 'bi-file-earmark-arrow-up',
            duration: 6000,
            actions: [
                {
                    label: 'Ver Relatório',
                    icon: 'bi-file-text',
                    variant: 'primary',
                    handler: () => {
                        // Mostrar modal com detalhes da importação
                        if (window.csvImportModal) {
                            window.csvImportModal.showResults(result);
                        }
                    }
                }
            ],
            data: { importResult: result }
        });
    },

    /**
     * Notificação de sincronização do Firebase
     * @param {string} status - 'syncing', 'synced', 'error'
     */
    firebaseSync(status) {
        const configs = {
            syncing: {
                type: 'info',
                title: 'Sincronizando...',
                message: 'Atualizando dados do servidor',
                icon: 'bi-arrow-repeat',
                duration: 2000,
                sound: false
            },
            synced: {
                type: 'success',
                title: 'Sincronizado',
                message: 'Dados atualizados com sucesso',
                icon: 'bi-check-circle',
                duration: 2000,
                sound: false
            },
            error: {
                type: 'error',
                title: 'Erro de Sincronização',
                message: 'Não foi possível atualizar os dados',
                icon: 'bi-exclamation-triangle',
                duration: 4000,
                actions: [
                    {
                        label: 'Tentar Novamente',
                        icon: 'bi-arrow-clockwise',
                        variant: 'primary',
                        handler: () => {
                            location.reload();
                        }
                    }
                ]
            }
        };

        return window.notificationPushService.show({
            ...configs[status],
            groupKey: 'firebase-sync'
        });
    },

    /**
     * Notificação de batch operation (operação em lote)
     * @param {Object} result - Resultado da operação
     */
    batchOperation(result) {
        const type = result.failed > 0 ? 'warning' : 'success';
        return window.notificationPushService.show({
            type,
            title: 'Operação em Lote',
            message: `${result.success} atualizado(s)${result.failed > 0 ? `, ${result.failed} falha(s)` : ''}`,
            icon: 'bi-layers',
            duration: 5000,
            actions: result.failed > 0 ? [
                {
                    label: 'Ver Erros',
                    icon: 'bi-exclamation-circle',
                    variant: 'warning',
                    handler: () => {
                        console.error('Erros na operação em lote:', result.errors);
                        alert(`Erros:\n${result.errors.join('\n')}`);
                    }
                }
            ] : []
        });
    },

    /**
     * Notificação customizada de sistema
     * @param {string} message - Mensagem
     * @param {Object} options - Opções
     */
    system(message, options = {}) {
        return window.notificationPushService.show({
            type: 'info',
            title: options.title || 'Sistema',
            message,
            icon: options.icon || 'bi-gear',
            duration: options.duration || 4000,
            sound: false,
            ...options
        });
    }
};

// Expor globalmente
if (typeof window !== 'undefined') {
    window.NotificationPushHelpers = NotificationPushHelpers;
}

// Exemplos de uso (comentados para não executar automaticamente)
/*
// Sucesso simples
NotificationPushHelpers.success('Operação concluída!');

// Erro com título customizado
NotificationPushHelpers.error('Falha ao salvar', { title: 'Ops!' });

// SLA vencendo
NotificationPushHelpers.slaWarning(contract, 2);

// SLA vencido (crítico)
NotificationPushHelpers.slaOverdue(contract, 5);

// Aprovação pendente com ações
NotificationPushHelpers.approvalPending(contract);

// Novo comentário
NotificationPushHelpers.newComment({ author: 'João', text: 'Análise concluída' }, contract);

// Importação CSV
NotificationPushHelpers.csvImportComplete({ success: 10, errors: [] });

// Sincronização Firebase
NotificationPushHelpers.firebaseSync('synced');

// Operação em lote
NotificationPushHelpers.batchOperation({ success: 15, failed: 2, errors: ['Erro 1', 'Erro 2'] });
*/
