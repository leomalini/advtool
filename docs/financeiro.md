# Financeiro: períodos, êxitos e percentuais

> **Status:** plano aprovado em 2026-10-30 (as quatro decisões com o usuário e
> as "Decididas no plano", sem veto). **Fase 1** (períodos e dashboard) na
> branch `feat/financeiro-periodos`, sem migration. **Fase 2** (êxitos e
> percentuais) na branch `feat/financeiro-exitos`, empilhada na 1, com a
> migration 89 aplicada no remoto em 2026-11-04. **Fase 3** (Assistente) na
> branch `feat/ia-exitos`, empilhada na 2, com a migration 90 aplicada no remoto
> em 2026-11-04. Ver "Como ficou" de cada fase.

Pedido, em seis itens:

1. Uma aba no Financeiro com **todos os êxitos a receber** de todos os
   processos, e o êxito registrado na aba Financeiro do processo — o
   Assistente pode registrá-lo.
2. Recebimentos que são **porcentagem de um valor** variável ou que só se
   conhece depois de um evento (a venda de um imóvel, por exemplo).
3. Dashboard: **"Resultado" vira "Líquido"**.
4. Dashboard: clicar em **"Recebido"** abre o Financeiro filtrado no mês.
5. **Atalhos de período**: hoje, semana, quinzena, mês.
6. **Filtros na tela toda** do Financeiro (período e tipo: recebimentos e
   despesas) e **cards clicáveis**.

## Decisões

| Tema | Escolha |
|---|---|
| Êxito | **Lançamento com %.** Continua sendo um lançamento em condição especial, com a categoria nova **Êxito** e o % e a base como campos. Fica em R$ 0 até apurar; ao apurar ganha valor e vencimento. Sem êxito = excluir o lançamento |
| Estimativa | **Opcional, por êxito:** valor estimado da base (o campo sugere o valor da causa). A aba Êxitos soma a estimativa à parte; o A receber nunca a soma (decisão da fase 4 de `docs/contratos.md`) |
| Período | **A tela toda responde.** Todo número da tela soma exatamente as linhas da tabela. Os vencidos de antes do período aparecem num aviso clicável |
| Assistente | **No chat, com card** (registrar e apurar), **e aviso pelas publicações:** a triagem em segundo plano encontra o valor de sentença, acordo, alvará ou RPV e avisa no sino com a conta pronta. Nada grava sem confirmação |

### Decididas no plano (valem salvo veto)

| Tema | Escolha | Por quê |
|---|---|---|
| Períodos | De calendário: **Hoje**; **Semana** de segunda a domingo; **Quinzena** de 1 a 15 ou de 16 ao fim do mês; **Mês**; **Tudo**; e as datas à mão. As setas ‹ › andam um período | "Recebido" precisa dos dias que já passaram: uma janela "próximos 7 dias" deixaria o card sempre zerado. Quinzena, no uso daqui, é 1–15 e 16–fim |
| Período ao abrir | Mês corrente | É o recorte dos cards de hoje ("no mês") |
| Tipo | **Tudo · Recebimentos · Despesas.** Em Despesas, o bloco "A receber" vira **"A pagar"**, com as mesmas três partes | Despesa já tem vencido e condição especial (migration 40); só a tela não mostrava |
| Líquido | Recebido − Despesas do período, a mesma conta do "Resultado" de hoje: as despesas incluem as não pagas que vencem no período | Muda o nome, não o número. "Só despesas pagas" seria outra conta |
| "Resultado" no Financeiro | O rodapé do gráfico também vira "Líquido" | As duas telas com o mesmo nome |
| Dashboard | **Recebido, Despesas e Líquido** clicáveis | O mesmo gesto nos três números do mês |
| Links que já existem | `?situacao=a_receber` e as partes do A receber no dashboard ganham `periodo=tudo` | O número deles é de todas as datas; sem isso a lista abriria só no mês |
| Filtros na URL | Período, tipo, situação, cliente e processo (ids). A busca por texto fica fora | É o que faz o link do dashboard funcionar, e recarregar ou voltar mantém a tela. Texto pode ser nome de cliente: não vai para URL nem log |
| Gráfico | Continua com 6 meses e destaca o período. Segue tipo, cliente, processo e busca; clicar num mês põe o período nele | Ele já é o seletor de mês da tela |
| % em qualquer lançamento | Receita ou despesa. A aba Êxitos lista só a categoria Êxito | Percentual que não é êxito (comissão, repasse) usa o mesmo campo |
| Apurar | **Recebido**, **com vencimento**, **parcelado** (N mensais, a divisão das parcelas do contrato) ou **valor definido, ainda aguardando** (fica em condição especial, agora com valor). **"Foi só uma parte":** a parte vira lançamento próprio e o êxito continua a apurar | É o "variável": acordo pago em parcelas, RPV agora e precatório depois |
| Aba Êxitos | Sem período (êxito a apurar não tem data). Filtros próprios: situação, cliente, processo e busca | — |
| Êxito no Assistente | `registrar_exito` cobre o êxito de valor fixo e o percentual; `registrar_lancamento` fica com as quatro categorias de hoje | Uma ação por assunto, com o card certo |

