-- ============================================================
-- 13 — RENAME cases → crm_items, EXTRACT legal_processes
-- CRM's generic entity ("crm_items") is workflow-agnostic and can represent
-- anything the user configures (workflows/columns are user-defined). Judicial
-- fields only make sense for items that are actual lawsuits, so they move out
-- into their own `legal_processes` table (joined-table inheritance: shares its
-- primary key with crm_items, so every processo is always a crm_item, but not
-- every crm_item is a processo).
-- ============================================================

-- ── 1. Rename the generic entity ─────────────────────────────────────────────

alter table public.cases rename to crm_items;

alter table public.tasks  rename column case_id to crm_item_id;
alter table public.events rename column case_id to crm_item_id;

-- Rename the auto-generated FK constraint too — PostgREST embeds
-- (`profiles!crm_items_assigned_to_fkey`) reference it by name, and the old
-- `cases_...` name would otherwise linger and confuse future readers.
alter table public.crm_items
  rename constraint cases_assigned_to_fkey to crm_items_assigned_to_fkey;

-- ── 2. New table: legal_processes ────────────────────────────────────────────

create table public.legal_processes (
  id                uuid        primary key references public.crm_items(id) on delete cascade,
  cnj_number        text,
  court             text,
  court_division    text,
  plaintiff         text,
  defendant         text,
  opposing_counsel  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_legal_processes_cnj on public.legal_processes(cnj_number);

create trigger set_updated_at before update on public.legal_processes
  for each row execute function public.set_updated_at();

alter table public.legal_processes enable row level security;
create policy "auth_full" on public.legal_processes
  for all using (auth.role() = 'authenticated');

-- ── 3. Backfill — every item already in wf-processos (or carrying judicial
--    data) gets its linked legal_processes row ───────────────────────────────

insert into public.legal_processes (id, cnj_number, court, court_division, plaintiff, defendant, opposing_counsel)
select id, cnj_number, court, court_division, plaintiff, defendant, opposing_counsel
from public.crm_items
where workflow_id = 'wf-processos'
   or cnj_number is not null or court is not null or court_division is not null
   or plaintiff is not null or defendant is not null or opposing_counsel is not null;

-- ── 4. Drop judicial columns from the now-generic crm_items ──────────────────

alter table public.crm_items
  drop column cnj_number,
  drop column court,
  drop column court_division,
  drop column plaintiff,
  drop column defendant,
  drop column opposing_counsel;

-- ── 5. Movements — legal_processes.id === crm_items.id for processos, so the
--    remap is a straight column rename, no data migration needed ────────────

alter table public.case_movements rename to legal_process_movements;
alter table public.legal_process_movements rename column case_id to legal_process_id;

alter table public.legal_process_movements
  drop constraint if exists case_movements_case_id_fkey;

alter table public.legal_process_movements
  add constraint legal_process_movements_legal_process_id_fkey
  foreign key (legal_process_id) references public.legal_processes(id) on delete cascade;

-- ── 6. Column history — generic CRM concept, not judicial ────────────────────

alter table public.case_column_history rename to crm_item_column_history;
alter table public.crm_item_column_history rename column case_id to crm_item_id;
