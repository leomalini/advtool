-- ============================================================
-- 34 — RBAC: perfis, matriz de permissões e blindagem de `profiles`
--
-- Fase 1 de `docs/PLANEJAMENTO-MULTIUSUARIO.md`.
--
-- Até aqui o produto era single-user na prática: `profiles.role` existia com
-- dois valores mas não controlava nada, e 100% das tabelas usavam a mesma
-- policy `auth_full ... using (auth.role() = 'authenticated')`. Qualquer pessoa
-- logada lia, editava e apagava tudo.
--
-- Esta migration NÃO restringe nenhum módulo ainda — isso é a Fase 3. Ela
-- monta a fundação e fecha o buraco que a Fase 3 tornaria explorável:
--
--   1. `profiles.role` passa a aceitar os quatro perfis reais
--   2. `profiles.is_active` — desativar em vez de apagar (as FKs de
--      `created_by`/`author_id` impedem delete de usuário)
--   3. `role_permissions` — a matriz recurso × ação, fonte ÚNICA de verdade,
--      lida tanto pelas policies quanto pelo frontend
--   4. `app_role()`, `is_active_member()`, `can()`, `is_admin()`
--   5. Policies de `profiles` + trigger anti-escalada
--
-- ⚠️ O QUE ISTO CONSERTA HOJE
-- A policy `auth_full` em `profiles` é `for all` — qualquer usuário autenticado
-- podia rodar `update profiles set role='admin' where id = auth.uid()`. Hoje
-- não tem efeito porque `role` não controla nada; a partir da Fase 3 seria
-- escalada de privilégio direta. Por isso esta migration vem ANTES de qualquer
-- permissão passar a valer.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Perfis e status de acesso
-- ────────────────────────────────────────────────────────────────────────────

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'attorney', 'paralegal', 'finance'));

-- Default `true`: os usuários que já existem continuam entrando normalmente.
-- Contas NOVAS nascem inativas — ver a nota no `handle_new_user()` abaixo.
alter table public.profiles
  add column if not exists is_active boolean not null default true;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Matriz de permissões
--
-- Mora no banco, e não num objeto TypeScript, porque as policies de RLS
-- precisam dela e o frontend também. Duas cópias divergiriam — foi exatamente
-- assim que nasceram os incidentes registrados em `supabase/README.md`.
--
-- Sem herança entre perfis: cada célula é uma linha explícita. `manage` não
-- implica `view`; quem precisa dos dois recebe os dois.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.role_permissions (
  role     text not null check (role in ('admin', 'attorney', 'paralegal', 'finance')),
  resource text not null,
  action   text not null check (action in ('view', 'create', 'update', 'delete', 'manage')),
  primary key (role, resource, action)
);

comment on table public.role_permissions is
  'Matriz recurso x ação por perfil. Fonte única de verdade da autorização: '
  'lida pelas policies via public.can() e pelo frontend via usePermissions().';

