import { WhatsAppWorkflowsModals } from '../modals/WhatsAppWorkflowsModals.js';

// Injeção mínima para a página whatsapp-workflows.html.
WhatsAppWorkflowsModals.render();

window.__UI_COMPONENTS_RENDERED__ = true;
window.dispatchEvent(new CustomEvent('ui:components:rendered'));
