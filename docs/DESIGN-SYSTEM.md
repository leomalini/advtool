# Design System — AdvTool

> Documento de referência para decisões visuais do produto.
> Sistema atual: **Prisma + Relevo** (2026-11-17). Plano e motivo de cada valor em
> [`docs/redesign-visual.md`](redesign-visual.md).
>
> A fonte da verdade dos tokens é [`src/app/globals.css`](../src/app/globals.css).
> Este documento explica como usá-los; se os dois divergirem, vale o CSS.

## Visão geral

Cor viva onde há ação e superfícies claras no resto, com toque físico:

- **Tudo que se clica vira tecla**: sobe do fundo e desce ao ser pressionado.
- **Tudo que recebe texto ou escolha vira trilho**: um canal rebaixado na superfície.
- **O resto é superfície**: cards e sidebar, leves, com sombra em camadas.

Não há gradientes. Os dois temas, claro e escuro, têm o mesmo peso de cor: o claro
não é branco puro e o escuro não é preto.

## Três planos

| Plano | O que fica nele | Como se faz |
|---|---|---|
| Trilho rebaixado | campos, busca, selects, lista de abas, checkbox desmarcado, interruptor, medidores | `bg-muted well` |
| Superfície | cards, sidebar, diálogos, popovers | `bg-card card-shadow`, `bg-popover`, `bg-sidebar` |
| Tecla levantada | botões, item ativo do menu, aba ativa, contadores, paginação | `key` (+ `key-primary` ou `key-sm`) |

Regra: só o que é clicável vira tecla. Texto estático com borda de tecla convida a um
clique que não faz nada.

## Tipografia

- **Plus Jakarta Sans** (`--font-sans`): a interface toda.
- **Geist Mono** (`--font-mono`): número de processo (CNJ), horários, valores alinhados
  e teclas de atalho.
- Títulos de página e números de indicador em `font-extrabold` / `font-bold` com
  `tracking-tight`.

As duas fontes são carregadas em `src/app/layout.tsx` com `next/font/google`.

## Paleta

Valores completos nas tabelas de `docs/redesign-visual.md`. Os papéis:

| Papel | Claro | Escuro |
|---|---|---|
| Fundo da página (`--background`) | `#e2e8f7` azul claro | `#0a0f1f` azul-noite |
| Card (`--card`) | `#ffffff` | `#111834` |
| Popover (`--popover`) | `#ffffff` | `#151d3b` |
| Marca (`--primary`) | `#2f54eb` cobalto, texto branco | `#6b84ff` cobalto claro, texto azul-noite |
| Trilho (`--muted`) | `#e2e7f1` | `#080c1a` |
| Sidebar (`--sidebar`) | `#111b45` azul-noite | `#111834`, a cor dos cards |

No escuro, a marca é `#6b84ff` com texto escuro, e não o `#4563fa` com texto branco da
prévia: o app usa `text-primary` como cor de texto em dezenas de lugares, e só o tom
mais claro passa de 4,5:1 nos dois papéis (texto e fundo de botão).

### Cores de estado

`--success`, `--warning`, `--destructive` e `--info`, cada uma com o `-foreground` para
texto sobre ela. Dizem **como** algo está (atrasado, pago, em dia); não se usam como
cor de assunto nem de marca.

### Exceções

Cores escolhidas pelo usuário (tipos de evento da Agenda, etapas do CRM, etiquetas) e
as áreas jurídicas (`--chart-2` a `--chart-5`) ficam como estão. O texto sobre elas
continua `text-white`.

## Relevo

### Tokens

| Token | Para quê |
|---|---|
| `--edge` | altura da tecla (2 px); é quanto ela desce ao ser pressionada |
| `--key`, `--key-hl`, `--key-edge`, `--key-drop` | face, luz da borda de cima, base e sombra da tecla neutra |
| `--primary-edge`, `--primary-glow` | base e brilho da tecla cobalto |
| `--well-shadow`, `--well-edge` | sombra interna e contorno do trilho |
| `--control-edge` | contorno de checkbox e interruptor (3:1 sobre card e fundo) |
| `--groove-dark`, `--groove-light` | divisória gravada das tabelas |
| `--card-edge`, `--card-drop` | contorno e sombra dos cards |
| `--overlay` | fundo atrás de diálogos e gavetas |

### Utilitárias

Definidas com `@utility` no `globals.css`. As sombras entram pelas variáveis do
Tailwind (`--tw-shadow`, `--tw-inset-shadow`…), então o anel de foco (`ring-*`) soma
com a tecla em vez de apagá-la.

| Classe | Efeito |
|---|---|
| `key` | tecla levantada; com `:active`, desce `--edge` e perde a base |
| `key-primary` | junto com `key`: base escura e brilho cobalto |
| `key-sm` | junto com `key`: tecla baixa (aba ativa, item de menu, contador) |
| `well` | trilho rebaixado; o fundo vem de `bg-muted` no próprio elemento |
| `card-shadow` | luz na borda de cima, contorno suave e sombra em camadas |
| `groove` | divisória gravada |

