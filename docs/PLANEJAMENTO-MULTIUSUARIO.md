# Planejamento — Múltiplos Usuários e Níveis de Acesso

> **Status**: Fases 1 a 5 implementadas em código. Pendências que só o operador resolve:
> aplicar as migrations 34–39 ao banco do `.env`, configurar `SUPABASE_SERVICE_ROLE_KEY`,
> ajustar o template de convite e a redirect URL no painel do Supabase, e fazer a passada
> final com uma conta de cada perfil.
> **O app exige as migrations aplicadas**: sem a função `can()`, `requirePermission()` falha
> fechado e toda rota redireciona para `/sem-acesso`.
> **Escopo**: um único escritório (single-tenant), vários usuários com perfis distintos.
> **Reabre explicitamente** o princípio transversal #5 do `docs/ROADMAP-MODULOS.md`
> ("não introduzir granularidade nova de RLS sem decisão explícita em contrário").
> Esta é a decisão explícita em contrário. **Não** reabre a decisão de multi-tenant —
> continua um escritório só.

---

## 1. Decisões tomadas

| # | Decisão | Escolha |
|---|---|---|
| 1 | Perfis de acesso | `admin`, `attorney` (advogado), `paralegal` (estagiário), `finance` (financeiro/secretariado) |
| 2 | Escopo de dados | **Todos veem tudo do escritório.** A restrição é por módulo e por ação, nunca por dono do registro |
| 3 | Onboarding | **Convite por e-mail dentro do app**, disparado pelo admin em Configurações |
| 4 | Financeiro | **Advogado tem controle total** (criar, editar, apagar lançamentos), igual ao admin. Restrito a `paralegal`, que não acessa o módulo |

A decisão 2 é a que mais reduz o custo do projeto: sem escopo por linha, as policies de
RLS não precisam correlacionar `assigned_to`/`created_by` em cada tabela — viram
verificações de permissão constantes por statement, o que também elimina o risco de
performance descrito no §8.

---

## 2. Estado atual (auditoria do codebase)

| Item | Situação hoje |
|---|---|
| RLS | `create policy "auth_full" ... for all using (auth.role() = 'authenticated')` em **100% das tabelas**. Qualquer usuário logado lê, edita e apaga tudo |
| `profiles.role` | Já existe (`'admin'` \| `'attorney'`, default `attorney`), mas é **decorativo** — só vira label em `getRoleLabel()` e no `EventForm.tsx:665` |
| Cadastro de usuários | Não existe. Só `/login` com `signInWithPassword`. Usuários nascem no painel do Supabase |
| Tela de usuários | `ConfiguracoesContent.tsx` aba "Usuários" lê o mock `ADVOGADOS` de `src/data/mock.ts` — nenhum dado real |
| Colunas de propriedade | Já existem em quase tudo: `created_by`, `assigned_to`, `author_id`, `actor_id`, `uploaded_by`, `event_assignees` |
| Chave usada pelo front | Só a `anon` — o browser fala **direto** com o Supabase (`createBrowserClient`), sem camada de API própria |
| Storage | Bucket `attachments`: `auth_upload` / `auth_read` / `auth_delete` liberados para qualquer autenticado |
| Guard de rota | `src/proxy.ts` → `updateSession()` só verifica *se há sessão*, nunca *quem é* |
| Desativar usuário | Impossível sem quebrar FK — não há `is_active` |

### 2.1 Vulnerabilidade ativa hoje (independe deste plano)

A policy `auth_full` em `public.profiles` é `for all` — ou seja, **qualquer usuário
autenticado pode dar `update` no próprio registro e setar `role = 'admin'`**. Hoje isso
não tem consequência prática porque `role` não controla nada; no minuto em que a Fase 3
entrar, vira escalada de privilégio direta. A Fase 1 fecha esse buraco antes de qualquer
permissão passar a valer — a ordem das fases não é negociável por causa disso.

---

## 3. Matriz de permissões

Recurso × ação. Ações: `view`, `create`, `update`, `delete`, `manage`.

