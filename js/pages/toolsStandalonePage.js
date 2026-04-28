function waitForToolsPage(maxAttempts = 40) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tick = () => {
      if (window.toolsPage && typeof window.toolsPage.show === 'function') {
        resolve(window.toolsPage);
        return;
      }

      attempts += 1;
      if (attempts >= maxAttempts) {
        reject(new Error('toolsPage não foi carregada a tempo.'));
        return;
      }

      setTimeout(tick, 100);
    };

    tick();
  });
}

export default {
  async initialize() {
    const toolsPage = await waitForToolsPage();
    toolsPage.show();
  },
  async refresh() {
    const toolsPage = await waitForToolsPage();
    toolsPage.show();
  },
  async dispose() {
    return undefined;
  }
};
