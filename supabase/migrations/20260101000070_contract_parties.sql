-- ============================================================
-- 70 — CONTRATOS (fase 2: partes, papéis do modelo e a minuta guardada)
--
-- Plano: `docs/contratos.md`.
--
-- Um contrato tem partes — contratante e contratado, locador e locatário,
-- fiador, testemunhas —, e nem todas são clientes. Esta migration dá a elas
-- um lugar, e ao modelo um jeito de dizer que papéis espera.
--
--   · `contract_parties`           — uma parte, com a qualificação copiada;
--   · `contracts.template_values`  — o que foi preenchido na última minuta;
--   · `documents.contract_party_id`, `source_kind` — de quem é o documento
--     lido e o que ele é (CNH, matrícula…);
--   · `document_templates.parties` — os papéis que o modelo declara.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. `contract_parties`
--
-- Uma CÓPIA da qualificação, não uma referência viva ao cadastro: a minuta
-- saiu com aqueles dados, e o registro precisa contar a mesma história mesmo
-- que o cliente mude de endereço depois. Quem quer os dados novos usa
-- "Atualizar do cadastro" na tela — a parte guarda `client_id` para isso.
--
-- `source` diz de onde a parte veio: do cadastro de clientes, dos dados do
-- escritório, de documentos lidos pela IA ou digitada. `field_sources` diz,
-- campo a campo, de qual documento veio cada dado:
--
--   { "marital_status": "<document_id>", "address": "<document_id>" }
--
-- Mais de uma parte pode ter o mesmo papel (dois locatários): os campos do
-- papel juntam todas, na ordem de `position`.
--
-- Sub-entidade do contrato: ver, com `contratos:view`; criar, editar e apagar
-- uma parte é editar o contrato (`contratos:update`), como nas partes do
-- processo (migration 36).
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.contract_parties (
  id              uuid primary key default gen_random_uuid(),
  contract_id     uuid not null references public.contracts(id) on delete cascade,
  position        integer not null default 0,

  /** A chave do papel nos campos do modelo: `locatario` → `{locatario_nome}`. */
  role_key        text not null check (role_key ~ '^[a-z][a-z0-9_]*$'),
  role_label      text not null check (btrim(role_label) <> ''),

  source          text not null
                    check (source in ('cliente', 'escritorio', 'documentos', 'manual')),
  client_id       uuid references public.clients(id) on delete set null,

  person_type     text not null default 'individual'
                    check (person_type in ('individual', 'company')),
  name            text,
  /** CPF ou CNPJ, só dígitos. */
  document        text check (document is null or document ~ '^[0-9]+$'),
  rg              text,
  rg_issuer       text,
  sex             text check (sex is null or sex in ('masculino', 'feminino', 'outro')),
  birth_date      date,
  nationality     text,
  marital_status  text check (marital_status is null or marital_status in (
                    'solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel', 'separado'
                  )),
  profession      text,
  /** { street, number, complement, neighborhood, city, state, zip } */
  address         jsonb check (address is null or jsonb_typeof(address) = 'object'),
  email           text,
  phone           text,
  /** Quem assina pela pessoa jurídica. */
  representative  text,
  field_sources   jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(field_sources) = 'object'),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_contract_parties_contract
  on public.contract_parties(contract_id, position);
create index if not exists idx_contract_parties_client_id
  on public.contract_parties(client_id);

drop trigger if exists set_updated_at on public.contract_parties;
create trigger set_updated_at before update on public.contract_parties
  for each row execute function public.set_updated_at();

select public.apply_rbac_policies(
  'contract_parties',
  'contratos:view',
  'contratos:update',
  'contratos:update',
  'contratos:update'
);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. A minuta guardada
--
-- O que quem gerou preencheu na tela — campos manuais, opções, textos da IA,
-- correções por cima do cadastro, advogados — e de qual modelo. "Gerar nova
-- versão" reabre com isso, sem redigitar. jsonb e não colunas: o formato
-- acompanha os campos de cada modelo e é validado no app (zod).
-- ────────────────────────────────────────────────────────────────────────────

alter table public.contracts
  add column if not exists template_values jsonb not null default '{}'::jsonb
    check (jsonb_typeof(template_values) = 'object');


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Documentos lidos
--
-- `contract_party_id`: de quem é o documento (a CNH do locatário). `set null`:
-- tirar a parte não apaga o documento, que continua anexo do contrato.
-- `source_kind`: o que o leitor disse que o documento é (`cnh`, `matricula`…),
-- para a lista mostrar "CNH — João" sem depender do nome do arquivo.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.documents
  add column if not exists contract_party_id uuid
    references public.contract_parties(id) on delete set null;

alter table public.documents
  add column if not exists source_kind text
    check (source_kind is null or btrim(source_kind) <> '');

create index if not exists idx_documents_contract_party_id
  on public.documents(contract_party_id);

alter table public.documents drop constraint if exists chk_documents_contract_party;
alter table public.documents add constraint chk_documents_contract_party check (
  contract_party_id is null or contract_id is not null
);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. Papéis do modelo
--
-- [{ "key": "locatario", "label": "Locatário" }, …]. Cada papel ganha os mesmos
-- campos do cliente: `{locatario_nome}`, `{locatario_qualificacao}`… Declarado
-- e não deduzido do nome: `{imovel_endereco}` termina como um campo de parte,
-- mas é do objeto do contrato. A tela sugere, quem cadastra confirma.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.document_templates
  add column if not exists parties jsonb not null default '[]'::jsonb
    check (jsonb_typeof(parties) = 'array');