| Recurso | admin | attorney | paralegal | finance |
|---|:---:|:---:|:---:|:---:|
| `dashboard` | view | view | view | view¹ |
| `crm` | CRUD + delete | CRUD + delete | create, update | view |
| `processos` | CRUD + delete | CRUD + delete | create, update | view |
| `clientes` | CRUD + delete | CRUD + delete | create, update | view, update |
| `agenda` | CRUD + delete | CRUD + delete | create, update, delete | create, update, delete |
| `tarefas` | CRUD + delete | CRUD + delete | create, update | create, update |
| `documentos` | CRUD + delete | CRUD + delete | create, update | view |
| `financeiro` | CRUD + delete | CRUD + delete | — | CRUD + delete |
| `pendencias` | view | view | view | — |
| `configuracoes` | manage² | view | — | — |
| `usuarios` | manage | — | — | — |

¹ O card `FinanceiroResumo` do Dashboard é condicionado a `financeiro:view`, não ao recurso `dashboard`.
² `configuracoes:manage` cobre workflows, tipos de evento, áreas jurídicas e etiquetas.

**Regra de leitura da matriz**: ausência de linha = negado. Não existe "herança" entre
perfis — cada célula é explícita na tabela `role_permissions`.

> **Nota sobre `admin` vs. `attorney`**: com o advogado tendo controle total do
> Financeiro, o que separa os dois perfis passa a ser **apenas** administrar o sistema —
> `usuarios:manage` (convidar, trocar perfil, desativar) e `configuracoes:manage`
> (workflows, tipos de evento, áreas, etiquetas). Sobre os dados do escritório, `admin` e
> `attorney` são equivalentes. Isso é intencional e simplifica a operação: a distinção
> existe para que nem todo advogado possa mexer na estrutura do sistema nem no acesso dos
> colegas. Os perfis restritos de verdade são `paralegal` (não apaga nada, não vê
> Financeiro) e `finance` (só Financeiro, Agenda e Tarefas, com leitura do resto).

### 3.1 Onde a matriz mora

Numa tabela do banco, `public.role_permissions (role, resource, action)`, populada por
migration. **Fonte única de verdade**: o RLS consulta essa tabela via
`public.can(resource, action)`, e o frontend carrega a mesma tabela num `useQuery` com
`staleTime: Infinity` (são ~40 linhas). Nada de matriz duplicada em TypeScript — foi
justamente uma divergência entre schema e código que gerou os incidentes documentados no
`supabase/README.md`.

---

## 4. Arquitetura de enforcement

Três camadas, com pesos muito diferentes:

```
┌─ Camada 3 — UI (usePermissions, <Can>, Sidebar) ──── cosmética
│  Esconde o que o usuário não pode fazer. Zero valor de segurança.
├─ Camada 2 — Servidor (proxy.ts + page.tsx + Route Handlers) ── UX + endpoints admin
│  Redireciona quem abre /financeiro sem permissão. Protege as rotas de convite.
└─ Camada 1 — Banco (RLS) ──────────────────────────── ÚNICA barreira real
   O browser fala direto com o Supabase. Se a policy deixa, o dado sai.
```

> **O ponto mais importante deste documento**: como o front usa `createBrowserClient` com
> a chave anon e o JWT do usuário, qualquer pessoa com o DevTools aberto pode disparar
> `supabase.from('financial_entries').select('*')` de qualquer tela. Esconder o menu não
> esconde o dado. **Toda permissão precisa existir em RLS; a UI é conveniência.**

### 4.1 Como o perfil chega no RLS

Duas opções avaliadas:

| Opção | Prós | Contras |
|---|---|---|
| **(A) Função `SECURITY DEFINER STABLE`** que lê `profiles` | Troca de perfil vale **imediatamente**; simples | Um acesso a `profiles` por statement |
| (B) Custom Access Token Hook → claim no JWT | Zero acesso ao banco | Troca de perfil só vale após o refresh do token (até 1h de janela em que o usuário mantém o acesso antigo) |

**Recomendação: (A).** A janela de até 1h da opção (B) é inaceitável para "revoguei o
acesso de alguém que saiu do escritório hoje". O custo é neutralizado envolvendo a chamada
em `(select ...)` nas policies, o que faz o Postgres avaliar uma vez por statement
(InitPlan) em vez de uma vez por linha. Se o volume crescer a ponto de doer, migrar para
(B) é uma migration isolada, sem tocar em nenhuma policy.

