import aprovacaoPage from './aprovacaoPageInit.js';

export default {
  async initialize() {
    await aprovacaoPage.show();
  },
  async refresh() {
    await aprovacaoPage.refresh();
  },
  async dispose(reason) {
    await aprovacaoPage.dispose(reason);
  }
};
