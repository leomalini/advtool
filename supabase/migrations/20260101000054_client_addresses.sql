-- ============================================================
-- 54 — Mais de um endereço por cliente
--
-- Os sete `address_*` de `clients` (migration 3) davam um endereço só. Não
-- basta: o cliente tem o residencial, que é o que entra na qualificação da
-- petição, e o de correspondência, que é para onde o escritório manda carta.
-- Quem precisava dos dois escrevia o segundo em `notes`, onde nenhum gerador
-- de peça consegue ler.
--
-- Tabela filha, e não mais sete colunas: a lista é aberta, e `client_contacts`
-- (migration 8) já resolveu o mesmo problema para telefone e e-mail. As
-- colunas de `clients` são migradas e removidas no fim deste arquivo — manter
-- as duas formas criaria dois endereços "principais" que divergiriam na
-- primeira edição.
-- ============================================================

create table if not exists public.client_addresses (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  -- `kind`, e não `type`: em `clients`, `type` já significa PF/PJ, e as duas
  -- colunas chegam juntas ao TypeScript pelo embed.
  kind         text not null default 'residencial'
                 check (kind in ('residencial', 'comercial', 'correspondencia', 'outro')),
  street       text,
  number       text,
  complement   text,
  neighborhood text,
  city         text,
  state        text,
  zip          text,
  -- O que entra na qualificação. Um por cliente, garantido pelo índice abaixo.
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_client_addresses_client_id
  on public.client_addresses(client_id);

-- Único parcial: o banco recusa um segundo principal para o mesmo cliente. Sem
-- isto, "qual é o endereço da petição" voltaria a ter mais de uma resposta.
create unique index if not exists idx_client_addresses_primary
  on public.client_addresses(client_id)
  where is_primary;

drop trigger if exists set_updated_at on public.client_addresses;
create trigger set_updated_at before update on public.client_addresses
  for each row execute function public.set_updated_at();

-- Sub-entidade segue o pai (convenção do cabeçalho da migration 36): quem
-- enxerga o cliente enxerga os endereços, e mexer neles é editar o cliente —
-- por isso insert/update/delete pedem `clientes:update`, não `:create`/`:delete`.
alter table public.client_addresses enable row level security;

select public.apply_rbac_policies(
  'client_addresses',
  'clientes:view', 'clientes:update', 'clientes:update', 'clientes:update'
);

-- ── Backfill ─────────────────────────────────────────────────────────────────
--
-- Um endereço por cliente que tenha qualquer um dos sete campos preenchido.
-- Entra como principal, porque até aqui era o único. O `not exists` deixa o
-- arquivo rodar de novo sem duplicar.

insert into public.client_addresses (
  client_id, kind, street, number, complement, neighborhood, city, state, zip, is_primary
)
select
  c.id,
  case when c.type = 'company' then 'comercial' else 'residencial' end,
  c.address_street,
  c.address_number,
  c.address_complement,
  c.address_neighborhood,
  c.address_city,
  c.address_state,
  c.address_zip,
  true
from public.clients c
where coalesce(
        nullif(trim(c.address_street), ''),
        nullif(trim(c.address_number), ''),
        nullif(trim(c.address_complement), ''),
        nullif(trim(c.address_neighborhood), ''),
        nullif(trim(c.address_city), ''),
        nullif(trim(c.address_state), ''),
        nullif(trim(c.address_zip), '')
      ) is not null
  and not exists (
    select 1 from public.client_addresses a where a.client_id = c.id
  );

-- ── Remoção das colunas antigas ──────────────────────────────────────────────
--
-- O dado já está em `client_addresses` pelo passo acima.

alter table public.clients
  drop column if exists address_street,
  drop column if exists address_number,
  drop column if exists address_complement,
  drop column if exists address_neighborhood,
  drop column if exists address_city,
  drop column if exists address_state,
  drop column if exists address_zip;
