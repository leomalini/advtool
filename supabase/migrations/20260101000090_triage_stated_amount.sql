-- ============================================================
-- 90 — TRIAGEM: O VALOR QUE O ATO FIXA
--
-- Fase 3 do plano em docs/financeiro.md.
--
-- A triagem de uma publicação passa a guardar o valor que o texto fixa
-- (condenação, acordo homologado, alvará, RPV ou precatório, venda ou
-- arrematação) e a natureza dele. Com o processo tendo êxito a apurar, sai um
-- aviso no sino com a conta pronta. O valor é só sugestão: quem apura confere o
-- texto e confirma — nada entra no Financeiro sem clique.
--
-- Fica aqui, e não no aviso, para o diálogo "Apurar" ler a sugestão do banco em
-- vez de recebê-la pela URL do link.
-- ============================================================

alter table public.publication_triage
  add column if not exists stated_amount numeric(14,2)
    check (stated_amount > 0),
  add column if not exists stated_amount_kind text
    check (stated_amount_kind in
      ('condenacao', 'acordo', 'alvara', 'rpv_precatorio', 'venda', 'outro'));

comment on column public.publication_triage.stated_amount is
  'Valor que o texto da publicação fixa, lido pela IA. Sugestão para apurar um '
  'êxito: nunca gravado no Financeiro sem confirmação.';

comment on column public.publication_triage.stated_amount_kind is
  'A natureza do valor: condenacao, acordo, alvara, rpv_precatorio, venda, outro.';
