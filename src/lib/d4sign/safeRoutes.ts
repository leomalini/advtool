// Sem nada de servidor: a tela sugere o mapa, e o envio (fase 2) resolve o
// cofre pelo mesmo módulo.
import {
  D4SIGN_SAFE_ROUTES,
  type D4SignSafe,
  type D4SignSafeMap,
  type D4SignSafeRoute,
} from '@/types/d4sign.types'
import type { ContractKind } from '@/types/contract.types'

/** Nomes que indicam o cofre de cada tipo, do mais ao menos específico. */
const KEYWORDS: Record<D4SignSafeRoute, string[]> = {
  contrato_honorarios: ['contratos de honorarios', 'honorarios'],
  contrato_cliente_terceiros: ['contratos diversos', 'diversos'],
  contrato_escritorio: ['contratos diversos', 'diversos'],
  documento_procuracao: ['procuracoes', 'procuracao'],
  documento_peticao: ['peticoes', 'peticao'],
  documento_contrato: ['contratos diversos', 'diversos'],
  documento_outros: ['outros documentos', 'outros'],
  padrao: ['outros documentos', 'outros'],
}

/** Sem acento e em minúsculas: "Procurações" ≈ "procuracoes". */
function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * O cofre cujo nome indica o tipo. Nome igual vence "começa com", que vence
 * "contém": "Procurações" ganha de "Outras procurações".
 */
function suggestSafe(route: D4SignSafeRoute, safes: D4SignSafe[]): D4SignSafe | null {
  const named = safes.map((safe) => ({ safe, name: normalize(safe.name) }))
  const tests: ((name: string, keyword: string) => boolean)[] = [
    (name, keyword) => name === keyword,
    (name, keyword) => name.startsWith(keyword),
    (name, keyword) => name.includes(keyword),
  ]
  for (const test of tests) {
    for (const keyword of KEYWORDS[route]) {
      const found = named.find(({ name }) => test(name, keyword))
      if (found) return found.safe
    }
  }
  return null
}

export interface SuggestedSafeMap {
  map: D4SignSafeMap
  /** Tipos preenchidos agora pelo nome do cofre — a tela os marca para conferir. */
  suggested: D4SignSafeRoute[]
}

/**
 * O mapa para editar: o que já estava salvo e ainda existe na conta, e uma
 * sugestão pelo nome para os tipos sem cofre. Cofre salvo que sumiu da conta
 * sai do mapa (e o tipo ganha sugestão), com o nome atualizado nos demais.
 */
export function suggestSafeMap(safes: D4SignSafe[], current: D4SignSafeMap): SuggestedSafeMap {
  const byUuid = new Map(safes.map((safe) => [safe.uuid, safe]))
  const map: D4SignSafeMap = {}
  const suggested: D4SignSafeRoute[] = []

  for (const route of D4SIGN_SAFE_ROUTES) {
    const saved = current[route] ? byUuid.get(current[route].uuid) : undefined
    if (saved) {
      map[route] = saved
      continue
    }
    const suggestion = suggestSafe(route, safes)
    if (suggestion) {
      map[route] = suggestion
      suggested.push(route)
    }
  }
  return { map, suggested }
}

/** O cofre de um tipo: o próprio, ou o padrão. Null sem nenhum dos dois. */
export function resolveSafe(map: D4SignSafeMap, route: D4SignSafeRoute): D4SignSafe | null {
  return map[route] ?? map.padrao ?? null
}

export function safeRouteForContract(kind: ContractKind): D4SignSafeRoute {
  return `contrato_${kind}`
}

/** A categoria de `documents` → o tipo do envio. Decisão, comprovante e afins
 * não têm cofre próprio. */
export function safeRouteForDocument(category: string): D4SignSafeRoute {
  const route = `documento_${category}`
  return (D4SIGN_SAFE_ROUTES as readonly string[]).includes(route)
    ? (route as D4SignSafeRoute)
    : 'padrao'
}
