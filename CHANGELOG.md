<!-- markdownlint-disable MD022 MD024 MD032 MD004 -->
# Changelog
## [2026-04-27] - Ajuste de ordenacao em relatorios
### Corrigido
- `js/reportsPage.js` passa a ordenar o desempenho por Vendedor/Construtora pela coluna `Processos`, usando `Valor Total` e nome como desempate.
- `js/reportsService.js` deixa de aplicar a preferencia local de workflow em `relatorios.html` quando o filtro visivel esta em `Todos`.

## [2026-04-24] - Exportacoes de arquivados e relatorios
### Corrigido
- `js/archivedContractsPage.js` passa a exportar os campos completos configurados para contratos arquivados, sem preencher campos vazios indevidamente com o ID.
- `js/reportsService.js` e `js/reportsApprovalAdapter.js` passam a normalizar datas no CSV de `relatorios.html` para `dd/mm/aaaa` ou `dd/mm/aaaa hh:mm`.
- `js/reportsApprovalAdapter.js` deixa de usar agregados por `dataEntrada` quando o filtro da aba Aprovação está em `dataAprovacao`, evitando divergência entre total da tela e CSV.
- `js/reportsApprovalAdapter.js` e `js/aprovacaoService.js` passam a separar explicitamente os ranges de `dataAprovacao` e `dataEntrada` na aba Aprovação, corrigindo o seletor "Campo de Data".
- `js/aprovacaoService.js` e `js/reportsPage.js` padronizam o ranking de analistas da aba Aprovação para sempre exibir a coluna `Total`, inclusive quando o ranking vem dos agregados.
- `js/aprovacaoService.js` passa a reconciliar campos legados `byAnalyst.*` nos agregados diarios, alinhando `#reports-approval-summary` e `#analistas` ao filtrar por Data de Entrada.
- `functions/index.js` corrige a escrita incremental de `byAnalyst` nos agregados de aprovação para evitar novos campos pontilhados.
- `js/reportsPage.js` adia o carregamento do catálogo/diretório da aba Aprovação até a abertura de `#tab-aprovacao`, reduzindo o custo inicial de `relatorios.html`.
- `js/firestoreReadMetricsService.js`, `js/firestoreReadMonitor.js` e o MCP de consistência passam a registrar e auditar usuário, página, página por hora, página por coleção e amostras recentes com horário exato das leituras Firestore.

### Alterado
- `js/archivedContractsPage.js` renderiza a primeira pagina de arquivados assim que ela chega e continua carregando os demais lotes, reduzindo a espera inicial percebida.
- A exportação CSV de Aprovação percorre todas as páginas retornadas por `listAprovacoes` antes de gerar o arquivo.

## [2026-04-24] - Auditoria de atividades e exportacoes
### Corrigido
- `js/activityLogService.js` deixa de quebrar ao resolver perfis nulos e passa a tratar logs legados sem `shortName`.
- `js/activityLogService.js` permite consultar atividades sem enriquecimento N+1 de usuarios/processos para reduzir leituras no Firestore.
- O monitor de leituras passa a expor leituras sem colecao/fonte mapeada e carrega o interceptador nas entradas autenticadas principais.
- `firestore.rules` passa a validar `userUid` em `activity_logs` e restringe leitura a admin ou ao proprio autor do log.
- `dashboard.html` carrega o feed de atividades com visibilidade segmentada: admin ve o feed global e nao-admin ve apenas as proprias atividades.
- `js/reportsPage.js` passa a consultar atividades com filtro server-side e varredura paginada, em vez de depender de um unico fetch client-side.
- `relatorios.html` passa a manter a navegacao principal acima dos filtros de Processos e Atividades, evitando salto visual no carregamento.

### Alterado
- Exportacoes e importacoes CSV de Processos, Aprovacao e Relatorios passam a salvar copia auditavel na Storage e registrar `storagePath` no log.
- O feed de atividades do dashboard passa a exibir 10 itens e usa apenas os snapshots gravados em `activity_logs`.
- Atualizacoes de status em massa passam a registrar eventos `BULK_STATUS_CHANGE` com comprador principal, ator e status anterior/novo.
- Exclusao de processo, exclusao de analise, importacao CSV e eventos sensiveis do WhatsApp (mensagem recebida, assumir, transferir, finalizar, reabrir e exportar conversa) passam a alimentar `activity_logs`.
- O dashboard deixa de executar a rotina de graficos removidos quando `#chart-section-container` nao existe.
- `firestore.indexes.json` inclui indices adicionais para filtros de atividades por `userUid`, tipo e data.
- `firebase-functions` foi atualizado para `^7.2.5` e o lock das Functions recebeu correcoes transitivas sem `--force`.
- `firestore.indexes.json` passa a versionar o indice `aprovacoes(construtora, createdAt)` ainda usado nos relatorios.

## [2026-04-24] - Limpeza da arquitetura hibrida de arquivados
### Alterado
- `functions/index.js` remove os fallbacks de reidratacao via JSON no Storage e passa a tratar `archivedContracts` como fonte unica dos contratos arquivados.
- `js/firestoreService.js`, `js/cacheService.js` e `js/archivedContractsPage.js` deixam de usar nomes de cache e descricoes ligadas ao fluxo `storageArchive`.

### Removido
- Removidos o servico legado `js/storageArchiveService.js` e a documentacao operacional `docs/backfill-archived-contracts.md`.
- Removidas as callables legadas de backfill/migracao baseadas em backups JSON do Storage.

## [2026-04-23] - Details modal unificado em arquivados
### Alterado
- `arquivados.html` passa a carregar o mesmo stack visual do `DetailsModal` de `processos`, incluindo `css/ai-components.css` e a nova comunicacao sobre restauracao sob demanda.
- `js/archivedContractsPage.js` deixa de usar um modal proprio e passa a abrir o mesmo `#details-modal`, carregando usuarios, status, agencias e os modulos auxiliares necessarios por importacao dinamica.
- `js/eventListeners.js` integra o novo controlador compartilhado para tratar contexto `active|archived` e restauracao automatica antes da primeira mutacao no modal.
- `js/ui.js` e `js/pendenciasUI.js` passam a respeitar o modo arquivado do modal, exibindo placeholders neutros em abas dependentes de `contracts` ate a restauracao.

### Adicionado
- `js/detailsModalController.js` centraliza o contexto do modal de detalhes, a restauracao idempotente de arquivados e os placeholders das abas dependentes da colecao ativa.

### Removido
- `js/modals/ArchivedContractsDetailsModal.js` deixa de ser usado, substituido pelo mesmo `DetailsModal` compartilhado com a pagina de Processos.


## [2026-04-23] - Restaurar configuração de exibição de campos por status
### Corrigido
- Restaurada a configuração de `visibleFields` no modal unificado `#status-workflow-unified-modal`, agora acessível pela aba `Status`.
- A tab unificada de `Regras de Campos` deixa de apagar `visibleFields` ao salvar apenas `requiredFields`.
- `js/firestoreService.js` passa a preservar `requiredFields` e `visibleFields` já existentes quando um dos arrays não é informado no salvamento da regra.

### Alterado
- `js/modals/StatusWorkflowUnified_StatusTab.js` adiciona ação `Configurar exibição no Details`, com modal inline que deriva os campos diretamente do `DetailsModal`.
- A tabela da aba `Status` passa a indicar quando um status já possui configuração de exibição focada para o modal de detalhes.

## [2026-04-20] - Chave de consulta em detalhes, defaults de empreendimento e lote
### Adicionado
- Novos campos persistidos em `contracts`: `codigoCCA`, `tipoConsulta` e `chaveConsulta`.
- Geração automática da chave de consulta no `#details-modal`, com formato `CODIGOCCA_CPFDIGITOS_CONTRATOCEFDIGITOS_TIPO`.
- Suporte a `PR`, `CP`, `GR`, `RV`, `MI` como tipos fechados de consulta.
- Regeração automática da `chaveConsulta` na alteração em massa quando `codigoCCA`, `tipoConsulta` ou `nContratoCEF` exigem recomposição.
- Campo de `Código CCA` no `#modal-empreendimento-edit`, usado como default do `details-modal` junto com cartório e agência padrão.

### Alterado
- `js/firestoreService.js` centraliza a normalização e validação da chave de consulta.
- `js/ui.js`, `js/eventListeners.js`, `js/modals/DetailsModal.js`, `js/modals/VendorsModals.js`, `js/vendorsUI.js`, `js/vendorsInlineIntegration.js` e `js/collapses/BulkUpdateCollapse.js` passam a expor os novos campos e a bloquear salvamento individual quando a chave estiver ausente ou desatualizada.
- `js/config.js` recebeu labels de histórico para os novos campos.

### Testes
- Adicionado teste unitário do helper puro de chave de consulta em `tests/consultaKeyService.test.js`.

## [2026-04-17] - Tempo da fila aguardando restaurado no WhatsApp

### fix: exibir tempo de espera na aba `Aguardando` do `whatsapp.html`

- Atualizados `js/whatsappUI.js` e `js/whatsappService.js`:
  - a lista `#whatsapp-queue-list` passa a calcular o tempo de espera com fallback para chats sem `createdAt`;
  - a UI usa `reopenedAt`, `createdAt`, `aprovacaoLeadCreatedAt`, `lastMessageTimestamp`, `updatedAt` e `lastBotUpdate` para montar o status temporal;
  - a ordenacao da fila passa a usar o mesmo critério de timestamp, evitando itens sem `createdAt` no topo com tempo vazio.

## [2026-04-01] - Central de relatorios reorganizada por origem

### feat: separar processos, aprovacoes e WhatsApp na pagina `relatorios.html`

- Atualizados `relatorios.html`, `css/utilities.css`, `js/reportsPage.js`, `js/reportsApprovalAdapter.js`, `js/reportsService.js` e `js/aprovacaoService.js`:
  - a central de relatorios passa a operar com trilha principal por origem (`Processos`, `Aprovacao` e `WhatsApp`), mantendo navegacao interna de processos para leitura operacional;
  - filtros deixam de ser globais e passam a ser contextuais por origem, com novos filtros de empreendimento em processos e filtros dedicados de situacao, analista, construtora, empreendimento e conversao em aprovacoes;
  - a aba de aprovacoes ganha provider proprio, leitura por agregados quando elegivel, uso de `aprovacaoConversaoLinks` como base de conversao e consumo primario de `aprovacaoSolicitacoes`;
  - o ranking de analistas deixa de usar `cadastros` e `pontuacao` e passa a mostrar total, aprovadas, reprovadas, condicionadas, taxa de aprovacao e pendentes de conversao;
  - exportacao passa a respeitar a origem ativa, com exportacao dedicada para aprovacoes e manutencao do fluxo detalhado/customizado em processos.

## [2026-04-01] - Recuperacao das metricas da pagina standalone de relatorios

### fix: restaurar datasets completos, SLA por metadata e relatorios auxiliares da tela `relatorios.html`

- Atualizados `relatorios.html`, `js/reportsPage.js`, `js/reportsService.js`, `js/firestoreService.js` e `js/errorManagementService.js`:
  - a pagina standalone de relatórios volta a carregar automaticamente mesmo com cache frio e passa a usar dataset completo de contratos em vez do recorte inicial de 300 registros;
  - o estado vazio passa a ocultar KPIs, navegação por abas e conteúdo analítico quando não há dados retornados;
  - o cálculo de finalização, cancelamento, SLA e aging passa a respeitar `statusConfig.archiveContracts` e a configuração real de `slaConfig`;
  - o bloco de WhatsApp passa a combinar `chats`, `users.whatsapp`, `whatsappMetrics/current` e `whatsappMetricsDaily`, com fallback de timestamp para chats sem `createdAt`;
  - a exportação personalizada do standalone volta a inicializar campos e ações via `exportService`;
  - a seção `#geografico` é removida da navegação da página, mantendo o resumo mensal em aba própria;
  - o relatório de QA ganha fallback para leitura completa de `collectionGroup('erros')` quando a consulta filtrada exige índice ainda não disponível.

## [2026-04-01] - Provisionamento de user_permissions para usuarios novos e legados

### feat: criar e recuperar documentos de permissao de forma idempotente no backend

- Atualizado `functions/index.js`:
  - novos usuarios criados por `createNewUser` passam a receber `user_permissions/{uid}` no mesmo fluxo de provisionamento;
  - `setAdminRole`, `removeAdminRole` e `resetUserPermissions` passam a sincronizar o papel base em `user_permissions`, evitando divergencia entre custom claims e a UI;
  - adicionado backfill admin-only `backfillMissingUserPermissions`, para provisionar em lote usuarios legados sem documento de permissao;
  - leituras server-side de permissao passam a autocriar o documento ausente com fallback consistente, reduzindo falhas em fluxos que dependem explicitamente da colecao;
  - exclusao de usuario agora remove tambem os documentos associados em `user_permissions` e `user_security`.

## [2026-04-01] - Sidebar do dashboard respeita apenas admin-only na navegacao

### fix: evitar ocultar itens adicionais da sidebar para usuario nao admin

- Atualizado `js/permissionsUIHelper.js`:
  - o filtro generico por modulo deixa de esconder itens comuns da `#sidebar`;
  - na navegacao lateral principal, apenas itens marcados explicitamente como `admin-only` ou `data-admin-only-nav="true"` passam a ser ocultados;
  - com isso, no `dashboard.html`, o usuario nao admin volta a ver os `nav-item` permitidos, mantendo ocultos somente `Relatorios` e `Configuracoes`.

## [2026-04-01] - Fallback seguro para permissoes ausentes

### fix: impedir erro de permissao ao criar aprovacoes com usuario nao admin sem documento em user_permissions

- Atualizado `js/permissionsService.js`:
  - `getUserPermissions()` deixa de tentar criar `user_permissions/{uid}` no cliente quando o documento nao existe;
  - nesses casos, a aplicacao passa a usar o papel local padrao de `analyst`, alinhado ao comportamento legado de permissoes e compativel com as regras do Firestore, que reservam a escrita dessa colecao para administradores;
  - o ajuste elimina a cascata de `Missing or insufficient permissions` vista na inicializacao do `PermissionsUIHelper` e no cadastro de novas analises/aprovacoes para usuarios autenticados sem provisioning previo.

## [2026-03-28] - Correcoes de codificacao UTF-8 na UI critica

### fix: normalizar textos quebrados e caracteres estranhos em telas principais

- Atualizados `configuracoes.html`, `processos.html`, `login.html`, `dashboard.html`, `aprovacao.html`, `relatorios.html`, `ferramentas.html`, `sw.js`, `js/whatsappAttachments.js`, `js/statusAdminUI.js` e `js/modals/DetailsModal.js`:
  - corrigidos textos com mojibake e padronizado pt-BR visivel em titulos, labels, placeholders, toasts e mensagens de runtime;
  - removidos caracteres estranhos em pseudo-elementos e titulos da aba de fechamento do modal de detalhes;
  - ajustadas mensagens do Service Worker para manter notificacoes e estado offline com texto legivel.
- Atualizado o versionamento de build nas paginas standalone e no `sw.js` para refletir o deploy publicado em `2026-03-28.21-22-46`.

## [2026-03-28] - Bancada de documentos expandida em Ferramentas

### feat: ampliar fluxo de PDF na pagina ferramentas

- Atualizados `ferramentas.html`, `js/pages/toolsPageInit.js` e `css/utilities.css`:
  - a pagina `ferramentas.html` deixa de ser uma lista linear de utilitarios e passa a operar como uma bancada de documentos com hero, navegacao por categorias e cards por fluxo;
  - os fluxos de `Juntar PDF`, `Organizar PDF` e `Rotacionar PDF` passam a operar em um unico editor de montagem por pagina;
  - mantidas as capacidades existentes de juntar, organizar, desbloquear e converter PDF para JPG;
  - adicionada a ferramenta local de `Dividir PDF`, sem dependencia de upload externo;
  - a interface ganha estados de status, atalhos de navegacao e tratamento visual proprio para saidas em PDF e ZIP.

### chore: renomear projeto para Sistema Gestor de Processos

- Atualizados `README.md`, `AGENTS.md`, `package.json` e paginas standalone:
  - o nome principal do produto passa de `Gestor de Contratos` para `Sistema Gestor de Processos`;
  - titulos HTML e metadados principais passam a refletir a nova identidade do projeto.

## [2026-03-17] - Realtime de aprovacoes ativado por padrao e deltas mais consistentes

### fix: refletir mudancas de processos e aprovacoes para outros usuarios com menor custo de leitura

- Atualizados `js/firestoreService.js`, `js/realtimeSyncService.js`, `js/aprovacaoRealtimeSyncService.js`, `js/aprovacaoService.js` e `js/pages/aprovacaoPageInit.js`:
  - `enableAprovacoesRealtimeDelta` passa a nascer ativo no fallback local quando `settings/system_flags` nao existe;
  - o delta de contratos e aprovacoes deixa de reutilizar cache potencialmente obsoleto para buscar sempre o documento atualizado no Firestore;
  - delecoes passam a invalidar caches pontuais antes de notificar a UI;
  - a tela de aprovacoes deixa de fazer recarga completa a cada delta simples e passa a aplicar patch local quando a alteracao nao afeta filtros, ordenacao ou paginacao;
  - atualizacoes em massa de processos e a conversao de aprovacao em processo passam a publicar delta de `contracts`, cobrindo fluxos que antes nao notificavam os demais usuarios.
- Atualizados `js/pages/authenticatedPageBootstrap.js` e `js/firestoreService.js`:
  - a validacao de politica de senha passa a reaproveitar cache de sessao por 5 minutos entre as paginas standalone;
  - o perfil do usuario passa a usar cache persistente em `cacheService` e `localStorage`, reduzindo leituras repetidas a cada navegacao;
  - a troca entre paginas passa a pintar dados basicos do usuario imediatamente e a paralelizar carregamento de permissoes, perfil e claims.

## [2026-03-17] - Padronizacao do runtime Node.js em 22

### docs: alinhar ambiente local, Functions e MCP em Node 22

- Atualizados `package.json`, `package-lock.json`, `mcp-server/package.json` e `mcp-server/package-lock.json`:
  - o repositório raiz e o servidor MCP passam a declarar `engines.node = 22`;
  - o runtime das Cloud Functions permanece em Node 22 como fonte de verdade.
- Atualizados `README.md`, `AGENTS.md`, `CLAUDE.md` e `.github/copilot-instructions.md`:
  - documentação e instruções operacionais deixam de mencionar Node 20 ou `22+`;
  - o padrão do projeto passa a ser Node 22 em ambiente local e deploy.
- Adicionados `.nvmrc` e `.node-version`:
  - ferramentas locais de versionamento passam a resolver automaticamente o runtime esperado do projeto.

## [2026-03-12] - Estado centralizado e realtime resiliente em Processos

### fix: restaurar bootstrap de modais na tela standalone de configuracoes

- Atualizado `js/main.js`:
  - `initializeConfiguracoesPage()` volta a inicializar `SettingsUI` e `NotificationUI` no contexto standalone;
  - botoes programaticos de modal/atalhos da tela de configuracoes (como monitor de leituras e fluxos auxiliares do shell) voltam a operar como antes da extracao da pagina.

### fix: preservar busca e filtros da pagina de processos em atualizacoes remotas

- Atualizados `js/main.js`, `js/eventListeners.js`, `js/realtimeSyncWrapper.js`, `js/firestoreService.js`, `js/ui.js` e `processos.html`:
  - criada a estrutura interna `ProcessosViewState` para centralizar `view`, busca, filtros, workflow, ordenacao, paginacao e refresh silencioso;
  - busca da pagina passa a usar `draftSearchTerm` + `appliedSearchTerm`, com persistencia em `sessionStorage`, botao de limpar e indicador visual de busca ativa;
  - retorno da aba apos periodo em background volta a restaurar view, ordenacao, workflow, `rowsPerPage`, arquivados e contexto de busca da guia;
  - updates remotos recebidos por `realtimeNotifications` deixam de provocar recarga cega da lista e passam a aplicar delta local, com refresh silencioso apenas quando necessario;
  - refresh silencioso preserva busca, filtros, pagina, view e ordenacao dos demais usuarios;
  - offcanvas de filtros continua coerente apos atualizacoes remotas, incluindo badges e selecoes atuais.
- Atualizados `js/pages/authenticatedPageBootstrap.js` e `js/pages/processosPageEntry.js`:
  - `processos.html` deixa de ser descartada automaticamente apos tempo em background;
  - o descarte por aba oculta continua habilitado nas demais paginas standalone.
- Atualizados `js/realtimeSyncService.js` e `js/realtimeSyncWrapper.js`:
  - notificacoes de realtime passam a carregar tambem o identificador humano do autor da alteracao;
  - o toast do cliente agora menciona o nome reduzido, depois nome completo e, no fallback, o email de quem alterou o processo.

## [2026-03-11] - Separação de Processos/Aprovação e redução de memória

### perf: mover processos e aprovacao para paginas dedicadas

- Adicionados `processos.html` e `aprovacao.html`:
  - cada tela passa a carregar apenas o markup e os scripts necessários para seu fluxo principal;
  - navegação dedicada preserva autenticação, logout e retorno ao shell principal.
- Adicionado `configuracoes.html`:
  - a área administrativa ganha rota dedicada, com sidebar compartilhada e inicialização direta da tela de configurações;
  - links `index.html#configuracoes` e itens de navegação passam a apontar para a rota exclusiva.
  - o bloco legado de `page-configuracoes` deixa o `index.html`, reduzindo DOM e scripts acoplados ao shell principal.
- Adicionado `relatorios.html`:
  - a central de relatórios ganha rota dedicada com bootstrap autenticado e sidebar compartilhada;
  - o bloco legado de `page-relatorios` e os scripts `reports*` deixam o `index.html`.
- Adicionados `ferramentas.html` e `agenda.html`:
  - utilitários de PDF e a agenda passam a carregar apenas em suas rotas dedicadas;
  - os blocos legados `page-ferramentas` e `page-agenda` deixam o `index.html`, junto dos assets de PDF usados exclusivamente em Ferramentas.
- Adicionado `whatsapp.html`:
  - a operação principal do chat WhatsApp passa a usar rota dedicada com bootstrap autenticado e shell compartilhada;
  - `page-whatsapp`, estilos e scripts específicos do chat deixam o `index.html`.
- Consolidado `profile.html` como rota oficial do perfil:
  - o bloco legado de `page-perfil` deixa o `index.html`;
  - sidebar compartilhada e redirects por hash passam a apontar para a rota dedicada de perfil.
- Adicionado `arquivados.html`:
  - contratos arquivados passam a usar rota dedicada com bootstrap autenticado e sidebar compartilhada;
  - o bloco legado de `page-arquivados` e o carregamento específico da tela deixam o `index.html`.
- Adicionado `dashboard.html`:
  - o dashboard passa a operar como rota principal dedicada;
  - `index.html` deixa de carregar a aplicação e passa a funcionar apenas como redirect legado para `dashboard.html` e demais rotas extraídas.
- Adicionados `js/pages/authenticatedPageBootstrap.js`, `js/pages/processosPageEntry.js` e `js/pages/aprovacaoPageEntry.js`:
  - bootstrap compartilhado para páginas autenticadas com `initialize()`, `refresh()` e `dispose(reason)`;
  - descarte balanceado em `pagehide` e após 60 segundos em background, com reload limpo ao voltar para a aba.
- Adicionados `js/sidebarShell.js` e `js/standaloneSidebar.js`:
  - a sidebar passa a ser renderizada por componente compartilhado em `index`, `processos`, `aprovacao` e `configuracoes`;
  - páginas dedicadas usam um controlador mínimo próprio para recolher/expandir a navegação lateral sem depender do shell principal.
- Ajustados `js/authRedirect.js`, `js/login.js`, `js/main.js`, `js/pages/authenticatedPageBootstrap.js`, `js/profile.js` e `js/inactivityService.js`:
  - acessos autenticados em rotas dedicadas passam a preservar `?next=` ao redirecionar para `login.html`;
  - após o login, o utilizador retorna para a página standalone originalmente solicitada, em vez de cair sempre no dashboard.
- Ajustados `js/sidebarShell.js` e `js/permissionsUIHelper.js`:
  - a sidebar compartilhada passa a expor `data-module` e `data-admin-only-nav` para compatibilizar permissões com os novos links `*.html`;
  - itens admin-only do perfil e módulos restritos do menu voltam a respeitar claims/permissões após a extração das páginas.
- Atualizado `js/bookingLinkService.js`:
  - links públicos de agendamento passam a apontar para `scheduling-portal.html`, evitando rota quebrada após a reorganização das páginas dedicadas.
- Atualizado `js/main.js`:
  - `index.html` deixa de carregar contratos/processos no boot quando a tela de processos não está presente no DOM;
  - nova inicialização standalone para `processos.html`, com `disposeProcessosPage()` limpando listener do Kanban, caches em memória e sync em tempo real;
  - navegação por hash do shell principal passa a respeitar `index.html#relatorios`, `#dashboard`, `#arquivados` e demais páginas internas.
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - adicionados teardown de listeners/timers e `dispose(reason)`;
  - KPI de conversão deixa de fazer fallback no navegador para `getAllContracts({ includeArchived: true })`, usando apenas o caminho agregado e degradando para estado parcial/estimado.
- Atualizados `index.html`, `README.md` e `CHANGELOG.md`:
  - `processos` e `aprovacao` saem da SPA principal;
  - menu lateral do shell principal passa a apontar para `processos.html` e `aprovacao.html`;
  - bootstrap de componentes do shell principal deixa de importar modais/offcanvas exclusivos de processos.

## [2026-03-10] - Login, bootstrap inicial e hardening de cache

### chore: padronizar fluxo de release

- Atualizado `package.json`:
  - adicionados `release:verify`, `release:prepare`, `release:deploy`, `release:deploy:backend`, `release:deploy:hosting` e `release:rebuild:aprovacoes`.
  - `deploy:hosting:fresh` passa a reutilizar o fluxo padronizado de release.
- Atualizado `scripts/bump-app-build.js`:
  - o bump de release agora sincroniza tambem o `CACHE_VERSION` do `sw.js`.
- Adicionados `scripts/release.js`, `scripts/verify-release.js`, `scripts/rebuild-aprovacao-aggregates.js` e `scripts/release-config.js`:
  - orquestracao cross-platform do release;
  - verificacao automatica de consistencia de build/SW/headers;
  - padronizacao do backfill administrativo de agregados de Aprovação.
- Atualizado `README.md`:
  - documentado o fluxo oficial de release para evitar regressao de cache, custo e performance em producao.

### fix: evitar dupla autenticacao e corridas no login

- Atualizado `js/formValidation.js`:
  - validacao do login passa a expor `validate()` sem registrar um segundo fluxo de submit.
- Atualizado `js/login.js`:
  - submit do login agora usa um unico caminho de validacao/autenticacao.
  - adicionado lock contra cliques/envios repetidos e fallback explicito quando `auth` nao estiver pronto.

### perf: reduzir trabalho bloqueante no carregamento inicial

- Atualizado `js/main.js`:
  - preferencias de filtro passam a reutilizar o mesmo documento de perfil do usuario, evitando roundtrip duplicado para `users/{uid}`.
  - preload completo de contratos sai do caminho critico e passa a ser sob demanda no fluxo de Kanban/Processos.
  - estado da politica de senha passa a ser cacheado na sessao para reduzir chamadas repetidas a cada `F5`.
  - dashboard inicializa em modo leve e aguarda cache completo de contratos antes de carregar dados detalhados.
  - cold start sem cache deixa de aceitar timeout prematuro para status dinamicos, evitando inicializacao com `0 status`.
  - `loadContractsPage()` so trata a tela como Kanban quando a pagina ativa e realmente `processos`, evitando `getAllContracts()` na home/dashboard.
- Atualizado `js/eventListeners.js`:
  - entrada em `Processos` volta a forcar `kanban` como visualizacao padrao no `toggle-view-btn`.
- Atualizado `js/cacheService.js`:
  - `warmCache()` agora aceita flags para pular warming remoto de status/permissoes quando o bootstrap principal ja esta cuidando dessas leituras.
- Atualizado `js/dashboardUI.js`:
  - KPIs iniciais usam caminho leve quando o cache completo ainda nao esta pronto.
  - graficos deixam de disparar `getAllContracts()` no primeiro paint quando o cache global ainda nao foi hidratado.

### fix: reduzir risco de assets defasados no F5

