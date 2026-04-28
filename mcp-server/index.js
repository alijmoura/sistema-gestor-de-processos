#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { playwrightTools, handlePlaywrightTool } from './playwrightController.js';
import { performanceTools, handlePerformanceTool } from './performanceController.js';
import { projectConsistencyTools, handleProjectConsistencyTool } from './projectConsistencyController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Inicializa o Firebase Admin
try {
  const localKeyPath = path.join(__dirname, "serviceAccountKey.json");
  
  if (fs.existsSync(localKeyPath)) {
      // Prioridade 1: Arquivo local serviceAccountKey.json
      const serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, "utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      // console.error("✅ Firebase inicializado com serviceAccountKey.json local."); // stderr é ignorado pelo MCP? Não, stderr aparece nos logs do Claude.
  } else {
       // Prioridade 2: Variável de ambiente GOOGLE_APPLICATION_CREDENTIALS automática
      admin.initializeApp({
          credential: admin.credential.applicationDefault()
      });
  }
} catch (err) {
  console.error("Aviso: Falha na inicialização padrão do Firebase. Tentando inicialização sem credenciais (pode falhar se não estiver em ambiente GCP/Emulador)...", err.message);
  admin.initializeApp();
}

const db = getFirestore();
const projectConsistencyToolNames = new Set(projectConsistencyTools.map((tool) => tool.name));

const server = new Server(
  {
    name: "gestor-contratos-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// --- Definição das Ferramentas ---

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      ...playwrightTools,
      ...performanceTools,
      ...projectConsistencyTools,
      {
        name: "listar_contratos",
        description: "Lista contratos do sistema. Útil para visão geral ou buscar os mais recentes.",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Quantidade de contratos para retornar (padrão: 5)"
            },
            status: {
              type: "string",
              description: "Filtrar por status do contrato (ex: 'Ativo', 'Pendente')"
            }
          }
        }
      },
      {
        name: "buscar_contrato_por_id",
        description: "Retorna todos os dados de um contrato específico dado seu ID.",
        inputSchema: {
          type: "object",
          properties: {
            contractId: {
              type: "string",
              description: "ID do documento no Firestore"
            }
          },
          required: ["contractId"]
        }
      },
      {
        name: "buscar_por_cliente",
        description: "Busca contratos pelo nome do cliente principal.",
        inputSchema: {
          type: "object",
          properties: {
            nomeCliente: {
              type: "string",
              description: "Nome (ou parte do nome) do cliente"
            }
          },
          required: ["nomeCliente"]
        }
      },
      {
        name: "listar_colecoes",
        description: "Lista todas as coleções de nível superior do Firestore. Útil para entender a estrutura do banco.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "listar_historico_contrato",
        description: "Retorna o histórico de alterações (logs) de um contrato específico.",
        inputSchema: {
          type: "object",
          properties: {
            contractId: {
              type: "string",
              description: "ID do contrato"
            },
            limit: {
              type: "number",
              description: "Limite de registros de histórico (padrão: 10)"
            }
          },
          required: ["contractId"]
        }
      },
      {
        name: "query_firestore_avancada",
        description: "Executa uma consulta flexível no Firestore.",
        inputSchema: {
          type: "object",
          properties: {
            collection: {
              type: "string",
              description: "Nome da coleção (ex: 'contracts', 'users')"
            },
            filters: {
              type: "array",
              description: "Lista de filtros. Cada filtro deve ter { field, operator, value }.",
              items: {
                  type: "object",
                  properties: {
                      field: { type: "string" },
                      operator: { type: "string", enum: ["==", "!=", ">", ">=", "<", "<=", "array-contains"] },
                      value: { type: "string" } // Simplificado para string aqui, mas a tool pode tentar converter
                  }
              }
            },
            limit: {
              type: "number",
              description: "Máximo de resultados (padrão 10)"
            }
          },
          required: ["collection"]
        }
      }
    ]
  };
});

