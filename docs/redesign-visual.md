# Redesign visual — Prisma + Relevo

> Status: **plano para aprovação** (2026-11-17)
> Prévia interativa: https://claude.ai/artifact/CZWUydf8pkApcyhQMdC7BU (sidebar "Escolhida")
> Substitui o tema "Graphite" de `src/app/globals.css`. Substitui também o rascunho
> descartado `docs/cores.md` (Azul royal), que sai na fase 0.

## Problema

O tema atual tem neutros sem matiz, botão principal preto ou branco e a sidebar
branca sobre fundo quase branco. O cliente resumiu: "a tela está muito branca, queria
mais tons". O tema escuro tem o mesmo problema ao contrário: quase preto.

## Objetivo

Dar cor e profundidade ao app inteiro, nos dois temas, com aparência de software
profissional e sem gradientes.

## Critérios de aceite

- [ ] No tema claro, a sidebar é azul-noite e o fundo da página é azul claro. Não sobra
      nenhuma área grande em branco puro além dos cards de conteúdo.
- [ ] No tema escuro, o fundo é azul-noite (não preto) e a sidebar tem a cor dos cards.
- [ ] Todo controle clicável (botão, item ativo do menu, paginação) tem aparência de
      tecla e desce ao ser pressionado.
- [ ] Todo campo que recebe texto ou escolha (input, textarea, select, busca, abas)
      tem aparência de trilho rebaixado.
- [ ] Texto, botões e badges passam no contraste WCAG AA (4,5:1) nos dois temas.
- [ ] Nenhuma tela mantém cor fixa que só funciona num tema (`bg-white`, `slate-*`,
      hex soltos), exceto onde a cor vem do usuário (tipos de evento, etiquetas).
- [ ] `tsc`, `lint` e `build` sem erros novos. Conferência no navegador, nos dois temas,
      das telas listadas na fase 5.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Direção | Mistura Prisma + Relevo: cor e layout do Prisma, teclas e trilhos do Relevo |
| Cor da marca | Cobalto — `#2f54eb` no claro, `#6b84ff` no escuro (com texto azul-noite nos botões) |
| Sidebar | Azul-noite (`#111b45`) no claro; cor dos cards (`#111834`) no escuro |
| Conteúdo | "Com tons": fundo azulado, indicadores tingidos, cabeçalho de tabela em azul |
| Relevo | Equilibrado: tecla com 2 px de borda inferior (`--edge: 2px`) |
| Tipografia | Plus Jakarta Sans (interface) e Geist Mono (números, CNJ, atalhos) |
| Gradientes | Nenhum. Só cores sólidas e sombras |
| Temas | Claro e escuro, com o mesmo seletor de hoje |

## Paleta

Os valores abaixo foram conferidos por script (contraste AA), não a olho.

### Tokens do shadcn que já existem

| Token | Claro | Escuro |
|---|---|---|
| `--background` | `#e2e8f7` | `#0a0f1f` |
| `--foreground` | `#0e1530` | `#e8ecfb` |
| `--card` | `#ffffff` | `#111834` |
| `--popover` | `#ffffff` | `#151d3b` |
| `--primary` | `#2f54eb` | `#6b84ff` |
| `--primary-foreground` | `#ffffff` | `#0a0f1f` |
| `--secondary` | `#f4f6fb` | `#151d3b` |
| `--muted` (vira o trilho) | `#e2e7f1` | `#080c1a` |
| `--muted-foreground` | `#55607e` | `#97a2c6` |
| `--accent` | `rgba(47,84,235,.10)` | `rgba(99,128,255,.16)` |
| `--accent-foreground` | `#2445d4` | `#93a6ff` |
| `--border`, `--input` | `#dde3ee` | `#222c50` |
| `--ring` | `#2f54eb` | `#6b84ff` |
| `--destructive` | `#b92c44` | `#ff6b82` |
| `--destructive-foreground` (novo) | `#ffffff` | `#2a0610` |
| `--success` | `#0a7350` | `#3fd39a` |
| `--warning` | `#975000` | `#f5b84a` |
| `--info` | `#0a6898` | `#4cc3f0` |
| `--chart-1` | `#2f54eb` | `#6b84ff` |
| `--sidebar` | `#111b45` | `#111834` |
| `--sidebar-foreground` | `#ffffff` | `#e8ecfb` |
| `--sidebar-primary` | `#2f54eb` | `#4563fa` |
| `--sidebar-primary-foreground` | `#ffffff` | `#ffffff` |
| `--sidebar-accent` (item ativo) | `#24316f` | `#1b2448` |
| `--sidebar-accent-foreground` | `#ffffff` | `#e8ecfb` |
| `--sidebar-border` | `#070d2a` | `#05081a` |
| `--sidebar-ring` | `#a9b8ff` | `#93a6ff` |

