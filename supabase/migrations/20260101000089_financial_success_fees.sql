-- ============================================================
-- 89 — ÊXITOS E RECEBIMENTOS PERCENTUAIS
--
-- Fase 2 do plano em docs/financeiro.md.
--
--   · Categoria nova `exito` ("Êxito"): é o que a aba Êxitos lista. Até aqui
--     o êxito era um honorário em condição especial, reconhecível só pelo
--     texto da descrição.
--   · Recebimento percentual: `percent` de uma base (`base_description`, "o
--     proveito econômico", "o valor da venda do imóvel"). O valor da base
--     (`base_amount`) só chega quando o evento acontece — até lá o lançamento
--     está A APURAR: R$ 0, pendente, em condição especial.
--   · `estimated_base_amount`: estimativa opcional, só para informar. Nunca
--     entra no A receber (decisão da fase 4 de docs/contratos.md: um valor
--     estimado inflaria o que o escritório tem a receber).
--   · `assess_success_fee()`: apurar num passo só — o êxito recebe o valor e
--     as parcelas nascem na mesma transação, com a RLS de quem chama.
--
-- O valor (`amount`) NÃO é coluna gerada de base × percentual: pode ser
-- ajustado (arredondamento, acordo), e cada parcela de um êxito parcelado
-- guarda a base inteira com só a sua parte do valor.
--
-- Vale para receita e despesa: o percentual de um repasse tem a mesma forma.
-- A aba Êxitos lista só a categoria `exito`.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Categoria
--
-- O nome do CHECK foi conferido no catálogo do remoto em 2026-10-30
-- (`financial_entries_category_check`, criado inline pela migration 21).
-- ────────────────────────────────────────────────────────────────────────────

alter table public.financial_entries
  drop constraint financial_entries_category_check,
  add constraint financial_entries_category_check
    check (category in ('honorario', 'exito', 'custas', 'pericia', 'outros'));


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Colunas do percentual
--
-- Os CHECKs de coluna passam com NULL, como todo CHECK: nulo é "não é
-- percentual" ou "ainda não se sabe".
-- ────────────────────────────────────────────────────────────────────────────

alter table public.financial_entries
  add column percent numeric(5,2)
    check (percent > 0 and percent <= 100),
  add column base_description text,
  add column base_amount numeric(14,2)
    check (base_amount >= 0),
  add column estimated_base_amount numeric(14,2)
    check (estimated_base_amount >= 0);

comment on column public.financial_entries.percent is
  'Percentual sobre `base_description`. Nulo = valor fixo.';

comment on column public.financial_entries.base_description is
  'Sobre o quê incide o percentual ("o proveito econômico"). Obrigatório com '
  '`percent`.';

comment on column public.financial_entries.base_amount is
  'Valor da base, quando o evento acontece. Nulo com `percent` = a apurar '
  '(R$ 0, pendente, em condição especial). Numa parcela, é a base inteira.';

comment on column public.financial_entries.estimated_base_amount is
  'Estimativa da base enquanto a apurar. Só informa: nunca entra em soma do '
  'A receber.';


-- ────────────────────────────────────────────────────────────────────────────
-- 3. As regras, no banco
--
-- No mesmo estilo da migration 40 (`x <> y or regra`, que lê como implicação).
-- O zod do formulário repete as três, para dar a mensagem no campo certo.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.financial_entries
  -- Um percentual sempre diz sobre o quê. btrim porque '' e '   ' chegam de
  -- campo de formulário e passariam por `is not null`.
  add constraint financial_entries_percent_has_base_description
    check (percent is null
           or (base_description is not null and btrim(base_description) <> '')),

  -- Base, estimativa e descrição da base só existem com percentual: trocar
  -- para valor fixo não pode deixar uma base antiga escondida no dado.
  add constraint financial_entries_base_needs_percent
    check (percent is not null
           or (base_description is null
               and base_amount is null
               and estimated_base_amount is null)),

  -- A apurar: sem o valor da base não há o que cobrar, nem baixa, nem data.
  add constraint financial_entries_to_assess_is_open
    check (percent is null
           or base_amount is not null
           or (amount = 0 and status = 'pendente' and settlement_kind = 'conditional'));


-- ────────────────────────────────────────────────────────────────────────────
-- 4. Os êxitos que já existem
--
-- A prévia do contrato (migration 71, `buildContractEntryDrafts`) lançava o
-- êxito como honorário em condição especial, R$ 0, descrição
-- "<título> — êxito". Eles viram categoria Êxito; os que seguem a apurar
-- ganham o percentual do contrato. Um que já recebeu valor à mão fica como
-- êxito de valor fixo.
--
-- Em 2026-10-30 o remoto não tinha nenhum (nenhum lançamento vinha de
-- contrato): isto vale para os que nascerem até o deploy.
-- ────────────────────────────────────────────────────────────────────────────

update public.financial_entries e
   set category = 'exito'
  from public.contracts c
 where e.contract_id = c.id
   and e.type = 'receita'
   and e.description like '% — êxito';

update public.financial_entries e
   set percent = c.success_fee_percent,
       base_description = 'o proveito econômico'
  from public.contracts c
 where e.contract_id = c.id
   and e.category = 'exito'
   and e.amount = 0
   and e.status = 'pendente'
   and e.settlement_kind = 'conditional'
   and c.success_fee_percent > 0;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. Apurar
--
-- `p_rows`: os lançamentos que saem da apuração, montados pela tela (a
-- divisão em parcelas é a mesma da prévia do contrato). Cada um traz
-- description, amount, base_amount, settlement_kind, due_date,
-- condition_description, status e paid_at.
--
--   · Sem `p_keep_open`: o primeiro vira o próprio êxito (mantém o id, os
--     anexos e o histórico), e os demais nascem como parcelas.
--   · Com `p_keep_open` ("foi só uma parte"): todos nascem novos, e o êxito
--     continua a apurar para o restante.
--
-- `security invoker`: a RLS de quem chama decide, como na tela — atualizar o
-- êxito pede `financeiro:update`, e cada parcela, `financeiro:create`. O
-- `for update` também pede `financeiro:update`: apurar é mudar o êxito, mesmo
-- quando ele continua aberto. Devolve os ids na ordem de `p_rows`.
--
-- Erros: P0002 quando o lançamento não existe (ou a RLS o esconde); PT409
-- quando ele já não está a apurar — outra pessoa apurou antes.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.assess_success_fee(
  p_entry_id  uuid,
  p_rows      jsonb,
  p_keep_open boolean default false
)
returns setof uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source public.financial_entries;
  v_row    jsonb;
  v_first  boolean := true;
  v_id     uuid;
begin
  select * into v_source
    from public.financial_entries
   where id = p_entry_id
     for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Lançamento não encontrado.';
  end if;

  if v_source.percent is null or v_source.base_amount is not null then
    raise exception using
      errcode = 'PT409',
      message = 'Este lançamento não está mais a apurar.',
      hint    = 'Feche e abra de novo para ver como ele ficou.';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception using
      errcode = '22023',
      message = 'Nada para lançar na apuração.';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if v_first and not p_keep_open then
      update public.financial_entries
         set description           = v_row->>'description',
             amount                = (v_row->>'amount')::numeric,
             base_amount           = (v_row->>'base_amount')::numeric,
             -- Apurado, a estimativa não diz mais nada.
             estimated_base_amount = null,
             settlement_kind       = v_row->>'settlement_kind',
             due_date              = (v_row->>'due_date')::date,
             condition_description = v_row->>'condition_description',
             status                = v_row->>'status',
             paid_at               = (v_row->>'paid_at')::date
       where id = p_entry_id
      returning id into v_id;
    else
      insert into public.financial_entries (
        type, category, description, amount, status, settlement_kind, due_date,
        condition_description, paid_at, client_id, crm_item_id, legal_process_id,
        contract_id, percent, base_description, base_amount, created_by
      )
      values (
        v_source.type,
        v_source.category,
        v_row->>'description',
        (v_row->>'amount')::numeric,
        v_row->>'status',
        v_row->>'settlement_kind',
        (v_row->>'due_date')::date,
        v_row->>'condition_description',
        (v_row->>'paid_at')::date,
        v_source.client_id,
        v_source.crm_item_id,
        v_source.legal_process_id,
        v_source.contract_id,
        v_source.percent,
        v_source.base_description,
        (v_row->>'base_amount')::numeric,
        auth.uid()
      )
      returning id into v_id;
    end if;

    v_first := false;
    return next v_id;
  end loop;
end;
$$;

comment on function public.assess_success_fee(uuid, jsonb, boolean) is
  'Apura um êxito a apurar (migration 89): o valor entra no próprio lançamento '
  'e as parcelas nascem juntas, ou, com p_keep_open, a parte vira lançamento '
  'novo e o êxito segue a apurar. RLS de quem chama.';

grant execute on function public.assess_success_fee(uuid, jsonb, boolean) to authenticated;
