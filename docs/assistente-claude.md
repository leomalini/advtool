# Assistente com Claude

> **Status:** plano aprovado em 2026-10-26 (recomendações D1–D7). **Fase 1**
> na branch `feat/ia-claude-base`, enviada ao GitHub. Migration 81 aplicada no
> remoto. O caminho principal do chat foi validado com perguntas reais em
> 2026-10-26; faltam alguns casos (ver "Validação real" na Fase 1). Os custos
> de chat foram medidos ("Medido na Fase 1"); os demais seguem estimativas.

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

### Medido na Fase 1 (chat, 2026-10-26)

4 perguntas reais em 2 conversas, 8 chamadas, lidas em `ai_usage`:

| Pergunta | Chamadas | Saída (raciocínio) | US$ | R$ |
|---|---|---|---|---|
| 1ª do dia, sem cache: resumo das últimas movimentações | 2 | 1.356 (226) | 0,186 | 1,02 |
| Gerar documento com modelo (lista os modelos) | 2 | 869 (89) | 0,035 | 0,19 |
| Dados do documento (busca o cliente) | 2 | 618 (147) | 0,029 | 0,16 |
| Completar os dados e gerar o documento | 2 | 873 (0) | 0,035 | 0,19 |
| **Total** | **8** | **3.716** | **0,284** | **1,56** |

O que mudou em relação à estimativa:

- **O prefixo tem ~25,4 mil tokens, não 15 mil.** São ~1,9 caracteres por
  token nas instruções e nos esquemas das tools, não 3,2. As tools são a maior
  parte.
- **2 chamadas por pergunta, não 3.** A saída ficou entre 0,6 e 1,4 mil
  tokens, com pouco raciocínio: de 0 a 150 tokens por chamada em `medium`.
- **Pergunta com o cache quente: R$ 0,16 a 0,19**, quase metade do estimado
  (R$ 0,32).
- **Pergunta fria: R$ 1,02**, mais que o estimado (R$ 0,74). Quase tudo é a
  escrita do prefixo de 25 mil tokens no cache: US$ 0,128.
- **84% da entrada veio do cache.** O prefixo escrito pela 1ª conversa foi
  lido pela 2ª um minuto depois, então o cache é dividido entre conversas e
  pessoas. O histórico também: a 2ª pergunta de uma conversa leu o 1º turno
  do cache.

A cada 1.000 perguntas por mês, o custo depende de quantas são frias, isto é,
feitas mais de 5 minutos depois do último uso de alguém do escritório:

- Com 30% frias: ≈ US$ 79 (R$ 435).
- Com 70% frias (uso espaçado): ≈ US$ 140 (R$ 770).

O que isso muda nas alavancas:

- **O custo pesado é a pergunta fria.** Há duas saídas:
  - **TTL de 1 hora no prefixo.** A escrita custa US$ 8 por milhão (US$ 0,20
    por escrita) e vale por uma hora. Compensa a partir de 2 perguntas frias
    por hora.
  - **Tools sob demanda** (`defer_loading`), para encolher os 25 mil tokens.

  Medir a proporção de frias numa semana de uso antes de escolher.
- **Esforço `low` no chat rende pouco.** O raciocínio já é curto em `medium`
  (≤ 150 tokens por chamada, menos de US$ 0,003). Não compensa o risco de
  conferir menos.

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

**Validação real (2026-10-26):** chave nova e migration 81 aplicada pelo
usuário. O usuário fez 4 perguntas no `/ia`; os números estão em "Medido na
Fase 1".

- **Funciona:**
  - chamada real ao `claude-opus-5-5`;
  - registro em `ai_usage` (8 de 8 chamadas, com custo);
  - cache do prefixo entre conversas e do histórico entre turnos;
  - conversa de vários turnos com o raciocínio anterior no histórico, sem
    400;
  - cinco tools: `listar_publicacoes`, `buscar_processos`, `listar_modelos`,
    `buscar_clientes` e `gerar_documento_de_modelo`.
- **Ainda não exercitado (para fechar a fase):**
  - pergunta com anexo seguida de outra pergunta na mesma conversa. É o caso
    em que o histórico muda e o `drop_block` entra;
  - ação com confirmação (criar tarefa, por exemplo);
  - leitura de documentos (Contratos) e "Redigir com IA". Nenhuma linha de
    `contract_reader` ou `drafting` ainda;
  - o chat do portal;
  - o teto com valor em `AI_MONTHLY_BUDGET_USD`;
  - continuar uma conversa antiga, do tempo do Gemini.

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

