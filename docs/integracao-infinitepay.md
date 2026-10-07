# Integração InfinitePay — checkout no Financeiro

> **Status:** plano e decisões técnicas aprovados em 2026-10-06. Spike (Fase 0)
> feito no mesmo dia, com um Pix real de R$ 1,00. Fases 1, 2 e 3 implementadas
> na branch `feat/infinitepay-checkout`; migration 67 aplicada. Falta o teste em
> produção da Fase 3 e a Fase 4 (portal).
> **Referência:** https://www.infinitepay.io/checkout-documentacao (lida em 2026-10-06).

Cobrar uma receita do Financeiro por link de pagamento da InfinitePay (Pix ou
cartão em até 12x) e dar baixa no lançamento sozinho quando o cliente pagar.

## Decisões

| # | Decisão | Consequência |
|---|---|---|
| 1 | O link nasce no **lançamento**: botão no detalhe e opção "gerar link" ao criar uma receita | Copiar, abrir o WhatsApp com mensagem pronta, abrir |
| 2 | O **portal do cliente** ganha a seção Pagamentos | Reabre o "não é financeiro" de `portal-cliente.md` |
| 3 | **1 link = 1 lançamento** | Conciliação direta; parcelas são links separados |
| 4 | **Baixa automática**, só depois de conferir no `payment_check` | O corpo do webhook nunca dá baixa sozinho |
| 5 | O lançamento fica com o **valor bruto** | A taxa da InfinitePay não entra no Financeiro |
| 6 | **Uma conta do escritório**: InfiniteTag em Configurações | Cada cobrança guarda a tag usada |
| 7 | O portal mostra **só cobranças com link** | Lançamento sem link não aparece para o cliente |
| 8 | **Spike com Pix de R$ 1,00** antes de codar | Resolve o que a documentação não diz |

Lembretes automáticos (WhatsApp/e-mail) ficaram de fora deste ciclo.

## A API, em uma página

**O que existe**

- `POST https://api.checkout.infinitepay.io/links` cria o link. Corpo: `handle`
  (InfiniteTag sem o `$`), `items[]` (`quantity`, `price` em **centavos**,
  `description`) e, opcionais, `order_nsu`, `redirect_url`, `webhook_url`,
  `customer` (`name`, `email`, `phone_number` no formato `+5511999887766`) e
  `address` (entrega — não usaremos).
- `POST https://api.checkout.infinitepay.io/payment_check`. Corpo: `handle`,
  `order_nsu`, `transaction_nsu`, `slug`. Resposta: `success`, `paid`, `amount`,
  `paid_amount`, `installments`, `capture_method`.
- Retorno do cliente: depois de pagar, ele clica em "Continuar" e vai para a
  `redirect_url` com `receipt_url`, `order_nsu`, `slug`, `capture_method` e
  `transaction_nsu` na query.
- Webhook, só no pagamento aprovado: `invoice_slug`, `amount`, `paid_amount`,
  `installments`, `capture_method` (`pix` | `credit_card`), `transaction_nsu`,
  `order_nsu`, `receipt_url`, `items`. Responder 200 em menos de 1 s; um 400 faz
  a InfinitePay reenviar.

**O que não existe, ou não está documentado**

- Autenticação além do `handle`: nenhuma chave, nenhum segredo.
- Assinatura do webhook.
- O formato da resposta do `POST /links` — nem o nome do campo da URL
  (resolvido no spike: `{"url": …}`).
- Sandbox.
- Cancelar, expirar ou listar links; estorno; webhook de estorno ou chargeback.
- Data e hora do pagamento (nem no webhook, nem no `payment_check`).
- Taxa cobrada e valor líquido.
- Limites (valor mínimo/máximo, rate limit) e códigos de erro.
- Controle de parcelas por link: o parcelamento máximo e o repasse de juros ao
  cliente são configurados no app da InfinitePay.

