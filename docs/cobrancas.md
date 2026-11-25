# Cobranças: régua de avisos em volta do link da InfinitePay

> **Status:** plano aprovado em 2026-11-05 (as oito decisões com o usuário e as
> "Decididas no plano", sem veto). **Fase 0 feita em 2026-11-23:** o webhook
> entrega. **Fases 1 e 2** na `release/cobrancas` (PRs #84 e #85; migrations 95 e 96
> aplicadas, testadas). **Fase 3** na `release/cobrancas` (PR #86; migration 97
> aplicada, testada com Pix real). **Fase 4** em `feat/cobrancas-mensalidades`
> (migration 98 aplicada, testada na tela). As migrations 91 a 94 foram usadas por outros
> módulos: as deste plano começam na **95**.
> **Base:** as fases saem da `main`, em `release/cobrancas`.
> **API relida em 2026-11-05:** a documentação do checkout mudou desde a leitura
> de outubro, e `docs/integracao-infinitepay.md` ficou desatualizada nesses
> pontos. Ver "A API hoje".

A InfinitePay tem a **Gestão de Cobrança**, mas ela não tem API. A ideia é ter o
equivalente dentro do app: o lançamento vira uma cobrança, o cliente recebe os
avisos sozinho, o valor se atualiza depois do vencimento e o escritório vê quem
foi avisado, quem abriu e quem pagou. O dinheiro continua passando pelo checkout
da InfinitePay (`docs/integracao-infinitepay.md`).

## Decisões

| Tema | Escolha | Consequência |
|---|---|---|
| WhatsApp | **API oficial da Meta, com fila manual até ela estar pronta** | Fila do dia com 1 clique na fase 2; envio sozinho na fase 5. Evolution API descartada: pode banir o número |
| Limites da API | **Ficam de fora:** débito automático no cartão, Pix Automático, boleto | O cliente sempre paga pelo link. Sem gateway novo |
| Desconto no Pix | **Entra na fase 3**, configurável por cobrança | Revisto em 2026-11-05: a primeira resposta partiu da informação errada de que a API não permitia |
| Recorrência | **Mensalidade por cliente** | Sem planos, sem link de inscrição, sem valor proporcional |
| Multa e juros | **Só se o contrato prever** | Desligados por padrão. Contrato ganha os campos; parcelas herdam; dá para definir por cobrança |
| O que entra na régua | **Escolha por lançamento** | Botão "Cobrar automaticamente", ação em lote e opção na prévia do contrato. As receitas pendentes de hoje não começam a receber sozinhas |
| Calendário | **Ao criar; 7 e 2 dias antes; no dia; 2, 7 e 15 dias depois** | Depois da última etapa para e avisa no sino. Dias editáveis em Configurações |
| E-mail | **Depois de registrar um domínio** | Até lá, só WhatsApp. Provedor sugerido: Resend |
| Número do WhatsApp | **Em aberto** | Precisa estar decidido antes da fase 5. A fila manual não depende disso |
| Clique sem confirmação | **Aviso no sino depois de 24 h, sem pausar a régua** (2026-11-23, depois da fase 0) | A causa da falha de outubro segue desconhecida; o aviso cobre uma volta dela |

### Decididas no plano (valem salvo veto)

| Tema | Escolha | Por quê |
|---|---|---|
| Link enviado | **Sempre o nosso** (`/pagar/<token>`), nunca o da InfinitePay | Ver "A peça central" |
| Tela | **Aba "Cobranças" no Financeiro**, ao lado de Lançamentos e Êxitos | O dado é o lançamento; módulo próprio duplicaria filtros e permissões |
| Modelo | **Camada sobre o lançamento**, não cadastro paralelo | Mesmo critério do êxito: A receber, dashboard e contrato continuam sendo a soma dos lançamentos |
| Encargos na baixa | **Lançamento próprio, categoria nova "Encargos"**, ligado ao original | O original não muda de valor: a trava da migration 67 e a conferência do contrato (`contractEntries.ts`) seguem certas, e todo número continua sendo soma de linhas |
| Cálculo | Multa uma vez, a partir do dia seguinte ao vencimento; juros simples por dia corrido; arredondamento em centavos, numa função pura | A mesma conta na tela, na página e na mensagem |
| Vencimento em dia sem expediente | **Sem encargo até o próximo dia útil** (`lib/prazos/feriados.ts`) | Feriados locais não entram, como em `calcular_prazo` |
| Horário | **Às 9h de Brasília**, sem domingo nem feriado nacional | Passa para o próximo dia útil. Etapas acumuladas viram uma só, a mais recente |
| Atraso | Cliente sempre pode pagar depois do vencimento | Para encerrar, cancela-se a cobrança |
| Descrição | **Campo "como o cliente vê"**, padrão "Honorários advocatícios" (com "parcela 2/6") | A descrição interna pode citar o caso, e a mensagem passa pela Meta, pelo provedor de e-mail e pelo celular de quem estiver por perto. Nunca sai CNJ nem nome da ação |
| Quem recebe | Contato principal do cliente (`pickClientPhone`), com troca por cobrança | Sem contato válido, a cobrança marca o problema em vez de falhar calada |
| Parar de receber | **Opção por cliente:** "não enviar lembretes" | A Meta exige consentimento para mensagens, e é a saída para quem pedir |
| Texto | Modelos fixos com variáveis | Na API oficial cada modelo passa por aprovação da Meta. O usuário revisa antes de enviar para aprovação |
| Desconto no Pix: validade | **Só até o vencimento.** Depois valem multa e juros, se houver | Desconto e encargo no mesmo pagamento confundem o cliente e a conta |
| Desconto no Pix: registro | Na baixa, `amount` passa a ser o valor recebido e `discount_amount` guarda a diferença | Mantém "Recebido" como soma de linhas. A conferência do contrato soma os dois, e a trava da migration 67 ganha essa exceção |
| Permissões | Ver e operar com `financeiro`; RLS só leitura; servidor grava | Padrão da migration 67 |

