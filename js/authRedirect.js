function normalizeTarget(target = '') {
  const value = String(target || '').trim();
  if (!value) return '';

  try {
    const resolved = new URL(value, window.location.origin);
    if (resolved.origin !== window.location.origin) {
      return '';
    }

    if (/\/login\.html$/i.test(resolved.pathname)) {
      return '';
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch (error) {
    console.warn('[authRedirect] Destino de redirecionamento invalido:', error);
    return '';
  }
}

export function getCurrentPageTarget() {
  return normalizeTarget(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}

export function buildLoginRedirectUrl(options = {}) {
  const { includeNext = true, reason = '' } = options;
  const loginUrl = new URL('login.html', window.location.href);

  if (reason) {
    loginUrl.searchParams.set('reason', String(reason));
  }

  if (includeNext) {
    const nextTarget = getCurrentPageTarget();
    if (nextTarget) {
      loginUrl.searchParams.set('next', nextTarget);
    }
  }

  return `${loginUrl.pathname}${loginUrl.search}${loginUrl.hash}`;
}

export function redirectToLogin(options = {}) {
  window.location.href = buildLoginRedirectUrl(options);
}

export function resolvePostLoginDestination(defaultTarget = 'index.html') {
  const params = new URLSearchParams(window.location.search);
  const requestedTarget = normalizeTarget(params.get('next'));
  return requestedTarget || defaultTarget;
}

export default {
  buildLoginRedirectUrl,
  getCurrentPageTarget,
  redirectToLogin,
  resolvePostLoginDestination
};
