import { startAuthenticatedPage } from './authenticatedPageBootstrap.js';
import agendaStandalonePage from './agendaStandalonePage.js';

startAuthenticatedPage({
  pageId: 'agenda',
  pageModule: agendaStandalonePage
});
