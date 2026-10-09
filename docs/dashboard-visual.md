# Dashboard — refatoração visual

> **Status:** plano e decisões aprovados em 2026-10-08 (as três primeiras
> recomendações; a despesa do fluxo continua vermelha). PRs em branches
> empilhadas, sem push — ver "Como ficou" em cada fase. Os dados e as consultas da refatoração anterior
> ([dashboard.md](dashboard.md)) ficam; muda a forma. Protótipo navegável com
> dados fictícios (três cenários, claro/escuro, celular):
> [dashboard-visual-prototipo.html](dashboard-visual-prototipo.html) — abrir
> no navegador; aceita `?cenario=cheia|vazia|zerado&tema=dark&tela=390`.

Pedido: o resultado visual do dashboard atual não ficou bom — muito espaço vazio
e mal aproveitado. Exemplo: com a agenda da semana vazia, o card fica com um
enorme espaço em branco embaixo para igualar a altura do card de monitoramento.
Dar mais vida ao dashboard, mais interativo e visualmente atraente.

## Por que sobra espaço hoje

| # | Causa | Onde |
|---|---|---|
| 1 | **A linha amarra a altura dos cards.** `DashboardRow` é um grid; item de grid estica até o mais alto da linha (`align-items: stretch`). O card com menos conteúdo ganha o vazio embaixo. Acontece nas três linhas de pares: Monitoramento + Agenda, Tarefas + Prazos, Equipe + Portal + Pendências. | `DashboardRow.tsx`, `DashboardContent.tsx:95-117` |
| 2 | **Vazio ocupa um card inteiro.** "Nada nos próximos 7 dias." fica dentro do card com cabeçalho e faixa de dias, e ainda estica pelo item 1. Com os dados reais (2 eventos em 30 dias) a agenda vive vazia. | `AgendaWeekCard.tsx:335-339` |
| 3 | **Moldura maior que o conteúdo.** O `Card` do shadcn traz `py-6 gap-6` (48 px de respiro vertical + 24 px entre cabeçalho e corpo), e o conteúdo é texto de 11–13 px. Caixas grandes com pouco dentro. | `components/ui/card.tsx` |
| 4 | **Tudo com o mesmo peso.** Nove caixas brancas iguais, mesmo título pequeno, texto cinza; a cor só aparece em pontos de 6 px. Nada conduz o olho. | todos os cards |
| 5 | **Número sem forma.** Cada indicador é um número num cartão de ~170 px de altura. | `MetricCard.tsx` |
| 6 | **Pouca interação.** Além de links, só concluir tarefa funciona no lugar. | — |

## Princípios

1. **Conteúdo define a altura; o vizinho nunca.**
2. **Vazio é pequeno:** uma linha com o que fazer, nunca um card do tamanho do cheio.
3. **Um protagonista:** o bloco "Hoje" no topo responde "o que eu faço agora?".
4. **Número com forma — e só com dado real.** Nada de tendência inventada (regra
   que já vale desde a refatoração anterior).
5. **Agir sem sair do dashboard.**
6. **Movimento com propósito**, sempre atrás de `prefers-reduced-motion`.
7. **Continua Graphite:** tokens de `globals.css`; cor de estado (vermelho,
   âmbar, verde) só quando significa estado.

## Layout

Desktop (área de conteúdo ≥ ~940 px):

| Faixa | Conteúdo |
|---|---|
| 1 | **Hoje** (largura toda) |
| 2 | **Indicadores** (4) |
| 3 | Duas colunas **independentes**: principal (~65%) com Monitoramento, Tarefas e Financeiro; lateral (~35%) com Prazos, Pendências, Portal e Equipe |

Cada coluna empilha os seus cards na altura do próprio conteúdo. O fim das
colunas fica desigual — no rodapé da página, onde não incomoda — em troca de
nunca haver vazio dentro de card nem entre cards.

