# Dashboard — refatoração

> **Status:** plano e decisões aprovados em 2026-10-07 (todas as
> recomendações, e os quatro extras entram). PR 1 commitado na branch
> `feat/dashboard-estrutura`; PR 2 implementado na `feat/dashboard-monitoramento`,
> com a migration 68 ainda **não aplicada** — ver "Como ficou" em cada fase. O
> mockup do layout foi mostrado na conversa que gerou este documento; as seções
> "Layout" e "Cards" descrevem o mesmo desenho.

O dashboard hoje mostra contadores e um feed de atividades. A proposta é trocar
por "o que pede ação hoje": o que chegou pelo monitoramento de processos, o que
está na agenda, o que venceu e o dinheiro que entra pela InfinitePay.

Pedido original:

1. Incluir os dados reais que chegam pelo webhook de monitoramento.
2. Manter os eventos, com uma visualização melhor.
3. Melhorar a visualização do financeiro, integrada com a InfinitePay.
4. Remover "Últimas Atividades".
5. Incluir dados novos que o sistema já tem (ideias abertas).

## Como está hoje

`src/app/(app)/dashboard/page.tsx` confere `dashboard` e renderiza
`DashboardContent` (client). Cada card tem a sua consulta React Query direto no
Supabase, sob a RLS de quem está logado.

| Faixa | Componente | Fonte | Problema |
|---|---|---|---|
| Cabeçalho | `DashboardContent` | `getDashboardStats` | — |
| Métricas | `MetricCard` ×4 | `getDashboardStats` | "Tarefas pendentes" esconde que estão atrasadas; nenhum número leva a lugar nenhum |
| Prazos + Agenda | `PrazosCard`, `AgendaHojeCard` | `getUpcomingDeadlines`, `getUpcomingEvents` | Agenda é uma lista de 6, sem dia, sem tarefas e sem clique; repete a consulta da Agenda (`getEvents`) com outra chave |
| Áreas + Advogados + Financeiro | `AreasChart`, `AdvogadosCard`, `FinanceiroResumo` | `crm_items`; `getFinancialSummary` | Três caixas coloridas empilhadas; nada da InfinitePay |
| Feed | `ActivityFeed` | `activities` | Ruído. A RLS de `activities` é `'*'`: o feed mostra a descrição de lançamento financeiro para quem não tem `financeiro:view` |

Nada do monitoramento de processos aparece.

### Os dados reais (consulta só de leitura, contagens, 2026-10-07)

- `webhook_events` da BuscaProcessos, sem testes, 90 dias: 360 entregas.
  `processed` 65 (37 diário + 28 movimentação), `duplicate` 36, `unmatched` 18,
  `invalid` 231 (as recusas de 10 a 23/09), `ignored` 10 (`processo_verificado`
  e `atualizacao_processo_concluida`). Última entrega: 07/10, 04h29.
- `legal_process_movements`: 116 linhas, todas `busca_processos`, em 5
  processos — até 42 de um processo só em 30 dias. **As 116 estão com `read_at`
  nulo**: ninguém marca movimentação como lida.
- `publications`: 43, todas `busca_processos`. 33 não lidas, nenhuma tratada,
  **38 órfãs** (processo não cadastrado).
- As 18 `unmatched`: 8 são sondas (`0000000-00.0000.0.00.0000`) e **10 são
  movimentações de `5018265-22.2026.8.08.0012`** (24/09 a 05/10) — processo
  monitorado na BuscaProcessos que não está cadastrado aqui. Elas não foram
  gravadas em lugar nenhum além do log.
- `legal_processes`: 5, todos `ativo`; 2 com monitoramento (`DIARIA`,
  `monitoring_status` `PENDENTE`).
- `tasks`: 13 abertas, as 13 atrasadas. `events`: 2 nos próximos 30 dias.
- `financial_entries`: 7. `payment_charges`: 1 `open`, 1 `paid`.
  `payment_transactions`: 1 (Pix, `confirmed_via` `redirect`).
- `client_portal_access_log`: 8 acessos `granted` em 30 dias.
- `activities`: 108 linhas. O único leitor é o feed do dashboard.

O que isso muda no desenho:

1. **Movimentação chega em rajada por processo** → o card agrupa por processo
   ("+4 em 0001234-56…"), não lista ato a ato.