## O que a Gestão de Cobrança faz, e como fica aqui

| Na InfinitePay | Aqui | Fase |
|---|---|---|
| Cobrança com cliente, valor, vencimento, descrição | Lançamento + "Cobrar automaticamente" | 1 |
| Link com Pix ou cartão em até 12x | `/pagar/<token>` que leva ao checkout | 1 |
| Avisos ao criar, antes, no dia e depois | Régua | 2 |
| Avisos por WhatsApp e e-mail | Fila manual → API oficial; e-mail | 2, 5, 6 |
| Pendente, atrasada, paga, cancelada | Situação derivada, nunca gravada | 2 |
| Quando foi notificado, viu e pagou | Linha do tempo da cobrança | 2 |
| Painel único e histórico por cliente | Aba Cobranças; aba Financeiro do cliente | 2 |
| Multa e juros | Contrato → parcela → cobrança | 3 |
| Desconto por meio de pagamento | `options.discounts`, só no Pix | 3 |
| Cobrança recorrente | Mensalidades | 4 |
| Gráficos de faturamento | O Financeiro já tem | — |
| Parcelas e repasse de taxas | Até 12x, sem limite por link; repasse no app, ou por link com `assured_installments` se fizer falta | — |
| Planos, link de inscrição, valor proporcional | Fora, por decisão | — |
| Importação por CSV | Fora: os clientes já estão no app | — |
| Débito no cartão, Pix Automático, boleto | A API não permite | — |

## A API hoje (relida em 2026-11-05)

Muda em relação à leitura de 2026-10-06:

| Recurso | O que a documentação diz | Uso no plano |
|---|---|---|
| API Key | `X-Api-Key: inchk_…`, criada nas Configurações do Checkout, aparece uma vez, até 5 ativas. Opcional para criar link, **exigida para `options`** | `INFINITEPAY_API_KEY`, só no servidor. O usuário cria antes da fase 1 |
| `options.single_payment` | O link conclui um pagamento e bloqueia novas tentativas. Sem ele, aceita mais de um | Todo link novo |
| `options.valid_until` | ISO 8601, no futuro, até 1 ano. Sem ele, nunca expira | Todo link novo, até o fim do dia seguinte |
| `options.discounts` | Percentual por meio (`pix`, `credit_card`), maior que 0 e menor que 100 | Fase 3, só `pix` |
| `options.payment_methods_enabled` | Pix liga e desliga; cartão fica sempre ligado | Sem uso |
| `options.assured_installments` | De 0 a 12: até quantas parcelas o vendedor absorve a taxa | Sem uso |
| Objeto `webhook` | `url` e `events`: `created`, `paid`, `settled`, `canceled`, `refunded`, `payment_failed`. O `webhook_url` segue como formato simples, só para aprovado | Depende da fase 0. `refunded` poderia registrar estorno sozinho, mas o corpo não está documentado |
| Valor mínimo | R$ 1,00 por pagamento | Validar ao criar a cobrança |

**Continuam sem existir:** cancelar ou editar link, listar links, consultar por
`order_nsu` ("só o order_nsu não basta"), estorno pela API, cobrança recorrente,
tokenização de cartão, sandbox.

**A página não informa:** se a URL do webhook aceita query string; número e prazo
das reentregas; o que o cliente vê num link vencido ou já usado; o corpo da
resposta de `/links`; como o valor com desconto volta no `payment_check`.

## A peça central: `/pagar/<token>`

O link da InfinitePay tem preço fixo e não pode ser cancelado nem editado. A
mensagem precisa de um endereço que continue valendo enquanto o valor muda, então
ela nunca leva esse link, e sim uma página nossa, sem login:

```
Mensagem → /pagar/<token> → mostra o valor de hoje e a composição
                          → "Pagar" → gera o link com esse valor → checkout
```

O que isso resolve:

| Problema de hoje | Com a página |
|---|---|
| Multa e juros não cabem num link de preço fixo | O link nasce no clique, com o valor do dia |
| Mensagem antiga pode virar pagamento em dobro | A página mostra "pago", e o link nasce com `single_payment` |
| Cobrança cancelada continua pagável pela mensagem | A página diz que não está mais disponível, e o link já aberto vence em `valid_until` |
| Dados do cliente legíveis na URL encaminhada (`lenc`) | A mensagem só leva o token |
| Não dá para saber se o cliente abriu | A página registra a abertura e o clique |

Cuidados:

- **Pré-visualização do WhatsApp abre o link sozinha.** "Abriu" só conta por um
  POST feito pela página já renderizada, nunca pelo GET. O GET não gera link,
  não grava nada e não coloca dados nas meta tags.
- **Token:** 256 bits, base64url, e o banco guarda só o SHA-256, como em
  `lib/clientPortal/token.ts`. Só que a régua precisa remontar a URL a cada
  aviso: o token é derivado por HMAC do id da cobrança com um segredo do
  servidor. Um dump do banco continua sem dar link utilizável.
- **O que a página mostra:** nome do escritório, descrição para o cliente, valor,
  composição e vencimento. Nada de CPF nem de processo. A página leva `noindex`
  e limite de pedidos por token.
- **Link novo:** sempre com `single_payment` e `valid_until` no fim do dia seguinte
  (Brasília), para quem abre perto da meia-noite não perder o checkout. No mesmo
  dia, a página reaproveita o link aberto, se o valor não mudou.
