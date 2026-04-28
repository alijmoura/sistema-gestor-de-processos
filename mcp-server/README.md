# Servidor MCP - Gestor de Contratos

Este servidor implementa o Model Context Protocol (MCP) para permitir que assistentes de IA acessem dados e rotinas tecnicas do projeto.

## Instalacao

```bash
cd mcp-server
npm install
```

## Credenciais

Para acessar Firestore real (producao ou staging), o Admin SDK precisa de credenciais.

1. Gere uma Service Account no Firebase Console.
2. Salve o arquivo como `serviceAccountKey.json` dentro de `mcp-server/`.
3. Configure `GOOGLE_APPLICATION_CREDENTIALS` (ou deixe o servidor usar `applicationDefault`).

Exemplo (PowerShell):

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Caminho\Para\serviceAccountKey.json"
node index.js
```

## Integracao com Claude Desktop

Edite `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gestor-contratos": {
      "command": "node",
      "args": [
        "D:/AJSM TECH/Projetos/Gestor - Registro de Contratos/mcp-server/index.js"
      ],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "D:/AJSM TECH/Projetos/Gestor - Registro de Contratos/mcp-server/serviceAccountKey.json"
      }
    }
  }
}
```

## Ferramentas disponiveis

### Dados e consultas
- `listar_contratos`
- `buscar_contrato_por_id`
- `buscar_por_cliente`
- `listar_colecoes`
- `listar_historico_contrato`
- `query_firestore_avancada`

### Browser e performance
- `browser_*` (Playwright)
- `analisar_*`, `medir_performance`, `verificar_erros_console` (diagnostico de carregamento e DOM)

### Consistencia (novo)
- `auditar_metricas_leitura`: agrega `_readMetrics` por periodo, cache hit rate e ranking de colecoes/fontes.
- `validar_governanca_firestore`: valida presenca/estrutura de `firestore.rules` e `firestore.indexes.json`.
- `auditar_indices_firestore`: escaneia consultas no codigo e compara com indices compostos atuais.

## Uso rapido via CLI local

O arquivo `cli.js` permite testar tools sem cliente MCP externo:

```bash
cd mcp-server
node cli.js auditar_metricas_leitura "{\"dias\":7,\"top\":10}"
node cli.js validar_governanca_firestore "{}"
node cli.js auditar_indices_firestore "{\"diretorios\":[\"js\",\"functions\"],\"top\":20}"
```

## Observacoes

- O escaneamento de indices (`auditar_indices_firestore`) usa heuristica de assinatura de consulta. Use o resultado como definicao de prioridade e confirme com erro real do Firestore quando houver.
- Mantenha `serviceAccountKey.json` fora do versionamento.
