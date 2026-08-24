-- ============================================================
-- Verificação da Fase 1 (migration 34 — RBAC foundation)
--
-- Rodar no SQL Editor do Supabase DEPOIS de aplicar a migration.
-- Os blocos 1–3 são leitura pura. O bloco 4 roda dentro de uma transação com
-- `rollback` no fim: ele rebaixa temporariamente um usuário para provar que a
-- escalada de privilégio é bloqueada, e desfaz tudo ao terminar.
-- ============================================================


-- ── 1. A matriz carregou? ──────────────────────────────────────────────────
-- Esperado, exatamente:  admin 34 | attorney 31 | paralegal 21 | finance 17
select role, count(*) as permissoes
from public.role_permissions
group by role
order by role;


-- ── 2. As funções existem, são SECURITY DEFINER e têm search_path fixo? ────
-- Esperado: 7 linhas. `seguranca_definer` = true nas quatro de autorização e
-- em handle_new_user; false em set_updated_at e prevent_privilege_escalation
-- (esta última precisa enxergar o current_user real do chamador).
-- `config` deve conter search_path=public em TODAS.
select
  proname                           as funcao,
  prosecdef                         as seguranca_definer,
  proconfig                         as config
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'app_role', 'is_active_member', 'can', 'is_admin',
    'handle_new_user', 'set_updated_at', 'prevent_privilege_escalation'
  )
order by proname;


-- ── 3. As policies substituíram o auth_full? ───────────────────────────────
-- Esperado: 5 em profiles, 2 em role_permissions, e NENHUMA chamada auth_full.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'role_permissions')
order by tablename, policyname;

-- Quem já existia virou admin ativo?
select id, full_name, role, is_active from public.profiles order by created_at;


-- ── 4. A escalada de privilégio está bloqueada? ────────────────────────────
-- Este bloco DEVE terminar em erro na última instrução:
--   ERROR: Apenas administradores podem alterar perfil ou status de acesso
-- Se o update passar, o trigger não está no lugar — não siga para a Fase 3.
begin;

-- Rebaixa o profile mais antigo para 'attorney' (desfeito pelo rollback).
update public.profiles
set role = 'attorney'
where id = (select id from public.profiles order by created_at limit 1);

-- Assume a identidade dele, como o PostgREST faria numa requisição real.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',  (select id from public.profiles order by created_at limit 1),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

-- 4a. Esperado: 'attorney'
select public.app_role() as perfil;

-- 4b. Esperado: eh_admin=false, pode_apagar_financeiro=true,
--     pode_gerir_usuarios=false, pode_ver_pendencias=true
select
  public.is_admin()                       as eh_admin,
  public.can('financeiro', 'delete')      as pode_apagar_financeiro,
  public.can('usuarios',   'manage')      as pode_gerir_usuarios,
  public.can('pendencias', 'view')        as pode_ver_pendencias;

-- 4c. Esperado: ERRO 42501. É o teste principal da Fase 1.
update public.profiles set role = 'admin' where id = auth.uid();

rollback;