- **Link superado:** quem abriu o checkout ontem e pagou hoje, ainda no prazo,
  pagou um valor que nós oferecemos. Ganha status próprio (`superseded`) e **dá
  baixa** com o valor daquele link, com aviso no sino se ficou abaixo do valor do
  dia. Hoje, pagamento em link `canceled` não dá baixa (`confirm.ts`), e isso
  continua.

## O risco que vem antes de tudo: o webhook

Lembrete para quem já pagou é o pior erro possível deste módulo. Até 2026-11-23
ele podia acontecer:

- `webhook_events` não tinha **nenhuma** entrega da InfinitePay (563 do
  BuscaProcessos, 2 da D4Sign). A amostra era de **1 pagamento real**, em outubro,
  com baixa pelo retorno do cliente.
- Quem paga e fecha a aba antes de "Continuar" fica sem baixa, e a API não permite
  conciliar por consulta: `payment_check` exige `transaction_nsu` e `slug`, que só
  chegam pelo webhook ou pelo retorno.

A fase 0 mostrou que o webhook entrega (ver lá). Ficam:

- toda mensagem depois do vencimento diz "se já pagou, desconsidere";
- a tela tem "Já pago na InfinitePay", que cancela o link e dá a baixa manual num
  clique (as travas da migration 67 exigem os dois passos);
- **clique em "Pagar" sem confirmação em 24 h vira aviso no sino**, sem pausar a
  régua (fase 2, que já registra o clique).

## Modelo de dados (rascunho)

Os nomes valem como proposta: conferir o catálogo antes de cada migration.

| Tabela | Campos principais | Fase |
|---|---|---|
| `billings` (nova) | `financial_entry_id` único; `token_hash`; `client_description`; `reminders_enabled`, `paused_at`, `canceled_at`; contato escolhido; `viewed_at`, `checkout_clicked_at` | 1 |
| `billing_messages` (nova) | `billing_id`; `step` (`created`, `d-7`, `d-2`, `d0`, `d+2`…, `paid`); `channel`; `status` (`pending`, `sent`, `delivered`, `read`, `failed`, `skipped`, `manual`); id no provedor; datas e erro. Único em (`billing_id`, `step`, `channel`): é o que impede aviso repetido | 2 |
| `office_settings` | `billing_reminder_offsets` (padrão `{-7,-2,0,2,7,15}`) | 2 |
| `clients` | `billing_reminders_opt_out` | 2 |
| `contracts` | `late_fee_percent`, `monthly_interest_percent` | 3 |
| `billings` | Os mesmos dois percentuais, copiados ao criar; `pix_discount_percent` | 3 |
| `payment_charges` | `principal_cents`, `late_fee_cents`, `interest_cents`, `pix_discount_percent`; status `superseded`. O índice de "um link vivo" continua | 3 |
| `financial_entries` | Categoria `encargos`; `parent_entry_id`; `discount_amount` | 3 |
| `billing_series` (nova) | Cliente, valor, descrição, frequência, dia, início e término, pausa | 4 |

**Situação da cobrança**, derivada numa função só, como `getFinancialSituation`:
Agendada · Vence hoje · Atrasada · Paga · Pausada · Régua encerrada · Cancelada.

**Motor da régua:** cron próprio às 9h (`/api/cron/cobrancas`, com `CRON_SECRET`
como `/api/cron/diario`). Idempotente pelo índice único. Se um dia falhar, no dia
seguinte sai só a etapa mais recente, nunca uma rajada. Ligar a régua numa cobrança
já perto do vencimento pula as etapas passadas. Mudar o vencimento recalcula as
etapas futuras. Conferir o limite de crons do plano da Vercel; o Hobby varia o
horário dentro da hora.

## Mensagens (rascunho para revisão)

| Etapa | Texto |
|---|---|
| Ao criar | Olá, {nome}! {escritório} registrou {descrição}, no valor de {valor}, com vencimento em {data}. Para pagar: {link} |
| Antes | Olá, {nome}! Lembrete: {descrição}, de {valor}, vence em {data}. Para pagar: {link} |
| No dia | Olá, {nome}! {descrição}, de {valor}, vence hoje. Para pagar: {link} |
| Depois | Olá, {nome}! {descrição} venceu em {data}. Se já pagou, desconsidere. Para pagar com o valor atualizado: {link}. Dúvidas: {telefone} |
| Pago | Recebemos o pagamento de {descrição}, de {valor}. Obrigado! Comprovante: {link} |

## Fases

Cada fase é um PR na base `release/cobrancas`, com um PR final para a `main`.
Verificação com `tsc`, lint, build, loader do Node e navegador, sem testes no repo.
Antes de escrever rotas e `searchParams`, ler `node_modules/next/dist/docs/`.

### Fase 0: testar o webhook (feita em 2026-11-23)

Três Pix de R$ 1,00 pagos pelo usuário. A conta configurada em produção passou a
ser a do escritório (`cordeiroverlyadv`), e o usuário pediu para não mexer nela:
os três links nasceram por script na conta pessoal dele (`leonardo-malini-vxy`),
sem cobrança no banco, com o aviso apontado para a rota de produção. A rota grava
toda entrega que chega, válida ou não.

| Link | O que testa | Chegou (UTC) |
|---|---|---|
| A | `webhook_url` com `?t=`, o formato do app | 13:46:55 |
| B | `webhook_url` sem query string | 13:47:46 |
| C | Objeto `webhook` com `created` e `paid` | `created` 13:48:12, `paid` 13:48:42 |

**Resultado: "A chega".** O formato de hoje funciona, e a fase 1 não muda o
webhook. A pausa da régua saiu do plano; no lugar dela, o aviso de 24 h. Todas as
entregas ficaram `unmatched` (sem cobrança para o `order_nsu`), como esperado.

