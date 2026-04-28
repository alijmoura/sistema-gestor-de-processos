import { NotificationCenterOffcanvas } from '../offcanvas/NotificationCenterOffcanvas.js';
import { KpiManagerOffcanvas } from '../offcanvas/KpiManagerOffcanvas.js';
import { WhatsAppNotificationSettingsModal } from '../modals/WhatsAppNotificationSettingsModal.js';
import { WhatsAppAgentModal } from '../modals/WhatsAppAgentModal.js';
import { ConfirmModal } from '../modals/ConfirmModal.js';
import { NotificationSettingsModal } from '../modals/NotificationSettingsModal.js';
import { WhatsAppSettingsModals } from '../modals/WhatsAppSettingsModals.js';
import { initWhatsAppConfigModalInlineBehavior } from '../whatsapp/whatsappConfigModalInlineInit.js';

export function initIndexShellUIComponents() {
  WhatsAppSettingsModals.render();
  initWhatsAppConfigModalInlineBehavior();
  NotificationCenterOffcanvas.render();
  KpiManagerOffcanvas.render();
  WhatsAppNotificationSettingsModal.render();
  WhatsAppAgentModal.render();
  ConfirmModal.render();
  NotificationSettingsModal.render();

  window.__UI_COMPONENTS_RENDERED__ = true;
  window.dispatchEvent(new CustomEvent('ui:components:rendered'));
}

export default {
  initIndexShellUIComponents
};
