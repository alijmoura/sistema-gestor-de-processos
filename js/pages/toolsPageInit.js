/**
 * @file toolsPageInit.js
 * @description Inicialização da página de ferramentas e recursos utilitários.
 */

import { showNotification } from "../ui.js";

const MIN_FILES_TO_MERGE = 2;

const state = {
  initialized: false,
  workspace: {
    pages: [],
    processing: false
  },
  files: [],
  processing: false,
  draggingId: null,
  unlock: {
    file: null,
    processing: false
  },
  split: {
    file: null,
    processing: false
  },
  toJpg: {
    file: null,
    processing: false
  },
  organize: {
    file: null,
    pages: [],
    processing: false,
    draggingId: null
  },
  rotate: {
    file: null,
    processing: false
  }
};

let elements = {};

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function buildFileFingerprint(file) {
  if (!file) return "";
  return [file.name || "", file.size || 0, file.lastModified || 0].join("::");
}

function updateSelectedFileLabel(target, file, emptyText = "Nenhum arquivo selecionado.") {
  if (!target) return;
  if (!file) {
    target.textContent = emptyText;
    target.classList.add("text-muted");
    return;
  }
  target.textContent = `${file.name} (${formatFileSize(file.size)})`;
  target.classList.remove("text-muted");
}

function setToolStatus(target, message, tone = "muted") {
  if (!target) return;
  target.textContent = message;
  target.classList.remove("text-muted", "text-danger", "text-success");
  if (tone === "error") {
    target.classList.add("text-danger");
    return;
  }
  if (tone === "success") {
    target.classList.add("text-success");
    return;
  }
  target.classList.add("text-muted");
}

function setStatus(message, tone = "muted") {
  setToolStatus(elements.status, message, tone);
}

function setZoneActive(zone, isActive) {
  if (!zone) return;
  zone.classList.toggle("border-primary", isActive);
  zone.classList.toggle("border-secondary", !isActive);
  zone.classList.toggle("bg-white", isActive);
  zone.classList.toggle("bg-body-tertiary", !isActive);
  zone.classList.toggle("shadow-sm", isActive);
}

function setDropzoneActive(isActive) {
  setZoneActive(elements.dropzone, isActive);
}

function updateActions() {
  if (!elements.mergeButton || !elements.clearButton) return;
  const hasFiles = state.files.length > 0;
  const canMerge = state.files.length >= MIN_FILES_TO_MERGE && !state.processing;
  elements.mergeButton.disabled = !canMerge;
  elements.clearButton.disabled = !hasFiles || state.processing;
}

function updateWorkspaceActions() {
  if (!elements.workspaceButton || !elements.workspaceClear) return;
  const hasPages = state.workspace.pages.length > 0;
  const isBusy = state.workspace.processing;
  elements.workspaceButton.disabled = !hasPages || isBusy;
  elements.workspaceClear.disabled = !hasPages || isBusy;
}

function updateUnlockActions() {
  if (!elements.unlockButton) return;
  const canUnlock = state.unlock.file && !state.unlock.processing;
  elements.unlockButton.disabled = !canUnlock;
}

function updateSplitActions() {
  if (!elements.splitButton || !elements.splitClear) return;
  const canSplit = state.split.file && !state.split.processing;
  elements.splitButton.disabled = !canSplit;
  elements.splitClear.disabled = !state.split.file || state.split.processing;
}

function updateToJpgActions() {
  if (!elements.toJpgButton) return;
  const canConvert = state.toJpg.file && !state.toJpg.processing;
  elements.toJpgButton.disabled = !canConvert;
}

function updateOrganizeActions() {
  if (!elements.organizeButton || !elements.organizeClear) return;
  const canOrganize = state.organize.file && state.organize.pages.length > 0 && !state.organize.processing;
  elements.organizeButton.disabled = !canOrganize;
  elements.organizeClear.disabled = !state.organize.file || state.organize.processing;
}

function updateRotateActions() {
  if (!elements.rotateButton || !elements.rotateClear) return;
  const canRotate = state.rotate.file && !state.rotate.processing;
  elements.rotateButton.disabled = !canRotate;
  elements.rotateClear.disabled = !state.rotate.file || state.rotate.processing;
}

function setUnlockStatus(message, tone = "muted") {
  setToolStatus(elements.unlockStatus, message, tone);
}

function setWorkspaceStatus(message, tone = "muted") {
  setToolStatus(elements.workspaceStatus, message, tone);
}

function setSplitStatus(message, tone = "muted") {
  setToolStatus(elements.splitStatus, message, tone);
}

function setToJpgStatus(message, tone = "muted") {
  setToolStatus(elements.toJpgStatus, message, tone);
}

function setOrganizeStatus(message, tone = "muted") {
  setToolStatus(elements.organizeStatus, message, tone);
}

function setRotateStatus(message, tone = "muted") {
  setToolStatus(elements.rotateStatus, message, tone);
}

function renderList() {
  if (!elements.list || !elements.emptyState) return;
  elements.list.innerHTML = "";
  elements.list.setAttribute("aria-dropeffect", state.processing ? "none" : "move");
  if (state.files.length === 0) {
    elements.emptyState.classList.remove("d-none");
    return;
  }
  elements.emptyState.classList.add("d-none");

  state.files.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "list-group-item d-flex flex-wrap align-items-center justify-content-between gap-3 pdf-merge-item";
    li.dataset.fileId = item.id;
    li.draggable = !state.processing;
    li.classList.toggle("opacity-75", state.processing);
    li.classList.toggle("cursor-not-allowed", state.processing);
    li.classList.toggle("cursor-grab", !state.processing);
    li.classList.remove("cursor-grabbing");
    li.setAttribute("aria-grabbed", "false");

    const infoWrapper = document.createElement("div");
    infoWrapper.className = "d-flex align-items-center gap-3";

    const dragHandle = document.createElement("i");
    dragHandle.className = "bi bi-grip-vertical text-muted";
    dragHandle.setAttribute("aria-hidden", "true");
    dragHandle.classList.add("fs-5");

    const orderBadge = document.createElement("span");
    orderBadge.className = "badge text-bg-light border";
    orderBadge.textContent = String(index + 1);

    const textWrapper = document.createElement("div");
    textWrapper.className = "d-flex flex-column";

    const name = document.createElement("span");
    name.className = "fw-semibold";
    name.textContent = item.file.name;

    const size = document.createElement("small");
    size.className = "text-muted";
    size.textContent = formatFileSize(item.file.size);

    textWrapper.appendChild(name);
    textWrapper.appendChild(size);
    infoWrapper.appendChild(dragHandle);
    infoWrapper.appendChild(orderBadge);
    infoWrapper.appendChild(textWrapper);

    const actions = document.createElement("div");
    actions.className = "btn-group btn-group-sm";
    actions.setAttribute("role", "group");

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "btn btn-outline-secondary";
    upButton.dataset.action = "up";
    upButton.dataset.fileId = item.id;
    upButton.disabled = index === 0 || state.processing;
    upButton.setAttribute("aria-label", "Mover para cima");
    upButton.innerHTML = '<i class="bi bi-arrow-up"></i>';

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.className = "btn btn-outline-secondary";
    downButton.dataset.action = "down";
    downButton.dataset.fileId = item.id;
    downButton.disabled = index === state.files.length - 1 || state.processing;
    downButton.setAttribute("aria-label", "Mover para baixo");
    downButton.innerHTML = '<i class="bi bi-arrow-down"></i>';

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn btn-outline-danger";
    removeButton.dataset.action = "remove";
    removeButton.dataset.fileId = item.id;
    removeButton.disabled = state.processing;
    removeButton.setAttribute("aria-label", "Remover arquivo");
    removeButton.innerHTML = '<i class="bi bi-x-lg"></i>';

    actions.appendChild(upButton);
    actions.appendChild(downButton);
    actions.appendChild(removeButton);

    li.appendChild(infoWrapper);
    li.appendChild(actions);
    elements.list.appendChild(li);
  });
}

