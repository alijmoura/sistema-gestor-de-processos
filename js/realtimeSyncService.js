/**
 * @fileoverview Serviço de Sincronização em Tempo Real Otimizado
 * @description Sistema eficiente para sincronizar mudanças entre usuários sem leituras excessivas
 * 
 * Estratégia:
 * 1. Listener único para coleção de "notificações" (documentos pequenos)
 * 2. Quando um contrato muda, cria notificação com apenas: {contractId, timestamp, field}
 * 3. Outros clientes recebem notificação e buscam apenas o documento específico (1 leitura)
 * 4. Cache local evita leituras desnecessárias
 * 
 * Economia: Em vez de N leituras (todos os contratos), apenas 1 notificação + 1 leitura do contrato específico
 */

import { db } from './auth.js';
import cacheService from './cacheService.js';

function resolveRealtimeActorIdentity() {
  const profile = window.appState?.currentUserProfile || window.userProfile || {};
  const shortName = String(profile.shortName || '').trim();
  if (shortName) {
    return {
      actorDisplayName: shortName,
      actorEmail: String(profile.email || window.currentUserAuth?.email || '').trim()
    };
  }

  const fullName = String(profile.fullName || '').trim();
  if (fullName) {
    return {
      actorDisplayName: fullName,
      actorEmail: String(profile.email || window.currentUserAuth?.email || '').trim()
    };
  }

  const email = String(profile.email || window.currentUserAuth?.email || '').trim();
  return {
    actorDisplayName: email || 'Usuario',
    actorEmail: email
  };
}

class RealtimeSyncService {
  constructor() {
    this.listeners = new Map();
    this.notificationListener = null;
    this.pendingUpdates = new Map(); // Buffer para agrupar atualizações
    this.flushTimeout = null;
    this.isActive = false;
    this.permissionDeniedAt = 0;
    
    // Configurações
    this.config = {
      batchDelay: 500, // Agrupa atualizações em 500ms
      maxNotificationAge: 30000, // Ignora notificações antigas (30s)
      cleanupInterval: 60000 // Limpa notificações antigas a cada 1min
    };
  }

  /**
   * Inicia o serviço de sincronização
   */
  async start() {
    if (this.isActive) {
      console.log('⚡ RealtimeSync já está ativo');
      return;
    }

    // Evita loop de inicialização quando o backend nega acesso ao usuário atual.
    const retryWindowMs = 5 * 60 * 1000;
    if (this.permissionDeniedAt && (Date.now() - this.permissionDeniedAt) < retryWindowMs) {
      if (window.__DEBUG__) {
        console.warn('⚡ RealtimeSync pausado temporariamente após permission-denied');
      }
      return;
    }

    this.isActive = true;
    console.log('⚡ Iniciando RealtimeSync...');

    // Listener para notificações de mudanças
    this.startNotificationListener();
    
    // Limpeza periódica de notificações antigas
    this.startCleanupTask();
  }

  /**
   * Para o serviço
   */
  stop() {
    if (!this.isActive) return;

    console.log('⚡ Parando RealtimeSync...');
    
    if (this.notificationListener) {
      this.notificationListener();
      this.notificationListener = null;
    }

    if (this.cleanupTask) {
      clearInterval(this.cleanupTask);
      this.cleanupTask = null;
    }

    this.listeners.clear();
    this.pendingUpdates.clear();
    this.isActive = false;
  }

