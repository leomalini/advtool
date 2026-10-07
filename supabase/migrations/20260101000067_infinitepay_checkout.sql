-- ============================================================
-- 67 — CHECKOUT INFINITEPAY (cobrança por link no Financeiro)
--
-- Plano: `docs/integracao-infinitepay.md`.
--
-- Uma receita do Financeiro ganha um link de pagamento da InfinitePay (Pix ou
-- cartão). O pagamento chega pelo webhook ou pelo retorno do cliente, é
-- conferido no `payment_check` e só então dá baixa no lançamento.
--
--   · `office_settings.infinitepay_handle` — a conta que recebe;
--   · `payment_charges`                    — um link;
--   · `payment_transactions`               — um pagamento confirmado.
--
-- ⚠️ A API NÃO CANCELA NEM EXPIRA LINK. Um link gerado continua pagável na
-- InfinitePay mesmo depois de "cancelado" aqui — cancelar é só deixar de
-- oferecê-lo. As travas do passo 4 existem por causa disso: enquanto houver um
-- link que o cliente consegue pagar, o lançamento não muda de valor nem some.
--
-- Depende da migration 66 (`office_settings`).
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. A conta que recebe
--
-- A InfiniteTag sem o `$`. Não é segredo — é o nome de usuário público da
-- conta —, então mora na linha dos dados do escritório e segue as policies
-- dela: todos leem, só `configuracoes:manage` grava.
--
-- O CHECK recusa só o que certamente não é uma tag (espaço e `$`). O formato
-- exato não está documentado, e uma regra mais estrita que a da InfinitePay
-- recusaria uma conta válida.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.office_settings
  add column if not exists infinitepay_handle text
    check (infinitepay_handle is null or infinitepay_handle ~ '^[^[:space:]$]+$');

comment on column public.office_settings.infinitepay_handle is
  'InfiniteTag da conta InfinitePay que recebe os links de pagamento, sem o "$". '
  'Cada cobrança guarda a tag usada (payment_charges.handle): trocar aqui não '
  'muda para onde vão os links já enviados.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. `payment_charges` — um link
--
-- O `id` é também o `order_nsu` enviado à InfinitePay: é por ele que o webhook
-- e o retorno do cliente encontram a cobrança. Uma coluna à parte só serviria
-- para as duas divergirem.
--
-- `handle`, `description`, `amount_cents` e `customer_name` são o retrato do
-- que foi enviado. O lançamento pode mudar depois — ou sumir, se a cobrança foi
-- cancelada — e um pagamento que chegue por este link ainda precisa ser
-- reconhecido pelo que o cliente viu ao pagar.
--
-- O ciclo:
--   creating → open      o `/links` respondeu com a URL
--   creating → failed    o `/links` recusou ou não respondeu
--   open     → paid      o `payment_check` confirmou um pagamento
--   open     → canceled  deixou de ser oferecido (o link continua pagável!)
--   canceled → paid      pagaram assim mesmo: entra registrado, com alerta
--   paid     → refunded  estorno feito no app da InfinitePay e registrado aqui
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.payment_charges (
  id                  uuid primary key default gen_random_uuid(),

  /** `set null`, e não cascade: um link cancelado ainda pode ser pago, e o
   * pagamento precisa achar a cobrança mesmo sem o lançamento. Excluir um
   * lançamento com link vivo ou pago é barrado no passo 4. */
  financial_entry_id  uuid references public.financial_entries(id) on delete set null,

  provider            text not null default 'infinitepay' check (provider = 'infinitepay'),
  /** A InfiniteTag usada neste link — a configuração pode mudar depois. */
  handle              text not null,
  description         text not null check (btrim(description) <> ''),
  amount_cents        bigint not null check (amount_cents > 0),
  customer_name       text,

  checkout_url        text,
  status              text not null default 'creating' check (status in (
    'creating', 'open', 'paid', 'canceled', 'refunded', 'failed'
  )),

  /** SHA-256 do token que vai na `webhook_url` deste link. O webhook da
   * InfinitePay não é assinado: o token é o que separa a entrega dela do POST
   * de quem descobriu o endereço. */
  webhook_token_hash  text not null,
  /** Por que o `/links` falhou, quando `failed`. */
  error               text,

  canceled_at         timestamptz,
  canceled_by         uuid references public.profiles(id),

  created_by          uuid not null references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Link oferecido tem endereço; falha tem motivo; cancelamento tem quando.
  constraint payment_charges_url_once_issued
    check (status in ('creating', 'failed') or checkout_url is not null),
  constraint payment_charges_error_when_failed
    check (status <> 'failed' or error is not null),
  constraint payment_charges_canceled_has_date
    check (status <> 'canceled' or canceled_at is not null)
);

comment on table public.payment_charges is
  'Link de pagamento da InfinitePay para um lançamento. O id é o order_nsu.';

/** Um link vivo por lançamento. É o que barra o clique duplo: o segundo insert
 * bate aqui antes de chegar à InfinitePay. */
create unique index if not exists idx_payment_charges_one_live_per_entry
  on public.payment_charges(financial_entry_id)
  where status in ('creating', 'open');

create index if not exists idx_payment_charges_entry
  on public.payment_charges(financial_entry_id);

