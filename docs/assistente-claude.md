# Assistente com Claude

> **Status:** plano aprovado em 2026-10-26 (recomendações D1–D7). **Fase 1**
> implementada na branch `feat/ia-claude-base`. A migration 81 **não** foi
> aplicada. A validação com perguntas reais depende da chave (Fase 0). Ver
> "Como ficou" na Fase 1. Os custos são **estimativas**; a seção "Custos" diz
> de onde vem cada número e o que falta medir.

Pedido (2026-10-26):

- Migrar o Assistente para o Claude, com funcionalidades e interações
  dinâmicas com toda a aplicação.
- Validar o resumo do processo por IA feito pelo Claude.
- Avaliar custos e eficiência.
- No portal do cliente: perguntas fixas respondidas pela IA, no lugar do chat
  livre.

## Como está hoje

| Peça | Onde | O que importa |
|---|---|---|
| Provedor | `src/features/ia/model.ts` | `AI_ASSISTANT_PROVIDER`, padrão `google` (`gemini-3.8-flash`). O ramo `anthropic` já existe: `claude-opus-5`, thinking adaptativo, effort `medium`, `fallbacks: 'default'` |
| Gemini | memória do projeto | O plano gratuito usa o conteúdo para treino. Cota de 20 req/dia. Desde 14/10 é pré-pago **sem saldo (402)**, último estado conhecido |
| Chat da equipe | `app/api/ia/chat/route.ts` + `features/ia/tools/` | AI SDK (`streamText`, `useChat`). São 30 tools: 21 de leitura e geração, que rodam com a RLS de quem pergunta, e 9 ações sem `execute`, que a pessoa confirma num card na tela. No máximo 8 passos por turno |
| Chat do portal | `app/api/portal/[token]/assistente/route.ts` | Chat livre. O modelo só recebe o que a página mostra. Limite de 10/h e 30/dia por link, conversa gravada (migration 64). Sugestões prontas em `PortalAssistant.tsx` |
| Leitor de contratos | `features/contratos/reading/runReader.ts` | `generateText` + `Output.object`, mesmo provedor |
| Redigir com IA | `app/api/documentos/modelos/redigir/route.ts` | Mesmo padrão |
| Resumo do processo | `lib/buscaprocessos/sync.ts` → `legal_processes.ai_summary` | Vem pronto da BuscaProcessos (R$ 0,12 por consulta), em texto livre, exibido em `ResumoIaCard.tsx` |
| Consumo | — | Nenhuma rota registra tokens nem custo |
| Cache de prompt | — | Nenhuma rota pede cache ao Claude. O `system` é um texto só, com data **e minuto** no fim, o que invalidaria o cache a cada minuto |

Tamanho medido em 2026-10-26, rodando os módulos reais: no chat, 6.450
caracteres de instruções e 42.247 de esquemas das 30 tools. No portal, 5.856
de instruções e 672 da tool `ver_andamento`.

## Decisões

| # | Tema | Recomendado | Alternativa |
|---|---|---|---|
| D1 | Provedor | **Claude em tudo.** O Gemini sai depois de validada a Fase 1 | Manter o Gemini de reserva, pela variável |
| D2 | Modelo | **`claude-opus-5-5` em todas as rotas, com esforço ajustado por rota.** Só trocar de modelo depois de medir (Fase 1) | Começar com Haiku 5.5 no portal e na triagem |
| D3 | SDK | **AI SDK no que é interativo** (chat, portal, leitor, redação) **+ `@anthropic-ai/sdk` só para lote** | Tudo no SDK oficial, o que reescreve o stream e os cards de confirmação |
| D4 | Resumo do processo | **Claude substitui a BuscaProcessos**, se passar na validação da Fase 2 | Os dois lado a lado |
| D5 | Portal | **Respostas geradas a cada movimentação nova e guardadas.** O clique não chama a IA | Pergunta fixa chama a IA na hora |
| D6 | Revisão no portal | **Publica sozinho com o selo "IA"**; o escritório oculta ou corrige | Só aparece depois do ok do advogado |
| D7 | Teto de gasto | **Teto mensal no app + limite no Console da Anthropic** (valor a definir) | Só o limite do Console |

**Por que D2.** O Opus 5.5 é mais barato que o Opus 5 que está no código
(US$ 4/20 contra 5/25 por milhão de tokens) e é o modelo atual. A orientação da
Anthropic é medir primeiro o modelo mais forte com esforço menor, antes de
descer de modelo. A tabela de custos mostra a diferença para o Haiku: a
decisão fica com números reais, depois da Fase 1.