  /**
   * Listener para notificações de mudanças (coleção lightweight)
   */
  startNotificationListener() {
    const notificationsRef = db.collection('realtimeNotifications')
      .where('timestamp', '>', new Date(Date.now() - this.config.maxNotificationAge))
      .orderBy('timestamp', 'desc')
      .limit(50); // Últimas 50 notificações apenas

    this.notificationListener = notificationsRef.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          this.handleNotification(change.doc.data());
        }
      });
    }, (error) => {
      console.error('⚡ Erro no listener de notificações:', error);
      if (error?.code === 'permission-denied') {
        this.permissionDeniedAt = Date.now();
        if (this.notificationListener) {
          this.notificationListener();
          this.notificationListener = null;
        }
      }
    });

    console.log('⚡ Listener de notificações iniciado');
  }

  /**
   * Processa uma notificação recebida
   */
  async handleNotification(notification) {
    const {
      contractId,
      timestamp,
      field,
      userId,
      type,
      actorDisplayName,
      actorEmail
    } = notification;

    // Ignora notificações próprias (para evitar loops)
    const currentUserId = window.currentUserAuth?.uid;
    if (userId === currentUserId) {
      return;
    }

    // Ignora notificações muito antigas
    const age = Date.now() - (timestamp?.toMillis ? timestamp.toMillis() : timestamp);
    if (age > this.config.maxNotificationAge) {
      return;
    }

    console.log(`⚡ Notificação recebida: ${type} em ${contractId}`, field);

    // Adiciona ao buffer de atualizações pendentes
    this.pendingUpdates.set(contractId, {
      contractId,
      field,
      type,
      timestamp: Date.now(),
      actorDisplayName: String(actorDisplayName || '').trim(),
      actorEmail: String(actorEmail || '').trim()
    });

    // Agenda flush (agrupado)
    this.scheduleFlush();
  }

  /**
   * Agenda flush de atualizações (debounced)
   */
  scheduleFlush() {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }

    this.flushTimeout = setTimeout(() => {
      this.flushPendingUpdates();
    }, this.config.batchDelay);
  }

  /**
   * Processa todas as atualizações pendentes
   */
  async flushPendingUpdates() {
    if (this.pendingUpdates.size === 0) return;

    const updates = Array.from(this.pendingUpdates.values());
    this.pendingUpdates.clear();

    console.log(`⚡ Processando ${updates.length} atualizações...`);

    const deletedContractIds = updates
      .filter((update) => update?.type === 'delete')
      .map((update) => update.contractId)
      .filter(Boolean);

    deletedContractIds.forEach((contractId) => {
      cacheService.invalidate(`contract_${contractId}`);
    });

    // Busca contratos alterados (batch) sempre no Firestore para evitar aplicar cache obsoleto.
    const contractIds = updates
      .filter((update) => update?.type !== 'delete')
      .map((update) => update.contractId)
      .filter(Boolean);
    const updatedContracts = await this.fetchContractsBatch(contractIds);

    // Atualiza cache
    updatedContracts.forEach(contract => {
      cacheService.set(`contract_${contract.id}`, contract, 'contracts');
    });

    // Notifica listeners registrados
    this.notifyListeners(updatedContracts, updates);

    // Dispara evento global
    window.dispatchEvent(new CustomEvent('realtime-contract-updated', {
      detail: { contracts: updatedContracts, updates }
    }));
  }

  /**
   * Busca múltiplos contratos em batch (otimizado)
   */
  async fetchContractsBatch(contractIds) {
    if (contractIds.length === 0) return [];

    const uniqueIds = Array.from(new Set(contractIds.filter(Boolean)));
    console.log(`⚡ Buscando ${uniqueIds.length} contratos atualizados do Firestore`);

    const contracts = [];
    for (let i = 0; i < uniqueIds.length; i += 10) {
      const batch = uniqueIds.slice(i, i + 10);
      const snapshot = await db.collection('contracts')
        .where(firebase.firestore.FieldPath.documentId(), 'in', batch)
        .get();
      
      snapshot.docs.forEach(doc => {
        contracts.push({ id: doc.id, ...doc.data() });
      });
    }

    return contracts;
  }

  /**
   * Registra um listener para receber atualizações
   */
  registerListener(id, callback) {
    this.listeners.set(id, callback);
    console.log(`⚡ Listener registrado: ${id}`);
    
    return () => {
      this.listeners.delete(id);
      console.log(`⚡ Listener removido: ${id}`);
    };
  }

  /**
   * Notifica todos os listeners registrados
   */
  notifyListeners(contracts, updates) {
    this.listeners.forEach((callback, id) => {
      try {
        callback({ contracts, updates });
      } catch (error) {
        console.error(`⚡ Erro ao notificar listener ${id}:`, error);
      }
    });
  }

  /**
   * Publica uma notificação de mudança (chamado após update)
   */
  async publishUpdate(contractId, field = 'general', type = 'update') {
    try {
      const userId = window.currentUserAuth?.uid;
      if (!userId) return;
      const actorIdentity = resolveRealtimeActorIdentity();

      await db.collection('realtimeNotifications').add({
        contractId,
        field,
        type,
        userId,
        actorDisplayName: actorIdentity.actorDisplayName,
        actorEmail: actorIdentity.actorEmail,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log(`⚡ Notificação publicada: ${type} em ${contractId}`);
    } catch (error) {
      console.error('⚡ Erro ao publicar notificação:', error);
    }
  }

  /**
   * Limpeza periódica de notificações antigas
   */
  startCleanupTask() {
    this.cleanupTask = setInterval(async () => {
      try {
        const cutoff = new Date(Date.now() - this.config.maxNotificationAge * 2);
        const snapshot = await db.collection('realtimeNotifications')
          .where('timestamp', '<', cutoff)
          .limit(100)
          .get();

        if (snapshot.empty) return;

        const batch = db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });

        await batch.commit();
        console.log(`⚡ Limpou ${snapshot.size} notificações antigas`);
      } catch (error) {
        if (error?.code === 'permission-denied') {
          // Não-admin pode não ter permissão para varrer/deletar notificações antigas.
          // Evita erro em loop e mantém o listener principal ativo.
          this.permissionDeniedAt = Date.now();
          clearInterval(this.cleanupTask);
          this.cleanupTask = null;
          console.warn('⚡ Limpeza de notificações desativada para este usuário (permission-denied)');
          return;
        }
        console.error('⚡ Erro na limpeza de notificações:', error);
      }
    }, this.config.cleanupInterval);
  }
}

// Instância singleton
const realtimeSyncService = new RealtimeSyncService();

// Inicializa automaticamente quando autenticado
if (typeof window !== 'undefined') {
  window.addEventListener('auth-state-changed', (event) => {
    if (event.detail?.user) {
      realtimeSyncService.start();
    } else {
      realtimeSyncService.stop();
    }
  });
}

export default realtimeSyncService;
