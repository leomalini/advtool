-- ============================================================
-- 62 — MODELOS DE DOCUMENTO
--
-- Petições, procurações e contratos do escritório em .docx, com campos entre
-- chaves: {cliente_nome}, {processo_cnj}, {fatos}… O Assistente gera o
-- documento de um cliente/processo trocando só os campos — fonte, margens,
-- timbre e estilos do arquivo original ficam intactos.
--
-- ── Dois tipos de campo, uma coluna ──
-- `fields` guarda todos os campos que o arquivo usa (detectados no upload).
-- Quem é campo de CADASTRO (preenchido pelo sistema, a partir do banco) e quem
-- é campo de TEXTO (redigido pela IA) não fica gravado: é decidido pelo
-- catálogo do código (`src/features/ia/templates/catalog.ts`). Assim um campo
-- novo no catálogo passa a valer para os modelos antigos sem migration.
--
-- ── Onde fica o arquivo ──
-- No bucket `attachments`, em `modelos/<id>/…`. As policies desse bucket
-- (migration 38) já seguem `documentos:view/create/delete` — exatamente o que
-- a tabela abaixo exige. Modelo é documento do escritório, não da pessoa.
-- ============================================================

create table if not exists public.document_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  file_path   text not null unique,
  file_name   text not null,
  fields      text[] not null default '{}',
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_document_templates_name
  on public.document_templates(name);

drop trigger if exists set_updated_at on public.document_templates;
create trigger set_updated_at before update on public.document_templates
  for each row execute function public.set_updated_at();

select public.apply_rbac_policies(
  'document_templates',
  'documentos:view',
  'documentos:create',
  'documentos:update',
  'documentos:delete'
);
