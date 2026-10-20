import { format, subDays } from 'date-fns'
import type { MovementCategory } from '@/types/legalProcess.types'

/** Janela com que a tela abre. Movimentação é volume: sem recorte de período
 * a primeira consulta varreria a tabela inteira. */
export const DEFAULT_PERIOD_DAYS = 30

export interface MovementFilters {
  search: string
  /** Vazio = todas. Multi-seleção por chip. */
  categories: MovementCategory[]
  court: string | null
  /** 'yyyy-MM-dd', inclusive. Nunca nulos: o período é sempre limitado — é o
   * que mantém a consulta barata e o índice utilizável. */
  from: string
  to: string
  /** A fila de trabalho: só o que o texto manda alguém fazer. */
  requiresAction: boolean
  onlyUnhandled: boolean
}

export function isoDaysAgo(days: number): string {
  return format(subDays(new Date(), days), 'yyyy-MM-dd')
}

export function isoToday(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * O estado inicial: últimos 30 dias, não tratadas.
 *
 * ⚠️ `requiresAction` NÃO entra ligado, embora a fila de trabalho fosse o
 * desenho original. Medido na base real (migration 73): das 171 movimentações,
 * 4 pedem providência — porque nenhuma delas contém "intime-se",
 * "manifeste-se" ou "no prazo de". A mediana de `description` tem 30
 * caracteres: são RÓTULOS da TPU, não o texto do ato, que vive em
 * `publications`. Abrir filtrado assim entregaria 4 linhas de 171 e a tela
 * pareceria quebrada. O chip continua ali como recorte opcional.
 *
 * É função e não constante porque depende de hoje — uma constante de módulo
 * congelaria a janela no instante em que o bundle carregou, e numa aba aberta
 * de um dia para o outro a tela mostraria "últimos 30 dias" de ontem.
 */
export function defaultMovementFilters(): MovementFilters {
  return {
    search: '',
    categories: [],
    court: null,
    from: isoDaysAgo(DEFAULT_PERIOD_DAYS - 1),
    to: isoToday(),
    requiresAction: false,
    onlyUnhandled: true,
  }
}

/** Ativo = diferente do padrão. Contar `onlyUnhandled` como filtro ativo só
 * porque ele está ligado faria "Limpar (1)" aparecer na tela recém-aberta,
 * oferecendo remover algo que o próprio "Limpar" repõe. */
export function countActiveMovementFilters(f: MovementFilters): number {
  const base = defaultMovementFilters()
  let n = 0
  if (f.search.trim() !== '') n++
  if (f.categories.length > 0) n++
  if (f.court !== null) n++
  if (f.from !== base.from || f.to !== base.to) n++
  if (f.requiresAction !== base.requiresAction) n++
  if (f.onlyUnhandled !== base.onlyUnhandled) n++
  return n
}

export function hasActiveMovementFilters(f: MovementFilters): boolean {
  return countActiveMovementFilters(f) > 0
}

/** Desliga só o recorte da fila, preservando período, busca e categorias — é
 * o que o empty state oferece quando a classificação não achou nada que peça
 * providência no período. */
export function withoutQueueFilters(f: MovementFilters): MovementFilters {
  return { ...f, requiresAction: false, onlyUnhandled: false }
}

export function toggleCategory(
  f: MovementFilters,
  category: MovementCategory,
): MovementFilters {
  const categories = f.categories.includes(category)
    ? f.categories.filter((c) => c !== category)
    : [...f.categories, category]
  return { ...f, categories }
}