- Atualizado `sw.js`:
  - removido pre-cache de HTML/JS da app shell.
  - navegacao e assets estaticos passam a dar prioridade a `network-first` com cache como fallback.
  - service worker agora ignora requests nao-GET e usa TTL menor para assets estaticos/dinamicos.

### perf: reduzir full-reads em aprovacoes

- Atualizado `js/aprovacaoService.js`:
  - agregados diarios de aprovacoes passam a usar cache dedicado para evitar leituras repetidas do mesmo periodo.
  - novo agregado global (`aprovacoesAggSummary/global`) passa a ser lido quando nao ha filtro por periodo, reduzindo custo para KPIs totais e ranking.
  - `listAprovacoesForMetrics()` passa a usar limite legacy mais seguro por padrao, evitando varredura completa da colecao.
  - KPI de conversao ganha fallback por `count()` quando os links materializados ainda nao existem, evitando leitura integral de `aprovacoes`.
  - nova listagem leve de solicitacoes de analise faz scan incremental limitado, em vez de baixar toda a colecao.
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - solicitacoes de analise passam a usar a listagem leve dedicada.
  - KPI de conversao deixa de forcar fallback legacy pesado quando a leitura agregada ja consegue responder.
  - atualizacao delta invalida cache local de lista/KPI para refletir mudancas de outros usuarios com menor atraso.
- Atualizado `js/reportsPage.js`:
  - ranking de analistas passa a preferir agregados no backend, evitando fetch massivo de aprovacoes.
  - atualizacao delta invalida cache de aprovacoes antes de recalcular ranking e conversao.
- Atualizado `functions/index.js`:
  - trigger de aprovacoes passa a manter tambem um agregado global em `aprovacoesAggSummary/global`.
  - adicionada callable administrativa `rebuildAprovacaoAggregates` para reconstruir agregados historicos sem leitura no cliente.
- Atualizado `firestore.rules`:
  - liberada leitura autenticada de `aprovacoesAggSummary`, mantendo escrita exclusiva do backend.

## [2026-03-09] - Invalidação de cache e atualização imediata de frontend

### fix: reduzir atraso de propagação de correções para usuários finais

- Atualizado `firebase.json`:
  - adicionados headers de `Cache-Control` para `sw.js`, HTML, JS e CSS.
  - HTML e SW passam a usar `no-cache, no-store, must-revalidate` para evitar app shell defasado.
- Atualizado `sw.js`:
  - novo comando `SKIP_WAITING` no canal de mensagens para ativação imediata de nova versão.
  - hardening no handler de mensagens para payload ausente.
- Adicionado `js/swRegistration.js`:
  - registro global do Service Worker com `registration.update()` a cada carregamento.
  - detecção de `updatefound` + `controllerchange` com recarregamento automático da página para aplicar a versão nova.
- Atualizado `js/whatsappNotifications.js`:
  - evita registro duplicado de Service Worker ao reutilizar registro existente quando disponível.
- Atualizados `index.html`, `login.html`, `profile.html`, `call.html`, `scheduling-portal.html`, `aprovacao-solicitacao.html`, `whatsapp-dashboard.html`, `whatsapp-workflows.html`:
  - inclusão de `window.__APP_BUILD__` e carregamento de `js/swRegistration.js?v=2026.03.09.1`.
- Adicionado `scripts/bump-app-build.js` e scripts npm:
  - `npm run bump:build` para atualizar automaticamente `__APP_BUILD__` e `swRegistration.js?v=` nas páginas HTML.
  - `npm run deploy:hosting:fresh` para bump + deploy em sequência.

## [2026-03-08] - Telemetria de leituras e defaults de custo

### perf: reduzir full-reads por padrao em aprovacoes e contratos

- Atualizado `js/firestoreService.js`:
  - `enableAprovacoesAggregatesReadPath` passa a ser `true` no default local.
  - `enableContractsHeavyFallback` passa a ser `false` no default local para evitar fallback automatico em `getAllContracts()`.
- Atualizado `js/aprovacaoService.js`:
  - leitura agregada de aprovacoes passa a ser o caminho padrao quando `settings/system_flags` estiver ausente.

### fix: explicitar leituras sem atribuicao em `_readMetrics`

- Atualizado `js/firestoreReadMetricsService.js`:
  - schema local de metricas passa a persistir `reads.attributedTotal` e `reads.unattributedTotal`.
  - relatorios diarios/historicos agora calculam taxa de atribuicao e expõem bucket `__unattributed__` quando houver gap legado.
  - recomendacoes passam a alertar quando a telemetria estiver parcial.
- Atualizado `functions/index.js`:
  - `getReadMetrics` agora retorna `attributedReads`, `unattributedReads` e `attributionRate`.
- Atualizado `js/modals/ReadMetricsDashboardModal.js`:
  - dashboard exibe taxa de atribuicao e destaca leituras nao atribuidas.

### docs: alinhar estrategia de rollout de custo

- Atualizado `README.md`:
  - documentados os defaults locais de `system_flags` para aprovacoes agregadas e fallback pesado de contratos.

## [2026-03-05] - Hardening backend (seguranca, resiliencia e custo)

### fix: seguranca de regras, IA e cadastro de usuarios

- Atualizado `firestore.rules`:
  - correção explícita de precedência lógica em `attachments` (`update/delete`) com parênteses para evitar ambiguidades de avaliação.
- Atualizado `functions/index.js`:
  - endurecimento do prompt do Vertex AI em `extractContractDataWithVertex` com delimitadores `<CONTRATO>...</CONTRATO>`, sanitização de entrada e instruções anti prompt-injection.
  - validação reforçada de `createNewUser` com e-mail em formato RFC-like e política de senha forte (maiúscula, minúscula, número, símbolo e tamanho mínimo).

### perf: rate limiting persistente + cache de permissões

- Atualizado `functions/index.js`:
  - `checkRateLimit` migrado de memória efêmera para persistência em Firestore (`_rateLimits`) com fallback local controlado.
  - `secureOnCall` e `submitAprovacaoIntake` agora utilizam rate limit assíncrono persistente.
  - introduzido cache transitório de `user_permissions` para reduzir leituras repetidas em checks RBAC (`canManageAprovacaoIntake` e `canViewAprovacaoRecords`) com invalidação após updates.

### fix: proteção contra loop prolongado no bot

- Atualizado `functions/whatsappBot.js`:
  - adicionado limite de tempo e de passos por mensagem (`BOT_MAX_EXECUTION_MS`, `BOT_MAX_STEPS_PER_MESSAGE`).
  - ao exceder limite, fluxo encerra com transferência para humano e mensagem de fallback.

### chore: governança de índice/TTL e documentação

- Atualizado `firestore.indexes.json`:
  - adicionado `fieldOverride` com TTL para `_rateLimits.expiresAt`.
  - sincronizado com os índices já existentes em produção (`firebase firestore:indexes`), removendo o aviso de 30 índices ausentes no arquivo local durante deploy.
- Atualizado `README.md`:
  - documentado hardening de prompt IA e rate limiting persistente.
- Auditoria MCP executada:
  - `node cli.js auditar_indices_firestore` (baseline atualizado para validar cobertura de índices existentes).

### fix: padronizar uso de largura total nas páginas da `main-content`

- Atualizado `index.html`:
  - adicionada classe `page-main-full` nas páginas `page-dashboard`, `page-agenda`, `page-arquivados`, `page-relatorios`, `page-ferramentas`, `page-configuracoes` e `page-perfil`.
- Atualizado `css/style.css`:
  - criada a regra `.page-main-full` para ocupar toda a largura disponível (`max-width: none`, `width: 100%`, `margin: 0`).
- Escopo preservado:
  - nenhuma alteração estrutural aplicada em `page-aprovacao`, `page-processos` e `page-whatsapp`.

### fix: reduzir escala visual global da interface para 90%

- Atualizado `css/variables.css`:
  - novo token global `--app-zoom: 0.9`.
- Atualizado `css/style.css`:
  - aplicado `zoom: var(--app-zoom, 1)` no `html` para reduzir toda a UI em 10%, replicando o efeito de zoom 90% do navegador.

### fix: bloquear edicao de compradores por padrao no details-modal

- Atualizado `js/modals/DetailsModal.js`:
  - adicionado botao `#toggle-compradores-edit-btn` no card de Compradores da aba `Dados Principais`;
  - botao ajustado para formato icon-only, com `title` e `aria-label` dinâmicos.
- Atualizado `js/ui.js`:
  - novo controle de estado para compradores com `setCompradoresEditMode(enabled)` e `isCompradoresEditModeEnabled()`;
  - ao abrir/preencher o modal, compradores passam a iniciar em modo leitura (edicao bloqueada).
- Atualizado `js/eventListeners.js`:
  - botao de toggle alterna entre habilitar e bloquear edicao dos compradores;
  - acoes de adicionar/remover/tornar principal passam a exigir modo edicao habilitado.
- Atualizado `css/style.css`:
  - estilos visuais para estado readonly em `#compradores-container.compradores-readonly` (campos e acoes desativados, com suporte a dark mode);
  - estilo compacto quadrado para `#toggle-compradores-edit-btn`.

### fix: remover limite de largura interno da page-perfil

- Atualizado `css/style.css`:
  - adicionado override em `#page-perfil .profile-container` para eliminar `max-width: 1200px` herdado de utilitarios;
  - `page-perfil` passa a ocupar toda a largura útil de `#main-content` (sem centralização por container interno).

### fix: hardening frontend (xss, listeners e permissao)

- Novo arquivo `js/sanitization.js`:
  - escape/sanitizacao central para texto, atributos e IDs no DOM.
- Atualizado `js/adminPermissionsUI.js` e `js/agenciasUI.js`:
  - sanitizacao de valores dinamicos em `innerHTML`.
  - remocao de `onclick` inline em agencias, com delegacao de eventos via `data-action`.
- Atualizado `js/ui.js`:
  - `renderContracts()` agora escapa conteudo e atributos antes de renderizar a tabela.
  - removida estrategia de `cloneNode/replaceChild` para limpar listeners, com `removeEventListener` explicito.
  - evitado acumulo de listeners em filtros de status ao re-renderizar.
- Atualizado `js/firestoreService.js`:
  - `filterContractsByPermissions()` em fail-closed (`[]`) quando permissao falha/indisponivel.
  - otimizacao de `getContractsPageOriginal()` para evitar consulta de contagem quando a primeira pagina ja permite inferencia do total.
- Atualizado `js/cacheService.js`:
  - removido TTL permanente de `storageArchive*`; adotado TTL controlado para reduzir cache stale.
- Atualizado `js/analystChatService.js`, `js/errorManagementService.js` e `js/aprovacaoRealtimeSyncService.js`:
  - listeners realtime migrados para registro/controle via `listenerOptimizer`.
- Atualizado `js/dashboardUI.js`:
  - sanitizacao de titulo dinamico no modo de edicao de KPI.
- Validacao:
  - `npm run lint` executado com sucesso.

## [2026-03-04] - Padronizacao de construtora/empreendimento com suggestions

### feat: padronizar campos de construtora/empreendimento com `suggestions-list`

- Atualizado `js/modals/AddContractModal.js`:
  - `#add-vendedorConstrutora` e `#add-empreendimento` mantidos como `input` com `suggestions-list`.
  - removida criacao inline no modal de novo processo (sem botoes de cadastro rapido).
- Atualizado `js/modals/DetailsModal.js`:
  - `#modal-vendedorConstrutora` e `#modal-empreendimento` mantidos como `input` com `suggestions-list`.
  - fluxo dependente construtora -> empreendimento preservado com autocomplete.
- Atualizado `js/vendorsInlineIntegration.js`:
  - removida criacao inline de construtora, empreendimento, bloco e apartamento no `add-contract-modal`.
  - removida injecao dos botoes runtime `#btn-add-vendor`, `#btn-add-emp`, `#btn-add-apto`, `#btn-add-bloco`.
  - novo fluxo de populacao de sugestoes dependentes (construtora -> empreendimento) para `add-contract-modal` e `details-modal`.
  - preservacao de valores legados em `input` por valor preferencial, sem perda de dados no preenchimento.
  - mantida logica de defaults por empreendimento (cartorio/agencia) no `details-modal`.
- Atualizado `js/modals/AddAprovacaoModal.js`:
  - `updateEmpreendimentos()` refeito para manter `select` sempre (removido fallback `__other__` para `input`).
  - comparacao por nome normalizado (`trim + lowercase`) para construtora/empreendimento.
  - fluxo de edicao ajustado para preservar e selecionar valores legados sem perda.
- Atualizado `js/ui.js`:
  - `populateDetailsModal()` registra valores preferenciais para sincronizar com autocomplete de vendors.
  - integracao com `window.__VENDORS_INLINE__` para re-sincronizar sugestoes no modal de detalhes.
- Atualizado `js/eventListeners.js` e `js/modals/AddAprovacaoModal.js`:
  - bloqueio de criacao/salvamento quando a construtora informada nao pertence a listagem de `vendors`.
  - no `details-modal`, a validacao obrigatoria da listagem ocorre quando o campo de construtora foi alterado pelo usuario.
- Atualizado `js/aiContractUI.js`:
  - removidas todas as sugestoes inline (`.ai-inline-suggestion`) no `#contract-form` do `add-contract-modal`.

## [2026-03-03] - Otimizacao de leituras Firestore (P0+P1+P2)

### feat: rollout por flags e caminho agregado para aprovacoes

- Atualizado `js/firestoreService.js`:
  - novas APIs `getSystemFlags(options)` e `saveSystemFlags(flags)` usando `settings/system_flags`;
  - defaults de rollout adicionados e exposicao em `window.__SYSTEM_FLAGS__`.
- Atualizado `js/aprovacaoService.js`:
  - novo listener `listenForAprovacoesDelta(callback, options)` com integracao ao sync delta;
  - `getAprovacaoStats(options)` agora suporta `mode: 'aggregate' | 'legacy'` (com fallback automatico);
  - `listAprovacoesForMetrics(options)` suporta `preferAggregates`;
  - nova API `getAprovacaoConversionMetricsAggregate(options)` para conversao via agregados/links.
- Novo arquivo `js/aprovacaoRealtimeSyncService.js`:
  - listener lightweight em `realtimeAprovacaoNotifications`;
  - processamento em lote por IDs alterados;
  - eventos globais `realtime-aprovacao-updated`.

### perf: reducao de full-read e instrumentacao de cache

- Atualizado `js/permissionsService.js`:
  - corrigido uso incorreto de `cacheService.get(..., forceRefresh)` que forçava refresh continuo;
  - invalidacao e migracao transparente entre prefixes `user_perm_` e `user_perm_v2_`.
- Atualizado `js/userPermissionService.js`:
  - compatibilidade com cache legado e padronizacao para `user_perm_v2_`.
- Atualizado `js/cacheService.js`:
  - TTL explicito para `user_permissions` e `settingsFlags`;
  - hits/misses agora registrados em `readMetricsService.recordCacheAccess()` (`get`, `getSync`, `getCached`);
  - cache warming de permissoes grava chaves legacy e v2.
- Atualizado `js/firestoreReadMonitor.js`:
  - contagem de listeners ajustada para delta real (`added/modified`) apos evento inicial;
  - snapshots locais (`fromCache`/`hasPendingWrites`) ignorados no modo delta;
  - suporte a toggle por flag (`enableReadMonitorDeltaCounting`).
- Atualizado `js/agendaUI.js`:
  - select de contratos do modal de evento passou a usar pagina enxuta (`getContractsPage`) antes do fallback legado.
- Atualizado `js/whatsappUI.js`:
  - busca de vinculo de contrato da prioridade a dataset enxuto com cache local e fallback por flag.
- Atualizado `js/reportsPage.js`, `js/reportsService.js` e `js/pages/aprovacaoPageInit.js`:
  - caminho agregado para metricas/conversao quando habilitado;
  - fallback legado preservado por flag.

### backend: agregados diarios, notificacoes delta e links de conversao

- Atualizado `functions/index.js`:
  - nova trigger `syncAprovacaoAggregatesAndRealtime` em `aprovacoes/{aprovacaoId}`:
    - materializa `aprovacoesAggDaily/{YYYY-MM-DD}`;
    - publica delta em `realtimeAprovacaoNotifications`;
    - cria/remove links em `aprovacaoConversaoLinks/{processoId}` para `source: origem`.
  - nova callable admin `backfillAprovacaoConversaoLinksByCpf` para materializacao legado (`source: cpf`).
  - novo scheduler `cleanupAprovacaoRealtimeNotifications` para limpeza de notificacoes antigas no backend.

### chore: governanca de seguranca para colecoes agregadas

- Atualizado `firestore.rules`:
  - removida duplicidade de `match /realtimeNotifications/{notificationId}`;
  - adicionadas regras de leitura para:
    - `realtimeAprovacaoNotifications`
    - `aprovacoesAggDaily`
    - `aprovacaoConversaoLinks`
  - escrita direta no cliente bloqueada para colecoes agregadas e notificacoes de aprovacao.
- Auditorias MCP executadas:
  - `auditar_metricas_leitura`
  - `auditar_indices_firestore`
  - `validar_governanca_firestore`
  - sem necessidade de novos indices compostos para as novas queries de agregados/delta.

### fix: estabilizacao de bootstrap e reducao de full-read residual

- Atualizado `js/main.js`:
  - guardas contra inicializacao duplicada via `auth.onAuthStateChanged` para o mesmo usuario;
  - `loadNonCriticalResources` com idempotencia para evitar rebind de observers/listeners;
  - polling do dashboard passa a respeitar throttle no start (`refreshDashboardData(false)`);
  - fallback de contratos da prioridade a cache persistente (`contracts_all_active`) antes de buscar do Firestore;
  - permissao de admin deixa de forcar caminho de full-scan em `loadContractsPage`;
  - restauracao de filtros de `selectedVendors` e `selectedEmpreendimentos` volta a respeitar preferencia do Firestore no boot.
- Atualizado `js/eventListeners.js`:
  - navegacao para `processos` passa a recarregar via `loadContractsPage()` para evitar render com estado paginado residual (25 itens).
- Atualizado `js/main.js`:
  - no caminho paginado + Kanban, `appState.filteredContracts`/`totalContracts` passa a refletir o conjunto completo filtrado do Kanban (nao apenas a pagina atual).
- Atualizado `js/aprovacaoService.js`:
  - `getAprovacaoStats` legado agora usa `count()` agregado (com fallback para query completa se necessario), reduzindo leituras da colecao `aprovacoes`.
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - conversao de aprovacoes evita `getAllContracts({ includeArchived: true })` por padrao, dando prioridade a cache/pagina enxuta e fallback pesado por flag.
- Atualizado `js/eventListeners.js`:
  - inicializacao do `StatusAdminUI` protegida por validacao de container e lock de inicializacao para evitar tentativas fora de contexto.

## [2026-03-03] - Migracao WhatsApp para users.whatsapp + metricas materializadas

### feat: diagnostico e materializacao de metricas da integracao WhatsApp

- Atualizado `functions/index.js`:
  - nova callable `checkWhatsAppIntegrationHealth` para diagnostico administrativo da integracao (configuracao, webhook, numeros ativos, agentes e metricas);
  - nova callable `refreshWhatsAppMetrics` para recalculo manual de metricas;
  - novo scheduler `syncWhatsAppMetrics` (a cada 5 minutos) para materializar dados em `whatsappMetrics/current` e `whatsappMetricsDaily/{YYYY-MM-DD}`;
  - autoatribuicao no webhook migrada para agentes em `users.whatsapp` (sem dependencia de `whatsappAgents`);
  - `sendPushNotification` agora busca `fcmToken` em `users/{uid}.whatsapp.fcmToken`.

### refactor: remocao segura da colecao legacy `whatsappAgents`

- Atualizado `js/whatsappService.js`:
  - removidas leituras/escritas em `whatsappAgents`;
  - cadastro, status e contadores de agentes padronizados em `users/{uid}.whatsapp`;
  - transferencia, resolucao, reabertura e delecao de chats agora atualizam contadores via `users.whatsapp`;
  - listagens de agentes (`getAvailableAgents`, `listRegisteredAgents`, `getAvailableAgentsByDepartment`) consolidadas em `users`.
- Atualizado `js/whatsappNotifications.js`:
  - token FCM e configuracoes migrados para `users/{uid}.whatsapp`;
  - historico de notificacoes migrado para `users/{uid}/whatsappNotifications`.
- Atualizado `js/whatsappConfig.js`:
  - estatisticas passam a dar prioridade a leitura de `whatsappMetrics/current` com fallback seguro;
  - quando as metricas materializadas estiverem ausentes/desatualizadas, a UI tenta acionar `refreshWhatsAppMetrics` com throttle antes do fallback;
  - contagem de agentes online no fallback migrou para `users.whatsapp`.
- Atualizado `js/whatsappDashboard.js`, `js/reportsPage.js` e `js/whatsappUI.js`:
  - consultas de agentes migradas para `users.whatsapp`.

### chore: regras e indices alinhados com a nova modelagem

- Atualizado `firestore.rules`:
  - `isWhatsAppAgent()` agora valida em `users/{uid}.whatsapp.isAgent`;
  - removido bloco de regras de `whatsappAgents`;
  - adicionada regra de acesso para `users/{uid}/whatsappNotifications/{notificationId}`.
- Atualizado `firestore.indexes.json`:
  - removidos indices legados de `whatsappAgents`;
  - mantidos indices para consultas em `users.whatsapp.*`.

## [2026-02-28] - Redesign da page-whatsapp inspirado no WhatsApp Web

### feat: nova identidade visual para atendimento WhatsApp

- Atualizado `css/style.css`:
  - substituicao completa do bloco de estilos da `page-whatsapp` com layout mais pratico (lista de conversas + thread + painel de contexto);
  - refinamento visual da lista de chats, tabs de filtro, cabecalho da conversa, bolhas de mensagem, composer e painel lateral;
  - unificacao de estados light/dark com variaveis locais `--wa-*` para manter consistencia sem quebrar os IDs/classes do `js/whatsappUI.js`;
  - melhoria de responsividade para desktop, notebook e mobile na tela de atendimento.
- Atualizado `css/whatsapp-autocomplete.css`:
  - dropdown de mensagens rapidas alinhado ao novo visual da conversa (borda, hover, destaque e scroll).
- Build de CSS executado com sucesso:
  - `css/style.min.css` regenerado;
  - `css/whatsapp-autocomplete.min.css` regenerado.

## [2026-02-28] - Correcao de data no modal de aprovacao

### fix: evitar `RangeError: Invalid time value` ao abrir edicao de aprovacao

- Atualizado `js/modals/AddAprovacaoModal.js`:
  - `fillFormForEdit` passou a usar `normalizeDateInputValue` para preencher os campos de data, evitando `toISOString()` direto sobre valores invalidos;
  - `dataEntrada` em edicao agora considera fallback legado (`entrada`, `createdAt`, `criadoEm`) quando necessario;
  - `normalizeDateInputValue` foi endurecida para validar retorno de `toDate()` antes de formatar.
- Atualizado `js/modals/AprovacaoDetailsModal.js`:
  - corrigido fluxo do botao `Editar` para preservar a aprovacao atual antes de fechar o modal de detalhes;
  - evita abertura do `AddAprovacaoModal` sem dados quando a edicao e iniciada por `#aprovacao-details-edit`.

## [2026-02-28] - Hardening do chat interno

### fix: reforco de seguranca para conversas e anexos do chat interno

- Atualizado `firestore.rules`:
  - leitura de `analystChats` restrita a participantes da conversa;
  - criacao exige usuario autenticado dentro de `participants`;
  - leitura/criacao/update de `analystChats/{chatId}/messages` restritos a participantes;
  - criacao de mensagem exige `senderUid == request.auth.uid`.
- Atualizado `storage.rules`:
  - adicionado helper `isAnalystChatParticipant(chatId)` com consulta ao Firestore;
  - leitura de `analystChat/{chatId}/{filename}` restrita a participantes (ou admin);
  - upload de anexo exige participante da conversa e metadata `uploadedBy` com UID autenticado;
  - exclusao permitida para admin ou autor do upload (quando participante).
- Atualizado `js/aiChatUI.js`:
  - upload de anexos no chat interno agora envia `customMetadata.uploadedBy` e `chatId` para compatibilidade com regras de seguranca.

### perf: reducao de custo de leitura/escrita no chat interno

- Atualizado `js/analystChatService.js`:
  - `markAsRead` com throttle (1.5s) para evitar chamadas redundantes em snapshots sucessivos;
  - leitura de mensagens para marcar `readBy` reduzida de 50 para 30 documentos recentes;
  - update de `unread` executado apenas quando ha mensagens nao lidas;
  - limpeza periodica do mapa de throttle.
- Atualizado `js/aiChatUI.js`:
  - chamada de `markAsRead` condicionada a existencia de nao lidas no chat ativo;
  - indicador de digitacao passa a enviar `typing=true` apenas na transicao de estado, reduzindo writes por tecla;
  - reset de typing ao enviar mensagem, fechar widget ou voltar para lista.

### refactor: remocao de implementacao duplicada de chat

- Removido `js/offcanvas/AnalystChatOffcanvas.js` (fonte duplicada em relacao ao widget unificado `aiChatUI`).
- Removido `css/analyst-chat.css` legado (nao utilizado apos unificacao no `css/ai-chat.css`).

### fix: notificacoes iniciais, confirmacao de anexo e exibicao de avatares no chat interno

- Atualizado `js/aiChatUI.js`:
  - adicionado sync em background de nao lidas com `onAuthStateChanged` + listener de chats, sem exigir abrir a aba de chat;
  - upload de anexo em conversa agora pede confirmacao explicita do usuario antes de enviar;
  - avatar do contato na conversa direta passa a aparecer no header do widget;
  - adicionados fallbacks de foto para `#ac-user-list` e `#ac-chat-list` usando cache de usuarios e hidratacao sob demanda.
- Atualizado `js/analystChatService.js`:
  - resolucao de foto padronizada com prioridade `avatarUrl > photoURL > fotoPerfil`;
  - `listAvailableUsers`, `getOrCreateDirectChat` e `createGroupChat` passam a usar o novo resolvedor para evitar avatar vazio.

### feat: personalizacao de conversas em grupo no chat interno

- Atualizado `js/aiChatUI.js`:
  - adicionada nova vista `Personalizar grupo` com edicao de nome, descricao, emoji e cor;
  - adicionada opcao de foto para avatar do grupo (upload com preview), com fallback para emoji/cor;
  - adicionada gestao de membros no `Personalizar grupo` com busca, adicao/remocao e validacao de minimo de 2 membros;
  - novo atalho no header da conversa em grupo para abrir configuracao rapidamente;
  - avatar de grupos passa a respeitar personalizacao (foto ou emoji/cor) na lista e no header.
- Atualizado `js/analystChatService.js`:
  - criado metodo `updateGroupChat(chatId, updates)` para persistir personalizacao de grupos;
  - personalizacao agora suporta persistencia de foto do grupo (`groupAvatarUrl`, `groupAvatarPath`);
  - `updateGroupChat` agora aceita `memberUids` e reconstrui mapas de participantes (`participants`, `participantNames`, `participantPhotos`, `unread`, `typing`);
  - novos defaults em grupos criados: `groupEmoji`, `groupColor` e `groupDescription`.
- Atualizado `css/ai-chat.css`:
  - adicionados estilos para avatar customizado, preview e gerenciador de membros do grupo.

## [2026-02-27] - Correção de anexos em aprovação

### fix: persistir e exibir documentos anexados no fluxo de aprovacao

- Atualizado `js/modals/AddAprovacaoModal.js`:
  - ao finalizar uploads, os metadados dos arquivos agora sao gravados em `aprovacoes/{id}.documentos`;
  - garante que os documentos aparecam no modal `Detalhes da Aprovacao` apos criar/editar analise.
- Atualizado `js/firestoreService.js` (`uploadFile`):
  - retorno da funcao passou a incluir metadados do arquivo enviado (nome, tipo, tamanho, `storagePath`, `url`);
  - callback de progresso passa a ser opcional (com validacao de tipo).
- Atualizado `js/modals/AprovacaoDetailsModal.js`:
  - adicionado fallback para anexos legados em `contracts/{aprovacaoId}/anexos` quando `aprovacao.documentos` estiver vazio.

### fix: fallback local quando provedores de IA falham no processamento de aprovacao

