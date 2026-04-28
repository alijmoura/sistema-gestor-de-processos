/**
 * @file pendenciasService.js
 * @description Serviço para gerenciamento de pendências vinculadas a processos
 * @version 1.1.0 - Otimizado para usar Cloud Function em lote
 * @author GitHub Copilot
 */

import { db, auth } from "./auth.js";
import cacheService from "./cacheService.js";

// Flag para controle de throttle de atualização de badges (não utilizado atualmente)
// let pendenciasUpdateTimeout = null;
// let pendenciasUpdateQueue = new Set();

// Configuração de cache para pendências
const CACHE_CONFIG = {
  pendenciasByContract: { prefix: 'pendencias_contract_', ttl: 2 * 60 * 1000 }, // 2 min
  pendenciasAll: { prefix: 'pendencias_all', ttl: 3 * 60 * 1000 }, // 3 min
  pendenciasCount: { prefix: 'pendencias_count_', ttl: 1 * 60 * 1000 } // 1 min
};

// Tipos de pendência
export const PENDENCIA_TIPOS = {
  documento: { label: 'Documento', icon: 'bi-file-earmark', color: '#0d6efd' },
  aprovacao: { label: 'Aprovação', icon: 'bi-check-circle', color: '#198754' },
  pagamento: { label: 'Pagamento', icon: 'bi-currency-dollar', color: '#ffc107' },
  correcao: { label: 'Correção', icon: 'bi-pencil-square', color: '#dc3545' },
  assinatura: { label: 'Assinatura', icon: 'bi-pen', color: '#0039BA' },
  outro: { label: 'Outro', icon: 'bi-question-circle', color: '#6c757d' }
};

// Prioridades
export const PENDENCIA_PRIORIDADES = {
  baixa: { label: 'Baixa', icon: 'bi-arrow-down', color: '#198754', order: 1 },
  media: { label: 'Média', icon: 'bi-dash', color: '#ffc107', order: 2 },
  alta: { label: 'Alta', icon: 'bi-arrow-up', color: '#fd7e14', order: 3 },
  urgente: { label: 'Urgente', icon: 'bi-exclamation-triangle', color: '#dc3545', order: 4 }
};

// Status de pendência
export const PENDENCIA_STATUS = {
  aberta: { label: 'Aberta', icon: 'bi-circle', color: '#0d6efd' },
  em_andamento: { label: 'Em Andamento', icon: 'bi-play-circle', color: '#ffc107' },
  aguardando: { label: 'Aguardando', icon: 'bi-hourglass-split', color: '#6c757d' },
  resolvida: { label: 'Resolvida', icon: 'bi-check-circle-fill', color: '#198754' },
  cancelada: { label: 'Cancelada', icon: 'bi-x-circle', color: '#dc3545' }
};

// Setores disponíveis
export const SETORES = {
  individual: { label: 'Individual', icon: 'bi-person' },
  cehop: { label: 'CEHOP', icon: 'bi-building' },
  formularios: { label: 'Formulários', icon: 'bi-file-earmark-text' },
  aprovacao: { label: 'Aprovação', icon: 'bi-clipboard-check' },
  registro: { label: 'Registro', icon: 'bi-journal-check' },
  financeiro: { label: 'Financeiro', icon: 'bi-cash-stack' }
};

const pendenciasCollection = db.collection("pendencias");

/**
 * Cria uma nova pendência
 * @param {Object} dados - Dados da pendência
 * @returns {Promise<Object>} Pendência criada com ID
 */
async function criarPendencia(dados) {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado");

  const novaPendencia = {
    contratoId: dados.contratoId,
    titulo: dados.titulo?.trim() || '',
    descricao: dados.descricao?.trim() || '',
    tipo: PENDENCIA_TIPOS[dados.tipo] ? dados.tipo : 'outro',
    prioridade: PENDENCIA_PRIORIDADES[dados.prioridade] ? dados.prioridade : 'media',
    
    // Atribuição
    setorResponsavel: dados.setorResponsavel || 'individual',
    usuarioResponsavel: dados.usuarioResponsavel || null,
    
    // Status
    status: 'aberta',
    
    // Datas
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    criadoPor: user.uid,
    criadoPorNome: user.displayName || user.email,
    prazo: dados.prazo ? firebase.firestore.Timestamp.fromDate(new Date(dados.prazo)) : null,
    resolvidoEm: null,
    resolvidoPor: null,
    
    // Comentários
    comentarios: []
  };

  // Validações
  if (!novaPendencia.contratoId) {
    throw new Error("ID do contrato é obrigatório");
  }
  if (!novaPendencia.titulo) {
    throw new Error("Título é obrigatório");
  }

  const docRef = await pendenciasCollection.add(novaPendencia);
  
  // Invalidar cache
  invalidarCachePendencias(dados.contratoId);
  
  console.log(` Pendência criada: ${docRef.id}`);
  
  return { id: docRef.id, ...novaPendencia };
}

