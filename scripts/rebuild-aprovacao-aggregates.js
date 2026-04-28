#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  FIREBASE_RC_FILE,
  resolveRootPath
} = require('./release-config');

function parseArgs(argv = []) {
  return argv.reduce((acc, arg) => {
    if (arg.startsWith('--project=')) {
      acc.projectId = arg.split('=')[1];
      return acc;
    }
    if (arg === '--force-authorized-user') {
      acc.forceAuthorizedUser = true;
      return acc;
    }
    return acc;
  }, {
    projectId: null,
    forceAuthorizedUser: false
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveProjectId(explicitProjectId) {
  if (explicitProjectId) return explicitProjectId;

  const firebasercPath = resolveRootPath(FIREBASE_RC_FILE);
  if (!fs.existsSync(firebasercPath)) {
    throw new Error('Nao foi possivel localizar .firebaserc para resolver o projectId.');
  }

  const firebaserc = readJson(firebasercPath);
  const projectId = firebaserc?.projects?.default;
  if (!projectId) {
    throw new Error('ProjectId default ausente em .firebaserc.');
  }

  return projectId;
}

function resolveFirebaseToolsConfigPath() {
  return path.join(process.env.USERPROFILE || process.env.HOME || '', '.config', 'configstore', 'firebase-tools.json');
}

function resolveFirebaseToolsApiPath() {
  const candidates = [
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'api.js'),
    path.join(process.env.HOME || '', '.npm-global', 'lib', 'node_modules', 'firebase-tools', 'lib', 'api.js')
  ];

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function ensureCredentials(forceAuthorizedUser = false) {
  const existingCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (existingCredentials && fs.existsSync(existingCredentials) && !forceAuthorizedUser) {
    return { cleanup: null };
  }

  const serviceAccountPath = resolveRootPath('serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath) && !forceAuthorizedUser) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountPath;
    return { cleanup: null };
  }

  const configPath = resolveFirebaseToolsConfigPath();
  const apiPath = resolveFirebaseToolsApiPath();
  if (!fs.existsSync(configPath) || !apiPath) {
    throw new Error('Credenciais indisponiveis. Configure GOOGLE_APPLICATION_CREDENTIALS ou serviceAccountKey.json.');
  }

  const firebaseToolsConfig = readJson(configPath);
  const refreshToken = firebaseToolsConfig?.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error('Refresh token do firebase-tools nao encontrado.');
  }

  const apiModule = require(apiPath);
  const clientId = typeof apiModule.clientId === 'function'
    ? apiModule.clientId()
    : '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
  const clientSecret = typeof apiModule.clientSecret === 'function'
    ? apiModule.clientSecret()
    : null;

  if (!clientSecret) {
    throw new Error('Nao foi possivel resolver clientSecret do firebase-tools.');
  }

  const tempCredentialsPath = path.join(os.tmpdir(), `firebase-authorized-user-${Date.now()}.json`);
  fs.writeFileSync(tempCredentialsPath, JSON.stringify({
    type: 'authorized_user',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  }, null, 2));

  process.env.GOOGLE_APPLICATION_CREDENTIALS = tempCredentialsPath;
  return {
    cleanup: () => {
      try {
        fs.unlinkSync(tempCredentialsPath);
      } catch {
        // noop
      }
    }
  };
}

function loadFirebaseAdmin() {
  const adminBase = resolveRootPath('functions', 'node_modules', 'firebase-admin', 'lib');
  const appPath = path.join(adminBase, 'app', 'index.js');
  const firestorePath = path.join(adminBase, 'firestore', 'index.js');

  if (!fs.existsSync(appPath) || !fs.existsSync(firestorePath)) {
    throw new Error('firebase-admin nao encontrado em functions/node_modules. Execute npm install em functions/.');
  }

  const { initializeApp, applicationDefault } = require(appPath);
  const { getFirestore, FieldValue } = require(firestorePath);

  return { initializeApp, applicationDefault, getFirestore, FieldValue };
}

function sanitizeStringValue(value, maxLength = 255) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function toJsDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateKey(value) {
  const date = toJsDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeAprovacaoStatus(value) {
  return sanitizeStringValue(value, 30).toUpperCase();
}

function sanitizeFieldPathKey(value, fallback = 'desconhecido') {
  const raw = sanitizeStringValue(value, 120);
  if (!raw) return fallback;
  return raw
    .replace(/[.#$/\[\]]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80) || fallback;
}

function resolveAprovacaoAnalyst(aprovacaoData = {}) {
  const analystRaw = sanitizeStringValue(
    aprovacaoData.analistaAprovacao
      || aprovacaoData.analistaResponsavel
      || aprovacaoData.modificadoPor
      || 'desconhecido',
    120
  );

  return {
    key: sanitizeFieldPathKey(analystRaw, 'desconhecido'),
    label: analystRaw || 'desconhecido'
  };
}

function buildAprovacaoAggregationEntry(aprovacaoData = {}) {
  const dateKey = formatDateKey(
    aprovacaoData.dataEntrada
      || aprovacaoData.entrada
      || aprovacaoData.createdAt
      || aprovacaoData.criadoEm
      || new Date()
  );

  if (!dateKey) return null;

  const situacao = normalizeAprovacaoStatus(aprovacaoData.situacao);
  const convertido = aprovacaoData.convertidoParaProcesso === true;
  const analyst = resolveAprovacaoAnalyst(aprovacaoData);

  return {
    dateKey,
    situacao,
    convertido,
    analystKey: analyst.key,
    analystLabel: analyst.label
  };
}

function createAggregateBucket() {
  return {
    total: 0,
    aprovados: 0,
    reprovados: 0,
    condicionados: 0,
    convertidas: 0,
    pendentesConversao: 0,
    byAnalyst: {}
  };
}

function applyBucketDelta(target, entry) {
  if (!target || !entry) return;

  target.total += 1;
  if (entry.situacao === 'APROVADO') {
    target.aprovados += 1;
    if (!entry.convertido) {
      target.pendentesConversao += 1;
    }
  } else if (entry.situacao === 'REPROVADO') {
    target.reprovados += 1;
  } else if (entry.situacao === 'CONDICIONADO') {
    target.condicionados += 1;
  }

  if (entry.convertido) {
    target.convertidas += 1;
  }

  if (!target.byAnalyst[entry.analystKey]) {
    target.byAnalyst[entry.analystKey] = {
      label: entry.analystLabel,
      total: 0,
      aprovados: 0,
      reprovados: 0,
      condicionados: 0,
      convertidas: 0,
      pendentesConversao: 0
    };
  }

  const analystBucket = target.byAnalyst[entry.analystKey];
  analystBucket.label = entry.analystLabel;
  analystBucket.total += 1;
  if (entry.situacao === 'APROVADO') {
    analystBucket.aprovados += 1;
    if (!entry.convertido) {
      analystBucket.pendentesConversao += 1;
    }
  } else if (entry.situacao === 'REPROVADO') {
    analystBucket.reprovados += 1;
  } else if (entry.situacao === 'CONDICIONADO') {
    analystBucket.condicionados += 1;
  }

  if (entry.convertido) {
    analystBucket.convertidas += 1;
  }
}

async function rebuildAprovacaoAggregates({ db, FieldValue }) {
  const approvalsSnap = await db.collection('aprovacoes').get();
  const dailyBuckets = new Map();
  const globalBucket = createAggregateBucket();

  approvalsSnap.docs.forEach((doc) => {
    const entry = buildAprovacaoAggregationEntry(doc.data() || {});
    if (!entry) return;

    if (!dailyBuckets.has(entry.dateKey)) {
      dailyBuckets.set(entry.dateKey, createAggregateBucket());
    }

    applyBucketDelta(dailyBuckets.get(entry.dateKey), entry);
    applyBucketDelta(globalBucket, entry);
  });

  const [existingDailySnap, existingSummarySnap] = await Promise.all([
    db.collection('aprovacoesAggDaily').get(),
    db.collection('aprovacoesAggSummary').get()
  ]);

  let batch = db.batch();
  let opCount = 0;
  const commitBatch = async () => {
    if (opCount === 0) return;
    await batch.commit();
    batch = db.batch();
    opCount = 0;
  };

  for (const doc of existingDailySnap.docs) {
    if (opCount >= 350) await commitBatch();
    batch.delete(doc.ref);
    opCount += 1;
  }
  for (const doc of existingSummarySnap.docs) {
    if (opCount >= 350) await commitBatch();
    batch.delete(doc.ref);
    opCount += 1;
  }
  await commitBatch();

  for (const [dateKey, bucket] of dailyBuckets.entries()) {
    if (opCount >= 300) await commitBatch();
    batch.set(db.collection('aprovacoesAggDaily').doc(dateKey), {
      date: dateKey,
      ...bucket,
      rebuiltAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: false });
    opCount += 1;
  }

  if (opCount >= 300) await commitBatch();
  batch.set(db.collection('aprovacoesAggSummary').doc('global'), {
    scope: 'global',
    ...globalBucket,
    rebuiltAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: false });
  opCount += 1;
  await commitBatch();

  return {
    totalAprovacoes: approvalsSnap.size,
    totalDias: dailyBuckets.size,
    totalAprovados: globalBucket.aprovados,
    totalReprovados: globalBucket.reprovados,
    totalCondicionados: globalBucket.condicionados,
    totalConvertidas: globalBucket.convertidas,
    totalPendentesConversao: globalBucket.pendentesConversao
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.projectId);
  const credentials = ensureCredentials(args.forceAuthorizedUser);
  const { initializeApp, applicationDefault, getFirestore, FieldValue } = loadFirebaseAdmin();

  initializeApp({
    credential: applicationDefault(),
    projectId
  });

  try {
    const result = await rebuildAprovacaoAggregates({
      db: getFirestore(),
      FieldValue
    });
    console.log(JSON.stringify({ projectId, ...result }, null, 2));
  } finally {
    credentials.cleanup?.();
  }
}

main().catch((error) => {
  console.error('[rebuild-aprovacao-aggregates] Erro:', error.message);
  process.exit(1);
});