`--chart-2` a `--chart-5` (áreas jurídicas) não mudam.

No escuro, o cobalto da prévia (`#4563fa` com texto branco) dava só 3,6:1 quando usado
como cor de texto sobre os cards, e o app usa `text-primary` como texto em 92 lugares.
O `#6b84ff` com texto azul-noite passa nos dois papéis (5,3:1 como texto, 5,8:1 no botão).
A sidebar escura continua com `--sidebar-primary` em `#4563fa` e texto branco (4,75:1).

### Tokens novos

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--sidebar-muted-foreground` | `#b9c3e6` | `#97a2c6` | itens inativos do menu (hoje `text-sidebar-foreground/60`) |
| `--key` | `#ffffff` | `#1b2448` | face da tecla neutra |
| `--key-hl` | `#ffffff` | `rgba(255,255,255,.08)` | luz na borda de cima |
| `--key-edge` | `#c6cee0` | `#05081a` | borda e base da tecla |
| `--key-drop` | `rgba(14,21,48,.14)` | `rgba(0,0,0,.55)` | sombra da tecla |
| `--primary-edge` | `#1d3cb5` | `#2a40c4` | base da tecla cobalto |
| `--well-shadow` | `rgba(14,21,48,.13)` | `rgba(0,0,0,.6)` | sombra interna do trilho |
| `--groove-dark`, `--groove-light` | `#e4e9f2`, `#ffffff` | `#0b1024`, `#1a2244` | divisória gravada das tabelas |
| `--edge` | `2px` | `2px` | altura da tecla; desce isso ao clicar |

## Sistema

### Três planos

1. **Trilho rebaixado**: campos, busca, abas, medidores, checkbox desmarcado.
2. **Superfície**: cards, sidebar, diálogos.
3. **Tecla levantada**: botões, item ativo do menu, aba ativa, contadores, paginação.

Regra: só o que é clicável vira tecla. Texto estático com borda de tecla convida a um
clique que não faz nada.

### Utilitários no `globals.css`

O Tailwind é v4, então os utilitários entram com `@utility` e ficam disponíveis como
classe em qualquer componente:

- `key` e `key-primary`: face, luz, borda e base da tecla; `active:` desce `--edge`.
- `key-sm`: tecla baixa para aba ativa e item de menu.
- `well`: fundo `--muted` com sombra interna.
- `groove`: divisória gravada (linha escura com linha clara embaixo).

### Forma

`--radius` sobe para 10 px: teclas com `rounded-lg` (10 px), cards com `rounded-2xl` (18 px) e sidebar com `rounded-3xl` (22 px). Busca e avisos em pílula.

## Fases

Uma branch por fase, empilhadas, com PRs para `release/redesign-visual`. Um único PR
dessa branch vai para a `main`, então é um deploy só. Toda branch nasce com `--no-track`.

### Fase 0 — Limpeza

- Remover o bloco `PREVIEW-CORES` do fim de `src/app/globals.css` e o arquivo
  `docs/cores.md`. Os dois são do rascunho descartado e estão sem commit na branch
  `feat/ia-config-uso`.

### Fase 1 — Tokens e fontes

- `src/app/globals.css`: paleta das tabelas acima, tokens novos e os utilitários.
- `src/app/layout.tsx`: `Hanken_Grotesk` dá lugar a `Plus_Jakarta_Sans` e
  `JetBrains_Mono` a `Geist_Mono`. As variáveis (`--font-sans`, `--font-mono`) não
  mudam, então nada mais precisa ser tocado.
- Resultado: o app inteiro na paleta nova, ainda com os componentes planos.

### Fase 2 — Componentes base (`src/components/ui/`)