O que se aprendeu:

- O remetente se identifica como `InfinitePay/EcommerceWebhooks`, em JSON.
- `webhook_url` vira `webhook: { url }` dentro do `lenc`, sem `events`.
- No objeto, o corpo ganha `event_type` (`created`, `paid`) e `invoice_type`
  (`external_checkout`). O `created` vem sem `transaction_nsu` nem
  `paid_amount`: a rota o grava como `invalid`, mas rotula toda entrega como
  `pagamento_aprovado`. Se um dia adotarmos o objeto, ler o `event_type`.
- A primeira entrega levou 880 ms na rota, perto do 1 s que a InfinitePay pede
  (provável partida a frio). Acima disso ela reenvia, e a baixa é idempotente.
- **Não explica outubro:** mesma conta e mesmo formato. Algo mudou do lado de lá,
  ou foi falha isolada.
- **Não cobriu a baixa pelo webhook** (não havia cobrança no banco): fica para o
  teste da fase 1, com a conta pessoal só no dev.

### Fase 1: a cobrança e a página de pagamento (migration 95)

**Precisa do usuário:** criar a API Key e colocar `INFINITEPAY_API_KEY` no `.env`
local e na Vercel.

`billings`, `/pagar/<token>` pública, rota que gera o link no clique, com
`single_payment` e `valid_until`, abertura e clique registrados. "Gerar link" no
Financeiro, no dashboard, no Assistente (`screenActions.ts`) e no portal
(`PortalPayments.tsx`) passa a oferecer a nossa URL. Links antigos continuam
funcionando. Campo "como o cliente vê". Valor mínimo de R$ 1,00. O que a fase 0
mostrar sobre o webhook entra aqui.

**Pronto quando:** um pagamento real sai da página e dá baixa, reabrir a página
mostra "pago" sem oferecer checkout, e está medido o que o cliente vê ao reabrir
o link usado.

#### Como ficou (2026-11-23, branch `feat/cobrancas-pagina`, sem commit)

| Peça | Onde | O que faz |
|---|---|---|
| Migration 95 | `20260101000095_billing_payment_page.sql` | `billings` (1:1 com o lançamento, `token_hash`, `client_description`, abertura, clique, encerramento; RLS só leitura); `payment_charges` ganha `expires_at`, `single_payment` e o status `superseded`; a trava da 67 deixa de contar link vencido como vivo |
| Token | `lib/billing/token.ts` | HMAC do id da cobrança com o segredo-raiz do portal (`info` próprio); o banco guarda o SHA-256. Trocar `CLIENT_PORTAL_SECRET` (ou a service_role, se ele estiver vazio) tira do ar os links enviados |
| Cobrança | `lib/billing/billings.ts`, `/api/financeiro/lancamentos/<id>/cobranca` (GET, POST, PATCH) e `/encerrar` | Pôr no ar, religar a encerrada com a mesma URL, trocar a descrição, encerrar. Regras: receita, pendente, a partir de R$ 1,00, conta configurada |
| Página | `/pagar/<token>`, `/api/pagar/<token>` e `/checkout` | Pública. A abertura conta por POST da página renderizada; o escritório logado não conta. "Pagar" reaproveita o link do dia, senão aposenta o anterior (`superseded`) e gera outro. Limite de 5 links por 10 min |
| Link | `lib/infinitepay/charges.ts` (`createChargeLink`) | Com `INFINITEPAY_API_KEY`: `X-Api-Key`, `single_payment` e `valid_until` no fim do dia seguinte. Sem ela, como antes. A chave não vai para o `payment_check` |
| Baixa | `confirm.ts` | `superseded` pago dá baixa, como `open` |
| Desenvolvimento | `lib/infinitepay/handle.ts` | `INFINITEPAY_DEV_HANDLE` troca a conta só no `next dev`; a URL da página usa a origem local |
| Telas | `PaymentLinkSection`, `FinanceCard`, portal, Assistente, Configurações | O detalhe mostra o link da página, o que o cliente fez, "Como o cliente vê" e "Encerrar"; o dashboard lista as cobranças no ar; o portal leva à página; o Assistente devolve a URL da página; Configurações mostra a chave e a conta de desenvolvimento |

Removido: a rota `/api/financeiro/lancamentos/<id>/link-pagamento` (o link agora nasce no
clique do cliente). Links da InfinitePay de antes da página continuam aparecendo e
funcionando.

Decidido na implementação (vale salvo veto):

- **Encerrar** cancela o checkout aberto; o que estava sendo gerado vira `failed` (a
  migration 67 não aceita cancelado sem URL). O mesmo vale para o "Cancelar" de link
  travado, que falhava sempre por isso.
- **O sino** do pagamento mostra a descrição que o cliente vê: é ela que vai no checkout.
- **Abaixo de R$ 1,00** não há cobrança (a InfinitePay recusa): o êxito a apurar fica de
  fora sozinho.

Verificado: `tsc`, lint e build; 36 verificações das funções puras e 41 do fluxo de
clique contra banco e InfinitePay simulados; os seis estados da página no navegador,
inclusive no celular; a página abre sem sessão, e as rotas do escritório não.

**Teste ponta a ponta (2026-11-23):** migration 95 aplicada pelo usuário e conferida
no catálogo. No `next dev`, com `INFINITEPAY_DEV_HANDLE` na conta pessoal e sem API
Key, o usuário criou uma receita de R$ 1,00, gerou o link, abriu numa janela anônima,
pagou por Pix e fechou a aba sem "Continuar". No banco:

