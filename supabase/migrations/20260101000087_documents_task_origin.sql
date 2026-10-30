-- ============================================================
-- 87 — DOCUMENTO DE TAREFA, ORIGEM E NOVAS CATEGORIAS
--
-- Três mudanças em `documents`, todas para a Agenda e a página /documentos:
--
--   1. `task_id` — a tarefa ganha anexos, como o evento já tinha. Mesmo
--      desenho do `event_id`: nullable, `on delete set null`, e o upload grava
--      junto os vínculos da tarefa (processo, cliente, card), para o arquivo
--      aparecer no processo também. Arquivo SÓ da tarefa sai com ela, pelo
--      app (deleteTaskOnlyDocuments), antes que o CHECK de dono trave a
--      exclusão — o mesmo problema que o evento já teve.
--   2. `origin` — como o arquivo entrou: enviado à mão, gerado por modelo,
--      cópia assinada da D4Sign ou salvo pelo Assistente. Antes disto nada
--      registrava isso, e não há como saber depois: as linhas antigas ficam
--      NULL ("sem registro"), exceto as cópias assinadas, que a tabela
--      `signature_requests` identifica com certeza.
--   3. Categorias `identificacao`, `certidao` e `comprovante_residencia` —
--      o tipo do documento que o escritório mais recebe do cliente e que hoje
--      caía em "Outros".
--
-- RLS sem mudança: documento de tarefa segue `documentos`, como o de evento.
-- ⚠️ Não reaplicar `apply_rbac_policies` em `documents` (ver migration 63).
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Vínculo com a tarefa
-- ────────────────────────────────────────────────────────────────────────────

alter table public.documents
  add column if not exists task_id uuid
    references public.tasks(id) on delete set null;

create index if not exists idx_documents_task_id on public.documents(task_id);

-- O CHECK de "tem pelo menos um dono" precisa aceitar o vínculo novo. Mesmo
-- passo das migrations 28, 63 e 69.
alter table public.documents drop constraint if exists chk_documents_has_parent;
alter table public.documents add constraint chk_documents_has_parent check (
  client_id is not null
  or crm_item_id is not null
  or legal_process_id is not null
  or event_id is not null
  or movement_id is not null
  or financial_entry_id is not null
  or contract_id is not null
  or task_id is not null
);

-- Anexo de lançamento e arquivo de contrato continuam exclusivos — agora
-- também sem tarefa ao lado. É o que mantém seguro o cascade dos dois.
alter table public.documents drop constraint if exists chk_documents_financial_entry_exclusive;
alter table public.documents add constraint chk_documents_financial_entry_exclusive check (
  financial_entry_id is null
  or (
    client_id is null
    and crm_item_id is null
    and legal_process_id is null
    and event_id is null
    and movement_id is null
    and contract_id is null
    and task_id is null
  )
);

alter table public.documents drop constraint if exists chk_documents_contract_exclusive;
alter table public.documents add constraint chk_documents_contract_exclusive check (
  contract_id is null
  or (
    client_id is null
    and crm_item_id is null
    and legal_process_id is null
    and event_id is null
    and movement_id is null
    and financial_entry_id is null
    and task_id is null
  )
);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Origem
--
-- A coluna nasce sem default, para as linhas existentes ficarem NULL; o
-- default vem depois e vale só para as novas. Quem cria documento fora do
-- `uploadDocument` (a cópia assinada, pela service_role) grava a sua.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.documents
  add column if not exists origin text
    check (origin in ('upload', 'modelo', 'assinatura', 'ia'));

alter table public.documents alter column origin set default 'upload';

update public.documents d
   set origin = 'assinatura'
  from public.signature_requests r
 where r.signed_document_id = d.id
   and d.origin is null;

create index if not exists idx_documents_origin on public.documents(origin);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Categorias
--
-- CHECK nomeado na migration 63; recriado com as três novas.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.documents drop constraint if exists documents_category_check;
alter table public.documents add constraint documents_category_check check (
  category in (
    'peticao', 'contrato', 'procuracao', 'decisao',
    'identificacao', 'certidao', 'comprovante_residencia',
    'comprovante', 'nota_fiscal', 'boleto',
    'outros'
  )
);

-- O leitor de contratos já disse o que cada anexo é (`source_kind`, migration
-- 70). Os que ficaram em "Outros" passam para a categoria certa.
update public.documents
   set category = case
     when source_kind in ('cnh', 'rg', 'cpf') then 'identificacao'
     when source_kind in ('certidao_nascimento', 'certidao_casamento') then 'certidao'
     when source_kind = 'comprovante_residencia' then 'comprovante_residencia'
     when source_kind = 'procuracao' then 'procuracao'
     when source_kind = 'nota_fiscal' then 'nota_fiscal'
     when source_kind = 'contrato' then 'contrato'
   end
 where category = 'outros'
   and source_kind in (
     'cnh', 'rg', 'cpf', 'certidao_nascimento', 'certidao_casamento',
     'comprovante_residencia', 'procuracao', 'nota_fiscal', 'contrato'
   );