## Como está hoje

| Peça | Onde | O que importa |
|---|---|---|
| Lançamento | `financial_entries` (migrations 21, 40, 63, 67, 71) | `category` = honorario, custas, pericia, outros (CHECK). `settlement_kind` = scheduled ou conditional. `amount` aceita 0. Não há campo de % |
| Situação | `getFinancialSituation` e `getCashFlowDate` (`src/types/financialEntry.types.ts`) | Fonte única de badge, filtro, cards e gráfico. A receber = A vencer + Vencido + Condição especial |
| Êxito do contrato | `buildContractEntryDrafts` (`features/contratos/utils/contractEntries.ts`) | Nasce na prévia ao assinar: `honorario`, condição especial, R$ 0, descrição "… — êxito", condição "30% do proveito econômico". **O % só existe no texto** e nada marca o lançamento como êxito |
| Baixa em R$ 0 | `needsAmountBeforePayment` | A baixa por clique pede o valor antes |
| Tela | `FinanceiroContent.tsx` | Cards fixos no mês (`getFinancialSummary`, consulta própria); A receber de todas as datas, com as três partes clicáveis; gráfico de 6 meses clicável; filtros (`FinanceiroFilterBar`) **só na tabela** |
| URL | `app/(app)/financeiro/page.tsx` | Lê `?id=` (sino) e `?situacao=` (dashboard). Nada de período ou tipo |
| Dashboard | `FinanceCard.tsx` → `MonthBlock` | Recebido · Despesas · Resultado, sem link. `DashboardMetrics.tsx` leva para `?situacao=` |
| Aba do processo | `FinancialEntriesTab.tsx` | A mesma no processo, no cliente, no caso do CRM e no contrato |
| Página do processo | `ProcessoDetailPage.tsx` | A aba é estado local (`useState<Tab>`): nenhum link abre direto na aba Financeiro |
| Assistente | `tools/read/financial.ts`, `tools/actions.ts` | `listar_lancamentos` não devolve % nem diz o que é êxito. `registrar_lancamento` exige valor > 0 |
| Triagem | `features/publicacoes/triage/` | Em lote, por publicação: tipo do ato, urgência, resumo, prazo. Não lê valores |
| Avisos | `notifications` (migration 47) | `kind` é texto livre; `resource` decide quem vê |

**Dados no remoto (2026-10-30, só totais):** 8 lançamentos, nenhum vindo de
contrato e nenhum em R$ 0. Um é receita "Outros" em condição especial com
valor: conferir à mão se é êxito e, se for, mudar a categoria na tela.
Migrations 1 a 88 aplicadas; a deste plano é a **89**.

## Desenho

### 1. Períodos e filtros na tela toda

Barra no topo da página, acima dos cards, valendo para tudo abaixo dela:

```
[Hoje] [Semana] [Quinzena] [Mês●] [Tudo] [dd/mm – dd/mm]   ‹ outubro 2026 ›
[Tudo●] [Recebimentos] [Despesas]     Cliente ▾   Processo ▾   Buscar…

 Recebido        Despesas        Líquido
 R$ 8.400        R$ 2.100        R$ 6.300

 A receber em outubro                         R$ 5.000
  A vencer R$ 3.000 · Vencido R$ 2.000 · Condição especial —
  ⚠ R$ 1.800 vencidos antes de outubro → ver
```

