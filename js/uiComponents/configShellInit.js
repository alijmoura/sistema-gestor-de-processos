import { initIndexShellUIComponents } from './indexShellInit.js';
import { AdminSettingsModals } from '../modals/AdminSettingsModals.js';
import { UsersAndStatusModals } from '../modals/UsersAndStatusModals.js';
import { AiAndSlaModals } from '../modals/AiAndSlaModals.js';
import { VendorsModals } from '../modals/VendorsModals.js';
import { StatusWorkflowUnifiedModal } from '../modals/StatusWorkflowUnifiedModal.js';

export function initConfigShellUIComponents() {
  initIndexShellUIComponents();
  AdminSettingsModals.render();
  UsersAndStatusModals.render();
  AiAndSlaModals.render();
  VendorsModals.render();
  StatusWorkflowUnifiedModal.render();
}

export default {
  initConfigShellUIComponents
};
