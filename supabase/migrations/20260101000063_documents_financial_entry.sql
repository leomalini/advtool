-- ============================================================
-- 63 — DOCUMENTOS ANEXADOS A UM LANÇAMENTO
--
-- Comprovante, nota fiscal, boleto ou guia enviados direto no lançamento do
-- Financeiro — inclusive despesa avulsa do escritório, que não tem cliente nem
-- processo onde pendurar o arquivo.
--
-- O arquivo PERTENCE ao lançamento, e só a ele. As partes abaixo são
-- consequência disso:
--
--   1. `financial_entry_id` é `on delete cascade`, ao contrário dos demais
--      vínculos de `documents` (todos `set null`). Um comprovante não tem vida
--      própria fora do lançamento que comprova. Com `set null`, o CHECK de "tem
--      pelo menos um dono" travaria a exclusão do lançamento — como já travou a
--      do evento (ver deleteEventOnlyDocuments).
--   2. Um CHECK impede o documento do lançamento de ter outro dono. É o que
--      torna o cascade seguro: ele nunca leva junto um arquivo que também é do
--      cliente ou do processo.
--   3. As policies seguem o Financeiro, não o Documentos — regra de
--      sub-entidade de docs/PLANEJAMENTO-MULTIUSUARIO.md (anexar exige
--      `:update` do pai). O estagiário, que não vê o Financeiro, também não vê
--      estes arquivos, nem pela API nem pelo Storage. E o perfil `finance`, que
--      só lê Documentos, consegue anexar o comprovante do lançamento que lança.
--
-- O objeto no bucket fica em `lancamentos/{id}/…` (buildFilePath em
-- documents.service.ts). A pasta é o critério das policies de
-- `storage.objects`: mais simples e barato que cruzar cada objeto com a linha
-- de `documents`.
--
-- ⚠️ Não reaplicar `apply_rbac_policies` em `documents`: o helper recriaria as
-- policies genéricas por cima destas e devolveria os anexos de lançamento a
-- quem tem só `documentos:view`.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Coluna
-- ────────────────────────────────────────────────────────────────────────────

alter table public.documents
  add column if not exists financial_entry_id uuid
    references public.financial_entries(id) on delete cascade;

create index if not exists idx_documents_financial_entry_id
  on public.documents(financial_entry_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Donos
--
-- O CHECK de "tem pelo menos um dono" precisa aceitar o vínculo novo, senão o
-- anexo — que não tem outro dono — seria recusado. Mesmo passo da migration 28.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.documents drop constraint if exists chk_documents_has_parent;
alter table public.documents add constraint chk_documents_has_parent check (
  client_id is not null
  or crm_item_id is not null
  or legal_process_id is not null
  or event_id is not null
  or movement_id is not null
  or financial_entry_id is not null
);

alter table public.documents drop constraint if exists chk_documents_financial_entry_exclusive;
alter table public.documents add constraint chk_documents_financial_entry_exclusive check (
  financial_entry_id is null
  or (
    client_id is null
    and crm_item_id is null
    and legal_process_id is null
    and event_id is null
    and movement_id is null
  )
);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Categorias do Financeiro
--
-- Petição, procuração e decisão não descrevem nada do que se anexa a um
-- lançamento. As três novas valem para qualquer documento — uma guia de custas
-- também é do processo.
--
-- O CHECK de `category` foi declarado na coluna (migration 23), sem nome
-- explícito. Em vez de presumir o nome que o Postgres gerou, o bloco derruba
-- qualquer CHECK que envolva a coluna antes de criar o novo, já nomeado.
-- ────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.conrelid = 'public.documents'::regclass
      and c.contype = 'c'
      and a.attname = 'category'
  loop
    execute format('alter table public.documents drop constraint %I', v_constraint);
  end loop;
end $$;

alter table public.documents add constraint documents_category_check check (
  category in (
    'peticao', 'contrato', 'procuracao', 'decisao',
    'comprovante', 'nota_fiscal', 'boleto',
    'outros'
  )
);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS de `documents`
--
-- Mesmos nomes que `apply_rbac_policies` usa (migration 36), agora com a
-- escolha do recurso por linha. O `case` diz qual permissão governa o arquivo;
-- cada `(select public.can(...))` continua virando InitPlan — uma avaliação
-- por statement, não por linha.
--
-- O `with check` do update impede mudar um documento de regime sem a permissão
-- do regime de destino.
-- ────────────────────────────────────────────────────────────────────────────

drop policy if exists "rbac_select" on public.documents;
drop policy if exists "rbac_insert" on public.documents;
drop policy if exists "rbac_update" on public.documents;
drop policy if exists "rbac_delete" on public.documents;

create policy "rbac_select" on public.documents
  for select using (
    case when financial_entry_id is null
      then (select public.can('documentos', 'view'))
      else (select public.can('financeiro', 'view'))
    end
  );

create policy "rbac_insert" on public.documents
  for insert with check (
    case when financial_entry_id is null
      then (select public.can('documentos', 'create'))
      else (select public.can('financeiro', 'update'))
    end
  );

create policy "rbac_update" on public.documents
  for update
  using (
    case when financial_entry_id is null
      then (select public.can('documentos', 'update'))
      else (select public.can('financeiro', 'update'))
    end
  )
  with check (
    case when financial_entry_id is null
      then (select public.can('documentos', 'update'))
      else (select public.can('financeiro', 'update'))
    end
  );

create policy "rbac_delete" on public.documents
  for delete using (
    case when financial_entry_id is null
      then (select public.can('documentos', 'delete'))
      else (select public.can('financeiro', 'delete'))
    end
  );


-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS do bucket `attachments`
--
-- O mesmo mapeamento do passo 4, pela pasta. As duas camadas precisam
-- concordar (ver a migration 38): linha visível com arquivo inacessível gera
-- documento que não abre; o contrário deixa baixar o que não se vê listado.
-- ────────────────────────────────────────────────────────────────────────────

drop policy if exists "attachments_select" on storage.objects;
drop policy if exists "attachments_insert" on storage.objects;
drop policy if exists "attachments_delete" on storage.objects;

create policy "attachments_select" on storage.objects
  for select using (
    bucket_id = 'attachments'
    and case when (storage.foldername(name))[1] = 'lancamentos'
      then (select public.can('financeiro', 'view'))
      else (select public.can('documentos', 'view'))
    end
  );

create policy "attachments_insert" on storage.objects
  for insert with check (
    bucket_id = 'attachments'
    and case when (storage.foldername(name))[1] = 'lancamentos'
      then (select public.can('financeiro', 'update'))
      else (select public.can('documentos', 'create'))
    end
  );

create policy "attachments_delete" on storage.objects
  for delete using (
    bucket_id = 'attachments'
    and case when (storage.foldername(name))[1] = 'lancamentos'
      then (select public.can('financeiro', 'delete'))
      else (select public.can('documentos', 'delete'))
    end
  );
