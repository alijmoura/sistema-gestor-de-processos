import { db } from './auth.js';

const DEFAULT_PRIMARY_DOMAIN = 'ajsmtech.com';
const RESERVED_SUBDOMAINS = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'cdn',
  'demo',
  'localhost',
  'login',
  'mail',
  'staging',
  'static',
  'suporte',
  'support',
  'www'
]);

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const TENANT_CACHE_TTL_MS = 5 * 60 * 1000;
const TENANT_CACHE_PREFIX = 'tenantContext:';
const LAST_TENANT_SLUG_KEY = 'lastTenantSlug';

let currentTenantContext = null;

function normalizeSlug(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

function getConfiguredPrimaryDomain() {
  const configured = window.SAAS_PRIMARY_DOMAIN || window.APP_PRIMARY_DOMAIN || DEFAULT_PRIMARY_DOMAIN;
  return String(configured || DEFAULT_PRIMARY_DOMAIN).trim().toLowerCase();
}

function isLocalHost(hostname = window.location.hostname) {
  return LOCAL_HOSTS.has(String(hostname || '').toLowerCase());
}

function readQueryTenantSlug() {
  const params = new URLSearchParams(window.location.search);
  return normalizeSlug(params.get('tenant') || params.get('empresa') || params.get('slug'));
}

function readStoredTenantSlug() {
  try {
    return normalizeSlug(localStorage.getItem(LAST_TENANT_SLUG_KEY));
  } catch {
    return '';
  }
}

function writeStoredTenantSlug(slug) {
  if (!slug) return;

  try {
    localStorage.setItem(LAST_TENANT_SLUG_KEY, slug);
  } catch {
    // Local storage pode estar bloqueado em alguns navegadores.
  }
}

function readCachedTenant(slug) {
  if (!slug) return null;

  try {
    const raw = sessionStorage.getItem(`${TENANT_CACHE_PREFIX}${slug}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || Date.now() - parsed.timestamp > TENANT_CACHE_TTL_MS) {
      sessionStorage.removeItem(`${TENANT_CACHE_PREFIX}${slug}`);
      return null;
    }

    return parsed.value || null;
  } catch {
    return null;
  }
}

function writeCachedTenant(slug, value) {
  if (!slug || !value) return;

  try {
    sessionStorage.setItem(`${TENANT_CACHE_PREFIX}${slug}`, JSON.stringify({
      timestamp: Date.now(),
      value
    }));
  } catch {
    // Session storage pode estar indisponivel.
  }
}

export function getTenantSlugFromHostname(hostname = window.location.hostname) {
  const host = String(hostname || '').split(':')[0].toLowerCase();

  if (isLocalHost(host)) {
    return readQueryTenantSlug() || readStoredTenantSlug();
  }

  const primaryDomain = getConfiguredPrimaryDomain();
  if (!host.endsWith(`.${primaryDomain}`)) {
    return '';
  }

  const subdomain = host.slice(0, -(primaryDomain.length + 1));
  const firstLabel = normalizeSlug(subdomain.split('.')[0]);
  if (!firstLabel || RESERVED_SUBDOMAINS.has(firstLabel)) {
    return '';
  }

  return firstLabel;
}

async function loadTenantBySlug(slug) {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return null;

  const cached = readCachedTenant(normalizedSlug);
  if (cached) return cached;

  const snapshot = await db
    .collection('empresas')
    .where('slug', '==', normalizedSlug)
    .where('status', 'in', ['ativo', 'trial', 'pagamento_pendente'])
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const tenant = {
    id: doc.id,
    ...doc.data()
  };

  writeCachedTenant(normalizedSlug, tenant);
  return tenant;
}

async function loadDefaultTenantForUser(user) {
  if (!user?.uid) return null;

  const userDoc = await db.collection('users').doc(user.uid).get();
  const userData = userDoc.exists ? userDoc.data() : {};
  const tenantId = userData?.empresaId || userData?.tenantId || userData?.defaultTenantId;

  if (tenantId) {
    const tenantDoc = await db.collection('empresas').doc(tenantId).get();
    if (tenantDoc.exists) {
      return {
        id: tenantDoc.id,
        ...tenantDoc.data()
      };
    }
  }

  const memberships = await db
    .collection('user_tenants')
    .where('uid', '==', user.uid)
    .where('status', '==', 'ativo')
    .limit(1)
    .get();

  if (memberships.empty) return null;

  const tenantIdFromMembership = memberships.docs[0].data()?.empresaId;
  if (!tenantIdFromMembership) return null;

  const tenantDoc = await db.collection('empresas').doc(tenantIdFromMembership).get();
  return tenantDoc.exists ? { id: tenantDoc.id, ...tenantDoc.data() } : null;
}

async function loadMembership(user, tenantId) {
  if (!user?.uid || !tenantId) return null;

  const directId = `${user.uid}_${tenantId}`;
  const directDoc = await db.collection('user_tenants').doc(directId).get();
  if (directDoc.exists) {
    return {
      id: directDoc.id,
      ...directDoc.data()
    };
  }

  const snapshot = await db
    .collection('user_tenants')
    .where('uid', '==', user.uid)
    .where('empresaId', '==', tenantId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data()
  };
}

export async function resolveTenantContext({ user } = {}) {
  const slug = getTenantSlugFromHostname();
  const tenant = slug ? await loadTenantBySlug(slug) : await loadDefaultTenantForUser(user);

  if (!tenant) {
    if (slug) {
      throw new Error(`Empresa nao encontrada para o slug "${slug}".`);
    }

    currentTenantContext = null;
    return null;
  }

  const membership = await loadMembership(user, tenant.id);
  const isSuperAdmin = user ? (await user.getIdTokenResult().catch(() => null))?.claims?.admin === true : false;

  if (!membership && !isSuperAdmin) {
    throw new Error('Usuario sem vinculo ativo com a empresa acessada.');
  }

  const context = {
    tenant,
    tenantId: tenant.id,
    slug: normalizeSlug(tenant.slug || slug),
    membership,
    role: membership?.role || (isSuperAdmin ? 'super_admin' : 'viewer'),
    isSuperAdmin
  };

  currentTenantContext = context;
  if (context.slug) {
    writeStoredTenantSlug(context.slug);
  }

  window.currentTenant = context.tenant;
  window.currentTenantContext = context;
  window.appState = window.appState || {};
  window.appState.currentTenant = context.tenant;
  window.appState.currentTenantContext = context;
  window.appState.currentEmpresaId = context.tenantId;

  window.dispatchEvent(new CustomEvent('tenant-context-ready', { detail: context }));
  return context;
}

export function getCurrentTenantContext() {
  return currentTenantContext || window.currentTenantContext || null;
}

export function getCurrentTenantId() {
  return getCurrentTenantContext()?.tenantId || '';
}

export function withTenantData(data = {}) {
  const tenantId = getCurrentTenantId();
  if (!tenantId) return { ...data };

  return {
    ...data,
    empresaId: data.empresaId || tenantId,
    tenantId: data.tenantId || tenantId
  };
}

export function tenantQuery(collectionRef) {
  const tenantId = getCurrentTenantId();
  return tenantId ? collectionRef.where('empresaId', '==', tenantId) : collectionRef;
}

export default {
  getCurrentTenantContext,
  getCurrentTenantId,
  getTenantSlugFromHostname,
  resolveTenantContext,
  tenantQuery,
  withTenantData
};
