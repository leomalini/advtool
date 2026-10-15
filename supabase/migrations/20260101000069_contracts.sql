-- ============================================================
-- 69 — CONTRATOS (fase 1: o registro e os arquivos)
--
-- Plano: `docs/contratos.md`.
--
-- Até aqui um contrato era só um arquivo em `documents` com a categoria
-- `contrato`. Ele passa a ter registro próprio, com o que um arquivo não diz:
-- em que pé está (rascunho, assinado, encerrado), quanto vale, quando vence.
-- Os arquivos continuam em `documents` — a página /documentos segue listando
-- tudo do escritório —, agora ligados ao contrato.
--
--   · `contracts`                — o contrato;
--   · `contract_status_changes`  — o histórico de status, gravado por trigger;
--   · `documents.contract_id`    — minuta, versão assinada e anexos.
--
-- Partes, papéis do modelo e a ligação com o Financeiro e a Agenda vêm nas
-- fases seguintes, cada uma com a sua migration.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Permissões
--
-- Recurso próprio, com a mesma matriz de `documentos` (migration 34): todos
-- veem, o estagiário cria e edita mas não apaga, o financeiro só lê.
-- ────────────────────────────────────────────────────────────────────────────

insert into public.role_permissions (role, resource, action) values
  ('admin',     'contratos', 'view'),
  ('admin',     'contratos', 'create'),
  ('admin',     'contratos', 'update'),
  ('admin',     'contratos', 'delete'),
  ('attorney',  'contratos', 'view'),
  ('attorney',  'contratos', 'create'),
  ('attorney',  'contratos', 'update'),
  ('attorney',  'contratos', 'delete'),
  ('paralegal', 'contratos', 'view'),
  ('paralegal', 'contratos', 'create'),
  ('paralegal', 'contratos', 'update'),
  ('finance',   'contratos', 'view')
on conflict (role, resource, action) do nothing;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. `contracts`
--
-- Três tipos, porque o escritório redige contrato em três papéis:
--   · `honorarios`         — o escritório com o cliente;
--   · `cliente_terceiros`  — o cliente com outra pessoa (locação, compra e
--                            venda), redigido pelo escritório;
--   · `escritorio`         — o escritório com um fornecedor (aluguel, sistemas).
--
-- O ciclo:
--   rascunho → aguardando_assinatura → vigente → encerrado | rescindido
-- "Vencido" não é guardado: é `vigente` com `end_date` no passado, calculado na
-- tela, como o "Atrasado" do Financeiro. Um estado guardado ficaria errado no
-- dia seguinte sem ninguém mexer no contrato.
--
-- ── Cliente ──
-- `on delete set null`, como em todas as tabelas que apontam para `clients`.
-- Honorários exigem cliente, mas a regra mora no formulário (zod), não num
-- CHECK: com o CHECK, excluir um cliente que tem contrato falharia com uma
-- violação que a tela não sabe explicar.
--
-- ── Números ──
-- Valor, parcelas, êxito e vigência são do registro, e não campos soltos do
-- modelo: a minuta (fase 2) e os lançamentos (fase 4) saem dos mesmos números,
-- e por isso não divergem.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.contracts (
  id                   uuid primary key default gen_random_uuid(),

  kind                 text not null
                         check (kind in ('honorarios', 'cliente_terceiros', 'escritorio')),
  title                text not null check (btrim(title) <> ''),
  status               text not null default 'rascunho'
                         check (status in (
                           'rascunho', 'aguardando_assinatura', 'vigente',
                           'encerrado', 'rescindido'
                         )),

  client_id            uuid references public.clients(id) on delete set null,
  legal_process_id     uuid references public.legal_processes(id) on delete set null,
  /** Último modelo usado para gerar a minuta. */
  template_id          uuid references public.document_templates(id) on delete set null,
  /** Quem acompanha o contrato — e quem vai receber os avisos de vencimento. */
  responsible_id       uuid references public.profiles(id) on delete set null,

  total_amount         numeric(12,2) check (total_amount is null or total_amount >= 0),
  installments         integer check (installments is null or installments between 1 and 360),
  first_due_date       date,
  success_fee_percent  numeric(5,2)
                         check (success_fee_percent is null
                                or success_fee_percent between 0 and 100),

  start_date           date,
  end_date             date,
  /** Dias de antecedência do aviso de vencimento. */
  notice_days          integer not null default 30 check (notice_days between 0 and 365),
  auto_renew           boolean not null default false,
  /** Índice de reajuste como o contrato o escreve: "IPCA", "IGP-M"… */
  adjustment_index     text check (adjustment_index is null or btrim(adjustment_index) <> ''),

  /** Data da assinatura — não do clique que mudou o status. */
  signed_at            date,
  notes                text,

  created_by           uuid not null references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint chk_contracts_dates check (
    start_date is null or end_date is null or end_date >= start_date
  )
);

