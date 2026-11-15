-- ============================================================
-- 91 — BUSCA PAGINADA DE CLIENTES E PESSOAS
-- ============================================================
--
-- As listas de Clientes e de Pessoas paginam no servidor (docs/paginacao.md).
-- Filtro de cadastro (`is_client`), de área (`legal_areas`), ordem e página
-- são encadeados pelo PostgREST; o que ele não consegue expressar é a busca,
-- porque ela olha também os contatos (`client_contacts`) — e um OR entre a
-- tabela e um recurso embutido não existe no PostgREST.
--
-- Por isso uma função, e não uma view: ela devolve `setof public.clients`, e o
-- PostgREST embute recursos em funções que devolvem o tipo de uma tabela. A
-- tela continua recebendo o cadastro com `contacts` e `addresses`, como antes.
--
-- A busca espelha a que a tela fazia no navegador, sem diferenciar maiúsculas:
-- nome, razão social e nome fantasia; e-mail; telefone; documento como
-- gravado e só com dígitos; e o valor de qualquer contato. `strpos`, e não
-- `ilike`: `%` e `_` digitados na busca são texto, não curinga.
--
-- `security invoker` (o padrão) de propósito: a RLS de `clientes:view`
-- (apply_rbac_policies, migration 35) vale aqui como vale na tabela.

create or replace function public.search_clients(p_search text)
returns setof public.clients
language sql
stable
security invoker
set search_path = public
as $$
  with term as (
    select
      lower(btrim(coalesce(p_search, ''))) as q,
      regexp_replace(coalesce(p_search, ''), '\D', '', 'g') as digits
  )
  select c.*
  from public.clients c
  cross join term t
  where t.q = ''
     or strpos(lower(coalesce(c.name, '')), t.q) > 0
     or strpos(lower(coalesce(c.company_name, '')), t.q) > 0
     or strpos(lower(coalesce(c.trade_name, '')), t.q) > 0
     or strpos(lower(coalesce(c.email, '')), t.q) > 0
     or strpos(lower(coalesce(c.phone, '')), t.q) > 0
     or strpos(lower(coalesce(c.cpf, '')), t.q) > 0
     or strpos(lower(coalesce(c.cnpj, '')), t.q) > 0
     or (
       t.digits <> ''
       and (
         strpos(coalesce(c.cpf_digits, ''), t.digits) > 0
         or strpos(coalesce(c.cnpj_digits, ''), t.digits) > 0
       )
     )
     or exists (
       select 1
       from public.client_contacts cc
       where cc.client_id = c.id
         and strpos(lower(cc.value), t.q) > 0
     )
$$;

grant execute on function public.search_clients(text) to authenticated;
