/**
 * @file exportService.js
 * @description Modulo para exportar dados para o formato CSV.
 */

import { EXPORTABLE_FIELDS } from './config.js';
import { activityLogService } from './activityLogService.js';

function sanitizeCell(value) {
  const strValue = String(value || '');
  if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
    return `"${strValue.replace(/"/g, '""')}"`;
  }
  return strValue;
}

export function exportToCSV(contracts, selectedKeys) {
  if (!selectedKeys || selectedKeys.length === 0) {
    throw new Error('Nenhum campo foi selecionado para exportacao.');
  }

  const selectedHeaders = EXPORTABLE_FIELDS.filter((field) => selectedKeys.includes(field.key));
  const headerRow = selectedHeaders.map((header) => sanitizeCell(header.label)).join(',');
  const dataRows = contracts.map((contract) => (
    selectedHeaders.map((header) => {
      const value = header.formatter ? header.formatter(contract) : contract[header.key];
      return sanitizeCell(value);
    }).join(',')
  ));

  const csvContent = [headerRow, ...dataRows].join('\n');
  const fileContent = `\uFEFF${csvContent}`;
  const blob = new Blob([fileContent], { type: 'text/csv;charset=utf-8;' });
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `relatorio_personalizado_${timestamp}.csv`;

  activityLogService.downloadBlob(blob, filename);

  activityLogService.auditFileAction({
    actionType: 'EXPORT_REPORT',
    description: `Relatorio de processos exportado (${contracts.length} registros)`,
    module: 'processos',
    page: 'processos',
    source: 'exportService',
    filename,
    blobOrText: blob,
    mimeType: 'text/csv;charset=utf-8;',
    rowCount: contracts.length,
    entityType: 'contract',
    extraData: {
      format: 'CSV',
      selectedKeys: Array.isArray(selectedKeys) ? [...selectedKeys] : []
    }
  }).catch((error) => {
    console.error('[exportService] Falha ao auditar exportacao CSV:', error);
  });
}