- **Uma regra:** todo número soma as linhas que a tabela mostraria com o
  mesmo filtro, pela data de fluxo (`getCashFlowDate`: o pago pela data do
  pagamento, o resto pelo vencimento ou pela previsão). Os cards ignoram só o
  recorte de situação que eles mesmos aplicam; senão clicar em "Vencido"
  zeraria os outros.
- **Cards clicáveis:** Recebido = receitas pagas; Despesas = despesas;
  Líquido = tudo do período; as partes do A receber, como hoje. Clicar de
  novo desfaz. Com um tipo escolhido, os cards do outro tipo e o Líquido
  ficam apagados, sem número.
- **Fora do período:** com período escolhido, os vencidos de antes dele e as
  condições especiais sem data viram avisos clicáveis ("→ ver" põe Tudo e
  aquela situação). Nada some sem aviso.
- **Cálculo:** cards e gráfico saem da lista já carregada (a tela já busca
  todos os lançamentos), por funções puras que o dashboard também passa a
  usar por trás de `getFinancialSummary` e `getMonthlyCashFlow`. As duas
  telas continuam sem poder discordar.
- **URL:** `?periodo=mes&de=2026-10-01&ate=2026-10-31&tipo=receita&situacao=pago&cliente=<id>&processo=<id>`.
  O atalho ativo é o que bate com `de` e `ate` (derivado, sem estado
  próprio). Antes de escrever, ler em `node_modules/next/dist/docs/` como
  esta versão do Next trata `searchParams` e `useSearchParams` (AGENTS.md).
- O Assistente continua recebendo os filtros da tela (`useAssistantScreen`).

### 2. Dashboard

- "Resultado" → "Líquido" no `MonthBlock` e no rodapé do gráfico do
  Financeiro.
- Recebido → `/financeiro?periodo=mes&tipo=receita&situacao=pago`;
  Despesas → `?periodo=mes&tipo=despesa`; Líquido → `?periodo=mes`. A lista
  que abre soma o número clicado.
- Os links do A receber (`DashboardMetrics.tsx`) ganham `periodo=tudo`.

### 3. Êxitos e percentuais (migration 89)

**Banco — `financial_entries`:**

| Coluna | Tipo | Regra |
|---|---|---|
| `category` | + `exito` ("Êxito") | Trocar o CHECK; conferir o nome dele no catálogo antes |
| `percent` | `numeric(5,2)` | > 0 e ≤ 100. Nulo = valor fixo |
| `base_description` | `text` | Obrigatória com `percent` ("proveito econômico", "valor da venda do imóvel") |
| `base_amount` | `numeric(14,2)` | ≥ 0, só com `percent`. Nulo = **a apurar** |
| `estimated_base_amount` | `numeric(14,2)` | ≥ 0, só com `percent`. Só informa: nunca entra no A receber |

- **A apurar** (`percent` com `base_amount` nulo) exige R$ 0, `pendente` e
  condição especial: um CHECK no estilo dos da migration 40.
- O valor (`amount`) **não** é coluna gerada. Sai de base × % na tela, mas
  pode ser ajustado (arredondamento, acordo), e cada parcela leva a sua parte.
- **Backfill:** os êxitos que a prévia do contrato criou (`contract_id`,
  condição especial, R$ 0, descrição terminando em " — êxito") viram
  categoria Êxito, com o % do contrato (`success_fee_percent`) e a base
  "proveito econômico". Hoje o remoto não tem nenhum; vale para os que
  nascerem até o deploy.
- **Apurar num passo só:** atualizar o êxito e criar as parcelas numa função
  do banco `security invoker` (a RLS vale como na tela), para não ficar
  metade feito.

**Situação de um êxito**, derivada numa função só (como
`getFinancialSituation`):

| Situação | Quando |
|---|---|
| A apurar | % sem valor da base |
| Aguardando | Valor definido, em condição especial |
| A vencer / Vencido | Com vencimento |
| Recebido | Pago |

**Formulário:** "Valor: fixo | percentual". O percentual pede %, base e,
opcional, a estimativa (sugerindo o valor da causa do processo); o valor sai
da conta. O zod passa a aceitar R$ 0 só no "a apurar".