Celular: uma coluna, na ordem Hoje, Indicadores, Prazos, Monitoramento, Tarefas,
Financeiro, Pendências, Portal, Equipe. As duas colunas viram `display:
contents` abaixo do breakpoint e cada card carrega um `order`, então a mesma
árvore serve aos dois layouts.

Card sem permissão continua sumindo (regra de `DashboardContent`). Se uma coluna
ficar sem nenhum card para o perfil, a outra ocupa a largura toda.

## Hoje (substitui o `AgendaWeekCard` e a linha do cabeçalho)

- Saudação e data, com um resumo em chips derivado da agenda já carregada:
  "N compromissos e N tarefas hoje", "Prazo fatal hoje · <título>" (com o
  pulso de `animate-pulse-urgent`) e "Próximo: <título> às 14:00 · em 35 min".
  Substitui "N audiências esta semana · N prazos próximos"
  (`getDashboardStats`), que sai.
- Ações: **Novo compromisso** e **Tarefa** abrem o `AgendaCreateDialog` — o
  mesmo da Agenda. Ele precisa de uma prop para abrir já na aba Tarefa.
- Faixa de 7 dias (a mesma de hoje, maior): pontos na cor do tipo, vermelho
  para prazo fatal; clicar troca o dia mostrado.
- **Régua do dia** (08h–19h, alarga se houver item fora): blocos na cor do tipo,
  tarefas como marcadores, passado esmaecido, linha do "agora". Passar o mouse
  mostra o resumo; clicar abre `EventDetailModal`/`TaskDetailModal`.
  `layoutDayEvents` (`agenda/utils/dayLayout.ts`) já calcula posição e faixas
  de sobreposição em porcentagem — serve na horizontal. Some no celular.
- **Lista do dia:** horário, barra na cor do tipo, título, tipo · cliente ·
  local, responsável, selos "em 35 min" e "agora", divisor "Agora · 13:25";
  tarefa com o círculo de concluir (`useCompleteTask`, com Desfazer).
- Dia vazio: uma faixa "Dia livre · N itens no resto da semana" + "Agendar".
  Semana vazia: "Semana livre".
- Mesmas consultas e chaves da Agenda (`useEvents`, `useTasksInRange`), como o
  card atual. O "agora" anda a cada minuto: `useNow(60_000)` extraído do
  `NowIndicator` de `TimeGrid.tsx`.

## Indicadores

Os mesmos quatro (e "Em negociação" para quem não vê o Financeiro), num cartão
mais baixo: rótulo, valor contando até o número, um micro-gráfico e uma linha
de apoio.

| Indicador | Micro-gráfico | Dado | Consulta nova? |
|---|---|---|---|
| Processos ativos | medidor monitorados / ativos | `getProcessCounts` | não |
| Publicações não lidas | colunas por dia, 14 dias, hoje em destaque | `publications.publication_date` (sem duplicadas) | sim, uma leve |
| Tarefas atrasadas | barra pela idade do atraso: até 7 dias · 8–30 · mais de 30 | `due_date` das atrasadas, no lugar da contagem `head` | ajuste |
| A receber | barra das três parcelas, cada uma clicável | `FinancialSummary` | não |

- "Concluídas por dia" fica de fora: `tasks` não tem `completed_at`.
- As parcelas do "A receber" viram links (`/financeiro?situacao=…`) por cima
  do link do cartão — o mesmo padrão de link esticado que a linha de
  publicação já usa.
- "Em negociação" fica sem micro-gráfico.

## Cards

### Monitoramento

- Abas com contagem: **Movimentações · Publicações · Sem processo** (a fila
  filtrada pelas órfãs). Abre em Movimentações quando houve alguma em 7 dias;
  senão, em Publicações.
- Ao lado das abas, as chegadas por dia em 7 dias — das movimentações já
  carregadas, sem consulta nova.
