# Roadmap dos Módulos Restantes — AdvTool

> **Status**: Ativo — fonte de verdade atual para o desenvolvimento dos módulos abaixo.
> **Substitui, para os tópicos que cobre**: `docs/PLANEJAMENTO.md` (seções de Dashboard/Agenda/Financeiro/Documentos/Pendências e a recomendação de API de tribunais), `docs/modulo-processos.md` (arquitetura pré-split `crm_items`/`legal_processes`), `docs/integracao-tribunais.md` (documento inteiro, descreve uma integração DataJud/Escavador que nunca foi construída), `docs/PENDENCIAS.md` (nomenclatura pré-refatoração).
> **Não mexe em**: a decisão de single-tenant (um único escritório, sem multi-usuário/multi-tenant — ver `docs/PLANEJAMENTO.md`), que continua válida e fora de escopo aqui.

## Por que este documento existe

Uma auditoria completa do codebase (código + schema Supabase + docs internos) mostrou duas coisas:

1. Boa parte do trabalho pedido **não é construir do zero** — é conectar infraestrutura real que já existe, mas está órfã (hooks, services e até tabelas prontos sem nenhum componente consumindo).
2. Existem **bugs concretos já ativos hoje**, alguns graves, que qualquer novo módulo construído em cima da estrutura atual iria herdar. O pior deles derruba a listagem inteira de `/processos` sempre que um processo fica sem nenhum caso do CRM vinculado — cenário já alcançável hoje, não hipotético.

Os docs antigos em `docs/` descrevem uma arquitetura anterior a uma refatoração significativa (separação de `cases` em `crm_items` + `legal_processes`) que nunca foi documentada, e um plano de integração jurídica (DataJud/Escavador) que foi abandonado a favor do serviço pago **BuscaProcessos**, de fato implementado. Por isso este documento consolida o estado real e o caminho daqui pra frente.

---

## Estado atual por módulo (resumo)

| Módulo | Dados | Nível de completude |
|---|---|---|
| Clientes | Real (Supabase) | Maduro — gaps pequenos (paginação, CPF lookup) |
| CRM (`crm_items`) | Real | Maduro — workflows editáveis, kanban + tabela |
| Processos (`legal_processes`) | Real | Abas centrais prontas (Resumo/Identificação/Movimentações/Etapas/Cliente); 5 abas placeholder |
| Pendências | Real | Cobre só Clientes hoje |
| **Dashboard** | Mock | UI completa; hooks reais já existem só não conectados |
| **Agenda** | Mock (página) / Real (infra) | Página é implementação paralela própria; infra real (`useEvents`) existe e não é usada |
| **Tarefas** | Real | Mais madura das "novas"; checklist/comments no schema sem UI |
| **Financeiro** | Mock, sem tabela | Só UI |
| **Documentos** | Mock, sem tabela | Só UI, upload sem handler |

---

## Bugs críticos encontrados (corrigir na Fase 0, antes de expandir)

### 1. Processo órfão derruba a listagem de `/processos`

`crm_items.legal_process_id` é nullable — um `legal_process` pode existir sem nenhum `crm_item` vinculado. Isso já é alcançável hoje: `useBulkDeleteCrmItems` (`src/features/crm/hooks/useCrmItemMutations.ts`) apaga em massa sem checar se algum item é o último vinculado a um processo.

Quando isso acontece, `LegalProcessWithRelations.crm_item` — tipado como não-nulo em `src/types/legalProcess.types.ts:31` — vem `undefined` (`pickMasterCrmItem` faz `crmItems.find(...) ?? crmItems[0]`, que retorna `undefined` com array vazio). **22 usos em 7 arquivos** dependem desse campo sem guarda, e o mais grave está em `src/features/processos/components/ProcessoTableView.tsx`: o comparador do `.sort()` (linhas ~119-130) acessa `a.crm_item.next_deadline` incondicionalmente — ou seja, **um único processo órfão quebra a página inteira de `/processos` no primeiro render**, sem precisar nem abrir o modal.

Arquivos afetados: `ProcessoModal.tsx`, `ProcessoTableView.tsx` (maior prioridade), `ClienteDetailModal.tsx` (aba Casos), `VincularProcessoField.tsx`, `ProcessoForm.tsx`, `ProcessosContent.tsx`, `filterLegalProcesses.ts`.

### 2. Criar um Caso ou Processo nunca aparece no feed de atividades

