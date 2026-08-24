-- ============================================================
-- 35 — RBAC: helper de policies + Financeiro
--
-- Primeira migration da Fase 3 (`docs/PLANEJAMENTO-MULTIUSUARIO.md`), que troca
-- o `auth_full` uniforme por permissão real, tabela a tabela.
--
-- Começa pelo Financeiro por ser o módulo de maior valor e menor superfície:
-- uma tabela só, e é o único que o perfil `paralegal` não enxerga.
--
-- ⚠️ RLS NEGANDO NÃO GERA ERRO. Devolve lista vazia ou "0 rows updated". Uma
-- policy errada aqui parece "sumiu tudo", não "deu erro" — por isso a Fase 3
-- vem fatiada em quatro migrations, cada uma verificada na tela antes da
-- seguinte.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. `apply_rbac_policies` — o padrão do §4.2 em forma executável
--
-- São ~20 tabelas × 4 comandos = ~80 policies. Escritas à mão seriam 400 linhas
-- de repetição onde um `financeiro` no lugar de `documentos` passaria batido na
-- revisão e só apareceria como "sumiu tudo" em produção. O helper torna o
-- mapeamento uma tabela de duas colunas, que dá para conferir de relance.
--
-- Cada parâmetro recebe `'recurso:acao'`, ou:
--   NULL  → nenhuma policy para aquele comando, ou seja, ninguém pode
--   '*'   → qualquer membro ativo (tabelas de apoio: activities, event_types…)
--
-- Fica permanente de propósito: é o que impede o próximo módulo de nascer com
-- `auth_full` de novo (risco #8 do planejamento).
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.apply_rbac_policies(
  p_table  text,
  p_select text default null,
  p_insert text default null,
  p_update text default null,
  p_delete text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cmds  text[] := array['select', 'insert', 'update', 'delete'];
  v_specs text[] := array[p_select, p_insert, p_update, p_delete];
  v_cmd   text;
  v_spec  text;
  v_expr  text;
  v_name  text;
  i       integer;
begin
  -- Tabela pode não existir na base alvo (as `leads*` mortas, por exemplo).
  -- Avisar e seguir é melhor que abortar a migration inteira.
  if to_regclass('public.' || quote_ident(p_table)) is null then
    raise notice 'apply_rbac_policies: public.% não existe — ignorada', p_table;
    return;
  end if;

  execute format('alter table public.%I enable row level security', p_table);

  -- As duas policies uniformes do modelo antigo.
  execute format('drop policy if exists "auth_full" on public.%I', p_table);
  execute format('drop policy if exists "auth_read" on public.%I', p_table);

  for i in 1..4 loop
    v_cmd  := v_cmds[i];
    v_spec := v_specs[i];
    v_name := 'rbac_' || v_cmd;

    -- Sempre dropa antes: torna a migration re-executável e garante que passar
    -- NULL num comando revoga de verdade, em vez de deixar a policy antiga.
    execute format('drop policy if exists %I on public.%I', v_name, p_table);
    continue when v_spec is null;

    if v_spec = '*' then
      v_expr := '(select public.is_active_member())';
    else
      -- `(select ...)` força o Postgres a avaliar como InitPlan: uma vez por
      -- statement em vez de uma vez por linha. É o que torna a opção (A) do
      -- §4.1 barata o bastante.
      v_expr := format(
        '(select public.can(%L, %L))',
        split_part(v_spec, ':', 1),
        split_part(v_spec, ':', 2)
      );
    end if;

    -- ⚠️ Os parênteses ao redor de %s são da GRAMÁTICA do create policy
    -- (`USING ( expressão )`), não da subquery. Como `v_expr` já traz os seus
    -- próprios — que são o que força o InitPlan —, o resultado tem dois níveis:
    -- `using ((select public.can(...)))`. Com um só, o parser encontra a
    -- palavra-chave `select` onde espera uma expressão e devolve
    -- "syntax error at or near select".
    if v_cmd = 'insert' then
      execute format(
        'create policy %I on public.%I for insert with check (%s)',
        v_name, p_table, v_expr
      );
    elsif v_cmd = 'update' then
      -- `using` decide quais linhas podem ser alvo, `with check` valida o
      -- resultado. Sem os dois, dá para editar uma linha para um estado que
      -- não se poderia ter criado.
      execute format(
        'create policy %I on public.%I for update using (%s) with check (%s)',
        v_name, p_table, v_expr, v_expr
      );
    else
      execute format(
        'create policy %I on public.%I for %s using (%s)',
        v_name, p_table, v_cmd, v_expr
      );
    end if;
  end loop;
end;
$$;

comment on function public.apply_rbac_policies(text, text, text, text, text) is
  'Aplica as 4 policies padrão de RBAC numa tabela. Cada argumento é '
  '''recurso:acao'', ''*'' (qualquer membro ativo) ou NULL (ninguém). '
  'Toda tabela nova do projeto deve passar por aqui em vez de recriar auth_full.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Financeiro
--
-- `paralegal` não tem nenhuma linha de `financeiro` em `role_permissions`, então
-- as quatro policies negam para ele — a tabela some da API inteira, não só da
-- tela. É a diferença entre esconder o menu e esconder o dado.
-- ────────────────────────────────────────────────────────────────────────────

select public.apply_rbac_policies(
  'financial_entries',
  'financeiro:view',
  'financeiro:create',
  'financeiro:update',
  'financeiro:delete'
);
