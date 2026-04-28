import { auth } from '../auth.js';
import { redirectToLogin } from '../authRedirect.js';
import { firestoreService } from '../firestoreService.js';
import permissionsUIHelper from '../permissionsUIHelper.js';
import { resolveTenantContext } from '../tenantService.js';
import '../firestoreReadMetricsService.js';
import '../firestoreReadMonitor.js';

const DEFAULT_HIDDEN_DISPOSE_DELAY_MS = 60 * 1000;
const PASSWORD_POLICY_CACHE_KEY = 'passwordPolicyStateCache';
const PASSWORD_POLICY_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_PROFILE_STORAGE_PREFIX = 'userProfile_';

function updateTopbarUser(user) {
  const targets = [
    document.getElementById('user-email'),
    document.getElementById('topbar-user-email')
  ].filter(Boolean);

  targets.forEach((target) => {
    target.textContent = user?.email || '';
    target.title = user?.email || '';
  });
}

function updateSidebarProfile(profile = null, user = null) {
  const roleTargets = Array.from(document.querySelectorAll('.sidebar-user-role'));
  const avatarTargets = Array.from(document.querySelectorAll('.sidebar-user-avatar'));
  const displayName = String(
    profile?.shortName
    || profile?.fullName
    || user?.displayName
    || user?.email
    || 'Usuário'
  ).trim();

  roleTargets.forEach((target) => {
    target.textContent = displayName;
  });

  const avatarUrl = String(profile?.avatarUrl || '').trim();
  avatarTargets.forEach((target) => {
    target.innerHTML = '';
    if (avatarUrl) {
      const img = document.createElement('img');
      img.src = avatarUrl;
      img.alt = 'Avatar do usuário';
      img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 10px;';
      img.onerror = () => {
        target.innerHTML = '<i class="bi bi-person-circle"></i>';
      };
      target.appendChild(img);
      return;
    }

    target.innerHTML = '<i class="bi bi-person-circle"></i>';
  });
}

async function redirectIfPasswordRotationRequired() {
  try {
    const cachedPasswordPolicy = readSessionCache(PASSWORD_POLICY_CACHE_KEY, PASSWORD_POLICY_CACHE_TTL_MS);
    const passwordPolicy = cachedPasswordPolicy || await firestoreService.getPasswordPolicyState();
    if (!cachedPasswordPolicy && passwordPolicy) {
      writeSessionCache(PASSWORD_POLICY_CACHE_KEY, passwordPolicy);
    }

    if (passwordPolicy?.mustChangePassword === true) {
      window.location.href = 'profile.html?forcePasswordRotation=1';
      return true;
    }
  } catch (error) {
    console.warn('[authenticatedPageBootstrap] Falha ao validar politica de senha:', error);
  }

  return false;
}

function readSessionCache(key, ttlMs) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || (Date.now() - parsed.timestamp) >= ttlMs) {
      sessionStorage.removeItem(key);
      return null;
    }

    return parsed.value ?? null;
  } catch {
    return null;
  }
}

function writeSessionCache(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      value
    }));
  } catch {
    // Ignore falhas de sessionStorage.
  }
}