// --- Implementação das Ferramentas ---

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name.startsWith("browser_")) {
        return await handlePlaywrightTool(name, args);
    }

    if (projectConsistencyToolNames.has(name)) {
        return await handleProjectConsistencyTool(name, args, { db, projectRoot });
    }

    if (name.startsWith("analisar_") || name.startsWith("medir_") || (name.startsWith("verificar_") && name.includes("console"))) {
        return await handlePerformanceTool(name, args);
    }

    if (name === "listar_colecoes") {
        const collections = await db.listCollections();
        const names = collections.map(c => c.id);
        return {
           content: [{ type: "text", text: `Coleções encontradas: ${names.join(", ")}` }]
        };
    }

    if (name === "listar_historico_contrato") {
        const contractId = args?.contractId;
        const limit = args?.limit || 10;
        
        if (!contractId) throw new Error("contractId é obrigatório");

        const snapshot = await db.collection("contracts")
            .doc(contractId)
            .collection("historico")
            .orderBy("timestamp", "desc") // Assumindo timestamp padrão
            .limit(limit)
            .get();

        if (snapshot.empty) {
            // Tenta ver se a coleção existe sem dados ou se deu erro de índice
             return { content: [{ type: "text", text: "Nenhum histórico encontrado para este contrato." }] };
        }

        const logs = snapshot.docs.map(doc => {
            const data = doc.data();
             const safeData = Object.entries(data).reduce((acc, [k, v]) => {
                acc[k] = (v && v.toDate) ? v.toDate().toISOString() : v;
                return acc;
            }, {});
            return { id: doc.id, ...safeData };
        });

        return { content: [{ type: "text", text: JSON.stringify(logs, null, 2) }] };
    }

    if (name === "query_firestore_avancada") {
        const { collection, filters, limit = 10 } = args;
        
        let query = db.collection(collection);

        if (filters && Array.isArray(filters)) {
            filters.forEach(f => {
                let val = f.value;
                // Tentativa básica de conversão de tipos
                if (val === "true") val = true;
                if (val === "false") val = false;
                if (!isNaN(Number(val)) && val.trim && val.trim() !== "") val = Number(val);
                
                query = query.where(f.field, f.operator, val);
            });
        }

        const snapshot = await query.limit(limit).get();
        const results = snapshot.docs.map(doc => {
             const data = doc.data();
             const safeData = Object.entries(data).reduce((acc, [k, v]) => {
                acc[k] = (v && v.toDate) ? v.toDate().toISOString() : v;
                return acc;
            }, {});
            return { id: doc.id, ...safeData };
        });

        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }

    if (name === "listar_contratos") {
      const limit = (args && args.limit) ? Number(args.limit) : 5;
      let query = db.collection("contracts").limit(limit);

      if (args && args.status) {
        query = db.collection("contracts").where("status", "==", args.status).limit(limit);
      }
      
      // Nota: Ordenação pode exigir índice composto se usada junto com filtro
      // .orderBy("createdAt", "desc") 

      const snapshot = await query.get();
      if (snapshot.empty) {
        return { content: [{ type: "text", text: "Nenhum contrato encontrado com os critérios fornecidos." }] };
      }

      const contracts = snapshot.docs.map(doc => {
        const data = doc.data();
        // Simplifica datas para string para o JSON ficar legível
        const safeData = Object.entries(data).reduce((acc, [k, v]) => {
             acc[k] = (v && v.toDate) ? v.toDate().toISOString() : v;
             return acc;
        }, {});
        return { id: doc.id, ...safeData };
      });

      return {
        content: [{ type: "text", text: JSON.stringify(contracts, null, 2) }]
      };
    }

    if (name === "buscar_contrato_por_id") {
      const contractId = args ? args.contractId : null;
      if (!contractId) throw new Error("ID do contrato é obrigatório.");

      const doc = await db.collection("contracts").doc(contractId).get();
      if (!doc.exists) {
        return { content: [{ type: "text", text: `Contrato '${contractId}' não encontrado.` }], isError: true };
      }

      const data = doc.data();
      const safeData = Object.entries(data).reduce((acc, [k, v]) => {
           acc[k] = (v && v.toDate) ? v.toDate().toISOString() : v;
           return acc;
      }, { id: doc.id });

      return {
        content: [{ type: "text", text: JSON.stringify(safeData, null, 2) }]
      };
    }

    if (name === "buscar_por_cliente") {
        const termo = args ? args.nomeCliente : "";
        if (!termo) throw new Error("Nome do cliente é obrigatório.");

        // Busca simples (Firestore não tem LIKE nativo, então usamos where >= e <= para prefixo ou array-contains se fosse array de keywords)
        // Aqui faremos uma busca exata ou range simples para demonstração
        const snapshot = await db.collection("contracts")
            .where("clientePrincipal", ">=", termo)
            .where("clientePrincipal", "<=", termo + "\uf8ff")
            .limit(5)
            .get();
        
        const contracts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        return {
            content: [{ type: "text", text: JSON.stringify(contracts, null, 2) }]
        };
    }

    throw new Error(`Ferramenta desconhecida: ${name}`);
  } catch (error) {
    return {
      content: [{ type: "text", text: `Erro: ${error.message}` }],
      isError: true
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gestor MCP Server rodando na entrada padrão (stdio)...");
}

run().catch((error) => {
  console.error("Erro fatal no servidor MCP:", error);
  process.exit(1);
});
