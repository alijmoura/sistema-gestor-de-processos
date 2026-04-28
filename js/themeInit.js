/*
 * Theme initialization and helpers (light/dark)
 * Uses userPreferences.darkMode when available.
 */
(function () {
  const root = document.documentElement;
  const THEME_ATTR = 'data-theme';
  const BS_THEME_ATTR = 'data-bs-theme';

  function setTheme(isDark) {
    if (isDark) {
      root.setAttribute(THEME_ATTR, 'dark');
      root.setAttribute(BS_THEME_ATTR, 'dark');
      return;
    }
    root.removeAttribute(THEME_ATTR);
    root.removeAttribute(BS_THEME_ATTR);
  }

  function getStoredPreference() {
    try {
      const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
      if (typeof prefs.darkMode === 'boolean') {
        return prefs.darkMode;
      }
    } catch {
      // Ignore invalid preferences
    }

    try {
      const legacy = localStorage.getItem('preferred-theme');
      if (legacy === 'dark') return true;
      if (legacy === 'light') return false;
    } catch {
      // Ignore legacy storage errors
    }

    return null;
  }

  function detectSystemPreference() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function syncToggle() {
    const toggle = document.getElementById('pref-dark-mode');
    if (!toggle) return;
    toggle.checked = root.getAttribute(THEME_ATTR) === 'dark';
  }

  function applyInitialTheme() {
    const stored = getStoredPreference();
    if (stored === null) {
      setTheme(detectSystemPreference());
    } else {
      setTheme(stored);
    }
  }

  function savePreference(isDark) {
    try {
      const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
      prefs.darkMode = !!isDark;
      localStorage.setItem('userPreferences', JSON.stringify(prefs));
    } catch {
      // Ignore save errors
    }
  }

  window.applyThemePreference = function (isDark, options = {}) {
    setTheme(!!isDark);
    if (options.save) {
      savePreference(!!isDark);
    }
    syncToggle();
  };

  window.getThemePreference = function () {
    return root.getAttribute(THEME_ATTR) === 'dark';
  };

  applyInitialTheme();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncToggle);
  } else {
    syncToggle();
  }
})();
