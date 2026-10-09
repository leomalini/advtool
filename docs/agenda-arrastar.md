# Agenda — arrastar para mudar dia e horário

> **Status:** plano e decisões aprovados em 2026-10-08 (todas as
> recomendações; a fase 3 entra com os dois extras). As três fases estão
> implementadas, em branches empilhadas e sem push: `feat/agenda-arrastar` →
> `feat/agenda-arrastar-mes` → `feat/agenda-arrastar-extras` — ver "Como
> ficou" em cada fase. Falta conferir logado, contra o banco real.

Pedido: arrastar um item da Agenda para escolher o dia e o horário, como no
Google Agenda.

## Como está hoje

| Peça | Arquivo | O que importa para o arraste |
|---|---|---|
| Página | `features/agenda/components/AgendaContent.tsx` | Monta `days`, indexa os itens por dia (`indexEventsByDay`) e escolhe `MonthGrid` ou `TimeGrid` |
| Mês | `components/MonthGrid.tsx` | `DayCell` é um `div role=button` que cria item no clique; `EventChip` (botão) e `TaskChip` (div) param a propagação |
| Semana/Dia | `components/TimeGrid.tsx` | Grade de 24h, `HOUR_HEIGHT = 48`, rolagem própria (`max-h-[620px]`); faixa "Dia todo" fixa no topo; um botão por hora para criar; `TimedBlock` posicionado em % pelo `layoutDayEvents` |
| Item | `utils/agendaItem.ts` | `AgendaItem = EventAgendaItem \| TaskAgendaItem` |
| Dias de um item | `utils/daySpan.ts` | Dia inteiro: `end_at` = 00:00 do ÚLTIMO dia (inclusivo). Sem término: `end_at = start_at`, desenhado com `DEFAULT_DURATION_MIN = 60`. 24h ou mais vai para a faixa "Dia todo" |
| Gravar evento | `services/events.service.ts` → `updateEvent` | Patch parcial = só esta linha (`toDbPatch`). Série com "seguintes/todas" exige o **formulário inteiro** (`asFullForm`) |
| Gravar tarefa | `features/tarefas/services/tasks.service.ts` → `updateTask` | Patch parcial (como o arraste do Kanban) = só esta ocorrência |
| Série | `components/shared/SeriesScopeDialog.tsx` | Este / Este e os seguintes / Todos — já usado no detalhe |
| Permissões | `usePermissions` | `agenda:update` e `tarefas:update` existem na RBAC (migration 34); hoje a UI não confere `update` em lugar nenhum da Agenda |

