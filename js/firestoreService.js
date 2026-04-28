/**
 * @file firestoreService.js
 * @description Módulo para todas as interações com o Firestore e Firebase Functions.
 */

import { db, auth, storage } from "./auth.js"; // Importa a instância 'db' do auth.js
import {
  STATUS_CONFIG,
  DATE_FIELDS_IMPORT,
  NUMERIC_FIELDS_IMPORT,
  FIELDS_TO_TRACK,
  FIELD_CASE_MAPPING
} from "./config.js";
import cacheService from "./cacheService.js";
import listenerOptimizer from "./listenerOptimizer.js";
import paginationService from "./paginationService.js";
import realtimeSyncService from "./realtimeSyncService.js";
import { normalizePhoneToE164 } from "./phoneUtils.js";
import permissionsService from "./permissionsService.js";
import {
  formatConsultaMissingFields,
  getConsultaKeyState,
} from "./consultaKeyService.js";
import { activityLogService } from "./activityLogService.js";

const DATE_FIELDS_SET = new Set(
  DATE_FIELDS_IMPORT.map((field) => String(field || "").toLowerCase())
);

const FIELD_CASE_MAPPING_ENTRIES = Object.entries(FIELD_CASE_MAPPING || {});
const SYSTEM_FLAGS_DOC_PATH = { collection: 'settings', docId: 'system_flags' };
const DEFAULT_SYSTEM_FLAGS = Object.freeze({
  enablePermissionsCacheFix: true,
  enableReadMonitorDeltaCounting: true,
  enableAprovacoesRealtimeDelta: true,
  enableAprovacoesAggregatesReadPath: true,
  enableContractsHeavyFallback: false
});

async function auditContractsCsvImport(csvText, result = {}, source = 'firestoreService') {
  if (!csvText || !activityLogService?.auditFileAction) return;

  const importedCount = Number(result?.importedCount || 0) || 0;
  const totalBatches = Number(result?.totalBatches || 0) || 0;
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `importacao_processos_${timestamp}.csv`;

  try {
    await activityLogService.auditFileAction({
      actionType: 'CSV_IMPORT',
      description: `Importacao CSV de processos (${importedCount} registros importados)`,
      module: 'processos',
      page: 'processos',
      source,
      filename,
      blobOrText: csvText,
      mimeType: 'text/csv;charset=utf-8;',
      rowCount: importedCount,
      entityType: 'contract',
      extraData: {
        format: 'CSV',
        importedCount,
        totalBatches
      }
    });
  } catch (error) {
    console.error('[firestoreService] Falha ao auditar importacao CSV de processos:', error);
  }
}

function hasMeaningfulValue(value) {
  return value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "");
}

function contractLabelForConsultaError(contract = {}, contractId = "") {
  const clientePrincipal = String(contract?.clientePrincipal || "").trim();
  const empreendimento = String(contract?.empreendimento || "").trim();
  const fallbackId = String(contract?.id || contractId || "").trim();
  return clientePrincipal || empreendimento || fallbackId || "processo sem identificação";
}

function applyConsultaFieldsToPayload(payload, referenceData = {}, options = {}) {
  const { autoGenerate = false } = options;
  const consultaState = getConsultaKeyState(referenceData);
  const normalizedPayload = payload;

  if (Object.prototype.hasOwnProperty.call(referenceData, "codigoCCA")) {
    normalizedPayload.codigoCCA = consultaState.codigoCCA;
  }

  if (Object.prototype.hasOwnProperty.call(referenceData, "tipoConsulta")) {
    normalizedPayload.tipoConsulta = consultaState.tipoConsulta;
  }

  const shouldTouchKey =
    Object.prototype.hasOwnProperty.call(referenceData, "chaveConsulta") ||
    Object.prototype.hasOwnProperty.call(referenceData, "codigoCCA") ||
    Object.prototype.hasOwnProperty.call(referenceData, "tipoConsulta");

  if (autoGenerate) {
    if (consultaState.shouldRequireUpToDateKey) {
      if (!consultaState.expectedKey) {
        const missingFields = formatConsultaMissingFields(consultaState.missingFields);
        throw new Error(
          `Não foi possível gerar a chave de consulta. Preencha: ${missingFields}.`
        );
      }

      normalizedPayload.codigoCCA = consultaState.codigoCCA;
      normalizedPayload.tipoConsulta = consultaState.tipoConsulta;
      normalizedPayload.chaveConsulta = consultaState.expectedKey;
    } else if (shouldTouchKey) {
      normalizedPayload.chaveConsulta = "";
    }

    return consultaState;
  }

  if (consultaState.requiresManualGeneration) {
    // Não bloqueia persistência: mantém a chave sincronizada quando possível
    // e limpa quando os campos mínimos ainda não permitem geração.
    normalizedPayload.chaveConsulta = consultaState.expectedKey || "";
    return consultaState;
  }

  if (shouldTouchKey) {
    normalizedPayload.chaveConsulta = consultaState.expectedKey || "";
  }

  return consultaState;
}

export function normalizeContractRealtimePayload(contract) {
  if (!contract || typeof contract !== "object") {
    return contract;
  }

  let normalized = contract;

  FIELD_CASE_MAPPING_ENTRIES.forEach(([legacyKeyRaw, canonicalKeyRaw]) => {
    const legacyKey = String(legacyKeyRaw || "").trim();
    const canonicalKey = String(canonicalKeyRaw || "").trim();

    if (!legacyKey || !canonicalKey) {
      return;
    }

    if (hasMeaningfulValue(normalized[canonicalKey])) {
      return;
    }

    let legacyValue;

    if (Object.prototype.hasOwnProperty.call(normalized, legacyKey)) {
      legacyValue = normalized[legacyKey];
    } else {
      const canonicalLower = canonicalKey.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(normalized, canonicalLower)) {
        legacyValue = normalized[canonicalLower];
      }
    }

    if (!hasMeaningfulValue(legacyValue)) {
      return;
    }

    if (normalized === contract) {
      normalized = { ...contract };
    }
    normalized[canonicalKey] = legacyValue;
  });

  return normalized;
}

function normalizeContractFieldAliases(contract) {
  return normalizeContractRealtimePayload(contract);
}

async function getCurrentUserPermissionsSafe() {
  try {
    const user = auth.currentUser;
    if (!user) {
      return null;
    }
    return await permissionsService.getUserPermissions(user.uid);
  } catch (error) {
    console.warn(" Não foi possível carregar permissões do usuário atual:", error);
    return null;
  }
}

async function filterContractsByPermissions(contracts, options = {}) {
  if (!Array.isArray(contracts) || contracts.length === 0) {
    return Array.isArray(contracts) ? contracts : [];
  }

  if (options.skipPermissionFilter) {
    return contracts;
  }

  try {
    const permissions =
      options.permissionsOverride || (await getCurrentUserPermissionsSafe());

    if (!permissions) {
      console.warn(" Permissoes indisponiveis: aplicando fail-closed.");
      return [];
    }

    return permissionsService.filterContracts(contracts, permissions);
  } catch (error) {
    console.warn(" Erro ao aplicar filtros de permissão:", error);
    return [];
  }
}

async function ensureContractVisibility(contract, options = {}) {
  if (!contract || options.skipPermissionFilter) {
    return contract;
  }

  const filtered = await filterContractsByPermissions([contract], options);
  return filtered.length > 0 ? contract : null;
}

async function applyPermissionsToPageResult(pageResult = {}, options = {}) {
  const filteredContracts = await filterContractsByPermissions(
    pageResult.contracts || [],
    options
  );

  return {
    ...pageResult,
    contracts: filteredContracts,
    filteredCount: filteredContracts.length,
  };
}

function isFirestoreTimestamp(value) {
  return Boolean(value && typeof value.toDate === "function");
}

function looksLikeDateField(key, originalValue, updatedValue) {
  const keyName = String(key || "").toLowerCase();
  if (DATE_FIELDS_SET.has(keyName)) {
    return true;
  }

  const matchesByName =
    keyName.includes("data") ||
    keyName.startsWith("venc") ||
    keyName.endsWith("em");

  if (matchesByName) {
    return true;
  }

  if (
    isFirestoreTimestamp(originalValue) ||
    isFirestoreTimestamp(updatedValue) ||
    originalValue instanceof Date ||
    updatedValue instanceof Date
  ) {
    return true;
  }

  return false;
}

export function normalizeCsvHeader(header, { lowercase = true } = {}) {
  if (typeof header !== "string") {
    return "";
  }

  let normalized = header
    .replace(/^\uFEFF/, "")
    // eslint-disable-next-line no-control-regex
    .replace(/\u0000/g, "")
    .trim();

  if (lowercase) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

function detectCsvDelimiter(text) {
  if (!text || typeof text !== "string") {
    return ",";
  }

  const sample = text.split(/\r?\n/).find((line) => line && line.trim().length > 0) || "";
  const commaCount = (sample.match(/,/g) || []).length;
  const semicolonCount = (sample.match(/;/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;

  if (semicolonCount > commaCount && semicolonCount >= tabCount) {
    return ";";
  }
  if (tabCount > commaCount && tabCount > semicolonCount) {
    return "\t";
  }
  return ",";
}

const contractsCollection = db.collection("contracts");
const archivedContractsCollection = db.collection("archivedContracts");
// Nota: 'archived_contracts' foi consolidada em 'contracts' (filtrar por wasArchived: true)
// A arquitetura híbrida Storage Archive usa 'archivedContracts' como índice separado

/**
 * Verifica se uma string parece ser uma data ou datetime
 * @param {string} value - Valor a ser verificado
 * @returns {boolean}
 */
function isDateString(value) {
    if (!value || typeof value !== 'string') return false;
    
    // Padrões comuns de data e datetime
    const datePatterns = [
        // Apenas data
        /^\d{1,2}\/\d{1,2}\/\d{4}$/,                               // DD/MM/YYYY ou D/M/YYYY
        /^\d{4}-\d{1,2}-\d{1,2}$/,                                // YYYY-MM-DD ou YYYY-M-D
        /^\d{1,2}-\d{1,2}-\d{4}$/,                                // DD-MM-YYYY ou D-M-YYYY
        /^\d{1,2}\.\d{1,2}\.\d{4}$/,                              // DD.MM.YYYY ou D.M.YYYY
        
        // Data e hora
        /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(:\d{2})?$/,    // DD/MM/YYYY HH:MM[:SS]
        /^\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}(:\d{2})?$/,      // YYYY-MM-DD HH:MM[:SS]
        /^\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}(:\d{2})?$/,      // DD-MM-YYYY HH:MM[:SS]
        /^\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2}(:\d{2})?$/,    // DD.MM.YYYY HH:MM[:SS]
        
        // ISO format com T
        /^\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{2}(:\d{2})?(\.\d{3})?Z?$/,  // ISO format
    ];
    
    return datePatterns.some(pattern => pattern.test(value.trim()));
}

/**
 * Converte uma string de data ou datetime em Timestamp do Firestore
 * @param {string} dateString - String da data/datetime
 * @returns {firebase.firestore.Timestamp|null}
 */
function parseAndConvertDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    
    const trimmed = dateString.trim();
    if (trimmed === '') return null;
    
    let dateObject = null;
    
    try {
        // Tenta diferentes formatos de data e datetime
        
        // Formatos com data e hora
        if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
            // DD/MM/YYYY HH:MM[:SS]
            const parts = trimmed.split(' ');
            const [day, month, year] = parts[0].split('/');
            const timeParts = parts[1].split(':');
            const hour = parseInt(timeParts[0]);
            const minute = parseInt(timeParts[1]);
            const second = timeParts[2] ? parseInt(timeParts[2]) : 0;
            dateObject = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hour, minute, second);
        }
        else if (/^\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
            // YYYY-MM-DD HH:MM[:SS]
            const parts = trimmed.split(' ');
            const [year, month, day] = parts[0].split('-');
            const timeParts = parts[1].split(':');
            const hour = parseInt(timeParts[0]);
            const minute = parseInt(timeParts[1]);
            const second = timeParts[2] ? parseInt(timeParts[2]) : 0;
            dateObject = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hour, minute, second);
        }
        else if (/^\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
            // DD-MM-YYYY HH:MM[:SS]
            const parts = trimmed.split(' ');
            const [day, month, year] = parts[0].split('-');
            const timeParts = parts[1].split(':');
            const hour = parseInt(timeParts[0]);
            const minute = parseInt(timeParts[1]);
            const second = timeParts[2] ? parseInt(timeParts[2]) : 0;
            dateObject = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hour, minute, second);
        }
        else if (/^\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
            // DD.MM.YYYY HH:MM[:SS]
            const parts = trimmed.split(' ');
            const [day, month, year] = parts[0].split('.');
            const timeParts = parts[1].split(':');
            const hour = parseInt(timeParts[0]);
            const minute = parseInt(timeParts[1]);
            const second = timeParts[2] ? parseInt(timeParts[2]) : 0;
            dateObject = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hour, minute, second);
        }
        else if (/^\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{2}(:\d{2})?(\.\d{3})?Z?$/.test(trimmed)) {
            // ISO format: YYYY-MM-DDTHH:MM[:SS][.mmm][Z]
            dateObject = new Date(trimmed);
        }
        // Formatos apenas com data (mantém hora padrão 12:00)
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
            // DD/MM/YYYY ou D/M/YYYY
            const [day, month, year] = trimmed.split('/');
            dateObject = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);
        } 
        else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
            // YYYY-MM-DD
            dateObject = new Date(trimmed + 'T12:00:00Z');
        }
        else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(trimmed)) {
            // DD-MM-YYYY
            const [day, month, year] = trimmed.split('-');
            dateObject = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);
        }
        else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(trimmed)) {
            // DD.MM.YYYY
            const [day, month, year] = trimmed.split('.');
            dateObject = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);
        }
        else {
            // Tenta parsing genérico
            dateObject = new Date(trimmed);
        }
        
        // Verifica se a data é válida
        if (!dateObject || isNaN(dateObject.getTime())) {
            return null;
        }
        
        // Verifica se a data está em um range razoável (1900 - 2100)
        const year = dateObject.getFullYear();
        if (year < 1900 || year > 2100) {
            return null;
        }
        
        return firebase.firestore.Timestamp.fromDate(dateObject);
        
    } catch (error) {
        console.warn(`Erro ao converter data "${dateString}":`, error);
        return null;
    }
}

function normalizeCompradoresList(compradores = []) {
  if (!Array.isArray(compradores)) return [];

  return compradores
    .filter((item) => item && typeof item === 'object')
    .map((comprador) => {
      const normalized = { ...comprador };

      if (typeof normalized.nome === 'string') {
        normalized.nome = normalized.nome.trim();
      }
      if (typeof normalized.cpf === 'string') {
        normalized.cpf = normalized.cpf.trim();
      }
      if (typeof normalized.email === 'string') {
        normalized.email = normalized.email.trim();
      }

      if (normalized.telefone) {
        const sanitized = normalizePhoneToE164(normalized.telefone, {
          keepOriginalOnFailure: true,
        });
        normalized.telefone = sanitized || String(normalized.telefone).trim();
      } else {
        normalized.telefone = '';
      }

      if (typeof normalized.principal !== 'boolean') {
        normalized.principal = Boolean(normalized.principal);
      }

      return normalized;
    });
}

/**
 * Compara duas listas de compradores de forma robusta, ignorando diferenças de formatação.
 * Normaliza telefones para E.164 e compara apenas campos relevantes.
 * @param {Array} original - Lista original de compradores
 * @param {Array} updated - Lista atualizada de compradores
 * @returns {boolean} - true se houve mudança real, false se são equivalentes
 */
function compareCompradoresLists(original = [], updated = []) {
  const normalizeForComparison = (list) => {
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && typeof item === 'object')
      .map((comprador) => {
        // Extrai apenas dígitos do telefone para comparação
        const phoneDigits = comprador.telefone 
          ? String(comprador.telefone).replace(/\D/g, '').slice(-11) // Últimos 11 dígitos (DDD + número)
          : '';
        
        return {
          nome: String(comprador.nome || '').trim().toLowerCase(),
          cpf: String(comprador.cpf || '').replace(/\D/g, ''), // CPF apenas dígitos
          email: String(comprador.email || '').trim().toLowerCase(),
          telefone: phoneDigits,
          principal: Boolean(comprador.principal)
        };
      })
      // Ordena por CPF para garantir comparação consistente
      .sort((a, b) => a.cpf.localeCompare(b.cpf) || a.nome.localeCompare(b.nome));
  };

  const normalizedOriginal = normalizeForComparison(original);
  const normalizedUpdated = normalizeForComparison(updated);

  // Se tamanhos diferentes, houve mudança
  if (normalizedOriginal.length !== normalizedUpdated.length) {
    return true;
  }

  // Compara cada comprador
  for (let i = 0; i < normalizedOriginal.length; i++) {
    const orig = normalizedOriginal[i];
    const upd = normalizedUpdated[i];

    if (
      orig.nome !== upd.nome ||
      orig.cpf !== upd.cpf ||
      orig.email !== upd.email ||
      orig.telefone !== upd.telefone ||
      orig.principal !== upd.principal
    ) {
      return true; // Houve mudança
    }
  }

  return false; // Não houve mudança
}

const YEAR_REFERENCE_FIELDS = [
  "dataMinuta",
  "dataAssinaturaCliente",
  "dataEnvioLiberacaoGarantia",
  "dataRetiradaContratoRegistrado",
  "dataAnaliseRegistro",
  "dataPrevistaRegistro",
  "dataRetornoRi",
  "dataConformidadeCehop",
  "dataEmissaoNF",
  "dataEntradaRegistro",
  "contratoCef"
];

function sanitizeCpfValue(value) {
  if (!value) return "";
  const digits = String(value).replace(/[^\d]/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return digits;
}

function parseBooleanLike(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === null || value === undefined) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "sim", "principal", "yes"].includes(normalized);
}

function parseCompradoresFromTextBlock(rawValue) {
  if (!rawValue || typeof rawValue !== "string") {
    return [];
  }

  const linhas = rawValue
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);

  const compradores = [];

  linhas.forEach((linha) => {
    let nome = linha;
    let cpf = "";

    const cpfMatch = linha.match(/cpf[:\s-]*([\d.-]+)/i);
    if (cpfMatch) {
      cpf = cpfMatch[1];
      nome = linha.slice(0, cpfMatch.index).replace(/[-–:,]+$/, "").trim();
    }

    if (!nome && cpfMatch) {
      nome = linha.replace(cpfMatch[0], "").trim();
    }

    compradores.push({
      nome,
      cpf: sanitizeCpfValue(cpf),
      principal: compradores.length === 0,
    });
  });

  return compradores;
}

function hydrateCompradoresFromContract(contract) {
  const compradores = [];

  if (Array.isArray(contract.compradores)) {
    compradores.push(...contract.compradores);
  } else if (typeof contract.compradores === "string" && contract.compradores.trim() !== "") {
    compradores.push(...parseCompradoresFromTextBlock(contract.compradores));
  }

  const MAX_COMPRADORES = 4;
  for (let j = 1; j <= MAX_COMPRADORES; j++) {
    const nome = contract[`comprador_${j}_nome`];
    const cpf = contract[`comprador_${j}_cpf`];
    const email = contract[`comprador_${j}_email`];
    const telefone = contract[`comprador_${j}_telefone`];
    const principal = contract[`comprador_${j}_principal`];

    if (nome && nome.trim() !== "") {
      compradores.push({
        nome: nome.trim(),
        cpf: sanitizeCpfValue(cpf),
        email: email || "",
        telefone: telefone || "",
        principal: parseBooleanLike(principal) || compradores.length === 0,
      });
    }

    delete contract[`comprador_${j}_nome`];
    delete contract[`comprador_${j}_cpf`];
    delete contract[`comprador_${j}_email`];
    delete contract[`comprador_${j}_telefone`];
    delete contract[`comprador_${j}_principal`];
  }

  const comprList = normalizeCompradoresList(compradores);
  if (comprList.length > 0 && !comprList.some((item) => item.principal)) {
    comprList[0].principal = true;
  }
  contract.compradores = comprList;
  return comprList;
}

function inferReferenceYear(contract, excludeField) {
  if (contract.__referenceYear) {
    return contract.__referenceYear;
  }

  for (const field of YEAR_REFERENCE_FIELDS) {
    if (field === excludeField) continue;
    const value = contract[field];
    if (!value) continue;

    let dateCandidate = null;
    if (value instanceof Date) {
      dateCandidate = value;
    } else if (value && typeof value.toDate === "function") {
      dateCandidate = value.toDate();
    } else {
      dateCandidate = parseDateString(value);
    }

    if (dateCandidate && !isNaN(dateCandidate.getTime())) {
      contract.__referenceYear = dateCandidate.getFullYear();
      return contract.__referenceYear;
    }
  }

  return null;
}

