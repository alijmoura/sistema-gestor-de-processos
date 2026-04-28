let archivedModulePromise = null;

async function ensureArchivedModuleLoaded() {
  if (!archivedModulePromise) {
    archivedModulePromise = import('../archivedContractsPage.js');
  }
  return archivedModulePromise;
}

export default {
  async initialize() {
    await ensureArchivedModuleLoaded();
  },
  async refresh() {
    await ensureArchivedModuleLoaded();
    const refreshBtn = document.getElementById('archived-refresh-btn');
    refreshBtn?.click();
  },
  async dispose() {
    return undefined;
  }
};
