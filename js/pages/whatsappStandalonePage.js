let whatsappLoadPromise = null;

async function ensureWhatsAppModulesLoaded() {
  if (whatsappLoadPromise) {
    return whatsappLoadPromise;
  }

  whatsappLoadPromise = (async () => {
    const [{ default: whatsappUI }] = await Promise.all([
      import('../whatsappUI.js'),
      import('../whatsappConfig.js'),
      import('../whatsappTags.js'),
      import('../whatsappQuickMessages.js'),
      import('../whatsappTagsUI.js'),
      import('../whatsappQuickMessagesUI.js')
    ]);

    try {
      const { default: whatsappAttachmentsModule } = await import('../whatsappAttachments.js');
      if (typeof whatsappAttachmentsModule.init === 'function') {
        whatsappAttachmentsModule.init();
      }
    } catch (error) {
      console.warn('[WhatsAppStandalone] Falha ao carregar módulo de anexos:', error);
    }

    try {
      const { default: whatsappNotificationsModule } = await import('../whatsappNotifications.js');
      if (typeof whatsappNotificationsModule.init === 'function') {
        await whatsappNotificationsModule.init();
      }
    } catch (error) {
      console.warn('[WhatsAppStandalone] Falha ao carregar notificações do WhatsApp:', error);
    }

    try {
      const { whatsappTemplateService } = await import('../whatsappTemplateService.js');
      window.__WHATSAPP_TEMPLATE_SERVICE__ = whatsappTemplateService;
      const { initWhatsAppTemplateUI } = await import('../whatsappTemplateUI.js');
      initWhatsAppTemplateUI();
    } catch (error) {
      console.warn('[WhatsAppStandalone] Falha ao carregar templates do WhatsApp:', error);
    }

    if (typeof whatsappUI.init === 'function') {
      await whatsappUI.init();
    }

    return whatsappUI;
  })();

  return whatsappLoadPromise;
}

export default {
  async initialize() {
    await ensureWhatsAppModulesLoaded();
  },
  async refresh() {
    const whatsappUI = await ensureWhatsAppModulesLoaded();
    if (typeof whatsappUI.setChatsFilter === 'function') {
      whatsappUI.setChatsFilter('all');
    }
  },
  async dispose() {
    return undefined;
  }
};
