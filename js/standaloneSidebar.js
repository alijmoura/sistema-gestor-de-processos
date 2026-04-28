(function () {
  'use strict';

  const STORAGE_KEY = 'sidebar-collapsed';

  function updateToggleState(button, collapsed) {
    if (!button) return;
    button.setAttribute('aria-expanded', (!collapsed).toString());
    button.setAttribute('aria-label', collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral');
  }

  function syncResponsiveState() {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      document.body.classList.add('sidebar-collapsed');
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  }

  function init() {
    const toggleButton = document.getElementById('sidebar-toggle');
    if (!toggleButton) return;

    const collapsed = localStorage.getItem(STORAGE_KEY) === 'true';
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    updateToggleState(toggleButton, collapsed);

    toggleButton.addEventListener('click', () => {
      const nextCollapsed = !document.body.classList.contains('sidebar-collapsed');
      document.body.classList.toggle('sidebar-collapsed', nextCollapsed);
      localStorage.setItem(STORAGE_KEY, String(nextCollapsed));
      updateToggleState(toggleButton, nextCollapsed);
    });

    window.addEventListener('resize', syncResponsiveState);
    syncResponsiveState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
