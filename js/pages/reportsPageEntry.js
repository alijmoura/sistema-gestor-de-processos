import { startAuthenticatedPage } from './authenticatedPageBootstrap.js';
import reportsStandalonePage from './reportsStandalonePage.js';

startAuthenticatedPage({
  pageId: 'relatorios',
  pageModule: reportsStandalonePage,
  hiddenDisposeDelayMs: null
});