A tabela `activities` (`supabase/migrations/20260101000006_activities.sql`) tem `check (entity_type in ('lead','client','task','event'))` — nunca atualizado depois do rename `cases → crm_items`. Dois call sites (`crmItems.service.ts` e `legalProcesses.service.ts`) inserem `entity_type: 'case'`, que viola o CHECK, e **não checam o retorno de erro** (diferente do resto do mesmo arquivo, que faz `if (error) throw error`) — a violação é engolida silenciosamente pela Promise do supabase-js. Resultado: o código parece certo, mas nunca gerou uma linha de atividade.

### 3. Nenhum vínculo real entre Agenda/Tarefas e Processos

`events`/`tasks` só têm `crm_item_id` (renomeado de `case_id`), e **nem esse campo é populado hoje** — o `EventForm.tsx` real só tem um campo de texto livre `process_number`, sem relação com nenhuma tabela. Como um `legal_process` pode ter 0 ou N `crm_items`, mesmo uma correção simples exigiria um JOIN que não existe em lugar nenhum do código. Ver decisão na Fase 0.

### 4. Bucket de storage `attachments` não é reproduzível

Só existe via instrução manual no Supabase Studio (`supabase/README.md`) + um `schema.sql` congelado por volta da migration 06 (não reflete `crm_items`/`legal_processes`/`workflows` etc.). Um ambiente novo criado só com `supabase db reset` não teria o bucket.

---

## Princípios transversais

Estes valem para **todas** as fases abaixo — é o que garante consistência entre módulos, não só visual:

1. **Um service por tabela, nome plural** (`crmItems.service.ts`, `legalProcesses.service.ts`, `tasks.service.ts`). Sub-entidades de um domínio (comentários, checklist, anexos) vivem **dentro** do service do pai — nunca ganham arquivo próprio, seguindo o padrão já usado por `task_comments`/`task_checklist_items` dentro de `tasks.service.ts`.
2. **Hooks**: leitura em `use<Plural>.ts` (`useEvents`, `useTasks`), mutação em `use<Singular>Mutations.ts` (`useTaskMutations`, `useEventMutations`). Sempre React Query — nunca Supabase direto num componente.
3. **Schema Zod em `src/schemas/<singular>.schema.ts`, tipos em `src/types/<singular>.types.ts`**, com sufixo `WithRelations` quando há joins (`LegalProcessWithRelations`).
4. **Abas compartilhadas entre `CasoModal` e `ProcessoModal`**: seguir o precedente já estabelecido por `CrmItemTimeline.tsx`/`CrmItemClienteTab.tsx` — um único componente, recebendo `crmItemId`/`legalProcessId` por prop, reutilizado nos dois modais (e em `ClienteDetailModal` quando fizer sentido). **Nunca duplicar a mesma aba entre os dois modais** — é a regra mais importante para a consistência pedida.
5. **RLS**: toda tabela nova recebe `enable row level security` + `create policy "auth_full" ... for all using (auth.role() = 'authenticated')` — a mesma política uniforme já usada em 100% do schema hoje (reflete a decisão de single-tenant já tomada; não introduzir granularidade nova sem decisão explícita em contrário).
6. **Migrations novas continuam a sequência `20260101NNNNNN`** — não é a data real, é um epoch fixo + contador sequencial de 6 dígitos, confirmado nas 14 migrations existentes. A próxima é `20260101000015`.
7. **Design tokens**: usar sempre `src/app/globals.css` como fonte da verdade (`--chart-1` a `--chart-5`, `--success/--warning/--info/--destructive`). **`docs/DESIGN-SYSTEM.md` está desatualizado** (documenta uma paleta "Cool Slate + Blue"/Plus Jakarta Sans que não existe mais — o sistema real, rotulado no próprio CSS, é "Graphite": monocromático + accent índigo `#5165f0`, fonte Hanken Grotesk + JetBrains Mono).
8. **Toda ação relevante de um service novo insere em `activities`**, best-effort (loga erro, não lança — telemetria auxiliar não deve travar a operação principal), para o feed do Dashboard funcionar como o "sistema nervoso" entre módulos.
9. **Query keys**: seguir o padrão real já em uso — `all` + `detail(id)` + entradas ad-hoc por caso de uso (`byClient(id)`, `byCrmItem(id)`, `byLegalProcess(id)`) — e invalidar tanto a lista quanto a entrada específica em `onSettled` das mutations, para que a aba de um modal e a página standalone correspondente fiquem sempre sincronizadas sem F5.
10. **Sem framework de testes neste ciclo** (decisão explícita — priorizar entregar os módulos). Reavaliar num ciclo futuro dedicado.