**Como ficou a validação (2026-10-27) — aguardando a avaliação do advogado:**

- **Onde está:** o prompt, o esquema e a montagem dos dados estão em
  `processSummary.ts` no scratchpad da sessão, e vão para
  `src/features/processos/summary/` se aprovado. A comparação ficou em
  `comparacao-resumos-medium.html`.
- **Configuração:** `claude-opus-5-5`, esforço `medium`, uma chamada por
  processo, só leitura no banco.
- **Custo:** R$ 0,18 a 0,44 por resumo (média R$ 0,31), 9 a 19 s. As duas
  rodadas custaram R$ 3,12.
- **Checagem automática:** toda fonte citada existe e toda data confere com a
  fonte, nos 5 processos.
- **Leitura prévia (de quem montou, não do advogado):**
  - **5017689: a BuscaProcessos está errada.** Ela diz que o pedido de efeito
    suspensivo não foi decidido. A publicação de 27/08 traz "Pelo exposto,
    DEFIRO o pedido de atribuição de efeito suspensivo". O Claude acertou.
  - **5021684 e 5015526:** o resumo da BuscaProcessos é anterior a decisões e
    prazos que o Claude já mostra (tutela deferida e suspensão pelo Tema 1.436
    do STJ; decurso do prazo de custas).
  - **5022806 e 5015528:** equivalentes; o Claude é mais detalhado.
- **Limite dos dados:** o Claude só tem o título das movimentações e o texto
  das publicações, não os autos, e diz quando algo não consta.
