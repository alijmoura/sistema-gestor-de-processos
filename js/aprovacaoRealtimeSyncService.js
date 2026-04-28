/**
 * @fileoverview Sincronizacao em tempo real (modo delta) para aprovacoes.
 * Estrategia:
 * 1) Listener unico em realtimeAprovacaoNotifications
 * 2) Cada cliente busca apenas aprovacoes alteradas por ID
 * 3) Atualiza cache local e notifica listeners registrados
 */

import { db } from './auth.js';
import cacheService from './cacheService.js';
import listenerOptimizer from './listenerOptimizer.js';

class AprovacaoRealtimeSyncService {
  constructor() {
    this.listeners = new Map();
    this.notificationListener = null;
    this.notificationListenerId = 'aprovacao_realtime_notifications';
    this.pendingUpdates = new Map();
    this.flushTimeout = null;
    this.isActive = false;
    this.permissionDeniedAt = 0;

    this.config = {
      batchDelay: 500,
      maxNotificationAge: 30000
    };
  }

  async start() {
    if (this.isActive) return;
    const retryWindowMs = 5 * 60 * 1000;
    if (this.permissionDeniedAt && (Date.now() - this.permissionDeniedAt) < retryWindowMs) {
      if (window.__DEBUG__) {
        console.warn('[aprovacaoRealtimeSyncService] Listener pausado temporariamente após permission-denied');
      }
      return;
    }
    this.isActive = true;
    this.startNotificationListener();
  }

  stop() {
    if (!this.isActive) return;
    if (this.notificationListener) {
      this.notificationListener();
      this.notificationListener = null;
    }
    listenerOptimizer.unregisterListener(this.notificationListenerId);
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
    this.pendingUpdates.clear();
    this.listeners.clear();
    this.isActive = false;
  }

  startNotificationListener() {
    listenerOptimizer.unregisterListener(this.notificationListenerId);

    const notificationsRef = db.collection('realtimeAprovacaoNotifications')
      .where('timestamp', '>', new Date(Date.now() - this.config.maxNotificationAge))
      .orderBy('timestamp', 'desc')
      .limit(50);

    const optimizedListener = listenerOptimizer.registerListener(
      this.notificationListenerId,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            this.handleNotification(change.doc.data() || {});
          }
        });
      },
      { critical: true, throttle: false, immediateOnAdd: true }
    );

    const firestoreUnsubscribe = notificationsRef.onSnapshot(
      optimizedListener,
      (error) => {
        console.error('[aprovacaoRealtimeSyncService] Erro no listener:', error);
        if (error?.code === 'permission-denied') {
          this.permissionDeniedAt = Date.now();
          if (this.notificationListener) {
            this.notificationListener();
            this.notificationListener = null;
          }
        }
      }
    );

    listenerOptimizer.setUnsubscribe(this.notificationListenerId, firestoreUnsubscribe);
    this.notificationListener = () => {
      listenerOptimizer.unregisterListener(this.notificationListenerId);
    };
  }

  handleNotification(notification = {}) {
    const { aprovacaoId, timestamp, field, userId, type } = notification;
    if (!aprovacaoId) return;

    const currentUserId = window.currentUserAuth?.uid;
    const currentUserEmail = window.currentUserAuth?.email;
    const normalizedUserId = String(userId || '').trim().toLowerCase();
    const currentUserIdentities = [currentUserId, currentUserEmail]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);

    if (normalizedUserId && currentUserIdentities.includes(normalizedUserId)) {
      return;
    }

    const ts = timestamp?.toMillis ? timestamp.toMillis() : Number(timestamp || 0);
    if (ts && (Date.now() - ts) > this.config.maxNotificationAge) {
      return;
    }

    this.pendingUpdates.set(aprovacaoId, {
      aprovacaoId,
      field: field || 'general',
      type: type || 'update',
      timestamp: Date.now()
    });
    this.scheduleFlush();
  }

  scheduleFlush() {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }
    this.flushTimeout = setTimeout(() => this.flushPendingUpdates(), this.config.batchDelay);
  }

  async flushPendingUpdates() {
    if (this.pendingUpdates.size === 0) return;

    const updates = Array.from(this.pendingUpdates.values());
    this.pendingUpdates.clear();

    const deletedIds = updates
      .filter((item) => item.type === 'delete')
      .map((item) => item.aprovacaoId)
      .filter(Boolean);

    deletedIds.forEach((aprovacaoId) => {
      cacheService.invalidate(`aprovacao_${aprovacaoId}`);
    });

    const idsToFetch = updates
      .filter((item) => item.type !== 'delete')
      .map((item) => item.aprovacaoId);

    const aprovacoes = await this.fetchAprovacoesBatch(idsToFetch);
    aprovacoes.forEach((aprovacao) => {
      cacheService.set(`aprovacao_${aprovacao.id}`, aprovacao, 'aprovacoes');
    });

    this.notifyListeners(aprovacoes, updates);
    window.dispatchEvent(new CustomEvent('realtime-aprovacao-updated', {
      detail: { aprovacoes, updates }
    }));
  }

  async fetchAprovacoesBatch(aprovacaoIds = []) {
    if (!Array.isArray(aprovacaoIds) || aprovacaoIds.length === 0) return [];

    const uniqueIds = Array.from(new Set(aprovacaoIds.filter(Boolean)));
    const loaded = [];
    for (let i = 0; i < uniqueIds.length; i += 10) {
      const batchIds = uniqueIds.slice(i, i + 10);
      const snapshot = await db.collection('aprovacoes')
        .where(firebase.firestore.FieldPath.documentId(), 'in', batchIds)
        .get();

      snapshot.docs.forEach((doc) => {
        const rawData = { id: doc.id, ...doc.data() };
        loaded.push({
          ...rawData,
          analistaAprovacao: rawData.analistaAprovacao || rawData.analistaResponsavel || ''
        });
      });
    }

    return loaded;
  }

  registerListener(id, callback) {
    this.listeners.set(id, callback);
    return () => {
      this.listeners.delete(id);
    };
  }

  notifyListeners(aprovacoes, updates) {
    this.listeners.forEach((callback) => {
      try {
        callback({ aprovacoes, updates });
      } catch (error) {
        console.error('[aprovacaoRealtimeSyncService] Erro no callback:', error);
      }
    });
  }

  async publishUpdate(aprovacaoId, field = 'general', type = 'update') {
    try {
      const userId = window.currentUserAuth?.uid;
      if (!userId || !aprovacaoId) return;

      await db.collection('realtimeAprovacaoNotifications').add({
        aprovacaoId,
        field,
        type,
        userId,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('[aprovacaoRealtimeSyncService] Erro ao publicar notificacao:', error);
    }
  }
}

const aprovacaoRealtimeSyncService = new AprovacaoRealtimeSyncService();

if (typeof window !== 'undefined') {
  window.addEventListener('auth-state-changed', (event) => {
    if (event.detail?.user) {
      aprovacaoRealtimeSyncService.start();
    } else {
      aprovacaoRealtimeSyncService.stop();
    }
  });
}

export default aprovacaoRealtimeSyncService;