**Incoerência na documentação:** o exemplo de itens usa `"itens"`, mas o payload
que a própria página gera e o corpo do webhook usam `"items"`. O spike
confirmou: `items` (`"itens"` volta 400).

**`paid_amount` × `amount`:** nos exemplos, `paid_amount` é maior (1010 × 1000).
É o que o cliente pagou com os juros do parcelamento repassados. O lançamento
continua com `amount`; o `paid_amount` fica guardado na transação.

## O que o spike mostrou (2026-10-06)

Chamadas reais à API com a InfiniteTag do escritório. Os corpos crus ficaram no
scratchpad da sessão; o essencial está aqui.

| Pergunta | Resposta |
|---|---|
| Resposta do `POST /links` | `200` com **só** `{"url": "https://checkout.infinitepay.io/<handle>?lenc=…"}` — sem `slug`, sem id. Em ~0,4 s |
| O que é o `lenc` | O pedido inteiro, em Brotli + base64url, com assinatura curta (`<dados>.v1.<16 caracteres>`). **Não é criptografado**: `external_order_nsu`, `handle`, `items`, `redirect_url`, `webhook_url` e `customer` se leem decodificando a URL |
| O link expira? | Nada de validade dentro do `lenc`. O link é a própria URL assinada; nada indica estado guardado do lado de lá |
| `"itens"` × `"items"` | `"itens"` volta `400 … invalid: items`. O nome certo é `items` |
| Handle vazio | `400 {"success":false,"message":"param is missing or the value is empty or invalid: handle"}` |
| Handle errado ou conta sem checkout ativado | `404 {"success":false,"error":"external_checkout_not_enabled","message":"External checkout is not enabled for this merchant…","redirect_url":"https://app.infinitepay.io/external-checkout#configuracoes?enabled=true"}` |
| `customer.phone_number` | `+5527999999999` aceito |
| Retorno do cliente (Pix de R$ 1,00 pago) | `capture_method=pix`, `transaction_nsu`, `slug` (10 caracteres), `order_nsu` (o nosso) e `receipt_url` — e mais `transaction_id`, fora da documentação, com o mesmo valor de `transaction_nsu` |
| Comprovante | `https://recibo.infinitepay.io/<transaction_nsu>`, **público**: abre sem login para quem tiver a URL |
| `payment_check` com os 4 campos | `{"success":true,"paid":true,"amount":100,"paid_amount":100,"installments":1,"capture_method":"pix"}`, em ~0,2 s |
| `payment_check` só com `handle` + `order_nsu` | `{"success":false}` — também sem `transaction_nsu`, sem `order_nsu` ou com `slug` inventado |
| `transaction_nsu` inventado, ou `order_nsu` de outra cobrança | `{"success":true,"paid":false,"amount":0,"paid_amount":0,…}` — a fatura existe, mas não é desse pagamento/pedido |
| `payment_check` com handle errado | `404 {"success":false,"message":"Not found"}` |
| Link já pago, aberto de novo | Abre o checkout normal, com o mesmo item e o formulário de pagamento — nenhum aviso de "pago". Um segundo pagamento parece possível (não pagamos para confirmar) |
| O que o cliente vê no topo do checkout | A InfiniteTag e o **nome do titular da conta** |
| O checkout pede | Telefone, e-mail e nome antes do pagamento — o que o `customer` pré-preenche |

**Consequências para o desenho:**

- **`paid: true` não basta: o valor tem que ser conferido.** Qualquer um pode
  gerar um link para a conta do escritório (só precisa da InfiniteTag, que é
  pública) com o MESMO `order_nsu` de uma cobrança nossa — que está legível no
  `lenc` — e um valor menor. Pagando esse link, o `payment_check` responde
  `paid: true` para o nosso `order_nsu`, com o `amount` do link falso. Sem
  comparar, um R$ 1,00 quitaria uma parcela de R$ 1.500. Regra da baixa:
  `amount` igual a `payment_charges.amount_cents` e `paid_amount >= amount`;
  fora disso a transação é registrada (o dinheiro entrou), a baixa não acontece
  e o sino avisa.