**Apurar** (no detalhe do lançamento, na aba do processo e na aba Êxitos; a
baixa por clique de um êxito a apurar abre o Apurar):

```
Apurar êxito — 30% do proveito econômico
 Valor da base   R$ 80.000,00   → honorário R$ 24.000,00 (editável)
 ( ) Já recebido em  __/__/____
 ( ) Vence em        __/__/____
 ( ) Parcelado em  _ × a partir de __/__/____
 ( ) Valor definido, ainda aguardando: __________
 [ ] Foi só uma parte — o êxito continua a apurar para o restante
```

- Sem "parte": o próprio lançamento recebe o valor e, se parcelado, vira a
  parcela 1/N. Com "parte": a parte vira lançamento novo e o êxito segue a
  apurar.
- A divisão das parcelas sai de `contractEntries.ts` (`addMonthsISO`,
  centavos na última) para um util do Financeiro, usado pelos dois.
- **Sem êxito:** excluir o lançamento, com a confirmação de sempre.

**Aba Êxitos no Financeiro** (abas "Lançamentos | Êxitos"):

```
 A apurar               Aguardando     A receber      Recebido
 4 · est. R$ 61.000     R$ 12.000      R$ 18.000      R$ 9.000
 (1 sem estimativa)

 Processo · Cliente · 30% do proveito · a apurar (est. R$ 24.000) · [Apurar]
 …
```

Sem período; filtros por situação, cliente, processo e busca. Os totais são
cards clicáveis, como na outra aba.

**Aba Financeiro do processo** (a mesma do cliente, do caso e do contrato):
botão **Registrar êxito** ao lado de "Novo lançamento" (o formulário já abre
em Êxito, percentual e condição especial); a linha do êxito mostra "30% do
proveito econômico · a apurar · est. R$ 24.000" e o Apurar; o resumo ganha
"+ N êxitos a apurar".

**Contrato:** a prévia ao assinar grava o êxito já na categoria Êxito, com %
e base. `describeEntriesDivergence` passa a ignorar a categoria Êxito: sem
isso, um êxito apurado com vencimento contaria como parcela do contrato e
dispararia o aviso de divergência.

### 4. Assistente

**No chat (sem migration):**

- `listar_lancamentos` ganha filtro de categoria e devolve %, base, valor da
  base, estimativa e a situação do êxito.
- Ações novas, com card: `registrar_exito` (processo, valor fixo ou %, base,
  condição, estimativa) e `apurar_exito` (lançamento, valor da base, forma,
  parte), executadas pelos mesmos services da tela.
- Prompt: % e base só os que o usuário disse ou que vieram de um contrato ou
  documento lido e mostrado. Nunca inventar, a regra que já vale para os
  números do contrato.

**Pelas publicações (migration 90):**

- A triagem passa a devolver o **valor que o ato fixa** (condenação, acordo
  homologado, alvará, RPV ou precatório, venda ou arrematação) e a natureza
  dele: só o que o texto diz, sem deduzir nem somar. `publication_triage`
  ganha duas colunas para guardar isso.
- Ao gravar a triagem, se o processo da publicação tem êxito a apurar, sai
  um aviso no sino (`kind` `exito_apuravel`, `resource` `financeiro`):
  "Sentença fixou R$ 80.000 — 30% = R$ 24.000. Apurar o êxito?". O clique
  abre o processo na aba Financeiro com o Apurar preenchido. O valor sugerido
  é lido do banco, não da URL.
- A página do processo passa a aceitar a aba pela URL (`?aba=financeiro`).
- Alvará e RPV que só aparecem como movimentação, sem publicação, ficam de
  fora nesta versão.

## Fases

Cada fase é um PR, empilhados numa branch de integração `release/financeiro`
(criada da `main`); no fim, um PR só, `main ← release/financeiro`, e um
deploy. Branches com `--no-track`.

1. **Períodos e dashboard** (`feat/financeiro-periodos`, sem migration):
   seções 1 e 2.
2. **Êxitos e percentuais** (`feat/financeiro-exitos`, migration 89): seção 3.
3. **Assistente** (`feat/ia-exitos`, migration 90): seção 4.

