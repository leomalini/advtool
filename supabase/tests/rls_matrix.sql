-- ============================================================
-- Matriz de visibilidade por perfil — verificação da Fase 3
--
-- Rodar no SQL Editor do Supabase DEPOIS das migrations 35–38 e 63.
--
-- Responde a pergunta que o `rbac_fase1_check.sql` não alcança: com as policies
-- no lugar, o que cada perfil realmente ENXERGA? RLS negando não gera erro,
-- devolve lista vazia — então o único jeito de conferir é contar linhas
-- assumindo a identidade de cada perfil.
--
-- Como funciona: pega o profile mais antigo, troca o `role` dele quatro vezes,
-- e para cada troca conta as linhas visíveis em cada tabela representativa. Tudo
-- dentro de uma transação com `rollback` no fim — o perfil da pessoa volta ao
-- que era, nada é gravado.
--
-- COMO LER O RESULTADO
--   `total` é a contagem sem RLS (como postgres). Cada coluna de perfil é o que
--   aquele perfil vê.
--     · igual a `total`  → enxerga tudo (esperado na maioria das linhas, porque
--                          a decisão 2 do planejamento é "todos veem tudo")
--     · 0 com total > 0  → bloqueado (esperado só onde a matriz nega)
--     · 0 com total = 0  → tabela vazia, o teste não diz nada
--
-- ESPERADO
--   financial_entries    → paralegal = 0, os outros três = total
--   documents_lancamento → paralegal = 0, os outros três = total (anexos de
--                          lançamento seguem o Financeiro — migration 63)
--   documents            → paralegal = total menos documents_lancamento;
--                          os outros três = total
--   todo o resto         → os quatro perfis = total
--
-- Só o Financeiro nega leitura em toda a matriz, e isso não é teste fraco: é a
-- decisão 2 do planejamento ("todos veem tudo do escritório") ficando visível.
-- O que os perfis mais restritos perdem é ESCRITA, e escrita não dá para
-- exercitar aqui sem sujar a base — isso se confere na tela, com uma conta de
-- cada perfil. As tabelas mortas `leads*` ficam de fora do probe porque podem
-- não existir na base; a migration 36 as tranca sem criar policy nenhuma.
-- ============================================================

begin;

-- Coleta dos resultados. Precisa de grant explícito: a tabela nasce como
-- postgres e os probes rodam como `authenticated`.
create temporary table rls_probe (perfil text, tabela text, linhas bigint);
grant all on rls_probe to authenticated;

-- Alvo da impersonação: o profile mais antigo. Guardado à parte porque o `role`
-- dele muda a cada rodada.
create temporary table rls_alvo as
  select id from public.profiles order by created_at limit 1;


-- ── Baseline: contagem real, sem RLS ────────────────────────────────────────
insert into rls_probe
select 'total', t.tabela, t.linhas from (
  select 'financial_entries' as tabela, count(*) as linhas from public.financial_entries
  union all select 'clients',         count(*) from public.clients
  union all select 'crm_items',       count(*) from public.crm_items
  union all select 'legal_processes', count(*) from public.legal_processes
  union all select 'documents',       count(*) from public.documents
  union all select 'documents_lancamento', count(*) from public.documents where financial_entry_id is not null
  union all select 'events',          count(*) from public.events
  union all select 'tasks',           count(*) from public.tasks
  union all select 'activities',      count(*) from public.activities
  union all select 'workflows',       count(*) from public.workflows
  union all select 'event_types',     count(*) from public.event_types
  union all select 'profiles',        count(*) from public.profiles
) t;


-- ── admin ───────────────────────────────────────────────────────────────────
update public.profiles set role = 'admin', is_active = true
where id = (select id from rls_alvo);

select set_config('request.jwt.claims',
  json_build_object('sub', (select id from rls_alvo), 'role', 'authenticated')::text,
  true);
set local role authenticated;

