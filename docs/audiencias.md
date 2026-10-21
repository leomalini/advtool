# Audiências

> **Status:** plano e propostas aprovados em 2026-10-20. **Fase 1** na branch
> `feat/audiencias-base` (criada da `main` em a516395, PR #45, que trouxe as
> migrations 74 e 75, aplicadas no remoto). Migration 76 **aplicada no remoto
> em 2026-10-20**. Ver "Como ficou a fase 1".

Pedido: um módulo **Audiências** separado, com visualizações e funcionalidades
próprias. As audiências **continuam na Agenda**. Entram também uma **aba
Audiências no detalhe do processo** e uma **parte no dashboard**.

## Decisões

| Tema | Escolha |
|---|---|
| Estrutura | **Ficha própria** (`hearings`) ligada 1:1 ao evento. O evento continua sendo o horário na Agenda; a ficha guarda o que só audiência tem |
| Agenda | Nada muda na grade, no arrastar nem no modal. Audiência **cancelada ou não realizada sai da Agenda** e continua no módulo e na aba do processo |
| Visões da v1 | **Pauta por dia**, **Quadro de preparação** e **Histórico e indicadores**. "Por comarca" ficou de fora |
| Recursos da v1 | **Checklist de preparação**, **registro pós-audiência**, **conflitos de pauta** e **confirmação com o cliente** |
| Áreas | **Trabalhista, Cível/JEC, Família e Criminal**: tipos de audiência e checklists-padrão das quatro |
| Confirmação | **Mensagem pronta** (wa.me, como em Clientes) **+ portal** `/acompanhar` com "confirmar presença" |
| Quadro | Coluna **derivada dos dados**, com **exceção manual** "marcar como pronta" |
| Dashboard | **Card "Próximas audiências"** na lateral **e destaque no bloco Hoje** |
| Permissões *(proposto)* | Reaproveita `agenda`, pelo mesmo motivo que Movimentações reaproveitou `processos`: a ficha não se lê sem o evento, e um recurso próprio poderia abrir a tela a quem não lê os dados |
| Remarcação *(proposto)* | Move o evento e grava no histórico. Nunca duplica |
| Audiência criada na Agenda *(proposto)* | Evento do tipo Audiência ganha ficha automaticamente |
| Checklist de audiência automática *(proposto)* | Nasce quando alguém **confere a data**, não quando o trigger lê o texto: tarefa com prazo calculado sobre data mal lida é pior que tarefa nenhuma |

## Como está hoje

| Peça | Onde | O que importa |
|---|---|---|
| Evento | `events` (migrations 04, 07, 16, 32, 52) | `type` é slug de `event_types`, configurável — o escritório pode apagar `hearing`. **Não tem status**. Tem `location` e `show_in_agenda` |
| Audiência por andamento | migrations 74 e 75 | `legal_process_movements.hearing_slot`/`hearing_at` lidos do texto; trigger cria/move o evento por `(legal_process_id, hearing_slot)` |
| Selo "a confirmar" | `EventDetailModal.tsx` | Aparece quando `events.movement_id` está preenchido; o título ganha o sufixo "(a confirmar)" |
| Pendência | `legalProcesses.service.ts` → `hearing_without_date` | Calculada sobre as **movimentações** |
| Processo | `ProcessoDetailPage.tsx` → `ENTITY_TABS` | A aba Agenda (`EntityEventsTab`) mistura audiência com reunião e prazo, e não filtra `show_in_agenda` |
| Leitores de `events` | `getEvents`, `tools/read/agenda.ts` | Filtram `show_in_agenda = true` — o dashboard lê por `getEvents` |
| Vara e comarca | `legal_processes.court`, `court_division`, `comarca` | Base para agrupar e para o conflito de deslocamento |
| Área do caso | `crm_items.legal_area` (singular) | Escolhe o checklist-padrão. Não confundir com `clients.legal_areas` (migration 53) |
| Arquivos | `documents` + `chk_documents_has_parent` | Já aceita `event_id`. Dono novo exige mexer no CHECK, como a 63 fez |
| Tarefas | `tasks` | `due_date` + `due_time` (migration 51), `legal_process_id` (16) |
| Portal | `/api/portal/*` com service_role (migration 57) | Nenhuma policy para `anon`; o token é validado na rota. `hidden_from_client` esconde itens |
| Avisos | `notifications` (migration 47) | **Não há job agendado** no sistema: tudo que é "passou da data" tem de ser calculado na leitura |

