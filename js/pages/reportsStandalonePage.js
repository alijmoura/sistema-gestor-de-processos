function waitForReportsPage(maxAttempts = 40) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tick = () => {
      if (window.reportsPage && typeof window.reportsPage.show === 'function') {
        resolve(window.reportsPage);
        return;
      }

      attempts += 1;
      if (attempts >= maxAttempts) {
        reject(new Error('reportsPage não foi carregada a tempo.'));
        return;
      }

      setTimeout(tick, 100);
    };

    tick();
  });
}

export default {
  async initialize() {
    const reportsPage = await waitForReportsPage();
    await reportsPage.show();
  },
  async refresh() {
    const reportsPage = await waitForReportsPage();
    const activeSource = reportsPage?.state?.activeSource || 'processos';

    if (activeSource === 'aprovacao' && typeof reportsPage.generateApprovalReport === 'function') {
      await reportsPage.generateApprovalReport(true);
      return;
    }

    if (activeSource === 'whatsapp' && typeof reportsPage.generateWhatsappReport === 'function') {
      await reportsPage.generateWhatsappReport();
      return;
    }

    if (activeSource === 'atividades' && typeof reportsPage.generateActivityReport === 'function') {
      await reportsPage.generateActivityReport();
      return;
    }

    await reportsPage.generateReport(true);
  },
  async dispose() {
    if (window.reportsPage && typeof window.reportsPage.dispose === 'function') {
      window.reportsPage.dispose();
    }
  }
};
