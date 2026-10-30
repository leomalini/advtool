-- ============================================================
-- 88 — OAB DOS ADVOGADOS DE CADA PARTE
--
-- A capa da BuscaProcessos liga cada parte aos advogados dela
-- (`fontes[].envolvidos[].advogados[].oab`), e o mapeamento jogava isso fora:
-- `legal_process_parties` só guardava nome, documento, polo e tipo.
--
-- Sem a ligação não dá para responder "qual destas partes é nossa cliente" —
-- e é ela que permite cadastrar o cliente sozinho quando chega uma publicação
-- ou movimentação do processo (`src/lib/clientes/officeClients.ts`): a parte
-- cujo advogado tem uma OAB do escritório é a que o escritório representa.
--
-- Formato 'UF:NÚMERO', número sem zeros à esquerda ('ES:9591'): a capa manda
-- '0009591', o diário manda '9591/ES' e o perfil guarda o que a pessoa digitou.
-- Normalizar na escrita deixa a comparação ser igualdade pura. Ver
-- `src/lib/oab.ts`.
--
-- Partes gravadas antes desta migration ficam com a lista vazia até a próxima
-- sincronização da capa — não há de onde tirar a OAB sem consultar de novo.
-- ============================================================

alter table public.legal_process_parties
  add column if not exists lawyer_oabs text[] not null default '{}';

comment on column public.legal_process_parties.lawyer_oabs is
  'OABs dos advogados desta parte, como ''UF:NÚMERO'' sem zeros à esquerda. '
  'Vem da capa da BuscaProcessos; é por ela que o sistema reconhece a parte '
  'representada pelo escritório (migration 88).';