function parseDateWithInference(value, contract, fieldName) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value.toDate === "function") {
    return value.toDate();
  }

  const trimmed = String(value).trim();
  let parsed = parseDateString(trimmed);

  if (parsed && !isNaN(parsed.getTime())) {
    return parsed;
  }

  const compactDateMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (compactDateMatch) {
    const referenceYear = inferReferenceYear(contract, fieldName);
    if (referenceYear) {
      const separator = trimmed.includes("-") ? "-" : "/";
      const enriched = `${compactDateMatch[1]}${separator}${compactDateMatch[2]}${separator}${referenceYear}`;
      parsed = parseDateString(enriched);
      if (parsed && !isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return null;
}

function normalizeDateFieldsFromCsv(contract, { rowIndex = -1, logDates = false } = {}) {
  if (!Array.isArray(DATE_FIELDS_IMPORT)) {
    return;
  }

  DATE_FIELDS_IMPORT.forEach((fieldName) => {
    if (!Object.prototype.hasOwnProperty.call(contract, fieldName) || contract[fieldName] === undefined) {
      contract[fieldName] = null;
      return;
    }

    const originalValue = contract[fieldName];
    if (!originalValue) {
      contract[fieldName] = null;
      return;
    }

    if (originalValue instanceof Date) {
      if (!contract.__referenceYear) {
        contract.__referenceYear = originalValue.getFullYear();
      }
      return;
    }

    if (originalValue && typeof originalValue.toDate === "function") {
      const asDate = originalValue.toDate();
      contract[fieldName] = asDate;
      if (!contract.__referenceYear) {
        contract.__referenceYear = asDate.getFullYear();
      }
      return;
    }

    const parsedDate = parseDateWithInference(originalValue, contract, fieldName);
    if (parsedDate && !isNaN(parsedDate.getTime())) {
      contract[fieldName] = parsedDate;
      if (!contract.__referenceYear) {
        contract.__referenceYear = parsedDate.getFullYear();
      }
      if (logDates) {
        console.log(` Data convertida - ${fieldName}: "${originalValue}" → ${parsedDate.toISOString()}`);
      }
    } else {
      contract[fieldName] = null;
      if (rowIndex >= 0) {
        console.warn(` Data inválida no campo "${fieldName}" (linha ${rowIndex + 2}): "${originalValue}"`);
      }
    }
  });

  delete contract.__referenceYear;
}

function parseBrazilianNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }

  const cleaned = String(value)
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");

  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeNumericFieldsFromCsv(contract) {
  if (!Array.isArray(NUMERIC_FIELDS_IMPORT)) {
    return;
  }

  NUMERIC_FIELDS_IMPORT.forEach((fieldName) => {
    if (!Object.prototype.hasOwnProperty.call(contract, fieldName)) {
      return;
    }

    const value = contract[fieldName];
    if (value === undefined || value === null || value === "") {
      contract[fieldName] = null;
      return;
    }

    if (typeof value === "number") {
      return;
    }

    contract[fieldName] = parseBrazilianNumber(value);
  });
}

function finalizeContractFromCsv(contract, options = {}) {
  if (!contract || typeof contract !== "object") {
    return contract;
  }

  const { rowIndex = -1, logDates = false } = options;

  hydrateCompradoresFromContract(contract);
  normalizeDateFieldsFromCsv(contract, { rowIndex, logDates });
  normalizeNumericFieldsFromCsv(contract);

  if (!contract.clientePrincipal && Array.isArray(contract.compradores) && contract.compradores.length > 0) {
    contract.clientePrincipal = contract.compradores[0].nome || contract.clientePrincipal;
  }

  return contract;
}

/**
 * Converte uma string de data (ou Timestamp) para um objeto Date.
 * @param {string|object} value - O valor a ser convertido.
 * @returns {Date|null} O objeto Date ou null se a conversão falhar.
 */
export function parseDateString(value) {
  if (!value) return null;

  // Caso já seja um objeto Date ou Timestamp do Firestore
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();

  const trimmedValue = String(value).trim();

  // CORREÇÃO: Adiciona um tratamento específico para o formato datetime-local (yyyy-mm-ddThh:mm)
  // O construtor 'new Date()' já entende este formato nativamente.
  if (trimmedValue.includes("T")) {
    const date = new Date(trimmedValue);
    // Retorna o objeto de data se for válido, caso contrário, passa para as próximas verificações
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // CORREÇÃO: Aceita 1 ou 2 dígitos para dia e mês (dd/mm/yyyy ou d/m/yyyy)
  if (/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(trimmedValue)) {
    const [day, month, year] = trimmedValue.split("/");
    // Cria uma data local, ajustando o mês para ser baseado em 0
    return new Date(+year, month - 1, +day);
  }

  // Mantém o suporte para o formato yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    const [year, month, day] = trimmedValue.split("-");
    return new Date(+year, month - 1, +day);
  }

  // Retorna null para valores que não correspondem aos formatos esperados
  return null;
}

/**
 * Busca uma página de contratos do Firestore com uma lógica de filtro avançada.
 * Usa o PaginationService para otimização quando possível.
 * @param {object} options - Opções de consulta.
 * @returns {Promise<object>} Um objeto com os contratos e dados de paginação.
 */
export async function getContractsPage(options = {}) {
  try {
    // Tenta usar PaginationService otimizado primeiro
    const pageResult = await getContractsPageOptimized(options);
    return await applyPermissionsToPageResult(pageResult, options);
  } catch (error) {
    console.warn(' Fallback para método original de paginação:', error);
    const fallbackResult = await getContractsPageOriginal(options);
    return await applyPermissionsToPageResult(fallbackResult, options);
  }
}

/**
 * Versão otimizada usando PaginationService
 */
async function getContractsPageOptimized(options) {
  // Prepara query base
  let baseQuery = contractsCollection;
  let hasInequalityFilter = false; // Flag para indicar se usamos filtro de desigualdade (not-in)
  let hasInFilter = false; // Flag para filtro 'in'
  
  // Aplica filtros de status
  const { selectedStatuses, allStatusTexts } = deriveStatusFilter(options.statusFilter, options.includeArchived === true);

  if (selectedStatuses.length > 0 && selectedStatuses.length < allStatusTexts.length) {
    const deselectedStatuses = allStatusTexts.filter((s) => !selectedStatuses.includes(s));

    if (deselectedStatuses.length > 0 && deselectedStatuses.length <= 10) {
      baseQuery = baseQuery.where("status", "not-in", deselectedStatuses);
      hasInequalityFilter = true; // Marca que usamos not-in
    } else if (selectedStatuses.length <= 10) {
      baseQuery = baseQuery.where("status", "in", selectedStatuses);
      hasInFilter = true; // Marca que usamos in
    }
  }

  // IMPORTANTE: Firestore com filtros 'in' ou 'not-in' exige índices compostos
  // Os índices foram criados em firestore.indexes.json para suportar estas queries
  // Se não houver índice para a combinação específica, usamos fallback
  const sortField = options.sortKey || "clientePrincipal";
  
  // Lista de campos que possuem índices compostos com status
  const fieldsWithStatusIndex = [
    "clientePrincipal", "vendedorConstrutora", "empreendimento", "entrada",
    "analista", "apto", "bloco", "nContratoCEF", "agencia", "cartorio", 
    "dataMinuta", "status"
  ];
  
  // Verifica se o campo de ordenação possui índice composto
  if ((hasInequalityFilter || hasInFilter) && !fieldsWithStatusIndex.includes(sortField)) {
    console.log(` Campo "${sortField}" não possui índice composto com status, usando fallback`);
    throw new Error('Campo de ordenação sem índice composto com status');
  }

  // Configura opções para PaginationService
  const paginationOptions = {
    pageSize: options.limit || 20,
    page: options.page || 1,
    sortField: sortField,
    sortDirection: options.sortDirection || "asc",
    filters: {},
    cursor: options.cursor,
    direction: options.direction || 'next',
    // IMPORTANTE: Informa ao PaginationService sobre filtros de desigualdade
    // para que ele ordene corretamente (primeiro pelo campo do filtro)
    inequalityField: hasInequalityFilter ? "status" : null,
    hasInFilter: hasInFilter
  };

  // Aplica busca por texto se necessário
  if (options.searchTerm) {
    // Para busca por texto, usamos método original pois Firestore não suporta full-text search
    throw new Error('Busca por texto requer método original');
  }

  console.log(` Usando PaginationService para página ${paginationOptions.page}`);
  
  // Usa PaginationService otimizado
  const result = await paginationService.getPage(contractsCollection, baseQuery, paginationOptions);
  
  // Converte para formato esperado pelo sistema
  return {
    contracts: result.documents.map((doc) => normalizeContractFieldAliases(doc)),
    firstVisible: result.firstDocument,
    lastVisible: result.lastDocument,
    totalCount: result.totalEstimate || result.totalDocuments,
    page: result.page,
    hasNextPage: result.hasNextPage,
    hasPrevPage: result.hasPrevPage
  };
}

/**
 * Versão original mantida como fallback
 */
async function getContractsPageOriginal(options) {
  let query = contractsCollection;
  let totalCountQuery = contractsCollection;
  let hasInequalityFilter = false; // Flag para indicar se usamos filtro de desigualdade (not-in)

  // --- 1. LÓGICA DE FILTRAGEM (WHERE) ---
  const { selectedStatuses, allStatusTexts } = deriveStatusFilter(options.statusFilter, options.includeArchived === true);

  if (
    selectedStatuses.length > 0 &&
    selectedStatuses.length < allStatusTexts.length
  ) {
    const deselectedStatuses = allStatusTexts.filter(
      (s) => !selectedStatuses.includes(s)
    );

    if (deselectedStatuses.length > 0 && deselectedStatuses.length <= 10) {
      // Filtro de exclusão (not-in é um filtro de desigualdade)
      query = query.where("status", "not-in", deselectedStatuses);
      totalCountQuery = totalCountQuery.where(
        "status",
        "not-in",
        deselectedStatuses
      );
      hasInequalityFilter = true; // Marca que usamos not-in
    } else if (selectedStatuses.length > 0 && selectedStatuses.length <= 10) {
      // Filtro de inclusão (in não é filtro de desigualdade)
      query = query.where("status", "in", selectedStatuses);
      totalCountQuery = totalCountQuery.where("status", "in", selectedStatuses);
    }
  }

  // --- 2. LÓGICA DE ORDENAÇÃO (ORDERBY) ---
  // IMPORTANTE: Firestore exige que quando usamos filtro de desigualdade (not-in, !=, <, >, etc.)
  // o primeiro orderBy seja no campo do filtro de desigualdade
  if (hasInequalityFilter && options.sortKey !== "status") {
    query = query.orderBy("status"); // Ordenação obrigatória pelo campo do filtro de desigualdade
  }
  query = query.orderBy(options.sortKey, options.sortDirection);

  // --- 3. LÓGICA DE PAGINAÇÃO (LIMIT, STARTAFTER, ETC.) ---
  const pageLimit = Number(options.limit) > 0 ? Number(options.limit) : 20;
  if (options.cursor) {
    if (options.direction === "prev") {
      // Para voltar, a consulta termina ANTES do cursor e pega os ULTIMOS items
      query = query.endBefore(options.cursor).limitToLast(pageLimit);
    } else {
      // Para avancar, a consulta comeca DEPOIS do cursor
      query = query.startAfter(options.cursor);
      query = query.limit(pageLimit);
    }
  } else {
    // Se nao ha cursor, e a primeira pagina
    query = query.limit(pageLimit);
  }

  // OTIMIZACAO: evita count() quando a primeira pagina ja retornou menos itens que o limite.
  let totalCount = 0;
  const snapshot = await query.get();

  const canInferTotalFromCurrentPage =
    !options.cursor && snapshot.docs.length < pageLimit;

  if (canInferTotalFromCurrentPage) {
    totalCount = snapshot.docs.length;
  } else if (typeof totalCountQuery.count === "function") {
    const countSnap = await totalCountQuery.count().get();
    totalCount = countSnap.data().count;

    if (window.__DEBUG__) {
      console.log(" [OTIMIZADO] Contagem via count():", totalCount);
    }
  } else {
    // Fallback para SDKs antigos (Firebase 8.x ou inferior)
    console.warn(" count() nao disponivel, usando fallback pesado");
    const totalSnap = await totalCountQuery.get();
    totalCount = totalSnap.size;
  }

  return {
    contracts: snapshot.docs.map((doc) =>
      normalizeContractFieldAliases({ id: doc.id, ...doc.data() })
    ),
    firstVisible: snapshot.docs[0],
    lastVisible: snapshot.docs[snapshot.docs.length - 1],
    totalCount: totalCount,
  };
}

/**
 * Ouve as alterações na coleção de contratos em tempo real (OTIMIZADO).
 * @param {object} options - Opções de ordenação e filtro.
 * @param {Function} callback - Função a ser chamada com os novos dados.
 * @returns {Function} - A função de 'unsubscribe' para parar de ouvir.
 */
export function listenForContracts(options = {}, callback) {
  const includeArchived = options.includeArchived === true;
  const { selectedStatuses, archivedStatuses, allStatusTexts } = deriveStatusFilter(
    options.statusFilter,
    includeArchived
  );

  let query = contractsCollection;
  let hasInequalityFilter = false;

  // Aplica filtro de status no servidor quando possível para reduzir leituras
  const canUseNotIn =
    !includeArchived &&
    archivedStatuses.length > 0 &&
    archivedStatuses.length <= 10 &&
    archivedStatuses.length < allStatusTexts.length;

  if (canUseNotIn) {
    query = query.where('status', 'not-in', archivedStatuses);
    hasInequalityFilter = true;
  } else if (
    selectedStatuses.length > 0 &&
    selectedStatuses.length <= 10
  ) {
    query = query.where('status', 'in', selectedStatuses);
  }

  // Regras de ordenação quando usamos not-in (filtro de desigualdade)
  if (hasInequalityFilter && options.sortKey !== 'status') {
    query = query.orderBy('status');
  }

  query = query.orderBy(
    options.sortKey || 'updatedAt',
    options.sortDirection || 'desc'
  );

  // Registra listener otimizado
  const optimizedCallback = listenerOptimizer.registerListener(
    'contracts_filtered',
    async (snapshot) => {
      try {
        let contracts = snapshot.docs.map((doc) =>
          normalizeContractFieldAliases({
            id: doc.id,
            ...doc.data(),
          })
        );

        // Filtro de arquivados no cliente (substitui o not-in que causava erro)
        const shouldFilterClientArchived =
          options.includeArchived !== true &&
          !canUseNotIn &&
          !(selectedStatuses.length > 0 && selectedStatuses.length <= 10);

        if (shouldFilterClientArchived) {
          const archivedSet = new Set(archivedStatuses);
          contracts = contracts.filter((c) => !archivedSet.has(c.status));
        }

        if (options.searchTerm) {
          const searchTerm = options.searchTerm.toLowerCase();
          contracts = contracts.filter(
            (c) =>
              String(c.cliente || "")
                .toLowerCase()
                .includes(searchTerm) ||
              String(c.empreendimento || "")
                .toLowerCase()
                .includes(searchTerm) ||
              String(c.vendedorConstrutora || "")
                .toLowerCase()
                .includes(searchTerm)
          );
        }

        const filtered = await filterContractsByPermissions(contracts, options);
        callback(filtered);
      } catch (error) {
        console.error('Erro ao processar listener de contratos:', error);
        callback([]);
      }
    },
    {
      critical: false,
      throttle: true,
      batchProcess: true
    }
  );

  const unsubscribe = query.onSnapshot(
    optimizedCallback,
    (error) => {
      console.error("Erro ao ouvir contratos: ", error);
      callback([]);
    }
  );

  // Registra função de unsubscribe
  listenerOptimizer.setUnsubscribe('contracts_filtered', unsubscribe);

  return () => {
    unsubscribe();
    listenerOptimizer.unregisterListener('contracts_filtered');
  };
}

/**
 * Obtém todos os contratos uma única vez (para filtros, por exemplo).
 *  CUIDADO: Esta função baixa TODOS os contratos do Firestore!
 * Use apenas quando realmente necessário (exportação, backup, etc.)
 * Para dashboard/KPIs, prefira Cloud Functions ou agregação.
 * @returns {Promise<Array>} Uma lista de todos os contratos.
 */
export async function getAllContracts(options = {}) {
  // Aviso de debug para identificar chamadas desnecessárias
  if (window.__DEBUG__) {
    console.log(' [DEBUG] getAllContracts() chamado - carregando todos os contratos');
    // console.trace('Stack trace:');
  }

  const includeArchived = options.includeArchived === true;
  const { selectedStatuses, archivedStatuses, allStatusTexts } = deriveStatusFilter(
    options.statusFilter,
    includeArchived
  );

  const canUseNotIn =
    !includeArchived &&
    archivedStatuses.length > 0 &&
    archivedStatuses.length <= 10 &&
    archivedStatuses.length < allStatusTexts.length;

  const canUseIn =
    selectedStatuses.length > 0 &&
    selectedStatuses.length <= 10 &&
    selectedStatuses.length < allStatusTexts.length;

  const cacheKey = includeArchived ? 'contracts_all_with_archived' : 'contracts_all_active';

  const contracts = await cacheService.get(
    cacheKey,
    async () => {
      try {
        console.log(' [getAllContracts] Baixando contratos do Firestore com filtro de arquivados...');
        let query = contractsCollection;

        if (canUseNotIn) {
          query = query.where('status', 'not-in', archivedStatuses);
        } else if (canUseIn) {
          query = query.where('status', 'in', selectedStatuses);
        }

        const snapshot = await query.get();
        console.log(` [getAllContracts] ${snapshot.size} contratos baixados (includeArchived=${includeArchived})`);

        let docs = snapshot.docs.map((doc) =>
          normalizeContractFieldAliases({ id: doc.id, ...doc.data() })
        );

        if (!includeArchived && !canUseNotIn) {
          const archivedSet = new Set(archivedStatuses);
          docs = docs.filter((c) => !archivedSet.has(c.status));
        }

        return docs;
      } catch (error) {
        console.error("Erro ao buscar todos os contratos:", error);
        return [];
      }
    },
    'contractsAll' // TTL padrão de 30 minutos no cacheService
  );

  return await filterContractsByPermissions(contracts, options);
}

/**
 * Obtém contratos arquivados a partir de archivedContracts.
 * Usa cache com TTL padrão e permite atualização manual via forceRefresh.
 * @param {object} options
 * @param {boolean} options.includeArchived - mantido por compatibilidade.
 * @param {boolean} options.forceRefresh - força refetch ignorando cache.
 * @param {number} options.limit - limita quantidade retornada.
 */
export async function getArchivedContracts(options = {}) {
  const { forceRefresh = false, limit = null } = options;
  const cacheKey = limit ? `contracts_archived_${limit}` : 'contracts_archived_all';

  const contracts = await cacheService.get(
    cacheKey,
    async () => {
      try {
        console.log('[getArchivedContracts] Fetch direto do Firestore (archivedContracts)...');
        let query = archivedContractsCollection.orderBy('archivedAt', 'desc');
        if (limit) {
          query = query.limit(limit);
        }

        const snapshot = await query.get();
        const docs = snapshot.docs.map((doc) =>
          normalizeContractFieldAliases({ id: doc.id, ...doc.data() })
        );

        docs.sort((a, b) => {
          const dateA = a.archivedAt?.toDate?.() || a.archivedAt || a.updatedAt?.toDate?.() || a.updatedAt || new Date(0);
          const dateB = b.archivedAt?.toDate?.() || b.archivedAt || b.updatedAt?.toDate?.() || b.updatedAt || new Date(0);
          return new Date(dateB) - new Date(dateA);
        });

        return docs;
      } catch (error) {
        console.error('[getArchivedContracts] Erro ao buscar contratos arquivados:', error);
        return [];
      }
    },
    'contracts',
    forceRefresh
  );

  return await filterContractsByPermissions(contracts, options);
}

/**
 * Migra contratos arquivados da coleção principal para a coleção dedicada.
 * Após a cópia bem sucedida, remove o documento original.
 * @deprecated Use `archiveContractsToStorageHybrid` para arquivamento híbrido no Storage
 * @param {object} options
 * @param {number} options.batchSize - tamanho do lote (máx. seguro 450 para evitar limite de batch de 500)
 * @returns {Promise<object>} resumo da migração
 */
export async function migrateArchivedContracts(options = {}) {
  const batchSize = Math.min(options.batchSize || 200, 450);
  const { archivedStatuses } = deriveStatusFilter([], false);

  if (!archivedStatuses || archivedStatuses.length === 0) {
    return { migrated: 0, statusesUsed: [] };
  }

  // Firestore limita 'in' a 10 itens
  const statusesForQuery = archivedStatuses.slice(0, 10);
  let migrated = 0;
  let iterations = 0;

  while (true) {
    const snap = await contractsCollection
      .where('status', 'in', statusesForQuery)
      .limit(batchSize)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.forEach((doc) => {
      const data = doc.data();
      const archivedRef = archivedContractsCollection.doc(doc.id);
      batch.set(archivedRef, {
        ...data,
        migratedAt: new Date(),
        migratedBy: auth?.currentUser?.email || 'system'
      });
      batch.delete(doc.ref);
    });

    await batch.commit();
    migrated += snap.size;
    iterations += 1;

    // Invalida caches relacionados
    cacheService.invalidateByPattern(/^contracts/);
    cacheService.invalidateByPattern(/^dashboard/);
    paginationService.invalidateCache('contracts');

    if (snap.size < batchSize) {
      break;
    }
  }

  return { migrated, iterations, statusesUsed: statusesForQuery };
}

function archivedDateSortComparator(a, b) {
  const dateA = a.archivedAt?.toDate?.() || a.archivedAt || a.updatedAt?.toDate?.() || a.updatedAt || new Date(0);
  const dateB = b.archivedAt?.toDate?.() || b.archivedAt || b.updatedAt?.toDate?.() || b.updatedAt || new Date(0);
  return new Date(dateB) - new Date(dateA);
}

function matchesArchivedContractFilters(contract = {}, filters = {}) {
  if (!filters || typeof filters !== 'object') {
    return true;
  }

  if (filters.status && contract.status !== filters.status) {
    return false;
  }

  if (filters.cliente) {
    const searchTerm = String(filters.cliente || '').toLowerCase();
    const cleanTerm = searchTerm.replace(/[.\-\s/]/g, '');
    const cliente = String(contract.clientePrincipal || '').toLowerCase();
    const cpfPrincipal = String(contract.cpfPrincipal || '').replace(/[.\-\s/]/g, '');

    const matchesClientName = cliente.includes(searchTerm);
    const matchesCpf = /^\d{3,}$/.test(cleanTerm) && cpfPrincipal.includes(cleanTerm);
    const matchesBuyer = Array.isArray(contract.compradores) && contract.compradores.some((buyer) => {
      const buyerCpf = String(buyer?.cpf || '').replace(/[.\-\s/]/g, '');
      if (/^\d{3,}$/.test(cleanTerm)) {
        return buyerCpf.includes(cleanTerm);
      }

      return String(buyer?.nome || '').toLowerCase().includes(searchTerm);
    });

    if (!matchesClientName && !matchesCpf && !matchesBuyer) {
      return false;
    }
  }

  if (filters.empreendimento) {
    const empreendimento = String(contract.empreendimento || '').toLowerCase();
    if (!empreendimento.includes(String(filters.empreendimento || '').toLowerCase())) {
      return false;
    }
  }

  return true;
}

/**
 * ============= ARQUIVAMENTO FIRESTORE-FIRST =============
 * Mantem nomes publicos legados por compatibilidade com o restante da aplicacao.
 */

/**
 * Arquiva contratos em archivedContracts.
 * A callable ainda usa o nome legado por compatibilidade.
 * @param {object} options - Opcoes de arquivamento
 * @returns {Promise<object>} Estatisticas do processo
 */
export async function archiveContractsToStorageHybrid(options = {}) {
  console.log(' Iniciando arquivamento para archivedContracts...');
  
  try {
    const archiveFunction = firebase.app().functions('us-central1').httpsCallable('archiveContractsToStorage');
    const result = await archiveFunction(options);
    const archiveData = result?.data || result || {};

    if (activityLogService?.logActivity) {
      const archivedCount = Number(archiveData.archivedCount || archiveData.totalArchived || archiveData.count || 0) || 0;
      activityLogService.logActivity(
        'CONTRACT_ARCHIVED',
        archivedCount > 0
          ? `${archivedCount} contrato(s) arquivado(s)`
          : 'Arquivamento de contratos executado',
        null,
        {
          source: 'archiveContractsToStorageHybrid',
          archivedCount,
          options,
        }
      );
    }
    
    // Invalida caches após arquivamento
    cacheService.invalidateByPattern(/^contracts/);
    cacheService.invalidateByPattern(/^dashboard/);
    paginationService.invalidateCache('contracts');
    
    return archiveData;
  } catch (error) {
    console.error(' Erro no arquivamento em archivedContracts:', error);
    throw error;
  }
}

/**
 * Busca contrato arquivado em archivedContracts.
 * @param {string} contractId - ID do contrato
 * @param {boolean} forceRefresh - Forca busca ignorando cache
 * @returns {Promise<object>} Dados completos do contrato
 */
export async function getArchivedContractFromStorage(contractId, forceRefresh = false) {
  return await cacheService.get(
    `contract_archived_${contractId}`,
    async () => {
      const callable = firebase.app().functions('us-central1').httpsCallable('getArchivedContractFromStorage');
      const result = await callable({ contractId });
      return normalizeContractFieldAliases(result?.data?.contract || null);
    },
    'contracts',
    forceRefresh
  );
}

/**
 * Lista contratos arquivados em archivedContracts.
 * @param {object} options - Opcoes de busca
 * @returns {Promise<object>} Lista de contratos arquivados
 */
export async function listArchivedContractsFromStorage(options = {}) {
  const {
    limit = 50,
    lastDoc = null,
    filters = {},
    forceRefresh = false,
    cacheOnly = false
  } = options;

  const cacheKey = `contracts_archived_list_${encodeURIComponent(JSON.stringify({ limit, filters })).slice(0, 120)}`;

  const fetchList = async () => {
    try {
      const callable = firebase.app().functions('us-central1').httpsCallable('listArchivedContracts');
      const response = await callable({ limit, lastDoc, filters });
      const contracts = await filterContractsByPermissions(
        (response?.data?.contracts || []).map((contract) => normalizeContractFieldAliases(contract)),
        options
      );

      return {
        contracts,
        hasMore: Boolean(response?.data?.hasMore),
        lastDoc: response?.data?.lastDoc || null,
        total: contracts.length
      };
    } catch (error) {
      console.warn('[listArchivedContractsFromStorage] Fallback local ativado:', error?.message || error);

      let query = archivedContractsCollection.orderBy('archivedAt', 'desc');
      if (filters.status) {
        query = query.where('status', '==', filters.status);
      }
      if (lastDoc) {
        const lastDocRef = await archivedContractsCollection.doc(lastDoc).get();
        if (lastDocRef.exists) {
          query = query.startAfter(lastDocRef);
        }
      }
      query = query.limit(Math.min(limit, 5500));

      const snapshot = await query.get();
      const rawContracts = snapshot.docs
        .map((doc) => normalizeContractFieldAliases({ id: doc.id, ...doc.data() }))
        .filter((contract) => matchesArchivedContractFilters(contract, filters))
        .sort(archivedDateSortComparator);

      const contracts = await filterContractsByPermissions(rawContracts, options);
      return {
        contracts,
        hasMore: snapshot.docs.length === limit,
        lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null,
        total: contracts.length
      };
    }
  };

  if (lastDoc) {
    return await fetchList();
  }

  if (cacheOnly) {
    const cached = await cacheService.getCached(cacheKey, 'contracts');
    if (cached) {
      return cached;
    }

    return {
      contracts: [],
      hasMore: false,
      lastDoc: null,
      total: 0
    };
  }

  return await cacheService.get(cacheKey, fetchList, 'contracts', forceRefresh);
}

/**
 * Busca contratos arquivados por termo
 * @param {string} searchTerm - Termo de busca
 * @param {object} options - Opções adicionais
 * @returns {Promise<object>} Contratos encontrados
 */
export async function searchArchivedContractsInStorage(searchTerm, options = {}) {
  if (!searchTerm || searchTerm.trim() === '') {
    return await listArchivedContractsFromStorage(options);
  }

  const term = searchTerm.toLowerCase().trim();
  const cleanTerm = searchTerm.replace(/[.\-\s/]/g, '');
  const result = await listArchivedContractsFromStorage({
    ...options,
    filters: {
      ...(options.filters || {}),
      cliente: term
    },
    limit: options.limit || 100
  });

  const filtered = (result.contracts || []).filter((contract) => {
    if (/^\d{3,}$/.test(cleanTerm)) {
      const cpfPrincipal = String(contract.cpfPrincipal || '').replace(/[.\-\s/]/g, '');
      if (cpfPrincipal.includes(cleanTerm)) return true;
      if (Array.isArray(contract.compradores)) {
        return contract.compradores.some((buyer) =>
          String(buyer?.cpf || '').replace(/[.\-\s/]/g, '').includes(cleanTerm)
        );
      }
      return false;
    }

    return [
      contract.clientePrincipal,
      contract.empreendimento,
      contract.vendedorConstrutora,
      contract.status,
      contract.apto,
      contract.bloco
    ].some((value) => String(value || '').toLowerCase().includes(term));
  });

  return {
    ...result,
    contracts: filtered,
    total: filtered.length
  };
}

/**
 * Restaura contrato arquivado para Firestore ativo
 * @param {string} contractId - ID do contrato
 * @returns {Promise<object>} Resultado da restauração
 */
export async function restoreContractFromStorageArchive(contractId) {
  const restoreFunction = firebase.app().functions('us-central1').httpsCallable('restoreContractFromArchive');
  const result = await restoreFunction({ contractId });
  
  // Invalida caches após restauração
  cacheService.invalidateByPattern(/^contracts/);
  cacheService.invalidateByPattern(/^dashboard/);
  paginationService.invalidateCache('contracts');
  
  return result.data || result;
}

/**
 * Obtém estatísticas de arquivamento
 * @returns {Promise<object>} Estatísticas
 */
export async function getStorageArchiveStatistics() {
  return await cacheService.get(
    'contracts_archived_stats',
    async () => {
      const query = archivedContractsCollection;
      if (typeof query.count === 'function') {
        const snapshot = await query.count().get();
        return { total: snapshot.data().count || 0 };
      }

      const snapshot = await query.get();
      return { total: snapshot.size };
    },
    'contracts'
  );
}

/**
 * Busca contratos arquivados combinando índice do Firestore com dados do Storage
 * Método unificado que busca tanto da coleção archivedContracts quanto do Storage
 * @param {object} options - Opções de busca
 * @returns {Promise<Array>} Lista de contratos arquivados
 */
export async function getArchivedContractsUnified(options = {}) {
  return await getArchivedContracts(options);
}

/**
 * Busca os detalhes de um único contrato pelo ID.
 * @param {string} contractId - O ID do contrato.
 * @returns {Promise<object|null>} Os dados do contrato ou null se não for encontrado.
 */
export async function getContractById(contractId, options = {}) {
  const contract = await cacheService.get(
    `contract_${contractId}`,
    async () => {
      const doc = await contractsCollection.doc(contractId).get();
      if (!doc.exists) {
        console.error(`Contrato com ID ${contractId} não encontrado.`);
        return null;
      }
      return { id: doc.id, ...doc.data() };
    },
    'contractById'
  );

  if (!contract) {
    return null;
  }

  return await ensureContractVisibility(contract, options);
}

/**
 * Busca o histórico de um contrato.
 * @param {string} contractId - O ID do contrato.
 * @returns {Promise<Array>} Uma lista de entradas de histórico.
 */
export async function getContractHistory(contractId) {
  const historySnapshot = await contractsCollection
    .doc(contractId)
    .collection("historico")
    .orderBy("alteradoEm", "desc")
    .get();
  return historySnapshot.docs.map((doc) => doc.data());
}

/**
 * Adiciona uma entrada ao histórico do contrato.
 * Mantém compatibilidade usando a subcoleção "historico".
 */
export async function addContractHistoryEntry(contractId, entry = {}) {
  if (!contractId) throw new Error('Contract ID é obrigatório');

  const user = auth.currentUser;
  const payload = {
    alteradoEm: entry.alteradoEm || new Date(),
    alteradoPor: entry.alteradoPor || user?.email || 'IA',
    mudancas: entry.mudancas || [],
    origem: entry.origem || 'ia',
    tipo: entry.tipo || 'ia',
    detalhes: entry.detalhes || null,
  };

  await contractsCollection.doc(contractId).collection('historico').add(payload);
}
/**
 * Atualiza um contrato existente.
 * @param {string} id - O ID do contrato a ser atualizado.
 * @param {object} updatedData - Os novos dados.
 * @param {object} originalData - Os dados originais para gerar o log.
 * @param {object} userProfile - O perfil do utilizador logado (com fullName).
 */
export async function updateContract(id, updatedData, originalData, userProfile) {
    console.log("--- INICIANDO PROCESSO DE ATUALIZAÇÃO E LOG ---");
    console.log("ID do Contrato:", id);
    
    // Se originalData não for passado (ex: edição inline), busca do Firestore
    if (!originalData) {
      try {
        const doc = await db.collection("contracts").doc(id).get();
        originalData = doc.exists ? doc.data() : {};
      } catch (e) {
        console.warn('Aviso: Não foi possível buscar dados originais para log:', e);
        originalData = {};
      }
    }
    
    console.log("1. DADOS ORIGINAIS (do Firestore):", JSON.parse(JSON.stringify(originalData || {})));
    console.log("2. NOVOS DADOS (do formulário):", updatedData);

    const user = auth.currentUser;
    if (!user) throw new Error("Utilizador não autenticado.");

  // Define o último analista que fez a alteração (novo campo separado)
  // Prioridade: shortName > fullName > email
  const ultimoAnalistaAlteracao = (userProfile && userProfile.shortName) 
    ? userProfile.shortName 
    : (userProfile && userProfile.fullName) 
      ? userProfile.fullName 
      : user.email;
  
  const dataToSave = {
    ...updatedData,
    ultimoAnalistaAlteracao, // Novo campo: rastreia quem fez a última alteração
    modificadoPor: user.email,
    dataModificacao: new Date(),
  };

  // Lógica do statusChangedAt para SLA por status:
  // 1. Se o status mudou → atualiza para agora
  // 2. Se o contrato não tem statusChangedAt (legado) → inicializa com dataModificacao original ou createdAt
  // 3. Se já tem statusChangedAt e status não mudou → preserva (não faz nada, Firestore mantém o valor)
  if (updatedData.status && originalData && updatedData.status !== originalData.status) {
    // Status mudou → reseta o SLA
    dataToSave.statusChangedAt = new Date();
  } else if (originalData && !originalData.statusChangedAt) {
    // Contrato legado sem statusChangedAt → inicializa com a data de modificação original ou criação
    // Isso evita que o SLA resete em edições futuras
    const baseDate = originalData.dataModificacao || originalData.updatedAt || originalData.createdAt || originalData.entrada;
    if (baseDate) {
      // Converte Firestore Timestamp para Date se necessário
      dataToSave.statusChangedAt = baseDate.toDate ? baseDate.toDate() : new Date(baseDate);
    } else {
      // Fallback: usa a data atual (melhor que nada)
      dataToSave.statusChangedAt = new Date();
    }
  }

  if (updatedData.compradores && Array.isArray(updatedData.compradores)) {
    const sanitizedCompradores = normalizeCompradoresList(updatedData.compradores);
    dataToSave.compradores = sanitizedCompradores;
    const compradorPrincipal = sanitizedCompradores.find((c) => c.principal) || sanitizedCompradores[0];
    dataToSave.clientePrincipal = compradorPrincipal ? compradorPrincipal.nome : "";
  } else if (updatedData.cliente) {
        dataToSave.clientePrincipal = updatedData.cliente;
    }

  applyConsultaFieldsToPayload(dataToSave, {
    ...(originalData || {}),
    ...dataToSave,
  });

    await db.collection("contracts").doc(id).update(dataToSave);

    // OTIMIZAÇÃO: Atualiza cache específico em vez de invalidar tudo
    // O listener em tempo real já cuida de atualizar a lista de contratos
    cacheService.invalidate(`contract_${id}`); // Apenas o contrato específico
    
    // NÃO invalidar contracts_all - o listener já atualiza
    // cacheService.invalidateByPattern(/^contracts/); // REMOVIDO - causava reload de todos os contratos
    
    // Invalida apenas dashboard e KPI (são agregações que precisam recalcular)
    cacheService.invalidateByPattern(/^dashboard/);
    cacheService.invalidateByPattern(/^kpi/);
    
    // Invalida cache de paginação (páginas específicas podem estar desatualizadas)
    paginationService.invalidateCache('contracts');

    //  ESTRATÉGIA INTELIGENTE DE LOGGING:
    // 1. dataToSave contém 'analista' auto-atribuído (quem fez a alteração) - é salvo no Firestore
    // 2. dataForLog usa APENAS updatedData - os campos que o usuário realmente editou
    // 3. Isto garante que 'analista' NÃO gera mudança falsa no histórico
    //    (só registra campos que o usuário explicitamente alterou)
    const dataForLog = { ...updatedData }; //  Usar updatedData, NÃO dataToSave
    
    const changes = generateChangeLog(originalData || {}, dataForLog);
    console.log("3. ALTERAÇÕES DETETADAS:", changes);

    if (changes.length > 0) {
        console.log("--> VEREDITO: Foram encontradas", changes.length, "alterações. A registar no histórico.");

        // Registra no feed global de atividades se o status mudou
        if (updatedData.status && originalData && updatedData.status !== originalData.status) {
            if (activityLogService?.logActivity) {
                activityLogService.logActivity(
                    'STATUS_CHANGE',
                    `Status alterado: ${originalData.status || 'Nenhum'} ➔ ${updatedData.status}`,
                    id,
                    {
                        oldStatus: originalData.status,
                        newStatus: updatedData.status,
                        processoName: dataToSave.clientePrincipal || originalData.clientePrincipal || originalData.cliente || 'Contrato',
                        primaryBuyerName: dataToSave.clientePrincipal || originalData.clientePrincipal || originalData.cliente || 'Contrato',
                        source: 'updateContract',
                        module: 'processos',
                        page: 'processos',
                        entityType: 'contract',
                        entityLabel: dataToSave.clientePrincipal || originalData.clientePrincipal || originalData.cliente || 'Contrato',
                        oldValue: originalData.status || 'Nenhum',
                        newValue: updatedData.status || 'Nenhum',
                        actorName: ultimoAnalistaAlteracao
                    }
                );
            }
        }

        // CORREÇÃO FINAL APLICADA AQUI:
        // Usamos o perfil passado como parâmetro. Se não vier, usamos o email como fallback seguro.
        // Prioridade: shortName > fullName > email
        const alteradoPorNome = (userProfile && userProfile.shortName) 
          ? userProfile.shortName 
          : (userProfile && userProfile.fullName) 
            ? userProfile.fullName 
            : user.email;

        const logEntry = {
            alteradoPor: alteradoPorNome,
            alteradoEm: new Date(),
            mudancas: changes,
        };
        await db.collection("contracts").doc(id).collection("historico").add(logEntry);
    } else {
        console.log("--> VEREDITO: Nenhuma alteração detetada. O histórico não será atualizado.");
    }

    // Publica notificação leve para sincronização entre usuários
    const changedFields = Object.keys(updatedData || {});
    const primaryField = changedFields[0] || 'general';
    realtimeSyncService.publishUpdate(id, primaryField, 'update').catch((err) => {
      console.warn('⚡ Erro ao publicar notificação de atualização:', err);
    });

    console.log("--- PROCESSO FINALIZADO ---");
}


/**
 * Exclui um contrato.
 * @param {string} id - O ID do contrato a ser excluído.
 * @returns {Promise<void>}
 */
export async function deleteContract(id) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador nao autenticado.");

  const contractDoc = await contractsCollection.doc(id).get();
  const originalData = contractDoc.exists ? (contractDoc.data() || {}) : {};
  const entityLabel = originalData.clientePrincipal || originalData.cliente || 'Contrato';

  await contractsCollection.doc(id).delete();

  if (activityLogService?.logActivity) {
    activityLogService.logActivity(
      'CONTRACT_DELETED',
      `Processo excluido: ${entityLabel}`,
      id,
      {
        module: 'processos',
        page: 'processos',
        entityType: 'contract',
        entityLabel,
        processoName: entityLabel,
        primaryBuyerName: entityLabel,
        source: 'deleteContract',
        contractStatus: originalData.status || null
      }
    );
  }
  
  // Invalida caches relacionados após deletar contrato
  // OTIMIZAÇÃO: Não invalidar contracts_all - o listener em tempo real cuida disso
  cacheService.invalidate(`contract_${id}`);
  // cacheService.invalidateByPattern(/^contracts/); // REMOVIDO - listener atualiza
  cacheService.invalidateByPattern(/^dashboard/);
  cacheService.invalidateByPattern(/^kpi/);
  
  // Invalida cache de paginação
  paginationService.invalidateCache('contracts');

  // Publica notificação leve para sincronização entre usuários
  realtimeSyncService.publishUpdate(id, 'general', 'delete').catch((err) => {
    console.warn('⚡ Erro ao publicar notificação de exclusão:', err);
  });
}

