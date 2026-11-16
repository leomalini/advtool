# Painel do Assistente IA em Configurações

> Plano de 2026-11-16. Decisões tomadas com o usuário na mesma data (seção D).
> Fase 1 em `feat/ia-config-base`, Fase 2 em `feat/ia-config-painel` (migration 94 NÃO
> aplicada).

## Objetivo

Hoje tudo que define a IA mora no ambiente (`.env` / Vercel): provedor
(`AI_ASSISTANT_PROVIDER`), chaves (`ANTHROPIC_API_KEY`,
`GOOGLE_GENERATIVE_AI_API_KEY`), workspace (`ANTHROPIC_WORKSPACE_ID`) e teto
(`AI_MONTHLY_BUDGET_USD`). Trocar qualquer um exige mexer na Vercel e
redeployar, e ninguém no escritório vê se a chave funciona ou quanto já foi
gasto.

O painel leva isso para uma aba **Assistente IA** em Configurações: escolher o
provedor e o modelo, guardar e testar a chave, ver e limitar o gasto, ligar e
desligar funções, e ver quem mudou o quê.

## Critérios de aceite

- [ ] Aba "Assistente IA" em Configurações, visível com `configuracoes:view`;
      só `configuracoes:manage` altera.
- [ ] Escolher provedor (Claude ou Gemini) e modelo (lista curada).
- [ ] Guardar uma chave por provedor, cifrada no banco; a tela só mostra o
      final (`••••abcd`). A chave nunca volta ao navegador.
- [ ] "Testar conexão" sem gastar tokens: valida chave, workspace e se o
      modelo escolhido está liberado na conta; erro traduzido.
- [ ] Salvar uma chave nova testa antes; chave recusada não substitui a atual.
- [ ] Com Gemini ativo, triagem e resumo automático seguem no Claude (se houver
      chave do Claude); sem ela, pausam — e o painel mostra isso.
- [ ] Teto mensal editável + gasto do mês + gasto por função (de `ai_usage`).
- [ ] Interruptores por função, respeitados pelas rotas, pelo cron e pelo portal.
- [ ] Histórico: quem trocou provedor, modelo, chave, teto ou interruptor, e
      quando; resultado do último teste de cada chave.
- [ ] Com as tabelas vazias, o comportamento é idêntico ao de hoje (o `.env`
      continua valendo como reserva).

## D — Decisões (2026-11-16)

| # | Tema | Decisão |
|---|------|---------|
| D1 | Onde a chave fica | **Banco, cifrada** (AES-GCM, chave derivada do ambiente — mesmo esquema de `src/lib/clientPortal/vault.ts`). `.env` vira reserva quando o banco está vazio. |
| D2 | Provedores | **Claude + Gemini** (os dois já instalados). OpenAI fica fora. |
| D3 | Granularidade | **Provedor + um modelo principal.** Esforço por função continua em `AI_ROUTE_SETTINGS` (`src/features/ia/model.ts`), onde foi validado. Guardado um modelo POR provedor: com o Gemini ativo, o lote (D7) precisa saber qual Claude usar. |
| D4 | Extras | **Todos:** teto + gasto do mês, gasto por função, ligar/desligar funções, histórico. |
| D5 | Teste de conexão | **Grátis + confere o modelo**: consulta o modelo escolhido na API do provedor (sem gerar texto). |
| D6 | Salvar chave | **Só depois do teste passar.** |
| D7 | Lote com Gemini ativo | **Continua no Claude** se houver chave do Claude; senão pausa com aviso. |
| D8 | Lista de modelos | **Curada no código**, só modelos com preço em `src/features/ia/usage/pricing.ts`. |

Decidido por mim (dá para mudar na revisão):

- **Permissão:** ver = `configuracoes:view`; alterar = `configuracoes:manage`
  (mesma regra do card da InfinitePay).
- **Precedência:** linha do banco > variável de ambiente, campo a campo. Sem
  linha, tudo como hoje.
- **Moeda do teto:** US$, como `ai_usage.cost_usd` e o Console da Anthropic.
- **Funções manuais** (gerar resumo na tela, leitor de contratos, redação de
  modelos) seguem o interruptor "Assistente".

## Modelo de dados (1 migration — número livre na hora; 94 está reservado em `docs/cobrancas.md`)

**`ai_settings`** — linha única (`id boolean primary key default true`, como
`office_settings`). Sem segredo nenhum.

- `active_provider text check in ('anthropic','google')` — nulo = ambiente
- `anthropic_model`, `google_model` — validados contra a lista curada no
  servidor; nulo = padrão do código
- `budget_source text ('env' | 'panel')` + `monthly_budget_usd numeric(12,2)`
  — com `panel`, nulo = sem teto; com `env`, vale `AI_MONTHLY_BUDGET_USD`.
  Explícito para que salvar outra coisa no painel nunca apague um teto do
  ambiente.
- interruptores `boolean not null default true`: `assistant_enabled`,
  `portal_enabled`, `auto_summary_enabled`, `triage_enabled`,
  `briefing_enabled`