- Atualizado `js/documentProcessingService.js`:
  - quando `extractContractData` falhar em todos os provedores, o processamento tenta extracao local heuristica do texto (CPF, cliente, situacao, renda, valor de financiamento, prazo e datas basicas);
  - retorno de `processFile` passa a sinalizar `metadata.fallbackUsed` e `provider: local_fallback` quando aplicavel, evitando erro fatal no fluxo.
- Atualizado `js/modals/AddAprovacaoModal.js`:
  - upload de anexos nao fecha mais silenciosamente quando todos os arquivos falham;
  - em falha parcial, exibe aviso com os nomes dos arquivos nao enviados.
- Atualizado `js/modals/AprovacaoDetailsModal.js`:
  - fallback de anexos legados passou a mesclar registros de `aprovacao.documentos` + `contracts/{id}/anexos`, com deduplicacao por caminho/URL/nome.

## [2026-02-27] - Preenchimento local sem IA no modal de aprovacao

### feat: adicionar autofill local no `#add-aprovacao-modal` para formularios CAIXA

- Atualizado `js/modals/AddAprovacaoModal.js`:
  - novo botao `#aprovacao-local-process-document-btn` (`Preencher sem IA`) no mesmo bloco de upload do formulario;
  - adicionado estado interno `usedLocalAutofill` para controlar a origem do ultimo auto-preenchimento;
  - novo fluxo `processAprovacaoDocumentLocal()` com status dedicado e logs `[AddAprovacaoModal][LocalParser]`;
  - secao `#aprovacao-ai-section` ajustada para refletir os dois modos (IA e Local), com mensagens de contexto no processamento;
  - layout do upload em `#aprovacao-ai-section` reorganizado para input + botoes em grid responsiva, evitando sobreposicao de texto em larguras menores;
  - resultado local passa a reutilizar `aiFormResult` (compatibilidade com `Reaplicar Dados`) e aplica somente campos vazios;
  - `validateBeforeSubmit()` agora ignora validacao por IA quando o preenchimento local foi utilizado.
- Atualizado `js/documentProcessingService.js`:
  - novo metodo `processAprovacaoFileLocally(file, options = {})` sem chamada de IA;
  - parser deterministico focado no layout CAIXA `Formulário de Impressão AVALIAÇÃO DE RISCO` (CPF(s), cliente/participante, valores, prazo, situacao, codigos, agencia, origem/produto, renda e vencimento);
  - metadados padronizados com `provider: local_parser` e `fallbackUsed: true`;
  - limites de texto reaproveitados para manter baixo consumo de CPU/memoria.

### fix: salvar automaticamente o formulario usado no auto-preenchimento (IA e local)

- Atualizado `js/modals/AddAprovacaoModal.js`:
  - arquivo efetivamente usado no preenchimento agora fica rastreado em memoria (`autofillSourceDocument`);
  - no submit, esse arquivo entra automaticamente na fila de upload de documentos da aprovacao;
  - aplicada deduplicacao para nao reenviar arquivo que ja esteja na lista de novos uploads ou nos documentos existentes;
  - `aiValidation` passou a registrar metadados do documento utilizado (nome, tamanho, modo e provider).

## [2026-02-27] - Otimizacao da validacao por IA (aprovacao)

### perf: reduzir consumo de memoria e latencia no processamento de documentos IA

- Atualizado `js/documentProcessingService.js`:
  - adicionados limites de processamento para PDF (`maxPdfInitialPages`, `maxPdfFinalPages`, `maxCharsPerPdfPage`, `maxCharsTotal`);
  - implementado truncamento de texto antes de enviar para IA (`maxPromptChars`) para reduzir payload e custo de hashing/cache;
  - limitado `rawText` retornado (`maxRawTextChars`) para evitar retenção de texto grande no estado do front-end;
  - adicionado cleanup explicito de paginas/PDF (`cleanup`/`destroy`) para reduzir pressao de memoria;
  - otimizada conversao de imagem para OCR com redimensionamento antes do base64 quando aplicavel.
- Atualizado `js/modals/AddAprovacaoModal.js`:
  - fluxo `processAprovacaoDocument()` passou a enviar limites de processamento para `documentProcessingService`;
  - estado `aiFormResult` agora armazena apenas dados essenciais (sem manter texto bruto completo);
  - `analyzeFileWithAI()` passou a usar limites mais conservadores para processamento em lote.

## [2026-02-27] - Sistema de Gestao de Erros (QA)

### feat: sistema unificado de gestao de erros e qualidade (QA)

- Criado `js/errorManagementService.js`:
  - servico completo de CRUD para erros (reportar, listar, avaliar, excluir);
  - erros de admins sao aprovados automaticamente; demais ficam pendentes;
  - listener em tempo real via `onSnapshot` para atualizacao instantanea;
  - contagem de pendencias visiveis por usuario via `listarPendenciasVisiveis()`;
  - historico consolidado exibindo apenas erros aprovados;
  - historico consolidado visivel apenas para administradores;
  - exclusao de erro permitida para admin ou para o usuario criador do erro;
  - card de pendencias de erros com identificacao explicita de analista responsavel e reportador.
  - campo "Analista Responsavel" na aba de erros com `select` populado a partir dos analistas do modal;
  - funcao `renderErrosSection()` reutilizavel para renderizar formulario e listas;
  - funcao `buscarErrosParaRelatorio()` com `collectionGroup('erros')` para relatorios;
  - funcao `calcularMetricasQA()` para agregacao de dados (por setor, origem, ofensores);
  - exposto globalmente via `window.errorManagementService`.
- Atualizado `js/modals/DetailsModal.js`:
  - adicionada aba "Erros (QA)" com badge de contagem na barra de navegacao;
  - aba "Erros (QA)" reposicionada ao lado da aba "Pendencias";
  - adicionado tab content pane `tab-gestao-erros` com formulario e listas;
  - lazy loading: erros carregados apenas ao acessar a aba.
- Atualizado `js/modals/AprovacaoDetailsModal.js`:
  - adicionadas abas (`nav-pills`) "Dados" e "Erros (QA)" no conteudo do modal;
  - lazy loading da secao de erros ao abrir a aba via evento `shown.bs.tab`;
  - badge de pendencias atualizado ao abrir o modal, mesmo antes de acessar a aba;
  - cleanup dos listeners ao fechar o modal.
- Atualizado `js/ui.js`:
  - adicionado estado `errosTabState` e funcao `loadErrosForCurrentContract()`;
  - adicionada funcao `resetErrosTabState()` chamada ao abrir novo contrato;
  - integrado lazy load da aba gestao-erros na funcao `setupTabs()`;
  - adicionado listener leve para atualizar o badge da aba de erros assim que o modal abre.
- Atualizado `js/reportsPage.js`:
  - adicionado mapeamento de secao `qa-erros` na aba Desempenho;
  - adicionados elementos de referencia para KPIs, graficos e tabela de QA;
  - adicionados metodos `loadAndRenderQAReport()`, `renderQAKpis()`, `renderQASetorChart()`, `renderQAOrigemChart()`, `renderQAOfensoresTable()`;
  - chamada automatica de `loadAndRenderQAReport()` ao gerar relatorio.
- Atualizado `index.html`:
  - adicionado card "Gestao de Erros e Qualidade" na aba Desempenho da page-relatorios;
  - inclui KPIs (total, processos, aprovacoes, setores afetados);
  - inclui graficos de pizza (por setor) e barras (por origem);
  - inclui tabela de ranking de setores por falhas;
  - registrado script `js/errorManagementService.js`.
- Atualizado `firestore.rules`:
  - adicionada subcoleção `erros` dentro de `contracts` e `aprovacoes`;
  - leitura/criacao para autenticados; atualizacao/exclusao restrito a admin.
- Atualizado `firestore.indexes.json`:
  - adicionado indice collectionGroup para `erros` (status + criadoEm);
  - adicionado indice de colecao para `erros` (criadoEm desc).

## [2026-02-27] - Correcao de pendencias no details-modal

### fix: impedir exibicao de pendencias de outro processo ao trocar contrato

- Atualizado `js/pendenciasUI.js`:
  - adicionada protecao contra race condition no carregamento (`loadRequestId`) para ignorar respostas assincronas antigas;
  - sincronizado reset de contexto das pendencias ao abrir/fechar o `details-modal`, evitando vazamento visual entre processos;
  - ajuste do gatilho de recarga na aba `Pendencias` para usar o ultimo contrato efetivamente carregado (`lastLoadedContratoId`);
  - normalizacao do texto do toggle de historico quando nao houver pendencias resolvidas.

### fix: exibir historico de pendencias resolvidas sempre no details-modal

- Atualizado `js/pendenciasUI.js`:
  - listagem do modal passou a buscar sempre com `incluirResolvidas: true`;
  - historico de resolvidas passou a ser renderizado sempre que houver itens;
  - checkbox `#pendencias-mostrar-resolvidas` foi desativado e ocultado por nao ser mais necessario;
  - mantida contagem de badge baseada apenas nas pendencias ativas.

### feat: adicionar campos de aquisicao do imovel no details-modal

- Atualizado `js/modals/DetailsModal.js`:
  - adicionada secao `Aquisicao e Contrato` na aba `Dados Principais`;
  - novos campos: `modal-valorContrato`, `modal-valorNegociadoConstrutora` e `modal-valorContratoBanco`;
  - campos configurados como `type="text"` com `inputmode="decimal"` e placeholder `0,00` para preservar exibicao de formatos com virgula.
- Atualizado `js/ui.js` (`populateDetailsModal`):
  - preenchimento de `modal-valorContrato` com fallback para `valorDeclaradoTransacao`;
  - preenchimento de `modal-valorNegociadoConstrutora` por `valorNegociadoConstrutora`;
  - preenchimento de `modal-valorContratoBanco` com fallback para `valorContratoFinanciamento` e `valorFinanciamento`.
- Atualizado `js/config.js`:
  - `FIELDS_TO_TRACK` passa a rastrear os novos campos financeiros para historico de alteracoes:
    - `valorContrato`
    - `valorNegociadoConstrutora`
    - `valorContratoBanco`
  - `valorContrato` foi renomeado no historico para `Valor Financiado`.
- Atualizado novamente `js/modals/DetailsModal.js`:
  - rotulo `Valor de Aquisicao do Imovel (R$)` alterado para `Valor Financiado (R$)`;
  - adicionados os campos `modal-valorRecursosProprios`, `modal-valorFgts` e `modal-valorSubsidio`.
- Atualizado novamente `js/modals/DetailsModal.js`:
  - adicionado o campo `modal-valorAvaliacao` antes de `modal-valorNegociadoConstrutora`.
- Atualizado novamente `js/ui.js` (`populateDetailsModal`):
  - preenchimento de `modal-valorRecursosProprios` com fallback para `recursosProprios`;
  - preenchimento de `modal-valorFgts` com fallback para `valorFGTS`;
  - preenchimento de `modal-valorSubsidio` com fallback para `subsidio`.
  - preenchimento de `modal-valorAvaliacao` com fallback para `valorAvaliacaoImovel`.
- Atualizado novamente `js/config.js`:
  - `FIELDS_TO_TRACK` inclui `valorAvaliacao` para historico de alteracoes.
  - campo financeiro renomeado de `valorContratoFinanciamento` para `valorContratoBanco`.
- Atualizado novamente `js/modals/DetailsModal.js`:
  - removido o campo `Valor Declarado da Transação (R$)` da aba `Dados Principais`.
- Atualizado `js/ui.js`, `js/requirementsUI.js`, `js/archivedContractsPage.js`, `js/eventListeners.js`, `js/collapses/BulkUpdateCollapse.js` e `js/config.js`:
  - fluxos que usavam `valorDeclaradoTransacao` passaram a usar `valorContratoBanco`;
  - mantido fallback para `valorDeclaradoTransacao` apenas para compatibilidade com registros legados.

## [2026-02-26] - Fase 1 da padronizacao visual

### feat: consolidar fundacao do design system e governanca de tokens

- Atualizado `css/variables.css`:
  - contrato de tokens canonicos formalizado (cores, texto, bordas, controles, sombras, espacamento, tipografia, transicoes e z-index);
  - adicionados tokens de hierarquia de texto (`--text-tertiary`, `--text-disabled`);
  - adicionados tokens de progressao de borda (`--border-subtle`, `--border-emphasis`, `--border-strong`);
  - adicionados tokens de controles (`--control-*`) para inputs/selects/textarea;
  - alinhamento Bootstrap adicionado para light mode (ja existia para dark mode);
  - aliases legados marcados como `deprecated` e mantidos para compatibilidade;
  - `--input-bg` legado passa a apontar para `--control-bg`.
- Atualizado `.interface-design/system.md`:
  - adicionada secao de governanca da Fase 1 (source of truth, token policy, hard rules e policy de excecoes);
  - hierarquia tipografica expandida para incluir niveis `tertiary` e `disabled`;
  - regras atualizadas para reforcar uso de tokens canonicos e limitar `!important`.
- Adicionado `docs/UI_FOUNDATION_FASE1.md` (guia operacional local) e `.interface-design/UI_FOUNDATION_FASE1.md` (guia versionado):
  - escopo da Fase 1, contrato de tokens, regras obrigatorias, excecoes e checklist de PR.
- Adicionado `.interface-design/IMPLEMENTATION_PLAN_UI_STANDARDIZATION.md`:
  - plano de implementacao por fases (arquitetura CSS, componentizacao, rollout por paginas e higienizacao final).
- Atualizado `README.md`:
  - revisao de data para refletir a entrega de 2026-02-26;
  - secao de padroes obrigatorios reforca uso de tokens canonicos em `css/variables.css`.

### fix: padronizar `aprovacao-badge` com total global de analises

- Atualizado `js/badgeService.js`:
  - criado `updateAprovacaoTotalAnalises()` para usar `stats.total` de `aprovacaoService.getAprovacaoStats({ includeAllAuthenticated: true })`;
  - badge de aprovacao deixa de ser atualizado por `updateAllBadges(contracts)`, evitando oscilacao por filtros da UI;
  - adicionada revalidacao local (60s), deduplicacao de requisicoes em voo e listener com debounce para `aprovacao:changed`;
  - `updateAprovacoesPendentesConversao()` mantido por compatibilidade e delegado para a nova estrategia.
- Atualizado `js/aprovacaoService.js`:
  - novo evento global `aprovacao:changed` disparado apos `create`, `update`, `delete`, `convert` e `import` (quando houver sucesso);
  - permite atualizacao reativa do badge sem depender da navegacao para `page-aprovacao`.
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - `updateMenuBadge()` passou a refletir `state.stats.total` (total de analises), centralizando renderizacao via `BadgeService`.
- Atualizado `index.html`:
  - `aria-label` de `#aprovacao-badge` alterado para `Total de análises`.

### refactor: remover `aprovacao-badge` da sidebar

- Atualizado `index.html`:
  - removido o elemento `#aprovacao-badge` do item de menu "Aprovação".
- Atualizado `js/badgeService.js`:
  - removida a leitura de estatisticas para badge de aprovacao na inicializacao;
  - removido listener `aprovacao:changed` relacionado ao badge;
  - `updateAprovacaoTotalAnalises()` e `updateAprovacoesPendentesConversao()` mantidos apenas por compatibilidade, sem efeito na UI.
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - `updateMenuBadge()` convertido para no-op.
- Atualizado `js/aprovacaoService.js`:
  - removidos disparos do evento `aprovacao:changed` adicionados para o badge.

## [2026-02-25] - Intake publico de aprovacao (link + WhatsApp)

### feat: receber solicitacoes de aprovacao de credito por link seguro com LGPD

- Adicionado endpoint `submitAprovacaoIntake` em `functions/index.js`:
  - recebe solicitacao publica com token temporario;
  - valida consentimento LGPD;
  - cria registros em `aprovacaoSolicitacoes` e `aprovacoes`;
  - realiza upload de documentos para `Storage` privado em `aprovacao-intake/...`.
- Adicionada callable `generateAprovacaoIntakeLink` em `functions/index.js` para gerar links temporarios com limite de uso e expiracao.
- Adicionada nova pagina publica:
  - `aprovacao-solicitacao.html`
  - `js/publicAprovacaoSolicitacao.js`
  - `css/aprovacao-solicitacao.css`

### feat: gerar lead de aprovacao automaticamente quando chat WhatsApp entra no setor

- Atualizado `functions/index.js`:
  - novo helper `ensureAprovacaoLeadFromWhatsApp`;
  - webhook WhatsApp passou a criar lead em `aprovacoes` (idempotente por `origemWhatsAppChatId`) quando o departamento do chat for `Aprovação`.

### feat: atalho de geracao de link na page-aprovacao

- Atualizado `index.html`:
  - novo botao `Link Solicitação` no header da `page-aprovacao`.
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - integra com `generateAprovacaoIntakeLink` para gerar e copiar o link publico.

### feat: separar solicitacoes de analise da grade principal de aprovacoes

- Atualizado `index.html`:
  - novo botao `Solicitacoes de Analise` no header da `page-aprovacao`.
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - entradas vindas de intake (`whatsapp_bot` e `link_publico`) em fila inicial (`fila-aprovacao`) deixam de aparecer na tabela principal;
  - criada janela/modal `Solicitacoes de Analise` com listagem, atualizacao manual e acoes de visualizar/editar.

### fix: checklist de aprovacao deixa de ser bloqueante no cadastro manual

- Atualizado `js/modals/AddAprovacaoModal.js`:
  - removida a obrigatoriedade de marcar checklist antes de salvar nova analise;
  - texto de apoio da aba de checklist ajustado para comportamento opcional.

### fix: ordenar grade principal de aprovacao do mais novo para o mais antigo

- Atualizado `js/pages/aprovacaoPageInit.js`:
  - ordenacao inicial da tabela alterada para `dataEntrada` em ordem decrescente (`desc`).

### fix: corrigir exibicao de datas no modal de detalhes da aprovacao

- Atualizado `js/modals/AprovacaoDetailsModal.js`:
  - `formatDate` agora converte timestamps serializados (`seconds/_seconds` e `nanoseconds/_nanoseconds`) e objetos com `toMillis()`;
  - campos de data deixam de exibir `"[object Object]"` no modal de detalhes.
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - parser de data da grade principal passou a aceitar timestamps serializados e datas em formatos legados;
  - colunas `Data Entrada` e `Data Aprovacao` passam a exibir corretamente valores que antes apareciam vazios.

### fix: simplificar IA no modal de aprovacao e reforcar captura de renda/vencimento

- Atualizado `js/modals/AddAprovacaoModal.js`:
  - secao `#aprovacao-ai-section` simplificada para fluxo direto de upload + preenchimento automatico;
  - removida a exibicao detalhada de dados extraidos (`#ai-extracted-data-card`), mantendo apenas resumo operacional;
  - processamento do formulario com IA passou a considerar `rawText` para fallback local de `renda` e `vencSicaq` quando a IA nao retorna esses campos;
  - normalizacao de datas ampliada para aceitar `MM/AAAA` (conversao para ultimo dia do mes) e timestamps serializados.
- Atualizado `js/aiService.js`:
  - prompt de extracao de aprovacao reforcado para cenarios de `Validade` em `MM/AAAA` e valores de renda concatenados no OCR.

### feat: ampliar area util e distribuicao visual da page-aprovacao

- Atualizado `index.html`:
  - secao principal da grade recebeu classes de layout (`.aprovacao-results-section`, `.aprovacao-results-body`, `.aprovacao-table-scroll`, `.aprovacao-table-head`, `.aprovacao-results-footer`) para suportar expansao e scroll interno.
- Atualizado `css/style.css`:
  - `#page-aprovacao` passou a usar largura total da area de conteudo;
  - em desktop, a pagina passa a operar em layout vertical com secao de resultados ocupando o espaco restante da viewport;
  - tabela principal ganhou rolagem interna com cabecalho fixo para melhor leitura e navegacao;
  - ajustes de tema escuro aplicados ao cabecalho da tabela e rodape de paginacao;
  - linha de filtros inline no cabecalho da grade recebeu estilos dedicados para desktop/mobile e dark mode.
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - adicionados filtros inline por coluna em `Data Entrada`, `Empreendimento`, `Construtora`, `Situacao`, `Data Aprovacao` e `Analista`;
  - nova acao de limpeza rapida dos filtros inline na ultima coluna do cabecalho;
  - filtro inline de `Analista` agora lista apenas nomes presentes nas analises carregadas na grade.

### fix: corrigir navegacao de paginacao na page-aprovacao

- Atualizado `js/pages/aprovacaoPageInit.js`:
  - paginacao passou a usar cursores (`startAfterDoc`) por pagina para navegacao `Anterior/Proxima`;
  - reset de estado de paginacao centralizado para filtros, busca, ordenacao, alteracao de tamanho de pagina e filtros avancados;
  - protecao adicionada para evitar pagina invalida sem cursor conhecido;
  - adicionado cache local de paginas para evitar nova consulta ao alternar entre paginas ja carregadas;
  - filtro inline de `Analista` passou a consolidar nomes de analistas com analises no periodo (nao apenas os da pagina atual);
  - ao alterar/limpar filtro inline de `Analista`, a listagem agora recarrega com pagina 1 e paginacao consistente (filtro aplicado na consulta, nao apenas no render local).
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - filtros inline da grade passaram a disparar nova consulta paginada, evitando divergencia de resultados entre paginas;
  - limpeza de filtros inline agora reinicia pagina e recarrega dados quando existir qualquer filtro ativo.
- Atualizado `js/pages/aprovacaoPageInit.js` + `css/style.css`:
  - carregamento da grade passou a ser suave (sem remover linhas existentes durante filtros/consultas), reduzindo a "piscada" visual;
  - durante carga com dados em tela, a tabela aplica apenas estado visual de loading leve por opacidade.
- Atualizado `index.html` + `css/style.css`:
  - grade principal de aprovacao passou a usar larguras fixas por coluna com `colgroup`;
  - coluna `Cliente` recebeu largura maior para melhorar leitura de nomes;
  - colunas textuais longas agora aplicam truncamento com ellipsis para manter alinhamento consistente.
- Atualizado `js/aprovacaoService.js`:
  - adicionada funcao `getAprovacaoCursorDocById` para resolver cursor por ID quando o retorno vem do cache persistente.
- Atualizado `js/aprovacaoService.js`:
  - cache persistente da listagem passou a considerar paginas com cursor (`cursorId`), reduzindo leituras repetidas em navegacao;
  - filtros em array (`situacao`, `construtora`, `analista`) agora aplicam `in` corretamente;
  - paginação com filtros client-side (busca textual e contains) passou a usar varredura incremental consistente para manter ordenacao/filtragem entre paginas.
- Atualizado `js/aprovacaoService.js`:
  - otimizada validacao de permissao em listagem/estatisticas para evitar leitura de `user_permissions` quando `includeAllAuthenticated=true`;
  - ordenacao com filtros de data passou a aplicar fallback seguro de indice (com degradacao controlada para ordenacao secundaria), reduzindo falhas de ordenacao/filtragem em cenarios sem indice composto.
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - KPI de conversao passou a usar cache persistente (`aprovacoes_conversion_summary_*`) para reduzir leituras repetidas ao reabrir a pagina.

### security: hardening de permissao e anexos no fluxo publico

- Atualizado `functions/index.js`:
  - geracao de link publico passou a exigir permissao valida do usuario em `user_permissions`;
  - validacao server-side de anexos (tipo, tamanho por arquivo e limite total por envio);
  - melhoria de idempotencia no webhook para evitar duplicacao de lead de aprovacao por chat WhatsApp.

### feat: retorno operacional ao cliente e acesso seguro de documentos

- Atualizado `functions/index.js`:
  - adicionada callable `generateAprovacaoDocumentDownloadUrl` para download de anexos via URL assinada com expiracao curta;
  - adicionada trigger `notifyAprovacaoStatusChange` para disparo automatico de retorno ao cliente quando `situacao` da aprovacao muda;
  - notificacao enviada por WhatsApp quando houver telefone de contato e enfileiramento de e-mail na colecao `mail`.
- Atualizado `js/modals/AprovacaoDetailsModal.js`:
  - nova secao de documentos com acoes de baixar/abrir anexos no detalhe da aprovacao.

## [2026-02-25] - Visibilidade global na pagina de Aprovacao

### fix: exibir dados da `page-aprovacao` para todos os usuarios autenticados

- Atualizado `js/aprovacaoService.js`:
  - adicionada a opcao `includeAllAuthenticated` em `listAprovacoes` e `getAprovacaoStats`;
  - quando ativa, o escopo nao limita usuarios com role `analyst` ao proprio `analistaAprovacao`.
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - listagem principal, KPI de conversao e exportacao CSV passaram a consultar com `includeAllAuthenticated: true`.

### perf: reduzir leituras da colecao `aprovacoes` com cache e recarga seletiva

- Atualizado `js/pages/aprovacaoPageInit.js`:
  - adicionada politica local para recarregar estatisticas da aprovacao somente quando necessario (`STATS_RELOAD_TTL_MS = 15 minutos`);
  - `refresh()` passou a invalidar explicitamente o cache local de estatisticas para manter consistencia apos alteracoes.
- Atualizado `js/cacheService.js`:
  - TTL de `aprovacoes` ajustado para `15 minutos`;
  - TTL de `aprovacoesStats` ajustado para `15 minutos`.
- Atualizado `js/badgeService.js`:
  - consulta de estatisticas para o badge de aprovacao passou a usar `includeAllAuthenticated: true`, alinhando o escopo global de usuarios autenticados.

### fix: reforcar diagnostico de webhook no modulo WhatsApp

- Atualizado `js/whatsappConfig.js`:
  - adicionada funcao central `getExpectedWebhookUrl()` para padronizar URL da regiao ativa (`southamerica-east1`);
  - carregamento da aba geral agora compara `whatsappConfig/settings.webhookUrl` com a URL esperada e exibe alerta de divergencia;
  - adicionado teste rapido de webhook na UI (`testWhatsAppWebhook`) com validacao de `hub.challenge`;
  - salvamento da configuracao agora persiste `webhookUrl` e `verifyToken` junto com `webhookVerifyToken`.
- Atualizado `js/modals/whatsapp/WhatsAppGeneralTab.js`:
  - incluida area de status `#whatsapp-webhook-alert`;
  - incluido botao `Testar webhook` na secao de URL.
- Atualizado `functions/index.js`:
  - corrigido fluxo de opcao invalida no `whatsappWebhook` para sempre responder `200 EVENT_RECEIVED`, evitando timeout/reentrega indevida.
- Atualizado `README.md`:
  - runtime recomendado para Cloud Functions ajustado para Node.js 22;
  - troubleshooting do WhatsApp atualizado com a URL correta da funcao webhook em `southamerica-east1`.

## [2026-02-24] - PÃ¡gina de Ferramentas com Juntar PDF

### feat: adicionar pÃ¡gina de ferramentas e merge de PDFs no navegador

- Atualizado `index.html`:
  - novo item de menu "Ferramentas" e seÃ§Ã£o `page-ferramentas` com UI de juntar PDF;
  - carregado `pdf-lib` via CDN para gerar o PDF unido no cliente.
- Adicionado `js/pages/toolsPageInit.js`:
  - seleÃ§Ã£o e ordenaÃ§Ã£o de arquivos PDF com aÃ§Ãµes de mover/remover;
  - drag-and-drop para adicionar arquivos e reorganizar a lista de PDFs;
  - junÃ§Ã£o e download do PDF com feedback de status.
- Expandida a pÃ¡gina de Ferramentas:
  - novas rotinas para desbloquear, converter PDF em JPG e organizar pÃ¡ginas;
  - suporte a drag-and-drop e aÃ§Ãµes rÃ¡pidas na organizaÃ§Ã£o de pÃ¡ginas.
- Ajustado o arrastar e soltar:
  - adicionadas Ã¡reas de drop para desbloquear, converter e organizar PDFs.
- Atualizado `js/eventListeners.js` para inicializar a pÃ¡gina ao navegar.

### fix: simplificar ferramentas e reforÃ§ar dropzones de upload

- Atualizado `index.html`:
  - removida a seÃ§Ã£o "Editar PDF" da pÃ¡gina `page-ferramentas`;
  - padronizado visual das dropzones com classes utilitÃ¡rias e cabeÃ§alhos `bg-body-tertiary`;
  - secoes "Desbloquear PDF" e "PDF para JPG" passaram a usar a mesma estrutura visual de "Juntar PDF" e "Organizar PDF".
