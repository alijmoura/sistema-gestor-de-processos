import { WhatsAppDashboardModals } from '../modals/WhatsAppDashboardModals.js';

// Injeção mínima para a página whatsapp-dashboard.html.
WhatsAppDashboardModals.render();

window.__UI_COMPONENTS_RENDERED__ = true;
window.dispatchEvent(new CustomEvent('ui:components:rendered'));
