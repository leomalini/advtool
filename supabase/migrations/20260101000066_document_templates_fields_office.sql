-- ============================================================
-- 66 — MODELOS: CATEGORIA E DEFINIÇÃO DOS CAMPOS · DADOS DO ESCRITÓRIO
--
-- Até a migration 62 um modelo tinha dois tipos de campo: os de CADASTRO (do
-- catálogo, preenchidos pelo banco) e todo o resto, redigido pela IA. Num
-- contrato, `{valor_honorarios}` e `{percentual_exito}` caíam no segundo grupo
-- — e a IA não tem de onde tirar esses números. Agora o escritório define,
-- modelo a modelo, o que é campo MANUAL (digitado ao gerar) e o que é campo
-- de IA (texto corrido, redigido a partir de uma instrução).
--
-- ── `field_settings` ──
-- Um objeto por campo que NÃO é do catálogo, com a chave igual ao nome do
-- campo no .docx:
--
--   { "valor_honorarios": { "kind": "manual", "label": "Honorários",
--                           "format": "currency" },
--     "fatos":            { "kind": "ai", "label": "Dos fatos",
--                           "instruction": "Narre os fatos em ordem…" } }
--
-- jsonb e não uma tabela filha: a definição só existe junto do arquivo — é
-- lida inteira, gravada inteira e some com o modelo. O formato é validado no
-- app (zod, `src/schemas/documentTemplate.schema.ts`); o banco garante só que
-- é um objeto. Campo sem definição recebe um padrão inferido pelo nome (ver
-- `fieldSettings.ts`), então modelos antigos continuam funcionando.
--
-- ── `category` ──
-- Subconjunto das categorias de `documents` (migration 23): o documento gerado
-- pode ser salvo no cliente/processo já classificado.
--
-- ── `office_settings` ──
-- Nome, CNPJ, endereço e papel timbrado do escritório, para os campos
-- `{escritorio_*}` e `{local_e_data}` e para o Word livre do Assistente. Uma
-- linha só: a chave é um boolean que só aceita `true`.
--
-- Quem lê: qualquer membro ativo. Todo perfil que gera documento precisa
-- desses dados, e nada ali é sigiloso dentro do escritório. Quem grava: quem
-- administra Configurações. Sem policy de delete — a linha é editada, nunca
-- apagada.
--
-- O papel timbrado fica no bucket `attachments`, em `escritorio/…`, sob as
-- policies da migration 63 (fora de `lancamentos/` valem as de Documentos).
-- ============================================================

-- ── Modelos ──────────────────────────────────────────────────────────────────

alter table public.document_templates
  add column if not exists category text not null default 'outros'
    check (category in ('peticao', 'contrato', 'procuracao', 'outros'));

alter table public.document_templates
  add column if not exists field_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(field_settings) = 'object');

create index if not exists idx_document_templates_category
  on public.document_templates(category);

-- ── Escritório ───────────────────────────────────────────────────────────────

create table if not exists public.office_settings (
  id                    boolean primary key default true check (id),
  name                  text,
  cnpj                  text,
  /** Registro da sociedade de advogados na OAB. */
  oab_registration      text,
  street                text,
  number                text,
  complement            text,
  neighborhood          text,
  city                  text,
  state                 text check (state is null or state ~ '^[A-Z]{2}$'),
  zip                   text,
  phone                 text,
  email                 text,
  /** .docx no bucket `attachments`, em `escritorio/…`. */
  letterhead_path       text,
  letterhead_file_name  text,
  updated_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.office_settings;
create trigger set_updated_at before update on public.office_settings
  for each row execute function public.set_updated_at();

select public.apply_rbac_policies(
  'office_settings',
  '*',
  'configuracoes:manage',
  'configuracoes:manage',
  null
);