**Por que D3.** O chat depende de peças do AI SDK: `useChat`,
`safeValidateUIMessages`, tools sem `execute` que viram card,
`toUIMessageStreamResponse`. O provider instalado (`@ai-sdk/anthropic`
4.0.55) já reconhece `cacheControl`, `effort`, `fallbacks` (betas 2026-06-01 e
2026-07-01), `contextManagement` e `citations`. Também trata `claude-opus-5*`
com saída estruturada nativa, então o leitor e a redação não caem no 400 de
ferramenta forçada do Opus 5.5. A própria Anthropic prefere o SDK oficial em
tudo; a troca completa fica como alternativa, porque o custo dela é reescrever
o que já funciona.

**Correção em D3 (2026-10-26, na Fase 1).** Este plano dizia que o AI SDK não
expõe a Batch API, e era por isso que o SDK oficial entraria para o lote. Está
errado: o provider instalado tem lote, ainda **experimental**
(`experimental_startBatch` e afins, seção "Batch" de
`node_modules/@ai-sdk/anthropic/docs`). Nova recomendação: usar o lote do AI
SDK na Fase 2 e só trazer o `@anthropic-ai/sdk` se ele não der conta. Isso fica
a decidir quando a Fase 2 começar.

## Custos

Premissas:

- Preço por milhão de tokens (tabela da Anthropic de 2026-10): Opus 5.5 custa
  US$ 4 de entrada, 20 de saída e 0,20 de leitura de cache. Opus 5 custa 5/25.
  Sonnet 5.5 custa 2/10 e 0,20 de cache. Haiku 5.5 custa 0,10/0,50 até 100
  mil tokens de entrada. Escrever no cache custa 1,25× a entrada. Lote (Batch)
  custa metade.
- Câmbio de referência: **US$ 1 = R$ 5,50** (ajustar).
- Tokens estimados a ~3,2 caracteres por token (português e JSON). A contagem
  exata pelo `count_tokens`, que é gratuito, não rodou: a `ANTHROPIC_API_KEY`
  do `.env` voltou **401 invalid x-api-key** em 2026-10-26. Ver a Fase 0.
- Prefixo fixo do chat: ≈ 15 mil tokens. Do portal: ≈ 2 mil.
- Pergunta típica no chat: 3 chamadas (buscar → detalhar → responder), ~1,5
  mil tokens de resultado por consulta e ~1,5 mil de saída somando o
  raciocínio. **A Fase 1 mede isso de verdade.**

### Chat da equipe, por pergunta

| Cenário | US$ | R$ |
|---|---|---|
| Opus 5 sem cache (o ramo `anthropic` de hoje) | 0,30 | 1,67 |
| Opus 5.5 sem cache | 0,24 | 1,33 |
| Opus 5.5 com cache, 1ª pergunta (escreve o cache) | 0,13 | 0,74 |
| Opus 5.5 com cache, conversa em andamento | 0,06 | 0,32 |
| Sonnet 5.5 com cache (média) | 0,045 | 0,25 |
| Haiku 5.5 sem cache | 0,006 | 0,03 |

A cada **1.000 perguntas por mês** (exemplo: 3 pessoas × 15 por dia útil), com
30% das perguntas abrindo conversa, o custo fica assim:

- Opus 5.5 com cache: ≈ US$ 80 (R$ 440).
- Opus 5.5 sem cache: ≈ US$ 240 (R$ 1.330).
- Sonnet 5.5: ≈ US$ 45 (R$ 250).
- Haiku 5.5: ≈ US$ 6 (R$ 33).

O prefixo é igual para todos os usuários, então uma escrita de cache serve à
equipe toda. O cache vence depois de 5 minutos sem uso, e cada uso renova o
prazo.

### Resumo do processo, por resumo

Com ~100 movimentações (≈ 17 mil tokens de entrada):

| Cenário | Na hora | Em lote |
|---|---|---|
| Opus 5.5, resumo completo | R$ 0,56 | R$ 0,28 |
| Opus 5.5, incremental (resumo anterior + movimentações novas) | R$ 0,28 | R$ 0,14 |
| Sonnet 5.5, resumo completo | R$ 0,28 | R$ 0,14 |
| Haiku 5.5, resumo completo | R$ 0,014 | — |
| BuscaProcessos (hoje) | R$ 0,12 | — |