### Defeitos encontrados ao planejar

Corrigidos na fase 1, porque o módulo é construído em cima deles:

1. **Audiência realizada é sobrescrita.** O trigger da 74 procura o evento por
   `(processo, slot)` sem olhar se ela já aconteceu. Uma segunda conciliação
   designada no mesmo processo move o evento da primeira para a data nova, e
   o histórico some. O índice `uq_events_hearing` impede, além disso, que
   existam duas.
2. **A pendência "sem data" não sai.** Ela conta movimentações com slot e sem
   `hearing_at`. Cadastrar a data à mão na Agenda não muda a movimentação, então
   a pendência fica para sempre.
3. **Edição manual é desfeita na remarcação.** O trigger reescreve `title` e
   `description` do evento a cada andamento. Quem conferiu e tirou o
   "(a confirmar)" do título vê o sufixo voltar — o que é certo para a data,
   mas apaga qualquer outra anotação feita no título ou na descrição.
4. **Evento automático não tem duração** (`start_at = end_at`). O conflito de
   pauta não tem intervalo para comparar.

## Modelo de dados

### Fonte única da data

**A data mora só em `events.start_at`/`end_at`.** A ficha não copia: duas
cópias divergiriam no primeiro arrastar na Agenda. Consequências:

- Ficha sem evento = audiência **sem data** (status `a_designar`).
- A Pauta consulta `events` com a ficha em `!inner`, aproveitando o índice de
  `start_at`. A lista "sem data" é uma segunda consulta, sobre `hearings`.
- **Sair da Agenda** é `show_in_agenda = false`, não excluir o evento: a data e
  a ata ligada continuam existindo para o histórico. A fase 1 confere todos os
  leitores de `events` — `EntityEventsTab` hoje não filtra a coluna.
- **Excluir o compromisso na Agenda exclui a ficha** (`on delete cascade`).
  Cancelar é pela ficha, e o modal de exclusão avisa isso.

### `hearing_kinds` — tipos configuráveis

Mesmo desenho de `event_types` (migration 32): id textual, seed do sistema,
editável em Configurações. Exclusão restrita quando em uso.

| id | Rótulo | Áreas | Duração padrão *(proposta)* |
|---|---|---|---|
| `conciliacao` | Conciliação | cível, família, trabalhista | 30 min |
| `mediacao` | Mediação | cível, família | 60 min |
| `inicial` | Inicial | trabalhista | 30 min |
| `una` | Una | trabalhista, JEC | 60 min |
| `instrucao` | Instrução e Julgamento | todas | 120 min |
| `justificacao` | Justificação | cível, família | 60 min |
| `custodia` | Custódia | criminal | 30 min |
| `anpp` | Homologação de ANPP | criminal | 30 min |
| `juri` | Sessão do Júri | criminal | dia todo |
| `outra` | Outra | — | 60 min |

`hearing_slot` da 74 mapeia direto: `una`, `conciliacao`, `instrucao`, `outra`.

### `hearings` — a ficha

| Coluna | Tipo | Observação |
|---|---|---|
| `event_id` | uuid único, nulo | `on delete cascade`. Nulo = sem data |
| `legal_process_id` | uuid, nulo | Nulo quando criada na Agenda sem processo |
| `kind_id` | text → `hearing_kinds` | |
| `status` | `a_designar` · `designada` · `realizada` · `nao_realizada` · `cancelada` | Remarcação **não** é status: é linha em `hearing_date_changes` |
| `modality` | `presencial` · `virtual` · `hibrida` | |
| `meeting_url` | text | Endereço e sala ficam em `events.location`, que já existe |
| `source` | `movimentacao` · `manual` | |
| `movement_id` | uuid | Último andamento que criou ou moveu |
| `date_confirmed_at` / `_by` | | Substitui o sufixo "(a confirmar)" no título |
| `ready_override_at` / `_by` | | A exceção manual do Quadro |
| `outcome` | `acordo` · `acordo_parcial` · `sem_acordo` · `sentenca` · `instrucao_encerrada` · `outro` | Só com `status = realizada` |
| `outcome_notes`, `settlement_amount` | | |
| `client_confirmed_at` | | |
| `client_confirmation_source` | `escritorio` · `portal` | |
| `prep_notes` | text | Interno. **Nunca vai ao portal** |

