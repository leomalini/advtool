# Design System — AdvTool

> Documento de referência para decisões visuais do produto.
> Criado: 2026-07-21 | Status: Ativo

---

## Visão geral

O AdvTool é uma plataforma interna de gestão jurídica. A identidade visual segue a direção **"Cool Slate + Blue"**: moderna, limpa e profissional — credibilidade institucional sem parecer antiquada.

**Princípio central:** coerência de temperatura de cor e luminosidade. Sidebar branca e conteúdo cinza-azul claro pertencem ao mesmo nível de luminosidade — sem corte escuro/claro entre eles.

O **azul profissional** (hue 252) é o único accent — aparece na sidebar (item ativo), botões primários, focus rings e estados interativos.

---

## Tipografia

### Fonte: Plus Jakarta Sans

Uma única família para toda a interface. Hierarquia feita via **peso**, não via famílias diferentes.

| Peso | Uso |
|---|---|
| 400 (Regular) | Corpo de texto, descrições |
| 500 (Medium) | Labels, rótulos de campo |
| 600 (SemiBold) | Títulos de seção, nomes de itens em listas |
| 700 (Bold) | Valores métricos (números grandes), headings de página |

### Regras de tipografia

- **Nunca** usar fonte serif na UI (ilegível em tamanhos pequenos)
- **Nunca** misturar famílias tipográficas no mesmo contexto
- Hierarquia via tamanho + peso: `text-2xl font-bold` para métricas, `text-sm font-medium` para labels
- `tracking-tight` em headings grandes, `tracking-normal` no resto

---

## Paleta de Cores

### Conceito: Cool Slate + Blue

Base cinza-azul fria (hue 240) + accent azul profissional (hue 252). Paleta monocromática adjacente — sofisticada, coesa, credível.

### Light Mode (padrão)

| Variável | OKLCH | Descrição |
|---|---|---|
| `--background` | `oklch(0.965 0.006 240)` | Cinza-azul muito sutil — fundo da página |
| `--foreground` | `oklch(0.148 0.012 240)` | Quase-preto frio |
| `--card` | `oklch(1 0 0)` | Branco puro — cards sobre o gray-blue |
| `--primary` | `oklch(0.420 0.130 252)` | Azul profissional — ações primárias |
| `--muted` | `oklch(0.930 0.008 240)` | Cinza frio — fundos sutis |
| `--muted-foreground` | `oklch(0.515 0.012 240)` | Texto secundário frio |
| `--accent` | `oklch(0.930 0.015 252)` | Azul muito claro — hover em conteúdo |
| `--border` | `oklch(0.888 0.008 240)` | Borda cinza-azul clara |

### Sidebar (white panel)

A sidebar é **branca** (`oklch(1 0 0)`) enquanto o conteúdo é **cinza-azul** (`oklch(0.965 0.006 240)`). Mesma luminosidade, diferença apenas pelo delta de tonalidade + borda. Nenhum contraste escuro/claro entre eles.

| Variável | OKLCH | Descrição |
|---|---|---|
| `--sidebar` | `oklch(1 0 0)` | Branco — sidebar e conteúdo no mesmo nível de claridade |
| `--sidebar-foreground` | `oklch(0.148 0.012 240)` | Mesmo texto escuro do restante do app |
| `--sidebar-primary` | `oklch(0.420 0.130 252)` | Azul — item ativo (ícone + texto) |
| `--sidebar-primary-foreground` | `oklch(0.980 0 0)` | Branco — texto sobre fundo azul |
| `--sidebar-accent` | `oklch(0.930 0.015 252)` | Azul muito claro — hover e bg de item ativo |
| `--sidebar-accent-foreground` | `oklch(0.300 0.120 252)` | Azul escuro — texto sobre accent |
| `--sidebar-border` | `oklch(0.888 0.008 240)` | Mesma borda cinza do sistema |

### Cores semânticas (hardcoded, não alterar)

Cores de feedback e categoria (azul, verde, âmbar, vermelho) são **hardcoded em Tailwind** nos componentes que as usam. Não fazem parte dos tokens do sistema.

| Uso | Classe Tailwind | Exemplo |
|---|---|---|
| Processos ativos | `text-blue-600 / bg-blue-100` | MetricCard |
| Negociações | `text-violet-600 / bg-violet-100` | MetricCard |
| Tarefas | `text-amber-600 / bg-amber-100` | MetricCard |
| Clientes | `text-emerald-600 / bg-emerald-100` | MetricCard |
| Prazo fatal | `text-red-700 / bg-red-100` | PrazosCard |
| Badge pendências | `bg-amber-500` | Sidebar badge |

---

## Componentes de Layout

### Sidebar
- Largura expandida: `w-56` (224px)
- Largura colapsada: `w-14` (56px)
- Fundo: `bg-sidebar` (branco)
- Item ativo: `bg-sidebar-accent text-sidebar-accent-foreground font-semibold`
- Item hover: `bg-sidebar-accent/60 text-sidebar-foreground`
- Item inativo: `text-sidebar-foreground/60`
- Badge de notificação: `bg-amber-500` (hardcoded)

### Header
- Altura: `h-14` (alinhado com logo da sidebar)
- Fundo: `bg-card` (branco) — cria separação visual do fundo cinza-azul
- Título: `text-xl font-bold` em Plus Jakarta Sans

### Main content
- Fundo: `bg-background` (cinza-azul frio)
- Padding: `p-6`

### Cards
- Fundo: `bg-card` (branco) sobre `bg-background` (cinza-azul)
- Border: `border border-border` + `shadow-sm`
- Radius: `rounded-lg` (0.5rem)

---

## Decisões Registradas

| Data | Decisão | Motivo |
|---|---|---|
| 2026-07-21 | Fonte única (Plus Jakarta Sans) em vez de display + UI | Fonte serif (Cormorant) ilegível em tamanhos pequenos da UI |
| 2026-07-21 | Paleta cool-only (hue 240-252) | Tom quente (bege/creme, hue 82) parece papel físico, não software profissional |
| 2026-07-21 | Sidebar branca, não escura | Sidebar escura + conteúdo claro = corte visual abrupto |
| 2026-07-21 | Accent azul (hue 252) em vez de sage (hue 152) | Verde remete a saúde/sustentabilidade; azul transmite credibilidade institucional para advocacia |
| 2026-07-21 | Nome "AdvTool" mantido | "Léxis" rejeitado pelo usuário |
