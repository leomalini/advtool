-- ============================================================
-- 23 — DOCUMENTS (tabela unificada de arquivos)
--
-- Substitui client_attachments e event_attachments por uma tabela só.
--
-- Por que unificar, se o padrão do schema é uma tabela por entidade pai
-- (task_comments, crm_item_comments)? Porque a página /documentos precisa
-- listar TODOS os arquivos do escritório num lugar só — com uma tabela por pai
-- isso viraria UNION de 4 tabelas, e cada nova entidade com anexo somaria mais
-- uma. Comentários nunca são vistos fora do contexto do pai; documentos são.
--
-- Os quatro vínculos são nullable e independentes (mesmo desenho de
-- financial_entries), com CHECK exigindo ao menos um: um arquivo solto, sem
-- dono, não teria como ser encontrado depois.
-- ============================================================

create table public.documents (
  id                uuid primary key default gen_random_uuid(),

  client_id         uuid references public.clients(id) on delete set null,
  crm_item_id       uuid references public.crm_items(id) on delete set null,
  legal_process_id  uuid references public.legal_processes(id) on delete set null,
  event_id          uuid references public.events(id) on delete set null,

  category          text not null default 'outros'
                      check (category in ('peticao', 'contrato', 'procuracao', 'decisao', 'outros')),
  file_name         text not null,
  /** Caminho no bucket 'attachments'. */
  file_path         text not null,
  file_size         bigint not null,
  file_type         text not null,

  uploaded_by       uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),

  constraint chk_documents_has_parent check (
    client_id is not null
    or crm_item_id is not null
    or legal_process_id is not null
    or event_id is not null
  )
);

create index idx_documents_client_id        on public.documents(client_id);
create index idx_documents_crm_item_id      on public.documents(crm_item_id);
create index idx_documents_legal_process_id on public.documents(legal_process_id);
create index idx_documents_event_id         on public.documents(event_id);
create index idx_documents_created_at       on public.documents(created_at desc);

alter table public.documents enable row level security;
create policy "auth_full" on public.documents
  for all using (auth.role() = 'authenticated');

-- Migração dos anexos antigos. Ambas as tabelas estão vazias hoje, mas o
-- INSERT fica aqui para o caso de outro ambiente ter dados.
insert into public.documents (client_id, file_name, file_path, file_size, file_type, uploaded_by, created_at)
  select client_id, file_name, file_path, file_size, file_type, uploaded_by, created_at
  from public.client_attachments;

insert into public.documents (event_id, file_name, file_path, file_size, file_type, uploaded_by, created_at)
  select event_id, file_name, file_path, file_size, file_type, uploaded_by, created_at
  from public.event_attachments;

drop table public.client_attachments;
drop table public.event_attachments;