Com Opus, o resumo custa mais que o da BuscaProcessos. Em lote e incremental,
empata. O ganho é de conteúdo (Fase 2), não de preço.

### Portal

| Cenário | R$ |
|---|---|
| Chat livre de hoje, por pergunta do cliente (Opus 5.5) | 0,29, com até 30 por dia por link |
| Respostas fixas, por processo a cada movimentação nova (Opus 5.5, lote) | 0,14 |
| Respostas fixas com Haiku 5.5 | 0,01 |
| Clique do cliente nas respostas fixas | 0 |

### Efeito do esforço (`effort`)

No Opus 5.5 o raciocínio não pode ser desligado: o esforço (`low`, `medium`,
`high`, `xhigh`, `max`; padrão `medium`) é o único controle. Ele mexe em duas
coisas:

- **Tokens de raciocínio.** São cobrados como saída, o item mais caro (US$ 20
  por milhão).
- **Quantidade de consultas.** Com esforço menor, o modelo faz menos chamadas
  de tool e mais enxutas.

Suposição dos números abaixo: em `low`, o raciocínio cai pela metade ou mais.
A medida real vem da Fase 1.

| Rota (Opus 5.5) | `medium` | `low` | Queda |
|---|---|---|---|
| Chat com cache, 1.000 perguntas/mês | R$ 440 | R$ 360 (menos raciocínio) a R$ 295 (e uma consulta a menos) | 19% a 34% |
| Chat sem cache, 1.000 perguntas/mês | R$ 1.330 | R$ 1.250 a R$ 825 | 6% a 38% |
| Resumo do processo, completo | R$ 0,56 | R$ 0,48 | 14% |
| Resumo do processo, incremental | R$ 0,28 | R$ 0,20 | 28% |
| Respostas do portal, por geração (em lote) | R$ 0,14 | R$ 0,10 | 27% |

Como ler a tabela:

- **No chat, a maior parte do custo é entrada.** Os ~15 mil tokens de prefixo
  vão de novo a cada consulta. Por isso, no chat, o esforço rende mais quando
  corta uma consulta do que quando corta raciocínio.
- **Nas tarefas de segundo plano, a saída pesa mais.** A entrada é pequena e o
  raciocínio vira boa parte da conta, então o esforço baixo rende mais.
- **Mudar o esforço no meio de uma conversa invalida o cache do histórico.**
  Por isso o esforço é fixo por rota, e não escolhido pergunta a pergunta.
- **O risco do esforço baixo no chat é consultar menos e conferir menos.**
  Exemplo: responder "não encontrei" sem buscar de novo, ou propor uma ação
  com o id errado. A Fase 1 roda as mesmas 10 perguntas em `medium` e em
  `low` e compara a qualidade e o `ai_usage` antes de decidir.

### Alavancas de eficiência, em ordem

1. **Cache de prompt** (de graça). Marcar o fim das tools e das instruções
   estáveis, e o fim do histórico. A data vai num bloco à parte, sem o minuto.
   Corta cerca de dois terços do custo do chat. Conferir pelo
   `cache_read_input_tokens`.
2. **Opus 5 → Opus 5.5.** −20% no preço por token. No código, só muda o id.
3. **Esforço por rota.** `low` em consulta simples e em lote; `medium` no
   chat, na redação e na leitura de contrato. Raciocínio é token de saída, o
   item mais caro. (A primeira versão deste plano punha `high` na redação e na
   leitura. Na Fase 1 ficou `medium`: segundo a Anthropic, o Opus 5.5 em
   `medium` supera o Opus 5 em `high`, e subir o esforço só vale com medida.)
4. **Lote (Batch API, −50%)** para o que não precisa sair na hora: resumos,
   respostas do portal e triagem.
5. **Incremental.** Resumo e respostas do portal partem do resultado anterior
   e do que mudou. Nada é regerado sem movimentação nova (carimbo ou hash, como
   o sync da BuscaProcessos já faz).
6. **Tools sob demanda** (tool search com `defer_loading`). Só se as tools
   novas da Fase 4 inflarem muito o prefixo.
7. **Troca de modelo por rota (D2).** Por último, com os números da Fase 1.

## Fases

Um PR por fase, a partir da `main`, com branch criada usando `--no-track`.
Verificação sem testes no repo: tsc, lint, build e navegador.