insert into public.role_permissions (role, resource, action) values
  -- ── admin — tudo, incluindo administrar o sistema ────────────────────────
  ('admin', 'dashboard',     'view'),
  ('admin', 'crm',           'view'),   ('admin', 'crm',           'create'),
  ('admin', 'crm',           'update'), ('admin', 'crm',           'delete'),
  ('admin', 'processos',     'view'),   ('admin', 'processos',     'create'),
  ('admin', 'processos',     'update'), ('admin', 'processos',     'delete'),
  ('admin', 'clientes',      'view'),   ('admin', 'clientes',      'create'),
  ('admin', 'clientes',      'update'), ('admin', 'clientes',      'delete'),
  ('admin', 'agenda',        'view'),   ('admin', 'agenda',        'create'),
  ('admin', 'agenda',        'update'), ('admin', 'agenda',        'delete'),
  ('admin', 'tarefas',       'view'),   ('admin', 'tarefas',       'create'),
  ('admin', 'tarefas',       'update'), ('admin', 'tarefas',       'delete'),
  ('admin', 'documentos',    'view'),   ('admin', 'documentos',    'create'),
  ('admin', 'documentos',    'update'), ('admin', 'documentos',    'delete'),
  ('admin', 'financeiro',    'view'),   ('admin', 'financeiro',    'create'),
  ('admin', 'financeiro',    'update'), ('admin', 'financeiro',    'delete'),
  ('admin', 'pendencias',    'view'),
  ('admin', 'configuracoes', 'view'),   ('admin', 'configuracoes', 'manage'),
  ('admin', 'usuarios',      'view'),   ('admin', 'usuarios',      'manage'),

  -- ── attorney — igual ao admin sobre os DADOS do escritório, incluindo
  --    controle total do Financeiro (decisão 4 do planejamento). O que não
  --    tem: administrar usuários e a estrutura do sistema. ─────────────────
  ('attorney', 'dashboard',     'view'),
  ('attorney', 'crm',           'view'),   ('attorney', 'crm',        'create'),
  ('attorney', 'crm',           'update'), ('attorney', 'crm',        'delete'),
  ('attorney', 'processos',     'view'),   ('attorney', 'processos',  'create'),
  ('attorney', 'processos',     'update'), ('attorney', 'processos',  'delete'),
  ('attorney', 'clientes',      'view'),   ('attorney', 'clientes',   'create'),
  ('attorney', 'clientes',      'update'), ('attorney', 'clientes',   'delete'),
  ('attorney', 'agenda',        'view'),   ('attorney', 'agenda',     'create'),
  ('attorney', 'agenda',        'update'), ('attorney', 'agenda',     'delete'),
  ('attorney', 'tarefas',       'view'),   ('attorney', 'tarefas',    'create'),
  ('attorney', 'tarefas',       'update'), ('attorney', 'tarefas',    'delete'),
  ('attorney', 'documentos',    'view'),   ('attorney', 'documentos', 'create'),
  ('attorney', 'documentos',    'update'), ('attorney', 'documentos', 'delete'),
  ('attorney', 'financeiro',    'view'),   ('attorney', 'financeiro', 'create'),
  ('attorney', 'financeiro',    'update'), ('attorney', 'financeiro', 'delete'),
  ('attorney', 'pendencias',    'view'),
  ('attorney', 'configuracoes', 'view'),

  -- ── paralegal (estagiário) — cria e edita, nunca apaga; sem Financeiro.
  --    A exceção é a Agenda, onde apagar o próprio compromisso é rotina. ───
  ('paralegal', 'dashboard',  'view'),
  ('paralegal', 'crm',        'view'), ('paralegal', 'crm',        'create'), ('paralegal', 'crm',        'update'),
  ('paralegal', 'processos',  'view'), ('paralegal', 'processos',  'create'), ('paralegal', 'processos',  'update'),
  ('paralegal', 'clientes',   'view'), ('paralegal', 'clientes',   'create'), ('paralegal', 'clientes',   'update'),
  ('paralegal', 'agenda',     'view'), ('paralegal', 'agenda',     'create'), ('paralegal', 'agenda',     'update'),
  ('paralegal', 'agenda',     'delete'),
  ('paralegal', 'tarefas',    'view'), ('paralegal', 'tarefas',    'create'), ('paralegal', 'tarefas',    'update'),
  ('paralegal', 'documentos', 'view'), ('paralegal', 'documentos', 'create'), ('paralegal', 'documentos', 'update'),
  ('paralegal', 'pendencias', 'view'),

  -- ── finance (financeiro/secretariado) — dono do Financeiro, leitura do
  --    resto para conseguir vincular um lançamento ao caso certo. ─────────
  ('finance', 'dashboard',  'view'),
  ('finance', 'crm',        'view'),
  ('finance', 'processos',  'view'),
  ('finance', 'clientes',   'view'),   ('finance', 'clientes',   'update'),
  ('finance', 'agenda',     'view'),   ('finance', 'agenda',     'create'),
  ('finance', 'agenda',     'update'), ('finance', 'agenda',     'delete'),
  ('finance', 'tarefas',    'view'),   ('finance', 'tarefas',    'create'),
  ('finance', 'tarefas',    'update'),
  ('finance', 'documentos', 'view'),
  ('finance', 'financeiro', 'view'),   ('finance', 'financeiro', 'create'),
  ('finance', 'financeiro', 'update'), ('finance', 'financeiro', 'delete')
