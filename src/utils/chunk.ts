/**
 * Divide uma lista em lotes de `size`.
 *
 * Existe por causa dos filtros `in.(…)` do PostgREST: vão na URL, e centenas de
 * uuids (uma série recorrente inteira) passam do limite do gateway.
 */
export function chunk<T>(list: readonly T[], size = 100): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}