function renderOrganizeList() {
  if (!elements.organizeList || !elements.organizeEmpty) return;
  elements.organizeList.innerHTML = "";
  elements.organizeList.setAttribute("aria-dropeffect", state.organize.processing ? "none" : "move");
  if (state.organize.pages.length === 0) {
    elements.organizeEmpty.classList.remove("d-none");
    return;
  }
  elements.organizeEmpty.classList.add("d-none");

  state.organize.pages.forEach((page, index) => {
    const li = document.createElement("li");
    li.className = "list-group-item d-flex flex-wrap align-items-center justify-content-between gap-3 pdf-organize-item";
    li.dataset.pageId = page.id;
    li.draggable = !state.organize.processing;
    li.classList.toggle("opacity-75", state.organize.processing);
    li.classList.toggle("cursor-not-allowed", state.organize.processing);
    li.classList.toggle("cursor-grab", !state.organize.processing);
    li.classList.remove("cursor-grabbing");
    li.setAttribute("aria-grabbed", "false");

    const infoWrapper = document.createElement("div");
    infoWrapper.className = "d-flex align-items-center gap-3";

    const preview = document.createElement("div");
    preview.className = "pdf-page-preview flex-shrink-0";
    if (page.previewDataUrl) {
      const image = document.createElement("img");
      image.src = page.previewDataUrl;
      image.alt = `Previa da pagina ${page.originalPage}`;
      preview.appendChild(image);
    } else {
      const fallbackIcon = document.createElement("i");
      fallbackIcon.className = "bi bi-file-earmark-pdf text-danger";
      fallbackIcon.setAttribute("aria-hidden", "true");
      preview.appendChild(fallbackIcon);
    }

    const dragHandle = document.createElement("i");
    dragHandle.className = "bi bi-grip-vertical text-muted";
    dragHandle.setAttribute("aria-hidden", "true");
    dragHandle.classList.add("fs-5");

    const orderBadge = document.createElement("span");
    orderBadge.className = "badge text-bg-light border";
    orderBadge.textContent = String(index + 1);

    const textWrapper = document.createElement("div");
    textWrapper.className = "d-flex flex-column";

    const name = document.createElement("span");
    name.className = "fw-semibold";
    name.textContent = `Página ${page.originalPage}`;

    const hint = document.createElement("small");
    hint.className = "text-muted";
    hint.textContent = "Arraste para reorganizar";

    textWrapper.appendChild(name);
    textWrapper.appendChild(hint);
    infoWrapper.appendChild(preview);
    infoWrapper.appendChild(dragHandle);
    infoWrapper.appendChild(orderBadge);
    infoWrapper.appendChild(textWrapper);

    const actions = document.createElement("div");
    actions.className = "btn-group btn-group-sm";
    actions.setAttribute("role", "group");

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "btn btn-outline-secondary";
    upButton.dataset.action = "up";
    upButton.dataset.pageId = page.id;
    upButton.disabled = index === 0 || state.organize.processing;
    upButton.setAttribute("aria-label", "Mover página para cima");
    upButton.innerHTML = '<i class="bi bi-arrow-up"></i>';

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.className = "btn btn-outline-secondary";
    downButton.dataset.action = "down";
    downButton.dataset.pageId = page.id;
    downButton.disabled = index === state.organize.pages.length - 1 || state.organize.processing;
    downButton.setAttribute("aria-label", "Mover página para baixo");
    downButton.innerHTML = '<i class="bi bi-arrow-down"></i>';

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn btn-outline-danger";
    removeButton.dataset.action = "remove";
    removeButton.dataset.pageId = page.id;
    removeButton.disabled = state.organize.processing;
    removeButton.setAttribute("aria-label", "Remover página");
    removeButton.innerHTML = '<i class="bi bi-x-lg"></i>';

    actions.appendChild(upButton);
    actions.appendChild(downButton);
    actions.appendChild(removeButton);

    li.appendChild(infoWrapper);
    li.appendChild(actions);
    elements.organizeList.appendChild(li);
  });
}

function notify(message, type = "success") {
  if (typeof showNotification === "function") {
    showNotification(message, type);
  }
}

function resolvePdfLib(statusTarget) {
  const pdfLib = window.PDFLib;
  if (!pdfLib?.PDFDocument) {
    notify("Biblioteca de PDF indisponível. Tente recarregar a página.", "error");
    setToolStatus(statusTarget, "Biblioteca de PDF indisponível.", "error");
    return null;
  }
  return pdfLib;
}

function resolveZipLib(statusTarget) {
  const zipLib = window.JSZip;
  if (typeof zipLib !== "function") {
    notify("Biblioteca de compactacao indisponivel. Tente recarregar a pagina.", "error");
    setToolStatus(statusTarget, "Biblioteca de compactacao indisponivel.", "error");
    return null;
  }
  return zipLib;
}

function getFileBaseName(fileName, fallback = "arquivo") {
  const rawName = String(fileName || "")
    .replace(/\.[^/.]+$/, "")
    .trim();
  const normalized = rawName
    .replace(/[^\w-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function downloadBlob(blob, filename) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadPdfBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  downloadBlob(blob, filename);
}

function isPdfFile(file) {
  if (!file) return false;
  const name = file.name?.toLowerCase() || "";
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

function createSequentialPageList(totalPages) {
  return Array.from({ length: totalPages }, (_, index) => index + 1);
}

function parsePageSelection(rawValue, totalPages, options = {}) {
  const { allowEmpty = false } = options;
  const source = String(rawValue || "").trim();

  if (!source) {
    if (allowEmpty) {
      return createSequentialPageList(totalPages);
    }
    throw new Error("Informe as paginas ou intervalos desejados.");
  }

  const selectedPages = new Set();
  const tokens = source.split(",").map((token) => token.trim()).filter(Boolean);

  tokens.forEach((token) => {
    if (/^\d+$/.test(token)) {
      const pageNumber = Number.parseInt(token, 10);
      if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > totalPages) {
        throw new Error(`Pagina fora do intervalo permitido: ${token}.`);
      }
      selectedPages.add(pageNumber);
      return;
    }

    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!rangeMatch) {
      throw new Error(`Intervalo invalido: ${token}.`);
    }

    const start = Number.parseInt(rangeMatch[1], 10);
    const end = Number.parseInt(rangeMatch[2], 10);

    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1 || start > end || end > totalPages) {
      throw new Error(`Intervalo invalido: ${token}.`);
    }

    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      selectedPages.add(pageNumber);
    }
  });

  return Array.from(selectedPages).sort((left, right) => left - right);
}

function isDuplicate(file) {
  return state.files.some(
    (item) =>
      item.file.name === file.name &&
      item.file.size === file.size &&
      item.file.lastModified === file.lastModified
  );
}

function addFiles(fileList) {
  const newFiles = Array.from(fileList || []);
  if (newFiles.length === 0) return;

  const invalidFiles = newFiles.filter((file) => !isPdfFile(file));
  const acceptedFiles = newFiles.filter((file) => isPdfFile(file) && !isDuplicate(file));

  if (invalidFiles.length > 0) {
    notify("Apenas arquivos PDF são aceitos.", "error");
  }

  if (acceptedFiles.length === 0) {
    return;
  }

  const mapped = acceptedFiles.map((file) => ({
    id: createId(),
    file
  }));
  state.files = state.files.concat(mapped);
  renderList();
  updateActions();
  setStatus("");
}

function clearFiles() {
  state.files = [];
  if (elements.input) {
    elements.input.value = "";
  }
  renderList();
  updateActions();
  setStatus("");
}

function isWorkspaceDuplicate(file) {
  const fingerprint = buildFileFingerprint(file);
  return state.workspace.pages.some((pageItem) => pageItem.fileFingerprint === fingerprint);
}

async function loadWorkspacePagesFromFile(file, fileOrder, pdfLib) {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await pdfLib.PDFDocument.load(bytes, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();
  const pageItems = [];
  const pdfjsLib = window.pdfjsLib;
  let previewDoc = null;

  if (pdfjsLib?.getDocument) {
    previewDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
  }

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    let previewDataUrl = null;

    if (previewDoc) {
      const previewPage = await previewDoc.getPage(pageNumber);
      const baseViewport = previewPage.getViewport({ scale: 1 });
      const scale = Math.min(0.32, 120 / Math.max(baseViewport.width, 1));
      const viewport = previewPage.getViewport({ scale: Math.max(0.12, scale) });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context) {
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        await previewPage.render({ canvasContext: context, viewport }).promise;
        previewDataUrl = canvas.toDataURL("image/jpeg", 0.76);
      }
    }

    pageItems.push({
      id: createId(),
      file,
      fileFingerprint: buildFileFingerprint(file),
      fileOrder,
      sourcePageIndex: pageNumber - 1,
      sourcePageNumber: pageNumber,
      previewDataUrl,
      rotation: 0
    });
  }

  return pageItems;
}

