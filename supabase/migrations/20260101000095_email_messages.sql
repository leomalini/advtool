-- ============================================================
-- 95 — E-MAILS PARA CLIENTES: REGISTRO E BLOQUEIOS
--
-- Plano: docs/emails-clientes.md, PR 1.
--
-- O app passa a mandar e-mail ao cliente (link do portal agora; resumo
-- diário, cobrança e mensagem avulsa nos PRs seguintes). Duas tabelas:
--
--   · `email_messages`    — cada e-mail, do pedido ao destino final. A linha
--                           nasce `queued` ANTES da chamada ao Resend (o
--                           mesmo padrão de `payment_charges`, migration 67),
--                           e guarda o HTML e o texto exatamente como saíram:
--                           numa reclamação, "o que dissemos ao cliente" tem
--                           que ter resposta literal.
--   · `email_suppressions` — endereço que recusou (bounce permanente), marcou
--                           como spam ou que o próprio Resend bloqueou. Não
--                           recebe mais nada, de nenhum tipo.
--
-- ── Quem lê ──
-- O recurso exigido varia por linha, como em `notifications` (migration 47):
-- e-mail de cobrança exige `financeiro:view`; os de cliente, `clientes:view`;
-- o de teste, `configuracoes:view`. Aqui a lista de recursos é fechada (CHECK),
-- então a policy pode testar cada um com `(select can(...))` — avaliado uma
-- vez por consulta (InitPlan), e não uma vez por linha como seria
-- `can(resource, 'view')`.
--
-- ── Quem escreve ──
-- Só a service_role das rotas do servidor, depois de conferir a permissão com
-- o client de sessão (`requirePermissionApi`). Nenhuma policy de escrita: a
-- tela não inventa e-mail enviado nem muda status.
--
-- ── GRANTs explícitos ──
-- As tabelas anteriores contam com a exposição automática do projeto aos
-- papéis da API. O `config.toml` avisa que esse comportamento está saindo;
-- conceder aqui é inofensivo onde ele ainda vale e necessário onde não vale.
-- ============================================================


-- ── 1. email_messages ───────────────────────────────────────────────────────

create table if not exists public.email_messages (
  id                   uuid primary key default gen_random_uuid(),

  /** O que é. Os tipos dos PRs seguintes já entram aqui para não pedir
   * migration só para alargar o CHECK. */
  kind                 text not null check (kind in (
                         'process_digest', 'portal_link', 'payment_link',
                         'payment_reminder', 'payment_confirmed', 'custom_message',
                         'test')),

  /** Recurso do RBAC exigido para ver a linha. */
  resource             text not null check (resource in ('clientes', 'financeiro', 'configuracoes')),

  client_id            uuid references public.clients(id) on delete set null,
  payment_charge_id    uuid references public.payment_charges(id) on delete set null,

  /** O destinatário pretendido — o e-mail do cadastro do cliente. */
  to_address           text not null check (btrim(to_address) <> ''),
  /** Preenchido quando `EMAIL_SANDBOX_TO` desviou o envio: para onde foi de
   * fato. Nulo em produção. É o que impede o histórico de afirmar que o
   * cliente recebeu um e-mail que só chegou à caixa de teste. */
  sandbox_to           text,

  subject              text not null check (btrim(subject) <> ''),
  html                 text not null,
  text_body            text not null,

  status               text not null default 'queued' check (status in (
                         'queued',      -- gravado, ainda não aceito pelo Resend
                         'sent',        -- aceito pelo Resend
                         'delivered',   -- o servidor do destinatário aceitou
                         'delayed',     -- entrega atrasada, o Resend segue tentando
                         'bounced',     -- recusado pelo servidor do destinatário
                         'complained',  -- o destinatário marcou como spam
                         'failed',      -- não saiu (erro nosso ou do Resend)
                         'suppressed'   -- não saiu: endereço bloqueado
                       )),
  /** `email_id` do Resend. É por ele que o webhook acha a linha. */
  provider_message_id  text unique,
  /** Motivo legível de `failed`, `bounced` e `suppressed`. */
  error                text,

  /** Barra o mesmo envio automático duas vezes ('process_digest:<cliente>:<dia>').
   * Nulo nos envios manuais: reenviar o link de propósito é permitido. */
  dedupe_key           text unique,

  /** Quem pediu. Nulo = automático (cron, webhook). */
  sent_by              uuid references public.profiles(id) on delete set null,

  created_at           timestamptz not null default now(),
  sent_at              timestamptz,
  delivered_at         timestamptz,
  updated_at           timestamptz not null default now(),

  constraint email_messages_error_when_failed
    check (status not in ('failed', 'suppressed') or error is not null),
  constraint email_messages_provider_id_once_sent
    check (status in ('queued', 'failed', 'suppressed') or provider_message_id is not null)
);

comment on table public.email_messages is
  'Cada e-mail mandado a cliente, com o conteúdo exato que saiu. Escrita só '
  'pela service_role (src/lib/email/send.ts). Plano: docs/emails-clientes.md.';

-- A aba E-mails da ficha do cliente: os de um cliente, do mais recente.
create index if not exists idx_email_messages_client
  on public.email_messages(client_id, created_at desc)
  where client_id is not null;

-- A lista de Configurações → E-mail: os últimos de todos.
create index if not exists idx_email_messages_created
  on public.email_messages(created_at desc);

drop trigger if exists set_updated_at on public.email_messages;
create trigger set_updated_at before update on public.email_messages
  for each row execute function public.set_updated_at();

alter table public.email_messages enable row level security;

drop policy if exists rbac_select on public.email_messages;
create policy rbac_select on public.email_messages
  for select using (
    (resource = 'clientes'      and (select public.can('clientes', 'view')))
    or (resource = 'financeiro'    and (select public.can('financeiro', 'view')))
    or (resource = 'configuracoes' and (select public.can('configuracoes', 'view')))
  );

grant select on public.email_messages to authenticated;
grant select, insert, update, delete on public.email_messages to service_role;


-- ── 2. email_suppressions ───────────────────────────────────────────────────

create table if not exists public.email_suppressions (
  /** Sempre `lower(btrim(...))` — gravado assim por `src/lib/email/address.ts`. */
  address            text primary key check (address = lower(btrim(address)) and address <> ''),
  reason             text not null check (reason in (
                       'bounce',     -- recusa permanente do servidor do destinatário
                       'complaint',  -- marcado como spam
                       'provider'    -- o Resend já tinha o endereço na lista dele
                     )),
  /** O e-mail que provocou o bloqueio, para a tela mostrar o porquê. */
  source_message_id  uuid references public.email_messages(id) on delete set null,
  detail             text,
  created_at         timestamptz not null default now()
);

comment on table public.email_suppressions is
  'Endereços que não recebem mais e-mail do app (bounce permanente, spam ou '
  'bloqueio do Resend). Gravado pelo webhook do Resend.';

-- Quem vê clientes vê por que um cliente não recebe e-mail. Desbloquear é
-- ação de servidor (sem policy de escrita) — fica para quando houver a tela.
select public.apply_rbac_policies(
  'email_suppressions',
  'clientes:view', null, null, null
);

grant select on public.email_suppressions to authenticated;
grant select, insert, update, delete on public.email_suppressions to service_role;
