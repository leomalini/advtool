-- ============================================================
-- 27 — PARTES DO PROCESSO
--
-- `legal_processes.plaintiff` e `.defendant` guardam UM nome por polo, em
-- texto. Um processo real tem vários de cada lado — e a API BuscaProcessos já
-- devolve o array completo (`BpParte { nome, documento, polo, tipo }`), que era
-- descartado no mapeamento: `partes.find(p => p.polo === polo)?.nome` ficava
-- só com a primeira de cada polo e jogava fora documento e tipo.
--
-- As colunas antigas permanecem como fallback para processos já cadastrados;
-- aposentá-las é uma limpeza separada.
-- ============================================================

create table public.legal_process_parties (
  id                uuid primary key default gen_random_uuid(),
  legal_process_id  uuid not null references public.legal_processes(id) on delete cascade,
  name              text not null,
  /** CPF/CNPJ quando informado pela origem. */
  document          text,
  polo              text not null check (polo in ('ativo', 'passivo')),
  /** Papel na relação processual: Requerente, Advogado, Terceiro Interessado... */
  party_type        text,
  /** Preserva a ordem em que a origem listou as partes. */
  position          integer not null default 0,
  created_at        timestamptz not null default now()
);

create index idx_parties_process on public.legal_process_parties(legal_process_id, polo, position);

alter table public.legal_process_parties enable row level security;
create policy "auth_full" on public.legal_process_parties
  for all using (auth.role() = 'authenticated');
