-- ============================================================
-- 95 — COBRANÇAS: A PÁGINA DE PAGAMENTO (fase 1 de docs/cobrancas.md)
--
-- Uma receita do Financeiro vira uma COBRANÇA: um endereço nosso
-- (`/pagar/<token>`) que o escritório manda ao cliente. O link da InfinitePay
-- deixa de ir na mensagem e passa a nascer no clique em "Pagar", com o valor
-- daquele dia.
--
--   · `billings`         — a cobrança de um lançamento (1:1);
--   · `payment_charges`  — ganha validade, pagamento único e o status
--                          `superseded`;
--   · a trava da migration 67 deixa de contar link vencido como vivo.
--
-- Depende das migrations 67 (`payment_charges` e a trava) e 21
-- (`financial_entries`).
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. `billings` — a cobrança de um lançamento
--
-- O `id` é gerado no SERVIDOR antes do insert: o token da URL é derivado dele
-- (HMAC com um segredo do servidor, `src/lib/billing/token.ts`), e o banco
-- guarda só o SHA-256 desse token. Um dump não devolve link utilizável, e o
-- servidor remonta a URL sempre que precisa — a régua da fase 2 manda a mesma
-- URL em todos os avisos.
--
-- `cascade` com o lançamento: sem lançamento não há o que cobrar, e a página
-- passa a responder "não encontrada". Lançamento com link vivo ou pago já não
-- sai do Financeiro (trava da migration 67).
--
-- Encerrar não apaga: `canceled_at` tira a página do ar, e gerar de novo a
-- religa com o mesmo endereço — as mensagens já enviadas voltam a valer.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.billings (
  id                   uuid primary key default gen_random_uuid(),
  financial_entry_id   uuid not null unique
                         references public.financial_entries(id) on delete cascade,

  /** SHA-256, em hexa, do token da URL. */
  token_hash           text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),

  /** O que o cliente lê na página, na mensagem e no checkout. A descrição do
   * lançamento é interna e pode citar o caso. */
  client_description   text not null check (
    btrim(client_description) <> '' and char_length(client_description) <= 120
  ),

  /** Primeira e última abertura pelo cliente. Só um POST da página já
   * renderizada conta: a pré-visualização do WhatsApp abre o GET sozinha. */
  viewed_at            timestamptz,
  last_viewed_at       timestamptz,
  /** Último clique em "Pagar". */
  checkout_clicked_at  timestamptz,

  canceled_at          timestamptz,
  canceled_by          uuid references public.profiles(id),

  created_by           uuid not null references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint billings_viewed_in_order
    check (last_viewed_at is null or viewed_at is not null)
);

comment on table public.billings is
  'Cobrança de um lançamento: a página /pagar/<token> (docs/cobrancas.md). '
  'O token deriva do id; o banco guarda só o hash.';

drop trigger if exists set_updated_at on public.billings;
create trigger set_updated_at before update on public.billings
  for each row execute function public.set_updated_at();

-- Só leitura pela tela, como as tabelas da migration 67: quem grava é o
-- servidor, depois de conferir a permissão com o client de sessão.
select public.apply_rbac_policies(
  'billings',
  'financeiro:view', null, null, null
);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. `payment_charges` — validade, pagamento único e `superseded`
--
-- Com a API Key da InfinitePay, cada link novo nasce com `single_payment` e
-- `valid_until` (o fim do dia seguinte, em Brasília). `expires_at` guarda essa
-- validade; nulo é link sem validade (os de antes desta migration, ou os
-- gerados sem a chave).
--
-- `superseded`: outro link tomou o lugar deste — o de ontem, quando o cliente
-- clica em "Pagar" hoje. Diferente de `canceled`, um pagamento que chegue por
-- ele DÁ BAIXA: foi o escritório que o ofereceu (`confirm.ts`).
--
--   open → superseded     um link novo o substituiu
--   superseded → paid     pagaram por ele antes de vencer
-- ────────────────────────────────────────────────────────────────────────────

alter table public.payment_charges
  add column if not exists expires_at timestamptz,
  add column if not exists single_payment boolean not null default false;

comment on column public.payment_charges.expires_at is
  'Até quando a InfinitePay aceita o link (options.valid_until). Nulo = sem validade.';
comment on column public.payment_charges.single_payment is
  'O link foi gerado com options.single_payment: aceita um pagamento só.';

alter table public.payment_charges
  drop constraint if exists payment_charges_status_check;
alter table public.payment_charges
  add constraint payment_charges_status_check check (status in (
    'creating', 'open', 'paid', 'canceled', 'refunded', 'failed', 'superseded'
  ));


-- ────────────────────────────────────────────────────────────────────────────
-- 3. A trava da migration 67, sem contar link vencido
--
-- "Link vivo" era `creating` ou `open`. Agora o link vence: um `open` cujo
-- `expires_at` passou não é mais pagável, e não pode continuar travando o
-- valor, a baixa manual e a exclusão do lançamento. O resto da função é o da
-- migration 67.
--
-- O índice único de "um link vivo por lançamento" continua só por status
-- (índice parcial não aceita `now()`): quem gera um link novo marca o vencido
-- como `superseded` antes (`src/lib/billing/checkout.ts`).
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

  if (new.amount is distinct from old.amount or new.type is distinct from old.type)
     and (v_live or v_paid) then
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
  'vivo (e não vencido) ou pago (migrations 67 e 95). Erros com SQLSTATE PT409.';
