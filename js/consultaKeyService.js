/**
 * @file consultaKeyService.js
 * @description Helpers puros para normalização, geração e validação da chave de consulta.
 */

export const TIPOS_CONSULTA = Object.freeze(["PR", "CP", "GR", "RV", "MI"]);

const TIPOS_CONSULTA_SET = new Set(TIPOS_CONSULTA);

const FIELD_LABELS = Object.freeze({
  codigoCCA: "Código CCA",
  tipoConsulta: "Tipo de Consulta",
  cpfPrincipal: "CPF do comprador principal",
  nContratoCEF: "Nº Contrato CEF",
});

function toTrimmedString(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

export function normalizeConsultaUpper(value) {
  return toTrimmedString(value).toUpperCase();
}

export function normalizeConsultaDigits(value) {
  return toTrimmedString(value).replace(/\D/g, "");
}

export function normalizeConsultaKeyValue(value) {
  return normalizeConsultaUpper(value);
}

export function getConsultaFieldLabel(fieldName) {
  return FIELD_LABELS[fieldName] || fieldName;
}

export function formatConsultaMissingFields(fieldNames = []) {
  return fieldNames.map((fieldName) => getConsultaFieldLabel(fieldName)).join(", ");
}

export function extractPrincipalCpfFromSource(source = {}) {
  if (!source || typeof source !== "object") {
    return "";
  }

  if (Array.isArray(source.compradores) && source.compradores.length > 0) {
    const principal =
      source.compradores.find((comprador) => Boolean(comprador?.principal)) ||
      source.compradores[0];
    const principalCpf = normalizeConsultaDigits(principal?.cpf);
    if (principalCpf) {
      return principalCpf;
    }
  }

  const fallbackFields = ["cpfPrincipal", "comprador_1_cpf", "cpf"];
  for (const fieldName of fallbackFields) {
    const cpf = normalizeConsultaDigits(source[fieldName]);
    if (cpf) {
      return cpf;
    }
  }

  return "";
}

export function getConsultaKeyState(source = {}, overrides = {}) {
  const mergedSource = {
    ...(source && typeof source === "object" ? source : {}),
    ...(overrides && typeof overrides === "object" ? overrides : {}),
  };

  const codigoCCA = normalizeConsultaUpper(mergedSource.codigoCCA);
  const tipoConsulta = normalizeConsultaUpper(mergedSource.tipoConsulta);
  const cpfPrincipal = extractPrincipalCpfFromSource(mergedSource);
  const nContratoCEF = normalizeConsultaDigits(mergedSource.nContratoCEF);
  const currentKey = normalizeConsultaKeyValue(mergedSource.chaveConsulta);

  const missingFields = [];
  if (!codigoCCA) missingFields.push("codigoCCA");
  if (!tipoConsulta) missingFields.push("tipoConsulta");
  if (!cpfPrincipal) missingFields.push("cpfPrincipal");
  if (!nContratoCEF) missingFields.push("nContratoCEF");

  const invalidFields = [];
  if (tipoConsulta && !TIPOS_CONSULTA_SET.has(tipoConsulta)) {
    invalidFields.push("tipoConsulta");
  }

  const canGenerate = missingFields.length === 0 && invalidFields.length === 0;
  const expectedKey = canGenerate
    ? `${codigoCCA}_${cpfPrincipal}_${nContratoCEF}_${tipoConsulta}`
    : "";

  const shouldRequireUpToDateKey = Boolean(codigoCCA || tipoConsulta);
  const isUpToDate = Boolean(expectedKey && currentKey && currentKey === expectedKey);
  const requiresManualGeneration =
    shouldRequireUpToDateKey && (!expectedKey || currentKey !== expectedKey);

  return {
    codigoCCA,
    tipoConsulta,
    cpfPrincipal,
    nContratoCEF,
    currentKey,
    expectedKey,
    missingFields,
    invalidFields,
    canGenerate,
    isUpToDate,
    shouldRequireUpToDateKey,
    requiresManualGeneration,
  };
}

export function buildConsultaKey(source = {}, overrides = {}) {
  return getConsultaKeyState(source, overrides).expectedKey;
}

export function getConsultaKeyValidationMessage(
  state,
  { action = "salvar" } = {}
) {
  if (!state) {
    return "A chave de consulta não pôde ser validada.";
  }

  if (state.invalidFields.includes("tipoConsulta")) {
    return "Tipo de Consulta inválido. Use PR, CP, GR, RV ou MI.";
  }

  if (!state.expectedKey) {
    const missingFields = formatConsultaMissingFields(state.missingFields);
    if (action === "gerar") {
      return `Não foi possível montar a chave de consulta. Preencha: ${missingFields}.`;
    }

    return `A chave de consulta está incompleta. Preencha: ${missingFields}.`;
  }

  return "A chave de consulta está ausente ou desatualizada. Revise os campos da consulta antes de salvar.";
}
