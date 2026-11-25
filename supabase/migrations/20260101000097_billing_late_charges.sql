-- ============================================================
-- 97 — COBRANÇAS: MULTA, JUROS E DESCONTO NO PIX (fase 3 de docs/cobrancas.md)
--
-- Depois do vencimento, a página `/pagar/<token>` cobra o valor do dia:
-- principal + multa + juros. Até o vencimento, o Pix pode ter desconto. Os
-- percentuais nascem no contrato e são copiados para a cobrança, onde dá para
-- trocar.
--
--   · `contracts`         — multa e juros que o contrato prevê;
--   · `billings`          — os percentuais desta cobrança, e o desconto no Pix;
--   · `payment_charges`   — a composição do link gerado no clique;
--   · `financial_entries` — categoria "Encargos" (lançamento próprio, ligado ao
--                           original) e o desconto recebido;
--   · a trava da migration 67 (refeita na 95) aceita o desconto na baixa.
--
-- A CONTA não é gravada em lugar nenhum além do link: sai de uma função pura
-- (`src/lib/billing/lateCharges.ts`), a mesma na tela, na página e na mensagem.
--
-- Depende das migrations 67, 69 e 95.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Percentuais
--
-- Multa: uma vez, sobre o principal. Juros: ao mês, simples, por dia corrido
-- (1/30 do mensal por dia). O sistema aplica o que o contrato disser, sem
-- conferir limite legal (docs/cobrancas.md → Em aberto).
--
-- Desconto no Pix: só até o vencimento; maior que 0 e menor que 100, como a
-- InfinitePay exige em `options.discounts`.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.contracts
  add column if not exists late_fee_percent numeric(5,2)
    check (late_fee_percent is null or late_fee_percent between 0 and 100),
  add column if not exists monthly_interest_percent numeric(5,2)
    check (monthly_interest_percent is null or monthly_interest_percent between 0 and 100);

comment on column public.contracts.late_fee_percent is
  'Multa por atraso prevista no contrato, em % do valor da parcela (uma vez).';
comment on column public.contracts.monthly_interest_percent is
  'Juros de mora previstos no contrato, em % ao mês (simples, por dia corrido).';

alter table public.billings
  add column if not exists late_fee_percent numeric(5,2)
    check (late_fee_percent is null or late_fee_percent between 0 and 100),
  add column if not exists monthly_interest_percent numeric(5,2)
    check (monthly_interest_percent is null or monthly_interest_percent between 0 and 100),
  add column if not exists pix_discount_percent numeric(4,2)
    check (pix_discount_percent is null
           or (pix_discount_percent > 0 and pix_discount_percent < 100));

comment on column public.billings.late_fee_percent is
  'Multa desta cobrança (copiada do contrato ao criar). Null = sem multa.';
comment on column public.billings.monthly_interest_percent is
  'Juros ao mês desta cobrança (copiados do contrato ao criar). Null = sem juros.';
comment on column public.billings.pix_discount_percent is
  'Desconto no Pix até o vencimento. Null = sem desconto.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. A composição do link
--
-- O preço do link (`amount_cents`) é principal + multa + juros. Links de antes
-- desta migration ficam com a composição nula: eram só o principal.
-- `pix_discount_percent` é o desconto que foi no link — é ele que a baixa usa
-- para aceitar um Pix abaixo do preço (o `payment_check` devolve `amount` cheio
-- e `paid_amount` com desconto; medido em 2026-11-23).
-- ────────────────────────────────────────────────────────────────────────────

alter table public.payment_charges
  add column if not exists principal_cents bigint
    check (principal_cents is null or principal_cents > 0),
  add column if not exists late_fee_cents bigint not null default 0 check (late_fee_cents >= 0),
  add column if not exists interest_cents bigint not null default 0 check (interest_cents >= 0),
  add column if not exists pix_discount_percent numeric(4,2)
    check (pix_discount_percent is null
           or (pix_discount_percent > 0 and pix_discount_percent < 100));

alter table public.payment_charges
  drop constraint if exists payment_charges_composition_sums;
alter table public.payment_charges
  add constraint payment_charges_composition_sums
    check (principal_cents is null
           or principal_cents + late_fee_cents + interest_cents = amount_cents);

-- Desconto e encargo no mesmo link confundiriam o cliente e a conta.
alter table public.payment_charges
  drop constraint if exists payment_charges_discount_xor_charges;
alter table public.payment_charges
  add constraint payment_charges_discount_xor_charges
    check (pix_discount_percent is null or late_fee_cents + interest_cents = 0);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Lançamentos: Encargos e desconto