2. **Movimentação não tem fila de leitura; publicação tem.** O card conta o que
   *chegou* de movimentação no período e espelha a *fila* de publicações (a
   mesma de `/publicacoes`: `read_at` nulo, `duplicate_of_id` nulo).
3. **Processo não cadastrado é a regra, não a exceção** (88% das publicações e
   um processo monitorado) → vira chamada para ação com "Cadastrar".
4. **Volumes pequenos** → agregar no cliente continua certo, como já faz
   `getFinancialSummary`. RPC no banco só se passar de alguns milhares de linhas.

## Decisões

As três primeiras foram escolhidas pelo usuário em 2026-10-07; as demais são as
recomendações do plano, aprovadas junto.

| # | Decisão | Escolha | Descartado |
|---|---|---|---|
| 1 | Como saber que uma movimentação **chegou pelo webhook** | Coluna nova `legal_process_movements.received_via` (`webhook` / `sync` / `manual`), com backfill pelos avisos `movimentacao_nova` de `source = 'webhook'` (migration 68) | Ler pelos avisos (`notifications`), sem migration — o dashboard passaria a depender de como o sino agrupa avisos |
| 2 | Métricas do topo | 4 indicadores clicáveis de ação (ver "Indicadores") | Manter Processos / Em negociação / Tarefas / Clientes; remover a faixa |
| 3 | Ideias novas | Todas: Minhas tarefas (PR 3); Equipe, Portal do cliente e Pendências de cadastro (PR 5) | — |
| 4 | Janela de "novidades" do monitoramento | 7 dias, contados pela chegada (`created_at`) | 24 h ou 30 dias |
| 5 | Agenda | Faixa de 7 dias + lista por dia, com tarefas, abrindo o detalhe no próprio dashboard | Só reestilizar a lista atual |
| 6 | Saúde da integração | Faixa dentro do card de monitoramento, só para `configuracoes:view` | Deixar só em Configurações |
| 7 | Tabela `activities` | Continua sendo gravada; só o feed sai | Parar de gravar (mexe em ~15 services) |

Por que a coluna, e não os avisos (decisão 1): sincronizar o cadastro de um
processo importa o histórico inteiro de uma vez (43 linhas em 10/09). Contar por
`created_at` mostraria esse histórico como novidade. O aviso do sino separa as
duas coisas hoje (só o webhook avisa), mas é efeito colateral: no dia em que
alguém agrupar as 42 movimentações de uma rajada num aviso só — o que é
provável —, o dashboard muda de número sem ninguém mexer nele.

## Layout