create index if not exists idx_contracts_client_id        on public.contracts(client_id);
create index if not exists idx_contracts_legal_process_id on public.contracts(legal_process_id);
create index if not exists idx_contracts_status           on public.contracts(status);
-- "Vencendo em 30 dias" filtra por aqui.
create index if not exists idx_contracts_end_date         on public.contracts(end_date);
create index if not exists idx_contracts_created_at       on public.contracts(created_at desc);

drop trigger if exists set_updated_at on public.contracts;
create trigger set_updated_at before update on public.contracts
  for each row execute function public.set_updated_at();

select public.apply_rbac_policies(
  'contracts',
  'contratos:view',
  'contratos:create',
  'contratos:update',
  'contratos:delete'
);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Histórico de status
--
-- Gravado por trigger, não pelo app: vale para qualquer caminho que mude o
-- status — a tela hoje, o Assistente na fase 3 — sem cada um lembrar de
-- registrar. A função é `security definer` porque quem cria um contrato pode
-- não ter `contratos:update`, e o histórico não deve depender disso. Por
-- isso a tabela não tem policy de escrita: ninguém grava nela direto.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.contract_status_changes (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references public.contracts(id) on delete cascade,
  /** Nulo na criação do contrato. */
  from_status  text,
  to_status    text not null,
  changed_by   uuid references public.profiles(id) on delete set null,
  changed_at   timestamptz not null default now()
);

create index if not exists idx_contract_status_changes_contract
  on public.contract_status_changes(contract_id, changed_at);

create or replace function public.record_contract_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.contract_status_changes (contract_id, from_status, to_status, changed_by)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists record_contract_status_change on public.contracts;
create trigger record_contract_status_change
  after insert or update of status on public.contracts
  for each row execute function public.record_contract_status_change();

select public.apply_rbac_policies(
  'contract_status_changes',
  'contratos:view',
  null,
  null,
  null
);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. Arquivos do contrato em `documents`
--
-- Mesmo desenho do anexo de lançamento (migration 63): o arquivo PERTENCE ao
-- contrato, e só a ele.
--
--   · `on delete cascade` — excluir o contrato leva as linhas junto (os
--     objetos do bucket saem pelo app, que lê os caminhos antes);
--   · exclusivo — sem cliente, processo nem lançamento ao lado. A tela herda
--     cliente e processo do contrato para mostrar o arquivo em /documentos;
--   · governado por `contratos`, não por `documentos`. Anexar é editar o
--     contrato (`:update`), como anexar a um lançamento é editar o lançamento.
--
-- `contract_file_role` diz o que o arquivo é para o contrato: a minuta, a
-- versão assinada ou um anexo (documento de parte, comprovante). Existe se e
-- somente se o arquivo é de um contrato.
--
-- ⚠️ Não reaplicar `apply_rbac_policies` em `documents` (ver migration 63).
-- ────────────────────────────────────────────────────────────────────────────

alter table public.documents
  add column if not exists contract_id uuid
    references public.contracts(id) on delete cascade;

alter table public.documents
  add column if not exists contract_file_role text
    check (contract_file_role in ('minuta', 'assinado', 'anexo'));

