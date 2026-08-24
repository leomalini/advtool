-- ============================================================
-- 36 — RBAC: tabelas de domínio (Clientes, CRM, Processos, Documentos)
--
-- Fase 3, parte 2. Usa `public.apply_rbac_policies` da migration 35.
--
-- Duas convenções aplicadas aqui, que valem para o resto do schema:
--
-- 1. SUB-ENTIDADE SEGUE O PAI. Contatos, comentários, partes e movimentações
--    não têm recurso próprio — herdam o do registro a que pertencem. Quem
--    enxerga o cliente enxerga os contatos dele; não faria sentido separar.
--
-- 2. COMENTAR É EDITAR. O `insert` de comentário exige `:update` do pai, não
--    `:create`. Comentar num cliente é intervir no cliente, não criar um
--    cliente — e é o que deixa o perfil `finance` (que tem `clientes:update`
--    mas não `clientes:create`) participar da conversa.
--
-- Histórico não se edita: `crm_item_column_history` e `legal_process_movements`
-- não recebem `update`/`delete` amplos. Apagar o pai continua limpando os
-- filhos porque `on delete cascade` roda como integridade referencial, que
-- ignora RLS por definição — não é preciso policy de delete para isso.
-- ============================================================


-- ── Clientes ────────────────────────────────────────────────────────────────

select public.apply_rbac_policies(
  'clients',
  'clientes:view', 'clientes:create', 'clientes:update', 'clientes:delete'
);

select public.apply_rbac_policies(
  'client_contacts',
  'clientes:view', 'clientes:update', 'clientes:update', 'clientes:update'
);

select public.apply_rbac_policies(
  'client_comments',
  'clientes:view', 'clientes:update', 'clientes:update', 'clientes:delete'
);


-- ── CRM ─────────────────────────────────────────────────────────────────────

select public.apply_rbac_policies(
  'crm_items',
  'crm:view', 'crm:create', 'crm:update', 'crm:delete'
);

select public.apply_rbac_policies(
  'crm_item_comments',
  'crm:view', 'crm:update', 'crm:update', 'crm:delete'
);

-- Trilha de movimentação entre colunas do Kanban: escreve quem move o card.
select public.apply_rbac_policies(
  'crm_item_column_history',
  'crm:view', 'crm:update', null, null
);


-- ── Processos ───────────────────────────────────────────────────────────────

select public.apply_rbac_policies(
  'legal_processes',
  'processos:view', 'processos:create', 'processos:update', 'processos:delete'
);

-- ⚠️ O webhook do BuscaProcessos insere aqui, e hoje ele usa o client de sessão
-- sem sessão nenhuma — ou seja, chega como `anon` e já era barrado pelo
-- `auth_full` antes desta migration. Continua barrado, agora de forma
-- explícita. O conserto é trocá-lo pelo client de service_role (Fase 4).
select public.apply_rbac_policies(
  'legal_process_movements',
  'processos:view', 'processos:update', 'processos:update', 'processos:delete'
);

select public.apply_rbac_policies(
  'legal_process_parties',
  'processos:view', 'processos:update', 'processos:update', 'processos:update'
);


-- ── Documentos ──────────────────────────────────────────────────────────────
--
-- Os metadados. O arquivo em si vive no bucket `attachments`, protegido pela
-- migration 38 — as duas precisam concordar, senão sobra metadado apontando
-- para arquivo inacessível (ou pior, o contrário).

select public.apply_rbac_policies(
  'documents',
  'documentos:view', 'documentos:create', 'documentos:update', 'documentos:delete'
);


-- ── Tabelas mortas ──────────────────────────────────────────────────────────
--
-- `leads`, `lead_stages`, `lead_movements` e `lead_comments` são o modelo de CRM
-- anterior ao `crm_items`. Nenhum arquivo em `src/` as referencia (confirmado
-- por grep e já registrado em `supabase/README.md`), mas continuam com
-- `auth_full`, o que as deixa legíveis por qualquer conta.
--
-- Passar sem nenhum argumento derruba as policies e não cria nenhuma: a tabela
-- fica inacessível pela API sem perder um byte. A Fase 5 as remove de vez; até
-- lá, isto é reversível.

select public.apply_rbac_policies('leads');
select public.apply_rbac_policies('lead_stages');
select public.apply_rbac_policies('lead_movements');
select public.apply_rbac_policies('lead_comments');
