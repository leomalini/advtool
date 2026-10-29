-- Fase 5 do plano do Assistente (docs/assistente-claude.md): o que a IA faz
-- em segundo plano.
--
--   1. `ai_batch_items` — o que foi mandado à Batch API da Anthropic (metade do
--      preço) e ainda espera ser recolhido: triagem de publicação, resumo do
--      processo e respostas do portal.
--   2. `publication_triage` — a triagem de cada publicação: tipo do ato,
--      urgência, se pede providência, prazo em dias e o processo provável.
--      Vira selo na lista e sugestão de tarefa que alguém confirma.
--   3. `notifications.recipient_id` — aviso de uma pessoa só (o briefing
--      diário). Nulo continua sendo "todos com o recurso".
--   4. `ai_usage`: as rotas novas (`triage`, `briefing`) e a marca de lote.

-- ── 1. Lote ─────────────────────────────────────────────────────────────────

create table if not exists public.ai_batch_items (
  id             uuid primary key default gen_random_uuid(),

  /** O trabalho: quem monta o pedido e quem grava o resultado. */
  kind           text not null
                   check (kind in ('triage', 'process_summary', 'portal_answers')),
  /** A publicação (triagem) ou o processo (resumo, portal). */
  entity_id      uuid not null,

  /** Id do pedido dentro do lote — o elo entre pedido e resultado. */
  custom_id      text not null unique,
  batch_id       text not null,
  /** A referência serializável do AI SDK, para consultar e recolher. */
  batch_ref      jsonb not null,

  /** A impressão digital dos dados usados: resultado de dado que já mudou não
   * é gravado (fica `stale`). */
  input_hash     text not null,
  /** O que a gravação precisa e não volta do modelo (as fontes do resumo). */
  context        jsonb,

  status         text not null default 'pending'
                   check (status in ('pending', 'applied', 'stale', 'failed')),
  error          text,

  created_at     timestamptz not null default now(),
  /** Última consulta do lote: recolher ao abrir uma tela não pode consultar a
   * Anthropic a cada clique. */
  checked_at     timestamptz,
  finished_at    timestamptz
);

create index if not exists idx_ai_batch_items_pending
  on public.ai_batch_items(batch_id)
  where status = 'pending';

-- Um pedido pendente por trabalho e registro: a chegada seguinte espera o
-- resultado em vez de mandar outro.
create unique index if not exists uq_ai_batch_items_pending_entity
  on public.ai_batch_items(kind, entity_id)
  where status = 'pending';

-- Sem policy nenhuma: só a service_role (rotas de servidor) lê e escreve.
alter table public.ai_batch_items enable row level security;


-- ── 2. Triagem de publicações ───────────────────────────────────────────────

create table if not exists public.publication_triage (
  publication_id        uuid primary key
                          references public.publications(id) on delete cascade,

  act_type              text not null,
  urgency               text not null check (urgency in ('alta', 'media', 'baixa')),
  needs_action          boolean not null,
  summary               text not null,

  /** A providência como título de tarefa; nula quando não pede nada. */
  suggested_task        text,
  /** Prazo que o texto dá; a data sai do motor de prazos, nunca daqui. */
  deadline_days         integer check (deadline_days between 1 and 365),
  deadline_counting     text check (deadline_counting in ('uteis', 'corridos')),

  /** Só para publicação sem processo: um dos candidatos achados pelas partes. */
  probable_process_id   uuid references public.legal_processes(id) on delete set null,
  probable_reason       text,

  model                 text,
  triaged_at            timestamptz not null default now(),

  /** A sugestão de tarefa: aberta, virou tarefa ou foi descartada. */
  suggestion_status     text not null default 'open'
                          check (suggestion_status in ('open', 'task_created', 'dismissed')),
  task_id               uuid references public.tasks(id) on delete set null
);

create index if not exists idx_publication_triage_open
  on public.publication_triage(urgency)
  where suggestion_status = 'open';

-- Lê quem vê publicações; quem as trata marca a sugestão (criou a tarefa ou
-- descartou). A triagem em si só a service_role grava.
select public.apply_rbac_policies(
  'publication_triage',
  'publicacoes:view',
  null,
  'publicacoes:update',
  null
);


-- ── 3. Aviso de uma pessoa só ───────────────────────────────────────────────

alter table public.notifications
  add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;

create index if not exists idx_notifications_recipient
  on public.notifications(recipient_id)
  where recipient_id is not null;

-- As mesmas regras da migration 47, com o destinatário: aviso pessoal só para
-- quem é o destinatário. O Realtime aplica a mesma policy na entrega.
drop policy if exists rbac_select on public.notifications;
create policy rbac_select on public.notifications
  for select using (
    (select public.can(resource, 'view'))
    and (recipient_id is null or recipient_id = (select auth.uid()))
  );

drop policy if exists rbac_update on public.notifications;
create policy rbac_update on public.notifications
  for update using (
    (select public.can(resource, 'view'))
    and (recipient_id is null or recipient_id = (select auth.uid()))
  )
  with check (
    (select public.can(resource, 'view'))
    and (recipient_id is null or recipient_id = (select auth.uid()))
  );


-- ── 4. Consumo ──────────────────────────────────────────────────────────────

alter table public.ai_usage
  add column if not exists batch boolean not null default false;

-- A restrição de rota é achada pelo conteúdo, como na migration 82.
do $$
declare
  route_check text;
begin
  for route_check in
    select conname
      from pg_constraint
     where conrelid = 'public.ai_usage'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%route%'
  loop
    execute format('alter table public.ai_usage drop constraint %I', route_check);
  end loop;
end $$;

alter table public.ai_usage
  add constraint ai_usage_route_check
  check (route in (
    'chat', 'portal', 'contract_reader', 'drafting', 'process_summary', 'triage', 'briefing'
  ));