---

## Fase 0 — Fundação e correções

*Bloqueante: todas as fases seguintes dependem de pelo menos uma peça daqui.*

### Migrations

```sql
-- 20260101000015_fix_activities_entity_type_check.sql
alter table public.activities drop constraint if exists activities_entity_type_check;
alter table public.activities add constraint activities_entity_type_check
  check (entity_type in ('lead', 'client', 'task', 'event', 'crm_item', 'legal_process'));
-- 'lead' mantido por segurança histórica (tabela leads é código morto hoje, mas não há
-- garantia de que não existam linhas antigas com esse valor na base viva).
-- Confirme o nome real da constraint (\d public.activities no Studio) antes de aplicar.
```

```sql
-- 20260101000016_add_legal_process_id_to_events_and_tasks.sql
alter table public.events
  add column legal_process_id uuid references public.legal_processes(id) on delete set null;
create index idx_events_legal_process_id on public.events(legal_process_id);

alter table public.tasks
  add column legal_process_id uuid references public.legal_processes(id) on delete set null;
create index idx_tasks_legal_process_id on public.tasks(legal_process_id);

-- Opcional (recomendado, mas não obrigatório): impedir vínculo duplo acidental.
-- alter table public.events add constraint chk_events_single_parent
--   check (crm_item_id is null or legal_process_id is null);
-- alter table public.tasks add constraint chk_tasks_single_parent
--   check (crm_item_id is null or legal_process_id is null);
```

```sql
-- 20260101000017_crm_item_comments.sql
create table public.crm_item_comments (
  id           uuid primary key default gen_random_uuid(),
  crm_item_id  uuid not null references public.crm_items(id) on delete cascade,
  author_id    uuid not null references public.profiles(id),
  content      text not null,
  created_at   timestamptz not null default now()
);
create index idx_crm_item_comments_crm_item_id on public.crm_item_comments(crm_item_id);
alter table public.crm_item_comments enable row level security;
create policy "auth_full" on public.crm_item_comments for all using (auth.role() = 'authenticated');
```

```sql
-- 20260101000018_storage_attachments_bucket.sql
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
  on conflict (id) do nothing;

create policy "auth_upload" on storage.objects for insert with check (bucket_id = 'attachments' and auth.role() = 'authenticated');
create policy "auth_read"   on storage.objects for select using (bucket_id = 'attachments' and auth.role() = 'authenticated');
create policy "auth_delete" on storage.objects for delete using (bucket_id = 'attachments' and auth.role() = 'authenticated');
```

```sql
-- 20260101000019_profiles_oab_number.sql
alter table public.profiles add column oab_number text;
```

### Fixes de código

- `src/types/legalProcess.types.ts:31` — `crm_item: CrmItemWithRelations` → `crm_item: CrmItemWithRelations | null`.
- `src/features/processos/services/legalProcesses.service.ts` (`pickMasterCrmItem`) — retornar `null` em vez de deixar `undefined` vazar.
- Guarda defensiva (checar `null` antes de acessar) em: `ProcessoModal.tsx`, `ProcessoTableView.tsx` (prioridade máxima — inclui o comparador de `.sort()`), `ClienteDetailModal.tsx` (aba Casos), `VincularProcessoField.tsx`, `ProcessoForm.tsx`, `ProcessosContent.tsx`, `filterLegalProcesses.ts`.
- `src/features/crm/services/crmItems.service.ts` (`deleteCrmItemRecord`) — antes de apagar, checar se é o último `crm_item` com aquele `legal_process_id`; se sim, lançar erro tipado em vez de apagar silenciosamente.
- `useBulkDeleteCrmItems` (`useCrmItemMutations.ts`) — capturar esse erro novo e mostrar toast específico.
- `crmItems.service.ts` e `legalProcesses.service.ts` — trocar `entity_type: 'case'` por `'crm_item'`/`'legal_process'` respectivamente; trocar o insert sem checagem por `const { error } = await ...; if (error) console.error('[activities]', error.message)` (best-effort, não lança).
- `src/types/activity.types.ts` — `EntityType`: incluir `'crm_item' | 'legal_process'` no lugar de `'case'`.