- **Não há conciliação por consulta.** O `payment_check` só responde com os
  quatro campos, e `transaction_nsu`/`slug` só chegam pelo webhook ou pelo
  retorno. Uma cobrança paga cujo webhook se perdeu, e cujo cliente fechou a
  aba antes do "Continuar", só é descoberta no app da InfinitePay.
- **`success: false` não é erro de rede**: é "essa combinação não existe". A
  entrega vira `invalid` e não é reprocessada; já `502`/`504` são transitórios.
- **O link pago não some.** Quem clicar de novo numa mensagem antiga consegue,
  ao que tudo indica, pagar outra vez. A tabela de transações já comporta isso;
  a tela nunca reoferece link pago, e um segundo pagamento vira alerta para
  estorno.
- **O checkout mostra o nome do titular.** Com a conta pessoal, o cliente vê o
  nome do advogado, não o do escritório; uma conta PJ mostraria a razão social.

- **O token do webhook não é segredo de quem tem o link.** Ele vai na
  `webhook_url`, que vai dentro do `lenc`, que qualquer um decodifica. Continua
  útil — barra POST às cegas de quem não tem o link —, mas a garantia de verdade
  é só o `payment_check`. Quem tem o link consegue forjar entregas para aquela
  cobrança e fazer o sistema consultar a InfinitePay; daí a Fase 3 limitar as
  consultas por cobrança (ignorar entrega de cobrança já paga, e no máximo
  algumas conferências por minuto).
- **Os dados do cliente viajam na URL.** Nome, e-mail e telefone pré-preenchidos
  ficam legíveis para quem receber o link encaminhado. O link vai para o
  próprio cliente, então o dado é dele; ainda assim, é mais um motivo para o
  pré-preenchimento ser opcional.
- **Dá para conferir a InfiniteTag ao salvar.** O `404
  external_checkout_not_enabled` separa conta errada ou sem checkout ativado de
  conta pronta, e gerar um link não deixa rastro do lado de lá (ele é só uma URL
  assinada). Proposta para a Fase 2: "Verificar conta" em Configurações →
  Pagamentos, com o link para ativar o checkout quando for o caso.

**Não verificado:** o corpo real do webhook (fica para a Fase 3, em produção —
a rota grava a entrega crua antes de qualquer validação) e se um segundo
pagamento no mesmo link é de fato aceito.

## Fluxos

### Gerar o link

1. Quem tem `financeiro:create` clica em "Gerar link de pagamento" numa receita
   pendente — ou marca a opção ao criar a receita.
2. A rota cria a linha em `payment_charges` com status `creating` e um token de
   webhook novo. O índice único "uma cobrança ativa por lançamento" barra o
   clique duplo.
3. Chama `POST /links` com:
   - `handle` de `office_settings`;
   - um item com a descrição do lançamento e o valor em centavos;
   - `order_nsu` = id da cobrança;
   - `customer` com nome, e-mail e telefone do cadastro do cliente (`clients`
     ou o contato principal em `client_contacts`), telefone em `+55…`;
   - `redirect_url` = `${APP_PUBLIC_URL}/pagamento/retorno`;
   - `webhook_url` = `${APP_PUBLIC_URL}/api/webhooks/infinitepay?t=<token>`.
4. Sucesso → `open`, com a `checkout_url`. Falha → `failed`, com o motivo na tela.
   Criada junto com o lançamento, a falha não desfaz o lançamento: ele fica
   salvo e o link pode ser gerado de novo pelo detalhe.
5. A tela mostra o link com Copiar, WhatsApp (wa.me com mensagem pronta para o
   telefone do cliente) e Abrir.

