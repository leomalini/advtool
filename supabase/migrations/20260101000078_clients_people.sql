-- ============================================================
-- 78 — PESSOAS: `clients` PASSA A GUARDAR TODA PESSOA
--
-- Plano: `docs/pessoas.md` (fase 1).
--
-- Quem não é cliente — parte contrária, testemunha, fiador, locador — não
-- tinha onde morar: ou ficava como texto solto nas partes, ou era cadastrado
-- como cliente e aparecia na lista de Clientes, nas Pendências e nos seletores
-- de dono de processo e de lançamento.
--
-- ── Por que a mesma tabela, e não uma `people` ──
-- Todo cliente é uma pessoa, então é o mesmo registro: ser cliente é um estado
-- dele (`client_since`). A unicidade de CPF/CNPJ da migration 59 só vale
-- dentro de uma tabela — com duas, o mesmo CPF existiria como pessoa e como
-- cliente, cada um com metade dos vínculos. E converter vira um update: nada é
-- copiado, e as 15 FKs que já apontam para o registro continuam apontando.
--
-- O nome `clients` fica. Renomear exigiria migration e deploy no mesmo
-- instante, e as colunas `client_id` continuariam com o nome antigo.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Desde quando é cliente
--
-- O backfill só pode rodar junto com a criação da coluna. Numa segunda
-- execução, já com pessoas cadastradas, `set client_since = created_at`
-- transformaria todas elas em clientes — por isso o bloco condicional, e não
-- um `add column if not exists` seguido de update.
--
-- Todo registro de hoje é cliente, e a data mais honesta para eles é a do
-- cadastro.
-- ────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clients'
      and column_name = 'client_since'
  ) then
    alter table public.clients add column client_since timestamptz;
    update public.clients set client_since = created_at;
  end if;
end $$;

-- O default é o que mantém o comportamento de hoje: todo caminho que já insere
-- em `clients` (formulário, "Vincular ou cadastrar", Assistente, leitura de
-- contratos) continua criando CLIENTE sem mudar uma linha. Pessoa nasce só de
-- quem manda `client_since: null` de propósito.
alter table public.clients alter column client_since set default now();

-- O que os leitores filtram. Gerada, para não divergir de `client_since`.
alter table public.clients
  add column if not exists is_client boolean
    generated always as (client_since is not null) stored;

comment on column public.clients.client_since is
  'Quando a pessoa virou cliente. NULL = pessoa que não é cliente (parte '
  'contrária, testemunha, fiador…). Default now(): insert sem a coluna cria '
  'cliente.';

comment on column public.clients.is_client is
  'Derivada de `client_since`. É por ela que listas, seletores de dono e '
  'pendências separam clientes das demais pessoas.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. A conversão, nos dois sentidos
--
-- Pessoa → cliente exige `clientes:create`. A RLS de update é `clientes:update`
-- e não distingue a coluna — e o perfil `finance` tem `update` sem `create`:
-- sem esta trava, converter seria um jeito de cadastrar cliente sem poder.
-- Sem `auth.uid()` (service_role, SQL editor) não há perfil a conferir, como
-- no trigger de audiências da migration 76.
--
-- Cliente → pessoa ("Mover para Pessoas") só para quem não é dono de nada:
-- processo ou caso, contrato, lançamento ou link de acompanhamento ativo. É a
-- limpeza das partes contrárias que o "Vincular ou cadastrar" cadastrou como
-- cliente. Um dono que deixasse de ser cliente faria um processo ter como
-- cliente alguém que não aparece em Clientes. Link revogado não conta: a
-- linha fica pelo histórico de acessos, e não dá acesso a nada.
--
-- `PT409` responde HTTP 409 pelo PostgREST, como na migration 67.
--
-- `security definer` porque a trava não pode depender do que quem chama
-- enxerga: um lançamento invisível para o perfil faria a consulta voltar
-- vazia e a trava passar calada.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_client_since()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owns text[];
begin
  if new.client_since is not distinct from old.client_since then
    return new;
  end if;

  if old.client_since is null then
    if auth.uid() is not null and not public.can('clientes', 'create') then
      raise exception using
        errcode = '42501',
        message = 'Sem permissão para tornar esta pessoa cliente.',
        hint    = 'Converter exige a permissão de cadastrar clientes.';
    end if;
    return new;
  end if;

  if new.client_since is null then
    v_owns := array_remove(array[
      case when exists (select 1 from public.crm_items where client_id = old.id)
        then 'processos ou casos' end,
      case when exists (select 1 from public.contracts where client_id = old.id)
        then 'contratos' end,
      case when exists (select 1 from public.financial_entries where client_id = old.id)
        then 'lançamentos' end,
      case when exists (
        select 1 from public.client_portal_links
        where client_id = old.id and revoked_at is null
      ) then 'link de acompanhamento ativo' end
    ], null);

    if cardinality(v_owns) > 0 then
      raise exception using
        errcode = 'PT409',
        message = 'Este cliente tem ' || array_to_string(v_owns, ', ')
                  || ' e não pode voltar a ser só pessoa.',
        hint    = 'Desvincule esses registros dele antes de mover para Pessoas.';
    end if;
  end if;

  return new;
end $$;

comment on function public.guard_client_since() is
  'Conversão pessoa ↔ cliente (migration 78): virar cliente exige '
  'clientes:create; deixar de ser exige não ser dono de nada. SQLSTATE '
  '42501 / PT409.';

revoke all on function public.guard_client_since() from public, anon, authenticated;

-- `update of`: só roda quando `client_since` está no SET. Editar o telefone
-- não paga as consultas.
drop trigger if exists guard_client_since on public.clients;
create trigger guard_client_since
  before update of client_since on public.clients
  for each row execute function public.guard_client_since();