on conflict (role, resource, action) do nothing;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Funções de autorização
--
-- Todas `security definer` — precisam ler `profiles`/`role_permissions` sem
-- disparar as policies dessas mesmas tabelas, que é o que causaria recursão
-- infinita. E todas com `set search_path = public` fixo: sem isso, um schema
-- na frente do search_path do chamador poderia sequestrar as referências
-- (é também o que o `supabase db advisors` cobra).
--
-- Nas policies, chamar SEMPRE embrulhado em `(select ...)` — assim o Postgres
-- avalia como InitPlan, uma vez por statement, em vez de uma vez por linha.
-- ────────────────────────────────────────────────────────────────────────────

/** Perfil do usuário da sessão. NULL se não houver sessão ou se a conta estiver
 * desativada. Nome deliberadamente distinto de `auth.role()`, que devolve
 * 'authenticated'/'anon' e continua existindo com outro significado. */
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and is_active
$$;

/** Sessão válida E conta ativa. */
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active
  )
$$;

/** A pergunta que toda policy faz. Uma query só: perfil + matriz. */
create or replace function public.can(p_resource text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role = p.role
    where p.id = auth.uid()
      and p.is_active
      and rp.resource = p_resource
      and rp.action   = p_action
  )
$$;

/** Atalho para o caso mais comum. Equivale a can('usuarios','manage'). */
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and role = 'admin'
  )
$$;

-- `anon` também recebe EXECUTE de propósito: sem sessão, `auth.uid()` é NULL e
-- as funções devolvem false/NULL. Negar o EXECUTE trocaria uma negação limpa
-- por "permission denied for function" — mesmo bloqueio, erro pior.
revoke execute on function public.app_role()            from public;
revoke execute on function public.is_active_member()    from public;
revoke execute on function public.can(text, text)       from public;
revoke execute on function public.is_admin()            from public;

grant execute on function public.app_role()         to anon, authenticated, service_role;
grant execute on function public.is_active_member() to anon, authenticated, service_role;
grant execute on function public.can(text, text)    to anon, authenticated, service_role;
grant execute on function public.is_admin()         to anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. Seed do admin
--
-- Todo mundo que já existe vira admin. Não é generosidade: hoje qualquer conta
-- autenticada tem poder total, então promover preserva exatamente o status quo
-- e garante que exista alguém capaz de rebaixar os demais depois. O ajuste fino
-- de quem é o quê acontece na tela de Usuários (Fase 4).
-- ────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_count integer;
begin
  update public.profiles set role = 'admin', is_active = true;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise notice
      'Nenhum profile existente. O PRIMEIRO usuário criado a partir de agora '
      'vira admin ativo automaticamente (bootstrap no handle_new_user).';
  else
    raise notice '% profile(s) promovido(s) a admin ativo.', v_count;
  end if;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. Criação de novos usuários
--
-- ⚠️ CONTAS NOVAS NASCEM INATIVAS. O motivo: a chave `anon` está no bundle do
-- browser por definição, e se "Allow new users to sign up" estiver ligado no
-- projeto Supabase, qualquer pessoa na internet consegue chamar /auth/v1/signup
-- e criar uma conta. Com esta migration, essa conta nasce sem acesso a nada até
-- um admin ativá-la.
--
-- Pelo mesmo motivo o perfil NÃO é lido de `raw_user_meta_data->>'role'`, mesmo
-- com whitelist: quem chama signUp escolhe o próprio metadata, e isso seria
-- auto-promoção a admin por HTTP. Quem define o perfil é a rota de convite da
-- Fase 4, que usa a service_role DEPOIS de confirmar que o chamador é admin.
--
-- Exceção: o primeiro profile do sistema vira admin ativo, senão o escritório
-- fica trancado do lado de fora da própria gestão.
--
-- Enquanto a Fase 4 não existe, ativar alguém criado à mão no painel:
--   update public.profiles
--      set role = 'attorney', is_active = true
--    where id = (select id from auth.users where email = 'fulano@escritorio.adv.br');
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_first boolean;
begin
  select not exists (select 1 from public.profiles) into v_is_first;

  insert into public.profiles (id, full_name, avatar_url, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    case when v_is_first then 'admin' else 'attorney' end,
    v_is_first
  );
  return new;