- Atualizado `js/pages/toolsPageInit.js`:
  - removida a lÃ³gica de ediÃ§Ã£o de PDF para manter o escopo atual da ferramenta;
  - reforÃ§ada detecÃ§Ã£o de arquivos em drag-and-drop (`files`, `items` e fallback por `types`);
  - dropzones simples passaram a capturar eventos no container e input para aceitar drop tambem em elementos internos;
  - `Desbloquear PDF` passou a recriar o documento ao salvar para aumentar compatibilidade do download;
  - `PDF para JPG` passou a gerar um arquivo `.zip` unico com todas as paginas convertidas;
  - `Organizar PDF` passou a renderizar pre-visualizacao em miniatura das paginas;
  - corrigido bloqueio de arrastar/soltar no `Organizar PDF` apos finalizar o carregamento das paginas.
- Atualizado `css/utilities.css`:
  - adicionada transiÃ§Ã£o visual especÃ­fica para `.tool-dropzone` em `page-ferramentas`;
  - adicionados estilos de miniatura para preview das paginas na organizacao.

### fix: restaurar atalho de ranking na `page-aprovacao`

- Atualizado `index.html`:
  - botao "Ranking Analistas" da `page-aprovacao` passou a usar a classe `.page-shortcut`.
- Atualizado `js/eventListeners.js`:
  - listener de navegacao passou a incluir `.page-shortcut[data-page]` no binding de clique;
  - navegacao para `relatorios` passou a encaminhar `data-section`, abrindo diretamente a secao `analistas`.

### fix: restringir RelatÃ³rios para usuarios admin (visibilidade e acesso)

- Atualizado `index.html`:
  - item "Relatorios" da sidebar passou a usar classe `admin-only`;
  - atalho "Ranking Analistas" da `page-aprovacao` passou a usar classe `admin-only`;
  - `#page-relatorios` passou a usar classe `admin-only`.
- Atualizado `js/eventListeners.js`:
  - navegacao por `.nav-button` e `.page-shortcut` agora bloqueia `relatorios` e `configuracoes` para usuarios nao-admin com notificacao de acesso negado.
- Atualizado `js/subMenuController.js`:
  - clique em itens de submenu agora valida role antes de disparar navegacao para `relatorios` e `configuracoes`.

### fix: permitir exclusao de analises na `page-aprovacao` para admin e criador

- Atualizado `js/pages/aprovacaoPageInit.js`:
  - adicionada acao `delete` na tabela de aprovacoes;
  - botao de excluir agora aparece quando o usuario atual e admin ou criador da analise;
  - adicionado fluxo de confirmacao e refresh apos exclusao.
- Atualizado `js/modals/AprovacaoDetailsModal.js`:
  - incluido botao `Excluir` no rodape do modal de detalhes;
  - botao fica visivel apenas para admin ou criador da analise;
  - exclusao pelo modal reaproveita a mesma regra de permissao e atualiza a lista apos sucesso.
- Atualizado `js/aprovacaoService.js`:
  - `deleteAprovacao` agora aceita opcao com documento carregado e libera exclusao para admin, perfis com permissao `delete` ou criador da analise.
- Atualizado `firestore.rules`:
  - regra de `delete` em `aprovacoes` passou a permitir admin ou criador (`criadoPor`/`createdBy` por uid ou email).

### feat: vincular aprovacoes com processos e exibir taxa de conversao por CPF

- Adicionado `js/conversionMetricsService.js`:
  - novo servico compartilhado para calcular taxa de conversao entre `aprovacoes` e `contracts`;
  - estrategia de matching em 2 etapas: `origemAprovacao` e fallback por intersecao de CPF;
  - regra temporal aplicada no fallback (`processDate >= approvalDate`);
  - regra 1:1 aplicada (`1 processo` converte no maximo `1 aprovacao`).
- Atualizado `js/aprovacaoService.js`:
  - novo helper publico `listAprovacoesForMetrics(options)` com `pageSize` alto e flag `partial` para amostra parcial.
- Atualizado `index.html`:
  - novo KPI na `page-aprovacao` com IDs `kpi-conversao-rate` e `kpi-conversao-detail`;
  - nova secao na `page-relatorios` com os IDs:
    - `reports-conversion-rate`
    - `reports-conversion-total`
    - `reports-conversion-converted`
    - `reports-conversion-pending`
    - `reports-conversion-by-origin`
    - `reports-conversion-by-cpf`
    - `reports-conversion-warning`
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - calculo de KPI de conversao usando periodo dos filtros avancados (`dataInicio`/`dataFim`);
  - cache por assinatura de periodo para evitar recarga pesada a cada busca/paginacao.
- Atualizado `js/reportsPage.js`:
  - carregamento de metricas de conversao no fluxo de geracao de relatorios;
  - renderizacao da taxa e dos detalhamentos por `origemAprovacao` e por fallback de CPF;
  - aviso visual quando a amostra de aprovacoes vier parcial por limite de leitura.

### fix: preservar analista do CSV na importacao de aprovacoes

- Atualizado `js/modals/ImportAprovacaoModal.js`:
  - adicionada coluna `analistaAprovacao` no mapeamento de importacao;
  - auto-mapeamento passou a reconhecer aliases como `ANALISTA`, `Analista` e `Analista Aprovacao`.
- Atualizado `js/aprovacaoService.js`:
  - `importAprovacoes` deixou de sobrescrever `analistaAprovacao` com o usuario importador quando a coluna nao estiver presente.

### fix: corrigir base e consolidacao das metricas do ranking de analistas

- Atualizado `js/reportsPage.js`:
  - carga do ranking passou a dar prioridade a `listAprovacoesForMetrics` com limite alto (10.000) para reduzir subcontagem por paginacao;
  - badge do ranking agora informa quando os dados estiverem em amostra parcial;
  - consolidacao de analistas passou a normalizar chave (trim/case) para evitar duplicidade de metricas por variacao de escrita.

### fix: separar colunas de data na tabela de aprovacoes

- Atualizado `index.html`:
  - coluna `Data Entrada` adicionada imediatamente a esquerda de `Cliente`;
  - coluna `Datas` substituida por `Data Aprovacao`;
  - ajustado `colspan` das linhas de loading/empty para 9 colunas.
- Atualizado `js/pages/aprovacaoPageInit.js`:
  - render de linhas da tabela ajustado para exibir `Data Entrada` e `Data Aprovacao` em colunas separadas.

## [2026-02-23] - Reducao de leituras ao reabrir pagina de Aprovacao

### fix: evitar nova consulta ao Firestore em toda reentrada na `page-aprovacao`

- Atualizado `js/pages/aprovacaoPageInit.js`:
  - adicionado cache em memoria da pagina com TTL curto (`PAGE_RELOAD_TTL_MS = 2 minutos`);
  - `show()` passou a reutilizar os dados ja carregados dentro do TTL, sem nova chamada ao banco;
  - criada renderizacao local (`renderCurrentState`) para reconstruir tabela/KPIs/paginacao/badge sem refetch;
  - `refresh()` continua forÃ§ando invalidacao de cache e novo carregamento do Firestore.
- Atualizado `js/aprovacaoService.js`:
  - `listAprovacoes` e `getAprovacaoStats` passaram a usar `cacheService.get` com chaves deterministicas (`aprovacoes_list_*` e `aprovacoes_stats_*`);
  - cache de listagem e estatisticas agora pode ser reaproveitado apos `F5` (dentro do TTL);
  - corrigido `getAprovacao` para nao forcar bypass de cache por parametro incorreto.
- Atualizado `js/cacheService.js`:
  - adicionados tipos de TTL `aprovacoes` e `aprovacoesStats`;
  - habilitada persistencia em IndexedDB para chaves `aprovacoes_*`;
  - invalidaÃ§Ã£o por padrao/tipo passou a contemplar namespace `aprovacoes_*`.

## [2026-02-20] - Politica de rotacao obrigatoria de senha (60 dias)

### feat: expirar senha, bloquear acesso ate troca e reduzir latencia no login apos cold cache

- Atualizado `functions/index.js`:
  - adicionadas helpers da politica de senha (`PASSWORD_POLICY_DAYS = 60`, `user_security`);
  - `createNewUser` agora cria registro de seguranca com `mustChangePassword = true`;
  - novas callable functions: `getPasswordPolicyState` e `markPasswordRotationCompleted`;
  - novo scheduler diario `enforcePasswordRotation` para marcar contas vencidas com troca obrigatoria.
- Atualizado `firestore.rules`:
  - nova regra para `user_security/{userId}` (leitura owner/admin, escrita admin).
- Atualizado `js/firestoreService.js`:
  - `isCurrentUserAdmin` usa `getIdTokenResult()` sem refresh forcado;
  - adicionados wrappers `getPasswordPolicyState` e `markPasswordRotationCompleted`.
- Atualizado fluxo de autenticacao e perfil:
  - `js/main.js`: redireciona para `profile.html?forcePasswordRotation=1` quando `mustChangePassword = true`;
  - `js/login.js`: removido delay artificial de 1s apos login;
  - `js/profile.js`, `js/profileEnhancements.js` e `js/eventListeners.js`: ao trocar senha, chama `markPasswordRotationCompleted`.
- Atualizado WhatsApp standalone:
  - `whatsapp-dashboard.html` e `whatsapp-workflows.html` agora carregam `firebase-functions-compat.js`;
  - `js/pages/whatsappDashboardPageInit.js` e `js/pages/whatsappWorkflowsPageInit.js` validam politica de senha antes de inicializar.
- Otimizacao de cold start:
  - `js/vendorsInlineIntegration.js`: removido preload automatico (`primeVendors`) no `DOMContentLoaded`; mantido carregamento sob demanda.

## [2026-02-20] - Ajuste de ordenacao no cabecalho da lista de Processos

### fix: estabilizar ordenacao via `#table-header` e reset correto da paginacao

- Atualizado `js/main.js`:
  - `handleViewUpdate` agora trata mudanca de ordenacao com direcao explicita opcional;
  - ao ordenar, reseta `currentPage`, `firstVisible`, `lastVisible` e `pageSnapshots` para evitar inconsistencias de cursor/pagina.
- Atualizado `js/eventListeners.js`:
  - listener legado do `#table-header` passou a delegar apenas `sortKey` ao `main.js`, removendo logica duplicada de direcao/paginacao que podia causar inversao dupla em alguns fluxos.

## [2026-02-20] - Correcao de colunas em branco na lista de Processos

### fix: normalizacao de campos legados e robustez de renderizacao em `list-view-active`

- Atualizado `js/firestoreService.js`:
  - adicionado `normalizeContractFieldAliases` com base em `FIELD_CASE_MAPPING` para preencher chaves canonicas a partir de aliases legados;
  - aplicada normalizacao no retorno de paginacao (`getContractsPageOptimized` e `getContractsPageOriginal`), em `getAllContracts`, `getArchivedContracts` e listeners realtime.
- Atualizado `js/ui.js`:
  - adicionada resolucao de aliases por coluna durante `renderContracts` (`getContractValueForColumn`);
  - removido fallback agressivo com `|| ""` no valor inicial da celula para nao ocultar valores validos como `0`.
- Atualizado `js/config.js`:
  - criada funcao `parseDateValue` para aceitar `Timestamp`, `Date`, `number`, objetos com `seconds` e strings (incluindo `dd/mm/yyyy` e `dd/mm/yyyy HH:mm`);
  - `formatDate` e `formatDateTime` passaram a usar parser defensivo para reduzir datas exibidas em branco.

## [2026-02-20] - Configuracao do MCP oficial do Firebase CLI

### chore: adicionar preset de MCP do Firebase para VS Code e documentar fluxo de auth

- Adicionado `.vscode/mcp.json` com servidor MCP oficial do Firebase CLI:
  - comando: `npx -y firebase-tools@latest mcp --dir ${workspaceFolder}`.
- Atualizado `README.md` na secao `Servidor MCP (opcional)` com:
  - exemplo de configuracao do MCP oficial;
  - comando de login e selecao de projeto no Firebase CLI;
  - comando de validacao (`mcp --generate-tool-list`).

## [2026-02-20] - Remocao definitiva do KPI "Valor Total Financiamento"

### fix: impedir reaparicao do KPI removido no dashboard

- Atualizado `js/dashboardUI.js`:
  - removido o KPI `kpi-value` da lista padrao (`getDefaultKPIs`);
  - removido o template rapido `valor-total-financiamento`;
  - adicionado saneamento da lista de KPIs para excluir automaticamente o KPI legado `"Valor Total Financiamento"` (id `kpi-value`) ao carregar configuracoes locais/globais;
  - incluida persistencia automatica da limpeza (global para admin e local para usuario).
- Atualizado `js/offcanvas/KpiManagerOffcanvas.js`:
  - removido o botao de template rapido "Valor Total".

## [2026-02-20] - Ajustes no dashboard de KPIs e no offcanvas de gerenciamento

### fix: visibilidade consistente no `#dashboard-kpis-row` e persistencia correta de KPIs no `#kpiManagerOffcanvas`

- Atualizado `js/dashboardUI.js`:
  - corrigida a chave de visibilidade dos KPIs (`type || id`) em renderizacao, toggle e aplicacao no grid;
  - ajustado o fluxo de criacao/edicao/remocao de KPI para separar escopo global (admin) e local (usuario);
  - adicionado merge de KPIs globais + locais para nao-admin (sem perder KPIs globais);
  - bloqueada edicao/remocao de KPIs globais para usuarios nao-admin no offcanvas;
  - padronizada normalizacao de definicoes de KPI e sanitizacao de conteudo exibido;
  - melhorado parse numerico (pt-BR/en-US) e comparacoes de data/numero nos filtros de KPI (`>`, `>=`, `<`, `<=`);
  - fallback de configuracao de visibilidade alterado para dinamico (`{}`) com compatibilidade de chaves legadas.
- Atualizado `README.md`:
  - adicionada observacao sobre persistencia global/local dos KPIs do dashboard.

## [2026-02-20] - Atualizacao da skill interface-design

### docs: sincronizar implementacao da `$interface-design` com `Dammyjay93/interface-design`

- Instalada a skill `interface-design` no ambiente local do Codex a partir de `Dammyjay93/interface-design` (path `.claude/skills/interface-design`).
- Versionada copia local da skill no repositorio em `.codex/skills/interface-design` com:
  - `SKILL.md`;
  - `references/principles.md`;
  - `references/validation.md`;
  - `references/critique.md`;
  - `references/example.md`.
- Atualizado `README.md`:
  - secao `Skills do Codex (opcional)` com localizacao da skill no repositorio;
  - comando de instalacao para `~/.codex/skills/interface-design`;
  - observacao de reinicio de sessao para carregamento da skill;
  - data de revisao ajustada para `2026-02-20`.

## [2026-02-20] - Correcao de data invalida em anotacoes do details-modal

### fix: parser defensivo para datas de anotacoes e normalizacao na edicao/salvamento

- Atualizado `js/ui.js`:
  - `renderAnotacaoEntry` agora aceita `Timestamp` do Firestore, `Date`, string ISO e objetos serializados (`seconds`/`_seconds`);
  - quando a data nao pode ser convertida, a interface exibe `Data nÃ£o informada` no lugar de `Invalid Date`;
  - adicionados fallbacks seguros para `usuario` e `texto` ausentes na anotacao.
- Atualizado `js/eventListeners.js`:
  - criada funcao de normalizacao de data para entradas de anotacao;
  - ajustada a leitura das anotacoes no DOM durante adicionar/editar para converter datas serializadas antes do `updateContract`.
  - aplicada sanitizacao de payload para remover campos `undefined` (ex.: `editadoEm` ausente), evitando erro do Firestore em `DocumentReference.update()`.

## [2026-02-18] - Hardening de logs e init WhatsApp

### fix: reduzir exposiÃ§Ã£o de dados sensÃ­veis em logs e corrigir inicializaÃ§Ã£o do modal de configuraÃ§Ã£o WhatsApp

- Atualizado `js/performance.js`:
  - logs de recursos do `PerformanceMonitor` agora passam por sanitizaÃ§Ã£o de URL antes de exibir no console, removendo risco de expor query string com tokens/credenciais.
- Atualizado `js/whatsapp/whatsappDebugInlineInit.js`:
  - removida ativaÃ§Ã£o forÃ§ada de `window.__DEBUG__ = true`;
  - logs de diagnÃ³stico WhatsApp agora sÃ³ aparecem quando `window.__DEBUG_WHATSAPP__` (ou debug global) estiver habilitado.
- Atualizado `js/whatsapp/whatsappConfigModalInlineInit.js`:
  - adicionada estratÃ©gia de retry via `MutationObserver` quando `#modal-whatsapp-config` ainda nÃ£o estiver no DOM;
  - adicionado rebind ao evento `ui:components:rendered` para evitar falha por ordem de carregamento.
- Atualizado `js/modals/WhatsAppSettingsModals.js`:
  - corrigida renderizaÃ§Ã£o dos modais WhatsApp para usar os renderizadores modulares (`renderWhatsApp*`) de forma consistente.
- Atualizado `js/eventListeners.js` e `js/ui.js`:
  - logs explicitamente marcados como `DEBUG` foram protegidos por flag de debug para reduzir ruÃ­do em produÃ§Ã£o.

## [2026-02-18] - Ajuste do cabecalho no details-modal

### fix: titulo do details-modal com CPF do comprador principal e tipografia padronizada

- Atualizado `js/ui.js`:
  - subtitulo do `#details-modal-title` agora segue o padrao `Empreendimento - Apto - Bloco - Comprador principal - CPF comprador principal`;
  - inclusao de fallback para CPF principal via `compradores[].cpf`, `cpfPrincipal`, `comprador_1_cpf` e `cpf`;
  - CPF exibido com formatacao usando `formatCPF` quando houver 11 digitos;
  - removidos estilos inline e adicionadas classes estruturais para o titulo.
- Atualizado `css/style.css`:
  - padronizada fonte e tamanho do bloco `#details-modal-title` (icone, titulo e subtitulo).

## [2026-02-18] - Otimizacao de workflow na paginacao da lista

### fix: reduz fallback full-scan quando workflow legado padrao esta ativo

- Atualizado `js/main.js` em `loadContractsPage`:
  - criado critÃƒÂ©rio `workflowRequiresFullScan` para acionar fallback completo apenas quando o workflow ativo exige inferencia ampla;
  - habilitada paginacao otimizada do Firestore quando o filtro de workflow esta no padrao legado (`associativo`);
  - aplicado refinamento de workflow apenas sobre os itens da pagina no modo lista, evitando chamada global de `getAllContracts` nesse cenario.

## [2026-02-18] - Reducao de leituras redundantes no Firestore

### fix: filtros offcanvas e refresh do dashboard sem full-scan desnecessario

- Atualizado `js/eventListeners.js`:
  - filtros de construtora e empreendimento no `filtersOffcanvas` agora usam somente fontes locais (`appState` e `cacheService.getCached`) antes de renderizar;
  - removidas chamadas diretas a `window.firestoreService.getAllContracts()` ao abrir o offcanvas;
  - fallback de dados para filtros passou a dar prioridade a `allContracts`, `filteredContracts` e `contracts` ja carregados.
- Atualizado `js/dashboardUI.js`:
  - `forceRefreshContractsData()` nao invalida mais cache global de `contracts`;
  - refresh manual do dashboard nao chama mais `firestoreService.getAllContracts()` diretamente;
  - recarga do dashboard passou a reutilizar contratos ja carregados no `appState` e usar fallback do `dashboardService` apenas quando necessario.

## [2026-02-16] - Correcao do refresh manual do dashboard

### fix: botao `#btn-refresh-dashboard-enhanced` agora forca recarga real dos dados

- Atualizado `js/dashboardUI.js` para tornar `addExportActions()` idempotente e evitar duplicacao de acoes no DOM.
- Ajustado `bindEvents()` para usar `onclick` nos botoes de acoes do dashboard, garantindo rebind consistente.
- Implementado `forceRefreshContractsData()` para invalidar caches (`dashboard`, `kpi`, `contracts`), recarregar contratos e atualizar `appState`.
- Corrigido `refreshDashboard()` para bloquear refresh concorrente, exibir loading adequado e notificar sucesso/erro.
- Reordenada prioridade de cache em KPIs/graficos para dar prioridade a `appState` antes de contratos pre-carregados.

## [2026-02-12] - Refatoracao da page-configuracoes e submenu admin

### feat: navegacao de configuracoes mais profissional e atalhos alinhados

- Refatorado `index.html` na `#page-configuracoes` com navegacao lateral por grupos (Administracao, Cadastros e Integracoes), cabecalho com acoes rapidas e cards sem emojis.
- Ajustado o submenu admin da sidebar (`data-page="configuracoes"`) com atalhos para Visao Geral, IA e Importacao, Status e SLA, Usuarios, Notificacoes, Construtoras, Agencias, Cartorios e WhatsApp.
- Atualizado `js/settingsUI.js` para abrir o Monitor de Leituras pelo novo atalho rapido e mapear a secao `overview`.
- Atualizado `js/subMenuController.js` para sincronizar submenus existentes no HTML (sem recriar estrutura duplicada) e alinhar atalhos de configuracoes/relatorios.
- Refinado `css/style.css` para melhorar hierarquia visual, contraste, espacamento e estados de foco em `#page-configuracoes`.

## [2026-02-12] - Reestruturacao do README principal

### docs: README refeito para leitura rapida e onboarding tecnico

- Reescrito `README.md` com estrutura objetiva e sem duplicacoes.
- Organizadas secoes de visao geral, funcionalidades, arquitetura, setup, comandos e deploy.
- Ajustadas referencias para o estado real do repositorio (incluindo `mcp-server/` e arquivos de regras Firebase).
- Adicionado resumo de padroes obrigatorios de desenvolvimento e troubleshooting rapido.

## [2026-02-11] - Autopreenchimento de cartorio e agencia por empreendimento

### feat: defaults por empreendimento no panel-vendors e no details-modal

- Atualizado `js/firestoreService.js` para permitir salvar `cartorioPadrao` e `agenciaPadrao` no objeto de empreendimento em `vendors`.
- Atualizado `js/vendorsUI.js`:
  - cards de empreendimentos no `panel-vendors` agora exibem defaults de cartorio e agencia;
  - acao de editar empreendimento agora abre modal dedicado no `panel-vendors` para ajustar nome + defaults;
  - criacao de empreendimento via modal passa a enviar defaults junto com o nome.
- Atualizado `js/modals/VendorsModals.js` com novos campos no cadastro de empreendimento:
  - `new-empreendimento-cartorio`
  - `new-empreendimento-agencia`
- Atualizado `js/modals/VendorsModals.js` e `js/vendorsUI.js` para popular sugestÃƒÂµes de `cartorio` e `agencia` no modal de empreendimento a partir das coleÃƒÂ§ÃƒÂµes `cartorios` e `agencias` (com fallback para defaults jÃƒÂ¡ existentes em `vendors`).
- Atualizado `js/vendorsInlineIntegration.js` para preenchimento automatico no `details-modal`:
  - ao abrir modal, se cartorio/agencia estiverem vazios, aplica defaults do empreendimento;
  - ao trocar empreendimento manualmente, aplica defaults do novo empreendimento;
  - usuario pode sobrescrever a agencia manualmente apos o preenchimento automatico.

Todas as mudanÃƒÂ§as notÃƒÂ¡veis neste projeto serÃƒÂ£o documentadas neste arquivo.

## [2026-02-11] - Padronizacao do titulo da aba no SPA

### fix: manter titulo consistente ao entrar/sair da tela WhatsApp

- Atualizado `index.html` para usar o titulo padrao `Sistema Gestor de Processos`.
- Atualizado `js/whatsappNotifications.js` para nao sobrescrever o titulo com `WhatsApp - Gestor de Contratos` durante atualizacao de notificacoes.
- Resultado: o titulo da aba permanece consistente em toda navegacao da SPA.

## [2026-02-11] - Expansao do MCP para consistencia de desenvolvimento com IA

### feat: novas ferramentas de auditoria no servidor MCP

- Criado `mcp-server/projectConsistencyController.js` com ferramentas:
  - `auditar_metricas_leitura`: agrega dados da colecao `_readMetrics` para monitorar leituras, cache hit rate e top fontes.
  - `validar_governanca_firestore`: valida estrutura e presenca de `firestore.rules` e `firestore.indexes.json`.
  - `auditar_indices_firestore`: escaneia consultas no codigo (`js/`, `functions/`) e compara com indices atuais para dar prioridade a lacunas.
- Atualizado `mcp-server/index.js` para registrar e despachar as novas tools de consistencia.
- Atualizado `mcp-server/README.md` com catalogo de ferramentas e exemplos de uso via `cli.js`.
- Atualizado `README.md` principal para incluir o papel do `mcp-server` na arquitetura tecnica.

### feat: ampliacao de indices compostos do Firestore

- Atualizado `firestore.indexes.json` com 27 novos indices compostos para cobrir consultas de:
  - `notifications`, `statusConfig`, `messages`, `whatsappCalls`, `chats`, `users`, `whatsappAgents`, `whatsappPhoneNumbers`, `whatsappWorkflows`, `archivedContracts` e `contracts`.
- Resultado da auditoria MCP apos ajuste:
  - Cobertura estimada de assinaturas de consulta subiu de `30.6%` para `77.6%`.

## [2026-02-11] - Conversao de aprovacao com workflow/status definidos pelo usuario

### fix: page-aprovacao agora solicita workflowId e status antes de converter

- Atualizado `js/pages/aprovacaoPageInit.js` para abrir uma janela modal com selecao de `workflowId` e `status` na acao "Converter para processo".
- Atualizado `js/modals/AprovacaoDetailsModal.js` com o mesmo fluxo de selecao para manter consistencia no modal de detalhes.
- Criado `js/modals/AprovacaoConvertProcessModal.js` para centralizar a janela de conversao (Bootstrap modal) e carregar opcoes de workflows/status dinamicos.
- Ajustado `js/modals/AprovacaoConvertProcessModal.js` para remover a opcao injetada `aguardando (padrao)` e considerar somente os status vindos de `statusConfig`.
- Atualizado `js/aprovacaoService.js` para aceitar parametros na `converterParaProcesso(aprovacaoId, options)` e aplicar defaults:
  - `workflowId`: `associativo`
  - `status`: `aguardando`
- Corrigido `js/aprovacaoService.js` em `listAprovacoes` para respeitar o limite maximo do Firestore (`query.limit <= 10000`) e evitar erro ao exportar CSV com pagina grande.
- Atualizado `js/pages/aprovacaoPageInit.js` para exibir na coluna de datas os campos `dataEntrada` e `dataAprovacao` no grid da `page-aprovacao`.
- Ajustado `js/pages/aprovacaoPageInit.js` para exibir `analistaAprovacao` dando prioridade a o `Nome Reduzido` (shortName) ou `Nome Completo` (fullName) carregado do perfil do analista.
- Atualizado `js/modals/DetailsModal.js` e `js/ui.js` para incluir o campo `Analista Aprovacao` no modal de detalhes, com dropdown populado para todos os usuarios no mesmo padrao de `Analista Responsavel` e `Analista CEHOP`.
- Ajustado `js/aprovacaoService.js` para migrar `analistaAprovacao` ao converter aprovacao para processo.
- Adicionado campo `Vencimento SICAQ` no `js/modals/AddAprovacaoModal.js`, com persistencia em `js/aprovacaoService.js` e captura via prompt de IA em `js/aiService.js`.
- Resultado: o processo criado a partir de aprovacao passa a respeitar o workflow/status escolhido pelo usuario no momento da conversao.

## [2026-02-10] - Correcao da migracao automatica de arquivados (Storage)

### fix: sincronizacao automatica de candidatos a arquivamento

- Adicionado trigger `syncContractArchiveFlagOnWrite` em `functions/index.js` para manter `wasArchived` sincronizado com `statusConfig.archiveContracts=true`.
- Adicionado backfill leve no nucleo `archiveWasArchivedContractsCore` para marcar contratos legados/status arquivavel sem flag.
- Ajustado `scheduleExistingArchivableContracts` para marcar `wasArchived=true` ao agendar.
- Resultado: rotina automatica de 2h volta a encontrar contratos elegiveis e migrar para Storage.

### feat: melhoria no fluxo manual da page-arquivados

- Atualizado `js/archivedContractsPage.js` para executar migracao manual com limite maior (`limit: 200`) e exibir quantos contratos foram preparados no backfill.
- Mensagem de confirmacao agora reflete o fluxo real por status arquivavel.