function readCachedUserProfile(uid) {
  if (!uid) return null;

  try {
    const raw = localStorage.getItem(`${USER_PROFILE_STORAGE_PREFIX}${uid}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function startAuthenticatedPage({
  pageId,
  pageModule,
  hiddenDisposeDelayMs = DEFAULT_HIDDEN_DISPOSE_DELAY_MS
}) {
  if (!pageModule || typeof pageModule.initialize !== 'function') {
    throw new Error(`Modulo de pagina invalido para "${pageId}".`);
  }

  const state = {
    initialized: false,
    disposed: false,
    hiddenTimer: null,
    currentUserUid: null
  };

  document.body.dataset.pageId = pageId;
  window.firestoreService = firestoreService;
  window.appState = window.appState || {};
  const shouldDisposeOnHidden = Number.isFinite(hiddenDisposeDelayMs) && hiddenDisposeDelayMs > 0;

  const clearHiddenTimer = () => {
    if (state.hiddenTimer) {
      clearTimeout(state.hiddenTimer);
      state.hiddenTimer = null;
    }
  };

  const disposePage = async (reason = 'manual') => {
    clearHiddenTimer();
    if (state.disposed) return;

    state.disposed = true;
    if (typeof pageModule.dispose === 'function') {
      await pageModule.dispose(reason);
    }
  };

  const logoutButton = document.getElementById('logout-button');
  if (logoutButton && !logoutButton.dataset.logoutBound) {
    logoutButton.dataset.logoutBound = '1';
    logoutButton.addEventListener('click', async () => {
      try {
        await auth.signOut();
        window.location.href = 'login.html';
      } catch (error) {
        console.error('[authenticatedPageBootstrap] Erro ao encerrar sessao:', error);
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearHiddenTimer();
      if (!shouldDisposeOnHidden) {
        return;
      }
      state.hiddenTimer = setTimeout(() => {
        void disposePage('hidden');
      }, hiddenDisposeDelayMs);
      return;
    }

    clearHiddenTimer();

    if (state.disposed) {
      window.location.reload();
      return;
    }

    if (state.initialized && typeof pageModule.refresh === 'function') {
      pageModule.refresh({ reason: 'visible' }).catch((error) => {
        console.warn(`[authenticatedPageBootstrap] Falha ao atualizar pagina "${pageId}" ao voltar ao foco:`, error);
      });
    }
  });

  window.addEventListener('pagehide', () => {
    void disposePage('pagehide');
  });

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      redirectToLogin();
      return;
    }

    window.currentUserAuth = user;
    window.getCurrentUserAuth = async () => auth.currentUser || window.currentUserAuth || null;
    window.dispatchEvent(new CustomEvent('auth-state-changed', { detail: { user } }));

    if (window.readMetricsService && !window.readMetricsService.initialized) {
      window.readMetricsService.init(user.uid).catch((error) => {
        console.warn('[ReadMetrics] Erro ao inicializar:', error);
      });
    }

    updateTopbarUser(user);
    const cachedProfile = readCachedUserProfile(user.uid);
    if (cachedProfile) {
      window.appState.currentUserProfile = cachedProfile;
      updateTopbarUser({
        ...user,
        email: cachedProfile?.shortName || cachedProfile?.fullName || user.email
      });
      updateSidebarProfile(cachedProfile, user);
    } else {
      updateSidebarProfile(null, user);
    }

    if (state.initialized && state.currentUserUid === user.uid && !state.disposed) {
      return;
    }

    const mustRotatePassword = await redirectIfPasswordRotationRequired();
    if (mustRotatePassword) {
      return;
    }

    let tenantContext = null;
    try {
      tenantContext = await resolveTenantContext({ user });
    } catch (error) {
      console.error(`[authenticatedPageBootstrap] Falha ao resolver empresa para "${pageId}":`, error);
      await auth.signOut().catch(() => {});
      redirectToLogin({ reason: 'tenant' });
      return;
    }

    const permissionsPromise = permissionsUIHelper.init();
    const profilePromise = firestoreService.getUserProfile(user.uid)
      .then((profile) => {
        if (profile) {
          window.appState.currentUserProfile = profile;
          updateTopbarUser({
            ...user,
            email: profile?.shortName || profile?.fullName || user.email
          });
          updateSidebarProfile(profile, user);
        }
        return profile;
      })
      .catch((error) => {
        console.warn(`[authenticatedPageBootstrap] Falha ao carregar perfil para "${pageId}":`, error);
        return cachedProfile || null;
      });
    const tokenResultPromise = user.getIdTokenResult().catch((error) => {
      console.warn(`[authenticatedPageBootstrap] Falha ao ler claims para "${pageId}":`, error);
      return null;
    });

    try {
      await permissionsPromise;
      permissionsUIHelper.applyAllPermissions();
    } catch (error) {
      console.warn(`[authenticatedPageBootstrap] Falha ao carregar permissoes para "${pageId}":`, error);
    }

    window.appState.userPermissions = permissionsUIHelper.currentUserPermissions || null;

    let profile = cachedProfile || null;
    if (!profile) {
      profile = await profilePromise;
    }

    window.appState.currentUserProfile = profile || null;

    const tokenResult = await tokenResultPromise;
    const role = String(window.appState.userPermissions?.role || '').toLowerCase();
    const isAdmin = tokenResult?.claims?.admin === true || role === 'admin' || role === 'super_admin';

    state.disposed = false;
    state.currentUserUid = user.uid;

    await pageModule.initialize({
      pageId,
      user,
      isAdmin,
      tenantContext,
      tenant: tenantContext?.tenant || null,
      empresaId: tenantContext?.tenantId || ''
    });

    state.initialized = true;
  });
}

export default {
  startAuthenticatedPage
};
