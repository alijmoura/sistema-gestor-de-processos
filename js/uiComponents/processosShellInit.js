import { FiltersOffcanvas } from '../offcanvas/FiltersOffcanvas.js';
import { BulkUpdateCollapse } from '../collapses/BulkUpdateCollapse.js';
import { ConfirmModal } from '../modals/ConfirmModal.js';
import { PendenciaModal } from '../modals/PendenciaModal.js';
import { AddContractModal } from '../modals/AddContractModal.js';
import { DetailsModal } from '../modals/DetailsModal.js';
import aiContractUI from '../aiContractUI.js';

export function initProcessosShellUIComponents() {
  BulkUpdateCollapse.render();
  FiltersOffcanvas.render();
  ConfirmModal.render();
  PendenciaModal.render();
  DetailsModal.render();
  AddContractModal.render();
  aiContractUI.init();

  window.__UI_COMPONENTS_RENDERED__ = true;
  window.dispatchEvent(new CustomEvent('ui:components:rendered'));
}

export default {
  initProcessosShellUIComponents
};