- Movimentação: ponto "novo" para o que chegou em 24 h; passar o mouse mostra
  os últimos 3 atos do processo. `groupProcessNews` hoje guarda só o último:
  passa a guardar os 3 mais recentes.
- Publicação: ao passar o mouse, **Marcar como lida** (`useMarkPublicationRead`)
  e Abrir. O Desfazer precisa de `markPublicationUnread` (`read_at` nulo) em
  `publications.service.ts` — hoje só existe o caminho de ida.
- A faixa da integração (`WebhookHealthStrip`) vira uma pílula de status no
  cabeçalho (em dia / atenção / recusada) com o conteúdo atual num popover. Só a
  "última entrega recusada" continua como alerta dentro do card.

### Tarefas

Mesmos dados e regras (`collapseRecurringTasks`, Minhas · Escritório). Grupos
com contagem, atraso em vermelho com "há N dias", selo de prioridade alta e
urgente, avatar no modo Escritório. "Mostrar mais N" abre no próprio card.

### Financeiro

- O mês em quatro números: Recebido (com a parte da InfinitePay), Despesas,
  Resultado e Links em aberto. "A receber" fica só no indicador.
- Abaixo, lado a lado: o fluxo de 6 meses e as cobranças por link (em aberto e
  recebidas, com copiar, WhatsApp e comprovante ao passar o mouse).
- O gráfico **preenche a altura da coluna** ao lado (`flex-1`), em vez de ter
  altura fixa — senão o vazio volta para dentro do card.

### Lateral

- **Prazos:** bloco de data, ponto pulsando no prazo fatal, área com a cor dela,
  rótulo de urgência, responsável.
- **Pendências:** dois blocos (clientes, processos) com quantos travam o
  trabalho.
- **Portal:** número, colunas de acessos por dia em 30 dias (das linhas que
  `getPortalAccessSummary` já busca) e os 3 últimos acessos.
- **Equipe:** uma linha por pessoa (casos, tarefas, atrasadas) com a barra
  processo × negociação; abas Pessoas · Áreas mantidas.

## Cores — achados do validador de paleta

Rodado sobre os tokens atuais (claro e escuro):

- **Receitas × Despesas** (verde × vermelho): ΔE 3,0 em deuteranopia — para
  quem não distingue vermelho e verde, as duas barras são a mesma cor. Falha.
  Decisão 4: fica como está, aqui e no Financeiro; a leitura para quem não
  distingue as cores segue pela posição fixa das barras (receita à esquerda),
  pela legenda e pelo tooltip com os dois valores.
- **A receber**, "a vencer" × "vencido" (âmbar × vermelho) lado a lado: ΔE 15,0
  em visão normal (no limite) e 7,6 em deuteranopia. Reordenar para **A vencer
  · Condição especial · Vencido** põe o azul no meio e passa em todos os testes.

## Base visual (componentes novos)

| Peça | Papel |
|---|---|
| `DashboardCard` | Moldura dos cards do dashboard: cabeçalho (ícone com fundo tingido, título, ações), corpo, rodapé opcional; respiro de 16 px. O `Card` do shadcn não muda fora daqui. |
| `EmptyLine` | Estado vazio compacto: ícone, frase, apoio, uma ação. |
| `StatTile` | Substitui `MetricCard`. |
| `MiniColumns`, `Meter`, `SegmentBar` | Micro-gráficos em HTML/CSS, com tooltip. |
| `DashboardColumns` | Substitui `DashboardRow`: duas colunas independentes + ordem do celular. |
| `TodayPanel` | O bloco Hoje. |
| `useCountUp`, `useNow` | Número contando (só na montagem e quando o valor muda) e relógio por minuto. |

Entrada dos cards com `animate-in fade-in slide-in-from-bottom` (o
`tw-animate-css` já está importado), escalonada e atrás de `motion-safe:`.
Ações das linhas aparecem no hover e também no foco do teclado.

## Decisões