As migrations são aplicadas com `pnpm db:push` por quem roda o projeto, antes
do merge final. Verificação de cada fase: `tsc --noEmit`, `pnpm lint`, build e
conferência no navegador; o projeto não usa testes automatizados. A parte das
publicações só se confere de verdade com a IA real e uma publicação de
sentença com valor.

## Fora desta versão

- Guardar "sem êxito" (taxa de êxito por área ou cliente): pede um status
  novo em `financial_entries`. Por ora, sem êxito = excluir.
- Repasse ao parceiro calculado sobre o êxito.
- Percentual recorrente automático (X% de cada parcela que o cliente
  receber): cada recebimento é um "apurar parte".
- Aviso por movimentação, além da publicação.
- Gráfico diário para períodos curtos.

## Como ficou a fase 1

Branch `feat/financeiro-periodos`, a partir de `release/financeiro` (criada da
`main` em `b90fd80`). Sem migration.

### Financeiro

- **Barra no topo**, valendo para a tela toda: atalhos Hoje, Semana, Quinzena,
  Mês e Tudo; setas ‹ › que andam um período (datas à mão andam o próprio
  tamanho); o nome do período; as datas à mão; tipo (Tudo, Recebimentos,
  Despesas); situação; cliente; processo; busca. O atalho aceso é deduzido das
  datas: digitar 1 a 15 acende "Quinzena". "Limpar" não mexe no período.
- **Cards** Recebido, Despesas (com quanto ainda está "a pagar") e Líquido,
  clicáveis. Com um tipo escolhido, os do outro tipo e o Líquido ficam
  apagados, sem número.
- **A receber / A pagar** no período, com as três partes clicáveis. Avisos
  clicáveis para o que o período deixa de fora: os vencidos de antes dele e as
  condições especiais sem data.
- **Gráfico:** continua com 6 meses; acende os meses do período e apaga os
  outros; segue tipo, cliente, processo e busca; clicar numa coluna põe o
  período naquele mês; "Sem data" liga e desliga o filtro próprio.
- **URL:** `periodo`, `de`, `ate`, `semdata`, `tipo`, `situacao`, `cliente`,
  `processo` e `id`, escrita com `history.replaceState` (sem ida ao servidor
  nem histórico por clique). O período corrente de um atalho é gravado como o
  atalho (`?periodo=semana`), o resto como datas. Link antigo com `situacao` e
  sem período abre em Tudo, como sempre abriu.
- **Somas:** `summarizeEntries` e `bucketCashFlow`, funções puras que a tela e
  o dashboard (`getFinancialSummary`, `getMonthlyCashFlow`) usam.
- **Hidratação:** abaixo do cabeçalho a tela só renderiza no navegador
  (`useMounted`). O servidor roda em UTC e, das 21h à meia-noite de Brasília,
  já está no dia seguinte: no último dia do mês renderizaria o período do mês
  seguinte.

### Dashboard e Assistente

- "Resultado" virou "Líquido" no card do mês e no rodapé do gráfico do
  Financeiro.
- Recebido, Despesas e Líquido do card abrem o Financeiro no mês, cada um no
  seu recorte (`?periodo=mes&tipo=receita&situacao=pago`, `&tipo=despesa`,
  só o mês).
- Os links do indicador A receber ganharam `periodo=tudo&tipo=receita`. Sem o
  tipo, a lista trazia também as despesas vencidas, que o número não soma.
- `abrir_tela` com situação manda `periodo=tudo`; `registrar_lancamento`
  devolve o link do próprio lançamento (`?id=`), que abre mesmo fora do mês.

### Decidido na implementação

| Tema | Escolha |
|---|---|
| Lançamento aberto | Vai para a URL (`?id=`): recarregar reabre, fechar tira. Como a ficha de Audiências |
| Parte do A receber clicada | Também fixa o tipo do bloco. Antes, "Vencido" listava despesas vencidas junto com as receitas que o número soma |
| Coluna do gráfico | Sempre põe o mês; não desfaz mais no segundo clique (o período tem os próprios botões) |
| Celular | Atalhos e datas mais compactos abaixo de `sm`; o rodapé do gráfico quebra linha (estourava a tela antes desta fase) |

### Verificação

- `tsc`, lint (0 erros; os 13 avisos são de arquivos que esta fase não toca)
  e build ok.