async function addFilesToWorkspace(fileList) {
  const newFiles = Array.from(fileList || []);
  if (newFiles.length === 0 || state.workspace.processing) return;

  const invalidFiles = newFiles.filter((file) => !isPdfFile(file));
  const acceptedFiles = newFiles.filter((file) => isPdfFile(file) && !isWorkspaceDuplicate(file));

  if (invalidFiles.length > 0) {
    notify("Apenas arquivos PDF sao aceitos.", "error");
  }

  if (acceptedFiles.length === 0) {
    return;
  }

  const pdfLib = resolvePdfLib(elements.workspaceStatus);
  if (!pdfLib) return;

  state.workspace.processing = true;
  updateWorkspaceActions();
  setWorkspaceStatus("Carregando paginas para a bancada...");

  try {
    const currentFileOrder = state.workspace.pages.reduce((maxValue, pageItem) => Math.max(maxValue, pageItem.fileOrder || 0), 0);

    for (let index = 0; index < acceptedFiles.length; index += 1) {
      const file = acceptedFiles[index];
      setWorkspaceStatus(`Carregando ${index + 1} de ${acceptedFiles.length}: ${file.name}`);
      const pageItems = await loadWorkspacePagesFromFile(file, currentFileOrder + index + 1, pdfLib);
      state.workspace.pages = state.workspace.pages.concat(pageItems);
      renderWorkspaceList();
    }

    notify("PDFs adicionados a bancada com sucesso.", "success");
    setWorkspaceStatus("Paginas prontas para montar o PDF final.", "success");
  } catch (error) {
    console.error("[Ferramentas] Erro ao carregar a bancada de PDF:", error);
    notify("Nao foi possivel carregar os PDFs na bancada.", "error");
    setWorkspaceStatus(error.message || "Erro ao carregar os PDFs.", "error");
  } finally {
    state.workspace.processing = false;
    renderWorkspaceList();
    updateWorkspaceActions();
  }
}

function clearWorkspaceState() {
  state.workspace.pages = [];
  state.workspace.processing = false;
  if (elements.workspaceInput) {
    elements.workspaceInput.value = "";
  }
  renderWorkspaceList();
  updateWorkspaceActions();
  setWorkspaceStatus("");
}

function handleWorkspaceListAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || state.workspace.processing) return;
  const { action, pageId } = button.dataset;
  if (!action || !pageId) return;

  const index = state.workspace.pages.findIndex((pageItem) => pageItem.id === pageId);
  if (index === -1) return;

  if (action === "remove") {
    state.workspace.pages.splice(index, 1);
  }

  if (action === "up" && index > 0) {
    const [pageItem] = state.workspace.pages.splice(index, 1);
    state.workspace.pages.splice(index - 1, 0, pageItem);
  }

  if (action === "down" && index < state.workspace.pages.length - 1) {
    const [pageItem] = state.workspace.pages.splice(index, 1);
    state.workspace.pages.splice(index + 1, 0, pageItem);
  }

  if (action === "rotate-left") {
    state.workspace.pages[index].rotation = (state.workspace.pages[index].rotation + 270) % 360;
  }

  if (action === "rotate-right") {
    state.workspace.pages[index].rotation = (state.workspace.pages[index].rotation + 90) % 360;
  }

  renderWorkspaceList();
  updateWorkspaceActions();
}

async function generateWorkspacePdf() {
  if (state.workspace.processing) return;
  if (state.workspace.pages.length === 0) {
    notify("Adicione paginas a bancada antes de gerar o PDF.", "error");
    return;
  }

  const pdfLib = resolvePdfLib(elements.workspaceStatus);
  if (!pdfLib) return;

  state.workspace.processing = true;
  updateWorkspaceActions();
  renderWorkspaceList();
  setWorkspaceStatus("Gerando PDF final...");

  try {
    const outputDoc = await pdfLib.PDFDocument.create();
    const sourceCache = new Map();

    for (let index = 0; index < state.workspace.pages.length; index += 1) {
      const pageItem = state.workspace.pages[index];
      setWorkspaceStatus(`Aplicando pagina ${index + 1} de ${state.workspace.pages.length}...`);

      let sourceDoc = sourceCache.get(pageItem.fileFingerprint);
      if (!sourceDoc) {
        sourceDoc = await pdfLib.PDFDocument.load(await pageItem.file.arrayBuffer(), { ignoreEncryption: true });
        sourceCache.set(pageItem.fileFingerprint, sourceDoc);
      }

      const [copiedPage] = await outputDoc.copyPages(sourceDoc, [pageItem.sourcePageIndex]);
      const currentAngle = copiedPage.getRotation()?.angle || 0;
      copiedPage.setRotation(pdfLib.degrees((currentAngle + pageItem.rotation) % 360));
      outputDoc.addPage(copiedPage);
    }

    const outputBytes = await outputDoc.save();
    downloadPdfBytes(outputBytes, buildDownloadName("pdf-montado"));
    notify("PDF montado com sucesso.", "success");
    setWorkspaceStatus("PDF final gerado. Download iniciado.", "success");
  } catch (error) {
    console.error("[Ferramentas] Erro ao gerar PDF da bancada:", error);
    notify("Nao foi possivel gerar o PDF final.", "error");
    setWorkspaceStatus(error.message || "Erro ao gerar o PDF final.", "error");
  } finally {
    state.workspace.processing = false;
    renderWorkspaceList();
    updateWorkspaceActions();
  }
}

function setUnlockFile(file, { resetInput = false } = {}) {
  if (file && !isPdfFile(file)) {
    notify("Selecione um arquivo PDF válido.", "error");
    state.unlock.file = null;
    if (elements.unlockInput) {
      elements.unlockInput.value = "";
    }
  } else {
    state.unlock.file = file;
    if (resetInput && elements.unlockInput) {
      elements.unlockInput.value = "";
    }
  }
  updateSelectedFileLabel(elements.unlockSelected, state.unlock.file);
  updateUnlockActions();
  setUnlockStatus("");
}

function handleUnlockFileChange(event) {
  setUnlockFile(event.target.files?.[0] || null);
}

async function unlockPdf() {
  if (state.unlock.processing) return;
  if (!state.unlock.file) {
    notify("Selecione um PDF para desbloquear.", "error");
    return;
  }

  const pdfLib = resolvePdfLib(elements.unlockStatus);
  if (!pdfLib) return;

  state.unlock.processing = true;
  updateUnlockActions();
  setUnlockStatus("Desbloqueando PDF...");

  try {
    const bytes = await state.unlock.file.arrayBuffer();
    const sourceDoc = await pdfLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const unlockedDoc = await pdfLib.PDFDocument.create();
    const pageIndices = sourceDoc.getPageIndices();
    const pages = await unlockedDoc.copyPages(sourceDoc, pageIndices);
    pages.forEach((page) => unlockedDoc.addPage(page));
    const unlockedBytes = await unlockedDoc.save();
    downloadPdfBytes(unlockedBytes, buildDownloadName("pdf-desbloqueado"));
    notify("PDF desbloqueado com sucesso.", "success");
    setUnlockStatus("PDF desbloqueado pronto. Download iniciado.", "success");
  } catch (error) {
    console.error("[Ferramentas] Erro ao desbloquear PDF:", error);
    notify("Não foi possível desbloquear o PDF.", "error");
    setUnlockStatus("Erro ao desbloquear PDF.", "error");
  } finally {
    state.unlock.processing = false;
    updateUnlockActions();
  }
}

function updateSplitRangeHint() {
  if (!elements.splitRangeHelp) return;
  const isIndividualMode = elements.splitMode?.value === "individual";
  elements.splitRangeHelp.textContent = isIndividualMode
    ? "Campo opcional. Deixe em branco para gerar um PDF por pagina de todo o arquivo."
    : "Informe quais paginas deseja extrair.";
}

function clearSplitState() {
  state.split.file = null;
  state.split.processing = false;
  if (elements.splitInput) {
    elements.splitInput.value = "";
  }
  if (elements.splitRange) {
    elements.splitRange.value = "";
  }
  updateSelectedFileLabel(elements.splitSelected, null);
  updateSplitActions();
  updateSplitRangeHint();
  setSplitStatus("");
}