Escolhidas pelo usuário em 2026-10-08.

| # | Decisão | Escolha | Descartado |
|---|---|---|---|
| 1 | Organização dos cards | Duas colunas independentes | Grade com altura fixa e rolagem interna (o card vazio continuaria ocupando a altura); manter as linhas e só encolher o vazio |
| 2 | Bloco Hoje | Régua do dia + lista | Só a lista; manter a agenda como card na lateral |
| 3 | Interações novas | Todas: criar no topo, marcar publicação como lida (com Desfazer), prévia das movimentações, animações | — |
| 4 | Cor da despesa no fluxo | **Manter o vermelho** (aqui e no Financeiro) | Cinza (era a recomendação); violeta |

## Fases

Uma branch por PR, empilhadas, a partir de `origin/main` com `--no-track`.

1. **Base e layout** — `DashboardCard`, `EmptyLine`, `DashboardColumns`,
   estados vazios compactos em todos os cards, respiro e tipografia, entrada
   animada. Os cards mantêm o conteúdo. Só este PR já acaba com o vazio da
   queixa.

   **Como ficou (2026-10-09, branch `feat/dashboard-visual-base`):**

   - Peças novas: `DashboardCard` (moldura própria e container — o conteúdo
     se arranja pela largura do card, não da janela), `EmptyLine`, `CardLink`,
     `SegmentedControl` (abas ou filtro, com setas do teclado) e
     `DashboardColumns`. A entrada escalonada está em `utils/motion.ts`, atrás
     de `motion-safe:`; o atraso vai por `--tw-animation-delay`, porque o
     `delay-*` também atrasaria as transições do próprio elemento.
   - As duas colunas abrem com a área do dashboard a partir de 896 px
     (`@4xl/dashboard`), medida de verdade — com a barra lateral aberta ou
     fechada. Abaixo disso, `display: contents` + `order-*`: Agenda, Prazos,
     Monitoramento, Tarefas, Financeiro, Pendências, Portal, Equipe.
   - Até o PR 2, a Agenda da semana fica no topo da coluna lateral.
   - Antecipado do PR 4 (só apresentação): Prazos em linhas sem caixa, com o
     ponto da área na cor dela; Equipe em uma linha por pessoa, com a barra
     processo × negociação proporcional à mesa mais cheia e legenda; Financeiro
     reorganizado para a coluna larga (números do mês; "A receber" com a barra
     até o PR 3; fluxo e cobranças lado a lado, com o gráfico preenchendo a
     altura da lista e a legenda que faltava). Ações das cobranças aparecem no
     hover só onde há mouse (`pointer-fine:`); no toque ficam visíveis.
   - A Equipe deixou o `Tabs` do Radix: envolvendo o card, ele injetava
     `gap-2` e levava a variável do atraso da animação para fora do elemento
     animado (ela não é herdada).
   - Tarefas: "há N dias" nas atrasadas, selo de prioridade alta e urgente,
     "Ver quadro" no rodapé.
   - Achado fora do escopo: `formatPrazo` (`crm/utils/prazo.ts`) lê a data
     como meia-noite UTC; entre 21h e meia-noite os prazos aparecem um dia
     adiantados ("Vencido há 1d" no dia). Ficou como tarefa separada.
   - Conferido: `tsc`, lint e build ok. Telas pela página temporária
     `/acompanhar/preview-dashboard` (semana cheia, semana vazia e escritório
     novo; perfis admin e financeiro; 1500 px e celular 375 px; claro e
     escuro), sem estouro lateral no celular.