### Infra e limpeza

- `src/middleware.ts` → `src/proxy.ts` via `npx @next/codemod@latest middleware-to-proxy .` (comando oficial do Next 16.2.7, já embutido no pacote instalado — renomeia arquivo e export `middleware`→`proxy`; `config`/matcher não mudam).
- Remover `package-lock.json` (manter só `pnpm-lock.yaml`, mais recente); considerar fixar `"packageManager"` no `package.json`.
- Criar `.env.example` (nomes de `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BUSCA_PROCESSOS_API_KEY`, `BUSCA_PROCESSOS_WEBHOOK_SECRET` — sem valores).
- Instalar componentes shadcn faltantes: `npx shadcn@latest add table alert-dialog popover calendar form chart` + `pnpm add recharts` (usados a partir da Fase 1).
- Regenerar `supabase/schema.sql` via `supabase db dump` depois que as migrations acima forem aplicadas (hoje está congelado por volta da migration 06 e é enganoso).
- Adicionar aviso "⚠️ Desatualizado — ver `docs/ROADMAP-MODULOS.md`" no topo de `docs/integracao-tribunais.md`, `docs/modulo-processos.md` e `docs/PENDENCIAS.md`.

---

## Fase 1 — Dashboard + Agenda com dados reais

### Dashboard

`useDashboardStats`/`useRecentActivities` (`src/features/dashboard/hooks/useDashboardStats.ts`) e seus services já existem e funcionam contra dados reais — só não têm consumidor. Passos:

- `DashboardContent.tsx` → consumir `useDashboardStats()` no lugar de `DASHBOARD_STATS` do mock; saudação usa `useAuth()` + `profiles.full_name`.
- `ActivityFeed.tsx` → consumir `useRecentActivities()` (já existe). **Reescrever `TIPO_CONFIG`**: hoje usa chaves em PT que não existem nos dados reais — as chaves reais de `ActivityType` são `case_created`/`client_created`/`task_created`/`event_created` (mais os novos `crm_item`/`legal_process` da Fase 0).
- `dashboard.service.ts` → adicionar `getTodayEvents()`, `getCasesByLegalArea()` (agrupa `crm_items.legal_area`), `getUpcomingDeadlines(limit)` (ordena por `crm_items.next_deadline`), `getCaseCountsByAssignee()`.
- `PrazosCard.tsx`, `AgendaHojeCard.tsx`, `AreasChart.tsx`, `AdvogadosCard.tsx` → trocar mock pelas queries acima. `AdvogadosCard` usa o novo `profiles.oab_number`; a cor do avatar deve ser **computada no cliente** (hash determinístico do id → uma das cores `--chart-N`), não armazenada — evita depender de um campo manual por usuário.
- `AreasChart.tsx` → migrar para **Recharts** via `components/ui/chart.tsx`, usando os tokens `--chart-1..5`: paleta categórica em ordem fixa (nunca ciclada), legenda sempre presente, tooltip no hover, rótulos seletivos — não uma cor gerada por índice.
- `FinanceiroResumo.tsx` → **permanece placeholder até a Fase 3** (não há como alimentar sem a tabela `financial_entries`).

### Agenda — é uma reescrita, não uma troca de fonte de dados

`AgendaContent.tsx` hoje é uma implementação **paralela e auto-contida**: `NovoEventoModal`/`EventoDetailModal` locais, `useEventosMock()`, tipo `Evento` do mock — **nunca usa** o `EventForm`/`EventDetailModal`/`useEvents` "reais" que já existem e funcionam contra a tabela `events` (CRUD completo, incluindo `event_assignees`). Passos:

- Remover `NovoEventoModal`, `EventoDetailModal`, `useEventosMock`, tipo local `EventoEnriquecido` de `AgendaContent.tsx`.
- Plugar `useEvents()` + `EventForm` (via `Dialog`) + `EventDetailModal` reais, preservando a UX do calendário mensal (grid, sidebar "Próximos Eventos") — só a camada de dados/modais muda.
- `src/schemas/event.schema.ts` → adicionar `crm_item_id: z.string().uuid().optional().nullable()` ao `eventFormSchema` (hoje só existe o texto livre `process_number`, sem relação real com nenhuma tabela).
- `events.service.ts` (`toDbPayload`) → incluir `crm_item_id` no payload (hoje omitido).
- `EventForm.tsx` → adicionar seletor real de `crm_item_id` (Select/combobox sobre `crm_items`, no estilo do `ClienteCombobox.tsx` já existente) ao lado do `client_id`. Decisão de produto em aberto: manter `process_number` como texto livre complementar (para processos ainda não cadastrados no sistema) ou aposentá-lo — qualquer uma resolve o problema técnico de hoje (zero vínculo real).