end;
$$;

-- `set_updated_at` não é novo, mas estava sem search_path fixo — mesma
-- exposição descrita no bloco 3, e o advisor reclama das duas igualmente.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. Policies de `profiles`
--
-- Substitui o `auth_full`. Leitura continua ampla de propósito: a UI resolve
-- responsável, autor e avatar em praticamente toda tela a partir desta tabela.
-- O que muda é a ESCRITA.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;

drop policy if exists "auth_full"             on public.profiles;
drop policy if exists "profiles_select"       on public.profiles;
drop policy if exists "profiles_update_self"  on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_insert_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;

/** Membro ativo vê todos os perfis. O `or id = auth.uid()` garante que uma
 * conta desativada ainda consiga carregar o próprio registro — é o que permite
 * à tela de login dizer "seu acesso foi desativado" em vez de quebrar. */
create policy "profiles_select" on public.profiles
  for select using (
    id = (select auth.uid()) or (select public.is_active_member())
  );

/** Cada um edita o próprio perfil (nome, avatar, OAB). As colunas privilegiadas
 * são barradas pelo trigger do bloco 7 — RLS é por linha, não por coluna, então
 * "pode editar a própria linha" incluiria `role` sem ele. */
create policy "profiles_update_self" on public.profiles
  for update using      (id = (select auth.uid()))
           with check   (id = (select auth.uid()));

create policy "profiles_update_admin" on public.profiles
  for update using      ((select public.is_admin()))
           with check   ((select public.is_admin()));

create policy "profiles_insert_admin" on public.profiles
  for insert with check ((select public.is_admin()));

create policy "profiles_delete_admin" on public.profiles
  for delete using      ((select public.is_admin()));


-- ────────────────────────────────────────────────────────────────────────────
-- 7. Trigger anti-escalada de privilégio
--
-- É a peça que fecha o buraco descrito no cabeçalho. Sem ela, a policy
-- `profiles_update_self` significa "posso me promover a admin".
--
-- NÃO é `security definer` de propósito: precisa enxergar o `current_user` real
-- do chamador para reconhecer a service_role. Dentro de uma função definer,
-- `current_user` vira o dono da função e a checagem se tornaria inútil.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Nada privilegiado mudou: segue o baile.
  if new.role      is not distinct from old.role
 and new.is_active is not distinct from old.is_active then
    return new;
  end if;

  -- service_role = rotas admin no servidor (Fase 4). A autorização delas
  -- acontece antes, na rota, que confirma is_admin() com o client de sessão do
  -- chamador antes de trocar para a chave privilegiada.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar perfil ou status de acesso'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Dispara antes de `set_updated_at` (BEFORE triggers correm em ordem
-- alfabética, e 'p' < 's') — irrelevante para o resultado, só previsível.
drop trigger if exists prevent_privilege_escalation on public.profiles;
create trigger prevent_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_privilege_escalation();


-- ────────────────────────────────────────────────────────────────────────────
-- 8. Policies de `role_permissions`
--
-- Leitura aberta a membro ativo: é a mesma matriz que o frontend carrega para
-- decidir o que mostrar. Não é segredo — saber que existe um `financeiro:delete`
-- não dá a ninguém o direito de exercê-lo, quem decide isso é a policy da
-- tabela alvo.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.role_permissions enable row level security;

drop policy if exists "role_permissions_select"      on public.role_permissions;
drop policy if exists "role_permissions_write_admin" on public.role_permissions;

create policy "role_permissions_select" on public.role_permissions
  for select using ((select public.is_active_member()));

create policy "role_permissions_write_admin" on public.role_permissions
  for all using      ((select public.is_admin()))
         with check  ((select public.is_admin()));