Para trocar o contorno de um trilho sem depender da ordem das classes, redefina
`--well-ring` (é o que a checkbox e o interruptor fazem com `--control-edge`). Para uma
tecla de outra cor, redefina `--key-face-edge` e `--key-face-hl`.

## Componentes (`src/components/ui/`)

| Componente | Desenho |
|---|---|
| `Button` | `default` tecla cobalto; `outline` e `secondary` tecla neutra; `destructive` tecla vermelha; `ghost` e `link` sem relevo |
| `Input`, `Textarea`, `Select`, `InputGroup` | trilho; foco com anel cobalto; inválido com anel vermelho |
| `Tabs` | lista em trilho, aba ativa em tecla (variante `line` sem relevo) |
| `Checkbox`, `Switch` | trilho com `--control-edge`; marcado vira cobalto |
| `Badge` | pílula de fundo suave na cor do estado |
| `Card` | `rounded-2xl` com `card-shadow` |
| `Table` | cabeçalho em faixa azul clara, linhas com divisória gravada |
| `Dialog`, `AlertDialog`, `Sheet`, `Drawer` | `bg-popover`, overlay `bg-overlay` |
| `Toaster` (sonner) | aviso invertido: escuro no tema claro, claro no escuro |

## Layout

### Shell — `src/app/(app)/layout.tsx`
- `p-3 gap-3` sobre `bg-background`: a sidebar flutua como um cartão.
- O `main` mantém `p-6` e ganha `rounded-3xl`. As telas de tela cheia (Processos,
  Movimentações, Publicações, CRM, fichas de detalhe…) se esticam até a borda com `-m-6`
  e aparecem como um painel de cantos arredondados.

### Sidebar — `src/components/layout/Sidebar.tsx`
- Largura `w-56` aberta e `w-14` recolhida; `rounded-3xl` e `bg-sidebar`.
- As classes ficam em constantes no topo do arquivo (`SIDEBAR_FRAME`, `ACTIVE_ITEM`,
  `INACTIVE_ITEM`, `COUNTER`, `USER_WELL`).
- Item ativo: tecla baixa em `--sidebar-accent`, ícone em `--sidebar-ring`.
- Item inativo: `text-sidebar-muted-foreground`.
- Contadores de prazo correndo: tecla cobalto (`--sidebar-primary`) com número em fonte
  mono.
- Usuário: trilho na cor da sidebar (`--sidebar-well`).

### Header — `src/components/layout/Header.tsx`
- Sem barra: fica sobre o fundo da página, `h-14 px-6`.
- Busca em trilho com a tecla `⌘K`; tema, avisos e Assistente em teclas redondas.

### Dashboard
- Indicadores (`StatTile`) com fundo tingido na cor do assunto e ícone sólido
  (`TONE_TINT_CLASSES`, `TONE_SOLID_CHIP_CLASSES`).
- Demais cards (`DashboardCard`) na superfície padrão, com o ícone em chip suave
  (`TONE_CHIP_CLASSES`).

### Listagens: sempre paginadas
Toda tela que mostra uma lista tem paginação (detalhes em `docs/paginacao.md`).
- Rodapé: `Pagination` (`src/components/shared/Pagination.tsx`) — "51–100 de 213 processos", seletor 25 / 50 / 100 e `‹ 1 … 4 5 6 … 12 ›`
- Estado: `useListPagination` (página e tamanho; o tamanho fica lembrado por tela) + `useSearchParamsMirror` (página, tamanho, filtros e ordem na URL, nunca a busca por texto)
- Lista grande ou que cresce sozinha: paginar no servidor (`.range()` + `count: 'exact'`, com desempate total na ordem). Lista cujos totais e cartões somam tudo: carregar inteira e fatiar com `slicePage`
- Fora da regra: kanban, calendário e listas agrupadas por dia

---

## Decisões Registradas

| Data | Decisão | Motivo |
|---|---|---|
| 2026-07-21 | Nome "AdvTool" mantido | "Léxis" rejeitado pelo usuário |
| 2026-11-17 | Prisma + Relevo substitui o Graphite | Cliente achou a tela "muito branca"; o Graphite era só branco ou preto |
| 2026-11-17 | Sem gradientes | Rejeitados como enfeite pouco profissional |
| 2026-11-17 | Sidebar azul-noite no claro e na cor dos cards no escuro | Escolha do usuário na prévia; a sidebar colorida tira o branco da tela |
| 2026-11-17 | Marca `#6b84ff` com texto escuro no tema escuro | `text-primary` é usado como texto em dezenas de lugares; só esse tom passa 4,5:1 nos dois papéis |
| 2026-11-17 | `main` com `p-6` e `rounded-3xl` | 12 telas de tela cheia dependem do `-m-6`; o canto arredondado vira painel nelas |

Histórico: "Cool Slate + Blue" (2026-07, Plus Jakarta Sans) → "Graphite" (Hanken
Grotesk, quase-preto e branco) → "Prisma + Relevo" (2026-11-17).