function setSplitFile(file, { resetInput = false } = {}) {
  if (file && !isPdfFile(file)) {
    notify("Selecione um arquivo PDF valido.", "error");
    clearSplitState();
    return;
  }

  state.split.file = file;
  state.split.processing = false;
  if (resetInput && elements.splitInput) {
    elements.splitInput.value = "";
  }
  updateSelectedFileLabel(elements.splitSelected, state.split.file);
  updateSplitActions();
  updateSplitRangeHint();
  setSplitStatus("");
}

function handleSplitFileChange(event) {
  setSplitFile(event.target.files?.[0] || null);
}

async function splitPdf() {
  if (state.split.processing) return;
  if (!state.split.file) {
    notify("Selecione um PDF para dividir.", "error");
    return;
  }

  const pdfLib = resolvePdfLib(elements.splitStatus);
  if (!pdfLib) return;

  const splitMode = elements.splitMode?.value || "range";
  const isIndividualMode = splitMode === "individual";
  const zipLib = isIndividualMode ? resolveZipLib(elements.splitStatus) : null;
  if (isIndividualMode && !zipLib) return;

  state.split.processing = true;
  updateSplitActions();
  setSplitStatus("Carregando PDF...");

  try {
    const bytes = await state.split.file.arrayBuffer();
    const sourceDoc = await pdfLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const totalPages = sourceDoc.getPageCount();
    const selectedPages = parsePageSelection(elements.splitRange?.value, totalPages, {
      allowEmpty: isIndividualMode
    });
    const baseName = getFileBaseName(state.split.file.name, "pdf");

    if (!isIndividualMode) {
      setSplitStatus("Gerando novo PDF...");
      const extractedDoc = await pdfLib.PDFDocument.create();
      const pageIndices = selectedPages.map((pageNumber) => pageNumber - 1);
      const pages = await extractedDoc.copyPages(sourceDoc, pageIndices);
      pages.forEach((page) => extractedDoc.addPage(page));
      const extractedBytes = await extractedDoc.save();
      downloadPdfBytes(extractedBytes, buildDownloadName(`${baseName}-extraido`));
      notify("PDF extraido com sucesso.", "success");
      setSplitStatus("Novo PDF gerado. Download iniciado.", "success");
      return;
    }

    const zip = new zipLib();
    for (let index = 0; index < selectedPages.length; index += 1) {
      const pageNumber = selectedPages[index];
      setSplitStatus(`Gerando pagina ${pageNumber} (${index + 1} de ${selectedPages.length})...`);
      const pageDoc = await pdfLib.PDFDocument.create();
      const [page] = await pageDoc.copyPages(sourceDoc, [pageNumber - 1]);
      pageDoc.addPage(page);
      zip.file(`${baseName}-pagina-${pageNumber}.pdf`, await pageDoc.save());
    }

    setSplitStatus("Compactando arquivos em ZIP...");
    const zipBlob = await zip.generateAsync(
      { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
      ({ percent }) => {
        if (Number.isFinite(percent)) {
          setSplitStatus(`Compactando arquivos em ZIP... ${Math.round(percent)}%`);
        }
      }
    );

    downloadBlob(zipBlob, buildDownloadName(`${baseName}-paginas`, "zip"));
    notify("ZIP com paginas individuais gerado com sucesso.", "success");
    setSplitStatus("ZIP gerado. Download iniciado.", "success");
  } catch (error) {
    console.error("[Ferramentas] Erro ao dividir PDF:", error);
    notify("Nao foi possivel dividir o PDF.", "error");
    setSplitStatus(error.message || "Erro ao dividir PDF.", "error");
  } finally {
    state.split.processing = false;
    updateSplitActions();
  }
}

function setToJpgFile(file, { resetInput = false } = {}) {
  if (file && !isPdfFile(file)) {
    notify("Selecione um arquivo PDF válido.", "error");
    state.toJpg.file = null;
    if (elements.toJpgInput) {
      elements.toJpgInput.value = "";
    }
  } else {
    state.toJpg.file = file;
    if (resetInput && elements.toJpgInput) {
      elements.toJpgInput.value = "";
    }
  }
  updateSelectedFileLabel(elements.toJpgSelected, state.toJpg.file);
  updateToJpgActions();
  setToJpgStatus("");
}

function handleToJpgFileChange(event) {
  setToJpgFile(event.target.files?.[0] || null);
}

async function convertPdfToJpg() {
  if (state.toJpg.processing) return;
  if (!state.toJpg.file) {
    notify("Selecione um PDF para converter.", "error");
    return;
  }

  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib?.getDocument) {
    notify("PDF.js indisponível. Tente recarregar a página.", "error");
    setToJpgStatus("PDF.js indisponível.", "error");
    return;
  }
  const zipLib = resolveZipLib(elements.toJpgStatus);
  if (!zipLib) return;

  state.toJpg.processing = true;
  updateToJpgActions();
  setToJpgStatus("Convertendo PDF em imagens...");

  try {
    const arrayBuffer = await state.toJpg.file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const baseName = getFileBaseName(state.toJpg.file.name, "pdf");
    const zip = new zipLib();
    let generatedImages = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      setToJpgStatus(`Convertendo página ${pageNumber} de ${pdf.numPages}...`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;

      const blob = await new Promise((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/jpeg", 0.9);
      });
      if (blob) {
        zip.file(`${baseName}-pagina-${pageNumber}.jpg`, blob);
        generatedImages += 1;
      }
    }

    if (generatedImages === 0) {
      throw new Error("Nenhuma imagem foi gerada para compactacao.");
    }

    setToJpgStatus("Compactando imagens em ZIP...");
    const zipBlob = await zip.generateAsync(
      { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
      ({ percent }) => {
        if (Number.isFinite(percent)) {
          setToJpgStatus(`Compactando imagens em ZIP... ${Math.round(percent)}%`);
        }
      }
    );

    downloadBlob(zipBlob, buildDownloadName(`${baseName}-jpg`, "zip"));
    notify("Arquivo ZIP gerado com sucesso.", "success");
    setToJpgStatus("Conversao concluida. Download do ZIP iniciado.", "success");
  } catch (error) {
    console.error("[Ferramentas] Erro ao converter PDF para JPG:", error);
    notify("Não foi possível converter o PDF.", "error");
    setToJpgStatus("Erro ao converter PDF.", "error");
  } finally {
    state.toJpg.processing = false;
    updateToJpgActions();
  }
}

function clearRotateState() {
  state.rotate.file = null;
  state.rotate.processing = false;
  if (elements.rotateInput) {
    elements.rotateInput.value = "";
  }
  if (elements.rotateRange) {
    elements.rotateRange.value = "";
  }
  if (elements.rotatePageMode) {
    elements.rotatePageMode.value = "all";
  }
  if (elements.rotateAngle) {
    elements.rotateAngle.value = "90";
  }
  if (elements.rotateRange) {
    elements.rotateRange.disabled = true;
  }
  updateSelectedFileLabel(elements.rotateSelected, null);
  updateRotateActions();
  setRotateStatus("");
}

function syncRotateRangeState() {
  if (!elements.rotateRange || !elements.rotatePageMode) return;
  elements.rotateRange.disabled = elements.rotatePageMode.value !== "range";
  if (elements.rotateRange.disabled) {
    elements.rotateRange.value = "";
  }
}

function setRotateFile(file, { resetInput = false } = {}) {
  if (file && !isPdfFile(file)) {
    notify("Selecione um arquivo PDF valido.", "error");
    clearRotateState();
    return;
  }

  state.rotate.file = file;
  state.rotate.processing = false;
  if (resetInput && elements.rotateInput) {
    elements.rotateInput.value = "";
  }
  updateSelectedFileLabel(elements.rotateSelected, state.rotate.file);
  updateRotateActions();
  syncRotateRangeState();
  setRotateStatus("");
}

function handleRotateFileChange(event) {
  setRotateFile(event.target.files?.[0] || null);
}

async function rotatePdf() {
  if (state.rotate.processing) return;
  if (!state.rotate.file) {
    notify("Selecione um PDF para rotacionar.", "error");
    return;
  }

  const pdfLib = resolvePdfLib(elements.rotateStatus);
  if (!pdfLib) return;

  state.rotate.processing = true;
  updateRotateActions();
  setRotateStatus("Aplicando rotacao...");

  try {
    const bytes = await state.rotate.file.arrayBuffer();
    const pdfDoc = await pdfLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const totalPages = pdfDoc.getPageCount();
    const rotationAngle = Number.parseInt(elements.rotateAngle?.value || "90", 10);
    const rotateByRange = elements.rotatePageMode?.value === "range";
    const selectedPages = rotateByRange
      ? parsePageSelection(elements.rotateRange?.value, totalPages)
      : createSequentialPageList(totalPages);

    selectedPages.forEach((pageNumber) => {
      const page = pdfDoc.getPage(pageNumber - 1);
      const currentAngle = page.getRotation()?.angle || 0;
      page.setRotation(pdfLib.degrees((currentAngle + rotationAngle) % 360));
    });

    const rotatedBytes = await pdfDoc.save();
    downloadPdfBytes(rotatedBytes, buildDownloadName("pdf-rotacionado"));
    notify("PDF rotacionado com sucesso.", "success");
    setRotateStatus("PDF rotacionado pronto. Download iniciado.", "success");
  } catch (error) {
    console.error("[Ferramentas] Erro ao rotacionar PDF:", error);
    notify("Nao foi possivel rotacionar o PDF.", "error");
    setRotateStatus(error.message || "Erro ao rotacionar PDF.", "error");
  } finally {
    state.rotate.processing = false;
    updateRotateActions();
  }
}

function resetOrganizeState() {
  state.organize.file = null;
  state.organize.pages = [];
  state.organize.processing = false;
  state.organize.draggingId = null;
  if (elements.organizeInput) {
    elements.organizeInput.value = "";
  }
  renderOrganizeList();
  updateOrganizeActions();
  setOrganizeStatus("");
}

function setOrganizeFile(file, { resetInput = false } = {}) {
  if (file && !isPdfFile(file)) {
    notify("Selecione um arquivo PDF válido.", "error");
    if (elements.organizeInput) {
      elements.organizeInput.value = "";
    }
    resetOrganizeState();
    return;
  }
  state.organize.file = file;
  if (resetInput && elements.organizeInput) {
    elements.organizeInput.value = "";
  }
  void loadOrganizePages(file);
}

async function loadOrganizePages(file) {
  if (!file) {
    resetOrganizeState();
    return;
  }

  const pdfLib = resolvePdfLib(elements.organizeStatus);
  if (!pdfLib) {
    resetOrganizeState();
    return;
  }

  state.organize.processing = true;
  updateOrganizeActions();
  setOrganizeStatus("Carregando páginas...");

  try {
    const bytes = await file.arrayBuffer();
    const pdfDoc = await pdfLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPages().length;
    state.organize.pages = Array.from({ length: pageCount }, (_, index) => ({
      id: createId(),
      originalPage: index + 1,
      previewDataUrl: null
    }));
    renderOrganizeList();

    const pdfjsLib = window.pdfjsLib;
    if (pdfjsLib?.getDocument) {
      const previewDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        setOrganizeStatus(`Gerando previa ${pageNumber} de ${pageCount}...`);
        const previewPage = await previewDoc.getPage(pageNumber);
        const baseViewport = previewPage.getViewport({ scale: 1 });
        const scale = Math.min(0.32, 120 / Math.max(baseViewport.width, 1));
        const viewport = previewPage.getViewport({ scale: Math.max(0.12, scale) });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) continue;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        await previewPage.render({ canvasContext: context, viewport }).promise;
        state.organize.pages[pageNumber - 1].previewDataUrl = canvas.toDataURL("image/jpeg", 0.76);
      }
      renderOrganizeList();
    }

    setOrganizeStatus("");
  } catch (error) {
    console.error("[Ferramentas] Erro ao carregar páginas:", error);
    notify("Não foi possível carregar o PDF para organizar.", "error");
    setOrganizeStatus("Erro ao carregar páginas.", "error");
    state.organize.pages = [];
    renderOrganizeList();
  } finally {
    state.organize.processing = false;
    renderOrganizeList();
    updateOrganizeActions();
  }
}

