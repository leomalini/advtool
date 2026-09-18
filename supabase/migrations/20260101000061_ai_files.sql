-- ============================================================
-- 61 — ARQUIVOS DO ASSISTENTE
--
-- Anexos que o usuário manda no chat e arquivos que a IA gera. Ficam num bucket
-- próprio, e não em `attachments`, por dois motivos:
--
--   · Dono diferente. Um anexo de conversa é tão pessoal quanto a conversa
--     (migration 60): só quem enviou vê. Em `attachments` a regra é por
--     recurso (`documentos:*`) — todo o escritório veria o rascunho de todos.
--   · Quem pode. O Assistente é liberado aos quatro perfis; `documentos:create`
--     não. Guardar no módulo Documentos continua sendo uma ação à parte, pelo
--     `uploadDocument` de sempre, com as permissões de sempre.
--
-- ── Caminho ──
-- `<user_id>/<conversation_id>/<uuid>-<nome>`. A primeira pasta é o dono: é
-- ela que as policies de `storage.objects` conferem, então ninguém grava nem lê
-- fora da própria pasta, mesmo chamando a Storage API direto.
--
-- ── Por que o bucket fixa tamanho e MIME ──
-- A rota de registro já valida os dois, mas o upload sai do navegador direto
-- para o Storage (na Vercel o corpo de uma função é pequeno demais para
-- arquivo). O bucket é a única barreira que vale também para esse caminho.
-- 25 MB = `MAX_FILE_SIZE` do módulo Documentos, para um anexo sempre caber lá.
--
-- ── `extracted_text` ──
-- Word, Excel, CSV e TXT viram texto uma vez, no registro, e não a cada turno:
-- o modelo não entende o binário desses formatos, e reextrair uma planilha a
-- cada pergunta só gastaria tempo. PDF e imagem vão como arquivo (nulo aqui).
-- ============================================================

-- ── Bucket ───────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-files',
  'ai-files',
  false,
  26214400,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Mesmo padrão da migration 38: policies de `storage.objects` filtram
-- `bucket_id` à mão, porque a tabela é compartilhada por todos os buckets.
-- Sem policy de update: nada sobrescreve um anexo.
drop policy if exists "ai_files_select" on storage.objects;
drop policy if exists "ai_files_insert" on storage.objects;
drop policy if exists "ai_files_delete" on storage.objects;

create policy "ai_files_select" on storage.objects
  for select using (
    bucket_id = 'ai-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.can('ia', 'view'))
  );

create policy "ai_files_insert" on storage.objects
  for insert with check (
    bucket_id = 'ai-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.can('ia', 'view'))
  );

create policy "ai_files_delete" on storage.objects
  for delete using (
    bucket_id = 'ai-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.can('ia', 'view'))
  );

-- ── Tabela ───────────────────────────────────────────────────────────────────

create table if not exists public.ai_files (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  /** 'upload' = enviado no chat; 'generated' = criado pela IA. */
  origin          text not null check (origin in ('upload', 'generated')),
  storage_path    text not null unique,
  file_name       text not null,
  media_type      text not null,
  size_bytes      bigint not null,
  extracted_text  text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ai_files_conversation
  on public.ai_files(conversation_id, created_at);

alter table public.ai_files enable row level security;

-- Dono, como as `ai_*` da migration 60. O `with check` também exige que a
-- conversa seja de quem grava: sem isso daria para pendurar um arquivo na
-- conversa de outra pessoa conhecendo o id dela.
drop policy if exists "owner_all" on public.ai_files;
create policy "owner_all" on public.ai_files
  for all
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
    )
  );
