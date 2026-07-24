-- ============================================================
-- 14 — DECOUPLE legal_processes FROM crm_items (1 processo : N itens)
-- A processo can now be linked to several crm_items across different
-- workflows (e.g. a Negociação item AND its own master item in
-- wf-processos) — not just the single item it was created from.
-- ============================================================

-- legal_processes.id was previously *also* the id of its originating
-- crm_item (joined-table inheritance). Give it its own identity: keep the
-- primary key, drop the FK that tied it to crm_items, add a default so new
-- rows get a fresh id instead of requiring one to be supplied.
alter table public.legal_processes
  drop constraint legal_processes_id_fkey;

alter table public.legal_processes
  alter column id set default gen_random_uuid();

-- crm_items can now optionally reference a legal_process — this is the
-- normal forward FK PostgREST needs to embed `legal_process:legal_processes(...)`
-- on a crm_item, and the reverse (`crm_items:crm_items(...)`) on a legal_process.
alter table public.crm_items
  add column legal_process_id uuid references public.legal_processes(id) on delete set null;

create index idx_crm_items_legal_process_id on public.crm_items(legal_process_id);

-- Backfill: existing legal_processes rows still share their id with the
-- crm_item they were created from — link them explicitly before that
-- coincidence stops being meaningful.
update public.crm_items
  set legal_process_id = id
  where id in (select id from public.legal_processes);