/**
 * Converte um valor de data para a sua representação numérica em milissegundos.
 * Isso garante uma comparação 100% precisa, independente de fuso horário ou formato.
 * @param {any} value - O valor a ser convertido.
 * @returns {number|null} O valor em milissegundos ou null se for inválido.
 */
function normalizeDateToMillis(value) {
  if (!value) {
    return null;
  }
  // Se for um Timestamp do Firestore, obtém os milissegundos.
  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }
  // Se já for um objeto de data JavaScript.
  if (value instanceof Date) {
    return value.getTime();
  }
  // Se for uma string de data, cria um objeto Date e obtém os milissegundos.
  if (typeof value === "string") {
    const parsed = parseDateString(value);
    if (parsed instanceof Date && !isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
    return null;
  }
  // Caso contrário, não é uma data válida.
  return null;
}

/**
 * Gera uma lista de alterações, agora usando a comparação numérica de datas.
 * @param {object} original - O objeto original.
 * @param {object} updated - O objeto atualizado.
 * @returns {Array<string>} Uma lista de strings descrevendo as mudanças.
 */
function generateChangeLog(original, updated) {
  const changes = [];
  // A constante FIELDS_TO_TRACK é importada do seu ficheiro config.js
  const fieldsToTrack = FIELDS_TO_TRACK;

  //  CORREÇÃO CRÍTICA: Comparar APENAS campos que foram realmente alterados (estão em 'updated')
  // Não compare todos os campos em FIELDS_TO_TRACK, pois 'updated' pode conter apenas um campo editado
  // Isto evita que campos não-editados sejam registados como "alterados de valor para vazio"
  for (const key in updated) {
    // Só processa campos que estão em FIELDS_TO_TRACK (campos que devem ser rastreados)
    if (!(key in fieldsToTrack)) {
      continue;
    }

    const fieldName = fieldsToTrack[key];
    const originalValue = original[key];
    const updatedValue = updated[key];
    let hasChanged = false;

    // 1. Lógica especial para Compradores (comparação robusta)
    if (key === 'compradores') {
      // Usa função especializada que ignora diferenças de formatação de telefone
      if (compareCompradoresLists(originalValue, updatedValue)) {
        changes.push({
          campo: fieldName,
          de: `Lista com ${originalValue?.length || 0} compradores`,
          para: `Lista com ${updatedValue?.length || 0} compradores`,
          detalhe: `O campo '${fieldName}' foi modificado.`,
        });
      }
      continue; // Pula para o próximo campo
    }

    // 2. Lógica para outros Arrays (Gastos Adicionais, Repasses)
    if (Array.isArray(originalValue) || Array.isArray(updatedValue)) {
      // Compara os arrays convertendo-os para uma string JSON.
      // Garante que um array vazio `[]` não seja comparado com `undefined`.
      const originalJson = JSON.stringify(originalValue || []);
      const updatedJson = JSON.stringify(updatedValue || []);

      if (originalJson !== updatedJson) {
        // Para arrays, registamos uma mensagem genérica, pois mostrar
        // a lista inteira pode poluir o histórico.
        changes.push({
          campo: fieldName,
          de: `Lista com ${originalValue?.length || 0} itens`,
          para: `Lista com ${updatedValue?.length || 0} itens`,
          detalhe: `O campo '${fieldName}' foi modificado.`,
        });
      }
      continue; // Pula para o próximo campo
    }

    // 3. Lógica para Datas
    const isDateField = looksLikeDateField(key, originalValue, updatedValue);
    if (isDateField) {
      // A função normalizeDateToMillis já existe no seu ficheiro e lida com Timestamps e strings
      const originalMillis = normalizeDateToMillis(originalValue);
      const updatedMillis = normalizeDateToMillis(updatedValue);

      if (originalMillis !== updatedMillis) {
        hasChanged = true;
      }
    }
    // 4. Lógica para Booleanos (ex: FGTS)
    else if (
      typeof originalValue === "boolean" ||
      typeof updatedValue === "boolean" ||
      (typeof originalValue === "string" && ["true", "false"].includes(originalValue)) ||
      (typeof updatedValue === "string" && ["true", "false"].includes(updatedValue))
    ) {
      const originalBool =
        typeof originalValue === "string"
          ? originalValue === "true"
          : Boolean(originalValue);
      const updatedBool =
        typeof updatedValue === "string"
          ? updatedValue === "true"
          : Boolean(updatedValue);
      if (originalBool !== updatedBool) {
        hasChanged = true;
      }
    }
    // 5. Lógica Padrão para Strings e Números
    else {
      // Garante que valores nulos ou indefinidos sejam tratados como strings vazias para uma comparação segura
      if (String(originalValue || "") !== String(updatedValue || "")) {
        hasChanged = true;
      }
    }

    // 6. Adiciona a alteração ao log se ela ocorreu
    if (hasChanged) {
      let from = originalValue || "vazio";
      let to = updatedValue || "vazio";

      // Formata as datas para uma leitura mais fácil no histórico
      if (isDateField) {
        const fromDate = isFirestoreTimestamp(originalValue)
          ? originalValue.toDate()
          : parseDateString(originalValue);
        const toDate = isFirestoreTimestamp(updatedValue)
          ? updatedValue.toDate()
          : parseDateString(updatedValue);

        from = fromDate instanceof Date && !isNaN(fromDate.getTime())
          ? fromDate.toLocaleString("pt-BR")
          : "vazio";
        to = toDate instanceof Date && !isNaN(toDate.getTime())
          ? toDate.toLocaleString("pt-BR")
          : "vazio";
      }

      changes.push({
        campo: fieldName,
        de: from,
        para: to,
        detalhe: `O campo '${fieldName}' foi alterado de '${from}' para '${to}'.`,
      });
    }
  }

  // Retorna a lista de strings de detalhe para manter compatibilidade com a sua função updateContract
  return changes.map((c) => c.detalhe);
}

// --- Funções de Utilizadores (Cloud Functions) ---

/**
 * Chama a Cloud Function para listar todos os utilizadores.
 * @returns {Promise<Array>}
 */
export async function getAllUsers() {
  return await cacheService.get(
    'users_all',
    async () => {
      // Garante que functions está inicializado
      const functions = firebase.app().functions('us-central1');
      const listAllUsers = functions.httpsCallable("listAllUsers");
      const result = await listAllUsers();
      return result.data;
    },
    'users'
  );
}

/**
 * Chama a Cloud Function para listar analistas (dados básicos).
 * Disponível para todos os usuários autenticados (não requer admin).
 * @returns {Promise<Array>} Lista de analistas com uid, fullName, shortName e email
 */
export async function getAnalysts() {
  return await cacheService.get(
    'analysts_list',
    async () => {
      const functions = firebase.app().functions('us-central1');
      const listAnalysts = functions.httpsCallable("listAnalysts");
      const result = await listAnalysts();
      return result.data;
    },
    'users'
  );
}