- `updated_by`, `updated_at`
- RLS: `select` para quem tem `configuracoes:view`; escrita só pela rota do
  servidor (service role), que confere `configuracoes:manage`.

**`ai_provider_keys`** — uma linha por provedor.

- `provider text primary key check in ('anthropic','google')`
- `key_sealed text not null` — base64 de `iv || ciphertext`
- `key_hint text not null` — 4 últimos caracteres
- `workspace_id text` — só Anthropic
- `last_test_at`, `last_test_ok boolean`, `last_test_error text`
- `updated_by`, `updated_at`
- RLS ligada **sem nenhuma policy**: só a service role lê. O navegador recebe
  um resumo montado na rota (`hint`, workspace, último teste).

**`ai_settings_log`** — histórico.

- `id`, `changed_at`, `changed_by`
- `kind text` (`provider`, `model`, `key_set`, `key_removed`, `budget`,
  `toggle`, `test`)
- `details jsonb` — de/para, nunca a chave
- RLS: `select` com `configuracoes:view`; insert só pelo servidor.

## Cifragem

- Cofre do portal generalizado: o AES-GCM saiu de
  `src/lib/clientPortal/vault.ts` para `src/lib/crypto/secretVault.ts`
  (`createSecretVault(deriveKeyBytes)`); o portal usa o mesmo formato e o
  mesmo `KEY_INFO` (tokens antigos conferidos: abrem e batem com o hash).
  As chaves da IA ficam em `src/features/ia/config/keyVault.ts`.
- Chaves de IA usam `info = 'advtool:ai-settings:provider-key:v1'` sobre o
  mesmo segredo raiz (`portalRootSecret()` em `src/lib/clientPortal/secret.ts`:
  `CLIENT_PORTAL_SECRET`, senão `SUPABASE_SERVICE_ROLE_KEY`). Nenhuma variável
  nova.
- **Risco aceito:** trocar o segredo raiz torna as chaves ilegíveis. O
  resolvedor cai para o `.env` e o painel mostra "chave ilegível — informe de
  novo". Precisa ser documentado junto da rotação da service role.

## Resolução em tempo de execução

- Novo `getAiRuntimeConfig()` (server-only): lê `ai_settings` +
  `ai_provider_keys` com a service role, decifra, aplica a precedência banco >
  `.env`. Cache em memória de ~30 s por instância, invalidado ao salvar na
  mesma instância — em outras instâncias da Vercel a troca vale em até 30 s.
- `createAssistantModel(route, scope)` passa a ser **assíncrono** e usa a
  config resolvida (chave e workspace via `createAnthropic({ apiKey, headers })`
  / `createGoogle({ apiKey })`). Chamadores ajustados (conferidos por grep):
  `api/ia/chat`, `api/contratos/ler-documentos`,
  `api/documentos/modelos/redigir`, `api/processos/[id]/resumo`,
  `features/ia/tools/contracts.ts`, `features/portal/answers/ensurePortalAnswers.ts`,
  `features/ia/briefing/dailyBriefing.ts`, `features/ia/batch/enqueue.ts` e
  `collect.ts`.
- **Lote (D7):** `enqueue.ts` hoje exige `AI_ASSISTANT_PROVIDER=anthropic` +
  `ANTHROPIC_API_KEY`. Passa a exigir só "há chave do Claude" e o interruptor
  da função, independentemente do provedor ativo. `collect.ts` só troca para a
  chave resolvida (via `createAnthropicProvider`).
- **Modelo:** o modelo do provedor ativo atende todas as rotas
  (`AI_ROUTE_SETTINGS` agora só tem o esforço). O lote usa sempre o modelo
  do Claude (`anthropicBatchSetup` em `model.ts`).
- **Teto:** `checkAiBudget()` (`src/features/ia/usage/budget.ts`) lê o valor
  resolvido em vez da variável; mesma falha fechada.
- **Interruptores:** cada ponto de entrada consulta o seu e responde com a
  mensagem de "desligado nas Configurações" (chat), esconde o botão (portal)
  ou simplesmente não enfileira (triagem, resumo automático, briefing).

## Teste de conexão (D5)

Rota `POST /api/configuracoes/ia/testar` (manage). Recebe provedor + chave
nova opcional (ou testa a guardada) + modelo.

- **Claude:** consulta o modelo escolhido na API de modelos da Anthropic (com
  o cabeçalho de workspace se houver). 401 = chave inválida; 403 = sem acesso;
  404 = modelo não liberado; 400 de workspace = "informe o workspace".
- **Gemini:** consulta o modelo na API do Gemini. Mesma tradução de erros.
- Grava `last_test_*` e uma linha `test` no histórico.
- **Limite conhecido:** consultar o modelo não gasta crédito, então **não
  detecta saldo zerado** (o 402 do Gemini pré-pago). O painel diz isso ao lado
  do resultado.
- Endpoints e formato de erro conferidos na documentação viva antes de
  implementar (não de memória).

## Tela

Aba **Assistente IA** (ícone `Sparkles`), entre "Assinatura" e "Áreas
Jurídicas". Cards:

