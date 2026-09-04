-- ============================================================
-- 46 — A MESMA PUBLICAÇÃO, VINDA POR TRÊS PORTAS
--
-- `publications` é alimentada por três caminhos que não se conhecem, e cada um
-- deriva um `external_id` diferente para a MESMA publicação:
--
--   · cadastro/sincronização do processo → 'mov:<hash de data+conteúdo>'
--     (src/lib/buscaprocessos/sync.ts, savePublicacoesFromMovimentacoes)
--   · "Buscar publicações", por OAB      → o id da intimação na API
--     (src/lib/buscaprocessos/syncIntimacoes.ts)
--   · webhook                            → nenhum
--
-- O índice `idx_publications_external(source, external_id)` da migration 44 só
-- impede reimportação DENTRO da mesma fonte. Cadastrar um processo e depois
-- clicar em "Buscar publicações" duplicava a fila de trabalho — e fila de
-- intimação com item repetido é justamente o ruído que faz alguém deixar
-- passar um prazo.
--
-- A chave que atravessa as três fontes é o conteúdo: `content_fingerprint`.
--
-- ⚠️ A NORMALIZAÇÃO ABAIXO E A DE `src/lib/publicacoes/fingerprint.ts` SÃO A
-- MESMA COISA E MUDAM JUNTAS. Se divergirem, o backfill deixa de casar com o
-- que a aplicação calcula e a deduplicação para de funcionar em silêncio —
-- nada quebra, as duplicatas só voltam a aparecer. Há um verificador de
-- paridade em `scripts/verify-fingerprint.mjs`.
--
-- Por que NÃO é um índice único: as fontes datam a mesma publicação de formas
-- diferentes. A movimentação traz a DISPONIBILIZAÇÃO; a intimação traz a
-- PUBLICAÇÃO, que é o primeiro dia útil seguinte. Um único índice sobre
-- (fingerprint) sozinho fundiria também uma republicação idêntica meses
-- depois, que é publicação de verdade e não pode sumir. A regra fica na
-- ingestão (src/lib/publicacoes/ingest.ts): mesmo fingerprint E datas a até 7
-- dias de distância.
--
-- Por que MARCAR em vez de apagar: `duplicate_of_id` preserva o rastro de que
-- aquilo chegou duas vezes, e uma migration que apaga linha de produção não
-- tem volta.
-- ============================================================

alter table public.publications
  add column if not exists content_fingerprint text,
  add column if not exists duplicate_of_id uuid
    references public.publications(id) on delete set null;

comment on column public.publications.content_fingerprint is
  'sha256 hex (32 chars) de "<CNJ só dígitos>|<conteúdo normalizado>". Chave de '
  'deduplicação entre fontes. Nula quando não há conteúdo — sem texto não há o '
  'que comparar, e um fingerprint de string vazia fundiria publicações '
  'distintas do mesmo processo.';

comment on column public.publications.duplicate_of_id is
  'Aponta para a linha que sobreviveu quando a mesma publicação entrou por '
  'duas fontes. Linha marcada não aparece na fila de trabalho.';

-- ── Backfill ─────────────────────────────────────────────────────────────────
--
-- Normalização, na ordem exata do TS:
--   CNJ      → só dígitos
--   conteúdo → lower(), depois [^a-z0-9]+ vira um espaço, depois trim
--
-- Acentos caem fora dos dois lados (não são [a-z0-9]), o que torna SQL e
-- JavaScript deterministicamente iguais sem depender de collation.
--
-- `sha256()` é built-in desde o PostgreSQL 11 — nenhuma extensão a habilitar.

create or replace function public.publication_fingerprint(
  p_cnj text,
  p_content text
)
returns text
language sql
immutable
as $$
  select case
    when btrim(regexp_replace(lower(coalesce(p_content, '')), '[^a-z0-9]+', ' ', 'g')) = ''
      then null
    else left(
      encode(
        sha256(convert_to(
          coalesce(regexp_replace(coalesce(p_cnj, ''), '\D', '', 'g'), '') || '|' ||
          btrim(regexp_replace(lower(coalesce(p_content, '')), '[^a-z0-9]+', ' ', 'g')),
          'UTF8'
        )),
        'hex'
      ),
      32
    )
  end