function normalizeReportDateKey(value, { endOfDay = false } = {}) {
  if (!value) return null;

  const raw = value instanceof Date
    ? value
    : new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`
      : value);

  if (Number.isNaN(raw.getTime())) return null;
  return raw.toISOString().slice(0, 10);
}

export async function getSlaConfigForReports(forceRefresh = false) {
  return await cacheService.get(
    'reports_sla_config',
    async () => {
      const snapshot = await db.collection('slaConfig').get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
    'settings',
    forceRefresh
  );
}

export async function getPendenciasForReports(forceRefresh = false) {
  return await cacheService.get(
    'reports_pendencias_all',
    async () => {
      const snapshot = await db.collection('pendencias').get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
    'reports',
    forceRefresh
  );
}

export async function getWhatsappChatsForReports(forceRefresh = false) {
  return await cacheService.get(
    'reports_whatsapp_chats_all',
    async () => {
      const snapshot = await db.collection('chats').get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
    'reports',
    forceRefresh
  );
}

export async function getWhatsappAgentsForReports(forceRefresh = false) {
  return await cacheService.get(
    'reports_whatsapp_agents_all',
    async () => {
      const snapshot = await db.collection('users').get();
      return snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((user) => user?.whatsapp?.isAgent === true);
    },
    'reports',
    forceRefresh
  );
}

export async function getWhatsappMetricsCurrent(forceRefresh = false) {
  return await cacheService.get(
    'reports_whatsapp_metrics_current',
    async () => {
      const snapshot = await db.collection('whatsappMetrics').doc('current').get();
      return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
    },
    'reports',
    forceRefresh
  );
}

export async function getWhatsappMetricsDailyForReports(options = {}) {
  const {
    startDate = null,
    endDate = null,
    forceRefresh = false
  } = options || {};

  const startKey = normalizeReportDateKey(startDate);
  const endKey = normalizeReportDateKey(endDate, { endOfDay: true });
  const cacheKey = `reports_whatsapp_metrics_daily_${startKey || 'all'}_${endKey || 'all'}`;

  return await cacheService.get(
    cacheKey,
    async () => {
      let query = db.collection('whatsappMetricsDaily');
      if (startKey) {
        query = query.where('date', '>=', startKey);
      }
      if (endKey) {
        query = query.where('date', '<=', endKey);
      }

      const snapshot = await query.orderBy('date', 'asc').get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
    'reports',
    forceRefresh
  );
}

/**
 * Chama a Cloud Function para criar um novo utilizador.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>}
 */

export async function createNewUser(email, password, fullName, cpf) {
  // Certifique-se de que a sua aplicação inicializa o Firebase Functions
  const functions = firebase.app().functions('us-central1');
  const createUser = functions.httpsCallable("createNewUser");
  // Envia os novos campos no payload da chamada
  const result = await createUser({ email, password, fullName, cpf });
  // Invalida o cache de usuários para garantir que a lista seja atualizada
  cacheService.invalidate('users_all');
  return result;
}

/**
 * Adiciona um novo contrato à base de dados.
 * @param {object} contractData - Os dados do novo contrato.
 * @returns {Promise<void>}
 */
export async function addContract(data) {
  //  Garante sempre o campo clientePrincipal
  let clientePrincipal = "";

  const sanitizedCompradores = normalizeCompradoresList(data.compradores);

  if (sanitizedCompradores.length > 0) {
    const compradorPrincipal =
      sanitizedCompradores.find((c) => c.principal) || sanitizedCompradores[0];
    clientePrincipal = compradorPrincipal ? compradorPrincipal.nome : "";
  } else if (data.cliente) {
    // Compatibilidade com contratos antigos que ainda usam o campo 'cliente'
    clientePrincipal = data.cliente;
  }

  const contrato = {
    ...data,
    compradores: sanitizedCompradores,
    clientePrincipal, // Adiciona o campo
    criadoEm: new Date(),
    entrada: data.entrada || new Date(), // Define data de entrada automaticamente se não fornecida
  };

  applyConsultaFieldsToPayload(contrato, contrato);

  const docRef = await db.collection("contracts").add(contrato);
  
  // Registra no feed global de atividades
  if (activityLogService?.logActivity) {
    activityLogService.logActivity(
      'CONTRACT_ADDED',
      `Novo contrato cadastrado: ${clientePrincipal || 'Sem nome'}`,
      docRef.id,
      {
        module: 'processos',
        page: 'processos',
        entityType: 'contract',
        entityLabel: clientePrincipal || 'Sem nome',
        processoName: clientePrincipal,
        primaryBuyerName: clientePrincipal,
        source: 'addContract'
      }
    );
  }
  
  //  Invalida todos os caches relacionados a contratos
  // IMPORTANTE: Aguarda invalidação do cache de contratos (inclui IndexedDB)
  // para evitar race condition onde dados antigos são restaurados
  await cacheService.invalidateByPattern(/^contracts/);
  cacheService.invalidateByPattern(/^dashboard/);
  cacheService.invalidateByPattern(/^kpi/);
  
  // Invalida cache de paginação
  paginationService.invalidateCache('contracts');
  
  console.log(' [addContract] Cache de contratos invalidado, ID:', docRef.id);
  
  // Publica notificação leve para sincronização entre usuários
  realtimeSyncService.publishUpdate(docRef.id, 'general', 'create').catch((err) => {
    console.warn('⚡ Erro ao publicar notificação de criação:', err);
  });
  
  // Retorna o contrato com o ID do documento criado
  return { id: docRef.id, ...contrato };
}

/**
 * Atualiza múltiplos contratos em massa e regista o histórico para cada um.
 * @param {string[]} selectedIds - Array com os IDs dos documentos a serem atualizados.
 * @param {object} dataToUpdate - Objeto com os campos e novos valores.
 * @returns {Promise<void>}
 */
export async function bulkUpdateContracts(selectedIds, dataToUpdate) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado.");

  const batch = db.batch();
  const timestamp = new Date();
  const activityTimestamp = firebase.firestore.FieldValue.serverTimestamp();
  const bulkActivityLogs = [];
  const bulkActivityIdentity = activityLogService?.getCurrentUserActivityIdentity
    ? await activityLogService.getCurrentUserActivityIdentity()
    : null;
  let bulkActivityUserName = user.email || "Usuário";
  try {
    const storedProfile = JSON.parse(localStorage.getItem("userProfile") || "{}");
    bulkActivityUserName = storedProfile.shortName || storedProfile.fullName || bulkActivityUserName;
  } catch {
    // Perfil local invalido nao deve impedir a atualizacao em massa.
  }
  if (bulkActivityIdentity?.userName) {
    bulkActivityUserName = bulkActivityIdentity.userName;
  }
  const consultaDependencyChanged = ["codigoCCA", "tipoConsulta", "nContratoCEF"].some(
    (field) => Object.prototype.hasOwnProperty.call(dataToUpdate || {}, field)
  );
  const bulkConsultaErrors = [];

  // Busca todos os documentos originais de uma vez para gerar os logs
  const docsToUpdate = await Promise.all(
    selectedIds.map((id) => contractsCollection.doc(id).get())
  );

  docsToUpdate.forEach((doc) => {
    if (!doc.exists) return; // Ignora se o documento foi apagado entretanto

    const originalData = doc.data();
    const docRef = contractsCollection.doc(doc.id);
    const normalizedUpdate = {
      ...dataToUpdate,
      modificadoPor: user.email,
      dataModificacao: timestamp,
    };

    if (consultaDependencyChanged) {
      const mergedData = {
        ...originalData,
        ...normalizedUpdate,
      };
      const shouldMaintainConsultaKey = Boolean(
        mergedData.codigoCCA || mergedData.tipoConsulta || mergedData.chaveConsulta
      );

      if (shouldMaintainConsultaKey) {
        try {
          applyConsultaFieldsToPayload(normalizedUpdate, mergedData, {
            autoGenerate: true,
          });
        } catch (error) {
          const contractLabel = contractLabelForConsultaError(originalData, doc.id);
          bulkConsultaErrors.push(`- ${contractLabel}: ${error.message}`);
          return;
        }
      }
    }

    // 1. Adiciona a operação de atualização ao batch
    batch.update(docRef, normalizedUpdate);

    // 2. Gera o log e adiciona a sua criação ao batch
    const updatedDataForLog = { ...originalData, ...normalizedUpdate };
    const mudancas = generateChangeLog(originalData, updatedDataForLog);

    if (mudancas.length > 0) {
      const logEntry = {
        alteradoPor: bulkActivityUserName,
        alteradoEm: timestamp,
        mudancas: mudancas,
      };
      const logRef = docRef.collection("historico").doc(); // Cria um novo doc de log
      batch.set(logRef, logEntry);
    }

    if (
      Object.prototype.hasOwnProperty.call(dataToUpdate || {}, "status") &&
      normalizedUpdate.status !== originalData.status
    ) {
      bulkActivityLogs.push({
        actionType: "BULK_STATUS_CHANGE",
        description: `Status alterado em lote: ${originalData.status || "Nenhum"} -> ${normalizedUpdate.status || "Nenhum"}`,
        relatedEntityId: doc.id,
        module: 'processos',
        page: 'processos',
        entityType: 'contract',
        entityLabel: originalData.clientePrincipal || originalData.cliente || "Contrato",
        actorName: bulkActivityUserName,
        oldValue: originalData.status || "Nenhum",
        newValue: normalizedUpdate.status || "Nenhum",
        extraData: {
          module: 'processos',
          page: 'processos',
          entityType: 'contract',
          entityLabel: originalData.clientePrincipal || originalData.cliente || "Contrato",
          oldStatus: originalData.status || null,
          newStatus: normalizedUpdate.status || null,
          processoName: originalData.clientePrincipal || originalData.cliente || "Contrato",
          primaryBuyerName: originalData.clientePrincipal || originalData.cliente || "Contrato",
          source: "bulkUpdateContracts",
          actorName: bulkActivityUserName
        },
        timestamp: activityTimestamp,
        userName: bulkActivityUserName,
        userEmail: bulkActivityIdentity?.userEmail || user.email || "sistema",
        userUid: bulkActivityIdentity?.userUid || user.uid || null
      });
    }
  });

  if (bulkConsultaErrors.length > 0) {
    const preview = bulkConsultaErrors.slice(0, 8).join("\n");
    const remainder =
      bulkConsultaErrors.length > 8
        ? `\n... e mais ${bulkConsultaErrors.length - 8} processo(s).`
        : "";
    throw new Error(
      `Não foi possível aplicar a atualização em massa porque a chave de consulta não pôde ser gerada para todos os processos.\n${preview}${remainder}`
    );
  }

  // Executa todas as operações (updates e logs) de uma só vez
  await batch.commit();

  if (bulkActivityLogs.length > 0) {
    try {
      for (let i = 0; i < bulkActivityLogs.length; i += 450) {
        const activityBatch = db.batch();
        bulkActivityLogs.slice(i, i + 450).forEach((activityLog) => {
          activityBatch.set(db.collection("activity_logs").doc(), activityLog);
        });
        await activityBatch.commit();
      }
    } catch (error) {
      console.error("Erro ao registrar logs de atividade em massa:", error);
    }
  }
  
  // OTIMIZAÇÃO: Não invalidar contracts_all - o listener em tempo real cuida disso
  // cacheService.invalidateByPattern(/^contracts/); // REMOVIDO
  cacheService.invalidateByPattern(/^dashboard/);
  
  // Invalida cache de paginação
  paginationService.invalidateCache('contracts');

  const primaryField = Object.keys(dataToUpdate || {})[0] || 'general';
  await Promise.allSettled(
    docsToUpdate
      .filter((doc) => doc.exists)
      .map((doc) => realtimeSyncService.publishUpdate(doc.id, primaryField, 'update'))
  );
}

/**
 * Chama a Cloud Function para atribuir a permissão de Administrador.
 * @param {string} email
 * @returns {Promise<object>}
 */
export async function setAdminRole(email) {
  const functions = firebase.app().functions('us-central1');
  const setAdmin = functions.httpsCallable("setAdminRole");
  const result = await setAdmin({ email });
  // Invalida o cache de usuários para garantir que a lista seja atualizada
  cacheService.invalidate('users_all');
  return result;
}

/**
 * Chama a Cloud Function para remover a permissão de Administrador (rebaixar).
 * @param {string} email
 * @returns {Promise<object>}
 */
export async function removeAdminRole(email) {
  const functions = firebase.app().functions('us-central1');
  const removeAdmin = functions.httpsCallable("removeAdminRole");
  const result = await removeAdmin({ email });
  // Invalida o cache de usuários para garantir que a lista seja atualizada
  cacheService.invalidate('users_all');
  return result;
}

/**
 * Chama a Cloud Function para ativar ou desativar a conta de um utilizador.
 * @param {string} uid
 * @returns {Promise<object>}
 */
export async function toggleUserStatus(uid) {
  const functions = firebase.app().functions('us-central1');
  const toggleStatus = functions.httpsCallable("toggleUserStatus");
  const result = await toggleStatus({ uid });
  // Invalida o cache de usuários para garantir que a lista seja atualizada
  cacheService.invalidate('users_all');
  return result;
}

/**
 * Chama a Cloud Function para excluir um utilizador.
 * @param {string} uid
 * @returns {Promise<object>}
 */
export async function deleteUser(uid) {
  const functions = firebase.app().functions('us-central1');
  const deleteUserFn = functions.httpsCallable("deleteUser");
  const result = await deleteUserFn({ uid });
  // Invalida o cache de usuários para garantir que a lista seja atualizada
  cacheService.invalidate('users_all');
  return result;
}

// ===== GESTÃO DE STATUS (ADMIN) =====

/** Lista status dinâmicos (fonte única: statusConfig). Ordem de tentativa:
 * 1. Cache (status mudam muito raramente - TTL 60 min)
 * 2. Cloud Function listStatuses (governança admin)
 * 3. Leitura direta da coleção 'statusConfig' (fallback restrito)
 * NÃO usa mais coleção legacy 'status'.
 */
export async function listStatuses() {
  return await cacheService.get(
    'status_config_all',
    async () => {
      // Primeiro: Cloud Function
      try {
        const functions = firebase.app().functions('us-central1');
        const fn = functions.httpsCallable('listStatuses');
        const res = await fn();
        const data = res.data || [];
        console.log(` listStatuses (CF) retornou ${data.length}`);
        return data;
      } catch (cfError) {
        console.warn(' Cloud Function listStatuses falhou, fallback Firestore direto statusConfig:', cfError.message);
      }
      // Segundo: Firestore direto (somente se admin já autenticado – assumimos contexto seguro)
      try {
        const db = firebase.firestore();
        const snap = await db.collection('statusConfig').orderBy('order').get();
        const result = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log(` Fallback Firestore direto statusConfig retornou ${result.length}`);
        return result;
      } catch (fsError) {
        console.error(' Falha total ao obter statusConfig:', fsError);
        throw fsError;
      }
    },
    'status' // Usa TTL de 60 minutos (status mudam raramente)
  );
}

/**
 * Normaliza um nome de status para uso como ID de documento.
 * Usa a mesma lógica da Cloud Function para evitar duplicações.
 * @param {string} text - Nome do status
 * @returns {string} ID normalizado
 */
function statusDocId(text) {
  return String(text || '')
    .replace(/[/#?%:]/g, '-') // remove/normaliza chars inválidos para paths do Firestore
    .trim();
}

function getStatusConfigSnapshot() {
  if (typeof window !== 'undefined' && Array.isArray(window.EFFECTIVE_STATUS_CONFIG) && window.EFFECTIVE_STATUS_CONFIG.length > 0) {
    return window.EFFECTIVE_STATUS_CONFIG;
  }
  return STATUS_CONFIG;
}

function deriveStatusFilter(statusFilterInput = [], includeArchived = false) {
  const configSnapshot = getStatusConfigSnapshot();
  const allStatusTexts = configSnapshot.map((s) => s.text);
  const archivedStatuses = configSnapshot
    .filter((s) => s && s.archiveContracts === true)
    .map((s) => s.text);

  const sanitizedFilter = Array.isArray(statusFilterInput)
    ? statusFilterInput.filter(Boolean)
    : [];

  let selectedStatuses = [...sanitizedFilter];
  let autoAppliedArchiveFilter = false;

  if (!includeArchived && selectedStatuses.length === 0 && archivedStatuses.length > 0 && archivedStatuses.length < allStatusTexts.length) {
    selectedStatuses = allStatusTexts.filter((text) => !archivedStatuses.includes(text));
    autoAppliedArchiveFilter = true;
  }

  return { selectedStatuses, archivedStatuses, allStatusTexts, autoAppliedArchiveFilter };
}

async function ensureArchiveContractsSynced(status) {
  if (!status || typeof status.archiveContracts !== 'boolean') {
    return;
  }

  try {
    const db = firebase.firestore();
    const docId = statusDocId(status.text);
    await db.collection('statusConfig').doc(docId).set(
      { archiveContracts: status.archiveContracts },
      { merge: true }
    );
  } catch (error) {
    console.warn(' Não foi possível sincronizar archiveContracts diretamente no Firestore:', error);
  }
}

/** Cria/Atualiza um status (text, stage, order, nextSteps?, requiredFields?, active?, color?, bgColor?, allowDuplicateOrder?) */
export async function createOrUpdateStatus(status) {
  try {
    // Tenta primeiro via Cloud Function (se existir)
    const fn = firebase.app().functions('us-central1').httpsCallable('createOrUpdateStatus');
    const res = await fn(status);
    await ensureArchiveContractsSynced(status);
    // Invalida cache de status após modificação
    cacheService.invalidate('status_config_all');
    return res.data || { ok: true };
  } catch (error) {
    console.log(" Cloud Function não disponível, salvando diretamente no Firestore:", error.message);
    
    // Fallback: salvar diretamente na coleção 'statusConfig' (unificada)
    try {
      const db = firebase.firestore();
      // Usar a mesma lógica de ID que a Cloud Function para evitar duplicações
      const statusId = statusDocId(status.text);
      
      const statusData = {
        text: status.text,
        stage: status.stage,
        order: status.order || 0,
        nextSteps: status.nextSteps || [],
        active: status.active !== false,
        color: status.color || '#FFFFFF',
        bgColor: status.bgColor || '#0D6EFD',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (typeof status.archiveContracts === 'boolean') {
        statusData.archiveContracts = status.archiveContracts;
      }
      
      // Se é um novo status, adiciona createdAt
      const docRef = db.collection('statusConfig').doc(statusId);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        statusData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      }
      
      await docRef.set(statusData, { merge: true });
      
      console.log(` Status "${status.text}" salvo em statusConfig (fallback direto) com cores:`, { color: statusData.color, bgColor: statusData.bgColor });
      // Invalida cache de status após modificação
      cacheService.invalidate('status_config_all');
      return { ok: true };
    } catch (firestoreError) {
      console.error(" Erro ao salvar status no Firestore:", firestoreError);
      throw firestoreError;
    }
  }
}

/** Alterna o campo active de um status */
export async function toggleStatusActive(text, active) {
  try {
    // Tenta primeiro via Cloud Function (se existir)
    const fn = firebase.app().functions('us-central1').httpsCallable('toggleStatusActive');
    const res = await fn({ text, active });
    // Invalida cache de status após modificação
    cacheService.invalidate('status_config_all');
    return res.data || { ok: true };
  } catch (error) {
    console.log(" Cloud Function não disponível, atualizando diretamente no Firestore:", error.message);
    
    // Fallback: atualizar diretamente na coleção 'statusConfig'
    try {
      const db = firebase.firestore();
      // Usar a mesma lógica de ID que a Cloud Function para evitar duplicações
      const statusId = statusDocId(text);
      
      await db.collection('statusConfig').doc(statusId).update({
        active: active,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(` Status "${text}" ${active ? 'ativado' : 'desativado'} em statusConfig (fallback direto)`);
      // Invalida cache de status após modificação
      cacheService.invalidate('status_config_all');
      return { ok: true };
    } catch (firestoreError) {
      console.error(" Erro ao atualizar status no Firestore:", firestoreError);
      throw firestoreError;
    }
  }
}

/** Remove status (opcionalmente force=true para ignorar checagem de uso) */
export async function deleteStatusConfig(text, force = false) {
  try {
    // Tenta primeiro via Cloud Function (se existir)
    const fn = firebase.app().functions('us-central1').httpsCallable('deleteStatus');
    const res = await fn({ text, force });
    // Invalida cache de status após remoção
    cacheService.invalidate('status_config_all');
    cacheService.invalidateByPattern(/^status/);
    return res.data || { ok: true };
  } catch (error) {
    // Se erro de permissão ou validação, não faz fallback
    if (error.code === 'permission-denied' || error.code === 'invalid-argument' || error.code === 'failed-precondition') {
      console.error(" Erro ao excluir status:", error.message);
      throw error;
    }
    console.log(" Cloud Function não disponível, removendo diretamente do Firestore:", error.message);
    
    // Fallback: remover diretamente da coleção 'statusConfig'
    try {
      const db = firebase.firestore();
      // Usar a mesma lógica de ID que a Cloud Function para evitar duplicações
      const statusId = statusDocId(text);
      
      // Se force=false, poderia verificar se o status está sendo usado
      // Por simplicidade, vamos permitir a remoção
      await db.collection('statusConfig').doc(statusId).delete();
      
      console.log(` Status "${text}" removido de statusConfig (fallback direto)`);
      // Invalida cache de status após remoção
      cacheService.invalidate('status_config_all');
      return { ok: true };
    } catch (firestoreError) {
      console.error(" Erro ao remover status do Firestore:", firestoreError);
      throw firestoreError;
    }
  }
}

/**
 * Obtém a lista de status a exibir na UI, tentando dinâmicos primeiro.
 * Se a chamada falhar (sem admin ou offline), cai para STATUS_CONFIG mínimo estático.
 */
export async function getEffectiveStatuses() {
  try {
    const dynamic = await listStatuses();
    
    if (Array.isArray(dynamic) && dynamic.length > 0) {
      const processed = dynamic
        .filter((s) => s.active !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((s) => ({
          id: s.id || s.text,
          order: s.order,
          text: s.text,
          stage: s.stage,
          color: s.color || "#6C757D", // Cor padrão se não especificada
          bgColor: s.bgColor || "#E2E3E5", // Cor de fundo padrão se não especificada
          nextSteps: Array.isArray(s.nextSteps) ? s.nextSteps : [],
          requiredFields: Array.isArray(s.requiredFields) ? s.requiredFields : undefined,
          archiveContracts: s.archiveContracts === true,
        }));
      
      console.log(' Status dinâmicos carregados:', processed.length, 'status do banco de dados');
      return processed;
    }
  } catch (e) {
    console.warn(' Falha ao carregar status dinâmicos, usando STATUS_CONFIG mínimo estático:', e?.message || e);
    console.warn(' Sistema carregando apenas 5 status de fallback em vez dos 46 status completos.');
  }
  
  console.log(' Usando fallback STATUS_CONFIG com', STATUS_CONFIG.length, 'status');
  return [...STATUS_CONFIG];
}

/**
 * Processa um texto CSV e importa os novos contratos para o Firestore usando batches.
 * @param {string} csvText - O conteúdo do ficheiro CSV como uma string.
 * @param {Function} onProgress - Uma função de callback para reportar o progresso.
 * @returns {Promise<{importedCount: number, skippedCount: number}>} - Um objeto com a contagem de contratos importados e ignorados.
 */
// DEPRECATED: Use importCsvWithAI(csvText) — mantém por compatibilidade
export async function importContractsFromCSV(csvText, onProgress) {
  try {
    const res = await importCsvWithAI(csvText);
    if (typeof onProgress === 'function') {
      onProgress(`Importação concluída: ${res.importedCount} contratos`);
    }
    return { importedCount: res.importedCount, skippedCount: 0 };
  } catch (e) {
    // Mantém fallback original caso a função de IA não esteja disponível
    console.warn(' importCsvWithAI falhou, usando fluxo legado de CSV.', e?.message || e);
    // ...existing code...
  }
  // Função interna para analisar o CSV, lida com aspas e quebras de linha.
  function parseCSV(text) {
    // (Esta é a mesma função de parsing que estava no seu script.js)
    const result = [];
    let currentLine = [];
    let currentField = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            currentField += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          currentLine.push(currentField);
          currentField = "";
        } else if (char === "\n" || char === "\r") {
          if (i > 0 && text[i - 1] !== "\n" && text[i - 1] !== "\r") {
            currentLine.push(currentField);
            result.push(currentLine);
            currentLine = [];
            currentField = "";
          }
          if (char === "\r" && text[i + 1] === "\n") i++;
        } else {
          currentField += char;
        }
      }
    }
    if (currentField || currentLine.length > 0) {
      currentLine.push(currentField);
      result.push(currentLine);
    }
    return result;
  }

  const headerMapping = {
    vendedorconstrutora: "vendedorConstrutora",
    empreendimento: "empreendimento",
    "nome do empreendimento": "empreendimento",
    projeto: "empreendimento",
    cliente: "clientePrincipal",
    ncontratocef: "nContratoCEF",
    dataminuta: "dataMinuta",
    dataassinaturacliente: "dataAssinaturaCliente",
    valoritbi: "valorITBI",
    valordepositori: "valorDepositoRi",
    dataentradaregistro: "dataEntradaRegistro",
    valorfinalri: "valorFinalRi",
    agendamentoformulario: "agendamentoFormulario",
    casafacil: "casaFacil",
    certificacaosolicem: "certificacaoSolicEm",
    cohaparaprovada: "cohaparAprovada",
    conferenciacehopnatodevolvidaem: "conferenciaCehopNatoDevolvidaEm",
    conferenciacehopnatoentregueem: "conferenciaCehopNatoEntregueEm",
    conformeem: "conformeEm",
    contratocef: "contratoCef",
    datadeenviodapastaagencia: "dataDeEnvioDaPastaAgencia",
    devolucaoparacorrecao: "devolucaoParaCorrecao",
    devolvidocorrigido: "devolvidoCorrigido",
    entreguecehop: "entregueCehop",
    entrevistacef: "entrevistaCef",
    enviadoacehop: "enviadoACehop",
    montagemcehop: "montagemCehop",
    montagemcomplementar: "montagemComplementar",
    vencsicaq: "vencSicaq",
    repasse: "repasse",

    // Adicione aqui outras traduções que forem necessárias
    // O padrão é: se o nome no código tem letra maiúscula, ele precisa estar aqui.
  };

  const rows = parseCSV(csvText);
  if (rows.length <= 1) throw new Error("Ficheiro CSV vazio ou inválido.");

  const headers = rows[0].map((h) => normalizeCsvHeader(h));
  const idHeaderIndex = headers.indexOf("id");
  if (idHeaderIndex === -1)
    throw new Error('A coluna "id" é obrigatória no ficheiro CSV.');

  onProgress("A verificar dados existentes...");
  // OTIMIZAÇÃO: Coleta apenas os IDs do CSV e verifica só esses (não baixa toda a coleção)
  const csvIds = [];
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.length >= headers.length && values[idHeaderIndex]) {
      csvIds.push(values[idHeaderIndex].trim());
    }
  }
  
  // Verifica existência apenas dos IDs presentes no CSV (em lotes de 10 - limite do 'in')
  const existingIds = new Set();
  const ID_BATCH_SIZE = 10;
  for (let i = 0; i < csvIds.length; i += ID_BATCH_SIZE) {
    const batchIds = csvIds.slice(i, i + ID_BATCH_SIZE).filter(id => id);
    if (batchIds.length > 0) {
      const existingDocs = await contractsCollection
        .where(firebase.firestore.FieldPath.documentId(), 'in', batchIds)
        .get();
      existingDocs.docs.forEach(doc => existingIds.add(doc.id));
    }
  }
  
  if (window.__DEBUG__) {
    console.log(` [OTIMIZADO] Verificados ${csvIds.length} IDs, ${existingIds.size} já existem`);
  }

  let importedCount = 0;
  let skippedCount = 0;
  const BATCH_LIMIT = 400;
  let batch = db.batch();
  let operationsInBatch = 0;

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.length < headers.length) continue;

    const contractObject = {};
    const importChanges = [];

    headers.forEach((header, index) => {
      const value = values[index] ? values[index].trim() : "";

      // AQUI ESTÁ A MUDANÇA:
      // 1. Verificamos se o cabeçalho em minúsculas existe no nosso mapa.
      const correctKey = headerMapping[header] || header;

      // 2. Usamos a chave correta (em camelCase) para guardar o valor.
      contractObject[correctKey] = value;
    });

    const contractId = contractObject.id;
    if (!contractId || existingIds.has(contractId)) {
      skippedCount++;
      continue;
    }

    // Transforma o campo de texto 'anotacao' ou 'observacoes' na estrutura de array 'anotacoes'
    const textoAnotacao =
      contractObject.anotacao || contractObject.observacoes || "";
    if (
      textoAnotacao &&
      typeof textoAnotacao === "string" &&
      textoAnotacao.trim() !== ""
    ) {
      contractObject.anotacoes = [
        {
          texto: textoAnotacao.trim(),
          usuario: "Sistema (Importação CSV)",
          data: new Date(),
        },
      ];
      // Remove os campos antigos para não poluir a base de dados
      delete contractObject.anotacao;
      delete contractObject.observacoes;
    }

    // Transforma o campo numérico 'repasse' na estrutura de array 'repasses'
    if (contractObject.repasse) {
      // Converte o valor para número, aceitando tanto vírgula como ponto decimal
      const valorRepasse = parseFloat(
        String(contractObject.repasse).replace(",", ".")
      );

      if (!isNaN(valorRepasse) && valorRepasse > 0) {
        contractObject.repasses = [
          {
            origem: "Repasse (Importado)",
            valor: valorRepasse,
          },
        ];
      }
      // Remove o campo antigo
      delete contractObject.repasse;
    }

    // --- NOVA LÓGICA PARA PROCESSAR COMPRADORES ---
    const compradores = [];
    const MAX_COMPRADORES = 4; // O mesmo limite da exportação
    for (let j = 1; j <= MAX_COMPRADORES; j++) {
      const nome = contractObject[`comprador_${j}_nome`];
      if (nome) {
        // Adiciona o comprador apenas se o nome existir
        compradores.push({
          nome: nome,
          cpf: contractObject[`comprador_${j}_cpf`] || "",
          email: contractObject[`comprador_${j}_email`] || "",
          telefone: contractObject[`comprador_${j}_telefone`] || "",
          principal:
            (contractObject[`comprador_${j}_principal`] || "").toLowerCase() ===
            "true",
        });
      }
    }
  const compradoresNormalizados = normalizeCompradoresList(compradores);
  contractObject.compradores = compradoresNormalizados;
    // Remove as colunas de compradores individuais do objeto principal
    for (let j = 1; j <= MAX_COMPRADORES; j++) {
      delete contractObject[`comprador_${j}_nome`];
      delete contractObject[`comprador_${j}_cpf`];
      delete contractObject[`comprador_${j}_email`];
      delete contractObject[`comprador_${j}_telefone`];
      delete contractObject[`comprador_${j}_principal`];
    }
    // --- FIM DA NOVA LÓGICA ---

    // Conversão de campos de data (CÓDIGO MELHORADO E PADRONIZADO)
    DATE_FIELDS_IMPORT.forEach((key) => {
      const originalValue = contractObject[key];
      if (!originalValue) {
        contractObject[key] = null;
        return;
      }

      const parsedDate = parseDateString(originalValue);
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        contractObject[key] = firebase.firestore.Timestamp.fromDate(parsedDate);
      } else {
        contractObject[key] = null;
        importChanges.push(
          `AVISO: O campo de data "${
            FIELDS_TO_TRACK[key] || key
          }" tinha o valor inválido "${originalValue}" e foi redefinido para "vazio".`
        );
      }
    });

  const docRef = contractsCollection.doc(contractId);
  const primeiroComprador = compradoresNormalizados[0] || {};
    contractObject.clientePrincipal = primeiroComprador.nome || "";
    batch.set(docRef, contractObject);
    operationsInBatch++;
    importedCount++;

    // **ADICIONA O LOG DE ALTERAÇÕES SE HOUVER MUDANÇAS**
    if (importChanges.length > 0) {
      const logEntry = {
        alteradoPor: "Sistema (Importação CSV)",
        alteradoEm: new Date(),
        mudancas: importChanges,
      };
      const logRef = docRef.collection("historico").doc();
      batch.set(logRef, logEntry);
      operationsInBatch++; // Contabiliza a nova operação
    }

    if (operationsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      operationsInBatch = 0;
      onProgress(
        `Processando... ${importedCount} novos contratos adicionados.`
      );
    }
  }

  if (operationsInBatch > 0) {
    await batch.commit();
  }

  const legacyResult = { importedCount, skippedCount };
  await auditContractsCsvImport(csvText, legacyResult, 'importContractsFromCSV.legacy');
  return legacyResult;
}