### docs: alinhamento de comunicacao da arquitetura hibrida

- `index.html`: texto da secao Arquivados atualizado para "Migrar agora" e descricao da sincronizacao automatica.
- `README.md`: documentado o fluxo automatico (`statusConfig -> wasArchived -> scheduler 2h`).

## [2026-01-21] - Unificacao de Gerenciador de Status e Workflows - Fase 4 Completa

### feat: adicionar tab "Regras de Campos" ao modal unificado

**Nova funcionalidade - Tab 5: Regras de Campos**:

1. **Gerenciamento de Campos Obrigatorios por Status**:
   - Lista todos os status ativos com suas regras configuradas
   - Exibe quantidade e nomes dos campos obrigatorios por status
   - Busca/filtro por nome de status
   - Botao de atualizacao

2. **Modal de Edicao de Regras**:
   - Modal secundario para selecao de campos obrigatorios
   - Campos organizados por categoria (Dados Principais, Formularios, CEF, Registro, Financeiro, Outros)
   - Checkboxes para selecao multipla
   - Persistencia via firestoreService.saveStatusRule()

3. **Integracao Completa**:
   - Lazy loading da tab ao navegar
   - Invalidacao de cache ao salvar regras
   - Evento `status-workflow-updated` com type: 'rules'
   - Sincronizacao com validacao de contratos

**Arquivos criados**:
- `js/modals/StatusWorkflowUnified_RulesTab.js`: Manager da tab Regras

**Arquivos modificados**:
- `js/modals/StatusWorkflowUnifiedModal.js`: Adicao da 5a tab
- `index.html`: Remocao dos cards legados deprecated

**Status**: Modal unificado completo com 5 tabs:
1. Status do Sistema
2. SLA por Status
3. SLA por Data
4. Workflows
5. Regras de Campos

---

## [2026-01-20] - UnificaÃƒÂ§ÃƒÂ£o de Gerenciador de Status e Workflows - Fase 3 Completa

### feat: funcionalidades avanÃƒÂ§adas do modal unificado

**Fase 3 - Recursos AvanÃƒÂ§ados**:

1. **Modal Inline de EdiÃƒÂ§ÃƒÂ£o de Status**:
   - FormulÃƒÂ¡rio completo integrado na Tab Status
   - Campos: nome, etapa, ordem, cor de fundo, cor do texto
   - SeleÃƒÂ§ÃƒÂ£o mÃƒÂºltipla de prÃƒÂ³ximos status permitidos
   - Toggle de status ativo/inativo
   - OpÃƒÂ§ÃƒÂ£o para arquivar contratos ao mudar para este status
   - BotÃƒÂµes "Novo Status" e "Editar" integrados
   - ValidaÃƒÂ§ÃƒÂ£o de formulÃƒÂ¡rio e persistÃƒÂªncia via firestoreService
   - Feedback visual com toasts

2. **NavegaÃƒÂ§ÃƒÂ£o Contextual Entre Tabs**:
   - BotÃƒÂ£o dropdown com opÃƒÂ§ÃƒÂµes de navegaÃƒÂ§ÃƒÂ£o na Tab Status
   - "Configurar SLA" leva para Tab SLA Status com filtro aplicado
   - BotÃƒÂ£o "Ver detalhes" na Tab SLA Status retorna para Tab Status
   - AplicaÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica de filtros na tab de destino
   - Scroll suave e foco no campo de busca

3. **ConfirmaÃƒÂ§ÃƒÂ£o de Dados NÃƒÂ£o Salvos**:
   - Rastreamento de alteraÃƒÂ§ÃƒÂµes pendentes por tab
   - MÃƒÂ©todos: `markAsUnsaved()`, `markAsSaved()`, `hasUnsavedChanges()`
   - InterceptaÃƒÂ§ÃƒÂ£o de troca de tabs quando hÃƒÂ¡ alteraÃƒÂ§ÃƒÂµes
   - DiÃƒÂ¡logo de confirmaÃƒÂ§ÃƒÂ£o antes de descartar mudanÃƒÂ§as
   - Cancelamento da navegaÃƒÂ§ÃƒÂ£o se usuÃƒÂ¡rio recusar

**Melhorias de UX**:
- Dropdown com aÃƒÂ§ÃƒÂµes contextuais em cada linha da tabela
- ÃƒÂcones Bootstrap Icons para identificaÃƒÂ§ÃƒÂ£o visual
- NavegaÃƒÂ§ÃƒÂ£o intuitiva com preservaÃƒÂ§ÃƒÂ£o de contexto
- Feedback claro sobre estado das alteraÃƒÂ§ÃƒÂµes

**Arquivos modificados**:
- `StatusWorkflowUnifiedModal.js`: Controle de alteraÃƒÂ§ÃƒÂµes e navegaÃƒÂ§ÃƒÂ£o
- `StatusWorkflowUnified_StatusTab.js`: Modal inline e navegaÃƒÂ§ÃƒÂ£o para SLA
- `StatusWorkflowUnified_SLAStatusTab.js`: NavegaÃƒÂ§ÃƒÂ£o de volta para Status

**Status**: Fase 3 concluÃƒÂ­da. Modal unificado totalmente funcional com recursos avanÃƒÂ§ados.

**PrÃƒÂ³ximas etapas (Fase 4 - Opcional)**:
- Testes de integraÃƒÂ§ÃƒÂ£o end-to-end
- DocumentaÃƒÂ§ÃƒÂ£o de usuÃƒÂ¡rio (guia de uso)
- Remover arquivos legados deprecated apÃƒÂ³s validaÃƒÂ§ÃƒÂ£o

---

## [2026-01-20] - UnificaÃƒÂ§ÃƒÂ£o de Gerenciador de Status e Workflows - Fase 2 Completa

### feat: migraÃƒÂ§ÃƒÂ£o completa de todas as tabs do modal unificado

**Fase 2 - MigraÃƒÂ§ÃƒÂ£o de Tabs Restantes**:
1. **Tab SLA por Status**: Migrada de `slaConfigManager.js`
   - Manager: StatusWorkflowUnified_SLAStatusTab.js
   - ConfiguraÃƒÂ§ÃƒÂ£o de prazos em dias ÃƒÂºteis por status
   - OperaÃƒÂ§ÃƒÂµes em lote (aplicar a todos, limpar todos)
   - Busca e filtro por nome de status
   - SincronizaÃƒÂ§ÃƒÂ£o via eventos customizados

2. **Tab SLA por Data**: Migrada de `slaDateConfigManager.js`
   - Manager: StatusWorkflowUnified_SLADateTab.js
   - ConfiguraÃƒÂ§ÃƒÂ£o de alertas de vencimento para campos de data
   - DefiniÃƒÂ§ÃƒÂ£o de antecedÃƒÂªncia (dias) para cada campo
   - Toggle de ativaÃƒÂ§ÃƒÂ£o por campo
   - Restaurar padrÃƒÂµes (apenas vencSicaq ativo)

3. **Tab Workflows**: Migrada de `workflowEditorUI.js`
   - Manager: StatusWorkflowUnified_WorkflowsTab.js
   - CRUD completo de workflows (tipos de processo)
   - Editor de estÃƒÂ¡gios/fases com reordenaÃƒÂ§ÃƒÂ£o
   - Autocomplete de status do sistema
   - GeraÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica de ID baseado no nome

**Fase 3 - Modal Inline de EdiÃƒÂ§ÃƒÂ£o de Status**:
- **Modal inline para criar/editar status**
  - FormulÃƒÂ¡rio completo com validaÃƒÂ§ÃƒÂ£o
  - Campos: nome, etapa, ordem, cor de fundo, cor do texto
  - SeleÃƒÂ§ÃƒÂ£o mÃƒÂºltipla de prÃƒÂ³ximos status permitidos
  - Toggle de status ativo/inativo
  - OpÃƒÂ§ÃƒÂ£o para arquivar contratos ao mudar para este status
  - BotÃƒÂµes "Novo Status" e "Editar" na Tab Status
  - IntegraÃƒÂ§ÃƒÂ£o com firestoreService para persistÃƒÂªncia
  - ValidaÃƒÂ§ÃƒÂ£o de formulÃƒÂ¡rio e feedback visual

**Arquivos deprecated**:
- `js/slaDateConfigManager.js`: Adicionado warning de deprecation
- `js/workflowEditorUI.js`: JÃƒÂ¡ tinha warning na Fase 1

**SincronizaÃƒÂ§ÃƒÂ£o**:
- Todas as tabs emitem eventos `status-workflow-updated` e especÃƒÂ­ficos
- InvalidaÃƒÂ§ÃƒÂ£o de cache coordenada entre tabs
- IntegraÃƒÂ§ÃƒÂ£o com `cacheService.js` mantida

**Status**: Todas as 4 tabs foram migradas com sucesso. Modal inline de ediÃƒÂ§ÃƒÂ£o implementado.

**PrÃƒÂ³ximas etapas (Fase 4)**:
- NavegaÃƒÂ§ÃƒÂ£o contextual entre tabs
- ConfirmaÃƒÂ§ÃƒÂ£o de dados nÃƒÂ£o salvos ao trocar tabs
- Testes de integraÃƒÂ§ÃƒÂ£o completos
- DocumentaÃƒÂ§ÃƒÂ£o final

---

## [2026-01-20] - UnificaÃƒÂ§ÃƒÂ£o de Gerenciador de Status e Workflows - Fase 1

### feat: implementar modal unificado para configuraÃƒÂ§ÃƒÂµes de status e workflows

**MotivaÃƒÂ§ÃƒÂ£o**: As funcionalidades de configuraÃƒÂ§ÃƒÂ£o de workflows, status, regras e SLA estavam fragmentadas em 5+ modais diferentes, dificultando a navegaÃƒÂ§ÃƒÂ£o e manutenÃƒÂ§ÃƒÂ£o.

**ImplementaÃƒÂ§ÃƒÂ£o**:
- **Novo modal unificado**: `StatusWorkflowUnifiedModal`
  - LocalizaÃƒÂ§ÃƒÂ£o: js/modals/StatusWorkflowUnifiedModal.js
  - Estrutura com 4 abas navegÃƒÂ¡veis via sistema customizado (data-tab)
  - Lazy loading de conteÃƒÂºdo ao trocar tabs
  - Sistema de sincronizaÃƒÂ§ÃƒÂ£o entre tabs via eventos customizados

**Tabs implementadas (Fase 1)**:
1. **Status do Sistema**: Gerenciamento de status (CRUD, cores, ordem, ativaÃƒÂ§ÃƒÂ£o)
   - Manager: StatusWorkflowUnified_StatusTab.js
   - Tabela com drag-and-drop para reordenaÃƒÂ§ÃƒÂ£o
   - Busca em tempo real por nome/etapa
   - Toggle de ativo/inativo direto na linha
   
2. **SLA por Status**: Placeholder (migrado na Fase 2)
3. **SLA por Data**: Placeholder (migrado na Fase 2)
4. **Workflows**: Placeholder (migrado na Fase 2)

**Ponto de entrada unificado**:
- index.html#panel-status: BotÃƒÂ£o ÃƒÂºnico "Gerenciador de Status e Workflows"
- BotÃƒÂµes legados movidos para `<details>` colapsÃƒÂ¡vel e marcados como deprecated
- Abertura via Bootstrap modal (`data-bs-toggle="modal"`)

**SincronizaÃƒÂ§ÃƒÂ£o de dados**:
- Evento customizado: `status-workflow-updated`
- InvalidaÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica de cache via cacheService.js
- AtualizaÃƒÂ§ÃƒÂ£o de `window.EFFECTIVE_STATUS_CONFIG` apÃƒÂ³s mudanÃƒÂ§as
- Disparo de `ui:config:updated` para componentes externos

**RemoÃƒÂ§ÃƒÂ£o de fallbacks hardcoded**:
- js/config.js: `STATUS_CONFIG` agora ÃƒÂ© array vazio com comentÃƒÂ¡rio de deprecation
- Sistema depende exclusivamente de dados do Firestore (coleÃƒÂ§ÃƒÂ£o `statusConfig`)
- Mensagens de erro apropriadas em caso de falha ao carregar

**Modais legados marcados como deprecated**:
- js/statusTableConfigSimple.js
- js/slaConfigManager.js
- js/workflowEditorUI.js
- Warnings de deprecation adicionados aos arquivos
- Funcionalidades mantidas temporariamente para retrocompatibilidade

**Arquivos criados**:
- `js/modals/StatusWorkflowUnifiedModal.js`: Modal principal
- `js/modals/StatusWorkflowUnified_StatusTab.js`: Manager da tab Status

**Arquivos modificados**:
- `js/uiComponents/init.js`: Registro do novo modal
- `index.html`: Novo ponto de entrada UI
- `js/config.js`: RemoÃƒÂ§ÃƒÂ£o de fallbacks

**PrÃƒÂ³ximos passos** (Fase 2):
- MigraÃƒÂ§ÃƒÂ£o completa das tabs SLA e Workflows
- ImplementaÃƒÂ§ÃƒÂ£o de modal de ediÃƒÂ§ÃƒÂ£o inline para status
- ReestruturaÃƒÂ§ÃƒÂ£o de dados no Firestore (consolidaÃƒÂ§ÃƒÂ£o de coleÃƒÂ§ÃƒÂµes)
- RemoÃƒÂ§ÃƒÂ£o definitiva dos modais legados

## [2026-01-19] - RefatoraÃƒÂ§ÃƒÂ£o de Campos de Analistas

### refactor: separar analista responsÃƒÂ¡vel de ÃƒÂºltimo editor

**Problema Resolvido**: O campo "Analista ResponsÃƒÂ¡vel" era automaticamente sobrescrito com o nome de quem fez a ÃƒÂºltima alteraÃƒÂ§ÃƒÂ£o, impossibilitando manter um analista fixo designado para o processo.

**AlteraÃƒÂ§ÃƒÂµes Implementadas**:
- **Novo campo**: "Analista da ÃƒÂºltima alteraÃƒÂ§ÃƒÂ£o/atualizaÃƒÂ§ÃƒÂ£o" (readonly)
  - Rastreado em Firestore como `ultimoAnalistaAlteracao`
  - Atualizado automaticamente em toda ediÃƒÂ§ÃƒÂ£o do processo
  - Exibido na aba "Dados Principais" do modal de detalhes
  - **Prioridade de exibiÃƒÂ§ÃƒÂ£o**: shortName > fullName > email

- **Campo "Analista ResponsÃƒÂ¡vel"**: Agora permanece fixo
  - Pode ser editado manualmente via dropdown
  - NÃƒÂ£o ÃƒÂ© mais sobrescrito automaticamente
  - MantÃƒÂ©m o valor original mesmo apÃƒÂ³s mÃƒÂºltiplas ediÃƒÂ§ÃƒÂµes

- **Campo "Data de Entrada"**: Garantido preenchimento automÃƒÂ¡tico
  - Define `new Date()` na criaÃƒÂ§ÃƒÂ£o se nÃƒÂ£o fornecido
  - Evita processos sem data de entrada

**Estrutura de Dados**:
```javascript
{
  analista: String,               // Analista responsÃƒÂ¡vel (fixo, editÃƒÂ¡vel)
  analistaCehop: String,          // Analista CEHOP (editÃƒÂ¡vel)
  ultimoAnalistaAlteracao: String, // ÃƒÅ¡ltimo editor (auto, readonly) - shortName > fullName > email
  modificadoPor: String,          // Email do ÃƒÂºltimo editor (metadado)
  dataModificacao: Timestamp,     // Data da ÃƒÂºltima modificaÃƒÂ§ÃƒÂ£o
  entrada: Timestamp              // Data de entrada (auto na criaÃƒÂ§ÃƒÂ£o)
}
```

**Arquivos Modificados**:
- js/modals/detailsModal.js: Adicionado campo HTML readonly
- js/firestoreService.js: Removida auto-atribuiÃƒÂ§ÃƒÂ£o, adicionado `ultimoAnalistaAlteracao` com prioridade shortName > fullName > email
- js/firestoreService.js: Garantida `entrada` automÃƒÂ¡tica
- js/ui.js: Preenchimento do novo campo no modal
- js/ui.js: ExclusÃƒÂ£o do campo readonly da coleta de dados

## [2026-01-14] - CorreÃƒÂ§ÃƒÂ£o de Duplicatas em Contratos Arquivados

###  Problema: ÃƒÂndice vs Contratos Reais

**Arquitetura Identificada**:
-  **5.177 contratos JÃƒÂ MIGRADOS** para Storage (JSON files)
-  **5.177 registros no ÃƒÂ­ndice** `archivedContracts` (metadados com `migratedToStorage: true`)
-  **CÃƒÂ³digo estava contando duplicado**: Storage API (100) + ÃƒÂndice (5.177) = confusÃƒÂ£o

**CorreÃƒÂ§ÃƒÂ£o Implementada**:
-  **Filtro no ÃƒÂ­ndice**: `.where('migratedToStorage', '==', true)`
-  **Deduplica registros**: PreferÃƒÂªncia para dados do Storage API
-  **EstatÃƒÂ­sticas corretas**: 5.177 migrados (fonte: ÃƒÂ­ndice Firestore)
-  **Mensagens de log claras**: "via API + via ÃƒÂ­ndice" ao invÃƒÂ©s de "Storage + Firestore"

**LÃƒÂ³gica de Carregamento**:
1. **Storage API** (`listArchivedContracts`) - retorna metadados via Cloud Function
2. **ÃƒÂndice Firestore** (`archivedContracts` com `migratedToStorage=true`) - backup/validaÃƒÂ§ÃƒÂ£o
3. **Merge inteligente** - Remove duplicatas, prefere API quando disponÃƒÂ­vel
4. **Total real**: ~5.277 contratos (5.177 migrados + 100 adicionais via API)

**Resultado**:
-  **Todos os 5.177+ contratos visÃƒÂ­veis**
-  **Busca funciona** em ambas as fontes
-  **Cache ativo** (60min TTL)
-  **Leituras reduzidas** (paginaÃƒÂ§ÃƒÂ£o + cache)

### Pendente
- Monitorar se API Storage estÃƒÂ¡ retornando todos os contratos ou apenas ÃƒÂºltimos 100
- Se API estiver limitada, ajustar para usar mais o ÃƒÂ­ndice Firestore

## [2026-01-13] - OtimizaÃƒÂ§ÃƒÂµes CrÃƒÂ­ticas de Performance

###  Cache Persistente e ReduÃƒÂ§ÃƒÂ£o de Leituras (SUCESSO)

**Problema Resolvido**: Sistema fazia 70.114 leituras/dia (140% acima do limite) com cache hit rate de 0%.

**ImplementaÃƒÂ§ÃƒÂµes**:
-  **Cache IndexedDB Persistente**: Dados sobrevivem ao F5
  - TTL de contratos: 5min Ã¢â€ â€™ 30min
  - Todas as keys `contracts_*` persistem automaticamente
  - Cache HIT no primeiro reload: `contracts_all_active (age: 460s)`
  
-  **Preload AutomÃƒÂ¡tico**: Contratos carregados em background
  - `805 contratos prÃƒÂ©-carregados no cache` apÃƒÂ³s inicializaÃƒÂ§ÃƒÂ£o
  - PrÃƒÂ³ximo F5 carrega instantaneamente do IndexedDB
  
-  **Service Worker Stale-While-Revalidate**: 
  - APIs servidas do cache imediatamente
  - AtualizaÃƒÂ§ÃƒÂ£o em background sem bloquear UI
  - TTL de API: 5min Ã¢â€ â€™ 30min
  
-  **permissionsUI Otimizado**: 
  - Retry loop inteligente (15 tentativas Ãƒâ€” 200ms)
  - ` Usando 805 contratos do appState (tentativa 2)`
  - Eliminou leitura de 200 docs no startup

**Resultados Validados** (Console do Browser):
```
 IndexedDB conectado
 Cache HIT (IndexedDB): contracts_all_active (age: 460s)
 [Preload] 805 contratos prÃƒÂ©-carregados no cache
 [PermissionsUI] Usando 805 contratos do appState (tentativa 2)
 App initialization: 1170ms
```

**MÃƒÂ©tricas de Impacto**:
| MÃƒÂ©trica | Antes | Depois | Melhoria |
|---------|-------|--------|----------|
| Cache Hit Rate | 0% | ~80% | +Ã¢Ë†Å¾ |
| Leituras/reload | 1.805 | ~120 | **-93%** |
| Tempo carregamento | ~3s | 1.17s | **-61%** |
| Alerta "1000 docs" |  Sempre |  Nunca | 100% |

**Comandos de DiagnÃƒÂ³stico**:
```javascript
// EstatÃƒÂ­sticas completas de cache
window.diagnosticCacheStats()

// Status de listeners
window.diagnosticListenersStatus()

// Monitor de leituras
firestoreMonitor.report()
```

**Arquivos Modificados**:
- js/cacheService.js - Cache persistente + IndexedDB expandido
- js/main.js - Preload automÃƒÂ¡tico + diagnostics
- js/permissionsUI.js - Retry loop inteligente
- sw.js - Stale-While-Revalidate strategy

**PrÃƒÂ³ximos Passos**:
- Monitorar mÃƒÂ©tricas por 24h para validar reduÃƒÂ§ÃƒÂ£o de leituras
- Meta: <20.000 leituras/dia (60% de reduÃƒÂ§ÃƒÂ£o do pico)

---

## [2026-01-10]

###  EstilizaÃƒÂ§ÃƒÂ£o e PadronizaÃƒÂ§ÃƒÂ£o

- **PadronizaÃƒÂ§ÃƒÂ£o CSS**: CentralizaÃƒÂ§ÃƒÂ£o de todas as variÃƒÂ¡veis de estilo em `css/variables.css`.
- **RefatoraÃƒÂ§ÃƒÂ£o**: SubstituiÃƒÂ§ÃƒÂ£o de valores hardcoded por variÃƒÂ¡veis CSS em `css/style.css` e outros arquivos.
- **RemoÃƒÂ§ÃƒÂ£o do Modo Escuro**: 
  - Descontinuado suporte a temas (Dark Mode) para simplificaÃƒÂ§ÃƒÂ£o.
  - Removido arquivo `js/themeManager.js`.
  - Removidos toggles de tema em `index.html`, `login.html`, `profile.html`.
  - Limpeza de seletores `[data-theme="dark"]` e lÃƒÂ³gica JS relacionada.
- **DocumentaÃƒÂ§ÃƒÂ£o**: AtualizaÃƒÂ§ÃƒÂ£o de `docs/PADRONIZACAO_ESTILOS.md` com novas diretrizes.

## [NÃƒÂ£o LanÃƒÂ§ado] - 2026-01-09

###  CorreÃƒÂ§ÃƒÂ£o: Status nÃƒÂ£o renderizados no Kanban com filtro de workflow

**Problema**: Status com contratos nÃƒÂ£o apareciam no Kanban quando nÃƒÂ£o estavam listados no workflow ativo.

**Causa**: 
- O sistema filtra as colunas do Kanban baseado no workflow ativo (individual/associativo)
- Cada workflow define um array `stages` com os status permitidos (em `workflowConfig.js`)
- A lÃƒÂ³gica de filtragem em `ui.js:2612` verificava apenas `allowedStages.has(s.text)`
- Quando havia **desalinhamento** entre:
  - Status no `workflowConfig.js` (`ALL_STATUSES`)
  - Status na configuraÃƒÂ§ÃƒÂ£o dinÃƒÂ¢mica do Firestore
- Status como 'Aprovado', 'Formularios enviados', 'CertificaÃƒÂ§ÃƒÂ£o Realizada em Montagem', 'SIOPI', etc. eram **filtrados mesmo tendo contratos**

**Exemplo do problema**:
```
 Status filtrados (nÃƒÂ£o exibidos): ['Aprovado', 'Formularios enviados', 
    'CertificaÃƒÂ§ÃƒÂ£o Realizada em Montagem', 'SIOPI', 'Contrato registrado - anexar SIOPI']
```
Esses 5 status tinham contratos mas nÃƒÂ£o apareciam no Kanban!

**SoluÃƒÂ§ÃƒÂ£o**:
1. **LÃƒÂ³gica inteligente de filtragem**: Status sempre aparecem se tÃƒÂªm contratos
   ```javascript
   STATUS_LIST = STATUS_LIST.filter(s => {
     const inWorkflow = allowedStages.has(s.text);
     const hasContracts = statusWithContracts.has(s.text);
     return inWorkflow || hasContracts; // Inclui se estÃƒÂ¡ no workflow OU tem contratos
   });
   ```

2. **Logs detalhados**:
   -  Mostra status adicionados mesmo estando fora do workflow
   -  Mostra apenas status realmente filtrados (sem contratos)
   -  Alerta sobre desalinhamentos na configuraÃƒÂ§ÃƒÂ£o

**Arquivos modificados**:
- js/ui.js (linhas 2624-2650): LÃƒÂ³gica aprimorada de filtragem
- js/ui.js (linhas 2604-2620): Debug de alinhamento

**Resultado**: 
-  Todos os status com contratos aparecem no Kanban
-  Respeita filtros de workflow quando nÃƒÂ£o hÃƒÂ¡ contratos
-  Previne perda de visualizaÃƒÂ§ÃƒÂ£o de processos
-  Logs claros para identificar problemas de configuraÃƒÂ§ÃƒÂ£o

## [NÃƒÂ£o LanÃƒÂ§ado] - 2026-01-08

###  CorreÃƒÂ§ÃƒÂ£o: UI NÃƒÂ£o Atualiza ApÃƒÂ³s EdiÃƒÂ§ÃƒÂ£o Inline de Status

**Problema**: Ao atualizar o status de um processo via ediÃƒÂ§ÃƒÂ£o inline na "contract-list", a UI nÃƒÂ£o refletia a mudanÃƒÂ§a (especialmente a cor de fundo da linha que depende do status).

**Causa**: ApÃƒÂ³s salvar a ediÃƒÂ§ÃƒÂ£o inline em `inlineEditService.js`, a funÃƒÂ§ÃƒÂ£o `saveEdit()` atualizava apenas a cÃƒÂ©lula editada na tabela, mas nÃƒÂ£o disparava uma re-renderizaÃƒÂ§ÃƒÂ£o global ou atualizaÃƒÂ§ÃƒÂ£o do cache local. Como o status afeta estilos CSS (cor de fundo, border), a falta de re-render deixava a linha com estilos desatualizados.

**SoluÃƒÂ§ÃƒÂ£o**: Adicionar chamadas a `updateContractInLocalCache()` e `rerenderCurrentView()` apÃƒÂ³s salvar a ediÃƒÂ§ÃƒÂ£o inline (inlineEditService.js:476-487).
- `updateContractInLocalCache()` sincroniza o cache local com os novos dados
- `rerenderCurrentView()` re-renderiza toda a lista, reaplicando os estilos corretos baseados no novo status

###  CorreÃƒÂ§ÃƒÂ£o: Lista de Contratos Desaparecia ApÃƒÂ³s Criar Novo Processo

**Problema**: Ao criar um novo contrato em "Adicionar Novo Processo", a listagem no Kanban/Lista mostrava apenas o novo contrato criado, e os demais somiam. ApÃƒÂ³s F5, reapareciam.

**Causa**: ApÃƒÂ³s criar um novo contrato, a funÃƒÂ§ÃƒÂ£o `rerenderCurrentView()` era chamada, que usava `addContractToLocalCache()`. Quando o listener em tempo real recebia um update, ele retornava apenas o novo documento como mudanÃƒÂ§a incremental do Firestore, nÃƒÂ£o a lista completa.

**SoluÃƒÂ§ÃƒÂ£o**: Substituir `rerenderCurrentView()` por `loadContractsPage()` apÃƒÂ³s criar um novo contrato (eventListeners.js:934).
- `loadContractsPage()` faz uma busca completa do Firestore ou usa o cache com dados completos
- Garante que todos os contratos filtrados sÃƒÂ£o carregados, nÃƒÂ£o apenas mudanÃƒÂ§as incrementais do listener

## [NÃƒÂ£o LanÃƒÂ§ado] - 2026-01-07

###  Arquitetura HÃƒÂ­brida - ReduÃƒÂ§ÃƒÂ£o de Leituras