| Momento (UTC) | O quê |
|---|---|
| 14:50:36 | Cobrança no ar, "Honorários advocatícios" |
| 14:50:55 | Aberta pelo cliente (janela sem sessão) |
| 14:51:05 | Clique em "Pagar"; link de R$ 1,00 na conta pessoal, sem validade (sem chave) |
| 14:52:30 | Aviso da InfinitePay na rota de **produção**, token válido, `processed` |
| 14:52:31 | `payment_check` confirmou; transação Pix, `confirmed_via: webhook` |
| 14:52:32 | Lançamento pago; aviso "Pagamento recebido" no sino |

Reabrir o link sem sessão mostra "pago" com o recibo, e clicar em "Pagar" de novo
devolve "pago" sem gerar outro link (continua 1 link para o lançamento). É a primeira
baixa pelo aviso da InfinitePay, que a fase 0 não tinha coberto.

Observado:

- **A rota do aviso levou 3,7 s** para gravar a entrega (provável partida a frio na
  Vercel), acima do 1 s que a InfinitePay pede. Não houve reenvio desta vez. Se
  virar problema: responder antes de consultar a cobrança.
- **O nome do escritório está vazio** em `office_settings`: a página sai sem a linha
  de quem cobra. Preencher em Configurações → Escritório.

**Não verificado:** o que o cliente vê ao reabrir um checkout já usado, com
`single_payment` (precisa de uma API Key; o teste foi sem); a tela do escritório
logada não foi aberta por mim.

Antes do deploy: aplicar a migration 95; criar a API Key na conta do escritório e pôr
`INFINITEPAY_API_KEY` na Vercel. Para o teste ponta a ponta no dev: `INFINITEPAY_DEV_HANDLE`
e, se quiser as opções, uma API Key da mesma conta pessoal no `.env` local.

### Fase 2: régua, fila e aba Cobranças (migration 96)

`billing_messages`, cron, "Cobrar automaticamente" (formulário, lote, prévia do
contrato), opção de não receber, configuração dos dias. Aba Cobranças com a **fila
do dia**: abre o WhatsApp com a mensagem pronta e registra como `manual`, sem
fingir que foi entregue. Colunas: cliente, valor de hoje, vencimento, situação,
último aviso, abriu, próxima etapa; ações pausar, retomar, reenviar, copiar link,
"Já pago na InfinitePay". Linha do tempo no detalhe, histórico no cliente, avisos
no sino. **Aqui o módulo já serve no dia a dia, sem nenhuma conta nova.**

**Pronto quando:** uma cobrança de teste percorre as etapas (datas simuladas no
Node), cada aviso aparece uma vez só, e a baixa tira a cobrança da fila.

#### Como ficou (2026-11-23, branch `feat/cobrancas-regua`, sem commit)

| Peça | Onde | O que faz |
|---|---|---|
| Migration 96 | `20260101000096_billing_reminders.sql` | `billings` ganha lembretes ligados, início, pausa, telefone próprio e o controle dos avisos no sino; `billing_messages` com índice único por etapa e vencimento (`resend` fora dele); `office_settings.billing_reminder_offsets`; `clients.billing_reminders_opt_out` |
| Régua | `lib/billing/schedule.ts` | Puro: etapas, domingo e feriado nacional para frente, uma por dia, acumuladas viram a mais recente, situação da cobrança |
| Mensagens | `lib/billing/messages.ts` | Os modelos do plano; sem nome do escritório, "Registramos" |
| Painel | `lib/billing/panel.ts`, `GET /api/financeiro/cobrancas/painel` | Todas as cobranças com a régua de hoje, a URL e o checkout vivo |
| Comandos | `lib/billing/reminders.ts`; `PATCH`/`POST` da cobrança, `/cobrancas/avisos`, `/avisos/<id>`, `/cobrancas/lote` | Ligar (exige vencimento), pausar, telefone, cliente que não recebe, registrar `manual`/`skipped` (clique duplo devolve o primeiro), desfazer em 12 h só o próprio, lote |
| Aba Cobranças | `BillingsPanel`, `ReminderActions` (`?aba=cobrancas`) | Fila do dia (WhatsApp, Copiar, Pular, com Desfazer), lista com situação e filtros, Pausar/Retomar, Mandar de novo, "Já pago na InfinitePay", lote das receitas fora da régua |
| Detalhe | `BillingReminders` | Ligar e desligar, aviso de hoje, próximo, pausa, telefone, cliente que não recebe, histórico |
| Entradas | Formulário, prévia do contrato, gerar link no detalhe | "Cobrar automaticamente" junto com o link |
| Ajustes | `BillingReminderSettingsCard` em Configurações → Pagamentos | Os dias da régua (até 10, de 15 antes a 30 depois) |
| Sino | `lib/billing/routine.ts` no `/api/cron/diario` | Fila do dia (uma vez por dia), clique sem pagamento em 24 h, régua encerrada; roda antes dos passos de IA |

Decidido na implementação (vale salvo veto):

- **A fila é calculada na hora**, não criada pelo cron: funciona no dev e não depende
  de o cron ter rodado. O cron só avisa no sino; na fase 5 ele passa a mandar.
- **O sino usa o cron diário de hoje (7h)**, e não um cron novo às 9h: nesta fase
  ninguém recebe nada sozinho. O horário das 9h volta com o envio automático.
- **"O cliente não quer receber"** fica no detalhe da cobrança, e não no cadastro do
  cliente; vale para todas as cobranças dele.
- **O lote** fica na aba Cobranças ("Receitas fora da régua"); a lista de lançamentos
  não ganhou seleção.
- **Sábado pode ter aviso**; domingo e feriado nacional, não (como no plano).
- **"Já pago na InfinitePay"** cancela o checkout vivo e dá a baixa com a data de hoje.

