import { activityLogService } from './activityLogService.js';

const APPROVAL_MAX_ROWS = 10000;
const APPROVAL_SCREEN_TABLE_LIMIT = 250;
const APPROVAL_PRINT_MAX_ROWS = 200;
const APPROVAL_EXPORT_FIELDS = [
  'id',
  'clientePrincipal',
  'cpfPrincipal',
  'situacao',
  'analistaAprovacao',
  'construtora',
  'empreendimento',
  'dataEntrada',
  'dataAprovacao',
  'convertidoParaProcesso',
  'processoId',
  'valorFinanciamento',
  'renda',
  'cartaFinanciamento',
  'corretor'
];

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') {
    const parsed = value.toDate();
    return Number.isNaN(parsed?.getTime?.()) ? null : parsed;
  }
  if (Number.isFinite(value?.seconds)) {
    const parsed = new Date(value.seconds * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (Number.isFinite(value?._seconds)) {
    const parsed = new Date(value._seconds * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoDate(value) {
  const parsed = toDate(value);
  return parsed ? parsed.toLocaleDateString('pt-BR') : '';
}

function escapeCsv(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function uniqueSorted(values = []) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function formatBoolean(value) {
  return value ? 'Sim' : 'Nao';
}

function flattenValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map(flattenValue).filter(Boolean).join(' | ');
  }
  if (typeof value?.toDate === 'function') {
    return value.toDate().toLocaleString('pt-BR');
  }
  if (value instanceof Date) {
    return value.toLocaleString('pt-BR');
  }
  if (typeof value === 'object') {
    if (value.nome && value.cpf) {
      return `${value.nome} (${value.cpf})`;
    }
    return JSON.stringify(value);
  }
  return value;
}

function buildCsv(rows = [], fields = APPROVAL_EXPORT_FIELDS) {
  const header = fields.join(',');
  const body = rows.map((row) => (
    fields.map((field) => escapeCsv(flattenValue(row[field]))).join(',')
  ));
  return [header, ...body].join('\n');
}

function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function logApprovalCsvExport(filename, rowCount, content) {
  activityLogService.auditFileAction({
    actionType: 'EXPORT_REPORT',
    description: `Relatorio de aprovacoes exportado (${rowCount} registros)`,
    module: 'aprovacao',
    page: 'relatorios',
    source: 'reportsApprovalAdapter',
    filename,
    blobOrText: content,
    mimeType: 'text/csv;charset=utf-8;',
    rowCount,
    entityType: 'approval',
    extraData: {
      format: 'CSV'
    }
  }).catch((error) => {
    console.error('[reportsApprovalAdapter] Falha ao auditar exportacao CSV:', error);
  });
}

function openPrintWindow(title, html) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Nao foi possivel abrir a janela de impressao.');
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; margin: 24px; color: #111827; }
          h1 { margin-bottom: 8px; }
          .muted { color: #6b7280; margin-bottom: 16px; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0 24px; }
          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px 14px; }
          .label { color: #6b7280; font-size: 12px; text-transform: uppercase; }
          .value { font-size: 20px; font-weight: 700; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 13px; }
          th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
          @media print { body { margin: 12px; } }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
}

function computeStats(aprovacoes = [], links = []) {
  const approvedIds = new Set();
  const linkedApprovalIds = new Set();
  const stats = {
    total: aprovacoes.length,
    aprovados: 0,
    reprovados: 0,
    condicionados: 0,
    convertidas: 0,
    pendentesConversao: 0,
    taxaAprovacao: 0,
    taxaConversao: 0
  };

  aprovacoes.forEach((item) => {
    const situacao = String(item?.situacao || '').trim().toUpperCase();
    if (situacao === 'APROVADO') {
      stats.aprovados += 1;
      approvedIds.add(item.id);
    }
    if (situacao === 'REPROVADO') stats.reprovados += 1;
    if (situacao === 'CONDICIONADO') stats.condicionados += 1;
  });

  links.forEach((item) => {
    const approvalId = String(item?.aprovacaoId || '').trim();
    if (!approvalId || linkedApprovalIds.has(approvalId)) return;
    linkedApprovalIds.add(approvalId);
  });

  stats.convertidas = Array.from(linkedApprovalIds).filter((id) => approvedIds.has(id)).length;
  stats.pendentesConversao = Math.max(stats.aprovados - stats.convertidas, 0);
  stats.taxaAprovacao = stats.total > 0 ? Number(((stats.aprovados / stats.total) * 100).toFixed(1)) : 0;
  stats.taxaConversao = stats.total > 0 ? Number(((stats.convertidas / stats.total) * 100).toFixed(1)) : 0;

  return {
    ...stats,
    approvedIds,
    linkedApprovalIds
  };
}

function computeConversion(links = [], totalAnalises = 0) {
  const linkedApprovalIds = new Set();
  let byOrigin = 0;
  let byCpf = 0;

  links.forEach((item) => {
    const approvalId = String(item?.aprovacaoId || '').trim();
    if (approvalId) linkedApprovalIds.add(approvalId);

    const source = String(item?.source || '').trim().toLowerCase();
    if (source === 'origem') byOrigin += 1;
    if (source === 'cpf') byCpf += 1;
  });

  const convertidas = linkedApprovalIds.size;
  const pendentes = Math.max(totalAnalises - convertidas, 0);
  const taxaPercentual = totalAnalises > 0 ? Number(((convertidas / totalAnalises) * 100).toFixed(1)) : 0;

  return {
    totalAnalisesPeriodo: totalAnalises,
    convertidas,
    pendentes,
    byOrigin,
    byCpf,
    taxaPercentual,
    diagnostics: {
      linksRead: links.length,
      linkedApprovalIds: convertidas
    }
  };
}

function computeAnalystRanking(aprovacoes = [], links = []) {
  const linkedApprovalIds = new Set(
    links.map((item) => String(item?.aprovacaoId || '').trim()).filter(Boolean)
  );
  const rankingMap = new Map();

  aprovacoes.forEach((item) => {
    const analyst = String(item?.analistaAprovacao || '').trim() || 'Nao informado';
    if (!rankingMap.has(analyst)) {
      rankingMap.set(analyst, {
        analyst,
        total: 0,
        aprovados: 0,
        reprovados: 0,
        condicionados: 0,
        convertidas: 0,
        pendentesConversao: 0,
        taxaAprovacao: 0
      });
    }

    const entry = rankingMap.get(analyst);
    entry.total += 1;

    const situacao = String(item?.situacao || '').trim().toUpperCase();
    if (situacao === 'APROVADO') {
      entry.aprovados += 1;
      if (linkedApprovalIds.has(item.id)) {
        entry.convertidas += 1;
      }
    }
    if (situacao === 'REPROVADO') entry.reprovados += 1;
    if (situacao === 'CONDICIONADO') entry.condicionados += 1;
  });

  return Array.from(rankingMap.values())
    .map((entry) => ({
      ...entry,
      pendentesConversao: Math.max(entry.aprovados - entry.convertidas, 0),
      taxaAprovacao: entry.total > 0 ? Number(((entry.aprovados / entry.total) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => (
      b.total - a.total
      || b.aprovados - a.aprovados
      || a.analyst.localeCompare(b.analyst, 'pt-BR')
    ));
}

function computeSituacaoSeries(stats) {
  return [
    ['Aprovadas', Number(stats.aprovados || 0)],
    ['Reprovadas', Number(stats.reprovados || 0)],
    ['Condicionadas', Number(stats.condicionados || 0)]
  ];
}

function buildHealthMessages({ stats, docs, links, aggregateStats, aggregateConversion }) {
  const messages = [];
  const uniqueLinkedIds = new Set(links.map((item) => String(item?.aprovacaoId || '').trim()).filter(Boolean));
  const convertidasMarcadas = docs.filter((item) => item?.convertidoParaProcesso === true).length;

  if (convertidasMarcadas !== uniqueLinkedIds.size) {
    messages.push(`Conversoes divergentes entre documento e links materializados: ${convertidasMarcadas} marcadas no cadastro e ${uniqueLinkedIds.size} nos links.`);
  }

  if (aggregateStats && Number(aggregateStats.total || 0) !== Number(stats.total || 0)) {
    messages.push(`Resumo agregado e leitura detalhada divergem no total de analises (${aggregateStats.total} vs ${stats.total}).`);
  }

  if (aggregateConversion && Number(aggregateConversion.convertidas || 0) !== uniqueLinkedIds.size) {
    messages.push(`Taxa de conversao agregada diverge dos links materializados (${aggregateConversion.convertidas} vs ${uniqueLinkedIds.size}).`);
  }

  return uniqueSorted(messages);
}

function canUseAggregate(filters = {}) {
  const hasSituacao = normalizeArray(filters.situacao).length > 0;
  const hasConstrutora = normalizeArray(filters.construtoras).length > 0;
  const hasEmpreendimento = normalizeArray(filters.empreendimentos).length > 0;
  const hasSearch = Boolean(String(filters.searchTerm || '').trim());
  const hasConverted = typeof filters.convertidoParaProcesso === 'boolean';
  const analyst = String(filters.analistaAprovacao || '').trim();
  const campoData = filters.campoData || 'dataAprovacao';

  return (
    campoData === 'dataEntrada'
    && !hasSituacao
    && !hasConstrutora
    && !hasEmpreendimento
    && !hasSearch
    && !hasConverted
    && !analyst
  );
}

function normalizeTableLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return APPROVAL_SCREEN_TABLE_LIMIT;
  }
  return Math.min(Math.floor(parsed), APPROVAL_MAX_ROWS);
}

function mapFiltersToService(filters = {}) {
  const payload = {
    includeAllAuthenticated: true,
    pageSize: APPROVAL_MAX_ROWS,
    orderBy: filters.campoData === 'dataEntrada' ? 'createdAt' : 'dataAprovacao',
    orderDirection: 'desc'
  };

  if (filters.campoData === 'dataEntrada') {
    payload.dataEntradaInicio = filters.dataInicio || null;
    payload.dataEntradaFim = filters.dataFim || null;
  } else {
    payload.dataAprovacaoInicio = filters.dataInicio || null;
    payload.dataAprovacaoFim = filters.dataFim || null;
  }

  const situacao = normalizeArray(filters.situacao);
  const construtoras = normalizeArray(filters.construtoras);
  const empreendimentos = normalizeArray(filters.empreendimentos);

  if (situacao.length > 0) payload.situacao = situacao;
  if (construtoras.length > 0) payload.construtora = construtoras;
  if (empreendimentos.length > 0) payload.empreendimento = empreendimentos;
  if (filters.analistaAprovacao) payload.analistaAprovacao = filters.analistaAprovacao;
  if (typeof filters.convertidoParaProcesso === 'boolean') payload.convertidoParaProcesso = filters.convertidoParaProcesso;
  if (filters.searchTerm) payload.searchTerm = filters.searchTerm;

  return payload;
}

function applyClientSideDateFilter(items = [], filters = {}) {
  const dateField = filters.campoData === 'dataEntrada' ? 'dataEntrada' : 'dataAprovacao';
  const startDate = filters.dataInicio ? new Date(`${filters.dataInicio}T00:00:00`) : null;
  const endDate = filters.dataFim ? new Date(`${filters.dataFim}T23:59:59.999`) : null;

  if (!startDate && !endDate) {
    return Array.isArray(items) ? items : [];
  }

  return (items || []).filter((item) => {
    const candidate = dateField === 'dataEntrada'
      ? toDate(item?.dataEntrada || item?.entrada || item?.createdAt)
      : toDate(item?.dataAprovacao);

    if (!candidate) return false;
    if (startDate && candidate < startDate) return false;
    if (endDate && candidate > endDate) return false;
    return true;
  });
}

function normalizeDateRange(filters = {}) {
  return {
    dataInicio: filters.dataInicio || null,
    dataFim: filters.dataFim || null
  };
}

async function fetchFullAprovacoes(filters = {}, forceRefresh = false, options = {}) {
  if (!window.aprovacaoService?.listAprovacoes) {
    throw new Error('Servico de aprovacao nao disponivel.');
  }

  const {
    exhaustiveClientSideScan = false,
    pageSize = APPROVAL_MAX_ROWS,
    fetchAll = false
  } = options;

  const data = [];
  let hasMore = true;
  let cursor = null;
  let guard = 0;
  const normalizedPageSize = Math.min(normalizeTableLimit(pageSize), APPROVAL_MAX_ROWS);

  while (hasMore && guard < 50) {
    const response = await window.aprovacaoService.listAprovacoes({
      ...mapFiltersToService(filters),
      pageSize: normalizedPageSize,
      startAfterDoc: cursor,
      disablePersistentCache: forceRefresh === true,
      exhaustiveClientSideScan
    });

    data.push(...(Array.isArray(response?.data) ? response.data : []));
    hasMore = fetchAll === true && Boolean(response?.hasMore);
    cursor = response?.lastDoc || null;
    guard += 1;

    if (hasMore && !cursor) {
      console.warn('[reportsApprovalAdapter] Exportacao interrompida: cursor ausente com hasMore=true.');
      hasMore = false;
    }
  }

  return {
    data: applyClientSideDateFilter(data, filters),
    hasMore
  };
}

async function fetchApprovalTableRows(filters = {}, forceRefresh = false, tableLimit = APPROVAL_SCREEN_TABLE_LIMIT) {
  const response = await fetchFullAprovacoes(filters, forceRefresh, {
    pageSize: normalizeTableLimit(tableLimit),
    exhaustiveClientSideScan: false
  });
  return response.data;
}

async function fetchFilterCatalog(forceRefresh = false) {
  const situations = ['APROVADO', 'REPROVADO', 'CONDICIONADO'];
  let analysts = [];
  let construtoras = [];
  let empreendimentos = [];

  try {
    if (typeof window.aprovacaoService?.listAprovacaoAnalystCatalog === 'function') {
      const catalog = await window.aprovacaoService.listAprovacaoAnalystCatalog({ forceRefresh });
      analysts = uniqueSorted(catalog?.analysts || []);
    } else {
      throw new Error('listAprovacaoAnalystCatalog indisponivel');
    }
  } catch (error) {
    console.warn('[reportsApprovalAdapter] Falha ao carregar catalogo de analistas da colecao:', error);

    try {
      if (typeof window.aprovacaoService?.getAprovacaoAnalystRankingAggregate === 'function') {
        const ranking = await window.aprovacaoService.getAprovacaoAnalystRankingAggregate({ forceRefresh });
        analysts = uniqueSorted((ranking || []).map((item) => item.analyst));
      }
    } catch (fallbackError) {
      console.warn('[reportsApprovalAdapter] Falha ao carregar ranking agregado para filtros:', fallbackError);
    }
  }

  try {
    const vendors = await window.firestoreService?.getAllVendors?.({ forceRefresh }) || [];
    construtoras = uniqueSorted(vendors.map((item) => item.name));
    empreendimentos = uniqueSorted(
      vendors.flatMap((vendor) => (vendor.empreendimentos || []).map((item) => item.nome))
    );
  } catch (error) {
    console.warn('[reportsApprovalAdapter] Falha ao carregar catalogo de vendors:', error);
  }

  return {
    situations,
    analysts,
    construtoras,
    empreendimentos
  };
}

async function buildDetailedReport(filters = {}, options = {}) {
  const forceRefresh = options.forceRefresh === true;
  const tableLimit = normalizeTableLimit(options.tableLimit);
  const exhaustiveClientSideScan = options.exhaustiveClientSideScan === true;

  const { data: aprovacoes } = await fetchFullAprovacoes(filters, forceRefresh, {
    exhaustiveClientSideScan,
    pageSize: APPROVAL_MAX_ROWS,
    fetchAll: true
  });

  const approvalIds = aprovacoes.map((item) => item.id).filter(Boolean);
  const links = typeof window.aprovacaoService?.listAprovacaoConversionLinks === 'function'
    ? (approvalIds.length > 0
      ? await window.aprovacaoService.listAprovacaoConversionLinks({
          approvalIds,
          ...normalizeDateRange(filters)
        })
      : [])
    : [];

  const localStats = computeStats(aprovacoes, links);
  const stats = localStats;
  const ranking = computeAnalystRanking(aprovacoes, links);
  const conversion = computeConversion(links, stats.total);
  const health = buildHealthMessages({
    stats,
    docs: aprovacoes,
    links,
    aggregateStats: null,
    aggregateConversion: null
  });
  const tableRows = aprovacoes.slice(0, tableLimit);

  return {
    source: 'aprovacao',
    filters: { ...filters },
    metadata: {
      totalRegistros: stats.total,
      geradoEm: new Date().toISOString(),
      aggregateEligible: false,
      detailsPartial: false,
      tableLimit
    },
    diagnostics: {
      health,
      aggregateStats: null,
      aggregateConversion: null,
      rawDocs: aprovacoes.length,
      links: links.length
    },
    stats,
    situacaoSeries: computeSituacaoSeries(stats),
    ranking,
    conversion,
    rawData: aprovacoes,
    tableRows
  };
}

async function buildScreenOptimizedAggregateReport(filters = {}, options = {}) {
  const forceRefresh = options.forceRefresh === true;
  const tableLimit = normalizeTableLimit(options.tableLimit);

  const [stats, ranking, conversion, tableRows] = await Promise.all([
    window.aprovacaoService?.getAprovacaoStats?.({
      includeAllAuthenticated: true,
      dataInicio: filters.dataInicio || null,
      dataFim: filters.dataFim || null,
      mode: 'aggregate',
      forceRefresh
    }),
    window.aprovacaoService?.getAprovacaoAnalystRankingAggregate?.({
      dataInicio: filters.dataInicio || null,
      dataFim: filters.dataFim || null,
      forceRefresh
    }),
    window.aprovacaoService?.getAprovacaoConversionMetricsAggregate?.({
      dataInicio: filters.dataInicio || null,
      dataFim: filters.dataFim || null,
      denominatorMode: 'todas'
    }),
    fetchApprovalTableRows(filters, forceRefresh, tableLimit)
  ]);

  const safeStats = stats && typeof stats === 'object'
    ? {
        total: Number(stats.total || 0),
        aprovados: Number(stats.aprovados || 0),
        reprovados: Number(stats.reprovados || 0),
        condicionados: Number(stats.condicionados || 0),
        pendentesConversao: Number(stats.pendentesConversao || 0),
        taxaAprovacao: Number(stats.taxaAprovacao || 0)
      }
    : {
        total: 0,
        aprovados: 0,
        reprovados: 0,
        condicionados: 0,
        pendentesConversao: 0,
        taxaAprovacao: 0
      };
  const safeRanking = Array.isArray(ranking) ? ranking : [];
  const safeConversion = conversion && typeof conversion === 'object'
    ? conversion
    : computeConversion([], safeStats.total);

  return {
    source: 'aprovacao',
    filters: { ...filters },
    metadata: {
      totalRegistros: safeStats.total,
      geradoEm: new Date().toISOString(),
      aggregateEligible: true,
      detailsPartial: true,
      tableLimit
    },
    diagnostics: {
      health: [],
      aggregateStats: stats || null,
      aggregateConversion: conversion || null,
      rawDocs: tableRows.length,
      links: 0
    },
    stats: safeStats,
    situacaoSeries: computeSituacaoSeries(safeStats),
    ranking: safeRanking,
    conversion: safeConversion,
    rawData: tableRows,
    tableRows
  };
}

async function buildReport(filters = {}, options = {}) {
  const screenOptimized = options.screenOptimized !== false;
  const useAggregatePath = canUseAggregate(filters);
  const hasAggregateApi =
    typeof window.aprovacaoService?.getAprovacaoStats === 'function'
    && typeof window.aprovacaoService?.getAprovacaoAnalystRankingAggregate === 'function'
    && typeof window.aprovacaoService?.getAprovacaoConversionMetricsAggregate === 'function';

  if (screenOptimized && useAggregatePath && hasAggregateApi) {
    return buildScreenOptimizedAggregateReport(filters, options);
  }

  return buildDetailedReport(filters, {
    ...options,
    exhaustiveClientSideScan: options.exhaustiveClientSideScan !== false
  });
}

function mapApprovalRowForExport(item = {}) {
  return {
    ...item,
    convertidoParaProcesso: formatBoolean(item?.convertidoParaProcesso === true),
    dataEntrada: toIsoDate(item?.dataEntrada || item?.entrada),
    dataAprovacao: toIsoDate(item?.dataAprovacao),
    compradores: flattenValue(item?.compradores)
  };
}

async function exportReportToCsv(report) {
  if (report?.metadata?.detailsPartial && report?.filters) {
    return exportFilteredCsv(report.filters);
  }

  const rows = Array.isArray(report?.rawData) && report.rawData.length > 0
    ? report.rawData
    : (Array.isArray(report?.tableRows) ? report.tableRows : []);
  const content = buildCsv(rows.map(mapApprovalRowForExport), APPROVAL_EXPORT_FIELDS);
  const filename = `relatorio_aprovacao_${Date.now()}.csv`;
  downloadCsv(content, filename);
  logApprovalCsvExport(filename, rows.length, content);
}

async function exportFilteredCsv(filters = {}, options = {}) {
  const forceRefresh = options.forceRefresh === true;
  const { data: rows } = await fetchFullAprovacoes(filters, forceRefresh, {
    exhaustiveClientSideScan: true,
    pageSize: APPROVAL_MAX_ROWS,
    fetchAll: true
  });
  const content = buildCsv(rows.map(mapApprovalRowForExport), APPROVAL_EXPORT_FIELDS);
  const filename = `relatorio_aprovacao_${Date.now()}.csv`;
  downloadCsv(content, filename);
  logApprovalCsvExport(filename, rows.length, content);
}

async function exportReportToPrint(report) {
  const stats = report?.stats || {};
  const rowsSource = Array.isArray(report?.rawData) && report.rawData.length > 0
    ? report.rawData
    : (Array.isArray(report?.tableRows) ? report.tableRows : []);
  const rows = rowsSource.slice(0, APPROVAL_PRINT_MAX_ROWS);
  const totalRegistros = Number(report?.metadata?.totalRegistros || rowsSource.length || 0);
  const partialNotice = totalRegistros > rowsSource.length
    ? `<div class="muted">Exibindo ${rowsSource.length} de ${totalRegistros} registros carregados na tela.</div>`
    : '';
  const tableRows = rows.map((item) => `
    <tr>
      <td>${item.clientePrincipal || '-'}</td>
      <td>${item.cpfPrincipal || '-'}</td>
      <td>${item.situacao || '-'}</td>
      <td>${item.analistaAprovacao || '-'}</td>
      <td>${item.construtora || '-'}</td>
      <td>${item.empreendimento || '-'}</td>
      <td>${toIsoDate(item.dataAprovacao || item.dataEntrada || item.entrada)}</td>
    </tr>
  `).join('');

  openPrintWindow('Relatorio de Aprovacao', `
    <h1>Relatorio de Aprovacao</h1>
    <div class="muted">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
    ${partialNotice}
    <div class="grid">
      <div class="card"><div class="label">Total</div><div class="value">${stats.total || 0}</div></div>
      <div class="card"><div class="label">Aprovadas</div><div class="value">${stats.aprovados || 0}</div></div>
      <div class="card"><div class="label">Pendentes Conversao</div><div class="value">${stats.pendentesConversao || 0}</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Cliente</th>
          <th>CPF</th>
          <th>Situacao</th>
          <th>Analista</th>
          <th>Construtora</th>
          <th>Empreendimento</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>${tableRows || '<tr><td colspan="7">Sem dados</td></tr>'}</tbody>
    </table>
  `);
}

const reportsApprovalAdapter = {
  buildReport,
  fetchFilterCatalog,
  canUseAggregate,
  exportFilteredCsv,
  exportToCSV: exportReportToCsv,
  exportToPDF: exportReportToPrint
};

if (typeof window !== 'undefined') {
  window.reportsApprovalAdapter = reportsApprovalAdapter;
}

export default reportsApprovalAdapter;
