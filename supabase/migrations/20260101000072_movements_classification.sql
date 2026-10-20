-- ============================================================
-- 72 — O QUE O ATO É, E SE ELE PEDE PROVIDÊNCIA
--
-- Plano: módulo MOVIMENTAÇÕES (`/movimentacoes`).
--
-- `legal_process_movements` guarda o texto do ato e mais nada sobre a natureza
-- dele. Numa carteira real isso significa 140 linhas por mês em que as 6 que
-- exigem trabalho ficam no meio das 134 juntadas de documento — e a tela não
-- tem como separá-las, filtrá-las nem contá-las.
--
-- Esta migration acrescenta duas colunas derivadas do que já está gravado:
--
--   · category        — a natureza do ato, em 9 valores
--   · requires_action — o texto manda alguém fazer algo
--
-- ── Por que derivar no banco, e não na ingestão ─────────────────────────────
--
-- As duas colunas são FUNÇÃO do texto, não informação nova. Calculá-las em TS
-- obrigaria a repetir a regra nas três escritas (sync.ts, webhook.ts,
-- addLegalProcessMovement) e criaria o problema de paridade que
-- `publication_fingerprint` tem hoje (ver migration 46 e
-- scripts/verify-fingerprint.mjs). Aqui não há essa necessidade: nada decide
-- nada ANTES do insert — a classificação é só leitura derivada. Então ela mora
-- inteira em SQL, num lugar só, e o trigger a mantém.
--
-- ── Por que a hierarquia TPU tem precedência ────────────────────────────────
--
-- As linhas que vieram do sync REST trazem `classificacao_predita` em
-- `raw_data` (nome, descricao, hierarquia) — a taxonomia do CNJ, gravada desde
-- a migration 43 e nunca lida por ninguém. É sinal muito mais limpo que o
-- texto corrido: "Despacho" contra "Juntada de petição referente ao despacho
-- de fl. 30", que fala de despacho mas é juntada.
--
-- Então `classify_movement` roda em dois passos: primeiro sobre os campos da
-- classificação, e só se eles não decidirem é que olha título + descrição.
--
-- ⚠️ O webhook NÃO manda classificação — `webhook.ts:235` define
-- `classificacao_predita: null` de propósito, porque o payload de entrega não
-- a traz. Toda linha de webhook cai no segundo passo. Isso é esperado, não um
-- defeito a consertar aqui.
--
-- Nenhum pressuposto sobre o FORMATO de `hierarquia`: os campos entram no
-- mesmo casamento de padrões do texto livre. Se a BuscaProcessos mudar a
-- estrutura, o pior caso é o primeiro passo não decidir e o segundo assumir.
--
-- ── Acentos ─────────────────────────────────────────────────────────────────
--
-- Os padrões aceitam as duas grafias (`audi[êe]ncia`, `decis[ãa]o`,
-- `senten[çc]a`) em vez de depender da extensão `unaccent`, que não está
-- habilitada no projeto. O casamento é `~*`, então não há `lower()` no meio.
--
-- ⚠️ OS PADRÕES SÃO RADICAIS, NÃO SUBSTANTIVOS. O andamento é escrito no
-- imperativo e no particípio — "Intime-se", "Disponibilizado", "julgo
-- extinto" —, não no substantivo da TPU ("intimação", "disponibilização",
-- "extinção"). Uma primeira versão deste arquivo usava as formas
-- substantivas e perdia justamente os atos que mais importam: `intima` não
-- casa "Intime-se", e `extin[çc]` não casa "extinto".
--
-- `\m` (início de palavra) entra onde o radical é ambíguo: `\mcit` casa
-- "citação" e "cite-se" sem casar "licitação"; `\mintim` e `\mnotific` pela
-- mesma razão.
--
-- ⚠️ `requires_action` É HEURÍSTICA, E ADVISORY. Ela pinta um chip e alimenta
-- um filtro; não cria tarefa, não marca prazo e não impede nada. Toda a regra
-- está em `movement_requires_action` — corrigir é editar uma função e rodar o
-- backfill do fim deste arquivo de novo.
-- ============================================================

-- ── Colunas ──────────────────────────────────────────────────────────────────

alter table public.legal_process_movements
  add column if not exists category text not null default 'outros'
    check (category in ('decisao', 'audiencia', 'intimacao', 'prazo', 'peticao',
                        'recurso', 'expediente', 'encerramento', 'outros')),
  add column if not exists requires_action boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.legal_process_movements.category is
  'Natureza do ato, derivada do texto por public.classify_movement(). '
  'Mantida pelo trigger set_movement_classification. Editável à mão: o '
  'trigger só dispara quando title, description ou raw_data mudam.';

