// vendorsMigration.js - Migração automática de vendors a partir de contratos existentes
// Cria pré-cadastro de construtoras e empreendimentos baseado em dados já existentes
// (Introduzido em 2025-10-03)

import { getAllContracts } from './firestoreService.js';
import { createOrUpdateVendor, getAllVendors } from './firestoreService.js';
import { db } from './auth.js';

if (window.__DEBUG__) console.log('[vendorsMigration] Módulo carregado.');

/**
 * Analisa contratos existentes e retorna estrutura de vendors
 * @returns {Promise<Array>} Lista de vendors com empreendimentos
 */
async function analyzeExistingContracts() {
  try {
    if (window.__DEBUG__) console.log('[vendorsMigration] Analisando contratos...');
    
    const contracts = await getAllContracts();
    if (window.__DEBUG__) console.log('[vendorsMigration] Contratos carregados:', contracts.length);
    
    // Mapear vendors → empreendimentos → blocos → apartamentos
    const vendorsMap = new Map();
    
    contracts.forEach(contract => {
      const vendorName = (contract.vendedorConstrutora || '').trim();
      const empName = (contract.empreendimento || '').trim();
      const blocoName = (contract.bloco || '').trim();
      const aptoNum = (contract.apto || '').trim();
      
      // Ignorar contratos sem vendor ou empreendimento
      if (!vendorName || !empName) return;
      
      // Normalização para comparação
      const vendorKey = vendorName.toLowerCase();
      
      if (!vendorsMap.has(vendorKey)) {
        vendorsMap.set(vendorKey, {
          name: vendorName, // Mantém case original do primeiro encontrado
          empreendimentos: new Map()
        });
      }
      
      const vendor = vendorsMap.get(vendorKey);
      const empKey = empName.toLowerCase();
      
      if (!vendor.empreendimentos.has(empKey)) {
        vendor.empreendimentos.set(empKey, {
          nome: empName,
          blocos: new Map()
        });
      }
      
      const emp = vendor.empreendimentos.get(empKey);
      
      // Adicionar bloco se existir
      if (blocoName) {
        const blocoKey = blocoName.toLowerCase();
        
        if (!emp.blocos.has(blocoKey)) {
          emp.blocos.set(blocoKey, {
            nome: blocoName,
            apartamentos: new Set()
          });
        }
        
        const bloco = emp.blocos.get(blocoKey);
        
        // Adicionar apartamento se existir
        if (aptoNum) {
          bloco.apartamentos.add(aptoNum);
        }
      }
    });
    
    // Converter Maps/Sets para Arrays
    const vendors = [];
    vendorsMap.forEach(vendor => {
      const empreendimentos = [];
      
      vendor.empreendimentos.forEach(emp => {
        const blocos = [];
        
        emp.blocos.forEach(bloco => {
          blocos.push({
            id: generateId(),
            nome: bloco.nome,
            apartamentos: Array.from(bloco.apartamentos).map(num => ({
              id: generateId(),
              numero: num
            }))
          });
        });
        
        empreendimentos.push({
          id: generateId(),
          nome: emp.nome,
          blocos
        });
      });
      
      vendors.push({
        name: vendor.name,
        empreendimentos
      });
    });
    
    if (window.__DEBUG__) {
      console.log('[vendorsMigration] Análise concluída:', {
        vendors: vendors.length,
        empreendimentos: vendors.reduce((sum, v) => sum + v.empreendimentos.length, 0)
      });
    }
    
    return vendors;
  } catch (err) {
    console.error('[vendorsMigration] Erro ao analisar contratos:', err);
    throw err;
  }
}

/**
 * Gera ID único para vendors/empreendimentos/blocos/apartamentos
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Compara vendors existentes com análise e retorna diferenças
 * @param {Array} analyzed - Vendors analisados dos contratos
 * @param {Array} existing - Vendors já cadastrados
 * @returns {Object} Estatísticas e vendors a criar/atualizar
 */
