-- ============================================================
-- 43 — CACHE LOCAL DOS DADOS DA BUSCAPROCESSOS
--
-- Toda consulta à API é cobrada por chamada. Popular um processo custa
-- R$ 0,61 (capa 0,12 + movimentações 0,12 + documentos públicos 0,25 +
-- resumo por IA 0,12), e o download de cada documento custa mais R$ 0,20.
-- Reconsultar a cada abertura da tela multiplicaria isso pelo número de
-- visualizações — por isso o resultado é gravado aqui e a tela lê do banco.
--
-- Os carimbos `*_synced_at` são o controle: bloco com carimbo não é
-- reconsultado, a não ser que a sincronização seja forçada.
-- ============================================================

-- ── Resumo por IA e carimbos de sincronização ────────────────────────────────

alter table public.legal_processes
  -- GET /v1/processos/cnj/{cnj}/resumo-ia → data.conteudo
  add column if not exists ai_summary            text,
  -- data.atualizadoEm: quando a IA gerou o resumo (do lado deles).
  add column if not exists ai_summary_updated_at timestamptz,
  -- Quando NÓS consultamos cada bloco. Distinto do acima de propósito.
  add column if not exists capa_synced_at        timestamptz,
  add column if not exists movements_synced_at   timestamptz,
  add column if not exists documents_synced_at   timestamptz,
  add column if not exists ai_summary_synced_at  timestamptz;

-- ── Deduplicação das movimentações importadas ────────────────────────────────
--
-- A API não devolve id de movimentação: a mesma consulta repetida traria os
-- mesmos atos e a segunda sincronização duplicaria o histórico inteiro. O hash
-- de (data + conteúdo) é a chave estável possível.

alter table public.legal_process_movements
  add column if not exists external_hash text;

-- Índice total, e não parcial: o upsert do sincronizador precisa inferir o
-- alvo do ON CONFLICT, e o Postgres só usa índice parcial nessa inferência se
-- a instrução repetir o predicado — o que o client do Supabase não emite.
-- Movimentações manuais ficam com `external_hash` nulo, e nulos não colidem
-- entre si num índice único, então continuam podendo repetir.
create unique index if not exists idx_movements_external_hash
  on public.legal_process_movements(legal_process_id, external_hash);

-- ── Catálogo de documentos públicos ──────────────────────────────────────────
--
-- Tabela própria, e não `documents`: lá cada linha é um arquivo no bucket
-- `attachments`, com `file_path`, `file_size` e `uploaded_by not null`. O
-- documento público não é nosso arquivo — é uma referência remota que só vira
-- arquivo se alguém pagar o download (R$ 0,20). Guardamos o catálogo; o
-- download, quando acontecer, cria a linha em `documents` normalmente.

create table if not exists public.legal_process_public_documents (
  id                uuid primary key default gen_random_uuid(),
  legal_process_id  uuid not null references public.legal_processes(id) on delete cascade,
  /** `id` do documento na BuscaProcessos — usado na rota de download. */
  external_id       text not null,
  title             text,
  description       text,
  /** A API envia '2024-06-17 18:02:36', sem fuso declarado. Gravamos o
   * instante correspondente ao relógio de Brasília, que é o do tribunal —
   * mesma premissa da migration 33. */
  document_date     timestamptz,
  /** 'PUBLICO' e afins, texto livre da origem. */
  doc_type          text,
  file_extension    text,
  page_count        integer,
  /** URL autenticada da API: exige a API key, não é link público. */
  download_url      text,
  raw_data          jsonb,
  created_at        timestamptz not null default now()
);

create unique index if not exists idx_public_documents_external
  on public.legal_process_public_documents(legal_process_id, external_id);

create index if not exists idx_public_documents_process
  on public.legal_process_public_documents(legal_process_id, document_date desc);

-- Sub-entidade segue o pai, como partes e movimentações (convenção da 36).
alter table public.legal_process_public_documents enable row level security;

select public.apply_rbac_policies(
  'legal_process_public_documents',
  'processos:view', 'processos:update', 'processos:update', 'processos:delete'
);
