/**
 * @file conversionMetricsService.js
 * @description Metricas de conversao entre aprovacoes e processos com vinculo por origem e CPF.
 */

const CPF_LENGTH = 11;

function normalizeCpf(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === CPF_LENGTH ? digits : '';
}

function splitCpfCandidates(rawValue) {
  if (rawValue === undefined || rawValue === null) return [];

  if (Array.isArray(rawValue)) {
    return rawValue.flatMap((item) => splitCpfCandidates(item));
  }

  if (typeof rawValue === 'object') {
    if (rawValue && Object.prototype.hasOwnProperty.call(rawValue, 'cpf')) {
      return splitCpfCandidates(rawValue.cpf);
    }
    return [];
  }

  const asString = String(rawValue).trim();
  if (!asString) return [];

  return asString
    .split(/[\s,;|/\\]+/)
    .map((part) => normalizeCpf(part))
    .filter(Boolean);
}

function toDateSafe(value, { endOfDay = false } = {}) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date?.getTime?.()) ? null : date;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsed = new Date(`${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function isDateWithinPeriod(date, startDate, endDate) {
  if (!date) return false;
  if (startDate && date.getTime() < startDate.getTime()) return false;
  if (endDate && date.getTime() > endDate.getTime()) return false;
  return true;
}

function hasCpfIntersection(approvalCpfSet, processCpfSet) {
  if (!approvalCpfSet || !processCpfSet || approvalCpfSet.size === 0 || processCpfSet.size === 0) {
    return false;
  }

  for (const cpf of processCpfSet) {
    if (approvalCpfSet.has(cpf)) return true;
  }
  return false;
}

function compareApprovalRecency(a, b) {
  const aDate = a.approvalDate?.getTime?.() || 0;
  const bDate = b.approvalDate?.getTime?.() || 0;

  if (bDate !== aDate) return bDate - aDate;

  const aCreated = a.createdAt?.getTime?.() || 0;
  const bCreated = b.createdAt?.getTime?.() || 0;

  if (bCreated !== aCreated) return bCreated - aCreated;

  return String(a.id || '').localeCompare(String(b.id || ''));
}

function isTemporalMatch(processDate, approvalDate) {
  if (!processDate || !approvalDate) return false;
  return processDate.getTime() >= approvalDate.getTime();
}

function resolveAprovacaoDate(aprovacao, approvalDateField) {
  const field = approvalDateField || 'dataEntrada';
  const candidates = [
    aprovacao?.[field],
    aprovacao?.dataEntrada,
    aprovacao?.entrada,
    aprovacao?.createdAt,
    aprovacao?.criadoEm
  ];

  for (const candidate of candidates) {
    const parsed = toDateSafe(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function resolveProcessDate(processo) {
  const candidates = [
    processo?.createdAt,
    processo?.criadoEm,
    processo?.entrada,
    processo?.dataEntrada
  ];

  for (const candidate of candidates) {
    const parsed = toDateSafe(candidate);
    if (parsed) return parsed;
  }

  return null;
}

export function extractAprovacaoCpfSet(aprovacao = {}) {
  const cpfs = new Set();

  splitCpfCandidates(aprovacao?.compradores).forEach((cpf) => cpfs.add(cpf));
  splitCpfCandidates(aprovacao?.cpfs).forEach((cpf) => cpfs.add(cpf));
  splitCpfCandidates(aprovacao?.cpfPrincipal).forEach((cpf) => cpfs.add(cpf));

  return cpfs;
}

export function extractProcessoCpfSet(processo = {}) {
  const cpfs = new Set();

  splitCpfCandidates(processo?.compradores).forEach((cpf) => cpfs.add(cpf));
  splitCpfCandidates(processo?.cpfPrincipal).forEach((cpf) => cpfs.add(cpf));
  splitCpfCandidates(processo?.comprador_1_cpf).forEach((cpf) => cpfs.add(cpf));
  splitCpfCandidates(processo?.cpf).forEach((cpf) => cpfs.add(cpf));
  splitCpfCandidates(processo?.cpfClientePrincipal).forEach((cpf) => cpfs.add(cpf));

  return cpfs;
}

function normalizeDenominatorMode(denominatorMode) {
  const normalized = String(denominatorMode || 'todas').trim().toLowerCase();
  if (normalized === 'aprovadas') return 'aprovadas';
  return 'todas';
}

function normalizeMatchingMode(matchingMode) {
  const normalized = String(matchingMode || 'cpf_intersection').trim().toLowerCase();
  if (normalized === 'strict_origin_then_cpf') return 'strict_origin_then_cpf';
  return 'cpf_intersection';
}

function isAprovacaoEligibleForDenominator(aprovacao, denominatorMode) {
  if (denominatorMode !== 'aprovadas') return true;
  return String(aprovacao?.situacao || '').toUpperCase() === 'APROVADO';
}

export function computeAprovacaoConversaoMetrics({
  aprovacoes = [],
  processos = [],
  periodStart = null,
  periodEnd = null,
  approvalDateField = 'dataEntrada',
  denominatorMode = 'todas',
  matchingMode = 'cpf_intersection'
} = {}) {
  const normalizedDenominatorMode = normalizeDenominatorMode(denominatorMode);
  const resolvedMatchingMode = normalizeMatchingMode(matchingMode);
  const startDate = toDateSafe(periodStart);
  const endDate = toDateSafe(periodEnd, { endOfDay: true });

  const normalizedApprovals = (Array.isArray(aprovacoes) ? aprovacoes : []).map((aprovacao, index) => {
    const approvalDate = resolveAprovacaoDate(aprovacao, approvalDateField);
    const createdAt = toDateSafe(aprovacao?.createdAt) || toDateSafe(aprovacao?.criadoEm);

    return {
      id: String(aprovacao?.id || `aprovacao-${index}`),
      raw: aprovacao,
      approvalDate,
      createdAt,
      cpfSet: extractAprovacaoCpfSet(aprovacao)
    };
  });

  const approvalsInPeriod = normalizedApprovals.filter((item) =>
    isDateWithinPeriod(item.approvalDate, startDate, endDate)
  );

  const denominatorApprovals = approvalsInPeriod
    .filter((item) => isAprovacaoEligibleForDenominator(item.raw, normalizedDenominatorMode))
    .sort(compareApprovalRecency);

  const approvalById = new Map(denominatorApprovals.map((item) => [item.id, item]));

  const normalizedProcesses = (Array.isArray(processos) ? processos : []).map((processo, index) => {
    const processId = String(processo?.id || `processo-${index}`);
    const processDate = resolveProcessDate(processo);
    const originAprovacao = String(processo?.origemAprovacao || '').trim();

    return {
      id: processId,
      raw: processo,
      processDate,
      originAprovacao,
      cpfSet: extractProcessoCpfSet(processo)
    };
  });

  const processesByOrigin = new Map();
  const processIdsByCpf = new Map();
  const processById = new Map();

  normalizedProcesses.forEach((processItem) => {
    processById.set(processItem.id, processItem);

    if (processItem.originAprovacao) {
      if (!processesByOrigin.has(processItem.originAprovacao)) {
        processesByOrigin.set(processItem.originAprovacao, []);
      }
      processesByOrigin.get(processItem.originAprovacao).push(processItem);
    }

    processItem.cpfSet.forEach((cpf) => {
      if (!processIdsByCpf.has(cpf)) processIdsByCpf.set(cpf, new Set());
      processIdsByCpf.get(cpf).add(processItem.id);
    });
  });

  const matchedApprovals = new Set();
  const matches = [];

  if (resolvedMatchingMode === 'strict_origin_then_cpf') {
    const cpfIndex = new Map();
    denominatorApprovals.forEach((approval) => {
      approval.cpfSet.forEach((cpf) => {
        if (!cpfIndex.has(cpf)) cpfIndex.set(cpf, []);
        cpfIndex.get(cpf).push(approval);
      });
    });

    const matchedProcesses = new Set();

    // Etapa A: vinculo explicito por origemAprovacao
    normalizedProcesses.forEach((processItem) => {
      if (!processItem.originAprovacao || matchedProcesses.has(processItem.id)) return;

      const approval = approvalById.get(processItem.originAprovacao);
      if (!approval || matchedApprovals.has(approval.id)) return;

      matchedApprovals.add(approval.id);
      matchedProcesses.add(processItem.id);
      matches.push({
        approvalId: approval.id,
        processId: processItem.id,
        source: 'origem'
      });
    });

    // Etapa B: fallback por CPF com regra temporal e 1:1
    normalizedProcesses.forEach((processItem) => {
      if (matchedProcesses.has(processItem.id)) return;
      if (!processItem.processDate || processItem.cpfSet.size === 0) return;

      const candidateMap = new Map();

      processItem.cpfSet.forEach((cpf) => {
        const approvalsByCpf = cpfIndex.get(cpf);
        if (!Array.isArray(approvalsByCpf) || approvalsByCpf.length === 0) return;

        approvalsByCpf.forEach((approval) => {
          if (matchedApprovals.has(approval.id)) return;
          if (!isTemporalMatch(processItem.processDate, approval.approvalDate)) return;
          if (!hasCpfIntersection(approval.cpfSet, processItem.cpfSet)) return;
          candidateMap.set(approval.id, approval);
        });
      });

      if (candidateMap.size === 0) return;

      const bestCandidate = Array.from(candidateMap.values()).sort(compareApprovalRecency)[0];
      if (!bestCandidate) return;

      matchedApprovals.add(bestCandidate.id);
      matchedProcesses.add(processItem.id);
      matches.push({
        approvalId: bestCandidate.id,
        processId: processItem.id,
        source: 'cpf'
      });
    });
  } else {
    // Regra de negocio da KPI: lead convertido quando existe ao menos um CPF em comum
    // entre a aprovacao e qualquer contrato.
    denominatorApprovals.forEach((approval) => {
      if (matchedApprovals.has(approval.id)) return;

      const byOriginCandidates = processesByOrigin.get(approval.id) || [];
      if (byOriginCandidates.length > 0) {
        const processId = byOriginCandidates[0].id;
        matchedApprovals.add(approval.id);
        matches.push({
          approvalId: approval.id,
          processId,
          source: 'origem'
        });
        return;
      }

      if (approval.cpfSet.size === 0) return;

      let matchedProcessId = null;
      for (const cpf of approval.cpfSet) {
        const processIds = processIdsByCpf.get(cpf);
        if (!processIds || processIds.size === 0) continue;
        matchedProcessId = processIds.values().next().value || null;
        if (matchedProcessId) break;
      }

      if (!matchedProcessId) return;

      matchedApprovals.add(approval.id);
      matches.push({
        approvalId: approval.id,
        processId: matchedProcessId,
        source: 'cpf'
      });
    });
  }

  const byOrigin = matches.filter((item) => item.source === 'origem').length;
  const byCpf = matches.filter((item) => item.source === 'cpf').length;

  const totalAnalisesPeriodo = denominatorApprovals.length;
  const convertidas = matches.length;
  const pendentes = Math.max(totalAnalisesPeriodo - convertidas, 0);

  const taxa = totalAnalisesPeriodo > 0
    ? convertidas / totalAnalisesPeriodo
    : 0;

  const approvalsWithoutCpf = denominatorApprovals.filter((item) => item.cpfSet.size === 0).length;
  const approvalsWithoutDate = normalizedApprovals.filter((item) => !item.approvalDate).length;
  const processosWithoutCpf = normalizedProcesses.filter((item) => item.cpfSet.size === 0).length;
  const processosWithoutDate = normalizedProcesses.filter((item) => !item.processDate).length;

  return {
    totalAnalisesPeriodo,
    convertidas,
    pendentes,
    byOrigin,
    byCpf,
    taxa,
    taxaPercentual: totalAnalisesPeriodo > 0 ? Number((taxa * 100).toFixed(1)) : 0,
    denominatorMode: normalizedDenominatorMode,
    matchingMode: resolvedMatchingMode,
    approvalDateField,
    periodStart: startDate,
    periodEnd: endDate,
    diagnostics: {
      approvalsInput: normalizedApprovals.length,
      approvalsInPeriod: approvalsInPeriod.length,
      approvalsWithoutCpf,
      approvalsWithoutDate,
      processosInput: normalizedProcesses.length,
      processosWithoutCpf,
      processosWithoutDate
    },
    matches
  };
}

const conversionMetricsService = {
  computeAprovacaoConversaoMetrics,
  extractAprovacaoCpfSet,
  extractProcessoCpfSet
};

if (typeof window !== 'undefined') {
  window.conversionMetricsService = conversionMetricsService;
}

export default conversionMetricsService;
