# Cobranças: régua de avisos em volta do link da InfinitePay

> **Status:** plano aprovado em 2026-11-05 (as oito decisões com o usuário e as
> "Decididas no plano", sem veto). Nada implementado. A próxima migration é a
> **91**.
> **Base:** `release/financeiro` já entrou na `main` (PR #67). As fases saem da
> `main`, em `release/cobrancas`.
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

Lembrete para quem já pagou é o pior erro possível deste módulo, e hoje ele pode
acontecer:

- `webhook_events` não tem **nenhuma** entrega da InfinitePay (563 do
  BuscaProcessos, 2 da D4Sign). A amostra é de **1 pagamento real**, com baixa
  pelo retorno do cliente (conferido em 2026-11-04, só totais).
- Quem paga e fecha a aba antes de "Continuar" fica sem baixa, e a API não permite
  conciliar por consulta: `payment_check` exige `transaction_nsu` e `slug`, que só
  chegam pelo webhook ou pelo retorno.

**Em qualquer resultado:** toda mensagem depois do vencimento diz "se já pagou,
desconsidere"; e a tela tem "Já pago na InfinitePay", que cancela o link e dá a
baixa manual num clique (as travas da migration 67 exigem os dois passos).

**Se o webhook não vier:** quem clicou em "Pagar" e não teve confirmação **pausa a
régua** e gera aviso no sino ("abriu o pagamento em 12/11, conferir no app").
Protege o cliente, mas pausa também quem desistiu de pagar, e o escritório passa a
conferir à mão.

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

### Fase 0: testar o webhook (nada no repo)

Três Pix de R$ 1,00, com autorização do usuário em 2026-11-05. A rota grava toda
entrega que chega, válida ou não, então cada link responde a uma pergunta:

| Link | Como nasce | O que testa |
|---|---|---|
| A | Pela tela do Financeiro, fechando a aba sem "Continuar" | `webhook_url` com `?t=`, como hoje, até a baixa |
| B | Por script, sem cobrança no banco | `webhook_url` sem query string |
| C | Por script, sem cobrança no banco | Objeto `webhook` com `created` e `paid` |

| Resultado | Conclusão | O que muda |
|---|---|---|
| A chega | O fluxo funciona; outubro foi caso isolado | A pausa sai do plano |
| Só B e C chegam, ou só B | A query string é o problema | O token vai para o caminho da URL, na fase 1 |
| Só C chega | O formato simples não entrega | Os links passam a usar o objeto `webhook`, na fase 1 |
| Nenhum chega | Causa fora do nosso controle | Logs da Vercel e suporte da InfinitePay; a pausa entra na fase 2 |

**Pronto quando:** um dos resultados acima está medido em `webhook_events`.

### Fase 1: a cobrança e a página de pagamento (migration 91)

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

### Fase 2: régua, fila e aba Cobranças (migration 92)

`billing_messages`, cron, "Cobrar automaticamente" (formulário, lote, prévia do
contrato), opção de não receber, configuração dos dias. Aba Cobranças com a **fila
do dia**: abre o WhatsApp com a mensagem pronta e registra como `manual`, sem
fingir que foi entregue. Colunas: cliente, valor de hoje, vencimento, situação,
último aviso, abriu, próxima etapa; ações pausar, retomar, reenviar, copiar link,
"Já pago na InfinitePay". Linha do tempo no detalhe, histórico no cliente, avisos
no sino. **Aqui o módulo já serve no dia a dia, sem nenhuma conta nova.**

**Pronto quando:** uma cobrança de teste percorre as etapas (datas simuladas no
Node), cada aviso aparece uma vez só, e a baixa tira a cobrança da fila.

### Fase 3: multa, juros e desconto no Pix (migration 93)

Começa medindo: um Pix real com desconto, para ver como o valor volta no
`payment_check`. A baixa de hoje exige `paid_amount >= amount` e recusaria esse
pagamento, então a regra passa a aceitar o valor com o desconto gravado na própria
cobrança. Cartão num link com desconto só no Pix continua pedindo o valor cheio.

Campos no contrato e no formulário, leitor de contratos, herança nas parcelas,
função pura de cálculo, composição na página, `superseded`, lançamento de Encargos
e `discount_amount` na baixa e no estorno, conferência em `contractEntries.ts`.

**Pronto quando:** um atraso mostra a conta na página, o pagamento gera o principal
e os Encargos, um Pix até o vencimento paga com desconto e dá baixa, a conferência
do contrato não acusa diferença, e o estorno desfaz tudo.

### Fase 4: mensalidades (migration 94)

`billing_series`, tela de criar e pausar. O cron materializa o próximo lançamento
com antecedência, como a recorrência da Agenda, e cada um entra na régua. Editar a
série não reescreve os já criados.

**Pronto quando:** uma mensalidade gera o ciclo seguinte uma vez só, inclusive com
dia 31 em mês curto (`addMonthsISO`), e o Financeiro mostra só os ciclos gerados.

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

1. **Resultado da fase 0.** Muda a régua.
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