| Arquivo | Muda para |
|---|---|
| `button.tsx` | `default` vira tecla cobalto; `outline` e `secondary` viram tecla neutra; `destructive` vira tecla vermelha (é o botão de confirmar exclusão nos diálogos); `ghost` e `link` continuam sem relevo |
| `input.tsx`, `textarea.tsx`, `input-group.tsx` | trilho; foco com anel cobalto |
| `select.tsx` | gatilho em trilho; lista em `bg-popover` |
| `tabs.tsx` | lista em trilho, aba ativa em tecla |
| `checkbox.tsx` | trilho desmarcado, tecla cobalto marcado |
| `switch.tsx` (**novo**) | interruptor com trilho e botão. Usa o `Switch` do pacote `radix-ui`, que já é dependência |
| `badge.tsx` | pílula com fundo suave na cor do estado |
| `card.tsx` | canto de 18 px, sombra em camadas e luz na borda de cima |
| `table.tsx` | cabeçalho em faixa azul clara, linhas com divisória gravada |
| `progress.tsx` | trilho com barra cobalto |
| `sonner.tsx` | aviso escuro com ação em tecla |
| `dialog.tsx`, `sheet.tsx` | fundo do overlay por token no lugar de `bg-black/50` |

O app usa `<Button>` em 340 lugares (151 com `variant="outline"`, 87 com `ghost`).
Como a mudança fica nas variantes, esses lugares não precisam ser editados um a um.

### Fase 3 — Estrutura

- `src/app/(app)/layout.tsx`: o shell ganha respiro (`p-3 gap-3`) para a sidebar
  flutuar.
- `src/components/layout/Sidebar.tsx`: cartão arredondado com `bg-sidebar`; item ativo
  em tecla com `--sidebar-accent`; contadores em tecla; versão recolhida (`w-14`)
  também flutuante.
- `src/components/layout/Header.tsx`: perde a barra (`bg-card border-b`) e fica sobre o
  fundo; busca em trilho; botões de tema e notificação em tecla redonda.

### Fase 4 — Telas

- **Dashboard**: indicadores com fundo tingido na cor do assunto e ícone sólido
  (`DashboardCard.tsx`, `TONE_CHIP_CLASSES`); minigráfico na mesma cor.
- **Cores fixas**: 50 ocorrências de `bg-white`, `text-black`, `slate-*`, `zinc-*`,
  `gray-*` e `neutral-*` em 26 arquivos, e hex em 5 arquivos. Trocar por tokens, exceto
  `ColorPicker.tsx` e as cores escolhidas pelo usuário.
- **Superfícies que supõem fundo branco**: `bg-background` aparece em 24 arquivos. Com
  o fundo azulado, o que flutua passa a `bg-popover` e o que fica na página, a `bg-card`.
  Revisar um a um.
- **Configurações**: as miniaturas do seletor de tema (`ConfiguracoesContent.tsx`) são
  refeitas com a paleta nova.
- **Portal `/acompanhar`**: conferir; ele não tem sidebar, só herda cores e botões.

### Fase 5 — Verificação e documentação

- `tsc`, `lint` e `build` sem erros novos.
- Navegador, nos dois temas: Dashboard, Processos, Agenda, Tarefas, Financeiro,
  Assistente, Configurações, sidebar recolhida, busca ⌘K, diálogos e avisos, e o
  portal `/acompanhar`.
- Reescrever `docs/DESIGN-SYSTEM.md` com o sistema novo.

## Decisões abertas

Cada uma tem uma recomendação. Aprovar o plano sem comentário aceita as recomendações.

1. **Botão "Novo" no topo da sidebar.** Não existe hoje. Recomendação: entra, abrindo
   um menu com Processo, Tarefa, Cliente, Audiência e Lançamento, que levam aos
   formulários que já existem.
2. **Atalhos de teclado.** A prévia mostra `N`, `Esc` e `Ctrl+Enter`. Recomendação: só
   mostrar teclas de atalho que existem de verdade (hoje, `⌘K`). Criar atalhos novos
   fica para depois.
3. **Saudação e ações rápidas no Dashboard.** Recomendação: entram na fase 4, como
   atalhos para fluxos que já existem.
4. **Contadores da sidebar.** Hoje são âmbar (`bg-warning`) porque indicam prazo
   correndo. Recomendação: tecla cobalto nos três (Publicações, Movimentações e
   Audiências), que chama atenção sem parecer erro.
5. **Tema padrão.** Novos usuários começam no escuro (`providers.tsx:14`).
   Recomendação: manter.
