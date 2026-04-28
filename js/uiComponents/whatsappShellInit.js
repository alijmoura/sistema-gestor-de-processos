import { ConfirmModal } from '../modals/ConfirmModal.js';
import { WhatsAppAgentModal } from '../modals/WhatsAppAgentModal.js';

export function initWhatsAppShellUIComponents() {
  ConfirmModal.render();
  WhatsAppAgentModal.render();
}

export default {
  initWhatsAppShellUIComponents
};