Em desenvolvimento, sem `APP_PUBLIC_URL` público, o link sai **sem**
`webhook_url`: a confirmação vem só pelo retorno, que funciona no mesmo
computador.

### Pagamento → baixa

```
cliente paga ─► InfinitePay ─► POST /api/webhooks/infinitepay?t=…
                                 │ 1. grava a entrega em webhook_events (provider 'infinitepay')
                                 │ 2. responde 200 (< 1 s)
                                 └─ after(): confirmPayment()
                                      ├ token ↔ cobrança ↔ order_nsu conferem?   não → 'invalid'
                                      ├ payment_check(handle, order_nsu, transaction_nsu, slug)
                                      │      success false ou paid false → 'invalid', sem baixa
                                      ├ insere payment_transactions (transaction_nsu único → 'duplicate')
                                      ├ amount ≠ amount_cents da cobrança → alerta, SEM baixa (link clonado)
                                      ├ cobrança → 'paid'
                                      ├ lançamento → 'pago', paid_at = data em America/Sao_Paulo
                                      └ sino (resource 'financeiro')
```

- Responde 400 só quando nem a gravação da entrega deu certo: é o único caso em
  que o reenvio da InfinitePay ajuda.
- Se o `after()` falhar (o `payment_check` fora do ar, por exemplo), a entrega
  fica `received` e volta por um "Reprocessar" próprio da InfinitePay, no mesmo
  lugar do que já existe para a BuscaProcessos.
- `paid_at` é a data em que a confirmação chegou: a API não informa quando o
  pagamento aconteceu. Convertida para America/Sao_Paulo porque a Vercel roda em
  UTC e `paid_at` é `date`.

### Retorno do cliente

A página pública `/pagamento/retorno` recebe os parâmetros do redirect e pede ao
servidor a mesma `confirmPayment()`, com `via = 'redirect'`. É um segundo
caminho de confirmação: se o webhook se perder, o retorno do cliente basta.

Mostra só "pagamento confirmado", valor, método e o link do comprovante — nada
do cliente nem do lançamento, porque essa URL pode ser encaminhada.

Por que não voltar para o portal: a `redirect_url` fica registrada na
InfinitePay, e colocar nela o token do portal entregaria o link de
acompanhamento a um terceiro.

### Portal

A seção Pagamentos de `/acompanhar/<token>` lista as cobranças `open`
(descrição, valor, vencimento, botão Pagar → `checkout_url`) e as `paid` (data,
método, comprovante). Entra no payload montado campo a campo em
`src/lib/clientPortal/data.ts`, atrás do mesmo token + CPF/CNPJ.

O assistente do portal **não** recebe esses dados: o escopo dele continua sendo o
andamento dos processos, e valor e vencimento são o tipo de coisa que um modelo
não pode errar. (Proposta — dá para mudar.)

## Segurança do webhook

Sem assinatura, o corpo do webhook é tratado como **pista, não como prova**.
Quatro camadas:

1. **Token por cobrança na URL** (`?t=`): 32 bytes aleatórios; no banco, só o
   SHA-256 — o mesmo desenho de `src/lib/clientPortal/token.ts`. Sem o token
   certo, a entrega é `invalid` e nada é consultado. **Não é segredo de quem tem
   o link** (ver o spike): filtra POST às cegas, não quem recebeu a cobrança.
2. **Conferência no `payment_check`**, servidor a servidor, antes de qualquer
   baixa. Um corpo forjado com token válido ainda precisaria de um
   `transaction_nsu`/`slug` que a InfinitePay reconheça como pago para aquele
   `order_nsu` — o spike mostrou que ela cruza os três (`paid: false` quando
   não batem).
3. **Conferência do valor.** `paid: true` prova que alguém pagou um link com
   aquele `order_nsu`, não que pagou o NOSSO link: qualquer um gera um link
   para a InfiniteTag do escritório com o mesmo `order_nsu` e outro preço. A
   baixa exige `amount` igual a `amount_cents` da cobrança.