/**
 * Ouve as alterações na coleção de contratos em tempo real para o dashboard e kanban.
 * @returns {Function} - A função de 'unsubscribe' para parar de ouvir.
 */
/**
 * Ouve TODOS os contratos sem filtro em tempo real (OTIMIZADO para uso no dashboard).
 * @param {Function} callback - Função a ser chamada com os novos dados.
 * @returns {Function} - A função de 'unsubscribe' para parar de ouvir.
 */
export function listenForContractsUnfiltered(callback) {
  // Registra listener otimizado com throttle mais agressivo para todos os contratos
  const optimizedCallback = listenerOptimizer.registerListener(
    'contracts_all_realtime',
    (snapshot) => {
      const contracts = snapshot.docs.map((doc) =>
        normalizeContractFieldAliases({
          id: doc.id,
          ...doc.data(),
        })
      );
      callback(contracts);
    },
    {
      critical: false,     // Não é crítico - pode ser pausado
      throttle: true,      // Aplica throttle de 3 segundos
      batchProcess: true,  // Processa em lotes se muitos dados
      retryOnError: true   // Tenta novamente em caso de erro
    }
  );

  const unsubscribe = contractsCollection.onSnapshot(
    optimizedCallback,
    (error) => {
      console.error("Erro ao ouvir contratos (sem filtro): ", error);
      callback([]);
    }
  );

  // Registra função de unsubscribe
  listenerOptimizer.setUnsubscribe('contracts_all_realtime', unsubscribe);

  return () => {
    unsubscribe();
    listenerOptimizer.unregisterListener('contracts_all_realtime');
  };
}

/**
 * Busca todas as regras de status definidas.
 * @returns {Promise<Array>} Uma lista de todas as regras.
 */
export async function getAllStatusRules() {
  return await cacheService.get(
    'status_rules_all',
    async () => {
      try {
        const snapshot = await db.collection("statusRules").get();
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      } catch (error) {
        console.error("Erro ao buscar regras de status:", error);
        return [];
      }
    },
    'statusRules'
  );
}

/**
 * Converte um nome de status em um ID válido para documento do Firestore.
 * Remove/substitui caracteres especiais que causam problemas.
 * @param {string} statusName - O nome original do status.
 * @returns {string} ID sanitizado para usar como documento.
 */
function sanitizeStatusId(statusName) {
  if (!statusName) return "";
  
  return statusName
    .replace(/\//g, "_")        // Substitui / por _
    .replace(/\\/g, "_")        // Substitui \ por _
    .replace(/[<>:"|?*]/g, "_") // Substitui caracteres problemáticos
    .replace(/\s+/g, " ")       // Normaliza espaços
    .trim();
}

/**
 * Busca uma única regra de status pelo seu nome (que é o ID do documento).
 * @param {string} statusName - O nome do status (ex: "Registrado").
 * @returns {Promise<object|null>} O objeto da regra ou null se não existir.
 */
export async function getStatusRule(statusName) {
  try {
    const sanitizedId = sanitizeStatusId(statusName);
    if (window.__DEBUG__) {
      console.log(`[DEBUG] getStatusRule: "${statusName}" → "${sanitizedId}"`);
    }
    
    const docRef = db.collection("statusRules").doc(sanitizedId);
    const doc = await docRef.get();
    if (doc.exists) {
      return { id: doc.id, originalStatusName: statusName, ...doc.data() };
    }
    return null; // Retorna nulo se não houver regra definida para este status
  } catch (error) {
    console.error("Erro ao buscar regra de status:", error);
    console.error("Status original:", statusName);
    console.error("ID sanitizado:", sanitizeStatusId(statusName));
    throw error; // Propaga o erro para ser tratado pela UI
  }
}

/**
 * Cria ou atualiza a regra para um status específico.
 * @param {string} statusName - O nome do status (ex: "Registrado").
 * @param {Array} requiredFields - O array de objetos de campos obrigatórios.
 * @returns {Promise<void>}
 */
export async function saveStatusRule(statusName, requiredFields, visibleFields = undefined) {
  try {
    const sanitizedId = sanitizeStatusId(statusName);
    if (window.__DEBUG__) {
      console.log(`[DEBUG] saveStatusRule: "${statusName}" → "${sanitizedId}"`);
      console.log('[DEBUG] Campos obrigatórios:', requiredFields);
      if (visibleFields) {
        console.log('[DEBUG] Campos visíveis:', visibleFields);
      }
    }
    
    const docRef = db.collection("statusRules").doc(sanitizedId);
    // Mantemos os campos já existentes quando o salvamento atual não informa um dos arrays.
    const existingDoc = await docRef.get();
    const existingData = existingDoc.exists ? existingDoc.data() || {} : {};
    const payload = {
      ...existingData,
      originalStatusName: statusName,
      updatedAt: new Date()
    };
    if (Array.isArray(requiredFields)) {
      payload.requiredFields = requiredFields;
    }
    if (Array.isArray(visibleFields)) {
      payload.visibleFields = visibleFields;
    }
    await docRef.set(payload);
    
    // Invalida o cache de regras de status para forçar recarga
    cacheService.invalidate('status_rules_all');
    cacheService.invalidate('statusRules');
    
    if (window.__DEBUG__) {
      console.log(` Regra salva e cache invalidado para: "${statusName}"`);
    }
  } catch (error) {
    console.error("Erro ao salvar regra de status:", error);
    console.error("Status original:", statusName);
    console.error("ID sanitizado:", sanitizeStatusId(statusName));
    throw error;
  }
}

/**
 * Faz o upload de um arquivo para o Firebase Storage.
 * @param {string} contractId - O ID do contrato para associar o arquivo.
 * @param {File} file - O arquivo a ser enviado.
 * @param {function} onProgress - Callback para atualizar o progresso do upload.
 * @returns {Promise<object>} Metadados do arquivo enviado
 */
export async function uploadFile(contractId, file, documentType, onProgress) {
  // Adicionamos 'documentType'
  if (!contractId || !file) {
    throw new Error("ID do contrato e arquivo são obrigatórios.");
  }

  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado.");

  // Cria um caminho único para o arquivo no Storage
  const filePath = `contracts/${contractId}/${Date.now()}_${file.name}`;
  const fileRef = storage.ref().child(filePath);

  // Metadados do arquivo com contentType explícito
  const metadata = {
    contentType: file.type || 'application/octet-stream',
    customMetadata: {
      uploadedBy: user.uid,
      uploadedByEmail: user.email,
      contractId: contractId,
      documentType: documentType || 'other'
    }
  };

  // Inicia o upload com metadados
  const uploadTask = fileRef.put(file, metadata);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        // Atualiza o progresso
        const progress =
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (typeof onProgress === "function") {
          onProgress(progress);
        }
      },
      (error) => {
        // Lida com erros
        console.error("Erro no upload:", error);
        reject(error);
      },
      async () => {
        // Upload concluído com sucesso
        const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();

        // Salva a referência do arquivo no Firestore
        const fileData = {
          name: file.name,
          type: documentType, // <-- ADICIONE ESTA LINHA
          url: downloadURL,
          path: filePath,
          storagePath: filePath,
          size: Number(file.size || 0),
          nome: file.name,
          categoria: documentType || 'other',
          tamanho: Number(file.size || 0),
          uploadedBy: user.email,
          uploadedAt: new Date(),
        };

        const attachmentRef = await db
          .collection("contracts")
          .doc(contractId)
          .collection("anexos")
          .add(fileData);
        resolve({
          id: attachmentRef.id,
          ...fileData
        });
      }
    );
  });
}

/**
 * Faz o upload de um arquivo de usuário (avatar, documentos pessoais) para o Firebase Storage.
 * @param {File} file - O arquivo a ser enviado.
 * @param {string} storagePath - O caminho completo no Storage (ex: users/uid/avatar_timestamp_filename).
 * @param {function} onProgress - Callback opcional para atualizar o progresso do upload.
 * @returns {Promise<string>} URL de download do arquivo enviado.
 */
export async function uploadUserFile(file, storagePath, onProgress) {
  if (!file || !storagePath) {
    throw new Error("Arquivo e caminho são obrigatórios.");
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error("Usuário não autenticado.");
  }

  const fileRef = storage.ref().child(storagePath);

  const metadata = {
    contentType: file.type || 'application/octet-stream',
    customMetadata: {
      uploadedBy: user.uid,
      uploadedByEmail: user.email
    }
  };

  const uploadTask = fileRef.put(file, metadata);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        if (onProgress && typeof onProgress === 'function') {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(progress);
        }
      },
      (error) => {
        console.error("Erro no upload:", error);
        reject(error);
      },
      async () => {
        const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
        resolve(downloadURL);
      }
    );
  });
}

/**
 * Busca a lista de anexos de um contrato.
 * @param {string} contractId - O ID do contrato.
 * @returns {Promise<Array>} Uma lista de objetos de anexos.
 */
export async function getContractAttachments(contractId) {
  const snapshot = await db
    .collection("contracts")
    .doc(contractId)
    .collection("anexos")
    .get();
  
  const attachments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  
  // Sort in memory to include documents without uploadedAt (putting them last or first)
  return attachments.sort((a, b) => {
    const dateA = a.uploadedAt ? (a.uploadedAt.toDate ? a.uploadedAt.toDate() : new Date(a.uploadedAt)) : new Date(0);
    const dateB = b.uploadedAt ? (b.uploadedAt.toDate ? b.uploadedAt.toDate() : new Date(b.uploadedAt)) : new Date(0);
    return dateB - dateA; // Descending
  });
}

/**
 * Exclui um anexo do Storage e do Firestore.
 * @param {string} contractId - O ID do contrato.
 * @param {string} attachmentId - O ID do documento do anexo.
 * @param {string} filePath - O caminho do arquivo no Storage.
 * @returns {Promise<void>}
 */
export async function deleteAttachment(contractId, attachmentId, filePath) {
  // Exclui o arquivo do Storage
  await storage.ref().child(filePath).delete();

  // Exclui a referência do Firestore
  await db
    .collection("contracts")
    .doc(contractId)
    .collection("anexos")
    .doc(attachmentId)
    .delete();
}

/**
 * Busca os dados de perfil de um utilizador específico no Firestore.
 * @param {string} uid - O ID do utilizador.
 * @returns {Promise<object|null>} Os dados do perfil ou nulo se não encontrado.
 */
export async function getUserProfile(uid, options = {}) {
  if (!uid) {
    return null;
  }

  const { forceRefresh = false } = options || {};
  const cacheKey = `userProfile_${uid}`;

  return await cacheService.get(
    cacheKey,
    async () => {
      const doc = await db.collection("users").doc(uid).get();
      if (!doc.exists) {
        console.warn(`Documento de perfil para o UID ${uid} não encontrado.`);
        return null;
      }

      const data = doc.data();
      if (window.__DEBUG__) {
        console.log(` Perfil carregado para ${uid}:`, {
          fullName: data.fullName,
          shortName: data.shortName,
          email: data.email
        });
      }

      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {
        // Ignore falhas de armazenamento local.
      }

      return data;
    },
    'userProfile',
    forceRefresh
  );
}

/**
 * Chama a Cloud Function para atualizar os dados do perfil do utilizador.
 * @param {object} data - Objeto com { fullName, shortName, cpf }.
 * @returns {Promise<object>} O resultado da chamada da função.
 */
export async function updateUserProfile(data) {
  const updateUser = firebase.app().functions('us-central1').httpsCallable("updateUserProfile");
  const result = await updateUser(data);

  const currentUid = auth.currentUser?.uid;
  if (currentUid) {
    const cacheKey = `userProfile_${currentUid}`;
    cacheService.invalidate(cacheKey);
    try {
      localStorage.removeItem(cacheKey);
    } catch {
      // Ignore falhas ao limpar cache local.
    }
  }

  return result;
}

/**
 * Salva as preferências de filtros do usuário no Firestore (coleção users)
 * @param {string} uid - ID do usuário
 * @param {object} preferences - Objeto com preferências (statusFilter, vendorFilter, visibleColumns)
 * @returns {Promise<void>}
 */
export async function saveUserFilterPreferences(uid, preferences) {
  if (!uid) {
    console.warn('[FilterPrefs] UID não fornecido');
    return;
  }
  
  try {
    const userRef = db.collection("users").doc(uid);
    
    // Merge com preferências existentes (não sobrescreve outros campos)
    await userRef.set({
      filterPreferences: {
        ...preferences,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }
    }, { merge: true });
    
    console.log(' Preferências de filtros salvas no Firestore');
  } catch (error) {
    console.error('[FilterPrefs] Erro ao salvar preferências:', error);
    throw error;
  }
}

/**
 * Carrega as preferências de filtros do usuário do Firestore
 * @param {string} uid - ID do usuário
 * @returns {Promise<object|null>} Preferências salvas ou null
 */
export async function loadUserFilterPreferences(uid) {
  if (!uid) {
    console.warn('[FilterPrefs] UID não fornecido');
    return null;
  }
  
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    
    if (userDoc.exists) {
      const data = userDoc.data();
      if (data.filterPreferences) {
        console.log(' Preferências de filtros carregadas do Firestore');
        return data.filterPreferences;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[FilterPrefs] Erro ao carregar preferências:', error);
    return null;
  }
}


/**
 * Envia o conteúdo do CSV para a Cloud Function de IA para análise.
 * @param {string} csvText - O conteúdo do ficheiro CSV.
 * @returns {Promise<object>} Os dados processados pela IA.
 */
export async function analyzeCsvWithAI(csvText) {
  // Cloud Function processCsvWithAI
  // Usa explicitamente a região da função (southamerica-east1) para evitar 404 por região
  const functionsSvc = (firebase.app && typeof firebase.app === 'function')
    ? firebase.app().functions('southamerica-east1')
    : firebase.app().functions('southamerica-east1');
  if (!functionsSvc || !functionsSvc.httpsCallable) {
    throw new Error('Firebase Functions não está disponível no cliente.');
  }
  const processCsv = functionsSvc.httpsCallable('processCsvWithAI');
  const result = await processCsv({ csvText });
  return result.data;
}

/**
 * Importa um arquivo CSV utilizando IA para validar, normalizar e estruturar os dados.
 * Estratégia:
 * 1) Tenta analisar via Cloud Function (LLM) e normaliza com IA assistida (client-side);
 * 2) Se falhar, faz parsing tolerante local e aplica IA assistida para normalização;
 * 3) Importa em lotes com conversão robusta de datas e criação de histórico.
 * @param {string} csvText
 * @param {Array<object>} [prebuiltErrorLogs] - Logs opcionais pré-coletados durante a análise UI
 * @returns {Promise<{ importedCount: number, totalBatches: number }>} Resumo da importação
 */
export async function importCsvWithAI(csvText, prebuiltErrorLogs = []) {
  // Dependências opcionais expostas no window para reaproveitar lógica já carregada na UI
  const aiAssist = (typeof window !== 'undefined' && window.aiAssistCsvProcesses) ? window.aiAssistCsvProcesses : null;

  let normalizedContracts = [];
  let errorLogs = Array.isArray(prebuiltErrorLogs) ? [...prebuiltErrorLogs] : [];

  // 1) Tenta via Cloud Function + normalização local
  try {
    const processed = await analyzeCsvWithAI(csvText);
    if (processed && Array.isArray(processed.contratos) && processed.contratos.length > 0) {
      normalizedContracts = aiAssist ? aiAssist(processed.contratos) : processed.contratos;
    } else {
      throw new Error('IA não retornou registros válidos.');
    }
  } catch (e) {
    console.warn(' Falha na análise via IA. Tentando fallback automático...', e?.message || e);
    errorLogs.push(` IA indisponível (${e?.message || e}). Usando processamento automático.`);
    
    // 2) Fallback: parsing local sem IA
    try {
      normalizedContracts = await importCsvFallback(csvText);
      if (normalizedContracts.length === 0) {
        throw new Error('Arquivo CSV não contém dados válidos.');
      }
      console.log(` Fallback bem-sucedido: ${normalizedContracts.length} contratos processados automaticamente`);
    } catch (fallbackError) {
      console.error(' Fallback também falhou:', fallbackError);
      throw new Error(`Falha na validação por IA e no processamento automático: ${fallbackError.message}`);
    }
  }

  if (!Array.isArray(normalizedContracts) || normalizedContracts.length === 0) {
    throw new Error('Nenhum contrato válido foi gerado após a normalização.');
  }

  normalizedContracts = normalizedContracts.map((contract, index) =>
    finalizeContractFromCsv(contract, {
      rowIndex: index,
      logDates: index < 3,
    })
  );

  // 3) Importa em lotes (reaproveita conversão de datas e histórico)
  const result = await batchImportContracts(normalizedContracts, errorLogs);
  await auditContractsCsvImport(csvText, result, 'importCsvWithAI');
  return result; // { importedCount, totalBatches }
}

/**
 * Importa um arquivo CSV diretamente sem validação por IA.
 * VERSÃO RECONSTRUÍDA para garantir preservação de status e nomes.
 * @param {string} csvText - Conteúdo do arquivo CSV
 * @param {Array<object>} [prebuiltErrorLogs] - Logs opcionais pré-coletados durante a análise UI
 * @returns {Promise<{ importedCount: number, totalBatches: number, contratos: Array }>} Resultado da importação
 */
export async function importCsvDirectly(csvText, prebuiltErrorLogs = []) {
  let errorLogs = Array.isArray(prebuiltErrorLogs) ? [...prebuiltErrorLogs] : [];
  
  console.log(' Importando CSV diretamente sem validação por IA (VERSÃO RECONSTRUÍDA)...');
  errorLogs.push(' Importação direta sem validação por IA (versão reconstruída).');
  
  try {
    // Usa função de parsing robusta
    const normalizedContracts = await parseAndNormalizeCsv(csvText);
    
    if (!Array.isArray(normalizedContracts) || normalizedContracts.length === 0) {
      throw new Error('Nenhum contrato válido foi encontrado no arquivo CSV.');
    }
    
    console.log(` ${normalizedContracts.length} contratos processados automaticamente`);
    errorLogs.push(` ${normalizedContracts.length} contratos processados automaticamente`);
    
    // Importa em lotes usando função simplificada
    const result = await batchImportContractsSimplified(normalizedContracts);
    await auditContractsCsvImport(csvText, result, 'importCsvDirectly');
    
    // Retorna também os contratos para análise/preview se necessário
    return {
      ...result,
      contratos: normalizedContracts
    };
    
  } catch (error) {
    console.error(' Falha na importação direta:', error);
    throw new Error(`Falha no processamento do CSV: ${error.message}`);
  }
}

/**
 * Garante que todos os status encontrados nos contratos existam no sistema
 * @param {Array} contracts - Array de contratos para verificar status
 */
async function ensureStatusExist(contracts) {
  console.log(' Verificando se todos os status dos contratos existem no sistema...');
  
  // Coleta todos os status únicos dos contratos
  const uniqueStatuses = new Set();
  contracts.forEach(contract => {
    if (contract.status && contract.status.trim() !== '') {
      uniqueStatuses.add(contract.status.trim());
    }
  });
  
  console.log(` Encontrados ${uniqueStatuses.size} status únicos:`, Array.from(uniqueStatuses));
  
  try {
    // Busca status existentes no sistema
    const existingStatuses = await getEffectiveStatuses();
    const existingStatusTexts = new Set(existingStatuses.map(s => s.text));
    
    // Encontra status que precisam ser criados
    const statusesToCreate = Array.from(uniqueStatuses).filter(status => 
      !existingStatusTexts.has(status)
    );
    
    if (statusesToCreate.length === 0) {
      console.log(' Todos os status já existem no sistema');
      return;
    }
    
    console.log(` Criando ${statusesToCreate.length} novos status:`, statusesToCreate);
    
    // Cria status faltantes
    for (let i = 0; i < statusesToCreate.length; i++) {
      const statusText = statusesToCreate[i];
      try {
        await createOrUpdateStatus({
          text: statusText,
          stage: 'Registro', // Stage padrão
          order: 100 + i, // Order alto para não interferir com status existentes
          nextSteps: [],
          active: true
        });
        console.log(` Status criado: "${statusText}"`);
      } catch (error) {
        console.warn(` Erro ao criar status "${statusText}":`, error.message);
      }
    }
    
    // Invalida cache de status após criações
    cacheService.invalidateByPattern(/^status/);
    
    console.log(' Verificação de status concluída');
    
  } catch (error) {
    console.warn(' Erro na verificação de status - importação continua:', error.message);
  }
}

/**
 * Função simplificada de parsing e normalização de CSV que preserva todos os dados originais
 * @param {string} csvText - Conteúdo do arquivo CSV  
 * @returns {Promise<Array>} Array de contratos processados
 */
export async function parseAndNormalizeCsv(csvText, options = {}) {
  const { ensureStatuses = true } = options;
  console.log(' Iniciando parsing de CSV (versão simplificada)...');
  
  // Parse do CSV
  const delimiter = detectCsvDelimiter(csvText);
  const delimiterLabel = delimiter === "\t" ? "TAB" : delimiter;
  console.log(` Delimitador detectado: "${delimiterLabel}"`);
  const parsedLines = parseCSVRobust(csvText, delimiter);
  if (parsedLines.length <= 1) {
    throw new Error("Arquivo CSV vazio ou sem dados válidos.");
  }

  const headers = parsedLines[0];
  const dataRows = parsedLines.slice(1);
  
  console.log(` Encontrados ${headers.length} cabeçalhos e ${dataRows.length} linhas de dados`);
  
  // Mapeamento direto de campos (sem alterações)
  const fieldMapping = {
    // Mantém nomes originais para preservar dados
    'id': 'id',
    'vendedorconstrutora': 'vendedorConstrutora', 
    'empreendimento': 'empreendimento',
    'apto': 'apto',
    'comprador_1_nome': 'clientePrincipal', // Mapeia para o campo principal
    'comprador_1_cpf': 'cpfClientePrincipal',
    'comprador_2_nome': 'clienteSecundario',
    'comprador_2_cpf': 'cpfClienteSecundario',
    'status': 'status', // PRESERVA STATUS ORIGINAL
    'anotacoes': 'anotacoes',
    'ncontratocef': 'nContratoCEF',
    'agencia': 'agencia',
    'cartorio': 'cartorio',
    'dataminuta': 'dataMinuta',
    'dataassinaturacliente': 'dataAssinaturaCliente',
    'valoritbi': 'valorITBI',
    'valordepositori': 'valorDepositoRi',
    'dataentradaregistro': 'dataEntradaRegistro',
    'valorfinalri': 'valorFinalRi',
    'protocolori': 'protocoloRi',
    'dataanaliseregistro': 'dataAnaliseRegistro',
    'dataprevistaregistro': 'dataPrevistaRegistro',
    'dataretornori': 'dataRetornoRi',
    'dataretiradacontratoregistrado': 'dataRetiradaContratoRegistrado'
  };

  const processedContracts = [];
  
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (row.length < headers.length / 2) continue; // Pula linhas muito vazias
    
    const contract = {};
    
    // Processa cada campo
    headers.forEach((header, index) => {
      const normalizedHeader = normalizeCsvHeader(header);
      const mappedField = fieldMapping[normalizedHeader] || normalizedHeader;
      const value = row[index] ? row[index].trim() : '';
      
      // Preserva valor original se não estiver vazio
      if (value !== '') {
        contract[mappedField] = value;
      }
    });
    
    finalizeContractFromCsv(contract, { rowIndex: i, logDates: i < 3 });
    
    // Validações mínimas obrigatórias
    if (!contract.id || contract.id.trim() === '') {
      console.warn(` Linha ${i + 2}: ID vazio, pulando registro`);
      continue;
    }
    
    // Garante clientePrincipal se não mapeado automaticamente
    if (!contract.clientePrincipal) {
      // Tenta outros campos de comprador
      const possibleNames = ['cliente', 'nome', 'comprador', 'nome_cliente'];
      for (const field of possibleNames) {
        if (contract[field] && contract[field].trim() !== '') {
          contract.clientePrincipal = contract[field].trim();
          break;
        }
      }
    }
    
    // Log de debug para os primeiros registros
    if (i < 3) {
      console.log(` Contrato ${i + 1}:`, {
        id: contract.id,
        status: contract.status,
        clientePrincipal: contract.clientePrincipal,
        totalCampos: Object.keys(contract).length
      });
    }
    
    // Adiciona metadados de importação
    contract.criadoEm = new Date();
    contract.importadoSemIA = true;
    contract.fonteDados = 'csv_direto';
    
    processedContracts.push(contract);
  }
  
  console.log(` Processados ${processedContracts.length} contratos válidos`);
  
  // IMPORTANTE: Garante que todos os status encontrados existam no sistema quando necessário
  if (ensureStatuses) {
    await ensureStatusExist(processedContracts);
  }
  
  return processedContracts;
}