/**
 * Lista pendências de um contrato
 * @param {string} contratoId - ID do contrato
 * @param {Object} options - Opções de filtro
 * @returns {Promise<Array>} Lista de pendências
 */
async function listarPendenciasPorContrato(contratoId, options = {}) {
  const { incluirResolvidas = false, useCache = true } = options;
  
  const cacheKey = `${CACHE_CONFIG.pendenciasByContract.prefix}${contratoId}_${incluirResolvidas}`;
  
  // Função de fetch para o cache
  const fetchPendencias = async () => {
    let query = pendenciasCollection.where("contratoId", "==", contratoId);
    
    if (!incluirResolvidas) {
      query = query.where("status", "in", ["aberta", "em_andamento", "aguardando"]);
    }
    
    query = query.orderBy("criadoEm", "desc");

    const snapshot = await query.get();
    const pendencias = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(` ${pendencias.length} pendências carregadas para contrato ${contratoId}`);
    
    return pendencias;
  };
  
  // Se não usar cache, buscar diretamente
  if (!useCache) {
    return await fetchPendencias();
  }
  
  // Usar cache com fetch function
  return await cacheService.get(cacheKey, fetchPendencias, 'contracts');
}

/**
 * Conta pendências ativas de um contrato (para badge)
 * @param {string} contratoId - ID do contrato
 * @returns {Promise<number>} Quantidade de pendências ativas
 */
async function contarPendenciasAtivas(contratoId) {
  const cacheKey = `${CACHE_CONFIG.pendenciasCount.prefix}${contratoId}`;
  
  const fetchCount = async () => {
    const snapshot = await pendenciasCollection
      .where("contratoId", "==", contratoId)
      .where("status", "in", ["aberta", "em_andamento", "aguardando"])
      .get();
    return snapshot.size;
  };
  
  return await cacheService.get(cacheKey, fetchCount, 'contracts');
}

/**
 * Conta pendências ativas de múltiplos contratos (batch para Kanban)
 * OTIMIZADO v2: Usa Cloud Function para busca em lote única + cache agressivo
 * @param {Array<string>} contratoIds - IDs dos contratos
 * @returns {Promise<Object>} Mapa de contratoId -> count
 */
async function contarPendenciasMultiplos(contratoIds) {
  if (!contratoIds || contratoIds.length === 0) return {};

  const resultados = {};
  const titulosCache = {};
  const idsNaoCacheados = [];

  // 1. Primeiro, verificar cache para cada ID (agora armazena {count, titulos})
  for (const id of contratoIds) {
    const cacheKey = `${CACHE_CONFIG.pendenciasCount.prefix}${id}`;
    const cached = cacheService.getSync ? cacheService.getSync(cacheKey, 'contracts') : null;

    if (cached !== null && cached !== undefined) {
      // Cache pode ser número (legado) ou objeto {count, titulos}
      if (typeof cached === 'object' && cached.count !== undefined) {
        resultados[id] = cached.count;
        if (cached.titulos) {
          titulosCache[id] = cached.titulos;
        }
      } else {
        // Cache legado (só número) - precisa buscar títulos
        resultados[id] = cached;
        idsNaoCacheados.push(id);
      }
    } else {
      idsNaoCacheados.push(id);
      resultados[id] = 0;
    }
  }

  // Se todos estavam em cache COM títulos, retornar
  if (idsNaoCacheados.length === 0) {
    if (window.__DEBUG__) console.log(` [Pendências] 100% cache hit (${contratoIds.length} IDs)`);
    resultados._titulos = titulosCache;
    return resultados;
  }

  if (window.__DEBUG__) {
    console.log(` [Pendências] Cache: ${contratoIds.length - idsNaoCacheados.length}/${contratoIds.length} | Buscando: ${idsNaoCacheados.length}`);
  }

  // 2. Tentar usar Cloud Function (mais eficiente - uma única chamada)
  try {
    const contarPendenciasCF = firebase.app().functions('us-central1').httpsCallable('contarPendenciasMultiplos');
    const response = await contarPendenciasCF({ contratoIds: idsNaoCacheados });

    if (response.data?.contagens) {
      // Mesclar resultados e cachear em lote (agora com títulos)
      const itemsToCache = {};
      const titulos = response.data.titulos || {};

      Object.entries(response.data.contagens).forEach(([id, count]) => {
        resultados[id] = count;
        const cacheKey = `${CACHE_CONFIG.pendenciasCount.prefix}${id}`;
        // Armazenar objeto com count e titulos
        itemsToCache[cacheKey] = {
          count: count,
          titulos: titulos[id] || []
        };
        // Adicionar ao cache de títulos local
        titulosCache[id] = titulos[id] || [];
      });

      // Adicionar títulos ao resultado (mesclando cache + novos)
      resultados._titulos = titulosCache;

      if (window.__DEBUG__) {
        const titulosCount = Object.values(titulosCache).filter(arr => arr && arr.length > 0).length;
        console.log(` [Pendências] Títulos recebidos: ${titulosCount} contratos com pendências`);
      }

      // Usar setMulti para evitar spam de logs
      if (cacheService.setMulti) {
        cacheService.setMulti(itemsToCache, 'contracts');
      } else {
        Object.entries(itemsToCache).forEach(([key, val]) => {
          cacheService.set(key, val, 'contracts');
        });
      }

      if (window.__DEBUG__) {
        console.log(` [Pendências] Cloud Function retornou ${Object.keys(response.data.contagens).length} contagens`);
      }
      return resultados;
    }
  } catch (cfError) {
    console.warn(' Cloud Function contarPendenciasMultiplos falhou, usando fallback local:', cfError.message);
  }

  // 3. Fallback: busca local otimizada (se CF falhar)
  await contarPendenciasLocal(idsNaoCacheados, resultados);
  resultados._titulos = titulosCache;

  return resultados;
}

