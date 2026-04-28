# Sistema Gestor de Processos

Aplicacao web hospedada no Firebase para gestao de processos, com entrada principal em `dashboard.html`, `index.html` mantido como redirect legado, e paginas dedicadas para `processos.html`, `aprovacao.html`, `configuracoes.html`, `relatorios.html`, `ferramentas.html`, `agenda.html`, `whatsapp.html`, `arquivados.html` e `profile.html`, integracao WhatsApp Business e recursos de IA com suporte a Vertex AI.

Estado: producao  
Ultima revisao deste README: 2026-04-24
Historico de mudancas: `CHANGELOG.md`

## Sumario

1. [Visao geral](#visao-geral)
2. [Principais funcionalidades](#principais-funcionalidades)
3. [Arquitetura tecnica](#arquitetura-tecnica)
4. [Stack e requisitos](#stack-e-requisitos)
5. [Setup rapido](#setup-rapido)
6. [Comandos do projeto](#comandos-do-projeto)
7. [Deploy](#deploy)
8. [Servidor MCP (opcional)](#servidor-mcp-opcional)
9. [Skills do Codex (opcional)](#skills-do-codex-opcional)
10. [Padroes obrigatorios de desenvolvimento](#padroes-obrigatorios-de-desenvolvimento)
11. [Estrutura do repositorio](#estrutura-do-repositorio)
12. [Troubleshooting rapido](#troubleshooting-rapido)

## Visao geral

O sistema centraliza operacoes de contratos de financiamento em uma unica interface, substituindo controles manuais por um fluxo com:

- cadastro, acompanhamento e atualizacao de processos;
- controles de status e workflow dinamicos;
- dashboards e indicadores operacionais;
- integracao com WhatsApp Business;
- assistencia por IA para leitura/apoio em dados e documentos.

## Principais funcionalidades

- Gestao de contratos em visualizacoes de lista e kanban.
- Pagina `processos.html` com estado centralizado de busca/filtros/view e sincronizacao remota por delta, evitando reset visual quando outro usuario atualiza um processo.
- Pagina `relatorios.html` reorganizada por origem, com abas principais para Processos, Aprovacao, WhatsApp e Atividades, filtros contextuais por colecao, paginacao server-side dos logs e download dos arquivos auditados.
- Exportacoes CSV em `relatorios.html` normalizam campos de data para o padrao brasileiro e a pagina `arquivados.html` renderiza a primeira pagina de arquivados antes de concluir a carga total.
- Na aba Aprovação de `relatorios.html`, totais e CSV usam o mesmo criterio de data: agregados diarios apenas para `dataEntrada` e busca detalhada para `dataAprovacao`.
- O seletor "Campo de Data" da aba Aprovação envia ranges distintos para `dataAprovacao` e `dataEntrada`, evitando fallback incorreto entre os campos.
- O ranking de analistas da aba Aprovação exibe a coluna `Total` de forma consistente para leituras detalhadas e agregadas.
- A aba Aprovação corrige agregados diários com campos legados de `byAnalyst.*` e carrega catálogo/diretório somente ao abrir a aba, reduzindo espera inicial em `relatorios.html`.
- As métricas de leitura Firestore registram usuário, página, página por hora, página por coleção e amostra recente com horário exato da requisição.
- Regras de status/workflow configuraveis por administradores.
- Arquivamento Firestore-first:
  - contratos ativos em `contracts`;
  - contratos finalizados em `archivedContracts`, com restauracao por Cloud Functions.
- Dashboard com KPIs operacionais e feed das 10 atividades recentes, segmentado por permissao (admin ve tudo; nao-admin ve apenas as proprias atividades).
- Trilha de auditoria central em `activity_logs`, com snapshots minimos por evento e copia auditavel dos CSVs importados/exportados em Storage.
- KPIs do dashboard com persistencia global (admin) e local por usuario (offcanvas de KPIs).
- Pagina de aprovacao com visao consolidada para todos os usuarios autenticados.
- Intake publico de aprovacao de credito via link seguro (token temporario), permissao interna para geracao do link, consentimento LGPD e upload validado de documentos.
- Criacao automatica de lead na colecao `aprovacoes` quando atendimento WhatsApp entra no departamento "Aprovacao".
- Download seguro dos anexos do intake na tela de detalhes da aprovacao, com URL assinada e expiracao curta.
- Notificacao automatica de mudanca de situacao da aprovacao para o cliente por WhatsApp e enfileiramento de e-mail.
- Cache da pagina de aprovacao ajustado para reduzir leituras no Firestore com recarga seletiva de estatisticas.
- Modulos de WhatsApp (mensagens, tags, templates, configuracoes e monitoramento).
- Interface de atendimento WhatsApp redesenhada com referencia no WhatsApp Web para operacao mais pratica.
- Integracao de agentes WhatsApp unificada em `users/{uid}.whatsapp` (sem dependencia de colecao legada dedicada).
- Estatisticas de WhatsApp materializadas em `whatsappMetrics/current` para reduzir leituras no Firestore.
- Assistente de IA para tarefas de apoio (processamento e analise).
- Sanitizacao centralizada no frontend (`js/sanitization.js`) para reduzir risco de XSS em renderizacoes via `innerHTML`.
- Hardening de prompt no processamento de contratos com delimitadores `<CONTRATO>...</CONTRATO>` e bloqueio explÃ­cito de instruÃ§Ãµes embutidas no texto analisado.
- Monitoramento de leituras do Firestore para controle de custo/performance.
- Rate limiting persistente no backend em `_rateLimits` com expiraÃ§Ã£o via TTL (`expiresAt`) para reduzir bypass em ambiente serverless.
- Feature flags de rollout em `settings/system_flags` para ativacao gradual das otimizacoes.
- Realtime delta para aprovacoes via `realtimeAprovacaoNotifications` (fetch por ID alterado).
- Agregados diarios de aprovacoes em `aprovacoesAggDaily/{YYYY-MM-DD}` e links materializados de conversao em `aprovacaoConversaoLinks/{processoId}`.
- Politica de rotacao de senha com expiracao a cada 60 dias e bloqueio de acesso ate a troca.

## Arquitetura tecnica

### Frontend (shell principal + paginas dedicadas)

- HTML + JavaScript (ES6+) + CSS.
- Bootstrap 5.3+ e Bootstrap Icons.
- Inicializacao de UI centralizada por componentes/modais/offcanvas.
- `dashboard.html` concentra o painel inicial e a shell administrativa principal.
- `index.html` atua apenas como redirect legado para preservar links antigos.
- `processos.html`, `aprovacao.html`, `configuracoes.html`, `relatorios.html`, `ferramentas.html`, `agenda.html`, `whatsapp.html`, `arquivados.html` e `profile.html` executam rotas dedicadas para reduzir DOM, listeners e caches carregados no shell principal.

Arquivos centrais:

- `js/firestoreService.js`: camada principal de dados (CRUD, upload, IA, integracoes).
- `js/cacheService.js`: cache em memoria + IndexedDB com TTL.
- `js/paginationService.js`: paginacao por cursor com integracao de cache.
- `js/listenerOptimizer.js`: estrategia de listeners em tempo real.
- `js/sanitization.js`: utilitarios de escape/sanitizacao para texto, atributos e IDs no DOM.
- `js/ui.js`: renderizacao principal da interface.
- `js/eventListeners.js`: eventos de DOM.
- `js/pages/`: inicializadores por pagina.
- `js/modals/` e `js/offcanvas/`: componentes de interface.

### Backend

- Firebase Cloud Functions (`functions/index.js`) em Node.js 22.
- Firestore para dados transacionais.
- Firebase Storage para anexos, documentos de aprovacao e midias operacionais.
- Firebase Authentication com RBAC.

### Otimizacao de leituras (P0+P1+P2)

- Flags de sistema (`settings/system_flags`):
  - `enablePermissionsCacheFix`
  - `enableReadMonitorDeltaCounting`
  - `enableAprovacoesRealtimeDelta`
  - `enableAprovacoesAggregatesReadPath`
  - `enableContractsHeavyFallback`
- Defaults locais quando `settings/system_flags` ainda nao existe:
  - `enablePermissionsCacheFix=true`
  - `enableReadMonitorDeltaCounting=true`
  - `enableAprovacoesAggregatesReadPath=true`
  - `enableContractsHeavyFallback=false`
- Leitura de KPIs de aprovacao pode usar caminho agregado (sem full-scan de `aprovacoes`).
- Conversao de aprovacoes pode usar links materializados (`aprovacaoConversaoLinks`) para reduzir join em memoria.
- Realtime de aprovacao usa notificacao lightweight + fetch em lote por IDs alterados.
- Listeners de chat interno, erros QA e notificacoes de aprovacao foram alinhados ao `listenerOptimizer` para reduzir sobrecarga em tempo real.
- Fallback legado permanece disponivel para rollback por flag.
- Bootstrap da aplicacao da prioridade a cache persistente de contratos antes de full-read no Firestore.
- Estatisticas legadas de aprovacoes usam `count()` agregado para reduzir custo de leitura.

#### Rollout gradual recomendado

1. Estado padrao local: `enablePermissionsCacheFix` e `enableReadMonitorDeltaCounting` ativos, `enableAprovacoesAggregatesReadPath=true` e `enableContractsHeavyFallback=false`.
2. Onda opcional: ativar `enableAprovacoesRealtimeDelta` quando o canal `realtimeAprovacaoNotifications` estiver validado no ambiente.
3. Rollback rapido: usar `settings/system_flags` para forcar `enableAprovacoesAggregatesReadPath=false` ou `enableContractsHeavyFallback=true`.

#### Auditoria MCP apos alteracoes de regras/queries

```bash
cd mcp-server
node cli.js auditar_metricas_leitura
node cli.js auditar_indices_firestore
node cli.js validar_governanca_firestore "{}"
```

### Autenticacao e senha

- Controle de seguranca por usuario na colecao `user_security`.
- Novos usuarios sao criados com `mustChangePassword = true` (troca obrigatoria no primeiro acesso).
- A expiracao de senha e de 60 dias, aplicada para todos os perfis (incluindo administradores).
- Quando vencida, o frontend redireciona para `profile.html?forcePasswordRotation=1` e bloqueia o uso ate concluir a troca.
- Quando uma rota dedicada exige autenticacao (`processos.html`, `aprovacao.html`, `relatorios.html`, etc.), o redirect para `login.html` preserva o destino em `?next=` para retornar o utilizador a pagina solicitada apos o login.
- Cloud Functions relacionadas:
  - `getPasswordPolicyState`
  - `markPasswordRotationCompleted`
  - `enforcePasswordRotation` (scheduler diario)

## Stack e requisitos

### Requisitos locais

- Node.js 22.
- npm 10+.
- Firebase CLI instalado globalmente (`npm i -g firebase-tools`).
- Projeto Firebase configurado (arquivo `.firebaserc`).

### Dependencias relevantes

- Frontend/build: PostCSS, Autoprefixer, cssnano, ESLint.
- Backend/functions: `firebase-functions`, `firebase-admin`, `@google-cloud/vertexai`.
- Ferramentas extras: Playwright (diagnosticos e automacoes).

## Setup rapido

1. Clone o repositorio e entre na pasta:

```bash
git clone <url-do-repositorio>
cd "Gestor - Registro de Contratos"
```

2. Instale dependencias do projeto web:

```bash
npm install
```

3. Instale dependencias das Cloud Functions:

```bash
cd functions
npm install
cd ..
```

4. Ajuste configuracoes do Firebase no cliente:

- revise `js/auth.js` com as credenciais do projeto;
- confirme regras e indices em:
  - `firestore.rules`
  - `firestore.indexes.json`
  - `storage.rules`

5. Rode em ambiente local:

```bash
npm run serve
```

## Comandos do projeto

### Raiz

| Comando | Objetivo |
| --- | --- |
| `npm run build:css` | Build de CSS (PostCSS + Autoprefixer + cssnano) |
| `npm run watch:css` | Watch do CSS durante desenvolvimento |
| `npm run lint` | Lint dos arquivos `js/*.js` |
| `npm run lint:fix` | Lint com correcao automatica |
| `npm run release:verify` | Verifica consistencia de release (build, SW e headers) |
| `npm run release:prepare` | Build CSS + lint + bump de build + verificacao |
| `npm run release:prepare:dry` | Simula o preparo de release sem alterar arquivos |
| `npm run release:deploy` | Release completo padronizado (firestore + functions + hosting) |
| `npm run release:deploy:backend` | Release padronizado apenas de backend (firestore + functions) |
| `npm run release:deploy:hosting` | Release padronizado apenas de hosting |
| `npm run release:rebuild:aprovacoes` | Reconstrui agregados historicos de AprovaÃ§Ãµes |
| `npm run serve` | Servidor local Firebase |
| `npm run start` | Servidor local em rede (`0.0.0.0`) |
| `npm run deploy` | Deploy completo (hosting + functions) |
| `npm run deploy:hosting` | Deploy apenas do Hosting |
| `npm run deploy:functions` | Deploy apenas das Functions |

### Pasta `functions/`

| Comando | Objetivo |
| --- | --- |
| `npm run serve` | Emulador apenas das Functions |
| `npm run shell` | Shell de Functions |
| `npm run deploy` | Deploy apenas das Functions |
| `npm run logs` | Logs das Functions |

## Deploy

Fluxo de release padronizado recomendado:

```bash
npm run release:prepare
npm run release:deploy
```

O que esse fluxo garante:

- recompilacao de CSS antes do deploy;
- lint obrigatorio;
- bump sincronizado de `window.__APP_BUILD__`, query string de `swRegistration.js` e `CACHE_VERSION` do `sw.js`;
- validacao automatica dos headers de cache em `firebase.json`;
- sequencia de deploy com backend antes do hosting no release completo.

Deploy por alvo:

```bash
npm run release:deploy:hosting
npm run release:deploy:backend
```

Validacao sem alterar arquivos:

```bash
npm run release:prepare:dry
```

Quando houver mudanca estrutural nos agregados de AprovaÃ§Ãµes, execute tambem:

```bash
npm run release:rebuild:aprovacoes
```

Observacoes operacionais:

- `release:rebuild:aprovacoes` usa `GOOGLE_APPLICATION_CREDENTIALS`, `serviceAccountKey.json` ou, como fallback local, a sessao autenticada do `firebase-tools`;
- em releases somente de frontend, prefira `npm run release:deploy:hosting`;
- em releases que alterem Functions, Rules ou estruturas agregadas, prefira `npm run release:deploy`.

## Servidor MCP (opcional)

O projeto possui servidor MCP local em `mcp-server/` para consulta de dados e auditorias tecnicas.

Tambem suporta o servidor MCP oficial do Firebase CLI (recomendado para assistencia de IA):

```json
{
  "servers": {
    "firebase": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "firebase-tools@latest", "mcp", "--dir", "${workspaceFolder}"]
    }
  }
}
```

Arquivo pronto no repositorio: `.vscode/mcp.json`.

Setup:

```bash
cd mcp-server
npm install
node index.js
```

Observacoes:

- para acesso real ao Firestore, configure credenciais (`serviceAccountKey.json`) conforme instrucoes em `mcp-server/README.md`;
- nao versione credenciais sensiveis.
- para o MCP oficial do Firebase CLI, autentique com:
  - `npx -y firebase-tools@latest login`
  - `npx -y firebase-tools@latest use <project-id>`
  - validacao de ferramentas: `npx -y firebase-tools@latest mcp --generate-tool-list`

## Skills do Codex (opcional)

A skill `$interface-design` foi versionada localmente e sincronizada com o repositorio de referencia `Dammyjay93/interface-design`.

Arquivos no projeto:

- `.codex/skills/interface-design/SKILL.md`
- `.codex/skills/interface-design/references/principles.md`
- `.codex/skills/interface-design/references/validation.md`
- `.codex/skills/interface-design/references/critique.md`
- `.codex/skills/interface-design/references/example.md`

Instalacao no ambiente local do Codex:

```powershell
Copy-Item -Recurse -Force ".codex/skills/interface-design" "$env:USERPROFILE/.codex/skills/interface-design"
```

Depois de instalar, reinicie a sessao do Codex para carregar a nova skill.

## Padroes obrigatorios de desenvolvimento

- Usar Bootstrap 5.3+ e Bootstrap Icons.
- Usar JavaScript moderno sem jQuery.
- Design system: usar tokens de `css/variables.css` (evitar hex avulso fora desse arquivo).
- Em codigo novo, usar tokens canonicos e evitar aliases legados (`--primary-color`, `--cor-primaria`, etc.).
- Validacao de formularios: HTML5 + Bootstrap (`needs-validation` e `novalidate`) via `js/formValidation.js`.
- Usar sintaxe Firebase v9 compat (nao misturar com modular).
- Toda operacao de dados deve passar por `js/firestoreService.js`.
- Dar prioridade a cache (`js/cacheService.js`) e paginacao (`js/paginationService.js`) para reduzir leituras.
- Listeners em tempo real devem passar por `js/listenerOptimizer.js`.
- Inicializacao de componentes deve seguir `initUIComponents(options)` (auto-render padrao desativado).
- Nunca expor segredos/chaves no cliente.

## Estrutura do repositorio

```text
.
|- index.html
|- aprovacao-solicitacao.html
|- login.html
|- profile.html
|- scheduling-portal.html
|- whatsapp-dashboard.html
|- js/
|  |- firestoreService.js
|  |- cacheService.js
|  |- paginationService.js
|  |- listenerOptimizer.js
|  |- ui.js
|  |- pages/
|  |- publicAprovacaoSolicitacao.js
|  |- modals/
|  |- offcanvas/
|- css/
|- functions/
|  |- index.js
|- mcp-server/
|  |- index.js
|- firestore.rules
|- firestore.indexes.json
|- storage.rules
|- CHANGELOG.md
```

## Troubleshooting rapido

- Erros de permissao/acesso: valide regras em `firestore.rules` e claims de usuario.
- Erros de build CSS: rode `npm run build:css` e confira dependencias PostCSS instaladas.
- Problemas de custo/performance no Firestore: use os monitores de leitura (`js/firestoreReadMonitor.js` e `js/firestoreReadMetricsService.js`) e revise consultas sem cache/paginacao.
- WhatsApp nao recebe mensagens: confirme no Meta a URL `https://southamerica-east1-<project-id>.cloudfunctions.net/whatsappWebhook` e a assinatura do campo `messages`.

## Chave de consulta

- Os contratos agora suportam os campos `codigoCCA`, `tipoConsulta` e `chaveConsulta`.
- A chave segue o formato `CODIGOCCA_CPFDIGITOS_CONTRATOCEFDIGITOS_TIPO`.
- O tipo de consulta aceito na UI e no Firestore e fechado em `PR`, `CP`, `GR`, `RV` e `MI`.
- No `details-modal`, a chave e gerada automaticamente a partir de `codigoCCA`, `tipoConsulta`, CPF principal e `nContratoCEF`.
- O `codigoCCA` pode ser definido por empreendimento no `modal-empreendimento-edit` e e aplicado automaticamente no `details-modal` como default, no mesmo fluxo de cartorio/agencia.
- Na alteracao em massa, ao informar `codigoCCA` e/ou `tipoConsulta`, a `chaveConsulta` e regerada automaticamente por processo no backend.

## Changelog

Toda mudanca relevante deve ser registrada em `CHANGELOG.md`.

