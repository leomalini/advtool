-- ============================================================
-- 57 — PORTAL DO CLIENTE (link de acompanhamento)
--
-- Uma rota pública, somente leitura, onde o cliente acompanha os próprios
-- processos sem cadastro e sem senha: `/acompanhar/<token>`.
--
-- Deliberadamente NÃO é um módulo para o cliente. É uma página só, alimentada
-- por Route Handlers, e o banco ganha apenas o que essa página exige: onde o
-- token vive, quem tentou usá-lo e o que fica escondido.
--
-- ── Por que nenhuma policy para `anon` ──
-- A tentação seria abrir `select` em clients/legal_processes/movements para
-- `anon` com um predicado sobre o token. Não é feito aqui, de propósito: uma
-- policy aberta a anônimo erra no sentido perigoso — se o predicado tiver um
-- furo, o PostgREST devolve a base inteira para qualquer um com a chave `anon`,
-- que está no bundle do browser por definição. A leitura do portal passa pela
-- service_role dentro de `/api/portal/*`, depois de validar o token. A
-- superfície pública fica sendo uma rota, não o PostgREST.
--
-- As tabelas abaixo continuam com RBAC normal: são lidas pelo ESCRITÓRIO na
-- tela do cliente. Quem as lê sem sessão é a service_role, que ignora RLS.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. `client_portal_links` — o token
--
-- Guarda o SHA-256 do token, nunca o token. Um dump do banco não devolve
-- nenhum link utilizável, e o escritório reconhece a linha pelo `token_hint`.
--
-- O token é por CLIENTE, não por processo: processo novo entra sozinho no link
-- que o cliente já tem, sem nada para reenviar.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.client_portal_links (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,

  /** SHA-256 do token, em hexa. A busca no acesso é por este valor. */
  token_hash        text not null unique,
  /** Últimos 6 caracteres do token, só para o escritório reconhecer a linha na
   * tela. Curto o bastante para não ajudar quem tentasse adivinhar o resto. */
  token_hint        text not null,

  /** NULL = não expira. O link é vitalício por padrão: um link que morre sozinho
   * vira uma ligação para o escritório, que é justamente o que ele evita. */
  expires_at        timestamptz,
  /** Preenchido corta o acesso na hora. Revogar não apaga a linha — o histórico
   * de acessos aponta para ela. */
  revoked_at        timestamptz,

  last_accessed_at  timestamptz,
  access_count      integer not null default 0,

  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

/** No máximo um link ativo por cliente. Emitir outro revoga o anterior (a rota
 * faz isso na mesma transação lógica), então dois links vivos para o mesmo
 * cliente indicam bug, não um caso de uso. `now()` não é imutável e não pode
 * entrar no predicado — a expiração é conferida no código. */
create unique index if not exists idx_client_portal_links_active
  on public.client_portal_links(client_id)
  where revoked_at is null;

create index if not exists idx_client_portal_links_client
  on public.client_portal_links(client_id);

drop trigger if exists set_updated_at on public.client_portal_links;
create trigger set_updated_at before update on public.client_portal_links
  for each row execute function public.set_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- 2. `client_portal_access_log` — quem bateu na porta
--
-- Rota pública sem log é rota que não dá para investigar. Cada tentativa vira
-- uma linha, inclusive (principalmente) as recusadas: uma sequência de
-- `document_mismatch` no mesmo link é alguém tentando adivinhar o CPF.
--
-- `link_id` é nullable porque token inválido não corresponde a link nenhum —
-- e é exatamente a tentativa que mais interessa registrar.
--
-- O IP é gravado como hash: serve para contar tentativas da mesma origem, que
-- é todo o uso que se faz dele aqui, sem guardar o endereço em claro.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.client_portal_access_log (
  id          uuid primary key default gen_random_uuid(),

  link_id     uuid references public.client_portal_links(id) on delete cascade,
  client_id   uuid references public.clients(id) on delete set null,

  outcome     text not null check (outcome in (
    'granted',            -- token válido + documento conferido
    'token_invalid',      -- nenhum link com esse hash
    'token_revoked',
    'token_expired',
    'document_mismatch',  -- token certo, documento errado
    'rate_limited'
  )),

  ip_hash     text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_client_portal_access_log_link
  on public.client_portal_access_log(link_id, created_at desc);

create index if not exists idx_client_portal_access_log_created
  on public.client_portal_access_log(created_at desc);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Visibilidade da movimentação
--
-- Decisão: o portal nasce ÚTIL. Movimentação processual aparece por padrão —
-- ela já é pública no site do tribunal, e um portal que começa vazio só
-- funciona se alguém marcar item por item toda semana, o que não acontece.
--
-- A exceção é `kind = 'publicacao'`: intimação é dirigida ao advogado, carrega
-- prazo e linguagem que assusta fora de contexto. Nasce oculta — o trigger
-- abaixo cuida disso — e o escritório libera caso a caso se quiser.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.legal_process_movements
  add column if not exists hidden_from_client boolean not null default false;

/** Só no INSERT. No UPDATE o valor é a decisão explícita do escritório: é
 * assim que "mostrar esta intimação ao cliente" funciona, e um trigger que
 * rodasse no update desfaria o clique. */
create or replace function public.hide_publicacao_from_client()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind = 'publicacao' then
    new.hidden_from_client := true;
  end if;
  return new;
end;
$$;

drop trigger if exists hide_publicacao_from_client on public.legal_process_movements;
create trigger hide_publicacao_from_client
  before insert on public.legal_process_movements
  for each row execute function public.hide_publicacao_from_client();

-- As publicações que já estão na base seguem a mesma regra.
update public.legal_process_movements
   set hidden_from_client = true
 where kind = 'publicacao' and not hidden_from_client;

/** O portal lista as visíveis de um processo — é a consulta quente da página. */
create index if not exists idx_movements_client_visible
  on public.legal_process_movements(legal_process_id, movement_date desc)
  where not hidden_from_client;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS
--
-- Emitir e revogar link é mexer no cadastro do cliente: `clientes:update`.
-- Ver a lista exige `clientes:view`.
--
-- Nenhuma das duas tabelas aceita DELETE de ninguém: link revogado e log de
-- acesso são histórico: a única forma de tirar um link do ar é `revoked_at`.
-- O log não aceita INSERT por sessão nenhuma — quem grava é a rota pública,
-- pela service_role, que ignora RLS.
-- ────────────────────────────────────────────────────────────────────────────

select public.apply_rbac_policies(
  'client_portal_links',
  'clientes:view', 'clientes:update', 'clientes:update', null
);

select public.apply_rbac_policies(
  'client_portal_access_log',
  'clientes:view', null, null, null
);
