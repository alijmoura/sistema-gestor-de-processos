const state = {
  context: {
    mode: "active",
    beforeMutate: async () => null,
    loadContract: async () => null,
    loadUsers: async () => [],
    onRestored: async () => undefined,
  },
  sourceContract: null,
  restorePromise: null,
};

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getModalRoot() {
  return document.getElementById("details-modal");
}

function getContractId(explicitId = null) {
  if (explicitId) return explicitId;
  if (state.sourceContract?.id) return state.sourceContract.id;
  return document.getElementById("modal-contract-id")?.value || "";
}

function setModalModeDataset(mode = "active", restored = false) {
  const modalRoot = getModalRoot();
  if (!modalRoot) return;

  modalRoot.dataset.detailsMode = mode;
  modalRoot.dataset.detailsRestored = restored ? "true" : "false";
}

function renderHistoryPlaceholder() {
  const historyList = document.getElementById("modal-history-list");
  if (!historyList) return;

  historyList.innerHTML = `
    <div class="alert alert-secondary mb-0">
      <i class="bi bi-archive me-2"></i>
      O histórico completo fica disponível após restaurar este processo para a listagem ativa.
    </div>
  `;
}

function renderAttachmentsPlaceholder() {
  const attachmentsList = document.getElementById("anexos-list");
  if (!attachmentsList) return;

  attachmentsList.innerHTML = `
    <li class="text-muted text-center py-3">
      <i class="bi bi-archive me-2"></i>
      Os anexos desta aba serão habilitados após a restauração do processo.
    </li>
  `;
}

function renderErrorsPlaceholder() {
  const errorsContainer = document.getElementById("details-erros-container");
  if (!errorsContainer) return;

  errorsContainer.innerHTML = `
    <div class="alert alert-secondary mb-0">
      <i class="bi bi-archive me-2"></i>
      A gestão de erros (QA) será carregada após a restauração do processo para <code>contracts</code>.
    </div>
  `;
}

function renderPendenciasPlaceholder() {
  const loader = document.getElementById("pendencias-loader");
  const emptyState = document.getElementById("pendencias-empty");
  const list = document.getElementById("pendencias-lista");
  const toggleContainer = document.getElementById("pendencias-toggle-resolvidas-container");
  const countBadge = document.getElementById("pendencias-count-badge");
  const tabBadge = document.getElementById("tab-pendencias-badge");
  const addButton = document.getElementById("nova-pendencia-btn");
  const addEmptyButton = document.getElementById("nova-pendencia-empty-btn");

  if (loader) {
    loader.style.display = "none";
  }

  if (list) {
    list.innerHTML = "";
    list.style.display = "none";
  }

  if (toggleContainer) {
    toggleContainer.style.display = "none";
  }

  if (countBadge) {
    countBadge.textContent = "0";
  }

  if (tabBadge) {
    tabBadge.textContent = "0";
    tabBadge.style.display = "none";
  }

  if (addButton) {
    addButton.disabled = true;
  }

  if (addEmptyButton) {
    addEmptyButton.disabled = true;
  }

  if (emptyState) {
    emptyState.classList.remove("d-none");
    emptyState.innerHTML = `
      <i class="bi bi-archive text-secondary icon-xl"></i>
      <h5 class="mt-3 text-muted">Pendências disponíveis após restauração</h5>
      <p class="text-muted small mb-0">
        Esta aba depende da coleção ativa <code>contracts</code>. Restaure o processo ao salvar ou alterar o status para continuar.
      </p>
    `;
  }
}

function clearPendenciasButtonsDisabledState() {
  const addButton = document.getElementById("nova-pendencia-btn");
  const addEmptyButton = document.getElementById("nova-pendencia-empty-btn");

  if (addButton) {
    addButton.disabled = false;
  }

  if (addEmptyButton) {
    addEmptyButton.disabled = false;
  }
}