### `hearing_date_changes` — histórico

`hearing_id`, `from_start_at` (nulo = primeira data), `to_start_at`,
`movement_id` (quando veio do andamento), `changed_by` (nulo = andamento),
`changed_at`. Sem `reason` na fase 1: a fase 4 decide se o motivo da
remarcação vira campo.

### Checklist (fase 3)

- `hearing_checklist_templates`: por `(kind_id, legal_area)`, com fallback
  só para o tipo. Cada item tem rótulo, `offset_days` relativo à audiência
  (D-15, D-3, D-1…), `creates_task` e `client_brings` — este último alimenta
  o "o que levar" da mensagem e do portal.
- `hearing_checklist_items`: a cópia na ficha, com `done_at`, `skipped_at`
  ("não se aplica") e `task_id`.
- **Remarcar move as tarefas pendentes** do checklist. Tarefa concluída nunca é
  alterada — a mesma regra das séries da Agenda.

### Vínculos novos

- `documents.hearing_id` para a ata, entrando no `chk_documents_has_parent`.

## Trigger da 74, reescrito (fase 1)

Andamento com `hearing_slot`:

1. Procura a ficha **ativa** (`a_designar` ou `designada`) do mesmo processo e
   tipo, a mais recente. Sem índice único: "continuação da instrução" é uma
   segunda instrução legítima.
2. Não achou → cria a ficha (`designada` com data; `a_designar` sem) e, com
   data, o evento com a duração padrão do tipo.
3. Achou e há data → move o evento (ou cria, se ela estava sem data), grava a
   remarcação e zera `date_confirmed_at`.
4. Título e descrição do evento **só são escritos na criação**. A remarcação
   altera horário e ficha; o aviso "data lida do andamento" passa a vir da
   ficha, não do texto do evento (defeito 3).

O índice `uq_events_hearing` e `events.hearing_slot` saem. `events.movement_id`
fica, como registro de que o compromisso nasceu do andamento; o selo "a
confirmar" passa a ler a ficha.

Backfill: fichas para os eventos existentes de tipo `hearing` (manuais =
`designada` com data conferida) e para as movimentações designadas sem data
(`a_designar`). A pendência `hearing_without_date` passa a contar fichas
`a_designar` (defeito 2).

## Telas

### `/audiencias`

Três visões em abas, com filtros comuns (responsável, tipo, modalidade,
período) e a lista "Sem data" sempre visível no topo enquanto houver itens.

- **Pauta** — dias como cabeçalho; por linha: hora, contagem regressiva,
  tipo, processo (CNJ), cliente, vara/comarca, modalidade com botão "Entrar
  na sala" quando virtual, responsável, progresso do checklist, selos (a
  confirmar, cliente confirmou, conflito). Imprimir a pauta da semana.
- **Quadro de preparação** — colunas derivadas, sem arrastar:

  | Coluna | Regra |
  |---|---|
  | Sem data | `a_designar` |
  | A confirmar | `date_confirmed_at` nulo |
  | Em preparação | checklist incompleto |
  | Pronta | checklist completo (feito ou "não se aplica") **ou** `ready_override_at` |
  | Aguardando resultado | `designada` com data passada |

  Realizada, não realizada e cancelada saem do Quadro e vão para o Histórico.
- **Histórico e indicadores** — audiências encerradas com resultado e ata.
  Indicadores: taxa de acordo por tipo, % de redesignadas, tempo entre
  designação e realização, por vara e comarca. **Sempre com o `n` ao lado**:
  a base tem hoje cinco designações, e "100% de acordo" sobre uma audiência
  seria um número enganoso.

### Ficha da audiência

Drawer aberto da Pauta, do Quadro, da aba do processo e do card do dashboard.
Ações: conferir data, informar data (sem data), editar modalidade/link,
checklist, confirmar cliente, mensagem para WhatsApp, registrar resultado.

### Registro pós-audiência

Resultado → ata (upload em Documentos) → próximos passos, que viram tarefas
com um clique ("prazo para razões finais", "aguardar sentença"). "Não
realizada" pergunta se há nova data: com data, vira remarcação; sem data, a
ficha volta para `a_designar`.

### Aba "Audiências" no processo

Depois de "Agenda" em `ENTITY_TABS`, com contagem. Linha do tempo das
audiências do processo, em qualquer status, com remarcações, resultado e ata.
Resolve ali mesmo "sem data" e "a confirmar". Botão "Nova audiência".