comment on column public.legal_process_movements.requires_action is
  'O texto do ato manda alguém fazer algo (intime-se, no prazo de, sob pena '
  'de...). Heurística advisory de public.movement_requires_action() — alimenta '
  'filtro e chip, nunca cria tarefa nem prazo.';

-- A tabela nasceu sem `updated_at` (o trigger da migration 9 ficou só em
-- `cases`, e a 13 não o trouxe no rename). Passa a ser necessário porque a
-- tela de Movimentações escreve `handled_at`, `read_at` e `hidden_from_client`.
drop trigger if exists set_updated_at on public.legal_process_movements;
create trigger set_updated_at before update on public.legal_process_movements
  for each row execute function public.set_updated_at();


-- ── A tabela de padrões, num lugar só ────────────────────────────────────────
--
-- Ordem do mais específico para o mais genérico. As decisões de precedência
-- que não são óbvias:
--
--   · `audiencia` vem primeiro porque "audiência designada" é O ato, mesmo
--     quando a frase também fala de despacho ou intimação.
--   · `encerramento` exige NÃO casar `desarquiv`: desarquivamento é o oposto
--     de arquivamento, e `arquiv` sozinho casaria os dois.
--   · `conclus` tem um teste PRÓPRIO, antes de `decisao`: "Conclusos para
--     julgamento" é ato de secretaria encaminhando os autos — nada foi
--     decidido ainda. Sem esse desvio, o `julgamento` da frase o classificaria
--     como decisão, que é o erro mais comum de ler andamento por palavra.
--   · `intimacao` vem ANTES de `decisao` para que "Publicado o despacho em
--     ..." seja lido como intimação: o que importa ali é que o relógio do
--     prazo começou, não que um juiz despachou. "Despacho" sozinho continua
--     caindo em `decisao`.
--   · `decisao` vem antes de `recurso`: "Decisão que nega seguimento ao
--     agravo" é decisão. O custo é que "Recurso Especial — decisão de
--     admissibilidade" também vira decisão, e isso é aceito.
--   · `recurso` vem antes de `peticao`: "Juntada de Petição de Apelação" é
--     recurso, não petição genérica.

create or replace function public.movement_category_from_text(p_text text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_text, '') = '' then 'outros'

    when p_text ~* '(audi[êe]ncia|sess[ãa]o de julgamento)'
      then 'audiencia'

    when p_text ~* '(arquiv|baixa definitiva|tr[âa]nsito em julgado|transitad. em julgado|extin)'
         and p_text !~* 'desarquiv'
      then 'encerramento'

    -- Encaminhamento, não decisão. Ver a nota de precedência acima.
    when p_text ~* 'conclus'
      then 'expediente'

    when p_text ~* '(\mintim|\mcit|\mnotific|publicad|publica[çc]|disponibiliza|carta precat|mandado|ci[êe]ncia)'
      then 'intimacao'

    -- `decorrid.{0,30}prazo` cobre "Decorrido o prazo de..." e
    -- "Decorridos os prazos...", que é como os tribunais escrevem de fato —
    -- 'decurso de prazo' sozinho é a redação da TPU, não a do andamento.
    when p_text ~* '(decurso de prazo|prazo decorrido|decorrid.{0,30}prazo|in[íi]cio de prazo|suspens[ãa]o do prazo|prazo em curso|abert.{0,12}vista|vista dos autos|vista [àa]s partes)'
      then 'prazo'

    when p_text ~* '(despacho|decis[ãa]o|decidi|senten[çc]a|ac[óo]rd[ãa]o|julgamento|julgad|homolog|deferi|indeferi|determin)'
      then 'decisao'

    when p_text ~* '(apela|agrav|embargos|recurso|contrarraz|contra-raz|revis[ãa]o criminal)'
      then 'recurso'

    when p_text ~* '(peti[çc]|manifesta[çc]|contesta|impugna|r[ée]plica|requerimento|alega[çc][õo]es finais)'
      then 'peticao'

    when p_text ~* '(juntada|certid|distribu[íi]|remess|remetid|recebiment|expedi|cumprim|desarquiv|retifica|cadastr|digitaliza|autos)'
      then 'expediente'

    else 'outros'
  end
$$;

comment on function public.movement_category_from_text(text) is
  'Casa um texto contra a tabela de padrões de categoria. Usada em dois '
  'passos por public.classify_movement(): primeiro nos campos da '
  'classificação TPU, depois no título + descrição.';