create index if not exists idx_documents_contract_id on public.documents(contract_id);

alter table public.documents drop constraint if exists chk_documents_contract_file_role;
alter table public.documents add constraint chk_documents_contract_file_role check (
  (contract_id is null) = (contract_file_role is null)
);

alter table public.documents drop constraint if exists chk_documents_has_parent;
alter table public.documents add constraint chk_documents_has_parent check (
  client_id is not null
  or crm_item_id is not null
  or legal_process_id is not null
  or event_id is not null
  or movement_id is not null
  or financial_entry_id is not null
  or contract_id is not null
);

-- O anexo de lançamento também não pode ser de um contrato.
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
  )
);


-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS de `documents`
--
-- As policies da migration 63 com um terceiro regime. Os vínculos são
-- exclusivos (passo 4), então no máximo um dos dois `when` vale por linha.
-- ────────────────────────────────────────────────────────────────────────────

drop policy if exists "rbac_select" on public.documents;
drop policy if exists "rbac_insert" on public.documents;
drop policy if exists "rbac_update" on public.documents;
drop policy if exists "rbac_delete" on public.documents;

create policy "rbac_select" on public.documents
  for select using (
    case
      when financial_entry_id is not null then (select public.can('financeiro', 'view'))
      when contract_id is not null then (select public.can('contratos', 'view'))
      else (select public.can('documentos', 'view'))
    end
  );

create policy "rbac_insert" on public.documents
  for insert with check (
    case
      when financial_entry_id is not null then (select public.can('financeiro', 'update'))
      when contract_id is not null then (select public.can('contratos', 'update'))
      else (select public.can('documentos', 'create'))
    end
  );

create policy "rbac_update" on public.documents
  for update
  using (
    case
      when financial_entry_id is not null then (select public.can('financeiro', 'update'))
      when contract_id is not null then (select public.can('contratos', 'update'))
      else (select public.can('documentos', 'update'))
    end
  )
  with check (
    case
      when financial_entry_id is not null then (select public.can('financeiro', 'update'))
      when contract_id is not null then (select public.can('contratos', 'update'))
      else (select public.can('documentos', 'update'))
    end
  );

create policy "rbac_delete" on public.documents
  for delete using (
    case
      when financial_entry_id is not null then (select public.can('financeiro', 'delete'))
      when contract_id is not null then (select public.can('contratos', 'delete'))
      else (select public.can('documentos', 'delete'))
    end
  );


-- ────────────────────────────────────────────────────────────────────────────
-- 6. RLS do bucket `attachments`
--
-- O mesmo mapeamento do passo 5, pela pasta: o objeto de um contrato fica em
-- `contratos/{id}/…` (buildFilePath em documents.service.ts).
-- ────────────────────────────────────────────────────────────────────────────

drop policy if exists "attachments_select" on storage.objects;
drop policy if exists "attachments_insert" on storage.objects;
drop policy if exists "attachments_delete" on storage.objects;

create policy "attachments_select" on storage.objects
  for select using (
    bucket_id = 'attachments'
    and case (storage.foldername(name))[1]
      when 'lancamentos' then (select public.can('financeiro', 'view'))
      when 'contratos' then (select public.can('contratos', 'view'))
      else (select public.can('documentos', 'view'))
    end
  );

create policy "attachments_insert" on storage.objects
  for insert with check (
    bucket_id = 'attachments'
    and case (storage.foldername(name))[1]
      when 'lancamentos' then (select public.can('financeiro', 'update'))
      when 'contratos' then (select public.can('contratos', 'update'))
      else (select public.can('documentos', 'create'))
    end
  );

create policy "attachments_delete" on storage.objects
  for delete using (
    bucket_id = 'attachments'
    and case (storage.foldername(name))[1]
      when 'lancamentos' then (select public.can('financeiro', 'delete'))
      when 'contratos' then (select public.can('contratos', 'delete'))
      else (select public.can('documentos', 'delete'))
    end
  );
