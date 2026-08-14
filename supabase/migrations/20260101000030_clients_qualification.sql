-- ============================================================
-- 30 — Campos de qualificação e etiquetas em clients
--
-- A qualificação é o parágrafo que abre toda petição ("NOME, brasileiro,
-- casado, professor, portador do RG..."). Até aqui o cadastro só guardava nome,
-- documento, contato e endereço — ou seja, o advogado redigitava o resto a cada
-- peça, que é exatamente onde nascem as divergências entre o cadastro e o que
-- foi protocolado.
--
-- Tudo nullable de propósito: cadastro incompleto é a regra (a maioria dos
-- clientes chega com nome e CPF), e o gerador da qualificação omite o que
-- faltar em vez de exigir.
-- ============================================================

alter table public.clients
  add column if not exists birth_date     date,
  -- Define a concordância da qualificação: "casado" vs "casada".
  add column if not exists sex            text,
  -- O adjetivo literal que entra na frase ("brasileiro"/"brasileira"), não o
  -- nome do país — é o que a petição exige.
  add column if not exists nationality    text,
  add column if not exists marital_status text,
  add column if not exists profession     text,
  add column if not exists rg             text,
  -- Órgão emissor com UF, ex. "SSP/ES".
  add column if not exists rg_issuer      text,
  -- Mesmas etiquetas já usadas em crm_items (CRM_TAGS).
  add column if not exists tags           text[] not null default '{}';

-- CHECKs em comando separado: `add column ... check` inline não é idempotente
-- entre execuções, e este arquivo precisa poder rodar de novo sem quebrar.
alter table public.clients
  drop constraint if exists chk_clients_sex;
alter table public.clients
  add constraint chk_clients_sex
  check (sex is null or sex in ('masculino', 'feminino', 'outro'));

alter table public.clients
  drop constraint if exists chk_clients_marital_status;
alter table public.clients
  add constraint chk_clients_marital_status
  check (
    marital_status is null
    or marital_status in (
      'solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel', 'separado'
    )
  );

-- Busca por etiqueta na lista de clientes.
create index if not exists idx_clients_tags on public.clients using gin(tags);