create or replace function public.classify_movement(
  p_title       text,
  p_description text,
  p_raw         jsonb
)
returns text
language sql
immutable
as $$
  -- `||` com coalesce em vez de concat_ws: concat_ws é STABLE (depende das
  -- funções de saída dos tipos), e uma função IMMUTABLE não deve chamá-la.
  with tpu as (
    select public.movement_category_from_text(
      coalesce(p_raw -> 'classificacao_predita' ->> 'nome', '')       || ' ' ||
      coalesce(p_raw -> 'classificacao_predita' ->> 'hierarquia', '') || ' ' ||
      coalesce(p_raw -> 'classificacao_predita' ->> 'descricao', '')
    ) as category
  )
  select case
    -- A taxonomia do CNJ decidiu: é ela que vale.
    when (select category from tpu) <> 'outros' then (select category from tpu)
    else public.movement_category_from_text(
      coalesce(p_title, '') || ' ' || coalesce(p_description, '')
    )
  end
$$;

comment on function public.classify_movement(text, text, jsonb) is
  'Natureza do ato. Primeiro passo sobre classificacao_predita em raw_data (a '
  'taxonomia TPU que o sync REST traz), segundo passo sobre título + '
  'descrição. Linhas de webhook só têm o segundo — ver webhook.ts:235.';


create or replace function public.movement_requires_action(
  p_title       text,
  p_description text
)
returns boolean
language sql
immutable
as $$
  -- Só gatilhos de alta precisão: um falso positivo aqui enche a fila de
  -- trabalho de ato que não pede nada, que é exatamente o ruído que a coluna
  -- existe para remover. `.{0,40}` em vez de classe de caracteres acentuados
  -- para não depender de collation.
  select (coalesce(p_title, '') || ' ' || coalesce(p_description, '')) ~* (
    '(intime-se|intimem-se|cite-se|citem-se|notifique-se'
    '|manifeste-se|manifestem-se|cumpra-se'
    '|fica.{0,40}intimad|fica.{0,40}citad'
    '|no prazo de|prazo de [0-9]+|prazo legal|sob pena de'
    '|vista dos autos|abertura de vista'
    -- Nos dois sentidos: o andamento tanto escreve "Designada audiência"
    -- quanto "Audiência de instrução designada para".
    '|designad.{0,20}audi[êe]ncia|designo.{0,20}audi[êe]ncia|audi[êe]ncia.{0,30}designad'
    '|especifiquem as provas'
    '|apresent.{0,30}(contrarraz|contesta|defesa|alega))'
  )
$$;

comment on function public.movement_requires_action(text, text) is
  'Heurística advisory: o texto do ato manda alguém fazer algo. Alimenta o '
  'filtro "Pede providência" e o badge do menu. Nunca cria tarefa nem prazo.';


-- ── Trigger ──────────────────────────────────────────────────────────────────
--
-- No INSERT sempre calcula: nenhuma escrita manda `category` (a coluna é NOT
-- NULL com default, então não há como distinguir "o chamador mandou 'outros'"
-- de "veio do default").
--
-- No UPDATE só dispara quando title, description ou raw_data mudam — é o que
-- preserva uma categoria corrigida à mão.

create or replace function public.set_movement_classification()
returns trigger
language plpgsql
as $$
begin
  new.category := public.classify_movement(new.title, new.description, new.raw_data);
  new.requires_action := public.movement_requires_action(new.title, new.description);
  return new;
end $$;

drop trigger if exists set_movement_classification on public.legal_process_movements;
create trigger set_movement_classification
  before insert or update of title, description, raw_data
  on public.legal_process_movements
  for each row execute function public.set_movement_classification();


-- ── Índices ──────────────────────────────────────────────────────────────────
--
-- ⚠️ A ordenação da lista precisa dos TRÊS campos. `movement_date` é o DIA: a
-- API não informa hora, e a ingestão grava 'yyyy-MM-dd', então dezenas de
-- linhas empatam no mesmo valor. Ordenar só por ele deixa a ordem indefinida
-- entre páginas, e o `.range()` do PostgREST passa a repetir e saltar linhas.
-- `created_at` desempata quase tudo e `id` fecha a ordem total.

create index if not exists idx_movements_feed
  on public.legal_process_movements(movement_date desc, created_at desc, id desc)
  where kind = 'movimentacao';

create index if not exists idx_movements_category
  on public.legal_process_movements(category, movement_date desc)
  where kind = 'movimentacao';

-- A fila de trabalho: o filtro com que a tela abre.
create index if not exists idx_movements_action_queue
  on public.legal_process_movements(movement_date desc)
  where kind = 'movimentacao' and requires_action and handled_at is null;