- **Diferença de público:** a BuscaProcessos escreve para leigo ("Situação
  agora: …"); o Claude, para advogado.
- **Duas correções na 1ª rodada:**
  - **Fuso:** `movement_date` guarda o DIA como meia-noite UTC (migration 72).
    Formatado em Brasília, cai no dia anterior, então o 1º rascunho mandou
    todas as datas com um dia a menos. O app faz certo nas telas internas
    (`iso.slice(0, 10)`), mas o **portal tinha esse erro**: `PortalProcessCard`
    e `formatOfficeDate` do chat do portal, além do card de monitoramento do
    dashboard. Corrigido à parte na branch `fix/portal-movement-day`.
  - **Prompt:** a 1ª frase do resumo passou a situar o caso (quem contra quem,
    objeto, valor). Antes ele omitia isso para "não repetir a capa".

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

**Como ficou a 2a (2026-10-27, branch `feat/resumo-processo-claude`, empilhada
na Fase 1).** O usuário mandou seguir ("continue o plano") depois da
comparação. A fase foi dividida em duas partes:

- **2a, feita:** gerar sob demanda, guardar, mostrar e parar de pagar o resumo
  da BuscaProcessos.
- **2b, a fazer:** atualizar sozinho, em lote, quando chega movimentação nova.
  Falta decidir o gatilho, e o repo não tem cron.

| Peça | Onde | O que faz |
|---|---|---|
| Tabela | migration 82 | `legal_process_summaries`: uma linha por processo, com `summary` (jsonb), `sources` (o que cada referência era: tipo, id, data, rótulo), modelo, quem gerou e quando. RLS: lê `processos:view`, grava `processos:update`. Também libera a rota `process_summary` em `ai_usage` |
| Módulo | `features/processos/summary/` | Prompt e esquema validados; `buildSummaryInput` (lê `movement_date` como dia); `cleanCitations` (tira referência inexistente e loga datas que não batem); `loadSummaryData`; `generateProcessSummary` |
| Rota | `POST /api/processos/[id]/resumo` | `processos:update`, teto do mês, dados e gravação com o client de quem pede, consumo em `ai_usage` com a rota `process_summary` (Opus 5.5, `medium`) |
| Card | `ResumoIaCard.tsx` | Fase, último ato, parágrafos, pontos de atenção e próximos passos, cada um com chips de fonte. O mouse mostra a fonte; o clique em M#/P# leva ao item da linha do tempo (zera filtro e busca, vai à página, destaca). Avisa quantas movimentações e publicações chegaram depois do resumo. Sem resumo novo, mostra o da BuscaProcessos marcado como antigo. "Gerar/Atualizar" só para quem pode editar o processo |
| Sync | `lib/buscaprocessos/sync.ts` | `DEFAULT_SYNC_BLOCKS` sem `resumo_ia`: processo novo deixa de pagar R$ 0,12 pelo resumo da BuscaProcessos |
| Assistente | `detalhar_processo` | Devolve o resumo do Claude quando existe; senão, o antigo, com a origem dita |

Verificado:

- tsc, lint e build.
- Os módulos reais de `src` com o Claude, num processo de 45 movimentações:
  gerado em 20 s, sem referência inexistente.
- O card renderizado em 13 de 13 checagens: chips, aviso de novidades, estado
  vazio, resumo antigo e sem botão para quem não pode editar.

**Na tela (2026-10-27):** o usuário aplicou a migration 82 e gerou o resumo
pela página do processo.

- **Gravado:**
  - 1 resumo (processo 5015529, às 10:24): 13 fontes, todas ainda no banco;
  - 17 citações, nenhuma inexistente;
  - data do último ato igual à da fonte;
  - `generated_by` preenchido.
- **Consumo:** 1 linha `process_summary` em `ai_usage`, com 3.347 tokens de
  entrada e 1.083 de saída (257 de raciocínio). Custou US$ 0,035 (R$ 0,19).
- **De quebra:** às 09:44 houve 2 chamadas na rota `portal`. Uma pergunta de
  cliente passou pelo Claude e foi registrada, o que valida o portal na
  Fase 1.
- **Em aberto:**
  - O usuário confirmou que gerou só nesse processo.
  - A navegação pelos chips não foi conferida.
- **Commit:** `ee4ebc7`.

**Fase 2b — atualização automática (2026-10-27, mesma branch).**

Decisões do usuário:

- **Gatilho:** na chegada de movimentação e ao abrir o processo.
- **Alcance:** só os processos que já têm resumo.

| Peça | Onde | O que faz |
|---|---|---|
| Reserva | migration 83 | `legal_process_summaries.refreshing_since`: quem vai refazer marca com um UPDATE condicional, e só um chamador simultâneo passa. A reserva vence em 5 min se a função morrer |
| Regra | `summary/refreshProcessSummary.ts` | Refaz só se o processo já tem resumo, se chegou movimentação ou publicação depois dele e se o último tem mais de 15 min. Confere o teto do mês. Lê e grava pela service_role, com `generated_by` nulo. Nunca lança: devolve o desfecho (`refreshed`, ou `skipped` com o motivo, ou `failed`) |
| Na chegada | webhook da BuscaProcessos e `POST /api/buscaprocessos/sync` | Depois de responder (`after()`, `maxDuration` 120), refaz os processos das linhas inseridas. No sync, só quando as movimentações foram consultadas |
| Ao abrir | `POST /api/processos/[id]/resumo/atualizar` + `ProcessoDetailPage` | Com novidades depois do resumo, a página pede uma vez por visita. Basta `processos:view`: a regra limita o gasto. O aviso de novidades vira "Atualizando…" enquanto isso. Se outra atualização está em curso, relê em 30 s |

O que sobra de uma rajada (movimentações chegando dentro dos 15 minutos) se
refaz na próxima chegada ou quando alguém abrir o processo.

Verificado:

- tsc, lint e build.
- Com dados reais e sem gravar:
  - processo sem resumo é pulado;
  - processo com resumo e sem novidade sai como "em dia".

**Teste completo (2026-10-27, migration 83 aplicada pelo usuário):** o teste
tornou velho o resumo do 5015529 e disparou duas atualizações ao mesmo tempo.
Passou em 4 de 4 checagens:

- uma refez e a outra saiu como `busy`;
- o resumo foi gravado sem autor e com a reserva liberada;
- logo depois, sem novidade, saiu como "em dia";
- processo sem resumo é pulado.

Em `ai_usage` entrou **uma** geração só (R$ 0,19): a reserva evitou a
segunda. O resumo novo tem 13 fontes, todas no banco, e 20 citações, sem
nenhuma inexistente.

**Não verificado:** uma entrega real do webhook disparando a atualização, e o
"Atualizando…" na tela logada.

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

**Como ficou (2026-10-27, branch `feat/portal-perguntas-fixas`, empilhada na
Fase 2).**

- **Base:** a correção de datas do portal foi trazida por cherry-pick
  (`5f8da4d`, igual a `1602826` de `fix/portal-movement-day`), para as duas
  branches não conflitarem.
- **Gatilho:** o mesmo da 2b — na chegada e quando o cliente escolhe o
  processo no chat.
- **Em forma de chat, não dentro do processo** (pedido do usuário depois da
  primeira versão, que punha as perguntas no card aberto): um botão fixo
  "Tirar dúvidas" abre a conversa, o cliente escolhe o processo e depois a
  pergunta, tudo por botões, sem campo de texto. Com um processo só, a escolha
  do processo é pulada. A conversa vale até recarregar a página e não é
  gravada.

Três decisões de desenho, tomadas sem perguntar:

- **Impressão digital acima do intervalo.** Ao escolher o processo, refaz sempre que o
  recorte visível mudou, sem esperar 15 minutos: resposta defasada nunca é
  mostrada, porque pode falar de movimentação que o escritório ocultou. Na
  chegada vale o intervalo de 15 minutos, e só para processos que já têm
  respostas.
- **Sem a data de hoje no pedido.** A resposta só muda quando os dados
  mudam, não a cada dia. A pergunta de datas informa a data como aparece,
  sem dizer se já passou.
- **Correção substituída.** Quando a resposta é refeita, a correção do
  escritório sai do ar e vira aviso na revisão; o que foi ocultado continua
  oculto.

| Peça | Onde | O que faz |
|---|---|---|
| Tabela | migration 84 | `client_portal_answers`: uma linha por processo, com `answers`, `corrections`, `hidden`, `superseded`, `source_hash`, modelo, data e a reserva `refreshing_since`. RLS: lê `processos:view`, revisa `processos:update`; só a service_role cria |
| Módulo | `features/portal/answers/` | Perguntas e esquema; prompt (as regras do antigo chat, para quatro respostas sem conversa); leitura do recorte visível (`hidden_from_client = false`, as colunas do portal) e impressão digital; `ensurePortalAnswers` (reserva, teto, rota `portal` do `ai_usage`, Opus 5.5 `low`) |
| Portal | `POST /api/portal/[token]/processos/[id]/respostas`, `PortalQuestionsChat.tsx` | Botão fixo "Tirar dúvidas" → painel de chat: escolher o processo busca as quatro respostas de uma vez; escolher a pergunta mostra a resposta, sem nova chamada; "Escolher outro processo" volta à lista. No rodapé, "Falar com o escritório" com o telefone e o e-mail de Configurações e o aviso de IA. Enquanto outra geração roda, "Preparando…" e nova pergunta a cada 4 s. O vínculo processo × cliente do token é reconferido (`isPortalProcessOfClient`) |
| Escritório | `GET/POST/PATCH /api/processos/[id]/portal-respostas`, `PortalAnswersReview.tsx` | Na página do processo com cliente, um painel recolhido: as respostas como o cliente vê, aviso de desatualizadas, "Preparar/Atualizar agora", e por pergunta corrigir, voltar ao texto da IA, ocultar ou mostrar e dispensar o aviso de correção substituída. Cada ação é validada com zod e gravada pela sessão |
| Na chegada | webhook e sync | No mesmo `after()` do resumo |
| Saiu | — | O chat livre: rota `/api/portal/[token]/assistente`, `PortalAssistant.tsx`, `portal/assistant/*` e `lib/clientPortal/chat.ts`. `client_portal_chat_messages` fica como histórico |

Verificado:

- tsc, lint e build.
- Com dados reais e uma geração no processo 5022806 (10 s, R$ 0,14), 17 de 17
  checagens:
  - o recorte não leva id interno, a impressão é estável e muda ao ocultar ou
    editar movimentação;
  - as quatro respostas saíram sem contato inventado, sem "não há", sem
    Markdown, e a de datas citou a audiência de 12/11/2026;
  - a correção substitui o texto da IA e a pergunta oculta some.
- O chat, no navegador em tela de celular (página temporária com dados
  fictícios e a rota simulada; o hook e o serviço são os reais): escolher o
  processo, "Preparando…" com nova pergunta até ficar pronto (3 chamadas),
  pergunta respondida sem nova chamada, trocar de processo, fechar e reabrir
  mantendo a conversa, processo único sem a escolha e sem busca antes de
  abrir, e falha com "Não consegui preparar".
- **Uso real (2026-10-27, migration 84 aplicada pelo usuário):** o cliente
  escolheu 4 processos no chat; 4 linhas em `client_portal_answers`, todas com
  a impressão digital igual ao que o portal mostra, reserva liberada e 4
  chamadas `portal` no `ai_usage` (uma por processo; nenhuma do escritório).
  Cada geração: ~2,4 mil tokens de entrada, 720–800 de saída, sem raciocínio
  (`low`), US$ 0,024–0,026 (≈ R$ 0,14); as 4, R$ 0,55. As respostas seguiram
  as regras (sem contato, sem "não há", sem Markdown; datas como "nas
  movimentações publicadas não aparece"), mas copiaram a estrutura do prompt:
  "Em uma frase:", "Na minha explicação:", "(texto do tribunal)", e uma falou
  em "leitura nossa", como se fosse o escritório.
- **Prompt v2** (pedido do usuário): as instruções que viravam rótulo foram
  reescritas (o título vai entre aspas e as aspas já separam o texto do
  tribunal da explicação), com regra de não anunciar o formato, de falar do
  escritório na terceira pessoa e de não especular sobre o conteúdo de atos
  que o título não descreve. A versão entra na impressão digital, então as
  respostas da v1 são refeitas quando o cliente escolhe o processo. Geração
  real, sem gravar, nos dois processos com problema: 17 de 17 checagens, sem
  rótulos nem primeira pessoa, título citado entre aspas, 9 s e R$ 0,15 cada.

**Não verificado:**

- A exclusão de movimentação oculta com caso real: hoje não há nenhuma no
  banco.
- A revisão gravada: depois do teste do usuário não ficou correção, pergunta
  oculta nem aviso em nenhuma linha.

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

**Como ficou a 4a (2026-10-27, branch `feat/ia-painel-global`, de
`feat/portal-perguntas-fixas`):**

| Peça | Onde | O que faz |
|---|---|---|
| Painel | `features/ia/components/AssistantPanel.tsx` | Ao lado do conteúdo no layout do app. Em tela de 1280 px ou mais, fica à direita (420 px) e o conteúdo encolhe; abaixo disso, por cima, e no celular ocupa a tela. Barra com conversas (a mesma lista do /ia), nova conversa, abrir no /ia e fechar. Monta na primeira abertura; fechar só esconde, então a conversa (e uma resposta ainda chegando) sobrevive. No /ia não aparece |
| Botão e atalho | `AssistantPanelButton.tsx` no `Header`; Ctrl+J / ⌘J | Só para quem tem `ia:view`, a mesma permissão da rota. O ⌘K já era a busca |
| Estado | `features/ia/stores/assistantPanel.store.ts` (zustand) | Aberto/fechado, a conversa do painel e o que cada tela registrou. A conversa atravessa a troca de tela |
| Contexto da tela | `features/ia/context/screenContext.ts`, `hooks/useAssistantScreen.ts` | Cada tela registra o registro aberto (tipo, id, rótulo) e os filtros visíveis. Vai com a pergunta como parte `data-context`, gravada com ela em `ai_messages.parts`: o histórico sai igual a cada turno (cache e raciocínio dependem disso) e cada pergunta guarda a tela daquele momento |
| Rota | `api/ia/chat/route.ts` | Valida a parte com zod (`dataSchemas`: id uuid, só os tipos conhecidos, limites de tamanho; outra parte de dados é recusada) e a converte num bloco `<tela_atual>` no começo da pergunta. O `system` não muda por tela |
| Prompt | `prompts/system.ts`, seção "Tela atual" | O registro em foco resolve "isto" e "este processo"; o id serve direto nas tools e nas ações; o bloco não é pedido e não aparece para o usuário |
| Telas ligadas | detalhe de processo (com o cliente), cliente, pessoa, contrato (com cliente e processo) e publicação (com o processo); filtros de Tarefas, Processos e Financeiro | Na tela, o chip com o registro em foco fica acima do campo e em cada pergunta do histórico |

- **Compromisso e audiência ficaram de fora.** Abrem em modal do Radix, que
  trava o resto da tela (foco, clique e leitores de tela), o painel
  inclusive. Com o modal aberto não há como digitar no painel, e ao fechar o
  registro some. A audiência entrou na 4b, pelo botão "Preparar com o
  Assistente" da própria ficha; compromisso segue de fora.
- **Verificação:**
  - tsc, lint e build;
  - `verify-panel-context.mjs` (scratchpad), 21 checagens sem modelo: ordem
    e limites do contexto, o bloco (um rótulo não fecha o `<tela_atual>`),
    a validação da rota recusando id inválido, tipo desconhecido, parte de
    dados desconhecida e rótulo grande, e conversão determinística;
  - com o modelo real (Opus 5.5, sem gravar nada), num processo:
    - "Resuma isto" foi direto ao `detalhar_processo` com o id do bloco, sem
      buscar;
    - "Crie uma tarefa para este processo…" propôs `criar_tarefa` com o
      `processo_id` certo;
    - 2 turnos, R$ 0,92, quase tudo na escrita do prefixo (26 mil tokens); o
      segundo turno leu o prefixo do cache;
  - no navegador, com página temporária (usuário, permissão e rota do chat
    simulados; painel, botão, store, chat e a barra de filtros de Tarefas
    reais):
    - Ctrl+J abre e não deixa o navegador agir;
    - a pergunta sai com o processo em foco e o filtro "só atrasadas";
    - fechar e reabrir mantém a conversa, inclusive fechando com a resposta
      chegando;
    - histórico com o chip, nova conversa e o link para o /ia;
    - 1440 px ao lado, 1024 px por cima, celular em tela cheia sem rolagem
      lateral.
- **Não verificado:** as telas reais logadas (o detalhe de cada registro
  passa no tsc, mas o rótulo de cada um só aparece com login) e a volta do
  /ia para o painel (que deve carregar a conversa do banco).
- Em desenvolvimento, o botão do TanStack Query Devtools cobre o Enviar do
  painel; o Enter envia. Em produção o botão não existe.

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

**Como ficou a 4b (2026-10-27, branch `feat/ia-acoes-rapidas`, de
`feat/ia-painel-global`):**

| Peça | Onde | O que faz |
|---|---|---|
| Ações | `features/ia/context/quickActions.ts` | Pelo registro em foco (processo: Resumir, O que mudou desde…, Preparar audiência; publicação: Explicar e sugerir providência; cliente: Panorama, Rascunhar atualização) ou pela página (Dashboard: Briefing do dia). O pedido fixo aparece na conversa como se a pessoa tivesse digitado, com a tela junto. "O que mudou desde…" só preenche o campo, com o cursor no fim, para a pessoa pôr a data |
| Botões | `ChatPanel.tsx`, acima do campo do painel | Desativados enquanto a resposta chega ou há ação a confirmar. Não mexem no que a pessoa está digitando nem nos anexos. Com ações na tela, as sugestões gerais saem do estado vazio. Vão para a conversa aberta no painel (o "+" começa outra) |
| Audiência | `HearingDetailModal.tsx` → `askAssistant` no store | O modal trava o painel, então a ficha tem o botão "Preparar com o Assistente" (audiência em aberto, quem tem `ia:view`). Ele fecha a ficha, abre o painel e manda o pedido com a audiência e o processo como contexto, montado no clique. O chat envia quando fica livre, uma vez só |
| `ver_audiencias` | `tools/read/hearings.ts` | Pelo processo ou pela audiência: tipo, situação, data, modalidade, local ou link, data conferida, o andamento de origem e o checklist (feito, pendente, não se aplica, o que o cliente traz). Checklist que ainda não nasceu é dito, não vira lista vazia |
| `calcular_prazo` | `tools/read/publications.ts` | `calculatePrazo` de `src/lib/prazos` a partir da data de publicação GRAVADA: o modelo só escolhe os dias e a contagem. Corridos = direito material, sem a suspensão do recesso (a regra do motor). Avisa que feriados locais não entram |
| Quem pergunta | `tools/read/team.ts` | `membros_do_escritorio` marca `voce: true`. Antes o modelo não sabia quem era "eu" — nem a regra "use o próprio usuário" do `criar_evento` tinha como funcionar |
| Agenda por cliente | `tools/read/agenda.ts` | `eventos_no_periodo` aceita `cliente_id` (o panorama) |
| Copiar | `ChatPanel.tsx` | Toda resposta tem "Copiar". O rascunho para o cliente vem entre duas linhas `***` (regra do `system`); com exatamente um par, aparecem "Copiar mensagem" (só o trecho) e "Copiar tudo". `***` e não `---`: no Markdown, `---` colado embaixo de texto vira título, e a última frase da mensagem aparecia em destaque |
| Prompt | `prompts/system.ts` | Seções "Prazos" (a data nunca sai do modelo; dias do texto, e sem dias no texto ele diz o prazo usual com a base legal e pergunta antes de calcular), "Audiências" e "Mensagens para clientes" |

- **Cache do histórico (correção da Fase 1):** a marca no fim do histórico,
  posta a cada passo pelo `prepareStep`, ficava nas mensagens dos passos
  seguintes. Num turno de 4 passos eram 5 marcas, acima do teto de 4, e o AI
  SDK avisava que uma seria ignorada. `withHistoryBreakpoint` agora tira as
  marcas anteriores; o cache já gravado continua valendo, porque cada marca
  procura acerto até 20 posições para trás.
- **Verificação:**
  - tsc, lint e build;
  - `verify-quick-actions.mjs` (scratchpad), sem modelo e só leitura do
    banco, 17 checagens:
    - o mapa de ações por tela;
    - `calcular_prazo` igual ao motor (o início bate com o da tela; corridos
      sem recesso; publicação desconhecida não dá data);
    - `ver_audiencias` por audiência e por processo;
    - só quem pergunta com `voce`;
    - a agenda por cliente;
  - com o modelo real (Opus 5.5, sem gravar nada), as quatro ações como o
    painel as manda, cada uma numa conversa nova:
    - **Publicação #115:** leu pelo id da tela e calculou os 5 dias do texto
      pelo `calcular_prazo` (vencido em 03/09/2026). Não propôs tarefa,
      porque o processo não diz que parte o escritório representa, e
      perguntou.
    - **Audiência Una de 12/11:** `ver_audiencias` pelo id, sem buscar o
      processo. Apontou que a ficha não tem modalidade nem local e que a data
      não foi conferida (por isso não há checklist), e que o endereço do fórum
      diverge entre os documentos.
    - **Briefing:** achou quem pergunta e buscou as tarefas pelo id dessa
      pessoa, a agenda do dia e as publicações não lidas.
    - **Rascunho para a Central Turbos:** a mensagem em texto simples entre
      as linhas e, fora delas, os alertas para o advogado: custas sem
      comprovante e prazos vencidos, e o nome diferente no cadastro.
    - Quatro rodadas, cerca de R$ 7 a 8 ao todo (a saída de uma se perdeu,
      então a soma é estimada). As duas últimas, depois das correções,
      tiveram 24 e 22 checagens passando. Sem aviso de marca de cache em
      turnos de 4 e 5 passos.
  - no navegador, com página temporária (usuário, permissões, rota do chat e
    a ficha da audiência simulados; painel, botões, store e o modal real da
    audiência):
    - os três botões do processo;
    - o preencher com foco e cursor no fim;
    - o Resumir saindo com a tela;
    - os botões desativados durante a resposta;
    - "Copiar mensagem" e "Copiar tudo" com o texto certo;
    - o rascunho sem título falso;
    - o modal fechando e o pedido da audiência saindo uma vez, com a
      audiência e o processo.
- **Não verificado:**
  - as telas reais logadas;
  - o briefing com compromissos e tarefas de verdade (hoje não havia nenhum
    do usuário);
  - "Panorama" com o modelo (a tool nova por cliente passou sem modelo);
  - a tarefa do prazo proposta de fato: na publicação testada o modelo,
    corretamente, perguntou antes.

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

**Decisões do usuário (2026-10-27):** D4Sign e InfinitePay **entram, com card
reforçado**. Fica **card + `abrir_tela`**, sem `abrir_formulario`: as ações
novas já gravam por card, e abrir os diálogos de fora pediria mexer em cada
um.

**Como ficou a 4c (2026-10-27, branch `feat/ia-acoes-tela`, de
`feat/ia-acoes-rapidas`):**

| Peça | Onde | O que faz |
|---|---|---|
| Ações com card | `tools/actions.ts` (`screenActionTools`), `actions/screenActions.ts` | `concluir_tarefa`, `reatribuir_tarefa`, `remarcar_evento`, `criar_audiencia`, `registrar_lancamento`, `vincular_publicacao`, `tratar_publicacao`. Cada executor chama o service da tela; o `useExecuteAction` invalida o cache do módulo só quando gravou |
| Remarcar | `rescheduleEvent` | O mesmo caminho do arraste da Agenda (`toEventMovePatch` + `updateEvent`, só esta ocorrência), mantendo a duração. Vencimento de contrato é recusado (muda pelo contrato). Audiência acompanha pelo gatilho `sync_event_hearing` (migration 76), que registra a troca de data e a dá como conferida |
| Criar audiência | `createHearingAction` | `createHearing` + `schedule_hearing`, com a duração do tipo; tipo vem da tool nova `tipos_de_audiencia` |
| Lançamento | `registerFinancialEntry` | Passa pelo `financialEntrySchema` do formulário (vencimento ou condição) |
| Vincular publicação | `linkPublicationToProcess` (novo, em `publications.service`) | Uma publicação a um processo escolhido, inclusive de outro CNJ; o card avisa quando o CNJ é diferente |
| Assinatura (reforçado) | `actions/signaturePlan.ts`, `SignatureActionCard.tsx` | A IA escolhe SÓ o arquivo (e o contrato). Quem assina vem do cadastro, como no diálogo: as partes do contrato ou o cliente do documento, e o cofre do tipo (`resolveSafe`). Para isso a montagem da lista saiu do `SendForSignatureDialog` para `assinaturas/utils/signerDrafts.ts`, usado pelos dois. Autenticação por e-mail, sem ordem. O card mostra a lista lida do banco e bloqueia quando falta cofre, e-mail ou o arquivo não pode ir |
| Cobrança (reforçado) | `PaymentLinkActionCard.tsx` | `createPaymentLink` pela rota de sempre. O card lê o lançamento do banco (não os rótulos do modelo) e bloqueia despesa, lançamento não pendente e link já ativo; gerado, mostra o link para copiar. Nada vai ao cliente |
| Dois passos | `ReinforcedActionFooter.tsx` | "Confirmar" só arma; o aviso diz o que acontece fora do escritório; é o segundo botão ("Enviar agora", "Gerar link") que executa |
| `abrir_tela` | `tools/interface.ts`, `ChatPanel` (`onToolCall`) | Registro pelo id ou módulo; no Financeiro, a situação vai na URL (o que a página já lê). Roda no navegador: no painel a tela muda; no /ia vira link no chat, porque sair da página cortaria a conversa. O resultado volta ao modelo e o chat reenvia sozinho |
| Prompt | `prompts/system.ts` | A lista das ações; "Ações que saem do escritório": assinatura e cobrança só quando o usuário pedir, nunca por iniciativa nem como passo de outro pedido |
| Outros | `ver_contrato`, services | Lançamentos do contrato com id (para a cobrança); `getEventById`, `getDocumentRecord`, `getFinancialEntryById`; os helpers de invalidação de audiência, cobrança e publicação foram exportados |

- **Verificação:**
  - tsc, lint e build;
  - `verify-screen-actions.mjs` (scratchpad), com o modelo real (Opus 5.5,
    nada gravado: as tools de ação não executam no servidor):
    - 4 checagens das rotas sem modelo e 12 com o modelo, todas passando
      (o cenário 6 foi refeito em dois turnos, ver abaixo), em 12
      conversas, R$ 3,57;
    - cada ação veio com os ids certos a partir da fala e da tela: tarefa,
      Carla, a audiência Una de 12/11 para 19/11 14:20, conciliação em 20/11
      10h presencial, honorários de R$ 1.500 do cliente, a procuração do
      cliente para assinatura, o link da "Conta X" e o Financeiro nos
      vencidos;
    - ao vincular a publicação #186 a um processo de outro caso, o modelo
      apontou a diferença e só propôs depois da confirmação;
    - "Explicar" uma publicação não propôs envio, cobrança nem marcar como
      tratada;
  - no navegador, com páginas temporárias (Supabase simulado em memória, que
    registra cada escrita; rotas de assinatura e cobrança simuladas; cards,
    executores e `ChatPanel` reais):
    - as sete ações simples gravaram o esperado, inclusive o feed;
    - o compromisso foi de 12/11 17:20Z para 19/11 17:20Z mantendo 1 h;
    - a audiência teve o `schedule_hearing` de 13:00Z a 13:30Z;
    - assinatura: o primeiro clique não chama nada e "Voltar" desarma; o
      envio mandou à rota o signatário do cadastro (razão social, CNPJ,
      e-mail, cofre Procurações, autenticação por e-mail);
    - cliente sem e-mail e despesa bloqueiam o card, que só oferece Cancelar;
    - cobrança: o link volta com "Copiar link";
    - `abrir_tela`: no /ia vira link e o chat reenvia; no painel navega (sem
      sessão, o servidor mandou para o login com o filtro).
- **Não verificado:**
  - nada disso com sessão e banco reais: nenhuma ação foi confirmada contra o
    banco, a D4Sign ou a InfinitePay;
  - envio de contrato com partes (não há arquivo de contrato no banco);
  - recorrência real (tarefa e compromisso em série).

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
