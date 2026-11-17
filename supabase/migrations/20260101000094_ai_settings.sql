-- ============================================================
-- 94 — CONFIGURAÇÃO DO ASSISTENTE IA PELO PAINEL
--
-- Até aqui provedor, chaves, workspace e teto moravam só no ambiente
-- (`AI_ASSISTANT_PROVIDER`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`,
-- `ANTHROPIC_WORKSPACE_ID`, `AI_MONTHLY_BUDGET_USD`). Estas tabelas guardam o
-- que a aba "Assistente IA" de Configurações define (docs/ia-configuracoes.md).
--
-- Sem linha, nada muda: o servidor continua lendo o ambiente. Com linha, o
-- banco vale mais que o ambiente, campo a campo
-- (`src/features/ia/config/runtimeConfig.ts`).
--
-- Escrita só pelas rotas do servidor (service_role), depois de conferir
-- `configuracoes:manage` com o client de sessão: nenhuma policy de escrita.
-- ============================================================


-- ── Configuração (linha única) ───────────────────────────────────────────────

create table if not exists public.ai_settings (
  id                    boolean primary key default true check (id),
  /** NULL = o ambiente decide (`AI_ASSISTANT_PROVIDER`). */
  active_provider       text check (active_provider in ('anthropic', 'google')),
  /** Modelo de cada provedor, conferido contra a lista curada no servidor.
   * NULL = o padrão do código. Um por provedor porque o lote (triagem, resumo
   * automático) continua no Claude mesmo com o Gemini ativo. */
  anthropic_model       text,
  google_model          text,
  /** 'env': o teto vem de `AI_MONTHLY_BUDGET_USD`. 'panel': vale a coluna
   * abaixo, e NULL ali é "sem teto". Explícito para que salvar outra coisa no
   * painel nunca apague em silêncio um teto definido no ambiente. */
  budget_source         text not null default 'env' check (budget_source in ('env', 'panel')),
  monthly_budget_usd    numeric(12, 2) check (monthly_budget_usd is null or monthly_budget_usd > 0),
  /** Interruptores por função (respeitados a partir da fase 3 do plano). */
  assistant_enabled     boolean not null default true,
  portal_enabled        boolean not null default true,
  auto_summary_enabled  boolean not null default true,
  triage_enabled        boolean not null default true,
  briefing_enabled      boolean not null default true,
  updated_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.ai_settings;
create trigger set_updated_at before update on public.ai_settings
  for each row execute function public.set_updated_at();

-- Nenhum segredo aqui: quem vê Configurações vê como a IA está montada.
select public.apply_rbac_policies(
  'ai_settings',
  'configuracoes:view', null, null, null
);


-- ── Chaves (uma por provedor) ────────────────────────────────────────────────

create table if not exists public.ai_provider_keys (
  provider          text primary key check (provider in ('anthropic', 'google')),
  /** Chave CIFRADA com AES-GCM (base64 de iv||ciphertext). A chave de cifra é
   * derivada do ambiente do servidor, nunca do banco
   * (`src/features/ia/config/keyVault.ts`). */
  key_sealed        text not null,
  /** Os últimos caracteres, para a tela mostrar `••••abcd`. */
  key_hint          text not null check (char_length(key_hint) between 1 and 8),
  /** Só Anthropic: chave de service account com vários workspaces precisa do
   * cabeçalho `anthropic-workspace-id`. Fica junto da chave a que pertence. */
  workspace_id      text check (workspace_id is null or provider = 'anthropic'),
  last_test_at      timestamptz,
  last_test_ok      boolean,
  last_test_error   text,
  updated_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.ai_provider_keys;
create trigger set_updated_at before update on public.ai_provider_keys
  for each row execute function public.set_updated_at();

-- Sem policy nenhuma: só a service_role lê e escreve. A tela recebe da rota um
-- resumo (final da chave, workspace, último teste), nunca a coluna cifrada.
alter table public.ai_provider_keys enable row level security;


-- ── Histórico de alterações ──────────────────────────────────────────────────

create table if not exists public.ai_settings_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  changed_by  uuid references public.profiles(id) on delete set null,
  kind        text not null
                check (kind in ('provider', 'model', 'key_set', 'key_removed', 'budget', 'toggle', 'test')),
  /** De/para e resultado. NUNCA a chave, nem cifrada. */
  details     jsonb not null default '{}'::jsonb
);

create index if not exists idx_ai_settings_log_created
  on public.ai_settings_log(created_at desc);

select public.apply_rbac_policies(
  'ai_settings_log',
  'configuracoes:view', null, null, null
);