function handleOrganizeFileChange(event) {
  setOrganizeFile(event.target.files?.[0] || null);
}

function handleOrganizeListAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || state.organize.processing) return;
  const { action, pageId } = button.dataset;
  if (!action || !pageId) return;

  const index = state.organize.pages.findIndex((item) => item.id === pageId);
  if (index === -1) return;

  if (action === "remove") {
    state.organize.pages.splice(index, 1);
  }

  if (action === "up" && index > 0) {
    const [item] = state.organize.pages.splice(index, 1);
    state.organize.pages.splice(index - 1, 0, item);
  }

  if (action === "down" && index < state.organize.pages.length - 1) {
    const [item] = state.organize.pages.splice(index, 1);
    state.organize.pages.splice(index + 1, 0, item);
  }

  renderOrganizeList();
  updateOrganizeActions();
}

function clearOrganizeDragHover() {
  if (!elements.organizeList) return;
  elements.organizeList.querySelectorAll(".pdf-organize-item.drag-over").forEach((item) => {
    item.classList.remove("drag-over", "bg-primary-subtle");
  });
}

function handleOrganizeDragStart(event) {
  const item = event.target.closest(".pdf-organize-item");
  if (!item || state.organize.processing) return;
  state.organize.draggingId = item.dataset.pageId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.organize.draggingId);
  }
  item.classList.add("opacity-50", "cursor-grabbing");
  item.setAttribute("aria-grabbed", "true");
}

function handleOrganizeDragOver(event) {
  if (state.organize.processing) return;
  if (hasFileTransfer(event.dataTransfer)) return;
  const target = event.target.closest(".pdf-organize-item");
  if (!state.organize.draggingId) return;
  event.preventDefault();
  clearOrganizeDragHover();
  if (target && target.dataset.pageId !== state.organize.draggingId) {
    target.classList.add("drag-over", "bg-primary-subtle");
  }
}

function handleOrganizeDragLeave(event) {
  const target = event.target.closest(".pdf-organize-item");
  if (!target) return;
  if (event.relatedTarget && target.contains(event.relatedTarget)) return;
  target.classList.remove("drag-over", "bg-primary-subtle");
}

function handleOrganizeDrop(event) {
  if (state.organize.processing) return;
  if (hasFileTransfer(event.dataTransfer)) return;
  const draggingId = state.organize.draggingId || event.dataTransfer?.getData("text/plain");
  if (!draggingId) return;
  event.preventDefault();

  const sourceIndex = state.organize.pages.findIndex((item) => item.id === draggingId);
  if (sourceIndex === -1) return;

  const target = event.target.closest(".pdf-organize-item");
  if (target) {
    const targetIndex = state.organize.pages.findIndex((item) => item.id === target.dataset.pageId);
    if (targetIndex === -1) return;

    const rect = target.getBoundingClientRect();
    const dropBefore = event.clientY < rect.top + rect.height / 2;
    const [moved] = state.organize.pages.splice(sourceIndex, 1);
    const insertIndex = getInsertIndex(sourceIndex, targetIndex, dropBefore);
    state.organize.pages.splice(insertIndex, 0, moved);
  } else if (sourceIndex !== state.organize.pages.length - 1) {
    const [moved] = state.organize.pages.splice(sourceIndex, 1);
    state.organize.pages.push(moved);
  }

  clearOrganizeDragHover();
  renderOrganizeList();
  updateOrganizeActions();
}

function handleOrganizeDragEnd(event) {
  const item = event.target.closest(".pdf-organize-item");
  if (item) {
    item.classList.remove("opacity-50", "cursor-grabbing");
    item.setAttribute("aria-grabbed", "false");
  }
  clearOrganizeDragHover();
  state.organize.draggingId = null;
}

async function organizePdf() {
  if (state.organize.processing) return;
  if (!state.organize.file || state.organize.pages.length === 0) {
    notify("Selecione um PDF e organize as páginas.", "error");
    return;
  }

  const pdfLib = resolvePdfLib(elements.organizeStatus);
  if (!pdfLib) return;

  state.organize.processing = true;
  updateOrganizeActions();
  setOrganizeStatus("Gerando PDF organizado...");

  try {
    const bytes = await state.organize.file.arrayBuffer();
    const sourceDoc = await pdfLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const organizedDoc = await pdfLib.PDFDocument.create();
    const pageIndices = state.organize.pages.map((page) => page.originalPage - 1);
    const pages = await organizedDoc.copyPages(sourceDoc, pageIndices);
    pages.forEach((page) => organizedDoc.addPage(page));
    const organizedBytes = await organizedDoc.save();
    downloadPdfBytes(organizedBytes, buildDownloadName("pdf-organizado"));
    notify("PDF organizado com sucesso.", "success");
    setOrganizeStatus("PDF organizado pronto. Download iniciado.", "success");
  } catch (error) {
    console.error("[Ferramentas] Erro ao organizar PDF:", error);
    notify("Não foi possível organizar o PDF.", "error");
    setOrganizeStatus("Erro ao organizar PDF.", "error");
  } finally {
    state.organize.processing = false;
    updateOrganizeActions();
  }
}