- **Node** (código real pelo loader do scratchpad): 72 conferências de
  períodos, setas, nomes, URL e somas — entre elas, 300 sorteios comparando o
  resumo do dashboard novo com o cálculo antigo, todos iguais.
- **Navegador** (página temporária com 14 lançamentos fictícios, já apagada):
  números conferidos à mão em mês, semana, semana anterior, quinzena,
  quinzena seguinte, hoje e tudo; Despesas → "A pagar"; cards, partes e
  avisos clicáveis; colunas do gráfico; datas à mão (uma ponta, duas, setas,
  1–15 vira Quinzena); abrir e fechar lançamento; recarregar mantém a tela;
  link antigo `?situacao=vencido`; links do card do dashboard; 375 px sem
  rolagem lateral.
- **Não conferido:** a tela real com login e dados do remoto. A página
  temporária renderiza só no navegador, então o caminho com renderização no
  servidor (o `useMounted`) não passou pelo navegador.

## Como ficou a fase 2

Branch `feat/financeiro-exitos`, empilhada na fase 1 (`e7d9c45`). Migration 89
aplicada no remoto em 2026-11-04 (`db push`).

### Banco — migration 89

- `category` ganha `exito`. O nome do CHECK (`financial_entries_category_check`)
  foi conferido no catálogo do remoto antes de trocá-lo.
- Colunas `percent` (`numeric(5,2)`, de 0 a 100), `base_description`,
  `base_amount` e `estimated_base_amount` (`numeric(14,2)`).
- Três CHECKs: percentual sempre com a base descrita; base, estimativa e
  descrição só com percentual; a apurar só em R$ 0, pendente e em condição
  especial.
- Backfill dos êxitos que a prévia do contrato lançou (descrição "… — êxito"):
  viram categoria Êxito, e os que seguem a apurar ganham o % do contrato e a
  base "o proveito econômico".
- `assess_success_fee(p_entry_id, p_rows, p_keep_open)`, `security invoker`:
  o êxito recebe o valor e as parcelas nascem na mesma transação; com
  `p_keep_open`, só a parte nasce e o êxito segue a apurar. PT409 quando o
  lançamento já não está a apurar. `execute` para `authenticated`.

### Tela

- **Formulário:** "Valor: Fixo | Percentual". O percentual pede o %, "sobre"
  e o valor da base. Sem o valor da base, o lançamento fica a apurar — R$ 0,
  com a situação e o "Com vencimento" travados —, com estimativa opcional e o
  atalho "Estimar pelo valor da causa". Com o valor, o honorário sai da conta
  e continua editável.
- **Apurar** (no detalhe, na aba do processo, na tabela e na aba Êxitos; o
  clique de baixa de um êxito a apurar abre o Apurar): valor da base (ou a
  estimativa), honorário editável, "Já recebido", "Com vencimento",
  "Parcelado", "Valor definido, ainda aguardando", "Foi só uma parte" e a
  prévia do que vai ser gravado. Grava num passo só, pela função.
- **Aba Êxitos** (`?aba=exitos`): cards A apurar (com a estimativa e quantos
  estão sem), Aguardando, A receber (com o vencido) e Recebido, clicáveis;
  filtros de cliente, processo e busca; a lista vem por situação, a apurar
  primeiro; "Registrar êxito".
- **Aba Financeiro do processo** (e do cliente, do caso e do contrato):
  "Registrar êxito", a linha do percentual, "a apurar" no lugar de R$ 0 e
  "+ N êxitos a apurar (est. …)" no resumo.
- **Lançamentos:** "a apurar · est." na coluna Valor, a linha do percentual,
  e o card Condição especial diz quantos estão a apurar. A busca também acha a
  base ("venda do imóvel").
- **Detalhe:** "A apurar" e a estimativa no topo, a linha Percentual e o botão
  Apurar. Lançamento sem valor não oferece mais link de pagamento (a tela
  oferecia e a rota recusava).
- **Contrato:** a prévia lança o êxito na categoria Êxito, a apurar, com o %
  do contrato e a base editável; a divergência ignora êxito.

### Decidido na implementação