- **Arquivamento Inteligente no Storage**:
  -  Cloud Functions para arquivamento automÃƒÂ¡tico de contratos finalizados
  -  Contratos salvos como JSON no Firebase Storage (custo zero de leitura)
  -  ÃƒÂndice mantido no Firestore para busca rÃƒÂ¡pida
  -  Dados completos carregados sob demanda do Storage
  -  Economia estimada de 90% nas leituras do Firestore

- **ServiÃƒÂ§o Frontend (storageArchiveService.js)**:
  -  Cache inteligente de 1 hora para contratos jÃƒÂ¡ visualizados
  -  MÃƒÂ©todos para listar, buscar, restaurar contratos arquivados
  -  EstatÃƒÂ­sticas de economia de leituras
  -  InvalidaÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica de cache em operaÃƒÂ§ÃƒÂµes de arquivamento

- **IntegraÃƒÂ§ÃƒÂ£o com firestoreService.js**:
  -  MÃƒÂ©todos hÃƒÂ­bridos exportados: `archiveContractsToStorageHybrid`, `getArchivedContractFromStorage`
  -  Busca unificada que combina ÃƒÂ­ndice Firestore com dados do Storage
  -  Compatibilidade retroativa com mÃƒÂ©todo antigo `migrateArchivedContracts`

- **Interface de AdministraÃƒÂ§ÃƒÂ£o**:
  -  BotÃƒÂ£o "Arquivar para Storage" em archived-contracts.html (admin apenas)
  -  ExibiÃƒÂ§ÃƒÂ£o de estatÃƒÂ­sticas de economia em tempo real
  -  Busca e visualizaÃƒÂ§ÃƒÂ£o de contratos arquivados
  -  Carregamento lazy de dados completos ao abrir detalhes
  -  Indicador visual de origem dos dados (Firestore vs Storage)

- **SeguranÃƒÂ§a**:
  -  Storage Rules atualizadas para pasta `arquivos/contratos_arquivados/`
  -  Apenas admins podem arquivar/restaurar via Cloud Functions
  -  UsuÃƒÂ¡rios autenticados podem visualizar contratos arquivados
  -  Rate limiting de 100 req/min por usuÃƒÂ¡rio

- **DocumentaÃƒÂ§ÃƒÂ£o**:
  -  README.md atualizado com guia rÃƒÂ¡pido de uso
  -  DocumentaÃƒÂ§ÃƒÂ£o tÃƒÂ©cnica completa em `docs/HYBRID_ARCHITECTURE.md`
  -  Exemplos de cÃƒÂ³digo e estimativas de economia de custos
  -  Benchmarks de performance e troubleshooting

- **ConfiguraÃƒÂ§ÃƒÂ£o de Status**:
  -  Flag `archiveContracts: true` em STATUS_CONFIG para marcar status arquivÃƒÂ¡veis
  -  Status "Finalizado/ConcluÃƒÂ­do" e "Distrato" configurados para arquivamento automÃƒÂ¡tico

- **Cloud Functions Adicionadas**:
  - `archiveContractsToStorage` - Arquiva contratos em lotes
  - `getArchivedContractFromStorage` - Busca contrato especÃƒÂ­fico
  - `listArchivedContracts` - Lista com filtros e paginaÃƒÂ§ÃƒÂ£o
  - `restoreContractFromArchive` - Restaura contrato para Firestore ativo

###  Adicionado
- **Modal Detalhes > Aba IA**: nova aba "IA Assistida" com upload de documentos e painel de sugestÃƒÂµes/validaÃƒÂ§ÃƒÂ£o.

###  Modificado
- **SugestÃƒÂµes IA**: suporte a campos aninhados de `compradores` (cria cards dinÃƒÂ¢micos, aplica valores e dispara eventos de mudanÃƒÂ§a).
- **InicializaÃƒÂ§ÃƒÂ£o**: `aiDetailsTab` agora ÃƒÂ© inicializado em `main.js` com provider backend forÃƒÂ§ado.
- **HistÃƒÂ³rico**: `addContractHistoryEntry` reabilitado/exportado para registrar aÃƒÂ§ÃƒÂµes de IA em `contracts/{id}/historico`.

###  Modificado
- **Requerimentos**: modelo de ITBI agora explÃƒÂ­cito para Almirante TamandarÃƒÂ©/PR e opÃƒÂ§ÃƒÂ£o ajustada na UI.
- **Modal de Detalhes**: cartÃƒÂµes "InformaÃƒÂ§ÃƒÂµes do Empreendimento" e "Dados do ImÃƒÂ³vel" foram unificados em um bloco ÃƒÂºnico.
- **Requerimentos**: saÃƒÂ­das agora podem ser baixadas em TXT, Word (.doc) ou PDF (via jsPDF).

### Corrigido
- **Assistente Inteligente - Compradores nÃƒÂ£o sendo preenchidos**: 
  -  **Causa raiz**: MÃƒÂ©todo `UI.renderCompradorItem` nÃƒÂ£o existia, impedindo adiÃƒÂ§ÃƒÂ£o de compradores
  -  Corrigido `fillCompradores()` para usar `createCompradorFields` (disponÃƒÂ­vel globalmente)
  -  Adicionado mÃƒÂ©todo `setupCompradorEvents()` para configurar eventos (remover, tornar principal)
  -  Logs detalhados do processo de adiÃƒÂ§ÃƒÂ£o de cada comprador
  -  Destaque visual com classe `ai-suggested` nos compradores adicionados
  
- **Assistente Inteligente - Campos gerais**:
  - Atualizado prompt da IA em `aiService.js` para extrair array completo de compradores
  - Adicionado mÃƒÂ©todo `fillCompradores()` no `aiContractUI.js` para preencher compradores dinamicamente
  - Atualizado `getFormData()` para coletar compradores existentes no formulÃƒÂ¡rio
  - Adicionada compatibilidade reversa em `documentProcessingService.js` para converter campos legados (clientePrincipal/clienteConjuge) em array de compradores
  - Backend (Firebase Functions) jÃƒÂ¡ estava correto para processar array de compradores

###  Melhorado
- **Sistema de Debug para IA**:
  - Adicionado mÃƒÂ©todo `enableDebug()` no `aiContractUI` para facilitar depuraÃƒÂ§ÃƒÂ£o
  - Logs detalhados em todos os mÃƒÂ©todos crÃƒÂ­ticos de preenchimento
  - MÃƒÂ©todo `fillFormWithData()` agora mostra quais campos foram preenchidos e valores
  - Melhor tratamento de tipos de dados (nÃƒÂºmeros, datas, strings)
  - Dispara eventos `change` e `input` apÃƒÂ³s preencher para ativar validaÃƒÂ§ÃƒÂµes
  - DocumentaÃƒÂ§ÃƒÂ£o completa de debug em `docs/DEBUG_IA_PREENCHIMENTO.md`
  
- **Processamento de Documentos**:
  - ValidaÃƒÂ§ÃƒÂ£o adicional se dados foram extraÃƒÂ­dos antes de preencher
  - Mensagens de erro mais descritivas
  - Logs detalhados do fluxo completo de processamento

- **Auto-Completar Campos**:
  - Logs de dados atuais e completados pela IA
  - Melhor feedback sobre campos preenchidos

## [4.13.2] - 2025-01-02

###  SeguranÃƒÂ§a - Backend IA ForÃƒÂ§ado
**BREAKING CHANGE**: ConfiguraÃƒÂ§ÃƒÂ£o de IA agora ÃƒÂ© exclusivamente no backend.

#### Adicionado
- DocumentaÃƒÂ§ÃƒÂ£o completa: `docs/BACKEND_AI_SETUP.md`
- Interface simplificada mostra apenas status do backend
- ValidaÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica de Vertex AI no Google Cloud

#### Modificado
- **aiSettings.js**: Campos de API key removidos do frontend
- Interface mostra apenas status "Ativo" com Vertex AI
- `saveSettings()` e `clearSettings()` mantidas para compatibilidade
- Todas as chaves antigas removidas do localStorage

#### SeguranÃƒÂ§a
-  Chaves de API nunca expostas no cliente
-  Todas requisiÃƒÂ§ÃƒÂµes processadas via Cloud Functions
-  Rate limiting: 100 req/min por usuÃƒÂ¡rio
-  AutenticaÃƒÂ§ÃƒÂ£o Firebase obrigatÃƒÂ³ria

#### Deploy
-  Frontend atualizado e deployado
-  **Requer**: Habilitar Vertex AI API no Google Cloud
-  Ver: `docs/BACKEND_AI_SETUP.md`
## [4.13.2] - 2026-01-02

###  Corrigido
- Modal " Provedor de IA" nÃƒÂ£o estava abrindo - adicionado estrutura completa do modal ao AiAndSlaModals.js
- BotÃƒÂ£o de configuraÃƒÂ§ÃƒÂ£o de IA agora funciona corretamente com atributo data-open-modal="modal-ia"

## [4.13.1] - 2025-01-03

###  Adicionado
- **Anexos no chat**: Upload de PDF, imagens, DOC/DOCX no Assistente IA
- ValidaÃƒÂ§ÃƒÂ£o de tamanho (10MB) e tipos permitidos
- Preview visual de arquivos anexados
- BotÃƒÂ£o paperclip com feedback de sucesso

###  Melhorado
- IntegraÃƒÂ§ÃƒÂ£o com `documentProcessingService.js`
- Estilo responsivo do botÃƒÂ£o de anexo com dark mode

## [4.13.0] - 2026-01-02

###  Assistente IA Unificado (NOVO)
ImplementaÃƒÂ§ÃƒÂ£o completa de assistente conversacional que centraliza todas as funcionalidades de IA.

#### Adicionado
- **aiAssistantManager.js** - Orquestrador central de IA (1.000+ linhas)
- **aiChatUI.js** - Interface de chat flutuante moderna (600+ linhas)  
- **css/ai-chat.css** - Estilos profissionais com dark mode (400+ linhas)
- **Firestore Rules** - ColeÃƒÂ§ÃƒÂ£o `aiConversations` para histÃƒÂ³rico
- **10 Intents** - DetecÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica de intenÃƒÂ§ÃƒÂµes do usuÃƒÂ¡rio
- **HistÃƒÂ³rico Persistente** - Conversas salvas no Firestore
- **SugestÃƒÂµes Proativas** - IA oferece ajuda contextual
- **Quick Actions** - Atalhos para tarefas comuns
- **Suporte a Anexos** - Upload de arquivos no chat

#### Funcionalidades
-  ConversaÃƒÂ§ÃƒÂ£o em linguagem natural
-  Processar documentos (PDF, imagens)
-  Criar e validar contratos
-  Gerar relatÃƒÂ³rios com insights
-  Busca semÃƒÂ¢ntica inteligente
-  ValidaÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica de dados

#### Integrado com MÃƒÂ³dulos Existentes
-  aiService.js
-  documentProcessingService.js
-  aiContractAssistant.js
-  aiReportGenerator.js
-  Backend Vertex AI

#### DocumentaÃƒÂ§ÃƒÂ£o Simplificada
- README.md e CHANGELOG.md atualizados
- Guias rÃƒÂ¡pidos em `/docs`

---
## [4.13.0] - 2026-01-02

###  Assistente IA Unificado (NOVO)
ImplementaÃƒÂ§ÃƒÂ£o completa de assistente conversacional que centraliza todas as funcionalidades de IA.

#### Adicionado
- **aiAssistantManager.js** (1.000+ linhas):
  - Orquestrador central de todas funcionalidades de IA
  - DetecÃƒÂ§ÃƒÂ£o de 10 tipos de intenÃƒÂ§ÃƒÂµes (intents)
  - HistÃƒÂ³rico persistente no Firestore com cache local
  - Roteamento inteligente para mÃƒÂ³dulos existentes
  - AnÃƒÂ¡lise de contexto conversacional
  - SugestÃƒÂµes proativas e contextuais

- **aiChatUI.js** (600+ linhas):
  - Interface de chat flutuante moderna
  - Widget responsivo com dark mode
  - Quick actions para tarefas comuns
  - SugestÃƒÂµes dinÃƒÂ¢micas em botÃƒÂµes
  - Typing indicator animado
  - Badge de notificaÃƒÂ§ÃƒÂµes nÃƒÂ£o lidas
  - Suporte a anexos de arquivos

- **css/ai-chat.css** (400+ linhas):
  - Estilos profissionais para o chat
  - AnimaÃƒÂ§ÃƒÂµes suaves (typing, slide-in)
  - Tema claro/escuro automÃƒÂ¡tico
  - Design 100% responsivo
  - Acessibilidade (WCAG)

- **Firestore Rules**:
  - ColeÃƒÂ§ÃƒÂ£o `aiConversations` para histÃƒÂ³rico
  - PermissÃƒÂµes por usuÃƒÂ¡rio autenticado
  - SubcoleÃƒÂ§ÃƒÂ£o `messages` com metadata

#### Funcionalidades
-  ConversaÃƒÂ§ÃƒÂ£o em linguagem natural
-  Processar documentos (PDF, imagens, texto)
-  Criar e validar contratos com assistÃƒÂªncia
-  Gerar relatÃƒÂ³rios com insights automÃƒÂ¡ticos
-  Busca semÃƒÂ¢ntica inteligente
-  ValidaÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica de dados
-  SugestÃƒÂµes proativas baseadas em contexto
-  AnÃƒÂ¡lise de status e recomendaÃƒÂ§ÃƒÂµes

#### IntegraÃƒÂ§ÃƒÂµes
-  IntegraÃƒÂ§ÃƒÂ£o completa com `aiService.js`
-  IntegraÃƒÂ§ÃƒÂ£o com `documentProcessingService.js`
-  IntegraÃƒÂ§ÃƒÂ£o com `aiContractAssistant.js`
-  IntegraÃƒÂ§ÃƒÂ£o com `aiReportGenerator.js`
-  Backend Vertex AI (Cloud Functions)

#### Modificado
- **index.html**: Adicionado imports do assistente IA
- **package.json**: Adicionado build do `ai-chat.css`
- **firestore.rules**: Adicionado regras para conversas de IA

#### DocumentaÃƒÂ§ÃƒÂ£o
- docs/AI_ASSISTANT_QUICKSTART.md - Guia rÃƒÂ¡pido de uso
- docs/AI_ASSISTANT_DEPLOY.md - Guia de deploy
- Exemplos de integraÃƒÂ§ÃƒÂ£o em `js/aiIntegrationExample.js`

---

## [4.12.1] - 2026-01-02

###  Melhorias de SeguranÃƒÂ§a (CRÃƒÂTICO)
ImplementaÃƒÂ§ÃƒÂ£o completa de recursos de seguranÃƒÂ§a para proteger contra vulnerabilidades comuns.

#### Adicionado
- **Firebase App Check**: ProteÃƒÂ§ÃƒÂ£o contra bots e requisiÃƒÂ§ÃƒÂµes nÃƒÂ£o autorizadas
  - SDK integrado em `index.html`
  - ConfiguraÃƒÂ§ÃƒÂ£o em `js/auth.js` com suporte a reCAPTCHA v3
  - Modo debug automÃƒÂ¡tico para desenvolvimento local
  
- **UtilitÃƒÂ¡rios de SanitizaÃƒÂ§ÃƒÂ£o** (`js/securityUtils.js`):
  - `escapeHtml()` - Escapa caracteres HTML perigosos
  - `safeInnerHTML()` - Wrapper seguro para innerHTML
  - `sanitizeUrl()` - Bloqueia protocolos perigosos (javascript:, data:)
  - `stripHtml()` - Remove todas as tags HTML
  - `sanitizeFilename()` - Limpa nomes de arquivo
  - `isValidEmail()` - ValidaÃƒÂ§ÃƒÂ£o de email
  - `createSafeElement()` - CriaÃƒÂ§ÃƒÂ£o segura de elementos DOM
  - `safeJsonParse()` - Parse JSON com tratamento de erro
  
- **ProteÃƒÂ§ÃƒÂ£o CSRF** (`js/csrfProtection.js`):
  - GeraÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica de tokens CSRF
  - ProteÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica de formulÃƒÂ¡rios com `data-csrf-protect`
  - ValidaÃƒÂ§ÃƒÂ£o antes de submit
  - Interceptor para fetch API
  - Tokens com expiraÃƒÂ§ÃƒÂ£o (1 hora)
  
- **Rate Limiting** (Cloud Functions):
  - Limite de 100 requisiÃƒÂ§ÃƒÂµes por minuto por usuÃƒÂ¡rio
  - Bloqueio temporÃƒÂ¡rio de 5 minutos apÃƒÂ³s exceder
  - Logs automÃƒÂ¡ticos de auditoria
  - Wrapper `secureOnCall()` para facilitar implementaÃƒÂ§ÃƒÂ£o

#### Modificado
- **js/auth.js**: Integrado Firebase App Check com configuraÃƒÂ§ÃƒÂ£o de reCAPTCHA v3
- **js/aiSettings.js**: Removido localStorage de chaves API, forÃƒÂ§ando uso exclusivo do backend
- **functions/index.js**: Adicionado rate limiting em funÃƒÂ§ÃƒÂµes crÃƒÂ­ticas:
  - `createOrUpdateStatus`
  - `listStatuses`
  - `toggleStatusActive`
  - `deleteStatus`
- **index.html**: Adicionado SDK do App Check e imports de utilitÃƒÂ¡rios de seguranÃƒÂ§a
- **.gitignore**: Adicionado proteÃƒÂ§ÃƒÂ£o para arquivos .env

#### DocumentaÃƒÂ§ÃƒÂ£o
- **docs/SECURITY_README.md**: Resumo executivo das implementaÃƒÂ§ÃƒÂµes
- **docs/SECURITY_IMPROVEMENTS.md**: DocumentaÃƒÂ§ÃƒÂ£o completa e tÃƒÂ©cnica
- **docs/SECURITY_QUICK_START.md**: Guia rÃƒÂ¡pido de deploy
- **docs/SECURITY_EXAMPLES.md**: Exemplos prÃƒÂ¡ticos de uso

#### Removido
- OpÃƒÂ§ÃƒÂ£o de configurar chaves API Google AI/OpenAI no cliente (seguranÃƒÂ§a)
- Armazenamento de chaves API em localStorage (vulnerabilidade XSS)

#### Requisitos de Deploy
 **IMPORTANTE**: Configure reCAPTCHA v3 no Firebase Console antes do deploy em produÃƒÂ§ÃƒÂ£o
- URL: https://console.firebase.google.com/project/sistema-gestor-de-processos-demo/appcheck
- Atualize `siteKey` em `js/auth.js` apÃƒÂ³s configurar

---

## [4.11.12] - 2025-12-16

## [4.11.13] - 2025-12-16

###  ModularizaÃƒÂ§ÃƒÂ£o WhatsApp e Init Controlado
- `initUIComponents` passou a receber opÃƒÂ§ÃƒÂµes por componente, respeitando `window.__AUTO_RENDER_UI_COMPONENTS__ = false` para inicializaÃƒÂ§ÃƒÂ£o explÃƒÂ­cita em pÃƒÂ¡ginas que desejarem.
- `index.html` agora desativa auto-render e chama `initUIComponents` com todos os blocos necessÃƒÂ¡rios.
- Modal de configuraÃƒÂ§ÃƒÂµes WhatsApp fatiado em submÃƒÂ³dulos reutilizÃƒÂ¡veis: abas gerais/tags/mensagens rÃƒÂ¡pidas, nÃƒÂºmeros, templates, agentes, estatÃƒÂ­sticas, formulÃƒÂ¡rios de tag/mensagem e phone number.
- `NotificationSettingsModal` padronizado para Bootstrap 5 (`data-bs-dismiss`) e `Modal.getOrCreateInstance` em reutilizaÃƒÂ§ÃƒÂµes.

#### Arquivos Modificados
- index.html
- js/uiComponents/init.js
- js/modals/NotificationSettingsModal.js
- js/modals/WhatsAppSettingsModals.js

#### Novos SubmÃƒÂ³dulos WhatsApp
- js/modals/whatsapp/WhatsAppConfigModal.js
- js/modals/whatsapp/WhatsAppGeneralTab.js
- js/modals/whatsapp/WhatsAppTagsTab.js
- js/modals/whatsapp/WhatsAppQuickMessagesTab.js
- js/modals/whatsapp/WhatsAppNumbersModal.js
- js/modals/whatsapp/WhatsAppPhoneNumberModal.js
- js/modals/whatsapp/WhatsAppTagFormModal.js
- js/modals/whatsapp/WhatsAppQuickMessageFormModal.js
- js/modals/whatsapp/WhatsAppStatsModal.js
- js/modals/whatsapp/WhatsAppAgentsModal.js
- js/modals/whatsapp/WhatsAppSendTemplateModal.js
- js/modals/whatsapp/WhatsAppTemplatesModal.js

###  CorreÃƒÂ§ÃƒÂµes de UI e Estabilidade de Modais
- **CorreÃƒÂ§ÃƒÂ£o CrÃƒÂ­tica Bootstrap**: Implementado fallback preventivo (`data-force-css="true"`) em todos os modais de configuraÃƒÂ§ÃƒÂ£o para evitar o erro `TypeError: Illegal invocation` do `selector-engine.js`.
- **CorreÃƒÂ§ÃƒÂ£o de Z-Index**: Implementada funÃƒÂ§ÃƒÂ£o `applyModalZIndex` no `modalManager.js` para corrigir sobreposiÃƒÂ§ÃƒÂ£o de backdrop quando modais sÃƒÂ£o abertos via fallback CSS.
- **PadronizaÃƒÂ§ÃƒÂ£o de Acessibilidade**: Adicionados atributos `role="dialog"`, `aria-modal="true"` e `aria-labelledby` em modais de configuraÃƒÂ§ÃƒÂ£o (Status, UsuÃƒÂ¡rios, NotificaÃƒÂ§ÃƒÂµes, etc.).

#### Arquivos Modificados
- `js/modalManager.js`: LÃƒÂ³gica de fallback e correÃƒÂ§ÃƒÂ£o de z-index.
- `js/modals/AiAndSlaModals.js`: ConfiguraÃƒÂ§ÃƒÂ£o de fallback para modais de IA e SLA.
- `js/modals/UsersAndStatusModals.js`: ConfiguraÃƒÂ§ÃƒÂ£o de fallback e acessibilidade para modais de usuÃƒÂ¡rios e status.
- `js/modals/AdminSettingsModals.js`: ConfiguraÃƒÂ§ÃƒÂ£o de fallback para modais administrativos.
- `js/modals/WhatsAppSettingsModals.js`: ConfiguraÃƒÂ§ÃƒÂ£o de fallback para modais do WhatsApp.
- `js/modals/NotificationSettingsModal.js`: ConfiguraÃƒÂ§ÃƒÂ£o de fallback e acessibilidade.
- `js/advanced/csvImportValidatorUI.js`: ConfiguraÃƒÂ§ÃƒÂ£o de fallback para modal de importaÃƒÂ§ÃƒÂ£o CSV.

## [4.11.11] - 2025-12-16

###  ModularizaÃƒÂ§ÃƒÂ£o de UI (Estrutura Completa)
- **Nova Arquitetura de Componentes**: Sistema completo de injeÃƒÂ§ÃƒÂ£o de DOM via ES Modules
  - Estrutura organizada: `js/modals/`, `js/offcanvas/`, `js/pages/`, `js/collapses/`, `js/uiComponents/`
  - ReduÃƒÂ§ÃƒÂ£o de ~70% no peso inicial do HTML (index.html, whatsapp-dashboard.html, etc.)
  - Cacheamento de componentes: cada modal/offcanvas/pÃƒÂ¡gina em arquivo separado e cacheÃƒÂ¡vel
  - Compatibilidade mantida: todos os IDs e comportamentos originais preservados

#### Componentes Modularizados

**Modais Core:**
- js/modals/AddContractModal.js - Modal de adicionar processo
- js/modals/DetailsModal.js - Modal de detalhes do processo
- js/modals/ArchivedContractsDetailsModal.js - Detalhes de contratos arquivados
- js/modals/NotificationSettingsModal.js - ConfiguraÃƒÂ§ÃƒÂµes de notificaÃƒÂ§ÃƒÂµes

**Modais Admin:**
- js/modals/AdminSettingsModals.js - Cluster de modais admin (AgÃƒÂªncias/CartÃƒÂ³rios/PermissÃƒÂµes)
- js/modals/UsersAndStatusModals.js - Modais de usuÃƒÂ¡rios e status
- js/modals/AiAndSlaModals.js - Modais de IA e SLA
- js/modals/VendorsModals.js - Modais de construtoras/empreendimentos

**Modais WhatsApp:**
- js/modals/WhatsAppSettingsModals.js - ConfiguraÃƒÂ§ÃƒÂµes WhatsApp + phone-number-modal
- js/modals/WhatsAppDashboardModals.js - Modais do dashboard WhatsApp
- js/modals/WhatsAppWorkflowModals.js - Editor de workflows

**Offcanvas (PainÃƒÂ©is Laterais):**
- js/offcanvas/FiltersOffcanvas.js - Painel de filtros
- js/offcanvas/KpiManagerOffcanvas.js - Gerenciador de KPIs + datalist de ÃƒÂ­cones
- css/offcanvas-standard.css - Estilos padronizados para offcanvas

**Scripts de PÃƒÂ¡ginas:**
- js/pages/callPageInit.js - InicializaÃƒÂ§ÃƒÂ£o da pÃƒÂ¡gina de chamadas
- js/pages/whatsappDashboardPageInit.js - Init do dashboard WhatsApp
- js/pages/whatsappWorkflowsPageInit.js - Init de workflows

**Scripts UtilitÃƒÂ¡rios:**
- js/pdfjsInit.js - ConfiguraÃƒÂ§ÃƒÂ£o do PDF.js (extraÃƒÂ­do do inline)
- js/statusModalAutoReload.js - Auto-reload de status
- js/legacyModalBackdropObserver.js - Observer de backdrops legados
- js/whatsapp/whatsappDebugInlineInit.js - Debug/init WhatsApp
- js/whatsapp/whatsappConfigModalInlineInit.js - Config modal WhatsApp

**Infraestrutura:**
- js/uiComponents/init.js - Loader principal que injeta componentes na ordem correta
- js/modalManager.js - Gerenciador global de modais (window.openModal/closeModal)

###  Corrigido
- **Acessibilidade de Modais**: Warning `aria-hidden` em modais com elementos focados
  - Problema: Bootstrap adicionava `aria-hidden="true"` em modais contendo botÃƒÂµes com foco, causando warning de acessibilidade
  - SoluÃƒÂ§ÃƒÂ£o: Adicionado listener `hide.bs.modal` em js/modalManager.js que remove `aria-hidden` antes do modal fechar quando hÃƒÂ¡ elemento focado
  - Impacto: Elimina warning do console sem afetar funcionalidade, melhora conformidade WCAG

- **CSS Duplicado**: Removido arquivo obsoleto `css/modal-fix.css`
  - Funcionalidade consolidada em `css/modal-standard.css` e `js/modalManager.js`

###  Validado
- **Sistema de Z-Index de Modais**: Funcionamento perfeito confirmado via logs do console
  - Modal principal (`details-modal`): z-index 1055, backdrop 1050
  - Modal aninhado (`confirmModal`): z-index 1065, backdrop 1060
  - Incremento correto de +10 para cada nÃƒÂ­vel de aninhamento
  - Backdrop cobrindo 100% do viewport sem gaps
  - InteraÃƒÂ§ÃƒÂ£o do usuÃƒÂ¡rio funcionando perfeitamente

- **ModularizaÃƒÂ§ÃƒÂ£o**: Todos os componentes injetados corretamente
  - Tempo de injeÃƒÂ§ÃƒÂ£o: <50ms por componente
  - Compatibilidade: 100% com cÃƒÂ³digo legado
  - IDs preservados: Todos os listeners e referÃƒÂªncias funcionando

###  MÃƒÂ©tricas de Funcionamento
- Cache hit rate: ~90% (conforme logs de `cacheService.js`)
- Performance de updates: <600ms
- Renders otimizados com throttling (evita re-renders em <300ms)
- Listeners em tempo real funcionando corretamente
- ReduÃƒÂ§ÃƒÂ£o de HTML inicial: ~70% (melhor FCP - First Contentful Paint)
- Cacheamento de componentes: 100% dos modais/offcanvas cacheÃƒÂ¡veis pelo browser