4. **Idempotência:** `transaction_nsu` único em `payment_transactions`; a
   cobrança sai de `open` uma vez só.

Mais as duas dicas da própria documentação: conferir se o `order_nsu` é uma
cobrança nossa e guardar o `transaction_nsu`.

## Modelo de dados — migration `20260101000067_infinitepay_checkout.sql`

Número a reconferir antes de criar (a 66 é a última hoje).

**`office_settings.infinitepay_handle text`** — a InfiniteTag, sem o `$`. Não é
segredo: lê quem lê `office_settings` (`*`), edita quem tem
`configuracoes:manage`.

**`payment_charges`** — um link.

| Coluna | |
|---|---|
| `id` | uuid; também é o `order_nsu` |
| `financial_entry_id` | → `financial_entries`, `on delete set null` (ver a trava abaixo) |
| `provider` | `'infinitepay'` |
| `handle` | a tag usada neste link (snapshot) |
| `description`, `amount_cents` | o que foi enviado |
| `customer_name` | snapshot, para reconhecer um pagamento tardio de lançamento excluído |
| `checkout_url` | da resposta do `/links` |
| `status` | `creating` · `open` · `paid` · `canceled` · `refunded` · `failed` |
| `webhook_token_hash` | SHA-256 do token da URL |
| `error` | motivo de `failed` |
| `canceled_at`, `canceled_by` | |
| `created_by`, `created_at`, `updated_at` | |

Índice único parcial: no máximo uma cobrança `creating`/`open` por lançamento.

**`payment_transactions`** — um pagamento confirmado.

| Coluna | |
|---|---|
| `charge_id` | → `payment_charges` |
| `transaction_nsu` | **unique** |
| `invoice_slug`, `capture_method`, `installments` | |
| `amount_cents`, `paid_amount_cents` | do `payment_check` |
| `receipt_url` | |
| `confirmed_via` | `webhook` · `redirect` · `manual` |
| `confirmed_at` | |
| `refunded_at`, `refunded_by` | estorno registrado à mão |

Tabela separada porque o spike pode mostrar que um link aceita mais de um
pagamento. Nesse caso o segundo vira uma linha nova, com alerta, em vez de
sobrescrever o primeiro.

**RLS:** a tela só **lê**; quem escreve é sempre o servidor.

```sql
select public.apply_rbac_policies('payment_charges',
  'financeiro:view', null, null, null);
select public.apply_rbac_policies('payment_transactions',
  'financeiro:view', null, null, null);
```

Gerar e cancelar link passam por rotas que conferem `financeiro:create`/`update`
com o client de sessão e só então gravam pela service_role — o desenho de
`requireAdminApi`. Uma policy de update aberta deixaria qualquer tela pular a
cobrança de `open` para `paid` sem pagamento nenhum. O perfil `paralegal` não vê
nenhuma das duas tabelas, como já não vê `financial_entries`.

**Travas no banco:** trigger `guard_financial_entry_charges` em
`financial_entries` (`before update of amount, type, status or delete`). Com
cobrança `creating`/`open`/`paid`, recusa: mudar valor ou tipo; excluir; marcar
como pago à mão com link vivo; voltar de pago para pendente com pagamento
confirmado (isso é estorno). Os erros saem com SQLSTATE `PT409` — HTTP 409 pelo
PostgREST — e é por esse código que a tela reconhece a trava.

## Ajustes no que já existe