| Tema | Escolha |
|---|---|
| Como se lê | "30% sobre o proveito econômico": a base é escrita com o artigo e vem depois de "sobre", sem adivinhar "do" ou "da" |
| Parcela de êxito | Guarda a base inteira e só a sua parte do valor |
| Estimativa | Sai ao apurar (o service e a função limpam) |
| Êxito do contrato | Condição padrão "No êxito da ação"; base "o proveito econômico" |
| Valor fixo | Lançamento novo nem escreve as colunas do percentual; só se limpa num que tinha |
| Permissão para apurar | `financeiro:update` (a função trava o êxito com `for update`) e `financeiro:create` para as parcelas |
| `formatPercent` | Mudou para `financialEntry.types` (o `contract.types` já importa de lá) |
| Fixo depois de Percentual | Trocar para Fixo limpa o % digitado; sem isso o zod seguia tratando o lançamento como a apurar e o salvar travava |
| Percentual sem o % | O formulário pede o percentual; o zod sozinho falaria de um valor que nem está na tela |
| Banco sem a 89 | As linhas sem as colunas novas não quebram a tela: um preview contra o banco de produção segue abrindo antes do `db push` |
| Previsão ao apurar | "Valor definido, ainda aguardando" mantém a previsão que o êxito já tinha |

### Verificação

- `tsc`, lint (0 erros; os 13 avisos são de arquivos que a fase não muda — o
  do `watch()` no formulário já existia) e build ok.
- **Node:** 52 conferências — honorário, situação do êxito, a linha do
  percentual, parcelas, apuração, carteira, prévia do contrato, regras do zod,
  a aba na URL e linhas sem as colunas da 89. As 72 da fase 1 seguem passando.
- **Navegador** (página temporária com êxitos fictícios, já apagada): aba
  Êxitos com cards e ordem; Apurar com a estimativa em 3 parcelas — a chamada
  capturada saiu no formato que a função lê; Apurar de dentro do detalhe com
  "foi só uma parte" (`p_keep_open`); apurar pela edição (o update leva base,
  valor e a estimativa limpa); "Registrar êxito" na aba do processo (o insert
  sai a apurar, com a estimativa pelo valor da causa); de Percentual para Fixo
  (o insert sai sem as colunas novas); Percentual sem o %; tela sem as colunas
  da 89; detalhe; prévia do contrato; 375 px sem rolagem lateral.
- **Revisão automática** das fases 1 e 2 (`/auto-review`): sem bloqueios; as
  correções estão na tabela acima.
- **Remoto, só lendo (2026-11-04):** a 89 consta nos dois lados; as quatro
  colunas com os tipos do plano; os CHECKs novos e o de `category` com `exito`;
  `assess_success_fee` em plpgsql, `security invoker`, com
  `search_path=public`. `authenticated` executa, e `anon` também, pelo padrão
  do Supabase: como a função é `security invoker` e as policies pedem
  `public.can()`, é o mesmo caso da `retime_event_series`. Dados: os 8
  lançamentos seguem iguais, sem percentual, e o backfill não tinha o que
  converter.
- **Função no remoto (2026-11-04):** `assess_success_fee` executada como admin
  logado, com a RLS valendo, num único bloco que termina em erro de propósito,
  desfazendo tudo; a impressão digital da tabela ficou idêntica antes e depois.
  Certos: parcelado (o êxito vira a 1ª, nascem as outras, e a estimativa sai),
  só uma parte (o êxito segue a apurar, com estimativa e previsão), o restante
  já recebido (a baixa passa pelo gatilho da migration 67), valor definido
  aguardando, e tudo ou nada (a 2ª linha inválida desfaz a 1ª). Recusados:
  apurar de novo e valor fixo (PT409), id inexistente (P0002), sem linhas
  (22023) e os quatro CHECKs novos. Id sem perfil e `anon` não veem nada e
  recebem P0002, sem mudar o êxito.
- **Não conferido:** a tela com login; o formato em que a API devolve os ids
  (só afeta o histórico de atividades, e o service aceita as duas formas); um
  perfil com `financeiro:update` sem `create` (não existe na matriz atual).

## Como ficou a fase 3

Branch `feat/ia-exitos`, empilhada na fase 2 (`748e278`). Migration 90 aplicada no
remoto em 2026-11-04 (`db push`). Ela tinha de ir antes do deploy: sem as colunas,
a triagem em lote falha ao gravar.