###  BenefÃƒÂ­cios da ModularizaÃƒÂ§ÃƒÂ£o
- **Performance**: HTML inicial 70% menor, carregamento mais rÃƒÂ¡pido
- **Manutenibilidade**: Cada componente em arquivo separado e testÃƒÂ¡vel
- **Cache**: Componentes cacheÃƒÂ¡veis pelo browser, reduz re-downloads
- **OrganizaÃƒÂ§ÃƒÂ£o**: Estrutura clara de pastas (modals/, offcanvas/, pages/)
- **DX**: Desenvolvimento mais fÃƒÂ¡cil, componentes isolados e reutilizÃƒÂ¡veis

## [4.11.10] - 2025-12-16

###  Corrigido (CRÃƒÂTICO)
- **BUG CRÃƒÂTICO**: Tela em branco apÃƒÂ³s salvar alteraÃƒÂ§ÃƒÂ£o em modal de detalhes do processo
- Implementada soluÃƒÂ§ÃƒÂ£o em 5 camadas para garantir re-renderizaÃƒÂ§ÃƒÂ£o correta:
  
  1. **Modal Closure Timing** (js/eventListeners.js)
     - Modal agora fecha explicitamente ANTES de re-renderizar
     - Aguarda 150ms para Bootstrap transitions finalizarem
     - Previne conflito entre modal visibility e page visibility
  
  2. **DOM Validation em renderContracts()** (js/ui.js)
     - Valida existÃƒÂªncia de `#table-header` e `#contract-list` ANTES de renderizar
     - Retorna com log de erro se elementos nÃƒÂ£o encontrados
     - Previne manipulaÃƒÂ§ÃƒÂ£o de elementos null/undefined
  
  3. **DOM Validation em renderKanbanBoard()** (js/ui.js)
     - Valida existÃƒÂªncia de `#kanban-board` ANTES de renderizar
     - Retorna com log se elemento nÃƒÂ£o encontrado
  
  4. **Page Visibility Validation** (js/main.js - rerenderCurrentView)
     - Valida se pÃƒÂ¡gina `.active` existe ANTES de renderizar
     - Re-ativa `#page-processos` se perdida
     - Previne tentativa de render em pÃƒÂ¡gina invisÃƒÂ­vel
  
  5. **Page Recovery Listener** (js/eventListeners.js)
     - Listener em `hidden.bs.modal` valida estado da pÃƒÂ¡gina
     - Re-ativa pÃƒÂ¡gina automaticamente se perdida
     - Dispara evento customizado `pageReactivated` para notificaÃƒÂ§ÃƒÂµes

### Detalhes da CorreÃƒÂ§ÃƒÂ£o
- **Problema**: Quando salvar contrato: modal permanecia aberto durante re-render Ã¢â€ â€™ conflito DOM Ã¢â€ â€™ pÃƒÂ¡gina inteira desaparecia
- **Root Cause**: Bootstrap modal.hide() ÃƒÂ© assÃƒÂ­ncrono (~150ms), mas re-render iniciava imediatamente
- **SoluÃƒÂ§ÃƒÂ£o**: SequÃƒÂªncia ordenada: (1) Close modal + wait 150ms Ã¢â€ â€™ (2) Validate page active Ã¢â€ â€™ (3) Validate DOM elements Ã¢â€ â€™ (4) Render Ã¢â€ â€™ (5) Recover if lost

### Logs Adicionados
- `[UpdateContract]  Modal fechado, aguardando renderizaÃƒÂ§ÃƒÂ£o...`
- ` renderContracts: elemento nÃƒÂ£o encontrado no DOM`
- ` [Rerender] Nenhuma pÃƒÂ¡gina estÃƒÂ¡ ativa, re-renderizaÃƒÂ§ÃƒÂ£o abortada`
- `[DetailsModal]  page-processos re-ativada com sucesso`

## [4.11.9] - 2025-12-16

###  Corrigido
- **BUG CRÃƒÂTICO**: Backdrop modal permanecia ativo bloqueando a tela apÃƒÂ³s fechar modal de confirmaÃƒÂ§ÃƒÂ£o dentro do modal de detalhes do processo
- Implementada limpeza inteligente de backdrops ÃƒÂ³rfÃƒÂ£os em:
  - js/uiHelpers.js: Nova funÃƒÂ§ÃƒÂ£o `cleanupOrphanedBackdrops()` que remove backdrops quando nÃƒÂ£o hÃƒÂ¡ modais visÃƒÂ­veis
  - js/modalManager.js: Listener global no evento `hidden.bs.modal` para limpeza automÃƒÂ¡tica de backdrops apÃƒÂ³s qualquer modal fechar
- Melhorada sequÃƒÂªncia de fechamento de modais aninhados com delays para permitir transiÃƒÂ§ÃƒÂµes do Bootstrap finalizarem

### Detalhes da CorreÃƒÂ§ÃƒÂ£o
- **Problema**: Quando o ConfirmModal (aninhado dentro do DetailsModal) fechava, o backdrop residual nÃƒÂ£o era removido, bloqueando interaÃƒÂ§ÃƒÂµes
- **SoluÃƒÂ§ÃƒÂ£o**:
  1. FunÃƒÂ§ÃƒÂ£o `cleanupOrphanedBackdrops()` centraliza a lÃƒÂ³gica de limpeza
  2. Modal ConfirmModal aguarda 50ms apÃƒÂ³s `hide()` antes de resolver a promise para permitir transiÃƒÂ§ÃƒÂµes
  3. ModalManager usa listener global em capture phase para limpar qualquer backdrop ÃƒÂ³rfÃƒÂ£o apÃƒÂ³s fechamento de modal

## [4.11.8] - 2025-12-15

### Adicionado
- Scripts cacheÃƒÂ¡veis extraÃƒÂ­dos do `index.html` (mantendo o mesmo comportamento):
  - js/pdfjsInit.js (config do PDF.js)
  - js/legacyModalBackdropObserver.js (observer de `modal-open`/scroll)
  - js/statusModalAutoReload.js (auto-reload do modal de Status)
  - js/whatsapp/whatsappDebugInlineInit.js (debug/init WhatsApp)

- ModularizaÃƒÂ§ÃƒÂ£o adicional de pÃƒÂ¡ginas auxiliares (injeÃƒÂ§ÃƒÂ£o de UI + scripts cacheÃƒÂ¡veis):
  - js/modals/ArchivedContractsDetailsModal.js
  - js/uiComponents/archivedContractsInit.js
  - js/modals/WhatsAppWorkflowsModals.js
  - js/uiComponents/whatsappWorkflowsInit.js
  - js/pages/whatsappWorkflowsPageInit.js

- ModularizaÃƒÂ§ÃƒÂ£o da pÃƒÂ¡gina `whatsapp-dashboard.html` (injeÃƒÂ§ÃƒÂ£o de modais + extraÃƒÂ§ÃƒÂ£o de scripts inline):
  - js/modals/WhatsAppDashboardModals.js
  - js/uiComponents/whatsappDashboardInit.js
  - js/pages/whatsappDashboardFallback.js
  - js/pages/whatsappDashboardPageInit.js

- Script cacheÃƒÂ¡vel extraÃƒÂ­do do `call.html` (mantÃƒÂ©m o mesmo comportamento):
  - js/pages/callPageInit.js

### Alterado
- index.html: removidos os blocos `<script>` inline acima e substituÃƒÂ­dos por `<script src="...">`.
- index.html: removido o HTML do `#phone-number-modal` (agora injetado via ES Modules).
- index.html: removidos os modais admin `#modal-agencia-admin`, `#modal-cartorio-admin` e `#permissions-edit-modal` (agora injetados).
- index.html: removidos os modais custom `#modal-usuarios`, `#modal-status`, `#status-rules-modal`, `#edit-rule-modal` e `#status-table-config-modal` (agora injetados).
- index.html: removidos os modais custom `#modal-ia`, `#modal-ia-direct` e `#modal-sla-config` (agora injetados).
- index.html: removidos os modais de Construtoras `#modal-vendor-form`, `#modal-vendor-empreendimentos` e `#modal-vendor-detail` (agora injetados).
- js/modals/WhatsAppSettingsModals.js: passou a injetar tambÃƒÂ©m o modal `#phone-number-modal` e prÃƒÂ©-instanciar via Bootstrap.
- js/modals/AdminSettingsModals.js: novo cluster de modais admin (AgÃƒÂªncias/CartÃƒÂ³rios/PermissÃƒÂµes) para reduzir o HTML monolÃƒÂ­tico.
- js/modals/UsersAndStatusModals.js: novo cluster de modais custom (UsuÃƒÂ¡rios + Status/Regras/Config) mantendo IDs/HTML original.
- js/modals/AiAndSlaModals.js: novo cluster de modais custom (IA/ImportaÃƒÂ§ÃƒÂ£o + SLA) mantendo IDs/HTML original.
- js/modals/VendorsModals.js: novo cluster de modais de Construtoras/Empreendimentos mantendo IDs/HTML original.
- js/uiComponents/init.js: passa a injetar os modais admin cedo para compatibilidade com `agenciasUI`/`cartoriosUI`/permissÃƒÂµes.
- js/uiComponents/init.js: passa a injetar cedo tambÃƒÂ©m os modais custom de UsuÃƒÂ¡rios/Status.
- js/uiComponents/init.js: passa a injetar cedo tambÃƒÂ©m os modais custom de IA/ImportaÃƒÂ§ÃƒÂ£o e SLA.
- js/uiComponents/init.js: passa a injetar cedo tambÃƒÂ©m os modais de Construtoras/Empreendimentos para compatibilidade com `vendorsUI`.
- js/whatsapp/whatsappConfigModalInlineInit.js: removidos badges hardcoded nas abas (evita UX/contagens incorretas).

- archived-contracts.html: removido o HTML do modal `#detailsModal` e adicionado loader de injeÃƒÂ§ÃƒÂ£o antes de `archivedContracts.js`.
- whatsapp-workflows.html: removidos os modais (`#workflowEditorModal`, `#workflowTriggerModal`, `#workflowStepModal`) do HTML e extraÃƒÂ­do o `<script type="module">` de inicializaÃƒÂ§ÃƒÂ£o para arquivo cacheÃƒÂ¡vel.
- whatsapp-dashboard.html: removidos os modais do HTML (agora injetados) e extraÃƒÂ­dos os scripts inline (fallback Bootstrap + init Firebase/dynamic import) para arquivos cacheÃƒÂ¡veis.
- call.html: removido o `<script type="module">` inline e substituÃƒÂ­do por `<script type="module" src="js/pages/callPageInit.js">`.

## [4.11.6] - 2025-12-15

### Adicionado
- Componente modular do modal Bootstrap Ã¢â‚¬Å“Detalhes do ProcessoÃ¢â‚¬Â:
  - js/modals/DetailsModal.js

### Alterado
- js/uiComponents/init.js: passa a injetar o `#details-modal` cedo para compatibilidade com mÃƒÂ³dulos que acessam seus IDs na inicializaÃƒÂ§ÃƒÂ£o.
- index.html: removido o bloco HTML do `#details-modal` (agora injetado via ES Modules).

## [4.11.5] - 2025-12-15

### Adicionado
- Componente modular do modal Bootstrap Ã¢â‚¬Å“Adicionar Novo ProcessoÃ¢â‚¬Â:
  - js/modals/AddContractModal.js

### Alterado
- js/uiComponents/init.js: passa a injetar o `#add-contract-modal` cedo para manter compatibilidade com cÃƒÂ³digo legado.
- index.html: removido o bloco HTML do `#add-contract-modal` (agora injetado via ES Modules).

## [4.11.4] - 2025-12-15

### Adicionado
- Gerenciador de modais (cacheÃƒÂ¡vel) extraÃƒÂ­do do HTML para arquivo dedicado:
  - js/modalManager.js (mantÃƒÂ©m `window.openModal` / `window.closeModal` e listeners globais)
- Componente modular do modal customizado de configuraÃƒÂ§ÃƒÂµes de notificaÃƒÂ§ÃƒÂµes:
  - js/modals/NotificationSettingsModal.js
- Componente modular do painel de filtros (Offcanvas Bootstrap):
  - js/offcanvas/FiltersOffcanvas.js
- Componente modular do gerenciador de KPIs (Offcanvas Bootstrap + datalist de ÃƒÂ­cones):
  - js/offcanvas/KpiManagerOffcanvas.js

### Alterado
- index.html: removido o script inline do Ã¢â‚¬Å“Modal ManagerÃ¢â‚¬Â e removidos o HTML/script inline legados do `notification-settings-modal` (agora injetado via `js/uiComponents/init.js`).
- index.html: removido o HTML do `filtersOffcanvas` (agora injetado via `js/uiComponents/init.js`).
- index.html: removidos o HTML do `kpiManagerOffcanvas` e o `kpi-icon-datalist` (agora injetados via `js/uiComponents/init.js`).
- js/notificationUI.js: abertura/fechamento do modal de configuraÃƒÂ§ÃƒÂµes passa a usar `window.openModal` / `window.closeModal` quando disponÃƒÂ­veis (mantÃƒÂ©m fallback legado).

## [4.11.3] - 2025-12-15

### Adicionado
- **ModularizaÃƒÂ§ÃƒÂ£o de UI (primeira etapa)**: infraestrutura de injeÃƒÂ§ÃƒÂ£o de DOM via ES Modules para reduzir o peso do `index.html` sem bundlers.
  - Loader: js/uiComponents/init.js
  - Componentes extraÃƒÂ­dos:
    - js/modals/WhatsAppAgentModal.js
    - js/offcanvas/NotificationCenterOffcanvas.js
    - js/modals/WhatsAppNotificationSettingsModal.js
    - js/modals/ConfirmModal.js
    - js/modals/PendenciaModal.js

### Alterado
- index.html: removidos os blocos HTML desses componentes e adicionada a carga do loader modular, mantendo os mesmos IDs para compatibilidade com cÃƒÂ³digo legado.

## [4.11.2] - 2025-12-12

### Adicionado
- ConfiguraÃƒÂ§ÃƒÂ£o de campos visÃƒÂ­veis por status no modal "ConfiguraÃƒÂ§ÃƒÂµes de Status" (apenas campos presentes nas abas "FormulÃƒÂ¡rios" e "Registro" do modal de Detalhes).
- Toggle "Exibir todos os campos" no modal "Detalhes do Processo" para alternar entre visÃƒÂ£o completa e visÃƒÂ£o por status.
- Campo de busca no modal "Editar Regra para o Status" para filtrar a lista de campos (aplica ao grupo de obrigatÃƒÂ³rios e de visÃƒÂ­veis).

### Alterado
- AplicaÃƒÂ§ÃƒÂ£o de visibilidade por status no modal de Detalhes: somente campos das abas "FormulÃƒÂ¡rios" e "Registro" sÃƒÂ£o afetados; sem regra definida, a visÃƒÂ£o exibe todos os campos.

### Corrigido
- `js/ui.js`: erro "Unexpected token 'export'" ao abrir o modal de detalhes. A funÃƒÂ§ÃƒÂ£o `applyDetailsFieldVisibility` foi movida para o escopo de mÃƒÂ³dulo (fora de `populateDetailsModal`).

## [4.11.1] - 2025-12-12

### Adicionado
- **FunÃƒÂ§ÃƒÂµes de PermissÃƒÂµes (Cloud Functions)**: Reimplementadas 5 funÃƒÂ§ÃƒÂµes faltantes
  - `getUserPermissions`: Busca permissÃƒÂµes de um usuÃƒÂ¡rio especÃƒÂ­fico
  - `listUserPermissions`: Lista todas as permissÃƒÂµes (apenas admins)
  - `updateUserPermissions`: Atualiza permissÃƒÂµes de um usuÃƒÂ¡rio (apenas admins)
  - `bulkUpdateUserPermissions`: Atualiza permissÃƒÂµes em lote (max 500, apenas admins)
  - `resetUserPermissions`: Reseta permissÃƒÂµes para padrÃƒÂ£o (apenas admins)
  - DocumentaÃƒÂ§ÃƒÂ£o completa em `REIMPLEMENTACAO_FUNCOES_PERMISSOES.md`

### Corrigido
- **Deploy Firebase**: FunÃƒÂ§ÃƒÂµes que existiam no Firebase mas nÃƒÂ£o no cÃƒÂ³digo local
  - Problema detectado: 5 funÃƒÂ§ÃƒÂµes de permissÃƒÂµes estavam ausentes
  - Causa: FunÃƒÂ§ÃƒÂµes foram deletadas ou nunca commitadas
  - Impacto: Front-end (`permissionsService.js`, `userPermissionService.js`) dependia delas
  - SoluÃƒÂ§ÃƒÂ£o: Reimplementadas seguindo padrÃƒÂ£o existente com seguranÃƒÂ§a e auditoria

### SeguranÃƒÂ§a
- **ProteÃƒÂ§ÃƒÂ£o de Auto-RemoÃƒÂ§ÃƒÂ£o**: Admins nÃƒÂ£o podem remover suas prÃƒÂ³prias permissÃƒÂµes
- **Auditoria**: Todas operaÃƒÂ§ÃƒÂµes registram `updatedAt` e `updatedBy`
- **ValidaÃƒÂ§ÃƒÂ£o**: VerificaÃƒÂ§ÃƒÂ£o de claims de admin e parÃƒÂ¢metros obrigatÃƒÂ³rios
- **Limite de Batch**: MÃƒÂ¡ximo 500 atualizaÃƒÂ§ÃƒÂµes por lote para evitar timeout

## [4.11.0] - 2025-12-12

### Adicionado
- **Sistema de Build CSS Profissional**: ConfiguraÃƒÂ§ÃƒÂ£o completa de minificaÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica com PostCSS
  - `postcss.config.js`: ConfiguraÃƒÂ§ÃƒÂ£o com autoprefixer e cssnano
  - Scripts npm: `build:css`, `build:css:style`, `build:css:all`, `watch:css`
  - Hook `predeploy` automÃƒÂ¡tico para build antes do deploy
  - DocumentaÃƒÂ§ÃƒÂ£o completa em `docs/BUILD_CSS.md`
- **DocumentaÃƒÂ§ÃƒÂ£o de PadronizaÃƒÂ§ÃƒÂ£o**: Guias completos de Bootstrap 5
  - `docs/PADRONIZACAO_BOOTSTRAP5.md`: Guia de conformidade Bootstrap 5
  - `docs/ANALISE_ESTILIZACAO.md`: AnÃƒÂ¡lise detalhada de estilos

### Alterado
- **MigraÃƒÂ§ÃƒÂ£o Bootstrap 5**: AtualizaÃƒÂ§ÃƒÂ£o completa para Bootstrap 5.3.3 + Icons 1.11.3
  - Todos os 8 arquivos HTML atualizados com integridade SRI
  - Componentes modernizados (modals, buttons, alerts, cards)
  - ÃƒÂcones migrados para Bootstrap Icons
- **OtimizaÃƒÂ§ÃƒÂ£o CSS**: ReduÃƒÂ§ÃƒÂ£o significativa de tamanho e padronizaÃƒÂ§ÃƒÂ£o
  - `style.css`: 287 KB Ã¢â€ â€™ 191 KB (33.6% reduÃƒÂ§ÃƒÂ£o)
  - `login.css`: 3 KB Ã¢â€ â€™ 2.2 KB (27.7% reduÃƒÂ§ÃƒÂ£o)
  - `whatsapp-advanced.css`: 8.7 KB Ã¢â€ â€™ 6.2 KB (28.2% reduÃƒÂ§ÃƒÂ£o)
  - `whatsapp-autocomplete.css`: 3 KB Ã¢â€ â€™ 2.2 KB (26.8% reduÃƒÂ§ÃƒÂ£o)
  - Total: ~100 KB economizados (~33% reduÃƒÂ§ÃƒÂ£o mÃƒÂ©dia)
- **Arquitetura CSS**: ReorganizaÃƒÂ§ÃƒÂ£o em 6 arquivos modulares
  - `css/variables.css`: 174 linhas de design tokens
  - `css/utilities.css`: 836 linhas com 60+ classes utilitÃƒÂ¡rias
  - `css/modal-standard.css`: 390 linhas de modais unificados
  - `css/style.css`: 12,497 linhas (core styles)
- **Limpeza de CÃƒÂ³digo**:
  - Inline styles: 100+ ocorrÃƒÂªncias Ã¢â€ â€™ 3 (97% reduÃƒÂ§ÃƒÂ£o)
  - Dark mode: 32 seletores mistos Ã¢â€ â€™ 222 consistentes `[data-theme="dark"]`
  - Cores hardcoded: 312 removidas e substituÃƒÂ­das por variÃƒÂ¡veis (-28%)
  - DeclaraÃƒÂ§ÃƒÂµes !important: 81 removidas desnecessÃƒÂ¡rias (-14%)
  - CSS variables: Duplicatas em portuguÃƒÂªs removidas, consolidadas em inglÃƒÂªs

### Corrigido
- **Bug CrÃƒÂ­tico - Tela Branca**: ReferÃƒÂªncia circular de variÃƒÂ¡vel CSS
  - `--primary-color: var(--primary-color)` Ã¢â€ â€™ `--primary-color: #0039BA`
  - Preveniu erro de processamento de variÃƒÂ¡veis CSS
- **Bug WhatsApp - Filtro Admin**: CorreÃƒÂ§ÃƒÂ£o de visibilidade para admins
  - Problema: classe `d-none` do Bootstrap nÃƒÂ£o era removida corretamente
  - SoluÃƒÂ§ÃƒÂ£o: Alterado de `style.display = 'block'` para `classList.remove('d-none')`
  - Arquivo: `js/whatsappUI.js` (linha 585)
  - Funcionalidade restaurada: "Mostrar apenas minhas conversas" agora aparece para admins
- **Erro de Build CSS**: Sintaxe CSS corrigida
  - Removida chave `}` extra na linha 8371 (bloco de animaÃƒÂ§ÃƒÂ£o)
  - Build PostCSS executado com sucesso

### TÃƒÂ©cnico
- **PostCSS Pipeline**: 113 pacotes npm instalados para otimizaÃƒÂ§ÃƒÂ£o
  - `postcss`: Processador CSS moderno
  - `postcss-cli`: Interface de linha de comando
  - `cssnano`: MinificaÃƒÂ§ÃƒÂ£o agressiva (12 otimizaÃƒÂ§ÃƒÂµes ativas)
  - `autoprefixer`: Compatibilidade automÃƒÂ¡tica de navegadores
- **OtimizaÃƒÂ§ÃƒÂµes cssnano ativas**:
  - RemoÃƒÂ§ÃƒÂ£o de comentÃƒÂ¡rios e whitespace
  - NormalizaÃƒÂ§ÃƒÂ£o de seletores e propriedades
  - Merge de regras duplicadas
  - MinificaÃƒÂ§ÃƒÂ£o de cores e valores
  - OtimizaÃƒÂ§ÃƒÂ£o de fonts e gradientes
- **Workflow de Build**:
  - Desenvolvimento: Usar arquivos `.css` originais
  - ProduÃƒÂ§ÃƒÂ£o: Usar arquivos `.min.css` gerados
  - Deploy automÃƒÂ¡tico: Hook `predeploy` executa build
  - Watch mode disponÃƒÂ­vel para desenvolvimento contÃƒÂ­nuo

### Performance
- **ReduÃƒÂ§ÃƒÂ£o de Banda**: ~100 KB economizados em CSS (33% menor)
- **Tempo de Parse**: Arquivos minificados carregam 40% mais rÃƒÂ¡pido
- **Cache Browser**: Arquivos otimizados melhoram cache hit rate
- **First Paint**: ReduÃƒÂ§ÃƒÂ£o no tempo de renderizaÃƒÂ§ÃƒÂ£o inicial

### DocumentaÃƒÂ§ÃƒÂ£o
- `docs/BUILD_CSS.md`: Guia completo do sistema de build
- `docs/PADRONIZACAO_BOOTSTRAP5.md`: PadrÃƒÂµes de UI e componentes
- `docs/ANALISE_ESTILIZACAO.md`: AnÃƒÂ¡lise tÃƒÂ©cnica de estilos

### PrÃƒÂ³ximos Passos
- Atualizar HTML para usar `.min.css` em produÃƒÂ§ÃƒÂ£o
- Considerar source maps para debugging
- Avaliar splitting de CSS crÃƒÂ­tico
- Implementar CSS purging para remover cÃƒÂ³digo nÃƒÂ£o utilizado

## [4.10.0] - 2025-12-03

### Adicionado
- **SeparaÃƒÂ§ÃƒÂ£o de Workflows (Individual vs Associativo)**: ImplementaÃƒÂ§ÃƒÂ£o completa da distinÃƒÂ§ÃƒÂ£o entre tipos de processos.
- **Filtro Global por PreferÃƒÂªncia**: O sistema agora respeita a preferÃƒÂªncia de workflow definida no perfil do usuÃƒÂ¡rio em todas as telas (Dashboard, Lista de Contratos, RelatÃƒÂ³rios).
- **ConfiguraÃƒÂ§ÃƒÂ£o de Perfil**: Nova opÃƒÂ§ÃƒÂ£o "PreferÃƒÂªncias de Workflow" na tela de perfil para definir a visualizaÃƒÂ§ÃƒÂ£o padrÃƒÂ£o.
- **Status DinÃƒÂ¢micos**: Workflows agora utilizam exclusivamente os status definidos no banco de dados (`EFFECTIVE_STATUS_CONFIG`), removendo configuraÃƒÂ§ÃƒÂµes hardcoded.

### Alterado
- `js/main.js`: PaginaÃƒÂ§ÃƒÂ£o e carregamento de contratos filtrados pela preferÃƒÂªncia do usuÃƒÂ¡rio.
- `js/dashboardService.js`: KPIs e grÃƒÂ¡ficos filtrados automaticamente pelo workflow ativo.
- `js/ui.js`: Modal de "Adicionar Processo" prÃƒÂ©-seleciona o workflow baseado na preferÃƒÂªncia.
- `js/workflowConfig.js`: RemoÃƒÂ§ÃƒÂ£o de etapas estÃƒÂ¡ticas para forÃƒÂ§ar uso da configuraÃƒÂ§ÃƒÂ£o dinÃƒÂ¢mica.

### Corrigido
- CorreÃƒÂ§ÃƒÂ£o na visibilidade de processos onde usuÃƒÂ¡rios viam tipos de workflow misturados no dashboard.

## [4.9.0] - 2025-12-02

### Adicionado
- **Suporte a mÃƒÂºltiplos valores separados por quebra de linha na ImportaÃƒÂ§ÃƒÂ£o CSV AvanÃƒÂ§ada**
- Nova funÃƒÂ§ÃƒÂ£o `parseTelefoneColumn(rawValue)`: Processa mÃƒÂºltiplos telefones separados por quebra de linha
- Nova funÃƒÂ§ÃƒÂ£o `parseCpfColumn(rawValue)`: Processa mÃƒÂºltiplos CPFs separados por quebra de linha
- Nova funÃƒÂ§ÃƒÂ£o `sanitizeFirestoreId(str)`: Sanitiza strings para IDs vÃƒÂ¡lidos do Firestore
- AssociaÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica de dados: Cliente (linha 1) + Telefone (linha 1) + CPF (linha 1) Ã¢â€ â€™ Comprador 1
- ValidaÃƒÂ§ÃƒÂ£o de telefones (mÃƒÂ­nimo 10 dÃƒÂ­gitos) e CPFs (exatamente 11 dÃƒÂ­gitos)
- FormataÃƒÂ§ÃƒÂ£o inteligente para exibiÃƒÂ§ÃƒÂ£o: `JoÃƒÂ£o Silva - CPF: 123.456.789-00 - Tel: (11) 99999-9999`
- LÃƒÂ³gica de consolidaÃƒÂ§ÃƒÂ£o no mÃƒÂ©todo `_processRow` para mesclar dados de colunas separadas
- Arquivo de exemplo: `docs/exemplo-multiplos-valores.csv`
- DocumentaÃƒÂ§ÃƒÂ£o completa: `docs/TESTE_MULTIPLOS_VALORES_CSV.md`

### Corrigido
- **CRÃƒÂTICO**: Erro de importaÃƒÂ§ÃƒÂ£o CSV causado por IDs invÃƒÂ¡lidos do Firestore
  - IDs agora sÃƒÂ£o sanitizados removendo caracteres especiais (/, \, etc.)
  - Previne erro: `Invalid document reference. Document references must have an even number of segments`
  - FunÃƒÂ§ÃƒÂ£o `sanitizeFirestoreId` garante compatibilidade com regras do Firestore

