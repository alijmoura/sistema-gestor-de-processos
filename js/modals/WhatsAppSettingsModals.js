import { renderWhatsAppGeneralTab } from './whatsapp/WhatsAppGeneralTab.js';
import { renderWhatsAppTagsTab } from './whatsapp/WhatsAppTagsTab.js';
import { renderWhatsAppQuickMessagesTab } from './whatsapp/WhatsAppQuickMessagesTab.js';
import { renderWhatsAppConfigModal } from './whatsapp/WhatsAppConfigModal.js';
import { renderWhatsAppNumbersModal } from './whatsapp/WhatsAppNumbersModal.js';
import { renderWhatsAppTagFormModal } from './whatsapp/WhatsAppTagFormModal.js';
import { renderWhatsAppQuickMessageFormModal } from './whatsapp/WhatsAppQuickMessageFormModal.js';
import { renderWhatsAppStatsModal } from './whatsapp/WhatsAppStatsModal.js';
import { renderWhatsAppAgentsModal } from './whatsapp/WhatsAppAgentsModal.js';
import { renderWhatsAppSendTemplateModal } from './whatsapp/WhatsAppSendTemplateModal.js';
import { renderWhatsAppTemplatesModal } from './whatsapp/WhatsAppTemplatesModal.js';
import { renderWhatsAppPhoneNumberModal } from './whatsapp/WhatsAppPhoneNumberModal.js';

export const WhatsAppSettingsModals = {
  id: 'modal-whatsapp-config',

  render() {
    if (document.getElementById(this.id)) return;

    const html = [
      renderWhatsAppNumbersModal(),
      renderWhatsAppConfigModal({
        generalTab: renderWhatsAppGeneralTab(),
        tagsTab: renderWhatsAppTagsTab(),
        quickMessagesTab: renderWhatsAppQuickMessagesTab(),
      }),
      renderWhatsAppTagFormModal(),
      renderWhatsAppQuickMessageFormModal(),
      renderWhatsAppStatsModal(),
      renderWhatsAppAgentsModal(),
      renderWhatsAppSendTemplateModal(),
      renderWhatsAppTemplatesModal(),
      renderWhatsAppPhoneNumberModal(),
    ].join('\n');

    document.body.insertAdjacentHTML('beforeend', html);

    // Pre-instancia os modais para manter compatibilidade com chamadas legadas do Bootstrap.
    const ids = [
      'modal-whatsapp-numbers',
      'modal-whatsapp-config',
      'modal-tag-form',
      'modal-quick-message-form',
      'modal-whatsapp-stats',
      'modal-whatsapp-agents',
      'modal-whatsapp-send-template',
      'modal-whatsapp-templates',
      'phone-number-modal',
    ];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el && window.bootstrap?.Modal?.getOrCreateInstance) {
        window.bootstrap.Modal.getOrCreateInstance(el);
      }
    });
  },
};
