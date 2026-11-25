-- ============================================================
-- 98 — COBRANÇAS: MENSALIDADES (fase 4 de docs/cobrancas.md)
--
-- Uma mensalidade é um valor que o cliente paga todo mês, no mesmo dia. Ela
-- não é cobrada sozinha: o cron diário MATERIALIZA cada ciclo — um lançamento
-- de receita com a cobrança (`billings`, migration 95) no ar — alguns dias antes
-- do vencimento. Daí em diante o ciclo é um lançamento como outro qualquer: a
-- régua, a página, a baixa, multa, juros e desconto valem iguais.
--
--   · `billing_series`    — a mensalidade: cliente, valor, dia, início e fim;
--   · `financial_entries` — `billing_series_id`, um lançamento por ciclo.
--
-- Editar a série não reescreve os ciclos já gerados (como editar o contrato
-- não reescreve as parcelas). Sem planos, sem link de inscrição e sem valor
-- proporcional (decisão do plano).
--
-- Depende das migrations 21, 95 e 97.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. `billing_series`
--
-- O dia do vencimento é o de `start_date`, o primeiro vencimento: cada ciclo é
-- `start_date` + N meses, contado sempre da âncora — o dia 31 vira 28/02 e
-- volta a 31/03 (`addMonthsISO`).
--
-- `generate_from`: o primeiro vencimento que ainda pode ser gerado. Nasce igual
-- a `start_date`; retomar uma série pausada o empurra para hoje, e os ciclos
-- da pausa não voltam.
--
-- Os percentuais são os da cobrança de cada ciclo (migration 97).
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.billing_series (
  id                        uuid primary key default gen_random_uuid(),
  client_id                 uuid not null references public.clients(id) on delete cascade,
  legal_process_id          uuid references public.legal_processes(id) on delete set null,
  contract_id               uuid references public.contracts(id) on delete set null,

  /** Interna: vira a descrição de cada lançamento, com o mês. */
  description               text not null check (
    btrim(description) <> '' and char_length(description) <= 250
  ),
  /** O que o cliente lê, com o mês ("Honorários mensais — 12/2026"). */
  client_description        text not null check (
    btrim(client_description) <> '' and char_length(client_description) <= 110
  ),
  category                  text not null default 'honorario'
                              check (category in ('honorario', 'custas', 'pericia', 'outros')),
  /** A partir de R$ 1,00: o mínimo da InfinitePay. */
  amount                    numeric(12,2) not null check (amount >= 1),

  start_date                date not null,
  end_date                  date check (end_date is null or end_date >= start_date),
  generate_from             date not null,

  reminders_enabled         boolean not null default true,
  late_fee_percent          numeric(5,2)
                              check (late_fee_percent is null
                                     or late_fee_percent between 0 and 100),
  monthly_interest_percent  numeric(5,2)
                              check (monthly_interest_percent is null
                                     or monthly_interest_percent between 0 and 100),
  pix_discount_percent      numeric(4,2)
                              check (pix_discount_percent is null
                                     or (pix_discount_percent > 0 and pix_discount_percent < 100)),

  paused_at                 timestamptz,
  ended_at                  timestamptz,
  ended_by                  uuid references public.profiles(id),

  created_by                uuid not null references public.profiles(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint billing_series_generate_after_start check (generate_from >= start_date)
);

comment on table public.billing_series is
  'Mensalidade: o cron gera um lançamento com cobrança por mês (docs/cobrancas.md, fase 4).';

create index if not exists idx_billing_series_client on public.billing_series(client_id);

drop trigger if exists set_updated_at on public.billing_series;
create trigger set_updated_at before update on public.billing_series
  for each row execute function public.set_updated_at();

-- Só leitura pela tela, como `billings`: quem grava é o servidor, depois de
-- conferir a permissão com o client de sessão.
select public.apply_rbac_policies(
  'billing_series',
  'financeiro:view', null, null, null
);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. O ciclo é um lançamento
--
-- Um por série e vencimento: o índice único é o que impede o cron (ou dois
-- disparos juntos) de gerar o mesmo mês duas vezes. Excluir a série não apaga
-- os ciclos — eles são lançamentos, e podem estar pagos.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.financial_entries
  add column if not exists billing_series_id uuid
    references public.billing_series(id) on delete set null;

create unique index if not exists idx_financial_entries_series_cycle
  on public.financial_entries(billing_series_id, due_date)
  where billing_series_id is not null;

comment on column public.financial_entries.billing_series_id is
  'Mensalidade que gerou este lançamento (migration 98).';
