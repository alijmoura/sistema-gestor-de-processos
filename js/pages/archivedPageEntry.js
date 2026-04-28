import { startAuthenticatedPage } from './authenticatedPageBootstrap.js';
import archivedStandalonePage from './archivedStandalonePage.js';

startAuthenticatedPage({
  pageId: 'arquivados',
  pageModule: archivedStandalonePage
});