### Alterado
- `js/advanced/csvImportValidatorService.js` v1.1.0:
  - Mapeamento de headers expandido: `telefone`, `telefones`, `tel`, `celular`, `cpf`, `cpfs`, `documento`
  - MÃƒÂ©todo `_processRow()`: Adiciona processamento especial para colunas `telefone` e `cpf` com mÃƒÂºltiplos valores
  - MÃƒÂ©todo `_processRow()`: Adiciona consolidaÃƒÂ§ÃƒÂ£o final para associar telefones e CPFs aos compradores
  - MÃƒÂ©todo `getDataForImport()`: Sanitiza IDs existentes e gerados para prevenir erros do Firestore
  - MÃƒÂ©todo `_formatRecordForDisplay()`: Adiciona formataÃƒÂ§ÃƒÂ£o de telefones nos compradores
  - MÃƒÂ©todo `_formatRecordForDisplay()`: Adiciona exibiÃƒÂ§ÃƒÂ£o separada de arrays `telefones` e `cpfs`
  - ExportaÃƒÂ§ÃƒÂ£o expandida: Inclui `parseClienteColumn`, `parseTelefoneColumn`, `parseCpfColumn`, `sanitizeFirestoreId`
- `ESTRUTURA_IMPORTACAO_CSV.md`: Adicionada seÃƒÂ§ÃƒÂ£o completa explicando mÃƒÂºltiplos valores nas colunas

### TÃƒÂ©cnico
- Arrays intermediÃƒÂ¡rios (`telefones`, `cpfs`) sÃƒÂ£o preservados para referÃƒÂªncia
- Valores originais preservados em `_telefoneOriginal`, `_cpfOriginal` para debug
- NormalizaÃƒÂ§ÃƒÂ£o robusta de quebras de linha: `\r\n`, `\r`, `\n`
- Primeiro comprador sempre marcado como `principal: true`
- ValidaÃƒÂ§ÃƒÂ£o nÃƒÂ£o bloqueia importaÃƒÂ§ÃƒÂ£o, apenas gera warnings para valores invÃƒÂ¡lidos
- IDs do Firestore limitados a 100 caracteres e sanitizados com regex: `/[^a-zA-Z0-9_-]/g`

## [4.8.0] - 2025-01-27

### Adicionado
- **Sistema de PendÃƒÂªncias completo**: Novo mÃƒÂ³dulo para gerenciamento de tarefas/pendÃƒÂªncias por processo
- `js/pendenciasService.js`: ServiÃƒÂ§o CRUD com cache integrado, suporte a tipos, prioridades, status e setores
- `js/pendenciasUI.js`: Interface completa com lista, badges, filtros e modais para criar/editar pendÃƒÂªncias
- Aba "PendÃƒÂªncias" no modal de detalhes do processo
- Modal de criaÃƒÂ§ÃƒÂ£o/ediÃƒÂ§ÃƒÂ£o de pendÃƒÂªncias com campos para tÃƒÂ­tulo, descriÃƒÂ§ÃƒÂ£o, tipo, prioridade, setor e prazo
- Badge de pendÃƒÂªncias nos cards do Kanban mostrando quantidade de pendÃƒÂªncias ativas
- Cloud Functions para operaÃƒÂ§ÃƒÂµes CRUD seguras (`criarPendencia`, `listarPendencias`, `atualizarPendencia`, `resolverPendencia`, `excluirPendencia`, `adicionarComentarioPendencia`)
- Estilos CSS completos para cards, badges, meta-info e comentÃƒÂ¡rios de pendÃƒÂªncias

### Alterado
- `js/ui.js`: Adicionada funÃƒÂ§ÃƒÂ£o `updatePendenciasBadges()` para atualizar badges de pendÃƒÂªncias apÃƒÂ³s renderizaÃƒÂ§ÃƒÂ£o do Kanban
- `index.html`: Adicionada aba de pendÃƒÂªncias e modal com formulÃƒÂ¡rio completo
- `css/style.css`: Novos estilos para sistema de pendÃƒÂªncias
- `firestore.rules`: Regras de seguranÃƒÂ§a para coleÃƒÂ§ÃƒÂ£o `pendencias`

### TÃƒÂ©cnico
- PendÃƒÂªncias usam cache com TTL curto (1-2 min) para badges, atualizaÃƒÂ§ÃƒÂ£o em lote para performance
- Suporte a 6 tipos de pendÃƒÂªncia: documento, aprovaÃƒÂ§ÃƒÂ£o, pagamento, assinatura, correÃƒÂ§ÃƒÂ£o, outro
- Suporte a 4 nÃƒÂ­veis de prioridade: baixa, mÃƒÂ©dia, alta, urgente
- Suporte a 5 status: aberta, em_andamento, aguardando, resolvida, cancelada
- IntegraÃƒÂ§ÃƒÂ£o com sistema de comentÃƒÂ¡rios por pendÃƒÂªncia

## [4.7.1] - 2025-01-26

### Adicionado
- Multi-select dropdown para ediÃƒÂ§ÃƒÂ£o de "PrÃƒÂ³ximos Status" na tabela de configuraÃƒÂ§ÃƒÂ£o
- Interface visual com busca, tags e checkboxes para seleÃƒÂ§ÃƒÂ£o mÃƒÂºltipla de status destino
- Tags coloridas com indicaÃƒÂ§ÃƒÂ£o do estÃƒÂ¡gio para cada status selecionado

### Alterado
- `js/statusTableConfigSimple.js` v3.4.0: Implementado selector dropdown com position fixed (z-index 10100) para evitar clipping por overflow do modal
- FunÃƒÂ§ÃƒÂ£o `saveNextSteps` atualizada para enviar todos os campos obrigatÃƒÂ³rios (stage, order, color, bgColor, active)
- FunÃƒÂ§ÃƒÂ£o `renderTableData` adiciona atributo `data-status-stage` nas linhas para referÃƒÂªncia rÃƒÂ¡pida

### Corrigido
- Erro 400 ao salvar prÃƒÂ³ximos status (campos obrigatÃƒÂ³rios ausentes na requisiÃƒÂ§ÃƒÂ£o)
- Dropdown oculto por z-index inferior ao modal pai
- Nomes de status nÃƒÂ£o visÃƒÂ­veis devido a classes CSS incorretas

### TÃƒÂ©cnico
- Classes CSS alinhadas com style.css existente (.next-step-option, .option-label, .option-stage)
- Dropdown usa posicionamento absoluto calculado via getBoundingClientRect para garantir visibilidade

## [4.7.0] - 2025-11-04

### Adicionado
- Painel "IntegraÃƒÂ§ÃƒÂ£o com Google Contatos" em `index.html`, com formulÃƒÂ¡rio Bootstrap para credenciais OAuth, botÃƒÂ£o de sincronizaÃƒÂ§ÃƒÂ£o e importaÃƒÂ§ÃƒÂ£o manual via CSV.
- ServiÃƒÂ§o `js/googleContactsService.js` responsÃƒÂ¡vel por sincronizar a People API, interpretar arquivos CSV (com limpeza/normalizaÃƒÂ§ÃƒÂ£o de telefones) e persistir contatos no Firestore com metadados de origem.

### Alterado
- `js/whatsappConfig.js`: carrega e salva credenciais do Google, exibe status contextual (fonte/arquivo), acrescenta fluxo de importaÃƒÂ§ÃƒÂ£o manual e trata feedback ao usuÃƒÂ¡rio.
- `js/whatsappService.js`: adiciona campos padrÃƒÂ£o de integraÃƒÂ§ÃƒÂ£o ao objeto de configuraÃƒÂ§ÃƒÂ£o, garantindo compatibilidade quando o documento ainda nÃƒÂ£o existe.
- `js/cacheService.js`: TTL dedicado `googleContacts` para manter cache consistente de contatos externos.

### TÃƒÂ©cnico
- SincronizaÃƒÂ§ÃƒÂ£o manual contabiliza nÃƒÂºmeros ÃƒÂºnicos antes de atualizar mÃƒÂ©tricas em `whatsappConfig/settings`.
- InvalidaÃƒÂ§ÃƒÂ£o de cache e atualizaÃƒÂ§ÃƒÂ£o de metadados apÃƒÂ³s cada sincronizaÃƒÂ§ÃƒÂ£o ou importaÃƒÂ§ÃƒÂ£o manual para manter a UI coerente.

## [4.6] - 2025-09-20

### Restaurado
- MÃƒÂ³dulo "Construtoras & Empreendimentos" reintroduzido apÃƒÂ³s reversÃƒÂ£o acidental (UI + funÃƒÂ§ÃƒÂµes Firestore).

### Adicionado
## [4.6.2] - 2025-09-20
### Adicionado
- CriaÃƒÂ§ÃƒÂ£o inline de Construtora, Empreendimento, Bloco e Apartamento diretamente no modal "Novo Processo".
- BotÃƒÂµes "+" contextuais nos campos (construtora, empreendimento, bloco, apto) com confirmaÃƒÂ§ÃƒÂ£o e prevenÃƒÂ§ÃƒÂ£o de duplicados (case/trim).
- Datalists agora ligados aos inputs do modal de novo processo (atributos list). AtualizaÃƒÂ§ÃƒÂ£o dinÃƒÂ¢mica apÃƒÂ³s cada criaÃƒÂ§ÃƒÂ£o.
- Explorer navegÃƒÂ¡vel de Construtoras e Empreendimentos dentro do modal (toggle "Explorar") permitindo preencher campos por clique.
- ValidaÃƒÂ§ÃƒÂ£o de unidade existente em contratos (consulta Firestore) antes de criar novo Apartamento (bloqueia se jÃƒÂ¡ houver processo vinculado).

### Alterado
- `index.html`: adicionados atributos `list` nos inputs e inclusÃƒÂ£o do script `vendorsInlineIntegration.js`.
- `index.html`: inserido bloco HTML `#vendors-explorer` + botÃƒÂ£o de toggle `#toggle-vendors-explorer-btn` dentro do modal "Novo Processo".
- Novo arquivo `js/vendorsInlineIntegration.js` responsÃƒÂ¡vel pela lÃƒÂ³gica de criaÃƒÂ§ÃƒÂ£o inline sem quebrar APIs existentes.
- `js/vendorsInlineIntegration.js`: inclui agora `renderExplorerVendors` / `renderExplorerEmpreendimentos` e integraÃƒÂ§ÃƒÂ£o com `contractExistsForUnit` antes de criar apartamentos.
- `firestoreService.js`: adicionada funÃƒÂ§ÃƒÂ£o `contractExistsForUnit` (consulta composta com fallback parcial) exportada no objeto principal.

### Notas TÃƒÂ©cnicas
- Uso de `getAllVendors({ forceRefresh })` para garantir coerÃƒÂªncia de cache apÃƒÂ³s mutaÃƒÂ§ÃƒÂµes.
- Assinaturas pÃƒÂºblicas de `firestoreService` nÃƒÂ£o alteradas (compatibilidade mantida com mÃƒÂ³dulos existentes e debug global).
- ComparaÃƒÂ§ÃƒÂµes de existÃƒÂªncia normalizadas (toLowerCase + trim) para evitar duplicidades por variaÃƒÂ§ÃƒÂµes de caixa.
- Para a verificaÃƒÂ§ÃƒÂ£o de unidade jÃƒÂ¡ vinculada, recomenda-se criar ÃƒÂ­ndice composto (se ainda nÃƒÂ£o existir) em `contracts` para os campos: `vendedorConstrutora` + `empreendimento` + `bloco` + `apto`. Fallback atual faz consulta incremental (pode ser menos performÃƒÂ¡tica sem ÃƒÂ­ndice).
- Explorer utiliza listas rolÃƒÂ¡veis independentes com estilos leves (CSS seÃƒÂ§ÃƒÂ£o "VENDORS EXPLORER") sem dependÃƒÂªncias externas.

### PrÃƒÂ³ximos Passos (SugestÃƒÂµes)
- PossÃƒÂ­vel melhoria UX: transformar confirmaÃƒÂ§ÃƒÂµes `window.confirm` em mini popovers nÃƒÂ£o bloqueantes.
- Opcional: adicionar contador de uso de criaÃƒÂ§ÃƒÂ£o inline para mÃƒÂ©tricas.

- `js/vendorsUI.js`: GestÃƒÂ£o completa de construtoras, empreendimentos, blocos e apartamentos com carregamento lazy quando a aba ConfiguraÃƒÂ§ÃƒÂµes ÃƒÂ© ativada.
- `js/seedVendors.js`: Script opcional de seed para inserir construtoras base (executa apenas para admin; controlado por flags globais `__SEED_VENDORS__` / `__VENDORS_SEEDED__`).
- Painel `panel-vendors` em ConfiguraÃƒÂ§ÃƒÂµes com formulÃƒÂ¡rio de criaÃƒÂ§ÃƒÂ£o/ediÃƒÂ§ÃƒÂ£o, filtro e accordion hierÃƒÂ¡rquico.
- Datalists `datalist-vendedores` e `datalist-empreendimentos` para autocomplete em modais de processo (vendedorConstrutora / empreendimento).

### Alterado
- `index.html`: Inserido botÃƒÂ£o " Construtoras" na navegaÃƒÂ§ÃƒÂ£o lateral de ConfiguraÃƒÂ§ÃƒÂµes e painel correspondente; inclusÃƒÂ£o dos datalists e scripts de mÃƒÂ³dulo/seed ao final do body (fora de blocos `<script>` existentes para evitar conflitos de parsing).
- `firestoreService.js`: (re)inclusÃƒÂ£o das funÃƒÂ§ÃƒÂµes de vendors (getAllVendors, createOrUpdateVendor, addEmpreendimentoToVendor, addBlocoToEmpreendimento, addApartamento, patchVendor) com cache `vendors_all` e invalidaÃƒÂ§ÃƒÂ£o apÃƒÂ³s mutaÃƒÂ§ÃƒÂµes.

### TÃƒÂ©cnico
- Lazy load observa ativaÃƒÂ§ÃƒÂ£o de `#page-configuracoes` via MutationObserver e carrega vendors apenas uma vez (ou sob `reload`).
- Datalists populados dinamicamente quando o modal de detalhes abre ou quando o usuÃƒÂ¡rio altera a construtora no campo do modal.
- Accordion de empreendimentos/blocos usa IDs gerados e atualiza incrementando apÃƒÂ³s cada operaÃƒÂ§ÃƒÂ£o de write (reload forÃƒÂ§ado para refletir transaÃƒÂ§ÃƒÂ£o atualizada).

### PrÃƒÂ³ximos
- Otimizar operaÃƒÂ§ÃƒÂµes aninhadas para reduzir round-trips (possÃƒÂ­vel batch build de hierarquia em memÃƒÂ³ria antes de persistir).
- Implementar ediÃƒÂ§ÃƒÂ£o/remoÃƒÂ§ÃƒÂ£o de empreendimentos, blocos e apartamentos.
- Validar CNPJ opcional com mÃƒÂ¡scara / normalizaÃƒÂ§ÃƒÂ£o.
- Cache incremental para updates parciais sem reload completo.

### Notas
- ReversÃƒÂ£o foi causada por commit que removeu acidentalmente arquivos do mÃƒÂ³dulo; esta versÃƒÂ£o restaura e documenta claramente o painel.
- Mantida compatibilidade com futuras integraÃƒÂ§ÃƒÂµes de modais de processo (nenhuma mudanÃƒÂ§a em assinaturas pÃƒÂºblicas alÃƒÂ©m da inclusÃƒÂ£o no export default).

## [4.6.1] - 2025-09-20

### Adicionado
- Modal de detalhes de construtora (`#modal-vendor-detail`) com visÃƒÂ£o hierÃƒÂ¡rquica agregada (empreendimentos Ã¢â€ â€™ blocos Ã¢â€ â€™ apartamentos) e estatÃƒÂ­sticas (totais).
- BotÃƒÂ£o "Ver Detalhes" no painel lateral de construtoras abre modal completo.

### Alterado
- Estilos centralizados para o mÃƒÂ³dulo em `style.css` (seÃƒÂ§ÃƒÂ£o "VENDORS") removendo dependÃƒÂªncia de estilos inline.
- Painel `panel-vendors` atualizado para usar classes: `.vendors-flex`, `.vendors-left`, `.vendors-right` e ajustes de tipografia/spacing.
- `vendorsUI.js` ganha funÃƒÂ§ÃƒÂ£o `openVendorDetailModal()` e listener global para abrir o modal.

### TÃƒÂ©cnico
- RenderizaÃƒÂ§ÃƒÂ£o hierÃƒÂ¡rquica no modal usa template string ÃƒÂºnica, calculando contagens de blocos e apartamentos na montagem.
- Mantida reutilizaÃƒÂ§ÃƒÂ£o de estado carregado (nÃƒÂ£o faz fetch extra ao abrir modal).
- Badge de atividade adaptada (Ativa/Inativa) no contexto do modal.

### PrÃƒÂ³ximos
- AÃƒÂ§ÃƒÂµes de ediÃƒÂ§ÃƒÂ£o/remoÃƒÂ§ÃƒÂ£o diretamente no modal (in-line) para nÃƒÂ­veis empreendimentos/blocos/apartamentos.
- PaginaÃƒÂ§ÃƒÂ£o virtual ou collapse interno para construtoras com hierarquia muito extensa.
- Filtro rÃƒÂ¡pido dentro do modal (search local de bloco/apto).

## [4.5] - 2025-09-19

### Adicionado

- ExpansÃƒÂ£o do Perfil: avatar, claims, preferÃƒÂªncias locais (dark-mode, som, desktop), reset de senha, toggle debug.
- MÃƒÂ³dulo `profileEnhancements.js` carregado sob demanda quando a pÃƒÂ¡gina Perfil ÃƒÂ© ativada.

### Alterado

- Removido plano de pÃƒÂ¡gina separada de perfil para manter fluxo ÃƒÂºnico no `index.html`.

### TÃƒÂ©cnico

- Avatar usa `firestoreService.uploadFile` se disponÃƒÂ­vel; fallback com mensagem se ausente.
- PreferÃƒÂªncias guardadas em `localStorage` (`userPreferences`).
- Observador de mutaÃƒÂ§ÃƒÂ£o ativa carga de claims apenas quando necessÃƒÂ¡rio.
- Debug helper exposto: `window.__PROFILE_ENHANCEMENTS__`.

### PrÃƒÂ³ximos

- Sincronizar preferÃƒÂªncias no Firestore.
- Otimizar avatar (resize/compress) antes do upload.
- Mostrar estado de verificaÃƒÂ§ÃƒÂ£o de e-mail e MFA (futuro).

## [4.4] - 2025-09-19

### Adicionado

- **Sistema de CalendÃƒÂ¡rio Local**: Sistema de agenda completamente independente substituindo integraÃƒÂ§ÃƒÂ£o com Google Calendar
  - `localCalendarService.js`: ServiÃƒÂ§o principal de calendÃƒÂ¡rio com CRUD completo
  - `eventsDataModel.js`: Modelo de dados para eventos com integraÃƒÂ§ÃƒÂ£o Firestore
  - `agendaUI.js`: Interface visual da agenda atualizada para sistema local
  - `eventNotificationsService.js`: Sistema de notificaÃƒÂ§ÃƒÂµes automÃƒÂ¡ticas (15min, 1h, 1 dia)
  - `processScheduleIntegration.js`: IntegraÃƒÂ§ÃƒÂ£o para agendamento direto dos detalhes do processo

### Alterado

- **MigraÃƒÂ§ÃƒÂ£o Google Calendar Ã¢â€ â€™ Local**: Sistema removido de dependÃƒÂªncias externas
- **Interface de Agenda**: Atualizada para usar serviÃƒÂ§os locais em vez de APIs do Google
- **BotÃƒÂ£o "Agendar Compromisso"**: Adicionado aos modais de detalhes de processo
- **Modal de Agendamento**: Interface dedicada para criaÃƒÂ§ÃƒÂ£o de eventos vinculados a contratos
- **Sistema de NotificaÃƒÂ§ÃƒÂµes**: ImplementaÃƒÂ§ÃƒÂ£o local com suporte a notificaÃƒÂ§ÃƒÂµes do browser

### Corrigido

* **Erro eventNotificationsService.js**: CorreÃƒÂ§ÃƒÂ£o de `SyntaxError: Identifier 'notificationStyles' has already been declared`
  - RenomeaÃƒÂ§ÃƒÂ£o de variÃƒÂ¡vel para `eventNotificationStyles`
  - ProteÃƒÂ§ÃƒÂ£o contra re-declaraÃƒÂ§ÃƒÂµes de classe
  - VerificaÃƒÂ§ÃƒÂ£o de elemento de estilo ÃƒÂºnico no DOM

### Removido

* **Google Calendar API**: Todas as dependÃƒÂªncias e scripts relacionados
* **OAuth2 Google**: Sistema de autenticaÃƒÂ§ÃƒÂ£o externa removido
* **googleCalendarService.js**: Arquivo removido e substituÃƒÂ­do por sistema local

### TÃƒÂ©cnico

* **Cache de Eventos**: TTL de 5 minutos para otimizaÃƒÂ§ÃƒÂ£o de performance
* **MutationObserver**: DetecÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica de modais para injeÃƒÂ§ÃƒÂ£o de botÃƒÂµes
* **Firestore Integration**: Armazenamento local de eventos por usuÃƒÂ¡rio
* **Real-time Listeners**: SincronizaÃƒÂ§ÃƒÂ£o em tempo real de eventos
* **Process-Event Linking**: VinculaÃƒÂ§ÃƒÂ£o automÃƒÂ¡tica de eventos a contratos

### DocumentaÃƒÂ§ÃƒÂ£o


### Performance
- **Tempo de carregamento**: ~200ms para inicializaÃƒÂ§ÃƒÂ£o do calendÃƒÂ¡rio
- **Cache hit rate**: >80% em uso normal
- **MemÃƒÂ³ria**: <5MB para calendÃƒÂ¡rio completo
- **Cleanup automÃƒÂ¡tico**: RemoÃƒÂ§ÃƒÂ£o de notificaÃƒÂ§ÃƒÂµes antigas

## [4.3] - 2025-09-18
### Removido (2025-09-19)
- FunÃƒÂ§ÃƒÂ£o temporÃƒÂ¡ria `migrateLegacyStatus` removida apÃƒÂ³s perÃƒÂ­odo de estabilizaÃƒÂ§ÃƒÂ£o (migraÃƒÂ§ÃƒÂ£o concluÃƒÂ­da). UI e documentaÃƒÂ§ÃƒÂ£o ajustadas. Nenhuma referÃƒÂªncia restante a `collection('status')`.

### Alterado
- **MigraÃƒÂ§ÃƒÂ£o para Status DinÃƒÂ¢micos**: Sistema migrado de 46 status estÃƒÂ¡ticos para status dinÃƒÂ¢micos carregados do Firestore
- **STATUS_CONFIG Reduzido**: ConfiguraÃƒÂ§ÃƒÂ£o estÃƒÂ¡tica reduzida para apenas 5 status de fallback de emergÃƒÂªncia
- **Interface Aprimorada**: "Gerenciar Status do Sistema" agora indica claramente a fonte dos dados (banco vs fallback)
- **Mensagens Melhoradas**: Avisos detalhados no console quando sistema usa fallback de emergÃƒÂªncia
- **DocumentaÃƒÂ§ÃƒÂ£o**: Adicionado `docs/MIGRACAO_STATUS_DINAMICOS.md` com detalhes tÃƒÂ©cnicos da migraÃƒÂ§ÃƒÂ£o

### TÃƒÂ©cnico
- `js/config.js`: STATUS_CONFIG original (46 status) movido para comentÃƒÂ¡rios, mantendo apenas 5 status de emergÃƒÂªncia
- `js/statusAdminUI.js`: Indicadores visuais da fonte dos dados e avisos quando usa fallback
- `js/main.js`: Mensagens detalhadas de fallback com instruÃƒÂ§ÃƒÂµes para usuÃƒÂ¡rio
- `js/firestoreService.js`: Logs informativos sobre carregamento de status dinÃƒÂ¢micos

### BenefÃƒÂ­cios
- **Flexibilidade**: Status podem ser gerenciados via interface sem alterar cÃƒÂ³digo
- **Confiabilidade**: Sistema continua funcionando mesmo offline com 5 status bÃƒÂ¡sicos
- **Escalabilidade**: Suporte a quantos status forem necessÃƒÂ¡rios no banco
- **TransparÃƒÂªncia**: Interface mostra claramente quantos status estÃƒÂ£o carregados e de onde

## [4.2] - 2025-09-17
### Adicionado
- IA no modal "Novo Processo" para extrair dados de contratos PDF/TXT, dando prioridade a pÃƒÂ¡ginas 1Ã¢â‚¬â€œ5 e a data de emissÃƒÂ£o nas pÃƒÂ¡ginas finais.
- Suporte a mÃƒÂºltiplos provedores de IA:
  - Google AI Studio (cliente) com API Key opcional.
  - Backend (Cloud Function) com Vertex AI (OAuth) Ã¢â‚¬â€ recomendado para produÃƒÂ§ÃƒÂ£o.
  - OpenAI (cliente) como alternativa.
- SeÃƒÂ§ÃƒÂ£o "ConfiguraÃƒÂ§ÃƒÂµes de IA (Admin)" no `index.html` e controlador `js/aiSettings.js` para gerenciar AI_PROVIDER e AI_API_KEY via localStorage.
- Cloud Function `processContractWithAI` em `functions/index.js` com fallback de modelos (gemini-1.5-pro Ã¢â€ â€™ gemini-1.5-flash Ã¢â€ â€™ gemini-pro).

### Alterado
- UnificaÃƒÂ§ÃƒÂ£o de datas: "EmissÃƒÂ£o do Contrato" foi incorporada ao campo ÃƒÂºnico `dataMinuta` (UI, prompts e mapeamentos de IA).
- `documentProcessingService.js` atualizado para usar Google AI Studio no cliente quando disponÃƒÂ­vel e fazer fallback automÃƒÂ¡tico para o backend.
- `newProcessAI.js` atualizado para suportar provider `backend` e popular somente `dataMinuta`.

### SeguranÃƒÂ§a
- Removidas referÃƒÂªncias a chaves expostas nos documentos.
- RecomendaÃƒÂ§ÃƒÂ£o explÃƒÂ­cita de usar o provedor `backend` para Vertex AI.

### DocumentaÃƒÂ§ÃƒÂ£o
- `README.md` atualizado com o resumo da versÃƒÂ£o 4.2 e instruÃƒÂ§ÃƒÂµes de configuraÃƒÂ§ÃƒÂ£o.
- `INTEGRACAO_IA_NOVO_PROCESSO.md` ajustado para refletir campos unificados e provedores.
- `PROCESSAMENTO_DOCUMENTOS_IA.md` e `PROCESSAMENTO_DOCUMENTOS_IA_VERTEX.md` atualizados para o novo fluxo.
- `DOC_FIRESTORE_SERVICE.md` atualizado com a padronizaÃƒÂ§ÃƒÂ£o de `dataMinuta`.

---
Formato baseado em Keep a Changelog e SemVer (quando aplicÃƒÂ¡vel).

## [4.3] - 2025-09-18
### Adicionado
- Gerenciar KPIs aprimorado com:
  - PrÃƒÂ©-visualizaÃƒÂ§ÃƒÂ£o de resultados (valor e quantidade afetada) no modal.
  - Novos operadores de filtro: between, in, lastNDays (+ inputs dinÃƒÂ¢micos).
  - Placeholders de data mantidos: \_\_CURRENT_MONTH\_\_, \_\_CURRENT_YEAR\_\_, \_\_LAST_7_DAYS\_\_, \_\_LAST_30_DAYS\_\_, \_\_LAST_90_DAYS\_\_.
  - FormataÃƒÂ§ÃƒÂ£o por KPI: raw, currency, number, percent, days e controle de decimais (0Ã¢â‚¬â€œ6).

### Alterado
- DashboardUI registra KPIs personalizados com opÃƒÂ§ÃƒÂµes de formataÃƒÂ§ÃƒÂ£o e aplica formataÃƒÂ§ÃƒÂ£o automaticamente na renderizaÃƒÂ§ÃƒÂ£o.

### DocumentaÃƒÂ§ÃƒÂ£o
- docs/DASHBOARD_AVANCADO.md: anexo descrevendo os novos recursos de Ã¢â‚¬Å“Gerenciar KPIsÃ¢â‚¬Â.
