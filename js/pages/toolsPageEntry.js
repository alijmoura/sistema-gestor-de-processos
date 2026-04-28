import { startAuthenticatedPage } from './authenticatedPageBootstrap.js';
import toolsStandalonePage from './toolsStandalonePage.js';

startAuthenticatedPage({
  pageId: 'ferramentas',
  pageModule: toolsStandalonePage
});
