import { db, auth, storage } from './auth.js';

const ACTION_TYPES = [
  'STATUS_CHANGE',
  'BULK_STATUS_CHANGE',
  'NEW_APPROVAL',
  'APPROVAL_DELETED',
  'EXPORT_REPORT',
  'CSV_IMPORT',
  'WHATSAPP_MSG',
  'WHATSAPP_CHAT_ASSIGNED',
  'WHATSAPP_CHAT_TRANSFERRED',
  'WHATSAPP_CHAT_RESOLVED',
  'WHATSAPP_CHAT_REOPENED',
  'WHATSAPP_CHAT_EXPORTED',
  'CONTRACT_ARCHIVED',
  'CONTRACT_ADDED',
  'CONTRACT_DELETED'
];

const ACTION_LABELS = {
  STATUS_CHANGE: 'Mudanca de Status',
  BULK_STATUS_CHANGE: 'Mudanca de Status em Lote',
  NEW_APPROVAL: 'Nova Analise',
  APPROVAL_DELETED: 'Exclusao de Analise',
  EXPORT_REPORT: 'Exportacao',
  CSV_IMPORT: 'Importacao CSV',
  WHATSAPP_MSG: 'Mensagem WhatsApp',
  WHATSAPP_CHAT_ASSIGNED: 'Atendimento Assumido',
  WHATSAPP_CHAT_TRANSFERRED: 'Transferencia WhatsApp',
  WHATSAPP_CHAT_RESOLVED: 'Atendimento Finalizado',
  WHATSAPP_CHAT_REOPENED: 'Atendimento Reaberto',
  WHATSAPP_CHAT_EXPORTED: 'Exportacao de Conversa',
  CONTRACT_ARCHIVED: 'Arquivamento',
  CONTRACT_ADDED: 'Novo Processo',
  CONTRACT_DELETED: 'Exclusao de Processo'
};

const USER_PROFILE_STORAGE_PREFIX = 'userProfile_';
const userProfileCache = new Map();
const userEmailCache = new Map();
const contractNameCache = new Map();
const SAFE_ACTIVITY_FIELDS = [
  'module',
  'page',
  'entityType',
  'entityLabel',
  'actorName',
  'actorEmail',
  'actorUid',
  'oldValue',
  'newValue',
  'filename',
  'rowCount',
  'storagePath',
  'storageDownloadUrl',
  'mimeType',
  'fileSize'
];

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeString(value));
}

function resolveProfileDisplayName(profile, fallback = '') {
  const safeProfile = profile && typeof profile === 'object' ? profile : {};
  return normalizeString(
    safeProfile.shortName
    || safeProfile.fullName
    || safeProfile.displayName
    || safeProfile.nome
    || safeProfile.name
    || fallback
  );
}

function isGenericProcessName(value) {
  const normalized = normalizeString(value).toLowerCase();
  return !normalized || normalized === 'contrato' || normalized === 'processo';
}

