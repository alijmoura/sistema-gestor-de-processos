/**
 * @file AprovacaoConvertProcessModal.js
 * @description Modal para selecionar workflow e status ao converter aprovacao em processo.
 */

import workflowService from '../workflowService.js';
import { listStatuses } from '../firestoreService.js';
import { CONVERSAO_PROCESSO_DEFAULTS } from '../aprovacaoService.js';

const MODAL_ID = 'aprovacao-convert-process-modal';
const FORM_ID = 'aprovacao-convert-process-form';
const WORKFLOW_SELECT_ID = 'aprovacao-convert-workflow';
const STATUS_SELECT_ID = 'aprovacao-convert-status';
const WARNING_ID = 'aprovacao-convert-process-warning';
const CLIENT_NAME_ID = 'aprovacao-convert-process-client';

let modalInstance = null;

function render() {
  const existing = document.getElementById(MODAL_ID);
  if (existing) {
    return existing;
  }

  const html = `
    <div class="modal fade" id="${MODAL_ID}" tabindex="-1" aria-labelledby="${MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="${MODAL_ID}-title">
              <i class="bi bi-arrow-right-circle me-2"></i>
              Converter para Processo
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">
            <p class="mb-3">
              Selecione o workflow e o status inicial para o processo de
              <strong id="${CLIENT_NAME_ID}">cliente</strong>.
            </p>

            <div id="${WARNING_ID}" class="alert alert-warning py-2 small d-none" role="alert"></div>

            <form id="${FORM_ID}" class="needs-validation" novalidate>
              <div class="mb-3">
                <label for="${WORKFLOW_SELECT_ID}" class="form-label">Workflow</label>
                <select id="${WORKFLOW_SELECT_ID}" class="form-select" required></select>
                <div class="invalid-feedback">Selecione um workflow.</div>
              </div>

              <div>
                <label for="${STATUS_SELECT_ID}" class="form-label">Status inicial</label>
                <select id="${STATUS_SELECT_ID}" class="form-select" required></select>
                <div class="invalid-feedback">Selecione um status inicial.</div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">
              Cancelar
            </button>
            <button type="submit" class="btn btn-success" form="${FORM_ID}">
              <i class="bi bi-check-circle me-1"></i>Converter
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  return document.getElementById(MODAL_ID);
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}

function toWorkflowOptions(rawWorkflows = []) {
  return rawWorkflows
    .filter((workflow) => workflow && workflow.id)
    .map((workflow) => ({
      value: String(workflow.id).trim(),
      label: String(workflow.name || workflow.id).trim()
    }))
    .filter((option) => option.value);
}

function toStatusOptions(rawStatuses = []) {
  return rawStatuses
    .filter((status) => status && status.text)
    .filter((status) => status.active !== false && status.isActive !== false)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((status) => ({
      value: String(status.text).trim(),
      label: String(status.text).trim()
    }))
    .filter((option) => option.value);
}

function ensureDefaultOption(options, defaultValue, defaultLabel) {
  const normalizedDefault = normalizeText(defaultValue);
  const hasDefault = options.some((option) => normalizeText(option.value) === normalizedDefault);

  if (hasDefault) {
    return options;
  }

  return [{
    value: defaultValue,
    label: defaultLabel
  }, ...options];
}

function renderSelectOptions(selectEl, options) {
  selectEl.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join('');
}

function selectDefaultValue(selectEl, defaultValue) {
  const normalizedDefault = normalizeText(defaultValue);
  const match = Array.from(selectEl.options)
    .find((option) => normalizeText(option.value) === normalizedDefault);

  if (match) {
    selectEl.value = match.value;
    return;
  }

  if (selectEl.options.length > 0) {
    selectEl.selectedIndex = 0;
  }
}

async function loadOptionsIntoForm() {
  const warnings = [];

  const [workflowsResult, statusesResult] = await Promise.allSettled([
    workflowService.getAllWorkflows(),
    listStatuses()
  ]);

  const workflows = workflowsResult.status === 'fulfilled'
    ? toWorkflowOptions(workflowsResult.value || [])
    : [];
  const statuses = statusesResult.status === 'fulfilled'
    ? toStatusOptions(statusesResult.value || [])
    : [];

  if (workflowsResult.status === 'rejected') {
    warnings.push('Nao foi possivel carregar todos os workflows; usando valor padrao.');
  }

  if (statusesResult.status === 'rejected') {
    throw new Error('Nao foi possivel carregar os status da colecao statusConfig.');
  }

  const workflowOptions = ensureDefaultOption(
    workflows,
    CONVERSAO_PROCESSO_DEFAULTS.workflowId,
    'Processo Associativo (padrao)'
  );

  if (statuses.length === 0) {
    throw new Error('Nenhum status ativo encontrado na colecao statusConfig.');
  }

  const statusOptions = statuses;

  const workflowSelect = document.getElementById(WORKFLOW_SELECT_ID);
  const statusSelect = document.getElementById(STATUS_SELECT_ID);

  renderSelectOptions(workflowSelect, workflowOptions);
  renderSelectOptions(statusSelect, statusOptions);

  selectDefaultValue(workflowSelect, CONVERSAO_PROCESSO_DEFAULTS.workflowId);
  selectDefaultValue(statusSelect, CONVERSAO_PROCESSO_DEFAULTS.status);

  const warningEl = document.getElementById(WARNING_ID);
  if (warnings.length > 0) {
    warningEl.textContent = warnings.join(' ');
    warningEl.classList.remove('d-none');
  } else {
    warningEl.classList.add('d-none');
    warningEl.textContent = '';
  }
}

function resolveClientName(aprovacao) {
  return aprovacao?.nomeClientePrincipal
    || aprovacao?.clientePrincipal
    || 'cliente';
}

async function open(aprovacao) {
  const modalEl = render();
  const formEl = document.getElementById(FORM_ID);
  const workflowSelect = document.getElementById(WORKFLOW_SELECT_ID);
  const statusSelect = document.getElementById(STATUS_SELECT_ID);
  const clientNameEl = document.getElementById(CLIENT_NAME_ID);

  clientNameEl.textContent = resolveClientName(aprovacao);
  formEl.classList.remove('was-validated');

  await loadOptionsIntoForm();

  modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl, {
    backdrop: 'static',
    keyboard: true
  });

  return new Promise((resolve) => {
    let resolved = false;

    const finalize = (result) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    const handleSubmit = (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!formEl.checkValidity()) {
        formEl.classList.add('was-validated');
        return;
      }

      finalize({
        workflowId: (workflowSelect.value || '').trim() || CONVERSAO_PROCESSO_DEFAULTS.workflowId,
        status: (statusSelect.value || '').trim()
      });
      modalInstance.hide();
    };

    const handleHidden = () => {
      finalize(null);
    };

    const cleanup = () => {
      formEl.removeEventListener('submit', handleSubmit);
      modalEl.removeEventListener('hidden.bs.modal', handleHidden);
    };

    formEl.addEventListener('submit', handleSubmit);
    modalEl.addEventListener('hidden.bs.modal', handleHidden);

    modalInstance.show();
  });
}

const aprovacaoConvertProcessModal = {
  open
};

export default aprovacaoConvertProcessModal;