Verificado: `tsc`, lint dos arquivos alterados e build; 48 verificações novas no Node
(régua, mensagens, painel, comandos e a rotina do cron contra banco simulado) e as 77
da fase 1 de novo; a aba no navegador com dados simulados.

**Teste logado (2026-11-23, migration 96 aplicada e conferida no catálogo):** com uma
receita de teste de R$ 1,00 sem cliente, vencendo no dia (apagada no fim, com a
cobrança e os avisos pelo cascade):

- "Cobrar automaticamente" no formulário liga a régua; o aviso de hoje é "no dia do
  vencimento" (criação e vencimento no mesmo dia: vale a mais recente), o próximo,
  2 dias depois;
- Copiar mensagem registra; Mandar de novo registra `resend`; Desfazer apaga o
  registro; Pausar e Retomar; telefone inválido recusado, válido vira o destino do
  WhatsApp (`wa.me/55…` com a mensagem e o link `/pagar/`);
- trocar os dias em Configurações muda o próximo aviso na hora (voltou ao padrão
  depois); "Já pago na InfinitePay" dá a baixa com a data de hoje.

Corrigido no teste:

- **"Desfazer" inclicável com modal aberto**: o Radix põe `pointer-events: none` no
  body e o toast herdava; o clique ia para o overlay e fechava o modal. Agora o
  `Toaster` aceita clique e `Dialog`/`Sheet` não fecham com clique num toast (vale
  para o app todo).
- O aviso do "Desfazer" dura 10 s (é o único lugar dele) e diz "o registro foi
  apagado" (o reenvio não volta para fila nenhuma).
- O status `manual` aparecia como "Aberto no WhatsApp" também para a mensagem
  copiada; virou "Feito à mão".
- Excluir, editar ou dar baixa no lançamento não atualizava a aba Cobranças.
- O ícone do sino quebrava sozinho numa linha acima do texto da régua.

Observado: no `next dev`, a primeira compilação de uma rota nova chegou a travar até a
gravação do cache do Turbopack terminar (87 s); não é do código.

**Não verificado:** o cron em produção (os avisos no sino); WhatsApp com cliente
cadastrado; o lote e a prévia do contrato com dados reais (não há receita pendente na
base).

### Fase 3: multa, juros e desconto no Pix (migration 97)

**Medido em 2026-11-23** (conta pessoal, link de R$ 1,20 com `options.discounts`
`{ "pix": 10 }`, `single_payment` e `valid_until`; sem cobrança no banco, a entrega
ficou `unmatched`): o checkout abre em R$ 1,20 e mostra R$ 1,08 (desconto de R$ 0,12)
ao escolher Pix. Pago por Pix:

| Onde | `amount` | `paid_amount` | Outros |
|---|---|---|---|
| Webhook | 120 | 108 | `capture_method: pix`; o corpo devolve `options.discounts` |
| `payment_check` (sem chave) | 120 | 108 | `success` e `paid` `true` |

`amount` continua sendo o preço cheio do link e o desconto só aparece em
`paid_amount`. A regra 2 de `confirm.ts` (preço do link = valor da cobrança) segue
valendo; o que muda é aceitar `paid_amount` menor só em Pix de link com desconto. Com
opções, a URL do checkout vem curta, sem `lenc`.

O plano original começava medindo: um Pix real com desconto, para ver como o valor volta no
`payment_check`. A baixa de hoje exige `paid_amount >= amount` e recusaria esse
pagamento, então a regra passa a aceitar o valor com o desconto gravado na própria
cobrança. Cartão num link com desconto só no Pix continua pedindo o valor cheio.

Campos no contrato e no formulário, leitor de contratos, herança nas parcelas,
função pura de cálculo, composição na página, `superseded`, lançamento de Encargos
e `discount_amount` na baixa e no estorno, conferência em `contractEntries.ts`.

**Pronto quando:** um atraso mostra a conta na página, o pagamento gera o principal
e os Encargos, um Pix até o vencimento paga com desconto e dá baixa, a conferência
do contrato não acusa diferença, e o estorno desfaz tudo.

#### Como ficou (2026-11-24, branch `feat/cobrancas-encargos`, sem commit)

| Peça | Onde | O que faz |
|---|---|---|
| Migration 97 | `20260101000097_billing_late_charges.sql` | Percentuais em `contracts` e `billings` (+ desconto no Pix); composição do link em `payment_charges` (soma conferida; desconto e encargo nunca juntos); categoria `encargos`, `parent_entry_id` (um por original) e `discount_amount` em `financial_entries`; a trava aceita a troca valor → desconto só da `service_role` e com a soma igual, e passa a vigiar `discount_amount` |
| Conta | `lib/billing/lateCharges.ts` | Pura, em centavos: folga até o dia útil (`businessDayOnOrAfter`, sem recesso), multa uma vez, juros de 1/30 do mensal por dia corrido desde o vencimento, desconto só sem encargo; confere o Pix com desconto (±1 centavo) |
| Link | `checkout.ts`, `charges.ts` | Preço do dia; `options.discounts.pix` só com API Key; grava a composição; o link do dia só é reaproveitado com o mesmo desconto |
| Baixa | `confirm.ts` | Pix com desconto: `amount` = recebido, `discount_amount` = diferença; desconto não previsto dá baixa e alerta; multa e juros viram o lançamento de Encargos, pago, ligado ao original (reentrega não duplica; reprocessar completa) |
| Estorno | `refundTransaction` | Apaga os Encargos e devolve o desconto ao valor |
| Cobrança | `billings.ts`, PATCH `terms`, `BillingTerms` | Herda multa e juros do contrato ao nascer; o detalhe mostra o valor de hoje e troca os três percentuais |
| Página | `BillingPayPage` | Composição depois do vencimento; "No Pix, R$ X" antes |
| Aba e mensagem | `BillingsPanel`, `messages.ts` | Valor de hoje com o original embaixo; depois do vencimento, "Com multa e juros, hoje fica R$ X"; antes, o preço no Pix |
| Contrato | form, detalhe, importação, leitor (`multa_percentual`, `juros_mensal_percentual`) | Os dois campos, em honorários; o Assistente cria sem eles |
| Financeiro | detalhe, card do pagamento, resumo | Desconto e link do Encargos para o original; "Pago via Pix" mostra o que o cliente pagou; Encargos contam em "pela InfinitePay"; a conferência do contrato soma o desconto e ignora Encargos |