---

## Fase 2 — Abas dos modais Processos/CRM + módulo Tarefas

### Comentários

- Novo `src/features/crm/components/CrmItemComments.tsx` (mesma família "shared" de `CrmItemTimeline`/`CrmItemClienteTab`), recebendo `crmItemId`.
- `crmItems.service.ts` → `getCrmItemComments(crmItemId)`, `addCrmItemComment(crmItemId, content, userId)` (mesmo padrão de `getTaskComments`/`addTaskComment`).
- `CasoModal.tsx` usa `caso.id` direto; `ProcessoModal.tsx` resolve pelo `crm_item` mestre (`pickMasterCrmItem`, já existe) — ambos trocam o `PlaceholderTab` de "Comentários" pelo componente novo.

### Agenda/Tarefas dentro dos modais

- `events.service.ts`/`tasks.service.ts` → `getEventsByCrmItem/LegalProcess(id)`, `getTasksByCrmItem/LegalProcess(id)`.
- Novos `EntityEventsTab.tsx` (features/agenda) e `EntityTasksTab.tsx` (features/tarefas), recebendo `{ crmItemId?, legalProcessId? }` — listam + botão "+ Novo" abrindo `EventForm`/`TaskForm` com o vínculo pré-preenchido e travado (prop nova `lockedCrmItemId`/`lockedLegalProcessId`, que esconde o seletor manual).
- `src/schemas/task.schema.ts` → adicionar `legal_process_id` (o tipo já tem o campo desde a Fase 0; falta no schema/form).
- `CasoModal.tsx`/`ProcessoModal.tsx` → trocar os `PlaceholderTab` de "Agenda"/"Tarefas" pelos componentes acima.

### Tarefas — aperfeiçoamento

`task_checklist_items` e `task_comments` já têm CRUD completo em `tasks.service.ts`/`useTaskMutations.ts` — **zero UI consumindo**. Passos:

- Novo `TaskDetailModal.tsx` (mesmo padrão de `EventDetailModal`: header + corpo com scroll + footer), com seções de detalhes (edição), checklist e comentários — finalmente dá superfície aos hooks órfãos.
- `TaskCard.tsx` → adicionar `onClick` (repassado por `TaskColumn`/`TarefasContent`), abrindo o `TaskDetailModal`, seguindo o mesmo padrão de `dnd-kit` + clique já resolvido em `SortableCasoCard`/`CasoCard` (o `activationConstraint: {distance: 5}` já existente não conflita).
- `TaskForm.tsx` → adicionar campo `assigned_to` (Select via `useProfiles()`, mesmo padrão de atribuição do `CrmBulkActionBar`). Indicador de atrasada **já existe** em `TaskCard` (`isOverdue` via date-fns) — só precisa aparecer também no novo detail modal.
- Novo `filterTasks.ts` + `TarefaFilterBar.tsx`, replicando exatamente o formato de `filterCases.ts`/`CrmFilterBar.tsx` já usado no CRM (busca, prioridade, responsável).

---

## Fase 3 — Financeiro (lançamentos manuais)

*Escopo confirmado: só lançamentos manuais. Gateway de pagamento (ASAAS/InfinityPay), boleto e DDA ficam para uma fase futura — não fazem parte deste ciclo.*

```sql
-- 20260101000020_financial_entries.sql
create table public.financial_entries (
  id                uuid primary key default gen_random_uuid(),
  type              text not null check (type in ('receita', 'despesa')),
  category          text not null check (category in ('honorario', 'custas', 'pericia', 'outros')),
  description       text not null,
  amount            numeric(12,2) not null,
  status            text not null default 'pendente' check (status in ('pago', 'pendente', 'atrasado')),
  due_date          date not null,
  paid_at           date,
  client_id         uuid references public.clients(id) on delete set null,
  crm_item_id       uuid references public.crm_items(id) on delete set null,
  legal_process_id  uuid references public.legal_processes(id) on delete set null,
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_financial_entries_client_id on public.financial_entries(client_id);
create index idx_financial_entries_crm_item_id on public.financial_entries(crm_item_id);
create index idx_financial_entries_legal_process_id on public.financial_entries(legal_process_id);
create index idx_financial_entries_due_date on public.financial_entries(due_date);

create trigger set_updated_at before update on public.financial_entries
  for each row execute function public.set_updated_at();
alter table public.financial_entries enable row level security;
create policy "auth_full" on public.financial_entries for all using (auth.role() = 'authenticated');
```