### No chat

- `registrar_exito`: percentual com base (fica a apurar, em R$ 0) ou valor fixo
  (aguardando a condição), um dos dois. Passa pelo mesmo zod do formulário.
  `registrar_lancamento` continua com as quatro categorias de antes.
- `apurar_exito`: as quatro formas da tela e "foi só uma parte", pelas mesmas
  funções do diálogo (`assessmentError`, `buildAssessmentRows`) e pela mesma
  `assess_success_fee`.
- **O card é o que se grava.** Na confirmação o lançamento é lido de novo: se a
  descrição ou o percentual mostrados não forem os dele, ou se já não estiver a
  apurar, a ação é recusada com o motivo. O honorário do card sai do percentual
  conferido; um valor diferente aparece ao lado da conta.
- `listar_lancamentos` filtra por `categoria` e `so_a_apurar` e traz percentual,
  base, estimativa e situação. Êxito a apurar sai com `valor: null`, aqui e em
  `ver_contrato`: R$ 0 seria lido como "não há nada".
- O prompt do sistema tem uma seção "Êxitos": percentual, base e valores só do
  usuário ou de fonte lida e mostrada; estimativa não é dinheiro a receber.

### Pelas publicações

- Migration 90: `publication_triage.stated_amount` e `stated_amount_kind`.
- A triagem lê o valor que o ato fixa (`valor_fixado`, `natureza_do_valor`;
  `TRIAGE_PROMPT_VERSION = 2`). A faixa é conferida depois de arredondar: valor
  que o banco recusaria é tratado como "sem valor", para não perder a triagem.
- Com processo e êxito a apurar, sai um aviso `exito_apuravel` no sino por êxito,
  com a conta pronta. Não repete, se a coleta rodar duas vezes. Aviso que falha
  fica no log e não perde a triagem.
- O clique abre `/processos/<id>?aba=financeiro&apurar=<êxito>&publicacao=<pub>`.
  O valor não vai no link: o diálogo o lê da triagem, mostra de onde veio e dá o
  link "Confira o texto". Nada é gravado sem clicar em Apurar.
- Fechar tira o pedido da URL pelo router: a chave da rota muda, a página remonta
  sem ele, e o mesmo aviso clicado de novo reabre. Aviso antigo de êxito já
  apurado abre só a aba.

### Limites conhecidos

- Só avisa publicação **já ligada ao processo na hora da triagem**. A que for
  vinculada depois guarda o valor e mostra no cartão da triagem, sem aviso.
- Publicações triadas antes da 90 não têm valor: a triagem não roda de novo.
- Movimentações não avisam (ver "Fora desta versão").
- Quem vê o Financeiro mas não `processos` recebe o aviso e não abre a página. A
  matriz atual não tem esse perfil.

### Verificação

- `tsc`, `pnpm lint` (0 erros, os 13 avisos de antes) e `pnpm build`.
- **64 casos em Node, com os módulos reais e banco falso:** registrar (percentual,
  fixo, recusas), apurar (as quatro formas, parte, honorário informado, descrição
  ou percentual diferentes, já apurado, sem dados, conflito PT409, erro inesperado
  sobe), aviso (conta, link, não repete) e triagem (grava, sem processo, valores
  que arredondam para fora da faixa, aviso que falha). Os 52 da fase 2 seguem certos.
- **Navegador, com página temporária já apagada:** os cards de registrar e apurar
  em cada forma, o valor no cartão da triagem e o Apurar aberto pelo aviso, com
  80.000,00 na base, 24.000,00 de honorário e o link para a publicação.
- **Revisão automática** (`/auto-review`): as correções estão no texto acima.
- **Remoto, só lendo (2026-11-04):** a 90 consta nos dois lados; `stated_amount`
  em `numeric(14,2)` e `stated_amount_kind` em `text`, as duas aceitando nulo; os
  dois CHECKs como na migration. Dados: as 48 triagens seguem, nenhuma com valor;
  nenhum aviso `exito_apuravel`; nenhum lançamento de êxito ainda, então o aviso
  só pode sair depois que houver um êxito a apurar.
- **Não conferido:** a página do processo com login; um chat de verdade propondo
  as ações; a triagem com a IA real e uma sentença com valor.
