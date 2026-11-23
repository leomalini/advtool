-- ============================================================
-- 96 — COBRANÇAS: A RÉGUA DE AVISOS (fase 2 de docs/cobrancas.md)
--
-- Cada cobrança (migration 95) pode ter LEMBRETES: avisos ao cliente em dias
-- fixos em volta do vencimento. Nesta fase o envio é a fila manual — o
-- escritório abre o WhatsApp com a mensagem pronta —, e o que foi feito fica
-- registrado. A fase 5 manda pela API oficial pela mesma tabela.
--
--   · `billings`          — liga e pausa os lembretes, telefone próprio e
--                           controle dos avisos no sino;
--   · `billing_messages`  — cada aviso de cada etapa: o que aconteceu com ele;
--   · `office_settings`   — os dias da régua;
--   · `clients`           — o cliente que pediu para não receber.
--
-- QUAL aviso é devido hoje não é gravado: sai de uma função pura
-- (`src/lib/billing/schedule.ts`) a partir do vencimento, dos dias da régua e
-- do que já está em `billing_messages`. Mudar o vencimento recalcula tudo.
--
-- Depende da migration 95 (`billings`).
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. `billings` — lembretes
--
-- `reminders_enabled_at` é o dia da etapa "ao criar" e o corte das etapas: o
-- que caiu antes de ligar não é mandado depois.
--
-- `click_alert_for` e `ended_alert_for` guardam PARA QUE o aviso no sino já
-- saiu (o clique, o vencimento): um clique novo, ou um vencimento novo, avisa
-- de novo; o mesmo não.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.billings
  add column if not exists reminders_enabled boolean not null default false,
  add column if not exists reminders_enabled_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists recipient_phone text,
  add column if not exists click_alert_for timestamptz,
  add column if not exists ended_alert_for date;

alter table public.billings
  drop constraint if exists billings_reminders_have_start;
alter table public.billings
  add constraint billings_reminders_have_start
    check (not reminders_enabled or reminders_enabled_at is not null);

-- Celular brasileiro em E.164, o formato que o WhatsApp usa.
alter table public.billings
  drop constraint if exists billings_recipient_phone_e164;
alter table public.billings
  add constraint billings_recipient_phone_e164
    check (recipient_phone is null or recipient_phone ~ '^\+55[0-9]{10,11}$');

comment on column public.billings.reminders_enabled is
  'Lembretes ao cliente nos dias da régua (office_settings.billing_reminder_offsets).';
comment on column public.billings.recipient_phone is
  'Telefone dos lembretes desta cobrança, no lugar do contato principal do cliente.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. `billing_messages` — cada aviso
--
-- `step`: 'created' (ao ligar), 'd-7', 'd0', 'd+2'… (dias do vencimento) ou
-- 'resend' (mandado de novo à mão, fora da régua). `due_date` é o vencimento
-- da época: se ele mudar, as etapas recomeçam.
--
-- O índice único é o que impede o mesmo aviso duas vezes — o clique duplo na
-- fila hoje, e o envio automático da fase 5 amanhã. `resend` fica fora dele.
--
-- `status`: 'manual' é "aberto no WhatsApp pelo escritório", sem a pretensão
-- de saber se chegou; 'skipped' é "não mandar este". Os demais são da fase 5.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.billing_messages (
  id                   uuid primary key default gen_random_uuid(),
  billing_id           uuid not null references public.billings(id) on delete cascade,
  step                 text not null check (step ~ '^(created|resend|d0|d[+-][0-9]{1,3})$'),
  due_date             date not null,
  channel              text not null check (channel in ('whatsapp', 'email')),
  status               text not null check (status in (
    'pending', 'sent', 'delivered', 'read', 'failed', 'skipped', 'manual'
  )),
  provider_message_id  text,
  error                text,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.billing_messages is
  'Avisos da régua de cobrança: o que aconteceu com cada etapa (docs/cobrancas.md).';

create unique index if not exists idx_billing_messages_once
  on public.billing_messages(billing_id, step, due_date, channel)
  where step <> 'resend';

create index if not exists idx_billing_messages_billing
  on public.billing_messages(billing_id, created_at desc);

drop trigger if exists set_updated_at on public.billing_messages;
create trigger set_updated_at before update on public.billing_messages
  for each row execute function public.set_updated_at();

-- Como `billings`: a tela lê, o servidor grava depois de conferir a permissão.
select public.apply_rbac_policies(
  'billing_messages',
  'financeiro:view', null, null, null
);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Os dias da régua
--
-- Dias em relação ao vencimento: negativo antes, 0 no dia, positivo depois. O
-- padrão é o aprovado no plano: 7 e 2 antes, no dia, 2, 7 e 15 depois. A etapa
-- "ao criar" não entra aqui — ela sai sempre, ao ligar.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.office_settings
  add column if not exists billing_reminder_offsets integer[] not null
    default '{-7,-2,0,2,7,15}';

alter table public.office_settings
  drop constraint if exists office_settings_billing_reminder_offsets_check;
alter table public.office_settings
  add constraint office_settings_billing_reminder_offsets_check check (
    cardinality(billing_reminder_offsets) between 1 and 10
    and -30 <= all (billing_reminder_offsets)
    and 60 >= all (billing_reminder_offsets)
  );

comment on column public.office_settings.billing_reminder_offsets is
  'Dias da régua de cobrança em relação ao vencimento (negativo = antes).';


-- ────────────────────────────────────────────────────────────────────────────
-- 4. O cliente que pediu para não receber
--
-- Vale para todas as cobranças dele: a régua para, a página continua. A Meta
-- exige o consentimento para mensagens, e esta é a saída para quem pedir.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.clients
  add column if not exists billing_reminders_opt_out boolean not null default false;

comment on column public.clients.billing_reminders_opt_out is
  'O cliente pediu para não receber lembretes de cobrança.';
