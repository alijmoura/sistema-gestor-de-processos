/**
 * @file csvAiAssistedService.js
 * @description Adapta a lógica de "Importar Dados de Documento (IA)" para o fluxo de CSV (Importação Assistida por IA).
 * Reutiliza normalização e sugestões do documentProcessingService para pré-processar registros do CSV.
 */

import { normalizePhoneToE164 } from "./phoneUtils.js";

/**
 * Constrói o array de compradores a partir de colunas planas do CSV (comprador_1_nome, ...)
 * @param {object} row
 * @returns {Array}
 */
function buildCompradoresFromRow(row) {
  const compradores = [];
  const MAX_COMPRADORES = 4;
  for (let j = 1; j <= MAX_COMPRADORES; j++) {
    const nome = row[`comprador_${j}_nome`];
    if (nome && String(nome).trim() !== '') {
      const telefoneBruto = row[`comprador_${j}_telefone`];
      const telefoneNormalizado = telefoneBruto
        ? normalizePhoneToE164(telefoneBruto) || String(telefoneBruto).trim()
        : '';

      compradores.push({
        nome: String(nome).trim(),
        cpf: row[`comprador_${j}_cpf`] || '',
        email: row[`comprador_${j}_email`] || '',
        telefone: telefoneNormalizado,
        principal:
          ['1', 'true', 'sim'].includes(
            String(row[`comprador_${j}_principal`] || '').toLowerCase()
          ) || j === 1,
      });
    }
  }
  return compradores;
}

/**
 * Faz um mapeamento leve de possíveis nomes alternativos de colunas do CSV para o schema esperado pelo conversor.
 * @param {object} row
 * @returns {object}
 */
function mapRowToExtractedSchema(row) {
  const get = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
    }
    return '';
  };

  const compradores = (Array.isArray(row.compradores) && row.compradores.length > 0
    ? row.compradores
    : buildCompradoresFromRow(row)).map((comprador) => {
      const telefoneNormalizado = comprador.telefone
        ? normalizePhoneToE164(comprador.telefone) || String(comprador.telefone).trim()
        : '';
      return {
        ...comprador,
        telefone: telefoneNormalizado,
      };
    });

  return {
    vendedorConstrutora: get('vendedorConstrutora', 'vendedorconstrutora', 'vendedor'),
    empreendimento: get('empreendimento', 'nome do empreendimento', 'projeto'),
    apto: get('apto', 'apartamento'),
    bloco: get('bloco', 'bloco/ap'),
    compradores,
    nContratoCEF: get('nContratoCEF', 'contratoCef', 'contratoCEF', 'contrato', 'ncontratocef'),
    dataMinuta: get('dataMinuta', 'dataEmissaoContrato'),
    dataAssinatura: get('dataAssinaturaCliente', 'dataAssinatura'),
    valorContrato: get('valorContrato', 'valor_total', 'valor do contrato'),
    cartorio: get('cartorio'),
    matriculaImovel: get('matriculaImovel', 'matricula'),
    municipioImovel: get('municipioImovel', 'municipio', 'cidade'),
    iptu: get('iptu'),
    formaPagamentoRi: get('formaPagamentoRi', 'forma_pagamento_ri'),
    valorDepositoRi: get('valorDepositoRi'),
    dataEntradaRegistro: get('dataEntradaRegistro'),
    protocoloRi: get('protocoloRi'),
    agencia: get('agencia'),
    gerente: get('gerente'),
    valorITBI: get('valorITBI'),
    observacoes: get('observacoes', 'anotacao')
  };
}

/**
 * Formata valores para exibição em tabela de revisão (datas → YYYY-MM-DD; mantém números/strings).
 * @param {any} val
 */
function formatForReview(val) {
  try {
    if (val instanceof Date) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  } catch {
    // ignore formatting errors and return original value
  }
  return val;
}

/**
 * Adapta registros do CSV aplicando a normalização do documentProcessingService.
 * NÃO chama LLM; apenas reutiliza as regras de conversão/parse/sugestões do fluxo de documentos.
 * @param {Array<object>} validProcesses - Linhas válidas do CSV (já parseadas com tolerância)
 * @returns {Array<object>} Registros prontos para revisão
 */
export function aiAssistCsvProcesses(validProcesses = []) {
  const svc = (typeof window !== 'undefined' && window.documentProcessingService) ? window.documentProcessingService : null;
  if (!svc || typeof svc.convertToSystemFormat !== 'function') {
    // Se o serviço não estiver carregado, retorna os dados crus
    return validProcesses;
  }

  const adapted = [];
  for (const row of validProcesses) {
    try {
      const extracted = mapRowToExtractedSchema(row);
      const normalized = svc.convertToSystemFormat(extracted);

      // Preserva ID e metadados de origem
      const output = {
        id: row.id || undefined,
        ...normalized,
        fonteDados: 'csv_assistido',
        importadoPorIA: true
      };

      // Garante clientePrincipal
      if (!output.clientePrincipal && Array.isArray(output.compradores) && output.compradores.length > 0) {
        const principal = output.compradores.find(c => c.principal) || output.compradores[0];
        output.clientePrincipal = principal?.nome || '';
      }

      // Converte datas para strings amigáveis na revisão
      Object.keys(output).forEach(k => {
        output[k] = formatForReview(output[k]);
      });

      // Sugestões de campos (opcional)
      if (typeof svc.generateFieldSuggestions === 'function') {
        const suggestions = svc.generateFieldSuggestions(extracted) || [];
        if (suggestions.length > 0) {
          output.sugestoesIA = suggestions.map(s => `${s.type}: ${s.field} (${s.priority})`).join('; ');
          output.statusIA = 'AVISO';
        } else {
          output.statusIA = 'OK';
        }
      }

      adapted.push(output);
    } catch (e) {
      console.warn('Falha ao adaptar linha CSV com IA assistida:', e);
      adapted.push(row); // mantém linha original se falhar
    }
  }
  return adapted;
}

// Exposição global opcional
if (typeof window !== 'undefined') {
  window.aiAssistCsvProcesses = aiAssistCsvProcesses;
}