O `@dnd-kit/core` 6.3 já está instalado e é usado no Kanban de Tarefas e no
CRM (`PointerSensor` com `distance: 5`). Na leitura do código, o `delta` dos
eventos de arraste parecia já descontar a rolagem (`scrollAdjustedTranslate`
em `core.esm.js`) — **no teste não descontou**: com a grade rolando sozinha, a
sombra ficou ~280 px acima do ponteiro. A fase 1 não usa o `delta` (ver "Como
ficou").

Não precisa de migration: mover é trocar `start_at`/`end_at` (evento) ou
`due_date`/`due_time` (tarefa).

## Comportamento

### Semana e Dia (grade de horas)

- Arrastar um bloco muda **dia (coluna) e horário**, em passos de **15 min**
  (o mesmo piso de altura da grade). A duração é mantida.
- O deslocamento vale a partir de onde o bloco foi pego: pegar pelo meio de
  uma reunião de 2h e soltar 1 hora abaixo move 1 hora — não "teleporta" o
  topo para o ponteiro.
- Durante o arraste aparece uma **sombra encaixada** na coluna de destino, com
  o novo intervalo escrito ("14:15 – 15:15"); o bloco original fica apagado.
  Sem `DragOverlay` aqui: o overlay segue o mouse livre, e o que interessa é
  ver onde ele vai cair.
- Soltar depois da meia-noite é permitido (o evento passa a atravessar o dia,
  como já é desenhado hoje).
- Pedaço de um evento que atravessa a meia-noite: o deslocamento se aplica ao
  evento inteiro, não ao recorte da coluna.
- Visão Dia: uma coluna só, então só muda o horário.

### Mês

- Arrastar um chip para outra célula muda **só o dia**; o horário fica.
- Evento de vários dias: pegar a barra em qualquer dia move o evento inteiro
  pela diferença de dias (pegou no 3º dia e soltou dois dias depois → +2).
- A célula sob o ponteiro ganha destaque; o chip vai num `DragOverlay`.

### Faixa "Dia todo" (semana/dia) — fase 2

- Arrastar entre dias pela faixa: muda o dia, continua dia inteiro.
- Bloco com hora → faixa: vira dia inteiro naquele dia.
- Dia inteiro → grade de horas: vira evento com hora, 1h de duração.
- Evento de 24h ou mais que mora na faixa por causa da duração: arrastar pela
  faixa só muda o dia.

### Regras gerais

- Clique continua abrindo o detalhe: o arraste só começa depois de 5 px de
  movimento. **Esc** cancela (já é do `PointerSensor`).
- Quem não tem `agenda:update` não arrasta evento; sem `tarefas:update`, não
  arrasta tarefa. O item continua clicável.
- Soltar no mesmo lugar não grava nada.
- Arraste fica dentro do período na tela (não vira a semana/mês ao encostar na
  borda). Para mover para longe, o caminho é o formulário.
- Teclado: o formulário de edição continua sendo o caminho acessível; o
  `KeyboardSensor` fica fora deste escopo.
- Toque: `TouchSensor` com toque longo (250 ms) para não brigar com a rolagem.
  A Agenda é pensada para desktop; isto é só para não quebrar no tablet.

### Gravação

- **Otimista**: o item fica onde caiu na hora; erro desfaz e mostra toast.
- Toast "Evento movido para qui, 10 out, 14:15" com **Desfazer** (o `sonner`
  tem `action`). Desfazer grava o valor anterior.
- Evento avulso ou "Somente este": patch parcial com as seis chaves que
  definem o tempo — `all_day`, `start_date`, `start_time`, `inform_end`,
  `end_date`, `end_time`. Todas juntas, sempre: `toDbPatch` lê `all_day` do
  próprio patch e, sem término no patch, iguala `end_at` ao novo início.
- Série com "seguintes/todas": `eventToFormValues(event)` + as novas datas,
  pelo `updateEvent` que já existe — ele refaz ou re-horariza a série. Sem
  otimista nem Desfazer nesse caso (a série é recriada no servidor).
- Prazo fatal (`fatal_deadline`) **não** se move junto: é a data legal, não a
  do trabalho. `syncNextDeadline` já roda no `updateSingleEvent`.
- Tarefa: `due_date` + `due_time` (`null` quando vira dia inteiro), patch
  parcial — sempre só esta ocorrência.

## Decisões

Aprovadas pelo usuário em 2026-10-08.

1. **Série ao arrastar evento:** ao soltar, abre o `SeriesScopeDialog`
   (Este / Este e os seguintes / Todos), como o Google e como o detalhe já faz.
2. **Tarefas:** arrastáveis, só a ocorrência; concluídas não se movem (a
   regra da recorrência: tarefa concluída não é mexida por operação de série —
   e não faz sentido reagendar o que já foi feito).
3. **Prazo fatal:** soltar um evento **depois** do prazo fatal dele pede
   confirmação ("Isto fica depois do prazo fatal de dd/mm. Mover mesmo
   assim?"). Cancelar devolve o item ao lugar.
4. **Fase 3 entra:** redimensionar pela borda de baixo e arrastar no vazio
   para criar já com o intervalo.

## Arquitetura

```
features/agenda/
  utils/dragMove.ts           puro: alvo do arraste → novos instantes
  hooks/useMoveAgendaItem.ts  mutação: evento|tarefa, otimista, Desfazer, série
  components/AgendaDnd.tsx    DndContext, sensores, estado do arraste, diálogo de série
  components/TimeGrid.tsx     useDraggable no TimedBlock; useDroppable por coluna; sombra
  components/MonthGrid.tsx    useDraggable nos chips; useDroppable na DayCell; overlay
```

### `utils/dragMove.ts` (puro, sem React)

```ts
type DropTarget =
  | { area: 'grid'; day: Date; deltaMinutes: number }   // semana/dia
  | { area: 'day'; dayDelta: number }                   // mês e faixa "Dia todo"
  | { area: 'all-day-strip'; day: Date }                // fase 2: hora → dia inteiro

interface MovedTimes { start_at: string; end_at: string; all_day: boolean }

/** Novo intervalo do item. `null` quando não muda nada. */
function moveAgendaItem(item: AgendaItem, segment: DaySegment, target: DropTarget): MovedTimes | null
function snapMinutes(pixels: number, hourHeight: number): number  // passo de 15 min
function toEventMovePatch(event: CalendarEvent, moved: MovedTimes): UpdateEventInput
function toTaskMovePatch(task: Task, moved: MovedTimes): UpdateTaskInput
```

Tudo em hora local, pelos mesmos `toInstant` / `toLocalDateInput` /
`toLocalTimeInput` de `utils/datetime.ts` ("grava instante, lê local"). Dia
inteiro respeita a convenção do término inclusivo de `daySpan.ts`.

### `AgendaDnd`

- Um `DndContext` em volta da grade, montado no `AgendaContent`.
- `id` do draggable = `segment.item.id` + `dayKey` (o mesmo evento aparece em
  vários dias); `data` leva o `DaySegment`.
- `id` do droppable = `day:yyyy-MM-dd` (célula do mês, coluna da grade) ou
  `strip:yyyy-MM-dd` (faixa).
- `onDragMove` calcula o alvo encaixado (para a sombra); `onDragEnd` chama
  `moveAgendaItem` e, se for série, abre o diálogo antes de gravar.

### `useMoveAgendaItem`

- Evento: `setQueriesData` no prefixo `eventKeys.range` com os novos instantes;
  rollback no erro; `useInvalidateEventSurfaces` no fim (dashboard, pendências
  e documentos já entram).
- Tarefa: o `patchCachedTask` que o Kanban usa.
- Toast com Desfazer só quando o otimista se aplica.

### Atenções

- **Clique depois do arraste.** O `TimedBlock` é `<button>`: confirmar que
  soltar não dispara `onClick` (abriria o detalhe). Se disparar, ignorar o
  clique logo após um `onDragEnd`.
- **Botões de hora por baixo.** Os 24 botões de criar de cada coluna não
  podem roubar o `pointerdown` do bloco (o bloco está acima, `z-10`).
- **`DayCell` é botão.** No mês, `pointerdown` no chip não pode virar clique
  de criar na célula — os chips já param a propagação do `click`; conferir
  com o sensor ligado.
- **Refetch no meio do arraste.** Os itens têm `key` estável; um refetch não
  deve derrubar o arraste — conferir.
- **`select-none`** na grade durante o arraste, para não selecionar texto.

## Fases

Branches empilhadas, criadas com `--no-track`.

### Fase 1 — motor + grade de horas (`feat/agenda-arrastar`)

- `dragMove.ts`, `useMoveAgendaItem.ts`, `AgendaDnd.tsx`.
- Semana/Dia: blocos com hora (eventos e tarefas) mudam de dia e horário, com
  sombra encaixada em 15 min.
- Diálogo de série, confirmação do prazo fatal, permissões, otimista e
  Desfazer.

**Como ficou (2026-10-08):**

- Arquivos novos: `utils/dragMove.ts`, `hooks/useMoveAgendaItem.ts`,
  `hooks/useAgendaDrag.ts` (contexto da sombra), `components/AgendaDnd.tsx`.
  `TimeGrid` ganhou `DayColumn` (alvo de soltar + sombra) e `DragGhost`;
  `EVENT_SCOPE_LABELS` saiu do `EventDetailModal` para `utils/eventSeries.ts`;
  `patchCachedTask` passou a ser exportado.
- **Posição pelo ponteiro, não pelo `delta`.** O `AgendaDnd` lê o ponteiro
  direto da janela (`mousemove`/`touchmove` em captura) e cada coluna informa
  o próprio topo na hora (`GridDropZone.getTop`). Topo do bloco = ponteiro −
  ponto em que foi pego − topo da coluna (`blockTopInColumn`). Assim a
  rolagem automática entra na conta, venha de onde vier.
- **Sensores:** `MouseSensor` (5 px) + `TouchSensor` (toque longo de 250 ms),
  em vez do `PointerSensor` do Kanban — este exigiria `touch-action: none` e
  travaria a rolagem da grade no toque.
- **Prazo fatal:** pergunta só quando o movimento **cruza** o limite (estava
  antes ou no dia, vai para depois). Prazo gravado sem hora vale o dia todo.
- **Clique depois de soltar:** um ouvinte de `click` em captura, armado no
  `onDragEnd` e retirado no próximo tick, engole o clique que o navegador
  dispara ao soltar sobre o próprio bloco.
- Sem `KeyboardSensor` e sem `attributes` do `useDraggable`: os blocos mantêm a
  semântica de botão de hoje; os anúncios do leitor de tela estão em português.

Verificado em página temporária com o Supabase simulado em memória (as
gravações registradas, 600 ms de atraso), conduzindo o mouse por JavaScript.
O screenshot do painel não funcionou com a janela escondida, então a
conferência foi pelo DOM: posição da sombra, título dos blocos e o payload
gravado. **Falta conferir logado, contra o banco de verdade** — principalmente
"Este e os seguintes"/"Todos", cujo caminho no servidor (`retime_event_series`,
refazer ocorrências) a simulação não executa.

### Fase 2 — mês e faixa "Dia todo" (`feat/agenda-arrastar-mes`)

- Mês: chips de evento e de tarefa, barras de vários dias.
- Faixa "Dia todo": mover entre dias e converter hora ↔ dia inteiro.

**Como ficou (2026-10-08):**

- `dragMove.ts`: a origem do arraste virou união — `GridDragSource` (bloco,
  com `topMin`) e `ChipDragSource` (chip do mês ou da faixa) — e há um alvo
  novo, `DayDropZone` (`area: 'month' | 'strip'`). Funções novas:
  `moveToDay` (anda em dias de calendário; na faixa, o que vem da grade vira
  dia inteiro de um dia), `moveChipToGrid` (dia inteiro vira 1h com término;
  tarefa vira o momento; evento de 24h+ mantém a duração; encaixe no relógio)
  e `movedDayKeys` (as células que acendem).
- **Dia inteiro de vários dias não vai para a grade:** não há horário que o
  represente; a grade não aceita e nada é gravado.
- **A faixa "Dia todo" aparece sempre na Semana/Dia** quando dá para
  arrastar, mesmo vazia: é o alvo para virar dia inteiro, e surgir no meio do
  arraste empurraria a grade para baixo do ponteiro.
- **Colisão própria (`agendaCollision`):** retângulos lidos na hora, e a faixa
  ganha das colunas — ela é fixa no topo da área que rola e, com a grade
  rolada, ocupa o mesmo lugar na tela que o topo das colunas.
- Chips seguem o ponteiro num `DragOverlay` (sem animação de volta); o mês e
  a faixa acendem **todos** os dias que o item vai ocupar.
- `useAgendaItemDrag` (em `hooks/useAgendaDrag.ts`) junta `useDraggable` +
  apagar o item para bloco, chip do mês e chip da faixa.
- **Correção que também valia para a fase 1:** o `rect.current.initial` do
  dnd-kit ainda vem vazio no `onDragStart`, e a pega contava como zero — a
  sombra caía até um passo (15 min) abaixo do ponteiro. A pega agora é medida
  no primeiro movimento. Conferido: mirando o topo em 10h00, 10h00; +6 px
  (7,5 min), 10h15.

### Fase 3 — redimensionar e criar arrastando (`feat/agenda-arrastar-extras`)

- **Redimensionar:** alça na borda de baixo do bloco de evento (só evento —
  tarefa marca um momento, não tem duração). Passos de 15 min, término mínimo
  = início + 15. Grava `inform_end = true` com o novo término; em série, o
  mesmo diálogo de alcance. Bloco com menos de ~24 px de altura não mostra a
  alça (não sobra área para pegar sem brigar com o mover).
- **Criar arrastando:** arrastar na área vazia de uma coluna desenha a faixa
  (15 min por passo); soltar abre o `AgendaCreateDialog` com início e término
  preenchidos. Clique simples continua criando às HH:00, como hoje. Depende de
  o alvo de criação levar término — hoje `AgendaCreateTarget` só tem `at` e
  `withTime`.

**Como ficou (2026-10-08):**

- **Redimensionar:** `ResizeHandle` (um `span` de 8 px na base do bloco,
  visível no hover) com `useAgendaResizeDrag`; fonte `ResizeDragSource` e
  conta em `resizeInGrid`. Só em evento, só no pedaço do último dia, só em
  bloco de 24 px ou mais. Passo de 15 min no deslocamento (como o mover),
  duração mínima de 15 min, término até a meia-noite do próprio dia. A alça
  fica dentro do bloco: o dnd-kit marca o evento nativo com quem o capturou
  primeiro, e a alça, mais por dentro, ganha. Evento sem término ganha um; o
  Desfazer volta a "sem término". Avisos próprios: "Evento vai até 11:00." /
  "Término desfeito." / "Erro ao alterar o término.".
- `isUnchangedMove` passou a comparar também o término (o redimensionar não
  mexe no início).
- **Criar arrastando:** `hooks/useCreateRange.ts`, com eventos nativos de
  mouse — não há item nem alvo, só uma faixa na própria coluna. Começa no
  `mousedown` dos botões de horário (os blocos ficam por cima e não disparam);
  vira faixa depois de 5 px; o encaixe é para fora, em 15 min no relógio
  (`createRange`), para cima ou para baixo. Soltar abre o "Novo" com
  `AgendaCreateTarget.end`, que vira `inform_end` + término no `EventForm`. Só
  mouse (sem toque) e sem rolagem automática durante a faixa.
- `suppressNextClick` saiu do `AgendaDnd` para `utils/suppressNextClick.ts`
  (usado pelo arraste e pela faixa).
- **Correção de um problema anterior:** o "Novo" abria sempre na aba
  **Tarefa**. A aba inicial vinha de `useState(canEvent ? …)`, decidido no
  primeiro render — quando o `useAuth` ainda não tem usuário e `can()`
  responde false. Visto na página de teste, inclusive no botão "Novo" do topo
  (fluxo antigo). Agora a aba é derivada até a pessoa escolher uma.

Verificado com o banco simulado: alça puxada 1h (9h–10h → 9h–11h, alça ganha
do bloco, soltar não abre o detalhe), mínimo de 15 min, evento sem término →
14h–15h30 e Desfazer de volta a sem término, pedaço depois da meia-noite com
alça (o de antes, sem); faixa para baixo (10h00–11h30) e para cima
(13h15–15h15) abrindo Evento com início e término; clique simples às 16h00
sem término; "Novo" do topo abrindo em Evento.

## Verificação

Sem testes no repositório. Cada fase passa por `tsc --noEmit`, `pnpm lint` e
`pnpm build`, e depois pelo navegador: página temporária sob `/acompanhar/`
com a Agenda real e o cache do React Query pré-carregado com eventos
fictícios (avulso, série, vários dias, dia inteiro, atravessando a
meia-noite, tarefa com e sem hora, concluída). A gravação contra o Supabase
fica para o usuário conferir logado.

Roteiro mínimo (marcado = conferido com o banco simulado):

- [x] Clique sem arrastar abre o detalhe (bloco).
- [x] Bloco movido duas colunas e +2h: 9h10–9h40 de seg → 11h10–11h40 de qua.
- [x] Pegar pelo meio do bloco: desloca, não teleporta.
- [x] Rolagem automática da grade durante o arraste: sombra sob o ponteiro.
- [x] Evento atravessando a meia-noite, pego pelo 2º pedaço: 22h–2h → 23h–3h.
- [x] Mês: "Férias" 13–15 pego no dia 14 e solto no 15 → 14–16; as três
      células acendem; soltar não abre o "Novo" da célula.
- [x] Mês: tarefa das 15h muda de dia e continua às 15h; evento de 28h pego
      no 2º dia anda inteiro.
- [x] Semana: bloco com hora → faixa vira dia inteiro (com a grade rolada, a
      faixa ganha da coluna embaixo); dia inteiro → grade vira 1h com término;
      tarefa sem hora → grade ganha `due_time`; faixa → faixa muda o dia.
- [x] Dia inteiro de vários dias solto na grade: nada acontece.
- [x] Série: diálogo aparece antes de gravar; "Todos" mostra "Salvando..." e
      passa pelo `updateEvent` de série. (Contra o banco real: pendente.)
- [x] Prazo fatal: cruzar pede confirmação; Cancelar não grava; dentro do
      prazo não pergunta; o `fatal_deadline` não vai no patch.
- [x] Sem `agenda:update`/`tarefas:update`: não arrasta. Tarefa concluída também não.
- [x] Erro na gravação: volta ao lugar e mostra toast.
- [x] Desfazer volta ao horário anterior (otimista).
- [x] Esc cancela no meio do arraste, sem gravar.
- [x] Clique que o navegador dispara ao soltar não abre o detalhe.