function sanitizeFileName(fileName, fallback = 'arquivo.txt') {
  const normalized = normalizeString(fileName).replace(/[<>:"/\\|?*]+/g, '_');
  return normalized || fallback;
}

function sanitizeStorageSegment(segment, fallback = 'geral') {
  const normalized = normalizeString(segment)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function cloneExtraData(extraData = {}) {
  if (!extraData || typeof extraData !== 'object' || Array.isArray(extraData)) {
    return {};
  }
  return { ...extraData };
}

function buildSnapshotFields(extraData = {}, identity = {}) {
  const safeExtraData = cloneExtraData(extraData);
  const actorName = normalizeString(safeExtraData.actorName || identity.userName || safeExtraData.userName || '');
  const actorEmail = normalizeEmail(safeExtraData.actorEmail || identity.userEmail || safeExtraData.userEmail || '');
  const actorUid = normalizeString(safeExtraData.actorUid || identity.userUid || safeExtraData.userUid || '');

  return {
    actorName: actorName || null,
    actorEmail: actorEmail || null,
    actorUid: actorUid || null,
    module: normalizeString(safeExtraData.module || safeExtraData.sourceModule || safeExtraData.source || '') || null,
    page: normalizeString(safeExtraData.page || '') || null,
    entityType: normalizeString(safeExtraData.entityType || '') || null,
    entityLabel: normalizeString(
      safeExtraData.entityLabel
      || safeExtraData.primaryBuyerName
      || safeExtraData.processoName
      || safeExtraData.clientePrincipal
      || safeExtraData.customerName
      || ''
    ) || null,
    oldValue: normalizeString(safeExtraData.oldValue || safeExtraData.oldStatus || '') || null,
    newValue: normalizeString(safeExtraData.newValue || safeExtraData.newStatus || '') || null,
    filename: normalizeString(safeExtraData.filename || '') || null,
    rowCount: normalizeNumber(safeExtraData.rowCount, null),
    storagePath: normalizeString(safeExtraData.storagePath || '') || null,
    storageDownloadUrl: normalizeString(safeExtraData.storageDownloadUrl || '') || null,
    mimeType: normalizeString(safeExtraData.mimeType || '') || null,
    fileSize: normalizeNumber(safeExtraData.fileSize, null)
  };
}

function readStoredProfile(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getLocalCurrentUserProfile(user) {
  const appProfile = window.appState?.currentUserProfile || null;
  if (appProfile && (!user?.uid || !appProfile.uid || appProfile.uid === user.uid)) {
    return appProfile;
  }

  const storedByUid = user?.uid ? readStoredProfile(`${USER_PROFILE_STORAGE_PREFIX}${user.uid}`) : null;
  if (storedByUid) return storedByUid;

  return readStoredProfile('userProfile');
}

async function fetchUserProfileByUid(uid) {
  const normalizedUid = normalizeString(uid);
  if (!normalizedUid || !db) return null;
  if (userProfileCache.has(normalizedUid)) {
    return userProfileCache.get(normalizedUid);
  }

  try {
    const doc = await db.collection('users').doc(normalizedUid).get();
    const profile = doc.exists ? { uid: doc.id, ...doc.data() } : null;
    userProfileCache.set(normalizedUid, profile);
    const email = normalizeEmail(profile?.email);
    if (email) userEmailCache.set(email, profile);
    return profile;
  } catch (error) {
    console.warn('[activityLogService] Falha ao resolver perfil por UID:', error);
    userProfileCache.set(normalizedUid, null);
    return null;
  }
}

async function fetchUserProfileByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !db) return null;
  if (userEmailCache.has(normalizedEmail)) {
    return userEmailCache.get(normalizedEmail);
  }

  try {
    const snapshot = await db.collection('users')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    const profile = doc ? { uid: doc.id, ...doc.data() } : null;
    userEmailCache.set(normalizedEmail, profile);
    if (profile?.uid) userProfileCache.set(profile.uid, profile);
    return profile;
  } catch (error) {
    console.warn('[activityLogService] Falha ao resolver perfil por e-mail:', error);
    userEmailCache.set(normalizedEmail, null);
    return null;
  }
}

async function resolveCurrentUserIdentity(user) {
  if (!user) {
    return {
      userName: 'Sistema',
      userEmail: 'sistema',
      userUid: null
    };
  }

  const fallbackName = user.displayName || user.email || 'Usuario';
  let profile = getLocalCurrentUserProfile(user);
  if (!profile && user.uid) {
    profile = await fetchUserProfileByUid(user.uid);
  }

  return {
    userName: resolveProfileDisplayName(profile, fallbackName) || fallbackName,
    userEmail: user.email || profile?.email || 'sistema',
    userUid: user.uid || null
  };
}

async function resolveActivityUserDisplay(activity) {
  const email = activity.userEmail || (isEmailLike(activity.userName) ? activity.userName : '');
  const uid = activity.userUid || activity.actorUid || activity.uid || null;
  const fallback = activity.actorName || activity.userName || email || 'Sistema';

  if (normalizeEmail(email) === 'sistema' || normalizeString(fallback).toLowerCase() === 'sistema') {
    return fallback || 'Sistema';
  }

  let profile = uid ? await fetchUserProfileByUid(uid) : null;
  if (!profile && email) {
    profile = await fetchUserProfileByEmail(email);
  }

  return resolveProfileDisplayName(profile, fallback) || fallback;
}

async function fetchContractDisplayNameById(contractId) {
  const normalizedId = normalizeString(contractId);
  if (!normalizedId || !db) return '';
  if (contractNameCache.has(normalizedId)) {
    return contractNameCache.get(normalizedId);
  }

  const collections = ['contracts', 'archivedContracts'];
  for (const collectionName of collections) {
    try {
      const doc = await db.collection(collectionName).doc(normalizedId).get();
      if (doc.exists) {
        const data = doc.data();
        const displayName = normalizeString(
          data.clientePrincipal
          || data.cliente
          || data.nomeClientePrincipal
          || data.customerName
        );
        contractNameCache.set(normalizedId, displayName);
        return displayName;
      }
    } catch (error) {
      console.warn(`[activityLogService] Falha ao resolver processo em ${collectionName}:`, error);
    }
  }

  contractNameCache.set(normalizedId, '');
  return '';
}

function normalizeActivity(activityDoc) {
  const data = activityDoc.data();
  return {
    id: activityDoc.id,
    ...data,
    timestamp: normalizeDate(data.timestamp)
  };
}

function buildQueryCursor(startAfter) {
  if (!startAfter) return null;
  if (startAfter instanceof Object && (startAfter._document || startAfter._delegate)) {
    return startAfter;
  }
  const timestamp = normalizeDate(startAfter.timestamp);
  if (!timestamp) return null;
  return {
    timestamp,
    id: normalizeString(startAfter.id || '')
  };
}

function toBlobPayload(blobOrText, mimeType = 'text/plain;charset=utf-8;') {
  if (blobOrText instanceof Blob) {
    return {
      blob: blobOrText,
      size: Number(blobOrText.size || 0),
      mimeType: blobOrText.type || mimeType
    };
  }

  if (typeof blobOrText === 'string') {
    const blob = new Blob([blobOrText], { type: mimeType });
    return { blob, size: Number(blob.size || 0), mimeType };
  }

  if (blobOrText && typeof blobOrText === 'object') {
    const serialized = JSON.stringify(blobOrText, null, 2);
    const blob = new Blob([serialized], { type: mimeType || 'application/json;charset=utf-8;' });
    return {
      blob,
      size: Number(blob.size || 0),
      mimeType: mimeType || 'application/json;charset=utf-8;'
    };
  }

  const blob = new Blob([''], { type: mimeType });
  return { blob, size: 0, mimeType };
}

async function enrichActivityWithProcessName(activity) {
  if (!['STATUS_CHANGE', 'BULK_STATUS_CHANGE', 'CONTRACT_ADDED', 'CONTRACT_DELETED', 'CONTRACT_ARCHIVED'].includes(activity.actionType)) {
    return activity;
  }

  const currentName = activity.entityLabel
    || activity.extraData?.primaryBuyerName
    || activity.extraData?.processoName
    || activity.extraData?.clientePrincipal
    || '';

  if (!isGenericProcessName(currentName)) {
    return activity;
  }

  const resolvedName = await fetchContractDisplayNameById(activity.relatedEntityId || activity.entityId);
  if (!resolvedName) {
    return activity;
  }

  return {
    ...activity,
    entityLabel: activity.entityLabel || resolvedName,
    extraData: {
      ...(activity.extraData || {}),
      processoName: resolvedName,
      primaryBuyerName: resolvedName
    }
  };
}

async function enrichActivitiesWithUserProfiles(activities = []) {
  return Promise.all((activities || []).map(async (activity) => {
    const originalUserName = activity.userName || '';
    const userDisplayName = await resolveActivityUserDisplay(activity);
    return enrichActivityWithProcessName({
      ...activity,
      actorName: activity.actorName || userDisplayName,
      actorEmail: activity.actorEmail || activity.userEmail || null,
      actorUid: activity.actorUid || activity.userUid || null,
      originalUserName,
      userDisplayName,
      userName: userDisplayName
    });
  }));
}

function prepareActivityWithoutEnrichment(activity = {}) {
  const fallbackUserName = activity.actorName
    || activity.userName
    || activity.userEmail
    || 'Sistema';

  return {
    ...activity,
    actorName: activity.actorName || fallbackUserName,
    actorEmail: activity.actorEmail || activity.userEmail || null,
    actorUid: activity.actorUid || activity.userUid || null,
    originalUserName: activity.userName || '',
    userDisplayName: fallbackUserName,
    userName: fallbackUserName
  };
}

export const activityLogService = {
  async waitForCurrentUserContext(timeoutMs = 5000) {
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < timeoutMs) {
      if (auth?.currentUser?.uid || window.appState?.userPermissions || window.appState?.currentUserProfile) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  },

  async isCurrentUserAdmin() {
    const role = normalizeString(window.appState?.userPermissions?.role).toLowerCase();
    if (role === 'admin' || role === 'super_admin') {
      return true;
    }

    try {
      if (window.firestoreService?.isCurrentUserAdmin) {
        return !!(await window.firestoreService.isCurrentUserAdmin());
      }
    } catch (error) {
      console.warn('[activityLogService] Falha ao verificar admin via firestoreService:', error);
    }

    try {
      const tokenResult = await auth?.currentUser?.getIdTokenResult?.();
      return tokenResult?.claims?.admin === true;
    } catch (error) {
      console.warn('[activityLogService] Falha ao verificar admin via token:', error);
    }

    return false;
  },

  getActivityTypeLabel(actionType) {
    return ACTION_LABELS[actionType] || actionType || 'Desconhecido';
  },

  getProcessName(activity = {}) {
    return normalizeString(
      activity.entityLabel
      || activity.extraData?.primaryBuyerName
      || activity.extraData?.processoName
      || activity.extraData?.clientePrincipal
      || ''
    );
  },

  formatActivityDescription(activity = {}) {
    const processName = this.getProcessName(activity);
    const oldStatus = normalizeString(activity.extraData?.oldStatus || activity.oldValue || 'Nenhum') || 'Nenhum';
    const newStatus = normalizeString(activity.extraData?.newStatus || activity.newValue || 'Nenhum') || 'Nenhum';
    const customerName = normalizeString(activity.extraData?.customerName || activity.entityLabel || '');
    const phoneNumber = normalizeString(activity.extraData?.phoneNumber || activity.relatedEntityId || '');
    const previousAgentName = normalizeString(activity.extraData?.previousAgentName || '');
    const newAgentName = normalizeString(activity.extraData?.newAgentName || '');
    const reason = normalizeString(activity.extraData?.reason || activity.extraData?.resolutionReason || '');
    const fileName = normalizeString(activity.filename || activity.extraData?.filename || '');
    const rowCount = normalizeNumber(activity.rowCount ?? activity.extraData?.rowCount, null);

    switch (activity.actionType) {
      case 'STATUS_CHANGE':
        return processName
          ? `Status alterado: ${oldStatus} -> ${newStatus}`
          : `Status alterado: ${oldStatus} -> ${newStatus}`;
      case 'BULK_STATUS_CHANGE':
        return processName
          ? `Status alterado em lote: ${oldStatus} -> ${newStatus}`
          : `Status alterado em lote: ${oldStatus} -> ${newStatus}`;
      case 'NEW_APPROVAL':
        return processName
          ? `Nova analise cadastrada`
          : (activity.description || 'Nova analise cadastrada');
      case 'APPROVAL_DELETED':
        return processName
          ? `Analise excluida`
          : (activity.description || 'Analise excluida');
      case 'CONTRACT_ADDED':
        return processName
          ? `Novo processo cadastrado`
          : (activity.description || 'Novo processo cadastrado');
      case 'CONTRACT_DELETED':
        return processName
          ? `Processo excluido`
          : (activity.description || 'Processo excluido');
      case 'CSV_IMPORT':
        return fileName
          ? `Importacao CSV registrada: ${fileName}`
          : (activity.description || 'Importacao CSV registrada');
      case 'EXPORT_REPORT':
        if (fileName && rowCount !== null) {
          return `Arquivo exportado: ${fileName} (${rowCount} registros)`;
        }
        if (fileName) {
          return `Arquivo exportado: ${fileName}`;
        }
        return activity.description || 'Arquivo exportado';
      case 'WHATSAPP_MSG':
        return `Nova mensagem de WhatsApp de ${customerName || phoneNumber || 'cliente nao identificado'}`;
      case 'WHATSAPP_CHAT_ASSIGNED':
        return `Conversa assumida por ${newAgentName || activity.actorName || activity.userDisplayName || 'agente'}`;
      case 'WHATSAPP_CHAT_TRANSFERRED':
        if (previousAgentName && newAgentName) {
          return `Conversa transferida de ${previousAgentName} para ${newAgentName}`;
        }
        if (newAgentName) {
          return `Conversa transferida para ${newAgentName}`;
        }
        return activity.description || 'Conversa transferida';
      case 'WHATSAPP_CHAT_RESOLVED':
        return reason
          ? `Conversa finalizada por ${activity.actorName || activity.userDisplayName || 'agente'} - motivo: ${reason}`
          : (activity.description || 'Conversa finalizada');
      case 'WHATSAPP_CHAT_REOPENED':
        return `Conversa reaberta por ${activity.actorName || activity.userDisplayName || 'agente'}`;
      case 'WHATSAPP_CHAT_EXPORTED':
        if (rowCount !== null) {
          return `Conversa exportada (${rowCount} mensagens)`;
        }
        return activity.description || 'Conversa exportada';
      default:
        return activity.description || '--';
    }
  },

  buildActivityDetailRows(activity = {}) {
    const rows = [];
    const processName = this.getProcessName(activity);
    const fileName = normalizeString(activity.filename || activity.extraData?.filename || '');
    const phoneNumber = normalizeString(activity.extraData?.phoneNumber || '');
    const reason = normalizeString(activity.extraData?.reason || activity.extraData?.resolutionReason || '');
    const previousAgentName = normalizeString(activity.extraData?.previousAgentName || '');
    const newAgentName = normalizeString(activity.extraData?.newAgentName || '');
    const rowCount = normalizeNumber(activity.rowCount ?? activity.extraData?.rowCount, null);

    if (processName && !['WHATSAPP_MSG', 'WHATSAPP_CHAT_ASSIGNED', 'WHATSAPP_CHAT_TRANSFERRED', 'WHATSAPP_CHAT_RESOLVED', 'WHATSAPP_CHAT_REOPENED', 'WHATSAPP_CHAT_EXPORTED'].includes(activity.actionType)) {
      rows.push({ label: 'Processo', value: processName });
    }

    if ((activity.actionType === 'STATUS_CHANGE' || activity.actionType === 'BULK_STATUS_CHANGE') && activity.extraData?.oldStatus && activity.extraData?.newStatus) {
      rows.push({
        label: 'Status',
        value: `${activity.extraData.oldStatus} -> ${activity.extraData.newStatus}`
      });
    }

    if (activity.actionType === 'NEW_APPROVAL' && activity.extraData?.situacao) {
      rows.push({ label: 'Situacao', value: activity.extraData.situacao });
    }

    if (fileName) {
      rows.push({ label: 'Arquivo', value: fileName });
    }

    if (rowCount !== null) {
      rows.push({ label: 'Linhas', value: String(rowCount) });
    }

    if (phoneNumber) {
      rows.push({ label: 'Telefone', value: phoneNumber });
    }

    if (previousAgentName || newAgentName) {
      rows.push({
        label: 'Transferencia',
        value: previousAgentName && newAgentName
          ? `${previousAgentName} -> ${newAgentName}`
          : (newAgentName || previousAgentName)
      });
    }

    if (reason) {
      rows.push({ label: 'Motivo', value: reason });
    }

    return rows;
  },

  async logActivity(actionType, description, relatedEntityId = null, extraData = {}) {
    try {
      if (!db) {
        console.warn('[activityLogService] DB nao inicializado. Atividade nao registrada.');
        return null;
      }

      const user = auth?.currentUser || null;
      const identity = await resolveCurrentUserIdentity(user);
      const safeExtraData = cloneExtraData(extraData);
      const snapshots = buildSnapshotFields(safeExtraData, identity);

      const payload = {
        actionType,
        description,
        relatedEntityId,
        extraData: safeExtraData,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        userName: identity.userName || 'Sistema',
        userEmail: identity.userEmail || 'sistema',
        userUid: identity.userUid || null
      };

      SAFE_ACTIVITY_FIELDS.forEach((field) => {
        if (snapshots[field] !== undefined) {
          payload[field] = snapshots[field];
        }
      });

      if (!payload.actorName) payload.actorName = payload.userName;
      if (!payload.actorEmail) payload.actorEmail = payload.userEmail;
      if (!payload.actorUid) payload.actorUid = payload.userUid;

      const docRef = await db.collection('activity_logs').add(payload);
      return docRef.id;
    } catch (error) {
      console.error('[activityLogService] Erro ao registrar log de atividade:', error);
      return null;
    }
  },

  async getCurrentUserActivityIdentity() {
    const user = auth?.currentUser || null;
    return resolveCurrentUserIdentity(user);
  },

  downloadBlob(blob, filename) {
    const link = document.createElement('a');
    const href = URL.createObjectURL(blob);
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  },

  async saveAuditFile({
    module = 'geral',
    actionType = 'EXPORT_REPORT',
    filename = 'arquivo.txt',
    blobOrText = '',
    mimeType = 'text/plain;charset=utf-8;',
    relatedEntityId = null,
    metadata = {}
  } = {}) {
    if (!storage) {
      throw new Error('Storage nao inicializado.');
    }

    const user = auth?.currentUser || null;
    if (!user?.uid) {
      throw new Error('Usuario nao autenticado para salvar arquivo de auditoria.');
    }

    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const safeModule = sanitizeStorageSegment(module);
    const safeFileName = sanitizeFileName(filename, 'arquivo.txt');
    const storagePath = `activity-audit/${safeModule}/${year}/${month}/${Date.now()}_${safeFileName}`;
    const payload = toBlobPayload(blobOrText, mimeType);
    const fileRef = storage.ref().child(storagePath);
    const customMetadata = {
      uploadedBy: user.uid,
      uploadedByEmail: user.email || '',
      actionType: normalizeString(actionType),
      module: safeModule,
      filename: safeFileName,
      relatedEntityId: normalizeString(relatedEntityId || ''),
      source: normalizeString(metadata.source || metadata.module || safeModule)
    };

    const uploadMetadata = {
      contentType: payload.mimeType,
      customMetadata
    };

    await fileRef.put(payload.blob, uploadMetadata);
    const downloadURL = await fileRef.getDownloadURL();

    return {
      storagePath,
      downloadURL,
      filename: safeFileName,
      size: payload.size,
      mimeType: payload.mimeType,
      uploadedAt: now
    };
  },

  async getAuditFileDownloadUrl(storagePath) {
    const normalizedPath = normalizeString(storagePath);
    if (!normalizedPath || !storage) return null;

    try {
      return await storage.ref().child(normalizedPath).getDownloadURL();
    } catch (error) {
      console.error('[activityLogService] Erro ao obter URL do arquivo auditado:', error);
      return null;
    }
  },

  async downloadAuditFile(storagePath, filename = '') {
    const url = await this.getAuditFileDownloadUrl(storagePath);
    if (!url) {
      throw new Error('Nao foi possivel obter a URL do arquivo auditado.');
    }

    const link = document.createElement('a');
    link.href = url;
    if (filename) {
      link.download = sanitizeFileName(filename);
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return url;
  },

  async auditFileAction({
    actionType = 'EXPORT_REPORT',
    description = '',
    module = 'geral',
    page = '',
    source = '',
    relatedEntityId = null,
    filename = 'arquivo.txt',
    blobOrText = '',
    mimeType = 'text/plain;charset=utf-8;',
    rowCount = null,
    entityType = null,
    entityLabel = null,
    extraData = {},
    download = false
  } = {}) {
    const safeFileName = sanitizeFileName(filename);
    const payload = toBlobPayload(blobOrText, mimeType);

    if (download) {
      this.downloadBlob(payload.blob, safeFileName);
    }

    let auditFile = null;
    try {
      auditFile = await this.saveAuditFile({
        module,
        actionType,
        filename: safeFileName,
        blobOrText: payload.blob,
        mimeType: payload.mimeType,
        relatedEntityId,
        metadata: {
          source,
          page
        }
      });
    } catch (error) {
      console.error('[activityLogService] Falha ao salvar arquivo auditado:', error);
    }

    await this.logActivity(
      actionType,
      description,
      relatedEntityId,
      {
        ...cloneExtraData(extraData),
        module,
        page,
        source,
        entityType,
        entityLabel,
        filename: safeFileName,
        rowCount: rowCount !== null ? rowCount : extraData?.rowCount || null,
        storagePath: auditFile?.storagePath || extraData?.storagePath || null,
        storageDownloadUrl: auditFile?.downloadURL || extraData?.storageDownloadUrl || null,
        mimeType: auditFile?.mimeType || payload.mimeType,
        fileSize: auditFile?.size || payload.size
      }
    );

    return {
      auditFile,
      filename: safeFileName,
      blob: payload.blob
    };
  },

  async getRecentActivities(limitOrOptions = 50, maybeOptions = {}) {
    const options = typeof limitOrOptions === 'object'
      ? { ...limitOrOptions }
      : { ...maybeOptions, limit: limitOrOptions };
    const result = await this.queryActivities({
      orderBy: 'timestamp',
      orderDirection: 'desc',
      ...options
    });
    return result.data;
  },

  async queryActivities(options = {}) {
    try {
      if (!db) return { data: [], hasMore: false, lastDoc: null };

      const {
        actionType,
        userUid,
        userName,
        userEmail,
        dateStart,
        dateEnd,
        searchTerm,
        limit = 50,
        startAfter,
        orderBy = 'timestamp',
        orderDirection = 'desc',
        enrich = true
      } = options;

      const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 5000);
      let query = db.collection('activity_logs');

      if (actionType) {
        query = query.where('actionType', '==', actionType);
      }

      const normalizedUserUid = normalizeString(userUid);
      if (normalizedUserUid) {
        query = query.where('userUid', '==', normalizedUserUid);
      } else if (userEmail) {
        query = query.where('userEmail', '==', normalizeEmail(userEmail));
      }

      const startDate = normalizeDate(dateStart);
      const endDate = normalizeDate(dateEnd);
      if (startDate) {
        query = query.where('timestamp', '>=', startDate);
      }
      if (endDate) {
        query = query.where('timestamp', '<=', endDate);
      }

      query = query.orderBy(orderBy, orderDirection);
      if (orderBy !== '__name__') {
        query = query.orderBy('__name__', orderDirection);
      }

      const cursor = buildQueryCursor(startAfter);
      if (cursor?._document || cursor?._delegate) {
        query = query.startAfter(cursor);
      } else if (cursor?.timestamp) {
        query = query.startAfter(cursor.timestamp, cursor.id || '');
      }

      query = query.limit(pageSize + 1);
      const snapshot = await query.get();
      const docs = snapshot.docs;
      const hasMore = docs.length > pageSize;
      const dataDocs = hasMore ? docs.slice(0, pageSize) : docs;

      let data = dataDocs.map((doc) => normalizeActivity(doc));
      data = enrich
        ? await enrichActivitiesWithUserProfiles(data)
        : data.map((activity) => prepareActivityWithoutEnrichment(activity));
      const normalizedUserName = normalizeString(userName).toLowerCase();
      if (normalizedUserName) {
        data = data.filter((activity) => {
          const candidates = [
            activity.userName,
            activity.userDisplayName,
            activity.originalUserName,
            activity.userEmail,
            activity.actorName
          ].map((value) => normalizeString(value).toLowerCase()).filter(Boolean);
          return candidates.includes(normalizedUserName);
        });
      }

      const normalizedSearch = normalizeString(searchTerm).toLowerCase();
      if (normalizedSearch) {
        data = data.filter((activity) => {
          const text = [
            this.formatActivityDescription(activity),
            activity.userName,
            activity.userDisplayName,
            activity.actorName,
            activity.userEmail,
            activity.actionType,
            activity.relatedEntityId,
            activity.entityLabel,
            activity.filename,
            activity.storagePath,
            activity.extraData?.processoName,
            activity.extraData?.primaryBuyerName,
            activity.extraData?.customerName,
            activity.extraData?.phoneNumber
          ].filter(Boolean).join(' ').toLowerCase();
          return text.includes(normalizedSearch);
        });
      }

      const cursorDoc = dataDocs.length > 0 ? dataDocs[dataDocs.length - 1] : null;
      const lastDoc = cursorDoc ? {
        id: cursorDoc.id,
        timestamp: normalizeDate(cursorDoc.data().timestamp)
      } : null;

      return { data, hasMore, lastDoc };
    } catch (error) {
      console.error('[activityLogService] Erro ao consultar logs de atividade:', error);
      return { data: [], hasMore: false, lastDoc: null };
    }
  },

  exportToCSV(activities = []) {
    const headers = ['Data/Hora', 'Tipo', 'Descricao', 'Usuario', 'Email', 'Entidade', 'Arquivo', 'Detalhes'];
    const rows = activities.map((activity) => {
      const ts = activity.timestamp instanceof Date
        ? activity.timestamp.toLocaleString('pt-BR')
        : String(activity.timestamp || '');
      const extra = activity.extraData
        ? JSON.stringify(activity.extraData).replace(/"/g, '""')
        : '';
      return [
        `"${ts}"`,
        `"${String(this.getActivityTypeLabel(activity.actionType)).replace(/"/g, '""')}"`,
        `"${String(this.formatActivityDescription(activity)).replace(/"/g, '""')}"`,
        `"${String(activity.userDisplayName || activity.userName || '').replace(/"/g, '""')}"`,
        `"${String(activity.userEmail || '').replace(/"/g, '""')}"`,
        `"${String(activity.entityLabel || activity.relatedEntityId || '').replace(/"/g, '""')}"`,
        `"${String(activity.filename || '').replace(/"/g, '""')}"`,
        `"${extra}"`
      ].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  },

  downloadCSV(activities, filename = 'relatorio_atividades.csv') {
    const csv = this.exportToCSV(activities);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    this.downloadBlob(blob, filename);
  },

  async getActionTypes() {
    return ACTION_TYPES;
  }
};

window.activityLogService = activityLogService;