Decidido na implementação (vale salvo veto): juros desde o vencimento original, 1/30 do
mensal por dia; o desconto vale na mesma folga; Encargos também podem ser escolhidos à mão
no formulário; o Assistente não cria contrato com multa e juros.

Verificado: `tsc`, lint e build; 52 verificações no Node (conta, mensagens, link, baixa,
estorno, conferência) e as 125 das fases 1 e 2; `auth.role()` existe no banco. **Teste
real (2026-11-24)**, migration 97 aplicada e conferida, num `next dev` na 3002 com
`APP_PUBLIC_URL=http://localhost:3002` (sem webhook: a baixa vem do "Continuar", pelo
código desta branch, e não da produção):

| Receita | Link | Pago | Resultado |
|---|---|---|---|
| R$ 1,00, venceu 18/11, multa 10%, juros 30% a.m. | 116 = 100 + 10 + 6 | Pix R$ 1,16 | Original pago com R$ 1,00; Encargos de R$ 0,16 pago, ligado |
| R$ 1,20, vence 30/11, Pix 10% | 120, `discounts.pix: 10` | Pix R$ 1,08 | Pago com R$ 1,08 e desconto R$ 0,12 (a trava aceitou a troca) |

O estorno registrado nas duas voltou a pendente com o valor original e apagou os Encargos.
As receitas de teste foram excluídas; os dois links e as transações estornadas ficam sem
lançamento, como em qualquer exclusão depois de pagamento.

Corrigido no teste: "Pago via Pix" mostrava o preço do link e não o pago; Encargos não
entravam em "pela InfinitePay".

**Não verificado:** a baixa pelo webhook, que é o mesmo `confirmPayment` do retorno mas
roda na produção. Até o deploy, a produção não gera link com desconto nem com encargo;
só um link gerado por esta branch no `next dev` comum (aviso indo para a produção) daria
baixa lá sem gravar o desconto ou sem criar os Encargos. Também não: a importação de um
contrato com multa e juros pela IA, e a herança do contrato na tela (coberta no Node).

### Fase 4: mensalidades (migration 98)

`billing_series`, tela de criar e pausar. O cron materializa o próximo lançamento
com antecedência, como a recorrência da Agenda, e cada um entra na régua. Editar a
série não reescreve os já criados.

**Pronto quando:** uma mensalidade gera o ciclo seguinte uma vez só, inclusive com
dia 31 em mês curto (`addMonthsISO`), e o Financeiro mostra só os ciclos gerados.

#### Como ficou (2026-11-24, branch `feat/cobrancas-mensalidades`, sem commit)

| Peça | Onde | O que faz |
|---|---|---|
| Migration 98 | `20260101000098_billing_series.sql` | `billing_series` (cliente, descrição interna e para o cliente, valor ≥ R$ 1,00, primeiro vencimento, fim opcional, `generate_from`, lembretes, multa, juros, desconto, pausa, encerramento; RLS só leitura); `financial_entries.billing_series_id` com índice único por série e vencimento |
| Ciclos | `lib/billing/series.ts` | Puro: vencimento = âncora + N meses (31/01 → 28/02 → 31/03), antecedência = máx(10, primeira etapa da régua). Gerar cria o lançamento (com o mês na descrição), põe a cobrança no ar, aplica os percentuais da série e liga os lembretes; o índice único segura a repetição; no máximo 3 por rodada |
| Cron | `routine.ts` | As mensalidades rodam antes da régua: o ciclo de hoje já entra na fila. Cobrança que não vai ao ar avisa no sino (`cobranca_mensalidade_sem_cobranca`), e o lançamento fica |
| Rotas | `/api/financeiro/mensalidades` (GET, POST), `/mensalidades/<id>` (PATCH) | Listar, criar (já gera o que couber), editar, pausar, retomar, encerrar |
| Tela | `BillingSeriesCard` na aba Cobranças | Lista com situação, dia, próximo vencimento e meses gerados; formulário de criar e editar |

Decidido na implementação (vale salvo veto):

- **Primeiro vencimento hoje ou depois**: meses passados não são cobrados de uma vez.
- **Cliente e dia não mudam** depois de criada: encerra-se e cria-se outra.
- **Editar vale para os próximos meses**; os gerados são lançamentos e não mudam.
- **Retomar não cobra os meses da pausa** (`generate_from` vai para hoje); encerrar
  mantém os gerados.
- **Mensalidade encerrada continua na lista**, como histórico; não há botão de excluir.
- A tela cria em Honorário; as rotas aceitam Custas, Perícia e Outros.
- A validação dos percentuais das rotas e a leitura do campo na tela viraram peças
  comuns (`schemas/billingTerms.schema.ts`, `utils/percentInput.ts`).