/**
 * Fallback local para contar pendências (usado se Cloud Function falhar)
 * @private
 */
async function contarPendenciasLocal(idsNaoCacheados, resultados) {
  const statusAtivos = new Set(["aberta", "em_andamento", "aguardando"]);
  const BATCH_SIZE = 10;
  const batches = [];
  
  for (let i = 0; i < idsNaoCacheados.length; i += BATCH_SIZE) {
    batches.push(idsNaoCacheados.slice(i, i + BATCH_SIZE));
  }
  
  // Processar batches em paralelo (máximo 3)
  const PARALLEL_LIMIT = 3;
  for (let i = 0; i < batches.length; i += PARALLEL_LIMIT) {
    const parallelBatches = batches.slice(i, i + PARALLEL_LIMIT);
    
    await Promise.all(parallelBatches.map(async (batch) => {
      try {
        const snapshot = await pendenciasCollection
          .where("contratoId", "in", batch)
          .get();
        
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (statusAtivos.has(data.status)) {
            resultados[data.contratoId] = (resultados[data.contratoId] || 0) + 1;
          }
        });
      } catch (error) {
        console.warn(` Erro ao buscar pendências para batch:`, error);
      }
      
      // Cachear resultados em lote
      const itemsToCache = {};
      batch.forEach(id => {
        const cacheKey = `${CACHE_CONFIG.pendenciasCount.prefix}${id}`;
        itemsToCache[cacheKey] = resultados[id] || 0;
      });
      
      if (cacheService.setMulti) {
        cacheService.setMulti(itemsToCache, 'contracts');
      } else {
        Object.entries(itemsToCache).forEach(([key, val]) => cacheService.set(key, val, 'contracts'));
      }
    }));
  }
}

/**
 * Atualiza uma pendência
 * @param {string} pendenciaId - ID da pendência
 * @param {Object} dados - Dados para atualizar
 * @returns {Promise<void>}
 */
async function atualizarPendencia(pendenciaId, dados) {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado");

  const docRef = pendenciasCollection.doc(pendenciaId);
  const doc = await docRef.get();
  
  if (!doc.exists) {
    throw new Error("Pendência não encontrada");
  }
  
  const pendenciaAtual = doc.data();
  
  const atualizacao = {
    ...dados,
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    atualizadoPor: user.uid
  };
  
  // Se estiver resolvendo
  if (dados.status === 'resolvida' && pendenciaAtual.status !== 'resolvida') {
    atualizacao.resolvidoEm = firebase.firestore.FieldValue.serverTimestamp();
    atualizacao.resolvidoPor = user.uid;
    atualizacao.resolvidoPorNome = user.displayName || user.email;
  }
  
  // Se prazo foi passado como string, converter
  if (dados.prazo && typeof dados.prazo === 'string') {
    atualizacao.prazo = firebase.firestore.Timestamp.fromDate(new Date(dados.prazo));
  }

  await docRef.update(atualizacao);
  
  // Invalidar cache
  invalidarCachePendencias(pendenciaAtual.contratoId);
  
  console.log(` Pendência ${pendenciaId} atualizada`);
}

