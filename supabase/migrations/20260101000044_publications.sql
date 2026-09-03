-- ============================================================
-- 44 — MÓDULO DE PUBLICAÇÕES
--
-- Publicação NÃO cabe em `legal_process_movements`: aquela tabela exige
-- `legal_process_id not null` (migration 9), e a busca de intimações é feita
-- POR OAB, não por CNJ — ela encontra publicações de processos que não estão
-- cadastrados. Forçar o encaixe obrigaria a criar um processo vazio para cada
-- publicação órfã.
--
-- Aqui o vínculo com o processo é opcional, e o CNJ fica gravado como texto de
-- qualquer forma. A listagem mostra a publicação órfã com o botão de cadastrar
-- o processo — uma intimação de processo que o escritório não acompanha é
-- justamente a que não pode passar batido.
--
-- `legal_process_movements` continua intacta: ela é alimentada por
-- /processos/cnj/{cnj}/movimentacoes (andamentos), enquanto esta tabela vem de
-- /intimacoes (publicações encontradas pela OAB). Origens diferentes, ids
-- diferentes — não há linha a migrar de uma para a outra.
-- ============================================================

-- ── UF da inscrição na OAB ───────────────────────────────────────────────────
--
-- `oab_number` (migration 19) é texto único, sem estado. A API exige
-- `oab_estado` e `oab_numero` separados, no formato UF:NÚMERO.

alter table public.profiles
  add column if not exists oab_state text
    check (oab_state is null or oab_state ~ '^[A-Z]{2}$');

comment on column public.profiles.oab_state is
  'UF da inscrição na OAB, em duas letras maiúsculas. Junto com oab_number '
  'forma o parâmetro UF:NÚMERO das consultas de intimação.';

-- ── Publicações ──────────────────────────────────────────────────────────────

create table if not exists public.publications (
  id                 uuid primary key default gen_random_uuid(),

  -- Numeração visível na tela ("#495"). Sequencial e estável por linha.
  sequence_number    bigint generated always as identity,

  -- Opcional de propósito: ver o cabeçalho.
  legal_process_id   uuid references public.legal_processes(id) on delete set null,
  cnj_number         text,

  source             text not null default 'busca_processos'
                       check (source in ('busca_processos', 'manual')),
  /** Id da intimação na origem — é o que impede reimportar a mesma. */
  external_id        text,

  court              text,
  diario_name        text,
  diario_sigla       text,
  oab_state          text,
  oab_number         text,

  publication_date   date not null,
  /** Dia em que o diário foi disponibilizado. Quando a origem não informa, o
   * motor de prazos deriva a publicação a partir dela, e não o contrário. */
  availability_date  date,
  /** Primeiro dia do prazo — calculado pelo motor em src/lib/prazos. */
  deadline_start_at  date,

  -- Sem correspondente na API: preenchidos por quem lê.
  publication_type   text,
  subject            text,

  title              text,
  /** Trecho curto, para a listagem. */
  excerpt            text,
  /** Cru, como veio da API (`conteudoCompletoHtml`), para nunca perder nada. */
  content_html       text,
  /** Normalizado na ingestão: é o que a tela renderiza e a busca varre. */
  content_text       text,
  external_url       text,

  read_at            timestamptz,
  handled_at         timestamptz,
  raw_data           jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Índice total (não parcial) para o upsert da ingestão conseguir inferir o
-- alvo do ON CONFLICT — mesmo motivo da migration 43. Publicação manual fica
-- com `external_id` nulo, e nulos não colidem entre si.
create unique index if not exists idx_publications_external
  on public.publications(source, external_id);

-- A fila de não lidas é a consulta mais quente do módulo.
create index if not exists idx_publications_unread
  on public.publications(publication_date desc)
  where read_at is null;

create index if not exists idx_publications_date
  on public.publications(publication_date desc);

create index if not exists idx_publications_process
  on public.publications(legal_process_id);

-- Usado para casar publicação órfã com processo cadastrado depois.
create index if not exists idx_publications_cnj
  on public.publications(cnj_number);

create trigger set_updated_at before update on public.publications
  for each row execute function public.set_updated_at();

-- ── Destinatários e advogados ────────────────────────────────────────────────

create table if not exists public.publication_parties (
  id              uuid primary key default gen_random_uuid(),
  publication_id  uuid not null references public.publications(id) on delete cascade,
  name            text not null,
  role            text not null check (role in ('destinatario', 'advogado')),
  /** Inscrição no formato exibido pela origem: 'OAB 35.520/ES'. */
  oab             text,
  position        integer not null default 0
);

create index if not exists idx_publication_parties_publication
  on public.publication_parties(publication_id, role, position);

-- ── RBAC ─────────────────────────────────────────────────────────────────────
--
-- Recurso próprio, e não sub-entidade de `processos`: publicação existe sem
-- processo, então não teria pai de quem herdar. A matriz espelha a de
-- processos — paralegal cria e edita mas não apaga, finance só lê.

insert into public.role_permissions (role, resource, action) values
  ('admin',     'publicacoes', 'view'),   ('admin',     'publicacoes', 'create'),
  ('admin',     'publicacoes', 'update'), ('admin',     'publicacoes', 'delete'),
  ('attorney',  'publicacoes', 'view'),   ('attorney',  'publicacoes', 'create'),
  ('attorney',  'publicacoes', 'update'), ('attorney',  'publicacoes', 'delete'),
  ('paralegal', 'publicacoes', 'view'),   ('paralegal', 'publicacoes', 'create'),
  ('paralegal', 'publicacoes', 'update'),
  ('finance',   'publicacoes', 'view')
on conflict (role, resource, action) do nothing;

select public.apply_rbac_policies(
  'publications',
  'publicacoes:view', 'publicacoes:create', 'publicacoes:update', 'publicacoes:delete'
);

-- Sub-entidade segue o pai (convenção da migration 36).
select public.apply_rbac_policies(
  'publication_parties',
  'publicacoes:view', 'publicacoes:update', 'publicacoes:update', 'publicacoes:delete'
);
