-- ============================================================
-- 73 — O CLASSIFICADOR CONTRA OS DADOS REAIS
--
-- A migration 72 foi aplicada e classificou as 171 movimentações da base.
-- Medindo o resultado, 12 delas ficaram em `outros` — e lendo os textos, todas
-- as 12 tinham categoria óbvia. Esta migration ajusta os padrões e refaz o
-- backfill. `movement_category_from_text` é a ÚNICA coisa que muda:
-- `classify_movement` e `movement_requires_action` seguem como estão.
--
-- Arquivo novo em vez de editar a 72: ela já rodou na base, e migration
-- aplicada não se edita para "rodar de novo" (mesma regra do cabeçalho da 49).
--
-- ── O que os dados reais ensinaram ──────────────────────────────────────────
--
-- 1. O TEXTO VEM FRAGMENTADO, SEM O SUBSTANTIVO INICIAL. De verdade, na base:
--
--      "de Conciliação — Conciliador(a): 188 | realizada: 13"
--      "de Instrução e Julgamento — designada: 9"
--      "de Conciliação — 188 | 13"
--
--    São audiências em que a palavra "Audiência" não está no texto. Uma caía
--    em `decisao` (pela palavra "Julgamento") e quatro em `outros`. Daí
--    `concilia`, `conciliador` e `instru[çc][ãa]o e julgamento` entrarem no
--    padrão de audiência.
--
--    ⚠️ ISTO É SINTOMA DE UM PROBLEMA A MONTANTE, NÃO DAQUI. Alguma coisa na
--    ingestão (ou no payload da BuscaProcessos) está perdendo o começo da
--    string. Tratar o fragmento aqui é remendo: enquanto a origem não for
--    corrigida, a tela mostra "de Conciliação — 188 | 13" como título do ato.
--
-- 2. Vocabulário que faltava, todo genérico do processo civil brasileiro:
--      · `conced`, `antecipa[çc][ãa]o de tutela`, `tutela provis[óo]ria` → decisão
--        ("Concedida a tutela provisória", "Antecipação de tutela")
--      · `efeito suspensivo` → recurso ("Com efeito suspensivo")
--      · `documento`, `devolvid`, `secretaria` → expediente
--        ("Documento — 107", "Processo devolvido à Secretaria")
--
--    `tutela` SOZINHO não entra: aparece em nome de classe processual
--    ("TUTELA CAUTELAR ANTECEDENTE"), que é ato de cadastro, não decisão.
--
-- ── Medição ─────────────────────────────────────────────────────────────────
--
-- Sobre as 171 linhas reais, 13 mudam de categoria e `outros` vai de 12 a 0.
-- Nenhuma linha muda para uma categoria pior.
--
--   antes:  expediente 74 · intimacao 43 · decisao 16 · prazo 13 · outros 12
--           peticao 7 · audiencia 5 · recurso 1
--   depois: expediente 79 · intimacao 43 · decisao 17 · prazo 13 · audiencia 10
--           peticao 7 · recurso 2 · outros 0
--
-- `outros` = 0 aqui NÃO quer dizer que o classificador é completo: são os atos
-- de um escritório em poucas varas do TJES. Redação de outro tribunal vai cair
-- em `outros`, e é para isso que o fallback existe.
--
-- ⚠️ `requires_action` continua pegando 4 de 171, e isso NÃO é defeito do
-- padrão: nenhuma das 171 linhas contém "intime-se", "manifeste-se",
-- "cite-se", "cumpra-se", "no prazo de" ou "sob pena de". A mediana de
-- `description` tem 30 caracteres — são RÓTULOS da TPU, não o texto do ato. O
-- texto judicial inteiro vive em `publications`, não aqui. Por isso a tela de
-- Movimentações não abre mais filtrada por "pede providência": o filtro segue
-- disponível, mas como recorte opcional.
-- ============================================================

create or replace function public.movement_category_from_text(p_text text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_text, '') = '' then 'outros'

    -- `concilia` / `instrução e julgamento`: ver nota 1 do cabeçalho.
    when p_text ~* '(audi[êe]ncia|sess[ãa]o de julgamento|concilia|conciliador|instru[çc][ãa]o e julgamento)'
      then 'audiencia'

    when p_text ~* '(arquiv|baixa definitiva|tr[âa]nsito em julgado|transitad. em julgado|extin)'
         and p_text !~* 'desarquiv'
      then 'encerramento'

    -- Encaminhamento, não decisão: "Conclusos para julgamento" é ato de
    -- secretaria, e sem este desvio o `julgamento` da frase o chamaria de
    -- decisão.
    when p_text ~* 'conclus'
      then 'expediente'

    when p_text ~* '(\mintim|\mcit|\mnotific|publicad|publica[çc]|disponibiliza|carta precat|mandado|ci[êe]ncia)'
      then 'intimacao'

    when p_text ~* '(decurso de prazo|prazo decorrido|decorrid.{0,30}prazo|in[íi]cio de prazo|suspens[ãa]o do prazo|prazo em curso|abert.{0,12}vista|vista dos autos|vista [àa]s partes)'
      then 'prazo'

    when p_text ~* '(despacho|decis[ãa]o|decidi|senten[çc]a|conced|antecipa[çc][ãa]o de tutela|tutela provis[óo]ria|ac[óo]rd[ãa]o|julgamento|julgad|homolog|deferi|indeferi|determin)'
      then 'decisao'

    when p_text ~* '(apela|agrav|embargos|recurso|efeito suspensivo|contrarraz|contra-raz|revis[ãa]o criminal)'
      then 'recurso'

    when p_text ~* '(peti[çc]|manifesta[çc]|contesta|impugna|r[ée]plica|requerimento|alega[çc][õo]es finais)'
      then 'peticao'

    when p_text ~* '(juntada|certid|documento|devolvid|secretaria|distribu[íi]|remess|remetid|recebiment|expedi|cumprim|desarquiv|retifica|cadastr|digitaliza|autos)'
      then 'expediente'

    else 'outros'
  end
$$;


-- ── Backfill ─────────────────────────────────────────────────────────────────
--
-- Chama as funções direto, como na 72: tocar coluna vigiada só para fazer o
-- trigger disparar seria caminho torto. `requires_action` entra na conta
-- porque a função pode ter mudado entre as duas migrations — hoje não mudou, e
-- recalcular é barato e mantém as duas colunas coerentes com o código atual.

do $$
declare
  v_total int;
  r record;
begin
  update public.legal_process_movements
     set category        = public.classify_movement(title, description, raw_data),
         requires_action = public.movement_requires_action(title, description);

  get diagnostics v_total = row_count;

  raise notice '── Reclassificação de movimentações ──';
  raise notice 'linhas reclassificadas ....... %', v_total;

  for r in
    select category, count(*) as total
      from public.legal_process_movements
     group by category
     order by total desc
  loop
    raise notice '  % ............ %', r.category, r.total;
  end loop;
end $$;