| Onde | Ajuste | Por quê |
|---|---|---|
| `src/lib/buscaprocessos/webhookAlerts.ts` (`alertOnRejectionStreak`, `readLastOriginDelivery`) | filtrar `provider = 'busca_processos'` | hoje leem `webhook_events` inteiro: entregas da InfinitePay entrariam na sequência de recusas e na "última entrega" da BuscaProcessos |
| `getWebhookEvents` (`webhookEvents.service.ts`) e `WebhooksManager` | filtro e coluna de provedor | a tela passa a ter duas origens |
| `src/lib/supabase/middleware.ts` (`PREFIXOS_PUBLICOS`) | incluir `/pagamento` | a página de retorno é aberta pelo cliente, sem sessão; `/api/*` já passa direto |
| `FinancialEntryDetailModal` | seção Cobrança | gerar, compartilhar, cancelar, ver comprovante |
| `FinancialEntryForm` | opção "Gerar link de pagamento" | só receita pendente, só com InfiniteTag configurada |
| Edição do lançamento | a trava é do banco (`PT409`); a tela mostra a mensagem dela em vez de "Erro ao atualizar lançamento.", trava o campo de valor com link vivo e faz "cancelar link + marcar como pago" num clique | o link continua pagável na InfinitePay |
| `deleteFinancialEntry` | mesma tradução do `PT409` | idem |
| Tabela de lançamentos | ícone de link aberto / pago online | |
| `/financeiro` | abrir o detalhe por `?id=` | o aviso do sino precisa apontar para o lançamento; hoje a página não lê parâmetro |
| `activities` | nada de cobrança no feed (revisto na Fase 2) | o feed é lido por todos, inclusive quem não vê o Financeiro; o sino respeita a permissão |
| Route Handlers do Financeiro | helper de permissão por recurso, no padrão de `requireAdminApi` | para API só existe o helper de admin |
| Telefone | `(11) 98765-4321` → `+5511987654321` | formato da API; `whatsappLink` de `ClienteResumo.tsx` já trata o DDI e pode virar util compartilhado |
| `.env.example` | documentar que o checkout depende de `APP_PUBLIC_URL` | sem URL pública não há webhook |
| `docs/portal-cliente.md`, `docs/ROADMAP-MODULOS.md` | atualizar | as duas decisões antigas mudaram |

## Fases

### Fase 0 — Spike (nada no repo)

Script no scratchpad, com a InfiniteTag do escritório:

1. Criar um link de R$ 1,00 (`order_nsu` = `spike-…`, `redirect_url` em
   localhost, sem webhook) e guardar a resposta crua do `/links`.
2. Abrir o link (no celular ou no computador) e pagar o Pix. Ao clicar em
   "Continuar", o navegador vai para um endereço local que não abre — a URL da
   barra de endereço traz os parâmetros do retorno.
3. Chamar o `payment_check` com os quatro campos e depois só com `handle` +
   `order_nsu`.
4. Reabrir o link pago: aceita um segundo pagamento? Mostra "pago"? Expira?
5. Testar `"itens"` × `"items"` e um `handle` inválido (formato do erro).
6. Registrar o resultado neste documento.

O formato real do webhook fica para a Fase 3, em produção: a rota grava a
entrega crua em `webhook_events` antes de qualquer validação.

### Fase 1 — Fundação (PR 1)

Migration 67; `src/lib/infinitepay/` (client com timeout e erros tipados,
schemas zod tolerantes, centavos sem float, telefone E.164, token); filtros de
provedor nos webhooks da BuscaProcessos; Configurações → aba Pagamentos
(InfiniteTag + estado da integração).

**Aceite:** migration aplicada; InfiniteTag salva e lida; alertas da
BuscaProcessos inalterados.

### Fase 2 — Cobrança no Financeiro (PR 2)

Rotas de criar e cancelar link; seção Cobrança no detalhe; Copiar, WhatsApp e
Abrir; opção no formulário; ícones na tabela; travas de valor, exclusão e
"marcar como pago".

**Aceite:** gerar um link real de R$ 1,00 pela tela; clique duplo não gera dois
links; editar o valor com link aberto é recusado com explicação.

**Como ficou (2026-10-06):**