/**
 * Resolve uma pendência
 * @param {string} pendenciaId - ID da pendência
 * @param {string} comentario - Comentário de resolução opcional
 * @returns {Promise<void>}
 */
async function resolverPendencia(pendenciaId, comentario = '') {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado");

  const docRef = pendenciasCollection.doc(pendenciaId);
  const doc = await docRef.get();
  
  if (!doc.exists) {
    throw new Error("Pendência não encontrada");
  }
  
  const pendenciaAtual = doc.data();
  
  const atualizacao = {
    status: 'resolvida',
    resolvidoEm: firebase.firestore.FieldValue.serverTimestamp(),
    resolvidoPor: user.uid,
    resolvidoPorNome: user.displayName || user.email,
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    atualizadoPor: user.uid
  };
  
  // Adicionar comentário de resolução se fornecido
  if (comentario) {
    atualizacao.comentarios = firebase.firestore.FieldValue.arrayUnion({
      texto: ` Resolvido: ${comentario}`,
      usuario: user.uid,
      usuarioNome: user.displayName || user.email,
      data: new Date().toISOString(),
      tipo: 'resolucao'
    });
  }

  await docRef.update(atualizacao);
  
  // Invalidar cache
  invalidarCachePendencias(pendenciaAtual.contratoId);
  
  console.log(` Pendência ${pendenciaId} resolvida`);
}

/**
 * Reabre uma pendência resolvida
 * @param {string} pendenciaId - ID da pendência
 * @param {string} motivo - Motivo da reabertura (opcional)
 * @returns {Promise<void>}
 */
async function reabrirPendencia(pendenciaId, motivo = '') {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado");

  const docRef = pendenciasCollection.doc(pendenciaId);
  const doc = await docRef.get();
  
  if (!doc.exists) {
    throw new Error("Pendência não encontrada");
  }
  
  const pendenciaAtual = doc.data();
  
  const atualizacao = {
    status: 'aberta',
    resolvidoEm: null,
    resolvidoPor: null,
    resolvidoPorNome: null,
    reabertoEm: firebase.firestore.FieldValue.serverTimestamp(),
    reabertoPor: user.uid,
    reabertoPorNome: user.displayName || user.email,
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    atualizadoPor: user.uid
  };
  
  // Adicionar comentário de reabertura
  const comentarioReabertura = {
    texto: ` Reaberto${motivo ? `: ${motivo}` : ''}`,
    usuario: user.uid,
    usuarioNome: user.displayName || user.email,
    data: new Date().toISOString(),
    tipo: 'reabertura'
  };
  
  atualizacao.comentarios = firebase.firestore.FieldValue.arrayUnion(comentarioReabertura);

  await docRef.update(atualizacao);
  
  // Invalidar cache
  invalidarCachePendencias(pendenciaAtual.contratoId);
  
  console.log(` Pendência ${pendenciaId} reaberta`);
}

/**
 * Adiciona um comentário a uma pendência
 * @param {string} pendenciaId - ID da pendência
 * @param {string} texto - Texto do comentário
 * @returns {Promise<void>}
 */
async function adicionarComentario(pendenciaId, texto) {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado");
  if (!texto?.trim()) throw new Error("Comentário não pode ser vazio");

  const docRef = pendenciasCollection.doc(pendenciaId);
  const doc = await docRef.get();
  
  if (!doc.exists) {
    throw new Error("Pendência não encontrada");
  }

  const novoComentario = {
    texto: texto.trim(),
    usuario: user.uid,
    usuarioNome: user.displayName || user.email,
    data: new Date().toISOString(),
    tipo: 'comentario'
  };

  await docRef.update({
    comentarios: firebase.firestore.FieldValue.arrayUnion(novoComentario),
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });
  
  // Invalidar cache
  const pendencia = doc.data();
  invalidarCachePendencias(pendencia.contratoId);
  
  console.log(` Comentário adicionado à pendência ${pendenciaId}`);
}

/**
 * Exclui uma pendência
 * @param {string} pendenciaId - ID da pendência
 * @returns {Promise<void>}
 */