--
-- Os encargos pagos viram um lançamento PRÓPRIO, categoria `encargos`, ligado
-- ao original por `parent_entry_id`: o original não muda de valor, e todo
-- número do Financeiro continua sendo soma de linhas. Um por original — o
-- índice único segura a reentrega do webhook.
--
-- O desconto no Pix: na baixa, `amount` passa a ser o valor recebido e
-- `discount_amount` guarda a diferença. A conferência do contrato soma os dois.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.financial_entries
  drop constraint financial_entries_category_check,
  add constraint financial_entries_category_check
    check (category in ('honorario', 'exito', 'custas', 'pericia', 'encargos', 'outros'));

alter table public.financial_entries
  add column if not exists parent_entry_id uuid
    references public.financial_entries(id) on delete restrict,
  add column if not exists discount_amount numeric(12,2) not null default 0
    check (discount_amount >= 0);

alter table public.financial_entries
  drop constraint if exists financial_entries_parent_only_charges;
alter table public.financial_entries
  add constraint financial_entries_parent_only_charges
    check (parent_entry_id is null or category = 'encargos');

create unique index if not exists idx_financial_entries_charges_once
  on public.financial_entries(parent_entry_id)
  where parent_entry_id is not null;

comment on column public.financial_entries.parent_entry_id is
  'Encargos (multa e juros) pagos junto com este lançamento original (migration 97).';
comment on column public.financial_entries.discount_amount is
  'Desconto concedido no pagamento (Pix até o vencimento): amount + discount_amount é o '
  'valor original (migration 97).';


-- ────────────────────────────────────────────────────────────────────────────
-- 4. A trava, com a exceção do desconto
--
-- O valor de lançamento com link vivo ou pago não muda (migration 67). A baixa
-- de um Pix com desconto precisa mudar: `amount` vira o recebido e
-- `discount_amount` a diferença, com a SOMA igual. Só o servidor faz isso (a
-- service_role, na confirmação do pagamento, e o registro do estorno, que
-- devolve o valor): pela API do usuário a troca continua barrada.
-- O resto da função é o da migration 95.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_financial_entry_charges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live boolean;
  v_paid boolean;
  v_discount_shift boolean;
begin
  select coalesce(bool_or(
           c.status in ('creating', 'open')
           and (c.expires_at is null or c.expires_at > now())
         ), false),
         coalesce(bool_or(c.status = 'paid'), false)
    into v_live, v_paid
    from public.payment_charges c
   where c.financial_entry_id = old.id;

  if tg_op = 'DELETE' then
    if v_live or v_paid then
      raise exception using
        errcode = 'PT409',
        message = 'Este lançamento tem link de pagamento em aberto ou pagamento recebido '
                  || 'pela InfinitePay e não pode ser excluído.',
        hint    = 'Cancele o link antes de excluir. Lançamento pago pela InfinitePay '
                  || 'não sai do Financeiro.';
    end if;
    return old;
  end if;

  -- `auth.role()` lê o papel do JWT: 'service_role' só no client do servidor.
  v_discount_shift :=
    coalesce(auth.role(), '') = 'service_role'
    and new.type = old.type
    and new.amount + new.discount_amount = old.amount + old.discount_amount;

  if (new.amount is distinct from old.amount
      or new.discount_amount is distinct from old.discount_amount
      or new.type is distinct from old.type)
     and (v_live or v_paid)
     and not v_discount_shift then
    raise exception using
      errcode = 'PT409',
      message = 'O valor e o tipo não mudam enquanto houver link de pagamento em aberto '
                || 'ou pagamento recebido pela InfinitePay.',
      hint    = 'Cancele o link para alterar o valor.';
  end if;

  if old.status = 'pendente' and new.status = 'pago' and v_live then
    raise exception using
      errcode = 'PT409',
      message = 'Há um link de pagamento em aberto para este lançamento. Cancele o link '
                || 'antes de marcá-lo como pago, ou o cliente ainda poderá pagar.';
  end if;

  if old.status = 'pago' and new.status = 'pendente' and v_paid then
    raise exception using
      errcode = 'PT409',
      message = 'Este lançamento foi pago pela InfinitePay. Para voltar a pendente, '
                || 'registre o estorno.';
  end if;

  return new;
end;
$$;

comment on function public.guard_financial_entry_charges() is
  'Trava valor, tipo, baixa manual e exclusão de lançamento com link de pagamento '
  'vivo (e não vencido) ou pago; o servidor pode passar valor para o desconto, '
  'com a soma igual (migrations 67, 95 e 97). Erros com SQLSTATE PT409.';

-- `discount_amount` entra na lista: a troca do valor pelo desconto passa pela
-- trava mesmo quando só ele e `amount` estão no SET.
drop trigger if exists guard_financial_entry_charges on public.financial_entries;
create trigger guard_financial_entry_charges
  before update of amount, discount_amount, type, status or delete on public.financial_entries
  for each row execute function public.guard_financial_entry_charges();