*(Colunas espelham `MovimentacaoFinanceira` do mock em `src/data/mock.ts`, traduzidas para inglês seguindo a convenção do resto do schema.)*

### Arquivos

- `src/schemas/financialEntry.schema.ts`, `src/types/financialEntry.types.ts` (`FinancialEntry`, `FinancialEntryWithRelations`, labels de tipo/status/categoria).
- `src/features/financeiro/services/financialEntries.service.ts` — CRUD + `getFinancialEntriesByClient/CrmItem/LegalProcess(id)` + `getFinancialSummary()` (para o Dashboard).
- `src/features/financeiro/hooks/useFinancialEntries.ts` + `useFinancialEntryMutations.ts`.
- `src/features/financeiro/components/FinancialEntryForm.tsx` (react-hook-form + zodResolver, mesmo formato de `TaskForm.tsx`).
- `src/features/financeiro/components/FinancialEntriesTab.tsx` — aba compartilhada (`{crmItemId?, legalProcessId?, clientId?}`), plugada em `CasoModal`, `ProcessoModal` e `ClienteDetailModal` (que já tem o placeholder `AbaFinanceiro` esperando por isso).
- `FinanceiroContent.tsx` → dados reais; gráfico de fluxo de caixa (hoje `<div>`s com altura manual) migra para Recharts, reaproveitando a infra da Fase 1.
- `FinanceiroResumo.tsx` (Dashboard) → desbloqueado via `getFinancialSummary()`.

---

## Fase 4 — Documentos (upload + organização)

*Escopo confirmado: upload real + organização. Assinatura eletrônica/DocuSign fica para uma fase futura.*

**Decisão de design**: uma tabela **unificada** `documents`, não uma tabela por entidade pai (o padrão usado hoje por `client_attachments`/`event_attachments`). Razão: a página `/documentos` precisa listar todos os documentos do escritório num único lugar — uma tabela por pai exigiria UNION de 3+ tabelas para essa view. `client_attachments`/`event_attachments` têm **zero consumidor de UI hoje** (código morto do ponto de vista de produto), então são aposentadas em favor da tabela nova.

```sql
-- 20260101000021_documents.sql
create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid references public.clients(id) on delete set null,
  crm_item_id       uuid references public.crm_items(id) on delete set null,
  legal_process_id  uuid references public.legal_processes(id) on delete set null,
  event_id          uuid references public.events(id) on delete set null,
  category          text not null default 'outros' check (category in ('peticao','contrato','procuracao','decisao','outros')),
  file_name         text not null,
  file_path         text not null,
  file_size         bigint not null,
  file_type         text not null,
  uploaded_by       uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  constraint chk_documents_has_parent check (
    client_id is not null or crm_item_id is not null or legal_process_id is not null or event_id is not null
  )
);
create index idx_documents_client_id on public.documents(client_id);
create index idx_documents_crm_item_id on public.documents(crm_item_id);
create index idx_documents_legal_process_id on public.documents(legal_process_id);
create index idx_documents_event_id on public.documents(event_id);
create index idx_documents_created_at on public.documents(created_at desc);
alter table public.documents enable row level security;
create policy "auth_full" on public.documents for all using (auth.role() = 'authenticated');
```

```sql
-- 20260101000022_migrate_attachments_to_documents.sql
-- Rodar só depois do código parar de ler/escrever nas tabelas antigas.
insert into public.documents (client_id, file_name, file_path, file_size, file_type, uploaded_by, created_at, category)
select client_id, file_name, file_path, file_size, file_type, uploaded_by, created_at, 'outros' from public.client_attachments;

insert into public.documents (event_id, file_name, file_path, file_size, file_type, uploaded_by, created_at, category)
select event_id, file_name, file_path, file_size, file_type, uploaded_by, created_at, 'outros' from public.event_attachments;

drop table public.client_attachments;
drop table public.event_attachments;
```

