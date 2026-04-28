import fs from "fs/promises";
import path from "path";

const DEFAULT_CRITICAL_COLLECTIONS = [
  "contracts",
  "users",
  "statusConfig",
  "chats",
  "aiConversations",
  "_readMetrics",
];

const DEFAULT_SCAN_DIRECTORIES = ["js", "functions"];
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", ".firebase", ".venv"]);
const HIGH_DAILY_READ_LIMIT = 50000;
const LOW_CACHE_HIT_RATE_PERCENT = 50;
const UNMAPPED_COLLECTION_KEY = "__sem_colecao_mapeada__";
const UNMAPPED_SOURCE_KEY = "__sem_fonte_mapeada__";

export const projectConsistencyTools = [
  {
    name: "auditar_metricas_leitura",
    description:
      "Agrega metricas da colecao _readMetrics para analisar consumo, cache hit rate e fontes de leitura.",
    inputSchema: {
      type: "object",
      properties: {
        dias: {
          type: "number",
          description: "Quantidade de dias no relatorio (padrao: 7, maximo: 90).",
        },
        top: {
          type: "number",
          description: "Quantidade de itens no ranking (padrao: 10).",
        },
        incluirPorUsuario: {
          type: "boolean",
          description: "Inclui ranking por usuario no resultado (padrao: true).",
        },
      },
    },
  },
  {
    name: "validar_governanca_firestore",
    description:
      "Valida firestore.rules e firestore.indexes.json para identificar lacunas de governanca e consistencia.",
    inputSchema: {
      type: "object",
      properties: {
        caminhoProjeto: {
          type: "string",
          description:
            "Caminho raiz do projeto. Se omitido, usa a raiz detectada pelo servidor MCP.",
        },
        validarColecoesCriticas: {
          type: "boolean",
          description:
            "Quando true, verifica colecoes essenciais nas regras (padrao: true).",
        },
        colecoesCriticas: {
          type: "array",
          description:
            "Lista customizada de colecoes criticas para validar nas regras.",
          items: { type: "string" },
        },
      },
    },
  },
  {
    name: "auditar_indices_firestore",
    description:
      "Escaneia consultas no codigo-fonte e compara com firestore.indexes.json para sugerir indices compostos faltantes.",
    inputSchema: {
      type: "object",
      properties: {
        caminhoProjeto: {
          type: "string",
          description:
            "Caminho raiz do projeto. Se omitido, usa a raiz detectada pelo servidor MCP.",
        },
        diretorios: {
          type: "array",
          description:
            "Diretorios para escanear (padrao: ['js','functions']).",
          items: { type: "string" },
        },
        top: {
          type: "number",
          description:
            "Quantidade maxima de assinaturas faltantes exibidas (padrao: 15).",
        },
      },
    },
  },
];

export async function handleProjectConsistencyTool(name, args = {}, context = {}) {
  if (name === "auditar_metricas_leitura") {
    return await auditarMetricasLeitura(args, context);
  }

  if (name === "validar_governanca_firestore") {
    return await validarGovernancaFirestore(args, context);
  }

  if (name === "auditar_indices_firestore") {
    return await auditarIndicesFirestore(args, context);
  }

  throw new Error(`Ferramenta de consistencia desconhecida: ${name}`);
}

function normalizeNumber(value, fallback, min = null, max = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  let normalized = parsed;
  if (min !== null && normalized < min) normalized = min;
  if (max !== null && normalized > max) normalized = max;
  return normalized;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function toJsonContent(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function addCounter(target, source) {
  if (!source || typeof source !== "object") return;
  for (const [key, rawValue] of Object.entries(source)) {
    const value = Number(rawValue) || 0;
    target[key] = (target[key] || 0) + value;
  }
}

function sumCounter(source) {
  if (!source || typeof source !== "object") return 0;
  return Object.values(source).reduce((sum, rawValue) => sum + (Number(rawValue) || 0), 0);
}

function topEntries(counter, limit) {
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, total]) => ({ key, total }));
}

function normalizeProjectRoot(caminhoProjeto, fallbackRoot) {
  if (!caminhoProjeto || typeof caminhoProjeto !== "string") {
    return fallbackRoot;
  }

  if (path.isAbsolute(caminhoProjeto)) {
    return path.normalize(caminhoProjeto);
  }

  return path.resolve(fallbackRoot, caminhoProjeto);
}