async function excluirPendencia(pendenciaId) {
  const docRef = pendenciasCollection.doc(pendenciaId);
  const doc = await docRef.get();
  
  if (!doc.exists) {
    throw new Error("Pendência não encontrada");
  }
  
  const contratoId = doc.data().contratoId;
  
  await docRef.delete();
  
  // Invalidar cache
  invalidarCachePendencias(contratoId);
  
  console.log(` Pendência ${pendenciaId} excluída`);
}

/**
 * Lista todas as pendências do usuário atual (atribuídas a ele)
 * @param {Object} options - Opções de filtro
 * @returns {Promise<Array>} Lista de pendências
 */
async function listarMinhasPendencias(options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado");
  
  const { incluirResolvidas = false } = options;

  let query = pendenciasCollection.where("usuarioResponsavel", "==", user.uid);
  
  if (!incluirResolvidas) {
    query = query.where("status", "in", ["aberta", "em_andamento", "aguardando"]);
  }
  
  query = query.orderBy("criadoEm", "desc");

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Lista pendências por setor
 * @param {string} setor - Nome do setor
 * @param {Object} options - Opções de filtro
 * @returns {Promise<Array>} Lista de pendências
 */
async function listarPendenciasPorSetor(setor, options = {}) {
  const { incluirResolvidas = false } = options;

  let query = pendenciasCollection.where("setorResponsavel", "==", setor);
  
  if (!incluirResolvidas) {
    query = query.where("status", "in", ["aberta", "em_andamento", "aguardando"]);
  }
  
  query = query.orderBy("criadoEm", "desc");

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Invalida cache de pendências
 * @param {string} contratoId - ID do contrato
 */
function invalidarCachePendencias(contratoId) {
  if (contratoId) {
    cacheService.invalidate(`${CACHE_CONFIG.pendenciasByContract.prefix}${contratoId}_true`);
    cacheService.invalidate(`${CACHE_CONFIG.pendenciasByContract.prefix}${contratoId}_false`);
    cacheService.invalidate(`${CACHE_CONFIG.pendenciasCount.prefix}${contratoId}`);
  }
  cacheService.invalidateByPattern(/^pendencias_/);
}

/**
 * Formata prazo para exibição
 * @param {Object} prazo - Timestamp do Firestore ou Date
 * @returns {Object} { texto, classe, diasRestantes }
 */
function formatarPrazo(prazo) {
  if (!prazo) return { texto: 'Sem prazo', classe: 'text-muted', diasRestantes: null };
  
  const dataPrazo = prazo.toDate ? prazo.toDate() : new Date(prazo);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  dataPrazo.setHours(0, 0, 0, 0);
  
  const diffTime = dataPrazo - hoje;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const dataFormatada = dataPrazo.toLocaleDateString('pt-BR');
  
  if (diffDays < 0) {
    return { 
      texto: `Vencido há ${Math.abs(diffDays)} dia(s)`, 
      classe: 'text-danger', 
      diasRestantes: diffDays,
      data: dataFormatada
    };
  } else if (diffDays === 0) {
    return { 
      texto: 'Vence hoje', 
      classe: 'text-warning', 
      diasRestantes: 0,
      data: dataFormatada
    };
  } else if (diffDays <= 2) {
    return { 
      texto: `Vence em ${diffDays} dia(s)`, 
      classe: 'text-warning', 
      diasRestantes: diffDays,
      data: dataFormatada
    };
  } else {
    return { 
      texto: `${diffDays} dias restantes`, 
      classe: 'text-success', 
      diasRestantes: diffDays,
      data: dataFormatada
    };
  }
}

// Exportar serviço
const pendenciasService = {
  // CRUD
  criar: criarPendencia,
  listarPorContrato: listarPendenciasPorContrato,
  contar: contarPendenciasAtivas,
  contarMultiplos: contarPendenciasMultiplos,
  atualizar: atualizarPendencia,
  resolver: resolverPendencia,
  reabrir: reabrirPendencia,
  excluir: excluirPendencia,
  adicionarComentario,
  
  // Listagens especiais
  listarMinhas: listarMinhasPendencias,
  listarPorSetor: listarPendenciasPorSetor,
  
  // Utilitários
  formatarPrazo,
  invalidarCache: invalidarCachePendencias,
  
  // Constantes
  TIPOS: PENDENCIA_TIPOS,
  PRIORIDADES: PENDENCIA_PRIORIDADES,
  STATUS: PENDENCIA_STATUS,
  SETORES
};

// Expor globalmente para debug
if (typeof window !== 'undefined') {
  window.pendenciasService = pendenciasService;
}

export default pendenciasService;
