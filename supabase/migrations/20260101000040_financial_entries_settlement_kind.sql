-- ============================================================
-- 40 — FINANCIAL ENTRIES: forma de liquidação (data × condição especial)
--
-- Reestrutura os status do módulo em três buckets mutuamente exclusivos que
-- somam o total a receber:
--
--   A receber (TUDO) = A vencer + Vencido + Condição especial
--
-- "Condição especial" são os lançamentos que dependem de um evento, não de uma
-- data: receber após o trânsito em julgado, após o alvará, após o acordo.
--
-- ⚠️ O CRITÉRIO É `settlement_kind`, NUNCA A AUSÊNCIA DE DATA. Um lançamento
-- em condição especial PODE ter data — é uma previsão, não um vencimento — e
-- continua sendo condição especial. Derivar isso de `due_date is null` faria a
-- classificação virar efeito colateral de um campo em branco, e o primeiro
-- lançamento com previsão preenchida cairia no bucket errado em silêncio.
--
-- A relação vale só numa direção: todo lançamento sem data é condição especial
-- (garantido pelo CHECK abaixo), mas nem toda condição especial é sem data.
--
-- `status` ('pendente' | 'pago') continua sendo a única dimensão gravada de
-- liquidação, e "vencido" continua derivado — ver a migration 21 e
-- `getFinancialSituation` em src/types/financialEntry.types.ts, que é a fonte
-- única da taxonomia no cliente.
--
-- Vale para receita E despesa: uma custa a pagar depois do alvará tem
-- exatamente a mesma natureza. Os indicadores da tela seguem focados em
-- receita, mas o dado não fica torto por causa disso.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Colunas
--
-- BACKFILL NÃO É NECESSÁRIO: toda linha existente tem `due_date not null` e
-- recebe 'scheduled' pelo default, que é exatamente o que ela sempre foi.
-- Nenhum registro muda de significado com esta migration.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.financial_entries
  add column settlement_kind text not null default 'scheduled'
    check (settlement_kind in ('scheduled', 'conditional')),
  add column condition_description text;

comment on column public.financial_entries.settlement_kind is
  '''scheduled'' = liquida numa data (due_date é o vencimento). '
  '''conditional'' = liquida ao cumprir uma condição (due_date, se houver, é '
  'apenas previsão). Único critério de classificação — não usar due_date null.';

comment on column public.financial_entries.condition_description is
  'O que precisa acontecer para o lançamento ser liquidado. Obrigatório quando '
  'settlement_kind = ''conditional''.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. `due_date` deixa de ser obrigatória
--
-- É o que permite o "sem data definida" do enunciado. A obrigatoriedade não
-- some: migra do NOT NULL para o CHECK do passo 3, que a exige só onde ela
-- realmente faz sentido.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.financial_entries alter column due_date drop not null;

comment on column public.financial_entries.due_date is
  'Vencimento quando settlement_kind = ''scheduled'' (obrigatório). Previsão '
  'opcional quando ''conditional'' — previsão vencida NÃO é atraso.';


-- ────────────────────────────────────────────────────────────────────────────
-- 3. As duas regras do modelo, no banco
--
-- Escritas como `kind <> X or <regra>` em vez de `case when`: é a forma que o
-- Postgres avalia como NULL-safe sem cláusula extra, e lê como implicação
-- direta ("se é scheduled, então tem data").
-- ────────────────────────────────────────────────────────────────────────────

alter table public.financial_entries
  -- Sem data só é estado válido para condição especial.
  add constraint financial_entries_scheduled_needs_due_date
    check (settlement_kind <> 'scheduled' or due_date is not null),

  -- Marcar como condição especial sem dizer QUAL condição produz um lançamento
  -- que ninguém consegue cobrar depois. btrim porque '' e '   ' chegam de
  -- campo de formulário e passariam por `is not null`.
  add constraint financial_entries_conditional_needs_description
    check (settlement_kind <> 'conditional'
           or (condition_description is not null and btrim(condition_description) <> ''));


-- Sem índice em settlement_kind de propósito: nenhuma query filtra por ele no
-- servidor — a tela busca os lançamentos e agrega no cliente (ver
-- getFinancialSummary). Um índice aqui só custaria escrita.
