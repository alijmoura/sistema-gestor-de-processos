/* eslint-env node */
/**
 * Backfill SaaS multiempresa para a base validada.
 *
 * Uso:
 *   node scripts/migrate-saas-tenant.js --dry-run
 *   node scripts/migrate-saas-tenant.js --tenant=ajsmtech-demo
 *
 * Requer credenciais Firebase Admin no ambiente em que for executado.
 */
let admin;
try {
  admin = require("firebase-admin");
} catch {
  admin = require("../functions/node_modules/firebase-admin");
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const tenantArg = process.argv.find((arg) => arg.startsWith("--tenant="));
const TENANT_ID = (tenantArg ? tenantArg.split("=")[1] : "ajsmtech-demo").trim();
const PRIMARY_DOMAIN = process.env.SAAS_PRIMARY_DOMAIN || "ajsmtech.com";

const TENANT_COLLECTIONS = [
  "contracts",
  "archivedContracts",
  "aprovacoes",
  "aprovacaoSolicitacoes",
  "aprovacaoConversaoLinks",
  "aprovacoesAggDaily",
  "aprovacoesAggSummary",
  "pendencias",
  "chats",
  "quickMessages",
  "whatsappQueues",
  "whatsappTags",
  "whatsappPhones",
  "whatsappPhoneNumbers",
  "whatsappConfig",
  "whatsappWorkflows",
  "whatsappBotSessions",
  "whatsappMetrics",
  "whatsappMetricsDaily",
  "vendors",
  "agencias",
  "cartorios",
  "workflows",
  "dashboardConfig",
  "slaConfig",
  "slaDateConfig",
  "statusConfig",
  "status",
  "statusRules",
  "settings",
  "events",
  "scheduleTypes",
  "attachments",
  "realtimeNotifications",
  "realtimeAprovacaoNotifications",
  "activity_logs",
  "_readMetrics"
];

function initAdmin() {
  if (admin.apps.length) return;
  admin.initializeApp();
}

function log(message, data = {}) {
  const suffix = Object.keys(data).length ? ` ${JSON.stringify(data)}` : "";
  console.log(`[saas-migration] ${message}${suffix}`);
}

async function commitBatch(db, batch, count) {
  if (count === 0) return;
  if (dryRun) return;
  await batch.commit();
}

async function ensureTenant(db) {
  const ref = db.collection("empresas").doc(TENANT_ID);
  const payload = {
    empresaId: TENANT_ID,
    nome: "AJSM Tech Demo",
    slug: TENANT_ID,
    dominio: `${TENANT_ID}.${PRIMARY_DOMAIN}`,
    status: "trial",
    plano: "professional",
    limites: {
      usuarios: 25,
      processos: 10000,
      whatsapp: true
    },
    assinatura: {
      provider: "mercado_pago",
      status: "manual",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    migrationSource: "scripts/migrate-saas-tenant.js"
  };

  log(dryRun ? "dry-run: criaria/atualizaria empresa" : "criando/atualizando empresa", { tenant: TENANT_ID });
  if (!dryRun) {
    await ref.set(payload, { merge: true });
  }
}

async function backfillCollection(db, collectionName) {
  let lastDoc = null;
  let scanned = 0;
  let updated = 0;

  while (true) {
    let query = db.collection(collectionName).orderBy(admin.firestore.FieldPath.documentId()).limit(400);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    let batch = db.batch();
    let batchCount = 0;
    snapshot.docs.forEach((doc) => {
      scanned += 1;
      const data = doc.data() || {};
      if (data.empresaId === TENANT_ID && data.tenantId === TENANT_ID) return;

      batch.set(doc.ref, {
        empresaId: data.empresaId || TENANT_ID,
        tenantId: data.tenantId || TENANT_ID,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: "saas-migration"
      }, { merge: true });
      batchCount += 1;
      updated += 1;
    });

    await commitBatch(db, batch, batchCount);
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < 400) break;
  }

  log("colecao processada", { collectionName, scanned, updated, dryRun });
}

async function linkExistingUsers(db) {
  const snapshot = await db.collection("users").get();
  let batch = db.batch();
  let count = 0;

  snapshot.docs.forEach((doc) => {
    const data = doc.data() || {};
    const uid = data.uid || doc.id;
    const role = data.role || data.permissionRole || "admin";
    const membershipRef = db.collection("user_tenants").doc(`${uid}_${TENANT_ID}`);

    batch.set(membershipRef, {
      uid,
      email: data.email || null,
      empresaId: TENANT_ID,
      role: role === "super_admin" ? "super_admin" : role,
      status: "ativo",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: "saas-migration"
    }, { merge: true });

    batch.set(doc.ref, {
      empresaId: data.empresaId || TENANT_ID,
      tenantId: data.tenantId || TENANT_ID,
      defaultTenantId: data.defaultTenantId || TENANT_ID,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: "saas-migration"
    }, { merge: true });

    count += 2;
  });

  await commitBatch(db, batch, count);
  log("usuarios vinculados", { users: snapshot.size, dryRun });
}

async function main() {
  if (!TENANT_ID) {
    throw new Error("Tenant invalido.");
  }

  initAdmin();
  const db = admin.firestore();
  await ensureTenant(db);
  await linkExistingUsers(db);

  for (const collectionName of TENANT_COLLECTIONS) {
    await backfillCollection(db, collectionName);
  }

  log("migração finalizada", { tenant: TENANT_ID, dryRun });
}

main().catch((error) => {
  console.error("[saas-migration] falha", error);
  process.exitCode = 1;
});
