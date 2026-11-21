# E-mails para clientes — plano

> **Status:** planejado em 21/11/2026 e **revisado no mesmo dia contra a `main`
> em `52ab3ca` (PR #80)**. **PRs 1, 2 e 3 implementados** (ver "Como ficou");
> migrations 95 e 96 ainda não aplicadas. PR 4 por fazer.
> **Branches:** PR 1 em `feat/emails-clientes`, criada da `main` em `52ab3ca`;
> PR 2 em `feat/emails-resumo-diario`, empilhada na do PR 1; PR 3 em
> `feat/emails-cobranca`, empilhada na do PR 2. As migrations 72–75
> (movimentações) que a primeira versão esperava já estão na `main`.

O escritório passa a falar com o cliente por e-mail, a partir do domínio
`cordeiropessigato.com.br`: um resumo diário do que andou nos processos, o link
do portal, cobranças e mensagens escritas pela equipe. Tudo registrado, tudo
com remetente verificado.

## Decisões de negócio (tomadas com o Leonardo, 21/11/2026)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Como a atualização de processo chega | **Resumo diário automático.** Um e-mail por cliente no fim do dia, só se houve ato relevante e visível no portal. Nada de e-mail por ato, nada de fila de aprovação. |
| 2 | Quanto do ato vai no e-mail | **Resumo + link do portal.** Processo, data e tipo do ato. O texto do tribunal fica só no portal, atrás da confirmação de CPF/CNPJ. |
| 3 | Quem recebe no primeiro dia | **Ninguém até o escritório ativar**, cliente a cliente (com ativação em lote na lista). Sem disparo-surpresa para a base inteira. |
| 4 | O que entra na v1 | Resumo de processos, **link do portal por e-mail**, **cobrança** (link, lembrete, confirmação) e **mensagem avulsa**. Lembrete de audiência fica fora. |

A decisão 1 segue o mesmo raciocínio do portal (`docs/portal-cliente.md`):
uma fila que depende de alguém aprovar item por item toda semana não roda. O
controle do escritório continua sendo o botão **Visível / Oculto do cliente**
que já existe — o que está oculto do portal não entra no e-mail.

A decisão 2 vale também para processo em segredo de justiça: o e-mail sai da
barreira do CPF (pode ser encaminhado, fica em caixa de terceiros), então ele
diz *que* algo aconteceu, não *o quê* em detalhe.

## O que mudou no projeto desde a primeira versão (revisão de 21/11/2026)

Quinze PRs entraram na `main` entre o plano e a revisão (#45 a #80). O que
cada um muda aqui:

| Mudança na `main` | Efeito no plano |
|---|---|
| **Cron da Vercel já existe** — `vercel.json` com `/api/cron/diario` às 7h, protegido por `CRON_SECRET` (`docs/assistente-claude.md`, fase 5) | `CRON_SECRET` deixa de ser variável nova. O resumo ganha **uma segunda entrada** no `vercel.json`, e a conferência do segredo sai da rota do diário para um helper comum |
| **Pessoas** — `clients` guarda também quem não é cliente; `is_client` decide (migration 78, `docs/pessoas.md`) | Todo e-mail deste plano é **só para `is_client = true`**. A ficha de pessoa não ganha aba nem botão de e-mail. A rota do portal já recusa quem não é cliente (409) |
| **Audiências** — a data da audiência mora em `events.start_at`, ligada pela ficha `hearings` (migrations 76–77, `docs/audiencias.md`, "Fonte única da data") | A data no resumo sai da **ficha + evento**, não de `legal_process_movements.hearing_at`: a ficha acompanha remarcação e correção manual, a coluna da movimentação não |
| **Portal com perguntas fixas de IA** — "O que aconteceu por último?", "O que isso significa?"… geradas por mudança de dados, revisáveis pelo escritório (migration 84) | O e-mail **aponta** para o "Tirar dúvidas" do portal e **não copia** a resposta da IA (ver "O resumo diário") |
| **Portal mostra o contato do escritório** (`office_settings`: nome, telefone, e-mail) | O rodapé do e-mail usa os mesmos campos — o cliente vê o mesmo contato nos dois lugares |
| **`notifications.recipient_id`** — aviso para uma pessoa só (migration 85) | E-mail **manual** recusado avisa só quem enviou; automático recusado avisa todos com o recurso |
| **Lista de Clientes paginada no servidor**, sem seleção de linhas (migration 91, `docs/paginacao.md`) | A "ação em massa" vira **"Ativar para os N do filtro"**, resolvida no servidor, em vez de marcar linha por linha |
| **Mensagem pronta de cobrança para WhatsApp** — `buildPaymentMessage` em `src/features/financeiro/utils/paymentLinkMessage.ts`, usada por `PaymentLinkSection.tsx` | O e-mail de link de pagamento usa o mesmo texto-base e entra ao lado do botão do WhatsApp |
| **Configurações em abas** (`ConfiguracoesContent.tsx`: Pagamentos, Assinatura, Assistente IA…) | O card de e-mail vira a aba **E-mail** |
| **Chaves de IA no banco, cifradas** (`docs/ia-configuracoes.md`, D1) — mas a D4Sign continua no ambiente (`D4SIGN_*`) | E-mail segue o modelo da **D4Sign**: chave no ambiente. Ver "Credenciais" |
| Migrations 76 a 94 ocupadas | As deste plano passam a ser **95** e **96** |

Sem efeito: a classificação das movimentações (`category`, `received_via`,
`hidden_from_client`) não mudou desde a 75; `getPortalProcesses` continua com
o mesmo vínculo (`crm_items.client_id` + `wf-processos`); `confirmPayment`,
`payment_charges` e a regra de e-mail de `customer.ts` estão iguais; o
`openPortalToken` (`src/lib/clientPortal/vault.ts`) continua sendo o caminho
para remontar o link do cliente — agora sobre `src/lib/crypto/secretVault.ts`.

## Decisões técnicas

### Provedor: Resend, via API HTTP

Já era a escolha registrada no §9, modo B, de `docs/PLANEJAMENTO-MULTIUSUARIO.md`
para o SMTP do Supabase. Um provedor só para os dois usos: o e-mail do cliente
sai do app pela API; o convite e a recuperação de senha da equipe saem do
Supabase pelo SMTP do mesmo Resend.

Limites que importam (docs do Resend, conferidos em 21/11/2026):

- Plano gratuito: **100 e-mails/dia e 3.000/mês**. Ao estourar, o envio
  **pausa** (não cobra). Plano pago não tem teto diário.
- API: **10 requisições/s por conta**, em qualquer plano. O resumo manda um
  por vez (ver "Como ficou o PR 2"), bem abaixo disso.

O gratuito serve para começar. Quando os lembretes de cobrança entrarem, um dia
de vencimentos concentrados mais o resumo pode passar de 100: aí é plano pago.

Templates em **React Email** (`@react-email/components`): é o par natural do
Resend, gera o HTML de tabela que Outlook e Gmail exigem e permite **ver o
e-mail sem login** (`email dev`) — o único jeito de verificar visualmente neste
projeto sem uma conta (ver memória "verificação exige login").

### Credenciais: no ambiente, como a D4Sign

A IA foi para o banco (`docs/ia-configuracoes.md`, D1) porque provedor, modelo
e teto mudam com frequência e alguém do escritório precisa ver o gasto. A chave
do Resend é configurada uma vez e não tem nada para ajustar no dia a dia — o
mesmo caso da D4Sign, que ficou no ambiente. Guardar no banco custaria a
cifragem, o teste antes de salvar e o histórico, sem ganho prático.

A aba **E-mail** em Configurações mostra a situação (chave presente, domínio
verificado no Resend, remetente) e tem **Enviar e-mail de teste**, mas não
edita credencial.

### Remetente

| | Valor |
|---|---|
| Domínio verificado no Resend | `avisos.cordeiropessigato.com.br` (subdomínio) |
| From | `<nome do escritório> <escritorio@avisos.cordeiropessigato.com.br>` |
| Reply-To | o e-mail cadastrado em **Configurações → Geral → Escritório** (`office_settings.email`) — o mesmo que o portal já mostra em "Falar com o escritório" |
| Nome exibido | `office_settings.name` |

**Subdomínio**, como o próprio Resend recomenda: a reputação de envio
automático fica separada da caixa de e-mail humana do domínio raiz, e os
registros de DNS do Resend não encostam no MX/SPF que o escritório já usa (se
usa Google Workspace, Microsoft 365, Locaweb…).

O cliente que **responde** cai na caixa real do escritório (Reply-To). A
resposta não entra no sistema — e-mail de entrada é outro projeto.

### Rastreamento: entrega sim, abertura e clique não

- **Webhook do Resend** (`/api/webhooks/resend`, assinatura Svix conferida):
  `delivered`, `bounced`, `complained`, `delivery_delayed` atualizam o status
  da mensagem. Bounce e marcação de spam entram em `email_suppressions` e geram
  aviso no sino — só para quem enviou, se foi manual (`recipient_id`); para
  todos com o recurso, se foi automático.
- **Open/click tracking desligados.** Click tracking reescreve os links por um
  redirecionador do Resend — e o link do portal leva o token do cliente.
  Pixel de abertura é coleta de dado pessoal sem necessidade (LGPD).

### Agendamento: segunda entrada no cron da Vercel

O `vercel.json` já tem `/api/cron/diario` (7h de Brasília: lotes de IA e
briefing). O e-mail ganha a sua:

```json
{ "path": "/api/cron/emails", "schedule": "0 21 * * *" }
```

**18h de Brasília**, como combinado ("no fim do dia"). Uma rota por job, e não
um passo a mais no diário: horários diferentes, e uma falha no envio de e-mail
não pode derrubar a coleta dos lotes de IA (nem o contrário). No plano Hobby a
Vercel dispara em algum momento dentro da hora — aceitável para resumo diário.

A conferência de `Authorization: Bearer <CRON_SECRET>` hoje está dentro de
`src/app/api/cron/diario/route.ts` (`authorized()`); sai para
`src/lib/cron/authorize.ts` e as duas rotas passam a usá-la. Mesma regra: sem
`CRON_SECRET`, recusa tudo.

Por que não `pg_cron` (que já agenda os avisos de contrato, migration 71):
quem envia é o Next.js, então o `pg_cron` teria de chamar a rota por `pg_net`,
com URL e segredo guardados no Vault. O cron da Vercel já está montado e
protegido.

### Envio honesto e seguro

- **Sem `RESEND_API_KEY`, nada finge funcionar.** A rota responde "e-mail não
  configurado" e a tela desabilita os botões — o mesmo princípio de
  `publicAppBaseUrl()` em `src/lib/appUrl.ts`.
- **`EMAIL_SANDBOX_TO`**: quando definida, **todo** e-mail vai para esse
  endereço, com o destinatário original no assunto. Obrigatória em dev e
  preview; vazia só em produção. É o que impede um teste local de mandar
  e-mail para cliente de verdade.
- **Idempotência em duas camadas**: `dedupe_key` única na tabela (o cron que
  dispara duas vezes não manda dois resumos) e o `id` da mensagem como
  `Idempotency-Key` na chamada ao Resend (o retry depois de timeout não
  duplica).
- **Registro antes de enviar**: a linha nasce `queued`, vira `sent` com o id
  do provedor ou `failed` com o erro. Mesmo padrão de `payment_charges`
  (nasce `creating` antes da chamada à InfinitePay).
- **Só cliente.** Toda rota de envio confere `clients.is_client`; pessoa
  cadastrada (parte contrária, testemunha) nunca recebe e-mail do sistema.

## Modelo de dados

Migration **95** (PR 1) e **96** (PR 2). Escrita sempre pela `service_role`
dentro das rotas, como `notifications` e `payment_charges` — sem policy de
insert/update para `authenticated`.

```sql
-- 95 — email_messages: fila, registro e auditoria do que foi dito ao cliente
create table public.email_messages (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in (
                        'process_digest', 'portal_link', 'payment_link',
                        'payment_reminder', 'payment_confirmed', 'custom_message',
                        'test')),
  -- Recurso do RBAC exigido para ver a linha (precedente: notifications, migration 47).
  -- 'clientes' para resumo/portal/avulsa; 'financeiro' para cobrança.
  resource            text not null,
  client_id           uuid references public.clients(id) on delete set null,
  payment_charge_id   uuid references public.payment_charges(id) on delete set null,
  to_address          text not null,
  subject             text not null,
  html                text not null,   -- exatamente o que saiu: é a prova numa reclamação
  text_body           text not null,
  status              text not null default 'queued' check (status in (
                        'queued', 'sent', 'delivered', 'delayed',
                        'bounced', 'complained', 'failed', 'suppressed')),
  provider_message_id text unique,
  error               text,
  dedupe_key          text unique,     -- 'process_digest:<client>:<AAAA-MM-DD>' etc.
  sent_by             uuid references public.profiles(id),  -- null = automático
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  delivered_at        timestamptz,
  updated_at          timestamptz not null default now()
);

-- Endereço que recusou ou marcou spam não recebe mais nada, de nenhum tipo.
create table public.email_suppressions (
  address            text primary key,   -- sempre lower(trim())
  reason             text not null check (reason in ('bounce', 'complaint')),
  source_message_id  uuid references public.email_messages(id) on delete set null,
  created_at         timestamptz not null default now()
);
```

```sql
-- 96 — resumo diário
alter table public.clients
  add column email_updates_enabled_at timestamptz;  -- null = desligado

-- Quais atos cada resumo levou. É o que define "ainda não enviado".
create table public.email_message_movements (
  email_message_id uuid not null references public.email_messages(id) on delete cascade,
  movement_id      uuid not null references public.legal_process_movements(id) on delete cascade,
  primary key (email_message_id, movement_id)
);
```

`email_updates_enabled_at` é data e não booleano de propósito: ligar o resumo
de um cliente com 200 movimentações antigas **não** pode mandar as 200. Só
entram atos que chegaram depois dessa data.

Ligar só é aceito com `is_client = true` — conferido na rota, como o portal.
O `guard_client_since` da migration 78 já impede "Mover para Pessoas" de quem
tem link do portal ativo, e o resumo exige link ativo; então um cliente com o
resumo ligado não vira pessoa sem antes revogar o link, o que pausa o resumo.

## O resumo diário, em detalhe

**Quem recebe** — cliente com:

1. `is_client = true`;
2. `email_updates_enabled_at` preenchido;
3. e-mail válido, escolhido pela mesma regra de `buildCustomer`
   (`src/lib/infinitepay/customer.ts`: o campo do cadastro primeiro, depois os
   contatos, o principal à frente) — `candidates()` é extraída para um helper
   comum;
4. endereço fora de `email_suppressions`;
5. **link do portal ativo e recuperável** (`client_portal_links` com
   `revoked_at is null` e `token_sealed` preenchido, aberto por
   `openPortalToken`). O botão do e-mail é o link do portal; sem ele, o e-mail
   não tem para onde mandar. Revogar o link **pausa** o resumo, e a tela do
   cliente diz isso.

**Quais atos** — de processos do cliente pelo mesmo vínculo do portal
(`crm_items.client_id` + `workflow_id = 'wf-processos'`, `getPortalProcesses`),
e só os que:

- `hidden_from_client = false` — o que o portal mostra, nada além;
- `received_via in ('webhook', 'manual')` — o `sync` importa o histórico
  inteiro ao cadastrar o processo (migration 68), e isso não é novidade;
- `category in ('decisao', 'audiencia', 'recurso', 'encerramento')` — o que
  muda a situação do cliente. Juntada, expediente, petição e intimação crua
  ficam de fora (são o grosso das ~140/mês e só geram ruído). A lista é uma
  constante, fácil de ajustar;
- `created_at >= email_updates_enabled_at`;
- não estão em `email_message_movements` de uma mensagem `sent`/`delivered`;
- **chegaram há pelo menos 2 horas.** É a carência para a equipe ocultar um
  ato antes de ele virar e-mail. O que chega depois das 16h vai no dia
  seguinte.

Processo arquivado continua no portal (`getPortalProcesses` não filtra
`status`), então ato novo nele entra no resumo — desarquivamento é notícia.

**O que o e-mail diz**, por processo: número CNJ, nome do caso, e cada ato com
data e tipo ("Decisão", "Recurso", "Processo encerrado").

Para **audiência**, a data vem da ficha, não do texto: se há `hearings` com
`movement_id` igual ao ato, `status = 'designada'` e evento ligado, o e-mail
diz "Audiência de Conciliação marcada para 13/10/2026 às 14:00", com o rótulo
de `hearing_kinds` e o horário de `events.start_at`. É a fonte única da data
(`docs/audiencias.md`): se a equipe corrigiu ou a audiência foi remarcada, o
e-mail sai certo. Sem ficha designada com data, o ato aparece só como
"Audiência". Modalidade, endereço e link da sala **não** vão no e-mail —
continuam com a equipe (decisão 2).

Botão **Ver andamento completo** → portal. Quando as perguntas do portal
estão ligadas (`isPortalAnswersEnabled`), uma linha abaixo: "No portal, em
*Tirar dúvidas*, você encontra a explicação em linguagem simples."

**Por que a resposta da IA não vai no e-mail**, embora já exista: além da
decisão 2, ela é viva — o escritório corrige ou oculta cada pergunta, e ela é
refeita quando o recorte visível muda (`source_hash`, migration 84). Copiada
no e-mail, ficaria congelada na versão que o escritório pode ter acabado de
corrigir. Efeito no custo: as respostas são guardadas por processo e por
mudança de dados, então o clique vindo do e-mail não multiplica chamadas — no
máximo dispara a geração que o processo já teria (~R$ 0,14, medido na fase 3
do Assistente).

Rodapé: nome, telefone e e-mail do escritório (os mesmos de "Falar com o
escritório" no portal) e **Não quero mais receber estes resumos**.

**Descadastro**: link e cabeçalho `List-Unsubscribe` + `List-Unsubscribe-Post`
(RFC 8058, um clique). O token é um HMAC do `client_id` com chave derivada do
segredo do portal (`derivePortalKeyBytes` em `src/lib/clientPortal/secret.ts`,
com rótulo próprio). Descadastrar zera `email_updates_enabled_at` e grava
`email_updates_opted_out_at` (não vai para `activities`: `actor_id` é
obrigatório lá, e quem age é o cliente). Vale só para o resumo — cobrança e
mensagem avulsa continuam.

## Cobrança

- **Link de pagamento por e-mail**: em `PaymentLinkSection.tsx`, ao lado do
  botão do WhatsApp, **E-mail** (habilitado quando há e-mail válido). Leva o
  mesmo o quê/quanto da mensagem do WhatsApp, mais o vencimento. Exige
  `financeiro:create`, como a rota do link.
- **Lembrete**: o cron manda para cobranças `open` com lançamento pendente,
  uma vez **quando faltam de 1 a 3 dias** para o vencimento e outra **quando
  venceu há 1 a 7 dias** (janelas, para um dia de cron perdido não perder o
  lembrete; a `dedupe_key` garante um de cada).
- **Confirmação**: quando `confirmPayment` (`src/lib/infinitepay/confirm.ts`)
  dá baixa no lançamento, sai um e-mail de recebido, com o comprovante.

**Regra única para os automáticos de cobrança**: lembrete e confirmação só
existem para cobrança cujo link **foi enviado por e-mail**. Quem mandou o link
pelo WhatsApp não vê o cliente receber e-mail de cobrança do nada — é a mesma
ideia da decisão 3, aplicada por cobrança.

## Mensagem avulsa

Na ficha do cliente, **Enviar e-mail**: assunto e texto (quebras de linha
preservadas, sem HTML do usuário — escapado). Sai no layout do escritório com
assinatura de quem enviou (`profiles.full_name` + `profiles.oab_number`).
Exige `clientes:update`. Anexo fica para depois.

## Telas

| Onde | O quê |
|---|---|
| Ficha do cliente → cabeçalho (`actions` do `CadastroHeader`, montado em `ClienteDetailPage`) | **Enviar e-mail** (avulsa) ao lado do `PortalLinkButton` — só na ficha de cliente; a de pessoa (`PessoaDetailPage`) não recebe |
| `PortalLinkDialog` | **Enviar por e-mail** |
| Ficha do cliente → aba **E-mails**, no topo | Chave **Resumo diário dos processos**, com o motivo quando não dá para ligar (sem e-mail, sem link do portal, endereço bloqueado). Na aba E-mails, e não no `CadastroTab`, porque este é o mesmo da ficha de pessoa |
| Ficha do cliente → aba **E-mails** | Histórico: data, tipo, assunto, status (enviado, entregue, recusado), quem enviou; abre o e-mail como saiu |
| Lista de Clientes | **Ativar resumo por e-mail** no topo: aplica ao filtro atual, no servidor. O diálogo mostra antes "N clientes do filtro · M cumprem os requisitos · K já estavam ligados" e só liga os M |
| Financeiro → `PaymentLinkSection` | **E-mail**, ao lado do WhatsApp, e o que já saiu desta cobrança (link, lembretes, confirmação) com o status |
| Configurações → aba **E-mail** | Situação (chave, domínio verificado, remetente), Reply-To vindo do cadastro do escritório, **Enviar e-mail de teste** para mim |
| Sino | Aviso de e-mail recusado / marcado como spam |

A lista de Clientes não tem seleção de linhas desde a paginação no servidor
(`docs/paginacao.md`, fase 4). Construir seleção só para isto seria mais tela
do que o pedido; o filtro (busca, área) já recorta o grupo que o escritório
quer ligar.

## Arquivos (previstos)

```
src/lib/cron/authorize.ts        — conferência do CRON_SECRET (sai de cron/diario)
src/lib/email/
  client.ts          — instância do Resend, fail-closed sem chave
  send.ts            — registra → envia → atualiza; sandbox; supressão; idempotência
  recipient.ts       — escolhe o e-mail do cliente (regra extraída de customer.ts)
  unsubscribe.ts     — token HMAC do descadastro
  digest.ts          — monta os resumos do dia
  billing.ts         — lembretes e confirmação de cobrança
src/emails/          — templates React Email (Layout, ProcessDigest, PortalLink,
                       PaymentLink, PaymentReminder, PaymentConfirmed, CustomMessage)
src/app/api/cron/emails/route.ts
src/app/api/webhooks/resend/route.ts
src/app/api/clientes/[id]/emails/route.ts           — histórico + envio avulso
src/app/api/clientes/[id]/portal-link/email/route.ts
src/app/api/clientes/resumo-email/route.ts          — ativação pelo filtro
src/app/api/email/descadastrar/route.ts + página pública de confirmação
src/features/emails/                                 — aba, diálogos, hooks
src/features/configuracoes/components/EmailSettingsTab.tsx
vercel.json                                          — segunda entrada em crons
supabase/migrations/20260101000095_email_messages.sql
supabase/migrations/20260101000096_client_email_digest.sql
```

## Variáveis de ambiente novas

| Variável | Onde | Para quê |
|---|---|---|
| `RESEND_API_KEY` | Vercel + `.env` | envio pela API |
| `EMAIL_FROM` | Vercel + `.env` | endereço do remetente (`escritorio@avisos.cordeiropessigato.com.br`) |
| `RESEND_WEBHOOK_SECRET` | Vercel | conferir a assinatura do webhook |
| `EMAIL_SANDBOX_TO` | `.env` e Preview — **nunca** em Production | desviar todo envio para um endereço de teste |

`CRON_SECRET` já existe (cron do diário) e serve às duas rotas. Nenhuma com
`NEXT_PUBLIC_`. Entram em `.env.example` sem valor.

## Entrega em PRs

1. **Fundação + link do portal por e-mail.** Dependências, `src/lib/email/`,
   migration 95, layout do e-mail, webhook do Resend, aba E-mail em
   Configurações com e-mail de teste, aba E-mails na ficha do cliente e o
   botão **Enviar por e-mail** no `PortalLinkDialog` — o menor fluxo de ponta
   a ponta. **Feito — ver "Como ficou o PR 1".**
2. **Resumo diário.** Migration 96, `digest.ts`, `/api/cron/emails` e a
   entrada no `vercel.json`, `src/lib/cron/authorize.ts`, descadastro, chave na
   ficha, ativação pelo filtro. **Feito — ver "Como ficou o PR 2".**
3. **Cobrança.** Envio do link, lembretes no cron, confirmação no
   `confirmPayment`. **Feito — ver "Como ficou o PR 3".**
4. **Mensagem avulsa.**

Verificação de cada PR: `npx tsc --noEmit`, `npx eslint src`, `npx next build`;
templates no preview do React Email; telas numa página temporária sob
`/acompanhar` com Supabase simulado, apagada antes do commit (o método de
Pessoas e do Assistente); e um envio real com `EMAIL_SANDBOX_TO` apontando para
um endereço do escritório. O percurso com login fica num roteiro para
conferência.

## Como ficou o PR 1 (21/11/2026)

Branch `feat/emails-clientes`. **Migration 95 não aplicada.**

| Peça | Onde | O que faz |
|---|---|---|
| Dependências | `package.json` | `resend@6.37.0`, `@react-email/components@1.0.12` e `@react-email/render@2.0.6` (a versão que o components fixa: uma cópia só do renderizador). Versões com três semanas ou mais de publicação |
| Banco | migration 95 | `email_messages` (CHECKs de tipo, recurso e status; `error` obrigatório em `failed`/`suppressed`; id do Resend obrigatório a partir de `sent`; `dedupe_key` única) e `email_suppressions`. Leitura por recurso com `(select can(...))`; escrita só da service_role; GRANTs explícitos |
| Configuração | `src/lib/email/config.ts` | Variáveis do ambiente, como a D4Sign. Fora da produção da Vercel (`VERCEL_ENV`), `EMAIL_SANDBOX_TO` é obrigatória; inválida conta como problema, não como ausente |
| Envio | `src/lib/email/send.ts` | Confere bloqueio → grava `queued` → chama o Resend com o id da linha como `Idempotency-Key` e como tag `advtool_id` → grava o desfecho **só se a linha ainda estiver `queued`** (o webhook pode ter chegado antes) |
| Identidade | `src/lib/email/office.ts` | Nome, e-mail (Reply-To), telefone, OAB e endereço de `office_settings`. Falha vira identidade vazia: o e-mail sai só com o endereço do remetente |
| Templates | `src/emails/` | `EmailLayout` (estilos inline, paleta Graphite em hexadecimal), `PortalLinkEmail`, `TestEmail`. HTML e texto puro saem do mesmo elemento (`render.ts`) |
| Link por e-mail | `POST /api/clientes/[id]/portal-link/email` | `clientes:update`. Manda o link **ativo**, sem emitir outro — emitir revogaria o que o cliente talvez já tenha pelo WhatsApp. Recusa com 409: pessoa que não é cliente, sem e-mail válido, sem link ou link irrecuperável |
| Teste | `POST /api/email/teste` | `configuracoes:manage`. Vai sempre para o e-mail da conta de quem clicou, nunca para um endereço do corpo |
| Webhook | `POST /api/webhooks/resend`, `src/lib/email/webhook.ts` | Assinatura Svix pelo SDK. Acha a linha pelo id do Resend ou pela tag. Transição condicional: aviso fora de ordem ou repetido não desfaz nem repete nada. Bounce **permanente**, spam e bloqueio do Resend entram em `email_suppressions` — o endereço que recusou de fato, não o do cadastro. Aviso no sino: só para quem mandou, se foi manual. Registro em `webhook_events` com `provider = 'resend'` |
| Telas | `features/emails/`, `EmailSettingsTab`, `PortalLinkDialog`, `ClienteDetailPage` | Aba **E-mails** na ficha (histórico, status, abrir o e-mail como saiu num iframe `sandbox`); **Enviar por e-mail** no diálogo do link, com confirmação e o motivo à vista quando não dá; aba **E-mail** em Configurações (situação, modo de teste, avisos, assinatura, e-mail de teste, últimos 20 envios) |
| Regra comum | `src/utils/clientContacts.ts`, `getClientGreetingName` | A escolha do e-mail do cliente saiu de `customer.ts` (a InfinitePay usa a mesma) e a saudação, de `PaymentLinkSection` — a tela anuncia o mesmo endereço que a rota usa |

Decidido na implementação:

- **A cópia guardada não leva o token do portal.** `email_messages.html`
  ficaria com a URL em claro, e `docs/portal-cliente.md` garante que um
  vazamento só do banco não entrega link utilizável. O envio recebe
  `redactions`: o cliente recebe o link real; o banco guarda `••••<final>`, o
  mesmo final que o diálogo mostra. O resumo diário (PR 2) usa o mesmo
  caminho.
- **O webhook exige também `RESEND_API_KEY`**: o SDK só se instancia com a
  chave. Sem ela o app não mandou nada que um aviso pudesse atualizar.
- **`src/lib/cron/authorize.ts` foi para o PR 2**, junto da segunda rota que o
  usa — extrair com um consumidor só seria antecipar.
- `requestPublicOrigin` (`src/lib/appUrl.ts`): a origem do link passou a ser
  uma só para "copiar" e "enviar por e-mail".

Verificação:

- `tsc`, `eslint` (sem aviso nos arquivos tocados) e `next build`.
- Os dois templates renderizados numa página temporária sob `/acompanhar`
  (apagada antes do commit): com e sem cadastro do escritório, CPF e CNPJ, e a
  versão em texto puro conferida linha a linha. A lista do histórico com três
  status, a marca de teste e o motivo de recusa, no tema escuro.
- As duas rotas de envio respondem 401 sem sessão.
- Revisão (`/auto-review`) achou e corrigiu: o token em claro na cópia
  guardada, a corrida entre webhook e resposta do envio, o erro antigo
  sobrevivendo a uma confirmação e dois arquivos convertidos para CRLF.

Não verificado:

- **Nenhum envio real** — o `.env` não tem `RESEND_API_KEY` e o domínio ainda
  não existe no Resend.
- Nada contra o banco: a migration 95 não está aplicada. Sem ela, a aba
  E-mails diz que não carregou, e o envio para na conferência de bloqueios
  (`email_suppressions` não existe) — nada sai.
- O webhook com um aviso de verdade.
- O percurso com login (roteiro abaixo).

Roteiro de conferência, depois da migration e das variáveis (com
`EMAIL_SANDBOX_TO` apontando para um e-mail do escritório):

1. Configurações → E-mail: "Pronto para enviar", "Modo de teste", avisos de
   entrega e assinatura. **Enviar e-mail de teste** → chega na caixa de teste,
   e a linha aparece em "Últimos envios" como Enviado e, em segundos, Entregue.
2. Ficha de um cliente com e-mail e link ativo → Link do cliente → **Enviar
   por e-mail** → confirmar. O toast diz que foi para o endereço de teste; o
   e-mail chega com `[teste → <e-mail do cliente>]` no assunto, e o botão abre
   o portal.
3. Aba **E-mails** da mesma ficha: a linha com a marca "Teste"; abrir mostra o
   e-mail com o link mascarado (`••••<final>`).
4. Cliente sem e-mail: o botão aparece desabilitado com o motivo embaixo.

## Como ficou o PR 2 (21/11/2026)

Branch `feat/emails-resumo-diario`, empilhada na `feat/emails-clientes`.
**Migration 96 não aplicada** (e depende da 95).

| Peça | Onde | O que faz |
|---|---|---|
| Banco | migration 96 | `clients.email_updates_enabled_at` e `clients.email_updates_opted_out_at`, índice parcial para o cron; `email_message_movements` (e-mail × ato), leitura com `clientes:view`, escrita só da service_role |
| Regra de quem pode | `src/lib/email/digestEligibility.ts` | Uma regra só para a ficha, o lote e o cron, em lote (três consultas por fatia de 100): cliente, e-mail válido (`pickClientEmail`), endereço não bloqueado, link do portal ativo **e recuperável**, envio configurado |
| Seleção e envio | `src/lib/email/digest.ts` | `loadPendingProcesses` (os atos novos de cada cliente) e `runProcessDigest` (um e-mail por cliente com novidade). As regras são constantes no topo do arquivo |
| Template | `src/emails/ProcessDigestEmail.tsx` | Um bloco por processo (nome do caso, número), cada ato com dia e tipo; botão para o portal; dica do "Tirar dúvidas" quando as perguntas do portal estão ligadas; link de descadastro |
| Cron | `/api/cron/emails`, `vercel.json` (`0 21 * * *`), `src/lib/cron/authorize.ts` | 18h de Brasília. A conferência do `CRON_SECRET` saiu de `/api/cron/diario` para o helper, usado pelas duas rotas |
| Descadastro | `src/lib/email/unsubscribe.ts`, `POST /api/email/descadastrar`, página `/descadastrar` | Token HMAC do id (chave derivada do segredo do portal, rótulo próprio). A página só confere o token e pede confirmação; quem desliga é o POST — do botão ou do um-clique do Gmail/Outlook (`List-Unsubscribe` + `List-Unsubscribe-Post`, só com origem HTTPS). `/descadastrar` entrou nos prefixos públicos do proxy |
| Chave na ficha | `GET/PUT /api/clientes/[id]/resumo-email`, `DigestSubscriptionCard` (topo da aba E-mails) | Ligado desde quando e para onde; pausado e por quê; desligado pelo cliente e quando. Religar quem saiu pede confirmação e apaga a data do pedido |
| Ativação em lote | `POST /api/clientes/resumo-email`, `DigestBulkDialog`, botão **Resumo por e-mail** na lista de Clientes | O recorte da lista (busca + área) pela mesma `search_clients`, com a RLS de quem pede. Abre com a prévia (podem ser ligados, já recebem, pediram para sair, ficam de fora e por quê) e liga no clique. **Nunca religa quem pediu para sair** |
| Atividades | `client_email_digest_enabled` / `_disabled` | Quem ligou ou desligou, na ficha e no lote. O pedido do cliente fica na coluna, não em `activities` |

Decidido na implementação (diverge do plano acima, com o porquê):

- **Janela de 7 dias** (`DIGEST_MAX_AGE_DAYS`): ato mais velho não entra, mesmo
  nunca enviado. Protege de duas enxurradas — o cron parado por dias, e o
  cliente ligado antes de o envio estar configurado.
- **Um envio por vez**, e não o endpoint de lote do Resend: são poucas dezenas
  por dia, e cada envio precisa da própria linha, chave de idempotência e
  `dedupe_key`. Falha de um cliente não para os outros.
- **Ato ligado a resumo que falhou volta no dia seguinte**; ligado a resumo que
  saiu (inclusive recusado ou marcado como spam), não. "Já foi" é por cliente:
  o mesmo processo pode ser de dois.
- **Rodar duas vezes no mesmo dia não manda dois resumos** (`dedupe_key` por
  cliente e dia de Brasília); o ato que chegar entre as duas vai no dia
  seguinte.
- **A chave ficou na aba E-mails**, não no `CadastroTab` (compartilhado com a
  ficha de pessoa).
- **Pedido de saída em coluna** (`email_updates_opted_out_at`), não em
  `activities`: `actor_id` é obrigatório lá, e quem pede é o cliente.
- **Ativação em lote exige envio configurado** (503 sem ele); a chave da ficha
  mostra o mesmo motivo.
- O lote lê no máximo 1.000 clientes do recorte (`max_rows` do PostgREST) e
  avisa quando cortou.

Verificação:

- `tsc`, `eslint` (zero problemas nos arquivos tocados), `next build`, todos os
  arquivos em LF.
- **A seleção dos atos, com banco simulado em memória** (página temporária,
  apagada): dois clientes, três processos, onze atos e dois resumos
  anteriores. Bateu exatamente com o esperado — ato na carência fica para o
  dia seguinte; ato de 11 dias, petição, ato oculto, ato importado pelo `sync`
  e processo de outro workflow ficam fora; o cliente ligado às 10h não recebe
  o ato das 9h; o ato que já foi para A não volta, o que falhou volta; card
  duplicado vira um bloco; a audiência sai com tipo, data e hora da ficha.
- As contas de fuso: o dia da `dedupe_key` às 23h de Brasília (2h UTC do dia
  seguinte) continua sendo o dia de Brasília; a audiência às 17h UTC sai
  "às 14:00"; `movement_date` gravado como meia-noite UTC sai no dia certo.
- O e-mail renderizado e a versão em texto puro; o token de descadastro
  (válido passa, adulterado e de outro cliente não); a página `/descadastrar`
  sem login, com link válido (pede confirmação, não desliga ao abrir) e
  adulterado ("Link inválido"); os cinco estados da chave na ficha, com dados
  injetados no cache.
- As rotas novas sem sessão ou sem token: cron 401, descadastro 400, ficha e
  lote 401. Nenhuma chegou ao banco.

Não verificado:

- Nada contra o banco real: as migrations 95 e 96 não estão aplicadas.
- O cron de verdade na Vercel e um resumo real chegando numa caixa.
- O um-clique do Gmail/Outlook (exige origem HTTPS e um envio real).
- A prévia e a ativação em lote com dados reais.

Roteiro de conferência, depois das migrations e das variáveis (com
`EMAIL_SANDBOX_TO`):

1. Ficha de um cliente com e-mail e link do portal → aba E-mails → **Ligar**.
   A chave diz "Ligado desde hoje · vai para …".
2. Num processo desse cliente, adicionar à mão uma movimentação com texto que
   o classificador da migration 72 lê como decisão (ex.: "Decisão — defiro o
   pedido"); ela entra como `manual` e visível. Esperar 2 horas (a carência) e
   chamar o cron à mão:
   `curl -H "Authorization: Bearer $CRON_SECRET" <base>/api/cron/emails`.
   A resposta diz `sent: 1`; o e-mail chega na caixa de teste; a aba E-mails
   mostra o resumo, e abrir mostra o link do portal mascarado.
3. Chamar o cron de novo: `skipped.duplicate` — nada sai duas vezes.
4. No e-mail, "Não quero mais receber estes resumos" → confirmar. A ficha
   passa a dizer "Desligado pelo próprio cliente em …".
5. Lista de Clientes → **Resumo por e-mail**: a prévia conta esse cliente em
   "pediram para não receber", e ligar não o religa.

## Como ficou o PR 3 (21/11/2026)

Branch `feat/emails-cobranca`, empilhada na `feat/emails-resumo-diario`. **Sem
migration**: a 95 já tinha os tipos `payment_link`, `payment_reminder` e
`payment_confirmed` e a coluna `payment_charge_id`.

| Peça | Onde | O que faz |
|---|---|---|
| Regras e envio | `src/lib/email/billing.ts` | `sendPaymentLinkEmail` (manual), `sendPaymentConfirmationEmail` (nunca lança) e `runPaymentReminders` (cron). A regra "o link foi por e-mail" — um envio `payment_link` com status `sent`, `delivered` ou `delayed` — decide lembrete e confirmação |
| Templates | `src/emails/` | `ChargeSummary` (o quê, quanto, vencimento), `PaymentLinkEmail`, `PaymentReminderEmail` (antes e depois do vencimento, com "se já pagou, desconsidere"), `PaymentConfirmedEmail` (valor pago, data, método e comprovante). O botão de ação virou `EmailButton`, comum aos cinco templates |
| Envio do link | `POST /api/financeiro/cobrancas/[id]/email` | `financeiro:create`. Só link `open`, com cliente e e-mail válido. Reenviar é permitido |
| Confirmação | `confirmPayment` (`src/lib/infinitepay/confirm.ts`) | Depois da baixa, nas três entradas (webhook, retorno do cliente, reprocessamento): um ponto só. `dedupe_key` por transação — o webhook e o retorno chegando juntos mandam um e-mail |
| Lembretes | `/api/cron/emails` | Mesmo cron das 18h, depois do resumo, e independente dele: um falhar não impede o outro, e a resposta traz os dois |
| Datas | `src/lib/email/dates.ts` | Dia de Brasília, dia guardado, instante formatado e diferença em dias — o resumo e os lembretes contam do mesmo jeito |
| Tela | `ChargeEmailControl` no cartão do link em aberto | Botão **E-mail** (ou **Reenviar por e-mail**) com confirmação que diz o que liga (lembretes e confirmação), e as últimas três mensagens da cobrança com o status |
| Status do envio | `GET /api/email/status`, `useEmailConfigured` | Só o booleano, para telas fundas demais para recebê-lo do Server Component da página |

Decidido na implementação:

- **Confirmação só quando ESTA rodada deu a baixa.** É o que garante que o
  valor bateu e que o lançamento não estava pago. Pagamento que entra com
  alerta (valor diferente, lançamento já pago) fica para o escritório decidir,
  sem e-mail ao cliente.
- **A confirmação roda dentro do `confirmPayment`, aguardada**, e não em
  `after()`: o webhook já a chama de dentro de um `after()`, e a função não
  lança. No retorno do cliente, a página leva o tempo de um envio a mais.
- **Lembrete em janela** (1 a 3 dias antes; 1 a 7 depois), não em dia exato:
  um dia de cron perdido não perde o lembrete. O "antes" espera 24 h depois do
  envio do link — link e lembrete no mesmo dia é ruído. No dia do vencimento,
  nada.
- **Um lembrete de cada momento, para sempre** (`payment_reminder:<cobrança>:<momento>`):
  o que falhou não é tentado de novo. O resumo diário tenta no dia seguinte; o
  lembrete, não — perder um lembrete custa menos que mandar dois.
- **Para onde vai**: o e-mail ATUAL do cadastro (`pickClientEmail`), não o
  endereço para onde o link foi — o escritório pode ter corrigido o cadastro.

Verificação:

- `tsc`, `eslint` (zero problemas nos arquivos tocados), `next build`; fim de
  linha conferido pela comparação das duas estatísticas do diff (pegou
  `confirm.ts`, já corrigido).
- **A regra dos lembretes** (`reminderMoment`), em nove casos: 3 dias antes;
  1 dia antes com o link de 9 h (não) e de 25 h (sim); 4 dias antes (não); no
  dia (não); 1 e 7 dias depois (sim); 8 dias depois (não); virada de mês.
  Todos passaram.
- Os três templates novos e o do portal (que mudou com o `EmailButton`)
  renderizados, e as versões em texto puro conferidas.
- As rotas novas sem sessão: 401.

Não verificado:

- Nada contra o banco real nem envio real.
- A confirmação dentro de um pagamento de verdade (webhook ou retorno).
- A tela do cartão do link com login.

Roteiro de conferência, depois das migrations e das variáveis (com
`EMAIL_SANDBOX_TO`):

1. Financeiro → uma receita pendente de um cliente com e-mail → gerar o link
   → **E-mail** → confirmar. O e-mail chega com "Pagar"; o cartão mostra
   "Link de pagamento · Enviado".
2. Pagar pelo link (valor mínimo, de teste). Na volta, a confirmação chega e
   aparece no cartão e na aba E-mails do cliente (para quem vê o Financeiro).
3. Outra receita com vencimento daqui a 2 dias, link enviado há mais de 24 h:
   chamar o cron à mão (`curl -H "Authorization: Bearer $CRON_SECRET"
   <base>/api/cron/emails`) → `reminders.sent: 1`. Chamar de novo → nada sai.
4. Um link mandado só pelo WhatsApp: nenhum lembrete nem confirmação por
   e-mail.

## Pendências do operador (podem começar já, em paralelo ao código)

1. Criar a conta no Resend e adicionar o domínio
   **`avisos.cordeiropessigato.com.br`**.
2. No DNS de `cordeiropessigato.com.br`, criar os registros que o Resend
   mostrar (MX e TXT de SPF em `send.avisos`, TXT de DKIM em
   `resend._domainkey.avisos`). Se o DNS estiver no Cloudflare, DKIM como
   **DNS only**.
3. **DMARC** no domínio raiz, se ainda não houver:
   `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:<caixa do escritório>`. Gmail e
   Outlook pesam isso para decidir entre caixa de entrada e spam.
4. Gerar a API key (permissão **Sending access**, restrita ao domínio) e pôr as
   variáveis acima na Vercel. Conferir que `CRON_SECRET` está em Production —
   sem ela, os dois crons recusam tudo.
5. Cadastrar o webhook do Resend apontando para
   `https://<domínio de produção>/api/webhooks/resend` (eventos delivered,
   delivery_delayed, bounced, complained, failed, suppressed) e pôr o segredo
   dele em `RESEND_WEBHOOK_SECRET`. No domínio, deixar **open tracking e click
   tracking desligados** (é o padrão do Resend).
6. Preencher **Configurações → Geral → Escritório**: nome e e-mail (vira o
   Reply-To e já aparece no portal).
7. Aproveitando o mesmo domínio: SMTP do Supabase pelo Resend (§9, modo B, de
   `docs/PLANEJAMENTO-MULTIUSUARIO.md`) — convite e recuperação de senha da
   equipe passam a chegar por e-mail.
8. Aplicar as migrations 95 e 96 **antes** do deploy de cada PR.

## Fora de escopo (decisão explícita desta v1)

- **Lembrete de audiência ao cliente.** Ficou mais barato desde o plano: há
  cron, e `docs/audiencias.md` já desenha a mensagem pronta de confirmação
  (data, modalidade, local ou link, o que levar). Com a infraestrutura deste
  plano, vira um template e um passo no cron — candidato natural à v2.
- Anexos em e-mail (petição, contrato, documento).
- Receber respostas dentro do sistema (e-mail de entrada).
- WhatsApp/SMS por API.
- Horário do resumo e categorias configuráveis pela tela — são constantes no
  código até alguém precisar mudar.
- Texto do ato ou resposta da IA no corpo do e-mail (decisão 2).
- E-mails da D4Sign aos signatários: continuam saindo da própria D4Sign.