drop trigger if exists set_updated_at on public.payment_charges;
create trigger set_updated_at before update on public.payment_charges
  for each row execute function public.set_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- 3. `payment_transactions` — um pagamento confirmado
--
-- Só entra aqui o que o `payment_check` confirmou. O corpo do webhook e os
-- parâmetros do retorno são pista, não prova: ficam em `webhook_events`.
--
-- Tabela à parte, e não colunas na cobrança, porque nada na documentação diz
-- que um link aceita um pagamento só. Se aceitar dois, o segundo vira outra
-- linha — e um alerta — em vez de sobrescrever o primeiro.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.payment_transactions (
  id                 uuid primary key default gen_random_uuid(),
  charge_id          uuid not null references public.payment_charges(id) on delete restrict,

  /** Id da transação na InfinitePay. Único aqui também: é o que faz o webhook
   * reentregue, ou o retorno do cliente chegando junto com ele, virar no-op em
   * vez de um segundo pagamento. */
  transaction_nsu    text not null unique,
  /** O código da fatura — o `payment_check` pede junto com o NSU. */
  invoice_slug       text not null,
  /** 'pix' | 'credit_card' na documentação. Sem CHECK de propósito: um método
   * novo do lado de lá não pode impedir um pagamento real de ser gravado. */
  capture_method     text,
  /** 1 no Pix, nos exemplos da documentação. `>= 0`, e não `>= 1`, pelo mesmo
   * motivo do método: um zero do lado de lá não pode barrar o registro. */
  installments       integer check (installments is null or installments >= 0),

  /** Como o `payment_check` devolveu, em centavos. `paid_amount_cents` passa de
   * `amount_cents` quando o cliente pagou os juros do parcelamento. */
  amount_cents       bigint not null check (amount_cents >= 0),
  paid_amount_cents  bigint not null check (paid_amount_cents >= 0),
  receipt_url        text,

  confirmed_via      text not null check (confirmed_via in ('webhook', 'redirect', 'manual')),
  /** Quando a confirmação chegou: a API não informa a hora do pagamento. */
  confirmed_at       timestamptz not null default now(),

  /** O estorno é feito no app da InfinitePay (não há API) e registrado aqui. */
  refunded_at        timestamptz,
  refunded_by        uuid references public.profiles(id),

  created_at         timestamptz not null default now()
);

comment on table public.payment_transactions is
  'Pagamento confirmado no payment_check da InfinitePay. transaction_nsu é único.';

create index if not exists idx_payment_transactions_charge
  on public.payment_transactions(charge_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. Travas no lançamento
--
-- Enquanto há um link que o cliente consegue pagar (`creating`/`open`), ou um
-- pagamento que entrou (`paid`), o lançamento não pode:
--
--   · mudar de valor ou de tipo — o link cobra o valor antigo;
--   · ser excluído — o pagamento ficaria sem o que quitar;
--   · virar "pago" à mão com link vivo — o cliente ainda pagaria de novo.
--     Primeiro se cancela o link (a tela faz as duas coisas num clique);
--   · voltar a "pendente" com pagamento confirmado — isso é estorno, e o
--     estorno tem registro próprio.
--
-- No banco, e não só na tela, pela mesma razão dos CHECKs da migration 40: a
-- regra vale para qualquer caminho que escreva no lançamento.
--
-- `PT409` é a convenção do PostgREST para responder HTTP 409, e é o código
-- pelo qual a tela reconhece a trava para mostrar a mensagem dela.
--
-- `security definer` porque a trava não pode depender do que quem chama
-- enxerga: sob RLS, uma cobrança invisível para o chamador faria a consulta
-- voltar vazia e a trava passar calada. Função de trigger não é chamável pela
-- API — o Postgres recusa invocá-la fora de um trigger.
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
  select coalesce(bool_or(c.status in ('creating', 'open')), false),
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
  'vivo ou pago (migration 67). Erros com SQLSTATE PT409.';

-- `update of`: a trava só roda quando uma das colunas que ela protege está no
-- SET. Editar a descrição de um lançamento não paga a consulta.
drop trigger if exists guard_financial_entry_charges on public.financial_entries;
create trigger guard_financial_entry_charges
  before update of amount, type, status or delete on public.financial_entries
  for each row execute function public.guard_financial_entry_charges();


-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS
--
-- A tela LÊ cobranças e pagamentos; quem ESCREVE é sempre o servidor. Gerar e
-- cancelar link passam por rotas que conferem `financeiro:create`/`update` com
-- o client de sessão e só então gravam pela service_role — o mesmo desenho de
-- `requireAdminApi`. Assim o ciclo do passo 2 vive num lugar só: uma policy de
-- update aberta deixaria qualquer tela pular de `open` para `paid` sem
-- pagamento nenhum.
--
-- O perfil `paralegal` não tem `financeiro:view` e não enxerga nenhuma das
-- duas, como já não enxerga `financial_entries`.
-- ────────────────────────────────────────────────────────────────────────────

select public.apply_rbac_policies(
  'payment_charges',
  'financeiro:view', null, null, null
);

select public.apply_rbac_policies(
  'payment_transactions',
  'financeiro:view', null, null, null
);