Verificado: `tsc`, lint e build; 43 verificações no Node (dia 31, bissexto, fim,
antecedência, uma vez por ciclo, rajada limitada, pausa, retomada, encerramento, edição,
lista, cron e falha da cobrança) e as 177 das fases 1 a 3. **Na tela (2026-11-24)**, com a
migration 98 aplicada e conferida: mensalidade de R$ 1,00 sem lembretes para um cliente
real, primeiro vencimento em 01/12; o ciclo de 12/2026 nasceu na hora com a cobrança no ar
("Honorários mensais — 12/2026"); editar para R$ 2,00 não mudou o ciclo gerado; pausar,
retomar e encerrar funcionaram. Os dados de teste foram apagados.

**Não verificado:** o cron gerando um ciclo em produção; uma mensalidade com lembretes
ligados chegando à fila do dia (coberto no Node).

### Fase 5: WhatsApp pela API oficial

**Precisa do usuário:** número decidido, conta verificada na Meta, modelos
aprovados. Envio pela Cloud API atrás da mesma interface da fila, webhook de status
(entregue, lido, falhou) com assinatura conferida, resposta automática se o número
for dedicado. Falha volta para a fila manual. Mensagem "Pago" só aqui e no e-mail.

**Pronto quando:** um aviso real chega ao celular de teste, a tela mostra entregue e
lido, e uma falha forçada volta para a fila.

### Fase 6: e-mail

**Precisa do usuário:** domínio registrado e DNS configurado. Resend (ou outro),
mesmos modelos, status de entrega.

**Pronto quando:** o aviso chega por e-mail com o nome do escritório, e uma falha de
entrega aparece na cobrança. As fases 5 e 6 trocam de ordem conforme o que ficar
pronto antes.

### Fase 7: Assistente e dashboard

Leitura e ações com card (ver atrasadas, ligar, pausar), atrasados no briefing
diário, inadimplência no dashboard. Nada envia sem confirmação.

## Custo estimado

| Item | Valor | Confiança |
|---|---|---|
| Mensagem de WhatsApp (utilidade) | R$ 0,04 a R$ 0,08 cada | **Baixa:** fontes de terceiros divergem, não consegui a tabela da Meta |
| Cobrança paga em dia (4 avisos + confirmação) | R$ 0,20 a R$ 0,40 | Deriva da linha acima |
| Cobrança que passa por toda a régua (7 avisos, mais a confirmação se pagar) | R$ 0,28 a R$ 0,64 | Deriva da linha acima |
| E-mail (Resend, plano gratuito) | R$ 0 até 3.000 por mês e 100 por dia | Média: terceiros concordam, não conferi na página deles |
| Taxa da InfinitePay | Não muda | — |

## Em aberto

1. **Por que o webhook não chegou em outubro.** A fase 0 não explica; o aviso de
   24 h cobre uma volta do problema.
2. **Número do WhatsApp**, antes da fase 5. Número atual: a coexistência parece
   permitir o mesmo número no app Business e na API, com as respostas no celular,
   mas só achei isso em fontes de fornecedores. Número novo: evita misturar cobrança
   e atendimento, mas precisa de resposta automática porque ninguém lê.
3. **Domínio de e-mail**, antes da fase 6.
4. **Preço e regras da Meta:** conferir a tabela oficial antes da fase 5. Um fornecedor
   cita mudança em outubro de 2026 na cobrança de modelos de utilidade dentro da janela
   de 24 horas; não confirmei.
5. **Texto das mensagens e percentuais de multa e juros:** decisão jurídica do
   escritório. O sistema aplica o que o contrato disser, sem conferir limite legal.

## Riscos

- **Pagamento que o sistema não vê:** ver "O risco que vem antes de tudo".
- **Links de antes da fase 1:** não têm `single_payment` nem `valid_until`, e a
  documentação diz que aceitam mais de um pagamento e nunca expiram. Um segundo
  pagamento vira transação com alerta, como hoje.
- **Cancelar é interno:** o link já gerado continua pagável até o `valid_until`.
- **API sem contrato nem sandbox:** valem os schemas tolerantes e a entrega crua
  gravada antes de validar.
- **Spam:** Meta pode limitar o número se muitos bloquearem. Régua por escolha, opção
  de não receber e texto objetivo são a defesa.

## Fontes (lidas em 2026-11-04 e 2026-11-05)

API: [documentação do checkout](https://www.infinitepay.io/checkout-documentacao),
relida em 2026-11-05. Ela não tem data nem changelog: conferir de novo antes de
cada fase que dependa dela.

InfinitePay: [Gestão de Cobrança](https://www.infinitepay.io/gestao-de-cobranca),
[como funciona](https://ajuda.infinitepay.io/pt-BR/articles/7263087-como-funciona-a-gestao-de-cobrancas),
[como vender](https://ajuda.infinitepay.io/pt-BR/articles/8442931-como-vender-com-a-gestao-de-cobrancas),
[cobranças recorrentes](https://ajuda.infinitepay.io/pt-BR/articles/11950179-como-criar-cobrancas-recorrentes),
[Planos e Recorrências](https://ajuda.infinitepay.io/pt-BR/articles/9232324-como-automatizar-cobrancas-com-o-planos-e-recorrencias),
[nova tela web](https://www.infinitepay.io/newsroom/infinitepay-lanca-nova-visualizacao-da-gestao-de-cobrancas-na-versao-web).
As páginas divergem nas frequências e nos dias dos avisos; o calendário acima segue o
artigo "como vender".

WhatsApp: [preços na documentação da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
(não lida na íntegra), [guia de preços no Brasil](https://hyperleap.ai/whatsapp-pricing-calculator-brazil),
[coexistência](https://articles.chakrahq.com/article/whatsapp-business-app-api-coexistence-202),
[Evolution × Cloud API](https://pasqualepillitteri.it/pt/news/12976/integrar-whatsapp-evolution-api-cloud-api-meta).
E-mail: [Resend](https://resend.com/pricing.md) (citado por terceiros, página não lida).
