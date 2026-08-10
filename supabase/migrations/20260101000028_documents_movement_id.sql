-- ============================================================
-- 28 — DOCUMENTO ANEXADO A UMA MOVIMENTAÇÃO
--
-- O modelo mostra o card do documento ("Decisão Monocrática", com Abrir e
-- Baixar) dentro do item da movimentação. Hoje um documento só pode pendurar
-- no processo inteiro, então não há como saber a qual ato ele pertence.
--
-- Nullable e `on delete set null`, como os demais vínculos de `documents`:
-- apagar a movimentação não deve levar o arquivo junto.
-- ============================================================

alter table public.documents
  add column if not exists movement_id uuid
    references public.legal_process_movements(id) on delete set null;

create index if not exists idx_documents_movement_id on public.documents(movement_id);

-- O CHECK de "tem pelo menos um dono" precisa aceitar o vínculo novo, senão um
-- documento anexado só à movimentação seria recusado.
alter table public.documents drop constraint if exists chk_documents_has_parent;
alter table public.documents add constraint chk_documents_has_parent check (
  client_id is not null
  or crm_item_id is not null
  or legal_process_id is not null
  or event_id is not null
  or movement_id is not null
);