2. **Hoje** — `TodayPanel` com chips, ações, faixa, régua e lista; saem
   `AgendaWeekCard`, `getDashboardStats` e a linha do cabeçalho.

   **Como ficou (2026-10-09, branch `feat/dashboard-visual-hoje`, empilhada
   na do PR 1):**

   - `TodayPanel` (saudação, chips, ações, faixa) + `TodayWeekStrip`,
     `TodayRuler` e `TodayDayList`; regras puras em `utils/today.ts`. Mesmas
     consultas e chaves do card que saiu.
   - Só desenha depois de montar (`useMounted`): saudação, "agora" e contagem
     são a hora local, e o relógio do servidor hidrataria outro texto. Antes
     disso, um esqueleto da mesma altura.
   - Chips: "N compromissos e N tarefas hoje" (ou "Nada marcado para hoje" /
     "Tudo feito por hoje"), "Prazo fatal hoje" para evento com
     `fatal_deadline` igual a hoje, e "Próximo" — comparado como instante,
     porque eventos vêm do banco com `+00:00` e tarefas do `toInstant` com `Z`.
     A contagem arredonda para cima (`minutesUntil`) e é a mesma no chip e na
     linha.
   - Régua: o `layoutDayEvents` da Agenda deitado (o eixo dele vira o
     horizontal; as faixas de sobreposição viram linhas). Janela 08h–19h que
     alarga até a hora cheia de quem estiver fora. Some no celular e no dia
     sem evento (só marcadores de tarefa deixavam uma faixa vazia). Escondida
     de leitor de tela e do Tab: a lista tem o mesmo, com nome e teclado.
   - Lista: sem hora primeiro, depois por horário, com o divisor "Agora"; o que
     terminou fica esmaecido, a tarefa concluída riscada (o círculo reabre).
     Selos ("em 35 min", "agora", prazo fatal, "passou do horário") seguem o
     título e descem de linha antes de cortá-lo.
   - "Novo compromisso" e "Tarefa" abrem o `AgendaCreateDialog` no dia escolhido
     na faixa; ele ganhou `target.kind` para abrir já na aba de tarefa.
   - `useNow` virou hook compartilhado (`src/hooks/useNow.ts`); o indicador de
     "agora" da Agenda passou a usá-lo.
   - Saíram `AgendaWeekCard`, `getDashboardStats`, `useDashboardStats`,
     `dashboardKeys.stats` e as duas invalidações dela (eventos e tarefas): o
     dashboard lê eventos pelas chaves da Agenda e tarefas sob `taskKeys.all`.
   - Conferido: `tsc`, lint e build ok. Telas pela página temporária, com o
     relógio deslocado por `?agora=` (13:25 e 19:40): semana cheia, dia livre,
     semana livre; trocar o dia na faixa, "Tarefa" abrindo na aba certa com a
     data do dia escolhido, concluir pelo círculo (otimista, com Desfazer);
     1500 px e celular; claro e escuro.
3. **Indicadores** — `StatTile`, micro-gráficos, `useCountUp`, consulta de
   publicações por dia, idade das atrasadas, parcelas clicáveis e a nova ordem
   do "A receber".

   **Como ficou (2026-10-09, branch `feat/dashboard-visual-indicadores`,
   empilhada na do PR 2):**

   - `StatTile` (substitui `MetricCard`) e `MicroCharts` (`Meter`,
     `MiniColumns`, `SegmentBar`, em HTML/CSS, com tooltip por marca e nome
     acessível com os números). O cartão inteiro é um link esticado; as
     parcelas do "A receber" são links próprios por cima dele, cada uma
     abrindo `/financeiro?situacao=`.
   - `useCountUp`: o número conta do zero na primeira vez que chega, uma vez
     por montagem (um refetch que muda 12 para 13 só mostra 13), e não anima
     para quem pede menos movimento. O leitor de tela lê sempre o valor final
     (`sr-only`), nunca um quadro da contagem.
   - Publicações: `getPublicationsPerDay` (`publication_date`, sem duplicadas,
     14 dias, hoje em índigo), sob `publicationKeys.all` — o flush do sino
     atualiza.
   - Tarefas: `getTaskCounts` passou a trazer as datas das atrasadas (a
     contagem continua exata com `count: 'exact'`) para a barra por idade —
     até 7 dias, 8 a 30, mais de 30 — num tom só, do claro ao escuro, e "mais
     antiga há N dias".
   - "A receber" na ordem A vencer · Condição especial · Vencido, e o bloco saiu
     do card Financeiro (que ficou com Recebido, Despesas e Resultado).
   - "Em negociação" (perfil sem Financeiro) ganhou o medidor da fatia dos casos
     do CRM, pela mesma contagem das abas.
   - A linha dos indicadores segue a largura do dashboard (`@3xl/dashboard`):
     dois por linha no celular, todos lado a lado quando cabe, sem buraco quando
     um some por permissão. Saíram `MetricCard` e `DashboardRow`.
   - Conferido: `tsc`, lint e build ok. Telas pela página temporária: semana
     cheia, escritório novo (zeros com "tudo em dia" e "nada vencido"), perfil
     paralegal, escuro; parcelas por cima do link do cartão (pelo
     `elementFromPoint`).
