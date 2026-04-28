import { NotificationCenterOffcanvas } from '../offcanvas/NotificationCenterOffcanvas.js';
import { FiltersOffcanvas } from '../offcanvas/FiltersOffcanvas.js';
import { KpiManagerOffcanvas } from '../offcanvas/KpiManagerOffcanvas.js';
import { WhatsAppNotificationSettingsModal } from '../modals/WhatsAppNotificationSettingsModal.js';
import { WhatsAppAgentModal } from '../modals/WhatsAppAgentModal.js';
import { BulkUpdateCollapse } from '../collapses/BulkUpdateCollapse.js';
import { ConfirmModal } from '../modals/ConfirmModal.js';
import { PendenciaModal } from '../modals/PendenciaModal.js';
import { NotificationSettingsModal } from '../modals/NotificationSettingsModal.js';
import { AddContractModal } from '../modals/AddContractModal.js';
import { DetailsModal } from '../modals/DetailsModal.js';
// AnalystChatOffcanvas removido - chat interno agora integrado ao widget AI (aiChatUI.js)
import { WhatsAppSettingsModals } from '../modals/WhatsAppSettingsModals.js';
import { initWhatsAppConfigModalInlineBehavior } from '../whatsapp/whatsappConfigModalInlineInit.js';
import { AdminSettingsModals } from '../modals/AdminSettingsModals.js';
import { UsersAndStatusModals } from '../modals/UsersAndStatusModals.js';
import { AiAndSlaModals } from '../modals/AiAndSlaModals.js';
import { VendorsModals } from '../modals/VendorsModals.js';
import { StatusWorkflowUnifiedModal } from '../modals/StatusWorkflowUnifiedModal.js';
import aiContractUI from '../aiContractUI.js';

// Inicialização centralizada de componentes injetados no DOM.
// Importante: mantém os mesmos IDs do HTML original para não quebrar referências legadas.

export function initUIComponents(options = {}) {
  const {
    bulkUpdate = true,
    detailsModal = true,
    whatsapp = true,
    admin = true,
    usersAndStatus = true,
    aiAndSla = true,
    vendors = true,
    statusWorkflowUnified = true,
    notificationCenter = true,
    filters = true,
    kpi = true,
    whatsappNotifications = true,
    whatsappAgents = true,
    confirm = true,
    pendencia = true,
    notificationSettings = true,
    addContract = true,
    // analystChat integrado ao widget AI (aiChatUI.js)
  } = options;

  if (bulkUpdate) {
    BulkUpdateCollapse.render();
  }

  if (detailsModal) {
    DetailsModal.render();
  }

  if (whatsapp) {
    WhatsAppSettingsModals.render();
    initWhatsAppConfigModalInlineBehavior();
  }

  if (admin) {
    AdminSettingsModals.render();
  }

  if (usersAndStatus) {
    UsersAndStatusModals.render();
  }

  if (aiAndSla) {
    AiAndSlaModals.render();
  }

  if (vendors) {
    VendorsModals.render();
  }

  if (statusWorkflowUnified) {
    StatusWorkflowUnifiedModal.render();
  }

  if (notificationCenter) {
    NotificationCenterOffcanvas.render();
  }

  if (filters) {
    FiltersOffcanvas.render();
  }

  if (kpi) {
    KpiManagerOffcanvas.render();
  }

  if (whatsappNotifications) {
    WhatsAppNotificationSettingsModal.render();
  }

  if (whatsappAgents) {
    WhatsAppAgentModal.render();
  }

  if (confirm) {
    ConfirmModal.render();
  }

  if (pendencia) {
    PendenciaModal.render();
  }

  if (notificationSettings) {
    NotificationSettingsModal.render();
  }

  if (addContract) {
    AddContractModal.render();
    // Inicializa recursos de IA após renderizar o modal
    aiContractUI.init();
  }

  // Chat interno agora integrado ao widget AI (aiChatUI.js) - nao precisa render separado

  window.__UI_COMPONENTS_RENDERED__ = true;
  window.dispatchEvent(new CustomEvent('ui:components:rendered'));
}

// Mantém compatibilidade retroativa caso algum módulo antigo use o nome anterior.
export const renderUIComponents = initUIComponents;

if (window.__AUTO_RENDER_UI_COMPONENTS__ !== false) {
  renderUIComponents();
}
