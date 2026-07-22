-- ============================================================
-- 12 — WORKFLOWS + WORKFLOW COLUMNS
-- ============================================================

create table public.workflows (
  id          text        primary key,
  nome        text        not null,
  descricao   text        not null default '',
  cor         text        not null default '#6366f1',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_updated_at before update on public.workflows
  for each row execute function public.set_updated_at();

alter table public.workflows enable row level security;
create policy "auth_full" on public.workflows
  for all using (auth.role() = 'authenticated');

-- ── Colunas ───────────────────────────────────────────────────────────────────

create table public.workflow_columns (
  id          text        primary key,
  workflow_id text        not null references public.workflows(id) on delete cascade,
  nome        text        not null,
  cor         text        not null default '#94a3b8',
  posicao     integer     not null default 0,
  limite      integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_workflow_columns_workflow_id on public.workflow_columns(workflow_id);
create index idx_workflow_columns_posicao     on public.workflow_columns(workflow_id, posicao);

create trigger set_updated_at before update on public.workflow_columns
  for each row execute function public.set_updated_at();

alter table public.workflow_columns enable row level security;
create policy "auth_full" on public.workflow_columns
  for all using (auth.role() = 'authenticated');

-- ── Seed: workflows ───────────────────────────────────────────────────────────

insert into public.workflows (id, nome, descricao, cor) values
  ('wf-negociacao', 'Negociação', 'Fluxo de negociação e captação de novos casos',       '#6366f1'),
  ('wf-processos',  'Processos',  'Acompanhamento de processos judiciais em andamento',  '#0ea5e9');

-- ── Seed: colunas — Negociação ────────────────────────────────────────────────

insert into public.workflow_columns (id, workflow_id, nome, cor, posicao) values
  ('neg-1', 'wf-negociacao', 'Análise do Caso',        '#94a3b8', 0),
  ('neg-2', 'wf-negociacao', 'Aguardando Documentos',  '#f59e0b', 1),
  ('neg-3', 'wf-negociacao', 'Análise Jurídica',       '#8b5cf6', 2),
  ('neg-4', 'wf-negociacao', 'Elaboração da Proposta', '#3b82f6', 3),
  ('neg-5', 'wf-negociacao', 'Proposta Enviada',       '#06b6d4', 4),
  ('neg-6', 'wf-negociacao', 'Em Negociação',          '#f97316', 5),
  ('neg-7', 'wf-negociacao', 'Contrato Assinado',      '#10b981', 6);

-- ── Seed: colunas — Processos ────────────────────────────────────────────────

insert into public.workflow_columns (id, workflow_id, nome, cor, posicao) values
  ('proc-1', 'wf-processos', 'Cadastro',        '#94a3b8', 0),
  ('proc-2', 'wf-processos', 'Petição Inicial', '#8b5cf6', 1),
  ('proc-3', 'wf-processos', 'Distribuição',    '#3b82f6', 2),
  ('proc-4', 'wf-processos', 'Instrução',       '#f59e0b', 3),
  ('proc-5', 'wf-processos', 'Audiência',       '#f97316', 4),
  ('proc-6', 'wf-processos', 'Sentença',        '#ec4899', 5),
  ('proc-7', 'wf-processos', 'Recurso',         '#ef4444', 6),
  ('proc-8', 'wf-processos', 'Cumprimento',     '#06b6d4', 7),
  ('proc-9', 'wf-processos', 'Finalizado',      '#10b981', 8);