function clearDragHover() {
  if (!elements.list) return;
  elements.list.querySelectorAll(".pdf-merge-item.drag-over").forEach((item) => {
    item.classList.remove("drag-over", "bg-primary-subtle");
  });
}

// Verifica se o drag-and-drop contém arquivos.
function hasFileTransfer(dataTransfer) {
  if (!dataTransfer) return false;
  if (dataTransfer.files?.length > 0) return true;
  if (dataTransfer.items?.length > 0) {
    return Array.from(dataTransfer.items).some((item) => item.kind === "file");
  }
  if (!dataTransfer.types) return false;
  return Array.from(dataTransfer.types).some((type) => {
    const normalized = String(type || "").toLowerCase();
    return normalized === "files" || normalized.includes("x-moz-file");
  });
}

function extractDroppedFiles(dataTransfer) {
  if (!dataTransfer) return [];
  if (dataTransfer.files?.length > 0) {
    return Array.from(dataTransfer.files);
  }
  if (dataTransfer.items?.length > 0) {
    return Array.from(dataTransfer.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter(Boolean);
  }
  return [];
}

function bindSingleFileDropzone(dropzone, onFile, options = {}) {
  if (!dropzone || typeof onFile !== "function") return;
  const {
    inputElement = null,
    allowInternalDrag = null,
    validateFile = () => true,
    invalidMessage = "Arquivo invalido."
  } = options;
  const eventOptions = { capture: true };

  const isInternalDragActive = () =>
    typeof allowInternalDrag === "function" && allowInternalDrag() === true;

  const shouldHandleDrag = (dataTransfer) => {
    if (isInternalDragActive()) return false;
    if (hasFileTransfer(dataTransfer)) return true;
    return Boolean(inputElement);
  };

  const handleDroppedFile = (event) => {
    const droppedFiles = extractDroppedFiles(event.dataTransfer);
    if (droppedFiles.length === 0) return;
    const file = droppedFiles[0];
    if (!validateFile(file)) {
      notify(invalidMessage, "error");
      return;
    }
    onFile(file);
    if (inputElement) {
      inputElement.value = "";
    }
  };

  dropzone.addEventListener("dragenter", (event) => {
    if (!shouldHandleDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.relatedTarget && dropzone.contains(event.relatedTarget)) return;
    setZoneActive(dropzone, true);
  }, eventOptions);

  dropzone.addEventListener("dragover", (event) => {
    if (!shouldHandleDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    setZoneActive(dropzone, true);
  }, eventOptions);

  dropzone.addEventListener("dragleave", (event) => {
    if (isInternalDragActive()) return;
    if (event.relatedTarget && dropzone.contains(event.relatedTarget)) return;
    setZoneActive(dropzone, false);
  }, eventOptions);

  dropzone.addEventListener("drop", (event) => {
    if (!shouldHandleDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    setZoneActive(dropzone, false);
    handleDroppedFile(event);
  }, eventOptions);

  if (inputElement) {
    inputElement.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setZoneActive(dropzone, true);
    }, eventOptions);

    inputElement.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setZoneActive(dropzone, false);
      handleDroppedFile(event);
    }, eventOptions);
  }
}

function bindSinglePdfDropzone(dropzone, onFile, options = {}) {
  bindSingleFileDropzone(dropzone, onFile, {
    ...options,
    validateFile: isPdfFile,
    invalidMessage: "Apenas arquivos PDF sao aceitos."
  });
}

function renderWorkspaceList() {
  if (!elements.workspaceList || !elements.workspaceEmpty) return;
  elements.workspaceList.innerHTML = "";

  if (state.workspace.pages.length === 0) {
    elements.workspaceEmpty.classList.remove("d-none");
    return;
  }

  elements.workspaceEmpty.classList.add("d-none");

  state.workspace.pages.forEach((pageItem, index) => {
    const listItem = document.createElement("li");
    listItem.className = "list-group-item d-flex flex-wrap align-items-center justify-content-between gap-3";
    listItem.dataset.pageId = pageItem.id;
    listItem.classList.toggle("opacity-75", state.workspace.processing);

    const infoWrapper = document.createElement("div");
    infoWrapper.className = "d-flex align-items-center gap-3";

    const preview = document.createElement("div");
    preview.className = "pdf-page-preview flex-shrink-0";
    if (pageItem.previewDataUrl) {
      const image = document.createElement("img");
      image.src = pageItem.previewDataUrl;
      image.alt = `Previa da pagina ${pageItem.sourcePageNumber}`;
      preview.appendChild(image);
    } else {
      const fallbackIcon = document.createElement("i");
      fallbackIcon.className = "bi bi-file-earmark-pdf text-danger";
      fallbackIcon.setAttribute("aria-hidden", "true");
      preview.appendChild(fallbackIcon);
    }

    const orderBadge = document.createElement("span");
    orderBadge.className = "badge text-bg-light border";
    orderBadge.textContent = String(index + 1);

    const textWrapper = document.createElement("div");
    textWrapper.className = "d-flex flex-column gap-1";

    const title = document.createElement("span");
    title.className = "fw-semibold";
    title.textContent = `Pagina ${pageItem.sourcePageNumber}`;

    const source = document.createElement("small");
    source.className = "text-muted";
    source.textContent = `${pageItem.file.name}`;

    const meta = document.createElement("div");
    meta.className = "d-flex flex-wrap gap-2";

    const originBadge = document.createElement("span");
    originBadge.className = "badge text-bg-light border";
    originBadge.textContent = `Origem ${pageItem.fileOrder}`;

    const rotationBadge = document.createElement("span");
    rotationBadge.className = "badge text-bg-light border";
    rotationBadge.textContent = `${pageItem.rotation} graus`;

    meta.appendChild(originBadge);
    meta.appendChild(rotationBadge);
    textWrapper.appendChild(title);
    textWrapper.appendChild(source);
    textWrapper.appendChild(meta);

    infoWrapper.appendChild(preview);
    infoWrapper.appendChild(orderBadge);
    infoWrapper.appendChild(textWrapper);

    const actions = document.createElement("div");
    actions.className = "btn-group btn-group-sm";
    actions.setAttribute("role", "group");

    const moveUpButton = document.createElement("button");
    moveUpButton.type = "button";
    moveUpButton.className = "btn btn-outline-secondary";
    moveUpButton.dataset.action = "up";
    moveUpButton.dataset.pageId = pageItem.id;
    moveUpButton.disabled = index === 0 || state.workspace.processing;
    moveUpButton.setAttribute("aria-label", "Mover pagina para cima");
    moveUpButton.innerHTML = '<i class="bi bi-arrow-up"></i>';

    const moveDownButton = document.createElement("button");
    moveDownButton.type = "button";
    moveDownButton.className = "btn btn-outline-secondary";
    moveDownButton.dataset.action = "down";
    moveDownButton.dataset.pageId = pageItem.id;
    moveDownButton.disabled = index === state.workspace.pages.length - 1 || state.workspace.processing;
    moveDownButton.setAttribute("aria-label", "Mover pagina para baixo");
    moveDownButton.innerHTML = '<i class="bi bi-arrow-down"></i>';

    const rotateLeftButton = document.createElement("button");
    rotateLeftButton.type = "button";
    rotateLeftButton.className = "btn btn-outline-secondary";
    rotateLeftButton.dataset.action = "rotate-left";
    rotateLeftButton.dataset.pageId = pageItem.id;
    rotateLeftButton.disabled = state.workspace.processing;
    rotateLeftButton.setAttribute("aria-label", "Rotacionar pagina para a esquerda");
    rotateLeftButton.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i>';

    const rotateRightButton = document.createElement("button");
    rotateRightButton.type = "button";
    rotateRightButton.className = "btn btn-outline-secondary";
    rotateRightButton.dataset.action = "rotate-right";
    rotateRightButton.dataset.pageId = pageItem.id;
    rotateRightButton.disabled = state.workspace.processing;
    rotateRightButton.setAttribute("aria-label", "Rotacionar pagina para a direita");
    rotateRightButton.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn btn-outline-danger";
    removeButton.dataset.action = "remove";
    removeButton.dataset.pageId = pageItem.id;
    removeButton.disabled = state.workspace.processing;
    removeButton.setAttribute("aria-label", "Remover pagina");
    removeButton.innerHTML = '<i class="bi bi-x-lg"></i>';

    actions.appendChild(moveUpButton);
    actions.appendChild(moveDownButton);
    actions.appendChild(rotateLeftButton);
    actions.appendChild(rotateRightButton);
    actions.appendChild(removeButton);

    listItem.appendChild(infoWrapper);
    listItem.appendChild(actions);
    elements.workspaceList.appendChild(listItem);
  });
}