insert into rls_probe
select 'admin', t.tabela, t.linhas from (
  select 'financial_entries' as tabela, count(*) as linhas from public.financial_entries
  union all select 'clients',         count(*) from public.clients
  union all select 'crm_items',       count(*) from public.crm_items
  union all select 'legal_processes', count(*) from public.legal_processes
  union all select 'documents',       count(*) from public.documents
  union all select 'documents_lancamento', count(*) from public.documents where financial_entry_id is not null
  union all select 'events',          count(*) from public.events
  union all select 'tasks',           count(*) from public.tasks
  union all select 'activities',      count(*) from public.activities
  union all select 'workflows',       count(*) from public.workflows
  union all select 'event_types',     count(*) from public.event_types
  union all select 'profiles',        count(*) from public.profiles
) t;
reset role;


-- ── attorney ────────────────────────────────────────────────────────────────
update public.profiles set role = 'attorney' where id = (select id from rls_alvo);
set local role authenticated;

insert into rls_probe
select 'attorney', t.tabela, t.linhas from (
  select 'financial_entries' as tabela, count(*) as linhas from public.financial_entries
  union all select 'clients',         count(*) from public.clients
  union all select 'crm_items',       count(*) from public.crm_items
  union all select 'legal_processes', count(*) from public.legal_processes
  union all select 'documents',       count(*) from public.documents
  union all select 'documents_lancamento', count(*) from public.documents where financial_entry_id is not null
  union all select 'events',          count(*) from public.events
  union all select 'tasks',           count(*) from public.tasks
  union all select 'activities',      count(*) from public.activities
  union all select 'workflows',       count(*) from public.workflows
  union all select 'event_types',     count(*) from public.event_types
  union all select 'profiles',        count(*) from public.profiles
) t;
reset role;


-- ── paralegal ───────────────────────────────────────────────────────────────
update public.profiles set role = 'paralegal' where id = (select id from rls_alvo);
set local role authenticated;

insert into rls_probe
select 'paralegal', t.tabela, t.linhas from (
  select 'financial_entries' as tabela, count(*) as linhas from public.financial_entries
  union all select 'clients',         count(*) from public.clients
  union all select 'crm_items',       count(*) from public.crm_items
  union all select 'legal_processes', count(*) from public.legal_processes
  union all select 'documents',       count(*) from public.documents
  union all select 'documents_lancamento', count(*) from public.documents where financial_entry_id is not null
  union all select 'events',          count(*) from public.events
  union all select 'tasks',           count(*) from public.tasks
  union all select 'activities',      count(*) from public.activities
  union all select 'workflows',       count(*) from public.workflows
  union all select 'event_types',     count(*) from public.event_types
  union all select 'profiles',        count(*) from public.profiles
) t;
reset role;


-- ── finance ─────────────────────────────────────────────────────────────────
update public.profiles set role = 'finance' where id = (select id from rls_alvo);
set local role authenticated;

insert into rls_probe
select 'finance', t.tabela, t.linhas from (
  select 'financial_entries' as tabela, count(*) as linhas from public.financial_entries
  union all select 'clients',         count(*) from public.clients
  union all select 'crm_items',       count(*) from public.crm_items
  union all select 'legal_processes', count(*) from public.legal_processes
  union all select 'documents',       count(*) from public.documents
  union all select 'documents_lancamento', count(*) from public.documents where financial_entry_id is not null
  union all select 'events',          count(*) from public.events
  union all select 'tasks',           count(*) from public.tasks
  union all select 'activities',      count(*) from public.activities
  union all select 'workflows',       count(*) from public.workflows
  union all select 'event_types',     count(*) from public.event_types
  union all select 'profiles',        count(*) from public.profiles
) t;
reset role;


-- ── Resultado ───────────────────────────────────────────────────────────────
select
  tabela,
  max(linhas) filter (where perfil = 'total')     as total,
  max(linhas) filter (where perfil = 'admin')     as admin,
  max(linhas) filter (where perfil = 'attorney')  as attorney,
  max(linhas) filter (where perfil = 'paralegal') as paralegal,
  max(linhas) filter (where perfil = 'finance')   as finance
from rls_probe
group by tabela
order by tabela;

rollback;