Funções a criar (todas `security definer`, `stable`, `set search_path = public`):

- `public.app_role()` → `text` — o perfil do usuário atual. Nome deliberadamente distinto de `auth.role()`, que devolve `'authenticated'`/`'anon'` e continua existindo.
- `public.is_active_member()` → `boolean` — sessão válida **e** `profiles.is_active = true`.
- `public.can(resource text, action text)` → `boolean` — consulta `role_permissions`, já embutindo `is_active_member()`.
- `public.is_admin()` → `boolean` — atalho para o caso mais comum.

### 4.2 Forma padrão das policies

Substitui o `auth_full` em todas as tabelas de domínio:

```sql
alter table public.financial_entries enable row level security;
drop policy if exists "auth_full" on public.financial_entries;

create policy "rbac_select" on public.financial_entries
  for select using ((select public.can('financeiro', 'view')));
create policy "rbac_insert" on public.financial_entries
  for insert with check ((select public.can('financeiro', 'create')));
create policy "rbac_update" on public.financial_entries
  for update using ((select public.can('financeiro', 'update')))
           with check ((select public.can('financeiro', 'update')));
create policy "rbac_delete" on public.financial_entries
  for delete using ((select public.can('financeiro', 'delete')));
```

Quatro policies por tabela, uma por comando — `for all` não permite distinguir quem lê de
quem apaga, que é exatamente a granularidade pedida.

### 4.3 Camada 2 — onde fica o guard de rota

