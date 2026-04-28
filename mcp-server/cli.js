#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const toolName = process.argv[2];
  const toolArgsJson = process.argv[3];

  if (!toolName) {
    console.log("Uso: node cli.js <nome_da_ferramenta> [json_argumentos]");
    console.log("Exemplo: node cli.js listar_contratos '{\"limit\": 2}'");
    
    // Vamos listar as ferramentas disponíveis para ajudar
    await listarFerramentas();
    return;
  }

  // Configura o transporte para rodar o servidor localmente
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(__dirname, "index.js")],
  });

  const client = new Client(
    {
      name: "gestor-contratos-cli",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);

    let args = {};
    if (toolArgsJson) {
      try {
        args = JSON.parse(toolArgsJson);
      } catch (e) {
        console.error("Erro ao fazer parse dos argumentos JSON:", e.message);
        process.exit(1);
      }
    }

    console.log(`⏳ Executando ferramenta '${toolName}'...`);
    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });

    // Exibe o resultado de forma legível
    if (result.content && result.content[0] && result.content[0].text) {
        try {
            // Tenta formatar se for JSON
            const obj = JSON.parse(result.content[0].text);
            console.log("\n✅ Resultado:");
            console.log(JSON.stringify(obj, null, 2));
        } catch (e) {
            // Se não for JSON, imprime texto puro
            console.log("\n✅ Resultado:");
            console.log(result.content[0].text);
        }
    } else {
        console.log(JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error("\n❌ Erro durante a execução:", error.message);
  } finally {
    await client.close();
  }
}

async function listarFerramentas() {
    const transport = new StdioClientTransport({
        command: "node",
        args: [path.join(__dirname, "index.js")],
    });
    const client = new Client({ name: "cli-lister", version: "1.0" }, { capabilities: {} });
    
    try {
        await client.connect(transport);
        const tools = await client.listTools();
        console.log("\n🛠️  Ferramentas Disponíveis:");
        tools.tools.forEach(t => {
            console.log(`   - ${t.name}: ${t.description}`);
        });
        console.log("");
    } catch(e) {
        console.error("Erro ao listar ferramentas:", e);
    } finally {
        await client.close();
    }
}

main();
