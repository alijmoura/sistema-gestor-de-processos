import { startAuthenticatedPage } from './authenticatedPageBootstrap.js';
import whatsappStandalonePage from './whatsappStandalonePage.js';

startAuthenticatedPage({
  pageId: 'whatsapp',
  pageModule: whatsappStandalonePage
});