$$;

comment on function public.publication_fingerprint(text, text) is
  'Espelho SQL de publicationFingerprint() em src/lib/publicacoes/fingerprint.ts. '
  'Os dois mudam juntos — ver scripts/verify-fingerprint.mjs.';

update public.publications
   set content_fingerprint = public.publication_fingerprint(cnj_number, content_text)
 where content_fingerprint is null;

create index if not exists idx_publications_fingerprint
  on public.publications(content_fingerprint, publication_date)
  where content_fingerprint is not null;

-- A fila esconde as duplicatas, então o índice quente da 44 ganha o predicado.
create index if not exists idx_publications_queue
  on public.publications(publication_date desc, sequence_number desc)
  where duplicate_of_id is null;

-- ── Marcação das duplicatas que já estão na base ─────────────────────────────

do $$
declare
  v_marked integer;
begin
  -- Sobrevivente é a de menor `sequence_number` entre as que casam: a que
  -- chegou primeiro é a que alguém pode já ter lido ou tratado.
  update public.publications d
     set duplicate_of_id = k.keep_id
    from (
      select
        dup.id as dup_id,
        (
          select keep.id
            from public.publications keep
           where keep.content_fingerprint = dup.content_fingerprint
             and keep.sequence_number < dup.sequence_number
             and abs(keep.publication_date - dup.publication_date) <= 7
           order by keep.sequence_number
           limit 1
        ) as keep_id
        from public.publications dup
       where dup.content_fingerprint is not null
         and dup.duplicate_of_id is null
    ) k
   where d.id = k.dup_id
     and k.keep_id is not null;

  get diagnostics v_marked = row_count;

  -- Cadeia: C casou com B, que por sua vez é duplicata de A. Colapsa até a
  -- raiz, senão a fila esconderia B e mostraria C órfã de referência.
  loop
    update public.publications child
       set duplicate_of_id = parent.duplicate_of_id
      from public.publications parent
     where child.duplicate_of_id = parent.id
       and parent.duplicate_of_id is not null;
    exit when not found;
  end loop;

  -- Tarefa apontando para linha escondida perderia o prazo anotado a partir
  -- dela. `tasks.publication_id` é `on delete set null` (migration 45), então
  -- repontar é o único jeito de não perder o vínculo.
  update public.tasks t
     set publication_id = p.duplicate_of_id
    from public.publications p
   where t.publication_id = p.id
     and p.duplicate_of_id is not null;

  raise notice 'publicações marcadas como duplicata: %', v_marked;
end $$;

-- ── Fingerprint automático ───────────────────────────────────────────────────
--
-- A ingestão calcula e envia o fingerprint, mas uma publicação criada à mão
-- (source 'manual') ou por qualquer caminho futuro precisa entrar com a chave
-- preenchida — senão ela fica invisível para a deduplicação.

create or replace function public.set_publication_fingerprint()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- A ingestão manda o valor pronto; isto cobre quem não manda.
    if new.content_fingerprint is null then
      new.content_fingerprint :=
        public.publication_fingerprint(new.cnj_number, new.content_text);
    end if;
  elsif new.content_text is distinct from old.content_text
     or new.cnj_number  is distinct from old.cnj_number then
    -- O conteúdo mudou: o fingerprint antigo passou a descrever outra coisa.
    new.content_fingerprint :=
      public.publication_fingerprint(new.cnj_number, new.content_text);
  end if;
  return new;
end $$;

drop trigger if exists set_publication_fingerprint on public.publications;
create trigger set_publication_fingerprint
  before insert or update of cnj_number, content_text on public.publications
  for each row execute function public.set_publication_fingerprint();
