import { startAuthenticatedPage } from './authenticatedPageBootstrap.js';
import processosStandalonePage from './processosStandalonePage.js';

startAuthenticatedPage({
  pageId: 'processos',
  pageModule: processosStandalonePage,
  hiddenDisposeDelayMs: null
});