export function configureDetailsModalContext(context = {}) {
  state.context = {
    mode: context.mode === "archived" ? "archived" : "active",
    beforeMutate:
      typeof context.beforeMutate === "function"
        ? context.beforeMutate
        : async () => null,
    loadContract:
      typeof context.loadContract === "function"
        ? context.loadContract
        : async () => null,
    loadUsers:
      typeof context.loadUsers === "function"
        ? context.loadUsers
        : async () => [],
    onRestored:
      typeof context.onRestored === "function"
        ? context.onRestored
        : async () => undefined,
  };

  state.restorePromise = null;
  setModalModeDataset(state.context.mode, false);
}

export function getDetailsModalContext() {
  return state.context;
}

export function setDetailsModalSourceContract(contract = null) {
  state.sourceContract = contract || null;
}

export function getDetailsModalSourceContract() {
  return state.sourceContract;
}

export function isDetailsModalArchivedPendingRestore() {
  return state.context.mode === "archived";
}

export function applyArchivedDetailsModalState(contract = null) {
  setDetailsModalSourceContract(contract || state.sourceContract);
  setModalModeDataset("archived", false);
  renderHistoryPlaceholder();
  renderAttachmentsPlaceholder();
  renderErrorsPlaceholder();
  renderPendenciasPlaceholder();

  const errorsBadge = document.getElementById("tab-gestao-erros-badge");
  if (errorsBadge) {
    errorsBadge.textContent = "0";
    errorsBadge.style.display = "none";
  }
}

export function clearArchivedDetailsModalState() {
  setModalModeDataset("active", state.context.mode !== "archived");
  clearPendenciasButtonsDisabledState();
  document.dispatchEvent(
    new CustomEvent("details-modal:mode-active", {
      detail: {
        contractId: getContractId(),
      },
    })
  );
}

export async function loadDetailsModalUsers() {
  return await state.context.loadUsers();
}

export async function ensureDetailsModalReadyForMutation(action, options = {}) {
  if (state.context.mode !== "archived") {
    return {
      restored: false,
      contract: state.sourceContract,
      users: await loadDetailsModalUsers(),
    };
  }

  if (state.restorePromise) {
    const contract = await state.restorePromise;
    return {
      restored: true,
      contract,
      users: await loadDetailsModalUsers(),
    };
  }

  const contractId = getContractId(options.contractId);
  if (!contractId) {
    throw new Error("ID do contrato não encontrado para restaurar o modal de detalhes.");
  }

  state.restorePromise = (async () => {
    const restoreResult = await state.context.beforeMutate(
      contractId,
      action,
      state.sourceContract
    );

    const loadedContract = await state.context.loadContract(
      contractId,
      {
        action,
        restoreResult,
        sourceContract: state.sourceContract,
      }
    );

    const activeContract = loadedContract || restoreResult || state.sourceContract;
    state.sourceContract = activeContract || state.sourceContract;
    state.context = {
      ...state.context,
      mode: "active",
    };
    setModalModeDataset("active", true);
    clearPendenciasButtonsDisabledState();

    await state.context.onRestored(contractId, activeContract, {
      action,
      restoreResult,
      sourceContract: state.sourceContract,
    });

    document.dispatchEvent(
      new CustomEvent("details-modal:restored", {
        detail: {
          contractId,
          action,
          contract: activeContract,
        },
      })
    );

    return activeContract;
  })();

  try {
    const contract = await state.restorePromise;
    return {
      restored: true,
      contract,
      users: await loadDetailsModalUsers(),
    };
  } finally {
    state.restorePromise = null;
  }
}

export function getArchivedDetailsPlaceholderMarkup(type = "generic") {
  const contractId = escapeHtml(getContractId());

  switch (type) {
    case "anexos":
      return `
        <li class="text-muted text-center py-3">
          <i class="bi bi-archive me-2"></i>
          Os anexos do processo <code>${contractId || "sem-id"}</code> serão exibidos após a restauração.
        </li>
      `;
    case "erros":
      return `
        <div class="alert alert-secondary mb-0">
          <i class="bi bi-archive me-2"></i>
          Os erros de QA serão carregados após a restauração do processo <code>${contractId || "sem-id"}</code>.
        </div>
      `;
    default:
      return `
        <div class="alert alert-secondary mb-0">
          <i class="bi bi-archive me-2"></i>
          Este conteúdo será disponibilizado após a restauração do processo arquivado.
        </div>
      `;
  }
}