/**
 * Função robusta de parsing CSV (idêntica à já testada)
 */
function parseCSVRobust(text, delimiter = ',') {
  const lines = [];
  let currentLine = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;
  
  while (i < text.length) {
    const char = text[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentLine.push(currentField.trim());
        currentField = "";
      } else if (char === '\n') {
        currentLine.push(currentField.trim());
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = [];
        currentField = "";
      } else if (char !== '\r') {
        currentField += char;
      }
    }
    i++;
  }
  
  if (currentField.length > 0 || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }
  
  return lines;
}

/**
 * Função simplificada de importação em lotes que NÃO altera os dados
 */
async function batchImportContractsSimplified(contracts) {
  const contractsCollection = db.collection("contracts");
  const BATCH_SIZE = 450;
  
  console.log(` Iniciando importação simplificada de ${contracts.length} contratos...`);

  // OTIMIZAÇÃO: Verifica apenas IDs que estão no lote, não toda a coleção
  const csvIds = contracts.map(c => c.id).filter(id => id);
  const existingIds = new Set();
  
  // Verifica em lotes de 10 (limite do 'in' do Firestore)
  const ID_BATCH_SIZE = 10;
  for (let i = 0; i < csvIds.length; i += ID_BATCH_SIZE) {
    const batchIds = csvIds.slice(i, i + ID_BATCH_SIZE);
    if (batchIds.length > 0) {
      try {
        const existingDocs = await contractsCollection
          .where(firebase.firestore.FieldPath.documentId(), 'in', batchIds)
          .get();
        existingDocs.docs.forEach(doc => existingIds.add(doc.id));
      } catch (e) {
        console.warn(' Erro ao verificar IDs existentes:', e);
      }
    }
  }
  
  console.log(` [OTIMIZADO] Verificados ${csvIds.length} IDs, ${existingIds.size} já existem`);
  
  const totalBatches = Math.ceil(contracts.length / BATCH_SIZE);
  let importedCount = 0;
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batch = db.batch();
    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, contracts.length);
    const batchContracts = contracts.slice(start, end);
    
    console.log(` Lote ${batchIndex + 1}/${totalBatches} (${batchContracts.length} contratos)`);

    batchContracts.forEach((contractData, index) => {
      // PRESERVA TODOS OS DADOS ORIGINAIS
      const dataToSave = { ...contractData };
      
      // Log de debug para primeiro lote
      if (batchIndex === 0 && index < 3) {
        console.log(` SALVANDO - ${dataToSave.id}:`, {
          status: dataToSave.status,
          clientePrincipal: dataToSave.clientePrincipal,
          preservado: 'SIM'
        });
      }
      
      // Define ID do documento
      let docRef;
      if (dataToSave.id && !existingIds.has(dataToSave.id)) {
        docRef = contractsCollection.doc(dataToSave.id);
        delete dataToSave.id; // Remove do dados para não duplicar
      } else {
        docRef = contractsCollection.doc();
        delete dataToSave.id;
      }
      
      // Adiciona histórico básico
      dataToSave.historico = [{
        data: new Date(),
        acao: "contrato_criado",
        usuario: firebase.auth().currentUser ? firebase.auth().currentUser.email : "sistema",
        detalhes: "Contrato importado via CSV (importação simplificada)"
      }];
      
      batch.set(docRef, dataToSave);
    });

    // Executa o lote
    try {
      await batch.commit();
      importedCount += batchContracts.length;
      console.log(` Lote ${batchIndex + 1} importado (${importedCount}/${contracts.length})`);
      
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(` Erro no lote ${batchIndex + 1}:`, error);
      throw new Error(`Falha na importação do lote ${batchIndex + 1}: ${error.message}`);
    }
  }
  
  console.log(` Importação concluída: ${importedCount} contratos salvos`);
  
  // CRÍTICO: Invalida cache para que novos contratos apareçam na interface
  console.log(' Invalidando caches...');
  cacheService.invalidateByPattern(/^contracts/); // Todas as listagens de contratos
  cacheService.invalidateByPattern(/^dashboard/); // Dashboard
  cacheService.invalidateByPattern(/^kpi/); // KPIs
  
  // Invalida cache de paginação também
  if (paginationService && paginationService.invalidateCache) {
    paginationService.invalidateCache('contracts');
  }
  
  console.log(' Caches invalidados - novos contratos devem aparecer na interface');
  
  return { importedCount, totalBatches };
}

/**
 * Processa CSV sem IA (fallback automático)
 * Usa a mesma lógica da função importContractsFromCSV mas retorna apenas os contratos processados
 * @param {string} csvText - Conteúdo do arquivo CSV
 * @returns {Promise<Array>} Array de contratos processados
 */
async function importCsvFallback(csvText) {
  // Função melhorada para analisar CSV com quebras de linha dentro de campos
  function parseCSV(text) {
    const lines = [];
    let currentLine = [];
    let currentField = "";
    let inQuotes = false;
    let i = 0;
    
    while (i < text.length) {
      const char = text[i];
      
      if (inQuotes) {
        if (char === '"') {
          // Verifica se é escape de aspas duplas
          if (i + 1 < text.length && text[i + 1] === '"') {
            currentField += '"';
            i += 2; // Pula as duas aspas
            continue;
          } else {
            // Fim das aspas
            inQuotes = false;
          }
        } else {
          // Dentro de aspas, adiciona qualquer caractere (incluindo quebras de linha)
          currentField += char;
        }
      } else {
        if (char === '"') {
          // Início de campo com aspas
          inQuotes = true;
        } else if (char === ',') {
          // Separador de campo
          currentLine.push(currentField.trim());
          currentField = "";
        } else if (char === '\n') {
          // Fim de linha (só conta se não estiver dentro de aspas)
          currentLine.push(currentField.trim());
          if (currentLine.length > 0) {
            lines.push(currentLine);
          }
          currentLine = [];
          currentField = "";
        } else if (char !== '\r') {
          // Ignora \r, adiciona outros caracteres
          currentField += char;
        }
      }
      i++;
    }
    
    // Adiciona último campo e linha se existirem
    if (currentField.length > 0 || currentLine.length > 0) {
      currentLine.push(currentField.trim());
      if (currentLine.length > 0) {
        lines.push(currentLine);
      }
    }
    
    return lines;
  }

  const headerMapping = {
    vendedorconstrutora: "vendedorConstrutora",
    empreendimento: "empreendimento",
    "nome do empreendimento": "empreendimento",
    projeto: "empreendimento",
    cliente: "clientePrincipal",
    comprador_1_nome: "clientePrincipal",
    comprador_1_cpf: "cpfClientePrincipal",
    comprador_2_nome: "clienteSecundario",
    comprador_2_cpf: "cpfClienteSecundario",
    ncontratocef: "nContratoCEF",
    dataminuta: "dataMinuta",
    dataassinaturacliente: "dataAssinaturaCliente",
    status: "status",
    anotacoes: "anotacoes",
    apto: "apto",
    cartorio: "cartorio",
    agencia: "agencia",
    valoritbi: "valorITBI",
    valordepositori: "valorDepositoRi",
    dataentradaregistro: "dataEntradaRegistro",
    valorfinalri: "valorFinalRi",
    protocolori: "protocoloRi",
    dataanaliseregistro: "dataAnaliseRegistro",
    dataprevistaregistro: "dataPrevistaRegistro",
    dataretornori: "dataRetornoRi",
    dataretiradacontratoregistrado: "dataRetiradaContratoRegistrado",
    agendamentoformulario: "agendamentoFormulario",
    casafacil: "casaFacil",
    certificacaosolicem: "certificacaoSolicEm",
    cohaparaprovada: "cohaparAprovada",
    conferenciacehopnatodevolvidaem: "conferenciaCehopNatoDevolvidaEm",
    conferenciacehopnatoentregueem: "conferenciaCehopNatoEntregueEm",
    conformeem: "conformeEm",
    contratocef: "contratoCef",
    datadeenviodapastaagencia: "dataDeEnvioDaPastaAgencia",
    devolucaoparacorrecao: "devolucaoParaCorrecao",
    devolvidocorrigido: "devolvidoCorrigido",
    entreguecehop: "entregueCehop",
    entrevistacef: "entrevistaCef",
    enviadoacehop: "enviadoACehop",
    montagemcehop: "montagemCehop",
    montagemcomplementar: "montagemComplementar",
    vencsicaq: "vencSicaq",
    repasse: "repasse",
  };

  const rows = parseCSV(csvText);
  if (rows.length <= 1) throw new Error("Ficheiro CSV vazio ou inválido.");

  const headers = rows[0].map((h) => normalizeCsvHeader(h));
  const idHeaderIndex = headers.indexOf("id");
  if (idHeaderIndex === -1)
    throw new Error('A coluna "id" é obrigatória no ficheiro CSV.');

  const processedContracts = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.length < headers.length) continue;

    const contractObject = {};

    headers.forEach((header, index) => {
      const value = values[index] ? values[index].trim() : "";
      const correctKey = headerMapping[header] || header;
      contractObject[correctKey] = value;
    });

    if (!contractObject.id) continue;

    // Processa anotações
    const textoAnotacao = contractObject.anotacao || contractObject.observacoes || "";
    if (textoAnotacao && typeof textoAnotacao === "string" && textoAnotacao.trim() !== "") {
      contractObject.anotacoes = [{
        texto: textoAnotacao.trim(),
        usuario: "Sistema (Importação CSV)",
        data: new Date(),
      }];
      delete contractObject.anotacao;
      delete contractObject.observacoes;
    }

    // Processa repasses
    if (contractObject.repasse) {
      const valorRepasse = parseFloat(String(contractObject.repasse).replace(",", "."));
      if (!isNaN(valorRepasse) && valorRepasse > 0) {
        contractObject.repasses = [{
          origem: "Repasse (Importado)",
          valor: valorRepasse,
        }];
      }
      delete contractObject.repasse;
    }

    finalizeContractFromCsv(contractObject, { rowIndex: i });
    
    //  CORREÇÃO: Preserva o status original do CSV, não aplica status padrão
    // if (!contractObject.status) {
    //   contractObject.status = "Entrada Registro";
    // }
    // Agora o status vem do mapeamento do CSV e deve ser preservado

    // Adiciona metadados de processamento
    contractObject.statusIA = 'PROCESSADO_SEM_IA';
    contractObject.notasIA = 'Arquivo processado automaticamente sem validação de IA devido a indisponibilidade do serviço.';

    processedContracts.push(contractObject);
  }

  return processedContracts;
}

/**
 * Importa em lote os contratos que foram validados pelo utilizador.
 * @param {Array<object>} contracts - A lista de objetos de contrato a serem importados.
 * @returns {Promise<void>}
 */
/**
 * Importa contratos em lotes para evitar erro de "Transaction too big"
 * @param {Array} contracts - Array de contratos para importar
 * @param {Array} errorLogs - Array de logs de erro
 * @returns {Promise<void>}
 */
export async function batchImportContracts(contracts, errorLogs = []) {
    const contractsCollection = db.collection("contracts");
    const BATCH_SIZE = 450; // Deixa margem de segurança abaixo do limite de 500
    
    console.log(` Iniciando importação em lotes de ${contracts.length} contratos...`);

    // OTIMIZAÇÃO: Verifica apenas IDs que estão no lote, não toda a coleção
    const csvIds = contracts.map(c => c.id).filter(id => id);
    const existingIds = new Set();
    
    // Verifica em lotes de 10 (limite do 'in' do Firestore)
    const ID_BATCH_SIZE = 10;
    for (let i = 0; i < csvIds.length; i += ID_BATCH_SIZE) {
      const batchIds = csvIds.slice(i, i + ID_BATCH_SIZE);
      if (batchIds.length > 0) {
        try {
          const existingDocs = await contractsCollection
            .where(firebase.firestore.FieldPath.documentId(), 'in', batchIds)
            .get();
          existingDocs.docs.forEach(doc => existingIds.add(doc.id));
        } catch (e) {
          console.warn(' Erro ao verificar IDs existentes:', e);
        }
      }
    }
    
    console.log(` [OTIMIZADO] Verificados ${csvIds.length} IDs, ${existingIds.size} já existem`);
    
    const totalBatches = Math.ceil(contracts.length / BATCH_SIZE);
    let importedCount = 0;
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batch = db.batch();
        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, contracts.length);
        const batchContracts = contracts.slice(start, end);
        
        console.log(` Processando lote ${batchIndex + 1}/${totalBatches} (${batchContracts.length} contratos)`);

        batchContracts.forEach((contractData, index) => {
            // Remove os campos da IA e campos internos antes de salvar
            const dataToSave = { ...contractData };
            delete dataToSave.statusIA;
            delete dataToSave.notasIA;
            delete dataToSave._originalLine;
            delete dataToSave._hasFieldErrors;

            //  DEBUG: Log do status original antes de qualquer processamento
            if (window.__DEBUG__ && batchIndex === 0 && index < 3) {
                console.log(` DEBUG STATUS - Contrato ${dataToSave.id || index}:`, {
                    statusOriginal: contractData.status,
                    statusDataToSave: dataToSave.status,
                    todosOsCampos: Object.keys(dataToSave).filter(k => k.toLowerCase().includes('status'))
                });
            }

            //  CONVERSÃO ROBUSTA DE DATAS PARA TIMESTAMPS
            Object.keys(dataToSave).forEach(key => {
                const value = dataToSave[key];
                
                // Verifica se o campo pode ser uma data (nome do campo ou valor parece uma data)
                if (typeof value === 'string' && value.trim() !== '' && 
                    (key.toLowerCase().includes('data') || isDateString(value))) {
                    
                    const convertedDate = parseAndConvertDate(value);
                    if (convertedDate) {
                        dataToSave[key] = convertedDate;
                        console.log(` Data convertida: ${key} = "${value}" → Timestamp`);
                    } else {
                        console.warn(` Não foi possível converter data: ${key} = "${value}"`);
                    }
                }
            });

            // Garante que o status do CSV seja preservado se existir
            if (!dataToSave.status || dataToSave.status.trim() === '') {
                // Se não tem status, usa o primeiro status disponível como fallback
                const statusConfig = window.EFFECTIVE_STATUS_CONFIG || STATUS_CONFIG;
                dataToSave.status = statusConfig.length > 0 ? statusConfig[0].text : "Sem Status";
                if (window.__DEBUG__ && batchIndex === 0 && index < 3) {
                    console.log(` DEBUG: Status vazio, aplicando fallback: ${dataToSave.status}`);
                }
            } else {
                if (window.__DEBUG__ && batchIndex === 0 && index < 3) {
                    console.log(` DEBUG: Status preservado do CSV: ${dataToSave.status}`);
                }
            }

            // Garante o campo clientePrincipal - lógica inteligente para CSV
            if (!dataToSave.clientePrincipal) {
                // Tenta diferentes campos comuns para nome do cliente
                const possibleNameFields = [
                    'clientePrincipal', 'cliente', 'nome', 'comprador', 'nome_cliente', 
                    'cliente_nome', 'nome_comprador', 'contratante', 'pessoa',
                    'comprador_1_nome', 'comprador1_nome', 'comprador1', 'comprador_principal'
                ];
                
                for (const field of possibleNameFields) {
                    const value = dataToSave[field];
                    if (value && typeof value === 'string' && value.trim() !== '' && value.trim() !== '0') {
                        dataToSave.clientePrincipal = value.trim();
                        console.log(` ClientePrincipal definido a partir do campo '${field}': ${value}`);
                        break;
                    }
                }
            }

            // Se ainda não encontrou, procura o primeiro comprador principal
            if (!dataToSave.clientePrincipal) {
                // Verifica se tem comprador_1_principal = 1 ou similar
                for (let i = 1; i <= 4; i++) {
                    const principalField = `comprador_${i}_principal`;
                    const nomeField = `comprador_${i}_nome`;
                    
                    if (dataToSave[principalField] === '1' || dataToSave[principalField] === 'true' || dataToSave[principalField] === 'sim') {
                        const nome = dataToSave[nomeField];
                        if (nome && nome.trim() !== '') {
                            dataToSave.clientePrincipal = nome.trim();
                            console.log(` ClientePrincipal definido a partir do comprador principal ${i}: ${nome}`);
                            break;
                        }
                    }
                }
            }

            // Se ainda não encontrou, pega o primeiro comprador com nome
            if (!dataToSave.clientePrincipal) {
                for (let i = 1; i <= 4; i++) {
                    const nomeField = `comprador_${i}_nome`;
                    const nome = dataToSave[nomeField];
                    if (nome && nome.trim() !== '') {
                        dataToSave.clientePrincipal = nome.trim();
                        console.log(` ClientePrincipal definido a partir do primeiro comprador com nome (${i}): ${nome}`);
                        break;
                    }
                }
            }

            // Fallback: Se ainda não tem clientePrincipal, tenta compradores como array
            if (!dataToSave.clientePrincipal && dataToSave.compradores && Array.isArray(dataToSave.compradores) && dataToSave.compradores.length > 0) {
                const compradorPrincipal = dataToSave.compradores.find(c => c.principal) || dataToSave.compradores[0];
                dataToSave.clientePrincipal = compradorPrincipal.nome || "";
            }

            // Último fallback: Define como string vazia se não encontrou nada
            if (!dataToSave.clientePrincipal) {
                dataToSave.clientePrincipal = "";
                if (batchIndex === 0 && index < 3) { // Log apenas nos primeiros registros do primeiro lote
                    console.warn(` ClientePrincipal não pôde ser determinado para contrato. Campos disponíveis:`, Object.keys(dataToSave).filter(k => k.includes('nome') || k.includes('client')));
                }
            }

            // Adiciona metadados de importação
            dataToSave.criadoEm = new Date();
            dataToSave.importadoPorIA = true;

            //  NOVO: Adiciona informações sobre problemas nos campos se houver
            if (contractData._hasFieldErrors) {
                dataToSave.temProblemasImportacao = true;
                dataToSave.linhaOriginalCSV = contractData._originalLine;
            }

            let docRef;
            let finalContractId;
            
            if (dataToSave.id && !existingIds.has(dataToSave.id)) {
                // Se o CSV JÁ TEM um ID único, usa esse ID
                finalContractId = dataToSave.id;
                docRef = contractsCollection.doc(finalContractId);
                delete dataToSave.id; // Remove o ID dos dados para não duplicar
            } else {
                // Se NÃO TEM um ID ou o ID já existe, o Firestore gera um novo automaticamente
                docRef = contractsCollection.doc();
                finalContractId = docRef.id;
                delete dataToSave.id; // Remove o ID dos dados se existir
            }

            //  NOVO: Prepara histórico inicial com logs de erro se houver
            const historico = [{
                data: new Date(),
                acao: "contrato_criado",
                usuario: firebase.auth().currentUser ? firebase.auth().currentUser.email : "sistema",
                detalhes: "Contrato importado via CSV"
            }];

            // Adiciona logs de erro de campos ao histórico
            const contractErrorLogs = errorLogs.filter(log => log.processId === finalContractId);
            contractErrorLogs.forEach(errorLog => {
                historico.push({
                    data: new Date(errorLog.timestamp),
                    acao: "problemas_importacao",
                    usuario: "sistema",
                    detalhes: errorLog.message,
                    tipo: errorLog.type,
                    severidade: errorLog.severity,
                    erros: errorLog.errors.map(err => ({
                        campo: err.field,
                        valor: err.value,
                        problema: err.error,
                        severidade: err.severity || 'error'
                    }))
                });
            });

            dataToSave.historico = historico;

            batch.set(docRef, dataToSave);
        });

        // Executa o lote atual
        try {
            await batch.commit();
            importedCount += batchContracts.length;
            console.log(` Lote ${batchIndex + 1} importado com sucesso (${importedCount}/${contracts.length})`);
            
            // Pequena pausa entre lotes para evitar sobrecarga
            if (batchIndex < totalBatches - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (error) {
            console.error(` Erro ao importar lote ${batchIndex + 1}:`, error);
            throw new Error(`Falha na importação do lote ${batchIndex + 1}: ${error.message}`);
        }
    }
    
    console.log(` Importação concluída! ${importedCount} contratos importados em ${totalBatches} lotes.`);
    return { importedCount, totalBatches };
}

/**
 * Obtém todos os contratos para backup
 * @returns {Promise<Array>} Array com todos os contratos
 */
export async function getAllContratos() {
    try {
        console.log(' Obtendo todos os contratos para backup...');
        
        const snapshot = await contractsCollection.get();
        const contratos = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            // Converter timestamps do Firestore para strings ISO
            const contratoData = { id: doc.id, ...data };
            
            // Converter campos de data para formato serializable
            Object.keys(contratoData).forEach(key => {
                if (contratoData[key] && contratoData[key].toDate) {
                    contratoData[key] = contratoData[key].toDate().toISOString();
                }
            });
            
            contratos.push(contratoData);
        });
        
        console.log(` ${contratos.length} contratos obtidos para backup`);
        return contratos;
        
    } catch (error) {
        console.error(' Erro ao obter contratos para backup:', error);
        throw error;
    }
}

// ===== SISTEMA DE NOTIFICAÇÕES =====

/**
 * Obtém notificações do usuário
 * @param {string} userId - ID do usuário
 * @returns {Promise<Array>} Lista de notificações
 */
export async function getUserNotifications(userId) {
    try {
        const snapshot = await db.collection('notifications')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        
        const notifications = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            notifications.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.createdAt
            });
        });
        
        return notifications;
        
    } catch (error) {
        console.error(' Erro ao obter notificações:', error);
        return [];
    }
}

/**
 * Cria uma nova notificação
 * @param {Object} notification - Dados da notificação
 * @returns {Promise<string>} ID da notificação criada
 */
export async function createNotification(notification) {
    try {
        const notificationData = {
            ...notification,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await db.collection('notifications').add(notificationData);
        console.log(' Notificação criada:', docRef.id);
        
        return docRef.id;
        
    } catch (error) {
        console.error(' Erro ao criar notificação:', error);
        throw error;
    }
}

/**
 * Atualiza uma notificação
 * @param {string} notificationId - ID da notificação
 * @param {Object} updates - Dados para atualizar
 * @returns {Promise<void>}
 */
export async function updateNotification(notificationId, updates) {
    try {
        await db.collection('notifications').doc(notificationId).update({
            ...updates,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(' Notificação atualizada:', notificationId);
        
    } catch (error) {
        console.error(' Erro ao atualizar notificação:', error);
        throw error;
    }
}

/**
 * Remove uma notificação
 * @param {string} notificationId - ID da notificação
 * @returns {Promise<void>}
 */
export async function deleteNotification(notificationId) {
    try {
        await db.collection('notifications').doc(notificationId).delete();
        console.log(' Notificação removida:', notificationId);
        
    } catch (error) {
        console.error(' Erro ao remover notificação:', error);
        throw error;
    }
}

/**
 * Obtém novas notificações desde uma data específica
 * @param {string} userId - ID do usuário
 * @param {string} lastCheck - Data da última verificação (ISO string)
 * @returns {Promise<Array>} Lista de novas notificações
 */
export async function getNewNotifications(userId, lastCheck) {
    try {
        let query = db.collection('notifications')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc');
        
        if (lastCheck) {
            const lastCheckDate = new Date(lastCheck);
            query = query.where('createdAt', '>', firebase.firestore.Timestamp.fromDate(lastCheckDate));
        }
        
        const snapshot = await query.limit(20).get();
        
        const notifications = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            notifications.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.createdAt
            });
        });
        
        return notifications;
        
    } catch (error) {
        console.error(' Erro ao obter novas notificações:', error);
        return [];
    }
}

// ===== CONFIGURAÇÕES DO DASHBOARD (KPIs) =====

/**
 * Obtém feature flags de sistema com fallback local.
 * Doc: settings/system_flags
 * @param {object} options
 * @param {boolean} options.forceRefresh
 * @returns {Promise<object>}
 */
export async function getSystemFlags(options = {}) {
  const { forceRefresh = false } = options || {};

  try {
    const flags = await cacheService.get(
      'system_flags',
      async () => {
        const doc = await db.collection(SYSTEM_FLAGS_DOC_PATH.collection).doc(SYSTEM_FLAGS_DOC_PATH.docId).get();
        if (!doc.exists) {
          return { ...DEFAULT_SYSTEM_FLAGS };
        }
        const data = doc.data() || {};
        return { ...DEFAULT_SYSTEM_FLAGS, ...data };
      },
      'settingsFlags',
      forceRefresh
    );
    const mergedFlags = { ...DEFAULT_SYSTEM_FLAGS, ...(flags || {}) };
    if (typeof window !== 'undefined') {
      window.__SYSTEM_FLAGS__ = mergedFlags;
    }
    return mergedFlags;
  } catch (error) {
    console.warn('[getSystemFlags] Falha ao carregar flags, usando defaults:', error);
    const fallback = { ...DEFAULT_SYSTEM_FLAGS };
    if (typeof window !== 'undefined') {
      window.__SYSTEM_FLAGS__ = fallback;
    }
    return fallback;
  }
}

/**
 * Salva feature flags de sistema em settings/system_flags.
 * @param {object} flags
 * @returns {Promise<object>}
 */