1. **Provedor e modelo** — rádio Claude / Gemini, select do modelo da lista
   curada (com preço por milhão de tokens), aviso quando o Gemini está ativo
   ("triagem e resumo automático continuam no Claude" ou "pausados: sem chave
   do Claude"). Trocar provedor sem chave testada daquele provedor fica
   bloqueado.
2. **Chaves** — uma linha por provedor: `••••abcd`, workspace (Claude),
   último teste (✓/✗ + quando), botões Testar / Trocar chave / Remover.
   "Trocar" abre um diálogo: campo de senha → testa → salva só se passar.
   Remover pede confirmação e avisa se a origem passa a ser o `.env`. Quando a
   chave vem do `.env`, a linha diz "do ambiente".
3. **Gasto e teto** — gasto do mês vs. teto (barra), campo do teto, tabela do
   mês por função (chamadas, custo) a partir de `ai_usage`. Chamadas sem preço
   (Gemini) contadas à parte como "sem custo estimado".
4. **Funções** — interruptores: Assistente (chat, painel, ações manuais),
   Perguntas do portal, Resumo automático, Triagem de publicações, Briefing
   diário.
5. **Histórico** — últimas 50 alterações (quem, quando, o quê).

Leituras da tela por React Query; escrita só por rotas do servidor com zod.

## Fases (PRs empilhados em `release/ia-configuracoes`, um merge na main)

1. **Fundação** — migration, cofre generalizado, `getAiRuntimeConfig`,
   `createAssistantModel` assíncrono e todos os chamadores, lote
   desacoplado do provedor ativo, teto pelo valor resolvido. Sem tela.
   Com as tabelas vazias nada muda. Verificação: tsc, lint, build, script no
   scratchpad que resolve a config (banco vazio, banco com chave, chave
   ilegível) e uma chamada real curta.
2. **Provedor, chaves e teste** — aba, cards 1 e 2, rotas de teste/chave/
   provedor, histórico gravado. Verificação: navegador (página temporária, como
   nas fases anteriores) + teste real com chave válida e inválida.
3. **Gasto, funções e histórico** — cards 3, 4 e 5; interruptores respeitados
   no chat, portal, `after()` do webhook/sync, enfileiramento e cron.
   Verificação: cada interruptor desligado barra o ponto de entrada.

Antes do merge final: aplicar a migration; nada muda na Vercel (o `.env`
continua de reserva). Depois de colar as chaves pelo painel, as variáveis
`ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` podem sair da Vercel — a
critério do usuário.

## Fase 1 — estado (2026-11-16)

- Lista curada (`src/features/ia/config/models.ts`): Claude Opus 5.5
  (padrão), Claude Sonnet 5.5 (preço em `pricing.ts`: US$ 2 / 10, cache
  0,10 / 2,50), Gemini 3.8 Flash (sem preço, como antes).
- Verificado: tsc, lint, build; 19/19 cenários do resolvedor/modelo/lote/teto
  contra banco simulado e fetch interceptado (chave, workspace, modelo e
  esforço no pedido real montado); banco real só leitura: sem a migration 94 o
  painel fica "indisponível" e tudo vem do ambiente, como antes.
- **Não verificado:** chamada real ao Claude — a `ANTHROPIC_API_KEY` do
  `.env` local é recusada pela API (401 em `GET /v1/models`, sem o código do
  app no meio). Produção usa a chave da Vercel.
- A Fase 2 pode usar `GET /v1/models/{id}` como teste grátis: o 401 acima
  confirma que ele valida a chave.

## Fase 2 — estado (2026-11-16)

- Aba **Assistente IA** em Configurações: card "Provedor e modelo" (troca de
  provedor pede confirmação; Gemini mostra o aviso do lote e do plano
  gratuito) e card "Chaves de API" (origem painel/ambiente, final da chave,
  workspace, último teste, Testar / Cadastrar ou Trocar / Remover).
- Rotas: `GET /api/configuracoes/ia` (view), `POST …/testar`,
  `PUT|DELETE …/chave`, `PUT …/provedor` (manage). Serviço em
  `src/features/ia/config/panelSettings.ts`; teste em `providerTest.ts`
  (`GET /v1/models/{id}` da Anthropic, `GET v1beta/models/{id}` do Google).
- Remover a chave do provedor ativo sem chave no ambiente é recusado.
- Histórico gravado (`provider`, `model`, `key_set`, `key_removed`,
  `test`), sem a chave. A lista na tela é da Fase 3.
- Verificado: tsc, lint, build; 18/18 cenários do serviço (banco em memória +
  provedor simulado); teste contra as APIs reais (401/404/400 traduzidos,
  chave Google do `.env` ok); rotas recusam sem sessão (401); tela conferida
  no navegador com dados simulados (desktop e 375 px).
- **Não verificado:** a aba logada contra o banco real (precisa da migration 94).

## Em aberto

- Preço do Gemini (hoje fora de `pricing.ts`) — conferir na página de
  preços ao vivo antes de o Gemini aparecer com custo.
- O Sonnet 5.5 nunca foi validado nas funções do AdvTool (o painel avisa).
- Se o resumo manual deve ter interruptor próprio em vez de seguir o
  "Assistente".
