-- ============================================================
-- 38 — RBAC: bucket `attachments`
--
-- Fase 3, parte 4 — a última. Fecha o arquivo em si; a migration 36 já fechou
-- os metadados em `public.documents`.
--
-- As duas precisam concordar. Metadado visível com arquivo inacessível gera uma
-- lista de documentos que não abrem; o contrário é pior — arquivo baixável por
-- quem não deveria vê-lo listado. Por isso o mapeamento é idêntico ao de
-- `documents`: view → select, create → insert, delete → delete.
--
-- Não usa `apply_rbac_policies` porque as policies são de `storage.objects`, uma
-- tabela compartilhada por todos os buckets — o filtro `bucket_id` é obrigatório
-- e o helper (que assume uma tabela por recurso em `public`) não o expressa.
--
-- Sem policy de `update`: o upload usa `.upload()` sem upsert, e nada no código
-- sobrescreve um objeto existente.
--
-- ⚠️ Efeito colateral aceito: `uploadDocument` remove o arquivo quando o insert
-- do metadado falha (rollback manual em `documents.service.ts`). Um `paralegal`
-- tem `documentos:create` mas não `:delete`, então nesse caminho de erro raro o
-- arquivo fica órfão no bucket. Preferível a conceder delete de qualquer arquivo
-- do escritório a quem, por decisão de negócio, não pode apagar nada.
-- ============================================================

-- Garante o bucket em bases que nunca rodaram a migration 18.
insert into storage.buckets (id, name, public)
  values ('attachments', 'attachments', false)
  on conflict (id) do nothing;

-- As três da migration 18, que liberavam o bucket inteiro para qualquer conta
-- autenticada.
drop policy if exists "auth_upload" on storage.objects;
drop policy if exists "auth_read"   on storage.objects;
drop policy if exists "auth_delete" on storage.objects;

drop policy if exists "attachments_insert" on storage.objects;
drop policy if exists "attachments_select" on storage.objects;
drop policy if exists "attachments_delete" on storage.objects;

create policy "attachments_select" on storage.objects
  for select using (
    bucket_id = 'attachments' and (select public.can('documentos', 'view'))
  );

create policy "attachments_insert" on storage.objects
  for insert with check (
    bucket_id = 'attachments' and (select public.can('documentos', 'create'))
  );

create policy "attachments_delete" on storage.objects
  for delete using (
    bucket_id = 'attachments' and (select public.can('documentos', 'delete'))
  );
