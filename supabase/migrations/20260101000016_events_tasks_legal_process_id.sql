-- ============================================================
-- 16 — VÍNCULO DIRETO events/tasks → legal_processes
-- Até aqui events e tasks só tinham crm_item_id. Como um legal_process pode
-- ter N crm_items (migration 14) — ou nenhum —, filtrar "todos os eventos e
-- tarefas deste processo" via crm_item_id exigiria um join extra e ainda
-- assim falharia para processos sem item vinculado.
--
-- As duas colunas coexistem por desenho: itens criados a partir do CRM
-- (CasoModal) continuam usando crm_item_id; os criados a partir do módulo de
-- Processos (ProcessoModal) usam legal_process_id.
-- ============================================================

alter table public.events
  add column legal_process_id uuid references public.legal_processes(id) on delete set null;

create index idx_events_legal_process_id on public.events(legal_process_id);

alter table public.tasks
  add column legal_process_id uuid references public.legal_processes(id) on delete set null;

create index idx_tasks_legal_process_id on public.tasks(legal_process_id);