### Fase 0 — Pré-requisitos (sem código)

- Chave válida no `.env` local e na Vercel. A do `.env` voltou 401 em 26/10.
- Créditos na conta. Se a chave for de vários workspaces, preencher
  `ANTHROPIC_WORKSPACE_ID`; `model.ts` já trata.
- Limite de gasto mensal no Console da Anthropic.
- Ok nas decisões D1–D7.

### Fase 1 — Fundação Claude (migration nova)

Objetivo: trocar o motor sem mudar o que a equipe vê, e passar a medir.

- `claude-opus-5` → `claude-opus-5-5`; `AI_ASSISTANT_PROVIDER` passa a ter
  `anthropic` como padrão.
- **Configuração por rota num lugar só**, como união discriminada `as const`:
  `chat`, `portal`, `leitor_contratos`, `redacao`, `resumo_processo` e
  `triagem`, cada uma com modelo, esforço e teto de saída. É o painel de
  controle de custo.
- **Cache de prompt** no chat e no portal: o `system` vira dois blocos, um
  estável com `cacheControl` e outro com a data sem minuto, mais um
  breakpoint no fim do histórico.
- **Tabela `ai_usage`**, gravada no fim de cada chamada. Guarda rota, modelo,
  tokens de entrada, de saída, de cache lido e de cache escrito, custo
  estimado, usuário ou link do portal, entidade e data. Visível só para quem
  administra o escritório (recurso do RBAC a definir).
- **Teto mensal (D7):** antes de chamar o modelo, a rota soma o `ai_usage` do
  mês. Acima do teto, devolve 503 com mensagem clara. A falha é fechada, como
  o limite do portal.
- **Erros:** recusa (`stop_reason: refusal`) e créditos esgotados (402)
  ganham mensagem própria. `providerErrors.ts` hoje só trata 402 e 429.
- **Raciocínio preso à conversa:** no Opus 5.5, conta criada a partir de
  31/08/2026 recebe 400 se o histórico for editado. A rota hoje descarta
  mensagens vazias (`hasVisibleContent`) e chamadas incompletas
  (`ignoreIncompleteToolCalls`). Conferir com conversas reais. Se a API
  recusar, o histórico passa a ser gravado só por acréscimo.
- **Conversas antigas do Gemini:** abrir uma e continuar. A API descarta o
  raciocínio de outro modelo; conferir que nada quebra.
- **Verificação:** 10 perguntas reais cobrindo busca, detalhe, geração de
  documento e ação confirmada, com custo e cache lidos no `ai_usage`.

**Como ficou (2026-10-26, branch `feat/ia-claude-base`):**

| Peça | Onde | O que faz |
|---|---|---|
| Configuração por rota | `features/ia/model.ts` → `AI_ROUTE_SETTINGS` | `chat`, `portal`, `contract_reader` e `drafting`, todas em `claude-opus-5-5`. Esforço `medium` em todas, menos o portal (`low`). `AI_ASSISTANT_PROVIDER` passou a ter `anthropic` como padrão |
| Registro de consumo | `features/ia/usage/recordUsage.ts` | Middleware do AI SDK em volta do modelo: cada chamada (cada passo do turno) vira uma linha em `ai_usage`, gravada pela service_role. Falha no registro só vai para o log `[ia-uso]`, nunca derruba a resposta |
| Preços | `features/ia/usage/pricing.ts` | Opus 5.5 e os destinos do fallback (Opus 5, 4.8). Modelo sem preço fica com custo nulo |
| Tabela | migration 81 | `ai_usage` (lê quem tem `configuracoes:manage`; ninguém escreve por sessão) + `ai_usage_month_cost_usd()` (mês de Brasília, só service_role) |
| Teto | `features/ia/usage/budget.ts` | `AI_MONTHLY_BUDGET_USD`. Vazia = sem teto no app. Falha fechada. As 4 rotas conferem antes do modelo; o portal diz só "indisponível" |
| Cache | `features/ia/promptCache.ts` | Marca no fim das instruções estáveis (cobre também as tools) e no fim do histórico, a cada passo (`prepareStep`) |
| Data | `prompts/system.ts`, `portal/assistant/prompt.ts` | Só o dia, num bloco depois do cacheado. Com a hora, o começo da conversa mudaria a cada minuto |
| Raciocínio preso à conversa | `model.ts` | `blockBinding: { prefixMismatchBehavior: 'drop_block' }`. O chat muda o histórico de propósito: anexos antigos viram referência, turnos que falharam saem, a data vira à meia-noite. Em conta criada a partir de 31/08/2026, isso seria 400; com `drop_block`, a API descarta o raciocínio antigo e responde |
| Erros | `features/ia/providerErrors.ts`, `errorMessages.ts`, `ChatPanel.tsx` | Chave recusada (401/403), créditos (402), limite (429), sobrecarga (503/529) e recusa dos filtros (`content-filter`, antes um turno vazio sem aviso) têm mensagem própria no chat, na leitura e na redação |

