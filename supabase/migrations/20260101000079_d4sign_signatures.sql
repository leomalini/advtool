-- ============================================================
-- 79 — ASSINATURA ELETRÔNICA PELA D4SIGN (fase 1: a fundação)
--
-- Plano: `docs/integracao-d4sign.md`.
--
-- Um arquivo de `documents` (a minuta de um contrato, uma procuração) vai para
-- assinatura na D4Sign. Quando todos assinam, o PDF assinado volta para o app.
-- A D4Sign guarda a via legal; o Supabase continua dono dos arquivos.
--
--   · `office_settings.d4sign_*`        — o cofre de cada tipo de envio, os
--                                         recursos do plano e o último saldo;
--   · `signature_requests`              — um envio;
--   · `signature_signers`               — quem assina;
--   · `d4sign_folders`                  — a pasta de cada cliente no cofre;
--   · `contract_status_changes.source`  — o histórico reconhece a mudança
--                                         feita pela D4Sign.
--
-- ⚠️ Escrita ANTES do spike no sandbox, a pedido. Só aplicar depois dele: a
-- resposta real da API ainda pode mudar colunas de `signature_signers`.
--
-- Depende das migrations 66 (`office_settings`), 69 (`contracts`,
-- `contract_status_changes`) e 70 (`contract_parties`).
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. A conta
--
-- Nada aqui é segredo: o token e a cryptKey ficam nas variáveis de ambiente, e
-- sem eles o UUID de um cofre não abre nada. Por isso mora na linha do
-- escritório e segue as policies dela: todos leem, `configuracoes:manage`
-- grava. O saldo é gravado pelo servidor (service_role), depois de conferir a
-- mesma permissão — é resposta da D4Sign, não digitação.
--
-- `d4sign_safes`: o escritório organiza a D4Sign com um cofre por tipo de
-- documento (spike, 2026-10-22). O mapa diz para que cofre vai cada tipo de
-- envio — `{"contrato_honorarios": {"uuid": …, "name": …}, …, "padrao": …}` —
-- e quem envia pode trocar. Tipo ausente usa o `padrao`.
--
-- Não há coluna de webhook: ele é registrado em cada documento, no envio. Com
-- 15 cofres, registrar um por cofre esbarraria no limite de chamadas.
--
-- `d4sign_features`: a API não informa o plano, então quem administra liga
-- aqui o que a conta tem (`whatsapp`, `pix`, `selfie`, `video_selfie`,
-- `score`, `icp`, `embed`). Chave ausente é recurso desligado.
--
-- O saldo (`GET /account/balance`) gasta uma das 10 chamadas por hora: o
-- último valor lido fica guardado, com a hora da leitura.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.office_settings
  add column if not exists d4sign_safes jsonb not null default '{}'::jsonb,
  add column if not exists d4sign_features jsonb not null default '{}'::jsonb,
  add column if not exists d4sign_balance_credit integer,
  add column if not exists d4sign_balance_sent integer,
  add column if not exists d4sign_balance_checked_at timestamptz;

alter table public.office_settings drop constraint if exists office_settings_d4sign_safes_object;
alter table public.office_settings add constraint office_settings_d4sign_safes_object check (
  jsonb_typeof(d4sign_safes) = 'object'
);

alter table public.office_settings drop constraint if exists office_settings_d4sign_features_object;
alter table public.office_settings add constraint office_settings_d4sign_features_object check (
  jsonb_typeof(d4sign_features) = 'object'
);

comment on column public.office_settings.d4sign_safes is
  'Cofre da D4Sign de cada tipo de envio ({"contrato_honorarios": {"uuid", "name"}, '
  '…, "padrao"}). O envio sugere e deixa trocar; cada envio guarda o cofre usado '
  '(signature_requests.safe_uuid).';
comment on column public.office_settings.d4sign_features is
  'Recursos que o plano da D4Sign libera, ligados à mão: a API não informa o plano.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. `signature_requests` — um envio