- Rotas: `POST /api/financeiro/lancamentos/<id>/link-pagamento`
  (`financeiro:create`), `POST /api/financeiro/cobrancas/<id>/cancelar`
  (`financeiro:update`) e `POST /api/financeiro/infinitepay/verificar-conta`
  (`configuracoes:manage`). Todas conferem a permissão com a sessão
  (`requireApiPermission`) e gravam pela service_role.
- O domínio mora em `src/lib/infinitepay/charges.ts` (`issueCharge`,
  `cancelCharge`, `verifyInfinitePayHandle`); a escolha dos dados do cliente,
  em `customer.ts`, que a tela também usa para o telefone do WhatsApp.
- Telefone só vai para o checkout com forma de telefone brasileiro (DDD + celular
  começando com 9 ou fixo de 2 a 5); DDI que não seja +55 fica de fora. Um
  número errado faria a InfinitePay recusar o link inteiro.
- O que o banco recusaria vira **aviso no clique** (`aria-disabled` + toast),
  e não botão desativado com `title`: no celular não há hover.
- **Sem registro no feed de atividades.** O feed é lido por qualquer membro,
  inclusive o perfil sem Financeiro; a trilha fica nas próprias cobranças (quem
  gerou, quem cancelou, quando) e os avisos vão pelo sino, que respeita a
  permissão. O feed já mostra o título de lançamentos para esse perfil — tarefa
  separada.
- Configurações → Pagamentos ganhou "Verificar conta", que roda sozinho depois
  de salvar a tag.
- ⚠️ **Não publicar a Fase 2 sem a 3.** Os links já levam a `webhook_url` e a
  `redirect_url`, cujas rotas chegam na Fase 3: em produção, o cliente que
  pagasse voltaria para a tela de login e o aviso de pagamento se perderia.
  (Resolvido: a Fase 3 está na mesma branch.)

### Fase 3 — Confirmação e baixa (PR 3)

Webhook (`?t=` + log + `after()`); `confirmPayment()` idempotente;
`/pagamento/retorno`; sino; alertas de divergência (pagamento em
link cancelado, valor diferente, transação repetida); Reprocessar da
InfinitePay; Registrar estorno.

**Aceite, em produção:** Pix de R$ 1,00 → o lançamento vira Pago sozinho, com a
data certa; reenviar a mesma entrega → `duplicate`; entrega sem token →
`invalid`; entrega com token e `transaction_nsu` inventado → `invalid`, sem baixa;
link clonado (mesmo `order_nsu`, valor menor) pago → transação registrada, alerta
no sino, lançamento continua pendente.

**Como ficou (2026-10-06):**

- `POST /api/webhooks/infinitepay?t=…`: lê a cobrança pelo `order_nsu`,
  compara o token em tempo constante, limita a 10 entregas por cobrança por
  minuto, grava a entrega e responde 200; `processInfinitePayDelivery` roda em
  `after()` e anota o resultado na mesma linha de `webhook_events`. 400 só
  quando nem gravar foi possível. Os NOMES dos cabeçalhos ficam gravados — é
  assim que se descobre se a InfinitePay manda alguma assinatura.
- `src/lib/infinitepay/confirm.ts` (`confirmPayment`): o mesmo caminho para
  webhook, retorno e reprocessamento, e idempotente — transação repetida não
  consulta a InfinitePay de novo, mas completa uma baixa que parou no meio; o
  sino só toca quando algo mudou na rodada. Decide:

  | Situação | Cobrança | Lançamento | Sino |
  |---|---|---|---|
  | Valor igual, link aberto, lançamento pendente | `paid` | `pago`, `paid_at` em America/Sao_Paulo | Pagamento recebido |
  | Valor diferente (link clonado) | intocada | intocado | Pagamento com valor diferente |
  | Link cancelado e pago | `paid` | intocado | Pagamento em link cancelado |
  | Segundo pagamento do mesmo link | intocada | intocado | Pagamento em dobro |
  | Lançamento já pago à mão | `paid` | intocado | Pagamento em lançamento já pago |
  | Lançamento excluído | `paid` | — | Pagamento sem lançamento |

  A transação é gravada em todos esses casos: o dinheiro entrou.