function compareVendors(analyzed, existing) {
  const stats = {
    novosVendors: 0,
    vendorsExistentes: 0,
    novosEmpreendimentos: 0,
    novosBlocos: 0,
    novosApartamentos: 0,
    toCreate: [],
    toUpdate: []
  };
  
  const existingMap = new Map(
    existing.map(v => [v.name.toLowerCase(), v])
  );
  
  analyzed.forEach(analyzedVendor => {
    const key = analyzedVendor.name.toLowerCase();
    const existingVendor = existingMap.get(key);
    
    if (!existingVendor) {
      // Vendor completamente novo
      stats.novosVendors++;
      stats.novosEmpreendimentos += analyzedVendor.empreendimentos.length;
      analyzedVendor.empreendimentos.forEach(emp => {
        stats.novosBlocos += emp.blocos.length;
        emp.blocos.forEach(bl => {
          stats.novosApartamentos += bl.apartamentos.length;
        });
      });
      stats.toCreate.push(analyzedVendor);
    } else {
      // Vendor existe - verificar empreendimentos novos
      stats.vendorsExistentes++;
      const existingEmpMap = new Map(
        (existingVendor.empreendimentos || []).map(e => [e.nome.toLowerCase(), e])
      );
      
      const newEmps = [];
      analyzedVendor.empreendimentos.forEach(analyzedEmp => {
        const empKey = analyzedEmp.nome.toLowerCase();
        const existingEmp = existingEmpMap.get(empKey);
        
        if (!existingEmp) {
          // Empreendimento novo
          stats.novosEmpreendimentos++;
          stats.novosBlocos += analyzedEmp.blocos.length;
          analyzedEmp.blocos.forEach(bl => {
            stats.novosApartamentos += bl.apartamentos.length;
          });
          newEmps.push(analyzedEmp);
        } else {
          // Empreendimento existe - verificar blocos novos
          const existingBlocoMap = new Map(
            (existingEmp.blocos || []).map(b => [b.nome.toLowerCase(), b])
          );
          
          const newBlocos = [];
          analyzedEmp.blocos.forEach(analyzedBloco => {
            const blocoKey = analyzedBloco.nome.toLowerCase();
            const existingBloco = existingBlocoMap.get(blocoKey);
            
            if (!existingBloco) {
              stats.novosBlocos++;
              stats.novosApartamentos += analyzedBloco.apartamentos.length;
              newBlocos.push(analyzedBloco);
            } else {
              // Bloco existe - verificar apartamentos novos
              const existingAptos = new Set(
                (existingBloco.apartamentos || []).map(a => a.numero.toLowerCase())
              );
              
              const newAptos = analyzedBloco.apartamentos.filter(
                a => !existingAptos.has(a.numero.toLowerCase())
              );
              
              if (newAptos.length > 0) {
                stats.novosApartamentos += newAptos.length;
                // Adicionar aos blocos novos para merge
                newBlocos.push({
                  ...analyzedBloco,
                  apartamentos: newAptos,
                  _isPartial: true,
                  _existingId: existingBloco.id
                });
              }
            }
          });
          
          if (newBlocos.length > 0) {
            newEmps.push({
              ...analyzedEmp,
              blocos: newBlocos,
              _isPartial: true,
              _existingId: existingEmp.id
            });
          }
        }
      });
      
      if (newEmps.length > 0) {
        stats.toUpdate.push({
          id: existingVendor.id,
          name: existingVendor.name,
          empreendimentos: newEmps
        });
      }
    }
  });
  
  return stats;
}

/**
 * Executa migração criando/atualizando vendors
 * @param {Object} stats - Estatísticas da comparação
 * @param {boolean} dryRun - Se true, não executa, apenas simula
 * @returns {Promise<Object>} Resultado da migração
 */
async function executeMigration(stats, dryRun = false) {
  const result = {
    success: true,
    created: 0,
    updated: 0,
    errors: []
  };
  
  if (dryRun) {
    if (window.__DEBUG__) console.log('[vendorsMigration] DRY RUN - Nenhuma alteração será feita');
    return { ...result, dryRun: true };
  }
  
  try {
    // Criar novos vendors
    for (const vendor of stats.toCreate) {
      try {
        await createOrUpdateVendor({
          name: vendor.name,
          active: true,
          empreendimentos: vendor.empreendimentos
        });
        result.created++;
        if (window.__DEBUG__) console.log('[vendorsMigration] Vendor criado:', vendor.name);
      } catch (err) {
        console.error('[vendorsMigration] Erro ao criar vendor:', vendor.name, err);
        result.errors.push({ vendor: vendor.name, error: err.message });
      }
    }
    
    // Atualizar vendors existentes com novos empreendimentos/blocos/apartamentos
    for (const update of stats.toUpdate) {
      try {
        // Buscar vendor atual do Firestore
        const vendorRef = db.collection('vendors').doc(update.id);
        const vendorSnap = await vendorRef.get();
        
        if (!vendorSnap.exists) {
          result.errors.push({ vendor: update.name, error: 'Vendor não encontrado' });
          continue;
        }
        
        const currentVendor = vendorSnap.data();
        const currentEmps = currentVendor.empreendimentos || [];
        
        // Merge empreendimentos
        const empsMap = new Map(currentEmps.map(e => [e.id, e]));
        
        update.empreendimentos.forEach(newEmp => {
          if (newEmp._isPartial && newEmp._existingId) {
            // Merge blocos em empreendimento existente
            const existingEmp = empsMap.get(newEmp._existingId);
            if (existingEmp) {
              const blocosMap = new Map((existingEmp.blocos || []).map(b => [b.id, b]));
              
              newEmp.blocos.forEach(newBloco => {
                if (newBloco._isPartial && newBloco._existingId) {
                  // Merge apartamentos em bloco existente
                  const existingBloco = blocosMap.get(newBloco._existingId);
                  if (existingBloco) {
                    existingBloco.apartamentos = [
                      ...(existingBloco.apartamentos || []),
                      ...newBloco.apartamentos
                    ];
                  }
                } else {
                  // Bloco completamente novo
                  existingEmp.blocos = existingEmp.blocos || [];
                  existingEmp.blocos.push(newBloco);
                }
              });
            }
          } else {
            // Empreendimento completamente novo
            empsMap.set(newEmp.id, newEmp);
          }
        });
        
        await vendorRef.update({
          empreendimentos: Array.from(empsMap.values()),
          updatedAt: new Date()
        });
        
        result.updated++;
        if (window.__DEBUG__) console.log('[vendorsMigration] Vendor atualizado:', update.name);
      } catch (err) {
        console.error('[vendorsMigration] Erro ao atualizar vendor:', update.name, err);
        result.errors.push({ vendor: update.name, error: err.message });
      }
    }
    
    // Invalidar cache
    const cacheService = window.cacheService || (await import('./cacheService.js')).default;
    cacheService.invalidate('vendors_all');
    
  } catch (err) {
    console.error('[vendorsMigration] Erro fatal na migração:', err);
    result.success = false;
    result.errors.push({ error: 'Erro fatal: ' + err.message });
  }
  
  return result;
}

