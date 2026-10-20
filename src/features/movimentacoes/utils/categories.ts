import {
  Archive,
  CalendarClock,
  CircleDashed,
  FileStack,
  FileText,
  Gavel,
  Hourglass,
  Megaphone,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import type { MovementCategory } from '@/types/legalProcess.types'

/**
 * Apresentação das categorias de movimentação. O vocabulário em si vive em
 * `src/types/legalProcess.types.ts` (espelhando o CHECK da migration 72) —
 * aqui ficam rótulo, ícone e cor.
 *
 * ── Por que o gráfico empilha 4 grupos e não as 9 categorias ───────────────
 *
 * `docs/dashboard-visual.md` registra que a paleta foi validada para
 * daltonismo, e que verde x vermelho só passa por posição fixa + legenda +
 * tooltip. Nove faixas categóricas numa coluna empilhada quebrariam isso: não
 * existem nove cores distinguíveis em deuteranopia dentro desta paleta, e
 * empilhá-las produziria faixas de 2px indistinguíveis mesmo com visão
 * tricromática.
 *
 * Os CHIPS de filtro continuam oferecendo as 9 — a perda de resolução é só do
 * desenho, não do dado.
 */

export type MovementGroup = 'decisoes' | 'prazos' | 'partes' | 'expediente'

interface MovementCategoryMeta {
  label: string
  icon: LucideIcon
  group: MovementGroup
}

export const MOVEMENT_CATEGORIES: Record<MovementCategory, MovementCategoryMeta> = {
  decisao: { label: 'Decisão', icon: Gavel, group: 'decisoes' },
  audiencia: { label: 'Audiência', icon: CalendarClock, group: 'decisoes' },
  intimacao: { label: 'Intimação', icon: Megaphone, group: 'prazos' },
  prazo: { label: 'Prazo', icon: Hourglass, group: 'prazos' },
  peticao: { label: 'Petição', icon: FileText, group: 'partes' },
  recurso: { label: 'Recurso', icon: Undo2, group: 'partes' },
  expediente: { label: 'Expediente', icon: FileStack, group: 'expediente' },
  encerramento: { label: 'Encerramento', icon: Archive, group: 'expediente' },
  outros: { label: 'Outros', icon: CircleDashed, group: 'expediente' },
}

/** Ordem de exibição dos chips: do ato que mais pede atenção ao que menos. */
export const MOVEMENT_CATEGORY_ORDER: readonly MovementCategory[] = [
  'decisao',
  'audiencia',
  'intimacao',
  'prazo',
  'peticao',
  'recurso',
  'expediente',
  'encerramento',
  'outros',
]

interface MovementGroupMeta {
  label: string
  /** Token de `globals.css`, usado como `var(--…)` no recharts. */
  colorVar: string
  categories: readonly MovementCategory[]
}

/** Ordem do empilhamento, de baixo para cima na coluna. */
export const MOVEMENT_GROUP_ORDER: readonly MovementGroup[] = [
  'decisoes',
  'prazos',
  'partes',
  'expediente',
]

export const MOVEMENT_GROUPS: Record<MovementGroup, MovementGroupMeta> = {
  decisoes: {
    label: 'Decisões e audiências',
    colorVar: '--chart-1',
    categories: ['decisao', 'audiencia'],
  },
  prazos: {
    label: 'Intimações e prazos',
    colorVar: '--chart-4',
    categories: ['intimacao', 'prazo'],
  },
  partes: {
    label: 'Petições e recursos',
    colorVar: '--chart-5',
    categories: ['peticao', 'recurso'],
  },
  expediente: {
    label: 'Expediente',
    colorVar: '--muted-foreground',
    categories: ['expediente', 'encerramento', 'outros'],
  },
}

/**
 * Metadados de uma categoria, tolerando valor desconhecido.
 *
 * O CHECK do banco e a union do TS podem divergir por uma migration aplicada
 * sem deploy do front. Cair em 'Outros' é melhor do que estourar um
 * `undefined.label` na linha da lista.
 */
export function categoryMeta(category: string): MovementCategoryMeta {
  return MOVEMENT_CATEGORIES[category as MovementCategory] ?? MOVEMENT_CATEGORIES.outros
}

export function groupOf(category: string): MovementGroup {
  return categoryMeta(category).group
}
