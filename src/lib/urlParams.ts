import { format, isValid, parseISO } from 'date-fns'

/**
 * Leitura dos filtros que as listagens guardam na URL (docs/paginacao.md).
 * A URL é entrada externa — um link antigo, editado à mão, colado de outro
 * lugar — então todo valor é validado, e o inválido vira "sem filtro", nunca
 * um erro na tela.
 */

/** `URLSearchParams`, ou o somente-leitura do Next. */
export interface ParamReader {
  get(name: string): string | null
}

/** 'yyyy-MM-dd' que é um dia de verdade: '2026-02-30' não volta igual. */
export function parseIsoDay(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = parseISO(value)
  return isValid(date) && format(date, 'yyyy-MM-dd') === value ? value : null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseUuid(value: string | null): string | null {
  return value && UUID_PATTERN.test(value) ? value : null
}

/** O valor, se ele for uma das opções; senão `null`. */
export function parseOneOf<T extends string>(value: string | null, options: readonly T[]): T | null {
  return value !== null && (options as readonly string[]).includes(value) ? (value as T) : null
}
