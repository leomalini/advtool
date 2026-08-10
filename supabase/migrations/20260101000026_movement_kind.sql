-- ============================================================
-- 26 — PUBLICAÇÃO vs MOVIMENTAÇÃO, E ESTADO DE LEITURA
--
-- `source` (existente) = ORIGEM do registro: veio da API ou foi digitado.
-- `kind`   (novo)      = NATUREZA do ato: é uma publicação/intimação ou uma
--                        movimentação processual.
--
-- São coisas independentes, e a tela de detalhe estava derivando a segunda da
-- primeira — tratando tudo que veio da API como "publicação". Uma movimentação
-- importada continua sendo movimentação.
--
-- read_at/handled_at também são distintos: abrir uma intimação não é o mesmo
-- que já ter providenciado o que ela pede. O modelo mostra os dois estados
-- ("Não lida" e o botão "Marcar tratada").
-- ============================================================

alter table public.legal_process_movements
  add column if not exists kind         text not null default 'movimentacao'
                             check (kind in ('movimentacao', 'publicacao')),
  -- Título curto separado do corpo: hoje `description` acumula os dois.
  add column if not exists title        text,
  -- Magistrado/serventuário responsável, quando a origem informa.
  add column if not exists author       text,
  -- Numeração do evento no tribunal (o "#462" do modelo).
  add column if not exists event_number integer,
  add column if not exists read_at      timestamptz,
  add column if not exists handled_at   timestamptz;

create index if not exists idx_movements_kind
  on public.legal_process_movements(legal_process_id, kind);

-- Publicações não lidas são o que a tela precisa destacar primeiro.
create index if not exists idx_movements_unread
  on public.legal_process_movements(legal_process_id)
  where read_at is null;