Verificado:

- tsc, lint e build passaram.
- Um script rodou os módulos reais com o `fetch` interceptado, sem nada sair
  da máquina, e passou em 39 de 39 checagens:
  - o corpo enviado à Anthropic: modelo, os dois blocos de `system`, as
    marcas de cache, `drop_block`, esforço, fallback e betas;
  - a linha de `ai_usage`, com tokens e custo;
  - a recusa virando a mensagem própria;
  - o teto: liberado, estourado e valor inválido;
  - o mapeamento dos erros.

**Não verificado:**

- Chamada real ao Claude. A chave do `.env` voltou 401.
- As 10 perguntas da verificação.
- O comportamento do `drop_block` na API.
- O chat na tela, que exige login.
- A migration 81 aplicada.

### Fase 2 — Resumo do processo com Claude

**Validação primeiro, sem gravar nada:**

- Nos processos que já têm resumo da BuscaProcessos, gerar o do Claude com o
  que o AdvTool já guarda: capa, movimentações, publicações, audiências e
  tarefas do processo. O script roda fora do repo.
- Comparação lado a lado. O advogado avalia quatro pontos:
  1. Nada inventado.
  2. Fase e último ato certos.
  3. O que importa para o escritório aparece.
  4. Linguagem.
- Aceite: nenhum fato inventado, e o Claude melhor ou igual em pelo menos 4
  de 5 processos. Custo esperado da validação: menos de R$ 5.

**Se aprovado:**

- **Saída estruturada:** `fase_atual`, `ultimo_ato` (com a movimentação de
  origem), `resumo` (em parágrafos), `pontos_de_atencao` e
  `proximos_passos_registrados`. Este último traz só audiências e tarefas que
  existem no banco, nunca previsão. Cada afirmação aponta a movimentação de
  onde veio, e o card leva ao item na linha do tempo.
- **Quando gera:**
  - "Gerar resumo" no processo que ainda não tem.
  - Atualização automática, em lote e incremental, quando entra movimentação
    nova.
- **Armazenamento:** colunas novas em `legal_processes`, ou tabela própria,
  com o resumo estruturado e a origem. O `ResumoIaCard` deixa de dizer
  "Gerado pela BuscaProcessos" fixo.
- **BuscaProcessos:** o bloco `resumo_ia` sai do sync padrão (D4) e economiza
  R$ 0,12 por processo.
- **Fica fora do portal:** o resumo interno pode usar dado interno
  (publicações ocultas, tarefas). Por isso **não** é reaproveitado lá.

### Fase 3 — Portal com perguntas fixas (migration nova)

- **O chat livre sai.** Em cada processo, o cliente vê perguntas prontas, com
  resposta imediata:
  1. O que aconteceu por último?
  2. O que isso significa? (a última movimentação em linguagem simples)
  3. Em que fase o processo está?
  4. Tem alguma data marcada? (só o que aparece nas movimentações
     publicadas)

  Abaixo das perguntas fica "Falar com o escritório", só com o contato que o
  escritório cadastrou.
- **Geração (D5):** uma chamada só, com saída estruturada. Ela roda quando
  entra movimentação visível ou quando o escritório libera ou oculta uma. O
  resultado vai para uma tabela nova, `client_portal_answers`: processo,
  pergunta, texto, hash das movimentações usadas, modelo, data da geração e
  quem editou. **O clique não chama a IA.**
- **Sigilo como hoje:** a geração só recebe movimentações com
  `hidden_from_client = false`. As regras de comportamento de
  `features/portal/assistant/prompt.ts` continuam: sem parecer, sem previsão,
  sem prazo e sem afirmar ausência ("não há prazo").
- **Tela do escritório (D6),** na página do processo: ver as respostas como o
  cliente vê, editar ou ocultar cada uma. A resposta editada fica marcada como
  revisada. Quando entra movimentação nova, a versão nova vem com um aviso ao
  escritório.