### Dashboard

- **Card "Próximas audiências"** na coluna lateral, por `can('agenda', 'view')`:
  próximos 14 dias, contagem regressiva, barra do checklist e uma faixa de
  alertas (a confirmar, sem data, sem resultado, conflito).
- **Destaque no bloco Hoje**: marca de audiência na régua do dia e na faixa
  dos 7 dias (`TodayRuler`, `TodayWeekStrip`).

### Agenda

Nenhuma mudança visual. O modal do evento ganha "Abrir ficha da audiência", e o
selo "Data a confirmar" passa a ler a ficha.

## Conflitos de pauta

Calculados na leitura, sobre a janela que a tela mostra:

- **Conflito** — o mesmo responsável (`event_assignees`) com intervalos que se
  sobrepõem.
- **Atenção** — o mesmo responsável, audiências presenciais em comarcas
  diferentes com menos de 2 h entre o fim de uma e o início da outra
  *(proposta; configurável depois)*. Virtual não conta deslocamento.

Aparecem na Pauta, na ficha, no card do dashboard e como aviso no formulário
da Agenda ao marcar uma audiência.

## Confirmação com o cliente

- **Mensagem pronta:** o botão abre o wa.me com data, hora, modalidade,
  endereço ou link e os itens `client_brings` do checklist. Quem envia é o
  escritório, que depois marca "cliente confirmou".
- **Portal:** seção "Próximas audiências" em `/acompanhar` com data,
  modalidade, local ou link e o que levar, mais o botão **"Confirmar
  presença"**. Grava pela rota `/api/portal/*`, validando o token e que a
  audiência é de um processo do cliente — mesmo modelo da leitura (migration
  57), nenhuma policy para `anon`. A confirmação gera uma notificação para o
  escritório.
- Nunca vão ao portal: `prep_notes`, limites de acordo, checklist interno e
  audiências de processo com `hidden_from_client`.

## Fases

PRs empilhados, cada um com sua migration a partir da 76.

1. **Fundação** — `hearing_kinds`, `hearings`, `hearing_reschedules`; trigger
   reescrito; backfill; pendência pela ficha; evento de Audiência criado na
   Agenda ganha ficha; `/audiencias` com a **Pauta** e a lista "Sem data";
   ficha (conferir/informar data, modalidade, link); item no menu.
2. **Processo e dashboard** — aba Audiências; card "Próximas audiências";
   destaque no bloco Hoje.
3. **Preparação** — modelos de checklist em Configurações (seed das quatro
   áreas); itens na ficha; tarefas D-x; exceção "pronta"; **Quadro**.
4. **Pós-audiência** — resultado, ata, próximos passos; pendência "sem
   resultado"; **Histórico e indicadores**.
5. **Conflitos e cliente** — conflitos de pauta; mensagem para WhatsApp;
   seção e confirmação no portal.

Verificação de cada fase: tsc, lint, build e navegador — sem testes
automatizados no projeto.

## Como ficou a fase 1

### Banco — migration 76 (aplicada em 2026-10-20)

- `hearing_kinds` (10 tipos, RLS de apoio como `event_types`), `hearings` e
  `hearing_date_changes` (append-only), as duas com a RLS de `agenda:*`.
- `apply_movement_hearing` substitui a função da 74/75. Regras, nesta ordem:
  ato já ligado a uma ficha só age se for o ato que ela segue; ato anterior ao
  encerramento de uma audiência do mesmo tipo é história; ato mais velho que o
  que a ficha segue não volta a data; data posta por uma pessoa num dia
  posterior ao do ato prevalece; designação **sem data** só põe a audiência
  em "a confirmar" se for de um dia posterior ao ato que a ficha segue.
- Gatilho em `events`: evento do tipo Audiência criado ou convertido na Agenda
  ganha ficha (conferida, tipo lido do título); arrastar grava no histórico e
  dá a data por conferida; trocar o processo do evento troca o da ficha.
- `advtool.hearing_sync`: configuração local que as funções ligam antes de
  escrever em `events`, para o gatilho acima não criar ficha duplicada nem
  gravar a remarcação duas vezes.
- RPCs: `schedule_hearing` (definer, confere `can('agenda', …)` à mão) e
  `set_hearing_cancelled` (invoker).
