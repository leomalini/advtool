interface ModelPrice {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/**
 * Preço por milhão de tokens, em US$, da tabela da Anthropic (conferida em
 * 2026-10). Só os modelos que o AdvTool usa e os destinos do fallback de
 * recusa (`fallbacks: 'default'` no Opus 5.5 leva ao Opus 5 ou ao 4.8).
 *
 * Escrita no cache custa 1,25 × a entrada — o TTL padrão de 5 minutos, o único
 * que pedimos. Modelo fora da tabela fica SEM custo (`null`), nunca com um
 * palpite: o Gemini, por exemplo, não está aqui.
 */
const PRICES_USD_PER_MTOK: Readonly<Record<string, ModelPrice>> = {
  // Leitura de cache a 0,05 × a entrada — metade da proporção dos outros.
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
}

export interface TokenCounts {
  /** Entrada sem cache — a parte cobrada pelo preço cheio. */
  input: number
  cacheRead: number
  cacheWrite: number
  /** Saída total, raciocínio incluído. */
  output: number
}

/** A Batch API cobra metade de tudo (entrada, saída e cache), fase 5. */
const BATCH_DISCOUNT = 0.5

/** Custo estimado de uma chamada, em US$ com 6 casas — ou `null` sem preço. */
export function estimateCostUsd(
  model: string,
  tokens: TokenCounts,
  options: { batch?: boolean } = {},
): number | null {
  const price = PRICES_USD_PER_MTOK[model]
  if (!price) return null

  const microDollars =
    tokens.input * price.input +
    tokens.cacheRead * price.cacheRead +
    tokens.cacheWrite * price.cacheWrite +
    tokens.output * price.output

  const factor = options.batch ? BATCH_DISCOUNT : 1
  return Number(((microDollars * factor) / 1_000_000).toFixed(6))
}