export async function saveSystemFlags(flags = {}) {
  const user = auth.currentUser;
  const normalizedFlags = { ...(flags || {}) };

  await db.collection(SYSTEM_FLAGS_DOC_PATH.collection).doc(SYSTEM_FLAGS_DOC_PATH.docId).set({
    ...normalizedFlags,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: user?.email || user?.uid || 'sistema'
  }, { merge: true });

  cacheService.invalidate('system_flags');
  return getSystemFlags({ forceRefresh: true });
}

/**
 * Obtém as configurações globais do dashboard (por exemplo, visibilidade de KPIs)
 * Doc: settings/dashboard { kpiVisibility: { [type]: boolean }, updatedAt, updatedBy }
 * @returns {Promise<object>} Objeto de configurações ou {}
 */
export async function getDashboardSettings() {
  try {
    const doc = await db.collection('settings').doc('dashboard').get();
    if (!doc.exists) return {};
    return doc.data() || {};
  } catch (error) {
    console.error('Erro ao carregar configurações do dashboard:', error);
    return {};
  }
}

/**
 * Salva configurações do dashboard (requer administrador via regras do Firestore)
 * @param {object} settings - Ex.: { kpiVisibility: { [type]: boolean } }
 * @returns {Promise<void>}
 */
export async function saveDashboardSettings(settings) {
  try {
    const user = auth.currentUser;
    await db.collection('settings').doc('dashboard').set({
      ...(settings || {}),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: user?.email || 'sistema'
    }, { merge: true });
  } catch (error) {
    console.error('Erro ao salvar configurações do dashboard:', error);
    throw error;
  }
}

/**
 * Verifica se o utilizador atual possui a permissão admin via custom claims
 * @returns {Promise<boolean>}
 */
export async function isCurrentUserAdmin() {
  try {
    const user = auth.currentUser;
    if (!user) return false;
    const token = await user.getIdTokenResult();
    return !!token?.claims?.admin;
  } catch (error) {
    console.warn('Falha ao verificar claim admin:', error);
    return false;
  }
}

export async function getPasswordPolicyState() {
  try {
    const functions = firebase.app().functions('us-central1');
    const callable = functions.httpsCallable('getPasswordPolicyState');
    const result = await callable();
    return result?.data || null;
  } catch (error) {
    console.error('Erro ao obter estado da política de senha:', error);
    throw error;
  }
}

export async function markPasswordRotationCompleted() {
  try {
    const functions = firebase.app().functions('us-central1');
    const callable = functions.httpsCallable('markPasswordRotationCompleted');
    const result = await callable();
    return result?.data || null;
  } catch (error) {
    console.error('Erro ao marcar rotação de senha como concluída:', error);
    throw error;
  }
}

/**
 * Marca múltiplas notificações como lidas
 * @param {Array<string>} notificationIds - Array de IDs das notificações
 * @returns {Promise<void>}
 */
export async function markNotificationsAsRead(notificationIds) {
    try {
        const batch = db.batch();
        
        notificationIds.forEach(id => {
            const docRef = db.collection('notifications').doc(id);
            batch.update(docRef, {
                read: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        
        await batch.commit();
        console.log(` ${notificationIds.length} notificações marcadas como lidas`);
        
    } catch (error) {
        console.error(' Erro ao marcar notificações como lidas:', error);
        throw error;
    }
}

/**
 * Remove notificações antigas
 * @param {string} userId - ID do usuário
 * @param {number} daysOld - Idade em dias para considerar "antiga"
 * @returns {Promise<number>} Número de notificações removidas
 */
export async function cleanupOldNotifications(userId, daysOld = 30) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        const snapshot = await db.collection('notifications')
            .where('userId', '==', userId)
            .where('createdAt', '<', firebase.firestore.Timestamp.fromDate(cutoffDate))
            .get();
        
        if (snapshot.empty) {
            return 0;
        }
        
        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        
        console.log(` ${snapshot.size} notificações antigas removidas`);
        return snapshot.size;
        
    } catch (error) {
        console.error(' Erro ao limpar notificações antigas:', error);
        return 0;
    }
}

// ===== GESTÃO DE VENDORS / CONSTRUTORAS (Restaurado 2025-09-20) =====
// Estrutura: coleção 'vendors' com documentos:
// { name, cnpj?, active, empreendimentos:[ { id, nome, blocos:[ { id, nome, apartamentos:[ { id, numero } ] } ] } ], createdAt, updatedAt }
// Motivo: leitura única para autocomplete e modal de processos; volume moderado.

function _genVendorId(){
  return (Date.now().toString(36)+Math.random().toString(36).slice(2,8));
}

export async function getAllVendors(options = {}) {
  if(options.forceRefresh){
    cacheService.invalidate('vendors_all');
  }
  return await cacheService.get(
    'vendors_all',
    async () => {
      try {
        const snap = await db.collection('vendors').where('active','!=',false).get();
        return snap.docs.map(d=>({ id:d.id, ...d.data() }));
      } catch (err){
        console.error('Erro ao carregar vendors:', err);
        return [];
      }
    },
    'vendors'
  );
}

export async function createOrUpdateVendor(vendor){
  if(!vendor || !vendor.name) throw new Error('Nome do vendor é obrigatório');
  const now = new Date();
  const user = auth.currentUser;
  // Histórico de alterações
  let history = Array.isArray(vendor.history) ? vendor.history : [];
  history.push({ date: now, user: user?.email || 'sistema', action: vendor.id ? 'update' : 'create' });
  const data = {
    name: vendor.name,
    cnpj: vendor.cnpj || null,
    email: vendor.email || null,
    telefone: vendor.telefone || null,
    endereco: vendor.endereco || null,
    observacoes: vendor.observacoes || null,
    active: vendor.active !== false,
    empreendimentos: Array.isArray(vendor.empreendimentos) ? vendor.empreendimentos : [],
    history,
    updatedAt: now,
    updatedBy: user?.email || 'sistema'
  };
  let ref;
  if(vendor.id){
    ref = db.collection('vendors').doc(vendor.id);
    await ref.set(data,{ merge:true });
  } else {
    data.createdAt = now;
    ref = await db.collection('vendors').add(data);
  }
  cacheService.invalidate('vendors_all');
  return { id: ref.id, ...data };
}

function sanitizeVendorEmpreendimentoDefaults(defaults = {}) {
  const normalize = (value) => (typeof value === 'string' ? value.trim() : '');
  const normalizeUpper = (value) => normalize(value).toUpperCase();
  return {
    cartorioPadrao: normalize(
      defaults.cartorioPadrao || defaults.cartorio || defaults.cartorioRegistroPadrao
    ),
    agenciaPadrao: normalize(
      defaults.agenciaPadrao || defaults.agencia || defaults.agenciaCefPadrao
    ),
    codigoCCAPadrao: normalizeUpper(
      defaults.codigoCCAPadrao || defaults.codigoCCA || defaults.ccaCodigo
    ),
  };
}

export async function addEmpreendimentoToVendor(vendorId, nome, defaults = {}){
  if(!vendorId || !nome) throw new Error('Vendor e nome de empreendimento são obrigatórios');
  const normalizedDefaults = sanitizeVendorEmpreendimentoDefaults(defaults);
  const ref = db.collection('vendors').doc(vendorId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if(!snap.exists) throw new Error('Vendor não encontrado');
    const data = snap.data();
    const empreendimentos = Array.isArray(data.empreendimentos)? [...data.empreendimentos]:[];
    const empreendimentoData = { id:_genVendorId(), nome, blocos:[] };
    if (normalizedDefaults.cartorioPadrao) {
      empreendimentoData.cartorioPadrao = normalizedDefaults.cartorioPadrao;
    }
    if (normalizedDefaults.agenciaPadrao) {
      empreendimentoData.agenciaPadrao = normalizedDefaults.agenciaPadrao;
    }
    if (normalizedDefaults.codigoCCAPadrao) {
      empreendimentoData.codigoCCAPadrao = normalizedDefaults.codigoCCAPadrao;
    }
    empreendimentos.push(empreendimentoData);
    tx.update(ref,{ empreendimentos, updatedAt:new Date() });
  });
  cacheService.invalidate('vendors_all');
  return true;
}

export async function addBlocoToEmpreendimento(vendorId, empreendimentoId, nome){
  const ref = db.collection('vendors').doc(vendorId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if(!snap.exists) throw new Error('Vendor não encontrado');
    const data = snap.data();
    const empreendimentos = (data.empreendimentos||[]).map(emp => {
      if(emp.id === empreendimentoId){
        const blocos = Array.isArray(emp.blocos)? [...emp.blocos]:[];
        blocos.push({ id:_genVendorId(), nome, apartamentos:[] });
        return { ...emp, blocos };
      }
      return emp;
    });
    tx.update(ref,{ empreendimentos, updatedAt:new Date() });
  });
  cacheService.invalidate('vendors_all');
  return true;
}

export async function addApartamento(vendorId, empreendimentoId, blocoId, numero){
  const ref = db.collection('vendors').doc(vendorId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if(!snap.exists) throw new Error('Vendor não encontrado');
    const data = snap.data();
    const empreendimentos = (data.empreendimentos||[]).map(emp => {
      if(emp.id === empreendimentoId){
        const blocos = (emp.blocos||[]).map(bl => {
          if(bl.id === blocoId){
            const apartamentos = Array.isArray(bl.apartamentos)? [...bl.apartamentos]:[];
            apartamentos.push({ id:_genVendorId(), numero });
            return { ...bl, apartamentos };
          }
          return bl;
        });
        return { ...emp, blocos };
      }
      return emp;
    });
    tx.update(ref,{ empreendimentos, updatedAt:new Date() });
  });
  cacheService.invalidate('vendors_all');
  return true;
}

export async function patchVendor(vendorId, patch){
  await db.collection('vendors').doc(vendorId).set({ ...patch, updatedAt:new Date() }, { merge:true });
  cacheService.invalidate('vendors_all');
  return true;
}

/**
 * Exclui uma construtora (vendor) do sistema.
 * @param {string} vendorId - ID da construtora a ser excluída
 * @param {boolean} force - Se true, exclui mesmo se houver processos vinculados
 * @returns {Promise<{success: boolean, message: string, contractsCount?: number}>}
 */
export async function deleteVendor(vendorId, force = false) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado.");
  if (!vendorId) throw new Error("ID da construtora é obrigatório.");
  
  try {
    // Busca o vendor para obter o nome
    const vendorDoc = await db.collection('vendors').doc(vendorId).get();
    if (!vendorDoc.exists) {
      return { success: false, message: 'Construtora não encontrada.' };
    }
    
    const vendorData = vendorDoc.data();
    const vendorName = vendorData.name;
    
    // Verifica se há processos vinculados
    const contractsSnap = await contractsCollection
      .where('vendedorConstrutora', '==', vendorName)
      .limit(1)
      .get();
    
    if (!contractsSnap.empty && !force) {
      // Conta total de processos
      const countSnap = await contractsCollection
        .where('vendedorConstrutora', '==', vendorName)
        .get();
      return { 
        success: false, 
        message: `Construtora possui ${countSnap.size} processo(s) vinculado(s). Use exclusão forçada para remover.`,
        contractsCount: countSnap.size
      };
    }
    
    // Exclui o vendor
    await db.collection('vendors').doc(vendorId).delete();
    
    // Invalida cache
    cacheService.invalidate('vendors_all');
    
    return { success: true, message: `Construtora "${vendorName}" excluída com sucesso.` };
  } catch (err) {
    console.error('Erro ao excluir construtora:', err);
    throw err;
  }
}

/**
 * Remove um empreendimento de uma construtora.
 * @param {string} vendorId - ID da construtora
 * @param {string} empreendimentoId - ID do empreendimento a ser removido
 * @param {boolean} force - Se true, remove mesmo se houver processos vinculados
 * @returns {Promise<{success: boolean, message: string, contractsCount?: number}>}
 */
export async function deleteEmpreendimento(vendorId, empreendimentoId, force = false) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado.");
  if (!vendorId || !empreendimentoId) throw new Error("IDs são obrigatórios.");
  
  try {
    // Busca o vendor
    const vendorDoc = await db.collection('vendors').doc(vendorId).get();
    if (!vendorDoc.exists) {
      return { success: false, message: 'Construtora não encontrada.' };
    }
    
    const vendorData = vendorDoc.data();
    const vendorName = vendorData.name;
    const empreendimentos = vendorData.empreendimentos || [];
    
    // Encontra o empreendimento
    const empIndex = empreendimentos.findIndex(e => e.id === empreendimentoId);
    if (empIndex === -1) {
      return { success: false, message: 'Empreendimento não encontrado.' };
    }
    
    const empName = empreendimentos[empIndex].nome;
    
    // Verifica se há processos vinculados
    if (!force) {
      const contractsSnap = await contractsCollection
        .where('vendedorConstrutora', '==', vendorName)
        .where('empreendimento', '==', empName)
        .limit(1)
        .get();
      
      if (!contractsSnap.empty) {
        // Conta total
        const countSnap = await contractsCollection
          .where('vendedorConstrutora', '==', vendorName)
          .where('empreendimento', '==', empName)
          .get();
        return { 
          success: false, 
          message: `Empreendimento possui ${countSnap.size} processo(s) vinculado(s). Use exclusão forçada.`,
          contractsCount: countSnap.size
        };
      }
    }
    
    // Remove o empreendimento do array
    empreendimentos.splice(empIndex, 1);
    
    // Atualiza o vendor
    await db.collection('vendors').doc(vendorId).update({
      empreendimentos,
      updatedAt: new Date(),
      updatedBy: user.email
    });
    
    // Invalida cache
    cacheService.invalidate('vendors_all');
    
    return { success: true, message: `Empreendimento "${empName}" removido com sucesso.` };
  } catch (err) {
    console.error('Erro ao excluir empreendimento:', err);
    throw err;
  }
}

/**
 * Remove um bloco de um empreendimento.
 * @param {string} vendorId - ID da construtora
 * @param {string} empreendimentoId - ID do empreendimento
 * @param {string} blocoId - ID do bloco a ser removido
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function deleteBloco(vendorId, empreendimentoId, blocoId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado.");
  
  try {
    const vendorDoc = await db.collection('vendors').doc(vendorId).get();
    if (!vendorDoc.exists) {
      return { success: false, message: 'Construtora não encontrada.' };
    }
    
    const vendorData = vendorDoc.data();
    const empreendimentos = vendorData.empreendimentos || [];
    
    const empIndex = empreendimentos.findIndex(e => e.id === empreendimentoId);
    if (empIndex === -1) {
      return { success: false, message: 'Empreendimento não encontrado.' };
    }
    
    const blocos = empreendimentos[empIndex].blocos || [];
    const blocoIndex = blocos.findIndex(b => b.id === blocoId);
    if (blocoIndex === -1) {
      return { success: false, message: 'Bloco não encontrado.' };
    }
    
    const blocoName = blocos[blocoIndex].nome;
    blocos.splice(blocoIndex, 1);
    empreendimentos[empIndex].blocos = blocos;
    
    await db.collection('vendors').doc(vendorId).update({
      empreendimentos,
      updatedAt: new Date(),
      updatedBy: user.email
    });
    
    cacheService.invalidate('vendors_all');
    
    return { success: true, message: `Bloco "${blocoName}" removido com sucesso.` };
  } catch (err) {
    console.error('Erro ao excluir bloco:', err);
    throw err;
  }
}


/**
 * Normaliza estrutura legada de empreendimentos/blocos/apartamentos em vendors.
 * Converte strings para objetos e garante IDs e campos essenciais.
 * @returns {Promise<{scanned:number, updated:number, warnings:string[]}>}
 */