--
-- `contract_id` diz se o envio é de um contrato — e com isso qual permissão
-- governa a linha, como em `documents` (migration 69). `client_id` é o
-- cliente do contrato ou do documento: escolhe a pasta na D4Sign e é por onde
-- o portal acha o que mostrar.
--
-- O ciclo:
--   preparing → sent       upload, signatários e envio aceitos pela D4Sign
--   preparing → failed     um passo falhou; `failed_step` diz qual, e "Tentar
--                          de novo" continua dali
--   failed    → preparing  nova tentativa
--   sent      → signed     a API confirmou a fase "Finalizado"
--   sent      → canceled   cancelado aqui, no painel ou pelo prazo vencido
--
-- `external_id` é o UUID do documento na D4Sign — é por ele que o webhook acha
-- o envio. Nulo até o upload.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.signature_requests (
  id                  uuid primary key default gen_random_uuid(),

  provider            text not null default 'd4sign' check (provider = 'd4sign'),

  /** O arquivo enviado. `set null`: o histórico fica mesmo que o arquivo
   * saia — com o envio aberto, sair é barrado no passo 6. */
  document_id         uuid references public.documents(id) on delete set null,
  /** Excluir o contrato leva o histórico junto, como já leva os arquivos. Com
   * envio aberto, a exclusão é barrada no passo 6. */
  contract_id         uuid references public.contracts(id) on delete cascade,
  client_id           uuid references public.clients(id) on delete set null,

  external_id         text unique,
  safe_uuid           text,
  folder_uuid         text,
  /** O nome do documento na D4Sign. */
  title               text not null check (btrim(title) <> ''),

  status              text not null default 'preparing' check (status in (
    'preparing', 'sent', 'signed', 'canceled', 'failed'
  )),
  failed_step         text check (failed_step in ('folder', 'upload', 'webhook', 'signers', 'send')),

  /** Assinam na ordem da lista (`workflow` da D4Sign). */
  ordered             boolean not null default false,
  message             text,
  /** `sign_limit_date`: passado o dia, a D4Sign cancela sozinha. */
  deadline            date,

  /** A cópia assinada, já no nosso Storage. */
  signed_document_id  uuid references public.documents(id) on delete set null,

  sent_at             timestamptz,
  finished_at         timestamptz,
  canceled_at         timestamptz,
  cancel_reason       text,
  /** O último erro, sem credenciais. */
  error               text,

  created_by          uuid not null references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint signature_requests_failed_has_step
    check ((status = 'failed') = (failed_step is not null)),
  constraint signature_requests_sent_has_external_id
    check (status in ('preparing', 'failed') or external_id is not null),
  constraint signature_requests_canceled_has_date
    check (status <> 'canceled' or canceled_at is not null)
);

comment on table public.signature_requests is
  'Arquivo enviado para assinatura na D4Sign. external_id é o UUID do documento lá.';

/** Um envio aberto por arquivo. O clique duplo bate aqui antes de gastar um
 * dos 20 envios do mês. */
create unique index if not exists idx_signature_requests_one_open_per_document
  on public.signature_requests(document_id)
  where status in ('preparing', 'sent');

create index if not exists idx_signature_requests_document
  on public.signature_requests(document_id);
create index if not exists idx_signature_requests_contract
  on public.signature_requests(contract_id);
create index if not exists idx_signature_requests_client
  on public.signature_requests(client_id);

drop trigger if exists set_updated_at on public.signature_requests;
create trigger set_updated_at before update on public.signature_requests
  for each row execute function public.set_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- 3. `signature_signers` — quem assina
