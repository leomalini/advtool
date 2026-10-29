-- ============================================================
-- 82 — RESUMO DO PROCESSO PELO CLAUDE
--
-- Plano: `docs/assistente-claude.md`, fase 2. O resumo da página do processo
-- deixa de vir pronto da BuscaProcessos (R$ 0,12 por consulta, texto livre) e
-- passa a ser gerado pelo Claude com o que o AdvTool já guarda: capa,
-- movimentações, publicações, audiências, tarefas e compromissos.
--
-- ── Por que uma tabela própria ──
-- O resumo é estruturado (fase, último ato, parágrafos, pontos de atenção,
-- próximos passos) e cada afirmação cita as fontes de onde saiu. `sources`
-- guarda o que cada referência (M3, P1, A1…) era no momento da geração — id,
-- data e rótulo —, para a tela levar ao item da linha do tempo mesmo depois
-- de chegarem movimentações novas. Uma linha por processo: gerar de novo
-- substitui a anterior.
--
-- ── Quem lê e quem grava ──
-- Mesma matriz das tabelas do processo: lê com `processos:view`, grava com
-- `processos:update`. A rota de geração grava com o client de quem pediu,
-- então a RLS decide também aqui.
--
-- `legal_processes.ai_summary` (da BuscaProcessos) fica como está: a tela o
-- mostra enquanto o processo não tem resumo novo, e o sync padrão deixa de
-- buscá-lo.
-- ============================================================

create table if not exists public.legal_process_summaries (
  legal_process_id  uuid primary key
                      references public.legal_processes(id) on delete cascade,

  /** A saída do modelo: fase_atual, ultimo_ato, resumo, pontos_de_atencao e
   * proximos_passos_registrados, cada item com as referências que o
   * sustentam (`features/processos/summary/summarySchema.ts`). */
  summary           jsonb not null,
  /** O que cada referência era na geração: [{ ref, kind, id, date, label }]. */
  sources           jsonb not null,

  model             text not null,
  generated_by      uuid references auth.users(id) on delete set null,
  generated_at      timestamptz not null default now()
);


-- ── RLS ──────────────────────────────────────────────────────────────────────

select public.apply_rbac_policies(
  'legal_process_summaries',
  'processos:view',
  'processos:update',
  'processos:update',
  'processos:delete'
);


-- ── Consumo: a rota nova ─────────────────────────────────────────────────────
--
-- `ai_usage.route` só aceita as rotas de `AI_ROUTE_SETTINGS` (migration 81). A
-- restrição foi declarada na coluna, sem nome: o Postgres costuma chamá-la de
-- `ai_usage_route_check`, mas ela é achada pelo conteúdo, não pelo nome, para
-- a migration não depender dessa convenção.

do $$
declare
  route_check text;
begin
  for route_check in
    select conname
      from pg_constraint
     where conrelid = 'public.ai_usage'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%route%'
  loop
    execute format('alter table public.ai_usage drop constraint %I', route_check);
  end loop;
end $$;

alter table public.ai_usage
  add constraint ai_usage_route_check
  check (route in ('chat', 'portal', 'contract_reader', 'drafting', 'process_summary'));
