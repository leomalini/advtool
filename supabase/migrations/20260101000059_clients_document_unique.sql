-- ============================================================
-- 59 — UM DOCUMENTO, UM CLIENTE
--
-- `clients.cpf` e `clients.cnpj` nunca tiveram unicidade. O efeito aparecia na
-- importação de processo: as partes chegam da API com nome e documento, o
-- código cadastrava direto sem procurar, e o mesmo CPF virava dois clientes —
-- cada um com metade dos processos, das tarefas e dos lançamentos.
--
-- ── Por que uma coluna gerada, e não um índice sobre `cpf` ──
-- O documento é gravado ora mascarado ('123.456.789-00', vindo do formulário),
-- ora em dígitos puros ('12345678900', vindo do tribunal). Um índice único
-- sobre a coluna crua trataria os dois como valores diferentes e deixaria
-- passar exatamente a duplicata que ele deveria impedir.
--
-- A coluna gerada normaliza uma vez, no banco, e serve às duas necessidades:
-- é sobre ela que a unicidade vale E é por ela que a aplicação PROCURA um
-- cliente pelo documento — o PostgREST não tem como aplicar `regexp_replace`
-- num filtro, então sem a coluna a busca teria de adivinhar a máscara.
--
-- ⚠️ SE ESTA MIGRATION FALHAR com 'DOCUMENTOS DUPLICADOS', a base já tem o
-- problema que ela impede. O erro lista os documentos e os ids envolvidos:
-- unifique os cadastros (mova processos/tarefas/lançamentos para um deles e
-- apague o outro) e rode de novo.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Colunas normalizadas
--
-- Duas, e não uma `coalesce(cpf, cnpj)`: um cadastro com os dois campos
-- preenchidos deixaria o segundo fora da unicidade, que é o furo silencioso.
-- `regexp_replace` é IMMUTABLE, requisito para coluna gerada e para índice.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.clients
  add column if not exists cpf_digits text
    generated always as (nullif(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), '')) stored,
  add column if not exists cnpj_digits text
    generated always as (nullif(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g'), '')) stored;

comment on column public.clients.cpf_digits is
  'CPF só com dígitos, derivado de `cpf`. Existe para a unicidade e para a '
  'busca por documento — o valor cru ora vem mascarado, ora não.';

comment on column public.clients.cnpj_digits is
  'CNPJ só com dígitos, derivado de `cnpj`. Mesma razão de `cpf_digits`.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Recusa explícita quando a base já tem duplicata
--
-- `create unique index` sobre dados duplicados falha com "could not create
-- unique index ... Key (cpf_digits)=(...) is duplicated" — tecnicamente
-- correto e praticamente inútil, porque mostra UMA colisão e nenhum id.
--
-- O bloco abaixo levanta antes, com a lista inteira, para o expurgo ser feito
-- de uma vez em vez de uma migration por duplicata encontrada.
-- ────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_report text;
begin
  select string_agg(linha, e'\n')
    into v_report
  from (
    select format('  %s %s → clientes: %s', rotulo, documento, ids) as linha
    from (
      select 'CPF ' as rotulo, cpf_digits as documento,
             string_agg(id::text, ', ' order by created_at) as ids
      from public.clients
      where cpf_digits is not null
      group by cpf_digits
      having count(*) > 1

      union all

      select 'CNPJ', cnpj_digits,
             string_agg(id::text, ', ' order by created_at)
      from public.clients
      where cnpj_digits is not null
      group by cnpj_digits
      having count(*) > 1
    ) duplicados
  ) linhas;

  if v_report is not null then
    raise exception e'DOCUMENTOS DUPLICADOS — unifique os cadastros antes de aplicar esta migration:\n%', v_report
      using errcode = '23505';
  end if;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. A unicidade
--
-- Parciais: cadastro sem documento é legítimo e corriqueiro (lead que virou
-- cliente antes de a documentação chegar). O que não pode existir é o MESMO
-- documento em duas fichas.
-- ────────────────────────────────────────────────────────────────────────────

create unique index if not exists uq_clients_cpf_digits
  on public.clients(cpf_digits)
  where cpf_digits is not null;

create unique index if not exists uq_clients_cnpj_digits
  on public.clients(cnpj_digits)
  where cnpj_digits is not null;