function formatPercent(numerator, denominator) {
  if (!denominator || denominator <= 0) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function normalizeDirection(value) {
  const dir = String(value || "").toLowerCase();
  if (dir === "desc" || dir === "descending") return "DESCENDING";
  if (dir === "asc" || dir === "ascending") return "ASCENDING";
  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getDateKey(rawDate, fallbackDocId) {
  if (rawDate && typeof rawDate === "string") {
    return rawDate.slice(0, 10);
  }

  if (fallbackDocId && typeof fallbackDocId === "string") {
    return fallbackDocId.split("_")[0];
  }

  return "sem_data";
}

async function auditarMetricasLeitura(args, context) {
  const db = context.db;
  if (!db) {
    throw new Error("Firestore nao inicializado no contexto do servidor MCP.");
  }

  const dias = normalizeNumber(args.dias, 7, 1, 90);
  const top = normalizeNumber(args.top, 10, 3, 50);
  const incluirPorUsuario = normalizeBoolean(args.incluirPorUsuario, true);

  const startDate = new Date(Date.now() - (dias - 1) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const snapshot = await db
    .collection("_readMetrics")
    .where("date", ">=", startDate)
    .get();

  const byCollection = {};
  const bySource = {};
  const byPage = {};
  const byPageHour = {};
  const byPageCollection = {};
  const byUserPage = {};
  const byUserPageCollection = {};
  const byUser = {};
  const byDate = {};

  let totalReads = 0;
  let mappedCollectionReads = 0;
  let mappedSourceReads = 0;
  let unmappedCollectionReads = 0;
  let unmappedSourceReads = 0;
  let totalCacheHits = 0;
  let totalCacheMisses = 0;

  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    const reads = data.reads || {};
    const cache = data.cache || {};
    const docReads = Number(reads.total) || 0;

    totalReads += docReads;
    totalCacheHits += Number(cache.hits) || 0;
    totalCacheMisses += Number(cache.misses) || 0;

    const docCollectionReads = sumCounter(reads.byCollection);
    const docSourceReads = sumCounter(reads.bySource);
    const docUnmappedCollectionReads = Math.max(0, docReads - docCollectionReads);
    const docUnmappedSourceReads = Math.max(0, docReads - docSourceReads);

    mappedCollectionReads += docCollectionReads;
    mappedSourceReads += docSourceReads;
    unmappedCollectionReads += docUnmappedCollectionReads;
    unmappedSourceReads += docUnmappedSourceReads;

    addCounter(byCollection, reads.byCollection);
    addCounter(bySource, reads.bySource);
    addCounter(byPage, reads.byPage);
    addCounter(byPageHour, reads.byPageHour);
    addCounter(byPageCollection, reads.byPageCollection);
    addCounter(byUserPage, reads.byUserPage);
    addCounter(byUserPageCollection, reads.byUserPageCollection);
    if (docUnmappedCollectionReads > 0) {
      byCollection[UNMAPPED_COLLECTION_KEY] =
        (byCollection[UNMAPPED_COLLECTION_KEY] || 0) + docUnmappedCollectionReads;
    }
    if (docUnmappedSourceReads > 0) {
      bySource[UNMAPPED_SOURCE_KEY] =
        (bySource[UNMAPPED_SOURCE_KEY] || 0) + docUnmappedSourceReads;
    }

    if (incluirPorUsuario && data.userId) {
      byUser[data.userId] = (byUser[data.userId] || 0) + docReads;
    }

    const dateKey = getDateKey(data.date, doc.id);
    byDate[dateKey] = (byDate[dateKey] || 0) + docReads;
  });

  const diasComDados = Math.max(1, Object.keys(byDate).length);
  const mediaDiaria = Math.round(totalReads / diasComDados);
  const cacheTotal = totalCacheHits + totalCacheMisses;
  const cacheHitRate = formatPercent(totalCacheHits, cacheTotal);
  const alertas = [];

  if (mediaDiaria >= HIGH_DAILY_READ_LIMIT) {
    alertas.push(
      `Media diaria elevada (${mediaDiaria} leituras/dia) em comparacao ao limite de referencia ${HIGH_DAILY_READ_LIMIT}.`
    );
  }

  const cacheHitRateNumber = Number(cacheHitRate.replace("%", ""));
  if (cacheHitRateNumber < LOW_CACHE_HIT_RATE_PERCENT) {
    alertas.push(
      `Taxa de cache baixa (${cacheHitRate}). Considere revisar TTL e warming de cache.`
    );
  }

  const collectionCoverageRate = formatPercent(mappedCollectionReads, totalReads);
  if (unmappedCollectionReads > 0) {
    alertas.push(
      `${unmappedCollectionReads} leituras (${formatPercent(unmappedCollectionReads, totalReads)}) estao sem colecao mapeada em _readMetrics.`
    );
  }

  const report = {
    periodo: {
      diasSolicitados: dias,
      dataInicial: startDate,
      dataFinal: new Date().toISOString().slice(0, 10),
    },
    amostra: {
      documentosMetricas: snapshot.size,
      diasComDados,
    },
    leituras: {
      total: totalReads,
      mediaDiaria,
      cobertura: {
        colecoesMapeadas: mappedCollectionReads,
        colecoesSemMapeamento: unmappedCollectionReads,
        taxaMapeamentoColecoes: collectionCoverageRate,
        fontesMapeadas: mappedSourceReads,
        fontesSemMapeamento: unmappedSourceReads,
        taxaMapeamentoFontes: formatPercent(mappedSourceReads, totalReads),
        observacao:
          "Metricas de _readMetrics cobrem apenas clientes instrumentados. O console do Firebase tambem pode incluir console, Cloud Functions/Admin SDK, regras e clientes sem monitor.",
      },
      topColecoes: topEntries(byCollection, top),
      topFontes: topEntries(bySource, top),
      topPaginas: topEntries(byPage, top),
      topPaginasPorHora: topEntries(byPageHour, top),
      topPaginaColecao: topEntries(byPageCollection, top),
      topUsuarioPagina: topEntries(byUserPage, top),
      topUsuarioPaginaColecao: topEntries(byUserPageCollection, top),
      porDia: topEntries(byDate, 100),
    },
    cache: {
      hits: totalCacheHits,
      misses: totalCacheMisses,
      hitRate: cacheHitRate,
    },
    usuarios: incluirPorUsuario ? topEntries(byUser, top) : [],
    alertas,
  };

  return toJsonContent(report);
}

function normalizeIndexes(indexesConfig) {
  const indexes = Array.isArray(indexesConfig?.indexes) ? indexesConfig.indexes : [];

  return indexes
    .map((index) => {
      const fields = Array.isArray(index.fields) ? index.fields : [];
      return {
        collectionGroup: String(index.collectionGroup || ""),
        queryScope: String(index.queryScope || "COLLECTION"),
        fields: fields
          .filter((field) => field && typeof field.fieldPath === "string")
          .map((field) => ({
            fieldPath: field.fieldPath,
            direction: normalizeDirection(field.order),
          })),
      };
    })
    .filter((index) => index.collectionGroup);
}

async function validarGovernancaFirestore(args, context) {
  const projectRoot = normalizeProjectRoot(args.caminhoProjeto, context.projectRoot || process.cwd());
  const rulesPath = path.join(projectRoot, "firestore.rules");
  const indexesPath = path.join(projectRoot, "firestore.indexes.json");

  const errors = [];
  const warnings = [];
  const recommendations = [];

  const rulesExists = await exists(rulesPath);
  const indexesExists = await exists(indexesPath);

  if (!rulesExists) {
    errors.push(`Arquivo nao encontrado: ${rulesPath}`);
  }

  if (!indexesExists) {
    errors.push(`Arquivo nao encontrado: ${indexesPath}`);
  }

  let rulesSummary = null;
  if (rulesExists) {
    const rulesContent = await fs.readFile(rulesPath, "utf8");
    const hasServiceDecl = /service\s+cloud\.firestore/.test(rulesContent);
    const hasDatabaseDecl = /match\s*\/databases\/\{database\}\/documents/.test(rulesContent);
    const hasGlobalCatchAll = /match\s*\/\{[^\}]*=\*\*\}/.test(rulesContent);

    if (!hasServiceDecl) {
      warnings.push("firestore.rules sem declaracao 'service cloud.firestore'.");
    }

    if (!hasDatabaseDecl) {
      warnings.push("firestore.rules sem bloco principal match /databases/{database}/documents.");
    }

    const validarColecoesCriticas = normalizeBoolean(args.validarColecoesCriticas, true);
    const colecoesCriticas = Array.isArray(args.colecoesCriticas) && args.colecoesCriticas.length > 0
      ? args.colecoesCriticas.map((item) => String(item))
      : DEFAULT_CRITICAL_COLLECTIONS;

    const colecoesSemMatch = [];
    if (validarColecoesCriticas && !hasGlobalCatchAll) {
      for (const collection of colecoesCriticas) {
        const regex = new RegExp(`match\\s*\\/${escapeRegExp(collection)}(?:\\/|\\{)`);
        if (!regex.test(rulesContent)) {
          colecoesSemMatch.push(collection);
        }
      }
    }

    if (colecoesSemMatch.length > 0) {
      warnings.push(
        `Colecoes sem match explicito em firestore.rules: ${colecoesSemMatch.join(", ")}`
      );
      recommendations.push(
        "Revisar se essas colecoes estao protegidas por bloco especifico ou por regra global intencional."
      );
    }

    rulesSummary = {
      arquivo: rulesPath,
      tamanhoBytes: rulesContent.length,
      possuiServiceFirestore: hasServiceDecl,
      possuiMatchPrincipal: hasDatabaseDecl,
      possuiCatchAllGlobal: hasGlobalCatchAll,
      colecoesSemMatchExplicito: colecoesSemMatch,
    };
  }

  let indexesSummary = null;
  if (indexesExists) {
    try {
      const raw = await fs.readFile(indexesPath, "utf8");
      const parsed = JSON.parse(raw);
      const normalizedIndexes = normalizeIndexes(parsed);
      const byCollection = {};
      const signatureCounter = {};

      for (const index of normalizedIndexes) {
        byCollection[index.collectionGroup] = (byCollection[index.collectionGroup] || 0) + 1;
        const signature = `${index.collectionGroup}|${index.queryScope}|${index.fields
          .map((field) => `${field.fieldPath}:${field.direction || "NA"}`)
          .join(",")}`;
        signatureCounter[signature] = (signatureCounter[signature] || 0) + 1;
      }

      const duplicatedIndexes = Object.entries(signatureCounter)
        .filter(([, count]) => count > 1)
        .map(([signature, count]) => ({ signature, count }));

      if (normalizedIndexes.length === 0) {
        warnings.push("firestore.indexes.json nao possui indices compostos configurados.");
      }

      if (duplicatedIndexes.length > 0) {
        warnings.push(`Foram encontrados ${duplicatedIndexes.length} indices compostos duplicados.`);
        recommendations.push(
          "Remover duplicidades em firestore.indexes.json para reduzir ruido de manutencao."
        );
      }

      indexesSummary = {
        arquivo: indexesPath,
        totalIndicesCompostos: normalizedIndexes.length,
        porColecao: Object.entries(byCollection)
          .sort((a, b) => b[1] - a[1])
          .map(([collection, total]) => ({ collection, total })),
        duplicados: duplicatedIndexes,
      };
    } catch (error) {
      errors.push(`Falha ao parsear firestore.indexes.json: ${error.message}`);
    }
  }

  const status = errors.length > 0 ? "erro" : warnings.length > 0 ? "atencao" : "ok";
  if (status === "ok") {
    recommendations.push(
      "Executar periodicamente auditar_indices_firestore para detectar novas combinacoes de consulta."
    );
  }

  return toJsonContent({
    status,
    projectRoot,
    regras: rulesSummary,
    indices: indexesSummary,
    errors,
    warnings,
    recommendations,
  });
}