function getInsertIndex(sourceIndex, targetIndex, dropBefore) {
  const insertAt = dropBefore ? targetIndex : targetIndex + 1;
  return sourceIndex < insertAt ? insertAt - 1 : insertAt;
}

function moveFileToEnd(sourceIndex) {
  if (sourceIndex < 0 || sourceIndex === state.files.length - 1) return;
  const [moved] = state.files.splice(sourceIndex, 1);
  state.files.push(moved);
}

function handleListAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || state.processing) return;
  const { action, fileId } = button.dataset;
  if (!action || !fileId) return;

  const index = state.files.findIndex((item) => item.id === fileId);
  if (index === -1) return;

  if (action === "remove") {
    state.files.splice(index, 1);
  }

  if (action === "up" && index > 0) {
    const [item] = state.files.splice(index, 1);
    state.files.splice(index - 1, 0, item);
  }

  if (action === "down" && index < state.files.length - 1) {
    const [item] = state.files.splice(index, 1);
    state.files.splice(index + 1, 0, item);
  }

  renderList();
  updateActions();
}

function handleListDragStart(event) {
  const item = event.target.closest(".pdf-merge-item");
  if (!item || state.processing) return;
  state.draggingId = item.dataset.fileId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggingId);
  }
  item.classList.add("opacity-50");
  item.classList.add("cursor-grabbing");
  item.setAttribute("aria-grabbed", "true");
}

function handleListDragOver(event) {
  if (state.processing) return;
  if (hasFileTransfer(event.dataTransfer)) {
    event.preventDefault();
    setDropzoneActive(true);
    return;
  }
  const target = event.target.closest(".pdf-merge-item");
  if (!state.draggingId) return;
  event.preventDefault();
  clearDragHover();
  if (target && target.dataset.fileId !== state.draggingId) {
    target.classList.add("drag-over", "bg-primary-subtle");
  }
}

function handleListDragLeave(event) {
  const target = event.target.closest(".pdf-merge-item");
  if (!target) return;
  if (event.relatedTarget && target.contains(event.relatedTarget)) return;
  target.classList.remove("drag-over", "bg-primary-subtle");
}

function handleListDrop(event) {
  if (state.processing) return;
  const droppedFiles = event.dataTransfer?.files;
  if (droppedFiles && droppedFiles.length) {
    event.preventDefault();
    event.stopPropagation();
    setDropzoneActive(false);
    clearDragHover();
    addFiles(droppedFiles);
    return;
  }

  const draggingId = state.draggingId || event.dataTransfer?.getData("text/plain");
  if (!draggingId) return;
  event.preventDefault();

  const sourceIndex = state.files.findIndex((item) => item.id === draggingId);
  if (sourceIndex === -1) return;

  const target = event.target.closest(".pdf-merge-item");
  if (target) {
    const targetIndex = state.files.findIndex((item) => item.id === target.dataset.fileId);
    if (targetIndex === -1) return;

    const rect = target.getBoundingClientRect();
    const dropBefore = event.clientY < rect.top + rect.height / 2;
    const [moved] = state.files.splice(sourceIndex, 1);
    const insertIndex = getInsertIndex(sourceIndex, targetIndex, dropBefore);
    state.files.splice(insertIndex, 0, moved);
  } else {
    moveFileToEnd(sourceIndex);
  }

  clearDragHover();
  renderList();
  updateActions();
}

function handleListDragEnd(event) {
  const item = event.target.closest(".pdf-merge-item");
  if (item) {
    item.classList.remove("opacity-50");
    item.classList.remove("cursor-grabbing");
    item.setAttribute("aria-grabbed", "false");
  }
  clearDragHover();
  state.draggingId = null;
}

function handleDropzoneDragOver(event) {
  if (!hasFileTransfer(event.dataTransfer)) return;
  event.preventDefault();
  setDropzoneActive(true);
}

function handleDropzoneDragLeave(event) {
  if (event.relatedTarget && elements.dropzone?.contains(event.relatedTarget)) return;
  setDropzoneActive(false);
}

function handleDropzoneDrop(event) {
  const droppedFiles = extractDroppedFiles(event.dataTransfer);
  if (droppedFiles.length === 0) return;
  event.preventDefault();
  event.stopPropagation();
  setDropzoneActive(false);
  addFiles(droppedFiles);
}

function buildDownloadName(prefix = "pdf-unido", extension = "pdf") {
  const now = new Date();
  const isoDate = now.toISOString();
  const date = isoDate.slice(0, 10);
  const time = isoDate.slice(11, 19).replace(/:/g, "");
  return `${prefix}-${date}-${time}.${extension}`;
}

async function mergeFiles() {
  if (state.processing) return;
  if (state.files.length < MIN_FILES_TO_MERGE) {
    notify("Selecione pelo menos dois PDFs para juntar.", "error");
    return;
  }

  const pdfLib = resolvePdfLib(elements.status);
  if (!pdfLib) return;

  state.processing = true;
  updateActions();
  setStatus("Iniciando a união dos arquivos...");

  try {
    const mergedPdf = await pdfLib.PDFDocument.create();
    for (let index = 0; index < state.files.length; index += 1) {
      const item = state.files[index];
      setStatus(`Processando ${index + 1} de ${state.files.length}...`);
      const bytes = await item.file.arrayBuffer();
      const sourcePdf = await pdfLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
    }

    setStatus("Gerando arquivo final...");
    const mergedBytes = await mergedPdf.save();
    downloadPdfBytes(mergedBytes, buildDownloadName("pdf-unido"));

    notify("PDF unido com sucesso.", "success");
    setStatus("PDF unido pronto. O download foi iniciado.", "success");
  } catch (error) {
    console.error("[Ferramentas] Erro ao juntar PDFs:", error);
    notify("Não foi possível juntar os PDFs. Verifique os arquivos.", "error");
    setStatus("Erro ao juntar PDFs.", "error");
  } finally {
    state.processing = false;
    updateActions();
  }
}