A doc do Next 16 (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`) é
explícita: *"Proxy is not intended for slow data fetching (...) should not be used as a
full session management or authorization solution"* — serve para **checagem otimista**.
Logo:

- **`src/proxy.ts`** — **inalterado**: continua só redirecionando quem não tem sessão. O plano original previa um mapa `rota → recurso` aqui, mas ele não é implementável: com o perfil vivendo no banco (opção A do §4.1) e não num claim do JWT, o proxy não tem como saber o perfil sem um roundtrip por navegação — exatamente o que a doc do Next desaconselha. O mapa só faria sentido junto com a opção (B).
- **`src/app/(app)/<modulo>/page.tsx`** — cada página (já é Server Component fininho envolvendo o `*Content`) chama `await requirePermission('financeiro')`, que pergunta ao banco pela mesma função `can()` das policies e redireciona. É a única checagem de rota, e é confiável.
- **`src/app/(auth)/sem-acesso/page.tsx`** — destino de quem tem sessão mas nenhuma permissão (conta desativada). Existe para quebrar o loop: sem ele, o redirect para `/dashboard` dispararia o `requirePermission` de lá, que redirecionaria de volta.

---

## 5. Fases

### Fase 0 — Preparação (0,5 dia)

- [ ] Levantar a lista real de pessoas do escritório e o perfil de cada uma.
- [ ] Gerar a `SUPABASE_SERVICE_ROLE_KEY` no painel do Supabase e guardá-la **fora do repo**. Ela entra no `.env` local (já coberto pelo `.gitignore`) e nas variáveis do host de produção. No `.env.example` entra **só o nome da variável, sem valor** — a chave dá acesso irrestrito ao banco, ignorando toda a RLS deste plano.
- [ ] Confirmar quem é o admin inicial (sem isso, ninguém consegue gerenciar ninguém depois da Fase 1).
- [ ] **Desligar "Allow new users to sign up"** no painel do Supabase (Authentication → Sign In / Providers). A chave `anon` é pública por definição; com auto-cadastro ligado, qualquer pessoa cria conta no escritório. A Fase 1 já faz contas novas nascerem inativas como segunda linha de defesa, mas a primeira é essa.

### Fase 1 — Fundação de perfis e blindagem de `profiles` (1,5 dia)

**Migration `20260101000034_rbac_foundation.sql`**

- [x] Trocar o CHECK de `profiles.role` para `('admin','attorney','paralegal','finance')`.
- [x] `profiles.is_active boolean not null default true` — desativar em vez de apagar (as FKs de `created_by`/`author_id` impedem delete).
- [x] Tabela `role_permissions (role text, resource text, action text, primary key (role, resource, action))` + seed da matriz do §3.
- [x] Funções `app_role()`, `is_active_member()`, `can()`, `is_admin()`.
- [x] Seed: promover o(s) usuário(s) existente(s) a `admin` — **antes** de qualquer policy nova entrar em vigor.
- [x] Policies de `profiles`: leitura para todo membro ativo (a UI precisa listar responsáveis em toda parte); `update` do próprio registro; `insert`/`delete` só admin.
- [x] Trigger `prevent_privilege_escalation` em `profiles`: bloqueia mudança de `role` ou `is_active` quando `not is_admin()`. RLS é por linha, não por coluna — sem o trigger, "posso editar meu perfil" continua significando "posso me promover".
- [x] Policies de `role_permissions`: `select` para membro ativo, escrita só admin.
- [x] `handle_new_user()`: contas novas nascem **inativas** com perfil `attorney`; o primeiro profile do sistema vira `admin` ativo (bootstrap).

> **Desvio do plano original, decidido na implementação.** O plano previa ler o perfil de
> `raw_user_meta_data->>'role'` com whitelist. Isso não é seguro: quem chama
> `/auth/v1/signup` escolhe o próprio metadata, e a chave `anon` está no bundle do browser
> por definição — com "Allow new users to sign up" ligado no projeto, qualquer pessoa na
> internet se cadastraria como `admin`. Duas mudanças fecham isso: o trigger **ignora**
> `role` do metadata, e contas novas nascem `is_active = false`. Quem define o perfil é a
> rota de convite da Fase 4, usando a service_role **depois** de confirmar que o chamador
> é admin. Enquanto a Fase 4 não existe, ativar alguém é um `update` documentado no
> cabeçalho do bloco 5 da migration.

**Verificação**: `supabase/tests/rbac_fase1_check.sql` — cola no SQL Editor e confere a
matriz, as funções, as policies e, no bloco 4 (dentro de uma transação com `rollback`),
prova que `update profiles set role='admin'` é rejeitado com 42501. Rodar também
`supabase db advisors`.

### Fase 2 — Camada de permissões no frontend (1,5 dia)

- [x] `src/types/permission.types.ts` — `AppRole`, `Resource`, `Action`, `RolePermission`.
- [x] `src/types/common.types.ts` — `Profile.role` para o novo union + `is_active`.
- [x] `src/hooks/usePermissions.ts` — `const { can } = usePermissions()` → `can('financeiro','update')`. Carrega `role_permissions` (staleTime `Infinity`) e cruza com o perfil da sessão. **O `permissions.service.ts` sob `features/configuracoes/` não foi criado**: permissão é infraestrutura global, não domínio de uma feature, e o precedente do projeto para isso é `useProfiles.ts`, que também busca direto no hook.
- [x] `src/components/shared/Can.tsx` — `<Can resource="financeiro" action="delete">…</Can>`, com `fallback` para preservar layouts `justify-between`.
- [x] `src/lib/auth/requirePermission.ts` — helper server-side, chamado nos 12 `page.tsx` do grupo `(app)`.
- [x] `src/app/(auth)/sem-acesso/` — página de fim de linha, ver §4.3.
- [x] `src/utils/profile.ts` — `PROFILE_ROLE_LABELS` ganha `paralegal` e `finance`. Corrigido o ternário hardcoded em `EventForm.tsx`, que rotulava qualquer não-admin como "Advogado".
- [x] `Sidebar.tsx` — filtra `navGroups`/`bottomItems` por `can(recurso,'view')`, esconde grupo que ficou vazio e mostra o perfil sob o e-mail.
- [x] Botões de criar e excluir sob `<Can>` em CRM, Processos, Clientes, Agenda, Tarefas, Documentos, Financeiro e Configurações (incluindo a aba Usuários, sob `usuarios:manage`).

**Verificação**: `tsc --noEmit` e `pnpm lint` limpos (13 warnings, todos pré-existentes). A prova de comportamento por perfil depende da Fase 4 (ou de um `update` manual de perfil) — enquanto todo mundo é `admin`, as quatro telas se comportam igual.

### Fase 3 — RLS por módulo (3 dias)

Uma migration por bloco, aplicada e verificada na tela antes de seguir. A ordem começa
pelo módulo de maior valor e menor superfície:

- [x] `20260101000035_rbac_helper_financeiro.sql` — helper `apply_rbac_policies` + `financial_entries`.
- [x] `20260101000036_rbac_rls_dominio.sql` — `clients`, `client_contacts`, `client_comments`, `crm_items`, `crm_item_comments`, `crm_item_column_history`, `legal_processes`, `legal_process_movements`, `legal_process_parties`, `documents` + trava nas `leads*` mortas.
- [x] `20260101000037_rbac_rls_operacional.sql` — `events`, `event_assignees`, `event_types`, `tasks`, `task_comments`, `task_checklist_items`, `activities`, `workflows`, `workflow_columns`, `schema_fixes`.
- [x] `20260101000038_rbac_rls_storage.sql` — bucket `attachments`: select/insert/delete espelhando `documentos:view/create/delete`.
- [x] `FinanceiroResumo` do Dashboard condicionado a `financeiro:view` (nota ¹ da matriz), com o grid caindo para 2 colunas quando some.

**`apply_rbac_policies` — desvio deliberado do plano.** Eram ~20 tabelas × 4 comandos = ~80
policies. Escritas à mão, 400 linhas onde um `financeiro` no lugar de `documentos` passaria
na revisão e apareceria em produção como "sumiu tudo". O helper reduz cada tabela a uma
linha de mapeamento conferível de relance, pula tabela inexistente com `raise notice` em vez
de abortar, e é re-executável. Fica permanente: é o que impede o próximo módulo de nascer
com `auth_full` (risco #8).

Três tipos de tabela, três tratamentos:
- **Domínio** (`clients`, `crm_items`, …) → recurso próprio, quatro ações.
- **Sub-entidade** (contatos, comentários, partes, checklist) → herda o recurso do pai. Comentar/anexar exige `:update` do pai, não `:create` — comentar num cliente é intervir no cliente, e é o que deixa `finance` (que tem `clientes:update` sem `clientes:create`) participar.
- **Apoio** (`activities`, `event_types`, `workflows`, `workflow_columns`, `schema_fixes`) → leitura para qualquer membro ativo, porque toda tela depende delas para resolver rótulo/cor/etapa; escrita só `configuracoes:manage`.

**Cuidado operacional**: RLS negando não devolve erro — devolve **lista vazia** ou
`0 rows updated`. Uma policy errada aqui parece "sumiu tudo", não "deu erro". Por isso a
verificação é tela a tela, com uma conta de cada perfil, e não só `psql`.

**Verificação**: `supabase/tests/rls_matrix.sql` — assume cada um dos quatro perfis dentro de
uma transação com `rollback` e conta as linhas visíveis por tabela. Esperado: `paralegal = 0`
em `financial_entries`, todo o resto igual ao total.

As tabelas mortas `leads`, `lead_stages`, `lead_movements`, `lead_comments` foram **trancadas**
(policies removidas, nenhuma criada) em vez de deixadas com `auth_full`. Continuam com os
dados intactos; a Fase 5 as remove.

**Bug pré-existente encontrado aqui**: o webhook do BuscaProcessos
(`src/app/api/webhooks/buscaprocessos/route.ts`) usa o client de sessão sem sessão nenhuma —
chega ao PostgREST como `anon`, então o `auth_full` antigo (`auth.role() = 'authenticated'`)
já o barrava. O `select` devolve vazio e sai por `case_not_found`, e o erro do `insert` é
ignorado. Não é regressão desta fase; o conserto é o client de service_role, na Fase 4.

### Fase 4 — Gestão de usuários de verdade (2,5 dias)

Substitui o mock `ADVOGADOS` na aba "Usuários" de Configurações.

- [x] `src/app/api/admin/users/route.ts` — `GET` lista (junta `profiles` com `auth.users` para e-mail e status do convite); `POST` convida e, **na sequência**, grava `role` e `is_active = true` com a service_role.
- [x] `src/app/api/admin/users/[id]/route.ts` — `PATCH` troca perfil / ativa / desativa, com guarda contra rebaixar ou desativar o **último admin ativo** (risco #5). `DELETE` responde 405 explicando por quê.
- [x] `src/lib/supabase/admin.ts` — client de service_role, com guarda de runtime contra import no browser e `hasServiceRoleKey()` para as rotas responderem 503 em vez de estourar.
- [x] `src/lib/auth/requireAdminApi.ts` — porteiro comum: sessão → `is_admin()` no banco → só então a service_role. 401/403 conforme a convenção do projeto.
- [x] `src/schemas/user.schema.ts` — Zod na entrada das duas rotas.
- [x] `src/app/(auth)/definir-senha/` + `next` no `/api/auth/callback` (só caminhos relativos, senão o callback vira open redirect).
- [x] `UsersManager.tsx` + `useUsers`/`useUserMutations` — listar, convidar, trocar perfil, ativar/desativar.
- [x] `.env.example` documenta `SUPABASE_SERVICE_ROLE_KEY` (nome, sem valor).
- [ ] **Configurar no painel do Supabase**: template de e-mail de convite em pt-BR e `/api/auth/callback` na lista de redirect URLs permitidas. Só você pode fazer.
- [ ] **Reenviar convite — não implementado.** O comportamento de `inviteUserByEmail` sobre uma conta já convidada e não confirmada não está claro na doc, e não dá para testar daqui sem disparar e-mail real. A tela marca o convite como `pendente`; reenviar, por ora, é pelo painel do Supabase.

**Bug pré-existente corrigido junto**: o webhook do BuscaProcessos passou a usar a service_role. Com o client de sessão ele chegava como `anon` e nunca gravou uma movimentação sequer — falha silenciosa, porque o erro do `insert` era ignorado e o `select` vazio saía por `case_not_found`. A autorização dele é o HMAC, não um perfil.

**Verificação**: `pnpm build` passa; `grep -r "service_role" .next/static/` vem vazio (risco #3). O fluxo de convite ponta a ponta depende do template e da redirect URL acima, e de um e-mail real — não foi exercitado.

`is_active = false` é barrado por `public.can()`, que filtra por `is_active` — não precisou de checagem separada no `proxy.ts`. A pessoa cai em `/sem-acesso`, que explica que a conta foi desativada.

### Fase 5 — Auditoria, limpeza e verificação final (1,5 dia)

- [x] Auditoria das ações de administração no feed: `20260101000039_activities_user_entity.sql` (o CHECK fechado de `entity_type` passa a aceitar `'user'`) + `src/lib/auth/recordAdminActivity.ts`, chamado pelas duas rotas. Best-effort, como todo `recordActivity`. `activities` é append-only pela migration 37 — sem policy de update nem delete —, que é o que torna essas linhas utilizáveis como auditoria.
- [x] `supabase/tests/rls_matrix.sql` — assume cada um dos quatro perfis dentro de uma transação com `rollback` e conta as linhas visíveis por tabela.
- [x] Mock `ADVOGADOS` (e a interface `Advogado`) removidos de `src/data/mock.ts`.
- [x] `docs/ROADMAP-MODULOS.md` (princípio transversal #5 e o cabeçalho "não mexe em") e `supabase/README.md` atualizados com o padrão `apply_rbac_policies`.
- [ ] **Tabelas `leads*` — NÃO removidas, de propósito.** O plano previa dropá-las. Ao conferir, nenhuma migration jamais copiou dados de `leads` para `cases`/`crm_items` — o rename foi de modelo, não de dados. Então elas podem conter registros históricos que nunca foram migrados, e `drop table` os destruiria. Ficaram **trancadas** pela migration 36 (policies removidas, nenhuma criada): inacessíveis pela API, intactas no banco. Antes de dropar, confira que estão vazias:
  ```sql
  select 'leads' t, count(*) from public.leads
  union all select 'lead_stages',    count(*) from public.lead_stages
  union all select 'lead_movements', count(*) from public.lead_movements
  union all select 'lead_comments',  count(*) from public.lead_comments;
  ```
- [ ] **Passada final**: 4 contas de teste, uma por perfil, percorrendo os 8 módulos. Depende do fluxo de convite funcionando (template + redirect URL no painel).

---

## 6. Esforço

| Fase | Dias |
|---|---|
| 0 — Preparação | 0,5 |
| 1 — Fundação + blindagem de `profiles` | 1,5 |
| 2 — Camada de permissões no front | 1,5 |
| 3 — RLS por módulo | 3,0 |
| 4 — Gestão de usuários + convite | 2,5 |
| 5 — Auditoria e verificação | 1,5 |
| **Total** | **10,5 dias úteis** |

Dependências: 0 → 1 → 3 (o RLS depende das funções e do seed de admin). A Fase 2 pode
correr em paralelo à 3 e a Fase 4 depende só da 1.

---

## 7. Como verificar

- **Por migration**: `supabase db advisors` antes de fechar a migration definitiva.
- **Por módulo (Fase 3)**: com uma conta de cada perfil, abrir a tela e tentar ler, criar, editar e apagar. O sintoma de policy errada é lista vazia, não erro.
- **Prova de que a UI não é a barreira**: logado como `paralegal`, chamar `supabase.from('financial_entries').select('*')` pelo console do browser a partir de qualquer tela e confirmar que volta vazio. Se voltar dado, a RLS não está fechada — independentemente do menu escondido.
- **Escalada de privilégio**: como `attorney`, tentar `update profiles set role='admin'` e confirmar rejeição pelo trigger.
- **Bundle**: confirmar que `SUPABASE_SERVICE_ROLE_KEY` não aparece em nenhum chunk client — `grep -r "service_role" .next/static/` deve vir vazio após o build.

---

## 8. Riscos

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| 1 | Escalada de privilégio via `update` no próprio `profiles` (**existe hoje**) | Alto | Trigger na Fase 1, antes de qualquer permissão passar a valer |
| 2 | Policy errada some com dados sem gerar erro | Alto | Uma migration por bloco + verificação tela a tela com conta de cada perfil |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` vazar para o bundle | Crítico | Sem prefixo `NEXT_PUBLIC_`, import isolado em `src/lib/supabase/admin.ts`, grep no `.next/static` |
| 4 | Rota admin confiando no `role` vindo do body | Alto | Checagem de `is_admin()` no banco em toda rota, antes de tocar no client de service role |
| 5 | Ninguém vira admin no seed → escritório trancado fora da gestão | Alto | Seed explícito na Fase 1 + verificação imediata |
| 6 | Performance de RLS com `can()` por linha | Médio | `(select public.can(...))` para forçar InitPlan; caminho de saída documentado para JWT claim |
| 7 | Perfil trocado sem efeito imediato | Médio | Já endereçado pela escolha da opção (A) no §4.1 |
| 8 | Próximo módulo nascer com `auth_full` | Médio | Atualizar `docs/ROADMAP-MODULOS.md` #5 e `supabase/README.md` na Fase 5 |
| 9 | Auto-cadastro pela chave `anon` cria conta no escritório | Crítico | Desligar sign-up no painel (Fase 0) **e** contas novas nascendo inativas (Fase 1) |

---

## 9. Fora de escopo (decisão explícita)

- **Multi-tenant / multi-escritório** — segue valendo a decisão de `docs/PLANEJAMENTO.md`. Como este plano concentra toda a autorização em `can()` e nas policies padronizadas, um eventual `org_id` no futuro vira uma condição a mais nas mesmas quatro policies por tabela, não uma reescrita.
- **Escopo por dono do registro** ("cada advogado só vê o que é seu") — decisão 2 deste documento. As colunas `assigned_to`/`created_by` já existem, então se a regra mudar é uma cláusula adicional nas policies de `select`, não um schema novo.
- **2FA / MFA, SSO, política de senha** — ciclo próprio.
- **Permissões por usuário fora do perfil** (overrides individuais) — a tabela `role_permissions` já comporta virar `user_permissions` depois, sem migração de dados.
- **Testes automatizados** — mantido fora conforme o roadmap; o `rls_matrix.sql` da Fase 5 cobre o essencial.
