import { startAuthenticatedPage } from './authenticatedPageBootstrap.js';
import aprovacaoStandalonePage from './aprovacaoStandalonePage.js';

startAuthenticatedPage({
  pageId: 'aprovacao',
  pageModule: aprovacaoStandalonePage
});