- O comprovante só é guardado se for de `recibo.infinitepay.io`: quem tem o
  link consegue forjar o corpo e o retorno, e um endereço qualquer viraria link
  de phishing dentro do sistema. Fora do domínio, vale o endereço derivado do
  `transaction_nsu`.
- `/pagamento/retorno` (pública, como `/acompanhar`): a página não toca o
  banco; quem confirma é `POST /api/pagamento/retorno`, que devolve só valor
  pago, método, comprovante e o nome do escritório.
- Avisos no sino com `resource: 'financeiro'` e link `/financeiro?id=<lançamento>`,
  que abre o detalhe direto.
- Configurações → Pagamentos: "Avisos de pagamento" (as últimas entregas, ao
  vivo) e "Reprocessar as que falharam" (`POST /api/financeiro/infinitepay/reprocessar`).
- Detalhe do lançamento: "Registrar estorno" no pagamento
  (`POST /api/financeiro/transacoes/<id>/estorno`) — transação, cobrança e
  lançamento voltam em cascata, só até onde não houver outro pagamento valendo.

**Teste em produção (depois do deploy):** com `APP_PUBLIC_URL` apontando para o
endereço HTTPS da Vercel, salvar a tag em Configurações → Pagamentos, gerar um
link de R$ 1,00 numa receita de teste e pagar via Pix. Esperado: página
"Pagamento confirmado", lançamento Pago com a data de hoje, aviso no sino e a
entrega `processada` em "Avisos de pagamento". O corpo e os cabeçalhos reais do
webhook ficam em `webhook_events` para conferir.

### Fase 4 — Portal (PR 4)

Seção Pagamentos no portal; atualizar `docs/portal-cliente.md`.

**Aceite:** o cliente vê as abertas com Pagar e as pagas com comprovante;
cobrança cancelada não aparece.

**Verificação de cada PR:** `tsc`, lint e build; funções puras rodadas no Node
pelo loader do scratchpad; telas pela página temporária sob `/acompanhar`. Sem
testes no repo, como combinado.

## Riscos e pontos em aberto

- **Webhook perdido e cliente que fecha a aba antes de "Continuar":** a cobrança
  fica `open` sem `transaction_nsu`, e o `payment_check` não tem como achá-la —
  o spike confirmou que ele não aceita só o `order_nsu`, então não há
  conciliação periódica possível. O financeiro vê o pagamento no app e marca
  como pago, cancelando o link.
- **Segundo pagamento no mesmo link:** o link pago continua abrindo o checkout.
  Mensagem antiga no WhatsApp pode virar pagamento em dobro; o sistema registra
  e avisa para estornar.
- **Comprovante público:** a `receipt_url` abre sem login. O portal e a tela do
  lançamento mostram o link só para quem já vê aquele pagamento.
- **API sem versão nem contrato:** schemas tolerantes e a entrega crua sempre
  gravada antes da validação.
- **Link que não expira:** cancelar é só interno. Pagamento num link cancelado
  entra registrado, com alerta, para decidir entre estorno e baixa.
- **LGPD:** nome, e-mail e telefone do cliente vão para a InfinitePay para
  pré-preencher o checkout — e, pelo spike, ficam legíveis dentro da URL do
  link. É opcional na API; dá para desligar se preferir.
- **Taxa e prazo de recebimento** não aparecem no sistema: o Financeiro registra
  o bruto.

## Fora de escopo

Lembretes automáticos; vários lançamentos num link; taxa e valor líquido;
recorrência e assinatura; boleto; estorno pela API (não existe).

Ideias para depois: conciliação periódica (se o spike permitir), relatório de
recebimentos online (Pix × cartão, parcelas), mensagem de WhatsApp configurável
e link de teste em Configurações.