export async function normalizeVendorsLegacyStructure() {
  const user = auth.currentUser;
  const updatedBy = user?.email || 'sistema';
  const warnings = [];

  const snap = await db.collection('vendors').get();
  const result = { scanned: snap.size, updated: 0, warnings };

  let batch = db.batch();
  let pending = 0;

  const normalizeApartamento = (apto, changedFlag) => {
    if (typeof apto === 'string' || typeof apto === 'number') {
      changedFlag.changed = true;
      return { id: _genVendorId(), numero: String(apto) };
    }
    if (!apto || typeof apto !== 'object') {
      changedFlag.changed = true;
      warnings.push('Apartamento invalido ignorado.');
      return null;
    }
    let numero = apto.numero;
    if (numero === undefined || numero === null) {
      if (apto.num !== undefined && apto.num !== null) {
        numero = apto.num;
        changedFlag.changed = true;
      } else if (apto.apto !== undefined && apto.apto !== null) {
        numero = apto.apto;
        changedFlag.changed = true;
      } else if (apto.name !== undefined && apto.name !== null) {
        numero = apto.name;
        changedFlag.changed = true;
      } else {
        numero = '';
        changedFlag.changed = true;
      }
    }
    let id = apto.id || apto._id;
    if (!id) {
      id = _genVendorId();
      changedFlag.changed = true;
    }
    return { ...apto, id, numero: String(numero) };
  };

  const normalizeBloco = (bloco, changedFlag) => {
    if (typeof bloco === 'string' || typeof bloco === 'number') {
      changedFlag.changed = true;
      return { id: _genVendorId(), nome: String(bloco), apartamentos: [] };
    }
    if (!bloco || typeof bloco !== 'object') {
      changedFlag.changed = true;
      warnings.push('Bloco invalido ignorado.');
      return null;
    }
    let nome = bloco.nome;
    if (nome === undefined || nome === null) {
      if (bloco.name !== undefined && bloco.name !== null) {
        nome = bloco.name;
        changedFlag.changed = true;
      } else if (bloco.bloco !== undefined && bloco.bloco !== null) {
        nome = bloco.bloco;
        changedFlag.changed = true;
      } else {
        nome = '';
        changedFlag.changed = true;
      }
    }
    let id = bloco.id || bloco._id;
    if (!id) {
      id = _genVendorId();
      changedFlag.changed = true;
    }
    let apartamentos = [];
    if (Array.isArray(bloco.apartamentos)) {
      apartamentos = bloco.apartamentos
        .map(apto => normalizeApartamento(apto, changedFlag))
        .filter(Boolean);
    } else if (bloco.apartamentos !== undefined && bloco.apartamentos !== null) {
      changedFlag.changed = true;
    }
    return { ...bloco, id, nome: String(nome), apartamentos };
  };

  const normalizeEmpreendimento = (emp, changedFlag) => {
    if (typeof emp === 'string' || typeof emp === 'number') {
      changedFlag.changed = true;
      return { id: _genVendorId(), nome: String(emp), blocos: [] };
    }
    if (!emp || typeof emp !== 'object') {
      changedFlag.changed = true;
      warnings.push('Empreendimento invalido ignorado.');
      return null;
    }
    let nome = emp.nome;
    if (nome === undefined || nome === null) {
      if (emp.name !== undefined && emp.name !== null) {
        nome = emp.name;
        changedFlag.changed = true;
      } else if (emp.empreendimento !== undefined && emp.empreendimento !== null) {
        nome = emp.empreendimento;
        changedFlag.changed = true;
      } else {
        nome = '';
        changedFlag.changed = true;
      }
    }
    let id = emp.id || emp._id;
    if (!id) {
      id = _genVendorId();
      changedFlag.changed = true;
    }
    let blocos = [];
    if (Array.isArray(emp.blocos)) {
      blocos = emp.blocos
        .map(bl => normalizeBloco(bl, changedFlag))
        .filter(Boolean);
    } else if (emp.blocos !== undefined && emp.blocos !== null) {
      changedFlag.changed = true;
    }
    return { ...emp, id, nome: String(nome), blocos };
  };

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const changedFlag = { changed: false };

    let empreendimentos = [];
    if (Array.isArray(data.empreendimentos)) {
      empreendimentos = data.empreendimentos
        .map(emp => normalizeEmpreendimento(emp, changedFlag))
        .filter(Boolean);
    } else if (data.empreendimentos !== undefined && data.empreendimentos !== null) {
      changedFlag.changed = true;
    }

    if (changedFlag.changed) {
      batch.update(doc.ref, {
        empreendimentos,
        updatedAt: new Date(),
        updatedBy
      });
      pending += 1;
      result.updated += 1;
    }

    if (pending >= 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  cacheService.invalidate('vendors_all');
  return result;
}

// Verifica se já existe contrato para combinação vendedorConstrutora + empreendimento + bloco + apto
// Index recomendado: contracts (vendedorConstrutora, empreendimento, bloco, apto)
export async function contractExistsForUnit({ vendedorConstrutora, empreendimento, bloco, apto }) {
  try {
    if(!vendedorConstrutora || !empreendimento || !bloco || !apto) return false;
    let q = contractsCollection
      .where('vendedorConstrutora','==', vendedorConstrutora)
      .where('empreendimento','==', empreendimento)
      .where('bloco','==', bloco)
      .where('apto','==', apto)
      .limit(1);
    const snap = await q.get();
    return !snap.empty;
  } catch (e){
    console.warn('contractExistsForUnit falhou (pode exigir índice composto):', e.message);
    // fallback simples: tentar reduzir condições progressivamente (menos eficiente, usado só em caso de ausência de índice)
    try {
      const snap = await contractsCollection
        .where('vendedorConstrutora','==', vendedorConstrutora)
        .where('empreendimento','==', empreendimento)
        .limit(50).get();
      const found = snap.docs.some(d => {
        const data = d.data();
        return data.bloco === bloco && data.apto === apto;
      });
      return found;
    } catch(err2){
      console.error('Fallback contractExistsForUnit também falhou:', err2.message);
      return false; // não bloqueia criação se verificação falha totalmente
    }
  }
}

/**
 * Sincroniza construtoras automaticamente a partir dos processos ativos.
 * Cria vendors que existem em processos mas não estão cadastrados.
 * Também atualiza vendors existentes com novos empreendimentos, blocos e apartamentos.
 * @param {Object} options - Opções de sincronização
 * @param {boolean} options.updateExisting - Se true, atualiza vendors existentes com novos dados
 * @param {boolean} options.unifyDuplicates - Se true, unifica duplicatas case-insensitive
 * @returns {Promise<{created: number, updated: number, existing: number, details: Object, errors: string[]}>}
 */
export async function syncVendorsFromContracts(options = {}) {
  const { updateExisting = true } = options;
  const user = auth.currentUser;
  const now = new Date();
  
  try {
    console.log('[syncVendorsFromContracts] Iniciando sincronização completa...');
    
    // 1. Busca todos os contratos para extrair dados
    const contractsSnap = await contractsCollection.get();
    console.log(`[syncVendorsFromContracts] ${contractsSnap.size} processos encontrados`);
    
    // Estrutura: vendorName (normalizado) -> { original: string, empreendimentos: Map }
    // empreendimentos: empName -> { blocos: Map }
    // blocos: blocoName -> { apartamentos: Set }
    const vendorMap = new Map();
    
    contractsSnap.docs.forEach(doc => {
      const data = doc.data();
      const vendorName = (data.vendedorConstrutora || '').trim();
      const empName = (data.empreendimento || '').trim();
      const blocoName = (data.bloco || '').trim();
      const aptoNum = (data.apto || '').trim();
      
      if (!vendorName) return;
      
      // Normaliza para evitar duplicatas
      const vendorKey = vendorName.toUpperCase();
      
      if (!vendorMap.has(vendorKey)) {
        vendorMap.set(vendorKey, {
          original: vendorName, // Mantém o primeiro encontrado como referência
          variants: new Set([vendorName]), // Guarda todas as variantes
          empreendimentos: new Map(),
          contractCount: 0
        });
      }
      
      const vendorEntry = vendorMap.get(vendorKey);
      vendorEntry.variants.add(vendorName);
      vendorEntry.contractCount++;
      
      // Se o nome atual tem mais contratos, usa como principal
      // (preferência para MAIÚSCULAS)
      if (vendorName === vendorName.toUpperCase()) {
        vendorEntry.original = vendorName;
      }
      
      if (!empName) return;
      
      const empKey = empName.toUpperCase();
      if (!vendorEntry.empreendimentos.has(empKey)) {
        vendorEntry.empreendimentos.set(empKey, {
          original: empName,
          variants: new Set([empName]),
          blocos: new Map()
        });
      }
      
      const empEntry = vendorEntry.empreendimentos.get(empKey);
      empEntry.variants.add(empName);
      
      if (!blocoName) return;
      
      const blocoKey = blocoName.toUpperCase();
      if (!empEntry.blocos.has(blocoKey)) {
        empEntry.blocos.set(blocoKey, {
          original: blocoName,
          apartamentos: new Set()
        });
      }
      
      const blocoEntry = empEntry.blocos.get(blocoKey);
      
      if (aptoNum) {
        blocoEntry.apartamentos.add(aptoNum);
      }
    });
    
    console.log(`[syncVendorsFromContracts] ${vendorMap.size} construtoras únicas encontradas`);
    
    // 2. Busca vendors existentes
    const existingVendorsSnap = await db.collection('vendors').get();
    const existingVendors = new Map(); // nome normalizado -> { doc, data }
    
    existingVendorsSnap.docs.forEach(doc => {
      const data = doc.data();
      const name = (data.name || '').trim();
      const key = name.toUpperCase();
      existingVendors.set(key, { doc, data, id: doc.id });
    });
    
    console.log(`[syncVendorsFromContracts] ${existingVendors.size} construtoras já cadastradas`);
    
    // 3. Processa cada vendor
    let created = 0;
    let updated = 0;
    let existing = 0;
    const errors = [];
    const details = {
      newVendors: [],
      updatedVendors: [],
      newEmpreendimentos: 0,
      newBlocos: 0,
      newApartamentos: 0
    };
    
    for (const [vendorKey, vendorInfo] of vendorMap) {
      const existingVendor = existingVendors.get(vendorKey);
      
      if (existingVendor) {
        // Vendor já existe - verificar se precisa atualizar
        if (!updateExisting) {
          existing++;
          continue;
        }
        
        try {
          const currentEmps = existingVendor.data.empreendimentos || [];
          const currentEmpsMap = new Map();
          
          // Mapeia empreendimentos existentes
          currentEmps.forEach(emp => {
            const key = (emp.nome || '').toUpperCase();
            currentEmpsMap.set(key, emp);
          });
          
          let hasChanges = false;
          const updatedEmps = [...currentEmps];
          
          // Adiciona novos empreendimentos e atualiza existentes
          for (const [empKey, empInfo] of vendorInfo.empreendimentos) {
            const existingEmp = currentEmpsMap.get(empKey);
            
            if (!existingEmp) {
              // Novo empreendimento
              const newEmp = {
                id: _genVendorId(),
                nome: empInfo.original,
                blocos: []
              };
              
              // Adiciona blocos
              for (const [, blocoInfo] of empInfo.blocos) {
                const newBloco = {
                  id: _genVendorId(),
                  nome: blocoInfo.original,
                  apartamentos: Array.from(blocoInfo.apartamentos).map(num => ({
                    id: _genVendorId(),
                    numero: num
                  }))
                };
                newEmp.blocos.push(newBloco);
                details.newBlocos++;
                details.newApartamentos += newBloco.apartamentos.length;
              }
              
              updatedEmps.push(newEmp);
              details.newEmpreendimentos++;
              hasChanges = true;
            } else {
              // Empreendimento existente - verifica blocos
              const existingBlocosMap = new Map();
              (existingEmp.blocos || []).forEach(b => {
                existingBlocosMap.set((b.nome || '').toUpperCase(), b);
              });
              
              for (const [blocoKey, blocoInfo] of empInfo.blocos) {
                const existingBloco = existingBlocosMap.get(blocoKey);
                
                if (!existingBloco) {
                  // Novo bloco
                  const newBloco = {
                    id: _genVendorId(),
                    nome: blocoInfo.original,
                    apartamentos: Array.from(blocoInfo.apartamentos).map(num => ({
                      id: _genVendorId(),
                      numero: num
                    }))
                  };
                  
                  // Encontra o empreendimento e adiciona o bloco
                  const empIndex = updatedEmps.findIndex(e => 
                    (e.nome || '').toUpperCase() === empKey
                  );
                  if (empIndex >= 0) {
                    if (!updatedEmps[empIndex].blocos) {
                      updatedEmps[empIndex].blocos = [];
                    }
                    updatedEmps[empIndex].blocos.push(newBloco);
                    details.newBlocos++;
                    details.newApartamentos += newBloco.apartamentos.length;
                    hasChanges = true;
                  }
                } else {
                  // Bloco existente - verifica apartamentos
                  const existingAptos = new Set(
                    (existingBloco.apartamentos || []).map(a => a.numero)
                  );
                  
                  const newAptos = Array.from(blocoInfo.apartamentos)
                    .filter(num => !existingAptos.has(num));
                  
                  if (newAptos.length > 0) {
                    // Encontra o bloco e adiciona apartamentos
                    const empIndex = updatedEmps.findIndex(e => 
                      (e.nome || '').toUpperCase() === empKey
                    );
                    if (empIndex >= 0) {
                      const blocoIndex = (updatedEmps[empIndex].blocos || [])
                        .findIndex(b => (b.nome || '').toUpperCase() === blocoKey);
                      
                      if (blocoIndex >= 0) {
                        if (!updatedEmps[empIndex].blocos[blocoIndex].apartamentos) {
                          updatedEmps[empIndex].blocos[blocoIndex].apartamentos = [];
                        }
                        newAptos.forEach(num => {
                          updatedEmps[empIndex].blocos[blocoIndex].apartamentos.push({
                            id: _genVendorId(),
                            numero: num
                          });
                          details.newApartamentos++;
                        });
                        hasChanges = true;
                      }
                    }
                  }
                }
              }
            }
          }
          
          if (hasChanges) {
            await db.collection('vendors').doc(existingVendor.id).update({
              empreendimentos: updatedEmps,
              updatedAt: now,
              updatedBy: user?.email || 'sistema',
              history: firebase.firestore.FieldValue.arrayUnion({
                date: now,
                user: user?.email || 'sistema',
                action: 'auto-sync'
              })
            });
            updated++;
            details.updatedVendors.push(vendorInfo.original);
          } else {
            existing++;
          }
        } catch (err) {
          errors.push(`Erro ao atualizar vendor "${vendorInfo.original}": ${err.message}`);
        }
      } else {
        // Vendor não existe - criar
        try {
          const empreendimentos = [];
          
          for (const [, empInfo] of vendorInfo.empreendimentos) {
            const blocos = [];

            for (const [, blocoInfo] of empInfo.blocos) {
              blocos.push({
                id: _genVendorId(),
                nome: blocoInfo.original,
                apartamentos: Array.from(blocoInfo.apartamentos).map(num => ({
                  id: _genVendorId(),
                  numero: num
                }))
              });
              details.newBlocos++;
              details.newApartamentos += blocoInfo.apartamentos.size;
            }
            
            empreendimentos.push({
              id: _genVendorId(),
              nome: empInfo.original,
              blocos
            });
            details.newEmpreendimentos++;
          }
          
          await db.collection('vendors').add({
            name: vendorInfo.original,
            cnpj: null,
            email: null,
            telefone: null,
            endereco: null,
            observacoes: `Criado automaticamente a partir de ${vendorInfo.contractCount} processo(s)`,
            active: true,
            empreendimentos,
            history: [{ date: now, user: user?.email || 'sistema', action: 'auto-create' }],
            createdAt: now,
            updatedAt: now,
            updatedBy: user?.email || 'sistema'
          });
          created++;
          details.newVendors.push(vendorInfo.original);
        } catch (err) {
          errors.push(`Erro ao criar vendor "${vendorInfo.original}": ${err.message}`);
        }
      }
    }
    
    // 4. Invalida cache
    cacheService.invalidate('vendors_all');
    
    console.log(`[syncVendorsFromContracts] Concluído: ${created} criados, ${updated} atualizados, ${existing} sem alterações`);
    
    return { created, updated, existing, details, errors };
  } catch (err) {
    console.error('Erro ao sincronizar vendors:', err);
    throw err;
  }
}

/**
 * Atualiza o nome da construtora em todos os processos que a utilizam.
 * @param {string} oldName - Nome antigo da construtora
 * @param {string} newName - Novo nome da construtora
 * @returns {Promise<{updated: number, errors: string[]}>}
 */
export async function updateVendorNameInContracts(oldName, newName) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado.");
  if (!oldName || !newName) throw new Error("Nome antigo e novo são obrigatórios.");
  if (oldName.trim().toLowerCase() === newName.trim().toLowerCase()) return { updated: 0, errors: [] };
  
  try {
    const oldNameTrimmed = oldName.trim();
    const oldNameLower = oldNameTrimmed.toLowerCase();
    const newNameTrimmed = newName.trim();
    
    // Busca todos os contratos com a construtora antiga (exact match)
    let snap = await contractsCollection
      .where('vendedorConstrutora', '==', oldNameTrimmed)
      .get();
    
    // Se não encontrou, tenta buscar case-insensitive
    // (busca todos os contratos com vendedorConstrutora definido e filtra)
    if (snap.empty) {
      if (window.__DEBUG__) console.log(`[updateVendorNameInContracts] Busca exata vazia, tentando case-insensitive para "${oldNameTrimmed}"`);
      
      // Busca todos os contratos que têm vendedorConstrutora definido
      const allSnap = await contractsCollection
        .where('vendedorConstrutora', '!=', '')
        .get();
      
      // Filtra case-insensitive
      const matchingDocs = allSnap.docs.filter(doc => {
        const vendedor = doc.data().vendedorConstrutora || '';
        return vendedor.toLowerCase() === oldNameLower;
      });
      
      if (matchingDocs.length === 0) {
        if (window.__DEBUG__) console.log(`[updateVendorNameInContracts] Nenhum processo encontrado para "${oldNameTrimmed}"`);
        return { updated: 0, errors: [] };
      }
      
      // Cria um objeto com estrutura similar ao snap
      snap = { docs: matchingDocs, empty: false };
    }
    
    if (window.__DEBUG__) console.log(`[updateVendorNameInContracts] Encontrados ${snap.docs.length} processos para atualizar`);
    
    const timestamp = new Date();
    let updated = 0;
    const errors = [];
    
    // Processa em batches de 250 (cada doc gera 2 operações: update + log)
    const BATCH_SIZE = 250;
    const batches = [];
    let currentBatch = db.batch();
    let operationsInBatch = 0;
    
    snap.docs.forEach(doc => {
      try {
        const docRef = contractsCollection.doc(doc.id);
        const originalVendorName = doc.data().vendedorConstrutora;
        
        // Atualiza o contrato
        currentBatch.update(docRef, {
          vendedorConstrutora: newNameTrimmed,
          modificadoPor: user.email,
          dataModificacao: timestamp
        });
        operationsInBatch++;
        
        // Cria log de alteração
        const logEntry = {
          alteradoPor: user.email,
          alteradoEm: timestamp,
          mudancas: [{
            campo: 'vendedorConstrutora',
            de: originalVendorName,
            para: newNameTrimmed
          }]
        };
        const logRef = docRef.collection('historico').doc();
        currentBatch.set(logRef, logEntry);
        operationsInBatch++;
        
        updated++;
        
        // Se atingiu o limite, cria novo batch
        if (operationsInBatch >= BATCH_SIZE * 2) {
          batches.push(currentBatch);
          currentBatch = db.batch();
          operationsInBatch = 0;
        }
      } catch (err) {
        errors.push(`Erro ao atualizar contrato ${doc.id}: ${err.message}`);
      }
    });
    
    // Adiciona último batch se tiver operações
    if (operationsInBatch > 0) {
      batches.push(currentBatch);
    }
    
    // Executa todos os batches
    for (const batch of batches) {
      await batch.commit();
    }
    
    if (window.__DEBUG__) console.log(`[updateVendorNameInContracts] ${updated} processos atualizados com sucesso`);
    
    // Invalida caches
    cacheService.invalidateByPattern(/^contracts/);
    cacheService.invalidateByPattern(/^dashboard/);
    paginationService.invalidateCache('contracts');
    
    return { updated, errors };
  } catch (err) {
    console.error('Erro ao atualizar nome da construtora nos contratos:', err);
    throw err;
  }
}

/**
 * Atualiza o nome do empreendimento em todos os processos que o utilizam.
 * @param {string} vendorName - Nome da construtora (para filtrar)
 * @param {string} oldEmpName - Nome antigo do empreendimento
 * @param {string} newEmpName - Novo nome do empreendimento
 * @returns {Promise<{updated: number, errors: string[]}>}
 */
export async function updateEmpreendimentoNameInContracts(vendorName, oldEmpName, newEmpName) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado.");
  if (!vendorName || !oldEmpName || !newEmpName) throw new Error("Construtora, nome antigo e novo do empreendimento são obrigatórios.");
  if (oldEmpName.trim().toLowerCase() === newEmpName.trim().toLowerCase()) return { updated: 0, errors: [] };
  
  try {
    const vendorNameTrimmed = vendorName.trim();
    const vendorNameLower = vendorNameTrimmed.toLowerCase();
    const oldEmpTrimmed = oldEmpName.trim();
    const oldEmpLower = oldEmpTrimmed.toLowerCase();
    const newEmpTrimmed = newEmpName.trim();
    
    // Tenta busca exata primeiro
    let snap = await contractsCollection
      .where('vendedorConstrutora', '==', vendorNameTrimmed)
      .where('empreendimento', '==', oldEmpTrimmed)
      .get();
    
    // Se não encontrou, tenta case-insensitive
    if (snap.empty) {
      if (window.__DEBUG__) console.log(`[updateEmpreendimentoNameInContracts] Busca exata vazia, tentando case-insensitive`);
      
      // Busca todos os contratos com empreendimento definido
      const allSnap = await contractsCollection
        .where('empreendimento', '!=', '')
        .get();
      
      // Filtra case-insensitive para vendor e empreendimento
      const matchingDocs = allSnap.docs.filter(doc => {
        const data = doc.data();
        const vendedor = (data.vendedorConstrutora || '').toLowerCase();
        const emp = (data.empreendimento || '').toLowerCase();
        return vendedor === vendorNameLower && emp === oldEmpLower;
      });
      
      if (matchingDocs.length === 0) {
        return { updated: 0, errors: [] };
      }
      
      snap = { docs: matchingDocs, empty: false };
    }
    
    if (window.__DEBUG__) console.log(`[updateEmpreendimentoNameInContracts] Encontrados ${snap.docs.length} processos para atualizar`);
    
    const timestamp = new Date();
    let updated = 0;
    const errors = [];
    
    // Processa em batches de 250
    const BATCH_SIZE = 250;
    const batches = [];
    let currentBatch = db.batch();
    let operationsInBatch = 0;
    
    snap.docs.forEach(doc => {
      try {
        const docRef = contractsCollection.doc(doc.id);
        const originalEmpName = doc.data().empreendimento;
        
        // Atualiza o contrato
        currentBatch.update(docRef, {
          empreendimento: newEmpTrimmed,
          modificadoPor: user.email,
          dataModificacao: timestamp
        });
        operationsInBatch++;
        
        // Cria log de alteração
        const logEntry = {
          alteradoPor: user.email,
          alteradoEm: timestamp,
          mudancas: [{
            campo: 'empreendimento',
            de: originalEmpName,
            para: newEmpTrimmed
          }]
        };
        const logRef = docRef.collection('historico').doc();
        currentBatch.set(logRef, logEntry);
        operationsInBatch++;
        
        updated++;
        
        if (operationsInBatch >= BATCH_SIZE * 2) {
          batches.push(currentBatch);
          currentBatch = db.batch();
          operationsInBatch = 0;
        }
      } catch (err) {
        errors.push(`Erro ao atualizar contrato ${doc.id}: ${err.message}`);
      }
    });
    
    if (operationsInBatch > 0) {
      batches.push(currentBatch);
    }
    
    for (const batch of batches) {
      await batch.commit();
    }
    
    // Invalida caches
    cacheService.invalidateByPattern(/^contracts/);
    cacheService.invalidateByPattern(/^dashboard/);
    paginationService.invalidateCache('contracts');
    
    return { updated, errors };
  } catch (err) {
    console.error('Erro ao atualizar nome do empreendimento nos contratos:', err);
    throw err;
  }
}

/**
 * Detecta construtoras duplicadas (case-insensitive) no sistema.
 * @returns {Promise<Array<{canonical: string, duplicates: Array<{name: string, count: number, vendorId: string|null}>}>>}
 */
export async function detectDuplicateVendors() {
  try {
    // 1. Busca todos os contratos para contar por construtora
    const contractsSnap = await contractsCollection.get();
    const vendorCounts = new Map(); // nome normalizado -> { variants: Map<original, count> }
    
    contractsSnap.docs.forEach(doc => {
      const data = doc.data();
      const vendorName = (data.vendedorConstrutora || '').trim();
      if (!vendorName) return;
      
      const normalized = vendorName.toUpperCase();
      
      if (!vendorCounts.has(normalized)) {
        vendorCounts.set(normalized, { variants: new Map() });
      }
      
      const entry = vendorCounts.get(normalized);
      entry.variants.set(vendorName, (entry.variants.get(vendorName) || 0) + 1);
    });
    
    // 2. Busca vendors cadastrados
    const vendorsCollection = db.collection('vendors');
    const vendorsSnap = await vendorsCollection.get();
    const vendorDocs = new Map(); // nome -> id
    
    vendorsSnap.docs.forEach(doc => {
      const data = doc.data();
      vendorDocs.set(data.name, doc.id);
    });
    
    // 3. Filtra apenas os que têm duplicatas
    const duplicates = [];
    
    for (const [normalized, entry] of vendorCounts.entries()) {
      if (entry.variants.size > 1) {
        // Tem variantes diferentes!
        const variants = Array.from(entry.variants.entries())
          .map(([name, count]) => ({
            name,
            count,
            vendorId: vendorDocs.get(name) || null
          }))
          .sort((a, b) => b.count - a.count); // Ordena por quantidade (maior primeiro)
        
        duplicates.push({
          canonical: normalized,
          duplicates: variants
        });
      }
    }
    
    return duplicates.sort((a, b) => {
      const totalA = a.duplicates.reduce((sum, d) => sum + d.count, 0);
      const totalB = b.duplicates.reduce((sum, d) => sum + d.count, 0);
      return totalB - totalA;
    });
  } catch (err) {
    console.error('Erro ao detectar construtoras duplicadas:', err);
    throw err;
  }
}

/**
 * Mescla construtoras duplicadas em uma única construtora.
 * @param {string} targetName - Nome final da construtora (normalmente em maiúsculas)
 * @param {string[]} sourceNames - Nomes das construtoras a serem mescladas
 * @returns {Promise<{contractsUpdated: number, vendorsDeleted: number, errors: string[]}>}
 */
export async function mergeVendors(targetName, sourceNames) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado.");
  if (!targetName || !sourceNames || sourceNames.length === 0) {
    throw new Error("Nome alvo e nomes fonte são obrigatórios.");
  }
  
  // Remove o targetName da lista de sources se estiver lá
  const namesToMerge = sourceNames.filter(n => n !== targetName);
  if (namesToMerge.length === 0) {
    return { contractsUpdated: 0, vendorsDeleted: 0, errors: [] };
  }
  
  const timestamp = new Date();
  let contractsUpdated = 0;
  let vendorsDeleted = 0;
  const errors = [];
  
  try {
    // 1. Atualiza todos os contratos das construtoras fonte para o nome alvo
    for (const sourceName of namesToMerge) {
      const snap = await contractsCollection
        .where('vendedorConstrutora', '==', sourceName)
        .get();
      
      if (!snap.empty) {
        // Processa em batches de 500 (limite do Firestore)
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 250) { // 250 docs = 500 ops (update + log)
          const batch = db.batch();
          const chunk = docs.slice(i, i + 250);
          
          for (const doc of chunk) {
            const docRef = contractsCollection.doc(doc.id);
            
            // Atualiza o contrato
            batch.update(docRef, {
              vendedorConstrutora: targetName,
              modificadoPor: user.email,
              dataModificacao: timestamp
            });
            
            // Cria log de alteração
            const logEntry = {
              alteradoPor: user.email,
              alteradoEm: timestamp,
              mudancas: [{
                campo: 'vendedorConstrutora',
                de: sourceName,
                para: targetName,
                motivo: 'Unificação de construtoras duplicadas'
              }]
            };
            const logRef = docRef.collection('historico').doc();
            batch.set(logRef, logEntry);
            
            contractsUpdated++;
          }
          
          await batch.commit();
        }
      }
    }
    
    // 2. Mescla vendors cadastrados (se existirem)
    const vendorsCollection = db.collection('vendors');
    
    // Busca o vendor alvo (ou cria se não existir)
    const targetSnap = await vendorsCollection.where('name', '==', targetName).get();
    let targetVendorRef;
    let targetEmpreendimentos = [];
    
    if (targetSnap.empty) {
      // Cria o vendor alvo
      targetVendorRef = vendorsCollection.doc();
      await targetVendorRef.set({
        name: targetName,
        active: true,
        empreendimentos: [],
        history: [{ date: timestamp, user: user.email, action: 'merge-create' }],
        createdAt: timestamp,
        updatedAt: timestamp,
        updatedBy: user.email
      });
    } else {
      targetVendorRef = targetSnap.docs[0].ref;
      targetEmpreendimentos = targetSnap.docs[0].data().empreendimentos || [];
    }
    
    // Mescla empreendimentos dos vendors fonte
    for (const sourceName of namesToMerge) {
      const sourceSnap = await vendorsCollection.where('name', '==', sourceName).get();
      
      if (!sourceSnap.empty) {
        const sourceDoc = sourceSnap.docs[0];
        const sourceData = sourceDoc.data();
        const sourceEmps = sourceData.empreendimentos || [];
        
        // Adiciona empreendimentos únicos ao alvo
        for (const emp of sourceEmps) {
          const exists = targetEmpreendimentos.some(
            e => e.nome.toUpperCase() === emp.nome.toUpperCase()
          );
          if (!exists) {
            targetEmpreendimentos.push(emp);
          }
        }
        
        // Deleta o vendor fonte
        await sourceDoc.ref.delete();
        vendorsDeleted++;
      }
    }
    
    // Atualiza o vendor alvo com os empreendimentos mesclados
    await targetVendorRef.update({
      empreendimentos: targetEmpreendimentos,
      updatedAt: timestamp,
      updatedBy: user.email,
      history: firebase.firestore.FieldValue.arrayUnion({
        date: timestamp,
        user: user.email,
        action: 'merge',
        merged: namesToMerge
      })
    });
    
    // 3. Invalida caches
    cacheService.invalidate('vendors_all');
    cacheService.invalidateByPattern(/^contracts/);
    cacheService.invalidateByPattern(/^dashboard/);
    paginationService.invalidateCache('contracts');
    
    return { contractsUpdated, vendorsDeleted, errors };
  } catch (err) {
    console.error('Erro ao mesclar construtoras:', err);
    throw err;
  }
}

/**
 * Executa a unificação de todas as construtoras duplicadas detectadas.
 * Para cada grupo de duplicatas, usa a variante com mais processos como alvo.
 * @returns {Promise<{totalMerged: number, totalContractsUpdated: number, totalVendorsDeleted: number, groups: Array}>}
 */
export async function unifyAllDuplicateVendors() {
  const duplicates = await detectDuplicateVendors();
  
  if (duplicates.length === 0) {
    return { totalMerged: 0, totalContractsUpdated: 0, totalVendorsDeleted: 0, groups: [] };
  }
  
  let totalContractsUpdated = 0;
  let totalVendorsDeleted = 0;
  const groups = [];
  
  for (const group of duplicates) {
    // A primeira variante (com mais processos) será o alvo
    const target = group.duplicates[0].name;
    const sources = group.duplicates.slice(1).map(d => d.name);
    
    try {
      const result = await mergeVendors(target, sources);
      totalContractsUpdated += result.contractsUpdated;
      totalVendorsDeleted += result.vendorsDeleted;
      
      groups.push({
        target,
        merged: sources,
        contractsUpdated: result.contractsUpdated,
        vendorsDeleted: result.vendorsDeleted,
        status: 'success'
      });
    } catch (err) {
      groups.push({
        target,
        merged: sources,
        status: 'error',
        error: err.message
      });
    }
  }
  
  return {
    totalMerged: groups.filter(g => g.status === 'success').length,
    totalContractsUpdated,
    totalVendorsDeleted,
    groups
  };
}

// Export default para compatibilidade com imports que esperam firestoreService
export const firestoreService = {
    addContract,
    updateContract,
    deleteContract,
    getContractsPage,
    getAllContracts,
    getContractById,
    getContractHistory,
    addContractHistoryEntry,
    getAllUsers,
    getAnalysts,
    getSlaConfigForReports,
    getPendenciasForReports,
    getWhatsappChatsForReports,
    getWhatsappAgentsForReports,
    getWhatsappMetricsCurrent,
    getWhatsappMetricsDailyForReports,
    getUserProfile,
    updateUserProfile,
    createNewUser,
    bulkUpdateContracts,
    setAdminRole,
    toggleUserStatus,
    deleteUser,
    importContractsFromCSV,
    listenForContracts,
    listenForContractsUnfiltered,
    getAllStatusRules,
    getStatusRule,
    saveStatusRule,
    uploadFile,
    getUserNotifications,
    createNotification,
    updateNotification,
    deleteNotification,
    getNewNotifications,
    markNotificationsAsRead,
    cleanupOldNotifications,
    parseAndConvertDate,
  isDateString,
  getDashboardSettings,
  saveDashboardSettings,
    getSystemFlags,
    saveSystemFlags,
    isCurrentUserAdmin,
    getPasswordPolicyState,
    markPasswordRotationCompleted,
    importCsvWithAI,
    importCsvDirectly,
    parseAndNormalizeCsv,
    batchImportContracts,
    normalizeContractRealtimePayload,
    // User filter preferences
    saveUserFilterPreferences,
    loadUserFilterPreferences,
    // status management
    listStatuses,
    createOrUpdateStatus,
    toggleStatusActive,
    deleteStatusConfig,
    getEffectiveStatuses
  ,// vendors management
  getAllVendors,
  createOrUpdateVendor,
  addEmpreendimentoToVendor,
  addBlocoToEmpreendimento,
  addApartamento,
  patchVendor,
  normalizeVendorsLegacyStructure,
  contractExistsForUnit,
  syncVendorsFromContracts,
  updateVendorNameInContracts,
  updateEmpreendimentoNameInContracts,
  // vendors delete
  deleteVendor,
  deleteEmpreendimento,
  deleteBloco,
  // vendors merge/unification
  detectDuplicateVendors,
  mergeVendors,
  unifyAllDuplicateVendors
};