4. **Cards interativos** — Monitoramento (abas, chegadas por dia, prévia,
   marcar como lida com Desfazer, pílula de status), Tarefas (mostrar mais),
   Financeiro (números do mês, gráfico que preenche a coluna) e a lateral.

   **Como ficou (2026-10-09, branch `feat/dashboard-visual-interativo`,
   empilhada na do PR 3):** Financeiro, Prazos e Equipe já tinham entrado no
   PR 1; aqui ficou o resto.

   - Monitoramento em abas com contagem — Movimentações · Publicações · Sem
     processo —, cada uma com a permissão da sua tabela (as consultas ganharam
     `enabled`). Abre em Movimentações quando há novidade (ou enquanto carrega);
     senão, na fila. Num card estreito as abas dividem a largura, contagem em
     cima do rótulo (`SegmentedControl` com `stackOnNarrow`).
   - "Sem processo" lê só as órfãs (`getUnreadPublicationsPreview` com
     `orphansOnly`), com "Cadastrar" já com o CNJ.
   - Chegadas por dia em 7 dias ao lado das abas, das movimentações já
     carregadas. Ponto "novo" no que chegou nas últimas 24 h. Passar o mouse
     num processo mostra os 3 atos mais recentes (`groupProcessNews` guarda
     `recent`).
   - "Marcar como lida" na linha da publicação (só com `publicacoes:update`,
     a RLS de UPDATE): a linha sai e as contagens caem na hora; o toast traz
     "Desfazer" (`markPublicationUnread`, que não desfaz publicação tratada).
     `useSetPublicationRead` invalida o prefixo inteiro de publicações.
   - A saúde da BuscaProcessos virou `WebhookStatusPill` no cabeçalho (em dia /
     a reprocessar / monitorado sem cadastro / recusada), com os detalhes num
     popover; só "última entrega recusada" continua como alerta dentro do card.
     Saiu `WebhookHealthStrip`.
   - Tarefas: "Mostrar mais N" abre no próprio card; trocar Minhas · Escritório
     fecha de novo.
   - Portal: colunas de acessos por dia em 30 dias (das mesmas linhas que
     `getPortalAccessSummary` já lia).
   - Achado: o extrator de classes do Tailwind 4 perdeu as classes escritas
     depois do `buttons.current[index] = element` do `SegmentedControl` — o
     botão ficava sem elas, no dev e no build. Foram para constantes no topo do
     módulo. Uma auditoria das classes de todos os arquivos do dashboard contra
     o CSS servido não achou outro caso.
   - Conferido: `tsc`, lint e build ok. Pela página temporária: abas, marcar
     como lida (linha sai, 12 → 11, toast com Desfazer), aba das órfãs com
     "Cadastrar", popover da pílula, prévia dos atos, "Mostrar mais 4" (6 → 10
     linhas); 1500 px e celular sem estouro lateral; claro e escuro.

