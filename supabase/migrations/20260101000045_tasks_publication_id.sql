-- ============================================================
-- 45 — ATIVIDADE VINCULADA À PUBLICAÇÃO
--
-- Ler a publicação e providenciar o que ela pede são dois atos distintos — é a
-- mesma distinção que `read_at` e `handled_at` já fazem. O que faltava era o
-- meio de registrar a providência: "contestar até dia X" nasce de uma
-- publicação específica, e hoje a tarefa só sabia apontar para o processo.
--
-- Nullable e `on delete set null`, como os demais vínculos de `tasks`: apagar
-- a publicação não pode levar embora o prazo que alguém anotou a partir dela.
--
-- A tarefa continua carregando `legal_process_id` quando a publicação tem
-- processo — assim ela aparece nas duas telas sem precisar de junção.
-- ============================================================

alter table public.tasks
  add column if not exists publication_id uuid
    references public.publications(id) on delete set null;

create index if not exists idx_tasks_publication_id
  on public.tasks(publication_id);