- **O que sai do código:** a rota `/api/portal/[token]/assistente`, o chat de
  `PortalAssistant.tsx` e os limites de 10/h e 30/dia. A tabela
  `client_portal_chat_messages` fica, como histórico, sem gravações novas.
- **Ganho:** custo por movimentação, não por clique; resposta instantânea;
  nenhum campo onde o cliente tente contornar as instruções; e o escritório
  vê exatamente o que o cliente lê.

### Fase 4 — Assistente em toda a aplicação (3 PRs)

**4a. Painel global com contexto**

- Botão no `Header` e atalho de teclado. Abrem um painel lateral com o mesmo
  chat do `/ia` (mesmas conversas), em qualquer tela.
- **Contexto da tela:** a rota, a entidade aberta (cliente, processo,
  contrato, publicação, evento) e os filtros visíveis vão com a pergunta, como
  bloco de contexto. Ficam fora do `system`, para não quebrar o cache. Assim,
  "resuma isto" e "crie uma tarefa para este processo" funcionam sem dizer
  qual.
- Cada tool continua com a RLS de quem pergunta: mais alcance não dá mais
  acesso.

**4b. Ações rápidas por tela.** Botões com pedido fixo, a mesma ideia do
portal:

| Tela | Ação | Resultado |
|---|---|---|
| Processo | Resumir / O que mudou desde… | O resumo da Fase 2 |
| Processo, Audiência | Preparar audiência | Pontos e checklist a partir das movimentações e do checklist da audiência |
| Publicação | Explicar e sugerir providência | Tipo do ato, se gera prazo e a sugestão de tarefa. **A data do prazo sai de `src/lib/prazos` (com feriados), nunca da IA.** A tarefa passa pelo card de confirmação |
| Cliente | Panorama | Processos, pendências, financeiro e próximos compromissos |
| Cliente | Rascunhar atualização para o cliente | Texto para copiar (WhatsApp, e-mail). Nada é enviado sozinho |
| Dashboard | Briefing do dia | Agenda, prazos e publicações novas |

**4c. Mais ações e interação com a tela**

- **Ações novas com confirmação,** no mesmo padrão de `actions.ts`: o card
  aparece e o service da tela grava. São elas: concluir ou reatribuir tarefa,
  remarcar evento, criar audiência, registrar lançamento, vincular publicação
  a processo e marcar publicação como tratada.
- **Envio para assinatura (D4Sign) e cobrança (InfinitePay):** só com card
  reforçado, ou fora da v1 (decidir).
- **Tools de interface,** que rodam no navegador:
  - `abrir_tela` navega para a rota com os filtros.
  - `abrir_formulario` abre o diálogo existente (nova audiência, novo
    lançamento…) já preenchido, para a pessoa conferir e salvar.

  A IA prepara; quem grava é o formulário de sempre, com a validação de
  sempre.
- Depois de cada ação confirmada, a tela por trás atualiza, pela invalidação
  do React Query que os services já fazem.

### Fase 5 — Em segundo plano

- **Triagem de publicações na chegada:** tipo do ato, urgência, processo
  provável e se pede providência. Vira um selo na lista de Publicações e uma
  sugestão de tarefa, que alguém confirma. Roda em lote.
- **Briefing diário por pessoa,** como notificação. Precisa de cron, e o repo
  não tem nenhum hoje (não existe `vercel.json`). Conferir o plano da Vercel,
  porque o gratuito limita cron.
- Resumos e respostas do portal entram na mesma fila de lote.

## Riscos e cuidados

- **Dados de clientes passam a ir para a Anthropic.** A API comercial não usa
  os dados para treino por padrão; conferir os termos vigentes e citar na
  política do escritório. Hoje o plano gratuito do Gemini usa.
- **Custo sem teto:** cada tela nova com IA chama o modelo. Por isso o
  `ai_usage` e o teto vêm na Fase 1, antes de tudo.
- **Prazo calculado pela IA é risco profissional.** O prazo vem sempre do
  motor de prazos.
- **Histórico editado** no Opus 5.5 (ver a Fase 1).

## Ordem sugerida

0 → 1 → 2 → 3 → 4a → 4b → 4c → 5.

A Fase 3 não depende da 2 e pode vir antes, se o portal for a prioridade. A
validação da Fase 2 pode rodar logo depois da Fase 1, porque reusa o
`ai_usage` para medir o custo real.
