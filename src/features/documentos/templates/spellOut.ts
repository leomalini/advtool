/**
 * Números, valores e datas por extenso, em português do Brasil — o
 * "R$ 5.000,00 (cinco mil reais)" dos contratos.
 *
 * Regra do "e" entre as classes (mil, milhão…): só antes da última classe
 * falada, e só quando ela é menor que cem ou uma centena redonda —
 * "mil e quinhentos", "mil quinhentos e vinte", "um milhão e duzentos mil",
 * "um milhão duzentos e cinquenta mil".
 */

const UNITS = [
  'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete',
  'dezoito', 'dezenove',
]
const TENS = [
  '', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa',
]
const HUNDREDS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
  'setecentos', 'oitocentos', 'novecentos',
]
/** [singular, plural] a partir da classe dos milhões. */
const SCALES: ReadonlyArray<readonly [string, string]> = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
  ['trilhão', 'trilhões'],
]

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function belowThousand(value: number): string {
  if (value === 100) return 'cem'
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  const parts: string[] = []
  if (hundreds) parts.push(HUNDREDS[hundreds])
  if (rest) {
    if (rest < 20) parts.push(UNITS[rest])
    else {
      const tens = TENS[Math.floor(rest / 10)]
      const unit = rest % 10
      parts.push(unit ? `${tens} e ${UNITS[unit]}` : tens)
    }
  }
  return parts.join(' e ')
}

/** Inteiro não negativo por extenso. */
export function integerToWords(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Número fora do intervalo para extenso: ${value}`)
  }
  if (value === 0) return UNITS[0]

  const groups: number[] = []
  for (let rest = value; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000)
  if (groups.length > SCALES.length) {
    throw new RangeError(`Número grande demais para extenso: ${value}`)
  }

  const spoken: Array<{ value: number; text: string }> = []
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index]
    if (group === 0) continue
    let text: string
    if (index === 0) text = belowThousand(group)
    else if (index === 1) text = group === 1 ? 'mil' : `${belowThousand(group)} mil`
    else text = `${belowThousand(group)} ${SCALES[index][group === 1 ? 0 : 1]}`
    spoken.push({ value: group, text })
  }

  return spoken.reduce((result, part, position) => {
    if (position === 0) return part.text
    const last = position === spoken.length - 1
    const joinWithE = last && (part.value < 100 || part.value % 100 === 0)
    return `${result}${joinWithE ? ' e ' : ' '}${part.text}`
  }, '')
}

/** Parte decimal dígito a dígito quando começa com zero ("vírgula zero cinco");
 * senão, como número ("vírgula vinte e cinco"). */
function decimalsToWords(digits: string): string {
  const leadingZeros = digits.match(/^0+/)?.[0].length ?? 0
  const words = Array<string>(leadingZeros).fill(UNITS[0])
  const rest = digits.slice(leadingZeros)
  if (rest) words.push(integerToWords(Number(rest)))
  return words.join(' ')
}

/** Separa inteiro e decimais sem ruído de ponto flutuante (0,1 + 0,2). */
function splitDecimal(value: number): { integer: number; decimals: string } {
  const [integer, decimals = ''] = Math.abs(value).toFixed(6).split('.')
  return { integer: Number(integer), decimals: decimals.replace(/0+$/, '') }
}

/** 12 → "doze"; 12,5 → "doze vírgula cinco". */
export function numberToWords(value: number): string {
  const { integer, decimals } = splitDecimal(value)
  const words = integerToWords(integer)
  const signed = value < 0 ? `menos ${words}` : words
  return decimals ? `${signed} vírgula ${decimalsToWords(decimals)}` : signed
}

/** 30 → "trinta por cento". */
export function percentToWords(value: number): string {
  return `${numberToWords(value)} por cento`
}

/**
 * Valor em reais por extenso. "um milhão de reais" leva o "de" porque a
 * classe termina em milhão; "um milhão e quinhentos mil reais", não.
 */
export function currencyToWords(value: number): string {
  const cents = Math.round(Math.abs(value) * 100)
  const reais = Math.floor(cents / 100)
  const centavos = cents % 100

  const parts: string[] = []
  if (reais > 0) {
    const endsInScale = reais >= 1_000_000 && reais % 1_000_000 === 0
    const unit = `${endsInScale ? 'de ' : ''}${reais === 1 ? 'real' : 'reais'}`
    parts.push(`${integerToWords(reais)} ${unit}`)
  }
  if (centavos > 0) {
    parts.push(`${integerToWords(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`)
  }
  if (parts.length === 0) return 'zero reais'

  const words = parts.join(' e ')
  return value < 0 ? `menos ${words}` : words
}

function isoDateParts(isoDate: string): { year: number; month: number; day: number } | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

/** 'yyyy-MM-dd' → "24 de setembro de 2026" ("1º de maio", como se escreve em
 * documento). Sem passar por `Date`, que aplicaria fuso. */
export function formatLongDate(isoDate: string): string | null {
  const parts = isoDateParts(isoDate)
  if (!parts) return null
  const day = parts.day === 1 ? '1º' : String(parts.day)
  return `${day} de ${MONTHS[parts.month - 1]} de ${parts.year}`
}

/** 'yyyy-MM-dd' → 'dd/MM/yyyy'. */
export function formatShortDate(isoDate: string): string | null {
  const parts = isoDateParts(isoDate)
  if (!parts) return null
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`
}

/** Hoje, em 'yyyy-MM-dd', no fuso do escritório — o servidor roda em UTC. */
export function officeTodayIso(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Número escrito por gente ou pela IA: "5000", "5.000,00", "R$ 5.000,00",
 * "12,5", "30%". Ponto seguido de exatamente três dígitos é milhar (é assim
 * que se escreve no Brasil); vírgula é sempre decimal.
 */
export function parseLooseNumber(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, '')
  if (!/\d/.test(cleaned)) return null

  let normalized: string
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '')
  } else {
    normalized = cleaned
  }

  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/** Data escrita como 'yyyy-MM-dd' ou 'dd/MM/yyyy' → 'yyyy-MM-dd'. */
export function parseLooseDate(input: string): string | null {
  const trimmed = input.trim()
  if (isoDateParts(trimmed)) return trimmed.slice(0, 10)
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  return isoDateParts(iso) ? iso : null
}