Desktop (`lg`, 12 colunas), na ordem de leitura; no celular, tudo empilha nesta
mesma ordem. Card sem permissão some e a linha se reorganiza — nunca aparece
zerado (princípio que já está em `DashboardContent`: zero por RLS parece "o
escritório não faturou nada").

| Linha | Conteúdo | Largura |
|---|---|---|
| 1 | Cabeçalho do dia (saudação, data, "N audiências esta semana · N prazos próximos") | 12 |
| 2 | Indicadores (4) | 12 |
| 3 | Monitoramento de processos · Agenda da semana | 7 · 5 |
| 4 | Minhas tarefas · Prazos | 6 · 6 |
| 5 | Financeiro | 12 |
| 6 | Equipe · Portal do cliente · Pendências de cadastro | 6 · 3 · 3 |

O mockup também tinha chips no cabeçalho com os mesmos números dos indicadores.
Ficam de fora: o cabeçalho continua com a frase de hoje, e os números vivem só
nos indicadores.

## Cards

### Indicadores

`MetricCard` ganha `href` e `hint` (linha de apoio). Cada um só aparece com a
permissão do recurso.

| Indicador | Valor | Linha de apoio | Destino | Permissão |
|---|---|---|---|---|
| Processos ativos | `legal_processes.status = 'ativo'` | N com `monitoring_id` | `/processos` | `processos:view` |
| Publicações não lidas | `countUnreadPublications()` (já existe) | N com `legal_process_id` nulo | `/publicacoes` | `publicacoes:view` |
| Tarefas atrasadas | `status <> 'done'` e `due_date` < hoje | "N para hoje" | `/tarefas` | `tarefas:view` |
| A receber | `FinancialSummary.receivableTotal` | "R$ N vencido" | `/financeiro` (PR 4: `?situacao=a_receber`) | `financeiro:view` |

"N para hoje", e não "de N abertas": uma série recorrente nasce com todas as
ocorrências gravadas (até `MAX_OCCURRENCES`), então "abertas" contaria as do ano
que vem. Atrasadas e de hoje são as mesmas com ou sem série.

Sem `financeiro:view` (paralegal), o quarto vira "Em negociação"
(`crm_items.workflow_id = 'wf-negociacao'`), que é o que existe hoje.

"Hoje" é o dia local do navegador em `yyyy-MM-dd`, como na Agenda e no
Financeiro (`due_date` é `date`, sem fuso).

### Monitoramento de processos (novo)

Duas colunas no desktop, empilhadas no celular. No título, "última novidade há
N h", do item mais recente do card.

**Movimentações — processos com novidade (7 dias).**

- Consulta: `legal_process_movements` com `received_via = 'webhook'` e
  `created_at` nos últimos 7 dias, com o mesmo embed de processo, cards e
  cliente de `getRecentMovements`; teto de 200 linhas.
- Agrupa por `legal_process_id`: quantas chegaram, o último ato (`title`, ou
  `description` quando não há título) com a data do ato (`movement_date`, só o
  dia, como `MovimentacoesFeed` faz), e quando chegou. Ordena pelo que chegou por
  último; mostra 5 processos.
- Linha: "+N", CNJ, cliente · tribunal, último ato numa linha. Clique →
  `/processos/<id>`.
- Vazio: "Nenhuma movimentação nova em 7 dias", e quantos processos têm
  monitoramento ativo, com link para `/processos`.

**Publicações — a fila.**

- Consulta: as 5 primeiras da fila de `/publicacoes` (`duplicate_of_id` nulo,
  `read_at` nulo, `publication_date` desc, `sequence_number` desc), com os
  mesmos campos que `PublicacoesContent` mostra na linha, mais o total da fila e
  quantas dela são órfãs.
- Órfã: selo "Processo não cadastrado" e botão "Cadastrar" →
  `/processos?create=1&cnj=<cnj_number>` — o mesmo atalho que a tela de
  Publicações já usa.
- Clique → `/publicacoes/<id>`. Rodapé: "Ver fila (N)" → `/publicacoes`.

**Faixa da integração** (só `configuracoes:view`, que é a RLS de
`webhook_events`):

- `provider = 'busca_processos'`, `is_test = false`: última entrega
  (`received_at`), entregas em 24 h, recusadas esperando reprocessamento e
  `unmatched` dos últimos 30 dias agrupadas por CNJ
  (`payload->processo->>numero_unico`), ignorando o CNJ de sonda (só zeros).
- Lida por `GET /api/webhooks/health`, e não do navegador: "recusada pendente"
  é definida no servidor (`countPendingRejections`, que filtra os eventos com
  tratamento) e aquele módulo arrasta o handler inteiro do webhook. A rota usa
  o client de sessão — a RLS já é `configuracoes:view` — e reaproveita
  `readLastOriginDelivery` e `countPendingRejections`, as mesmas funções da aba
  Webhooks.
- Processo monitorado sem cadastro aparece com "Cadastrar"; o resto leva a
  `/configuracoes?aba=webhooks`.

**Atualização sozinha.** As chaves ficam sob os prefixos que o
`useRealtimeNotifications` já invalida a cada aviso (`legalProcessKeys.all` e
`publicationKeys.all`). Chegou webhook, o sino toca e o card se atualiza — sem
assinatura Realtime nova.

### Agenda da semana (substitui `AgendaHojeCard`)

- Dados: `useEvents(início de hoje, fim de hoje + 6 dias)` e
  `useTasksInRange(hoje, hoje + 6, { enabled: can('tarefas', 'view') })` — as
  mesmas consultas e chaves da página `/agenda`. Toda mutação de evento e tarefa
  já invalida essas chaves; `getUpcomingEvents` e
  `dashboardKeys.upcomingEvents` deixam de existir.
- Faixa de 7 dias a partir de hoje: dia da semana, número, até 3 pontos na cor
  do tipo (`resolveEventType`), ponto vermelho para `fatal_deadline`, "+N" se
  passar disso. Hoje destacado. Clicar num dia filtra a lista; clicar de novo
  volta para "próximos".
- Lista agrupada por dia (Hoje, Amanhã, "qui, 09/10") com `indexEventsByDay`
  (evento de vários dias aparece em cada dia, como na Agenda) e
  `agendaItemWhenLabel`. Linha: cor do tipo, título, horário, cliente, local,
  iniciais do responsável, selo "prazo fatal".
- Tarefa com o círculo de concluir (`AgendaTaskCheck` + `useToggleTaskDone`,
  otimista).
- Clique abre `EventDetailModal` ou `TaskDetailModal` ali mesmo — os dois já
  funcionam soltos, como em `/agenda`.
- Semana vazia: "Nada nos próximos 7 dias" e "Abrir agenda".

### Minhas tarefas (novo)

- Dados: `useTasks()` — o mesmo cache do quadro de `/tarefas`, então concluir
  aqui reflete lá.
- Filtra `status <> 'done'` e separa: Atrasadas (`due_date` < hoje), Hoje,
  Próximos 7 dias. Sem data entra só como contagem.
- Alternância "Minhas · Escritório" (`assigned_to` = perfil atual), começando
  em "Minhas".
- Linha: círculo de concluir (`useToggleTaskDone`), título, "venceu dd/MM" em
  vermelho ou "até HH:mm", prioridade quando `high`/`urgent`. Clique →
  `TaskDetailModal`. Até 6 linhas, e "Ver todas" → `/tarefas`.
- Permissão: `tarefas:view`.

### Prazos (mantém)

`PrazosCard` sem mudança de dado. Já ordena por `next_deadline`, então os
vencidos ficam no topo — é o que ele tem que a agenda não tem.

### Financeiro (substitui `FinanceiroResumo`)

Só `financeiro:view`. Três blocos:

**Mês corrente.**

- Recebido: `receivedThisMonth`, com a linha "R$ N via InfinitePay". O "via
  InfinitePay" sai das **mesmas linhas** do Recebido — receitas pagas no mês com
  uma cobrança `paid` —, somando o `amount` do lançamento (valor bruto, decisão 5
  da InfinitePay). Assim as duas cifras nunca discordam por fuso ou por juros de
  parcelamento. Para isso o agregado de `getFinancialSummary` passa a embutir
  `payment_charges(status)`, como `ENTRY_SELECT` já faz, e o resumo ganha
  `receivedViaInfinitePay` e `receivedViaInfinitePayCount` (campos novos; os
  atuais não mudam, e a página do Financeiro segue igual).
- Despesas do mês e resultado (recebido − despesas).
- A receber: `receivableTotal` com uma barra empilhada das três parcelas que já
  existem (`receivableUpcoming`, `receivableOverdue`, `receivableConditional`) e
  a legenda com os valores. Cada parcela leva a
  `/financeiro?situacao=a_vencer|vencido|condicao_especial`.

**Cobranças InfinitePay.**

- Em aberto: `payment_charges` com `status` em `creating`/`open`, das mais
  antigas para as mais novas, com `customer_name`, `description`,
  `amount_cents`, "há N dias". Ações: copiar o `checkout_url` e abrir o
  lançamento (`/financeiro?id=<financial_entry_id>`, que já existe). O botão do
  WhatsApp reusa `buildPaymentMessage` e `buildWhatsAppUrl`, se o telefone vier
  pelo mesmo caminho que `PaymentLinkSection` usa (conferir na implementação).
- Recebidos em 30 dias: `payment_transactions` sem `refunded_at`, com a
  cobrança embutida — valor pago (`paid_amount_cents`), método
  (`describeCaptureMethod` e parcelas), quando, comprovante (`receipt_url`).
- Alerta: cobrança `paid` com `canceled_at` preenchido (pagaram um link
  cancelado).
- Sem InfiniteTag (`office_settings.infinitepay_handle` nulo): no lugar das
  listas, "Configurar InfinitePay" → `/configuracoes?aba=pagamentos`.

**Fluxo de 6 meses.** `useMonthlyCashFlow(6)`, o mesmo da página do Financeiro,
num gráfico de barras compacto (receita × despesa, as mesmas cores do
`chartConfig` de lá). Clique → `/financeiro`.

**Atualização.** Chaves novas sob `paymentChargeKeys.all`, que as mutações de
cobrança já invalidam. A baixa pela InfinitePay acontece no servidor; o card só
fica sabendo pelo aviso `pagamento_recebido`. Então o flush de
`useRealtimeNotifications` passa a invalidar também `financialEntryKeys.all` e
`paymentChargeKeys.all` quando o lote tiver aviso `pagamento_*`.

### Extras (PR 5)

- **Equipe**: `AdvogadosCard` com tarefas abertas e atrasadas por pessoa
  (`tasks.assigned_to`), e `AreasChart` numa aba do mesmo card — dois cards
  viram um.
- **Portal do cliente** (`clientes:view`): acessos `granted` em 30 dias (total e
  clientes distintos), os 3 últimos, e as recusas (`document_mismatch`,
  `rate_limited`) em destaque — é sinal de alguém tentando entrar com o
  documento errado.
- **Pendências de cadastro** (`pendencias:view`): os totais de
  `useClientesPendencies` e `useLegalProcessesPendencies`, com link para
  `/pendencias`.

## O que sai

| O quê | Onde mais aparece |
|---|---|
| `ActivityFeed.tsx`, `useRecentActivities`, `getRecentActivities`, `dashboardKeys.activities` | Invalidações em `useEventMutations`, `useClienteMutations`, `useCrmItemComments`, `useDocumentMutations`, `useGenerateDocument`, `useFinancialEntryMutations`, `useExecuteAction` (2×), `useTaskMutations` |
| `AgendaHojeCard.tsx`, `getUpcomingEvents`, `useUpcomingEvents`, `dashboardKeys.upcomingEvents` | Invalidação em `useEventMutations` |
| `FinanceiroResumo.tsx` | — |
| `StatsCard.tsx` | Nenhum uso hoje |
| Campos de `DashboardStats` que nenhum card lê mais | `src/types/activity.types.ts` |

`activities` continua sendo gravada (decisão 7). Sem o feed, ela não tem leitor
na tela, mas a RLS `'*'` ainda deixa qualquer perfil ler pela API — inclusive as
descrições de lançamento. Fica como tarefa separada (restringir a RLS ou parar
de gravar).

## Fases

Uma branch por PR, a partir de `origin/main` com `--no-track`.

### PR 1 — Estrutura e limpeza

- Tirar o feed e as invalidações; apagar `StatsCard`.
- Grade nova em `DashboardContent`, com cada card condicionado à permissão.
- `MetricCard` com `href` e `hint`; consultas dos 4 indicadores.
- `PrazosCard`, `AreasChart` e `AdvogadosCard` só mudam de lugar.

Pronto quando: nenhuma referência a `dashboardKeys.activities`; os 4
indicadores levam às telas; o paralegal vê "Em negociação" no lugar de "A
receber".

**Como ficou (2026-10-07, branch `feat/dashboard-estrutura`):**

- `DashboardMetrics`: cada indicador é um componente com a própria consulta,
  renderizado só com a permissão — perfil sem acesso nem dispara a contagem.
  Enquanto a matriz de permissões carrega, a linha mostra esqueletos (o
  `usePermissions` pede isso: `can()` responde `false` para tudo nesse meio
  tempo).
- `DashboardRow`: no desktop, a linha se divide entre os cards que de fato
  aparecem (`grid-flow-col` + `auto-cols-fr`), então card escondido por
  permissão não deixa buraco.
- Chaves dos indicadores sob o prefixo do domínio: `[...legalProcessKeys.all,
  'dashboard-counts']`, `[...taskKeys.all, 'dashboard-counts']` e
  `[...publicationKeys.unreadCount(), 'orphans']`. As invalidações que cada
  domínio já faz alcançam o dashboard sem que ele precise ser lembrado. O número
  de não lidas é o mesmo `useUnreadPublicationCount` do selo da barra lateral, e
  "Em negociação" é o `useCrmItemCounts` das abas do CRM.
- `useInvalidateLegalProcesses` passou a invalidar `publicationKeys.all`:
  cadastrar processo vincula as publicações órfãs e excluir desvincula; sem
  isso, a contagem de órfãs (e a lista de Publicações) ficava velha.
- Contagem que falha mostra "—", não zero (`countOf` no service).
- `MetricCard` sem o `py-6` do `Card`: no celular o cartão ficava mais alto que
  largo quando o rótulo quebrava.
- `PrazosCard` apontava para `/processos?id=` e `/crm?id=`, que nenhuma tela
  lê — caía na lista. Agora vai para `/processos/<id>` (ou `/crm`, já que card
  do CRM não tem página). O mesmo link morto existe em outras 6 telas; ficou
  como tarefa separada.
- Saíram também `ACTIVITY_LABELS`, `Activity` e os tipos legados `lead_*` (só o
  feed os usava); `DashboardStats` mudou para o service do dashboard, só com os
  dois números do cabeçalho.
- Conferido: consultas novas contra o banco real, só leitura, batendo com a
  recontagem linha a linha (5 processos ativos, 2 monitorados; 33 publicações
  não lidas, 31 órfãs; 13 tarefas atrasadas, 0 para hoje; 3 em negociação).
  Telas por página temporária com dados fictícios: admin, advogado, paralegal e
  financeiro; normal, vazio e carregando; desktop e celular; tema claro e
  escuro. `tsc`, lint e build ok.

### PR 2 — Monitoramento

- Migration 68: `received_via text`, CHECK (`webhook` / `sync` / `manual`),
  sem default. Backfill: `webhook` para os ids dos avisos `movimentacao_nova`
  com `source = 'webhook'` e `entity_type = 'legal_process_movement'`;
  `manual` para `source = 'manual'`; `sync` para o resto. Índice parcial em
  `created_at desc` onde `received_via = 'webhook'`.
- **Aplicada pelo usuário antes do merge**: o código passa a gravar a coluna, e
  gravar uma coluna que não existe faz o webhook registrar `error` e perder a
  movimentação até o reprocessamento.
- As três escritas passam o valor explicitamente: `webhook.ts` (`webhook`),
  `sync.ts` (`sync`), `addLegalProcessMovement` (`manual`). Nulo fica possível
  só para um caminho futuro que esqueça — o card trata como "não veio do
  webhook". `LegalProcessMovement` ganha o campo.
- Card de monitoramento e faixa da integração.

Pronto quando: as contagens do card batem com uma consulta direta no banco; o
CNJ órfão leva ao cadastro já preenchido; a faixa não aparece para paralegal e
finance.

**Como ficou (2026-10-07, branch `feat/dashboard-monitoramento`, empilhada na
do PR 1):**

- Migration 68 escrita, **não aplicada**. O backfill usa os avisos E os
  destinos `inserted` de `webhook_events` — o aviso é best-effort. Simulado só
  para leitura no banco real: as duas fontes dão as mesmas 29 linhas; ficariam
  29 `webhook`, 87 `sync` (43 em 10/09, 22 em 15/09, 22 em 16/09 — os dias de
  cadastro) e 0 `manual`.
- Enquanto a 68 não estiver aplicada, quem rodar esta branch (o `pnpm dev`
  inclusive) vê "Não foi possível carregar as movimentações" na coluna — a
  consulta filtra por uma coluna que ainda não existe.
- `GET /api/webhooks/health` com `requirePermissionApi('configuracoes')` e
  client de sessão; `readDashboardWebhookHealth` em
  `lib/buscaprocessos/webhookHealth.ts`. A resposta leva também a janela em dias,
  para a tela não importar o módulo de servidor por causa de uma constante.
- Chaves sob `legalProcessKeys.all` (movimentações e saúde — cadastrar pelo
  "Cadastrar" tira o CNJ da faixa) e sob `publicationKeys.unreadCount()` (a
  prévia anda junto com o número). O flush do sino já invalida esses prefixos.
- Movimentações agrupadas por processo (`groupProcessNews`, função pura), com
  teto de 300 linhas por consulta e aviso se ele for atingido. Na linha, o CNJ
  ocupa a largura toda; a hora de chegada foi para a linha de apoio.
- Publicação: link esticado (o título cobre a linha com `::after`) e
  "Cadastrar" por cima, na linha do aviso — link dentro de link não é HTML
  válido, e um botão ao lado cortava o CNJ. Só aparece com `processos:create`.
- Linha com pesos: `lg:col-span-7` + `lg:col-span-5` no `DashboardRow`, que cria
  só as trilhas que os filhos pedem — sozinho, o card de monitoramento ocupa a
  linha.
- Conferido no banco real, só leitura, pelas funções de verdade: última entrega
  07/10 04h29, 2 entregas em 24 h (recontagem bate), 0 recusadas pendentes,
  `5018265-22.2026.8.08.0012` com 10 entregas sem destino; 29 movimentações em
  30 dias viram 2 processos (11 + 18); prévia de publicações com 5, na ordem da
  fila. Telas pela página temporária: admin com faixa em alerta, advogado com
  tudo vazio, paralegal (sem faixa, com "Cadastrar") e financeiro (sem faixa,
  sem "Cadastrar"); desktop, celular, claro e escuro. Rota sem sessão: 401.
  `tsc`, lint e build ok.

### PR 3 — Agenda e tarefas

- Agenda da semana e Minhas tarefas; sai `AgendaHojeCard`.

Pronto quando: evento de vários dias aparece em cada dia; concluir uma tarefa
no dashboard reflete em `/agenda` e `/tarefas`; editar um evento pelo detalhe
atualiza o card.

**Como ficou (2026-10-07, branch `feat/dashboard-agenda-tarefas`, empilhada na
do PR 2):**

- `AgendaWeekCard`: `useEvents` e `useTasksInRange` com as chaves da Agenda, e o
  mesmo modelo de item (`eventToAgendaItem`/`taskToAgendaItem`,
  `indexEventsByDay`, `compareDaySegments`). Some o evento que já terminou e a
  tarefa concluída — a regra do "Próximos 7 dias" da Agenda. Clicar num dia da
  faixa filtra; "Ver a semana" volta. Até 8 linhas, com "e mais N na Agenda".
- `TasksCard` (título "Tarefas", porque alterna Minhas · Escritório):
  `useTasks`, o cache do quadro, com `collapseRecurringTasks` — de uma série,
  só as atrasadas e a próxima pendente — e `isTaskOverdue`, as regras do quadro.
  Até 6 linhas, atrasadas primeiro; as sem data só entram na contagem.
- Concluir pelo card tira a tarefa da lista na hora e mostra "Tarefa
  concluída · Desfazer" (`useCompleteTask`). Desfazer devolve para "A Fazer",
  como desmarcar na Agenda. Sem `tarefas:update` o círculo é só ícone.
- Linhas com botão esticado: o título cobre a linha com `::after` e o círculo
  de concluir fica por cima — botão dentro de botão não é HTML válido.
- Os detalhes (`EventDetailModal`, `TaskDetailModal`) abrem no próprio
  dashboard.
- `useEvents`, `useTasks` e `useTasksInRange` ganharam `refetchInterval`
  opcional: o dashboard repergunta a cada minuto, como o card antigo fazia; as
  outras telas seguem atualizando só pelas mutações.
- `EVENT_SELECT` passou a embutir o cliente (`CalendarEvent.client`), para o
  card mostrar de quem é o compromisso sem uma consulta paralela. Nenhuma
  escrita reaproveita o objeto lido (todas montam o payload do formulário).
- Saíram `AgendaHojeCard`, `getUpcomingEvents`, `useUpcomingEvents` e
  `dashboardKeys.upcomingEvents` (com a invalidação em `useEventMutations`).
- O `EEE` do ptBR devolve o nome inteiro do dia ("quarta"); a faixa usa as três
  primeiras letras.
- Conferido: `getEvents` real com o cliente embutido (12 eventos em ±60 dias; o
  único com `client_id` veio com o cliente); 14 tarefas, 9 de série. Telas pela
  página temporária: layout 7/5, faixa (contagem, "+1", rótulos acessíveis),
  filtro por dia, Minhas/Escritório, detalhes abrindo e fechando, círculo por
  cima do botão esticado, financeiro sem círculo clicável, estados vazios e
  celular (sete dias de 36 px, sem rolagem lateral). `tsc`, lint e build ok.

### PR 4 — Financeiro e InfinitePay

- `receivedViaInfinitePay` no resumo; consultas de cobranças em aberto e
  recebidas; card novo; `/financeiro?situacao=` (e o indicador "A receber"
  passa a abrir `?situacao=a_receber`); invalidação no flush de avisos.

Pronto quando: os números batem com os da página do Financeiro; sem InfiniteTag
aparece o atalho para configurar; paralegal não vê o card.

**Como ficou (2026-10-07, branch `feat/dashboard-financeiro`, empilhada na do
PR 3):**

- `FinanceCard` em linha inteira, três colunas: o mês (recebido, "pela
  InfinitePay", despesas, resultado, e "A receber" com a barra das três
  parcelas), as cobranças por link e o fluxo de 6 meses.
- `getFinancialSummary` ganhou `receivedViaInfinitePay` e
  `receivedViaInfinitePayCount`: as linhas do recebido no mês que têm cobrança
  `paid` (`summarizePaymentCharges`), pelo valor do lançamento. A consulta do
  resumo embute `payment_charges(status)`; a do fluxo de caixa não muda.
- `getLiveCharges` (links `creating`/`open`, os mais antigos primeiro) e
  `getRecentPayments(30)` (sem estornados, com a cobrança embutida), sob
  `paymentChargeKeys`. "Pago num link cancelado" vira alerta na linha.
- WhatsApp no card abre o contato a escolher (`buildWhatsAppUrl(null, …)`), com
  a mensagem pronta: o telefone do cliente exige carregar o cadastro de cada um
  (`useCliente`), o que o detalhe do lançamento já faz.
- Sem InfiniteTag e sem histórico: convite para configurar — com link só para
  `configuracoes:manage`. Com histórico, as listas aparecem mesmo sem a tag (os
  links seguem pagáveis).
- `/financeiro?situacao=` (`parseSituationFilter` só aceita as situações
  conhecidas) abre a lista filtrada; o indicador "A receber" e cada parcela da
  barra usam isso. A `key` da página inclui a situação, para remontar.
- O flush do sino invalida `financialEntryKeys.all` e `paymentChargeKeys.all`
  quando chega aviso `pagamento_*` — a baixa acontece no servidor.
- Saiu o `FinanceiroResumo`.
- Conferido no banco real, só leitura, pelas funções de verdade: recebido no mês
  R$ 1 (o Pix de teste), todo pela InfinitePay — bate com a recontagem; "A
  receber" R$ 2.000 = 400 + 1.000 + 600; 1 link em aberto de R$ 400; 1
  pagamento recente (Pix, pelo retorno, com comprovante). Telas pela página
  temporária: três colunas, proporções da barra, links por situação, mensagem
  do WhatsApp, "gerando o link" sem ações, alerta de link cancelado, gráfico
  (12 barras), sem conta com e sem `configuracoes:manage`, celular. `tsc`, lint
  e build ok.

### PR 5 — Extras

Equipe (sai o `AreasChart` como card próprio), Portal do cliente e Pendências
de cadastro.

Pronto quando: as contagens do portal batem com `client_portal_access_log` no
banco; Pendências não aparece para finance (sem `pendencias:view`); a aba de
áreas mostra o mesmo gráfico de hoje.

## Verificação

Sem testes automatizados no projeto. Em cada PR:

- `npx tsc --noEmit`, `pnpm lint`, `pnpm build`.
- Navegador: página temporária em `/acompanhar/preview-dashboard` com o cache do
  React Query pré-carregado com dados fictícios (`setQueryData` +
  `setQueryDefaults` com `staleTime: Infinity`), incluindo o cache de
  permissões de cada perfil. Desktop e celular. Apagar antes do commit.
- Banco real, só leitura: as consultas novas comparadas às contagens da seção
  "Os dados reais".
- Nenhuma entrega simulada em produção sem ok.

## Riscos e pontos em aberto

- **`5018265-22.2026.8.08.0012`**: monitorado na BuscaProcessos, não cadastrado
  aqui. As movimentações dele são descartadas e o monitoramento é cobrado por
  mês. Decidir: cadastrar (a sincronização traz o histórico) ou cancelar o
  monitoramento. Não depende do dashboard — a faixa da integração só torna isso
  visível.
- Movimentação nunca é marcada como lida (116 de 116). O card não depende
  disso; um "marcar como visto" pode vir depois.
- Agregação no cliente: ok nos volumes de hoje; RPC se crescer.
- O webhook da InfinitePay ainda não chegou em produção (ver
  `integracao-infinitepay.md`). O card mostra o pagamento qualquer que seja o
  caminho da confirmação.

## Fora de escopo

- Comparativo com o período anterior e metas: não há histórico nem meta
  guardados, e um número inventado é pior que nenhum (mesmo princípio dos
  comentários de `DashboardContent` e `FinanceiroResumo`).
- Layout personalizável (arrastar e esconder cards).
- Lembretes por WhatsApp ou e-mail.