--
-- O retrato do que foi enviado: nome, e-mail e documento como estavam no
-- envio. Os vínculos dizem de onde o signatário veio e ficam `set null` — o
-- envio continua contando a mesma história se a parte ou o cliente mudarem.
--
-- `auth_requested` × `auth_applied`: uma combinação inválida de autenticação
-- não dá erro na D4Sign, ela aplica a regra dela e devolve o que valeu. A tela
-- mostra o aplicado.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.signature_signers (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references public.signature_requests(id) on delete cascade,
  /** Ordem na lista — a de assinatura, quando o envio segue a ordem. */
  position           integer not null check (position >= 1),

  name               text not null check (btrim(name) <> ''),
  email              text not null check (email ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
  /** CPF ou CNPJ, só dígitos. Pix e biometria pedem o CPF. */
  document           text check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$'),
  /** Celular no formato internacional (+5527999998888), quando o link também
   * vai pelo WhatsApp. */
  whatsapp_number    text check (whatsapp_number is null or whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  /** Papel na D4Sign: 1 assinar, 4 parte, 5 testemunha, 6 interveniente,
   * 10 fiador… (tabela em docs/integracao-d4sign.md). */
  act                smallint not null check (act between 1 and 13),

  contract_party_id  uuid references public.contract_parties(id) on delete set null,
  /** Quando é um cliente — é por aqui que o portal acha o que mostrar. */
  client_id          uuid references public.clients(id) on delete set null,
  /** Quando é alguém do escritório (o advogado que assina pelo contratado). */
  profile_id         uuid references public.profiles(id) on delete set null,

  auth_requested     jsonb not null default '{}'::jsonb,
  auth_applied       jsonb,
  /** Assina pelo portal (Embed). */
  via_portal         boolean not null default false,
  /** A chave do signatário na D4Sign — reenvio do link e Embed. */
  key_signer         text,

  status             text not null default 'pending'
                       check (status in ('pending', 'signed', 'email_failed')),
  signed_at          timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint signature_signers_unique_position unique (request_id, position),
  constraint signature_signers_auth_requested_object
    check (jsonb_typeof(auth_requested) = 'object'),
  constraint signature_signers_auth_applied_object
    check (auth_applied is null or jsonb_typeof(auth_applied) = 'object'),
  constraint signature_signers_signed_has_date
    check (status <> 'signed' or signed_at is not null)
);

comment on table public.signature_signers is
  'Signatário de um envio à D4Sign, com o retrato do que foi enviado.';

-- O portal procura os pendentes do cliente da sessão.
create index if not exists idx_signature_signers_portal
  on public.signature_signers(client_id)
  where via_portal;

drop trigger if exists set_updated_at on public.signature_signers;
create trigger set_updated_at before update on public.signature_signers
  for each row execute function public.set_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- 4. `d4sign_folders` — uma pasta por cliente em cada cofre
--
-- Criada no primeiro envio do cliente para aquele cofre (os cofres são por
-- tipo: "Procurações/Maria Silva", "Contratos de Honorários/Maria Silva"). O
-- vínculo é pelo `client_id`, não pelo nome: dois clientes homônimos ganham
-- duas pastas. O contrato do escritório vai para "Escritório"; o documento sem
-- cliente, para "Sem cliente".
--
-- Excluir o cliente apaga só o vínculo. A pasta e o que está nela continuam na
-- D4Sign: lá fica a via legal, e o app nunca apaga nada no cofre.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.d4sign_folders (
  id           uuid primary key default gen_random_uuid(),
  safe_uuid    text not null,
  kind         text not null check (kind in ('cliente', 'escritorio', 'sem_cliente')),
  client_id    uuid references public.clients(id) on delete cascade,
  folder_uuid  text not null,
  /** O nome dado na criação ou no último renomear — mudou o nome do cliente,
   * a pasta é renomeada no envio seguinte. */
  folder_name  text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint d4sign_folders_client_kind check ((kind = 'cliente') = (client_id is not null))
);

create unique index if not exists idx_d4sign_folders_owner
  on public.d4sign_folders(safe_uuid, kind, client_id) nulls not distinct;

drop trigger if exists set_updated_at on public.d4sign_folders;
create trigger set_updated_at before update on public.d4sign_folders
  for each row execute function public.set_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- 5. Histórico de status: quem mudou pode ser a D4Sign
--
-- Quando todos assinam, o servidor marca o contrato como vigente pela
-- service_role, sem `auth.uid()`: o histórico mostraria uma mudança sem
-- autor. A função de finalização (fase 2) põe `app.status_change_source` na
-- transação, e o trigger grava esse valor em `source`.
--
-- Nenhum caminho da API pública grava a configuração: `set_config` não é
-- exposta pelo PostgREST, então a tela não consegue se passar pela D4Sign.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.contract_status_changes
  add column if not exists source text check (source is null or btrim(source) <> '');

comment on column public.contract_status_changes.source is
  'Quem mudou o status quando não foi uma pessoa pela tela: ''d4sign''. Nulo = changed_by.';

create or replace function public.record_contract_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.contract_status_changes
      (contract_id, from_status, to_status, changed_by, source)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      auth.uid(),
      nullif(current_setting('app.status_change_source', true), '')
    );
  end if;
  return new;
end;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. Travas: nada some com o envio aberto
--
-- Excluir o arquivo que está na D4Sign, ou o contrato dele, deixaria um
-- documento circulando para assinatura sem registro aqui — e o webhook da
-- finalização sem onde gravar. Primeiro se cancela o envio.
--
-- Mesmo desenho da trava da migration 67: `security definer` para a consulta
-- não depender do que quem exclui enxerga, e `PT409` para a tela reconhecer a
-- recusa e mostrar a mensagem.
--
-- Mudar o status de um contrato com envio aberto não é travado aqui: a tela
-- avisa e oferece cancelar o envio.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_open_signature_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open boolean;
begin
  if tg_table_name = 'documents' then
    select exists (
      select 1
        from public.signature_requests r
       where r.document_id = old.id
         and r.status in ('preparing', 'sent')
    ) into v_open;
  else
    select exists (
      select 1
        from public.signature_requests r
       where r.contract_id = old.id
         and r.status in ('preparing', 'sent')
    ) into v_open;
  end if;

  if v_open then
    raise exception using
      errcode = 'PT409',
      message = case tg_table_name
        when 'documents' then 'Este arquivo está em assinatura na D4Sign e não pode ser excluído.'
        else 'Este contrato tem um envio em assinatura na D4Sign e não pode ser excluído.'
      end,
      hint = 'Cancele o envio antes de excluir.';
  end if;

  return old;
end;
$$;

comment on function public.guard_open_signature_requests() is
  'Recusa excluir arquivo ou contrato com envio aberto na D4Sign (migration 79). '
  'Erro com SQLSTATE PT409.';

drop trigger if exists guard_open_signature_requests on public.documents;
create trigger guard_open_signature_requests
  before delete on public.documents
  for each row execute function public.guard_open_signature_requests();

drop trigger if exists guard_open_signature_requests on public.contracts;
create trigger guard_open_signature_requests
  before delete on public.contracts
  for each row execute function public.guard_open_signature_requests();


-- ────────────────────────────────────────────────────────────────────────────
-- 7. RLS
--
-- A tela LÊ envios e signatários; quem ESCREVE é sempre o servidor, depois de
-- conferir a permissão com o client de sessão (`requireApiPermission`) — o
-- desenho da migration 67. Uma policy de update aberta deixaria a tela pular
-- de `sent` para `signed` sem assinatura nenhuma.
--
-- A leitura segue o regime do arquivo, como `documents` (migration 69):
-- envio de contrato com `contratos:view`, o resto com `documentos:view`. O
-- signatário segue o envio — a subconsulta passa pela RLS de
-- `signature_requests`.
--
-- `d4sign_folders` não tem policy: só o servidor usa.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.signature_requests enable row level security;

drop policy if exists "rbac_select" on public.signature_requests;
create policy "rbac_select" on public.signature_requests
  for select using (
    case
      when contract_id is not null then (select public.can('contratos', 'view'))
      else (select public.can('documentos', 'view'))
    end
  );

alter table public.signature_signers enable row level security;

drop policy if exists "rbac_select" on public.signature_signers;
create policy "rbac_select" on public.signature_signers
  for select using (
    exists (select 1 from public.signature_requests r where r.id = request_id)
  );

alter table public.d4sign_folders enable row level security;