/**
 * Função principal - Executa pré-cadastro completo
 * @param {Object} options - Opções de migração
 * @returns {Promise<Object>} Resultado detalhado
 */
export async function runVendorsMigration(options = {}) {
  const {
    dryRun = false,
    onProgress = null
  } = options;
  
  const report = {
    timestamp: new Date(),
    dryRun,
    steps: [],
    stats: null,
    result: null,
    success: false
  };
  
  try {
    // Passo 1: Analisar contratos
    if (onProgress) onProgress({ step: 'analyzing', message: 'Analisando contratos existentes...' });
    report.steps.push({ step: 'analyzing', started: Date.now() });
    
    const analyzed = await analyzeExistingContracts();
    report.steps[report.steps.length - 1].completed = Date.now();
    report.steps[report.steps.length - 1].found = analyzed.length;
    
    // Passo 2: Buscar vendors existentes
    if (onProgress) onProgress({ step: 'loading', message: 'Carregando vendors existentes...' });
    report.steps.push({ step: 'loading', started: Date.now() });
    
    const existing = await getAllVendors({ forceRefresh: true });
    report.steps[report.steps.length - 1].completed = Date.now();
    report.steps[report.steps.length - 1].found = existing.length;
    
    // Passo 3: Comparar e calcular diferenças
    if (onProgress) onProgress({ step: 'comparing', message: 'Comparando com cadastro atual...' });
    report.steps.push({ step: 'comparing', started: Date.now() });
    
    const stats = compareVendors(analyzed, existing);
    report.stats = stats;
    report.steps[report.steps.length - 1].completed = Date.now();
    
    // Passo 4: Executar migração
    if (stats.toCreate.length === 0 && stats.toUpdate.length === 0) {
      if (onProgress) onProgress({ step: 'complete', message: 'Nada a fazer - tudo já cadastrado!' });
      report.result = { message: 'Nada a migrar', created: 0, updated: 0, errors: [] };
      report.success = true;
      return report;
    }
    
    if (onProgress) {
      onProgress({ 
        step: 'migrating', 
        message: dryRun 
          ? 'Simulando migração...' 
          : `Migrando ${stats.novosVendors} novos vendors...` 
      });
    }
    report.steps.push({ step: 'migrating', started: Date.now() });
    
    const result = await executeMigration(stats, dryRun);
    report.result = result;
    report.steps[report.steps.length - 1].completed = Date.now();
    
    report.success = result.success;
    
    if (onProgress) {
      const message = dryRun
        ? `[SIMULAÇÃO] Seriam criados ${stats.novosVendors} vendors e atualizados ${stats.toUpdate.length}`
        : `Migração concluída: ${result.created} criados, ${result.updated} atualizados`;
      onProgress({ step: 'complete', message });
    }
    
  } catch (err) {
    console.error('[vendorsMigration] Erro na migração:', err);
    report.success = false;
    report.error = err.message;
  }
  
  return report;
}

/**
 * Exibe preview da migração sem executar
 * @returns {Promise<Object>} Estatísticas do que seria feito
 */
export async function previewMigration() {
  const report = await runVendorsMigration({ dryRun: true });
  return {
    ...report.stats,
    totalOperations: (report.stats?.toCreate?.length || 0) + (report.stats?.toUpdate?.length || 0)
  };
}

// Exportar para uso global/debug
window.__VENDORS_MIGRATION__ = {
  run: runVendorsMigration,
  preview: previewMigration,
  analyze: analyzeExistingContracts
};

if (window.__DEBUG__) console.log('[vendorsMigration] Funções exportadas globalmente.');
