-- ============================================================
-- 37 — RBAC: Agenda, Tarefas, feed e estrutura configurável
--
-- Fase 3, parte 3. Fecha as tabelas que sobraram.
--
-- Aparece aqui um terceiro tipo de tabela, além de "domínio" e "sub-entidade":
-- a TABELA DE APOIO — `activities`, `event_types`, `workflows`,
-- `workflow_columns`, `schema_fixes`. São lidas por praticamente toda tela para
-- resolver rótulo, cor ou etapa, e restringi-las por módulo quebraria telas de
-- outros módulos sem proteger nada de sensível (saber que existe uma coluna
-- "Aguardando cliente" não é informação do escritório). Todas ganham
-- `select '*'` — qualquer membro ativo.
--
-- O que muda nelas é a ESCRITA: `workflows`, `workflow_columns` e `event_types`
-- são estrutura do sistema, então só `configuracoes:manage`, que só o admin tem.
-- ============================================================


-- ── Agenda ──────────────────────────────────────────────────────────────────

select public.apply_rbac_policies(
  'events',
  'agenda:view', 'agenda:create', 'agenda:update', 'agenda:delete'
);

-- Quem são os participantes é parte de editar o evento — inclusive na criação,
-- que grava os assignees logo depois de gravar o evento.
select public.apply_rbac_policies(
  'event_assignees',
  'agenda:view', 'agenda:update', 'agenda:update', 'agenda:update'
);

-- Apoio: a cor e o rótulo do tipo aparecem na Agenda, no Dashboard e dentro dos
-- modais de Processo e Caso.
select public.apply_rbac_policies(
  'event_types',
  '*', 'configuracoes:manage', 'configuracoes:manage', 'configuracoes:manage'
);


-- ── Tarefas ─────────────────────────────────────────────────────────────────

select public.apply_rbac_policies(
  'tasks',
  'tarefas:view', 'tarefas:create', 'tarefas:update', 'tarefas:delete'
);

select public.apply_rbac_policies(
  'task_comments',
  'tarefas:view', 'tarefas:update', 'tarefas:update', 'tarefas:delete'
);

-- Marcar item do checklist é a interação mais corriqueira do módulo: cai em
-- `:update`, não em `:create`, para não exigir permissão de criar tarefa de
-- quem só está tocando a execução dela.
select public.apply_rbac_policies(
  'task_checklist_items',
  'tarefas:view', 'tarefas:update', 'tarefas:update', 'tarefas:update'
);


-- ── Feed de atividades ──────────────────────────────────────────────────────
--
-- `insert '*'` é deliberado. Todo service grava aqui em best-effort ao concluir
-- uma operação (`src/lib/activities.ts`), e a permissão que importa já foi
-- verificada na tabela alvo: se o paralegal conseguiu criar o cliente, registrar
-- que criou não é um privilégio extra. Amarrar cada insert ao recurso de origem
-- só produziria buracos silenciosos no feed.
--
-- Sem `update` nem `delete`: feed é append-only. Isso também o torna a base de
-- auditoria que a Fase 5 vai usar para as ações administrativas.

select public.apply_rbac_policies('activities', '*', '*', null, null);


-- ── Estrutura configurável ──────────────────────────────────────────────────
--
-- Workflows e suas colunas desenham o Kanban do CRM e o de Processos. Todo
-- mundo lê; só o admin altera.

select public.apply_rbac_policies(
  'workflows',
  '*', 'configuracoes:manage', 'configuracoes:manage', 'configuracoes:manage'
);

select public.apply_rbac_policies(
  'workflow_columns',
  '*', 'configuracoes:manage', 'configuracoes:manage', 'configuracoes:manage'
);

-- Registro de correções de schema (migration 33). Leitura para diagnóstico;
-- escrita é coisa de migration, que roda como owner e ignora RLS.
select public.apply_rbac_policies('schema_fixes', '*', null, null, null);
