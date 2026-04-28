/**
 * @fileoverview Wrapper para integrar RealtimeSync ao firestoreService
 * @description Intercepta updates de contratos e publica notificacoes
 */

import realtimeSyncService from './realtimeSyncService.js';

/**
 * Wrapper para updateContract que publica notificacao de mudanca
 */
export function createRealtimeSyncWrapper(originalUpdateFn) {
  return async function updateContractWithSync(contractId, updates, ...args) {
    const result = await originalUpdateFn(contractId, updates, ...args);

    const changedFields = Object.keys(updates);
    const primaryField = changedFields[0] || 'general';

    realtimeSyncService.publishUpdate(
      contractId,
      primaryField,
      'update'
    ).catch((err) => {
      console.warn('RealtimeSync: erro ao publicar notificacao (nao critico):', err);
    });

    return result;
  };
}

/**
 * Hook para integrar no main.js
 */
export function initRealtimeSync() {
  console.log('RealtimeSync: inicializando sincronizacao em tempo real...');

  const unsubscribe = realtimeSyncService.registerListener('main-app', ({ contracts, updates }) => {
    console.log(`RealtimeSync: recebidas ${contracts.length} atualizacoes de outros usuarios`);
    const actorNames = Array.from(new Set(
      (updates || [])
        .map((update) => String(update.actorDisplayName || update.actorEmail || '').trim())
        .filter(Boolean)
    ));

    if (typeof window.applyRealtimeContractDelta === 'function') {
      window.applyRealtimeContractDelta({
        contracts,
        updates,
        source: 'realtime-sync'
      }).catch((error) => {
        console.error('RealtimeSync: falha ao aplicar delta em tempo real:', error);
      });
    } else {
      const currentView = window.getCurrentView?.();
      if (currentView === 'kanban') {
        window.dispatchEvent(new CustomEvent('kanban-contracts-updated', {
          detail: { count: contracts.length, isUpdate: true, source: 'realtime-sync-fallback' }
        }));
      } else if (currentView === 'list') {
        window.dispatchEvent(new CustomEvent('list-contracts-updated', {
          detail: { count: contracts.length, isUpdate: true, source: 'realtime-sync-fallback' }
        }));
      }
    }

    if (window.uiHelpers?.showToast && contracts.length > 0) {
      const actorSuffix = actorNames.length === 1
        ? ` por ${actorNames[0]}`
        : actorNames.length > 1
          ? ' por outros usuarios'
          : '';
      window.uiHelpers.showToast(
        `${contracts.length} processo(s) atualizado(s)${actorSuffix}`,
        'info',
        3000
      );
    }
  });

  console.log('RealtimeSync: sistema pronto');

  return unsubscribe;
}

export default {
  createRealtimeSyncWrapper,
  initRealtimeSync
};