-- ── Backfill ─────────────────────────────────────────────────────────────────
--
-- Chama as funções direto em vez de tocar coluna vigiada para fazer o trigger
-- disparar — é a razão de `classify_movement` e `movement_requires_action`
-- serem funções próprias e não corpo do trigger.
--
-- Roda sobre TODAS as linhas, inclusive `kind = 'publicacao'` (as legadas,
-- anteriores à migration 44): deixá-las em 'outros' faria a aba de Processos
-- mostrar chip errado nelas.

do $$
declare
  v_total int;
  v_action int;
  r record;
begin
  update public.legal_process_movements
     set category        = public.classify_movement(title, description, raw_data),
         requires_action = public.movement_requires_action(title, description);

  get diagnostics v_total = row_count;

  select count(*) into v_action
    from public.legal_process_movements
   where requires_action;

  raise notice '── Classificação de movimentações ──';
  raise notice 'linhas classificadas ......... %', v_total;
  raise notice 'pedindo providência .......... %', v_action;

  -- A distribuição aparece no log do `db push`. Se 'outros' dominar, os
  -- padrões precisam de ajuste ANTES de a tela depender deles.
  for r in
    select category, count(*) as total
      from public.legal_process_movements
     group by category
     order by total desc
  loop
    -- RAISE só conhece `%`: largura e tipo no estilo printf ('%-14s') não
    -- existem aqui e sairiam como texto literal.
    raise notice '  % ............ %', r.category, r.total;
  end loop;
end $$;


-- ── Agregações para a tela ───────────────────────────────────────────────────
--
-- `security invoker` (o padrão) de propósito: a RLS de `processos:view`
-- continua decidindo o que cada perfil soma. Precedente de RPC próprio no
-- projeto: `retime_event_series` (migration 52).
--
-- ⚠️ `movement_date` é timestamptz e a ingestão grava 'yyyy-MM-dd', que o
-- Postgres interpreta como meia-noite NA SESSÃO. O frontend lê o dia cortando
-- o ISO por posição (`formatMovementDate`, MovimentacoesFeed.tsx:15), o que
-- equivale a ler em UTC. Por isso o dia aqui é `at time zone 'UTC'`: sem isso,
-- uma sessão em outro fuso agruparia o ato no dia anterior ao que a tela
-- mostra. O FILTRO, ao contrário, compara timestamptz direto — é o que mantém
-- o índice utilizável.

create or replace function public.movements_daily_activity(
  p_from date,
  p_to   date
)
returns table (
  day      date,
  category text,
  total    bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (m.movement_date at time zone 'UTC')::date as day,
    m.category,
    count(*)::bigint as total
  from public.legal_process_movements m
  where m.kind = 'movimentacao'
    and m.movement_date >= (p_from::timestamp at time zone 'UTC')
    and m.movement_date <  ((p_to + 1)::timestamp at time zone 'UTC')
  group by 1, 2
  order by 1, 2
$$;

comment on function public.movements_daily_activity(date, date) is
  'Atos por dia e categoria, para o gráfico de pulso. Dias sem ato não vêm — '
  'quem preenche o zero é o TS, como getPublicationsPerDay.';

grant execute on function public.movements_daily_activity(date, date) to authenticated;


-- Processos ATIVOS com CNJ, do mais parado para o mais recente, incluindo os
-- que nunca tiveram movimentação (left join, `days_since` nulo).
--
-- Mesma regra da pendência `stale_movements`
-- (legalProcesses.service.ts:664): só cobra movimentação de quem tem CNJ —
-- sem número não há o que monitorar.
--
-- Devolve só identificação do processo, sem nome de cliente: trazê-lo exigiria
-- reimplementar em SQL o `pickMasterCrmItem` (que tem fallback ordenado) e as
-- três formas de nome de `getClientName`. A linha linka para /processos/{id},
-- onde o cliente já aparece.

create or replace function public.processes_without_movement()
returns table (
  legal_process_id   uuid,
  cnj_number         text,
  court              text,
  last_movement_date date,
  days_since         integer,
  movement_count     bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.cnj_number,
    p.court,
    (max(m.movement_date) at time zone 'UTC')::date,
    (current_date - (max(m.movement_date) at time zone 'UTC')::date)::integer,
    count(m.id)::bigint
  from public.legal_processes p
  left join public.legal_process_movements m
    on m.legal_process_id = p.id
   and m.kind = 'movimentacao'
  where p.status = 'ativo'
    and p.cnj_number is not null
  group by p.id, p.cnj_number, p.court
  order by 5 desc nulls first
$$;

comment on function public.processes_without_movement() is
  'Um processo ativo com CNJ por linha, do mais parado para o menos. '
  'days_since e last_movement_date nulos = nunca movimentou. Alimenta o '
  'painel "Processos em silêncio" de /movimentacoes.';

grant execute on function public.processes_without_movement() to authenticated;