async function collectJsFiles(dirPath, results) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".") && ![".eslintrc", ".eslintignore"].includes(entry.name)) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }
    }

    if (SKIP_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await collectJsFiles(absolutePath, results);
      continue;
    }

    if (entry.isFile() && absolutePath.endsWith(".js")) {
      results.push(absolutePath);
    }
  }
}

function createCandidateKey(collection, fields, orderBy) {
  const orderSignature = orderBy
    .map((item) => `${item.field}:${item.direction || "NA"}`)
    .join(",");
  return `${collection}|${fields.join(",")}|${orderSignature}`;
}

function extractCandidatesFromSource(content) {
  const lines = content.split(/\r?\n/);
  const localCandidates = new Map();
  const queryLineMatcher = /(\.where\(|\.orderBy\()/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!queryLineMatcher.test(line)) {
      continue;
    }

    const start = Math.max(0, i - 10);
    const end = Math.min(lines.length - 1, i + 10);
    const block = lines.slice(start, end + 1).join(" ");

    const collections = [...block.matchAll(/\.collection\(\s*["'`]([^"'`]+)["'`]\s*\)/g)];
    if (collections.length === 0) continue;
    const collection = collections[collections.length - 1][1];
    if (collection.trim().length === 0) continue;

    const whereMatches = [...block.matchAll(/\.where\(\s*["'`]([^"'`]+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/g)];
    const orderByMatches = [...block.matchAll(/\.orderBy\(\s*["'`]([^"'`]+)["'`]\s*(?:,\s*["'`]([^"'`]+)["'`])?/g)];

    const where = whereMatches.map((match) => ({
      field: match[1],
      operator: match[2],
    }));

    const orderBy = orderByMatches.map((match) => ({
      field: match[1],
      direction: normalizeDirection(match[2]),
    }));

    const fields = [...new Set([...where.map((item) => item.field), ...orderBy.map((item) => item.field)])];
    if (fields.length < 2) {
      continue;
    }

    const key = createCandidateKey(collection, fields, orderBy);
    if (!localCandidates.has(key)) {
      localCandidates.set(key, {
        collection,
        fields,
        where,
        orderBy,
        line: i + 1,
      });
    }
  }

  return [...localCandidates.values()];
}

function normalizeRelativePath(projectRoot, filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, "/");
}

function indexCoversCandidate(indexEntry, candidate) {
  const indexFieldNames = indexEntry.fields.map((field) => field.fieldPath);
  const candidateFields = candidate.fields;

  const hasAllFields = candidateFields.every((field) => indexFieldNames.includes(field));
  if (!hasAllFields) return false;

  for (const orderBy of candidate.orderBy) {
    if (!orderBy.direction) continue;
    const indexField = indexEntry.fields.find((field) => field.fieldPath === orderBy.field);
    if (!indexField) return false;
    if (indexField.direction && indexField.direction !== orderBy.direction) return false;
  }

  return true;
}

async function auditarIndicesFirestore(args, context) {
  const projectRoot = normalizeProjectRoot(args.caminhoProjeto, context.projectRoot || process.cwd());
  const indexesPath = path.join(projectRoot, "firestore.indexes.json");
  const directories = Array.isArray(args.diretorios) && args.diretorios.length > 0
    ? args.diretorios.map((item) => String(item))
    : DEFAULT_SCAN_DIRECTORIES;
  const top = normalizeNumber(args.top, 15, 5, 100);

  if (!(await exists(indexesPath))) {
    throw new Error(`Arquivo nao encontrado: ${indexesPath}`);
  }

  const rawIndexes = await fs.readFile(indexesPath, "utf8");
  const parsedIndexes = JSON.parse(rawIndexes);
  const normalizedIndexes = normalizeIndexes(parsedIndexes);
  const indexesByCollection = new Map();

  for (const index of normalizedIndexes) {
    if (!indexesByCollection.has(index.collectionGroup)) {
      indexesByCollection.set(index.collectionGroup, []);
    }
    indexesByCollection.get(index.collectionGroup).push(index);
  }

  const files = [];
  for (const directory of directories) {
    const absoluteDir = path.resolve(projectRoot, directory);
    if (!(await exists(absoluteDir))) {
      continue;
    }
    await collectJsFiles(absoluteDir, files);
  }

  const candidateMap = new Map();
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const candidates = extractCandidatesFromSource(content);

    for (const candidate of candidates) {
      const key = createCandidateKey(candidate.collection, candidate.fields, candidate.orderBy);
      const existing = candidateMap.get(key);

      if (!existing) {
        candidateMap.set(key, {
          ...candidate,
          filesCount: 1,
          examples: [
            {
              file: normalizeRelativePath(projectRoot, filePath),
              line: candidate.line,
            },
          ],
        });
      } else {
        existing.filesCount += 1;
        if (existing.examples.length < 5) {
          existing.examples.push({
            file: normalizeRelativePath(projectRoot, filePath),
            line: candidate.line,
          });
        }
      }
    }
  }

  const candidates = [...candidateMap.values()].sort((a, b) => b.filesCount - a.filesCount);
  const missing = [];
  let covered = 0;

  for (const candidate of candidates) {
    const indexes = indexesByCollection.get(candidate.collection) || [];
    const match = indexes.find((index) => indexCoversCandidate(index, candidate));

    if (match) {
      covered += 1;
    } else {
      missing.push(candidate);
    }
  }

  const missingTop = missing
    .slice(0, top)
    .map((candidate) => ({
      collection: candidate.collection,
      fields: candidate.fields,
      orderBy: candidate.orderBy,
      filesCount: candidate.filesCount,
      examples: candidate.examples,
    }));

  const report = {
    projectRoot,
    scan: {
      directories,
      filesScanned: files.length,
      querySignaturesDetected: candidates.length,
    },
    coverage: {
      coveredCandidates: covered,
      missingCandidates: missing.length,
      coverageRate: formatPercent(covered, candidates.length),
      note:
        "Cobertura aproximada por assinatura de campo; validacao final deve considerar erro real de indice no Firestore.",
    },
    missingTop,
    recommendations: [
      "Priorize candidatos faltantes com maior filesCount para reduzir risco de erro em producao.",
      "Depois de criar novos indices, execute nova auditoria para confirmar cobertura.",
    ],
  };

  return toJsonContent(report);
}
