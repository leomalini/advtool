# E-mails para clientes — retomada

> Para continuar este trabalho em outra máquina, ou numa conversa nova, sem
> depender do histórico do chat em que ele foi feito (21 a 23/11/2026).
>
> **O plano completo** — decisões, modelo de dados, regras e o "Como ficou" de
> cada PR — está em [`emails-clientes.md`](emails-clientes.md). Este arquivo é
> o mapa: onde está tudo, o que falta, em que ordem, e o que se aprendeu no
> caminho que não está escrito no código.

## Em uma frase

O código da feature inteira está pronto e commitado (quatro partes), **nada
foi para produção**: falta aplicar duas migrations, criar a conta e o domínio
no Resend, configurar variáveis e conferir na tela com login. Nenhum e-mail
real foi enviado até agora.

## Onde está o código

| | |
|---|---|
| Branch | **`feat/emails-clientes-completo`** — esta. Enviada ao GitHub para continuar em outra máquina |
| Base | `main` em `52ab3ca` (merge do PR #80). Em 23/11/2026 a `origin/main` continuava nesse commit |
| PR aberto | Nenhum |

Os commits, um por parte, em cima da base:

| Commit | Parte | O que entrega |
|---|---|---|
| `1c1df50` | PR 1 — fundação | Resend + React Email, migration 95, `src/lib/email/`, webhook do Resend, aba **E-mail** em Configurações (situação + e-mail de teste), aba **E-mails** na ficha do cliente, **Enviar por e-mail** no diálogo do link do portal |
| `8c2b230` | PR 2 — resumo diário | Migration 96, resumo dos processos às 18h (cron da Vercel), descadastro em um clique, chave na ficha, ativação em lote na lista de Clientes |
| `8734375` | PR 3 — cobrança | Link de pagamento por e-mail, lembretes antes e depois do vencimento, confirmação de pagamento |
| `5b5e816` | PR 4 — mensagem avulsa | **Enviar e-mail** no cabeçalho da ficha, com revisão antes de enviar |
| (este) | Documentação | Este arquivo e o status do plano |

Na máquina original os quatro commits também estão em quatro branches locais
empilhadas (`feat/emails-clientes` → `feat/emails-resumo-diario` →
`feat/emails-cobranca` → `feat/emails-mensagem`). **Elas não foram enviadas**;
esta branch carrega os mesmos commits e basta.

### Trazer para a outra máquina

```powershell
git fetch origin
git switch feat/emails-clientes-completo
pnpm install
```

O `.env` não vai pelo git. Copie o da máquina original, ou preencha a partir
do `.env.example` (as variáveis de e-mail e o `CRON_SECRET` estão documentados
lá, no fim). Para testar envio localmente, `EMAIL_SANDBOX_TO` é obrigatória
fora da produção — sem ela o app recusa enviar, de propósito.

## O que falta, em ordem

### 1. Duas respostas que o Leonardo ainda não deu

Perguntadas na conversa, sem resposta até 23/11/2026:

1. **Onde fica o DNS de `cordeiropessigato.com.br`** (Registro.br,
   Cloudflare, hospedagem…). É onde vão os registros do Resend — e, se for
   Cloudflare, o DKIM precisa ficar como "DNS only".
2. **Qual caixa de e-mail recebe as respostas dos clientes** (ex.:
   `contato@cordeiropessigato.com.br`). Não é configuração de código: é o
   e-mail em Configurações → Geral → Escritório, que vira o Reply-To. Sem ele,
   o cliente que responde escreve para um endereço que ninguém lê.

### 2. Operador (fora do código)

O passo a passo detalhado está em "Pendências do operador", no plano. Em
resumo:

1. **Aplicar as migrations 95 e 96, nessa ordem, antes do deploy.** A 96
   depende da 95. Antes, conferir se a `main` não ganhou outra migration 95 ou
   96 enquanto isso (`ls supabase/migrations | tail`); se ganhou, renumerar
   estas antes do merge.
2. Conta no **Resend**; adicionar o domínio **`avisos.cordeiropessigato.com.br`**
   (subdomínio, de propósito — ver o plano).
3. No DNS: os registros que o Resend mostrar (MX e TXT em `send.avisos`, DKIM
   em `resend._domainkey.avisos`) e um **DMARC** no domínio raiz se ainda não
   houver (`_dmarc`, `v=DMARC1; p=none; rua=mailto:<caixa do escritório>`).
4. API key do Resend com **Sending access**, restrita ao domínio.
5. Na Vercel (Production): `RESEND_API_KEY`, `EMAIL_FROM`
   (`escritorio@avisos.cordeiropessigato.com.br`), `RESEND_WEBHOOK_SECRET`, e
   conferir que `CRON_SECRET` existe — os dois crons (`/api/cron/diario` e
   `/api/cron/emails`) recusam tudo sem ela. **`EMAIL_SANDBOX_TO` nunca em
   Production.**
6. Webhook no Resend para `https://<produção>/api/webhooks/resend`, eventos
   delivered, delivery_delayed, bounced, complained, failed, suppressed. Open
   e click tracking **desligados** no domínio (padrão do Resend).
7. Preencher nome e e-mail do escritório em Configurações → Geral.
8. Opcional, mesmo domínio: SMTP do Supabase pelo Resend (§9, modo B, de
   `PLANEJAMENTO-MULTIUSUARIO.md`) — convite e recuperação de senha da equipe
   passam a chegar por e-mail.

### 3. Conferir na tela, com login

Cada PR tem um **roteiro de conferência** no fim do seu "Como ficou", no
plano. Ordem sugerida, com `EMAIL_SANDBOX_TO` apontando para um e-mail do
escritório:

1. Configurações → E-mail → **Enviar e-mail de teste** (prova chave, domínio,
   remetente e Reply-To de uma vez).
2. Roteiro do PR 1 (link do portal por e-mail).
3. Roteiro do PR 2 (resumo diário — inclui chamar o cron à mão com `curl`).
4. Roteiro do PR 3 (cobrança — o passo do pagamento real é decisão sua).
5. Roteiro do PR 4 (mensagem avulsa).

### 4. Abrir o(s) PR(s)

Duas formas, à escolha:

- **Um PR só**: `feat/emails-clientes-completo` → `main`. Mais simples; o
  histórico continua com um commit por parte.
- **Quatro PRs empilhados**, como os outros módulos do projeto. Recriar as
  branches a partir dos commits e abrir cada uma sobre a anterior:

  ```powershell
  git branch feat/emails-clientes 1c1df50
  git branch feat/emails-resumo-diario 8c2b230
  git branch feat/emails-cobranca 8734375
  git branch feat/emails-mensagem feat/emails-clientes-completo
  ```

  Bases: PR 1 → `main`; PR 2 → `feat/emails-clientes`; PR 3 →
  `feat/emails-resumo-diario`; PR 4 → `feat/emails-cobranca`. A última leva
  também o commit desta documentação.

### 5. Depois de no ar

- Ligar o resumo diário para poucos clientes primeiro (ficha → aba E-mails), e
  só depois usar a ativação em lote.
- Acompanhar a resposta do cron no log da Vercel (`/api/cron/emails` devolve
  quantos saíram, falharam e por quê).
- Plano gratuito do Resend: 100 e-mails/dia e 3.000/mês (conferido em
  21/11/2026). Ao estourar, o envio pausa. Com lembretes de cobrança e muitos
  clientes no resumo, considerar o plano pago.

## O que não foi verificado

Nada disto pôde ser feito sem login, sem as migrations e sem o Resend:

- Nenhum envio real; nenhum aviso real do webhook do Resend.
- Nada contra o banco real (95 e 96 não aplicadas).
- O cron rodando na Vercel; o descadastro em um clique do Gmail/Outlook (exige
  HTTPS e envio real).
- A confirmação de pagamento num pagamento de verdade.
- As telas com sessão: chave do resumo, ativação em lote, prévia e envio da
  mensagem avulsa, botão de e-mail na cobrança.

O que **foi** verificado, por PR, está em cada "Como ficou" — incluindo testes
com banco simulado da seleção do resumo (PASS), da regra dos lembretes (9 de 9)
e do escape da mensagem avulsa (12 de 12).

## As decisões, num lugar só

Os porquês estão no plano; aqui é a lista para não esquecer nenhuma.

**De negócio (do Leonardo, 21/11/2026):**

1. Atualização de processo por **resumo diário automático** — nada de e-mail
   por ato nem fila de aprovação.
2. O e-mail diz **que** algo aconteceu (tipo e data do ato) e manda para o
   portal; **o texto do tribunal fica no portal**, atrás do CPF/CNPJ.
3. **Ninguém recebe até o escritório ligar**, cliente a cliente (ou em lote
   pelo filtro).
4. Na v1: resumo, link do portal, cobrança e mensagem avulsa. **Lembrete de
   audiência fica fora.**

**Técnicas (tomadas na conversa):**

- Provedor **Resend**, API HTTP; templates em **React Email**. Versões fixas,
  com pelo menos três semanas de publicação na escolha: `resend@6.37.0`,
  `@react-email/components@1.0.12`, `@react-email/render@2.0.6` (a que o
  components fixa).
- Credenciais **no ambiente**, como a D4Sign (não no banco, como a IA).
- Remetente num **subdomínio** (`avisos.`), Reply-To = e-mail do escritório.
- **Sem rastreio de abertura e clique** (o link do portal leva o token; pixel é
  dado pessoal sem necessidade).
- **`EMAIL_SANDBOX_TO` obrigatória fora da produção da Vercel** (`VERCEL_ENV`).
- **A cópia guardada do e-mail mascara o token do portal** — um vazamento só do
  banco continua sem entregar link utilizável.
- Cron próprio às **18h** (`/api/cron/emails`), separado do `/api/cron/diario`.
- Resumo: categorias decisão, audiência, recurso e encerramento; só atos
  visíveis no portal, vindos de webhook ou digitados; **carência de 2 h**;
  **janela de 7 dias**; um por cliente por dia; data da audiência pela ficha +
  evento.
- Descadastro: abrir o link **não** desliga (antivírus abrem links); o pedido
  do cliente fica em `clients.email_updates_opted_out_at` e a ativação em lote
  **nunca** religa quem saiu.
- Chave do resumo na **aba E-mails** da ficha (o `CadastroTab` é compartilhado
  com a ficha de pessoa); só clientes (`is_client`) recebem qualquer e-mail.
- Cobrança: lembrete e confirmação **só para cobrança cujo link foi por
  e-mail**; confirmação **só quando o pagamento deu baixa**; lembretes em
  janela (1–3 dias antes, 24 h depois do link; 1–7 dias depois), um de cada.
- Mensagem avulsa: texto puro escapado, **revisão obrigatória** antes de
  enviar, assinatura da conta de quem envia.

**Limitações aceitas de propósito:**

- Lembrete e confirmação de cobrança que falharem **não são tentados de novo**
  (a `dedupe_key` é permanente). O resumo diário tenta no dia seguinte.
- A ativação em lote lê no máximo **1.000 clientes** do recorte (limite do
  PostgREST) e avisa quando cortou.
- Endereço bloqueado (bounce/spam) **não tem tela para desbloquear** ainda —
  só pelo banco (`email_suppressions`).
- No plano Hobby da Vercel, o cron dispara em algum momento **dentro da hora**.

## Como trabalhar neste projeto (aprendido no caminho)

Notas que estavam só na memória local do assistente, na máquina original:

- **Nunca chutar identificador.** Nome de coluna, tabela, função ou arquivo
  vem da fonte (`grep` no arquivo que define), nunca do nome do arquivo ou de
  convenção. E "não existe" também precisa de prova: um 400/404 é hipótese,
  não achado — o erro costuma estar no teste. (Também em `AGENTS.md`.)
- **Verificar sem login.** Toda tela do app exige login, e não há framework
  de testes. A rede disponível é `npx tsc --noEmit`, `npx eslint src` e
  `npx next build`. Para ver tela ou testar regra: página **temporária** sob
  `/acompanhar/zz-…` (prefixo público), com dados fictícios ou banco simulado
  em memória — **apagada antes do commit**. Foi assim que se testaram os
  templates, a seleção do resumo e o diálogo da mensagem avulsa. O percurso
  com login vira roteiro para o Leonardo.
- **Fim de linha.** O repositório é LF. Editar no Windows converteu arquivos
  para CRLF três vezes nesta feature, transformando mudanças de poucas linhas
  em "reescrita" do arquivo inteiro no diff. Antes de commitar, comparar a
  última linha de `git diff --cached --stat` com a de
  `git diff --cached --stat --ignore-cr-at-eol`; se diferirem, normalizar com
  `sed -i 's/\r$//' <arquivo>`.
- **Cache do Next.** Depois de um `next build`, o `next dev` às vezes serve 404
  em rota nova ou quebra em `next/font/google` ("queries have exactly one
  entry"). Não é o código: apagar `.next/dev` (ou `.next` inteiro, que é só
  saída de build e fica fora do git) e subir de novo. O `.next/types` velho
  também gera erro de `tsc` apontando para rota que não existe mais — some no
  próximo build.
- **Next 16.** Antes de escrever código de Next, ler o guia em
  `node_modules/next/dist/docs/` (`AGENTS.md`). Rotas usam
  `params: Promise<…>`; o proxy (`src/proxy.ts` →
  `src/lib/supabase/middleware.ts`) deixa `/api/*` e os prefixos públicos
  (`/acompanhar`, `/pagamento`, `/descadastrar`) passarem sem sessão.
- **RLS por permissão.** Tabela nova chama `apply_rbac_policies(...)`
  (migration 35), nunca `auth_full`; escrita sensível vai pela service_role
  numa rota, **depois** de `requirePermissionApi`. RLS que nega devolve lista
  vazia, não erro. Detalhes em `PLANEJAMENTO-MULTIUSUARIO.md`.
- **Schema: fonte única.** Em mudança de schema, o Leonardo prefere migrar e
  dropar a coluna antiga na mesma migration, sem camada de compatibilidade. E
  `pnpm db:push` roda no banco real: aplicar migration é decisão dele.
- **Commits** em inglês, Conventional Commits; textos de tela e documentação
  em português.

## Ideias para depois (fora da v1)

- **Lembrete de audiência ao cliente** — ficou barato: há cron e
  `audiencias.md` já desenha a mensagem de confirmação. Um template e um passo
  no cron.
- Tela para **desbloquear** endereço em `email_suppressions`.
- Anexos (petição, contrato) na mensagem avulsa.
- Receber as respostas dentro do sistema (e-mail de entrada).
- Horário do resumo e categorias configuráveis pela tela (hoje são constantes
  em `src/lib/email/digest.ts`).
- Mostrar os e-mails da cobrança também depois de paga. Hoje o histórico
  (link, lembretes, confirmação) só aparece no cartão do link **em aberto**;
  paga a cobrança, o cartão some, e a confirmação fica visível só na aba
  E-mails do cliente e em Configurações → E-mail.

## Mapa de arquivos

| Onde | O quê |
|---|---|
| `supabase/migrations/…95_email_messages.sql`, `…96_client_email_digest.sql` | Banco |
| `src/lib/email/` | Configuração, envio, webhook, resumo, cobrança, descadastro, datas |
| `src/emails/` | Templates React Email |
| `src/app/api/email/`, `src/app/api/webhooks/resend/`, `src/app/api/cron/emails/` | Rotas gerais |
| `src/app/api/clientes/[id]/{portal-link/email,resumo-email,emails}/`, `src/app/api/clientes/resumo-email/` | Rotas do cliente |
| `src/app/api/financeiro/cobrancas/[id]/email/` | Rota da cobrança |
| `src/app/descadastrar/` | Página pública do descadastro |
| `src/features/emails/` | Telas, hooks e serviços |
| `src/features/configuracoes/components/EmailSettingsTab.tsx` | Aba E-mail |
| `src/lib/cron/authorize.ts`, `vercel.json` | Crons |
| `src/utils/clientContacts.ts` | Regra de qual e-mail/telefone do cliente usar |
| `docs/emails-clientes.md` | O plano completo |