### Arquivos

- `src/schemas/document.schema.ts`, `src/types/document.types.ts`.
- `src/features/documentos/services/documents.service.ts` — `getDocuments()` (para `/documentos`), `getDocumentsByClient/CrmItem/LegalProcess/Event(id)`, `uploadDocument()` (path padronizado `{parentType}/{parentId}/{timestamp}-{filename}` — hoje há duas convenções divergentes entre `client_attachments` e `event_attachments`, unificar aqui), `deleteDocument()`, `getDocumentUrl()` (signed URL, mesmo padrão de `getAttachmentUrl`).
- `src/features/documentos/hooks/useDocuments.ts` + `useDocumentMutations.ts`.
- `src/features/documentos/components/DocumentsTab.tsx` — aba compartilhada, com dropzone real reaproveitando a UI já pronta em `DocumentosContent.tsx` (hoje sem handler de submit).
- `DocumentosContent.tsx` → dados reais.
- `CasoModal.tsx`/`ProcessoModal.tsx` → trocar `PlaceholderTab` de "Documentos" pelo componente novo.
- `ClienteDetailModal.tsx` → nova aba "Anexos".
- `EventForm.tsx` → trocar o botão inerte "Anexar arquivos (disponível após salvar)" por uso real (só funciona pós-criação do evento, como o texto já indica).
- Remover código órfão: `getClientAttachments`/`uploadClientAttachment`/`deleteClientAttachment`/`getAttachmentUrl` (`clientes.service.ts`) e hooks correspondentes; `uploadEventAttachment` (`events.service.ts`).

---

## Fase 5 — Pendências estendida a Processos

Sem migration nova — depende só da FK `legal_process_id` da Fase 0.

- `legalProcesses.service.ts` → `getLegalProcessesPendencies()`: CNJ faltando, sem movimentação recente, `next_deadline` próximo sem nenhum evento/tarefa vinculado (só fica trivial de checar com `legal_process_id` existindo em `events`/`tasks`).
- `src/types/legalProcess.types.ts` → `ProcessoPendency` (mesmo shape de `ClientPendency`).
- `PendenciasContent.tsx` → nova seção "Processos" ao lado da já existente de Clientes.

---

## Fase 6 — BuscaProcessos (paralela, independente das demais)

Ver apêndice dedicado abaixo para o estado completo da integração. Trabalho desta fase:

- Endurecer `src/app/api/webhooks/buscaprocessos/route.ts`: hoje pula validação HMAC silenciosamente se `BUSCA_PROCESSOS_WEBHOOK_SECRET` estiver vazio — deve falhar fechado quando `NODE_ENV === 'production'`.
- `legalProcesses.service.ts` (`createLegalProcess`) → disparar `POST /api/buscaprocessos/monitoramentos` automaticamente (best-effort, try/catch, não bloqueia a criação) — a rota já existe e funciona, só nada a chama hoje.
- Validar a chave já presente em `.env.local` e conferir `src/lib/buscaprocessos/types.ts` contra uma resposta real (o próprio arquivo se declara "modelado a partir da doc, não verificado") — **só quando autorizado explicitamente**, já que uma chamada real consome crédito pago.
- `searchProcessosByOab`/`deleteMonitoramento`/`requestProcessUpdate` existem no client sem rota/UI — deixar como está até haver caso de uso concreto.

---

## Apêndice — BuscaProcessos: estrutura já existente e o que falta

Duas coisas distintas compartilham o nome "BuscaProcessos":

| | Servidor MCP (`.mcp.json`) | API REST (`src/lib/buscaprocessos/`) |
|---|---|---|
| URL | `https://docs.buscaprocessos.app.br/mcp` | `https://api.buscaprocessos.app.br` |
| Consumidor | Claude Code, durante desenvolvimento | O app Next.js, em runtime |
| Propósito | Documentação da API para consulta | Integração de produto de verdade |
| Autenticação | `x-api-key` via `$BUSCA_PROCESSOS_API_KEY` (já configurado corretamente em `.mcp.json`, sem chave hardcoded) | Mesma env var, header `x-api-key` |

**A API REST já está ~70% construída**, não é preciso arquitetar do zero:

