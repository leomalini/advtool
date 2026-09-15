-- ============================================================
-- 56 — CACHE E AUDITORIA DA BUSCA DE PROCESSOS POR CPF/CNPJ
--
-- `GET /v1/processos?cpf_cnpj=` é a consulta mais pesada da integração, e a
-- única em que o consumo depende do RESULTADO: quanto mais processos a pessoa
-- tiver, maior o consumo — que por isso não é previsível antes da chamada.
--
-- Sem esta tabela, reabrir a mesma ficha de cliente e clicar em buscar de novo
-- refazia a consulta inteira pelo mesmo resultado.
--
-- ── Por que append-only, e não uma linha por documento ──
-- As duas necessidades são diferentes: o CACHE quer a busca mais recente
-- daquele documento (índice por document + searched_at desc), e a AUDITORIA
-- quer saber quem consultou o quê e quando. Um upsert por documento atenderia
-- a primeira e apagaria a segunda. A janela de reaproveitamento é decidida no
-- código, não aqui: a tabela guarda o histórico, a rota escolhe até quando uma
-- linha ainda serve.
--
-- ── Por que `insert` exige 'processos:create' e não 'processos:view' ──
-- Gravar uma linha aqui é o registro de uma consulta externa. Quem só pode ver
-- processos consegue LER buscas já feitas (o cache continua servindo para
-- essa pessoa), mas não pode disparar uma nova.
-- ============================================================

create table if not exists public.document_process_searches (
  id             uuid primary key default gen_random_uuid(),

  /** CPF ou CNPJ normalizado — só dígitos, como a API também devolve. É a
   * chave de reaproveitamento, então formatação divergente ('123.456...')
   * criaria buscas "novas" para o mesmo documento e repetiria a consulta. */
  document       text not null check (document ~ '^[0-9]{11}$' or document ~ '^[0-9]{14}$'),

  /** 'cpf' | 'cnpj', como a API classificou (`data.documentType`). */
  document_type  text,

  /** De qual ficha a busca partiu, quando partiu de uma. Nullable porque a
   * mesma rota serve consulta avulsa; ON DELETE SET NULL para que apagar o
   * cliente não apague o registro da consulta. */
  client_id      uuid references public.clients(id) on delete set null,

  /** `data.envolvido`: nome e tipo de pessoa do titular do documento. */
  envolvido      jsonb,

  /** Quantos processos a API reportou em `data.total`. */
  total          integer not null default 0,

  /** `data.processos`, sem o campo `raw` de cada item — a API repete o
   * processo inteiro lá dentro e isso dobraria o tamanho gravado. */
  result         jsonb not null,

  /** `meta.creditsCharged`, como a API reportou. Registro interno para
   * conferência de consumo — não é exposto em tela. */
  credits_charged numeric,

  searched_by    uuid not null references public.profiles(id),
  searched_at    timestamptz not null default now()
);

-- Consulta quente: "a busca mais recente deste documento". O desc no segundo
-- termo é o que permite responder com um único índice, sem sort.
create index if not exists idx_document_searches_document
  on public.document_process_searches(document, searched_at desc);

-- Usado pela ficha do cliente para mostrar quando foi a última busca dele.
create index if not exists idx_document_searches_client
  on public.document_process_searches(client_id, searched_at desc)
  where client_id is not null;

select public.apply_rbac_policies(
  'document_process_searches',
  'processos:view', 'processos:create', null, 'processos:delete'
);