Pronto, em cada PR: nenhum card estica para acompanhar outro; todo estado vazio
tem uma linha só; `npx tsc --noEmit`, `pnpm lint` e `pnpm build` ok.

## Depois das fases: saldo de créditos da API (2026-10-09)

Pedido depois do merge do PR 4 (branch `feat/dashboard-saldo-creditos`): o
saldo da conta da BuscaProcessos, por `GET /v1/conta/saldo`, em dois lugares —
uma pílula no cabeçalho do Monitoramento, ao lado da das entregas, e um card
"Créditos da API" no fim da coluna lateral.

- **Formato.** Sem documentação pública acessível; o usuário passou o schema e
  uma resposta real: `{ data: { credits: 672.26, currency: "BRL",
  accountStatus: "ACTIVE" }, meta: { creditsRemaining: 672.26, requestId,
  searchLogId: null, servedAt: "14:32:10" } }`. A consulta não é cobrada e não
  tem limite. `meta.servedAt` vem só com a hora, sem data nem fuso; a hora da
  leitura (`checkedAt`) é a do nosso servidor.
- **Caminho.** `getContaSaldo` (client) → `readCreditBalance`
  (`lib/buscaprocessos/creditBalance.ts`, confere o `data` com zod: um saldo
  em texto vira 502, não "R$ NaN") → `GET /api/buscaprocessos/saldo`, com
  `configuracoes:view` — a mesma permissão da saúde das entregas; na matriz da
  migration 34, admin e advogado. A chave não sai do servidor.
- **Frequência.** Uma leitura por hora (`refetchInterval` e `staleTime` de 60
  min, a pedido do usuário: "não tem necessidade de tão pouco tempo"). A pílula
  e o card leem a mesma chave; o botão "Atualizar" lê na hora.
- **Cores.** Verde com a conta `ACTIVE` e saldo a partir de R$ 20; âmbar abaixo
  de R$ 20 (`LOW_CREDIT_THRESHOLD`); vermelho zerado ou com a conta fora de
  `ACTIVE` (os outros status não estão documentados — aparece o código cru).
  O valor só ganha cor quando o problema é ele: conta suspensa com saldo
  mostra o saldo neutro e o aviso em vermelho. Sem saldo ou com a conta
  inativa, a API responde 403 às consultas cobradas — é o que o aviso diz.
- **Falhas.** Sem leitura nenhuma: "Saldo indisponível" com a mensagem da API
  (chave revogada, por exemplo) e "Tentar de novo". Com uma leitura boa e a
  seguinte falhando: o valor anterior continua, com "a nova leitura falhou".
- As classes das pílulas de status foram para `utils/statusTones.ts`, usadas
  pelas duas.
- Conferido: `tsc`, lint e build ok; o client e o schema reais rodados no Node
  com `fetch` simulado (o exemplo real, saldo em texto, campo faltando, 401,
  envelope sem `data`, faixas de cor e formatos) — nenhuma chamada à API de
  verdade; a rota sem sessão responde 401 antes de chamar a API. Pela página
  temporária: os seis estados (normal, baixo, zerado, conta suspensa, erro,
  atualização que falhou), popover, "Atualizando…", perfis (admin e advogado
  veem; assistente e financeiro não), 1500 px, 500 px e celular, claro e
  escuro.

## Verificação

Sem testes automatizados no projeto. Em cada PR, a página temporária
`/acompanhar/preview-dashboard` com o cache do React Query pré-carregado (como
na refatoração anterior), em três cenários — semana cheia, semana vazia,
escritório novo —, desktop e celular, claro e escuro, com captura de tela.
Apagar antes do commit.

## Fora de escopo

- Personalizar o layout (esconder e reordenar cards).
- Tendências e comparativos sem histórico guardado.
- "Adiar tarefa" direto do card (uma escrita nova).
- Marcar movimentação como vista.