function setupEventListeners() {
  if (elements.workspaceInput) {
    elements.workspaceInput.addEventListener("change", (event) => {
      void addFilesToWorkspace(event.target.files);
      event.target.value = "";
    });
  }

  if (elements.workspaceList) {
    elements.workspaceList.addEventListener("click", handleWorkspaceListAction);
  }

  if (elements.workspaceButton) {
    elements.workspaceButton.addEventListener("click", () => {
      void generateWorkspacePdf();
    });
  }

  if (elements.workspaceClear) {
    elements.workspaceClear.addEventListener("click", clearWorkspaceState);
  }

  if (elements.workspaceDropzone) {
    elements.workspaceDropzone.addEventListener("dragover", (event) => {
      if (!hasFileTransfer(event.dataTransfer)) return;
      event.preventDefault();
      setZoneActive(elements.workspaceDropzone, true);
    });

    elements.workspaceDropzone.addEventListener("dragleave", (event) => {
      if (event.relatedTarget && elements.workspaceDropzone.contains(event.relatedTarget)) return;
      setZoneActive(elements.workspaceDropzone, false);
    });

    elements.workspaceDropzone.addEventListener("drop", (event) => {
      const droppedFiles = extractDroppedFiles(event.dataTransfer);
      if (droppedFiles.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      setZoneActive(elements.workspaceDropzone, false);
      void addFilesToWorkspace(droppedFiles);
    });
  }

  if (elements.input) {
    elements.input.addEventListener("change", (event) => {
      addFiles(event.target.files);
      event.target.value = "";
    });
  }

  if (elements.list) {
    elements.list.addEventListener("click", handleListAction);
    elements.list.addEventListener("dragstart", handleListDragStart);
    elements.list.addEventListener("dragover", handleListDragOver);
    elements.list.addEventListener("dragleave", handleListDragLeave);
    elements.list.addEventListener("drop", handleListDrop);
    elements.list.addEventListener("dragend", handleListDragEnd);
  }

  if (elements.mergeButton) {
    elements.mergeButton.addEventListener("click", mergeFiles);
  }

  if (elements.clearButton) {
    elements.clearButton.addEventListener("click", clearFiles);
  }

  if (elements.unlockInput) {
    elements.unlockInput.addEventListener("change", handleUnlockFileChange);
  }

  if (elements.unlockButton) {
    elements.unlockButton.addEventListener("click", unlockPdf);
  }

  bindSinglePdfDropzone(
    elements.unlockDropzone,
    (file) => {
      setUnlockFile(file, { resetInput: true });
    },
    { inputElement: elements.unlockInput }
  );

  if (elements.splitInput) {
    elements.splitInput.addEventListener("change", handleSplitFileChange);
  }

  if (elements.splitMode) {
    elements.splitMode.addEventListener("change", updateSplitRangeHint);
  }

  if (elements.splitButton) {
    elements.splitButton.addEventListener("click", splitPdf);
  }

  if (elements.splitClear) {
    elements.splitClear.addEventListener("click", clearSplitState);
  }

  bindSinglePdfDropzone(
    elements.splitDropzone,
    (file) => {
      setSplitFile(file, { resetInput: true });
    },
    { inputElement: elements.splitInput }
  );

  if (elements.toJpgInput) {
    elements.toJpgInput.addEventListener("change", handleToJpgFileChange);
  }

  if (elements.toJpgButton) {
    elements.toJpgButton.addEventListener("click", convertPdfToJpg);
  }

  bindSinglePdfDropzone(
    elements.toJpgDropzone,
    (file) => {
      setToJpgFile(file, { resetInput: true });
    },
    { inputElement: elements.toJpgInput }
  );

  if (elements.organizeInput) {
    elements.organizeInput.addEventListener("change", handleOrganizeFileChange);
  }

  if (elements.organizeButton) {
    elements.organizeButton.addEventListener("click", organizePdf);
  }

  if (elements.organizeClear) {
    elements.organizeClear.addEventListener("click", resetOrganizeState);
  }

  if (elements.rotateInput) {
    elements.rotateInput.addEventListener("change", handleRotateFileChange);
  }

  if (elements.rotatePageMode) {
    elements.rotatePageMode.addEventListener("change", syncRotateRangeState);
  }

  if (elements.rotateButton) {
    elements.rotateButton.addEventListener("click", rotatePdf);
  }

  if (elements.rotateClear) {
    elements.rotateClear.addEventListener("click", clearRotateState);
  }

  bindSinglePdfDropzone(
    elements.rotateDropzone,
    (file) => {
      setRotateFile(file, { resetInput: true });
    },
    { inputElement: elements.rotateInput }
  );

  if (elements.organizeList) {
    elements.organizeList.addEventListener("click", handleOrganizeListAction);
    elements.organizeList.addEventListener("dragstart", handleOrganizeDragStart);
    elements.organizeList.addEventListener("dragover", handleOrganizeDragOver);
    elements.organizeList.addEventListener("dragleave", handleOrganizeDragLeave);
    elements.organizeList.addEventListener("drop", handleOrganizeDrop);
    elements.organizeList.addEventListener("dragend", handleOrganizeDragEnd);
  }

  bindSinglePdfDropzone(
    elements.organizeDropzone,
    (file) => {
      setOrganizeFile(file, { resetInput: true });
    },
    {
      inputElement: elements.organizeInput,
      allowInternalDrag: () => Boolean(state.organize.draggingId)
    }
  );

  if (elements.dropzone) {
    elements.dropzone.addEventListener("dragover", handleDropzoneDragOver);
    elements.dropzone.addEventListener("dragleave", handleDropzoneDragLeave);
    elements.dropzone.addEventListener("drop", handleDropzoneDrop);
  }
}

export function initialize() {
  if (state.initialized) return;

  elements = {
    page: document.getElementById("page-ferramentas"),
    workspaceInput: document.getElementById("pdf-workspace-input"),
    workspaceDropzone: document.getElementById("pdf-workspace-dropzone"),
    workspaceList: document.getElementById("pdf-workspace-list"),
    workspaceEmpty: document.getElementById("pdf-workspace-empty"),
    workspaceButton: document.getElementById("pdf-workspace-button"),
    workspaceClear: document.getElementById("pdf-workspace-clear"),
    workspaceStatus: document.getElementById("pdf-workspace-status"),
    input: document.getElementById("pdf-merge-input"),
    dropzone: document.getElementById("pdf-merge-dropzone"),
    list: document.getElementById("pdf-merge-list"),
    emptyState: document.getElementById("pdf-merge-empty"),
    mergeButton: document.getElementById("pdf-merge-button"),
    clearButton: document.getElementById("pdf-merge-clear"),
    status: document.getElementById("pdf-merge-status"),
    unlockInput: document.getElementById("pdf-unlock-input"),
    unlockDropzone: document.getElementById("pdf-unlock-dropzone"),
    unlockSelected: document.getElementById("pdf-unlock-selected"),
    unlockButton: document.getElementById("pdf-unlock-button"),
    unlockStatus: document.getElementById("pdf-unlock-status"),
    splitInput: document.getElementById("pdf-split-input"),
    splitDropzone: document.getElementById("pdf-split-dropzone"),
    splitSelected: document.getElementById("pdf-split-selected"),
    splitMode: document.getElementById("pdf-split-mode"),
    splitRange: document.getElementById("pdf-split-range"),
    splitRangeHelp: document.getElementById("pdf-split-range-help"),
    splitButton: document.getElementById("pdf-split-button"),
    splitClear: document.getElementById("pdf-split-clear"),
    splitStatus: document.getElementById("pdf-split-status"),
    toJpgInput: document.getElementById("pdf-to-jpg-input"),
    toJpgDropzone: document.getElementById("pdf-to-jpg-dropzone"),
    toJpgSelected: document.getElementById("pdf-to-jpg-selected"),
    toJpgButton: document.getElementById("pdf-to-jpg-button"),
    toJpgStatus: document.getElementById("pdf-to-jpg-status"),
    organizeInput: document.getElementById("pdf-organize-input"),
    organizeDropzone: document.getElementById("pdf-organize-dropzone"),
    organizeList: document.getElementById("pdf-organize-list"),
    organizeEmpty: document.getElementById("pdf-organize-empty"),
    organizeButton: document.getElementById("pdf-organize-button"),
    organizeClear: document.getElementById("pdf-organize-clear"),
    organizeStatus: document.getElementById("pdf-organize-status"),
    rotateInput: document.getElementById("pdf-rotate-input"),
    rotateDropzone: document.getElementById("pdf-rotate-dropzone"),
    rotateSelected: document.getElementById("pdf-rotate-selected"),
    rotateAngle: document.getElementById("pdf-rotate-angle"),
    rotatePageMode: document.getElementById("pdf-rotate-page-mode"),
    rotateRange: document.getElementById("pdf-rotate-range"),
    rotateButton: document.getElementById("pdf-rotate-button"),
    rotateClear: document.getElementById("pdf-rotate-clear"),
    rotateStatus: document.getElementById("pdf-rotate-status")
  };

  setupEventListeners();
  renderWorkspaceList();
  renderList();
  renderOrganizeList();
  updateWorkspaceActions();
  updateSelectedFileLabel(elements.unlockSelected, null);
  updateSelectedFileLabel(elements.splitSelected, null);
  updateSelectedFileLabel(elements.toJpgSelected, null);
  updateSelectedFileLabel(elements.rotateSelected, null);
  updateSplitRangeHint();
  syncRotateRangeState();
  updateActions();
  updateUnlockActions();
  updateSplitActions();
  updateToJpgActions();
  updateOrganizeActions();
  updateRotateActions();
  state.initialized = true;
}

export function show() {
  if (!state.initialized) {
    initialize();
  }
}

const toolsPage = {
  initialize,
  show,
  state
};

if (typeof window !== "undefined") {
  window.toolsPage = toolsPage;
}

export default toolsPage;