- ✅ **Busca por CNJ ponta-a-ponta**: `ProcessoForm.tsx`/`VincularProcessoField.tsx` → `/api/buscaprocessos/processos/[cnj]` → `client.ts` → preenche o formulário. Já checa a base local antes de chamar a API externa (evita gastar crédito com processos já rastreados).
- ✅ **Webhook de nova movimentação ponta-a-ponta**: `/api/webhooks/buscaprocessos/route.ts` valida HMAC-SHA256, localiza o processo por `cnj_number`, insere em `legal_process_movements`.
- ⚠️ **Existem mas sem consumidor de UI**: `GET/POST /api/buscaprocessos/monitoramentos` (criar processo não dispara monitoramento automaticamente — ver Fase 6), `GET /api/buscaprocessos/processos?cpf_cnpj=`.
- ⚠️ **Existem no client.ts mas sem rota Next.js**: `searchProcessosByOab()`, `requestProcessUpdate()`, `deleteMonitoramento()`.
- **`.env.local` já tem uma `BUSCA_PROCESSOS_API_KEY`** com formato de chave "live" (`bp_live_...`) — não confirmada como funcional. Não testar sem autorização explícita (chamadas reais consomem créditos pagos).
- Tratamento de erro já mapeia status HTTP específicos para mensagens em PT-BR (404/401/403/422/429), classe `BpApiError` própria, timeout fixo de 30s, **sem retry, sem cache de resposta** (só dedupe funcional via checagem da base local antes de chamar a API).
- `types.ts` se autodeclara não verificado contra respostas reais — tratar como "melhor palpite" até validar.

---

## Fora de escopo deste roadmap (decisão explícita)

- Testes automatizados (Vitest/Playwright) — priorizar entrega dos módulos primeiro.
- Gateway de pagamento no Financeiro (ASAAS/InfinityPay), emissão de boleto, DDA.
- Assinatura eletrônica/DocuSign no Documentos.
- Multi-tenant/multi-escritório — decisão de negócio já tomada em `docs/PLANEJAMENTO.md`, não reaberta aqui.
- Motor automático de cálculo de prazos processuais (CPC) e auto-criação de tarefas/eventos a partir de intimações — mencionado nos docs antigos como fase futura; continua futuro, fora deste ciclo.

---

## Dependências entre fases

```
Fase 0 (schema + bugs) ──┬─→ Fase 1 (Dashboard/Agenda) ──→ Fase 2 (abas dos modais + Tarefas)
                          │                                        │
                          ├─→ Fase 3 (Financeiro)   ←──────────────┤ (aba compartilhada)
                          ├─→ Fase 4 (Documentos)    ←──────────────┤ (aba compartilhada)
                          └─→ Fase 5 (Pendências de Processos, precisa de legal_process_id)

Fase 6 (BuscaProcessos) — paralela, isolada em legalProcesses.service.ts + rota de webhook
```

---

## Como verificar cada fase

- **Migrations**: aplicar local (`supabase db reset` ou `execute_sql` via MCP do Supabase) e rodar `supabase db advisors` antes de gerar a migration final definitiva.
- **Bugs da Fase 0**: reproduzir o cenário órfão (criar um processo, apagar em massa seu único `crm_item` pelo CRM) e confirmar que passa a ser bloqueado/avisado em vez de quebrar `/processos`; confirmar que criar um Caso/Processo passa a aparecer no feed de atividades do Dashboard.
- **Cada tela nova/reconectada**: abrir no browser (dev server), criar/editar/excluir um registro de ponta a ponta, e confirmar que o mesmo dado aparece tanto na página standalone quanto na aba do modal correspondente — é a prova de que a invalidação de query está sincronizando os dois lugares (princípio transversal #9).

---

## Arquivos críticos (maior risco / maior superfície de mudança)

- `src/features/processos/components/ProcessoModal.tsx` — bug do órfão + 5 abas placeholder a substituir ao longo das Fases 2-4.
- `src/features/processos/services/legalProcesses.service.ts` — `pickMasterCrmItem`, criação de processo (Fase 0 + Fase 6), pendências (Fase 5).
- `src/features/crm/services/crmItems.service.ts` — guarda de orfandade, fix de `activities`, base de comentários.
- `src/features/agenda/components/AgendaContent.tsx` — reescrita completa (não é troca simples de dados).
- `supabase/migrations/20260101000014_decouple_legal_processes.sql` — âncora do modelo relacional que a Fase 0 corrige/estende.