- `hearing_date_changes.changed_at` usa `clock_timestamp()`: o sync grava
  vários atos numa instrução só, e com `now()` as remarcações empatariam.

Backfill, medido antes contra a base real (leitura): 2 fichas a partir dos
eventos da 74, a Una com o histórico 13/10 → 12/11 reconstruído, e 1 ficha
sem data (a "Instrução e Julgamento — designada" do processo cbb1a43d). A
pendência falsa do processo 319c1e2e some. Os eventos da 74 perdem o
"(a confirmar)" do título, a descrição gerada (só se ninguém a editou) e
ganham a duração do tipo.

### Telas

- `/audiencias` com a **Pauta** (7/30/90 dias, responsável, tipo, mostrar
  canceladas), a lista **Sem data** no topo e a **ficha** em drawer,
  endereçável por `?ficha=<id>`.
- Ficha: conferir data, informar/alterar data, tipo, modalidade, link da sala
  (só `http(s)`, validado no zod e no CHECK), processo, responsáveis,
  histórico de datas, cancelar/descartar/reativar.
- Menu: "Audiências" depois de Agenda, com badge = sem data + futuras a
  confirmar.
- Agenda: o evento traz a ficha no `EVENT_SELECT`; o modal ganhou "Abrir a
  ficha da audiência" e o aviso de que excluir leva a ficha junto. O selo "a
  confirmar" não aparecia no modal desde a 74 — a condição do bloco de flags
  não o incluía; corrigido.
- Aba Agenda do processo: esconde audiência cancelada (a aba não filtra
  `show_in_agenda`) e o selo lê a ficha.
- Pendência `hearing_without_date` conta fichas `a_designar`.

### Ficou para depois

- **Imprimir a pauta** — o layout do app imprime a sidebar junto; precisa de
  estilos de impressão próprios.
- **Tipos de audiência em Configurações** — a fase 3 traz a tela junto com os
  modelos de checklist. Até lá, o seed.
- **Motivo da remarcação** — fase 4.

### Verificação

- `tsc` e `eslint` sem erro novo.
- Tela pela página temporária sob `/acompanhar` com dados fictícios no cache:
  pauta, lista sem data, as três fichas (a confirmar, com histórico, sem data),
  validação de horário e de link `javascript:`, filtro de canceladas, janela de
  7 dias, `?ficha=` inválido ignorado, largura de celular.
- Antes de aplicar, as regras do gatilho foram repassadas à mão contra as 10
  movimentações reais. Aplicada pelo `supabase db push`, o backfill disse
  exatamente o previsto: 2 fichas a partir dos compromissos, 1 sem data, 3
  mudanças de data, 2 títulos sem "(a confirmar)".
- Conferido lendo a base depois: a Una com 13/10 → 12/11 na ordem certa; os
  dois compromissos com a duração do tipo (30 e 60 min) e sem a descrição da
  74; `events.hearing_slot` removida; o embed `hearings!hearings_event_id_fkey`
  que a Agenda usa responde; `schedule_hearing` sem sessão recusa com 42501;
  `hearing_process_links` negada à chave anônima; `hearings` devolve 0 linhas
  à anônima.
- A conciliação de 06/10 já aconteceu (o andamento "realizada: 13" de 06/10
  existe) e segue `designada`: é o caso "aguardando resultado" da fase 4.

## Em aberto (decidir na fase)

- **Andamento "realizada"/"cancelada"** — hoje o classificador o exclui do
  slot. Pode sugerir o status na ficha; aplicar sozinho fecha audiência com
  base em texto. Fase 4.
- **Link da sala lido da intimação** — publicações de audiência virtual
  costumam trazer o link. Medir nas publicações reais antes de prometer, como a
  74 fez com a data. Fase 5 ou depois.
- **Testemunhas como cadastro próprio** (nome, contato, intimada ou não). Na
  v1 cabem como itens do checklist.
- **Acordo com valor → lançamento de êxito no Financeiro**, oferecido como os
  contratos fazem ao assinar.
- **Assistente** — ler a pauta e montar roteiro de preparação. Depende do
  crédito do Gemini.
- **Modelos de documento** com campos da audiência: carta de preposição e rol
  de testemunhas.

## Fora de escopo

- Envio automático de WhatsApp (API) e lembretes agendados: não há job no
  sistema.
- Visão por comarca/fórum.
- Exportação ICS.
